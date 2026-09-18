/**
 * ConvFusion 2.0 — 顶部「研究进展」按钮（+ 展开面板）
 *
 * ## 为什么从"对话流里的进度卡"改成"顶部按钮"（2026-09 用户拍板）
 *
 * 旧实现挂在 `conversation.chat.turnTail`（链式槽位）。链式槽位有两件事**做不到**：
 *
 * ```text
 * 1. selector 只能拿到 owner props = { turn, seq, openFile } —— **没有会话身份**，
 *    所以"这个会话是不是研究项目"只能靠一个进程级全局变量（旧的 activeSessionId
 *    + researchSessions 缓存）来猜；
 * 2. 猜出来的结果被**所有**会话共用 —— 一旦某个研究会话预热过，链式选举就在
 *    每个会话里都命中我们的条目，于是进度内容出现在**非**研究会话的对话流里。
 * ```
 *
 * 换成 `conversation.session.header.utilities` 后问题从根上消失：
 *
 * ```text
 * session 作用域的 list 槽位（追加式，replaceRisk: none）
 *   → 组件拿到**自己会话**的 `sessionId`（DSH 的 standard props）
 *   → 宿主按"这个会话自己的工作区"回答 research 与否（progress/workspace）
 *   → 非研究工作区：连按钮都不渲染（不是渲染成空，而是根本不占位）
 * ```
 *
 * ## 三条必须守住的边界
 *
 * 1. **只显示在研究会话**：`research !== true` 一律不渲染按钮 —— 判定来自宿主，且
 *    用的是会话自己的 `header.cwd`，与插件进程的启动目录无关。
 * 2. **不发明数据**：面板只渲染宿主算好的报告；成熟度是**等级折算**（同时显示等级名），
 *    可数资产给真实计数。拿不到数据就什么都不显示，不显示 0%。
 * 3. **不动别人的槽位**：`list` 槽位是追加式，官方条目（open-in-app / session-log-export）
 *    照常显示；面板是本组件自己的浮层，不开模态、不拦截对话。
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchSettingsSend } from './settings.js'
import {
  maturityDimensionText,
  maturityLevelText,
  progressCountText,
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

/** 当前工作区的研究进展（宿主 `buildWorkspaceProgress` 的产物）。 */
interface WorkspaceReport {
  at: string
  stateVersion: string
  overall: number
  progress: { dimensions: ProgressDimension[]; stage: ProgressStage | null }
  counts: ProgressCountRow[]
  paper: boolean
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
 * 顶部按钮
 * ════════════════════════════════════════════════════════════════════════ */

interface ButtonProps {
  /** 当前会话 id（DSH 的 session 作用域 standard prop）。 */
  sessionId?: string
  /** DSH Slot 标准注入。 */
  t: Translate
}

/** 图标（16px，`currentColor`，与官方 header 工具图标同规格）。 */
function ProgressGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.2" y="8.4" width="2.3" height="4.4" rx="0.6" fill="currentColor" />
      <rect x="6.85" y="5.4" width="2.3" height="7.4" rx="0.6" fill="currentColor" />
      <rect x="10.5" y="2.4" width="2.3" height="10.4" rx="0.6" fill="currentColor" />
    </svg>
  )
}

const pct = (v: number): string => `${Math.round(v * 100)}%`

/** 顶部百分比的后台刷新间隔（毫秒）。见 `ResearchProgressButton` 里的说明。 */
export const PROGRESS_REFRESH_MS = 60000

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
 * 会话头部的「研究进展」按钮。
 *
 * 会话作用域 → 换会话即重挂（`sessionId` 变化），因此**不存在跨会话串味**：
 * 每个会话只问自己的宿主答案，缓存也只在组件内部。
 */
