/**
 * Constructing action objects from actions that already exist in the workspace.
 *
 * ## Why this exists
 *
 * The decision layer (paper 1) is not built yet, so nothing in the plugin *produces* a
 * typed action.  But actions are already written down everywhere — as plan steps, as
 * checklist items, as rows of a budget table ("T3 场景复核：60 场景 × 10–20 min",
 * "面板正式评测 1,080 次调用").  Those are *named* actions: exactly the L1 condition the
 * paper measures.  So the method can be applied today, without the decision layer:
 *
 * 1. **extract** the action-like items from a plan (checklist / numbered steps / table rows);
 * 2. **infer** the action type from the wording (heuristic, and labelled as such);
 * 3. **construct** the object two ways — as written (the executor must invent the design)
 *    and materialised (the executor's completion rule supplies target/arms/seeds), so the
 *    agent can accept, edit or reject it before running anything;
 * 4. **measure** both with the same metric, and record the accepted one.
 *
 * The honest boundary: steps 1–2 are heuristic text handling, not the paper's measurement
 * of a model.  That is why every candidate carries `confidence` and why nothing is written
 * to the workspace unless the caller asks for it.  What the *metric* reports (guess rate,
 * bound share, cost vs budget) is exact for the object that was constructed.
 */

import { evaluateDesign } from './evaluate.js'
import { environmentFor, informationGain, costOf, trueH } from './environment.js'
import { readingSet } from './executor.js'
import { parseAnswer } from './parse.js'
import type { ActionType, Design, Evaluation, ResearchState } from './types.js'

/** Wording → action type.  Ordered: the most specific pattern wins. */
const TYPE_PATTERNS: Array<{ type: ActionType; patterns: RegExp }> = [
  { type: 'factorial', patterns: /全因子|因子设计|factorial|网格搜索|grid search|矩阵设计/i },
  { type: 'binary_contrast', patterns: /两两|成对|对比实验|对照实验|消融对比|contrast|pairwise|A\/B|对比.{0,14}(?:与|和|及)|(?:与|和|及).{0,14}对比/i },
  { type: 'component_scan', patterns: /扫描|全臂|所有臂|逐臂|消融扫描|scan|sweep|逐组件|组件消融/i },
  { type: 'single_ablation', patterns: /单臂|单一消融|单个消融|单点|ablat(e|ion)|消融/i },
]

/**
 * An item counts as an action when it is *imperative* — it says what to do, not what a
 * good action would have to satisfy.  This distinction is the whole precision problem of
 * extracting actions from a plan: "T3 场景复核" is an action, "臂映射明确且可执行" is a
 * criterion that merely mentions actions.
 */
const IMPERATIVE = new RegExp(
  '^(?:[（(]?\\d*[）)]?\\s*)?' +
    '(?:' +
    // CJK verbs: no \b — JavaScript word boundaries are ASCII-only, so `做\b` never
    // matches (this bug silently dropped every Chinese imperative line).
    '做|跑|执行|运行|评测|评估|测试|对比|扫描|消融|训练|标注|排序|起草|复核|收集|撰写|' +
    '生成|冻结|招募|主持|发布|重算|复算|审计|检查|补跑|裁剪|扩展|跑完' +
    '|' +
    '\\b(?:run|ablate|train|evaluate|test|compare|scan|rank|annotate|draft|collect|' +
    'freeze|generate|measure|report)\\b' +
    ')',
  'i',
)

/** Criteria / definitions / caveats: they mention actions but are not actions. */
const CRITERION =
  /不能|不得|否则|须|应当|必须|明确|可执行|一致|口径|定义为|意味着|不得超出|不足以|才算|才算作|目标是|验收标准/

