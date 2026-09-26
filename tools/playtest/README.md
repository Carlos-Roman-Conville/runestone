# tools/playtest: scripted play in the real page

`driver.js` plays the dev build through real PointerEvents on the canvas: smooth drags,
fast flicks, illegal drops, cancelled touches, Daily taps, continue offers (watch or
decline) and cell picks. After every settled move it checks the scene against the
engine: every tile's visibility and state, leftover ghosts or line previews, tray
contents and dimming, score and streak text, overlays, board position and alpha, and
that the saved run equals the live run. It advances Pixi's ticker on a virtual clock,
so it runs at full speed and works even when the browser tab is hidden.

It needs the dev-only `globalThis.__runestone` hook in `game/main.ts` (stripped from
production builds).

Run it:

1. `npx vite` and open the page.
2. In the page console, paste `driver.js` wrapped as `(() => { ...contents... })()`,
   or load it with `eval(await (await fetch(...)).text())`.
3. `await __drive(300)` returns counts; a failure throws with the step and what differed.
   `__seed(n)` changes the random sequence, `__greedy = true` plays for long runs,
   `__stopAtOffer = true` stops when a continue is offered (for reload tests).
