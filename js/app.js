/* «من أنا؟» — محرك اللعبة. يعمل محلياً بالكامل، ويحفظ في localStorage. */
(function () {
  "use strict";

  /* ---------- storage ---------- */
  var Store = {
    get: function (k, def) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var K = { bank: "mak_bank_v1", game: "mak_game_v1", settings: "mak_settings_v1", used: "mak_used_v1" };

  var CATS = window.CATEGORIES, LEVELS = window.LEVELS;
  var TEAM_COLORS = ["#2f9e8f", "#c9733a", "#7b6be0", "#d1497a", "#3f86d4", "#9a9a2e"];
  var DEFAULT_NAMES = ["فريق الصقور", "فريق النخيل", "فريق النجوم", "فريق القمر", "فريق الفرسان", "فريق الواحة"];
  var PLAYER_NAMES = ["اللاعب الأول", "اللاعب الثاني"];
  var BASE_POINTS = [4, 3, 2, 1];
  var GOLD_POINTS = [6, 5, 4, 3];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function catName(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].name; return id; }
  function lvlName(id) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === +id) return LEVELS[i].name; return id; }
  function pointsWord(n) { return n === 1 ? "نقطة" : n === 2 ? "نقطتان" : (n >= 3 && n <= 10 ? "نقاط" : "نقطة"); }

  /* ---------- bank ---------- */
  var bank = Store.get(K.bank, null);
  if (Array.isArray(bank)) bank = bank.filter(function (q) { return q && typeof q.id === "string" && Array.isArray(q.clues) && q.clues.length === 4 && q.answer; });
  if (!Array.isArray(bank) || !bank.length) bank = clone(window.DEFAULT_QUESTIONS);
  /* bank v2 added cards n1–n24: give them once to families who saved their own bank */
  if (Store.get("mak_bank_ver", 1) < 2) {
    var haveQ = {}; bank.forEach(function (q) { haveQ[q.id] = 1; });
    clone(window.DEFAULT_QUESTIONS).forEach(function (q) { if (/^n\d+$/.test(q.id) && !haveQ[q.id]) bank.push(q); });
    if (Store.get(K.bank, null)) Store.set(K.bank, bank);
    Store.set("mak_bank_ver", 2);
  }
  function saveBank() { Store.set(K.bank, bank); }
  function findQ(id) { for (var i = 0; i < bank.length; i++) if (bank[i].id === id) return bank[i]; return null; }

  /* ---------- settings ---------- */
  var defaultSettings = {
    format: "2",            // "players" | "2".."6"
    names: DEFAULT_NAMES.slice(),
    rounds: 8,
    level: 2,
    cats: CATS.map(function (c) { return c.id; }),
    answerMode: "turn",     // turn | open
    modes: { quick: false, double: false, steal: true, golden: false, random: false, final: false },
    timer: false, timerSec: 45, sound: true
  };
  var settings = Object.assign(clone(defaultSettings), Store.get(K.settings, {}) || {});
  if (["players", "2", "3", "4", "5", "6"].indexOf(String(settings.format)) < 0) settings.format = "2"; settings.format = String(settings.format);
  if (!Array.isArray(settings.names)) settings.names = DEFAULT_NAMES.slice();
  if (!Array.isArray(settings.cats)) settings.cats = CATS.map(function (c) { return c.id; });
  settings.rounds = Math.min(30, Math.max(3, Math.round(+settings.rounds) || 8));
  settings.level = [1, 2, 3].indexOf(+settings.level) >= 0 ? +settings.level : 2;
  settings.modes = Object.assign(clone(defaultSettings.modes), settings.modes || {});
  for (var ni = 0; ni < 6; ni++) if (typeof settings.names[ni] !== "string") settings.names[ni] = DEFAULT_NAMES[ni];
  function teamCount() { return settings.format === "players" ? 2 : +settings.format; }

  /* ---------- state ---------- */
  var view = location.hash === "#bank" ? "bank" : "home"; // the question bank is not linked from the screens; #bank opens it for maintenance
  var game = (function (g) {
    try {
      if (!g || !Array.isArray(g.teams) || g.teams.length < 2 || !Array.isArray(g.plan) || !g.plan.length || !g.settings || ["playing", "final", "over"].indexOf(g.status) < 0) return null;
      if (g.status === "playing" && (!g.round || typeof g.idx !== "number" || !g.plan[g.idx])) return null;
      if (g.status === "final" && !g.final) return null;
      if (!Array.isArray(g.log)) g.log = [];
      g.teams.forEach(function (t) { t.score = +t.score || 0; t.name = String(t.name || "فريق"); });
      return g;
    } catch (e) { return null; }
  })(Store.get(K.game, null));
  var modal = null;
  var bankFilter = { cat: "", lvl: "", q: "" };
  var pendingDelete = null;
  var timerId = null;

  function saveGame() { if (game) Store.set(K.game, game); else Store.del(K.game); }

  /* ---------- sound (WebAudio, no files) ---------- */
  var actx = null;
  function tone(freq, dur, type, vol, delay) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var t = actx.currentTime + (delay || 0);
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }
  var SFX = {
    reveal: function () { tone(660, 0.18, "triangle", 0.15); tone(990, 0.22, "triangle", 0.1, 0.08); },
    correct: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.3, "triangle", 0.18, i * 0.1); }); },
    wrong: function () { tone(220, 0.35, "sawtooth", 0.09); tone(160, 0.45, "sawtooth", 0.08, 0.15); },
    tick: function () { tone(880, 0.06, "square", 0.05); },
    timeout: function () { tone(330, 0.6, "square", 0.08); tone(247, 0.7, "square", 0.07, 0.2); },
    fanfare: function () { [392, 523, 659, 784, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.35, "triangle", 0.16, i * 0.14); }); }
  };

  /* ---------- question picking ---------- */
  function pickQuestion(cats, lvl, exclude) {
    var used = Store.get(K.used, []); if (!Array.isArray(used)) used = [];
    var src = window.MAJLIS_PASS ? MAJLIS_PASS.scoped("mak", bank, used) : bank;
    function pool(filterFn) { return src.filter(function (q) { return exclude.indexOf(q.id) < 0 && filterFn(q); }); }
    var tries = [
      function (q) { return cats.indexOf(q.cat) >= 0 && +q.lvl === +lvl; },
      function (q) { return cats.indexOf(q.cat) >= 0 && Math.abs(+q.lvl - +lvl) === 1; },
      function (q) { return cats.indexOf(q.cat) >= 0; },
      function () { return true; }
    ];
    // never repeat a card that was ever played, until the whole bank has been used; then start a new cycle
    var choose = function (onlyFresh) {
      for (var i = 0; i < tries.length; i++) {
        var p = pool(tries[i]);
        if (onlyFresh) p = p.filter(function (q) { return used.indexOf(q.id) < 0; });
        if (p.length) return p[Math.floor(Math.random() * p.length)];
      }
      return null;
    };
    var q = choose(true);
    if (!q) { Store.set(K.used, []); used = []; q = choose(false); }
    return q;
  }

  var resetArm = 0;
  function usedCount() { var u = Store.get(K.used, []); if (!Array.isArray(u)) return 0; return bank.filter(function (q) { return u.indexOf(q.id) >= 0; }).length; }
  function markUsed(id) {
    var used = Store.get(K.used, []); if (!Array.isArray(used)) used = [];
    if (used.indexOf(id) < 0) used.push(id);
    if (used.length >= bank.length) used = [id];
    Store.set(K.used, used);
  }

  function buildGame() {
    var n = teamCount();
    var names = settings.names.slice(0, n).map(function (nm, i) {
      nm = (nm || "").trim();
      return nm || (settings.format === "players" ? PLAYER_NAMES[i] : DEFAULT_NAMES[i]);
    });
    var teams = names.map(function (nm, i) { return { name: nm, score: 0, color: TEAM_COLORS[i] }; });
    var count = settings.rounds;
    var allCats = CATS.map(function (c) { return c.id; });
    var plan = [], exclude = [];
    for (var i = 0; i < count; i++) {
      var type = "normal";
      if (settings.modes.golden && i === count - 1) type = "golden";
      var cats = settings.cats, lvl = settings.level, random = false;
      if (settings.modes.random && type !== "golden") {
        cats = [allCats[Math.floor(Math.random() * allCats.length)]];
        lvl = 1 + Math.floor(Math.random() * 3);
        random = true;
      }
      if (type === "golden") lvl = 3;
      var q = pickQuestion(cats, lvl, exclude);
      if (!q) break;
      exclude.push(q.id);
      plan.push({ qid: q.id, type: type, random: random });
    }
    if (settings.modes.double) {
      var idx = plan.map(function (p, k) { return p.type === "normal" ? k : -1; }).filter(function (k) { return k >= 0; });
      if (idx.length) plan[idx[Math.floor(Math.random() * idx.length)]].double = true;
    }
    var finalQ = null;
    if (settings.modes.final) {
      var fq = pickQuestion(settings.cats, 3, exclude);
      if (fq) finalQ = fq.id;
    }
    return {
      settings: clone(settings),
      teams: teams,
      plan: plan,
      idx: 0,
      round: null,
      finalQ: finalQ,
      final: null,
      status: "playing",
      log: []
    };
  }

  function newRound() {
    var p = game.plan[game.idx];
    markUsed(p.qid);
    game.round = {
      revealed: 1, phase: "main", locked: [], winner: null, points: 0, done: false, startedAt: Date.now(),
      active: game.idx % game.teams.length, timeLeft: null, timedOut: false, msg: "", msgType: ""
    };
    // the first clue opens by itself
    freshClue = 0;
    var pts1 = pointsAt(1);
    setMsg(game.settings.answerMode === "open"
      ? "المعلومة 1 — الإجابة الآن بـ " + pts1 + " " + pointsWord(pts1) + " لأي فريق"
      : "دور " + game.teams[game.round.active].name + " — الإجابة الآن بـ " + pts1 + " " + pointsWord(pts1), "");
    startTimer();
  }

  function pointsAt(revealed) {
    var p = game.plan[game.idx];
    var table = p.type === "golden" ? GOLD_POINTS : BASE_POINTS;
    var v = table[Math.max(0, revealed - 1)];
    if (p.double) v *= 2;
    return v;
  }

  function timerSeconds() {
    if (game.settings.modes.quick) return 30;
    if (game.settings.timer) return +game.settings.timerSec || 45;
    return 0;
  }

  /* ---------- timer ---------- */
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function startTimer() {
    stopTimer();
    var secs = timerSeconds();
    var r = game.round;
    if (!secs || !r || r.done) { if (r) r.timeLeft = null; return; }
    r.timeLeft = secs; r.timedOut = false;
    timerId = setInterval(function () {
      if (!game || !game.round || game.round.done) { stopTimer(); return; }
      game.round.timeLeft--;
      if (game.round.timeLeft <= 5 && game.round.timeLeft > 0) SFX.tick();
      if (game.round.timeLeft <= 0) {
        game.round.timeLeft = 0; game.round.timedOut = true; stopTimer(); SFX.timeout();
        setMsg("انتهى الوقت! يقرر مقدم اللعبة: إجابة خاطئة أو كشف المعلومة التالية.", "bad");
        render();
        return;
      }
      var el = document.getElementById("timer");
      if (el) { el.textContent = game.round.timeLeft; el.classList.toggle("warn", game.round.timeLeft <= 5); }
    }, 1000);
  }

  function setMsg(m, t) { if (game && game.round) { game.round.msg = m; game.round.msgType = t || ""; } }

  /* ---------- round actions ---------- */
  function canAnswer(t) {
    var r = game.round;
    if (!r || r.done || r.revealed < 1) return false;
    if (r.locked.indexOf(t) >= 0) return false;
    if (game.settings.answerMode === "open") return true;
    if (r.phase === "main") return t === r.active;
    if (r.phase === "steal") return t !== r.active;
    return false;
  }

  function revealNext() {
    var r = game.round;
    if (!r || r.done || r.revealed >= 4) return;
    r.revealed++; freshClue = r.revealed - 1;
    r.locked = []; r.phase = "main";
    var pts = pointsAt(r.revealed);
    setMsg(game.settings.answerMode === "open"
      ? "المعلومة " + r.revealed + " — الإجابة الآن بـ " + pts + " " + pointsWord(pts) + " لأي فريق"
      : "دور " + game.teams[r.active].name + " — الإجابة الآن بـ " + pts + " " + pointsWord(pts), "");
    SFX.reveal();
    startTimer();
    commit();
  }

  function markCorrect(t) {
    if (!canAnswer(t)) return;
    var r = game.round;
    var pts = pointsAt(r.revealed);
    r.winner = t; r.points = pts; r.done = true; r.doneAt = Date.now(); freshDone = true;
    game.teams[t].score += pts;
    game.log.push({ qid: game.plan[game.idx].qid, team: t, points: pts, clue: r.revealed });
    stopTimer();
    SFX.correct();
    bumpTeam = t;
    commit();
  }

  function markWrong(t) {
    if (!canAnswer(t)) return;
    var r = game.round;
    SFX.wrong();
    shakeTeam = t;
    var others = game.teams.length - 1;
    if (game.settings.answerMode === "open") {
      r.locked.push(t);
      if (r.locked.length >= game.teams.length) {
        setMsg(r.revealed < 4 ? "أخطأت جميع الفرق — اكشف المعلومة التالية." : "انتهت المحاولات — اكشف الحل.", "bad");
      } else setMsg("إجابة خاطئة من " + game.teams[t].name + ". الفرق الأخرى يمكنها الإجابة.", "bad");
    } else if (r.phase === "main") {
      r.locked.push(t);
      if (game.settings.modes.steal && others > 0) {
        r.phase = "steal";
        setMsg("إجابة خاطئة! فرصة السرقة متاحة للفرق الأخرى بـ " + pointsAt(r.revealed) + " " + pointsWord(pointsAt(r.revealed)) + ".", "bad");
        startTimer();
      } else {
        setMsg(r.revealed < 4 ? "إجابة خاطئة — اكشف المعلومة التالية." : "انتهت المحاولات — اكشف الحل.", "bad");
        stopTimer();
      }
    } else if (r.phase === "steal") {
      r.locked.push(t);
      if (r.locked.length >= game.teams.length) {
        setMsg(r.revealed < 4 ? "فشلت محاولات السرقة — اكشف المعلومة التالية." : "انتهت المحاولات — اكشف الحل.", "bad");
        stopTimer();
      } else setMsg("محاولة سرقة خاطئة من " + game.teams[t].name + ".", "bad");
    }
    commit();
  }

  function revealAnswer() {
    var r = game.round;
    if (!r || r.done) return;
    r.done = true; r.doneAt = Date.now(); r.winner = null; r.points = 0; freshDone = true;
    game.log.push({ qid: game.plan[game.idx].qid, team: null, points: 0, clue: r.revealed });
    stopTimer();
    SFX.reveal();
    commit();
  }

  function nextRound() {
    if (!game.round || !game.round.done) return;
    if (game.idx + 1 < game.plan.length) {
      if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("mak")) return;
      game.idx++;
      newRound();
      commit();
    } else if (game.finalQ) {
      game.status = "final";
      game.round = null;
      markUsed(game.finalQ);
      game.final = { stage: "wager", wagers: game.teams.map(function () { return 0; }), marks: game.teams.map(function () { return null; }), revealed: 0 };
      commit();
    } else finishGame();
  }

  function finishGame() {
    stopTimer();
    game.status = "over";
    SFX.fanfare();
    commit();
  }

  /* ---------- render helpers ---------- */
  var bumpTeam = null, shakeTeam = null, freshClue = -1, freshDone = false;
  var setupTab = "teams";
  function commit() { saveGame(); render(); }

  function ranked(teams) {
    return teams.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) { return b.t.score - a.t.score; });
  }
  function rankList(teams) {
    var out = [], last = null, rank = 0;
    ranked(teams).forEach(function (row, k) { if (row.t.score !== last) { rank = k + 1; last = row.t.score; } out.push({ t: row.t, rank: rank }); });
    return out;
  }
  function standingsHTML(teams) {
    return '<div class="standings">' + rankList(teams).map(function (r) {
      return '<div class="standing"><span class="rank">' + r.rank + '</span><span class="dot" style="background:' + r.t.color + '"></span>' +
        '<span class="s-name">' + esc(r.t.name) + '</span><span class="s-score">' + r.t.score + "</span></div>";
    }).join("") + "</div>";
  }
  function rankingChips(teams) {
    return '<div class="ranking">' + rankList(teams).map(function (r) {
      return '<span class="rank-chip"><span class="r">' + r.rank + '</span><span class="dot" style="background:' + r.t.color + '"></span>' + esc(r.t.name) + " <b>" + r.t.score + "</b></span>";
    }).join("") + "</div>";
  }

  /* scoreboard; when withMarks the ✓/✗ buttons live on each team's card */
  function scoreboardHTML(activeIdx, lockedArr, withMarks) {
    return '<div class="scoreboard" data-n="' + game.teams.length + '" style="--n:' + game.teams.length + '">' + game.teams.map(function (t, i) {
      var cls = "team-card" + (i === activeIdx ? " active" : "") + (lockedArr && lockedArr.indexOf(i) >= 0 ? " locked" : "") +
        (i === bumpTeam ? " bump" : "") + (i === shakeTeam ? " shake" : "");
      var btns = "";
      if (withMarks) {
        var ok = canAnswer(i);
        btns = '<span class="btns"><button class="mark ok" data-correct="' + i + '"' + (ok ? "" : " disabled") + ' title="إجابة صحيحة" aria-label="إجابة صحيحة من ' + esc(t.name) + '">✓</button>' +
          '<button class="mark no" data-wrong="' + i + '"' + (ok ? "" : " disabled") + ' title="إجابة خاطئة" aria-label="إجابة خاطئة من ' + esc(t.name) + '">✗</button></span>';
      }
      var adj = '<span class="adj"><button data-act="adj" data-t="' + i + '" data-d="1" title="زيادة نقطة" aria-label="زيادة نقطة لـ ' + esc(t.name) + '">+</button><button data-act="adj" data-t="' + i + '" data-d="-1" title="إنقاص نقطة" aria-label="إنقاص نقطة من ' + esc(t.name) + '">−</button></span>';
      return '<div class="' + cls + '" style="--team:' + t.color + '"><span class="name" title="' + esc(t.name) + '">' + esc(t.name) + '</span><span class="scorewrap"><span class="score">' + t.score + "</span>" + adj + "</span>" + btns + "</div>";
    }).join("") + "</div>";
  }

  function settingsSummary() {
    var n = teamCount();
    var who = settings.format === "players" ? "لاعبان" : (n === 2 ? "فريقان" : n + " فرق");
    var on = Object.keys(settings.modes).filter(function (k) { return settings.modes[k]; }).length + (settings.timer ? 1 : 0);
    return who + " · " + settings.rounds + " جولات · مستوى " + lvlName(settings.level) + " · " + (settings.cats.length === CATS.length ? "كل الأقسام" : settings.cats.length + " أقسام") + " · " + (on === 0 ? "بدون أوضاع إضافية" : on === 1 ? "وضع واحد مفعّل" : on === 2 ? "وضعان مفعّلان" : on + " أوضاع مفعّلة");
  }

  var PRESETS = {
    classic: { name: "كلاسيكي", desc: "النقاط الأساسية + السرقة", modes: { quick: false, double: false, steal: true, golden: false, random: false, final: false }, timer: false },
    hype: { name: "حماسي", desc: "مضاعف + ذهبية + نهائية", modes: { quick: false, double: true, steal: true, golden: true, random: false, final: true }, timer: true },
    fast: { name: "سريع", desc: "30 ثانية + عشوائي", modes: { quick: true, double: false, steal: true, golden: false, random: true, final: false }, timer: false }
  };
  function presetActive(key) {
    var p = PRESETS[key];
    return Object.keys(p.modes).every(function (k) { return !!settings.modes[k] === p.modes[k]; }) && !!settings.timer === p.timer;
  }

  /* ---------- views ---------- */
  function vHome() {
    var resumable = game && game.status !== "over";
    return '<section class="home">' +
      '<div class="logo-star" aria-hidden="true"><span>؟</span></div>' +
      '<h1 class="title">من أنا؟</h1>' +
      '<p class="subtitle">أربع معلومات تنكشف تباعاً، ومن يعرف الجواب أولاً يكسب النقاط الأعلى.</p>' +
      '<div class="home-stack">' +
      (resumable ? '<button class="btn primary big" data-act="resume">استئناف اللعبة (الجولة ' + (game.idx + 1) + ")</button>" : "") +
      '<button class="btn ' + (resumable ? "" : "primary ") + 'big start" data-act="quick">ابدأ اللعب</button>' +
      '<div class="row"><button class="btn big ghost" data-act="trial">تجربة سريعة</button><button class="btn big ghost" data-act="howto">طريقة اللعب</button></div>' +
      '<button class="btn big" data-act="setup">الإعدادات</button>' +
      "</div></section>";
  }

  function vSetup(err) {
    var n = teamCount(), isP = settings.format === "players";
    var formats = [["players", "لاعبان"], ["2", "فريقان"], ["3", "3 فرق"], ["4", "4 فرق"], ["5", "5 فرق"], ["6", "6 فرق"]];
    var names = "";
    for (var i = 0; i < n; i++) {
      var val = settings.names[i];
      if (isP && (!val || DEFAULT_NAMES.indexOf(val) >= 0)) val = PLAYER_NAMES[i];
      if (!isP && PLAYER_NAMES.indexOf(val) >= 0) val = DEFAULT_NAMES[i];
      names += '<div class="team-input"><span class="dot" style="background:' + TEAM_COLORS[i] + '"></span>' +
        '<input id="team-name-' + i + '" data-team-name="' + i + '" maxlength="20" value="' + esc(val || "") + '" aria-label="اسم ' + (isP ? "اللاعب" : "الفريق") + " " + (i + 1) + '"></div>';
    }
    var modeDefs = [
      ["steal", "فرصة السرقة", "بعد خطأ صاحب الدور تجيب الفرق الأخرى"],
      ["quick", "التحدي السريع", "30 ثانية لكل معلومة"],
      ["double", "التحدي المزدوج", "جولة عشوائية بنقاط ×2"],
      ["golden", "الجولة الذهبية", "آخر جولة خبراء تبدأ بـ 6 نقاط"],
      ["random", "التحدي العشوائي", "القسم والمستوى يختارهما النظام"],
      ["final", "الجولة النهائية", "مراهنة الفرق على نقاطها"]
    ];
    var colTeams = '<div class="setup-col panel' + (setupTab === "teams" ? " on" : "") + '">' +
      '<div class="field"><span class="label">نمط اللعب</span><div class="chips">' +
      formats.map(function (f) { return '<button class="chip" data-format="' + f[0] + '" aria-pressed="' + (settings.format === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="field"><span class="label">أسماء ' + (isP ? "اللاعبين" : "الفرق") + '</span><div class="team-inputs">' + names + "</div>" + nmChips(settings.names.slice(0, n)) + "</div>" +
      '<div class="field"><span class="label">عدد الجولات</span><div class="stepper">' +
      '<button class="btn" data-act="rounds-" aria-label="إنقاص">−</button><output id="rounds-out">' + settings.rounds + "</output>" +
      '<button class="btn" data-act="rounds+" aria-label="زيادة">+</button></div><p class="hint">مضاعفات عدد الفرق تعطي كل فريق نفس عدد الأدوار.</p></div>' +
      '<div class="field"><span class="label">طريقة الإجابة</span><div class="chips">' +
      '<button class="chip" data-answer-mode="turn" aria-pressed="' + (settings.answerMode === "turn") + '">بالدور</button>' +
      '<button class="chip" data-answer-mode="open" aria-pressed="' + (settings.answerMode === "open") + '">الأسرع يجيب</button></div>' +
      '<p class="hint">' + (settings.answerMode === "turn" ? "كل جولة لفريق يجيب أولاً." : "أي فريق يجيب أولاً، والمخطئ ينتظر المعلومة التالية.") + "</p></div></div>";
    var colQs = '<div class="setup-col panel' + (setupTab === "questions" ? " on" : "") + '">' +
      '<div class="field"><span class="label">مستوى الصعوبة</span><div class="chips">' +
      LEVELS.map(function (l) { return '<button class="chip" data-level="' + l.id + '" aria-pressed="' + (+settings.level === l.id) + '">' + l.name + "</button>"; }).join("") +
      '</div><p class="hint">' + ["", "معلومات معروفة نسبياً تحتاج إلى انتباه وربط.", "معلومات أقل شهرة تتطلب معرفة جيدة بالسيرة والقرآن والتاريخ.", "تفاصيل دقيقة تحتاج إلى معرفة واسعة."][settings.level] + "</p></div>" +
      '<div class="field"><span class="label">الأقسام</span><div class="chips">' +
      CATS.map(function (c) { return '<button class="chip" data-cat="' + c.id + '" aria-pressed="' + (settings.cats.indexOf(c.id) >= 0) + '">' + c.name + "</button>"; }).join("") +
      '</div><div class="chips"><button class="btn small ghost" data-act="cats-all">تحديد الكل</button><button class="btn small ghost" data-act="cats-none">إلغاء الكل</button></div></div></div>';
    var colModes = '<div class="setup-col panel' + (setupTab === "modes" ? " on" : "") + '">' +
      '<div class="field"><span class="label">اختيار سريع</span><div class="presets">' +
      Object.keys(PRESETS).map(function (k) { return '<button class="preset" data-preset="' + k + '" aria-pressed="' + presetActive(k) + '"><b>' + PRESETS[k].name + "</b><small>" + PRESETS[k].desc + "</small></button>"; }).join("") +
      "</div></div>" +
      '<div class="field"><span class="label">الأوضاع</span><div class="toggles">' +
      modeDefs.map(function (m) {
        return '<label class="toggle"><input type="checkbox" id="mode-' + m[0] + '" data-mode="' + m[0] + '"' + (settings.modes[m[0]] ? " checked" : "") + '><span><b>' + m[1] + "</b><small>" + m[2] + "</small></span></label>";
      }).join("") +
      '<label class="toggle"><input type="checkbox" id="opt-timer" data-opt="timer"' + (settings.timer ? " checked" : "") + '><span><b>المؤقت</b><small>' + settings.timerSec + ' ثانية لكل معلومة مع صوت</small></span></label>' +
      '<label class="toggle"><input type="checkbox" id="opt-sound" data-opt="sound"' + (settings.sound ? " checked" : "") + '><span><b>المؤثرات الصوتية</b><small>عند الكشف والإجابة</small></span></label>' +
      "</div></div></div>";
    var tabs = [["teams", "الفرق"], ["questions", "الأسئلة"], ["modes", "الأوضاع"]];
    return '<section class="screen">' +
      '<div class="page-head"><h2>إعداد اللعبة</h2><button class="btn ghost" data-act="home">الصفحة الأولى</button></div>' +
      '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (setupTab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<div class="setup-body">' + colTeams + colQs + colModes + "</div>" +
      (err ? '<p class="error">' + esc(err) + "</p>" : "") +
      '<div class="setup-foot"><span class="summary">' + esc(settingsSummary()) + '</span><button class="btn primary big" data-act="start">ابدأ التحدي</button></div>' +
      "</section>";
  }

  function vHowto() {
    return '<section class="screen"><div class="page-head"><h2>طريقة اللعب</h2><button class="btn ghost" data-act="home">الصفحة الأولى</button></div>' +
      '<div class="scroll"><div class="howto panel">' +
      "<p>في كل جولة تظهر بطاقة عن شخصية أو حدث أو مكان أو مفهوم إسلامي. يكشف مقدم اللعبة المعلومات واحدة تلو الأخرى من الأصعب إلى الأسهل، والهدف أن تعرف الإجابة بأقل عدد من المعلومات.</p>" +
      "<h3>النقاط</h3>" +
      '<div class="points-table"><div><b>4</b>بعد المعلومة الأولى</div><div><b>3</b>بعد الثانية</div><div><b>2</b>بعد الثالثة</div><div><b>1</b>بعد الرابعة</div></div>' +
      "<ul><li>الإجابة الخاطئة لا تحصل على نقاط، ويستمر كشف المعلومات حتى تنتهي المحاولات أو يُكشف الحل.</li>" +
      "<li>بعد كل جولة تظهر الإجابة مع شرح مختصر ومعلومة إضافية ومصدر.</li></ul>" +
      "<h3>دور مقدم اللعبة</h3><ol>" +
      "<li>اضغط «اكشف المعلومة» لإظهار المعلومة التالية.</li>" +
      "<li>عندما يجيب فريق، اضغط ✓ أو ✗ على بطاقة ذلك الفريق في أعلى الشاشة.</li>" +
      "<li>اضغط «اكشف الحل» لإنهاء الجولة، ثم «الجولة التالية».</li></ol>" +
      "<p>لا تظهر الإجابة ولا المعلومات القادمة على الشاشة قبل أن يكشفها المقدم.</p>" +
      "<h3>طريقتا الإجابة</h3><ul><li><b>بالدور:</b> كل جولة لفريق يجيب أولاً، ومع «فرصة السرقة» تستطيع الفرق الأخرى الإجابة بعد خطئه.</li>" +
      "<li><b>الأسرع يجيب:</b> أي فريق يجيب أولاً، والفريق المخطئ ينتظر المعلومة التالية.</li></ul>" +
      "<h3>الأوضاع الإضافية</h3><ul>" +
      "<li><b>التحدي السريع:</b> 30 ثانية لكل معلومة.</li><li><b>التحدي المزدوج:</b> جولة واحدة بنقاط مضاعفة.</li>" +
      "<li><b>فرصة السرقة:</b> بعد خطأ صاحب الدور.</li><li><b>الجولة الذهبية:</b> سؤال خبراء من 6 نقاط في آخر جولة (6، 5، 4، 3).</li>" +
      "<li><b>التحدي العشوائي:</b> القسم والمستوى يختارهما النظام.</li>" +
      "<li><b>الجولة النهائية:</b> يراهن كل فريق بجزء من رصيده، تكتب الفرق إجاباتها سراً، ثم تُكشف: الصحيح يكسب رهانه والخاطئ يخسره.</li></ul>" +
      "<h3>اختصارات لوحة المفاتيح</h3><ul><li><kbd>مسافة</kbd> كشف المعلومة التالية</li><li><kbd>Enter</kbd> كشف الحل / الجولة التالية</li><li><kbd>F</kbd> ملء الشاشة</li></ul>" +
      "<h3>للعرض على التلفزيون</h3><p>اعرض اللعبة على الشاشة الكبيرة واضغط «ملء الشاشة». النتائج تُحفظ تلقائياً، ولو أُغلقت الصفحة تستأنف اللعبة من الرئيسية.</p>" +
      "</div></div></section>";
  }

  function topbarHTML(badges) {
    return '<div class="topbar"><div class="round-info">' + badges + "</div>" +
      '<div class="top-actions"><button class="btn ghost" data-act="scores" title="تعديل النقاط">±<span class="lbl"> النقاط</span></button><button class="btn ghost" data-act="fullscreen" title="ملء الشاشة">⛶<span class="lbl"> ملء الشاشة</span></button>' +
      '<button class="btn ghost" data-act="sound" title="الصوت">' + (settings.sound ? "🔊" : "🔇") + '<span class="lbl"> الصوت</span></button>' +
      '<button class="btn ghost" data-act="end-confirm" title="إنهاء اللعبة">✕<span class="lbl"> إنهاء</span></button></div></div>';
  }

  function vGame() {
    var p = game.plan[game.idx], q = findQ(p.qid), r = game.round;
    if (!q) return '<section class="screen"><div class="panel"><p>تعذر العثور على سؤال هذه الجولة (ربما حُذف من البنك).</p></div><div class="hostbar"><button class="btn primary" data-act="skip">تخطي الجولة</button></div></section>';
    var badges = "<span>الجولة " + (game.idx + 1) + " من " + game.plan.length + '</span><span class="pill">' + esc(catName(q.cat)) + '</span><span class="pill">' + esc(lvlName(q.lvl)) + "</span>";
    if (p.type === "golden") badges += '<span class="pill gold-pill">الجولة الذهبية</span>';
    if (p.double) badges += '<span class="pill double">نقاط ×2</span>';
    if (p.random) badges += '<span class="pill random">عشوائي</span>';
    if (game.trial) badges += '<span class="pill gold-pill">تجربة</span>';

    var inner, bar;
    if (r.done) {
      var award = r.winner != null
        ? '<div class="award good">' + esc(game.teams[r.winner].name) + " + " + r.points + " " + pointsWord(r.points) + " (بعد المعلومة " + r.revealed + ")</div>"
        : '<div class="award muted">لم يحصل أحد على نقاط في هذه الجولة</div>';
      inner = '<div class="reveal-box' + (freshDone ? " fresh" : "") + '"><div class="muted">الإجابة الصحيحة</div><div class="answer">' + esc(q.answer) + "</div>" + award +
        '<div class="info-grid"><div class="info"><h4>الشرح</h4><p>' + esc(q.explain) + '</p></div>' +
        '<div class="info"><h4>معلومة إضافية</h4><p>' + esc(q.extra) + '</p></div>' +
        '<div class="info"><h4>المصدر</h4><p>' + esc(q.source) + "</p></div></div>" + rankingChips(game.teams) + "</div>";
      var last = game.idx + 1 >= game.plan.length;
      bar = '<button class="btn primary big" data-act="next">' + (last ? (game.finalQ ? "إلى الجولة النهائية" : "عرض النتائج") : "الجولة التالية") + "</button>";
    } else {
      var clues = "";
      for (var i = 0; i < 4; i++) {
        var shown = i < r.revealed, pts = pointsAt(i + 1);
        clues += '<li class="clue ' + (shown ? "revealed" : "hidden") + (shown && i === r.revealed - 1 ? " current" : "") + (i === freshClue ? " fresh" : "") + '">' +
          '<span class="num"><b>' + (i + 1) + "</b><small>" + pts + " " + pointsWord(pts) + "</small></span>" +
          '<span class="text">' + (shown ? esc(q.clues[i]) : "• • •") + "</span></li>";
      }
      inner = '<ol class="clues">' + clues + "</ol>";
      bar = '<button class="btn primary big" data-act="reveal"' + (r.revealed >= 4 ? " disabled" : "") + ">" + (r.revealed === 0 ? "اكشف المعلومة الأولى" : "اكشف المعلومة التالية") + "</button>" +
        '<button class="btn big" data-act="answer"' + (r.revealed === 0 ? " disabled" : "") + ">اكشف الحل</button>";
    }
    var timer = (!r.done && r.timeLeft != null) ? '<span id="timer" class="timer' + (r.timeLeft <= 5 ? " warn" : "") + '">' + r.timeLeft + "</span>" : "";
    var statusText = "", statusCls = "muted";
    if (!r.done) {
      if (r.msg) { statusText = r.msg; statusCls = r.msgType; }
      else if (r.revealed === 0) statusText = game.settings.answerMode === "turn" ? "دور " + game.teams[r.active].name + " — اكشف المعلومة الأولى" : "جاهزون؟ اكشف المعلومة الأولى";
    }
    var marks = !r.done && r.revealed > 0;
    return '<section class="screen game">' + topbarHTML(badges) +
      scoreboardHTML(game.settings.answerMode === "turn" && !r.done ? r.active : -1, r.done ? [] : r.locked, marks) +
      '<article class="qcard' + (p.type === "golden" ? " golden" : "") + (r.done && r.winner != null && freshDone ? " flash-good" : "") + '">' +
      '<div class="qcard-head"><h3>' + (r.done ? "انكشفت الهوية!" : "من أنا؟") + "</h3>" + timer + "</div>" + inner +
      (r.done ? "" : '<div class="status ' + statusCls + '">' + esc(statusText) + "</div>") + "</article>" +
      '<div class="hostbar">' + bar + "</div></section>";
  }

  function vFinal() {
    var f = game.final, q = findQ(game.finalQ);
    var head = topbarHTML('<span class="pill gold-pill">الجولة النهائية</span>' + (q ? '<span class="pill">' + esc(catName(q.cat)) + "</span>" : "")) + scoreboardHTML(-1, [], false);
    if (!q) return '<section class="screen">' + head + '<div class="hostbar"><button class="btn primary" data-act="finish">عرض النتائج</button></div></section>';
    if (f.stage === "wager") {
      var rows = game.teams.map(function (t, i) {
        var max = Math.max(0, t.score);
        return '<div class="wager" style="--team:' + t.color + '"><div><b>' + esc(t.name) + '</b> <span class="muted">— الرصيد ' + t.score + "</span></div>" +
          '<div class="w-controls"><label class="muted" for="wager-' + i + '">الرهان</label><input id="wager-' + i + '" type="number" min="0" max="' + max + '" value="' + f.wagers[i] + '" data-wager="' + i + '">' +
          '<button class="btn small ghost" data-wager-set="' + i + ':0">0</button><button class="btn small ghost" data-wager-set="' + i + ":" + Math.floor(max / 2) + '">النصف</button>' +
          '<button class="btn small ghost" data-wager-set="' + i + ":" + max + '">الكل</button></div></div>';
      }).join("");
      return '<section class="screen">' + head + '<div class="panel scroll"><h2 class="gold">حدّدوا رهاناتكم</h2><p class="muted">كل فريق يراهن بعدد من نقاطه (حتى رصيده الحالي). الإجابة الصحيحة تضيف الرهان، والخاطئة تخصمه.</p>' +
        '<div class="wager-list" style="margin-top:10px">' + rows + '</div></div><div class="hostbar"><button class="btn primary big" data-act="final-start">اعتماد الرهانات وبدء السؤال</button></div></section>';
    }
    if (f.stage === "play") {
      var clues = "";
      for (var i = 0; i < 4; i++) {
        var shown = i < f.revealed;
        clues += '<li class="clue ' + (shown ? "revealed" : "hidden") + (shown && i === f.revealed - 1 ? " current" : "") + (i === freshClue ? " fresh" : "") + '"><span class="num"><b>' + (i + 1) + '</b></span><span class="text">' + (shown ? esc(q.clues[i]) : "• • •") + "</span></li>";
      }
      return '<section class="screen">' + head + '<article class="qcard golden"><div class="qcard-head"><h3>السؤال النهائي</h3></div><ol class="clues">' + clues + '</ol><div class="status muted">تكتب كل الفرق إجاباتها على ورقة سراً، ثم يكشف المقدم الحل.</div></article>' +
        '<div class="hostbar"><button class="btn primary big" data-act="final-reveal"' + (f.revealed >= 4 ? " disabled" : "") + ">اكشف المعلومة " + (f.revealed === 0 ? "الأولى" : "التالية") + "</button>" +
        '<button class="btn big" data-act="final-answer"' + (f.revealed === 0 ? " disabled" : "") + ">اكشف الحل</button></div></section>";
    }
    var allMarked = f.marks.every(function (m) { return m !== null; });
    var board = '<div class="scoreboard" data-n="' + game.teams.length + '" style="--n:' + game.teams.length + '">' + game.teams.map(function (t, i) {
      return '<div class="team-card" style="--team:' + t.color + '"><span class="name">' + esc(t.name) + ' <span class="muted">· رهان ' + f.wagers[i] + '</span></span><span class="score">' + t.score + "</span>" +
        '<span class="btns"><button class="mark ok mark-toggle good" data-mark="' + i + ':1" aria-pressed="' + (f.marks[i] === true) + '" aria-label="صح">✓</button>' +
        '<button class="mark no mark-toggle bad" data-mark="' + i + ':0" aria-pressed="' + (f.marks[i] === false) + '" aria-label="خطأ">✗</button></span></div>';
    }).join("") + "</div>";
    return '<section class="screen">' + topbarHTML('<span class="pill gold-pill">الجولة النهائية</span><span class="pill">' + esc(catName(q.cat)) + "</span>") + board +
      '<article class="qcard golden"><div class="reveal-box">' +
      '<div class="muted">الإجابة الصحيحة</div><div class="answer">' + esc(q.answer) + "</div>" +
      '<div class="info-grid"><div class="info"><h4>الشرح</h4><p>' + esc(q.explain) + '</p></div><div class="info"><h4>معلومة إضافية</h4><p>' + esc(q.extra) + '</p></div>' +
      '<div class="info"><h4>المصدر</h4><p>' + esc(q.source) + "</p></div></div>" +
      '<div class="status gold">سجّل نتيجة كل فريق بالضغط على ✓ أو ✗ في بطاقته أعلى الشاشة</div></div></article>' +
      '<div class="hostbar"><button class="btn primary big" data-act="final-apply"' + (allMarked ? "" : " disabled") + ">اعتماد النتائج وإعلان الفائز</button></div></section>";
  }

  function vOver() {
    var list = ranked(game.teams), top = list[0].t.score;
    var winners = list.filter(function (r) { return r.t.score === top; });
    var correct = game.log.filter(function (l) { return l.team != null; }).length;
    return '<canvas id="confetti" aria-hidden="true"></canvas><section class="winner">' +
      '<div class="crown" aria-hidden="true">🏆</div><div class="muted" style="font-size:1.2em">' + (winners.length > 1 ? "تعادل!" : "الفائز") + "</div>" +
      '<div class="winner-name">' + winners.map(function (w) { return esc(w.t.name); }).join(" و ") + "</div>" +
      '<div class="gold" style="font-size:1.3em;font-family:var(--font-display)">' + top + " " + pointsWord(top) + "</div>" +
      standingsHTML(game.teams) +
      '<p class="muted">عدد الجولات: ' + game.plan.length + " — عُرفت الإجابة في " + correct + " منها. أحسنتم!</p>" +
      (game.trial ? '<p class="gold" style="font-size:1.2em">خلصت التجربة 👌 جاهزين للمباراة الحقيقية؟</p>' : "") +
      '<div class="home-actions"><button class="btn primary big" data-act="replay">' + (game.trial ? "ابدأ المباراة الحقيقية" : "العب مرة أخرى بأسئلة جديدة") + "</button>" +
      '<button class="btn big" data-act="setup">تعديل الإعدادات</button><button class="btn big ghost" data-act="home-clear">الصفحة الأولى</button></div>' +
      "</section>";
  }

  function vBank() {
    var list = bank.filter(function (q) {
      if (bankFilter.cat && q.cat !== bankFilter.cat) return false;
      if (bankFilter.lvl && +q.lvl !== +bankFilter.lvl) return false;
      if (bankFilter.q) {
        var hay = (q.answer + " " + q.clues.join(" ") + " " + q.source).toLowerCase();
        if (hay.indexOf(bankFilter.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var items = list.map(function (q) {
      var del = pendingDelete === q.id
        ? '<button class="btn small bad" data-del-yes="' + esc(q.id) + '">تأكيد الحذف</button><button class="btn small ghost" data-del-no="1">إلغاء</button>'
        : '<button class="btn small bad" data-del="' + esc(q.id) + '">حذف</button>';
      return '<div class="bank-item"><div><div class="a">' + esc(q.answer) + '</div><div class="meta"><span class="pill">' + esc(catName(q.cat)) + '</span><span class="pill">' + esc(lvlName(q.lvl)) + "</span></div></div>" +
        '<div class="acts"><button class="btn small" data-edit="' + esc(q.id) + '">تعديل</button>' + del + "</div></div>";
    }).join("");
    return '<section class="screen">' +
      '<div class="page-head"><h2>بنك الأسئلة</h2><div class="head-actions"><button class="btn primary" data-act="q-new">إضافة سؤال</button><button class="btn ghost" data-act="home">الصفحة الأولى</button></div></div>' +
      '<div class="warn-note">هذه الشاشة تعرض الإجابات — افتحها بعيداً عن اللاعبين. عند إضافة سؤال اذكر مصدره (السورة ورقم الآية، أو مصدر الحديث ودرجته).</div>' +
      '<div class="bank-tools">' +
      '<select id="f-cat" data-filter="cat" aria-label="القسم"><option value="">كل الأقسام</option>' + CATS.map(function (c) { return '<option value="' + c.id + '"' + (bankFilter.cat === c.id ? " selected" : "") + ">" + c.name + "</option>"; }).join("") + "</select>" +
      '<select id="f-lvl" data-filter="lvl" aria-label="المستوى"><option value="">كل المستويات</option>' + LEVELS.map(function (l) { return '<option value="' + l.id + '"' + (+bankFilter.lvl === l.id ? " selected" : "") + ">" + l.name + "</option>"; }).join("") + "</select>" +
      '<input id="f-q" type="search" data-filter="q" placeholder="بحث" value="' + esc(bankFilter.q) + '">' +
      '<span class="muted">' + list.length + " من " + bank.length + "</span></div>" +
      '<div class="scroll"><div class="bank-list">' + (items || '<p class="muted">لا توجد أسئلة مطابقة.</p>') + "</div></div>" +
      '<div class="bank-foot"><button class="btn small ghost" data-act="export">تصدير</button><button class="btn small ghost" data-act="import">استيراد</button>' +
      '<button class="btn small ghost" data-act="reset-confirm">استعادة البنك الأصلي</button></div>' +
      "</section>";
  }

  function vModal() {
    if (!modal) return "";
    var inner = "";
    if (modal.type === "edit") {
      var q = modal.q;
      inner = '<h2 class="gold">' + (modal.isNew ? "إضافة سؤال" : "تعديل سؤال") + '</h2><form class="form-grid" id="q-form">' +
        '<div class="two-col"><label>القسم<select id="qf-cat" name="cat">' + CATS.map(function (c) { return '<option value="' + c.id + '"' + (q.cat === c.id ? " selected" : "") + ">" + c.name + "</option>"; }).join("") + "</select></label>" +
        '<label>المستوى<select id="qf-lvl" name="lvl">' + LEVELS.map(function (l) { return '<option value="' + l.id + '"' + (+q.lvl === l.id ? " selected" : "") + ">" + l.name + "</option>"; }).join("") + "</select></label></div>" +
        [0, 1, 2, 3].map(function (i) { return "<label>المعلومة " + (i + 1) + " (" + BASE_POINTS[i] + " " + pointsWord(BASE_POINTS[i]) + ")" + (i === 0 ? " — الأصعب" : i === 3 ? " — الأسهل" : "") + '<textarea id="qf-c' + i + '" name="c' + i + '" required>' + esc(q.clues[i] || "") + "</textarea></label>"; }).join("") +
        '<label>الإجابة<input id="qf-answer" name="answer" required value="' + esc(q.answer) + '"></label>' +
        '<label>الشرح المختصر<textarea id="qf-explain" name="explain" required>' + esc(q.explain) + "</textarea></label>" +
        '<label>معلومة إضافية<textarea id="qf-extra" name="extra">' + esc(q.extra) + "</textarea></label>" +
        '<label>المصدر<input id="qf-source" name="source" required value="' + esc(q.source) + '" placeholder="مثال: سورة البقرة: 255، صحيح مسلم"></label>' +
        (modal.err ? '<p class="error">' + esc(modal.err) + "</p>" : "") +
        '<div class="modal-actions"><button type="submit" class="btn primary">حفظ</button><button type="button" class="btn ghost" data-act="modal-close">إلغاء</button></div></form>';
    } else if (modal.type === "export") {
      inner = '<h2 class="gold">تصدير الأسئلة</h2><p class="muted">انسخ النص واحفظه في ملف، أو نزّل الملف مباشرة (التنزيل يعمل في النسخة المحلية).</p>' +
        '<textarea class="json" id="export-text" readonly>' + esc(JSON.stringify(bank, null, 1)) + "</textarea>" +
        '<div class="modal-actions"><button class="btn primary" data-act="copy-export">نسخ</button><button class="btn" data-act="download-export">تنزيل ملف</button><button class="btn ghost" data-act="modal-close">إغلاق</button></div>';
    } else if (modal.type === "import") {
      inner = '<h2 class="gold">استيراد أسئلة</h2><p class="muted">الصق نص JSON (قائمة أسئلة بصيغة التصدير) أو اختر ملفاً. الأسئلة الجديدة تُضاف، وذات المعرّف نفسه تُستبدل.</p>' +
        '<input type="file" id="import-file" accept=".json,application/json"><textarea class="json" id="import-text" placeholder="[ { ... } ]"></textarea>' +
        (modal.err ? '<p class="error">' + esc(modal.err) + "</p>" : "") +
        '<div class="modal-actions"><button class="btn primary" data-act="do-import">استيراد</button><button class="btn ghost" data-act="modal-close">إلغاء</button></div>';
    } else if (modal.type === "scores") {
      inner = '<h2 class="gold">تعديل النقاط</h2><p class="muted">صحّح نقاط أي فريق ثم اضغط حفظ.</p><div class="score-edit">' +
        game.teams.map(function (t, i) {
          return '<div class="score-row" style="--team:' + t.color + '"><span class="s-name">' + esc(t.name) + "</span>" +
            '<button class="btn small" data-sc-step="' + i + ':-1" aria-label="إنقاص نقطة من ' + esc(t.name) + '">−</button>' +
            '<input id="sc-' + i + '" type="number" inputmode="numeric" step="1" data-sc="' + i + '" value="' + modal.vals[i] + '" aria-label="نقاط ' + esc(t.name) + '">' +
            '<button class="btn small" data-sc-step="' + i + ':1" aria-label="إضافة نقطة إلى ' + esc(t.name) + '">+</button></div>';
        }).join("") + "</div>" +
        '<div class="modal-actions"><button class="btn primary" data-act="scores-save">حفظ</button><button class="btn ghost" data-act="modal-close">إلغاء</button></div>';
    } else if (modal.type === "confirm") {
      inner = '<h2 class="gold">' + esc(modal.title) + "</h2><p>" + esc(modal.text) + '</p><div class="modal-actions"><button class="btn bad" data-act="' + modal.yes + '">' + esc(modal.yesLabel) + '</button><button class="btn ghost" data-act="modal-close">تراجع</button></div>';
    }
    return '<div class="modal-back" data-act="modal-back"><div class="modal panel' + (modal.type === "scores" || modal.type === "confirm" ? " compact" : "") + '" role="dialog" aria-modal="true">' + inner + "</div></div>";
  }

  /* ---------- render ---------- */
  var setupErr = "";
  function passSync() {
    try {
      var u = Store.get(K.used, []); if (!Array.isArray(u)) u = [];
      var played = bank.filter(function (q) { return u.indexOf(q.id) >= 0; }).length;
      window.MAJLIS_PASS && MAJLIS_PASS.sets("mak", bank.length, bank.length - played, { ids: bank.map(function (q) { return q.id; }), used: u, reset: function () { Store.set(K.used, []); } });
    } catch (e) {}
  }
  function render() {
    passSync();
    try { renderInner(); } catch (err) {
      if (window.console) console.error(err);
      game = null; saveGame(); view = "home"; modal = null; renderInner(); toast("صار خلل في اللعبة المحفوظة، فبدأنا من جديد");
    }
  }
  function renderInner() {
    var app = document.getElementById("app");
    var html;
    if (view === "game" && game) {
      html = game.status === "playing" ? vGame() : game.status === "final" ? vFinal() : vOver();
    } else if (view === "setup") html = vSetup(setupErr);
    else if (view === "howto") html = vHowto();
    else if (view === "bank") html = vBank();
    else html = vHome();
    app.innerHTML = html + vModal();
    bumpTeam = null; shakeTeam = null; freshClue = -1; freshDone = false;
    if (view === "game" && game && game.status === "over") startConfetti();
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /* ---------- confetti ---------- */
  var confettiRaf = null;
  function startConfetti() {
    var c = document.getElementById("confetti");
    if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    var ctx = c.getContext("2d"), W, H;
    function size() { W = c.width = window.innerWidth; H = c.height = window.innerHeight; }
    size();
    var colors = ["#f2d68e", "#d6b25e", "#46c486", "#2f9e8f", "#ffffff", "#c9733a"];
    var parts = [];
    for (var i = 0; i < 160; i++) parts.push({ x: Math.random() * W, y: -Math.random() * H, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -0.1 + Math.random() * 0.2, c: colors[i % colors.length] });
    var start = performance.now();
    (function frame(now) {
      if (!document.getElementById("confetti")) return;
      ctx.clearRect(0, 0, W, H);
      var elapsed = now - start;
      parts.forEach(function (p) {
        p.y += p.vy; p.x += p.vx; p.r += p.vr;
        if (p.y > H + 20 && elapsed < 6000) { p.y = -20; p.x = Math.random() * W; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (elapsed < 9000) confettiRaf = requestAnimationFrame(frame);
    })(start);
  }

  /* ---------- events ---------- */
  function saveSettings() { Store.set(K.settings, settings); }
  /* names list: the one registered on the entrance screen, else common names */
  var NM_BOYS = ["محمد", "أحمد", "عبدالله", "فهد", "خالد", "سلطان", "سعود", "تركي", "فيصل", "ناصر", "يوسف", "عمر", "بدر", "نواف", "عبدالعزيز"];
  var NM_GIRLS = ["نورة", "سارة", "ريم", "لمى", "هيا", "منى", "مها", "العنود", "دانة", "جود", "كادي", "ترف", "أسماء"];
  function nmShuf(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var NM_COMMON = nmShuf(NM_BOYS).concat(nmShuf(NM_GIRLS));
  function nmList() { try { var r = JSON.parse(localStorage.getItem("majlis_names") || "[]"); r = Array.isArray(r) ? r.map(function (x) { return String(x).trim().slice(0, 16); }).filter(Boolean) : []; return r.length ? r : NM_COMMON; } catch (e) { return NM_COMMON; } }
  function nmChips(inputs) { var all = nmList(); return '<div class="chips namepick">' + all.map(function (c) { var used = inputs.indexOf(c) >= 0; return '<button class="chip" data-pickname="' + esc(c) + '" aria-pressed="' + used + '">' + (used ? "✓ " : "") + esc(c) + "</button>"; }).join("") + "</div>"; }
  /* pick: put the name in the first slot that is not already a listed name; pick again to clear it */
  function nmPick(slots, nm, blank) { var all = nmList(), at = slots.indexOf(nm); if (at >= 0) { slots[at] = blank(at); return; } for (var i = 0; i < slots.length; i++) if (all.indexOf(slots[i]) < 0) { slots[i] = nm; return; } slots[slots.length - 1] = nm; }

  function collectNames() {
    document.querySelectorAll("[data-team-name]").forEach(function (inp) { settings.names[+inp.getAttribute("data-team-name")] = inp.value; });
  }

  function go(v) { view = v; setupErr = ""; pendingDelete = null; render(); window.scrollTo(0, 0); }

  function startGame() {
    collectNames();
    if (!settings.cats.length) { view = "setup"; setupTab = "questions"; setupErr = "اختر قسماً واحداً على الأقل."; render(); return; }
    saveSettings();
    if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("mak")) return;
    stopTimer();
    game = buildGame();
    if (!game.plan.length) { game = null; view = "setup"; setupErr = "لا توجد أسئلة كافية في بنك الأسئلة."; render(); return; }
    newRound();
    saveGame();
    view = "game";
    render();
    window.scrollTo(0, 0);
  }

  /* quick trial: 3 easy rounds with the saved team names; the saved settings are not changed */
  function startTrial() {
    collectNames();
    if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("mak")) return;
    var saved = clone(settings);
    settings.rounds = 3; settings.level = 1; settings.cats = CATS.map(function (c) { return c.id; });
    settings.answerMode = "open"; settings.timer = false;
    settings.modes = { quick: false, double: false, steal: false, golden: false, random: false, final: false };
    stopTimer();
    game = buildGame();
    settings = saved;
    game.trial = true;
    newRound(); saveGame(); view = "game"; render();
  }

  function handleAct(act, el) {
    switch (act) {
      case "home": go("home"); break;
      case "home-clear": game = null; saveGame(); go("home"); break;
      case "setup": stopTimer(); go("setup"); break;
      case "howto": go("howto"); break;
      case "adj":
        if (game && el) { var at = +el.getAttribute("data-t"), ad = +el.getAttribute("data-d"); if (game.teams[at]) { game.teams[at].score += ad; game.log.push({ manual: true }); bumpTeam = ad > 0 ? at : null; commit(); bumpTeam = null; } }
        break;
      case "reset-used":
        if (Date.now() - resetArm < 4000) { Store.set(K.used, []); resetArm = 0; toast("تم التصفير — كل البطاقات صارت جديدة"); }
        else { resetArm = Date.now(); setTimeout(function () { if (view === "home") render(); }, 4100); }
        render(); break;
      case "bank": go("bank"); break;
      case "resume": view = "game"; if (game.round && !game.round.done && game.round.revealed > 0 && game.round.timeLeft != null) startTimer(); render(); break;
      case "start": startGame(); break;
      case "quick": startGame(); break;
      case "trial": startTrial(); break;
      case "cats-none": collectNames(); settings.cats = []; saveSettings(); render(); break;
      case "replay": startGame(); break;
      case "rounds-": collectNames(); settings.rounds = Math.max(3, settings.rounds - 1); saveSettings(); render(); break;
      case "rounds+": collectNames(); settings.rounds = Math.min(30, settings.rounds + 1); saveSettings(); render(); break;
      case "cats-all": collectNames(); settings.cats = CATS.map(function (c) { return c.id; }); saveSettings(); render(); break;
      case "reveal": if (game && game.status === "playing") revealNext(); break;
      case "answer": if (game && game.status === "playing" && game.round.revealed > 0) revealAnswer(); break;
      case "next": if (game && game.status === "playing") nextRound(); break;
      case "skip": game.round.done = true; nextRound(); break;
      case "end-confirm": modal = { type: "confirm", title: "إنهاء اللعبة؟", text: "سيتم عرض النتائج الحالية وإعلان الفائز.", yes: "end", yesLabel: "إنهاء وعرض النتائج" }; render(); break;
      case "end": if (!modal) break; modal = null; finishGame(); break;
      case "finish": finishGame(); break;
      case "fullscreen":
        try {
          if (!document.fullscreenElement) { var pr = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (pr && pr.catch) pr.catch(function () {}); }
          else document.exitFullscreen();
        } catch (e) {}
        break;
      case "sound": settings.sound = !settings.sound; saveSettings(); render(); break;
      case "final-start":
        if (!game || game.status !== "final" || game.final.stage !== "wager") break;
        document.querySelectorAll("[data-wager]").forEach(function (inp) {
          var i = +inp.getAttribute("data-wager"), max = Math.max(0, game.teams[i].score);
          game.final.wagers[i] = Math.min(max, Math.max(0, Math.floor(+inp.value || 0)));
        });
        game.final.stage = "play"; game.final.revealed = Math.max(1, game.final.revealed); freshClue = 0; SFX.reveal(); commit(); break;
      case "final-reveal": if (game && game.status === "final" && game.final.stage === "play" && game.final.revealed < 4) { game.final.revealed++; freshClue = game.final.revealed - 1; SFX.reveal(); commit(); } break;
      case "final-answer": if (!game || game.status !== "final" || game.final.stage !== "play" || game.final.revealed < 1) break; game.final.stage = "mark"; SFX.reveal(); commit(); break;
      case "final-apply":
        if (!game || game.status !== "final" || game.final.stage !== "mark" || game.final.marks.some(function (m) { return m === null; })) break;
        game.final.marks.forEach(function (m, i) { game.teams[i].score += m ? game.final.wagers[i] : -game.final.wagers[i]; });
        finishGame(); break;
      case "q-new":
        modal = { type: "edit", isNew: true, q: { id: "", cat: bankFilter.cat || CATS[0].id, lvl: +bankFilter.lvl || 2, clues: ["", "", "", ""], answer: "", explain: "", extra: "", source: "" } };
        render(); break;
      case "modal-close": modal = null; render(); break;
      case "scores": if (game) { modal = { type: "scores", vals: game.teams.map(function (t) { return t.score; }) }; render(); var f0 = document.getElementById("sc-0"); if (f0) f0.focus(); } break;
      case "scores-save":
        readScoreInputs();
        var changed = false;
        game.teams.forEach(function (t, i) { if (t.score !== modal.vals[i]) { t.score = modal.vals[i]; changed = true; } });
        modal = null;
        if (changed) { game.log.push({ manual: true }); toast("تم تعديل النقاط"); }
        commit(); break;
      case "modal-back": modal = null; render(); break;
      case "export": modal = { type: "export" }; render(); break;
      case "import": modal = { type: "import" }; render(); break;
      case "copy-export":
        var ta = document.getElementById("export-text");
        try { navigator.clipboard.writeText(ta.value).then(function () { toast("تم النسخ"); }, function () { ta.select(); toast("حدّد النص وانسخه يدوياً"); }); }
        catch (e) { ta.select(); }
        break;
      case "download-export":
        try {
          var blob = new Blob([JSON.stringify(bank, null, 1)], { type: "application/json" });
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "min-akoon-questions.json";
          document.body.appendChild(a); a.click(); a.remove();
        } catch (e) { toast("تعذر التنزيل — استخدم النسخ"); }
        break;
      case "do-import": doImport(); break;
      case "reset-confirm": modal = { type: "confirm", title: "استعادة البنك الأصلي؟", text: "ستُحذف كل الأسئلة المضافة والتعديلات، ويعود البنك إلى " + window.DEFAULT_QUESTIONS.length + " بطاقة الأصلية.", yes: "reset", yesLabel: "استعادة" }; render(); break;
      case "reset": bank = clone(window.DEFAULT_QUESTIONS); saveBank(); modal = null; toast("تمت الاستعادة"); render(); break;
    }
  }

  function clampScore(v) { v = Math.round(+v); return isFinite(v) ? Math.max(-999, Math.min(999, v)) : 0; }
  function readScoreInputs() {
    document.querySelectorAll("[data-sc]").forEach(function (inp) { modal.vals[+inp.getAttribute("data-sc")] = clampScore(inp.value); });
  }

  function doImport() {
    var txt = document.getElementById("import-text").value.trim();
    try {
      var arr = JSON.parse(txt);
      if (!Array.isArray(arr)) throw new Error();
      var added = 0;
      arr.forEach(function (q) {
        if (!q || !Array.isArray(q.clues) || q.clues.length !== 4 || !q.answer) return;
        var item = {
          id: q.id ? String(q.id) : "u" + Date.now() + Math.floor(Math.random() * 1000),
          cat: CATS.some(function (c) { return c.id === q.cat; }) ? q.cat : "whoami",
          lvl: [1, 2, 3].indexOf(+q.lvl) >= 0 ? +q.lvl : 2,
          clues: q.clues.map(String), answer: String(q.answer), explain: String(q.explain || ""), extra: String(q.extra || ""), source: String(q.source || "")
        };
        var ex = bank.findIndex(function (b) { return b.id === item.id; });
        if (ex >= 0) bank[ex] = item; else bank.push(item);
        added++;
      });
      if (!added) throw new Error();
      saveBank(); modal = null; toast("تم استيراد " + added + " سؤال"); render();
    } catch (e) {
      modal.err = "النص غير صالح. يجب أن يكون قائمة JSON، وكل سؤال فيه أربع معلومات وإجابة.";
      var keep = txt; render(); document.getElementById("import-text").value = keep;
    }
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act],[data-sc-step],[data-tab],[data-preset],[data-format],[data-level],[data-cat],[data-answer-mode],[data-correct],[data-wrong],[data-edit],[data-del],[data-del-yes],[data-del-no],[data-wager-set],[data-mark]");
    if (!el) return;
    if (e.detail > 1 && (el.hasAttribute("data-correct") || el.hasAttribute("data-wrong") || (el.hasAttribute("data-act") && ["rounds-", "rounds+"].indexOf(el.getAttribute("data-act")) < 0))) return;
    if (el.hasAttribute("data-act")) {
      var act = el.getAttribute("data-act");
      if (act === "modal-back" && e.target !== el) return;
      return handleAct(act, el);
    }
    if (el.hasAttribute("data-sc-step")) {
      var sp = el.getAttribute("data-sc-step").split(":"), si = +sp[0];
      readScoreInputs();
      modal.vals[si] = clampScore(modal.vals[si] + (+sp[1]));
      var sinp = document.getElementById("sc-" + si); if (sinp) sinp.value = modal.vals[si];
      return;
    }
    if (el.hasAttribute("data-tab")) { collectNames(); setupTab = el.getAttribute("data-tab"); render(); return; }
    if (el.hasAttribute("data-preset")) {
      collectNames(); var pr = PRESETS[el.getAttribute("data-preset")];
      settings.modes = clone(pr.modes); settings.timer = pr.timer; saveSettings(); render(); return;
    }
    if (el.hasAttribute("data-format")) { collectNames(); settings.format = el.getAttribute("data-format"); saveSettings(); render(); return; }
    if (el.hasAttribute("data-level")) { collectNames(); settings.level = +el.getAttribute("data-level"); saveSettings(); render(); return; }
    if (el.hasAttribute("data-answer-mode")) { collectNames(); settings.answerMode = el.getAttribute("data-answer-mode"); saveSettings(); render(); return; }
    if (el.hasAttribute("data-cat")) {
      collectNames();
      var c = el.getAttribute("data-cat"), i = settings.cats.indexOf(c);
      if (i >= 0) settings.cats.splice(i, 1); else settings.cats.push(c);
      saveSettings(); render(); return;
    }
    if (el.hasAttribute("data-correct")) return markCorrect(+el.getAttribute("data-correct"));
    if (el.hasAttribute("data-wrong")) return markWrong(+el.getAttribute("data-wrong"));
    if (el.hasAttribute("data-edit")) { var q = findQ(el.getAttribute("data-edit")); if (q) { modal = { type: "edit", isNew: false, q: clone(q) }; render(); } return; }
    if (el.hasAttribute("data-del")) { pendingDelete = el.getAttribute("data-del"); render(); return; }
    if (el.hasAttribute("data-del-no")) { pendingDelete = null; render(); return; }
    if (el.hasAttribute("data-del-yes")) {
      var id = el.getAttribute("data-del-yes");
      bank = bank.filter(function (b) { return b.id !== id; }); saveBank(); pendingDelete = null; toast("تم الحذف"); render(); return;
    }
    if (el.hasAttribute("data-wager-set")) {
      if (!game || game.status !== "final" || game.final.stage !== "wager") return;
      var parts = el.getAttribute("data-wager-set").split(":");
      var inp = document.getElementById("wager-" + parts[0]); if (inp) inp.value = parts[1];
      game.final.wagers[+parts[0]] = +parts[1]; saveGame(); return;
    }
    if (el.hasAttribute("data-mark")) {
      if (!game || game.status !== "final" || game.final.stage !== "mark") return;
      var mp = el.getAttribute("data-mark").split(":");
      game.final.marks[+mp[0]] = mp[1] === "1"; commit(); return;
    }
  });

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.hasAttribute("data-mode")) { collectNames(); settings.modes[el.getAttribute("data-mode")] = el.checked; saveSettings(); render(); }
    else if (el.hasAttribute("data-opt")) { collectNames(); settings[el.getAttribute("data-opt")] = el.checked; saveSettings(); render(); }
    else if (el.hasAttribute("data-team-name")) { collectNames(); saveSettings(); }
    else if (el.hasAttribute("data-wager")) {
      var i = +el.getAttribute("data-wager"), max = Math.max(0, game.teams[i].score);
      var v = Math.min(max, Math.max(0, Math.floor(+el.value || 0))); el.value = v; game.final.wagers[i] = v; saveGame();
    }
    else if (el.id === "import-file" && el.files && el.files[0]) {
      var reader = new FileReader();
      reader.onload = function () { document.getElementById("import-text").value = reader.result; };
      reader.readAsText(el.files[0]);
    }
    else if (el.hasAttribute("data-filter") && el.tagName === "SELECT") { bankFilter[el.getAttribute("data-filter")] = el.value; render(); }
  });

  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.hasAttribute("data-sc") && modal && modal.type === "scores") { modal.vals[+el.getAttribute("data-sc")] = clampScore(el.value); return; }
    if (el.getAttribute("data-filter") === "q") {
      bankFilter.q = el.value; render();
      var s = document.getElementById("f-q"); s.focus(); s.setSelectionRange(s.value.length, s.value.length);
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id !== "q-form") return;
    e.preventDefault();
    var f = e.target, get = function (n) { return (f.elements[n].value || "").trim(); };
    var q = {
      id: modal.q.id || ("u" + Date.now()),
      cat: get("cat"), lvl: +get("lvl"),
      clues: [get("c0"), get("c1"), get("c2"), get("c3")],
      answer: get("answer"), explain: get("explain"), extra: get("extra"), source: get("source")
    };
    if (q.clues.some(function (c) { return !c; }) || !q.answer || !q.explain || !q.source) {
      modal.q = q; modal.err = "أكمل المعلومات الأربع والإجابة والشرح والمصدر."; render(); return;
    }
    var i = bank.findIndex(function (b) { return b.id === q.id; });
    if (i >= 0) bank[i] = q; else bank.push(q);
    saveBank(); modal = null; toast("تم الحفظ"); render();
  });

  document.addEventListener("keydown", function (e) {
    if (e.repeat && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return; }
    if (modal && e.key === "Escape") { modal = null; render(); return; }
    if (modal && modal.type === "scores" && e.key === "Enter") { e.preventDefault(); handleAct("scores-save"); return; }
    if (modal || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ""))) return;
    if (e.key === "f" || e.key === "F") { handleAct("fullscreen"); return; }
    if (view !== "game" || !game) return;
    if (game.status === "playing") {
      if (e.key === " ") { e.preventDefault(); revealNext(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        // guard against a stuck or repeated Enter: a new round needs 1.5s before its answer can be revealed, and a revealed answer 0.6s before moving on
        var rr = game.round, now = Date.now();
        if (rr.done) { if (now - (rr.doneAt || 0) > 600) nextRound(); }
        else if (rr.revealed > 0 && now - (rr.startedAt || 0) > 1500) revealAnswer();
      }
    } else if (game.status === "final" && game.final.stage === "play") {
      if (e.key === " ") { e.preventDefault(); handleAct("final-reveal"); }
    }
  });

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pickname]"); if (!b || view !== "setup") return;
    collectNames(); var n = teamCount(), isP = settings.format === "players", slots = settings.names.slice(0, n);
    nmPick(slots, b.getAttribute("data-pickname"), function (i) { return isP ? PLAYER_NAMES[i] : DEFAULT_NAMES[i]; });
    for (var i = 0; i < n; i++) settings.names[i] = slots[i];
    saveSettings(); render();
  });
  render();
})();
