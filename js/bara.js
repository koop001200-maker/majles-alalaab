/* «برا السالفة» — one of the family doesn't know the topic. Everyone gives clever hints; find the odd one out.
   Works fully offline, one shared screen (pass it around for the secret), saved in localStorage. */
(function () {
  "use strict";
  var K = { game: "br_game_v1", settings: "br_settings_v1", used: "br_used_v1" };
  var BANK = window.BR_BANK || [], CATS = window.BR_CATS || [];
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function catOf(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return { icon: "❓", name: "" }; }
  function wordOf(id) { for (var i = 0; i < BANK.length; i++) if (BANK[i].id === id) return BANK[i]; return null; }

  /* تخمين الكلمة بعد الانكشاف: ٨ خيارات = الكلمة الصحيحة + ٣ قريبة مرة (نفس المجموعة) + ٤ بعيدة شوي (نفس الفئة، مجموعة ثانية) */
  var NEAR = {
    food: ["b1 b2 b4 b5 b6 b19 b20", "b3 b9 b10 b11 b12 b13 b18", "b7 b8 b17 b22 b23 b24", "b14 b15 b16 b21"],
    animals: ["b27 b28 b30 b31 b32 b33 b38 b43 b46", "b25 b29 b35 b36", "b26 b37 b39 b40 b42 b44", "b41 b45 b48", "b34 b47"],
    places: ["b49 b50 b51 b52 b53 b54 b55 b56 b57", "b59 b60 b61 b65 b70 b69", "b58 b63 b64 b67 b68", "b62 b66 b71 b72"],
    jobs: ["b73 b82 b95", "b74 b86 b87 b96 b83 b76", "b75 b81 b93", "b77 b89 b94", "b79 b80 b90 b91 b78", "b84 b85 b88 b92"],
    home: ["b97 b98 b105 b106 b109 b117 b118 b115", "b99 b100 b101 b110 b114 b111 b112 b102", "b107 b108 b119 b120", "b103 b104 b113 b116"],
    sport: ["b121 b133 b139 b128 b136", "b122 b134", "b131 b132 b130", "b123 b135 b137 b140 b144 b138 b129", "b124 b125 b126 b141 b142 b143 b127"],
    nature: ["b145 b146 b147 b148 b149 b150 b167 b168", "b155 b156 b157 b158 b159 b160 b165 b166", "b151 b152 b153 b154 b161 b162 b163 b164"],
    heritage: ["b169 b170 b171 b174 b175 b176 b177 b192 b189 b190", "b172 b173 b186 b182", "b183 b184 b185 b191", "b179 b180 b181 b188 b187 b178"]
  };
  function shuf(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function groupOf(w) {
    var gs = NEAR[w.cat] || [];
    for (var i = 0; i < gs.length; i++) if ((" " + gs[i] + " ").indexOf(" " + w.id + " ") >= 0) return gs[i].split(" ");
    return [];
  }
  function makeOptions(id) {
    var w = wordOf(id); if (!w) return [id];
    var grp = groupOf(w), used = {}; used[id] = 1;
    function take(list, n, out) { shuf(list).forEach(function (x) { if (out.length < n && !used[x]) { used[x] = 1; out.push(x); } }); }
    var close = []; take(grp, 3, close);
    var sameCat = BANK.filter(function (b) { return b.cat === w.cat; }).map(function (b) { return b.id; });
    take(sameCat.filter(function (x) { return grp.indexOf(x) < 0; }), 3, close); // نقص المجموعة → نكمّل من الفئة
    var far = []; take(sameCat.filter(function (x) { return grp.indexOf(x) < 0; }), 4, far);
    take(BANK.filter(function (b) { return b.cat !== w.cat; }).map(function (b) { return b.id; }), 4, far);
    return shuf([id].concat(close, far));
  }

  /* ---------- sound ---------- */
  var ac = null;
  function tone(f, d, type, v, when) {
    if (!settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + (when || 0);
      o.type = type || "sine"; o.frequency.value = f; g.gain.setValueAtTime(v || .08, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + .02);
    } catch (e) {}
  }
  var SFX = {
    tap: function () { tone(520, .08, "triangle"); },
    reveal: function () { tone(440, .12, "triangle"); tone(660, .18, "triangle", .08, .1); },
    tick: function () { tone(880, .06, "square", .05); },
    end: function () { tone(330, .5, "square", .08); tone(247, .6, "square", .07, .2); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, .3, "triangle", .12, i * .12); }); },
    wah: function () { tone(220, .4, "sawtooth", .07); tone(165, .5, "sawtooth", .06, .15); }
  };

  /* ---------- settings / state ---------- */
  var BOYS = ["محمد", "أحمد", "عبدالله", "فهد", "خالد", "سلطان", "سعود", "تركي", "فيصل", "ناصر", "يوسف", "عمر", "بدر", "نواف", "عبدالعزيز"];
  var GIRLS = ["نورة", "سارة", "ريم", "لمى", "هيا", "منى", "مها", "العنود", "دانة", "جود", "كادي", "ترف", "أسماء"];
  function mixed(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // الأولاد أولاً ثم البنات (ترتيب كل مجموعة يتلخبط مرة وحدة عند فتح اللعبة)
  var COMMON = mixed(BOYS).concat(mixed(GIRLS));
  function regNames() { try { var r = JSON.parse(localStorage.getItem("majlis_names") || "[]"); return Array.isArray(r) ? r.map(function (x) { return String(x).trim().slice(0, 16); }).filter(Boolean).slice(0, 16) : []; } catch (e) { return []; } }
  var REG = regNames(); if (REG.length) COMMON = REG;
  function toast(t) { var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }
  function isDefaultName(n) { return !String(n).trim() || /^لاعب \d+$/.test(String(n).trim()); }
  var DEF = { players: ["لاعب 1", "لاعب 2", "لاعب 3", "لاعب 4"], rounds: 5, talk: 120, sound: true };
  var settings = Object.assign(clone(DEF), Store.get(K.settings, {}) || {});
  if (!Array.isArray(settings.players)) settings.players = DEF.players.slice();
  settings.players = settings.players.map(function (n) { return String(n || "").slice(0, 16); }).slice(0, 10);
  while (settings.players.length < 3) settings.players.push("لاعب " + (settings.players.length + 1));
  if (REG.length >= 3 && settings.players.every(function (n) { return isDefaultName(n); })) settings.players = REG.slice(0, 10);
  if ([3, 5, 8].indexOf(+settings.rounds) < 0) settings.rounds = 5; settings.rounds = +settings.rounds;
  if ([60, 120, 180].indexOf(+settings.talk) < 0) settings.talk = 120; settings.talk = +settings.talk;
  settings.sound = settings.sound !== false;
  function saveSettings() { Store.set(K.settings, settings); }

  var game = Store.get(K.game, null);
  function validGame(g) { return g && Array.isArray(g.players) && g.players.length >= 3 && typeof g.phase === "string" && +g.round > 0 && +g.total > 0; }
  if (!validGame(game)) game = null;
  if (game && game.phase === "talk") game.paused = true;
  function saveGame() { Store.set(K.game, game); }

  var view = "home", modal = null, setupErr = "", selected = -1, resetArm = 0;

  /* ---------- picking a word (never repeats until the bank is used up; honours the chosen set) ---------- */
  function pickWord() {
    var hist = Store.get(K.used, []); if (!Array.isArray(hist)) hist = [];
    var src = window.MAJLIS_PASS ? MAJLIS_PASS.scoped("br", BANK, hist) : BANK;
    var fresh = src.filter(function (w) { return hist.indexOf(w.id) < 0; });
    if (!fresh.length) { fresh = BANK.filter(function (w) { return hist.indexOf(w.id) < 0; }); }
    if (!fresh.length) { hist = []; fresh = BANK.slice(); }
    var w = fresh[Math.floor(Math.random() * fresh.length)];
    hist.push(w.id); Store.set(K.used, hist);
    return w;
  }

  function newGame() {
    var names = settings.players.map(function (n, i) { n = n.trim(); return n || "لاعب " + (i + 1); });
    game = { players: names.map(function (n) { return { name: n, score: 0 }; }), round: 0, total: settings.rounds, phase: "pass", lastOut: -1, history: [] };
    nextRound();
  }
  function nextRound() {
    if (window.MAJLIS_PASS && !MAJLIS_PASS.gate("br")) { saveGame(); render(); return; }
    var n = game.players.length, out;
    do { out = Math.floor(Math.random() * n); } while (n > 1 && out === game.lastOut);
    game.lastOut = out; game.round++; game.word = pickWord().id; game.out = out; game.idx = 0; game.shown = false;
    game.timeLeft = settings.talk; game.paused = false; game.accused = -1; game.guess = null; game.gain = [];
    game.phase = "pass"; commit();
  }
  function commit() { saveGame(); render(); }

  /* ---------- actions ---------- */
  function act(a, el) {
    SFX.tap();
    switch (a) {
      case "start": go("setup"); break;
      case "resume": view = "game"; if (game && game.phase === "pass") game.shown = false; render(); break;
      case "howto": go("howto"); break;
      case "home": case "back": go("home"); break;
      case "play":
        var names = settings.players.map(function (n) { return n.trim(); }).filter(Boolean);
        var uniq = names.filter(function (n, i) { return names.indexOf(n) === i; });
        if (settings.players.length < 3) { setupErr = "لازم ٣ لاعبين على الأقل"; render(); return; }
        if (names.length !== settings.players.length) { setupErr = "اكتب اسم لكل لاعب"; render(); return; }
        if (uniq.length !== names.length) { setupErr = "الأسماء لازم تكون مختلفة"; render(); return; }
        saveSettings(); setupErr = ""; view = "game"; newGame(); break;
      case "pickname":
        var nm = el.getAttribute("data-v"), at = -1;
        var had = -1;
        settings.players.forEach(function (n, k) { if (had < 0 && n.trim() === nm) had = k; });
        if (had >= 0) {
          if (settings.players.length > 3) settings.players.splice(had, 1); else settings.players[had] = "لاعب " + (had + 1);
          saveSettings(); render(); break;
        }
        for (var q = 0; q < settings.players.length && at < 0; q++) if (isDefaultName(settings.players[q])) at = q;
        if (at < 0 && settings.players.length < 10) { settings.players.push(nm); at = settings.players.length - 1; } else if (at >= 0) settings.players[at] = nm; else { toast("وصلتم لـ١٠ لاعبين — عدّلوا اسماً موجوداً"); break; }
        saveSettings(); render(); break;
      case "add": if (settings.players.length < 10) { settings.players.push("لاعب " + (settings.players.length + 1)); saveSettings(); render(); } break;
      case "del": var i = +el.getAttribute("data-i"); if (settings.players.length > 3) { settings.players.splice(i, 1); saveSettings(); render(); } break;
      case "rounds": settings.rounds = +el.getAttribute("data-v"); saveSettings(); render(); break;
      case "talk": settings.talk = +el.getAttribute("data-v"); saveSettings(); render(); break;
      case "sound": settings.sound = !settings.sound; saveSettings(); render(); break;
      case "show": game.shown = true; SFX.reveal(); commit(); break;
      case "hide": game.shown = false; game.idx++; if (game.idx >= game.players.length) { game.phase = "talk"; game.paused = false; game.starter = Math.floor(Math.random() * game.players.length); SFX.win(); } commit(); break;
      case "pause": game.paused = !game.paused; commit(); break;
      case "tovote": game.phase = "vote"; selected = -1; commit(); break;
      case "pick": selected = +el.getAttribute("data-i"); render(); break;
      case "accuse": if (selected < 0) return; game.accused = selected; game.phase = "verdict"; game.pick = null; game.opts = null; if (selected !== game.out) finishRound(false, null); else game.opts = makeOptions(game.word); commit(); break;
      case "gopt": game.pick = el.getAttribute("data-id"); finishRound(true, game.pick === game.word); commit(); break;
      case "gok": finishRound(true, true); commit(); break;
      case "gno": finishRound(true, false); commit(); break;
      case "next": if (game.round >= game.total) { game.phase = "over"; SFX.win(); commit(); } else nextRound(); break;
      case "again": game = null; saveGame(); newGame(); break;
      case "quit": game = null; saveGame(); go("home"); break;
      case "askquit": modal = "quit"; render(); break;
      case "close": modal = null; render(); break;
    }
  }

  /* scoring: not caught → the odd one scores 3. Caught and then guesses the topic → 2 for them. Caught and fails → 1 for everyone else. */
  function finishRound(caught, guessed) {
    var gain = game.players.map(function () { return 0; });
    if (!caught) { gain[game.out] = 3; SFX.wah(); }
    else if (guessed) { gain[game.out] = 2; SFX.wah(); }
    else { game.players.forEach(function (p, i) { if (i !== game.out) gain[i] = 1; }); SFX.win(); }
    game.gain = gain; game.guess = caught ? (guessed ? "ok" : "no") : "free";
    game.players.forEach(function (p, i) { p.score += gain[i]; });
    game.history.push({ round: game.round, word: game.word, out: game.out, accused: game.accused, guess: game.guess });
    game.phase = "scores";
  }

  function go(v) { view = v; setupErr = ""; render(); }

  /* ---------- timer ---------- */
  setInterval(function () {
    if (view !== "game" || !game || game.phase !== "talk" || game.paused || modal) return;
    game.timeLeft--;
    if (game.timeLeft <= 5 && game.timeLeft > 0) SFX.tick();
    if (game.timeLeft <= 0) { game.timeLeft = 0; SFX.end(); game.phase = "vote"; selected = -1; commit(); return; }
    var el = document.getElementById("t"), ring = document.getElementById("ring");
    if (el) el.textContent = fmt(game.timeLeft);
    if (ring) { ring.style.setProperty("--p", game.timeLeft / settings.talk); ring.classList.toggle("warn", game.timeLeft <= 15); }
    saveGame();
  }, 1000);
  function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }

  /* ---------- views ---------- */
  function vHome() {
    var resumable = game && game.phase !== "over";
    return '<section class="screen home"><div class="emoji-row" aria-hidden="true"><span>🤫</span><span>🕵️</span><span>🎭</span></div>' +
      '<h1 class="title">برا السالفة</h1>' +
      '<p class="sub">واحد منكم برا السالفة وما يعرف الموضوع! كل واحد يعطي تلميحة ذكية… واكشفوه قبل لا يخمّن الموضوع.</p>' +
      '<div class="home-stack">' +
      (resumable ? '<button class="btn go big" data-a="resume">كمّل اللعبة (الجولة ' + game.round + ")</button>" : "") +
      '<button class="btn ' + (resumable ? "" : "go ") + 'big start" data-a="start">ابدأ اللعب 🎮</button>' +
      '<div class="row"><button class="btn big ghost" data-a="howto">طريقة اللعب</button></div>' +
      "</div></section>";
  }

  function vHowto() {
    return '<section class="screen"><div class="head"><h2>طريقة اللعب</h2><button class="btn" data-a="home">→ رجوع</button></div>' +
      '<div class="panel how"><ol>' +
      "<li>كل لاعب يشوف الشاشة لحاله ويعرف «الموضوع» (مثل: كبسة)… إلا واحد! هذا اللي <b>برا السالفة</b> ما يعرف شي إلا الفئة.</li>" +
      "<li>بعدها كل واحد يعطي <b>تلميحة وحدة</b> عن الموضوع بدون ما يقوله صريح. اللي برا السالفة يمثّل إنه عارف!</li>" +
      "<li>لما يخلص الوقت اختاروا مين تشكّون فيه.</li>" +
      "<li>إذا ما انكشف: برا السالفة يأخذ <b>٣ نقاط</b>. وإذا انكشف يحاول يخمّن الموضوع: يصيب ← <b>نقطتين</b> له، يغلط ← <b>نقطة</b> لكل الباقين.</li>" +
      "</ol></div></section>";
  }

  function vSetup() {
    var s = settings, names = s.players.map(function (n, i) {
      return '<div class="name"><input data-name="' + i + '" maxlength="16" list="names-dl" value="' + esc(n) + '" aria-label="اسم اللاعب ' + (i + 1) + '">' + (s.players.length > 3 ? '<button class="x" data-a="del" data-i="' + i + '" aria-label="حذف">✕</button>' : "") + "</div>";
    }).join("");
    function chips(list, cur, a, fmtf) { return '<div class="chips">' + list.map(function (v) { return '<button class="chip" data-a="' + a + '" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + fmtf(v) + "</button>"; }).join("") + "</div>"; }
    return '<section class="screen"><div class="head"><h2>إعداد اللعبة</h2><button class="btn" data-a="home">→ رجوع</button></div>' +
      '<div class="panel"><div class="field"><span class="label">اللاعبون (' + s.players.length + ' من ١٠)</span><div class="names">' + names + "</div>" +
      (s.players.length < 10 ? '<button class="btn small" data-a="add">+ لاعب</button> ' : "") + '</div>' +
      '<datalist id="names-dl">' + COMMON.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>" +
      '<div class="field"><span class="label">اضغط الاسم يدخل، واضغطه مرة ثانية يُزال</span><div class="chips namepick">' +
      COMMON.map(function (c, ci) { var used = s.players.some(function (n) { return n.trim() === c; }); return (!REG.length && ci === BOYS.length ? '<i class="brk" aria-hidden="true"></i>' : "") + '<button class="chip" data-a="pickname" data-v="' + esc(c) + '" aria-pressed="' + used + '"' + (used ? ' title="اضغط مرة ثانية لإزالته"' : "") + ">" + (used ? "✓ " : "") + esc(c) + "</button>"; }).join("") + "</div></div></div>" +
      '<div class="row"><div class="field"><span class="label">عدد الجولات</span>' + chips([3, 5, 8], s.rounds, "rounds", function (v) { return v + " جولات"; }) + "</div>" +
      '<div class="field"><span class="label">وقت النقاش</span>' + chips([60, 120, 180], s.talk, "talk", function (v) { return v / 60 + (v === 60 ? " دقيقة" : " دقائق"); }) + "</div></div>" +
      (setupErr ? '<p class="error" style="color:#b91c1c;font-weight:800">' + esc(setupErr) + "</p>" : "") +
      '<button class="btn go huge" data-a="play">ابدأ ▶</button></section>';
  }

  function topbar() { return '<div class="head"><span class="row"><button class="btn small" data-a="back">→ رجوع</button><span class="badge">الجولة ' + game.round + " من " + game.total + '</span></span><span class="row"><button class="btn small" data-a="sound">' + (settings.sound ? "🔊" : "🔇") + '</button><button class="btn small" data-a="askquit">إنهاء</button></span></div>'; }

  function vPass() {
    var p = game.players[game.idx], w = wordOf(game.word) || { w: "؟", cat: "" }, c = catOf(w.cat), isOut = game.idx === game.out;
    if (!game.shown) {
      return '<section class="screen">' + topbar() + '<div class="card panel"><p class="sub">مرّروا الشاشة لـ</p><div class="who">' + esc(p.name) + '</div><p class="sub">الباقين لا يطالعون! اضغط للكشف.</p>' +
        '<button class="btn go huge" data-a="show">👀 اكشف لي</button></div></section>';
    }
    return '<section class="screen">' + topbar() + '<div class="card panel"><span class="cat">' + c.icon + " الفئة: " + esc(c.name) + "</span>" +
      (isOut ? '<div class="secret out">🤫 أنت برا السالفة!</div><p class="sub">ما تعرف الموضوع. اسمع تلميحات الباقين ومثّل إنك عارف.</p>'
        : '<p class="sub">الموضوع:</p><div class="secret">' + esc(w.w) + '</div><p class="sub">لا تقوله صريح… عطهم تلميحة ذكية.</p>') +
      '<button class="btn go huge" data-a="hide">تمام، أخفيه ✔</button></div></section>';
  }

  function vTalk() {
    var w = wordOf(game.word) || { cat: "" }, c = catOf(w.cat), n = game.players.length, st = game.starter || 0;
    var order = game.players.map(function (p, i) { return '<span' + (i === st ? ' class="now"' : "") + ">" + esc(game.players[(st + i) % n].name) + "</span>"; }).join("");
    return '<section class="screen">' + topbar() + '<span class="cat">' + c.icon + " الفئة: " + esc(c.name) + "</span>" +
      '<div class="ring' + (game.timeLeft <= 15 ? " warn" : "") + '" id="ring" style="--p:' + (game.timeLeft / settings.talk) + '"><span id="t">' + (game.paused ? "⏸" : fmt(game.timeLeft)) + "</span></div>" +
      '<p class="sub">كل واحد يعطي تلميحة وحدة بالترتيب، يبدأ <b>' + esc(game.players[st].name) + '</b>. بعدها جولة ثانية إذا بقي وقت!</p>' +
      '<div class="order" aria-label="ترتيب التلميحات">' + order + "</div>" +
      '<div class="row"><button class="btn big" data-a="pause">' + (game.paused ? "▶ كمّل" : "⏸ إيقاف") + '</button><button class="btn go big" data-a="tovote">🗳️ نصوّت الحين</button></div></section>';
  }

  function vVote() {
    var btns = game.players.map(function (p, i) { return '<button class="btn" data-a="pick" data-i="' + i + '" aria-pressed="' + (selected === i) + '">' + esc(p.name) + "</button>"; }).join("");
    return '<section class="screen">' + topbar() + '<h2 class="verdict">مين برا السالفة؟ 🕵️</h2><p class="sub">اتفقوا على واحد واضغطوا اسمه.</p><div class="vote">' + btns + "</div>" +
      '<button class="btn go huge" data-a="accuse"' + (selected < 0 ? " disabled" : "") + ">اكشفوه!</button></section>";
  }

  function vVerdict() {
    var out = game.players[game.out];
    if (!game.opts || !game.opts.length) game.opts = makeOptions(game.word);
    var opts = game.opts.map(function (id) { var w = wordOf(id); return w ? '<button class="btn" data-a="gopt" data-id="' + esc(id) + '">' + esc(w.w) + "</button>" : ""; }).join("");
    return '<section class="screen">' + topbar() + '<div class="card panel"><div class="verdict">صح! 🎯 <b>' + esc(out.name) + "</b> هو اللي برا السالفة</div>" +
      '<p class="sub">الحين ' + esc(out.name) + " يخمّن الموضوع: اختر وحدة من ٨ خيارات.</p>" +
      '<div class="vote opts">' + opts + "</div>" +
      '<div class="row"><button class="btn bad big" data-a="gno">🤷 ما أعرف</button></div></div></section>';
  }

  function board(showGain) {
    var order = game.players.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return b.p.score - a.p.score; });
    var top = order.length ? order[0].p.score : 0;
    return '<div class="board">' + order.map(function (o) {
      var g = (game.gain && game.gain[o.i]) || 0;
      return '<div class="line' + (o.p.score === top && top > 0 ? " first" : "") + '"><b>' + esc(o.p.name) + (o.i === game.out && showGain ? " 🤫" : "") + '</b>' + (showGain && g ? '<span class="plus">+' + g + "</span>" : "") + '<span class="pts">' + o.p.score + "</span></div>";
    }).join("") + "</div>";
  }

  function vScores() {
    var out = game.players[game.out], w = wordOf(game.word) || { w: "؟" };
    var msg = game.guess === "free" ? "ما انكشف! 😎 " + esc(out.name) + " أخذ ٣ نقاط" : game.guess === "ok" ? "انكشف وخمّن الموضوع! 🧠 " + esc(out.name) + " أخذ نقطتين" : "انكشف وما عرف! 🎉 نقطة لكل الباقين";
    return '<section class="screen">' + topbar() + '<h2 class="verdict">' + msg + '</h2><p class="sub">الموضوع: <b>' + esc(w.w) + "</b> · اللي برا السالفة: <b>" + esc(out.name) + "</b>" + (game.guess !== "free" && game.pick && wordOf(game.pick) ? " · اختار: <b>" + esc(wordOf(game.pick).w) + "</b>" : "") + "</p>" + board(true) +
      '<button class="btn go huge" data-a="next">' + (game.round >= game.total ? "النتيجة النهائية 🏆" : "الجولة التالية ▶") + "</button></section>";
  }

  function vOver() {
    var top = Math.max.apply(null, game.players.map(function (p) { return p.score; })), win = game.players.filter(function (p) { return p.score === top; }).map(function (p) { return esc(p.name); });
    return '<section class="screen"><h2 class="verdict">🏆 ' + (win.length > 1 ? "تعادل بين " : "الفائز: ") + win.join(" و ") + "</h2>" + board(false) +
      '<div class="row"><button class="btn go huge" data-a="again">🔁 لعبة جديدة</button><button class="btn big" data-a="quit">الصفحة الأولى</button></div></section>';
  }

  function vModal() {
    if (modal === "quit") return '<div class="modal-back"><div class="modal panel"><h2>إنهاء اللعبة؟</h2><p class="sub">تضيع النقاط الحالية.</p><div class="row"><button class="btn bad big" data-a="quit">إنهاء</button><button class="btn big" data-a="close">تراجع</button></div></div></div>';
    return "";
  }

  function passSync() {
    try {
      var u = Store.get(K.used, []); if (!Array.isArray(u)) u = [];
      var played = BANK.filter(function (w) { return u.indexOf(w.id) >= 0; }).length;
      window.MAJLIS_PASS && MAJLIS_PASS.sets("br", BANK.length, BANK.length - played, { ids: BANK.map(function (w) { return w.id; }), used: u, reset: function () { Store.set(K.used, []); } });
    } catch (e) {}
  }

  function render() {
    passSync();
    var app = document.getElementById("app"), h;
    if (view === "game" && game) {
      var ph = game.phase;
      h = ph === "pass" ? vPass() : ph === "talk" ? vTalk() : ph === "vote" ? vVote() : ph === "verdict" ? vVerdict() : ph === "scores" ? vScores() : ph === "over" ? vOver() : vHome();
    } else h = view === "setup" ? vSetup() : view === "howto" ? vHowto() : vHome();
    var focusName = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-name");
    app.innerHTML = h + vModal();
    if (focusName != null) { var f = app.querySelector('[data-name="' + focusName + '"]'); if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} } }
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-a]"); if (!el || el.disabled) return;
    var A1 = el.getAttribute("data-a");
    // النقر المزدوج السريع ما يمرّر النقرة الثانية على زر الشاشة التالية (كان يكشف سر اللاعب اللي بعده)
    if (e.detail > 1 && ["show", "hide", "tovote", "pick", "accuse", "gopt", "gno", "next", "play", "start", "again"].indexOf(A1) >= 0) return;
    act(A1, el);
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (t.hasAttribute && t.hasAttribute("data-name")) { settings.players[+t.getAttribute("data-name")] = t.value; saveSettings(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.hasAttribute && e.target.hasAttribute("data-name")) { e.preventDefault(); e.target.blur(); }
  });
  window.addEventListener("hashchange", function () { /* no routes */ });
  render();
})();
