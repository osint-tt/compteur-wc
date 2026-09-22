import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  openApp, readStored, sheet, counter, entries, addEntry,
} from './helpers.js';
import { emptyState, stableState } from '../fixtures.mjs';

const body = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeColor = (page) => page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);

test('les données survivent au rechargement', async ({ page }) => {
  await openApp(page, { state: emptyState() });
  await addEntry(page, 'Caca', 'IUT');
  await addEntry(page, 'Pipi', 'Chez moi');

  await page.reload();

  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(counter(page, 'pipi')).toHaveText('1');
  await expect(entries(page)).toHaveCount(2);

  // Et même après avoir « fermé » l'app (nouvelle navigation).
  await page.goto('/');
  await expect(entries(page)).toHaveCount(2);
});

test('thème sombre puis clair, mémorisé après rechargement', async ({ page }) => {
  await openApp(page, { state: emptyState() });
  expect(await body(page)).toBe('rgb(255, 255, 255)');
  expect(await themeColor(page)).toBe('#ffffff');

  await page.getByRole('button', { name: 'Passer au thème sombre' }).click();
  expect(await body(page)).toBe('rgb(0, 0, 0)');
  expect(await themeColor(page)).toBe('#000000');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  expect(await body(page)).toBe('rgb(0, 0, 0)');
  expect((await readStored(page)).settings.theme).toBe('dark');

  await page.getByRole('button', { name: 'Passer au thème clair' }).click();
  expect(await body(page)).toBe('rgb(255, 255, 255)');
  await page.reload();
  expect(await body(page)).toBe('rgb(255, 255, 255)');
});

test('le thème Automatique suit le téléphone', async ({ page }) => {
  await openApp(page, { state: emptyState() });
  await page.goto('/#/parametres');
  await page.getByRole('button', { name: 'Automatique' }).click();

  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await body(page)).toBe('rgb(0, 0, 0)');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await body(page)).toBe('rgb(255, 255, 255)');

  await page.getByRole('button', { name: 'Sombre' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await body(page)).toBe('rgb(0, 0, 0)'); // le choix explicite gagne
  expect((await readStored(page)).settings.theme).toBe('dark');
});

test('la version de l’app est affichée dans les paramètres', async ({ page }) => {
  await openApp(page, { state: emptyState() });
  await page.goto('/#/parametres');
  await expect(page.locator('.version')).toHaveText(/^Version \d+\.\d+\.\d+$/);
});

test('export par téléchargement quand le partage natif n’est pas disponible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await openApp(page, { state: stableState() });
  await page.goto('/#/parametres');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter mes données' }).click(),
  ]);

  expect(download.suggestedFilename()).toBe('compteur-wc-2026-09-21.json');
  const content = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(content.version).toBe(1);
  expect(content.entries).toHaveLength(32);
  expect(content.places).toHaveLength(5);
});

test('export par le partage natif quand il est disponible', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shared = null;
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__shared = { name: data.files[0].name, text: await data.files[0].text() };
      },
    });
  });
  await openApp(page, { state: stableState() });
  await page.goto('/#/parametres');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();

  await expect.poll(() => page.evaluate(() => window.__shared && window.__shared.name))
    .toBe('compteur-wc-2026-09-21.json');
  const text = await page.evaluate(() => window.__shared.text);
  expect(JSON.parse(text).entries).toHaveLength(32);
});

test('import : résumé, confirmation, et données identiques', async ({ page }) => {
  const backup = stableState();
  await openApp(page, { state: emptyState() });
  await addEntry(page, 'Caca', 'IUT'); // des données différentes avant import

  await page.goto('/#/parametres');
  await page.setInputFiles('#import-file', {
    name: 'compteur-wc-2026-09-21.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup), 'utf8'),
  });

  await expect(sheet(page)).toContainText('Remplacer les données ?');
  await expect(sheet(page)).toContainText('32 passages et 5 lieux');

  await page.getByRole('button', { name: 'Remplacer' }).click();
  await expect(sheet(page)).toHaveCount(0);

  const stored = await readStored(page);
  expect(stored.entries).toHaveLength(32);
  expect(stored.entries).toEqual(backup.entries);
  expect(stored.places).toEqual(backup.places);

  await page.goto('/#/');
  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(page.locator('[data-stat="place"]')).toHaveText('IUT');
});

test('import annulé : rien n’est modifié', async ({ page }) => {
  await openApp(page, { state: emptyState() });
  await addEntry(page, 'Pipi', 'Public');
  const before = await readStored(page);

  await page.goto('/#/parametres');
  await page.setInputFiles('#import-file', {
    name: 'sauvegarde.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(stableState()), 'utf8'),
  });
  await expect(sheet(page)).toContainText('Remplacer les données ?');
  await page.locator('.sheet').getByRole('button', { name: 'Annuler' }).click();

  expect(await readStored(page)).toEqual(before);
});

test('fichier invalide : refusé, données intactes', async ({ page }) => {
  await openApp(page, { state: emptyState() });
  await addEntry(page, 'Pipi', 'Public');
  const before = await readStored(page);

  await page.goto('/#/parametres');
  const cases = [
    { name: 'pas-du-json.json', buffer: Buffer.from('ceci n’est pas du json', 'utf8') },
    { name: 'autre-app.json', buffer: Buffer.from(JSON.stringify({ hello: 'monde' }), 'utf8') },
    {
      name: 'trop-recent.json',
      buffer: Buffer.from(JSON.stringify({ ...stableState(), version: 9 }), 'utf8'),
    },
  ];

  for (const file of cases) {
    await page.setInputFiles('#import-file', { mimeType: 'application/json', ...file });
    await expect(sheet(page)).toContainText('Import impossible');
    await expect(sheet(page)).toContainText('n’ont pas été modifiées');
    await page.locator('.sheet').getByRole('button', { name: 'D’accord' }).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await readStored(page)).toEqual(before);
  }
});
