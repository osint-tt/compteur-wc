import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = (name) => readFile(fileURLToPath(new URL(name, root)), 'utf8');

test('APP_VERSION a une seule source : js/version.js', async () => {
  const version = await read('js/version.js');
  const match = version.match(/self\.APP_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(match, 'js/version.js doit définir self.APP_VERSION = \'x.y.z\'');

  const sw = await read('sw.js');
  assert.match(sw, /importScripts\('\.\/js\/version\.js'\)/);
  assert.doesNotMatch(sw, /APP_VERSION\s*=\s*['"]/, 'sw.js ne doit pas redéfinir la version');

  const html = await read('index.html');
  assert.match(html, /<script src="\.\/js\/version\.js"><\/script>/);

  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.version, match[1], 'package.json et js/version.js doivent être d’accord');
});

test('le nom du cache du service worker est bien préfixé', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /const CACHE_PREFIX = 'compteur-wc-'/);
  assert.match(sw, /CACHE_PREFIX \+ self\.APP_VERSION/);
  // Il ne supprime que ses propres caches.
  assert.match(sw, /name\.startsWith\(CACHE_PREFIX\) && name !== CACHE_NAME/);
});

test('aucune ressource externe ni localStorage.clear dans le code de l’app', async () => {
  const files = ['index.html', 'sw.js', 'js/app.js', 'js/logic.js', 'js/storage.js', 'css/style.css', 'manifest.webmanifest'];
  for (const name of files) {
    const source = await read(name);
    assert.doesNotMatch(source, /https?:\/\/(?!www\.w3\.org)/, `${name} ne doit charger aucune ressource externe`);
    assert.doesNotMatch(source, /localStorage\.clear/, `${name} ne doit jamais vider le localStorage`);
  }
});

test('une seule clé localStorage', async () => {
  const storage = await read('js/storage.js');
  assert.match(storage, /export const STORAGE_KEY = 'compteur-wc'/);
  const app = await read('js/app.js');
  assert.doesNotMatch(app, /localStorage/, 'seul storage.js touche au localStorage');
});
