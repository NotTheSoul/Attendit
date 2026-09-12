<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	type Phase = 'READY' | 'CHECKING' | 'VERIFYING' | 'ACCEPTED' | 'REJECTED';
	type Student = { id: string; full_name: string; registration_id: string };

	let phase: Phase = $state('READY');
	let query = $state('');
	let matches: Student[] = $state([]);
	let searching = $state(false);
	let student: Student | null = $state(null);
	let loc: { lat: number; lng: number; accuracy: number; degraded: boolean } | null = $state(null);
	let locError: string | null = $state(null);
	let locating = $state(false);
	let preciseFailed = $state(false);
	// QR entry (?t=): the scan itself proves presence — no code to type,
	// no location trail. The session code NEVER travels in links.
	let qrToken = $derived(page.url.searchParams.get('t') ?? '');
	let qrMode = $derived(qrToken.length > 0);
	let code = $state('');
	let result: { status: string; message: string; distanceM: number | null } | null = $state(null);
	let resultError: string | null = $state(null);

	let canSubmit = $derived(
		student && (qrMode || (loc && code.trim().length >= 4)) && (phase === 'READY' || phase === 'REJECTED')
	);

	let debounce: ReturnType<typeof setTimeout> | null = null;
	let refreshing = $state(false);

	async function refresh() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	async function search(q: string) {
		query = q;
		student = null;
		if (debounce) clearTimeout(debounce);
		if (q.trim().length < 2) {
			matches = [];
			searching = false;
			return;
		}
		searching = true;
		debounce = setTimeout(async () => {
			try {
				const res = await fetch(`/api/join/${encodeURIComponent(data.joinSlug)}/students?q=${encodeURIComponent(q.trim())}`);
				const body = await res.json();
				matches = (body.students ?? []) as Student[];
			} catch {
				matches = [];
			} finally {
				searching = false;
			}
		}, 250);
	}

	function shareLocation(approximate = false) {
		locError = null;
		if (!('geolocation' in navigator)) {
			locError = 'This browser cannot share location. Try Chrome or Safari on your phone.';
			return;
		}
		if (!window.isSecureContext) {
			locError = 'Location needs a secure page (HTTPS). Ask your host for help.';
			return;
		}
		locating = true;
		phase = 'CHECKING';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, degraded: approximate };
				locating = false;
				phase = 'READY';
				if (!approximate && pos.coords.accuracy > 100) {
					// Let the user decide: retry precise, or accept the widened zone.
					preciseFailed = true;
				}
			},
			(err) => {
				locating = false;
				phase = 'READY';
				if (err.code === 1) locError = 'Permission denied. Allow location for this site in your browser settings, then try again.';
				else if (err.code === 2) locError = 'Position unavailable. Move near a window or step outside, then retry.';
				else locError = 'Location timed out. Try again.';
				if (!approximate) preciseFailed = true;
			},
			approximate
				? { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 }
				: { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
		);
	}

	function deviceHash(): string {
		try {
			let h = localStorage.getItem('attendit_device');
			if (!h) {
				h = crypto.randomUUID();
				localStorage.setItem('attendit_device', h);
			}
			return h;
		} catch {
			return 'unavailable';
		}
	}

	async function submit() {
		if (!student || !canSubmit) return;
		if (!qrMode && !loc) return;
		phase = 'VERIFYING';
		result = null;
		resultError = null;
		try {
			const res = await fetch('/api/responses', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					joinSlug: data.joinSlug,
					code: code.trim(),
					qrToken: qrMode ? qrToken : undefined,
					studentId: student.id,
					method: qrMode ? 'qr' : 'code',
					lat: loc?.lat,
					lng: loc?.lng,
					accuracy: loc?.accuracy,
					fallback: loc?.degraded === true,
					deviceHash: deviceHash()
				})
			});
			const body = await res.json();
			if (!res.ok) {
				phase = 'REJECTED';
				resultError = (body.message as string) ?? 'Submission failed. Try again.';
				return;
			}
			result = body as { status: string; message: string; distanceM: number | null };
			phase = result.status === 'accepted' ? 'ACCEPTED' : 'REJECTED';
		} catch {
			phase = 'REJECTED';
			resultError = 'Network problem. Check your connection and try again.';
		}
	}

	function retry() {
		phase = 'READY';
		result = null;
		resultError = null;
	}
