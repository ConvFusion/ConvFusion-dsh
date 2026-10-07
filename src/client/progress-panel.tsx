/**
 * ConvFusion 2.0 — 会话 Tab「研究进展」的正文（面板本体 + 整页容器）
 *
 * ## 演进（两次用户拍板）
 *
 * ```text
 * 2026-09  conversation.chat.turnTail（对话流里的进度卡）
 *            ↓ 链式槽位拿不到会话身份，只能靠进程级全局变量猜 → 内容跑到别的会话里
 * 2026-09  conversation.session.header.utilities（顶部按钮 + 浮层）
 *            ↓ 组件拿到**自己会话**的 sessionId，判定天然按会话正确
 * 2026-10  conversation.view（会话 Tab，order 19：对话 | 轨迹 | 研究进展 | 科V社区）
 * ```
 *
 * 现在这一页是**会话 Tab 的正文**，按钮与浮层已移除（用户要求"只留 tab"）。
 * tab 的显隐与文案由 `./convfusion-tab.js` 的闸门管：只在研究工作区注册，
 * 文案里的百分比也取自闸门对宿主的那一次探针（面板没挂载时 tab 也要有数）。
 *
 * ## 三条必须守住的边界
 *
 * 1. **只出现在研究工作区**：`research !== true` 时闸门根本不注册这个 tab（不是渲染成空，
 *    而是根本不占位）；判定来自宿主，用的是会话自己的 `header.cwd`，与插件进程的启动目录无关。
 * 2. **不发明数据**：只渲染宿主算好的报告；成熟度是**等级折算**（同时显示等级名），
 *    可数资产给真实计数。拿不到数据就说明"宿主还没返回"，不显示 0%。
 * 3. **会话作用域**：`sessionId` 来自 DSH 的 session 作用域 standard props，每个会话只问
 *    自己的宿主答案 —— 这正是那次链式槽位故障的反面。
 */

import React, { useCallback, useEffect, useState } from 'react'
import { fetchSettingsSend } from './settings.js'
import {
  maturityDimensionText,
  maturityLevelText,
  progressCountText,
  skillText,
  translateOr,
  type Translate,
} from './i18n/index.js'

/* ════════════════════════════════════════════════════════════════════════
 * 宿主契约（镜像，不 import：客户端 bundle 不依赖宿主模块）
 * ════════════════════════════════════════════════════════════════════════ */

/** 成熟度维度（等级 + 等级折算的位置）。 */
interface ProgressDimension {
  dimension: string
  level: string
  scale: number
}

/** 一行可数资产。 */
interface ProgressCountRow {
  key: string
  value: number
  detail?: { code: 'settled' | 'supported' | 'ready'; count: number }
}

interface ProgressStage {
  id: string
  label: string
}

type ProgressGap =
  | { code: 'stagePending'; stage: ProgressStage }
  | { code: 'processComplete' }
  | { code: 'unsupportedClaims'; count: number }
  | { code: 'missingArtifacts'; count: number }
  | { code: 'openQuestions'; count: number }

/** 一个研究工作自己的可数资产（宿主 `captureWorkProgress` 的产物）。 */
interface WorkCounts {
  sections: number
  sectionsWithContent: number
  claims: number
  claimsWithoutEvidence: number
  evidence: number
  evidenceUsedInManuscript: number
  /** 未解决缺口（已记录的 ∪ 规则检查实时发现的）。 */
  gaps: number
  gapsHigh: number
  openProposals: number
}

/** 一个研究工作自己的进展（一个工作 = 一个 Paper）。 */
interface WorkProgress {
  id: string
  /** 完整标题（tab 的悬停提示）。 */
  title: string
  /** 短标题（tab 上用）。 */
  short: string
  /** 是否是当前激活的论文。 */
  active: boolean
  status: string
  version: string
  /** 该工作成熟度等级折算的均值（0..1）。 */
  overall: number
  /** `derived` = 该论文还没有成熟度评估，等级是按真实资产**推定**的（界面必须标明）。 */
  maturitySource: 'recorded' | 'derived'
  maturity: Array<{ dimension: string; level: string; scale: number }>
  counts: WorkCounts
  /** 最高优先级的未解决缺口；没有缺口时没有这个字段。 */
  next?: { code: string; priority: string; target?: string; skill?: string }
}

