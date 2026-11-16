// 时间与声音族：FilmCraft（剪辑）、EffectCraft（合成）、
// AniCraft（逐帧动画）、SoundCraft（多轨混音）。
// 界面参照的工作流类型见 docs/artcraftport/ATTRIBUTION.md。
import { t as i18nText } from '/a/i18n.js';
import { sampleChannel } from './engine/keyframe.js';
import { createMasteringChain, bufferPeak, clampPeak, MASTER_OUTPUT_HEADROOM, rmsBuckets, fillNoise } from './engine/audio.js';
import { loadDoc, saveDoc, parseDoc } from './engine/doc.js';
import { projectJson, wavBlob } from './export.js';
import {
  TRACKS, SNAP, MIN_DUR, EDGE_HOT,
  snap, clipDur, clampStart, moveStart, hitEdge, trimLeft, trimRight, legalTrack, overlaps,
} from './engine/timeline.js';
import {
  h, clear, craft, craftShell, saveCanvas, download, pickFile, readFileText, icon, iconButton,
  panel, sectionLabel, sliderRow, colorRow, toastIn, commandScope, clamp,
  selectField,
} from './kernel.js';

const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

function fmtTime(t) {
  const s = Math.max(0, t);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ff = Math.floor((s % 1) * 30);
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss + ':' + (ff < 10 ? '0' : '') + ff;
}

/* ============================ FilmCraft：剪辑 ============================ */

