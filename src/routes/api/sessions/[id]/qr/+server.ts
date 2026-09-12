import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClassBackend } from '$lib/server/class-store.js';
import { getSessionBackend, joinUrlFor, qrSvgFor, qrTokenFor } from '$lib/server/session-store.js';

// Fresh QR payload for the host display. Tokens rotate ~every 90s, so the
// host page re-polls this endpoint and a photographed QR dies quickly.
// The session code is NEVER in the payload.
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');
	const classId = url.searchParams.get('classId');
	if (!classId) throw error(400, 'Missing classId.');

	const cls = await getClassBackend(locals, locals.user.id, classId);
	if (!cls) throw error(404, 'Class not found.');
	const session = await getSessionBackend(locals, locals.user.id, classId, params.id);
	if (!session) throw error(404, 'Session not found.');
	if (session.status !== 'active') throw error(409, 'Session is not active.');

	const url_ = joinUrlFor(cls.join_slug, qrTokenFor(session.id));
	return json({ url: url_, svg: await qrSvgFor(url_) });
};
