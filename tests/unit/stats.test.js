import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeStats, buildSeries, countsForDate, entriesForDate, rangeKeys, niceScale,
} from '../../js/logic.js';

const TODAY = '2026-09-21';

let seq = 0;
const entry = (date, time, type, placeId, placeName = placeId) => ({
  id: `e${seq += 1}`, type, date, time, placeId, placeName, createdAt: `${date}T${time}:00`,
});

const PLACES = [
  { id: 'iut', name: 'IUT' },
  { id: 'maison', name: 'Chez moi' },
];

test('moyenne : on part du premier passage quand il est dans la période', () => {
  const entries = [
    entry('2026-09-19', '08:00', 'caca', 'iut'),
    entry('2026-09-21', '09:00', 'caca', 'iut'),
  ];
  // Du 19 au 21 inclus = 3 jours, le 20 compte pour 0.
  for (const days of [7, 30, 90]) {
    const stats = computeStats(entries, TODAY, days, PLACES);
    assert.equal(stats.dayCount, 3, `durée ${days} j`);
    assert.equal(stats.avgCaca, 2 / 3);
    assert.equal(stats.avgPipi, 0);
  }
});

test('moyenne : les jours sans passage comptent pour 0', () => {
  const entries = [
    entry('2026-09-15', '08:00', 'caca', 'iut'),
    entry('2026-09-15', '09:00', 'caca', 'iut'),
    entry('2026-09-21', '09:00', 'caca', 'iut'),
  ];
  const stats = computeStats(entries, TODAY, 7, PLACES);
  assert.equal(stats.dayCount, 7); // du 15 au 21 inclus
  assert.equal(stats.avgCaca, 3 / 7);
});

test('moyenne : le début de la période l’emporte quand le premier passage est plus ancien', () => {
  const entries = [
    entry('2026-08-01', '08:00', 'caca', 'iut'),
    entry('2026-09-21', '09:00', 'caca', 'iut'),
  ];
  const stats30 = computeStats(entries, TODAY, 30, PLACES);
  assert.equal(stats30.rangeStart, '2026-08-23');
  assert.equal(stats30.dayCount, 30);
  assert.equal(stats30.counts.caca, 1); // le passage du 1er août est hors période
  assert.equal(stats30.avgCaca, 1 / 30);

  const stats90 = computeStats(entries, TODAY, 90, PLACES);
  assert.equal(stats90.dayCount, 52); // du 1er août au 21 septembre inclus
  assert.equal(stats90.counts.caca, 2);
});

test('moyennes séparées pour les cacas et les pipis', () => {
  const entries = [
    entry('2026-09-20', '08:00', 'caca', 'iut'),
    entry('2026-09-20', '08:30', 'pipi', 'iut'),
    entry('2026-09-21', '09:00', 'pipi', 'iut'),
    entry('2026-09-21', '10:00', 'pipi', 'iut'),
  ];
  const stats = computeStats(entries, TODAY, 30, PLACES);
  assert.equal(stats.dayCount, 2);
  assert.equal(stats.avgCaca, 0.5);
  assert.equal(stats.avgPipi, 1.5);
});

test('record : plus grand total sur une journée, tous types confondus', () => {
  const entries = [
    entry('2026-09-18', '08:00', 'caca', 'iut'),
    entry('2026-09-19', '08:00', 'caca', 'iut'),
    entry('2026-09-19', '09:00', 'pipi', 'iut'),
    entry('2026-09-19', '10:00', 'pipi', 'iut'),
    entry('2026-09-21', '11:00', 'pipi', 'iut'),
  ];
  const stats = computeStats(entries, TODAY, 30, PLACES);
  assert.deepEqual(stats.record, { date: '2026-09-19', count: 3 });
});

test('record : à égalité, la date la plus ancienne', () => {
  const entries = [
    entry('2026-09-19', '08:00', 'caca', 'iut'),
    entry('2026-09-19', '09:00', 'pipi', 'iut'),
    entry('2026-09-21', '08:00', 'caca', 'iut'),
    entry('2026-09-21', '09:00', 'pipi', 'iut'),
  ];
  const stats = computeStats(entries, TODAY, 30, PLACES);
  assert.deepEqual(stats.record, { date: '2026-09-19', count: 2 });
});

test('lieu le plus fréquent, et égalité arbitrée par l’ordre des paramètres', () => {
  const entries = [
    entry('2026-09-20', '08:00', 'caca', 'maison'),
    entry('2026-09-20', '09:00', 'pipi', 'maison'),
    entry('2026-09-21', '08:00', 'caca', 'iut'),
    entry('2026-09-21', '09:00', 'pipi', 'iut'),
  ];
  const stats = computeStats(entries, TODAY, 30, PLACES);
  assert.equal(stats.topPlace.placeId, 'iut'); // IUT est premier dans les paramètres
  assert.equal(stats.topPlace.name, 'IUT');
  assert.equal(stats.topPlace.count, 2);
});