/** 汇总里的一行（一个工作；宿主 `WorkAggregateRow` 的镜像）。 */
interface WorkAggregateRow {
  id: string
  title: string
  short: string
  active: boolean
  overall: number
  maturitySource: 'recorded' | 'derived'
  counts: WorkCounts
}

/**
 * 多个工作的合计（宿主 `WorksAggregate` 的镜像）。
 *
 * 只在多于一个工作时才由宿主带来；单工作/老宿主没有这个字段 → 总览照旧。
 */
interface WorksAggregate {
  works: number
  totals: WorkCounts
  rows: WorkAggregateRow[]
}

/** 当前工作区的研究进展（宿主 `buildWorkspaceProgress` 的产物）。 */
interface WorkspaceReport {
  at: string
  stateVersion: string
  overall: number
  progress: { dimensions: ProgressDimension[]; stage: ProgressStage | null }
  counts: ProgressCountRow[]
  paper: boolean
  /**
   * 每个研究工作自己的进展（一个工作 = 一个 Paper）。
   *
   * 按可选读：老宿主不带这个字段，界面就退回"只有聚合内容"（今天的行为）。
   */
  works?: WorkProgress[]
  /** 多工作汇总（可选读：单工作与老宿主都没有）。 */
  aggregate?: WorksAggregate
  need: {
    gaps: ProgressGap[]
    clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
    basis: string
    basisCode?: string
    basisParams?: Record<string, string | number>
    nextStep?: string
    needsUserDecision?: string
    decisionCode?: string
  }
}

/** 最近一轮的变化（宿主 `TurnProgressReport` 的子集）。 */
interface TurnReport {
  turn: number
  at: string
  summary: string
  overall: { before: number; after: number }
  changes: {
    changed: boolean
    maturity: Array<{ dimension: string; from: string; to: string }>
    counts: Array<{ key: string; from: number; to: number }>
  }
}

/** `progress/workspace` 的返回值。 */
export interface WorkspaceProgressValue {
  protocol: number
  sessionId: string
  workspace: string | null
  research: boolean
  report: WorkspaceReport | null
  lastTurn: TurnReport | null
}

/**
 * 按钮的显示状态。
 *
 * `hidden` 是**保守**结论：宿主不可达、端点不存在（老宿主）、或该会话不是研究项目 ——
 * 三种情况都不显示按钮。宁可少显示一次，也不能在没有研究进展的地方出现一个假按钮。
 */
export type ProgressProbe =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'shown'; workspace: string | null; report: WorkspaceReport | null; lastTurn: TurnReport | null }

/**
 * 纯函数：宿主返回 → 按钮状态（可离线测试）。
 *
 * 判定只看宿主明确回答的 `research === true`；任何异常/缺字段都退化为 `hidden`，
 * 绝不"猜一个研究项目出来"（旧实现的全局缓存正是这么错的）。
 */
export function readProgressValue(res: unknown): ProgressProbe {
  const envelope = res as { ok?: unknown; value?: unknown } | null | undefined
  if (envelope?.ok !== true) return { kind: 'hidden' }
  const value = (envelope.value ?? {}) as Partial<WorkspaceProgressValue>
  if (value.protocol !== __HOST_PROTOCOL__) return { kind: 'hidden' }
  if (value.research !== true) return { kind: 'hidden' }
  return {
    kind: 'shown',
    workspace: value.workspace ?? null,
    report: value.report ?? null,
    lastTurn: value.lastTurn ?? null,
  }
}

/** 只保留路径的最后两段（顶部浮层里不需要完整路径）。 */
export function shortenPath(path: string | null): string {
  if (!path) return ''
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
}

/* ════════════════════════════════════════════════════════════════════════
 * 共用的量
 * ════════════════════════════════════════════════════════════════════════ */

const pct = (v: number): string => `${Math.round(v * 100)}%`

/**
 * 进展的后台刷新间隔（毫秒）。
 *
 * 两处用它：① 面板内容（研究资产一变，读数就该变）；② `./convfusion-tab.js` 的闸门
 * —— tab 文案里的百分比来自闸门的探针，靠同一个低频轮询跟上变化。
 */
