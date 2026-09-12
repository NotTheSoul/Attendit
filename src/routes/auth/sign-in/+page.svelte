<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { form } = $props();

	let busy = $state(false);
	let showReset = $state(false);
	let notice = $derived(page.url.searchParams.get('notice'));
</script>

<svelte:head>
	<title>Sign in — Attendit</title>
</svelte:head>

<div class="page auth-wrap">
	<div class="auth-card">
		<h1>Sign in</h1>
		<p class="sub">Welcome back. Your classes and sessions are where you left them.</p>

		{#if (notice === 'confirm-email')}
			<p class="notice" role="status">Account created — check your email to confirm, then sign in.</p>
		{/if}
		{#if (notice === 'password-reset')}
			<p class="notice" role="status">Password reset link confirmed. Sign in with your new password.</p>
		{/if}
		{#if (form?.resetSent)}
			<p class="notice" role="status">Reset link sent to {form.email}. Check your inbox.</p>
		{/if}
		{#if (form?.error)}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<form method="POST" action="?/signin" use:enhance={() => {
			busy = true;
			return async ({ update }) => { await update(); busy = false; };
		}}>
			<label>
				<span>Email</span>
				<input type="email" name="email" required autocomplete="email" value={form?.email ?? ''} disabled={busy} />
			</label>
			<label>
				<span>Password</span>
				<input type="password" name="password" required autocomplete="current-password" disabled={busy} />
			</label>
			<button class="btn btn-filled btn-block" type="submit" disabled={busy} aria-busy={busy}>
				{busy ? 'Signing in…' : 'Sign in'}
			</button>
		</form>

		<button class="link-btn" onclick={() => (showReset = !showReset)} aria-expanded={showReset}>
			Forgot your password?
		</button>

		{#if showReset}
			<form method="POST" action="?/requestReset" use:enhance class="reset-form">
				<label>
					<span>Account email</span>
					<input type="email" name="email" required autocomplete="email" value={form?.email ?? ''} />
				</label>
				<button class="btn btn-block" type="submit">Send reset link</button>
			</form>
		{/if}

		<p class="swap">No account yet? <a href="/auth/sign-up">Create one</a>.</p>
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
	.notice {
		background: #0f2a1e;
		border: 1px solid var(--accent-dim);
		color: var(--accent);
		border-radius: var(--shape-s);
		padding: 10px 12px;
		font-size: 0.9rem;
		margin: 0 0 14px;
	}
	.error {
		background: #2b1212;
		border: 1px solid #6e2b2b;
		color: #f2b8b8;
		border-radius: var(--shape-s);
		padding: 10px 12px;
		font-size: 0.9rem;
		margin: 0 0 14px;
	}
	.link-btn {
		background: none;
		border: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
		min-height: 44px;
		margin-top: 8px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.link-btn:hover { color: var(--text); }
	.reset-form { margin-top: 4px; border-top: 1px solid var(--border); padding-top: 16px; }
	.swap { color: var(--muted); font-size: 0.9rem; margin: 18px 0 0; text-align: center; }
	.swap a { color: var(--accent); }
</style>
