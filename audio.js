/* ============================================================
   AUDIO — Ambiente tipo "tundra de Skyrim" + efectos.
   100% sintetizado (Web Audio), sin archivos (cero copyright).
   Música generativa: pad de cuerdas + melodía wistful en La menor.
   Respeta MUTE. Inicia con el primer gesto del usuario.
   ============================================================ */
window.AUDIO = (function () {
  "use strict";
  var ctx = null, master = null, ambGain = null, muted = false;
  var amb = { playing: false, step: 0, timer: null };

  // frecuencias (La menor / eólico)
  var NF = {
    A1: 55, E2: 82.41, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196,
    A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392,
    A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25
  };
  // progresión wistful: Am - F - C - G  (i - VI - III - VII)
  var PROG = [
    { bass: "A2", pad: ["A3", "C4", "E4"] },
    { bass: "F3", pad: ["F3", "A3", "C4"] },
    { bass: "C3", pad: ["C4", "E4", "G4"] },
    { bass: "G3", pad: ["G3", "B3", "D4"] }
  ];
  var MEL = ["A4", "C5", "B4", "E5", "D5", "C5", "E4", "G4", "A4", "E5"]; // notas para la melodía
  var BAR = 6.4; // segundos por compás

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.connect(master);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function ready() { if (!ctx) ensure(); if (ctx && ctx.state === "suspended") ctx.resume(); return ctx && !muted; }

  // ---- helpers de síntesis ----
  function env(g, t0, dur, peak, atk, rel) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + Math.max(atk, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function tone(o) {
    if (!ctx) return;
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "sine"; osc.frequency.setValueAtTime(o.f, o.t0);
    if (o.f2 != null) osc.frequency.exponentialRampToValueAtTime(o.f2, o.t0 + o.dur);
    var dest = o.dest || master;
    if (o.lp) { var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = o.lp; osc.connect(g); g.connect(lp); lp.connect(dest); }
    else { osc.connect(g); g.connect(dest); }
    env(g, o.t0, o.dur, o.peak == null ? 0.3 : o.peak, o.atk == null ? 0.01 : o.atk, o.rel == null ? Math.min(0.3, o.dur * 0.6) : o.rel);
    osc.start(o.t0); osc.stop(o.t0 + o.dur + 0.05);
  }
  function noise(t0, dur, peak, lp, hp) {
    if (!ctx) return;
    var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var g = ctx.createGain(); var node = src;
    if (lp) { var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; node.connect(f); node = f; }
    if (hp) { var h = ctx.createBiquadFilter(); h.type = "highpass"; h.frequency.value = hp; node.connect(h); node = h; }
    node.connect(g); g.connect(master);
    g.gain.setValueAtTime(peak == null ? 0.2 : peak, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.start(t0); src.stop(t0 + dur);
  }
  // pad suave (cuerdas) hacia ambGain
  function pad(f, t0, dur, peak) {
    if (!ctx) return;
    var osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "triangle"; osc2.type = "sine"; osc.frequency.value = f; osc2.frequency.value = f * 1.005;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    osc.connect(g); osc2.connect(g); g.connect(lp); lp.connect(ambGain);
    env(g, t0, dur, peak, 1.4, 1.8);
    osc.start(t0); osc2.start(t0); osc.stop(t0 + dur + 0.1); osc2.stop(t0 + dur + 0.1);
  }
  // nota de melodía (flauta/celesta) hacia ambGain
  function mel(f, t0, dur, peak) {
    if (!ctx) return;
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = f;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
    osc.connect(g); g.connect(lp); lp.connect(ambGain);
    env(g, t0, dur, peak, 0.06, dur * 0.7);
    osc.start(t0); osc.stop(t0 + dur + 0.1);
  }

  function scheduleBar() {
    if (!amb.playing || !ctx) return;
    var t = ctx.currentTime + 0.08;
    var ch = PROG[amb.step % PROG.length];
    // drone + pad
    pad(NF[ch.bass] / 2, t, BAR, 0.09);                       // sub-bajo
    ch.pad.forEach(function (nn) { pad(NF[nn], t, BAR, 0.07); });
    // melodía: 2-3 notas con silencios y leve variación
    var nNotes = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (var i = 0; i < nNotes; i++) {
      if (Math.random() < 0.25) continue; // silencios
      var f = NF[MEL[Math.floor(Math.random() * MEL.length)]];
      var off = 0.3 + i * (BAR / (nNotes + 0.5)) + Math.random() * 0.3;
      mel(f, t + off, 1.6 + Math.random() * 0.8, 0.14);
    }
    // viento sutil
    if (amb.step % 2 === 0) noise(t, BAR, 0.012, 700, 200);
    amb.step++;
    amb.timer = setTimeout(scheduleBar, BAR * 1000 - 120);
  }

  var API = {
    setMuted: function (m) { muted = !!m; if (ambGain && ctx) ambGain.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.4); },
    isMuted: function () { return muted; },
    unlock: function () { ensure(); ready(); },

    startAmbient: function () {
      if (!ready()) return;
      if (!amb.playing) { amb.playing = true; amb.step = 0; scheduleBar(); }
      ambGain.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 1.5);
    },
    stopAmbient: function () { amb.playing = false; if (amb.timer) clearTimeout(amb.timer); if (ambGain && ctx) ambGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5); },

    flip: function () { if (!ready()) return; noise(ctx.currentTime, 0.18, 0.1, 3500, 800); },
    reveal: function () { if (!ready()) return; var t = ctx.currentTime; tone({ f: 740, type: "sine", t0: t, dur: 0.16, peak: 0.13 }); tone({ f: 1110, type: "sine", t0: t + 0.04, dur: 0.2, peak: 0.1 }); },
    gradeAgain: function () { if (!ready()) return; tone({ f: 220, f2: 150, type: "triangle", t0: ctx.currentTime, dur: 0.28, peak: 0.2, lp: 1200 }); },
    gradeOk: function () { if (!ready()) return; tone({ f: 440, type: "sine", t0: ctx.currentTime, dur: 0.16, peak: 0.18 }); },
    gradeGood: function () { if (!ready()) return; var t = ctx.currentTime;[523, 659, 784].forEach(function (f, i) { tone({ f: f, type: "sine", t0: t + i * 0.06, dur: 0.18, peak: 0.16 }); }); },
    correctChime: function () { if (!ready()) return; var t = ctx.currentTime;[659, 988].forEach(function (f, i) { tone({ f: f, type: "sine", t0: t + i * 0.05, dur: 0.22, peak: 0.16 }); }); },
    wrongChime: function () { if (!ready()) return; tone({ f: 300, f2: 180, type: "triangle", t0: ctx.currentTime, dur: 0.3, peak: 0.18, lp: 1100 }); },

    levelUp: function () {
      if (!ready()) return; var t = ctx.currentTime;
      [392, 523, 659, 784, 1047].forEach(function (f, i) { tone({ f: f, type: "sine", t0: t + i * 0.1, dur: 0.5, peak: 0.2, rel: 0.4 }); tone({ f: f * 2, type: "triangle", t0: t + i * 0.1, dur: 0.4, peak: 0.06 }); });
      noise(t + 0.5, 0.5, 0.05, 9000, 4000);
    },
    shout: function () {
      if (!ready()) return; var t = ctx.currentTime;
      tone({ f: 90, f2: 45, type: "sawtooth", t0: t, dur: 0.7, peak: 0.32, lp: 700, rel: 0.4 });
      noise(t, 0.5, 0.16, 1200); tone({ f: 160, f2: 80, type: "sine", t0: t + 0.05, dur: 0.6, peak: 0.18 });
    },
    dragonSoul: function () {
      if (!ready()) return; var t = ctx.currentTime;
      [110, 164.8, 220].forEach(function (f) { tone({ f: f, type: "sine", t0: t, dur: 1.4, peak: 0.18, rel: 0.9 }); });
      tone({ f: 880, f2: 440, type: "triangle", t0: t + 0.1, dur: 1.2, peak: 0.07 });
    }
  };
  return API;
})();
