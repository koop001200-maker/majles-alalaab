/* «سين جيم» — جوال المتحكم (اختياري): يعرض اللوحة ويرسل أوامر الاختيار والكشف والنقاط ووسائل المساعدة إلى التلفزيون.
   الإجابة الصحيحة تظهر على الجوال فقط، والتلفزيون يكشفها عند الضغط على «كشف الإجابة». */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  if (!qs.has("room")) return; // هذه الصفحة التلفزيون
  document.body.classList.add("phone");
  var Net = window.WshNet, code = (qs.get("room") || "").replace(/\D/g, "").slice(0, 7);
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var Store = { get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var tab = qs.get("p") ? "_" + qs.get("p") : "";
  var me = Store.get("sj_me_v1" + tab, {}) || {};
  var pid = me.pid || (me.pid = "s" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4));
  Store.set("sj_me_v1" + tab, me);
  var V = null, net = null, tstat = "connecting", app = $("#app"), at = 0;
  var TCOL = ["#3B82F6", "#F97316"], LB = { two: "② جاوب جوابين", call: "📞 اتصال بصديق", dbl: "×2 دبل النقاط" };

  function hello() { if (net) net.send({ t: "hello" }); }
  function onMsg(m) {
    if (m.t === "who") { hello(); return; }
    if (m.t !== "state") return;
    V = m; at = Date.now(); render();
  }
  net = Net.join(code, pid, { onMsg: onMsg, onOpen: hello, onStatus: function (s) { tstat = s; var el = $(".pnet"); if (el) el.textContent = tstat === "online" ? "🟢" : "🟡 جاري الاتصال…"; } });
  hello(); setInterval(function () { net.send({ t: V ? "ping" : "hello" }); }, 3000);
  function cmd(c, extra) { var m = { t: "cmd", c: c }; if (extra) for (var k in extra) m[k] = extra[k]; net.send(m); if (navigator.vibrate) navigator.vibrate(25); }

  function secs() { if (!V || !V.cur) return 0; var l = V.cur.left; if (V.cur.running || V.cur.call) l -= Date.now() - at; return Math.max(0, Math.ceil(l / 1000)); }
  function render() {
    var h;
    if (!V || V.phase === "idle") h = '<div class="panel pc"><h2 class="sj-logo" style="font-size:3em">سين جيم</h2><p>غرفة <b dir="ltr">' + esc(code) + "</b></p><p>بانتظار بدء المباراة على التلفزيون…</p></div>";
    else {
      var N = V.names, teams = '<div class="pteams">' + [0, 1].map(function (t) { return '<div class="pt' + (V.turn === t && V.phase !== "end" ? " on" : "") + '" style="border-color:' + TCOL[t] + '">' + esc(N[t]) + "<b>" + (V.scores ? V.scores[t] : 0) + "</b></div>"; }).join("") + "</div>";
      if (V.phase === "end") h = '<div class="pc">' + teams + '<div class="panel"><h2 class="sj-logo" style="font-size:2.4em">' + (V.win < 0 ? "تعادل 🤝" : "فاز " + esc(N[V.win]) + " 🏆") + "</h2></div></div>";
      else if (V.phase === "board") {
        var hd = V.cats.map(function (c) { return '<div class="ch" title="' + esc(c.n) + '">' + c.i + "</div>"; }).join(""), cells = "";
        for (var r = 0; r < 6; r++) for (var ci = 0; ci < 6; ci++) { var i = ci * 6 + r, c = V.cells[i]; cells += '<button class="cell p' + c.p + (c.st ? " t" + (c.by < 0 ? "x" : c.by) : "") + '" data-i="' + i + '"' + (c.st ? " disabled" : "") + ">" + (c.st ? "·" : c.p) + "</button>"; }
        h = '<div class="pc">' + teams + '<p style="font-weight:800">اختر سؤالاً لفريق ' + esc(N[V.turn]) + '</p><div class="pboard">' + hd + cells + "</div></div>";
      } else if (V.cur) {
        var cu = V.cur, ctl;
        if (!cu.revealed) {
          ctl = '<div class="btns two">' + ["two", "dbl"].map(function (k) { return '<button class="btn sm' + (k === "dbl" ? " gold" : "") + '" data-life="' + k + '"' + (cu.can[k] ? "" : " disabled") + ">" + LB[k] + "</button>"; }).join("") + "</div>" +
            '<div class="btns">' + (cu.two && cu.attempt === 1 ? '<button class="btn bad" data-c="wrong">✘ المحاولة الأولى خاطئة</button>' : "") +
            '<button class="btn gold" data-c="reveal">👁 كشف الإجابة على التلفزيون</button><div class="btns two"><button class="btn" data-c="pause">' + (cu.running ? "⏸ إيقاف" : "▶ استئناف") + '</button>' + (cu.call ? '<button class="btn" data-c="callend">إنهاء الاتصال</button>' : '<button class="btn" data-c="cancel">↩ رجوع</button>') + "</div></div>";
        } else ctl = '<p style="font-weight:800">من فاز بالسؤال؟</p><div class="btns"><button class="btn" style="background:' + TCOL[0] + ';color:#fff" data-award="0">' + esc(N[0]) + '</button><button class="btn" style="background:' + TCOL[1] + ';color:#fff" data-award="1">' + esc(N[1]) + '</button><button class="btn" data-award="-1">لا أحد</button></div>';
        h = '<div class="pc">' + teams + '<div class="pq"><div style="font-weight:800">' + cu.p + " نقطة" + (cu.dbl ? " · ×2" : "") + (cu.two ? " · المحاولة " + cu.attempt + "/2" : "") + (!cu.revealed ? " · ⏱ " + secs() + (cu.call ? " (اتصال)" : "") : "") + '</div><div class="qt">' + esc(cu.q) + '</div><div class="ans">✔ ' + esc(cu.a) + '</div><small>الإجابة تظهر لك فقط حتى تكشفها على التلفزيون</small></div>' + ctl + "</div>";
      } else h = '<div class="pc">' + teams + "</div>";
    }
    app.innerHTML = h + '<div class="pnet">' + (tstat === "online" ? "🟢" : "🟡 جاري الاتصال…") + "</div>";
  }
  setInterval(function () { if (V && V.cur && !V.cur.revealed && (V.cur.running || V.cur.call)) render(); }, 1000);
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.i != null) cmd("pick", { i: +b.dataset.i });
    else if (b.dataset.c) cmd(b.dataset.c);
    else if (b.dataset.life) cmd("life", { v: b.dataset.life });
    else if (b.dataset.award != null) cmd("award", { v: +b.dataset.award });
  });
  render();
})();
