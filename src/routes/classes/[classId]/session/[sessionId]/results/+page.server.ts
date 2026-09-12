import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClassBackend } from '$lib/server/class-store.js';
import { getSessionBackend } from '$lib/server/session-store.js';
import { sessionReportBackend } from '$lib/server/report-store.js';
import { exportReportToSheet, sheetsConfigured } from '$lib/server/sheets.js';
import { logEvent } from '$lib/server/logger.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const cls = await getClassBackend(locals, locals.user.id, params.classId);
	if (!cls) throw error(404, 'Class not found.');
	const session = await getSessionBackend(locals, locals.user.id, params.classId, params.sessionId);
	if (!session) throw error(404, 'Session not found.');
	const report = await sessionReportBackend(locals, locals.user.id, params.classId, params.sessionId);
	return {
		class: cls,
		session,
		report,
		exportedTo: session.sheet_export_id,
		sheetsReady: sheetsConfigured()
	};
};

export const actions: Actions = {
	exportSheets: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		const form = await request.formData();
		const spreadsheetId = String(form.get('spreadsheet_id') ?? '').trim();
		try {
			logEvent('export_attempted', { session_id: params.sessionId, dest: 'sheets' });
			const report = await sessionReportBackend(locals, locals.user.id, params.classId, params.sessionId);
			const url = await exportReportToSheet(report, spreadsheetId || undefined);
			// Record destination only — data stays in Postgres regardless.
			if (locals.supabaseConfigured && locals.supabase) {
				await locals.supabase.from('sessions').update({ sheet_export_id: url }).eq('id', params.sessionId);
			} else {
				const { localDb } = await import('$lib/server/local-db.js');
				localDb().prepare(`UPDATE sessions SET sheet_export_id = ? WHERE id = ?`).run(url, params.sessionId);
			}
			logEvent('export_succeeded', { session_id: params.sessionId });
			return { exported: url };
		} catch (e) {
			logEvent('export_failed', { session_id: params.sessionId, message: (e as Error).message }, 'warn');
			return { exportError: (e as Error).message, spreadsheetId };
		}
	}
};
