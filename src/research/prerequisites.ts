/**
 * ConvFusion 2.0 — 技能前置依赖（嵌入式编排器）
 *
 * ## 它是什么
 *
 * 每个技能在自己的 `## Prerequisites` 节里声明「做这一步前，哪些**信号**应已落地」。
 * 本模块把这些声明聚合成一张依赖图，按磁盘资产判定「前置是否满足」，**只做提示**，
 * 不驱动执行、不阻塞操作（与 `research-process` 的阶段模型同一条边界）。
 *
 * ```text
 * ① 机器可读围栏块    —— 技能正文里 `requires:` 块（与 `stage:` 块同款）
 * ② 用户定制覆盖层    —— composeSkillContent 用户文本拼前 + 「取第一个块」解析 → 用户优先
 * ③ 代码固定判定      —— 复用 stage-signals.ts 的 STAGE_SIGNALS + judgeSignal，用户改图改不了判定
 * ```
 *
 * ## 依赖顶点用信号、不用 Skill id
 *
 * 「做 X 前 Y 落地了吗」看的是**磁盘资产**（信号），不是「跑没跑过某技能」：信号单调
 * （落地后不再消失），依赖图天然无环；且与 v2「只看资产」的判定哲学一致。
 *
 * ## 格式
 *
 * ```text
 * requires: <signal>[/<signal>] | <说明>
 * ```
 *
 * - 行内 `/` = OR（任一落地即满足该行）；多行 = AND（全部满足）。
 * - 未知信号 → 不判定、不阻塞（与 stage 信号「留空/写错 → 不判定」一致）。
 * - 缺 `## Prerequisites` 节 = 该技能无前置。
 */

import { STAGE_SIGNALS, buildSignalContext, judgeSignal, type SignalContext, type StageSignal } from './stage-signals.js'

/** 一条前置依赖：一行 `requires:`，含一个 OR 信号组。 */
export interface PrerequisiteLine {
  /** OR 信号组（未知信号保留用于展示）。 */
  signals: string[]
  /** 说明（行尾 `|` 之后的文字，不参与判定）。 */
  note: string
}

/** 一个技能的全部前置依赖（行间 = AND）。 */
export type Prerequisites = PrerequisiteLine[]

/**
 * 从技能正文里解析前置依赖块。
 *
 * 取**第一个**含 `requires:` 行的连续块（与 `parseStages` 同规则）：用户定制在合成时
 * 拼在前，故用户的块天然优先。
 */
export function parsePrerequisites(content: string | undefined): Prerequisites | undefined {
  if (!content) return undefined
  const out: PrerequisiteLine[] = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    const m = /^requires:\s*(.+)$/i.exec(line)
    if (!m) {
      // 已收集到依赖：遇到闭合围栏或块外非空行即结束**第一个块**
      // （用户定制拼在前，故只取第一个块 → 用户定义优先于系统原文）
      if (out.length > 0 && (line.startsWith('```') || line !== '')) break
      continue
    }
    const body = m[1]
    // 信号名是 slug（无 `|`），故第一个 `|` 即说明分隔；说明内可含 `|`
    const idx = body.indexOf('|')
    let req = body
    let note = ''
    if (idx >= 0) {
      req = body.slice(0, idx).trim()
      note = body.slice(idx + 1).trim()
    } else {
      req = body.trim()
    }
    const signals = req.split('/').map((s) => s.trim()).filter(Boolean)
    if (signals.length === 0) continue
    out.push({ signals, note })
  }
  return out.length > 0 ? out : undefined
}

/** 一个技能的前置依赖评估结果。 */
export interface SkillPrerequisiteStatus {
  skillId: string
  /** 该技能声明的前置依赖（无则空数组）。 */
  prerequisites: Prerequisites
  /** 未满足的依赖行（行内 OR 任一落地即满足，整行未满足才进这里）。 */
  unmet: Array<{ signals: string[]; note: string; missingSignals: string[] }>
  /** 是否全部前置已满足（无前置 → true）。 */
  satisfied: boolean
}

/** 信号是否在固定词表内（未知信号不判定、不阻塞）。 */
export function isKnownSignal(signal: string): signal is StageSignal {
  return (STAGE_SIGNALS as readonly string[]).includes(signal)
}

/**
 * 评估一组技能的前置依赖。
 *
 * @param skills 技能 id 与**生效正文**（含用户定制）的配对
 * @param ctx 信号判定上下文（用 `buildSignalContext` 构建，复用阶段评估的同一份读盘）
 */
export function assessPrerequisites(
  skills: ReadonlyArray<{ id: string; content: string | undefined }>,
  ctx: SignalContext,
): SkillPrerequisiteStatus[] {
  const out: SkillPrerequisiteStatus[] = []
  for (const { id, content } of skills) {
    const prerequisites = parsePrerequisites(content) ?? []
    const unmet: SkillPrerequisiteStatus['unmet'] = []
    for (const line of prerequisites) {
      // 行内 OR：任一信号落地即该行满足
      let lineSatisfied = false
      const missingSignals: string[] = []
      for (const signal of line.signals) {
        if (!isKnownSignal(signal)) {
          // 未知信号：不判定、不阻塞 → 视为满足该分支
          lineSatisfied = true
          continue
        }
        const j = judgeSignal(ctx, signal)
        if (j.satisfied) lineSatisfied = true
        else missingSignals.push(signal)
      }
      if (!lineSatisfied) unmet.push({ signals: line.signals, note: line.note, missingSignals })
    }
    out.push({ skillId: id, prerequisites, unmet, satisfied: unmet.length === 0 })
  }
  return out
}

/**
 * 便捷：评估单个技能的前置依赖（内部用 buildSignalContext 读盘）。
 *
 * 用于「只看某个技能」的场景；批量评估请用 `assessPrerequisites` 并复用同一份 ctx。
 */
export function assessPrerequisitesForSkill(
  workspace: string,
  skill: { id: string; content: string | undefined },
): SkillPrerequisiteStatus {
  const ctx = buildSignalContext(workspace)
  return assessPrerequisites([skill], ctx)[0]
}

/** 把未满足的前置渲染成一行简洁提示（供 Research Context 注释）。 */
export function renderUnmetPrerequisites(status: SkillPrerequisiteStatus): string {
  return status.unmet
    .map((u) => (u.note ? `${u.signals.join(' / ')}（${u.note}）` : u.signals.join(' / ')))
    .join('；')
}
