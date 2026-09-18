/**
 * ConvFusion 2.0 — 设置页本体（【设置】-【ConvFusion】-【本地研究方法】）
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
  /** 唯一编号（`CxxPyy`）。 */
  code?: string
  /** 中文名。 */
  label?: string
  sections: HostSection[]
  overriddenCount: number
}
interface HostCategory {
  categoryId: string
  categoryName: string
  /** 类别编号（`C01`–`C09`，按研究过程排序）。 */
  code?: string
  /** 类别中文名。 */
  label?: string
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
  /** 【ConvFusion.com】的登录状态（服务器地址 + 有无凭据 + 已验证账号）。**不含凭据。** */
  account?: HostAccountState
  /** 本地外部依赖（tectonic）——【系统设置】页的"配置检查"。 */
  dependencies?: {
    tectonic: HostDependency
  }
}

/**
 * 服务器上的账号（宿主 `AccountWire` 的镜像）。**没有任何凭据字段。**
 *
 * ConvFusion.com 没有口令登录：账号是邀请制，凭据是一份 `cf_live_…` API Key，
 * 它**只存在于宿主**。浏览器这一侧从头到尾拿不到明文。
 */
interface HostAccount {
  id: string
  email: string
  displayName: string
  status: string
  roles: string[]
}

/** 【ConvFusion.com】的登录状态（宿主 `AccountState` 的镜像）。 */
interface HostAccountState {
  serverUrl: string
  defaultServerUrl: string
  serverUrlSource: 'settings' | 'env' | 'config' | 'default'
  /**
   * 当前环境（开发 / 生产）。
   *
   * ⚠️ **地址随环境而变**（开发 = 本机服务器，生产 = 线上）。界面必须把这件事说出来：
   * "在我电脑上登录成功"与"线上能用"是两件事，混在一起会得出错误结论。
   */
  environment?: 'development' | 'production'
  /** 地址与环境矛盾（生产却指向本机 / 开发却指向线上）。 */
  serverUrlMismatch?: boolean
  keyConfigured: boolean
  keySource: 'settings' | 'env' | 'none'
  apiKeyEnvVar: string
  /** 只有在**联网验证过**之后才非空。 */
  account: HostAccount | null
  /**
   * Token 余额（联网验证过才有）。
   *
   * 宿主是**尽力而为**地取它：拿不到就是 null（界面不显示数字，而不是显示 0）。
   */
  tokens?: { available: number; frozen: number; total: number } | null
}

/** 一个本地外部依赖的检测结果（与 host 的 LocalDependencyStatus 对应）。 */
interface HostDependency {
  name: string
  available: boolean
  path?: string
  version?: string
  viaEnv: boolean
  envVar: string
  purpose: string
}

/** 设置页的三个 Tab。 */
type SettingsTab = 'local' | 'community' | 'retrieval'

/* ════════════════════════════════════════════════════════════════════════
 * 自动选中的优先级（纯函数，可离线验证）
 *
 * ⚠️ 真实反馈：选了 C08P05 后界面默认停在第一个章节（无定制），输入框空着，
 * 用户误以为"我的定制没加载"。这个页的价值是让你**看到/编辑自己的定制**，
 * 所以自动选中一律**优先落到已有定制的项**（没有才落第一个）。
 * ════════════════════════════════════════════════════════════════════════ */

/** 能力下优先选已有定制的章节；都没有定制 → 第一个。 */
export function preferredSection(sections: HostSection[] | undefined): string {
  if (!sections?.length) return ''
  return (sections.find((s) => s.overridden) ?? sections[0])?.section ?? ''
}

/** 类别下优先选已有定制的能力；都没有定制 → 第一个。 */
export function preferredSkill(skills: HostSkill[] | undefined): HostSkill | undefined {
  if (!skills?.length) return undefined
  return skills.find((s) => s.overriddenCount > 0) ?? skills[0]
}

/** 类别列表里优先选已有定制的类别；都没有定制 → 第一个。 */
export function preferredCategory(categories: HostCategory[] | undefined): HostCategory | undefined {
  if (!categories?.length) return undefined
  return categories.find((c) => c.overriddenCount > 0) ?? categories[0]
}

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
  /** 紧凑的一行（登录输入 / 账号信息 / 失败提示共用）：靠 flexWrap 自适应窄宽度。 */
  inlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  } as React.CSSProperties,
  /** 行内输入框：不占满整行（`S.input` 是 100% 宽，这里要压扁）。 */
  compactInput: {
    width: 'auto',
    flex: '1 1 150px',
    minWidth: 110,
    padding: '5px 9px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 12,
  } as React.CSSProperties,
  /** Token 余额徽章：既是数字也是按钮（点了刷新）。 */
  tokenBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 20,
    padding: '0 9px',
    borderRadius: 10,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-state-business-primary)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  /** 已登录时的账号名。 */
  accountName: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--dsw-alias-label-primary)',
  } as React.CSSProperties,
  /** 卡片内部的**小** Tab（账号 / 服务器设置）：比页面级 Tab 更轻。 */
  miniTabs: {
    display: 'inline-flex',
    gap: 2,
    padding: 2,
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-2)',
    alignSelf: 'flex-start',
  } as React.CSSProperties,
  /** 次要入口（"使用邀请码注册"）：看起来是链接，不抢主按钮的注意力。 */
  linkBtn: {
    padding: '2px 4px',
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-state-business-primary)',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
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

/**
 * 卡片内部的紧凑 Tab。
 *
 * 与页面级 `TabButton` 的区别只有尺寸与层级：它属于**一张卡片内部**的视图切换
 * （账号 / 服务器设置），不该和页面级 Tab 抢视觉重量。
 */
