/**
 * Compteur WC — interface, DOM et navigation.
 * La logique pure est dans logic.js, le stockage dans storage.js.
 */

import * as L from './logic.js';
import {
  loadState, saveState, newId, exportPayload, exportFileName, parseImport,
} from './storage.js';

const APP_VERSION = self.APP_VERSION || '0.0.0';

const app = document.getElementById('app');
const fab = document.getElementById('fab');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toast-root');
const updateBanner = document.getElementById('update-banner');

let state = loadState();
let sheet = null;          // feuille ouverte (ajout / modification / dialogue)
let sheetDepth = 0;        // entrées d'historique ajoutées par les feuilles
let internalNav = 0;       // navigations déclenchées par l'app
let toastTimer = null;
let undoAction = null;
let storageError = null;
let lastRouteKey = null;
let lastRenderedDay = null;

/* ------------------------------------------------------------- utilitaires */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
const typeIcon = (type) => icon(type === 'caca' ? 'pi-caca' : 'pi-pipi');
const todayKey = () => L.dateKey(new Date());

function vibrate() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  } catch { /* certains navigateurs refusent : sans conséquence */ }
}

function persist() {
  try {
    saveState(state);
    storageError = null;
  } catch (error) {
    storageError = error.message;
    toast(error.message);
  }
}

/* ------------------------------------------------------------------ thème */

const darkQuery = typeof matchMedia === 'function'
  ? matchMedia('(prefers-color-scheme: dark)')
  : { matches: false, addEventListener() {} };

function isDark() {
  const theme = state.settings.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return darkQuery.matches;
}

function applyTheme() {
  const theme = state.settings.theme;
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark() ? '#000000' : '#ffffff');
}

/* --------------------------------------------------------------- routeur */

