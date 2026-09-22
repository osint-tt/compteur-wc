import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { openApp, counter, entries, waitForServiceWorker, openAddSheet } from './helpers.js';
import { emptyState, stableState, FIXED_NOW, STORAGE_KEY } from '../fixtures.mjs';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function serverAnswers(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/index.html`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer(port) {
  const child = spawn(process.execPath, ['tests/server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await serverAnswers(port)) return child;
    await wait(100);
  }
  child.kill();
  throw new Error(`Le serveur de test n'a pas démarré sur le port ${port}`);
}

async function stopServer(child, port) {
  child.kill();
  for (let i = 0; i < 60; i += 1) {
    if (!(await serverAnswers(port))) return;
    await wait(100);
  }
  throw new Error(`Le serveur de test tourne encore sur le port ${port}`);
}

/**
 * Vrai test hors ligne : l'app est servie par un serveur dédié, que l'on éteint
 * pour de bon avant de recharger. Plus rien ne peut répondre à part le cache.
 */
test('hors ligne : l’app se recharge et garde ses données', async ({ page, browserName }) => {
  const port = browserName === 'webkit' ? 5181 : 5180;
  const origin = `http://127.0.0.1:${port}`;
  const server = await startServer(port);

  try {
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await page.goto(`${origin}/`);
    await page.evaluate(([key, value]) => localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(stableState())]);
    await page.reload();
    await waitForServiceWorker(page);

    await stopServer(server, port);
    expect(await serverAnswers(port)).toBe(false);

    await page.reload();

    await expect(page.locator('#app h1')).toHaveText('Compteur WC');
    await expect(counter(page, 'caca')).toHaveText('1');
    await expect(entries(page)).toHaveCount(1);
    await expect(page.locator('.chart')).toBeVisible();
    await expect(page.locator('[data-stat="place"]')).toHaveText('IUT');

    // Et l'ajout fonctionne toujours hors ligne.
    await openAddSheet(page);
    await page.locator('.sheet').getByRole('button', { name: 'Pipi', exact: true }).click();
    await page.locator('.sheet .place-btn', { hasText: /^IUT$/ }).click();
    await expect(counter(page, 'pipi')).toHaveText('1');

    // Les données restent après un nouveau chargement, toujours hors ligne.
    await page.reload();
    await expect(counter(page, 'pipi')).toHaveText('1');
  } finally {
    server.kill();
  }
});

test('les caches et les données de prise-de-masse ne sont jamais touchés', async ({ page }) => {

  // On pose une app voisine sur le même domaine, avant toute installation.
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.setItem('prise-de-masse', JSON.stringify({ seances: 42 }));
    const cache = await caches.open('prise-de-masse-test');
    await cache.put('/faux-fichier-prise-de-masse', new Response('intact'));
  });

  await page.reload();
  await waitForServiceWorker(page);

  // Installation puis activation d'une nouvelle version du service worker.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await page.waitForTimeout(1_000);

  const result = await page.evaluate(async () => ({
    voisin: localStorage.getItem('prise-de-masse'),
    contenu: await (await caches.open('prise-de-masse-test'))
      .match('/faux-fichier-prise-de-masse').then((r) => (r ? r.text() : null)),
    caches: await caches.keys(),
  }));

  expect(JSON.parse(result.voisin)).toEqual({ seances: 42 });
  expect(result.contenu).toBe('intact');
  expect(result.caches).toContain('prise-de-masse-test');
  expect(result.caches.filter((n) => n.startsWith('compteur-wc-')).length).toBe(1);

  // L'app n'écrit qu'une seule clé de stockage, et seulement la sienne.
  await openAddSheet(page);
  await page.locator('.sheet').getByRole('button', { name: 'Caca', exact: true }).click();
  await page.locator('.sheet .place-btn', { hasText: /^IUT$/ }).click();
  await expect(counter(page, 'caca')).toHaveText('1');

  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys.filter((k) => k.startsWith('compteur-wc'))).toEqual(['compteur-wc']);
  expect(await page.evaluate(() => localStorage.getItem('prise-de-masse')))
    .toBe(JSON.stringify({ seances: 42 }));
});

test('aucune requête vers un autre domaine', async ({ page }) => {
  const external = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:\/\//.test(url) && !url.startsWith('http://127.0.0.1:5173')) external.push(url);
  });

  await openApp(page, { state: stableState() });
  await page.goto('/#/parametres');
  await page.goto('/#/jour/2026-09-18');
  await page.goto('/#/');
  await openAddSheet(page);
  await page.waitForTimeout(500);

  expect(external).toEqual([]);
});

test('aucun défilement horizontal à 360 px et à 430 px', async ({ page }) => {
  const overflow = () => page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page, { state: stableState() });

    for (const path of ['/#/', '/#/jour/2026-09-18', '/#/parametres']) {
      await page.goto(path);
      const { scroll, client } = await overflow();
      expect(scroll, `${path} à ${width} px`).toBeLessThanOrEqual(client);
    }

    // Feuille d'ajout ouverte.
    await page.goto('/#/');
    await openAddSheet(page);
    const withSheet = await overflow();
    expect(withSheet.scroll, `feuille à ${width} px`).toBeLessThanOrEqual(withSheet.client);
  }
});

test('un lieu au nom très long ne casse pas la mise en page', async ({ page }) => {
  const state = emptyState();
  state.places[0].name = 'Ààààààààààààààààààààààààààààà'; // 29 caractères
  state.entries.push({
    id: 'z1',
    type: 'caca',
    date: '2026-09-21',
    time: '14:15',
    placeId: 'iut',
    placeName: state.places[0].name,
    createdAt: '2026-09-21T12:15:00.000Z',
  });
  await openApp(page, { state });

  const check = async (label) => {
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll, label).toBeLessThanOrEqual(client);
  };

  await check('accueil');
  await openAddSheet(page);
  await check('feuille');
  await page.goto('/#/parametres');
  await check('paramètres');
});

test('le manifeste et les icônes sont servis', async ({ page, request }) => {
  await openApp(page, { state: emptyState() });

  const manifest = await request.get('http://127.0.0.1:5173/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const json = await manifest.json();
  expect(json.name).toBe('Compteur WC');
  expect(json.short_name).toBe('WC');
  expect(json.display).toBe('standalone');
  expect(json.start_url).toBe('./');
  expect(json.scope).toBe('./');
  expect(json.icons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512', '512x512']);
  expect(json.icons.some((i) => i.purpose === 'maskable')).toBe(true);

  for (const path of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'sw.js', '.nojekyll']) {
    const response = await request.get(`http://127.0.0.1:5173/${path}`);
    expect(response.ok(), path).toBe(true);
  }
});
