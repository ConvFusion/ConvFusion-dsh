/**
 * ConvFusion 2.0 — 研究进展桥（每轮对话结束展示一次）
 *
 * ## 它做什么
 *
 * ```text
 * agent/pre-step（新一轮开始）→ 记下"本轮开始前"的快照
 * agent/turn-stopping（本轮结束）→ 采新快照 → 求差 → 作为原生 notice 追加进会话
 * ```
 *
 * ## 为什么这是一个合法的原生通道
 *
 * 追加的是**已知事件类型** `user/message`，来源声明为
 * `{ kind: 'plugin', plugin: 'convfusion', form: 'notice', summary }`：
 *
 *   - `form: 'notice'` 是 DSH 自己的语境形态（*"a one-off account of something that just
 *     happened; it supersedes nothing"*），会渲染为**收起的转写行**，展开可见正文；
 *   - `surfaceOp: 'append'` 是必需的 —— 人类转写正是由"append 来源的 surface 事件"构成的
 *     （替换型事件只进模型历史，不进人类转写）；
 *   - 因此**不新增任何自定义事件类型**（那会让会话日志不可恢复，见 v2-Stage0）。
 *
 * ## 三条产品约束
 *
 * 1. **不猜**：快照全部来自磁盘上的真实资产（`progress.ts`）；
 * 2. **不强制**：缺口只陈述，用户可忽略；
 * 3. **不打断**：只在 `turn-stopping` 追加一条记录，**不唤醒新一轮**（不用 `followup`）。
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { captureProgress, diffProgress, renderProgressNotice, type ProgressSnapshot } from './progress.js'
import { DEFAULT_AUTO_CONTINUE, shouldAutoContinue, type AutoContinuePolicy } from './advance.js'
import { isResearchWorkspace } from './workspace.js'

/** 插件在会话里标识自己的名字。 */
export const PROGRESS_PLUGIN = 'convfusion'

/** 会话的最小视图（只用到 append）。 */
interface SessionLike {
  append: (type: string, data: unknown, opts?: { surfaceOp: 'append' }) => unknown
}

/** `agent/turn-stopping` 载荷的最小视图。 */
interface TurnPayload {
  agent?: { session?: SessionLike }
  turn?: number
}

/**
 * 把一条进展以 **notice** 形式追加进会话。
 *
 * @returns 追加成功返回 true；会话不可用时返回 false（不抛错）
 */
export function appendProgressNotice(session: SessionLike | undefined, summary: string, text: string): boolean {
  if (!session || typeof session.append !== 'function') return false
  try {
    session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: PROGRESS_PLUGIN },
      }),
      { surfaceOp: 'append' },
    )
    return true
  } catch {
    // 展示失败绝不能影响研究本身
    return false
  }
}

/**
 * 装上进展桥。
 *
 * @param ctx 插件上下文
 * @param resolveWorkspace 当前研究 workspace（每次求值）
 * @returns 卸载函数
 */
