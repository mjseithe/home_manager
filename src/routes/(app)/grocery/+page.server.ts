import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { groceryItems } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const items = await db.query.groceryItems.findMany({
		with: { addedBy: true, checkedBy: true },
		orderBy: (gi, { asc, desc }) => [asc(gi.checked), desc(gi.createdAt)]
	});

	return { items };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name');
		const quantity = data.get('quantity');

		if (typeof name === 'string' && name.trim()) {
			await db.insert(groceryItems).values({
				name: name.trim(),
				quantity: typeof quantity === 'string' && quantity.trim() ? quantity.trim() : null,
				addedById: locals.activeMember?.id ?? null
			});
		}
	},
	toggle: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('itemId');
		const currentlyChecked = data.get('checked') === 'true';

		if (typeof itemId === 'string') {
			await db
				.update(groceryItems)
				.set(
					currentlyChecked
						? { checked: false, checkedById: null, checkedAt: null }
						: { checked: true, checkedById: locals.activeMember?.id ?? null, checkedAt: new Date() }
				)
				.where(eq(groceryItems.id, itemId));
		}
	},
	remove: async ({ request }) => {
		const data = await request.formData();
		const itemId = data.get('itemId');
		if (typeof itemId === 'string') {
			await db.delete(groceryItems).where(eq(groceryItems.id, itemId));
		}
	},
	clearChecked: async () => {
		await db.delete(groceryItems).where(eq(groceryItems.checked, true));
	}
};
