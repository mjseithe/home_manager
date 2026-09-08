import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts, calendars } from '$lib/server/db/schema';
import { syncAllAccounts } from '$lib/server/calendar/sync';
import {
	createEvent,
	deleteEvent,
	updateEvent,
	type EventInput
} from '$lib/server/calendar/events';
import {
	addLocalDays,
	endOfLocalDay,
	monthGridStart,
	parseLocalDateParam,
	startOfLocalDay,
	startOfLocalWeek
} from '$lib/calendar-layout';
import type { Actions, PageServerLoad } from './$types';

const VIEWS = ['day', 'week', 'month', 'agenda'] as const;
type View = (typeof VIEWS)[number];

export const load: PageServerLoad = async ({ url }) => {
	const viewParam = url.searchParams.get('view');
	const view: View = (VIEWS as readonly string[]).includes(viewParam ?? '')
		? (viewParam as View)
		: 'week';

	const dateParam = url.searchParams.get('date');
	// Parse as local calendar fields, not `new Date(dateOnlyString)` (which
	// parses as UTC midnight and can land on the wrong local day) — same
	// class of bug fixed in calendar sync's date parsing.
	const anchor =
		dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
			? parseLocalDateParam(dateParam)
			: new Date();

	let rangeStart: Date;
	let rangeEnd: Date;
	if (view === 'day') {
		rangeStart = startOfLocalDay(anchor);
		rangeEnd = endOfLocalDay(anchor);
	} else if (view === 'week') {
		rangeStart = startOfLocalWeek(anchor);
		rangeEnd = endOfLocalDay(addLocalDays(rangeStart, 6));
	} else if (view === 'month') {
		// Full 6-row grid (42 days), not just the calendar month, so events
		// on the leading/trailing days from adjacent months that are still
		// visible in the grid get fetched too.
		rangeStart = monthGridStart(anchor);
		rangeEnd = endOfLocalDay(addLocalDays(rangeStart, 41));
	} else {
		rangeStart = startOfLocalDay(anchor);
		rangeEnd = endOfLocalDay(addLocalDays(rangeStart, 13));
	}

	const hiddenMembers = url.searchParams.getAll('hide');

	const accounts = await db.query.calendarAccounts.findMany({
		with: { familyMember: true, calendars: true }
	});
	// Local-only calendars (kids, or anyone without a connected Google
	// account) live outside the accounts hierarchy entirely, so they need
	// their own query to show up on the grid / filters at all.
	const localCalendars = await db.query.calendars.findMany({
		where: eq(calendars.isLocal, true),
		with: { familyMember: true }
	});

	const visibleCalendarIds = [
		...accounts
			.filter((a) => !hiddenMembers.includes(a.familyMemberId))
			.flatMap((a) => a.calendars.filter((c) => c.enabled).map((c) => c.id)),
		...localCalendars
			.filter((c) => c.enabled && c.familyMemberId && !hiddenMembers.includes(c.familyMemberId))
			.map((c) => c.id)
	];

	const events = visibleCalendarIds.length
		? await db.query.calendarEvents.findMany({
				// Overlap test, not "starts within range": a multi-day event
				// that started before rangeStart but is still ongoing (endAt
				// falls inside/after the range) needs to show up too.
				where: (ce, { inArray, and, gte, lte }) =>
					and(
						inArray(ce.calendarId, visibleCalendarIds),
						lte(ce.startAt, rangeEnd),
						gte(ce.endAt, rangeStart)
					),
				with: {
					calendar: { with: { account: { with: { familyMember: true } }, familyMember: true } }
				},
				orderBy: (ce, { asc }) => asc(ce.startAt)
			})
		: [];

	const familyMembers = await db.query.familyMembers.findMany({
		orderBy: (fm, { asc }) => asc(fm.sortOrder)
	});

	return {
		view,
		anchor: anchor.toISOString(),
		events,
		accounts,
		localCalendars,
		familyMembers,
		hiddenMembers,
		error: url.searchParams.get('error')
	};
};

