<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ClassTabs from '$lib/components/ClassTabs.svelte';

	let { data, form } = $props();
	let cls = $derived(data.class);
	let counts = $derived(data.counts);
	let shareState: 'idle' | 'shared' | 'copied' | 'failed' = $state('idle');

	const refresh = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			await invalidateAll();
		};
	};

	function joinHref(): string {
		return `${window.location.origin}/${cls.join_slug}`;
	}

	// Share the join link (no code inside — safe to forward). Web Share API
	// where available, clipboard fallback, manual-select fallback otherwise.
	async function shareLink() {
		const url = joinHref();
		const text = `Join ${cls.name} attendance: ${url}`;
		try {
			if (navigator.share) {
				await navigator.share({ title: `${cls.name} — Attendit`, text, url });
				shareState = 'shared';
				return;
			}
			throw new Error('no-share');
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') return; // user dismissed
			try {
				await navigator.clipboard.writeText(url);
				shareState = 'copied';
			} catch {
				shareState = 'failed';
			}
		} finally {
			if (shareState === 'shared' || shareState === 'copied') {
				setTimeout(() => {
					shareState = 'idle';
				}, 2500);
			}
		}
	}
</script>

<svelte:head>
	<title>{cls.name} — Attendit</title>
</svelte:head>

<div class="page app-page form">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/dashboard">Dashboard</a> <span aria-hidden="true">→</span>
		<a href="/classes">Classes</a> <span aria-hidden="true">→</span>
		<span>{cls.name}</span>
	</nav>

	<div class="app-head head-split">
		<div>
			<h1 class="app-title">{cls.name}</h1>
			<p class="app-sub">
				{#if (cls.section)}{cls.section} · {/if}
				{#if (cls.academic_year)}{cls.academic_year} · {/if}
				<span class="mono">/{cls.join_slug}</span>
				{#if (cls.deleted_at)}<span class="pill">archived</span>{/if}
			</p>
		</div>
		{#if (counts.activeSessions > 0)}
			<p class="live" role="status"><span class="pulse" aria-hidden="true"></span> Session live</p>
		{/if}
	</div>

	{#if (form?.error)}
		<p class="error" role="alert">{form.error}</p>
	{/if}
	{#if (form?.saved)}
		<p class="notice" role="status">Saved.</p>
	{/if}
	{#if (form?.regenerated)}
		<p class="notice" role="status">New join link issued. The old link no longer works.</p>
	{/if}
	{#if (form?.restored)}
		<p class="notice" role="status">Class restored.</p>
	{/if}

	<ClassTabs classId={cls.id} counts={counts} active="overview" />

	<div class="grid">
		<section class="card" aria-labelledby="edit-h">
			<h2 id="edit-h">Class info</h2>
			<form method="POST" action="?/save" use:enhance={refresh}>
				<label>
					<span>Class name *</span>
					<input type="text" name="name" required maxlength={120} value={cls.name} />
				</label>
				<div class="two">
					<label>
						<span>Section</span>
						<input type="text" name="section" maxlength={40} value={cls.section ?? ''} />
					</label>
					<label>
						<span>Academic year</span>
						<input type="text" name="academic_year" maxlength={20} value={cls.academic_year ?? ''} />
					</label>
				</div>
				<button class="btn btn-filled btn-sm" type="submit">Save changes</button>
			</form>
		</section>

		<section class="card" aria-labelledby="join-h">
			<h2 id="join-h">Student join link</h2>
			<p class="mono big">/{cls.join_slug}</p>
			<p class="muted">Students open this link — no account needed, no code inside. Regenerating invalidates the old link immediately.</p>
			<div class="join-btns">
				<button class="btn btn-filled btn-sm" type="button" onclick={() => void shareLink()}>
					{shareState === 'shared' ? 'Shared ✓' : shareState === 'copied' ? 'Link copied ✓' : 'Share link'}
				</button>
				{#if (shareState === 'failed')}
					<p class="muted" role="status">Copy didn't work — long-press the link above to copy it manually.</p>
				{/if}
			</div>
			<form method="POST" action="?/regenerateSlug" use:enhance={refresh}>
				<button class="btn btn-sm" type="submit">Regenerate link</button>
			</form>
		</section>
	</div>

	<section class="card danger" aria-labelledby="danger-h">
		<h2 id="danger-h">{cls.deleted_at ? 'Restore this class' : 'Archive this class'}</h2>
		<p class="muted">
			{cls.deleted_at
				? 'Restoring makes the class and its roster visible again.'
				: 'Archiving hides the class everywhere. Nothing is deleted — restore within 30 days.'}
		</p>
		{#if (cls.deleted_at)}
			<form method="POST" action="?/restore" use:enhance={refresh}>
				<button class="btn btn-sm btn-filled" type="submit">Restore class</button>
			</form>
		{:else}
			<form method="POST" action="?/archive" use:enhance>
				<button class="btn btn-sm btn-danger" type="submit">Archive class</button>
			</form>
		{/if}
	</section>
</div>

<style>
	.crumbs { color: var(--muted); font-size: 0.88rem; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
	.crumbs a { color: var(--muted); }
	.crumbs a:hover { color: var(--text); }
	.head-split { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
	.mono { font-family: var(--font-mono); font-size: 0.88em; }
	.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; margin-left: 6px; }
	.live { display: flex; align-items: center; gap: 8px; background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent); border-radius: 999px; padding: 6px 14px; font-size: 0.85rem; font-weight: 600; margin: 0; }
	.pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.notice { background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent); border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.grid { display: flex; flex-direction: column; gap: 12px; }
	.card { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; }
	.card h2 { margin: 0 0 14px; font-size: 1.05rem; }
	.card form { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
	.card label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; width: 100%; }
	.two { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; width: 100%; }
	@media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
	.card input { background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font: inherit; font-weight: 400; min-height: 44px; padding: 0 12px; width: 100%; }
	.card input:focus { border-color: var(--accent); outline: none; }
	.big { font-size: 1.5rem; color: var(--text); margin: 0 0 8px; }
	.muted { color: var(--muted); font-size: 0.9rem; }
	.join-btns { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin: 12px 0; }
	.danger { margin-top: 12px; }
	.btn-danger { color: #f2b8b8; }
</style>
