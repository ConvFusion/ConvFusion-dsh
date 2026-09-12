/**
 * ConvFusion 2.0 — 基本科研过程（阶段模型）
 *
 * ## 为什么需要它，以及它**不是**什么
 *
 * v2 推倒了「8 个模块按序执行」的固定流水线，但**基本科研过程仍然存在**：
 * 不先弄清问题就查文献、不先有假设就设计实验，得到的东西不可解释。区别在于：
 *
 * ```text
 * v0.1.x 模块流水线          ：状态机决定下一步跑哪个模块（强制）
 * v2 阶段模型（本文件）      ：从**真实研究资产**推断"现在最缺哪一步"（提示性）
 * ```
 *
 * 因此这里产出的永远是**建议**：
 *
 *   - 只用于「能力选择」与「进展展示」，不驱动执行、不阻塞任何操作；
 *   - 阶段由 `project.md` / `research/` 里的**实际内容**推断，不是由对话内容猜测；
 *   - 用户可以完全忽略它继续自由对话 —— Agent 仍按自己的判断做事。
 *
 * ## 过程定义本身是一个 Skill（用户可定制）
 *
 * 阶段列表**不再硬编码**：它来自 `research-process` 这个能力（`skills/research-management/
 * research-process.md`）里的一段机器可读围栏块。用户可以在【设置】-【ConvFusion】-【本地设置】
 * 里覆盖该能力的 `Research Method` 章节，**规定自己的研究进展过程** —— 不同学科的过程确实不同。
 *
 * 解析规则：取**第一个**含 `stage:` 行的块。因为用户定制在合成时排在原文**之前**，
 * 所以"取第一个"天然让用户的定义优先，不需要任何额外设置。
 *
 * 代码里保留一份 `DEFAULT_STAGES` 作为兜底：能力缺失或块被改坏时，过程评估仍然可用
 * （只是退回默认过程），绝不因为一段文本有问题就让整个进展展示失效。
 *
 * ## 判定规则（全部可核查）
 *
 * 每个阶段只看"有没有产出该阶段的**可验证研究资产**"，不看它是否"被标记完成"。
 * 判定信号取自**固定词表**（`STAGE_SIGNALS`）—— 用户可以改过程，但改不了判定逻辑，
 * 否则一个笔误就会让"当前阶段"永远判不出来。信号留空/写错 → 该阶段不参与判定。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { listClaims, listDecisions } from './claims.js'
import { listEvidence } from './evidence.js'
import { listPlanDocuments } from './plans.js'
import { loadProjectFile } from './project.js'
import { DEFAULT_PAPER_ID } from './paper-data.js'
import { paperDir } from './paper.js'

/**
 * 判定信号词表。
 *
 * ⚠️ 固定词表是刻意的：用户能改**过程**，但改不了**判定逻辑**。
 * 允许任意表达式会让一个笔误把"当前阶段"永久判错，而且无法校验。
 */
export const STAGE_SIGNALS = [
  'problem-defined',
  'literature-evidence',
  'claims',
  'method-plan',
  'experiments',
  'settled-evidence',
  'decisions',
  'manuscript',
] as const

export type StageSignal = (typeof STAGE_SIGNALS)[number]

/** 科研过程的一个阶段（与能力类别对应）。 */
export interface ResearchStage {
  /** 阶段 id。 */
  id: string
  /** 阶段显示名（用于展示）。 */
  label: string
  /** 对应的能力类别（taxonomy 顶层 id）。 */
  category: string
  /** 判定信号（缺省/未知 → 该阶段不参与"当前阶段"判定）。 */
  signal?: StageSignal
  /** 这个阶段要产出什么（用于"最缺什么"的说明）。 */
  produces: string
}

/**
 * 基本科研过程的阶段顺序。
 *
 * ⚠️ 这是**过程**顺序，不是**执行**顺序：真实研究会在阶段间来回跳。
 * 它只回答"从资产上看，哪一步还没有落地的证据"。
 */
/** 默认过程（兜底）：与 `research-process` 能力里的默认块保持一致。 */
export const DEFAULT_STAGES: readonly ResearchStage[] = [
  { id: 'problem', label: '理解问题', category: 'research-understanding', signal: 'problem-defined', produces: '可证伪的研究问题与范围（`project.md`）' },
  { id: 'literature', label: '文献', category: 'literature', signal: 'literature-evidence', produces: '实际检索到的文献证据（`research/evidence/`）' },
  { id: 'innovation', label: '创新与假设', category: 'innovation', signal: 'claims', produces: '可检验的假设与主张（`research/claims/`）' },
  { id: 'method', label: '方法', category: 'methodology', signal: 'method-plan', produces: '可被第三方实现的方法设计' },
  { id: 'experiment', label: '实验', category: 'experiment', signal: 'experiments', produces: '实验产物（`experiments/<name>/results/`）' },
  { id: 'analysis', label: '分析', category: 'analysis', signal: 'settled-evidence', produces: '经确认的结果证据（Evidence 状态 supported/verified）' },
  { id: 'decision', label: '决策', category: 'research-decision', signal: 'decisions', produces: '已记录理由的研究决策（`research/decisions/`）' },
  { id: 'writing', label: '写作', category: 'academic-writing', signal: 'manuscript', produces: '论文正文（`papers/<id>/paper.md`）' },
]

/** 过程定义能力的 id。 */
export const PROCESS_SKILL_ID = 'research-process'

/**
 * 从能力正文里解析阶段列表。
 *
 * 格式（每行一个阶段）：
 *
 * ```text
 * stage: <id> | <显示名> | <能力类别> | <判定信号> | <产出说明>
 * ```
 *
 * 取**第一个**连续块：用户定制在合成时排在原文之前，因此用户的定义天然优先。
 *
 * @returns 解析出的阶段；没有可解析的块时返回 `undefined`（调用方退回默认过程）
 */
