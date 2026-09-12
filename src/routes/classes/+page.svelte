<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();
	let creating = $state(false);

	// Every mutation refreshes the list, so the view can never go stale.
	// (Stale views are what caused repeat clicks → duplicate classes.)
	const refresh = () => {
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update();
			await invalidateAll();
		};
	};
</script>

<svelte:head>
	<title>Classes — Attendit</title>
</svelte:head>

<div class="page app-page form">
	<div class="app-head">
		<h1 class="app-title">Classes</h1>
		<p class="app-sub">Every class holds its own students, subjects, and sessions.</p>
	</div>

	{#if (data.error)}
		<p class="error" role="alert">{data.error}</p>
	{/if}
	{#if (form?.error)}
		<p class="error" role="alert">{form.error}</p>
	{/if}
	{#if (form?.created)}
		<p class="notice" role="status">
			Class “{form.created.name}” created.
			<a href="/classes/{form.created.id}">Open it →</a>
		</p>
	{/if}

	<form method="GET" class="search-row" role="search">
		<input type="search" name="q" placeholder="Search classes…" value={data.search} aria-label="Search classes" />
		{#if (data.showArchived)}
			<input type="hidden" name="archived" value="1" />
		{/if}
		<button class="btn btn-sm" type="submit">Search</button>
		{#if (data.showArchived)}
			<a class="btn btn-sm" href="/classes">Hide archived</a>
		{:else}
			<a class="btn btn-sm" href="/classes?archived=1">Show archived</a>
		{/if}
	</form>

	{#if (data.classes.length === 0)}
		<div class="empty">
			<p><strong>{data.search ? 'No classes match your search.' : 'No classes yet.'}</strong></p>
			<p>{data.search ? 'Try a different term, or create the class below.' : 'Create your first class to start managing attendance.'}</p>
		</div>
	{:else}
		<ul class="class-list">
			{#each data.classes as c}
				<li class:archived={c.deleted_at}>
					<a class="c-main" href="/classes/{c.id}">
						<span class="c-name">{c.name}</span>
						<span class="c-meta">
							{#if (c.section)}{c.section} · {/if}
							{#if (c.academic_year)}{c.academic_year} · {/if}
							<span class="mono">/{c.join_slug}</span>
							{#if (c.deleted_at)}<span class="pill">archived</span>{/if}
						</span>
					</a>
					{#if (!c.deleted_at)}
						<form method="POST" action="?/archive" use:enhance={refresh}>
							<input type="hidden" name="id" value={c.id} />
							<button class="btn btn-sm btn-danger" type="submit" aria-label="Archive {c.name}">Archive</button>
						</form>
					{:else}
						<form method="POST" action="?/restore" use:enhance={refresh}>
							<input type="hidden" name="id" value={c.id} />
							<button class="btn btn-sm" type="submit" aria-label="Restore {c.name}">Restore</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<section class="create" id="create" aria-labelledby="create-h">
		<h2 id="create-h">New class</h2>
		<form method="POST" action="?/create" use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				try {
					await update({ reset: true });
					await invalidateAll();
				} finally {
					creating = false;
				}
			};
		}}>
			<label>
				<span>Class name *</span>
				<input type="text" name="name" required maxlength={120} value={form?.name ?? ''} disabled={creating} placeholder="e.g. Physics 101" />
			</label>
			<div class="two">
				<label>
					<span>Section</span>
					<input type="text" name="section" maxlength={40} value={form?.section ?? ''} disabled={creating} placeholder="A" />
				</label>
				<label>
					<span>Academic year</span>
					<input type="text" name="academic_year" maxlength={20} value={form?.academic_year ?? ''} disabled={creating} placeholder="2026–27" />
				</label>
			</div>
			<button class="btn btn-filled" type="submit" disabled={creating} aria-busy={creating}>
				{creating ? 'Creating…' : 'Create class'}
			</button>
		</form>
	</section>
</div>

<style>
	.error {
		background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8;
		border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem;
	}
	.notice {
		background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent);
		border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem;
	}
	.notice a { color: var(--accent); font-weight: 700; }
	.search-row { display: flex; gap: 8px; margin-bottom: 16px; }
	.search-row input[type='search'] {
		flex: 1; background: var(--bg); border: 1px solid var(--border);
		border-radius: var(--shape-s); color: var(--text);
		font: inherit; min-height: 44px; padding: 0 12px; min-width: 0;
	}
	.search-row input:focus { border-color: var(--accent); outline: none; }
	.empty {
		border: 1px solid var(--border); background: var(--panel);
		border-radius: var(--shape-m); padding: 20px; color: var(--muted);
	}
	.empty p { margin: 4px 0; }
	.empty strong { color: var(--text); }
	.class-list { list-style: none; margin: 0 0 8px; padding: 0; border: 1px solid var(--border); border-radius: var(--shape-m); overflow: hidden; }
	.class-list li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
	.class-list li:last-child { border-bottom: none; }
	.class-list li.archived { opacity: 0.75; }
	.c-main { flex: 1; text-decoration: none; color: var(--text); min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.c-name { font-weight: 600; }
	.c-meta { color: var(--muted); font-size: 0.88rem; }
	.mono { font-family: var(--font-mono); font-size: 0.85em; }
	.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; margin-left: 6px; }
	.btn-danger { color: #f2b8b8; }
	.create { margin-top: 28px; border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; }
	.create h2 { margin: 0 0 14px; font-size: 1.1rem; }
	.create form { display: flex; flex-direction: column; gap: 14px; }
	label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; }
	.two { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
	@media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
	.create input {
		background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s);
		color: var(--text); font: inherit; font-weight: 400; min-height: 44px; padding: 0 12px; width: 100%;
	}
	.create input:focus { border-color: var(--accent); outline: none; }
</style>
