import { h } from './can.js';
import { getLanguage, localeFor } from './i18n.js';
import {
  CLASSIC_SOUND_DURATIONS, getClassicSoundPreferences, setClassicSoundPreferences,
  playClassicSound, stopClassicSounds, exportClassicSoundWav,
} from './classic-sound-engine.js';

// These labels are component-owned; filenames and application content are not translated.
const CODES = ['zh-CN', 'zh-TW', 'en', 'es', 'fr', 'de', 'ja', 'ko'];
const EVENTS = ['startup', 'click', 'ding', 'chord', 'chimes', 'tada', 'logoff', 'exclamation', 'recycle'];
const LABELS = {
  title: ['声音 属性', '音效 內容', 'Sound Properties', 'Propiedades de sonido', 'Propriétés du son', 'Eigenschaften von Sounds', 'サウンドのプロパティ', '소리 등록 정보'],
  enabled: ['启用系统声音', '啟用系統音效', 'Enable system sounds', 'Activar sonidos del sistema', 'Activer les sons du système', 'Systemklänge aktivieren', 'システムサウンドを有効にする', '시스템 소리 사용'],
  events: ['系统事件', '系統事件', 'System events', 'Eventos del sistema', 'Événements système', 'Systemereignisse', 'システムイベント', '시스템 이벤트'],
  volume: ['音量', '音量', 'Volume', 'Volumen', 'Volume', 'Lautstärke', '音量', '음량'],
  preview: ['试听', '試聽', 'Preview', 'Escuchar', 'Écouter', 'Anhören', '試聴', '미리 듣기'],
  stop: ['停止', '停止', 'Stop', 'Detener', 'Arrêter', 'Stoppen', '停止', '중지'],
  export: ['导出 WAV', '匯出 WAV', 'Export WAV', 'Exportar WAV', 'Exporter en WAV', 'WAV exportieren', 'WAV を書き出す', 'WAV 내보내기'],
  exportingButton: ['导出中…', '匯出中…', 'Exporting…', 'Exportando…', 'Exportation…', 'Export läuft…', '書き出し中…', '내보내는 중…'],
  close: ['关闭', '關閉', 'Close', 'Cerrar', 'Fermer', 'Schließen', '閉じる', '닫기'],
  startup: ['系统启动', '系統啟動', 'Startup', 'Inicio del sistema', 'Démarrage', 'Systemstart', 'システムの起動', '시스템 시작'],
  click: ['单击', '按一下', 'Click', 'Clic', 'Clic', 'Klick', 'クリック', '클릭'],
  ding: ['提示音', '提示音', 'Notification', 'Notificación', 'Notification', 'Hinweis', '通知', '알림'],
  chord: ['和弦', '和弦', 'Chord', 'Acorde', 'Accord', 'Akkord', 'コード', '화음'],
  chimes: ['风铃', '風鈴', 'Chimes', 'Campanillas', 'Carillon', 'Glockenspiel', 'チャイム', '차임 벨'],
  tada: ['完成', '完成', 'Completion', 'Finalización', 'Fin de tâche', 'Abschluss', '完了', '완료'],
  logoff: ['注销', '登出', 'Logoff', 'Cierre de sesión', 'Fermeture de session', 'Abmeldung', 'ログオフ', '로그오프'],
  exclamation: ['警告', '警告', 'Warning', 'Advertencia', 'Avertissement', 'Warnung', '警告', '경고'],
  recycle: ['清空回收站', '清空資源回收筒', 'Empty Recycle Bin', 'Vaciar la papelera', 'Vider la corbeille', 'Papierkorb leeren', 'ごみ箱を空にする', '휴지통 비우기'],
  ready: ['选择事件后即可试听。', '選取事件後即可試聽。', 'Select an event to preview its sound.', 'Selecciona un evento para escuchar su sonido.', 'Sélectionnez un événement pour l’écouter.', 'Wähle ein Ereignis, um den Klang anzuhören.', 'イベントを選んでサウンドを試聴できます。', '이벤트를 선택하면 소리를 미리 들을 수 있습니다.'],
  muted: ['系统声音已关闭；仍可导出 WAV。', '系統音效已關閉；仍可匯出 WAV。', 'System sounds are off; WAV export is still available.', 'Los sonidos están desactivados; puedes exportar WAV.', 'Les sons sont désactivés ; l’export WAV reste disponible.', 'Systemklänge sind aus; WAV-Export ist weiterhin möglich.', 'システムサウンドは無効です。WAV の書き出しは利用できます。', '시스템 소리가 꺼져 있어도 WAV를 내보낼 수 있습니다.'],
  silent: ['音量为 0；提高音量后可试听。', '音量為 0；提高音量後可試聽。', 'Volume is 0; turn it up to preview.', 'El volumen está en 0; súbelo para escuchar.', 'Le volume est à 0 ; augmentez-le pour écouter.', 'Lautstärke ist 0; erhöhe sie zum Anhören.', '音量は 0 です。試聴するには音量を上げてください。', '음량이 0입니다. 미리 들으려면 음량을 높이세요.'],
  preparing: ['正在准备试听…', '正在準備試聽…', 'Preparing preview…', 'Preparando el sonido…', 'Préparation de l’écoute…', 'Vorschau wird vorbereitet…', '試聴を準備中…', '미리 듣기 준비 중…'],
  playing: ['正在试听：{event}', '正在試聽：{event}', 'Playing: {event}', 'Escuchando: {event}', 'Lecture : {event}', 'Wiedergabe: {event}', '試聴中：{event}', '재생 중: {event}'],
  finished: ['试听完成：{event}', '試聽完成：{event}', 'Preview finished: {event}', 'Escucha finalizada: {event}', 'Écoute terminée : {event}', 'Vorschau beendet: {event}', '試聴完了：{event}', '미리 듣기 완료: {event}'],
  stopped: ['已停止。', '已停止。', 'Stopped.', 'Detenido.', 'Arrêté.', 'Gestoppt.', '停止しました。', '중지했습니다.'],
  unavailable: ['无法播放，请再次点击试听。', '無法播放，請再次點選試聽。', 'Could not play. Click Preview to try again.', 'No se pudo reproducir. Pulsa Escuchar para reintentarlo.', 'Lecture impossible. Cliquez sur Écouter pour réessayer.', 'Wiedergabe nicht möglich. Klicke erneut auf Anhören.', '再生できませんでした。もう一度「試聴」を押してください。', '재생할 수 없습니다. 미리 듣기를 다시 눌러 주세요.'],
  exporting: ['正在生成 WAV：{event}', '正在產生 WAV：{event}', 'Creating WAV: {event}', 'Generando WAV: {event}', 'Création du WAV : {event}', 'WAV wird erstellt: {event}', 'WAV を生成中：{event}', 'WAV 생성 중: {event}'],
  exported: ['已开始下载 WAV：{event}', '已開始下載 WAV：{event}', 'WAV download started: {event}', 'Descarga de WAV iniciada: {event}', 'Téléchargement du WAV démarré : {event}', 'WAV-Download gestartet: {event}', 'WAV のダウンロードを開始しました：{event}', 'WAV 다운로드 시작: {event}'],
  canceling: ['正在取消导出…', '正在取消匯出…', 'Canceling export…', 'Cancelando la exportación…', 'Annulation de l’exportation…', 'Export wird abgebrochen…', '書き出しをキャンセル中…', '내보내기 취소 중…'],
  canceled: ['已取消导出。', '已取消匯出。', 'Export canceled.', 'Exportación cancelada.', 'Exportation annulée.', 'Export abgebrochen.', '書き出しをキャンセルしました。', '내보내기를 취소했습니다.'],
  exportFailed: ['WAV 导出失败，请重试。', 'WAV 匯出失敗，請重試。', 'WAV export failed. Please try again.', 'No se pudo exportar WAV. Inténtalo de nuevo.', 'L’export WAV a échoué. Veuillez réessayer.', 'WAV-Export fehlgeschlagen. Bitte erneut versuchen.', 'WAV の書き出しに失敗しました。もう一度お試しください。', 'WAV를 내보내지 못했습니다. 다시 시도해 주세요.'],
  settingsFailed: ['声音设置未保存，请重试。', '音效設定未儲存，請重試。', 'Sound settings were not saved. Please try again.', 'No se guardaron los ajustes. Inténtalo de nuevo.', 'Les réglages audio n’ont pas été enregistrés. Réessayez.', 'Soundeinstellungen nicht gespeichert. Bitte erneut versuchen.', 'サウンド設定を保存できませんでした。もう一度お試しください。', '소리 설정을 저장하지 못했습니다. 다시 시도해 주세요.'],
};

