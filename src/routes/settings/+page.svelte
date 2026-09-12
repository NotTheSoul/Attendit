<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();
	let changing = $state(false);
</script>

<svelte:head>
	<title>Settings — Attendit</title>
</svelte:head>

<div class="page app-page form">
	<div class="app-head">
		<h1 class="app-title">Settings</h1>
		<p class="app-sub">Account and workspace preferences.</p>
	</div>

	<section class="card" aria-labelledby="account-h">
		<h2 id="account-h">Account</h2>
		<dl>
			<div>
				<dt>Email</dt>
				<dd>{data.email}</dd>
			</div>
			<div>
				<dt>Backend</dt>
				<dd>{data.backend === 'local' ? 'Local SQLite (this machine)' : 'Supabase (cloud)'}</dd>
			</div>
		</dl>
		<form method="POST" action="/auth/sign-out">
			<button class="btn btn-sm" type="submit">Sign out</button>
		</form>
	</section>

	<section class="card" aria-labelledby="pw-h">
		<h2 id="pw-h">Change password</h2>
		{#if (form?.passwordChanged)}
			<p class="notice" role="status">Password updated.</p>
		{/if}
		{#if (form?.error)}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		<form
			method="POST"
			action="?/changePassword"
			use:enhance={() => {
				changing = true;
				return async ({ update }) => {
					try {
						await update({ reset: true });
						await invalidateAll();
					} finally {
						changing = false;
					}
				};
			}}
		>
			<label>
				<span>Current password</span>
				<input type="password" name="current_password" required autocomplete="current-password" disabled={changing} />
			</label>
			<label>
				<span>New password <em>(8+ characters)</em></span>
				<input type="password" name="new_password" required minlength={8} autocomplete="new-password" disabled={changing} />
			</label>
			<label>
				<span>Confirm new password</span>
				<input type="password" name="confirm_password" required autocomplete="new-password" disabled={changing} />
			</label>
			<button class="btn" type="submit" disabled={changing} aria-busy={changing}>
				{changing ? 'Updating…' : 'Update password'}
			</button>
		</form>
	</section>

	<section class="card" aria-labelledby="retention-h">
		<h2 id="retention-h">Data retention</h2>
		<p class="muted">Archived classes, students, subjects, and sessions are kept for 30 days in Trash, then purged automatically. Attendance responses are never soft-deleted.</p>
	</section>
</div>

<style>
	.card { border: none; background: var(--panel); border-radius: var(--shape-m); padding: 20px; margin-bottom: 12px; }
	.card h2 { margin: 0 0 12px; font-size: 1.05rem; }
	.card form { display: flex; flex-direction: column; gap: 12px; }
	.card label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; }
	.card label em { font-style: normal; font-weight: 400; color: var(--muted); }
	.card input { background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font: inherit; font-weight: 400; min-height: 44px; padding: 0 12px; width: 100%; }
	.card input:focus { border-color: var(--accent); outline: none; }
	.notice { background: #0f2a1e; border: 1px solid var(--accent-dim); color: var(--accent); border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; margin: 0 0 4px; }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; margin: 0 0 4px; }
	dl { margin: 0 0 16px; display: flex; flex-direction: column; gap: 10px; }
	dl > div { display: grid; grid-template-columns: 120px 1fr; gap: 12px; }
	dt { color: var(--muted); font-size: 0.9rem; }
	dd { margin: 0; font-size: 0.95rem; overflow-wrap: anywhere; }
	.muted { color: var(--muted); font-size: 0.92rem; margin: 0; }
</style>
