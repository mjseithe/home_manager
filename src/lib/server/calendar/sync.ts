import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts, calendarEvents, calendars } from '$lib/server/db/schema';
import { listGoogleCalendars, listGoogleEvents } from '$lib/server/google/calendar';

const SYNC_PAST_DAYS = 1;
const SYNC_FUTURE_DAYS = 60;

export async function syncAccountCalendarList(accountId: string) {
	const account = await db.query.calendarAccounts.findFirst({
		where: eq(calendarAccounts.id, accountId)
	});
	if (!account) return;

	const googleCalendars = await listGoogleCalendars(account);
	const existing = await db.query.calendars.findMany({
		where: eq(calendars.accountId, account.id)
	});
	const existingByGoogleId = new Map(existing.map((c) => [c.googleCalendarId, c]));

	for (const gc of googleCalendars) {
		if (!gc.id) continue;
		const found = existingByGoogleId.get(gc.id);
		if (found) {
			await db
				.update(calendars)
				.set({
					summary: gc.summary ?? found.summary,
					colorHex: gc.backgroundColor ?? found.colorHex
				})
				.where(eq(calendars.id, found.id));
		} else {
			await db.insert(calendars).values({
				accountId: account.id,
				googleCalendarId: gc.id,
				summary: gc.summary ?? gc.id,
				colorHex: gc.backgroundColor ?? null,
				// enable everything by default on first connect; user can narrow down via filters
				enabled: true
			});
		}
	}
}

export async function syncAccountEvents(accountId: string) {
	const account = await db.query.calendarAccounts.findFirst({
		where: eq(calendarAccounts.id, accountId)
	});
	if (!account) return;

	const enabledCalendars = await db.query.calendars.findMany({
		where: and(eq(calendars.accountId, account.id), eq(calendars.enabled, true))
	});

	const timeMin = new Date(Date.now() - SYNC_PAST_DAYS * 86_400_000);
	const timeMax = new Date(Date.now() + SYNC_FUTURE_DAYS * 86_400_000);

	for (const cal of enabledCalendars) {
		const events = await listGoogleEvents(account, cal.googleCalendarId, timeMin, timeMax);

		// Full replace of the sync window: simplest correct way to reflect
		// cancellations without needing Google's incremental syncToken flow.
		await db
			.delete(calendarEvents)
			.where(
				and(
					eq(calendarEvents.calendarId, cal.id),
					gte(calendarEvents.startAt, timeMin),
					lte(calendarEvents.startAt, timeMax)
				)
			);

		for (const event of events) {
			if (!event.id || event.status === 'cancelled') continue;
			const start = event.start?.dateTime ?? event.start?.date;
			const end = event.end?.dateTime ?? event.end?.date;
			if (!start || !end) continue;

			await db.insert(calendarEvents).values({
				calendarId: cal.id,
				googleEventId: event.id,
				title: event.summary ?? '(no title)',
				description: event.description ?? null,
				location: event.location ?? null,
				startAt: new Date(start),
				endAt: new Date(end),
				allDay: !event.start?.dateTime,
				status: event.status ?? 'confirmed',
				updatedAt: event.updated ? new Date(event.updated) : new Date()
			});
		}
	}

	await db
		.update(calendarAccounts)
		.set({ lastSyncedAt: new Date() })
		.where(eq(calendarAccounts.id, account.id));
}

export async function syncAccountFull(accountId: string) {
	await syncAccountCalendarList(accountId);
	await syncAccountEvents(accountId);
}

export async function syncAllAccounts() {
	const accounts = await db.query.calendarAccounts.findMany();
	for (const account of accounts) {
		try {
			await syncAccountFull(account.id);
		} catch (err) {
			console.error(`Failed to sync calendar account ${account.googleEmail}:`, err);
		}
	}
}
