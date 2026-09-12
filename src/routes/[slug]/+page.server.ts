import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { localDb } from '$lib/server/local-db.js';
import { serviceLocals } from '$lib/server/supabase-admin.js';

// Public class entry: reveal only what's needed to check in —
// the class name and whether a session is currently live.
// Never the session code, roster, or counts.
//
// Runs under service_role on the server (students have no session):
// RLS grants `anon` nothing by design.
export const load: PageServerLoad = async ({ locals, params }) => {
	const slug = params.slug;
	const svc = serviceLocals();
	const db = svc.supabase ? svc : locals;

	if (!db.supabaseConfigured || !db.supabase) {
		const cls = localDb()
			.prepare(`SELECT id, name, section FROM classes WHERE join_slug = ? AND deleted_at IS NULL`)
			.get(slug) as { id: string; name: string; section: string | null } | undefined;
		if (!cls) throw error(404, 'This class link is not valid. Ask your host for the current link.');
		const live = localDb()
			.prepare(`SELECT id FROM sessions WHERE class_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1`)
			.get(cls.id) as { id: string } | undefined;
		return { joinSlug: slug, className: cls.name, section: cls.section, hasActive: !!live };
	}

	const { data: cls } = await db
		.supabase!.from('classes')
		.select('id, name, section')
		.eq('join_slug', slug)
		.is('deleted_at', null)
		.single();
	if (!cls) throw error(404, 'This class link is not valid. Ask your host for the current link.');
	const c = cls as { id: string; name: string; section: string | null };
	const { data: live } = await db
		.supabase!.from('sessions')
		.select('id')
		.eq('class_id', c.id)
		.eq('status', 'active')
		.is('deleted_at', null)
		.limit(1);
	return { joinSlug: slug, className: c.name, section: c.section, hasActive: (live?.length ?? 0) > 0 };
};
