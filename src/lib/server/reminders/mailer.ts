import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import type { CalendarEvent } from '$lib/server/db/schema';
import { describeOffset } from '$lib/reminder-presets';

function getTransport() {
	if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
		throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.');
	}
	const port = Number(env.SMTP_PORT ?? 587);
	return nodemailer.createTransport({
		host: env.SMTP_HOST,
		port,
		secure: port === 465,
		auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
	});
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});

export async function sendReminderEmail(
	toEmail: string,
	event: Pick<CalendarEvent, 'title' | 'startAt' | 'location' | 'allDay'>,
	offsetMinutes: number
) {
	const transport = getTransport();
	await transport.sendMail({
		from: env.SMTP_FROM || env.SMTP_USER,
		to: toEmail,
		subject: `Reminder: ${event.title} in ${describeOffset(offsetMinutes)}`,
		text: [
			event.title,
			event.allDay ? 'All day' : dateFmt.format(new Date(event.startAt)),
			event.location ? `Location: ${event.location}` : null
		]
			.filter(Boolean)
			.join('\n')
	});
}
