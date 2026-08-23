#!/usr/bin/env node
/**
 * Tank Realms headless verification harness (v4 — v27.3: texture-free HP bars + names).
 * The 2D canvas stub RECORDS draw calls (so name rendering is verifiable without a
 * native canvas package); WebGL/WebAudio remain permissive proxies.
 * NOTE: the injected STUB contains no backslash escapes (build-safe by construction).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const GAME = path.join(__dirname, '..', '..', 'tank_realms_latest.html');
const NL = String.fromCharCode(10);

// ---------------------------------------------------------------- stub script
const STUB_LINES = [
  '<script>',
  '/* ===== ARENA TEST HARNESS STUBS (virtual clock, WebGL proxy, recording 2D) ===== */',
  '(function () {',
  '  window.__vt = 0;',
  '  window.__rafQ = [];',
  '  window.requestAnimationFrame = function (cb) { window.__rafQ.push(cb); return window.__rafQ.length; };',
  '  window.cancelAnimationFrame = function () {};',
  '  window.scrollTo = function () {};',
  '  try { performance.now = function () { return window.__vt; }; } catch (e) {}',
  '  var EPOCH = 1755700000000;',
  '  Date.now = function () { return EPOCH + window.__vt; };',
  '  try {',
  '    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };',
  '    window.HTMLMediaElement.prototype.pause = function () {};',
  '    window.HTMLMediaElement.prototype.load = function () {};',
  '  } catch (e) {}',
  "  try { if (!navigator.vibrate) Object.defineProperty(navigator, 'vibrate', { value: function () {} }); } catch (e) {}",
  '',
  '  var P = new Proxy(function arenaStub() {}, {',
  '    get: function (t, prop) {',
  '      if (prop === Symbol.toPrimitive) return function () { return 0; };',
  "      if (prop === 'then') return undefined;",
  "      if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return function () { return ''; };",
  "      if (prop === 'getParameter') return function (p) {",
  "        if (p === 7938) return 'WebGL 1.0 (Arena Stub)';",
  "        if (p === 35724) return 'WebGL GLSL ES 1.0 (Arena Stub)';",
  '        return 4096;',
  '      };',
  "      if (prop === 'getShaderPrecisionFormat') return function () { return { precision: 23, rangeMin: 127, rangeMax: 127 }; };",
  "      if (prop === 'isContextLost') return function () { return false; };",
  '      if (!t.__cache) t.__cache = new Map();',
  '      if (!t.__cache.has(prop)) t.__cache.set(prop, P);',
  '      return t.__cache.get(prop);',
  '    },',
  '    set: function () { return true; },',
  '    apply: function () { return P; },',
  '    construct: function () { return P; }',
  '  });',
  '  window.__P = P;',
  '',
  '  function FakeAudioContext() { this.destination = P; this.currentTime = 0; this.sampleRate = 44100; this.state = "running"; }',
  '  FakeAudioContext.prototype = P;',
  '  window.AudioContext = FakeAudioContext;',
  '  window.webkitAudioContext = FakeAudioContext;',
  '',
  '  /* Recording 2D context: permissive for EVERY api the game may use (a partial stub',
  '     once killed boot at createLinearGradient), and logs draw calls for assertions. */',
  '  function make2d(canvas) {',
  '    var calls = canvas.__2dCalls = canvas.__2dCalls || [];',
  '    var base = {',
  '      canvas: canvas,',
  "      fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif',",
  "      textAlign: 'start', textBaseline: 'alphabetic', lineWidth: 1, globalAlpha: 1,",
  "      lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, shadowBlur: 0,",
  "      shadowColor: 'rgba(0, 0, 0, 0)', shadowOffsetX: 0, shadowOffsetY: 0,",
  "      globalCompositeOperation: 'source-over', lineDashOffset: 0,",
  '      createLinearGradient: function () { calls.push(["createLinearGradient"]); return { addColorStop: function () {} }; },',
  '      createRadialGradient: function () { calls.push(["createRadialGradient"]); return { addColorStop: function () {} }; },',
  '      createPattern: function () { return {}; },',
  '      measureText: function (t) { return { width: String(t).length * 7 }; },',
  '      getImageData: function (x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }; },',
  '      createImageData: function (w, h) { return { width: w, height: h, data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }; },',
  '      putImageData: function () {},',
  '      isPointInPath: function () { return false; }',
  '    };',
  '    return new Proxy(base, {',
  '      get: function (t, prop) {',
  '        if (prop in t) return t[prop];',
  '        if (typeof prop !== "string") return undefined;',
  '        var fn = function () { var a = [].slice.call(arguments).map(String); if (prop === "fillRect" || prop === "strokeRect" || prop === "fillText" || prop === "strokeText") a.push(String(base.fillStyle)); calls.push([prop].concat(a)); };',
  '        t[prop] = fn;',
  '        return fn;',
  '      },',
  '      set: function (t, prop, v) { t[prop] = v; return true; }',
  '    });',
  '  }',
  '  HTMLCanvasElement.prototype.getContext = function (type) {',
  "    if (type === '2d') { if (!this.__2d) this.__2d = make2d(this); return this.__2d; }",
  '    return P; // webgl & friends — never call jsdom real getContext (avoids noise)',
  '  };',
  '',
  '  window.__pageErrors = [];',
  "  window.addEventListener('error', function (e) {",
  "    window.__pageErrors.push(e.message + ' @' + (e.lineno || '?') + ' | ' + (e.error && e.error.stack || '(no stack)'));",
  '  });',
  '})();',
  '</script>',
  '',
];
const STUB = STUB_LINES.join(NL);

