import { test, expect } from '@playwright/test';
import {
  openApp, readStored, sheet, entries, openAddSheet, typeButton, placeButton, addEntry,
} from './helpers.js';
import { emptyState } from '../fixtures.mjs';

const settings = (page) => page.goto('/#/parametres');
const placeRows = (page) => page.locator('.places-list .place-name');

async function fillDialog(page, value) {
  await page.locator('#dialog-field').fill(value);
}

test.beforeEach(async ({ page }) => {
  await openApp(page, { state: emptyState() });
});

test('ajouter un lieu : il apparaît dans la feuille d’ajout', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'Ajouter un lieu' }).click();
  await fillDialog(page, 'Chez Léa');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

  await expect(placeRows(page)).toHaveText(
    ['IUT', 'Chez moi', 'Bar/boîte', 'Public', 'Chez quelqu’un', 'Chez Léa'],
  );

  await page.goto('/#/');
  await openAddSheet(page);
  await expect(sheet(page).locator('.place-btn')).toHaveText(
    ['IUT', 'Chez moi', 'Bar/boîte', 'Public', 'Chez quelqu’un', 'Chez Léa'],
  );
});

test('un nom vide ou en double est refusé', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'Ajouter un lieu' }).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.field-error')).toHaveText('Le nom est obligatoire.');

  await fillDialog(page, 'iut');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.field-error')).toHaveText('Ce lieu existe déjà.');

  await fillDialog(page, 'Chez Léa');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  expect((await readStored(page)).places).toHaveLength(6);
});

test('renommer un lieu : l’historique affiche le nouveau nom', async ({ page }) => {
  await addEntry(page, 'Caca', 'IUT');
  await expect(entries(page).first()).toContainText('IUT');

  await settings(page);
  await page.getByRole('button', { name: 'Renommer IUT' }).click();
  await fillDialog(page, 'Fac');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(placeRows(page).first()).toHaveText('Fac');

  await page.goto('/#/');
  await expect(entries(page).first()).toContainText('Fac');

  const stored = await readStored(page);
  expect(stored.places[0]).toMatchObject({ id: 'iut', name: 'Fac' });
  expect(stored.entries[0].placeName).toBe('Fac'); // la copie suit aussi
});

test('supprimer un lieu : l’historique garde l’ancien nom', async ({ page }) => {
  await addEntry(page, 'Caca', 'IUT');

  await settings(page);
  await page.getByRole('button', { name: 'Supprimer IUT' }).click();
  await expect(sheet(page)).toContainText('Supprimer IUT ?');
  await page.locator('.sheet').getByRole('button', { name: 'Supprimer' }).click();

  await expect(placeRows(page)).toHaveText(
    ['Chez moi', 'Bar/boîte', 'Public', 'Chez quelqu’un'],
  );

  await page.goto('/#/');
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText('IUT');

  await openAddSheet(page);
  await expect(sheet(page).locator('.place-btn')).toHaveCount(4);
});

test('la suppression peut être annulée', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'Supprimer IUT' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Annuler' }).click();
  await expect(placeRows(page)).toHaveCount(5);
});

test('le dernier lieu ne peut pas être supprimé', async ({ page }) => {
  const state = emptyState();
  state.places = [{ id: 'iut', name: 'IUT' }];
  await openApp(page, { state });
  await settings(page);
  await expect(page.getByRole('button', { name: 'Supprimer IUT' })).toBeDisabled();
});

test('réordonner les lieux change l’ordre dans la feuille d’ajout', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'Descendre IUT' }).click();
  await expect(placeRows(page)).toHaveText(
    ['Chez moi', 'IUT', 'Bar/boîte', 'Public', 'Chez quelqu’un'],
  );

  await page.getByRole('button', { name: 'Monter Public' }).click();
  await expect(placeRows(page)).toHaveText(
    ['Chez moi', 'IUT', 'Public', 'Bar/boîte', 'Chez quelqu’un'],
  );

  await page.goto('/#/');
  await openAddSheet(page);
  await expect(sheet(page).locator('.place-btn')).toHaveText(
    ['Chez moi', 'IUT', 'Public', 'Bar/boîte', 'Chez quelqu’un'],
  );
});

test('les flèches sont désactivées aux extrémités', async ({ page }) => {
  await settings(page);
  await expect(page.getByRole('button', { name: 'Monter IUT' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Descendre Chez quelqu’un' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Descendre IUT' })).toBeEnabled();
});

test('le lieu renommé reste sélectionnable pour un nouvel ajout', async ({ page }) => {
  await settings(page);
  await page.getByRole('button', { name: 'Renommer Chez moi' }).click();
  await fillDialog(page, 'Maison');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await page.goto('/#/');
  await addEntry(page, 'Pipi', 'Maison');
  await expect(entries(page).first()).toContainText('Maison');
  expect((await readStored(page)).entries[0].placeId).toBe('maison');
});
