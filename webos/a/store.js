// 软件安装：一个工具箱，拖入安装包或点选文件即装。
// 这里不列已安装应用；卸载统一在「设置 → 应用」。
import { h, clear, api } from './can.js';

const MAX_UPLOAD = 512 << 20;

export function mountStore(host) {
  if (!document.querySelector('link[data-nexlos-store]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: '/a/store.css', 'data-nexlos-store': '' }));
  }

  const st = {
    busy: false,
    progress: 0,
    label: '',
    result: null,
    error: '',
    drag: false,
  };
  let current = null;

  const root = h('div', { class: 'up' });
  const drop = h('div', { class: 'up-drop' });
  const input = h('input', {
    type: 'file', hidden: true, accept: '.nexlosapp,.zip,application/zip',
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) upload(f);
    },
  });
  const progressBar = h('i');
  const progressBox = h('div', { class: 'up-progress', hidden: true },
    h('div', { class: 'up-bar' }, progressBar),
    h('span', { class: 'up-progress-label' }));
  const resultBox = h('div', { class: 'up-result', hidden: true });
  const errorBox = h('p', { class: 'up-error', hidden: true });
  const mask = h('div', { class: 'up-dropmask', hidden: true },
    h('div', {}, h('b', {}, '松手放进工具箱'), h('span', {}, '.nexlosapp / .zip')));

  const screws = [1, 2, 3, 4].map((n) => h('i', { class: `up-screw s${n}` }));

  root.append(
    h('header', { class: 'up-head' },
      h('p', { class: 'up-eyebrow' }, 'NEXLOS · TOOLBOX'),
      h('h1', {}, '软件安装'),
      h('p', { class: 'up-sub' }, '把安装包放进工具箱，验签后自动安装。卸载在「设置 → 应用」。')),
    h('section', { class: 'up-main' },
      h('div', { class: 'up-case' },
        h('span', { class: 'up-handle' }),
        screws,
        h('div', { class: 'up-tray' },
          drop,
          progressBox,
          errorBox,
          resultBox,
          h('p', { class: 'up-hint' }, '上限 512 MiB · 安装包读取后即删除')),
        h('span', { class: 'up-plate' }, 'SOFTWARE · INSTALL'))),
    input,
    mask,
  );
  host.append(root);

  function paintDrop() {
    clear(drop);
    drop.append(
      h('div', { class: 'up-mark' },
        h('span', { class: 'up-mark-lid' }),
        h('span', { class: 'up-mark-box' })),
      h('b', {}, '把安装包放进工具箱'),
      h('span', { class: 'up-drop-hint' }, '.nexlosapp / .zip · 松手即安装'),
      h('button', {
        class: 'up-pick', type: 'button',
        onclick: () => input.click(),
      }, '选择文件'),
    );
    drop.classList.toggle('is-busy', st.busy);
  }

  function paintProgress() {
    progressBox.hidden = !st.busy;
    if (!st.busy) return;
    progressBar.style.width = `${Math.max(4, st.progress)}%`;
    progressBox.querySelector('.up-progress-label').textContent = st.label;
  }

  function paintResult() {
    resultBox.hidden = !st.result;
    errorBox.hidden = !st.error;
    errorBox.textContent = st.error;
    if (!st.result) return;
    const d = st.result;
    clear(resultBox);
    resultBox.append(
      h('div', { class: 'up-result-main' },
        h('b', {}, `已装好 ${d.name || d.installed}`),
        h('span', {}, `${d.version} · ${d.kind === 'zip' ? 'ZIP 已签名' : '签名包'} · ${d.installed}`)),
      h('button', { class: 'up-open', type: 'button', onclick: () => openApp(d.installed) }, '打开'));
    if (d.warnings && d.warnings.length) {
      resultBox.append(h('p', { class: 'up-warn' }, d.warnings.join('；')));
    }
  }

  function paint() {
    paintDrop();
    paintProgress();
    paintResult();
    mask.hidden = !st.drag;
    root.classList.toggle('is-drag', st.drag);
  }

  function upload(file) {
    st.error = '';
    st.result = null;
    if (!/\.(nexlosapp|zip)$/i.test(file.name)) {
      st.error = '只接受 .nexlosapp 或 .zip';
      paint();
      return;
    }
    if (file.size > MAX_UPLOAD) {
      st.error = '文件超过 512 MiB';
      paint();
      return;
    }
    st.busy = true;
    st.progress = 0;
    st.label = `正在上传 ${file.name}`;
    paint();

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/u?path=/inbox&overwrite=1');
    // 内核的上传口要求这个头：跨站表单带不上自定义头，等于第二道同源闸门。
    xhr.setRequestHeader('X-NEXLOS-Upload', '1');
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      st.progress = Math.min(92, Math.round((e.loaded / e.total) * 88));
      st.label = `正在上传 ${Math.round((e.loaded / e.total) * 100)}% · ${fmtBytes(e.loaded)} / ${fmtBytes(e.total)}`;
      paintProgress();
    };
    xhr.onerror = () => fail('上传失败：网络中断');
    xhr.onload = async () => {
      let out = null;
      try { out = JSON.parse(xhr.responseText); } catch (e) { /* 下面统一报错 */ }
      if (xhr.status !== 200 || !out || out.ok === false) {
        fail((out && out.error) || `上传失败（HTTP ${xhr.status}）`);
        return;
      }
      const uploaded = (out.detail && out.detail.path) || '';
      if (!uploaded) { fail('上传成功但没有返回文件路径'); return; }
      st.progress = 92;
      st.label = '正在验签并安装…';
      paintProgress();
      try {
        const r = await api('app.upload', { method: 'POST', fields: { path: uploaded.replace(/^\//, '') } });
        st.result = r.detail;
        st.progress = 100;
        st.label = '安装完成';
      } catch (e) {
        fail(e.message);
        return;
      }
      setTimeout(() => { st.busy = false; paint(); }, 520);
    };

    const fd = new FormData();
    fd.append('file', file, file.name);
    xhr.send(fd);
    current = xhr;
  }

  function fail(message) {
    st.busy = false;
    st.error = message;
    paint();
  }

  function openApp(id) {
    const msg = { type: 'nexlos.open', app: id };
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, location.origin);
      return;
    }
    location.hash = '#/desktop';
    setTimeout(() => window.postMessage(msg, location.origin), 450);
  }

  function fmtBytes(n) {
    if (!Number.isFinite(n)) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  // 整个页面都是投放区；只有真正离开窗口才收起提示。
  let dragDepth = 0;
  function onDragEnter(e) {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    dragDepth += 1;
    st.drag = true;
    paint();
  }
  function onDragOver(e) { e.preventDefault(); }
  function onDragLeave(e) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) { st.drag = false; paint(); }
  }
  function onDrop(e) {
    e.preventDefault();
    dragDepth = 0;
    st.drag = false;
    paint();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) upload(f);
  }
  root.addEventListener('dragenter', onDragEnter);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('dragleave', onDragLeave);
  root.addEventListener('drop', onDrop);

  paint();

  return {
    destroy() {
      if (current) { try { current.abort(); } catch (e) { /* 已经结束 */ } }
      root.removeEventListener('dragenter', onDragEnter);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('dragleave', onDragLeave);
      root.removeEventListener('drop', onDrop);
      root.remove();
    },
  };
}
