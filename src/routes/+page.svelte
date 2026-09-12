<svelte:head>
	<title>Attendit — in-room attendance that holds up in class</title>
</svelte:head>

<div class="page">
	<section class="hero" aria-labelledby="hero-h">
		<div>
			<h1 id="hero-h">Run attendance in the room.<br /><span class="green">Close it with proof.</span></h1>
			<div class="cta-row">
				<a class="btn btn-filled" href="/auth/sign-up">Start as a host</a>
				<a class="btn" href="/auth/sign-in">Sign in</a>
			</div>
		</div>
		<p>
			Start a session for a subject. Announce a short code or show a QR.
			Students check in from their phones — identity, code, location, and
			duplicates verified on the server. Then close and export the record.
		</p>
	</section>

	<p class="micro-note"><strong>Students need no account.</strong> They open your class link, pick their name, share location once, and enter the code — or scan your QR.</p>

	<div class="cards" id="how">
		<article class="card lead" aria-labelledby="c1-h">
			<h2 id="c1-h">Live sessions</h2>
			<p>Every class runs <strong>sessions</strong> per subject — open until you close them. One code, one QR, one realtime feed, readable from the back row.</p>
			<div class="foot" role="img" aria-label="Example session code 482 913">482 913</div>
		</article>

		<div class="seconds">
			<article class="card" id="verify" aria-labelledby="c2-h">
				<h2 id="c2-h">Host-relative checks</h2>
				<p><strong>Code, QR, location, one submission</strong> per student — checked server-side against a fresh host position.</p>
			</article>

			<article class="card" id="export" aria-labelledby="c3-h">
				<h2 id="c3-h">Results &amp; export</h2>
				<p>Close the session and keep the <strong>permanent record</strong> in Postgres. Export a copy to <strong>CSV or Google Sheets</strong>.</p>
			</article>
		</div>
	</div>

	<div class="flow" aria-label="Session flow">
		<div class="flow-line"><strong>Class → Session → Verify → Results → Export.</strong> Radius default 100 m · code 6 chars · code announced, never pre-shared.</div>
		<p class="flow-note">Honest model: raises the difficulty of proxy check-ins. No browser system can make spoofing impossible, and we don't claim otherwise.</p>
	</div>
</div>
