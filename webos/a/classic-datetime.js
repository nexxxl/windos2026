import { h, clear } from './can.js';
import { t, getLanguage, localeFor } from './i18n.js';
import { WORLD_LAND_PATH } from './world-land.js';

// The browser can read the host clock; browsing the calendar never sets it.
// Labels local to this component are intentionally independent of user content.
const CODES = ['zh-CN', 'zh-TW', 'en', 'es', 'fr', 'de', 'ja', 'ko'];
const LABELS = {
  title: ['日期/时间 属性', '日期／時間 內容', 'Date/Time Properties', 'Propiedades de fecha y hora', 'Propriétés de Date/Heure', 'Eigenschaften von Datum/Uhrzeit', '日付と時刻のプロパティ', '날짜/시간 등록 정보'],
  dateTime: ['日期和时间', '日期與時間', 'Date & Time', 'Fecha y hora', 'Date et heure', 'Datum und Uhrzeit', '日付と時刻', '날짜 및 시간'],
  date: ['日期', '日期', 'Date', 'Fecha', 'Date', 'Datum', '日付', '날짜'],
  time: ['时间', '時間', 'Time', 'Hora', 'Heure', 'Uhrzeit', '時刻', '시간'],
  month: ['月份', '月份', 'Month', 'Mes', 'Mois', 'Monat', '月', '월'],
  year: ['年份', '年份', 'Year', 'Año', 'Année', 'Jahr', '年', '연도'],
  browse: ['可浏览日期；时钟跟随本机。', '可瀏覽日期；時鐘跟隨本機。', 'Browse dates; the clock follows this device.', 'Consulta fechas; el reloj sigue este dispositivo.', 'Consultez les dates ; l’horloge suit cet appareil.', 'Datum ansehen; die Uhr folgt diesem Gerät.', '日付を閲覧できます。時計はこの端末に従います。', '날짜를 살펴볼 수 있으며 시계는 이 기기를 따릅니다.'],
  zoneNote: ['时区由本机系统管理。请在本机的日期与时间设置中修改。', '時區由本機系統管理。請在本機的日期與時間設定中修改。', 'This device manages the time zone. Change it in your system’s date and time settings.', 'Este dispositivo administra la zona horaria. Cámbiala en los ajustes de fecha y hora del sistema.', 'Le fuseau horaire est géré par cet appareil. Modifiez-le dans les réglages de date et heure du système.', 'Die Zeitzone wird vom Gerät verwaltet. Änderungen sind in den Datums- und Uhrzeiteinstellungen des Systems möglich.', 'タイムゾーンはこの端末が管理しています。変更するには端末の日付と時刻の設定を開いてください。', '시간대는 이 기기에서 관리합니다. 기기의 날짜 및 시간 설정에서 변경하세요.'],
  currentZone: ['本机时区', '本機時區', 'Device time zone', 'Zona horaria del dispositivo', 'Fuseau horaire de l’appareil', 'Zeitzone des Geräts', '端末のタイムゾーン', '기기 시간대'],
  apply: ['应用', '套用', 'Apply', 'Aplicar', 'Appliquer', 'Übernehmen', '適用', '적용'],
  live: ['本机实时时间（只读）', '本機即時時間（唯讀）', 'Live device time (read-only)', 'Hora del dispositivo (solo lectura)', 'Heure de l’appareil (lecture seule)', 'Aktuelle Gerätezeit (schreibgeschützt)', '端末の現在時刻（読み取り専用）', '기기의 현재 시간(읽기 전용)'],
};

function label(key) {
  const index = Math.max(0, CODES.indexOf(getLanguage()));
  return LABELS[key][index];
}

export function classicDateTimeTitle() { return label('title'); }

function svgElement(name, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const name of Object.keys(attributes)) element.setAttribute(name, String(attributes[name]));
  return element;
}

