/* ============================================================
   SRS — Repetición espaciada (SM-2 simplificado) + persistencia.
   Estado en localStorage. Abdiel es el único usuario (sin login).
   ============================================================ */
window.SRS = (function () {
  "use strict";
  var KEY = "arcanaeum_v1";
  var DAY = 86400000;
  var MASTER_INTERVAL = 7;   // días de intervalo para contar "dominada"
  var NEW_PER_SESSION = 20;  // cartas nuevas por sesión
  var MAX_SESSION = 40;      // tope de cartas por sesión
  var READY_GLOBAL = 85;     // % global para "listo"
  var READY_DECK = 70;       // % mínimo por mazo

  function fresh() {
    return {
      v: 1,
      cards: {},  // id -> {reps, ease, intervalDays, due, lastGrade, seen}
      stats: { xp: 0, level: 1, streak: 0, lastDay: null, days: [], reviews: 0 },
      settings: { mode: "mc", muted: false }
    };
  }
  var state = load();

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.cards) {
        if (!s.settings) s.settings = fresh().settings;
        if (!s.stats) s.stats = fresh().stats;
        return s;
      }
    } catch (e) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function now() { return Date.now(); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function cs(id) { return state.cards[id]; }

  function isMastered(id) { var c = cs(id); return !!(c && c.intervalDays >= MASTER_INTERVAL && c.lastGrade !== "again"); }
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
    var c = cs(id) || { reps: 0, ease: 2.3, intervalDays: 0, due: now(), lastGrade: null, seen: 0 };
    var wasMastered = isMastered(id);
    c.seen++; state.stats.reviews++;
    var xp = 4;
    if (rating === "again") {
      c.reps = 0; c.intervalDays = 0; c.ease = Math.max(1.3, c.ease - 0.2); c.due = now();
    } else if (rating === "ok") {
      c.intervalDays = c.reps === 0 ? 1 : Math.max(1, Math.round(c.intervalDays * 1.25));
      c.ease = Math.max(1.3, c.ease - 0.05); c.reps++; c.due = now() + c.intervalDays * DAY; xp = 6;
    } else { // good
      c.intervalDays = c.reps === 0 ? 1 : (c.reps === 1 ? 3 : Math.round(c.intervalDays * c.ease));
      c.ease = Math.min(2.8, c.ease + 0.05); c.reps++; c.due = now() + c.intervalDays * DAY; xp = 10;
    }
    c.lastGrade = rating;
    state.cards[id] = c;
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
    return { total: total, mastered: mastered, due: due, pct: pct, decksDone: decksDone, ready: ready, weak: weak,
             readyGlobal: READY_GLOBAL, readyDeck: READY_DECK };
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
    levelFor: levelFor, xpForLevel: xpForLevel
  };
})();
