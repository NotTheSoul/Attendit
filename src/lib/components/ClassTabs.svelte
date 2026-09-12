<script lang="ts">
	let {
		classId,
		counts,
		active
	}: {
		classId: string;
		counts: { students: number; subjects: number; sessions: number };
		active: 'overview' | 'students' | 'subjects' | 'sessions';
	} = $props();

	const tabs = $derived(
		[
			{ key: 'overview', label: 'Overview', href: `/classes/${classId}` },
			{ key: 'students', label: `Students · ${counts.students}`, href: `/classes/${classId}/students` },
			{ key: 'subjects', label: `Subjects · ${counts.subjects}`, href: `/classes/${classId}/subjects` },
			{ key: 'sessions', label: `Sessions · ${counts.sessions}`, href: `/classes/${classId}/sessions` }
		] as const
	);
</script>

<nav class="tabs" aria-label="Class sections">
	{#each tabs as tab}
		{#if tab.key === active}
			<span class="tab active" aria-current="page">{tab.label}</span>
		{:else}
			<a class="tab" href={tab.href}>{tab.label}</a>
		{/if}
	{/each}
</nav>

<style>
	.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; overflow-x: auto; }
	.tab { padding: 10px 14px; font-size: 0.92rem; font-weight: 600; white-space: nowrap; border-bottom: 2px solid transparent; margin-bottom: -1px; color: var(--muted); text-decoration: none; }
	a.tab:hover { color: var(--text); }
	.tab.active { color: var(--text); border-bottom-color: var(--accent); }
</style>
