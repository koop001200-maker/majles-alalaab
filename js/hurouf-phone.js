/* «حروف وألوف» — جوال اللاعب/المقدم: الجرس الكبير أو لوحة تحكم المقدم. */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  if (!qs.has("room")) return; // هذه الصفحة التلفزيون
  document.body.classList.add("phone");
  var Net = window.WshNet, A = window.HU_AUDIO;
  var code = (qs.get("room") || "").replace(/\D/g, "").slice(0, 7);
  function tc(hex) { var h = String(hex).replace("#", ""), r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111827" : "#ffffff"; }
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var Store = { get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var tab = qs.get("p") ? "_" + qs.get("p") : "";
  var me = Store.get("hu_me_v1" + tab, {}) || {};
  if (!me.pids) me.pids = {};
  var pid = me.pids[code] || (me.pids[code] = "h" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4));
  function saveMe() { Store.set("hu_me_v1" + tab, me); }
  saveMe();

  var V = null, joined = !!(me.joinedCode === code && me.name), net = null, tstat = "connecting", ack = "", lockedUntil = 0, endsAt = 0, typed = "", app = $("#app");
  var colors = ["#3b82f6", "#f97316"], names = ["الفريق الأول", "الفريق الثاني"];

  function hello() { if (me.name && joined) net.send({ t: "hello", name: me.name, team: me.team || 0, role: me.role || "player" }); }
  function onMsg(m) {
    if (m.t === "who") { hello(); return; }
    if (m.t === "full") { joined = false; me.joinedCode = ""; saveMe(); ack = "الفريق ممتلئ"; render(); return; }
    if (m.t === "ack") { ack = m.res === "ok" ? "🔔 أنت الأول!" : m.res === "early" ? "🚫 مبكّر! انتظر" : m.res === "spam" ? "" : "⏱ متأخر"; if (m.res === "ok" && navigator.vibrate) navigator.vibrate(120); render(); setTimeout(function () { ack = ""; render(); }, 1600); return; }
    if (m.t !== "state") return;
    var changed = !V || V.phase !== m.phase;
    V = m; if (m.colors) colors = m.colors; if (m.names) names = m.names;
    endsAt = m.paused || m.phase !== "answering" ? 0 : Date.now() + (m.left || 0);
    if (changed) { typed = ""; if (m.phase === "open" && navigator.vibrate) navigator.vibrate(30); }
    render();
  }
  function connect() {
    if (!code) return;
    net = Net.join(code, pid, { onMsg: onMsg, onOpen: hello, onStatus: function (s) { tstat = s; var el = $(".pnet"); if (el) el.textContent = tstat === "online" ? "🟢" : "🟡 جاري الاتصال…"; } });
    hello();
    setInterval(function () { if (joined) net.send(V ? { t: "ping" } : { t: "hello", name: me.name, team: me.team || 0, role: me.role || "player" }); }, 3000);
  }

  function vJoin() {
    return '<section class="pbuzz"><h1 style="font-weight:900;font-size:2em;margin:0">حروف وألوف</h1><p class="sub" style="color:var(--muted)">غرفة <b dir="ltr">' + esc(code) + '</b></p>' +
      '<div class="ptype"><input id="nm" maxlength="14" placeholder="اسمك" value="' + esc(me.name || "") + '" autocomplete="off"></div>' +
      '<div class="pteam"><button class="btn" style="--c:' + colors[0] + ';color:' + tc(colors[0]) + '" data-j="0:player">انضم إلى ' + esc(names[0]) + '</button><button class="btn" style="--c:' + colors[1] + ';color:' + tc(colors[1]) + '" data-j="1:player">انضم إلى ' + esc(names[1]) + '</button><button class="btn" style="--c:#a855f7" data-j="0:host">🎤 أنا المقدم</button></div>' +
      '<p class="pstat" id="jerr" style="color:#fca5a5">' + esc(ack) + "</p></section>";
  }
  function vPlayer() {
    var t = me.team || 0, c = colors[t], ph = V ? V.phase : "idle", can = V && V.canBuzz && Date.now() >= lockedUntil;
    var stat = !V ? "بانتظار التلفزيون…" : { idle: "بانتظار المباراة…", board: V.turn === t ? "🎯 دوركم — اختاروا حرفاً من التلفزيون" : "دور المنافس في اختيار الحرف", ready: "جاهزين… 🔔", open: V.canBuzz ? "اضغط الجرس!" : "الفرصة للمنافس", answering: V.buzz ? (V.buzz.mine ? "🔔 دورك تجاوب!" : V.buzz.team === t ? "🔔 زميلك يجاوب" : "المنافس يجاوب") : "", judge: "الحكم يقرر…", result: V.result ? (V.result.ok ? (V.result.team === t ? "✔ الخلية لفريقكم!" : "✔ الخلية للمنافس") : "ما أحد أصاب") : "", roundwin: "🎉 انتهت الجولة", matchwin: "🏆 انتهت المباراة" }[ph] || "";
    var letter = V && V.letter && ["ready", "open", "answering", "judge"].indexOf(ph) >= 0 ? '<div style="font-size:3em;font-weight:900">حرف «' + esc(V.letter) + "»</div>" : "";
    var priv = "";
    if (V && V.canDone) priv = '<button class="btn gold big" data-a="done">✔ انتهيت من الإجابة</button>';
    if (V && V.canPeek) priv = '<button class="btn big" data-a="peek">👁 اكشف الإجابة لي (أنا بس)</button>';
    if (V && V.selfJudge && V.a) priv = '<div class="pq"><div class="pstat">الإجابة (لك فقط)</div><div class="ans">' + esc(V.a) + '</div></div><div class="pteam"><button class="btn good" data-a="selfok">✔ أجبت صح</button><button class="btn bad" data-a="selfno">✘ أخطأت</button></div>';
    var typeBox = V && V.canType ? '<div class="ptype"><input id="tp" maxlength="40" placeholder="اكتب إجابتك (اختياري)" value="' + esc(typed) + '" autocomplete="off"><button class="btn gold" data-a="send">إرسال</button></div>' + (V.typed ? '<p class="pstat">' + (V.typed.ok ? "✅ مطابقة" : "❌ لا تطابق") + "</p>" : "") : "";
    return '<section class="pbuzz" style="--c:' + c + ';--tc:' + tc(c) + '"><div class="pstat">' + esc(me.name) + " — " + esc(names[t]) + "</div>" + letter +
      '<button class="pbtn" id="buzz" ' + (can ? "" : "disabled") + '>🔔<br>جرس</button><div class="pstat">' + esc(ack || stat) + '</div>' + typeBox + priv + '<button class="btn sm ghost" data-a="leave">تغيير الاسم/الفريق</button></section>';
  }
  function vHost() {
    var ph = V ? V.phase : "idle", has = V && V.q;
    var h = '<section class="pbuzz"><div class="pstat">🎤 المقدم — ' + esc(me.name) + "</div>";
    if (!V || ph === "idle") h += '<p class="pstat">بانتظار المباراة…</p>';
    else if (ph === "board") h += '<p class="pstat">الدور على ' + esc(names[V.turn]) + " — بانتظار اختيار حرف</p>";
    else if (has) {
      h += '<div class="pq"><div class="pstat">حرف «' + esc(V.letter) + "» — " + (V.buzz ? esc(V.buzz.name || names[V.buzz.team]) + " ضغط" : ph === "open" ? "الجرس مفتوح" : "جاهزين") + '</div><div class="qt">' + esc(V.q) + '</div><div class="ans">✔ ' + esc(V.a) + "</div>" + (V.typedHint ? '<div class="pstat">⌨️ كتب: ' + esc(V.typedHint.text) + (V.typedHint.ok ? " ✅" : " ❌") + "</div>" : "") + "</div>";
      h += '<div class="pteam">' + (ph === "answering" ? '<button class="btn gold" data-c="reveal">✔ انتهت إجابة الفريق</button>' : "") +
        (ph === "answering" || ph === "judge" ? '<button class="btn good" data-c="correct">✔ صحيحة</button><button class="btn bad" data-c="wrong">✘ خاطئة</button>' : "") +
        (ph === "result" || ph === "roundwin" ? '<button class="btn go" data-c="next">التالي ▶</button>' : "") +
        '<button class="btn" data-c="skip">⏭ سؤال بديل</button><button class="btn" data-c="pause">⏸ إيقاف/استئناف</button></div>';
    }
    return h + '<button class="btn sm ghost" data-a="leave">تغيير</button></section>';
  }
  function render() {
    if (!joined) { app.innerHTML = vJoin() + '<div class="pnet">' + (tstat === "online" ? "🟢" : "🟡 جاري الاتصال…") + "</div>"; return; }
    var focus = document.activeElement && document.activeElement.id, val = focus ? document.activeElement.value : "";
    app.innerHTML = (me.role === "host" ? vHost() : vPlayer()) + '<div class="pnet">' + (tstat === "online" ? "🟢" : "🟡 جاري الاتصال…") + "</div>";
    if (focus === "tp") { var f = $("#tp"); if (f) { f.value = val; f.focus(); } }
  }
  function press() {
    if (!V || !V.canBuzz || Date.now() < lockedUntil) return;
    lockedUntil = Date.now() + 700; net.send({ t: "buzz" }); if (navigator.vibrate) navigator.vibrate(40); render(); setTimeout(render, 720);
  }
  document.addEventListener("pointerdown", function (e) { if (e.target.closest("#buzz")) { e.preventDefault(); press(); } });
  document.addEventListener("click", function (e) {
    var j = e.target.closest("[data-j]"), c = e.target.closest("[data-c]"), a = e.target.closest("[data-a]");
    if (j) {
      var nm = ($("#nm").value || "").trim(); if (!nm) { ack = "اكتب اسمك أولاً"; render(); return; }
      var p = j.getAttribute("data-j").split(":"); me.name = nm.slice(0, 14); me.team = +p[0]; me.role = p[1]; me.joinedCode = code; saveMe(); joined = true; ack = ""; hello(); render(); return;
    }
    if (c) { net.send({ t: "cmd", c: c.getAttribute("data-c") }); return; }
    if (a) { var k = a.getAttribute("data-a"); if (k === "done") net.send({ t: "done" }); else if (k === "peek") net.send({ t: "peek" }); else if (k === "selfok") net.send({ t: "selfjudge", ok: true }); else if (k === "selfno") net.send({ t: "selfjudge", ok: false }); else if (k === "leave") { joined = false; me.joinedCode = ""; saveMe(); render(); } else if (k === "send") { var el = $("#tp"); if (el) { typed = el.value; net.send({ t: "type", text: typed }); } } }
  });
  document.addEventListener("input", function (e) { if (e.target.id === "tp") typed = e.target.value; });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "tp") { typed = e.target.value; net.send({ t: "type", text: typed }); } });
  connect(); render();
})();
