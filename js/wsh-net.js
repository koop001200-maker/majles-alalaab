/* «وش الصح؟» — الاتصال بين شاشة التلفزيون والجوالات.
 *
 * ثلاث طرق تعمل معاً، وأي رسالة تصل من أكثر من طريق تُحسب مرة واحدة:
 * 1) خادم وسيط عام (MQTT عبر WebSocket الآمن) على خادمين مستقلين احتياطاً لبعض.
 *    يعمل من أي شبكة (واي فاي أو بيانات الجوال) لأن كل جهاز يتصل بالخادم ولا يحتاج اتصالاً مباشراً.
 * 2) اتصال مباشر WebRTC عبر PeerJS، إن نجح.
 * 3) BroadcastChannel لنوافذ المتصفح نفسه (التجربة على جهاز واحد).
 * لا يمر عبرها إلا بيانات اللعبة (الأسماء والإجابات والأصوات)، ولا تُحفظ في أي مكان.
 *
 * معاملات الرابط: mq=رابط1,رابط2 (خوادم MQTT أخرى، أو none) · ps=host:port (خادم PeerJS) · local=1 (نوافذ محلية فقط) · nobc=1
 */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var PREFIX = "wshalsah-v1-", TOPIC = "majlis-wsh/v1/";
  var BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt"];
  if (params.get("mq")) BROKERS = params.get("mq") === "none" ? [] : params.get("mq").split(",").filter(Boolean);
  var localOnly = params.get("local") === "1";
  var useBC = params.get("nobc") !== "1";
  var useMQ = !localOnly && typeof window.mqtt === "object" && BROKERS.length > 0;
  var usePeer = !localOnly && typeof window.Peer === "function" && params.get("nopeer") !== "1";

  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function peerConfig() {
    var ps = params.get("ps"), cfg = { debug: 0, config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] } };
    if (ps) { var m = /^([^:\/]+)(?::(\d+))?$/.exec(ps); if (m) { cfg.host = m[1]; cfg.port = +(m[2] || 443); cfg.path = "/"; cfg.secure = cfg.port === 443; } }
    return cfg;
  }
  // remember recently seen message ids so a message that arrives twice is handled once
  function deduper() {
    var seen = {}, order = [];
    return function (mid) {
      if (!mid) return true;
      if (seen[mid]) return false;
      seen[mid] = 1; order.push(mid); if (order.length > 600) delete seen[order.shift()];
      return true;
    };
  }
  function mqClients(onConnect, onMessage, onStatus) {
    var list = [];
    if (!useMQ) return list;
    BROKERS.forEach(function (url) {
      var c;
      try { c = window.mqtt.connect(url, { clientId: "wsh-" + rid(), keepalive: 25, reconnectPeriod: 2500, connectTimeout: 9000, clean: true, protocolVersion: 4 }); }
      catch (e) { return; }
      var item = { url: url, c: c, up: false };
      c.on("connect", function () { item.up = true; onConnect(item); onStatus(); });
      c.on("close", function () { if (item.up) { item.up = false; onStatus(); } });
      c.on("offline", function () { item.up = false; onStatus(); });
      c.on("error", function () {});
      c.on("message", function (topic, payload) { var d; try { d = JSON.parse(payload.toString()); } catch (e) { return; } onMessage(topic, d); });
      list.push(item);
    });
    return list;
  }
  function pub(list, topic, obj) {
    var s = JSON.stringify(obj);
    list.forEach(function (it) { if (it.up) { try { it.c.publish(topic, s, { qos: 0 }); } catch (e) {} } });
  }

  /* ---------------- host (TV) ---------------- */
  function host(code, h) {
    var closed = false, conns = {}, bc = null, peer = null, retryT = null, fresh = deduper();
    var iid = rid(), since = Date.now(), peerUp = false;
    function deliver(pid, mid, msg, kind, conn) {
      if (!pid || !msg) return;
      pid = String(pid).slice(0, 40);
      if (kind === "peer") conns[pid] = { kind: "peer", conn: conn }; else if (!conns[pid] || conns[pid].kind !== "peer") conns[pid] = { kind: kind };
      if (fresh(mid)) h.onMsg(pid, msg);
    }
    function status() {
      var mq = mq_.filter(function (x) { return x.up; }).length;
      h.onStatus && h.onStatus(mq || peerUp ? "online" : localOnly ? "local" : "connecting", { relays: mq, direct: peerUp });
    }

    if (useBC) try {
      bc = new BroadcastChannel("wsh-" + code);
      bc.onmessage = function (e) { var d = e.data; if (d && d.from) deliver(d.from, d.mid, d.msg, "bc"); };
    } catch (e) {}

    var mq_ = mqClients(function (it) {
      it.c.subscribe([TOPIC + code + "/h", TOPIC + code + "/probe"], { qos: 0 });
      // make sure no other TV is using this room code right now
      pub([it], TOPIC + code + "/probe", { iid: iid, since: since });
    }, function (topic, d) {
      if (topic === TOPIC + code + "/probe") {
        if (!d || d.iid === iid) return;
        if (d.since < since) { if (!closed) h.onConflict && h.onConflict(); }
        else pub(mq_, TOPIC + code + "/probe", { iid: iid, since: since });
        return;
      }
      if (d && d.pid) deliver(d.pid, d.mid, d.msg, "mq");
    }, status);

    function startPeer() {
      if (!usePeer || closed) return;
      try { peer = new window.Peer(PREFIX + code, peerConfig()); } catch (e) { return; }
      peer.on("open", function () { peerUp = true; status(); });
      peer.on("connection", function (conn) {
        var pid = null;
        conn.on("data", function (d) { if (!d || typeof d !== "object" || !d.pid) return; pid = String(d.pid).slice(0, 40); deliver(pid, d.mid, d.msg, "peer", conn); });
        conn.on("close", function () { if (pid && conns[pid] && conns[pid].conn === conn) delete conns[pid]; });
        conn.on("error", function () {});
      });
      peer.on("disconnected", function () { peerUp = false; status(); if (!closed) { try { peer.reconnect(); } catch (e) {} } });
      peer.on("error", function (err) {
        var t = err && err.type;
        if (t === "unavailable-id" || t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") {
          peerUp = false; status(); try { peer.destroy(); } catch (e) {} clearTimeout(retryT); retryT = setTimeout(startPeer, 6000);
        }
      });
    }
    startPeer();
    status();

    return {
      send: function (pid, msg) {
        var env = { mid: rid(), msg: msg }, c = conns[pid];
        if (c && c.kind === "peer") { try { c.conn.send(env); } catch (e) {} }
        pub(mq_, TOPIC + code + "/p/" + pid, env);
        if (bc) { try { bc.postMessage({ to: pid, mid: env.mid, msg: msg }); } catch (e) {} }
      },
      online: function (pid) { return !!conns[pid]; },
      close: function () {
        closed = true; clearTimeout(retryT);
        try { bc && bc.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {}
        mq_.forEach(function (it) { try { it.c.end(true); } catch (e) {} });
      }
    };
  }

  /* ---------------- player (phone) ---------------- */
  function join(code, pid, h) {
    var closed = false, bc = null, peer = null, conn = null, retryT = null, lastHostMsg = 0, fresh = deduper();
    function got(mid, msg) { if (!msg || !fresh(mid)) return; lastHostMsg = Date.now(); h.onMsg(msg); }
    function status() {
      var mq = mq_.filter(function (x) { return x.up; }).length;
      h.onStatus && h.onStatus(mq || (conn && conn.open) || localOnly || useBC && !useMQ && !usePeer ? "online" : (navigator.onLine === false ? "offline" : "connecting"));
    }
    if (useBC) try { bc = new BroadcastChannel("wsh-" + code); bc.onmessage = function (e) { var d = e.data; if (d && d.to === pid) got(d.mid, d.msg); }; } catch (e) {}

    var mq_ = mqClients(function (it) {
      it.c.subscribe(TOPIC + code + "/p/" + pid, { qos: 0 });
      h.onOpen && h.onOpen();
    }, function (topic, d) { if (d) got(d.mid, d.msg); }, status);

    function connectPeer() {
      if (closed || !usePeer) return;
      try { if (!peer || peer.destroyed) peer = new window.Peer(peerConfig()); } catch (e) { retry(); return; }
      var go = function () {
        try { conn = peer.connect(PREFIX + code, { reliable: true }); } catch (e) { retry(); return; }
        conn.on("open", function () { status(); h.onOpen && h.onOpen(); });
        conn.on("data", function (d) { if (d && typeof d === "object") got(d.mid, d.msg); });
        conn.on("close", function () { status(); if (!closed) retry(); });
        conn.on("error", function () { retry(); });
      };
      if (peer.open) go(); else peer.once("open", go);
      peer.on("error", function (err) { if (err && err.type !== "unavailable-id") retry(8000); });
    }
    function retry(ms) {
      clearTimeout(retryT);
      retryT = setTimeout(function () {
        if (closed) return;
        try { conn && conn.close(); } catch (e) {}
        if (peer && (peer.destroyed || peer.disconnected)) { try { peer.destroy(); } catch (e) {} peer = null; }
        connectPeer();
      }, ms || 4000);
    }
    connectPeer();
    status();

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      mq_.forEach(function (it) { if (!it.up) { try { it.c.reconnect(); } catch (e) {} } });
      if (usePeer && (!conn || !conn.open)) retry(100);
    });
    window.addEventListener("online", function () { status(); if (usePeer) retry(100); });
    window.addEventListener("offline", status);

    return {
      send: function (msg) {
        var env = { mid: rid(), pid: pid, msg: msg };
        if (conn && conn.open) { try { conn.send(env); } catch (e) {} }
        pub(mq_, TOPIC + code + "/h", env);
        if (bc) { try { bc.postMessage({ from: pid, mid: env.mid, msg: msg }); } catch (e) {} }
      },
      lastHostMsg: function () { return lastHostMsg; },
      close: function () {
        closed = true; clearTimeout(retryT);
        try { bc && bc.close(); } catch (e) {} try { peer && peer.destroy(); } catch (e) {}
        mq_.forEach(function (it) { try { it.c.end(true); } catch (e) {} });
      }
    };
  }

  window.WshNet = { host: host, join: join };
})();
