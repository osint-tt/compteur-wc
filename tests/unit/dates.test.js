// Le fuseau est fixé avant le chargement de logic.js (import dynamique volontaire).
process.env.TZ = 'Europe/Paris';

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  dateKey, parseDateKey, addDays, diffDays, isValidDateKey,
  formatDateLong, formatDateShort, formatDateMedium, formatNumberFr, formatHourRange,
} = await import('../../js/logic.js');

test('le fuseau des tests est bien Europe/Paris', () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/Paris');
});

test('clé de date à 23 h 30, heure locale', () => {
  const d = new Date(2026, 8, 21, 23, 30, 0); // 21 septembre 2026, 23:30 à Paris
  assert.equal(dateKey(d), '2026-09-21');
});

test('clé de date à 0 h 30 : le jour local, pas le jour UTC', () => {
  const d = new Date(2026, 8, 21, 0, 30, 0); // 21 septembre 2026, 00:30 à Paris = 20/09 22:30 UTC
  assert.equal(dateKey(d), '2026-09-21');
  assert.equal(d.toISOString().slice(0, 10), '2026-09-20');
  assert.notEqual(dateKey(d), d.toISOString().slice(0, 10));
});

test('clé de date en hiver à 0 h 30 (UTC+1)', () => {
  const d = new Date(2026, 0, 15, 0, 30, 0);
  assert.equal(dateKey(d), '2026-01-15');
  assert.equal(d.toISOString().slice(0, 10), '2026-01-14');
});

test('aller-retour clé / Date locale', () => {
  assert.equal(dateKey(parseDateKey('2026-09-21')), '2026-09-21');
  assert.equal(dateKey(parseDateKey('2026-01-01')), '2026-01-01');
  assert.equal(dateKey(parseDateKey('2026-12-31')), '2026-12-31');
});

test('addDays et diffDays traversent le changement d’heure', () => {
  // L'heure d'hiver arrive le 25 octobre 2026 en France.
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(diffDays('2026-10-24', '2026-10-26'), 2);
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
});

test('addDays change de mois et d’année', () => {
  assert.equal(addDays('2026-09-01', -1), '2026-08-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(diffDays('2026-09-21', '2026-09-21'), 0);
  assert.equal(diffDays('2026-09-21', '2026-09-20'), -1);
  assert.equal(diffDays('2026-08-23', '2026-09-21'), 29);
});

test('validité d’une clé de date', () => {
  assert.equal(isValidDateKey('2026-09-21'), true);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(isValidDateKey('2026-02-30'), false);
  assert.equal(isValidDateKey('2026-9-21'), false);
  assert.equal(isValidDateKey(20260921), false);
});

test('formats français', () => {
  assert.equal(formatDateLong('2026-09-21'), 'Lundi 21 septembre');
  assert.equal(formatDateShort('2026-09-21'), '21/09');
  assert.equal(formatDateMedium('2026-09-21'), '21 sept.');
  assert.equal(formatNumberFr(1.44), '1,4');
  assert.equal(formatNumberFr(0), '0,0');
  assert.equal(formatNumberFr(2 / 3), '0,7');
  assert.equal(formatHourRange(8), '8 h – 9 h');
  assert.equal(formatHourRange(23), '23 h – 24 h');
});
