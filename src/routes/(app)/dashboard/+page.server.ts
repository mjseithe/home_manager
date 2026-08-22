import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendars, chores, groceryItems } from '$lib/server/db/schema';
import { isScheduledFor, toDateKey } from '$lib/server/chores';
import type { PageServerLoad } from './$types';

function startOfDay(date: Date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfDay(date: Date) {
	const d = new Date(date);
	d.setHours(23, 59, 59, 999);
	return d;
}

export const load: PageServerLoad = async () => {
	const today = new Date();
	const todayKey = toDateKey(today);
	const rangeStart = startOfDay(today);
	const rangeEnd = endOfDay(today);

	const enabledCalendars = await db.query.calendars.findMany({
		where: eq(calendars.enabled, true)
	});
	const enabledCalendarIds = enabledCalendars.map((c) => c.id);

	const todaysEvents = enabledCalendarIds.length
		? await db.query.calendarEvents.findMany({
				where: (ce, { inArray, and, gte, lte }) =>
					and(
						inArray(ce.calendarId, enabledCalendarIds),
						gte(ce.startAt, rangeStart),
						lte(ce.startAt, rangeEnd)
					),
				with: { calendar: { with: { account: { with: { familyMember: true } } } } },
				orderBy: (ce, { asc }) => asc(ce.startAt)
			})
		: [];

	const familyMembers = await db.query.familyMembers.findMany({
		orderBy: (fm, { asc }) => asc(fm.sortOrder)
	});

	const activeChores = await db.query.chores.findMany({
		where: eq(chores.active, true),
		with: { assignedTo: true, completions: true }
	});

	const choresDueToday = activeChores
		.filter((c) => {
			if (c.recurrence === 'once') return c.completions.length === 0 && isScheduledFor(c, today);
			return isScheduledFor(c, today);
		})
		.map((c) => ({
			chore: c,
			doneToday: c.completions.some((comp) => comp.forDate === todayKey)
		}));

	const groceryList = await db.query.groceryItems.findMany({
		where: eq(groceryItems.checked, false),
		orderBy: (gi, { desc }) => desc(gi.createdAt)
	});

	return {
		todaysEvents,
		familyMembers,
		choresDueToday,
		groceryPreview: groceryList.slice(0, 6),
		groceryCount: groceryList.length
	};
};
