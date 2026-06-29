/* ============================================================
   SYNC — Guardado online con Firebase Firestore + FUSIÓN segura.
   Progreso continuo entre dispositivos (cel ↔ compu), sin perder datos
   aunque se usen los dos a la vez:
   - Cada subida es una TRANSACCIÓN: lee la nube y FUSIONA carta por carta
     (gana la versión con el repaso más reciente de cada carta), nunca pisa.
   - Re-sincroniza al abrir y al recuperar el foco del dispositivo.
   - Listener en vivo: cambios del otro equipo aparecen en el menú.
   Si no hay red/SDK, la app sigue 100% local.
   ============================================================ */
(function () {
  "use strict";
  if (!window.FBCFG || !window.firebase || !window.SRS) return;
  var db;
  try { firebase.initializeApp(window.FBCFG); db = firebase.firestore(); }
  catch (e) { return; }
  var ref = db.collection("arcanaeum").doc("progress");
  var t = null, lastWrite = 0, applying = false;

  function localObj() { try { return JSON.parse(SRS.exportData()); } catch (e) { return null; } }
  function dval(s) { if (!s) return 0; var p = String(s).split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1).getTime(); }

  // Fusiona el estado remoto y el local sin perder progreso de ninguno.
  function mergeStates(remote, local) {
    var m = JSON.parse(JSON.stringify(local || {}));
    if (!m.cards) m.cards = {};
    if (!m.stats) m.stats = {};
    if (!remote) return m;
    var rc = remote.cards || {};
    Object.keys(rc).forEach(function (id) {
      var r = rc[id], l = m.cards[id];
      if (!l) { m.cards[id] = r; return; }
      var rts = r.ts || 0, lts = l.ts || 0;
      if (rts > lts) m.cards[id] = r;
      else if (rts === lts && (r.reps || 0) > (l.reps || 0)) m.cards[id] = r;
      // si no, se queda la local
    });
    var rs = remote.stats || {}, ms = m.stats;
    ms.xp = Math.max(ms.xp || 0, rs.xp || 0);
    ms.reviews = Math.max(ms.reviews || 0, rs.reviews || 0);
    // días: unión
    var days = {}; (ms.days || []).forEach(function (d) { days[d] = 1; }); (rs.days || []).forEach(function (d) { days[d] = 1; });
    ms.days = Object.keys(days);
    // último día / racha: gana la fecha más nueva
    if (dval(rs.lastDay) > dval(ms.lastDay)) { ms.lastDay = rs.lastDay; ms.streak = Math.max(ms.streak || 0, rs.streak || 0); }
    else if (dval(rs.lastDay) === dval(ms.lastDay)) { ms.streak = Math.max(ms.streak || 0, rs.streak || 0); }
    // contadores de hoy
    if (rs.todayDate && dval(rs.todayDate) === dval(ms.todayDate)) {
      ms.newToday = Math.max(ms.newToday || 0, rs.newToday || 0);
      ms.reviewToday = Math.max(ms.reviewToday || 0, rs.reviewToday || 0);
    } else if (dval(rs.todayDate) > dval(ms.todayDate)) {
      ms.todayDate = rs.todayDate; ms.newToday = rs.newToday || 0; ms.reviewToday = rs.reviewToday || 0;
    }
    if (window.SRS && SRS.levelFor) ms.level = SRS.levelFor(ms.xp);
    // ajustes: gana el estado actualizado más recientemente
    if ((remote.updatedAt || 0) > (local.updatedAt || 0) && remote.settings) m.settings = remote.settings;
    return m;
  }

  // Transacción: lee la nube, fusiona con lo local. SOLO escribe si este
  // equipo aporta algo nuevo (evita rebotes entre dos equipos abiertos).
  function syncNow(cb) {
    db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var local = localObj() || {};
        var remoteStr = (snap.exists && snap.data() && snap.data().payload) ? snap.data().payload : null;
        var remote = null; if (remoteStr) { try { remote = JSON.parse(remoteStr); } catch (e) {} }
        var merged = remote ? mergeStates(remote, local) : local;
        var dirty = !remote;
        if (remote) {
          var lc = local.cards || {}, rc = remote.cards || {};
          for (var id in lc) { var l = lc[id], r = rc[id]; if (!r || (l.ts || 0) > (r.ts || 0) || (l.reps || 0) > (r.reps || 0)) { dirty = true; break; } }
          if (!dirty && local.stats && remote.stats) { if ((local.stats.reviews || 0) > (remote.stats.reviews || 0) || (local.stats.xp || 0) > (remote.stats.xp || 0)) dirty = true; }
        }
        var outStr = remoteStr;
        if (dirty) { merged.updatedAt = Date.now(); outStr = JSON.stringify(merged); tx.set(ref, { payload: outStr, updatedAt: merged.updatedAt }); }
        return { str: outStr, wrote: dirty };
      });
    }).then(function (res) {
      if (res.wrote) lastWrite = Date.now();
      // reflejar lo combinado en este equipo solo si está en el menú (no interrumpir una sesión)
      if (res.str && window.ARCANAEUM_MENU_ACTIVE && window.ARCANAEUM_MENU_ACTIVE()) {
        applying = true;
        try { SRS.importData(res.str); } catch (e) {}
        applying = false;
        if (window.ARCANAEUM_RERENDER) window.ARCANAEUM_RERENDER();
      }
      if (cb) cb();
    }).catch(function () { if (cb) cb(); });
  }

  function schedule() { if (applying) return; clearTimeout(t); t = setTimeout(function () { syncNow(); }, 1500); }

  function listen() {
    ref.onSnapshot(function (s) {
      if (!s.exists) return;
      var d = s.data();
      if ((d.updatedAt || 0) <= lastWrite + 200) return;                       // cambio propio
      if (window.ARCANAEUM_MENU_ACTIVE && !window.ARCANAEUM_MENU_ACTIVE()) return; // en sesión: ignorar (no se pierde, ya está fusionado en la nube)
      syncNow();
    }, function () {});
  }

  // re-sincronizar al recuperar el foco / volver a la pestaña
  function onFocus() { if (window.ARCANAEUM_MENU_ACTIVE && window.ARCANAEUM_MENU_ACTIVE()) syncNow(); }
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) onFocus(); });

  window.SYNC = { ok: true, pull: syncNow, syncNow: syncNow, schedule: schedule, listen: listen };
})();
