/* «وش الصح؟» — الاتصال بين شاشة التلفزيون والجوالات.
 *
 * طريقتان تعملان معاً:
 * 1) WebRTC عبر PeerJS: التلفزيون «مضيف» له معرّف ثابت مشتق من رمز الغرفة، وكل جوال يتصل به مباشرة.
 *    يحتاج اتصالاً بالإنترنت للمصافحة فقط (خادم PeerJS العام)، ثم تمرّ البيانات بين الأجهزة مباشرة.
 * 2) BroadcastChannel: نوافذ المتصفح نفسه (للتجربة على جهاز واحد أو عدة نوافذ).
 *
 * معاملات الرابط:  ?ps=host:port  لاستخدام خادم PeerJS آخر (مثلاً خادم محلي)،  &local=1  للنوافذ المحلية فقط.
 */
(function () {
  "use strict";
  var PREFIX = "wshalsah-v1-";
  var params = new URLSearchParams(location.search);

  function peerConfig() {
    var ps = params.get("ps"), cfg = { debug: 0, config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] } };
    if (ps) {
      var m = /^([^:\/]+)(?::(\d+))?$/.exec(ps);
      if (m) { cfg.host = m[1]; cfg.port = +(m[2] || 443); cfg.path = "/"; cfg.secure = cfg.port === 443; }
    }
    return cfg;
  }
  var useBC = params.get("nobc") !== "1"; // nobc=1: test the network path only
  var peerAvailable = function () { return typeof window.Peer === "function" && params.get("local") !== "1"; };

  /* ---------------- host (TV) ---------------- */
  function host(code, h) {
    var closed = false, conns = {}, bc = null, peer = null, retryT = null;
    if (useBC) try {
      bc = new BroadcastChannel("wsh-" + code);
      bc.onmessage = function (e) { var d = e.data; if (d && d.from && d.msg) { conns[d.from] = conns[d.from] || { kind: "bc" }; h.onMsg(d.from, d.msg); } };
    } catch (e) {}

    function startPeer() {
      if (!peerAvailable() || closed) { h.onStatus && h.onStatus(peerAvailable() ? "closed" : "local"); return; }
      try { peer = new window.Peer(PREFIX + code, peerConfig()); } catch (e) { h.onStatus && h.onStatus("error"); return; }
      h.onStatus && h.onStatus("connecting");
      peer.on("open", function () { h.onStatus && h.onStatus("online"); });
      peer.on("connection", function (conn) {
        var pid = null;
        conn.on("data", function (d) {
          if (!d || typeof d !== "object" || !d.pid || !d.msg) return;
          pid = String(d.pid).slice(0, 40);
          conns[pid] = { kind: "peer", conn: conn };
          h.onMsg(pid, d.msg);
        });
        conn.on("close", function () { if (pid && conns[pid] && conns[pid].conn === conn) { delete conns[pid]; h.onLeave && h.onLeave(pid); } });
        conn.on("error", function () {});
      });
      peer.on("disconnected", function () { if (!closed) { h.onStatus && h.onStatus("reconnecting"); try { peer.reconnect(); } catch (e) {} } });
      peer.on("error", function (err) {
        var t = err && err.type;
        if (t === "unavailable-id") { h.onStatus && h.onStatus("taken"); try { peer.destroy(); } catch (e) {} retryT = setTimeout(startPeer, 4000); }
        else if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") { h.onStatus && h.onStatus("offline"); try { peer.destroy(); } catch (e) {} retryT = setTimeout(startPeer, 5000); }
        else if (t === "browser-incompatible") h.onStatus && h.onStatus("unsupported");
      });
    }
    startPeer();

    return {
      send: function (pid, msg) {
        var c = conns[pid];
        if (c && c.kind === "peer") { try { c.conn.send(msg); } catch (e) {} }
        if (bc) { try { bc.postMessage({ to: pid, msg: msg }); } catch (e) {} }
      },
      online: function (pid) { return !!conns[pid]; },
      close: function () { closed = true; clearTimeout(retryT); try { bc && bc.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {} }
    };
  }

  /* ---------------- player (phone) ---------------- */
  function join(code, pid, h) {
    var closed = false, bc = null, peer = null, conn = null, retryT = null, lastHostMsg = 0;
    function got(msg) { lastHostMsg = Date.now(); h.onMsg(msg); }
    if (useBC) try { bc = new BroadcastChannel("wsh-" + code); bc.onmessage = function (e) { var d = e.data; if (d && d.to === pid && d.msg) got(d.msg); }; } catch (e) {}

    function connectPeer() {
      if (closed || !peerAvailable()) return;
      h.onStatus && h.onStatus("connecting");
      try { if (!peer || peer.destroyed) peer = new window.Peer(peerConfig()); } catch (e) { retry(); return; }
      var go = function () {
        try { conn = peer.connect(PREFIX + code, { reliable: true }); } catch (e) { retry(); return; }
        conn.on("open", function () { h.onStatus && h.onStatus("online"); h.onOpen && h.onOpen(); });
        conn.on("data", function (d) { if (d && typeof d === "object") got(d); });
        conn.on("close", function () { if (!closed) { h.onStatus && h.onStatus("reconnecting"); retry(); } });
        conn.on("error", function () { retry(); });
      };
      if (peer.open) go(); else peer.once("open", go);
      peer.on("error", function (err) {
        var t = err && err.type;
        if (t === "peer-unavailable") { h.onStatus && h.onStatus("noroom"); retry(4000); }
        else if (t !== "unavailable-id") retry();
      });
    }
    function retry(ms) {
      clearTimeout(retryT);
      retryT = setTimeout(function () {
        if (closed) return;
        try { conn && conn.close(); } catch (e) {}
        if (peer && (peer.destroyed || peer.disconnected)) { try { peer.destroy(); } catch (e) {} peer = null; }
        connectPeer();
      }, ms || 2500);
    }
    connectPeer();

    var api = {
      send: function (msg) {
        if (conn && conn.open) { try { conn.send({ pid: pid, msg: msg }); } catch (e) {} }
        if (bc) { try { bc.postMessage({ from: pid, msg: msg }); } catch (e) {} }
      },
      lastHostMsg: function () { return lastHostMsg; },
      close: function () { closed = true; clearTimeout(retryT); try { bc && bc.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {} }
    };
    // if the page was offline (phone screen locked etc.), reconnect when it comes back
    document.addEventListener("visibilitychange", function () { if (!document.hidden && peerAvailable() && (!conn || !conn.open)) retry(100); });
    window.addEventListener("online", function () { retry(100); });
    return api;
  }

  window.WshNet = { host: host, join: join, peerAvailable: peerAvailable };
})();
