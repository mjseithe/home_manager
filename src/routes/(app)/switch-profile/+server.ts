import { redirect } from '@sveltejs/kit';
import { ACTIVE_MEMBER_COOKIE } from '$lib/server/profile';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	cookies.delete(ACTIVE_MEMBER_COOKIE, { path: '/' });
	redirect(303, '/');
};
