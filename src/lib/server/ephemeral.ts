// Ephemeral state: Redis when REDIS_URL is set, otherwise a process-local
// Map with the same set/get interface. Redis is NEVER the source of truth —
// everything here is small, short-lived, and safe to lose (PLAN §30/31).
// Callers must degrade gracefully when data is missing (→ HOST OFFLINE, etc).
import { createClient, type RedisClientType } from 'redis';
import { logEvent } from './logger.js';

let client: RedisClientType | null = null;
let warned = false;

function memFallback() {
	const store = new Map<string, { v: string; exp: number }>();
	return {
		async set(key: string, value: string, ttlSec: number): Promise<void> {
			store.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
		},
		async get(key: string): Promise<string | null> {
			const row = store.get(key);
			if (!row) return null;
			if (row.exp < Date.now()) {
				store.delete(key);
				return null;
			}
			return row.v;
		},
		async del(key: string): Promise<void> {
			store.delete(key);
		}
	};
}

type Ephemeral = ReturnType<typeof memFallback>;
let fallback: Ephemeral | null = null;

async function redis(): Promise<RedisClientType | null> {
	const url = process.env.REDIS_URL;
	if (!url) return null;
	if (client) return client;
	try {
		client = createClient({ url });
		client.on('error', (e) => {
			if (!warned) {
				warned = true;
				logEvent('redis_unavailable', { message: (e as Error).message }, 'warn');
			}
		});
		await client.connect();
		return client;
	} catch (e) {
		logEvent('redis_unavailable', { message: (e as Error).message }, 'warn');
		client = null;
		return null;
	}
}

/** Store a small JSON-serializable value with a TTL (seconds). Never throws. */
export async function ephSet(key: string, value: unknown, ttlSec: number): Promise<void> {
	const raw = JSON.stringify(value);
	try {
		const r = await redis();
		if (r) {
			await r.set(key, raw, { EX: ttlSec });
			return;
		}
	} catch {
		// fall through to memory
	}
	fallback ??= memFallback();
	await fallback.set(key, raw, ttlSec);
}

/** Read an ephemeral value. Missing/expired/Redis-down → null (degrade, don't crash). */
export async function ephGet<T = unknown>(key: string): Promise<T | null> {
	try {
		const r = await redis();
		if (r) {
			const raw = await r.get(key);
			return raw ? (JSON.parse(raw) as T) : null;
		}
	} catch {
		// fall through to memory
	}
	fallback ??= memFallback();
	const raw = await fallback.get(key);
	return raw ? (JSON.parse(raw) as T) : null;
}

export async function ephDel(key: string): Promise<void> {
	try {
		const r = await redis();
		if (r) {
			await r.del(key);
			return;
		}
	} catch {
		// fall through
	}
	fallback ??= memFallback();
	await fallback.del(key);
}

// Key shapes (PLAN §31)
export const hostLocKey = (sessionId: string) => `session:${sessionId}:host_loc`;
export const HOST_LOC_TTL_SEC = 30;

/** What's stored at the host key: a fix plus whether it's approximate. */
export type HostLoc = {
	lat: number;
	lng: number;
	accuracy: number;
	at: number;
	degraded: boolean;
};
