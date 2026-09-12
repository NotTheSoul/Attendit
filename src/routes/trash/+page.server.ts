import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClassBackend, listClassesBackendAsync, setClassDeletedBackend } from '$lib/server/class-store.js';
import { setStudentDeletedBackend } from '$lib/server/roster-store.js';
import { setSubjectDeletedBackend } from '$lib/server/subject-store.js';
import { setSessionDeletedBackend } from '$lib/server/session-store.js';
import { localDb } from '$lib/server/local-db.js';

export type TrashGroup =
	| { kind: 'class'; id: string; classId: string; className: string; label: string; sub: string; deletedAt: string }
	| { kind: 'student' | 'subject' | 'session'; id: string; classId: string; className: string; label: string; sub: string; deletedAt: string };

async function removedItems(
	locals: { supabase: import('@supabase/supabase-js').SupabaseClient | null; supabaseConfigured: boolean },
	ownerId: string
): Promise<{ classes: TrashGroup[]; students: TrashGroup[]; subjects: TrashGroup[]; sessions: TrashGroup[] }> {
	const classes = (await listClassesBackendAsync(locals, ownerId, { includeDeleted: true })).filter((c) => c.deleted_at);
	const empty = { classes: [] as TrashGroup[], students: [] as TrashGroup[], subjects: [] as TrashGroup[], sessions: [] as TrashGroup[] };
	const out = {
		...empty,
		classes: classes.map((c) => ({
			kind: 'class' as const,
			id: c.id,
			classId: c.id,
			className: c.name,
			label: c.name,
			sub: [c.section, c.academic_year].filter(Boolean).join(' · '),
			deletedAt: c.deleted_at as string
		}))
	};
	const classIds = (await listClassesBackendAsync(locals, ownerId)).map((c) => c.id);

	if (!locals.supabaseConfigured || !locals.supabase) {
		const d = localDb();
		for (const cid of classIds) {
			const cname = (await getClassBackend(locals, ownerId, cid))?.name ?? '';
			for (const s of d.prepare(`SELECT id, full_name, registration_id, deleted_at FROM students WHERE class_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all(cid) as Array<{ id: string; full_name: string; registration_id: string; deleted_at: string }>) {
				out.students.push({ kind: 'student', id: s.id, classId: cid, className: cname, label: s.full_name, sub: s.registration_id, deletedAt: s.deleted_at });
			}
			for (const s of d.prepare(`SELECT id, name, code, deleted_at FROM subjects WHERE class_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all(cid) as Array<{ id: string; name: string; code: string | null; deleted_at: string }>) {
				out.subjects.push({ kind: 'subject', id: s.id, classId: cid, className: cname, label: s.name, sub: s.code ?? '', deletedAt: s.deleted_at });
			}
			for (const s of d.prepare(`SELECT s.id, s.deleted_at, sub.name AS subject_name FROM sessions s LEFT JOIN subjects sub ON sub.id = s.subject_id WHERE s.class_id = ? AND s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC`).all(cid) as Array<{ id: string; deleted_at: string; subject_name: string | null }>) {
				out.sessions.push({ kind: 'session', id: s.id, classId: cid, className: cname, label: s.subject_name ?? 'Session', sub: '', deletedAt: s.deleted_at });
			}
		}
		return out;
	}

	const sb = locals.supabase;
	for (const cid of classIds) {
		const cname = (await getClassBackend(locals, ownerId, cid))?.name ?? '';
		const { data: st } = await sb.from('students').select('id, full_name, registration_id, deleted_at').eq('class_id', cid).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
		for (const s of (st ?? []) as Array<{ id: string; full_name: string; registration_id: string; deleted_at: string }>) {
			out.students.push({ kind: 'student', id: s.id, classId: cid, className: cname, label: s.full_name, sub: s.registration_id, deletedAt: s.deleted_at });
		}
		const { data: su } = await sb.from('subjects').select('id, name, code, deleted_at').eq('class_id', cid).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
		for (const s of (su ?? []) as Array<{ id: string; name: string; code: string | null; deleted_at: string }>) {
			out.subjects.push({ kind: 'subject', id: s.id, classId: cid, className: cname, label: s.name, sub: s.code ?? '', deletedAt: s.deleted_at });
		}
		const { data: se } = await sb.from('sessions').select('id, deleted_at, subjects(name)').eq('class_id', cid).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
		for (const s of (se ?? []) as unknown as Array<{ id: string; deleted_at: string; subjects: { name: string } | null }>) {
			out.sessions.push({ kind: 'session', id: s.id, classId: cid, className: cname, label: s.subjects?.name ?? 'Session', sub: '', deletedAt: s.deleted_at });
		}
	}
	return out;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	return await removedItems(locals, locals.user.id);
};

export const actions: Actions = {
	restoreClass: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		try {
			await setClassDeletedBackend(locals, locals.user.id, String(form.get('id') ?? ''), false);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { restored: true };
	},
	restoreItem: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		const kind = String(form.get('kind') ?? '');
		const classId = String(form.get('classId') ?? '');
		const id = String(form.get('id') ?? '');
		try {
			if (kind === 'student') await setStudentDeletedBackend(locals, locals.user.id, classId, id, false);
			else if (kind === 'subject') await setSubjectDeletedBackend(locals, locals.user.id, classId, id, false);
			else if (kind === 'session') await setSessionDeletedBackend(locals, locals.user.id, classId, id, false);
			else return fail(400, { error: 'Unknown item type.' });
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { restored: true };
	}
};
