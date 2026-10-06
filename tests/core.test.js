// Tests du moteur et de la banque de questions : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const bank = require('../site/assets/questions.js');
const core = require('../site/assets/quiz-core.js');

// Générateur pseudo-aléatoire reproductible
function seeded(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

test('la banque est bien formée', () => {
  const ids = new Set();
  const chapterIds = bank.chapters.map((c) => c.id);
  for (const q of bank.questions) {
    assert.ok(!ids.has(q.id), `id dupliqué ${q.id}`);
    ids.add(q.id);
    assert.ok(chapterIds.includes(q.ch), `${q.id}: chapitre inconnu`);
    assert.ok(q.q && q.ex, `${q.id}: énoncé ou explication manquant`);
    if (q.t === 's') {
      assert.equal(typeof q.ok, 'string', `${q.id}: ok doit être un texte`);
      assert.ok(q.ko.length >= 2, `${q.id}: pas assez de distracteurs`);
      assert.ok(!q.ko.includes(q.ok), `${q.id}: bonne réponse en double`);
    } else if (q.t === 'm') {
      assert.ok(Array.isArray(q.ok) && q.ok.length >= 2, `${q.id}: multi sans plusieurs bonnes réponses`);
      assert.ok(q.ko.length >= 1, `${q.id}: pas de distracteur`);
    } else if (q.t === 'o') {
      assert.ok(q.model, `${q.id}: réponse modèle manquante`);
      assert.ok(q.kw.length >= 1 && q.kw.every((g) => g.length >= 2), `${q.id}: mots-clés mal formés`);
      assert.ok(q.min >= 1 && q.min <= q.kw.length, `${q.id}: min invalide`);
    } else {
      assert.fail(`${q.id}: type inconnu ${q.t}`);
    }
  }
});

test('aucune question ne demande de restituer une commande', () => {
  const forbidden = /quelle commande|which command|commande permet|syntaxe|show |configure terminal|switchport /i;
  for (const q of bank.questions) {
    assert.ok(!forbidden.test(q.q), `${q.id} semble porter sur une commande : ${q.q}`);
  }
});

test('chaque réponse modèle de question ouverte est validée par ses mots-clés', () => {
  for (const q of bank.questions.filter((x) => x.t === 'o')) {
    const r = core.gradeOpen(q, q.model);
    assert.ok(r.correct, `${q.id}: la réponse modèle n'obtient que ${r.count}/${r.min}`);
    assert.equal(r.count, q.kw.length, `${q.id}: la réponse modèle ne couvre pas tous les éléments (${r.found})`);
  }
});

test('une réponse vide ou hors sujet est refusée', () => {
  for (const q of bank.questions.filter((x) => x.t === 'o')) {
    assert.equal(core.gradeOpen(q, '').correct, false, q.id);
    assert.equal(core.gradeOpen(q, 'je ne sais pas du tout').correct, false, q.id);
  }
});

test('correspondance des mots-clés : accents, casse, début de mot, nombres', () => {
  const t = core.normalize('La DIFFUSION est arrêtée par le Routeur ; 625 hôtes');
  assert.ok(core.keywordMatches(t, 'diffus'));
  assert.ok(core.keywordMatches(t, 'arrete'));
  assert.ok(core.keywordMatches(t, 'routeur'));
  assert.ok(!core.keywordMatches(t, 'fusion'), 'doit commencer en début de mot');
  assert.ok(!core.keywordMatches(t, '62'), '62 ne doit pas valider 625');
  assert.ok(core.keywordMatches(t, '625'));
});

test('exemples de correction de questions ouvertes', () => {
  const byQ = (start) => bank.questions.find((q) => q.t === 'o' && q.q.startsWith(start));
  const csma = byQ('Expliquez le fonctionnement de CSMA/CD');
  assert.ok(core.gradeOpen(csma, 'Il y a une collision, les PC la détectent, attendent un temps aléatoire et retransmettent').correct);
  assert.ok(!core.gradeOpen(csma, 'Ils attendent').correct);

  const mask = byQ('Écrivez le masque de sous-réseau /27');
  assert.ok(core.gradeOpen(mask, '255.255.255.224').correct);
  assert.ok(!core.gradeOpen(mask, '255.255.255.240').correct);

  const hosts = byQ('Combien d’adresses d’hôtes utilisables un sous-réseau /26');
  assert.ok(core.gradeOpen(hosts, '62 hôtes').correct);
  assert.ok(!core.gradeOpen(hosts, '64').correct);

  const dora = byQ('Décrivez les quatre messages');
  assert.ok(core.gradeOpen(dora, 'Discover, Offer, Request, Ack').correct);
  assert.ok(core.gradeOpen(dora, 'découverte, offre, requête, acquittement').correct);
  assert.ok(!core.gradeOpen(dora, 'Discover puis Offer').correct);

  const layers = byQ('Citez les trois couches du modèle hiérarchique');
  assert.ok(core.gradeOpen(layers, 'accès, distribution et cœur').correct);
  assert.ok(core.gradeOpen(layers, 'access, distribution, core').correct);
});

test('correction des QCM après mélange des options', () => {
  const rand = seeded(42);
  for (const q of bank.questions.filter((x) => x.t !== 'o')) {
    const item = core.prepare(q, rand);
    const goodTexts = item.correctIdx.map((i) => item.options[i]);
    const expected = q.t === 'm' ? q.ok : [q.ok];
    assert.deepEqual(goodTexts.slice().sort(), expected.slice().sort(), q.id);
    assert.ok(core.gradeChoice(item, item.correctIdx.slice().reverse()).correct, q.id);
    const wrong = item.options.findIndex((_, i) => !item.correctIdx.includes(i));
    assert.ok(!core.gradeChoice(item, [wrong]).correct, q.id);
    if (q.t === 'm') {
      assert.ok(!core.gradeChoice(item, [item.correctIdx[0]]).correct, `${q.id}: réponse partielle acceptée`);
    }
  }
});

test('une session contient 20 questions distinctes, mêlant QCM et questions ouvertes', () => {
  for (let s = 1; s <= 50; s++) {
    const items = core.buildSession(bank, { rand: seeded(s) });
    assert.equal(items.length, 20);
    assert.equal(new Set(items.map((i) => i.id)).size, 20);
    const open = items.filter((i) => i.t === 'o').length;
    assert.ok(open >= 5 && open <= 9, `session ${s}: ${open} questions ouvertes`);
    const chapters = new Set(items.map((i) => i.ch));
    assert.equal(chapters.size, 6, `session ${s}: tous les chapitres doivent être représentés`);
  }
});

test('les sessions successives privilégient les questions non vues', () => {
  const seen = {};
  const rand = seeded(7);
  const all = [];
  for (let s = 0; s < 5; s++) {
    const items = core.buildSession(bank, { rand, seen });
    items.forEach((i) => { seen[i.id] = (seen[i.id] || 0) + 1; });
    all.push(items.map((i) => i.id));
  }
  // Les 5 premières sessions (100 questions) ne doivent pas se répéter
  // tant que la banque contient assez de questions inédites.
  const flat = all.flat();
  const unique = new Set(flat).size;
  assert.ok(unique >= 95, `seulement ${unique} questions différentes sur 5 sessions`);
});

test('filtre par chapitres', () => {
  const items = core.buildSession(bank, { rand: seeded(3), chapters: ['vlan', 'sec'] });
  assert.equal(items.length, 20);
  assert.ok(items.every((i) => i.ch === 'vlan' || i.ch === 'sec'));
});

test('calcul du score, des passées et des corrections forcées', () => {
  const items = core.buildSession(bank, { rand: seeded(11) });
  const answers = items.map((item, i) => {
    if (i < 10) return { status: 'answered', correct: true };
    if (i < 15) return { status: 'answered', correct: false };
    return { status: 'skipped' };
  });
  let s = core.computeScore(items, answers);
  assert.equal(s.correct, 10);
  assert.equal(s.wrong, 5);
  assert.equal(s.skipped, 5);
  assert.equal(s.note, 10);
  answers[10].override = true;
  s = core.computeScore(items, answers);
  assert.equal(s.correct, 11);
  assert.equal(s.note, 11);
  answers[16].override = true; // une question passée ne peut pas être forcée
  assert.equal(core.computeScore(items, answers).correct, 11);
});
