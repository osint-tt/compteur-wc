import { test, expect } from '@playwright/test';
import {
  openApp, readStored, sheet, counter, entries, timeValue, toast,
  openAddSheet, typeButton, placeButton, addEntry,
} from './helpers.js';
import { emptyState, TODAY } from '../fixtures.mjs';

test.beforeEach(async ({ page }) => {
  await openApp(page, { state: emptyState() });
});

test('l’heure proposée est l’heure arrondie au quart d’heure', async ({ page }) => {
  await openAddSheet(page);
  await expect(timeValue(page)).toHaveText('14:15'); // il est 14:08
});

test('ajout en 2 taps : Caca puis IUT', async ({ page }) => {
  await expect(counter(page, 'caca')).toHaveText('0');
  await expect(page.locator('.empty').first()).toHaveText('Rien pour l’instant aujourd’hui.');

  await addEntry(page, 'Caca', 'IUT');

  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(counter(page, 'pipi')).toHaveText('0');
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText('14:15');
  await expect(entries(page).first()).toContainText('Caca');
  await expect(entries(page).first()).toContainText('IUT');

  // Le graphique apparaît avec la barre d'aujourd'hui.
  await expect(page.locator('.chart-bar--today')).toHaveCount(1);

  // Message de confirmation.
  await expect(toast(page)).toContainText('Caca ajouté · 14:15 · IUT');
  await expect(toast(page).getByRole('button', { name: 'Annuler' })).toBeVisible();

  const stored = await readStored(page);
  expect(stored.entries).toHaveLength(1);
  expect(stored.entries[0]).toMatchObject({
    type: 'caca', date: TODAY, time: '14:15', placeId: 'iut', placeName: 'IUT',
  });
});

test('« Les deux » crée un caca et un pipi', async ({ page }) => {
  await addEntry(page, 'Les deux', 'Chez moi');

  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(counter(page, 'pipi')).toHaveText('1');
  await expect(entries(page)).toHaveCount(2);
  await expect(toast(page)).toContainText('Caca et pipi ajoutés · 14:15 · Chez moi');

  const stored = await readStored(page);
  expect(stored.entries.map((e) => e.type).sort()).toEqual(['caca', 'pipi']);
  expect(new Set(stored.entries.map((e) => e.time))).toEqual(new Set(['14:15']));
  expect(new Set(stored.entries.map((e) => e.placeId))).toEqual(new Set(['maison']));
});

test('« Hier » enregistre le passage la veille', async ({ page }) => {
  await openAddSheet(page);
  await typeButton(page, 'Pipi').click();
  await sheet(page).getByRole('button', { name: 'Hier' }).click();
  await placeButton(page, 'Public').click();

  // Rien aujourd'hui...
  await expect(counter(page, 'pipi')).toHaveText('0');
  const stored = await readStored(page);
  expect(stored.entries).toHaveLength(1);
  expect(stored.entries[0].date).toBe('2026-09-20');

  // ...mais bien présent sur l'écran du 20 septembre.
  await page.goto('/#/jour/2026-09-20');
  await expect(counter(page, 'pipi')).toHaveText('1');
  await expect(entries(page)).toHaveCount(1);
});

