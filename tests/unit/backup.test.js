import test from 'node:test';
import assert from 'node:assert/strict';

import { validateImport, migrate, SCHEMA_VERSION } from '../../js/logic.js';

const valid = () => ({
  version: 1,
  settings: { theme: 'dark', range: 7, chartType: 'pipi' },
  places: [{ id: 'iut', name: 'IUT' }, { id: 'maison', name: 'Chez moi' }],
  entries: [
    {
      id: 'e1',
      type: 'caca',
      date: '2026-09-21',
      time: '14:15',
      placeId: 'iut',
      placeName: 'IUT',
      createdAt: '2026-09-21T12:15:00.000Z',
    },
  ],
});

test('sauvegarde valide', () => {
  const result = validateImport(valid());
  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, { entries: 1, places: 2 });
  assert.equal(result.data.version, SCHEMA_VERSION);
  assert.equal(result.data.settings.theme, 'dark');
  assert.equal(result.data.entries[0].placeName, 'IUT');
});

test('sauvegarde sans passage mais avec des lieux', () => {
  const data = { ...valid(), entries: [] };
  const result = validateImport(data);
  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, { entries: 0, places: 2 });
});

test('fichier qui n’est pas une sauvegarde', () => {
  for (const bad of [null, 42, 'texte', [], { hello: 'monde' }]) {
    assert.equal(validateImport(bad).ok, false);
  }
});

test('version inconnue', () => {
  const future = { ...valid(), version: SCHEMA_VERSION + 1 };
  const result = validateImport(future);
  assert.equal(result.ok, false);
  assert.match(result.error, /plus récente/);

  assert.equal(validateImport({ ...valid(), version: 0 }).ok, false);
  assert.equal(validateImport({ ...valid(), version: '1' }).ok, false);
  assert.equal(validateImport({ ...valid(), version: undefined }).ok, false);
});

test('lieux invalides', () => {
  assert.equal(validateImport({ ...valid(), places: [] }).ok, false);
  assert.equal(validateImport({ ...valid(), places: 'iut' }).ok, false);
  assert.equal(validateImport({ ...valid(), places: [{ id: 'a' }] }).ok, false);
  assert.equal(validateImport({ ...valid(), places: [{ id: 'a', name: '  ' }] }).ok, false);
  assert.equal(validateImport({
    ...valid(),
    places: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }],
  }).ok, false);
});

test('passages invalides', () => {
  const withEntry = (patch) => validateImport({
    ...valid(),
    entries: [{ ...valid().entries[0], ...patch }],
  });
  assert.equal(withEntry({ type: 'vomi' }).ok, false);
  assert.equal(withEntry({ date: '21/09/2026' }).ok, false);
  assert.equal(withEntry({ date: '2026-02-30' }).ok, false);
  assert.equal(withEntry({ time: '14:07' }).ok, false); // pas un quart d'heure
  assert.equal(withEntry({ time: '25:00' }).ok, false);
  assert.equal(withEntry({ id: '' }).ok, false);
  assert.equal(withEntry({ placeId: 42 }).ok, false);
  assert.equal(validateImport({ ...valid(), entries: 'non' }).ok, false);
  // Un lieu supprimé reste valide : le passage garde son nom copié.
  assert.equal(withEntry({ placeId: 'disparu', placeName: 'Ancien' }).ok, true);
});

test('réglages absents ou farfelus : valeurs par défaut', () => {
  const noSettings = validateImport({ ...valid(), settings: undefined });
  assert.equal(noSettings.ok, true);
  assert.equal(noSettings.data.settings.theme, 'auto');
  assert.equal(noSettings.data.settings.range, 30);
  assert.equal(noSettings.data.settings.chartType, 'caca');

  const weird = validateImport({ ...valid(), settings: { theme: 'bleu', range: 42 } });
  assert.equal(weird.ok, true);
  assert.equal(weird.data.settings.theme, 'auto');
  assert.equal(weird.data.settings.range, 30);

  assert.equal(validateImport({ ...valid(), settings: 'sombre' }).ok, false);
});

test('migration vers la version courante', () => {
  const migrated = migrate({ version: 1, settings: { theme: 'light' }, places: [], entries: [] });
  assert.equal(migrated.version, SCHEMA_VERSION);
  assert.equal(migrated.settings.theme, 'light');
  assert.equal(migrated.settings.range, 30);

  const noSettings = migrate({ version: 1, places: [], entries: [] });
  assert.equal(noSettings.settings.theme, 'auto');

  // La migration ne touche pas à l'objet d'origine.
  const original = { version: 1, settings: { theme: 'dark' }, places: [], entries: [] };
  migrate(original);
  assert.deepEqual(original.settings, { theme: 'dark' });
});

test('un export relu par l’import redonne exactement les mêmes données', () => {
  const source = valid();
  const round = validateImport(JSON.parse(JSON.stringify(source)));
  assert.equal(round.ok, true);
  assert.deepEqual(round.data.entries, source.entries);
  assert.deepEqual(round.data.places, source.places);
});
