// Attendance responses: session-scoped reads for the host feed.
// Writes happen only through the validated submission endpoint (next item),
// never direct client inserts — RLS mirrors that (no client INSERT policy).
import { randomUUID } from 'node:crypto';
import { localDb } from './local-db.js';
import { getSessionBackend, verifyQrToken } from './session-store.js';
import { accuracyOk, effectiveRadiusFor, FALLBACK_MAX_ACCURACY_M, haversineM } from './geo.js';
import { ephGet, ephSet, hostLocKey, type HostLoc } from './ephemeral.js';
import { logEvent } from './logger.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type FeedRow = {
	id: string;
	submitted_at: string;
	method: string | null;
	distance_from_host_m: number | null;
	accuracy_m: number | null;
	status: string;
	student_name: string;
	registration_id: string;
};

type Locals = { supabase: SupabaseClient | null; supabaseConfigured: boolean };
const isLocal = (locals: Locals) => !locals.supabaseConfigured || !locals.supabase;

export async function listResponsesBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	sessionId: string,
	limit = 200
): Promise<FeedRow[]> {
	const s = await getSessionBackend(locals, ownerId, classId, sessionId);
	if (!s) throw new Error('Session not found.');

	if (isLocal(locals)) {
		const rows = localDb()
			.prepare(
				`SELECT r.id, r.submitted_at, r.method, r.distance_from_host_m, r.accuracy_m, r.status,
				        st.full_name AS student_name, st.registration_id AS registration_id
				 FROM responses r JOIN students st ON st.id = r.student_id
				 WHERE r.session_id = ?
				 ORDER BY r.submitted_at DESC LIMIT ?`
			)
			.all(sessionId, limit) as FeedRow[];
		return rows;
	}

	const { data, error } = await locals
		.supabase!.from('responses')
		.select(
			'id, submitted_at, method, distance_from_host_m, accuracy_m, status, students!inner(full_name, registration_id)'
		)
		.eq('session_id', sessionId)
		.order('submitted_at', { ascending: false })
		.limit(limit);
	if (error) throw new Error(error.message);
	return ((data ?? []) as unknown as Array<{
		id: string;
		submitted_at: string;
		method: string | null;
		distance_from_host_m: number | null;
		accuracy_m: number | null;
		status: string;
		students: { full_name: string; registration_id: string };
	}>).map((r) => ({
		id: r.id,
		submitted_at: r.submitted_at,
		method: r.method,
		distance_from_host_m: r.distance_from_host_m,
		accuracy_m: r.accuracy_m,
		status: r.status,
		student_name: r.students.full_name,
		registration_id: r.students.registration_id
	}));
}

export const STATUS_LABEL: Record<string, string> = {
	accepted: 'Accepted',
	rejected_distance: 'Too far away',
	rejected_code: 'Incorrect code',
	duplicate: 'Already submitted',
	host_offline: 'Host offline'
};

export function statusLabel(status: string): string {
	return STATUS_LABEL[status] ?? status;
}

// ---------------------------------------------------------------------------
// Server-authoritative submission. The client may show a local estimate, but
// this function alone decides accepted vs rejected (PLAN §22).
// One row per (session, student): the latest non-accepted attempt is kept,
// an accepted row is final (further attempts → duplicate, no write).
// ---------------------------------------------------------------------------

export type SubmitInput = {
	joinSlug: string;
	code: string;
	qrToken?: string;
	studentId: string;
	method: 'code' | 'qr';
	lat?: number;
	lng?: number;
	accuracy?: number;
	/** True when the student explicitly opted into approximate mode. */
	fallback?: boolean;
	deviceHash?: string;
	ip: string;
};

export type SubmitOutcome = {
	status: 'accepted' | 'rejected_distance' | 'rejected_code' | 'duplicate' | 'host_offline' | 'closed' | 'invalid';
	message: string;
	distanceM: number | null;
	recorded: boolean;
};

const RATE_LIMIT_N = 10;
const RATE_LIMIT_WINDOW_SEC = 60;
const rateKey = (ip: string, sessionId: string) => `ratelimit:${ip}:${sessionId}`;

async function checkRateLimit(ip: string, sessionId: string): Promise<boolean> {
	const key = rateKey(ip, sessionId);
	const count = (await ephGet<number>(key)) ?? 0;
	if (count >= RATE_LIMIT_N) return false;
	await ephSet(key, count + 1, RATE_LIMIT_WINDOW_SEC);
	return true;
}

