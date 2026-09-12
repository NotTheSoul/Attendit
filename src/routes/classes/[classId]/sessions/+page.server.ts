import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { classCountsBackend, getClassBackend } from '$lib/server/class-store.js';
import { listSessionsBackend, setSessionDeletedBackend } from '$lib/server/session-store.js';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const showRemoved = url.searchParams.get('removed') === '1';
	const [cls, all, counts] = await Promise.all([
		getClassBackend(locals, locals.user.id, params.classId),
		listSessionsBackend(locals, locals.user.id, params.classId, { includeDeleted: showRemoved }).catch(() => []),
		classCountsBackend(locals, params.classId)
	]);
	if (!cls) throw error(404, 'Class not found.');
	return {
		class: cls,
		sessions: all.filter((s) => (showRemoved ? s.deleted_at : !s.deleted_at)),
		counts,
		showRemoved
	};
};

export const actions: Actions = {
	archive: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await setSessionDeletedBackend(locals, locals.user.id, params.classId, String(form.get('id') ?? ''), true);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { archived: true };
	},

	restore: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await setSessionDeletedBackend(locals, locals.user.id, params.classId, String(form.get('id') ?? ''), false);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { restored: true };
	}
};
