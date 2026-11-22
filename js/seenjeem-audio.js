/* «سين جيم» — مؤثرات صوتية وموسيقى خلفية اختيارية، مولَّدة بالكامل بـ WebAudio (بدون ملفات). */
(function (root) {
  "use strict";
  var ctx = null, master = null, sfxOn = true, musicOn = false, musicT = null, step = 0;
  function ac() {
    if (!ctx) { try { var C = root.AudioContext || root.webkitAudioContext; ctx = new C(); master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function tone(f, d, type, vol, when, slideTo, force) {
    if ((!sfxOn && !force) || !ac()) return;
    var t = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .12, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .05);
  }
  function noise(d, vol, when, hp) {
    if (!sfxOn || !ac()) return;
    var t = ctx.currentTime + (when || 0), len = Math.max(1, Math.floor(ctx.sampleRate * d)), buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp || 1200; g.gain.value = vol || .08; s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  var SFX = {
    pick: function () { tone(523, .09, "triangle", .12); tone(784, .14, "triangle", .12, .08); },
    tap: function () { tone(520, .06, "triangle", .06); },
    reveal: function () { noise(.3, .05, 0, 2500); tone(392, .12, "triangle", .1); tone(587, .12, "triangle", .1, .1); tone(784, .3, "triangle", .12, .2); },
    correct: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, .22, "triangle", .13, i * .08); }); },
    wrong: function () { tone(210, .45, "sawtooth", .1, 0, 120); tone(160, .5, "square", .05, .05); },
    none: function () { tone(330, .2, "triangle", .08); tone(262, .3, "triangle", .08, .15); },
    tick: function () { tone(1100, .05, "square", .05); },
    urgent: function () { tone(1400, .06, "square", .07); },
    timeout: function () { [440, 349, 262].forEach(function (f, i) { tone(f, .28, "square", .08, i * .16); }); },
    dbl: function () { [330, 440, 660, 880].forEach(function (f, i) { tone(f, .16, "sawtooth", .08, i * .06); }); noise(.35, .05, .1, 3000); },
    life: function () { tone(660, .12, "sine", .12); tone(990, .2, "sine", .1, .1); },
    call: function () { for (var i = 0; i < 3; i++) { tone(480, .12, "sine", .08, i * .3); tone(440, .12, "sine", .08, i * .3 + .13); } },
    score: function () { [660, 880, 1100].forEach(function (f, i) { tone(f, .1, "triangle", .09, i * .06); }); },
    intro: function () { [[330, 0], [330, .18], [392, .36], [494, .54], [659, .78]].forEach(function (n) { tone(n[0], .26, "square", .06, n[1]); tone(n[0] / 2, .26, "triangle", .08, n[1]); }); },
    win: function () { var m = [523, 659, 784, 1046, 784, 1046, 1318, 1568]; m.forEach(function (f, i) { tone(f, .38, "triangle", .15, i * .12); tone(f / 2, .38, "sine", .08, i * .12); }); [523, 659, 784, 1046].forEach(function (f) { tone(f, 1.1, "triangle", .06, 1.05); }); noise(.6, .05, 1.05, 3000); }
  };
  // موسيقى خلفية خفيفة: أربع نغمات متكررة تتبدّل
  var PATTERN = [262, 330, 392, 330, 294, 349, 440, 349, 262, 330, 392, 523, 392, 330, 294, 247];
  function musicStep() { if (!musicOn) return; var f = PATTERN[step++ % PATTERN.length]; tone(f, .34, "triangle", .035, 0, 0, true); if (step % 4 === 1) tone(f / 2, .8, "sine", .04, 0, 0, true); }
  root.SJ_AUDIO = {
    enable: function (on) { sfxOn = !!on; },
    unlock: function () { ac(); },
    play: function (n) { if (!sfxOn) return; try { (SFX[n] || function () {})(); } catch (e) {} },
    music: function (on) { musicOn = !!on; clearInterval(musicT); musicT = null; if (musicOn && ac()) { step = 0; musicT = setInterval(musicStep, 420); } },
    names: Object.keys(SFX)
  };
})(typeof window !== "undefined" ? window : globalThis);
