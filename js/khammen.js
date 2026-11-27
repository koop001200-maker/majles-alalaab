/* «خمّن وش هو؟» — محرك اللعبة. يدير الأدوار والوقت والنقاط بدون مقدّم. يعمل محلياً ويحفظ في localStorage. */
(function () {
  "use strict";

  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    raw: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    setRaw: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  var K = { bank: "kh_bank_v1", game: "kh_game_v1", settings: "kh_settings_v1", used: "kh_used_v1", img: "kh_img_" };
  var CATS = window.KH_CATS, LEVELS = window.KH_LEVELS;
  var TEAM_COLORS = ["#ffb703", "#2ec4b6", "#ff5d73", "#4cc9f0"];
  var TEAM_NAMES = ["فريق النخلة", "فريق الدلة", "فريق الصقر", "فريق الهيل"];
  var ATTEMPTS = 5, QUICK_BONUS_SEC = 20;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function cat(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return { id: id, name: id, icon: "❓" }; }
  function lvl(id) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === +id) return LEVELS[i]; return { id: 0, name: "منوّع" }; }
  function ptsWord(n) { n = Math.abs(n); return n === 1 ? "نقطة" : n === 2 ? "نقطتين" : (n >= 3 && n <= 10 ? "نقاط" : "نقطة"); }

  /* ---------- bank ---------- */
  function defaultBank() {
    var out = [];
    Object.keys(window.KH_RAW).forEach(function (c) {
      window.KH_RAW[c].forEach(function (r, i) { out.push({ id: c + "-" + (i + 1), cat: c, name: r[0], emoji: r[1], syn: r[2] ? r[2].split("|") : [], lvl: r[3] }); });
    });
    return out;
  }
  var bank = Store.get(K.bank, null);
  if (Array.isArray(bank)) bank = bank.filter(function (it) { return it && typeof it.id === "string" && typeof it.name === "string" && it.name.trim() && CATS.some(function (c) { return c.id === it.cat; }); }).map(function (it) { it.syn = Array.isArray(it.syn) ? it.syn.map(String) : []; it.lvl = [1, 2, 3, 4].indexOf(+it.lvl) >= 0 ? +it.lvl : 2; it.emoji = String(it.emoji || "❓"); return it; });
  if (!Array.isArray(bank) || !bank.length) bank = defaultBank();
  /* bank v2 added new «تحدي العائلة» items (saudi-44 onward): give them to families who saved their own bank, once */
  if (Store.get("kh_bank_ver", 1) < 2) {
    var have = {}; bank.forEach(function (it) { have[it.id] = 1; });
    defaultBank().forEach(function (it) { var m = /^saudi-(\d+)$/.exec(it.id); if (m && +m[1] >= 44 && !have[it.id]) bank.push(it); });
    if (Store.raw(K.bank)) Store.set(K.bank, bank);
    Store.set("kh_bank_ver", 2);
  }
  /* bank v3 appended new items to every category: add them once for families with a saved bank */
  if (Store.get("kh_bank_ver", 1) < 3) {
    var OLDN = { home: 28, kitchen: 18, food: 48, animals: 46, clothes: 27, transport: 27, tech: 27, tools: 29, saudi: 76, surprise: 36 };
    var have3 = {}; bank.forEach(function (it) { have3[it.id] = 1; });
    defaultBank().forEach(function (it) { var m = /^([a-z]+)-(\d+)$/.exec(it.id); if (m && OLDN[m[1]] && +m[2] > OLDN[m[1]] && !have3[it.id]) bank.push(it); });
    if (Store.raw(K.bank)) Store.set(K.bank, bank);
    Store.set("kh_bank_ver", 3);
  }
  function saveBank() { Store.set(K.bank, bank); }
  // hint = the first letter of the answer and how many words it has (after «ال» the next letter is the useful one)
  /* تلميح تدريجي: كل ضغطة تكشف أكثر وتاكل ربع الوقت المتبقي — ١) عدد الكلمات والحروف ٢) أول حرف ٣) آخر حرف (الفئة ظاهرة أصلاً فوق) */
  var HINT_MAX = 3;
  function hintHTML(it, lv) {
    var words = String(it.name).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim().split(" ");
    var L = Array.from(words[0]), al = L.length > 3 && L[0] === "ا" && L[1] === "ل";
    var n = words.length, cnt = n === 1 ? "كلمة واحدة" : n === 2 ? "كلمتين" : n + " كلمات";
    var letters = Array.from(words.join("")).length, out = [];
    var lw = Array.from(words[words.length - 1]), last = lw[lw.length - 1];
    out.push('<span class="hint-text">' + cnt + " · <b>" + letters + "</b> " + (letters >= 3 && letters <= 10 ? "أحرف" : "حرف") + "</span>");
    if (lv >= 2) out.push('<span class="hint-letter">' + esc(al ? L[2] : L[0]) + '</span><span class="hint-text">' + (al ? "يبدأ بـ «ال» وبعدها حرف " : "أول حرف ") + "<b>" + esc(al ? L[2] : L[0]) + "</b></span>");
    if (lv >= 3) out.push('<span class="hint-text">آخر حرف <b>' + esc(last) + "</b></span>");
    return out.join(" ");
  }
  function item(id) { for (var i = 0; i < bank.length; i++) if (bank[i].id === id) return bank[i]; return null; }
  function photo(id) { return Store.raw(K.img + id); }
  /* photo shown in play: the family's own photo first, then the bundled photo pack (if enabled) */
  function packPhoto(id) { var P = window.KH_PHOTOS; return settings.photos !== false && P && P[id] ? P[id].src : null; }
  function shownPhoto(id) { return photo(id) || packPhoto(id); }

  /* ---------- answer matching ---------- */
  function norm(s) {
    s = String(s || "").toLowerCase()
      .replace(/[ً-ْٰـ]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
      .replace(/[^ء-يa-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return s.split(" ").map(function (w) { return w.length > 3 && w.indexOf("ال") === 0 ? w.slice(2) : w; }).join(" ");
  }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    var d = []; for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (var j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function matches(guess, it) {
    var g = norm(guess); if (!g) return false;
    var gs = g.replace(/ /g, "");
    return [it.name].concat(it.syn || []).some(function (c) {
      var n = norm(c); if (!n) return false;
      var ns = n.replace(/ /g, "");
      if (g === n || gs === ns) return true;
      // لهجتنا: برقر = برجر، تلاجة = ثلاجة… (ما لم تكن الكلمة لشيء ثاني في البنك)
      if (fold(gs) === fold(ns) && !ownedByOther(gs, it, true)) return true;
      if (ns.charAt(ns.length - 1) === "ه" && gs === ns.slice(0, -1)) return false; // طيار ≠ طيارة
      var tol = ns.length >= 9 ? 2 : ns.length >= 5 ? 1 : 0;
      // التسامح الإملائي فقط لأخطاء الكتابة: أول حرف ثابت، والتخمين ما يكون اسماً أو مرادفاً لشيء ثاني في البنك (سيارة ≠ طيارة)
      return tol > 0 && gs.charAt(0) === ns.charAt(0) && lev(gs, ns) <= tol && !ownedByOther(gs, it);
    });
  }
  function fold(s) { return s.replace(/[قغ]/g, "ج").replace(/ث/g, "ت").replace(/ذ/g, "د").replace(/ظ/g, "ض"); }
  function ownedByOther(gs, it, folded) {
    var key = folded ? fold(gs) : gs;
    for (var i = 0; i < bank.length; i++) {
      var b = bank[i]; if (b.id === it.id || b.name === it.name) continue;
      var cs = [b.name].concat(b.syn || []);
      for (var k = 0; k < cs.length; k++) { var x = norm(cs[k]).replace(/ /g, ""); if ((folded ? fold(x) : x) === key) return true; }
    }
    return false;
  }
  window.KH_MATCH = matches; // exposed for tests

  /* ---------- settings ---------- */
  var defaults = {
    mode: "solo", players: ["فهد", "نورة", "سلطان", "ريم"], teamOf: [0, 1, 0, 1], teamCount: 2,
    cats: [], level: 0, rounds: 3, turnTime: 90, memTime: 6,
    double: true, surprise: true, random: false, sound: true, photos: true
  };
  var settings = Object.assign(clone(defaults), Store.get(K.settings, {}) || {});
  (function () { var P = window.MAJLIS_PREFS && MAJLIS_PREFS(); if (!P) return; var pick = function (k, m) { return m[P[k]]; }; if (P.teams) { settings.mode = "solo"; settings.players = P.teams.slice(0, 16); settings.teamOf = P.teams.map(function (x, i) { return i % 2; }); } settings.level = pick("level", { easy: 1, mix: 0, hard: 3 }); settings.rounds = pick("length", { short: 1, normal: 2, long: 3 }); settings.turnTime = pick("time", { fast: 60, normal: 90, slow: 120 }); })(); // إعدادات المجلس
  (function () { var FT = window.MAJLIS_FAM_TEAMS && MAJLIS_FAM_TEAMS(); if (FT) { settings.mode = "solo"; settings.players = FT.slice(0, 16); settings.teamOf = FT.map(function (x, i) { return i % 2; }); } })(); // فرق جولة العائلة: كل فريق يلعب كلاعب
  if (["solo", "teams", "duel"].indexOf(settings.mode) < 0) settings.mode = "solo";
  if (!Array.isArray(settings.players)) settings.players = defaults.players.slice();
  settings.players = settings.players.map(function (x) { return String(x == null ? "" : x).slice(0, 16); }).slice(0, 16);
  if (!Array.isArray(settings.teamOf)) settings.teamOf = settings.players.map(function (x, i) { return i % 2; });
  settings.teamCount = [2, 3, 4].indexOf(+settings.teamCount) >= 0 ? +settings.teamCount : 2;
  if (!Array.isArray(settings.cats)) settings.cats = []; settings.cats = settings.cats.filter(function (c) { return CATS.some(function (x) { return x.id === c; }); });
  settings.level = [0, 1, 2, 3, 4].indexOf(+settings.level) >= 0 ? +settings.level : 0;
  settings.rounds = Math.min(10, Math.max(1, Math.round(+settings.rounds) || 3));
  settings.turnTime = [45, 60, 90, 120].indexOf(+settings.turnTime) >= 0 ? +settings.turnTime : 90;
  settings.memTime = [4, 6, 8, 10].indexOf(+settings.memTime) >= 0 ? +settings.memTime : 6;
  function saveSettings() { Store.set(K.settings, settings); }
  /* names: the list registered on the entrance screen (shared across games), else common names */
  var BOYS = ["محمد", "أحمد", "عبدالله", "فهد", "خالد", "سلطان", "سعود", "تركي", "فيصل", "ناصر", "يوسف", "عمر", "بدر", "نواف", "عبدالعزيز"];
  var GIRLS = ["نورة", "سارة", "ريم", "لمى", "هيا", "منى", "مها", "العنود", "دانة", "جود", "كادي", "ترف", "أسماء"];
  function shuf(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var COMMON = shuf(BOYS).concat(shuf(GIRLS));
  function regNames() { try { var r = JSON.parse(localStorage.getItem("majlis_names") || "[]"); return Array.isArray(r) ? r.map(function (x) { return String(x).trim().slice(0, 16); }).filter(Boolean).slice(0, 16) : []; } catch (e) { return []; } }
  // «مين بيلعب؟» من المجلس: الفرق تلعب كأنها لاعبين (كل فريق دور)، والأفراد قائمة اللاعبين
  (function () { var W = window.MAJLIS_WHO && MAJLIS_WHO(); if (!W) return; var n = W.names.slice(0, 16);
    if (settings.players.join("|") !== n.join("|")) { settings.players = n; settings.teamOf = n.map(function (x, i) { return i % (settings.teamCount || 2); }); }
    if (W.kind === "teams") settings.mode = "solo"; else if (settings.mode === "duel" && n.length !== 2) settings.mode = "solo"; })();
  (function seed() { var r = regNames(), def = defaults.players.join("|"); if (r.length >= 2 && settings.players.join("|") === def) { settings.players = r.slice(); settings.teamOf = r.map(function (x, i) { return i % settings.teamCount; }); } })();

  var view = location.hash === "#bank" ? "bank" : "home", setupTab = "players", setupErr = "", modal = null, bankF = { cat: "", lvl: "", q: "" }, pendingDel = null;
  var game = validGame(Store.get(K.game, null));
  function validGame(g) {
    try {
      if (!g || !Array.isArray(g.players) || g.players.length < 2 || !g.settings || !Array.isArray(g.order)) return null;
      if (["handoff", "memorize", "ready", "guess", "result", "over"].indexOf(g.phase) < 0) return null;
      if (g.phase !== "over" && (!g.cur || !item(g.cur.itemId) || typeof g.cur.player !== "number" || !g.players[g.cur.player])) return null;
      if (!Array.isArray(g.used)) g.used = []; if (!Array.isArray(g.log)) g.log = [];
      g.players.forEach(function (p) { p.score = +p.score || 0; p.wins = +p.wins || 0; p.turns = +p.turns || 0; p.name = String(p.name || "لاعب"); });
      return g;
    } catch (e) { return null; }
  }
  if (game && game.phase === "guess") game.cur.paused = true;
  if (game && game.phase === "memorize") game.phase = "handoff";
  function saveGame() { if (game) Store.set(K.game, game); else Store.del(K.game); }
  saveGame();

  /* ---------- sound ---------- */
  var actx = null;
  function tone(f, d, type, v, delay) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v || .16, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + .05);
    } catch (e) {}
  }
  var SFX = {
    pop: function () { tone(520, .12, "triangle", .14); tone(780, .16, "triangle", .1, .07); },
    go: function () { [440, 660, 880].forEach(function (f, i) { tone(f, .15, "square", .07, i * .09); }); },
    correct: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, .28, "triangle", .17, i * .08); }); },
    wrong: function () { tone(200, .3, "sawtooth", .09); tone(150, .4, "sawtooth", .08, .14); },
    tick: function () { tone(1000, .05, "square", .05); },
    buzzer: function () { tone(140, .9, "sawtooth", .12); tone(110, .9, "square", .06, .05); },
    win: function () { [392, 523, 659, 784, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, .3, "triangle", .16, i * .12); }); }
  };

  var LINES = {
    correct: ["كفووو! 🔥", "يا سلام عليك! 👏", "ذيب! 🐺", "ما شاء الله عليك 🌟", "أسطورة! 😎", "صح لسانك!", "والله إنك فنان 🎨", "يا حلوك يا ذكي"],
    fail: ["راحت عليك 😅", "هاردلك 🤏", "قريبة… بس لا!", "المرة الجاية إن شاء الله", "والله صعبة ذي 😬"],
    wrong: ["لا مو هي ❌", "حاول مرة ثانية", "لا لا لا!", "مو هذي 🙈", "جرّب كلمة ثانية 🤔"],
    time: ["خلص الوقت! ⏰", "الوقت ما ينتظر أحد 😅"]
  };

  /* ---------- game setup ---------- */
  function validate() {
    var names = settings.players.map(function (n) { return n.trim(); }).filter(Boolean);
    if (names.length < 2) return "أضف لاعبين اثنين على الأقل.";
    if (settings.mode === "duel" && names.length !== 2) return "المواجهة للاعبين اثنين بس — خلّ اثنين في القائمة أو اختر نمط ثاني.";
    if (settings.mode === "teams") {
      if (settings.teamCount > names.length) return "عدد الفرق أكثر من عدد اللاعبين.";
      for (var t = 0; t < settings.teamCount; t++) if (!settings.teamOf.slice(0, names.length).some(function (x) { return x === t; })) return TEAM_NAMES[t] + " ما فيه أحد — اضغط على دائرة اللون جنب اسم اللاعب لتغيير فريقه.";
    }
    return "";
  }

  function newGame() {
    var names = settings.players.map(function (n) { return n.trim(); });
    var players = [];
    names.forEach(function (n, i) { if (n) players.push({ name: n, team: settings.mode === "teams" ? (settings.teamOf[i] || 0) % settings.teamCount : -1, score: 0, wins: 0, turns: 0 }); });
    game = {
      settings: clone(settings), players: players,
      teams: settings.mode === "teams" ? TEAM_NAMES.slice(0, settings.teamCount).map(function (n, i) { return { name: n, color: TEAM_COLORS[i], turns: 0 }; }) : [],
      round: 1, k: 0, order: [], used: [], phase: "handoff", cur: null, log: [], lastPerformer: -1
    };
    buildOrder();
    startTurn();
  }

  function buildOrder() {
    var n = game.settings.mode === "teams" ? game.teams.length : game.players.length;
    var o = []; for (var i = 0; i < n; i++) o.push(i);
    if (game.settings.random) { shuffle(o); if (o.length > 1 && o[0] === game.lastPerformer) o.push(o.shift()); }
    game.order = o;
  }

  function roundFlags() {
    var s = game.settings, R = s.rounds;
    return {
      double: !!s.double && game.round === R && R >= 1,
      surprise: !!s.surprise && R >= 2 && game.round === Math.ceil(R / 2) && !(s.double && game.round === R)
    };
  }

  function performerPlayer(slot) {
    if (game.settings.mode !== "teams") return slot;
    var t = game.teams[slot];
    var members = game.players.map(function (p, i) { return p.team === slot ? i : -1; }).filter(function (i) { return i >= 0; });
    var idx;
    if (game.settings.random) {
      var minTurns = Math.min.apply(null, members.map(function (i) { return game.players[i].turns; }));
      idx = pick(members.filter(function (i) { return game.players[i].turns === minTurns; }));
    } else idx = members[t.turns % members.length];
    t.turns++;
    return idx;
  }

  var resetArm = 0;
  function usedCount() { var u = Store.get(K.used, []); if (!Array.isArray(u)) return 0; return bank.filter(function (it) { return u.indexOf(it.id) >= 0; }).length; }
  function pickItem(surprise) {
    var s = game.settings, allC = CATS.map(function (c) { return c.id; });
    var cats = surprise ? ["surprise"] : (s.cats.length ? s.cats : allC);
    var level = s.level;
    var free = function (it) { return game.used.indexOf(it.id) < 0; };
    if (s.random && !surprise) {
      var avail = bank.filter(function (it) { return cats.indexOf(it.cat) >= 0 && free(it); });
      if (avail.length) { var r = pick(avail); cats = [r.cat]; level = s.level ? s.level : r.lvl; }
    }
    var hist = Store.get(K.used, []); if (!Array.isArray(hist)) hist = [];
    var src = window.MAJLIS_PASS ? MAJLIS_PASS.scoped("kh", bank, hist) : bank;
    var tries = [
      function (it) { return cats.indexOf(it.cat) >= 0 && (!level || it.lvl === level) && free(it); },
      function (it) { return cats.indexOf(it.cat) >= 0 && free(it); },
      function (it) { return free(it); },
      function () { return true; }
    ];
    // never repeat something that was ever played, until the whole bank has been used; then start a new cycle
    var choose = function (onlyFresh) {
      for (var i = 0; i < tries.length; i++) {
        var pool = src.filter(tries[i]);
        if (onlyFresh) pool = pool.filter(function (it) { return hist.indexOf(it.id) < 0; });
        if (pool.length) return pick(pool);
      }
      return null;
    };
    var chosen = choose(true);
    if (!chosen) { hist = []; chosen = choose(false); }
    if (!chosen) return null;
    game.used.push(chosen.id); hist.push(chosen.id); Store.set(K.used, hist);
    return chosen.id;
  }

  function startTurn(keepPlayer) {
    var f = roundFlags();
    var slot = game.order[game.k];
    var p = keepPlayer != null ? keepPlayer : performerPlayer(slot);
    game.lastPerformer = slot;
    game.cur = {
      player: p, itemId: pickItem(f.surprise), attempts: ATTEMPTS, guesses: [], lastTyped: null,
      timeLeft: game.settings.turnTime, elapsed: 0, itemElapsed: 0, memLeft: game.settings.memTime,
      paused: false, double: f.double, surprise: f.surprise, duelCount: 0, duelPts: 0, flash: null, result: null, feedback: null
    };
    game.phase = "handoff";
  }

  function nextPerformerName() {
    var k = game.k + 1, r = game.round;
    if (k >= game.order.length) { k = 0; r++; }
    if (r > game.settings.rounds) return null;
    if (game.settings.mode !== "teams") {
      if (k === 0 && game.settings.random) return "عشوائي 🎲";
      return game.players[game.order[k]].name;
    }
    if (k === 0 && game.settings.random) return "عشوائي 🎲";
    var slot = game.order[k], t = game.teams[slot];
    var members = game.players.filter(function (p) { return p.team === slot; });
    return game.settings.random ? t.name : members[t.turns % members.length].name + " (" + t.name + ")";
  }

  /* ---------- turn flow ---------- */
  var timerId = null;
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function ensureTimer() {
    if (timerId) return;
    timerId = setInterval(tick, 1000);
  }
  function tick() {
    if (!game || !game.cur || view !== "game") return;
    var c = game.cur;
    if (game.phase === "memorize") {
      c.memLeft--;
      if (c.memLeft <= 0) { game.phase = "ready"; SFX.pop(); commit(); return; }
      var m = document.getElementById("mem-left"); if (m) m.textContent = c.memLeft;
      var mr = document.getElementById("mem-ring"); if (mr) mr.style.setProperty("--p", c.memLeft / game.settings.memTime);
      saveGame(); return;
    }
    if (game.phase !== "guess" || c.paused || modal) return;
    c.timeLeft--; c.elapsed++; c.itemElapsed++;
    if (c.timeLeft <= 5 && c.timeLeft > 0) SFX.tick();
    if (c.timeLeft <= 0) { c.timeLeft = 0; SFX.buzzer(); endTurn("time"); return; }
    var el = document.getElementById("time-left"); if (el) el.textContent = c.timeLeft;
    var ring = document.getElementById("ring");
    if (ring) { ring.style.setProperty("--p", c.timeLeft / game.settings.turnTime); ring.classList.toggle("warn", c.timeLeft <= 10); }
    saveGame();
  }

  var ACT_PHASE = { peek: "handoff", memdone: "memorize", start: "ready", pause: "guess", guess: "guess", spoken: "guess", check: "guess", "judge-yes": "guess", "judge-no": "guess", "judge-vote": "guess", object: "guess", "vote-done": "guess", skip: "guess", redo: "guess", next: "result", "accept-end": "guess" };
  function act(name) {
    var c = game && game.cur;
    if (!game || (ACT_PHASE[name] && game.phase !== ACT_PHASE[name])) return;
    if ((name === "vote-done" && (!modal || modal.type !== "vote")) || (name === "confirm-yes" && (!modal || modal.type !== "confirm"))) return;
    if ((name === "judge-yes" || name === "judge-no" || name === "judge-vote") && (!modal || modal.type !== "judge")) return;
    switch (name) {
      case "peek": game.phase = "memorize"; c.memLeft = game.settings.memTime; c.flash = null; SFX.pop(); ensureTimer(); commit(); break;
      case "memdone": game.phase = "ready"; SFX.pop(); commit(); break;
      case "start": game.phase = "guess"; c.paused = false; SFX.go(); ensureTimer(); commit(); break;
      case "pause": c.paused = !c.paused; commit(); break;
      case "hint":
        if (game.phase === "guess" && !c.paused && !c.pendingEnd && (c.hintFor !== c.itemId || (c.hintN || 1) < HINT_MAX)) {
          c.hintN = c.hintFor === c.itemId ? (c.hintN || 1) + 1 : 1; c.hintFor = c.itemId; c.timeLeft = Math.max(1, Math.ceil(c.timeLeft * 0.75)); SFX.pop(); commit();
        }
        break;
      case "guess": modal = { type: "guess" }; render(); var gi = document.getElementById("guess-input"); if (gi) gi.focus(); break;
      case "spoken": modal = { type: "judge" }; render(); break;
      case "check":
        var v = (document.getElementById("guess-input") || {}).value || "";
        if (!v.trim()) return;
        modal = null;
        if (matches(v, item(c.itemId))) correct(v.trim());
        else wrong(v.trim(), true);
        break;
      case "judge-yes": modal = null; correct(null); break;
      case "judge-no": modal = null; wrong(null, false); break;
      case "judge-vote": modal = { type: "vote", ctx: "judge", votes: {} }; render(); break;
      case "object": modal = { type: "vote", ctx: "object", votes: {} }; render(); break;
      case "vote-done": finishVote(); break;
      case "skip": modal = { type: "confirm", what: "skip" }; render(); break;
      case "redo": modal = { type: "confirm", what: "redo" }; render(); break;
      case "end": modal = { type: "confirm", what: "end" }; render(); break;
      case "confirm-yes":
        var w = modal.what; modal = null;
        if (w === "skip") { if (game.settings.mode === "duel") duelNext("pass"); else endTurn("skip"); }
        else if (w === "redo") { startTurn(c.player); SFX.pop(); commit(); }
        else if (w === "end") finishGame();
        break;
      case "next": advance(); break;
      case "accept-end": acceptEnd(); break;
      case "board": modal = { type: "board" }; render(); break;
    }
  }

  function voters() {
    var c = game.cur;
    // يصوّت الكل غير المخمّن (فريقه والخصم) — لو صوّت الخصم بروحه صار هو الحكم على نفسه
    return game.players.map(function (p, i) { return i; }).filter(function (i) { return i !== c.player; });
  }

  function finishVote() {
    var vs = modal.votes, yes = 0, no = 0;
    Object.keys(vs).forEach(function (k) { if (vs[k] === true) yes++; else if (vs[k] === false) no++; });
    if (!yes && !no) return;
    var ctx = modal.ctx; modal = null;
    var ok = yes >= no; // التعادل لصالح المخمّن
    if (ctx === "object") {
      if (ok) { game.cur.attempts++; game.cur.guesses.pop(); game.cur.pendingEnd = false; game.cur.paused = false; correct(game.cur.lastTyped); }
      else if (game.cur.pendingEnd) { game.cur.lastTyped = null; acceptEnd(); }
      else { game.cur.feedback = { text: "العائلة قالت: غلط 🗳️", cls: "bad" }; game.cur.lastTyped = null; commit(); }
    } else { if (ok) correct(null); else wrong(null, false); }
  }

  function correct(text) {
    var c = game.cur, p = game.players[c.player];
    var attemptNo = ATTEMPTS - c.attempts + 1;
    var base = attemptNo === 1 ? 15 : 10;
    var bonus = c.itemElapsed <= QUICK_BONUS_SEC ? 5 : 0;
    var mult = c.double ? 2 : 1;
    var total = (base + bonus) * mult;
    p.score += total; p.wins++;
    game.log.push({ player: c.player, item: c.itemId, points: total, round: game.round });
    var breakdown = { base: base, bonus: bonus, mult: mult, total: total, attemptNo: attemptNo, secs: c.itemElapsed };
    SFX.correct();
    if (game.settings.mode === "duel") { c.duelCount++; c.duelPts += total; duelNext("correct", breakdown); return; }
    endTurn("correct", breakdown);
  }

  function wrong(text, typed) {
    var c = game.cur;
    c.attempts--;
    c.guesses.push(text || "؟");
    c.lastTyped = typed ? text : null;
    SFX.wrong();
    shakeNext = true;
    if (c.attempts <= 0) {
      if (typed) { c.pendingEnd = true; c.paused = true; c.feedback = { text: "خلصت المحاولات 💔 — إذا تشوفون إنها صح اعترضوا", cls: "bad" }; commit(); return; }
      acceptEnd(); return;
    }
    c.feedback = { text: pick(LINES.wrong) + " — باقي لك " + c.attempts + (c.attempts === 1 ? " محاولة" : " محاولات"), cls: "bad" };
    commit();
  }

  function acceptEnd() {
    var c = game.cur; c.pendingEnd = false; c.paused = false;
    if (game.settings.mode === "duel") duelNext("attempts"); else endTurn("attempts");
  }

  function duelNext(why, breakdown) {
    var c = game.cur, prev = item(c.itemId);
    c.flash = { why: why, name: prev ? prev.name : "", pts: breakdown ? breakdown.total : 0 };
    c.itemId = pickItem(c.surprise);
    c.attempts = ATTEMPTS; c.guesses = []; c.lastTyped = null; c.itemElapsed = 0; c.feedback = null;
    game.phase = "handoff";
    commit();
  }

  function endTurn(reason, breakdown) {
    var c = game.cur, p = game.players[c.player];
    p.turns++;
    c.result = { reason: reason, breakdown: breakdown || null, line: pick(reason === "correct" ? LINES.correct : reason === "time" ? LINES.time : LINES.fail) };
    if (game.settings.mode === "duel" && reason === "time") c.result.line = c.duelCount ? (c.duelCount + " أشياء في " + game.settings.turnTime + " ثانية! 🔥") : pick(LINES.fail);
    if (reason !== "correct" && reason !== "time") SFX.wrong();
    game.phase = "result";
    commit();
  }

  function advance() {
    var willEnd = game.k + 1 >= game.order.length && game.round + 1 > game.settings.rounds;
    if (!willEnd) if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("kh")) return;
    game.k++;
    if (game.k >= game.order.length) {
      game.k = 0; game.round++;
      if (game.round > game.settings.rounds) { finishGame(); return; }
      buildOrder();
    }
    startTurn();
    commit();
  }

  function finishGame() { stopTimer(); game.phase = "over"; SFX.win(); commit(); }

  /* ---------- rendering ---------- */
  var shakeNext = false;
  function commit() { saveGame(); render(); }

  function itemVisual(it, cls) {
    var ph = shownPhoto(it.id);
    return ph ? '<img class="big-photo ' + (cls || "") + '" src="' + ph + '" alt="' + esc(it.name) + '">' : '<div class="big-emoji ' + (cls || "") + '" aria-hidden="true">' + it.emoji + "</div>";
  }

  function rankedPlayers() { return game.players.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return b.p.score - a.p.score || b.p.wins - a.p.wins; }); }
  function rankedTeams() {
    return game.teams.map(function (t, i) {
      var ms = game.players.filter(function (p) { return p.team === i; });
      return { t: t, i: i, score: ms.reduce(function (s, p) { return s + p.score; }, 0), wins: ms.reduce(function (s, p) { return s + p.wins; }, 0), members: ms };
    }).sort(function (a, b) { return b.score - a.score || b.wins - a.wins; });
  }
  function withRanks(list, key) { var last = null, r = 0; return list.map(function (x, k) { var s = key(x); if (s !== last) { r = k + 1; last = s; } x.rank = r; return x; }); }

  function boardHTML(compact) {
    var cur = game.cur ? game.cur.player : -1, html = "";
    if (game.settings.mode === "teams") {
      withRanks(rankedTeams(), function (x) { return x.score; }).forEach(function (x) {
        var mine = cur >= 0 && game.players[cur].team === x.i;
        html += '<div class="lb-row lb-team' + (mine ? " me" : "") + '" style="--team:' + x.t.color + '">' + (compact ? "" : '<span class="r">' + x.rank + "</span>") + '<span class="n">' + esc(compact ? x.t.name.replace("فريق ", "") : x.t.name) + (compact ? "" : ' <small>✓' + x.wins + "</small>") + '</span><span class="s">' + x.score + "</span></div>";
        if (!compact) html += '<div class="lb-members">' + x.members.map(function (p) { return esc(p.name) + " " + p.score; }).join(" · ") + "</div>";
      });
    } else {
      withRanks(rankedPlayers(), function (x) { return x.p.score; }).forEach(function (x) {
        html += '<div class="lb-row' + (x.i === cur ? " me" : "") + '">' + (compact ? "" : '<span class="r">' + x.rank + "</span>") + '<span class="n">' + (compact ? x.rank + ". " : "") + esc(x.p.name) + (compact ? "" : ' <small>✓' + x.p.wins + "</small>") + '</span><span class="s">' + x.p.score + "</span></div>";
      });
    }
    return html;
  }

  function topbar() {
    var c = game.cur, s = game.settings, it = c && item(c.itemId);
    var info = '<span>الجولة ' + Math.min(game.round, s.rounds) + " من " + s.rounds + "</span>";
    if (c && c.double) info += '<span class="pill hot">🔥 الجولة دبل ×2</span>';
    if (c && c.surprise) info += '<span class="pill surprise">🎉 جولة المفاجأة</span>';
    if (s.random) info += '<span class="pill">🎲 عشوائي</span>';
    if (game.trial) info += '<span class="pill gold">تجربة</span>';
    if (it && (game.phase === "guess" || game.phase === "ready" || game.phase === "result")) info += '<span class="pill">' + cat(it.cat).icon + " " + esc(cat(it.cat).name) + "</span>";
    return '<div class="topbar"><div class="info">' + info + "</div>" +
      '<div class="top-actions"><button class="btn ghost" data-act="board" title="الترتيب">🏆<span class="lbl"> الترتيب</span></button>' +
      '<button class="btn ghost" data-ui="fullscreen" title="ملء الشاشة">⛶<span class="lbl"> ملء الشاشة</span></button>' +
      '<button class="btn ghost" data-ui="sound" title="الصوت" aria-label="الصوت" aria-pressed="' + (settings.sound ? "true" : "false") + '">' + (settings.sound ? "🔊" : "🔇") + "</button>" +
      '<button class="btn ghost" data-act="end" title="إنهاء">✕<span class="lbl"> إنهاء</span></button></div></div>';
  }

  function vGame() {
    var c = game.cur, s = game.settings, p = game.players[c.player], it = item(c.itemId);
    var who = esc(p.name) + (s.mode === "teams" ? '<small>' + esc(game.teams[p.team].name) + "</small>" : "");
    var stage = "", actions = "";
    if (!it) { stage = '<p class="instr">ما فيه أشياء كفاية في البنك.</p>'; actions = '<button class="btn go big" data-act="end">إنهاء</button>'; }
    else if (game.phase === "handoff") {
      var flash = "";
      if (c.flash) flash = c.flash.why === "correct" ? '<div class="feedback good pop">✅ صح! +' + c.flash.pts + " — كمّل!</div>"
        : '<div class="feedback bad">' + (c.flash.why === "pass" ? "⏭ باص" : "💔 خلصت المحاولات") + " — كانت: " + esc(c.flash.name) + "</div>";
      var banner = (!c.flash && game.k === 0 && (c.double || c.surprise)) ? '<div class="banner ' + (c.double ? "hot" : "surprise") + ' pop">' + (c.double ? "🔥 الجولة الأخيرة دبل! النقاط ×2" : "🎉 جولة المفاجأة! أشياء غريبة وغير متوقعة") + "</div>" : "";
      stage = banner + flash + '<div class="peek-icon" aria-hidden="true">🙈</div><div class="who"><small>الدور على</small>' + who + "</div>" +
        '<p class="instr">يا ' + esc(p.name) + " لف وجهك عن الشاشة! والباقين اضغطوا «وريني» 👀</p>" +
        (s.mode === "duel" && c.elapsed ? '<p class="muted">باقي من وقتك ' + c.timeLeft + " ثانية · ✅ " + c.duelCount + "</p>" : "");
      actions = '<button class="btn go huge" data-act="peek">وريني 👀</button>';
    } else if (game.phase === "memorize") {
      stage = itemVisual(it, "pop") + '<div class="item-name pop">' + esc(it.name) + "</div>" +
        '<div class="ring mem-ring" id="mem-ring" style="--p:' + (c.memLeft / s.memTime) + '"><span id="mem-left">' + c.memLeft + "</span></div>" +
        '<p class="instr warn">احفظوها بسرعة! 🤫 لا أحد يقولها</p>';
      actions = '<button class="btn yes huge" data-act="memdone">حفظناها ✅</button>';
    } else if (game.phase === "ready") {
      stage = '<div class="peek-icon" aria-hidden="true">✅</div><div class="who"><small>اختفت! التفت للشاشة يا</small>' + who + "</div>" +
        '<p class="instr">اسأل أسئلة جوابها «إيه» أو «لا» بس. عندك ' + ATTEMPTS + " محاولات و" + (s.mode === "duel" ? c.timeLeft : s.turnTime) + " ثانية" + (s.mode === "duel" ? " لأكبر عدد من الأشياء" : "") + ".</p>";
      actions = '<button class="btn go huge" data-act="start">يلا نبدأ ⏱</button>';
    } else if (game.phase === "guess") {
      var hearts = ""; for (var i = 0; i < ATTEMPTS; i++) hearts += '<span class="' + (i < c.attempts ? "" : "off") + '">❤️</span>';
      stage = '<div class="who" style="font-size:clamp(22px,4vh,44px)">' + esc(p.name) + (s.mode === "duel" ? " · ✅ " + c.duelCount : "") + "</div>" +
        '<div class="ring' + (c.timeLeft <= 10 ? " warn" : "") + (c.paused ? " paused" : "") + '" id="ring" style="--p:' + (c.timeLeft / s.turnTime) + '"><span id="time-left">' + (c.paused && !c.pendingEnd ? "⏸ متوقف" : c.timeLeft) + "</span></div>" +
        '<div class="hearts' + (shakeNext ? " shake" : "") + '" aria-label="المحاولات الباقية ' + c.attempts + '">' + hearts + "</div>" +
        '<div class="feedback ' + (c.feedback ? c.feedback.cls : "") + '">' + (c.feedback ? esc(c.feedback.text) : "اسأل… والباقين يجاوبون «إيه» أو «لا» بس") + "</div>" +
        (c.hintFor === c.itemId ? '<div class="hint-box"><b>💡 تلميح ' + (c.hintN || 1) + "/" + HINT_MAX + ":</b>" + hintHTML(it, c.hintN || 1) + "</div>" : "") +
        (c.guesses.length ? '<div class="guess-list">' + c.guesses.map(function (g) { return "<span>" + esc(g) + "</span>"; }).join("") + "</div>" : "") +
        (c.lastTyped && !c.pendingEnd ? '<button class="btn small ghost" data-act="object">🙋 اعتراض! كانت صح</button>' : "");
      if (c.pendingEnd) actions = '<button class="btn huge" data-act="object">🙋 اعتراض</button><button class="btn go huge" data-act="accept-end">تمام ▶</button>';
      else actions = '<button class="btn go huge" data-act="guess"' + (c.paused ? " disabled" : "") + ">خمّن 💡</button>" +
        '<button class="btn big hint-btn" data-act="hint"' + (c.paused || (c.hintFor === c.itemId && (c.hintN || 1) >= HINT_MAX) ? " disabled" : "") + ">" + (c.hintFor === c.itemId ? "💡 تلميح أكثر" : "💡 تلميح") + " (يروح ربع الوقت)</button>" +
        '<button class="btn big" data-act="pause">' + (c.paused ? "▶ كمّل" : "⏸ وقف") + "</button>" +
        '<button class="btn big" data-act="skip">' + (s.mode === "duel" ? "باص ⏭" : "تخطي ⏭") + "</button>" +
        (s.mode === "duel" ? "" : '<button class="btn big" data-act="redo">إعادة 🔄</button>');
    } else if (game.phase === "result") {
      var r = c.result, b = r.breakdown, ok = r.reason === "correct";
      var why = { time: "خلص الوقت ⏰", attempts: "خلصت المحاولات الخمس 💔", skip: "تم التخطي ⏭" }[r.reason] || "";
      var chips = "";
      if (b) {
        chips = '<div class="pts"><span>' + (b.attemptNo === 1 ? "من أول محاولة 15" : "تخمين صحيح 10") + "</span>" +
          (b.bonus ? "<span>⚡ أسرع من " + QUICK_BONUS_SEC + " ثانية +" + b.bonus + "</span>" : "") +
          (b.mult > 1 ? "<span>🔥 دبل ×2</span>" : "") + '<span class="total">+' + b.total + " " + ptsWord(b.total) + "</span></div>";
      } else if (s.mode === "duel") chips = '<div class="pts"><span>✅ ' + c.duelCount + ' أشياء</span><span class="total">+' + c.duelPts + " " + ptsWord(c.duelPts) + "</span></div>";
      else chips = '<div class="pts"><span>' + why + '</span><span class="total">0 نقاط</span></div>';
      var good = ok || (s.mode === "duel" && c.duelCount > 0);
      stage = '<div class="comment ' + (good ? "" : "sad") + ' pop">' + esc(r.line) + "</div>" + itemVisual(it, "pop") +
        '<div class="item-name">' + (ok ? "" : '<span class="muted" style="font-size:.45em;display:block">' + (s.mode === "duel" ? "آخر شيء كان" : "الجواب كان") + "</span>") + esc(it.name) + "</div>" + chips;
      var nxt = nextPerformerName();
      actions = '<button class="btn go huge" data-act="next">' + (nxt ? "التالي ▶" : "النتيجة النهائية 🏆") + "</button>" + (nxt ? '<span class="muted">الدور الجاي: ' + esc(nxt) + "</span>" : "");
    }
    shakeNext = false;
    return '<section class="screen">' + topbar() +
      '<div class="lb-strip">' + boardHTML(true) + "</div>" +
      '<div class="game-body"><div class="stage' + (game.phase === "handoff" || game.phase === "ready" ? " cover" : "") + '">' + stage + "</div>" +
      '<aside class="board panel"><h3>الترتيب</h3>' + boardHTML(false) + "</aside></div>" +
      '<div class="actionbar">' + actions + "</div></section>";
  }

  function vOver() {
    var rp = withRanks(rankedPlayers(), function (x) { return x.p.score; });
    var top = rp[0].p.score, champs = rp.filter(function (x) { return x.p.score === top; });
    var head, star = "";
    if (game.settings.mode === "teams") {
      // في الفرق: الفريق هو البطل، واللاعب الأعلى «نجم اللعبة»
      var rt = rankedTeams(), tt = rt[0].score, wins = rt.filter(function (x) { return x.score === tt; });
      head = '<div class="muted" style="font-size:1.2em">' + (wins.length > 1 ? "تعادل!" : "الفريق الفايز") + '</div><div class="champ">' + wins.map(function (x) { return esc(x.t.name); }).join(" و ") + "</div>" +
        '<div class="pts"><span class="total">' + tt + " " + ptsWord(tt) + "</span></div>";
      star = '<div class="banner surprise">⭐ نجم اللعبة: ' + champs.map(function (x) { return esc(x.p.name); }).join(" و ") + " (" + top + ")</div>";
    } else {
      head = '<div class="muted" style="font-size:1.2em">' + (champs.length > 1 ? "الأبطال" : "البطل") + "</div>" +
        '<div class="champ">' + champs.map(function (x) { return esc(x.p.name); }).join(" و ") + "</div>" +
        '<div class="pts"><span class="total">' + top + " " + ptsWord(top) + "</span><span>✓ " + champs[0].p.wins + " " + (champs[0].p.wins >= 3 && champs[0].p.wins <= 10 ? "تخمينات" : "تخمين") + " صح</span></div>";
    }
    return '<canvas id="confetti" aria-hidden="true"></canvas><section class="final">' +
      '<div class="trophy" aria-hidden="true">🏆</div>' + head + star +
      '<div class="board panel">' + boardHTML(false) + "</div>" +
      (game.trial ? '<p class="banner surprise">خلصت التجربة 👌 جاهزين للعب الجد؟</p>' : "") +
      '<div class="row"><button class="btn go big" data-ui="replay">' + (game.trial ? "نلعب جد! 🎮" : "نلعب مرة ثانية 🔁") + "</button>" + '<button class="btn big" data-ui="setup">تعديل الإعدادات</button><button class="btn big ghost" data-ui="home-clear">الصفحة الأولى</button></div></section>';
  }

  function summary() {
    var n = settings.players.filter(function (x) { return x.trim(); }).length;
    var m = { solo: "فردي", teams: settings.teamCount + " فرق", duel: "مواجهة" }[settings.mode];
    return m + " · " + n + " لاعبين · " + settings.rounds + " جولات · " + settings.turnTime + " ثانية · " + (settings.level ? lvl(settings.level).name : "صعوبة منوّعة") + " · " + (settings.cats.length ? settings.cats.length + " تصنيفات" : "كل التصنيفات");
  }

  function vHome() {
    var resumable = game && game.phase !== "over";
    return '<section class="home"><div class="emoji-row" aria-hidden="true"><span>🐪</span><span>☕</span><span>🎲</span></div>' +
      '<h1 class="title">خمّن وش هو؟</h1><div class="sadu" aria-hidden="true"></div>' +
      '<p class="subtitle">واحد ما يشوف الشاشة، والباقين يشوفون الشيء. يسأل أسئلة جوابها «إيه» أو «لا» ويخمّن قبل لا يخلص الوقت!</p>' +
      '<div class="home-stack">' +
      (resumable ? '<button class="btn go big" data-ui="resume">كمّل اللعبة (الجولة ' + game.round + ")</button>" : "") +
      '<button class="btn ' + (resumable ? "" : "go ") + 'big start" data-ui="quick">ابدأ اللعب 🎮</button>' +
      '<div class="row"><button class="btn big ghost" data-ui="trial">تجربة سريعة</button><button class="btn big ghost" data-ui="howto">طريقة اللعب</button></div>' +
      '<button class="btn big" data-ui="setup">الإعدادات</button>' +
      "</div></section>";
  }

  function vSetup() {
    var s = settings, isTeams = s.mode === "teams";
    var pl = s.players.map(function (n, i) {
      var t = (s.teamOf[i] || 0) % s.teamCount;
      return '<span class="pchip">' + (isTeams ? '<button class="team-dot" data-team-cycle="' + i + '" style="background:' + TEAM_COLORS[t] + '" title="' + TEAM_NAMES[t] + ' — اضغط للتغيير" aria-label="فريق ' + esc(n) + ": " + TEAM_NAMES[t] + '"></button>' : "") + esc(n) +
        '<button class="x" data-del-player="' + i + '" aria-label="حذف ' + esc(n) + '">✕</button></span>';
    }).join("");
    var who = window.MAJLIS_WHO && MAJLIS_WHO();
    if (who && who.kind === "teams") return vSetupWith('<div class="setup-col panel' + (setupTab === "players" ? " on" : "") + '"><div class="field">' + MAJLIS_WHO_NOTE() + '<p class="hint">كل فريق ياخذ دوره ويخمّن كأنه لاعب واحد.</p></div></div>');
    var col1 = '<div class="setup-col panel' + (setupTab === "players" ? " on" : "") + '">' +
      '<div class="field"><span class="label">نمط اللعب</span><div class="chips">' +
      [["solo", "فردي 🙋"], ["teams", "فرق 👥"], ["duel", "مواجهة ⚔️"]].map(function (m) { return '<button class="chip" data-mode="' + m[0] + '" aria-pressed="' + (s.mode === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</div>" +
      '<p class="hint">' + { solo: "كل لاعب يلعب لنفسه ويجمع نقاطه.", teams: "الفرق تتناوب، وأعضاء كل فريق يتناوبون على التخمين.", duel: "لاعبين اثنين، وكل واحد يخمّن أكبر عدد من الأشياء في وقته." }[s.mode] + "</p></div>" +
      (isTeams ? '<div class="field"><span class="label">عدد الفرق</span><div class="chips">' + [2, 3, 4].map(function (n) { return '<button class="chip" data-teams="' + n + '" aria-pressed="' + (s.teamCount === n) + '">' + n + "</button>"; }).join("") + '</div><p class="hint">اضغط الدائرة الملونة جنب الاسم لتغيير فريقه.</p></div>' : "") +
      (who ? '<div class="field">' + MAJLIS_WHO_NOTE() + '<div class="player-list">' + pl + "</div></div></div>" : '<div class="field"><span class="label">اللاعبين (' + s.players.length + ')</span><form class="add-row" id="add-player"><input id="new-player" maxlength="16" placeholder="اكتب الاسم واضغط إضافة"><button class="btn go" type="submit">إضافة</button></form>' +
      '<div class="chips namepick">' + (regNames().length ? regNames() : COMMON).map(function (c) { var used = s.players.some(function (n) { return n.trim() === c; }); return '<button class="chip" data-pickname="' + esc(c) + '" aria-pressed="' + used + '">' + (used ? "✓ " : "") + esc(c) + "</button>"; }).join("") + "</div>" +
      '<div class="player-list">' + pl + "</div></div></div>");
    return vSetupWith(col1);
  }
  function vSetupWith(col1) {
    var s = settings, isTeams = s.mode === "teams";
    var col2 = '<div class="setup-col panel' + (setupTab === "items" ? " on" : "") + '">' +
      '<div class="field"><span class="label">التصنيفات</span><div class="chips"><button class="chip" data-cat="all" aria-pressed="' + (!s.cats.length) + '">🎲 الكل</button>' +
      CATS.map(function (c) { return '<button class="chip" data-cat="' + c.id + '" aria-pressed="' + (s.cats.indexOf(c.id) >= 0) + '">' + c.icon + " " + c.name + "</button>"; }).join("") + "</div></div>" +
      '<div class="field"><span class="label">الصعوبة</span><div class="chips"><button class="chip" data-level="0" aria-pressed="' + (!s.level) + '">منوّعة</button>' +
      LEVELS.map(function (l) { return '<button class="chip" data-level="' + l.id + '" aria-pressed="' + (s.level === l.id) + '">' + l.name + "</button>"; }).join("") +
      '</div><p class="hint">' + (s.level ? lvl(s.level).hint : "خليط من كل المستويات") + "</p></div></div>";
    var col3 = '<div class="setup-col panel' + (setupTab === "rounds" ? " on" : "") + '">' +
      '<div class="field"><span class="label">عدد الجولات</span><div class="stepper"><button class="btn" data-ui="rounds-" aria-label="أقل">−</button><output>' + s.rounds + '</output><button class="btn" data-ui="rounds+" aria-label="أكثر">+</button></div><p class="hint">في كل جولة يلعب كل ' + (isTeams ? "فريق" : "لاعب") + " مرة.</p></div>" +
      '<div class="field"><span class="label">وقت ' + (s.mode === "duel" ? "كل لاعب" : "الدور") + '</span><div class="chips">' + [45, 60, 90, 120].map(function (t) { return '<button class="chip" data-time="' + t + '" aria-pressed="' + (s.turnTime === t) + '">' + t + " ث</button>"; }).join("") + "</div></div>" +
      '<div class="field"><span class="label">وقت حفظ الشيء</span><div class="chips">' + [4, 6, 8, 10].map(function (t) { return '<button class="chip" data-mem="' + t + '" aria-pressed="' + (s.memTime === t) + '">' + t + " ث</button>"; }).join("") + "</div></div>" +
      '<div class="field"><span class="label">إضافات الحماس</span><div class="toggles">' +
      [["double", "🔥 الجولة الأخيرة دبل", "النقاط ×2 في آخر جولة"], ["surprise", "🎉 جولة المفاجأة", "جولة في النص كلها أشياء غريبة"], ["random", "🎲 النمط العشوائي", "النظام يختار التصنيف والصعوبة واللاعب"], ["sound", "🔊 الأصوات", "مؤقت وأصوات للصح والغلط"], ["photos", "📷 صور حقيقية", "صورة بدل الرمز للأشياء اللي لها صورة"]]
        .map(function (t) { return '<label class="toggle"><input type="checkbox" id="opt-' + t[0] + '" data-opt="' + t[0] + '"' + (s[t[0]] ? " checked" : "") + "><span><b>" + t[1] + "</b><small>" + t[2] + "</small></span></label>"; }).join("") +
      "</div></div></div>";
    return '<section class="screen"><div class="page-head"><h2>جهّزوا اللعبة</h2><button class="btn ghost" data-ui="home">الصفحة الأولى</button></div>' +
      '<div class="tabs" role="tablist">' + [["players", "اللاعبين"], ["items", "الأشياء"], ["rounds", "الجولات"]].map(function (t) { return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (setupTab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<div class="setup-body">' + col1 + col2 + col3 + "</div>" + (setupErr ? '<p class="error">' + esc(setupErr) + "</p>" : "") +
      '<div class="setup-foot"><span class="summary">' + esc(summary()) + '</span><button class="btn go huge" data-ui="start">ابدأ 🎮</button></div></section>';
  }

  function vHowto() {
    return '<section class="screen"><div class="page-head"><h2>كيف نلعب؟</h2><button class="btn ghost" data-ui="home">الصفحة الأولى</button></div><div class="scroll"><div class="howto panel">' +
      "<ol><li>صاحب الدور يلف وجهه عن الشاشة 🙈، والباقين يضغطون «وريني» ويحفظون الشيء.</li>" +
      "<li>يختفي الشيء، ويلتفت صاحب الدور ويضغط «يلا نبدأ».</li>" +
      "<li>يسأل أسئلة جوابها «إيه» أو «لا» بس — ممنوع التلميح أو قول الاسم.</li>" +
      "<li>إذا عرفها يضغط «خمّن» ويكتب جوابه، والنظام يتحقق منه ويقبل المرادفات المشهورة. أو يقولها بصوت والعائلة تحكم.</li>" +
      "<li>عنده 5 محاولات. إذا خلصت المحاولات أو الوقت، يروح الدور للي بعده.</li></ol>" +
      '<h3>النقاط</h3><div class="pts-table"><div><b>10</b>تخمين صحيح</div><div><b>15</b>صح من أول محاولة</div><div><b>+5</b>إذا عرفها في أول ' + QUICK_BONUS_SEC + ' ثانية</div><div><b>×2</b>في الجولة الدبل</div><div><b>0</b>خلص الوقت أو المحاولات</div></div>' +
      "<h3>إذا اختلفتوا</h3><p>إذا رفض النظام جواب ويشوف المخمّن إنه صح، يضغط «اعتراض» ويصير تصويت بين الكل غير المخمّن (فريقه والخصم). التعادل لصالح المخمّن.</p>" +
      "<h3>الأنماط</h3><ul><li><b>فردي:</b> كل واحد لنفسه.</li><li><b>فرق:</b> الفرق تتناوب، وكل فريق يتناوب أعضاؤه.</li><li><b>مواجهة:</b> لاعبين اثنين، وكل واحد يخمّن أكثر عدد في وقته. «باص» ينقله لشيء جديد.</li><li><b>عشوائي:</b> النظام يختار التصنيف والصعوبة وترتيب اللاعبين.</li></ul>" +
      "<h3>أزرار مفيدة</h3><ul><li><b>إعادة 🔄:</b> نفس اللاعب بشيء جديد (لو أحد قالها بالغلط).</li><li><b>تخطي ⏭:</b> ينتقل الدور بدون نقاط.</li><li><b>⏸ وقف:</b> يوقف الوقت.</li><li>زر <kbd>مسافة</kbd> أو <kbd>Enter</kbd> ينفّذ الزر الرئيسي.</li></ul>" +
      "<h3>صور حقيقية</h3><p>من «بنك الأشياء» تقدرون تضيفون صورة لأي شيء من جوالكم أو جهازكم، وتظهر بدل الرمز.</p>" +
      "</div></div></section>";
  }

  function vBank() {
    var list = bank.filter(function (it) {
      if (bankF.cat && it.cat !== bankF.cat) return false;
      if (bankF.lvl && it.lvl !== +bankF.lvl) return false;
      if (bankF.q && norm(it.name + " " + it.syn.join(" ")).indexOf(norm(bankF.q)) < 0) return false;
      return true;
    });
    var items = list.map(function (it) {
      var ph = shownPhoto(it.id);
      var del = pendingDel === it.id ? '<button class="btn small no" data-del-yes="' + it.id + '">تأكيد</button><button class="btn small ghost" data-del-no="1">لا</button>' : '<button class="btn small ghost" data-del="' + it.id + '" aria-label="حذف ' + esc(it.name) + '">🗑</button>';
      return '<div class="bank-item"><span class="em">' + (ph ? '<img src="' + ph + '" alt="">' : it.emoji) + '</span><span style="min-width:0"><span class="nm">' + esc(it.name) + '</span><span class="mt">' + cat(it.cat).icon + " " + lvl(it.lvl).name + " · " + it.syn.length + " مرادف</span></span>" +
        '<span class="acts"><button class="btn small" data-edit="' + it.id + '">تعديل</button>' + del + "</span></div>";
    }).join("");
    return '<section class="screen"><div class="page-head"><h2>بنك الأشياء</h2><div class="row"><button class="btn go" data-ui="new-item">إضافة شيء</button><button class="btn ghost" data-ui="home">الصفحة الأولى</button></div></div>' +
      '<div class="warn-note">الشاشة هذي تكشف كل الأشياء — افتحوها بعيد عن اللاعبين. تقدرون تضيفون صورة حقيقية لأي شيء من زر «تعديل».</div>' +
      '<div class="bank-tools"><select id="bf-cat" data-bf="cat" aria-label="التصنيف"><option value="">كل التصنيفات</option>' + CATS.map(function (c) { return '<option value="' + c.id + '"' + (bankF.cat === c.id ? " selected" : "") + ">" + c.icon + " " + c.name + "</option>"; }).join("") + "</select>" +
      '<select id="bf-lvl" data-bf="lvl" aria-label="الصعوبة"><option value="">كل المستويات</option>' + LEVELS.map(function (l) { return '<option value="' + l.id + '"' + (+bankF.lvl === l.id ? " selected" : "") + ">" + l.name + "</option>"; }).join("") + "</select>" +
      '<input id="bf-q" type="search" data-bf="q" placeholder="بحث" value="' + esc(bankF.q) + '"><span class="muted">' + list.length + " من " + bank.length + "</span></div>" +
      '<div class="scroll"><div class="bank-grid">' + (items || '<p class="muted">ما فيه نتائج.</p>') + "</div></div>" +
      '<div class="row"><button class="btn small ghost" data-ui="reset-bank">استعادة البنك الأصلي</button></div></section>';
  }

  function vModal() {
    if (!modal) return "";
    var m = modal, inner = "";
    if (m.type === "guess") {
      inner = "<h2>وش تخمينك؟ 🤔</h2>" +
        '<form id="guess-form" class="form-grid" style="text-align:center"><input class="guess-input" id="guess-input" autocomplete="off" maxlength="40" placeholder="اكتب هنا…" aria-label="التخمين">' +
        '<div class="actions"><button class="btn go big" type="submit">تحقق ✅</button><button class="btn big" type="button" data-act="spoken">قلتها بصوت — احكموا 🗣️</button></div></form>' +
        '<p class="muted">الوقت واقف وأنت تكتب. باقي لك ' + game.cur.attempts + " " + (game.cur.attempts === 1 ? "محاولة" : "محاولات") + '.</p><div class="actions"><button class="btn small ghost" data-ui="close">رجوع</button></div>';
    } else if (m.type === "judge") {
      inner = "<h2>العائلة تحكم ⚖️</h2><p>" + esc(game.players[game.cur.player].name) + " قال جوابه بصوت. صح ولا غلط؟</p>" +
        '<div class="actions"><button class="btn yes big" data-act="judge-yes">صح ✅</button><button class="btn no big" data-act="judge-no">غلط ❌</button><button class="btn big" data-act="judge-vote">مختلفين؟ تصويت 🗳️</button></div>';
    } else if (m.type === "vote") {
      var vs = voters(), yes = 0, no = 0;
      Object.keys(m.votes).forEach(function (k) { if (m.votes[k] === true) yes++; else if (m.votes[k] === false) no++; });
      inner = "<h2>تصويت 🗳️</h2><p>" + (m.ctx === "object" ? "«" + esc(game.cur.lastTyped) + "» — هل هي نفس الشيء؟" : "هل كان جواب " + esc(game.players[game.cur.player].name) + " صح؟") + '</p><p class="muted">كل واحد يصوّت (ما يصوّت المخمّن). التعادل لصالح المخمّن.</p>' +
        '<div class="voters">' + vs.map(function (i) {
          return '<div class="voter"><span class="n">' + esc(game.players[i].name) + '</span><button class="v-yes" data-vote="' + i + ':1" aria-pressed="' + (m.votes[i] === true) + '">👍 صح</button><button class="v-no" data-vote="' + i + ':0" aria-pressed="' + (m.votes[i] === false) + '">👎 غلط</button></div>';
        }).join("") + '</div><div class="tally">👍 ' + yes + " — 👎 " + no + "</div>" +
        '<div class="actions"><button class="btn go big" data-act="vote-done"' + (yes + no ? "" : " disabled") + ">احسم النتيجة</button><button class=\"btn ghost\" data-ui=\"close\">رجوع</button></div>";
    } else if (m.type === "confirm") {
      var t = { skip: game.settings.mode === "duel" ? ["باص؟", "تنتقل لشيء جديد بدون نقاط، والوقت يكمّل."] : ["تخطي الدور؟", "ينتقل الدور للي بعده بدون نقاط."], redo: ["إعادة الدور؟", "نفس اللاعب يبدأ من جديد بشيء ثاني ووقت كامل. مفيدة لو أحد قالها بالغلط 😅"], end: ["إنهاء اللعبة؟", "تطلع النتيجة النهائية الحين."] }[m.what];
      inner = "<h2>" + t[0] + "</h2><p>" + t[1] + '</p><div class="actions"><button class="btn go big" data-act="confirm-yes">إيه</button><button class="btn big" data-ui="close">لا، رجوع</button></div>';
    } else if (m.type === "board") {
      inner = '<h2>الترتيب 🏆</h2><div class="board" style="padding:0">' + boardHTML(false) + '</div><div class="actions"><button class="btn big" data-ui="close">تمام</button></div>';
    } else if (m.type === "edit") {
      var it = m.it, ph = m.photo;
      inner = "<h2>" + (m.isNew ? "إضافة شيء" : "تعديل") + '</h2><form id="item-form" class="form-grid">' +
        '<div class="two-col"><label>الاسم<input id="if-name" required maxlength="30" value="' + esc(it.name) + '"></label><label>الرمز (إيموجي)<input id="if-emoji" maxlength="8" value="' + esc(it.emoji) + '"></label></div>' +
        '<label>المرادفات المقبولة (افصلها بفاصلة)<input id="if-syn" value="' + esc(it.syn.join("، ")) + '"></label>' +
        '<div class="two-col"><label>التصنيف<select id="if-cat">' + CATS.map(function (c) { return '<option value="' + c.id + '"' + (it.cat === c.id ? " selected" : "") + ">" + c.icon + " " + c.name + "</option>"; }).join("") + '</select></label>' +
        '<label>الصعوبة<select id="if-lvl">' + LEVELS.map(function (l) { return '<option value="' + l.id + '"' + (it.lvl === l.id ? " selected" : "") + ">" + l.name + "</option>"; }).join("") + "</select></label></div>" +
        '<label>صورة حقيقية (اختياري)<input type="file" id="if-photo" accept="image/*"></label>' +
        (ph ? '<div class="photo-prev"><img src="' + ph + '" alt="معاينة"><button type="button" class="btn small no" data-ui="photo-del">حذف الصورة</button></div>' : "") +
        (m.err ? '<p class="error">' + esc(m.err) + "</p>" : "") +
        '<div class="actions"><button class="btn go big" type="submit">حفظ</button><button class="btn big" type="button" data-ui="close">إلغاء</button></div></form>';
    } else if (m.type === "reset") {
      inner = '<h2>استعادة البنك الأصلي؟</h2><p>تنحذف الأشياء المضافة والتعديلات (الصور تبقى للأشياء الأصلية).</p><div class="actions"><button class="btn no big" data-ui="reset-yes">استعادة</button><button class="btn big" data-ui="close">رجوع</button></div>';
    }
    return '<div class="modal-back" data-ui="backdrop"><div class="modal panel" role="dialog" aria-modal="true">' + inner + "</div></div>";
  }

  function passSync() {
    try {
      var u = Store.get(K.used, []); if (!Array.isArray(u)) u = [];
      var played = bank.filter(function (it) { return u.indexOf(it.id) >= 0; }).length;
      window.MAJLIS_PASS && MAJLIS_PASS.sets("kh", bank.length, bank.length - played, { ids: bank.map(function (q) { return q.id; }), used: u, reset: function () { Store.set(K.used, []); } });
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
    var app = document.getElementById("app"), html;
    if (view === "game" && game) html = game.phase === "over" ? vOver() : vGame();
    else if (view === "setup") html = vSetup();
    else if (view === "howto") html = vHowto();
    else if (view === "bank") html = vBank();
    else html = vHome();
    app.innerHTML = html + vModal();
    if (view === "game" && game && game.phase === "over") confetti();
  }

  function toast(t) { var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }

  function confetti() {
    var c = document.getElementById("confetti");
    if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var ctx = c.getContext("2d"), W = c.width = innerWidth, H = c.height = innerHeight, cols = ["#ffb703", "#ff5d73", "#2ec4b6", "#4cc9f0", "#8bd450", "#fff8ec"], ps = [];
    for (var i = 0; i < 180; i++) ps.push({ x: Math.random() * W, y: -Math.random() * H, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -.1 + Math.random() * .2, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function f(now) {
      if (!document.getElementById("confetti")) return;
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.y += p.vy; p.x += p.vx; p.r += p.vr; if (p.y > H + 20 && now - t0 < 6000) { p.y = -20; p.x = Math.random() * W; } ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
      if (now - t0 < 9000) requestAnimationFrame(f);
    })(t0);
  }

  /* ---------- images ---------- */
  function resizeImage(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 520, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL("image/jpeg", .75));
      };
      img.onerror = function () { cb(null); };
      img.src = r.result;
    };
    r.onerror = function () { cb(null); };
    r.readAsDataURL(file);
  }

  /* ---------- UI events ---------- */
  function go(v) { view = v; setupErr = ""; pendingDel = null; modal = null; render(); }
  function startGame() {
    setupErr = validate();
    if (setupErr) { view = "setup"; setupTab = "players"; render(); return; }
    if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("kh")) return;
    saveSettings(); newGame(); view = "game"; ensureTimer(); commit();
  }
  function primary() {
    if (modal || view !== "game" || !game) return;
    var map = { handoff: "peek", memorize: "memdone", ready: "start", guess: game.cur.pendingEnd ? "accept-end" : game.cur.paused ? "pause" : "guess", result: "next" };
    if (map[game.phase]) act(map[game.phase]);
  }

  function ui(name, el, ev) {
    switch (name) {
      case "home": go("home"); break;
      case "home-clear": game = null; saveGame(); stopTimer(); go("home"); break;
      case "setup": go("setup"); break;
      case "howto": go("howto"); break;
      case "reset-used":
        if (Date.now() - resetArm < 4000) { Store.set(K.used, []); resetArm = 0; toast("تم التصفير — كل الأشياء صارت جديدة"); }
        else { resetArm = Date.now(); setTimeout(function () { if (view === "home") render(); }, 4100); }
        render(); break;
      case "bank": go("bank"); break;
      case "quick": view = "setup"; setupTab = "players"; setupErr = ""; render(); break;
      case "start": case "replay": startGame(); break;
      case "trial":
        setupErr = validate();
        if (setupErr) { view = "setup"; setupTab = "players"; render(); break; }
        if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("kh")) break;
        var saved = clone(settings);
        settings.rounds = 1; settings.level = 1; settings.cats = []; settings.turnTime = 60; settings.memTime = 6;
        settings.double = false; settings.surprise = false; settings.random = false;
        newGame(); settings = saved; game.trial = true; view = "game"; ensureTimer(); commit();
        break;
      case "resume": view = "game"; ensureTimer(); render(); break;
      case "rounds-": settings.rounds = Math.max(1, settings.rounds - 1); saveSettings(); render(); break;
      case "rounds+": settings.rounds = Math.min(10, settings.rounds + 1); saveSettings(); render(); break;
      case "fullscreen": try { if (!document.fullscreenElement) { var pr = document.documentElement.requestFullscreen(); if (pr && pr.catch) pr.catch(function () {}); } else document.exitFullscreen(); } catch (e) {} break;
      case "sound": settings.sound = !settings.sound; saveSettings(); render(); break;
      case "close": modal = null; render(); break;
      case "backdrop": if (ev.target === el && modal && modal.type !== "vote") { modal = null; render(); } break;
      case "new-item": modal = { type: "edit", isNew: true, it: { id: "", cat: bankF.cat || "surprise", name: "", emoji: "❓", syn: [], lvl: +bankF.lvl || 2 }, photo: null }; render(); break;
      case "photo-del": modal.photo = null; modal.photoDel = true; keepForm(); render(); break;
      case "reset-bank": modal = { type: "reset" }; render(); break;
      case "reset-yes": bank = defaultBank(); saveBank(); modal = null; toast("رجع البنك الأصلي"); render(); break;
    }
  }
  function keepForm() {
    var it = modal.it, g = function (id) { var e = document.getElementById(id); return e ? e.value : ""; };
    it.name = g("if-name"); it.emoji = g("if-emoji"); it.syn = g("if-syn").split(/[,،]/).map(function (x) { return x.trim(); }).filter(Boolean); it.cat = g("if-cat"); it.lvl = +g("if-lvl");
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act],[data-ui],[data-mode],[data-teams],[data-cat],[data-level],[data-time],[data-mem],[data-tab],[data-del-player],[data-pickname],[data-team-cycle],[data-vote],[data-edit],[data-del],[data-del-yes],[data-del-no]");
    if (!el) return;
    var d = el.dataset;
    if (e.detail > 1 && (d.act || (d.ui && d.ui !== "rounds-" && d.ui !== "rounds+"))) return;
    if (d.ui) return ui(d.ui, el, e);
    if (d.act) return act(d.act);
    if (d.mode) { settings.mode = d.mode; if (d.mode === "teams") settings.teamOf = settings.players.map(function (n, i) { return i % settings.teamCount; }); saveSettings(); setupErr = ""; render(); return; }
    if (d.teams) { settings.teamCount = +d.teams; settings.teamOf = settings.players.map(function (n, i) { return i % settings.teamCount; }); saveSettings(); render(); return; }
    if (d.cat) {
      if (d.cat === "all") settings.cats = [];
      else { var i = settings.cats.indexOf(d.cat); if (i >= 0) settings.cats.splice(i, 1); else settings.cats.push(d.cat); if (settings.cats.length === CATS.length) settings.cats = []; }
      saveSettings(); render(); return;
    }
    if (d.level != null) { settings.level = +d.level; saveSettings(); render(); return; }
    if (d.time) { settings.turnTime = +d.time; saveSettings(); render(); return; }
    if (d.mem) { settings.memTime = +d.mem; saveSettings(); render(); return; }
    if (d.tab) { setupTab = d.tab; render(); return; }
    if (d.pickname) {
      var pn = d.pickname, ix = -1; settings.players.forEach(function (n, q) { if (ix < 0 && n.trim() === pn) ix = q; });
      if (ix >= 0) { settings.players.splice(ix, 1); settings.teamOf.splice(ix, 1); }
      else if (settings.players.length >= 16) { setupErr = "الحد الأقصى 16 لاعب."; }
      else { settings.players.push(pn); settings.teamOf.push((settings.players.length - 1) % settings.teamCount); setupErr = ""; }
      saveSettings(); render(); return;
    }
    if (d.delPlayer != null) { var k = +d.delPlayer; settings.players.splice(k, 1); settings.teamOf.splice(k, 1); saveSettings(); render(); return; }
    if (d.teamCycle != null) { var j = +d.teamCycle; settings.teamOf[j] = ((settings.teamOf[j] || 0) + 1) % settings.teamCount; saveSettings(); setupErr = ""; render(); return; }
    if (d.vote) { var v = d.vote.split(":"); modal.votes[v[0]] = v[1] === "1"; render(); return; }
    if (d.edit) { var it = item(d.edit); modal = { type: "edit", isNew: false, it: clone(it), photo: photo(it.id) }; render(); return; }
    if (d.del) { pendingDel = d.del; render(); return; }
    if (d.delNo) { pendingDel = null; render(); return; }
    if (d.delYes) { bank = bank.filter(function (x) { return x.id !== d.delYes; }); Store.del(K.img + d.delYes); saveBank(); pendingDel = null; toast("انحذف"); render(); return; }
  });

  document.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === "add-player") {
      var inp = document.getElementById("new-player"), n = inp.value.trim();
      if (!n) return;
      if (settings.players.length >= 16) { setupErr = "الحد الأقصى 16 لاعب."; render(); return; }
      settings.players.push(n); settings.teamOf.push((settings.players.length - 1) % settings.teamCount); saveSettings(); setupErr = ""; render();
      var ni = document.getElementById("new-player"); if (ni) ni.focus();
    } else if (f.id === "guess-form") act("check");
    else if (f.id === "item-form") {
      keepForm();
      var it = modal.it;
      if (!it.name.trim()) { modal.err = "اكتب اسم الشيء."; render(); return; }
      it.name = it.name.trim(); it.emoji = it.emoji.trim() || "❓";
      if (!it.id) it.id = "u" + Date.now();
      var i = bank.findIndex(function (x) { return x.id === it.id; });
      if (i >= 0) bank[i] = it; else bank.push(it);
      saveBank();
      if (modal.photo) { if (!Store.setRaw(K.img + it.id, modal.photo)) toast("المساحة ما تكفي للصورة — جرّب صورة أصغر"); }
      else if (modal.photoDel) Store.del(K.img + it.id);
      modal = null; toast("انحفظ ✅"); render();
    }
  });

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.dataset.opt) { settings[el.dataset.opt] = el.checked; saveSettings(); render(); }
    else if (el.dataset.bf && el.tagName === "SELECT") { bankF[el.dataset.bf] = el.value; render(); }
    else if (el.id === "if-photo" && el.files && el.files[0]) {
      keepForm();
      resizeImage(el.files[0], function (url) { if (!modal) return; if (url) { modal.photo = url; modal.photoDel = false; } else modal.err = "ما قدرت أقرأ الصورة."; render(); });
    }
  });
  document.addEventListener("input", function (e) {
    if (e.target.dataset.bf === "q") { bankF.q = e.target.value; render(); var s = document.getElementById("bf-q"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.repeat && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return; }
    if (e.key === "Escape" && modal && modal.type !== "vote") { modal = null; render(); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || "") || modal) return;
    if (e.key === " " || e.key === "Enter") {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "A") return;
      if (view === "game") { e.preventDefault(); primary(); }
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && game && game.phase === "guess" && !game.cur.paused) { game.cur.paused = true; commit(); }
  });

  if (game && game.phase !== "over") ensureTimer();
  render();
})();
