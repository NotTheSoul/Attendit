import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	LOCAL_SESSION_COOKIE,
	localCreateSession,
	localSignIn
} from '$lib/server/local-auth.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/dashboard');
	return {};
};

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const actions: Actions = {
	signin: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!emailOk(email)) return fail(400, { email, error: 'Enter a valid email address.' });
		if (!password) return fail(400, { email, error: 'Enter your password.' });

		// Local-dev path: SQLite + cookie session.
		if (!locals.supabase) {
			try {
				const user = localSignIn(email, password);
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

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) {
			return fail(400, {
				email,
				error:
					error.message === 'Invalid login credentials'
						? 'Email or password is incorrect. Try again or reset your password below.'
						: error.message
			});
		}
		throw redirect(303, '/dashboard');
	},

	requestReset: async ({ request, locals, url }) => {
		if (!locals.supabase) {
			return fail(400, {
				email: '',
				error: 'Password reset needs Supabase Auth — unavailable in local SQLite mode.'
			});
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (!emailOk(email)) return fail(400, { email, error: 'Enter the email you signed up with.' });

		const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/sign-in?notice=password-reset`
		});
		if (error) return fail(400, { email, error: error.message });
		return { resetSent: true, email };
	}
};