export const PROGRESS_REFRESH_MS = 60000

/** 「研究进展」正文与整页容器共用的 props。 */
interface PanelProps {
  /** 当前会话 id（DSH 的 session 作用域 standard prop）。 */
  sessionId?: string | undefined
  /** DSH Slot 标准注入。 */
  t: Translate
}

/**
 * 成熟度条（纯 CSS，无图表依赖）。
 *
 * ⚠️ 只用 DSH **真实存在**的 alias token（值定义在 `dsh-client-ui-theme` 里：
 * 浅色主题下 `--dsw-alias-bg-layer-2` = `#fff`、`--dsw-alias-border-l2` = `#0000001a`、
 * `--dsw-alias-state-business-primary` = `#4176e6`）。写错名字的 token 会**静默**落到
 * 兜底值上（2026-09 实测：面板因此变成深色），所以每个 `var()` 都必须带合理兜底。
 */
function Bar({ scale }: { scale: number }): JSX.Element {
  const width = `${Math.max(0, Math.min(1, scale)) * 100}%`
  return (
    <span
      style={{
        display: 'inline-block',
        width: '88px',
        height: '7px',
        borderRadius: '4px',
        background: 'var(--dsw-alias-interactive-bg-hover, rgba(15,17,21,0.08))',
        overflow: 'hidden',
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          display: 'block',
          width,
          height: '100%',
          background: 'var(--dsw-alias-state-business-primary, #4176e6)',
        }}
      />
    </span>
  )
}

function clarityText(t: Translate, clarity: WorkspaceReport['need']['clarity']): string {
  return t(`progress.clarity.${clarity}`)
}

function stageText(t: Translate, stage: ProgressStage): string {
  return translateOr(t, `progress.stage.${stage.id}`, stage.label)
}

function gapText(t: Translate, gap: ProgressGap): string {
  switch (gap.code) {
    case 'stagePending':
      return t('progress.gap.stagePending', { stage: stageText(t, gap.stage) })
    case 'processComplete':
      return t('progress.gap.processComplete')
    case 'unsupportedClaims':
      return t('progress.gap.unsupportedClaims', { count: gap.count })
    case 'missingArtifacts':
      return t('progress.gap.missingArtifacts', { count: gap.count })
    case 'openQuestions':
      return t('progress.gap.openQuestions', { count: gap.count })
  }
}

function basisText(t: Translate, need: WorkspaceReport['need'], stage: ProgressStage | null): string {
  if (!need.basisCode) return need.basis
  const params = { ...(need.basisParams ?? {}) }
  if (need.basisCode === 'stagePending' && stage) {
    params.stage = stageText(t, stage)
    params.evidence = translateOr(
      t,
      `progress.stageEvidence.${stage.id}`,
      String(need.basisParams?.evidence ?? ''),
    )
  }
  return translateOr(t, `progress.basis.${need.basisCode}`, need.basis).replace(
    /\{(\w+)\}/g,
    (match, name: string) => (name in params ? String(params[name]) : match),
  )
}

function nextStepText(t: Translate, text: string, stage: ProgressStage | null): string {
  return stage ? translateOr(t, `progress.stageOutput.${stage.id}`, text) : text
}

function decisionText(t: Translate, need: WorkspaceReport['need']): string | undefined {
  if (need.decisionCode) {
    return translateOr(t, `progress.decision.${need.decisionCode}`, need.needsUserDecision ?? '')
  }
  return need.needsUserDecision
}

/**
 * 工作级缺口（结构化 type）→ 本地化短语。
 *
 * 宿主只传故障类别（`gap.type`）与目标（章节名 / Claim id），文案在客户端按 code 取 ——
 * 与面板其余部分同一条纪律（宿主不传成品文案）。取不到翻译时退化为 code 本身，
 * 不编一句中文。
 */
function workGapText(t: Translate, next: NonNullable<WorkProgress['next']>): string {
  const key = `progress.work.gap.${next.code}`
  const text = t(key, next.target ? { target: next.target } : {})
  return text === key ? next.code : text
}

