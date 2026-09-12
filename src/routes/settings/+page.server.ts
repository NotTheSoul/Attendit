import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { localChangePassword } from '$lib/server/local-auth.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	return { email: locals.user.email ?? '', backend: locals.supabaseConfigured ? 'supabase' : 'local' };
};

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		const current = String(form.get('current_password') ?? '');
		const next = String(form.get('new_password') ?? '');
		const confirm = String(form.get('confirm_password') ?? '');

		if (!current) return fail(400, { error: 'Enter your current password.' });
		if (next.length < 8) return fail(400, { error: 'New password must be at least 8 characters.' });
		if (next !== confirm) return fail(400, { error: 'New passwords do not match.' });
		if (next === current) return fail(400, { error: 'New password must differ from the current one.' });

		try {
			if (locals.supabase) {
				// Re-authenticate first: updateUser alone trusts the session,
				// so prove the current password explicitly.
				const email = locals.user.email ?? '';
				const { error: signErr } = await locals.supabase.auth.signInWithPassword({ email, password: current });
				if (signErr) return fail(400, { error: 'Current password is incorrect.' });
				const { error: updErr } = await locals.supabase.auth.updateUser({ password: next });
				if (updErr) return fail(400, { error: updErr.message });
			} else {
				localChangePassword(locals.user.id, current, next);
			}
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { passwordChanged: true };
	}
};
