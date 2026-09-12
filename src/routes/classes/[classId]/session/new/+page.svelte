<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import ClassTabs from '$lib/components/ClassTabs.svelte';

	let { data, form } = $props();
	let cls = $derived(data.class);
	let starting = $state(false);
</script>

<svelte:head>
	<title>New session · {cls.name} — Attendit</title>
</svelte:head>

<div class="page app-page form">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/dashboard">Dashboard</a> <span aria-hidden="true">→</span>
		<a href="/classes">Classes</a> <span aria-hidden="true">→</span>
		<a href="/classes/{cls.id}">{cls.name}</a> <span aria-hidden="true">→</span>
		<span>New session</span>
	</nav>

	<div class="app-head">
		<h1 class="app-title">Start a session</h1>
		<p class="app-sub">Opens immediately with a room-readable code. Students join from your class link.</p>
	</div>

	<ClassTabs classId={cls.id} counts={data.counts} active="sessions" />

	{#if (form?.error)}
		<p class="error" role="alert">{form.error}</p>
	{/if}

	<section class="card" aria-labelledby="cfg-h">
		<h2 id="cfg-h">Session setup</h2>
		<form method="POST" action="?/start" use:enhance={() => {
			starting = true;
			return async ({ update, result }: { update: () => Promise<void>; result: ActionResult }) => {
				try {
					await update();
					if (result.type === 'success') {
						const started = (result.data as { started?: { id?: string } } | null)?.started;
						if (started?.id) {
							await invalidateAll();
							await goto(`/classes/${cls.id}/session/${started.id}`);
							return;
						}
					}
					await invalidateAll();
				} finally {
					starting = false;
				}
			};
		}}>
			<label>
				<span>Subject</span>
				{#if (data.subjects.length === 0)}
					<p class="muted">No subjects yet — <a href="/classes/{cls.id}/subjects">add one first</a>, or start without a subject.</p>
				{:else}
					<select name="subject_id">
						<option value="">No subject</option>
						{#each data.subjects as s}
							<option value={s.id}>{s.name}{s.code ? ` · ${s.code}` : ''}</option>
						{/each}
					</select>
				{/if}
			</label>
			<div class="two">
				<label>
					<span>Radius (meters)</span>
					<input type="number" name="radius_meters" value="100" min="10" max="2000" step="10" inputmode="numeric" />
				</label>
				<label>
					<span>Code length</span>
					<select name="code_length">
						<option value="4">4 digits</option>
						<option value="6" selected>6 digits</option>
						<option value="8">8 digits</option>
					</select>
				</label>
			</div>
			<button class="btn btn-filled" type="submit" disabled={starting} aria-busy={starting}>
				{starting ? 'Opening…' : 'Start session now'}
			</button>
			<p class="muted">Stays open until you close it — no timeout.</p>
		</form>
	</section>
</div>

<style>
	.crumbs { color: var(--muted); font-size: 0.88rem; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
	.crumbs a { color: var(--muted); }
	.crumbs a:hover { color: var(--text); }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.card { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; }
	.card h2 { margin: 0 0 14px; font-size: 1.05rem; }
	.card form { display: flex; flex-direction: column; gap: 14px; }
	.card label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; }
	.two { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
	@media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
	.card input, .card select { background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font: inherit; font-weight: 400; min-height: 44px; padding: 0 12px; width: 100%; }
	.card input:focus, .card select:focus { border-color: var(--accent); outline: none; }
	.muted { color: var(--muted); font-size: 0.9rem; margin: 0; }
	.muted a { color: var(--accent); }
</style>
