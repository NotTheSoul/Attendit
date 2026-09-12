<script lang="ts">
	let { data } = $props();

	let classes = $derived(data.classes);
	let active = $derived(data.activeSessions);
	let recent = $derived(data.recentSessions);
</script>

<svelte:head>
	<title>Dashboard — Attendit</title>
</svelte:head>

<div class="page app-page">
	<div class="app-head">
		<h1 class="app-title">Dashboard</h1>
	</div>

	{#if !data.configured}
		<p class="banner" role="status">Local SQLite mode — data stays on this machine.</p>
	{/if}

	{#if active.length > 0}
		<section class="live" aria-label="Live session">
			<span class="pulse" aria-hidden="true"></span>
			<div>
				<strong>LIVE — {active[0].class_name}{active[0].subject_name ? ` · ${active[0].subject_name}` : ''}</strong>
				<span class="muted">{active[0].response_count} check-ins so far</span>
			</div>
			<a class="btn btn-sm" href="/classes/{active[0].class_id}">Open session</a>
		</section>
	{:else}
		<p class="quiet" role="status">No session is live right now.</p>
	{/if}

	<form method="GET" class="toolbar" role="search" aria-label="Filter classes">
		<div class="t-search">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
				<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
			</svg>
			<input type="search" name="q" placeholder="Search for a class" value={data.search} aria-label="Search for a class" />
		</div>
		<select name="status" aria-label="Filter by status" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			<option value="all" selected={data.status === 'all'}>All classes</option>
			<option value="archived" selected={data.status === 'archived'}>Archived</option>
		</select>
		<select name="sort" aria-label="Sort classes" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			<option value="newest" selected={data.sort === 'newest'}>Sorted by newest</option>
			<option value="name" selected={data.sort === 'name'}>Sorted by name</option>
		</select>
		<a class="btn btn-filled btn-sm new-btn" href="/classes#create">
			<span aria-hidden="true">+</span> New class
		</a>
	</form>

	{#if classes.length === 0}
		<div class="empty-hero">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M12 3v8" /><path d="M4 7l8 4 8-4" /><path d="M18 13v5" /><path d="M16.5 15.5h3" />
			</svg>
			<p><strong>{data.search || data.status === 'archived' ? 'No classes found' : 'Create a class'}</strong></p>
			<p class="muted">{data.search || data.status === 'archived' ? 'Try a different search or filter.' : 'Launch attendance for a subject in minutes.'}</p>
			{#if !data.search && data.status !== 'archived'}
				<a class="btn btn-sm" href="/classes#create"><span aria-hidden="true">+</span> New class</a>
			{/if}
		</div>
	{:else}
		<ul class="class-list">
			{#each classes as c}
				<li>
					<a class="c-main" href="/classes/{c.id}">
						<span class="c-name">
							{c.name}
							{#if c.live}<span class="live-pill">live</span>{/if}
							{#if c.deleted_at}<span class="pill">archived</span>{/if}
						</span>
						<span class="c-meta">
							{#if c.section}{c.section} · {/if}
							{#if c.academic_year}{c.academic_year} · {/if}
							<span class="mono">/{c.join_slug}</span>
						</span>
					</a>
					<span class="chev" aria-hidden="true">→</span>
				</li>
			{/each}
		</ul>
	{/if}

	<section aria-labelledby="recent-h" class="app-section">
		<h2 id="recent-h">Recent sessions</h2>
		{#if recent.length === 0}
			<p class="muted">Sessions you run will appear here with attendance counts and status.</p>
		{:else}
			<div class="table-container">
			<table class="tbl">
				<thead>
					<tr><th scope="col">Class</th><th scope="col">Subject</th><th scope="col">Date</th><th scope="col">Check-ins</th><th scope="col">Status</th></tr>
				</thead>
				<tbody>
					{#each recent as s}
						<tr>
							<td data-label="Class">{s.class_name}</td>
							<td data-label="Subject">{s.subject_name ?? '—'}</td>
							<td data-label="Date" class="mono">{new Date(s.created_at).toLocaleDateString()}</td>
							<td data-label="Check-ins">{s.response_count}</td>
							<td data-label="Status"><span class="status">{s.status}</span>{#if (s.sheet_export_id)} <a class="exported" href={s.sheet_export_id} target="_blank" rel="noreferrer" title="Open exported sheet">exported</a>{/if}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.banner {
		background: #2a1f0d;
		border: 1px solid var(--border);
		color: #f0c987;
		border-radius: var(--shape-s);
		padding: 10px 14px;
		font-size: 0.9rem;
		margin: 0 0 16px;
	}
	.live {
		display: flex;
		align-items: center;
		gap: 12px;
		background: #0f2a1e;
		border: 1px solid var(--accent-dim);
		border-radius: var(--shape-m);
		padding: 14px 18px;
		margin-bottom: 20px;
	}
	.live .btn { margin-left: auto; }
	.pulse { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex: none; }
	.quiet {
		color: var(--muted);
		border: 1px dashed var(--border);
		border-radius: var(--shape-m);
		padding: 12px 16px;
		margin: 0 0 20px;
	}
	.toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
	.t-search {
		flex: 1;
		min-width: 200px;
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--shape-s);
		padding: 0 12px;
		color: var(--muted);
	}
	.t-search:focus-within { border-color: var(--accent); }
	.t-search input {
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
	.toolbar select {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--shape-s);
		color: var(--text);
		font: inherit;
		font-size: 0.88rem;
		min-height: 38px;
		padding: 0 10px;
		cursor: pointer;
	}
	.new-btn { min-height: 38px; }
	.empty-hero {
		border: 1px dashed var(--border);
		border-radius: var(--shape-m);
		background: var(--panel);
		padding: 56px 24px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		color: var(--muted);
	}
	.empty-hero p { margin: 0; }
	.empty-hero strong { color: var(--text); font-size: 1.05rem; }
	.empty-hero .btn { margin-top: 12px; }
	.class-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--shape-m); overflow: hidden; }
	.class-list li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
	.class-list li:last-child { border-bottom: none; }
	.class-list li:hover { background: var(--panel-2); }
	.c-main { flex: 1; text-decoration: none; color: var(--text); min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.c-name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
	.c-meta { color: var(--muted); font-size: 0.88rem; }
	.mono { font-family: var(--font-mono); font-size: 0.85em; }
	.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; }
	.live-pill {
		background: #0f2a1e;
		border: 1px solid var(--accent-dim);
		color: var(--accent);
		border-radius: 999px;
		padding: 1px 8px;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.chev { color: var(--muted); }
	.muted { color: var(--muted); }
	.tbl { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
	.tbl th, .tbl td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
	.tbl th { color: var(--muted); font-weight: 600; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.tbl tbody tr:hover { background: var(--panel); }
	.status { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 0.82rem; }
	.exported { border: 1px solid var(--accent-dim); color: var(--accent); border-radius: 999px; padding: 2px 10px; font-size: 0.78rem; text-decoration: none; white-space: nowrap; margin-left: 6px; }
	.exported:hover { text-decoration: underline; }
	.table-container { container-type: inline-size; width: 100%; }
	.tbl td::before {
		content: attr(data-label);
		display: none;
		font-weight: 600;
		color: var(--muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	/* Narrow container: rows become labeled cards, no horizontal scroll */
	@container (max-width: 32rem) {
		.tbl thead { display: none; }
		.tbl, .tbl tbody { display: block; }
		.tbl tr {
			display: block;
			border: 1px solid var(--border);
			border-radius: var(--shape-m);
			background: var(--panel);
			padding: 6px 14px;
			margin-bottom: 10px;
		}
		.tbl td {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
			padding: 8px 0;
			border-bottom: 1px dotted var(--border);
		}
		.tbl td:last-child { border-bottom: none; }
		.tbl td::before { display: inline; }
	}
	@media (max-width: 480px) {
		/* Tiny screens: search owns a row, filters share one, button spans full */
		.toolbar { display: grid; grid-template-columns: 1fr 1fr; }
		.t-search { grid-column: 1 / -1; }
		.toolbar select { width: 100%; }
		.new-btn { grid-column: 1 / -1; }
	}
</style>
