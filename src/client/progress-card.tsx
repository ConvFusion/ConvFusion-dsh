/**
 * ConvFusion 2.0 — 对话流里的研究进展卡（`v2-Progress.md`）
 *
 * ## 为什么是"客户端卡片"而不是"会话消息"
 *
 * 曾经把报告作为 plugin 来源的 `user/message` 追加进会话，但 DSH 把**所有** plugin
 * 来源的消息渲染成"上下文注入"折叠行（`ContextMessageNodeView`，按 `kind:'context'`
 * 路由），form 取什么值都不改变观感；而能进入对话表面的事件类型只有 4 种，**无法
 * 自定义**。因此"对话结束后、在对话流里显示研究进展"只能落在客户端：
 *
 * ```text
 * conversation.chat.turnTail（chain：回合尾部、selector 命中才渲染）
 *        ↑ 只显示研究会话
 * 宿主 RPC /dsh-convfusion/progress/latest（数据只来自磁盘真实资产）
 * ```
 *
 * ## 三个必须守住的边界
 *
 * 1. **只显示在研究会话**：`turnTail` 是"首个命中者渲染"的链式槽，官方 `deliverables`
 *    （本轮产出文件行）也在链上。selector 只在本会话的工作区是研究项目时命中，
 *    其余回合返回 null —— 让 `deliverables` 照常显示（用户 2026-09 拍板：研究会话里
 *    进度卡优先）。
 * 2. **判定依据是会话自己的工作区**：由宿主用 `ctx.sessions.get(id).header.cwd` 解析
 *    （RPC 返回），不依赖插件进程的启动目录。
 * 3. **不发明数据**：卡片只渲染宿主算好的报告；拿不到就什么都不显示。
 */

import { useEffect, useState } from 'react'
import { fetchSettingsSend } from './settings.js'

/* ════════════════════════════════════════════════════════════════════════
 * 宿主契约（镜像，不 import：客户端 bundle 不依赖宿主模块）
 * ════════════════════════════════════════════════════════════════════════ */

interface ProgressReport {
  at: string
  turn: number
  summary: string
  overall: { before: number; after: number }
  progress: {
    dimensions: Array<{ dimension: string; level: string; scale: number }>
    stage: string | null
  }
  changes: {
    changed: boolean
    maturity: Array<{ dimension: string; from: string; to: string }>
    counts: Array<{ key: string; label: string; from: number; to: number }>
  }
  need: {
    gaps: string[]
    clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
    basis: string
    nextStep?: string
    needsUserDecision?: string
  }
  moved: boolean
}

interface LatestValue {
  sessionId: string
  workspace: string | null
  research: boolean
  report: ProgressReport | null
}

/* ════════════════════════════════════════════════════════════════════════
 * 会话 → 是否研究工作区（selector 只能同步判断，所以需要预热缓存）
 * ════════════════════════════════════════════════════════════════════════ */

/** 已探明的会话研究性（`true`/`false`；未知 = 不在表里）。 */
const researchSessions = new Map<string, boolean>()
/** 当前展示的会话（`conversation.input.dock` 是按会话挂载的）。 */
let activeSessionId: string | undefined

/** 仅供离线测试：重置模块状态。 */
export function resetProgressCardState(active?: string): void {
  researchSessions.clear()
  activeSessionId = active
}

/**
 * `turnTail` 的 selector：只认"当前会话是研究工作区"。
 *
 * ⚠️ 未知时**返回 null**（不抢 `deliverables` 的位置）——宁可少显示一次，
 * 也不能在没有研究进展的地方挡住官方组件。
 */
export function selectResearchTurn(): { sessionId: string } | null {
  const id = activeSessionId
  if (!id) return null
  return researchSessions.get(id) === true ? { sessionId: id } : null
}

/* ════════════════════════════════════════════════════════════════════════
 * 预热组件（挂在会话级 list 槽上，渲染 null）
 * ════════════════════════════════════════════════════════════════════════ */

interface WarmProps {
  sessionId?: string
}

/**
 * 研究会话预热：把"这个会话的工作区是不是研究项目"问清并缓存。
 *
 * 挂在 `conversation.input.dock`（**list = 追加式**，不抢任何官方组件）上，
 * 随会话视图挂载 —— 早于任何回合结束，所以进度卡的 selector 届时已有依据。
 */