function MiniTab({
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
        padding: '3px 10px',
        borderRadius: 6,
        border: '1px solid transparent',
        background: active ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
        color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
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
        // 首次打开也落到"已有定制"的类别/能力/章节（preferred* 没有定制时 = 第一个）
        const first = preferredCategory(next.categories)
        const firstSkill = preferredSkill(first?.skills)
        if (first && firstSkill) {
          setCategoryId(first.categoryId)
          setSkillId(firstSkill.skillId)
          setSection(preferredSection(firstSkill.sections))
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

  /**
   * 重新探测本地外部依赖（【系统设置】的"重新检查"）。
   *
   * ⚠️ 不能走 {@link call}：`call` 会把返回值当作**整页 HostState** 覆盖进 state，
   * 而 `dependencies/check` 只返回依赖报告。这里就地合并那一个字段。
   */
  const recheckDependencies = React.useCallback(async (): Promise<HostDependency | null> => {
    try {
      const res = await send('dependencies/check', {})
      if (!res || res.ok !== true) return null
      const report = res.value as { tectonic?: HostDependency }
      const tectonic = report?.tectonic
      if (!tectonic) return null
      setState((prev) => (prev ? { ...prev, dependencies: { tectonic } } : prev))
      return tectonic
    } catch {
      return null
    }
  }, [send])

  const category = state?.categories.find((c) => c.categoryId === categoryId) ?? null
  const skill = category?.skills.find((s) => s.skillId === skillId) ?? null
  const point = skill?.sections.find((s) => s.section === section) ?? null

  // 切换能力类别 → 自动选中第一项能力；切换能力 → 自动选中第一个可定制章节
  const onCategory = (id: string): void => {
    setCategoryId(id)
    setNotice(null)
    const cat = state?.categories.find((c) => c.categoryId === id)
    const s0 = preferredSkill(cat?.skills)
    setSkillId(s0?.skillId ?? '')
    setSection(preferredSection(s0?.sections))
  }
  const onSkill = (id: string): void => {
    setSkillId(id)
    setNotice(null)
    const s0 = category?.skills.find((s) => s.skillId === id)
    setSection(preferredSection(s0?.sections))
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
          ⚙ 本地研究方法
        </TabButton>
        <TabButton active={tab === 'community'} onClick={() => setTab('community')}>
          ◈ ConvFusion.com
        </TabButton>
        <TabButton active={tab === 'retrieval'} onClick={() => setTab('retrieval')}>
          ⚙ 系统设置
          {state && (!state.retrieval.configured || state.dependencies?.tectonic.available === false) ? (
            <span style={{ ...S.hint, marginLeft: 6 }}>待配置</span>
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

      {/* ── Tab 2：ConvFusion.com（账号 + 服务器 + 研究工作）────────── */}
      {tab === 'community' ? <CommunityTab send={send} initial={state?.account ?? null} /> : null}

      {/* ── Tab 3：系统设置（OpenAlex 凭据 + 本地依赖检查）──────────── */}
      {tab === 'retrieval' ? (
        <SystemTab
          configured={state?.retrieval.configured ?? false}
          source={state?.retrieval.source ?? 'none'}
          envVar={state?.retrieval.envVar ?? 'OPENALEX_API_KEY'}
          tectonic={state?.dependencies?.tectonic ?? null}
          onRecheck={recheckDependencies}
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
              {/* 与 ConvFusion.com 的边界：方法留在本机，不随研究进展上传 */}
              <Badge tone="neutral">仅本机</Badge>
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
                        {c.code ? `${c.code} ` : ''}
                        {c.label ?? c.categoryName}（{c.skills.length}）
                        {c.overriddenCount > 0 ? ` · 已定制 ${c.overriddenCount}` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={S.hint}>
                    {category ? `${category.skills.length} 项能力 · 类别按研究过程排序` : '该类别下暂无可定制能力'}
                  </div>
                </div>
                <div style={S.field}>
                  <div style={S.label}>② 能力</div>
                  <select style={S.select} value={skillId} onChange={(e) => onSkill(e.target.value)}>
                    {category?.skills.map((s) => (
                      <option key={s.skillId} value={s.skillId}>
                        {s.code ? `${s.code} · ` : ''}
                        {s.label ?? s.skillName}
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
                  {skill.code ? `${skill.code} · ` : ''}
                  {skill.label ?? skill.skillName} · {point.section}
                </span>
                <span style={{ flex: '1 1 auto' }} />
                {point.overridden ? <Badge tone="brand">已定制</Badge> : <Badge tone="neutral">系统原文</Badge>}
              </div>
              <div style={S.cardBody}>
                <div style={S.hint}>
                  {category?.code ? `${category.code} ` : ''}
                  {category?.label ?? category?.categoryName} · {skill.label ?? skill.skillName} · {point.section}
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

/* ════════════════════════════════════════════════════════════════════════
 * Tab 2 — ConvFusion.com（社区 / 商业功能入口）
 *
 * ## 不只是"研究方法库"
 *
 * 这一页挂的是 **ConvFusion.com 的网络能力**：账号、连哪台服务器、以及网络上的
 * **研究工作**（Research Project）。服务器分享的对象是研究项目，不是"研究方法模板"，
 * 所以页签与卡片都叫 ConvFusion.com（2026-09 用户拍板）。
 *
 * ## 版式（2026-09 用户定稿）
 *
 * ```text
 * ┌ 用户信息区：账号（登录 / 已登录） │ 服务器设置      ← 内部 Tabs
 * ├────────────────────────────────────────────────────
 * └ 研究工作：未登录 → 示例列表（不可操作）；登录 → 真实列表 + 操作按钮
 * ```
 *
 * ⚠️ 上一版把「① API Key 登录」「② 邀请码注册」做成两张各占一大片的卡片，
 * 进来先看到两个大表单 —— 已按反馈压成**一张小卡片**：登录是一条输入行，
 * 邀请码注册折叠为次要入口，服务器设置收进第二个内部 Tab。
 *
 * ## 三条不变量（改这个组件前先读）
 *
 * 1. **凭据不进浏览器**：Key 只往宿主发一次，宿主保存到本机设置；组件不缓存（用完即清）。
 * 2. **不发跨域请求**：全部经同源 `/dsh-convfusion/*`，由宿主代发（服务器未开 CORS）。
 * 3. **不假装成功**：示例列表必须标注"示例数据"且不可交互；真实数据与失败原因原样显示。
 * ════════════════════════════════════════════════════════════════════════ */

/** 角色 / 状态的中文名（服务器返回的是枚举，界面要说人话）。 */
const ROLE_LABELS: Record<string, string> = {
  RESEARCHER: '研究者',
  MENTOR: '导师',
  ADMIN: '管理员',
}
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '正常',
  SUSPENDED: '已停用',
  DEACTIVATED: '已注销',
}
/** 研究阶段（服务器 `ResearchStage`）。 */
const STAGE_LABELS: Record<string, string> = {
  IDEA: '想法',
  LITERATURE: '文献',
  HYPOTHESIS: '假设',
  PLANNING: '规划',
  IMPLEMENTATION: '实现',
  EXPERIMENT: '实验',
  ANALYSIS: '分析',
  WRITING: '写作',
  COMPLETED: '完成',
}

function roleText(roles: string[]): string {
  if (!roles.length) return '—'
  return roles.map((r) => ROLE_LABELS[r] ?? r).join(' · ')
}

/** 一项研究工作的展示行（宿主 `WorkItem` 的镜像）。 */
interface HostWork {
  projectId: string
  title: string
  researchFields: string[]
  stage: string | null
  progress: number
  researchQuestion: string | null
  summary: string | null
  updatedAt: string
}

/** **本机**研究工作（宿主 `LocalWorkItem` 的镜像）—— 数据来自磁盘，不需要登录。 */
interface HostLocalWork {
  id: string
  title: string
  path: string
  researchRoot: string
  missingDir: boolean
  stage: string | null
  overall: number
  counts: Array<{ key: string; label: string; value: number; note?: string }>
  paper: boolean
  clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
  updatedAt: string
}

/** 简报（宿主 `WorkBrief` 的镜像）：第二层，非 owner 花 1 Token。 */
interface HostWorkBrief extends HostWork {
  motivation: string | null
  coreIdea: string | null
  hypothesis: string | null
  methodOverview: string | null
  keyEvidence: string[]
  openProblems: string[]
}

/**
 * **示例研究工作**（未登录时展示，标注"示例数据"、不可交互）。
 *
 * 为什么要有它：这一页是网络能力的入口，未登录时给一张空表等于什么也没说清。
 * 但它绝不能看起来像真的（`ConvFusion_setting.md` §1.3 原则 4）——
 * 因此带「示例数据」徽章、按钮全部禁用、并说明登录后才可操作。
 */
const SAMPLE_WORKS: ReadonlyArray<{
  title: string
  fields: string[]
  stage: string
  progress: number
  question: string
}> = [
  {
    title: '检索增强的长上下文推理',
    fields: ['自然语言处理'],
    stage: 'EXPERIMENT',
    progress: 0.5,
    question: '检索能否改善长上下文推理的准确率？',
  },
  {
    title: '机器人操作失败的视觉判定',
    fields: ['机器人学习', '多模态'],
    stage: 'ANALYSIS',
    progress: 0.7,
    question: '视觉语言模型能否可靠判定一次操作是否失败？',
  },
  {
    title: '视觉-激光跨模态定位',
    fields: ['多模态', '机器人'],
    stage: 'IMPLEMENTATION',
    progress: 0.4,
    question: '视觉与激光如何互补以提升定位精度？',
  },
]

/** 进度条（0–1）—— 一行一个，比数字更易扫读。 */
function ProgressBar({ value }: { value: number }): JSX.Element {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-block',
          width: 44,
          height: 4,
          borderRadius: 2,
          background: 'var(--dsw-alias-bg-layer-3)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${pct}%`,
            height: '100%',
            background: 'var(--dsw-alias-state-business-primary)',
          }}
        />
      </span>
      <span style={S.mono}>{pct}%</span>
    </span>
  )
}

/** 研究工作列表的一行（登录后可用；未登录时整行禁用）。 */
function WorkRow({
  title,
  fields,
  stage,
  progress,
  updatedAt,
  disabled,
  busy,
  expanded,
  onSummary,
  onBrief,
}: {
  title: string
  fields: string[]
  stage: string | null
  progress: number
  updatedAt?: string
  disabled: boolean
  busy: 'summary' | 'brief' | null
  expanded: boolean
  onSummary: () => void
  onBrief: () => void
}): JSX.Element {
  return (
    <div style={{ ...S.listRow, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={S.listTitle}>{title}</div>
        <div style={{ ...S.hint, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {fields.length ? <span>{fields.join(' · ')}</span> : null}
          {stage ? <span>{STAGE_LABELS[stage] ?? stage}</span> : null}
          <ProgressBar value={progress} />
          {updatedAt ? <span>{updatedAt.slice(0, 10)}</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
        <button
          type="button"
          style={{ ...S.ghostBtn, opacity: disabled || busy ? 0.55 : 1 }}
          disabled={disabled || busy !== null}
          onClick={onSummary}
        >
          {busy === 'summary' ? '读取中…' : expanded ? '收起' : '摘要'}
        </button>
        <button
          type="button"
          style={{ ...S.ghostBtn, opacity: disabled || busy ? 0.55 : 1 }}
          disabled={disabled || busy !== null}
          title={disabled ? '登录后可查看简报' : '简报消耗 1 Token，重试不会重复扣费'}
          onClick={onBrief}
        >
          {busy === 'brief' ? '读取中…' : '简报 · 1 Token'}
        </button>
      </div>
    </div>
  )
}

/** 展开区：显示摘要或简报内容（保持"一行一项"的紧凑感）。 */
function WorkDetail({ work, brief }: { work: HostWork; brief?: HostWorkBrief | undefined }): JSX.Element {
  const line = (label: string, value: string | null | undefined): JSX.Element | null =>
    value ? (
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ ...S.label, flex: '0 0 56px' }}>{label}</span>
        <span style={{ ...S.hint, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap' }}>{value}</span>
      </div>
    ) : null
  return (
    <div
      style={{
        margin: '0 12px 10px',
        padding: 10,
        borderRadius: 9,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {line('研究问题', brief ? brief.researchQuestion : work.researchQuestion)}
      {line('摘要', work.summary)}
      {brief ? (
        <>
          {line('动机', brief.motivation)}
          {line('核心想法', brief.coreIdea)}
          {line('假设', brief.hypothesis)}
          {line('方法概览', brief.methodOverview)}
          {brief.keyEvidence.length ? line('关键证据', brief.keyEvidence.join('；')) : null}
          {brief.openProblems.length ? line('待解问题', brief.openProblems.join('；')) : null}
        </>
      ) : null}
    </div>
  )
}

function CommunityTab({
  send,
  initial,
}: {
  send: SettingsSend
  initial: HostAccountState | null
}): JSX.Element {
  const [state, setState] = React.useState<HostAccountState | null>(initial)
  const [phase, setPhase] = React.useState<'loading' | 'ready'>('loading')
  const [busy, setBusy] = React.useState(false)
  /** 正在单独刷新 Token 余额。 */
  const [refreshingBalance, setRefreshingBalance] = React.useState(false)
  /** 最近一次账号类失败（登录 / 注册 / 验证）。宿主已经把它翻成可读中文。 */
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null)

  /** 用户信息区的内部 Tab：账号（登录 / 已登录）与服务器设置。 */
  const [userTab, setUserTab] = React.useState<'account' | 'server'>('account')
  const [serverDraft, setServerDraft] = React.useState(initial?.serverUrl ?? '')
  const [apiKey, setApiKey] = React.useState('')
  const [invite, setInvite] = React.useState({ code: '', email: '', displayName: '' })
  /**
   * 邀请码注册默认**折叠**。
   *
   * 两条入口地位本来就不对等：已有账号的人是多数，手上有邀请码的人是少数。
   * 之前两者各占一张大卡片，等于让多数人先看到一张用不上的表单。
   */
  const [inviteOpen, setInviteOpen] = React.useState(false)

  /* ── 研究工作：两个视图（我的 / 可指导）───────────────────────────── */
  /** 当前视图。「我的」在前：所有人都可能**被**指导，先看自己的。 */
  const [workTab, setWorkTab] = React.useState<'mine' | 'mentor'>('mine')
  /** 本机研究项目（不联网、不需要登录）。 */
  const [mine, setMine] = React.useState<HostLocalWork[] | null>(null)
  const [mineLoading, setMineLoading] = React.useState(false)
  /** 「我的」读不到时的原因（**绝不能**把它显示成"没有研究项目"）。 */
  const [mineError, setMineError] = React.useState<{ code: string; message: string } | null>(null)
  /** 工作区注册表是否可用（不可用 = 读不到，而不是没有）。 */
  const [mineRegistry, setMineRegistry] = React.useState<{ available: boolean; reason?: string } | null>(null)
  const [works, setWorks] = React.useState<HostWork[] | null>(null)
  const [worksLoading, setWorksLoading] = React.useState(false)
  const [worksError, setWorksError] = React.useState<{ code: string; message: string } | null>(null)
  /** 当前展开的那一项。 */
  const [open, setOpen] = React.useState<{ projectId: string; kind: 'summary' | 'brief' } | null>(null)
  const [detail, setDetail] = React.useState<{ projectId: string; work: HostWork; brief?: HostWorkBrief } | null>(
    null,
  )
  /** 正在读取的那一项：`{ projectId, kind }`。 */
  const [detailBusy, setDetailBusy] = React.useState<{ projectId: string; kind: 'summary' | 'brief' } | null>(null)
  /**
   * 扣费回执（只花 Token 的简报会有）。
   *
   * ⚠️ 存在的理由很直接：用户会问"这个扣了没、扣了几次"。读完简报当场显示
   * "已消耗 1 Token（余额 N）"，比让他去别处对数有用得多 —— 而且只在这一刻出现，
   * 不是常驻说明。
   */
  const [chargeNotice, setChargeNotice] = React.useState<string | null>(null)
  /**
   * 简报的**幂等键**（每项研究工作一个"查看意图"）。
   *
   * ⚠️ 402（Token 不足）之后用户拿到 Token 再点，必须复用同一个 key —— 服务端据此回放，
   * 不会重复扣费；换成新 key 就会再扣一次（`INTEGRATION.md` §8 的硬要求）。
   */
  const [intents, setIntents] = React.useState<Record<string, string>>({})

  // 服务器地址随宿主状态同步（登录成功后宿主会把归一后的地址写回来）
  React.useEffect(() => {
    if (state?.serverUrl) setServerDraft(state.serverUrl)
  }, [state?.serverUrl])

  /**
   * 调一个 `/dsh-convfusion/*` 端点。
   *
   * 传输层异常（HTTP 非 2xx / 超时）必须变成一条可显示的失败 —— 早先的写法只判断
   * `res.ok`，异常把 async effect 打断，页面停在"正在加载…"且没有任何信息。
   */
  const post = React.useCallback(
    async (
      endpoint: string,
      payload: unknown,
    ): Promise<{
      ok: boolean
      value?: unknown
      error?: { code: string; message: string }
    }> => {
      try {
        const res = await send(endpoint, payload)
        if (!res || res.ok !== true) {
          return {
            ok: false,
            error: { code: res?.error?.code ?? 'unknown', message: res?.error?.message ?? '未知原因' },
          }
        }
        return { ok: true, value: res.value }
      } catch (e) {
        return {
          ok: false,
          error: {
            code: 'transport',
            message: `无法访问 ${SETTINGS_ROUTE_PREFIX}（${
              e instanceof Error ? e.message : String(e)
            }）。请查看 DSH 宿主日志。`,
          },
        }
      }
    },
    [send],
  )

  /** 账号类调用：结果写入账号状态与失败提示。 */
  const call = React.useCallback(
    async (endpoint: string, payload: unknown): Promise<HostAccountState | null> => {
      const res = await post(endpoint, payload)
      if (!res.ok) {
        setFailure(res.error ?? { code: 'unknown', message: '未知原因' })
        return null
      }
      const next = res.value as HostAccountState
      setState(next)
      setFailure(null)
      return next
    },
    [post],
  )

  /** 首次进入本 Tab：读状态（不联网），有凭据则**联网**验证一次身份。 */
  React.useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await send('account/state', {})
        if (!alive) return
        if (!res || res.ok !== true) {
          setFailure({
            code: res?.error?.code ?? 'unknown',
            message: res?.error?.message ?? '读取登录状态失败。',
          })
          return
        }
        const current = res.value as HostAccountState
        setState(current)
        // 有凭据就实打实验一次 —— 界面上的"已登录"必须是服务器此刻承认的
        if (current.keyConfigured) await call('account/verify', {})
      } catch (e) {
        if (!alive) return
        setFailure({
          code: 'transport',
          message: `无法读取登录状态：${e instanceof Error ? e.message : String(e)}`,
        })
      } finally {
        if (alive) setPhase('ready')
      }
    })()
    return () => {
      alive = false
    }
  }, [send, call])

  const account = state?.account ?? null
  const configured = state?.keyConfigured ?? false
  /**
   * 能否用「可指导」视图。
   *
   * 由**服务器给的角色**决定（`MENTOR`；`ADMIN` 一并放行，否则管理员无法自查这一页）。
   * 没有角色时不是把内容藏起来不说，而是明说"需要导师角色" —— 那是权限状态，
   * 不是产品说明（用户点开了这个 Tab，就是"业务发生"了）。
   */
  const canMentor = Boolean(
    account && (account.roles.includes('MENTOR') || account.roles.includes('ADMIN')),
  )
  /** 凭据来自环境变量时无法在界面里清除（它不在设置文档里）—— 如实说明，不装作能登出。 */
  const fromEnv = state?.keySource === 'env'

  /* ── 列表加载：**只有登录后才联网**；未登录显示示例数据 ─────────────── */
  const loadWorks = React.useCallback(async (): Promise<void> => {
    setWorksLoading(true)
    setWorksError(null)
    setChargeNotice(null)
    // 换账号 / 重新加载时收起展开态，避免显示上一个账号看到的内容
    setOpen(null)
    setDetail(null)
    // 不传条数：抽样与条数是**服务器**的策略（插件不复制服务端策略）
    const res = await post('work/list', {})
    setWorksLoading(false)
    if (!res.ok) {
      setWorksError(res.error ?? { code: 'unknown', message: '读取研究工作列表失败。' })
      setWorks(null)
      return
    }
    setWorks((res.value as { items: HostWork[] }).items ?? [])
  }, [post])

  /**
   * 读**本机**研究项目（`work/mine`）。
   *
   * 与登录无关：本机有哪几个研究项目是本地事实，未登录也照样列出来。
   */
  const loadMine = React.useCallback(async (): Promise<void> => {
    setMineLoading(true)
    setMineError(null)
    const res = await post('work/mine', {})
    setMineLoading(false)
    if (!res.ok) {
      // ⚠️ 读失败**不能**显示成"没有研究项目"：那是在用假信息掩盖故障。
      // 旧宿主没有这个端点（unknown-endpoint）时尤其要说出"需重启"。
      setMine(null)
      setMineError(
        res.error?.code === 'unknown-endpoint'
          ? { code: 'host-restart', message: '宿主侧需要重启：当前宿主还没有 work/mine 端点。' }
          : (res.error ?? { code: 'unknown', message: '读取本机研究工作失败。' }),
      )
      return
    }
    const value = res.value as {
      items: HostLocalWork[]
      registry?: { available: boolean; reason?: string }
    }
    setMine(value.items ?? [])
    setMineRegistry(value.registry ?? null)
  }, [post])

  React.useEffect(() => {
    void loadMine()
  }, [loadMine])

  React.useEffect(() => {
    if (!account) {
      setWorks(null)
      setWorksError(null)
      setOpen(null)
      setDetail(null)
      return
    }
    void loadWorks()
  }, [account, loadWorks])

  /** 展开 / 收起一项研究工作的摘要（免费）。 */
  const toggleSummary = async (w: HostWork): Promise<void> => {
    if (open?.projectId === w.projectId && open.kind === 'summary') {
      setOpen(null)
      return
    }
    setDetailBusy({ projectId: w.projectId, kind: 'summary' })
    setWorksError(null)
    const res = await post('work/summary', { projectId: w.projectId })
    setDetailBusy(null)
    if (!res.ok) {
      setWorksError(res.error ?? { code: 'unknown', message: '读取摘要失败。' })
      return
    }
    const fresh = (res.value as { work: HostWork }).work
    setDetail({ projectId: w.projectId, work: fresh })
    setOpen({ projectId: w.projectId, kind: 'summary' })
  }

  /** 展开一项研究工作的简报（第二层，非 owner 花 1 Token）。 */
  const toggleBrief = async (w: HostWork): Promise<void> => {
    if (open?.projectId === w.projectId && open.kind === 'brief') {
      setOpen(null)
      return
    }
    setDetailBusy({ projectId: w.projectId, kind: 'brief' })
    setWorksError(null)
    setChargeNotice(null)
    // 同一项研究工作的重试复用同一个 key；换一项 = 新的意图
    const intentKey =
      intents[w.projectId] ??
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cf-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    setIntents((prev) => ({ ...prev, [w.projectId]: intentKey }))
    const res = await post('work/brief', { projectId: w.projectId, intentKey })
    setDetailBusy(null)
    if (!res.ok) {
      // ⚠️ 失败时**保留** intentKey：402 拿到 Token 后重试要复用，网络失败重试也要复用。
      setWorksError(res.error ?? { code: 'unknown', message: '读取简报失败。' })
      return
    }
    const brief = (res.value as { brief: HostWorkBrief }).brief
    setDetail({ projectId: w.projectId, work: brief, brief })
    setOpen({ projectId: w.projectId, kind: 'brief' })
    // 成功之后这次意图已经完成，清掉 key（下次点是新的一次查看）
    setIntents((prev) => {
      const next = { ...prev }
      delete next[w.projectId]
      return next
    })
    // 简报是**花钱**的：立刻把余额刷新（界面数字 = 服务器数字），并给出扣费回执。
    // 自己的项目读简报免费 —— 服务器不扣，回执照余额差值说话，不硬编码"1"。
    const before = state?.tokens?.available
    const after = await refreshBalance()
    if (typeof after === 'number') {
      setChargeNotice(
        typeof before === 'number' && before !== after
          ? `已读取简报，消耗 ${before - after} Token（余额 ${after}）`
          : `已读取简报（余额 ${after}）`,
      )
    }
  }

  /** 服务器地址（留空 = 用宿主当前的地址）。 */
  const serverUrl = serverDraft.trim() || state?.serverUrl || undefined

  /**
   * 地址是否被用户改过（且已登录）。
   *
   * 只在**真的改了**的时候才提示"需要重新登录" —— 这是业务发生时的提示，
   * 不是常驻说明（2026-09 用户要求：设置页不要总是堆说明文字）。
   */
  const serverChanged = Boolean(account) && Boolean(serverDraft.trim()) && serverDraft.trim() !== (state?.serverUrl ?? '')

  const login = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setBusy(true)
    const next = await call('account/login', { apiKey, ...(serverUrl ? { serverUrl } : {}) })
    setBusy(false)
    // 明文不留在界面状态里 —— 无论成功失败都清掉（失败时用户重新粘贴）
    setApiKey('')
    if (next) setInvite({ code: '', email: '', displayName: '' })
  }

  const register = async (): Promise<void> => {
    if (!invite.code.trim() || !invite.email.trim() || !invite.displayName.trim()) return
    setBusy(true)
    const next = await call('account/register', {
      invitationCode: invite.code,
      email: invite.email,
      displayName: invite.displayName,
      ...(serverUrl ? { serverUrl } : {}),
    })
    setBusy(false)
    if (next) setInvite({ code: '', email: '', displayName: '' })
  }

  const logout = async (): Promise<void> => {
    setBusy(true)
    await call('account/logout', {})
    setBusy(false)
    setIntents({})
  }

  const verify = async (): Promise<void> => {
    setBusy(true)
    await call('account/verify', {})
    setBusy(false)
  }

  /**
   * 单独刷新 Token 余额。
   *
   * 为什么要有这个动作：**花钱的事就在这一页发生**（简报 1 Token）。读完简报后
   * 界面上的数字必须跟着变，否则用户会怀疑"到底扣没扣、扣了几次"。
   * 刷新失败**不清空**已有数字（拿不到 ≠ 变 0）。
   */
  const refreshBalance = async (): Promise<number | null> => {
    setRefreshingBalance(true)
    const res = await post('account/tokens', {})
    setRefreshingBalance(false)
    if (!res.ok) return null
    const tokens = (res.value as { tokens: HostAccountState['tokens'] }).tokens
    if (!tokens) return null
    setState((prev) => (prev ? { ...prev, tokens } : prev))
    return tokens.available
  }

  return (
    <>
      {/* ══ 用户信息区（内部 Tabs：账号 / 服务器设置）══════════════════════ */}
      <div style={S.card}>
        <div style={S.cardHead}>
          ◈ ConvFusion.com
          <span style={{ flex: '1 1 auto' }} />
          {/* 环境徽章：开发连的是本机服务器，生产连的是线上 —— 两者不能混为一谈。
              环境还没读到（宿主是旧的 / 正在读）时不猜，先不显示。 */}
          {state?.environment === 'production' ? (
            <Badge tone="brand">生产环境</Badge>
          ) : state?.environment === 'development' ? (
            <Badge tone="neutral">开发环境</Badge>
          ) : null}
          {state?.serverUrlMismatch ? <Badge tone="warn">地址与环境不一致</Badge> : null}
          {phase === 'loading' ? (
            <Badge tone="neutral">检查中…</Badge>
          ) : account ? (
            <Badge tone="success">已登录</Badge>
          ) : configured ? (
            <Badge tone="warn">凭据待验证</Badge>
          ) : (
            <Badge tone="neutral">未登录</Badge>
          )}
        </div>

        <div style={S.cardBody}>
          {/*
           * 这里**不放**常驻的产品说明（Pitch Deck 的那句定位属于文档与首页，不属于设置页）。
           * 设置页只在**业务真的发生时**给提示：失败原因、空结果、待填字段、状态异常。
           */}

          {/* 内部 Tab：两个小标签，切换"账号"与"服务器设置" */}
          <div style={S.miniTabs}>
            <MiniTab active={userTab === 'account'} onClick={() => setUserTab('account')}>
              {account ? '账号' : '登录'}
            </MiniTab>
            <MiniTab active={userTab === 'server'} onClick={() => setUserTab('server')}>
              服务器设置
            </MiniTab>
          </div>

          {userTab === 'account' ? (
            account ? (
              /* 已登录：一行账号 + 右侧操作，没有多余说明文字 */
              <div style={S.inlineRow}>
                <span style={S.accountName}>{account.displayName}</span>
                <span style={S.mono}>{account.email}</span>
                <span style={S.hint}>
                  {roleText(account.roles)} · {STATUS_LABELS[account.status] ?? account.status}
                </span>
                {/* Token 余额：点了就刷新（花掉 Token 之后不用整页重载） */}
                {state?.tokens ? (
                  <button
                    type="button"
                    style={{ ...S.tokenBadge, opacity: refreshingBalance || busy ? 0.55 : 1 }}
                    disabled={refreshingBalance || busy}
                    title={
                      state.tokens.frozen > 0
                        ? `可用 ${state.tokens.available} · 冻结 ${state.tokens.frozen}（冻结仍是你的，只是锁住了）`
                        : '点击刷新余额'
                    }
                    onClick={() => void refreshBalance()}
                  >
                    ◎ {state.tokens.available} Token
                    {state.tokens.frozen > 0 ? `（+${state.tokens.frozen} 冻结）` : ''}
                  </button>
                ) : null}
                <span style={{ flex: '1 1 auto' }} />
                <button
                  type="button"
                  style={{ ...S.ghostBtn, opacity: busy ? 0.55 : 1 }}
                  disabled={busy}
                  onClick={() => void verify()}
                >
                  {busy ? '处理中…' : '重新验证'}
                </button>
                <button
                  type="button"
                  style={{ ...S.ghostBtn, opacity: busy || fromEnv ? 0.55 : 1 }}
                  disabled={busy || fromEnv}
                  title={fromEnv ? '凭据来自环境变量，请修改环境变量后重启 DSH' : undefined}
                  onClick={() => void logout()}
                >
                  登出
                </button>
              </div>
            ) : (
              /* 未登录：默认只展示**一条**登录路径 */
              <>
                <div style={S.inlineRow}>
                  <span style={S.label}>API Key 登录</span>
                  <input
                    style={S.compactInput}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={apiKey}
                    placeholder="cf_live_…"
                    // 凭据纪律用**悬浮提示**说明：需要时能看到，平时不占版面
                    title="凭据只保存在本机（DSH 设置），不会回传浏览器，也不会写进对话内容。"
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void login()
                    }}
                  />
                  <button
                    type="button"
                    style={{ ...S.primaryBtn, opacity: apiKey.trim() && !busy ? 1 : 0.55 }}
                    disabled={!apiKey.trim() || busy}
                    onClick={() => void login()}
                  >
                    {busy ? '登录中…' : '登录'}
                  </button>
                  <button
                    type="button"
                    style={S.linkBtn}
                    onClick={() => setInviteOpen((v) => !v)}
                    aria-expanded={inviteOpen}
                  >
                    {inviteOpen ? '收起邀请码注册' : '使用邀请码注册'}
                  </button>
                </div>

                {/* 次要路径：邀请码注册（默认折叠，展开后仍是紧凑一行） */}
                {inviteOpen ? (
                  <>
                    <div style={S.inlineRow}>
                      <input
                        style={S.compactInput}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={invite.code}
                        placeholder="邀请码 cf_inv_…"
                        onChange={(e) => setInvite({ ...invite, code: e.target.value })}
                      />
                      <input
                        style={S.compactInput}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={invite.email}
                        placeholder="邮箱（须与邀请码一致）"
                        onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                      />
                      <input
                        style={S.compactInput}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={invite.displayName}
                        placeholder="显示名"
                        onChange={(e) => setInvite({ ...invite, displayName: e.target.value })}
                      />
                      <button
                        type="button"
                        style={{
                          ...S.primaryBtn,
                          opacity:
                            invite.code.trim() && invite.email.trim() && invite.displayName.trim() && !busy
                              ? 1
                              : 0.55,
                        }}
                        disabled={
                          !invite.code.trim() || !invite.email.trim() || !invite.displayName.trim() || busy
                        }
                        onClick={() => void register()}
                      >
                        {busy ? '注册中…' : '注册并登录'}
                      </button>
                    </div>
                    <div style={S.hint}>
                      邮箱必须与邀请码签发时指定的邮箱一致；注册成功后服务器签发的 API Key 直接保存在本机。
                    </div>
                  </>
                ) : null}
              </>
            )
          ) : (
            /* 服务器设置：地址来自环境配置（开发 = 本机服务器，生产 = 线上） */
            <>
              <div style={S.inlineRow}>
                <span style={S.label}>服务器地址</span>
                <input
                  style={S.compactInput}
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={serverDraft}
                  placeholder={state?.defaultServerUrl ?? ''}
                  // 输入约定与归一规则收进悬浮提示：需要时能看到，平时不占版面
                  title={
                    '留空 = 跟随环境配置' +
                    (state?.defaultServerUrl ? `（本环境默认 ${state.defaultServerUrl}）` : '') +
                    '；带 /api 或 /docs 的地址会自动归一。'
                  }
                  onChange={(e) => setServerDraft(e.target.value)}
                />
              </div>
              {/* 只在**地址真的改了**（业务发生）时提示后果，不做常驻说明 */}
              {serverChanged ? (
                <div style={S.inlineRow}>
                  <Badge tone="warn">地址已改</Badge>
                  <span style={S.hint}>改用新地址需要重新登录（凭据绑定在服务器上）。</span>
                </div>
              ) : null}
              {state?.serverUrlMismatch ? (
                <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-state-warn-primary)' }}>
                  {state.environment === 'production'
                    ? '当前是生产环境，但地址指向本机 —— 你多半连的是自己电脑上的开发服务器。'
                    : '当前是开发环境，但地址指向线上服务器 —— 在开发机上操作线上数据有风险，请确认这是你想要的。'}
                </div>
              ) : null}
            </>
          )}

          {/* 失败原因必须具体：401 换 Key、403 找管理员、超时查服务器 —— 各是不同的动作 */}
          {failure ? (
            <div style={S.inlineRow}>
              <Badge tone="error">{failure.code}</Badge>
              <span
                style={{
                  color: 'var(--dsw-alias-state-error-primary)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  flex: '1 1 320px',
                  minWidth: 0,
                }}
              >
                {failure.message}
              </span>
              {configured ? (
                <button
                  type="button"
                  style={{ ...S.ghostBtn, opacity: busy ? 0.55 : 1 }}
                  disabled={busy}
                  onClick={() => void verify()}
                >
                  重试验证
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/*
       * ══ 研究工作（两个视图）══════════════════════════════════════════════
       *
       *   我的   —— **本机**的研究项目（有效 research workspace 的工作区）。
       *            不联网、不需要登录；所有用户都能看到自己的。
       *   可指导 —— 研究网络里已公开的研究工作（导师视角）。需要导师角色。
       *
       * 「我的」在前（2026-09 用户拍板）：所有人都可能**被**指导，先看自己的；
       * 导师才需要另一个视图去找可指导的研究。
       */}
      <div style={S.card}>
        <div style={S.cardHead}>
          {/* 卡片标题：只说"这一片是什么"，两个视图的名字交给后面的 Tab */}
          <span style={{ marginRight: 4 }}>研究工作</span>
          <MiniTab active={workTab === 'mine'} onClick={() => setWorkTab('mine')}>
            我的
          </MiniTab>
          <MiniTab active={workTab === 'mentor'} onClick={() => setWorkTab('mentor')}>
            可指导
          </MiniTab>
          <span style={{ flex: '1 1 auto' }} />
          {workTab === 'mine' ? (
            <button
              type="button"
              style={{ ...S.ghostBtn, opacity: mineLoading ? 0.55 : 1 }}
              disabled={mineLoading}
              onClick={() => void loadMine()}
            >
              {mineLoading ? '读取中…' : '刷新'}
            </button>
          ) : null}
          {workTab === 'mentor' && account ? (
            <button
              type="button"
              style={{ ...S.ghostBtn, opacity: worksLoading ? 0.55 : 1 }}
              disabled={worksLoading}
              onClick={() => void loadWorks()}
            >
              {worksLoading ? '读取中…' : '刷新'}
            </button>
          ) : null}
          {workTab === 'mentor' && !account ? <Badge tone="neutral">示例数据</Badge> : null}
        </div>
        <div style={S.cardBody}>
          {/*
           * 下一步（用户已拍板要做，等登录链路测试通过后再接）：
           *   Level 3「完整研究状态」+「申请导师指导」，即设计文档 §1708-1740 的商业闭环：
           *   POST /projects/{id}/mentorship-proposals → 接受（押金冻结）→ GET /projects/{id}/full。
           * 现在**不加**入口：宁可先没有，也不要一个点了没反应的按钮。
           */}
          {/* 列表级失败（列表 / 摘要 / 简报共用一处提示，按 code 给出不同说法） */}
          {chargeNotice ? (
            <div style={S.inlineRow}>
              <Badge tone="brand">已计费</Badge>
              <span style={S.hint}>{chargeNotice}</span>
            </div>
          ) : null}
          {worksError ? (
            <div style={S.inlineRow}>
              <Badge tone="error">{worksError.code}</Badge>
              <span
                style={{
                  color: 'var(--dsw-alias-state-error-primary)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  flex: '1 1 320px',
                  minWidth: 0,
                }}
              >
                {worksError.message}
              </span>
            </div>
          ) : null}

          {workTab === 'mine' ? (
            /* ── 我的：本机研究项目 ── */
            mineError ? (
              <div style={S.inlineRow}>
                <Badge tone="error">{mineError.code}</Badge>
                <span
                  style={{
                    color: 'var(--dsw-alias-state-error-primary)',
                    fontSize: 12,
                    lineHeight: 1.6,
                    flex: '1 1 320px',
                    minWidth: 0,
                  }}
                >
                  {mineError.message}
                </span>
                <button type="button" style={S.ghostBtn} onClick={() => void loadMine()}>
                  重试
                </button>
              </div>
            ) : mineRegistry && !mineRegistry.available ? (
              // 注册表读不到（≠ 没有研究项目）：把原因原样说出来，便于定位
              <div style={S.inlineRow}>
                <Badge tone="warn">注册表不可用</Badge>
                <span style={S.hint}>
                  {mineRegistry.reason ?? '这台 DSH 没有提供工作区注册表。'}
                </span>
              </div>
            ) : mine === null ? (
              <div style={S.hint}>{mineLoading ? '正在读取…' : '暂无数据。'}</div>
            ) : mine.length === 0 ? (
              <div style={S.hint}>
                本机还没有研究项目（含有效 research workspace 的工作区会出现在这里）。
              </div>
            ) : (
              <div style={S.list}>
                {mine.map((w, i) => (
                  <div
                    key={w.id}
                    style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                  >
                    <div style={{ ...S.listRow, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={S.listTitle}>{w.title}</div>
                        <div style={{ ...S.hint, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {w.stage ? <span>{w.stage}</span> : null}
                          <ProgressBar value={w.overall} />
                          {w.paper ? <span>已有论文</span> : null}
                          {w.counts
                            .filter((c) => c.value > 0)
                            .slice(0, 4)
                            .map((c) => (
                              <span key={c.key}>
                                {c.label} {c.value}
                              </span>
                            ))}
                        </div>
                        {/* 本机路径：工程师要看得到"这是哪个项目"，用 title 承载完整路径 */}
                        <div style={{ ...S.mono, color: 'var(--dsw-alias-label-tertiary)' }} title={w.researchRoot}>
                          {w.path}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : !account ? (
            /* ── 可指导 · 未登录：示例数据（不可操作）── */
            <>
              <div style={S.list}>
                {SAMPLE_WORKS.map((w, i) => (
                  <div
                    key={w.title}
                    style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                  >
                    <WorkRow
                      title={w.title}
                      fields={w.fields}
                      stage={w.stage}
                      progress={w.progress}
                      disabled
                      busy={null}
                      expanded={false}
                      onSummary={() => undefined}
                      onBrief={() => undefined}
                    />
                  </div>
                ))}
              </div>
              <div style={S.hint}>示例数据，登录后可浏览并操作网络上的研究工作。</div>
            </>
          ) : !canMentor ? (
            /* ── 可指导 · 已登录但没有导师角色：如实说明这一层需要什么 ── */
            <div style={S.inlineRow}>
              <Badge tone="warn">需要导师角色</Badge>
              <span style={S.hint}>
                浏览可指导的研究工作需要导师角色（当前：{roleText(account.roles)}）。
              </span>
            </div>
          ) : works === null ? (
            <div style={S.hint}>{worksLoading ? '正在读取研究工作…' : '暂无数据。'}</div>
          ) : works.length === 0 ? (
            <div style={S.hint}>暂无可发现的研究工作。</div>
          ) : (
            <div style={S.list}>
              {works.map((w, i) => {
                const expanded = open?.projectId === w.projectId
                const busyKind = detailBusy?.projectId === w.projectId ? detailBusy.kind : null
                return (
                  <div
                    key={w.projectId}
                    style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                  >
                    <WorkRow
                      title={w.title}
                      fields={w.researchFields}
                      stage={w.stage}
                      progress={w.progress}
                      updatedAt={w.updatedAt}
                      disabled={false}
                      busy={busyKind}
                      expanded={expanded}
                      onSummary={() => void toggleSummary(w)}
                      onBrief={() => void toggleBrief(w)}
                    />
                    {expanded && detail?.projectId === w.projectId ? (
                      <WorkDetail work={detail.work} brief={detail.brief} />
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * Tab 3 — 系统设置（本地依赖检查 + 文献检索凭据）
 *
 * 这里放"研究过程中要用到的系统级东西"，而不是研究方法本身（后者在【本地研究方法】）：
 *
 *   1. **本地依赖**：论文最终要编译成 LaTeX/PDF，靠本机装的 `tectonic`。它不是 npm 依赖，
 *      用户可能没装 —— 所以给出可用性、路径、版本与安装方法，并提供"重新检查"。
 *   2. **文献检索凭据**：OpenAlex API Key。密钥是 `role('secret')` 字段，
 *      **明文从不经过浏览器**；这里只拿 `configured / source`。
 * ════════════════════════════════════════════════════════════════════════ */

function SystemTab({
  configured,
  source,
  envVar,
  tectonic,
  onRecheck,
  scope,
  onNotice,
}: {
  configured: boolean
  source: 'settings' | 'env' | 'none'
  envVar: string
  tectonic: HostDependency | null
  onRecheck: () => Promise<HostDependency | null>
  scope: SettingsScopeLike
  onNotice: (n: { tone: 'success' | 'error'; text: string } | null) => void
}): JSX.Element {
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  // 本地点一份，避免"重新检查"后要等整页状态回填
  const [dep, setDep] = React.useState<HostDependency | null>(tectonic)
  React.useEffect(() => {
    setDep(tectonic)
  }, [tectonic])

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

  const recheck = async (): Promise<void> => {
    setChecking(true)
    try {
      const next = await onRecheck()
      setDep(next)
      if (next?.available) {
        onNotice({ tone: 'success', text: `tectonic 可用${next.version ? `：${next.version}` : ''}` })
      } else {
        onNotice({ tone: 'error', text: '未找到 tectonic，请按下方说明安装后重新检查' })
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      {/* ── 本地依赖：tectonic ─────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardHead}>
          🧩 本地依赖
          <span style={{ flex: '1 1 auto' }} />
          {dep === null ? (
            <Badge tone="neutral">未知</Badge>
          ) : dep.available ? (
            <Badge tone="success">已安装</Badge>
          ) : (
            <Badge tone="warn">未安装</Badge>
          )}
        </div>
        <div style={S.cardBody}>
          {/* 状态行：名称 · 版本 · 路径 · 重新检查 —— 已安装时本卡片就只有这一行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={S.mono}>tectonic</span>
            {dep?.version ? <span style={S.hint}>{dep.version}</span> : null}
            {dep?.path ? <span style={{ ...S.hint, opacity: 0.7 }}>{dep.path}</span> : null}
            {dep?.viaEnv ? <span style={S.hint}>（由 {dep.envVar} 指定）</span> : null}
            <span style={{ flex: '1 1 auto' }} />
            <button
              type="button"
              style={{ ...S.ghostBtn, opacity: checking ? 0.55 : 1 }}
              disabled={checking}
              onClick={() => void recheck()}
            >
              {checking ? '检查中…' : '重新检查'}
            </button>
          </div>

          {/* 未安装才展开：这时那些字才是用户真正需要的 */}
          {dep && !dep.available ? (
            <div style={{ ...S.hint, lineHeight: 2, marginTop: 8 }}>
              论文编译成 PDF 需要本机的 <span style={S.mono}>tectonic</span>（不是 npm 依赖）。安装任一即可：
              <br />
              <span style={S.mono}>brew install tectonic</span>
              <br />
              <span style={S.mono}>mamba install -c conda-forge tectonic</span>
              <br />
              <span style={S.mono}>cargo install tectonic</span>
              <br />
              装在别处就设 <span style={S.mono}>{dep.envVar || 'CONVFUSION_TECTONIC'}</span>{' '}
              指向它，再点「重新检查」。首次编译会下载宏包（约 40 MB），之后复用。
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 文献检索凭据：OpenAlex ─────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardHead}>
          ⌕ 文献检索
          <span style={{ flex: '1 1 auto' }} />
          {configured ? <Badge tone="success">已配置</Badge> : <Badge tone="warn">未配置</Badge>}
        </div>
        <div style={S.cardBody}>
          <div style={S.field}>
            <div style={S.label}>OpenAlex API Key</div>
            <input
              style={S.input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              placeholder={configured ? '已设置，输入新值可覆盖' : '粘贴 API Key'}
              // 凭据纪律与"留空 = 不修改"收进悬浮提示，不占版面
              title="留空则不修改。密钥仅保存在本机，不会回传浏览器。"
              onChange={(e) => setDraft(e.target.value)}
            />
            {/* 只在需要动作（未配置）或状态特殊（由环境变量提供）时给一行 */}
            {!configured ? (
              <div style={S.hint}>
                未配置：可在 <span style={S.mono}>openalex.org</span> 免费申请后粘贴（未配置时走公共池，速率较低）。
              </div>
            ) : source === 'env' ? (
              <div style={S.hint}>
                当前由环境变量 <span style={S.mono}>{envVar}</span> 提供；在此保存会覆盖它。
              </div>
            ) : null}
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
    </>
  )
}

export default ConvFusionProjectSettings
