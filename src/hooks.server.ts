import { createServerClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import type { Handle } from '@sveltejs/kit';
import { LOCAL_SESSION_COOKIE, localGetUser } from '$lib/server/local-auth.js';

const PUBLIC_SUPABASE_URL = env.PUBLIC_SUPABASE_URL ?? '';
const PUBLIC_SUPABASE_ANON_KEY = env.PUBLIC_SUPABASE_ANON_KEY ?? '';
const configured = PUBLIC_SUPABASE_URL.length > 0 && PUBLIC_SUPABASE_ANON_KEY.length > 0;

export const handle: Handle = async ({ event, resolve }) => {
	// Local-dev path: no Supabase configured → SQLite + cookie session.
	// Production path below is unchanged.
	if (!configured) {
		const user = localGetUser(event.cookies.get(LOCAL_SESSION_COOKIE));
		event.locals.supabase = null;
		event.locals.supabaseConfigured = false;
		event.locals.session = null;
		event.locals.user = user
			? ({ id: user.id, email: user.email } as unknown as NonNullable<
					typeof event.locals.user
				>)
			: null;
		return resolve(event);
	}

	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});
	event.locals.supabaseConfigured = true;

	// Verified identity: getUser() hits the Auth server.
	// Never trust getSession() for authorization.
	const {
		data: { user }
	} = await event.locals.supabase.auth.getUser();

	event.locals.user = user;

	const {
		data: { session }
	} = await event.locals.supabase.auth.getSession();
	event.locals.session = session;

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};
