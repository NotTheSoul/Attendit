import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listClassesBackendAsync } from '$lib/server/class-store.js';
import { listSessions } from '$lib/server/local-db.js';

type SessionRow = {
	id: string;
	class_id: string;
	status: string;
	opens_at: string | null;
	closes_at: string | null;
	created_at: string;
	class_name: string;
	subject_name: string | null;
	response_count: number;
	sheet_export_id: string | null;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');

	const search = url.searchParams.get('q') ?? '';
	const status = url.searchParams.get('status') === 'archived' ? 'archived' : 'all';
	const sort = url.searchParams.get('sort') === 'name' ? 'name' : 'newest';

	const includeDeleted = status === 'archived';
	// Classes and sessions are independent queries — fire together so one
	// region round-trip covers both instead of two sequential ones.
	const [allClasses, sessionData] = await Promise.all([
		listClassesBackendAsync(locals, locals.user.id, { search, includeDeleted }),
		locals.supabaseConfigured && locals.supabase
			? locals.supabase
					.from('sessions')
					.select('id, class_id, status, opens_at, closes_at, created_at, sheet_export_id, classes!inner(name), subjects(name)')
					.is('deleted_at', null)
					.order('created_at', { ascending: false })
					.limit(10)
					.then((r) => r.data)
			: Promise.resolve(null)
	]);
	let classes = allClasses;
	if (status === 'archived') {
		classes = classes.filter((c) => c.deleted_at);
	} else {
		classes = classes.filter((c) => !c.deleted_at);
	}
	if (sort === 'name') {
		classes = [...classes].sort((a, b) => a.name.localeCompare(b.name));
	}

	let sessions: SessionRow[] = [];
	if (locals.supabaseConfigured && locals.supabase) {
		const sb = locals.supabase;
		const rows = (sessionData ?? []) as unknown as Array<{
			id: string;
			class_id: string;
			status: string;
			opens_at: string | null;
			closes_at: string | null;
			created_at: string;
			sheet_export_id: string | null;
			classes: { name: string };
			subjects: { name: string } | null;
		}>;
		let counts = new Map<string, number>();
		if (rows.length > 0) {
			const { data: respData } = await sb
				.from('responses')
				.select('session_id')
				.in('session_id', rows.map((s) => s.id));
			for (const r of (respData ?? []) as Array<{ session_id: string }>) {
				counts.set(r.session_id, (counts.get(r.session_id) ?? 0) + 1);
			}
		}
		sessions = rows.map((s) => ({
			id: s.id,
			class_id: s.class_id,
			status: s.status,
			opens_at: s.opens_at,
			closes_at: s.closes_at,
			created_at: s.created_at,
			class_name: s.classes.name,
			subject_name: s.subjects?.name ?? null,
			response_count: counts.get(s.id) ?? 0,
			sheet_export_id: s.sheet_export_id ?? null
		}));
	} else {
		sessions = listSessions(locals.user.id);
	}

	const liveClassIds = new Set(sessions.filter((s) => s.status === 'active').map((s) => s.class_id));

	return {
		configured: locals.supabaseConfigured,
		classes: classes.map((c) => ({ ...c, live: liveClassIds.has(c.id) })),
		activeSessions: sessions.filter((s) => s.status === 'active'),
		recentSessions: sessions,
		search,
		status,
		sort
	};
};
