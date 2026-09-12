<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import ClassTabs from '$lib/components/ClassTabs.svelte';

	let { data, form } = $props();
	let cls = $derived(data.class);
	let editingId: string | null = $state(null);
	let adding = $state(false);

	const refresh = () => {
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update();
			await invalidateAll();
		};
	};

	const saveEdit = () => {
		return async ({
			update,
			result
		}: {
			update: () => Promise<void>;
			result: ActionResult;
		}) => {
			await update();
			if (result.type === 'success') editingId = null;
			await invalidateAll();
		};
	};
</script>

<svelte:head>
	<title>Subjects · {cls.name} — Attendit</title>
</svelte:head>

<div class="page app-page form">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/dashboard">Dashboard</a> <span aria-hidden="true">→</span>
		<a href="/classes">Classes</a> <span aria-hidden="true">→</span>
		<a href="/classes/{cls.id}">{cls.name}</a> <span aria-hidden="true">→</span>
		<span>Subjects</span>
	</nav>

	<div class="app-head">
		<h1 class="app-title">Subjects</h1>
		<p class="app-sub">{cls.name} · reused every time you start a session</p>
	</div>

	<ClassTabs classId={cls.id} counts={data.counts} active="subjects" />

	{#if (form?.error)}
		<p class="error" role="alert">{form.error}</p>
	{/if}
	{#if (form?.added)}
		<p class="notice" role="status">{form.added.name} added.</p>
	{/if}
	{#if (form?.saved)}
		<p class="notice" role="status">Subject updated.</p>
	{/if}

	{#if (data.subjects.length === 0)}
		<div class="empty">
			<p><strong>No subjects yet.</strong></p>
			<p>Add the subjects this class actually meets for — you'll pick one each session.</p>
		</div>
	{:else}
		<ul class="subj-list">
			{#each data.subjects as s}
				<li>
					{#if editingId === s.id && !s.deleted_at}
						<form method="POST" action="?/save" use:enhance={saveEdit} class="edit-form">
							<input type="hidden" name="id" value={s.id} />
							<input type="text" name="name" required maxlength={120} value={s.name} aria-label="Subject name" />
							<input type="text" name="code" maxlength={40} value={s.code ?? ''} aria-label="Subject code" placeholder="Code" />
							<span class="edit-btns">
								<button class="btn btn-filled btn-sm" type="submit">Save</button>
								<button class="btn btn-sm" type="button" onclick={() => (editingId = null)}>Cancel</button>
							</span>
						</form>
					{:else}
						<div class="s-main">
							<span class="s-name">{s.name}</span>
							{#if (s.code)}<span class="mono muted">{s.code}</span>{/if}
							{#if (s.deleted_at)}<span class="pill">removed</span>{/if}
						</div>
						<span class="row-actions">
							{#if (!s.deleted_at)}
								<button class="btn btn-sm" type="button" onclick={() => (editingId = s.id)}>Edit</button>
								<form method="POST" action="?/remove" use:enhance={refresh}>
									<input type="hidden" name="id" value={s.id} />
									<button class="btn btn-sm btn-danger" type="submit" aria-label="Remove {s.name}">Remove</button>
								</form>
							{:else}
								<form method="POST" action="?/restore" use:enhance={refresh}>
									<input type="hidden" name="id" value={s.id} />
									<button class="btn btn-sm" type="submit">Restore</button>
								</form>
							{/if}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<section class="card" aria-labelledby="add-h">
		<h2 id="add-h">Add subject</h2>
		<form method="POST" action="?/add" use:enhance={() => {
			adding = true;
			return async ({ update }) => {
				try {
					await update({ reset: true });
					await invalidateAll();
				} finally {
					adding = false;
				}
			};
		}}>
			<div class="two">
				<label>
					<span>Name *</span>
					<input type="text" name="name" required maxlength={120} value={form?.name ?? ''} disabled={adding} placeholder="e.g. Mathematics" />
				</label>
				<label>
					<span>Code</span>
					<input type="text" name="code" maxlength={40} value={form?.code ?? ''} disabled={adding} placeholder="e.g. MATH-201" />
				</label>
			</div>
			<button class="btn btn-filled" type="submit" disabled={adding} aria-busy={adding}>
				{adding ? 'Adding…' : 'Add subject'}
			</button>
		</form>
	</section>
</div>

<style>
	.crumbs { color: var(--muted); font-size: 0.88rem; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
	.crumbs a { color: var(--muted); }
	.crumbs a:hover { color: var(--text); }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.notice { background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent); border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.empty { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; color: var(--muted); }
	.empty p { margin: 4px 0; }
	.empty strong { color: var(--text); }
	.subj-list { list-style: none; margin: 0 0 8px; padding: 0; border: 1px solid var(--border); border-radius: var(--shape-m); overflow: hidden; }
	.subj-list li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
	.subj-list li:last-child { border-bottom: none; }
	.s-main { flex: 1; display: flex; align-items: baseline; gap: 10px; min-width: 0; flex-wrap: wrap; }
	.s-name { font-weight: 600; }
	.mono { font-family: var(--font-mono); font-size: 0.85em; }
	.muted { color: var(--muted); }
	.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; }
	.row-actions { display: flex; gap: 6px; align-items: center; }
	.row-actions form { margin: 0; }
	.btn-danger { color: #f2b8b8; }
	.edit-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; flex: 1; }
	.edit-form input { background: var(--bg); border: 1px solid var(--accent-dim); border-radius: var(--shape-s); color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; flex: 1; min-width: 120px; }
	.edit-form input:focus { border-color: var(--accent); outline: none; }
	.edit-btns { display: flex; gap: 8px; }
	.card { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; margin-top: 20px; }
	.card h2 { margin: 0 0 14px; font-size: 1.05rem; }
	.card form { display: flex; flex-direction: column; gap: 14px; }
	.card label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; }
	.two { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
	@media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
	.card input { background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font: inherit; font-weight: 400; min-height: 44px; padding: 0 12px; width: 100%; }
	.card input:focus { border-color: var(--accent); outline: none; }
</style>