function looksImperative(text: string): boolean {
  if (IMPERATIVE.test(text)) return true
  // a leading label ("T2", "步骤 3", "②") may precede the verb
  const stripped = text
    .replace(/^[A-Z]\d{1,2}[\s:：·]+/, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
  if (IMPERATIVE.test(stripped)) return true
  // A short item that names a design shape is an instruction even when the verb is not
  // first ("全臂扫描：0–5，4 seeds").  Long prose that merely mentions ablations is not.
  return (
    text.length <= 60 &&
    /扫描|消融|对比|全臂|逐臂|逐组件|两两|factorial|两两比较/.test(text) &&
    !CRITERION.test(text)
  )
}

export interface ActionCandidate {
  /** stable id: the step label when the plan has one (T2, 步骤 3), else `line-<n>` */
  id: string
  text: string
  /**
   * Whether this metric applies to the item at all.
   *
   * The environment is the **ablation-identification task family**: an action is a design
   * that discriminates a mechanism from an observed effect.  A plan step such as "LLM 起草
   * 60 场景" or "论文改写" is an action, but it is not *this* kind of action — the paper
   * says so in its own limitations.  Reporting those as `measurable: false` with a reason
   * is the honest outcome; inventing a design for them would be the opposite.
   */
  measurable: boolean
  actionType: ActionType | null
  confidence: 'structured' | 'keyword' | 'none'
  /** call count mentioned in the same item ("120 次调用"), when present */
  calls: number | null
  source: string
  reason?: string
}

export interface ConstructedAction {
  candidate: ActionCandidate
  /** what the item says, read the way an executor would have to read it */
  asWritten: Evaluation
  /** the same item with the design materialised (executor's reading set) */
  design: Design
  constructed: Evaluation
  /** whether the object used fields the text stated, or fell back to the completion rule */
  materialisedFrom?: string
}

/**
 * Which design shape does this item name?  Returns `null` when the item is not an
 * ablation-design action in this task family — the metric must not pretend otherwise.
 */
function inferType(text: string): {
  type: ActionType | null
  confidence: 'structured' | 'keyword' | 'none'
  reason?: string
} {
  const structured = parseAnswer(text, 'L3')
  if (structured.design) return { type: structured.design.action_type, confidence: 'structured' }
  for (const { type, patterns } of TYPE_PATTERNS) {
    if (patterns.test(text)) return { type, confidence: 'keyword' }
  }
  // "评测 / 分析 / 起草 / 复核 / 改写" style steps are actions of another kind
  if (/起草|复核|撰写|改写|分析|出图|排序|标注|招募|主持|发布|生成材料|冻结协议|审计|检查|draft|review|annotat|rank|writ|analys|material/i.test(text)) {
    return { type: null, confidence: 'none', reason: '不是消融类实验动作（起草/复核/分析/写作），本文的度量不适用' }
  }
  return { type: null, confidence: 'none', reason: '未写出实验设计，且无法从措辞判断设计形态' }
}

function callCount(text: string): number | null {
  const match = /([\d,]+)\s*(?:次|条|个)?\s*(?:调用|calls?)/i.exec(text)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

/**
 * Extract the action-like items from a plan or any Markdown.
 *
 * Recognised shapes: checklist items (`- [ ] …`), numbered steps (`1. …`), table rows
 * whose first cell carries a step label, and `T1 … T9` style step tokens.  Everything else
 * is ignored — a plan is mostly prose, and treating prose as an action would be noise.
 */
export function extractCandidates(markdown: string, source = 'text'): ActionCandidate[] {
  const out: ActionCandidate[] = []
  const seen = new Set<string>()
  const push = (id: string, raw: string, lineNumber: number, planStep = false) => {
    const text = raw.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim()
    if (text.length < 6 || text.length > 400) return
    const calls = callCount(text)
    // A labelled plan step (a row of the plan's own step table) is taken as given, and so
    // is anything already written in the interface's own format (TARGET/ARMS/SEEDS) — that
    // is a constructed action, not prose to be guessed at.
    const alreadyStructured = parseAnswer(text, 'L3').design !== null
    if (!planStep && !alreadyStructured) {
      if (CRITERION.test(text) && calls === null) return
      if (!looksImperative(text) && calls === null) return
    }
    const key = `${id}|${text.slice(0, 60)}`
    if (seen.has(key)) return
    seen.add(key)
    const inferred = inferType(text)
    out.push({
      id: id || `line-${lineNumber}`,
      text,
      measurable: inferred.type !== null,
      actionType: inferred.type,
      confidence: inferred.confidence,
      calls: callCount(text),
      source,
      ...(inferred.reason ? { reason: inferred.reason } : {}),
    })
  }

  markdown.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1
    // 1) checklist: `- [ ] T3 场景复核 …`
    const checklist = /^\s*[-*+]\s*\[[ xX]\]\s*(.+)$/.exec(line)
    if (checklist) {
      const body = checklist[1]
      const label = /^([A-Z]\d{1,2})\b/.exec(body.trim())
      push(label ? label[1] : `line-${lineNumber}`, body, lineNumber)
      return
    }
    // 2) numbered step: `1. 场景起草 …`
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (numbered) {
      push(`step-${numbered[0].trim().replace(/[.)]$/, '')}`, numbered[1], lineNumber)
      return
    }
    // 3) table row: `| T3 | 场景复核 | 研究者 | … |`
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (cells.length >= 2 && /^[A-Z]?\d{1,2}$/.test(cells[0])) {
        push(cells[0], cells.slice(1).join(' · '), lineNumber, true)
      }
      return
    }
    // 4) inline step token with a colon: `T2 场景起草：LLM 起草 60 个（120 次调用）`
    const token = /^\s*[-*+]?\s*([A-Z]\d{1,2})[\s:：]+(.{8,})$/.exec(line)
    if (token) push(token[1], token[2], lineNumber, true)
  })
  return out
}

/** The design an executor would settle on for a named action (first reading of `R(a)`). */
/** Fields a plan step or action note states in prose, when it states any. */
interface LooseFields {
  arms: number[] | null
  armCount: number | null
  seeds: number | null
  target: number | null
  from: 'text fields' | 'executor default'
}