function msg(status: SubmitOutcome['status'], extra?: string): string {
	switch (status) {
		case 'accepted':
			return 'Attendance recorded. You are checked in.';
		case 'rejected_distance':
			return `Too far from the room${extra ?? ''}. Move closer and try again.`;
		case 'rejected_code':
			return 'That code is not correct for the live session. Check the board and try again.';
		case 'duplicate':
			return 'You have already checked in for this session.';
		case 'host_offline':
			return 'Host location is temporarily unavailable. Wait a moment and try again.';
		case 'closed':
			return 'This session is closed. New check-ins are no longer accepted.';
		default:
			return extra ?? 'Could not verify attendance. Try again.';
	}
}

type ClassRef = { id: string; owner_id: string; join_slug: string };

async function classBySlug(locals: Locals, slug: string): Promise<ClassRef | null> {
	if (isLocal(locals)) {
		const row = localDb()
			.prepare(`SELECT id, owner_id, join_slug FROM classes WHERE join_slug = ? AND deleted_at IS NULL`)
			.get(slug) as ClassRef | undefined;
		return row ?? null;
	}
	const { data } = await locals
		.supabase!.from('classes')
		.select('id, owner_id, join_slug')
		.eq('join_slug', slug)
		.is('deleted_at', null)
		.single();
	return (data as ClassRef | null) ?? null;
}

export async function submitAttendanceBackend(
	locals: Locals,
	input: SubmitInput
): Promise<SubmitOutcome> {
	// 0. Input shape
	if (!input.joinSlug || !input.studentId) {
		return { status: 'invalid', message: 'Missing class link or student. Start over from the class link.', distanceM: null, recorded: false };
	}
	if (input.method !== 'code' && input.method !== 'qr') {
		return { status: 'invalid', message: 'Unknown verification method. Start over from the class link.', distanceM: null, recorded: false };
	}

	// Class must exist in both paths.
	const cls = await classBySlug(locals, input.joinSlug);
	if (!cls) {
		return { status: 'invalid', message: 'This class link is no longer valid. Ask your host for the current link.', distanceM: null, recorded: false };
	}

	// QR PATH — proof of line-of-sight: a fresh token scanned off the host
	// screen. No code to type, no location trail required. The token itself
	// is verified below (signature + expiry + live session).
	if (input.method === 'qr') {
		return submitViaQr(locals, cls, input);
	}

	// CODE PATH — the code is verbally relayable, so location is mandatory:
	// identity + code + geofence, all server-checked.
	const code = (input.code ?? '').trim();
	if (!code) {
		return { status: 'invalid', message: 'Enter the session code your host announced.', distanceM: null, recorded: false };
	}
	if (!Number.isFinite(input.lat) || (input.lat as number) < -90 || (input.lat as number) > 90 || !Number.isFinite(input.lng) || (input.lng as number) < -180 || (input.lng as number) > 180) {
		return { status: 'invalid', message: 'Your location could not be read. Share your location and try again.', distanceM: null, recorded: false };
	}
	const studentAcc = input.accuracy as number;
	const studentDegraded = input.fallback === true;
	if (!accuracyOk(studentAcc) && !(studentDegraded && Number.isFinite(studentAcc) && studentAcc >= 0 && studentAcc <= FALLBACK_MAX_ACCURACY_M)) {
		return { status: 'invalid', message: 'Your location is too imprecise right now. Move near a window or step outside — or switch to approximate mode below.', distanceM: null, recorded: false };
	}
	return submitViaCode(locals, cls, { ...input, code });
}

/** QR path: token → live session → roster → duplicate → accept. */
async function submitViaQr(
	locals: Locals,
	cls: ClassRef,
	input: SubmitInput
): Promise<SubmitOutcome> {
	const sessionId = input.qrToken ? verifyQrToken(input.qrToken) : null;
	if (!sessionId) {
		return { status: 'invalid', message: 'This QR has expired. Rescan the current code on the host screen.', distanceM: null, recorded: false };
	}
	const session = await getSessionBackend(locals, cls.owner_id, cls.id, sessionId);
	if (!session || session.status !== 'active') {
		return { status: 'closed', message: msg('closed'), distanceM: null, recorded: false };
	}
	if (!(await checkRateLimit(input.ip, session.id))) {
		return { status: 'invalid', message: 'Too many attempts. Wait a minute and try again.', distanceM: null, recorded: false };
	}
	if (!(await studentInClass(locals, cls.id, input.studentId))) {
		return { status: 'invalid', message: 'That student is not on this class roster. Check with your host.', distanceM: null, recorded: false };
	}
	const existing = await existingResponse(locals, session.id, input.studentId);
	if (existing === 'accepted') {
		return { status: 'duplicate', message: msg('duplicate'), distanceM: null, recorded: true };
	}
	await recordAttempt(locals, session.id, { ...input, lat: undefined, lng: undefined, accuracy: undefined }, 'accepted', null);
	logEvent('submission_accepted', { session_id: session.id, via: 'qr' });
	return { status: 'accepted', message: 'Attendance recorded. You are checked in.', distanceM: null, recorded: true };
}

