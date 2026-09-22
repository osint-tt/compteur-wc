import test from 'node:test';
import assert from 'node:assert/strict';

import {
  roundTimeToQuarter, defaultTimeForDate, shiftTime, timeToMinutes, minutesToTime,
  isValidTime, isQuarterTime, MIN_TIME_MINUTES, MAX_TIME_MINUTES,
} from '../../js/logic.js';

test('arrondi au quart d’heure le plus proche (exemples du cahier des charges)', () => {
  assert.equal(roundTimeToQuarter(14, 7), '14:00');
  assert.equal(roundTimeToQuarter(14, 8), '14:15');
  assert.equal(roundTimeToQuarter(14, 22), '14:15');
  assert.equal(roundTimeToQuarter(14, 23), '14:30');
  assert.equal(roundTimeToQuarter(14, 53), '15:00');
});

test('arrondi : minuit et fin de journée', () => {
  assert.equal(roundTimeToQuarter(0, 7), '00:00');
  assert.equal(roundTimeToQuarter(0, 0), '00:00');
  assert.equal(roundTimeToQuarter(23, 52), '23:45');
  // L'arrondi ne change jamais la date : 23:53 reste 23:45 le même jour.
  assert.equal(roundTimeToQuarter(23, 53), '23:45');
  assert.equal(roundTimeToQuarter(23, 59), '23:45');
});

test('arrondi : tous les quarts d’heure sont stables', () => {
  for (let h = 0; h <= 23; h += 1) {
    for (const m of [0, 15, 30, 45]) {
      assert.equal(roundTimeToQuarter(h, m), `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
});

test('heure par défaut à partir d’une date', () => {
  assert.equal(defaultTimeForDate(new Date(2026, 8, 21, 14, 8)), '14:15');
  assert.equal(defaultTimeForDate(new Date(2026, 8, 21, 23, 53)), '23:45');
  assert.equal(defaultTimeForDate(new Date(2026, 8, 21, 0, 7)), '00:00');
});

test('boutons −15 / +15', () => {
  assert.equal(shiftTime('14:15', -15), '14:00');
  assert.equal(shiftTime('14:15', 15), '14:30');
  assert.equal(shiftTime('14:00', -15), '13:45');
  assert.equal(shiftTime('13:45', 15), '14:00');
});

test('bornes : jamais avant 00:00 ni après 23:45', () => {
  assert.equal(shiftTime('00:00', -15), '00:00');
  assert.equal(shiftTime('00:15', -15), '00:00');
  assert.equal(shiftTime('23:45', 15), '23:45');
  assert.equal(shiftTime('23:30', 15), '23:45');
  assert.equal(timeToMinutes('00:00'), MIN_TIME_MINUTES);
  assert.equal(timeToMinutes('23:45'), MAX_TIME_MINUTES);
});

test('conversions heure / minutes', () => {
  assert.equal(timeToMinutes('08:45'), 525);
  assert.equal(minutesToTime(525), '08:45');
  assert.equal(minutesToTime(-30), '00:00');
  assert.equal(minutesToTime(24 * 60), '23:45');
});

test('validité d’une heure', () => {
  assert.equal(isValidTime('08:45'), true);
  assert.equal(isValidTime('8:45'), false);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('12:60'), false);
  assert.equal(isValidTime(null), false);
  assert.equal(isQuarterTime('08:45'), true);
  assert.equal(isQuarterTime('08:07'), false);
});
