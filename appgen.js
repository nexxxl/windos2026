/* NexlOS app-generation dialog.
 *
 * Replaces the old .nexlosapp installer: a one-sentence prompt lets DSH generate
 * a self-contained embedded app, and a GitHub URL can be cloned/built on the
 * host by the plugin backend. Generated apps are served from /a/generated/.
 */
import { h, clear } from '/a/can.js';

export function mountAppGen(host) {
  if (!document.querySelector('link[data-nexlos-appgen]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/nexlos/appgen.css';
    link.setAttribute('data-nexlos-appgen', 'css');
    document.head.append(link);
  }

  const prompt = h('textarea', {
    class: 'forge-prompt', rows: '4',
    placeholder: '用一句话描述你要的应用，例如：做一个番茄钟，带三种时长、声音提醒和每日统计。',
  });
  const generate = h('button', { class: 'forge-primary', type: 'button' }, '让 DSH 生成应用');
  const genStatus = h('p', { class: 'forge-status' }, '生成会调用当前 DSH 默认模型，通常需要 10–60 秒。');
  const repo = h('input', { class: 'forge-input', type: 'url', placeholder: 'https://github.com/owner/repo' });
  const consent = h('input', { type: 'checkbox', class: 'forge-consent' });
  const importBtn = h('button', { class: 'forge-secondary', type: 'button' }, '导入并构建');
  const importStatus = h('p', { class: 'forge-status' }, '仓库会在宿主执行 git clone；有 package.json 时执行 npm install / npm run build。');

  const preview = h('iframe', {
    class: 'forge-preview', title: '生成应用预览', hidden: true,
    sandbox: 'allow-scripts allow-forms allow-popups allow-modals',
  });
  const previewEmpty = h('div', { class: 'forge-preview-empty' }, [
    h('b', {}, '预览区'),
    h('p', {}, '生成或导入后，应用会在这里直接运行。刷新桌面后也会出现在开始菜单。'),
  ]);
  const list = h('div', { class: 'forge-list' });
  let apps = [];
  let busy = false;

  const root = h('div', { class: 'forge' },
    h('section', { class: 'forge-grid' }, [
      h('div', { class: 'forge-panel' }, [
        h('div', { class: 'forge-panel-title' }, ['AI 生成', h('span', {}, '调用 DSH 默认模型')]),
        prompt,
        generate,
        genStatus,
      ]),
      h('div', { class: 'forge-panel' }, [
        h('div', { class: 'forge-panel-title' }, ['GitHub 导入', h('span', {}, '在宿主 clone / build')]),
        repo,
        h('label', { class: 'forge-check' }, [consent, h('span', {}, '我确认允许在宿主电脑执行 git / npm 构建命令')]),
        importBtn,
        importStatus,
      ]),
    ]),
    h('section', { class: 'forge-stage' }, [
      h('div', { class: 'forge-stage-head' }, [
        h('b', {}, '应用库'),
        h('button', { class: 'forge-link', type: 'button', onclick: () => { try { window.parent.location.reload(); } catch (_error) { location.reload(); } } }, '刷新桌面'),
      ]),
      list,
    ]),
    h('section', { class: 'forge-preview-wrap' }, [preview, previewEmpty]),
  );
  host.append(root);

  function setBusy(value) {
    busy = value;
    generate.disabled = value;
    importBtn.disabled = value;
    generate.textContent = value ? '生成中…' : '让 DSH 生成应用';
    importBtn.textContent = value ? '处理中…' : '导入并构建';
  }

  function showPreview(app) {
    if (!app) return;
    preview.hidden = false;
    previewEmpty.hidden = true;
    preview.src = app.entry || ('/a/generated/' + app.id + '/');
    preview.dataset.app = app.id;
  }

  async function uninstallApp(app) {
    if (busy) return;
    if (!window.confirm('卸载「' + (app.name || app.id) + '」？应用目录与元数据会一起删除。')) return;
    busy = true;
    genStatus.textContent = '正在卸载…';
    try {
      const response = await fetch('/agent/appgen', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uninstall: app.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok !== true) throw new Error((data && data.error) || '卸载失败');
      apps = Array.isArray(data.apps) ? data.apps : apps.filter(item => item.id !== app.id);
      if (preview.dataset.app === app.id) {
        preview.hidden = true;
        preview.src = 'about:blank';
        previewEmpty.hidden = false;
      }
      renderApps();
      genStatus.textContent = '已卸载：' + (app.name || app.id) + '（刷新桌面后从开始菜单移除）';
    } catch (error) {
      genStatus.textContent = '卸载失败：' + (error && error.message ? error.message : String(error));
    } finally {
      busy = false;
    }
  }

  function renderApps() {
    clear(list);
    if (apps.length === 0) {
      list.append(h('p', { class: 'forge-empty' }, '还没有生成应用。'));
      return;
    }
    apps.forEach((app) => {
      const card = h('div', {
        class: 'forge-card', role: 'button', tabindex: '0',
        onclick: () => showPreview(app),
        onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showPreview(app); } },
      }, [
        h('span', { class: 'forge-card-icon', 'aria-hidden': 'true' }),
        h('span', { class: 'forge-card-main' }, [
          h('b', {}, app.name || app.id),
          h('small', {}, app.description || app.id),
        ]),
        h('span', { class: 'forge-card-open' }, '预览'),
        h('button', {
          class: 'forge-uninstall', type: 'button', title: '卸载应用',
          onclick: (event) => { event.stopPropagation(); void uninstallApp(app); },
        }, '卸载'),
      ]);
      list.append(card);
    });
  }

  async function refresh() {
    try {
      const response = await fetch('/agent/appgen', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (response.ok && data && data.ok) {
        apps = Array.isArray(data.apps) ? data.apps : [];
        renderApps();
        if (apps.length && preview.hidden) showPreview(apps[apps.length - 1]);
      }
    } catch (_error) { /* list stays empty */ }
  }

  async function submit(body, endpoint, statusEl) {
    if (busy) return;
    setBusy(true);
    statusEl.textContent = endpoint === '/agent/appgen' && body.github ? '正在 clone / 构建…' : '正在生成…';
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok !== true) throw new Error((data && data.error) || ('HTTP ' + response.status));
      statusEl.textContent = '完成：' + (data.app && data.app.name ? data.app.name : '已生成');
      await refresh();
      const latest = data.app ? apps.find(item => item.id === data.app.id) : null;
      if (latest) showPreview(latest);
      else if (data.app) showPreview(data.app);
    } catch (error) {
      statusEl.textContent = '失败：' + (error && error.message ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  generate.addEventListener('click', () => {
    const text = prompt.value.trim();
    if (text === '') { genStatus.textContent = '先写一句描述。'; return; }
    void submit({ prompt: text }, '/agent/appgen', genStatus);
  });

  importBtn.addEventListener('click', () => {
    const url = repo.value.trim();
    if (url === '') { importStatus.textContent = '先填一个 GitHub 仓库地址。'; return; }
    if (!consent.checked) { importStatus.textContent = '请先确认允许在宿主执行构建命令。'; return; }
    void submit({ github: url, consent: true }, '/agent/appgen', importStatus);
  });

  refresh();
  return { destroy() { clear(host); } };
}