function looseFields(text: string, state: ResearchState): LooseFields {
  const armsMatch = /(?:ARMS?|arms?|臂)\s*[:：]?\s*((?:\d+\s*[,\s]?)+)/.exec(text)
  let arms: number[] | null = null
  if (armsMatch) {
    const parsed = [...armsMatch[1].matchAll(/\d+/g)].map((m) => Number(m[0])).filter((a) => a >= 0 && a < state.arms.length)
    if (parsed.length > 0) arms = [...new Set(parsed)].sort((a, b) => a - b)
  }
  const seedsMatch = /(\d+)\s*(?:个\s*)?(?:seeds?|重复|重复次数)/i.exec(text) ?? /(?:SEEDS?|seeds?)\s*[:：]?\s*(\d+)/.exec(text)
  const seeds = seedsMatch ? Math.max(2, Math.min(12, Number(seedsMatch[1]))) : null
  const countMatch =
    /(\d+|[一二两三四五六])\s*(?:条|个)\s*(?:臂|模块|组件|机制|因素)/.exec(text)
  const wordNumbers: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
  const armCount = countMatch
    ? (wordNumbers[countMatch[1]] ?? Number(countMatch[1]))
    : /全臂|所有臂|全部臂/.test(text)
      ? state.arms.length
      : null
  // Modules named in the text are real information: they give the pointer, and when two
  // or more are named they give the arms as well.
  const lowered = text.toLowerCase()
  const named: number[] = []
  for (let i = 0; i < state.arms.length; i++) {
    const name = String(state.arms[i] ?? '').toLowerCase()
    if (name && lowered.includes(name)) named.push(i)
  }
  const target = named.length > 0 ? named[0] : null
  if (!arms && named.length >= 2) arms = [...named].sort((a, b) => a - b)
  const any = arms !== null || seeds !== null || armCount !== null || target !== null
  return { arms, armCount, seeds, target, from: any ? 'text fields' : 'executor default' }
}

/** The design an executor would settle on for a named action (first reading of `R(a)`),
 *  using any fields the text itself states before falling back to the completion rule. */
export function materialiseDesign(
  candidate: ActionCandidate,
  state: ResearchState,
): Design & { materialisedFrom?: string } {
  const env = environmentFor(state)
  const actionType = (candidate.actionType ?? 'component_scan') as ActionType
  const named: Design = { action_type: actionType, target: null, arms: null, n: null }
  const readings = readingSet(named, env)
  const stated = looseFields(candidate.text, state)

  let chosen = readings[0]
  if (stated.armCount !== null && !stated.arms) {
    // pick the reading whose arm count the text states, then the closest
    chosen = readings.reduce((best, reading) =>
      Math.abs(reading.arms.length - (stated.armCount as number)) <
      Math.abs(best.arms.length - (stated.armCount as number))
        ? reading
        : best,
    )
  }
  let target = stated.target
  if (target === null) {
    target = 0
    for (let h = 1; h < state.prior.length; h++) if (state.prior[h] > state.prior[target]) target = h
  }
  return {
    action_type: actionType,
    target,
    arms: stated.arms ?? chosen.arms,
    n: stated.seeds ?? chosen.n,
    materialisedFrom: stated.from,
  }
}

/** Score an extracted item both ways. */
export function constructFromCandidates(
  state: ResearchState,
  candidates: readonly ActionCandidate[],
): ConstructedAction[] {
  const out: ConstructedAction[] = []
  for (const candidate of candidates) {
    if (!candidate.measurable) continue          // reported separately, not scored
    const structured = parseAnswer(candidate.text, 'L3')
    const asWritten = structured.design
      ? evaluateDesign(state, structured.design)
      : evaluateDesign(state, {
          action_type: candidate.actionType as ActionType,
          target: null,
          arms: null,
          n: null,
        })
    const design = structured.design ?? materialiseDesign(candidate, state)
    const note = 'materialisedFrom' in design ? String(design.materialisedFrom) : 'text fields'
    out.push({ candidate, asWritten, design, constructed: evaluateDesign(state, design), materialisedFrom: note })
  }
  return out
}

/** A plain-text reason for the tool result: why this type, and what is still missing. */
export function explainConstruction(item: ConstructedAction): string {
  const { candidate, design, asWritten } = item
  const parts = [
    `${candidate.confidence === 'structured' ? '按已写出的字段解析' : `按措辞推断为 ${candidate.actionType}`}`,
  ]
  if (candidate.calls !== null) parts.push(`计划中标注 ${candidate.calls} 次调用`)
  parts.push(
    `as written: IG/cost ${asWritten.ig_per_cost.toFixed(4)}（执行器需自猜 ${(100 * asWritten.guess_rate).toFixed(0)}%）`,
  )
  parts.push(
    `constructed: target ${design.target}, arms [${(design.arms ?? []).join(',')}], seeds ${design.n}`,
  )
  return parts.join(' · ')
}

/** Cost of a design, exported for callers that want it without duplicating the formula. */
export function designCost(design: Design, state: ResearchState): number {
  return costOf(design.arms ?? [], design.n ?? 2, environmentFor(state))
}

/** Information gain of a design, for callers that only need the raw quantity. */
export function designInformationGain(design: Design, state: ResearchState): number {
  return informationGain(environmentFor(state), state.prior, design.arms ?? [], design.n ?? 2)
}
