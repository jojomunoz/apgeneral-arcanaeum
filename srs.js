/* ============================================================
   SRS — Repetición espaciada (SM-2 simplificado) + persistencia.
   Estado en localStorage. Abdiel es el único usuario (sin login).
   ============================================================ */
window.SRS = (function () {
  "use strict";
  var KEY = "arcanaeum_v1";
  var DAY = 86400000;
  var MASTER_REPS = 2;       // recuerdos correctos para contar "dominada" (modo Sprint)
  var NEW_PER_SESSION = 25;  // cartas nuevas por sesión
  var MAX_SESSION = 50;      // tope de cartas por sesión
  var READY_GLOBAL = 85;     // % global para "listo"
  var READY_DECK = 70;       // % mínimo por mazo
  var READY_BUFFER = 2;      // apuntar a estar listo N días ANTES del examen

  function fresh() {
    return {
      v: 2,
      cards: {},  // id -> {reps, intervalDays, due, lastGrade, seen}
      stats: { xp: 0, level: 1, streak: 0, lastDay: null, days: [], reviews: 0, todayDate: null, newToday: 0, reviewToday: 0 },
      settings: { mode: "mc", muted: false, examDate: "2026-07-09" }
    };
  }
  var state = load();

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.cards) {
        if (!s.settings) s.settings = fresh().settings;
        if (!s.settings.examDate) s.settings.examDate = "2026-07-09";
        if (!s.stats) s.stats = fresh().stats;
        if (s.stats.newToday == null) { s.stats.newToday = 0; s.stats.reviewToday = 0; s.stats.todayDate = null; }
        return s;
      }
    } catch (e) {}
    return fresh();
  }
  var onChange = null;
  function save() {
    state.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (onChange) { try { onChange(); } catch (e) {} }
  }
  function now() { return Date.now(); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function cs(id) { return state.cards[id]; }

  function isMastered(id) { var c = cs(id); return !!(c && c.reps >= MASTER_REPS && c.lastGrade !== "again"); }
  function isDue(id) { var c = cs(id); return !!(c && c.due <= now()); }
  function isNew(id) { return !cs(id); }

  function levelFor(xp) { return Math.floor(Math.sqrt(xp / 50)) + 1; }
  function xpForLevel(l) { return 50 * (l - 1) * (l - 1); }

  function markStudyDay() {
    var t = todayStr();
    if (state.stats.lastDay === t) return;
    var y = new Date(now() - DAY); y = y.getFullYear() + "-" + (y.getMonth() + 1) + "-" + y.getDate();
    state.stats.streak = (state.stats.lastDay === y) ? (state.stats.streak || 0) + 1 : 1;
    state.stats.lastDay = t;
    if (state.stats.days.indexOf(t) === -1) state.stats.days.push(t);
  }

  function grade(id, rating) {
    var wasNew = !cs(id);
    var c = cs(id) || { reps: 0, intervalDays: 0, due: now(), lastGrade: null, seen: 0 };
    var wasMastered = isMastered(id);
    c.seen++; state.stats.reviews++;
    var xp = 4;
    // intervalos comprimidos (modo Sprint): las cartas vuelven en horas / al día siguiente
    if (rating === "again") {
      c.reps = 0; c.intervalDays = 0; c.due = now();                       // vuelve en esta sesión
    } else if (rating === "ok") {
      c.reps++; c.intervalDays = 0.25; c.due = now() + 0.25 * DAY; xp = 6;  // ~6 h después
    } else { // good
      c.reps++; c.intervalDays = c.reps < 2 ? 0.6 : 1; c.due = now() + c.intervalDays * DAY; xp = 10; // ~mañana
    }
    c.lastGrade = rating;
    c.ts = now();                 // marca de tiempo del último repaso (para fusionar entre dispositivos)
    state.cards[id] = c;
    // conteo del día (para la meta diaria)
    var t = todayStr();
    if (state.stats.todayDate !== t) { state.stats.todayDate = t; state.stats.newToday = 0; state.stats.reviewToday = 0; }
    if (wasNew) state.stats.newToday++; else state.stats.reviewToday++;
    var newlyMastered = false;
    if (!wasMastered && isMastered(id)) { xp += 25; newlyMastered = true; }
    state.stats.xp += xp;
    var lv = levelFor(state.stats.xp);
    var leveledUp = lv > state.stats.level;
    state.stats.level = lv;
    markStudyDay();
    save();
    return { xp: xp, leveledUp: leveledUp, level: lv, newlyMastered: newlyMastered };
  }

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function buildSession(deckNum) {
    var pool = window.CARDS.filter(function (c) { return deckNum === "all" || c.deck === deckNum; });
    var due = pool.filter(function (c) { return isDue(c.id); }).sort(function (a, b) { return cs(a.id).due - cs(b.id).due; });
    var news = shuffle(pool.filter(function (c) { return isNew(c.id); })).slice(0, NEW_PER_SESSION);
    var session = due.concat(news);
    if (session.length === 0) session = shuffle(pool).slice(0, Math.min(MAX_SESSION, pool.length)); // repaso libre
    session = session.slice(0, MAX_SESSION);
    return session.map(function (c) { return c.id; });
  }

  function deckStats(deckNum) {
    var pool = window.CARDS.filter(function (c) { return c.deck === deckNum; });
    var total = pool.length;
    var mastered = pool.filter(function (c) { return isMastered(c.id); }).length;
    var seen = pool.filter(function (c) { return !!cs(c.id); }).length;
    var due = pool.filter(function (c) { return isDue(c.id); }).length;
    var newc = pool.filter(function (c) { return isNew(c.id); }).length;
    var pct = total ? Math.round(mastered / total * 100) : 0;
    var status = mastered === total ? "mastered" : (pct >= READY_DECK ? "solid" : (seen > 0 ? "progress" : "locked"));
    return { total: total, mastered: mastered, seen: seen, due: due, new: newc, pct: pct, status: status };
  }

  function globalStats() {
    var total = window.CARDS.length;
    var mastered = window.CARDS.filter(function (c) { return isMastered(c.id); }).length;
    var due = window.CARDS.filter(function (c) { return isDue(c.id); }).length;
    var pct = total ? Math.round(mastered / total * 100) : 0;
    var decks = window.DECKS.map(function (d) { return { num: d.num, name: d.nameEs, s: deckStats(d.num) }; });
    var decksDone = decks.filter(function (d) { return d.s.pct >= READY_DECK; }).length;
    var weak = decks.filter(function (d) { return d.s.pct < READY_DECK; });
    var ready = pct >= READY_GLOBAL && weak.length === 0;
    var newCount = window.CARDS.filter(function (c) { return isNew(c.id); }).length;
    var seen = window.CARDS.filter(function (c) { return !!cs(c.id); }).length;
    return { total: total, mastered: mastered, due: due, pct: pct, decksDone: decksDone, ready: ready, weak: weak,
             newCount: newCount, seen: seen, seenPct: total ? Math.round(seen / total * 100) : 0,
             readyGlobal: READY_GLOBAL, readyDeck: READY_DECK };
  }

  function today() {
    var t = todayStr();
    if (state.stats.todayDate !== t) return { newToday: 0, reviewToday: 0 };
    return { newToday: state.stats.newToday || 0, reviewToday: state.stats.reviewToday || 0 };
  }

  // Plan adaptativo "listo para el examen": recalcula el trabajo diario necesario
  // (toques = recuerdos correctos que faltan para dominar TODO) según los días restantes.
  function remainingTouches() {
    var n = 0;
    for (var i = 0; i < window.CARDS.length; i++) {
      var c = cs(window.CARDS[i].id);
      var have = (c && c.lastGrade !== "again") ? (c.reps || 0) : 0;
      n += Math.max(0, MASTER_REPS - have);
    }
    return n;
  }
  function daysToExam() { return Math.ceil((new Date(state.settings.examDate + "T23:59:59") - new Date()) / 86400000); }
  function plan() {
    var dleft = daysToExam();
    var finishDays = Math.max(1, dleft - READY_BUFFER);              // margen de 1 día antes del examen
    var rem = remainingTouches();
    var required = rem > 0 ? Math.max(1, Math.ceil(rem / finishDays)) : 0;
    var t = today(); var done = t.newToday + t.reviewToday;
    var studyDays = Math.max(1, (state.stats.days || []).length);
    var avg = Math.round(state.stats.reviews / studyDays);
    var projDays = avg > 0 ? Math.ceil(rem / avg) : null; // a tu ritmo promedio, cuántos días faltan
    var onPace = done >= required || (projDays !== null && projDays <= finishDays);
    var rb = new Date(new Date(state.settings.examDate + "T23:59:59").getTime() - READY_BUFFER * DAY);
    var readyBy = rb.getFullYear() + "-" + (rb.getMonth() + 1) + "-" + rb.getDate();
    return { daysLeft: dleft, required: required, done: done, remaining: rem, avg: avg, projDays: projDays, onPace: onPace, buffer: READY_BUFFER, readyBy: readyBy };
  }

  function exportData() { return JSON.stringify(state, null, 1); }
  function importData(json) {
    var obj = JSON.parse(json);
    if (!obj || typeof obj !== "object" || !obj.cards) throw new Error("Archivo inválido");
    state = obj;
    if (!state.settings) state.settings = fresh().settings;
    if (!state.stats) state.stats = fresh().stats;
    if (!state.stats.days) state.stats.days = [];
    save();
  }
  function reset() { state = fresh(); save(); }

  return {
    grade: grade, buildSession: buildSession, deckStats: deckStats, globalStats: globalStats,
    isMastered: isMastered, isDue: isDue, isNew: isNew, cardState: cs,
    getCard: function (id) { for (var i = 0; i < window.CARDS.length; i++) if (window.CARDS[i].id === id) return window.CARDS[i]; return null; },
    exportData: exportData, importData: importData, reset: reset,
    getSettings: function () { return state.settings; },
    setSetting: function (k, v) { state.settings[k] = v; save(); },
    getStats: function () { return state.stats; },
    today: today, plan: plan, daysToExam: daysToExam,
    setOnChange: function (fn) { onChange = fn; },
    levelFor: levelFor, xpForLevel: xpForLevel
  };
})();
