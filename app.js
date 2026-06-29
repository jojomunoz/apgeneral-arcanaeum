/* ============================================================
   APP — Controlador de UI (Arcanaeum A&P General · Skyrim)
   ============================================================ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var screens = { menu: $("screen-menu"), study: $("screen-study"), summary: $("screen-summary") };

  // ---- estado de sesión ----
  var queue = [], pos = 0, currentId = null, revealed = false, chosen = null;
  var sess = null; // {reviewed, again, ok, good, xp, levelups, mastered, deck}
  var firstGesture = false;

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("active", k === name); });
    window.scrollTo(0, 0);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function deckById(num) { return window.DECKS.filter(function (d) { return d.num === num; })[0]; }

  function gesture() { if (firstGesture) return; firstGesture = true; AUDIO.unlock(); if (!SRS.getSettings().muted) AUDIO.startAmbient(); }

  // ============================================================
  // MENÚ
  // ============================================================
  function renderTopbar() {
    var st = SRS.getStats();
    $("hud-level").textContent = st.level;
    var base = SRS.xpForLevel(st.level), next = SRS.xpForLevel(st.level + 1);
    var pct = next > base ? Math.round((st.xp - base) / (next - base) * 100) : 0;
    $("hud-xpfill").style.width = Math.max(0, Math.min(100, pct)) + "%";
    $("hud-xptext").textContent = st.xp + " XP";
    $("hud-streak-num").textContent = st.streak || 0;
  }

  function renderMenu() {
    renderTopbar();
    var g = SRS.globalStats();
    $("ready-ring").style.setProperty("--pct", g.pct);
    $("ready-ring").style.setProperty("--rc", g.ready ? "var(--gold)" : (g.pct >= 50 ? "var(--aurora-2)" : "var(--aurora-1)"));
    $("ready-pct").textContent = g.pct + "%";
    var v = $("ready-verdict"), d = $("ready-detail");
    if (g.ready) {
      v.textContent = "🐉 ¡LISTO PARA EL EXAMEN!"; v.style.color = "var(--gold)";
      d.textContent = "Dominaste lo suficiente, Dovahkiin. Hora de hacer pruebas de examen.";
    } else if (g.pct >= 50) {
      v.textContent = "Vas bien, pero aún no."; v.style.color = "var(--aurora-2)";
      var names = g.weak.slice(0, 3).map(function (w) { return w.name; }).join(", ");
      d.textContent = "Te falta afianzar " + g.weak.length + " tema(s)" + (names ? ": " + names + (g.weak.length > 3 ? "…" : "") : "") + ".";
    } else {
      v.textContent = "Sigue entrenando, sangre de dragón."; v.style.color = "var(--aurora-1)";
      d.textContent = "Recién empezás. Estudiá los tomos para subir tu preparación.";
    }
    $("stat-mastered").textContent = g.mastered;
    $("stat-total").textContent = g.total;
    $("stat-due").textContent = g.due;
    $("stat-decksdone").textContent = g.decksDone;
    $("due-badge").textContent = g.due;

    var mode = SRS.getSettings().mode;
    $("modeMC").classList.toggle("active", mode === "mc");
    $("modeRecall").classList.toggle("active", mode === "recall");

    // deck grid
    var grid = $("deck-grid"); grid.innerHTML = "";
    window.DECKS.forEach(function (dk) {
      var s = SRS.deckStats(dk.num);
      var statusLbl = { locked: "Sin empezar", progress: "En progreso", solid: "Sólido", mastered: "Dominado" }[s.status];
      var el = document.createElement("button");
      el.type = "button"; el.className = "deck";
      el.innerHTML =
        "<div class='deck-rune'>" + dk.rune + "</div>" +
        "<div class='deck-name'>" + esc(dk.nameEs) + "</div>" +
        "<div class='deck-en'>" + esc(dk.nameEn) + "</div>" +
        "<div class='deck-bar'><div class='deck-fill' style='width:" + s.pct + "%'></div></div>" +
        "<div class='deck-meta'><span class='deck-status st-" + s.status + "'>" + statusLbl + " · " + s.pct + "%</span>" +
        "<span class='deck-due'>" + (s.due ? s.due + " ⏳" : (s.new ? s.new + " nuevas" : "✓")) + "</span></div>";
      el.addEventListener("click", function () { gesture(); startSession(dk.num); });
      grid.appendChild(el);
    });
  }

  // ============================================================
  // ESTUDIO
  // ============================================================
  function startSession(deckNum) {
    queue = SRS.buildSession(deckNum);
    if (!queue.length) { toast("No hay cartas en este tomo."); return; }
    pos = 0; sess = { reviewed: 0, again: 0, ok: 0, good: 0, xp: 0, levelups: 0, mastered: 0, deck: deckNum };
    var dk = deckNum === "all" ? null : deckById(deckNum);
    $("study-deck").textContent = dk ? (dk.rune + " " + dk.nameEs) : "⚔️ Repaso general";
    show("study");
    renderCard();
  }

  function renderCard() {
    revealed = false; chosen = null;
    currentId = queue[pos];
    var card = SRS.getCard(currentId);
    $("study-progress").textContent = (pos + 1) + "/" + queue.length;
    $("study-fill").style.width = (pos / queue.length * 100) + "%";

    var tag = $("card-tag");
    var isNew = SRS.isNew(currentId);
    tag.textContent = isNew ? "NUEVA" : "REPASO";
    tag.className = "card-tag" + (isNew ? "" : " review");

    // figura
    var fig = $("card-figure"), img = $("card-img");
    if (card.img) { img.src = "img/" + card.img; fig.hidden = false; } else { fig.hidden = true; img.removeAttribute("src"); }

    $("card-question").textContent = card.q;

    // opciones
    var optEl = $("card-options"); optEl.innerHTML = ""; optEl.classList.remove("locked");
    card.options.forEach(function (o, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "opt"; b.setAttribute("data-i", i);
      b.innerHTML = "<span class='ol'>" + "ABC".charAt(i) + "</span><span class='ot'></span>";
      b.querySelector(".ot").textContent = o;
      b.addEventListener("click", function () { if (!revealed) choose(i); });
      optEl.appendChild(b);
    });
    var mode = SRS.getSettings().mode;
    optEl.style.display = mode === "mc" ? "flex" : "none";
    $("revealBtn").hidden = (mode === "mc"); // en MC, elegir una opción revela; el botón es para recall

    // back + grades ocultos
    $("card-back").hidden = true;
    $("back-answer").innerHTML = "";
    $("back-expl").textContent = "";
    $("grade-buttons").hidden = true;
    $("card").scrollTop = 0;
  }

  function choose(i) { chosen = i; reveal(); }

  function reveal() {
    if (revealed) return;
    revealed = true;
    var card = SRS.getCard(currentId);
    AUDIO.flip(); AUDIO.reveal();
    var optEl = $("card-options");
    optEl.style.display = "flex";
    optEl.classList.add("locked");
    optEl.querySelectorAll(".opt").forEach(function (b, i) {
      if (i === card.correctIndex) b.classList.add("correct");
      else if (chosen !== null && i === chosen) b.classList.add("wrong");
    });
    var letter = "ABC".charAt(card.correctIndex);
    $("back-answer").innerHTML = "<span class='lead'>RESPUESTA CORRECTA</span>" + letter + ") " + esc(card.options[card.correctIndex]);
    $("back-expl").textContent = card.explanation || "(Sin explicación adicional.)";
    $("card-back").hidden = false;
    $("revealBtn").hidden = true;
    $("grade-buttons").hidden = false;
  }

  function doGrade(rating) {
    if (!revealed) return;
    var r = SRS.grade(currentId, rating);
    sess.reviewed++; sess[rating]++; sess.xp += r.xp;
    if (r.newlyMastered) sess.mastered++;
    if (rating === "again") AUDIO.gradeAgain(); else if (rating === "ok") AUDIO.gradeOk(); else AUDIO.gradeGood();
    if (r.leveledUp) { sess.levelups++; levelUpBanner(r.level); }
    renderTopbar();
    if (rating === "again") { // re-encolar para que vuelva en esta sesión
      var insertAt = Math.min(queue.length, pos + 3);
      queue.splice(insertAt, 0, currentId);
    }
    pos++;
    if (pos >= queue.length) endSession();
    else renderCard();
  }

  function levelUpBanner(level) {
    var el = $("levelup");
    $("lu-title").textContent = "HABILIDAD AUMENTADA";
    $("lu-sub").textContent = "Nivel " + level + " · Dovahkiin";
    el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
    AUDIO.levelUp();
  }

  var FLAVORS = [
    "“La pereza nunca forjó una leyenda.”",
    "“Cada carta dominada es un grito más fuerte.”",
    "“Los dragones no nacen sabios — estudian.”",
    "“By Ysmir, vas tomando forma.”",
    "“El conocimiento es la mejor armadura.”"
  ];
  function endSession() {
    var g = SRS.globalStats();
    // ¿se dominó un tema entero en esta sesión?
    if (sess.deck !== "all") {
      var ds = SRS.deckStats(sess.deck);
      if (ds.status === "mastered" && sess.mastered > 0) {
        AUDIO.dragonSoul();
        var dk = deckById(sess.deck);
        toast("🐉 ¡Tomo dominado: " + dk.nameEs + "!");
      } else if (sess.mastered > 0) { AUDIO.shout(); }
    } else if (sess.mastered > 0) { AUDIO.shout(); }

    $("summary-flavor").textContent = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
    $("summary-stats").innerHTML =
      sum("📚", sess.reviewed, "REPASADAS") +
      sum("✨", "+" + sess.xp, "XP GANADA") +
      sum("🐉", sess.mastered, "NUEVAS DOMINADAS");
    var ready = g.ready
      ? "🐉 Preparación " + g.pct + "% — ¡LISTO PARA EL EXAMEN!"
      : "Preparación global: " + g.pct + "% · " + g.mastered + "/" + g.total + " dominadas";
    $("summary-ready").textContent = ready;
    show("summary");
  }
  function sum(emoji, val, label) { return "<div class='sumstat'><div class='v'>" + emoji + " " + esc(String(val)) + "</div><div class='l'>" + label + "</div></div>"; }

  // ============================================================
  // GUARDAR / CARGAR
  // ============================================================
  function exportSave() {
    var blob = new Blob([SRS.exportData()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var d = new Date();
    a.href = url; a.download = "arcanaeum-save-" + d.getFullYear() + (d.getMonth() + 1) + d.getDate() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("📜 Pergamino de guardado descargado.");
  }
  function importSave(file) {
    var rd = new FileReader();
    rd.onload = function () {
      try { SRS.importData(rd.result); renderMenu(); applyMute(SRS.getSettings().muted); toast("📥 ¡Partida cargada!"); }
      catch (e) { toast("⚠ Archivo inválido."); }
    };
    rd.readAsText(file);
  }

  // ============================================================
  // MUTE
  // ============================================================
  function applyMute(m) {
    SRS.setSetting("muted", m);
    AUDIO.setMuted(m);
    var b = $("muteBtn"); b.textContent = m ? "🔇" : "🔊"; b.classList.toggle("muted", m);
    if (!m && firstGesture) AUDIO.startAmbient();
  }

  // ============================================================
  // INIT
  // ============================================================
  function spawnSnow(n) {
    var s = $("snow"); var html = "";
    for (var i = 0; i < n; i++) {
      var left = Math.random() * 100, size = 0.5 + Math.random() * 1.1, dur = 6 + Math.random() * 10, delay = -Math.random() * dur, drift = (Math.random() * 80 - 40);
      html += "<span class='flake' style='left:" + left + "vw;font-size:" + size + "rem;animation-duration:" + dur + "s;animation-delay:" + delay + "s;--drift:" + drift + "px'>❄</span>";
    }
    s.innerHTML = html;
  }

  function init() {
    spawnSnow(36);
    applyMute(SRS.getSettings().muted);
    renderMenu();

    $("reviewAllBtn").addEventListener("click", function () { gesture(); startSession("all"); });
    $("modeMC").addEventListener("click", function () { SRS.setSetting("mode", "mc"); renderMenu(); });
    $("modeRecall").addEventListener("click", function () { SRS.setSetting("mode", "recall"); renderMenu(); });
    $("revealBtn").addEventListener("click", function () { gesture(); reveal(); });
    $("grade-buttons").addEventListener("click", function (e) { var b = e.target.closest(".grade"); if (b) doGrade(b.getAttribute("data-grade")); });
    $("exitStudy").addEventListener("click", function () { renderMenu(); show("menu"); });
    $("summaryMenu").addEventListener("click", function () { renderMenu(); show("menu"); });
    $("summaryAgain").addEventListener("click", function () { startSession(sess ? sess.deck : "all"); });
    $("muteBtn").addEventListener("click", function () { gesture(); applyMute(!SRS.getSettings().muted); });
    $("exportBtn").addEventListener("click", exportSave);
    $("importBtn").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function (e) { if (e.target.files[0]) importSave(e.target.files[0]); e.target.value = ""; });
    $("resetBtn").addEventListener("click", function () {
      if (confirm("¿Borrar TODO el progreso? Esto no se puede deshacer (hacé respaldo primero).")) { SRS.reset(); renderMenu(); toast("Progreso reiniciado."); }
    });

    document.addEventListener("keydown", function (e) {
      if (screens.study.classList.contains("active")) {
        var mode = SRS.getSettings().mode;
        var k = e.key.toLowerCase();
        if (!revealed) {
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); gesture(); reveal(); }
          else if (mode === "mc" && (k === "a" || k === "1")) choose(0);
          else if (mode === "mc" && (k === "b" || k === "2")) choose(1);
          else if (mode === "mc" && (k === "c" || k === "3")) choose(2);
        } else {
          if (k === "1") doGrade("again");
          else if (k === "2") doGrade("ok");
          else if (k === "3") doGrade("good");
        }
      } else if (screens.menu.classList.contains("active")) {
        if (e.key === "Enter") { gesture(); startSession("all"); }
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
