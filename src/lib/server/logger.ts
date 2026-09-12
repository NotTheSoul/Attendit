import pino from 'pino';

// Single stdout logger. No file / DB / third-party transports:
// the 512 MB server treats logs as a stream, not storage.
export const log = pino({
	level: process.env.LOG_LEVEL ?? 'info'
});

type RingEntry = { t: string; level: string; event: string; data?: unknown };

const MAX_RING = 100;
const ring: RingEntry[] = [];

/** Record an operational event + keep it visible in-memory for /api/health. */
export function logEvent(event: string, data?: unknown, level = 'info') {
	const entry: RingEntry = { t: new Date().toISOString(), level, event, data };
	ring.push(entry);
	if (ring.length > MAX_RING) ring.shift();
	(log as unknown as Record<string, (o: object, m: string) => void>)[level]?.({ event, ...((data as object) ?? {}) }, event) ??
		log.info({ event, ...((data as object) ?? {}) }, event);
}

export function recentLogs(): RingEntry[] {
	return [...ring].reverse();
}
