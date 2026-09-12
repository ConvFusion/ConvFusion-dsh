/**
 * ConvFusion 2.0 — 推进判定（下一步是否需要用户拍板）
 *
 * ## 用户要求
 *
 * > 增加对当前进展的评价；如果下一步方向比较明确、不需要用户输入，就**直接继续推进**；
 * > 除非有**非常难的抉择**，才提醒用户，由用户决定选哪个方向。
 *
 * 所以这里回答的不是"研究到了哪一步"（那是 `research-process.ts`），而是：
 *
 * ```text
 * 下一步清楚吗？
 *   ├── clear     → 可以自主继续（不需要用户）
 *   ├── ambiguous → 有多个势均力敌的方向 / 连续几轮没有进展 → 提醒用户选
 *   └── blocked   → 有明确标着"阻塞"的问题未决 → 必须用户拍板
 * ```
 *
 * ## 一条硬约束：不猜
 *
 * 判定**全部来自磁盘上的可核查依据**，不做语义猜测：
 *
 *   - 阻塞项：研究问题里带**显式标记**的（`[blocking]` / `（阻塞项）`）。
 *     是标记驱动的 —— 插件没有能力判断"这个问题难不难"，只有作者/用户能标。
 *   - 停滞：连续 N 轮研究资产计数无变化（由调用方传入连续轮数）。
 *   - 歧义：存在 ≥2 个 **draft** 状态且互斥的候选计划（说明方向还没收敛）。
 *   - 其余情况视为 clear，但 clear **只在"下一步确实是常规推进"时才成立**：
 *     当前科研过程阶段还缺产出，且没有停滞、没有歧义、没有阻塞。
 *
 * ⚠️ 判定结果只影响"要不要自动继续"，**不驱动任何研究内容本身**；
 * 每一次自动继续仍然是原生 Agent 的一整轮，用户随时可以插话。
 */

import { loadProjectFile } from './project.js'
import { listPlanDocuments } from './plans.js'
import { assessResearchProcess, type ProcessAssessment } from './research-process.js'

/** 推进判定结果。 */
export type AdvanceClarity = 'clear' | 'ambiguous' | 'blocked'

/** 一次推进判定。 */
export interface AdvanceAssessment {
  clarity: AdvanceClarity
  /** 判定依据（可核查的一句话）。 */
  basis: string
  /** 建议的下一步（`clarity === 'clear'` 时给出；否则为空）。 */
  nextStep?: string
  /** 需要用户决定的事项（`clear` 时为空）。 */
  needsUserDecision?: string
}

/**
 * 判断研究问题里是否有**显式标记**的阻塞项。
 *
 * 标记是刻意的：插件无法判断一个问题的"难度"，只有写下它的人能标。
 * 支持中英两种写法，见 `project.md` 的约定。
 */
export function findBlockingQuestion(questions: readonly string[] | undefined): string | undefined {
  for (const q of questions ?? []) {
    if (/\[blocking\]/i.test(q) || /（阻塞项）|\(阻塞项\)/.test(q)) return q
  }
  return undefined
}

/** 判定输入。 */
export interface AdvanceInput {
  workspace: string
  /** 连续多少轮研究资产没有变化（由进展桥统计）。 */
  staleRounds?: number
  /** 连续停滞多少轮就认为需要用户介入。 */
  staleThreshold?: number
  /** 过程评估（缺省现算）。 */
  process?: ProcessAssessment
}

/** 默认停滞阈值。 */
export const DEFAULT_STALE_THRESHOLD = 2

/**
 * 判定下一步是否需要用户拍板。
 *
 * @returns 判定结果（含依据）；**不做任何写入**
 */
export function assessAdvance(input: AdvanceInput): AdvanceAssessment {
  const process = input.process ?? assessResearchProcess(input.workspace)
  const project = loadProjectFile(input.workspace)
  const staleThreshold = input.staleThreshold ?? DEFAULT_STALE_THRESHOLD
  const staleRounds = input.staleRounds ?? 0

  // ① 显式阻塞项 —— 最高优先级：有人已经说了"这里必须你定"。
  const blocking = findBlockingQuestion(project?.questions)
  if (blocking) {
    return {
      clarity: 'blocked',
      basis: '研究问题中存在显式标记的阻塞项',
      needsUserDecision: blocking,
    }
  }

  // ② 连续停滞 —— 再自动化下去只是空转。
  if (staleRounds >= staleThreshold) {
    return {
      clarity: 'ambiguous',
      basis: `连续 ${staleRounds} 轮没有形成新的可验证研究资产`,
      needsUserDecision:
        '当前推进方式没有产生资产。请确认：是继续这个方向，还是换一个方向／调整目标？',
    }
  }

  // ③ 方向未收敛 —— 多个草稿计划并存说明候选还没被排过序。
  const drafts = listPlanDocuments(input.workspace).filter((p) => p.status === 'draft')
  if (drafts.length >= 2) {
    return {
      clarity: 'ambiguous',
      basis: `存在 ${drafts.length} 个仍是 draft 的计划（${drafts.map((p) => p.id).join(', ')}）`,
      needsUserDecision:
        '多个计划都还是草稿、没有排序。请确认以哪一个为准，或说明取舍标准。',
    }
  }

  // ④ 过程已全部落地且无缺口 —— 没有"明确的下一步"，属于持续演化，交回用户。
  if (!process.current) {
    return {
      clarity: 'ambiguous',
      basis: '科研过程各阶段均已有落地资产，没有结构性缺口',
      needsUserDecision: '接下来是继续深化、转向写作，还是开新的问题？请指定方向。',
    }
  }

  // ⑤ 其余视为明确：当前阶段缺产出，且它就是下一步。
  const stage = process.current.stage
  return {
    clarity: 'clear',
    basis: `当前阶段「${stage.label}」尚未落地（${process.current.evidence}）`,
    nextStep: stage.produces,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 自动继续的闸门
 * ════════════════════════════════════════════════════════════════════════ */

/** 自动继续策略。 */
export interface AutoContinuePolicy {
  /** 是否启用自动继续（设置项）。 */
  enabled: boolean
  /** 单次会话内最多连续自动推进多少轮（防止无人值守跑飞）。 */
  maxRounds: number
}

/** 默认策略：开启，最多连续 3 轮。 */
export const DEFAULT_AUTO_CONTINUE: AutoContinuePolicy = { enabled: true, maxRounds: 3 }

/**
 * 是否应当自动继续。
 *
 * @param assessment 推进判定
 * @param policy 策略
 * @param roundsUsed 本会话已连续自动推进的轮数
 */
export function shouldAutoContinue(
  assessment: AdvanceAssessment,
  policy: AutoContinuePolicy,
  roundsUsed: number,
): { go: boolean; reason: string } {
  if (!policy.enabled) return { go: false, reason: 'auto-continue disabled by settings' }
  if (assessment.clarity !== 'clear') {
    return { go: false, reason: `next step is ${assessment.clarity}: ${assessment.basis}` }
  }
  if (roundsUsed >= policy.maxRounds) {
    return { go: false, reason: `auto-continue budget exhausted (${roundsUsed}/${policy.maxRounds})` }
  }
  return { go: true, reason: assessment.basis }
}
