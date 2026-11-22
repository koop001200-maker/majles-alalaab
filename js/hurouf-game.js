/* «حروف وألوف» — منطق المباراة (آلة حالات). لا يلمس الصفحة: الواجهة تقرأ state وتستدعي dispatch/tick.
   المراحل: board → ready → open → answering → judge → result → (roundwin | matchwin)  +  tiebreak عند انعدام الخلايا. */
(function (root) {
  "use strict";
  var E = root.HU_ENGINE || (typeof require !== "undefined" ? require("./hurouf-engine.js") : null);

  var READY_MS = 1400, OPEN_MS = 20000, RESULT_MS = 3400, RESULT_OK_MS = 2400, LOCK_EARLY_MS = 1500, MIN_GAP_MS = 700;

  function Match(settings, data, hooks, saved) {
    hooks = hooks || {};
    var S = settings, n = S.n, used = (saved && saved.used) || {};
    var st = saved && saved.state ? saved.state : null;
    var last = {}, locks = {};   // آخر ضغطة لكل لاعب + إيقافات مؤقتة (مبكّر)

    function say(name, a) { hooks.sfx && hooks.sfx(name, a); }
    function changed() { hooks.save && hooks.save(); hooks.emit && hooks.emit(); }
    function now() { return Date.now(); }

    function newBoard() {
      var letters = E.makeLetters(n), cells = [];
      for (var i = 0; i < n * n; i++) cells.push({ l: letters[i], o: -1, dead: false });
      return cells;
    }
    function owners() { return st.board.map(function (c) { return c.o; }); }
    function availableIdx() { var out = []; st.board.forEach(function (c, i) { if (c.o === -1 && !c.dead && E.hasQuestion(data, c.l, used)) out.push(i); }); return out; }
    function rem(team) { return E.remaining(owners(), n, team); }
    function isDecider() {
      var a = availableIdx().length;
      return a <= Math.max(2, Math.round(n * n * 0.2)) || Math.min(rem(0), rem(1)) <= 1;
    }
    function answerSecs() { return st.decider && S.final7 ? 7 : S.time; }

    function fresh(roundNo, roundWins, points, firstTurn) {
      return { phase: "board", board: newBoard(), turn: firstTurn, round: roundNo, wins: roundWins || [0, 0], points: points || [0, 0], cur: null, winPath: null, winTeam: -1, decider: false, paused: false, timeLeft: 0, readyLeft: 0, openLeft: 0, resultLeft: 0, log: [] };
    }
    if (!st) { st = fresh(1, [0, 0], [0, 0], 0); }
    else if (st.phase === "answering" || st.phase === "open") st.paused = true;
    else if (st.phase === "ready") st.paused = false; // مرحلة «جاهزين» ما فيها زر استئناف، فلا نجمّدها

    /* ---------- الاختيار ---------- */
    function choose(idx) {
      if (st.phase !== "board") return false;
      var c = st.board[idx]; if (!c || c.o !== -1 || c.dead) return false;
      var q = E.pickQuestion(data, c.l, S, used, st.decider);
      if (!q) { c.dead = true; changed(); return false; }
      used[q.id] = 1;
      st.cur = { idx: idx, q: q, tried: [], buzz: null, result: null, tiebreak: false, note: "" };
      st.phase = "ready"; st.readyLeft = READY_MS; st.paused = false; locks = {};
      say("start"); changed(); return true;
    }
    function startTiebreak() {
      // سؤال فاصل من حرف عشوائي لم يُستخدم سؤاله
      var tries = E.makeLetters(5).concat(E.LETTERS), q = null, l;
      for (var i = 0; i < tries.length && !q; i++) { l = tries[i]; q = E.pickQuestion(data, l, { level: "hard", cats: [] }, used, true); }
      if (!q) { used = {}; q = E.pickQuestion(data, E.LETTERS[0], { level: "hard", cats: [] }, used, true); }
      used[q.id] = 1;
      st.cur = { idx: -1, q: q, tried: [], buzz: null, result: null, tiebreak: true, letter: l, note: "سؤال فاصل" };
      st.phase = "ready"; st.readyLeft = READY_MS + 600; st.paused = false; locks = {};
      say("start"); changed();
    }

    /* ---------- الجرس ---------- */
    // يرجع: "ok" (فاز بالأولوية) | "early" (مبكّر) | "late" (متأخر/مقفل) | "spam" (تكرار)
    function buzz(team, pid, name) {
      pid = pid || "team" + team; var t = now();
      if (last[pid] && t - last[pid] < MIN_GAP_MS) return "spam";
      last[pid] = t;
      if (st.phase === "ready") { locks[pid] = t + LOCK_EARLY_MS; return "early"; }
      if (st.phase !== "open") return "late";
      if (locks[pid] && locks[pid] > t) return "early";
      if (st.cur.tried.indexOf(team) >= 0) return "late";
      st.cur.buzz = { team: team, pid: pid, name: name || "", t: t, rival: false };
      st.phase = "answering"; st.timeLeft = answerSecs() * 1000; st.paused = false;
      say("bell"); changed(); return "ok";
    }

    /* ---------- الإجابة والتحكيم ---------- */
    function reveal() {
      // «انتهت الإجابة» فقط: ينقل للتحكيم. لا تُكشف الإجابة للجميع هنا (المنافس قد يكون له دور بعدها)
      if (st.phase === "answering") { st.phase = "judge"; say("reveal"); changed(); return true; }
      return false;
    }
    function judge(ok) {
      if (st.phase !== "judge" && st.phase !== "answering") return false;
      var team = st.cur.buzz.team;
      if (ok) claim(team); else fail(team, "wrong");
      return true;
    }
    function claim(team) {
      var c = st.cur;
      c.result = { ok: true, team: team, name: c.buzz ? c.buzz.name : "" };
      if (c.tiebreak) { st.phase = "result"; st.resultLeft = RESULT_OK_MS; say("correct"); changed(); return; }
      var cell = st.board[c.idx]; cell.o = team; st.points[team] += st.decider ? 2 : 1;
      st.phase = "result"; st.resultLeft = RESULT_OK_MS; say("correct"); say("paint");
      st.log.push({ idx: c.idx, team: team, q: c.q.id });
      changed();
    }
    function fail(team, why) {
      var c = st.cur; c.tried.push(team); say(why === "timeout" ? "timeout" : "wrong");
      if (c.tried.length < 2) {
        var rival = 1 - team;
        c.buzz = { team: rival, pid: null, name: "", t: now(), rival: true };
        c.note = why === "timeout" ? "انتهى الوقت — الفرصة للمنافس" : "إجابة خاطئة — الفرصة للمنافس";
        st.phase = "answering"; st.timeLeft = answerSecs() * 1000; st.paused = false; changed();
      } else giveUp("both");
    }
    function giveUp(why) {
      var c = st.cur; c.result = { ok: false, why: why };
      st.phase = "result"; st.resultLeft = RESULT_MS; st.paused = false; changed();
    }
    function skip() {
      // سؤال بديل لنفس الحرف
      if (!st.cur || ["ready", "open", "answering", "judge"].indexOf(st.phase) < 0) return false;
      if (st.cur.tiebreak) { startTiebreak(); return true; }
      var c = st.board[st.cur.idx], q = E.pickQuestion(data, c.l, S, used, st.decider);
      if (!q) { giveUp("revealed"); return true; }
      used[q.id] = 1; st.cur = { idx: st.cur.idx, q: q, tried: [], buzz: null, result: null, tiebreak: false, note: "" };
      st.phase = "ready"; st.readyLeft = READY_MS; st.paused = false; locks = {}; say("start"); changed(); return true;
    }
    function pause(on) {
      if (st.phase !== "answering" && st.phase !== "open") return;
      st.paused = on == null ? !st.paused : !!on; changed();
    }

    /* ---------- بعد النتيجة ---------- */
    function roundWin(team, path) {
      st.wins[team]++; st.winTeam = team; st.winPath = path || null;
      st.phase = st.wins[team] >= S.target ? "matchwin" : "roundwin";
      say(st.phase === "matchwin" ? "champion" : "win"); changed();
    }
    function afterResult() {
      if (st.phase !== "result") return;
      var c = st.cur;
      if (c.tiebreak) {
        if (c.result && c.result.ok) { roundWin(c.result.team, null); return; }
        startTiebreak(); return;
      }
      if (c.result && c.result.ok) {
        var path = E.winPath(owners(), n, c.result.team);
        if (path) { roundWin(c.result.team, path); return; }
      }
      st.turn = 1 - st.turn; st.cur = null;
      if (!availableIdx().length) { resolveStuck(); return; }
      st.decider = isDecider(); if (st.decider) say("decider");
      st.phase = "board"; changed();
    }
    // لا توجد خلايا متاحة ولا مسار: الأقرب للفوز، ثم النقاط، ثم سؤال فاصل
    function resolveStuck() {
      var r0 = rem(0), r1 = rem(1), p = st.points;
      if (r0 !== r1) return roundWin(r0 < r1 ? 0 : 1, null), 0;
      if (p[0] !== p[1]) return roundWin(p[0] > p[1] ? 0 : 1, null), 0;
      st.decider = true; startTiebreak();
    }
    function next() {
      if (st.phase === "result") { st.resultLeft = 0; afterResult(); return; }
      if (st.phase === "roundwin") {
        var firstTurn = (st.round % 2) === 0 ? 0 : 1;
        st = fresh(st.round + 1, st.wins, st.points, firstTurn); say("start"); changed(); return;
      }
    }
    function rematch() {
      st = fresh(1, [0, 0], [0, 0], 0); say("start"); changed();
    }

    /* ---------- الوقت ---------- */
    function tick(dt) {
      if (st.paused) return;
      if (st.phase === "ready") { st.readyLeft -= dt; if (st.readyLeft <= 0) { st.phase = "open"; st.openLeft = OPEN_MS; say("open"); changed(); } }
      else if (st.phase === "open") { st.openLeft -= dt; if (st.openLeft <= 0) giveUp("nobody"); else hooks.emitTime && hooks.emitTime(); }
      else if (st.phase === "answering") {
        st.timeLeft -= dt;
        if (st.timeLeft <= 0) { st.timeLeft = 0; fail(st.cur.buzz.team, "timeout"); }
        else { var s = Math.ceil(st.timeLeft / 1000); if (s !== st._lastSec) { st._lastSec = s; if (s <= 3) say("tick"); } hooks.emitTime && hooks.emitTime(); }
      } else if (st.phase === "result") { st.resultLeft -= dt; if (st.resultLeft <= 0) afterResult(); }
    }

    return {
      get state() { return st; }, settings: S,
      get used() { return used; },
      choose: choose, buzz: buzz, reveal: reveal, judge: judge, skip: skip, pause: pause, next: next, rematch: rematch, tick: tick,
      availableIdx: availableIdx, rem: rem, isDecider: isDecider,
      constants: { READY_MS: READY_MS, OPEN_MS: OPEN_MS }
    };
  }

  var api = { Match: Match };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HU_GAME = api;
})(typeof window !== "undefined" ? window : globalThis);
