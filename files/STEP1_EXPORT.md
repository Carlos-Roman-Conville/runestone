# Step 1 — export pipeline and test ad (the gate before any engine code)

**Owner:** Cursor Composer from this recipe, Rex on device. **Gate:** one build runs in a browser, the same build runs on an Android phone, and both show an AdMob **test** rewarded ad. Nothing else in the build order starts until this passes.

Why first: the export and ad plumbing is where solo phone projects die. Proving it on a blank scene costs a day; discovering it broken after the game is built costs the project.

## What gets built

- `game/` becomes a Vite + PixiJS app that renders one 24 px stone tile at whole-number scale with nearest-neighbor filtering and a "Show test ad" button.
- Capacitor wraps it for Android. iOS is out of scope for step 1.
- `ops/real/admob.ts` implements `AdsPort` (see `ops/ads.ts`) against the Capacitor AdMob plugin using Google's **test ad unit ids only**. No real ad unit id is created or committed in step 1.
- Web build serves the same scene; on web `AdsPort` is `FakeAds` until a portal SDK is chosen.

## Recipe

Versions below are the pins in `AGENTS.md`; if a package refuses to install at that major, stop and report the version rather than guessing.

1. **Vite + PixiJS scene.**
   - `npm i -D vite` · `npm i pixi.js@^8`
   - `game/index.html`, `game/main.ts`: create a `Pixi.Application`, set `TextureSource.defaultOptions.scaleMode = "nearest"` (Pixi 8), load one 24 px placeholder tile PNG from `game/assets/`, draw it at scale 4, add a DOM button "Show test ad".
   - `vite.config.ts` at root with `root: "game"`, `build.outDir: "../dist"`. Add scripts: `"dev": "vite"`, `"build": "vite build"`.
   - Check: `npm run dev` shows the tile crisp (no blur) at 96 px on screen.
2. **Capacitor Android.**
   - `npm i @capacitor/core@^6 @capacitor/android@^6` · `npm i -D @capacitor/cli@^6`
   - `npx cap init runestone com.placeholder.runestone --web-dir dist` (app id is a placeholder; R14 renaming changes it).
   - `npm run build && npx cap add android && npx cap sync`
   - Open `android/` in Android Studio, run on a physical phone (emulators do not serve ads reliably).
   - Check: the tile renders on the phone.
3. **AdMob test ad.**
   - `npm i @capacitor-community/admob` (verify it supports Capacitor 6; if not, report the supported version).
   - `ops/real/admob.ts`: `class AdMobAds implements AdsPort` — `initialize()` with `initializeForTesting: true`, prepare a rewarded ad with Google's test unit id (`ca-app-pub-3940256099942544/5224354917` for Android rewarded), `showRewarded` resolves true only on the `rewarded` event, false on dismiss/fail. Interstitial uses the test id `ca-app-pub-3940256099942544/1033173712` and the cap from R4 is a TODO stub returning true.
   - Android manifest: add the AdMob **test** app id `ca-app-pub-3940256099942544~3347511713` as `com.google.android.gms.ads.APPLICATION_ID`.
   - Wire the button: `ops.ads.showRewarded("continue")` then show the boolean on screen.
   - Check: the phone shows Google's test rewarded video; the screen shows `true` after watching, `false` after closing early.
4. **Consent placeholder.** Do not integrate UMP in step 1; leave a `// TODO(step 7): UMP consent before initialize` comment in `admob.ts`. Analytics stays `FakeAnalytics`.
5. **Secrets hygiene.** No real ids anywhere. `android/` stays gitignored until Rex decides to commit it; if committed, `local.properties` and signing files must be ignored first.
6. **Record the gate.** Rex records both screens and opens the frames. Then mark step 1 DONE in `HANDOFF.md` with the date and the versions that actually installed.

## Done when

- `npm run build` produces `dist/` and `npm run check` is still green (the layer guard must still pass: nothing in `game/` or `ops/real/` may be imported by `engine/`).
- Android build installs from Android Studio and shows the test rewarded ad end to end.
- `files/HANDOFF.md` build order row 1 says DONE with versions.
