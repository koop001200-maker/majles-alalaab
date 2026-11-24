/* «مجلس الألعاب» — shared helpers loaded by every game page (in <head>, before the game's own code).
 *
 * 1) One continuous full screen for the whole site.
 *    The hub opens each game inside a full-window frame named "majlis-play". Inside that frame the
 *    game's own full-screen button asks the hub to go full screen instead, so switching games or going
 *    back to the hub never drops out of full screen. Links back to index.html close the frame.
 *
 * 2) No scrolling, ever.
 *    Any box that would need scrolling is first shrunk to fit (up to 30% smaller). Long lists that still
 *    don't fit are shown page by page with ‹ › buttons (also mouse wheel, PageUp/PageDown).
 */
(function () {
  "use strict";
  var inShell = false;
  try { inShell = window.name === "majlis-play" && window.parent !== window; } catch (e) {}

  /* ---------------- 1) full screen through the hub ---------------- */
  if (inShell) {
    var fsOn = false, fsWaiters = [];
    var send = function (msg) { try { window.parent.postMessage({ majlis: msg }, "*"); } catch (e) {} };
    window.addEventListener("message", function (e) {
      if (e.source !== window.parent || !e.data || e.data.majlisFs === undefined) return;
      var was = fsOn; fsOn = !!e.data.majlisFs;
      fsWaiters.splice(0).forEach(function (f) { f(); });
      if (was !== fsOn) { try { document.dispatchEvent(new Event("fullscreenchange")); } catch (err) {} }
    });
    var ask = function (msg) { return new Promise(function (res) { fsWaiters.push(res); send(msg); setTimeout(res, 800); }); };
    try {
      Object.defineProperty(Document.prototype, "fullscreenElement", { configurable: true, get: function () { return fsOn ? document.documentElement : null; } });
      Object.defineProperty(Document.prototype, "webkitFullscreenElement", { configurable: true, get: function () { return fsOn ? document.documentElement : null; } });
      Element.prototype.requestFullscreen = function () { return ask("fs-on"); };
      Element.prototype.webkitRequestFullscreen = Element.prototype.requestFullscreen;
      Document.prototype.exitFullscreen = function () { return ask("fs-off"); };
    } catch (e) {}
    send("hello");
    /* جولة العائلة: لما تخلص اللعبة وتظهر النتيجة، نرجع تلقائياً لجدول الجولة بعد ثوانٍ */
    (function () {
      var done = false;
      function over() {
        var pg = location.pathname.split("/").pop();
        var st = function (k) { try { return JSON.parse(localStorage.getItem(k) || "null") || {}; } catch (e) { return {}; } };
        if (pg === "min-akoon.html") return !!document.querySelector(".winner");
        if (pg === "khammen.html" || pg === "rattebha.html") return !!document.querySelector(".final");
        if (pg === "huruf.html") return !!document.querySelector(".champ");
        if (pg === "seenjeem.html") return !!document.querySelector(".win");
        if (pg === "hurouf.html") { var t = document.querySelector(".win .trophy"); return !!(t && t.textContent.indexOf("🏆") >= 0); }
        if (pg === "bara.html") return st("br_game_v1").phase === "over";
        if (pg === "wsh.html") return st("wsh_host_v1").phase === "final";
        return false;
      }
      function back() {
        if (done) return; done = true;
        var left = 6, box = document.createElement("div");
        box.setAttribute("role", "status");
        box.style.cssText = "position:fixed;z-index:2147483001;left:50%;bottom:18px;transform:translateX(-50%);background:#fbbf24;color:#111827;border:3px solid #111827;border-radius:999px;box-shadow:4px 4px 0 #111827;padding:.4em 1em;font:800 18px/1.3 Changa,sans-serif;display:flex;gap:10px;align-items:center;direction:rtl";
        var txt = document.createElement("span"), go = document.createElement("button"), stay = document.createElement("button");
        go.textContent = "ارجعوا الحين"; stay.textContent = "خلّونا هنا";
        [go, stay].forEach(function (b) { b.type = "button"; b.style.cssText = "font:800 15px Changa,sans-serif;border:2px solid #111827;border-radius:999px;padding:.2em .8em;background:#fff;cursor:pointer"; });
        box.appendChild(txt); box.appendChild(go); box.appendChild(stay); document.body.appendChild(box);
        var tick = function () { txt.textContent = "🏆 جولة العائلة: نرجع لجدول النقاط بعد " + left + " ث"; };
        tick();
        var iv = setInterval(function () { left--; if (left <= 0) { clearInterval(iv); send("home"); } else tick(); }, 1000);
        go.onclick = function () { clearInterval(iv); send("home"); };
        stay.onclick = function () { clearInterval(iv); box.remove(); };
      }
      setInterval(function () { if (!done && window.MAJLIS_FAM_TEAMS && MAJLIS_FAM_TEAMS() && over()) back(); }, 1000);
    })();
    // links to the hub close the frame instead of loading the hub inside it
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href="index.html"], a[href="./index.html"]');
      if (!a) return;
      e.preventDefault(); send("home");
    }, true);
    // keyboard shortcut F11-style: let Escape-from-fullscreen be handled by the browser on the hub
  }

  /* ---------------- 2) fit or page every box that would scroll ---------------- */
  var MIN_ZOOM = 0.7, minZoom = function () { return innerHeight < 520 ? 0.4 : MIN_ZOOM; }, pagers = [], pageMemo = {}, queued = false;
  var canZoom = (function () { try { return CSS.supports("zoom", "0.9"); } catch (e) { return false; } })();

  function sig(el) {
    var s = "", n = el;
    for (var i = 0; n && n !== document.body && i < 4; i++, n = n.parentElement) s = (n.id || (typeof n.className === "string" ? n.className : "") || n.tagName) + ">" + s;
    return s;
  }
  function scrollable(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.hasAttribute("data-free-scroll")) return false;
    // شاشات الإعداد: تمرير عادي بدل التصغير، عشان أزرار الاختيار ما تصير أصغر من إصبع على الجوال
    if (el.matches && el.matches(".setup-col, .setup-body, .setup") && innerHeight < 700) return false;
    var cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (!/(auto|scroll)/.test(cs.overflowY) && !el.hasAttribute("data-majlis-paged")) return false;
    return el.clientHeight > 40 && el.clientWidth > 40;
  }
  function overflowing(el) { return el.scrollHeight > el.clientHeight + 3; }

  // a "list" = many rows of the same kind (bank items, words, players...). Only lists are split into pages.
  function isList(el) {
    var counts = {}, best = 0, all = el.querySelectorAll("*");
    for (var i = 0; i < all.length && i < 3000; i++) {
      var n = all[i], par = n.parentElement; if (!par) continue;
      var k = (par === el ? "" : "p") + n.tagName;
      k += "@" + (par.dataset && par.dataset.mjid ? par.dataset.mjid : (par.dataset.mjid = Math.random().toString(36).slice(2, 8)));
      counts[k] = (counts[k] || 0) + 1; if (counts[k] > best) best = counts[k];
    }
    return best >= 8;
  }
  function hasForm(el) { return !!el.querySelector("input:not([type]), input[type=text], input[type=search], input[type=number], textarea"); }
  function inPopup(el) { return !!(el.closest('.modal, [role="dialog"], .modal-back, dialog') || el.querySelector('.modal, [role="dialog"]')); }
  function fitZoom(el) {
    if (!canZoom || el.hasAttribute("data-majlis-paged")) return false;
    // only shrink text-like boxes; long lists go to pages
    if (el.__mjList && el.querySelectorAll("*").length > 400) return false; // long lists go straight to pages
    var cur = parseFloat(el.style.zoom) || 1;
    if (!overflowing(el)) {
      // grow back if there is room (after a resize)
      if (cur < 1) { el.style.zoom = Math.min(1, cur + 0.05); if (overflowing(el)) el.style.zoom = cur; }
      return true;
    }
    var min = el.__mjList ? minZoom() : 0.5;
    for (var z = cur - 0.05; z >= min - 0.001; z -= 0.05) { el.style.zoom = z.toFixed(2); if (!overflowing(el)) return true; }
    el.style.zoom = "";
    return false;
  }

  function pageStarts(el, avail) {
    // page boundaries snap to the top of the row that would be cut
    var base = el.getBoundingClientRect().top - el.scrollTop, rows = [], all = el.querySelectorAll("*");
    for (var i = 0; i < all.length && i < 4000; i++) {
      var r = all[i].getBoundingClientRect(); if (!r.height || r.height > avail * 0.6) continue;
      rows.push([r.top - base, r.bottom - base]);
    }
    var starts = [0], total = el.scrollHeight, s = 0, guard = 0;
    while (s + avail < total - 2 && guard++ < 500) {
      var line = s + avail, cut = line;
      for (var k = 0; k < rows.length; k++) if (rows[k][0] > s + 1 && rows[k][0] < cut && rows[k][1] > line + 1) cut = rows[k][0];
      if (cut <= s + 10) cut = line;
      starts.push(cut); s = cut;
    }
    return starts;
  }

  function makePager(el) {
    var bar = document.createElement("div");
    bar.className = "majlis-pager"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "صفحات");
    bar.innerHTML = '<button type="button" data-p="-1" aria-label="الصفحة السابقة">›</button><span></span><button type="button" data-p="1" aria-label="الصفحة التالية">‹</button>';
    document.body.appendChild(bar);
    var pg = { el: el, bar: bar, starts: [0], i: 0, key: sig(el) };
    bar.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) go(pg, pg.i + +b.dataset.p); });
    el.addEventListener("wheel", function (e) {
      if (!el.hasAttribute("data-majlis-paged")) return;
      e.preventDefault(); var now = Date.now(); if (now - (pg.last || 0) < 350) return; pg.last = now; go(pg, pg.i + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    var ty = null;
    el.addEventListener("touchstart", function (e) { ty = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchmove", function (e) { if (el.hasAttribute("data-majlis-paged")) e.preventDefault(); }, { passive: false });
    el.addEventListener("touchend", function (e) {
      if (ty === null || !el.hasAttribute("data-majlis-paged")) return;
      var dy = ty - e.changedTouches[0].clientY; ty = null; if (Math.abs(dy) > 40) go(pg, pg.i + (dy > 0 ? 1 : -1));
    });
    pagers.push(pg); return pg;
  }
  function go(pg, i) {
    i = Math.max(0, Math.min(pg.starts.length - 1, i)); pg.i = i; pageMemo[pg.key] = i;
    pg.el.scrollTop = pg.starts[i];
    var next = pg.starts[i + 1], avail = pg.el.clientHeight - pg.reserve;
    var shown = next !== undefined ? next - pg.starts[i] : avail;
    pg.el.style.clipPath = "inset(0 0 " + Math.max(0, pg.el.clientHeight - shown) + "px 0)";
    var span = pg.bar.querySelector("span"); span.textContent = "صفحة " + (i + 1) + " من " + pg.starts.length;
    pg.bar.children[0].disabled = i === 0; pg.bar.children[2].disabled = i === pg.starts.length - 1;
  }
  function place(pg) {
    var r = pg.el.getBoundingClientRect(), b = pg.bar;
    b.style.top = Math.round(r.bottom - b.offsetHeight - 6) + "px";
    b.style.left = Math.round(r.left + r.width / 2 - b.offsetWidth / 2) + "px";
  }
  // a list under a popup must not show its page buttons on top of the popup
  function covered(pg) {
    var r = pg.el.getBoundingClientRect(), was = pg.bar.style.visibility;
    pg.bar.style.visibility = "hidden";
    var pts = [[r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)], [r.left + r.width / 2, r.bottom - 30]], hit = 0;
    for (var i = 0; i < pts.length; i++) {
      var x = Math.max(0, Math.min(innerWidth - 1, pts[i][0])), y = Math.max(0, Math.min(innerHeight - 1, pts[i][1]));
      var top = document.elementFromPoint(x, y);
      if (top && !pg.el.contains(top) && !top.contains(pg.el)) hit++;
    }
    pg.bar.style.visibility = was;
    return hit === pts.length;
  }
  function setupPaging(el) {
    var pg = null;
    for (var i = 0; i < pagers.length; i++) if (pagers[i].el === el) pg = pagers[i];
    if (!pg) pg = makePager(el);
    el.setAttribute("data-majlis-paged", "");
    pg.bar.hidden = false;
    pg.reserve = pg.bar.offsetHeight + 12;
    var keepTop = pg.starts[pg.i] || 0;
    pg.starts = pageStarts(el, el.clientHeight - pg.reserve);
    var idx = pageMemo[pg.key] || 0;
    if (keepTop) for (var k = 0; k < pg.starts.length; k++) if (pg.starts[k] <= keepTop) idx = k;
    go(pg, Math.min(idx, pg.starts.length - 1)); place(pg);
  }
  function dropPager(pg) {
    pg.el.removeAttribute("data-majlis-paged"); pg.el.style.clipPath = ""; pg.bar.remove();
  }

  var busy = false;
  function run() {
    queued = false; if (busy) return; busy = true;
    try {
      pagers = pagers.filter(function (pg) { if (!pg.el.isConnected) { pg.bar.remove(); return false; } return true; });
      var els = document.querySelectorAll("body *");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest(".majlis-pager") || !scrollable(el)) continue;
        if (el.hasAttribute("data-majlis-paged")) {
          el.style.clipPath = ""; var save = el.scrollTop; el.scrollTop = 0;
          var stillLong = overflowing(el); el.scrollTop = save;
          if (stillLong) { setupPaging(el); continue; }
          for (var k = 0; k < pagers.length; k++) if (pagers[k].el === el) { dropPager(pagers[k]); pagers.splice(k, 1); break; }
          continue;
        }
        if (!overflowing(el) && !(parseFloat(el.style.zoom) < 1)) continue;
        // inside a popup, only a plain list (no buttons in it) may be split into pages
        el.__mjList = isList(el) && !hasForm(el) && !(inPopup(el) && el.querySelector("button, a[href]"));
        if (fitZoom(el)) continue;
        if (!el.__mjList) continue; // popups, forms and text never get split into pages
        setupPaging(el);
      }
      pagers.forEach(function (pg) {
        if (getComputedStyle(pg.el).display === "none" || !pg.el.getClientRects().length || covered(pg)) { pg.bar.hidden = true; return; }
        if (pg.el.hasAttribute("data-majlis-paged")) { pg.bar.hidden = false; place(pg); }
      });
    } catch (e) {}
    busy = false;
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(function () { setTimeout(run, 30); }); } }

  var css = document.createElement("style");
  css.textContent =
    ".majlis-pager{position:fixed;z-index:2147483000;display:flex;align-items:center;gap:6px;direction:rtl;background:#fff;color:#111827;border:3px solid #111827;border-radius:999px;box-shadow:4px 4px 0 #111827;padding:3px 6px;font:700 16px/1 Changa,'Segoe UI',Tahoma,sans-serif}" +
    ".majlis-pager[hidden]{display:none}" +
    ".majlis-pager button{width:40px;height:34px;border:2px solid #111827;border-radius:999px;background:#fbbf24;color:#111827;font:800 22px/1 Changa,sans-serif;cursor:pointer;padding:0 0 3px}" +
    ".majlis-pager button:disabled{background:#e5e7eb;color:#9ca3af;cursor:default}" +
    ".majlis-pager span{min-width:96px;white-space:nowrap;text-align:center}" +
    "[data-majlis-paged]{overflow:hidden!important;scroll-behavior:auto!important}";
  (document.head || document.documentElement).appendChild(css);

  function start() {
    run();
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i], t = m.target;
        if (t.nodeType !== 1) t = t.parentElement;
        if (!t || (t.closest && t.closest(".majlis-pager"))) continue;
        if (m.type === "attributes" && m.attributeName === "style" && (t.hasAttribute("data-majlis-paged") || t.style.zoom)) continue; // our own changes
        queue(); return;
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style", "open", "aria-selected"], characterData: true });
    window.addEventListener("resize", queue);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "PageDown" && e.key !== "PageUp") return;
      var vis = pagers.filter(function (pg) { return !pg.bar.hidden; }); if (!vis.length) return;
      e.preventDefault(); var pg = vis[vis.length - 1]; go(pg, pg.i + (e.key === "PageDown" ? 1 : -1));
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.MAJLIS = { refit: queue, inShell: inShell };
  /* جولة العائلة: لو اللعبة مفتوحة ضمن جولة، ترجع أسماء الفرق عشان اللعبة تعبّيها تلقائياً بدل ما يكتبونها من جديد */
  window.MAJLIS_FAM_TEAMS = function () {
    try {
      var f = JSON.parse(localStorage.getItem("majlis_fam") || "null");
      if (!f || !f.waiting || !Array.isArray(f.teams) || f.idx >= (f.games || []).length) return null;
      var n = f.teams.map(function (t) { return String(t && t.name || "").trim().slice(0, 20); }).filter(Boolean);
      return n.length >= 2 ? n : null;
    } catch (e) { return null; }
  };

  /* ---------------- 3) التركيز يبقى مكانه بعد إعادة رسم الشاشة (كيبورد / ريموت التلفزيون) ---------------- */
  (function () {
    var last = null, kb = false, timer = 0;
    function cssEsc(v) { try { return CSS.escape(v); } catch (e) { return String(v).replace(/["\\]/g, "\\$&"); } }
    function selOf(el) {
      if (!el || el === document.body || el === document.documentElement) return null;
      if (el.id) return "#" + cssEsc(el.id);
      var sel = el.tagName.toLowerCase(), has = false, a = el.attributes;
      for (var i = 0; i < a.length; i++) if (a[i].name.indexOf("data-") === 0 && a[i].name !== "data-mjid") { sel += "[" + a[i].name + '="' + String(a[i].value).replace(/["\\]/g, "\\$&") + '"]'; has = true; }
      return has ? sel : null;
    }
    document.addEventListener("keydown", function (e) {
      kb = true;
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") last = selOf(document.activeElement);
    }, true);
    document.addEventListener("pointerdown", function () { kb = false; last = null; }, true);
    function restore() {
      timer = 0;
      if (!kb || !last) return;
      var ae = document.activeElement;
      if (ae && ae !== document.body && ae !== document.documentElement) return;
      var el = null; try { el = document.querySelector(last); } catch (e) {}
      if (el && !el.disabled && el.getClientRects().length) { try { el.focus({ preventScroll: true }); } catch (e) {} }
    }
    function arm() { new MutationObserver(function () { if (kb && last && !timer) timer = setTimeout(restore, 30); }).observe(document.body, { childList: true, subtree: true }); }
    if (document.body) arm(); else document.addEventListener("DOMContentLoaded", arm);
  })();
})();