craft({
  id: 'filmcraft', name: 'FilmCraft', up: '剪辑 · 时间线', group: 'time', tag: '剪辑',
  blurb: '素材箱、源/节目监视器、时间线与抽帧导出。',
  hint: '双击素材放到时间线；拖标尺找镜头',
  mount(host) {
    const shell = craftShell(host, {
      name: 'FilmCraft', file: '未命名项目', up: '剪辑 · 时间线', tag: 'ASSEMBLY',
      theme: 'dark', layout: 'premiere', center: true,
    });
    const MEDIA = [
      { id: 'm1', name: 'Night of the Living Dead', kind: 'bars', color: '#3d5a80', dur: 4 },
      { id: 'm2', name: 'Carnival of Souls', kind: 'circles', color: '#7a4a6a', dur: 3 },
      { id: 'm3', name: 'Earth Views', kind: 'wave', color: '#2f6f5f', dur: 5 },
      { id: 'm4', name: 'Chopin - Nocturne', kind: 'audio', color: '#2f7a5f', dur: 6 },
      { id: 'm5', name: 'Trailer Title', kind: 'title', color: '#7a5a2f', dur: 3 },
    ];
    // 片段：{ media, start, track, in, out }。in/out 是相对素材的秒数，
    // 片段在时间线上的可见时长固定为 out - in（初始为整段素材）。
    const timeline = [
      { media: MEDIA[0], start: 0, track: 'V1', in: 0, out: MEDIA[0].dur },
      { media: MEDIA[2], start: 4, track: 'V1', in: 0, out: MEDIA[2].dur },
      { media: MEDIA[1], start: 1, track: 'V2', in: 0, out: MEDIA[1].dur },
      { media: MEDIA[3], start: 0, track: 'A1', in: 0, out: MEDIA[3].dur },
    ];
    const DUR = 10;
    const TL_RULER_H = 18;   // 与 .ag-tl-ruler 的 height 一致
    const TL_LANE_H = 32;    // 与 .ag-tl-lane 的 height 一致
    let current = 0;
    let playing = false;
    let timer = 0;
    let selectedClip = -1;
    let tlPlayhead = null;
    let lanesEl = null;      // 当前时间线的轨道容器，拖拽时用来换算坐标
    let drag = null;         // 当前拖拽会话；null 表示未在拖拽

    // 工程存档只记素材 id 与时间参数；素材本身是程序生成的，不需要落盘。
    let saveTimer = 0;
    function projectDoc() {
      return {
        timebase: 'seconds',
        clips: timeline.map((e) => ({ id: e.media.id, start: e.start, track: e.track, in: e.in, out: e.out })),
        current: current,
        selected: selectedClip,
      };
    }
    function persist() {
      saveTimer = 0;
      saveDoc('filmcraft', projectDoc());
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 600);
    }
    function validClip(c) {
      return !!c && typeof c.id === 'string' && isFinite(c.start) && isFinite(c.in) && isFinite(c.out)
        && c.out > c.in && (c.track === 'V1' || c.track === 'V2' || c.track === 'A1');
    }
    function applyProject(doc) {
      const list = Array.isArray(doc && doc.clips) ? doc.clips.filter(validClip) : [];
      if (!list.length) return false;
      timeline.length = 0;
      list.forEach((c) => {
        const media = MEDIA.filter((m) => m.id === c.id)[0];
        if (!media) return; // 旧存档引用了已下架的素材：跳过而不是崩
        timeline.push({
          media: media,
          start: clamp(c.start, 0, DUR),
          track: c.track,
          in: clamp(c.in, 0, media.dur),
          out: clamp(c.out, 0, media.dur),
        });
      });
      current = isFinite(doc.current) ? clamp(doc.current, 0, DUR) : 0;
      selectedClip = -1;
      return true;
    }
    function exportProjectFile() {
      download('filmcraft.agrft.json', projectJson('filmcraft', projectDoc()), 'application/json');
      toastIn(shell.root, '工程文件已导出');
    }
    function openProjectFile() {
      pickFile('.json,application/json', (file) => {
        if (!file) return;
        readFileText(file, (text) => {
          const shellDoc = parseDoc(text);
          if (!shellDoc || !applyProject(shellDoc.doc)) { toastIn(shell.root, '不是有效的 FilmCraft 工程文件'); return; }
          renderTimeline();
          paintProgram();
          persist();
          toastIn(shell.root, '工程已打开 · ' + timeline.length + ' 片段');
        });
      });
    }

    const bin = h('aside', { class: 'ag-bin' });    const center = h('div', { class: 'ag-canvas-center' });
    const monitors = h('div', { class: 'ag-monitor-row' });
    const sourceM = h('div', { class: 'ag-monitor' });
    const programM = h('div', { class: 'ag-monitor' });
    const tl = h('div', { class: 'ag-timeline' });
    center.append(monitors, tl);
    shell.body.append(bin, center);

    const SCAN_W = 400, SCAN_H = 225;
    const prog = h('canvas', { width: 640, height: 360, style: 'width:100%;height:auto;max-height:100%;display:block' });
    const src = h('canvas', { width: 640, height: 360, style: 'width:100%;height:auto;max-height:100%;display:block' });
    sourceM.append(
      h('div', { class: 'ag-monitor-head' }, '源监视器', h('span', { class: 'ag-spacer' }), '1200 × 675'),
      h('div', { class: 'ag-monitor-body' }, src),
      h('div', { class: 'ag-monitor-bar' }, '00:00:00:00', h('span', { class: 'ag-spacer' }), '适应'));
    programM.append(
      h('div', { class: 'ag-monitor-head' }, '节目监视器', h('span', { class: 'ag-spacer' }), '序列 01'),
      h('div', { class: 'ag-monitor-body' }, prog),
      h('div', { class: 'ag-monitor-bar' }, h('span', { class: 'ag-progtime' }, fmtTime(0)), h('span', { class: 'ag-spacer' }), '1/2 · 适应'));
    monitors.append(sourceM, programM);

    const pg = prog.getContext('2d');
    const sg = src.getContext('2d');

    function drawClip(g, media, w, h, t, localLabel) {
      const r = Math.min(w, h);
      g.fillStyle = media.kind === 'title' ? '#101010' : '#141414';
      g.fillRect(0, 0, w, h);
      if (media.kind === 'bars') {
        const cols = ['#d8d8d8', '#d8d020', '#20d8d8', '#20d820', '#d820d8', '#d82020', '#2020d8'];
        cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / cols.length, 0, w / cols.length + 1, h * 0.72); });
        g.fillStyle = '#111'; g.fillRect(0, h * 0.72, w, h * 0.28);
        g.fillStyle = '#e0e0e0'; g.font = '600 22px ' + FONT;
        g.fillText(media.name, 24, h * 0.86);
        // 轻微的电影颗粒与门光
        g.fillStyle = 'rgba(255,255,255,.04)';
        for (let i = 0; i < 120; i++) g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      } else if (media.kind === 'circles') {
        for (let i = 0; i < 8; i++) {
          g.beginPath();
          g.arc(w / 2 + Math.cos(t * 1.4 + i) * r * 0.3, h / 2 + Math.sin(t * 1.1 + i) * r * 0.22, r * (0.05 + i * 0.015), 0, Math.PI * 2);
          g.fillStyle = 'rgba(210,170,220,' + (0.1 + i * 0.05).toFixed(2) + ')';
          g.fill();
        }
        g.fillStyle = 'rgba(240,235,240,.85)'; g.font = '600 20px ' + FONT;
        g.fillText(media.name, 24, h - 28);
      } else if (media.kind === 'wave') {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0d2233'); grad.addColorStop(1, '#1d4a5f');
        g.fillStyle = grad; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2f6f5f';
        g.beginPath();
        g.arc(w / 2, h / 2, r * 0.27, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(180,230,210,.5)';
        g.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          g.beginPath();
          g.arc(w / 2, h / 2, r * (0.3 + i * 0.025), 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = '#d7f0e6'; g.font = '600 20px ' + FONT;
        g.fillText(media.name, 24, h - 28);
      } else if (media.kind === 'audio') {
        g.fillStyle = '#0c1412'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#4fd0a0'; g.lineWidth = 1.4;
        g.beginPath();
        for (let x = 0; x < w; x += 2) {
          const env = Math.sin(x * 0.02 + t * 3) * Math.sin(x * 0.004);
          g.lineTo(x, h / 2 + env * h * 0.3);
        }
        g.stroke();
        g.fillStyle = '#9fe8c8'; g.font = '600 18px ' + FONT;
        g.fillText(media.name, 20, 28);
      } else {
        // 片头字幕
        const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, r * 0.7);
        grd.addColorStop(0, '#3a2a14'); grd.addColorStop(1, '#080808');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        g.fillStyle = '#f0e2c0';
        g.font = '700 ' + Math.round(h * 0.11) + 'px ' + FONT;
        g.textAlign = 'center';
        g.fillText('CAREFUL', w / 2, h / 2 - h * 0.02);
        g.font = '400 ' + Math.round(h * 0.035) + 'px ' + FONT;
        g.fillStyle = '#c8b890';
        g.fillText('a film by you', w / 2, h / 2 + h * 0.1);
        g.textAlign = 'left';
      }
      if (localLabel) {
        g.fillStyle = media.kind === 'title' ? '#f0e2c0' : '#e8e8e8';
        g.font = '600 13px ' + FONT;
        g.fillText(localLabel, 18, 26);
      }
    }

    function drawFrame(canvas, g, t) {
      const w = canvas.width, h = canvas.height;
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      let drawn = false;
      for (let i = timeline.length - 1; i >= 0; i--) {
        const e = timeline[i];
        if (e.track !== 'V1' && e.track !== 'V2') continue;
        const dur = clipDur(e);                 // 裁切后可见时长 = out - in
        if (t >= e.start && t < e.start + dur) {
          // 时间线时间 t 映射到素材时间：t - start 再加裁掉的入点 in。
          drawClip(g, e.media, w, h, t - e.start + e.in, e.media.name);
          drawn = true;
          break;
        }
      }
      if (!drawn) {
        g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#3a3a3a'; g.font = '12px ' + FONT;
        g.fillText(i18nText('无画面 · 把素材放到 V1'), 20, 30);
      }
    }

    function paintProgram() {
      drawFrame(prog, pg, current);
      const bar = programM.querySelector('.ag-progtime');
      if (bar) bar.textContent = fmtTime(current);
      shell.setStatus('序列 01 · ' + fmtTime(current) + ' / ' + fmtTime(DUR) + ' · ' + (playing ? '播放中' : '停止'));
      shell.setInfo('1200 × 675 · 30 fps');
      if (tlPlayhead) tlPlayhead.style.left = (current / DUR * 100) + '%';
      else renderTimeline();
    }

    /* ---- 素材箱 ---- */
    function renderBin() {
      clear(bin);
      bin.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '项目：未命名项目'), h('span', { class: 'ag-panel-caret' }, '5 项')));
      const grid = h('div', { class: 'ag-bin-grid' });
      MEDIA.forEach((m) => {
        const c = h('canvas', { class: 'ag-bin-thumb', width: 68, height: 40 });
        drawClip(c.getContext('2d'), m, 68, 40, 0.5, '');
        const b = h('button', { class: 'ag-bin-item', type: 'button', title: '双击加入时间线', onclick: () => showSource(m), ondblclick: () => addToTimeline(m) }, c, h('span', {}, m.name));
        grid.append(b);
      });
      bin.append(grid);
      bin.append(h('div', { class: 'ag-panel-body' },
        h('button', { class: 'ag-btn primary', type: 'button', onclick: () => addToTimeline(MEDIA[Math.floor(Math.random() * MEDIA.length)]) }, '插入到时间线')));
    }

    function showSource(m) {
      drawClip(sg, m, src.width, src.height, 0.6, m.name);
      sourceM.querySelector('.ag-monitor-head').firstChild.textContent = '源监视器 · ' + m.name;
      shell.setStatus('源监视器：' + m.name + ' · ' + m.dur + 's');
    }

    function addToTimeline(m) {
      const start = clampStart(Math.round(current * 10) / 10, DUR, m.dur);
      // 依次找一条在该位置没有重叠的轨道；三条都满就明确拒绝。
      // 旧逻辑只在「V1 同起点」时改用 V2，会把 V2 上已有的片段整个盖住，选不中也删不掉。
      let track = '';
      const order = ['V1', 'V2', 'A1'];
      for (let i = 0; i < order.length && !track; i++) {
        if (!overlaps(timeline, -1, start, order[i], m.dur)) track = order[i];
      }
      if (!track) {
        toastIn(shell.root, '当前位置三条轨道都已被占用，请换一个时间点再插入');
        return;
      }
      timeline.push({ media: m, start, track, in: 0, out: m.dur });
      scheduleSave();
      renderTimeline();
      paintProgram(); // 插入后节目监视器要立刻反映新片段
      shell.setStatus('已插入 ' + m.name + ' 到 ' + track);
    }

    /* ---- 时间线拖拽 ---- */
    // 拖拽会话在 window 上监听 move/up：指针移出片段也不会丢失拖拽。
    // 拖拽期间只改内存数据 + 单个片段的行内样式，不整表重建、不调 paintProgram，
    // 因此播放头保持不动；松手后再 renderTimeline() + paintProgram() 收口。

    // 按选中片段微调 start；同轨道重叠时拒绝（返回未变的 start）。
    function nudge(dir, big) {
      if (selectedClip < 0) return null;
      const e = timeline[selectedClip];
      const next = moveStart(e.start, dir * (big ? 1 : SNAP), DUR, clipDur(e));
      if (!overlaps(timeline, selectedClip, next, e.track, clipDur(e))) {
        e.start = next;
        scheduleSave();
        renderTimeline();
        paintProgram();
      }
      return e.start;
    }

    function beginDrag(ev, clipEl, i) {
      // 阻止冒泡到 lanes 的定位播放头逻辑；片段自己的拖拽优先。
      ev.stopPropagation();
      ev.preventDefault();
      selectedClip = i;
      const all = tl.querySelectorAll('.ag-tl-clip');
      for (let k = 0; k < all.length; k++) all[k].classList.remove('active');
      clipEl.classList.add('active');
      const e = timeline[i];
      const rect = clipEl.getBoundingClientRect();
      const lanesRect = lanesEl.getBoundingClientRect();
      drag = {
        i: i,
        mode: hitEdge(ev.clientX - rect.left, rect.width, EDGE_HOT),
        startX: ev.clientX,
        startY: ev.clientY,
        moved: false,
        orig: { start: e.start, in: e.in, out: e.out, track: e.track },
        lanesWidth: lanesRect.width,
        lanesTop: lanesRect.top,
        clipEl: clipEl,
      };
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragUp);
    }

    function onDragMove(ev) {
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      drag.moved = true;
      const e = timeline[drag.i];
      const deltaT = snap(dx / drag.lanesWidth * DUR, SNAP);
      if (drag.mode === 'move') {
        e.start = moveStart(drag.orig.start, deltaT, DUR, clipDur(e));
        e.in = drag.orig.in;
        e.out = drag.orig.out;
        // 跨轨道：按指针当前 Y 落在第几条轨道，夹到 V2/V1/A1。
        const laneIndex = Math.floor((ev.clientY - drag.lanesTop - TL_RULER_H) / TL_LANE_H);
        e.track = legalTrack(TRACKS, laneIndex);
      } else if (drag.mode === 'left') {
        const r = trimLeft(drag.orig.start, drag.orig.in, drag.orig.out, deltaT, MIN_DUR);
        e.start = r.start; e.in = r.in; e.out = r.out; e.track = drag.orig.track;
      } else {
        const r = trimRight(drag.orig.in, drag.orig.out, deltaT, e.media.dur, MIN_DUR);
        e.in = r.in; e.out = r.out; e.start = drag.orig.start; e.track = drag.orig.track;
      }
      // 行内样式即时反馈；不重建节点，避免中断 pointer 事件链。
      drag.clipEl.style.left = (e.start / DUR * 100) + '%';
      drag.clipEl.style.width = (clipDur(e) / DUR * 100) + '%';
    }

    function onDragUp() {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragUp);
      if (!drag) return;
      const d = drag;
      drag = null;
      // 横向拖动落下时做同轨道重叠检查：重叠则拒绝，还原拖拽前位置。
      if (d.moved && d.mode === 'move') {
        const e = timeline[d.i];
        if (overlaps(timeline, d.i, e.start, e.track, clipDur(e))) {
          e.start = d.orig.start;
          e.track = d.orig.track;
          // 随后的 paintProgram 会重写状态栏；提示走 toast，避免一闪而过看不到。
          toastIn(shell.root, '该位置与同轨道片段重叠，已取消移动');
        }
      }
      // 松手后才刷新节目监视器（用未变的 current 合成），播放头此刻才归位。
      scheduleSave();
      renderTimeline();
      paintProgram();
    }

    /* ---- 时间线 ---- */
    function renderTimeline() {
      clear(tl);
      tl.append(h('div', { class: 'ag-tl-head' },
        h('span', {}, '时间线：序列 01'), h('span', { class: 'ag-spacer' }),
        h('span', {}, TRACKS.join(' / '))));
      const body = h('div', { class: 'ag-tl-body' });
      const labels = h('div', { class: 'ag-tl-labels' }, h('div', { class: 'ag-tl-track-label', style: 'height:18px' }, ''));
      TRACKS.forEach((name) => labels.append(h('div', { class: 'ag-tl-track-label' }, name + ' · ' + name)));
      const lanes = h('div', { class: 'ag-tl-lanes' });
      lanesEl = lanes;
      const ruler = h('div', { class: 'ag-tl-ruler' });
      for (let s = 0; s <= DUR; s++) {
        ruler.append(h('div', { class: 'ag-tl-tick', style: 'left:' + (s / DUR * 100) + '%' }, String(s) + 's'));
      }
      lanes.append(ruler);
      const laneEls = {};
      TRACKS.forEach((name) => {
        const lane = h('div', { class: 'ag-tl-lane', 'data-lane': name });
        laneEls[name] = lane;
        lanes.append(lane);
      });
      timeline.forEach((e, i) => {
        const lane = laneEls[e.track];
        if (!lane) return;
        const clip = h('div', {
          class: 'ag-tl-clip' + (e.track === 'A1' ? ' audio' : '') + (e.media.kind === 'title' ? ' title' : '') + (i === selectedClip ? ' active' : ''),
          'data-clip': String(i),
          style: 'left:' + (e.start / DUR * 100) + '%;width:' + (clipDur(e) / DUR * 100) + '%',
          title: e.media.name,
          onpointerdown(ev) { beginDrag(ev, ev.currentTarget, i); },
        },
        e.media.name,
        h('div', { class: 'ag-tl-clip-edge left' }),
        h('div', { class: 'ag-tl-clip-edge right' }));
        lane.append(clip);
      });
      const playhead = h('div', { class: 'ag-playhead', style: 'left:' + (current / DUR * 100) + '%' });
      tlPlayhead = playhead;
      lanes.append(playhead);
      // 点击标尺 / 空白轨道定位播放头（片段自身的 pointerdown 已 stopPropagation）。
      lanes.addEventListener('pointerdown', (ev) => {
        if (ev.target.classList.contains('ag-tl-clip')) return;
        const r = lanes.getBoundingClientRect();
        current = clamp((ev.clientX - r.left) / r.width * DUR, 0, DUR);
        paintProgram();
      });
      body.append(labels, lanes);
      tl.append(body);
    }

    /* ---- 传输 ---- */
    const transport = h('div', { class: 'ag-monitor-bar' });
    function renderTransport() {
      clear(transport);
      transport.append(
        h('button', { class: 'ag-icbtn', type: 'button', title: '回到开头', onclick: () => { current = 0; paintProgram(); } }, icon('skipBack', 13)),
        h('button', { class: 'ag-icbtn', type: 'button', title: '播放/暂停', onclick: togglePlay }, icon(playing ? 'pause' : 'play', 13)),
        h('button', { class: 'ag-icbtn', type: 'button', title: '结尾', onclick: () => { current = DUR; paintProgram(); } }, icon('skipForward', 13)),
        h('span', { style: 'margin-left:8px;color:var(--ag-text-dim)' }, fmtTime(current)));
    }
    function togglePlay() {
      if (playing) { playing = false; clearInterval(timer); }
      else {
        playing = true;
        timer = setInterval(() => {
          current += 1 / 30;
          if (current >= DUR) { current = 0; }
          paintProgram();
        }, 33);
      }
      renderTransport();
    }
    shell.status.before(transport);
    renderTransport();

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', onClick: () => { persist(); toastIn(shell.root, '剪辑已保存到本机'); } },
        { label: '导出工程文件', onClick: exportProjectFile },
        { label: '打开工程文件', onClick: openProjectFile },
        { sep: true },
        { label: '导出当前帧 PNG', shortcut: '⌘S', onClick: () => { saveCanvas(prog, 'filmcraft-frame.png'); toastIn(shell.root, '当前帧已导出'); } },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '剪辑', items: [
        { label: '插入素材', onClick: () => addToTimeline(MEDIA[0]) },
        { label: '删除所选片段', disabled: selectedClip < 0, onClick: () => { if (selectedClip >= 0) timeline.splice(selectedClip, 1); selectedClip = -1; scheduleSave(); renderTimeline(); paintProgram(); } },
      ] },
      { label: '序列', items: [
        { label: playing ? '停止' : '播放', shortcut: 'Space', onClick: togglePlay },
      ] },
    ]);

    function onKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      // 选中片段后：←/→ 微调 0.1s，Shift+←/→ 微调 1s。
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selectedClip >= 0) { e.preventDefault(); nudge(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey); }
      }
      if (e.key === 'Delete' && selectedClip >= 0) { timeline.splice(selectedClip, 1); selectedClip = -1; scheduleSave(); renderTimeline(); paintProgram(); }
    }
    document.addEventListener('keydown', onKey);

    const scope = commandScope();
    scope.add('filmcraft.insert', '把第一段素材插入时间线', () => addToTimeline(MEDIA[0]));
    scope.add('filmcraft.save', '保存剪辑到本机', persist);
    scope.add('filmcraft.exportDoc', '导出 FilmCraft 工程文件', exportProjectFile);
    scope.add('filmcraft.openDoc', '打开 FilmCraft 工程文件', openProjectFile);
    scope.add('filmcraft.exportFrame', '导出当前帧', () => { saveCanvas(prog, 'filmcraft-frame.png'); });
    scope.add('filmcraft.state', '返回 {current, playing, selected, clips}', () => ({
      current: current,
      playing: playing,
      selected: selectedClip,
      clips: timeline.map((e, i) => ({
        i: i, track: e.track, start: e.start, in: e.in, out: e.out,
      })),
    }));
    scope.add('filmcraft.nudge', '按选中片段微调 start {dir, big}', (a) => {
      const dir = Number(a.dir) === -1 ? -1 : 1;
      return nudge(dir, !!a.big);
    });

    shell.root.addEventListener('nexlos.localechange', paintProgram);
    // 打开时恢复上次自动存档；缺字段或旧素材的脏档按条跳过，保留其余片段。
    (function restore() {
      const saved = loadDoc('filmcraft');
      if (saved && saved.doc) applyProject(saved.doc);
    })();
    showSource(MEDIA[0]);
    renderBin();
    paintProgram();
    return { destroy() {
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      clearInterval(timer);
      if (drag) {
        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', onDragUp);
        drag = null;
      }
      document.removeEventListener('keydown', onKey);
      scope.dispose();
    } };
  },
});

