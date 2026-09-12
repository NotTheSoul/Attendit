<svelte:head>
	<title>Auth — Attendit</title>
</svelte:head>

<div class="page auth-page">
	<h1>Host access</h1>
	<p class="lede">Attendit hosts sign in to manage classes and run sessions. Students never need this page — they join from a class link.</p>
	<div class="cta-row">
		<a class="btn btn-filled" href="/auth/sign-in">Sign in</a>
		<a class="btn" href="/auth/sign-up">Create account</a>
	</div>
</div>

<style>
	.auth-page { padding-top: 64px; max-width: 720px; }
	.auth-page h1 {
		font-size: clamp(2rem, 4vw, 2.6rem);
		letter-spacing: -0.025em;
		margin: 0 0 12px;
		font-weight: 500;
	}
	.lede { color: var(--muted); margin: 0 0 24px; }
</style>
