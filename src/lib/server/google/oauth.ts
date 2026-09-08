import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

export const GOOGLE_SCOPES = [
	// Read-write: creating/editing/deleting events from the app needs to push
	// back to Google, not just pull. calendar.readonly is no longer enough.
	'https://www.googleapis.com/auth/calendar',
	'https://www.googleapis.com/auth/userinfo.email'
];

export function createOAuthClient() {
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
		throw new Error(
			'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env.'
		);
	}
	return new google.auth.OAuth2(
		env.GOOGLE_CLIENT_ID,
		env.GOOGLE_CLIENT_SECRET,
		env.GOOGLE_REDIRECT_URI
	);
}

/** `state` carries the id of the family member who's connecting their calendar. */
export function getAuthUrl(state: string) {
	const client = createOAuthClient();
	return client.generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		scope: GOOGLE_SCOPES,
		state
	});
}

export async function exchangeCodeForTokens(code: string) {
	const client = createOAuthClient();
	const { tokens } = await client.getToken(code);
	client.setCredentials(tokens);
	const oauth2 = google.oauth2({ auth: client, version: 'v2' });
	const { data } = await oauth2.userinfo.get();
	return { tokens, email: data.email ?? null };
}
