import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LOCAL_SESSION_COOKIE, localDestroySession } from '$lib/server/local-auth.js';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.supabase) {
		await locals.supabase.auth.signOut();
	} else {
		localDestroySession(cookies.get(LOCAL_SESSION_COOKIE));
		cookies.delete(LOCAL_SESSION_COOKIE, { path: '/' });
	}
	throw redirect(303, '/');
};