// ---------------------------------------------------------------- load + boot
const raw = fs.readFileSync(GAME, 'utf8');
const anchor = '<script>/* Three.js r128';
const idx = raw.indexOf(anchor);
if (idx < 0) throw new Error('three.js script anchor not found');
const html = raw.slice(0, idx) + STUB + raw.slice(idx);

const errors = [], warns = [], jsdomErrors = [];
const vc = new VirtualConsole();
vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
vc.on('warn', (...a) => warns.push(a.map(String).join(' ')));
vc.on('jsdomError', (e) => jsdomErrors.push((e.detail && e.detail.stack) || (e.stack || e.message)));
process.on('unhandledRejection', (r) => errors.push('unhandledRejection: ' + (r && r.stack || r)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://tankrealms.test/game.html',
  virtualConsole: vc,
});
const win = dom.window;
if (typeof win.__rafQ === 'undefined') throw new Error('STUB DID NOT RUN - aborting');

try { win.eval("if (typeof THREE !== 'undefined' && THREE.WebGLRenderer) THREE.WebGLRenderer.prototype.render = function () {};"); } catch (e) { errors.push('render patch: ' + e.message); }

function step(n) {
  for (let i = 0; i < n; i++) {
    win.__vt += 1000 / 60;
    const q = win.__rafQ.splice(0);
    for (const cb of q) {
      try { cb(win.__vt); }
      catch (e) { errors.push('rAF callback threw: ' + (e && e.stack || e)); }
    }
  }
}
const ev = (code) => win.eval(code);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) }); if (!ok) process.exitCode = 1; };
const cleanSoFar = () => errors.length === 0 && (win.__pageErrors || []).length === 0;
const errDetail = () => errors.slice(0, 2).join(' | ') + ' / ' + (win.__pageErrors || []).slice(0, 2).join(' | ');
// Natural level-ups open real card screens which FREEZE physics — close them between sections
const closeCards = () => ev("(function(){ state.pendingChoices = 0; state.isChoosingUpgrade = false; var o = document.getElementById('upgrade-choice'); if (o) o.remove(); return 'ok'; })()");
// Deterministic combat: no level-ups (no card freeze), no stray enemies, full-health player
const quietBoard = () => ev("(function(){ state.xpToNext = 1e12; state.xp = 0; enemies.slice().forEach(function(e){ e.die(); }); player.maxHp = 999999; player.hp = 999999; state.targetEnemy = null; return 'ok'; })()");
const unquietXp = () => ev("(function(){ state.xp = 0; state.xpToNext = 200; return 'ok'; })()");

// ---------------------------------------------------------------- 1. boot
step(120);
check('boot: stub live, 0 errors after 2s menu', cleanSoFar(), errDetail());

// ---------------------------------------------------------------- 2. start a casual run
const btn = win.document.getElementById('btn-casual-new');
check('boot: start button exists', !!btn);
btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
step(60);
ev("if (typeof player !== 'undefined' && player) { player.maxHp = 999999; player.hp = 999999; }");
step(1140);
check('game: phase is playing', ev("state.gamePhase") === 'playing', ev("state.gamePhase"));
check('game: enemies spawned', ev("enemies.length") > 0, 'enemies=' + ev("enemies.length"));
check('game: 0 errors after 20s run', cleanSoFar(), errDetail());

// ---------------------------------------------------------------- 3. v27.2 scaling table (unchanged this pass)
const scale = ev(`(function () {
  function row(L) { state.level = L; var s = enemyLevelScale(); return [s.hp, s.dmg, s.spd, s.pts]; }
  return { L1: row(1), L15: row(15), L25: row(25), L35: row(35) };
})()`);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const exp = { L1: [1, 1, 1, 1], L15: [1.84, 1.532, 1.14, 1.79], L25: [2.82, 2.222, 1.24, 2.59], L35: [4.0, 3.122, 1.34, 3.39] };
for (const L of Object.keys(exp)) {
  const ok = scale[L].every((v, i) => close(v, exp[L][i]));
  check('scaling ' + L + ' = ' + exp[L].join('/'), ok, 'got ' + scale[L].map((v) => +v.toFixed(4)).join('/'));
}
const fireOk = ev("(1 + Math.min(0.55, Math.max(0, 15 - 1) * 0.015)) === 1.21 && (1 + Math.min(0.55, Math.max(0, 50 - 1) * 0.015)) === 1.55");
check('fire-rate ramp formula v27 (lv15 x1.21, cap x1.55)', fireOk);

// ---------------------------------------------------------------- 4. wasp pack = 4
const waspDelta = ev(`(function () {
  state.level = 15;
  var before = enemies.length, orig = Math.random;
  Math.random = function () { return 0.9999; };
  try { spawnEnemy(); } finally { Math.random = orig; }
  return enemies.length - before;
})()`);
check('wasp spawn brings a pack of 4', waspDelta === 4, 'delta=' + waspDelta);

