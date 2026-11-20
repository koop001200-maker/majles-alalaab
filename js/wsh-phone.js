/* «وش الصح؟» — جوال اللاعب: وحدة تحكم بسيطة، كل شيء في شاشة واحدة. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  if (!params.has("room") && !params.has("join")) return; // this page is the TV
  document.body.classList.add("phone");
  var code = (params.get("room") || "").replace(/\D/g, "").slice(0, 6);
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var AV = window.WSH_AV;
  var AVATARS = ["@dabb", "@jerboa", "@dove", "@dukhal", "🦊", "🐪", "🦅", "🐱", "🐼", "🦁", "🐸", "🐙", "🦄", "🐧", "🐢", "🐝", "🦉", "🐬", "🐯", "🐨", "🐵", "🦒", "🐳", "🦜"];
  var me = Store.get("wsh_me_v1", null) || {};
  if (!me.pids) me.pids = {};
  // a separate identity per tab when testing several players in one browser
  if (params.get("p")) me = Object.assign({}, me, { pids: {}, name: "", tab: params.get("p") });
  var meKey = "wsh_me_v1" + (params.get("p") ? "_" + params.get("p") : "");
  if (params.get("p")) { var saved = Store.get(meKey, null); if (saved) me = saved; if (!me.pids) me.pids = {}; }
  function saveMe() { Store.set(meKey, me); }
  var pid = me.pids[code] || (me.pids[code] = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
  saveMe();

  var V = null, status = "connecting", joined = !!me.joined && me.joinedCode === code, net = null;
  var pick = "", draft = "", endsAt = 0, sending = false, kicked = false;

  function hello() { if (me.name && joined) net.send({ t: "hello", name: me.name, av: me.av || AVATARS[0] }); }

  function onMsg(m) {
    if (m.t === "kicked") { kicked = true; joined = false; me.joined = false; saveMe(); render(); return; }
    if (m.t === "who") { hello(); return; }
    if (m.t !== "state") return;
    var phaseChanged = !V || V.phase !== m.phase || V.round !== m.round;
    V = m; sending = false;
    if (phaseChanged) { pick = ""; if (m.phase !== "write") draft = ""; buzz(); }
    endsAt = m.paused ? 0 : Date.now() + (m.left || 0);
    status = "online";
    render();
  }

  var tstat = "connecting", startedAt = Date.now();
  function connect() {
    if (!code) return;
    net = window.WshNet.join(code, pid, {
      onMsg: onMsg,
      onOpen: hello,
      onStatus: function (s) { tstat = s; refreshStatus(); }
    });
    hello();
    // until the TV answers, keep saying hello; after that, a light ping keeps us listed as online
    setInterval(function () { if (joined) net.send(V ? { t: "ping" } : { t: "hello", name: me.name, av: me.av || AVATARS[0] }); refreshStatus(); }, 3000);
  }
  function computeStatus() {
    if (tstat === "offline") return "offline";
    var last = net ? net.lastHostMsg() : 0;
    if (!last) return joined && Date.now() - startedAt > 9000 && tstat === "online" ? "noroom" : "connecting";
    if (Date.now() - last > 12000) return "reconnecting";
    return "online";
  }
  function refreshStatus() { var s = computeStatus(); if (s !== status) { status = s; render(); } }
  function buzz() { try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} }

  /* ---------------- views ---------------- */
  function header() {
    if (!V) return "";
    var t = V.me.team ? '<span class="team" style="--c:' + V.me.team.color + '">' + V.me.team.icon + " " + V.me.team.name + "</span>" : "";
    return '<header class="me" style="--c:' + V.me.color + '"><span class="pav">' + AV(V.me.av) + '</span><b>' + esc(V.me.name) + "</b>" + t +
      '<span class="pts"><small>نقاطك</small>' + V.me.score + "</span></header>";
  }
  function timer() {
    if (!V || !V.total) return "";
    var left = V.paused ? V.left : Math.max(0, endsAt - Date.now());
    return '<div class="ptimer' + (left < 10000 ? " hot" : "") + '"><span style="width:' + Math.min(100, left / V.total * 100).toFixed(1) + '%"></span><b id="ptime">' + Math.ceil(left / 1000) + "</b></div>";
  }
  function vJoin() {
    var av = me.av || AVATARS[Math.floor(Math.random() * AVATARS.length)]; me.av = av;
    return '<section class="pjoin"><h1 class="title sm">وش <em>الصح؟</em></h1><p class="room">غرفة <b dir="ltr">' + esc(code) + "</b></p>" +
      '<form id="jf" autocomplete="off"><label>اسمك<input id="jn" maxlength="16" value="' + esc(me.name || "") + '" placeholder="مثلاً: أبو فهد" required></label>' +
      '<span class="label">اختر صورتك</span><div class="avs">' + AVATARS.map(function (a) { return '<button type="button" class="avb" data-av="' + a + '" aria-pressed="' + (a === av) + '" aria-label="' + (window.WSH_AVATARS[a] || a) + '">' + AV(a) + "</button>"; }).join("") + "</div>" +
      '<button class="btn go big" type="submit">ادخل اللعبة ▶</button></form>' + netLine() + "</section>";
  }
  function netLine() {
    var t = { connecting: "🟡 جاري الاتصال بالتلفزيون…", reconnecting: "🟡 انقطع الاتصال — جاري إعادة الاتصال…", noroom: "🔴 ما وصل رد من التلفزيون — تأكد أن «وش الصح؟» مفتوحة على التلفزيون وأن رمز الغرفة " + code + " هو نفسه الظاهر عليه", offline: "🔴 لا يوجد إنترنت" }[status];
    return t ? '<p class="pnet">' + t + "</p>" : "";
  }
  /* the TV picture on the phone: same content, drawn small */
  function chips(list, doneLabel) {
    if (!list || !list.length) return "";
    return '<div class="pwho">' + list.map(function (p) { return '<span class="pchip' + (p.done ? " done" : "") + '" style="--c:' + p.color + '">' + (p.icon ? esc(p.icon) : AV(p.av)) + " " + esc(p.name) + (p.done ? " ✓" : "") + "</span>"; }).join("") + "</div>" +
      (doneLabel ? '<p class="hint2">' + doneLabel + " " + list.filter(function (p) { return p.done; }).length + " من " + list.length + "</p>" : "");
  }
  function screenWho(sc, label) { return sc ? chips(sc.teams || sc.who, label) : ""; }
  function optList(opts) {
    return '<ol class="plist2">' + opts.map(function (x) {
      var st = x.stamp, cls = (x.spot ? " spot" : "") + (st ? (st.k === "ok" ? " truth" : " lie") : "");
      var stamp = !st ? "" : st.k === "ok" ? '<span class="pstamp ok">الحقيقة ✓</span>' : st.k === "house" ? '<span class="pstamp no">إجابة اللعبة 🤖</span>' :
        '<span class="pstamp no">كذبة ' + st.by.map(function (p) { return AV(p.av) + " " + esc(p.name); }).join(" و") + "</span>";
      var voters = x.voters && x.voters.length ? '<span class="pvoters">' + x.voters.map(function (v) { return '<i style="--c:' + v.color + '" title="' + esc(v.name) + '">' + AV(v.av) + "</i>"; }).join("") + "</span>" : "";
      return '<li class="pli' + cls + '"><span class="pn">' + x.n + '</span><span class="ptx">' + esc(x.text) + "</span>" + voters + stamp + "</li>";
    }).join("") + "</ol>";
  }
  function board(sc) {
    if (!sc || !sc.rows) return "";
    var top = Math.max(1, sc.rows[0] ? sc.rows[0].score : 1);
    return '<div class="pboard">' + sc.rows.map(function (r) {
      var mine = !r.icon && r.name === V.me.name;
      return '<div class="prow' + (mine ? " me2" : "") + '" style="--c:' + r.color + ";--w:" + (r.score / top * 100).toFixed(1) + '%"><span class="rk">' + r.rank + '</span><span class="nm">' + (r.icon ? esc(r.icon) : AV(r.av)) + " " + esc(r.name) +
        '</span><span class="track"><span class="fill"></span></span><span class="sc">' + r.score + "</span>" + (r.plus ? '<span class="plus">+' + r.plus + "</span>" : "") + "</div>";
    }).join("") + (sc.total > sc.rows.length ? '<p class="hint2">و' + (sc.total - sc.rows.length) + " لاعبين آخرين</p>" : "") + "</div>";
  }
  function award(a) { return '<div class="paward"><span>' + a.icon + "</span><div><small>" + esc(a.label) + "</small><b>" + AV(a.av) + " " + esc(a.name) + "</b><em>" + esc(a.val) + "</em></div></div>"; }

  function body() {
    var p = V.phase, sc = V.screen;
    if (V.paused) return '<div class="msg big">⏸<br>اللعبة متوقفة مؤقتاً</div>';
    if (p === "lobby") return '<div class="msg big">أنت داخل! 🎉<br><small>انتظر حتى يبدأ التلفزيون اللعبة</small></div><p class="label">اللاعبون (' + V.players + ")</p>" + screenWho(sc);
    if (p === "intro") return '<div class="msg big">استعد… 🥁<br><small>الجولة ' + V.round + " من " + V.rounds + " · " + esc(V.cat) + "</small>" + (V.mult > 1 ? '<br><b class="x2">النقاط ×2 🔥</b>' : "") + "</div>";
    if (p === "write") {
      if (V.wrote) return '<p class="pq">' + esc(V.q) + "</p>" + timer() + '<div class="msg ok">✓ ' + (V.mateLie ? "زميلك " + esc(V.mateLie) + " كتب كذبة الفريق" : "تم إرسال كذبتك") + '<br><b class="mylie">«' + esc(V.lie) + '»</b></div>' + screenWho(sc, "خلّص الكتابة:");
      return '<p class="pq">' + esc(V.q) + "</p>" + timer() + '<form id="lf" autocomplete="off"><label class="label" for="lie">اكتب إجابة مزيّفة تخدع فيها العائلة 😏</label>' +
        '<input id="lie" maxlength="40" value="' + esc(draft) + '" placeholder="إجابة تبدو صحيحة…" enterkeyhint="send">' +
        (V.err ? '<p class="perr">' + esc(V.err) + "</p>" : "") + '<button class="btn go big" type="submit"' + (sending ? " disabled" : "") + ">إرسال ✍️</button></form>" + screenWho(sc, "خلّص الكتابة:");
    }
    if (p === "read") return '<p class="pq sm">' + esc(V.q) + '</p><p class="label">اقرأ الإجابات 👀 التصويت يبدأ بعد لحظات</p>' + (sc && sc.opts ? optList(sc.opts) : "");
    if (p === "vote") {
      if (V.voted) { var o = (V.options || []).filter(function (x) { return x.id === V.voted; })[0]; return '<p class="pq sm">' + esc(V.q) + "</p>" + timer() + '<div class="msg ok">✓ تم تسجيل تصويتك<br><b class="mylie">«' + esc(o ? o.text : "") + '»</b></div>' + screenWho(sc, "صوّت:"); }
      if (!V.options || !V.options.length) return '<div class="msg">ما فيه إجابات تقدر تختارها هالمرة 😅</div>';
      return '<p class="pq sm">' + esc(V.q) + "</p>" + timer() + '<p class="label">وش الصح؟ اختر الإجابة الصحيحة:</p><div class="popts' + (V.options.length > 6 ? " two" : "") + '">' +
        V.options.map(function (x) { return '<button class="popt" data-opt="' + esc(x.id) + '" aria-pressed="' + (pick === x.id) + '"><span class="pn">' + (x.n || "") + "</span>" + esc(x.text) + "</button>"; }).join("") + "</div>" +
        '<button class="btn go big" id="confirm"' + (pick && !sending ? "" : " disabled") + ">تأكيد التصويت ✓</button><p class=\"hint2\">ما تقدر تغيّر صوتك بعد التأكيد</p>";
    }
    if (p === "reveal") {
      if (!sc || !sc.opts) return '<div class="msg big">📺 لحظة كشف الحقيقة…</div>';
      return (V.q ? '<p class="pq sm">' + esc(V.q) + "</p>" : "") + '<div class="pcap' + (sc.truth ? " ok" : "") + '">' + esc(sc.cap) + "</div>" + optList(sc.opts) + (sc.note ? '<p class="pnote">💡 ' + esc(sc.note) + "</p>" : "");
    }
    if (p === "scores") {
      var mine = '<div class="msg sm2">' + (V.got ? "+" + V.got + " هالجولة 🎉" : "ولا نقطة هالجولة 😅") + (V.gotTruth || V.gotFool ? "<br><small>" + (V.gotTruth ? "عرفت الحقيقة +" + V.gotTruth : "") + (V.gotTruth && V.gotFool ? " · " : "") + (V.gotFool ? "خدعت غيرك +" + V.gotFool : "") + "</small>" : "") + "</div>";
      var best = sc && sc.best ? award({ icon: "😈", label: "أكبر مخادع في الجولة", av: sc.best.av, name: sc.best.name, val: "عدد المخدوعين: " + sc.best.fooled }) : "";
      return mine + best + '<p class="label">الترتيب بعد الجولة ' + V.round + "</p>" + board(sc);
    }
    if (p === "final") {
      return '<div class="msg sm2">' + (V.me.rank === 1 ? "🏆 أنت البطل!" : "انتهت اللعبة 👏") + "<br><small>مجموعك " + V.me.score + " · ترتيبك " + V.me.rank + " من " + V.players + "</small></div>" +
        (sc && sc.awards ? sc.awards.map(award).join("") : "") + '<p class="label">النتيجة النهائية</p>' + board(sc);
    }
    return "";
  }
  function render() {
    var html;
    if (!code) html = '<section class="pjoin"><h1 class="title sm">وش <em>الصح؟</em></h1><form id="cf"><label>اكتب رمز الغرفة الظاهر على التلفزيون<input id="cc" inputmode="numeric" maxlength="6" dir="ltr"></label><button class="btn go big">دخول</button></form></section>';
    else if (kicked) html = '<div class="msg big">أُزلت من الغرفة 🙏<br><small>اطلب من صاحب التلفزيون إضافتك من جديد</small></div><button class="btn big" id="rejoin">دخول من جديد</button>';
    else if (!joined || !me.name) html = vJoin();
    else if (!V) html = '<div class="msg big">📡<br>جاري الاتصال بالتلفزيون…</div>' + netLine();
    else html = header() + '<main class="pbody">' + body() + "</main>" + netLine();
    var ae = document.activeElement, keepLie = ae && ae.id === "lie";
    if (keepLie) draft = ae.value;
    $("#app").innerHTML = html;
    if (keepLie) { var li = $("#lie"); if (li) { li.focus(); li.setSelectionRange(li.value.length, li.value.length); } }
  }
  setInterval(function () { var t = $("#ptime"); if (t && V && !V.paused) { var left = Math.max(0, endsAt - Date.now()); t.textContent = Math.ceil(left / 1000); t.parentElement.querySelector("span").style.width = Math.min(100, left / V.total * 100).toFixed(1) + "%"; t.parentElement.classList.toggle("hot", left < 10000); } }, 250);

  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.av) { me.av = b.dataset.av; saveMe(); document.querySelectorAll(".avb").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); return; }
    if (b.dataset.opt) { pick = b.dataset.opt; render(); return; }
    if (b.id === "confirm" && pick) { sending = true; net.send({ t: "vote", opt: pick }); buzz(); render(); return; }
    if (b.id === "rejoin") { kicked = false; render(); }
  });
  document.addEventListener("input", function (e) { if (e.target.id === "lie") draft = e.target.value; });
  document.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id === "cf") { var c = $("#cc").value.replace(/\D/g, ""); if (c.length >= 4) location.search = "?room=" + c + (params.get("ps") ? "&ps=" + encodeURIComponent(params.get("ps")) : "") + (params.get("local") ? "&local=1" : ""); return; }
    if (e.target.id === "jf") {
      var n = $("#jn").value.replace(/\s+/g, " ").trim(); if (!n) return;
      me.name = n.slice(0, 16); me.joined = true; me.joinedCode = code; joined = true; saveMe();
      try { document.activeElement.blur(); } catch (er) {}
      hello(); render(); return;
    }
    if (e.target.id === "lf") {
      var t = $("#lie").value.trim(); if (!t) return;
      sending = true; draft = t; net.send({ t: "lie", text: t }); buzz(); render();
      setTimeout(function () { if (sending) { sending = false; render(); } }, 3000);
    }
  });

  window.WSH_PHONE = { state: function () { return V; } };
  render(); if (code) connect();
})();
