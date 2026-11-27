/* «سين جيم» — المنطق فقط (بدون واجهة): بناء اللوحة، الأدوار، النقاط، وسائل المساعدة، الإحصاءات.
   الواجهة في seenjeem-tv.js وجوال المتحكم في seenjeem-phone.js. يعمل في المتصفح وفي Node للاختبار. */
(function (root) {
  "use strict";
  var ROWS = [200, 200, 400, 400, 600, 600];
  var LIFE = ["two", "dbl"];
  var LIFE_NAME = { two: "جاوب جوابين", call: "اتصال بصديق", dbl: "دبل النقاط" };

  function shuffle(a, rnd) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* يختار سؤالين لكل (فئة، قيمة). difficulty: mix | easy | hard
     used: خريطة بالأسئلة التي لُعبت في مباريات سابقة (نفضّل غيرها). extra: أسئلة مضافة من المستخدم. */
  function buildBoard(data, cats, difficulty, used, extra, rnd) {
    rnd = rnd || Math.random; used = used || {}; extra = extra || [];
    var all = data.questions.concat(extra), cells = [];
    cats.forEach(function (cid) {
      [200, 400, 600].forEach(function (p) {
        var pool = all.filter(function (q) { return q.c === cid && q.p === p; });
        var fresh = pool.filter(function (q) { return !used[q.id]; }), old = pool.filter(function (q) { return used[q.id]; });
        var pick;
        if (fresh.length >= 2) {
          // الترتيب الأصلي = من الأسهل للأصعب
          pick = difficulty === "easy" ? fresh.slice(0, 2) : difficulty === "hard" ? fresh.slice(-2) : shuffle(fresh, rnd).slice(0, 2);
        } else {
          pick = fresh.concat(shuffle(old, rnd)).slice(0, 2);
        }
        pick = shuffle(pick, rnd);
        pick.forEach(function (q) { cells.push({ id: q.id, c: cid, p: p, q: q.q, a: q.a, st: 0, by: -1 }); });
      });
    });
    // الترتيب: عمود لكل فئة، 6 صفوف حسب القيمة
    var out = [];
    cats.forEach(function (cid, ci) { cells.filter(function (x) { return x.c === cid; }).sort(function (a, b) { return a.p - b.p; }).forEach(function (x) { out.push(x); }); });
    return out;
  }

  function newState(opts, data, used, extra, rnd) {
    var o = opts || {};
    function team(n, d) { return { name: String(n || d).slice(0, 18), score: 0, correct: 0, life: { two: 0, call: 0, dbl: 0 } }; }
    // من 2 إلى 4 فرق (names)، أو n0/n1 للتوافق مع القديم. 36 سؤالاً تنقسم بالتساوي على 2 و3 و4
    var DN = ["الفريق الأول", "الفريق الثاني", "الفريق الثالث", "الفريق الرابع"];
    var names = Array.isArray(o.names) && o.names.length >= 2 ? o.names.slice(0, 4) : [o.n0, o.n1];
    return {
      v: 1, teams: names.map(function (n, i) { return team(n, DN[i]); }), turn: 0, cats: o.cats.slice(),
      time: o.time || 30, diff: o.diff || "mix", phase: "board", cur: null, log: [],
      cells: buildBoard(data, o.cats, o.diff || "mix", used, extra, rnd), startedAt: Date.now()
    };
  }

  function Game(state) {
    var S = state;
    function remaining() { return S.cells.filter(function (c) { return !c.st; }).length; }
    function finish() { S.phase = "end"; S.cur = null; S.endedAt = Date.now(); }
    var api = {
      state: S,
      remaining: remaining,
      pick: function (i) {
        var c = S.cells[i];
        if (S.phase !== "board" || !c || c.st) return { ok: false };
        S.phase = "q"; S.cur = { i: i, revealed: false, attempt: 1, twoBy: -1, dblBy: -1, callUsed: false };
        return { ok: true };
      },
      lifeLeft: function (team) { return LIFE.filter(function (k) { return !S.teams[team].life[k]; }); },
      canUse: function (kind) {
        var cur = S.cur; if (S.phase !== "q" || !cur || cur.revealed) return false;
        if (S.teams[S.turn].life[kind]) return false;
        if (kind === "two") return cur.twoBy < 0;
        if (kind === "dbl") return cur.dblBy < 0;
        if (kind === "call") return !cur.callUsed;
        return false;
      },
      useLife: function (kind) {
        if (LIFE.indexOf(kind) < 0 || !api.canUse(kind)) return { ok: false };
        var t = S.turn; S.teams[t].life[kind] = 1;
        if (kind === "two") S.cur.twoBy = t; else if (kind === "dbl") S.cur.dblBy = t; else S.cur.callUsed = true;
        return { ok: true, kind: kind, team: t };
      },
      // المحاولة الأولى خاطئة مع «جاوب جوابين» → المحاولة الثانية
      wrongAttempt: function () {
        var cur = S.cur; if (S.phase !== "q" || !cur || cur.revealed || cur.twoBy < 0 || cur.attempt !== 1) return { ok: false };
        cur.attempt = 2; return { ok: true };
      },
      reveal: function () { if (S.phase !== "q" || !S.cur || S.cur.revealed) return { ok: false }; S.cur.revealed = true; return { ok: true }; },
      // team: 0 | 1 | -1 (لا أحد). لا تُحتسب النقاط إلا مرة واحدة للسؤال.
      award: function (team) {
        var cur = S.cur; if (S.phase !== "q" || !cur || !cur.revealed) return { ok: false };
        if (team !== -1 && !(team >= 0 && team < S.teams.length && team === Math.floor(team))) return { ok: false };
        var c = S.cells[cur.i]; if (c.st) return { ok: false };
        c.st = 1; c.by = team;
        var pts = 0, dbl = false;
        if (team >= 0) { dbl = cur.dblBy === team; pts = c.p * (dbl ? 2 : 1); S.teams[team].score += pts; S.teams[team].correct++; }
        S.log.push({ i: cur.i, c: c.c, p: c.p, team: team, pts: pts, dbl: cur.dblBy >= 0, dblWon: dbl, asked: S.turn, two: cur.twoBy >= 0, call: cur.callUsed });
        S.turn = (S.turn + 1) % S.teams.length; S.cur = null; S.phase = "board";
        if (!remaining()) finish();
        return { ok: true, pts: pts, dbl: dbl, team: team };
      },
      // عودة للّوحة بدون احتساب (إن اختاروا السؤال بالخطأ قبل الكشف ولم تُستخدم وسيلة)
      cancel: function () {
        var cur = S.cur; if (S.phase !== "q" || !cur || cur.revealed || cur.twoBy >= 0 || cur.dblBy >= 0 || cur.callUsed) return { ok: false };
        S.cur = null; S.phase = "board"; return { ok: true };
      },
      end: function () { finish(); },
      // -1 = تعادل على المركز الأول
      winner: function () { var sc = S.teams.map(function (t) { return t.score; }), top = Math.max.apply(null, sc); return sc.filter(function (x) { return x === top; }).length > 1 ? -1 : sc.indexOf(top); },
      leaders: function () { var sc = S.teams.map(function (t) { return t.score; }), top = Math.max.apply(null, sc); return sc.map(function (x, i) { return x === top ? i : -1; }).filter(function (i) { return i >= 0; }); },
      stats: function () {
        var T = S.teams, unanswered = S.cells.filter(function (c) { return !c.st || c.by < 0; }).length, idx = T.map(function (x, i) { return i; });
        var z = function (v) { return T.map(function () { return v; }); };
        var best = z(null), streak = z(0), run = z(0), dblWins = z(0), lifeUsed = z(0);
        S.log.forEach(function (e) {
          idx.forEach(function (t) {
            if (e.team === t) { run[t]++; streak[t] = Math.max(streak[t], run[t]); if (!best[t] || e.pts > best[t].pts) best[t] = e; if (e.dblWon) dblWins[t]++; } else run[t] = 0;
          });
        });
        idx.forEach(function (t) { lifeUsed[t] = LIFE.filter(function (k) { return T[t].life[k]; }).length; });
        return { scores: T.map(function (t) { return t.score; }), correct: T.map(function (t) { return t.correct; }), unanswered: unanswered, best: best, streak: streak, dblWins: dblWins, lifeUsed: lifeUsed, winner: api.winner() };
      }
    };
    return api;
  }

  function validState(s) {
    return !!s && s.v === 1 && Array.isArray(s.teams) && s.teams.length >= 2 && s.teams.length <= 4 && Array.isArray(s.cells) && s.cells.length === 36 && ["board", "q", "end"].indexOf(s.phase) >= 0 && s.turn >= 0 && s.turn < s.teams.length;
  }

  var api = { ROWS: ROWS, LIFE: LIFE, LIFE_NAME: LIFE_NAME, buildBoard: buildBoard, newState: newState, Game: Game, validState: validState, shuffle: shuffle };
  root.SJ_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
