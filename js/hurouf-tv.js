/* «حروف وألوف» — شاشة التلفزيون: الإعدادات، الغرفة (QR)، اللوحة السداسية، الأسئلة، الأجراس، الاحتفال.
   المنطق في hurouf-game.js والمحرك في hurouf-engine.js؛ هذا الملف للعرض والتحكم فقط. */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  if (qs.has("room")) return; // هذه الصفحة جوّال لاعب → hurouf-phone.js
  var D = window.HU_DATA, E = window.HU_ENGINE, G = window.HU_GAME, A = window.HU_AUDIO, Net = window.WshNet;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var K = { settings: "hu_settings_v1", match: "hu_match_v1", used: "hu_used_v1", stats: "hu_stats_v1" };
  var COLORS = ["#3b82f6", "#f97316", "#22c55e", "#ec4899", "#a855f7", "#ef4444", "#eab308", "#14b8a6"];
  var CATS = D.cats;
  var DEF = {
    teams: [{ name: "الصقور", color: "#3b82f6", players: 2 }, { name: "النمور", color: "#f97316", players: 2 }],
    n: 5, target: 2, level: "mixed", cats: [], time: 10, final7: true, sound: true, mode: "device", judge: "auto"
  };
  var settings = Object.assign({}, DEF, Store.get(K.settings, {}) || {});
  (function sanitize() {
    if (!Array.isArray(settings.teams) || settings.teams.length !== 2) settings.teams = DEF.teams.map(function (t) { return Object.assign({}, t); });
    settings.teams = settings.teams.map(function (t, i) { t = t || {}; return { name: String(t.name || DEF.teams[i].name).slice(0, 16), color: COLORS.indexOf(t.color) >= 0 ? t.color : DEF.teams[i].color, players: Math.min(6, Math.max(1, +t.players || 2)) }; });
    if (settings.teams[0].color === settings.teams[1].color) settings.teams[1].color = COLORS.filter(function (c) { return c !== settings.teams[0].color; })[0];
    if ([4, 5, 6].indexOf(+settings.n) < 0) settings.n = 5; settings.n = +settings.n;
    if ([1, 2, 3].indexOf(+settings.target) < 0) settings.target = 2; settings.target = +settings.target;
    if (["medium", "hard", "mixed"].indexOf(settings.level) < 0) settings.level = "mixed";
    if ([5, 10, 15, 20].indexOf(+settings.time) < 0) settings.time = 10; settings.time = +settings.time;
    if (!Array.isArray(settings.cats)) settings.cats = []; settings.cats = settings.cats.filter(function (c) { return CATS[c]; });
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
    return '<section class="screen home"><div class="home-hex" aria-hidden="true"><i>ح</i><i>ر</i><i>و</i><i>ف</i></div>' +
      '<h1 class="logo">حروف وألوف<small>مسابقة العائلة على التلفزيون</small></h1>' +
      '<p class="sub">فريقان، لوحة من الحروف، وأجراس! أجيبوا بسرعة واربطوا جانبي اللوحة قبل المنافس.</p>' +
      '<div class="stack">' + (can ? '<button class="btn gold huge" data-a="resume">كمّل المباراة ▶</button>' : "") +
      '<button class="btn ' + (can ? "big" : "go huge") + '" data-a="setup">' + (can ? "مباراة جديدة" : "ابدأ ▶") + "</button>" +
      '<div class="row"><button class="btn big ghost" data-a="howto">طريقة اللعب</button></div>' +
      (lr ? '<p class="sub">آخر مباراة: <b>' + esc(lr.a) + "</b> " + lr.sa + " – " + lr.sb + " <b>" + esc(lr.b) + "</b></p>" : "") + "</div></section>";
  }

  function chips(list, cur, a, label) { return '<div class="chips">' + list.map(function (v) { return '<button class="chip" data-a="' + a + '" data-v="' + v[0] + '" aria-pressed="' + (String(cur) === String(v[0])) + '">' + v[1] + "</button>"; }).join("") + "</div>"; }
  function vSetup() {
    var s = settings, teams = s.teams.map(function (t, i) {
      var sw = COLORS.map(function (c) { return '<button class="sw" style="--c:' + c + '" data-a="color" data-t="' + i + '" data-v="' + c + '" aria-pressed="' + (t.color === c) + '" aria-label="لون"' + (s.teams[1 - i].color === c ? " disabled" : "") + "></button>"; }).join("");
      return '<div class="tcard" style="--c:' + t.color + '"><span class="lbl">الفريق ' + (i === 0 ? "الأول — يربط اليمين باليسار ↔" : "الثاني — يربط الأعلى بالأسفل ↕") + '</span><input data-name="' + i + '" maxlength="16" value="' + esc(t.name) + '" aria-label="اسم الفريق">' +
        '<div class="swatches">' + sw + '</div><div class="row" style="justify-content:flex-start"><span class="lbl">عدد اللاعبين</span><span class="stepper"><button class="btn sm" data-a="pl-" data-t="' + i + '">−</button><output>' + t.players + '</output><button class="btn sm" data-a="pl+" data-t="' + i + '">+</button></span></div></div>';
    }).join("");
    var cats = '<button class="chip" data-a="cat-all" aria-pressed="' + (s.cats.length === 0) + '">كل التصنيفات</button>' + Object.keys(CATS).map(function (c) { return '<button class="chip" data-a="cat" data-v="' + c + '" aria-pressed="' + (s.cats.indexOf(c) >= 0) + '">' + esc(CATS[c]) + "</button>"; }).join("");
    return '<section class="screen"><div class="head"><h2>إعداد المباراة</h2><button class="btn" data-a="home">رجوع</button></div>' +
      '<div class="setup"><div class="col"><div class="teams">' + teams + "</div>" +
      '<div class="panel field"><span class="lbl">طريقة اللعب</span>' + chips([["device", "🖥️ جهاز واحد (لوحة المفاتيح)"], ["phones", "📱 بجوالات اللاعبين"]], s.mode, "mode") +
      '<span class="lbl">التحكيم</span>' + chips([["auto", "تلقائي — الفريقان يؤكدان"], ["host", "🎤 مقدم من جواله"]], s.judge, "judge") + "</div></div>" +
      '<div class="col"><div class="panel field"><span class="lbl">حجم اللوحة</span>' + chips([[4, "4×4"], [5, "5×5"], [6, "6×6"]], s.n, "n") +
      '<span class="lbl">الفوز بالمباراة بـ</span>' + chips([[1, "جولة واحدة"], [2, "جولتين"], [3, "3 جولات"]], s.target, "target") +
      '<span class="lbl">مستوى الأسئلة</span>' + chips([["medium", "متوسط"], ["hard", "صعب"], ["mixed", "مختلط"]], s.level, "level") +
      '<span class="lbl">وقت الإجابة</span>' + chips([[5, "5 ث"], [10, "10 ث"], [15, "15 ث"], [20, "20 ث"]], s.time, "time") + "</div>" +
      '<div class="panel field"><span class="lbl">التصنيفات</span><div class="chips">' + cats + '</div><div class="row" style="justify-content:flex-start"><button class="chip" data-a="sound" aria-pressed="' + s.sound + '">🔊 المؤثرات الصوتية</button><button class="chip" data-a="final7" aria-pressed="' + s.final7 + '">⏱️ الحسم 7 ثوانٍ</button></div></div></div></div>' +
      (setupErr ? '<p class="empty" style="color:#fca5a5;text-align:center">' + esc(setupErr) + "</p>" : "") +
      '<div class="setup-foot"><button class="btn go huge" data-a="play">' + (s.mode === "phones" ? "التالي: ربط الجوالات ▶" : "ابدأ المباراة ▶") + "</button></div></section>";
  }

  function vLobby() {
    var url = joinUrl(), T = settings.teams, ok = rosterList(0).length > 0 && rosterList(1).length > 0, pr = presenter();
    var cols = [0, 1].map(function (i) {
      var l = rosterList(i);
      return '<div class="rcol" style="--c:' + T[i].color + '"><h3>' + esc(T[i].name) + '</h3>' + (l.length ? l.map(function (p) { return '<div class="who' + (p.online ? "" : " off") + '">' + esc(p.name) + "</div>"; }).join("") : '<p class="empty">بانتظار اللاعبين…</p>') + "</div>";
    }).join("");
    return '<section class="screen"><div class="head"><h2>ربط الجوالات</h2><button class="btn" data-a="setup">رجوع</button></div>' +
      '<div class="lobby"><div class="panel join"><div class="qr">' + qrSvg(url) + '</div><p class="lbl">امسحوا الرمز بالجوال واختاروا فريقكم</p><div class="code" aria-label="رمز الغرفة">' + room.split("").map(function (c) { return "<i>" + c + "</i>"; }).join("") + '</div><p class="url">' + esc(url) + '</p><p id="net" class="lbl">' + netText() + "</p>" +
      (settings.judge === "host" ? '<p class="lbl">🎤 المقدم: ' + (pr ? esc(pr.name) + " ✓" : "يدخل من نفس الرابط ويختار «أنا المقدم»") + "</p>" : "") + "</div>" +
      '<div class="roster">' + cols + "</div></div>" +
      '<div class="setup-foot"><button class="btn go huge" data-a="start-phones"' + (ok ? "" : " disabled") + '>ابدأ المباراة ▶</button><button class="btn big" data-a="start-nophones">بدون جوالات (لوحة المفاتيح)</button></div></section>';
  }

  /* ---------- اللوحة ---------- */
  function boardHtml(s) {
    var n = M.settings.n, T = settings.teams, h = "";
    s.board.forEach(function (c, i) {
      var cls = "hx" + (c.o === -1 ? (c.dead || !E.hasQuestion(D, c.l, M.used) ? " dead" : " free") : " o" + c.o) + (s.cur && s.cur.idx === i && s.phase !== "roundwin" && s.phase !== "matchwin" ? " cur" : "") + (selCell === i && c.o === -1 ? " sel" : "") + (s.winPath && s.winPath.indexOf(i) >= 0 ? " won" : "");
      var style = c.o >= 0 ? "--c:" + T[c.o].color : "";
      var free = c.o === -1 && !c.dead && E.hasQuestion(D, c.l, M.used);
      h += '<button class="' + cls + '" data-i="' + i + '" style="' + style + '" ' + (free && s.phase === "board" ? "" : "tabindex=-1 ") + 'aria-label="حرف ' + c.l + '"><span class="edge"></span><span class="face"><span class="ch">' + c.l + "</span></span></button>";
    });
    return '<div id="board" data-n="' + n + '"><svg class="edges" id="edges"></svg>' + h + '<svg class="winline" id="winline"></svg></div>';
  }
  function layoutBoard() {
    var b = $("#board"), st = $(".stage"); if (!b || !st) return;
    var n = +b.getAttribute("data-n"), aw = st.clientWidth - 8, ah = (st.clientHeight - 8) * (st.classList.contains("winning") ? .68 : 1);
    var w = Math.max(30, Math.min(aw / (1.5 * n - .5), ah / ((n - 1) * 0.866 + 1.1547 + .08)));
    var h = w * 1.1547, W = w * (1.5 * n - .5), H = (n - 1) * 0.75 * h + h + w * .07;
    b.style.setProperty("--w", w + "px"); b.style.width = W + "px"; b.style.height = H + "px";
    var cells = b.querySelectorAll(".hx");
    function cx(r, c) { return w / 2 + c * w + r * w / 2; } function cy(r) { return h / 2 + r * .75 * h; }
    [].forEach.call(cells, function (el) { var i = +el.getAttribute("data-i"), r = Math.floor(i / n), c = i % n; el.style.left = (cx(r, c) - w / 2) + "px"; el.style.top = (cy(r) - h / 2) + "px"; });
    var T = settings.teams, svg = $("#edges"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
    function V(r, c, k) { var x = cx(r, c), y = cy(r); return { T: [x, y - h / 2], UR: [x + w / 2, y - h / 4], LR: [x + w / 2, y + h / 4], B: [x, y + h / 2], LL: [x - w / 2, y + h / 4], UL: [x - w / 2, y - h / 4] }[k]; }
    function pl(pts, color) { return '<polyline style="color:' + color + '" stroke="' + color + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>'; }
    var L = [], R = [], Tp = [], Bt = [], r, c;
    for (r = 0; r < n; r++) { L.push(V(r, 0, "UL"), V(r, 0, "LL")); } L.push(V(n - 1, 0, "B"));
    R.push(V(0, n - 1, "T")); for (r = 0; r < n; r++) R.push(V(r, n - 1, "UR"), V(r, n - 1, "LR")); R.push(V(n - 1, n - 1, "B"));
    Tp.push(V(0, 0, "UL")); for (c = 0; c < n; c++) Tp.push(V(0, c, "T"), V(0, c, "UR"));
    for (c = 0; c < n; c++) Bt.push(V(n - 1, c, "LL"), V(n - 1, c, "B")); Bt.push(V(n - 1, n - 1, "LR"));
    svg.innerHTML = pl(L, T[0].color) + pl(R, T[0].color) + pl(Tp, T[1].color) + pl(Bt, T[1].color);
    var s = M.state, wl = $("#winline"); wl.setAttribute("viewBox", "0 0 " + W + " " + H); wl.setAttribute("width", W); wl.setAttribute("height", H);
    if (s.winPath) wl.innerHTML = '<polyline points="' + s.winPath.map(function (i) { var rr = Math.floor(i / n), cc = i % n; return cx(rr, cc).toFixed(1) + "," + cy(rr).toFixed(1); }).join(" ") + '"/>'; else wl.innerHTML = "";
  }

  function teamCard(i, s) {
    var T = settings.teams[i], cells = s.board.filter(function (c) { return c.o === i; }).length, near = M.rem(i) <= 1 && s.phase !== "roundwin" && s.phase !== "matchwin";
    var pips = ""; for (var k = 0; k < M.settings.target; k++) pips += '<i class="' + (k < s.wins[i] ? "on" : "") + '"></i>';
    var turn = s.turn === i && (s.phase === "board");
    return '<div class="team' + (turn ? " turn" : "") + (near ? " near" : "") + '" style="--c:' + T.color + '"><div><div class="nm">' + esc(T.name) + '</div><div class="meta">' + (i === 0 ? "↔ اليمين واليسار" : "↕ الأعلى والأسفل") + (near ? " · 🔥 قريب من الفوز" : "") + '</div><div class="pips" title="الجولات">' + pips + '</div></div><div class="num" title="الخلايا">' + cells + "</div></div>";
  }
  function timerHtml(s) {
    var tot = (s.decider && M.settings.final7 ? 7 : M.settings.time) * 1000, p = s.timeLeft / tot, c = s.cur && s.cur.buzz ? settings.teams[s.cur.buzz.team].color : "#22c55e";
    return '<div class="timer' + (s.timeLeft <= 3000 ? " warn" : "") + '" id="timer" style="--p:' + Math.max(0, p).toFixed(3) + ";--c:" + c + '"><b id="tnum">' + Math.ceil(s.timeLeft / 1000) + "</b></div>";
  }
  function bellButtons(s) {
    var T = settings.teams, tried = s.cur ? s.cur.tried : [];
    return '<div class="bells">' + [0, 1].map(function (i) { return '<button class="bell-btn" style="--c:' + T[i].color + '" data-a="bell" data-t="' + i + '"' + (tried.indexOf(i) >= 0 ? " disabled" : "") + '>🔔 ' + esc(T[i].name) + "<small>" + (i === 0 ? "A S D F" : "J K L ;") + "</small></button>"; }).join("") + "</div>";
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
      ctl = '<div class="qctl"><button class="btn sm" data-a="skip">⏭ سؤال بديل [N]</button><button class="btn sm" data-a="reveal">👁 كشف الإجابة [Space]</button><button class="btn sm" data-a="pause">' + (s.paused ? "▶" : "⏸") + "</button></div>";
    } else if (ph === "answering" || ph === "judge") {
      var tm = settings.teams[buzz.team];
      body += '<div class="buzzed" style="--c:' + tm.color + '"><span class="bell">🔔</span><span>' + (buzz.name ? esc(buzz.name) + " — " : "") + esc(tm.name) + "</span></div>" + (c.note ? '<div class="waiting">' + esc(c.note) + "</div>" : "");
      if (c.typed) body += '<div class="hint">⌨️ كتب: «' + esc(c.typed.text) + '» ' + (c.typed.ok ? "✅ مطابقة للإجابة" : "❌ لا تطابق الإجابة المعتمدة") + "</div>";
      if (ph === "answering") { side = timerHtml(s); ctl = '<div class="qctl"><button class="btn gold big" data-a="reveal">👁 كشف الإجابة [Space]</button><button class="btn sm" data-a="skip">⏭ تخطي [N]</button><button class="btn sm" data-a="pause">' + (s.paused ? "▶ استئناف" : "⏸ إيقاف") + "</button></div>"; }
      else {
        body += '<div class="ans"><small>الإجابة المعتمدة</small>' + esc(c.q.a) + "</div>";
        ctl = host ? '<p class="waiting">🎤 بانتظار قرار المقدم… (أو لوحة المفاتيح: Enter صحيحة · Backspace خاطئة)</p>' : '<div class="qctl"><button class="btn good huge" data-a="ok">✔ صحيحة [Enter]</button><button class="btn bad huge" data-a="no">✘ خاطئة [Backspace]</button></div>';
      }
    } else if (ph === "result") {
      var r = c.result;
      body += '<div class="ans"><small>الإجابة</small>' + esc(c.q.a) + "</div>";
      if (r.ok) body += '<div class="result-msg ok">✔ صحيحة! ' + (c.tiebreak ? "" : "الخلية لـ " + esc(T[r.team].name)) + "</div>";
      else body += '<div class="result-msg no">' + (r.why === "nobody" ? "ما أحد ضغط الجرس" : r.why === "revealed" ? "تم كشف الإجابة" : "ما أحد أجاب صح") + " — الخلية تبقى مفتوحة</div>";
      ctl = '<div class="qctl"><button class="btn go big" data-a="next">التالي ▶ [Enter]</button></div>';
    }
    return '<div class="q-back"><div class="q" style="--c:' + (buzz ? T[buzz.team].color : "var(--line)") + '"><div class="bigl">' + letter + '</div><div class="body">' + body + '</div><div class="side">' + side + "</div></div>" +
      "<div>" + ctl + "</div></div>";
  }
  function winHtml(s) {
    var T = settings.teams, t = s.winTeam, match = s.phase === "matchwin", color = T[t].color;
    var how = s.winPath ? "ربطوا جانبي اللوحة بمسار متصل!" : "حُسمت الجولة بالأقرب للفوز";
    var c0 = s.board.filter(function (c) { return c.o === 0; }).length, c1 = s.board.filter(function (c) { return c.o === 1; }).length;
    return '<div class="win-back"><div class="win" style="--c:' + color + '"><div class="trophy">' + (match ? "🏆" : "🎉") + '</div><div class="txt"><h2>' + (match ? "الفائز بالمباراة: " : "فاز بالجولة: ") + esc(T[t].name) + '</h2><p class="smallnote">' + how + " · الخلايا: " + esc(T[0].name) + " " + c0 + " — " + esc(T[1].name) + " " + c1 + '</p></div><div class="btns"><div class="score"><span style="--c:' + T[0].color + '">' + s.wins[0] + "</span><b>:</b><span style=\"--c:" + T[1].color + '">' + s.wins[1] + "</span></div>" +
      (match ? '<button class="btn go huge" data-a="rematch">🔁 إعادة المباراة (لوحة جديدة)</button><button class="btn big" data-a="setup">الإعدادات</button><button class="btn big ghost" data-a="home">الرئيسية</button>' : '<button class="btn go huge" data-a="next">الجولة التالية ▶ [Enter]</button>') + "</div></div></div>";
  }
  function vPlay() {
    var s = M.state, T = settings.teams, turnTeam = T[s.turn];
    var status = s.phase === "board" ? '<span class="turntext" style="--c:' + turnTeam.color + '">الدور على <b>' + esc(turnTeam.name) + "</b> — اختاروا حرفاً" + (s.decider ? " 🔥 (حسم — أسئلة أصعب)" : "") + "</span>" : '<span class="turntext">&nbsp;</span>';
    var join = settings.mode === "phones" ? '<button class="btn sm" data-a="qr">📱 رمز الانضمام</button>' : "";
    return '<section class="screen"><div class="top">' + teamCard(0, s) + '<div class="mid"><span class="logo-s">حروف وألوف</span><span class="badge">الجولة ' + s.round + (s.decider ? "</span><span class=\"badge hot\">الحسم 🔥</span>" : "</span>") + "</div>" + teamCard(1, s) + "</div>" +
      '<div class="stage' + (s.phase === "roundwin" || s.phase === "matchwin" ? " winning" : "") + '">' + boardHtml(s) + (s.cur && ["ready", "open", "answering", "judge", "result"].indexOf(s.phase) >= 0 ? questionHtml(s) : "") + (s.phase === "roundwin" || s.phase === "matchwin" ? winHtml(s) : "") + "</div>" +
      '<div class="bar">' + status + '<span class="keys">⌨️ الجرس: <kbd>A</kbd> الأول · <kbd>L</kbd> الثاني — الأسهم + <kbd>Enter</kbd> لاختيار حرف</span><span class="row">' + join + '<button class="btn sm" data-a="sound">' + (settings.sound ? "🔊" : "🔇") + '</button><button class="btn sm" data-a="fs">⛶</button><button class="btn sm" data-a="end">إنهاء</button></span></div></section>';
  }
  function vHowto() {
    return '<section class="screen"><div class="head"><h2>طريقة اللعب</h2><button class="btn" data-a="home">رجوع</button></div><div class="panel how"><ol>' +
      "<li>فريقان: <b>الأول (الأزرق)</b> يربط الجانب الأيمن بالأيسر، و<b>الثاني (البرتقالي)</b> يربط الأعلى بالأسفل.</li>" +
      "<li>الفريق صاحب الدور يختار حرفاً من اللوحة، فيظهر سؤال إجابته تبدأ بذلك الحرف.</li>" +
      "<li>الفريقان يتسابقان على <b>الجرس</b> (الجوال أو لوحة المفاتيح: A و L). أول ضغطة تأخذ فرصة الإجابة.</li>" +
      "<li>إجابة صحيحة = الخلية بلون فريقكم. خاطئة أو انتهى الوقت = الفرصة للمنافس.</li>" +
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
      case "home": view = "home"; render(); break;
      case "howto": view = "howto"; render(); break;
      case "setup": view = "setup"; setupErr = ""; render(); break;
      case "resume": var sv = Store.get(K.match, null); if (sv) { settings.mode = sv.mode || settings.mode; settings.judge = sv.judge || settings.judge; startNet(); startMatch(true); } break;
      case "mode": settings.mode = el.getAttribute("data-v"); saveSettings(); render(); break;
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
  document.addEventListener("input", function (e) { var t = e.target; if (t.hasAttribute && t.hasAttribute("data-name")) { settings.teams[+t.getAttribute("data-name")].name = t.value.slice(0, 16); saveSettings(); } });

  /* ---------- لوحة المفاتيح ---------- */
  var T0KEYS = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyQ", "KeyW", "KeyE"], T1KEYS = ["KeyJ", "KeyK", "KeyL", "Semicolon", "KeyU", "KeyI", "KeyO"];
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName; if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (view !== "play" || !M) { if (e.key === "Enter" && view === "home") { var b = $("[data-a=resume],[data-a=setup]"); b && b.click(); } return; }
    var s = M.state, code = e.code; A.unlock();
    if (modal) { if (e.key === "Escape") { modal = null; render(); } return; }
    if (T0KEYS.indexOf(code) >= 0 || T1KEYS.indexOf(code) >= 0) {
      e.preventDefault(); if (e.repeat) return; var team = T0KEYS.indexOf(code) >= 0 ? 0 : 1, r = M.buzz(team, "kb" + team + code, "");
      if (r === "early") toast("ضغطة مبكرة! 🚫 " + settings.teams[team].name); return;
    }
    if (s.phase === "board") {
      var n = M.settings.n, cur = selCell >= 0 ? selCell : (M.availableIdx()[0] || 0), nx = cur, k = e.key;
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault(); var r0 = Math.floor(cur / n), c0 = cur % n;
        if (k === "ArrowLeft") c0 = Math.max(0, c0 - 1); else if (k === "ArrowRight") c0 = Math.min(n - 1, c0 + 1); else if (k === "ArrowUp") r0 = Math.max(0, r0 - 1); else r0 = Math.min(n - 1, r0 + 1);
        selCell = r0 * n + c0; render(); return;
      }
      if (k === "Enter" || k === " ") { e.preventDefault(); if (selCell >= 0) M.choose(selCell); else { var av = M.availableIdx(); if (av.length) { selCell = av[0]; render(); } } return; }
      if (k === "Tab") { e.preventDefault(); var av2 = M.availableIdx(); if (av2.length) { var p = av2.indexOf(selCell); selCell = av2[(p + 1) % av2.length]; render(); } return; }
    }
    if (e.key === " ") { e.preventDefault(); M.reveal(); return; }
    if (e.key === "Enter") { e.preventDefault(); if (s.phase === "judge" || s.phase === "answering") M.judge(true); else if (s.phase === "result" || s.phase === "roundwin") M.next(); else if (s.phase === "matchwin") { finishStats(); M.rematch(); } return; }
    if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); if (s.phase === "judge" || s.phase === "answering") M.judge(false); return; }
    if (code === "KeyN") { M.skip(); return; }
    if (code === "KeyP") { M.pause(); return; }
    if (code === "KeyM") { act("sound"); return; }
  });

  // بيانات اختبار/تشخيص (لا تؤثر على اللعب)
  window.__hu = { get M() { return M; }, settings: settings, get roster() { return roster; }, get room() { return room; }, startMatch: startMatch, act: act };

  // العودة: لو فيه مباراة محفوظة نعرض زر «كمّل»
  if (window.MAJLIS_PASS && window.MAJLIS_PASS.sets) try { window.MAJLIS_PASS.sets("hu", 692, 692); } catch (e) {}
  render();
})();
