/* «حروف وألوف» — شاشة التلفزيون: الإعدادات، الغرفة (QR)، اللوحة السداسية، الأسئلة، الأجراس، الاحتفال.
   المنطق في hurouf-game.js والمحرك في hurouf-engine.js؛ هذا الملف للعرض والتحكم فقط. */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  if (qs.has("room")) return; // هذه الصفحة جوّال لاعب → hurouf-phone.js
  var D = window.HU_DATA, E = window.HU_ENGINE, G = window.HU_GAME, A = window.HU_AUDIO, Net = window.WshNet;
  function tc(hex) { var h = String(hex).replace("#", ""), r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111827" : "#ffffff"; }
  function deep(hex) { var h = String(hex).replace("#", ""), f = function (i) { return Math.round(parseInt(h.substr(i, 2), 16) * 0.68).toString(16).padStart(2, "0"); }; return "#" + f(0) + f(2) + f(4); }
  function cs(hex) { return "--c:" + hex + ";--cd:" + deep(hex) + ";--tc:" + tc(hex); }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var K = { settings: "hu_settings_v1", match: "hu_match_v1", used: "hu_used_v1", stats: "hu_stats_v1" };
  var COLORS = ["#3B82F6", "#F97316", "#10B981", "#EC4899", "#A855F7", "#EF4444", "#EAB308", "#14B8A6"];
  var CATS = D.cats;
  var DEF = {
    teams: [{ name: "الأزرق", color: "#3B82F6", players: 2 }, { name: "البرتقالي", color: "#F97316", players: 2 }],
    n: 5, target: 2, level: "mixed", cats: [], time: 10, final7: true, sound: true, mode: "device", judge: "auto"
  };
  var settings = Object.assign({}, DEF, Store.get(K.settings, {}) || {});
  (function () { var P = window.MAJLIS_PREFS && MAJLIS_PREFS(); if (!P) return; var pick = function (k, m) { return m[P[k]]; }; if (P.teams && settings.teams) { settings.teams = settings.teams.map(function (t, i) { return i < 2 ? Object.assign({}, t, { name: P.teams[i] }) : t; }); } settings.level = pick("level", { easy: "medium", mix: "mixed", hard: "hard" }); settings.target = pick("length", { short: 1, normal: 2, long: 3 }); settings.time = pick("time", { fast: 7, normal: 10, slow: 15 }); })(); // إعدادات المجلس
  (function () { var FT = window.MAJLIS_FAM_TEAMS && MAJLIS_FAM_TEAMS(); if (FT && settings.teams && settings.teams.length >= 2) { settings.teams = settings.teams.map(function (t, i) { return i < 2 ? Object.assign({}, t, { name: FT[i] }) : t; }); } })(); // فرق جولة العائلة (أول فريقين)
  (function sanitize() {
    if (!Array.isArray(settings.teams) || settings.teams.length !== 2) settings.teams = DEF.teams.map(function (t) { return Object.assign({}, t); });
    settings.teams = settings.teams.map(function (t, i) { t = t || {}; return { name: String(t.name || DEF.teams[i].name).slice(0, 16), color: COLORS.indexOf(t.color) >= 0 ? t.color : DEF.teams[i].color, players: Math.min(6, Math.max(1, +t.players || 2)) }; });
    if (settings.teams[0].color === settings.teams[1].color) settings.teams[1].color = COLORS.filter(function (c) { return c !== settings.teams[0].color; })[0];
    if ([4, 5, 6].indexOf(+settings.n) < 0) settings.n = 5; settings.n = +settings.n;
    if ([1, 2, 3].indexOf(+settings.target) < 0) settings.target = 2; settings.target = +settings.target;
    if (["medium", "hard", "mixed"].indexOf(settings.level) < 0) settings.level = "mixed";
    if ([5, 10, 15, 20].indexOf(+settings.time) < 0) settings.time = 10; settings.time = +settings.time;
    if (!Array.isArray(settings.cats)) settings.cats = []; settings.cats = settings.cats.filter(function (c) { return CATS[c]; });
    var gm = null; try { gm = localStorage.getItem("majlis_mode"); } catch (e) {} if (gm) settings.mode = gm;
    settings.mode = settings.mode === "phones" ? "phones" : "device"; settings.judge = settings.judge === "host" ? "host" : "auto";
    settings.final7 = settings.final7 !== false; settings.sound = settings.sound !== false;
  })();
  function saveSettings() { Store.set(K.settings, settings); }
  A.enable(settings.sound);

  var view = "home", M = null, modal = null, setupErr = "", selCell = -1, room = null, net = null, netStatus = "connecting", roster = {};
  var lastTs = Date.now();

  /* ---------- الأسئلة المستخدمة (تدور حتى تُستنفد ثم تبدأ من جديد) ---------- */
  function loadUsed() { var a = Store.get(K.used, []), o = {}; if (Array.isArray(a)) a.forEach(function (id) { o[id] = 1; }); return o; }
  function saveUsed() { if (M) Store.set(K.used, Object.keys(M.used)); }

  /* ---------- المباراة ---------- */
  function ctxSettings() { return { n: settings.n, time: settings.time, level: settings.level, cats: settings.cats, target: settings.target, final7: settings.final7 }; }
  function hooks() {
    return {
      sfx: function (name) { A.play(name, M && M.state.cur && M.state.cur.buzz ? M.state.cur.buzz.team : 0); if (name === "win" || name === "champion") celebrate(); },
      save: saveMatch, emit: function () { render(); broadcast(); }, emitTime: updateTime
    };
  }
  function saveMatch() { if (!M) return; saveUsed(); Store.set(K.match, { state: M.state, settings: ctxSettings(), teams: settings.teams, mode: settings.mode, judge: settings.judge, room: room }); }
  function startMatch(resume) {
    var saved = resume ? Store.get(K.match, null) : null;
    var data = D;
    // لو الأسئلة المتاحة قاربت على الانتهاء ابدأ دورة جديدة
    var used = loadUsed(); var left = 0; Object.keys(data.questions).forEach(function (l) { data.questions[l].forEach(function (q) { if (!used[q.id]) left++; }); });
    if (left < 140) used = {};
    var s = ctxSettings();
    if (saved && saved.state && saved.settings) { s = saved.settings; if (saved.teams) settings.teams = saved.teams; settings.mode = saved.mode || settings.mode; settings.judge = saved.judge || settings.judge; }
    M = G.Match(s, data, hooks(), { state: saved && saved.state ? saved.state : null, used: used });
    view = "play"; selCell = -1; modal = null;
    if (!resume) { A.play("intro"); saveMatch(); }
    render(); broadcast();
  }

  var tickT = setInterval(function () {
    var t = Date.now(), dt = Math.min(500, t - lastTs); lastTs = t;
    if (M && view === "play") M.tick(dt);
  }, 100);

  /* ---------- الغرفة والجوالات ---------- */
  function newCode() { return "8" + String(10000 + Math.floor(Math.random() * 90000)); }
  function joinUrl() {
    var base = location.origin && location.origin !== "null" ? location.origin + location.pathname : location.href.split("?")[0].split("#")[0];
    var ps = qs.get("ps"), local = qs.get("local");
    return base + "?room=" + room + (ps ? "&ps=" + encodeURIComponent(ps) : "") + (local ? "&local=1" : "");
  }
  function qrSvg(text) { try { var q = window.qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (e) { return ""; } }
  function startNet() {
    if (net) { try { net.close(); } catch (e) {} net = null; }
    if (settings.mode !== "phones" || !Net) return;
    if (!room) { room = Store.get("hu_room_v1", null) || newCode(); Store.set("hu_room_v1", room); }
    net = Net.host(room, { onMsg: onPhone, onStatus: function (st) { netStatus = st; var el = $("#net"); if (el) el.textContent = netText(); }, onConflict: function () { room = newCode(); Store.set("hu_room_v1", room); roster = {}; startNet(); render(); } });
  }
  function netText() { return { online: "🟢 الغرفة جاهزة", connecting: "🟡 جاري تجهيز الغرفة… (تأكد أن التلفزيون متصل بالإنترنت)", local: "🔵 وضع محلي" }[netStatus] || "🟡 …"; }
  function rosterList(team) { return Object.keys(roster).map(function (k) { return roster[k]; }).filter(function (p) { return p.role === "player" && p.team === team; }); }
  function presenter() { var k = Object.keys(roster).filter(function (x) { return roster[x].role === "host"; })[0]; return k ? roster[k] : null; }
  function onPhone(pid, m) {
    if (!m || !m.t) return;
    var p = roster[pid];
    if (m.t === "hello") {
      var name = String(m.name || "").trim().slice(0, 14) || "لاعب", role = m.role === "host" ? "host" : "player", team = m.team === 1 ? 1 : 0;
      if (role === "player" && rosterList(team).length >= 8 && !p) { net.send(pid, { t: "full" }); return; }
      // المقدم يشوف الأجوبة: مقدم واحد فقط، وبس لو التحكيم «المقدم» — غيره يُرفض (يقدر التلفزيون يغيّره من شاشة الربط)
      if (role === "host") { var cur = presenter(); if (settings.judge !== "host" || (cur && cur.pid !== pid && cur.online)) { net.send(pid, { t: "nohost", why: settings.judge !== "host" ? "off" : "taken" }); return; } }
      roster[pid] = { pid: pid, name: name, team: team, role: role, seen: Date.now(), online: true };
      if (view === "lobby" || view === "play") render();
      sendTo(pid); return;
    }
    if (!p) { net.send(pid, { t: "who" }); return; }
    p.seen = Date.now(); p.online = true;
    if (m.t === "ping") { sendTo(pid); return; }
    if (!M || view !== "play") { sendTo(pid); return; }
    if (m.t === "buzz" && p.role === "player") {
      var res = M.buzz(p.team, pid, p.name); net.send(pid, { t: "ack", res: res });
      if (res === "early") A.play("wrong");
    } else if (m.t === "type" && p.role === "player") {
      var c = M.state.cur;
      if (c && c.buzz && c.buzz.pid === pid && (M.state.phase === "answering")) {
        var okm = E.matches(String(m.text || "").slice(0, 60), c.q); c.typed = { text: String(m.text || "").slice(0, 60), ok: okm };
        if (okm && settings.judge === "auto") M.reveal(); else { saveMatch(); render(); broadcast(); }
      }
    } else if (m.t === "done" && p.role === "player") {
      var cd = M.state.cur; if (cd && cd.buzz && cd.buzz.pid === pid && M.state.phase === "answering") M.reveal();
    } else if (m.t === "peek" && p.role === "player") {
      var cp = M.state.cur; if (cp && cp.buzz && cp.buzz.pid === pid && M.state.phase === "judge") { cp.peek = pid; saveMatch(); sendTo(pid); }
    } else if (m.t === "selfjudge" && p.role === "player") {
      var cj = M.state.cur; if (cj && cj.buzz && cj.buzz.pid === pid && cj.peek === pid && M.state.phase === "judge") M.judge(!!m.ok);
    } else if (m.t === "cmd" && p.role === "host") cmd(m.c);
  }
  function cmd(c) {
    if (!M) return;
    if (c === "correct") M.judge(true); else if (c === "wrong") M.judge(false); else if (c === "reveal") M.reveal(); else if (c === "skip") M.skip();
    else if (c === "pause") M.pause(); else if (c === "next") M.next();
  }
  function viewFor(p) {
    var s = M.state, cur = s.cur, T = settings.teams, v = { t: "state", phase: s.phase, round: s.round, turn: s.turn, decider: s.decider, paused: s.paused,
      names: [T[0].name, T[1].name], colors: [T[0].color, T[1].color], wins: s.wins, role: p.role, team: p.team, you: p.name, target: M.settings.target, room: room };
    if (cur) {
      v.letter = cur.idx >= 0 ? s.board[cur.idx].l : (cur.letter || "؟");
      v.tried = cur.tried; v.buzz = cur.buzz ? { team: cur.buzz.team, name: cur.buzz.name, rival: !!cur.buzz.rival, mine: cur.buzz.pid === p.pid } : null; v.note = cur.note || "";
      v.canBuzz = s.phase === "open" && p.role === "player" && cur.tried.indexOf(p.team) < 0;
      v.left = Math.max(0, s.timeLeft); v.total = (s.decider && M.settings.final7 ? 7 : M.settings.time) * 1000;
      v.canType = p.role === "player" && s.phase === "answering" && cur.buzz && cur.buzz.pid === p.pid;
      if (cur.typed && cur.buzz && cur.buzz.pid === p.pid) v.typed = cur.typed;
      if (p.role === "host") { v.q = cur.q.q; v.a = cur.q.a; v.typedHint = cur.typed || null; }
      else if (cur.peek === p.pid && s.phase === "judge") { v.a = cur.q.a; v.selfJudge = true; }
      v.canDone = p.role === "player" && s.phase === "answering" && !!cur.buzz && cur.buzz.pid === p.pid;
      v.canPeek = p.role === "player" && s.phase === "judge" && !!cur.buzz && cur.buzz.pid === p.pid && cur.peek !== p.pid;
      if (cur.result) v.result = { ok: !!cur.result.ok, team: cur.result.team };
    }
    return v;
  }
  function sendTo(pid) { if (!net || !M) return; var p = roster[pid]; if (!p) return; try { net.send(pid, viewFor(p)); } catch (e) {} }
  var bcT = 0;
  function broadcast() { if (!net || !M) return; Object.keys(roster).forEach(sendTo); }
  setInterval(function () { // مراقبة الاتصال: من لم يرسل نبضة منذ 12 ثانية يظهر كغير متصل
    var ch = false, t = Date.now(); Object.keys(roster).forEach(function (k) { var on = t - roster[k].seen < 12000; if (roster[k].online !== on) { roster[k].online = on; ch = true; } });
    if (ch && view === "lobby") render();
    if (M && net && view === "play") broadcast();
  }, 4000);

  /* ---------- إعدادات: تعديل ---------- */
  function setTeam(i, patch) { Object.assign(settings.teams[i], patch); sanitizeTeams(); saveSettings(); render(); }
  function sanitizeTeams() { if (settings.teams[0].color === settings.teams[1].color) settings.teams[1].color = COLORS.filter(function (c) { return c !== settings.teams[0].color; })[0]; }

  /* ---------- العرض ---------- */
  var app = $("#app");
  function teamNames() { return settings.teams.map(function (t) { return t.name; }); }
  function fmtNames(i) { return esc(settings.teams[i].name); }
  function lastResult() { var s = Store.get(K.stats, []); return Array.isArray(s) && s.length ? s[s.length - 1] : null; }

  function vHome() {
    var saved = Store.get(K.match, null), can = saved && saved.state && saved.state.phase && saved.state.phase !== "matchwin", lr = lastResult();
    return '<section class="screen home"><div class="emoji-row" aria-hidden="true"><span>🔔</span><span>🔤</span><span>🏆</span></div>' +
      '<h1 class="logo">حروف وألوف<small>مسابقة العائلة على التلفزيون</small></h1>' +
      '<p class="sub">فريقان، لوحة من الحروف، وأجراس! أجيبوا بسرعة واربطوا جانبي اللوحة قبل المنافس.</p>' +
      '<div class="stack">' + (can ? '<button class="btn gold huge" data-a="resume">كمّل المباراة (الجولة ' + saved.state.round + ")</button>" : "") +
      '<button class="btn ' + (can ? "" : "go ") + 'huge" data-a="start">ابدأ اللعب 🎮</button>' +
      '<div class="row"><button class="btn big ghost" data-a="trial">تجربة سريعة</button><button class="btn big ghost" data-a="howto">طريقة اللعب</button></div>' +
      '<button class="btn big" data-a="setup">الإعدادات</button>' +
      (lr ? '<p class="sub">آخر مباراة: <b>' + esc(lr.a) + "</b> " + lr.sa + " – " + lr.sb + " <b>" + esc(lr.b) + "</b></p>" : "") + "</div></section>";
  }

  function chips(list, cur, a, label) { return '<div class="chips">' + list.map(function (v) { return '<button class="chip" data-a="' + a + '" data-v="' + v[0] + '" aria-pressed="' + (String(cur) === String(v[0])) + '">' + v[1] + "</button>"; }).join("") + "</div>"; }
  function toggle(a, on, title, note) { return '<button class="toggle" data-a="' + a + '" aria-pressed="' + on + '"><i>' + (on ? "✓" : "") + "</i><span><b>" + title + "</b><small>" + note + "</small></span></button>"; }
  function summaryText() {
    var s = settings, lv = { medium: "متوسط", hard: "صعب", mixed: "مختلط" }[s.level];
    return esc(s.teams[0].name) + " ضد " + esc(s.teams[1].name) + " · لوحة " + s.n + "×" + s.n + " · الفوز بـ " + s.target + " " + (s.target === 1 ? "جولة" : "جولات") + " · أسئلة " + lv + " · " + s.time + " ثانية · " + (s.mode === "phones" ? "بالجوالات" : "جهاز واحد") + (s.cats.length ? " · " + s.cats.length + " تصنيفات" : " · كل التصنيفات");
  }
  function vSetup() {
    var s = settings, teams = s.teams.map(function (t, i) {
      var sw = COLORS.map(function (c) { return '<button class="sw" style="--c:' + c + '" data-a="color" data-t="' + i + '" data-v="' + c + '" aria-pressed="' + (t.color === c) + '" aria-label="لون"' + (s.teams[1 - i].color === c ? " disabled" : "") + "></button>"; }).join("");
      return '<div class="tcard" style="' + cs(t.color) + '"><div class="tbar"></div><span class="lbl">الفريق ' + (i === 0 ? "الأول — يربط اليمين باليسار ↔" : "الثاني — يربط الأعلى بالأسفل ↕") + '</span><input data-name="' + i + '" maxlength="16" value="' + esc(t.name) + '" aria-label="اسم الفريق">' +
        '<div class="swatches">' + sw + '</div><div class="row" style="justify-content:flex-start"><span class="lbl">عدد اللاعبين</span><span class="stepper"><button class="btn sm" data-a="pl-" data-t="' + i + '">−</button><output>' + t.players + '</output><button class="btn sm" data-a="pl+" data-t="' + i + '">+</button></span></div></div>';
    }).join("");
    var cats = '<button class="chip" data-a="cat-all" aria-pressed="' + (s.cats.length === 0) + '">كل التصنيفات</button>' + Object.keys(CATS).map(function (c) { return '<button class="chip" data-a="cat" data-v="' + c + '" aria-pressed="' + (s.cats.indexOf(c) >= 0) + '">' + esc(CATS[c]) + "</button>"; }).join("");
    return '<section class="screen"><div class="head"><h2>إعداد المباراة</h2><button class="btn" data-a="home">→ رجوع</button></div>' +
      '<div class="setup"><div class="col"><div class="panel field"><span class="sec-t">الفريقان</span>' + teams + "</div></div>" +
      '<div class="col"><div class="panel field"><span class="sec-t">اللوحة والقواعد</span><span class="lbl">حجم اللوحة</span>' + chips([[4, "4×4"], [5, "5×5"], [6, "6×6"]], s.n, "n") +
      '<span class="lbl">الفوز بالمباراة بـ</span>' + chips([[1, "جولة واحدة"], [2, "جولتين"], [3, "3 جولات"]], s.target, "target") +
      '<span class="lbl">مستوى الأسئلة</span>' + chips([["medium", "متوسط"], ["hard", "صعب"], ["mixed", "مختلط"]], s.level, "level") +
      '<span class="lbl">وقت الإجابة</span>' + chips([[5, "5 ث"], [10, "10 ث"], [15, "15 ث"], [20, "20 ث"]], s.time, "time") + "</div></div>" +
      '<div class="col"><div class="panel field"><span class="sec-t">الطريقة والتصنيفات</span><span class="lbl">طريقة اللعب</span>' + chips([["device", "🖥️ جهاز واحد (أزرار الشاشة)"], ["phones", "📱 بجوالات اللاعبين"]], s.mode, "mode") +
      '<span class="lbl">التحكيم</span>' + chips([["auto", "تلقائي — الإجابة مخفية، الحكم يطّلع مطولاً"], ["host", "🎤 مقدم من جواله"]], s.judge, "judge") +
      '<span class="lbl">التصنيفات</span><div class="chips">' + cats + "</div>" +
      toggle("sound", s.sound, "المؤثرات الصوتية", "أجراس وأصوات النجاح والخطأ") + toggle("final7", s.final7, "الحسم 7 ثوانٍ", "عند اقتراب الفوز يقصر الوقت وتصعب الأسئلة") + "</div></div></div>" +
      (setupErr ? '<p class="empty" style="color:#b91c1c;text-align:center">' + esc(setupErr) + "</p>" : "") +
      '<div class="setup-foot"><button class="btn go huge" data-a="play">' + (s.mode === "phones" ? "التالي: ربط الجوالات ▶" : "ابدأ المباراة ▶") + '</button><span class="summary">' + summaryText() + "</span></div></section>";
  }

  function vLobby() {
    var url = joinUrl(), T = settings.teams, ok = rosterList(0).length > 0 && rosterList(1).length > 0, pr = presenter();
    var cols = [0, 1].map(function (i) {
      var l = rosterList(i);
      return '<div class="rcol" style="' + cs(T[i].color) + '"><h3>' + esc(T[i].name) + '</h3>' + (l.length ? l.map(function (p) { return '<div class="who' + (p.online ? "" : " off") + '">' + esc(p.name) + "</div>"; }).join("") : '<p class="empty">بانتظار اللاعبين…</p>') + "</div>";
    }).join("");
    return '<section class="screen"><div class="head"><h2>ربط الجوالات</h2><button class="btn" data-a="setup">→ رجوع</button></div>' +
      '<div class="lobby"><div class="panel join"><div class="qr">' + qrSvg(url) + '</div><p class="lbl">امسحوا الرمز بالجوال واختاروا فريقكم</p><div class="code" aria-label="رمز الغرفة">' + room.split("").map(function (c) { return "<i>" + c + "</i>"; }).join("") + '</div><p class="url">' + esc(url) + '</p><p id="net" class="lbl">' + netText() + "</p>" +
      (settings.judge === "host" ? '<p class="lbl">🎤 المقدم: ' + (pr ? esc(pr.name) + ' ✓ <button class="btn sm" data-a="kickhost">تغيير</button>' : "يدخل من نفس الرابط ويختار «أنا المقدم» (مقدم واحد فقط)") + "</p>" : "") + "</div>" +
      '<div class="roster">' + cols + "</div></div>" +
      '<div class="setup-foot"><button class="btn go huge" data-a="start-phones"' + (ok ? "" : " disabled") + '>ابدأ المباراة ▶</button><button class="btn big" data-a="start-nophones">بدون جوالات (أزرار الشاشة)</button></div></section>';
  }

  /* ---------- اللوحة ---------- */
  function boardHtml(s) {
    var n = M.settings.n, T = settings.teams, h = "", i, k;
    // الإطار: خلايا بلون الفريق على الجوانب (الأول يمين↔يسار، الثاني أعلى↕أسفل)
    function frame(r, c, team) { return '<span class="hx frame" data-r="' + r + '" data-c="' + c + '" style="' + cs(T[team].color) + '" aria-hidden="true"><span class="edge"></span><span class="face"></span></span>'; }
    for (i = 0; i < n; i++) { h += frame(i, -1, 0) + frame(i, n, 0) + frame(-1, i, 1) + frame(n, i, 1); }
    s.board.forEach(function (c, i) {
      var cls = "hx" + (c.o === -1 ? (c.dead || !E.hasQuestion(D, c.l, M.used) ? " dead" : " free") : " o" + c.o) + (s.cur && s.cur.idx === i && s.phase !== "roundwin" && s.phase !== "matchwin" ? " cur" : "") + (selCell === i && c.o === -1 ? " sel" : "") + (s.winPath && s.winPath.indexOf(i) >= 0 ? " won" : "");
      var style = c.o >= 0 ? cs(T[c.o].color) : "";
      var free = c.o === -1 && !c.dead && E.hasQuestion(D, c.l, M.used);
      h += '<button class="' + cls + '" data-i="' + i + '" data-r="' + Math.floor(i / n) + '" data-c="' + (i % n) + '" style="' + style + '" ' + (free && s.phase === "board" ? "" : "tabindex=-1 ") + 'aria-label="حرف ' + c.l + '"><span class="edge"></span><span class="face"><span class="ch">' + c.l + "</span></span></button>";
    });
    return '<div id="board" data-n="' + n + '">' + h + '<svg class="winline" id="winline"></svg></div>';
  }
  function layoutBoard() {
    var b = $("#board"), st = $(".stage"); if (!b || !st) return;
    var n = +b.getAttribute("data-n"), aw = st.clientWidth - 8, ah = (st.clientHeight - 8) * (st.classList.contains("winning") ? .68 : 1);
    var w = Math.max(24, Math.min(aw / (1.5 * n + 1.5), ah / (((n + 1) * .75 + 1) * 1.1547)));
    var h = w * 1.1547, W = w * (1.5 * n + 1.5), H = ((n + 1) * .75 + 1) * h;
    b.style.setProperty("--w", w + "px"); b.style.width = W + "px"; b.style.height = H + "px";
    function cx(r, c) { return w * 1.5 + c * w + r * w / 2; } function cy(r) { return h / 2 + (r + 1) * .75 * h; }
    [].forEach.call(b.querySelectorAll(".hx"), function (el) { var r = +el.getAttribute("data-r"), c = +el.getAttribute("data-c"); el.style.left = (cx(r, c) - w / 2) + "px"; el.style.top = (cy(r) - h / 2) + "px"; });
    var s = M.state, wl = $("#winline"); wl.setAttribute("viewBox", "0 0 " + W + " " + H); wl.setAttribute("width", W); wl.setAttribute("height", H);
    if (s.winPath) wl.innerHTML = '<polyline points="' + s.winPath.map(function (i) { var rr = Math.floor(i / n), cc = i % n; return cx(rr, cc).toFixed(1) + "," + cy(rr).toFixed(1); }).join(" ") + '"/>'; else wl.innerHTML = "";
  }

  function teamCard(i, s) {
    var T = settings.teams[i], cells = s.board.filter(function (c) { return c.o === i; }).length, near = M.rem(i) <= 1 && s.phase !== "roundwin" && s.phase !== "matchwin";
    var pips = ""; for (var k = 0; k < M.settings.target; k++) pips += '<i class="' + (k < s.wins[i] ? "on" : "") + '"></i>';
    var turn = s.turn === i && (s.phase === "board");
    return '<div class="team' + (turn ? " turn" : "") + (near ? " near" : "") + '" style="' + cs(T.color) + '"><div><div class="nm">' + esc(T.name) + '</div><div class="meta">' + (i === 0 ? "↔ اليمين واليسار" : "↕ الأعلى والأسفل") + (near ? " · 🔥 قريب من الفوز" : "") + '</div><div class="pips" title="الجولات">' + pips + '</div></div><div class="num" title="الخلايا">' + cells + "</div></div>";
  }
  function timerHtml(s) {
    var tot = (s.decider && M.settings.final7 ? 7 : M.settings.time) * 1000, p = s.timeLeft / tot, c = s.cur && s.cur.buzz ? settings.teams[s.cur.buzz.team].color : "#22c55e";
    return '<div class="timer' + (s.timeLeft <= 3000 ? " warn" : "") + '" id="timer" style="--p:' + Math.max(0, p).toFixed(3) + ";--c:" + c + '"><b id="tnum">' + Math.ceil(s.timeLeft / 1000) + "</b></div>";
  }
  function bellButtons(s) {
    var T = settings.teams, tried = s.cur ? s.cur.tried : [];
    return '<div class="bells">' + [0, 1].map(function (i) { return '<button class="bell-btn" style="' + cs(T[i].color) + '" data-a="bell" data-t="' + i + '"' + (tried.indexOf(i) >= 0 ? " disabled" : "") + '>🔔 ' + esc(T[i].name) + "</button>"; }).join("") + "</div>";
  }
  function questionHtml(s) {
    var c = s.cur, T = settings.teams, cell = c.idx >= 0 ? s.board[c.idx] : null, letter = cell ? cell.l : (c.letter || "؟"), buzz = c.buzz, ph = s.phase, host = settings.judge === "host";
    var body = '<span class="cat">' + esc(CATS[c.q.c] || "") + (s.decider ? " · 🔥 الحسم" : "") + (c.tiebreak ? " · سؤال فاصل ⚖️" : "") + '</span><div class="qt">' + esc(c.q.q) + '</div><div class="hint">الإجابة تبدأ بحرف «<b>' + letter + "</b>»</div>";
    var side = "", ctl = "";
    if (ph === "ready") { side = '<div class="waiting">جاهزين… 🔔</div>'; body += '<div class="hint">الأجراس تفتح بعد لحظة — الضغط المبكر يقفل صاحبه ثانية ونصف</div>'; }
    else if (ph === "open") {
      var left = Math.max(0, Math.ceil(s.openLeft / 1000));
      side = '<div class="waiting">الجرس مفتوح! <span id="openleft">' + left + "</span></div>";
      body += bellButtons(s) + (c.tried.length ? '<div class="hint">المنافس لديه فرصة الجرس الآن</div>' : "");
      ctl = '<div class="qctl"><button class="btn sm" data-a="skip">⏭ سؤال بديل</button><button class="btn sm" data-a="pause">' + (s.paused ? "▶" : "⏸") + "</button></div>";
    } else if (ph === "answering" || ph === "judge") {
      var tm = settings.teams[buzz.team];
      body += '<div class="buzzed" style="' + cs(tm.color) + '"><span class="bell">🔔</span><span>' + (buzz.name ? esc(buzz.name) + " — " : "") + esc(tm.name) + "</span></div>" + (c.note ? '<div class="waiting">' + esc(c.note) + "</div>" : "");
      if (c.typed) body += '<div class="hint">⌨️ كتب: «' + esc(c.typed.text) + '» ' + (c.typed.ok ? "✅ مطابقة للإجابة" : "❌ لا تطابق الإجابة المعتمدة") + "</div>";
      if (ph === "answering") { side = timerHtml(s); ctl = '<div class="qctl"><button class="btn gold big" data-a="reveal">✔ انتهت إجابتنا — حكّموا</button><button class="btn sm" data-a="skip">⏭ تخطي</button><button class="btn sm" data-a="pause">' + (s.paused ? "▶ استئناف" : "⏸ إيقاف") + "</button></div>"; }
      else {
        // الإجابة لا تظهر على الشاشة هنا (المنافس قد يكون له دور بعدها): المقدم يراها على جواله، أو اللاعب على جواله، أو «اضغط مطولاً» للحكم
        var phones = settings.mode === "phones";
        body += '<div class="ans peek" id="peekans" hidden><small>الإجابة (للحكم فقط)</small>•••</div><div class="hint">🔒 الإجابة مخفية عن الفريق الآخر' + (host ? " — عند المقدم فقط" : phones ? " — يكشفها اللاعب على جواله فقط" : " — للحكم فقط: اضغط مطولاً على زر الاطلاع") + "</div>";
        ctl = host ? '<p class="waiting">🎤 بانتظار قرار المقدم…</p>' : '<div class="qctl"><button class="btn good huge" data-a="ok">✔ صحيحة</button><button class="btn bad huge" data-a="no">✘ خاطئة</button>' + (phones ? "" : '<button class="btn big" data-peek="1">👁 اطّلع (اضغط مطولاً)</button>') + "</div>";
      }
    } else if (ph === "result") {
      var r = c.result;
      body += '<div class="ans"><small>الإجابة</small>' + esc(c.q.a) + "</div>";
      if (r.ok) body += '<div class="result-msg ok">✔ صحيحة! ' + (c.tiebreak ? "" : "الخلية لـ " + esc(T[r.team].name)) + "</div>";
      else body += '<div class="result-msg no">' + (r.why === "nobody" ? "ما أحد ضغط الجرس" : r.why === "revealed" ? "تم كشف الإجابة" : "ما أحد أجاب صح") + " — الخلية تبقى مفتوحة</div>";
      ctl = '<div class="qctl"><button class="btn go big" data-a="next">التالي ▶</button></div>';
    }
    return '<div class="q-back"><div class="q" style="--c:' + (buzz ? T[buzz.team].color : "var(--line)") + '"><div class="bigl"><b>' + letter + '</b></div><div class="body">' + body + '</div><div class="side">' + side + "</div></div>" +
      "<div>" + ctl + "</div></div>";
  }
  function winHtml(s) {
    var T = settings.teams, t = s.winTeam, match = s.phase === "matchwin", color = T[t].color;
    var how = s.winPath ? "ربطوا جانبي اللوحة بمسار متصل!" : "حُسمت الجولة بالأقرب للفوز";
    var c0 = s.board.filter(function (c) { return c.o === 0; }).length, c1 = s.board.filter(function (c) { return c.o === 1; }).length;
    return '<div class="win-back"><div class="win" style="' + cs(color) + '"><div class="trophy">' + (match ? "🏆" : "🎉") + '</div><div class="txt"><h2>' + (match ? "الفائز بالمباراة: " : "فاز بالجولة: ") + "<b>" + esc(T[t].name) + '</b></h2><p class="smallnote">' + how + " · الخلايا: " + esc(T[0].name) + " " + c0 + " — " + esc(T[1].name) + " " + c1 + '</p></div><div class="btns"><div class="score"><span style="--c:' + T[0].color + '">' + s.wins[0] + "</span><b>:</b><span style=\"--c:" + T[1].color + '">' + s.wins[1] + "</span></div>" +
      (match ? '<button class="btn go huge" data-a="rematch">🔁 إعادة المباراة (لوحة جديدة)</button><button class="btn big" data-a="setup">الإعدادات</button><button class="btn big ghost" data-a="home">الرئيسية</button>' : '<button class="btn go huge" data-a="next">الجولة التالية ▶</button>') + "</div></div></div>";
  }
  function vPlay() {
    var s = M.state, T = settings.teams, turnTeam = T[s.turn], winning = s.phase === "roundwin" || s.phase === "matchwin";
    var status = s.phase === "board" ? '<span class="turntext" style="' + cs(turnTeam.color) + '">الدور على <b>' + esc(turnTeam.name) + "</b> — اختاروا حرفاً من اللوحة" + (s.decider ? " 🔥 (حسم — أسئلة أصعب)" : "") + "</span>" : '<span class="turntext">&nbsp;</span>';
    var join = settings.mode === "phones" ? '<button class="btn sm" data-a="qr">📱 رمز الانضمام</button>' : "";
    return '<section class="screen"><div class="topbar"><div class="grp"><button class="btn sm" data-a="back">→ رجوع</button><span class="badge">الجولة ' + s.round + (s.decider ? '</span><span class="badge hot">الحسم 🔥</span>' : "</span>") + '<span class="badge">' + M.settings.n + "×" + M.settings.n + '</span></div>' +
      '<div class="grp">' + join + '<button class="btn sm" data-a="sound">' + (settings.sound ? "🔊 الصوت" : "🔇 الصوت") + '</button><button class="btn sm" data-a="fs">⛶ ملء الشاشة</button><button class="btn sm" data-a="end">✕ إنهاء</button></div></div>' +
      '<div class="teams-row">' + teamCard(0, s) + teamCard(1, s) + "</div>" +
      '<div class="stage' + (winning ? " winning" : "") + '">' + boardHtml(s) + (s.cur && ["ready", "open", "answering", "judge", "result"].indexOf(s.phase) >= 0 ? questionHtml(s) : "") + (winning ? winHtml(s) : "") + "</div>" +
      '<div class="actions">' + status + "</div></section>";
  }
  function vHowto() {
    return '<section class="screen"><div class="head"><h2>طريقة اللعب</h2><button class="btn" data-a="home">→ رجوع</button></div><div class="panel how"><ol>' +
      "<li>فريقان: <b>الأول (الأزرق)</b> يربط الجانب الأيمن بالأيسر، و<b>الثاني (البرتقالي)</b> يربط الأعلى بالأسفل.</li>" +
      "<li>الفريق صاحب الدور يختار حرفاً من اللوحة، فيظهر سؤال إجابته تبدأ بذلك الحرف.</li>" +
      "<li>الفريقان يتسابقان على <b>الجرس</b> (جوالات اللاعبين، أو أزرار الجرس على الشاشة). أول ضغطة تأخذ فرصة الإجابة.</li>" +
      "<li>إجابة صحيحة = الخلية بلون فريقكم. خاطئة أو انتهى الوقت = الفرصة للمنافس. <b>الإجابة لا تظهر على الشاشة</b> قبل ما ينتهي السؤال، عشان المنافس ما يشوفها: المقدم يراها على جواله، أو الحكم يضغط مطولاً على «اطّلع».</li>" +
      "<li>تُحسم الجولة بخط متصل بين جانبي اللوحة — وليس بعدد الخلايا. في النهاية (الحسم) تصير الأسئلة أصعب والوقت أقصر.</li>" +
      "<li>إذا انتهت الخلايا بدون فائز: الأقرب للاتصال يفوز، وإذا تساويا فسؤال فاصل.</li></ol></div></section>";
  }
  function vModal() {
    if (modal === "qr" && room) return '<div class="modal-back"><div class="modal panel"><h2>انضمام اللاعبين</h2><div class="qr" style="margin:auto">' + qrSvg(joinUrl()) + '</div><div class="code" style="justify-content:center">' + room.split("").map(function (c) { return "<i>" + c + "</i>"; }).join("") + '</div><div class="row">' + [0, 1].map(function (i) { return '<span class="badge" style="border-color:' + settings.teams[i].color + '">' + esc(settings.teams[i].name) + ": " + rosterList(i).length + "</span>"; }).join("") + '</div><button class="btn go big" data-a="close">تمام</button></div></div>';
    if (modal === "end") return '<div class="modal-back"><div class="modal panel"><h2>إنهاء المباراة؟</h2><p class="sub">تضيع النتيجة الحالية.</p><div class="row"><button class="btn bad big" data-a="end-yes">إنهاء</button><button class="btn big" data-a="close">تراجع</button></div></div></div>';
    return "";
  }

  var lastHtml = "";
  function render() {
    var h = view === "setup" ? vSetup() : view === "lobby" ? vLobby() : view === "howto" ? vHowto() : view === "play" && M ? vPlay() : vHome();
    var focusName = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-name");
    var html = h + vModal();
    app.innerHTML = html;
    if (focusName != null) { var f = $('[data-name="' + focusName + '"]'); if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} } }
    if (view === "play" && M) layoutBoard();
  }
  function updateTime() {
    if (!M) return; var s = M.state;
    if (s.phase === "answering") { var t = $("#timer"), tn = $("#tnum"); if (t) { var tot = (s.decider && M.settings.final7 ? 7 : M.settings.time) * 1000; t.style.setProperty("--p", Math.max(0, s.timeLeft / tot).toFixed(3)); t.classList.toggle("warn", s.timeLeft <= 3000); } if (tn) tn.textContent = Math.ceil(s.timeLeft / 1000); }
    else if (s.phase === "open") { var o = $("#openleft"); if (o) o.textContent = Math.max(0, Math.ceil(s.openLeft / 1000)); }
  }
  window.addEventListener("resize", function () { if (view === "play") layoutBoard(); });

  /* ---------- احتفال ---------- */
  function celebrate() {
    var cv = $("#confetti"); if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
    var col = M && M.state.winTeam >= 0 ? [settings.teams[M.state.winTeam].color, "#ffcf4a", "#fff"] : ["#ffcf4a", "#fff", "#3b82f6", "#f97316"], P = [], i;
    for (i = 0; i < 160; i++) P.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .4, vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 5, s: 6 + Math.random() * 9, c: col[i % col.length], r: Math.random() * 6, vr: (Math.random() - .5) * .35 });
    var f = 0;
    (function step() { cx.clearRect(0, 0, cv.width, cv.height); P.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += .05; p.r += p.vr; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); }); if (++f < 240) requestAnimationFrame(step); else cx.clearRect(0, 0, cv.width, cv.height); })();
  }
  function toast(t) { var el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2200); }

  /* ---------- الإجراءات ---------- */
  function finishStats() {
    var s = M.state, T = settings.teams, arr = Store.get(K.stats, []); if (!Array.isArray(arr)) arr = [];
    arr.push({ at: Date.now(), a: T[0].name, b: T[1].name, sa: s.wins[0], sb: s.wins[1] }); Store.set(K.stats, arr.slice(-20));
  }
  function act(a, el) {
    A.unlock(); if (a !== "bell") A.play("tap");
    switch (a) {
      case "home": case "back": view = "home"; render(); break;
      case "howto": view = "howto"; render(); break;
      case "setup": view = "setup"; setupErr = ""; render(); break;
      case "start": act("play"); break;
      case "trial":
        var keep = JSON.stringify(settings); settings.n = 4; settings.target = 1; settings.mode = "device"; settings.judge = "auto"; Store.set(K.match, null);
        startNet(); startMatch(false); Object.assign(settings, JSON.parse(keep)); break;
      case "resume": var sv = Store.get(K.match, null); if (sv) { settings.mode = sv.mode || settings.mode; settings.judge = sv.judge || settings.judge; startNet(); startMatch(true); } break;
      case "mode": settings.mode = el.getAttribute("data-v"); try { localStorage.setItem("majlis_mode", settings.mode === "phones" ? "phones" : "tv"); } catch (e) {} saveSettings(); render(); break;
      case "judge": settings.judge = el.getAttribute("data-v"); saveSettings(); render(); break;
      case "n": settings.n = +el.getAttribute("data-v"); saveSettings(); render(); break;
      case "target": settings.target = +el.getAttribute("data-v"); saveSettings(); render(); break;
      case "level": settings.level = el.getAttribute("data-v"); saveSettings(); render(); break;
      case "time": settings.time = +el.getAttribute("data-v"); saveSettings(); render(); break;
      case "cat-all": settings.cats = []; saveSettings(); render(); break;
      case "cat": var v = el.getAttribute("data-v"), i = settings.cats.indexOf(v); if (i >= 0) settings.cats.splice(i, 1); else settings.cats.push(v); if (settings.cats.length === Object.keys(CATS).length) settings.cats = []; saveSettings(); render(); break;
      case "sound": settings.sound = !settings.sound; A.enable(settings.sound); saveSettings(); render(); break;
      case "final7": settings.final7 = !settings.final7; saveSettings(); render(); break;
      case "color": setTeam(+el.getAttribute("data-t"), { color: el.getAttribute("data-v") }); break;
      case "pl-": var t1 = +el.getAttribute("data-t"); setTeam(t1, { players: Math.max(1, settings.teams[t1].players - 1) }); break;
      case "pl+": var t2 = +el.getAttribute("data-t"); setTeam(t2, { players: Math.min(6, settings.teams[t2].players + 1) }); break;
      case "play":
        var nm = settings.teams.map(function (t) { return t.name.trim(); });
        if (!nm[0] || !nm[1]) { setupErr = "اكتب اسماً لكل فريق"; render(); return; } if (nm[0] === nm[1]) { setupErr = "اسما الفريقين لازم يكونان مختلفين"; render(); return; }
        saveSettings(); setupErr = ""; Store.set(K.match, null);
        if (settings.mode === "phones") { roster = {}; startNet(); view = "lobby"; render(); } else { startNet(); startMatch(false); }
        break;
      case "start-phones": case "start-nophones": startMatch(false); break;
      case "bell": if (M) { var r = M.buzz(+el.getAttribute("data-t"), "tv" + el.getAttribute("data-t"), ""); if (r === "early") toast("ضغطة مبكرة! 🚫"); } break;
      case "reveal": M && M.reveal(); break;
      case "skip": M && M.skip(); break;
      case "pause": M && M.pause(); break;
      case "ok": M && M.judge(true); break;
      case "no": M && M.judge(false); break;
      case "next": if (M) { if (M.state.phase === "matchwin") return; M.next(); } break;
      case "rematch": if (M) { finishStats(); M.rematch(); } break;
      case "qr": modal = "qr"; render(); break;
      case "kickhost": (function () { var h = presenter(); if (h) { try { net.send(h.pid, { t: "nohost", why: "kicked" }); } catch (e) {} delete roster[h.pid]; } render(); })(); break;
      case "close": modal = null; render(); break;
      case "end": modal = "end"; render(); break;
      case "end-yes": if (M && M.state.phase === "matchwin") finishStats(); Store.set(K.match, null); M = null; modal = null; view = "home"; render(); if (net) broadcastEnd(); break;
      case "fs": try { var d = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen()); } catch (e) {} break;
    }
  }
  function broadcastEnd() { Object.keys(roster).forEach(function (k) { try { net.send(k, { t: "state", phase: "idle", names: teamNames(), colors: [settings.teams[0].color, settings.teams[1].color] }); } catch (e) {} }); }

  document.addEventListener("click", function (e) {
    var hx = e.target.closest(".hx");
    if (hx && M && view === "play" && M.state.phase === "board") { A.unlock(); M.choose(+hx.getAttribute("data-i")); return; }
    var el = e.target.closest("[data-a]"); if (!el || el.disabled) return; act(el.getAttribute("data-a"), el);
  });
  function peekOn() { var el = $("#peekans"); if (!el || !M || !M.state.cur) return; el.hidden = false; el.innerHTML = "<small>الإجابة (للحكم فقط)</small>" + esc(M.state.cur.q.a); }
  function peekOff() { var el = $("#peekans"); if (el) { el.hidden = true; el.innerHTML = "<small>الإجابة (للحكم فقط)</small>•••"; } }
  document.addEventListener("pointerdown", function (e) { if (e.target.closest && e.target.closest("[data-peek]")) { e.preventDefault(); peekOn(); } });
  ["pointerup", "pointercancel", "contextmenu"].forEach(function (ev) { document.addEventListener(ev, function () { peekOff(); }, true); });
  document.addEventListener("pointerleave", function (e) { if (e.target.closest && e.target.closest("[data-peek]")) peekOff(); }, true);
  window.addEventListener("blur", peekOff);
  document.addEventListener("input", function (e) { var t = e.target; if (t.hasAttribute && t.hasAttribute("data-name")) { settings.teams[+t.getAttribute("data-name")].name = t.value.slice(0, 16); saveSettings(); } });

  // بيانات اختبار/تشخيص (لا تؤثر على اللعب)
  window.__hu = { get M() { return M; }, settings: settings, get roster() { return roster; }, get room() { return room; }, startMatch: startMatch, act: act };

  // العودة: لو فيه مباراة محفوظة نعرض زر «كمّل»
  if (window.MAJLIS_PASS && window.MAJLIS_PASS.sets) try { window.MAJLIS_PASS.sets("hu", 692, 692); } catch (e) {}
  render();
})();
