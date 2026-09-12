<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();

	const refresh = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			await invalidateAll();
		};
	};

	const groups = $derived([
		{ title: 'Classes', items: data.classes, action: '?/restoreClass', kinds: false },
		{ title: 'Students', items: data.students, action: '?/restoreItem', kinds: true },
		{ title: 'Subjects', items: data.subjects, action: '?/restoreItem', kinds: true },
		{ title: 'Sessions', items: data.sessions, action: '?/restoreItem', kinds: true }
	]);
	const total = $derived(groups.reduce((n, g) => n + g.items.length, 0));
</script>

<svelte:head>
	<title>Trash — Attendit</title>
</svelte:head>

<div class="page app-page form">
	<div class="app-head">
		<h1 class="app-title">Trash</h1>
		<p class="app-sub">Everything removed stays recoverable for 30 days, then it's purged.</p>
	</div>

	{#if (form?.error)}
		<p class="error" role="alert">{form.error}</p>
	{/if}

	{#if (total === 0)}
		<div class="empty">
			<p><strong>Trash is empty.</strong></p>
			<p>Removed classes, students, subjects, and sessions will appear here with a restore option.</p>
		</div>
	{:else}
		{#each groups as g}
			{#if (g.items.length > 0)}
				<section aria-label="Removed {g.title.toLowerCase()}">
					<h2>{g.title}</h2>
					<ul class="trash-list">
						{#each g.items as item}
							<li>
								<div class="t-main">
									<span class="t-name">{item.label}</span>
									<span class="t-meta">
										{item.className}{item.sub ? ` · ${item.sub}` : ''} · removed {new Date(item.deletedAt).toLocaleDateString()}
									</span>
								</div>
								<form method="POST" action={g.action} use:enhance={refresh}>
									<input type="hidden" name="id" value={item.id} />
									{#if (g.kinds)}
										<input type="hidden" name="kind" value={item.kind} />
										<input type="hidden" name="classId" value={item.classId} />
									{/if}
									<button class="btn btn-sm" type="submit" aria-label="Restore {item.label}">Restore</button>
								</form>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; }
	.empty { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; color: var(--muted); }
	.empty p { margin: 4px 0; }
	.empty strong { color: var(--text); }
	section { margin-top: 24px; }
	h2 { font-size: 1rem; margin: 0 0 10px; }
	.trash-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--shape-m); overflow: hidden; }
	.trash-list li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
	.trash-list li:last-child { border-bottom: none; }
	.t-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.t-name { font-weight: 600; }
	.t-meta { color: var(--muted); font-size: 0.88rem; }
</style>