/**
 * 「研究进展」的**正文**（面板本体）。
 *
 * ## 为什么与组件分离
 *
 * 这一页原先只是会话头部一个按钮点开的**浮层**；用户 2026-10 拍板改成会话 Tab
 * （`对话 | 轨迹 | 研究进展 | 科V社区`），于是正文必须能脱离那个按钮独立渲染：
 *
 * ```text
 * conversation.view (id: convfusion-progress, order: 19)
 *   └─ ResearchProgressView   ← 整页容器（自己滚动 + 居中列宽）
 *        └─ ResearchProgressPanel  ← 本组件：读数 + A/A2/B/C 四块
 * ```
 *
 * ## 三条边界
 *
 * 1. **不发明数据**：只渲染宿主算好的报告；成熟度是**等级折算**（同时显示等级名），
 *    可数资产给真实计数。拿不到数据就说明"宿主还没返回"，**不显示 0%**。
 * 2. **会话作用域**：`sessionId` 由 DSH 的 session 作用域 standard props 给到，
 *    因此每个会话只问自己的宿主答案，**不存在跨会话串味**（这正是 2026-09 那次
 *    链式槽位故障的反面：那时判定只能靠进程级全局变量猜）。
 * 3. **数字只有一处来源**：面板与 tab 文案里的百分比都来自宿主同一次端点，界面不自己算。
 *
 * tab 的显隐（只在研究工作区出现）不在这里 —— 由 `./convfusion-tab.js` 的闸门决定
 * 注册与否；tab 文案里的百分比同样由闸门从宿主答案里取（面板没挂载时也要有数）。
 */