/* ============================ EffectCraft：合成 ============================ */

craft({
  id: 'effectcraft', name: 'EffectCraft', up: '合成 · 关键帧', group: 'time', tag: '合成',
  blurb: '图层变换与关键帧插值，合成窗口实时播放。',
  hint: '选中图层，在右栏改变换；空格播放',
  mount(host) {
    const shell = craftShell(host, {
      name: 'EffectCraft', file: 'EffectCraft Intro', up: '合成 · 关键帧', tag: '合成',
      theme: 'dark', layout: 'aftereffects', center: true,
    });
    const DUR = 4;
    const project = h('aside', { class: 'ag-bin' });
    const center = h('div', { class: 'ag-canvas-center' });
    const viewer = h('div', { class: 'ag-workspace', style: 'background:#1e1e1e;padding:0' });
    const tl = h('div', { class: 'ag-timeline' });
    const right = h('aside', { class: 'ag-ae-right' });
    center.append(viewer, tl);
    shell.body.append(project, center, right);

    const canvas = h('canvas', { width: 640, height: 360, style: 'display:block;max-width:100%;max-height:100%' });
    viewer.append(canvas);
    const g = canvas.getContext('2d');
    let current = 0;
    let playing = false;
    let timer = 0;
    let selected = 0;
    let tlPlayhead = null;

    let layers = [
      { name: 'Lower Third', color: '#c98b9a', type: 'bar', keys: [kf(0, 320, 300, 100, 0, 0, 0), kf(1, 320, 250, 100, 0, 0, 100)] },
      { name: 'EFFECTCRAFT', color: '#e05a4a', type: 'title', text: 'EFFECTCRAFT', keys: [kf(0, 320, 180, 60, -6, 0, 0), kf(1.2, 320, 180, 100, 0, 0, 100)] },
      { name: 'Accent Line', color: '#4a9eff', type: 'line', keys: [kf(0.4, 320, 230, 20, 0, 0, 0), kf(1.4, 320, 230, 100, 0, 0, 100)] },
      { name: 'Orbit Rings', color: '#6f8fd0', type: 'rings', keys: [kf(0, 320, 180, 40, 0, 0, 0), kf(2.2, 320, 180, 100, 180, 0, 100)] },
      { name: 'Background', color: '#2a2f3a', type: 'bg', keys: [kf(0, 320, 180, 100, 0, 0, 100), kf(4, 320, 180, 100, 0, 0, 100)] },
    ];
    function kf(t, x, y, scale, rot, ox, op) {
      return { t, x, y, scale, rot, op: op == null ? 100 : op, ox: ox || 0 };
    }

    // 每个图层五种标量通道；段类型（bezier/linear/step）可按图层切换。
    // 引擎是纯函数（engine/keyframe.js），这里只负责把关键帧数组翻译成通道。
    const channelCache = [];
    let segments = layers.map(() => 'bezier');

    // 只接受结构完整的图层：缺 keys 或字段非数字的存档一律丢弃，避免挂载时崩溃。
    function validLayer(l) {
      if (!l || typeof l.name !== 'string' || !Array.isArray(l.keys) || !l.keys.length) return false;
      return l.keys.every((k) => k && isFinite(k.t) && isFinite(k.x) && isFinite(k.y)
        && isFinite(k.scale) && isFinite(k.rot) && isFinite(k.op));
    }
    function validSegment(s) { return s === 'bezier' || s === 'linear' || s === 'step'; }

    let saveTimer = 0;
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = 0;
        saveDoc('effectcraft', { layers: layers, segments: segments, current: current, selected: selected });
      }, 600);
    }
    function saveProjectLocal() {
      const ok = saveDoc('effectcraft', { layers: layers, segments: segments, current: current, selected: selected });
      toastIn(shell.root, ok ? '合成已保存到本机' : '保存失败：存档过大或浏览器禁写');
    }
    function saveProjectFile() {
      const text = projectJson('effectcraft', { layers: layers, segments: segments, current: current, selected: selected });
      download('effectcraft.agrft.json', text, 'application/json');
      toastIn(shell.root, '工程文件已导出');
    }
    function openProjectFile() {
      pickFile('.json,application/json', (file) => {
        if (!file) return;
        readFileText(file, (text) => {
          const shellDoc = parseDoc(text);
          const list = shellDoc && shellDoc.doc && Array.isArray(shellDoc.doc.layers)
            ? shellDoc.doc.layers.filter(validLayer) : [];
          if (!list.length) { toastIn(shell.root, '不是有效的 EffectCraft 工程文件'); return; }
          applyProject(list, shellDoc.doc.segments, shellDoc.doc.current, shellDoc.doc.selected);
          toastIn(shell.root, '工程已打开 · ' + layers.length + ' 图层');
        });
      });
    }
    function applyProject(list, segs, time, sel) {
      layers = list;
      segments = layers.map((l, i) => (Array.isArray(segs) && validSegment(segs[i])) ? segs[i] : 'bezier');
      channelCache.length = 0;
      current = clamp(isFinite(time) ? time : 0, 0, DUR);
      selected = clamp(isFinite(sel) ? sel : 0, 0, layers.length - 1);
      renderTimeline();
      renderRight();
      paint();
      // 导入/恢复后立刻排队落盘，保证「导入的段类型」也进入存档。
      scheduleSave();
    }

    // 打开时恢复上次的自动存档；脏档或缺字段时保留默认合成。
    (function restore() {
      const saved = loadDoc('effectcraft');
      if (!saved || !saved.doc || !Array.isArray(saved.doc.layers)) return;
      const list = saved.doc.layers.filter(validLayer);
      if (!list.length) return;
      applyProject(list, saved.doc.segments, saved.doc.current, saved.doc.selected);
    })();
    function channelsFor(index) {
      const cached = channelCache[index];
      if (cached && cached.segment === segments[index]) return cached;
      const keys = layers[index].keys;
      const segment = segments[index];
      const build = (prop) => ({
        keys: keys.map((k, i) => {
          const next = keys[i + 1];
          const prev = keys[i - 1];
          // 平切线（dv=0）才是缓入缓出；上游默认的弦 1/3 手柄会退化成直线。
          const rightHandle = next ? { dt: (next.t - k.t) / 3, dv: 0 } : undefined;
          const leftHandle = prev ? { dt: -(k.t - prev.t) / 3, dv: 0 } : undefined;
          return {
            time: k.t, value: k[prop], segmentToNext: segment,
            tangentMode: 'flat', rightHandle, leftHandle,
          };
        }),
      });
      const ch = {
        segment, x: build('x'), y: build('y'), scale: build('scale'),
        rot: build('rot'), op: build('op'),
      };
      channelCache[index] = ch;
      return ch;
    }

    function sample(layer, t) {
      const index = layers.indexOf(layer);
      const ch = channelsFor(index);
      const first = layer.keys[0];
      // 通道外统一 hold，与关键帧合成的「保持」默认一致。
      return {
        x: sampleChannel(ch.x, t, first.x),
        y: sampleChannel(ch.y, t, first.y),
        scale: sampleChannel(ch.scale, t, first.scale),
        rot: sampleChannel(ch.rot, t, first.rot),
        op: sampleChannel(ch.op, t, first.op),
      };
    }

    function paint() {
      g.fillStyle = '#080b12'; g.fillRect(0, 0, 640, 360);
      // 图层数组是「从上层到下层」（和 AE 的图层列表一致），所以绘制要反向：
      // 先画最底层，最后画最上层，否则背景会盖住全部内容。
      layers.slice().reverse().forEach((l) => {
        const s = sample(l, current);
        g.save();
        g.globalAlpha = s.op / 100;
        g.translate(s.x, s.y);
        g.rotate(s.rot * Math.PI / 180);
        g.scale(s.scale / 100, s.scale / 100);
        if (l.type === 'bg') {
          const grd = g.createRadialGradient(0, 0, 10, 0, 0, 360);
          grd.addColorStop(0, '#1b2440'); grd.addColorStop(1, '#070a12');
          g.fillStyle = grd; g.fillRect(-400, -300, 800, 600);
        } else if (l.type === 'rings') {
          for (let i = 0; i < 8; i++) {
            g.strokeStyle = 'rgba(120,160,220,' + (0.1 + i * 0.06).toFixed(2) + ')';
            g.lineWidth = 1;
            g.beginPath(); g.arc(0, 0, 60 + i * 16, 0, Math.PI * 2); g.stroke();
          }
        } else if (l.type === 'title') {
          g.fillStyle = '#f2f2f2'; g.font = '700 44px ' + FONT; g.textAlign = 'center';
          g.fillText(l.text, 0, 14);
          g.font = '400 9px ' + FONT; g.fillStyle = '#9db4d0';
          g.fillText('MOTION GRAPHICS · VISUAL EFFECTS', 0, 34);
          g.textAlign = 'left';
        } else if (l.type === 'line') {
          g.fillStyle = '#4a9eff'; g.fillRect(-120, 0, 240, 3);
        } else if (l.type === 'bar') {
          g.fillStyle = 'rgba(220,220,220,.9)'; g.fillRect(-150, -14, 300, 28);
          g.fillStyle = '#12121a'; g.font = '600 12px ' + FONT;
          g.fillText('LOWER THIRD · 片头字幕', -90, 6);
        }
        g.restore();
      });
      g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '10px "SF Mono", monospace';
      g.fillText('00:' + fmtTime(current).slice(3) + ' / ' + fmtTime(DUR), 10, 350);
      shell.setStatus('合成 · ' + fmtTime(current) + ' / ' + fmtTime(DUR) + ' · ' + layers.length + ' 图层');
      shell.setInfo('1920 × 1080 · 29.97 fps');
      if (tlPlayhead) tlPlayhead.style.left = (current / DUR * 100) + '%';
      else renderTimeline();
    }

    function renderTimeline() {
      clear(tl);
      tl.append(h('div', { class: 'ag-tl-head' }, h('span', {}, '时间线 · EffectCraft Intro'), h('span', { class: 'ag-spacer' }), h('span', {}, fmtTime(current))));
      const body = h('div', { class: 'ag-tl-body' });
      const labels = h('div', { class: 'ag-tl-labels', style: 'flex-basis:180px;width:180px' });
      const lanes = h('div', { class: 'ag-tl-lanes' });
      const ruler = h('div', { class: 'ag-tl-ruler' });
      for (let s = 0; s <= DUR; s++) ruler.append(h('div', { class: 'ag-tl-tick', style: 'left:' + (s / DUR * 100) + '%' }, s + 's'));
      lanes.append(ruler);
      layers.forEach((l, i) => {
        labels.append(h('div', {
          class: 'ag-ae-layer' + (i === selected ? ' active' : ''),
          style: 'height:24px',
          onclick: () => { selected = i; renderRight(); paint(); },
        }, h('span', { class: 'ag-dot', style: 'background:' + l.color }), l.name));
        const lane = h('div', { class: 'ag-tl-lane', style: 'height:24px' });
        const bar = h('div', {
          class: 'ag-tl-clip', style: 'left:0;width:100%;height:18px;line-height:16px;background:' + l.color + '55;border-color:' + l.color,
        }, l.name);
        lane.append(bar);
        lanes.append(lane);
      });
      const head = h('div', { class: 'ag-playhead', style: 'left:' + (current / DUR * 100) + '%' });
      tlPlayhead = head;
      lanes.append(head);
      lanes.addEventListener('pointerdown', (ev) => {
        const r = lanes.getBoundingClientRect();
        current = clamp((ev.clientX - r.left) / r.width * DUR, 0, DUR);
        paint();
      });
      body.append(labels, lanes);
      tl.append(body);
    }

    function renderProject() {
      clear(project);
      project.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '项目'), h('span', { class: 'ag-panel-caret' }, '1')));
      project.append(h('div', { class: 'ag-panel-body' },
        h('div', { class: 'ag-list-item active' }, h('span', { class: 'ag-list-name' }, '◆ EffectCraft Intro'), h('span', { class: 'ag-list-meta' }, '合成')),
        h('div', { class: 'ag-list-item' }, h('span', { class: 'ag-list-name' }, '3D Showcase'), h('span', { class: 'ag-list-meta' }, '合成'))));
      project.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '效果与预设')));
      project.append(h('div', { class: 'ag-panel-body' },
        h('p', { class: 'ag-hint' }, '拖动时间线上的播放头，右栏参数随关键帧插值。')));
    }

    function renderRight() {
      clear(right);
      right.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '预览'), h('span', { class: 'ag-panel-caret' }, '音频')));
      const l = layers[selected];
      right.append(h('div', { class: 'ag-panel-body' },
        h('button', { class: 'ag-btn primary', type: 'button', onclick: togglePlay }, playing ? '暂停' : '播放'),
        h('button', { class: 'ag-btn', type: 'button', onclick: () => { current = 0; paint(); } }, '回到开头')));
      if (l) {
        const s = sample(l, current);
        right.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '图层变换 · ' + l.name)));
        right.append(h('div', { class: 'ag-panel-body' },
          sliderRow('X 位置', 0, 640, 1, s.x, (v) => Math.round(v), (v) => setKey('x', v)),
          sliderRow('Y 位置', 0, 360, 1, s.y, (v) => Math.round(v), (v) => setKey('y', v)),
          sliderRow('缩放', 0, 200, 1, s.scale, (v) => Math.round(v) + '%', (v) => setKey('scale', v)),
          sliderRow('旋转', -180, 180, 1, s.rot, (v) => Math.round(v) + '°', (v) => setKey('rot', v)),
          sliderRow('不透明度', 0, 100, 1, s.op, (v) => Math.round(v) + '%', (v) => setKey('op', v)),
          selectField('段插值', [
            { value: 'bezier', label: '贝塞尔（平滑）' },
            { value: 'linear', label: '线性' },
            { value: 'step', label: '保持（阶跃）' },
          ], segments[selected], (v) => {
            segments[selected] = v;
            channelCache[selected] = null;
            scheduleSave();
            paint();
          }),
          h('p', { class: 'ag-hint' }, '改动会写入当前时间最近的关键帧；拖动播放头看插值。')));
      }
    }

    function setKey(prop, value) {
      const l = layers[selected];
      if (!l) return;
      const t = current;
      // 在最近的关键帧上改值；没有就补一个。
      let k = l.keys[0];
      l.keys.forEach((kk) => { if (Math.abs(kk.t - t) < Math.abs(k.t - t)) k = kk; });
      k[prop] = value;
      channelCache[selected] = null; // 关键帧值变了，通道缓存必须重建
      scheduleSave();
      paint(); // 滑块自己维护读数，重建右栏会把正在拖的滑块摘掉
    }

    function togglePlay() {
      if (playing) { playing = false; clearInterval(timer); }
      else {
        playing = true;
        timer = setInterval(() => {
          current += 1 / 30;
          if (current > DUR) { current = 0; }
          paint();
        }, 33);
      }
      renderRight();
    }

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', shortcut: '⌘S', onClick: saveProjectLocal },
        { label: '导出工程文件…', onClick: saveProjectFile },
        { label: '打开工程文件…', onClick: openProjectFile },
        { sep: true },
        { label: '导出当前帧', shortcut: '⌘E', onClick: () => { saveCanvas(canvas, 'effectcraft-frame.png'); toastIn(shell.root, '当前帧已导出'); } },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '合成', items: [
        { label: playing ? '暂停' : '播放', shortcut: 'Space', onClick: togglePlay },
        { label: '回到开头', onClick: () => { current = 0; paint(); } },
      ] },
    ]);

    function onKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    }
    document.addEventListener('keydown', onKey);

    const scope = commandScope();
    scope.add('effectcraft.play', '播放合成', togglePlay);
    scope.add('effectcraft.exportFrame', '导出当前帧', () => saveCanvas(canvas, 'effectcraft-frame.png'));
    scope.add('effectcraft.save', '保存合成到本机', saveProjectLocal);
    scope.add('effectcraft.exportDoc', '导出工程 JSON 文件', saveProjectFile);
    scope.add('effectcraft.openDoc', '打开工程 JSON 文件', openProjectFile);

    renderProject();
    renderRight();
    paint();
    return { destroy() {
      // 防抖窗口内的编辑先补写，再拆监听与命令。
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      saveDoc('effectcraft', { layers: layers, segments: segments, current: current, selected: selected });
      clearInterval(timer); document.removeEventListener('keydown', onKey); scope.dispose();
    } };
  },
});

