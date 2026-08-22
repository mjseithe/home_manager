import { google, type calendar_v3 } from 'googleapis';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts, type CalendarAccount } from '$lib/server/db/schema';
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
