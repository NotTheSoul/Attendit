<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { open = false, onclose = () => {} }: { open?: boolean; onclose?: () => void } = $props();

	const items = [
		{
			href: '/dashboard',
			label: 'Dashboard',
			icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'
		},
		{
			href: '/classes',
			label: 'Classes',
			icon: '<path d="M4 5a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>'
		},
		{
			href: '/trash',
			label: 'Trash',
			icon: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>'
		},
		{
			href: '/settings',
			label: 'Settings',
			icon: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>'
		}
	];

	let path = $derived(page.url.pathname);
	const isActive = (href: string) =>
		href === '/dashboard' ? path === href : path === href || path.startsWith(href + '/');

	let navEl: HTMLElement | undefined = $state();
	let narrow = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(max-width: 860px)');
		const sync = () => (narrow = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	$effect(() => {
		if (open && navEl && window.innerWidth <= 860) {
			navEl.querySelector('a')?.focus();
		}
	});

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onkey} />

{#if open}
	<button class="backdrop" type="button" onclick={onclose} aria-label="Close navigation" tabindex="-1"></button>
{/if}

<nav class="sidenav" id="app-sidenav" class:open aria-label="App" bind:this={navEl} inert={narrow && !open}>
	{#each items as item}
		<a
			href={item.href}
			class:active={isActive(item.href)}
			aria-current={isActive(item.href) ? 'page' : undefined}
			onclick={onclose}
		>
			<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				{@html item.icon}
			</svg>
			<span>{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	.backdrop {
		display: none;
		border: none;
		padding: 0;
		cursor: default;
	}
	.sidenav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px;
	}
	.sidenav a {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: var(--shape-s);
		color: var(--muted);
		text-decoration: none;
		font-size: 0.92rem;
		font-weight: 500;
	}
	.sidenav a:hover { color: var(--text); background: var(--panel); }
	.sidenav a.active { color: var(--text); background: var(--panel-2); }
	@media (max-width: 860px) {
		.backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.55);
			z-index: 50;
		}
		.sidenav {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			width: min(280px, 82vw);
			background: var(--bg);
			border-right: 1px solid var(--border);
			z-index: 60;
			padding-top: max(16px, env(safe-area-inset-top));
			transform: translateX(-105%);
			transition: transform 0.2s ease-out;
		}
		.sidenav.open { transform: none; }
	}
	@media (prefers-reduced-motion: reduce) {
		.sidenav { transition: none; }
	}
</style>
