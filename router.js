/* NexlOS plugin-edition runtime picker.
 *
 * The stock WebOS command chip opens a BYOK "model route" popover. In plugin
 * mode the user already owns a DSH account, so this layer intercepts that
 * chip and shows the Harness-native controls instead: the model catalog of the
 * current DSH session plus its permission preset. No key entry exists here.
 */
(function () {
  'use strict';
  if (window.__nxRouter) return;
  window.__nxRouter = true;

  var STORE = 'nexlos.os.';
  var panel = null;
  var body = null;
  var note = null;
  var chip = null;
  var data = null;
  var busy = false;
  var loading = false;
  var fetchedAt = 0;
  var inflight = null;
  var errorText = '';
  var confirmPreset = '';
  var open = false;

  function $(tag, attrs) {
    var kids = Array.prototype.slice.call(arguments, 2);
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2).toLowerCase(), value);
        else el.setAttribute(key, value === true ? '' : value);
      });
    }
    kids.flat(9).forEach(function (kid) {
      if (kid == null || kid === false) return;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return el;
  }

  function cmdSession() {
    try {
      return localStorage.getItem(STORE + 'cmd.session') || '';
    } catch (error) {
      return '';
    }
  }

  function sessionHint() {
    return cmdSession() || '（尚未创建 DSH 进程）';
  }

  function currentChipLabel() {
    return document.querySelector('.os-cmd-chip-label') || document.querySelector('.os-cmd-chip b');
  }

  function shortModelLabel(provider, model) {
    if (model === 'deepseek-flash') return 'v4.1-flash';
    if (model === 'deepseek-v4-pro') return 'v4-pro';
    var label = modelLabel(provider, model);
    return String(label || model || '模型').replace(/^DeepSeek-/iu, '');
  }

  function setChipLabel(text, title) {
    var label = currentChipLabel();
    if (!label) return;
    label.textContent = text || '本机';
    var host = document.querySelector('.os-cmd-chip');
    if (host) host.title = title || text || '运行设置';
  }

  function modelLabel(provider, model) {
    if (!data || !data.modelCatalog || !data.modelCatalog.groups) return model || '模型';
    var groups = data.modelCatalog.groups;
    for (var i = 0; i < groups.length; i += 1) {
      if (groups[i].id !== provider) continue;
      var models = groups[i].models || [];
      for (var j = 0; j < models.length; j += 1) {
        if (models[j].id === model) return models[j].name || models[j].id;
      }
    }
    return model || '模型';
  }

  function effortLabel(provider, model, effort) {
    if (!effort || !data || !data.modelCatalog || !data.modelCatalog.groups) return effort || '';
    var groups = data.modelCatalog.groups;
    for (var i = 0; i < groups.length; i += 1) {
      if (groups[i].id !== provider) continue;
      var models = groups[i].models || [];
      for (var j = 0; j < models.length; j += 1) {
        if (models[j].id !== model) continue;
        var efforts = (models[j].reasoning && models[j].reasoning.efforts) || [];
        for (var k = 0; k < efforts.length; k += 1) {
          if (efforts[k].id === effort) return efforts[k].name || efforts[k].id;
        }
      }
    }
    return effort;
  }

  function paintChip() {
    if (!data || !data.currentModel) return;
    var model = data.currentModel;
    var label = shortModelLabel(model.provider, model.model);
    var effort = model.reasoningEffort ? effortLabel(model.provider, model.model, model.reasoningEffort) : '';
    if (effort) label += ' · ' + effort;
    setChipLabel(label, [model.provider, model.model].filter(Boolean).join('/') + (effort ? ' · ' + effort : ''));
  }

  function permissionName(value) {
    if (!data || !data.permissionCatalog) return value;
    var options = data.permissionCatalog.options || [];
    for (var i = 0; i < options.length; i += 1) if (options[i].value === value) return options[i].name || value;
    return value === 'custom' ? '自定义' : value;
  }

  function permissionLabelOf(value, fallback) {
    var labels = {
      'read-only': '只读',
      'workspace-write': '工作区可写',
      'danger-full-access': '完全权限',
      'auto': '自动',
      'custom': '自定义',
    };
    if (labels[value]) return labels[value];
    return fallback && fallback !== value ? fallback : value;
  }

  function permissionDescriptionOf(value, fallback) {
    if (fallback) return fallback;
    var descriptions = {
      'read-only': '只能读取工作区，不写入文件、不执行命令',
      'workspace-write': '可以修改工作区文件，命令仍受沙箱约束',
      'danger-full-access': '可以执行任意命令并访问整个主机',
      'auto': '由 Harness 按每一步的风险自动决定授权',
    };
    return descriptions[value] || '';
  }

  function permissionGlyph(value) {
    if (value === 'read-only') return '◇';
    if (value === 'workspace-write') return '◐';
    if (value === 'danger-full-access') return '⚠';
    if (value === 'auto') return '↻';
    return '·';
  }

  function modelEfforts(model) {
    if (!model || !model.reasoning || !Array.isArray(model.reasoning.efforts)) return [];
    return model.reasoning.efforts;
  }

  async function load(keepOpen, force) {
    if (loading) return;
    if (!force && data && Date.now() - fetchedAt < 4000) {
      paintChip();
      if (open || keepOpen) render();
      return;
    }
    loading = true;
    errorText = '';
    render();
    var controller = new AbortController();
    inflight = controller;
    try {
      var response = await fetch('/agent/picker?sessionId=' + encodeURIComponent(cmdSession()), {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      var payload = await response.json().catch(function () { return null; });
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload && payload.error ? payload.error : 'HTTP ' + response.status);
      }
      data = payload;
      fetchedAt = Date.now();
      paintChip();
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      errorText = error && error.message ? error.message : String(error);
    } finally {
      if (inflight === controller) inflight = null;
      loading = false;
      if (open || keepOpen) render();
    }
  }

  function newCmdSession() {
    return 'nexlos-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function rotateCommandSession(target) {
    try { localStorage.setItem(STORE + 'cmd.session', target); } catch (error) { /* private mode */ }
  }

  async function selectContainer(target) {
    if (busy) return;
    busy = true;
    errorText = '';
    render();
    var previous = cmdSession();
    var next = newCmdSession();
    try {
      var response = await fetch('/agent/container', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: next, copyFrom: previous, path: target }),
      });
      var payload = await response.json().catch(function () { return null; });
      if (!response.ok || !payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : 'HTTP ' + response.status);
      rotateCommandSession(next);
      data = null;
      fetchedAt = 0;
      errorText = '已切换到容器：' + target + '。下一次下达命令会在该空间创建 DSH 进程。';
    } catch (error) {
      errorText = error && error.message ? error.message : String(error);
    } finally {
      busy = false;
      await load(true);
    }
  }

  async function createContainer() {
    if (busy) return;
    var name = window.prompt('新建容器空间（会成为 DSH 工作区目录）', '');
    if (name === null || name.trim() === '') return;
    busy = true;
    errorText = '';
    render();
    var previous = cmdSession();
    var next = newCmdSession();
    try {
      var response = await fetch('/agent/containers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: next, copyFrom: previous, name: name.trim() }),
      });
      var payload = await response.json().catch(function () { return null; });
      if (!response.ok || !payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : 'HTTP ' + response.status);
      rotateCommandSession(next);
      data = null;
      fetchedAt = 0;
      errorText = '已创建容器：' + payload.path + '。下一次下达命令会在该空间创建 DSH 进程。';
    } catch (error) {
      errorText = error && error.message ? error.message : String(error);
    } finally {
      busy = false;
      await load(true, true);
    }
  }

  function containerRow(label, target, current) {
    return $('button', {
      class: 'nxrt-row nxrt-container' + (current ? ' is-current' : ''),
      type: 'button',
      disabled: busy,
      onclick: function () { if (!busy) void selectContainer(target); },
    },
      $('span', { class: 'nxrt-row-icon' }, current ? '●' : '○'),
      $('span', { class: 'nxrt-row-main' }, [
        $('b', {}, label),
        $('small', {}, target),
      ]),
      current ? $('span', { class: 'nxrt-check' }, '✓') : null,
    );
  }

  async function selectPermission(preset) {
    if (busy) return;
    busy = true;
    errorText = '';
    render();
    try {
      var response = await fetch('/agent/permission', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: cmdSession(), preset: preset }),
      });
      var payload = await response.json().catch(function () { return null; });
      if (!response.ok || !payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : 'HTTP ' + response.status);
      if (payload.warning) errorText = '已保存，当前会话稍后生效：' + payload.warning;
      if (data) data.currentPermission = preset;
    } catch (error) {
      errorText = error && error.message ? error.message : String(error);
    } finally {
      busy = false;
      confirmPreset = '';
      await load(true, true);
    }
  }

  async function selectModel(provider, model, reasoningEffort) {
    if (busy) return;
    busy = true;
    errorText = '';
    render();
    try {
      var response = await fetch('/agent/model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: cmdSession(),
          provider: provider,
          model: model,
          ...(reasoningEffort ? { reasoningEffort: reasoningEffort } : {}),
        }),
      });
      var payload = await response.json().catch(function () { return null; });
      if (!response.ok || !payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : 'HTTP ' + response.status);
      if (payload.warning) errorText = '已保存，当前会话稍后生效：' + payload.warning;
      if (data) data.currentModel = { provider: provider, model: model, ...(reasoningEffort ? { reasoningEffort: reasoningEffort } : {}) };
      paintChip();
    } catch (error) {
      errorText = error && error.message ? error.message : String(error);
    } finally {
      busy = false;
      await load(true, true);
    }
  }

  function permissionRow(option) {
    var current = data && option.value === data.currentPermission;
    var risky = option.value === 'danger-full-access' || option.value === 'auto';
    var row = $('button', {
      class: 'nxrt-row' + (current ? ' is-current' : '') + (risky ? ' is-risky' : ''),
      type: 'button',
      onclick: function () {
        if (busy) return;
        if (risky && confirmPreset !== option.value) {
          confirmPreset = option.value;
          render();
          return;
        }
        void selectPermission(option.value);
      },
    },
      $('span', { class: 'nxrt-row-icon' }, permissionGlyph(option.value)),
      $('span', { class: 'nxrt-row-main' }, [
        $('b', {}, permissionLabelOf(option.value, option.name)),
        permissionDescriptionOf(option.value, option.description) ? $('small', {}, permissionDescriptionOf(option.value, option.description)) : null,
        risky && confirmPreset === option.value
          ? $('em', { class: 'nxrt-confirm' }, '再次点击确认切换到「' + permissionLabelOf(option.value, option.name) + '」')
          : null,
      ]),
      current ? $('span', { class: 'nxrt-check' }, '✓') : null,
    );
    return row;
  }

  function modelRow(group, model) {
    var current = data && data.currentModel && data.currentModel.provider === group.id && data.currentModel.model === model.id;
    var efforts = modelEfforts(model);
    var effort = current && data.currentModel.reasoningEffort ? data.currentModel.reasoningEffort : '';
    var row = $('div', {
      class: 'nxrt-row nxrt-model' + (current ? ' is-current' : ''),
      role: 'button',
      tabindex: '0',
      onclick: function () {
        if (busy) return;
        void selectModel(group.id, model.id, current ? effort : undefined);
      },
      onkeydown: function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (busy) return;
        void selectModel(group.id, model.id, current ? effort : undefined);
      },
    },
      $('span', { class: 'nxrt-row-icon' }, current ? '●' : '○'),
      $('span', { class: 'nxrt-row-main' }, [
        $('b', {}, model.name || model.id),
        $('small', {}, [group.name || group.id, model.description || ''].filter(Boolean).join(' · ')),
      ]),
      current && efforts.length > 0
        ? $('span', { class: 'nxrt-efforts' }, efforts.map(function (item) {
          return $('button', {
            class: 'nxrt-effort' + (item.id === effort ? ' is-on' : ''),
            type: 'button',
            title: item.description || item.name || item.id,
            onclick: function (event) {
              event.stopPropagation();
              if (busy) return;
              void selectModel(group.id, model.id, item.id);
            },
          }, item.name || item.id);
        }))
        : (current ? $('span', { class: 'nxrt-check' }, '✓') : null),
    );
    return row;
  }

  function renderSection(title, rows) {
    return $('section', { class: 'nxrt-section' }, [
      $('div', { class: 'nxrt-head' }, title),
      ...rows,
    ]);
  }

  function render() {
    if (!panel) return;
    panel.hidden = !open;
    if (!open) return;
    body.replaceChildren();
    if (loading && !data) {
      body.append($('div', { class: 'nxrt-empty' }, '读取 DSH 运行设置…'));
      return;
    }
    if (errorText) body.append($('div', { class: 'nxrt-error' }, errorText));
    if (!data) {
      body.append($('div', { class: 'nxrt-empty' }, '暂时读不到运行设置'),
        $('button', { class: 'nxrt-retry', type: 'button', onclick: function () { void load(true); } }, '重试'));
      return;
    }
    var permissionCatalog = data.permissionCatalog;
    var permissionOptions = permissionCatalog && Array.isArray(permissionCatalog.options) ? permissionCatalog.options : [];
    var groups = data.modelCatalog && Array.isArray(data.modelCatalog.groups) ? data.modelCatalog.groups : [];
    var rows = [];
    rows.push($('div', { class: 'nxrt-note' },
      data.sessionPresent
        ? '调整会写回当前 DSH 进程；模型与权限由 Harness 持有，无需额外配置。'
        : '还没有运行过命令。先选好模型与权限，下一次下达命令时创建 DSH 进程并立即生效。'));
    if (permissionOptions.length > 0) {
      rows.push(renderSection('权限',
        permissionOptions.map(permissionRow).concat(
          data.currentPermission && !permissionOptions.some(function (o) { return o.value === data.currentPermission; })
            ? [$('div', { class: 'nxrt-none' }, '当前：' + permissionName(data.currentPermission))]
            : [],
        )));
    } else {
      rows.push(renderSection('权限', [$('div', { class: 'nxrt-none' }, '当前 DSH 没有暴露权限预设')]));
    }
    if (groups.length > 0) {
      var modelBlocks = [];
      groups.forEach(function (group) {
        if (!group.models || group.models.length === 0) return;
        modelBlocks.push($('div', { class: 'nxrt-group' }, group.name || group.id));
        (group.models || []).forEach(function (model) { modelBlocks.push(modelRow(group, model)); });
      });
      if (data.currentModel && !groups.some(function (g) {
        return (g.models || []).some(function (m) { return m.id === data.currentModel.model && g.id === data.currentModel.provider; });
      })) {
        modelBlocks.unshift($('div', { class: 'nxrt-none' }, '当前：' + modelLabel(data.currentModel.provider, data.currentModel.model)));
      }
      rows.push(renderSection('模型', modelBlocks));
    } else {
      rows.push(renderSection('模型', [$('div', { class: 'nxrt-none' }, '当前 DSH 没有可用模型目录')]));
    }
    var containers = data.containers;
    if (containers) {
      var containerRows = [];
      var seenPaths = {};
      var currentPath = containers.current || containers.home;
      containerRows.push($('div', { class: 'nxrt-note' }, '宿主空间：NexlOS 的 home 与 DSH 工作区都可以成为 agent 容器。切换后下一次命令在新的 DSH 进程里运行。'));
      var homeRow = containerRow('NexlOS home · 记忆与书目', containers.home, currentPath === containers.home);
      containerRows.push(homeRow);
      seenPaths[containers.home] = true;
      (containers.workspaces || []).slice(0, 8).forEach(function (workspace) {
        if (!workspace || !workspace.path || seenPaths[workspace.path]) return;
        seenPaths[workspace.path] = true;
        containerRows.push(containerRow(workspace.title || workspace.path.split('/').pop(), workspace.path, currentPath === workspace.path));
      });
      if (currentPath && currentPath !== containers.home && !seenPaths[currentPath]) {
        containerRows.push(containerRow('当前容器', currentPath, true));
      }
      containerRows.push($('div', { class: 'nxrt-container-actions' },
        $('button', { class: 'nxrt-open', type: 'button', onclick: function () { void createContainer(); } }, '+ 新建容器空间')));
      rows.push(renderSection('宿主空间', containerRows));
    }
    body.append.apply(body, rows);
    var footer = $('div', { class: 'nxrt-foot' },
      $('span', {}, 'DSH 会话 ' + (data.sessionPresent ? '已就绪' : '尚未创建')),
      $('button', { class: 'nxrt-link', type: 'button', onclick: function () { void load(true, true); } }, busy ? '刷新中…' : '刷新'));
    body.append(footer);
  }

  function shortSession(id) {
    return id ? String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-8) : '';
  }

  function place() {
    if (!panel || !chip) return;
    var rect = chip.getBoundingClientRect();
    var width = Math.min(380, window.innerWidth - 24);
    panel.style.width = width + 'px';
    panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
    panel.style.bottom = Math.max(96, window.innerHeight - rect.top + 10) + 'px';
    panel.style.top = 'auto';
  }

  function show(force) {
    if (!panel) return;
    if (open && force !== true) {
      open = false;
      render();
      return;
    }
    open = true;
    chip = document.querySelector('.os-cmd-chip');
    var native = document.querySelector('.os-cmd-menu');
    if (native) native.hidden = true;
    place();
    panel.hidden = false;
    void load(true);
    render();
  }

  function hide() {
    if (!open) return;
    open = false;
    if (panel) panel.hidden = true;
  }

  function build() {
    var os = document.querySelector('.os') || document.body;
    panel = $('div', { class: 'nxrt-panel', hidden: true, role: 'dialog', 'aria-label': '运行设置' });
    var head = $('header', { class: 'nxrt-headbar' },
      $('div', { class: 'nxrt-title' }, [
        $('b', {}, '运行设置'),
        $('span', { class: 'nxrt-sub' }, '模型 · 权限'),
      ]),
      $('button', {
        class: 'nxrt-cluster', type: 'button', title: '打开 Agent 集群', 'aria-label': 'Agent 集群',
        onclick: function () { if (window.__nxCluster && typeof window.__nxCluster.show === 'function') window.__nxCluster.show(); },
      }, 'Agent 集群'),
      $('button', { class: 'nxrt-close', type: 'button', title: '关闭', 'aria-label': '关闭', onclick: hide }, '×'));
    body = $('div', { class: 'nxrt-body' });
    panel.append(head, body);
    os.append(panel);

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      if (target.closest('.os-cmd-chip')) {
        event.stopImmediatePropagation();
        event.preventDefault();
        show();
        return;
      }
      if (open && panel && !panel.contains(target) && !target.closest('.nxrt-panel')) hide();
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        hide();
      }
    }, true);

    window.addEventListener('resize', function () { if (open) place(); });
    var chipWatcher = window.setInterval(function () {
      var next = document.querySelector('.os-cmd-chip');
      if (next !== chip) {
        chip = next;
        if (open) place();
      }
    }, 800);
    window.addEventListener('pagehide', function () { window.clearInterval(chipWatcher); }, { once: true });
  }

  function start() {
    var tick = 0;
    var wait = function () {
      if (document.querySelector('.os-cmd-chip')) { build(); return; }
      tick += 1;
      if (tick < 100) window.setTimeout(wait, 120);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
