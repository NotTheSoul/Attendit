import { createBrowserClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	const PUBLIC_SUPABASE_URL = env.PUBLIC_SUPABASE_URL ?? '';
	const PUBLIC_SUPABASE_ANON_KEY = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

	const configured =
		PUBLIC_SUPABASE_URL.length > 0 && PUBLIC_SUPABASE_ANON_KEY.length > 0;

	if (!configured) {
		return { supabase: null, session: data.session, user: data.user, supabaseConfigured: false };
	}

	const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: { fetch }
	});

	const {
		data: { session }
	} = await supabase.auth.getSession();

	return {
		supabase,
		session: session ?? data.session,
		user: session?.user ?? data.user,
		supabaseConfigured: true
	};
};
