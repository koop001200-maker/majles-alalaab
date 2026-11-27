/* «مجلس الألعاب» — المجموعات المتاحة، الجولات المجانية، والاشتراك (شكل تجريبي فقط: لا يوجد دفع حقيقي).
 *
 * المجموعات: محتوى كل لعبة مقسوم إلى مجموعات ثابتة الحجم (مثلاً 8 بطاقات). عدد المجموعات المتاحة = ما بقي من
 * محتوى لم يُلعب بعد ÷ حجم المجموعة (للأعلى). كلما لعبتَ نقص العدد، وإذا زاد المحتوى زاد العدد حين تمتلئ المجموعة.
 *
 * قبل الاشتراك: 3 مجموعات مفتوحة لكل لعبة (عدا «وش الصح؟»)، وبعد الاشتراك تُفتح كل مجموعات البنك.
 *
 * لا تُخزَّن أي بيانات بطاقة ولا تُرسل لأي مكان: ما يُكتب في الخانات يُستخدم للتحقق الشكلي فقط ثم يُنسى.
 */
(function () {
  "use strict";
  var SUB_KEY = "majlis_sub_v1", FREE_KEY = "majlis_free_v1", SETS_KEY = "majlis_sets_v1", PICK_KEY = "majlis_pick_v1";
  var HUB_HIDDEN = { br: 1 }; // ألعاب غير معروضة في الهاب بعد
  var FILES = { mak: "min-akoon.html", kh: "khammen.html", hf: "huruf.html", rt: "rattebha.html", wsh: "wsh.html", br: "bara.html" };
  var FREE_SETS = 3; // sets that open before subscribing; after subscribing every set in the bank is open
  var SIZE = { mak: 8, kh: 12, rt: 8, hf: 15, wsh: 8, br: 5 };
  var NAMES = { mak: "من أنا؟", kh: "خمّن وش هو؟", rt: "رتّب وفوز", hf: "لخبطة حروف", wsh: "وش الصح؟", br: "برا السالفة" };
  var DEFAULT_TOTAL = { mak: 128, kh: 411, rt: 192, hf: 582, wsh: 152, br: 192 }; // shown on the hub before a game has ever been opened
  var PLANS = {
    day: { id: "day", name: "اشتراك يوم واحد", price: "9.99", unit: "لليوم", ms: 864e5 },
    month: { id: "month", name: "اشتراك شهر", price: "19.99", unit: "للشهر", ms: 30 * 864e5 }
  };

  function get(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* ---------------- subscription state ---------------- */
  function sub() { var s = get(SUB_KEY, null); return s && s.until > Date.now() ? s : null; }
  function isSub() { return !!sub(); }
  var AR_NAMES = { NOURA: "نورة", NORAH: "نورة", SARA: "سارة", SARAH: "سارة", REEM: "ريم", LAMA: "لمى", HESSA: "حصة", MARAM: "مرام", DANA: "دانة", LUJAIN: "لجين", RAZAN: "رزان", ABEER: "عبير", FATIMA: "فاطمة", AISHA: "عائشة", MAHA: "مها", HANAN: "حنان", SHAHAD: "شهد", JOURI: "جوري", GHADA: "غدير", GHADEER: "غدير", AMAL: "أمل", RANA: "رنا", HIND: "هند", LINA: "لينا", WAFA: "وفاء", SALMA: "سلمى", MONA: "منى", NADA: "ندى", RAWAN: "روان", TALA: "تالا", AHMED: "أحمد", MOHAMMED: "محمد", MOHAMMAD: "محمد", MUHAMMAD: "محمد", MOHAMED: "محمد", KHALID: "خالد", FAHAD: "فهد", ABDULLAH: "عبدالله", SULTAN: "سلطان", SALMAN: "سلمان", TURKI: "تركي", NASSER: "ناصر", NASER: "ناصر", FAISAL: "فيصل", OMAR: "عمر", YOUSEF: "يوسف", YOUSSEF: "يوسف", SAEED: "سعيد", ABDULRAHMAN: "عبدالرحمن", IBRAHIM: "إبراهيم", SALEH: "صالح", ALI: "علي", MAJED: "ماجد", BADER: "بدر", RASHID: "راشد", HAMAD: "حمد", SAAD: "سعد", NAIF: "نايف", MISHAL: "مشعل", FARIS: "فارس", ABDULAZIZ: "عبدالعزيز", HASSAN: "حسن", HUSSEIN: "حسين", MANSOUR: "منصور", YAZEED: "يزيد", ZIYAD: "زياد", TALAL: "طلال", MUTEB: "متعب", SAUD: "سعود", HAMZA: "حمزة", ABDULMAJEED: "عبدالمجيد", ABDULELAH: "عبدالإله", RAKAN: "راكان", NAWAF: "نواف", MESHARI: "مشاري", BANDAR: "بندر", MAZEN: "مازن", ANAS: "أنس", HANI: "هاني", WALEED: "وليد", SAMI: "سامي", ADEL: "عادل", NADER: "نادر", SAMER: "سامر", AYMAN: "أيمن" };
  var AR_LETTERS = { A: "ا", B: "ب", C: "ك", D: "د", E: "ي", F: "ف", G: "ق", H: "ه", I: "ي", J: "ج", K: "ك", L: "ل", M: "م", N: "ن", O: "و", P: "ب", Q: "ق", R: "ر", S: "س", T: "ت", U: "و", V: "ف", W: "و", X: "كس", Y: "ي", Z: "ز" };
  function arabicName(latin) {
    var t = String(latin || "").trim();
    if (/[\u0600-\u06FF]/.test(t)) return t;
    return t.toUpperCase().split(/\s+/).filter(Boolean).map(function (w) {
      if (AR_NAMES[w]) return AR_NAMES[w];
      return w.replace(/[^A-Z]/g, "").split("").map(function (c) { return AR_LETTERS[c] || ""; }).join("");
    }).filter(Boolean).join(" ");
  }
  function subscribe(planId, name) { var p = PLANS[planId] || PLANS.month; set(SUB_KEY, { plan: p.id, at: Date.now(), until: Date.now() + p.ms, name: name ? arabicName(String(name).trim().split(/\s+/)[0]) : "" }); changed(); placeBadge(); }
  function unsubscribe() { try { localStorage.removeItem(SUB_KEY); } catch (e) {} changed(); placeBadge(); }
  function freeUsed(game) { var f = get(FREE_KEY, {}); return (f && +f[game]) || 0; }
  function freeRounds(game) { return FREE_SETS * (SIZE[game] || 8); }
  function gate(game) {
    if (isSub()) return true;
    var f = get(FREE_KEY, {}); if (!f || typeof f !== "object") f = {};
    if ((+f[game] || 0) >= freeRounds(game)) { openPaywall(game); return false; }
    f[game] = (+f[game] || 0) + 1; set(FREE_KEY, f); placeBadge();
    return true;
  }

  /* ---------------- available sets ---------------- */
  function setsInfo(game) {
    var d = get(SETS_KEY, {}), e = d && d[game];
    var total = e ? +e.total : DEFAULT_TOTAL[game], unplayed = e ? +e.unplayed : DEFAULT_TOTAL[game], size = SIZE[game] || 8;
    var full = Math.ceil(unplayed / size), left = full;
    if (game !== "wsh" && !isSub()) left = Math.max(0, Math.min(full, Math.ceil((freeRounds(game) - freeUsed(game)) / size)));
    return { size: size, total: total, unplayed: unplayed, left: left, full: full, all: Math.ceil(total / size) };
  }
  var curGame = null;
  var meta = {};
  function sets(game, total, unplayed, extra) {
    curGame = game; if (extra) meta[game] = extra;
    var d = get(SETS_KEY, {}); if (!d || typeof d !== "object") d = {};
    var old = d[game];
    var prog = extra ? setList(game).map(function (x) { return x.u; }) : (old && old.prog) || [];
    if (!old || old.total !== total || old.unplayed !== unplayed || JSON.stringify(old.prog || []) !== JSON.stringify(prog)) { d[game] = { total: total, unplayed: unplayed, prog: prog }; set(SETS_KEY, d); }
    placeBadge(); setTimeout(queuePlace, 0);
  }
  function setsWord(n) { return n === 2 ? "مجموعتان متاحتان" : n >= 3 && n <= 10 ? "مجموعات متاحة" : "مجموعة متاحة"; }
  function badgeText() {
    if (!curGame) return "";
    var i = setsInfo(curGame);
    var small = window.innerWidth < 560;
    return "🎮 " + i.left + (small ? "" : " " + setsWord(i.left));
  }
  function badgeTitle() {
    var i = setsInfo(curGame);
    return NAMES[curGame] + ": " + i.left + " " + setsWord(i.left) + " (كل مجموعة " + i.size + " جولات)";
  }
  var placing = false;
  function placeBadge() {
    if (placing || !curGame || document.body.hasAttribute("data-hub")) return;
    placing = true;
    try {
      // the sets counter lives only on the game's first screen, next to the «المجموعات» button
      // عدّاد «مجموعة متاحة» انشال من شاشات الألعاب (طلب المستخدم)، فنشيله لو موجود ونطلع
      var old = document.querySelector(".sets-pill"); if (old) old.remove(); placing = false; return;
      var host = null, hs = document.querySelectorAll(".home-stack .row.small, .reset-line");
      for (var k = 0; k < hs.length && !host; k++) if (hs[k].getClientRects().length > 0) host = hs[k];
      var pill = document.querySelector(".sets-pill");
      if (!host) { if (pill) pill.remove(); placing = false; return; }
      if (!pill) { pill = document.createElement("span"); pill.className = "sets-pill"; pill.setAttribute("role", "status"); pill.addEventListener("click", function () { openSets(); }); }
      var txt = badgeText(); if (pill.textContent !== txt) pill.textContent = txt;
      var ttl = badgeTitle(); if (pill.title !== ttl) pill.title = ttl;
      pill.classList.remove("fixed");
      if (pill.parentNode !== host || host.firstElementChild !== pill) host.insertBefore(pill, host.firstChild);
    } catch (e) {}
    placing = false;
  }
  var hp = false;
  function placeHome() {
    if (hp || document.body.hasAttribute("data-hub") || document.body.classList.contains("phone") || (!curGame && !document.body.hasAttribute("data-home-label"))) return;
    hp = true;
    try {
      var host = null, sels = [".topbar .round-info", ".topbar .info", ".bar-r", ".d-top", ".c-top", ".page-head"], first = true;
      for (var k = 0; k < sels.length && !host; k++) { var h = document.querySelector(sels[k]); if (h && h.getClientRects().length > 0) { host = h; first = sels[k] !== ".page-head"; } }
      var pill = document.querySelector(".home-pill");
      if (!pill) { pill = document.createElement("a"); pill.className = "home-pill"; pill.href = "index.html"; var hl = document.body.getAttribute("data-home-label"); pill.textContent = hl ? "🏠 " + hl : "↩ رجوع"; pill.title = "الرجوع إلى مجلس الألعاب"; }
      pill.classList.toggle("fixed", !host);
      var parent = host || document.body;
      if (pill.parentNode !== parent || (host && (first ? parent.firstElementChild !== pill : parent.lastElementChild !== pill))) { if (first && host) parent.insertBefore(pill, parent.firstChild); else parent.appendChild(pill); }
    } catch (e) {}
    hp = false;
  }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-open-sets]"); if (b) { e.preventDefault(); openSets(); } });
  var pq = false;
  function queuePlace() { if (!pq) { pq = true; requestAnimationFrame(function () { pq = false; placeBadge(); placeHome(); }); } }

  function setList(game) {
    var m = meta[game], size = SIZE[game] || 8, out = [], k, n, u;
    if (m && m.ids) {
      var used = {}; (m.used || []).forEach(function (id) { used[id] = 1; });
      for (k = 0; k * size < m.ids.length; k++) {
        var ids = m.ids.slice(k * size, (k + 1) * size); u = ids.filter(function (id) { return used[id]; }).length;
        out.push({ k: k, n: ids.length, u: u, locked: game !== "wsh" && !isSub() && k >= FREE_SETS });
      }
      return out;
    }
    var d = get(SETS_KEY, {}), e = d && d[game], total = e ? +e.total : DEFAULT_TOTAL[game], prog = (e && e.prog) || [];
    for (k = 0; k * size < total; k++) { n = Math.min(size, total - k * size); out.push({ k: k, n: n, u: Math.min(n, +prog[k] || 0), locked: game !== "wsh" && !isSub() && k >= FREE_SETS }); }
    return out;
  }
  var RESET_KEYS = { mak: "mak_used_v1", kh: "kh_used_v1", rt: "rt_used_v1", br: "br_used_v1" };
  function resetHistory(game) {
    try {
      if (meta[game] && meta[game].reset) { meta[game].reset(); return; }
      if (RESET_KEYS[game]) localStorage.setItem(RESET_KEYS[game], "[]");
      else { var key = game === "hf" ? "tahaddi-alhuruf-v1" : "wsh_host_v1", o = JSON.parse(localStorage.getItem(key) || "null"); if (o) { if (game === "hf") o.seen = []; else o.used = []; localStorage.setItem(key, JSON.stringify(o)); } }
      var d = get(SETS_KEY, {}); if (d && d[game]) { d[game].prog = []; d[game].unplayed = d[game].total; set(SETS_KEY, d); }
    } catch (e) {}
  }
  // ids of the chosen set (sticky for 30 min) or null = no restriction
  function takeScope(game, allIds) {
    var pick = get(PICK_KEY, {}), size = SIZE[game] || 8;
    if (!pick || !pick[game] || Date.now() - pick[game].at > 30 * 60 * 1000) return null;
    var k = pick[game].k; if (game !== "wsh" && !isSub() && k >= FREE_SETS) return null;
    var ids = allIds.slice(k * size, (k + 1) * size); return ids.length ? ids : null;
  }
  function scoped(game, items, usedIds) {
    var sc = takeScope(game, items.map(function (x) { return x.id; })); if (!sc) return items;
    var sub = items.filter(function (x) { return sc.indexOf(x.id) >= 0 && (!usedIds || usedIds.indexOf(x.id) < 0); });
    return sub.length ? sub : items;
  }
  function choose(game, k) { var pick = get(PICK_KEY, {}); if (!pick || typeof pick !== "object") pick = {}; pick[game] = { k: k, at: Date.now() }; set(PICK_KEY, pick); }

  /* ---------------- styles ---------------- */
  var css = document.createElement("style");
  css.textContent =
    ".home-pill{min-height:36px;display:inline-flex;align-items:center;gap:.3em;background:#fbbf24;color:#111827;border:2px solid #111827;border-radius:999px;padding:.1em .9em;font:800 clamp(14px,min(1.1vw,2vh),24px)/1.5 Changa,'Segoe UI',Tahoma,sans-serif;white-space:nowrap;text-decoration:none;box-shadow:2px 2px 0 #111827}.home-pill:hover{background:#fde68a}" +
    ".home-pill.fixed{position:fixed;top:clamp(8px,1.6vh,18px);right:clamp(8px,1.2vw,18px);z-index:2147482000}" +
    ".mp .gchips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.mp .gc{min-height:30px;border:2px solid #111827;border-radius:999px;background:#fff;color:#111827;text-decoration:none;font-weight:800;padding:.1em .9em;font-size:clamp(12px,min(1.1vw,2vh),20px)}.mp .gc.on{background:#fbbf24}" +
    ".mp .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(6px,1vw,14px)}" +
    ".mp .st{border:3px solid #111827;border-radius:16px;background:#fff;color:#111827;padding:clamp(6px,1.4vh,16px) 4px;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;box-shadow:3px 3px 0 #111827}" +
    ".mp .st b{font:400 clamp(20px,min(2.4vw,4.4vh),44px)/1 Lalezar,Changa,sans-serif}.mp .st small{font-weight:700;font-size:clamp(10px,min(.9vw,1.7vh),16px)}" +
    ".mp .st.done{background:#d1fae5}.mp .st.part{background:#fef3c7}.mp .st.lock{background:#f3f4f6;color:#6b7280}" +
    ".mp .pg{display:flex;align-items:center;justify-content:center;gap:10px;font-weight:800;font-size:clamp(12px,min(1.1vw,2vh),20px)}.mp .pg button{width:2.4em;height:2em;border:2px solid #111827;border-radius:999px;background:#fbbf24;font:800 1.2em/1 Changa,sans-serif;cursor:pointer;color:#111827}.mp .pg button:disabled{background:#e5e7eb;color:#9ca3af}" +
    ".sets-pill{display:inline-flex;align-items:center;gap:.3em;background:#fff;color:#111827;border:2px solid #111827;border-radius:999px;padding:.1em .8em;font:800 clamp(14px,min(1.1vw,2vh),24px)/1.5 Changa,'Segoe UI',Tahoma,sans-serif;white-space:nowrap;cursor:default;box-shadow:2px 2px 0 #111827}" +
    ".sets-pill.fixed{position:fixed;top:clamp(8px,1.6vh,18px);left:clamp(8px,1.2vw,18px);z-index:2147482000;pointer-events:none}" +
    ".mp-back{position:fixed;inset:0;z-index:2147483200;background:rgba(17,24,39,.72);display:grid;place-items:center;padding:clamp(8px,2vh,24px);direction:rtl;font-family:Changa,'Segoe UI',Tahoma,sans-serif;color:#111827;animation:mpfade .2s}" +
    "@keyframes mpfade{from{opacity:0}}@keyframes mppop{from{transform:scale(.92);opacity:0}}" +
    ".mp{width:min(100%,980px);max-height:100%;background:#fff;border:clamp(3px,.25vw,5px) solid #111827;border-radius:clamp(16px,2vw,28px);box-shadow:clamp(5px,.5vw,10px) clamp(5px,.5vw,10px) 0 #111827;padding:clamp(12px,2.4vh,30px) clamp(14px,2vw,34px);display:flex;flex-direction:column;gap:clamp(8px,1.6vh,18px);text-align:center;animation:mppop .25s cubic-bezier(.2,1.3,.4,1);overflow:hidden}" +
    ".mp h2{margin:0;font:400 clamp(24px,min(3vw,5.4vh),56px)/1.2 Lalezar,Changa,sans-serif}" +
    ".mp p{margin:0;font-weight:700;font-size:clamp(13px,min(1.3vw,2.4vh),24px);line-height:1.5}" +
    ".mp .lock{font-size:clamp(40px,min(6vw,11vh),110px);line-height:1}" +
    ".mp .row{display:flex;flex-wrap:wrap;gap:clamp(8px,1vw,16px);justify-content:center}" +
    ".mp .b{border:3px solid #111827;border-radius:999px;background:#fff;color:#111827;box-shadow:4px 4px 0 #111827;padding:.4em 1.3em;font:800 clamp(15px,min(1.5vw,2.8vh),30px)/1.3 Changa,sans-serif;cursor:pointer}" +
    "@media (hover:none){.mp .b:hover{transform:none;box-shadow:4px 4px 0 #111827}}.mp,.mp *{-webkit-tap-highlight-color:transparent}" +
    ".mp .b:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 #111827}.mp .b:active{transform:translate(3px,3px);box-shadow:1px 1px 0 #111827}" +
    ".mp .b.go{background:#047857;color:#fff}.mp .b.hot{background:#fbbf24}.mp .b:disabled{opacity:.5;box-shadow:none;cursor:default}" +
    ".mp .b.link{border:0;background:none;box-shadow:none;text-decoration:underline;font-size:clamp(12px,min(1.1vw,2vh),20px);padding:.1em .6em;min-height:28px}" +
    ".mp .plans{display:grid;grid-template-columns:1fr 1.15fr;gap:clamp(10px,1.4vw,24px);align-items:stretch}" +
    ".mp .plan{position:relative;display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;border:3px solid #111827;border-radius:20px;background:#f3f4f6;color:#4b5563;padding:clamp(10px,2vh,24px) 10px;cursor:pointer;font-family:inherit}" +
    ".mp .plan.on{background:#fef3c7;color:#111827;box-shadow:6px 6px 0 #111827;transform:translate(-2px,-2px)}" +
    ".mp .plan .nm{font-weight:800;font-size:clamp(14px,min(1.4vw,2.6vh),26px)}" +
    ".mp .plan .pr{font:400 clamp(30px,min(4vw,7.4vh),80px)/1 Lalezar,Changa,sans-serif}.mp .plan .pr small{font:800 max(.32em,11px) Changa,sans-serif;margin-inline-start:.3em}" +
    ".mp .plan .pd{margin-top:.2em;background:#047857;color:#fff;border:2px solid #111827;border-radius:999px;padding:0 .8em;font-weight:800;font-size:clamp(12px,min(1.15vw,2.2vh),22px);white-space:nowrap;justify-self:center}.mp .plan .pd.off{background:#e5e7eb;color:#111827}.mp .pdnote{font-weight:800;background:#ecfdf5;border:2px solid #111827;border-radius:14px;padding:.1em .8em}" +
    ".mp .plan .nt{font-weight:700;font-size:clamp(11px,min(1vw,1.9vh),19px)}" +
    ".mp .plan .tag{position:absolute;top:-14px;inset-inline:0;margin-inline:auto;width:max-content;max-width:94%;background:#ef4444;color:#fff;border:2px solid #111827;border-radius:999px;padding:0 .9em;font-weight:800;font-size:clamp(11px,min(1.05vw,2vh),20px)}" +
    ".mp .plan .chk{position:absolute;top:8px;inset-inline-start:10px;width:1.4em;height:1.4em;border:2px solid #111827;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:clamp(11px,1.6vh,18px)}" +
    ".mp .plan.on .chk{background:#047857;color:#fff}" +
    ".mp .cardwrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:clamp(10px,2vw,30px);align-items:center;text-align:start}" +
    ".mp .vcard{aspect-ratio:1.586;border:3px solid #111827;border-radius:18px;background:linear-gradient(135deg,#1e3a8a,#6366f1 60%,#818cf8);color:#fff;padding:clamp(10px,2vh,22px);display:flex;flex-direction:column;justify-content:space-between;direction:ltr;box-shadow:5px 5px 0 #111827;font-family:'Segoe UI',monospace}" +
    ".mp .vcard .vn{font-size:clamp(12px,min(1.55vw,3vh),30px);letter-spacing:.08em;font-weight:700;white-space:nowrap}.mp .vcard .vr{display:flex;justify-content:space-between;font-size:clamp(10px,min(1.1vw,2vh),20px);letter-spacing:.05em}.mp .vcard .vl{font:italic 900 clamp(18px,min(2.4vw,4.4vh),44px)/1 Georgia,serif;align-self:flex-end}" +
    ".mp form{display:flex;flex-direction:column;gap:clamp(6px,1.2vh,12px)}.mp label{display:flex;flex-direction:column;gap:3px;font-weight:800;font-size:clamp(12px,min(1.05vw,2vh),20px)}" +
    ".mp input{border:3px solid #111827;border-radius:12px;padding:.35em .7em;font:700 clamp(14px,min(1.4vw,2.6vh),26px)/1.3 'Segoe UI',monospace;background:#fff;color:#111827;width:100%;direction:ltr;text-align:left}" +
    ".mp .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mp .err{color:#b91c1c;font-weight:800;min-height:1.4em;font-size:clamp(12px,min(1.05vw,2vh),20px)}" +
    ".mp .dua{font-family:Lalezar,Changa,sans-serif;font-weight:400!important;font-size:clamp(22px,min(2.8vw,5vh),52px)!important;color:#047857}" +
    ".mp .fine{font-size:clamp(10px,min(.9vw,1.7vh),16px)!important;color:#4b5563;font-weight:700}" +
    ".mp .ok{--okd:clamp(70px,min(12vh,12vw),140px);width:var(--okd);height:var(--okd);flex:none;align-self:center;justify-self:center;box-sizing:border-box;aspect-ratio:1;border-radius:50%;background:#10b981;border:4px solid #111827;color:#fff;display:grid;place-items:center;margin:0 auto;font-size:clamp(40px,8vh,90px);animation:mppop .5s cubic-bezier(.2,1.5,.4,1);box-shadow:5px 5px 0 #111827}" +
    ".mp .spin{width:clamp(40px,8vh,80px);aspect-ratio:1;border:6px solid #e5e7eb;border-top-color:#6366f1;border-radius:50%;margin:0 auto;animation:mpspin .8s linear infinite}@keyframes mpspin{to{transform:rotate(360deg)}}" +
    "@media (max-width:700px){.mp .cardwrap{grid-template-columns:1fr}.mp .vcard{display:none}}" +
    "@media (max-height:620px){.mp .lock{display:none}.mp .plan .nt{display:none}.mp .fine{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.mp,.mp-back,.mp .ok,.mp .spin{animation:none!important}}";
  (document.head || document.documentElement).appendChild(css);

  /* ---------------- fake card helpers (no real payment) ---------------- */
  function luhnOk(num) {
    var s = String(num).replace(/\D/g, ""), sum = 0, alt = false;
    if (s.length < 13) return false;
    for (var i = s.length - 1; i >= 0; i--) { var n = +s[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
    return sum % 10 === 0;
  }
  function randVisa() {
    var d = [4]; for (var i = 0; i < 14; i++) d.push(Math.floor(Math.random() * 10));
    var sum = 0; for (i = 0; i < 15; i++) { var n = d[14 - i]; if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } sum += n; }
    d.push((10 - (sum % 10)) % 10);
    return d.join("").replace(/(.{4})/g, "$1 ").trim();
  }
  var FIRST = ["NOURA", "SARA", "REEM", "LAMA", "HESSA", "MARAM", "DANA", "LUJAIN", "RAZAN", "ABEER", "AHMED", "MOHAMMED", "KHALID", "FAHAD", "ABDULLAH", "SULTAN", "SALMAN", "TURKI", "NASSER", "FAISAL", "OMAR", "YOUSEF"], LAST = ["ABDULLAH", "MOHAMMED", "SAEED", "ABDULRAHMAN", "IBRAHIM", "SALEH", "FAHAD", "ALI"];
  function randCard() {
    var yy = (new Date().getFullYear() % 100) + 1 + Math.floor(Math.random() * 4), mm = 1 + Math.floor(Math.random() * 12);
    return { num: randVisa(), name: FIRST[Math.floor(Math.random() * FIRST.length)], exp: (mm < 10 ? "0" : "") + mm + "/" + yy, cvv: String(100 + Math.floor(Math.random() * 900)) };
  }

  /* ---------------- paywall ---------------- */
  var overlay = null, state = null;
  function closePaywall() { if (overlay) { overlay.remove(); overlay = null; } state = null; document.removeEventListener("keydown", onKey, true); }
  function onKey(e) { if (e.key === "Escape" && overlay) { e.stopPropagation(); closePaywall(); } }
  function openSets(game) {
    if (overlay) return;
    var g = game || curGame || "mak";
    state = { step: "sets", game: g, page: 0, hub: !curGame };
    overlay = document.createElement("div"); overlay.className = "mp-back";
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closePaywall(); });
    overlay.addEventListener("click", onClick); overlay.addEventListener("input", onInput); overlay.addEventListener("submit", function (e) { e.preventDefault(); });
    document.body.appendChild(overlay); document.addEventListener("keydown", onKey, true);
    draw();
  }
  function startFromHome() { var b = document.querySelector("[data-act=homestart],[data-ui=homestart],[data-act=quick],[data-ui=quick],#h-start,[data-a=start]"); if (b) b.click(); }
  function openPaywall(game, plansFirst) {
    if (overlay) return;
    state = { step: plansFirst ? "plans" : "lock", game: game, plan: "month", err: "" };
    overlay = document.createElement("div"); overlay.className = "mp-back";
    overlay.addEventListener("click", function (e) { if (e.target === overlay && state && state.step !== "busy") closePaywall(); });
    overlay.addEventListener("click", onClick); overlay.addEventListener("input", onInput); overlay.addEventListener("submit", function (e) { e.preventDefault(); });
    document.body.appendChild(overlay); document.addEventListener("keydown", onKey, true);
    draw();
  }
  function draw() {
    if (!overlay) return;
    var s = state, h = "";
    if (s.step === "lock") {
      h = '<div class="lock" aria-hidden="true">🔒</div><h2>خلصت مجموعاتك المجانية</h2>' +
        "<p>لعبت المجموعات المجانية الثلاث من «" + esc(NAMES[s.game] || "") + "». اشترك وافتح كل مجموعات البنك.</p>" +
        '<p class="pdnote">الاشتراك الشهري ' + PLANS.month.price + ' ر.س — يعني <b>' + (19.99 / 30).toFixed(2) + ' ر.س باليوم</b> فقط</p>' +
        '<div class="row"><button class="b go" data-a="plans">اشترك ⭐</button></div><div class="row"><button class="b link" data-a="close">ليس الآن</button></div>';
    } else if (s.step === "plans") {
      var d = PLANS.day, m = PLANS.month, per = (19.99 / 30).toFixed(2), save = Math.round((1 - 19.99 / (9.99 * 30)) * 100);
      h = "<h2>اختر اشتراكك</h2><p>افتح كل الألعاب وكل المجموعات بدون حدود</p>" +
        '<div class="plans" role="radiogroup" aria-label="الاشتراك">' +
        '<button class="plan' + (s.plan === "day" ? " on" : "") + '" data-plan="day" role="radio" aria-checked="' + (s.plan === "day") + '"><span class="chk">' + (s.plan === "day" ? "✓" : "") + '</span><span class="nm">' + d.name + '</span><span class="pr">' + d.price + "<small>ر.س</small></span><span class=\"pd off\">" + d.price + " ر.س باليوم</span></button>" +
        '<button class="plan' + (s.plan === "month" ? " on" : "") + '" data-plan="month" role="radio" aria-checked="' + (s.plan === "month") + '"><span class="tag">⭐ الأكثر اختيارًا · وفّر ' + save + '٪</span><span class="chk">' + (s.plan === "month" ? "✓" : "") + '</span><span class="nm">' + m.name + '</span><span class="pr">' + m.price + "<small>ر.س</small></span><span class=\"pd\">يعني " + per + " ر.س باليوم فقط</span></button></div>" +
        '<div class="row"><button class="b go" data-a="card">متابعة — ' + PLANS[s.plan].name + " (" + PLANS[s.plan].price + " ر.س" + (s.plan === "month" ? " · " + (19.99 / 30).toFixed(2) + " باليوم" : "") + ")</button></div>" +
        '<div class="row"><button class="b link" data-a="close">ليس الآن</button></div>';
    } else if (s.step === "card") {
      h = "<h2>بيانات البطاقة</h2>" +
        '<div class="cardwrap"><div class="vcard" aria-hidden="true"><span class="vn" id="v-num">•••• •••• •••• ••••</span><span class="vr"><span id="v-name">CARD HOLDER</span><span id="v-exp">MM/YY</span></span><span class="vl">VISA</span></div>' +
        '<form id="mp-form" autocomplete="off" novalidate>' +
        '<label>رقم البطاقة<input id="f-num" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" autocomplete="off"></label>' +
        '<label>اسم حامل البطاقة<input id="f-name" maxlength="26" placeholder="NAME ON CARD" autocomplete="off"></label>' +
        '<div class="two"><label>تاريخ الانتهاء<input id="f-exp" inputmode="numeric" maxlength="5" placeholder="MM/YY" autocomplete="off"></label><label>CVV<input id="f-cvv" inputmode="numeric" maxlength="3" placeholder="123" autocomplete="off"></label></div>' +
        '<div class="err" id="mp-err" role="alert">' + esc(s.err) + "</div></form></div>" +
        '<div class="row"><button class="b go" data-a="pay">اشترك — ' + PLANS[s.plan].price + ' ر.س</button><button class="b hot" data-a="saved" type="button">💳 البطاقة المحفوظة</button><button class="b link" data-a="plans">رجوع</button></div>' +
'';
    } else if (s.step === "sets") {
      var list = setList(s.game), per = window.innerHeight < 560 ? 8 : 12, pages = Math.max(1, Math.ceil(list.length / per)); s.page = Math.min(s.page || 0, pages - 1);
      var shown = list.slice(s.page * per, s.page * per + per), done = list.filter(function (x) { return x.u >= x.n && x.n; }).length;
      h = "<h2>🎮 المجموعات</h2>" +
        '<div class="gchips">' + Object.keys(FILES).filter(function (g) { return !HUB_HIDDEN[g]; }).map(function (g) { return '<button class="gc' + (g === s.game ? " on" : "") + '" data-g="' + g + '" type="button">' + esc(NAMES[g]) + "</button>"; }).join("") + "</div>" +
        "<p>اختر المجموعة اللي تبي تبدأ منها (" + done + " من " + list.length + " انلعبت) — تفتح اللعبة وتضغط «ابدأ»</p>" +
        '<div class="tiles">' + shown.map(function (x) {
          var st = x.locked ? "🔒 بعد الاشتراك" : x.u >= x.n ? "✅ لعبتها" : x.u ? "🟡 " + x.u + "/" + x.n : "⚪ جديدة";
          return '<button class="st ' + (x.locked ? "lock" : x.u >= x.n ? "done" : x.u ? "part" : "") + '" data-k="' + x.k + '"><b>' + (x.k + 1) + "</b><small>" + st + "</small></button>";
        }).join("") + "</div>" +
        (pages > 1 ? '<div class="pg"><button data-a="pg" data-d="1" aria-label="التالي"' + (s.page >= pages - 1 ? " disabled" : "") + '>›</button><span>صفحة ' + (s.page + 1) + " من " + pages + '</span><button data-a="pg" data-d="-1" aria-label="السابق"' + (s.page <= 0 ? " disabled" : "") + ">‹</button></div>" : "") +
        '<div class="row"><button class="b link" data-a="reset">' + (s.arm && Date.now() - s.arm < 4000 ? "اضغط مرة ثانية للتأكيد" : "↺ تصفير السجل") + '</button><button class="b" data-a="close">إغلاق</button></div>';
    } else if (s.step === "busy") {
      h = '<div class="spin" aria-hidden="true"></div><h2>جاري إتمام الاشتراك…</h2><p>لحظات</p>';
    } else if (s.step === "done") {
      h = '<div class="ok" aria-hidden="true">✓</div><h2>تم الاشتراك بنجاح 🎉</h2><p class="dua">الله يكثر خيرك' + (s.arName ? " يا <b>" + esc(s.arName) + "</b>" : "") + " 🤍</p><p>" + esc(PLANS[s.plan].name) + " — صار البنك كامل مفتوح لك في كل الألعاب.</p>" +
        '<div class="row"><button class="b go" data-a="finish">يلا نلعب ▶</button></div>';
    }
    overlay.innerHTML = '<div class="mp" role="document" aria-live="polite">' + h + "</div>";
    var first = overlay.querySelector(".b.go, input"); if (first && s.step !== "card") { try { first.focus(); } catch (e) {} }
  }
  function fmtNum(v) { return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim(); }
  function fmtExp(v) { v = v.replace(/\D/g, "").slice(0, 4); return v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v; }
  function syncPreview() {
    var q = function (id) { var e = overlay.querySelector(id); return e ? e.value : ""; };
    var n = overlay.querySelector("#v-num"); if (!n) return;
    n.textContent = q("#f-num") || "•••• •••• •••• ••••"; overlay.querySelector("#v-name").textContent = (q("#f-name") || "CARD HOLDER").toUpperCase(); overlay.querySelector("#v-exp").textContent = q("#f-exp") || "MM/YY";
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === "f-num") t.value = fmtNum(t.value); else if (t.id === "f-exp") t.value = fmtExp(t.value); else if (t.id === "f-cvv") t.value = t.value.replace(/\D/g, "").slice(0, 3); else if (t.id === "f-name") t.value = t.value.replace(/[^A-Za-z\u0600-\u06FF .'-]/g, "").toUpperCase();
    syncPreview();
  }
  function validate() {
    var v = function (id) { return overlay.querySelector(id).value.trim(); };
    if (!luhnOk(v("#f-num")) || v("#f-num").replace(/\D/g, "").length !== 16) return "رقم البطاقة غير صحيح";
    if (v("#f-name").length < 3) return "اكتب اسم حامل البطاقة";
    var m = /^(\d\d)\/(\d\d)$/.exec(v("#f-exp"));
    if (!m || +m[1] < 1 || +m[1] > 12) return "تاريخ الانتهاء غير صحيح";
    var now = new Date(), yy = now.getFullYear() % 100, mm = now.getMonth() + 1;
    if (+m[2] < yy || (+m[2] === yy && +m[1] < mm)) return "البطاقة منتهية";
    if (!/^\d{3}$/.test(v("#f-cvv"))) return "رمز CVV من 3 أرقام";
    return "";
  }
  function onClick(e) {
    var p = e.target.closest("[data-plan]"); if (p && state.step === "plans") { state.plan = p.getAttribute("data-plan"); draw(); return; }
    var gb = e.target.closest(".gc[data-g]");
    if (gb && state && state.step === "sets") { state.game = gb.getAttribute("data-g"); state.page = 0; state.arm = 0; draw(); return; }
    var tk = e.target.closest("[data-k]");
    if (tk && state && state.step === "sets") {
      var k = +tk.getAttribute("data-k"), item = setList(state.game).filter(function (x) { return x.k === k; })[0];
      if (item && item.locked) { state.plan = state.plan || "month"; state.step = "plans"; draw(); return; }
      var gk = state.game; choose(gk, k); closePaywall();
      setTimeout(function () { var a = document.querySelector('a.game[data-g="' + gk + '"]'); if (a) a.click(); else startFromHome(); }, 30); return;
    }
    var b = e.target.closest("[data-a]"); if (!b || !state) return;
    var a = b.getAttribute("data-a");
    if (a === "pg") { state.page = Math.max(0, state.page + (+b.getAttribute("data-d"))); draw(); return; }
    if (a === "reset") {
      if (state.arm && Date.now() - state.arm < 4000) { resetHistory(state.game); var m = meta[state.game]; if (m) m.used = []; state.arm = 0; draw(); }
      else { state.arm = Date.now(); draw(); }
      return;
    }
    if (a === "close") closePaywall();
    else if (a === "plans") { state.step = "plans"; draw(); }
    else if (a === "card") { state.step = "card"; state.err = ""; draw(); var f = overlay.querySelector("#f-num"); if (f) f.focus(); }
    else if (a === "saved") {
      var c = randCard(); overlay.querySelector("#f-num").value = c.num; overlay.querySelector("#f-name").value = c.name; overlay.querySelector("#f-exp").value = c.exp; overlay.querySelector("#f-cvv").value = c.cvv;
      overlay.querySelector("#mp-err").textContent = ""; syncPreview();
    } else if (a === "pay") {
      var er = validate(); if (er) { overlay.querySelector("#mp-err").textContent = er; return; }
      var holder = overlay.querySelector("#f-name").value.trim();
      state.step = "busy"; draw();
      setTimeout(function () { if (!overlay) return; subscribe(state.plan, holder); state.arName = arabicName(String(holder).trim().split(/\s+/)[0]); state.step = "done"; draw(); }, 1700);
    } else if (a === "finish") closePaywall();
  }

  /* ---------------- public API ---------------- */
  window.MAJLIS_PASS = {
    FREE_SETS: FREE_SETS, freeRounds: freeRounds, SIZE: SIZE, PLANS: PLANS, NAMES: NAMES,
    isSub: isSub, sub: sub, subscribe: subscribe, unsubscribe: unsubscribe, gate: gate, freeUsed: freeUsed,
    sets: sets, setsInfo: setsInfo, openPaywall: openPaywall, openSets: openSets, takeScope: takeScope, scoped: scoped, arabicName: arabicName, luhnOk: luhnOk, randCard: randCard,
    onChange: function (f) { listeners.push(f); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { new MutationObserver(queuePlace).observe(document.body, { childList: true, subtree: true }); queuePlace(); });
  else new MutationObserver(queuePlace).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", queuePlace);
  window.addEventListener("storage", function (e) { if (e.key === SUB_KEY || e.key === FREE_KEY || e.key === SETS_KEY) { queuePlace(); changed(); } });
})();