function analogClock() {
  const face = svgElement('svg', { class: 'c98-dt-clock', viewBox: '0 0 128 128', 'aria-hidden': 'true' });
  face.append(svgElement('circle', { cx: 64, cy: 64, r: 59, fill: '#fff', stroke: '#808080', 'stroke-width': 2 }));
  face.append(svgElement('circle', { cx: 64, cy: 64, r: 56, fill: 'none', stroke: '#000', 'stroke-width': 1 }));
  for (let tick = 0; tick < 60; tick += 1) {
    const angle = tick * Math.PI / 30;
    const inner = tick % 5 ? 52 : 47;
    face.append(svgElement('line', {
      x1: 64 + Math.sin(angle) * inner, y1: 64 - Math.cos(angle) * inner,
      x2: 64 + Math.sin(angle) * 54, y2: 64 - Math.cos(angle) * 54,
      stroke: '#000', 'stroke-width': tick % 5 ? 1 : 2,
    }));
  }
  const hour = svgElement('line', { x1: 64, y1: 67, x2: 64, y2: 33, stroke: '#000', 'stroke-width': 4 });
  const minute = svgElement('line', { x1: 64, y1: 69, x2: 64, y2: 20, stroke: '#000', 'stroke-width': 3 });
  const second = svgElement('line', { x1: 64, y1: 75, x2: 64, y2: 17, stroke: '#808080', 'stroke-width': 1 });
  face.append(hour, minute, second, svgElement('circle', { cx: 64, cy: 64, r: 3, fill: '#000' }));
  return {
    element: face,
    update(date) {
      hour.setAttribute('transform', 'rotate(' + ((date.getHours() % 12) * 30 + date.getMinutes() / 2) + ' 64 64)');
      minute.setAttribute('transform', 'rotate(' + (date.getMinutes() * 6 + date.getSeconds() / 10) + ' 64 64)');
      second.setAttribute('transform', 'rotate(' + date.getSeconds() * 6 + ' 64 64)');
    },
  };
}

// 时区图：24 条 15° 时区分带 + 陆地轮廓 + 经纬网，本机所在带加深。
// 分带由本机时区偏移算出，和上面的「本机时区」文字保持同一来源。
function worldMap(date) {
  const viewWidth = 360;
  const viewHeight = 180;
  const svg = svgElement('svg', {
    class: 'c98-dt-map', viewBox: '0 0 360 180', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true',
  });
  // 每 15° 一条带，深浅交替，像系统时区图那样能数出格子。
  for (let band = 0; band < 24; band += 1) {
    svg.append(svgElement('rect', {
      x: band * 15, y: 0, width: 15, height: viewHeight, fill: band % 2 ? '#e8f2f2' : '#f6fafa',
    }));
  }
  // 本机所在时区带：偏移取整到整小时，中心经度 = 偏移 × 15°。
  const offset = Math.round(-date.getTimezoneOffset() / 60);
  const bandLeft = viewWidth / 2 + offset * 15 - 7.5;
  svg.append(svgElement('rect', {
    x: bandLeft, y: 0, width: 15, height: viewHeight, fill: '#b6d9e8', class: 'c98-dt-zone-band',
  }));
  // 经纬网：每 30° 一条，画在陆地下面。
  const grid = svgElement('g', { fill: 'none', stroke: '#d8d8d8', 'stroke-width': 1 });
  for (let lon = 0; lon < viewWidth; lon += 30) grid.append(svgElement('line', { x1: lon, y1: 0, x2: lon, y2: viewHeight }));
  for (let lat = 0; lat <= viewHeight; lat += 30) grid.append(svgElement('line', { x1: 0, y1: lat, x2: viewWidth, y2: lat }));
  svg.append(grid);
  svg.append(svgElement('path', {
    d: WORLD_LAND_PATH, fill: '#008080', stroke: '#006060', 'stroke-width': 0.5, 'stroke-linejoin': 'round',
  }));
  return svg;
}

/**
 * Mount only the content of a classic property sheet; the desktop owns its frame.
 * No host-clock write API is called. Call destroy() when its window closes.
 * refresh() re-renders labels after a locale/preferences change.
 */
