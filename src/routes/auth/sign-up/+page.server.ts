import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	LOCAL_SESSION_COOKIE,
	localCreateSession,
	localSignUp
} from '$lib/server/local-auth.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/dashboard');
	return {};
};

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const actions: Actions = {
	signup: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!emailOk(email)) return fail(400, { email, error: 'Enter a valid email address.' });
		if (password.length < 8)
			return fail(400, { email, error: 'Password must be at least 8 characters.' });

		// Local-dev path: SQLite + cookie session, straight to dashboard.
		if (!locals.supabase) {
			try {
				const user = localSignUp(email, password);
				const { token, expiresAt } = localCreateSession(user.id);
				cookies.set(LOCAL_SESSION_COOKIE, token, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					expires: expiresAt
				});
			} catch (e) {
				return fail(400, { email, error: (e as Error).message });
			}
			throw redirect(303, '/dashboard');
		}

		const { data, error } = await locals.supabase.auth.signUp({ email, password });
		if (error) return fail(400, { email, error: error.message });

		// Email confirmation may be on: no session yet → tell them to check mail.
		if (!data.session) throw redirect(303, '/auth/sign-in?notice=confirm-email');
		throw redirect(303, '/dashboard');
	}
};