export function ResearchProgressButton({ sessionId, t }: ButtonProps): JSX.Element | null {
  const [probe, setProbe] = useState<ProgressProbe>({ kind: 'loading' })
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

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

  // 挂载即问一次：非研究工作区直接不渲染按钮
  useEffect(() => {
    void load()
  }, [load])

  // 每次打开都重新取一次（研究资产可能刚变）
  useEffect(() => {
    if (open) void load()
  }, [open, load])

  // 图标旁的百分比是"当前成熟度折算"，研究资产一变它就该变 —— 所以：
  //   · 低频轮询（单个会话只挂一个按钮，且只在按钮可见时存在，开销可控）；
  //   · 窗口重新可见时立刻刷新（切回 Harness 是最常见的"刚跑完一轮"时刻）。
  // 不订阅 chat 快照是为了不镜像更多 DSH 内部契约（契约一变就会静默失效）。
  useEffect(() => {
    if (probe.kind !== 'shown') return undefined
    const timer = window.setInterval(() => void load(), PROGRESS_REFRESH_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [probe.kind, load])

  // 定位：`position: fixed` + 从按钮的视口矩形算出位置。
  //
  // 为什么用 fixed 而不是在按钮下面 `absolute`：header 一类的祖先常有 `overflow: hidden`
  // （标题要省略号），absolute 会被裁掉。fixed 不受裁剪影响，随窗口滚动/缩放重算即可。
  // （若将来壳层在某个祖先上加 `transform`，fixed 会改以该祖先为包含块 —— 那时需要
  // 改成 portal 到 body。当前 DSH 壳层没有这种祖先。）
  const place = useCallback((): void => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return undefined
    const onMove = (): void => place()
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (!target) return
      if (anchorRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, place])

  if (probe.kind !== 'shown') return null

  const report = probe.report
  const lastTurn = probe.lastTurn
  // 面板文字色/次要色/等宽字体都用 DSH 真实 token（每个都带兜底）
  const muted = 'var(--dsw-alias-label-tertiary, #81858c)'
  const mono: React.CSSProperties = {
    fontFamily: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: '11.5px',
  }
  const section: React.CSSProperties = { marginTop: '10px' }
  const sectionTitle: React.CSSProperties = { color: muted, fontSize: '11.5px', letterSpacing: '0.04em' }
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

  return (
    <span ref={anchorRef} style={{ display: 'inline-flex', alignItems: 'center' }} data-convfusion-progress-button="1">
      <button
        type="button"
        aria-label={
          report
            ? t('progress.button.ariaWithPercent', { percent: pct(report.overall) })
            : t('progress.name')
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          report
            ? t('progress.button.titleWithPercent', { percent: pct(report.overall) })
            : t('progress.button.title')
        }
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          minWidth: '24px',
          height: '24px',
          border: 'none',
          borderRadius: '6px',
          background: open || hover ? 'var(--dsw-alias-interactive-bg-hover, rgba(15,17,21,0.06))' : 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          padding: '0 6px',
          font: 'inherit',
          lineHeight: 1,
        }}
      >
        <ProgressGlyph />
        {report ? (
          <span
            data-convfusion-progress-percent="1"
            style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}
          >
            {pct(report.overall)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('progress.name')}
          data-convfusion-progress-panel="1"
          style={{
            position: 'fixed',
            top: pos?.top ?? 0,
            right: pos?.right ?? 12,
            visibility: pos ? 'visible' : 'hidden',
            zIndex: 2147483000,
            width: 'min(440px, calc(100vw - 24px))',
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: '12px 16px 14px',
            // ⚠️ 面板是**自己画的浮层**，必须显式给出浅色底与文字色：
            // 这两个 token 在浅色主题下分别是 #fff 与近黑；写错 token 名会静默落到兜底值。
            background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
            color: 'var(--dsw-alias-label-primary, #0f1115)',
            border: '1px solid var(--dsw-alias-border-l2, rgba(15,17,21,0.10))',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(15,17,21,0.12), 0 2px 6px rgba(15,17,21,0.06)',
            fontSize: '12.5px',
            lineHeight: 1.6,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong>{t('progress.name')}</strong>
            {report ? (
              <span style={{ color: muted, ...mono }}>
                {t('progress.summary', { percent: pct(report.overall) })}
                {report.progress.stage
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
              <button
                type="button"
                style={iconButton}
                aria-label={t('progress.close')}
                title={t('progress.close')}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </span>
          </div>
          <div style={{ color: muted, ...mono }}>{shortenPath(probe.workspace)}</div>

          {report ? (
            <>
              {/* A. 研究现在到了哪里 */}
              <div style={section}>
                <div style={sectionTitle}>{t('progress.section.maturity')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2px 16px' }}>
                  {report.progress.dimensions.map((d) => (
                    <div key={d.dimension} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ minWidth: '92px', ...mono }}>{maturityDimensionText(t, d.dimension)}</span>
                      <Bar scale={d.scale} />
                      <span style={{ color: muted, ...mono }}>{maturityLevelText(t, d.level)}</span>
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
                      <span style={{ minWidth: '92px', ...mono }}>{progressCountText(t, row.key)}</span>
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

          <div style={{ marginTop: '10px', color: muted, fontSize: '11.5px' }}>
            {t('progress.footnote')}
          </div>
        </div>
      ) : null}
    </span>
  )
}
