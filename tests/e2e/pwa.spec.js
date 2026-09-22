import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function startServer(root) {
  // Port choisi par le système : deux tests en parallèle ne peuvent pas se gêner.
  const child = spawn(process.execPath, ['tests/server.mjs'], {
    env: { ...process.env, PORT: '0', ...(root ? { ROOT: root } : {}) },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('Le serveur de test n’a pas annoncé de port')), 15_000);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const found = out.match(/127\.0\.0\.1:(\d+)/);
      if (found) { clearTimeout(timer); resolve(Number(found[1])); }
    });
  });
  for (let i = 0; i < 60; i += 1) {
    if (await serverAnswers(port)) return { child, port };
    await wait(100);
  }
  child.kill();
  throw new Error(`Le serveur de test ne répond pas sur le port ${port}`);
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
test('hors ligne : l’app se recharge et garde ses données', async ({ page }) => {
  const { child: server, port } = await startServer();
  const origin = `http://127.0.0.1:${port}`;

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

/**
 * Mise à jour, de bout en bout : une nouvelle version est publiée sur un serveur
 * dédié, le navigateur doit la détecter, le bandeau apparaître, le rechargement
 * basculer sur la nouvelle version, les anciens caches de l'app disparaître,
 * ceux du voisin rester, et les données ne pas bouger d'un poil.
 */
test('une nouvelle version : bandeau, rechargement, données intactes', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'compteur-wc-maj-'));
  for (const name of ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons']) {
    await cp(name, join(root, name), { recursive: true });
  }
  const { child: server, port } = await startServer(root);
  const origin = `http://127.0.0.1:${port}`;

  try {
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await page.goto(`${origin}/`);
    await page.evaluate(async ([key, value]) => {
      localStorage.setItem(key, value);
      // Une app voisine sur le même domaine, qui ne doit rien subir.
      await (await caches.open('prise-de-masse-test')).put('/voisin', new Response('intact'));
    }, [STORAGE_KEY, JSON.stringify(stableState())]);
    await page.reload();
    await waitForServiceWorker(page);

    // Nouvelle version publiée : on incrémente comme le ferait une vraie publication,
    // quelle que soit la version courante du dépôt.
    const versionFile = join(root, 'js', 'version.js');
    const actuelle = (await readFile(versionFile, 'utf8')).match(/'(\d+\.\d+\.\d+)'/)[1];
    for (const file of [versionFile, join(root, 'sw.js')]) {
      const source = await readFile(file, 'utf8');
      await writeFile(file, source.replaceAll(`'${actuelle}'`, "'9.9.9'"));
    }

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });

    const banner = page.locator('#update-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Mise à jour disponible');

    await banner.getByRole('button', { name: 'Recharger' }).click();

    // La page se recharge toute seule sur la nouvelle version.
    await page.waitForFunction(() => self.APP_VERSION === '9.9.9', null, { timeout: 20_000 });
    await expect(banner).toBeHidden();

    // Les données sont intactes...
    await expect(counter(page, 'caca')).toHaveText('1');
    await expect(entries(page)).toHaveCount(1);
    await page.goto(`${origin}/#/parametres`);
    await expect(page.locator('.version')).toHaveText('Version 9.9.9');

    // ...l'ancien cache de l'app est supprimé, celui du voisin est intact.
    const caches_ = await page.evaluate(async () => ({
      noms: await caches.keys(),
      voisin: await (await caches.open('prise-de-masse-test')).match('/voisin').then((r) => (r ? r.text() : null)),
    }));
    expect(caches_.noms.filter((n) => n.startsWith('compteur-wc-'))).toEqual(['compteur-wc-9.9.9']);
    expect(caches_.voisin).toBe('intact');
  } finally {
    server.kill();
    await rm(root, { recursive: true, force: true });
  }
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
