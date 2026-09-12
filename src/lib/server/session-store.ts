// Session lifecycle data access: Supabase when configured, SQLite locally.
import { randomUUID } from 'node:crypto';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '$env/dynamic/public';
import { newSessionCode } from '$lib/codes.js';
import { clampCodeLen, clampRadius } from './geo.js';
import { localDb } from './local-db.js';
import { getClassBackend } from './class-store.js';
import { logEvent } from './logger.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionRecord = {
	id: string;
	class_id: string;
	subject_id: string | null;
	subject_name?: string | null;
	session_code: string;
	radius_meters: number;
	status: 'draft' | 'active' | 'closed';
	opens_at: string | null;
	closes_at: string | null;
	sheet_export_id: string | null;
	deleted_at: string | null;
	created_at: string;
};

type Locals = { supabase: SupabaseClient | null; supabaseConfigured: boolean };
const isLocal = (locals: Locals) => !locals.supabaseConfigured || !locals.supabase;

export type CreateSessionInput = {
	subject_id?: string;
	radius_meters?: unknown;
	code_length?: unknown;
};

export async function createSessionBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	input: CreateSessionInput
): Promise<SessionRecord> {
	const cls = await getClassBackend(locals, ownerId, classId);
	if (!cls) throw new Error('Class not found.');
	if (cls.deleted_at) throw new Error('This class is archived. Restore it first.');

	const radius_meters = clampRadius(input.radius_meters);
	const codeLen = clampCodeLen(input.code_length);

	// Subject must belong to the class when given.
	let subject_id: string | null = null;
	if (input.subject_id) {
		if (isLocal(locals)) {
			const s = localDb()
				.prepare(`SELECT id FROM subjects WHERE id = ? AND class_id = ? AND deleted_at IS NULL`)
				.get(input.subject_id, classId) as { id: string } | undefined;
			if (!s) throw new Error('Subject not found in this class.');
			subject_id = s.id;
		} else {
			const { data, error } = await locals
				.supabase!.from('subjects')
				.select('id')
				.eq('id', input.subject_id)
				.eq('class_id', classId)
				.is('deleted_at', null)
				.single();
			if (error || !data) throw new Error('Subject not found in this class.');
			subject_id = data.id;
		}
	}

	// The code identifies the session within the class on the student side,
	// so it must not collide with another ACTIVE session of the same class.
	for (let attempt = 0; attempt < 8; attempt++) {
		const session_code = newSessionCode(codeLen);
		const clash = await activeCodeClash(locals, classId, session_code);
		if (clash) continue;
		const now = new Date();
		// No timeout: the session stays live until the host closes it.
		// closes_at is set at close time (see closeSessionBackend).
		if (isLocal(locals)) {
			const d = localDb();
			const id = randomUUID();
			d.prepare(
				`INSERT INTO sessions (id, class_id, subject_id, session_code, radius_meters, status, opens_at, closes_at)
				 VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
			).run(id, classId, subject_id, session_code, radius_meters, now.toISOString(), null);
			logEvent('session_started', { session_id: id, class_id: classId });
			return (await getSessionBackend(locals, ownerId, classId, id)) as SessionRecord;
		}
		const { data, error } = await locals
			.supabase!.from('sessions')
			.insert({
				class_id: classId,
				subject_id,
				session_code,
				radius_meters,
				status: 'active',
				opens_at: now.toISOString(),
				closes_at: null
			})
			.select('*')
			.single();
		if (error) throw new Error(error.message);
		logEvent('session_started', { session_id: (data as SessionRecord).id, class_id: classId });
		return withSubjectName(locals, data as SessionRecord);
	}
	throw new Error('Could not mint a unique session code. Try again.');
}

async function activeCodeClash(
	locals: Locals,
	classId: string,
	code: string
): Promise<boolean> {
	if (isLocal(locals)) {
		const row = localDb()
			.prepare(
				`SELECT id FROM sessions WHERE class_id = ? AND session_code = ? AND status = 'active' AND deleted_at IS NULL`
			)
			.get(classId, code) as { id: string } | undefined;
		return !!row;
	}
	const { data } = await locals
		.supabase!.from('sessions')
		.select('id')
		.eq('class_id', classId)
		.eq('session_code', code)
		.eq('status', 'active')
		.is('deleted_at', null)
		.limit(1);
	return (data?.length ?? 0) > 0;
}

async function withSubjectName(locals: Locals, s: SessionRecord): Promise<SessionRecord> {
	if (!s.subject_id) return { ...s, subject_name: null };
	if (isLocal(locals)) {
		const row = localDb().prepare(`SELECT name FROM subjects WHERE id = ?`).get(s.subject_id) as
			| { name: string }
			| undefined;
		return { ...s, subject_name: row?.name ?? null };
	}
	const { data } = await locals.supabase!.from('subjects').select('name').eq('id', s.subject_id).single();
	return { ...s, subject_name: (data as { name: string } | null)?.name ?? null };
}

export async function getSessionBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	sessionId: string
): Promise<SessionRecord | null> {
	const cls = await getClassBackend(locals, ownerId, classId);
	if (!cls) return null;
	if (isLocal(locals)) {
		const row = localDb().prepare(`SELECT * FROM sessions WHERE id = ? AND class_id = ?`).get(
			sessionId,
			classId
		) as SessionRecord | undefined;
		if (!row) return null;
		const sub = row.subject_id
			? (localDb().prepare(`SELECT name FROM subjects WHERE id = ?`).get(row.subject_id) as { name: string } | undefined)
			: undefined;
		return { ...row, subject_name: sub?.name ?? null };
	}
	const { data } = await locals
		.supabase!.from('sessions')
		.select('*, subjects(name)')
		.eq('id', sessionId)
		.eq('class_id', classId)
		.single();
	if (!data) return null;
	const row = data as SessionRecord & { subjects: { name: string } | null };
	return { ...row, subject_name: row.subjects?.name ?? null };
}

export async function listSessionsBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	opts: { includeDeleted?: boolean } = {}
): Promise<SessionRecord[]> {
	const cls = await getClassBackend(locals, ownerId, classId);
	if (!cls) throw new Error('Class not found.');
	if (isLocal(locals)) {
		const rows = localDb()
			.prepare(
				`SELECT s.*, sub.name AS subject_name FROM sessions s
				 LEFT JOIN subjects sub ON sub.id = s.subject_id
				 WHERE s.class_id = ? ${opts.includeDeleted ? '' : 'AND s.deleted_at IS NULL'}
				 ORDER BY s.created_at DESC LIMIT 100`
			)
			.all(classId) as SessionRecord[];
		return rows;
	}
	const { data, error } = await locals
		.supabase!.from('sessions')
		.select('*, subjects(name)')
		.eq('class_id', classId)
		.order('created_at', { ascending: false })
		.limit(100);
	if (error) throw new Error(error.message);
	return ((data ?? []) as Array<SessionRecord & { subjects: { name: string } | null }>).map((r) => ({
		...r,
		subject_name: r.subjects?.name ?? null
	}));
}

/** Soft-delete (archive) or restore a session. Active sessions must be
 *  closed first — archiving a live session would strand students mid-flow. */
export async function setSessionDeletedBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	sessionId: string,
	deleted: boolean
): Promise<void> {
	const s = await getSessionBackend(locals, ownerId, classId, sessionId);
	if (!s) throw new Error('Session not found.');
	if (deleted && s.status === 'active') {
		throw new Error('Close the live session first — archiving mid-flow would strand students.');
	}
	const deletedAt = deleted ? new Date().toISOString() : null;
	if (isLocal(locals)) {
		localDb()
			.prepare(`UPDATE sessions SET deleted_at = ? WHERE id = ?`)
			.run(deletedAt, sessionId);
		return;
	}
	const { error } = await locals
		.supabase!.from('sessions')
		.update({ deleted_at: deletedAt })
		.eq('id', sessionId);
	if (error) throw new Error(error.message);
}

export async function closeSessionBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	sessionId: string
): Promise<SessionRecord> {
	const s = await getSessionBackend(locals, ownerId, classId, sessionId);
	if (!s) throw new Error('Session not found.');
	if (s.status === 'closed') return s;
	const closesAt = new Date().toISOString();
	if (isLocal(locals)) {
		localDb()
			.prepare(`UPDATE sessions SET status = 'closed', closes_at = ? WHERE id = ?`)
			.run(closesAt, sessionId);
		logEvent('session_closed', { session_id: sessionId, class_id: classId });
		return (await getSessionBackend(locals, ownerId, classId, sessionId)) as SessionRecord;
	}
	const { error } = await locals
		.supabase!.from('sessions')
		.update({ status: 'closed', closes_at: closesAt })
		.eq('id', sessionId);
	if (error) throw new Error(error.message);
	logEvent('session_closed', { session_id: sessionId, class_id: classId });
	return (await getSessionBackend(locals, ownerId, classId, sessionId)) as SessionRecord;
}

/** Public join URL encoded in the QR — the session code NEVER travels in links. */
export function joinUrlFor(joinSlug: string, token?: string): string {
	const origin = (env.PUBLIC_APP_ORIGIN ?? '').replace(/\/$/, '') || 'http://localhost:5173';
	const base = `${origin}/${encodeURIComponent(joinSlug)}`;
	return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}

/** Server-rendered QR SVG (crisp on projectors, no client JS needed). */
export async function qrSvgFor(url: string): Promise<string> {
	return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 320 });
}

// ---------------------------------------------------------------------------
// QR attendance tokens: proof of line-of-sight, not a code.
// The QR is displayed on the host screen in the room — only someone physically
// present can scan it within its short lifetime. The session CODE is never
// encoded (a photographed/forwarded QR must not leak the code).
// Token = base64url(sessionId "." exp "." hmac). Verified server-side.
// ---------------------------------------------------------------------------

export const QR_TOKEN_TTL_SEC = 90;

function qrSecret(): Buffer {
	const s = process.env.APP_SECRET;
	if (s) return Buffer.from(s);
	// Dev fallback: per-boot secret (tokens die with restarts — fine locally).
	return (globalThis as unknown as { __attendit_qr?: Buffer }).__attendit_qr ??=
		randomBytes(32);
}

/** Mint a short-lived QR token for a session. */
export function qrTokenFor(sessionId: string): string {
	const exp = Math.floor(Date.now() / 1000) + QR_TOKEN_TTL_SEC;
	const payload = `${sessionId}.${exp}`;
	const sig = createHmac('sha256', qrSecret()).update(payload).digest('base64url');
	return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

/** Verify a QR token. Returns the session id, or null if bad/expired. */
export function verifyQrToken(token: string): string | null {
	try {
		const raw = Buffer.from(token, 'base64url').toString('utf8');
		const [sessionId, exp, sig] = raw.split('.');
		if (!sessionId || !exp || !sig) return null;
		if (Number(exp) * 1000 < Date.now()) return null;
		const expected = createHmac('sha256', qrSecret()).update(`${sessionId}.${exp}`).digest('base64url');
		const a = Buffer.from(sig);
		const b = Buffer.from(expected);
		if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
		return sessionId;
	} catch {
		return null;
	}
}