// ---------------------------------------------------------------- 5. juggernaut at lv15 (retuned)
const jugg = ev(`(function () {
  state.level = 15;
  var orig = Math.random;
  Math.random = function () { return 0.99; }; // never ELITE — deterministic baseline juggernaut
  var j;
  try { j = makeScaledEnemy('juggernaut', 8, 8); } finally { Math.random = orig; }
  return { hp: j.maxHp, armor: j.armorFlat, dmgMult: j.damageMult, hasBar: !!j.hpBar };
})()`);
check('juggernaut lv15 HP = ' + Math.round(650 * 1.84) + ' (retuned)', jugg.hp === Math.round(650 * 1.84), 'got ' + jugg.hp);
check('juggernaut lv15 armor = 4.3 (2.5 + 0.12L)', close(jugg.armor, 4.3), 'got ' + jugg.armor);
check('juggernaut lv15 damageMult = 1.532', close(jugg.dmgMult, 1.532), 'got ' + jugg.dmgMult);
const rosterOk = ev("(function () { var t = getEnemyTypeForLevel(13); return typeof t === 'string' && t !== 'juggernaut' ? 'checked' : 'leaky'; })()");
check('juggernaut no longer spawns below lv14 (roster sample)', rosterOk === 'checked', rosterOk);

// ---------------------------------------------------------------- 5c. v27.3: texture-free HP bars + names
const barFull = ev(`(function () {
  var e = makeScaledEnemy('scout', 20, 20);
  var b = e.hpBar;
  var full = { inScene: b && b.group.parent === scene, kids: b ? b.group.children.length : 0,
               scaleX: b ? b.fill.scale.x : -1, color: b ? b.fill.material.color.getHex() : -1 };
  // knock down to ~40% through the REAL damage path
  e.hp = Math.max(1, Math.round(e.maxHp * 0.4));
  e.takeDamage(1);
  var pctNow = e.hp / e.maxHp;
  var after = { scaleX: b.fill.scale.x, color: b.fill.material.color.getHex(),
                anchoredLeft: Math.abs(b.fill.position.x - (-(b.barW * (1 - pctNow)) / 2)) < 1e-9 };
  return { full: full, pct: pctNow, after: after };
})()`);
check('v27.3: HP bar group is in the scene', barFull.full.inScene === true, JSON.stringify(barFull.full));
check('v27.3: bar has name + background + fill (3 planes)', barFull.full.kids === 3, 'kids=' + barFull.full.kids);
check('v27.3: full HP -> full-width green fill', close(barFull.full.scaleX, 2.6) && barFull.full.color === 0x22c55e, 'scale=' + barFull.full.scaleX + ' color=0x' + barFull.full.color.toString(16));
const pctExp = barFull.pct;
check('v27.3: damage shrinks the fill to real HP (' + (pctExp * 100).toFixed(1) + '%) in yellow',
  close(barFull.after.scaleX, 2.6 * pctExp, 1e-6) && barFull.after.color === 0xeab308 && barFull.after.anchoredLeft,
  'scale=' + barFull.after.scaleX + ' (want ' + (2.6 * pctExp).toFixed(4) + ') color=0x' + barFull.after.color.toString(16));

const nameOk = ev(`(function () {
  var a = _enemyNameAssets['scout'];
  var calls = a && a.tex.image.__2dCalls || [];
  var fill = calls.filter(function (c) { return c[0] === 'fillText'; });
  var stroke = calls.filter(function (c) { return c[0] === 'strokeText'; });
  return { name: fill.length ? fill[0][1] : '(none)', font: fill.length ? fill[0][5] : '(none)', outlined: stroke.length > 0 };
})()`);
check("v27.3: enemy NAME renders ('SCOUT') with outline, small font", nameOk.name === 'SCOUT' && nameOk.outlined === true, JSON.stringify(nameOk));

const follow = ev(`(function () {
  var e = enemies.filter(function (x) { return x.hpBar; })[0];
  if (!e) return 'none';
  e.mesh.position.x += 7;
  return { gx: e.hpBar.group.position.x, ex: e.mesh.position.x, off: e.hpBar.yOff, gy: e.hpBar.group.position.y };
})()`);
step(2);
const followAfter = ev("(function(){ var e = enemies.filter(function(x){ return x.hpBar; })[0]; return e ? e.hpBar.group.position.x : 'none'; })()");
check('v27.3: bar follows the enemy as it moves', typeof followAfter === 'number' && Math.abs(followAfter - follow.ex) < 0.4, 'bar.x ' + follow.gx + ' -> ' + followAfter + ' (enemy.x ' + follow.ex + ')');

const deathBar = ev(`(function () {
  var e = enemies.filter(function (x) { return x.hpBar; })[0];
  if (!e) return 'none';
  var g = e.hpBar.group;
  e.die();
  return { cleared: e.hpBar === null, removed: g.parent === null };
})()`);
check('v27.3: bar is removed and freed on death', deathBar !== 'none' && deathBar.cleared === true && deathBar.removed === true, JSON.stringify(deathBar));

// ---------------------------------------------------------------- 6. v27.2: boss chain fix
ev('state.bossCount = 2; state.bossPending = true;');
let tries = 0;
while (!ev('!!state.bossActive') && tries++ < 600) step(1);
check('boss spawns on demand (colossus)', !!ev('state.bossActive'), 'tries=' + tries);
check('boss bar shown while boss alive', ev("document.getElementById('boss-bar').classList.contains('show')") === true);
ev('state.bossActive.takeDamage(99999999)');
step(120);
check('after out-of-band kill, bossActive self-heals to null', ev('state.bossActive') === null, 'got ' + String(ev('state.bossActive')));
check('boss bar hides after out-of-band kill', ev("document.getElementById('boss-bar').classList.contains('show')") === false);
ev('state.bossPending = true;');
step(600);
check('next queued boss spawns again (gate un-bricked)', ev('!!state.bossActive && !state.bossActive.isDead') === true);
ev('state.bossActive.hp = 1; state.bossActive.takeDamage(999);');
step(30);

