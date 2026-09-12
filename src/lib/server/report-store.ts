// Session results: every roster student × their latest response (or absent).
// Shared by the results page, CSV download, and Sheets export — one query
// shape, three destinations. Postgres stays the source of truth.
import { localDb } from './local-db.js';
import { getClassBackend } from './class-store.js';
import { getSessionBackend } from './session-store.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ResultRow = {
	student_id: string;
	student_name: string;
	registration_id: string;
	status: string; // accepted | rejected_* | host_offline | absent
	method: string | null;
	distance_m: number | null;
	accuracy_m: number | null;
	submitted_at: string | null;
};

export type SessionReport = {
	session: {
		id: string;
		status: string;
		session_code: string;
		radius_meters: number;
		opens_at: string | null;
		closes_at: string | null;
		created_at: string;
		degraded: boolean;
	};
	className: string;
	subjectName: string | null;
	totals: { roster: number; accepted: number; rejected: number; absent: number; rate: number };
	rows: ResultRow[];
};

type Locals = { supabase: SupabaseClient | null; supabaseConfigured: boolean };
const isLocal = (locals: Locals) => !locals.supabaseConfigured || !locals.supabase;

export async function sessionReportBackend(
	locals: Locals,
	ownerId: string,
	classId: string,
	sessionId: string
): Promise<SessionReport> {
	const cls = await getClassBackend(locals, ownerId, classId);
	if (!cls) throw new Error('Class not found.');
	const session = await getSessionBackend(locals, ownerId, classId, sessionId);
	if (!session) throw new Error('Session not found.');

	let rows: ResultRow[];
	if (isLocal(locals)) {
		rows = localDb()
			.prepare(
				`SELECT st.id AS student_id, st.full_name AS student_name, st.registration_id AS registration_id,
				        r.status AS status, r.method AS method,
				        r.distance_from_host_m AS distance_m, r.accuracy_m AS accuracy_m,
				        r.submitted_at AS submitted_at
				 FROM students st LEFT JOIN responses r
				   ON r.student_id = st.id AND r.session_id = ?
				 WHERE st.class_id = ? AND st.deleted_at IS NULL
				 ORDER BY st.full_name COLLATE NOCASE`
			)
			.all(sessionId, classId) as ResultRow[];
	} else {
		const sb = locals.supabase!;
		const { data: students, error: sErr } = await sb
			.from('students')
			.select('id, full_name, registration_id')
			.eq('class_id', classId)
			.is('deleted_at', null)
			.order('full_name');
		if (sErr) throw new Error(sErr.message);
		const { data: responses, error: rErr } = await sb
			.from('responses')
			.select('student_id, status, method, distance_from_host_m, accuracy_m, submitted_at')
			.eq('session_id', sessionId);
		if (rErr) throw new Error(rErr.message);
		const byStudent = new Map(
			((responses ?? []) as Array<{ student_id: string } & Omit<ResultRow, 'student_id' | 'student_name' | 'registration_id'> & { distance_from_host_m: number | null; accuracy_m: number | null }>).map((r) => [
				r.student_id,
				{
					status: r.status,
					method: r.method,
					distance_m: r.distance_from_host_m,
					accuracy_m: r.accuracy_m,
					submitted_at: r.submitted_at
				}
			])
		);
		rows = ((students ?? []) as Array<{ id: string; full_name: string; registration_id: string }>).map((st) => ({
			student_id: st.id,
			student_name: st.full_name,
			registration_id: st.registration_id,
			...(byStudent.get(st.id) ?? {
				status: 'absent',
				method: null,
				distance_m: null,
				accuracy_m: null,
				submitted_at: null
			})
		}));
	}

	const accepted = rows.filter((r) => r.status === 'accepted').length;
	const present = rows.filter((r) => r.status !== 'absent').length;
	const roster = rows.length;
	return {
		session: {
			id: session.id,
			status: session.status,
			session_code: session.session_code,
			radius_meters: session.radius_meters,
			opens_at: session.opens_at,
			closes_at: session.closes_at,
			created_at: session.created_at,
			degraded: false
		},
		className: cls.name,
		subjectName: session.subject_name ?? null,
		totals: {
			roster,
			accepted,
			rejected: present - accepted,
			absent: roster - present,
			rate: roster === 0 ? 0 : Math.round((accepted / roster) * 100)
		},
		rows: rows.map((r) => ({ ...r, status: r.status ?? 'absent' }))
	};
}

const csvCell = (v: unknown): string => {
	const s = v === null || v === undefined ? '' : String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV body for a report — generated on the fly, never stored. */
export function reportCsv(report: SessionReport): string {
	const header = [
		'Timestamp',
		'Class',
		'Subject',
		'Session ID',
		'Student Name',
		'Registration ID',
		'Method',
		'Status',
		'Distance (m)',
		'Location Accuracy (m)'
	];
	const lines = [header.join(',')];
	for (const r of report.rows) {
		lines.push(
			[
				r.submitted_at ?? '',
				report.className,
				report.subjectName ?? '',
				report.session.id,
				r.student_name,
				r.registration_id,
				r.method ?? '',
				r.status,
				r.distance_m ?? '',
				r.accuracy_m ?? ''
			]
				.map(csvCell)
				.join(',')
		);
	}
	return lines.join('\n') + '\n';
}

/** 2D array (header + rows) for the Sheets overwrite. */
export function reportSheetValues(report: SessionReport): string[][] {
	return [
		['Timestamp', 'Class', 'Subject', 'Session ID', 'Student Name', 'Registration ID', 'Method', 'Status', 'Distance (m)', 'Location Accuracy (m)'],
		...report.rows.map((r) => [
			r.submitted_at ?? '',
			report.className,
			report.subjectName ?? '',
			report.session.id,
			r.student_name,
			r.registration_id,
			r.method ?? '',
			r.status,
			r.distance_m?.toString() ?? '',
			r.accuracy_m?.toString() ?? ''
		])
	];
}
