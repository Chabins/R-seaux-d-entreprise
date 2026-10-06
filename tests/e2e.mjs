// Test de bout en bout dans Chromium : npm run test:e2e
// Lance le serveur local, joue une session complète et vérifie l'affichage.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright'); }

const PORT = 3123;
const shots = process.env.SHOTS_DIR || 'tests/screenshots';
mkdirSync(shots, { recursive: true });
const server = spawn(process.execPath, ['serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));

const browser = await playwright.chromium.launch();
const errors = [];
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/1-accueil.png`, fullPage: true });

  await page.click('#start');
  const seenFirst = [];
  let answered = 0, skipped = 0;
  for (let i = 1; i <= 20; i++) {
    await page.waitForSelector('.qcard:not(.leave)');
    await page.waitForTimeout(80);
    const count = (await page.textContent('#pcount')).replace(/\s+/g, ' ').trim();
    assert.equal(count, `Question ${i} / 20`, 'compteur de progression');
    assert.ok(await page.isDisabled('#next'), 'Suivant doit être désactivé sans réponse');
    seenFirst.push(await page.textContent('#qtext'));

    if (i % 6 === 0) { await page.click('#skip'); skipped++; continue; }
    const isOpen = await page.$('#open-answer');
    if (isOpen) {
      await page.fill('#open-answer', i % 2 ? 'collision détection aléatoire retransmet' : 'je ne sais pas');
    } else {
      await page.click('.opt[data-k="0"]');
    }
    assert.ok(!(await page.isDisabled('#next')), 'Suivant doit être activé après une réponse');
    assert.ok(await page.$eval('#next', (b) => b.classList.contains('ready')), 'animation d’activation');
    if (i === 3) await page.screenshot({ path: `${shots}/2-question.png` });
    if (isOpen && !page.__openShot) { page.__openShot = true; await page.screenshot({ path: `${shots}/3-question-ouverte.png` }); }
    await page.click('#next');
    answered++;
  }

  await page.waitForSelector('.score-card');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${shots}/4-resultats.png`, fullPage: true });
  const stats = await page.$$eval('.stat b', (els) => els.map((e) => Number(e.textContent)));
  assert.equal(stats[0] + stats[1], answered, 'bonnes + mauvaises = répondues');
  assert.equal(stats[2], skipped, 'questions passées');
  const note = Number((await page.textContent('#note')).replace(',', '.'));
  assert.equal(note, Math.round((stats[0] / 20) * 20 * 2) / 2, 'note sur 20');

  await page.click('#see-review');
  await page.waitForSelector('.ritem');
  assert.equal(await page.$$eval('.ritem', (e) => e.length), 20, '20 corrections');
  assert.equal(await page.$$eval('.ritem[data-status="skip"]', (e) => e.length), skipped);
  assert.equal(await page.$$eval('.ritem .explain', (e) => e.length), 20, 'explication pour chaque question');
  await page.screenshot({ path: `${shots}/5-correction.png`, fullPage: false });

  // Filtre « Passées »
  await page.click('.filter[data-f="skip"]');
  assert.equal(await page.$$eval('.ritem:not([hidden])', (e) => e.length), skipped);
  await page.click('.filter[data-f="all"]');

  // Requalifier une réponse ouverte jugée fausse
  const ov = await page.$('[data-override]');
  if (ov) {
    const before = Number((await page.textContent('#rv-note')).replace(',', '.'));
    await ov.click();
    await page.waitForSelector('.ritem');
    const after = Number((await page.textContent('#rv-note')).replace(',', '.'));
    assert.equal(after, before + 1, 'la requalification ajoute un point');
  }

  // Nouvelle session : questions différentes
  await page.click('#restart2');
  await page.waitForSelector('.qcard');
  await page.waitForTimeout(100);
  assert.equal((await page.textContent('#pcount')).replace(/\s+/g, ' ').trim(), 'Question 1 / 20');
  const secondFirst = await page.textContent('#qtext');
  const newSession = [];
  for (let i = 0; i < 20; i++) {
    await page.waitForSelector('.qcard:not(.leave)');
    await page.waitForTimeout(60);
    newSession.push(await page.textContent('#qtext'));
    await page.click('#skip');
  }
  const overlap = newSession.filter((q) => seenFirst.includes(q)).length;
  assert.ok(overlap <= 2, `la nouvelle session répète ${overlap} questions`);
  console.log(`Nouvelle session : ${overlap} question(s) en commun avec la première (${secondFirst.slice(0, 40)}…)`);

  // Mobile : pas de défilement horizontal
  for (const [name, w, hgt] of [['mobile', 390, 844], ['tablette', 820, 1180]]) {
    const m = await browser.newPage({ viewport: { width: w, height: hgt } });
    m.on('pageerror', (e) => errors.push(e.message));
    await m.goto(`http://localhost:${PORT}/`);
    await m.waitForTimeout(300);
    await m.screenshot({ path: `${shots}/6-${name}-accueil.png` });
    await m.click('#start');
    await m.waitForSelector('.qcard');
    await m.waitForTimeout(500);
    await m.screenshot({ path: `${shots}/7-${name}-question.png` });
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${name} : débordement horizontal de ${overflow}px`);
    for (let i = 0; i < 20; i++) { await m.waitForSelector('.qcard:not(.leave)'); await m.waitForTimeout(40); await m.click('#skip'); }
    await m.waitForSelector('.score-card');
    await m.waitForTimeout(1400);
    await m.screenshot({ path: `${shots}/8-${name}-resultats.png`, fullPage: true });
    const overflow2 = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow2 <= 0, `${name} résultats : débordement de ${overflow2}px`);
    await m.close();
  }

  // Thème sombre
  const d = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
  await d.goto(`http://localhost:${PORT}/`);
  await d.click('#start');
  await d.waitForSelector('.qcard');
  await d.waitForTimeout(500);
  await d.screenshot({ path: `${shots}/9-sombre-question.png` });

  assert.deepEqual(errors, [], 'aucune erreur JavaScript');
  console.log('E2E : tous les contrôles sont passés.');
} catch (e) {
  failed = true;
  console.error('E2E en échec :', e.message);
} finally {
  await browser.close();
  server.kill();
  process.exit(failed ? 1 : 0);
}
