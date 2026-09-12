<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ClassTabs from '$lib/components/ClassTabs.svelte';

	let { data, form } = $props();
	let cls = $derived(data.class);

	const refresh = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			await invalidateAll();
		};
	};
</script>

<svelte:head>
	<title>Sessions · {cls.name} — Attendit</title>
</svelte:head>

<div class="page app-page">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/dashboard">Dashboard</a> <span aria-hidden="true">→</span>
		<a href="/classes">Classes</a> <span aria-hidden="true">→</span>
		<a href="/classes/{cls.id}">{cls.name}</a> <span aria-hidden="true">→</span>
		<span>Sessions</span>
	</nav>

	<div class="app-head head-split">
		<div>
			<h1 class="app-title">Sessions</h1>
			<p class="app-sub">{cls.name} · every attendance event, newest first</p>
		</div>
		<a class="btn btn-filled btn-sm" href="/classes/{cls.id}/session/new">+ New session</a>
	</div>

	<ClassTabs classId={cls.id} counts={data.counts} active="sessions" />

	{#if (form?.error)}
		<p class="error" role="alert">{form.error}</p>
	{/if}

	<div class="list-head">
		{#if (data.showRemoved)}
			<a class="btn btn-sm" href="?">Hide removed</a>
		{:else}
			<a class="btn btn-sm" href="?removed=1">Show removed</a>
		{/if}
	</div>

	{#if (data.sessions.length === 0)}
		<div class="empty-hero">
			<p><strong>{data.showRemoved ? 'Nothing removed.' : 'No sessions yet.'}</strong></p>
			{#if (!data.showRemoved)}
				<p class="muted">Start one and the room can check in within seconds.</p>
				<a class="btn btn-sm" href="/classes/{cls.id}/session/new"><span aria-hidden="true">+</span> New session</a>
			{/if}
		</div>
	{:else}
		<ul class="sess-list">
			{#each data.sessions as s}
				<li>
					{#if (s.status === 'active' && !s.deleted_at)}
						<a class="s-main" href="/classes/{cls.id}/session/{s.id}">
							<span class="s-name">{s.subject_name ?? 'No subject'} <span class="live-pill">live</span></span>
							<span class="s-meta">code <span class="mono">{s.session_code}</span> · radius {s.radius_meters} m · opened {new Date(s.created_at).toLocaleString()}</span>
						</a>
						<span class="chev" aria-hidden="true">→</span>
					{:else if (s.deleted_at)}
						<div class="s-main">
							<span class="s-name">{s.subject_name ?? 'No subject'} <span class="pill">removed</span></span>
							<span class="s-meta">responses kept · restore to see it in history</span>
						</div>
						<form method="POST" action="?/restore" use:enhance={refresh}>
							<input type="hidden" name="id" value={s.id} />
							<button class="btn btn-sm" type="submit">Restore</button>
						</form>
					{:else}
						<a class="s-main" href="/classes/{cls.id}/session/{s.id}/results">
							<span class="s-name">{s.subject_name ?? 'No subject'} <span class="pill">{s.status}</span></span>
							<span class="s-meta">closed {s.closes_at ? new Date(s.closes_at).toLocaleString() : '—'} · open results →</span>
						</a>
						{#if (s.sheet_export_id)}
							<a class="exported" href={s.sheet_export_id} target="_blank" rel="noreferrer" title="Open exported sheet">exported</a>
						{/if}
						<form method="POST" action="?/archive" use:enhance={refresh}>
							<input type="hidden" name="id" value={s.id} />
							<button class="btn btn-sm btn-danger" type="submit" aria-label="Archive session {s.subject_name ?? ''}">Archive</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.crumbs { color: var(--muted); font-size: 0.88rem; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
	.crumbs a { color: var(--muted); }
	.crumbs a:hover { color: var(--text); }
	.head-split { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.list-head { display: flex; justify-content: flex-end; margin-bottom: 12px; }
	.btn-danger { color: #f2b8b8; }
	.empty-hero { border: 1px dashed var(--border); border-radius: var(--shape-m); background: var(--panel); padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--muted); }
	.empty-hero p { margin: 0; }
	.empty-hero strong { color: var(--text); font-size: 1.05rem; }
	.empty-hero .btn { margin-top: 12px; }
	.sess-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--shape-m); overflow: hidden; }
	.sess-list li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
	.sess-list li:last-child { border-bottom: none; }
	.sess-list a.s-main:hover { text-decoration: underline; text-underline-offset: 3px; }
	.s-main { flex: 1; text-decoration: none; color: var(--text); min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.s-name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
	.s-meta { color: var(--muted); font-size: 0.88rem; }
	.mono { font-family: var(--font-mono); font-size: 0.85em; }
	.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; }
	.exported { border: 1px solid var(--accent-dim); color: var(--accent); border-radius: 999px; padding: 2px 10px; font-size: 0.75rem; text-decoration: none; white-space: nowrap; }
	.exported:hover { text-decoration: underline; }
	.live-pill { background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent); border-radius: 999px; padding: 1px 8px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
	.chev { color: var(--muted); }
</style>
