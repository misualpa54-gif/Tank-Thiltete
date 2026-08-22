#!/usr/bin/env node
/** Fact-check probe: Awards screen click + save-name injection (analysis only). */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const harnessSrc = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
const top = harnessSrc.split('// ---------------------------------------------------------------- load + boot')[0].replace(/^#!.*\n/, '');
const STUB = new Function('require', '__dirname', top + '\nreturn { STUB: STUB };')(require, __dirname).STUB;
const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'tank_realms_latest.html'), 'utf8');
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
step(120);
const btn = win.document.getElementById('btn-awards');
console.log('Awards button exists:', !!btn);
btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
step(10);
console.log('Awards screen became visible:', !win.document.getElementById('awards-screen').classList.contains('hidden'));
const sub = win.document.getElementById('awards-sub');
console.log('Awards subtitle text:', JSON.stringify(sub ? sub.textContent : '(none)'));
console.log('Errors after clicking Awards:', errs.length, errs.slice(0, 2));
// save-name injection check
win.eval("(function(){ state.casualSaves = [{ name: '<img src=x onerror=window.__pwned=1>', level: 2, score: 10, runTime: 5, runCoins: 0, savedAt: 0 }]; renderCasualSaves(); return 1; })()");
console.log('save-name injection executed (window.__pwned)?', win.eval('window.__pwned === 1'));
process.exit(0);
