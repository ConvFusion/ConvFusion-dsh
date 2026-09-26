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
import { Markdown } from './markdown-view.js'
import {
  categoryText,
  sectionText,
  skillText,
  translateEnglish,
  translateOr,
  type Translate,
} from './i18n/index.js'

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

function rpcErrorDetail(t: Translate, error: RpcResult['error']): string {
  if (!error) return t('settings.error.unknown')
  if (error.code) {
    const key = `settings.error.code.${error.code}`
    const localized = t(key)
    if (localized !== key) return localized
  }
  return error.message ?? t('settings.error.unknown')
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
  /** DSH Slot 标准注入：跟随全局语言并在切换时重渲染。 */
  t: Translate
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
  /** 插件版本（package.json 单一来源；旧宿主没有 → 不显示版本徽章）。 */
  version?: string
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
   * 两个环境的地址（开发 / 生产），给地址框右边那两个**快捷图标按钮**用。
   *
   * 由宿主解析（配置文件 > 内置兜底）→ 客户端**不写死任何域名**。旧宿主没有这个字段时
   * 按钮**不显示**（拿不到 ≠ 没有，但不假装有）。
   */
  serverPresets?: { development: string; production: string }
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

/**
 * 一条续费申请（宿主 `account/recharge-requests` 的镜像）。
 *
 * `PENDING` = 等管理员处理；`APPROVED` = 已发放（`grantTxId` 指向账本那条 `GRANT`）；
 * `REJECTED` = 被拒。弹窗据此告诉用户"我申请到哪一步了"。
 */
interface HostRechargeRequest {
  id: string
  amount: number
  reason: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  note: string | null
  reviewedAt: string | null
  grantTxId: string | null
  createdAt: string
}

/** 一个本地外部依赖的检测结果（与 host 的 LocalDependencyStatus 对应）。 */
interface HostDependency {
  name: string
  available: boolean
  path?: string
  version?: string
  viaEnv: boolean
  envVar: string
  purposeCode: string
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
  t: Translate = translateEnglish,
): Promise<SettingsLoad> {
  if (typeof send !== 'function') {
    return { kind: 'error', message: t('settings.error.missingTransport') }
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
      return {
        kind: 'error',
        message: t('settings.error.service', {
          detail: rpcErrorDetail(t, res?.error),
        }),
      }
    }
    const value = res.value as HostState | undefined
    if (!value || !Array.isArray(value.categories)) {
      return {
        kind: 'error',
        message: t('settings.error.incomplete'),
      }
    }
    return { kind: 'ok', state: value }
  } catch (e) {
    return {
      kind: 'error',
      message: timedOut
        ? t('settings.error.timeout', {
            seconds: Math.round(timeoutMs / 1000),
            route: SETTINGS_ROUTE_PREFIX,
          })
        : t('settings.error.connection', {
            detail: e instanceof Error ? e.message : String(e),
            route: `${SETTINGS_ROUTE_PREFIX}/state`,
          }),
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
  /** 模态遮罩：四个对话框共用（原先各抄一遍，加第四个时抽出来）。 */
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.45)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1000,
    padding: 20,
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
  /** 分区标题（指导中的「我收到的」/「我发起的」）：一行字 + 计数徽章。 */
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11.5,
    fontWeight: 700,
    color: 'var(--dsw-alias-label-secondary)',
    marginTop: 6,
  } as React.CSSProperties,
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
  /**
   * **主行动按钮**（品牌色描边 + 淡底）：研究工作列表里的【发起指导】用它。
   *
   * 与 `ghostBtn`（中性描边）不同的理由：它是这一页真正的**商业动作**（把导师关系建起来），
   * 和上面一排"看内容"的按钮不是一个层级。配色直接用 Badge brand 的那两个变量，
   * 与全站品牌色一致；不做成实心 `primaryBtn`，避免和对话框里的「确认」抢主次。
   */
  accentBtn: {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-state-business-primary)',
    background: 'var(--dsw-alias-state-business-tertiary)',
    color: 'var(--dsw-alias-state-business-primary)',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
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
  /** Token 余额徽章：既是数字也是按钮（点了打开余额弹窗）。 */
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
  /** 余额弹窗里的**一行明细**：左边名目、右边数字（两端对齐）。 */
  rowBetween: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  } as React.CSSProperties,
  /** 余额弹窗里的**数字**：等宽、不换行，三行数字右侧对齐。 */
  tokenNum: {
    fontSize: 13,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  /**
   * **图标按钮**：只有符号、没有文字（账号行的【刷新】【登出】用）。
   *
   * 为什么要有它：这两个动作是**次要操作**，两个字各占 ~45px，加上余额徽章会把
   * 账号行挤成两行。图标固定方形（26×26）→ 宽度可预测，行宽不再随文案变。
   * 代价是失去可见文案，所以 `title` + `aria-label` 是**必须**的（不可省）。
   */
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    padding: 0,
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 13,
    lineHeight: 1,
    cursor: 'pointer',
  } as React.CSSProperties,
  /** 快捷按钮的**当前生效态**（地址就是这一边）：与 `accentBtn` 同一套品牌色。 */
  iconBtnActive: {
    border: '1px solid var(--dsw-alias-state-business-primary)',
    background: 'var(--dsw-alias-state-business-tertiary)',
    color: 'var(--dsw-alias-state-business-primary)',
  } as React.CSSProperties,
  /**
   * 快捷按钮的**连通成功态**：绿色。
   *
   * 用 `state-success` 那一组变量（与 `Badge tone="success"` 同一套），不自己调色 ——
   * 否则"绿"会和页面上其它成功提示不是同一个绿。
   */
  iconBtnOk: {
    border: '1px solid var(--dsw-alias-state-success-primary)',
    background: 'var(--dsw-alias-state-success-tertiary)',
    color: 'var(--dsw-alias-state-success-primary)',
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
  t,
  send = fetchSettingsSend,
}: ConvFusionSettingsProps): JSX.Element {
  const [state, setState] = React.useState<HostState | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<SettingsTab>('local')
  const [staleHost, setStaleHost] = React.useState(false)
  /** GitHub 最新版本（`version/check` 的结果；null = 无更新 / 检查不可用）。 */
  const [update, setUpdate] = React.useState<{ latest: string; url: string } | null>(null)

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
          const outcome = await loadSettingsState(send, {}, t)
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
          setError(
            t('settings.error.service', {
              detail: rpcErrorDetail(t, res?.error),
            }),
          )
          return null
        }
        setError(null)
        const next = res.value as HostState
        setState(next)
        return next
      } catch (e) {
        setError(
          t('settings.error.call', {
            endpoint,
            detail: e instanceof Error ? e.message : String(e),
          }),
        )
        return null
      }
    },
    [send, t],
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
   * 更新检查：**尽力而为**。GitHub 不可达 / 尚无 release / 已是最新 → 静默（不显示）。
   * 绝不打扰：这条请求失败不会让设置页有任何报错。
   */
  React.useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await send('version/check', {})
        if (!alive || !res || res.ok !== true) return
        const v = res.value as { latest?: unknown; outdated?: unknown; url?: unknown }
        if (v?.outdated === true && typeof v.latest === 'string') {
          setUpdate({ latest: v.latest, url: typeof v.url === 'string' ? v.url : '' })
        }
      } catch {
        /* 更新检查失败绝不打扰设置页 */
      }
    })()
    return () => {
      alive = false
    }
  }, [send])

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
    if (next) {
      setNotice({
        tone: 'success',
        text: draft.trim() ? t('settings.editor.saved') : t('settings.editor.restoredDefault'),
      })
    }
  }

  const reset = async (): Promise<void> => {
    if (!skill || !point) return
    if (!window.confirm(t('settings.editor.confirmSection', { section: sectionText(t, point.section) }))) return
    setSaving(true)
    const next = await call('customization/reset', { skillId: skill.skillId, section: point.section })
    setSaving(false)
    if (next) {
      setDraft('')
      setNotice({ tone: 'success', text: t('settings.editor.restoredDefault') })
    }
  }

  const resetSkill = async (): Promise<void> => {
    if (!skill) return
    const displaySkill = skillText(t, skill.skillId, skill.skillName)
    if (!window.confirm(t('settings.editor.confirmSkill', { skill: displaySkill }))) return
    setSaving(true)
    const next = await call('customization/resetSkill', { skillId: skill.skillId })
    setSaving(false)
    if (next) setNotice({ tone: 'success', text: t('settings.editor.restoredSkill', { skill: displaySkill }) })
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={S.heroTitle}>ConvFusion</div>
            {state?.version ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--dsw-alias-label-tertiary)' }}>
                v{state.version}
              </span>
            ) : null}
            {update ? (
              <a
                href={update.url || undefined}
                target="_blank"
                rel="noreferrer"
                title={t('settings.version.updateHint')}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--dsw-alias-state-business-primary)',
                  textDecoration: 'none',
                }}
              >
                {t('settings.version.updateAvailable', { version: update.latest })}
              </a>
            ) : null}
          </div>
          <div style={S.heroSub}>{t('settings.hero.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {totalOverridden > 0 ? (
            <Badge tone="brand">{t('settings.badge.customized', { count: totalOverridden })}</Badge>
          ) : (
            <Badge tone="neutral">{t('settings.badge.systemDefaults')}</Badge>
          )}
          {scopeSnap.status === 'unavailable' ? <Badge tone="warn">{t('settings.badge.readOnly')}</Badge> : null}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div style={S.tabs}>
        <TabButton active={tab === 'local'} onClick={() => setTab('local')}>
          ⚙ {t('settings.tab.local')}
        </TabButton>
        <TabButton active={tab === 'community'} onClick={() => setTab('community')}>
          ◈ {t('settings.tab.community')}
        </TabButton>
        <TabButton active={tab === 'retrieval'} onClick={() => setTab('retrieval')}>
          ⚙ {t('settings.tab.system')}
          {state && (!state.retrieval.configured || state.dependencies?.tectonic.available === false) ? (
            <span style={{ ...S.hint, marginLeft: 6 }}>{t('settings.status.needsConfiguration')}</span>
          ) : null}
        </TabButton>
      </div>

      {staleHost ? (
        <div style={S.card}>
          <div style={S.cardHead}>
            {t('settings.stale.title')}
            <span style={{ flex: '1 1 auto' }} />
            <Badge tone="warn">{t('settings.stale.badge')}</Badge>
          </div>
          <div style={S.cardBody}>
            <div style={{ ...S.hint, lineHeight: 1.7 }}>
              {t('settings.stale.body')}
              <br />
              {t('settings.stale.action')}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={S.card}>
          <div style={S.cardHead}>
            {t('settings.error.title')}
            <span style={{ flex: '1 1 auto' }} />
            <Badge tone="error">{t('settings.error.badge')}</Badge>
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
                {t('settings.action.retry')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading && !state ? (
        <div style={S.card}>
          <div style={S.cardBody}>
            <div style={S.hint}>{t('settings.status.loading')}</div>
          </div>
        </div>
      ) : null}

      {/* ── Tab 2：ConvFusion.com（账号 + 服务器 + 研究工作）──────── */}
      {tab === 'community' ? (
        <CommunityTab send={send} initial={state?.account ?? null} t={t} />
      ) : null}

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
          t={t}
        />
      ) : null}

      {state && tab === 'local' ? (
        <>
          {/* ── 选择区（能力类别 → 能力 → 章节）──────────────────── */}
          <div style={S.card}>
            <div style={S.cardHead}>
              {t('settings.library.title')}
              {/* 与 ConvFusion.com 的边界：方法留在本机，不随研究进展上传 */}
              <Badge tone="neutral">{t('settings.library.localOnly')}</Badge>
              <span style={{ flex: '1 1 auto' }} />
              <span style={{ ...S.hint, fontWeight: 400 }}>
                {t('settings.library.summary', { total: totalPoints, customized: totalOverridden })}
              </span>
            </div>
            <div style={S.cardBody}>
              <div style={S.row}>
                <div style={S.field}>
                  <div style={S.label}>{t('settings.library.category')}</div>
                  <select style={S.select} value={categoryId} onChange={(e) => onCategory(e.target.value)}>
                    {state.categories.map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.code ? `${c.code} ` : ''}
                        {categoryText(t, c.categoryId, c.categoryName)} ({c.skills.length})
                        {c.overriddenCount > 0
                          ? t('settings.library.customizedSuffix', { count: c.overriddenCount })
                          : ''}
                      </option>
                    ))}
                  </select>
                  <div style={S.hint}>
                    {category
                      ? t('settings.library.categoryHint', { count: category.skills.length })
                      : t('settings.library.emptyCategory')}
                  </div>
                  {/* C00 全局能力：作用域是整项研究（跨阶段前置），并提醒 DSH 级全局设置写在哪 */}
                  {category?.code === 'C00' ? (
                    <div style={{ ...S.hint, marginTop: 4 }}>{t('settings.library.globalHint')}</div>
                  ) : null}
                </div>
                <div style={S.field}>
                  <div style={S.label}>{t('settings.library.skill')}</div>
                  <select style={S.select} value={skillId} onChange={(e) => onSkill(e.target.value)}>
                    {category?.skills.map((s) => (
                      <option key={s.skillId} value={s.skillId}>
                        {s.code ? `${s.code} · ` : ''}
                        {skillText(t, s.skillId, s.skillName)}
                        {s.overriddenCount > 0
                          ? t('settings.library.customizedSuffix', { count: s.overriddenCount })
                          : ''}
                      </option>
                    ))}
                  </select>
                  <div style={S.hint}>
                    {skill ? t('settings.library.sectionCount', { count: skill.sections.length }) : ''}
                  </div>
                </div>
                <div style={S.field}>
                  <div style={S.label}>{t('settings.library.section')}</div>
                  <select style={S.select} value={section} onChange={(e) => onSection(e.target.value)}>
                    {skill?.sections.map((s) => (
                      <option key={s.section} value={s.section}>
                        {sectionText(t, s.section)}
                        {s.overridden ? t('settings.library.sectionCustomizedSuffix') : ''}
                      </option>
                    ))}
                  </select>
                  <div style={S.hint}>
                    {skill
                      ? `${t('settings.library.sectionHint', { count: skill.sections.length })} · ${t('settings.library.emptyUsesDefault')}`
                      : t('settings.library.emptyUsesDefault')}
                  </div>
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
                  {skillText(t, skill.skillId, skill.skillName)} · {sectionText(t, point.section)}
                </span>
                <span style={{ flex: '1 1 auto' }} />
                {point.overridden ? (
                  <Badge tone="brand">{t('settings.editor.customized')}</Badge>
                ) : (
                  <Badge tone="neutral">{t('settings.editor.systemDefault')}</Badge>
                )}
              </div>
              <div style={S.cardBody}>
                <div style={S.hint}>
                  {category?.code ? `${category.code} ` : ''}
                  {category ? categoryText(t, category.categoryId, category.categoryName) : ''} ·{' '}
                  {skillText(t, skill.skillId, skill.skillName)} · {sectionText(t, point.section)}
                </div>
                <div style={S.label}>{t('settings.editor.requirements')}</div>
                <textarea
                  style={S.textarea}
                  spellCheck={false}
                  value={draft}
                  placeholder={t('settings.editor.placeholder')}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <details>
                  <summary style={{ ...S.label, cursor: 'pointer' }}>
                    {t('settings.editor.base', { count: point.base.length })}
                  </summary>
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
                    <span style={{ ...S.hint, marginRight: 'auto' }}>
                      {t('settings.editor.characterCount', { count: draft.length })}
                    </span>
                  )}
                  <button
                    type="button"
                    style={{ ...S.ghostBtn, opacity: point.overridden && !saving ? 1 : 0.55 }}
                    disabled={!point.overridden || saving}
                    onClick={() => void reset()}
                  >
                    {t('settings.editor.resetSection')}
                  </button>
                  <button
                    type="button"
                    style={{ ...S.ghostBtn, opacity: skill.overriddenCount > 0 && !saving ? 1 : 0.55 }}
                    disabled={skill.overriddenCount === 0 || saving}
                    onClick={() => void resetSkill()}
                  >
                    {t('settings.editor.resetSkill')}
                  </button>
                  <button
                    type="button"
                    style={{ ...S.primaryBtn, opacity: dirty && !saving ? 1 : 0.55 }}
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                  >
                    {saving ? t('settings.editor.saving') : t('settings.editor.save')}
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

/**
 * 枚举 → 词条 key 的映射（角色 / 账号状态 / 研究阶段）。
 *
 * ⚠️ 服务器给的是稳定枚举（`RESEARCHER` / `ACTIVE` / `EXPERIMENT`），**展示文案必须走 locale**：
 * 这里只留映射，未知取值经 `translateOr` 回退成原枚举。不在这里写任何中文 ——
 * `verify-i18n.mjs` 会拒绝硬编码中文 UI 字符串。
 */
const ROLE_LABEL_KEYS: Record<string, string> = {
  RESEARCHER: 'community.role.RESEARCHER',
  MENTOR: 'community.role.MENTOR',
  ADMIN: 'community.role.ADMIN',
}
const STATUS_LABEL_KEYS: Record<string, string> = {
  ACTIVE: 'community.status.ACTIVE',
  SUSPENDED: 'community.status.SUSPENDED',
  DEACTIVATED: 'community.status.DEACTIVATED',
}
/** 研究阶段（服务器 `ResearchStage`）。 */
const STAGE_LABEL_KEYS: Record<string, string> = {
  IDEA: 'community.stage.IDEA',
  LITERATURE: 'community.stage.LITERATURE',
  HYPOTHESIS: 'community.stage.HYPOTHESIS',
  PLANNING: 'community.stage.PLANNING',
  IMPLEMENTATION: 'community.stage.IMPLEMENTATION',
  EXPERIMENT: 'community.stage.EXPERIMENT',
  ANALYSIS: 'community.stage.ANALYSIS',
  WRITING: 'community.stage.WRITING',
  COMPLETED: 'community.stage.COMPLETED',
}

/** 取一个枚举的展示名；未知枚举回退成原值（不显示成 key）。 */
function enumText(t: Translate, keys: Record<string, string>, value: string | null): string {
  if (!value) return ''
  return translateOr(t, keys[value] ?? value, value)
}

/** 指导提案状态（服务器 `ProposalStatus`）。 */
const PROPOSAL_STATUS_KEYS: Record<string, string> = {
  PROPOSED: 'community.mentor.status.PROPOSED',
  ACCEPTED: 'community.mentor.status.ACCEPTED',
  REJECTED: 'community.mentor.status.REJECTED',
  EXPIRED: 'community.mentor.status.EXPIRED',
  CANCELLED: 'community.mentor.status.CANCELLED',
}

