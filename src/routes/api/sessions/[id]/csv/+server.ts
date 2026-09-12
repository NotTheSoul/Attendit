import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClassBackend } from '$lib/server/class-store.js';
import { getSessionBackend } from '$lib/server/session-store.js';
import { reportCsv, sessionReportBackend } from '$lib/server/report-store.js';
import { logEvent } from '$lib/server/logger.js';

// CSV download: generated on the fly from Postgres/SQLite, never stored.
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');
	const classId = url.searchParams.get('classId');
	if (!classId) throw error(400, 'Missing classId.');
	const cls = await getClassBackend(locals, locals.user.id, classId);
	if (!cls) throw error(404, 'Class not found.');
	const session = await getSessionBackend(locals, locals.user.id, classId, params.id);
	if (!session) throw error(404, 'Session not found.');

	const report = await sessionReportBackend(locals, locals.user.id, classId, params.id);
	logEvent('export_attempted', { session_id: params.id, dest: 'csv' });
	const csv = reportCsv(report);
	logEvent('export_succeeded', { session_id: params.id, dest: 'csv', rows: report.rows.length });
	const stamp = (session.closes_at ?? session.created_at).slice(0, 10);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="attendit-${cls.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stamp}.csv"`
		}
	});
};