/** Code path: code → live session → roster → duplicate → host fix → geofence → accept. */
async function submitViaCode(
	locals: Locals,
	cls: ClassRef,
	input: SubmitInput & { code: string }
): Promise<SubmitOutcome> {
	const lat = input.lat as number;
	const lng = input.lng as number;
	const accuracy = input.accuracy as number;
	const session = await findActiveByCode(locals, cls.id, input.code);
	if (!session) {
		// Distinguish "wrong code" from "session closed": any active session?
		const only = await singleActiveSession(locals, cls.id);
		if (!only) return { status: 'closed', message: msg('closed'), distanceM: null, recorded: false };
		// Exactly one live session: attribute the code miss so the host sees it.
		const student = await studentInClass(locals, cls.id, input.studentId);
		if (student) {
			const prior = await existingResponse(locals, only.id, input.studentId);
			if (prior !== 'accepted') {
				await recordAttempt(locals, only.id, input, 'rejected_code', null);
			}
		}
		return { status: 'rejected_code', message: msg('rejected_code'), distanceM: null, recorded: student };
	}

	// Rate limit (per IP per session)
	if (!(await checkRateLimit(input.ip, session.id))) {
		return { status: 'invalid', message: 'Too many attempts. Wait a minute and try again.', distanceM: null, recorded: false };
	}

	// 3. Student belongs to the class
	const student = await studentInClass(locals, cls.id, input.studentId);
	if (!student) {
		return { status: 'invalid', message: 'That student is not on this class roster. Check with your host.', distanceM: null, recorded: false };
	}

	// 4. Duplicate: an accepted row is final
	const existing = await existingResponse(locals, session.id, input.studentId);
	if (existing === 'accepted') {
		return { status: 'duplicate', message: msg('duplicate'), distanceM: null, recorded: true };
	}

	// 5–6. Host location exists and is fresh (ephemeral; stale/missing → host_offline)
	const host = await ephGet<HostLoc>(hostLocKey(session.id));
	if (!host) {
		await recordAttempt(locals, session.id, input, 'host_offline', null);
		logEvent('submission_rejected', { session_id: session.id, reason: 'host_offline' });
		return { status: 'host_offline', message: msg('host_offline'), distanceM: null, recorded: true };
	}

	// 7–8. Haversine vs effective fence. Either side may be running
	// approximate — the fence absorbs both margins, capped.
	const distanceM = Math.round(haversineM(host.lat, host.lng, lat, lng));
	const fence = effectiveRadiusFor(session.radius_meters, host.accuracy, host.degraded, accuracy, input.fallback === true);
	if (distanceM > fence) {
		await recordAttempt(locals, session.id, input, 'rejected_distance', distanceM);
		logEvent('submission_rejected', { session_id: session.id, reason: 'rejected_distance' });
		return { status: 'rejected_distance', message: msg('rejected_distance', ` (~${distanceM} m from the host, zone ~${fence} m)`), distanceM, recorded: true };
	}

	await recordAttempt(locals, session.id, input, 'accepted', distanceM);
	logEvent('submission_accepted', { session_id: session.id });
	const degradedNote = input.fallback === true ? ' (approximate location — checked against a widened zone)' : '';
	return { status: 'accepted', message: `Attendance recorded. You are checked in.${degradedNote}`, distanceM, recorded: true };
}

async function findActiveByCode(
	locals: Locals,
	classId: string,
	code: string
): Promise<{ id: string; radius_meters: number } | null> {
	if (isLocal(locals)) {
		const row = localDb()
			.prepare(
				`SELECT id, radius_meters FROM sessions WHERE class_id = ? AND session_code = ? AND status = 'active' AND deleted_at IS NULL`
			)
			.get(classId, code) as { id: string; radius_meters: number } | undefined;
		return row ?? null;
	}
	const { data } = await locals
		.supabase!.from('sessions')
		.select('id, radius_meters')
		.eq('class_id', classId)
		.eq('session_code', code)
		.eq('status', 'active')
		.is('deleted_at', null)
		.limit(1)
		.single();
	return (data as { id: string; radius_meters: number } | null) ?? null;
}

