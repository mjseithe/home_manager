import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { familyMembers, reminderRules } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const members = await db.query.familyMembers.findMany({
		orderBy: (fm, { asc }) => asc(fm.sortOrder)
	});
	const rules = await db.query.reminderRules.findMany({
		with: { familyMember: true },
		orderBy: (rr, { asc }) => asc(rr.offsetMinutes)
	});

	return { familyMembers: members, reminderRules: rules };
};

export const actions: Actions = {
	updateEmail: async ({ request }) => {
		const data = await request.formData();
		const memberId = data.get('memberId');
		const email = data.get('email');
		if (typeof memberId === 'string' && typeof email === 'string') {
			await db
				.update(familyMembers)
				.set({ email: email.trim() || null })
				.where(eq(familyMembers.id, memberId));
		}
	},
	addRule: async ({ request }) => {
		const data = await request.formData();
		const offsetMinutes = Number(data.get('offsetMinutes'));
		const familyMemberId = data.get('familyMemberId');
		if (!Number.isFinite(offsetMinutes) || offsetMinutes <= 0) return;

		await db.insert(reminderRules).values({
			offsetMinutes,
			familyMemberId: typeof familyMemberId === 'string' && familyMemberId ? familyMemberId : null
		});
	},
	toggleRule: async ({ request }) => {
		const data = await request.formData();
		const ruleId = data.get('ruleId');
		const currentlyEnabled = data.get('enabled') === 'true';
		if (typeof ruleId === 'string') {
			await db
				.update(reminderRules)
				.set({ enabled: !currentlyEnabled })
				.where(eq(reminderRules.id, ruleId));
		}
	},
	deleteRule: async ({ request }) => {
		const data = await request.formData();
		const ruleId = data.get('ruleId');
		if (typeof ruleId === 'string') {
			await db.delete(reminderRules).where(eq(reminderRules.id, ruleId));
		}
	}
};