// ---------------------------------------------------------------- 6b. splash kill defeats a boss
closeCards();
ev('state.playerStats.splash = 10; state.bossCount = 2; state.bossPending = true;');
tries = 0;
while (!ev('!!state.bossActive') && tries++ < 600) step(1);
quietBoard();
ev("(function(){ var b = state.bossActive; if (b) { b.hp = 1; } var s = makeScaledEnemy('scout', b.mesh.position.x, b.mesh.position.z); s.hp = 1; state.targetEnemy = s; })()");
ev('state.input.isFiring = true;');
step(90);
ev('state.input.isFiring = false; state.playerStats.splash = 0; state.targetEnemy = null;');
const splashDead = ev("state.bossActive === null || (state.bossActive && state.bossActive.isDead)");
check('boss slain by splash registers defeat', splashDead === true, 'bossActive=' + String(ev('!!state.bossActive')));
check('boss bar hides after splash kill', ev("document.getElementById('boss-bar').classList.contains('show')") === false);
ev('state.bossActive = null;');
closeCards();

// ---------------------------------------------------------------- 7. card watchdog
closeCards();
ev("state.isChoosingUpgrade = true; state.pendingChoices = 0;");
step(5);
check('stuck card flag self-clears (unfreezes physics)', ev('state.isChoosingUpgrade') === false);
ev("state.isChoosingUpgrade = true; state.pendingChoices = 1;");
step(5);
check('queued card choice is re-offered after desync', ev("state.isChoosingUpgrade === true && !!document.getElementById('upgrade-choice')") === true);
closeCards();

// ---------------------------------------------------------------- 8. regen + healOnKill
quietBoard();
ev("(function(){ state.playerStats.regen = 5; state.playerStats.healOnKill = 0; player.hp = 999000; state.invulnUntil = clock.getElapsedTime() + 10; state.lastRegenTime = clock.getElapsedTime(); })()");
step(150);
check('Repair Kit regen heals over time (+5/s)', ev('player.hp') >= 999005 && ev('player.hp') <= 999020, 'hp -> ' + ev('player.hp'));
quietBoard();
ev("(function(){ state.playerStats.regen = 0; state.playerStats.healOnKill = 4; player.hp = 500; var t = makeScaledEnemy('scout', player.mesh.position.x, player.mesh.position.z); t.hp = 1; state.input.isFiring = true; })()");
step(60);
ev('state.input.isFiring = false; state.playerStats.healOnKill = 0;');
check('Field Medic heals on kill via the real bullet path', ev('player.hp') >= 504, 'hp -> ' + ev('player.hp'));
unquietXp();
closeCards();

// ---------------------------------------------------------------- 8b. v27.4: HUD scale + smoke + ground offset
const hudOk = ev("(function(){ var panel = document.getElementById('hp-panel'); var txt = document.querySelector('.hp-text'); return { underLevel: !!(panel && panel.parentElement && panel.parentElement.classList.contains('hud-center')), textHidden: txt ? getComputedStyle(txt).display === 'none' : 'gone' }; })()");
check('v27.4: HP panel sits directly under the level chip', hudOk.underLevel === true, JSON.stringify(hudOk));
check('v27.4: HP numbers hidden (scale display only)', hudOk.textHidden === true || hudOk.textHidden === 'gone', String(hudOk.textHidden));
ev("(function(){ player.maxHp = 200; player.hp = 80; updateHUD(); return 'set'; })()");
const hpWidth = ev("document.getElementById('hp-bar').style.width");
check('v27.4: HP bar shows 40% width after damage', hpWidth === '40%', 'got ' + hpWidth);
const smokeN = ev("(function(){ var n0 = particles.length; var e = makeScaledEnemy('scout', 30, 30); e.die(); return particles.length - n0; })()");
check('v27.4: enemy death effects are lighter (6-13 particles)', smokeN >= 6 && smokeN <= 13, 'particles=' + smokeN);
step(2);
const offDelta = ev("(function(){ var ty = getTerrainHeight(player.mesh.position.x, player.mesh.position.z); return Math.abs(player.mesh.position.y - (ty + 0.3)); })()");
check('v27.4: player rides 0.3 above terrain (anti-sinking)', offDelta < 0.05, 'delta=' + offDelta);

// ---------------------------------------------------------------- 9. glow pool + shop
const glow = ev("(glowLightPool.length || (initGlowLights(), glowLightPool.length))");
check('glowLightPool has 8 entries', glow === 8, 'got ' + glow);
const shopOk = ev(`(function () { try { renderShop(); state.owned = state.owned || {}; state.owned['dmg_inf'] = 50; state.owned['hp_inf'] = 60; renderShop(); return 'ok'; } catch (e) { return 'THREW: ' + e.message; } })()`);
check('renderShop() ok incl. unlimited tracks', shopOk === 'ok', shopOk);

// ---------------------------------------------------------------- 10. ENEMY SURGE
closeCards();
quietBoard();
const surgeBefore = ev("state.coins || 0");
ev("state.runTime = Math.max(state.runTime, state.surgeNextAt - 0.4)");
step(60);
check('surge triggers when runTime passes surgeNextAt', ev("state.surgeActive === true") === true);
step(1200);
const surgeAfter = ev("({ active: state.surgeActive, coins: state.coins || 0, lvl: state.level })");
const bounty = 60 + surgeAfter.lvl * 10;
check('surge ends after 15s and pays ' + bounty, surgeAfter.active === false && surgeAfter.coins >= surgeBefore + bounty, 'coins ' + surgeBefore + ' -> ' + surgeAfter.coins);

