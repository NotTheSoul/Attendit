// Student roster data access: Supabase when configured, SQLite locally.
// Registration IDs are unique *within* a class, not globally.
import { randomUUID } from 'node:crypto';
import { localDb } from './local-db.js';
import { getClassBackend } from './class-store.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type StudentRecord = {
	id: string;
	class_id: string;
	full_name: string;
	registration_id: string;
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
	if (!n) throw new Error('Student name is required.');
	if (n.length > 120) throw new Error('Student name must be 120 characters or fewer.');
	return n;
}

function cleanReg(reg: string): string {
	const r = reg.trim();
	if (!r) throw new Error('Registration ID is required.');
	if (r.length > 60) throw new Error('Registration ID must be 60 characters or fewer.');
	return r;
}

export async function listStudentsBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	opts: { search?: string; includeDeleted?: boolean } = {}
): Promise<StudentRecord[]> {
	await ownClass(locals, ownerId, classId);
	const search = (opts.search ?? '').trim().toLowerCase();

	if (isLocal(locals)) {
		let rows = localDb()
			.prepare(
				`SELECT * FROM students WHERE class_id = ?
				 ${opts.includeDeleted ? '' : 'AND deleted_at IS NULL'}
				 ORDER BY full_name COLLATE NOCASE`
			)
			.all(classId) as StudentRecord[];
		if (search) {
			rows = rows.filter((r) =>
				`${r.full_name} ${r.registration_id}`.toLowerCase().includes(search)
			);
		}
		return rows;
	}

	let q = locals
		.supabase!.from('students')
		.select('*')
		.eq('class_id', classId)
		.order('full_name');
	if (!opts.includeDeleted) q = q.is('deleted_at', null);
	if (search) q = q.or(`full_name.ilike.%${search}%,registration_id.ilike.%${search}%`);
	const { data, error } = await q;
	if (error) throw new Error(error.message);
	return (data ?? []) as StudentRecord[];
}

export async function addStudentBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	input: { full_name: string; registration_id: string }
): Promise<StudentRecord> {
	await ownClass(locals, ownerId, classId);
	const full_name = cleanName(input.full_name);
	const registration_id = cleanReg(input.registration_id);

	if (isLocal(locals)) {
		const d = localDb();
		const dup = d
			.prepare(
				`SELECT id FROM students WHERE class_id = ? AND registration_id = ? AND deleted_at IS NULL`
			)
			.get(classId, registration_id) as { id: string } | undefined;
		if (dup) throw new Error(`Registration ID “${registration_id}” is already on this roster.`);
		const id = randomUUID();
		try {
			d.prepare(
				`INSERT INTO students (id, class_id, full_name, registration_id) VALUES (?, ?, ?, ?)`
			).run(id, classId, full_name, registration_id);
		} catch {
			throw new Error(`Registration ID “${registration_id}” is already on this roster.`);
		}
		return d.prepare(`SELECT * FROM students WHERE id = ?`).get(id) as StudentRecord;
	}

	const { data, error } = await locals
		.supabase!.from('students')
		.insert({ class_id: classId, full_name, registration_id })
		.select('*')
		.single();
	if (error) {
		if (error.code === '23505')
			throw new Error(`Registration ID “${registration_id}” is already on this roster.`);
		throw new Error(error.message);
	}
	return data as StudentRecord;
}

export async function updateStudentBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	studentId: string,
	input: { full_name: string; registration_id: string }
): Promise<StudentRecord> {
	await ownClass(locals, ownerId, classId);
	const full_name = cleanName(input.full_name);
	const registration_id = cleanReg(input.registration_id);

	if (isLocal(locals)) {
		const d = localDb();
		const current = d.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId) as
			| StudentRecord
			| undefined;
		if (!current || current.class_id !== classId) throw new Error('Student not found.');
		const dup = d
			.prepare(
				`SELECT id FROM students WHERE class_id = ? AND registration_id = ? AND id != ? AND deleted_at IS NULL`
			)
			.get(classId, registration_id, studentId) as { id: string } | undefined;
		if (dup) throw new Error(`Registration ID “${registration_id}” is already on this roster.`);
		d.prepare(`UPDATE students SET full_name = ?, registration_id = ? WHERE id = ?`).run(
			full_name,
			registration_id,
			studentId
		);
		return d.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId) as StudentRecord;
	}

	const { data, error } = await locals
		.supabase!.from('students')
		.update({ full_name, registration_id })
		.eq('id', studentId)
		.eq('class_id', classId)
		.select('*')
		.single();
	if (error) {
		if (error.code === '23505')
			throw new Error(`Registration ID “${registration_id}” is already on this roster.`);
		throw new Error(error.message);
	}
	if (!data) throw new Error('Student not found.');
	return data as StudentRecord;
}