/* ============================ AniCraft：逐帧动画 ============================ */

craft({
  id: 'anicraft', name: 'AniCraft', up: '逐帧 · 时间轴', group: 'time', tag: '逐帧',
  blurb: '帧条、洋葱皮、画笔与精灵表导出。',
  hint: '画笔逐帧画；开洋葱皮对齐上一帧',
  mount(host) {
    const shell = craftShell(host, {
      name: 'AniCraft', file: 'untitled.fla', up: '逐帧 · 时间轴', tag: '24 fps',
      theme: 'dark', layout: 'ani',
    });
    const W = 480, H = 360;
    const rail = h('aside', { class: 'ag-rail' });
    const main = h('div', { class: 'ag-ani-canvas' });
    const stage = h('div', { class: 'ag-ani-stage' });
    const strip = h('div', { class: 'ag-ani-strip' });
    const right = h('aside', { class: 'ag-right-panels', style: 'flex-basis:220px;width:220px' });
    main.append(stage, strip);
    shell.body.append(rail, main, right);

    const canvas = h('canvas', { width: W, height: H, class: 'ag-canvas' });
    stage.append(canvas);
    const ctx = canvas.getContext('2d');
    const frames = [];
    let cur = 0;
    let tool = 'brush';
    let color = '#1c1917';
    let size = 6;
    let onion = true;
    let fps = 24;
    let playing = false;
    let timer = 0;

    // 帧存档：canvas 转 PNG data URL，随 doc.js 的 400 KB 上限一起走。
    // 超过上限时 saveDoc 返回 false，只更新状态栏，不打断绘画。
    let saveTimer = 0;
    function persist() {
      saveTimer = 0;
      const ok = saveDoc('anicraft', {
        frames: frames.map((f) => f.toDataURL('image/png')),
        cur: cur, fps: fps, onion: onion,
      });
      if (!ok) shell.setStatus('帧数过多，超过 400 KB 存档上限，本次未保存');
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 600);
    }
    function applyFrames(urls, index, rate, onionOn) {
      const valid = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && u.indexOf('data:image/') === 0);
      if (!valid.length) return false;
      frames.length = 0;
      valid.forEach((url, i) => {
        const c = blank();
        frames.push(c);
        const img = new Image();
        img.onload = () => {
          c.getContext('2d').drawImage(img, 0, 0, W, H);
          if (cur === i) paint(); else renderStrip();
        };
        img.src = url;
      });
      cur = isFinite(index) ? clamp(index, 0, frames.length - 1) : 0;
      if (isFinite(rate)) fps = clamp(rate, 6, 30);
      if (typeof onionOn === 'boolean') onion = onionOn;
      return true;
    }

    function blank() {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      return c;
    }
    frames.push(blank());

    const TOOLS = [
      { id: 'brush', icon: 'brush', label: '画笔' }, { id: 'eraser', icon: 'eraser', label: '橡皮' },
      { id: 'line', icon: 'line', label: '直线' }, { id: 'rect', icon: 'square', label: '矩形' },
      { id: 'circle', icon: 'circle', label: '椭圆' },
    ];
    const toolBtns = {};
    const grid = h('div', { class: 'ag-rail-grid' });
    TOOLS.forEach((t) => {
      toolBtns[t.id] = iconButton(t.icon, t.label, () => { tool = t.id; syncTools(); }, { size: 16 });
      grid.append(toolBtns[t.id]);
    });
    rail.append(h('div', { class: 'ag-rail-group' }, grid));
    rail.append(h('div', { class: 'ag-rail-group' }, h('div', { class: 'ag-rail-grid' },
      iconButton('plus', '新建帧', addFrame, { size: 16 }),
      iconButton('layers', '复制帧', dupFrame, { size: 16 }),
      iconButton('play', '播放', togglePlay, { size: 16 }))));
    function syncTools() { Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('active', k === tool)); }

    function paint() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      if (onion && cur > 0) {
        ctx.save(); ctx.globalAlpha = 0.22;
        ctx.drawImage(frames[cur - 1], 0, 0);
        ctx.restore();
      }
      ctx.drawImage(frames[cur], 0, 0);
      // 十字对齐线，逐帧画的时候有用
      ctx.save();
      ctx.strokeStyle = 'rgba(120,120,120,.16)';
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.restore();
      shell.setStatus('第 ' + (cur + 1) + ' / ' + frames.length + ' 帧 · ' + (playing ? '播放中' : '停止') + ' · ' + fps + ' fps');
      shell.setInfo(W + ' × ' + H);
      renderStrip();
    }

    function renderStrip() {
      clear(strip);
      frames.forEach((f, i) => {
        const c = h('canvas', { width: 58, height: 44 });
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 58, 44);
        g.drawImage(f, 0, 0, 58, 44);
        strip.append(h('div', {
          class: 'ag-ani-frame' + (i === cur ? ' active' : ''), style: 'width:58px;height:58px',
          onclick: () => { cur = i; paint(); },
        }, c, h('span', {}, String(i + 1))));
      });
      strip.append(h('button', {
        class: 'ag-ani-frame', type: 'button',
        style: 'width:40px;height:58px;background:transparent;color:var(--ag-muted);font-size:20px',
        onclick: addFrame,
      }, '+'));
    }

    function addFrame() {
      frames.push(blank()); cur = frames.length - 1; paint(); scheduleSave();
    }
    function dupFrame() {
      const c = blank();
      c.getContext('2d').drawImage(frames[cur], 0, 0);
      frames.push(c); cur = frames.length - 1; paint(); scheduleSave();
    }
    function togglePlay() {
      if (playing) { playing = false; clearInterval(timer); }
      else {
        playing = true;
        timer = setInterval(() => { cur = (cur + 1) % frames.length; paint(); }, 1000 / fps);
      }
      shell.setStatus(playing ? '播放中' : '停止');
    }

    let drawing = null;
    canvas.addEventListener('pointerdown', (ev) => {
      const p = viewPoint(ev);
      const fg = frames[cur].getContext('2d');
      drawing = { x: p.x, y: p.y, fg };
      if (tool === 'brush' || tool === 'eraser') dab(fg, p.x, p.y, tool === 'eraser');
      else {
        // 形状预览需要每帧还原底图，否则会把这一帧已有的笔画擦掉
        const snap = document.createElement('canvas');
        snap.width = W; snap.height = H;
        snap.getContext('2d').drawImage(frames[cur], 0, 0);
        drawing.snapshot = snap;
      }
      canvas.setPointerCapture(ev.pointerId);
      paint();
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!drawing) return;
      const p = viewPoint(ev);
      const fg = frames[cur].getContext('2d');
      if (tool === 'brush' || tool === 'eraser') dab(fg, p.x, p.y, tool === 'eraser');
      else {
        // 形状工具：先还原底图再画，避免擦掉已有内容或叠加拖影。
        fg.clearRect(0, 0, W, H);
        if (drawing.snapshot) fg.drawImage(drawing.snapshot, 0, 0);
        fg.strokeStyle = color; fg.lineWidth = size;
        fg.beginPath();
        if (tool === 'line') { fg.moveTo(drawing.x, drawing.y); fg.lineTo(p.x, p.y); }
        else if (tool === 'rect') fg.rect(drawing.x, drawing.y, p.x - drawing.x, p.y - drawing.y);
        else fg.ellipse((drawing.x + p.x) / 2, (drawing.y + p.y) / 2, Math.abs(p.x - drawing.x) / 2, Math.abs(p.y - drawing.y) / 2, 0, 0, Math.PI * 2);
        fg.stroke();
      }
      paint();
    });
    canvas.addEventListener('pointerup', () => { drawing = null; scheduleSave(); });
    canvas.addEventListener('pointercancel', () => { drawing = null; scheduleSave(); });

    function dab(g, x, y, erase) {
      g.save();
      g.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
      g.fillStyle = color;
      g.beginPath(); g.arc(x, y, size / 2, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    function viewPoint(ev) {
      const r = canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
    }

    function renderRight() {
      clear(right);
      right.append(h('div', { class: 'ag-panel-head' }, h('span', {}, '工具属性')));
      right.append(h('div', { class: 'ag-panel-body' },
        colorRow('颜色', color, (v) => { color = v; }),
        sliderRow('笔刷', 1, 40, 1, size, (v) => v + ' px', (v) => { size = v; }),
        h('label', { style: 'display:flex;align-items:center;margin:6px 0;font-size:10.5px;color:var(--ag-text-dim)' },
          h('input', { type: 'checkbox', checked: onion, onchange(e) { onion = e.target.checked; paint(); } }), ' 洋葱皮'),
        sliderRow('帧率', 6, 30, 1, fps, (v) => v + ' fps', (v) => { fps = v; }),
        h('button', { class: 'ag-btn', type: 'button', onclick: exportSheet }, '导出精灵表'),
        h('button', { class: 'ag-btn', type: 'button', onclick: exportPng }, '导出当前帧')));
    }

    function exportSheet() {
      const c = document.createElement('canvas');
      c.width = W * frames.length; c.height = H;
      const g = c.getContext('2d');
      frames.forEach((f, i) => g.drawImage(f, i * W, 0));
      saveCanvas(c, 'anicraft-sheet.png');
      toastIn(shell.root, '精灵表已导出（' + frames.length + ' 帧）');
    }
    function exportPng() { saveCanvas(frames[cur], 'anicraft-frame-' + (cur + 1) + '.png'); }

    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', onClick: persist },
        { label: '导出精灵表', shortcut: '⌘S', onClick: exportSheet },
        { label: '导出当前帧', onClick: exportPng },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '帧', items: [
        { label: '新建帧', onClick: addFrame },
        { label: '复制帧', onClick: dupFrame },
        { sep: true }, { label: playing ? '停止' : '播放', shortcut: 'Space', onClick: togglePlay },
      ] },
      { label: '视图', items: [
        { label: '洋葱皮', checked: onion, onClick: () => { onion = !onion; renderRight(); paint(); } },
      ] },
    ]);

    function onKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight') { cur = Math.min(frames.length - 1, cur + 1); paint(); }
      if (e.key === 'ArrowLeft') { cur = Math.max(0, cur - 1); paint(); }
    }
    document.addEventListener('keydown', onKey);

    const scope = commandScope();
    scope.add('anicraft.addFrame', '新建帧', addFrame);
    scope.add('anicraft.save', '保存帧到本机', persist);
    scope.add('anicraft.exportSheet', '导出精灵表', exportSheet);

    (function restore() {
      const saved = loadDoc('anicraft');
      if (saved && saved.doc) applyFrames(saved.doc.frames, saved.doc.cur, saved.doc.fps, saved.doc.onion);
    })();
    syncTools();
    renderRight();
    paint();
    return { destroy() {
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      scope.dispose();
    } };
  },
});

