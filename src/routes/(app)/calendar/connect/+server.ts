import { redirect } from '@sveltejs/kit';
import { getAuthUrl } from '$lib/server/google/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.activeMember) redirect(303, '/');
	redirect(303, getAuthUrl(locals.activeMember.id));
};
