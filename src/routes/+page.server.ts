import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ACTIVE_MEMBER_COOKIE } from '$lib/server/profile';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.activeMember) {
		redirect(303, '/dashboard');
	}

	const familyMembers = await db.query.familyMembers.findMany({
		orderBy: (fm, { asc }) => asc(fm.sortOrder)
	});

	return { familyMembers };
};

export const actions: Actions = {
	select: async ({ request, cookies }) => {
		const data = await request.formData();
		const memberId = data.get('memberId');

		if (typeof memberId !== 'string' || !memberId) {
			return fail(400, { message: 'No profile selected.' });
		}

		const member = await db.query.familyMembers.findFirst({
			where: (fm, { eq }) => eq(fm.id, memberId)
		});

		if (!member) {
			return fail(400, { message: 'Unknown profile.' });
		}

		cookies.set(ACTIVE_MEMBER_COOKIE, member.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});

		redirect(303, '/dashboard');
	}
};