export function mountProgressBridge(
  ctx: Context,
  resolveWorkspace: () => string,
  skillContent?: (id: string) => string | undefined,
  policy: AutoContinuePolicy = DEFAULT_AUTO_CONTINUE,
): () => void {
  /** 本轮的起始快照（按轮号保存，避免多轮交叉时串味）。 */
  const baseline = new Map<number, ProgressSnapshot>()
  /** 连续多少轮没有形成新资产（用于判定"停滞"）。 */
  let staleRounds = 0
  /** 本次会话已连续自动推进的轮数（预算上限，防止无人值守跑飞）。 */
  let autoRounds = 0
  /** 用户是否在自动推进期间插过话（插话即视为接管，停止自动推进）。 */
  let userIntervened = false

  ctx.on('agent/inbox/inserted', (payload: unknown) => {
    // 任何非本插件来源的输入都视为用户接管 → 立刻停止自动推进
    try {
      const p = payload as { message?: { source?: { kind?: string; plugin?: string } } }
      const src = p.message?.source
      if (src?.kind === 'user') userIntervened = true
    } catch {
      /* 观测失败不影响主流程 */
    }
  })

  const onPreStep = (payload: unknown, next: () => unknown): unknown => {
    // ⚠️ `agent/pre-step` 是 waterfall：必须放行，否则会阻断 Agent 运行。
    try {
      const ws = resolveWorkspace()
      // 非研究工作区不捕获快照
      if (!isResearchWorkspace(ws)) return next()
      const p = payload as TurnPayload
      const turn = typeof p.turn === 'number' ? p.turn : -1
      if (turn >= 0 && !baseline.has(turn)) {
        baseline.set(turn, captureProgress(ws, skillContent))
        // 只保留最近若干轮，避免长会话内存增长
        for (const key of [...baseline.keys()]) if (key < turn - 4) baseline.delete(key)
      }
    } catch {
      /* 观测失败不影响主流程 */
    }
    return next()
  }

  const onTurnStopping = (payload: unknown): void => {
    try {
      const p = payload as TurnPayload
      const turn = typeof p.turn === 'number' ? p.turn : -1
      const ws = resolveWorkspace()
      // 非研究工作区不显示进展提示
      if (!isResearchWorkspace(ws)) return
      const after = captureProgress(ws, skillContent)

      // 没有起始快照（例如会话是从本插件装配之前开始的）→ 用当前状态作基线，
      // 这样至少能显示"现在到哪了"，而不会出现假的 +N。
      const before = baseline.get(turn) ?? after
      baseline.delete(turn)

      // 停滞计数：本轮相对"本轮起点"没有新增可验证资产就 +1，否则清零
      const grew =
        after.counts.evidence > before.counts.evidence ||
        after.counts.claims > before.counts.claims ||
        after.counts.decisions > before.counts.decisions ||
        after.counts.plans > before.counts.plans ||
        after.counts.outputs > before.counts.outputs ||
        after.counts.paperPresent !== before.counts.paperPresent
      staleRounds = grew ? 0 : staleRounds + 1
      if (grew) autoRounds = 0

      const diff = diffProgress(before, after)
      const { summary, text } = renderProgressNotice(diff, after.advance)
      appendProgressNotice(p.agent?.session, summary, text)

      // ── 自主推进闸门 ────────────────────────────────────────────────
      // 方向明确且用户没插话、预算未尽 → 直接继续；否则停下等用户。
      // 判定依据全部来自磁盘资产（见 advance.ts），不是语义猜测。
      const gate = shouldAutoContinue(after.advance, policy, autoRounds)
      if (gate.go && !userIntervened) {
        autoRounds += 1
        ctx.logger?.info(
          `[convfusion] 自动推进 ${autoRounds}/${policy.maxRounds}：${gate.reason}`,
        )
        // 交给原生 Agent 再走一轮（与 /research 同一个通道；不接管执行）
        const agent = p.agent as unknown as { followup?: (m: unknown) => void } | undefined
        agent?.followup?.(
          createUserMessage({
            content: [
              {
                type: 'text',
                text:
                  `继续推进这项研究（第 ${autoRounds} 轮自动推进，最多 ${policy.maxRounds} 轮）。\n\n` +
                  `当前科研过程阶段：**${after.stage?.label ?? '（无）'}** —— ${
                    after.advance.nextStep ?? after.advance.basis
                  }\n\n` +
                  '按需要读工作区与能力库，自行判断该做什么；需要真正执行时先写 `plans/*.md`。' +
                  '若发现存在多个势均力敌、必须由人取舍的方向，**停下来告诉用户**，不要替用户决定。',
              },
            ],
            source: { kind: 'plugin', plugin: PROGRESS_PLUGIN },
          }),
        )
      } else if (!gate.go && after.advance.clarity !== 'clear') {
        ctx.logger?.info(`[convfusion] 停止自动推进，等待用户：${gate.reason}`)
      }
    } catch (e) {
      ctx.logger?.warn(`[convfusion] 研究进展展示失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  ctx.on('agent/pre-step', onPreStep as never)
  ctx.on('agent/turn-stopping', onTurnStopping as never)

  return () => {
    baseline.clear()
    staleRounds = 0
    autoRounds = 0
  }
}
