/* ============================================================
   AUDIO — Ambiente nórdico + efectos, 100% sintetizado (Web Audio).
   Sin archivos (cero copyright). Respeta MUTE. Inicia con gesto.
   ============================================================ */
window.AUDIO = (function () {
  "use strict";
  var ctx = null, master = null, ambGain = null, muted = false, ambientOn = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.connect(master);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function ready() { if (!ctx) ensure(); if (ctx && ctx.state === "suspended") ctx.resume(); return ctx && !muted; }

  function tone(o) {
    if (!ctx) return;
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, o.t0);
    if (o.f2 != null) osc.frequency.exponentialRampToValueAtTime(o.f2, o.t0 + o.dur);
    var dest = o.dest || master;
    if (o.lp) { var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = o.lp; osc.connect(g); g.connect(lp); lp.connect(dest); }
    else { osc.connect(g); g.connect(dest); }
    var p = o.peak == null ? 0.3 : o.peak, a = o.atk == null ? 0.01 : o.atk, r = o.rel == null ? Math.min(0.3, o.dur * 0.6) : o.rel;
    g.gain.setValueAtTime(0.0001, o.t0);
    g.gain.exponentialRampToValueAtTime(p, o.t0 + a);
    g.gain.setValueAtTime(p, o.t0 + Math.max(a, o.dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, o.t0 + o.dur);
    osc.start(o.t0); osc.stop(o.t0 + o.dur + 0.05);
  }
  function noise(t0, dur, peak, lp, hp) {
    if (!ctx) return;
    var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var g = ctx.createGain(); g.gain.value = peak == null ? 0.2 : peak;
    var node = src;
    if (lp) { var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; node.connect(f); node = f; }
    if (hp) { var h = ctx.createBiquadFilter(); h.type = "highpass"; h.frequency.value = hp; node.connect(h); node = h; }
    node.connect(g); g.connect(master);
    g.gain.setValueAtTime(peak == null ? 0.2 : peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.start(t0); src.stop(t0 + dur);
  }

  var API = {
    setMuted: function (m) { muted = !!m; if (ambGain && ctx) ambGain.gain.setTargetAtTime(muted ? 0 : 0.12, ctx.currentTime, 0.3); },
    isMuted: function () { return muted; },
    unlock: function () { ensure(); ready(); },

    startAmbient: function () {
      if (!ready() || ambientOn) return;
      ambientOn = true;
      // drone nórdico: tónica + quinta + octava graves, con leve batido
      [55, 55.4, 82.5, 110].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 3 ? "triangle" : "sine"; o.frequency.value = f;
        g.gain.value = i === 0 ? 0.5 : 0.25;
        o.connect(g); g.connect(ambGain); o.start();
      });
      // swell LFO
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.05; lg.gain.value = 0.05;
      lfo.connect(lg); lg.connect(ambGain.gain); lfo.start();
      ambGain.gain.setTargetAtTime(muted ? 0 : 0.12, ctx.currentTime, 1.5);
    },

    flip: function () { if (!ready()) return; var t = ctx.currentTime; noise(t, 0.18, 0.12, 3500, 800); },
    reveal: function () { if (!ready()) return; var t = ctx.currentTime; tone({ f: 880, type: "sine", t0: t, dur: 0.18, peak: 0.16 }); tone({ f: 1320, type: "sine", t0: t + 0.04, dur: 0.2, peak: 0.12 }); },

    gradeAgain: function () { if (!ready()) return; var t = ctx.currentTime; tone({ f: 220, f2: 150, type: "triangle", t0: t, dur: 0.28, peak: 0.22, lp: 1200 }); },
    gradeOk: function () { if (!ready()) return; var t = ctx.currentTime; tone({ f: 440, type: "sine", t0: t, dur: 0.16, peak: 0.2 }); },
    gradeGood: function () { if (!ready()) return; var t = ctx.currentTime; [523, 659, 784].forEach(function (f, i) { tone({ f: f, type: "sine", t0: t + i * 0.06, dur: 0.18, peak: 0.18 }); }); },

    levelUp: function () { // "skill increased": arpegio brillante ascendente + brillo
      if (!ready()) return; var t = ctx.currentTime;
      [392, 523, 659, 784, 1047].forEach(function (f, i) {
        tone({ f: f, type: "sine", t0: t + i * 0.1, dur: 0.5, peak: 0.2, rel: 0.4 });
        tone({ f: f * 2, type: "triangle", t0: t + i * 0.1, dur: 0.4, peak: 0.07 });
      });
      noise(t + 0.5, 0.5, 0.05, 9000, 4000);
    },
    shout: function () { // Palabra de Poder desbloqueada: whoosh grave + impacto
      if (!ready()) return; var t = ctx.currentTime;
      tone({ f: 90, f2: 45, type: "sawtooth", t0: t, dur: 0.7, peak: 0.35, lp: 700, rel: 0.4 });
      noise(t, 0.5, 0.18, 1200);
      tone({ f: 160, f2: 80, type: "sine", t0: t + 0.05, dur: 0.6, peak: 0.2 });
    },
    dragonSoul: function () { // tema dominado: tono resonante profundo
      if (!ready()) return; var t = ctx.currentTime;
      [110, 164.8, 220].forEach(function (f) { tone({ f: f, type: "sine", t0: t, dur: 1.4, peak: 0.18, rel: 0.9 }); });
      tone({ f: 880, f2: 440, type: "triangle", t0: t + 0.1, dur: 1.2, peak: 0.08 });
    }
  };
  return API;
})();
