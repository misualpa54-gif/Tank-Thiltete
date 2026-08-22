#!/usr/bin/env node
/** Focused probes for the 3 stress anomalies — analysis only. */
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
const errs = [];
vc.on('error', (...a) => errs.push(a.join(' ')));
vc.on('jsdomError', (e) => errs.push('JSDOM: ' + ((e.detail && e.detail.message) || e.message)));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://t.test/g.html', virtualConsole: vc });
const win = dom.window;
win.eval('THREE.WebGLRenderer.prototype.render = function(){};');
function step(n) { for (let i = 0; i < n; i++) { win.__vt += 1000 / 60; const q = win.__rafQ.splice(0); for (const cb of q) { try { cb(win.__vt); } catch (e) { errs.push('rAF: ' + e.message); } } } }
const ev = (c) => win.eval(c);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const god = () => ev("(function(){ if (player && !player.isDead) { player.maxHp = 999999; player.hp = 999999; } state.coins = 0; state.shieldUp = false; state.invulnUntil = 0; return 1; })()");
const closeCards = () => ev("(function(){ state.pendingChoices = 0; state.isChoosingUpgrade = false; var o = document.getElementById('upgrade-choice'); if (o) o.remove(); return 1; })()");

(async () => {
  step(120);
  win.document.getElementById('btn-casual-new').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  step(60);

  // ---- P1: does a boss spawn while a CARD SCREEN is open? (expect NO — cards freeze physics)
  ev("(function(){ state.level = 20; return 1; })()");
  step(30); god();
  ev('state.bossPending = true; state.xpToNext = 10; state.xp = 9;'); // force a level-up card to open
  step(30);
  const cardOpen = ev("!!document.getElementById('upgrade-choice')");
  let t = 0;
  while (!ev('!!state.bossActive') && t++ < 300) { step(1); }
  const bossWhileCards = ev('!!state.bossActive');
  console.log('P1 card screen open:', cardOpen, '| boss spawned while cards open (expect false):', bossWhileCards, '| frames waited:', t);
  closeCards();
  t = 0;
  while (!ev('!!state.bossActive') && t++ < 300) { step(1); god(); }
  console.log('P1 boss spawns AFTER cards closed (expect true):', ev('!!state.bossActive'), '| frames:', t);
  ev("(function(){ state.bossActive.hp = 1; state.bossActive.takeDamage(999999); return 1; })()");
  step(60); god();

  // ---- P2: full card-queue drain with generous real-time waits — does the overlay fully clear?
  ev("(function(){ state.xpToNext = 100; state.xp = 0; addXP(100 * 12 + 50); return 1; })()"); // 12 level-ups
  step(5);
  let clicks = 0;
  for (let round = 0; round < 30; round++) {
    const card = win.document.querySelector('#upgrade-choice .uc-card');
    if (!card) break;
    card.click(); clicks++;
    await sleep(520); step(3); // full 400ms close + settle
  }
  await sleep(700); step(5);
  const p2 = ev("(function(){ return { choosing: state.isChoosingUpgrade, pending: state.pendingChoices || 0, overlay: !!document.getElementById('upgrade-choice'), level: state.level }; })()");
  console.log('P2 12-level flood: clicks=' + clicks + ' final=' + JSON.stringify(p2), '(expect choosing=false, overlay=false)');
  closeCards();

  // ---- P3: revive ladder, deterministic (no enemies interfering — board cleared)
  ev("(function(){ enemies.slice().forEach(function(e){ e.die(); }); state.coins = 100000; state.level = 20; return 1; })()");
  step(10); god(); closeCards();
  const costs = [];
  for (let d = 0; d < 3; d++) {
    ev("(function(){ state.shieldUp = false; state.invulnUntil = 0; player.maxHp = 300; player.hp = 1; player.takeDamage(999); return 1; })()");
    costs.push(ev("document.getElementById('revive-cost').textContent"));
    ev("document.getElementById('btn-revive-yes').click()");
    await sleep(30); step(15); closeCards();
    god();
    ev('enemies.slice().forEach(function(e){ e.die(); });'); // keep the board clear between revives
  }
  console.log('P3 revive ladder (deterministic):', costs.join(' -> '), '(expect 300 -> 1,200 -> 4,800)');
  ev("(function(){ state.coins = 0; state.shieldUp = false; state.invulnUntil = 0; player.hp = 1; player.takeDamage(999); return 1; })()");
  const offerAtZero = ev("!document.getElementById('revive-offer').classList.contains('hidden')");
  if (offerAtZero) ev("document.getElementById('btn-revive-no').click()"); else ev("if (player.hp <= 0) endGame()");
  step(30);
  console.log('P3 broke-death: offer shown at 0 coins (expect false):', offerAtZero, '| phase:', ev('state.gamePhase'));
  console.log('errors:', errs.length, errs.slice(0, 3));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.log('PROBE THREW:', e.stack); process.exit(3); });
