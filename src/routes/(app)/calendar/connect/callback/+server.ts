import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarAccounts } from '$lib/server/db/schema';
import { exchangeCodeForTokens } from '$lib/server/google/oauth';
import { syncAccountFull } from '$lib/server/calendar/sync';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	const familyMemberId = url.searchParams.get('state');
	const oauthError = url.searchParams.get('error');

	if (oauthError) {
		redirect(303, `/calendar?error=${encodeURIComponent(oauthError)}`);
	}
	if (!code || !familyMemberId) {
		error(400, 'Missing code or state from Google.');
	}

	const { tokens, email } = await exchangeCodeForTokens(code);
	if (!tokens.access_token || !tokens.refresh_token || !email) {
		redirect(303, '/calendar?error=no_refresh_token');
	}

	const existing = await db.query.calendarAccounts.findFirst({
		where: eq(calendarAccounts.googleEmail, email)
	});

	let accountId: string;
	if (existing) {
		await db
			.update(calendarAccounts)
			.set({
				familyMemberId,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null
			})
			.where(eq(calendarAccounts.id, existing.id));
		accountId = existing.id;
	} else {
		const [account] = await db
			.insert(calendarAccounts)
			.values({
				familyMemberId,
				googleEmail: email,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null
			})
			.returning();
		accountId = account.id;
	}

	await syncAccountFull(accountId);

	redirect(303, '/calendar');
};