export function ResearchProgressPanel({ sessionId, t }: PanelProps): JSX.Element {
  const [probe, setProbe] = useState<ProgressProbe>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  /** 当前选中的研究工作 id（空串 = 总览；宿主刷新后该工作消失则自动回到总览）。 */
  const [workId, setWorkId] = useState('')

  // 选中的工作可能已经不在报告里（换了工作区 / 论文被删）→ 回到总览，不留空面板。
  const shownWorkIds = (probe.kind === 'shown' ? probe.report?.works ?? [] : []).map((w) => w.id).join('\u0000')
  useEffect(() => {
    if (workId && !shownWorkIds.split('\u0000').includes(workId)) setWorkId('')
  }, [workId, shownWorkIds])

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setProbe({ kind: 'hidden' })
      return
    }
    setBusy(true)
    try {
      const res = await fetchSettingsSend('progress/workspace', { sessionId })
      setProbe(readProgressValue(res))
    } catch {
      // 宿主不可达 / 端点不存在（老宿主）：保守地不显示，不猜
      setProbe({ kind: 'hidden' })
    } finally {
      setBusy(false)
    }
  }, [sessionId])

  // 挂载即问一次
  useEffect(() => {
    void load()
  }, [load])

  // 研究资产一变读数就该变 —— 所以：低频轮询 + 窗口重新可见时立刻刷新
  // （切回 Harness 是最常见的"刚跑完一轮"时刻）。
  // 不订阅 chat 快照是为了不镜像更多 DSH 内部契约（契约一变就会静默失效）。
  useEffect(() => {
    const timer = window.setInterval(() => void load(), PROGRESS_REFRESH_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // 面板文字色/次要色/等宽字体都用 DSH 真实 token（每个都带兜底）
  const muted = 'var(--dsw-alias-label-tertiary, #81858c)'
  const mono: React.CSSProperties = {
    fontFamily: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: '11.5px',
  }
  if (probe.kind !== 'shown') {
    return (
      <div data-convfusion-progress-view="1" style={{ color: muted }}>
        {probe.kind === 'loading' ? t('progress.reading') : t('progress.noReport')}
      </div>
    )
  }

  const report = probe.report
  const lastTurn = probe.lastTurn
  /**
   * 多研究工作：只有**多于一个**工作才出现 tab 条；只有一个（或没有）时
   * 面板完全按今天的样子渲染 —— 不为了统一而给单工作加一层切换。
   */
  const works = report?.works ?? []
  const multi = works.length > 1
  const work = multi ? works.find((w) => w.id === workId) ?? null : null
  /**
   * 分区卡片：A/A2/B/C 四块各自成卡（边框 + 浅底 + 圆角）。
   *
   * ⚠️ 底只用一个**本文件里已经出现过**的 token（`--dsw-alias-interactive-bg-hover`），
   * 并带兜底值：写错 token 名会静默落到兜底（2026-09 实测面板曾因此整块变深色），
   * 而 `--dsw-alias-bg-layer-2` 是**不透明的 #fff**，用它做卡片底会与面板底色重复、看不出卡片边界。
   */
  const section: React.CSSProperties = {
    marginTop: '10px',
    padding: '9px 11px 10px',
    borderRadius: '9px',
    border: '1px solid var(--dsw-alias-border-l2, rgba(15,17,21,0.10))',
    background: 'var(--dsw-alias-interactive-bg-hover, rgba(15,17,21,0.035))',
  }
  const sectionTitle: React.CSSProperties = {
    color: muted,
    fontSize: '11.5px',
    letterSpacing: '0.04em',
    fontWeight: 600,
    marginBottom: '7px',
  }
  const iconButton: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: '4px',
    font: 'inherit',
    lineHeight: 1,
  }
  /* 工作 tab 条：紧凑一条，下边框表示选中（不引入新的主题 token）。 */
  const tabStrip: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px',
    marginTop: '8px',
    borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(15,17,21,0.10))',
  }
  const tab = (active: boolean): React.CSSProperties => ({
    border: 'none',
    background: 'transparent',
    color: active ? 'var(--dsw-alias-label-primary, #0f1115)' : muted,
    cursor: 'pointer',
    padding: '4px 9px 6px',
    marginBottom: '-1px',
    fontWeight: active ? 600 : 400,
    fontSize: '12px',
    lineHeight: 1.4,
    fontFamily: 'inherit',
    maxWidth: '180px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottom: active
      ? '2px solid var(--dsw-alias-state-business-primary, #4176e6)'
      : '2px solid transparent',
  })
  /** 工作面板里的一行资产（标签 + 数值 + 可选括注）。 */
  const workRow = (label: string, value: string, note?: string): JSX.Element => (
    <div key={label} style={{ display: 'flex', gap: '8px' }}>
      <span style={{ minWidth: '92px', whiteSpace: 'nowrap', ...mono }}>{label}</span>
      <span style={mono}>{value}</span>
      {note ? <span style={{ color: muted }}>{note}</span> : null}
    </div>
  )
  /**
   * 汇总表的一个计数格：总数，需要标注的子集写在括号里（`5 (2)`），含义放悬停提示 ——
   * 表头保持一个词，面板里不多塞解释文字。
   *
   * `alwaysTitle` 用于"这个数不需要相加也看得出来"的列（证据库），没有子集时也要有提示。
   */
  const aggCell = (
    key: string,
    value: number,
    extra: number,
    extraLabel: string,
    alwaysTitle = false,
  ): JSX.Element => (
    <span key={key} title={extra > 0 || alwaysTitle ? extraLabel : undefined}>
      {extra > 0 ? `${value} (${extra})` : String(value)}
    </span>
  )
  /**
   * 汇总表的一行：工作名 + 成熟度 + 六个计数（顺序与表头一致）。
   *
   * `totals` 存在时是**合计行**（工作名为"合计（N 个工作）"，成熟度留空 ——
   * 各工作成熟度的平均不是任何东西的测量值，不编一个出来）。
   */
  const aggRow = (row: WorkAggregateRow | null, totals?: WorkCounts): JSX.Element => {
    const c = totals ?? row?.counts
    if (!c) return <React.Fragment key="empty" />
    return (
      <React.Fragment key={row ? row.id : 'totals'}>
        {row ? (
          <span
            title={row.active ? `${row.title} · ${t('progress.works.active')}` : row.title}
            style={{
              color: row.active ? undefined : muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.active ? `● ${row.short}` : row.short}
          </span>
        ) : (
          <span style={{ color: muted }}>{t('progress.works.totals', { count: report?.aggregate?.works ?? 0 })}</span>
        )}
        {row ? (
          <span title={row.maturitySource === 'derived' ? t('progress.works.derived') : undefined}>
            {pct(row.overall)}
          </span>
        ) : (
          <span />
        )}
        <span>{`${c.sectionsWithContent}/${c.sections}`}</span>
        {aggCell(
          'claims',
          c.claims,
          c.claimsWithoutEvidence,
          t('progress.work.count.claimsWithoutEvidence', { count: c.claimsWithoutEvidence }),
        )}
        {aggCell(
          'evidence',
          c.evidence,
          c.evidenceUsedInManuscript,
          // 证据库是全工作区共用的：合计里只报一份（宿主已如此），悬停说明免得看成"漏加了"
          `${t('progress.works.evidenceShared')} · ${t('progress.work.count.evidenceUsed', {
            count: c.evidenceUsedInManuscript,
          })}`,
          true,
        )}
        {aggCell('gaps', c.gaps, c.gapsHigh, t('progress.work.count.gapsHigh', { count: c.gapsHigh }))}
        {aggCell('proposals', c.openProposals, 0, '')}
      </React.Fragment>
    )
  }

  return (
    <div data-convfusion-progress-view="1">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <strong>{t('progress.name')}</strong>
        {report ? (
          <span style={{ color: muted, ...mono }}>
            {t('progress.summary', { percent: pct(work ? work.overall : report.overall) })}
            {work
              ? ` · ${t('progress.work.meta', { version: work.version, status: work.status })}`
              : report.progress.stage
                ? t('progress.currentStage', { stage: stageText(t, report.progress.stage) })
                : ''}
          </span>
        ) : (
          <span style={{ color: muted }}>{t('progress.noData')}</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '2px' }}>
          {busy ? <span style={{ color: muted, ...mono }}>{t('progress.reading')}</span> : null}
          <button
            type="button"
            style={{ ...iconButton, opacity: busy ? 0.5 : 1 }}
            aria-label={t('progress.refresh')}
            title={t('progress.refresh')}
            disabled={busy}
            onClick={() => void load()}
          >
            ⟳
          </button>
        </span>
      </div>
      <div style={{ color: muted, ...mono }}>
        {shortenPath(probe.workspace)}
        {work ? ` · ${work.id}` : ''}
      </div>

      {/* 工作 tab：只在**多于一个**工作时出现（单工作与今天完全一致） */}
      {multi ? (
        <div role="tablist" aria-label={t('progress.name')} style={tabStrip} data-convfusion-progress-tabs="1">
          <button
            type="button"
            role="tab"
            aria-selected={work === null}
            title={t('progress.works.overview')}
            style={tab(work === null)}
            onClick={() => setWorkId('')}
          >
            {t('progress.works.overview')}
          </button>
          {works.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={work?.id === w.id}
              title={w.active ? `${w.title} · ${t('progress.works.active')}` : w.title}
              style={tab(work?.id === w.id)}
              onClick={() => setWorkId(w.id)}
            >
              {w.active ? `● ${w.short}` : w.short}
            </button>
          ))}
        </div>
      ) : null}

      {report && work ? (
        <>
          {/* A. 这个工作自己的成熟度（论文成熟度维度；无评估时按资产推定并标明） */}
          <div style={section}>
            <div style={sectionTitle}>
              {t('progress.work.section.maturity')}
              {work.maturitySource === 'derived' ? t('progress.work.maturityDerived') : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px 16px' }}>
              {work.maturity.map((d) => (
                <div key={d.dimension} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ minWidth: '92px', whiteSpace: 'nowrap', ...mono }}>
                    {translateOr(t, `maturity.paper.${d.dimension}`, d.dimension)}
                  </span>
                  <Bar scale={d.scale} />
                  <span style={{ color: muted, whiteSpace: 'nowrap', ...mono }}>{maturityLevelText(t, d.level)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* A2. 这个工作自己的可数资产（真实计数） */}
          <div style={section}>
            <div style={sectionTitle}>{t('progress.work.section.assets')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px 16px' }}>
              {workRow(
                t('progress.work.count.sections'),
                `${work.counts.sectionsWithContent}/${work.counts.sections}`,
              )}
              {workRow(
                t('progress.work.count.claims'),
                String(work.counts.claims),
                work.counts.claimsWithoutEvidence > 0
                  ? t('progress.work.count.claimsWithoutEvidence', { count: work.counts.claimsWithoutEvidence })
                  : undefined,
              )}
              {workRow(
                t('progress.work.count.evidence'),
                String(work.counts.evidence),
                t('progress.work.count.evidenceUsed', { count: work.counts.evidenceUsedInManuscript }),
              )}
              {workRow(
                t('progress.work.count.gaps'),
                String(work.counts.gaps),
                work.counts.gapsHigh > 0
                  ? t('progress.work.count.gapsHigh', { count: work.counts.gapsHigh })
                  : undefined,
              )}
              {work.counts.openProposals > 0
                ? workRow(t('progress.work.count.proposals'), String(work.counts.openProposals))
                : null}
            </div>
          </div>

          {/* C. 这个工作的下一步（最高优先级缺口；没有缺口就不渲染这一段） */}
          {work.next ? (
            <div style={section}>
              <div style={sectionTitle}>{t('progress.work.section.next')}</div>
              <div>{t('progress.work.nextStep', { text: workGapText(t, work.next) })}</div>
              {work.next.skill ? (
                <div style={{ color: muted }}>
                  {t('progress.work.nextSkill', { skill: skillText(t, work.next.skill, work.next.skill) })}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : report ? (
        <>
          {/* 总览（多工作）：每个工作一行 + 合计 —— 一台工作一台读数，不复述某一个工作。
              下面的 A/A2/B/C 是**项目级**内容（Research State / 全局计数 / 回合变化），照旧保留。 */}
          {multi && report.aggregate ? (
            <div style={section} data-convfusion-progress-aggregate="1">
              <div style={sectionTitle}>{t('progress.works.section.aggregate')}</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(84px, 1.5fr) repeat(6, minmax(42px, 0.7fr))',
                  gap: '3px 6px',
                  alignItems: 'baseline',
                  ...mono,
                }}
              >
                <span style={{ color: muted }}>{t('progress.works.col.work')}</span>
                <span style={{ color: muted }}>{t('progress.works.col.maturity')}</span>
                <span style={{ color: muted }}>{t('progress.works.col.sections')}</span>
                <span style={{ color: muted }}>{t('progress.works.col.claims')}</span>
                <span style={{ color: muted }}>{t('progress.works.col.evidence')}</span>
                <span style={{ color: muted }}>{t('progress.works.col.gaps')}</span>
                <span style={{ color: muted }}>{t('progress.works.col.proposals')}</span>
                {report.aggregate.rows.map((row) => aggRow(row))}
                {aggRow(null, report.aggregate.totals)}
              </div>
            </div>
          ) : null}

          {/* A. 研究现在到了哪里 */}
          <div style={section}>
            <div style={sectionTitle}>{t('progress.section.maturity')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px 16px' }}>
              {report.progress.dimensions.map((d) => (
                <div key={d.dimension} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ minWidth: '92px', whiteSpace: 'nowrap', ...mono }}>{maturityDimensionText(t, d.dimension)}</span>
                  <Bar scale={d.scale} />
                  <span style={{ color: muted, whiteSpace: 'nowrap', ...mono }}>{maturityLevelText(t, d.level)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 可数资产（真实计数，不给百分比） */}
          <div style={section}>
            <div style={sectionTitle}>{t('progress.section.assets')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px 16px' }}>
              {report.counts.map((row) => (
                <div key={row.key} style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ minWidth: '92px', whiteSpace: 'nowrap', ...mono }}>{progressCountText(t, row.key)}</span>
                  <span style={mono}>{row.value}</span>
                  {row.detail ? (
                    <span style={{ color: muted }}>
                      {t(`progress.count.${row.detail.code}`, { count: row.detail.count })}
                    </span>
                  ) : null}
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ minWidth: '92px', ...mono }}>{t('progress.paper')}</span>
                <span style={{ color: muted }}>
                  {report.paper ? t('progress.paper.present') : t('progress.paper.absent')}
                </span>
              </div>
            </div>
            <div style={{ color: muted }}>{t('progress.stateVersion', { version: report.stateVersion })}</div>
          </div>

          {/* B. 最近一轮改变了什么（需要该会话跑完过至少一轮） */}
          <div style={section}>
            <div style={sectionTitle}>{t('progress.section.turn')}</div>
            {lastTurn ? (
              <div>
                <div style={{ color: muted, ...mono }}>
                  {t('progress.turn.summary', {
                    turn: lastTurn.turn,
                    before: pct(lastTurn.overall.before),
                    after: pct(lastTurn.overall.after),
                    assetChange:
                      lastTurn.changes.counts.length > 0
                        ? t('progress.turn.assetChange', { count: lastTurn.changes.counts.length })
                        : t('progress.turn.noAssetChange'),
                  })}
                </div>
                {lastTurn.changes.changed ? (
                  <ul style={{ margin: '2px 0 0', paddingLeft: '18px' }}>
                    {lastTurn.changes.maturity.map((m) => (
                      <li key={`m-${m.dimension}`}>
                        {t('progress.turn.maturityChange', {
                          dimension: maturityDimensionText(t, m.dimension),
                          from: maturityLevelText(t, m.from),
                          to: maturityLevelText(t, m.to),
                        })}
                      </li>
                    ))}
                    {lastTurn.changes.counts.map((c) => (
                      <li key={`c-${c.key}`}>
                        {t('progress.turn.countChange', {
                          label: progressCountText(t, c.key),
                          from: c.from,
                          to: c.to,
                          delta: `${c.to - c.from > 0 ? '+' : ''}${c.to - c.from}`,
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: muted }}>{t('progress.turn.noChange')}</div>
                )}
              </div>
            ) : (
              <div style={{ color: muted }}>{t('progress.turn.unavailable')}</div>
            )}
          </div>

          {/* C. 当前缺口与推进判定 */}
          <div style={section}>
            <div style={sectionTitle}>{t('progress.section.need')}</div>
            <ul style={{ margin: '2px 0 0', paddingLeft: '18px' }}>
              {report.need.gaps.map((g, index) => (
                <li key={`${g.code}-${index}`}>{gapText(t, g)}</li>
              ))}
            </ul>
            <div style={{ marginTop: '2px' }}>
              <span style={{ color: muted }}>{t('progress.need.assessment')}</span>
              {clarityText(t, report.need.clarity)}
              {report.need.basis ? (
                <span style={{ color: muted }}>
                  {t('progress.need.basis', { basis: basisText(t, report.need, report.progress.stage) })}
                </span>
              ) : null}
            </div>
            {report.need.nextStep ? (
              <div>
                {t('progress.need.nextStep', {
                  text: nextStepText(t, report.need.nextStep, report.progress.stage),
                })}
              </div>
            ) : null}
            {decisionText(t, report.need) ? (
              <div>{t('progress.need.decision', { text: decisionText(t, report.need) })}</div>
            ) : null}
          </div>
        </>
      ) : (
        <div style={{ marginTop: '8px', color: muted }}>{t('progress.noReport')}</div>
      )}

      <div style={{ marginTop: '10px', color: muted, fontSize: '11.5px' }}>{t('progress.footnote')}</div>
    </div>
  )
}

/**
 * 会话 Tab「研究进展」的正文（`conversation.view` 的占用者）。
 *
 * 整页容器：`conversation.view` 的容器是 `flex: 1; min-height: 0`，**没有 overflow**，
 * 外层的 `.centerCol` 还是 `overflow: hidden` —— 所以滚动必须自己给，否则长内容被裁掉。
 * 列宽用固定的居中列（会话正文那条可拖拽宽度是**对话**的排版，不适合卡片列表）。
 */
export function ResearchProgressView({ sessionId, t }: PanelProps): JSX.Element {
  return (
    <div
      data-convfusion-progress-page="1"
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        background: 'var(--dsw-alias-bg-base, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #0f1115)',
      }}
    >
      <div
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '880px',
          margin: '0 auto',
          padding: '16px 24px 28px',
        }}
      >
        <ResearchProgressPanel sessionId={sessionId} t={t} />
      </div>
    </div>
  )
}
