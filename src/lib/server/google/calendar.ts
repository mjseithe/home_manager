import { google, type calendar_v3 } from 'googleapis';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts, type CalendarAccount } from '$lib/server/db/schema';
import { toLocalDateParam } from '$lib/calendar-layout';
import { createOAuthClient } from './oauth';

function getClientForAccount(account: CalendarAccount) {
	const client = createOAuthClient();
	client.setCredentials({
		access_token: account.accessToken,
		refresh_token: account.refreshToken,
		expiry_date: account.tokenExpiry?.getTime()
	});

	// googleapis refreshes the access token transparently when it's expired;
	// persist the new one so we don't have to re-auth every hour.
	client.on('tokens', (tokens) => {
		void db
			.update(calendarAccounts)
			.set({
				accessToken: tokens.access_token ?? account.accessToken,
				...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
				tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : account.tokenExpiry
			})
			.where(eq(calendarAccounts.id, account.id));
	});

	return client;
}

export async function listGoogleCalendars(account: CalendarAccount) {
	const client = getClientForAccount(account);
	const cal = google.calendar({ version: 'v3', auth: client });
	const { data } = await cal.calendarList.list();
	return data.items ?? [];
}

export interface GoogleEventInput {
	title: string;
	description: string | null;
	location: string | null;
	startAt: Date;
	endAt: Date;
	allDay: boolean;
}

// Google's all-day date is local-calendar-day text with an *exclusive* end
// (the day after the last actual day) — the same convention already used by
// sync.ts/calendar-layout.ts when reading events back, so an app-created
// all-day event round-trips through Google without drifting a day.
function toGoogleEventBody(input: GoogleEventInput): calendar_v3.Schema$Event {
	return {
		summary: input.title,
		description: input.description ?? undefined,
		location: input.location ?? undefined,
		start: input.allDay
			? { date: toLocalDateParam(input.startAt) }
			: { dateTime: input.startAt.toISOString() },
		end: input.allDay
			? { date: toLocalDateParam(input.endAt) }
			: { dateTime: input.endAt.toISOString() }
	};
}

export async function insertGoogleEvent(
	account: CalendarAccount,
	googleCalendarId: string,
	input: GoogleEventInput
) {
	const client = getClientForAccount(account);
	const cal = google.calendar({ version: 'v3', auth: client });
	const { data } = await cal.events.insert({
		calendarId: googleCalendarId,
		requestBody: toGoogleEventBody(input)
	});
	return data;
}

export async function updateGoogleEvent(
	account: CalendarAccount,
	googleCalendarId: string,
	googleEventId: string,
	input: GoogleEventInput
) {
	const client = getClientForAccount(account);
	const cal = google.calendar({ version: 'v3', auth: client });
	const { data } = await cal.events.update({
		calendarId: googleCalendarId,
		eventId: googleEventId,
		requestBody: toGoogleEventBody(input)
	});
	return data;
}

export async function deleteGoogleEvent(
	account: CalendarAccount,
	googleCalendarId: string,
	googleEventId: string
) {
	const client = getClientForAccount(account);
	const cal = google.calendar({ version: 'v3', auth: client });
	try {
		await cal.events.delete({ calendarId: googleCalendarId, eventId: googleEventId });
	} catch (err) {
		// 404/410 means it's already gone on Google's side (e.g. deleted there
		// directly) — that's the desired end state, not a failure.
		const status = (err as { code?: number; status?: number })?.code ?? undefined;
		if (status !== 404 && status !== 410) throw err;
	}
}

export async function listGoogleEvents(
	account: CalendarAccount,
	googleCalendarId: string,
	timeMin: Date,
	timeMax: Date
): Promise<calendar_v3.Schema$Event[]> {
	const client = getClientForAccount(account);
	const cal = google.calendar({ version: 'v3', auth: client });

	const events: calendar_v3.Schema$Event[] = [];
	let pageToken: string | undefined;
	do {
		const { data } = await cal.events.list({
			calendarId: googleCalendarId,
			timeMin: timeMin.toISOString(),
			timeMax: timeMax.toISOString(),
			singleEvents: true,
			orderBy: 'startTime',
			maxResults: 250,
			pageToken
		});
		events.push(...(data.items ?? []));
		pageToken = data.nextPageToken ?? undefined;
	} while (pageToken);

	return events;
}
