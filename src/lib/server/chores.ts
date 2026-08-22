import type { Chore } from '$lib/server/db/schema';

export function toDateKey(date: Date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Whether a chore's recurrence schedule includes the given day. */
export function isScheduledFor(
	chore: Pick<Chore, 'recurrence' | 'recurrenceDays' | 'dueDate'>,
	date: Date
) {
	const dow = date.getDay();
	switch (chore.recurrence) {
		case 'daily':
			return true;
		case 'weekdays':
			return dow >= 1 && dow <= 5;
		case 'weekly':
		case 'custom':
			return chore.recurrenceDays?.includes(dow) ?? false;
		case 'once':
			return chore.dueDate ? toDateKey(chore.dueDate) <= toDateKey(date) : false;
		default:
			return false;
	}
}
