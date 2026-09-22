/**
 * Lecture / écriture des données, migration, export et import.
 *
 * Une seule clé localStorage (`compteur-wc`) et jamais d’effacement global du stockage :
 * le domaine est partagé avec d'autres apps.
 */

import { SCHEMA_VERSION, DEFAULT_PLACES, migrate, validateImport } from './logic.js';

export const STORAGE_KEY = 'compteur-wc';

export class StorageError extends Error {}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    settings: { theme: 'auto', range: 30, chartType: 'caca' },
    places: DEFAULT_PLACES.map((p) => ({ ...p })),
    entries: [],
  };
}

export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Ne lève jamais : en cas de données illisibles on repart d'un état par défaut. */
export function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return defaultState();
  }
  if (!raw) return defaultState();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultState();
  }

  const checked = validateImport(parsed);
  if (!checked.ok) return defaultState();

  const state = migrate(checked.data);
  if (!Array.isArray(state.places) || state.places.length === 0) {
    state.places = DEFAULT_PLACES.map((p) => ({ ...p }));
  }
  return state;
}

/** Sauvegarde immédiate ; lève une StorageError lisible si le stockage refuse. */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    const full = error && (error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error.code === 22);
    throw new StorageError(full
      ? 'Stockage plein : impossible d’enregistrer. Exporte puis allège tes données.'
      : 'Stockage indisponible : rien n’a été enregistré (navigation privée ?).');
  }
}

export function exportPayload(state) {
  return JSON.stringify({
    version: state.version,
    settings: state.settings,
    places: state.places,
    entries: state.entries,
  }, null, 2);
}

export function exportFileName(todayKey) {
  return `compteur-wc-${todayKey}.json`;
}

/** @returns {{ok: boolean, error?: string, data?: object, summary?: object}} */
export function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas un JSON valide.' };
  }
  return validateImport(parsed);
}
