import { expect } from '@playwright/test';
import { FIXED_NOW, STORAGE_KEY } from '../fixtures.mjs';

/**
 * Ouvre l'app avec une horloge fixée et, si besoin, un état pré-enregistré.
 * L'état est écrit après le premier chargement puis la page est rechargée,
 * pour que l'app le relise exactement comme sur un téléphone.
 */
export async function openApp(page, { state = null, time = FIXED_NOW, path = '/' } = {}) {
  await page.clock.setFixedTime(new Date(time));
  await page.goto(path);
  if (state) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(state)]);
    await page.reload();
  }
  await expect(page.locator('#app .topbar')).toBeVisible();
}

export async function readStored(page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export const sheet = (page) => page.locator('.sheet');
export const counter = (page, type) => page.locator(`[data-count="${type}"]`);
export const entries = (page) => page.locator('.entry');
export const timeValue = (page) => page.locator('[data-time]');
export const toast = (page) => page.locator('.toast');

export async function openAddSheet(page) {
  await page.getByRole('button', { name: 'Ajouter un passage' }).click();
  await expect(sheet(page)).toBeVisible();
}

export function typeButton(page, name) {
  return sheet(page).getByRole('button', { name, exact: true });
}

export function placeButton(page, name) {
  return sheet(page).locator('.place-btn', { hasText: new RegExp(`^${name}$`) });
}

/** Ajout classique en 2 taps. */
export async function addEntry(page, type, place) {
  await openAddSheet(page);
  await typeButton(page, type).click();
  await placeButton(page, place).click();
  await expect(sheet(page)).toHaveCount(0);
}

/**
 * Attend que le service worker contrôle la page ET que tous les fichiers de l'app
 * soient bien en cache : sans quoi le test hors ligne serait instable.
 */
export async function waitForServiceWorker(page) {
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return false;
    const names = (await caches.keys()).filter((name) => name.startsWith('compteur-wc-'));
    if (names.length !== 1) return false;
    const cache = await caches.open(names[0]);
    const needed = ['./', './index.html', './css/style.css', './js/app.js', './js/logic.js',
      './js/storage.js', './js/version.js', './manifest.webmanifest'];
    for (const url of needed) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await cache.match(url))) return false;
    }
    return true;
  }, null, { timeout: 20_000 });
}
