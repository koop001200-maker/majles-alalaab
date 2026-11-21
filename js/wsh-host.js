/* «وش الصح؟» — شاشة التلفزيون: تنشئ الغرفة، تدير الجولات، تحسب النقاط، وترسل لكل جوال ما يخصّه فقط. */
(function () {
  "use strict";
  var qs0 = new URLSearchParams(location.search);
  if (qs0.has("room") || qs0.has("join")) return; // this page is a phone
  var AV = window.WSH_AV;
  var CATS = window.WSH_CATS, LEVELS = window.WSH_LEVELS, BANK = window.WSH_QUESTIONS;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#e11d48", "#a855f7", "#0ea5e9", "#22c55e", "#eab308"];
  var TEAMS = [{ name: "الصقور", color: "#ef4444", icon: "🦅" }, { name: "النخيل", color: "#10b981", icon: "🌴" }, { name: "الهيل", color: "#3b82f6", icon: "☕" }, { name: "الغزلان", color: "#f59e0b", icon: "🦌" }];
  var MODES = {
    solo: { name: "كل واحد لنفسه", icon: "🙋", hint: "كل لاعب يجمع نقاطه" },
    teams: { name: "فرق", icon: "👥", hint: "كل فريق يكتب كذبة واحدة، والنقاط للفريق" },
    family: { name: "وضع العائلة", icon: "🏠", hint: "سعودي وعام وإسلامي وممتع" },
    quick: { name: "تحدي سريع", icon: "⚡", hint: "جولات أقصر ووقت أقل" }
  };

  /* ---------------- answer matching ---------------- */
  var AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  function norm(s) {
    s = String(s || "").toLowerCase();
    s = s.replace(/[٠-٩]/g, function (d) { return String(AR_DIGITS.indexOf(d)); });
    s = s.replace(/[ً-ٰٟـ]/g, ""); // tashkeel + tatweel
    s = s.replace(/[إأآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[گ]/g, "ك").replace(/[ڤ]/g, "ف").replace(/[پ]/g, "ب").replace(/ی/g, "ي");
    s = s.replace(/[^ء-يa-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    s = s.split(" ").map(function (w) { return w.length > 3 && w.indexOf("ال") === 0 ? w.slice(2) : w; }).join(" ");
    return s.replace(/ /g, "");
  }
  function lev(a, b) {
    if (a === b) return 0; var m = a.length, n = b.length; if (!m || !n) return m || n;
    var prev = [], cur = []; for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) { cur = [i]; for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  // is this text the true answer (or close enough to count as the truth)?
  function isTruth(text, q) {
    var t = norm(text); if (!t) return false;
    var all = [q.answer].concat(q.alts).map(norm);
    for (var i = 0; i < all.length; i++) {
      var a = all[i]; if (!a) continue;
      if (t === a) return true;
      if (/^\d+$/.test(a) || /^\d+$/.test(t)) continue; // numbers must match exactly
      var tol = a.length >= 6 ? 1 : 0;
      if (lev(t, a) <= tol) return true;
    }
    return false;
  }
  window.WSH_MATCH = { norm: norm, isTruth: isTruth };

  /* ---------------- state ---------------- */
  var KEY = "wsh_host_v1";
  var defaults = { mode: "solo", cats: CATS.map(function (c) { return c.id; }), level: 0, rounds: 8, writeSec: 60, voteSec: 30, teamsN: 2, sound: true, joinBase: "" };
  var S = Store.get(KEY, null);
  if (!S || typeof S !== "object" || !Array.isArray(S.players)) S = null;
  function newRoomCode() { return String(10000 + Math.floor(Math.random() * 90000)); }
  if (!S) S = { code: newRoomCode(), settings: JSON.parse(JSON.stringify(defaults)), players: [], phase: "lobby", round: 0, used: [], history: [] };
  S.settings = Object.assign({}, defaults, S.settings || {});
  var params = new URLSearchParams(location.search);
  if (params.get("newroom") === "1") { S.code = newRoomCode(); }
  function save() { Store.set(KEY, S); }

  var net = null, netStatus = "connecting";
  function startNet() {
    if (net) net.close();
    net = window.WshNet.host(S.code, { onMsg: onMsg, onLeave: onLeave, onStatus: function (st) { netStatus = st; renderStatus(); },
      // another TV is already using this room code: take a new one (only matters before anyone joined)
      onConflict: function () { if (S.players.length) return; S.code = newRoomCode(); save(); startNet(); render(); } });
  }

  function player(id) { for (var i = 0; i < S.players.length; i++) if (S.players[i].id === id) return S.players[i]; return null; }
  function teamMode() { return S.settings.mode === "teams"; }
  function curQ() { for (var i = 0; i < BANK.length; i++) if (BANK[i].id === S.qid) return BANK[i]; return null; }
  function onlinePlayers() { return S.players.filter(function (p) { return p.online; }); }
  function isLast() { return S.round >= S.rounds; }
  function mult() { return isLast() && S.rounds > 1 ? 2 : 1; }
  function speed() { return S.settings.mode === "quick" ? 0.7 : 1; }

  /* ---------------- messages from phones ---------------- */
  var lastSeen = {};
  function onMsg(pid, m) {
    if (!m || typeof m !== "object") return;
    lastSeen[pid] = Date.now();
    var p = player(pid);
    if (m.t === "hello") {
      var name = String(m.name || "").replace(/\s+/g, " ").trim().slice(0, 16), av = String(m.av || "🙂"); if (!window.WSH_AVATARS[av]) av = av.slice(0, 4);
      if (!name) return;
      if (!p) {
        if (S.kicked && S.kicked.indexOf(pid) >= 0) { net.send(pid, { t: "kicked" }); return; }
        var taken = S.players.some(function (x) { return x.name === name; });
        if (taken) { var k = 2; while (S.players.some(function (x) { return x.name === name + " " + k; })) k++; name = name + " " + k; }
        p = { id: pid, name: name, av: av, color: COLORS[S.players.length % COLORS.length], score: 0, fooled: 0, truths: 0, online: true, team: 0 };
        if (teamMode()) p.team = smallestTeam();
        S.players.push(p); sfx.join(); save(); render(); broadcast();
      } else { var was = p.online; p.online = true; p.av = av || p.av; if (!was) { render(); broadcast(); } }
      sendTo(p);
      return;
    }
    if (!p) { net.send(pid, { t: "who" }); return; }
    if (!p.online) { p.online = true; render(); }
    if (m.t === "ping") { sendTo(p); return; }
    if (m.t === "lie" && S.phase === "write" && !S.paused) { submitLie(p, m.text); return; }
    if (m.t === "vote" && S.phase === "vote" && !S.paused) { castVote(p, m.opt); return; }
  }
  function onLeave(pid) { var p = player(pid); if (p) { p.online = false; render(); } }
  // phones on BroadcastChannel never "close": mark them offline when they stop pinging
  setInterval(function () {
    var now = Date.now(), changed = false;
    S.players.forEach(function (p) { if (p.online && now - (lastSeen[p.id] || 0) > 15000) { p.online = false; changed = true; } });
    if (changed) render();
  }, 5000);

  function smallestTeam() {
    var n = S.settings.teamsN, c = []; for (var i = 0; i < n; i++) c[i] = 0;
    S.players.forEach(function (p) { if (p.team < n) c[p.team]++; });
    var best = 0; for (i = 1; i < n; i++) if (c[i] < c[best]) best = i; return best;
  }

  /* ---------------- game flow ---------------- */
  var tickT = null;
  function setTimer(sec) { S.timer = { endsAt: Date.now() + sec * 1000, total: sec * 1000, left: sec * 1000 }; }
  function timeLeft() { if (!S.timer) return 0; return S.paused ? S.timer.left : Math.max(0, S.timer.endsAt - Date.now()); }

  function pickQuestion() {
    var cats = S.settings.mode === "family" ? window.WSH_FAMILY_CATS : S.settings.cats;
    var lv = +S.settings.level;
    var src = window.MAJLIS_PASS ? MAJLIS_PASS.scoped("wsh", BANK, S.used) : BANK;
    var pool = src.filter(function (q) { return cats.indexOf(q.cat) >= 0 && (!lv || q.lvl === lv) && S.used.indexOf(q.id) < 0; });
    if (!pool.length) pool = BANK.filter(function (q) { return cats.indexOf(q.cat) >= 0 && (!lv || q.lvl === lv) && S.used.indexOf(q.id) < 0; });
    if (!pool.length) pool = BANK.filter(function (q) { return cats.indexOf(q.cat) >= 0 && S.used.indexOf(q.id) < 0; });
    if (!pool.length) pool = BANK.filter(function (q) { return S.used.indexOf(q.id) < 0; });
    if (!pool.length) { S.used = []; pool = BANK.slice(); }
    // vary categories: avoid the previous round's category when possible
    var prev = S.lastCat, alt = pool.filter(function (q) { return q.cat !== prev; });
    if (alt.length) pool = alt;
    var q = pool[Math.floor(Math.random() * pool.length)];
    S.used.push(q.id); S.lastCat = q.cat; return q;
  }

  function startGame() {
    if (S.players.length < 2) { toast("يلزم لاعبان على الأقل — امسحوا الرمز بالجوال"); return; }
    var st = S.settings;
    S.rounds = st.mode === "quick" ? Math.min(st.rounds, 6) : st.rounds;
    S.writeSec = st.mode === "quick" ? Math.min(st.writeSec, 40) : st.writeSec;
    S.voteSec = st.mode === "quick" ? Math.min(st.voteSec, 20) : st.voteSec;
    S.players.forEach(function (p) { p.score = 0; p.fooled = 0; p.truths = 0; });
    if (teamMode()) balanceTeams();
    S.round = 0; S.history = []; S.paused = false;
    nextRound();
  }
  function balanceTeams() {
    var n = S.settings.teamsN, counts = []; for (var i = 0; i < n; i++) counts[i] = 0;
    S.players.forEach(function (p) { if (!(p.team >= 0 && p.team < n)) p.team = 0; counts[p.team]++; });
    // keep the host's own arrangement unless a team is empty
    if (counts.some(function (c) { return c === 0; })) S.players.forEach(function (p, idx) { p.team = idx % n; });
  }
  function nextRound() {
    S.round++;
    var q = pickQuestion();
    S.qid = q.id; S.lies = {}; S.votes = {}; S.options = null; S.roundPts = {}; S.reveal = null; S.lieErr = {};
    S.snapshot = S.players.map(function (p) { return [p.id, p.score, p.fooled, p.truths]; });
    go("intro");
  }
  function redoRound() {
    if (!S.snapshot) return;
    S.snapshot.forEach(function (r) { var p = player(r[0]); if (p) { p.score = r[1]; p.fooled = r[2]; p.truths = r[3]; } });
    S.round--; S.paused = false; nextRound(); toast("أُعيدت الجولة بسؤال جديد");
  }
  function go(phase) {
    S.phase = phase; S.paused = false;
    var sp = speed();
    if (phase === "intro") setTimer(4 * sp);
    else if (phase === "write") { setTimer(S.writeSec); sfx.start(); }
    else if (phase === "read") { buildOptions(); setTimer(Math.max(5, Math.min(12, 3 + S.options.length)) * sp); sfx.whoosh(); }
    else if (phase === "vote") setTimer(S.voteSec);
    else if (phase === "reveal") { score(); S.reveal = { step: 0, steps: revealSteps() }; setTimer(stepTime()); }
    else if (phase === "scores") { setTimer(12 * sp); sfx.board(); }
    else if (phase === "final") { S.timer = null; finishGame(); }
    else S.timer = null;
    save(); render(); broadcast();
  }
  function stepTime() { return (S.settings.mode === "quick" ? 2.2 : 3.2); }
  function advance() {
    if (S.phase === "intro") go("write");
    else if (S.phase === "write") go("read");
    else if (S.phase === "read") go("vote");
    else if (S.phase === "vote") go("reveal");
    else if (S.phase === "reveal") {
      if (S.reveal.step < S.reveal.steps.length - 1) { S.reveal.step++; setTimer(stepTime() + (S.reveal.steps[S.reveal.step].kind === "truth" ? 2.5 : 0)); playStep(); save(); render(); broadcast(); }
      else go("scores");
    }
    else if (S.phase === "scores") { if (isLast()) go("final"); else nextRound(); }
  }
  function tick() {
    if (S.paused || !S.timer || ["lobby", "final"].indexOf(S.phase) >= 0) return;
    var left = timeLeft();
    if (S.phase === "write" || S.phase === "vote") {
      var sec = Math.ceil(left / 1000); if (sec <= 5 && sec > 0 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick(); }
      var el = $("#ring"); if (el) { el.style.setProperty("--p", (left / S.timer.total).toFixed(4)); var n = $("#ring b"); if (n) n.textContent = sec; el.classList.toggle("hot", sec <= 10); }
    }
    if (left <= 0) advance();
  }
  var lastTickSec = -1;

  function submitLie(p, text) {
    text = String(text || "").replace(/\s+/g, " ").trim().slice(0, 40);
    var q = curQ(); if (!q || !text) return;
    var key = teamMode() ? "t" + p.team : p.id;
    if (teamMode() && S.lies[key] && S.lies[key].by !== p.id) { sendTo(p); return; }
    if (isTruth(text, q)) { S.lieErr[p.id] = "إجابتك صحيحة أو قريبة جداً منها! 😅 اكتب إجابة مزيّفة بدلاً منها"; sendTo(p); return; }
    if (!window.WSH_FMT_OK(window.WSH_FMT(q.answer), window.WSH_FMT(text))) { S.lieErr[p.id] = "اكتب " + fmtText(q) + " مثل الإجابة الصحيحة، عشان ما تنكشف كذبتك 😉"; sendTo(p); return; }
    S.lieErr[p.id] = "";
    S.lies[key] = { text: text, by: p.id };
    sfx.pop(); save(); render();
    broadcast(); // everyone's phone shows who has finished writing
    var need = teamMode() ? teamsWithOnline().length : onlinePlayers().length;
    if (Object.keys(S.lies).length >= need) { setTimeout(function () { if (S.phase === "write") advance(); }, 900); }
  }
  function teamsWithOnline() { var t = {}; onlinePlayers().forEach(function (p) { t[p.team] = 1; }); return Object.keys(t); }

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function buildOptions() {
    var q = curQ(), opts = [], seen = {};
    opts.push({ id: "T", text: q.answer, kind: "truth", authors: [] }); seen[norm(q.answer)] = opts[0];
    Object.keys(S.lies).forEach(function (k) {
      var L = S.lies[k], n = norm(L.text);
      if (seen[n] && seen[n].kind === "lie") { seen[n].authors.push(L.by); return; }
      if (seen[n]) return;
      var o = { id: "L" + opts.length, text: L.text, kind: "lie", authors: [L.by], team: teamMode() ? player(L.by) && player(L.by).team : null };
      seen[n] = o; opts.push(o);
    });
    // fill with house answers so there is always something to doubt
    var minOpts = S.players.length <= 2 ? 5 : 4;
    var tf = window.WSH_FMT(q.answer), decoys = shuffle(q.decoys.slice());
    decoys = decoys.filter(function (d) { return window.WSH_FMT_OK(tf, window.WSH_FMT(d)); }).concat(decoys.filter(function (d) { return !window.WSH_FMT_OK(tf, window.WSH_FMT(d)); }));
    for (var i = 0; i < decoys.length && opts.length < minOpts; i++) {
      var dn = norm(decoys[i]); if (seen[dn]) continue;
      var d = { id: "H" + opts.length, text: decoys[i], kind: "house", authors: [] }; seen[dn] = d; opts.push(d);
    }
    S.options = shuffle(opts);
  }
  function canVote(p, o) {
    if (o.authors.indexOf(p.id) >= 0) return false;
    if (teamMode() && o.kind === "lie" && o.team === p.team) return false;
    return true;
  }
  function castVote(p, optId) {
    if (S.votes[p.id]) { sendTo(p); return; }
    var o = (S.options || []).filter(function (x) { return x.id === optId; })[0];
    if (!o || !canVote(p, o)) { sendTo(p); return; }
    S.votes[p.id] = o.id; sfx.vote(); save(); render(); broadcast();
    var voters = onlinePlayers().filter(function (x) { return S.options.some(function (o2) { return canVote(x, o2); }); });
    if (voters.every(function (x) { return S.votes[x.id]; })) setTimeout(function () { if (S.phase === "vote") advance(); }, 900);
  }

  function score() {
    var m = mult(), pts = {};
    S.players.forEach(function (p) { pts[p.id] = { truth: 0, fool: 0 }; });
    Object.keys(S.votes).forEach(function (vid) {
      var o = optById(S.votes[vid]); if (!o || !pts[vid]) return;
      if (o.kind === "truth") { pts[vid].truth += 2 * m; var v = player(vid); if (v) v.truths++; }
      else if (o.kind === "lie") o.authors.forEach(function (a) { if (pts[a] && a !== vid) { pts[a].fool += 1 * m; var ap = player(a); if (ap) ap.fooled++; } });
    });
    S.players.forEach(function (p) { var r = pts[p.id]; p.score += r.truth + r.fool; });
    S.roundPts = pts;
    var best = null; S.players.forEach(function (p) { if (pts[p.id].fool > 0 && (!best || pts[p.id].fool > pts[best.id].fool)) best = p; });
    S.bestLiar = best ? { id: best.id, fooled: pts[best.id].fool / m } : null;
    S.history.push({ q: S.qid, pts: pts });
  }
  function optById(id) { return (S.options || []).filter(function (o) { return o.id === id; })[0]; }
  function votersOf(o) { return Object.keys(S.votes).filter(function (v) { return S.votes[v] === o.id; }).map(player).filter(Boolean); }
  function revealSteps() {
    var steps = [], picked = S.options.filter(function (o) { return o.kind !== "truth" && votersOf(o).length; });
    picked.sort(function (a, b) { return votersOf(a).length - votersOf(b).length; });
    picked.forEach(function (o) { steps.push({ kind: "picked", id: o.id }); steps.push({ kind: "author", id: o.id }); });
    var truth = S.options.filter(function (o) { return o.kind === "truth"; })[0];
    steps.push({ kind: "truth", id: truth.id });
    var rest = S.options.filter(function (o) { return o.kind !== "truth" && !votersOf(o).length; });
    if (rest.length) steps.push({ kind: "rest" });
    if (!steps.length || steps[0].kind === "truth") steps.unshift({ kind: "intro" });
    return steps;
  }
  function playStep() {
    var st = S.reveal.steps[S.reveal.step];
    if (st.kind === "picked") sfx.drum();
    else if (st.kind === "author") { var o = optById(st.id); if (o.kind === "lie") sfx.fooled(); else sfx.boing(); }
    else if (st.kind === "truth") { sfx.truth(); confetti(false); }
  }

  function finishGame() {
    var board = ranked();
    var res = { at: Date.now(), mode: S.settings.mode, players: board.map(function (p) { return { name: p.name, av: p.av, score: p.score }; }) };
    var all = Store.get("wsh_results_v1", []); if (!Array.isArray(all)) all = []; all.unshift(res); Store.set("wsh_results_v1", all.slice(0, 10));
    sfx.win(); confetti(true);
  }
  function ranked() {
    return S.players.slice().sort(function (a, b) { return b.score - a.score || b.fooled - a.fooled; });
  }
  function teamBoard() {
    var t = []; for (var i = 0; i < S.settings.teamsN; i++) t.push({ i: i, name: TEAMS[i].name, icon: TEAMS[i].icon, color: TEAMS[i].color, score: 0, members: [] });
    S.players.forEach(function (p) { if (t[p.team]) { t[p.team].score += p.score; t[p.team].members.push(p); } });
    return t.sort(function (a, b) { return b.score - a.score; });
  }

  /* ---------------- what each phone sees ---------------- */
  function viewFor(p) {
    var q = curQ(), rank = ranked().indexOf(p) + 1;
    var v = { t: "state", phase: S.phase, code: S.code, paused: !!S.paused, round: S.round, rounds: S.rounds, mult: mult(),
      me: { name: p.name, av: p.av, color: p.color, score: p.score, rank: rank, team: teamMode() ? TEAMS[p.team] : null },
      players: S.players.length, left: timeLeft(), total: S.timer ? S.timer.total : 0 };
    if (["intro", "write", "read", "vote", "reveal"].indexOf(S.phase) >= 0 && q) { v.q = q.text; v.cat = catName(q.cat); }
    if (S.phase === "write") {
      var key = teamMode() ? "t" + p.team : p.id, L = S.lies[key];
      v.wrote = !!L; v.lie = L ? L.text : ""; v.err = S.lieErr[p.id] || ""; v.fmt = fmtText(q);
      if (teamMode() && L && L.by !== p.id) { var by = player(L.by); v.mateLie = (by ? by.name : "زميلك"); }
    }
    if (S.phase === "vote" || S.phase === "read") {
      v.options = S.options.map(function (o, i) { return { id: o.id, text: o.text, n: i + 1, ok: canVote(p, o) }; }).filter(function (o) { return o.ok; });
      v.voted = S.votes[p.id] || "";
    }
    if (S.phase === "reveal" || S.phase === "scores" || S.phase === "final") {
      var r = S.roundPts && S.roundPts[p.id]; v.got = r ? r.truth + r.fool : 0; v.gotTruth = r ? r.truth : 0; v.gotFool = r ? r.fool : 0;
    }
    return v;
  }
  // the same picture the TV shows, as plain data, so every phone can show it too (nothing hidden is included)
  function screenData() {
    var who = function (p, done) { return { av: p.av, name: p.name, color: p.color, done: !!done }; };
    if (S.phase === "lobby") return { who: S.players.map(function (p) { return who(p, p.online); }) };
    if (S.phase === "write") {
      if (teamMode()) return { teams: teamBoard().map(function (t) { return { icon: t.icon, name: t.name, color: t.color, done: !!S.lies["t" + t.i] }; }) };
      return { who: S.players.map(function (p) { return who(p, S.lies[p.id]); }) };
    }
    if (S.phase === "read" || S.phase === "vote") return { opts: S.options.map(function (o, i) { return { n: i + 1, text: o.text }; }), who: S.players.map(function (p) { return who(p, S.votes[p.id]); }) };
    if (S.phase === "reveal") return revealModel();
    if (S.phase === "scores" || S.phase === "final") {
      var rows;
      if (teamMode()) rows = teamBoard().map(function (t, i) { var got = t.members.reduce(function (s2, p) { var r = S.roundPts && S.roundPts[p.id]; return s2 + (r ? r.truth + r.fool : 0); }, 0); return { rank: i + 1, icon: t.icon, name: t.name, color: t.color, score: t.score, plus: S.phase === "scores" ? got : 0 }; });
      else rows = ranked().map(function (p, i) { var r = S.roundPts && S.roundPts[p.id]; return { rank: i + 1, av: p.av, name: p.name, color: p.color, score: p.score, plus: S.phase === "scores" && r ? r.truth + r.fool : 0 }; });
      var d = { rows: rows.slice(0, 12), total: rows.length, last: isLast() };
      var best = S.bestLiar && player(S.bestLiar.id);
      if (S.phase === "scores" && best) d.best = { av: best.av, name: best.name, fooled: S.bestLiar.fooled };
      if (S.phase === "final") {
        var b = ranked(), liar = b.slice().sort(function (x, y) { return y.fooled - x.fooled; })[0], sharp = b.slice().sort(function (x, y) { return y.truths - x.truths; })[0];
        d.awards = [];
        if (liar && liar.fooled) d.awards.push({ icon: "😈", label: "ملك الخداع", av: liar.av, name: liar.name, val: "عدد المخدوعين: " + liar.fooled });
        if (sharp && sharp.truths) d.awards.push({ icon: "🧠", label: "أكثر إجابات صحيحة", av: sharp.av, name: sharp.name, val: sharp.truths + " مرات" });
      }
      return d;
    }
    return null;
  }
  function fmtText(q) { return window.WSH_FMT_TEXT(window.WSH_FMT(q.answer)); }
  function sendTo(p) { if (net && p) { var v = viewFor(p); v.screen = inBroadcast ? screenCache : screenData(); net.send(p.id, v); } }

  var screenCache = null, inBroadcast = false;
  function broadcast() { screenCache = screenData(); inBroadcast = true; try { S.players.forEach(sendTo); } finally { inBroadcast = false; } }
  setInterval(function () { if (["write", "vote", "read", "intro"].indexOf(S.phase) >= 0) broadcast(); }, 5000);

  /* ---------------- TV rendering ---------------- */
  function catName(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].icon + " " + CATS[i].name; return ""; }
  function joinUrl() {
    var base = (S.settings.joinBase || "").trim() || (location.origin + location.pathname);
    var ps = params.get("ps"), local = params.get("local");
    return base + "?room=" + S.code + (ps ? "&ps=" + encodeURIComponent(ps) : "") + (local ? "&local=1" : "");
  }
  function qrSvg(text) {
    try { var qr = window.qrcode(0, "M"); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (e) { return ""; }
  }
  function avatar(p, extra) {
    return '<span class="av' + (p.online ? "" : " off") + (extra || "") + '" style="--c:' + p.color + '"><i>' + AV(p.av) + "</i><b>" + esc(p.name) + "</b></span>";
  }
  function ring() { var left = timeLeft(), t = S.timer ? S.timer.total : 1; return '<div class="ring" id="ring" style="--p:' + (left / t).toFixed(4) + '"><b>' + Math.ceil(left / 1000) + "</b></div>"; }

  function topbar() {
    var q = curQ();
    return '<header class="bar"><div class="bar-r"><span class="logo-s">وش الصح؟</span>' +
      (S.phase !== "lobby" ? '<span class="pill">الجولة <b>' + S.round + "</b> من " + S.rounds + "</span>" : "") +
      (q && S.phase !== "lobby" && S.phase !== "final" ? '<span class="pill">' + esc(catName(q.cat)) + "</span>" : "") +
      (mult() === 2 && S.phase !== "lobby" && S.phase !== "final" ? '<span class="pill hot">الجولة الأخيرة · النقاط ×2 🔥</span>' : "") +
      '</div><div class="bar-l"><span class="pill code" title="رمز الغرفة">🔑 ' + S.code + "</span>" +
      (S.phase !== "lobby" && S.phase !== "final" ? '<button class="btn sm" data-a="pause">' + (S.paused ? "▶ استئناف" : "⏸ إيقاف") + '</button><button class="btn sm" data-a="skip">⏭ التالي</button><button class="btn sm" data-a="redo">🔁 إعادة الجولة</button><button class="btn sm" data-a="end">✕ إنهاء</button>' : "") +
      '<button class="btn sm" data-a="sound">' + (S.settings.sound ? "🔊" : "🔇") + '</button><button class="btn sm" data-a="fs">⛶</button></div></header>';
  }
  function statusText() {
    return { online: "🟢 الغرفة جاهزة", connecting: "🟡 جاري تجهيز الغرفة… (تأكد أن التلفزيون متصل بالإنترنت)", reconnecting: "🟡 إعادة الاتصال…", offline: "🔴 لا يوجد إنترنت — جاري المحاولة", taken: "🟡 الرمز مستخدم، جاري المحاولة…", local: "🟢 وضع النوافذ المحلية", unsupported: "🔴 المتصفح لا يدعم الاتصال", error: "🔴 تعذّر تجهيز الغرفة", closed: "" }[netStatus] || "";
  }
  function renderStatus() { var el = $("#net"); if (el) el.textContent = statusText(); }

  function vLobby() {
    var st = S.settings, n = S.players.length, url = joinUrl();
    var playersHtml = n ? S.players.map(function (p) {
      return '<div class="pcard" style="--c:' + p.color + '"><span class="pav">' + AV(p.av) + '</span><b>' + esc(p.name) + "</b>" +
        (teamMode() ? '<button class="tchip" data-a="team" data-id="' + esc(p.id) + '" style="--t:' + TEAMS[p.team].color + '" title="تغيير الفريق">' + TEAMS[p.team].icon + " " + TEAMS[p.team].name + "</button>" : "") +
        (p.online ? "" : '<small class="offl">غير متصل</small>') + '<button class="kick" data-a="kick" data-id="' + esc(p.id) + '" aria-label="إزالة ' + esc(p.name) + '">✕</button></div>';
    }).join("") : '<p class="empty">امسحوا الرمز بالجوال وادخلوا بأسمائكم 📱</p>';
    var cats = st.mode === "family" ? "الفئات: مزيج العائلة" : st.cats.length === CATS.length ? "كل الفئات" : st.cats.length + " فئات";
    var tip = n > 10 && st.mode !== "teams" ? '<p class="tip">عددكم كبير 👏 جرّبوا <button class="link" data-a="mode" data-v="teams">نظام الفرق</button> حتى تبقى الإجابات واضحة.</p>' : "";
    return '<section class="lobby">' +
      '<div class="join">' +
        '<h1 class="title">وش <em>الصح؟</em></h1>' +
        '<p class="sub">اكتبوا كذبة مقنعة… واكتشفوا الحقيقة بين إجابات العائلة!</p>' +
        '<div class="qr">' + qrSvg(url) + "</div>" +
        '<p class="howjoin">امسح الرمز بكاميرا الجوال، أو افتح الرابط واكتب الرمز</p>' +
        '<div class="codebig">' + S.code.split("").map(function (c) { return "<i>" + c + "</i>"; }).join("") + "</div>" +
        '<p class="url" dir="ltr">' + esc(url) + '</p><p class="net" id="net">' + statusText() + "</p>" +
      "</div>" +
      '<div class="side">' +
        '<div class="modes">' + Object.keys(MODES).map(function (k) { return '<button class="mode' + (st.mode === k ? " on" : "") + '" data-a="mode" data-v="' + k + '"><span>' + MODES[k].icon + "</span><b>" + MODES[k].name + "</b><small>" + MODES[k].hint + "</small></button>"; }).join("") + "</div>" +
        '<div class="plist"><h2>اللاعبون <span>' + n + "</span></h2><div class=\"pgrid\">" + playersHtml + "</div>" + tip + "</div>" +
        '<div class="lfoot"><span class="summary">' + esc(MODES[st.mode].name) + " · " + (st.mode === "quick" ? Math.min(st.rounds, 6) : st.rounds) + " جولات · " + (st.level ? LEVELS[st.level - 1].name : "صعوبة منوّعة") + " · " + cats + " · كتابة " + (st.mode === "quick" ? Math.min(st.writeSec, 40) : st.writeSec) + "ث · تصويت " + (st.mode === "quick" ? Math.min(st.voteSec, 20) : st.voteSec) + "ث" + (st.mode === "teams" ? " · " + st.teamsN + " فرق" : "") + "</span>" +
        '<p class="reset-line"><button class="btn sm ghost" data-open-sets type="button">🎮 المجموعات</button></p>' +
        '<div class="row"><button class="btn" data-a="settings">⚙️ الإعدادات</button><button class="btn" data-a="howto">❓ طريقة اللعب</button><button class="btn go big" data-a="start"' + (n < 2 ? " disabled" : "") + ">ابدأ اللعب ▶</button></div></div>" +
      "</div></section>";
  }
  function vIntro() {
    var q = curQ();
    return '<section class="stage intro"><p class="rno">الجولة ' + S.round + " من " + S.rounds + "</p><h2 class=\"catbig\">" + esc(catName(q.cat)) + "</h2>" +
      '<p class="lvl">' + LEVELS[q.lvl - 1].name + "</p>" + (mult() === 2 ? '<p class="x2">🔥 الجولة الأخيرة — النقاط مضاعفة!</p>' : "") + "</section>";
  }
  function vWrite() {
    var q = curQ(), need = teamMode() ? teamBoard() : null;
    var who = teamMode()
      ? need.map(function (t) { var done = !!S.lies["t" + t.i]; return '<span class="tdone' + (done ? " ok" : "") + '" style="--c:' + t.color + '">' + t.icon + " " + t.name + (done ? " ✓" : " ✍️") + "</span>"; }).join("")
      : S.players.map(function (p) { return avatar(p, S.lies[p.id] ? " done" : ""); }).join("");
    return '<section class="stage write"><div class="qwrap"><p class="kicker">اكتبوا في جوالاتكم إجابة مزيّفة مقنعة 🤫</p><h2 class="question">' + esc(q.text) + '</h2><p class="fmt">✍️ اكتبوا: <b>' + esc(fmtText(q)) + "</b></p></div>" + ring() +
      '<div class="who">' + who + "</div></section>";
  }
  function optCard(o, i, cls, extra) {
    return '<div class="opt ' + (cls || "") + '" style="--i:' + i + '"><span class="num">' + (i + 1) + "</span><span class=\"tx\">" + esc(o.text) + "</span>" + (extra || "") + "</div>";
  }
  function vVote() {
    var q = curQ(), reading = S.phase === "read";
    var cols = S.options.length > 8 ? 3 : 2;
    var who = S.players.map(function (p) { return avatar(p, S.votes[p.id] ? " done" : ""); }).join("");
    return '<section class="stage vote"><div class="qhead"><h2 class="question sm">' + esc(q.text) + "</h2>" + (reading ? '<div class="readme">اقرؤوا الإجابات… 👀</div>' : ring()) + "</div>" +
      '<div class="opts c' + cols + '" style="--rows:' + Math.ceil(S.options.length / cols) + '">' + S.options.map(function (o, i) { return optCard(o, i, "in"); }).join("") + "</div>" +
      '<div class="who">' + (reading ? '<p class="kicker">بعد لحظات يبدأ التصويت من الجوال</p>' : who) + "</div></section>";
  }
  // what is visible at the current reveal step: drawn by the TV and sent to the phones as data
  function revealModel() {
    var q = curQ(), st = S.reveal.steps[S.reveal.step], done = {}, m = mult();
    S.reveal.steps.slice(0, S.reveal.step).forEach(function (s2) { if (s2.id) done[s2.id] = s2.kind; });
    if (st.kind === "rest") S.options.forEach(function (o) { if (o.kind !== "truth" && !votersOf(o).length) done[o.id] = "author"; });
    var who = function (list) { return list.map(function (p) { return { av: p.av, name: p.name, color: p.color }; }); };
    var opts = S.options.map(function (o, i) {
      var voters = votersOf(o), cur = st.id === o.id;
      var shownAuthor = done[o.id] === "author" || (cur && st.kind === "author") || (done[o.id] === "picked" && !cur);
      var x = { n: i + 1, text: o.text, spot: cur, voters: (cur || done[o.id] || st.kind === "rest") ? who(voters) : [], stamp: null };
      if (o.kind === "truth" && (cur || done[o.id])) x.stamp = { k: "ok" };
      else if (o.kind !== "truth" && (shownAuthor || st.kind === "rest" && done[o.id])) x.stamp = o.kind === "house" ? { k: "house" } : { k: "lie", by: who(o.authors.map(player).filter(Boolean)) };
      return x;
    });
    var cap = "", names = function (list) { return list.map(function (p) { return p.name; }).join(" و"); };
    if (st.kind === "intro") cap = "لحظة الحقيقة… 🥁";
    else if (st.kind === "picked") { var o1 = optById(st.id); cap = "اختيار " + names(votersOf(o1)) + ": «" + o1.text + "»… 🤔"; }
    else if (st.kind === "author") { var o2 = optById(st.id), n2 = votersOf(o2).length; cap = o2.kind === "house" ? "انخدعتوا بإجابة اللعبة! 🤖 بدون نقاط" : "😈 كذبة " + names(o2.authors.map(player).filter(Boolean)) + " · المخدوعين " + n2 + " (+" + n2 * m + ")"; }
    else if (st.kind === "truth") { var w = votersOf(optById(st.id)); cap = w.length ? "عرفها: " + names(w) + " 👏 (+" + 2 * m + ")" : "ولا أحد عرف الحقيقة! 😱"; }
    else if (st.kind === "rest") cap = "وهذي إجابات ما صدّقها أحد 😅";
    var showNote = st.kind === "truth" || S.reveal.step === S.reveal.steps.length - 1;
    return { opts: opts, cap: cap, note: showNote ? q.note : "", truth: st.kind === "truth" };
  }
  function stampHtml(x) {
    if (!x.stamp) return "";
    if (x.stamp.k === "ok") return '<span class="stamp ok">الحقيقة ✓</span>';
    if (x.stamp.k === "house") return '<span class="stamp no">إجابة اللعبة 🤖</span>';
    return '<span class="stamp no">كذبة ' + x.stamp.by.map(function (p) { return AV(p.av) + " " + esc(p.name); }).join(" و") + "</span>";
  }
  function vReveal() {
    var q = curQ(), M = revealModel(), cols = S.options.length > 8 ? 3 : 2;
    var html = M.opts.map(function (x, i) {
      var cls = (x.spot ? " spot" : "") + (x.stamp ? (x.stamp.k === "ok" ? " truth" : " lie") : "");
      var extra = (x.voters.length ? '<span class="voters">' + x.voters.map(function (v) { return '<i style="--c:' + v.color + '" title="' + esc(v.name) + '">' + AV(v.av) + "</i>"; }).join("") + "</span>" : "") + stampHtml(x);
      return optCard(x, i, cls, extra);
    }).join("");
    return '<section class="stage reveal"><div class="qhead"><h2 class="question sm">' + esc(q.text) + "</h2></div>" +
      '<div class="opts c' + cols + '" style="--rows:' + Math.ceil(S.options.length / cols) + '">' + html + '</div><div class="cap">' + esc(M.cap) + "</div>" +
      (M.note ? '<p class="note">💡 ' + esc(M.note) + "</p>" : "") + "</section>";
  }
  function vScores() {
    var rows, best = S.bestLiar && player(S.bestLiar.id);
    if (teamMode()) {
      var tb = teamBoard(), top = Math.max(1, tb[0].score);
      rows = tb.map(function (t, i) {
        var got = t.members.reduce(function (s, p) { var r = S.roundPts[p.id]; return s + (r ? r.truth + r.fool : 0); }, 0);
        return '<div class="srow" style="--c:' + t.color + ";--w:" + (t.score / top * 100).toFixed(1) + '%;--d:' + i * 0.12 + 's"><span class="rk">' + (i + 1) + '</span><span class="nm">' + t.icon + " " + t.name + '</span><span class="track"><span class="fill"></span></span><span class="sc">' + t.score + "</span>" + (got ? '<span class="plus">+' + got + "</span>" : "") + "</div>";
      }).join("");
    } else {
      var b = ranked(), top2 = Math.max(1, b[0] ? b[0].score : 1), shown = b.slice(0, 10);
      rows = shown.map(function (p, i) {
        var r = S.roundPts[p.id], got = r ? r.truth + r.fool : 0;
        return '<div class="srow" style="--c:' + p.color + ";--w:" + (p.score / top2 * 100).toFixed(1) + "%;--d:" + i * 0.08 + 's"><span class="rk">' + (i + 1) + '</span><span class="nm">' + AV(p.av) + " " + esc(p.name) + '</span><span class="track"><span class="fill"></span></span><span class="sc">' + p.score + "</span>" + (got ? '<span class="plus">+' + got + "</span>" : "") + "</div>";
      }).join("") + (b.length > 10 ? '<p class="more">و' + (b.length - 10) + " لاعبين آخرين</p>" : "");
    }
    return '<section class="stage scores"><h2 class="stitle">الترتيب بعد الجولة ' + S.round + "</h2>" +
      (best ? '<div class="award"><span>😈</span><div><small>أكبر مخادع في الجولة</small><b>' + AV(best.av) + " " + esc(best.name) + "</b><em>عدد المخدوعين: " + S.bestLiar.fooled + "</em></div></div>" : '<div class="award dim"><span>😇</span><div><small>ولا كذبة نجحت هالجولة</small><b>العائلة صاحية!</b></div></div>') +
      '<div class="board">' + rows + "</div>" + '<p class="kicker">' + (isLast() ? "النتيجة النهائية بعد لحظات…" : "الجولة التالية بعد لحظات…") + "</p></section>";
  }
  function vFinal() {
    var b = ranked(), liar = b.slice().sort(function (x, y) { return y.fooled - x.fooled; })[0], sharp = b.slice().sort(function (x, y) { return y.truths - x.truths; })[0];
    var podium;
    if (teamMode()) {
      var tb = teamBoard();
      podium = tb.slice(0, 3).map(function (t, i) { return '<div class="pod p' + (i + 1) + '" style="--c:' + t.color + '"><span class="pav">' + t.icon + "</span><b>" + t.name + "</b><em>" + t.score + '</em><span class="step">' + (i + 1) + "</span></div>"; });
    } else podium = b.slice(0, 3).map(function (p, i) { return '<div class="pod p' + (i + 1) + '" style="--c:' + p.color + '"><span class="pav">' + AV(p.av) + "</span><b>" + esc(p.name) + "</b><em>" + p.score + '</em><span class="step">' + (i + 1) + "</span></div>"; });
    var order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
    return '<section class="stage final"><h2 class="stitle">🏆 ' + (teamMode() ? "الفريق الفائز" : "البطل") + "</h2>" +
      '<div class="podium">' + order.join("") + "</div>" +
      '<div class="awards">' + (liar && liar.fooled ? '<div class="award"><span>😈</span><div><small>ملك الخداع</small><b>' + AV(liar.av) + " " + esc(liar.name) + "</b><em>عدد المخدوعين: " + liar.fooled + "</em></div></div>" : "") +
      (sharp && sharp.truths ? '<div class="award"><span>🧠</span><div><small>صاحب أكثر إجابات صحيحة</small><b>' + AV(sharp.av) + " " + esc(sharp.name) + "</b><em>" + sharp.truths + " مرات</em></div></div>" : "") + "</div>" +
      '<div class="row"><button class="btn go big" data-a="again">🔁 لعبة جديدة بنفس اللاعبين</button><button class="btn" data-a="lobby">⚙️ الإعدادات واللاعبين</button></div></section>';
  }

  var modal = null, resetArm = 0;
  function vModal() {
    if (!modal) return "";
    var st = S.settings, inner = "";
    if (modal === "settings") {
      var chip = function (attr, val, on, label) { return '<button class="chip" data-a="' + attr + '" data-v="' + val + '" aria-pressed="' + on + '">' + label + "</button>"; };
      inner = '<h2>⚙️ إعدادات اللعبة</h2><div class="sgrid">' +
        '<div class="field wide"><span class="label">الفئات ' + (st.mode === "family" ? '<small>(وضع العائلة يختار مزيجه بنفسه)</small>' : "") + '</span><div class="chips">' +
          CATS.map(function (c) { return chip("cat", c.id, st.cats.indexOf(c.id) >= 0, c.icon + " " + c.name); }).join("") +
          '<button class="chip ghost" data-a="cats-all">الكل</button><button class="chip ghost" data-a="cats-none">لا شيء</button></div></div>' +
        '<div class="field"><span class="label">الصعوبة</span><div class="chips">' + chip("level", 0, !st.level, "منوّعة") + LEVELS.map(function (l) { return chip("level", l.id, st.level === l.id, l.name); }).join("") + "</div></div>" +
        '<div class="field"><span class="label">عدد الجولات</span><div class="chips">' + [3, 5, 8, 10, 12, 15].map(function (n) { return chip("rounds", n, st.rounds === n, n); }).join("") + "</div></div>" +
        '<div class="field"><span class="label">وقت الكتابة</span><div class="chips">' + [30, 45, 60, 90, 120].map(function (n) { return chip("writeSec", n, st.writeSec === n, n + "ث"); }).join("") + "</div></div>" +
        '<div class="field"><span class="label">وقت التصويت</span><div class="chips">' + [15, 20, 30, 45, 60].map(function (n) { return chip("voteSec", n, st.voteSec === n, n + "ث"); }).join("") + "</div></div>" +
        '<div class="field"><span class="label">عدد الفرق (في نظام الفرق)</span><div class="chips">' + [2, 3, 4].map(function (n) { return chip("teamsN", n, st.teamsN === n, n + " فرق"); }).join("") + "</div></div>" +
        '<div class="field"><span class="label">رابط الدخول للجوالات <small>(اتركه فارغاً للتلقائي)</small></span><input id="join-base" dir="ltr" placeholder="' + esc(location.origin + location.pathname) + '" value="' + esc(st.joinBase) + '"></div>' +
        '<div class="field"><span class="label">غرفة جديدة</span><div class="chips"><button class="chip ghost" data-a="newcode">🔑 رمز جديد</button></div></div>' +
        "</div>" + (errMsg ? '<p class="error">' + esc(errMsg) + "</p>" : "") + '<div class="row"><button class="btn go" data-a="close">تم ✓</button></div>';
    } else if (modal === "howto") {
      inner = '<h2>❓ طريقة اللعب</h2><div class="howto"><ol>' +
        "<li>كل لاعب يمسح الرمز بجواله ويكتب اسمه ويختار صورته. ما يحتاج حساب.</li>" +
        "<li>يظهر سؤال على التلفزيون والجوالات. كل واحد يكتب <b>إجابة مزيّفة مقنعة</b> يبي يخدع فيها الباقين.</li>" +
        "<li>تنعرض كل الإجابات المزيّفة مع الإجابة الصحيحة مخلوطة بدون أسماء.</li>" +
        "<li>كل لاعب يصوّت من جواله للإجابة اللي يظنها صحيحة. ما تقدر تختار إجابتك، ولا تغيّر صوتك بعد التأكيد.</li>" +
        "<li>ينكشف من اختار إيش، وصاحب كل كذبة، والحقيقة.</li></ol>" +
        "<h3>النقاط</h3><ul><li>اخترت الحقيقة: <b>+2</b></li><li>كل شخص انخدع بكذبتك: <b>+1</b></li><li>الجولة الأخيرة: النقاط <b>×2</b> 🔥</li></ul>" +
        "<p>إذا كتبت الإجابة الصحيحة بالغلط، تطلب منك اللعبة تكتب غيرها. وإذا كان العدد قليلاً تضيف اللعبة إجابات مضللة من عندها (اختيارها ما يعطي نقاط).</p>" +
        "<h3>الأوضاع</h3><ul>" + Object.keys(MODES).map(function (k) { return "<li><b>" + MODES[k].icon + " " + MODES[k].name + ":</b> " + MODES[k].hint + "</li>"; }).join("") + "</ul>" +
        "<h3>الاتصال</h3><p>الجوالات تتصل بالتلفزيون مباشرة عبر الإنترنت (WebRTC). إذا انقطع جوال يرجع تلقائياً بنفس الاسم والنقاط.</p></div>" +
        '<div class="row"><button class="btn go" data-a="close">فهمت</button></div>';
    } else if (modal === "end") {
      inner = '<h2>إنهاء اللعبة؟</h2><p>تنعرض النتيجة النهائية الآن.</p><div class="row"><button class="btn go" data-a="end-yes">إنهاء وعرض النتائج</button><button class="btn" data-a="close">إلغاء</button></div>';
    } else if (modal === "redo") {
      inner = '<h2>إعادة الجولة؟</h2><p>تُلغى نقاط هذه الجولة ويظهر سؤال جديد.</p><div class="row"><button class="btn go" data-a="redo-yes">إعادة</button><button class="btn" data-a="close">إلغاء</button></div>';
    }
    return '<div class="modal-back" data-a="close-back"><div class="modal" role="dialog" aria-modal="true">' + inner + "</div></div>";
  }
  var errMsg = "";

  function passSync() {
    try {
      var played = BANK.filter(function (q) { return S.used.indexOf(q.id) >= 0; }).length;
      window.MAJLIS_PASS && MAJLIS_PASS.sets("wsh", BANK.length, BANK.length - played, { ids: BANK.map(function (q) { return q.id; }), used: S.used, reset: function () { S.used = []; save(); } });
    } catch (e) {}
  }
  function render() {
    passSync();
    var v = { lobby: vLobby, intro: vIntro, write: vWrite, read: vVote, vote: vVote, reveal: vReveal, scores: vScores, final: vFinal }[S.phase] || vLobby;
    var html;
    try { html = topbar() + '<main class="screen">' + v() + "</main>" + vModal() + (S.paused ? '<div class="paused">⏸ متوقف مؤقتاً<button class="btn go big" data-a="pause">▶ استئناف</button></div>' : ""); }
    catch (e) { console.error(e); S.phase = "lobby"; html = topbar() + '<main class="screen">' + vLobby() + "</main>"; }
    var focusId = document.activeElement && document.activeElement.id;
    $("#app").innerHTML = html;
    if (focusId) { var f = document.getElementById(focusId); if (f) f.focus(); }
  }

  /* ---------------- TV controls ---------------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b) return;
    var a = b.dataset.a, v = b.dataset.v, st = S.settings;
    if (a === "close-back" && e.target !== b) return;
    switch (a) {
      case "start": startGame(); break;
      case "reset-used":
        if (Date.now() - resetArm < 4000) { S.used = []; resetArm = 0; save(); toast("تم التصفير — كل الأسئلة صارت جديدة"); }
        else { resetArm = Date.now(); setTimeout(function () { if (S.phase === "lobby") render(); }, 4100); }
        render(); break;
      case "mode": st.mode = v; if (v === "teams") S.players.forEach(function (p, i) { p.team = i % st.teamsN; }); save(); render(); broadcast(); break;
      case "settings": modal = "settings"; errMsg = ""; render(); break;
      case "howto": modal = "howto"; render(); break;
      case "close": case "close-back":
        if (modal === "settings" && !st.cats.length) { errMsg = "اختر فئة واحدة على الأقل"; render(); return; }
        modal = null; render(); break;
      case "cat": var i = st.cats.indexOf(v); if (i >= 0) st.cats.splice(i, 1); else st.cats.push(v); save(); render(); break;
      case "cats-all": st.cats = CATS.map(function (c) { return c.id; }); save(); render(); break;
      case "cats-none": st.cats = []; save(); render(); break;
      case "level": st.level = +v; save(); render(); break;
      case "rounds": case "writeSec": case "voteSec": st[a] = +v; save(); render(); break;
      case "teamsN": st.teamsN = +v; S.players.forEach(function (p, idx) { p.team = idx % st.teamsN; }); save(); render(); break;
      case "newcode": S.code = newRoomCode(); S.players = []; save(); startNet(); modal = null; render(); toast("غرفة جديدة — امسحوا الرمز من جديد"); break;
      case "kick": var id = b.dataset.id, p = player(id); if (p) { S.players = S.players.filter(function (x) { return x.id !== id; }); S.kicked = (S.kicked || []).concat(id); if (S.lies) delete S.lies[id]; if (S.votes) delete S.votes[id]; net.send(id, { t: "kicked" }); save(); render(); } break;
      case "team": var tp = player(b.dataset.id); if (tp) { tp.team = (tp.team + 1) % st.teamsN; save(); render(); sendTo(tp); } break;
      case "pause": togglePause(); break;
      case "skip": advance(); break;
      case "redo": modal = "redo"; render(); break;
      case "redo-yes": modal = null; redoRound(); break;
      case "end": modal = "end"; render(); break;
      case "end-yes": modal = null; go("final"); break;
      case "again": S.used = S.used || []; startGame(); break;
      case "lobby": S.phase = "lobby"; S.timer = null; save(); render(); broadcast(); break;
      case "sound": st.sound = !st.sound; save(); render(); break;
      case "fs": try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {}); } catch (err) {} break;
    }
  });
  document.addEventListener("change", function (e) { if (e.target.id === "join-base") { S.settings.joinBase = e.target.value.trim(); save(); } });
  document.addEventListener("keydown", function (e) {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape" && modal) { modal = null; render(); }
    else if (e.key === " " && S.phase !== "lobby" && S.phase !== "final") { e.preventDefault(); togglePause(); }
    else if ((e.key === "n" || e.key === "N" || e.key === "ArrowLeft") && S.phase !== "lobby" && S.phase !== "final") advance();
  });
  function togglePause() {
    if (!S.timer) return;
    if (S.paused) { S.paused = false; S.timer.endsAt = Date.now() + S.timer.left; }
    else { S.timer.left = Math.max(0, S.timer.endsAt - Date.now()); S.paused = true; }
    save(); render(); broadcast();
  }

  var toastT;
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3000); }

  /* ---------------- sound (generated, no files) ---------------- */
  var AC = null;
  function ac() { if (!S.settings.sound) return null; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC.state === "running" ? AC : null; } catch (e) { return null; } }
  document.addEventListener("pointerdown", function () { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) {} });
  function tone(f, d, at, type, vol) { var a = ac(); if (!a) return; var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (at || 0); o.type = type || "sine"; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.05); }
  function slide(f1, f2, d, type, vol) { var a = ac(); if (!a) return; var o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type || "sine"; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d); g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.05); }
  var sfx = {
    join: function () { tone(660, 0.12, 0, "triangle"); tone(990, 0.15, 0.08, "triangle"); },
    start: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.18, i * 0.1, "triangle", 0.18); }); },
    pop: function () { tone(880, 0.08, 0, "square", 0.06); },
    vote: function () { tone(740, 0.1, 0, "triangle", 0.12); tone(1100, 0.12, 0.06, "triangle", 0.1); },
    tick: function () { tone(1200, 0.05, 0, "square", 0.05); },
    whoosh: function () { slide(300, 1200, 0.35, "sawtooth", 0.05); },
    drum: function () { for (var i = 0; i < 10; i++) tone(110 + (i % 2) * 20, 0.08, i * 0.07, "triangle", 0.2); },
    fooled: function () { slide(500, 180, 0.5, "sawtooth", 0.09); tone(140, 0.3, 0.45, "square", 0.08); },
    boing: function () { slide(200, 600, 0.25, "sine", 0.15); },
    truth: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.3, i * 0.09, "triangle", 0.2); }); },
    board: function () { tone(392, 0.15, 0, "triangle"); tone(523, 0.2, 0.12, "triangle"); },
    win: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.35, i * 0.14, "triangle", 0.2); }); }
  };

  /* ---------------- confetti ---------------- */
  function confetti(big) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cv = $("#confetti"), cx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
    var cols = ["#fbbf24", "#10b981", "#ef4444", "#3b82f6", "#ffffff", "#ec4899"], P = [];
    for (var i = 0; i < (big ? 240 : 140); i++) P.push({ x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.4, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 16 - 4, s: 6 + Math.random() * 8, r: Math.random() * 6, c: cols[i % cols.length] });
    var t0 = performance.now(), dur = big ? 4500 : 3000;
    (function f(now) { var k = (now - t0) / dur; cx.clearRect(0, 0, cv.width, cv.height); if (k >= 1) return; P.forEach(function (p) { p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.r += 0.1; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.globalAlpha = 1 - k; cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); cx.restore(); }); requestAnimationFrame(f); })(t0);
  }

  /* ---------------- start ---------------- */
  // resuming after a reload: give a running timer its remaining time back
  if (S.timer && !S.paused && S.timer.endsAt < Date.now() && ["write", "vote"].indexOf(S.phase) >= 0) S.timer.endsAt = Date.now() + 10000;
  S.players.forEach(function (p) { p.online = false; });
  startNet(); render();
  tickT = setInterval(tick, 250);
  window.WSH_HOST = { state: function () { return S; }, advance: advance, render: render };
})();