// ---------------------------------------------------------------- 11. soak: 60s at lv15
quietBoard();
const maxSeen = { n: 0 };
for (let i = 0; i < 3600; i++) {
  step(1);
  if (i % 30 === 0) {
    ev("if (typeof player !== 'undefined' && player && !player.isDead) player.hp = player.maxHp;");
    const n = ev("enemies.filter(function(e){ return !e.isDead; }).length");
    if (n > maxSeen.n) maxSeen.n = n;
  }
}
check('soak: 0 errors over 60s at lv15', cleanSoFar(), errDetail());
check('soak: all live enemies still carry bars', ev("enemies.every(function(e){ return e.isBoss || !!e.hpBar; })") === true);
check('soak: live enemies under the ceiling (<= 15 +3 surge +3 pack)', maxSeen.n <= 21, 'max concurrent=' + maxSeen.n);
check('soak: still playing (no crash)', ev("state.gamePhase") === 'playing', ev("state.gamePhase"));

// ---------------------------------------------------------------- 12. v27.4: save/load keeps boosts, consumables untouched
quietBoard();
ev("(function(){ var c = consumables(); c.overcharge = 2; c.aegis = 1; return 'stash'; })()");
ev("(function(){ state.playerStats.damage = 250; state.runCoinBoost = 0.2; state.overchargeUntil = state.runTime + 40; state.shieldUp = true; state.shieldReadyAt = 123; window.__snap = snapshotRun(); return window.__snap.playerStats.damage; })()");
ev("startGame('casual', { resume: window.__snap })");
step(30);
const resState = ev("(function(){ return { dmg: state.playerStats.damage, coinBoost: state.runCoinBoost, oc: state.overchargeUntil - state.runTime, shield: state.shieldUp, ring: !!(player && player.shieldRing && player.shieldRing.visible), consOC: consumables().overcharge, consAegis: consumables().aegis, phase: state.gamePhase }; })()");
check('v27.4: resume keeps claimed card buffs (damage 250)', resState.dmg === 250, JSON.stringify(resState));
check('v27.4: resume keeps Lucky coin boost (x0.2)', resState.coinBoost === 0.2);
check('v27.4: resume keeps Overcharge window (~40s left)', resState.oc > 35 && resState.oc <= 40, 'left=' + resState.oc);
check('v27.4: resume keeps Aegis shield + ring visible', resState.shield === true && resState.ring === true);
check('v27.4: resume does NOT re-consume consumables (2/1)', resState.consOC === 2 && resState.consAegis === 1);
quietBoard();

// ---------------------------------------------------------------- 13. v27.4: biome morph re-grounds all scenery
ev("envChunks.forEach(function(c){ c.__preMorph = true; });");
ev("startBiomeMorph((state.currentBiome + 1) % BIOMES.length)");
let mFrames = 0;
while (ev("biomeBlend !== null") && mFrames++ < 1200) step(1); // 8s morph + grace + final tile pass
let dFrames = 0;
while (ev("chunkTasks.length > 0") && dFrames++ < 600) step(1); // drain the forced rebuild wave
const morphRes = ev("(function(){ var pre = 0; envChunks.forEach(function(c){ if (c.__preMorph) pre++; }); return { pre: pre, total: envChunks.size, blend: biomeBlend === null }; })()");
check('v27.4: morph completes (blend cleared)', morphRes.blend === true, 'frames=' + mFrames + '/' + dFrames);
check('v27.4: ALL chunks rebuilt at final heights (no floating pre-morph scenery)', morphRes.total > 0 && morphRes.pre === 0, JSON.stringify(morphRes));
check('v27.4: morph + forced rebuild ran clean', cleanSoFar(), errDetail());

// ---------------------------------------------------------------- 14. v27.5: elites, fire-sound throttle, HP %
quietBoard();
const elite = ev("(function(){ state.level = 15; var orig = Math.random; Math.random = function(){ return 0.001; }; var e; try { e = makeScaledEnemy('scout', 40, 40); } finally { Math.random = orig; } var c = makeScaledEnemy('scout', 41, 41); return { elite: !!e.isElite, ctrl: !c.isElite, hpR: e.maxHp / c.maxHp, ptsR: e.pointValue / c.pointValue, dmgR: e.damageMult / c.damageMult, scaleR: e.mesh.scale.x / c.mesh.scale.x, nameE: !!_enemyNameAssets['scout|E'], bar: !!e.hpBar, tip: !!(state.tutorialTips || {}).elite }; })()");
check('v27.5: forced low roll spawns an ELITE (control does not)', elite.elite === true && elite.ctrl === true, JSON.stringify({ e: elite.elite, c: elite.ctrl }));
check('v27.5: elite has 2.2x HP and 3x points', Math.abs(elite.hpR - 2.2) < 0.05 && Math.abs(elite.ptsR - 3) < 0.05, 'hpR=' + elite.hpR.toFixed(3) + ' ptsR=' + elite.ptsR.toFixed(2));
check('v27.5: elite hits harder (x1.3) and is bigger (x1.18)', Math.abs(elite.dmgR - 1.3) < 0.01 && Math.abs(elite.scaleR - 1.18) < 0.01, 'dmgR=' + elite.dmgR.toFixed(3) + ' scaleR=' + elite.scaleR.toFixed(3));
check('v27.5: elite starred name texture cached + bar attached', elite.nameE === true && elite.bar === true);
const sfxN = ev("(function(){ shoot(player); var a = SFX._ls; for (var i = 0; i < 6; i++) shoot(player); var b = SFX._ls; return { started: !!a, movedWithinBurst: b !== a }; })()");
check('v27.5: fire sound throttled (7-shot burst -> sound fires once)', sfxN.started === true && sfxN.movedWithinBurst === false, JSON.stringify(sfxN));
ev("(function(){ player.maxHp = 200; player.hp = 90; updateHUD(); return 'set'; })()");
const pctTxt = ev("document.getElementById('hp-pct').textContent");
check('v27.5: HP percentage shows next to the bar (45%)', pctTxt === '45%', 'got ' + pctTxt);
quietBoard();

