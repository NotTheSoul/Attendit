<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Sign up — Attendit</title>
</svelte:head>

<div class="page auth-wrap">
	<div class="auth-card">
		<h1>Create your host account</h1>
		<p class="sub">One account runs all your classes. Students never need one.</p>

		{#if (form?.error)}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<form method="POST" action="?/signup" use:enhance={() => {
			busy = true;
			return async ({ update }) => { await update(); busy = false; };
		}}>
			<label>
				<span>Email</span>
				<input type="email" name="email" required autocomplete="email" value={form?.email ?? ''} disabled={busy} />
			</label>
			<label>
				<span>Password <em>(8+ characters)</em></span>
				<input type="password" name="password" required minlength={8} autocomplete="new-password" disabled={busy} />
			</label>
			<button class="btn btn-filled btn-block" type="submit" disabled={busy} aria-busy={busy}>
				{busy ? 'Creating…' : 'Create account'}
			</button>
		</form>

		<p class="swap">Already have an account? <a href="/auth/sign-in">Sign in</a>.</p>
	</div>
</div>

<style>
	.auth-wrap { display: flex; justify-content: center; padding-top: 56px; }
	.auth-card {
		width: 100%;
		max-width: 440px;
		background: var(--panel);
		border: none;
		border-radius: var(--shape-m);
		padding: 32px 28px;
	}
	.auth-card h1 { margin: 0 0 6px; font-size: 1.7rem; letter-spacing: -0.02em; font-weight: 500; }
	.sub { color: var(--muted); margin: 0 0 20px; font-size: 0.95rem; }
	form { display: flex; flex-direction: column; gap: 14px; }
	label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; }
	label em { font-style: normal; font-weight: 400; color: var(--muted); }
	input {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--shape-s);
		color: var(--text);
		font: inherit;
		font-weight: 400;
		min-height: 44px;
		padding: 0 12px;
	}
	input:focus { border-color: var(--accent); outline: none; }
	.btn-block { width: 100%; }
	.error {
		background: #2b1212;
		border: 1px solid #6e2b2b;
		color: #f2b8b8;
		border-radius: var(--shape-s);
		padding: 10px 12px;
		font-size: 0.9rem;
		margin: 0 0 14px;
	}
	.swap { color: var(--muted); font-size: 0.9rem; margin: 18px 0 0; text-align: center; }
	.swap a { color: var(--accent); }
</style>