function parseEventForm(formData: FormData): { familyMemberId: string; input: EventInput } | null {
	const familyMemberId = formData.get('familyMemberId');
	const title = formData.get('title');
	const allDay = formData.get('allDay') === 'true';
	const startDate = formData.get('startDate');
	const endDate = formData.get('endDate');
	const startTime = formData.get('startTime');
	const endTime = formData.get('endTime');

	if (
		typeof familyMemberId !== 'string' ||
		!familyMemberId ||
		typeof title !== 'string' ||
		!title.trim() ||
		typeof startDate !== 'string' ||
		typeof endDate !== 'string'
	) {
		return null;
	}

	const description = formData.get('description');
	const location = formData.get('location');

	let startAt: Date;
	let endAt: Date;
	if (allDay) {
		startAt = parseLocalDateParam(startDate);
		// Stored end is exclusive (the local midnight after the last actual
		// day) — same convention Google uses, so this round-trips cleanly.
		endAt = addLocalDays(parseLocalDateParam(endDate), 1);
	} else {
		const [sh, sm] =
			typeof startTime === 'string' && startTime ? startTime.split(':').map(Number) : [0, 0];
		const [eh, em] =
			typeof endTime === 'string' && endTime ? endTime.split(':').map(Number) : [0, 0];
		const startDay = parseLocalDateParam(startDate);
		const endDay = parseLocalDateParam(endDate);
		startAt = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), sh, sm);
		endAt = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), eh, em);
	}

	if (endAt <= startAt) return null;

	return {
		familyMemberId,
		input: {
			title: title.trim(),
			description:
				typeof description === 'string' && description.trim() ? description.trim() : null,
			location: typeof location === 'string' && location.trim() ? location.trim() : null,
			allDay,
			startAt,
			endAt
		}
	};
}

export const actions: Actions = {
	sync: async () => {
		await syncAllAccounts();
		return { synced: true };
	},
	toggleCalendar: async ({ request }) => {
		const data = await request.formData();
		const calendarId = data.get('calendarId');
		const currentlyEnabled = data.get('enabled') === 'true';
		if (typeof calendarId === 'string') {
			await db
				.update(calendars)
				.set({ enabled: !currentlyEnabled })
				.where(eq(calendars.id, calendarId));
		}
	},
	disconnect: async ({ request }) => {
		const data = await request.formData();
		const accountId = data.get('accountId');
		if (typeof accountId === 'string') {
			await db.delete(calendarAccounts).where(eq(calendarAccounts.id, accountId));
		}
	},
	createEvent: async ({ request }) => {
		const parsed = parseEventForm(await request.formData());
		if (!parsed) return fail(400, { error: 'Please fill in a title, assignee, and valid dates.' });
		try {
			await createEvent(parsed.familyMemberId, parsed.input);
		} catch (err) {
			console.error('Failed to create event:', err);
			return fail(500, { error: 'Could not create the event. Try again.' });
		}
	},
	updateEvent: async ({ request }) => {
		const formData = await request.formData();
		const eventId = formData.get('eventId');
		if (typeof eventId !== 'string') return fail(400, { error: 'Missing event.' });
		const parsed = parseEventForm(formData);
		if (!parsed) return fail(400, { error: 'Please fill in a title, assignee, and valid dates.' });
		try {
			await updateEvent(eventId, parsed.familyMemberId, parsed.input);
		} catch (err) {
			console.error('Failed to update event:', err);
			return fail(500, { error: 'Could not update the event. Try again.' });
		}
	},
	deleteEvent: async ({ request }) => {
		const formData = await request.formData();
		const eventId = formData.get('eventId');
		if (typeof eventId !== 'string') return fail(400, { error: 'Missing event.' });
		try {
			await deleteEvent(eventId);
		} catch (err) {
			console.error('Failed to delete event:', err);
			return fail(500, { error: 'Could not delete the event. Try again.' });
		}
	}
};