export function parseStages(content: string | undefined): ResearchStage[] | undefined {
  if (!content) return undefined
  const stages: ResearchStage[] = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    const m = /^stage:\s*(.+)$/i.exec(line)
    if (!m) {
      // 允许阶段之间有空行；一旦已经收集到阶段又遇到非阶段行，说明块结束
      if (stages.length > 0 && line !== '' && !line.startsWith('```')) break
      continue
    }
    const parts = m[1].split('|').map((x) => x.trim())
    const [id, label, category, signal, produces] = parts
    if (!id || !label || !category) continue
    const known = (STAGE_SIGNALS as readonly string[]).includes(signal ?? '')
    stages.push({
      id,
      label,
      category: category.split('/')[0] ?? category,
      ...(known ? { signal: signal as StageSignal } : {}),
      produces: produces || `${label} 阶段的产出`,
    })
  }
  return stages.length > 0 ? stages : undefined
}

/** 一个阶段的落地情况。 */
export interface StageStatus {
  stage: ResearchStage
  /** 该阶段是否已有可验证资产落地。 */
  satisfied: boolean
  /** 判定依据（一句话，可核查）。 */
  evidence: string
}

/** 过程评估结果。 */
export interface ProcessAssessment {
  stages: StageStatus[]
  /**
   * 当前阶段 = **第一个尚未落地**的阶段。
   *
   * 全部落地时为 `undefined`（此时研究进入"持续演化"状态，没有"最缺的一步"）。
   */
  current?: StageStatus
  /** 尚未落地的阶段（用于展示"还缺哪些"）。 */
  missing: StageStatus[]
}

/**
 * 评估科研过程走到哪一步。
 *
 * @param workspace 研究 workspace
 * @param options.skillContent 取某个能力**生效正文**（含用户定制）的函数；
 *                             缺省时只用默认过程
 * @returns 各阶段状态与当前阶段
 */
export function assessResearchProcess(
  workspace: string,
  options: { skillContent?: (id: string) => string | undefined } = {},
): ProcessAssessment {
  const stages = parseStages(options.skillContent?.(PROCESS_SKILL_ID)) ?? [...DEFAULT_STAGES]
  return assessWithStages(workspace, stages)
}

/** 用给定的阶段列表评估（与"阶段从哪来"解耦，便于测试）。 */
export function assessWithStages(workspace: string, stages: readonly ResearchStage[]): ProcessAssessment {
  const project = loadProjectFile(workspace)
  const evidence = listEvidence(workspace)
  const claims = listClaims(workspace)
  const decisions = listDecisions(workspace)
  const plans = listPlanDocuments(workspace)

  const literatureEvidence = evidence.filter((e) => e.sourceKind === 'literature')
  const settledEvidence = evidence.filter((e) => e.status === 'supported' || e.status === 'verified')
  const hasExperiments = existsSync(join(workspace, 'experiments'))
  const hasManuscript = existsSync(join(paperDir(workspace, DEFAULT_PAPER_ID), 'paper.md'))

  /** 判定信号 → (是否落地, 依据)。 */
  const judge = (signal: StageSignal | undefined): { satisfied: boolean; evidence: string } => {
    switch (signal) {
      case 'problem-defined': {
        const questions = project?.questions?.length ?? 0
        return {
          satisfied: questions > 0 && Boolean(project?.domain),
          evidence: questions > 0 ? `${questions} 个研究问题${project?.domain ? '、已定领域' : '（缺领域）'}` : '尚无研究问题',
        }
      }
      case 'literature-evidence':
        return {
          satisfied: literatureEvidence.length > 0,
          evidence: literatureEvidence.length > 0 ? `${literatureEvidence.length} 条文献证据` : '尚无文献证据（只有检索计划不算）',
        }
      case 'claims':
        return { satisfied: claims.length > 0, evidence: claims.length > 0 ? `${claims.length} 条主张` : '尚无主张／假设' }
      case 'method-plan': {
        const methodPlans = plans.filter((p) => /method|approach|design/i.test(p.id) || /方法|设计/.test(p.name))
        return {
          satisfied: methodPlans.length > 0,
          evidence: methodPlans.length > 0 ? `方法相关 Plan：${methodPlans.map((p) => p.id).join(', ')}` : '尚无方法设计的 Plan',
        }
      }
      case 'experiments':
        return { satisfied: hasExperiments, evidence: hasExperiments ? '存在 `experiments/`' : '尚无实验目录' }
      case 'settled-evidence':
        return {
          satisfied: settledEvidence.length > 0,
          evidence:
            settledEvidence.length > 0
              ? `${settledEvidence.length} 条已确认证据`
              : `尚无 confirmed 证据（现有 ${evidence.length} 条，均未确认）`,
        }
      case 'decisions':
        return { satisfied: decisions.length > 0, evidence: decisions.length > 0 ? `${decisions.length} 条决策记录` : '尚无决策记录' }
      case 'manuscript':
        return { satisfied: hasManuscript, evidence: hasManuscript ? '存在论文正文' : '尚无论文正文' }
      default:
        // 信号缺省/未知：**不参与判定** —— 用户自定义的阶段不会造成假的"缺口"，
        // 但仍会展示，也会推荐该阶段的能力。
        return { satisfied: true, evidence: '该阶段未声明判定信号，不参与"当前阶段"判定' }
    }
  }

  const statuses: StageStatus[] = stages.map((stage) => {
    const { satisfied, evidence: basis } = judge(stage.signal)
    return { stage, satisfied, evidence: basis }
  })

  const missing = statuses.filter((s) => !s.satisfied)
  return { stages: statuses, current: missing[0], missing }
}
