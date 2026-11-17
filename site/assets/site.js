/* NexlOS 宣传站：导航、阅读进度、复制、一句话演示、博物馆时间线。 */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 移动端导航 ---------- */
  const toggle = $('#navToggle');
  const nav = $('#siteNav');
  if (toggle && nav) {
    const setOpen = (open) => {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    };
    toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  /* ---------- 阅读进度 ---------- */
  const progress = $('#progress');
  if (progress) {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = max > 0 ? `${Math.min(100, (window.scrollY / max) * 100)}%` : '0';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- 复制按钮 ---------- */
  $$('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copy);
      if (!target) return;
      const text = target.innerText;
      try {
        await navigator.clipboard.writeText(text);
        const label = button.textContent;
        button.textContent = '已复制';
        setTimeout(() => { button.textContent = label; }, 1600);
      } catch {
        button.textContent = '复制失败';
        setTimeout(() => { button.textContent = '复制'; }, 1600);
      }
    });
  });

  /* ---------- 一句话演示 ---------- */
  const screen = $('#demoScreen');
  const demoName = $('#demoName');
  const demoCaption = $('#demoCaption');
  const promptForm = $('#promptForm');
  const promptInput = $('#promptInput');
  const chips = $$('.prompt-chip');

  const timerMarkup = `
    <div class="demo-app">
      <div class="demo-app-bar"><i></i><i></i><i></i><span>focus-timer</span></div>
      <div class="demo-app-body">
        <div class="mini-timer">
          <div class="clock">25:00</div>
          <div class="state">focus · 25 min</div>
          <div class="ring"><span></span></div>
          <div class="mini-actions"><i></i><i></i></div>
        </div>
      </div>
    </div>`;

  const noteMarkup = `
    <div class="demo-app">
      <div class="demo-app-bar"><i></i><i></i><i></i><span>sticky-note</span></div>
      <div class="demo-app-body">
        <div class="mini-note"><b>今天</b><span id="noteBody">买牛奶<br>修一下落地灯<br>给妈妈打电话</span></div>
      </div>
    </div>`;

  const minesMarkup = (() => {
    const cells = Array.from({ length: 64 }, (_, index) => {
      const open = [1, 2, 9, 10, 17, 18, 25, 33, 41, 49, 57].includes(index);
      const flag = [3, 12, 20, 36].includes(index);
      const mine = index === 27;
      return `<i class="${open ? 'open' : ''}${flag ? ' flag' : ''}${mine ? ' mine' : ''}"></i>`;
    }).join('');
    return `
      <div class="demo-app">
        <div class="demo-app-bar"><i></i><i></i><i></i><span>minesweeper</span></div>
        <div class="demo-app-body">
          <div class="mini-mines">${cells}</div>
        </div>
      </div>`;
  })();

  const calcMarkup = `
    <div class="demo-app">
      <div class="demo-app-bar"><i></i><i></i><i></i><span>calculator</span></div>
      <div class="demo-app-body">
        <div class="mini-calc">
          <output>1,024</output>
          <i class="op">C</i><i class="op">±</i><i class="op">%</i><i class="op">÷</i>
          <i>7</i><i>8</i><i>9</i><i class="op">×</i>
          <i>4</i><i>5</i><i>6</i><i class="op">−</i>
          <i>1</i><i>2</i><i>3</i><i class="op">+</i>
          <i>0</i><i>.</i><i class="eq">=</i>
        </div>
      </div>
    </div>`;

  const presets = {
    pomodoro: { name: '番茄钟', markup: timerMarkup, caption: 'apps/gen-1117-8f3a/index.html · 单文件 · 无外部依赖' },
    note: { name: '便利贴', markup: noteMarkup, caption: 'apps/gen-1117-8f3a/index.html · 单文件 · 本地保存' },
    mines: { name: '扫雷', markup: minesMarkup, caption: 'apps/gen-1117-8f3a/index.html · 单文件 · 键盘与指针' },
    calc: { name: '计算器', markup: calcMarkup, caption: 'apps/gen-1117-8f3a/index.html · 单文件 · 无外部依赖' },
  };

  const pickPreset = (text) => {
    const value = String(text || '');
    if (/番茄|pomodoro|专注|计时/iu.test(value)) return 'pomodoro';
    if (/扫雷|mine|游戏/iu.test(value)) return 'mines';
    if (/计算|calc|算式/iu.test(value)) return 'calc';
    return 'note';
  };

  const renderDemo = (key, text) => {
    const preset = presets[key] || presets.note;
    if (!screen || !demoName) return;
    screen.innerHTML = preset.markup;
    demoName.textContent = preset.name;
    if (demoCaption) demoCaption.textContent = preset.caption;
    if (key === 'note') {
      const body = $('#noteBody', screen);
      if (body) body.textContent = String(text || '写一句想记住的话').slice(0, 80);
    }
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.prompt === key)));
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.prompt;
      const preset = presets[key];
      if (!preset) return;
      const prompts = {
        pomodoro: '做一个 25 分钟的番茄钟，深色，结束时响一声',
        note: '一张能一直贴在桌面上的便签',
        mines: '做一个扫雷，首步安全，三档难度',
        calc: '一个只有四则运算的计算器',
      };
      if (promptInput) promptInput.value = prompts[key];
      renderDemo(key, prompts[key]);
    });
  });

  if (promptForm) {
    promptForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = promptInput ? promptInput.value.trim() : '';
      if (!text) return;
      renderDemo(pickPreset(text), text);
      if (!reduced && screen) {
        screen.animate(
          [{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
      }
    });
  }

  /* ---------- 操作系统博物馆 ---------- */
  const exhibits = [
    {
      year: '1969', id: 'unix', era: 'pre', eraLabel: '前互联网 · 1969–1994',
      name: 'UNIX', kicker: '贝尔实验室',
      summary: '多用户、多任务，把设备抽象成文件。一个内核，一套 shell，一群可以组合的小工具。',
      legacy: ['文件描述符、管道与 shell', '「一切皆文件」的接口直觉', '今天的终端与文件命令仍然沿用这套语法'],
      ui: 'term', uiTitle: 'UNIX · tty', uiLines: '$ ls /usr\nbin  include  lib  local\n$ cat note.txt | wc -l\n42\n$ _',
      source: { label: 'Wikipedia · Unix', url: 'https://en.wikipedia.org/wiki/Unix' },
    },
    {
      year: '1981', id: 'dos', era: 'pre', eraLabel: '前互联网 · 1969–1994',
      name: 'IBM PC / MS-DOS', kicker: '个人电脑进入办公室',
      summary: '开放硬件加上一套命令行系统，兼容机生态从此长出来。个人电脑第一次成为大规模商品。',
      legacy: ['盘符、目录与批处理', '软件与硬件解耦的兼容机市场', '命令行仍然是自动化的底座'],
      ui: 'dos', uiTitle: 'MS-DOS · COMMAND.COM', uiLines: 'C:\\> dir\n\n Volume in drive C is SYSTEM\n Directory of C:\\\n\nAUTOEXEC BAT     1,024\nCOMMAND  COM    54,645\nCONFIG   SYS       512\n\nC:\\> _',
      source: { label: 'Wikipedia · MS-DOS', url: 'https://en.wikipedia.org/wiki/MS-DOS' },
    },
    {
      year: '1984', id: 'mac', era: 'pre', eraLabel: '前互联网 · 1969–1994',
      name: 'Macintosh System 1', kicker: '图形界面走向大众',
      summary: '桌面、文件夹、图标和鼠标。菜单栏常驻屏幕顶部，用户第一次不用背命令也能操作电脑。',
      legacy: ['桌面隐喻：文件夹就是文件夹', '拖拽、剪贴板与菜单栏', '窗口成为应用的标准容器'],
      ui: 'desktop', uiTitle: 'System 1 · Finder', uiTitleBar: 'Finder', uiBody: 'System Disk\n\n  4 items    32K available', uiStart: 'File',
      source: { label: 'Wikipedia · System 1', url: 'https://en.wikipedia.org/wiki/System_1' },
    },
    {
      year: '1985', id: 'win10', era: 'pre', eraLabel: '前互联网 · 1969–1994',
      name: 'Windows 1.0', kicker: '窗口管理器',
      summary: '在 MS-DOS 之上加一层图形窗口。应用可以并排平铺，对话框与剪贴板开始成为通用部件。',
      legacy: ['窗口、对话框、剪贴板', '图形层与命令层可以共存', '为后面的多任务桌面铺路'],
      ui: 'desktop', uiTitle: 'Windows 1.0', uiTitleBar: 'MS-DOS Executive', uiBody: 'C:\\  WINDOWS  SYSTEM\n\n  APP.EXE      WRITE.EXE\n  PAINT.EXE    CLOCK.EXE\n\n  ▓▓▓▓▓  4 windows', uiStart: 'MS-DOS',
      source: { label: 'Wikipedia · Windows 1.0', url: 'https://en.wikipedia.org/wiki/Windows_1.0' },
    },
    {
      year: '1991', id: 'linux', era: 'pre', eraLabel: '前互联网 · 1969–1994',
      name: 'Linux 0.01', kicker: '开源内核',
      summary: '一个芬兰学生发布的内核，后来长成服务器、Android 和无数设备的底座。系统不再只由一家公司定义。',
      legacy: ['可修改、可分发的内核', '包管理与发行版生态', '同一套内核跑在机房、手机和开发板上'],
      ui: 'term', uiTitle: 'Linux · bash', uiLines: '$ uname -a\nLinux localhost 0.01 #1\n$ ls /\nbin  dev  etc  include  kernel\n$ _',
      source: { label: 'Wikipedia · History of Linux', url: 'https://en.wikipedia.org/wiki/History_of_Linux' },
    },
    {
      year: '1995', id: 'win95', era: 'internet', eraLabel: '互联网 · 1995–2006',
      name: 'Windows 95', kicker: '开始菜单与任务栏',
      summary: '开始菜单、任务栏、长文件名和即插即用。互联网进入家庭，桌面成为上网的入口。',
      legacy: ['「开始」成为一代人的应用入口', '任务栏成为窗口管理的默认', '桌面与浏览器开始争夺同一块屏幕'],
      ui: 'start95', uiTitle: 'Windows 95 · 桌面',
      source: { label: 'Wikipedia · Windows 95', url: 'https://en.wikipedia.org/wiki/Windows_95' },
    },
    {
      year: '2001', id: 'osx', era: 'internet', eraLabel: '互联网 · 1995–2006',
      name: 'Mac OS X', kicker: 'Unix 内核 + Aqua',
      summary: '把 Unix 的稳定性和新的图形界面合在一起。Dock、单窗口与系统级服务，成为现代 macOS 的底座。',
      legacy: ['Unix 底座进入消费级桌面', 'Dock 与全屏应用', '系统服务、权限与开发者工具'],
      ui: 'aqua', uiTitle: 'Mac OS X · Aqua',
      source: { label: 'Wikipedia · Mac OS X 10.0', url: 'https://en.wikipedia.org/wiki/Mac_OS_X_10.0' },
    },
    {
      year: '2007', id: 'iphone', era: 'mobile', eraLabel: '移动与云 · 2007–2021',
      name: 'iPhone OS', kicker: '多点触控',
      summary: '手指代替鼠标。应用网格、全屏应用、随时在线，界面从「窗口」变成「整块屏幕」。',
      legacy: ['多点触控与手势', '应用网格与全屏应用', '移动应用分发的起点'],
      ui: 'phone', uiTitle: 'iPhone OS 1.0 · 主屏幕',
      source: { label: 'Wikipedia · iPhone OS 1', url: 'https://en.wikipedia.org/wiki/IPhone_OS_1' },
    },
    {
      year: '2008', id: 'android', era: 'mobile', eraLabel: '移动与云 · 2007–2021',
      name: 'Android 1.0', kicker: '开放移动系统',
      summary: '开放手机联盟把一套应用运行时交给多家厂商。应用商店、后台服务与权限模型从此成为移动系统的标准件。',
      legacy: ['跨厂商的应用运行时', '应用商店与后台服务', '权限模型成为用户可见的界面'],
      ui: 'phone', uiTitle: 'Android 1.0 · 主屏幕',
      source: { label: 'Wikipedia · Android 1.0', url: 'https://en.wikipedia.org/wiki/Android_version_history#Android_1.0' },
    },
    {
      year: '2011', id: 'chromeos', era: 'mobile', eraLabel: '移动与云 · 2007–2021',
      name: 'ChromeOS', kicker: '浏览器即系统',
      summary: '把浏览器当作桌面。设备更轻，数据在云上，更新由系统统一完成；「应用就是一个网页」走到极端。',
      legacy: ['浏览器成为应用运行时', '自动更新与托管设备', '轻终端 + 云服务的组合'],
      ui: 'browser', uiTitle: 'ChromeOS · 浏览器',
      source: { label: 'Wikipedia · ChromeOS', url: 'https://en.wikipedia.org/wiki/ChromeOS' },
    },
    {
      year: '2022', id: 'genai', era: 'agent', eraLabel: 'Agent · 2022–今天',
      name: '生成式 AI 进入桌面', kicker: '自然语言成为界面',
      summary: 'ChatGPT 发布后，模型开始写代码、调用工具、操作应用。入口从「点菜单」变成「说一句话」。',
      legacy: ['自然语言成为新的输入层', 'Agent 调用工具与应用', '软件开始按需生成，而不是预先安装'],
      ui: 'agent', uiTitle: 'Agent · 对话',
      source: { label: 'Wikipedia · ChatGPT', url: 'https://en.wikipedia.org/wiki/ChatGPT' },
    },
    {
      year: '2026', id: 'nexlos', era: 'agent', eraLabel: 'Agent · 2022–今天',
      name: 'NexlOS / windos2026', kicker: 'Agent 的桌面',
      summary: '同一个系统，七种装法：插件、独立应用、优盘、Linux、平板。说一句话生成应用，应用是文件。',
      legacy: ['同一套 WebOS，换载体不换应用', '应用 = index.html + app.json', '模型、应用、机器都归使用者'],
      ui: 'image', uiTitle: 'NexlOS · 桌面', uiImage: 'assets/img/desktop.jpg',
      source: { label: 'GitHub · nexxxl/windos2026', url: 'https://github.com/nexxxl/windos2026' },
    },
  ];

  const stage = $('#artifact');
  const timeline = $('#timeline');
  const eraTabs = $$('.era-tab');
  const exYear = $('#exYear');
  const exEra = $('#exEra');
  const exName = $('#exName');
  const exKicker = $('#exKicker');
  const exSummary = $('#exSummary');
  const exLegacy = $('#exLegacy');
  const exSource = $('#exSource');

  if (stage && timeline && exYear) {
    let currentEra = 'all';
    let currentId = 'unix';

    const byId = new Map(exhibits.map((item) => [item.id, item]));
    const byYear = new Map(exhibits.map((item) => [item.year, item]));

    const desktopMarkup = (item) => `
      <div class="os-menu"><span>File</span><span>Edit</span><span>View</span><span>Special</span><span>Help</span></div>
      <div class="os-window">
        <div class="os-window-title"><span>${item.uiTitleBar}</span><span>□ ×</span></div>
        <div class="os-window-body">${item.uiBody.replace(/\n/g, '<br>')}</div>
      </div>
      <div class="os-taskbar"><span class="os-start">${item.uiStart}</span><span>Finder</span><span>System</span><span class="tray">10:24</span></div>`;

    const win95Markup = `
      <div class="os-menu"><span>文件</span><span>编辑</span><span>查看</span><span>帮助</span></div>
      <div class="os-window" style="margin-top:16px;width:58%">
        <div class="os-window-title"><span>我的电脑</span><span>_ □ ×</span></div>
        <div class="os-window-body">3½ 软盘 (A:)<br>本地磁盘 (C:)<br>CD-ROM (D:)<br>控制面板</div>
      </div>
      <div class="os-taskbar"><span class="os-start">开始</span><span>我的电脑</span><span class="tray">10:24</span></div>`;

    const aquaMarkup = `
      <div class="os-menu" style="background:#e8edf3"><span>Finder</span><span>File</span><span>Edit</span><span>View</span><span>Go</span></div>
      <div class="os-window" style="border-radius:8px;overflow:hidden;border-color:#9fb0c4">
        <div class="os-window-title" style="background:linear-gradient(#f7f9fb,#d9e2ec);color:#20344a">Macintosh HD</div>
        <div class="os-window-body" style="background:#f6f8fb">Applications<br>Library<br>System<br>Users<br><br>4 items, 12.4 GB available</div>
      </div>
      <div class="os-taskbar" style="background:rgba(240,245,250,.86);border-top:1px solid #c4d1de;color:#20344a"><span class="os-start" style="background:transparent;border:0">Finder</span><span>Safari</span><span>Mail</span><span class="tray">10:24</span></div>`;

    const artifactMarkup = (item) => {
      if (item.ui === 'image') {
        return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen"><img src="${item.uiImage}" alt="NexlOS 桌面"></div></div>`;
      }
      if (item.ui === 'term' || item.ui === 'dos') {
        return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen ${item.ui}">${item.uiLines.replace(/\n/g, '<br>')}</div></div>`;
      }
      if (item.ui === 'desktop') {
        return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen desktop">${desktopMarkup(item)}</div></div>`;
      }
      if (item.ui === 'start95') {
        return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen desktop">${win95Markup}</div></div>`;
      }
      if (item.ui === 'aqua') {
        return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen desktop" style="background:linear-gradient(160deg,#2f6db3,#8fc1e8)">${aquaMarkup}</div></div>`;
      }
      if (item.ui === 'phone') {
        const apps = Array.from({ length: 12 }, () => '<i></i>').join('');
        return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen phone"><div class="phone">${apps}</div></div></div>`;
      }
      if (item.ui === 'browser') {
        return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen browser"><div class="browser-top"><i></i><i></i><i></i><span class="browser-address"></span></div><div class="browser-page"><b></b><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
      }
      return `<div class="artifact"><div class="artifact-bar"><span class="sq"></span><span>${item.uiTitle}</span></div><div class="artifact-screen agent"><div class="agent-line me">给我一个能带走的番茄钟</div><div class="agent-line">写入 apps/gen-1117-8f3a/index.html</div><div class="agent-line ok">verifyAppHtml ✓ 已放到桌面</div></div></div>`;
    };

    const updateTimeline = () => {
      $$('#timeline button').forEach((button) => {
        const item = byId.get(button.dataset.id);
        const selected = button.dataset.id === currentId;
        button.setAttribute('aria-selected', String(selected));
        button.classList.toggle('is-dim', Boolean(item) && currentEra !== 'all' && item.era !== currentEra);
      });
    };

    const visibleIds = () => exhibits
      .filter((item) => currentEra === 'all' || item.era === currentEra)
      .map((item) => item.id);

    const render = (id, options = {}) => {
      const item = byId.get(id);
      if (!item) return;
      currentId = id;
      stage.innerHTML = artifactMarkup(item);
      exYear.textContent = item.year;
      exEra.textContent = item.eraLabel;
      exName.textContent = item.name;
      exKicker.textContent = item.kicker;
      exSummary.textContent = item.summary;
      exLegacy.innerHTML = item.legacy.map((line) => `<li>${line}</li>`).join('');
      exSource.innerHTML = `来源：<a href="${item.source.url}" target="_blank" rel="noopener">${item.source.label} ↗</a>`;
      updateTimeline();
      if (options.scroll !== false) {
        const active = $(`#timeline button[data-id="${id}"]`);
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
      }
      if (options.hash !== false) {
        history.replaceState(null, '', `#${item.year}`);
      }
    };

    eraTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        currentEra = tab.dataset.era || 'all';
        eraTabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
        if (currentEra !== 'all') {
          const current = byId.get(currentId);
          if (!current || current.era !== currentEra) {
            const first = exhibits.find((item) => item.era === currentEra);
            if (first) render(first.id, { scroll: true });
            return;
          }
        }
        updateTimeline();
      });
    });

    $$('#timeline button').forEach((button) => {
      button.addEventListener('click', () => render(button.dataset.id));
    });

    const step = (direction) => {
      const ids = visibleIds();
      if (!ids.length) return;
      const index = ids.indexOf(currentId);
      const next = ids[(index + direction + ids.length) % ids.length];
      render(next);
    };

    const prev = $('#prevExhibit');
    const next = $('#nextExhibit');
    if (prev) prev.addEventListener('click', () => step(-1));
    if (next) next.addEventListener('click', () => step(1));

    timeline.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    });

    const fromHash = () => {
      const raw = decodeURIComponent(location.hash.replace(/^#/u, ''));
      if (!raw) return null;
      return byId.get(raw) || byYear.get(raw) || null;
    };

    const initial = fromHash();
    if (initial) render(initial.id, { scroll: false, hash: false });
    else render('unix', { scroll: false, hash: false });

    window.addEventListener('hashchange', () => {
      const item = fromHash();
      // 目录点击后把展品和时间线带回视口；仅换选不滚动会让底部索引看起来没反应。
      if (item && item.id !== currentId) render(item.id, { hash: false });
    });
  }
})();
