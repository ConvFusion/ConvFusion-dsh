/**
 * ConvFusion 2.0 — Research Progress Snapshot（本轮研究进展）
 *
 * 设计依据：`v2-Progress.md`。一次对话结束后，展示**这一轮到底让研究前进了多少**。
 *
 * ## 一条不能违反的约束：不许猜
 *
 * `v2-Progress.md` 写得很明确：**"这个进度条不是根据聊天内容猜出来的。它来自真正的
 * Research State 更新。"** 因此本模块只做三件事，且**每一件都从磁盘上的真实资产读出**：
 *
 * ```text
 * A. Research Progress      —— 成熟度维度（Research State 的等级）+ 可数资产计数
 * B. Research State Changes —— 与"本轮开始前"的快照逐项对比（新增/变化）
 * C. Next Research Need     —— 科研过程的当前缺口 + Evidence/Claim 缺口
 * ```
 *
 * ## 为什么成熟度显示的是"等级折算"而不是百分比
 *
 * Research State 的成熟度是**定性等级**（`Unknown/Weak/Emerging/Strong/Established`，
 * Stage 4 §35），不是打分。把它渲染成 `58% → 64%` 会**凭空制造精度** —— 那正是本插件
 * 反复守的一条线（不伪造）。所以这里：
 *
 *   - 进度条的位置由等级折算得到，**同时显示等级名**，并标注"折算"；
 *   - 可数的东西（证据/主张/决策/计划）**给真实计数**，不给百分比；
 *   - 未评估的维度显示 `Unknown`，绝不假装它是 0% 或某个中间值。
 *
 * ## 两个展示面（同一套数据，2026-09 改版）
 *
 * ```text
 * 顶部「研究进展」按钮的面板（主）  ← `WorkspaceProgress`：任何时刻点开都看"现在到哪了"
 * 回合尾部曾经注入的进度卡（已删）  ← `TurnProgressReport`：链式槽位的 selector 拿不到会话身份，
 *                                    只能靠一个进程级全局变量猜，于是会命中所有会话
 * ```
 *
 * `TurnProgressReport` 仍然保留：面板的"本轮变化"一节用它（哪个会话的哪一轮，
 * 由 `progress-bridge.ts` 按会话 id 记录）。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { listClaims } from './claims.js'
import { listDecisions } from './claims.js'
import { listEvidence } from './evidence.js'
import { listPlanDocuments } from './plans.js'
import { loadResearchState, buildResearchIndex } from './research-state.js'
import { assessResearchProcess } from './research-process.js'
import { assessAdvance, type AdvanceAssessment } from './advance.js'
import { MATURITY_DIMENSIONS, type MaturityDimension, type MaturityLevel } from './research-data.js'
import { listAllOutputs } from './output.js'
import { DEFAULT_PAPER_ID } from './paper-data.js'
import { paperDir } from './paper.js'

/** 等级 → 进度条位置（**折算**，不是测量值）。 */
export const MATURITY_SCALE: Record<MaturityLevel, number> = {
  Unknown: 0,
  Weak: 0.25,
  Emerging: 0.5,
  Strong: 0.75,
  Established: 1,
}

/** 一个研究进度快照（纯数据，可从磁盘重建）。 */
export interface ProgressSnapshot {
  /** 推进判定：下一步是否需要用户拍板（见 `advance.ts`）。 */
  advance: AdvanceAssessment
  /** Research State 版本。 */
  stateVersion: string
  /** 各成熟度维度的**等级**（未评估 = Unknown）。 */
  maturity: Record<MaturityDimension, MaturityLevel>
  /** 可数资产（全部是事实，不是估算）。 */
  counts: {
    evidence: number
    /** 状态为 supported/verified 的证据数。 */
    evidenceSettled: number
    /** 带原始产物的证据数（provenance 完整）。 */
    evidenceWithArtifact: number
    claims: number
    /** 至少有一条支撑证据的主张数。 */
    claimsSupported: number
    decisions: number
    plans: number
    plansReady: number
    openQuestions: number
    outputs: number
    paperPresent: boolean
  }
  /** 当前科研过程阶段（提示性）。 */
  stage: { id: string; label: string } | null
}

