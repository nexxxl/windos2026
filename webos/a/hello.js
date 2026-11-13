import { h, api } from './can.js';
import { availableLanguages, setLanguage } from './i18n.js';

// 首次进入系统的「hello」引导：黑底、大字招呼语轮播、原生语言名选择。
// 只做三件事：把界面语言定下来、写回内核设置、记下已引导标记。
// 选中的语言在桌面挂载之前写入，因此首屏、办公与工具页都会用同一种语言启动。

const SEEN_KEY = 'nexlos.hello.v1';
const PROMPT_KEY = 'nexlos.os.langPromptSeen';
const LANG_KEY = 'nexlos.os.lang';

// 招呼语用各自语言的写法，读的是系统字体，不额外下载字形。
const HELLO_WORDS = {
  'zh-CN': '你好', 'zh-TW': '你好', en: 'hello', es: 'hola', fr: 'bonjour',
  de: 'hallo', ja: 'こんにちは', ko: '안녕하세요', ar: 'مرحباً', cs: 'ahoj',
  it: 'ciao', 'pt-BR': 'olá', ru: 'привет', tr: 'merhaba', vi: 'xin chào',
};

// 引导页自己的三行文案；语言包没装的语言回退英文。
const COPY = {
  'zh-CN': { choose: '选择你的语言', go: '继续', hint: '之后可以在「设置 → 时间和语言」里更改。' },
  'zh-TW': { choose: '選擇你的語言', go: '繼續', hint: '之後可以在「設定 → 時間與語言」裡更改。' },
  en: { choose: 'Choose your language', go: 'Continue', hint: 'You can change this later in Settings.' },
  es: { choose: 'Elige tu idioma', go: 'Continuar', hint: 'Puedes cambiarlo más tarde en Ajustes.' },
  fr: { choose: 'Choisissez votre langue', go: 'Continuer', hint: 'Vous pourrez la changer plus tard dans Réglages.' },
  de: { choose: 'Wähle deine Sprache', go: 'Weiter', hint: 'Du kannst sie später in den Einstellungen ändern.' },
  ja: { choose: '言語を選択', go: '続ける', hint: 'あとで「設定 → 時刻と言語」から変更できます。' },
  ko: { choose: '언어 선택', go: '계속', hint: '나중에 설정 → 시간 및 언어에서 변경할 수 있습니다.' },
  ar: { choose: 'اختر لغتك', go: 'متابعة', hint: 'يمكنك تغييرها لاحقًا من الإعدادات.' },
  cs: { choose: 'Zvolte jazyk', go: 'Pokračovat', hint: 'Později to můžete změnit v Nastavení.' },
  it: { choose: 'Scegli la lingua', go: 'Continua', hint: 'Puoi cambiarla più tardi nelle Impostazioni.' },
  'pt-BR': { choose: 'Escolha seu idioma', go: 'Continuar', hint: 'Você pode mudar isso depois em Configurações.' },
  ru: { choose: 'Выберите язык', go: 'Продолжить', hint: 'Позже это можно изменить в Настройках.' },
  tr: { choose: 'Dilinizi seçin', go: 'Devam', hint: 'Bunu daha sonra Ayarlar’dan değiştirebilirsiniz.' },
  vi: { choose: 'Chọn ngôn ngữ của bạn', go: 'Tiếp tục', hint: 'Bạn có thể đổi lại sau trong Cài đặt.' },
};

function copyFor(code) { return COPY[code] || COPY.en; }
function wordFor(code) { return HELLO_WORDS[code] || 'hello'; }

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'done');
    localStorage.setItem(PROMPT_KEY, '1');
  } catch (e) { /* 隐私模式不拦启动 */ }
}

function storedLanguage() {
  try {
    const value = localStorage.getItem(LANG_KEY);
    if (value) return value;
  } catch (e) { /* ignore */ }
  return '';
}

