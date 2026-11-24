/* «رتّب وفوز» — محرك اللعبة: لوحة أرقام مخفية، ترتيب بالسحب أو الأزرار أو لوحة المفاتيح، جولات خاصة، مضيف أو تلقائي. */
(function () {
  "use strict";

  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var K = { game: "rt_game_v1", settings: "rt_settings_v1", used: "rt_used_v1" };
  var CATS = window.RT_CATS, LEVELS = window.RT_LEVELS, BANK = window.RT_QUESTIONS;
  var COLORS = ["#3ee6b5", "#ff8a3d", "#6aa8ff", "#ff5f8f", "#ffd166", "#b58cff"];
  var FUNNY = ["فريق الكبسة المحترقة", "فريق المكيف على 16", "فريق الشاهي الثقيل", "فريق نومة العصر", "فريق الواي فاي الضعيف", "فريق المطب الصناعي",
    "فريق التميس الحار", "فريق الريموت الضايع", "فريق الدلة الفاضية", "فريق قروب العائلة", "فريق اللقيمات", "فريق نسيت الباسوورد",
    "فريق الشاحن المستلف", "فريق الكشتة", "فريق السمبوسة", "فريق أبو الحروف", "فريق الإشارة الصفراء", "فريق آخر العنقود"];
  var SPECIALS = {
    speed: { name: "جولة السرعة ⚡", desc: "عندكم 25 ثانية بس!" },
    challenge: { name: "جولة التحدي 🧩", desc: "بطاقات أكثر وترتيب أصعب" },
    all: { name: "جولة الكل يشارك 👥", desc: "كل الفرق تحل نفس السؤال، فريق بعد فريق" },
    unknown: { name: "جولة المجهول ❓", desc: "البطاقات تظهر… وطريقة الترتيب تنكشف بعد شوي" },
    decider: { name: "جولة الحسم 🔥", desc: "سؤال صعب والنقاط مضاعفة" }
  };
  var SPEED_TIME = 25, UNKNOWN_DELAY = 8, PICK_TIME = 12, pickLeft = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function q(id) { for (var i = 0; i < BANK.length; i++) if (BANK[i].id === id) return BANK[i]; return null; }
  function cat(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return { name: id, icon: "" }; }
  function lvlName(l) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === +l) return LEVELS[i].name; return ""; }
  function ptsWord(n) { n = Math.abs(n); return n === 1 ? "نقطة" : n === 2 ? "نقطتين" : (n >= 3 && n <= 10 ? "نقاط" : "نقطة"); }

  /* ordering math: number of swapped pairs (one adjacent swap = one mistake) */
  function inversions(order) { var c = 0; for (var i = 0; i < order.length; i++) for (var j = i + 1; j < order.length; j++) if (order[i] > order[j]) c++; return c; }
  /* 10 perfect, 6 one mistake, 3 a few mistakes, 0 when half the pairs or more are wrong (no better than a random guess) */
  function maxPairs(n) { return n * (n - 1) / 2; }
  function basePoints(err, n) { if (err === 0) return 10; if (err === 1) return 6; return (n && err >= maxPairs(n) / 2) ? 0 : 3; }
  function errLabel(err, n) { return err === 0 ? "ترتيب كامل" : err === 1 ? "خطأ واحد" : basePoints(err, n) === 0 ? "لخبطة كاملة" : "خطآن أو أكثر"; }
  window.RT_SCORE = { inversions: inversions, basePoints: basePoints };

  /* ---------- settings ---------- */
  var defaults = { format: "2", names: ["فريق الصقور", "فريق النخيل", "فريق النجوم", "فريق القمر", "فريق الفرسان", "فريق الواحة"], level: 1, perTeam: 3, timer: 45, host: "auto", specials: true, speedBonus: true, music: false, sound: true };
  var settings = Object.assign(clone(defaults), Store.get(K.settings, {}) || {});
  (function () { var P = window.MAJLIS_PREFS && MAJLIS_PREFS(); if (!P) return; var pick = function (k, m) { return m[P[k]]; }; if (P.teams) { settings.format = String(Math.min(6, P.teams.length)); settings.names = P.teams.concat(defaults.names.slice(P.teams.length)); } settings.level = pick("level", { easy: 1, mix: 2, hard: 3 }); settings.perTeam = pick("length", { short: 2, normal: 3, long: 4 }); settings.timer = pick("time", { fast: 30, normal: 45, slow: 60 }); })(); // إعدادات المجلس
  (function () { var FT = window.MAJLIS_FAM_TEAMS && MAJLIS_FAM_TEAMS(); if (FT) { var t = FT.slice(0, 6); settings.format = String(t.length); settings.names = t.concat(defaults.names.slice(t.length)); } })(); // فرق جولة العائلة
  if (["pvp", "2", "3", "4", "5", "6"].indexOf(String(settings.format)) < 0) settings.format = "2"; settings.format = String(settings.format);
  if ([1, 2, 3].indexOf(+settings.level) < 0) settings.level = 1; settings.level = +settings.level;
  settings.perTeam = Math.min(8, Math.max(1, Math.round(+settings.perTeam) || 3));
  if ([0, 30, 45, 60, 90, 120].indexOf(+settings.timer) < 0) settings.timer = 45; settings.timer = +settings.timer;
  if (settings.host !== "host") settings.host = "auto";
  if (!Array.isArray(settings.names)) settings.names = defaults.names.slice();
  for (var ni = 0; ni < 6; ni++) if (typeof settings.names[ni] !== "string") settings.names[ni] = defaults.names[ni];
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

  function teamCount() { return settings.format === "pvp" ? 2 : +settings.format; }

  var view = "home", setupTab = "teams", setupErr = "", modal = null;
  var game = validGame(Store.get(K.game, null));
  if (game && game.phase === "play" && game.cur) game.cur.paused = true;
  /* saved data from an older version, another tab or a manual edit must never break the page */
  function validGame(g) {
    try {
      if (!g || !Array.isArray(g.teams) || g.teams.length < 2 || !Array.isArray(g.tiles) || typeof g.turn !== "number") return null;
      if (["pick", "intro", "cover", "play", "reveal", "scores", "over"].indexOf(g.phase) < 0) return null;
      if (g.phase !== "pick" && g.phase !== "over") {
        var c = g.cur; if (!c || !q(c.qid) || !Array.isArray(c.order) || c.order.length !== q(c.qid).items.length || !Array.isArray(c.queue) || !Array.isArray(c.results)) return null;
      }
      g.teams.forEach(function (t) { t.score = +t.score || 0; t.perfect = +t.perfect || 0; t.streak = +t.streak || 0; t.name = String(t.name || "فريق"); });
      if (!Array.isArray(g.used)) g.used = []; if (!Array.isArray(g.log)) g.log = [];
      return g;
    } catch (e) { return null; }
  }
  function saveGame() { if (game) Store.set(K.game, game); else Store.del(K.game); }
  saveGame();

  /* ---------- audio ---------- */
  var actx = null;
  function ac() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {} return actx; }
  function tone(f, d, type, v, delay, f2) {
    if (!settings.sound) return; var a = ac(); if (!a) return;
    try {
      var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v || .15, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .05);
    } catch (e) {}
  }
  function noise(d, v, delay, freq) {
    if (!settings.sound) return; var a = ac(); if (!a) return;
    try {
      var len = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, len, a.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + (delay || 0);
      s.buffer = buf; f.type = "bandpass"; f.frequency.setValueAtTime(freq || 800, t); f.frequency.exponentialRampToValueAtTime((freq || 800) * 3, t + d);
      g.gain.value = v || .2; s.connect(f); f.connect(g); g.connect(a.destination); s.start(t);
    } catch (e) {}
  }
  var SFX = {
    whoosh: function () { noise(.45, .25, 0, 400); tone(300, .4, "sine", .06, 0, 900); },
    tick: function () { tone(1400, .04, "square", .04); },
    pick: function () { tone(660, .08, "triangle", .1); },
    drop: function () { tone(520, .08, "triangle", .1); tone(780, .1, "triangle", .08, .05); },
    beep: function (hi) { tone(hi ? 1200 : 800, .14, "square", .07); },
    roll: function () { for (var i = 0; i < 22; i++) noise(.05, .12, i * (0.12 - i * .004), 2000); },
    win: function () { [523, 659, 784, 1046, 784, 1046, 1318].forEach(function (f, i) { tone(f, .3, "triangle", .16, i * .1); }); },
    mid: function () { [523, 659, 784].forEach(function (f, i) { tone(f, .25, "triangle", .13, i * .1); }); },
    wah: function () { [392, 370, 349, 311].forEach(function (f, i) { tone(f, i === 3 ? .8 : .32, "sawtooth", .07, i * .34, f * .97); }); },
    fanfare: function () { [392, 523, 659, 784, 659, 784, 1046, 1318, 1568].forEach(function (f, i) { tone(f, .32, "triangle", .15, i * .13); }); }
  };
  /* light background loop */
  var musicTimer = null, musicStep = 0, musicNext = 0;
  var PROG = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
  function musicTick() {
    var a = ac(); if (!a || !settings.music) return;
    while (musicNext < a.currentTime + .25) {
      var bar = Math.floor(musicStep / 8) % 4, beat = musicStep % 8, ch = PROG[bar];
      var t = musicNext - a.currentTime;
      try {
        var o = a.createOscillator(), g = a.createGain(), at = a.currentTime + Math.max(0, t);
        o.type = "triangle"; o.frequency.value = ch[beat % 3] * (beat >= 4 ? 2 : 1);
        g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.028, at + .01); g.gain.exponentialRampToValueAtTime(.0001, at + .28);
        o.connect(g); g.connect(a.destination); o.start(at); o.stop(at + .3);
        if (beat === 0 || beat === 4) { var b = a.createOscillator(), bg = a.createGain(); b.type = "sine"; b.frequency.value = ch[0] / 2; bg.gain.setValueAtTime(.0001, at); bg.gain.exponentialRampToValueAtTime(.06, at + .02); bg.gain.exponentialRampToValueAtTime(.0001, at + .5); b.connect(bg); bg.connect(a.destination); b.start(at); b.stop(at + .55); }
      } catch (e) {}
      musicNext += .3125; musicStep++;
    }
  }
  function setMusic(on) {
    settings.music = on; saveSettings();
    if (on) { var a = ac(); if (!a) return; musicNext = a.currentTime + .05; if (!musicTimer) musicTimer = setInterval(musicTick, 100); }
    else if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  /* ---------- game setup ---------- */
  function newGame(keepTeams) {
    var n = teamCount();
    var teams = keepTeams ? keepTeams.map(function (t, i) { return { name: t.name, color: COLORS[i], score: 0, perfect: 0 }; })
      : settings.names.slice(0, n).map(function (nm, i) { nm = (nm || "").trim(); return { name: nm || (settings.format === "pvp" ? "اللاعب " + (i + 1) : defaults.names[i]), color: COLORS[i], score: 0, perfect: 0 }; });
    var total = settings.perTeam * teams.length;
    var tilesN = Math.min(30, total + Math.max(3, Math.ceil(total * .25)));
    var tiles = []; for (var i = 1; i <= tilesN; i++) tiles.push({ n: i, opened: false, team: -1 });
    game = { settings: clone(settings), teams: teams, turn: 0, total: total, tiles: tiles, used: [], phase: "pick", cur: null, specialsSeen: 0, lastSpecial: null, tiebreaks: 0, log: [] };
    focusTile = 0;
  }
  function teamOfTurn(t) { return t % game.teams.length; }

  function chooseSpecial() {
    var s = game.settings;
    if (window.RT_FORCE_SPECIAL !== undefined) return window.RT_FORCE_SPECIAL; // test hook
    if (!s.specials || game.turn === 0) return null;
    var remaining = game.total - game.turn;
    var force = game.specialsSeen === 0 && remaining <= 2;
    if (!force && Math.random() > .32) return null;
    var opts = ["speed", "challenge", "all", "unknown", "decider"].filter(function (k) { return k !== game.lastSpecial; });
    return pick(opts);
  }

  var resetArm = 0;
  function usedCount() { var u = Store.get(K.used, []); if (!Array.isArray(u)) return 0; return BANK.filter(function (x) { return u.indexOf(x.id) >= 0; }).length; }
  function pickQuestion(special, levelOverride) {
    var s = game.settings, hist = Store.get(K.used, []); if (!Array.isArray(hist)) hist = [];
    var level = levelOverride || (special === "decider" ? Math.min(3, s.level + 1) : s.level);
    var src = window.MAJLIS_PASS ? MAJLIS_PASS.scoped("rt", BANK, hist) : BANK;
    var free = function (x) { return game.used.indexOf(x.id) < 0; };
    var size = function (x) { return special === "challenge" ? x.items.length >= 6 : true; };
    var tries = [
      function (x) { return free(x) && size(x) && x.lvl === level; },
      function (x) { return free(x) && size(x) && Math.abs(x.lvl - level) <= 1; },
      function (x) { return free(x) && size(x); },
      function (x) { return free(x); },
      function () { return true; }
    ];
    // never repeat a question that was ever played, until the whole bank has been used; then start a new cycle
    var choose = function (onlyFresh) {
      for (var i = 0; i < tries.length; i++) {
        var pool = src.filter(tries[i]);
        if (onlyFresh) pool = pool.filter(function (x) { return hist.indexOf(x.id) < 0; });
        if (pool.length) return pick(pool);
      }
      return null;
    };
    var c = choose(true);
    if (!c) { hist = []; c = choose(false); }
    if (!c) return null;
    game.used.push(c.id); hist.push(c.id); Store.set(K.used, hist);
    return c.id;
  }

  function scrambled(n) {
    var o = []; for (var i = 0; i < n; i++) o.push(i);
    do { shuffle(o); } while (n > 2 && inversions(o) < 2);
    return o;
  }

  function openTile(idx) {
    if (game.phase !== "pick") return;
    var tile = game.tiles[idx]; if (!tile || tile.opened) return;
    if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("rt")) return;
    var team = teamOfTurn(game.turn), special = chooseSpecial();
    tile.opened = true; tile.team = team;
    if (special) { game.specialsSeen++; game.lastSpecial = special; }
    var qid = pickQuestion(special);
    startRound({ team: team, tile: tile.n, special: special, qid: qid, queue: special === "all" ? game.teams.map(function (t, i) { return (team + i) % game.teams.length; }) : [team] });
  }

  function startRound(o) {
    var qq = q(o.qid), start = scrambled(qq.items.length);
    var limit = o.special === "speed" ? SPEED_TIME : (+game.settings.timer || 0);
    game.cur = { team: o.team, tile: o.tile, special: o.special, qid: o.qid, queue: o.queue, qi: 0, start: start, order: start.slice(),
      limit: limit, timeLeft: limit, elapsed: 0, ruleLeft: o.special === "unknown" ? UNKNOWN_DELAY : 0, paused: false,
      results: [], revealed: false, tiebreak: !!o.tiebreak, autoLeft: 0 };
    game.phase = "intro"; introLeft = 2;
    SFX.whoosh();
    commit();
    runIntro();
  }

  var introTimer = null, introLeft = 2;
  function runIntro() {
    clearInterval(introTimer);
    introTimer = setInterval(function () {
      if (!game || game.phase !== "intro") { clearInterval(introTimer); return; }
      introLeft--;
      if (introLeft <= 0) { clearInterval(introTimer); beginTeamTurn(); return; }
      SFX.beep(false);
      var el = document.getElementById("count"); if (el) { el.textContent = introLeft; el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; }
    }, 1000);
    SFX.beep(false);
  }

  function beginTeamTurn() {
    var c = game.cur;
    if (c.queue.length > 1) { game.phase = "cover"; }
    else { game.phase = "play"; dealAnim = true; SFX.whoosh(); }
    commit();
  }

  function startPlay() { if (game.phase !== "cover") return; var c = game.cur; c.order = c.start.slice(); c.timeLeft = c.limit; c.elapsed = 0; c.ruleLeft = c.special === "unknown" ? UNKNOWN_DELAY : 0; c.paused = false; game.phase = "play"; dealAnim = true; focusCard = 0; grabbed = false; SFX.whoosh(); commit(); }

  function submit(auto) {
    var c = game.cur; if (game.phase !== "play") return;
    var team = c.queue[c.qi], err = inversions(c.order), base = basePoints(err, c.order.length), bonus = 0;
    if (game.settings.speedBonus && err === 0 && !c.tiebreak) {
      var ref = c.limit || 60;
      bonus = c.elapsed <= ref / 3 ? 3 : c.elapsed <= ref * 2 / 3 ? 1 : 0;
    }
    var mult = c.special === "decider" ? 2 : 1;
    c.results.push({ team: team, order: c.order.slice(), errors: err, base: base, bonus: bonus, mult: mult, points: (base + bonus) * mult, timedOut: !!auto });
    grabbed = false;
    if (c.qi + 1 < c.queue.length) { c.qi++; game.phase = "cover"; SFX.drop(); commit(); return; }
    game.phase = "reveal"; c.revealed = false;
    commit();
    if (game.settings.host !== "host") doRevealSoon();
  }

  var revealTimer = null;
  function doRevealSoon() { SFX.roll(); clearTimeout(revealTimer); revealTimer = setTimeout(doReveal, 1800); }
  function doReveal() {
    var c = game.cur; if (!c || c.revealed || game.phase !== "reveal") return;
    c.revealed = true;
    c.results.forEach(function (r) {
      var t = game.teams[r.team];
      if (r.errors === 0) { t.streak = (t.streak || 0) + 1; t.perfect++; } else t.streak = 0;
      if (r.errors === 0 && t.streak >= 2 && !c.tiebreak) { r.streakBonus = Math.min(3, t.streak - 1); r.points += r.streakBonus; toast("🔥 " + esc(t.name) + " — " + t.streak + " ترتيب كامل ورا بعض! +" + r.streakBonus); }
      t.score += r.points;
      game.log.push({ team: r.team, qid: c.qid, points: r.points, errors: r.errors, turn: game.turn, tiebreak: c.tiebreak });
    });
    var best = Math.min.apply(null, c.results.map(function (r) { return r.errors; }));
    if (best === 0) { SFX.win(); confettiBurst = true; } else if (best === 1) SFX.mid(); else SFX.wah();
    c.autoLeft = game.settings.host === "host" ? 0 : 8;
    revealAnim = true;
    commit();
  }

  function toScores() { if (game.phase !== "reveal" && game.phase !== "play") return; if (game.phase === "reveal" && !game.cur.revealed) return; game.phase = "scores"; if (game.cur) game.cur.autoLeft = game.settings.host === "host" ? 0 : 6; SFX.pick(); commit(); }

  function nextTurn() {
    if (game.phase !== "scores") return;
    if (game.cur && game.cur.tiebreak) { afterTiebreak(); return; }
    game.turn++;
    if (game.turn < game.total) {
      /* long matches: when every number has been opened, deal a fresh board */
      if (game.tiles.every(function (t) { return t.opened; })) {
        var start = game.tiles[game.tiles.length - 1].n, left = game.total - game.turn, nn = Math.min(30, left + Math.max(3, Math.ceil(left * .25)));
        game.tiles = []; for (var i = 1; i <= nn; i++) game.tiles.push({ n: start + i, opened: false, team: -1 });
        toast("لوحة أرقام جديدة! 🎲");
      }
      game.phase = "pick"; game.cur = null; focusTile = firstFreeTile(); commit(); return;
    }
    checkEnd();
  }

  function leaders() { var top = Math.max.apply(null, game.teams.map(function (t) { return t.score; })); return game.teams.map(function (t, i) { return t.score === top ? i : -1; }).filter(function (i) { return i >= 0; }); }
  function checkEnd() {
    var L = leaders();
    if (L.length > 1 && game.tiebreaks < 2) {
      game.tiebreaks++;
      var qid = pickQuestion("decider", 3);
      startRound({ team: L[0], tile: 0, special: "all", qid: qid, queue: L, tiebreak: true });
      return;
    }
    finish();
  }
  function afterTiebreak() { checkEnd(); }
  function finish() { stopAll(); game.phase = "over"; game.cur = null; SFX.fanfare(); commit(); }
  function firstFreeTile() { for (var i = 0; i < game.tiles.length; i++) if (!game.tiles[i].opened) return i; return 0; }

  /* ---------- ticking ---------- */
  var ticker = null;
  function ensureTicker() { if (!ticker) ticker = setInterval(tick, 1000); }
  function stopAll() { clearInterval(introTimer); clearTimeout(revealTimer); }
  function tick() {
    if (!game || view !== "game") return;
    var c = game.cur;
    if (game.phase !== "pick") pickLeft = null;
    if (game.phase === "pick" && !modal && game.settings.host !== "host" && !game.trial) {
      pickLeft = pickLeft == null ? PICK_TIME : pickLeft - 1;
      var pl = document.getElementById("pick-left"); if (pl) pl.textContent = Math.max(0, pickLeft);
      if (pickLeft <= 0) { pickLeft = null; var free = []; game.tiles.forEach(function (t, i) { if (!t.opened) free.push(i); }); if (free.length) openTile(free[Math.floor(Math.random() * free.length)]); return; }
    }
    if (game.phase === "play" && c && !c.paused && !modal) {
      c.elapsed++;
      if (c.ruleLeft > 0) {
        c.ruleLeft--;
        if (c.ruleLeft === 0) { SFX.whoosh(); render(); }
        else { var rl = document.getElementById("rule-left"); if (rl) rl.textContent = c.ruleLeft; }
      }
      if (c.limit) {
        c.timeLeft--;
        if (c.timeLeft <= 5 && c.timeLeft > 0) SFX.beep(c.timeLeft <= 3);
        if (c.timeLeft <= 0) { c.timeLeft = 0; SFX.beep(true); submit(true); return; }
        var el = document.getElementById("timer"); if (el) { el.textContent = c.timeLeft; el.classList.toggle("warn", c.timeLeft <= 10); }
      }
      saveGame();
    } else if (game.phase === "reveal" && c && c.revealed && c.autoLeft > 0 && !modal) {
      c.autoLeft--;
      var al = document.getElementById("auto-left"); if (al) al.textContent = c.autoLeft;
      if (c.autoLeft === 0) toScores();
    } else if (game.phase === "scores" && c && c.autoLeft > 0 && !modal) {
      c.autoLeft--;
      var sl = document.getElementById("auto-left"); if (sl) sl.textContent = c.autoLeft;
      if (c.autoLeft === 0) nextTurn();
    }
  }

  /* ---------- rendering ---------- */
  var focusTile = 0, focusCard = 0, grabbed = false, dealAnim = false, revealAnim = false, confettiBurst = false;
  function commit() { saveGame(); render(); }

  function strip(active) {
    var top = Math.max.apply(null, game.teams.map(function (t) { return t.score; }));
    return '<div class="strip" style="--n:' + game.teams.length + '">' + game.teams.map(function (t, i) {
      return '<div class="chipteam' + (i === active ? " on" : "") + (top > 0 && t.score === top ? " lead" : "") + '" style="--c:' + t.color + '"><span class="n">' + esc(t.name) + '</span><span class="s">' + t.score + "</span></div>";
    }).join("") + "</div>";
  }
  function topbar(info) {
    if (game && game.trial) info = '<span class="pill sp">تجربة</span>' + info;
    return '<div class="topbar"><div class="info">' + info + '</div><div class="top-actions">' +
      '<button class="btn ghost" data-ui="scores" title="تعديل النقاط">±<span class="lbl"> النقاط</span></button>' +
      '<button class="btn ghost" data-ui="music" title="الموسيقى (M)">' + (settings.music ? "🎵" : "🔕") + '<span class="lbl"> موسيقى</span></button>' +
      '<button class="btn ghost" data-ui="sound" title="المؤثرات" aria-label="المؤثرات الصوتية" aria-pressed="' + (settings.sound ? "true" : "false") + '">' + (settings.sound ? "🔊" : "🔇") + "</button>" +
      '<button class="btn ghost" data-ui="fullscreen" title="ملء الشاشة (F)" aria-label="ملء الشاشة">⛶</button>' +
      '<button class="btn ghost" data-ui="end" title="إنهاء">✕<span class="lbl"> إنهاء</span></button></div></div>';
  }
  function turnLabel() { var c = game.cur; if (c && c.tiebreak) return "جولة فاصلة"; return "الجولة " + (Math.floor(game.turn / game.teams.length) + 1) + " من " + game.settings.perTeam; }

  function vPick() {
    var team = teamOfTurn(game.turn), t = game.teams[team], n = game.tiles.length;
    var cols = Math.min(n, Math.max(3, Math.ceil(Math.sqrt(n * 1.9))));
    var tiles = game.tiles.map(function (x, i) {
      return '<button class="tile" data-tile="' + i + '" id="tile-' + i + '"' + (x.opened ? " disabled" : "") + ' aria-label="رقم ' + x.n + '">' + (x.opened ? '<span class="used">' + esc(game.teams[x.team].name) + "</span>" : x.n) + "</button>";
    }).join("");
    return '<section class="screen">' + topbar("<span>" + turnLabel() + "</span>") + strip(team) +
      '<div class="spot" style="--c:' + t.color + '"><span class="muted">الدور على</span><span class="who">' + esc(t.name) + '</span><span class="muted">اختاروا رقماً ليفتح سؤالكم — بعض الأرقام فيها مفاجآت 🎁</span>' + (game.settings.host !== "host" && !game.trial ? '<span class="muted pickcd">⏱ يُفتح رقم عشوائي بعد <b id="pick-left">' + (pickLeft == null ? PICK_TIME : Math.max(0, pickLeft)) + "</b> ث</span>" : "") + '</div>' +
      '<div class="board" style="--cols:' + cols + '">' + tiles + "</div></section>";
  }

  function vIntro() {
    var c = game.cur, t = game.teams[c.team], sp = c.special && SPECIALS[c.special];
    var who = c.tiebreak ? "تعادل! " + c.queue.map(function (i) { return esc(game.teams[i].name); }).join(" و ") : esc(t.name);
    return '<section class="screen">' + topbar("<span>" + turnLabel() + "</span>") + strip(c.queue.length > 1 ? -1 : c.team) +
      '<div class="cover"><div class="round-no">' + (c.tiebreak ? "⚔️ جولة فاصلة — سؤال خبراء" : turnLabel() + (c.tile ? " · الرقم " + c.tile : "")) + "</div>" +
      '<div class="spot" style="--c:' + (c.queue.length > 1 ? "var(--gold)" : t.color) + '"><span class="who">' + who + "</span></div>" +
      (sp && !c.tiebreak ? '<div class="special"><b>' + sp.name + "</b><span>" + sp.desc + "</span></div>" : "") +
      '<div class="count" id="count">' + introLeft + "</div></div></section>";
  }

  function vCover() {
    var c = game.cur, t = game.teams[c.queue[c.qi]];
    return '<section class="screen">' + topbar("<span>" + turnLabel() + '</span><span class="pill sp">' + (c.tiebreak ? "جولة فاصلة" : SPECIALS.all.name) + "</span>") + strip(c.queue[c.qi]) +
      '<div class="cover"><div class="round-no">الفريق ' + (c.qi + 1) + " من " + c.queue.length + '</div><div class="spot" style="--c:' + t.color + '"><span class="who">' + esc(t.name) + "</span></div>" +
      '<p class="subtitle" style="font-size:1.2em">جاء دوركم! بقية الفرق: لا تشوفون الشاشة ولا تتكلمون 🤐</p>' +
      '<button class="btn go huge" data-ui="start-play">جاهزين 🚀</button></div></section>';
  }

  function vPlay() {
    var c = game.cur, qq = q(c.qid), team = game.teams[c.queue[c.qi]], n = qq.items.length;
    var ruleHidden = c.ruleLeft > 0;
    var info = "<span>" + turnLabel() + '</span><span class="pill">' + cat(qq.cat).icon + " " + esc(cat(qq.cat).name) + '</span><span class="pill">' + lvlName(qq.lvl) + "</span>" +
      (c.special ? '<span class="pill sp">' + (c.tiebreak ? "جولة فاصلة" : SPECIALS[c.special].name) + "</span>" : "");
    var cards = c.order.map(function (idx, pos) {
      return '<li class="card' + (pos === focusCard ? " focus" : "") + (pos === focusCard && grabbed ? " grab" : "") + '" data-pos="' + pos + '" tabindex="-1">' +
        '<span class="rk">' + (pos + 1) + '</span><span class="tx">' + esc(qq.items[idx][0]) + "</span>" +
        '<span class="mv"><button data-move="' + pos + ':-1" aria-label="تحريك للأعلى"' + (pos === 0 ? " disabled" : "") + ">▲</button>" +
        '<button data-move="' + pos + ':1" aria-label="تحريك للأسفل"' + (pos === n - 1 ? " disabled" : "") + ">▼</button></span></li>";
    }).join("");
    var timer = c.limit ? '<div class="timer' + (c.timeLeft <= 10 ? " warn" : "") + '" id="timer" aria-label="الوقت المتبقي">' + c.timeLeft + "</div>" : "";
    var html = '<section class="screen">' + topbar(info) + strip(c.queue[c.qi]) +
      '<div class="qhead"><div class="t"><h2><span style="color:' + team.color + '">' + esc(team.name) + "</span> · " + esc(qq.title) + "</h2>" +
      '<div class="rule' + (ruleHidden ? " hidden" : "") + '">' + (ruleHidden ? '❓ طريقة الترتيب تنكشف بعد <span id="rule-left">' + c.ruleLeft + '</span> ثوانٍ… خمّنوا!' : "رتّبوها " + esc(qq.rule)) + "</div></div>" + timer + "</div>" +
      '<div class="arena"><div class="end">⬆ ' + (ruleHidden ? "؟" : esc(qq.top)) + '</div><ol class="cards' + (dealAnim ? " enter" : "") + '" id="cards" style="--n:' + n + '">' + cards + '</ol><div class="end">⬇ ' + (ruleHidden ? "؟" : esc(qq.bottom)) + "</div></div>" +
      '<div class="actionbar"><button class="btn go huge" data-ui="submit" id="submit-btn">اعتماد الترتيب ✅</button>' +
      (c.paused ? '<button class="btn hot big" data-ui="pause">▶ كمّلوا</button>' : (c.limit ? '<button class="btn big" data-ui="pause">⏸</button>' : "")) +
      (game.settings.host === "host" ? '<button class="btn big" data-ui="skip">تخطي السؤال</button>' : "") +
      '<span class="kbd-hint">اسحب البطاقة أو استخدم ▲▼ — بالكيبورد: الأسهم للتنقل، Enter لمسك البطاقة وتحريكها</span></div></section>';
    dealAnim = false;
    return html;
  }

  function vReveal() {
    var c = game.cur, qq = q(c.qid), n = qq.items.length;
    if (!c.revealed) {
      var waitHost = game.settings.host === "host";
      return '<section class="screen">' + topbar("<span>" + turnLabel() + "</span>") + strip(-1) +
        '<div class="cover"><div class="round-no">' + esc(qq.title) + '</div><div class="spot"><span class="who">' + (waitHost ? "الإجابات معتمدة ✅" : "لحظة الحقيقة… 🥁") + "</span></div>" +
        (waitHost ? '<button class="btn hot huge" data-ui="reveal">اكشف الإجابة 🎬</button>' : '<div class="count" id="count">🥁</div>') + "</div></section>";
    }
    var single = c.results.length === 1, r0 = c.results[0];
    var correct = qq.items.map(function (it, i) {
      return '<li class="rv ok" style="animation-delay:' + (.15 + i * .18) + 's"><span class="rk">' + (i + 1) + '</span><span class="tx">' + esc(it[0]) + "</span>" + (it[1] ? '<span class="dt">' + esc(it[1]) + "</span>" : '<span></span>') + "</li>";
    }).join("");
    var left;
    if (single) {
      left = '<div class="col"><h3>ترتيب ' + esc(game.teams[r0.team].name) + '</h3><ol style="--n:' + n + '">' + r0.order.map(function (idx, pos) {
        var ok = idx === pos;
        return '<li class="rv ' + (ok ? "ok" : "no") + '" style="animation-delay:' + (pos * .1) + 's"><span class="rk">' + (pos + 1) + '</span><span class="tx">' + esc(qq.items[idx][0]) + '</span><span class="mk">' + (ok ? "✅" : "❌") + "</span></li>";
      }).join("") + "</ol></div>";
    } else {
      left = '<div class="col"><h3>نتائج الفرق</h3><ol style="--n:' + c.results.length + '">' + c.results.map(function (r, i) {
        var t = game.teams[r.team];
        return '<li class="rv ' + (r.errors === 0 ? "ok" : "no") + '" style="animation-delay:' + (i * .15) + 's;border-inline-start:8px solid ' + t.color + '"><span class="rk">' + (r.errors === 0 ? "🏆" : r.errors === 1 ? "👌" : "😅") + '</span><span class="tx">' + esc(t.name) + "<small>" + errLabel(r.errors, n) + (r.timedOut ? " · خلص الوقت" : "") + '</small></span><span class="dt">+' + r.points + "</span></li>";
      }).join("") + "</ol></div>";
    }
    var best = single ? r0 : null, verdict = "";
    if (single) {
      verdict = r0.errors === 0 ? '<div class="big good">ترتيب كامل! 🎉</div>' : r0.errors === 1 ? '<div class="big mid">خطأ واحد بس! 👌</div>' : r0.base === 0 ? '<div class="big bad">' + pick(["ولا وحدة بمكانها تقريباً 🙈", "عكستوها؟ 😂", "الترتيب زعلان منكم 😅"]) + "</div>" : '<div class="big bad">' + pick(["قريبة… من بعيد 😅", "اللخبطة واضحة 🙃", "الترتيب له رأي ثاني 😂"]) + "</div>";
      verdict += '<div class="pts"><span>' + (errLabel(r0.errors, n) + " " + r0.base) + "</span>" + (r0.bonus ? "<span>⚡ سرعة +" + r0.bonus + "</span>" : "") + (r0.mult > 1 ? "<span>🔥 ×2</span>" : "") + (r0.timedOut ? "<span>⏰ خلص الوقت</span>" : "") + '<span class="tot">+' + r0.points + " " + ptsWord(r0.points) + "</span></div>";
    } else verdict = '<div class="big good">' + (c.tiebreak ? "نتيجة الجولة الفاصلة" : "النتائج 👥") + "</div>";
    var nextBtn = game.settings.host === "host" ? '<button class="btn go huge" data-ui="to-scores">لوحة النتائج 📊</button>' :
      '<button class="btn go huge" data-ui="to-scores">لوحة النتائج 📊 <span class="muted" style="font-size:.5em">(<span id="auto-left">' + c.autoLeft + "</span>)</span></button>";
    var html = '<section class="screen">' + topbar("<span>" + turnLabel() + "</span><span class=\"pill\">" + esc(qq.title) + "</span>") + strip(-1) +
      '<div class="verdict">' + verdict + "</div>" +
      '<div class="compare">' + left + '<div class="col"><h3>الترتيب الصحيح: ' + esc(qq.top) + " ← " + esc(qq.bottom) + '</h3><ol style="--n:' + n + '">' + correct + "</ol></div></div>" +
      '<div class="explain"><b>💡 </b>' + esc(qq.ex) + "</div>" +
      '<div class="actionbar">' + nextBtn + "</div></section>";
    revealAnim = false;
    return html;
  }

  function barsHTML() {
    var sorted = game.teams.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) { return b.t.score - a.t.score; });
    var max = Math.max(1, sorted[0].t.score), last = null, rank = 0;
    return '<div class="bars">' + sorted.map(function (x, k) {
      if (x.t.score !== last) { rank = k + 1; last = x.t.score; }
      return '<div class="bar' + (rank === 1 && x.t.score > 0 ? " lead" : "") + '" style="--c:' + x.t.color + '"><span class="r">' + rank + '</span><span class="n">' + esc(x.t.name) + '</span><span class="track"><span class="fill" style="display:block;--w:' + Math.max(3, Math.round(x.t.score / max * 100)) + '%;animation-delay:' + (k * .12) + 's"></span></span><span class="s">' + x.t.score + "</span></div>";
    }).join("") + "</div>";
  }

  function vScores() {
    var c = game.cur, last = !c.tiebreak && game.turn + 1 >= game.total;
    var nextTeam = !last && !c.tiebreak ? game.teams[teamOfTurn(game.turn + 1)] : null;
    return '<section class="screen">' + topbar("<span>" + turnLabel() + "</span>") +
      '<div class="page-head" style="justify-content:center"><h2>لوحة النتائج 📊</h2></div>' + barsHTML() +
      '<div class="actionbar"><button class="btn go huge" data-ui="next">' + (nextTeam ? "الدور التالي: " + esc(nextTeam.name) + " ▶" : "النتيجة النهائية 🏆") + (c.autoLeft ? ' <span class="muted" style="font-size:.5em">(<span id="auto-left">' + c.autoLeft + "</span>)</span>" : "") + "</button>" +
      '<span class="muted">باقي ' + Math.max(0, game.total - game.turn - 1) + " دور</span></div></section>";
  }

  function vOver() {
    var L = leaders(), top = game.teams[L[0]].score;
    return '<canvas id="confetti" aria-hidden="true"></canvas><section class="final"><div class="trophy" aria-hidden="true">🏆</div>' +
      '<div class="muted" style="font-size:1.3em">' + (L.length > 1 ? "تعادل بعد الجولات الفاصلة — الفوز مشترك" : "الفريق الفائز") + "</div>" +
      '<div class="champ">' + L.map(function (i) { return esc(game.teams[i].name); }).join(" و ") + "</div>" +
      '<div class="pts"><span class="tot">' + top + " " + ptsWord(top) + "</span><span>🎯 " + Math.max.apply(null, L.map(function (i) { return game.teams[i].perfect; })) + " ترتيب كامل</span></div>" + barsHTML() +
      (game.trial ? '<p class="special"><b>خلصت التجربة 👌</b><span>جاهزين للمباراة الحقيقية؟</span></p>' : "") +
      '<div class="row">' + (game.trial ? '<button class="btn go big" data-ui="quick">ابدأ المباراة الحقيقية ▶</button>' : '<button class="btn go big" data-ui="rematch">مباراة جديدة بنفس الفرق 🔁</button>') + '<button class="btn big" data-ui="setup">تعديل الإعدادات</button><button class="btn big ghost" data-ui="home-clear">الصفحة الأولى</button></div></section>';
  }

  function summary() {
    var n = teamCount();
    return (settings.format === "pvp" ? "لاعب ضد لاعب" : n === 2 ? "فريقان" : n + " فرق") + " · " + settings.perTeam + " أدوار لكل فريق · مستوى " + lvlName(settings.level) + " · " + (settings.timer ? settings.timer + " ثانية" : "بدون مؤقت") + " · " + (settings.host === "host" ? "مع مضيف" : "تلقائي");
  }

  function vHome() {
    var resumable = game && game.phase !== "over";
    return '<section class="home"><div class="logo" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span></div>' +
      '<h1 class="title">رتّب <em>وفوز</em></h1>' +
      '<p class="subtitle">بطاقات مبعثرة… وعليكم ترتيبها: من الأقدم للأحدث، من الأصغر للأكبر، من البداية للنهاية.</p>' +
      '<div class="home-stack">' +
      (resumable ? '<button class="btn hot big" data-ui="resume">كمّل المباراة</button>' : "") +
      '<button class="btn ' + (resumable ? "" : "go ") + 'big start" data-ui="homestart">ابدأ اللعب ▶</button>' +
      '<div class="row"><button class="btn big ghost" data-ui="trial">تجربة سريعة</button><button class="btn big ghost" data-ui="howto">طريقة اللعب</button></div>' +
      '<button class="btn big" data-ui="setup">الإعدادات</button>' +
      "</div></section>";
  }

  function vSetup() {
    var s = settings, n = teamCount();
    var formats = [["pvp", "لاعب ضد لاعب"], ["2", "فريق ضد فريق"], ["3", "3 فرق"], ["4", "4 فرق"], ["5", "5 فرق"], ["6", "6 فرق"]];
    var inputs = ""; for (var i = 0; i < n; i++) inputs += '<div class="team-input"><span class="sw" style="background:' + COLORS[i] + '"></span><input id="tn-' + i + '" data-name="' + i + '" maxlength="24" value="' + esc(s.names[i]) + '" aria-label="اسم ' + (s.format === "pvp" ? "اللاعب" : "الفريق") + " " + (i + 1) + '"><button class="btn dice" data-dice="' + i + '" title="اسم عشوائي" aria-label="اسم عشوائي">🎲</button></div>';
    var c1 = '<div class="setup-col panel' + (setupTab === "teams" ? " on" : "") + '"><div class="field"><span class="label">نظام اللعب</span><div class="chips">' +
      formats.map(function (f) { return '<button class="chip" data-format="' + f[0] + '" aria-pressed="' + (s.format === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="field"><span class="label">الأسماء</span><div class="team-inputs">' + inputs + '</div><button class="btn small" data-ui="all-funny">🎲 أسماء مضحكة للكل</button>' + nmChips(s.names.slice(0, n)) + "</div></div>";
    var c2 = '<div class="setup-col panel' + (setupTab === "level" ? " on" : "") + '"><div class="field"><span class="label">مستوى الصعوبة</span><div class="chips">' +
      LEVELS.map(function (l) { return '<button class="chip" data-level="' + l.id + '" aria-pressed="' + (s.level === l.id) + '">' + l.name + "</button>"; }).join("") +
      '</div><p class="hint">' + ["", "معلومات معروفة تحتاج تفكير", "تحتاج تركيز ومعرفة جيدة", "معلومات أقل شيوعاً حتى بين المثقفين"][s.level] + "</p></div>" +
      '<div class="field"><span class="label">عدد الأدوار لكل فريق</span><div class="stepper"><button class="btn" data-ui="per-" aria-label="أقل">−</button><output>' + s.perTeam + '</output><button class="btn" data-ui="per+" aria-label="أكثر">+</button></div><p class="hint">مجموع الجولات: ' + s.perTeam * n + "</p></div>" +
      '<div class="field"><span class="label">مدة الجولة</span><div class="chips">' + [[0, "بدون مؤقت"], [30, "30 ث ⚡"], [45, "45 ث"], [60, "60 ث"], [90, "90 ث"], [120, "120 ث"]].map(function (t) { return '<button class="chip" data-timer="' + t[0] + '" aria-pressed="' + (s.timer === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div></div></div>";
    var c3 = '<div class="setup-col panel' + (setupTab === "mode" ? " on" : "") + '"><div class="field"><span class="label">طريقة الإدارة</span><div class="chips">' +
      '<button class="chip" data-host="auto" aria-pressed="' + (s.host === "auto") + '">تلقائي 🤖</button><button class="chip" data-host="host" aria-pressed="' + (s.host === "host") + '">مع مضيف 🎤</button></div>' +
      '<p class="hint">' + (s.host === "host" ? "المضيف يكشف الإجابات بنفسه ويتحكم في الانتقال، ويقدر يتخطى السؤال." : "اللعبة تكشف الإجابة بعد الاعتماد وتنتقل للنتائج تلقائياً.") + "</p></div>" +
      '<div class="field"><span class="label">إضافات</span><div class="toggles">' +
      [["specials", "🎁 الجولات الخاصة", "سرعة، تحدي، الكل يشارك، المجهول، الحسم — تظهر عشوائياً"], ["speedBonus", "⚡ نقاط السرعة", "+3 أو +1 للترتيب الكامل السريع"], ["music", "🎵 موسيقى خلفية", "خفيفة ويمكن إيقافها"], ["sound", "🔊 المؤثرات", "أصوات الكشف والتحريك والعد"]]
        .map(function (t) { return '<label class="toggle"><input type="checkbox" id="opt-' + t[0] + '" data-opt="' + t[0] + '"' + (s[t[0]] ? " checked" : "") + "><span><b>" + t[1] + "</b><small>" + t[2] + "</small></span></label>"; }).join("") + "</div></div></div>";
    return '<section class="screen"><div class="page-head"><h2>إعداد المباراة</h2><button class="btn ghost" data-ui="home">الصفحة الأولى</button></div>' +
      '<div class="tabs" role="tablist">' + [["teams", "الفرق"], ["level", "الأسئلة والوقت"], ["mode", "الإدارة والإضافات"]].map(function (t) { return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (setupTab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<div class="setup-body">' + c1 + c2 + c3 + "</div>" + (setupErr ? '<p class="error">' + esc(setupErr) + "</p>" : "") +
      '<div class="setup-foot"><span class="summary">' + esc(summary()) + '</span><button class="btn go huge" data-ui="start">ابدأ المباراة ▶</button></div></section>';
  }

  function vHowto() {
    return '<section class="screen"><div class="page-head"><h2>طريقة اللعب</h2><button class="btn ghost" data-ui="home">الصفحة الأولى</button></div><div class="scroll"><div class="howto panel">' +
      "<ol><li>الفريق صاحب الدور يختار رقماً من اللوحة، وكل رقم يفتح سؤالاً مختلفاً.</li><li>تظهر بطاقات مبعثرة وقاعدة الترتيب: من الأقدم للأحدث، من الأصغر للأكبر، وغيرها. البطاقة الأولى فوق والأخيرة تحت.</li>" +
      "<li>رتّبوا البطاقات بالسحب، أو بأزرار ▲▼، أو بالكيبورد، ثم اضغطوا «اعتماد الترتيب».</li><li>ينكشف الترتيب الصحيح مع مقارنة ترتيبكم وشرح المعلومة، وتنضاف النقاط تلقائياً.</li></ol>" +
      "<h3>النقاط</h3><ul><li>ترتيب صحيح بالكامل: <b>10</b></li><li>خطأ واحد (بطاقتان متبادلتان): <b>6</b></li><li>خطآن أو أكثر: <b>3</b></li><li>إذا كان نصف أزواج البطاقات أو أكثر مقلوباً، يعني الترتيب أسوأ من العشوائي: <b>0</b></li><li>نقاط السرعة (إذا فعّلتوها): +3 للترتيب الكامل في أول ثلث الوقت، و+1 في الثلث الثاني.</li></ul>" +
      "<p>نحسب الأخطاء بعدد أزواج البطاقات المقلوبة: تبديل بطاقتين متجاورتين = خطأ واحد.</p>" +
      "<h3>الجولات الخاصة 🎁</h3><ul><li><b>السرعة ⚡:</b> 25 ثانية فقط.</li><li><b>التحدي 🧩:</b> 6 بطاقات أو أكثر.</li><li><b>الكل يشارك 👥:</b> كل الفرق تحل نفس السؤال بالتناوب، والباقون لا يشوفون الشاشة.</li><li><b>المجهول ❓:</b> طريقة الترتيب تنكشف بعد 8 ثوانٍ.</li><li><b>الحسم 🔥:</b> سؤال أصعب ونقاط مضاعفة.</li></ul>" +
      "<p>تظهر عشوائياً، فبعض المباريات فيها أكثر من غيرها.</p>" +
      "<h3>التعادل</h3><p>إذا تعادل المتصدرون في النهاية تبدأ جولة فاصلة بسؤال خبراء للفرق المتعادلة فقط.</p>" +
      "<h3>المضيف أو التلقائي</h3><p>مع المضيف: هو اللي يكشف الإجابة ويتحكم في الانتقال ويقدر يتخطى السؤال. في الوضع التلقائي: اللعبة تكشف وتنتقل وحدها. وفي الوضعين زر «± النقاط» لتصحيح أي نتيجة.</p>" +
      "<h3>الكيبورد والريموت</h3><ul><li>في اللوحة: الأسهم للتنقل بين الأرقام و<kbd>Enter</kbd> للفتح.</li><li>في السؤال: <kbd>↑</kbd> <kbd>↓</kbd> للتنقل بين البطاقات، <kbd>Enter</kbd> لمسك البطاقة، ثم الأسهم لتحريكها و<kbd>Enter</kbd> لتركها. <kbd>Tab</kbd> للوصول لزر الاعتماد.</li><li><kbd>M</kbd> الموسيقى · <kbd>F</kbd> ملء الشاشة · <kbd>Enter</kbd> للزر الرئيسي في باقي الشاشات.</li></ul>" +
      "</div></div></section>";
  }

  function vModal() {
    if (!modal) return "";
    var inner = "";
    if (modal.type === "scores") {
      inner = "<h2>تعديل النقاط</h2>" + game.teams.map(function (t, i) {
        return '<div class="score-row" style="--c:' + t.color + '"><span class="n">' + esc(t.name) + '</span><button class="btn" data-sc="' + i + ':-1" aria-label="إنقاص">−</button><input id="sc-' + i + '" type="number" data-scv="' + i + '" value="' + modal.vals[i] + '" aria-label="نقاط ' + esc(t.name) + '"><button class="btn" data-sc="' + i + ':1" aria-label="زيادة">+</button></div>';
      }).join("") + '<div class="actions"><button class="btn go big" data-ui="scores-save">حفظ</button><button class="btn big" data-ui="close">إلغاء</button></div>';
    } else if (modal.type === "confirm") {
      var t = { end: ["إنهاء المباراة؟", "تظهر النتيجة النهائية الحين."], skip: ["تخطي السؤال؟", "ينتقل الدور بدون نقاط لهذا السؤال."] }[modal.what];
      inner = "<h2>" + t[0] + "</h2><p>" + t[1] + '</p><div class="actions"><button class="btn go big" data-ui="confirm-yes">إيه</button><button class="btn big" data-ui="close">لا</button></div>';
    }
    return '<div class="modal-back" data-ui="backdrop"><div class="modal panel" role="dialog" aria-modal="true">' + inner + "</div></div>";
  }

  function passSync() {
    try {
      var u = Store.get(K.used, []); if (!Array.isArray(u)) u = [];
      var played = BANK.filter(function (x) { return u.indexOf(x.id) >= 0; }).length;
      window.MAJLIS_PASS && MAJLIS_PASS.sets("rt", BANK.length, BANK.length - played, { ids: BANK.map(function (q) { return q.id; }), used: u, reset: function () { Store.set(K.used, []); } });
    } catch (e) {}
  }
  function render() {
    passSync();
    try { renderInner(); } catch (err) {
      if (window.console) console.error(err);
      game = null; saveGame(); view = "home"; modal = null; renderInner(); toast("صار خلل في المباراة المحفوظة، فبدأنا من جديد");
    }
  }
  function renderInner() {
    var app = document.getElementById("app"), html;
    if (view === "game" && game) {
      html = { pick: vPick, intro: vIntro, cover: vCover, play: vPlay, reveal: vReveal, scores: vScores, over: vOver }[game.phase]();
    } else if (view === "setup") html = vSetup();
    else if (view === "howto") html = vHowto();
    else html = vHome();
    app.innerHTML = html + vModal();
    if (view === "game" && game) {
      if (game.phase === "pick") { var tl = document.getElementById("tile-" + focusTile); if (tl && !modal) tl.focus({ preventScroll: true }); }
      if (game.phase === "over" || confettiBurst) { confetti(game.phase === "over" ? 9000 : 2600); confettiBurst = false; }
    }
  }

  function toast(t) { var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2000); }

  function confetti(ms) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var c = document.getElementById("confetti");
    if (!c) { c = document.createElement("canvas"); c.id = "confetti"; c.setAttribute("aria-hidden", "true"); document.body.appendChild(c); setTimeout(function () { c.remove(); }, ms + 500); }
    var ctx = c.getContext("2d"), W = c.width = innerWidth, H = c.height = innerHeight, cols = COLORS.concat(["#ffffff"]), ps = [];
    for (var i = 0; i < 170; i++) ps.push({ x: Math.random() * W, y: -Math.random() * H * .6, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2.5 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -.12 + Math.random() * .24, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function f(now) {
      if (!c.isConnected) return;
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.y += p.vy; p.x += p.vx; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
      if (now - t0 < ms) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  /* ---------- moving cards ---------- */
  function move(pos, dir) {
    var c = game.cur, to = pos + dir; if (to < 0 || to >= c.order.length) return;
    var t = c.order[pos]; c.order[pos] = c.order[to]; c.order[to] = t;
    focusCard = to; SFX.tick(); commit();
    var el = document.querySelector('.card[data-pos="' + to + '"]'); if (el) el.classList.add("drop");
  }
  function moveTo(from, to) {
    var c = game.cur; if (from === to) return;
    var x = c.order.splice(from, 1)[0]; c.order.splice(to, 0, x); focusCard = to; SFX.drop(); commit();
    var el = document.querySelector('.card[data-pos="' + to + '"]'); if (el) el.classList.add("drop");
  }

  var drag = null;
  document.addEventListener("pointerdown", function (e) {
    if (view !== "game" || !game || game.phase !== "play" || modal || game.cur.paused) return;
    var card = e.target.closest(".card"); if (!card || e.target.closest("button")) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
    var from = +card.dataset.pos, r0 = cards[0].getBoundingClientRect(), r1 = cards.length > 1 ? cards[1].getBoundingClientRect() : r0;
    drag = { el: card, from: from, to: from, startY: e.clientY, step: (r1.top - r0.top) || r0.height, cards: cards, id: e.pointerId, moved: false };
    try { card.setPointerCapture(e.pointerId); } catch (er) {}
    card.classList.add("drag", "grab");
    focusCard = from; SFX.pick();
  });
  document.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = e.clientY - drag.startY; if (Math.abs(dy) > 4) drag.moved = true;
    drag.el.style.transform = "translateY(" + dy + "px) scale(1.02)";
    var to = Math.max(0, Math.min(drag.cards.length - 1, drag.from + Math.round(dy / drag.step)));
    if (to !== drag.to) { drag.to = to; SFX.tick(); }
    drag.cards.forEach(function (c, i) {
      if (c === drag.el) return;
      var shift = 0;
      if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.step;
      if (drag.from > drag.to && i >= drag.to && i < drag.from) shift = drag.step;
      c.style.transform = shift ? "translateY(" + shift + "px)" : "";
    });
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    if (d.moved && d.to !== d.from) moveTo(d.from, d.to);
    else { d.el.style.transform = ""; d.el.classList.remove("drag", "grab"); d.cards.forEach(function (c) { c.style.transform = ""; }); render(); }
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  /* ---------- UI actions ---------- */
  function go(v) { view = v; setupErr = ""; modal = null; render(); }
  function startMatch(keep) {
    if (!keep) {
      document.querySelectorAll("[data-name]").forEach(function (i) { settings.names[+i.dataset.name] = i.value; });
      saveSettings();
    }
    newGame(keep); view = "game"; ensureTicker(); if (settings.music) setMusic(true); commit();
  }
  function readScoreInputs() { document.querySelectorAll("[data-scv]").forEach(function (inp) { var v = Math.round(+inp.value); modal.vals[+inp.dataset.scv] = isFinite(v) ? Math.max(-999, Math.min(999, v)) : 0; }); }

  function ui(a, el, ev) {
    switch (a) {
      case "home": go("home"); break;
      case "home-clear": game = null; saveGame(); stopAll(); go("home"); break;
      case "setup": go("setup"); break;
      case "howto": go("howto"); break;
      case "reset-used":
        if (Date.now() - resetArm < 4000) { Store.set(K.used, []); resetArm = 0; toast("تم التصفير — كل الأسئلة صارت جديدة"); }
        else { resetArm = Date.now(); setTimeout(function () { if (view === "home") render(); }, 4100); }
        render(); break;
      case "homestart": setupTab = "teams"; go("setup"); break;
      case "quick": case "start": startMatch(); break;
      case "trial": {
        keepNames(); saveSettings();
        var saved = clone(settings);
        settings.perTeam = Math.max(1, Math.ceil(3 / teamCount())); settings.level = 1; settings.timer = 60;
        settings.specials = false; settings.speedBonus = false; settings.host = "auto";
        newGame(); settings = saved; game.trial = true; view = "game"; ensureTicker(); commit();
        break;
      }
      case "rematch": startMatch(game.teams); break;
      case "resume": view = "game"; ensureTicker(); if (game.phase === "intro") { introLeft = 3; runIntro(); } if (game.phase === "reveal" && !game.cur.revealed && game.settings.host !== "host") doRevealSoon(); if (settings.music) setMusic(true); render(); break;
      case "per-": settings.perTeam = Math.max(1, settings.perTeam - 1); saveSettings(); render(); break;
      case "per+": settings.perTeam = Math.min(8, settings.perTeam + 1); saveSettings(); render(); break;
      case "all-funny":
        var names = shuffle(FUNNY.slice()); for (var i = 0; i < 6; i++) settings.names[i] = names[i]; saveSettings(); render(); break;
      case "music": setMusic(!settings.music); render(); break;
      case "sound": settings.sound = !settings.sound; saveSettings(); render(); break;
      case "fullscreen": try { if (!document.fullscreenElement) { var pr = document.documentElement.requestFullscreen(); if (pr && pr.catch) pr.catch(function () {}); } else document.exitFullscreen(); } catch (er) {} break;
      case "end": modal = { type: "confirm", what: "end" }; render(); break;
      case "skip": modal = { type: "confirm", what: "skip" }; render(); break;
      case "confirm-yes":
        var w = modal.what; modal = null;
        if (w === "end") finish();
        else if (w === "skip") { game.cur.results = []; toScores(); }
        break;
      case "close": modal = null; render(); break;
      case "backdrop": if (ev.target === el) { modal = null; render(); } break;
      case "scores": if (game) { modal = { type: "scores", vals: game.teams.map(function (t) { return t.score; }) }; render(); } break;
      case "scores-save": readScoreInputs(); game.teams.forEach(function (t, i) { t.score = modal.vals[i]; }); modal = null; toast("تم تعديل النقاط"); commit(); break;
      case "start-play": startPlay(); break;
      case "submit": submit(false); break;
      case "pause": game.cur.paused = !game.cur.paused; commit(); break;
      case "reveal": doReveal(); break;
      case "to-scores": toScores(); break;
      case "next": nextTurn(); break;
    }
  }

  var REPEATABLE = { "per-": 1, "per+": 1, scores: 0, music: 1, sound: 1 };
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-ui],[data-tile],[data-move],[data-format],[data-level],[data-timer],[data-host],[data-tab],[data-dice],[data-sc]");
    if (!el) return;
    /* a double-click must not press the button that appears under the cursor after the first click */
    if (e.detail > 1 && (el.dataset.tile != null || (el.dataset.ui && !REPEATABLE[el.dataset.ui]))) return;
    var d = el.dataset;
    if (d.ui) return ui(d.ui, el, e);
    if (d.tile) { focusTile = +d.tile; SFX.pick(); openTile(+d.tile); return; }
    if (d.move) { if (game.cur.paused) return; var m = d.move.split(":"); move(+m[0], +m[1]); return; }
    if (d.format) { keepNames(); settings.format = d.format; saveSettings(); render(); return; }
    if (d.level) { keepNames(); settings.level = +d.level; saveSettings(); render(); return; }
    if (d.timer != null) { keepNames(); settings.timer = +d.timer; saveSettings(); render(); return; }
    if (d.host) { keepNames(); settings.host = d.host; saveSettings(); render(); return; }
    if (d.tab) { keepNames(); setupTab = d.tab; render(); return; }
    if (d.dice) { keepNames(); var used = settings.names; settings.names[+d.dice] = pick(FUNNY.filter(function (x) { return used.indexOf(x) < 0; })); saveSettings(); render(); return; }
    if (d.sc) { readScoreInputs(); var p = d.sc.split(":"); modal.vals[+p[0]] += +p[1]; var inp = document.getElementById("sc-" + p[0]); if (inp) inp.value = modal.vals[+p[0]]; return; }
  });
  function keepNames() { document.querySelectorAll("[data-name]").forEach(function (i) { settings.names[+i.dataset.name] = i.value; }); }
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.dataset.opt) { keepNames(); if (el.dataset.opt === "music") setMusic(el.checked); else { settings[el.dataset.opt] = el.checked; saveSettings(); } render(); }
    else if (el.dataset.name) { keepNames(); saveSettings(); }
  });

  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (e.repeat && (k === "Enter" || k === " ")) { e.preventDefault(); return; }
    if (modal) {
      if (k === "Escape") { modal = null; render(); }
      else if (k === "Enter" && modal.type === "scores") { e.preventDefault(); ui("scores-save"); }
      return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName || "")) return;
    if (k === "m" || k === "M") { setMusic(!settings.music); render(); return; }
    if (k === "f" || k === "F") { ui("fullscreen"); return; }
    if (view !== "game" || !game) return;
    var ph = game.phase;
    if (ph === "pick") {
      var n = game.tiles.length, cols = Math.min(n, Math.max(3, Math.ceil(Math.sqrt(n * 1.9)))), d = 0;
      if (k === "ArrowLeft") d = 1; else if (k === "ArrowRight") d = -1; else if (k === "ArrowDown") d = cols; else if (k === "ArrowUp") d = -cols;
      if (d) { e.preventDefault(); var nx = focusTile + d; if (nx >= 0 && nx < n) { focusTile = nx; var t = document.getElementById("tile-" + nx); if (t) t.focus(); SFX.tick(); } return; }
      if (k === "Enter" || k === " ") { e.preventDefault(); if (!game.tiles[focusTile].opened) { SFX.pick(); openTile(focusTile); } }
      return;
    }
    if (ph === "play") {
      var c = game.cur; if (c.paused) { if (k === "Enter" || k === " ") { e.preventDefault(); ui("pause"); } return; }
      if (e.target.id === "submit-btn" || (e.target.tagName === "BUTTON" && !e.target.closest(".card"))) return;
      if (k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault(); var dir = k === "ArrowUp" ? -1 : 1;
        if (grabbed) move(focusCard, dir);
        else { focusCard = Math.max(0, Math.min(c.order.length - 1, focusCard + dir)); SFX.tick(); render(); }
        return;
      }
      if (k === "Enter" || k === " ") { e.preventDefault(); grabbed = !grabbed; if (grabbed) SFX.pick(); else SFX.drop(); render(); return; }
      if (k === "Escape") { grabbed = false; render(); }
      return;
    }
    if ((k === "Enter" || k === " ") && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      if (ph === "cover") startPlay();
      else if (ph === "reveal") { if (!game.cur.revealed) { if (game.settings.host === "host") doReveal(); } else toScores(); }
      else if (ph === "scores") nextTurn();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && game && game.phase === "play" && game.cur && !game.cur.paused && game.cur.limit) { game.cur.paused = true; commit(); }
  });
  if (game && game.phase !== "over") ensureTicker();
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pickname]"); if (!b || view !== "setup") return;
    keepNames(); var n = teamCount(), slots = settings.names.slice(0, n);
    nmPick(slots, b.getAttribute("data-pickname"), function (i) { return settings.format === "pvp" ? "اللاعب " + (i + 1) : defaults.names[i]; });
    for (var i = 0; i < n; i++) settings.names[i] = slots[i];
    saveSettings(); render();
  });
  render();
})();
