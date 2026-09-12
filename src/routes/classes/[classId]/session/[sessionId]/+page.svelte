<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data } = $props();
	let cls = $derived(data.class);
	let session = $derived(data.session);
	let responses = $derived(data.responses);
	let closing = $state(false);

	// Projector-legible code: group digits for at-a-glance reading.
	let grouped = $derived(session.session_code.replace(/(.{3})(?=.)/g, '$1 '));

	// ---- host location sharing.
	// Two explicit stages: precise GPS first; if that fails the host may opt
	// into an approximate fix (cached/low-power, ≤ 500 m) which visibly widens
	// the attendance zone. Nothing is ever silently downgraded.
	type ShareMode = 'off' | 'precise' | 'fallback';
	let mode: ShareMode = $state('off');
	let shareError: string | null = $state(null);
	let preciseFailed = $state(false);
	let lastPingAt: number | null = $state(null);
	let degraded = $state(false);
	let effRadius: number | null = $state(null);
	let watchId: number | null = $state(null);
	let lastSent = 0;

	const STATUS_LABEL: Record<string, string> = {
		accepted: 'Accepted',
		rejected_distance: 'Too far away',
		rejected_code: 'Incorrect code',
		duplicate: 'Already submitted',
		host_offline: 'Host offline'
	};

	async function sendPing(lat: number, lng: number, accuracy: number, fallback: boolean) {
		const now = Date.now();
		if (now - lastSent < 5000) return; // throttle: one ping per 5s max
		lastSent = now;
		try {
			const res = await fetch(`/api/sessions/${session.id}/host-ping?classId=${cls.id}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lat, lng, accuracy, fallback })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) {
				shareError = (body?.message as string) ?? `Location update failed (${res.status}). Retrying…`;
				if (res.status === 422 && mode === 'precise') preciseFailed = true;
				return;
			}
			shareError = null;
			lastPingAt = now;
			degraded = (body?.degraded as boolean) ?? false;
			effRadius = typeof body?.effectiveRadiusM === 'number' ? body.effectiveRadiusM : null;
		} catch {
			shareError = 'Network hiccup sending location. Retrying…';
		}
	}

	function geoErrorMessage(code: number): string {
		if (code === 1) return 'Location permission denied. Allow location for this site, then try again.';
		if (code === 2) return 'Position unavailable. Move near a window or step outside, then retry.';
		return 'Location timed out. Try again.';
	}

	function startSharing(next: ShareMode) {
		shareError = null;
		if (!('geolocation' in navigator)) {
			shareError = 'This browser does not support geolocation. Use a current Chrome, Safari, Edge, or Firefox.';
			return;
		}
		if (!window.isSecureContext) {
			shareError = 'Location needs HTTPS (or localhost). Serve securely and retry.';
			return;
		}
		stopWatch();
		const fallback = next === 'fallback';
		watchId = navigator.geolocation.watchPosition(
			(pos) => {
				void sendPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, fallback);
			},
			(err) => {
				shareError = geoErrorMessage(err.code);
				if (next === 'precise') preciseFailed = true;
			},
			fallback
				? { enableHighAccuracy: false, maximumAge: 600000, timeout: 20000 }
				: { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
		);
		mode = next;
	}

	function stopWatch() {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
	}

	function stopSharing() {
		stopWatch();
		mode = 'off';
		degraded = false;
		effRadius = null;
	}

	// ---- rotating QR: tokens die every ~90s, so refresh the artwork.
	// Server data is the source of freshness; the timer covers the gaps.
	let qrSvg = $state('');
	let joinUrl = $state('');
	$effect(() => {
		qrSvg = data.qrSvg;
		joinUrl = data.joinUrl;
	});

	async function refreshQr() {
		try {
			const res = await fetch(`/api/sessions/${session.id}/qr?classId=${cls.id}`);
			if (!res.ok) return;
			const body = await res.json();
			if (typeof body.svg === 'string') qrSvg = body.svg;
			if (typeof body.url === 'string') joinUrl = body.url;
		} catch {
			// keep the current QR; it stays valid until its own expiry
		}
	}

	let qrTimer: ReturnType<typeof setInterval> | null = $state(null);
	let pollTimer: ReturnType<typeof setInterval> | null = $state(null);

	onMount(() => {
		qrTimer = setInterval(() => {
			void refreshQr();
		}, 60000);
		return () => {
			if (qrTimer) clearInterval(qrTimer);
		};
	});

	onMount(() => {
		if (data.supabase) {
			const channel = data.supabase
				.channel(`session-${session.id}`)
				.on(
					'postgres_changes',
					{ event: '*', schema: 'public', table: 'responses', filter: `session_id=eq.${session.id}` },
					() => {
						void invalidateAll();
					}
				)
				.subscribe();
			return () => {
				void data.supabase?.removeChannel(channel);
			};
		}
		pollTimer = setInterval(() => {
			void invalidateAll();
		}, 5000);
		return () => {
			if (pollTimer) clearInterval(pollTimer);
		};
	});

	// Always stop GPS when leaving the page
	onMount(() => {
		return () => {
			if (watchId !== null) navigator.geolocation.clearWatch(watchId);
		};
	});
</script>

<svelte:head>
	<title>Live session · {cls.name} — Attendit</title>
</svelte:head>

<div class="host">
	<header class="host-top">
		<div>
			<p class="kicker"><span class="pulse" aria-hidden="true"></span> LIVE SESSION</p>
			<h1>{cls.name}{session.subject_name ? ` · ${session.subject_name}` : ''}</h1>
			<p class="meta mono">
				radius {session.radius_meters} m
				· opened {session.opens_at ? new Date(session.opens_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
				· stays open until you close it
			</p>
		</div>
		<form
			method="POST"
			action="?/close"
			use:enhance={() => {
				closing = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						closing = false;
					}
				};
			}}
		>
			<button class="btn-danger-fill" type="submit" disabled={closing}>
				{closing ? 'Closing…' : 'Close session'}
			</button>
		</form>
	</header>

	<section class="code-panel" aria-label="Session code and QR code">
		<div class="code-block">
			<p class="kicker">Students enter this code</p>
			<p class="code" role="img" aria-label="Session code {session.session_code}">{grouped}</p>
			<p class="hint">Announce it out loud — never in a link. Typed codes must also pass location validation.</p>
		</div>
		<div class="qr-block">
			<p class="kicker">…or scan — checks in directly</p>
			<div class="qr" role="img" aria-label="QR code for joining {cls.name}">
				{@html qrSvg}
			</div>
			<p class="hint">Scanning proves you're in the room — no code, no location needed. The QR rotates every minute and never contains the session code.</p>
		</div>
	</section>

	<section class="hostloc-card" aria-label="Host location">
		<div class="hostloc-row">
			<span class="dot" class:on={mode !== 'off' && !shareError && !degraded} class:warn={mode !== 'off' && degraded} aria-hidden="true"></span>
			<div>
				<strong>
					{mode === 'off'
						? 'Host location: not sharing'
						: shareError
							? 'Host location: struggling'
							: degraded
								? `Host location: approximate (zone widened to ~${effRadius ?? session.radius_meters} m)`
								: 'Host location: live'}
				</strong>
				<p class="muted">
					{mode === 'off'
						? 'Your device is the geographic reference for every check-in. Start sharing so verification can run.'
						: (shareError ?? (lastPingAt ? `Last update ${Math.round((Date.now() - lastPingAt) / 1000)}s ago.` : 'Acquiring position…'))}
				</p>
				{#if (data.hostLive)}
					<p class="muted">Server holds {data.hostDegraded ? 'an approximate' : 'a fresh precise'} fix (zone ~{data.hostEffectiveRadiusM} m).</p>
				{:else if (mode !== 'off')}
					<p class="host-off" role="alert">HOST OFFLINE from the server's view — keep this tab open until students finish.</p>
				{/if}
			</div>
			{#if (mode === 'off')}
				<button class="btn btn-filled btn-sm" type="button" onclick={() => startSharing('precise')}>Share location</button>
			{:else}
				<button class="btn btn-sm" type="button" onclick={stopSharing}>Stop</button>
			{/if}
		</div>
		{#if (shareError && mode !== 'off')}
			<p class="error" role="alert">{shareError}</p>
		{/if}
		{#if (preciseFailed && mode === 'precise')}
			<div class="fallback-box">
				<p><strong>GPS can't get a precise fix in here.</strong> Fall back to an approximate zone? It uses a cached/low-power fix (≤ 500 m) and visibly widens the attendance fence — students are still verified, just against a larger area.</p>
				<button class="btn btn-sm" type="button" onclick={() => startSharing('fallback')}>Use approximate location</button>
			</div>
		{/if}
	</section>

	<section class="feed" aria-label="Live attendance">
		<h2>Live attendance <span class="muted">· {responses.length} submission{responses.length === 1 ? '' : 's'}</span></h2>
		<p class="sr" role="status">{responses.length} check-ins so far{responses.length > 0 ? `, latest from ${responses[0].student_name}` : ''}.</p>
		{#if (responses.length === 0)}
			<div class="empty">
				<p><strong>Waiting for check-ins.</strong></p>
				<p>Submissions stream in here without refresh{data.supabase ? '' : ' (polling every 5s in local mode)'}.</p>
			</div>
		{:else}
			<ul class="feed-list">
				{#each responses as r}
					<li class:bad={r.status !== 'accepted'}>
						<div class="f-main">
							<span class="f-name">{r.student_name}</span>
							<span class="f-meta mono">{r.registration_id} · {new Date(r.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{r.method ? ` · ${r.method}` : ''}{r.distance_from_host_m != null ? ` · ${Math.round(r.distance_from_host_m)} m` : ''}</span>
						</div>
						<span class="status" class:ok={r.status === 'accepted'}>{STATUS_LABEL[r.status] ?? r.status}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.host { max-width: 1080px; margin: 0; padding: clamp(20px, 3vw, 32px) clamp(16px, 3vw, 40px) 64px; }
	.host-top { display: flex; justify-content: space-between; align-items: start; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
	.kicker { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
	.pulse { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
	.host-top h1 { margin: 0; font-size: clamp(1.6rem, 1.3rem + 1.5vw, 2.2rem); letter-spacing: -0.02em; font-weight: 500; }
	.meta { color: var(--muted); margin: 6px 0 0; font-size: 0.9rem; }
	.mono { font-family: var(--font-mono); }
	.btn-danger-fill { background: #5c1a1a; border: 1px solid #8a2f2f; color: #ffd9d9; border-radius: var(--shape-s); min-height: 44px; padding: 0 20px; font: inherit; font-weight: 600; cursor: pointer; }
	.btn-danger-fill:hover { background: #722222; }
	.code-panel {
		display: grid;
		gap: 12px;
		border: none;
		border-radius: 16px;
		background: var(--panel);
		padding: clamp(20px, 4vw, 40px);
		text-align: center;
	}
	@media (min-width: 760px) {
		.code-panel { grid-template-columns: 1.3fr 1fr; align-items: center; text-align: left; }
		.qr-block { text-align: center; border-left: 1px solid var(--border); padding-left: 24px; }
	}
	.code {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: clamp(3rem, 2.4rem + 4vw, 5.5rem);
		letter-spacing: 0.1em;
		margin: 4px 0 8px;
		color: var(--text);
	}
	.hint { color: var(--muted); font-size: 0.9rem; margin: 0; overflow-wrap: anywhere; }
	.qr { display: inline-block; background: #fff; padding: 12px; border-radius: 12px; margin: 8px 0; }
	.qr :global(svg) { display: block; width: min(240px, 60vw); height: auto; }
	.hostloc-card { border: none; border-radius: var(--shape-m); background: var(--panel); padding: 16px 18px; margin-top: 12px; }
	.hostloc-row { display: flex; gap: 12px; align-items: start; }
	.hostloc-row > div { flex: 1; min-width: 0; }
	.hostloc-row strong { font-size: 0.95rem; }
	.muted { color: var(--muted); font-size: 0.9rem; margin: 4px 0 0; }
	.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); flex: none; margin-top: 4px; }
	.dot.on { background: var(--accent); }
	.dot.warn { background: #f0c987; }
	.fallback-box { border: 1px dashed var(--border); border-radius: var(--shape-s); padding: 12px 14px; margin-top: 12px; }
	.fallback-box p { color: var(--muted); font-size: 0.9rem; margin: 0 0 10px; }
	.fallback-box strong { color: var(--text); }
	.host-off { color: #f2b8b8; font-weight: 600; font-size: 0.9rem; margin: 6px 0 0; }
	.error { background: #2b1212; border: 1px solid #6e2b2b; color: #f2b8b8; border-radius: var(--shape-s); padding: 10px 12px; font-size: 0.9rem; margin: 12px 0 0; }
	.feed { margin-top: 24px; }
	.feed h2 { font-size: 1.1rem; margin: 0 0 12px; letter-spacing: -0.01em; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.empty { border: 1px dashed var(--border); border-radius: var(--shape-m); padding: 20px; color: var(--muted); }
	.empty p { margin: 4px 0; }
	.empty strong { color: var(--text); }
	.feed-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--shape-m); overflow: hidden; }
	.feed-list li { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--border); }
	.feed-list li:last-child { border-bottom: none; }
	.f-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.f-name { font-weight: 600; }
	.f-meta { color: var(--muted); font-size: 0.82rem; }
	.status { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 0.8rem; white-space: nowrap; color: #f2b8b8; }
	.status.ok { color: var(--accent); border-color: var(--accent-dim); }
	.feed-list li.bad { opacity: 0.85; }
</style>