test('le sélecteur Aujourd’hui / Hier revient sur Aujourd’hui à la réouverture', async ({ page }) => {
  await openAddSheet(page);
  await sheet(page).getByRole('button', { name: 'Hier' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Hier' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
  await openAddSheet(page);
  await expect(sheet(page).getByRole('button', { name: 'Aujourd’hui' })).toHaveAttribute('aria-pressed', 'true');
});

test('les lieux sont grisés tant qu’aucun type n’est choisi', async ({ page }) => {
  await openAddSheet(page);
  const places = sheet(page).locator('.place-btn');
  await expect(places).toHaveCount(5);
  for (let i = 0; i < 5; i += 1) await expect(places.nth(i)).toBeDisabled();

  await typeButton(page, 'Caca').click();
  for (let i = 0; i < 5; i += 1) await expect(places.nth(i)).toBeEnabled();
});

test('aucun type n’est sélectionné à l’ouverture', async ({ page }) => {
  await openAddSheet(page);
  for (const name of ['Caca', 'Pipi', 'Les deux']) {
    await expect(typeButton(page, name)).toHaveAttribute('aria-pressed', 'false');
  }
});

test('les lieux apparaissent dans l’ordre des paramètres', async ({ page }) => {
  await openAddSheet(page);
  await expect(sheet(page).locator('.place-btn')).toHaveText(
    ['IUT', 'Chez moi', 'Bar/boîte', 'Public', 'Chez quelqu’un'],
  );
});

test('aucun bouton pour créer un lieu dans la feuille d’ajout', async ({ page }) => {
  await openAddSheet(page);
  await expect(sheet(page).getByRole('button', { name: /ajouter un lieu/i })).toHaveCount(0);
});

test('−15 et +15 modifient l’heure par pas de 15 minutes', async ({ page }) => {
  await openAddSheet(page);
  const minus = sheet(page).getByRole('button', { name: '15 minutes plus tôt' });
  const plus = sheet(page).getByRole('button', { name: '15 minutes plus tard' });

  await minus.click();
  await expect(timeValue(page)).toHaveText('14:00');
  await minus.click();
  await expect(timeValue(page)).toHaveText('13:45');
  await plus.click();
  await plus.click();
  await expect(timeValue(page)).toHaveText('14:15');
});

test('l’heure est bornée à 00:00', async ({ page }) => {
  await openApp(page, { state: emptyState(), time: '2026-09-21T00:07:00+02:00' });
  await openAddSheet(page);
  await expect(timeValue(page)).toHaveText('00:00');

  const minus = sheet(page).getByRole('button', { name: '15 minutes plus tôt' });
  await expect(minus).toBeDisabled();

  await sheet(page).getByRole('button', { name: '15 minutes plus tard' }).click();
  await expect(timeValue(page)).toHaveText('00:15');
  await expect(minus).toBeEnabled();
  await minus.click();
  await expect(timeValue(page)).toHaveText('00:00');
});

test('l’heure est bornée à 23:45 et l’arrondi ne change pas de jour', async ({ page }) => {
  await openApp(page, { state: emptyState(), time: '2026-09-21T23:53:00+02:00' });
  await openAddSheet(page);
  await expect(timeValue(page)).toHaveText('23:45');

  const plus = sheet(page).getByRole('button', { name: '15 minutes plus tard' });
  await expect(plus).toBeDisabled();
  await sheet(page).getByRole('button', { name: '15 minutes plus tôt' }).click();
  await expect(timeValue(page)).toHaveText('23:30');

  await typeButton(page, 'Caca').click();
  await placeButton(page, 'IUT').click();
  const stored = await readStored(page);
  expect(stored.entries[0].date).toBe(TODAY); // toujours le 21, pas le 22
});

test('« Annuler » retire le passage qui vient d’être ajouté', async ({ page }) => {
  await addEntry(page, 'Caca', 'IUT');
  await expect(counter(page, 'caca')).toHaveText('1');

  await toast(page).getByRole('button', { name: 'Annuler' }).click();

  await expect(counter(page, 'caca')).toHaveText('0');
  await expect(entries(page)).toHaveCount(0);
  await expect(toast(page)).toHaveCount(0);
  expect((await readStored(page)).entries).toHaveLength(0);
});

test('« Annuler » retire les deux passages de « Les deux »', async ({ page }) => {
  await addEntry(page, 'Les deux', 'IUT');
  await toast(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(entries(page)).toHaveCount(0);
  expect((await readStored(page)).entries).toHaveLength(0);
});

test('le message de confirmation disparaît au bout de 5 secondes', async ({ page }) => {
  await addEntry(page, 'Caca', 'IUT');
  await expect(toast(page)).toBeVisible();
  await expect(toast(page)).toHaveCount(0, { timeout: 8_000 });
  // Le passage, lui, reste.
  await expect(counter(page, 'caca')).toHaveText('1');
});

test('la feuille se ferme avec le bouton retour du téléphone', async ({ page }) => {
  await openAddSheet(page);
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  // L'app reste sur l'accueil.
  await expect(page.locator('#app h1')).toHaveText('Compteur WC');
});

test('la feuille se ferme avec le bouton Fermer et avec le fond', async ({ page }) => {
  await openAddSheet(page);
  await sheet(page).getByRole('button', { name: 'Fermer' }).click();
  await expect(sheet(page)).toHaveCount(0);

  await openAddSheet(page);
  await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(sheet(page)).toHaveCount(0);
});
