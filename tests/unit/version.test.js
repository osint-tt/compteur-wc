import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = (name) => readFile(fileURLToPath(new URL(name, root)), 'utf8');

test('la version est la même dans js/version.js, sw.js et package.json', async () => {
  const version = await read('js/version.js');
  const app = version.match(/self\.APP_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(app, 'js/version.js doit définir self.APP_VERSION = \'x.y.z\'');

  // La version est recopiée dans sw.js à dessein : le navigateur ne détecte une
  // mise à jour que si le contenu de sw.js lui-même a changé.
  const sw = await read('sw.js');
  const worker = sw.match(/const VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(worker, 'sw.js doit définir const VERSION = \'x.y.z\'');
  assert.equal(worker[1], app[1],
    'Version différente entre sw.js et js/version.js : il faut incrémenter les deux.');

  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.version, app[1],
    'Version différente entre package.json et js/version.js : il faut incrémenter les deux.');

  const html = await read('index.html');
  assert.match(html, /<script src="\.\/js\/version\.js"><\/script>/);
});

test('le service worker est enregistré sans passer par le cache HTTP', async () => {
  const app = await read('js/app.js');
  assert.match(app, /register\('\.\/sw\.js', \{ updateViaCache: 'none' \}\)/);
});

test('le nom du cache du service worker est bien préfixé', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /const CACHE_PREFIX = 'compteur-wc-'/);
  assert.match(sw, /CACHE_PREFIX \+ VERSION/);
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
