/* Interface du quiz : accueil, session, résultats, correction. */
(function () {
  'use strict';

  var bank = window.QUIZ_BANK;
  var core = window.QuizCore;
  var CH = {};
  bank.chapters.forEach(function (c) { CH[c.id] = c; });

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var view = document.getElementById('view');
  var quitBtn = document.getElementById('quit-btn');
  var modal = document.getElementById('modal');

  /* ------------------------------ Stockage ------------------------------ */
  var KEY = { seen: 'rq.seen', history: 'rq.history', chapters: 'rq.chapters' };
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
  }

  var state = {
    chapters: load(KEY.chapters, bank.chapters.map(function (c) { return c.id; })),
    items: [], answers: [], index: 0, draft: null,
    filter: 'all'
  };
  state.chapters = state.chapters.filter(function (id) { return CH[id]; });
  if (!state.chapters.length) state.chapters = bank.chapters.map(function (c) { return c.id; });

  /* ------------------------------- Outils ------------------------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
  function fmtNote(n) { return String(n).replace('.', ','); }
  function letter(i) { return String.fromCharCode(65 + i); }
  function typeLabel(t) {
    return t === 'o' ? 'Question ouverte' : t === 'm' ? 'QCM · plusieurs réponses' : 'QCM · une réponse';
  }
  var CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  var ARROW = '<span class="arrow" aria-hidden="true">→</span>';

  function render(node, focus) {
    view.innerHTML = '';
    view.appendChild(node);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (focus) view.focus({ preventScroll: true });
  }
  function countByChapter(id) { return bank.questions.filter(function (q) { return q.ch === id; }).length; }

  /* ------------------------------- Accueil ------------------------------ */
  function renderHome() {
    quitBtn.hidden = true;
    var total = bank.questions.length;
    var nOpen = bank.questions.filter(function (q) { return q.t === 'o'; }).length;
    var history = load(KEY.history, []);

    var chaptersHtml = bank.chapters.map(function (c) {
      var on = state.chapters.indexOf(c.id) !== -1;
      return '<button class="chapter" type="button" data-ch="' + c.id + '" aria-pressed="' + on + '">' +
        '<span class="check" aria-hidden="true">' + CHECK_SVG + '</span>' +
        '<span class="chapter-num">CHAPITRE ' + c.num + '</span>' +
        '<h3>' + esc(c.title) + '</h3><p>' + esc(c.desc) + '</p>' +
        '<span class="chapter-count">' + countByChapter(c.id) + ' questions</span></button>';
    }).join('');

    var historyHtml = history.length ? (
      '<section><div class="section-head"><h2>Vos dernières sessions</h2>' +
      '<button class="link-btn" type="button" id="clear-history">Effacer l’historique</button></div>' +
      '<div class="history">' + history.slice(0, 5).map(function (s) {
        var d = new Date(s.date);
        return '<div class="history-row"><span class="note">' + fmtNote(s.note) + ' / 20</span>' +
          '<span>' + s.correct + ' bonnes · ' + s.wrong + ' fausses · ' + s.skipped + ' passées</span>' +
          '<span class="when">' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' +
          d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</span></div>';
      }).join('') + '</div></section>') : '';

    var node = h(
      '<div class="home-grid">' +
      '<section class="hero">' +
        '<div><span class="eyebrow">Préparation à l’évaluation</span>' +
        '<h1>Révisez le cours, <span class="hl">une question à la fois.</span></h1>' +
        '<p class="hero-lead">Des sessions de 20 questions tirées au hasard dans les six chapitres : QCM et questions ouvertes, puis une correction détaillée pour comprendre chaque erreur.</p>' +
        '<div class="hero-cta"><button class="btn btn-primary btn-lg" type="button" id="start">Commencer une session ' + ARROW + '</button></div>' +
        '<div class="hero-meta"><span><b>' + total + '</b>questions</span><span><b>' + nOpen + '</b>questions ouvertes</span><span><b>6</b>chapitres</span></div></div>' +
        '<div class="demo" aria-hidden="true">' +
          '<div class="demo-top"><span>Question 7 / 20</span><span class="chip type">QCM · une réponse</span></div>' +
          '<h3>Un paquet est destiné à 172.16.0.10. Quelle route est utilisée ?</h3>' +
          '<div class="options">' +
            '<div class="opt"><span class="key">A</span><span>172.16.0.0/12</span></div>' +
            '<div class="opt" aria-checked="true"><span class="key">B</span><span>172.16.0.0/26</span></div>' +
            '<div class="opt"><span class="key">C</span><span>172.16.0.0/18</span></div>' +
          '</div><span class="demo-tag">Plus long préfixe ✓</span></div>' +
      '</section>' +
      '<section><div class="section-head"><div><h2>Chapitres de la session</h2>' +
        '<p>Tous sont inclus par défaut. Touchez une carte pour la retirer.</p></div>' +
        '<button class="link-btn" type="button" id="toggle-all"></button></div>' +
        '<div class="chapters">' + chaptersHtml + '</div></section>' +
      '<section class="how">' +
        '<div><b>20 questions variées</b><p>Environ 13 QCM et 7 questions ouvertes, réparties sur les chapitres choisis.</p></div>' +
        '<div><b>Des sessions qui changent</b><p>Les questions déjà vues passent après les nouvelles : vous les rencontrez toutes avant de les revoir.</p></div>' +
        '<div><b>Une correction qui explique</b><p>Pour chaque question : votre réponse, la bonne réponse et la notion à retenir.</p></div>' +
      '</section>' +
      historyHtml +
      '<p class="notice">Le professeur a annoncé qu’aucune question ne porterait directement sur les commandes réseau : la banque ne couvre que les concepts, protocoles, architectures et mécanismes du cours.</p>' +
      '</div>'
    );
    render(node);

    var startBtn = document.getElementById('start');
    var toggleAll = document.getElementById('toggle-all');
    function syncButtons() {
      startBtn.disabled = state.chapters.length === 0;
      toggleAll.textContent = state.chapters.length === bank.chapters.length ? 'Tout désélectionner' : 'Tout sélectionner';
    }
    syncButtons();
    view.querySelectorAll('.chapter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.ch, i = state.chapters.indexOf(id);
        if (i === -1) state.chapters.push(id); else state.chapters.splice(i, 1);
        btn.setAttribute('aria-pressed', i === -1);
        save(KEY.chapters, state.chapters);
        syncButtons();
      });
    });
    toggleAll.addEventListener('click', function () {
      var all = state.chapters.length !== bank.chapters.length;
      state.chapters = all ? bank.chapters.map(function (c) { return c.id; }) : [];
      view.querySelectorAll('.chapter').forEach(function (b) { b.setAttribute('aria-pressed', all); });
      save(KEY.chapters, state.chapters);
      syncButtons();
    });
    startBtn.addEventListener('click', startSession);
    var clear = document.getElementById('clear-history');
    if (clear) clear.addEventListener('click', function () { save(KEY.history, []); renderHome(); });
  }

  /* ------------------------------- Session ------------------------------ */
  function startSession() {
    state.items = core.buildSession(bank, { chapters: state.chapters, seen: load(KEY.seen, {}) });
    state.answers = [];
    state.index = 0;
    state.filter = 'all';
    renderQuiz();
  }

  function ledsHtml(cls) {
    return '<div class="leds ' + (cls || '') + '" aria-hidden="true" style="grid-template-columns:repeat(' + state.items.length + ',minmax(0,1fr))">' +
      state.items.map(function (_, i) { return '<i class="led"></i>'; }).join('') + '</div>';
  }

  function renderQuiz() {
    quitBtn.hidden = false;
    var node = h(
      '<div class="quiz">' +
        '<div class="progress">' +
          '<div class="progress-row"><span class="progress-count" id="pcount" aria-live="polite"></span><span class="progress-pct" id="ppct"></span></div>' +
          '<div class="bar" role="progressbar" aria-label="Progression de la session" aria-valuemin="0" aria-valuemax="' + state.items.length + '"><i id="pbar"></i></div>' +
          ledsHtml() +
        '</div>' +
        '<div id="qslot"></div>' +
        '<p class="kbd-hint"><kbd>1</kbd>–<kbd>6</kbd> pour choisir · <kbd>Entrée</kbd> pour valider · <kbd>Ctrl</kbd>+<kbd>Entrée</kbd> dans une réponse écrite</p>' +
      '</div>'
    );
    render(node);
    showQuestion(false);
  }

  function updateProgress() {
    var n = state.items.length, i = state.index;
    document.getElementById('pcount').innerHTML = 'Question ' + (i + 1) + ' <span>/ ' + n + '</span>';
    var done = state.answers.length;
    document.getElementById('ppct').textContent = Math.round((done / n) * 100) + ' %';
    var bar = document.getElementById('pbar');
    bar.style.width = (done / n) * 100 + '%';
    bar.parentNode.setAttribute('aria-valuenow', done);
    view.querySelectorAll('.quiz .led').forEach(function (led, k) {
      var a = state.answers[k];
      led.className = 'led' + (k === i ? ' current' : a ? (a.status === 'skipped' ? ' skipped' : ' answered') : '');
    });
  }

  function hasAnswer() {
    var d = state.draft;
    return d && (Array.isArray(d) ? d.length > 0 : d.trim().length > 0);
  }

  function showQuestion(animate) {
    var item = state.items[state.index];
    var slot = document.getElementById('qslot');
    var isLast = state.index === state.items.length - 1;
    state.draft = item.t === 'o' ? '' : [];
    updateProgress();

    var body;
    if (item.t === 'o') {
      body = '<div class="open-field"><label class="qhint" for="open-answer">Rédigez votre réponse : la correction repose sur les notions attendues, pas sur une formulation exacte.</label>' +
        '<textarea id="open-answer" placeholder="Votre réponse…" autocomplete="off" spellcheck="true"></textarea>' +
        '<div class="open-help"><span>Citez les éléments clés avec vos mots.</span><span id="charcount">0 caractère</span></div></div>';
    } else {
      body = '<p class="qhint">' + (item.t === 'm' ? 'Sélectionnez toutes les bonnes réponses.' : 'Sélectionnez une seule réponse.') + '</p>' +
        '<div class="options" role="' + (item.t === 'm' ? 'group' : 'radiogroup') + '" aria-label="Réponses">' +
        item.options.map(function (o, k) {
          return '<button type="button" class="opt' + (item.t === 'm' ? ' multi' : '') + '" role="' + (item.t === 'm' ? 'checkbox' : 'radio') + '" aria-checked="false" data-k="' + k + '">' +
            '<span class="key">' + letter(k) + '</span><span>' + esc(o) + '</span></button>';
        }).join('') + '</div>';
    }

    var card = h(
      '<article class="qcard' + (animate === false && reduceMotion ? '' : ' enter') + '">' +
        '<div class="qmeta"><span class="chip">Ch. ' + CH[item.ch].num + ' · ' + esc(CH[item.ch].short) + '</span>' +
        '<span class="chip type">' + typeLabel(item.t) + '</span>' +
        (item.sc ? '<span class="chip scen">Mise en situation</span>' : '') + '</div>' +
        '<h2 class="qtext" id="qtext">' + esc(item.q) + '</h2>' + body +
        '<div class="qactions">' +
          '<button class="btn btn-ghost" type="button" id="skip">Passer</button>' +
          '<button class="btn btn-primary btn-next" type="button" id="next" disabled>' + (isLast ? 'Terminer' : 'Suivant') + ' ' + ARROW + '</button>' +
        '</div>' +
      '</article>'
    );

    function mount() {
      slot.innerHTML = '';
      slot.appendChild(card);
      wireQuestion(item);
    }
    var old = slot.firstElementChild;
    if (old && !reduceMotion) {
      old.classList.remove('enter');
      old.classList.add('leave');
      setTimeout(mount, 200);
    } else mount();
  }

  function wireQuestion(item) {
    var next = document.getElementById('next');
    var skip = document.getElementById('skip');
    var wasReady = false;
    function sync() {
      var ready = hasAnswer();
      next.disabled = !ready;
      if (ready && !wasReady) {
        next.classList.remove('ready');
        void next.offsetWidth; // relance l'animation
        next.classList.add('ready');
      }
      if (!ready) next.classList.remove('ready');
      wasReady = ready;
    }

    if (item.t === 'o') {
      var ta = document.getElementById('open-answer');
      var cc = document.getElementById('charcount');
      ta.addEventListener('input', function () {
        state.draft = ta.value;
        var n = ta.value.trim().length;
        cc.textContent = n + (n > 1 ? ' caractères' : ' caractère');
        sync();
      });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && hasAnswer()) { e.preventDefault(); submit(); }
      });
      if (window.matchMedia('(pointer: fine)').matches) ta.focus({ preventScroll: true });
    } else {
      view.querySelectorAll('.opt').forEach(function (btn) {
        btn.addEventListener('click', function () { toggleOption(item, Number(btn.dataset.k)); sync(); });
      });
    }
    next.addEventListener('click', submit);
    skip.addEventListener('click', skipQuestion);
    state.sync = sync;
  }

  function toggleOption(item, k) {
    if (k >= item.options.length) return;
    if (item.t === 'm') {
      var i = state.draft.indexOf(k);
      if (i === -1) state.draft.push(k); else state.draft.splice(i, 1);
    } else {
      state.draft = [k];
    }
    view.querySelectorAll('.opt').forEach(function (b) {
      b.setAttribute('aria-checked', state.draft.indexOf(Number(b.dataset.k)) !== -1);
    });
  }

  function recordSeen(item) {
    var seen = load(KEY.seen, {});
    seen[item.id] = (seen[item.id] || 0) + 1;
    save(KEY.seen, seen);
  }

  function submit() {
    if (!hasAnswer()) return;
    var item = state.items[state.index];
    var a = { status: 'answered', value: state.draft };
    if (item.t === 'o') {
      var g = core.gradeOpen(item.source, state.draft);
      a.correct = g.correct; a.grade = g;
    } else {
      a.correct = core.gradeChoice(item, state.draft).correct;
    }
    state.answers[state.index] = a;
    recordSeen(item);
    advance();
  }

  function skipQuestion() {
    state.answers[state.index] = { status: 'skipped' };
    recordSeen(state.items[state.index]);
    advance();
  }

  function advance() {
    if (state.index < state.items.length - 1) {
      state.index++;
      showQuestion(true);
    } else {
      finishSession();
    }
  }

  document.addEventListener('keydown', function (e) {
    if (!modal.hidden) { if (e.key === 'Escape') closeModal(); return; }
    var item = state.items[state.index];
    if (!document.getElementById('qslot') || !item || item.t === 'o') return;
    if (e.target && /^(TEXTAREA|INPUT|BUTTON)$/.test(e.target.tagName) && e.key === 'Enter') return;
    if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
    if (/^[1-9]$/.test(e.key)) { toggleOption(item, Number(e.key) - 1); state.sync(); }
    else if (e.key === 'Enter' && hasAnswer()) { e.preventDefault(); submit(); }
  });

  /* ------------------------------ Résultats ----------------------------- */
  function finishSession() {
    var s = core.computeScore(state.items, state.answers);
    var history = load(KEY.history, []);
    history.unshift({ date: Date.now(), note: s.note, correct: s.correct, wrong: s.wrong, skipped: s.skipped });
    save(KEY.history, history.slice(0, 20));
    renderResults();
  }

  function verdict(note) {
    if (note >= 16) return ['Excellent travail !', 'Vous maîtrisez très bien ces notions. Relisez la correction pour consolider les quelques points manqués.'];
    if (note >= 12) return ['Bonne session', 'Les bases sont là. La correction détaillée vous montre précisément quoi revoir.'];
    if (note >= 8) return ['Des notions à consolider', 'Parcourez la correction : chaque explication résume la notion à retenir.'];
    return ['Continuez à vous entraîner', 'Commencez par la correction, puis relancez une session : les questions changent à chaque fois.'];
  }

  function ledClass(a) {
    if (!a || a.status === 'skipped') return 'skipped';
    return core.isCorrect(a) ? 'ok' : 'ko';
  }

  function renderResults() {
    quitBtn.hidden = true;
    var s = core.computeScore(state.items, state.answers);
    var v = verdict(s.note);
    var C = 2 * Math.PI * 80;
    var chapterRows = bank.chapters.filter(function (c) { return s.byChapter[c.id]; }).map(function (c) {
      var b = s.byChapter[c.id];
      return '<div class="chbar"><span class="name">' + esc(c.title) + '</span>' +
        '<div class="bar"><i data-w="' + (b.correct / b.total) * 100 + '"></i></div>' +
        '<span class="val">' + b.correct + '/' + b.total + '</span></div>';
    }).join('');

    var node = h(
      '<div class="results">' +
        '<section class="score-card">' +
          '<div class="ring"><svg viewBox="0 0 190 190"><circle class="track" cx="95" cy="95" r="80"/>' +
            '<circle class="fill" id="ring" cx="95" cy="95" r="80" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg>' +
            '<div class="ring-label"><b id="note">0</b><span>sur 20</span></div></div>' +
          '<div class="score-text"><h1>' + v[0] + '</h1><p>' + v[1] + '</p>' +
            '<div class="stats">' +
              '<div class="stat ok"><b>' + s.correct + '</b><span>Bonnes réponses</span></div>' +
              '<div class="stat ko"><b>' + s.wrong + '</b><span>Mauvaises réponses</span></div>' +
              '<div class="stat skip"><b>' + s.skipped + '</b><span>Questions passées</span></div>' +
            '</div>' +
            '<div class="leds result-leds" style="grid-template-columns:repeat(' + state.items.length + ',minmax(0,1fr))" aria-hidden="true">' +
              state.items.map(function (_, i) { return '<i class="led ' + ledClass(state.answers[i]) + '"></i>'; }).join('') + '</div>' +
          '</div>' +
        '</section>' +
        '<section class="panel"><h2>Résultats par chapitre</h2><div class="chbars">' + chapterRows + '</div></section>' +
        '<div class="result-actions">' +
          '<button class="btn btn-primary btn-lg" type="button" id="see-review">Voir la correction détaillée ' + ARROW + '</button>' +
          '<button class="btn btn-ghost btn-lg" type="button" id="restart">Recommencer une session</button>' +
        '</div>' +
      '</div>'
    );
    render(node, true);

    // Animations : anneau, compteur de note, barres
    var ring = document.getElementById('ring');
    var noteEl = document.getElementById('note');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ring.style.strokeDashoffset = C * (1 - s.note / 20);
        view.querySelectorAll('.chbar .bar i').forEach(function (b) { b.style.width = b.dataset.w + '%'; });
      });
    });
    if (reduceMotion) noteEl.textContent = fmtNote(s.note);
    else {
      var t0 = performance.now();
      (function tick(t) {
        var p = Math.min(1, (t - t0) / 1200), e = 1 - Math.pow(1 - p, 3);
        noteEl.textContent = fmtNote(Math.round(s.note * e * 2) / 2);
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }
    document.getElementById('see-review').addEventListener('click', renderReview);
    document.getElementById('restart').addEventListener('click', startSession);
  }

  /* ------------------------------ Correction ---------------------------- */
  function statusOf(a) {
    if (!a || a.status === 'skipped') return 'skip';
    return core.isCorrect(a) ? 'ok' : 'ko';
  }
  var STATUS_LABEL = { ok: 'Correcte', ko: 'Incorrecte', skip: 'Passée' };

  function reviewItemHtml(item, i) {
    var a = state.answers[i];
    var st = statusOf(a);
    var parts = [];
    if (item.t === 'o') {
      var src = item.source;
      var grade = a && a.grade;
      parts.push('<div class="rblock"><span class="rlabel">Votre réponse</span>' +
        (a && a.status === 'answered'
          ? '<div class="user-text">' + esc(a.value) + '</div>'
          : '<div class="user-text empty">Question passée</div>') + '</div>');
      parts.push('<div class="rblock"><span class="rlabel">Éléments de réponse attendus</span>' +
        '<ul class="kw-list">' + src.kw.map(function (g, k) {
          var cls = grade ? (grade.found[k] ? 'hit' : 'miss') : '';
          return '<li class="' + cls + '">' + esc(g[0]) + '</li>';
        }).join('') + '</ul>' +
        '<p class="kw-note">' + (grade ? grade.count + ' élément' + (grade.count > 1 ? 's' : '') + ' reconnu' + (grade.count > 1 ? 's' : '') + ' sur ' + src.kw.length + ' · ' : '') +
        grade_min_text(src) + '</p></div>');
      parts.push('<div class="rblock"><span class="rlabel">Exemple de réponse complète</span><p class="model">' + esc(src.model) + '</p></div>');
    } else {
      var chosen = a && a.status === 'answered' ? a.value : [];
      parts.push('<div class="rblock"><span class="rlabel">' + (a && a.status === 'answered' ? 'Votre réponse et la correction' : 'Bonne réponse') + '</span>' +
        '<ul class="ropts">' + item.options.map(function (o, k) {
          var good = item.correctIdx.indexOf(k) !== -1;
          var picked = chosen.indexOf(k) !== -1;
          var cls = good ? 'good' : picked ? 'bad' : '';
          var mk = good ? '✓' : picked ? '✗' : letter(k);
          var tag = good && picked ? 'Votre choix · correct' : good ? 'Bonne réponse' : picked ? 'Votre choix' : '';
          return '<li class="' + cls + '"><span class="mk">' + mk + '</span><span>' + esc(o) + '</span><span class="tag">' + tag + '</span></li>';
        }).join('') + '</ul></div>');
    }
    parts.push('<div class="explain"><span class="bulb">À retenir</span><p>' + esc(item.ex) + '</p></div>');
    if (item.t === 'o' && a && a.status === 'answered' && (!a.correct || a.override)) {
      parts.push('<button class="btn btn-ghost btn-sm override" type="button" data-override="' + i + '">' +
        (a.override ? 'Annuler : compter comme incorrecte' : 'Ma réponse contient ces notions : la compter juste') + '</button>');
    }
    return '<article class="ritem" data-status="' + st + '" style="animation-delay:' + Math.min(i, 8) * 0.04 + 's">' +
      '<div class="ritem-top"><span class="ritem-meta">Q' + (i + 1) + ' · CH. ' + CH[item.ch].num + ' ' + esc(CH[item.ch].short).toUpperCase() + ' · ' + typeLabel(item.t).toUpperCase() + '</span>' +
      '<span class="status ' + st + '">' + STATUS_LABEL[st] + '</span></div>' +
      '<h3>' + esc(item.q) + '</h3>' + parts.join('') + '</article>';
  }
  function grade_min_text(src) {
    return src.min >= src.kw.length
      ? 'Tous les éléments sont nécessaires.'
      : src.min + ' élément' + (src.min > 1 ? 's' : '') + ' sur ' + src.kw.length + ' suffisent pour valider.';
  }

  function renderReview() {
    quitBtn.hidden = true;
    var s = core.computeScore(state.items, state.answers);
    var counts = { all: state.items.length, ko: s.wrong, skip: s.skipped, ok: s.correct };
    var filters = [['all', 'Toutes'], ['ko', 'Incorrectes'], ['skip', 'Passées'], ['ok', 'Correctes']];
    var node = h(
      '<div class="review">' +
        '<div class="review-head"><h1>Correction détaillée</h1>' +
          '<span class="review-score">Note : <b id="rv-note">' + fmtNote(s.note) + '</b> / 20</span></div>' +
        '<div class="filters" role="group" aria-label="Filtrer les questions">' + filters.map(function (f) {
          return '<button class="filter" type="button" data-f="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + f[1] + '<span>' + counts[f[0]] + '</span></button>';
        }).join('') + '</div>' +
        '<div class="ritems" id="ritems">' + state.items.map(reviewItemHtml).join('') + '</div>' +
        '<p class="empty-filter" id="empty-filter" hidden>Aucune question dans cette catégorie.</p>' +
        '<div class="result-actions">' +
          '<button class="btn btn-ghost btn-lg" type="button" id="back-results">Retour aux résultats</button>' +
          '<button class="btn btn-primary btn-lg" type="button" id="restart2">Recommencer une session ' + ARROW + '</button>' +
        '</div>' +
      '</div>'
    );
    render(node, true);
    applyFilter();

    view.querySelectorAll('.filter').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.dataset.f;
        view.querySelectorAll('.filter').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        applyFilter();
      });
    });
    document.getElementById('ritems').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-override]');
      if (!btn) return;
      var i = Number(btn.dataset.override);
      state.answers[i].override = !state.answers[i].override;
      var y = window.scrollY;
      updateLastHistory();
      renderReview();
      window.scrollTo(0, y);
    });
    document.getElementById('back-results').addEventListener('click', renderResults);
    document.getElementById('restart2').addEventListener('click', startSession);
  }

  function applyFilter() {
    var shown = 0;
    view.querySelectorAll('.ritem').forEach(function (el) {
      var on = state.filter === 'all' || el.dataset.status === state.filter;
      el.hidden = !on;
      if (on) shown++;
    });
    document.getElementById('empty-filter').hidden = shown > 0;
  }

  // Une réponse requalifiée met à jour la note enregistrée de la session.
  function updateLastHistory() {
    var s = core.computeScore(state.items, state.answers);
    var history = load(KEY.history, []);
    if (history.length) {
      history[0].note = s.note; history[0].correct = s.correct; history[0].wrong = s.wrong; history[0].skipped = s.skipped;
      save(KEY.history, history);
    }
  }

  /* ------------------------------ Navigation ---------------------------- */
  function openModal() { modal.hidden = false; document.getElementById('modal-cancel').focus(); }
  function closeModal() { modal.hidden = true; }
  quitBtn.addEventListener('click', openModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', function () { closeModal(); renderHome(); });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.getElementById('brand').addEventListener('click', function () {
    if (!quitBtn.hidden) openModal(); else renderHome();
  });

  renderHome();
})();
