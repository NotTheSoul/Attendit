<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();
	let cls = $derived(data.class);
	let session = $derived(data.session);
	let report = $derived(data.report);
	let exporting = $state(false);

	const STATUS_LABEL: Record<string, string> = {
		accepted: 'Accepted',
		rejected_distance: 'Too far away',
		rejected_code: 'Incorrect code',
		duplicate: 'Already submitted',
		host_offline: 'Host offline',
		absent: 'Absent'
	};
</script>

<svelte:head>
	<title>Results · {cls.name} — Attendit</title>
</svelte:head>

<div class="page app-page">
	<nav class="crumbs" aria-label="Breadcrumb">
		<a href="/dashboard">Dashboard</a> <span aria-hidden="true">→</span>
		<a href="/classes">Classes</a> <span aria-hidden="true">→</span>
		<a href="/classes/{cls.id}">{cls.name}</a> <span aria-hidden="true">→</span>
		<a href="/classes/{cls.id}/sessions">Sessions</a> <span aria-hidden="true">→</span>
		<span>Results</span>
	</nav>

	<div class="app-head head-split">
		<div>
			<h1 class="app-title">
				{report.subjectName ?? 'Session'} <span class="pill">{session.status}</span>
			</h1>
			<p class="app-sub">
				{cls.name} · {new Date(report.session.created_at).toLocaleString()}
				{report.session.closes_at ? ` → ${new Date(report.session.closes_at).toLocaleString()}` : ''}
			</p>
		</div>
		<a class="btn btn-sm" href="/api/sessions/{session.id}/csv?classId={cls.id}">Download CSV</a>
	</div>

	<section class="totals" aria-label="Attendance totals">
		<div class="total"><span class="t-num">{report.totals.accepted}</span><span class="t-lab">present</span></div>
		<div class="total"><span class="t-num">{report.totals.rejected}</span><span class="t-lab">rejected</span></div>
		<div class="total"><span class="t-num">{report.totals.absent}</span><span class="t-lab">absent</span></div>
		<div class="total"><span class="t-num">{report.totals.rate}%</span><span class="t-lab">rate</span></div>
	</section>

	<section class="card" aria-labelledby="sheets-h">
		<h2 id="sheets-h">Google Sheets</h2>
		{#if (form?.exported)}
			<p class="notice" role="status">Exported. <a href={form.exported} target="_blank" rel="noreferrer">Open the sheet →</a></p>
		{/if}
		{#if (form?.exportError)}
			<p class="error" role="alert">{form.exportError}</p>
		{/if}
		{#if (data.exportedTo && !form?.exported)}
			<p class="muted">Previously exported to <a href={data.exportedTo} target="_blank" rel="noreferrer">this sheet</a>. Re-exporting overwrites it.</p>
		{/if}
		{#if (!data.sheetsReady)}
			<p class="muted">Sheets export isn't configured on this server yet (needs a service-account key). CSV above always works.</p>
		{:else}
			<form
				method="POST"
				action="?/exportSheets"
				use:enhance={() => {
					exporting = true;
					return async ({ update }) => {
						try {
							await update();
							await invalidateAll();
						} finally {
							exporting = false;
						}
					};
				}}
			>
				<label>
					<span>Spreadsheet ID <em>(blank = server default)</em></span>
					<input type="text" name="spreadsheet_id" value={form?.spreadsheetId ?? ''} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" inputmode="url" />
				</label>
				<button class="btn" type="submit" disabled={exporting} aria-busy={exporting}>
					{exporting ? 'Exporting…' : 'Export to Sheets'}
				</button>
			</form>
		{/if}
	</section>

	<section class="app-section" aria-labelledby="rows-h">
		<h2 id="rows-h">Student by student</h2>
		<div class="table-container">
		<table class="tbl">
			<thead>
				<tr><th scope="col">Student</th><th scope="col">Reg ID</th><th scope="col">Status</th><th scope="col">Method</th><th scope="col">Distance</th><th scope="col">Time</th></tr>
			</thead>
			<tbody>
				{#each report.rows as r}
					<tr>
						<td data-label="Student" class="s-name">{r.student_name}</td>
						<td data-label="Reg ID" class="mono">{r.registration_id}</td>
						<td data-label="Status"><span class="status" class:ok={r.status === 'accepted'} class:mutedc={r.status === 'absent'}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
						<td data-label="Method">{r.method ?? '—'}</td>
						<td data-label="Distance">{r.distance_m != null ? `${r.distance_m} m` : '—'}</td>
						<td data-label="Time" class="mono">{r.submitted_at ? new Date(r.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
	</section>
</div>

<style>
	.crumbs { color: var(--muted); font-size: 0.88rem; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
	.crumbs a { color: var(--muted); }
	.crumbs a:hover { color: var(--text); }
	.head-split { display: flex; justify-content: space-between; align-items: start; gap: 16px; }
	.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; vertical-align: middle; }
	.totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
	@media (max-width: 560px) { .totals { grid-template-columns: repeat(2, 1fr); } }
	.total { background: var(--panel); border-radius: var(--shape-m); padding: 16px; display: flex; flex-direction: column; gap: 2px; }
	.t-num { font-size: 1.7rem; font-weight: 600; letter-spacing: -0.02em; }
	.t-lab { color: var(--muted); font-size: 0.85rem; }
	.card { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; margin-bottom: 8px; }
	.card h2 { margin: 0 0 12px; font-size: 1.05rem; }
	.card form { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
	.card label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; width: 100%; }
	.card label em { font-style: normal; font-weight: 400; color: var(--muted); }
	.card input { background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font: inherit; font-weight: 400; min-height: 44px; padding: 0 12px; width: 100%; font-family: var(--font-mono); font-size: 0.85rem; }
	.card input:focus { border-color: var(--accent); outline: none; }
	.notice { background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent); border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.notice a { color: var(--accent); font-weight: 700; }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.muted { color: var(--muted); font-size: 0.9rem; }
	.muted a { color: var(--accent); }
	.table-container { container-type: inline-size; width: 100%; }
	.tbl { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
	.tbl th, .tbl td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
	.tbl th { color: var(--muted); font-weight: 600; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; }
	.tbl tbody tr:hover { background: var(--panel); }
	.s-name { font-weight: 600; }
	.mono { font-family: var(--font-mono); font-size: 0.85em; }
	.status { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 0.8rem; white-space: nowrap; color: #f2b8b8; }
	.status.ok { color: var(--accent); border-color: var(--accent-dim); }
	.status.mutedc { color: var(--muted); }
	.tbl td::before { content: attr(data-label); display: none; font-weight: 600; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
	@container (max-width: 36rem) {
		.tbl thead { display: none; }
		.tbl, .tbl tbody { display: block; }
		.tbl tr { display: block; border: 1px solid var(--border); border-radius: var(--shape-m); background: var(--panel); padding: 6px 14px; margin-bottom: 10px; }
		.tbl td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px dotted var(--border); }
		.tbl td:last-child { border-bottom: none; }
		.tbl td::before { display: inline; }
	}
</style>
