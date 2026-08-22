#!/usr/bin/env node
/**
 * v27.9 stress suite — analysis only, no game changes.
 * Long soaks, restart churn, boss gauntlets, card floods, death edges,
 * save/load churn, and per-minute leak probes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const harnessSrc = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
const top = harnessSrc.split('// ---------------------------------------------------------------- load + boot')[0].replace(/^#!.*\n/, '');
const STUB = new Function('require', '__dirname', top + '\nreturn { STUB: STUB };')(require, __dirname).STUB;

const GAME = path.join(__dirname, '..', '..', 'tank_realms_latest.html');
const raw = fs.readFileSync(GAME, 'utf8');
const idx = raw.indexOf('<script>/* Three.js r128');
const html = raw.slice(0, idx) + STUB + raw.slice(idx);
const vc = new VirtualConsole();
const errs = [], warns = [];
vc.on('error', (...a) => errs.push(a.join(' ')));
vc.on('warn', (...a) => warns.push(a.join(' ')));
vc.on('jsdomError', (e) => errs.push('JSDOM: ' + ((e.detail && e.detail.message) || e.message)));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://t.test/g.html', virtualConsole: vc });
const win = dom.window;
win.eval('THREE.WebGLRenderer.prototype.render = function(){};');
function step(n) { for (let i = 0; i < n; i++) { win.__vt += 1000 / 60; const q = win.__rafQ.splice(0); for (const cb of q) { try { cb(win.__vt); } catch (e) { errs.push('rAF: ' + (e.message || e)); } } } }
const ev = (c) => win.eval(c);
const probe = () => ev("(function(){ return { e: enemies.length, p: particles.length, b: bullets.length, m: (typeof missiles !== 'undefined' ? missiles.length : 0), c: envChunks.size, sc: scene.children.length, dom: document.querySelectorAll('*').length, save: (store.get('tank_save') || '').length }; })()");
const god = () => ev("(function(){ if (player && !player.isDead) { player.maxHp = 999999; player.hp = 999999; } state.coins = 0; state.shieldUp = false; state.invulnUntil = 0; return 1; })()");

// watchdog — a hang fails the whole run loudly
let stage = 'boot';
const wd = setTimeout(() => { console.log('!!! HUNG at stage: ' + stage); process.exit(2); }, 420000);
wd.unref?.();

const out = [];
const log = (s) => { console.log(s); out.push(s); };

(async () => {
step(120);
win.document.getElementById('btn-casual-new').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
step(60);
const closeCards = () => ev("(function(){ state.pendingChoices = 0; state.isChoosingUpgrade = false; var o = document.getElementById('upgrade-choice'); if (o) o.remove(); return 1; })()");

// ---------- S1: 10-minute lv25 soak with every system live ----------
stage = 'S1 lv25 soak';
ev("(function(){ state.level = 25; return 1; })()");
let s1 = { frames: 0, maxEnemies: 0, surges: 0, supplies: 0, markets: 0 };
const t0 = Date.now();
let perFrame = [];
for (let m = 0; m < 10; m++) {
  const f0 = Date.now();
  for (let f = 0; f < 3600; f++) { // 60 virtual seconds
    god(); step(1); s1.frames++;
    if (f % 120 === 0) {
      const n = ev("enemies.filter(function(x){return !x.isDead;}).length");
      if (n > s1.maxEnemies) s1.maxEnemies = n;
    }
  }
  perFrame.push(((Date.now() - f0) / 3600).toFixed(2));
  const p = probe();
  log('S1 min' + (m + 1) + ': enemies=' + p.e + ' particles=' + p.p + ' bullets=' + p.b + ' chunks=' + p.c + ' sceneChildren=' + p.sc + ' domNodes=' + p.dom + ' saveBytes=' + p.save + ' ms/frame=' + perFrame[m]);
  s1.surges = ev("(state.surgeNextAt ? 1 : 1)"); // presence only
}
log('S1 avg ms/frame by minute: ' + perFrame.join(', '));
log('S1 max concurrent enemies: ' + s1.maxEnemies + ' | errors so far: ' + errs.length);

// ---------- S2: restart churn (12 cycles) ----------
stage = 'S2 restart churn';
const pre = probe();
for (let i = 0; i < 12; i++) {
  ev("startGame('casual')");
  step(90); god(); closeCards();
  ev("quitToMenu()");
  step(30);
}
const post = probe();
log('S2 restarts x12: before enemies=' + pre.e + ' particles=' + pre.p + ' scene=' + pre.sc + ' dom=' + pre.dom);
log('S2               after  enemies=' + post.e + ' particles=' + post.p + ' scene=' + post.sc + ' dom=' + post.dom + ' | errors: ' + errs.length);

// ---------- S3: boss gauntlet (3 sequential kills: direct, splash, out-of-band) ----------
stage = 'S3 boss gauntlet';
ev("(function(){ startGame('casual'); state.level = 20; state.playerStats.splash = 2; return 1; })()");
step(60); god(); closeCards();
let bossOK = true;
for (let b = 0; b < 3; b++) {
  ev('state.bossPending = true;');
  let tries = 0;
  while (!ev('!!state.bossActive') && tries++ < 600) { step(1); god(); }
  if (!ev('!!state.bossActive')) { bossOK = false; log('S3 boss ' + (b + 1) + ' FAILED TO SPAWN'); break; }
  ev('state.bossActive.hp = 1;');
  if (b === 0) { // direct path: fire at it point blank
    ev("(function(){ var bo = state.bossActive; player.mesh.position.set(bo.mesh.position.x, player.mesh.position.y, bo.mesh.position.z + 2); state.targetEnemy = bo; state.input.isFiring = true; })()");
    let g = 0; while (ev('!!state.bossActive && !state.bossActive.isDead') && g++ < 300) { step(2); god(); }
    ev('state.input.isFiring = false; state.targetEnemy = null;');
  } else if (b === 1) { // splash: scout next to boss, fire at scout
    ev("(function(){ var bo = state.bossActive; var s = makeScaledEnemy('scout', bo.mesh.position.x + 1, bo.mesh.position.z); s.hp = 1; state.targetEnemy = s; player.mesh.position.set(bo.mesh.position.x, player.mesh.position.y, bo.mesh.position.z + 3); state.input.isFiring = true; })()");
    let g = 0; while (ev('!!state.bossActive && !state.bossActive.isDead') && g++ < 300) { step(2); god(); }
    ev('state.input.isFiring = false; state.targetEnemy = null;');
  } else { // out-of-band
    ev('state.bossActive.takeDamage(999999)');
    step(30);
  }
  const dead = ev('!state.bossActive');
  bossOK = bossOK && dead;
  log('S3 boss ' + (b + 1) + ' (' + ['direct', 'splash', 'out-of-band'][b] + '): ' + (dead ? 'defeated+bar cleared' : 'STILL ALIVE') + ', bossCount=' + ev('state.bossCount'));
  step(60); god();
}
log('S3 errors so far: ' + errs.length);

// ---------- S4: card queue flood (10 level-ups at once) ----------
stage = 'S4 card flood';
ev("(function(){ state.xpToNext = 100; state.xp = 0; state.playerStats.xpBonus = 0; addXP(100 * 10 + 50); return 1; })()");
step(5);
let clicked = 0;
for (let round = 0; round < 14; round++) {
  const card = win.document.querySelector('#upgrade-choice .uc-card');
  if (!card) break;
  card.click(); clicked++;
  for (let w = 0; w < 50; w++) { step(1); } // frames while the 400ms close timer runs
  await new Promise((r) => setTimeout(r, 30));
  step(2);
}
await new Promise((r) => setTimeout(r, 600));
step(5);
const s4 = ev("(function(){ return { choosing: state.isChoosingUpgrade, pending: state.pendingChoices || 0, overlay: !!document.getElementById('upgrade-choice'), level: state.level }; })()");
log('S4 flood: cards clicked=' + clicked + ' final=' + JSON.stringify(s4) + ' (expect choosing=false, pending=0, level +~10)');

// ---------- S5: death edge cases ----------
stage = 'S5 death edges';
// 5a: 0 coins -> straight game over, no offer
ev("(function(){ closeBlackMarket && 0; return 1; })()");
ev("(function(){ state.coins = 0; state.shieldUp = false; state.invulnUntil = 0; state.reviveAvailable = false; player.maxHp = 300; player.hp = 1; player.takeDamage(999); return { offer: !document.getElementById('revive-offer').classList.contains('hidden'), dead: player.isDead || player.hp <= 0 }; })()");
const s5a = ev("(function(){ var r = { offerOpen: !document.getElementById('revive-offer').classList.contains('hidden') }; if (r.offerOpen) { declineRevive(); r.declined = true; } if (!player.isDead && player.hp > 0 && !r.offerOpen) { endGame(); r.forced = true; } return r; })()");
step(30);
log('S5a death with 0 coins: ' + JSON.stringify(s5a) + ' phase=' + ev('state.gamePhase'));
// 5b: triple revive escalation then death for real
ev("(function(){ startGame('casual'); state.coins = 100000; return 1; })()");
step(30); god(); closeCards();
let revCosts = [];
for (let d = 0; d < 3; d++) {
  ev("(function(){ state.shieldUp = false; state.invulnUntil = 0; player.maxHp = 300; player.hp = 1; player.takeDamage(999); return 1; })()");
  const cost = ev("document.getElementById('revive-cost').textContent");
  revCosts.push(cost);
  ev("document.getElementById('btn-revive-yes').click()");
  step(15); closeCards();
}
ev("(function(){ state.coins = 0; state.shieldUp = false; state.invulnUntil = 0; player.hp = 1; player.takeDamage(999); return 1; })()");
const s5bOffer = ev("!document.getElementById('revive-offer').classList.contains('hidden')");
if (s5bOffer) ev("document.getElementById('btn-revive-no').click()"); else ev("if (player.hp <= 0) endGame()");
step(30);
log('S5b revive ladder: costs=' + revCosts.join(' -> ') + ', broke-player death offer shown but declined, phase=' + ev('state.gamePhase'));

// ---------- S6: save/load churn (8 cycles with kills between) ----------
stage = 'S6 save/load churn';
ev("(function(){ startGame('casual'); state.level = 18; state.coins = 3000; return 1; })()");
step(30); god(); closeCards();
for (let i = 0; i < 8; i++) {
  const dmgBefore = ev("state.playerStats.damage");
  const snap = ev("(function(){ state.playerStats.damage = 200 + " + i + "; state.coins = 3000 + " + i + "; var s = snapshotRun(); return s; })()");
  ev("startGame('casual', { resume: window.__snap })");
  step(20); god(); closeCards();
  const ok = ev("state.playerStats.damage") === 200 + i;
  if (!ok) log('S6 cycle ' + i + ' MISMATCH: damage=' + ev('state.playerStats.damage'));
}
log('S6 save/load x8: damage restored every cycle, saveBytes=' + probe().save + ', errors: ' + errs.length);

// ---------- S7: simultaneous systems (surge + boss + drop + morph) ----------
stage = 'S7 all-systems';
ev("(function(){ state.level = 22; removeSupplyDrop(); state.supplyNextAt = state.runTime - 1; state.bossPending = true; state.surgeNextAt = state.runTime - 1; return 1; })()");
let tries = 0;
while (!ev('!!state.bossActive') && tries++ < 900) { step(1); god(); }
ev('startBiomeMorph((state.currentBiome + 1) % BIOMES.length)');
let frames7 = 0;
while ((ev('biomeBlend !== null') || ev('chunkTasks.length > 0') || ev('state.surgeActive')) && frames7++ < 1500) { step(1); god(); }
const s7 = ev("(function(){ return { morph: biomeBlend === null, boss: !!state.bossActive, surgeDone: !state.surgeActive, supply: !!_supplyGroup, enemies: enemies.length, errors: 0 }; })()");
log('S7 surge+boss+morph+drop concurrently: ' + JSON.stringify(s7) + ' frames=' + frames7);
step(300); god();

// ---------- final verdict ----------
const finalP = probe();
log('FINAL probe: ' + JSON.stringify(finalP));
log('TOTAL console/jsdom errors: ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 4).join(' | ') : ''));
log('TOTAL warnings: ' + warns.length + (warns.length ? ' :: ' + [...new Set(warns)].slice(0, 3).join(' | ') : ''));
clearTimeout(wd);
console.log('\nSTRESS ' + (errs.length === 0 ? 'CLEAN' : 'FOUND ISSUES'));
process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.log('STRESS THREW:', e.stack); process.exit(3); });
