/**
 * ConvFusion 2.0 — 设置页本体（【设置】-【ConvFusion】-【本地设置】）
 *
 * ## v2 与 v0.1.5 的结构差异（重建依据见仓库根 `ConvFusion_setting.md`）
 *
 * ```text
 * v0.1.5   模块（8 个，Python 管线）→ 提示词节点（110 个）
 * v0.2     能力类别（taxonomy 的 9 个大类）→ 能力 / Skill（47 个）→ 可定制章节（6 个）
 * ```
 *
 * 所以 v0.1.5 的「① 模块 / ② 提示词」两个下拉，在 v2 里是
 * 「① 能力类别 / ② 能力」两个下拉 + 一个「③ 可定制章节」选择器。
 *
 * ## 术语（不要混用）
 *
 * | 词 | 指的是 |
 * |---|---|
 * | **能力 / Skill** | 库里的**一个**条目（`research-gap-analysis`）。它是可复用的方法片段 |
 * | **能力类别** | 能力的分类（文献 / 实验 / 分析…）。**不是**研究方法 |
 * | **能力库 / Skill Library** | 管理全部能力的地方（我们维护、只读） |
 * | **研究方法** | 用户把**多个能力**逐个定制之后**形成的那一整套做法** —— |
 * | | 它可以被分享给其他研究者使用。**一个 Skill 不等于一套研究方法。** |
 *
 * ## 两个数据源，不要混
 *
 * | 内容 | 通道 | 为什么 |
 * |---|---|---|
 * | 定制**文件名** | `settingsScope`（落 `settings.yaml`） | 它是配置，不是内容 |
 * | 定制**正文** | 同源 `POST /dsh-convfusion/<endpoint>`（落 `$DSH_HOME/convfusion/<file>.json`） | 用户拍板：设置文件绝不能因定制而变大 |
 *
 * ## 依赖约束
 *
 * 只 import `react` 与本 bundle 的本地模块。跨插件服务（`slots` / `settingsScope`）
 * 通过 cordis 的 inject face 拿到，并在这里**结构化镜像**其契约 ——
 * 不 value-import 任何 `@deepseek-ai/*` 包（bundle 里它们本来就是 external）。
 *
 * 数据面用**同源 `fetch`**（不是 Connection RPC）：宿主侧的 RPC 渠道对外部插件不可用，
 * 详见 `src/settings-rpc.ts` 文件头与 `scripts/probe-settings-rpc-route.mjs`。
 * 路由带 Harness 的信任/鉴权栅栏，等价于 RPC 渠道的安全级别。
 */

import React from 'react'
import { ConvFusionMark } from './icon.js'

/* ════════════════════════════════════════════════════════════════════════
 * 跨插件服务的结构化契约（镜像，不 import）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * settings scope 的快照。
 *
 * ⚠️ **刻意只读 `status`**：定制文件叫什么、放在哪，对用户不可见也不可配。
 * 这里保留 `value` 只会诱导后来者又把它渲染出来（那正是被要求删掉的东西）。
 */
interface ScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
}

