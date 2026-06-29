/* ============================================================
   APP — Controlador de UI (Arcanaeum A&P General · Skyrim)
   ============================================================ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var screens = { menu: $("screen-menu"), study: $("screen-study"), summary: $("screen-summary"), exam: $("screen-exam"), examres: $("screen-examres") };

  // nombre del usuario (Abdiel por defecto, override con ?name=)
  var NAME = "Abdiel";
  try { var pn = new URLSearchParams(location.search).get("name"); if (pn && pn.trim()) NAME = pn.trim().slice(0, 20); } catch (e) {}

  // runas (Futhark antiguo) dibujadas como SVG (no dependen de ninguna fuente)
  var RUNE_PATHS = {
    "01": "M8 3 V29 M8 8 L18 4 M8 15 L18 11",          // Fehu
    "02": "M7 29 V6 L17 11 V29",                       // Uruz
    "03": "M9 3 V29 M9 10 L17 14.5 L9 19",             // Thurisaz
    "04": "M9 3 V29 M9 7 L18 12 M9 13 L18 18",         // Ansuz
    "05": "M9 3 V29 M9 3 C19 3 19 16 9 16 M10 16 L18 29", // Raidho
    "06": "M17 5 L8 16 L17 27",                        // Kenaz
    "07": "M6 5 L18 27 M18 5 L6 27",                   // Gebo
    "08": "M7 4 V28 M17 4 V28 M7 13 L17 19",           // Hagalaz
    "09": "M12 3 V29",                                 // Isa
    "10": "M8 5 L13 10 L8 15 M16 17 L11 22 L16 27",    // Jera
    "11": "M12 3 L18 11 L12 19 L6 11 Z M9 17 L6 29 M15 17 L18 29", // Othala
    "12": "M12 3 V29 M12 3 L6 10 M12 3 L18 10"         // Tiwaz
  };
  function runeSvg(code) {
    var d = RUNE_PATHS[code] || RUNE_PATHS["09"];
    return "<svg class='rune-svg' viewBox='0 0 24 32' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='" + d + "'/></svg>";
  }

  // estado de sesión
  var queue = [], pos = 0, currentId = null, revealed = false, chosen = null;
  var sess = null, firstGesture = false;

  function show(name) { Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("active", k === name); }); window.scrollTo(0, 0); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function deckById(num) { for (var i = 0; i < window.DECKS.length; i++) if (window.DECKS[i].num === num) return window.DECKS[i]; return null; }
  function mode() { return SRS.getSettings().mode; }
  var MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function daysUntil(dateStr) { var ex = new Date(dateStr + "T23:59:59"); return Math.ceil((ex - new Date()) / 86400000); }
  function fmtDate(dateStr) { var p = dateStr.split("-"); return parseInt(p[2], 10) + " " + (MONTHS[parseInt(p[1], 10) - 1] || ""); }
  function shuffleArr(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var QUOTES = [
    "“El que persevera alcanza la cima de la Garganta del Mundo.”",
    "Fus… Ro… ¡DAH! Derriba este tema, {name}.",
    "Faltan {days} días. Cada carta te acerca a la idoneidad.",
    "Los Nords no nacen sabios — se forjan estudiando.",
    "La disciplina de hoy es la victoria de mañana, {name}.",
    "Ningún dragón cayó por suerte. A estudiar.",
    "Enciende una runa más en tu Muro de Palabras.",
    "El conocimiento es tu Thu’um. Hazte oír el día del examen.",
    "By the gods, {name} — hoy dominas otro tomo.",
    "{days} días para la gloria. Demuestra tu disciplina, {name}."
  ];
  function showMotd() {
    var d = SRS.daysToExam();
    var q = QUOTES[Math.floor(Math.random() * QUOTES.length)].replace(/\{name\}/g, NAME).replace(/\{days\}/g, d);
    $("motd-text").textContent = q;
    var el = $("motd"); el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
  }

  // ---- música: archivo local (mix ambiental medieval, sin copyright) ----
  var music = null;
  function initMusic() { music = $("music"); if (music) { music.volume = 0.5; music.loop = true; } }
  function startMusic() { if (music && !SRS.getSettings().muted) { var pr = music.play(); if (pr && pr.catch) pr.catch(function () {}); } }
  function pauseMusic() { if (music) music.pause(); }

  function gesture() {
    if (firstGesture) return; firstGesture = true;
    AUDIO.unlock();
    startMusic();
  }

  // ============================================================ MENÚ
  function renderTopbar() {
    var st = SRS.getStats();
    $("hero-name").textContent = NAME;
    $("hud-level").textContent = st.level;
    var base = SRS.xpForLevel(st.level), next = SRS.xpForLevel(st.level + 1);
    var pct = next > base ? Math.round((st.xp - base) / (next - base) * 100) : 0;
    $("hud-xpfill").style.width = Math.max(0, Math.min(100, pct)) + "%";
    $("hud-xptext").textContent = st.xp + " XP";
    $("hud-streak-num").textContent = st.streak || 0;
  }

  function updateModeDesc() {
    var m = mode();
    $("modeMC").classList.toggle("active", m === "mc");
    $("modeRecall").classList.toggle("active", m === "recall");
    $("mode-desc").textContent = m === "mc"
      ? "Ves las 3 opciones, eliges una y te muestra si acertaste + la explicación."
      : "Solo la pregunta: la recuerdas de memoria, revelas y te autocalificas.";
  }

  function renderWordWall() {
    var ww = $("wordwall"); ww.innerHTML = ""; var done = 0;
    window.DECKS.forEach(function (dk) {
      var s = SRS.deckStats(dk.num);
      var lit = s.status === "mastered"; if (lit) done++;
      var el = document.createElement("div");
      el.className = "rune" + (lit ? " lit" : "");
      el.style.setProperty("--glow", s.pct);
      el.title = dk.nameEs + " — " + s.pct + "%";
      el.innerHTML = runeSvg(dk.code);
      ww.appendChild(el);
    });
    $("wordwall-count").textContent = done;
  }

  function renderMenu() {
    renderTopbar(); updateModeDesc();
    var g = SRS.globalStats();
    $("ready-ring").style.setProperty("--pct", g.pct);
    $("ready-ring").style.setProperty("--rc", g.ready ? "var(--gold)" : (g.pct >= 50 ? "var(--aurora-2)" : "var(--aurora-1)"));
    $("ready-pct").textContent = g.pct + "%";
    var v = $("ready-verdict"), d = $("ready-detail");
    if (g.ready) {
      v.textContent = "🐉 ¡LISTO PARA EL EXAMEN!"; v.style.color = "var(--gold)";
      d.textContent = "Has dominado lo suficiente, " + NAME + ". Es hora de hacer pruebas de examen.";
    } else if (g.pct >= 50) {
      v.textContent = "Vas bien, pero aún no."; v.style.color = "var(--aurora-2)";
      var names = g.weak.slice(0, 3).map(function (w) { return w.name; }).join(", ");
      d.textContent = "Te falta afianzar " + g.weak.length + " tema(s)" + (names ? ": " + names + (g.weak.length > 3 ? "…" : "") : "") + ".";
    } else {
      v.textContent = "Sigue entrenando, sangre de dragón."; v.style.color = "var(--aurora-1)";
      d.textContent = "Apenas comienzas, " + NAME + ". Estudia los tomos para subir tu preparación.";
    }
    $("stat-mastered").textContent = g.mastered;
    $("stat-total").textContent = g.total;
    $("stat-due").textContent = g.due;
    $("stat-decksdone").textContent = g.decksDone;
    $("due-badge").textContent = g.due;
    $("review-sub").textContent = g.due > 0
      ? "Tienes " + g.due + " carta(s) para repasar hoy (de todos los temas)."
      : "Sin pendientes por hoy: te dará cartas nuevas para aprender.";

    // ---- Sprint: cuenta regresiva al examen + meta diaria ----
    var exam = SRS.getSettings().examDate, dleft = daysUntil(exam), cd = $("exam-countdown");
    if (dleft > 1) cd.textContent = "faltan " + dleft + " días · " + fmtDate(exam);
    else if (dleft === 1) cd.textContent = "¡mañana! · " + fmtDate(exam);
    else if (dleft === 0) cd.textContent = "¡es hoy! · " + fmtDate(exam);
    else cd.textContent = "ya pasó · " + fmtDate(exam);
    cd.classList.toggle("urgent", dleft <= 2);
    var pl = SRS.plan();
    if (pl.remaining === 0) {
      $("daily-text").textContent = "✓ ¡todo dominado!";
      $("daily-fill").style.width = "100%";
      $("pace-note").textContent = "🐉 Dominaste las " + g.total + " cartas. ¡Listo para el examen!";
    } else {
      $("daily-text").innerHTML = "<b>" + pl.done + "</b> / " + pl.required + " cartas";
      $("daily-fill").style.width = Math.min(100, Math.round(pl.done / pl.required * 100)) + "%";
      var badge = pl.done >= pl.required ? "✅ ¡meta de hoy cumplida!" : (pl.onPace ? "✅ vas al día" : "⚠️ subí el ritmo");
      $("pace-note").innerHTML = "🏁 ~<b>" + pl.required + "</b> cartas/día para dominar todo y estar listo el <b>" + fmtDate(pl.readyBy) + "</b> (" + pl.buffer + " días antes del examen) · " + badge;
    }

    renderWordWall();

    var grid = $("deck-grid"); grid.innerHTML = "";
    window.DECKS.forEach(function (dk) {
      var s = SRS.deckStats(dk.num);
      var statusLbl = { locked: "Sin empezar", progress: "En progreso", solid: "Sólido", mastered: "Dominado" }[s.status];
      var seenPct = s.total ? Math.round(s.seen / s.total * 100) : 0;
      var el = document.createElement("button");
      el.type = "button"; el.className = "deck";
      el.innerHTML =
        "<div class='deck-rune'>" + runeSvg(dk.code) + "</div>" +
        "<div class='deck-name'>" + esc(dk.nameEs) + "</div>" +
        "<div class='deck-en'>" + esc(dk.nameEn) + "</div>" +
        "<div class='deck-bar'><div class='deck-seen' style='width:" + seenPct + "%'></div><div class='deck-fill' style='width:" + s.pct + "%'></div></div>" +
        "<div class='deck-meta'><span class='deck-status st-" + s.status + "'>" + statusLbl + " · " + s.pct + "%</span>" +
        "<span class='deck-due'>" + (s.due ? s.due + " ⏳" : (s.new ? s.new + " nuevas" : "✓")) + "</span></div>";
      el.addEventListener("click", function () { gesture(); startSession(dk.num); });
      grid.appendChild(el);
    });
  }

  // ============================================================ ESTUDIO
  function startSession(deckNum) {
    queue = SRS.buildSession(deckNum);
    if (!queue.length) { toast("No hay cartas en este tomo."); return; }
    pos = 0; sess = { reviewed: 0, again: 0, ok: 0, good: 0, xp: 0, levelups: 0, mastered: 0, deck: deckNum };
    var dk = deckNum === "all" ? null : deckById(deckNum);
    $("study-deck").textContent = dk ? dk.nameEs : "⚔️ Repaso general";
    show("study"); showMotd(); renderCard();
  }

  function renderCard() {
    revealed = false; chosen = null;
    currentId = queue[pos];
    var card = SRS.getCard(currentId);
    $("study-progress").textContent = (pos + 1) + "/" + queue.length;
    $("study-fill").style.width = (pos / queue.length * 100) + "%";

    var tag = $("card-tag"); var isNew = SRS.isNew(currentId);
    tag.textContent = isNew ? "NUEVA" : "REPASO"; tag.className = "card-tag" + (isNew ? "" : " review");

    var fig = $("card-figure"), img = $("card-img");
    if (card.img) { img.src = "img/" + card.img; fig.hidden = false; } else { fig.hidden = true; }

    $("card-question").textContent = card.q;

    var optEl = $("card-options"); optEl.innerHTML = ""; optEl.classList.remove("locked");
    card.options.forEach(function (o, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "opt"; b.setAttribute("data-i", i);
      b.innerHTML = "<span class='ol'>" + "ABC".charAt(i) + "</span><span class='ot'></span>";
      b.querySelector(".ot").textContent = o;
      b.addEventListener("click", function () { if (!revealed) { chosen = i; revealMC(); } });
      optEl.appendChild(b);
    });

    var m = mode();
    optEl.style.display = m === "mc" ? "flex" : "none";
    $("revealBtn").hidden = (m === "mc");
    // reset back/acciones
    $("card-back").hidden = true; $("mc-feedback").hidden = true;
    $("back-answer").innerHTML = ""; $("back-expl").textContent = "";
    $("grade-help").hidden = true; $("grade-buttons").hidden = true; $("continueBtn").hidden = true;
    $("card").scrollTop = 0;
  }

  function fillBack(card) {
    var letter = "ABC".charAt(card.correctIndex);
    $("back-answer").innerHTML = "<span class='lead'>RESPUESTA CORRECTA</span>" + letter + ") " + esc(card.options[card.correctIndex]);
    $("back-expl").textContent = card.explanation || "(Sin explicación adicional.)";
    $("card-back").hidden = false;
  }
  function highlight(card) {
    $("card-options").querySelectorAll(".opt").forEach(function (b, i) {
      if (i === card.correctIndex) b.classList.add("correct");
      else if (chosen !== null && i === chosen) b.classList.add("wrong");
    });
  }

  // MODO OPCIONES: elegir revela, autocalifica y ofrece "Continuar"
  function revealMC() {
    if (revealed) return; revealed = true;
    var card = SRS.getCard(currentId);
    AUDIO.flip();
    var optEl = $("card-options"); optEl.style.display = "flex"; optEl.classList.add("locked");
    highlight(card);
    var correct = chosen === card.correctIndex;
    var mf = $("mc-feedback"); mf.hidden = false; mf.className = "mc-feedback " + (correct ? "ok" : "no");
    mf.textContent = chosen === null
      ? "La respuesta correcta es " + "ABC".charAt(card.correctIndex) + ")"
      : (correct ? "✓ ¡Correcto!" : "✗ Incorrecto — la correcta es " + "ABC".charAt(card.correctIndex) + ")");
    if (correct) AUDIO.correctChime(); else AUDIO.wrongChime();
    fillBack(card);
    $("revealBtn").hidden = true; $("grade-help").hidden = true; $("grade-buttons").hidden = true;
    applyGrade(correct ? "good" : "again");
    $("continueBtn").hidden = false;
  }

  // MODO RECALL: revelar muestra respuesta + 3 botones de autocalificación
  function revealRecall() {
    if (revealed) return; revealed = true;
    var card = SRS.getCard(currentId);
    AUDIO.flip(); AUDIO.reveal();
    var optEl = $("card-options"); optEl.style.display = "flex"; optEl.classList.add("locked");
    highlight(card);
    $("mc-feedback").hidden = true;
    fillBack(card);
    $("revealBtn").hidden = true; $("continueBtn").hidden = true;
    $("grade-help").hidden = false; $("grade-buttons").hidden = false;
  }

  function applyGrade(rating) {
    var r = SRS.grade(currentId, rating);
    sess.reviewed++; sess[rating] = (sess[rating] || 0) + 1; sess.xp += r.xp;
    if (r.newlyMastered) sess.mastered++;
    if (r.leveledUp) { sess.levelups++; levelUpBanner(r.level); }
    renderTopbar();
    if (rating === "again") { var at = Math.min(queue.length, pos + 3); queue.splice(at, 0, currentId); }
  }
  function advance() { pos++; if (pos >= queue.length) endSession(); else renderCard(); }

  function gradeRecall(rating) {
    if (!revealed) return;
    if (rating === "again") AUDIO.gradeAgain(); else if (rating === "ok") AUDIO.gradeOk(); else AUDIO.gradeGood();
    applyGrade(rating); advance();
  }

  function levelUpBanner(level) {
    var el = $("levelup");
    $("lu-title").textContent = "HABILIDAD AUMENTADA";
    $("lu-sub").textContent = "Nivel " + level + " · " + NAME;
    el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
    AUDIO.levelUp();
  }

  var FLAVORS = [
    "“La pereza nunca forjó una leyenda.”",
    "“Cada carta dominada es un grito más fuerte.”",
    "“Los dragones no nacen sabios — estudian.”",
    "“El conocimiento es la mejor armadura.”",
    "“Un paso más hacia las Cumbres de la Garganta del Mundo.”"
  ];
  function endSession() {
    var g = SRS.globalStats();
    if (sess.deck !== "all") {
      var ds = SRS.deckStats(sess.deck);
      if (ds.status === "mastered" && sess.mastered > 0) { AUDIO.dragonSoul(); var dk = deckById(sess.deck); toast("🐉 ¡Tomo dominado: " + dk.nameEs + "!"); }
      else if (sess.mastered > 0) AUDIO.shout();
    } else if (sess.mastered > 0) AUDIO.shout();
    $("summary-flavor").textContent = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
    $("summary-stats").innerHTML = sumstat("📚", sess.reviewed, "REPASADAS") + sumstat("✨", "+" + sess.xp, "XP GANADA") + sumstat("🐉", sess.mastered, "NUEVAS DOMINADAS");
    $("summary-ready").textContent = g.ready
      ? "🐉 Preparación " + g.pct + "% — ¡LISTO PARA EL EXAMEN!"
      : "Preparación global: " + g.pct + "% · " + g.mastered + "/" + g.total + " dominadas";
    show("summary");
  }
  function sumstat(e, v, l) { return "<div class='sumstat'><div class='v'>" + e + " " + esc(String(v)) + "</div><div class='l'>" + l + "</div></div>"; }

  // ============================================================ EXAMEN DE PRÁCTICA
  var EXAM_N = 40, EXAM_PASS = 90, exam = null;
  function startExam() {
    var pool = shuffleArr(window.CARDS).slice(0, Math.min(EXAM_N, window.CARDS.length));
    exam = {
      items: pool.map(function (c) {
        var opts = shuffleArr(c.options.map(function (t, i) { return { text: t, correct: i === c.correctIndex }; }));
        var ci = opts.findIndex(function (o) { return o.correct; });
        return { card: c, opts: opts, correctIdx: ci };
      }), pos: 0, answers: []
    };
    show("exam"); renderExamCard();
  }
  function renderExamCard() {
    var it = exam.items[exam.pos];
    $("exam-progress").textContent = (exam.pos + 1) + "/" + exam.items.length;
    $("exam-bfill").style.width = (exam.pos / exam.items.length * 100) + "%";
    var fig = $("exam-figure"), img = $("exam-img");
    if (it.card.img) { img.src = "img/" + it.card.img; fig.hidden = false; } else { fig.hidden = true; }
    $("exam-question").textContent = it.card.q;
    var box = $("exam-options"); box.innerHTML = "";
    it.opts.forEach(function (o, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "opt";
      b.innerHTML = "<span class='ol'>" + "ABC".charAt(i) + "</span><span class='ot'></span>";
      b.querySelector(".ot").textContent = o.text;
      b.addEventListener("click", function () { examAnswer(i); });
      box.appendChild(b);
    });
    $("exam-card").scrollTop = 0;
  }
  function examAnswer(i) {
    if (!exam || exam.answers[exam.pos] != null) return;
    exam.answers[exam.pos] = i;
    AUDIO.flip();
    exam.pos++;
    if (exam.pos >= exam.items.length) endExam(); else renderExamCard();
  }
  function endExam() {
    var correct = 0, total = exam.items.length;
    exam.items.forEach(function (it, idx) { if (exam.answers[idx] === it.correctIdx) correct++; });
    var pct = Math.round(correct / total * 100), pass = pct >= EXAM_PASS, need = Math.ceil(total * EXAM_PASS / 100);
    $("exam-banner").textContent = pass ? "🐉 ¡APROBADO!" : "✗ No alcanzó";
    $("exam-banner").style.color = pass ? "var(--good)" : "var(--bad)";
    $("exam-score-sub").innerHTML = pass
      ? "<b>" + pct + "%</b> — ¡" + esc(NAME) + ", estás listo para el dragón! 🔥"
      : "<b>" + pct + "%</b> — necesitas " + need + "/" + total + " (90%). ¡Sigue afilando la hoja!";
    $("exam-stats").innerHTML = sumstat("✅", correct, "ACIERTOS") + sumstat("❌", total - correct, "FALLOS") + sumstat("🎯", pct + "%", "NOTA");
    var html = "", wrong = 0;
    exam.items.forEach(function (it, idx) {
      var ch = exam.answers[idx];
      if (ch === it.correctIdx) return;
      wrong++;
      var your = ch == null ? "(sin responder)" : it.opts[ch].text;
      html += "<div class='exrev'><div class='exrev-q'>" + esc(it.card.q) + "</div>" +
        "<div class='exrev-bad'>✗ Tu respuesta: " + esc(your) + "</div>" +
        "<div class='exrev-good'>✓ Correcta: " + esc(it.opts[it.correctIdx].text) + "</div>" +
        (it.card.explanation ? "<div class='exrev-exp'>" + esc(it.card.explanation) + "</div>" : "") + "</div>";
    });
    $("exam-review").innerHTML = wrong ? html : "<div class='exrev'><div class='exrev-q'>🐉 ¡Perfecto! No fallaste ninguna.</div></div>";
    show("examres");
    if (pass) AUDIO.levelUp(); else AUDIO.wrongChime();
  }

  // ============================================================ GUARDAR/CARGAR
  function exportSave() {
    var blob = new Blob([SRS.exportData()], { type: "application/json" });
    var url = URL.createObjectURL(blob), a = document.createElement("a"), d = new Date();
    a.href = url; a.download = "arcanaeum-" + NAME.toLowerCase() + "-" + d.getFullYear() + (d.getMonth() + 1) + d.getDate() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("📜 Pergamino de guardado descargado.");
  }
  function importSave(file) {
    var rd = new FileReader();
    rd.onload = function () { try { SRS.importData(rd.result); renderMenu(); applyMute(SRS.getSettings().muted, false); toast("📥 ¡Partida cargada!"); } catch (e) { toast("⚠ Archivo inválido."); } };
    rd.readAsText(file);
  }

  // ============================================================ MUTE
  function applyMute(m, persist) {
    if (persist !== false) SRS.setSetting("muted", m);
    AUDIO.setMuted(m);
    var b = $("muteBtn"); b.textContent = m ? "🔇" : "🔊"; b.classList.toggle("muted", m);
    if (m) pauseMusic(); else if (firstGesture) startMusic();
  }

  // ============================================================ INIT
  function spawnSnow(n) {
    var s = $("snow"), html = "";
    for (var i = 0; i < n; i++) {
      var left = Math.random() * 100, size = 0.5 + Math.random() * 1.1, dur = 6 + Math.random() * 10, delay = -Math.random() * dur, drift = (Math.random() * 80 - 40);
      html += "<span class='flake' style='left:" + left + "vw;font-size:" + size + "rem;animation-duration:" + dur + "s;animation-delay:" + delay + "s;--drift:" + drift + "px'>❄</span>";
    }
    s.innerHTML = html;
  }

  function spawnStars(n) {
    var s = $("stars"); if (!s) return; var html = "";
    for (var i = 0; i < n; i++) {
      var left = (Math.random() * 100).toFixed(2), top = (Math.random() * 55).toFixed(2),
        sz = (1 + Math.random() * 1.7).toFixed(1), tw = (2 + Math.random() * 4).toFixed(1), d = (-Math.random() * 4).toFixed(1);
      html += "<span class='star' style='left:" + left + "vw;top:" + top + "vh;width:" + sz + "px;height:" + sz + "px;--tw:" + tw + "s;animation-delay:" + d + "s'></span>";
    }
    s.innerHTML = html;
  }

  function init() {
    spawnSnow(36);
    spawnStars(64);
    initMusic();
    applyMute(SRS.getSettings().muted, false);
    renderMenu();
    showMotd();   // saludo motivacional al abrir

    // sincronización online (Firebase): baja lo último al abrir, sube en cada cambio
    if (window.SYNC && window.SYNC.ok) {
      window.ARCANAEUM_MENU_ACTIVE = function () { return screens.menu.classList.contains("active"); };
      window.ARCANAEUM_RERENDER = function () { renderMenu(); };
      SRS.setOnChange(function () { window.SYNC.schedule(); });
      SYNC.pull(function () { renderMenu(); applyMute(SRS.getSettings().muted, false); SYNC.listen(); });
    }

    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
      document.addEventListener(ev, gesture, { once: true });
    });

    $("reviewAllBtn").addEventListener("click", function () { gesture(); startSession("all"); });
    $("modeMC").addEventListener("click", function () { SRS.setSetting("mode", "mc"); updateModeDesc(); });
    $("modeRecall").addEventListener("click", function () { SRS.setSetting("mode", "recall"); updateModeDesc(); });
    $("revealBtn").addEventListener("click", function () { gesture(); revealRecall(); });
    $("continueBtn").addEventListener("click", function () { advance(); });
    $("grade-buttons").addEventListener("click", function (e) { var b = e.target.closest(".grade"); if (b) gradeRecall(b.getAttribute("data-grade")); });
    $("exitStudy").addEventListener("click", function () { renderMenu(); show("menu"); });
    $("summaryMenu").addEventListener("click", function () { renderMenu(); show("menu"); });
    $("summaryAgain").addEventListener("click", function () { startSession(sess ? sess.deck : "all"); });
    $("examBtn").addEventListener("click", function () { gesture(); startExam(); });
    $("exitExam").addEventListener("click", function () { if (confirm("¿Salir del examen? Se perderá este intento.")) { renderMenu(); show("menu"); } });
    $("examRetry").addEventListener("click", function () { gesture(); startExam(); });
    $("examMenu").addEventListener("click", function () { renderMenu(); show("menu"); });
    $("muteBtn").addEventListener("click", function () { gesture(); applyMute(!SRS.getSettings().muted); });

    document.addEventListener("keydown", function (e) {
      if (screens.study.classList.contains("active")) {
        var m = mode(), k = e.key.toLowerCase();
        if (!revealed) {
          if (m === "mc") {
            if (k === "1" || k === "a") { chosen = 0; revealMC(); }
            else if (k === "2" || k === "b") { chosen = 1; revealMC(); }
            else if (k === "3" || k === "c") { chosen = 2; revealMC(); }
            else if (e.key === " " || e.key === "Enter") { e.preventDefault(); chosen = null; revealMC(); }
          } else {
            if (e.key === " " || e.key === "Enter") { e.preventDefault(); revealRecall(); }
          }
        } else {
          if (m === "mc") { if (e.key === " " || e.key === "Enter") { e.preventDefault(); advance(); } }
          else { if (k === "1") gradeRecall("again"); else if (k === "2") gradeRecall("ok"); else if (k === "3") gradeRecall("good"); }
        }
      } else if (screens.exam.classList.contains("active")) {
        var ke = e.key.toLowerCase();
        if (ke === "1" || ke === "a") examAnswer(0);
        else if (ke === "2" || ke === "b") examAnswer(1);
        else if (ke === "3" || ke === "c") examAnswer(2);
      } else if (screens.menu.classList.contains("active")) {
        if (e.key === "Enter") { gesture(); startSession("all"); }
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
