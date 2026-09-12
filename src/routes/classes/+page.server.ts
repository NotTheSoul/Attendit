import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createClassBackend,
	listClassesBackendAsync,
	setClassDeletedBackend
} from '$lib/server/class-store.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const search = url.searchParams.get('q') ?? '';
	const showArchived = url.searchParams.get('archived') === '1';
	try {
		const classes = await listClassesBackendAsync(locals, locals.user.id, {
			search,
			includeDeleted: showArchived
		});
		return { classes, search, showArchived, local: !locals.supabaseConfigured };
	} catch (e) {
		return { classes: [], search, showArchived, local: !locals.supabaseConfigured, error: (e as Error).message };
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const section = String(form.get('section') ?? '');
		const academic_year = String(form.get('academic_year') ?? '');
		try {
			const created = await createClassBackend(locals, locals.user.id, {
				name,
				section,
				academic_year
			});
			// Stay on the list and let it refresh: redirecting away is what
			// made success invisible (and caused repeat clicks → duplicates).
			return { created: { id: created.id, name: created.name } };
		} catch (e) {
			if (e instanceof Response) throw e;
			return fail(400, { name, section, academic_year, error: (e as Error).message });
		}
	},

	archive: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		try {
			await setClassDeletedBackend(locals, locals.user.id, id, true);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { archived: true };
	},

	restore: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		try {
			await setClassDeletedBackend(locals, locals.user.id, id, false);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { restored: true };
	}
};
