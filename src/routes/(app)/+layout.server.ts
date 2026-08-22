import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.activeMember) {
		redirect(303, '/');
	}

	return {
		activeMember: locals.activeMember
	};
};