/**
 * 从工作区真实资产采集一次快照。
 *
 * @param skillContent 取能力生效正文（过程定义可被用户定制，见 `research-process.ts`）
 */
export function captureProgress(
  workspace: string,
  skillContent?: (id: string) => string | undefined,
  advanceOptions: { staleRounds?: number; staleThreshold?: number } = {},
): ProgressSnapshot {
  const state = loadResearchState(workspace)
  const evidence = listEvidence(workspace)
  const claims = listClaims(workspace)
  const decisions = listDecisions(workspace)
  const plans = listPlanDocuments(workspace)
  const index = buildResearchIndex(workspace)
  const process = assessResearchProcess(workspace, { ...(skillContent ? { skillContent } : {}) })

  const maturity = { ...(state?.maturity ?? {}) } as Record<MaturityDimension, MaturityLevel>
  for (const d of MATURITY_DIMENSIONS) maturity[d] = maturity[d] ?? 'Unknown'

  const advance = assessAdvance({
    workspace,
    ...(advanceOptions.staleRounds !== undefined ? { staleRounds: advanceOptions.staleRounds } : {}),
    ...(advanceOptions.staleThreshold !== undefined ? { staleThreshold: advanceOptions.staleThreshold } : {}),
    process,
  })

  return {
    advance,
    stateVersion: state?.version ?? '—',
    maturity,
    counts: {
      evidence: evidence.length,
      evidenceSettled: evidence.filter((e) => e.status === 'supported' || e.status === 'verified').length,
      evidenceWithArtifact: evidence.filter((e) => e.provenance.rawArtifacts.length > 0).length,
      claims: claims.length,
      claimsSupported: claims.filter((c) => c.evidence.length > 0).length,
      decisions: decisions.length,
      plans: plans.length,
      plansReady: plans.filter((p) => p.status === 'ready' || p.status === 'refined').length,
      openQuestions: index.openQuestions.length,
      outputs: listAllOutputs(workspace).length,
      paperPresent: existsSync(join(paperDir(workspace, DEFAULT_PAPER_ID), 'paper.md')),
    },
    stage: process.current ? { id: process.current.stage.id, label: process.current.stage.label } : null,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 差异（"刚才这轮改变了什么"）
 * ════════════════════════════════════════════════════════════════════════ */

/** 一处变化。 */
export interface ProgressChange {
  /** 类别（成熟度 / 证据 / 主张 / 决策 / 计划 / 产出）。 */
  kind: string
  /** 人类可读描述。 */
  text: string
}

/** 两个快照的差异。 */
export interface ProgressDiff {
  before: ProgressSnapshot
  after: ProgressSnapshot
  /** 折算后的整体成熟度（各维度等级的均值；全 Unknown 时为 0）。 */
  overallBefore: number
  overallAfter: number
  /** 发生变化的成熟度维度。 */
  maturityChanges: Array<{ dimension: MaturityDimension; from: MaturityLevel; to: MaturityLevel }>
  /** 计数变化（只含真的变了的项）。 */
  countChanges: Array<{ key: keyof ProgressSnapshot['counts']; from: number; to: number }>
  /** 本轮是否有任何实质性推进。 */
  changed: boolean
}

function meanScale(m: Record<MaturityDimension, MaturityLevel>): number {
  const values = MATURITY_DIMENSIONS.map((d) => MATURITY_SCALE[m[d]])
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** 比较两个快照。 */
export function diffProgress(before: ProgressSnapshot, after: ProgressSnapshot): ProgressDiff {
  const maturityChanges = MATURITY_DIMENSIONS.filter((d) => before.maturity[d] !== after.maturity[d]).map((d) => ({
    dimension: d,
    from: before.maturity[d],
    to: after.maturity[d],
  }))

  const keys = Object.keys(after.counts) as Array<keyof ProgressSnapshot['counts']>
  const countChanges = keys
    .filter((k) => before.counts[k] !== after.counts[k])
    .map((k) => ({ key: k, from: before.counts[k] as number, to: after.counts[k] as number }))

  return {
    before,
    after,
    overallBefore: meanScale(before.maturity),
    overallAfter: meanScale(after.maturity),
    maturityChanges,
    countChanges,
    changed: maturityChanges.length > 0 || countChanges.length > 0,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 渲染
 * ════════════════════════════════════════════════════════════════════════ */

const BAR_WIDTH = 20

/** 一条进度条（`█` 填充 + `░` 空白）。 */
export function renderBar(scale: number, width = BAR_WIDTH): string {
  const filled = Math.round(Math.max(0, Math.min(1, scale)) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const COUNT_LABEL: Record<string, string> = {
  evidence: '证据',
  evidenceSettled: '已确认证据',
  evidenceWithArtifact: '带原始产物的证据',
  claims: '主张',
  claimsSupported: '有支撑证据的主张',
  decisions: '决策',
  plans: '计划',
  plansReady: '可执行计划',
  openQuestions: '开放问题',
  outputs: '成果',
  paperPresent: '论文正文',
}

function pct(scale: number): string {
  return `${Math.round(scale * 100)}%`
}

/** 变动符号与差值。 */
function delta(before: number, after: number): string {
  if (after > before) return `↑ +${after - before}`
  if (after < before) return `↓ ${after - before}`
  return '—'
}

/**
 * 渲染成一条 **notice**（`summary` 显示在收起行，`text` 展开可见）。
 *
 * @returns `summary` 受 `CONTEXT_SUMMARY_MAX_CHARS` 约束；`text` 是完整进展块
 */
export function renderProgressNotice(
  diff: ProgressDiff,
  advance?: AdvanceAssessment,
): { summary: string; text: string } {
  const ovBefore = diff.overallBefore
  const ovAfter = diff.overallAfter
  const ovDelta = Math.round((ovAfter - ovBefore) * 100)

  // ── summary：收起的行也要能一眼看出"这轮推动了没有" ──
  const moved = diff.countChanges.length
  const summary =
    `📊 研究进展 · 成熟度折算 ${pct(ovBefore)} → ${pct(ovAfter)}` +
    (ovDelta !== 0 ? ` (${ovDelta > 0 ? '+' : ''}${ovDelta})` : '') +
    (moved > 0 ? ` · ${moved} 项资产变化` : ' · 本轮无资产变化') +
    (advance ? (advance.clarity === 'clear' ? ' · 可继续' : ' · 待你定') : '')

  const lines: string[] = []
  lines.push('## 📊 本轮研究进展')
  lines.push('')
  lines.push(
    `**成熟度（等级折算，非测量值）**  ${pct(ovBefore)} → ${pct(ovAfter)}` +
      (ovDelta !== 0 ? `  ${ovDelta > 0 ? '↑' : '↓'}${Math.abs(ovDelta)}%` : '  —'),
  )
  lines.push('')
  for (const d of MATURITY_DIMENSIONS) {
    const level = diff.after.maturity[d]
    lines.push(`\`${d.padEnd(15)}\` ${renderBar(MATURITY_SCALE[level])}  ${level}`)
  }
  lines.push('')

  // ── B. 本轮变化 ──
  lines.push('**本轮变化**')
  lines.push('')
  if (!diff.changed) {
    lines.push('- 本轮没有形成新的可验证研究资产（讨论/澄清不产生资产，这是正常的）。')
  } else {
    for (const m of diff.maturityChanges) {
      lines.push(`- 成熟度 ${m.dimension}：${m.from} → ${m.to}`)
    }
    for (const c of diff.countChanges) {
      const label = COUNT_LABEL[c.key] ?? c.key
      const sign = c.to > c.from ? '+' : ''
      lines.push(`- ${label}：${c.from} → ${c.to}（${sign}${c.to - c.from}）`)
    }
  }
  lines.push('')

  // ── C. 下一步缺口（只陈述，不强制）──
  lines.push('**当前缺口**')
  lines.push('')
  if (diff.after.stage) {
    lines.push(`- 科研过程当前阶段：**${diff.after.stage.label}**（尚未落地）`)
  } else {
    lines.push('- 科研过程各阶段均已有落地资产')
  }
  const unsupported = diff.after.counts.claims - diff.after.counts.claimsSupported
  if (unsupported > 0) lines.push(`- ${unsupported} 条主张尚缺支撑证据`)
  const noArtifact = diff.after.counts.evidence - diff.after.counts.evidenceWithArtifact
  if (noArtifact > 0) lines.push(`- ${noArtifact} 条证据缺原始产物引用（provenance 不完整）`)
  if (diff.after.counts.openQuestions > 0) lines.push(`- ${diff.after.counts.openQuestions} 个开放问题待解`)
  lines.push('')
  if (advance) {
    lines.push('**推进判定**')
    lines.push('')
    const label =
      advance.clarity === 'clear'
        ? '方向明确 → 可直接推进'
        : advance.clarity === 'ambiguous'
          ? '需要你选一个方向'
          : '等你拍板（阻塞）'
    lines.push(`- ${label}（依据：${advance.basis}）`)
    if (advance.nextStep) lines.push(`- 下一步：${advance.nextStep}`)
    if (advance.needsUserDecision) lines.push(`- 待你决定：${advance.needsUserDecision}`)
    lines.push('')
  }
  lines.push('> 以上是 Research State 暴露出的研究需求，**不是**必须执行的下一步。你可以接受，也可以继续自由对话。')
  lines.push('')

  return { summary: summary.slice(0, 120), text: lines.join('\n') }
}

/** 全部计数项的显示名（报告与 notice 共用，避免两处文案漂移）。 */
export function countLabel(key: string): string {
  return COUNT_LABEL[key] ?? key
}

/**
 * 当前缺口（只陈述事实，不猜）。
 *
 * `v2-Progress.md` 的 C 段：Research State 现在暴露了什么需求。
 */
export function researchGaps(snapshot: ProgressSnapshot): string[] {
  const out: string[] = []
  out.push(
    snapshot.stage
      ? `科研过程当前阶段：${snapshot.stage.label}（尚未落地）`
      : '科研过程各阶段均已有落地资产',
  )
  const unsupported = snapshot.counts.claims - snapshot.counts.claimsSupported
  if (unsupported > 0) out.push(`${unsupported} 条主张尚缺支撑证据`)
  const noArtifact = snapshot.counts.evidence - snapshot.counts.evidenceWithArtifact
  if (noArtifact > 0) out.push(`${noArtifact} 条证据缺原始产物引用（provenance 不完整）`)
  if (snapshot.counts.openQuestions > 0) out.push(`${snapshot.counts.openQuestions} 个开放问题待解`)
  return out
}

/* ════════════════════════════════════════════════════════════════════════
 * 回合报告（界面用结构化数据）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 一轮对话结束后的研究进展报告（`v2-Progress.md` 的三段式）。
 *
 * 为什么返回**结构化数据**而不是 Markdown：报告由**客户端**渲染成面板里的一节
 * （顶部「研究进展」按钮，见 `client/progress-panel.tsx`），结构化的字段才能排版成
 * 图表，而不是把 Markdown 字符串塞进界面。
 */
export interface TurnProgressReport {
  /** 生成时刻（ISO）。 */
  at: string
  /** 回合号（未知为 -1）。 */
  turn: number
  /** 一行摘要（界面自己加图标）。 */
  summary: string
  /** 折算后的整体成熟度变化（0..1）。 */
  overall: { before: number; after: number }
  /** A. 研究现在到了哪里。 */
  progress: {
    dimensions: Array<{ dimension: string; level: MaturityLevel; scale: number }>
    stage: string | null
  }
  /** B. 刚才这轮改变了什么。 */
  changes: {
    changed: boolean
    maturity: Array<{ dimension: string; from: MaturityLevel; to: MaturityLevel }>
    counts: Array<{ key: string; label: string; from: number; to: number }>
  }
  /** C. 接下来最值得做什么。 */
  need: {
    gaps: string[]
    clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
    basis: string
    nextStep?: string
    needsUserDecision?: string
  }
  /** 本轮是否推进了（供界面决定强调程度）。 */
  moved: boolean
}

/** 由差异 + 快照构造界面用的回合报告。 */
export function buildTurnReport(
  diff: ProgressDiff,
  turn: number,
  advance?: AdvanceAssessment,
  at: Date = new Date(),
): TurnProgressReport {
  const moved = diff.changed
  const ovDelta = Math.round((diff.overallAfter - diff.overallBefore) * 100)
  const summary =
    `研究进展 · 成熟度折算 ${pct(diff.overallBefore)} → ${pct(diff.overallAfter)}` +
    (ovDelta !== 0 ? ` (${ovDelta > 0 ? '+' : ''}${ovDelta})` : '') +
    (diff.countChanges.length > 0 ? ` · ${diff.countChanges.length} 项资产变化` : ' · 本轮无资产变化') +
    (advance ? (advance.clarity === 'clear' ? ' · 可继续' : ' · 待你定') : '')

  return {
    at: at.toISOString(),
    turn,
    summary,
    overall: { before: diff.overallBefore, after: diff.overallAfter },
    progress: {
      dimensions: MATURITY_DIMENSIONS.map((d) => ({
        dimension: d,
        level: diff.after.maturity[d],
        scale: MATURITY_SCALE[diff.after.maturity[d]],
      })),
      stage: diff.after.stage?.label ?? null,
    },
    changes: {
      changed: moved,
      maturity: diff.maturityChanges.map((m) => ({ dimension: m.dimension, from: m.from, to: m.to })),
      counts: diff.countChanges.map((c) => ({
        key: String(c.key),
        label: countLabel(String(c.key)),
        from: c.from,
        to: c.to,
      })),
    },
    need: {
      gaps: researchGaps(diff.after),
      clarity: advance?.clarity ?? 'unknown',
      basis: advance?.basis ?? '',
      ...(advance?.nextStep ? { nextStep: advance.nextStep } : {}),
      ...(advance?.needsUserDecision ? { needsUserDecision: advance.needsUserDecision } : {}),
    },
    moved,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 工作区进度（顶部「研究进展」按钮的面板）
 *
 * 与 `TurnProgressReport` 的区别（不要混）：
 *
 * ```text
 * TurnProgressReport   —— "刚才这一轮改变了什么"（需要前后两个快照求差；回合结束后才有）
 * WorkspaceProgress    —— "这个研究项目现在到哪了"（任何时刻都能从磁盘重算）
 * ```
 *
 * 因此按钮后面挂的是后者：用户任何时刻点开都能看到当前状态，而不是"这一轮"的增量。
 * 两者都由**磁盘上的真实资产**算出（本文件顶部那条"不许猜"的约束同样适用）。
 * ════════════════════════════════════════════════════════════════════════ */

/** 面板里的一行可数资产（数字全部是事实，不是估算）。 */
export interface ProgressCountRow {
  /** 计数键（`ProgressSnapshot['counts']` 的子集）。 */
  key: string
  /** 显示名。 */
  label: string
  /** 计数。 */
  value: number
  /** 附带说明（如"5 已确认"）。 */
  note?: string
}

/**
 * 当前工作区的研究进展（**不是**"本轮变化"）。
 *
 * 刻意**不给整体百分比之外的伪精度**：成熟度是等级折算（`scale`），同时带上等级名；
 * 可数资产给真实计数；未评估的维度是 `Unknown`（折算 0，界面必须显示名字）。
 */
export interface WorkspaceProgress {
  /** 生成时刻（ISO）。 */
  at: string
  /** Research State 版本。 */
  stateVersion: string
  /** 各成熟度维度等级折算的均值（0..1；全 Unknown 时为 0）。 */
  overall: number
  /** A. 研究现在到了哪里。 */
  progress: {
    dimensions: Array<{ dimension: string; level: MaturityLevel; scale: number }>
    stage: string | null
  }
  /** 可数资产（真实计数）。 */
  counts: ProgressCountRow[]
  /** 是否已有论文正文（`papers/<id>/paper.md`）。 */
  paper: boolean
  /** C. 当前缺口与推进判定。 */
  need: {
    gaps: string[]
    clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
    basis: string
    nextStep?: string
    needsUserDecision?: string
  }
}

/** 可数资产 → 面板行（顺序固定，便于两次点开之间对照）。 */
export function progressCountRows(snapshot: ProgressSnapshot): ProgressCountRow[] {
  const c = snapshot.counts
  return [
    { key: 'evidence', label: COUNT_LABEL.evidence, value: c.evidence, note: `${c.evidenceSettled} 已确认` },
    { key: 'claims', label: COUNT_LABEL.claims, value: c.claims, note: `${c.claimsSupported} 有支撑证据` },
    { key: 'decisions', label: COUNT_LABEL.decisions, value: c.decisions },
    { key: 'plans', label: COUNT_LABEL.plans, value: c.plans, note: `${c.plansReady} 可执行` },
    { key: 'openQuestions', label: COUNT_LABEL.openQuestions, value: c.openQuestions },
    { key: 'outputs', label: COUNT_LABEL.outputs, value: c.outputs },
  ]
}

/** 由当前快照构造工作区报告（纯函数：同一份磁盘状态必得同一结果）。 */
export function buildWorkspaceProgress(snapshot: ProgressSnapshot, at: Date = new Date()): WorkspaceProgress {
  const advance = snapshot.advance
  return {
    at: at.toISOString(),
    stateVersion: snapshot.stateVersion,
    overall: meanScale(snapshot.maturity),
    progress: {
      dimensions: MATURITY_DIMENSIONS.map((d) => ({
        dimension: d,
        level: snapshot.maturity[d],
        scale: MATURITY_SCALE[snapshot.maturity[d]],
      })),
      stage: snapshot.stage?.label ?? null,
    },
    counts: progressCountRows(snapshot),
    paper: snapshot.counts.paperPresent,
    need: {
      gaps: researchGaps(snapshot),
      clarity: advance?.clarity ?? 'unknown',
      basis: advance?.basis ?? '',
      ...(advance?.nextStep ? { nextStep: advance.nextStep } : {}),
      ...(advance?.needsUserDecision ? { needsUserDecision: advance.needsUserDecision } : {}),
    },
  }
}

/** 供 `/research` 状态展示用：紧凑的一行。 */
export function renderProgressLine(snapshot: ProgressSnapshot): string {
  const overall = meanScale(snapshot.maturity)
  const c = snapshot.counts
  return (
    `进度（等级折算）：${pct(overall)} · ` +
    `证据 ${c.evidenceSettled}/${c.evidence} 已确认 · ` +
    `主张 ${c.claimsSupported}/${c.claims} 有支撑 · ` +
    `计划 ${c.plans} · 决策 ${c.decisions}` +
    (snapshot.stage ? ` · 当前阶段：${snapshot.stage.label}` : '')
  )
}