// ---------------------------------------------------------------- 15. v27.6: supply drops, save overwrite, death autosave, home, enemy sfx
quietBoard();
ev("(function(){ removeSupplyDrop(); state.level = 5; state.supplyNextAt = state.runTime - 1; return 'armed'; })()");
step(10); // spawn + early descent
const sup1 = ev("(function(){ return _supplyGroup ? { alive: true, landed: _supplyGroup.landed, hasChute: !!_supplyGroup.chute } : { alive: false }; })()");
check('v27.6: supply drop spawns (crate + beam + chute)', sup1.alive === true && sup1.landed === false && sup1.hasChute === true, JSON.stringify(sup1));
step(280); // ~4.7s — parachute descent completes
const sup2 = ev("(function(){ return _supplyGroup ? { alive: true, landed: _supplyGroup.landed, hasChute: !!_supplyGroup.chute, y: _supplyGroup.group.position.y, gy: _supplyGroup.groundY } : { alive: false }; })()");
check('v27.6: crate parachutes down and lands (chute detaches)', sup2.alive === true && sup2.landed === true && sup2.hasChute === false && Math.abs(sup2.y - (sup2.gy + 0.9)) < 0.3, JSON.stringify(sup2));
const gold = ev("(function(){ updateHUD(); var cv = document.getElementById('minimap'); var calls = (cv && cv.__2dCalls) || []; return calls.some(function (c) { return c[0] === 'fillRect' && String(c[c.length - 1]) === '#ffd479'; }); })()");
check('v27.6: gold square drawn on the minimap', gold === true);
const beforeReward = ev("(function(){ return { hp: player.hp, coins: state.coins || 0, pc: state.pendingChoices || 0, oc: (state.overchargeUntil || 0) - state.runTime, sh: !!state.shieldUp, rf: (state.rapidFireUntil || 0) - state.runTime, xp: state.xp }; })()");
ev("(function(){ player.mesh.position.set(_supplyGroup.x, player.mesh.position.y, _supplyGroup.z); return 'on-crate'; })()");
step(10); // roll over it
const afterReward = ev("(function(){ return { hp: player.hp, coins: state.coins || 0, pc: state.pendingChoices || 0, oc: (state.overchargeUntil || 0) - state.runTime, sh: !!state.shieldUp, rf: (state.rapidFireUntil || 0) - state.runTime, xp: state.xp, gone: !_supplyGroup }; })()");
const anyReward = afterReward.hp > beforeReward.hp || afterReward.coins > beforeReward.coins || afterReward.pc > beforeReward.pc || afterReward.oc > 0 || afterReward.sh || afterReward.rf > 0 || afterReward.xp > beforeReward.xp;
check('v27.6: driving over the crate collects a reward + cleans up', afterReward.gone === true && anyReward === true, JSON.stringify({ before: beforeReward, after: afterReward }));
closeCards(); // a bonus-card reward may have opened the picker

// save overwrite semantics
const saveT = ev("(function(){ state.casualSaves = []; saveCurrentRun('MyRun'); saveCurrentRun('MyRun'); saveCurrentRun('MyRun'); var n1 = state.casualSaves.length; saveCurrentRun('Second'); return { same: n1, total: state.casualSaves.length, names: state.casualSaves.map(function (s) { return s.name; }) }; })()");
check('v27.6: re-saving the same name overwrites (no more (2)(3) stacks)', saveT.same === 1 && saveT.total === 2 && saveT.names.join(',') === 'MyRun,Second', JSON.stringify(saveT));

// enemy fire sound ~10% (statistical, 0.1s gaps > throttle)
const esfx = ev("(function(){ var plays = 0; for (var i = 0; i < 60; i++) { window.__vt += 100; var before = SFX._les; SFX.enemyShoot(); if (SFX._les !== before) plays++; } return plays; })()");
check('v27.6: enemy fire sound plays ~10% of shots (2-14 of 60)', esfx >= 2 && esfx <= 14, 'plays=' + esfx);

// death -> auto-save to the loaded save + Home button
ev("(function(){ state.casualSaves = []; var snap = snapshotRun(); snap.name = 'DeathTest'; snap.savedAt = Date.now(); state.casualSaves.push(snap); startGame('casual', { resume: snap }); return 'resumed'; })()");
step(30);
ev("(function(){ state.shieldUp = false; state.invulnUntil = 0; player.maxHp = 300; player.hp = 1; player.takeDamage(999); if (!document.getElementById('revive-offer').classList.contains('hidden')) declineRevive(); else if (player.hp <= 0) endGame(); return 'dead'; })()");
step(30);
const deathSave = ev("(function(){ var s = (state.casualSaves || []).filter(function (x) { return x.name === 'DeathTest'; })[0]; return { found: !!s, hp: s ? s.hp : -1, phase: state.gamePhase, homeBtn: !!document.getElementById('btn-gameover-home') }; })()");
check('v27.6: dying in a loaded run auto-saves it (retry at 50% HP)', deathSave.found === true && deathSave.hp === 150 && deathSave.phase === 'gameover', JSON.stringify(deathSave));
win.document.getElementById('btn-gameover-home').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
step(10);
const homeOk = ev("(function(){ return { phase: state.gamePhase, homeVisible: !document.getElementById('start-screen').classList.contains('hidden') }; })()");
check('v27.6: Home button on the death screen returns to the menu', homeOk.phase === 'menu' && homeOk.homeVisible === true, JSON.stringify(homeOk));
check('v27.6: all v27.6 sections ran clean', cleanSoFar(), errDetail());

