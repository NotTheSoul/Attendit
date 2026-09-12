import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node produces a standalone Node server (`node build`).
			// Required for the 0.5 vCPU / 512 MB target: single process,
			// no custom websocket infra (Realtime lives in Supabase).
			adapter: adapter({ out: 'build' })
		})
	]
});
