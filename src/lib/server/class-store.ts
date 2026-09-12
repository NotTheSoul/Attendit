// Class data access with two backends:
// - Supabase/Postgres when configured (production)
// - SQLite when running locally (see local-db.ts)
// Callers pass `locals` and the owner id; this module picks the backend.
import { randomUUID } from 'node:crypto';
import { newJoinSlug } from '$lib/codes.js';
import { localDb } from './local-db.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ClassRecord = {
	id: string;
	owner_id: string;
	name: string;
	section: string | null;
	academic_year: string | null;
	join_slug: string;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
};

type Locals = { supabase: SupabaseClient | null; supabaseConfigured: boolean };

const isLocal = (locals: Locals) => !locals.supabaseConfigured || !locals.supabase;

export function listClassesBackend(
	locals: Locals,
	ownerId: string,
	opts: { search?: string; includeDeleted?: boolean } = {}
): ClassRecord[] {
	const search = (opts.search ?? '').trim().toLowerCase();
	if (isLocal(locals)) {
		const d = localDb();
		let rows = d
			.prepare(
				`SELECT * FROM classes WHERE owner_id = ?
				 ${opts.includeDeleted ? '' : 'AND deleted_at IS NULL'}
				 ORDER BY created_at DESC LIMIT 100`
			)
			.all(ownerId) as ClassRecord[];
		if (search) {
			rows = rows.filter((r) =>
				`${r.name} ${r.section ?? ''} ${r.academic_year ?? ''}`.toLowerCase().includes(search)
			);
		}
		return rows;
	}
	// Supabase path is async — handled by listClassesBackendAsync below.
	throw new Error('Use listClassesBackendAsync for Supabase.');
}

export async function listClassesBackendAsync(
	locals: Locals,
	ownerId: string,
	opts: { search?: string; includeDeleted?: boolean } = {}
): Promise<ClassRecord[]> {
	if (isLocal(locals)) return listClassesBackend(locals, ownerId, opts);
	const sb = locals.supabase!;
	let q = sb
		.from('classes')
		.select('*')
		.eq('owner_id', ownerId)
		.order('created_at', { ascending: false })
		.limit(100);
	if (!opts.includeDeleted) q = q.is('deleted_at', null);
	const search = (opts.search ?? '').trim();
	if (search) q = q.ilike('name', `%${search}%`);
	const { data, error } = await q;
	if (error) throw new Error(error.message);
	return (data ?? []) as ClassRecord[];
}