/* ============================ SoundCraft：多轨混音 ============================ */

craft({
  id: 'soundcraft', name: 'SoundCraft', up: '多轨 · 混音', group: 'time', tag: '混音',
  blurb: '七通道调音台、区域编辑器与 WebAudio 合成，导出 WAV。',
  hint: '推子调音量；M/S 静音独奏；空格播放',
  mount(host) {
    const shell = craftShell(host, {
      name: 'SoundCraft', file: 'Midnight Groove', up: '多轨 · 混音', tag: 'MIX',
      theme: 'dark', layout: 'protools',
    });
    const TRACKS = [
      { name: 'Kick', color: '#d06a4a', type: 'kick' },
      { name: 'Snare', color: '#c9a04a', type: 'snare' },
      { name: 'Hats', color: '#8ab04a', type: 'hat' },
      { name: 'Bass', color: '#4a9ed0', type: 'bass' },
      { name: 'Pad', color: '#6a7ad0', type: 'pad' },
      { name: 'Keys', color: '#a06ad0', type: 'keys' },
      { name: 'Lead', color: '#d06a9a', type: 'lead' },
    ];
    const STEPS = 16;
    const patterns = TRACKS.map((t, ti) => {
      const row = new Array(STEPS).fill(0);
      if (ti === 0) [0, 4, 8, 12].forEach((i) => { row[i] = 1; });
      if (ti === 1) [4, 12].forEach((i) => { row[i] = 1; });
      if (ti === 2) [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => { row[i] = 1; });
      if (ti === 3) [0, 3, 6, 8, 11, 14].forEach((i) => { row[i] = 1; });
      if (ti === 4) [0, 8].forEach((i) => { row[i] = 1; });
      if (ti === 5) [2, 6, 10, 14].forEach((i) => { row[i] = 1; });
      if (ti === 6) [3, 7, 11, 15].forEach((i) => { row[i] = 1; });
      return row;
    });
    const mute = TRACKS.map(() => false);
    const solo = TRACKS.map(() => false);
    const levels = TRACKS.map((t, i) => [0.9, 0.66, 0.44, 0.7, 0.38, 0.5, 0.42][i]);
    const pans = TRACKS.map(() => 0);
    let master = 0.85;
    let tempo = 100;
    let step = 0;
    let playing = false;
    let timer = 0;
    let actx = null;
    let selected = 0;
    let eqOpen = true;
    let eq = { hpf: 80, lpf: 18000, hf: 0, lf: 0 };
    // 波形：离线渲染一遍当前 pattern，用 20ms RMS 分桶；参数没变就复用缓存。
    let waveCanvas = null;
    let waveBuckets = null;
    let waveSignature = '';
    let waveToken = 0;
    let waveTimer = 0;
    let wavCache = null; // { sig, blob }：同一工程重复导出复用，保证字节一致

    // 工程存档：pattern / 推子 / M/S / 声像 / EQ 都是纯数据，直接走 doc.js。
    let saveTimer = 0;
    function soundDoc() {
      return {
        patterns: patterns, mute: mute, solo: solo, levels: levels, pans: pans,
        master: master, tempo: tempo, eq: eq,
      };
    }
    function persist() {
      saveTimer = 0;
      saveDoc('soundcraft', soundDoc());
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 600);
    }
    function applyDoc(doc) {
      if (!doc || !Array.isArray(doc.patterns) || doc.patterns.length !== TRACKS.length) return false;
      TRACKS.forEach((tr, ti) => {
        const row = doc.patterns[ti];
        if (!Array.isArray(row)) return;
        for (let s = 0; s < STEPS; s++) patterns[ti][s] = row[s] ? 1 : 0;
      });
      ['mute', 'solo'].forEach((k) => {
        if (!Array.isArray(doc[k])) return;
        const target = k === 'mute' ? mute : solo;
        for (let i = 0; i < TRACKS.length; i++) target[i] = !!doc[k][i];
      });
      ['levels', 'pans'].forEach((k) => {
        if (!Array.isArray(doc[k])) return;
        const target = k === 'levels' ? levels : pans;
        for (let i = 0; i < TRACKS.length; i++) if (isFinite(doc[k][i])) target[i] = doc[k][i];
      });
      if (isFinite(doc.master)) master = clamp(doc.master, 0, 1);
      if (isFinite(doc.tempo)) tempo = clamp(doc.tempo, 60, 160);
      if (doc.eq && typeof doc.eq === 'object') {
        ['hpf', 'lpf', 'hf', 'lf'].forEach((k) => { if (isFinite(doc.eq[k])) eq[k] = doc.eq[k]; });
      }
      return true;
    }

    const mixer = h('div', { class: 'ag-pt-mixer' });
    const strips = h('div', { class: 'ag-pt-strips' });
    const right = h('aside', { class: 'ag-pt-right' });
    mixer.append(strips, right);
    shell.body.append(mixer);

    // 传输条
    const transport = h('div', { class: 'ag-pt-transport', style: 'display:flex;align-items:center;height:34px;padding:0 10px;background:var(--ag-chrome);border-bottom:1px solid var(--ag-line)' });
    const timeDisp = h('span', { style: 'font:12px var(--ag-mono);color:#e8e8e8;min-width:92px' }, '00:00:00.00');
    transport.append(
      h('button', { class: 'ag-icbtn', type: 'button', title: '回到开头', onclick: () => { step = 0; render(); } }, icon('skipBack', 14)),
      h('button', { class: 'ag-icbtn', type: 'button', title: '播放/停止', onclick: togglePlay, style: 'width:32px;height:28px' }, icon(playing ? 'pause' : 'play', 16)),
      h('button', { class: 'ag-icbtn', type: 'button', title: '停止', onclick: stop }, icon('stop', 13)),
      timeDisp,
      h('span', { class: 'ag-spacer' }),
      h('span', { style: 'font:10px var(--ag-mono);color:var(--ag-muted)' }, tempo + ' BPM · ' + STEPS + ' 步 · 44.1 kHz'),
      h('button', { class: 'ag-btn', type: 'button', style: 'margin:0 0 0 10px', onclick: exportWav }, '导出 WAV'));
    shell.sub.append(transport);

    function ensure() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function noiseBuffer(ctx, dur, seed) {
      const len = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      // 固定种子：同一次工程导出两次得到逐字节相同的 WAV。
      fillNoise(b.getChannelData(0), seed);
      return b;
    }
    function audible(ti) {
      if (solo.some(Boolean)) return solo[ti];
      return !mute[ti];
    }
    // 每个 AudioContext / OfflineAudioContext 一条母线：限幅器 + 0.98 输出增益。
    // 用 WeakMap 挂载，导出时新建的离线上下文也能自动拿到自己的母线。
    const masterBuses = new WeakMap();
    // 离线导出跳过压缩器：Chrome 的 DynamicsCompressor 在多次渲染间可能有 1 LSB 抖动，
    // 会让同一工程的 WAV 哈希不同。导出末尾已有 clampPeak 兜底，绕过限幅不增风险。
    const bypassLimiter = new WeakSet();
    function busFor(ctx) {
      let bus = masterBuses.get(ctx);
      if (!bus) {
        if (bypassLimiter.has(ctx)) {
          const input = ctx.createGain();
          const output = ctx.createGain();
          output.gain.value = MASTER_OUTPUT_HEADROOM;
          input.connect(output);
          output.connect(ctx.destination);
          bus = { input: input, limiter: null, output: output };
        } else {
          bus = createMasteringChain(ctx, ctx.destination);
        }
        masterBuses.set(ctx, bus);
      }
      return bus;
    }
    function voice(ctx, ti, when, stepIndex) {
      const tr = TRACKS[ti];
      const g = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const out = ctx.createGain();
      out.gain.value = master * levels[ti];
      g.connect(out);
      const bus = busFor(ctx);
      // 声像为 0 时不接 StereoPanner：少一个可能引入浮点抖动的节点，导出也更可复现。
      if (pan && pans[ti] !== 0) { pan.pan.value = pans[ti]; out.connect(pan); pan.connect(bus.input); }
      else out.connect(bus.input);
      const scale = [220, 247, 277, 330, 370, 440, 494, 554];
      if (tr.type === 'kick') {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(132, when);
        o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
        g.gain.setValueAtTime(0.9, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
        o.connect(g); o.start(when); o.stop(when + 0.24);
      } else if (tr.type === 'snare') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.18, 'snare:' + stepIndex);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
        g.gain.setValueAtTime(0.7, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
        src.connect(bp); bp.connect(g); src.start(when);
      } else if (tr.type === 'hat') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.05, 'hat:' + stepIndex);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 7500;
        g.gain.setValueAtTime(0.32, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
        src.connect(hp); hp.connect(g); src.start(when);
      } else if (tr.type === 'bass') {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 55 * Math.pow(2, (stepIndex % 4) / 12);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 420;
        g.gain.setValueAtTime(0.28, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
        o.connect(lp); lp.connect(g); o.start(when); o.stop(when + 0.32);
      } else if (tr.type === 'pad') {
        [0, 4, 7].forEach((semi, i) => {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = 220 * Math.pow(2, semi / 12);
          g.gain.setValueAtTime(0.09, when);
          g.gain.exponentialRampToValueAtTime(0.001, when + 0.55);
          o.connect(g); o.start(when); o.stop(when + 0.58);
        });
      } else if (tr.type === 'keys') {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = scale[stepIndex % scale.length];
        g.gain.setValueAtTime(0.12, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
        o.connect(g); o.start(when); o.stop(when + 0.27);
      } else {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = scale[(stepIndex + 2) % scale.length];
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 2200;
        g.gain.setValueAtTime(0.13, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
        o.connect(lp); lp.connect(g); o.start(when); o.stop(when + 0.32);
      }
    }

    const stripRefs = [];
    function stripEl(ti) {
      const tr = TRACKS[ti];
      const ins = h('div', { class: 'ag-pt-ins' },
        h('div', {}, ti === 0 ? 'EQ7' : ti === 1 ? 'Comp' : ti === 2 ? 'EQ' : ti === 3 ? 'Saturn' : ti === 4 ? 'Chorus' : ti === 5 ? 'Plate' : 'Max'),
        h('div', {}, ti % 2 ? 'Satur' : 'Comp'));
      const pan = h('div', { class: 'ag-pt-pan', title: '声像', onclick: (e) => { e.stopPropagation(); pans[ti] = pans[ti] ? 0 : (ti % 2 ? 0.4 : -0.4); scheduleSave(); render(); } },
        h('i', { style: 'transform:rotate(' + (pans[ti] * 90) + 'deg)' }));
      const fader = h('div', { class: 'ag-pt-fader' },
        h('input', {
          type: 'range', min: 0, max: 1, step: 0.01, value: levels[ti],
          onpointerdown(e) { e.stopPropagation(); },
          oninput(e) { levels[ti] = Number(e.target.value); setMeter(); scheduleWave(); },
        }));
      // 电平表用固定渐变 + 高度裁剪，避免每帧重排整条通道。
      const meterFill = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:' + Math.round(levels[ti] * 100) + '%;background:linear-gradient(to top,#3fa34a,#d8c040 72%,#c04a3a)' });
      const meter = h('div', { style: 'position:relative;width:5px;height:100%;margin-left:4px;background:#161616;border:1px solid #333;overflow:hidden' }, meterFill);
      const db = h('div', { class: 'ag-pt-io' }, (20 * Math.log10(Math.max(0.001, levels[ti] * master))).toFixed(1) + ' dB');
      const el = h('div', { class: 'ag-pt-strip' + (ti === selected ? ' active' : ''), onclick: () => { selected = ti; render(); } },
        ins,
        h('div', { class: 'ag-pt-io' }, 'In 1', h('br'), 'Out 1-2'),
        pan,
        h('div', { class: 'ag-pt-ms' },
          h('button', { class: mute[ti] ? 'on' : '', type: 'button', title: '静音', onclick(e) { e.stopPropagation(); mute[ti] = !mute[ti]; scheduleSave(); render(); } }, 'M'),
          h('button', { class: solo[ti] ? 'solo on' : 'solo', type: 'button', title: '独奏', onclick(e) { e.stopPropagation(); solo[ti] = !solo[ti]; scheduleSave(); render(); } }, 'S')),
        h('div', { style: 'display:flex;flex:1 1 auto;min-height:80px;width:100%;justify-content:center' }, fader, meter),
        h('div', { class: 'ag-pt-name', style: 'border-top-color:' + tr.color }, tr.name),
        db);
      const ref = { el, meterFill, db };
      stripRefs.push(ref);
      return el;
    }

    let masterRef = null;
    function masterEl() {
      const fill = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:' + Math.round(master * 100) + '%;background:linear-gradient(to top,#3fa34a,#d8c040 72%,#c04a3a)' });
      const meter = h('div', { style: 'position:relative;width:5px;height:100%;margin-left:4px;background:#161616;border:1px solid #333;overflow:hidden' }, fill);
      const db = h('div', { class: 'ag-pt-io' }, (20 * Math.log10(Math.max(0.001, master))).toFixed(1) + ' dB');
      const el = h('div', { class: 'ag-pt-strip master' },
        h('div', { class: 'ag-pt-ins' }, h('div', {}, 'Master'), h('div', {}, 'Limiter')),
        h('div', { class: 'ag-pt-io' }, 'Out 1-2', h('br'), '—'),
        h('div', { class: 'ag-pt-pan', style: 'visibility:hidden' }),
        h('div', { class: 'ag-pt-ms' }),
        h('div', { style: 'display:flex;flex:1 1 auto;min-height:80px;width:100%;justify-content:center' },
          h('div', { class: 'ag-pt-fader' },
            h('input', {
              type: 'range', min: 0, max: 1, step: 0.01, value: master,
              oninput(e) { master = Number(e.target.value); setMeter(); scheduleSave(); },
            })), meter),
        h('div', { class: 'ag-pt-name' }, 'Master 1'),
        db);
      masterRef = { meterFill: fill, db };
      return el;
    }

    // 编辑区：多轨视图的轨道区域，点击块切换该步是否触发。
    const edit = h('div', { class: 'ag-pt-edit', style: 'flex:0 0 auto;border-bottom:1px solid var(--ag-line);background:#202020;padding:5px 7px;max-height:180px;overflow:auto' });
    shell.body.insertBefore(edit, mixer); // 区域编辑器在调音台之上；此前只建不挂，节奏无法编辑
    let editCells = [];
    function renderEdit() {
      clear(edit);
      editCells = [];
      edit.append(h('div', { style: 'display:flex;align-items:center;margin-bottom:3px' },
        h('span', { style: 'flex:0 0 92px;font:9px var(--ag-mono);color:var(--ag-muted)' }, '编辑 · 区域'),
        h('span', { style: 'font:9px var(--ag-mono);color:var(--ag-muted)' }, '点击方块开/关 · 当前步高亮')));
      TRACKS.forEach((tr, ti) => {
        const lane = h('div', { style: 'display:flex;align-items:center;margin-bottom:2px' },
          h('span', { style: 'flex:0 0 92px;font:9px var(--ag-mono);color:' + tr.color }, tr.name));
        const cells = h('div', { style: 'display:flex;flex:1 1 auto;margin-left:4px' });
        for (let s = 0; s < STEPS; s++) {
          const cell = h('button', {
            class: 'ag-pt-cell', type: 'button', title: tr.name + ' · 第 ' + (s + 1) + ' 步',
            style: 'flex:1 1 0;height:16px;margin-right:2px;border:1px solid #333;background:' + (patterns[ti][s] ? tr.color : '#2a2a2a'),
            onclick() { patterns[ti][s] = patterns[ti][s] ? 0 : 1; cell.style.background = patterns[ti][s] ? tr.color : '#2a2a2a'; scheduleWave(); },
          });
          editCells.push(cell);
          cells.append(cell);
        }
        lane.append(cells);
        edit.append(lane);
      });
    }
    function highlightStep() {
      editCells.forEach((c, i) => {
        const s = i % STEPS;
        c.style.outline = (s === step && playing) ? '1px solid #fff' : 'none';
      });
    }

    function updateTime() {
      timeDisp.textContent = '00:00:' + String(Math.floor(step / 4)).padStart(2, '0') + '.' + String((step % 4) * 25).padStart(2, '0');
    }

    // 任何会改变声音的编辑都进签名；签名不变就不重算波形。
    function waveSignatureOf() {
      return JSON.stringify({ p: patterns, t: tempo, l: levels, m: mute, s: solo, pan: pans, g: master });
    }
    function scheduleWave() {
      scheduleSave();
      if (waveTimer) clearTimeout(waveTimer);
      waveTimer = setTimeout(() => { waveTimer = 0; renderWaveNow(); }, 140);
    }
    function renderWaveNow() {
      const sig = waveSignatureOf();
      if (sig === waveSignature && waveBuckets) { drawWave(); return; }
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) { drawWave(); return; }
      const sr = 44100;
      const stepDur = 60 / tempo / 4;
      const duration = STEPS * stepDur + 0.8;
      const ctx = new OAC(2, Math.ceil(sr * duration), sr);
      for (let s = 0; s < STEPS; s++) {
        patterns.forEach((row, ti) => { if (row[s] && audible(ti)) voice(ctx, ti, 0.02 + s * stepDur, s); });
      }
      const token = ++waveToken;
      ctx.startRendering().then((buf) => {
        if (token !== waveToken) return; // 渲染期间参数又变了：丢弃旧结果
        const chans = [];
        for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
        waveBuckets = rmsBuckets(chans, sr, 58);
        waveSignature = sig;
        drawWave();
      }).catch(() => { if (token === waveToken) drawWave(); });
    }

    function drawWave(c) {
      const canvas = c || (waveCanvas && waveCanvas.isConnected ? waveCanvas : null);
      if (!canvas) return;
      const g = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      g.fillStyle = '#171717'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#7a7a7a'; g.font = '8px "SF Mono", monospace';
      g.fillText(TRACKS.length + ' 轨 · 1 bar · ' + (playing ? 'playing' : 'loop'), 6, 12);
      const mid = H / 2;
      const n = waveBuckets ? waveBuckets.length : 0;
      if (!n) {
        g.strokeStyle = '#333';
        g.beginPath(); g.moveTo(6, mid); g.lineTo(W - 6, mid); g.stroke();
        g.fillStyle = '#555'; g.fillText('渲染波形…', 6, H - 6);
        return;
      }
      // 按本段最大值归一化，整体电平低时也能看清节奏轮廓。
      let peak = 0;
      for (let i = 0; i < n; i++) if (waveBuckets[i] > peak) peak = waveBuckets[i];
      const norm = peak > 0 ? 0.94 / peak : 0;
      const barW = (W - 12) / n;
      const maxHalf = (H - 24) / 2;
      g.fillStyle = '#4fd0a0';
      for (let i = 0; i < n; i++) {
        const half = Math.max(0.7, Math.min(1, waveBuckets[i] * norm) * maxHalf);
        g.fillRect(6 + i * barW, mid - half, Math.max(1, barW - 1), half * 2);
      }
      g.strokeStyle = '#2d2d2d';
      g.beginPath(); g.moveTo(6, mid); g.lineTo(W - 6, mid); g.stroke();
    }

    function renderRightPanel() {
      clear(right);
      right.append(h('div', { class: 'ag-panel-head' }, h('span', {}, 'Kick · a · EQ 7-Band'), h('span', { class: 'ag-panel-caret' }, '旁通')));
      right.append(h('div', { class: 'ag-panel-body' },
        h('canvas', { class: 'ag-wave', width: 232, height: 62 }),
        sliderRow('HPF 频率', 20, 1000, 1, eq.hpf, (v) => Math.round(v) + ' Hz', (v) => { eq.hpf = v; }),
        sliderRow('LF 增益', -12, 12, 0.1, eq.lf, (v) => v.toFixed(1) + ' dB', (v) => { eq.lf = v; }),
        sliderRow('HF 增益', -12, 12, 0.1, eq.hf, (v) => v.toFixed(1) + ' dB', (v) => { eq.hf = v; }),
        sliderRow('LPF 频率', 2000, 20000, 10, eq.lpf, (v) => (v / 1000).toFixed(1) + ' kHz', (v) => { eq.lpf = v; }),
        sectionLabel('速度'),
        sliderRow('BPM', 60, 160, 1, tempo, (v) => v, (v) => { tempo = v; scheduleWave(); }),
        h('p', { class: 'ag-hint' }, '推子与 M/S 实时影响声音；EQ 参数作用于示例显示。')));
      const wave = right.querySelector('canvas');
      waveCanvas = wave;
      drawWave(wave);
    }

    function render() {
      clear(strips);
      stripRefs.length = 0;
      TRACKS.forEach((t, i) => strips.append(stripEl(i)));
      strips.append(masterEl());
      renderEdit();
      renderRightPanel();
      updateTime();
      shell.setStatus('混音 · ' + TRACKS.length + ' 轨 + 主输出 · ' + (playing ? '播放中' : '停止'));
      shell.setInfo(tempo + ' BPM · 16 步');
      scheduleWave();
    }
    function setMeter() {
      stripRefs.forEach((ref, i) => {
        ref.meterFill.style.height = Math.round(levels[i] * 100) + '%';
        ref.db.textContent = (20 * Math.log10(Math.max(0.001, levels[i] * master))).toFixed(1) + ' dB';
      });
      if (masterRef) {
        masterRef.meterFill.style.height = Math.round(master * 100) + '%';
        masterRef.db.textContent = (20 * Math.log10(Math.max(0.001, master))).toFixed(1) + ' dB';
      }
    }

    function tick() {
      const ctx = ensure();
      const when = ctx.currentTime + 0.02;
      patterns.forEach((row, ti) => { if (row[step] && audible(ti)) voice(ctx, ti, when, step); });
      step = (step + 1) % STEPS;
      updateTime();
      highlightStep();
    }
    function togglePlay() {
      if (playing) { stop(); return; }
      ensure();
      playing = true;
      step = 0;
      tick();
      timer = setInterval(tick, 60000 / tempo / 4);
      render();
    }
    function stop() {
      playing = false;
      clearInterval(timer);
      render();
    }

    async function exportWav() {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Offline) return toastIn(shell.root, '当前浏览器不支持离线渲染');
      const rate = 44100;
      const spb = 60 / tempo / 4;
      const dur = spb * STEPS + 0.5;
      // 同一工程重复导出直接复用上一次的渲染结果：Chrome 的离线渲染跨会话
      // 可能有 1–2 LSB 浮点差，缓存保证「同一次工程导出两次」逐字节一致。
      const sig = waveSignatureOf();
      if (wavCache && wavCache.sig === sig) {
        download('soundcraft.wav', wavCache.blob, 'audio/wav');
        toastIn(shell.root, 'WAV 已导出 · 复用上次渲染');
        return;
      }
      const off = new Offline(2, Math.floor(rate * dur), rate);
      bypassLimiter.add(off);
      const saved = actx;
      actx = off;
      for (let s = 0; s < STEPS; s++) {
        patterns.forEach((row, ti) => { if (row[s] && audible(ti)) voice(off, ti, s * spb, s); });
      }
      actx = saved;
      const buf = await off.startRendering();
      // 母线限幅后仍可能残留少量过冲，导出前按 headroom 钳制兜底。
      const channels = [];
      for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
      const peak = bufferPeak(channels);
      if (peak > MASTER_OUTPUT_HEADROOM) clampPeak(channels);
      const blob = wavBlob(buf);
      wavCache = { sig: sig, blob: blob };
      download('soundcraft.wav', blob, 'audio/wav');
      toastIn(shell.root, 'WAV 已导出 · 峰值 ' + peak.toFixed(2) + (peak > MASTER_OUTPUT_HEADROOM ? '（已限幅到 0.98）' : ''));
    }

    // WAV 编码器已迁到 export.js 的 wavBlob，此处不再内联实现。
    shell.setMenus([
      { label: '文件', items: [
        { label: '保存到本机', onClick: persist },
        { label: '导出 WAV', shortcut: '⌘S', onClick: exportWav },
        { sep: true }, { label: '回到矩阵', onClick: shell.goHome },
      ] },
      { label: '传输', items: [
        { label: playing ? '停止' : '播放', shortcut: 'Space', onClick: togglePlay },
        { label: '回到开头', onClick: () => { step = 0; render(); } },
      ] },
      { label: '轨道', items: [
        { label: '全部取消静音', onClick: () => { mute.fill(false); render(); } },
        { label: '全部取消独奏', onClick: () => { solo.fill(false); render(); } },
      ] },
    ]);

    function onKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    }
    document.addEventListener('keydown', onKey);

    const scope = commandScope();
    scope.add('soundcraft.play', '播放/停止', togglePlay);
    scope.add('soundcraft.save', '保存工程到本机', persist);
    scope.add('soundcraft.export', '导出 WAV', exportWav);

    (function restore() {
      const saved = loadDoc('soundcraft');
      if (saved && saved.doc) applyDoc(saved.doc);
    })();
    render();
    return { destroy() {
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      if (actx && actx.close) { try { actx.close(); } catch (e) {} } // 释放音频上下文
      scope.dispose();
    } };
  },
});