function label(key) { return LABELS[key][Math.max(0, CODES.indexOf(getLanguage()))]; }
export function classicSoundsTitle() { return label('title'); }
let mountSequence = 0;

export function mountClassicSounds(container, opts = {}) {
  const id = 'c98-sounds-' + (++mountSequence);
  let preferences = getClassicSoundPreferences();
  let selected = 'startup';
  let destroyed = false;
  let pendingPreview = false;
  let playing = false;
  let previewGeneration = 0;
  let previewTimer = 0;
  let exportController = null;
  let status = { key: 'ready' };
  let lastLanguage = getLanguage();
  const optionNodes = new Map();
  const enabledText = h('span');
  const eventText = h('span');
  const volumeText = h('span');
  const enabled = h('input', { class: 'c98-sound-enabled', type: 'checkbox', onchange: () => savePreferences({ enabled: enabled.checked }) });
  const events = h('select', {
    class: 'c98-sound-events', id: id + '-events', size: EVENTS.length,
    onchange: () => {
      if (!EVENTS.includes(events.value)) return;
      selected = events.value;
      cancelPreview();
      status = { key: 'ready' };
      paint();
    },
  });
  for (const name of EVENTS) {
    const option = h('option', { value: name, selected: selected === name });
    optionNodes.set(name, option); events.append(option);
  }
  const volumeValue = h('output', { class: 'c98-sound-volume-value', for: id + '-volume' });
  const volume = h('input', {
    class: 'c98-sound-volume', id: id + '-volume', type: 'range', min: 0, max: 100, step: 1,
    oninput: () => savePreferences({ volume: Number(volume.value) / 100 }),
  });
  const preview = h('button', { class: 'c98-sound-button c98-sound-preview', type: 'button', onclick: previewSound });
  const stop = h('button', { class: 'c98-sound-button', type: 'button', onclick: stopOperation });
  const exportButton = h('button', { class: 'c98-sound-button c98-sound-export', type: 'button', onclick: exportSound });
  const state = h('p', { class: 'c98-sound-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const close = h('button', {
    class: 'c98-sound-button', type: 'button',
    onclick: () => { stopOperation(); if (typeof opts.onClose === 'function') opts.onClose(); },
  });
  const root = h('section', { class: 'c98-sounds', 'data-i18n-skip': '' },
    h('label', { class: 'c98-sound-enable-label' }, enabled, enabledText),
    h('div', { class: 'c98-sound-event-group' }, h('label', { for: id + '-events' }, eventText), events),
    h('div', { class: 'c98-sound-volume-group' }, h('label', { for: id + '-volume' }, volumeText), volumeValue, volume),
    h('div', { class: 'c98-sound-actions' }, preview, stop, exportButton),
    state, h('footer', { class: 'c98-sound-footer' }, close));
  container.append(root);

  function cancelPreview() {
    previewGeneration += 1;
    clearTimeout(previewTimer); previewTimer = 0;
    playing = false;
    stopClassicSounds();
  }

  function savePreferences(patch) {
    if (destroyed || exportController) return;
    try {
      preferences = setClassicSoundPreferences(patch);
      if (!preferences.enabled || preferences.volume === 0) cancelPreview();
      if (['settingsFailed', 'unavailable'].includes(status.key)) status = { key: 'ready' };
    } catch (error) { status = { key: 'settingsFailed' }; }
    paint();
  }

  function paint() {
    if (destroyed) return;
    const exporting = !!exportController;
    const percent = new Intl.NumberFormat(localeFor(), { style: 'percent', maximumFractionDigits: 0 }).format(preferences.volume);
    // Preserve the exact input nodes: replacing a live range loses its pointer capture.
    enabled.checked = preferences.enabled;
    enabled.disabled = exporting;
    events.value = selected;
    events.disabled = exporting;
    volume.value = String(Math.round(preferences.volume * 100));
    volume.disabled = exporting;
    volume.setAttribute('aria-valuetext', percent);
    volumeValue.textContent = percent;
    preview.disabled = exporting || pendingPreview || !preferences.enabled || preferences.volume === 0;
    stop.disabled = !exporting && !pendingPreview && !playing;
    exportButton.disabled = exporting || pendingPreview;
    exportButton.textContent = label(exporting ? 'exportingButton' : 'export');
    let key = status.key;
    if (key === 'ready') key = !preferences.enabled ? 'muted' : preferences.volume === 0 ? 'silent' : 'ready';
    const message = label(key).replace('{event}', status.event ? label(status.event) : '');
    if (state.textContent !== message) state.textContent = message;
    root.setAttribute('aria-busy', String(exporting));
  }

  function refresh() {
    if (destroyed) return;
    preferences = getClassicSoundPreferences();
    lastLanguage = getLanguage();
    enabledText.textContent = label('enabled');
    eventText.textContent = label('events');
    volumeText.textContent = label('volume');
    preview.textContent = label('preview');
    stop.textContent = label('stop');
    close.textContent = label('close');
    for (const [name, option] of optionNodes) option.textContent = label(name);
    root.setAttribute('aria-label', label('title'));
    if (typeof opts.onTitle === 'function') opts.onTitle(label('title'));
    paint();
  }

  async function previewSound() {
    if (destroyed || preview.disabled) return;
    cancelPreview();
    const generation = previewGeneration;
    const name = selected;
    pendingPreview = true;
    status = { key: 'preparing', event: name };
    paint();
    try {
      const started = await playClassicSound(name, { preview: true });
      if (destroyed || generation !== previewGeneration) {
        if (started) stopClassicSounds();
        return;
      }
      playing = !!started;
      status = { key: started ? 'playing' : 'unavailable', event: name };
      if (started) {
        const seconds = Number(CLASSIC_SOUND_DURATIONS[name]);
        previewTimer = setTimeout(() => {
          if (destroyed || generation !== previewGeneration) return;
          playing = false; previewTimer = 0;
          status = { key: 'finished', event: name }; paint();
        }, Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 1000 + 100);
      }
    } catch (error) {
      if (!destroyed && generation === previewGeneration) status = { key: 'unavailable', event: name };
    } finally {
      pendingPreview = false;
      paint();
    }
  }

  function stopOperation() {
    if (destroyed) return;
    cancelPreview();
    if (exportController) {
      exportController.abort();
      status = { key: 'canceling' };
    } else status = { key: 'stopped' };
    paint();
  }

  async function exportSound() {
    if (destroyed || exportButton.disabled) return;
    cancelPreview();
    const controller = new AbortController();
    exportController = controller;
    const name = selected;
    status = { key: 'exporting', event: name };
    paint();
    try {
      const blob = await exportClassicSoundWav(name, { signal: controller.signal, volume: preferences.volume });
      if (destroyed) return;
      if (controller.signal.aborted) { status = { key: 'canceled' }; return; }
      const url = URL.createObjectURL(blob);
      const anchor = h('a', { href: url, download: 'NexlOS-' + name + '.wav', hidden: true });
      try {
        root.append(anchor); anchor.click();
        status = { key: 'exported', event: name };
      } finally {
        anchor.remove();
        // Let the browser acquire the Blob before releasing the URL, even if the panel closes.
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (error) {
      if (!destroyed) status = { key: controller.signal.aborted ? 'canceled' : 'exportFailed', event: name };
    } finally {
      if (exportController === controller) exportController = null;
      paint();
    }
  }

  function onPreferences() {
    if (destroyed) return;
    preferences = getClassicSoundPreferences();
    if (!preferences.enabled || preferences.volume === 0) {
      cancelPreview();
      if (!exportController) status = { key: 'ready' };
    }
    paint();
  }

  const observer = new MutationObserver(() => { if (getLanguage() !== lastLanguage) refresh(); });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-lang'] });
  window.addEventListener('nexlos.classic-sound-preferences', onPreferences);
  refresh();
  return {
    root,
    refresh,
    title: classicSoundsTitle,
    preferredSize() {
      const font = parseFloat(getComputedStyle(root).fontSize) || 12;
      return { width: Math.round(420 + (font - 12) * 12), height: Math.round(470 + (font - 12) * 24) };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPreview();
      if (exportController) exportController.abort();
      observer.disconnect();
      window.removeEventListener('nexlos.classic-sound-preferences', onPreferences);
      root.remove();
    },
  };
}
