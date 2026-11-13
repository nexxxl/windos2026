// 伴侣的状态机：把「AI 工具正在干什么」变成一套有优先级的表演状态。
//
// 多个来源同时报状态时，只演优先级最高的一个；
// error / notification / attention 是短促的一次性动作，演完自动回到持续状态。
// 调度约束：
//   - 持久状态有 TTL，事件停了就自然回到 idle，不会永远卡在 working
//   - 一次性状态有固定时长，不会被后续事件截断
//   - 60 秒没有互动进入睡眠序列，任何信号都会走 waking 把它叫醒
//   - 优先级表是唯一事实来源，UI 只订阅结果

export const COMPANION_PRIORITY = {
  error: 8,
  notification: 7,
  attention: 5,
  juggling: 4,
  executing: 3.5,
  working: 3,
  thinking: 2,
  idle: 1,
  sleeping: 0,
};

// 一次性动作的演出时长（毫秒）。
const ONESHOT = {
  error: 5200,
  notification: 3600,
  attention: 2600,
};

// 持久状态的保活时长：没有新事件就退回 idle。
const HOLD = {
  thinking: 22000,
  working: 15000,
  executing: 12000,
  juggling: 20000,
};

const SLEEP_AFTER = 60000;
const YAWN_MS = 2400;
const DOZE_MS = 3600;
const WAKE_MS = 1200;

export const STATE_LABEL = {
  idle: '安静',
  thinking: '思考',
  working: '干活',
  executing: '跑工具',
  juggling: '多线程',
  attention: '等你',
  notification: '做完了',
  error: '出错',
  yawning: '打哈欠',
  dozing: '犯困',
  sleeping: '睡着',
  waking: '醒来',
};

function nowMs() { return Date.now(); }

function priority(name) {
  return Object.prototype.hasOwnProperty.call(COMPANION_PRIORITY, name)
    ? COMPANION_PRIORITY[name] : 0;
}

export function createCompanionState(options) {
  const opts = options || {};
  let onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
  const clock = typeof opts.now === 'function' ? opts.now : nowMs;

  let base = 'idle';
  let baseTill = 0;
  let shot = '';
  let shotTill = 0;
  let lastActionAt = clock();
  let sleepPhase = '';   // '' | yawning | dozing | sleeping | waking
  let sleepAt = 0;
  let effective = 'idle';
  let reducedMotion = false;

  function emit(since) {
    const info = {
      state: effective,
      since: since || clock(),
      label: STATE_LABEL[effective] || effective,
      sleeping: effective === 'sleeping' || effective === 'dozing' || effective === 'yawning',
    };
    onChange(effective, info);
    return info;
  }

  // 只计算，不改变内部计时；tick 负责在状态自然过期时发通知。
  function resolve(now) {
    if (sleepPhase) {
      if (sleepPhase === 'yawning' && now - sleepAt >= YAWN_MS) {
        sleepPhase = 'dozing';
        sleepAt = now;
      } else if (sleepPhase === 'dozing' && now - sleepAt >= DOZE_MS) {
        sleepPhase = 'sleeping';
        sleepAt = now;
      } else if (sleepPhase === 'waking' && now - sleepAt >= WAKE_MS) {
        sleepPhase = '';
        sleepAt = 0;
      }
    }
    if (sleepPhase) return sleepPhase;
    if (shot && now < shotTill) {
      if (priority(shot) >= priority(base)) return shot;
    }
    if (base && base !== 'idle' && (baseTill === 0 || now < baseTill)) return base;
    if (!reducedMotion && base === 'idle' && now - lastActionAt >= SLEEP_AFTER) {
      sleepPhase = 'yawning';
      sleepAt = now;
      return sleepPhase;
    }
    return 'idle';
  }

  function setBase(name, ttl) {
    base = name;
    if (name === 'idle' || !ttl) baseTill = 0;
    else baseTill = clock() + ttl;
  }

  function wake(now) {
    lastActionAt = now;
    if (!sleepPhase) return false;
    if (sleepPhase === 'waking') return false;
    // 睡着被叫醒时先演 waking，再回到 idle。
    sleepPhase = 'waking';
    sleepAt = now;
    return true;
  }

  function signal(name, meta) {
    const now = clock();
    const m = meta || {};
    if (!name) return;
    lastActionAt = now;
    if (name === 'wake' || name === 'poke') {
      if (wake(now)) {
        setBase('idle', 0);
        shot = '';
        shotTill = 0;
        return refresh({ force: true });
      }
      return;
    }
    if (name === 'idle' || name === 'done') {
      setBase('idle', 0);
      shot = '';
      shotTill = 0;
      if (sleepPhase) sleepPhase = '';
      return refresh({ force: true });
    }
    // 一轮工作结束：清掉持久态，但不打断正在演的一次性动作。
    if (name === 'settle') {
      setBase('idle', 0);
      return refresh({ force: false });
    }
    if (Object.prototype.hasOwnProperty.call(ONESHOT, name)) {
      if (sleepPhase) sleepPhase = '';
      shot = name;
      shotTill = now + (m.ttl || ONESHOT[name]);
      return refresh({ force: true });
    }
    if (Object.prototype.hasOwnProperty.call(HOLD, name)) {
      if (sleepPhase) sleepPhase = '';
      setBase(name, m.ttl || HOLD[name]);
      // 持久状态不能压掉正在进行的一次性动作；等它演完自然回落到这里。
      return refresh({ force: false });
    }
  }

  function refresh(options) {
    const o = options || {};
    const now = clock();
    const next = resolve(now);
    if (next === effective && !o.force) return effective;
    const since = now;
    effective = next;
    emit(since);
    return effective;
  }

  function tick() {
    return refresh({ force: false });
  }

  function reset() {
    base = 'idle';
    baseTill = 0;
    shot = '';
    shotTill = 0;
    sleepPhase = '';
    sleepAt = 0;
    lastActionAt = clock();
    if (effective !== 'idle') {
      effective = 'idle';
      emit(clock());
    }
  }

  function snapshot() {
    return {
      state: effective,
      base: base,
      oneShot: shot,
      sleeping: !!sleepPhase,
      idleMs: clock() - lastActionAt,
    };
  }

  function setReducedMotion(on) {
    reducedMotion = !!on;
    if (reducedMotion && sleepPhase === 'yawning') sleepPhase = '';
  }

  return {
    signal: signal,
    tick: tick,
    reset: reset,
    snapshot: snapshot,
    setReducedMotion: setReducedMotion,
    current: function () { return effective; },
  };
}
