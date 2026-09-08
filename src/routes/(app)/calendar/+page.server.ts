import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts, calendars } from '$lib/server/db/schema';
import { syncAllAccounts } from '$lib/server/calendar/sync';
import type { Actions, PageServerLoad } from './$types';

function startOfDay(date: Date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function addDays(date: Date, days: number) {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function startOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export const load: PageServerLoad = async ({ url }) => {
	const view = url.searchParams.get('view') === 'month' ? 'month' : 'agenda';
	const dateParam = url.searchParams.get('date');
	const anchor = dateParam && !isNaN(Date.parse(dateParam)) ? new Date(dateParam) : new Date();

	const rangeStart = view === 'month' ? startOfMonth(anchor) : startOfDay(anchor);
	const rangeEnd = view === 'month' ? endOfMonth(anchor) : addDays(rangeStart, 14);

	const hiddenMembers = url.searchParams.getAll('hide');

	const accounts = await db.query.calendarAccounts.findMany({
		with: { familyMember: true, calendars: true }
	});

	const visibleCalendarIds = accounts
		.filter((a) => !hiddenMembers.includes(a.familyMemberId))
		.flatMap((a) => a.calendars.filter((c) => c.enabled).map((c) => c.id));

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
				with: { calendar: { with: { account: { with: { familyMember: true } } } } },
				orderBy: (ce, { asc }) => asc(ce.startAt)
			})
		: [];

	const familyMembers = await db.query.familyMembers.findMany({
		orderBy: (fm, { asc }) => asc(fm.sortOrder)
	});

	return {
		view,
		anchor: anchor.toISOString(),
		rangeStart: rangeStart.toISOString(),
		rangeEnd: rangeEnd.toISOString(),
		events,
		accounts,
		familyMembers,
		hiddenMembers,
		error: url.searchParams.get('error')
	};
};

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
	}
};
