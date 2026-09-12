import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { classCountsBackend, getClassBackend } from '$lib/server/class-store.js';
import { listSubjectsBackend } from '$lib/server/subject-store.js';
import { createSessionBackend } from '$lib/server/session-store.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const cls = await getClassBackend(locals, locals.user.id, params.classId);
	if (!cls) throw error(404, 'Class not found.');
	const subjects = await listSubjectsBackend(locals, locals.user.id, params.classId);
	const counts = await classCountsBackend(locals, params.classId);
	return { class: cls, subjects, counts };
};

export const actions: Actions = {
	start: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			const s = await createSessionBackend(locals, locals.user.id, params.classId, {
				subject_id: String(form.get('subject_id') ?? '') || undefined,
				radius_meters: String(form.get('radius_meters') ?? ''),
				code_length: String(form.get('code_length') ?? '')
			});
			// Return the id and let the client navigate: an explicit goto +
			// revalidation beats a bare form redirect (which left stale views
			// behind and invited repeat clicks → duplicate sessions).
			return { started: { id: s.id } };
		} catch (e) {
			if (e instanceof Response) throw e;
			return fail(400, { error: (e as Error).message });
		}
	}
};
