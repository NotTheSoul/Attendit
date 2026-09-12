// Service-role Supabase client for server-side public flows.
//
// Students have no accounts, so public endpoints (class join page, roster
// typeahead, attendance submission) arrive with NO user session. RLS
// deliberately grants `anon` nothing (see migration 0001) — instead these
// flows run under `service_role` ON THE SERVER ONLY. The key never leaves
// this module; nothing here is importable from client code ($lib/server).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

let admin: SupabaseClient | null = null;
let attempted = false;

export function serviceClient(): SupabaseClient | null {
	if (admin || attempted) return admin;
	attempted = true;
	const url = env.PUBLIC_SUPABASE_URL ?? '';
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
	if (!url || !key) return null;
	admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
	return admin;
}

export type ServiceLocals = { supabase: SupabaseClient | null; supabaseConfigured: boolean };

/** Locals-shaped object that runs store functions with service privileges. */
export function serviceLocals(): ServiceLocals {
	const sb = serviceClient();
	return { supabase: sb, supabaseConfigured: !!sb };
}
