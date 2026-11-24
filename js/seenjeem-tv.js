/* «سين جيم» — شاشة التلفزيون: الرئيسية، الإعداد، اللوحة، السؤال، وسائل المساعدة، النهاية، إدارة الأسئلة، وتحكم الجوال (QR).
   المنطق في seenjeem-engine.js؛ هذا الملف للعرض والتحكم فقط. */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  if (qs.has("room")) return; // هذه الصفحة جوال المتحكم → seenjeem-phone.js
  var D = window.SJ_DATA, E = window.SJ_ENGINE, A = window.SJ_AUDIO, Net = window.WshNet;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var K = { settings: "sj_settings_v1", match: "sj_match_v1", used: "sj_used_v1", custom: "sj_custom_v1", room: "sj_room_v1" };
  var TCOL = ["#3B82F6", "#F97316"];
  var TIMES = [20, 30, 45, 60], DIFFS = [["mix", "منوّع"], ["easy", "أسهل"], ["hard", "أصعب"]];

  /* ---------- البيانات: الأساسية + المضافة ---------- */
  var custom = Store.get(K.custom, null); if (!custom || !Array.isArray(custom.q) || !Array.isArray(custom.cats)) custom = { q: [], cats: [] };
  function saveCustom() { Store.set(K.custom, custom); }
  function allCats() { return D.cats.concat(custom.cats); }
  function catOf(id) { var l = allCats(), i; for (i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return { id: id, name: id, icon: "❔" }; }
  function allQ() { return D.questions.concat(custom.q); }
  function missing(cid) { var out = []; [200, 400, 600].forEach(function (p) { var n = allQ().filter(function (q) { return q.c === cid && q.p === p; }).length; if (n < 2) out.push(p + " (ينقص " + (2 - n) + ")"); }); return out; }

  /* ---------- الإعدادات ---------- */
  var DEF = { n0: "الفريق الأول", n1: "الفريق الثاني", cats: ["ksa", "gen", "sport", "film", "geo", "islam"], time: 30, diff: "mix", sound: true, music: false };
  var settings = Object.assign({}, DEF, Store.get(K.settings, {}) || {});
  (function () { var P = window.MAJLIS_PREFS && MAJLIS_PREFS(); if (!P) return; var pick = function (k, m) { return m[P[k]]; }; if (P.teams) { settings.n0 = P.teams[0]; settings.n1 = P.teams[1]; } settings.diff = pick("level", { easy: "easy", mix: "mix", hard: "hard" }); settings.time = pick("time", { fast: 20, normal: 30, slow: 45 }); })(); // إعدادات المجلس
  (function () { var FT = window.MAJLIS_FAM_TEAMS && MAJLIS_FAM_TEAMS(); if (FT) { settings.n0 = FT[0]; settings.n1 = FT[1]; } })(); // فرق جولة العائلة (أول فريقين)
  (function sanitize() {
    settings.n0 = String(settings.n0 || DEF.n0).slice(0, 18); settings.n1 = String(settings.n1 || DEF.n1).slice(0, 18);
    var ids = allCats().map(function (c) { return c.id; });
    settings.cats = (Array.isArray(settings.cats) ? settings.cats : []).filter(function (c, i, a) { return ids.indexOf(c) >= 0 && a.indexOf(c) === i; }).slice(0, 6);
    if (TIMES.indexOf(+settings.time) < 0) settings.time = 30; settings.time = +settings.time;
    if (["mix", "easy", "hard"].indexOf(settings.diff) < 0) settings.diff = "mix";
    settings.sound = settings.sound !== false; settings.music = !!settings.music;
  })();
  function saveSettings() { Store.set(K.settings, settings); }
  A.enable(settings.sound);

  /* ---------- حالة التشغيل ---------- */
  var view = "home", G = null, modal = null, T = { left: 0, running: false, call: false, callLeft: 0 };
  var fi = -1, gain = null, edCat = "all", edId = null, edMsg = "", armed = "", setupErr = "", lastTick = Date.now(), lastSec = -1;
  var room = null, net = null, netStatus = "connecting", roster = {};

  function saved() { var m = Store.get(K.match, null); return m && E.validState(m.state) && m.state.phase !== "end" ? m : null; }
  function persist() { if (G) Store.set(K.match, { state: G.state, left: T.left }); }
  function markUsed(id) { var u = Store.get(K.used, {}) || {}; u[id] = 1; Store.set(K.used, u); }
  function qCell() { return G && G.state.cur ? G.state.cells[G.state.cur.i] : null; }

  function toast(t) { var el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2200); }
  function celebrate() {
    var cv = $("#confetti"); if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
    var w = G ? G.winner() : -1, col = w >= 0 ? [TCOL[w], "#ffcf4a", "#fff"] : ["#ffcf4a", "#fff", "#3b82f6", "#f97316"], P = [], i;
    for (i = 0; i < 170; i++) P.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .4, vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 5, s: 6 + Math.random() * 9, c: col[i % col.length], r: Math.random() * 6, vr: (Math.random() - .5) * .35 });
    var f = 0;
    (function step() { cx.clearRect(0, 0, cv.width, cv.height); P.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += .05; p.r += p.vr; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); }); if (++f < 260) requestAnimationFrame(step); else cx.clearRect(0, 0, cv.width, cv.height); })();
  }

  /* ---------- بدء المباراة ---------- */
  function startNew() {
    var bad = settings.cats.filter(function (c) { return missing(c).length; });
    if (settings.cats.length !== 6) { setupErr = "اختر 6 فئات بالضبط (المختار " + settings.cats.length + ")."; render(); return; }
    if (bad.length) { setupErr = "الفئة «" + catOf(bad[0]).name + "» ينقصها أسئلة: " + missing(bad[0]).join("، "); render(); return; }
    setupErr = "";
    var used = Store.get(K.used, {}) || {};
    var st = E.newState({ n0: settings.n0, n1: settings.n1, cats: settings.cats, time: settings.time, diff: settings.diff }, D, used, custom.q);
    G = E.Game(st); T = { left: 0, running: false, call: false, callLeft: 0 }; fi = firstOpen(); view = "play"; modal = null; gain = null;
    A.play("intro"); persist();
    // لو اختاروا في المجلس «كل واحد بجواله»: نفتح رمز الـQR مباشرة عشان يربطون جوال التحكم
    try { if (localStorage.getItem("majlis_mode") === "phones") { startNet(); modal = "qr"; } } catch (e) {}
    render();
  }
  function resume() {
    var m = saved(); if (!m) return;
    G = E.Game(m.state); T = { left: +m.left || G.state.time * 1000, running: false, call: false, callLeft: 0 }; view = "play"; fi = firstOpen(); render();
  }
  function firstOpen() { if (!G) return -1; for (var i = 0; i < 36; i++) if (!G.state.cells[i].st) return i; return -1; }

  /* ---------- أفعال اللعب (مشتركة بين التلفزيون والجوال) ---------- */
  function doPick(i) {
    if (!G || !G.pick(i).ok) return;
    A.play("pick"); T = { left: G.state.time * 1000, running: true, call: false, callLeft: 0 }; lastSec = -1; persist(); render();
  }
  function doReveal() { if (!G || !G.reveal().ok) return; T.running = false; T.call = false; A.play("reveal"); persist(); render(); }
  function doAward(team) {
    var c = qCell(), id = c && c.id, r = G && G.award(team); if (!r || !r.ok) return;
    if (id) markUsed(id);
    if (team >= 0) { gain = { team: team, pts: r.pts }; A.play(r.dbl ? "dbl" : "correct"); setTimeout(function () { A.play("score"); }, 260); } else A.play("none");
    T.running = false; T.call = false; fi = firstOpen(); persist();
    if (G.state.phase === "end") { var wn = G.winner(); setTimeout(function () { A.play("win"); celebrate(); }, 500); clearMatch(); }
    render();
  }
  function clearMatch() { Store.set(K.match, null); }
  function doLife(kind) {
    if (!G) return; var r = G.useLife(kind); if (!r.ok) return;
    if (kind === "call") { T.running = false; T.call = true; T.callLeft = 30000; A.play("call"); }
    else if (kind === "dbl") A.play("dbl"); else A.play("life");
    persist(); render();
  }
  function doEndCall() { if (!T.call) return; T.call = false; T.callLeft = 0; T.running = G && !G.state.cur.revealed && T.left > 0; A.play("tap"); render(); }
  function doWrong() { if (!G || !G.wrongAttempt().ok) return; T.left = G.state.time * 1000; T.running = true; lastSec = -1; A.play("wrong"); persist(); render(); }
  function doPause() { if (!G || G.state.phase !== "q" || G.state.cur.revealed) return; if (T.call) return; if (T.left <= 0) return; T.running = !T.running; A.play("tap"); persist(); render(); }
  function doCancel() { if (!G || !G.cancel().ok) return; T.running = false; fi = firstOpen(); A.play("tap"); persist(); render(); }
  function doEnd() { if (!G) return; G.end(); clearMatch(); modal = null; A.play("win"); celebrate(); render(); }

  /* ---------- المؤقت ---------- */
  setInterval(function () {
    var now = Date.now(), dt = Math.min(500, now - lastTick); lastTick = now;
    if (view !== "play" || !G || G.state.phase !== "q" || G.state.cur.revealed) return;
    if (T.call) {
      T.callLeft -= dt; if (T.callLeft <= 0) { doEndCall(); A.play("timeout"); return; }
      paintTimer(); return;
    }
    if (!T.running) return;
    T.left -= dt;
    var sec = Math.ceil(T.left / 1000);
    if (T.left <= 0) { T.left = 0; T.running = false; A.play("timeout"); persist(); render(); return; }
    if (sec !== lastSec) { lastSec = sec; if (sec <= 5) A.play("urgent"); else if (sec <= 10) A.play("tick"); }
    paintTimer();
  }, 200);
  setInterval(function () { if (G && G.state.phase === "q") { persist(); broadcast(); } }, 2000);
  function paintTimer() {
    var r = $("#ring"), n = $("#tnum"); if (!r || !n) return;
    var total = T.call ? 30000 : G.state.time * 1000, left = T.call ? T.callLeft : T.left;
    r.style.setProperty("--p", Math.max(0, left / total).toFixed(3)); n.textContent = Math.max(0, Math.ceil(left / 1000));
    r.classList.toggle("low", !T.call && left <= 5000 && left > 0);
    var cb = $("#callsec"); if (cb) cb.textContent = Math.max(0, Math.ceil(T.callLeft / 1000));
  }

  /* ---------- الشاشات ---------- */
  function vHome() {
    var m = saved();
    return '<section class="screen home"><div class="emoji-row" aria-hidden="true"><span>❓</span><span>🏆</span><span>⏱️</span></div>' +
      '<h1 class="sj-logo">سين جيم<small>مسابقة العائلة: فريقان · ست فئات · 36 سؤالاً</small></h1>' +
      '<div class="stack">' + (m ? '<button class="btn huge go" data-a="resume">متابعة المباراة المحفوظة ▶</button>' : "") +
      '<button class="btn ' + (m ? "big" : "huge go") + '" data-a="setup">' + (m ? "ابدأ لعبة جديدة" : "ابدأ لعبة جديدة 🎮") + '</button>' +
      '<div class="row"><button class="btn big" data-a="howto">تعليمات اللعبة</button><button class="btn big" data-a="settings">إعدادات</button></div></div></section>';
  }
  function chipsOf(list, cur, act) { return '<div class="chips">' + list.map(function (x) { var v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x + " ثانية"; return '<button class="chip" data-a="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + (String(cur) === String(v)) + '">' + esc(l) + "</button>"; }).join("") + "</div>"; }
  function vSetup() {
    var s = settings, sel = s.cats;
    var teams = [0, 1].map(function (t) { return '<label class="tname" style="--c:' + TCOL[t] + '"><span class="dot"></span><input type="text" id="tn' + t + '" maxlength="18" value="' + esc(s["n" + t]) + '" aria-label="اسم الفريق ' + (t + 1) + '"></label>'; }).join("");
    var grid = allCats().map(function (c) {
      var i = sel.indexOf(c.id), miss = missing(c.id), dis = miss.length && i < 0;
      return '<button class="chip" data-a="cat" data-v="' + esc(c.id) + '" aria-pressed="' + (i >= 0) + '"' + (dis ? " disabled" : "") + (miss.length ? ' title="ينقص: ' + esc(miss.join("، ")) + '"' : "") + ">" + (i >= 0 ? '<span class="no">' + (i + 1) + "</span>" : "") + c.icon + " " + esc(c.name) + "</button>";
    }).join("");
    var ord = sel.map(function (id, i) { var c = catOf(id); return '<div class="it"><b>' + (i + 1) + "</b><span>" + c.icon + " " + esc(c.name) + '</span><button class="btn sm" data-a="up" data-v="' + i + '"' + (i === 0 ? " disabled" : "") + ' aria-label="للأعلى">▲</button><button class="btn sm" data-a="down" data-v="' + i + '"' + (i === sel.length - 1 ? " disabled" : "") + ' aria-label="للأسفل">▼</button></div>'; }).join("") || '<p class="hint">لم تُختر فئات بعد.</p>';
    return '<section class="screen"><div class="head"><h2>جهّزوا المباراة</h2><button class="btn ghost" data-a="home">الصفحة الأولى</button></div>' +
      '<div class="setup"><div class="col panel"><span class="sec-t">الفريقان والإعدادات</span><div class="field"><span class="lbl">اسم الفريقين</span>' + teams + '</div>' +
      '<div class="field"><span class="lbl">مدة الإجابة</span>' + chipsOf(TIMES, s.time, "time") + '</div>' +
      '<div class="field"><span class="lbl">مستوى صعوبة الأسئلة</span>' + chipsOf(DIFFS, s.diff, "diff") + '<span class="hint">يؤثر على اختيار الأسئلة داخل كل مستوى (200 / 400 / 600).</span></div></div>' +
      '<div class="col panel"><span class="sec-t">اختر 6 فئات (' + sel.length + "/6)</span><div class=\"row\"><button class=\"btn sm\" data-a=\"rand\">🎲 اختيار عشوائي</button><button class=\"btn sm\" data-a=\"clear\">مسح</button></div><div class=\"catgrid\">" + grid + '</div></div>' +
      '<div class="col panel"><span class="sec-t">ترتيب الفئات على اللوحة</span><div class="ord">' + ord + "</div></div></div>" +
      (setupErr ? '<p class="err" role="alert">' + esc(setupErr) + "</p>" : "") +
      '<div class="setup-foot"><button class="btn go huge" data-a="start"' + (sel.length === 6 ? "" : " disabled") + '>ابدأ المباراة ▶</button><span class="summary">' + esc(s.n0) + " ضد " + esc(s.n1) + " · " + s.time + " ث · " + ({ mix: "منوّع", easy: "أسهل", hard: "أصعب" }[s.diff]) + "</span></div></section>";
  }
  function vHowto() {
    return '<section class="screen"><div class="head"><h2>تعليمات اللعبة</h2><button class="btn ghost" data-a="home">الصفحة الأولى</button></div><div class="scroll"><div class="panel howto">' +
      '<div><h3>الفكرة</h3><ol><li>فريقان يتنافسان على لوحة فيها 6 فئات، وكل فئة 6 أسئلة (36 سؤالاً).</li><li>الفريقان يتناوبان على اختيار السؤال (الفئة + قيمته).</li><li>في كل فئة سؤالان بقيمة 200، وسؤالان 400، وسؤالان 600، وكلما زادت القيمة زاد التحدي.</li><li>اضغط «كشف الإجابة» ثم حدّد من فاز بالسؤال: الفريق الأول أو الثاني أو لا أحد.</li><li>تُضاف النقاط تلقائياً، ويُغلق السؤال ولا يُحتسب مرتين. الأعلى نقاطاً في النهاية يفوز.</li></ol></div>' +
      '<div><h3>وسائل المساعدة (لكل فريق ثلاث، مرة واحدة)</h3><ul><li><b>جاوب جوابين:</b> محاولتان للإجابة بدل واحدة. إذا أخطأتم الأولى اضغطوا «المحاولة الخاطئة» ويبدأ الوقت من جديد.</li><li><b>اتصال بصديق:</b> يتوقف وقت السؤال ويبدأ عدّاد 30 ثانية لاستشارة شخص خارج الفريق.</li><li><b>دبل النقاط:</b> تتضاعف نقاط السؤال إذا فاز به الفريق الذي فعّلها. يُفعَّل قبل كشف الإجابة.</li><li>الوسائل تخص الفريق صاحب الدور في السؤال الحالي.</li></ul></div>' +
      '<div><h3>التحكم</h3><ul><li>بالماوس أو اللمس: اضغط على الخانة.</li><li>بلوحة المفاتيح أو الريموت: الأسهم للتنقل، Enter لاختيار السؤال.</li><li>داخل السؤال: <kbd>مسافة</kbd> كشف الإجابة · <kbd>1</kbd> <kbd>2</kbd> الفريق الأول/الثاني · <kbd>0</kbd> لا أحد · <kbd>D</kbd> دبل · <kbd>T</kbd> جوابين · <kbd>C</kbd> اتصال · <kbd>P</kbd> إيقاف · <kbd>W</kbd> المحاولة الخاطئة.</li><li>زر «📱 تحكم بالجوال» يعرض رمز QR ليتحكم أحد اللاعبين من هاتفه (اختياري).</li></ul></div>' +
      '<div><h3>مهم</h3><ul><li>المباراة تُحفظ تلقائياً؛ إذا حدّثت الصفحة تقدر تتابع من الرئيسية.</li><li>كل مباراة تُختار فيها أسئلة مختلفة قدر الإمكان عن المباريات السابقة.</li><li>من «إعدادات» تقدرون تضيفون أسئلة وفئات جديدة وتعدّلونها.</li></ul></div></div></div></section>';
  }
  function vSettings() {
    return '<section class="screen"><div class="head"><h2>إعدادات سين جيم</h2><button class="btn ghost" data-a="home">الصفحة الأولى</button></div><div class="scroll"><div class="panel" style="display:grid;gap:12px;max-width:760px;margin:0 auto">' +
      '<label class="toggle"><input type="checkbox" data-a="sfx"' + (settings.sound ? " checked" : "") + '><span>🔊 المؤثرات الصوتية</span></label>' +
      '<label class="toggle"><input type="checkbox" data-a="mus"' + (settings.music ? " checked" : "") + '><span>🎵 موسيقى خلفية</span></label>' +
      '<button class="btn big" data-a="editor">✏️ إدارة الأسئلة والفئات (' + allQ().length + " سؤالاً، " + allCats().length + " فئة)</button>" +
      '<button class="btn" data-a="resetused">' + (armed === "used" ? "اضغط مرة ثانية للتأكيد" : "♻️ تصفير سجل الأسئلة التي لُعبت") + "</button>" +
      '<p class="hint">سجل الأسئلة هو ما يجعل كل مباراة تختار أسئلة جديدة؛ تصفيره يسمح بظهورها من جديد.</p></div></div></section>';
  }
  function vEditor() {
    var cats = allCats(), list = allQ().filter(function (q) { return edCat === "all" || q.c === edCat; });
    var isC = function (id) { return custom.q.some(function (x) { return x.id === id; }); };
    var ed = edId ? custom.q.filter(function (x) { return x.id === edId; })[0] : null;
    var rows = list.map(function (q) {
      var mine = isC(q.id);
      return '<div class="edrow"><span class="tag">' + esc(catOf(q.c).name) + '</span><span class="tag">' + q.p + "</span><span>" + esc(q.q) + "</span><span><b>" + esc(q.a) + "</b></span>" +
        (mine ? '<span><button class="btn sm" data-a="edit" data-v="' + esc(q.id) + '">✏️</button> <button class="btn sm bad" data-a="deleteq" data-v="' + esc(q.id) + '">' + (armed === "q" + q.id ? "تأكيد؟" : "✕") + "</button></span>" : '<span class="tag">أساسي</span>') + "</div>";
    }).join("");
    return '<section class="screen"><div class="head"><h2>إدارة الأسئلة</h2><button class="btn ghost" data-a="settings">رجوع للإعدادات</button></div>' +
      '<div class="panel" style="display:grid;gap:10px"><div class="edform"><div class="field"><span class="lbl">الفئة</span><select id="ed-c">' + cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + ((ed ? ed.c : (edCat !== "all" ? edCat : "")) === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + '</select></div>' +
      '<div class="field"><span class="lbl">القيمة</span><select id="ed-p">' + [200, 400, 600].map(function (p) { return '<option value="' + p + '"' + (ed && ed.p === p ? " selected" : "") + ">" + p + "</option>"; }).join("") + '</select></div>' +
      '<div class="field"><span class="lbl">السؤال</span><input type="text" id="ed-q" maxlength="200" value="' + esc(ed ? ed.q : "") + '"></div><div class="field"><span class="lbl">الجواب (قصير وواضح)</span><input type="text" id="ed-a" maxlength="80" value="' + esc(ed ? ed.a : "") + '"></div>' +
      '<button class="btn go" data-a="saveq">' + (ed ? "حفظ التعديل" : "➕ إضافة") + "</button></div>" +
      '<div class="edform"><div class="field"><span class="lbl">فئة جديدة (الاسم)</span><input type="text" id="nc-n" maxlength="26"></div><div class="field"><span class="lbl">رمز</span><input type="text" id="nc-i" maxlength="4" value="📚"></div><div></div><div></div><button class="btn" data-a="addcat">➕ إضافة فئة</button></div>' +
      '<div class="row" style="justify-content:flex-start"><button class="btn" data-a="share"' + (custom.q.length || custom.cats.length ? "" : " disabled") + '>📤 شارك أسئلتكم (' + custom.q.length + ')</button><button class="btn" data-a="import">📥 أضف حزمة أسئلة</button></div>' +
      (edMsg ? '<p class="err" role="status">' + esc(edMsg) + "</p>" : "") +
      '<div class="field"><span class="lbl">عرض</span><select id="ed-f"><option value="all">كل الفئات</option>' + cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (edCat === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="scroll panel">' + (rows || '<p class="hint">لا أسئلة.</p>') + "</div></section>";
  }

  function lifeHtml(t) { return '<div class="lf">' + E.LIFE.map(function (k) { var used = G.state.teams[t].life[k]; return '<span class="l' + (used ? " used" : "") + '">' + { two: "②", call: "📞", dbl: "×2" }[k] + " " + E.LIFE_NAME[k] + "</span>"; }).join("") + "</div>"; }
  function teamCard(t) {
    var S = G.state, tm = S.teams[t], on = S.turn === t && S.phase !== "end", g = gain && gain.team === t;
    return '<div class="tc' + (on ? " on" : "") + (g ? " gain" : "") + '" style="--c:' + TCOL[t] + '"><div><div class="nm">' + esc(tm.name) + '<span class="turn">🎯 الدور</span></div>' + lifeHtml(t) + '</div><div class="sc">' + tm.score + "</div>" + (g ? '<span class="plus">+' + gain.pts + "</span>" : "") + "</div>";
  }
  function vBoard() {
    var S = G.state, h = S.cats.map(function (id) { var c = catOf(id); return '<div class="ch"><i>' + c.icon + "</i>" + esc(c.name) + "</div>"; }).join(""), cells = "";
    for (var r = 0; r < 6; r++) for (var ci = 0; ci < 6; ci++) {
      var i = ci * 6 + r, c = S.cells[i];
      cells += '<button class="cell p' + c.p + (c.st ? " t" + (c.by < 0 ? "x" : c.by) : "") + (i === fi && !c.st ? " sel" : "") + '" data-a="pick" data-i="' + i + '"' + (c.st ? ' disabled data-mark="' + (c.by < 0 ? "✖" : "✔") + '"' : "") + ' aria-label="' + esc(catOf(c.c).name) + " " + c.p + (c.st ? " (مُجاب)" : "") + '">' + c.p + "</button>";
    }
    return '<div class="board">' + h + cells + "</div><p class=\"hintline\">دور " + esc(S.teams[S.turn].name) + " في اختيار الفئة والقيمة · المتبقي " + G.remaining() + " سؤالاً</p>";
  }
  function vQuestion() {
    var S = G.state, cur = S.cur, c = S.cells[cur.i], turn = S.turn, tm = S.teams[turn], rv = cur.revealed;
    var total = T.call ? 30000 : S.time * 1000, left = T.call ? T.callLeft : T.left;
    var life = E.LIFE.map(function (k) { return '<button class="btn sm' + (k === "dbl" ? " gold" : "") + '" data-a="life" data-v="' + k + '"' + (G.canUse(k) ? "" : " disabled") + ">" + { two: "②", call: "📞", dbl: "×2" }[k] + " " + E.LIFE_NAME[k] + "</button>"; }).join("");
    var foot;
    if (!rv) {
      foot = '<div class="qf">' + life + "</div><div class=\"qf\">" +
        (cur.twoBy >= 0 && cur.attempt === 1 ? '<button class="btn bad" data-a="wrong">✘ المحاولة الأولى خاطئة</button>' : "") +
        '<button class="btn huge gold" data-a="reveal">👁 كشف الإجابة</button>' +
        '<button class="btn" data-a="pause"' + (T.call || T.left <= 0 ? " disabled" : "") + ">" + (T.running ? "⏸ إيقاف الوقت" : "▶ استئناف") + "</button>" +
        (cur.twoBy < 0 && cur.dblBy < 0 && !cur.callUsed ? '<button class="btn" data-a="cancel">↩ رجوع للّوحة</button>' : "") + "</div>";
    } else {
      foot = '<div class="qf"><span class="lbl">من فاز بالسؤال؟</span><button class="btn huge tb0" data-a="award" data-v="0">' + esc(S.teams[0].name) + '</button><button class="btn huge tb1" data-a="award" data-v="1">' + esc(S.teams[1].name) + '</button><button class="btn huge" data-a="award" data-v="-1">لا أحد</button></div>';
    }
    var tstate = T.left <= 0 && !rv && !T.call ? '<b style="color:#b91c1c">⏰ انتهى الوقت</b>' : "";
    return '<div class="q' + (cur.dblBy >= 0 ? " dbl" : "") + (rv ? " rv" : "") + '" role="dialog" aria-label="السؤال"><div class="qh"><span class="cat">' + catOf(c.c).icon + " " + esc(catOf(c.c).name) + " — دور " + esc(tm.name) + "</span>" +
      (cur.dblBy >= 0 ? '<span class="x2">×2 دبل</span>' : "") + (cur.twoBy >= 0 ? '<span class="att">المحاولة ' + cur.attempt + " من 2</span>" : "") + '<span class="val">' + c.p + "</span></div>" +
      '<div class="qb"><div class="qt">' + esc(c.q) + "</div>" + (rv ? '<div class="ans"><small>الإجابة</small>' + esc(c.a) + "</div>" : "") +
      (!rv ? '<div class="timer"><div class="ring' + (T.call ? " call" : "") + '" id="ring" style="--p:' + Math.max(0, left / total).toFixed(3) + '"><b id="tnum">' + Math.max(0, Math.ceil(left / 1000)) + "</b></div>" + tstate + "</div>" : "") +
      (T.call ? '<div class="callban">📞 اتصال بصديق — <span id="callsec">' + Math.ceil(T.callLeft / 1000) + '</span> ثانية <button class="btn sm" data-a="callend">إنهاء الاتصال</button></div>' : "") + "</div>" + foot + "</div>";
  }
  function vEnd() {
    var S = G.state, st = G.stats(), w = st.winner, tn = function (t) { return esc(S.teams[t].name); };
    var best = [0, 1].map(function (t) { var b = st.best[t]; return b ? tn(t) + ": أعلى سؤال فاز به «" + esc(catOf(b.c).name) + "» بـ " + b.pts + " نقطة" + (b.dblWon ? " (دبل)" : "") : null; }).filter(Boolean);
    var hl = best.concat([0, 1].map(function (t) { return st.streak[t] > 1 ? tn(t) + ": أطول سلسلة إجابات صحيحة متتالية " + st.streak[t] : null; }).filter(Boolean),
      [0, 1].map(function (t) { return st.dblWins[t] ? tn(t) + ": كسب الدبل " + st.dblWins[t] + " مرة" : null; }).filter(Boolean),
      [tn(0) + " استخدم " + st.lifeUsed[0] + " من 3 وسائل، و" + tn(1) + " استخدم " + st.lifeUsed[1]]);
    var title = w < 0 ? "تعادل! 🤝" : "الفائز: " + tn(w) + " 🏆";
    return '<div class="win"><div class="trophy" aria-hidden="true">' + (w < 0 ? "🤝" : "🏆") + '</div><div class="txt"><h2 style="' + (w >= 0 ? "color:" + TCOL[w] + ";text-shadow:2px 2px 0 var(--ink)" : "") + '">' + title + "</h2>" +
      '<div class="stat"><span class="h">الفريق</span><span class="h">النقاط</span><span class="h">إجابات صحيحة</span><span>' + tn(0) + "</span><b>" + st.scores[0] + "</b><b>" + st.correct[0] + "</b><span>" + tn(1) + "</span><b>" + st.scores[1] + "</b><b>" + st.correct[1] + "</b></div>" +
      '<p style="font-weight:800">أسئلة لم يُجب عنها أحد: ' + st.unanswered + ' من 36</p><div class="hl"><b>أبرز لحظات المباراة</b>' + hl.map(function (x) { return "<span>" + x + "</span>"; }).join("") + "</div>" +
      '<div class="btns"><button class="btn huge go" data-a="rematch">إعادة المباراة بأسئلة جديدة</button><button class="btn big" data-a="home">القائمة الرئيسية</button></div></div></div>';
  }
  function vPlay() {
    var S = G.state, end = S.phase === "end";
    var top = '<div class="topbar"><div class="grp"><button class="btn sm" data-a="home">→ رجوع</button></div><div class="grp">' +
      '<button class="btn sm" data-a="sfx2" aria-pressed="' + settings.sound + '">' + (settings.sound ? "🔊" : "🔇") + '</button><button class="btn sm" data-a="mus2" aria-pressed="' + settings.music + '">' + (settings.music ? "🎵" : "🎶") + '</button>' +
      '<button class="btn sm" data-a="fs">⛶</button>' + (Net ? '<button class="btn sm" data-a="qr">📱 تحكم بالجوال</button>' : "") + (end ? "" : '<button class="btn sm bad" data-a="quit">✕ إنهاء</button>') + "</div></div>";
    return '<section class="screen play">' + top + '<div class="teams">' + teamCard(0) + teamCard(1) + '</div><div class="stage">' + (end ? vEnd() : vBoard() + (S.phase === "q" ? vQuestion() : "")) + "</div></section>";
  }
  function vModal() {
    if (!modal) return "";
    if (modal === "quit") return '<div class="modal"><div class="box" role="dialog"><h2>إنهاء المباراة؟</h2><p>ستظهر النتيجة الحالية ويُعلن الفائز.</p><div class="row"><button class="btn bad big" data-a="quityes">نعم، أنهِ المباراة</button><button class="btn big" data-a="close">لا، تابع اللعب</button></div></div></div>';
    if (modal === "qr") {
      var url = joinUrl(), n = Object.keys(roster).length;
      return '<div class="modal"><div class="box" role="dialog"><h2>📱 تحكم من الجوال</h2><div class="qr">' + qrSvg(url) + '</div><div class="url">' + esc(url) + '</div><p id="net">' + netText() + " · الجوالات المتصلة: " + n + '</p><p class="hint">اختياري: من الجوال تقدر تختار الأسئلة وتكشف الإجابة وتحتسب النقاط، والتلفزيون يبقى للعرض.</p><button class="btn big" data-a="close">تم</button></div></div>';
    }
    if (modal === "share") {
      var link = packLink();
      return '<div class="modal"><div class="box" role="dialog"><h2>📤 شارك أسئلتكم</h2><p>أرسلوا هذا الرابط لأي عائلة. لما يفتحونه تنضاف أسئلتكم (' + custom.q.length + " سؤال" + (custom.cats.length ? " و" + custom.cats.length + " فئة" : "") + ') عندهم.</p>' +
        '<textarea id="pk-out" readonly rows="4" style="width:100%;direction:ltr;font:12px monospace">' + esc(link) + '</textarea><div class="row"><button class="btn go big" data-a="copypack">📋 نسخ الرابط</button><button class="btn big" data-a="close">إغلاق</button></div>' + (edMsg ? '<p role="status">' + esc(edMsg) + "</p>" : "") + "</div></div>";
    }
    if (modal === "import") {
      return '<div class="modal"><div class="box" role="dialog"><h2>📥 أضف حزمة أسئلة</h2><p>الصقوا الرابط أو الرمز اللي وصلكم.</p><textarea id="pk-in" rows="4" style="width:100%;direction:ltr;font:12px monospace">' + esc(pendingPack || "") + '</textarea>' +
        (packMsg ? '<p class="err" role="status">' + esc(packMsg) + "</p>" : "") + '<div class="row"><button class="btn go big" data-a="dopack">إضافة</button><button class="btn big" data-a="close">إلغاء</button></div></div></div>';
    }
    return "";
  }

  /* مشاركة حزم الأسئلة: الأسئلة والفئات المضافة تتحول لرمز داخل رابط؛ اللي يفتح الرابط تنضاف عنده (بدون تكرار) */
  var pendingPack = "", packMsg = "";
  function packCode() {
    var json = JSON.stringify({ v: 1, cats: custom.cats.map(function (c) { return { id: c.id, name: c.name, icon: c.icon }; }), q: custom.q.map(function (x) { return { c: x.c, p: x.p, q: x.q, a: x.a }; }) });
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function packLink() { return location.href.split("#")[0].split("?")[0] + "#pack=" + packCode(); }
  function readPack(txt) {
    var code = String(txt || "").trim(), m = code.match(/#pack=([A-Za-z0-9_-]+)/); if (m) code = m[1];
    code = code.replace(/-/g, "+").replace(/_/g, "/"); while (code.length % 4) code += "=";
    var obj = JSON.parse(decodeURIComponent(escape(atob(code))));
    if (!obj || !Array.isArray(obj.q)) throw new Error("bad");
    return obj;
  }
  function importPack(txt) {
    var obj; try { obj = readPack(txt); } catch (e) { packMsg = "الرمز غير صحيح أو ناقص. تأكدوا إنكم نسختوا الرابط كامل."; return false; }
    var known = {}; allCats().forEach(function (c) { known[c.id] = 1; });
    var addedC = 0; (obj.cats || []).forEach(function (c) { if (c && typeof c.id === "string" && typeof c.name === "string" && !known[c.id]) { custom.cats.push({ id: c.id.slice(0, 30), name: c.name.slice(0, 26), icon: String(c.icon || "📚").slice(0, 4) }); known[c.id] = 1; addedC++; } });
    var have = {}; allQ().forEach(function (x) { have[x.q.trim()] = 1; });
    var addedQ = 0; obj.q.forEach(function (x) {
      if (!x || typeof x.q !== "string" || typeof x.a !== "string" || !known[x.c] || [200, 400, 600].indexOf(+x.p) < 0) return;
      var qq = x.q.trim().slice(0, 200), aa = x.a.trim().slice(0, 80); if (!qq || !aa || have[qq]) return;
      custom.q.push({ id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 9999), c: x.c, p: +x.p, q: qq, a: aa }); have[qq] = 1; addedQ++;
    });
    saveCustom(); edMsg = "تمت إضافة " + addedQ + " سؤال" + (addedC ? " و" + addedC + " فئة" : "") + " من الحزمة."; packMsg = ""; return true;
  }

  var KEEP = "";
  function render() {
    var app = $("#app"), a = document.activeElement, keep = a && (a.id === "ed-q" || a.id === "ed-a" || a.id === "nc-n" || a.id === "nc-i" || a.id === "tn0" || a.id === "tn1") ? { id: a.id, v: a.value } : null;
    var body = view === "home" ? vHome() : view === "setup" ? vSetup() : view === "howto" ? vHowto() : view === "settings" ? vSettings() : view === "editor" ? vEditor() : vPlay();
    app.innerHTML = body + vModal(); gain = null;
    if (keep) { var el = $("#" + keep.id); if (el) { el.value = keep.v; el.focus(); } }
    if (view === "play" && G && G.state.phase === "board" && !modal) { var s = $(".cell.sel"); if (s) s.focus({ preventScroll: true }); }
    broadcast();
  }

  /* ---------- الغرفة والجوال ---------- */
  function newCode() { return "9" + String(10000 + Math.floor(Math.random() * 90000)); }
  function joinUrl() {
    var base = location.origin && location.origin !== "null" ? location.origin + location.pathname : location.href.split("?")[0].split("#")[0];
    var ps = qs.get("ps"), local = qs.get("local");
    return base + "?room=" + room + (ps ? "&ps=" + encodeURIComponent(ps) : "") + (local ? "&local=1" : "");
  }
  function qrSvg(text) { try { var q = window.qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (e) { return ""; } }
  function netText() { return { online: "🟢 الغرفة جاهزة", connecting: "🟡 جاري تجهيز الغرفة… (تأكد أن التلفزيون متصل بالإنترنت)", local: "🔵 وضع محلي" }[netStatus] || "🟡 …"; }
  function startNet() {
    if (net || !Net) return;
    if (!room) { room = Store.get(K.room, null) || newCode(); Store.set(K.room, room); }
    net = Net.host(room, { onMsg: onPhone, onStatus: function (st) { netStatus = st; var el = $("#net"); if (el) el.textContent = netText() + " · الجوالات المتصلة: " + Object.keys(roster).length; }, onConflict: function () { room = newCode(); Store.set(K.room, room); roster = {}; try { net.close(); } catch (e) {} net = null; startNet(); render(); } });
  }
  function viewFor() {
    var S = G ? G.state : null, v = { t: "state", names: settings.n0 ? [settings.n0, settings.n1] : [] };
    if (!G || !S) { v.phase = "idle"; return v; }
    v.names = [S.teams[0].name, S.teams[1].name]; v.phase = S.phase; v.turn = S.turn; v.scores = [S.teams[0].score, S.teams[1].score];
    v.cats = S.cats.map(function (id) { var c = catOf(id); return { n: c.name, i: c.icon }; });
    v.cells = S.cells.map(function (c) { return { p: c.p, st: c.st, by: c.by }; });
    v.life = [0, 1].map(function (t) { return E.LIFE.map(function (k) { return S.teams[t].life[k] ? 1 : 0; }); });
    if (S.cur) { var c = S.cells[S.cur.i]; v.cur = { i: S.cur.i, q: c.q, a: c.a, p: c.p, revealed: S.cur.revealed, attempt: S.cur.attempt, two: S.cur.twoBy >= 0, dbl: S.cur.dblBy >= 0, call: T.call, can: { two: G.canUse("two"), call: G.canUse("call"), dbl: G.canUse("dbl") }, left: T.call ? T.callLeft : T.left, running: T.running }; }
    if (S.phase === "end") v.win = G.winner();
    return v;
  }
  function broadcast() { if (!net) return; var v = viewFor(); Object.keys(roster).forEach(function (pid) { try { net.send(pid, v); } catch (e) {} }); }
  function onPhone(pid, m) {
    if (!m || !m.t) return;
    if (m.t === "hello" || m.t === "ping") { roster[pid] = { seen: Date.now() }; try { net.send(pid, viewFor()); } catch (e) {} var el = $("#net"); if (el) el.textContent = netText() + " · الجوالات المتصلة: " + Object.keys(roster).length; return; }
    if (!roster[pid]) { try { net.send(pid, { t: "who" }); } catch (e) {} return; }
    if (m.t !== "cmd" || view !== "play" || !G) return;
    var c = m.c;
    if (c === "pick") doPick(+m.i); else if (c === "reveal") doReveal(); else if (c === "award") doAward(+m.v); else if (c === "life") doLife(String(m.v));
    else if (c === "wrong") doWrong(); else if (c === "pause") doPause(); else if (c === "cancel") doCancel(); else if (c === "callend") doEndCall();
  }

  /* ---------- الأحداث ---------- */
  function act(a, el) {
    var v = el && el.getAttribute("data-v");
    switch (a) {
      case "home": view = "home"; armed = ""; render(); break;
      case "setup": view = "setup"; setupErr = ""; render(); break;
      case "howto": view = "howto"; render(); break;
      case "settings": view = "settings"; armed = ""; render(); break;
      case "editor": view = "editor"; edId = null; edMsg = ""; render(); break;
      case "resume": resume(); break;
      case "start": case "rematch": collectTeams(); saveSettings(); if (a === "rematch") { view = "setup"; startNew(); } else startNew(); break;
      case "time": collectTeams(); settings.time = +v; saveSettings(); render(); break;
      case "diff": collectTeams(); settings.diff = v; saveSettings(); render(); break;
      case "cat":
        collectTeams(); var i = settings.cats.indexOf(v);
        if (i >= 0) settings.cats.splice(i, 1); else if (settings.cats.length < 6) settings.cats.push(v); else { toast("الحد الأقصى 6 فئات — ألغِ فئة أولاً"); break; }
        setupErr = ""; saveSettings(); render(); break;
      case "rand": collectTeams(); settings.cats = E.shuffle(allCats().filter(function (c) { return !missing(c.id).length; }), Math.random).slice(0, 6).map(function (c) { return c.id; }); setupErr = ""; saveSettings(); A.play("tap"); render(); break;
      case "clear": collectTeams(); settings.cats = []; saveSettings(); render(); break;
      case "up": case "down": collectTeams(); var k = +v, j = a === "up" ? k - 1 : k + 1; if (j >= 0 && j < settings.cats.length) { var t = settings.cats[k]; settings.cats[k] = settings.cats[j]; settings.cats[j] = t; saveSettings(); render(); } break;
      case "pick": doPick(+el.getAttribute("data-i")); break;
      case "reveal": doReveal(); break;
      case "award": doAward(+v); break;
      case "life": doLife(v); break;
      case "wrong": doWrong(); break;
      case "pause": doPause(); break;
      case "cancel": doCancel(); break;
      case "callend": doEndCall(); break;
      case "quit": modal = "quit"; render(); break;
      case "quityes": doEnd(); break;
      case "close": modal = null; render(); break;
      case "qr": startNet(); modal = "qr"; render(); break;
      case "sfx2": settings.sound = !settings.sound; A.enable(settings.sound); saveSettings(); render(); break;
      case "mus2": settings.music = !settings.music; A.music(settings.music); saveSettings(); render(); break;
      case "fs": try { if (!document.fullscreenElement) { var pr = document.documentElement.requestFullscreen(); if (pr && pr.catch) pr.catch(function () {}); } else document.exitFullscreen(); } catch (e) {} break;
      case "resetused":
        if (armed === "used") { Store.set(K.used, {}); armed = ""; toast("تم تصفير السجل"); } else { armed = "used"; setTimeout(function () { if (armed === "used") { armed = ""; if (view === "settings") render(); } }, 4000); }
        render(); break;
      case "saveq": saveQuestion(); break;
      case "edit": edId = v; edMsg = ""; render(); break;
      case "deleteq":
        if (armed === "q" + v) { custom.q = custom.q.filter(function (x) { return x.id !== v; }); saveCustom(); armed = ""; if (edId === v) edId = null; } else { armed = "q" + v; setTimeout(function () { if (armed === "q" + v) { armed = ""; if (view === "editor") render(); } }, 3000); }
        render(); break;
      case "addcat": addCategory(); break;
      case "share": edMsg = ""; modal = "share"; render(); break;
      case "copypack": try { var ta = $("#pk-out"); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function () {}); edMsg = "انتسخ الرابط ✔"; } catch (e) {} render(); break;
      case "import": pendingPack = ""; packMsg = ""; modal = "import"; render(); break;
      case "dopack": var tin = $("#pk-in"); if (importPack(tin ? tin.value : "")) { modal = null; view = "editor"; } else pendingPack = tin ? tin.value : ""; render(); break;
    }
  }
  function collectTeams() { var a = $("#tn0"), b = $("#tn1"); if (a) settings.n0 = a.value.trim().slice(0, 18) || DEF.n0; if (b) settings.n1 = b.value.trim().slice(0, 18) || DEF.n1; }
  function saveQuestion() {
    var c = $("#ed-c").value, p = +$("#ed-p").value, q = $("#ed-q").value.trim(), a = $("#ed-a").value.trim();
    if (!q || !a) { edMsg = "اكتب السؤال والجواب."; render(); return; }
    if (allQ().some(function (x) { return x.q === q && x.id !== edId; })) { edMsg = "هذا السؤال موجود مسبقاً."; render(); return; }
    if (edId) { var it = custom.q.filter(function (x) { return x.id === edId; })[0]; if (it) { it.c = c; it.p = p; it.q = q; it.a = a; } edMsg = "تم حفظ التعديل."; }
    else { custom.q.push({ id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 99), c: c, p: p, q: q, a: a }); edMsg = "تمت الإضافة. (" + missing(c).length + " نقص متبقٍ في هذه الفئة)"; if (!missing(c).length) edMsg = "تمت الإضافة."; }
    edId = null; saveCustom(); render();
  }
  function addCategory() {
    var n = $("#nc-n").value.trim(), ic = $("#nc-i").value.trim() || "📚";
    if (!n) { edMsg = "اكتب اسم الفئة."; render(); return; }
    if (allCats().some(function (c) { return c.name === n; })) { edMsg = "اسم الفئة موجود."; render(); return; }
    custom.cats.push({ id: "c" + Date.now().toString(36), name: n, icon: ic.slice(0, 4) }); saveCustom(); edMsg = "تمت إضافة الفئة. أضف لها سؤالين على الأقل من كل قيمة (200/400/600) لتظهر في الاختيار."; render();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-a]"); if (!el) return;
    if (el.tagName === "INPUT") return;
    A.unlock(); act(el.getAttribute("data-a"), el);
  });
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.id === "ed-f") { edCat = el.value; render(); }
    else if (el.getAttribute && el.getAttribute("data-a") === "sfx") { settings.sound = el.checked; A.enable(settings.sound); saveSettings(); }
    else if (el.getAttribute && el.getAttribute("data-a") === "mus") { settings.music = el.checked; A.unlock(); A.music(settings.music); saveSettings(); }
    else if (el.id === "tn0" || el.id === "tn1") { collectTeams(); saveSettings(); }
  });
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (view !== "play" || !G || modal) return;
    var S = G.state, k = e.key;
    if (S.phase === "board") {
      var ci = Math.floor(Math.max(fi, 0) / 6), r = Math.max(fi, 0) % 6, ni = fi;
      // الاتجاه عكسي في RTL: السهم الأيمن = الفئة السابقة
      if (k === "ArrowRight") ci = (ci + 5) % 6; else if (k === "ArrowLeft") ci = (ci + 1) % 6; else if (k === "ArrowUp") r = (r + 5) % 6; else if (k === "ArrowDown") r = (r + 1) % 6;
      else if (k === "Enter" || k === " ") { var fe = document.activeElement, ti = fe && fe.classList && fe.classList.contains("cell") && fe.getAttribute("data-i") != null ? +fe.getAttribute("data-i") : fi; if (ti >= 0 && S.cells[ti] && !S.cells[ti].st) { e.preventDefault(); fi = ti; doPick(ti); } return; }
      else return;
      e.preventDefault(); ni = ci * 6 + r; fi = ni; render(); return;
    }
    if (S.phase !== "q") return;
    var rv = S.cur.revealed;
    if (k === " " || k === "Enter") { if (!rv) { e.preventDefault(); doReveal(); } }
    else if (!rv) {
      var l = k.toLowerCase();
      if (l === "d") doLife("dbl"); else if (l === "t") doLife("two"); else if (l === "c") doLife("call"); else if (l === "p") doPause(); else if (l === "w") doWrong(); else if (l === "escape") doCancel();
    } else {
      if (k === "1") doAward(0); else if (k === "2") doAward(1); else if (k === "0") doAward(-1);
    }
  });
  document.addEventListener("click", function () { if (settings.music) { A.unlock(); if (!A._m) { A._m = 1; A.music(true); } } }, { once: true });

  // اختبار/تشغيل مباشر: ?demo=1 يبدأ مباراة بإعدادات افتراضية
  // لو سبق ربط جوال بهذه الغرفة، نعيد فتح الغرفة تلقائياً بعد تحديث الصفحة عشان يرجع التحكم من الجوال
  try { if (Store.get(K.room, null) && Net) startNet(); } catch (e) {}
  // فتح رابط حزمة أسئلة: نعرض نافذة الإضافة مباشرة
  if (/^#pack=/.test(location.hash)) { pendingPack = location.hash; packMsg = ""; view = "editor"; modal = "import"; try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
  if (qs.get("start") === "1") { startNew(); } else render();
  window.SJ_TV = { get G() { return G; }, startNew: startNew, T: function () { return T; } };
})();
