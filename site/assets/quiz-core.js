/*
 * Moteur du quiz : sélection des questions, mélange des réponses, correction.
 * Sans dépendance et sans accès au DOM, pour être testé sous Node.
 */
(function (root) {
  var SESSION_SIZE = 20;
  var OPEN_RATIO = 0.35; // ~7 questions ouvertes sur 20

  function shuffle(list, rand) {
    rand = rand || Math.random;
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* ---------------------------- Normalisation ---------------------------- */

  function normalize(text) {
    return String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/œ/g, 'oe')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Début de mot obligatoire ; fin de mot obligatoire seulement si le
  // mot-clé se termine par un chiffre (« 62 » ne doit pas valider « 625 »).
  function keywordMatches(normText, keyword) {
    var k = normalize(keyword);
    if (!k) return false;
    var re = '(^|[^a-z0-9])' + escapeRegExp(k);
    if (/[0-9]$/.test(k)) re += '(?![0-9])';
    return new RegExp(re).test(normText);
  }

  /* ------------------------------ Correction ----------------------------- */

  function gradeOpen(question, answer) {
    var text = normalize(answer);
    var found = question.kw.map(function (group) {
      var synonyms = group.slice(1);
      return synonyms.some(function (k) { return keywordMatches(text, k); });
    });
    var count = found.filter(Boolean).length;
    var min = Math.min(question.min || 1, question.kw.length);
    return {
      correct: text.length > 0 && count >= min,
      found: found,
      count: count,
      min: min
    };
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var s = a.slice().sort().join(',');
    return s === b.slice().sort().join(',');
  }

  function gradeChoice(item, selected) {
    return { correct: sameSet(selected || [], item.correctIdx) };
  }

  /* ------------------------- Préparation des items ------------------------ */

  // Transforme une question de la banque en item jouable (options mélangées).
  function prepare(question, rand) {
    var item = { id: question.id, ch: question.ch, t: question.t, q: question.q,
                 ex: question.ex, sc: !!question.sc, source: question };
    if (question.t === 'o') return item;
    var oks = question.t === 'm' ? question.ok : [question.ok];
    var opts = oks.map(function (text) { return { text: text, ok: true }; })
      .concat(question.ko.map(function (text) { return { text: text, ok: false }; }));
    opts = shuffle(opts, rand);
    item.options = opts.map(function (o) { return o.text; });
    item.correctIdx = opts.reduce(function (acc, o, i) { if (o.ok) acc.push(i); return acc; }, []);
    return item;
  }

  /* ------------------------------ Sélection ------------------------------ */

  // Répartit les choix entre chapitres (tourniquet) en privilégiant les
  // questions les moins vues lors des sessions précédentes.
  function pickBalanced(pool, count, seen, rand) {
    var byCh = {};
    shuffle(pool, rand).forEach(function (q) {
      (byCh[q.ch] = byCh[q.ch] || []).push(q);
    });
    Object.keys(byCh).forEach(function (ch) {
      byCh[ch].sort(function (a, b) { return (seen[a.id] || 0) - (seen[b.id] || 0); });
    });
    var picked = [];
    var chapters = shuffle(Object.keys(byCh), rand);
    while (picked.length < count) {
      var progressed = false;
      // À chaque tour, servir d'abord les chapitres dont la meilleure
      // question restante est la moins vue.
      chapters.sort(function (a, b) {
        var qa = byCh[a][0], qb = byCh[b][0];
        if (!qa) return 1;
        if (!qb) return -1;
        return (seen[qa.id] || 0) - (seen[qb.id] || 0);
      });
      for (var i = 0; i < chapters.length && picked.length < count; i++) {
        var q = byCh[chapters[i]].shift();
        if (q) { picked.push(q); progressed = true; }
      }
      if (!progressed) break;
    }
    return picked;
  }

  function buildSession(bank, opts) {
    opts = opts || {};
    var rand = opts.rand || Math.random;
    var size = opts.size || SESSION_SIZE;
    var seen = opts.seen || {};
    var chapters = opts.chapters && opts.chapters.length ? opts.chapters : null;
    var pool = bank.questions.filter(function (q) {
      return !chapters || chapters.indexOf(q.ch) !== -1;
    });
    size = Math.min(size, pool.length);

    var open = pool.filter(function (q) { return q.t === 'o'; });
    var closed = pool.filter(function (q) { return q.t !== 'o'; });
    var nOpen = Math.min(open.length, Math.round(size * OPEN_RATIO));
    var nClosed = Math.min(closed.length, size - nOpen);
    nOpen = Math.min(open.length, size - nClosed);

    var picked = pickBalanced(open, nOpen, seen, rand)
      .concat(pickBalanced(closed, nClosed, seen, rand));
    return shuffle(picked, rand).map(function (q) { return prepare(q, rand); });
  }

  /* -------------------------------- Score -------------------------------- */

  // answers[i] : { status: 'answered'|'skipped', value, correct, override }
  function isCorrect(a) {
    if (!a || a.status !== 'answered') return false;
    return a.override === true ? true : !!a.correct;
  }

  function computeScore(items, answers) {
    var res = { total: items.length, correct: 0, wrong: 0, skipped: 0, byChapter: {} };
    items.forEach(function (item, i) {
      var a = answers[i];
      var c = res.byChapter[item.ch] = res.byChapter[item.ch] || { total: 0, correct: 0 };
      c.total++;
      if (!a || a.status === 'skipped') res.skipped++;
      else if (isCorrect(a)) { res.correct++; c.correct++; }
      else res.wrong++;
    });
    var raw = res.total ? (res.correct / res.total) * 20 : 0;
    res.note = Math.round(raw * 2) / 2; // arrondi au demi-point
    res.percent = res.total ? Math.round((res.correct / res.total) * 100) : 0;
    return res;
  }

  var api = {
    SESSION_SIZE: SESSION_SIZE,
    normalize: normalize,
    keywordMatches: keywordMatches,
    gradeOpen: gradeOpen,
    gradeChoice: gradeChoice,
    prepare: prepare,
    buildSession: buildSession,
    computeScore: computeScore,
    isCorrect: isCorrect,
    shuffle: shuffle
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuizCore = api;
})(this);