export async function setStudentDeletedBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	studentId: string,
	deleted: boolean
): Promise<void> {
	await ownClass(locals, ownerId, classId);
	const deletedAt = deleted ? new Date().toISOString() : null;
	if (isLocal(locals)) {
		const d = localDb();
		if (!deleted) {
			// Restoring onto a reg ID that was re-used meanwhile must explain
			// itself instead of surfacing a raw UNIQUE constraint failure.
			const row = d.prepare(`SELECT registration_id FROM students WHERE id = ?`).get(studentId) as
				| { registration_id: string }
				| undefined;
			if (!row) throw new Error('Student not found.');
			const clash = d
				.prepare(
					`SELECT id FROM students WHERE class_id = ? AND registration_id = ? AND id != ? AND deleted_at IS NULL`
				)
				.get(classId, row.registration_id, studentId) as { id: string } | undefined;
			if (clash)
				throw new Error(
					`Cannot restore: registration ID “${row.registration_id}” is already on this roster.`
				);
		}
		const info = d
			.prepare(`UPDATE students SET deleted_at = ? WHERE id = ? AND class_id = ?`)
			.run(deletedAt, studentId, classId);
		if (info.changes === 0) throw new Error('Student not found.');
		return;
	}
	const { error, count } = await locals
		.supabase!.from('students')
		.update({ deleted_at: deletedAt }, { count: 'exact' })
		.eq('id', studentId)
		.eq('class_id', classId);
	if (error) throw new Error(error.message);
	if ((count ?? 0) === 0) throw new Error('Student not found.');
}

/** Permanent delete (responses cascade). No recovery. */
export async function hardDeleteStudentBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	studentId: string
): Promise<void> {
	await ownClass(locals, ownerId, classId);
	if (isLocal(locals)) {
		const info = localDb()
			.prepare(`DELETE FROM students WHERE id = ? AND class_id = ?`)
			.run(studentId, classId);
		if (info.changes === 0) throw new Error('Student not found.');
		return;
	}
	const { error, count } = await locals
		.supabase!.from('students')
		.delete({ count: 'exact' })
		.eq('id', studentId)
		.eq('class_id', classId);
	if (error) throw new Error(error.message);
	if ((count ?? 0) === 0) throw new Error('Student not found.');
}

export type ImportResult = {
	added: number;
	skipped: number;
	errors: Array<{ line: number; reason: string }>;
};

/** Parse pasted/CSV roster text. Accepts `Name, REG` or `Name;REG` per line,
 *  skips blank lines and a single header row, reports per-line outcomes. */
export function parseRosterText(text: string): Array<{ full_name: string; registration_id: string; line: number }> {
	const rows: Array<{ full_name: string; registration_id: string; line: number }> = [];
	const lines = text.split(/\r?\n/);
	lines.forEach((raw, i) => {
		const line = i + 1;
		const trimmed = raw.trim();
		if (!trimmed) return;
		const parts = trimmed.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
		// Header detection on the first non-blank line only
		if (rows.length === 0 && line <= 3 && /name/i.test(parts[0] ?? '') && parts.length >= 2 && /reg|id|roll|no/i.test(parts[1])) {
			return;
		}
		if (parts.length < 2) {
			rows.push({ full_name: trimmed, registration_id: '', line });
			return;
		}
		rows.push({ full_name: parts[0], registration_id: parts[1], line });
	});
	return rows;
}

export async function importStudentsBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	text: string
): Promise<ImportResult> {
	const parsed = parseRosterText(text);
	const result: ImportResult = { added: 0, skipped: 0, errors: [] };
	if (parsed.length === 0) throw new Error('Nothing to import. Paste one student per line as “Full Name, REG123”.');
	if (parsed.length > 2000) throw new Error('Limit imports to 2,000 rows at a time.');
	const seen = new Set<string>();
	for (const row of parsed) {
		try {
			const name = cleanName(row.full_name);
			const reg = cleanReg(row.registration_id);
			const key = reg.toLowerCase();
			if (seen.has(key)) {
				result.skipped++;
				continue;
			}
			seen.add(key);
			await addStudentBackend(locals, ownerId, classId, { full_name: name, registration_id: reg });
			result.added++;
		} catch (e) {
			const msg = (e as Error).message;
			if (msg.includes('already on this roster')) {
				result.skipped++;
			} else {
				result.errors.push({ line: row.line, reason: msg });
			}
		}
	}
	return result;
}
