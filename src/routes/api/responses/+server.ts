import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitAttendanceBackend } from '$lib/server/response-store.js';
import { serviceLocals } from '$lib/server/supabase-admin.js';
import { logEvent } from '$lib/server/logger.js';

// Public attendance submission. No auth — students have no accounts.
// Runs under service_role on the server (RLS grants anon nothing).
// Two methods, same server authority:
// - qr: a fresh signed token scanned off the host screen → direct accept
//   (line-of-sight proves presence; no code, no location trail).
// - code: the verbally announced code → identity + code + geofence enforced.
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Expected a JSON submission.');
	}

	const num = (v: unknown): number | undefined => {
		if (v === undefined || v === null || v === '') return undefined;
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	};

	const svc = serviceLocals();
	const backend = svc.supabase ? svc : locals;

	const outcome = await submitAttendanceBackend(backend, {
		joinSlug: String(body.joinSlug ?? ''),
		code: String(body.code ?? ''),
		qrToken: typeof body.qrToken === 'string' ? body.qrToken : undefined,
		studentId: String(body.studentId ?? ''),
		method: body.method === 'qr' ? 'qr' : 'code',
		lat: num(body.lat),
		lng: num(body.lng),
		accuracy: num(body.accuracy),
		fallback: body.fallback === true,
		deviceHash: typeof body.deviceHash === 'string' ? body.deviceHash.slice(0, 128) : undefined,
		ip: getClientAddress()
	});

	logEvent('submission_received', { status: outcome.status });

	if (outcome.status === 'invalid') throw error(400, outcome.message);
	if (outcome.status === 'closed') throw error(409, outcome.message);
	return json(outcome);
};
