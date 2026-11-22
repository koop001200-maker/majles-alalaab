/* «حروف وألوف» — محرك اللوحة والأسئلة (بلا أي اعتماد على الواجهة).
   · لوحة سداسية (Hex): الفريق 0 يربط الجانب الأيسر بالأيمن، والفريق 1 يربط العلوي بالسفلي.
   · التحقق من المسار المتصل بالبحث في الشبكة (BFS)، وحساب أقرب مسافة للفوز (Dijkstra).
   · تطبيع الإجابات العربية (الهمزات، التشكيل، «ال»، التاء المربوطة…). */
(function (root) {
  "use strict";

  /* ---------- اللوحة ---------- */
  var DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, 1], [1, -1]];
  function neighbors(i, n) {
    var r = Math.floor(i / n), c = i % n, out = [];
    for (var k = 0; k < 6; k++) {
      var rr = r + DIRS[k][0], cc = c + DIRS[k][1];
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
    return out;
  }
  function isStart(i, n, team) { return team === 0 ? i % n === 0 : Math.floor(i / n) === 0; }
  function isGoal(i, n, team) { return team === 0 ? i % n === n - 1 : Math.floor(i / n) === n - 1; }

  // owners: مصفوفة طولها n*n فيها -1 (محايد) أو 0 أو 1. يرجع مسار الخلايا الفائز أو null.
  function winPath(owners, n, team) {
    var prev = {}, queue = [], i;
    for (i = 0; i < n * n; i++) if (owners[i] === team && isStart(i, n, team)) { prev[i] = -1; queue.push(i); }
    while (queue.length) {
      var cur = queue.shift();
      if (isGoal(cur, n, team)) { var path = [], p = cur; while (p !== -1) { path.push(p); p = prev[p]; } return path.reverse(); }
      var nb = neighbors(cur, n);
      for (var k = 0; k < nb.length; k++) { var x = nb[k]; if (owners[x] === team && prev[x] === undefined) { prev[x] = cur; queue.push(x); } }
    }
    return null;
  }
  // أقل عدد من الخلايا المحايدة يحتاج الفريق أن يربحها ليكمل مساراً متصلاً (Infinity إن انسدّ الطريق)
  function remaining(owners, n, team) {
    var N = n * n, dist = [], done = [], i;
    for (i = 0; i < N; i++) { dist[i] = Infinity; done[i] = false; }
    function cost(j) { return owners[j] === team ? 0 : owners[j] === -1 ? 1 : Infinity; }
    for (i = 0; i < N; i++) if (isStart(i, n, team)) dist[i] = cost(i);
    for (;;) {
      var best = -1;
      for (i = 0; i < N; i++) if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
      if (best < 0) break;
      done[best] = true;
      var nb = neighbors(best, n);
      for (var k = 0; k < nb.length; k++) { var c = cost(nb[k]); if (c < Infinity && dist[best] + c < dist[nb[k]]) dist[nb[k]] = dist[best] + c; }
    }
    var m = Infinity;
    for (i = 0; i < N; i++) if (isGoal(i, n, team) && dist[i] < m) m = dist[i];
    return m;
  }

  /* ---------- الحروف ---------- */
  var LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // n*n حرفاً: بدون تكرار ما دام العدد ≤ 28، وإلا نكمل من حروف عشوائية
  function makeLetters(n) {
    var need = n * n, pool = shuffle(LETTERS), out = pool.slice(0, Math.min(need, 28));
    while (out.length < need) out.push(LETTERS[Math.floor(Math.random() * 28)]);
    return shuffle(out);
  }

  /* ---------- تطبيع الإجابات ---------- */
  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    s = s.replace(/[ً-ْـٰ]/g, "");           // تشكيل وتطويل
    s = s.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
    s = s.replace(/[^؀-ۿa-z0-9\s]/g, " ").replace(/[،؛؟]/g, " ");
    return s.replace(/\s+/g, " ").trim();
  }
  function core(s) {
    s = norm(s).replace(/ (عليه|عليها|عليهما) السلام$/, "").replace(/^(سوره|مسجد|جبل|غزوه|معركه|مدينه) /, "");
    return s.split(" ").map(function (w) { return w.length > 3 ? w.replace(/^ال/, "") : w; }).join(" ").trim();
  }
  function lev(a, b) {
    if (a === b) return 0; if (Math.abs(a.length - b.length) > 2) return 3;
    var prev = [], i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { var cur = [i]; for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }
  // هل نص اللاعب يطابق الإجابة المعتمدة (أو أحد بدائلها)؟
  function matches(input, q) {
    var inp = core(input); if (!inp) return false;
    var cands = [q.a].concat(q.alt || []);
    for (var k = 0; k < cands.length; k++) {
      var a = core(cands[k]); if (!a) continue;
      if (a === inp) return true;
      if (a.length >= 5 && lev(a, inp) <= 1) return true;                      // خطأ إملائي بسيط
      var aw = a.split(" "), iw = inp.split(" ");
      if (aw.length > 1 && iw.length === 1 && inp.length >= 4 && (aw[0] === inp || aw[aw.length - 1] === inp)) return true;  // جزء مميّز من اسم طويل
    }
    return false;
  }

  /* ---------- الأسئلة ---------- */
  // data = window.HU_DATA ({questions: {حرف: [...]}}); opts = {level: "medium|hard|mixed", cats: [..]}; used = كائن معرّفات
  function pool(data, letter, opts, used, level) {
    var list = (data.questions[letter] || []).filter(function (q) { return !used[q.id]; });
    if (opts.cats && opts.cats.length) { var f = list.filter(function (q) { return opts.cats.indexOf(q.c) >= 0; }); if (f.length) list = f; }
    if (level) { var g = list.filter(function (q) { return q.l === level; }); if (g.length) return g; }
    return list;
  }
  function pickQuestion(data, letter, opts, used, forceHard) {
    var lvl = forceHard ? 2 : opts.level === "hard" ? 2 : opts.level === "medium" ? 1 : 0;
    var list = pool(data, letter, opts, used, lvl);
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }
  function hasQuestion(data, letter, used) { return (data.questions[letter] || []).some(function (q) { return !used[q.id]; }); }

  var api = { neighbors: neighbors, winPath: winPath, remaining: remaining, makeLetters: makeLetters, LETTERS: LETTERS, norm: norm, matches: matches, pickQuestion: pickQuestion, hasQuestion: hasQuestion, isStart: isStart, isGoal: isGoal };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HU_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis);
