import { test, expect } from '@playwright/test';
import {
  openApp, readStored, sheet, counter, entries, timeValue, toast, typeButton, placeButton,
} from './helpers.js';
import { emptyState, TODAY } from '../fixtures.mjs';

const oneEntry = () => {
  const state = emptyState();
  state.entries.push({
    id: 'x1',
    type: 'caca',
    date: TODAY,
    time: '14:15',
    placeId: 'iut',
    placeName: 'IUT',
    createdAt: '2026-09-21T12:15:00.000Z',
  });
  return state;
};

test('la feuille de modification est préremplie', async ({ page }) => {
  await openApp(page, { state: oneEntry() });
  await entries(page).first().click();

  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator('h2')).toHaveText('Modifier le passage');
  await expect(typeButton(page, 'caca')).toHaveAttribute('aria-pressed', 'true');
  await expect(timeValue(page)).toHaveText('14:15');
  await expect(placeButton(page, 'IUT')).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet(page).locator('.day-fixed')).toHaveText('Lundi 21 septembre');

  // En modification on ne touche qu'à ce passage : pas de pipi ajouté d'office.
  await expect(sheet(page).locator('.type-btn')).toHaveCount(2);
  await expect(typeButton(page, 'caca')).not.toContainText('+ pipi');
  await expect(sheet(page).getByRole('button', { name: 'Enregistrer' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Supprimer' })).toBeVisible();
});

test('taper un lieu en modification ne referme pas la feuille', async ({ page }) => {
  await openApp(page, { state: oneEntry() });
  await entries(page).first().click();

  await placeButton(page, 'Public').click();
  await expect(sheet(page)).toBeVisible();
  await expect(placeButton(page, 'Public')).toHaveAttribute('aria-pressed', 'true');
  await expect(placeButton(page, 'IUT')).toHaveAttribute('aria-pressed', 'false');

  // Rien n'est enregistré tant qu'on n'a pas validé.
  expect((await readStored(page)).entries[0].placeId).toBe('iut');

  await sheet(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(entries(page).first()).toContainText('Public');
  expect((await readStored(page)).entries[0].placeId).toBe('public');
});

test('modifier le type et l’heure', async ({ page }) => {
  await openApp(page, { state: oneEntry() });
  await entries(page).first().click();

  await typeButton(page, 'pipi').click();
  await sheet(page).getByRole('button', { name: '15 minutes plus tard' }).click();
  await expect(timeValue(page)).toHaveText('14:30');
  await sheet(page).getByRole('button', { name: 'Enregistrer' }).click();

  await expect(counter(page, 'caca')).toHaveText('0');
  await expect(counter(page, 'pipi')).toHaveText('1');
  await expect(entries(page).first()).toContainText('14:30');
  const stored = await readStored(page);
  expect(stored.entries[0]).toMatchObject({ type: 'pipi', time: '14:30', date: TODAY });
});

test('supprimer un passage, puis Annuler le remet', async ({ page }) => {
  await openApp(page, { state: oneEntry() });
  await entries(page).first().click();
  await sheet(page).getByRole('button', { name: 'Supprimer' }).click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(counter(page, 'caca')).toHaveText('0');
  await expect(entries(page)).toHaveCount(0);
  await expect(toast(page)).toContainText('Supprimé');
  expect((await readStored(page)).entries).toHaveLength(0);

  await toast(page).getByRole('button', { name: 'Annuler' }).click();

  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(entries(page)).toHaveCount(1);
  const stored = await readStored(page);
  expect(stored.entries).toHaveLength(1);
  expect(stored.entries[0]).toMatchObject({ id: 'x1', type: 'caca', time: '14:15' });
});

test('modifier un passage depuis l’écran d’un jour', async ({ page }) => {
  const state = oneEntry();
  state.entries[0].date = '2026-09-19';
  await openApp(page, { state });

  await page.goto('/#/jour/2026-09-19');
  await expect(entries(page)).toHaveCount(1);
  await entries(page).first().click();
  await expect(sheet(page).locator('.day-fixed')).toHaveText('Samedi 19 septembre');

  await placeButton(page, 'Chez moi').click();
  await sheet(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(entries(page).first()).toContainText('Chez moi');
  expect((await readStored(page)).entries[0].date).toBe('2026-09-19');
});

test('ajouter un passage depuis l’écran d’un jour utilise la date de ce jour', async ({ page }) => {
  await openApp(page, { state: emptyState() });
  await page.goto('/#/jour/2026-09-18');

  await page.getByRole('button', { name: 'Ajouter un passage' }).click();
  await expect(sheet(page).locator('.day-fixed')).toHaveText('Vendredi 18 septembre');
  await expect(sheet(page).getByRole('button', { name: 'Hier' })).toHaveCount(0);

  await typeButton(page, 'caca').click();
  await placeButton(page, 'IUT').click();

  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(counter(page, 'pipi')).toHaveText('1');
  const stored = await readStored(page);
  expect(stored.entries).toHaveLength(2);
  for (const entry of stored.entries) expect(entry.date).toBe('2026-09-18');
});
