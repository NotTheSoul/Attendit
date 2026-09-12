<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let status = $derived(page.status);
	let is404 = $derived(status === 404);

	// --- Sky hopper: bounce up the floating pads, climb for height. ---
	// ←/→ or A/D on desktop, hold left/right half on touch.
	let canvas: HTMLCanvasElement | null = $state(null);
	let running = $state(false);
	let over = $state(false);
	let score = $state(0);
	let best = 0;
	let raf = 0;

	type Pad = { x: number; y: number; w: number };
	let pads: Pad[] = [];
	let px = 0;
	let py = 0;
	let vy = 0;
	let dir = 0;
	let leftHeld = $state(false);
	let rightHeld = $state(false);

	const W = 340;
	const H = 440;
	const PW = 15;
	const GRAV = 0.19;
	const BOUNCE = -8.0;
	const DRIFT = 3.0;
	const PAD_W = 64;

	function reset() {
		pads = [];
		px = W / 2;
		py = H - 60;
		vy = BOUNCE;
		score = 0;
		over = false;
		let y = H - 24;
		while (y > -H) {
			y -= 42 + Math.random() * 22;
			pads.push({ x: Math.random() * (W - PAD_W), y, w: PAD_W });
		}
	}

	function frame() {
		const ctx = canvas?.getContext('2d');
		if (!ctx) return;
		px += dir * DRIFT;
		if (px < -PW) px = W + PW;
		if (px > W + PW) px = -PW;
		vy += GRAV;
		py += vy;
		if (vy > 0) {
			for (const p of pads) {
				if (px + PW > p.x && px < p.x + p.w && py + PW >= p.y && py + PW <= p.y + 14) {
					py = p.y - PW;
					vy = BOUNCE;
					break;
				}
			}
		}
		if (py < H * 0.42) {
			const dy = H * 0.42 - py;
			py = H * 0.42;
			score += Math.round(dy);
			for (const p of pads) p.y += dy;
			let top = Math.min(...pads.map((p) => p.y));
			while (top > -40) {
				top -= 42 + Math.random() * 22;
				pads.push({ x: Math.random() * (W - PAD_W), y: top, w: PAD_W });
			}
			pads = pads.filter((p) => p.y < H + 30);
		}
		if (py > H + 20) {
			over = true;
			running = false;
			best = Math.max(best, score);
		}
		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = '#a3aaa1';
		for (const p of pads) ctx.fillRect(p.x, p.y, p.w, 7);
		ctx.fillStyle = '#46d487';
		ctx.fillRect(px, py, PW, PW);
		ctx.fillStyle = '#eef1ec';
		ctx.font = '12px ui-monospace, monospace';
		ctx.fillText(`HEIGHT ${score}`, 10, 18);
		if (best > 0) ctx.fillText(`BEST ${best}`, W - 76, 18);
		if (!over) raf = requestAnimationFrame(frame);
	}

	function start() {
		reset();
		running = true;
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(frame);
	}

	function keysHeld(): number {
		return (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
	}

	function onkey(e: KeyboardEvent, down: boolean) {
		if (e.code === 'ArrowLeft' || e.code === 'KeyA') leftHeld = down;
		if (e.code === 'ArrowRight' || e.code === 'KeyD') rightHeld = down;
		if (down && (e.code === 'Space' || e.code === 'ArrowUp')) {
			e.preventDefault();
			if (!running && !over) start();
		}
		if (down) dir = keysHeld();
		if (!down) dir = keysHeld();
	}

	function steer(e: PointerEvent) {
		const rect = canvas?.getBoundingClientRect();
		if (!rect) return;
		dir = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
	}

	function release() {
		dir = keysHeld();
	}

	onMount(() => {
		try {
			best = Number(localStorage.getItem('attendit_hop_best') ?? 0) || 0;
		} catch {
			best = 0;
		}
		return () => cancelAnimationFrame(raf);
	});

	$effect(() => {
		if (over) {
			try {
				localStorage.setItem('attendit_hop_best', String(best));
			} catch {
				// private mode — best height just doesn't persist
			}
		}
	});
</script>

<svelte:head>
	<title>{status} — Attendit</title>
</svelte:head>

<svelte:window onkeydown={(e) => onkey(e, true)} onkeyup={(e) => onkey(e, false)} />

<div class="err">
	<p class="code mono">{status}</p>
	<h1>{is404 ? 'This page took attendance and left.' : 'Something broke on our side.'}</h1>
	<p class="muted">
		{is404
			? 'The link is wrong, moved, or expired. Check with your host — or climb a little while you wait.'
			: 'Not your fault. Try again, or head back and continue.'}
	</p>

	{#if (is404)}
		<section class="game" aria-label="Sky hopper mini-game">
			<canvas
				bind:this={canvas}
				width={W}
				height={H}
				onpointerdown={(e) => {
					if (!running && !over) start();
					else steer(e);
				}}
				onpointerup={release}
				onpointerleave={release}
				onpointercancel={release}
			></canvas>
			{#if (!running && !over)}
				<button class="btn btn-filled btn-sm" type="button" onclick={start}>Play — steer with ← → or hold a side</button>
			{/if}
			{#if (over)}
				<div class="over">
					<p><strong>Fell at height {score}.</strong></p>
					<button class="btn btn-sm" type="button" onclick={start}>Climb again</button>
				</div>
			{/if}
		</section>
	{/if}

	<div class="links">
		<a class="btn btn-sm" href="/">Home</a>
		<a class="btn btn-sm" href="/dashboard">Dashboard</a>
	</div>
</div>

<style>
	.err { max-width: 560px; margin: 0 auto; padding: 64px clamp(16px, 4vw, 24px); text-align: center; }
	.code { font-size: 4rem; font-weight: 700; color: var(--border); margin: 0; letter-spacing: 0.05em; }
	.mono { font-family: var(--font-mono); }
	.err h1 { margin: 8px 0; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
	.muted { color: var(--muted); }
	.game { margin: 28px 0 8px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
	.game canvas { width: min(100%, 340px); height: auto; border: 1px solid var(--border); border-radius: var(--shape-m); background: var(--panel); touch-action: none; cursor: pointer; }
	.over p { margin: 0 0 8px; }
	.links { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
</style>
