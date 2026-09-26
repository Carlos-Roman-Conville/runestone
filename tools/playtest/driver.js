// Scripted playtest driver. Injected into the dev page; drives real PointerEvents
// through the canvas and advances Pixi's ticker on a virtual clock so it works even
// when the browser pane is hidden (rAF paused).
window.__errors = window.__errors || [];
if (!window.__errHooked) {
  window.__errHooked = true;
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('rej: ' + String((e.reason && e.reason.message) || e.reason)));
  const oe = console.error;
  console.error = (...a) => { window.__errors.push('console: ' + a.map(String).join(' ')); oe(...a); };
}
const R = () => window.__runestone;
let seed = 12345;
window.__seed = (s) => { seed = s >>> 0; };
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// ---- virtual clock ----------------------------------------------------------
const ticker = R().ctx.app.ticker;
ticker.stop();
let vt = ticker.lastTime > 0 ? ticker.lastTime : 1000;
const ch = new MessageChannel();
const yieldTask = () => new Promise((r) => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const pump = () => { vt += 16; ticker.update(vt); };
const sleep = async (ms) => { for (let i = 0; i < Math.ceil(ms / 16); i++) { pump(); await yieldTask(); } };
window.__sleep = sleep;

// ---- pointer input ----------------------------------------------------------
const canvas = () => document.querySelector('canvas');
function client(lx, ly) { const r = canvas().getBoundingClientRect(); return { x: r.left + (lx * r.width) / 216, y: r.top + (ly * r.height) / 384 }; }
let pid = 10;
function fire(type, lx, ly, id, target) {
  const c = client(lx, ly);
  const up = type === 'pointerup' || type === 'pointercancel';
  (target || canvas()).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: c.x, clientY: c.y, pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons: up ? 0 : 1, width: 1, height: 1, pressure: up ? 0 : 0.5 }));
}
function tap(lx, ly) { const p = pid++; fire('pointerdown', lx, ly, p); fire('pointerup', lx, ly, p); }
window.__tap = tap;
function settled() { const { ctx, session, drag } = R(); return !ctx.inputLocked && !session.busy && !drag.active; }
function legalMoves() { const run = R().session.run; const out = []; for (let h = 0; h < 3; h++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (run.canPlace(h, { x, y })) out.push({ h, x, y }); return out; }
function shapeWH(id) { let w = 0, h = 0; for (const c of R().ctx.shapes.get(id).cells) { w = Math.max(w, c.x + 1); h = Math.max(h, c.y + 1); } return { w, h }; }
// Carried shapes ride with their bottom edge 20 px above the finger (layout DRAG_LIFT_PX).
function target(hIdx, x, y) { const { w, h } = shapeWH(R().session.run.state().hand[hIdx]); return { tx: 12 + x * 24 + w * 12, ty: 48 + y * 24 + h * 24 + 20 }; }
const slotXY = (h) => ({ sx: 4 + h * 72 + 32, sy: 252 + 32 });
async function drag(hIdx, tx, ty, style) {
  const { sx, sy } = slotXY(hIdx);
  const p = pid++;
  fire('pointerdown', sx, sy, p);
  if (style === 'flick') { fire('pointermove', tx, ty, p); fire('pointerup', tx, ty, p); return; }
  for (let i = 1; i <= 6; i++) { fire('pointermove', sx + ((tx - sx) * i) / 6, sy + ((ty - sy) * i) / 6, p); await sleep(16); }
  await sleep(48);
  if (style === 'cancel') { fire('pointercancel', tx, ty, p, window); return; }
  fire('pointerup', tx, ty, p);
}

// ---- scene invariants --------------------------------------------------------
function checkScene(label) {
  const { ctx, session } = R();
  const st = session.run.state();
  const b = ctx.board;
  const probs = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const sp = b.cellSprites.get(x + ',' + y);
    const vis = !!(sp && sp.visible);
    const want = st.grid[y][x] === '#';
    if (vis !== want) probs.push('cell ' + x + ',' + y + ' vis ' + vis + ' want ' + want);
    if (sp && sp.visible && (Math.abs(sp.scale.x - 1) > 1e-6 || sp.texture !== b.textures.resting)) probs.push('cell ' + x + ',' + y + ' not resting (scale ' + sp.scale.x + ')');
  }
  if (b.ghostSprites.length) probs.push('ghost left ' + b.ghostSprites.length);
  if (b.previewKeys.length) probs.push('line preview left');
  ctx.hand.slots.forEach((s, i) => {
    const has = s.children.length > 0;
    if (has !== (st.hand[i] !== null)) probs.push('slot ' + i + ' drawn ' + has + ' hand ' + st.hand[i]);
    if (s.children.some((c) => !c.visible)) probs.push('slot ' + i + ' still hidden after its drag ended');
    const want = st.hand[i] && !session.run.canPlaceAnywhere(i) ? 0.35 : 1;
    if (st.phase === 'playing' && Math.abs(s.alpha - want) > 1e-6) probs.push('slot ' + i + ' alpha ' + s.alpha + ' want ' + want);
    if (s.y !== 0) probs.push('slot ' + i + ' y ' + s.y);
  });
  if (!ctx.hud.ticking && ctx.hud.scoreText.text !== String(st.score)) probs.push('score text ' + ctx.hud.scoreText.text + ' vs ' + st.score);
  if (ctx.hud.streakText.text !== 'Streak ' + st.streak) probs.push('streak text ' + ctx.hud.streakText.text + ' vs ' + st.streak);
  const stage = ctx.app.stage;
  if (stage.children.length !== 2) probs.push('stage children ' + stage.children.length);
  if (stage.children[1] && stage.children[1].children.length) probs.push('drag layer not empty');
  if (b.root.x !== 12) probs.push('board x ' + b.root.x);
  const wantAlpha = st.phase === 'ended' ? 0.4 : 1;
  if (Math.abs(b.root.alpha - wantAlpha) > 1e-6) probs.push('board alpha ' + b.root.alpha + ' phase ' + st.phase);
  if ((st.phase === 'ended') !== ctx.hud.overlay.visible) probs.push('overlay ' + ctx.hud.overlay.visible + ' phase ' + st.phase);
  const saved = localStorage.getItem('runestone.run.v1');
  if (window.__skipSaveCheck) { /* storage-failure runs: saves are expected to be stale */ }
  else if (st.phase !== 'ended') {
    if (!saved) probs.push('no run save');
    else if (JSON.stringify(JSON.parse(saved).save) !== JSON.stringify(session.run.serialize())) probs.push('save mismatch');
  } else if (saved) probs.push('ended run still saved');
  if (window.__errors.length) probs.push('errors: ' + window.__errors.slice(0, 3).join(' / '));
  if (probs.length) throw new Error(label + ': ' + probs.slice(0, 8).join(' | '));
}
window.__checkScene = checkScene;