async function singleActiveSession(
	locals: Locals,
	classId: string
): Promise<{ id: string; radius_meters: number } | null> {
	if (isLocal(locals)) {
		const rows = localDb()
			.prepare(
				`SELECT id, radius_meters FROM sessions WHERE class_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 2`
			)
			.all(classId) as Array<{ id: string; radius_meters: number }>;
		return rows.length === 1 ? rows[0] : null;
	}
	const { data } = await locals
		.supabase!.from('sessions')
		.select('id, radius_meters')
		.eq('class_id', classId)
		.eq('status', 'active')
		.is('deleted_at', null)
		.limit(2);
	const rows = (data ?? []) as Array<{ id: string; radius_meters: number }>;
	return rows.length === 1 ? rows[0] : null;
}

async function studentInClass(
	locals: Locals,
	classId: string,
	studentId: string
): Promise<boolean> {
	if (isLocal(locals)) {
		const row = localDb()
			.prepare(`SELECT id FROM students WHERE id = ? AND class_id = ? AND deleted_at IS NULL`)
			.get(studentId, classId) as { id: string } | undefined;
		return !!row;
	}
	const { data } = await locals
		.supabase!.from('students')
		.select('id')
		.eq('id', studentId)
		.eq('class_id', classId)
		.is('deleted_at', null)
		.limit(1);
	return (data?.length ?? 0) > 0;
}

async function existingResponse(
	locals: Locals,
	sessionId: string,
	studentId: string
): Promise<string | null> {
	if (isLocal(locals)) {
		const row = localDb()
			.prepare(`SELECT status FROM responses WHERE session_id = ? AND student_id = ?`)
			.get(sessionId, studentId) as { status: string } | undefined;
		return row?.status ?? null;
	}
	const { data } = await locals
		.supabase!.from('responses')
		.select('status')
		.eq('session_id', sessionId)
		.eq('student_id', studentId)
		.limit(1);
	return ((data?.[0] as { status: string } | undefined)?.status ?? null);
}

async function recordAttempt(
	locals: Locals,
	sessionId: string,
	input: SubmitInput,
	status: 'accepted' | 'rejected_distance' | 'rejected_code' | 'host_offline',
	distanceM: number | null
): Promise<void> {
	if (isLocal(locals)) {
		const d = localDb();
		const prev = d
			.prepare(`SELECT id FROM responses WHERE session_id = ? AND student_id = ?`)
			.get(sessionId, input.studentId) as { id: string } | undefined;
		// better-sqlite3 rejects undefined — coerce absent coords to NULL.
		const lat = input.lat ?? null;
		const lng = input.lng ?? null;
		const accuracy = input.accuracy ?? null;
		if (prev) {
			d.prepare(
				`UPDATE responses SET status = ?, method = ?, lat = ?, lng = ?, accuracy_m = ?, distance_from_host_m = ?, device_hash = ?, submitted_at = datetime('now') WHERE id = ?`
			).run(status, input.method, lat, lng, accuracy, distanceM, input.deviceHash ?? null, prev.id);
		} else {
			d.prepare(
				`INSERT INTO responses (id, session_id, student_id, status, method, lat, lng, accuracy_m, distance_from_host_m, device_hash)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(randomUUID(), sessionId, input.studentId, status, input.method, lat, lng, accuracy, distanceM, input.deviceHash ?? null);
		}
		return;
	}
	const sb = locals.supabase!;
	const { data: prev } = await sb
		.from('responses')
		.select('id')
		.eq('session_id', sessionId)
		.eq('student_id', input.studentId)
		.limit(1);
	const row = {
		status,
		method: input.method,
		lat: input.lat,
		lng: input.lng,
		accuracy_m: input.accuracy,
		distance_from_host_m: distanceM,
		device_hash: input.deviceHash ?? null
	};
	if (prev?.[0]) {
		await sb.from('responses').update(row).eq('id', (prev[0] as { id: string }).id);
	} else {
		await sb.from('responses').insert({ session_id: sessionId, student_id: input.studentId, ...row });
	}
}
