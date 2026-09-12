import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClassBackend } from '$lib/server/class-store.js';
import {
	closeSessionBackend,
	getSessionBackend,
	joinUrlFor,
	qrSvgFor,
	qrTokenFor
} from '$lib/server/session-store.js';
import { listResponsesBackend } from '$lib/server/response-store.js';
import { ephGet, hostLocKey, type HostLoc } from '$lib/server/ephemeral.js';
import { effectiveRadius } from '$lib/server/geo.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/auth/sign-in');
	const cls = await getClassBackend(locals, locals.user.id, params.classId);
	if (!cls) throw error(404, 'Class not found.');
	const session = await getSessionBackend(locals, locals.user.id, params.classId, params.sessionId);
	if (!session) throw error(404, 'Session not found.');
	if (session.deleted_at) throw error(404, 'Session not found.');
	if (session.status === 'closed') throw redirect(303, `/classes/${params.classId}/sessions`);

	const joinUrl = joinUrlFor(cls.join_slug, qrTokenFor(session.id));
	const qrSvg = await qrSvgFor(joinUrl);
	const responses = await listResponsesBackend(locals, locals.user.id, params.classId, params.sessionId);
	const hostLoc = await ephGet<HostLoc>(hostLocKey(session.id));
	return {
		class: cls,
		session,
		joinUrl,
		qrSvg,
		responses,
		hostLive: !!hostLoc,
		hostDegraded: hostLoc?.degraded ?? false,
		hostEffectiveRadiusM: hostLoc
			? effectiveRadius(session.radius_meters, hostLoc.accuracy, hostLoc.degraded)
			: session.radius_meters
	};
};

export const actions: Actions = {
	close: async ({ locals, params }) => {
		if (!locals.user) throw redirect(303, '/auth/sign-in');
		await closeSessionBackend(locals, locals.user.id, params.classId, params.sessionId);
		throw redirect(303, `/classes/${params.classId}/sessions`);
	}
};