test('lieu le plus fréquent : un lieu supprimé garde son nom copié et perd les égalités', () => {
  const entries = [
    entry('2026-09-20', '08:00', 'caca', 'ancien', 'Ancien lieu'),
    entry('2026-09-20', '09:00', 'pipi', 'ancien', 'Ancien lieu'),
    entry('2026-09-21', '08:00', 'caca', 'iut'),
    entry('2026-09-21', '09:00', 'pipi', 'iut'),
  ];
  assert.equal(computeStats(entries, TODAY, 30, PLACES).topPlace.placeId, 'iut');

  const withMore = [...entries, entry('2026-09-21', '10:00', 'pipi', 'ancien', 'Ancien lieu')];
  const top = computeStats(withMore, TODAY, 30, PLACES).topPlace;
  assert.equal(top.placeId, 'ancien');
  assert.equal(top.name, 'Ancien lieu');
});

test('lieu le plus fréquent : le nom suit le renommage', () => {
  const entries = [entry('2026-09-21', '08:00', 'caca', 'iut', 'Ancien nom')];
  const stats = computeStats(entries, TODAY, 30, PLACES);
  assert.equal(stats.topPlace.name, 'IUT');
});

test('heure la plus fréquente, par tranche d’une heure', () => {
  const entries = [
    entry('2026-09-20', '08:15', 'caca', 'iut'),
    entry('2026-09-20', '08:45', 'pipi', 'iut'),
    entry('2026-09-21', '09:15', 'pipi', 'iut'),
    entry('2026-09-21', '23:00', 'pipi', 'iut'),
  ];
  const stats = computeStats(entries, TODAY, 30, PLACES);
  assert.deepEqual(stats.topHour, { hour: 8, count: 2 });
});

test('heure la plus fréquente : à égalité, la plus tôt', () => {
  const entries = [
    entry('2026-09-21', '15:00', 'pipi', 'iut'),
    entry('2026-09-21', '07:00', 'caca', 'iut'),
  ];
  assert.deepEqual(computeStats(entries, TODAY, 30, PLACES).topHour, { hour: 7, count: 1 });
});

test('période vide : pas de record, pas de lieu, pas d’heure', () => {
  const entries = [entry('2026-01-05', '08:00', 'caca', 'iut')];
  const stats = computeStats(entries, TODAY, 7, PLACES);
  assert.equal(stats.hasData, true);
  assert.equal(stats.record, null);
  assert.equal(stats.topPlace, null);
  assert.equal(stats.topHour, null);
  assert.equal(stats.avgCaca, 0);
});

test('aucune donnée du tout', () => {
  const stats = computeStats([], TODAY, 30, PLACES);
  assert.equal(stats.hasData, false);
  assert.equal(stats.avgCaca, 0);
  assert.equal(stats.record, null);
});

test('les passages du futur ne faussent pas le premier jour compté', () => {
  const entries = [
    entry('2026-09-21', '08:00', 'caca', 'iut'),
    entry('2026-12-25', '08:00', 'caca', 'iut'),
  ];
  const stats = computeStats(entries, TODAY, 30, PLACES);
  assert.equal(stats.dayCount, 1);
  assert.equal(stats.counts.caca, 1);
});

test('série du graphique : un point par jour, zéros compris', () => {
  const entries = [
    entry('2026-09-21', '08:00', 'caca', 'iut'),
    entry('2026-09-21', '09:00', 'caca', 'iut'),
    entry('2026-09-19', '09:00', 'pipi', 'iut'),
  ];
  const series = buildSeries(entries, TODAY, 7, 'caca');
  assert.equal(series.length, 7);
  assert.equal(series[0].date, '2026-09-15');
  assert.equal(series[6].date, '2026-09-21');
  assert.equal(series[6].count, 2);
  assert.equal(series[5].count, 0);
  assert.equal(buildSeries(entries, TODAY, 7, 'pipi')[4].count, 1);
  assert.equal(buildSeries(entries, TODAY, 30, 'caca').length, 30);
  assert.equal(buildSeries(entries, TODAY, 90, 'caca').length, 90);
});

test('compteurs et liste d’un jour', () => {
  const entries = [
    entry('2026-09-21', '08:00', 'caca', 'iut'),
    entry('2026-09-21', '14:15', 'pipi', 'iut'),
    entry('2026-09-20', '14:15', 'pipi', 'iut'),
  ];
  assert.deepEqual(countsForDate(entries, '2026-09-21'), { caca: 1, pipi: 1, total: 2 });
  assert.deepEqual(countsForDate(entries, '2026-09-22'), { caca: 0, pipi: 0, total: 0 });
  // Du plus récent au plus ancien.
  assert.deepEqual(entriesForDate(entries, '2026-09-21').map((e) => e.time), ['14:15', '08:00']);
});

test('clés de la période', () => {
  const keys = rangeKeys(TODAY, 7);
  assert.equal(keys.length, 7);
  assert.equal(keys[0], '2026-09-15');
  assert.equal(keys.at(-1), TODAY);
});

test('échelle du graphique : 3 ou 4 repères', () => {
  for (const max of [0, 1, 2, 3, 4, 5, 7, 9, 12, 25, 40]) {
    const scale = niceScale(max);
    const lines = scale.ticks.length - 1; // hors ligne de base
    assert.ok(lines >= 3 && lines <= 4, `max ${max} donne ${lines} repères`);
    assert.ok(scale.max >= max, `max ${max} <= ${scale.max}`);
    assert.ok(Number.isInteger(scale.step));
  }
  assert.equal(niceScale(8).max, 8);
  assert.equal(niceScale(9).max, 9);
});
