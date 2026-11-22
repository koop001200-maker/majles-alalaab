#!/usr/bin/env node
/*
 * الجربوع 🐭 — chaos tester for «مجلس الألعاب».
 * Hops over every page with normal, weird and "impossible" behaviour and reports what breaks.
 *
 *   node jerboa/jerboa.js              # all pages, all screens, 120 random hops each
 *   node jerboa/jerboa.js --quick      # fewer hops (CI-friendly)
 *   node jerboa/jerboa.js --seed 7     # reproduce a run
 *   node jerboa/jerboa.js --page huruf # one page only
 *
 * Needs `playwright` (resolved from the global install if not local). Exit code = number of problems found.
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const QUICK = !!arg('quick', false), SEED = +arg('seed', Date.now() % 100000), ONLY = arg('page', null);
const HOPS = QUICK ? 40 : 120;
const ROOT = path.resolve(__dirname, '..');
const PAGES = [['index', 'index.html'], ['min-akoon', 'min-akoon.html'], ['khammen', 'khammen.html'], ['rattebha', 'rattebha.html'], ['huruf', 'huruf.html'], ['wsh', 'wsh.html'], ['bara', 'bara.html']]
  .filter(([n]) => !ONLY || n.includes(ONLY));
const SCREENS = QUICK ? [[1920, 1080], [390, 844]] : [[1920, 1080], [1366, 768], [1024, 768], [844, 390], [390, 844], [360, 640]];

let s = SEED; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; const pick = a => a[Math.floor(rnd() * a.length)];
const NASTY = ['', ' ', '   ', 'a'.repeat(400), '😀🐪☕', '<script>window.__pwn=1</script>', '"><img src=x onerror=window.__pwn=1>', "'; DROP TABLE users;--", 'مرحبا'.repeat(60), '‮evil‬', 'null', '0', '-1', '١٢٣٤٥', '\n\n\n', '%00', '{{7*7}}', '𒀀𒀁𒀂', 'ـــــــــــ'];
const problems = []; const note = (page, scr, kind, msg) => { const k = `${page}|${kind}|${msg}`.slice(0, 220); if (!problems.some(p => p.k === k)) problems.push({ k, page, scr, kind, msg }); };

async function hop(p, page, scr, i, rec) {
  const act = pick(['click', 'click', 'click', 'click', 'type', 'dbl', 'key', 'spam', 'hover', 'resize', 'reload', 'back', 'corrupt', 'scroll', 'longpress']);
  let els = [];
  try { els = await p.$$('button:not([disabled]), a[href], [data-act], [data-ui], [data-a], .tile, input, select, summary, [role=button]'); } catch (e) { return; }
  const vis = []; for (const e of els) { if (await e.isVisible().catch(() => false)) vis.push(e); }
  rec.push(act);
  try {
    if (act === 'click' && vis.length) { const e = pick(vis); const href = await e.getAttribute('href'); if (href && /^(https?:|mailto:)/.test(href)) return; await e.click({ timeout: 800, noWaitAfter: true }).catch(() => {}); }
    else if (act === 'dbl' && vis.length) await pick(vis).dblclick({ timeout: 800, noWaitAfter: true }).catch(() => {});
    else if (act === 'spam' && vis.length) { const e = pick(vis); for (let k = 0; k < 12; k++) await e.click({ timeout: 300, noWaitAfter: true, force: true }).catch(() => {}); }
    else if (act === 'longpress' && vis.length) { const b = await pick(vis).boundingBox().catch(() => null); if (b) { await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); } }
    else if (act === 'type') { const ins = (await p.$$('input[type=text],input:not([type]),input[type=search],input[type=number],textarea')); const v = []; for (const e of ins) if (await e.isVisible().catch(() => false)) v.push(e); if (v.length) { const e = pick(v); await e.fill(pick(NASTY)).catch(() => {}); await e.press('Enter').catch(() => {}); } }
    else if (act === 'key') await p.keyboard.press(pick(['Escape', 'Enter', 'Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete', 'F5', 'Control+a']));
    else if (act === 'hover' && vis.length) await pick(vis).hover({ timeout: 500 }).catch(() => {});
    else if (act === 'resize') await p.setViewportSize({ width: pick([360, 390, 844, 1024, 1366, 1920]), height: pick([390, 640, 768, 844, 1080]) });
    else if (act === 'reload') await p.reload({ waitUntil: 'domcontentloaded' });
    else if (act === 'back') { await p.goBack({ timeout: 800 }).catch(() => {}); }
    else if (act === 'corrupt') await p.evaluate(() => { const ks = Object.keys(localStorage); if (ks.length) localStorage.setItem(ks[Math.floor(Math.random() * ks.length)], ['{', 'null', '[]', '"x"', '{"a":', '123'][Math.floor(Math.random() * 6)]); });
    else if (act === 'scroll') await p.mouse.wheel(0, pick([-800, 800, 3000]));
  } catch (e) { /* hopping into a navigation is fine */ }
}