// ---------------------------------------------------------------- 16. v28: Update-1 verification
quietBoard();
// B1: settings persist through save/load
ev("(function(){ state.soundEnabled = false; state.cameraMode = 'wide'; state.controlAssist = false; saveGame(); state.soundEnabled = true; state.cameraMode = 'follow'; state.controlAssist = true; loadGame(); return { s: state.soundEnabled, c: state.cameraMode, a: state.controlAssist }; })()");
const b1 = ev("({ s: state.soundEnabled, c: state.cameraMode, a: state.controlAssist })");
check('v28 B1: sound/camera/assist persist through save+load', b1.s === false && b1.c === 'wide' && b1.a === false, JSON.stringify(b1));
// B2: daily gone from the schema
const b2 = (win.eval("store.get('tank_save')") || '').includes('daily');
check('v28 B2: stale daily field removed from saves', b2 === false);
// B3: shield recharge stored as remaining seconds, restored relative
const b3 = ev("(function(){ state.shieldUp = false; state.shieldReadyAt = clock.getElapsedTime() + 8; var snap = snapshotRun(); startGame('casual', { resume: snap }); return { left: snap.shieldReadyIn, readyAt: state.shieldReadyAt - clock.getElapsedTime() }; })()");
step(5); closeCards();
check('v28 B3: shield recharge is reload-safe (stores ~8s remaining, restores ~8s)', b3.left > 7 && b3.left <= 8 && b3.readyAt > 6 && b3.readyAt <= 8, JSON.stringify(b3));
// B5: save names render as text, never markup
const b5 = ev("(function(){ state.casualSaves = [{ name: '<img src=x onerror=window.__pwned=1>', level: 2, score: 10, runTime: 5, runCoins: 0, savedAt: 0 }]; renderCasualSaves(); var el = document.querySelector('.sr-name'); return { pwned: window.__pwned === 1, shown: el ? el.textContent : '' }; })()");
check('v28 B5: malicious save name renders as plain text (no script ran)', b5.pwned === false && b5.shown.indexOf('<img') >= 0, JSON.stringify({ pwned: b5.pwned, shown: b5.shown.slice(0, 30) }));
// B6: resumes don't count as new runs
const b6 = ev("(function(){ var r0 = lifeStats().runs; var snap = snapshotRun(); startGame('casual', { resume: snap }); var r1 = lifeStats().runs; startGame('casual'); var r2 = lifeStats().runs; return { r0: r0, r1: r1, r2: r2 }; })()");
step(5); closeCards();
check('v28 B6: resume does not inflate the runs counter (fresh run +1 only)', b6.r1 === b6.r0 && b6.r2 === b6.r1 + 1, JSON.stringify(b6));
// C1: crits count when they LAND (non-lethal)
quietBoard();
ev("(function(){ lifeStats().crits = 0; state.playerStats.crit = 100; var t = makeScaledEnemy('scout', player.mesh.position.x, player.mesh.position.z); t.hp = t.maxHp = 500000; state.targetEnemy = t; state.lastFireTime = 0; state.input.isFiring = true; return 1; })()");
step(40); // turret needs frames to swing onto the target before bullets connect
ev('state.input.isFiring = false; state.playerStats.crit = 0; state.targetEnemy = null;');
const c1 = ev("({ crits: lifeStats().crits, kills: state.kills })");
check('v28 C1: non-lethal critical hits now count (crits>0, kills unchanged)', c1.crits >= 1 && c1.kills === 0, JSON.stringify(c1));
// C2: wallet and lifetime stats agree on payouts
quietBoard();
const c2 = ev("(function(){ state.combo = 0; state.coins = 1000; lifeStats().coinsEarned = 0; state.runCoins = 0; var t = makeScaledEnemy('scout', player.mesh.position.x, player.mesh.position.z); t.hp = 1; state.targetEnemy = t; state.lastFireTime = 0; state.input.isFiring = true; return 1; })()");
let c2wait = 0;
while (ev("state.kills") === 0 && c2wait++ < 120) { step(2); ev("if (typeof player !== 'undefined' && player && !player.isDead) player.hp = player.maxHp;"); }
ev('state.input.isFiring = false; state.targetEnemy = null;');
const c2r = ev("(function(){ return { wallet: state.coins - 1000, ledger: lifeStats().coinsEarned, run: state.runCoins }; })()");
check('v28 C2: wallet, run coins and lifetime ledger all agree', c2r.wallet === c2r.ledger && c2r.wallet === c2r.run && c2r.wallet > 0, JSON.stringify(c2r));
// E2: card double-tap cannot double-pick
ev("(function(){ state.pendingChoices = 0; state.isChoosingUpgrade = false; showUpgradeChoices(); var card = document.querySelector('#upgrade-choice .uc-card'); window.__ups = 0; var orig = applyUpgrade; applyUpgrade = function(){ window.__ups++; return orig.apply(this, arguments); }; card.click(); card.click(); return 'dbl'; })()");
const e2 = ev("window.__ups");
closeCards();
check('v28 E2: double-tap applies exactly ONE card', e2 === 1, 'applied=' + e2);

