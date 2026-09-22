/**
 * Captures d'écran pour la revue visuelle (dossier captures/, ignoré par git).
 * Usage : npm run captures
 */

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  FIXED_NOW, STORAGE_KEY, emptyState, realisticState,
} from './fixtures.mjs';

const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL('../captures/', import.meta.url));

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function startServer() {
  const child = spawn(process.execPath, ['tests/server.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${ORIGIN}/index.html`);
      if (response.ok) return child;
    } catch { /* pas encore prêt */ }
    await wait(100);
  }
  child.kill();
  throw new Error('serveur de captures non démarré');
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const server = await startServer();
const browser = await chromium.launch();

const sheetSelector = '.sheet';

async function shoot(page, name) {
  await wait(260); // fin des animations
  await page.screenshot({ path: `${OUT}${name}.png` });
  process.stdout.write(`${name}.png\n`);
}

async function load(page, state, path = '/') {
  await page.goto(`${ORIGIN}${path}`);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(state)]);
  await page.goto(`${ORIGIN}${path}`);
  await page.reload();
  await page.waitForSelector('#app .topbar');
}

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(FIXED_NOW));

  const full = realisticState({ theme });
  const vide = emptyState({ theme });

  // 1. Accueil avec des données, haut et bas de page.
  await load(page, full);
  await shoot(page, `${theme}-01-accueil-haut`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shoot(page, `${theme}-02-accueil-bas`);

  // 2. Feuille d'ajout, avant et après le choix du type.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Ajouter un passage' }).click();
  await page.waitForSelector(sheetSelector);
  await shoot(page, `${theme}-03-feuille-ajout`);
  await page.locator('.sheet .type-btn[data-value="caca"]').click();
  await shoot(page, `${theme}-04-feuille-ajout-type`);

  // 3. Message de confirmation après un ajout.
  await page.locator('.sheet .place-btn', { hasText: /^Bar\/boîte$/ }).click();
  await page.waitForSelector('.toast');
  await shoot(page, `${theme}-05-message-annuler`);
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();

  // 4. Feuille de modification.
  await page.locator('.entry').first().click();
  await page.waitForSelector(sheetSelector);
  await shoot(page, `${theme}-06-feuille-modif`);
  await page.locator('.sheet').getByRole('button', { name: 'Fermer' }).click();

  // 5. Écran d'un jour.
  await page.goto(`${ORIGIN}/#/jour/2026-09-18`);
  await page.waitForSelector('#app .topbar');
  await shoot(page, `${theme}-07-jour`);

  // 6. Paramètres, puis un dialogue.
  await page.goto(`${ORIGIN}/#/parametres`);
  await page.waitForSelector('.places-list');
  await shoot(page, `${theme}-08-parametres`);
  await page.getByRole('button', { name: 'Renommer IUT' }).click();
  await page.waitForSelector(sheetSelector);
  await shoot(page, `${theme}-09-dialogue-renommer`);
  await page.locator('.sheet').getByRole('button', { name: 'Annuler' }).click();
  await page.getByRole('button', { name: 'Supprimer Public' }).click();
  await page.waitForSelector(sheetSelector);
  await shoot(page, `${theme}-10-dialogue-supprimer`);
  await page.locator('.sheet').getByRole('button', { name: 'Annuler' }).click();

  // 7. États vides.
  await load(page, vide);
  await shoot(page, `${theme}-11-accueil-vide`);
  await page.getByRole('button', { name: 'Ajouter un passage' }).click();
  await page.waitForSelector(sheetSelector);
  await shoot(page, `${theme}-12-feuille-vide`);
  await page.locator('.sheet').getByRole('button', { name: 'Fermer' }).click();
  await page.goto(`${ORIGIN}/#/jour/2026-09-19`);
  await page.waitForSelector('#app .topbar');
  await shoot(page, `${theme}-13-jour-vide`);

  await context.close();
}

await browser.close();
server.kill();
process.stdout.write(`\nCaptures dans ${OUT}\n`);
