import { test, expect } from '@playwright/test';
import { openApp, counter, entries } from './helpers.js';
import { emptyState, stableState, TODAY } from '../fixtures.mjs';

const stat = (page, name) => page.locator(`[data-stat="${name}"]`);
const avgValues = (page) => page.locator('.avg-value');
const sub = (page, name) => page.locator(`[data-stat="${name}"] + .stat-sub`);

test('stats sur 30 jours (jeu de test : 1 caca/jour + 2 pipis le 18/09)', async ({ page }) => {
  await openApp(page, { state: stableState() });

  await expect(page.getByRole('button', { name: '30 j' })).toHaveAttribute('aria-pressed', 'true');
  await expect(avgValues(page)).toHaveText(['1,0', '0,1']); // 30/30 cacas, 2/30 pipis
  await expect(stat(page, 'record')).toHaveText('3');
  await expect(sub(page, 'record')).toHaveText('18 sept.');
  await expect(stat(page, 'place')).toHaveText('IUT');
  await expect(sub(page, 'place')).toHaveText('30 passages');
  await expect(stat(page, 'hour')).toHaveText('8 h – 9 h');
  await expect(sub(page, 'hour')).toHaveText('30 passages');
});

test('changer de durée recalcule les stats', async ({ page }) => {
  await openApp(page, { state: stableState() });

  await page.getByRole('button', { name: '7 j' }).click();
  await expect(avgValues(page)).toHaveText(['1,0', '0,3']); // 7/7 cacas, 2/7 pipis
  await expect(sub(page, 'place')).toHaveText('7 passages');
  await expect(page.locator('.chart-legend')).toContainText('moyenne 1,0 / jour');

  await page.getByRole('button', { name: '90 j' }).click();
  // Le premier passage date d'il y a 30 jours : la moyenne porte donc sur 30 jours.
  await expect(avgValues(page)).toHaveText(['1,0', '0,1']);
});

test('le graphique suit le sélecteur Cacas / Pipis', async ({ page }) => {
  await openApp(page, { state: stableState() });

  await expect(page.locator('.chart-bar')).toHaveCount(30);
  await expect(page.locator('.chart-bar--today')).toHaveCount(1);
  await expect(page.locator('.chart')).toHaveAttribute('aria-label', 'Cacas par jour sur 30 jours');

  await page.getByRole('button', { name: 'Pipis' }).click();
  await expect(page.locator('.chart-bar')).toHaveCount(1); // seul le 18/09 a des pipis
  await expect(page.locator('.chart')).toHaveAttribute('aria-label', 'Pipis par jour sur 30 jours');
  await expect(page.locator('.chart-legend')).toContainText('moyenne 0,1 / jour');
});

test('durée et type choisis sont mémorisés après rechargement', async ({ page }) => {
  await openApp(page, { state: stableState() });
  await page.getByRole('button', { name: '7 j' }).click();
  await page.getByRole('button', { name: 'Pipis' }).click();

  await page.reload();

  await expect(page.getByRole('button', { name: '7 j' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Pipis' })).toHaveAttribute('aria-pressed', 'true');
});

test('le graphique a des repères et une ligne de moyenne', async ({ page }) => {
  await openApp(page, { state: stableState() });
  const lines = await page.locator('.chart-grid-line').count();
  expect(lines).toBeGreaterThanOrEqual(3);
  expect(lines).toBeLessThanOrEqual(4);
  await expect(page.locator('.chart-avg')).toHaveCount(1);
  await expect(page.locator('.chart-tick')).not.toHaveCount(0);
});

test('taper une barre ouvre le bon jour', async ({ page }) => {
  await openApp(page, { state: stableState() });

  await page.locator('.chart-hit[data-date="2026-09-18"]').click();

  await expect(page).toHaveURL(/#\/jour\/2026-09-18$/);
  await expect(page.locator('#app h1')).toHaveText('Vendredi 18 septembre');
  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(counter(page, 'pipi')).toHaveText('2');
  await expect(entries(page)).toHaveCount(3);
});

test('les flèches de l’écran d’un jour s’arrêtent à aujourd’hui', async ({ page }) => {
  await openApp(page, { state: stableState() });
  await page.goto('/#/jour/2026-09-20');

  const next = page.getByRole('button', { name: 'Jour suivant' });
  const prev = page.getByRole('button', { name: 'Jour précédent' });

  await expect(next).toBeEnabled();
  await next.click();
  await expect(page).toHaveURL(/#\/jour\/2026-09-21$/);
  await expect(next).toBeDisabled();

  await prev.click();
  await expect(page).toHaveURL(/#\/jour\/2026-09-20$/);
  await expect(page.locator('#app h1')).toHaveText('Dimanche 20 septembre');
});

test('le bouton retour de l’écran d’un jour ramène à l’accueil', async ({ page }) => {
  await openApp(page, { state: stableState() });
  await page.locator('.chart-hit[data-date="2026-09-18"]').click();
  await expect(page).toHaveURL(/#\/jour\/2026-09-18$/);

  await page.getByRole('button', { name: 'Retour' }).click();
  await expect(page.locator('#app h1')).toHaveText('Compteur WC');
});

test('sans aucune donnée : « Pas encore de données »', async ({ page }) => {
  await openApp(page, { state: emptyState() });

  await expect(page.locator('.empty').last()).toHaveText('Pas encore de données');
  await expect(page.locator('.chart')).toHaveCount(0);
  await expect(page.locator('.stats')).toHaveCount(0);
  await expect(page.locator('.chart-controls')).toHaveCount(0);
});

test('l’accueil affiche la date du jour et les compteurs du jour', async ({ page }) => {
  await openApp(page, { state: stableState() });
  await expect(page.locator('.day-head .date')).toHaveText('Lundi 21 septembre');
  await expect(counter(page, 'caca')).toHaveText('1');
  await expect(counter(page, 'pipi')).toHaveText('0');
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText('08:15');
});

test('aucun calendrier dans l’app', async ({ page }) => {
  await openApp(page, { state: stableState(), path: `/#/jour/${TODAY}` });
  await expect(page.locator('input[type="date"], input[type="month"], .calendar')).toHaveCount(0);
  await page.goto('/#/parametres');
  await expect(page.locator('input[type="date"], input[type="month"], .calendar')).toHaveCount(0);
});
