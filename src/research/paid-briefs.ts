/**
 * ConvFusion 2.0 — **已经买过的简报**（本机记录）
 *
 * ## 为什么需要
 *
 * 简报（Level 2）按 `(viewer, project)` **买一次**：服务器用不可变账本保证
 * 再打开同一项研究**不会重复扣费**（`ConvFusion-server` 的 `token.py:has_paid_brief`）。
 * 但 `GET /discovery/random` 与 `/projects/{id}/summary` 的响应里**没有**这个状态
 * （只有 `/projects/{id}/brief` 的 `charged_tokens` 才告诉你"这次花了没有"）——
 * 也就是说：**点下去之前**客户端无法从服务器知道自己是否已经买过。
 *
 * 于是界面只能每次都弹"要花 1 Token"的确认框。可一旦成功读过一次，
 * 服务器就已保证"以后永远免费"，再确认就是纯粹的打扰。
 *
 * 这个存储补上这一段：**成功读过 ⇒ 记住**，之后这一项就直接读、不再提醒。
 *
 * ## 记录什么、放哪里
 *
 * 键是 `serverUrl|accountId|projectId` —— 换服务器、换账号都不能复用：
 * 换账号时"我买过"这件事并不成立，若复用了记录就会**静默扣费**（正是要避免的事）。
 *
 * 它记的是"本机 + 本账号 + 哪台服务器"的购买事实，不属于研究内容，
 * 所以与 Skill 定制同目录（`$DSH_HOME/convfusion/`），**不进工作区、不进 git**。
 *
 * ## 与服务器状态的关系（重要）
 *
 * 这只是**本地记忆**，不是权威：别人在另一台机器上买过、或本机记录被删掉时，
 * 界面会多弹一次确认框 —— 那一次服务器扣 0（`charged_tokens === 0`），
 * 于是回执会说"已读取（余额 N）"而**不会**谎报扣费。宁可多问一次，不可静默扣费。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 记录键：同一台服务器 + 同一个账号 + 同一个项目才算"我买过"。 */
export function paidBriefKey(serverUrl: string, accountId: string, projectId: string): string {
  return `${serverUrl.trim()}|${accountId.trim()}|${projectId.trim()}`
}

export interface PaidBriefStore {
  /** 这一项（服务器 + 账号 + 项目）是否已经买过简报。 */
  has(serverUrl: string, accountId: string, projectId: string): boolean
  /** 记下"买过了"（幂等）。返回是否**新增**。 */
  mark(serverUrl: string, accountId: string, projectId: string): boolean
}

/** 容错解析：坏文件当空的（本地记忆丢了只是多问一次，不该让设置页打不开）。 */
function parseTable(text: string): Record<string, string> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return {}
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** 文件存储（与 `published-store` 同款：临时文件 + rename，避免写一半的坏文件）。 */
export function createFilePaidBriefStore(resolvePath: () => string): PaidBriefStore {
  const load = (): Record<string, string> => {
    try {
      const path = resolvePath()
      if (!existsSync(path)) return {}
      return parseTable(readFileSync(path, 'utf8'))
    } catch {
      return {}
    }
  }
  const save = (table: Record<string, string>): void => {
    const path = resolvePath()
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, `${JSON.stringify(table, null, 2)}\n`, 'utf8')
    renameSync(tmp, path)
  }
  return {
    has: (serverUrl, accountId, projectId) => Boolean(load()[paidBriefKey(serverUrl, accountId, projectId)]),
    mark: (serverUrl, accountId, projectId) => {
      const key = paidBriefKey(serverUrl, accountId, projectId)
      const table = load()
      if (table[key]) return false
      table[key] = new Date().toISOString()
      save(table)
      return true
    },
  }
}

/** 内存存储（离线测试用）。 */
export function createMemoryPaidBriefStore(seed: Record<string, string> = {}): PaidBriefStore {
  const table: Record<string, string> = { ...seed }
  return {
    has: (serverUrl, accountId, projectId) => Boolean(table[paidBriefKey(serverUrl, accountId, projectId)]),
    mark: (serverUrl, accountId, projectId) => {
      const key = paidBriefKey(serverUrl, accountId, projectId)
      if (table[key]) return false
      table[key] = new Date().toISOString()
      return true
    },
  }
}
