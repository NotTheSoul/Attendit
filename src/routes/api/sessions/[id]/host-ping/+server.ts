import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSessionBackend } from '$lib/server/session-store.js';
import { getClassBackend } from '$lib/server/class-store.js';
import { ephSet, hostLocKey, HOST_LOC_TTL_SEC, type HostLoc } from '$lib/server/ephemeral.js';
import {
	accuracyOk,
	effectiveRadius,
	FALLBACK_MAX_ACCURACY_M
} from '$lib/server/geo.js';

// Host heartbeat: proves the host device is live and where it is.
// Ephemeral only (Redis TTL 30s or memory fallback) — never Postgres.
//
// Two paths:
// - precise (default): accuracy ≤ 100 m → full-radius verification.
// - fallback (`fallback: true`): accuracy ≤ 500 m → stored as degraded; the
//   fence visibly widens to radius + accuracy. Explicit host opt-in only.
export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');
	const classId = url.searchParams.get('classId');
	if (!classId) throw error(400, 'Missing classId.');

	const cls = await getClassBackend(locals, locals.user.id, classId);
	if (!cls) throw error(404, 'Class not found.');
	const session = await getSessionBackend(locals, locals.user.id, classId, params.id);
	if (!session) throw error(404, 'Session not found.');
	if (session.status !== 'active') throw error(409, 'Session is not active.');

	let body: { lat?: unknown; lng?: unknown; accuracy?: unknown; fallback?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Expected JSON with lat, lng, accuracy.');
	}

	const lat = Number(body.lat);
	const lng = Number(body.lng);
	const accuracy = Number(body.accuracy);
	const fallback = body.fallback === true;
	if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw error(400, 'Invalid latitude.');
	if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw error(400, 'Invalid longitude.');
	if (!Number.isFinite(accuracy) || accuracy < 0) throw error(400, 'Invalid accuracy.');

	if (!fallback && !accuracyOk(accuracy)) {
		throw error(
			422,
			'Location accuracy too poor for a precise zone (need ≤ 100 m). Move near a window or step outside — or switch to approximate mode below.'
		);
	}
	if (fallback && accuracy > FALLBACK_MAX_ACCURACY_M) {
		throw error(
			422,
			'Even an approximate fix needs ≤ 500 m accuracy. Move near a window or outdoors, then retry.'
		);
	}

	const loc: HostLoc = { lat, lng, accuracy, at: Date.now(), degraded: fallback };
	await ephSet(hostLocKey(session.id), loc, HOST_LOC_TTL_SEC);
	return json({
		ok: true,
		degraded: fallback,
		effectiveRadiusM: effectiveRadius(session.radius_meters, accuracy, fallback)
	});
};