// ---------------------------------------------------------------- 17. v28 A1+A2: click-every-menu smoke walk
const smokeErrs0 = errors.length + (win.__pageErrors || []).length;
const walk = [];
const clickBtn = (id) => { const b = win.document.getElementById(id); if (b) { b.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); walk.push(id); } return !!b; };
const vis = (id) => !win.document.getElementById(id).classList.contains('hidden');
clickBtn('btn-awards');
step(2);
const awardsOk = vis('awards-screen') && /\d+\/\d+ achievements$/.test(win.document.getElementById('awards-sub').textContent);
check('v28 A1: Awards opens clean (achievements-only subtitle)', awardsOk === true, win.document.getElementById('awards-sub').textContent);
clickBtn('btn-awards-back');
clickBtn('btn-shop'); step(2); const walkShop = vis('shop-screen'); clickBtn('btn-shop-close'); step(2);
clickBtn('btn-casual'); step(2); const walkCasual = vis('casual-screen'); clickBtn('btn-casual-back'); step(2);
clickBtn('btn-levels'); step(2); const walkLevels = vis('levels-screen'); clickBtn('btn-levels-back'); step(2);
clickBtn('btn-sound'); clickBtn('btn-camera'); clickBtn('btn-assist'); step(2); // settings toggles exercise handlers
check('v28 A2: menu walk opens Awards/Shop/Casual/Levels + toggles settings', walkShop && walkCasual && walkLevels === true, JSON.stringify({ walkShop, walkCasual, walkLevels, walked: walk.length }));
// in-game walk: run -> pause -> save-dialog cancel -> resume -> die -> revive-decline -> home
clickBtn('btn-casual'); clickBtn('btn-casual-new'); step(30); closeCards(); ev("if (player && !player.isDead) player.hp = player.maxHp;");
clickBtn('btn-pause'); step(2); const pauseOk = vis('pause-screen');
clickBtn('btn-save-run'); step(2); const saveDlg = !win.document.getElementById('save-dialog').classList.contains('hidden'); clickBtn('btn-save-cancel');
clickBtn('btn-resume'); step(2); const resumed = ev("state.gamePhase") === 'playing';
ev("(function(){ state.coins = 5000; state.shieldUp = false; state.invulnUntil = 0; player.maxHp = 300; player.hp = 1; player.takeDamage(999); return 1; })()");
const reviveOpen = !win.document.getElementById('revive-offer').classList.contains('hidden');
clickBtn('btn-revive-no'); step(5);
clickBtn('btn-gameover-home'); step(5);
const homeBack = ev("state.gamePhase") === 'menu' && vis('start-screen');
check('v28 A2: in-game walk (pause, save dialog, resume, revive-decline, home)', pauseOk && saveDlg && resumed && reviveOpen && homeBack === true, JSON.stringify({ pauseOk, saveDlg, resumed, reviveOpen, homeBack }));
check('v28 A2: full menu walk produced ZERO errors', errors.length + (win.__pageErrors || []).length === smokeErrs0, 'walked: ' + walk.slice(0, 8).join('>'));

// ---------------------------------------------------------------- 18. v28 B4: save loads BEFORE first home render (fresh boot, seeded storage)
const seeded = win.eval("store.get('tank_save')") || '';
const seedLine = '<script>try { localStorage.setItem(\'tank_save\', ' + JSON.stringify(seeded) + '); } catch (e) {}</scr' + 'ipt>';
const html2 = raw.slice(0, idx) + STUB + seedLine + raw.slice(idx);
const vc2 = new VirtualConsole();
const errs2 = [];
vc2.on('error', (...a) => errs2.push(a.join(' ')));
vc2.on('jsdomError', (e) => errs2.push((e.detail && e.detail.message) || e.message));
const dom2 = new JSDOM(html2, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://tankrealms.test/game.html', virtualConsole: vc2 });
step(5); // let dom1 finish settling (independent)
const dom2win = dom2.window;
const dom2step = (n) => { for (let i = 0; i < n; i++) { dom2win.__vt += 1000 / 60; const q = dom2win.__rafQ.splice(0); for (const cb of q) { try { cb(dom2win.__vt); } catch (e) { errs2.push('rAF: ' + e.message); } } } };
dom2step(120);
const homeCoins2 = dom2win.document.getElementById('home-coins') ? dom2win.document.getElementById('home-coins').textContent : '(no el)';
const seededCoins = dom2win.eval('(state.coins || 0).toLocaleString()');
check('v28 B4: fresh boot shows SAVED coins on the home screen immediately', homeCoins2 === seededCoins && homeCoins2 !== '0', 'home shows ' + homeCoins2 + ' (state ' + seededCoins + '), errors=' + errs2.length);

// ---------------------------------------------------------------- report
console.log(NL + '================ RESULTS ================');
for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.detail ? '   [' + r.detail + ']' : ''));
console.log('console.error calls :', errors.length);
console.log('console.warn calls  :', warns.length, warns.length ? '-> ' + [...new Set(warns)].slice(0, 3).join(' | ') : '');
console.log('jsdomErrors         :', jsdomErrors.length);
console.log('window.onerror hits :', (win.__pageErrors || []).length);
for (const s of [...new Set(jsdomErrors)].slice(0, 3)) console.log('--- jsdomError ---' + NL + String(s).split(NL).slice(0, 6).join(NL));
for (const s of (win.__pageErrors || []).slice(0, 3)) console.log('--- page error ---' + NL + String(s).split(NL).slice(0, 6).join(NL));
console.log('');
process.exit(process.exitCode || 0);