function parseRoute() {
  const hash = location.hash || '#/';
  const match = hash.match(/^#\/jour\/(\d{4}-\d{2}-\d{2})$/);
  if (match && L.isValidDateKey(match[1])) return { name: 'day', date: match[1] };
  if (hash === '#/parametres') return { name: 'settings' };
  return { name: 'home' };
}

function go(hash) {
  if ((location.hash || '#/') === hash) return;
  internalNav += 1;
  location.hash = hash;
}

function goBack() {
  if (internalNav > 0) {
    internalNav -= 1;
    history.back();
  } else {
    location.hash = '#/';
  }
}

/* ------------------------------------------------------------ composants */

function storageErrorHTML() {
  if (!storageError) return '';
  return `<p class="storage-error">${esc(storageError)}</p>`;
}

function placeNameFor(entry) {
  const place = state.places.find((p) => p.id === entry.placeId);
  return place ? place.name : (entry.placeName || 'Lieu supprimé');
}

function countersHTML(counts) {
  return `<div class="counters">
    <div class="counter">
      <span class="counter-value num" data-count="caca">${counts.caca}</span>
      <span class="counter-label">${typeIcon('caca')}Cacas</span>
    </div>
    <div class="counter">
      <span class="counter-value num" data-count="pipi">${counts.pipi}</span>
      <span class="counter-label">${typeIcon('pipi')}Pipis</span>
    </div>
  </div>`;
}

function entriesHTML(key, emptyMessage) {
  const list = L.entriesForDate(state.entries, key);
  if (!list.length) return `<p class="empty">${esc(emptyMessage)}</p>`;
  return `<ul class="entries">${list.map((entry) => `<li>
    <button type="button" class="entry" data-action="edit-entry" data-id="${esc(entry.id)}">
      <span class="entry-time num">${esc(entry.time)}</span>
      <span class="entry-type">${typeIcon(entry.type)}${entry.type === 'caca' ? 'Caca' : 'Pipi'}</span>
      <span class="entry-place">${esc(placeNameFor(entry))}</span>
    </button>
  </li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------- graphique */

function chartSVG(series, scale, average, type, days) {
  const W = 360;
  const H = 176;
  const padL = 26;
  const padR = 6;
  const padT = 10;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;
  const yFor = (value) => baseY - (value / scale.max) * plotH;
  const slot = plotW / series.length;
  const barW = Math.max(2, Math.min(26, slot * 0.66));

  const grid = scale.ticks.filter((t) => t > 0).map((tick) => {
    const y = yFor(tick);
    return `<line class="chart-grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`
      + `<text class="chart-tick" x="${padL - 6}" y="${(y + 3.2).toFixed(1)}" text-anchor="end">${tick}</text>`;
  }).join('');

  const bars = series.map((point, index) => {
    const x = padL + index * slot + (slot - barW) / 2;
    const isToday = index === series.length - 1;
    if (point.count <= 0) return '';
    const h = Math.max(2, (point.count / scale.max) * plotH);
    return `<rect class="chart-bar${isToday ? ' chart-bar--today' : ''}" x="${x.toFixed(2)}" y="${(baseY - h).toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="${Math.min(2, barW / 2).toFixed(2)}"/>`;
  }).join('');

  const hits = series.map((point, index) => {
    const x = padL + index * slot;
    return `<rect class="chart-hit" x="${x.toFixed(2)}" y="${padT}" width="${slot.toFixed(2)}" height="${plotH}" data-action="open-day" data-date="${point.date}"/>`;
  }).join('');

  const labelIndexes = [...new Set([
    0,
    Math.round((series.length - 1) / 3),
    Math.round(((series.length - 1) * 2) / 3),
    series.length - 1,
  ])].filter((i) => i >= 0 && i < series.length);

  const labels = labelIndexes.map((index) => {
    const center = padL + index * slot + slot / 2;
    let x = center;
    let anchor = 'middle';
    if (index === 0) { x = padL; anchor = 'start'; }
    if (index === series.length - 1) { x = W - padR; anchor = 'end'; }
    return `<text class="chart-tick" x="${x.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(L.formatDateShort(series[index].date))}</text>`;
  }).join('');

  const avgY = yFor(average);
  const avgLine = `<line class="chart-avg" x1="${padL}" y1="${avgY.toFixed(1)}" x2="${W - padR}" y2="${avgY.toFixed(1)}"/>`;

  const label = `${type === 'caca' ? 'Cacas' : 'Pipis'} par jour sur ${days} jours`;

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${grid}
    <line class="chart-base-line" x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}"/>
    ${bars}
    ${avgLine}
    ${labels}
    ${hits}
  </svg>`;
}

function statsHTML(stats, days) {
  const none = '—';
  const passages = (n) => `${n} ${n > 1 ? 'passages' : 'passage'}`;
  return `<dl class="stats">
    <div class="stat stat--wide">
      <dt class="stat-label">Moyenne par jour · ${days} j</dt>
      <dd class="avg-pair">
        <span class="avg-item">${typeIcon('caca')}<span class="avg-value">${L.formatNumberFr(stats.avgCaca)}</span><span class="avg-unit">caca / jour</span></span>
        <span class="avg-item">${typeIcon('pipi')}<span class="avg-value">${L.formatNumberFr(stats.avgPipi)}</span><span class="avg-unit">pipi / jour</span></span>
      </dd>
    </div>
    <div class="stat">
      <dt class="stat-label">Record (1 jour)</dt>
      <dd class="stat-value" data-stat="record">${stats.record ? stats.record.count : none}</dd>
      <dd class="stat-sub">${stats.record ? esc(L.formatDateMedium(stats.record.date)) : ''}</dd>
    </div>
    <div class="stat">
      <dt class="stat-label">Lieu le plus fréquent</dt>
      <dd class="stat-value" data-stat="place">${stats.topPlace ? esc(stats.topPlace.name) : none}</dd>
      <dd class="stat-sub">${stats.topPlace ? passages(stats.topPlace.count) : ''}</dd>
    </div>
    <div class="stat stat--wide">
      <dt class="stat-label">Heure la plus fréquente</dt>
      <dd class="stat-value" data-stat="hour">${stats.topHour ? esc(L.formatHourRange(stats.topHour.hour)) : none}</dd>
      <dd class="stat-sub">${stats.topHour ? passages(stats.topHour.count) : ''}</dd>
    </div>
  </dl>`;
}

function chartHTML(key) {
  if (!state.entries.length) return '<p class="empty">Pas encore de données</p>';

  const days = state.settings.range;
  const type = state.settings.chartType;
  const series = L.buildSeries(state.entries, key, days, type);
  const stats = L.computeStats(state.entries, key, days, state.places);
  const average = type === 'caca' ? stats.avgCaca : stats.avgPipi;
  const scale = L.niceScale(Math.max(0, ...series.map((point) => point.count)));

  const rangeButtons = L.RANGES.map((value) => `<button type="button" class="seg-btn" data-action="set-range" data-value="${value}" aria-pressed="${value === days}">${value} j</button>`).join('');
  const typeButtons = L.TYPES.map((value) => `<button type="button" class="seg-btn" data-action="set-chart-type" data-value="${value}" aria-pressed="${value === type}">${value === 'caca' ? 'Cacas' : 'Pipis'}</button>`).join('');

  return `<div class="chart-controls">
      <div class="segmented" role="group" aria-label="Durée">${rangeButtons}</div>
      <div class="segmented" role="group" aria-label="Type">${typeButtons}</div>
    </div>
    ${chartSVG(series, scale, average, type, days)}
    <p class="chart-legend"><span class="legend-dash"></span><span>moyenne ${L.formatNumberFr(average)} / jour</span></p>
    ${statsHTML(stats, days)}`;
}

/* ----------------------------------------------------------------- écrans */

function homeHTML() {
  const key = todayKey();
  const counts = L.countsForDate(state.entries, key);
  const dark = isDark();
  return `<header class="topbar">
      <h1>Compteur WC</h1>
      <div class="topbar-actions">
        <button type="button" class="icon-btn" data-action="toggle-theme" aria-label="${dark ? 'Passer au thème clair' : 'Passer au thème sombre'}">${icon(dark ? 'ic-sun' : 'ic-moon')}</button>
        <button type="button" class="icon-btn" data-action="open-settings" aria-label="Paramètres">${icon('ic-gear')}</button>
      </div>
    </header>
    ${storageErrorHTML()}
    <section class="card">
      <div class="day-head"><p class="date">${esc(L.formatDateLong(key))}</p></div>
      ${countersHTML(counts)}
    </section>
    <section class="card">
      <h2 class="section-title">Passages du jour</h2>
      ${entriesHTML(key, 'Rien pour l’instant aujourd’hui.')}
    </section>
    <section class="card">${chartHTML(key)}</section>`;
}

function dayHTML(key) {
  const counts = L.countsForDate(state.entries, key);
  const isToday = key === todayKey();
  return `<header class="topbar topbar--day">
      <button type="button" class="icon-btn" data-action="back" aria-label="Retour">${icon('ic-back')}</button>
      <h1>${esc(L.formatDateLong(key))}</h1>
      <div class="topbar-actions">
        <button type="button" class="icon-btn" data-action="prev-day" aria-label="Jour précédent">${icon('ic-prev')}</button>
        <button type="button" class="icon-btn" data-action="next-day" aria-label="Jour suivant"${isToday ? ' disabled' : ''}>${icon('ic-next')}</button>
      </div>
    </header>
    ${storageErrorHTML()}
    <section class="card">${countersHTML(counts)}</section>
    <section class="card">
      <h2 class="section-title">Passages</h2>
      ${entriesHTML(key, 'Aucun passage ce jour-là.')}
    </section>`;
}

function settingsHTML() {
  const theme = state.settings.theme;
  const themeButtons = [
    ['auto', 'Automatique'],
    ['light', 'Clair'],
    ['dark', 'Sombre'],
  ].map(([value, label]) => `<button type="button" class="seg-btn" data-action="set-theme" data-value="${value}" aria-pressed="${value === theme}">${label}</button>`).join('');

  const canRemove = L.canRemovePlace(state.places);
  const places = state.places.map((place, index) => `<li class="setting-row">
      <span class="place-name">${esc(place.name)}</span>
      <span class="place-actions">
        <button type="button" class="icon-btn" data-action="move-place" data-id="${esc(place.id)}" data-delta="-1" aria-label="Monter ${esc(place.name)}"${index === 0 ? ' disabled' : ''}>${icon('ic-up')}</button>
        <button type="button" class="icon-btn" data-action="move-place" data-id="${esc(place.id)}" data-delta="1" aria-label="Descendre ${esc(place.name)}"${index === state.places.length - 1 ? ' disabled' : ''}>${icon('ic-down')}</button>
        <button type="button" class="icon-btn" data-action="rename-place" data-id="${esc(place.id)}" aria-label="Renommer ${esc(place.name)}">${icon('ic-pencil')}</button>
        <button type="button" class="icon-btn" data-action="delete-place" data-id="${esc(place.id)}" aria-label="Supprimer ${esc(place.name)}"${canRemove ? '' : ' disabled'}>${icon('ic-trash')}</button>
      </span>
    </li>`).join('');

  return `<header class="topbar">
      <button type="button" class="icon-btn" data-action="back" aria-label="Retour">${icon('ic-back')}</button>
      <h1>Paramètres</h1>
    </header>
    ${storageErrorHTML()}
    <section class="card">
      <h2 class="section-title">Thème</h2>
      <div class="segmented" role="group" aria-label="Thème">${themeButtons}</div>
    </section>
    <section class="card">
      <h2 class="section-title">Lieux</h2>
      <ul class="places-list">${places}</ul>
      <button type="button" class="link-btn" data-action="add-place">Ajouter un lieu</button>
    </section>
    <section class="card">
      <h2 class="section-title">Sauvegarde</h2>
      <button type="button" class="wide-btn" data-action="export">Exporter mes données</button>
      <button type="button" class="wide-btn" data-action="import">Importer une sauvegarde</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </section>
    <p class="version">Version ${esc(APP_VERSION)}</p>`;
}

function render() {
  const route = parseRoute();
  const key = todayKey();

  if (route.name === 'day' && route.date > key) {
    go('#/');
    return;
  }

  const routeKey = route.name === 'day' ? `day:${route.date}` : route.name;
  app.className = `screen${route.name === 'settings' ? ' screen--no-fab' : ''}`;
  if (route.name === 'home') app.innerHTML = homeHTML();
  else if (route.name === 'day') app.innerHTML = dayHTML(route.date);
  else app.innerHTML = settingsHTML();

  fab.hidden = route.name === 'settings';
  if (routeKey !== lastRouteKey) {
    window.scrollTo(0, 0);
    lastRouteKey = routeKey;
  }
  lastRenderedDay = key;
}

/* ---------------------------------------------------------------- feuille */

function pushSheetHistory() {
  sheetDepth += 1;
  history.pushState({ sheet: sheetDepth }, '');
}

function destroySheet() {
  sheet = null;
  sheetRoot.innerHTML = '';
}

// La feuille se ferme tout de suite ; l'entrée d'historique correspondante est retirée
// derrière (le popstate qui en résulte est alors ignoré).
let pendingPop = 0;

function closeSheet() {
  if (!sheet) return;
  destroySheet();
  if (sheetDepth > 0) {
    sheetDepth -= 1;
    pendingPop += 1;
    history.back();
  }
}

function sheetShell(title, body, label) {
  return `<div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || title)}">
      <div class="sheet-inner">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">${icon('ic-close')}</button>
        </div>
        ${body}
      </div>
    </div>`;
}

function entrySheetHTML() {
  const editing = sheet.mode === 'edit';
  const types = editing
    ? [['caca', 'Caca'], ['pipi', 'Pipi']]
    : [['caca', 'Caca'], ['pipi', 'Pipi'], ['both', 'Les deux']];

  const typeButtons = types.map(([value, label]) => {
    const icons = value === 'both'
      ? `<span class="type-icons">${typeIcon('caca')}${typeIcon('pipi')}</span>`
      : typeIcon(value);
    return `<button type="button" class="type-btn" data-action="set-type" data-value="${value}" aria-pressed="${sheet.type === value}">${icons}<span>${label}</span></button>`;
  }).join('');

  const dayPicker = sheet.fixedDate
    ? `<p class="day-fixed">${esc(L.formatDateLong(sheet.date))}</p>`
    : `<div class="day-switch"><div class="segmented" role="group" aria-label="Jour">
        <button type="button" class="seg-btn" data-action="set-day" data-value="today" aria-pressed="${sheet.dayChoice === 'today'}">Aujourd’hui</button>
        <button type="button" class="seg-btn" data-action="set-day" data-value="yesterday" aria-pressed="${sheet.dayChoice === 'yesterday'}">Hier</button>
      </div></div>`;

  const minutes = L.timeToMinutes(sheet.time);
  const placesDisabled = !editing && !sheet.type;
  const places = state.places.map((place) => `<button type="button" class="place-btn" data-action="pick-place" data-id="${esc(place.id)}" aria-pressed="${sheet.placeId === place.id}"${placesDisabled ? ' disabled' : ''}>${esc(place.name)}</button>`).join('');

  const actions = editing
    ? `<div class="sheet-actions">
        <button type="button" class="btn" data-action="delete-entry">Supprimer</button>
        <button type="button" class="btn btn--primary" data-action="save-entry">Enregistrer</button>
      </div>`
    : '';

  const body = `<div class="sheet-group">
      <p class="sheet-label">Type</p>
      <div class="type-row${editing ? ' type-row--two' : ''}">${typeButtons}</div>
    </div>
    <div class="sheet-group">
      <p class="sheet-label">Heure</p>
      ${dayPicker}
      <div class="time-row">
        <button type="button" class="time-btn" data-action="shift-time" data-value="-15" aria-label="15 minutes plus tôt"${minutes <= L.MIN_TIME_MINUTES ? ' disabled' : ''}>−15</button>
        <span class="time-value num" data-time>${esc(sheet.time)}</span>
        <button type="button" class="time-btn" data-action="shift-time" data-value="15" aria-label="15 minutes plus tard"${minutes >= L.MAX_TIME_MINUTES ? ' disabled' : ''}>+15</button>
      </div>
    </div>
    <div class="sheet-group">
      <p class="sheet-label">Lieu</p>
      <div class="places-grid">${places}</div>
    </div>
    ${actions}`;

  return sheetShell(editing ? 'Modifier le passage' : 'Ajouter un passage', body);
}

function dialogSheetHTML() {
  const field = sheet.field !== undefined
    ? `<input class="field" id="dialog-field" type="text" value="${esc(sheet.field)}" maxlength="${L.PLACE_NAME_MAX}" enterkeyhint="done" autocomplete="off" aria-label="${esc(sheet.fieldLabel || sheet.title)}">
       <p class="field-error" role="alert">${esc(sheet.error || '')}</p>`
    : '';
  const text = sheet.text ? `<p class="dialog-text">${esc(sheet.text)}</p>` : '';
  const cancel = sheet.cancelLabel === null
    ? ''
    : `<button type="button" class="btn" data-action="close-sheet">${esc(sheet.cancelLabel || 'Annuler')}</button>`;
  const body = `${text}${field}
    <div class="sheet-actions">
      ${cancel}
      <button type="button" class="btn btn--primary" data-action="dialog-confirm">${esc(sheet.confirmLabel)}</button>
    </div>`;
  return sheetShell(sheet.title, body);
}

function renderSheet() {
  if (!sheet) {
    sheetRoot.innerHTML = '';
    return;
  }
  sheetRoot.innerHTML = sheet.kind === 'entry' ? entrySheetHTML() : dialogSheetHTML();
  if (sheet.kind === 'dialog' && sheet.field !== undefined) {
    const input = document.getElementById('dialog-field');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmDialog();
        }
      });
    }
  }
}

function openEntrySheet(options) {
  const key = todayKey();
  sheet = {
    kind: 'entry',
    mode: options.mode,
    type: options.type || null,
    date: options.date,
    fixedDate: !!options.fixedDate,
    dayChoice: 'today',
    time: options.time || L.defaultTimeForDate(new Date()),
    placeId: options.placeId || null,
    entryId: options.entryId || null,
  };
  if (!options.fixedDate && options.date !== key) sheet.dayChoice = 'yesterday';
  pushSheetHistory();
  renderSheet();
}

function openDialog(options) {
  sheet = { kind: 'dialog', ...options };
  pushSheetHistory();
  renderSheet();
}

/* ------------------------------------------------------------------ toast */

function toast(text, options = {}) {
  clearTimeout(toastTimer);
  undoAction = options.undo || null;
  toastRoot.innerHTML = `<div class="toast">
      <span class="toast-text">${esc(text)}</span>
      ${undoAction ? '<button type="button" class="toast-btn" data-action="undo">Annuler</button>' : ''}
    </div>`;
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastRoot.innerHTML = '';
  undoAction = null;
}

/* ------------------------------------------------------------- actions */

function addEntries(typeValue, place) {
  const types = typeValue === 'both' ? ['caca', 'pipi'] : [typeValue];
  const created = types.map((type) => ({
    id: newId(),
    type,
    date: sheet.date,
    time: sheet.time,
    placeId: place.id,
    placeName: place.name,
    createdAt: new Date().toISOString(),
  }));
  const ids = created.map((entry) => entry.id);
  const { time } = sheet;

  state.entries.push(...created);
  persist();
  closeSheet();
  render();
  vibrate();

  const label = typeValue === 'both'
    ? 'Caca et pipi ajoutés'
    : (typeValue === 'caca' ? 'Caca ajouté' : 'Pipi ajouté');
  toast(`${label} · ${time} · ${place.name}`, {
    undo: () => {
      state.entries = state.entries.filter((entry) => !ids.includes(entry.id));
      persist();
      render();
    },
  });
}

function saveEntryEdit() {
  const entry = state.entries.find((item) => item.id === sheet.entryId);
  if (!entry) {
    closeSheet();
    return;
  }
  const place = state.places.find((p) => p.id === sheet.placeId);
  entry.type = sheet.type === 'both' ? entry.type : sheet.type;
  entry.date = sheet.date;
  entry.time = sheet.time;
  if (place) {
    entry.placeId = place.id;
    entry.placeName = place.name;
  }
  persist();
  closeSheet();
  render();
}

function deleteEntry() {
  const index = state.entries.findIndex((item) => item.id === sheet.entryId);
  if (index < 0) {
    closeSheet();
    return;
  }
  const [removed] = state.entries.splice(index, 1);
  persist();
  closeSheet();
  render();
  toast('Supprimé', {
    undo: () => {
      state.entries.splice(Math.min(index, state.entries.length), 0, removed);
      persist();
      render();
    },
  });
}

function confirmDialog() {
  if (!sheet || sheet.kind !== 'dialog') return;
  const input = document.getElementById('dialog-field');
  const value = input ? input.value : undefined;
  const result = sheet.onConfirm(value);
  if (result && result.error) {
    sheet.field = value;
    sheet.error = result.error;
    renderSheet();
    return;
  }
  closeSheet();
}

function addPlaceDialog() {
  openDialog({
    title: 'Ajouter un lieu',
    field: '',
    fieldLabel: 'Nom du lieu',
    confirmLabel: 'Ajouter',
    onConfirm: (value) => {
      const check = L.validatePlaceName(value, state.places, null);
      if (!check.ok) return { error: check.error };
      const id = L.makePlaceId(check.name, state.places.map((p) => p.id));
      state.places.push({ id, name: check.name });
      persist();
      render();
      return null;
    },
  });
}

function renamePlaceDialog(id) {
  const place = state.places.find((p) => p.id === id);
  if (!place) return;
  openDialog({
    title: 'Renommer le lieu',
    field: place.name,
    fieldLabel: 'Nom du lieu',
    confirmLabel: 'Enregistrer',
    onConfirm: (value) => {
      const check = L.validatePlaceName(value, state.places, id);
      if (!check.ok) return { error: check.error };
      place.name = check.name;
      // Les passages gardent une copie du nom : on la met à jour aussi.
      for (const entry of state.entries) {
        if (entry.placeId === id) entry.placeName = check.name;
      }
      persist();
      render();
      return null;
    },
  });
}

function deletePlaceDialog(id) {
  const place = state.places.find((p) => p.id === id);
  if (!place || !L.canRemovePlace(state.places)) return;
  openDialog({
    title: `Supprimer ${place.name} ?`,
    text: 'Les passages déjà enregistrés sont conservés et gardent ce nom.',
    confirmLabel: 'Supprimer',
    onConfirm: () => {
      state.places = state.places.filter((p) => p.id !== id);
      persist();
      render();
      return null;
    },
  });
}

async function exportData() {
  const text = exportPayload(state);
  const name = exportFileName(todayKey());
  try {
    if (typeof File === 'function' && navigator.canShare && navigator.share) {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Compteur WC' });
        return;
      }
    }
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    // sinon : on retombe sur le téléchargement classique
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function handleImportFile(file) {
  if (!file) return;
  let text = '';
  try {
    text = await file.text();
  } catch {
    toast('Fichier illisible.');
    return;
  }
  const result = parseImport(text);
  if (!result.ok) {
    openDialog({
      title: 'Import impossible',
      text: `${result.error} Tes données n’ont pas été modifiées.`,
      confirmLabel: 'D’accord',
      cancelLabel: null,
      onConfirm: () => null,
    });
    return;
  }
  const { entries, places } = result.summary;
  openDialog({
    title: 'Remplacer les données ?',
    text: `Cette sauvegarde contient ${entries} ${entries > 1 ? 'passages' : 'passage'} et ${places} ${places > 1 ? 'lieux' : 'lieu'}. Tes données actuelles seront remplacées.`,
    confirmLabel: 'Remplacer',
    onConfirm: () => {
      state = result.data;
      persist();
      applyTheme();
      render();
      toast('Sauvegarde importée');
      return null;
    },
  });
}

/* ------------------------------------------------------------- événements */

function onAction(action, el) {
  switch (action) {
    case 'toggle-theme':
      state.settings.theme = isDark() ? 'light' : 'dark';
      persist();
      applyTheme();
      render();
      break;

    case 'open-settings':
      go('#/parametres');
      break;

    case 'back':
      goBack();
      break;

    case 'prev-day':
    case 'next-day': {
      const route = parseRoute();
      if (route.name !== 'day') break;
      const next = L.addDays(route.date, action === 'prev-day' ? -1 : 1);
      if (action === 'next-day' && next > todayKey()) break;
      go(`#/jour/${next}`);
      break;
    }

    case 'open-day':
      go(`#/jour/${el.dataset.date}`);
      break;

    case 'set-range':
      state.settings.range = Number(el.dataset.value);
      persist();
      render();
      break;

    case 'set-chart-type':
      state.settings.chartType = el.dataset.value;
      persist();
      render();
      break;

    case 'set-theme':
      state.settings.theme = el.dataset.value;
      persist();
      applyTheme();
      render();
      break;

    case 'add-place':
      addPlaceDialog();
      break;

    case 'rename-place':
      renamePlaceDialog(el.dataset.id);
      break;

    case 'delete-place':
      deletePlaceDialog(el.dataset.id);
      break;

    case 'move-place':
      state.places = L.movePlace(state.places, el.dataset.id, Number(el.dataset.delta));
      persist();
      render();
      break;

    case 'export':
      exportData();
      break;

    case 'import': {
      const input = document.getElementById('import-file');
      if (input) input.click();
      break;
    }

    case 'open-add-sheet': {
      const route = parseRoute();
      if (route.name === 'day') openEntrySheet({ mode: 'add', date: route.date, fixedDate: true });
      else openEntrySheet({ mode: 'add', date: todayKey() });
      break;
    }

    case 'edit-entry': {
      const entry = state.entries.find((item) => item.id === el.dataset.id);
      if (!entry) break;
      openEntrySheet({
        mode: 'edit',
        type: entry.type,
        date: entry.date,
        fixedDate: true,
        time: entry.time,
        placeId: entry.placeId,
        entryId: entry.id,
      });
      break;
    }

    case 'close-sheet':
      closeSheet();
      break;

    case 'set-type':
      if (!sheet) break;
      sheet.type = el.dataset.value;
      renderSheet();
      break;

    case 'set-day': {
      if (!sheet) break;
      sheet.dayChoice = el.dataset.value;
      sheet.date = el.dataset.value === 'yesterday' ? L.addDays(todayKey(), -1) : todayKey();
      renderSheet();
      break;
    }

    case 'shift-time':
      if (!sheet) break;
      sheet.time = L.shiftTime(sheet.time, Number(el.dataset.value));
      renderSheet();
      break;

    case 'pick-place': {
      if (!sheet) break;
      const place = state.places.find((p) => p.id === el.dataset.id);
      if (!place) break;
      if (sheet.mode === 'add') {
        if (!sheet.type) break;
        addEntries(sheet.type, place);
      } else {
        sheet.placeId = place.id;
        renderSheet();
      }
      break;
    }

    case 'save-entry':
      saveEntryEdit();
      break;

    case 'delete-entry':
      deleteEntry();
      break;

    case 'dialog-confirm':
      confirmDialog();
      break;

    case 'undo': {
      const run = undoAction;
      hideToast();
      if (run) run();
      break;
    }

    default:
      break;
  }
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  event.preventDefault();
  onAction(el.dataset.action, el);
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'import-file') {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    handleImportFile(file);
  }
});

