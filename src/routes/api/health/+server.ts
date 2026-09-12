import { json } from '@sveltejs/kit';
import { logEvent } from '$lib/server/logger.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	logEvent('healthcheck');
	return json({ ok: true, service: 'attendit', phase: 1, time: new Date().toISOString() });
};
