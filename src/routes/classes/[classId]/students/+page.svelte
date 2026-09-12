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

	// Edit rows close only on success — failures keep the editor open with the error.
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
	<title>Students · {cls.name} — Attendit</title>
</svelte:head>

<div class="page app-page">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/dashboard">Dashboard</a> <span aria-hidden="true">→</span>
		<a href="/classes">Classes</a> <span aria-hidden="true">→</span>
		<a href="/classes/{cls.id}">{cls.name}</a> <span aria-hidden="true">→</span>
		<span>Students</span>
	</nav>

	<div class="app-head">
		<h1 class="app-title">Students</h1>
		<p class="app-sub">{cls.name} · {data.students.filter((s) => !s.deleted_at).length} on roster</p>
	</div>

	<ClassTabs classId={cls.id} counts={data.counts} active="students" />

	{#if (form?.error)}
		<p class="error" role="alert">{form.error}</p>
	{/if}
	{#if (form?.added)}
		<p class="notice" role="status">{form.added.full_name} added to the roster.</p>
	{/if}
	{#if (form?.saved)}
		<p class="notice" role="status">Student updated.</p>
	{/if}
	{#if (form?.importResult)}
		<p class="notice" role="status">
			Import complete: {form.importResult.added} added
			{#if (form.importResult.skipped)}· {form.importResult.skipped} already on roster{/if}
			{#if (form.importResult.errors.length)}· {form.importResult.errors.length} need attention{/if}
		</p>
		{#if (form.importResult.errors.length)}
			<ul class="import-errors">
				{#each form.importResult.errors.slice(0, 8) as e}
					<li>Line {e.line}: {e.reason}</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<form method="GET" class="search-row" role="search">
		<input type="search" name="q" placeholder="Search name or registration ID…" value={data.search} aria-label="Search students" />
		<button class="btn btn-sm" type="submit">Search</button>
		{#if (data.showRemoved)}
			<a class="btn btn-sm" href="?">Hide removed</a>
		{:else}
			<a class="btn btn-sm" href="?removed=1">Show removed</a>
		{/if}
	</form>

	{#if (data.students.length === 0)}
		<div class="empty">
			<p><strong>{data.search ? 'No students match.' : 'No students added yet.'}</strong></p>
			<p>{data.search ? 'Try a different term.' : 'Add students manually below, or paste a roster to import many at once.'}</p>
		</div>
	{:else}
		<div class="table-container">
		<table class="tbl">
			<thead>
				<tr><th scope="col">Name</th><th scope="col">Registration ID</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr>
			</thead>
			<tbody>
				{#each data.students as s}
					{#if editingId === s.id && !s.deleted_at}
						<tr class="edit-row">
							<td colspan="4">
								<form method="POST" action="?/save" use:enhance={saveEdit} class="edit-form">
									<input type="hidden" name="id" value={s.id} />
									<input type="text" name="full_name" required maxlength={120} value={s.full_name} aria-label="Full name" />
									<input type="text" name="registration_id" required maxlength={60} value={s.registration_id} aria-label="Registration ID" />
									<span class="edit-btns">
										<button class="btn btn-filled btn-sm" type="submit">Save</button>
										<button class="btn btn-sm" type="button" onclick={() => (editingId = null)}>Cancel</button>
									</span>
								</form>
							</td>
						</tr>
					{:else}
						<tr>
							<td data-label="Name" class="s-name">{s.full_name}</td>
							<td data-label="Registration ID" class="mono">{s.registration_id}</td>
							<td data-label="Status">
								{#if (s.deleted_at)}<span class="pill">removed</span>{:else}<span class="ok">on roster</span>{/if}
							</td>
							<td data-label="Actions" class="row-actions">
								{#if (!s.deleted_at)}
									<button class="btn btn-sm" type="button" onclick={() => (editingId = s.id)}>Edit</button>
									<form method="POST" action="?/remove" use:enhance={refresh}>
										<input type="hidden" name="id" value={s.id} />
										<button class="btn btn-sm btn-danger" type="submit" aria-label="Remove {s.full_name}">Remove</button>
									</form>
								{:else}
									<form method="POST" action="?/restore" use:enhance={refresh}>
										<input type="hidden" name="id" value={s.id} />
										<button class="btn btn-sm" type="submit">Restore</button>
									</form>
								{/if}
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
		</div>
	{/if}

	<div class="two-col">
		<section class="card" aria-labelledby="add-h">
			<h2 id="add-h">Add student</h2>
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
				<label>
					<span>Full name *</span>
					<input type="text" name="full_name" required maxlength={120} value={form?.full_name ?? ''} disabled={adding} placeholder="e.g. Aarav Sharma" />
				</label>
				<label>
					<span>Registration ID *</span>
					<input type="text" name="registration_id" required maxlength={60} value={form?.registration_id ?? ''} disabled={adding} placeholder="e.g. BCA-2026-014" />
				</label>
				<button class="btn btn-filled" type="submit" disabled={adding} aria-busy={adding}>
					{adding ? 'Adding…' : 'Add student'}
				</button>
			</form>
		</section>

		<section class="card" aria-labelledby="import-h">
			<h2 id="import-h">Import roster</h2>
			<p class="muted">One per line: <span class="mono">Full Name, REG123</span>. Comma, semicolon, or tab separated. Duplicates are skipped, problems are reported per line.</p>
			<form method="POST" action="?/import" use:enhance={refresh}>
				<label>
					<span>Paste rows</span>
					<textarea name="roster_text" rows={5} placeholder={"Aarav Sharma, BCA-2026-014\nDiya Patel, BCA-2026-015"}>{form?.roster_text ?? ''}</textarea>
				</label>
				<button class="btn" type="submit">Import</button>
			</form>
		</section>
	</div>
</div>

<style>
	.crumbs { color: var(--muted); font-size: 0.88rem; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
	.crumbs a { color: var(--muted); }
	.crumbs a:hover { color: var(--text); }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.notice { background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent); border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.import-errors { color: #f2b8b8; font-size: 0.88rem; margin: 8px 0 0; padding-left: 20px; }
	.search-row { display: flex; gap: 8px; margin-bottom: 16px; }
	.search-row input[type='search'] { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; min-width: 0; }
	.search-row input:focus { border-color: var(--accent); outline: none; }
	.empty { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; color: var(--muted); }
	.empty p { margin: 4px 0; }
	.empty strong { color: var(--text); }
	.table-container { container-type: inline-size; width: 100%; }
	.tbl { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
	.tbl th, .tbl td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
	.tbl th { color: var(--muted); font-weight: 600; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.tbl tbody tr:hover { background: var(--panel); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.s-name { font-weight: 600; }
	.mono { font-family: var(--font-mono); font-size: 0.88em; }
	.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; }
	.ok { color: var(--accent); font-size: 0.88rem; }
	.row-actions { white-space: nowrap; }
	.row-actions form { display: inline; margin-left: 6px; }
	.btn-danger { color: #f2b8b8; }
	.tbl td::before { content: attr(data-label); display: none; font-weight: 600; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
	@container (max-width: 32rem) {
		.tbl thead { display: none; }
		.tbl, .tbl tbody { display: block; }
		.tbl tr { display: block; border: 1px solid var(--border); border-radius: var(--shape-m); background: var(--panel); padding: 6px 14px; margin-bottom: 10px; }
		.tbl td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px dotted var(--border); }
		.tbl td:last-child { border-bottom: none; }
		.tbl td::before { display: inline; }
		.row-actions { justify-content: flex-end; }
	}
	.edit-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
	.edit-form input { background: var(--bg); border: 1px solid var(--accent-dim); border-radius: var(--shape-s); color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; flex: 1; min-width: 140px; }
	.edit-form input:focus { border-color: var(--accent); outline: none; }
	.edit-btns { display: flex; gap: 8px; }
	.two-col { display: grid; gap: 12px; margin-top: 20px; }
	@media (min-width: 720px) { .two-col { grid-template-columns: 1fr 1fr; } }
	.card { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; }
	.card h2 { margin: 0 0 14px; font-size: 1.05rem; }
	.card form { display: flex; flex-direction: column; gap: 14px; }
	.card label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; }
	.card input, .card textarea { background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font: inherit; font-weight: 400; min-height: 44px; padding: 10px 12px; width: 100%; }
	.card input:focus, .card textarea:focus { border-color: var(--accent); outline: none; }
	.muted { color: var(--muted); font-size: 0.9rem; margin: 0 0 4px; }
</style>
