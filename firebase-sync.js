/* ============================================================
   SYNC — Guardado online con Firebase Firestore.
   Sincroniza el progreso entre dispositivos (cel ↔ compu).
   Si no hay config o SDK (offline), la app sigue funcionando local.
   Estrategia: al abrir baja lo último; en cada cambio sube; gana
   el más reciente (updatedAt). Listener en vivo para el otro equipo.
   ============================================================ */
(function () {
  "use strict";
  if (!window.FBCFG || !window.firebase || !window.SRS) return;
  var db;
  try { firebase.initializeApp(window.FBCFG); db = firebase.firestore(); }
  catch (e) { return; }
  var ref = db.collection("arcanaeum").doc("progress");
  var t = null, lastPushed = 0;

  function localObj() { try { return JSON.parse(SRS.exportData()); } catch (e) { return null; } }

  function applyRemote(data) {
    if (!data || !data.payload) return false;
    var remote; try { remote = JSON.parse(data.payload); } catch (e) { return false; }
    var l = localObj();
    var localEmpty = !l || !l.cards || Object.keys(l.cards).length === 0;
    if (localEmpty || (remote.updatedAt || 0) > (l.updatedAt || 0)) {
      try { SRS.importData(data.payload); return true; } catch (e) {}
    }
    return false;
  }

  function pull(cb) {
    ref.get().then(function (s) { var ch = s.exists ? applyRemote(s.data()) : false; if (cb) cb(ch); })
      .catch(function () { if (cb) cb(false); });
  }
  function push() {
    var p = SRS.exportData(); var o; try { o = JSON.parse(p); } catch (e) { o = {}; }
    lastPushed = o.updatedAt || Date.now();
    ref.set({ payload: p, updatedAt: lastPushed }).catch(function () {});
  }
  function schedule() { clearTimeout(t); t = setTimeout(push, 1500); }
  function listen() {
    ref.onSnapshot(function (s) {
      if (!s.exists) return;
      var d = s.data();
      if ((d.updatedAt || 0) <= lastPushed + 200) return;                 // es nuestro propio cambio
      if (window.ARCANAEUM_MENU_ACTIVE && !window.ARCANAEUM_MENU_ACTIVE()) return; // no interrumpir una sesión
      if (applyRemote(d) && window.ARCANAEUM_RERENDER) window.ARCANAEUM_RERENDER();
    }, function () {});
  }
  window.SYNC = { ok: true, pull: pull, push: push, schedule: schedule, listen: listen };
})();
