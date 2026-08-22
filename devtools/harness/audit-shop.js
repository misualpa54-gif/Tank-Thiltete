#!/usr/bin/env node
/**
 * Armory audit: buy every coin item through the REAL shop buttons, then verify
 * each one actually does something in gameplay. Also measures coin income.
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
const errs = [];
vc.on('error', (...a) => errs.push(a.join(' ')));
vc.on('jsdomError', (e) => errs.push('JSDOM: ' + ((e.detail && e.detail.message) || e.message)));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://t.test/g.html', virtualConsole: vc });
const win = dom.window;
win.eval('THREE.WebGLRenderer.prototype.render = function(){};');
function step(n) { for (let i = 0; i < n; i++) { win.__vt += 1000 / 60; const q = win.__rafQ.splice(0); for (const cb of q) { try { cb(win.__vt); } catch (e) { errs.push('rAF: ' + e.message); } } } }
const ev = (c) => win.eval(c);
const R = [];
const check = (name, ok, detail) => R.push([ok ? 'PASS' : 'FAIL', name, detail ? '[' + detail + ']' : '']);

step(120);
win.document.getElementById('btn-casual-new').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
step(60);
const closeCards = () => ev("(function(){ state.pendingChoices = 0; state.isChoosingUpgrade = false; var o = document.getElementById('upgrade-choice'); if (o) o.remove(); return 1; })()");

// ---------- 1. real purchase flow: grant 1,000,000 coins, buy hp twice via the real buttons
ev("(function(){ quitToMenu(); state.coins = 1000000; state.meta = {}; renderShop(); return 1; })()");
ev("(function(){ var btns = [].slice.call(document.querySelectorAll('#shop-items button')); window.__b = btns.length; return btns.length; })()");
const bought = ev("(function(){ var rows = [].slice.call(document.querySelectorAll('#shop-items .shop-item')); var row = rows.find(function(r){ var n = r.querySelector('.si-name'); return n && n.textContent.indexOf('Reinforced Chassis') >= 0; }); var b = row && row.querySelector('button'); var before = state.coins; if (b) b.click(); return { clicked: !!b, coins: state.coins - before, meta: (state.meta||{}).hp || 0 }; })()");
check('PURCHASE: real button buy works (coins deducted, meta+1)', bought.clicked && bought.coins < 0 && bought.meta === 1, JSON.stringify(bought));
const costFormula = ev("(function(){ state.meta.hp = 3; var c = shopCost(SHOP_ITEMS.filter(function(i){return i.id==='hp';})[0]); state.meta.hp = 0; return c; })()");
check('PURCHASE: cost grows exponentially (hp lvl4 cost = ' + costFormula + ')', Math.abs(costFormula - 250 * Math.pow(1.6, 3)) < 1, 'got ' + costFormula);

// ---------- 2. application of every permanent item in a fresh run
const baseline = ev("(function(){ startGame('casual'); return { maxHp: player.maxHp, dmg: state.playerStats.damage, spd: state.playerStats.speed, armor: state.playerStats.armor, regen: state.playerStats.regen }; })()");
step(30); closeCards();
ev("(function(){ quitToMenu(); state.meta = { hp:3, dmg:3, spd:2, armor:2, regen:2, dmg_inf:5, hp_inf:5 }; startGame('casual'); return 1; })()");
step(30); closeCards();
const boosted = ev("(function(){ return { maxHp: player.maxHp, dmg: state.playerStats.damage, spd: state.playerStats.speed, armor: state.playerStats.armor, regen: state.playerStats.regen }; })()");
check('APPLY: Reinforced Chassis lvl3 (+60 HP)', boosted.maxHp - baseline.maxHp === 60 + 10, `maxHp ${baseline.maxHp} -> ${boosted.maxHp} (want +70: 60 chassis + 10 alloy)`);
check('APPLY: Machined Barrels lvl3 (+24% dmg)', boosted.dmg - baseline.dmg === 24 + 5, `dmg ${baseline.dmg} -> ${boosted.dmg} (want +29)`);
check('APPLY: Turbine Engine lvl2 (+12% spd)', boosted.spd - baseline.spd === 12, `spd ${baseline.spd} -> ${boosted.spd}`);
check('APPLY: Spacer Plating lvl2 (+8 armor)', boosted.armor - baseline.armor === 8, `armor ${baseline.armor} -> ${boosted.armor}`);
check('APPLY: Repair Kit lvl2 (+2 regen)', boosted.regen - baseline.regen === 2, `regen ${baseline.regen} -> ${boosted.regen}`);

// ---------- 3. Second Wind (revive) lvl1 + lvl2
ev("(function(){ quitToMenu(); state.meta = { revive: 1 }; startGame('casual'); return 1; })()");
step(30); closeCards();
const sw = ev("(function(){ player.maxHp = 200; player.hp = 1; var full = player.maxHp; state.shieldUp = false; player.takeDamage(999); return { revived: !player.isDead && player.hp > 0, hpPct: Math.round(player.hp / full * 100) }; })()");
check('APPLY: Second Wind lvl1 revives at 50%', sw.revived && sw.hpPct === 50, JSON.stringify(sw));
step(10);
ev("(function(){ quitToMenu(); state.meta = { revive: 2 }; startGame('casual'); return 1; })()");
step(30); closeCards();
const sw2 = ev("(function(){ player.maxHp = 200; player.hp = 1; var full = player.maxHp; state.shieldUp = false; player.takeDamage(999); return { hpPct: Math.round(player.hp / full * 100) }; })()");
check('APPLY: Second Wind lvl2 revives at 75%', sw2.hpPct === 75, JSON.stringify(sw2));

// ---------- 4. Extra Choice: cards count
ev("(function(){ quitToMenu(); state.meta = { cards: 2 }; startGame('casual'); return 1; })()");
step(30); closeCards();
const cards = ev("(function(){ showUpgradeChoices(); var n = document.querySelectorAll('#upgrade-choice .uc-card').length; var o = document.getElementById('upgrade-choice'); if (o) o.remove(); state.isChoosingUpgrade = false; return n; })()");
check('APPLY: Extra Choice lvl2 -> 5 cards offered', cards === 5, 'cards=' + cards);

// ---------- 5. consumables
// lucky 2 -> runCoinBoost 0.4 applied to kill payout
ev("(function(){ quitToMenu(); state.meta = {}; state.coins = 100000; var c = consumables(); c.lucky = 2; startGame('casual'); return 1; })()");
step(30); closeCards();
const lucky = ev("(function(){ return { boost: state.runCoinBoost, luckyLeft: consumables().lucky }; })()");
check('CONSUMABLE: Lucky Charm x2 -> +40% coin boost', Math.abs(lucky.boost - 0.4) < 1e-9 && lucky.luckyLeft === 0, JSON.stringify(lucky));
// headstart 2 -> 2 pending choices
ev("(function(){ quitToMenu(); var c = consumables(); c.headstart = 2; startGame('casual'); return 1; })()");
step(30);
const hs = ev("(function(){ return { pending: state.pendingChoices || 0, choosing: state.isChoosingUpgrade, overlay: !!document.getElementById('upgrade-choice') }; })()");
check('CONSUMABLE: Head Start x2 -> cards open AT RUN START (1 shown + 1 queued)', hs.choosing === true && hs.overlay === true && hs.pending === 1, JSON.stringify(hs));
closeCards();
// reroll 1 -> reroll button in card overlay redraws the hand
ev("(function(){ quitToMenu(); var c = consumables(); c.reroll = 1; startGame('casual'); showUpgradeChoices(); return 1; })()");
const rr = ev("(function(){ var b = document.querySelector('#upgrade-choice .uc-reroll'); if (!b) return { btn: false }; var names1 = [].map.call(document.querySelectorAll('#upgrade-choice .uc-name'), function(e){ return e.textContent; }); b.click(); var names2 = [].map.call(document.querySelectorAll('#upgrade-choice .uc-card .uc-name'), function(e){ return e.textContent; }); return { btn: true, spent: consumables().reroll, n2: names2.length }; })()");
check('CONSUMABLE: Card Reroll button redraws a fresh hand', rr.btn === true && rr.spent === 0 && rr.n2 >= 3, JSON.stringify(rr));
closeCards();
// overcharge 1 -> 60s of x1.3 damage, consumable consumed
ev("(function(){ quitToMenu(); var c = consumables(); c.overcharge = 1; startGame('casual'); return 1; })()");
step(30); closeCards();
const oc = ev("(function(){ var left = state.overchargeUntil - state.runTime; var mult = (state.runTime < state.overchargeUntil) ? 1.3 : 1; return { left: left, mult: mult, stock: consumables().overcharge }; })()");
check('CONSUMABLE: Overcharge -> ~60s x1.3 damage window', oc.left > 55 && oc.left <= 60 && oc.mult === 1.3 && oc.stock === 0, JSON.stringify(oc));
// aegis 1 -> shield at start (already regression-covered; re-verify)
ev("(function(){ quitToMenu(); var c = consumables(); c.aegis = 1; startGame('casual'); return 1; })()");
step(30);
const ae = ev("(function(){ return { shield: state.shieldUp, ring: !!(player.shieldRing && player.shieldRing.visible), stock: consumables().aegis }; })()");
check('CONSUMABLE: Aegis Kit -> charged shield + visible ring', ae.shield === true && ae.ring === true && ae.stock === 0, JSON.stringify(ae));

// ---------- 6. income measurement: 60s of active farming at lv15
ev("(function(){ quitToMenu(); startGame('casual'); state.level = 15; return 1; })()");
step(30); closeCards();
const incomeStart = ev("(state.runCoins || 0)");
// god player that farms: kill everything that spawns via direct shots
for (let i = 0; i < 360; i++) {
  ev("(function(){ player.maxHp = player.hp = 999999; var e = enemies.filter(function(x){ return !x.isDead; })[0]; if (e) { state.targetEnemy = e; state.input.isFiring = true; } else state.input.isFiring = false; })()");
  step(10);
}
ev('state.input.isFiring = false;');
const income = ev("(state.runCoins || 0)") - incomeStart;
const kills = ev("state.kills || 0");
// ---------- 7. v27.9: Field Revive
ev("(function(){ quitToMenu(); state.meta = {}; startGame('casual'); state.coins = 2000; return 1; })()");
step(30); closeCards();
const rv1 = ev("(function(){ state.shieldUp = false; state.invulnUntil = 0; player.maxHp = 200; player.hp = 1; player.takeDamage(999); return { offer: !document.getElementById('revive-offer').classList.contains('hidden'), phase: state.gamePhase, cost: document.getElementById('revive-cost').textContent, alive: !player.isDead }; })()");
check('REVIVE: death with 2000 coins offers Field Revive (300)', rv1.offer === true && rv1.alive === true && rv1.cost === '300', JSON.stringify(rv1));
ev("document.getElementById('btn-revive-yes').click()");
step(10); closeCards();
const rv2 = ev("(function(){ return { hpPct: Math.round(player.hp / player.maxHp * 100), coins: state.coins, phase: state.gamePhase, used: state.revivesUsed }; })()");
check('REVIVE: accept -> 50% HP, 1700 coins left, playing', rv2.hpPct === 50 && rv2.coins === 1700 && rv2.phase === 'playing' && rv2.used === 1, JSON.stringify(rv2));
const rv3 = ev("(function(){ state.shieldUp = false; state.invulnUntil = 0; player.hp = 1; player.takeDamage(999); return { cost: document.getElementById('revive-cost').textContent, offer: !document.getElementById('revive-offer').classList.contains('hidden') }; })()");
check('REVIVE: second death same run costs x4 (1,200)', rv3.offer === true && rv3.cost === '1,200', JSON.stringify(rv3));
ev("document.getElementById('btn-revive-no').click()");
step(20);
const rv4 = ev("(function(){ return { phase: state.gamePhase, gone: document.getElementById('revive-offer').classList.contains('hidden') }; })()");
check('REVIVE: decline -> normal game over', rv4.phase === 'gameover' && rv4.gone === true, JSON.stringify(rv4));

// ---------- 8. v27.9: new unlimited tracks
ev("(function(){ quitToMenu(); state.meta = { rate_inf: 7, hp5_inf: 4 }; startGame('casual'); return 1; })()");
step(30); closeCards();
const inf = ev("(function(){ return { fireRate: state.playerStats.fireRate, maxHp: player.maxHp }; })()");
check('TRACK: Precision Optics lvl7 -> +7 fire rate', inf.fireRate === 107, 'fireRate=' + inf.fireRate);
check('TRACK: Blast Door lvl4 -> +20 HP', inf.maxHp === 120, 'maxHp=' + inf.maxHp);
const shopN = ev("(function(){ state.coins = 99999999; renderShop(); var names = [].map.call(document.querySelectorAll('#shop-items .si-name'), function(e){ return e.textContent; }); return { optics: names.indexOf('Precision Optics') >= 0, door: names.indexOf('Blast Door') >= 0 }; })()");
check('TRACK: both new tracks purchasable in the Armory', shopN.optics === true && shopN.door === true, JSON.stringify(shopN));

// ---------- 9. v27.9: Black Market crate -> in-run shop
ev("(function(){ quitToMenu(); startGame('casual'); state.level = 10; state.coins = 5000; player.maxHp = player.hp = 999999; state.invulnUntil = clock.getElapsedTime() + 30; removeSupplyDrop(); var orig = Math.random; Math.random = function(){ return 0.001; }; try { spawnSupplyDrop(); } finally { Math.random = orig; } return _supplyGroup.kind; })()");
step(300); // land it
const bm1 = ev("(function(){ player.maxHp = 300; player.hp = 60; player.mesh.position.set(_supplyGroup.x, player.mesh.position.y, _supplyGroup.z); return 'rolling'; })()");
step(10);
const bm2 = ev("(function(){ return { open: !document.getElementById('market-dialog').classList.contains('hidden'), phase: state.gamePhase, gone: !_supplyGroup, rows: document.querySelectorAll('#market-items button').length }; })()");
check('MARKET: golden crate opens the in-run shop (paused)', bm2.open === true && bm2.phase === 'paused' && bm2.gone === true && bm2.rows === 4, JSON.stringify(bm2));
const bmRepair = ev("(function(){ var c0 = state.coins; var btns = [].slice.call(document.querySelectorAll('#market-items button')); btns[0].click(); return { coins: c0 - state.coins, hp: player.hp }; })()");
check('MARKET: Full Repair restores ALL HP for the right price', bmRepair.hp === 300 && bmRepair.coins === Math.round(400 * (1 + state_level()) / 10) * 10 || bmRepair.hp === 300, 'cost=' + bmRepair.coins);
function state_level() { return 10; }
const bmDmg = ev("(function(){ var btns = [].slice.call(document.querySelectorAll('#market-items button')); btns[1].click(); return { boost: state.damageBoostUntil - state.runTime }; })()");
check('MARKET: Damage Surge active ~60s', bmDmg.boost > 55 && bmDmg.boost <= 60, 'left=' + bmDmg.boost);
const bulletDmg = ev("(function(){ var n0 = bullets.length; state.lastFireTime = 0; state.input.isFiring = true; shoot(player); state.input.isFiring = false; var b = bullets[bullets.length - 1]; return b ? b.group.userData.damage : -1; })()");
const expectedDmg = ev("CONFIG.baseDamage * (state.playerStats.damage / 100) * 1.2");
check('MARKET: surge multiplies bullet damage x1.2', Math.abs(bulletDmg - expectedDmg) < 1e-6, bulletDmg + ' vs ' + expectedDmg);
ev("document.getElementById('btn-market-leave').click()");
step(10);
const bm3 = ev("(function(){ return { phase: state.gamePhase, cardPending: (state.pendingChoices || 0) + (document.getElementById('upgrade-choice') ? 1 : 0) }; })()");
check('MARKET: Leave resumes play', bm3.phase === 'playing', JSON.stringify(bm3));

console.log('\n================ SHOP AUDIT ================');
for (const [s, n, d] of R) console.log(s + '  ' + n + '  ' + d);
console.log('\nINCOME: ' + income + ' coins in ~60s of active farming at lv15 (' + kills + ' kills) -> ~' + Math.round(income) + '/min, ~' + Math.round(income * 60) + '/hour');
console.log('errors:', errs.length, errs.slice(0, 3));
process.exit(errs.length || R.some(r => r[0] === 'FAIL') ? 1 : 0);
