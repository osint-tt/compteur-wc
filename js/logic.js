/**
 * Logique pure de Compteur WC.
 * Aucun accès au DOM, au stockage ou au réseau : tout est testable avec `node --test`.
 */

export const SCHEMA_VERSION = 1;

export const TYPES = ['caca', 'pipi'];

export const DEFAULT_PLACES = [
  { id: 'iut', name: 'IUT' },
  { id: 'maison', name: 'Chez moi' },
  { id: 'bar', name: 'Bar/boîte' },
  { id: 'public', name: 'Public' },
  { id: 'chez-qqn', name: 'Chez quelqu’un' },
];

export const THEMES = ['auto', 'light', 'dark'];

export const RANGES = [7, 30, 90];

export const PLACE_NAME_MAX = 30;

export const STEP_MINUTES = 15;
export const MIN_TIME_MINUTES = 0;
export const MAX_TIME_MINUTES = 23 * 60 + 45;

/* ------------------------------------------------------------------ heures */

const pad2 = (n) => String(n).padStart(2, '0');

export function isValidTime(time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return false;
  const [h, m] = time.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** L'heure d'un passage est toujours un multiple de 15 minutes. */
export function isQuarterTime(time) {
  return isValidTime(time) && timeToMinutes(time) % STEP_MINUTES === 0;
}

/** Heure « HH:MM » -> minutes depuis minuit. */
export function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes depuis minuit -> « HH:MM » (borné à 00:00 / 23:45). */
export function minutesToTime(minutes) {
  const clamped = Math.min(MAX_TIME_MINUTES, Math.max(MIN_TIME_MINUTES, minutes));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/**
 * Arrondit une heure au quart d'heure le plus proche, sans jamais changer de jour :
 * ce qui dépasserait 23:45 reste 23:45.
 */
export function roundTimeToQuarter(hours, minutes) {
  const total = hours * 60 + minutes;
  const rounded = Math.round(total / STEP_MINUTES) * STEP_MINUTES;
  return minutesToTime(rounded);
}

/** Heure par défaut proposée pour un instant donné. */
export function defaultTimeForDate(date) {
  return roundTimeToQuarter(date.getHours(), date.getMinutes());
}

/** Boutons -15 / +15, bornés à 00:00 et 23:45. */
export function shiftTime(time, deltaMinutes) {
  return minutesToTime(timeToMinutes(time) + deltaMinutes);
}

/* ------------------------------------------------------------------- dates */

export function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Clé AAAA-MM-JJ construite avec l'année, le mois et le jour **locaux**. */
export function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Clé AAAA-MM-JJ -> Date locale à minuit (pour le formatage). */
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Les calculs de jours passent par UTC pour ignorer les changements d'heure.
const keyToUTC = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(key, days) {
  const d = new Date(keyToUTC(key) + days * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function diffDays(from, to) {
  return Math.round((keyToUTC(to) - keyToUTC(from)) / 86400000);
}

/* --------------------------------------------------------------- formatage */

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const longDateFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const shortDateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });

const mediumDateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** « Lundi 21 septembre ». */
export function formatDateLong(key) {
  return capitalize(longDateFormat.format(parseDateKey(key)));
}

/** « 21/09 ». */
export function formatDateShort(key) {
  return shortDateFormat.format(parseDateKey(key));
}

/** « 21 sept. ». */
export function formatDateMedium(key) {
  return mediumDateFormat.format(parseDateKey(key));
}

/** « 1,4 ». */
export function formatNumberFr(value, decimals = 1) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** « 8 h – 9 h ». */
export function formatHourRange(hour) {
  return `${hour} h – ${hour + 1} h`;
}

export function labelForType(type, count = 1) {
  if (type === 'caca') return count > 1 ? 'Cacas' : 'Caca';
  return count > 1 ? 'Pipis' : 'Pipi';
}

/* ----------------------------------------------------------------- passages */

export function entriesForDate(entries, key) {
  return entries
    .filter((e) => e.date === key)
    .sort((a, b) => (a.time === b.time
      ? String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      : b.time.localeCompare(a.time)));
}

export function countsForDate(entries, key) {
  const counts = { caca: 0, pipi: 0, total: 0 };
  for (const e of entries) {
    if (e.date !== key) continue;
    if (e.type === 'caca') counts.caca += 1;
    else if (e.type === 'pipi') counts.pipi += 1;
    counts.total += 1;
  }
  return counts;
}

/** Les `days` clés de jour qui se terminent aujourd'hui (la plus ancienne d'abord). */
export function rangeKeys(todayKey, days) {
  const keys = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(addDays(todayKey, -i));
  return keys;
}

/** Série du graphique : un point par jour de la période, pour un type donné. */
export function buildSeries(entries, todayKey, days, type) {
  const counts = new Map();
  for (const e of entries) {
    if (e.type !== type) continue;
    counts.set(e.date, (counts.get(e.date) || 0) + 1);
  }
  return rangeKeys(todayKey, days).map((date) => ({ date, count: counts.get(date) || 0 }));
}

/**
 * Échelle du graphique : 3 ou 4 lignes de repère, valeurs entières.
 */
export function niceScale(maxValue) {
  const m = Math.max(1, Math.ceil(maxValue));
  let step = Math.max(1, Math.ceil(m / 4));
  let max = Math.ceil(m / step) * step;
  if (max < 3) {
    step = 1;
    max = 3;
  }
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, step, ticks };
}

/**
 * Les 4 stats de la période.
 * La moyenne compte les jours depuis le plus tardif entre le début de la période et le tout
 * premier passage enregistré, jusqu'à aujourd'hui inclus : les jours sans passage comptent pour 0.
 * Record, lieu et heure portent sur tous les passages (cacas + pipis) de la période.
 */
export function computeStats(entries, todayKey, days, places = []) {
  const rangeStart = addDays(todayKey, -(days - 1));
  const inRange = entries.filter((e) => e.date >= rangeStart && e.date <= todayKey);

  let firstKey = null;
  for (const e of entries) {
    if (e.date <= todayKey && (firstKey === null || e.date < firstKey)) firstKey = e.date;
  }
  const start = firstKey && firstKey > rangeStart ? firstKey : rangeStart;
  const dayCount = Math.max(1, diffDays(start, todayKey) + 1);

  let caca = 0;
  let pipi = 0;
  const perDay = new Map();
  const perPlace = new Map();
  const perHour = new Map();

  for (const e of inRange) {
    if (e.type === 'caca') caca += 1;
    else if (e.type === 'pipi') pipi += 1;
    perDay.set(e.date, (perDay.get(e.date) || 0) + 1);

    const placeId = e.placeId || '';
    const bucket = perPlace.get(placeId) || { placeId, count: 0, name: e.placeName || '' };
    bucket.count += 1;
    if (e.placeName) bucket.name = e.placeName;
    perPlace.set(placeId, bucket);

    const hour = Number(String(e.time).slice(0, 2));
    if (Number.isFinite(hour)) perHour.set(hour, (perHour.get(hour) || 0) + 1);
  }

  // Record : le plus grand total sur une journée ; à égalité, la date la plus ancienne.
  let record = null;
  for (const [date, count] of [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!record || count > record.count) record = { date, count };
  }

  // Lieu le plus fréquent ; à égalité, l'ordre des paramètres.
  const placeRank = new Map(places.map((p, i) => [p.id, i]));
  let topPlace = null;
  for (const bucket of perPlace.values()) {
    const current = places.find((p) => p.id === bucket.placeId);
    const candidate = {
      placeId: bucket.placeId,
      name: current ? current.name : bucket.name,
      count: bucket.count,
      rank: placeRank.has(bucket.placeId) ? placeRank.get(bucket.placeId) : Number.MAX_SAFE_INTEGER,
    };
    if (!topPlace || candidate.count > topPlace.count
      || (candidate.count === topPlace.count && candidate.rank < topPlace.rank)) {
      topPlace = candidate;
    }
  }

  // Heure la plus fréquente ; à égalité, la plus tôt.
  let topHour = null;
  for (const [hour, count] of [...perHour.entries()].sort((a, b) => a[0] - b[0])) {
    if (!topHour || count > topHour.count) topHour = { hour, count };
  }

  return {
    hasData: entries.length > 0,
    dayCount,
    rangeStart,
    counts: { caca, pipi, total: caca + pipi },
    avgCaca: caca / dayCount,
    avgPipi: pipi / dayCount,
    record,
    topPlace,
    topHour,
  };
}

/* -------------------------------------------------------------------- lieux */

/** Comparaison insensible à la casse et aux accents. */
export function foldName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizePlaceName(name) {
  return String(name == null ? '' : name).trim();
}

/**
 * @returns {{ok: boolean, name?: string, error?: string}}
 */
export function validatePlaceName(name, places = [], currentId = null) {
  const clean = normalizePlaceName(name);
  if (!clean) return { ok: false, error: 'Le nom est obligatoire.' };
  if ([...clean].length > PLACE_NAME_MAX) {
    return { ok: false, error: `${PLACE_NAME_MAX} caractères maximum.` };
  }
  const folded = foldName(clean);
  const clash = places.some((p) => p.id !== currentId && foldName(p.name) === folded);
  if (clash) return { ok: false, error: 'Ce lieu existe déjà.' };
  return { ok: true, name: clean };
}

/** Il doit toujours rester au moins un lieu. */
export function canRemovePlace(places) {
  return Array.isArray(places) && places.length > 1;
}

export function makePlaceId(name, existingIds = []) {
  const base = foldName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lieu';
  let id = base;
  let n = 2;
  while (existingIds.includes(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

export function movePlace(places, id, delta) {
  const index = places.findIndex((p) => p.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= places.length) return places;
  const next = places.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/* --------------------------------------------------- migration et validation */

/** Amène une sauvegarde au schéma courant (une seule version pour l'instant). */
export function migrate(data) {
  const out = { ...data };
  // Les versions futures viendront s'ajouter ici, une étape par version.
  if (out.version < SCHEMA_VERSION) out.version = SCHEMA_VERSION;
  if (!out.settings || typeof out.settings !== 'object') out.settings = {};
  else out.settings = { ...out.settings };
  if (!THEMES.includes(out.settings.theme)) out.settings.theme = 'auto';
  // Préférences d'affichage du graphique (mémorisées, section 6.4).
  if (!RANGES.includes(out.settings.range)) out.settings.range = 30;
  if (!TYPES.includes(out.settings.chartType)) out.settings.chartType = 'caca';
  return out;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Valide entièrement un fichier de sauvegarde avant de remplacer quoi que ce soit.
 * @returns {{ok: boolean, error?: string, data?: object, summary?: {entries: number, places: number}}}
 */
export function validateImport(raw) {
  if (!isPlainObject(raw)) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde Compteur WC.' };
  if (!Number.isInteger(raw.version)) return { ok: false, error: 'Version de sauvegarde absente ou invalide.' };
  if (raw.version > SCHEMA_VERSION) {
    return { ok: false, error: 'Sauvegarde créée par une version plus récente de l’app.' };
  }
  if (raw.version < 1) return { ok: false, error: 'Version de sauvegarde inconnue.' };

  if (!Array.isArray(raw.places) || raw.places.length === 0) {
    return { ok: false, error: 'Aucun lieu dans le fichier.' };
  }
  const ids = new Set();
  for (const place of raw.places) {
    if (!isPlainObject(place) || typeof place.id !== 'string' || !place.id
      || typeof place.name !== 'string' || !normalizePlaceName(place.name)) {
      return { ok: false, error: 'Un lieu du fichier est invalide.' };
    }
    if (ids.has(place.id)) return { ok: false, error: 'Deux lieux du fichier ont le même identifiant.' };
    ids.add(place.id);
  }

  if (!Array.isArray(raw.entries)) return { ok: false, error: 'Liste des passages absente ou invalide.' };
  for (const entry of raw.entries) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || !entry.id) {
      return { ok: false, error: 'Un passage du fichier est invalide.' };
    }
    if (!TYPES.includes(entry.type)) return { ok: false, error: 'Un passage a un type inconnu.' };
    if (!isValidDateKey(entry.date)) return { ok: false, error: 'Un passage a une date invalide.' };
    if (!isQuarterTime(entry.time)) return { ok: false, error: 'Un passage a une heure invalide.' };
    if (typeof entry.placeId !== 'string') return { ok: false, error: 'Un passage a un lieu invalide.' };
  }

  if (raw.settings !== undefined && !isPlainObject(raw.settings)) {
    return { ok: false, error: 'Réglages du fichier invalides.' };
  }

  const data = migrate({
    version: raw.version,
    settings: isPlainObject(raw.settings) ? { ...raw.settings } : { theme: 'auto' },
    places: raw.places.map((p) => ({ id: p.id, name: normalizePlaceName(p.name) })),
    entries: raw.entries.map((e) => ({
      id: e.id,
      type: e.type,
      date: e.date,
      time: e.time,
      placeId: e.placeId,
      placeName: typeof e.placeName === 'string' ? e.placeName : '',
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : '',
    })),
  });

  return {
    ok: true,
    data,
    summary: { entries: data.entries.length, places: data.places.length },
  };
}
