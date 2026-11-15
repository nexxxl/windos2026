/**
 * 能力表：本版「到底支持什么」的唯一出处。
 *
 * 背景：插件版的若干命令在 Go 通用版里有权威实现（任务库、伴侣生活包、BYOK），
 * 到了插件版没有对应服务。此前它们返回「空数组 / 未运行 / null」——形状合法、
 * 语义是假的：界面会显示「0 个任务」「没有运行任务」，用户看不出这是不支持。
 *
 * 这里的约定：
 *   implemented  真的做了，返回值就是事实
 *   degraded     部分可用或只是兼容空操作，调用方必须能读出不完整
 *   unavailable  本版不提供，命令返回 UNSUPPORTED_CAPABILITY 而不是假成功
 *
 * 状态只写在这里，命令实现与界面都从这里取，避免两处各写一份再漂移。
 */

export const CAPABILITY_STATUS = Object.freeze({
  implemented: 'implemented',
  degraded: 'degraded',
  unavailable: 'unavailable'
})

/** 命令级能力表。command 用 * 结尾表示整组。 */
const ENTRIES = Object.freeze([
  {
    command: 'task.list',
    status: CAPABILITY_STATUS.unavailable,
    reason: '插件版没有任务库；DSH 会话才是任务事实的来源',
    requiredHostService: 'task-store'
  },
  {
    command: 'task.open',
    status: CAPABILITY_STATUS.unavailable,
    reason: '插件版没有任务库，无法打开任务详情',
    requiredHostService: 'task-store'
  },
  {
    command: 'task.update',
    status: CAPABILITY_STATUS.unavailable,
    reason: '插件版没有任务库，任务状态由 DSH 会话承担',
    requiredHostService: 'task-store'
  },
  {
    command: 'companion.list',
    status: CAPABILITY_STATUS.unavailable,
    reason: '本版不随包分发桌面伴侣生活包',
    requiredHostService: 'companion-packs'
  },
  {
    command: 'companion.get',
    status: CAPABILITY_STATUS.unavailable,
    reason: '本版不随包分发桌面伴侣生活包',
    requiredHostService: 'companion-packs'
  },
  {
    command: 'clip.set',
    status: CAPABILITY_STATUS.degraded,
    reason: '只有浏览器上下文能写剪贴板；服务端不代写系统剪贴板'
  },
  {
    command: 'surface.hide',
    status: CAPABILITY_STATUS.degraded,
    reason: '插件版没有独立窗口调度，该命令是兼容空操作'
  },
  {
    command: 'star.open',
    status: CAPABILITY_STATUS.degraded,
    reason: '插件版没有收藏星标，该命令是兼容空操作'
  },
  {
    command: 'star.finished',
    status: CAPABILITY_STATUS.degraded,
    reason: '插件版没有收藏星标，该命令是兼容空操作'
  },
  {
    command: 'star.dismiss',
    status: CAPABILITY_STATUS.degraded,
    reason: '插件版没有收藏星标，该命令是兼容空操作'
  },
  {
    command: 'agent.byok',
    status: CAPABILITY_STATUS.unavailable,
    reason: 'BYOK 由宿主配置页承担，插件不保存也不回显密钥',
    requiredHostService: 'agentDefaultModel'
  },
  {
    command: 'agent.run.current',
    status: CAPABILITY_STATUS.unavailable,
    reason: '插件不保留运行项索引；当前任务以 DSH 会话为准',
    requiredHostService: 'sessionController'
  }
])

/** 取全部能力（副本，调用方改不到内部表）。 */
export function capabilityList() {
  return ENTRIES.map((entry) => ({ ...entry }))
}

/** 按命令名查能力；没有登记的命令视为 implemented（由实现自己负责）。 */
export function capabilityOf(command) {
  const name = String(command || '')
  const exact = ENTRIES.find((entry) => entry.command === name)
  if (exact) return { ...exact }
  return { command: name, status: CAPABILITY_STATUS.implemented, reason: '' }
}

/**
 * 构造 UNSUPPORTED_CAPABILITY 错误。
 *
 * 返回 501 而不是 200 + 空数组：调用方（界面或模型工具）必须能在状态码上分辨
 * 「没有数据」和「不支持这件事」。error.code 供程序判断，error.message 给人看。
 */
export function unsupportedCapability(command, detail) {
  const entry = capabilityOf(command)
  const error = new Error(`UNSUPPORTED_CAPABILITY: ${entry.reason || command + ' 在插件版不可用'}`)
  error.status = 501
  error.code = 'UNSUPPORTED_CAPABILITY'
  error.capability = command
  if (detail) error.detail = detail
  return error
}
