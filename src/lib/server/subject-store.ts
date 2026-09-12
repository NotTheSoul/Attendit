// Subject management: Supabase when configured, SQLite locally.
import { randomUUID } from 'node:crypto';
import { localDb } from './local-db.js';
import { getClassBackend } from './class-store.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SubjectRecord = {
	id: string;
	class_id: string;
	name: string;
	code: string | null;
	deleted_at: string | null;
	created_at: string;
};

type Locals = { supabase: SupabaseClient | null; supabaseConfigured: boolean };
const isLocal = (locals: Locals) => !locals.supabaseConfigured || !locals.supabase;

async function ownClass(locals: Locals, ownerId: string, classId: string) {
	const cls = await getClassBackend(locals, ownerId, classId);
	if (!cls) throw new Error('Class not found.');
	return cls;
}

function cleanName(name: string): string {
	const n = name.trim().replace(/\s+/g, ' ');
	if (!n) throw new Error('Subject name is required.');
	if (n.length > 120) throw new Error('Subject name must be 120 characters or fewer.');
	return n;
}

export async function listSubjectsBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	opts: { search?: string; includeDeleted?: boolean } = {}
): Promise<SubjectRecord[]> {
	await ownClass(locals, ownerId, classId);
	const search = (opts.search ?? '').trim().toLowerCase();
	if (isLocal(locals)) {
		let rows = localDb()
			.prepare(
				`SELECT * FROM subjects WHERE class_id = ?
				 ${opts.includeDeleted ? '' : 'AND deleted_at IS NULL'}
				 ORDER BY name COLLATE NOCASE`
			)
			.all(classId) as SubjectRecord[];
		if (search) {
			rows = rows.filter((r) => `${r.name} ${r.code ?? ''}`.toLowerCase().includes(search));
		}
		return rows;
	}
	let q = locals.supabase!.from('subjects').select('*').eq('class_id', classId).order('name');
	if (!opts.includeDeleted) q = q.is('deleted_at', null);
	if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
	const { data, error } = await q;
	if (error) throw new Error(error.message);
	return (data ?? []) as SubjectRecord[];
}

export async function addSubjectBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	input: { name: string; code?: string }
): Promise<SubjectRecord> {
	await ownClass(locals, ownerId, classId);
	const name = cleanName(input.name);
	const code = input.code?.trim().slice(0, 40) || null;
	if (isLocal(locals)) {
		const d = localDb();
		const id = randomUUID();
		d.prepare(`INSERT INTO subjects (id, class_id, name, code) VALUES (?, ?, ?, ?)`).run(
			id,
			classId,
			name,
			code
		);
		return d.prepare(`SELECT * FROM subjects WHERE id = ?`).get(id) as SubjectRecord;
	}
	const { data, error } = await locals
		.supabase!.from('subjects')
		.insert({ class_id: classId, name, code })
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data as SubjectRecord;
}

export async function updateSubjectBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	subjectId: string,
	input: { name: string; code?: string }
): Promise<SubjectRecord> {
	await ownClass(locals, ownerId, classId);
	const name = cleanName(input.name);
	const code = input.code?.trim().slice(0, 40) || null;
	if (isLocal(locals)) {
		const d = localDb();
		const info = d
			.prepare(`UPDATE subjects SET name = ?, code = ? WHERE id = ? AND class_id = ?`)
			.run(name, code, subjectId, classId);
		if (info.changes === 0) throw new Error('Subject not found.');
		return d.prepare(`SELECT * FROM subjects WHERE id = ?`).get(subjectId) as SubjectRecord;
	}
	const { data, error } = await locals
		.supabase!.from('subjects')
		.update({ name, code })
		.eq('id', subjectId)
		.eq('class_id', classId)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('Subject not found.');
	return data as SubjectRecord;
}

/** Permanent delete (sessions referencing it keep NULL subject). No recovery. */
export async function hardDeleteSubjectBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	subjectId: string
): Promise<void> {
	await ownClass(locals, ownerId, classId);
	if (isLocal(locals)) {
		const info = localDb()
			.prepare(`DELETE FROM subjects WHERE id = ? AND class_id = ?`)
			.run(subjectId, classId);
		if (info.changes === 0) throw new Error('Subject not found.');
		return;
	}
	const { error, count } = await locals
		.supabase!.from('subjects')
		.delete({ count: 'exact' })
		.eq('id', subjectId)
		.eq('class_id', classId);
	if (error) throw new Error(error.message);
	if ((count ?? 0) === 0) throw new Error('Subject not found.');
}

export async function setSubjectDeletedBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	subjectId: string,
	deleted: boolean
): Promise<void> {
	await ownClass(locals, ownerId, classId);
	const deletedAt = deleted ? new Date().toISOString() : null;
	if (isLocal(locals)) {
		const info = localDb()
			.prepare(`UPDATE subjects SET deleted_at = ? WHERE id = ? AND class_id = ?`)
			.run(deletedAt, subjectId, classId);
		if (info.changes === 0) throw new Error('Subject not found.');
		return;
	}
	const { error, count } = await locals
		.supabase!.from('subjects')
		.update({ deleted_at: deletedAt }, { count: 'exact' })
		.eq('id', subjectId)
		.eq('class_id', classId);
	if (error) throw new Error(error.message);
	if ((count ?? 0) === 0) throw new Error('Subject not found.');
}
