import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { classCountsBackend, getClassBackend } from '$lib/server/class-store.js';
import {
	addSubjectBackend,
	listSubjectsBackend,
	setSubjectDeletedBackend,
	updateSubjectBackend
} from '$lib/server/subject-store.js';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const cls = await getClassBackend(locals, locals.user.id, params.classId);
	if (!cls) throw error(404, 'Class not found.');
	const search = url.searchParams.get('q') ?? '';
	const showRemoved = url.searchParams.get('removed') === '1';
	const subjects = await listSubjectsBackend(locals, locals.user.id, params.classId, {
		search,
		includeDeleted: showRemoved
	});
	const counts = await classCountsBackend(locals, params.classId);
	return { class: cls, subjects, counts, search, showRemoved };
};

export const actions: Actions = {
	add: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			const s = await addSubjectBackend(locals, locals.user.id, params.classId, {
				name: String(form.get('name') ?? ''),
				code: String(form.get('code') ?? '')
			});
			return { added: s };
		} catch (e) {
			return fail(400, {
				name: String(form.get('name') ?? ''),
				code: String(form.get('code') ?? ''),
				error: (e as Error).message
			});
		}
	},

	save: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await updateSubjectBackend(locals, locals.user.id, params.classId, String(form.get('id') ?? ''), {
				name: String(form.get('name') ?? ''),
				code: String(form.get('code') ?? '')
			});
			return { saved: true };
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
	},

	remove: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await setSubjectDeletedBackend(locals, locals.user.id, params.classId, String(form.get('id') ?? ''), true);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { removed: true };
	},

	restore: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await setSubjectDeletedBackend(locals, locals.user.id, params.classId, String(form.get('id') ?? ''), false);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { restored: true };
	}
};
