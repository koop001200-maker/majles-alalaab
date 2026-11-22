/* «حروف وألوف» — مؤثرات صوتية مولّدة بالكامل (بدون ملفات): جرس، نجاح، خطأ، انتهاء الوقت، موسيقى افتتاح، احتفال. */
(function (root) {
  "use strict";
  var ctx = null, master = null, enabled = true;
  function ac() {
    if (!ctx) { try { var C = root.AudioContext || root.webkitAudioContext; ctx = new C(); master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function tone(f, d, type, vol, when, slideTo) {
    if (!enabled || !ac()) return;
    var t = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .12, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .05);
  }
  function chord(freqs, d, type, vol, when) { freqs.forEach(function (f) { tone(f, d, type, vol / freqs.length * 1.6, when); }); }
  function noise(d, vol, when, hp) {
    if (!enabled || !ac()) return;
    var t = ctx.currentTime + (when || 0), len = Math.max(1, Math.floor(ctx.sampleRate * d)), buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp || 1200; g.gain.value = vol || .08; s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  var SFX = {
    // جرس كهربائي واضح (جزئيات متناغمة) — للضغطة الأولى
    bell: function (team) { var base = team === 1 ? 988 : 784; tone(base, .55, "sine", .22); tone(base * 2.01, .4, "sine", .1); tone(base * 3.02, .25, "sine", .05); tone(base * .5, .35, "triangle", .08); },
    open: function () { tone(660, .1, "triangle", .1); tone(880, .14, "triangle", .1, .1); },
    start: function () { tone(392, .12, "triangle", .1); tone(523, .12, "triangle", .1, .1); tone(659, .22, "triangle", .12, .2); },
    reveal: function () { noise(.25, .05, 0, 2500); tone(440, .12, "sine", .08); },
    correct: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, .22, "triangle", .13, i * .08); }); },
    wrong: function () { tone(210, .45, "sawtooth", .1, 0, 120); tone(160, .5, "square", .05, .05); },
    timeout: function () { [440, 349, 262].forEach(function (f, i) { tone(f, .28, "square", .08, i * .16); }); },
    tick: function () { tone(1100, .05, "square", .05); },
    paint: function () { noise(.3, .05, 0, 800); tone(300, .25, "sine", .08, 0, 700); },
    decider: function () { [196, 196, 262].forEach(function (f, i) { tone(f, .3, "sawtooth", .08, i * .22); }); noise(.5, .04, .4, 400); },
    win: function () { var m = [523, 659, 784, 659, 784, 1046]; m.forEach(function (f, i) { tone(f, .3, "triangle", .14, i * .13); chord([f / 2], .3, "sine", .07, i * .13); }); },
    champion: function () {
      var m = [523, 659, 784, 1046, 784, 1046, 1318, 1568];
      m.forEach(function (f, i) { tone(f, .38, "triangle", .15, i * .12); tone(f / 2, .38, "sine", .08, i * .12); });
      chord([523, 659, 784, 1046], 1.2, "triangle", .16, 1.05); noise(.6, .05, 1.05, 3000);
    },
    // موسيقى افتتاح الجولة (قصيرة وخفيفة)
    intro: function () {
      var notes = [[330, 0], [330, .18], [392, .36], [494, .54], [659, .78]];
      notes.forEach(function (n) { tone(n[0], .26, "square", .06, n[1]); tone(n[0] / 2, .26, "triangle", .08, n[1]); });
      chord([330, 392, 494], .9, "triangle", .1, .98);
    },
    tap: function () { tone(520, .06, "triangle", .06); }
  };

  root.HU_AUDIO = {
    enable: function (on) { enabled = !!on; },
    unlock: function () { ac(); },
    play: function (name, arg) { if (!enabled) return; try { (SFX[name] || function () {})(arg); } catch (e) {} },
    names: Object.keys(SFX)
  };
})(typeof window !== "undefined" ? window : globalThis);
