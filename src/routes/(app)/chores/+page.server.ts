import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { choreCompletions, chores, type RecurrenceType } from '$lib/server/db/schema';
import { isScheduledFor, toDateKey } from '$lib/server/chores';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const today = new Date();
	const todayKey = toDateKey(today);

	const familyMembers = await db.query.familyMembers.findMany({
		orderBy: (fm, { asc }) => asc(fm.sortOrder)
	});

	const allChores = await db.query.chores.findMany({
		where: eq(chores.active, true),
		with: { assignedTo: true, completions: true },
		orderBy: (c, { asc }) => asc(c.createdAt)
	});

	const board = familyMembers.map((member) => {
		const items = allChores
			.filter((c) => c.assignedToId === member.id)
			.filter((c) => {
				if (c.recurrence === 'once') return c.completions.length === 0 && isScheduledFor(c, today);
				return isScheduledFor(c, today);
			})
			.map((c) => ({
				chore: c,
				doneToday: c.completions.some((comp) => comp.forDate === todayKey)
			}));

		return { member, items };
	});

	return { board, familyMembers, allChores, todayKey };
};

export const actions: Actions = {
	addChore: async ({ request }) => {
		const data = await request.formData();
		const title = data.get('title');
		const assignedToId = data.get('assignedToId');
		const recurrence = data.get('recurrence') as RecurrenceType | null;
		const dueDate = data.get('dueDate');
		const recurrenceDays = data.getAll('recurrenceDays').map(Number);

		if (typeof title !== 'string' || !title.trim()) return;
		if (typeof assignedToId !== 'string' || !assignedToId) return;
		if (!recurrence) return;

		await db.insert(chores).values({
			title: title.trim(),
			assignedToId,
			recurrence,
			recurrenceDays: recurrenceDays.length ? recurrenceDays : null,
			dueDate: typeof dueDate === 'string' && dueDate ? new Date(dueDate) : null
		});
	},
	deleteChore: async ({ request }) => {
		const data = await request.formData();
		const choreId = data.get('choreId');
		if (typeof choreId === 'string') {
			await db.delete(chores).where(eq(chores.id, choreId));
		}
	},
	toggle: async ({ request, locals }) => {
		const data = await request.formData();
		const choreId = data.get('choreId');
		const forDate = data.get('forDate');
		if (typeof choreId !== 'string' || typeof forDate !== 'string') return;

		const existing = await db.query.choreCompletions.findFirst({
			where: and(eq(choreCompletions.choreId, choreId), eq(choreCompletions.forDate, forDate))
		});

		if (existing) {
			await db.delete(choreCompletions).where(eq(choreCompletions.id, existing.id));
		} else {
			await db.insert(choreCompletions).values({
				choreId,
				forDate,
				completedById: locals.activeMember?.id ?? null
			});
		}
	}
};