/** 成功条件（服务器 `SuccessConditionType`）。 */
const SUCCESS_CONDITION_KEYS: Record<string, string> = {
  PAPER_ACCEPTED: 'community.mentor.condition.PAPER_ACCEPTED',
  PAPER_PUBLISHED: 'community.mentor.condition.PAPER_PUBLISHED',
  RESEARCH_COMPLETED: 'community.mentor.condition.RESEARCH_COMPLETED',
  PATENT_GRANTED: 'community.mentor.condition.PATENT_GRANTED',
  TECHNICAL_OUTCOME: 'community.mentor.condition.TECHNICAL_OUTCOME',
  MUTUAL_COMPLETION: 'community.mentor.condition.MUTUAL_COMPLETION',
}

/** 提案状态 → Badge 色调：等待响应要人动作（brand），已接受成功，其余中性。 */
function proposalTone(status: HostProposalStatus): 'brand' | 'success' | 'warn' | 'neutral' {
  if (status === 'PROPOSED') return 'brand'
  if (status === 'ACCEPTED') return 'success'
  if (status === 'EXPIRED') return 'warn'
  return 'neutral'
}

/**
 * 「指导中」那一行的**进展文案**。
 *
 * ⚠️ 提案状态（`PROPOSED`/`ACCEPTED`/…）是**提案**的生命周期，接受之后就不再变化 ——
 * 于是列表会永远停在「已接受」，看不出指导到底有没有开始（2026-09 用户反馈）。
 * 关系建立之后真正有意义的是：**导师传了指导结果没有**。
 *
 * 因此 ACCEPTED 拆成两个进展状态，并且**按角色换称呼**（导师看自己的行不该写
 * "导师已指导"）：
 *
 * | 事实 | 学生看到 | 导师看到 |
 * |---|---|---|
 * | `review/` 还没有文件 | 等待指导意见 | 待我指导 |
 * | `review/` 有文件 | 导师已指导 | 我已指导 |
 */
function progressLabelKey(p: HostProposal, incoming: boolean): string {
  if (p.status !== 'ACCEPTED') return PROPOSAL_STATUS_KEYS[p.status] ?? p.status
  const hasReview = typeof p.reviewFiles === 'number' && p.reviewFiles > 0
  if (incoming) return hasReview ? 'community.mentor.progress.studentGot' : 'community.mentor.progress.studentWaiting'
  return hasReview ? 'community.mentor.progress.mentorDone' : 'community.mentor.progress.mentorWaiting'
}

/**
 * 学生侧的【下载】只有在**导师传了东西**之后才有意义。
 *
 * 学生下载的是"自己的工作区 + 导师的 review/"；导师什么都没传时，下回来的就是
 * 自己已发布的那份 —— 点了没用（2026-09 用户反馈：还没有人上传，按钮却可点）。
 *
 * `reviewFiles` 为 `null`（查不到）时**保留按钮**：拿不到 ≠ 没有，不能因为一次探测
 * 失败就把一个可能可用的动作藏起来。
 */
function canDownloadProposal(p: HostProposal, incoming: boolean): boolean {
  if (p.status !== 'ACCEPTED') return false
  // 导师侧：下载的是**学生的工作区**，关系一建立就该能用（分析的前提）
  if (!incoming) return true
  if (p.reviewFiles === null || p.reviewFiles === undefined) return true
  return p.reviewFiles > 0
}

/**
 * 押金比例的**兜底值**（20%）。
 *
 * ⚠️ 只在拿不到 `mentor/fee-suggestion` 时才用它。正常情况下比例来自服务器的建议
 * （`suggested_deposit / suggested_fee`）—— 比例是平台策略，不能当常量抄到客户端。
 */
const DEFAULT_DEPOSIT_RATIO = 0.2

/**
 * 提案里**导师侧已不再采集**、但服务器当前仍要求非空的两个字段的过渡值。
 *
 * 1. `guidance_scope`：服务器 `min_length=1` 必填，而导师侧已删掉这个输入
 *    → 送占位符；学生侧展示时遇到占位符**整行不显示**（不显示"指导范围：-"）。
 * 2. `success_condition`：新语义是**由学生在接受时确认**，导师不指定
 *    → 送平台默认的「双方确认完成」。
 *
 * ⚠️ 都是**过渡值**：后端把这两个字段改成可选（见
 * `dev-notes/v3-Mentorship-backend-spec.md` 的"追加需求"）之后，
 * 这里应改成"干脆不发这两个字段"。
 */
const PROPOSE_SCOPE_PLACEHOLDER = '-'
const PROPOSE_DEFAULT_CONDITION = 'MUTUAL_COMPLETION'

function roleText(t: Translate, roles: string[]): string {
  if (!roles.length) return '—'
  return roles.map((r) => translateOr(t, ROLE_LABEL_KEYS[r] ?? r, r)).join(' · ')
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
  /**
   * 打开这一项的简报**还会不会再扣 Token**（服务器的 `brief_paid`）。
   *
   * `true` = 不再扣（账本里有支付记录，或项目属于自己）；`false` = 首次打开会扣。
   * `null`/`undefined` = 旧服务器没给这个字段。
   */
  briefPaid?: boolean | null
  /**
   * 宿主本地记忆：这一项的简报**已经买过**。
   *
   * 只在服务器没有 `brief_paid` 时兜底；服务器给了权威值就以 `briefPaid` 为准。
   */
  briefOpened?: boolean
  /** 简报本次实际扣掉的 Token（`charged_tokens`）。 */
  chargedTokens?: number
}

/** **本机**研究工作（宿主 `LocalWorkItem` 的镜像）—— 数据来自磁盘，不需要登录。 */
interface HostLocalWork {
  id: string
  title: string
  path: string
  researchRoot: string
  missingDir: boolean
  /** 进展阶段：稳定 id + 宿主原始 label（展示名按 locale 翻译，同「研究进展」面板）。 */
  stage: { id: string; label: string } | null
  overall: number
  /** 可数资产：稳定 key + 计数 + 结构化 detail。 */
  counts: Array<{ key: string; value: number; detail?: { code: string; count: number } }>
  /** 已发布到 ConvFusion.com 的本地记录（读本地映射；null = 还没发布过）。 */
  published: {
    projectId: string
    version: number
    updatedAt: string
    serverUrl: string
    accountId: string
  } | null
  paper: boolean
  clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
  updatedAt: string
}

/**
 * 发布对话框的数据（宿主 `work/uploadPlan` 的镜像）。
 *
 * ⚠️ `plan.categories` 里含 `excluded`（机器产物），但界面**不显示**它们
 * （2026-09 用户拍板：排除项直接不出现，不影响选择）。保留在数据里是为了对账。
 */
