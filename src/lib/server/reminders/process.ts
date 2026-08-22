import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarEvents, eventReminderLog, reminderRules } from '$lib/server/db/schema';
import { sendReminderEmail } from './mailer';

// Should be >= the cron interval that calls processReminders, so no event's
// reminder window falls between two runs and gets skipped entirely.
const CHECK_WINDOW_MINUTES = 5;

export async function processReminders() {
	const rules = await db.query.reminderRules.findMany({
		where: eq(reminderRules.enabled, true)
	});
	if (rules.length === 0) return;

	const now = Date.now();

	for (const rule of rules) {
		const windowStart = new Date(now + rule.offsetMinutes * 60_000);
		const windowEnd = new Date(windowStart.getTime() + CHECK_WINDOW_MINUTES * 60_000);

		const events = await db.query.calendarEvents.findMany({
			where: and(gte(calendarEvents.startAt, windowStart), lte(calendarEvents.startAt, windowEnd)),
			with: { calendar: { with: { account: { with: { familyMember: true } } } } }
		});

		for (const event of events) {
			const owner = event.calendar.account.familyMember;
			if (rule.familyMemberId && rule.familyMemberId !== owner.id) continue;
			if (!owner.email) continue;

			const alreadySent = await db.query.eventReminderLog.findFirst({
				where: and(
					eq(eventReminderLog.eventId, event.id),
					eq(eventReminderLog.offsetMinutes, rule.offsetMinutes)
				)
			});
			if (alreadySent) continue;

			try {
				await sendReminderEmail(owner.email, event, rule.offsetMinutes);
				await db
					.insert(eventReminderLog)
					.values({ eventId: event.id, offsetMinutes: rule.offsetMinutes });
			} catch (err) {
				console.error(`Failed to send reminder email for event ${event.id}:`, err);
			}
		}
	}
}
