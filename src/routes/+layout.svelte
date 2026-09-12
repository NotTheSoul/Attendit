<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';

	let { children, data } = $props();

	let user = $derived(data.user);
	let menuOpen = $state(false);
	// Sidebar on every authed page except the homepage —
	// the homepage is always the marketing front door.
	let showSidebar = $derived(page.url.pathname !== '/');
	// Public student surfaces render chromeless: no sidebar, no topbar,
	// no marketing header — a stranger's phone must never see host chrome.
	let bare = $derived(page.route.id === '/[slug]');

	$effect(() => {
		// Close the drawer whenever the route changes
		void page.url.pathname;
		menuOpen = false;
	});

	onMount(() => {
		if (!data.supabase) return;
		const {
			data: { subscription }
		} = data.supabase.auth.onAuthStateChange((event) => {
			if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
				invalidateAll();
			}
		});
		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content="Attendit — in-room attendance for classes. Host starts a session, students verify with a code or QR, results export to CSV or Google Sheets." />
	<meta name="theme-color" content="#0b0d0b" />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

{#if user}
	<div class="app">
		<AppTopbar
			email={user.email ?? ''}
			backend={data.supabaseConfigured ? 'supabase' : 'local'}
			onmenuclick={showSidebar ? () => (menuOpen = true) : undefined}
			menuopen={menuOpen}
		/>
		{#if showSidebar}
			<div class="app-body">
				<aside class="app-side">
					<SideNav open={menuOpen} onclose={() => (menuOpen = false)} />
				</aside>
				<main id="main" class="app-main">
					{@render children()}
				</main>
			</div>
		{:else}
			<main id="main" class="app-main solo">
				{@render children()}
			</main>
		{/if}
	</div>
{:else}
	<header class="site-header">
		<div class="site-header-inner">
			<a class="brand" href="/" aria-label="Attendit home">
				<span class="brand-mark" aria-hidden="true">a</span>
				<span>attendit</span>
			</a>
			<nav class="site-links" aria-label="Primary">
				<a href="/#how">How it works</a>
				<a href="/#verify">Verify</a>
				<a href="/#export">Export</a>
			</nav>
			<div class="site-actions">
{#if bare}
	<main id="main">
		{@render children()}
	</main>
{:else if user}
					<a class="btn btn-filled btn-sm" href="/dashboard">Open dashboard</a>
				{:else}
					<a class="btn btn-sm" href="/auth/sign-in">Sign in</a>
					<a class="btn btn-filled btn-sm" href="/auth/sign-up">Get started</a>
				{/if}
			</div>
		</div>
	</header>

	<main id="main">
		{@render children()}
	</main>

	<footer class="site-footer">
		<div class="site-footer-inner">
			<a class="brand brand-center" href="/" aria-label="Attendit home">
				<span class="brand-mark" aria-hidden="true">a</span>
				<span>attendit</span>
			</a>
			<p class="foot-tag">Attendance for real rooms.</p>
			<nav class="foot-links" aria-label="Footer">
				<a href="/#how">How it works</a>
				<a href="/#verify">Verify</a>
				<a href="/#export">Export</a>
				<a href="/auth/sign-in">Sign in</a>
				<a href="/auth/sign-up">Get started</a>
			</nav>
			<p class="foot-fine">Students join from a link. No student account needed.</p>
		</div>
	</footer>
{/if}