fab.dataset.action = 'open-add-sheet';

window.addEventListener('hashchange', () => {
  if (sheet) closeSheet();
  render();
});

window.addEventListener('popstate', () => {
  if (pendingPop > 0) {
    pendingPop -= 1;
    return;
  }
  // Bouton retour d'Android : il ferme d'abord la feuille ouverte.
  if (sheet) {
    sheetDepth = Math.max(0, sheetDepth - 1);
    destroySheet();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sheet) closeSheet();
});

document.addEventListener('visibilitychange', () => {
  // Si l'app est restée ouverte après minuit, « aujourd'hui » doit changer.
  if (document.visibilityState === 'visible' && lastRenderedDay !== todayKey()) render();
});

darkQuery.addEventListener('change', () => {
  if (state.settings.theme === 'auto') {
    applyTheme();
    render();
  }
});

/* ------------------------------------------------------- service worker */

let reloadOnControllerChange = false;

function showUpdateBanner(worker) {
  updateBanner.hidden = false;
  const button = document.getElementById('update-reload');
  button.onclick = () => {
    reloadOnControllerChange = true;
    updateBanner.hidden = true;
    if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  };
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControllerChange) location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(installing);
          }
        });
      });
    } catch {
      // hors ligne ou service worker refusé : l'app fonctionne quand même
    }
  });
}

/* ----------------------------------------------------------------- départ */

async function start() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch { /* sans conséquence */ }
}

applyTheme();
render();
start();
registerServiceWorker();