async function invariants(p, page, scr) {
  const r = await p.evaluate(() => {
    const out = []; const de = document.documentElement;
    const dark = c => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return false; const [r, g, b, a = 1] = m.map(Number); return a > 0.5 && (r + g + b) / 3 < 45; };
    // 1. page itself never scrolls (TV-first, no scrolling) — except the documented tiny-landscape leftover
    if (de.scrollHeight > innerHeight + 2 && innerHeight > 420) out.push(`vertical scroll ${de.scrollHeight}>${innerHeight}`);
    if (de.scrollWidth > innerWidth + 2) { const off = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(e => e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 20)); out.push(`horizontal scroll ${de.scrollWidth}>${innerWidth} by ${off.join(' ')}`); }
    // 2. unfilled template tokens, "undefined", "NaN", "[object Object]" on screen
    const t = document.body.innerText || ''; const bad = t.match(/undefined|NaN|\[object Object\]/); if (bad) out.push('bad text on screen: ' + bad[0]);
    // 3. visible buttons that are black (touch/hover bug)
    document.querySelectorAll('button, .btn, a.game, .tile').forEach(b => { const r = b.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = getComputedStyle(b); if (dark(cs.backgroundColor) && !/^(#?fs)$/.test(b.id) && !b.classList.contains('lock') && !b.closest('.mp-back, .splash')) out.push('black button: ' + (b.textContent || b.className).trim().slice(0, 24)); });
    // 4. tiny tap targets (<28px) among visible buttons
    const tinyList = []; document.querySelectorAll('button:not([disabled])').forEach(b => { const r = b.getBoundingClientRect(); if (r.width && r.height && (r.height < 22 || r.width < 22) && getComputedStyle(b).visibility !== 'hidden') tinyList.push((b.textContent || b.className || b.id).trim().slice(0, 14) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }); if (tinyList.length) out.push('tiny buttons (<22px): ' + tinyList.slice(0, 4).join(' | '));
    // 4b. text too small to read, text clipped by its box, buttons overlapping each other
    let small = 0, smallList = [], clipped = [];
    document.querySelectorAll('button, .btn, h1, h2, h3, p, label, span, b, small').forEach(e => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height || !(e.textContent || '').trim() || e.children.length > 3) return;
      const fs = parseFloat(getComputedStyle(e).fontSize) * (parseFloat(getComputedStyle(document.documentElement).zoom) || 1) * (parseFloat(getComputedStyle(document.body).zoom) || 1);
      if (fs < 10 && getComputedStyle(e).visibility !== 'hidden') { small++; smallList.push((e.textContent || '').trim().slice(0, 14) + ' ' + fs.toFixed(1) + 'px'); }
      const cs = getComputedStyle(e); if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 3 && e.clientWidth > 0 && /button|btn|chip|tab/.test(e.tagName + e.className)) clipped.push((e.textContent || '').trim().slice(0, 16));
    });
    if (small > 3) out.push(small + ' text elements under 10px: ' + smallList.slice(0, 3).join(' | '));
    if (clipped.length) out.push('clipped text: ' + clipped.slice(0, 3).join(' | '));
    const bs = [...document.querySelectorAll('button:not([disabled]), a.btn')].filter(b => { const r = b.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || getComputedStyle(b).visibility === 'hidden') return false; const t = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !!t && (b === t || b.contains(t) || t.contains(b)); }).slice(0, 60);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { if (bs[i].contains(bs[j]) || bs[j].contains(bs[i])) continue; const a = bs[i].getBoundingClientRect(), b = bs[j].getBoundingClientRect(); const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 6 && oy > 6 && getComputedStyle(bs[i]).position !== 'fixed' && getComputedStyle(bs[j]).position !== 'fixed') { out.push('buttons overlap: ' + (bs[i].textContent || '').trim().slice(0, 12) + ' × ' + (bs[j].textContent || '').trim().slice(0, 12)); i = bs.length; break; } }
    // 5. injected markup must never execute
    if (window.__pwn) out.push('XSS: injected script ran');
    // 6. elements hanging off-screen
    document.querySelectorAll('.btn, button, h1, h2').forEach(b => { const r = b.getBoundingClientRect(); if (r.width && (r.right < -4 || r.left > innerWidth + 4)) out.push('element outside screen: ' + (b.textContent || '').trim().slice(0, 20)); });
    return out;
  }).catch(() => []);
  r.forEach(m => note(page, scr, 'invariant', m));
}