interface SettingsScopeLike {
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

interface RpcResult {
  ok: boolean
  value?: unknown
  error?: { code?: string; message?: string }
}

/** 设置面的 HTTP 路由前缀（与宿主 `settings-rpc.ts` 的常量一致）。 */
export const SETTINGS_ROUTE_PREFIX = '/dsh-convfusion'

/** 一次端点调用；可替换，便于离线测试。 */
export type SettingsSend = (
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
) => Promise<RpcResult>

export interface ConvFusionSettingsProps {
  scope: SettingsScopeLike
  /** 传输实现（缺省 = 浏览器同源 fetch）。 */
  send?: SettingsSend | undefined
}

/* ════════════════════════════════════════════════════════════════════════
 * 宿主返回的状态（与 `src/settings-rpc.ts` 的 SettingsState 一一对应）
 * ════════════════════════════════════════════════════════════════════════ */

interface HostSection {
  section: string
  base: string
  overridden: boolean
  userText?: string
}
interface HostSkill {
  skillId: string
  skillName: string
  sections: HostSection[]
  overriddenCount: number
}
interface HostCategory {
  categoryId: string
  categoryName: string
  skills: HostSkill[]
  overriddenCount: number
  pointCount: number
}
/**
 * 设置页真正用到的状态。
 *
 * 宿主还会多返回 `config` / `file`（定制文件路径、是否存在、覆盖数）供诊断与测试用，
 * 但**界面一个都不读** —— 所以这里也不声明，免得被顺手拿来渲染。
 */
interface HostState {
  /** 宿主协议版本；与 bundle 内联值不一致 = 宿主半边没重启。 */
  protocol?: number
  library: { root: string; skillCount: number }
  customizableSections: string[]
  categories: HostCategory[]
  /** 只看可用性，**没有密钥**（密钥是 secret 字段，不回传浏览器）。 */
  retrieval: { configured: boolean; source: 'settings' | 'env' | 'none'; envVar: string }
}

/** 设置页的三个 Tab。 */
type SettingsTab = 'local' | 'community' | 'retrieval'

/* ════════════════════════════════════════════════════════════════════════
 * 数据加载（**纯函数**，与 React 无关，因此可离线测试）
 *
 * ⚠️ 这里是踩过坑的地方：`connection.rpc.call()` 在传输失败时**是抛异常**，
 * 不是返回 `{ ok: false }`（见 `dsh-client-connection` 的 `createWebConnectionRpc`：
 * HTTP 非 2xx 直接 `throw`，rpcId 不匹配也 `throw`）。
 * 早期实现只判断 `res.ok`，于是异常把 async effect 打断，`loading` 永远停在 true ——
 * 界面表现为"正在读取研究方法库…"之后一片空白，且**没有任何错误信息**。
 *
 * 所以：加载结果必须是**可穷举的**三态，任何异常都要变成一条可显示的 message。
 * ════════════════════════════════════════════════════════════════════════ */

export type SettingsLoad =
  | { kind: 'ok'; state: HostState }
  | { kind: 'error'; message: string }

/** 状态读取的超时（毫秒）。挂起的请求也必须变成一条可见的错误，而不是空白页。 */
export const SETTINGS_LOAD_TIMEOUT_MS = 15000

/**
 * 默认传输：浏览器同源 `fetch` 到宿主注册的前缀路由。
 *
 * 始终带上凭据（同源下即 cookie），这样 Harness 的鉴权栅栏能认出这个请求。
 */
export const fetchSettingsSend: SettingsSend = async (endpoint, payload, signal) => {
  const res = await fetch(`${SETTINGS_ROUTE_PREFIX}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload }),
    ...(signal === undefined ? {} : { signal }),
  })
  if (!res.ok) {
    // 传输层问题（404 = 路由没挂上；401/403 = 信任栅栏拒绝；405 = 落到了 fallback）
    throw new Error(`HTTP ${res.status}`)
  }
  return (await res.json()) as RpcResult
}

/**
 * 从宿主读取整页状态；**永不抛异常**（异常会变成 `{ kind: 'error' }`）。
 *
 * @param send 传输实现（缺省 {@link fetchSettingsSend}）
 * @param options.timeoutMs 超时（测试用；缺省 {@link SETTINGS_LOAD_TIMEOUT_MS}）
 */
export async function loadSettingsState(
  send: SettingsSend = fetchSettingsSend,
  options: { timeoutMs?: number } = {},
): Promise<SettingsLoad> {
  if (typeof send !== 'function') {
    return { kind: 'error', message: '设置页缺少传输实现。' }
  }
  const timeoutMs = options.timeoutMs ?? SETTINGS_LOAD_TIMEOUT_MS
  const ac = new AbortController()
  // ⚠️ 只 `abort()` 是不够的：abort 依赖于传输层**真的**尊重 signal。
  // 所以这里同时 **race** 一个超时 promise —— 即使底层请求永不 settle，
  // 加载器也一定会返回，页面绝不会停在"正在读取研究方法库…"。
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      ac.abort()
      reject(new Error(`timeout after ${timeoutMs}ms`))
    }, timeoutMs)
  })
  try {
    const res = await Promise.race([send('state', {}, ac.signal), timeout])
    if (!res || res.ok !== true) {
      return { kind: 'error', message: `设置服务返回失败：${res?.error?.message ?? '未知原因'}` }
    }
    const value = res.value as HostState | undefined
    if (!value || !Array.isArray(value.categories)) {
      return {
        kind: 'error',
        message: '设置服务返回的数据不完整，请重启 DSH 后重试。',
      }
    }
    return { kind: 'ok', state: value }
  } catch (e) {
    return {
      kind: 'error',
      message: timedOut
        ? `请求超时（${Math.round(timeoutMs / 1000)} 秒无响应）。` +
          `若反复出现，请查看 DSH 宿主日志中与 ${SETTINGS_ROUTE_PREFIX} 相关的记录。`
        : `无法连接设置服务：${e instanceof Error ? e.message : String(e)}\n` +
          `（路由 ${SETTINGS_ROUTE_PREFIX}/state。DSH 宿主日志会记录该路由的注册结果。）`,
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 样式（只用 DSH 主题令牌，自动适配明暗）
 * ════════════════════════════════════════════════════════════════════════ */

const S = {
  page: { display: 'flex', flexDirection: 'column', gap: 14 } as React.CSSProperties,
  hero: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    borderRadius: 14,
    border: '1px solid var(--dsw-alias-border-l1)',
    background:
      'linear-gradient(120deg, var(--dsw-alias-state-business-tertiary), var(--dsw-alias-bg-layer-1))',
  } as React.CSSProperties,
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    display: 'grid',
    placeItems: 'center',
    color: 'var(--dsw-alias-state-business-primary)',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    flex: '0 0 auto',
  } as React.CSSProperties,
  heroTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--dsw-alias-label-primary)',
    lineHeight: 1.3,
  } as React.CSSProperties,
  heroSub: {
    fontSize: 12,
    color: 'var(--dsw-alias-label-secondary)',
    marginTop: 2,
    lineHeight: 1.5,
  } as React.CSSProperties,
  tabs: {
    display: 'flex',
    gap: 3,
    padding: 3,
    borderRadius: 11,
    background: 'var(--dsw-alias-bg-layer-2)',
  } as React.CSSProperties,
  card: {
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 12,
    background: 'var(--dsw-alias-bg-layer-1)',
    overflow: 'hidden',
  } as React.CSSProperties,
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    fontSize: 12.5,
    fontWeight: 700,
    color: 'var(--dsw-alias-label-primary)',
  } as React.CSSProperties,
  cardBody: { padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 } as React.CSSProperties,
  list: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 10,
    overflow: 'hidden',
  } as React.CSSProperties,
  listRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    background: 'var(--dsw-alias-bg-layer-1)',
  } as React.CSSProperties,
  listTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' } as React.CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 200px', minWidth: 0 } as React.CSSProperties,
  label: { fontSize: 11.5, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' } as React.CSSProperties,
  hint: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.5 } as React.CSSProperties,
  select: {
    appearance: 'none',
    width: '100%',
    padding: '7px 28px 7px 10px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 12.5,
    fontWeight: 600,
    backgroundImage:
      'linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 15px) 52%, calc(100% - 10px) 52%',
    backgroundSize: '5px 5px, 5px 5px',
    backgroundRepeat: 'no-repeat',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 12.5,
    fontWeight: 600,
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    minHeight: 190,
    resize: 'vertical',
    padding: 11,
    borderRadius: 9,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 12.5,
    lineHeight: 1.65,
    fontFamily: 'var(--ds-font-family-code)',
  } as React.CSSProperties,
  base: {
    whiteSpace: 'pre-wrap',
    maxHeight: 190,
    overflow: 'auto',
    padding: 11,
    borderRadius: 9,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-3)',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 11.5,
    lineHeight: 1.6,
    fontFamily: 'var(--ds-font-family-code)',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  } as React.CSSProperties,
  primaryBtn: {
    padding: '6px 16px',
    borderRadius: 8,
    border: '1px solid transparent',
    background: 'var(--dsw-alias-button-primary-fill)',
    color: '#fff',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  ghostBtn: {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  mono: { fontFamily: 'var(--ds-font-family-code)', fontSize: 11 } as React.CSSProperties,
}

function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'success' | 'warn' | 'error'
  children: React.ReactNode
}): JSX.Element {
  const tones: Record<string, { fg: string; bg: string }> = {
    neutral: { fg: 'var(--dsw-alias-label-secondary)', bg: 'var(--dsw-alias-bg-layer-3)' },
    brand: { fg: 'var(--dsw-alias-state-business-primary)', bg: 'var(--dsw-alias-state-business-tertiary)' },
    success: { fg: 'var(--dsw-alias-state-success-primary)', bg: 'var(--dsw-alias-state-success-tertiary)' },
    warn: { fg: 'var(--dsw-alias-state-warn-primary)', bg: 'var(--dsw-alias-state-warn-tertiary)' },
    error: { fg: 'var(--dsw-alias-state-error-primary)', bg: 'var(--dsw-alias-bg-layer-3)' },
  }
  const c = tones[tone] ?? tones.neutral
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 18,
        padding: '0 8px',
        borderRadius: 9,
        fontSize: 10.5,
        fontWeight: 600,
        color: c.fg,
        background: c.bg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 9,
        border: '1px solid transparent',
        background: active ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
        color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,.14)' : 'none',
        transition: 'background var(--ds-transition-duration) var(--ds-ease-in-out)',
      }}
    >
      {children}
    </button>
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * 设置页
 * ════════════════════════════════════════════════════════════════════════ */

export function ConvFusionProjectSettings({
  scope,
  send = fetchSettingsSend,
}: ConvFusionSettingsProps): JSX.Element {
  const [state, setState] = React.useState<HostState | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<SettingsTab>('local')
  const [staleHost, setStaleHost] = React.useState(false)

  const [categoryId, setCategoryId] = React.useState<string>('')
  const [skillId, setSkillId] = React.useState<string>('')
  const [section, setSection] = React.useState<string>('')
  const [draft, setDraft] = React.useState<string>('')
  const [saving, setSaving] = React.useState(false)
  const [notice, setNotice] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  // settings scope 只用来判断"这个环境能不能持久化设置"（非 loopback 时为 memory），
  // 用来显示一个只读徽章；定制文件本身的路径不在界面上出现。
  const scopeSnap = React.useSyncExternalStore(
    (cb) => scope.subscribe(cb),
    () => scope.getSnapshot(),
    () => scope.getSnapshot(),
  )

  // ── 定制文件的落盘位置对用户不可见 ──────────────────────────────────
  //
  // 「用户定制保存为文件、设置文档只记文件名」是**内部实现**：它保证 settings.yaml
  // 不会因定制内容变多而膨胀。用户不需要知道文件名，更不该看到"尚未创建"这种状态
  // —— 那只是"还没定制过"而已。因此这里不做任何 UI 暴露，也**不读取** scope 值。
  // 路径仍由 `src/config.ts` 管理（可通过 profile patch / 设置文档调整）。

  /**
   * 调一个端点并把结果落到组件状态。
   *
   * 分包 `loadSettingsState` 之外还用 try/catch 兜底：`rpc.call` 在传输层失败时
   * **会抛**，而这里是 React 事件处理器/effect，抛出会变成静默的 unhandled rejection。
   */
  const call = React.useCallback(
    async (endpoint: string, payload: unknown): Promise<HostState | null> => {
      try {
        if (endpoint === 'state') {
          const outcome = await loadSettingsState(send)
          if (outcome.kind === 'error') {
            setError(outcome.message)
            return null
          }
          setError(null)
          setState(outcome.state)
          // 宿主是旧的（改了 lib/ 但没重启 DSH）→ 页面数据可能是旧代码算的。
          // 这种情况刷新页面**没有用**，必须重启 DSH —— 直接说出来，别让人再猜一次。
          setStaleHost(outcome.state.protocol !== __HOST_PROTOCOL__)
          return outcome.state
        }
        const res = await send(endpoint, payload)
        if (!res || res.ok !== true) {
          setError(`设置服务返回失败：${res?.error?.message ?? '未知原因'}`)
          return null
        }
        setError(null)
        const next = res.value as HostState
        setState(next)
        return next
      } catch (e) {
        setError(`调用 ${endpoint} 失败：${e instanceof Error ? e.message : String(e)}`)
        return null
      }
    },
    [send],
  )

  /** 首次加载（含"重新读取"）：无论成功失败都必须结束 loading。 */
  const reload = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const next = await call('state', {})
      if (next?.categories?.length) {
        const first = next.categories[0]
        setCategoryId(first.categoryId)
        const firstSkill = first.skills[0]
        if (firstSkill) {
          setSkillId(firstSkill.skillId)
          setSection(firstSkill.sections[0]?.section ?? '')
        }
      }
    } finally {
      // `finally` 是重点：早期实现在 await 之后才 setLoading(false)，
      // 一次异常就让页面永远停在"正在读取研究方法库…"。
      setLoading(false)
    }
  }, [call])

  React.useEffect(() => {
    let alive = true
    void (async () => {
      await reload()
      if (!alive) return
    })()
    return () => {
      alive = false
    }
  }, [reload])

  const category = state?.categories.find((c) => c.categoryId === categoryId) ?? null
  const skill = category?.skills.find((s) => s.skillId === skillId) ?? null
  const point = skill?.sections.find((s) => s.section === section) ?? null

  // 切换能力类别 → 自动选中第一项能力；切换能力 → 自动选中第一个可定制章节
  const onCategory = (id: string): void => {
    setCategoryId(id)
    setNotice(null)
    const cat = state?.categories.find((c) => c.categoryId === id)
    const s0 = cat?.skills[0]
    setSkillId(s0?.skillId ?? '')
    setSection(s0?.sections[0]?.section ?? '')
  }
  const onSkill = (id: string): void => {
    setSkillId(id)
    setNotice(null)
    const s0 = category?.skills.find((s) => s.skillId === id)
    setSection(s0?.sections[0]?.section ?? '')
  }
  const onSection = (name: string): void => {
    setSection(name)
    setNotice(null)
  }

  // 选中项变化 → 草稿跟随（未定制 → 空草稿，占位符提示"留空 = 用系统原文"）
  React.useEffect(() => {
    setDraft(point?.userText ?? '')
  }, [skillId, section, point?.userText])

  const dirty = point !== null && draft !== (point.userText ?? '')

  const save = async (): Promise<void> => {
    if (!skill || !point) return
    setSaving(true)
    const next = await call('customization/save', {
      skillId: skill.skillId,
      section: point.section,
      text: draft,
    })
    setSaving(false)
    if (next) setNotice({ tone: 'success', text: draft.trim() ? '已保存' : '已恢复系统原文' })
  }

  const reset = async (): Promise<void> => {
    if (!skill || !point) return
    if (!window.confirm(`恢复「${point.section}」的系统原文？你的定制会被删除。`)) return
    setSaving(true)
    const next = await call('customization/reset', { skillId: skill.skillId, section: point.section })
    setSaving(false)
    if (next) {
      setDraft('')
      setNotice({ tone: 'success', text: '已恢复系统原文' })
    }
  }

  const resetSkill = async (): Promise<void> => {
    if (!skill) return
    if (!window.confirm(`恢复「${skill.skillName}」的全部章节？该能力的定制会被删除。`)) return
    setSaving(true)
    const next = await call('customization/resetSkill', { skillId: skill.skillId })
    setSaving(false)
    if (next) setNotice({ tone: 'success', text: `已恢复「${skill.skillName}」` })
  }

  const totalOverridden = state ? state.categories.reduce((n, c) => n + c.overriddenCount, 0) : 0
  const totalPoints = state ? state.categories.reduce((n, c) => n + c.pointCount, 0) : 0

  return (
    <div style={S.page}>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div style={S.hero}>
        <div style={S.heroIcon}>
          <ConvFusionMark size={24} />
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={S.heroTitle}>ConvFusion</div>
          <div style={S.heroSub}>定制各项能力，形成你自己的研究方法</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {totalOverridden > 0 ? (
            <Badge tone="brand">已定制 {totalOverridden} 项</Badge>
          ) : (
            <Badge tone="neutral">全部使用系统原文</Badge>
          )}
          {scopeSnap.status === 'unavailable' ? <Badge tone="warn">设置只读</Badge> : null}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div style={S.tabs}>
        <TabButton active={tab === 'local'} onClick={() => setTab('local')}>
          ⚙ 本地设置
        </TabButton>
        <TabButton active={tab === 'community'} onClick={() => setTab('community')}>
          ◈ 研究方法库
          <span style={{ ...S.hint, marginLeft: 6 }}>即将开放</span>
        </TabButton>
        <TabButton active={tab === 'retrieval'} onClick={() => setTab('retrieval')}>
          ⌕ 检索源
          {state && !state.retrieval.configured ? (
            <span style={{ ...S.hint, marginLeft: 6 }}>未配置</span>
          ) : null}
        </TabButton>
      </div>

      {staleHost ? (
        <div style={S.card}>
          <div style={S.cardHead}>
            宿主侧需要重启
            <span style={{ flex: '1 1 auto' }} />
            <Badge tone="warn">需重启</Badge>
          </div>
          <div style={S.cardBody}>
            <div style={{ ...S.hint, lineHeight: 1.7 }}>
              宿主侧仍在运行旧代码，下面的内容可能不是最新的。
              <br />
              刷新页面不会生效（宿主模块在 DSH 启动时载入内存）。请重启 DSH 后再打开本页。
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={S.card}>
          <div style={S.cardHead}>
            加载失败
            <span style={{ flex: '1 1 auto' }} />
            <Badge tone="error">错误</Badge>
          </div>
          <div style={S.cardBody}>
            <div
              style={{
                color: 'var(--dsw-alias-state-error-primary)',
                fontSize: 12.5,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
              }}
            >
              {error}
            </div>
            <div style={S.footer}>
              <button type="button" style={S.ghostBtn} onClick={() => void reload()}>
                重试
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading && !state ? (
        <div style={S.card}>
          <div style={S.cardBody}>
            <div style={S.hint}>正在加载…</div>
          </div>
        </div>
      ) : null}

      {/* ── Tab 2：研究方法库（社区，**尚未开放**）──────────────────── */}
      {tab === 'community' ? <CommunityTab /> : null}

      {/* ── Tab 3：检索源（OpenAlex API Key）──────────────────────── */}
      {tab === 'retrieval' ? (
        <RetrievalTab
          configured={state?.retrieval.configured ?? false}
          source={state?.retrieval.source ?? 'none'}
          envVar={state?.retrieval.envVar ?? 'OPENALEX_API_KEY'}
          scope={scope}
          onNotice={setNotice}
        />
      ) : null}

      {state && tab === 'local' ? (
        <>
          {/* ── 选择区（能力类别 → 能力 → 章节）──────────────────── */}
          <div style={S.card}>
            <div style={S.cardHead}>
              能力库
              <span style={{ flex: '1 1 auto' }} />
              <span style={{ ...S.hint, fontWeight: 400 }}>
                共 {totalPoints} 项 · 已定制 {totalOverridden}
              </span>
            </div>
            <div style={S.cardBody}>
              <div style={S.row}>
                <div style={S.field}>
                  <div style={S.label}>① 能力类别</div>
                  <select style={S.select} value={categoryId} onChange={(e) => onCategory(e.target.value)}>
                    {state.categories.map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.categoryName}（{c.skills.length}）
                        {c.overriddenCount > 0 ? ` · 已定制 ${c.overriddenCount}` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={S.hint}>
                    {category ? `${category.skills.length} 项能力` : '该类别下暂无可定制能力'}
                  </div>
                </div>
                <div style={S.field}>
                  <div style={S.label}>② 能力</div>
                  <select style={S.select} value={skillId} onChange={(e) => onSkill(e.target.value)}>
                    {category?.skills.map((s) => (
                      <option key={s.skillId} value={s.skillId}>
                        {s.skillName}
                        {s.overriddenCount > 0 ? ` · 已定制 ${s.overriddenCount}` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={S.hint}>{skill ? `${skill.sections.length} 个章节` : ''}</div>
                </div>
                <div style={S.field}>
                  <div style={S.label}>③ 可定制章节</div>
                  <select style={S.select} value={section} onChange={(e) => onSection(e.target.value)}>
                    {skill?.sections.map((s) => (
                      <option key={s.section} value={s.section}>
                        {s.section}
                        {s.overridden ? ' · 已定制' : ''}
                      </option>
                    ))}
                  </select>
                  <div style={S.hint}>留空则使用系统原文</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 编辑器 ───────────────────────────────────────────── */}
          {skill && point ? (
            <div style={S.card}>
              <div style={S.cardHead}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {skill.skillName} · {point.section}
                </span>
                <span style={{ flex: '1 1 auto' }} />
                {point.overridden ? <Badge tone="brand">已定制</Badge> : <Badge tone="neutral">系统原文</Badge>}
              </div>
              <div style={S.cardBody}>
                <div style={S.hint}>
                  {category?.categoryName} · {skill.skillName} · {point.section}
                </div>
                <div style={S.label}>你的额外要求</div>
                <textarea
                  style={S.textarea}
                  spellCheck={false}
                  value={draft}
                  placeholder={'留空则使用系统原文。\n例如：评估研究想法时，优先考虑能否用现有设备完成表征。'}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <details>
                  <summary style={{ ...S.label, cursor: 'pointer' }}>系统原文（{point.base.length} 字）</summary>
                  <div style={{ ...S.base, marginTop: 8 }}>{point.base}</div>
                </details>
                <div style={S.footer}>
                  {notice ? (
                    <span
                      style={{
                        marginRight: 'auto',
                        fontSize: 12,
                        color:
                          notice.tone === 'success'
                            ? 'var(--dsw-alias-state-success-primary)'
                            : 'var(--dsw-alias-state-error-primary)',
                      }}
                    >
                      {notice.text}
                    </span>
                  ) : (
                    <span style={{ ...S.hint, marginRight: 'auto' }}>{draft.length} 字</span>
                  )}
                  <button
                    type="button"
                    style={{ ...S.ghostBtn, opacity: point.overridden && !saving ? 1 : 0.55 }}
                    disabled={!point.overridden || saving}
                    onClick={() => void reset()}
                  >
                    恢复该章节
                  </button>
                  <button
                    type="button"
                    style={{ ...S.ghostBtn, opacity: skill.overriddenCount > 0 && !saving ? 1 : 0.55 }}
                    disabled={skill.overriddenCount === 0 || saving}
                    onClick={() => void resetSkill()}
                  >
                    恢复该能力
                  </button>
                  <button
                    type="button"
                    style={{ ...S.primaryBtn, opacity: dirty && !saving ? 1 : 0.55 }}
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                  >
                    {saving ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/**
 * 「研究方法库」的**演示数据**。
 *
 * ⚠️ 这不是真实数据，界面上必须带「演示数据」徽章（`ConvFusion_setting.md` §1.3 原则 4：
 * 服务未开通时明确标注演示数据，不用假成功欺骗用户）。服务端接通后整块替换。
 */
const COMMUNITY_DEMO_METHODS: ReadonlyArray<{
  name: string
  discipline: string
  count: number
  author: string
}> = [
  { name: '实验验证导向', discipline: '材料科学', count: 47, author: 'convfusion 官方' },
  { name: '理论建构导向', discipline: '社会科学', count: 39, author: 'ss_theory' },
  { name: '应用与可复现导向', discipline: '机器学习', count: 47, author: 'convfusion 官方' },
  { name: '临床相关性导向', discipline: '生物医学', count: 41, author: 'bm_researcher' },
]

/* ════════════════════════════════════════════════════════════════════════
 * Tab 2 — 研究方法库（社区，尚未开放）
 *
 * ⚠️ **不假装联网**（`ConvFusion_setting.md` §1.3 原则 4）：服务端未开通时，
 * 演示数据必须**明确标注**，且不能有假成功。
 *
 * 因此这里：列表带「演示数据」徽章 + 脚注说明；「套用」与「登录」都是禁用态；
 * 不发任何网络请求。服务接通后，整块替换为真实数据即可。
 * ════════════════════════════════════════════════════════════════════════ */

function CommunityTab(): JSX.Element {
  return (
    <>
      <div style={S.card}>
        <div style={S.cardHead}>
          研究方法库
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone="warn">尚未开放</Badge>
        </div>
        <div style={S.cardBody}>
          <div style={S.hint}>
            汇集其他研究者分享的研究方法，可直接套用，也可在此基础上继续定制。
          </div>
          <div style={S.row}>
            <div style={S.field}>
              <div style={S.label}>社区开放方法</div>
              <div style={S.hint}>免费，登录后可浏览与套用</div>
            </div>
            <div style={S.field}>
              <div style={S.label}>作者分享的方法库</div>
              <div style={S.hint}>由作者提供，可含付费内容。本期不实现</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={S.label}>开放方法</div>
            <span style={{ flex: '1 1 auto' }} />
            {/* 服务未开通：列表内容必须带上"演示数据"，不能让它看起来像真的 */}
            <Badge tone="neutral">演示数据</Badge>
          </div>
          <div style={S.list}>
            {COMMUNITY_DEMO_METHODS.map((m, i) => (
              <div
                key={m.name}
                style={i === 0 ? S.listRow : { ...S.listRow, borderTop: '1px solid var(--dsw-alias-border-l1)' }}
              >
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div style={S.listTitle}>{m.name}</div>
                  <div style={S.hint}>
                    {m.discipline} · {m.count} 项能力 · {m.author}
                  </div>
                </div>
                <button type="button" style={{ ...S.ghostBtn, opacity: 0.55 }} disabled>
                  套用
                </button>
              </div>
            ))}
          </div>
          <div style={S.hint}>以上为界面演示，服务尚未开通，暂不可套用。</div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardBody}>
          <div style={{ ...S.label, color: 'var(--dsw-alias-label-primary)' }}>
            登录 ConvFusion.com 可获得更多研究方法
          </div>
          <div style={S.hint}>
            登录后还可将你在「本地设置」里定制好的研究方法发布给其他研究者。
          </div>
          <div style={S.footer}>
            <button type="button" style={{ ...S.primaryBtn, opacity: 0.55 }} disabled>
              登录 ConvFusion.com
            </button>
            <span style={S.hint}>服务尚未开通</span>
          </div>
        </div>
      </div>
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * Tab 3 — 检索源（OpenAlex API Key）
 *
 * 密钥是 `role('secret')` 字段：**明文从不经过浏览器**。
 * 这里只拿 `configured / source` 两个布尔级信息，写入走 settings scope。
 * ════════════════════════════════════════════════════════════════════════ */

function RetrievalTab({
  configured,
  source,
  envVar,
  scope,
  onNotice,
}: {
  configured: boolean
  source: 'settings' | 'env' | 'none'
  envVar: string
  scope: SettingsScopeLike
  onNotice: (n: { tone: 'success' | 'error'; text: string } | null) => void
}): JSX.Element {
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const save = async (): Promise<void> => {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await scope.set('openalexApiKey', draft.trim())
      setDraft('') // 明文不留在界面状态里
      onNotice({ tone: 'success', text: '已保存 OpenAlex API Key' })
    } catch (e) {
      onNotice({ tone: 'error', text: `保存失败：${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      await scope.unset('openalexApiKey')
      setDraft('')
      onNotice({ tone: 'success', text: '已清除 OpenAlex API Key' })
    } catch (e) {
      onNotice({ tone: 'error', text: `清除失败：${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        ⌕ 检索源
        <span style={{ flex: '1 1 auto' }} />
        {configured ? <Badge tone="success">已配置</Badge> : <Badge tone="warn">未配置</Badge>}
      </div>
      <div style={S.cardBody}>
        <div style={S.hint}>
          文献检索使用 OpenAlex。请前往{' '}
          <span style={S.mono}>openalex.org</span> 免费注册并复制 API Key。
        </div>

        <div style={S.field}>
          <div style={S.label}>OpenAlex API Key</div>
          <input
            style={S.input}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            placeholder={configured ? '已设置，输入新值可覆盖' : '粘贴 API Key'}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div style={S.hint}>
            留空则不修改。密钥仅保存在本机，不会发送到浏览器。
            {source === 'env' ? ` 当前使用环境变量 ${envVar}。` : ''}
          </div>
        </div>

        <div style={S.footer}>
          {source === 'settings' ? (
            <button
              type="button"
              style={{ ...S.ghostBtn, opacity: busy ? 0.55 : 1 }}
              disabled={busy}
              onClick={() => void clear()}
            >
              清除
            </button>
          ) : null}
          <button
            type="button"
            style={{ ...S.primaryBtn, opacity: draft.trim() && !busy ? 1 : 0.55 }}
            disabled={!draft.trim() || busy}
            onClick={() => void save()}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConvFusionProjectSettings
