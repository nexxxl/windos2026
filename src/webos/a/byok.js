// 自带模型（BYOK）对话框：命令栏模型芯片 → 用自己的账号直连模型服务。
//
// 只做表单与三个请求：GET /agent/byok 取状态与预设，POST /agent/byok 保存，
// POST /agent/byok/test 验证地址与密钥。密钥输入框永远不回填，只显示末四位。
import { h, clear } from './can.js';

let layer = null;
let onSavedCb = null;
let state = { presets: [], config: {}, active: false, loading: false };

function request(method, url, body, done) {
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = () => {
    let data = { ok: false, error: `HTTP ${xhr.status}` };
    try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) { /* 非 JSON 就是服务端出错 */ }
    done(data);
  };
  xhr.onerror = () => done({ ok: false, error: '连不上 NexlOS 内核' });
  xhr.send(body ? JSON.stringify(body) : null);
}

function presetById(id) {
  for (const p of state.presets) if (p.id === id) return p;
  return null;
}

function field(label, control) {
  return h('label', { class: 'byok-field' }, h('span', { class: 'byok-label' }, label), control);
}

function build() {
  const presetSel = h('select', { class: 'byok-input', 'aria-label': '服务商' });
  const protocolSel = h('select', { class: 'byok-input', 'aria-label': '协议' },
    h('option', { value: 'openai-completions' }, 'OpenAI 兼容 / Chat Completions'),
    h('option', { value: 'openai-responses' }, 'OpenAI Responses'),
    h('option', { value: 'anthropic-messages' }, 'Anthropic Messages'));
  const baseInput = h('input', { class: 'byok-input', type: 'text', spellcheck: 'false', placeholder: 'https://api.deepseek.com/v1' });
  const keyInput = h('input', { class: 'byok-input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-…' });
  const modelInput = h('input', { class: 'byok-input', type: 'text', spellcheck: 'false', placeholder: 'deepseek-flash' });
  const nameInput = h('input', { class: 'byok-input', type: 'text', spellcheck: 'false', placeholder: '显示名，可留空' });
  const ctxInput = h('input', { class: 'byok-input', type: 'number', min: '1000', step: '1000' });
  const maxInput = h('input', { class: 'byok-input', type: 'number', min: '256', step: '256' });
  const note = h('p', { class: 'byok-note' }, '');
  const modelsBox = h('div', { class: 'byok-models', hidden: true });
  const current = h('div', { class: 'byok-current', hidden: true });
  const testBtn = h('button', { class: 'byok-btn', type: 'button' }, '测试连接');
  const saveBtn = h('button', { class: 'byok-btn is-primary', type: 'button' }, '保存并启用');
  const closeBtn = h('button', { class: 'byok-close', type: 'button', title: '关闭', 'aria-label': '关闭' }, '×');

  function setNote(text, kind) {
    note.textContent = text || '';
    note.dataset.kind = kind || '';
  }

  function fillFromPreset(p) {
    if (!p) return;
    protocolSel.value = p.protocol || 'openai-completions';
    baseInput.value = p.baseURL || '';
    modelInput.value = p.model || '';
    nameInput.value = p.modelName || '';
    ctxInput.value = p.contextWindow ? String(p.contextWindow) : '128000';
    maxInput.value = p.maxTokens ? String(p.maxTokens) : '8192';
    setNote(p.note || '', '');
    modelsBox.hidden = true;
    clear(modelsBox);
  }

  function applyConfig(cfg) {
    presetSel.value = cfg.preset || 'custom';
    protocolSel.value = cfg.protocol || 'openai-completions';
    baseInput.value = cfg.baseURL || '';
    modelInput.value = cfg.model || '';
    nameInput.value = cfg.modelName || '';
    ctxInput.value = cfg.contextWindow ? String(cfg.contextWindow) : '128000';
    maxInput.value = cfg.maxTokens ? String(cfg.maxTokens) : '8192';
    keyInput.value = '';
    if (cfg.hasKey) keyInput.placeholder = `已保存 ····${cfg.keyHint || ''}（留空沿用）`;
  }

  function payload() {
    const out = {
      preset: presetSel.value,
      protocol: protocolSel.value,
      baseURL: baseInput.value.trim(),
      model: modelInput.value.trim(),
      modelName: nameInput.value.trim(),
      contextWindow: parseInt(ctxInput.value, 10) || 128000,
      maxTokens: parseInt(maxInput.value, 10) || 8192,
    };
    const key = keyInput.value.trim();
    if (key) out.apiKey = key;
    return out;
  }

  function renderModels(models) {
    clear(modelsBox);
    if (!models || !models.length) { modelsBox.hidden = true; return; }
    modelsBox.hidden = false;
    modelsBox.append(h('span', { class: 'byok-models-label' }, '可用模型'));
    models.slice(0, 12).forEach((id) => {
      modelsBox.append(h('button', {
        class: 'byok-model', type: 'button', title: id,
        onclick: () => {
          modelInput.value = id;
          if (!nameInput.value) nameInput.value = id;
          setNote(`已选 ${id}，记得保存。`, 'ok');
        },
      }, id));
    });
  }

  function renderCurrent() {
    clear(current);
    const cfg = state.config || {};
    if (!state.active) { current.hidden = true; return; }
    current.hidden = false;
    const label = cfg.modelName || cfg.model || '自带模型';
    current.append(
      h('div', { class: 'byok-current-row' },
        h('span', { class: 'byok-current-dot' }),
        h('b', {}, label),
        h('span', { class: 'byok-current-tag' }, '已启用')),
      h('p', { class: 'byok-current-meta' }, cfg.baseURL || ''),
      h('button', {
        class: 'byok-btn is-quiet', type: 'button',
        onclick: () => {
          if (!window.confirm('断开自带模型，回到本机 DeepSeek？')) return;
          request('DELETE', '/agent/byok', null, (data) => {
            if (!data.ok) { setNote(data.error || '断开失败', 'err'); return; }
            state.active = false;
            state.config = data.config || {};
            renderCurrent();
            setNote('已断开，回到本机直达。', 'ok');
            if (onSavedCb) onSavedCb(data);
          });
        },
      }, '断开，回到本机'));
  }

  function refresh() {
    setNote('正在读取配置…', '');
    request('GET', '/agent/byok', null, (data) => {
      if (!data.ok) { setNote(data.error || '读取失败', 'err'); return; }
      state.presets = data.presets || [];
      state.config = data.config || {};
      state.active = !!data.active;
      clear(presetSel);
      state.presets.forEach((p) => presetSel.append(h('option', { value: p.id }, p.label)));
      if (!state.presets.length) presetSel.append(h('option', { value: 'custom' }, '自定义网关'));
      applyConfig(state.config);
      // 首次打开没有历史配置：直接落到 DeepSeek 预设，用户只需粘一把密钥。
      if (!state.active && !state.config.baseURL) {
        presetSel.value = 'deepseek';
        fillFromPreset(presetById('deepseek'));
      }
      renderCurrent();
      if (state.active) setNote('当前使用自带模型；改动后保存会重启本机 dsh。', '');
      else setNote('填好服务商与密钥，先测试连接，再保存启用。', '');
    });
  }

  const box = h('div', { class: 'byok', role: 'dialog', 'aria-modal': 'true', 'aria-label': '接入自己的模型' },
    h('header', { class: 'byok-head' },
      h('div', {}, h('b', { class: 'byok-title' }, '接入自己的模型'),
        h('p', { class: 'byok-sub' }, '用你的账号直连服务商；密钥只保存在本机工作区。')),
      closeBtn),
    h('div', { class: 'byok-body' },
      field('服务商', presetSel),
      h('div', { class: 'byok-grid' },
        field('协议', protocolSel),
        field('模型', modelInput)),
      field('接口地址', baseInput),
      field('API Key', keyInput),
      h('div', { class: 'byok-grid' },
        field('上下文窗口', ctxInput),
        field('输出上限', maxInput)),
      field('显示名（可选）', nameInput),
      modelsBox,
      note,
      current),
    h('footer', { class: 'byok-foot' },
      h('div', { class: 'byok-foot-right' }, testBtn, saveBtn)));

  presetSel.addEventListener('change', () => fillFromPreset(presetById(presetSel.value)));
  testBtn.addEventListener('click', () => {
    const body = payload();
    if (!body.baseURL) { setNote('请先填写接口地址。', 'err'); return; }
    testBtn.disabled = true;
    setNote('正在测试…', '');
    request('POST', '/agent/byok/test', body, (data) => {
      testBtn.disabled = false;
      if (!data.ok) {
        setNote(`${data.error || '测试失败'}${data.status ? `（HTTP ${data.status}）` : ''}`, 'err');
        return;
      }
      const count = data.count || 0;
      setNote(`连接成功 · ${data.latencyMs}ms · 返回 ${count} 个模型`, 'ok');
      renderModels(data.models || []);
    });
  });
  saveBtn.addEventListener('click', () => {
    const body = payload();
    if (!body.baseURL || !body.model) { setNote('接口地址和模型名都要填。', 'err'); return; }
    if (!body.apiKey && !state.config.hasKey) { setNote('请填写 API Key。', 'err'); return; }
    saveBtn.disabled = true;
    setNote('正在保存…', '');
    request('POST', '/agent/byok', body, (data) => {
      saveBtn.disabled = false;
      if (!data.ok) { setNote(data.error || '保存失败', 'err'); return; }
      state.active = !!data.active;
      state.config = data.config || {};
      if (onSavedCb) onSavedCb(data);
      close();
    });
  });
  closeBtn.addEventListener('click', () => close());

  return { box, refresh };
}

function close() {
  if (!layer) return;
  document.removeEventListener('keydown', onKey, true);
  layer.remove();
  layer = null;
  onSavedCb = null;
}

function onKey(e) {
  if (e.key === 'Escape' && layer) {
    e.stopPropagation();
    close();
  }
}

export function openByok(opts) {
  if (layer) return;
  onSavedCb = (opts && opts.onSaved) || null;
  const built = build();
  layer = h('div', { class: 'byok-layer', onclick: (e) => { if (e.target === layer) close(); } }, built.box);
  // 挂在 .os 里才能继承 --nx-* 主题 token；系统应用页没有 .os 时退回 body。
  (document.querySelector('.os') || document.body).append(layer);
  document.addEventListener('keydown', onKey, true);
  built.refresh();
  setTimeout(() => {
    const first = layer && layer.querySelector('select');
    if (first) first.focus();
  }, 30);
}
