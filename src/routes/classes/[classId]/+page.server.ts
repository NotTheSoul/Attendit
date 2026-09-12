import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	classCountsBackend,
	getClassBackend,
	regenerateSlugBackend,
	setClassDeletedBackend,
	updateClassBackend
} from '$lib/server/class-store.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const [cls, counts] = await Promise.all([
		getClassBackend(locals, locals.user.id, params.classId),
		classCountsBackend(locals, params.classId)
	]);
	if (!cls) throw error(404, 'Class not found.');
	return { class: cls, counts };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await updateClassBackend(locals, locals.user.id, params.classId, {
				name: String(form.get('name') ?? ''),
				section: String(form.get('section') ?? ''),
				academic_year: String(form.get('academic_year') ?? '')
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { saved: true };
	},

	regenerateSlug: async ({ locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		try {
			await regenerateSlugBackend(locals, locals.user.id, params.classId);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { regenerated: true };
	},

	archive: async ({ locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		await setClassDeletedBackend(locals, locals.user.id, params.classId, true);
		throw redirect(303, '/classes');
	},

	restore: async ({ locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		await setClassDeletedBackend(locals, locals.user.id, params.classId, false);
		return { restored: true };
	}
};
