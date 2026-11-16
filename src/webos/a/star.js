import { h, api } from './can.js';
import { t } from './i18n.js';

// 星标提示：状态与判定都在 Go 内核（star.go），前端只负责问和报告答复。
// 这里不保存任何计数，也不拼链接——链接只有内核里那一个常量。

export async function starFinished() {
  const result = await api('star.finished', { method: 'POST', fields: {} });
  const detail = result.detail || {};
  return detail.offer === true;
}

export function starDismiss() {
  return api('star.dismiss', { method: 'POST', fields: {} }).catch(() => { /* 答复没记上也不打扰用户 */ });
}

// 返回“浏览器是否真的接住了这次跳转”：内核只有在 openExternal 成功后才记 opened。
export async function starOpen() {
  try {
    await api('star.open', { method: 'POST', fields: {} });
    return true;
  } catch (e) {
    return false;
  }
}

// 第一次成功运行后出现的一次性询问。两个按钮都是答复，点星与拒绝都会永久关闭。
// onOpened 让外壳当场收起常驻入口，不必等下一次启动或刷新。
export function starAsk(options) {
  const opts = options || {};
  const card = h('aside', { class: 'os-star-ask', role: 'note' });
  const close = () => { if (card.parentNode) card.parentNode.removeChild(card); };
  card.append(
    h('span', { class: 'os-star-ask-text' }, t('如果 NexlOS 对你有用，可以在 GitHub 上点一颗星。')),
    h('div', { class: 'os-star-ask-actions' },
      h('button', {
        type: 'button', class: 'os-star-ask-primary',
        onclick: async () => {
          const opened = await starOpen();
          void starDismiss();
          if (opened && typeof opts.onOpened === 'function') opts.onOpened();
          close();
        },
      }, t('在 GitHub 上点星标')),
      h('button', {
        type: 'button',
        onclick: () => { void starDismiss(); close(); },
      }, t('不用了，谢谢'))),
  );
  return card;
}
