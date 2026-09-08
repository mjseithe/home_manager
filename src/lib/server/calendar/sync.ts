import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts, calendarEvents, calendars } from '$lib/server/db/schema';
import { listGoogleCalendars, listGoogleEvents } from '$lib/server/google/calendar';

const SYNC_PAST_DAYS = 1;
const SYNC_FUTURE_DAYS = 60;

// Google returns all-day event boundaries as bare "YYYY-MM-DD" strings with
// no timezone. `new Date("2026-09-14")` parses that as UTC midnight, which
// in any timezone behind UTC (all of the US) lands on the *previous* local
// day — a multi-day event starting Sept 14 would render as starting Sept
// 13. Parse date-only strings as local-midnight instead; timed events keep
// using their real offset via the normal Date constructor.
export function parseGoogleDate(value: string, isDateOnly: boolean): Date {
	if (!isDateOnly) return new Date(value);
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

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
		// Google-backed calendars always have this set; only local-only
		// calendars (which never appear here — they have no accountId) don't.
		if (!cal.googleCalendarId) continue;
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

			const values = {
				calendarId: cal.id,
				googleEventId: event.id,
				title: event.summary ?? '(no title)',
				description: event.description ?? null,
				location: event.location ?? null,
				startAt: parseGoogleDate(start, !event.start?.dateTime),
				endAt: parseGoogleDate(end, !event.end?.dateTime),
				allDay: !event.start?.dateTime,
				status: event.status ?? 'confirmed',
				updatedAt: event.updated ? new Date(event.updated) : new Date()
			};

			// Upsert instead of plain insert: defense in depth in case two
			// syncs for the same account still race despite the lock in
			// syncAccountFull below, so a duplicate never surfaces as an
			// unhandled unique-constraint error.
			await db
				.insert(calendarEvents)
				.values(values)
				.onConflictDoUpdate({
					target: [calendarEvents.calendarId, calendarEvents.googleEventId],
					set: values
				});
		}
	}

	await db
		.update(calendarAccounts)
		.set({ lastSyncedAt: new Date() })
		.where(eq(calendarAccounts.id, account.id));
}

// Guards against overlapping syncs of the same account. Without this, the
// 15-min cron job, the post-OAuth-connect sync, and a manual "Sync now"
// click can all race: two concurrent delete-then-reinsert passes over the
// same calendar collide on the (calendarId, googleEventId) unique
// constraint, and the sync fails silently (errors are swallowed in
// syncAllAccounts so the UI shows no feedback).
const accountsInFlight = new Set<string>();

export async function syncAccountFull(accountId: string) {
	if (accountsInFlight.has(accountId)) return;
	accountsInFlight.add(accountId);
	try {
		await syncAccountCalendarList(accountId);
		await syncAccountEvents(accountId);
	} finally {
		accountsInFlight.delete(accountId);
	}
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