interface HostUploadPlan {
  projectId: string
  root: string
  title: string
  plan: {
    categories: Array<{
      id: string
      decision: 'recommended' | 'optional' | 'excluded'
      files: Array<{ relPath: string; size: number }>
      bytes: number
    }>
    totals: {
      allBytes: number
      allFiles: number
      recommendedBytes: number
      recommendedFiles: number
      optionalBytes: number
      optionalFiles: number
      excludedBytes: number
      excludedFiles: number
    }
    limits: { maxFileBytes: number; maxFilesPerRequest: number; maxRequestBytes: number }
    defaultSelection: string[]
    oversize: Array<{ relPath: string; size: number }>
    requestCount: number
  }
  selection: string[]
  remembered: boolean
  changed: string[]
  unchangedCount: number
  usage: {
    nextPublishCost: number
    storage: { usedBytes: number; capacityBytes: number; availableBytes: number }
  } | null
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

/* ── 指导关系（宿主 `MentorshipProposal` 等的镜像）────────────────────── */

/** 导师简介（`research_profiles` 投影；后端 enrich 后才有）。 */
interface HostMentorProfile {
  institution: string | null
  department: string | null
  bio: string | null
  researchFields: string[]
  researchInterests: string[]
  researchExpertise: string[]
}

/** 提案当事一方。`displayName` 缺失时宿主已回退成 id 短前缀。 */
interface HostProposalParty {
  id: string
  displayName: string
  profile?: HostMentorProfile | null
}

type HostProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'

/** 一条指导提案：我发起的（我是 mentor）/ 我收到的（我是 researcher）。 */
interface HostProposal {
  id: string
  projectId: string
  /** 项目标题（后端 enrich 后才有；缺 → null，界面写"未命名项目"）。 */
  projectTitle: string | null
  mentor: HostProposalParty | null
  researcher: HostProposalParty | null
  guidanceScope: string
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  successCondition: { type: string; description: string | null }
  status: HostProposalStatus
  /**
   * 关系建立（ACCEPTED）后，导师已上传的指导结果条数（`review/` 下的文件数）。
   *
   * 提案状态接受之后就不再变了，而用户要看的是**指导进展**；这个事实只在项目
   * 文件里。宿主在 `mentor/list` 里补齐；`null` = 没查到（未知），不是"没有"。
   */
  reviewFiles?: number | null
  expiresAt: string
  createdAt: string
}

/** 费用建议（`mentor/fee-suggestion`）。 */
interface HostFeeSuggestion {
  suggestedFee: number
  suggestedDeposit: number
  suggestedSuccessPayment: number
}

/**
 * **示例研究工作**（未登录时展示，标注"示例数据"、不可交互）。
 *
 * 为什么要有它：这一页是网络能力的入口，未登录时给一张空表等于什么也没说清。
 * 但它绝不能看起来像真的（`ConvFusion_setting.md` §1.3 原则 4）——
 * 因此带「示例数据」徽章、按钮全部禁用、并说明登录后才可操作。
 */
const SAMPLE_WORKS: ReadonlyArray<{
  titleKey: string
  fieldsKey: string
  stage: string
  progress: number
}> = [
  {
    titleKey: 'community.sample.retrieval.title',
    fieldsKey: 'community.sample.retrieval.fields',
    stage: 'EXPERIMENT',
    progress: 0.5,
  },
  {
    titleKey: 'community.sample.robotFailure.title',
    fieldsKey: 'community.sample.robotFailure.fields',
    stage: 'ANALYSIS',
    progress: 0.7,
  },
  {
    titleKey: 'community.sample.lidar.title',
    fieldsKey: 'community.sample.lidar.fields',
    stage: 'IMPLEMENTATION',
    progress: 0.4,
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

/**
 * 简报状态角标的最小宽度（px）。
 *
 * 两种状态的字数天生不同 —— '已支付'（3 个汉字）/ 'Paid' 与 '1 Token'（7 个字符）——
 * 各自按内容撑宽的话，按钮会随状态变宽变窄，一行里两个按钮跟着抖。
 * 64 是这些文案在 zh/en 下的**安全上界**：角标都比它窄，于是两种状态的按钮等宽。
 */
const BRIEF_BADGE_MIN_WIDTH = 64

/**
 * 打开这一项的简报**会不会再扣 Token**？—— 判据优先级只在这里定一份。
 *
 * 1. **服务器的 `briefPaid`**（权威）：`brief_paid` 由服务器的支付记录 / owner 判定，
 *    换机器、清缓存都不会误判或漏判；
 * 2. 服务器没给（旧版本）→ 退回宿主本地记忆 `briefOpened`；
 * 3. 两者都拿不准 → `false`（= 照常弹确认框）。**宁可多问一次，不可静默扣费。**
 */
function briefFree(w: { briefPaid?: boolean | null; briefOpened?: boolean }): boolean {
  // ① 权威：服务器说不会扣，就不会扣（支付记录 / owner）
  if (typeof w.briefPaid === 'boolean') return w.briefPaid
  // ② 兜底：旧服务器没有 brief_paid 时，才看宿主本地记忆
  if (w.briefOpened === true) return true
  // ③ 拿不准 → 当成"会扣费"（界面照常提醒）
  return false
}

/** 研究工作列表的一行（登录后可用；未登录时整行禁用）。 */
function WorkRow({
  t,
  title,
  fields,
  stage,
  progress,
  updatedAt,
  disabled,
  busy,
  expanded,
  briefFree,
  onSummary,
  onBrief,
  below,
}: {
  t: Translate
  title: string
  fields: string[]
  stage: string | null
  progress: number
  updatedAt?: string
  disabled: boolean
  busy: 'summary' | 'brief' | null
  expanded: boolean
  /** 打开这一项的简报不会再扣 Token（服务器 `brief_paid`，或本地记忆兜底）→ 不标价、不弹确认。 */
  briefFree?: boolean
  onSummary: () => void
  onBrief: () => void
  /**
   * 按钮**下面一行**的动作（当前只有「可指导」视图用：发起指导 + 状态角标）。
   *
   * 做成插槽而不是加一堆 props：这一行只有导师视角才有，而且它需要提案状态与
   * 发起回调（都属于 CommunityTab），塞进 WorkRow 会把两层的职责搅在一起。
   */
  below?: React.ReactNode
}): JSX.Element {
  return (
    <div style={{ ...S.listRow, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={S.listTitle}>{title}</div>
        <div style={{ ...S.hint, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {fields.length ? <span>{fields.join(' · ')}</span> : null}
          {stage ? <span>{enumText(t, STAGE_LABEL_KEYS, stage)}</span> : null}
          <ProgressBar value={progress} />
          {updatedAt ? <span>{updatedAt.slice(0, 10)}</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          style={{ ...S.ghostBtn, opacity: disabled || busy ? 0.55 : 1 }}
          disabled={disabled || busy !== null}
          title={t('community.tip.summary')}
          onClick={onSummary}
        >
          {busy === 'summary' ? t('community.action.loading') : expanded ? t('community.action.collapse') : t('community.action.summary')}
        </button>
        <button
          type="button"
          style={{
            ...S.ghostBtn,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            opacity: disabled || busy ? 0.55 : 1,
          }}
          disabled={disabled || busy !== null}
          title={
            disabled
              ? t('community.tip.briefDisabled')
              : briefFree
                ? t('community.tip.briefUnlocked')
                : t('community.tip.briefCost')
          }
          onClick={onBrief}
        >
          {busy === 'brief' ? (
            t('community.action.loading')
          ) : (
            <>
              {t('community.action.brief')}
              {/* 状态角标：已支付 = success 色，1 Token = brand 色；外层定宽保证两种状态等宽 */}
              <span
                style={{ display: 'inline-flex', minWidth: BRIEF_BADGE_MIN_WIDTH, justifyContent: 'center' }}
              >
                <Badge tone={briefFree ? 'success' : 'brand'}>
                  {briefFree ? t('community.briefState.paid') : t('community.briefState.cost')}
                </Badge>
              </span>
            </>
          )}
        </button>
      </div>
      {/* 按钮下面一行（导师视角：发起指导 + 状态角标） */}
      {below}
      </div>
    </div>
  )
}

/**
 * 展开区：显示**概览**（Level 1，免费）或**详情**（Level 2，1 Token）的内容。
 *
 * 界面上叫「概览 / 详情」（对齐业务：先免费判断相关性，再付费深入了解）；
 * 接口层仍是 `summary` / `brief`（`community.detail.*` 是面板里的**字段**标签，不跟着改）。
 */
function WorkDetail({
  t,
  work,
  brief,
}: {
  t: Translate
  work: HostWork
  brief?: HostWorkBrief | undefined
}): JSX.Element {
  /** 一行：标签 + **纯文本**（短标签类值，如证据名）。 */
  const line = (label: string, value: string | null | undefined): JSX.Element | null =>
    value ? (
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ ...S.label, flex: '0 0 56px' }}>{label}</span>
        <span style={{ ...S.hint, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap' }}>{value}</span>
      </div>
    ) : null
  /**
   * 一行：标签 + **Markdown 正文**。
   *
   * 这些值直接来自研究者的 `.md` 文件（有 `**强调**`、表格、引用、代码），
   * 按纯文本渲染时界面上是 Markdown **源码** —— 必须走 `Markdown` 渲染。
   */
  const block = (label: string, value: string | null | undefined): JSX.Element | null =>
    value && value.trim() !== '' ? (
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ ...S.label, flex: '0 0 56px' }}>{label}</span>
        <div style={{ ...S.hint, minWidth: 0, flex: '1 1 auto', color: 'var(--dsw-alias-label-secondary)' }}>
          <Markdown text={value} />
        </div>
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
      {/* 正文类字段一律走 Markdown（简报内容是研究者的 .md 原文）；证据名是短标签，保持纯文本 */}
      {block(t('community.detail.researchQuestion'), brief ? brief.researchQuestion : work.researchQuestion)}
      {block(t('community.detail.summary'), work.summary)}
      {brief ? (
        <>
          {block(t('community.detail.motivation'), brief.motivation)}
          {block(t('community.detail.coreIdea'), brief.coreIdea)}
          {block(t('community.detail.hypothesis'), brief.hypothesis)}
          {block(t('community.detail.methodOverview'), brief.methodOverview)}
          {brief.keyEvidence.length ? line(t('community.detail.keyEvidence'), brief.keyEvidence.join('；')) : null}
          {brief.openProblems.length
            ? brief.openProblems
                .map((p, i) => block(i === 0 ? t('community.detail.openProblems') : '', p))
                .filter(Boolean)
            : null}
        </>
      ) : null}
    </div>
  )
}

/** 人类可读的体积（对话框里到处在用）。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 发布确认对话框。
 *
 * ## 为什么必须有这一步
 *
 * 上传是**外部可见**的动作、**占服务器配额**（免费 1 GB）、而且**发布要花 Token**；
 * 一个真实工作区 757 MB，其中真正该传的只有 4 MB。默认全传既浪费空间也把该看的埋掉。
 *
 * ## 交互（2026-09 用户定稿）
 *
 * ```text
 * ┌ 发布到 ConvFusion.com ───────────────────────────────────────┐
 * │ 项目名                        发布成本 1 Token（余额 999）     │
 * │ 存储 本次 4.01 MB · 服务器可用 624 MB                          │
 * │ ✅ 研究状态与计划   0.23 MB   21 项   [展开]                    │
 * │ ✅ 论文与图表       0.97 MB   20 项   [展开]                    │
 * │ ⬜ 文献原文 (PDF) 561.34 MB  434 项   默认不传：别人的论文        │
 * │ ⬜ 文献抽取文本     2.28 MB   49 项                             │
 * │ ☑ 记住这次选择            [取消]  [发布]                       │
 * └──────────────────────────────────────────────────────────────┘
 * ```
 *
 * - **排除项（机器产物）完全不显示**（用户拍板）：不参与选择，也不制造噪声；
 * - 分类可整体勾选，也可展开到**逐文件**勾选（"允许调整"落到文件级）；
 * - 体积/项数/成本/余量/批次数全部实算并显示；
 * - 超过服务器单文件上限（100 MB）的文件**标出来说明传不上去**。
 */
function PublishDialog({
  t,
  data,
  selection,
  remember,
  expanded,
  busy,
  onToggleCategory,
  onToggleFile,
  onToggleExpand,
  onRemember,
  onCancel,
  onConfirm,
}: {
  t: Translate
  data: HostUploadPlan
  selection: ReadonlySet<string>
  remember: boolean
  expanded: ReadonlySet<string>
  busy: boolean
  onToggleCategory: (categoryId: string, files: string[], next: boolean) => void
  onToggleFile: (relPath: string, next: boolean) => void
  onToggleExpand: (categoryId: string) => void
  onRemember: (next: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  // 只显示**可选的**分类（recommended / optional）；excluded 完全不出现
  const visible = data.plan.categories.filter((c) => c.decision !== 'excluded' && c.files.length > 0)
  const selectedFiles = visible
    .flatMap((c) => c.files.map((f) => f.relPath))
    .filter((r) => selection.has(r))
  const selectedBytes = visible
    .flatMap((c) => c.files)
    .filter((f) => selection.has(f.relPath))
    .reduce((n, f) => n + f.size, 0)
  const batches = Math.max(1, Math.ceil(selectedFiles.length / data.plan.limits.maxFilesPerRequest))
  const storage = data.usage?.storage
  const oversizeSelected = visible
    .flatMap((c) => c.files)
    .filter((f) => selection.has(f.relPath) && f.size > data.plan.limits.maxFileBytes)

  return (
    <div
      style={S.overlay}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          ...S.card,
          width: 'min(760px, 96vw)',
          maxHeight: '88vh',
          overflow: 'auto',
          background: 'var(--dsw-alias-bg-layer-1)',
        }}
      >
        <div style={S.cardHead}>
          {/* 标题直接带工作区名：不再重复写 ConvFusion.com，也省掉下面那行标题 */}
          {t('community.publish.title', { title: data.title })}
          <span style={{ flex: '1 1 auto' }} />
          {data.usage ? (
            <Badge tone={data.usage.nextPublishCost > 0 ? 'brand' : 'neutral'}>
              {t('community.publish.cost', { tokens: data.usage.nextPublishCost })}
            </Badge>
          ) : (
            <Badge tone="neutral">{t('community.publish.costUnknown')}</Badge>
          )}
        </div>
        <div style={{ ...S.cardBody, gap: 12 }}>
          <div style={S.hint}>
            {t('community.publish.storage', {
              selected: formatBytes(selectedBytes),
              available: storage ? formatBytes(storage.availableBytes) : t('community.publish.unknown'),
            })}
            {data.changed.length > 0
              ? ` · ${t('community.publish.changed', { count: data.changed.length })}`
              : data.remembered
                ? ` · ${t('community.publish.unchanged')}`
                : ''}
          </div>

          <div style={S.list}>
            {visible.map((cat, i) => {
              const files = cat.files
              const all = files.every((f) => selection.has(f.relPath))
              const some = !all && files.some((f) => selection.has(f.relPath))
              const isOpen = expanded.has(cat.id)
              return (
                <div
                  key={cat.id}
                  style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                >
                  <div style={{ ...S.listRow, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={all}
                      ref={(el) => {
                        if (el) el.indeterminate = some
                      }}
                      onChange={(e) => onToggleCategory(cat.id, files.map((f) => f.relPath), e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={S.listTitle}>
                        {t(`upload.category.${cat.id}`)}
                        <span style={{ ...S.hint, marginLeft: 8 }}>
                          {formatBytes(cat.bytes)} · {files.length}
                        </span>
                      </div>
                      <div style={S.hint}>{t(`upload.reason.${cat.id}`)}</div>
                    </div>
                    <button type="button" style={S.linkBtn} onClick={() => onToggleExpand(cat.id)}>
                      {isOpen ? t('community.publish.collapse') : t('community.publish.expand')}
                    </button>
                  </div>
                  {isOpen ? (
                    <div style={{ maxHeight: 200, overflow: 'auto', padding: '4px 12px 10px 34px' }}>
                      {files.map((f) => (
                        <label
                          key={f.relPath}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}
                        >
                          <input
                            type="checkbox"
                            checked={selection.has(f.relPath)}
                            onChange={(e) => onToggleFile(f.relPath, e.target.checked)}
                          />
                          <span style={{ ...S.mono, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.relPath}
                          </span>
                          <span style={{ ...S.hint, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                            {formatBytes(f.size)}
                            {f.size > data.plan.limits.maxFileBytes ? ` ⚠ ${t('community.publish.tooLarge')}` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {oversizeSelected.length > 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-state-warn-primary)', lineHeight: 1.6 }}>
              {t('community.publish.oversizeWarning', { count: oversizeSelected.length })}
            </div>
          ) : null}

          <div style={S.footer}>
            <span style={{ ...S.hint, marginRight: 'auto' }}>
              {t('community.publish.summary', {
                files: selectedFiles.length,
                size: formatBytes(selectedBytes),
                batches,
              })}
            </span>
            <label style={{ ...S.hint, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={remember} onChange={(e) => onRemember(e.target.checked)} />
              {t('community.publish.remember')}
            </label>
            <button type="button" style={S.ghostBtn} disabled={busy} onClick={onCancel}>
              {t('community.action.cancel')}
            </button>
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: busy ? 0.55 : 1 }}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? t('community.action.publishing') : t('community.publish.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 扣费确认对话框 —— 读取简报（1 Token）。
 *
 * ## 为什么必须有它
 *
 * 简报是这一层里**唯一"点一下就扣 Token"**的入口：点错=直接花钱，而且"读过了"
 * 无法撤销（服务器已经扣费并把第二层内容发过来了）。所以动作必须拆成两步：
 * 第一次点击只打开这个对话框，只有「确认读取」才真的发 `work/brief`。
 *
 * 费用与余额都摆在按钮上方 —— 用户按下去之前就应该知道自己按的是什么，
 * 而不是事后从回执里推断。
 */
function BriefConfirmDialog({
  t,
  title,
  balance,
  onCancel,
  onConfirm,
}: {
  t: Translate
  title: string
  balance: number | null
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <div
      style={S.overlay}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ ...S.card, width: 'min(430px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.briefConfirm.title')}
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone="brand">{t('community.briefState.cost')}</Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>{title}</div>
          <div style={S.hint}>{t('community.briefConfirm.scope')}</div>
          <div style={S.hint}>
            {t('community.briefConfirm.cost')}
            {' · '}
            {typeof balance === 'number'
              ? t('community.briefConfirm.balance', { balance })
              : t('community.briefConfirm.balanceUnknown')}
          </div>
          <div style={S.hint}>{t('community.briefConfirm.idempotent')}</div>
          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onCancel}>
              {t('community.action.cancel')}
            </button>
            <button type="button" style={S.primaryBtn} onClick={onConfirm}>
              {t('community.briefConfirm.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 接受指导的**确认对话框**。
 *
 * ⚠️ 为什么必须有它：接受会把押金从 `available` 转到 `frozen` —— 这是真正动 Token 的
 * 操作。用户规则是"所有扣费操作都要先提醒，不能点击即生效"。所以点【接受指导】只是
 * 打开这个框；点了「确认接受」才发请求。
 *
 * 框里必须说清三件事：跟谁合作（导师 + 机构）、冻多少钱（押金）、冻完还剩多少（余额）。
 */
function AcceptConfirmDialog({
  t,
  proposal,
  balance,
  onCancel,
  onConfirm,
}: {
  t: Translate
  proposal: HostProposal
  balance: number | null
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const affiliation = [proposal.mentor?.profile?.institution, proposal.mentor?.profile?.department]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      style={S.overlay}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ ...S.card, width: 'min(460px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.mentor.acceptConfirmTitle')}
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone="brand">{t('community.mentor.acceptConfirmBadge', { deposit: proposal.depositAmount })}</Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>
            {t('community.mentor.mentorIs', { name: proposal.mentor?.displayName ?? t('community.mentor.unknownParty') })}
          </div>
          {affiliation ? <div style={S.hint}>{affiliation}</div> : null}
          <div style={S.hint}>
            {t('community.mentor.feeText', {
              total: proposal.totalFee,
              deposit: proposal.depositAmount,
              success: proposal.successPaymentAmount,
            })}
          </div>
          {/* 冻结语义说清楚：钱还是研究者的，只是不可用 */}
          <div style={S.hint}>{t('community.mentor.acceptFreezeNote', { deposit: proposal.depositAmount })}</div>
          <div style={S.hint}>
            {typeof balance === 'number'
              ? t('community.mentor.acceptBalance', { balance })
              : t('community.briefConfirm.balanceUnknown')}
          </div>
          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onCancel}>
              {t('community.action.cancel')}
            </button>
            <button type="button" style={S.primaryBtn} onClick={onConfirm}>
              {t('community.mentor.acceptConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * **Token 余额环形图**（SVG，无外部库）。
 *
 * 大弧 = 可用（品牌蓝），小弧 = 冻结（灰色）。比例一眼能看懂——
 * 比三行数字传达信息更快。没有冻结时整圈都是蓝。
 *
 * ⚠️ 用 `stroke-dasharray` 控制弧长，这是 SVG 环形图的标准做法（不用 path，简单且
 * 能在纯 React 里写死）。`transform` 旋转使两段衔接无缝。
 *
 * ⚠️ SVG 内部固定 viewBox=160x160（计算简单可靠），用 CSS width/height 控制显示尺寸。
 * 不要动态改变 viewBox——这会导致渲染异常（弧形断开）。
 */
function TokenDonut({
  t,
  available,
  frozen,
  total,
  size = 100,
}: {
  t: Translate
  available: number
  frozen: number
  total: number
  size?: number
}): JSX.Element {
  const r = 64
  const cx = 80
  const cy = 80
  const circumference = 2 * Math.PI * r
  const availableFrac = total > 0 ? available / total : 1
  const frozenFrac = total > 0 ? frozen / total : 0
  const availableDash = circumference * availableFrac
  const frozenDash = circumference * frozenFrac
  // ⚠️ 绘制顺序很关键：先画**可用**（大弧，品牌蓝），再画**冻结**（小弧，灰色），
  // 否则大弧会盖住小弧的末端（两者在 SVG 里共享同一个起点）。
  const hasFrozen = frozen > 0

  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden="true">
      {/* 背景轨道（完整圆圈，淡色） */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--dsw-alias-bg-layer-2)" strokeWidth={14} />
      {/* 可用弧段（**品牌蓝** = 主色调，表示"这是你的钱"） */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--dsw-alias-state-business-primary)"
        strokeWidth={14}
        strokeLinecap="round"
        strokeDasharray={`${availableDash} ${circumference}`}
        strokeDashoffset={0}
        transform={`rotate(90 ${cx} ${cy})`}
      />
      {/* 冻结弧段（灰色 = 次要信息；画在可用之上，保证小弧可见） */}
      {hasFrozen ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--dsw-alias-label-secondary)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${frozenDash} ${circumference}`}
          strokeDashoffset={-availableDash}
          transform={`rotate(90 ${cx} ${cy})`}
        />
      ) : null}
      {/* 中间：总额 + 图例 */}
      <text
        x={cx}
        y={cy - 18}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--dsw-alias-label-primary)"
        fontSize="22"
        fontWeight="700"
        fontFamily="inherit"
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fill="var(--dsw-alias-label-secondary)"
        fontSize="10"
        fontFamily="inherit"
      >
        Token
      </text>
      {/* 图例：可用（品牌蓝） */}
      <circle cx={cx - 30} cy={cy + 14} r={4} fill="var(--dsw-alias-state-business-primary)" />
      <text
        x={cx - 22}
        y={cy + 14}
        textAnchor="start"
        dominantBaseline="central"
        fill="var(--dsw-alias-label-secondary)"
        fontSize="9"
        fontFamily="inherit"
      >
        {t('community.token.available')}
      </text>
      {/* 图例：冻结（灰色，仅当有冻结金额时显示） */}
      {hasFrozen ? (
        <>
          <circle cx={cx + 10} cy={cy + 14} r={4} fill="var(--dsw-alias-label-secondary)" />
          <text
            x={cx + 18}
            y={cy + 14}
            textAnchor="start"
            dominantBaseline="central"
            fill="var(--dsw-alias-label-secondary)"
            fontSize="9"
            fontFamily="inherit"
          >
            {t('community.token.frozen')}
          </text>
        </>
      ) : null}
    </svg>
  )
}

/**
 * **Token 余额弹窗**（点账号行的余额徽章打开，2026-09 用户要求）。
 *
 * 三件事：① 余额明细（可用 / 冻结 / 合计）；② **续费说明**（目前由管理员发放，
 * 暂未开通自助付费）；③ **申请续费** —— 往服务器写一条申请记录，管理员事后在服务器上
 * 处理（本插件不接真实付费）。
 *
 * ⚠️ **防重复申请**：服务器 `POST /tokens/recharge-requests` **不幂等**（每次调用新增一条
 * `PENDING`），所以这里在打开时读一次自己的申请记录，有 `PENDING` 就**不再给表单**
 * （显示"已申请 N Token，等待管理员处理"）。不靠按钮禁用来兜 —— 用户重开弹窗也必须挡住。
 *
 * 数量是**必填**的：服务器 `RechargeRequestCreate.amount` 是 `gt=0` 的必填字段，
 * 申请得说清要多少（这正是管理员批准时的依据）。
 */
function TokenDialog({
  t,
  tokens,
  requests,
  loading,
  amount,
  reason,
  submitting,
  error,
  receipt,
  onAmount,
  onReason,
  onApply,
  onRefresh,
  onClose,
}: {
  t: Translate
  tokens: { available: number; frozen: number; total: number } | null
  requests: HostRechargeRequest[] | null
  loading: boolean
  amount: string
  reason: string
  submitting: boolean
  error: string | null
  receipt: string | null
  onAmount: (v: string) => void
  onReason: (v: string) => void
  onApply: () => void
  onRefresh: () => void
  onClose: () => void
}): JSX.Element {
  // 还没有处理完的申请 = 不能再提交（服务器不幂等，重复提交会产生多条垃圾记录）
  const pending = (requests ?? []).find((r) => r.status === 'PENDING') ?? null
  const parsed = Number(amount)
  const amountValid = Number.isInteger(parsed) && parsed > 0
  const canApply = !pending && amountValid && !submitting && !loading

  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
      <div style={{ ...S.card, width: 'min(460px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.token.dialogTitle')}
          <span style={{ flex: '1 1 auto' }} />
          <RefreshIconButton t={t} busy={loading} onClick={onRefresh} />
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          {/* ① 左侧：环形图 + 图例（下方）；右侧：续费说明 + 申请表单 */}
          {tokens ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* 左侧：环形图 + 下方图例 */}
              <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <TokenDonut
                  t={t}
                  available={tokens.available}
                  frozen={tokens.frozen}
                  total={tokens.total}
                  size={100}
                />
              </div>
              {/* 右侧：续费说明 + 申请表单 */}
              <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* 续费说明 */}
                <div style={S.hint}>{t('community.token.renewHint')}</div>
                {/* 申请表单 */}
                {pending ? (
                  <div style={{ ...S.hint, color: 'var(--dsw-alias-state-business-primary)' }}>
                    {t('community.token.pendingLine', { amount: pending.amount })}
                  </div>
                ) : (
                  <>
                    <div style={S.inlineRow}>
                      <span style={S.label}>{t('community.token.amountLabel')}</span>
                      <input
                        style={S.compactInput}
                        type="text"
                        inputMode="numeric"
                        spellCheck={false}
                        autoComplete="off"
                        value={amount}
                        placeholder={t('community.token.amountPlaceholder')}
                        onChange={(e) => onAmount(e.target.value)}
                      />
                    </div>
                    <div style={S.inlineRow}>
                      <span style={S.label}>{t('community.token.reasonLabel')}</span>
                      <input
                        style={S.compactInput}
                        type="text"
                        spellCheck={false}
                        autoComplete="off"
                        maxLength={500}
                        value={reason}
                        placeholder={t('community.token.reasonPlaceholder')}
                        onChange={(e) => onReason(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={S.hint}>{t('community.briefConfirm.balanceUnknown')}</div>
          )}

          {/* 失败原因 / 成功回执：都在**动作发生之后**才出现 */}
          {error ? (
            <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-state-error-primary)' }}>
              {error}
            </div>
          ) : null}
          {receipt ? (
            <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-state-success-primary)' }}>
              {receipt}
            </div>
          ) : null}

          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onClose}>
              {t('community.token.close')}
            </button>
            {!pending ? (
              <button
                type="button"
                style={{ ...S.primaryBtn, opacity: canApply ? 1 : 0.55 }}
                disabled={!canApply}
                onClick={onApply}
              >
                {submitting ? t('community.token.applying') : t('community.token.apply')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 发起指导的**提案对话框**（导师视角，从【可指导】列表打开）。
 *
 * 为什么这个不用"二次确认"那一套：发起提案**不花 Token**（服务器只在接受时冻结押金），
 * 所以对话框本身就是确认 —— 填完点「发起指导」才发请求。真正花钱的是对面的【接受指导】。
 *
 * 费用三项里**成功付款是推导出来的**（`总额 − 押金`），不是独立输入框：
 * 服务器强校验 `押金 + 成功付款 == 总额`，与其让用户填出一个必然被拒的组合，
 * 不如让非法状态在界面上**无法表达**。
 */
function ProposeDialog({
  t,
  title,
  fee,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  t: Translate
  title: string
  fee: HostFeeSuggestion | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (input: {
    totalFee: number
    depositAmount: number
    successPaymentAmount: number
  }) => void
}): JSX.Element {
  const [total, setTotal] = React.useState(String(fee?.suggestedFee ?? 100))

  /**
   * 押金比例取**平台自己的建议**（`suggested_deposit / suggested_fee`），不写死 20%。
   *
   * 比例属于平台策略：抄一份常量到客户端，平台改成 15% 时这边会继续显示 20%，
   * 而且用户看到的就是假的。取不到建议时才退回文档里的默认值。
   */
  const ratio = fee && fee.suggestedFee > 0 ? fee.suggestedDeposit / fee.suggestedFee : DEFAULT_DEPOSIT_RATIO

  /** 费用建议是开框之后才到的，`useState` 初值只算一次 → 到了要同步进去（用户已改则不覆盖）。 */
  const touched = React.useRef(false)
  React.useEffect(() => {
    if (!fee || touched.current) return
    setTotal(String(fee.suggestedFee))
  }, [fee])

  const totalNum = Number.parseInt(total, 10)
  const valid = Number.isInteger(totalNum) && totalNum > 0
  // 押金由比例**推导**（用户只填总额）：界面显示的三个数就是发出去的那三个数
  const deposit = valid ? Math.max(1, Math.round(totalNum * ratio)) : 0
  const success = valid ? totalNum - deposit : 0

  /** 行内表单：本仓库的约定是 `S.inlineRow` + `S.compactInput`（不用大块表单样式）。 */
  const input = S.compactInput

  return (
    <div
      style={S.overlay}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ ...S.card, width: 'min(400px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.mentor.proposeTitle')}
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone="neutral">{t('community.mentor.proposeFree')}</Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>{title}</div>

          <div style={S.inlineRow}>
            <span style={S.label}>{t('community.mentor.feeTotal')}</span>
            <input
              style={input}
              value={total}
              inputMode="numeric"
              autoFocus
              onChange={(e) => {
                touched.current = true
                setTotal(e.target.value)
              }}
            />
          </div>
          {/* 押金比例由平台定，导师只填总额：把分账说清楚，不让他去猜 */}
          <div style={S.hint}>
            {valid
              ? t('community.mentor.feeNote', {
                  percent: Math.round(ratio * 100),
                  deposit,
                  success,
                })
              : t('community.mentor.feeInvalid')}
          </div>

          {error ? (
            <div style={{ ...S.hint, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</div>
          ) : null}

          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onCancel}>
              {t('community.action.cancel')}
            </button>
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: valid && !busy ? 1 : 0.55 }}
              disabled={!valid || busy}
              onClick={() =>
                onSubmit({
                  totalFee: totalNum,
                  depositAmount: deposit,
                  successPaymentAmount: success,
                })
              }
            >
              {busy ? t('community.action.loading') : t('community.action.propose')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 导师信息（Profile 介绍）。
 *
 * 数据来自提案响应里**内嵌的** `mentor.profile`（后端 enrich 之后才有）——
 * 为此不需要任何额外请求。导师没填过 profile 就如实说"尚未填写"，不编内容。
 *
 * 为什么学生需要它：接受指导要冻结一笔押金，决定跟谁合作之前应当能看清对方是谁。
 */
function MentorProfileDialog({
  t,
  proposal,
  onClose,
}: {
  t: Translate
  proposal: HostProposal
  onClose: () => void
}): JSX.Element {
  const profile = proposal.mentor?.profile ?? null
  const affiliation = [profile?.institution, profile?.department].filter(Boolean).join(' · ')
  /** 一行：标签 + 值（值缺失就不渲染这一行）。 */
  const line = (label: string, value: string | null | undefined): JSX.Element | null =>
    value ? (
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ ...S.label, flex: '0 0 64px' }}>{label}</span>
        <span style={{ ...S.hint, flex: '1 1 auto', minWidth: 0 }}>{value}</span>
      </div>
    ) : null

  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
      <div style={{ ...S.card, width: 'min(430px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.mentor.profileTitle')}
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone={proposalTone(proposal.status)}>
            {enumText(t, PROPOSAL_STATUS_KEYS, proposal.status)}
          </Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>
            {proposal.mentor?.displayName ?? t('community.mentor.unknownParty')}
          </div>
          {affiliation ? <div style={S.hint}>{affiliation}</div> : null}
          {profile ? (
            <>
              {line(t('community.mentor.profileBio'), profile.bio)}
              {line(t('community.mentor.profileFields'), profile.researchFields.join(' · '))}
              {line(t('community.mentor.profileInterests'), profile.researchInterests.join(' · '))}
              {line(t('community.mentor.profileExpertise'), profile.researchExpertise.join(' · '))}
            </>
          ) : (
            <div style={S.hint}>{t('community.mentor.profileEmpty')}</div>
          )}
          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onClose}>
              {t('community.action.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 去掉地址末尾的斜杠 —— 只用于**比对**（同一个域名写成带不带末尾斜杠是同一台服务器）。
 * 不做归一：归一规则归宿主（`normalizeBaseUrl`），界面不复制一份。
 */
function stripSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * 下载 ZIP 的**兜底文件名前缀**：`<项目所有者>-<项目标题>`，与服务器命名
 * `<owner>-<title>.zip` 对齐。
 *
 * ⚠️ 只在服务器没回 `Content-Disposition` 时才用到；真名一律以服务器给的为准
 * （客户端不自造命名规则）。宿主的 `safeDirName` 还会再做一次安全化。
 */
function downloadPrefix(p: HostProposal): string {
  const owner = p.researcher?.displayName ?? p.mentor?.displayName ?? ''
  const parts = [owner, p.projectTitle ?? ''].filter((s) => s.trim() !== '')
  return parts.join('-')
}

/**
 * 【下载】：下载到**用户选的 DSH 工作区**（2026-09 用户要求）。
 *
 * 不用浏览器的默认下载，也不需要输地址：列出宿主注册表里的工作区，点一个就行。
 *
 * **只存 ZIP，不解压**（2026-09 用户拍板）：所以没有 scope、没有"这个工作区里有没有
 * 研究"的拦截 —— 同名不覆盖（宿主自动加序号），任何工作区都能选。
 */
function DownloadDialog({
  t,
  proposal,
  fileName,
  workspaces,
  workspacesAvailable,
  workspacesReason,
  selection,
  files,
  bytes,
  busy,
  notice,
  onSelect,
  onDownload,
  onClose,
}: {
  t: Translate
  proposal: HostProposal
  /** 预计保存成的文件名（服务器命名 `<owner>-<title>.zip`；实际以响应头为准）。 */
  fileName: string
  workspaces: Array<{ id: string; title: string; path: string }> | null
  workspacesAvailable: boolean
  workspacesReason: string | null
  selection: string
  files: number | null
  bytes: number | null
  busy: boolean
  notice: { tone: 'success' | 'error'; text: string } | null
  onSelect: (id: string) => void
  onDownload: () => void
  onClose: () => void
}): JSX.Element {
  /*
   * **每个工作区都可以选**：下载只是把 ZIP 存进工作区，同名不覆盖（自动加序号），
   * 所选工作区里原有的东西一个都不动 —— 所以"已有研究项目就禁用"既没必要也挡路。
   */
  const chosen = workspaces?.find((w) => w.id === selection)
  const dest = chosen ? `${chosen.path}/${fileName}` : ''
  const ready = Boolean(selection) && files !== null && files > 0 && !busy
  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
      <div style={{ ...S.card, width: 'min(520px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.exchange.downloadTitle')}
          <span style={{ flex: '1 1 auto' }} />
          {files === null ? null : (
            <Badge tone="neutral">{t('community.exchange.sizeBadge', { files, size: formatBytes(bytes ?? 0) })}</Badge>
          )}
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>
            {proposal.projectTitle ?? t('community.mentor.untitledProject')}
          </div>
          {/* 只存 ZIP、其余交给用户：说清楚，免得以为会自动解压 */}
          <div style={S.hint}>{t('community.exchange.zipOnly')}</div>

          {!workspacesAvailable ? (
            <div style={S.hint}>{workspacesReason ?? t('community.exchange.noWorkspaces')}</div>
          ) : workspaces === null ? (
            <div style={S.hint}>{t('community.action.loading')}</div>
          ) : workspaces.length === 0 ? (
            <div style={S.hint}>{t('community.exchange.noWorkspaces')}</div>
          ) : (
            <div style={{ ...S.list, maxHeight: 240, overflowY: 'auto' }}>
              {workspaces.map((w, i) => (
                <label
                  key={w.id}
                  style={{
                    ...S.listRow,
                    alignItems: 'center',
                    cursor: 'pointer',
                    ...(i === 0 ? {} : { borderTop: '1px solid var(--dsw-alias-border-l1)' }),
                  }}
                >
                  <input
                    type="radio"
                    name="cf-download-workspace"
                    checked={selection === w.id}
                    onChange={() => onSelect(w.id)}
                  />
                  <span style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={S.listTitle}>{w.title}</span>
                    <span style={{ ...S.hint, wordBreak: 'break-all' }}>{w.path}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* 写到哪里要看得见（用户可以选任何工作区，那就更该知道落点在哪） */}
          {dest ? (
            <div style={{ ...S.hint, wordBreak: 'break-all' }}>
              {t('community.exchange.destHint', { dest })}
            </div>
          ) : null}
          {notice ? (
            <div
              style={{
                ...S.hint,
                color:
                  notice.tone === 'success'
                    ? 'var(--dsw-alias-label-secondary)'
                    : 'var(--dsw-alias-state-error-primary)',
              }}
            >
              {notice.text}
            </div>
          ) : null}
          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onClose}>
              {t('community.action.close')}
            </button>
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: ready ? 1 : 0.55 }}
              disabled={!ready}
              onClick={onDownload}
            >
              {busy ? t('community.action.loading') : t('community.action.download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 【上传】：把本地 `workspace/review/` 下的指导结果**按原相对路径**回传。
 *
 * 为什么是"选目录 + 扫描"而不是"选文件"：
 *   - 服务器要求 `relative_paths` 保留目录层次（`review/figures/x.png`），
 *     浏览器文件选择器拿不到相对路径；
 *   - 走宿主读盘还能绕开 RPC 的请求体上限（原来是 base64 传字节，4MB 就打住了）。
 *
 * 服务器只允许关系方写 `review/**`：越界会得到 `403 FILE_PATH_RESERVED`
 * → 界面说"导师只能写 review/"，**不是**"没权限"。
 */
function UploadDialog({
  t,
  proposal,
  dir,
  pickerSupported,
  files,
  selected,
  busy,
  notice,
  onDirChange,
  onChooseDir,
  onScan,
  onToggle,
  onUpload,
  onClose,
}: {
  t: Translate
  proposal: HostProposal
  dir: string
  pickerSupported: boolean
  files: Array<{ relPath: string; size: number }> | null
  selected: Set<string>
  busy: boolean
  notice: { tone: 'success' | 'error'; text: string } | null
  onDirChange: (next: string) => void
  onChooseDir: () => void
  onScan: () => void
  onToggle: (relPath: string) => void
  onUpload: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
      <div style={{ ...S.card, width: 'min(500px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.exchange.uploadTitle')}
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone="neutral">{t('community.mentor.status.ACCEPTED')}</Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>
            {proposal.projectTitle ?? t('community.mentor.untitledProject')}
          </div>
          <div style={S.inlineRow}>
            <span style={S.label}>{t('community.exchange.dirLabel')}</span>
            <input
              style={S.compactInput}
              value={dir}
              placeholder={t('community.exchange.dirPlaceholder')}
              onChange={(e) => onDirChange(e.target.value)}
            />
            {pickerSupported ? (
              <button type="button" style={S.ghostBtn} onClick={onChooseDir}>
                {t('community.action.chooseDir')}
              </button>
            ) : null}
            <button
              type="button"
              style={S.ghostBtn}
              disabled={!dir.trim() || busy}
              onClick={onScan}
            >
              {t('community.action.scan')}
            </button>
          </div>
          {/* 没有系统选择器就明说，别让用户以为是自己没点到 */}
          {pickerSupported ? null : <div style={S.hint}>{t('community.exchange.noPicker')}</div>}
          <div style={S.hint}>{t('community.exchange.uploadNote')}</div>

          {files === null ? (
            <div style={S.hint}>{t('community.exchange.notScanned')}</div>
          ) : files.length === 0 ? (
            <div style={S.hint}>{t('community.exchange.noReviewFiles')}</div>
          ) : (
            <div style={{ ...S.list, maxHeight: 220, overflowY: 'auto' }}>
              {files.map((f) => (
                <label
                  key={f.relPath}
                  style={{ ...S.listRow, cursor: 'pointer', alignItems: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(f.relPath)}
                    onChange={() => onToggle(f.relPath)}
                  />
                  <span style={{ ...S.hint, flex: '1 1 auto', minWidth: 0 }}>{f.relPath}</span>
                  <span style={S.hint}>{formatBytes(f.size)}</span>
                </label>
              ))}
            </div>
          )}

          {notice ? (
            <div
              style={{
                ...S.hint,
                color:
                  notice.tone === 'success'
                    ? 'var(--dsw-alias-label-secondary)'
                    : 'var(--dsw-alias-state-error-primary)',
              }}
            >
              {notice.text}
            </div>
          ) : null}
          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onClose}>
              {t('community.action.close')}
            </button>
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: selected.size && !busy ? 1 : 0.55 }}
              disabled={selected.size === 0 || busy}
              onClick={onUpload}
            >
              {busy ? t('community.action.loading') : t('community.action.upload')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * **刷新图标按钮**（账号行 + 研究工作三个 Tab 共用）。
 *
 * 抽出来的理由：这段本来抄了四遍（我的 / 可指导 / 指导中 / 账号），只有 loading 与
 * 回调不同；四份"刷新"文案各改一次是迟早写歪的写法。
 *
 * 图标化后**忙碌状态靠 `title` 传达**（"读取中…"），再加上变灰与禁用 ——
 * 没有可见文案时，这三样是用户唯一能得到的反馈。
 */
function RefreshIconButton({
  t,
  busy,
  onClick,
}: {
  t: Translate
  busy: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      style={{ ...S.iconBtn, flex: '0 0 auto', opacity: busy ? 0.55 : 1 }}
      disabled={busy}
      title={busy ? t('community.action.loading') : t('community.action.refresh')}
      aria-label={t('community.action.refresh')}
      onClick={onClick}
    >
      ↻
    </button>
  )
}

/**
 * 三个**服务器侧图标**：开发（显示器）、互联网（地球）、邀请码（票券）。
 *
 * 之前用 `⌂` / `☁` 这类 Unicode 符号，跨平台渲染不一致、表意也不够直白；
 * 换成内联 SVG（`currentColor`，与官方 outline 图标同规格），三个图标一眼可辨。
 */
function DevServerGlyph(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="8.25" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 11v2.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.25 13.75h5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function InternetGlyph(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.75 8h12.5" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="3.1" ry="6.25" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function InviteCodeGlyph(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.75" width="12" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.25 3.75v8.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.5 1.4" />
    </svg>
  )
}

/**
 * 服务器地址框右边的**快捷切换**按钮（一个开发、一个互联网）。
 *
 * 图标式（26×26，与刷新按钮同规格）的理由：地址框本身就要占掉大半行，两个文字按钮会把
 * 这一行挤成两行（2026-09 用户要求："用图标式按钮就行，节省空间"）。
 * 代价是失去可见文案 → `title` + `aria-label` 是**必须**的，且 `title` 里带上完整地址与
 * 探测结果（不用点开试、也不用猜为什么没变绿）。
 *
 * 配色就是**探测结果**（2026-09 用户要求："绿色表示成功，原始颜色为不成功"）：
 * 通了 = 绿；没通 = 原色；正在测 = 变灰（有反馈，否则用户会连点）。
 * 只有**还没测过**的按钮才用品牌色标出"当前生效的是这一边"——测过之后由结果说话，
 * 免得"绿"和"高亮"两个信号互相抵消。
 */
function ServerPresetButton({
  t,
  icon,
  label,
  url,
  result,
  active,
  onPick,
}: {
  t: Translate
  icon: React.ReactNode
  label: string
  url: string
  result: { state: 'idle' | 'busy' | 'ok' | 'fail'; reason: string | null }
  active: boolean
  onPick: (url: string) => void
}): JSX.Element {
  const status =
    result.state === 'busy'
      ? t('community.server.probing')
      : result.state === 'ok'
        ? t('community.server.probeOk')
        : result.state === 'fail'
          ? t('community.server.probeFail')
          : ''
  const title = [label, status, result.reason ?? '', url].filter((s) => s !== '').join(' · ')
  /**
   * 配色只在这一处决定（顺序即优先级）：通了绿 → 没通原色 → 正在测变灰 →
   * 还没测过则用品牌色标出"当前生效的是这一边"。
   */
  const skin: React.CSSProperties =
    result.state === 'busy'
      ? { opacity: 0.55 }
      : result.state === 'ok'
        ? S.iconBtnOk
        : result.state === 'fail'
          ? S.iconBtn
          : active
            ? S.iconBtnActive
            : S.iconBtn
  return (
    <button
      type="button"
      style={{ ...S.iconBtn, flex: '0 0 auto', ...skin }}
      title={title}
      aria-label={label}
      onClick={() => onPick(url)}
    >
      {icon}
    </button>
  )
}

function CommunityTab({
  send,
  initial,
  t,
}: {
  send: SettingsSend
  initial: HostAccountState | null
  t: Translate
}): JSX.Element {
  const [state, setState] = React.useState<HostAccountState | null>(initial)
  const [phase, setPhase] = React.useState<'loading' | 'ready'>('loading')
  const [busy, setBusy] = React.useState(false)
  /** 正在单独刷新 Token 余额。 */
  const [refreshingBalance, setRefreshingBalance] = React.useState(false)

  /* ── Token 余额弹窗（点余额徽章打开）+ 续费申请 ─────────────────────────
   *
   * 弹窗打开时读一次自己的续费记录：有 `PENDING` 就不给表单 —— 服务器 `submit`
   * **不幂等**（每次 POST 新增一条），防重复只能靠"先看再决定要不要给入口"。
   */
  const [tokenDialog, setTokenDialog] = React.useState(false)
  const [rechargeRequests, setRechargeRequests] = React.useState<HostRechargeRequest[] | null>(null)
  const [rechargeLoading, setRechargeLoading] = React.useState(false)
  const [rechargeAmount, setRechargeAmount] = React.useState('')
  const [rechargeReason, setRechargeReason] = React.useState('')
  const [rechargeSubmitting, setRechargeSubmitting] = React.useState(false)
  const [rechargeError, setRechargeError] = React.useState<string | null>(null)
  const [rechargeReceipt, setRechargeReceipt] = React.useState<string | null>(null)
  /** 最近一次账号类失败（登录 / 注册 / 验证）。宿主已经把它翻成可读中文。 */
  const [failure, setFailure] = React.useState<{ code: string; message: string } | null>(null)

  /** 用户信息区的内部 Tab：账号（登录 / 已登录）与服务器设置。 */
  const [userTab, setUserTab] = React.useState<'account' | 'server'>('account')
  const [serverDraft, setServerDraft] = React.useState(initial?.serverUrl ?? '')
  /**
   * 两个服务器快捷按钮的**连通性探测结果**（按环境记）。
   *
   * 为什么要有它：用户点了"切到某一台"之后，最想知道的是"这台通不通"。颜色就是答案
   * （2026-09 用户要求：绿色 = 成功，原色 = 不成功），失败原因收进悬浮提示。
   */
  const [serverProbes, setServerProbes] = React.useState<
    Partial<Record<'development' | 'production', { state: 'idle' | 'busy' | 'ok' | 'fail'; reason: string | null }>>
  >({})
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
  const [workTab, setWorkTab] = React.useState<'mine' | 'mentor' | 'mentorship'>('mine')
  /** 本机研究项目（不联网、不需要登录）。 */
  const [mine, setMine] = React.useState<HostLocalWork[] | null>(null)
  const [mineLoading, setMineLoading] = React.useState(false)
  /** 「我的」读不到时的原因（**绝不能**把它显示成"没有研究项目"）。 */
  const [mineError, setMineError] = React.useState<{ code: string; message: string } | null>(null)
  /** 工作区注册表是否可用（不可用 = 读不到，而不是没有）。 */
  const [mineRegistry, setMineRegistry] = React.useState<{ available: boolean; reason?: string } | null>(null)
  /** 正在发布的那一项（本机工作区 id）。 */
  const [publishing, setPublishing] = React.useState<string | null>(null)
  /** 发布结果 / 失败（只在业务发生时出现）。 */
  const [publishNotice, setPublishNotice] = React.useState<
    { tone: 'success' | 'error'; code?: string; text: string; missing?: string[] } | null
  >(null)
  /** 发布确认对话框（点「寻找指导」/「更新」时打开）。 */
  const [dialog, setDialog] = React.useState<{
    work: HostLocalWork
    data: HostUploadPlan
    selection: Set<string>
    remember: boolean
    expanded: Set<string>
  } | null>(null)
  const [dialogLoading, setDialogLoading] = React.useState<string | null>(null)
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
   * 待确认的**扣费**操作：读取简报（1 Token）。
   *
   * ⚠️ 非空 = 确认对话框开着，此时**还没有**发出任何请求、也**没有**扣费。
   * 不设这个中间态的话，"点一下简报"就直接花钱了（2026-09 用户要求：
   * 扣费操作不能点击即生效）。
   */
  const [briefConfirm, setBriefConfirm] = React.useState<HostWork | null>(null)
  /**
   * 简报的**幂等键**（每项研究工作一个"查看意图"）。
   *
   * ⚠️ 402（Token 不足）之后用户拿到 Token 再点，必须复用同一个 key —— 服务端据此回放，
   * 不会重复扣费；换成新 key 就会再扣一次（`INTEGRATION.md` §8 的硬要求）。
   */
  const [intents, setIntents] = React.useState<Record<string, string>>({})

  /* ── 指导关系（第三个 Tab「指导中」）───────────────────────────────── */
  /**
   * 我涉及的指导提案（我发起的 + 我收到的）。
   *
   * `null` = 还没读过（不是"没有"）—— 同 `mine` / `works` 的纪律：
   * 拿不到就如实说拿不到，不能显示成"没有指导关系"。
   */
  const [proposals, setProposals] = React.useState<HostProposal[] | null>(null)
  const [proposalsLoading, setProposalsLoading] = React.useState(false)
  const [proposalsError, setProposalsError] = React.useState<{ code: string; message: string } | null>(null)
  /** 指导关系区的业务回执（接受成功 / 拒绝成功 / 失败原因），只在业务发生时出现。 */
  const [mentorNotice, setMentorNotice] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  /** 正在接受 / 拒绝的提案 id（按钮转圈用）。 */
  const [mentorBusy, setMentorBusy] = React.useState<{ id: string; action: 'accept' | 'reject' } | null>(null)
  /**
   * 待确认的**接受指导**。
   *
   * ⚠️ 非空 = 确认对话框开着，此时**没有**发出请求、也**没有**冻结任何 Token。
   * 接受会冻结押金（available → frozen），属于"花钱类"操作，不能点击即生效
   * （2026-09 用户规则：所有扣费操作都要先提醒）。
   */
  const [acceptConfirm, setAcceptConfirm] = React.useState<HostProposal | null>(null)
  /**
   * 接受指导的**幂等键**（每条提案一个"接受意图"）。
   *
   * ⚠️ 402（押金不足）之后拿到 Token 再点，必须复用同一个 key —— 服务端据此回放，
   * 不会重复冻结押金（同简报 `intents` 的道理）。
   */
  const [acceptIntents, setAcceptIntents] = React.useState<Record<string, string>>({})

  /* ── 发起指导（导师视角，从【可指导】列表打开）────────────────────── */
  /**
   * 本会话内**已经读过详情**的项目 id。
   *
   * 用途：【发起指导】只在读过详情之后出现 —— 业务上不允许"没看内容就发指导申请"
   * （设计文档 §18：Mentor 阅读 Brief 后如果愿意指导，才发起）。
   *
   * ⚠️ 它只覆盖**本会话**；跨会话由 `briefFree(w)` 兜底：`brief_paid`/本地记忆为真
   * 说明这个 viewer 早就买过这一项的详情 —— 那时候把按钮收回去反而变成 bug
   * （付过费、读过，一刷新按钮没了）。
   */
  const [detailRead, setDetailRead] = React.useState<Set<string>>(new Set())
  /**
   * Split Button 的**下拉展开态**（当前只有【拒绝】一项）。
   *
   * 存按钮的 `getBoundingClientRect()` 是因为菜单用 `position: fixed` 渲染 ——
   * 见行内注释：外层卡片 `overflow: hidden`，absolute 会被裁掉。
   */
  const [menuFor, setMenuFor] = React.useState<{
    id: string
    proposal: HostProposal
    x: number
    y: number
  } | null>(null)
  /**
   * 文件交换对话框（指导关系建立之后才有）：下载对方的工作区快照 / 上传指导结果。
   * 非空 = 对话框开着。
   */
  const [exchange, setExchange] = React.useState<{
    proposal: HostProposal
    mode: 'upload'
  } | null>(null)
  /** 【下载】对话框：目标工作区列表 + 选择 + 预检结果。 */
  const [download, setDownload] = React.useState<{
    proposal: HostProposal
    workspaces: Array<{ id: string; title: string; path: string }> | null
    available: boolean
    reason: string | null
    selection: string
    files: number | null
    bytes: number | null
    /** 预计/实际保存成的文件名（服务器命名，落盘后由宿主回报真名）。 */
    fileName: string
    notice: { tone: 'success' | 'error'; text: string } | null
  } | null>(null)
  const [downloadBusy, setDownloadBusy] = React.useState(false)
  /** 上传对话框里的工作区目录（导师解压快照后写指导意见的地方）。 */
  const [uploadDir, setUploadDir] = React.useState('')
  /** 当前环境有没有可用的**系统**目录选择器（没有就只给手填输入框）。 */
  const [pickerSupported, setPickerSupported] = React.useState(false)
  const [exchangeBusy, setExchangeBusy] = React.useState(false)
  const [exchangeNotice, setExchangeNotice] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  /** 扫描到的 `review/` 文件（null = 还没扫描过，与"扫到 0 个"不同）。 */
  const [reviewFiles, setReviewFiles] = React.useState<Array<{ relPath: string; size: number }> | null>(null)
  /** 勾选要上传的 review 文件（按相对路径）。 */
  const [reviewSelected, setReviewSelected] = React.useState<Set<string>>(new Set())
  /** 正在查看导师信息的提案（非空 = 导师信息对话框开着）。 */
  const [profileTarget, setProfileTarget] = React.useState<HostProposal | null>(null)
  /** 正在对它发起指导的那项研究工作（非空 = 提案对话框开着）。 */
  const [proposeTarget, setProposeTarget] = React.useState<HostWork | null>(null)
  /** 提案对话框里的费用预填（默认 100 / 20 / 80）。 */
  const [proposeFee, setProposeFee] = React.useState<HostFeeSuggestion | null>(null)
  const [proposeBusy, setProposeBusy] = React.useState(false)
  const [proposeError, setProposeError] = React.useState<string | null>(null)

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
            error: { code: res?.error?.code ?? 'unknown', message: res?.error?.message ?? t('community.error.unknown') },
          }
        }
        return { ok: true, value: res.value }
      } catch (e) {
        return {
          ok: false,
          error: {
            code: 'transport',
            message: t('community.error.transport', {
              route: SETTINGS_ROUTE_PREFIX,
              detail: e instanceof Error ? e.message : String(e),
            }),
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
        setFailure(res.error ?? { code: 'unknown', message: t('community.error.unknown') })
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
            message: res?.error?.message ?? t('community.error.readAccount'),
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
          message: t('community.error.readAccountDetail', {
            detail: e instanceof Error ? e.message : String(e),
          }),
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
   * **生效的服务器地址**（宿主解析后的那个）—— "这些数据该问哪台服务器"的唯一判据。
   *
   * ⚠️ 用它而不是账号判断"换服务器了"：① 没登录时【我的】也要重读（它不依赖登录）；
   * ② 两台服务器上都有账号时，账号对象看起来可能差不多，地址才是可靠信号。
   */
  const activeServer = state?.serverUrl ?? ''
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
      setWorksError(res.error ?? { code: 'unknown', message: t('community.error.readWorkList') })
      setWorks(null)
      return
    }
    setWorks((res.value as { items: HostWork[] }).items ?? [])
    // 顺带刷新"我发起的提案"：【可指导】每行要靠它显示「等待响应」角标，
    // 而提案状态只有 `mentor/list` 知道 —— 不刷新的话角标一刷新页面就丢。
    // 失败**不清空**已有提案（拿不到 ≠ 没发起过）。
    const mine = await post('mentor/list', {})
    if (mine.ok) setProposals((mine.value as { proposals: HostProposal[] }).proposals ?? [])
  }, [post])

  /* ── 指导关系（第三个 Tab）──────────────────────────────────────────── */

  /**
   * 读我涉及的指导提案（`mentor/list`：我发起的 + 我收到的）。
   *
   * ⚠️ 读失败**不能**显示成"没有指导关系" —— 同 `loadMine` 的纪律。
   * 旧宿主没有这个端点时明说"需重启"。
   */
  const loadProposals = React.useCallback(async (): Promise<void> => {
    setProposalsLoading(true)
    setProposalsError(null)
    const res = await post('mentor/list', {})
    setProposalsLoading(false)
    if (!res.ok) {
      setProposals(null)
      setProposalsError(
        res.error?.code === 'unknown-endpoint'
          ? { code: 'host-restart', message: t('community.error.hostRestart') }
          : (res.error ?? { code: 'unknown', message: t('community.error.readMentor') }),
      )
      return
    }
    setProposals((res.value as { proposals: HostProposal[] }).proposals ?? [])
  }, [post])

  /**
   * 点【接受指导】= 打开**确认框**（不直接发请求）。
   *
   * 接受会把押金从 `available` 转到 `frozen` —— 是真正动 Token 的操作，
   * 所以必须先让用户看清"冻多少、还剩多少"再确认。
   */
  const requestAccept = (p: HostProposal): void => {
    setMentorNotice(null)
    setAcceptConfirm(p)
  }

  /** 确认接受：发 `mentor/accept`（带幂等键），成功后刷新提案与余额。 */
  const confirmAccept = async (): Promise<void> => {
    const target = acceptConfirm
    if (!target) return
    // 幂等键：同一次"接受意图"复用（402 后充值再试不重复冻结押金）
    const intentKey = acceptIntents[target.id] ?? crypto.randomUUID()
    setAcceptIntents((prev) => ({ ...prev, [target.id]: intentKey }))
    setMentorBusy({ id: target.id, action: 'accept' })
    const res = await post('mentor/accept', { proposalId: target.id, intentKey })
    setMentorBusy(null)
    setAcceptConfirm(null)
    if (!res.ok) {
      // 押金不足是可预期的业务失败：说清"差多少"，不要只说"失败了"
      setMentorNotice({
        tone: 'error',
        text:
          res.error?.code === 'insufficient-tokens'
            ? t('community.mentor.acceptNoTokens', { deposit: target.depositAmount })
            : (res.error?.message ?? t('community.error.unknown')),
      })
      // 提案状态在操作期间变了（别人已处理 / 已过期 / 项目已有关系）→ 列表刷新一下，
      // 否则界面还停在一条已经不能接受的提案上，点几次都是同一个错。
      if (res.error?.code === 'proposal-state') await loadProposals()
      return
    }
    setMentorNotice({
      tone: 'success',
      text: t('community.mentor.acceptDone', { deposit: target.depositAmount }),
    })
    // 提案状态已变（ACCEPTED），押金也冻结了 —— 两处都得刷新
    await Promise.all([loadProposals(), refreshBalance()])
  }

  /** 拒绝指导（研究者）。不冻 Token，但会终止导师的这次提议，直接执行并给回执。 */
  const rejectProposal = async (p: HostProposal): Promise<void> => {
    setMentorNotice(null)
    setMentorBusy({ id: p.id, action: 'reject' })
    const res = await post('mentor/reject', { proposalId: p.id })
    setMentorBusy(null)
    if (!res.ok) {
      setMentorNotice({ tone: 'error', text: res.error?.message ?? t('community.error.unknown') })
      return
    }
    setMentorNotice({ tone: 'success', text: t('community.mentor.rejectDone') })
    await loadProposals()
  }

  /**
   * 点【发起指导】= 打开提案对话框（免费操作，对话框即确认）。
   *
   * 费用建议**当场取**而不是预先缓存：默认值属于服务器策略（将来可能按领域/阶段浮动），
   * 抄一份到客户端只会在两边悄悄漂移。取不到就退回对话框里的内置默认值，不拦着用户。
   */
  const openPropose = async (w: HostWork): Promise<void> => {
    setProposeError(null)
    setProposeFee(null)
    setProposeTarget(w)
    const res = await post('mentor/fee-suggestion', {})
    if (res.ok) setProposeFee((res.value as { suggestion: HostFeeSuggestion }).suggestion ?? null)
  }

  /** 提交提案：成功 → 关框、给回执、刷新提案（该行立刻显示「等待响应」角标）。 */
  const submitPropose = async (input: {
    totalFee: number
    depositAmount: number
    successPaymentAmount: number
  }): Promise<void> => {
    const target = proposeTarget
    if (!target) return
    setProposeBusy(true)
    setProposeError(null)
    // 导师只定总费用；指导范围与成功条件见 PROPOSE_SCOPE_PLACEHOLDER 的说明（过渡值）
    const res = await post('mentor/propose', {
      projectId: target.projectId,
      guidanceScope: PROPOSE_SCOPE_PLACEHOLDER,
      successCondition: { type: PROPOSE_DEFAULT_CONDITION, description: null },
      ...input,
    })
    setProposeBusy(false)
    if (!res.ok) {
      // 不关对话框：用户填的内容要留着改（重复提案 409 是唯一常见的可预期失败）
      setProposeError(res.error?.message ?? t('community.error.unknown'))
      return
    }
    setProposeTarget(null)
    setMentorNotice({ tone: 'success', text: t('community.mentor.proposeDone') })
    await loadProposals()
  }

  /* ── 指导闭环：下载工作区快照 / 上传指导结果 ───────────────────────── */

  const openExchange = async (p: HostProposal): Promise<void> => {
    setExchangeNotice(null)
    setReviewFiles(null)
    setReviewSelected(new Set())
    setExchange({ proposal: p, mode: 'upload' })
    // 先只问能力（不开窗）：决定要不要显示【选择目录…】
    const res = await post('mentor/pickDirectory', { probe: true })
    setPickerSupported(res.ok && Boolean((res.value as { supported?: boolean } | undefined)?.supported))
  }

  /**
   * 点【下载】：让用户**选一个 DSH 工作区**，把 ZIP 存进去（2026-09 用户要求）。
   *
   * 不用浏览器默认下载（页面拿不到保存位置），也不要求输地址 —— 工作区列表来自宿主
   * 注册表。**只存 ZIP，不解压**：其余交给用户处理，因此任何工作区都能选
   * （同名不覆盖，会加序号）。
   */
  const requestDownload = async (p: HostProposal): Promise<void> => {
    const prefix = downloadPrefix(p)
    const res = await post('mentor/downloadState', { projectId: p.projectId, prefix })
    if (!res.ok) {
      setMentorNotice({ tone: 'error', text: res.error?.message ?? t('community.error.unknown') })
      return
    }
    const v = res.value as {
      files: number
      bytes: number
      available: boolean
      reason: string | null
      expectedName: string
      items: Array<{ id: string; title: string; path: string }>
    }
    // 预选：优先这项工作**所在的工作区**（学生侧指导意见该落回那里），否则第一个
    const own = v.items.find((w) =>
      (mine ?? []).some((m) => m.id === w.id && m.published?.projectId === p.projectId),
    )
    setDownload({
      proposal: p,
      workspaces: v.items,
      available: v.available,
      reason: v.reason,
      selection: (own ?? v.items[0])?.id ?? '',
      files: v.files,
      bytes: v.bytes,
      fileName: v.expectedName,
      notice: null,
    })
  }

  const runDownload = async (): Promise<void> => {
    const target = download
    if (!target || !target.selection) return
    setDownloadBusy(true)
    setDownload((prev) => (prev ? { ...prev, notice: null } : prev))
    const res = await post('mentor/download', {
      projectId: target.proposal.projectId,
      workspaceId: target.selection,
      prefix: downloadPrefix(target.proposal),
    })
    setDownloadBusy(false)
    if (!res.ok) {
      setDownload((prev) =>
        prev
          ? { ...prev, notice: { tone: 'error', text: res.error?.message ?? t('community.error.unknown') } }
          : prev,
      )
      return
    }
    const v = res.value as { dir: string; path: string; name: string; bytes: number }
    /*
     * 成功就**关窗**（2026-09 用户要求）：文件已经落盘，对话框再留着没有任何可做的事，
     * 只剩一个"已保存"的提示——那放到列表页顶部那条回执里说（和其它业务回执同一处）。
     */
    setDownload(null)
    setMentorNotice({
      tone: 'success',
      text: t('community.exchange.downloadDone', { dir: v.dir, name: v.name }),
    })
  }

  /** 对话框里的【选择目录…】（只有非 native 环境才会走到这里）。 */
  const chooseDir = async (): Promise<void> => {
    const res = await post('mentor/pickDirectory', {})
    if (!res.ok) {
      setExchangeNotice({ tone: 'error', text: res.error?.message ?? t('community.error.unknown') })
      return
    }
    const v = res.value as { supported?: boolean; path?: string | null }
    if (!v.supported) {
      setPickerSupported(false)
      return
    }
    // path 为 null = 用户取消（**不是错误**）：什么都不做，别弹提示
    if (v.path) setUploadDir(v.path)
  }

  /** 扫描所选工作区里的 `review/`（上传源）。 */
  const scanReview = async (): Promise<void> => {
    setExchangeNotice(null)
    setReviewFiles(null)
    setReviewSelected(new Set())
    const res = await post('mentor/scanReview', { dir: uploadDir.trim() })
    if (!res.ok) {
      setExchangeNotice({ tone: 'error', text: res.error?.message ?? t('community.error.unknown') })
      return
    }
    const v = res.value as { files?: Array<{ relPath: string; size: number }> }
    const files = v.files ?? []
    setReviewFiles(files)
    // 默认全选：导师刚写完的指导意见，通常就是要全传上去
    setReviewSelected(new Set(files.map((f) => f.relPath)))
  }

  const toggleReview = (relPath: string): void => {
    setReviewSelected((prev) => {
      const next = new Set(prev)
      if (next.has(relPath)) next.delete(relPath)
      else next.add(relPath)
      return next
    })
  }

  const runUpload = async (): Promise<void> => {
    const target = exchange?.proposal
    if (!target) return
    setExchangeBusy(true)
    setExchangeNotice(null)
    const res = await post('mentor/upload', {
      projectId: target.projectId,
      dir: uploadDir.trim(),
      paths: Array.from(reviewSelected),
    })
    setExchangeBusy(false)
    if (!res.ok) {
      setExchangeNotice({ tone: 'error', text: res.error?.message ?? t('community.error.unknown') })
      return
    }
    const v = res.value as { uploaded?: unknown[] }
    setReviewFiles(null)
    setReviewSelected(new Set())
    setExchangeNotice({
      tone: 'success',
      text: t('community.exchange.uploadDone', { count: v.uploaded?.length ?? 0 }),
    })
  }

  /* ── 列表加载：**只有登录后才联网**；未登录显示示例数据 ─────────────── */
  /* ── 指导关系（第三个 Tab）──────────────────────────────────────────── */

  /**
   * 读我涉及的指导提案（`mentor/list`：我发起的 + 我收到的）。
   *
   * ⚠️ 读失败**不能**显示成"没有指导关系" —— 同 `loadMine` 的纪律。
   * 旧宿主没有这个端点时明说"需重启"。
   */


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
          ? { code: 'host-restart', message: t('community.error.hostRestart') }
          : (res.error ?? { code: 'unknown', message: t('community.error.readMine') }),
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

  /**
   * **换服务器 → 以服务器为准的数据全部重读**（2026-09 用户报的问题）。
   *
   * 【我的】/【可指导】/【指导中】的内容都有一半来自服务器（"已在网络中"的发布状态、
   * 公开研究工作、指导提案）。这些 effect 早先只在挂载时跑一次，于是切到另一台服务器后
   * 界面还显示上一台的数据 —— 用户看到的和实际连的**不是同一台服务器**。
   *
   * 依赖里放**生效地址**：宿主一旦把归一后的新地址写回来，这里就重读。
   */
  React.useEffect(() => {
    if (!activeServer) return
    // 【我的】不依赖登录（本机项目 + 服务器给的"已在网络中"），所以不按 configured 拦
    void loadMine()
  }, [activeServer, loadMine])

  /**
   * 【指导中】：服务器上的指导提案。
   *
   * 未登录时**清空**而不是留着 —— 那些提案属于上一台服务器，留着就是"显示别的服务器的
   * 数据"。也不调 `loadProposals`（它会因为 not-configured 报错，把"没登录"渲染成故障）。
   */
  React.useEffect(() => {
    if (!activeServer || !configured) {
      setProposals(null)
      setProposalsError(null)
      return
    }
    void loadProposals()
  }, [activeServer, configured, loadProposals])

  /**
   * 点「寻找指导」/「更新」：**先取上传计划**，再决定是直接更新还是弹对话框。
   *
   * - 从未发布过 → 一定弹（用户要看到"传什么、多少、花几个 Token"）；
   * - 已发布且**没有变化** → 直接更新（配置被记住时），只给一条回执；
   * - 已发布但**有变化** → 弹，并标出本次会更新哪些文件。
   */
  const openPublish = async (w: HostLocalWork): Promise<void> => {
    setDialogLoading(w.id)
    setPublishNotice(null)
    const res = await post('work/uploadPlan', { id: w.id })
    setDialogLoading(null)
    if (!res.ok) {
      const staleHost = res.error?.code === 'unknown-endpoint'
      setPublishNotice({
        tone: 'error',
        code: staleHost ? 'host-restart' : (res.error?.code ?? 'unknown'),
        text: staleHost ? t('community.error.hostRestart') : (res.error?.message ?? t('community.error.publish')),
      })
      return
    }
    const data = res.value as HostUploadPlan
    // 已发布 + 记住过选择 + 内容没有变化 → 不打扰用户，直接更新
    if (w.published && data.remembered && data.changed.length === 0 && data.selection.length > 0) {
      await doPublish(w, data.selection, true)
      return
    }
    setDialog({
      work: w,
      data,
      selection: new Set(data.selection),
      remember: true,
      expanded: new Set(),
    })
  }

  /** 真正执行发布（对话框确认后 / 无变化直接更新时）。 */
  const doPublish = async (w: HostLocalWork, selection: string[], remember: boolean): Promise<void> => {
    setPublishing(w.id)
    setPublishNotice(null)
    const res = await post('work/publish', { id: w.id, selection, remember })
    setPublishing(null)
    if (!res.ok) {
      const staleHost = res.error?.code === 'unknown-endpoint'
      setPublishNotice({
        tone: 'error',
        code: staleHost ? 'host-restart' : (res.error?.code ?? 'unknown'),
        text: staleHost ? t('community.error.hostRestart') : (res.error?.message ?? t('community.error.publish')),
      })
      return
    }
    const value = res.value as {
      published: { version: number; created: boolean; chargedTokens: number }
      attachments?: { selected: number; uploaded: number; uploadedBytes: number; skippedExisting: number; oversize: Array<{ relPath: string }> }
      missing?: string[]
    }
    /**
     * 回执**一行说完**（2026-09 用户要求：不要啰嗦）：
     *
     * ```text
     * 已发布 · ConvFusion-dsh · 研究状态 v1 · 1 Token · 50 附件
     * ```
     *
     * 只报**真实发生的事**：没扣费（重复发布免费）就不写 Token，没有新附件就不写附件；
     * 超限未传是警告，必须写出来。
     */
    const bits: string[] = [
      t('community.notice.published', { title: w.title, version: value.published.version }),
    ]
    if (value.published.chargedTokens > 0) {
      bits.push(t('community.notice.tokens', { tokens: value.published.chargedTokens }))
    }
    if (value.attachments && value.attachments.uploaded > 0) {
      bits.push(t('community.notice.files', { count: value.attachments.uploaded }))
    }
    if (value.attachments && value.attachments.oversize.length > 0) {
      bits.push(t('community.notice.oversize', { count: value.attachments.oversize.length }))
    }
    setPublishNotice({
      tone: 'success',
      text: bits.join(' · '),
      ...(value.missing && value.missing.length ? { missing: value.missing } : {}),
    })
    setDialog(null)
    await loadMine()
  }

  React.useEffect(() => {
    // ⚠️ 依赖里有**生效地址**：换服务器后【可指导】必须重读，否则显示的是上一台的列表。
    // 未登录 / 没换到新地址时清空（不能把上一台的条目当成本机的）。
    if (!activeServer || !account) {
      setWorks(null)
      setWorksError(null)
      setOpen(null)
      setDetail(null)
      return
    }
    void loadWorks()
  }, [account, activeServer, loadWorks])

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
      setWorksError(res.error ?? { code: 'unknown', message: t('community.error.readSummary') })
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
      setWorksError(res.error ?? { code: 'unknown', message: t('community.error.readBrief') })
      return
    }
    const brief = (res.value as { brief: HostWorkBrief }).brief
    setDetail({ projectId: w.projectId, work: brief, brief })
    setOpen({ projectId: w.projectId, kind: 'brief' })
    // 读过详情 ⇒ 这一项可以【发起指导】了（本会话内记住）
    setDetailRead((prev) => new Set(prev).add(w.projectId))
    // 读到了 ⇒ 这一项已经"解锁"（服务器按 (viewer, project) 只收一次）：
    // 本会话立刻不再弹确认框；下次启动由宿主的本地记忆回答（`work/list` 的 briefOpened）。
    setWorks((prev) =>
      prev === null
        ? prev
        : prev.map((it) =>
            it.projectId === w.projectId ? { ...it, briefPaid: true, briefOpened: true } : it,
          ),
    )
    // 成功之后这次意图已经完成，清掉 key（下次点是新的一次查看）
    setIntents((prev) => {
      const next = { ...prev }
      delete next[w.projectId]
      return next
    })
    // 简报是**花钱**的：回执要说清这次到底扣了多少。
    // 优先用服务器的 `charged_tokens`（权威，已买过时就是 0）；旧响应缺这个字段时
    // 退回"按余额差值说话" —— 绝不硬编码"1"。
    const before = state?.tokens?.available
    const after = await refreshBalance()
    if (typeof after === 'number') {
      const charged = brief.chargedTokens
      if (typeof charged === 'number') {
        setChargeNotice(
          charged > 0
            ? t('community.notice.charged', { tokens: charged, balance: after })
            : t('community.notice.briefRead', { balance: after }),
        )
      } else {
        setChargeNotice(
          typeof before === 'number' && before !== after
            ? t('community.notice.charged', { tokens: before - after, balance: after })
            : t('community.notice.briefRead', { balance: after }),
        )
      }
    }
  }

  /**
   * 点【简报】按钮的入口 —— **花钱的动作先确认**。
   *
   * 两种情形必须分开（否则会凭空多出一次确认、或者反而漏掉确认）：
   *
   * - 这一项**已经展开**：再点是**收起**，服务器不会再扣费 → 直接执行，不打断；
   * - 其余情况（首次读取 / 换一项 / 上次失败后重试）：都会真的扣 Token
   *   → 先弹确认，用户点「确认读取」才走 `toggleBrief`。
   *
   * 重试复用同一个 intentKey（在 `toggleBrief` 里维护），所以"失败后重试"
   * 即使确认两次也不会重复扣费。
   */
  const requestBrief = (w: HostWork): void => {
    if (open?.projectId === w.projectId && open.kind === 'brief') {
      void toggleBrief(w)
      return
    }
    // 已经买过（服务器保证同一项不再扣费）→ 不再打扰：直接读。
    if (briefFree(w)) {
      void toggleBrief(w)
      return
    }
    setBriefConfirm(w)
  }

  /** 服务器地址（留空 = 用宿主当前的地址）。 */
  const serverUrl = serverDraft.trim() || state?.serverUrl || undefined
  /**
   * 地址是否**还没保存**（草稿 ≠ 已生效地址）。
   *
   * ⚠️ 不要求"已登录"：地址是**登录前**就要能改的（换到试用服务器再登录是常见顺序），
   * 早期版本把它绑在 `account` 上，未登录时连【保存】都不出现 —— 于是地址永远存不下来。
   *
   * 只在**真的改了**的时候才出现这一行（业务发生时提示），不做常驻说明。
   */
  const serverChanged = serverDraft.trim() !== (state?.serverUrl ?? '')
  /**
   * 快捷按钮要比对的"当前地址"：**去掉末尾斜杠**再比（宿主给的生效地址是归一过的，
   * 而配置文件里的预设可能带末尾斜杠）。留空 = 跟随环境配置 → 用生效地址。
   */
  const activeServerUrl = stripSlash(serverDraft.trim() || state?.serverUrl || '')

  /**
   * 在浏览器**新标签**打开服务器首页（就是服务器地址本身）。
   *
   * 两个入口共用：注册表单的【申请邀请码】按钮 + 服务器设置的【邀请码】图标按钮。
   * 地址取当前草稿（还没保存也认），草稿为空才退回宿主生效地址 —— 用户要申请邀请码，
   * 就该去"将要登录的那台"服务器，而不是环境默认值。
   */
  const openServerHome = (): void => {
    if (!serverUrl) return
    window.open(serverUrl, '_blank', 'noopener,noreferrer')
  }

  /**
   * 点快捷按钮 = **填地址 + 测一次连通性**（2026-09 用户要求）。
   *
   * ⚠️ 这里**不落盘**：填进去的只是草稿，要点【保存】才写进配置（并立刻登录一次）。
   * 曾经的 bug 是"按钮看起来保存了、刷新却打回原地址"——根因是当时的代码
   * 只 `setServerDraft` 而没有落盘入口。现在落盘集中在一个显式动作上，
   * 未保存的状态也由界面明确标出。
   *
   * 测的是**按钮自己那个地址**，不是输入框里的内容：用户点的就是这一边，中间不该有
   * "他改过输入框"这种歧义。探测走宿主的 `account/probe`（匿名 `/health`）——
   * 浏览器不能跨域直连服务器，凭据也**不该**为了探活而出门。
   */
  const pickServerPreset = async (env: 'development' | 'production', url: string): Promise<void> => {
    setServerDraft(url)
    setServerProbes((prev) => ({ ...prev, [env]: { state: 'busy', reason: null } }))
    const res = await post('account/probe', { serverUrl: url })
    if (!res.ok) {
      setServerProbes((prev) => ({
        ...prev,
        [env]: { state: 'fail', reason: res.error?.message ?? null },
      }))
      return
    }
    const v = res.value as { reachable: boolean; reason: string | null }
    setServerProbes((prev) => ({
      ...prev,
      [env]: { state: v.reachable ? 'ok' : 'fail', reason: v.reason },
    }))
  }

  /**
   * 【保存】= **落盘地址 + 立刻登录一次**（2026-09 用户要求）。
   *
   * 两步都要，缺一不可：
   *   ① `account/serverUrl` 把地址写进配置 —— 否则刷新就丢（这就是原来的 bug）；
   *   ② 紧接着 `account/verify` —— 凭据绑定在服务器上，换了服务器原来那份 Key 未必
   *      成立。与其让用户对着"已登录"的旧状态猜，不如当场验证：通了就是真的通了，
   *      没通就把服务器的原因显示出来（401 换 Key / 连不上查地址，动作各不相同）。
   *
   * 没凭据时只落盘、不发验证请求（`keyConfigured` 为假）——那种情况用户还没登录，
   * 登录是下一步的事。
   */
  const saveServerAddress = async (): Promise<void> => {
    setBusy(true)
    // 空串 = 清除覆盖、跟随环境配置（界面清空输入框就是这个意思）
    const saved = await call('account/serverUrl', { serverUrl: serverDraft.trim() })
    if (saved) {
      // 宿主把地址归一了（去掉 /api、末尾斜杠），草稿跟着归一值走，避免"已改"提示误报
      setServerDraft(saved.serverUrl ?? '')
      if (saved.keyConfigured) await call('account/verify', {})
    }
    setBusy(false)
  }

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

  /**
   * 读自己的续费申请记录（弹窗打开 / 刷新 / 提交成功后都走它）。
   *
   * 失败**不清空**已有记录：宁可显示上一次读到的状态，也不要因为一次网络抖动就把
   * "已申请"变回"可以再申请"（那会诱发重复提交）。
   */
  const loadRechargeRequests = async (): Promise<void> => {
    setRechargeLoading(true)
    const res = await post('account/recharge-requests', {})
    setRechargeLoading(false)
    if (!res.ok) return
    const items = (res.value as { items: HostRechargeRequest[] }).items
    setRechargeRequests(items)
  }

  /** 打开余额弹窗：立刻读一次续费记录（决定给不给申请表单）。 */
  const openTokenDialog = (): void => {
    setTokenDialog(true)
    setRechargeError(null)
    setRechargeReceipt(null)
    setRechargeRequests(null)
    void loadRechargeRequests()
  }

  /**
   * 提交续费申请（只记录意向，服务器不改余额）。
   *
   * 成功后：**重读**申请记录（让"待处理"状态来自服务器，而不是本地猜），并给回执。
   * 失败：把宿主的可读原因显示在弹窗里 —— 没有具体理由的"申请失败"没法让人采取动作。
   */
  const applyRecharge = async (): Promise<void> => {
    const amount = Number(rechargeAmount)
    if (!Number.isInteger(amount) || amount <= 0) {
      setRechargeError(t('community.token.amountInvalid'))
      return
    }
    setRechargeSubmitting(true)
    setRechargeError(null)
    const res = await post('account/recharge-request', {
      amount,
      ...(rechargeReason.trim() ? { reason: rechargeReason.trim() } : {}),
    })
    setRechargeSubmitting(false)
    if (!res.ok) {
      setRechargeError(res.error?.message ?? t('community.error.unknown'))
      return
    }
    setRechargeReceipt(t('community.token.receipt', { amount }))
    setRechargeAmount('')
    setRechargeReason('')
    void loadRechargeRequests()
  }

  // 指导提案分栏：我在哪一边决定能做什么 —— 我是 researcher 就是我收到的（可接受/拒绝），
  // 我是 mentor 就是我发起的（等对方响应）。身份缺失时宿主已回退成 id，短 id 也能对上 account.id。
  const myAccountId = account?.id ?? ''
  const incomingProposals = (proposals ?? []).filter((p) => p.researcher?.id === myAccountId)
  const outgoingProposals = (proposals ?? []).filter((p) => p.mentor?.id === myAccountId)

  /**
   * 我发起的提案按项目索引 —— 【可指导】每行据此显示状态角标（发起后变「等待响应」）。
   *
   * 同一项目可能有历史提案（被拒之后又发了一次），所以取**最需要用户注意**的那条：
   * `PROPOSED`（等对方响应）优先于 `ACCEPTED`，都优先于终态（已拒绝 / 已过期 / 已取消）。
   */
  const myProposalByProject = new Map<string, HostProposal>()
  {
    const rank: Record<string, number> = { PROPOSED: 0, ACCEPTED: 1 }
    for (const p of outgoingProposals) {
      const current = myProposalByProject.get(p.projectId)
      if (!current || (rank[p.status] ?? 9) < (rank[current.status] ?? 9)) {
        myProposalByProject.set(p.projectId, p)
      }
    }
  }

  /** 费用数字（只给数，不做解释性描述）。 */
  const feeText = (p: HostProposal): string =>
    t('community.mentor.feeText', {
      total: p.totalFee,
      deposit: p.depositAmount,
      success: p.successPaymentAmount,
    })

  /**
   * 「指导中」的**统一列表**：我收到的 + 我发起的合成一条，按"要不要我动作"排序。
   *
   * 排序：`PROPOSED`（等我处理 / 等对方响应）→ `ACCEPTED`（跟踪中）→ 终态；
   * 同一档内新的在前。这一页的主职就是**跟踪状态**，所以把还需要动作的顶上去。
   */
  const trackItems = [
    ...incomingProposals.map((p) => ({ p, incoming: true })),
    ...outgoingProposals.map((p) => ({ p, incoming: false })),
  ].sort((a, b) => {
    const rank: Record<string, number> = { PROPOSED: 0, ACCEPTED: 1 }
    const byStatus = (rank[a.p.status] ?? 9) - (rank[b.p.status] ?? 9)
    return byStatus !== 0 ? byStatus : (b.p.createdAt ?? '').localeCompare(a.p.createdAt ?? '')
  })

  return (
    <>
      {/* ══ 用户信息区（内部 Tabs：账号 / 服务器设置）══════════════════════ */}
      <div style={S.card}>
        <div style={S.cardHead}>
          ◈ {t('community.title')}
          <span style={{ flex: '1 1 auto' }} />
          {/* 环境徽章：开发连的是本机服务器，生产连的是线上 —— 两者不能混为一谈。
              环境还没读到（宿主是旧的 / 正在读）时不猜，先不显示。 */}
          {state?.environment === 'production' ? (
            <Badge tone="brand">{t('community.badge.production')}</Badge>
          ) : state?.environment === 'development' ? (
            <Badge tone="neutral">{t('community.badge.development')}</Badge>
          ) : null}
          {state?.serverUrlMismatch ? <Badge tone="warn">{t('community.badge.envMismatch')}</Badge> : null}
          {phase === 'loading' ? (
            <Badge tone="neutral">{t('community.badge.checking')}</Badge>
          ) : account ? (
            <Badge tone="success">{t('community.badge.signedIn')}</Badge>
          ) : configured ? (
            <Badge tone="warn">{t('community.badge.unverified')}</Badge>
          ) : (
            <Badge tone="neutral">{t('community.badge.signedOut')}</Badge>
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
              {account ? t('community.tab.account') : t('community.tab.signIn')}
            </MiniTab>
            <MiniTab active={userTab === 'server'} onClick={() => setUserTab('server')}>
              
              {t('community.tab.server')}</MiniTab>
          </div>

          {userTab === 'account' ? (
            account ? (
              /* 已登录：一行账号 + 右侧操作，没有多余说明文字 */
              /*
               * 一行放下：账号名 + 邮箱 + 角色·状态 + 余额 + 两个按钮。
               *
               * ⚠️ 这行是 `flexWrap: 'wrap'` 的（窄了会换行）。所以必须指定**谁让位**：
               * 邮箱是唯一可牺牲的元素（自己的邮箱，且悬浮能看到全的），
               * 其余（余额徽章、按钮）一律 `flex: 0 0 auto` 不许被压。
               * 曾经因为余额徽章里多了「（+30 冻结）」把两个按钮挤到第二行。
               */
              <div style={S.inlineRow}>
                <span style={{ ...S.accountName, flex: '0 0 auto' }}>{account.displayName}</span>
                <span
                  style={{
                    ...S.mono,
                    flex: '0 1 auto',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={account.email}
                >
                  {account.email}
                </span>
                <span style={{ ...S.hint, flex: '0 0 auto' }}>
                  {roleText(t, account.roles)} · {enumText(t, STATUS_LABEL_KEYS, account.status)}
                </span>
                {/* Token 余额：点了打开余额弹窗（明细 + 续费说明 + 申请续费）。
                    刷新余额挪进弹窗里 —— 徽章现在只负责"打开"，一个按钮一个动作 */}
                {state?.tokens ? (
                  <button
                    type="button"
                    style={{
                      ...S.tokenBadge,
                      flex: '0 0 auto',
                      opacity: busy ? 0.55 : 1,
                    }}
                    disabled={busy}
                    title={
                      state.tokens.frozen > 0
                        ? t('community.tip.balanceDetail', {
                            available: state.tokens.available,
                            frozen: state.tokens.frozen,
                          })
                        : t('community.tip.balance')
                    }
                    onClick={openTokenDialog}
                  >
                    ◎ {state.tokens.available} Token
                    {/* 冻结部分只留最短标记（完整解释在悬浮提示里）——它曾经把整行挤成两行 */}
                    {state.tokens.frozen > 0 ? (
                      <span style={{ fontWeight: 400, opacity: 0.7 }}>
                        {t('community.balance.frozenNote', { count: state.tokens.frozen })}
                      </span>
                    ) : null}
                  </button>
                ) : null}
                <span style={{ flex: '1 1 auto' }} />
                {/* 刷新：与研究工作三个 Tab 同一个组件（图标 + 悬浮说明） */}
                <RefreshIconButton t={t} busy={busy} onClick={() => void verify()} />
                <button
                  type="button"
                  style={{ ...S.iconBtn, flex: '0 0 auto', opacity: busy || fromEnv ? 0.55 : 1 }}
                  disabled={busy || fromEnv}
                  // 凭据来自环境变量时无法在界面里清除 —— 悬浮说明说出原因
                  title={fromEnv ? t('community.tip.envKey') : t('community.action.signOut')}
                  aria-label={t('community.action.signOut')}
                  onClick={() => void logout()}
                >
                  ⏏
                </button>
              </div>
            ) : (
              /* 未登录：默认只展示**一条**登录路径 */
              <>
                <div style={S.inlineRow}>
                  <span style={S.label}>{t('community.login.keyLabel')}</span>
                  <input
                    style={S.compactInput}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={apiKey}
                    placeholder="cf_live_…"
                    // 凭据纪律用**悬浮提示**说明：需要时能看到，平时不占版面
                    title={t('community.tip.keyPrivacy')}
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
                    {busy ? t('community.action.signingIn') : t('community.action.signIn')}
                  </button>
                  <button
                    type="button"
                    style={S.linkBtn}
                    onClick={() => setInviteOpen((v) => !v)}
                    aria-expanded={inviteOpen}
                  >
                    {inviteOpen ? t('community.action.inviteHide') : t('community.action.inviteShow')}
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
                        placeholder={t('community.placeholder.invitation')}
                        onChange={(e) => setInvite({ ...invite, code: e.target.value })}
                      />
                      <input
                        style={S.compactInput}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={invite.email}
                        placeholder={t('community.placeholder.email')}
                        onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                      />
                      <input
                        style={S.compactInput}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={invite.displayName}
                        placeholder={t('community.placeholder.displayName')}
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
                        {busy ? t('community.action.registering') : t('community.action.register')}
                      </button>
                      <button
                        type="button"
                        style={S.ghostBtn}
                        title={`${t('community.action.applyInviteTip')}（${serverUrl}）`}
                        onClick={openServerHome}
                      >
                        {t('community.action.applyInvite')}
                      </button>
                    </div>
                    <div style={S.hint}>
                      
                      {t('community.hint.inviteRule')}</div>
                  </>
                ) : null}
              </>
            )
          ) : (
            /* 服务器设置：地址来自环境配置（开发 = 本机服务器，生产 = 线上） */
            <>
              <div style={S.inlineRow}>
                <span style={S.label}>{t('community.server.address')}</span>
                <input
                  style={S.compactInput}
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={serverDraft}
                  placeholder={state?.defaultServerUrl ?? ''}
                  // 输入约定与归一规则收进悬浮提示：需要时能看到，平时不占版面
                  title={t('community.server.title', { url: state?.defaultServerUrl ?? '' })}
                  onChange={(e) => setServerDraft(e.target.value)}
                />
                {/*
                 * 快捷切换：本机（开发）↔ 线上（互联网）。**图标式**——地址框要占掉大半行，
                 * 两个文字按钮会把这一行挤成两行；`title` 里带完整地址，悬停即知会填什么。
                 * 旧宿主不返回 `serverPresets` → 整组不显示（不做假的）。
                 */}
                {state?.serverPresets ? (
                  <>
                    <ServerPresetButton
                      t={t}
                      icon={<DevServerGlyph />}
                      label={t('community.server.presetDev')}
                      url={state.serverPresets.development}
                      result={serverProbes.development ?? { state: 'idle', reason: null }}
                      active={activeServerUrl === stripSlash(state.serverPresets.development)}
                      onPick={(url) => void pickServerPreset('development', url)}
                    />
                    <ServerPresetButton
                      t={t}
                      icon={<InternetGlyph />}
                      label={t('community.server.presetProd')}
                      url={state.serverPresets.production}
                      result={serverProbes.production ?? { state: 'idle', reason: null }}
                      active={activeServerUrl === stripSlash(state.serverPresets.production)}
                      onPick={(url) => void pickServerPreset('production', url)}
                    />
                  </>
                ) : null}
                {/*
                 * 邀请码：在浏览器打开服务器首页（申请邀请码）。图标式，与两个快捷按钮
                 * 同一规格；`title` 带上完整地址，悬停即知会打开什么。旧宿主没有
                 * `serverPresets` 时它**照常显示** —— 打开首页不依赖那两份预设地址。
                 */}
                <button
                  type="button"
                  style={{ ...S.iconBtn, flex: '0 0 auto' }}
                  title={`${t('community.server.inviteCode')} · ${t('community.action.applyInviteTip')} · ${serverUrl}`}
                  aria-label={t('community.server.inviteCode')}
                  onClick={openServerHome}
                >
                  <InviteCodeGlyph />
                </button>
              </div>
              {/* 地址**还没保存**时才出现这一行：说清后果 + 一个明确的保存动作 */}
              {serverChanged ? (
                <div style={S.inlineRow}>
                  <Badge tone="warn">{t('community.badge.addressChanged')}</Badge>
                  <span style={{ ...S.hint, flex: '1 1 auto' }}>{t('community.hint.addressChanged')}</span>
                  <button
                    type="button"
                    style={{ ...S.primaryBtn, flex: '0 0 auto', opacity: busy ? 0.55 : 1 }}
                    disabled={busy}
                    onClick={() => void saveServerAddress()}
                  >
                    {busy ? t('community.action.saving') : t('community.action.saveAddress')}
                  </button>
                </div>
              ) : null}
              {state?.serverUrlMismatch ? (
                <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--dsw-alias-state-warn-primary)' }}>
                  {state.environment === 'production'
                    ? t('community.hint.mismatchProduction')
                    : t('community.hint.mismatchDevelopment')}
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
                  
                  {t('community.action.retryVerify')}</button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ══ 发布确认对话框（点「寻找指导」/「更新」时出现）═════════════════ */}
      {dialog ? (
        <PublishDialog
          t={t}
          data={dialog.data}
          selection={dialog.selection}
          remember={dialog.remember}
          expanded={dialog.expanded}
          busy={publishing !== null}
          onToggleCategory={(categoryId, files, next) =>
            setDialog((d) => {
              if (!d) return d
              const sel = new Set(d.selection)
              for (const f of files) {
                if (next) sel.add(f)
                else sel.delete(f)
              }
              return { ...d, selection: sel }
            })
          }
          onToggleFile={(relPath, next) =>
            setDialog((d) => {
              if (!d) return d
              const sel = new Set(d.selection)
              if (next) sel.add(relPath)
              else sel.delete(relPath)
              return { ...d, selection: sel }
            })
          }
          onToggleExpand={(categoryId) =>
            setDialog((d) => {
              if (!d) return d
              const ex = new Set(d.expanded)
              if (ex.has(categoryId)) ex.delete(categoryId)
              else ex.add(categoryId)
              return { ...d, expanded: ex }
            })
          }
          onRemember={(next) => setDialog((d) => (d ? { ...d, remember: next } : d))}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            if (!dialog) return
            void doPublish(dialog.work, [...dialog.selection], dialog.remember)
          }}
        />
      ) : null}

      {/* ══ 详情扣费确认（点【详情】时出现；确认前不发请求、不扣费）══════════ */}
      {briefConfirm ? (
        <BriefConfirmDialog
          t={t}
          title={briefConfirm.title}
          balance={state?.tokens?.available ?? null}
          onCancel={() => setBriefConfirm(null)}
          onConfirm={() => {
            const target = briefConfirm
            setBriefConfirm(null)
            void toggleBrief(target)
          }}
        />
      ) : null}

      {/* ══ 发起指导提案（点【发起指导】时出现；免费操作，对话框即确认）══════ */}
      {proposeTarget ? (
        <ProposeDialog
          t={t}
          title={proposeTarget.title}
          fee={proposeFee}
          busy={proposeBusy}
          error={proposeError}
          onCancel={() => {
            setProposeTarget(null)
            setProposeError(null)
          }}
          onSubmit={(input) => void submitPropose(input)}
        />
      ) : null}

      {/*
        * ══ Split Button 的下拉（【拒绝】收在这里）══════════════════════════
        *
        * `position: fixed` + 按钮 rect 定位（外层卡片 overflow:hidden，absolute 会被裁）。
        * 一层全屏透明背板负责"点别处关闭" —— 比给整页挂 document 监听简单，也不会漏解绑。
        * zIndex 压在 1000 的对话框**之下**：真开了对话框就不该再看到这个菜单。
        */}
      {menuFor ? (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
            onClick={() => setMenuFor(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: Math.max(8, menuFor.x - 110),
              top: menuFor.y + 4,
              minWidth: 110,
              zIndex: 999,
              background: 'var(--dsw-alias-bg-layer-1)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 8,
              boxShadow: '0 6px 18px rgba(0,0,0,.18)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--dsw-alias-label-primary)',
                fontSize: 12.5,
                cursor: 'pointer',
              }}
              onClick={() => {
                const target = menuFor.proposal
                setMenuFor(null)
                void rejectProposal(target)
              }}
            >
              {t('community.action.reject')}
            </button>
          </div>
        </>
      ) : null}

      {/* ══ 【下载】到选定的 DSH 工作区 ══════════════════════════════════════ */}
      {download ? (
        <DownloadDialog
          t={t}
          proposal={download.proposal}
          fileName={download.fileName}
          workspaces={download.workspaces}
          workspacesAvailable={download.available}
          workspacesReason={download.reason}
          selection={download.selection}
          files={download.files}
          bytes={download.bytes}
          busy={downloadBusy}
          notice={download.notice}
          onSelect={(id) => setDownload((prev) => (prev ? { ...prev, selection: id } : prev))}
          onDownload={() => void runDownload()}
          onClose={() => setDownload(null)}
        />
      ) : null}

      {/* ══ 文件交换：【上传】指导结果 ══════════════════════════════════════ */}
      {exchange?.mode === 'upload' ? (
        <UploadDialog
          t={t}
          proposal={exchange.proposal}
          dir={uploadDir}
          pickerSupported={pickerSupported}
          files={reviewFiles}
          selected={reviewSelected}
          busy={exchangeBusy}
          notice={exchangeNotice}
          onDirChange={setUploadDir}
          onChooseDir={() => void chooseDir()}
          onScan={() => void scanReview()}
          onToggle={toggleReview}
          onUpload={() => void runUpload()}
          onClose={() => setExchange(null)}
        />
      ) : null}

      {/* ══ 导师信息（点【导师】时出现；数据来自提案内嵌的 profile）══════════ */}
      {profileTarget ? (
        <MentorProfileDialog t={t} proposal={profileTarget} onClose={() => setProfileTarget(null)} />
      ) : null}

      {/* ══ 接受指导确认（点【接受指导】时出现；确认前不发请求、不冻结押金）════ */}
      {acceptConfirm ? (
        <AcceptConfirmDialog
          t={t}
          proposal={acceptConfirm}
          balance={state?.tokens?.available ?? null}
          onCancel={() => setAcceptConfirm(null)}
          onConfirm={() => void confirmAccept()}
        />
      ) : null}

      {/*
       * ══ Token 余额弹窗（点账号行余额徽章打开，2026-09 用户要求）════════
       *
       * 明细 + 续费说明 + 申请续费。刷新按钮同时重读**余额**与**申请记录**：
       * 管理员在服务器上批准之后，用户点一下就能看到余额变了、申请变成 APPROVED。
       */}
      {tokenDialog ? (
        <TokenDialog
          t={t}
          tokens={state?.tokens ?? null}
          requests={rechargeRequests}
          loading={rechargeLoading || refreshingBalance}
          amount={rechargeAmount}
          reason={rechargeReason}
          submitting={rechargeSubmitting}
          error={rechargeError}
          receipt={rechargeReceipt}
          onAmount={setRechargeAmount}
          onReason={setRechargeReason}
          onApply={() => void applyRecharge()}
          onRefresh={() => {
            void refreshBalance()
            void loadRechargeRequests()
          }}
          onClose={() => setTokenDialog(false)}
        />
      ) : null}

      {/*
       * ══ 研究工作（三个视图）══════════════════════════════════════════════
       *
       *   我的   —— **本机**的研究项目（有效 research workspace 的工作区）。
       *            不联网、不需要登录；所有用户都能看到自己的。
       *   可指导 —— 研究网络里已公开的研究工作（导师视角）。需要导师角色。
       *   指导中 —— 我发起的（等对方响应）+ 我收到的（接受 / 拒绝）。
       *
       * 「我的」在最前（2026-09 用户拍板）：所有人都可能**被**指导，先看自己的。
       */}
      <div style={S.card}>
        <div style={S.cardHead}>
          {/* 卡片标题：只说"这一片是什么"，两个视图的名字交给后面的 Tab */}
          <span style={{ marginRight: 4 }}>{t('community.work.title')}</span>
          <MiniTab active={workTab === 'mine'} onClick={() => setWorkTab('mine')}>
            
            {t('community.tab.mine')}</MiniTab>
          <MiniTab active={workTab === 'mentor'} onClick={() => setWorkTab('mentor')}>
            
            {t('community.tab.mentor')}</MiniTab>
          {/* 「指导中」= 我发起的 + 我收到的指导提案（发起 / 接受 / 拒绝都在这里） */}
          <MiniTab active={workTab === 'mentorship'} onClick={() => setWorkTab('mentorship')}>
            {t('community.tab.mentorship')}</MiniTab>
          <span style={{ flex: '1 1 auto' }} />
          {workTab === 'mine' ? (
            <RefreshIconButton t={t} busy={mineLoading} onClick={() => void loadMine()} />
          ) : null}
          {workTab === 'mentor' && account ? (
            <RefreshIconButton t={t} busy={worksLoading} onClick={() => void loadWorks()} />
          ) : null}
          {workTab === 'mentorship' && account ? (
            <RefreshIconButton t={t} busy={proposalsLoading} onClick={() => void loadProposals()} />
          ) : null}
          {workTab === 'mentor' && !account ? <Badge tone="neutral">{t('community.badge.sample')}</Badge> : null}
        </div>
        <div style={S.cardBody}>
          {/*
           * 三个视图（2026-09 用户拍板）：我的 / 可指导 / 指导中。
           *
           * 「指导中」承载整条商业闭环：POST /projects/{id}/mentorship-proposals（发起）
           * → POST /mentorship-proposals/{id}/accept（接受 → **冻结押金** + 建合同 + 建关系）。
           * 关系建立后导师即可读 Level 3 `GET /projects/{id}/full`（服务器已实现，插件后续接）。
           *
           * ⚠️ 不再在「我的」「可指导」列表里加内联按钮（用户：有第三个 Tab 时这些可忽略）——
           * 发起与接受都收在一处，列表行保持只读。
           */}
          {/* 列表级失败（列表 / 摘要 / 简报共用一处提示，按 code 给出不同说法） */}
          {publishNotice ? (
            <div style={S.inlineRow}>
              {/* 徽章保留（用户觉得效果好）：成功 = 「已发布」，失败 = 错误码。
                  因此文案里不再重复写"已发布"，避免同一行说两遍。 */}
              <Badge tone={publishNotice.tone === 'success' ? 'success' : 'error'}>
                {publishNotice.tone === 'success'
                  ? t('community.badge.published')
                  : (publishNotice.code ?? t('community.badge.published'))}
              </Badge>
              <span
                style={{
                  color:
                    publishNotice.tone === 'success'
                      ? 'var(--dsw-alias-label-secondary)'
                      : 'var(--dsw-alias-state-error-primary)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  flex: '1 1 320px',
                  minWidth: 0,
                }}
              >
                {publishNotice.text}
                {publishNotice.missing && publishNotice.missing.length
                  ? ` ${t('community.hint.publishMissing', { fields: publishNotice.missing.join(' / ') })}`
                  : ''}
              </span>
            </div>
          ) : null}
          {chargeNotice ? (
            <div style={S.inlineRow}>
              <Badge tone="brand">{t('community.badge.charged')}</Badge>
              <span style={S.hint}>{chargeNotice}</span>
            </div>
          ) : null}
          {/* 指导关系的业务回执（接受成功 → 押金已冻结；失败 → 说清原因） */}
          {mentorNotice ? (
            <div style={S.inlineRow}>
              <Badge tone={mentorNotice.tone === 'success' ? 'success' : 'error'}>
                {mentorNotice.tone === 'success'
                  ? t('community.mentor.badgeDone')
                  : t('community.mentor.badgeFailed')}
              </Badge>
              <span
                style={
                  mentorNotice.tone === 'success'
                    ? S.hint
                    : { ...S.hint, color: 'var(--dsw-alias-state-error-primary)' }
                }
              >
                {mentorNotice.text}
              </span>
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

          {workTab === 'mentorship' ? (
            /* ── 指导中：**一个**列表跟踪指导关系状态（不再分「我收到的 / 我发起的」）──
             *
             * 用户拍板（2026-09）：这一页的主职是**跟踪状态**，所以只留三样东西 ——
             *   ① 对方是谁（我收到的 → 导师姓名；我发起的 → 项目标题）
             *   ② 状态角标
             *   ③ 费用数字
             * 指导范围 / 成功条件 / 导师简介 / 机构 / 研究方向这些**描述性文字全部去掉**
             * （导师简介留在「接受指导」的确认框里 —— 那是真正要做判断的地方）。
             */
            !account ? (
              <div style={S.inlineRow}>
                <Badge tone="warn">{t('community.badge.signInRequired')}</Badge>
                <span style={S.hint}>{t('community.hint.mentorSignIn')}</span>
              </div>
            ) : proposalsError ? (
              <div style={S.inlineRow}>
                <Badge tone="error">{proposalsError.code}</Badge>
                <span
                  style={{
                    color: 'var(--dsw-alias-state-error-primary)',
                    fontSize: 12,
                    lineHeight: 1.6,
                    flex: '1 1 320px',
                    minWidth: 0,
                  }}
                >
                  {proposalsError.message}
                </span>
                <button type="button" style={S.ghostBtn} onClick={() => void loadProposals()}>
                  {t('community.action.retry')}
                </button>
              </div>
            ) : proposals === null ? (
              <div style={S.hint}>
                {proposalsLoading ? t('community.hint.loading') : t('community.hint.noData')}
              </div>
            ) : trackItems.length === 0 ? (
              <div style={S.hint}>{t('community.hint.mentorEmpty')}</div>
            ) : (
              <div style={S.list}>
                {trackItems.map(({ p, incoming }, i) => (
                  <div
                    key={p.id}
                    style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                  >
                    {/*
                      两栏：左 = 名称 + 费用**竖排**；右 = 状态 + 按钮（`flex: 0 0 auto`）。

                      ⚠️ 名称和费用原来并排，加上费用数字后整行太长，右侧的
                      【下载】【上传】被挤到第二行（2026-09 用户反馈）。竖排后左侧
                      自己消化宽度，右侧按钮永远一行。
                    */}
                    <div style={S.listRow}>
                      <div
                        style={{
                          minWidth: 0,
                          flex: '1 1 auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        {/* 对方是谁：我收到的看导师，我发起的看项目（粗体、单行） */}
                        <div style={S.listTitle}>
                          {incoming
                            ? (p.mentor?.displayName ?? t('community.mentor.unknownParty'))
                            : (p.projectTitle ?? t('community.mentor.untitledProject'))}
                        </div>
                        {/* 费用数字（不做解释性描述）—— 名称之下一行 */}
                        <div style={S.hint}>{feeText(p)}</div>
                      </div>
                      {/* 右侧：状态 + 操作，整组不许被压缩、不许换行 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flex: '0 0 auto',
                          flexWrap: 'nowrap',
                        }}
                      >
                      <Badge tone={proposalTone(p.status)}>
                        {translateOr(t, progressLabelKey(p, incoming), p.status)}
                      </Badge>
                      {/*
                        指导关系建立之后才有文件交换：
                          【下载】两端都显示 —— 导师取学生的工作区做分析，学生取回（含
                          导师上传的 mentorship/ 产物）继续推进研究；
                          【上传】只有导师侧 —— 学生自己的工作区本来就在服务器上（用【我的】里的【更新】）。
                      */}
                      {canDownloadProposal(p, incoming) ? (
                        <button
                          type="button"
                          style={S.ghostBtn}
                          title={t('community.tip.download')}
                          onClick={() => void requestDownload(p)}
                        >
                          {t('community.action.download')}
                        </button>
                      ) : null}
                      {p.status === 'ACCEPTED' && !incoming ? (
                        <button
                          type="button"
                          style={{ ...S.accentBtn, opacity: 0.85 }}
                          title={t('community.tip.upload')}
                          onClick={() => void openExchange(p)}
                        >
                          {t('community.action.upload')}
                        </button>
                      ) : null}
                      {/* 我作为学生时，看得到"是谁在申请指导我"（标签压短，见下方 Split Button 注释） */}
                      {incoming ? (
                        <button
                          type="button"
                          style={S.ghostBtn}
                          title={t('community.mentor.profileTitle')}
                          onClick={() => setProfileTarget(p)}
                        >
                          {t('community.action.viewMentor')}
                        </button>
                      ) : null}
                      {/*
                        * 只有"等我处理"的这一条才给动作 —— 其余状态纯跟踪。
                        *
                        * ⚠️ 做成 **Split Button**（2026-09 用户要求）：一行里塞三个按钮时
                        * 宽度不够、右侧信息被挤掉。【拒绝】收进 ▾ 的下拉里，行上只剩
                        * 「导师 + 接受 ▾」两段。
                        *
                        * 下拉用 `position: fixed` 按按钮位置定位，而不是 `absolute`：
                        * 外层卡片有 `overflow: hidden`（圆角需要），absolute 菜单会被裁掉。
                        */}
                      {incoming && p.status === 'PROPOSED' ? (
                        /*
                         * `alignItems: 'stretch'` 让右段**自动**跟左段等高。
                         *
                         * 为什么不能用 padding 硬凑：`▾`（U+25BE）的字形行高和中文不同，
                         * 两段各自按内容撑高就会一高一低，看着不齐；写死 height 又要跟着
                         * 字号/内边距维护。stretch 让高度由左段决定，右下段没有纵向 padding。
                         */
                        <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                          <button
                            type="button"
                            style={{
                              ...S.accentBtn,
                              borderTopRightRadius: 0,
                              borderBottomRightRadius: 0,
                              opacity: mentorBusy !== null ? 0.55 : 1,
                            }}
                            disabled={mentorBusy !== null}
                            onClick={() => {
                              setMenuFor(null)
                              requestAccept(p)
                            }}
                          >
                            {mentorBusy?.id === p.id && mentorBusy.action === 'accept'
                              ? t('community.action.loading')
                              : t('community.action.accept')}
                          </button>
                          <button
                            type="button"
                            style={{
                              ...S.accentBtn,
                              borderTopLeftRadius: 0,
                              borderBottomLeftRadius: 0,
                              // 纵向 padding 归零（高度靠 stretch 撑），横向加宽到近方形，
                              // 免得箭头段细成一条、跟左段不成比例
                              padding: '0 11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: mentorBusy !== null ? 0.55 : 1,
                            }}
                            disabled={mentorBusy !== null}
                            title={t('community.action.more')}
                            aria-label={t('community.action.more')}
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect()
                              setMenuFor((prev) =>
                                prev?.id === p.id ? null : { id: p.id, proposal: p, x: r.right, y: r.bottom },
                              )
                            }}
                          >
                            ▾
                          </button>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : workTab === 'mine' ? (
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
                  
                  {t('community.action.retry')}</button>
              </div>
            ) : mineRegistry && !mineRegistry.available ? (
              // 注册表读不到（≠ 没有研究项目）：把原因原样说出来，便于定位
              <div style={S.inlineRow}>
                <Badge tone="warn">{t('community.badge.registryUnavailable')}</Badge>
                <span style={S.hint}>
                  {mineRegistry.reason ?? t('community.hint.registryUnavailable')}
                </span>
              </div>
            ) : mine === null ? (
              <div style={S.hint}>{mineLoading ? t('community.hint.loading') : t('community.hint.noData')}</div>
            ) : mine.length === 0 ? (
              <div style={S.hint}>
                
                {t('community.hint.mineEmpty')}</div>
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
                          {w.stage ? (
                            <span>{translateOr(t, `progress.stage.${w.stage.id}`, w.stage.label)}</span>
                          ) : null}
                          <ProgressBar value={w.overall} />
                          {w.paper ? <span>{t('community.hint.paper')}</span> : null}
                          {w.counts
                            .filter((c) => c.value > 0)
                            .slice(0, 4)
                            .map((c) => (
                              <span key={c.key}>
                                {translateOr(t, `progress.count.${c.key}`, c.key)} {c.value}
                              </span>
                            ))}
                        </div>
                        {w.counts.some((c) => c.value > 0 && c.detail) ? (
                          <div style={{ ...S.hint, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {w.counts
                              .filter((c) => c.value > 0 && c.detail)
                              .slice(0, 4)
                              .map((c) => (
                                <span key={`d-${c.key}`}>
                                  {t(`progress.count.${c.detail!.code}`, { count: c.detail!.count })}
                                </span>
                              ))}
                          </div>
                        ) : null}
                        {/* 本机路径：工程师要看得到"这是哪个项目"，用 title 承载完整路径 */}
                        <div style={{ ...S.mono, color: 'var(--dsw-alias-label-tertiary)' }} title={w.researchRoot}>
                          {w.path}
                        </div>
                      </div>
                      {/*
                       * 「寻找指导」= **发布**（建项目 → 传状态 → 发布到网络）。
                       * 只有点它才上传；已发布过则复用同一个服务器项目，按钮变「更新」。
                       */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                        {w.published ? <Badge tone="success">{t('community.badge.inNetwork')}</Badge> : null}
                        <button
                          type="button"
                          style={{
                            ...S.ghostBtn,
                            opacity: account && publishing !== w.id ? 1 : 0.55,
                          }}
                          disabled={!account || publishing !== null || dialogLoading !== null}
                          title={account ? t('community.tip.publish') : t('community.tip.publishNeedSignIn')}
                          onClick={() => void openPublish(w)}
                        >
                          {publishing === w.id
                            ? t('community.action.publishing')
                            : dialogLoading === w.id
                              ? t('community.action.loading')
                              : w.published
                                ? t('community.action.republish')
                                : t('community.action.seekMentor')}
                        </button>
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
                    key={w.titleKey}
                    style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                  >
                    <WorkRow
                      t={t}
                      title={t(w.titleKey)}
                      fields={[t(w.fieldsKey)]}
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
              <div style={S.hint}>{t('community.hint.sampleFootnote')}</div>
            </>
          ) : !canMentor ? (
            /* ── 可指导 · 已登录但没有导师角色：如实说明这一层需要什么 ── */
            <div style={S.inlineRow}>
              <Badge tone="warn">{t('community.badge.mentorRequired')}</Badge>
              <span style={S.hint}>
                {t('community.hint.mentorRequiresRole', { roles: roleText(t, account.roles) })}
              </span>
            </div>
          ) : works === null ? (
            <div style={S.hint}>{worksLoading ? t('community.hint.loadingWork') : t('community.hint.noData')}</div>
          ) : works.length === 0 ? (
            <div style={S.hint}>{t('community.hint.noDiscoverable')}</div>
          ) : (
            <div style={S.list}>
              {works.map((w, i) => {
                const expanded = open?.projectId === w.projectId
                const busyKind = detailBusy?.projectId === w.projectId ? detailBusy.kind : null
                /** 我已经对这项工作发起过的提案（有 → 按钮禁用 + 显示状态角标）。 */
                const mine = myProposalByProject.get(w.projectId)
                /**
                 * 【发起指导】的显示规则：**读过详情之后**才出现。
                 *
                 * 本会话读过 → 显示；本会话没读过但这一项的详情早就解锁了
                 * （`brief_paid` / 本地记忆，见 `briefFree`）→ 也显示：
                 * 那说明这个 viewer 之前就付过费、看过，再把按钮藏起来是 bug 不是保护。
                 */
                const canPropose = detailRead.has(w.projectId) || briefFree(w)
                return (
                  <div
                    key={w.projectId}
                    style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                  >
                    <WorkRow
                      t={t}
                      title={w.title}
                      fields={w.researchFields}
                      stage={w.stage}
                      progress={w.progress}
                      updatedAt={w.updatedAt}
                      disabled={false}
                      busy={busyKind}
                      expanded={expanded}
                      briefFree={briefFree(w)}
                      onSummary={() => void toggleSummary(w)}
                      onBrief={() => requestBrief(w)}
                      /* 第二行：发起指导 + 发起之后的状态角标（等待响应 / 已接受 / …） */
                      below={
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {/*
                            状态角标在**前**、按钮在**后**（2026-09 用户要求）：
                            发起过之后按钮就只是"灰掉的残影"，真正要读的是状态；
                            先给信息、再给不可用的动作。与【指导中】的排法一致。

                            ⚠️ 用 `progressLabelKey(..., false)` 而不是提案状态原值：
                            这里 `mine` 恒为**我发起**的提案（我是导师），接受之后
                            提案状态不再变化，直接显示会永远停在「已接受」。
                          */}
                          {mine ? (
                            <Badge tone={proposalTone(mine.status)}>
                              {translateOr(t, progressLabelKey(mine, false), mine.status)}
                            </Badge>
                          ) : null}
                          {canPropose ? (
                            <button
                              type="button"
                              style={{ ...S.accentBtn, opacity: mine ? 0.55 : 1 }}
                              disabled={Boolean(mine) || proposeBusy}
                              title={mine ? t('community.tip.proposed') : t('community.tip.propose')}
                              onClick={() => void openPropose(w)}
                            >
                              {t('community.action.propose')}
                            </button>
                          ) : null}
                        </div>
                      }
                    />
                    {expanded && detail?.projectId === w.projectId ? (
                      <WorkDetail t={t} work={detail.work} brief={detail.brief} />
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
  t,
}: {
  configured: boolean
  source: 'settings' | 'env' | 'none'
  envVar: string
  tectonic: HostDependency | null
  onRecheck: () => Promise<HostDependency | null>
  scope: SettingsScopeLike
  onNotice: (n: { tone: 'success' | 'error'; text: string } | null) => void
  t: Translate
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
      onNotice({ tone: 'success', text: t('system.retrieval.saved') })
    } catch (e) {
      onNotice({
        tone: 'error',
        text: t('system.retrieval.saveFailed', { detail: e instanceof Error ? e.message : String(e) }),
      })
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      await scope.unset('openalexApiKey')
      setDraft('')
      onNotice({ tone: 'success', text: t('system.retrieval.cleared') })
    } catch (e) {
      onNotice({
        tone: 'error',
        text: t('system.retrieval.clearFailed', { detail: e instanceof Error ? e.message : String(e) }),
      })
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
        onNotice({
          tone: 'success',
          text: t('system.dependency.available', { version: next.version ? `: ${next.version}` : '' }),
        })
      } else {
        onNotice({ tone: 'error', text: t('system.dependency.missing') })
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
          🧩 {t('system.dependency.title')}
          <span style={{ flex: '1 1 auto' }} />
          {dep === null ? (
            <Badge tone="neutral">{t('system.status.unknown')}</Badge>
          ) : dep.available ? (
            <Badge tone="success">{t('system.status.installed')}</Badge>
          ) : (
            <Badge tone="warn">{t('system.status.notInstalled')}</Badge>
          )}
        </div>
        <div style={S.cardBody}>
          {/* 状态行：名称 · 版本 · 路径 · 重新检查 —— 已安装时本卡片就只有这一行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={S.mono}>tectonic</span>
            {dep?.version ? <span style={S.hint}>{dep.version}</span> : null}
            {dep?.path ? <span style={{ ...S.hint, opacity: 0.7 }}>{dep.path}</span> : null}
            {dep?.viaEnv ? (
              <span style={S.hint}>{t('system.dependency.viaEnv', { envVar: dep.envVar })}</span>
            ) : null}
            <span style={{ flex: '1 1 auto' }} />
            <button
              type="button"
              style={{ ...S.ghostBtn, opacity: checking ? 0.55 : 1 }}
              disabled={checking}
              onClick={() => void recheck()}
            >
              {checking ? t('system.dependency.checking') : t('system.dependency.recheck')}
            </button>
          </div>

          {/* 未安装才展开：这时那些字才是用户真正需要的 */}
          {dep && !dep.available ? (
            <div style={{ ...S.hint, lineHeight: 2, marginTop: 8 }}>
              {t('system.dependency.installIntro')}
              <br />
              <span style={S.mono}>brew install tectonic</span>
              <br />
              <span style={S.mono}>mamba install -c conda-forge tectonic</span>
              <br />
              <span style={S.mono}>cargo install tectonic</span>
              <br />
              {t('system.dependency.installOutro', { envVar: dep.envVar || 'CONVFUSION_TECTONIC' })}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 文献检索凭据：OpenAlex ─────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardHead}>
          ⌕ {t('system.retrieval.title')}
          <span style={{ flex: '1 1 auto' }} />
          {configured ? (
            <Badge tone="success">{t('system.status.configured')}</Badge>
          ) : (
            <Badge tone="warn">{t('system.status.notConfigured')}</Badge>
          )}
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
              placeholder={configured ? t('system.retrieval.placeholderReplace') : t('system.retrieval.placeholderPaste')}
              // 凭据纪律与"留空 = 不修改"收进悬浮提示，不占版面
              title={t('system.retrieval.secretHint')}
              onChange={(e) => setDraft(e.target.value)}
            />
            {/* 只在需要动作（未配置）或状态特殊（由环境变量提供）时给一行 */}
            {!configured ? (
              <div style={S.hint}>
                
                {t('system.retrieval.notConfigured')}<span style={S.mono}>openalex.org</span>  {t('system.retrieval.notConfiguredAction')}</div>
            ) : source === 'env' ? (
              <div style={S.hint}>
                
                {t('system.retrieval.envFrom')}<span style={S.mono}>{envVar}</span>  {t('system.retrieval.envFromAction')}</div>
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
                {t('system.retrieval.clear')}
              </button>
            ) : null}
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: draft.trim() && !busy ? 1 : 0.55 }}
              disabled={!draft.trim() || busy}
              onClick={() => void save()}
            >
              {busy ? t('settings.editor.saving') : t('settings.editor.save')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default ConvFusionProjectSettings
