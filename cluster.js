/* NexlOS plugin-edition layer: the DSH Agent Cluster.
 *
 * This file is injected only into the top WebOS document (never into the
 * embedded app windows). It reads the already-installed AgentTeams plugin's
 * public activity snapshot route — disk truth plus live member activity — and
 * renders it as a NexlOS floating window. Minimizing leaves a right-edge bubble;
 * clicking a member asks the DSH shell to open that member's session.
 */
(function () {
  'use strict';
  if (window.__nxClusterApi) return;
  window.__nxClusterApi = true;

  var STORE = 'nexlos.os.';
  var KEY_OPEN = 'nexlos.cluster.open';
  var KEY_CLOSED = 'nexlos.cluster.closed';
  var KEY_POS = 'nexlos.cluster.pos';
  var KEY_TEAM = 'nexlos.cluster.team';
  var KEY_SWARM = 'nexlos.cluster.swarm';
  var POLL_MS = 2200;
  var stateRoute = '/plugins/dsh-agent-teams/state';

  var os = null;
  var panel = null;
  var bubble = null;
  var body = null;
  var title = null;
  var sub = null;
  var select = null;
  var selectWrap = null;
  var membersBox = null;
  var tasksBox = null;
  var feedBox = null;
  var countBox = null;
  var statusBox = null;
  var captainBtn = null;
  var teams = [];
  var selectedTeamId = '';
  var lastHash = '';
  var timer = 0;
  var pollAbort = null;
  var pollInFlight = false;
  var loaded = false;
  var failure = '';
  var drag = null;
  var autoOpened = {};
  var swarm = read(KEY_SWARM, '0') === '1';
  var swarmWrap = null;
  var swarmInput = null;
  var swarmModal = null;
  var swarmId = '';
  var swarmText = '';
  var swarmAgents = [];

  function $(tag, attrs) {
    var kids = Array.prototype.slice.call(arguments, 2);
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'html') el.innerHTML = value;
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

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : raw;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (error) { /* private mode */ }
  }

  function shortId(id) {
    var value = String(id || '').replace(/[^a-zA-Z0-9]/g, '');
    return value.slice(0, 8) || '—';
  }

  function mark(edge) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('width', String(edge || 18));
    svg.setAttribute('height', String(edge || 18));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    [
      ['#EF4B23', 'M33.92,16 105.6,16 105.6,33.92 123.52,33.92 123.52,51.84 141.44,51.84 141.44,87.68 105.6,87.68 105.6,69.76 87.68,69.76 87.68,51.84 51.84,51.84 51.84,98.56 16,98.56 16,33.92 33.92,33.92Z'],
      ['#73B534', 'M240,33.92 240,105.6 222.08,105.6 222.08,123.52 204.16,123.52 204.16,141.44 168.32,141.44 168.32,105.6 186.24,105.6 186.24,87.68 204.16,87.68 204.16,51.84 157.44,51.84 157.44,16 222.08,16 222.08,33.92Z'],
      ['#F4D632', 'M222.08,240 150.4,240 150.4,222.08 132.48,222.08 132.48,204.16 114.56,204.16 114.56,168.32 150.4,168.32 150.4,186.24 168.32,186.24 168.32,204.16 204.16,204.16 204.16,157.44 240,157.44 240,222.08 222.08,222.08Z'],
      ['#438FD2', 'M16,222.08 16,150.4 33.92,150.4 33.92,132.48 51.84,132.48 51.84,114.56 87.68,114.56 87.68,150.4 69.76,150.4 69.76,168.32 51.84,168.32 51.84,204.16 98.56,204.16 98.56,240 33.92,240 33.92,222.08Z'],
    ].forEach(function (row) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', row[0]);
      path.setAttribute('d', row[1]);
      svg.append(path);
    });
    return svg;
  }

  function isWorking(team) {
    if (!team) return false;
    return (team.members || []).some(function (m) { return m.activity === 'working' || m.status === 'working'; }) ||
      (team.tasks || []).some(function (t) { return t.state === 'running' || t.status === 'in_progress'; });
  }

  function unfinished(team) {
    return (team && team.tasks ? team.tasks : []).filter(function (t) {
      return t.state === 'running' || t.state === 'open' || t.state === 'blocked' ||
        t.status === 'pending' || t.status === 'claimed' || t.status === 'in_progress';
    }).length;
  }

  function pickTeam() {
    var saved = read(KEY_TEAM, '');
    var hit = teams.filter(function (team) { return team.teamId === saved; })[0];
    if (hit) return hit;
    var active = teams.filter(isWorking)[0];
    if (active) return active;
    return teams[0] || null;
  }

  function teamHash(team) {
    if (!team) return 'none';
    return JSON.stringify([
      team.teamId, team.phase, team.halted, team.planReviewState,
      (team.members || []).map(function (m) { return [m.id, m.name, m.status, m.activity, m.currentTask, m.progress, m.done, m.total, m.unread]; }),
      (team.tasks || []).map(function (t) { return [t.id, t.status, t.state, t.assignee, t.verdict]; }),
      (team.captainInbox || []).map(function (m) { return [m.from, m.content]; }),
      swarmId,
      swarmAgents.map(function (a) { return [a.id, a.status, a.steps, a.current && a.current.kind, a.current && a.current.text]; }),
    ]);
  }

  function agentStateLabel(agent) {
    var now = agent.current || {};
    if (agent.status === 'running') {
      if (now.kind === 'tool') return (now.name || '工具') + (now.text ? ' · ' + String(now.text).slice(0, 80) : '');
      return now.kind === 'thinking' ? '思考中' : '工作中';
    }
    if (agent.ended || agent.status === 'done') return now.kind === 'message' && now.text ? String(now.text).slice(0, 80) : '已交付';
    return '空闲';
  }

  function swarmRow(agent) {
    var running = agent.status === 'running';
    var node = $('div', { class: 'nxcl-member' + (running ? ' is-working is-clickable' : '') },
      $('span', { class: 'nxcl-dot' + (running ? ' is-live' : '') }),
      $('div', { class: 'nxcl-member-main' },
        $('div', { class: 'nxcl-member-name' }, $('b', {}, agent.label || agent.id)),
        $('div', { class: 'nxcl-member-meta' }, agentStateLabel(agent) + (agent.steps ? ' · ' + agent.steps + ' 步' : ''))),
      $('span', { class: 'nxcl-go' }, '↗'));
    node.addEventListener('click', function () {
      var popup = window.__nxChatPopup;
      if (popup && typeof popup.open === 'function') {
        popup.open({ sessionId: agent.id, title: agent.label || '蜂群成员', canWrite: false });
      }
    });
    return node;
  }

  async function refreshSwarm() {
    if (!swarmId) { swarmAgents = []; return; }
    try {
      var response = await fetch('/agent/agents?swarmId=' + encodeURIComponent(swarmId), { cache: 'no-store' });
      var data = await response.json().catch(function () { return null; });
      if (response.ok && data && data.ok && Array.isArray(data.agents)) {
        swarmAgents = data.agents;
        return;
      }
      swarmAgents = [];
    } catch (error) {
      swarmAgents = [];
    }
  }

  function showPanel() {
    write(KEY_CLOSED, '0');
    write(KEY_OPEN, '1');
    if (panel) panel.hidden = false;
    if (bubble) bubble.hidden = true;
    setTimeout(function () {
      if (read(KEY_POS, '') === '') defaultPosition();
      if (panel && !panel.hidden) {
        var rect = panel.getBoundingClientRect();
        applyPosition(rect.left, rect.top);
      }
    }, 0);
    schedulePoll(0);
  }

  function minimizePanel() {
    write(KEY_CLOSED, '0');
    write(KEY_OPEN, '0');
    if (panel) panel.hidden = true;
    if (bubble) bubble.hidden = false;
    schedulePoll(12000);
  }

  function closePanel() {
    write(KEY_CLOSED, '1');
    write(KEY_OPEN, '0');
    if (panel) panel.hidden = true;
    if (bubble) bubble.hidden = true;
    if (pollAbort !== null) { try { pollAbort.abort(); } catch (_error) { /* already done */ } pollAbort = null; }
    schedulePoll(0);
  }

  function setOpen(open) {
    if (open) showPanel();
    else minimizePanel();
  }

  function applyPosition(left, top) {
    if (!panel) return;
    var maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    var maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 100);
    var x = Math.min(Math.max(8, left), maxLeft);
    var y = Math.min(Math.max(8, top), maxTop);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    write(KEY_POS, JSON.stringify({ left: x, top: y }));
  }

  function defaultPosition() {
    if (!panel) return;
    var width = panel.offsetWidth || 336;
    var height = panel.offsetHeight || 420;
    var left = window.innerWidth - width - 18;
    var top = window.innerHeight - height - 104;
    var saved = null;
    try { saved = JSON.parse(read(KEY_POS, 'null')); } catch (error) { saved = null; }
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') applyPosition(saved.left, saved.top);
    else applyPosition(left, top);
  }

  function row(className, kids) {
    return $( 'div', { class: className }, kids);
  }

  function memberRow(member, team) {
    var working = member.activity === 'working' || member.status === 'working';
    var openSession = !!member.id && (/^session-/u.test(member.id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(member.id));
    var route = member.model || '';
    var progress = Math.max(0, Math.min(100, Number(member.progress) || 0));
    var currentNode = $('div', { class: 'nxcl-member' + (working ? ' is-working' : '') + (openSession ? ' is-clickable' : '') },
      $('span', { class: 'nxcl-dot' + (working ? ' is-live' : '') }),
      $('div', { class: 'nxcl-member-main' },
        $('div', { class: 'nxcl-member-name' }, [
          $('b', {}, member.name || '成员'),
          member.role ? $('i', {}, member.role) : null,
          member.unread > 0 ? $('em', { class: 'nxcl-unread' }, String(member.unread)) : null,
        ]),
        $('div', { class: 'nxcl-member-meta' },
          (member.currentTask ? member.currentTask : (working ? '执行中' : '空闲')) +
          (member.total ? ' · ' + String(member.done || 0) + '/' + String(member.total) : '') +
          (route ? ' · ' + route : '')),
        member.total ? $('span', { class: 'nxcl-progress' }, [
          $('i', { style: 'width:' + progress + '%' }),
        ]) : null,
      ),
      openSession ? $('span', { class: 'nxcl-go' }, '↗') : null);
    if (openSession) {
      currentNode.title = '在 DSH 对话里打开 ' + (member.name || '该成员');
      currentNode.addEventListener('click', function () {
        var popup = window.__nxChatPopup;
        if (popup && typeof popup.open === 'function') {
          popup.open({ sessionId: member.id, title: member.name || '成员', canWrite: false });
        }
      });
    }
    return currentNode;
  }

  function taskRow(task, team) {
    var state = task.state || task.status || 'open';
    var owner = task.assignee || '待认领';
    var deps = (task.dependencies || []).filter(function (id) {
      var dep = (team.tasks || []).filter(function (t) { return t.id === id; })[0];
      return dep && dep.state !== 'completed';
    });
    return $('div', { class: 'nxcl-task is-' + state },
      $('span', { class: 'nxcl-task-mark' }, state === 'completed' ? '✓' : state === 'failed' ? '×' : state === 'running' ? '›' : '·'),
      $('span', { class: 'nxcl-task-subject' }, task.subject || task.id),
      $('span', { class: 'nxcl-task-owner' }, owner + (deps.length ? ' · 阻塞 ' + deps.length : '')),
    );
  }

  function feedRow(message) {
    return $('div', { class: 'nxcl-feed' },
      $('b', {}, message.from || 'captain'),
      $('span', {}, String(message.content || '').slice(0, 240)));
  }

  function syncSelect(team) {
    if (!select) return;
    var signature = teams.map(function (t) { return t.teamId + ':' + (t.name || ''); }).join('|');
    if (select.dataset.sig === signature) return;
    select.dataset.sig = signature;
    select.replaceChildren();
    teams.forEach(function (t) {
      var option = document.createElement('option');
      option.value = t.teamId;
      option.textContent = (t.name || t.teamId) + (isWorking(t) ? ' · 运行中' : '');
      select.append(option);
    });
    if (team) select.value = team.teamId;
  }

  function renderBubble(team) {
    if (!bubble) return;
    var badge = bubble.querySelector('.nxcl-bubble-count');
    var n = team ? unfinished(team) : 0;
    var live = isWorking(team) || (team && team.phase === 'staged');
    bubble.classList.toggle('is-live', !!live);
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    bubble.title = team
      ? (team.name || 'Agent 集群') + (n ? ' · ' + n + ' 个未完成任务' : ' · 空闲')
      : 'Agent 集群';
  }

  function render(team) {
    if (!body) return;
    syncSelect(team);
    renderBubble(team);
    if (!team) {
      title.textContent = 'Agent 集群';
      sub.textContent = failure || (loaded ? '暂无团队' : '连接中…');
      statusBox.className = 'nxcl-state';
      statusBox.textContent = loaded ? '待命' : '…';
      body.replaceChildren($('div', { class: 'nxcl-empty' },
        $('div', { class: 'nxcl-empty-mark' }, mark(38)),
        $('b', {}, loaded ? '还没有 Agent 集群' : '正在读取 Agent 集群'),
        $('p', {}, failure || '在命令栏里让 Agent 组建团队后，这里会实时显示队长、成员、任务与邮箱动态。')));
      if (countBox) countBox.hidden = true;
      if (captainBtn) captainBtn.hidden = true;
      if (selectWrap) selectWrap.hidden = teams.length <= 1;
      return;
    }
    var working = isWorking(team);
    title.textContent = team.name || 'Agent 集群';
    sub.textContent = (team.workspace || '') + (team.halted ? ' · 已暂停' : team.phase === 'staged' ? ' · 待批准' : ' · ' + (working ? '运行中' : '空闲')) + (swarm ? ' · 蜂群模式' : '');
    statusBox.className = 'nxcl-state' + (working ? ' is-live' : '') + (team.halted ? ' is-halted' : '');
    statusBox.textContent = team.halted ? '已暂停' : team.phase === 'staged' ? '待批准' : working ? '运行中' : '空闲';
    if (countBox) {
      var n = unfinished(team);
      countBox.hidden = n === 0;
      countBox.textContent = String(n);
    }
    if (select) {
      if (selectWrap) selectWrap.hidden = teams.length <= 1;
      if (select.value !== team.teamId) select.value = team.teamId;
    }
    var roomMembers = (team.members || []).filter(function (m) { return m && typeof m.id === 'string' && m.id !== ''; });
    captainBtn.textContent = swarm ? '蜂群广播' : '打开队长对话';
    captainBtn.title = swarm ? '把一条指令同时发给全部成员' : '打开队长对话';
    captainBtn.hidden = swarm ? roomMembers.length === 0 : !team.captainSessionId;
    captainBtn.dataset.sessionId = team.captainSessionId || '';
    if (swarmInput) swarmInput.checked = swarm;

    var members = (team.members || []).slice().sort(function (a, b) {
      var rank = function (m) { return m.activity === 'working' || m.status === 'working' ? 0 : 1; };
      return rank(a) - rank(b);
    });
    var tasks = (team.tasks || []).slice().sort(function (a, b) {
      var order = { running: 0, blocked: 1, open: 2, failed: 3, completed: 4, cancelled: 5 };
      return (order[a.state] == null ? 3 : order[a.state]) - (order[b.state] == null ? 3 : order[b.state]);
    });
    var feed = (team.captainInbox || []).slice(-4).reverse();

    var head = team.description || '';
    var children = [
      swarm ? $('div', { class: 'nxcl-swarm-hint' }, '蜂群模式：一条指令会并行唤醒全部成员；队长仍负责汇总与收口。') : null,
      head ? $('p', { class: 'nxcl-desc' }, head) : null,
      $('div', { class: 'nxcl-stats' },
        $('span', {}, [$('b', {}, String(members.length)), ' 成员']),
        $('span', {}, [$('b', {}, String(tasks.filter(function (t) { return t.state === 'completed'; }).length)), '/', String(tasks.length), ' 任务']),
        team.messageCount ? $('span', {}, [String(team.messageCount), ' 消息']) : null),
      swarmId ? $('div', { class: 'nxcl-section' }, [
        $('div', { class: 'nxcl-section-head' }, '蜂群活动 · ' + String(swarmAgents.filter(function (a) { return a.status === 'running'; }).length) + '/' + String(swarmAgents.length) + ' 运行中'),
        swarmText ? $('p', { class: 'nxcl-desc' }, '指令：' + swarmText.slice(0, 120)) : null,
        ...(swarmAgents.length ? swarmAgents.map(swarmRow) : [$('div', { class: 'nxcl-none' }, '等待成员回报…')]),
      ]) : null,
      $('div', { class: 'nxcl-section' }, [
        $('div', { class: 'nxcl-section-head' }, '成员'),
        ...(members.length ? members.map(function (m) { return memberRow(m, team); }) : [$('div', { class: 'nxcl-none' }, '队长尚未派出成员')]),
      ]),
      $('div', { class: 'nxcl-section' }, [
        $('div', { class: 'nxcl-section-head' }, '任务 ' + String(tasks.filter(function (t) { return t.state === 'completed'; }).length) + '/' + String(tasks.length)),
        ...(tasks.length ? tasks.slice(0, 9).map(function (t) { return taskRow(t, team); }) : [$('div', { class: 'nxcl-none' }, '还没有任务')]),
        tasks.length > 9 ? $('div', { class: 'nxcl-none' }, '+' + String(tasks.length - 9) + ' 个任务') : null,
      ]),
      feed.length ? $('div', { class: 'nxcl-section' }, [
        $('div', { class: 'nxcl-section-head' }, '动态'),
        ...feed.map(feedRow),
      ]) : null,
    ].filter(Boolean);
    body.replaceChildren.apply(body, children);
    if (!panel.hidden) {
      var liveRect = panel.getBoundingClientRect();
      applyPosition(liveRect.left, liveRect.top);
    }
  }

  function schedulePoll(delay) {
    if (timer) { window.clearTimeout(timer); timer = 0; }
    if (document.hidden) return;
    if (read(KEY_CLOSED, '') === '1') return;
    var wait = delay;
    if (wait === undefined) wait = (panel && !panel.hidden) ? POLL_MS : 12000;
    timer = window.setTimeout(function () { timer = 0; void poll(); }, wait);
  }

  async function poll() {
    if (pollInFlight || document.hidden) { if (!pollInFlight) schedulePoll(); return; }
    if (read(KEY_CLOSED, '') === '1') { schedulePoll(0); return; }
    pollInFlight = true;
    var controller = new AbortController();
    pollAbort = controller;
    try {
      var response = await fetch(stateRoute, { cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var data = await response.json();
      teams = Array.isArray(data && data.teams) ? data.teams : [];
      failure = '';
      loaded = true;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      teams = [];
      failure = 'AgentTeams 未连接：' + (error && error.message ? error.message : String(error));
      loaded = true;
    } finally {
      if (pollAbort === controller) pollAbort = null;
      pollInFlight = false;
    }
    var team = pickTeam();
    if (team) {
      selectedTeamId = team.teamId;
      write(KEY_TEAM, selectedTeamId);
      if (read(KEY_CLOSED, '') !== '1' && read(KEY_OPEN, '') === '' && !autoOpened[selectedTeamId]) {
        autoOpened[selectedTeamId] = true;
        if (isWorking(team) || teams.length === 1) showPanel();
      }
    }
    if (swarmId) await refreshSwarm();
    var hash = teamHash(team);
    if (hash !== lastHash) {
      lastHash = hash;
      render(team);
    }
    // 蜂群成员在跑时拉快一点，让「在干什么」接近实时。
    schedulePoll(swarmId && swarmAgents.some(function (a) { return a.status === 'running'; }) ? 1500 : undefined);
  }

  function closeSwarmComposer() {
    if (swarmModal && swarmModal.parentNode) swarmModal.parentNode.removeChild(swarmModal);
    swarmModal = null;
  }

  function openSwarmComposer(team) {
    closeSwarmComposer();
    var members = (team.members || []).filter(function (m) { return m && typeof m.id === 'string' && m.id !== ''; });
    if (members.length === 0) return;
    var area = $('textarea', {
      class: 'nxcl-swarm-text', rows: '4',
      placeholder: '给 ' + members.length + ' 位成员同时下一条指令…',
      onkeydown: function (event) {
        if (event.key === 'Escape') closeSwarmComposer();
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') send();
      },
    });
    var feedback = $('p', { class: 'nxcl-swarm-feedback' }, '成员会并行收到这条指令；队长不重复接收。');
    var sendBtn = $('button', { class: 'nxcl-swarm-send', type: 'button' }, '同时发送给 ' + members.length + ' 位成员');
    var busy = false;
    function send() {
      if (busy) return;
      var text = area.value.trim();
      if (text === '') { feedback.textContent = '先写一条指令。'; return; }
      busy = true;
      sendBtn.disabled = true;
      feedback.textContent = '正在投递…';
      fetch('/agent/swarm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text, captainSessionId: team.captainSessionId || '', members: members.map(function (m) { return { id: m.id, name: m.name || '' }; }) }),
      }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (!response.ok || !data || data.ok !== true) throw new Error((data && data.error) || ('HTTP ' + response.status));
          var done = (data.delivered || []).length;
          var failed = (data.failed || []).length;
          if (typeof data.swarmId === 'string' && data.swarmId !== '') {
            swarmId = data.swarmId;
            swarmText = text;
            void refreshSwarm().then(function () {
              lastHash = '';
              var current = teams.filter(function (t) { return t.teamId === selectedTeamId; })[0] || null;
              render(current);
            });
          }
          feedback.textContent = '已投递 ' + done + ' 位' + (failed ? '，失败 ' + failed + ' 位' : '') + '。';
          setTimeout(function () {
            closeSwarmComposer();
            schedulePoll(500);
          }, 900);
        });
      }).catch(function (error) {
        feedback.textContent = '投递失败：' + (error && error.message ? error.message : String(error));
      }).finally(function () {
        busy = false;
        sendBtn.disabled = false;
      });
    }
    sendBtn.addEventListener('click', send);
    var card = $('section', { class: 'nxcl-swarm-card', role: 'dialog', 'aria-label': '蜂群广播' },
      $('header', { class: 'nxcl-swarm-head' }, [
        $('div', {}, [
          $('b', {}, '蜂群广播'),
          $('span', {}, (team.name || 'Agent 团队') + ' · ' + members.length + ' 位成员'),
        ]),
        $('button', { class: 'nxcl-btn', type: 'button', title: '关闭', 'aria-label': '关闭', onclick: closeSwarmComposer }, '×'),
      ]),
      area,
      feedback,
      $('div', { class: 'nxcl-swarm-actions' }, [
        $('button', { class: 'nxcl-swarm-cancel', type: 'button', onclick: closeSwarmComposer }, '取消'),
        sendBtn,
      ]));
    swarmModal = $('div', { class: 'nxcl-swarm-overlay', role: 'presentation' }, card);
    swarmModal.addEventListener('click', function (event) {
      if (event.target === swarmModal) closeSwarmComposer();
    });
    os.append(swarmModal);
    setTimeout(function () { area.focus(); }, 30);
  }

  function build() {
    os = document.querySelector('.os') || document.body;

    panel = $('section', { class: 'nxcl-panel', role: 'dialog', 'aria-label': 'NexlOS Agent 集群', hidden: true });
    var left = read(KEY_POS, '');
    var saved = null;
    try { saved = JSON.parse(left || 'null'); } catch (error) { saved = null; }
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      panel.style.left = saved.left + 'px';
      panel.style.top = saved.top + 'px';
    }

    var head = $('header', { class: 'nxcl-head' },
      $('span', { class: 'nxcl-mark' }, mark(21)),
      $('div', { class: 'nxcl-titles' }, [
        title = $('b', { class: 'nxcl-title' }, 'Agent 集群'),
        sub = $('span', { class: 'nxcl-sub' }, '连接中…'),
      ]),
      statusBox = $('span', { class: 'nxcl-state' }, '…'),
      countBox = $('em', { class: 'nxcl-count', hidden: true }, '0'),
      $('button', { class: 'nxcl-btn', type: 'button', title: '收起为气泡', 'aria-label': '收起为气泡', onclick: minimizePanel }, '–'),
    );
    selectWrap = $('label', { class: 'nxcl-selectwrap' }, [
      $('span', {}, '团队'),
      select = $('select', { class: 'nxcl-select', 'aria-label': '选择团队' }),
    ]);
    select.addEventListener('change', function () {
      selectedTeamId = select.value;
      write(KEY_TEAM, selectedTeamId);
      var team = teams.filter(function (t) { return t.teamId === selectedTeamId; })[0] || null;
      lastHash = '';
      render(team);
    });
    captainBtn = $('button', {
      class: 'nxcl-open', type: 'button', hidden: true,
      onclick: function () {
        var team = teams.filter(function (t) { return t.teamId === selectedTeamId; })[0];
        if (!team) return;
        if (swarm) { openSwarmComposer(team); return; }
        var id = captainBtn.dataset.sessionId || '';
        if (!id) return;
        var popup = window.__nxChatPopup;
        if (popup && typeof popup.open === 'function') {
          popup.open({ sessionId: id, title: (team.name || 'Agent 团队') + ' · 队长', canWrite: true });
        }
      },
    }, '打开队长对话');
    swarmInput = $('input', {
      type: 'checkbox', class: 'nxcl-swarm-input', 'aria-label': '蜂群开关',
      onchange: function (event) {
        swarm = event.target.checked;
        write(KEY_SWARM, swarm ? '1' : '0');
        lastHash = '';
        var team = teams.filter(function (t) { return t.teamId === selectedTeamId; })[0];
        render(team);
      },
    });
    if (swarm) swarmInput.checked = true;
    swarmWrap = $('label', { class: 'nxcl-swarm', title: '蜂群模式：一条指令同时唤醒全部成员；关闭后只打开队长对话' },
      $('span', { class: 'nxcl-swarm-label' }, '蜂群'),
      swarmInput,
      $('i', { class: 'nxcl-switch', 'aria-hidden': 'true' }));
    var tools = $('div', { class: 'nxcl-tools' }, [
      selectWrap,
      swarmWrap,
      captainBtn,
      $('button', {
        class: 'nxcl-btn nxcl-refresh', type: 'button', title: '立即刷新', 'aria-label': '立即刷新',
        onclick: function () { void poll(); },
      }, '↻'),
      $('button', {
        class: 'nxcl-btn', type: 'button', title: '关闭浮窗与气泡', 'aria-label': '关闭浮窗（保留气泡）',
        onclick: closePanel,
      }, '×'),
    ]);
    body = $('div', { class: 'nxcl-body' });
    panel.append(head, tools, body);
    os.append(panel);

    bubble = $('button', { class: 'nxcl-bubble', type: 'button', title: 'Agent 集群', 'aria-label': '打开 Agent 集群', hidden: true },
      mark(26),
      $('span', { class: 'nxcl-bubble-ring' }),
      $('span', { class: 'nxcl-bubble-count' }, '0'));
    bubble.addEventListener('click', showPanel);
    os.append(bubble);

    head.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || event.target.closest('button')) return;
      var rect = panel.getBoundingClientRect();
      drag = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      try { head.setPointerCapture(event.pointerId); } catch (error) { /* older engines */ }
      panel.classList.add('is-dragging');
    });
    head.addEventListener('pointermove', function (event) {
      if (!drag) return;
      applyPosition(event.clientX - drag.dx, event.clientY - drag.dy);
    });
    head.addEventListener('pointerup', function (event) {
      drag = null;
      panel.classList.remove('is-dragging');
      try { head.releasePointerCapture(event.pointerId); } catch (error) { /* already released */ }
    });
    head.addEventListener('pointercancel', function () {
      drag = null;
      panel.classList.remove('is-dragging');
    });

    bubble.hidden = false;
    bubble.querySelector('.nxcl-bubble-count').hidden = true;
    var savedOpen = read(KEY_OPEN, '');
    if (read(KEY_CLOSED, '') === '1') { panel.hidden = true; bubble.hidden = true; }
    else if (savedOpen === '1') showPanel();
    else { panel.hidden = true; bubble.hidden = false; }
    window.addEventListener('resize', function () { defaultPosition(); });
    void poll();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) schedulePoll(0);
      else { void poll(); }
    });
    document.addEventListener('keydown', function (event) {
      if (!(event.shiftKey && (event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k')) return;
      event.preventDefault();
      if (panel && !panel.hidden) minimizePanel();
      else showPanel();
    }, true);
    window.addEventListener('message', function (event) {
      if (event.origin !== location.origin) return;
      if (event.data && event.data.type === 'nexlos.cluster-show') showPanel();
    });
    window.__nxCluster = { show: showPanel, minimize: minimizePanel, close: closePanel };
    setTimeout(function () { defaultPosition(); }, 30);
  }

  function start() {
    var tick = 0;
    var wait = function () {
      if (document.querySelector('.os')) {
        build();
        return;
      }
      tick += 1;
      if (tick < 80) window.setTimeout(wait, 120);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