</script>

<svelte:head>
	<title>Check in · {data.className} — Attendit</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="join">
	<header class="join-head">
		<h1>{data.className}</h1>
	</header>

	{#if (!data.hasActive)}
		<section class="idle" aria-live="polite">
			<p><strong>No session is open right now.</strong></p>
			<button class="btn" type="button" onclick={() => void refresh()} disabled={refreshing} aria-busy={refreshing}>
				{refreshing ? 'Checking…' : 'Refresh'}
			</button>
		</section>
	{:else if (phase === 'ACCEPTED' && result)}
		<section class="result ok" aria-live="polite">
			<span class="big-mark" aria-hidden="true">✓</span>
			<h2>You're checked in</h2>
			<p>{student?.full_name} · {result.message}</p>
			{#if (result.distanceM != null)}<p class="muted mono">~{result.distanceM} m from host</p>{/if}
		</section>
	{:else}
		<section class="card" aria-label="Check in">
			<!-- who -->
			<div class="row">
				{#if (!student)}
					<input
						type="search"
						placeholder="Type your name or ID…"
						value={query}
						oninput={(e) => void search(e.currentTarget.value)}
						autocomplete="off"
						aria-label="Search by name or registration ID"
					/>
					{#if (searching)}<p class="muted">Searching…</p>{/if}
					{#if (!searching && query.trim().length >= 2 && matches.length === 0)}
						<p class="muted">Nobody matches “{query.trim()}”. Check the spelling or ask your host.</p>
					{/if}
					<ul class="hits">
						{#each matches as m}
							<li>
								<button type="button" onclick={() => { student = m; matches = []; query = ''; }}>
									<span class="hit-name">{m.full_name}</span>
									<span class="hit-reg mono">{m.registration_id}</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="picked">
						<div>
							<strong>{student.full_name}</strong>
							<span class="mono muted">{student.registration_id}</span>
						</div>
						<button class="btn btn-sm" type="button" onclick={() => (student = null)}>Change</button>
					</div>
				{/if}
			</div>

			{#if (!qrMode)}
			<!-- location + code, code path only -->
			<div class="row">
				{#if (!loc)}
					<button class="btn btn-filled btn-block" type="button" onclick={() => shareLocation(false)} disabled={locating || phase === 'CHECKING'}>
						{locating ? 'Locating…' : 'Share my location'}
					</button>
				{:else}
					<p class="ok-line" role="status">
						{loc?.degraded ? `Approximate (±${Math.round(loc?.accuracy ?? 0)} m, widened zone).` : `Location ok (±${Math.round(loc?.accuracy ?? 0)} m).`}
						<button class="linklike" type="button" onclick={() => shareLocation(loc?.degraded === true)}>Refresh</button>
					</p>
				{/if}
				{#if (locError)}<p class="error" role="alert">{locError}</p>{/if}
				{#if (preciseFailed && !loc?.degraded)}
					<div class="fallback-box">
						<p><strong>GPS can't get a precise fix.</strong> Use an approximate location instead?</p>
						<button class="btn btn-sm" type="button" onclick={() => shareLocation(true)} disabled={locating}>Use approximate</button>
					</div>
				{/if}
			</div>

			<div class="row">
				<input
					class="code-input mono"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={8}
					placeholder="Session code"
					value={code}
					oninput={(e) => { code = e.currentTarget.value; }}
					aria-label="Session code"
				/>
			</div>
			{:else}
			<p class="muted qr-note">QR scanned — no code, no location needed. Confirm it's you above.</p>
			{/if}

			<div class="row">
				<button class="btn btn-filled btn-block" type="button" onclick={() => void submit()} disabled={!canSubmit || phase === 'VERIFYING'} aria-busy={phase === 'VERIFYING'}>
					{phase === 'VERIFYING' ? 'Verifying…' : phase === 'CHECKING' ? 'Locating…' : 'Submit attendance'}
				</button>
			</div>
			{#if (phase === 'REJECTED')}
				<div class="result bad" aria-live="polite">
					<h2>Not accepted</h2>
					<p>{result?.message ?? resultError ?? 'Try again.'}</p>
					<button class="btn btn-sm" type="button" onclick={retry}>Try again</button>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.join { max-width: 520px; margin: 0 auto; padding: 40px clamp(16px, 4vw, 24px) 64px; }
	.join-head { margin-bottom: 20px; text-align: center; }
	.join h1 { margin: 0; font-size: clamp(1.7rem, 1.4rem + 2vw, 2.2rem); letter-spacing: -0.02em; font-weight: 600; }
	.idle { border: 1px dashed var(--border); border-radius: var(--shape-m); background: var(--panel); padding: 28px 22px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 20px; }
	.idle p { margin: 0; }
	.idle strong { font-size: 1.05rem; }
	.idle .btn { margin-top: 10px; }
	.card { background: var(--panel); border-radius: var(--shape-m); padding: 8px 20px 20px; display: flex; flex-direction: column; }
	.row { padding: 14px 0; }
	.row:first-child { padding-top: 6px; }
	.row + .row { border-top: 1px solid var(--border); }
	.row input[type='search'], .code-input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: var(--shape-s); color: var(--text); font-size: max(16px, 1em); min-height: 48px; padding: 0 14px; }
	.row input:focus { border-color: var(--accent); outline: none; }
	.code-input { font-size: 1.4rem; letter-spacing: 0.18em; text-align: center; }
	.qr-note { margin: 0; }
	.muted { color: var(--muted); font-size: 0.9rem; }
	.mono { font-family: var(--font-mono); }
	.hits { list-style: none; margin: 8px 0 0; padding: 0; border: 1px solid var(--border); border-radius: var(--shape-m); overflow: hidden; }
	.hits li + li { border-top: 1px solid var(--border); }
	.hits button { width: 100%; display: flex; justify-content: space-between; gap: 12px; background: var(--panel); border: none; color: var(--text); font: inherit; padding: 12px 14px; min-height: 48px; cursor: pointer; text-align: left; }
	.hits button:hover { background: var(--panel-2); }
	.hit-name { font-weight: 600; }
	.hit-reg { color: var(--muted); font-size: 0.85em; }
	.picked { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--accent-dim); background: #0f2a1e; border-radius: var(--shape-m); padding: 12px 14px; }
	.picked strong { display: block; }
	.ok-line { color: var(--accent); }
	.fallback-box { border: 1px dashed var(--border); border-radius: var(--shape-s); padding: 12px 14px; margin-top: 12px; }
	.fallback-box p { color: var(--muted); font-size: 0.9rem; margin: 0 0 10px; }
	.fallback-box strong { color: var(--text); }
	.linklike { background: none; border: none; color: var(--accent); font: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 8px; min-height: 44px; }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; margin: 12px 0 0; }
	.btn-block { width: 100%; margin-top: 4px; }
	.result { border-radius: var(--shape-m); padding: 24px 20px; margin-top: 16px; text-align: center; }
	.result.ok { border: 1px solid var(--accent-dim); background: #0f2a1e; }
	.result.bad { border: 1px solid #6e2b2b; background: #230e0e; text-align: left; }
	.result h2 { margin: 0 0 8px; }
	.result p { margin: 4px 0; color: var(--muted); }
	.result.ok p { color: var(--text); }
	.big-mark { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: var(--accent); color: #06110b; font-size: 1.6rem; font-weight: 800; margin-bottom: 8px; }
</style>
