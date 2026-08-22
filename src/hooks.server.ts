import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ACTIVE_MEMBER_COOKIE } from '$lib/server/profile';
import { startScheduler } from '$lib/server/scheduler';

startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	const activeMemberId = event.cookies.get(ACTIVE_MEMBER_COOKIE);

	event.locals.activeMember = activeMemberId
		? ((await db.query.familyMembers.findFirst({
				where: (fm, { eq }) => eq(fm.id, activeMemberId)
			})) ?? null)
		: null;

	return resolve(event);
};