export function mountClassicDateTime(container, options) {
  const opts = options || {};
  if (!document.querySelector('link[data-nexlos-classic-datetime]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: '/a/classic-datetime.css', 'data-nexlos-classic-datetime': '' }));
  }
  let chosen = new Date();
  chosen = new Date(chosen.getFullYear(), chosen.getMonth(), chosen.getDate());
  let activeTab = 'dateTime';
  let destroyed = false;
  let lastLanguage = getLanguage();
  let lastDay = '';
  let clock = null;
  let timeField = null;
  let statusLabel = null;
  const root = h('section', { class: 'c98-datetime', 'data-i18n-skip': '' });
  container.append(root);

  function currentDate() { return typeof opts.now === 'function' ? opts.now() : new Date(); }
  function dateKey(date) { return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate(); }
  function calendarChange(year, month, day) {
    const last = new Date(year, month + 1, 0).getDate();
    chosen = new Date(Math.max(1601, Math.min(9999, year)), month, Math.min(day, last));
    render();
  }
  function close() { if (typeof opts.onClose === 'function') opts.onClose(); }
  function updateTime() {
    if (destroyed) return;
    const date = currentDate();
    if (clock) clock.update(date);
    if (timeField) {
      const format = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
      if (typeof opts.clock24 === 'boolean') format.hour12 = !opts.clock24;
      const value = new Intl.DateTimeFormat(localeFor(), format).format(date);
      if (timeField.value !== value) timeField.value = value;
    }
    if (statusLabel) statusLabel.textContent = new Intl.DateTimeFormat(localeFor(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
    const dayChanged = lastDay && lastDay !== dateKey(date);
    lastDay = dateKey(date);
    if (dayChanged) render();
  }
  function datePanel() {
    const year = chosen.getFullYear();
    const month = chosen.getMonth();
    const monthSelect = h('select', { class: 'c98-dt-month', 'aria-label': label('month'), onchange: event => calendarChange(year, Number(event.target.value), chosen.getDate()) });
    for (let value = 0; value < 12; value += 1) monthSelect.append(h('option', { value, selected: month === value }, new Intl.DateTimeFormat(localeFor(), { month: 'long' }).format(new Date(2024, value, 1))));
    const yearInput = h('input', {
      class: 'c98-dt-year', type: 'number', min: '1601', max: '9999', step: '1', value: year, 'aria-label': label('year'),
      onchange: event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1601 && value <= 9999) calendarChange(value, month, chosen.getDate()); else event.target.value = year; },
    });
    const calendar = h('div', { class: 'c98-dt-calendar', role: 'grid', 'aria-label': new Intl.DateTimeFormat(localeFor(), { year: 'numeric', month: 'long' }).format(chosen) });
    const firstWeekday = ['es', 'fr', 'de'].indexOf(getLanguage()) >= 0 ? 1 : 0;
    const offset = (new Date(year, month, 1).getDay() - firstWeekday + 7) % 7;
    const week = h('div', { class: 'c98-dt-calendar-row c98-dt-weekdays', role: 'row' });
    for (let day = 0; day < 7; day += 1) week.append(h('span', { role: 'columnheader' }, new Intl.DateTimeFormat(localeFor(), { weekday: 'narrow' }).format(new Date(2024, 0, 7 + (firstWeekday + day) % 7))));
    calendar.append(week);
    const count = new Date(year, month + 1, 0).getDate();
    const now = currentDate();
    const number = new Intl.NumberFormat(localeFor(), { useGrouping: false });
    for (let row = 0; row < 6; row += 1) {
      const rowEl = h('div', { class: 'c98-dt-calendar-row', role: 'row' });
      for (let column = 0; column < 7; column += 1) {
        const day = row * 7 + column - offset + 1;
        if (day < 1 || day > count) { rowEl.append(h('span', { role: 'gridcell', class: 'c98-dt-empty' })); continue; }
        const date = new Date(year, month, day);
        const selected = day === chosen.getDate();
        rowEl.append(h('button', {
          class: 'c98-dt-day' + (selected ? ' selected' : '') + (dateKey(date) === dateKey(now) ? ' today' : ''), type: 'button', role: 'gridcell',
          'aria-label': new Intl.DateTimeFormat(localeFor(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date),
          'aria-selected': String(selected), tabindex: selected ? '0' : '-1',
          onclick: () => { chosen = date; render(); focusDay(); },
          onkeydown: event => {
            const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
            if (Object.prototype.hasOwnProperty.call(offsets, event.key)) {
              event.preventDefault(); chosen = new Date(year, month, day + offsets[event.key]); render(); focusDay();
            } else if (event.key === 'PageUp' || event.key === 'PageDown') {
              event.preventDefault(); calendarChange(year, month + (event.key === 'PageUp' ? -1 : 1), day); focusDay();
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault(); chosen = new Date(year, month, event.key === 'Home' ? 1 : count); render(); focusDay();
            }
          },
        }, number.format(day)));
      }
      calendar.append(rowEl);
    }
    clock = analogClock();
    timeField = h('input', { class: 'c98-dt-time-input', type: 'text', readonly: true, 'aria-label': label('live') });
    return h('div', { class: 'c98-dt-columns' },
      h('fieldset', { class: 'c98-dt-date' }, h('legend', {}, label('date')),
        h('div', { class: 'c98-dt-selectors' }, monthSelect, yearInput), calendar),
      h('fieldset', { class: 'c98-dt-time' }, h('legend', {}, label('time')), clock.element, timeField));
  }
  function focusDay() { const day = root.querySelector('.c98-dt-day.selected'); if (day) day.focus(); }
  function zonePanel() {
    const date = currentDate();
    let zoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try {
      const parts = new Intl.DateTimeFormat(localeFor(), { timeZoneName: 'long' }).formatToParts(date);
      const zone = parts.find(part => part.type === 'timeZoneName');
      if (zone && zone.value !== zoneName) zoneName = zone.value + ' · ' + zoneName;
    } catch (error) { /* Older engines still have the IANA zone identifier. */ }
    return h('div', { class: 'c98-dt-zone' }, worldMap(date),
      h('label', { class: 'c98-dt-zone-label' }, label('currentZone'), h('input', { type: 'text', class: 'c98-dt-zone-input', readonly: true, value: zoneName })),
      h('p', { class: 'c98-dt-zone-note' }, label('zoneNote')));
  }
  function render() {
    if (destroyed) return;
    clock = null; timeField = null;
    clear(root);
    const tabs = h('div', { class: 'c98-dt-tabs', role: 'tablist' });
    for (const key of ['dateTime', '时区']) {
      const active = activeTab === key;
      tabs.append(h('button', {
        class: 'c98-dt-tab' + (active ? ' active' : ''), id: 'c98-dt-tab-' + (key === 'dateTime' ? 'date' : 'zone'), type: 'button', role: 'tab',
        'aria-selected': String(active), tabindex: active ? '0' : '-1',
        onclick: () => { activeTab = key; render(); const button = root.querySelector('.c98-dt-tab.active'); if (button) button.focus(); },
        onkeydown: event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); activeTab = activeTab === 'dateTime' ? '时区' : 'dateTime'; render(); root.querySelector('.c98-dt-tab.active').focus(); } },
      }, key === 'dateTime' ? label('dateTime') : t('时区')));
    }
    const panel = h('div', { class: 'c98-dt-panel', role: 'tabpanel', 'aria-labelledby': 'c98-dt-tab-' + (activeTab === 'dateTime' ? 'date' : 'zone') });
    panel.append(activeTab === 'dateTime' ? datePanel() : zonePanel());
    if (activeTab === 'dateTime') panel.append(h('p', { class: 'c98-dt-note' }, label('browse')));
    statusLabel = h('span', { class: 'c98-dt-status-date' });
    root.append(tabs, panel, h('div', { class: 'c98-dt-status' }, statusLabel),
      h('footer', { class: 'c98-dt-footer' }, h('button', { class: 'c98-dt-button default', type: 'button', onclick: close }, t('确定')), h('button', { class: 'c98-dt-button', type: 'button', onclick: close }, t('取消')), h('button', { class: 'c98-dt-button', type: 'button', disabled: true }, label('apply'))));
    root.setAttribute('aria-label', label('title'));
    if (typeof opts.onTitle === 'function') opts.onTitle(label('title'));
    updateTime();
  }
  function refresh(patch) {
    if (patch && typeof patch.clock24 === 'boolean') opts.clock24 = patch.clock24;
    lastLanguage = getLanguage();
    render();
  }
  const observer = new MutationObserver(() => { if (getLanguage() !== lastLanguage) refresh(); });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-lang'] });
  render();
  const timer = setInterval(updateTime, 1000);
  return {
    root,
    refresh,
    title: classicDateTimeTitle,
    preferredSize() {
      const font = parseFloat(getComputedStyle(root).fontSize) || 12;
      return { width: Math.round(390 + (font - 12) * 18), height: Math.round(320 + (font - 12) * 12) };
    },
    destroy() { if (destroyed) return; destroyed = true; clearInterval(timer); observer.disconnect(); root.remove(); },
  };
}
