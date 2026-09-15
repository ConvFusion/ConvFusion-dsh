/**
 * ConvFusion 2.0 — 会话工作区解析（**权威来源**）
 *
 * ## 为什么需要这个模块
 *
 * 插件曾把"当前工作区"记在一个由 `agent/pre-step` 持续同步的模块变量里，初值是
 * `process.cwd()` —— 那是 **DSH 服务进程**的启动目录，**与会话无关**。一旦同步没生效
 * （例如载荷里取不到会话 cwd），全部研究能力就会按 DSH 的启动目录工作：
 * 在**插件开发仓库**的会话里注入了另一个研究项目的上下文、并显示它的进展报告
 * （2026-09 实测发生，见会话日志里的 `convfusion:research-context`）。
 *
 * 权威来源是**会话自己**：
 *
 * ```text
 * ctx.sessions.get(sessionId).header.cwd
 * ```
 *
 * `SessionHeader.cwd` 的定义就是 *"Absolute working directory the session was created in"*，
 * 由会话存储填写，不受插件进程启动目录影响。
 */

import { isAbsolute, resolve } from 'node:path'
import { researchWorkspaceOf } from './workspace.js'

/** 会话存储的最小视图（只用到按 id 查询）。 */
export interface SessionStoreLike {
  get(id: string): { header?: { cwd?: string } } | undefined
}

/** 插件上下文的最小视图（只用到按名取服务）。 */
export interface ServiceLookupLike {
  get(name: string): unknown
}

/**
 * 取会话存储。
 *
 * 用 `ctx.get('sessions')` 而**不是** `ctx.sessions`：后者要求先 `inject`，
 * 未注入时的属性访问会抛错；而这里希望"拿不到就退化为旧行为"，不该抛。
 */
export function sessionStoreOf(ctx: ServiceLookupLike): SessionStoreLike | undefined {
  try {
    const store = ctx.get('sessions')
    if (store && typeof (store as SessionStoreLike).get === 'function') return store as SessionStoreLike
  } catch {
    /* 取不到服务不是错误：调用方退化为其它来源 */
  }
  return undefined
}

/**
 * 会话 id → 该会话的工作区绝对路径。
 *
 * @returns 拿不到会话或会话没有 cwd 时返回 `undefined`（**不**退化成 `process.cwd()`，
 *          调用方负责决定兜底策略，避免又把"服务进程启动目录"当研究会话）
 */
export function resolveSessionWorkspace(ctx: ServiceLookupLike, sessionId: string | undefined): string | undefined {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!id) return undefined
  try {
    const cwd = sessionStoreOf(ctx)?.get(id)?.header?.cwd
    if (typeof cwd === 'string' && cwd.trim()) return isAbsolute(cwd) ? resolve(cwd) : resolve(process.cwd(), cwd)
  } catch {
    /* 解析失败不阻断任何主流程 */
  }
  return undefined
}

/**
 * 会话 id → { 会话工作区, **研究根目录** }（新布局下研究根 = `<会话工作区>/workspace`）。
 *
 * 为什么单独有这个函数：`systemPrompt` 的 `section`/`context` 贡献者**每次组装**求值，
 * 而它们过去用的是入口注入的**全局**解析（依赖 `agent/pre-step` 同步的全局 cwd）。
 * 多个会话并行时那个全局值可能已被别的会话覆盖 —— 于是研究会话的上下文会注入到
 * 普通对话里（与"进度卡显示在所有对话里"同一类故障）。
 *
 * @returns 拿不到会话身份 / 会话没有 cwd 时返回 `undefined`：**不**退化成
 *          `process.cwd()`，由调用方决定兜底（通常退化为旧的全局解析）。
 */
export function researchTargetsForSession(
  ctx: ServiceLookupLike,
  sessionId: string | undefined,
): { session: string; root: string } | undefined {
  const session = resolveSessionWorkspace(ctx, sessionId)
  if (!session) return undefined
  return { session, root: researchWorkspaceOf(session) }
}