(async () => {
  const b = await chromium.launch(); let hopsDone = 0;
  console.log(`🐭 الجربوع — seed ${SEED}, ${HOPS} hops × ${PAGES.length} pages × ${SCREENS.length} screens${QUICK ? ' (quick)' : ''}`);
  for (const [name, file] of PAGES) for (const [w, h] of SCREENS) {
    const scr = `${w}x${h}`; const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: w < 700 });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('majlis_started', '1'); } catch (e) {} });
    const p = await ctx.newPage(); const rec = [];
    p.on('pageerror', e => note(name, scr, 'js-error', e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '').trim().replace(/file:\/\/.*\//, '') + ' | last hops: ' + rec.slice(-6).join(',')));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon|MQTT|WebSocket|peerjs|PeerJS|socket/i.test(m.text())) note(name, scr, 'console', m.text().slice(0, 120)); });
    p.on('dialog', d => d.dismiss().catch(() => {}));
    await p.goto('file://' + path.join(ROOT, file)).catch(e => note(name, scr, 'load', e.message));
    await p.waitForTimeout(250); await invariants(p, name, scr);
    // guided walk: play the primary path like a real family would, checking every screen
    for (let i = 0; i < (QUICK ? 10 : 24); i++) {
      const sel = ['[data-act=answer]', '[data-act=next]', '[data-ui=next]', '[data-ui=to-scores]', '.tile:not([disabled])', '#d-next', '#h-start', '[data-act=quick]', '[data-ui=quick]', '.btn.go:not([disabled])', '.btn.primary:not([disabled])', '.start'];
      let done = false;
      for (const q of sel) { const e = await p.$(q).catch(() => null); if (e && await e.isVisible().catch(() => false)) { await e.click({ timeout: 700, noWaitAfter: true }).catch(() => {}); done = true; break; } }
      await p.waitForTimeout(done ? 220 : 80);
      if (i % 2 === 1) await invariants(p, name, scr + ' walk').catch(() => {});
    }
    await p.goto('file://' + path.join(ROOT, file)).catch(() => {}); await p.waitForTimeout(150);
    for (let i = 0; i < HOPS; i++) {
      await hop(p, name, scr, i, rec).catch(() => {}); hopsDone++;
      if (!p.url().includes(file) && !p.url().includes('index')) await p.goto('file://' + path.join(ROOT, file)).catch(() => {});
      if (i % 4 === 3) await invariants(p, name, scr).catch(() => {});
    }
    // weird states: wiped storage, then a restart, then offline
    await p.evaluate(() => localStorage.clear()).catch(() => {}); await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await p.waitForTimeout(200); await invariants(p, name, scr);
    await ctx.setOffline(true); await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await p.waitForTimeout(200); await invariants(p, name, scr);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${hopsDone} hops done.`);
  if (!problems.length) console.log('✅ الجربوع ما لقى شي يخرب.');
  else { console.log(`❌ الجربوع لقى ${problems.length} مشكلة:`); problems.forEach((q, i) => console.log(`${i + 1}. [${q.page} @ ${q.scr}] ${q.kind}: ${q.msg}`)); console.log(`\nأعد التشغيل: node jerboa/jerboa.js --seed ${SEED}`); }
  process.exit(Math.min(problems.length, 99));
})();
