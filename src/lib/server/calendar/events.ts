import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts, calendarEvents, calendars } from '$lib/server/db/schema';
import {
	deleteGoogleEvent,
	insertGoogleEvent,
	updateGoogleEvent,
	type GoogleEventInput
} from '$lib/server/google/calendar';
import { parseGoogleDate } from './sync';

export interface EventInput {
	title: string;
	description: string | null;
	location: string | null;
	startAt: Date;
	endAt: Date;
	allDay: boolean;
}

/** Local-only calendar for a family member with no connected Google account. */
export async function ensureLocalCalendar(familyMemberId: string) {
	const existing = await db.query.calendars.findFirst({
		where: and(eq(calendars.familyMemberId, familyMemberId), eq(calendars.isLocal, true))
	});
	if (existing) return existing;

	const [created] = await db
		.insert(calendars)
		.values({
			accountId: null,
			familyMemberId,
			isLocal: true,
			googleCalendarId: null,
			summary: 'Personal',
			colorHex: null,
			enabled: true
		})
		.returning();
	return created;
}

/**
 * The calendar new events for this family member should land on: their
 * connected Google account's primary calendar if they have one, otherwise
 * their local-only calendar (kids, or anyone who hasn't connected Google).
 */
export async function resolveTargetCalendar(familyMemberId: string) {
	const account = await db.query.calendarAccounts.findFirst({
		where: eq(calendarAccounts.familyMemberId, familyMemberId),
		with: { calendars: true }
	});

	if (account) {
		// Google's convention: a user's primary calendar's id is their email
		// address. Fall back to the first enabled calendar if that's somehow
		// not present (e.g. it got disabled).
		const primary =
			account.calendars.find((c) => c.googleCalendarId === account.googleEmail && c.enabled) ??
			account.calendars.find((c) => c.enabled) ??
			account.calendars[0];
		if (primary) return { calendar: primary, account };
	}

	const local = await ensureLocalCalendar(familyMemberId);
	return { calendar: local, account: null };
}

function toGoogleInput(values: EventInput): GoogleEventInput {
	return values;
}

export async function createEvent(familyMemberId: string, input: EventInput) {
	const { calendar, account } = await resolveTargetCalendar(familyMemberId);

	const [row] = await db
		.insert(calendarEvents)
		.values({
			calendarId: calendar.id,
			googleEventId: null,
			title: input.title,
			description: input.description,
			location: input.location,
			startAt: input.startAt,
			endAt: input.endAt,
			allDay: input.allDay,
			status: 'confirmed',
			updatedAt: new Date()
		})
		.returning();

	if (account && calendar.googleCalendarId) {
		const googleEvent = await insertGoogleEvent(
			account,
			calendar.googleCalendarId,
			toGoogleInput(input)
		);
		return applyGoogleEventResult(row.id, googleEvent);
	}

	return row;
}

export async function updateEvent(eventId: string, familyMemberId: string, input: EventInput) {
	const existing = await db.query.calendarEvents.findFirst({
		where: eq(calendarEvents.id, eventId),
		with: { calendar: { with: { account: true } } }
	});
	if (!existing) throw new Error('Event not found');

	const currentOwnerId = existing.calendar.isLocal
		? existing.calendar.familyMemberId
		: existing.calendar.account?.familyMemberId;

	const { calendar: targetCalendar, account: targetAccount } =
		currentOwnerId === familyMemberId
			? { calendar: existing.calendar, account: existing.calendar.account }
			: await resolveTargetCalendar(familyMemberId);

	const moved = targetCalendar.id !== existing.calendarId;

	// Reassigned to a different person/calendar: drop the old Google copy (if
	// any) so the event doesn't linger on someone else's calendar.
	if (
		moved &&
		existing.googleEventId &&
		existing.calendar.account &&
		existing.calendar.googleCalendarId
	) {
		await deleteGoogleEvent(
			existing.calendar.account,
			existing.calendar.googleCalendarId,
			existing.googleEventId
		);
	}

	await db
		.update(calendarEvents)
		.set({
			calendarId: targetCalendar.id,
			googleEventId: moved ? null : existing.googleEventId,
			title: input.title,
			description: input.description,
			location: input.location,
			startAt: input.startAt,
			endAt: input.endAt,
			allDay: input.allDay,
			updatedAt: new Date()
		})
		.where(eq(calendarEvents.id, eventId));

	if (targetAccount && targetCalendar.googleCalendarId) {
		const googleEvent =
			!moved && existing.googleEventId
				? await updateGoogleEvent(
						targetAccount,
						targetCalendar.googleCalendarId,
						existing.googleEventId,
						toGoogleInput(input)
					)
				: await insertGoogleEvent(
						targetAccount,
						targetCalendar.googleCalendarId,
						toGoogleInput(input)
					);
		return applyGoogleEventResult(eventId, googleEvent);
	}

	return db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, eventId) });
}

export async function deleteEvent(eventId: string) {
	const existing = await db.query.calendarEvents.findFirst({
		where: eq(calendarEvents.id, eventId),
		with: { calendar: { with: { account: true } } }
	});
	if (!existing) return;

	if (existing.googleEventId && existing.calendar.account && existing.calendar.googleCalendarId) {
		await deleteGoogleEvent(
			existing.calendar.account,
			existing.calendar.googleCalendarId,
			existing.googleEventId
		);
	}

	await db.delete(calendarEvents).where(eq(calendarEvents.id, eventId));
}

/** Persist the canonical id/timestamps Google assigned after a push. */
async function applyGoogleEventResult(
	eventId: string,
	googleEvent: {
		id?: string | null;
		start?: { date?: string | null; dateTime?: string | null } | null;
		end?: { date?: string | null; dateTime?: string | null } | null;
		updated?: string | null;
	}
) {
	const startRaw = googleEvent.start?.dateTime ?? googleEvent.start?.date;
	const endRaw = googleEvent.end?.dateTime ?? googleEvent.end?.date;

	const [row] = await db
		.update(calendarEvents)
		.set({
			googleEventId: googleEvent.id ?? null,
			...(startRaw ? { startAt: parseGoogleDate(startRaw, !googleEvent.start?.dateTime) } : {}),
			...(endRaw ? { endAt: parseGoogleDate(endRaw, !googleEvent.end?.dateTime) } : {}),
			updatedAt: googleEvent.updated ? new Date(googleEvent.updated) : new Date()
		})
		.where(eq(calendarEvents.id, eventId))
		.returning();
	return row;
}