export async function createClassBackend(
	locals: Locals,
	ownerId: string,
	input: { name: string; section?: string; academic_year?: string }
): Promise<ClassRecord> {
	const name = input.name.trim();
	if (!name) throw new Error('Class name is required.');
	if (name.length > 120) throw new Error('Class name must be 120 characters or fewer.');

	if (isLocal(locals)) {
		const d = localDb();
		for (let attempt = 0; attempt < 5; attempt++) {
			const slug = newJoinSlug();
			try {
				const id = randomUUID();
				const now = new Date().toISOString();
				d.prepare(
					`INSERT INTO classes (id, owner_id, name, section, academic_year, join_slug, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
				).run(
					id,
					ownerId,
					name,
					input.section?.trim() || null,
					input.academic_year?.trim() || null,
					slug,
					now,
					now
				);
				return d.prepare(`SELECT * FROM classes WHERE id = ?`).get(id) as ClassRecord;
			} catch {
				// slug collision — retry with a fresh one
			}
		}
		throw new Error('Could not generate a unique join link. Try again.');
	}

	const sb = locals.supabase!;
	for (let attempt = 0; attempt < 5; attempt++) {
		const slug = newJoinSlug();
		const { data, error } = await sb
			.from('classes')
			.insert({
				owner_id: ownerId,
				name,
				section: input.section?.trim() || null,
				academic_year: input.academic_year?.trim() || null,
				join_slug: slug
			})
			.select('*')
			.single();
		if (!error && data) return data as ClassRecord;
	}
	throw new Error('Could not create the class. Try again.');
}

export async function getClassBackend(
	locals: Locals,
	ownerId: string,
	classId: string
): Promise<ClassRecord | null> {
	if (isLocal(locals)) {
		const row = localDb().prepare(`SELECT * FROM classes WHERE id = ?`).get(classId) as
			| ClassRecord
			| undefined;
		if (!row || row.owner_id !== ownerId) return null;
		return row;
	}
	const { data } = await locals.supabase!
		.from('classes')
		.select('*')
		.eq('id', classId)
		.eq('owner_id', ownerId)
		.single();
	return (data as ClassRecord | null) ?? null;
}

export async function updateClassBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	input: { name: string; section?: string; academic_year?: string }
): Promise<ClassRecord> {
	const name = input.name.trim();
	if (!name) throw new Error('Class name is required.');
	const current = await getClassBackend(locals, ownerId, classId);
	if (!current) throw new Error('Class not found.');

	if (isLocal(locals)) {
		const d = localDb();
		const now = new Date().toISOString();
		d.prepare(
			`UPDATE classes SET name = ?, section = ?, academic_year = ?, updated_at = ? WHERE id = ?`
		).run(name, input.section?.trim() || null, input.academic_year?.trim() || null, now, classId);
		return d.prepare(`SELECT * FROM classes WHERE id = ?`).get(classId) as ClassRecord;
	}
	const { data, error } = await locals.supabase!
		.from('classes')
		.update({
			name,
			section: input.section?.trim() || null,
			academic_year: input.academic_year?.trim() || null,
			updated_at: new Date().toISOString()
		})
		.eq('id', classId)
		.eq('owner_id', ownerId)
		.select('*')
		.single();
	if (error || !data) throw new Error(error?.message ?? 'Could not save the class.');
	return data as ClassRecord;
}

export async function setClassDeletedBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	deleted: boolean
): Promise<void> {
	const current = await getClassBackend(locals, ownerId, classId);
	if (!current) throw new Error('Class not found.');
	const deletedAt = deleted ? new Date().toISOString() : null;
	if (isLocal(locals)) {
		localDb()
			.prepare(`UPDATE classes SET deleted_at = ?, updated_at = ? WHERE id = ?`)
			.run(deletedAt, new Date().toISOString(), classId);
		return;
	}
	const { error } = await locals.supabase!
		.from('classes')
		.update({ deleted_at: deletedAt })
		.eq('id', classId)
		.eq('owner_id', ownerId);
	if (error) throw new Error(error.message);
}

export async function regenerateSlugBackend(
	locals: Locals,
	ownerId: string,
	classId: string
): Promise<ClassRecord> {
	const current = await getClassBackend(locals, ownerId, classId);
	if (!current) throw new Error('Class not found.');
	if (isLocal(locals)) {
		const d = localDb();
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				const slug = newJoinSlug();
				d.prepare(`UPDATE classes SET join_slug = ?, updated_at = ? WHERE id = ?`).run(
					slug,
					new Date().toISOString(),
					classId
				);
				return d.prepare(`SELECT * FROM classes WHERE id = ?`).get(classId) as ClassRecord;
			} catch {
				// collision — retry
			}
		}
		throw new Error('Could not generate a unique join link. Try again.');
	}
	for (let attempt = 0; attempt < 5; attempt++) {
		const slug = newJoinSlug();
		const { data, error } = await locals.supabase!
			.from('classes')
			.update({ join_slug: slug, updated_at: new Date().toISOString() })
			.eq('id', classId)
			.eq('owner_id', ownerId)
			.select('*')
			.single();
		if (!error && data) return data as ClassRecord;
	}
	throw new Error('Could not regenerate the join link. Try again.');
}

export type ClassCounts = { students: number; subjects: number; sessions: number; activeSessions: number };

export async function classCountsBackend(locals: Locals, classId: string): Promise<ClassCounts> {
	if (isLocal(locals)) {
		const d = localDb();
		const n = (table: string, extra = '') =>
			(d.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE class_id = ? AND deleted_at IS NULL ${extra}`).get(classId) as { n: number }).n;
		const active = (
			d.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE class_id = ? AND status = 'active' AND deleted_at IS NULL`).get(classId) as { n: number }
		).n;
		return { students: n('students'), subjects: n('subjects'), sessions: n('sessions'), activeSessions: active };
	}
	const sb = locals.supabase!;
	const count = async (table: string) => {
		const { count: n } = await sb
			.from(table)
			.select('id', { count: 'exact', head: true })
			.eq('class_id', classId)
			.is('deleted_at', null);
		return n ?? 0;
	};
	const { count: active } = await sb
		.from('sessions')
		.select('id', { count: 'exact', head: true })
		.eq('class_id', classId)
		.eq('status', 'active')
		.is('deleted_at', null);
	return {
		students: await count('students'),
		subjects: await count('subjects'),
		sessions: await count('sessions'),
		activeSessions: active ?? 0
	};
}