export function ResearchProgressWarmer({ sessionId }: WarmProps): null {
  useEffect(() => {
    if (!sessionId) return
    activeSessionId = sessionId
    if (researchSessions.has(sessionId)) return
    let cancelled = false
    void (async () => {
      try {
        const res = (await fetchSettingsSend('progress/session', { sessionId })) as {
          ok?: boolean
          value?: { research?: boolean }
        }
        if (cancelled) return
        researchSessions.set(sessionId, res?.ok === true && res.value?.research === true)
      } catch {
        // 宿主不可达：保守地当作"非研究会话"（不抢位置），下次挂载再试
        if (!cancelled) researchSessions.set(sessionId, false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])
  return null
}

/* ════════════════════════════════════════════════════════════════════════
 * 进度卡
 * ════════════════════════════════════════════════════════════════════════ */

interface CardProps {
  sessionId?: string
  /** 回合位置（由 owner 提供；用于"这一轮"的变化）。 */
  turn?: { turn?: number }
  /** 回合结束序号（变化即重新取数）。 */
  seq?: number
}

const pct = (v: number): string => `${Math.round(v * 100)}%`

/** 成熟度条（纯 CSS，无重量级图表依赖）。 */
function Bar({ scale }: { scale: number }): JSX.Element {
  const width = `${Math.max(0, Math.min(1, scale)) * 100}%`
  return (
    <span
      style={{
        display: 'inline-block',
        width: '88px',
        height: '7px',
        borderRadius: '4px',
        background: 'var(--dsw-alias-fill-tertiary, rgba(127,127,127,0.22))',
        overflow: 'hidden',
        verticalAlign: 'middle',
      }}
    >
      <span style={{ display: 'block', width, height: '100%', background: 'var(--dsw-alias-brand-primary, #4b7bec)' }} />
    </span>
  )
}

function delta(before: number, after: number): string {
  const d = Math.round((after - before) * 100)
  if (d > 0) return `↑${d}%`
  if (d < 0) return `↓${Math.abs(d)}%`
  return '—'
}

/**
 * 回合尾部的"本轮研究进展"卡。
 *
 * 拿不到报告（非研究工作区 / 尚未产生报告）时渲染 `null`：
 * 这个槽位是链式的，但我们只在研究会话里命中，所以不会把官方组件的位置占空。
 */
export function ResearchProgressCard({ sessionId, turn, seq }: CardProps): JSX.Element | null {
  const [report, setReport] = useState<ProgressReport | null>(null)
  const turnNo = turn?.turn

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    void (async () => {
      try {
        const res = (await fetchSettingsSend('progress/latest', { sessionId })) as {
          ok?: boolean
          value?: LatestValue
        }
        if (cancelled) return
        setReport(res?.ok === true ? (res.value?.report ?? null) : null)
      } catch {
        if (!cancelled) setReport(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, turnNo, seq])

  if (!report) return null

  const muted = 'var(--dsw-alias-label-tertiary, #8a8f98)'
  const box: React.CSSProperties = {
    margin: '8px 0 4px',
    padding: '10px 14px 12px',
    border: '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.22))',
    borderRadius: '10px',
    background: 'var(--dsw-alias-bg-elevated, rgba(127,127,127,0.06))',
    fontSize: '12.5px',
    lineHeight: 1.6,
  }
  const head: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    flexWrap: 'wrap',
  }
  const section: React.CSSProperties = { marginTop: '8px' }
  const sectionTitle: React.CSSProperties = { color: muted, fontSize: '11.5px', letterSpacing: '0.04em' }
  const mono: React.CSSProperties = {
    fontFamily: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: '11.5px',
  }

  return (
    <div style={box} data-convfusion-progress-card="1" data-turn={report.turn}>
      {/* 标题行：图标 + 一行摘要（对话流里一眼可见"这轮推动了没有"） */}
      <div style={head}>
        <span style={{ fontSize: '14px' }}>📊</span>
        <strong>本轮研究进展</strong>
        <span style={{ color: muted, ...mono }}>成熟度折算 {pct(report.overall.before)} → {pct(report.overall.after)}</span>
        <span style={{ color: report.moved ? 'var(--dsw-alias-brand-primary, #4b7bec)' : muted, ...mono }}>
          {delta(report.overall.before, report.overall.after)}
        </span>
        {report.progress.stage ? <span style={{ color: muted }}>· 当前阶段 {report.progress.stage}</span> : null}
      </div>

      {/* A. 研究现在到了哪里 */}
      <div style={section}>
        <div style={sectionTitle}>A · 研究成熟度（等级折算，非测量值）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '2px 18px' }}>
          {report.progress.dimensions.map((d) => (
            <div key={d.dimension} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ minWidth: '92px', ...mono }}>{d.dimension}</span>
              <Bar scale={d.scale} />
              <span style={{ color: muted, ...mono }}>{d.level}</span>
            </div>
          ))}
        </div>
      </div>

      {/* B. 刚才这轮改变了什么 */}
      <div style={section}>
        <div style={sectionTitle}>B · 本轮变化</div>
        {report.changes.changed ? (
          <ul style={{ margin: '2px 0 0', paddingLeft: '18px' }}>
            {report.changes.maturity.map((m) => (
              <li key={`m-${m.dimension}`}>
                成熟度 {m.dimension}：{m.from} → {m.to}
              </li>
            ))}
            {report.changes.counts.map((c) => (
              <li key={`c-${c.key}`}>
                {c.label}：{c.from} → {c.to}（{c.to - c.from > 0 ? '+' : ''}{c.to - c.from}）
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ color: muted }}>本轮没有形成新的可验证研究资产（讨论/澄清不产生资产，这是正常的）。</div>
        )}
      </div>

      {/* C. 接下来最值得做什么 */}
      <div style={section}>
        <div style={sectionTitle}>C · 当前缺口与推进判定</div>
        <ul style={{ margin: '2px 0 0', paddingLeft: '18px' }}>
          {report.need.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <div style={{ marginTop: '2px' }}>
          <span style={{ color: muted }}>推进判定：</span>
          {report.need.clarity === 'clear'
            ? '方向明确 → 可直接推进'
            : report.need.clarity === 'ambiguous'
              ? '需要你选一个方向'
              : report.need.clarity === 'blocked'
                ? '等你拍板（阻塞）'
                : '（未判定）'}
          {report.need.basis ? <span style={{ color: muted }}>（依据：{report.need.basis}）</span> : null}
        </div>
        {report.need.nextStep ? <div>下一步：{report.need.nextStep}</div> : null}
        {report.need.needsUserDecision ? <div>待你决定：{report.need.needsUserDecision}</div> : null}
        <div style={{ marginTop: '4px', color: muted }}>
          以上是 Research State 暴露出的研究需求，不是必须执行的下一步。你可以接受，也可以继续自由对话。
        </div>
      </div>
    </div>
  )
}