// 本地已引导过就直接跳过；换了浏览器或清了缓存时，再问一次内核。
async function alreadyOnboarded() {
  try {
    if (localStorage.getItem(SEEN_KEY) === 'done') return true;
  } catch (e) { /* ignore */ }
  try {
    // 内核无响应时不要卡住首屏：1.2 秒拿不到答复就按「未引导」处理。
    const res = await Promise.race([
      api('settings.get'),
      new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    return !!(res && res.detail && res.detail.onboarded);
  } catch (e) {
    return false;
  }
}

function reducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

export async function showHello() {
  let force = false;
  try { force = new URLSearchParams(location.search).get('hello') === '1'; } catch (e) { /* ignore */ }
  if (!force && await alreadyOnboarded()) {
    markSeen();
    return;
  }

  const languages = availableLanguages();
  if (!languages.length) return;

  const picked = storedLanguage();
  const has = (code) => languages.some((item) => item.code === code);
  // 第一版全英文：默认预选 English；已选过语言（但本地标记被清掉）时沿用上次选择。
  let chosen = has(picked) ? picked : (has('en') ? 'en' : languages[0].code);

  const word = h('div', { class: 'hello-word', 'aria-hidden': 'true' }, wordFor(chosen));
  const chooseLabel = h('p', { class: 'hello-choose' });
  const grid = h('div', { class: 'hello-langs', role: 'group' });
  const go = h('button', { class: 'hello-go', type: 'button' });
  const hint = h('p', { class: 'hello-hint' });
  const overlay = h('section', { class: 'hello', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'NexlOS' },
    h('div', { class: 'hello-inner' },
      word,
      h('div', { class: 'hello-choices' },
        chooseLabel,
        grid,
        go,
        hint)),
    h('p', { class: 'hello-mark' }, 'Windos2026 · NexlOS'));

  // 语言名用原生写法，只标 aria-pressed，不改写按钮文案。
  const chips = languages.map((language) => {
    const chip = h('button', {
      class: 'hello-lang', type: 'button', lang: language.code,
      'aria-pressed': String(language.code === chosen),
      'data-code': language.code,
      onclick: () => select(language.code),
    }, language.label);
    grid.append(chip);
    return chip;
  });

  let timer = 0;

  function stopCycle() {
    if (timer) { clearInterval(timer); timer = 0; }
  }

  function paintCopy(code) {
    const copy = copyFor(code);
    chooseLabel.textContent = copy.choose;
    go.textContent = copy.go;
    hint.textContent = copy.hint;
    document.documentElement.lang = code;
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
  }

  function select(code) {
    chosen = code;
    stopCycle();
    setLanguage(code);
    paintCopy(code);
    word.textContent = wordFor(code);
    word.classList.remove('swap');
    for (const chip of chips) {
      const on = chip.dataset.code === code;
      chip.setAttribute('aria-pressed', String(on));
      // 焦点跟着选择走：键盘和视觉反馈都停在当前语言上。
      if (on) chip.focus();
    }
  }

  paintCopy(chosen);

  const motionOff = reducedMotion();
  if (!motionOff) {
    const codes = languages.map((item) => item.code);
    let index = Math.max(0, codes.indexOf(chosen));
    timer = setInterval(() => {
      index = (index + 1) % codes.length;
      word.classList.add('swap');
      setTimeout(() => {
        word.textContent = wordFor(codes[index]);
        word.classList.remove('swap');
      }, 220);
    }, 1800);
  }

  // 先演招呼语，再浮出语言选择；减少动画时直接给选项。
  let reveal = 0;
  if (!motionOff) reveal = setTimeout(() => overlay.classList.add('choose'), 1500);
  else overlay.classList.add('choose');

  // 引导页出现时收起开机遮罩：黑底页面就是这一屏的背景。
  const boot = document.getElementById('boot');
  if (boot) boot.remove();
  document.body.classList.remove('booting');
  document.body.append(overlay);
  // 焦点先落在当前语言上：键盘用户不用先摸一遍页面，再用 Tab 在语言间移动。
  setTimeout(() => {
    const active = chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true')[0] || go;
    active.focus();
  }, motionOff ? 30 : 1650);

  await new Promise((resolve) => {
    go.addEventListener('click', async () => {
      if (go.disabled) return;
      go.disabled = true;
      stopCycle();
      if (reveal) clearTimeout(reveal);
      markSeen();
      // 先写本地缓存：内核不可用时，桌面启动仍能读到这次选择。
      try { localStorage.setItem(LANG_KEY, chosen); } catch (e) { /* ignore */ }
      setLanguage(chosen);
      try {
        await api('settings.set', { method: 'POST', fields: { language: chosen, onboarded: true } });
      } catch (e) { /* 没有内核时保留本地选择 */ }
      // 预览参数只用于强制重看：完成后从地址栏去掉，刷新不再重复出现。
      try {
        const next = new URL(location.href);
        if (next.searchParams.get('hello') === '1') {
          next.searchParams.delete('hello');
          history.replaceState(null, '', next.pathname + next.search + next.hash);
        }
      } catch (e) { /* 地址不可写时保留原 URL */ }
      overlay.classList.add('done');
      setTimeout(() => overlay.remove(), 700);
      resolve();
    });
  });
}
