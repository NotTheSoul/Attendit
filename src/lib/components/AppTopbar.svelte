<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let {
		email,
		backend,
		onmenuclick,
		menuopen = false
	}: { email: string; backend: 'local' | 'supabase'; onmenuclick?: () => void; menuopen?: boolean } = $props();

	let initial = $derived((email || '?').charAt(0).toUpperCase());
	let narrow = $state(false);
	let profileOpen = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(max-width: 860px)');
		const sync = () => (narrow = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	$effect(() => {
		void page.url.pathname;
		profileOpen = false;
	});
</script>

<div class="topbar">
	{#if narrow && onmenuclick}
		<button
			class="menu-btn"
			type="button"
			onclick={onmenuclick}
			aria-label="Open navigation"
			aria-expanded={menuopen}
			aria-controls="app-sidenav"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
				<path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
			</svg>
		</button>
	{/if}
	<a class="ws" href="/dashboard" aria-label="Attendit dashboard">
		<span class="brand-mark" aria-hidden="true">a</span>
		<span class="ws-name">attendit</span>
		<span class="ws-badge">{backend === 'local' ? 'LOCAL' : 'CLOUD'}</span>
	</a>

	<form class="search" method="GET" action="/classes" role="search">
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
			<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
		</svg>
		<input type="search" name="q" placeholder="Search classes…" aria-label="Search classes" />
	</form>

	<div class="actions">
		<button
			class="avatar"
			type="button"
			onclick={() => (profileOpen = !profileOpen)}
			aria-label="Account menu for {email}"
			aria-expanded={profileOpen}
			aria-haspopup="menu"
		>
			{initial}
		</button>
		{#if profileOpen}
			<button class="profile-backdrop" type="button" onclick={() => (profileOpen = false)} aria-label="Close account menu" tabindex="-1"></button>
			<div class="menu" role="menu">
				<p class="menu-email" title={email}>{email}</p>
				<form method="POST" action="/auth/sign-out">
					<button class="menu-signout" type="submit">Sign out</button>
				</form>
			</div>
		{/if}
	</div>
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') profileOpen = false;
	}}
/>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 60px;
		min-height: calc(60px + env(safe-area-inset-top));
		padding-top: env(safe-area-inset-top);
		padding-bottom: 0;
		padding-left: max(20px, env(safe-area-inset-left));
		padding-right: max(20px, env(safe-area-inset-right));
		border-bottom: 1px solid var(--border);
		background: var(--bg);
		position: sticky;
		top: 0;
		z-index: 30;
	}
	.ws {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: var(--text);
		font-weight: 700;
		min-height: 44px;
	}
	.menu-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		flex: none;
		padding: 0;
		background-color: transparent;
		background-image: none;
		border: 1px solid transparent;
		border-radius: var(--shape-s);
		color: var(--text);
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
	}
	.menu-btn:hover { background-color: var(--panel); border-color: var(--border); }
	.menu-btn svg { display: block; }
	.brand-mark {
		width: 22px;
		height: 22px;
		background: var(--accent);
		color: #06110b;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 800;
		border-radius: 6px 6px 6px 2px;
		font-family: var(--font-mono);
	}
	.ws-badge {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px 8px;
	}
	.search {
		flex: 1;
		max-width: 420px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--shape-s);
		padding: 0 12px;
		color: var(--muted);
	}
	.search:focus-within { border-color: var(--accent); }
	.search input {
		flex: 1;
		background: none;
		border: none;
		color: var(--text);
		font: inherit;
		font-size: 0.9rem;
		min-height: 38px;
		min-width: 0;
		outline: none;
	}
	.actions { margin-left: auto; display: flex; align-items: center; gap: 10px; position: relative; }
	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--panel-2);
		border: 1px solid var(--border);
		color: var(--text);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1rem;
		font-family: var(--font-sans);
		cursor: pointer;
		padding: 0;
		-webkit-appearance: none;
		appearance: none;
	}
	.avatar:hover { border-color: var(--muted); }
	.profile-backdrop {
		position: fixed;
		inset: 0;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
		z-index: 35;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		min-width: 220px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--shape-m);
		padding: 8px;
		z-index: 40;
	}
	.menu-email {
		margin: 0;
		padding: 10px 12px;
		color: var(--muted);
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-bottom: 1px solid var(--border);
	}
	.menu form { margin: 0; }
	.menu-signout {
		width: 100%;
		background: none;
		border: none;
		color: var(--text);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 600;
		text-align: left;
		padding: 0 12px;
		min-height: 44px;
		border-radius: var(--shape-s);
		cursor: pointer;
	}
	.menu-signout:hover { background: var(--panel-2); }
	@media (max-width: 640px) {
		.topbar { gap: 10px; }
		.ws, .actions { flex: none; }
		.search { display: none; }
		.ws-name { display: none; }
	}
</style>
