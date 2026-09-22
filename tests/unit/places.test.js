import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePlaceName, canRemovePlace, makePlaceId, movePlace, foldName,
  normalizePlaceName, DEFAULT_PLACES, PLACE_NAME_MAX,
} from '../../js/logic.js';

const PLACES = DEFAULT_PLACES.map((p) => ({ ...p }));

test('les 5 lieux par défaut, dans l’ordre', () => {
  assert.deepEqual(DEFAULT_PLACES.map((p) => p.name),
    ['IUT', 'Chez moi', 'Bar/boîte', 'Public', 'Chez quelqu’un']);
  assert.deepEqual(DEFAULT_PLACES.map((p) => p.id),
    ['iut', 'maison', 'bar', 'public', 'chez-qqn']);
});

test('nom obligatoire', () => {
  assert.equal(validatePlaceName('', PLACES).ok, false);
  assert.equal(validatePlaceName('   ', PLACES).ok, false);
  assert.equal(validatePlaceName(null, PLACES).ok, false);
  assert.equal(validatePlaceName(undefined, PLACES).ok, false);
});

test('espaces retirés aux extrémités', () => {
  const result = validatePlaceName('  Chez Léa  ', PLACES);
  assert.equal(result.ok, true);
  assert.equal(result.name, 'Chez Léa');
  assert.equal(normalizePlaceName('  a  '), 'a');
});

test('30 caractères maximum', () => {
  const thirty = 'a'.repeat(PLACE_NAME_MAX);
  assert.equal(validatePlaceName(thirty, PLACES).ok, true);
  assert.equal(validatePlaceName(`${thirty}a`, PLACES).ok, false);
  // Les espaces de bord ne comptent pas.
  assert.equal(validatePlaceName(`  ${thirty}  `, PLACES).ok, true);
});

test('doublons : insensible à la casse et aux accents', () => {
  assert.equal(validatePlaceName('IUT', PLACES).ok, false);
  assert.equal(validatePlaceName('iut', PLACES).ok, false);
  assert.equal(validatePlaceName('  Iut ', PLACES).ok, false);
  assert.equal(validatePlaceName('chez moi', PLACES).ok, false);

  const withAccents = [{ id: 'cafe', name: 'Café' }];
  assert.equal(validatePlaceName('cafe', withAccents).ok, false);
  assert.equal(validatePlaceName('CAFÉ', withAccents).ok, false);
  assert.equal(validatePlaceName('Cafés', withAccents).ok, true);
  assert.equal(foldName('Café'), 'cafe');
});

test('renommer un lieu sans changer son nom reste valide', () => {
  assert.equal(validatePlaceName('IUT', PLACES, 'iut').ok, true);
  assert.equal(validatePlaceName('IUT ', PLACES, 'iut').ok, true);
  assert.equal(validatePlaceName('Chez moi', PLACES, 'iut').ok, false);
});

test('il doit toujours rester au moins un lieu', () => {
  assert.equal(canRemovePlace(PLACES), true);
  assert.equal(canRemovePlace([{ id: 'a', name: 'A' }]), false);
  assert.equal(canRemovePlace([]), false);
});

test('identifiant de lieu lisible et unique', () => {
  assert.equal(makePlaceId('Chez Léa', []), 'chez-lea');
  assert.equal(makePlaceId('Bar/boîte', []), 'bar-boite');
  assert.equal(makePlaceId('Chez Léa', ['chez-lea']), 'chez-lea-2');
  assert.equal(makePlaceId('Chez Léa', ['chez-lea', 'chez-lea-2']), 'chez-lea-3');
  assert.equal(makePlaceId('!!!', []), 'lieu');
});

test('monter / descendre dans l’ordre', () => {
  const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  assert.deepEqual(movePlace(list, 'b', -1).map((p) => p.id), ['b', 'a', 'c']);
  assert.deepEqual(movePlace(list, 'b', 1).map((p) => p.id), ['a', 'c', 'b']);
  // Bornes : rien ne bouge.
  assert.deepEqual(movePlace(list, 'a', -1).map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(movePlace(list, 'c', 1).map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(movePlace(list, 'inconnu', 1).map((p) => p.id), ['a', 'b', 'c']);
  // La liste d'origine n'est pas modifiée.
  assert.deepEqual(list.map((p) => p.id), ['a', 'b', 'c']);
});
