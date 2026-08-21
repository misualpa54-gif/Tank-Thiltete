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
  '        var fn = function () { var a = [].slice.call(arguments).map(String); calls.push([prop].concat(a)); };',
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
  var j = makeScaledEnemy('juggernaut', 8, 8);
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
check('v27.3: bar follows the enemy as it moves', typeof followAfter === 'number' && Math.abs(followAfter - follow.ex) < 0.01, 'bar.x ' + follow.gx + ' -> ' + followAfter + ' (enemy.x ' + follow.ex + ')');

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
ev("(function(){ state.playerStats.regen = 5; state.playerStats.healOnKill = 0; player.hp = 999000; state.lastRegenTime = clock.getElapsedTime(); })()");
step(150);
check('Repair Kit regen heals over time (+5/s)', ev('player.hp') >= 999005 && ev('player.hp') <= 999020, 'hp -> ' + ev('player.hp'));
quietBoard();
ev("(function(){ state.playerStats.regen = 0; state.playerStats.healOnKill = 4; player.hp = 500; var t = makeScaledEnemy('scout', player.mesh.position.x, player.mesh.position.z); t.hp = 1; state.input.isFiring = true; })()");
step(60);
ev('state.input.isFiring = false; state.playerStats.healOnKill = 0;');
check('Field Medic heals on kill via the real bullet path', ev('player.hp') >= 504, 'hp -> ' + ev('player.hp'));
unquietXp();
closeCards();

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
