import cron from 'node-cron';
import { syncAllAccounts } from '$lib/server/calendar/sync';
import { processReminders } from '$lib/server/reminders/process';

declare global {
	var __homeManagerSchedulerStarted: boolean | undefined;
}

/** Idempotent: safe to call on every module load (e.g. Vite dev server HMR). */
export function startScheduler() {
	if (globalThis.__homeManagerSchedulerStarted) return;
	globalThis.__homeManagerSchedulerStarted = true;

	cron.schedule('*/15 * * * *', () => {
		syncAllAccounts().catch((err) => console.error('Scheduled calendar sync failed:', err));
	});

	cron.schedule('*/5 * * * *', () => {
		processReminders().catch((err) => console.error('Scheduled reminder check failed:', err));
	});

	console.log('Home Manager scheduler started (calendar sync every 15m, reminders every 5m).');
}