async function waitDecision(step) {
  for (let i = 0; i < 600; i++) {
    const { ctx, session } = R();
    if (ctx.hud.offerResolve) return 'offer';
    if (ctx.hud.hint.visible && ctx.board.root.eventMode === 'static') return 'pick';
    if (settled()) { await sleep(32); if (settled()) return session.run.state().phase; }
    await sleep(16);
  }
  const { ctx, session, drag: d } = R();
  throw new Error('stuck at step ' + step + ': locked ' + ctx.inputLocked + ' busy ' + session.busy + ' drag ' + !!d.active + ' phase ' + session.run.state().phase);
}

window.__stats = { moves: 0, flicks: 0, illegal: 0, cancels: 0, offers: 0, watched: 0, declined: 0, picks: 0, runsEnded: 0, dailyTaps: 0, clears: 0, combos: 0, retries: 0, steps: 0 };
window.__drive = async (n) => {
  const stats = window.__stats;
  for (let k = 0; k < n; k++) {
    const step = stats.steps++;
    const s = await waitDecision(step);
    if (s === 'offer' && window.__stopAtOffer) return stats;
    if (s === 'offer') { stats.offers++; if (rnd() < 0.6) { stats.watched++; tap(68, 216); } else { stats.declined++; tap(148, 216); } await sleep(64); continue; }
    if (s === 'pick') {
      // Two-tap pick: sometimes change mind first, then tap the chosen cell twice.
      stats.picks++;
      const cell = () => [12 + Math.floor(rnd() * 8) * 24 + 12, 48 + Math.floor(rnd() * 8) * 24 + 12];
      if (rnd() < 0.3) { const [ax, ay] = cell(); tap(ax, ay); await sleep(32); }
      const [cx, cy] = cell(); tap(cx, cy); await sleep(32); tap(cx, cy); await sleep(64); continue;
    }
    await sleep(320);
    checkScene('step ' + step + ' (' + s + ')');
    if (s === 'ended') {
      // The game-over screen ignores taps for 600 ms; an early tap must do nothing.
      stats.runsEnded++;
      const endedRun = R().session.run;
      tap(108, 200); await sleep(32);
      if (R().session.run !== endedRun) throw new Error('game-over tap guard let an early tap through at step ' + step);
      await sleep(640); tap(108, 200); await sleep(64); continue;
    }
    const r = rnd();
    const run = R().session.run;
    const before = JSON.stringify(run.state());
    if (window.__greedy && r < 0.15) { /* greedy mode: no noise moves */ }
    else if (r < 0.03 && !R().session.status().dailyDone) { stats.dailyTaps++; tap(172, 20); await sleep(64); continue; }
    if (r < 0.10) {
      const slots = [0, 1, 2].filter((i) => run.state().hand[i]);
      const hIdx = slots[Math.floor(rnd() * slots.length)];
      let x, y, tries = 0;
      do { x = Math.floor(rnd() * 11) - 2; y = Math.floor(rnd() * 11) - 2; tries++; } while (run.canPlace(hIdx, { x, y }) && tries < 50);
      if (run.canPlace(hIdx, { x, y })) continue;
      const { tx, ty } = target(hIdx, x, y);
      await drag(hIdx, tx, ty, rnd() < 0.5 ? 'flick' : 'smooth');
      await sleep(200);
      stats.illegal++;
      if (JSON.stringify(R().session.run.state()) !== before) throw new Error('illegal drop changed state at step ' + step + ' origin ' + x + ',' + y);
      continue;
    }
    const moves = legalMoves();
    let m = moves[Math.floor(rnd() * moves.length)];
    if (window.__greedy) {
      // Best immediate points, then fewest filled cells: long runs that reach the kill rule.
      let best = -1, bestFill = 1e9;
      for (const c of moves) { const p = run.preview(c.h, { x: c.x, y: c.y }); if (p.points > best || (p.points === best && p.filledAfter < bestFill)) { best = p.points; bestFill = p.filledAfter; m = c; } }
    }
    const { tx, ty } = target(m.h, m.x, m.y);
    if (r < 0.15) {
      await drag(m.h, tx, ty, 'cancel');
      await sleep(200);
      stats.cancels++;
      if (JSON.stringify(R().session.run.state()) !== before) throw new Error('cancel changed state at step ' + step);
      continue;
    }
    const style = r < 0.4 ? 'flick' : 'smooth';
    if (style === 'flick') stats.flicks++;
    const placedBefore = run.state().placements;
    const evBefore = run.events().length;
    await drag(m.h, tx, ty, style);
    for (let i = 0; i < 60 && R().session.run === run && run.state().placements === placedBefore; i++) await sleep(16);
    if (R().session.run === run && run.state().placements === placedBefore) {
      stats.retries++;
      throw new Error('drop did not place at step ' + step + ' move ' + JSON.stringify(m) + ' style ' + style);
    }
    for (const e of run.events().slice(evBefore)) {
      if (e.type === 'LinesCleared' && e.cells.length) stats.clears++;
      if (e.type === 'ComboScored' && e.linesCleared >= 2) stats.combos++;
    }
    stats.moves++;
  }
  return stats;
};
'driver installed';
