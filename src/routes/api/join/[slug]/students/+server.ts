import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { localDb } from '$lib/server/local-db.js';
import { serviceLocals } from '$lib/server/supabase-admin.js';

// Public identity typeahead: match by name or registration ID prefix.
// Deliberately minimal: ≥2 chars, max 10 rows, nothing beyond what's needed
// to pick yourself out of the room. Runs under service_role on the server —
// RLS grants `anon` nothing by design.
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const slug = params.slug;
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json({ students: [] });

	const svc = serviceLocals();
	const db = svc.supabase ? svc : locals;

	if (!db.supabaseConfigured || !db.supabase) {
		const cls = localDb()
			.prepare(`SELECT id FROM classes WHERE join_slug = ? AND deleted_at IS NULL`)
			.get(slug) as { id: string } | undefined;
		if (!cls) throw error(404, 'Class link not found.');
		const like = `%${q}%`;
		const rows = localDb()
			.prepare(
				`SELECT id, full_name, registration_id FROM students
				 WHERE class_id = ? AND deleted_at IS NULL
				 AND (full_name LIKE ? COLLATE NOCASE OR registration_id LIKE ? COLLATE NOCASE)
				 ORDER BY full_name COLLATE NOCASE LIMIT 10`
			)
			.all(cls.id, like, like);
		return json({ students: rows });
	}

	const { data: cls } = await db
		.supabase!.from('classes')
		.select('id')
		.eq('join_slug', slug)
		.is('deleted_at', null)
		.single();
	if (!cls) throw error(404, 'Class link not found.');
	const { data, error: err } = await db
		.supabase!.from('students')
		.select('id, full_name, registration_id')
		.eq('class_id', (cls as { id: string }).id)
		.is('deleted_at', null)
		.or(`full_name.ilike.%${q}%,registration_id.ilike.%${q}%`)
		.order('full_name')
		.limit(10);
	if (err) throw error(500, 'Search failed. Try again.');
	return json({ students: data ?? [] });
};
