import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { classCountsBackend, getClassBackend } from '$lib/server/class-store.js';
import {
	importStudentsBackend,
	listStudentsBackend,
	addStudentBackend,
	setStudentDeletedBackend,
	updateStudentBackend
} from '$lib/server/roster-store.js';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const search = url.searchParams.get('q') ?? '';
	const showRemoved = url.searchParams.get('removed') === '1';
	const [cls, students, counts] = await Promise.all([
		getClassBackend(locals, locals.user.id, params.classId),
		listStudentsBackend(locals, locals.user.id, params.classId, { search, includeDeleted: showRemoved }).catch(() => []),
		classCountsBackend(locals, params.classId)
	]);
	if (!cls) throw error(404, 'Class not found.');
	return { class: cls, students, counts, search, showRemoved };
};

const idOf = async (request: Request) => String((await request.formData()).get('id') ?? '');

export const actions: Actions = {
	add: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			const s = await addStudentBackend(locals, locals.user.id, params.classId, {
				full_name: String(form.get('full_name') ?? ''),
				registration_id: String(form.get('registration_id') ?? '')
			});
			return { added: s };
		} catch (e) {
			return fail(400, {
				full_name: String(form.get('full_name') ?? ''),
				registration_id: String(form.get('registration_id') ?? ''),
				error: (e as Error).message
			});
		}
	},

	save: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await updateStudentBackend(locals, locals.user.id, params.classId, String(form.get('id') ?? ''), {
				full_name: String(form.get('full_name') ?? ''),
				registration_id: String(form.get('registration_id') ?? '')
			});
			return { saved: true };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	remove: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		try {
			await setStudentDeletedBackend(locals, locals.user.id, params.classId, await idOf(request), true);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { removed: true };
	},

	restore: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		try {
			await setStudentDeletedBackend(locals, locals.user.id, params.classId, await idOf(request), false);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { restored: true };
	},

	import: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			const result = await importStudentsBackend(
				locals,
				locals.user.id,
				params.classId,
				String(form.get('roster_text') ?? '')
			);
			return { importResult: result };
		} catch (e) {
			return fail(400, {
				roster_text: String(form.get('roster_text') ?? ''),
				error: (e as Error).message
			});
		}
	}
};
