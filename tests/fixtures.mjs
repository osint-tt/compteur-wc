/**
 * Jeux de données partagés par les tests e2e et le script de captures.
 * Aucune dépendance : ces fonctions tournent dans Node comme dans le navigateur.
 */

export const STORAGE_KEY = 'compteur-wc';

/** 21 septembre 2026, 14:08 à Paris. */
export const FIXED_NOW = '2026-09-21T14:08:00+02:00';
export const TODAY = '2026-09-21';

export const PLACES = [
  { id: 'iut', name: 'IUT' },
  { id: 'maison', name: 'Chez moi' },
  { id: 'bar', name: 'Bar/boîte' },
  { id: 'public', name: 'Public' },
  { id: 'chez-qqn', name: 'Chez quelqu’un' },
];

const pad = (n) => String(n).padStart(2, '0');

export function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function entry(id, type, date, time, place) {
  return {
    id,
    type,
    date,
    time,
    placeId: place.id,
    placeName: place.name,
    createdAt: `${date}T${time}:00.000Z`,
  };
}

export function emptyState(settings = {}) {
  return {
    version: 1,
    settings: { theme: 'auto', range: 30, chartType: 'caca', ...settings },
    places: PLACES.map((p) => ({ ...p })),
    entries: [],
  };
}

/**
 * Jeu de test vérifiable à la main, sur 30 jours (aujourd'hui = TODAY) :
 * - 1 caca à 08:15 à l'IUT chaque jour des 30 derniers jours ;
 * - 2 pipis en plus le 18/09 (il y a 3 jours) à 09:00 et 09:30, Chez moi.
 *
 * Donc, sur 30 jours : moyenne cacas 30/30 = 1,0 ; moyenne pipis 2/30 = 0,1 ;
 * record 3 passages le 18/09 ; lieu le plus fréquent IUT (30) ; heure 8 h – 9 h (30).
 * Sur 7 jours : moyenne cacas 7/7 = 1,0 ; moyenne pipis 2/7 = 0,3.
 */
export function stableState(settings = {}) {
  const state = emptyState(settings);
  for (let i = 0; i < 30; i += 1) {
    const date = addDays(TODAY, -i);
    state.entries.push(entry(`c${i}`, 'caca', date, '08:15', PLACES[0]));
  }
  const special = addDays(TODAY, -3);
  state.entries.push(entry('p1', 'pipi', special, '09:00', PLACES[1]));
  state.entries.push(entry('p2', 'pipi', special, '09:30', PLACES[1]));
  return state;
}

/**
 * Jeu de données réaliste sur 30 jours, pour les captures d'écran.
 * Déterministe : même résultat à chaque exécution.
 */
export function realisticState(settings = {}) {
  const state = emptyState(settings);
  const cacaTimes = ['08:15', '13:30', '20:45'];
  const pipiTimes = ['07:30', '09:45', '12:15', '15:00', '18:30', '22:15', '23:30'];
  let id = 0;

  for (let i = 29; i >= 0; i -= 1) {
    const date = addDays(TODAY, -i);
    const seed = (i * 7 + 3) % 10;
    const cacas = seed < 2 ? 0 : (seed < 7 ? 1 : 2);
    const pipis = 3 + (seed % 4);

    // Aujourd'hui, on ne remplit que les heures déjà passées (il est 14:08).
    const passed = (time) => i > 0 || time <= '14:00';

    for (let c = 0; c < cacas; c += 1) {
      const place = PLACES[(i + c) % 4];
      const time = cacaTimes[c % cacaTimes.length];
      if (passed(time)) state.entries.push(entry(`e${id += 1}`, 'caca', date, time, place));
    }
    for (let p = 0; p < pipis; p += 1) {
      const place = PLACES[(i + p * 2) % PLACES.length];
      const time = pipiTimes[p % pipiTimes.length];
      if (passed(time)) state.entries.push(entry(`e${id += 1}`, 'pipi', date, time, place));
    }
  }
  return state;
}
