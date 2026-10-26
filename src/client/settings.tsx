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
 * | 定制**文件名** | `configForms`（落 profile 条目 `convfusion` 的 config） | 它是配置，不是内容 |
 * | 定制**正文** | 同源 `POST /dsh-convfusion/<endpoint>`（落 `$DSH_HOME/convfusion/<file>.json`） | 用户拍板：设置文件绝不能因定制而变大 |
 *
 * ## 依赖约束
 *
 * 只 import `react` 与本 bundle 的本地模块。跨插件服务（`slots` / `configForms`）
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
import { syncCommandLine } from './sync-command.js'
import {
  buildUploadTree,
  flattenSingleRoot,
  folderState,
  nodeFilePaths,
  type UploadTreeNode,
} from './upload-tree.js'
import { publishActionPlan, type PublishActionItem } from './publish-actions.js'
import { acceptedProgressKey } from './mentorship-labels.js'
import { mentorshipView, type MentorshipView } from './mentorship-view.js'
import {
  decodeLevel,
  isPaperCondition,
  levelOptions,
  levelQuery,
  paperLevelOf,
  paperLevelText,
  type PaperLevel,
  type PaperLevelSystem,
} from './paper-level.js'

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
export interface HostAccountState {
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
   *
   * ⚠️ `grant` / `funded` 是**两池**（协议 28）：`grant`（赠送额度）只能买平台自营服务，
   * `funded`（资金池）是**唯一**能付给导师、能提现的部分 —— 接受指导冻结押金走它。
   * 两者为 `null` = 旧宿主不分开说（**不是 0**）：那时按 `available` 处理（旧语义下
   * 全部余额都能付导师），不许把账号误判成付不起。
   */
  tokens?: {
    available: number
    frozen: number
    total: number
    grant: number | null
    funded: number | null
  } | null
}

/**
 * 用量与配额（宿主 `account/usage` 的镜像，服务器 `GET /usage`）。
 *
 * 【账号】卡片的**仪表板**用它画"存储空间 / 已发布项目"两块小图。
 * ⚠️ 它是**尽力而为**的一份数据：读不到时宿主给 `null`（**不是** 0）——
 * 界面据实显示"未知"，不把"读不到"画成"还剩 0 字节"。
 */
interface HostUsage {
  /** 下一个项目发布要花的 Token。 */
  nextPublishCost: number
  /** 已付费（曾经发布过）的项目数。 */
  paidProjects: number
  /** 项目层级（阶梯号）。 */
  tier: number
  storage: {
    usedBytes: number
    capacityBytes: number
    availableBytes: number
    /** 每 N 字节 1 Token（扩容单价的分母）。 */
    bytesPerToken: number
  }
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
  /**
   * 卡片头的**折叠箭头**（展开时转 90°）。
   *
   * 折叠与否必须**一眼可见**：只靠"内容多了一段"不够（用户会以为功能没了）。
   * 尺寸取 15px（比卡片头的字号大一档）——它是这一行里**唯一**的交互提示，
   * 和旁边的徽章同一视觉重量才找得到；用固定宽度让旋转前后标题不动（▸ 转 90° 后
   * 字宽会变，不固定的话整行标题会跟着抖一下）。
   */
  chevron: {
    display: 'inline-block',
    flex: '0 0 auto',
    width: 14,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 1,
    color: 'var(--dsw-alias-label-secondary)',
    transition: 'transform .15s',
  } as React.CSSProperties,
  /**
   * 【账号】的仪表板：几块**小图**并排（Token / 存储 / 项目）。
   *
   * ⚠️ `flexWrap: 'wrap'` 是必需的：会话 Tab 那一列的宽度可以被拖得很窄，
   * 三块并排会被各压成一条；换行后每块各自保持可读。
   */
  dash: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  } as React.CSSProperties,
  /** 一块小图：左边图形，右边标题 + 数字（+ 一行注释）。 */
  dashTile: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: '1 1 190px',
    minWidth: 170,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'var(--dsw-alias-bg-layer-2)',
  } as React.CSSProperties,
  dashTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary)',
  } as React.CSSProperties,
  dashValue: {
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.2,
    color: 'var(--dsw-alias-label-primary)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  dashUnit: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-label-tertiary)',
    marginLeft: 3,
  } as React.CSSProperties,
  dashSub: {
    fontSize: 10.5,
    color: 'var(--dsw-alias-label-tertiary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  /**
   * 没有"比例"可画的那一块（已发布项目）：一个**圆形数字块**。
   *
   * 与圆环同尺寸（54×54），所以三块的眼睛落点在同一条线上；不为了凑形状
   * 给计数编一个分母（那会画出一张没有意义的饼）。
   */
  dashStat: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: 54,
    height: 54,
    borderRadius: 27,
    background: 'var(--dsw-alias-state-business-tertiary)',
    color: 'var(--dsw-alias-state-business-primary)',
    fontSize: 18,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
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
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  /**
   * 列表条数（显示成「我的 (2)」）。`null` = **还没读到** → 不显示数字。
   *
   * ⚠️ 与"0 条"必须分开：`0` 是一个**断言**（确实没有），`null` 是"还不知道"
   * （未登录 / 还在读 / 读失败）。把后者画成 `(0)` 就是在用假信息掩盖状态。
   */
  count?: number | null
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
      {typeof count === 'number' ? ` (${count})` : ''}
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

  // ── 定制文件的落盘位置对用户不可见 ──────────────────────────────────
  //
  // 「用户定制保存为文件、设置文档只记文件名」是**内部实现**：它保证 settings.yaml
  // 不会因定制内容变多而膨胀。用户不需要知道文件名，更不该看到"尚未创建"这种状态
  // —— 那只是"还没定制过"而已。因此这里不做任何 UI 暴露，也**不读取** scope 值。
  // 路径仍由 `src/config.ts` 管理（可通过 profile patch / 设置文档调整）。
  //
  // ⚠️ 2026-10：**这一页的所有写入都不走 `scope` 了**（检索凭据改走宿主的
  // `retrieval/*`，定制内容本来就走 `customization/*`）。原来那个"浏览器侧设置面不可写"
  // 的**只读徽章**因此删掉了 —— 它会与本页现在真的能保存的事实自相矛盾。
  // `scope` 仍由装配层注入（`index.tsx`），只是这一页不再读它。

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
   * 保存 / 清除 OpenAlex 检索凭据 —— **走宿主**（`retrieval/saveKey` / `clearKey`）。
   *
   * ⚠️ 别再改回浏览器侧的 `scope.set('openalexApiKey', …)`：那条路在非 loopback 页面上
   * 是**静默 no-op**（`configForm.set()` resolve `false` 且一个字节都不写），而它的返回值
   * 一被忽略，界面就会谎报「已保存」—— 2026-10 用户实测报告的那个 Bug
   * （"明明设置了 OpenAlex API Key，却总是显示未配置"）就是这么来的。
   *
   * 这里返回一个**可显示的错误**（`null` = 成功），由调用方决定要不要清空输入框：
   * 失败时**必须保留**用户粘贴的内容，否则他得再找一次 Key。
   */
  const writeRetrievalKey = React.useCallback(
    async (endpoint: 'retrieval/saveKey' | 'retrieval/clearKey', payload: unknown): Promise<string | null> => {
      try {
        // ⚠️ 直接走 `send`，不用上面的 `call`：那个辅助函数把**任何**响应都当成整页状态
        // `setState`（它只为 `state` 而写）。这两条端点回的是检索状态那一小块。
        const res = await send(endpoint, payload)
        if (!res || res.ok !== true) {
          // 旧宿主没有这两条端点 → 说清"需重启"，而不是让用户再试一次同样的失败
          return res?.error?.code === 'unknown-endpoint'
            ? t('community.error.hostRestart')
            : (res?.error?.message ?? t('community.error.unknown'))
        }
        // 宿主回的检索状态是**刚写完**的那一份，直接落进页面状态 —— 徽章立刻变"已配置"，
        // 不必等下一次整页读（旧实现里徽章永远停在旧值，这正是"总是未配置"的另一半原因）。
        const next = (res.value as { retrieval?: HostState['retrieval'] } | undefined)?.retrieval
        if (next) setState((prev) => (prev ? { ...prev, retrieval: next } : prev))
        return null
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    [send, t],
  )

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
          onSaveKey={(key) => writeRetrievalKey('retrieval/saveKey', { apiKey: key })}
          onClearKey={() => writeRetrievalKey('retrieval/clearKey', {})}
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
 * | 对方那一侧还没有文件 | 等待指导意见 | 待我指导 |
 * | 对方那一侧有文件 | 导师已指导 | 我已指导 |
 */

/**
 * 一条指导提案**在我眼里**是什么（方向 + 当事人 id 推出的派生量）。
 *
 * ## 为什么要有这一层（v0.6.0 出题模式的核心）
 *
 * 早先界面用一个 `incoming = (我是 researcher)` 同时表达了四件事：我要不要动作、
 * 我上传落在哪一侧、进展文案怎么称呼、谁的资料该给我看。**方向 B（导师出题）里
 * 这四件事不再一致** —— 项目 owner 是导师、发起人是学生、接受人是导师，
 * 继续用"我是不是 researcher"判断会在每一处都反过来。
 *
 * 所以统一在这里算清楚，其余地方只读这些派生量：
 *
 * | 派生量 | 方向 A（学生出题） | 方向 B（导师出题） |
 * |---|---|---|
 * | `iAmOwner`（服务器 `owner` 侧） | 我是学生 | 我是导师 |
 * | `mySide` | 学生 → `owner` | 导师 → `owner` |
 * | `iProposed` | 导师 | 学生 |
 * | `iAmAcceptor`（该我接受/拒绝） | 学生 | 导师 |
 */
interface HostProposalView extends MentorshipView {
  /** 我上传时要与自己比对的那一侧（服务器 `?source=`）。 */
  mySide: HostFileSide
  /** 对方的侧（下载读它）。 */
  otherSide: HostFileSide
  /** 要判断的那个人（对方）。 */
  counterparty: HostProposalParty | null
  /** 对方是导师吗（决定资料框的标题与措辞）。 */
  counterpartyIsMentor: boolean
}

/**
 * 从提案算出 {@link HostProposalView}（方向派生量在纯函数 {@link mentorshipView} 里，
 * 自检按**方向 × 我的角色**四格逐一钉住；这里只补"对方是谁"这一类需要完整对象的量）。
 */
function proposalView(p: HostProposal, myAccountId: string | null): HostProposalView {
  const base = mentorshipView(
    {
      direction: p.direction,
      mentorId: p.mentor?.id ?? null,
      researcherId: p.researcher?.id ?? null,
      proposedById: p.proposedById,
    },
    myAccountId,
  )
  return {
    ...base,
    mySide: base.mySide,
    otherSide: base.otherSide,
    counterparty: base.myRole === 'mentor' ? p.researcher : p.mentor,
    counterpartyIsMentor: base.myRole === 'researcher',
  }
}

/**
 * 「指导中」那一行的**进展文案**（`ACCEPTED` 之后）。
 *
 * `reviewFiles`（服务器口径）数的是**非 owner 那一侧**的去重文件数：
 * 方向 A 下那是导师的指导产物，方向 B 下那是**学生的交付**（项目 owner 是导师）。
 * 所以同一个数在两个方向下要换一套称呼 —— 而且按"是我传的还是对方传的"分。
 */
function progressLabelKey(p: HostProposal, view: HostProposalView): string {
  // 非 ACCEPTED → 显示状态名（那是另一套文案）；ACCEPTED 之后的规则见纯函数
  const accepted = acceptedProgressKey(p, view)
  return accepted ?? PROPOSAL_STATUS_KEYS[p.status] ?? p.status
}

/**
 * **我要下载的那一侧**的文件数（三态：`number` / `null` = 服务器说不知道 / `undefined` = 旧服务器）。
 *
 * 【下载】按钮与"先下载一次"提示**必须**共用这一个判据 —— v0.6.7 之前的 bug 就是没共用：
 * 提示按 `view.otherSide` 取数（学生下载 owner 侧 → 数导师的工作区），按钮却一律看
 * `reviewFiles`（= **非 owner 那一侧**，方向 B 下是**学生自己的交付**）。于是"导师出题 →
 * 学生选题"的关系里，导师的工作区有内容（提示让先下载）、学生自己的交付是 0 份（按钮判为
 * 没意义 → 隐藏），学生既被要求下载又没有下载按钮（2026-10-26 用户反馈）。
 *
 * 取数规则（与 `sideSyncHint` 完全一致）：
 *   · 下载 `owner` 侧 → `workspaceFiles`（owner 那一侧的工作区文件数）
 *   · 下载 `mentor` 侧（= 非 owner 侧 / review 侧）→ `reviewFiles`
 */
export function downloadSideCount(
  p: HostProposal,
  view: HostProposalView,
): number | null | undefined {
  return view.otherSide === 'owner' ? p.workspaceFiles : p.reviewFiles
}

/**
 * 【下载】能不能点：关系已建立，且**我要下载的那一侧**确实有东西。
 *
 * 下载回来的是"对方那一侧的快照"；那一侧空着时点了也没用，所以隐藏
 * （2026-09 用户反馈：还没有人上传，按钮却可点）。
 *
 * 三态纪律：`null`（查不到）/ `undefined`（旧服务器）→ **保留按钮** ——
 * 拿不到 ≠ 没有，不能因为一次探测失败就把一个可能可用的动作藏起来。
 */
export function canDownloadProposal(p: HostProposal, view: HostProposalView): boolean {
  if (p.status !== 'ACCEPTED') return false
  const count = downloadSideCount(p, view)
  return typeof count !== 'number' ? true : count > 0
}

/**
 * "我要下载的那一侧变了吗"该说的话（没有该说的 → `null`，界面就不显示）。
 *
 * 判据由宿主按侧算好（`syncBySide`），这里只做三件事：
 *   ① **取自己那一侧** —— `view.otherSide`（我下载对方那一侧：方向 A 的导师取 `owner`，
 *      方向 B 的导师取 `mentor`，方向 B 的学生取 `owner`）；
 *   ② 旧宿主（协议 <25）只有 `sync` 一个（含义是 owner 侧）→ 兜底认它；
 *   ③ 把 `neverDownloaded` 与"那一侧还是空的"分开：命令用户下载一个**空的**快照
 *      没意义（与 `canDownloadProposal` 的判据保持一致）。
 *
 * | `sync` | 文案 |
 * |---|---|
 * | `{ neverDownloaded: true }` 且那一侧有内容 | 先下载（手里没副本） |
 * | `{ changed: true, reason: 'uploaded' }` | 对方更新了文件，需要重新下载 |
 * | `{ changed: true, reason: 'deleted' }` | 对方删除了文件，需要重新下载 |
 * | `{ changed: false }` / `null` / `undefined` | 不提示（没动 / 无从判断 / 旧宿主） |
 */
function sideSyncHint(t: Translate, p: HostProposal, view: HostProposalView): string | null {
  // 新旧形状二选一：`syncBySide` 在就按侧取，否则退回旧的单值（它记的是 owner 侧）。
  // `undefined` 两种都算"这个字段不存在"（旧宿主）→ 无从判断，与 `null` 同处。
  const sync: HostSyncCheck | undefined = p.syncBySide ? p.syncBySide[view.otherSide] : p.sync
  // 三态纪律：`null`/`undefined` = 无从判断（旧服务器、不可知、旧宿主）→ 不编造
  if (!sync) return null
  if ('neverDownloaded' in sync) {
    // ⚠️ 与【下载】按钮**同一个**判据（`downloadSideCount`）：两边分叉正是 v0.6.7 的 bug ——
    // 提示"先下载"而按钮不出现，用户就卡死了。
    const count = downloadSideCount(p, view)
    // 那一侧还没有任何文件 → 没有可下载的东西，别催（下载按钮此时也是隐藏的，两边一致）
    if (typeof count !== 'number' || count === 0) return null
    return t('community.mentor.peerNeverDownloaded')
  }
  if (!sync.changed) return null
  return t(sync.reason === 'deleted' ? 'community.mentor.peerDeleted' : 'community.mentor.peerUpdated')
}

/**
 * 押金比例的**兜底值**（20%）。
 *
 * ⚠️ 只在拿不到 `mentor/fee-suggestion` 时才用它。正常情况下比例来自服务器的建议
 * （`suggested_deposit / suggested_fee`）—— 比例是平台策略，不能当常量抄到客户端。
 */
const DEFAULT_DEPOSIT_RATIO = 0.2

/**
 * 提案里**导师侧已不再采集**、但服务器当前仍要求非空的一个字段的过渡值。
 *
 * `guidance_scope`：服务器 `min_length=1` 必填，而导师侧已删掉这个输入
 * → 送占位符；学生侧展示时遇到占位符**整行不显示**（不显示"指导范围：-"）。
 *
 * ⚠️ 是**过渡值**：后端把这个字段改成可选（见
 * `dev-notes/v3-Mentorship-backend-spec.md` 的"追加需求"）之后，
 * 这里应改成"干脆不发这个字段"。
 */
const PROPOSE_SCOPE_PLACEHOLDER = '-'

/**
 * 提案对话框里**成功条件**的默认值（打开就是它）。
 *
 * v0.6.3 起成功条件由用户在对话框里选（论文类条件还要选等级，见 `paper-level.ts`）——
 * 它不再是"导师不指定、随便送一个默认值"的过渡值：**条件决定价格**（等级定价），
 * 所以它必须是一个用户能看见、能改的输入。默认停在「双方确认完成」= 最保守的约定，
 * 它不带等级，价格是双方约定的总额。
 */
const PROPOSE_DEFAULT_CONDITION = 'MUTUAL_COMPLETION'

function roleText(t: Translate, roles: string[]): string {
  if (!roles.length) return '—'
  return roles.map((r) => translateOr(t, ROLE_LABEL_KEYS[r] ?? r, r)).join(' · ')
}

/** 一项研究工作的展示行（宿主 `WorkItem` 的镜像）。 */
interface HostWork {
  projectId: string
  /**
   * **这次发布的名字**（服务器的 `title`）。
   *
   * ⚠️ 它历史上是发布方的本机工作区名 —— 列表要显示的是 {@link HostWork.workName}，
   * 这里只作旧服务器的兜底。
   */
  title: string
  /**
   * **这项研究工作的名字**（服务器的 `work_name`）—— 列表**该显示的名字**：
   * 有论文就是论文标题，否则是工作确定的主题。
   *
   * 为什么必须由服务器给：看这三个列表的人**本机不一定有那份 workspace**
   * （导师看学生的研究、学生看导师的选题），名字只能来自服务器上的数据。
   *
   * `undefined` = 旧服务器还没有这个字段 → 退回 `title`（不编造）。
   */
  workName?: string | null
  /**
   * 这一项属于哪个方向：【可指导】是学生发布的研究（`SEEK_MENTOR`），
   * 【可加入】是导师发布的选题（`SEEK_STUDENT`）。缺字段时宿主已归一到
   * `SEEK_MENTOR`，界面不必再兜底。
   */
  direction: HostProjectDirection
  /**
   * 作者（服务器 `owner: { id, display_name }` 的投影；宿主 `WorkItem.owner`）。
   *
   * 2026-10 服务器为 `/discovery/random` 加了该字段：【可指导】列表按它显示作者名。
   * `undefined` / `null` = 旧服务器没有（或该项无作者）→ 不显示，而不是编一个名字。
   */
  owner?: { id: string; displayName: string } | null
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
/**
 * 一项研究工作的**方向**（宿主 `ProjectDirection` 的镜像）。
 *
 * 两个方向共用同一套项目 / 提案 / 合同结构，差别只在谁拥有项目、谁发起、谁接受
 * （两个方向都是学生出钱、论文主体是学生）。缺字段 → 宿主已归一到 `SEEK_MENTOR`
 * （= 今天唯一存在的行为）。
 */
type HostProjectDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT'

interface HostLocalWork {
  /** 注册表 id（内部键）。 */
  id: string
  /** 会话工作区目录名。**只作兜底**：行上显示的是 `workName`。 */
  title: string
  /**
   * **这项研究工作自己的名字**（论文标题 > 已采纳主题 > 目录名兜底）。
   *
   * ⚠️ 行上必须显示它：`title` 是会话工作区目录名（如 `ConvFusion-dsh`），
   * 同一个会话工作区里可以有多项研究，用目录名区分不了（2026-10 用户要求）。
   */
  workName?: string
  /**
   * **这项研究工作的身份** `workspace_id`（服务器给；新建的本机研究是 `null`）。
   *
   * 发布之后服务器返回它、并落盘在本机（`.convfusion/work.json`）—— 从那以后
   * "这是哪一项研究"由它区分，而不是由工作区名区分。
   */
  workId?: string | null
  /**
   * **本机当前没有打开**这项研究工作（研究根不在当前会话工作区里），但它在网络上仍属于我。
   *
   * 这种行只显示"名字 + work_id + 已在网络中"，**不给发布/更新按钮**（没有文件可传）。
   * 好处：换进换出研究时，之前发布过的工作依然看得见 —— 列表按 **work_id** 归属。
   */
  detached?: boolean
  path: string
  researchRoot: string
  missingDir: boolean
  /** 进展阶段：稳定 id + 宿主原始 label（展示名按 locale 翻译，同「研究进展」面板）。 */
  stage: { id: string; label: string } | null
  overall: number
  /** 可数资产：稳定 key + 计数 + 结构化 detail。 */
  counts: Array<{ key: string; value: number; detail?: { code: string; count: number } }>
  /**
   * 这个工作区在**两个方向**上的发布记录，一个方向一条（`[]` = 还没发布过）。
   *
   * ⚠️ 为什么是数组：同一份工作区可以既发布成"学生求指导"、又发布成"导师招学生"
   * —— 服务器上是两个不同的项目。界面按 `direction` 找自己那一条，
   * 找不到就把按钮显示成「寻找…」而不是「更新…」。
   */
  published: Array<{
    /** 这条属于哪个方向。 */
    direction: HostProjectDirection
    projectId: string
    version: number
    updatedAt: string
    serverUrl: string
    accountId: string
  }>
  paper: boolean
  clarity: 'clear' | 'ambiguous' | 'blocked' | 'unknown'
  updatedAt: string
}

/**
 * 列表里该显示的**研究工作名**。
 *
 * 服务器的 `work_name` 优先（有论文就是论文标题，否则是工作确定的主题）；
 * 旧服务器（没有这个字段）才退回 `title`/`project_title` —— 那正是"目录名"的老行为，
 * 但**不编造**：拿不到工作名时显示旧字段，而不是空着或瞎猜一个。
 */
function workLabelOf(source: { workName?: string | null; title: string }): string {
  return source.workName?.trim() || source.title
}

/** 提案行上的研究工作名（`projectTitle` 只作旧服务器兜底；两者都没有 → `null`）。 */
function proposalWorkLabel(p: HostProposal): string | null {
  return p.workName?.trim() || p.projectTitle
}

/** 这个工作区在**某个方向**上已发布过吗（有则返回那条记录，`null` = 该方向还没发布）。 */
function publishedIn(
  w: HostLocalWork,
  direction: HostProjectDirection,
): HostLocalWork['published'][number] | null {
  return w.published.find((r) => r.direction === direction) ?? null
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
  /** **要发布到网络的名字** = 这项研究工作自己的名字（有论文用论文标题）。 */
  title: string
  /** 本机工作区名（注册表标题）—— 与 `title` 不同时对话框用一行提示指认是哪个工作区。 */
  workspaceTitle: string
  /** 名字从哪来的（`paper` / `topic` / `fallback`）。 */
  workNameSource: 'paper' | 'topic' | 'fallback'
  /** 这次要发布到哪个方向（宿主回显；对话框标题据此显示「寻找指导 / 寻找学生」）。 */
  direction: HostProjectDirection
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

/**
 * 【上传】对话框的数据（宿主 `mentor/uploadPlan` 的镜像）。
 *
 * 与发布用的 {@link HostUploadPlan} **同一个分类引擎**（`upload-selection`），
 * 只是口径是 `mentor`：`review/` 与论文 PDF 都算推荐，机器产物照样排除。
 */
interface HostMentorUploadPlan {
  workspaceId: string
  title: string
  path: string
  root: string
  plan: HostUploadPlan['plan']
}

/**
 * 【上传】对话框的工作区下拉项（宿主 `mentor/uploadState` 的镜像）。
 *
 * 只有**含研究定义**的工作区会出现在这里；`root` 是宿主解析出的研究根
 * （`<ws>/workspace/`，旧布局则是 `<ws>`）—— 显示出来，导师才能确认"传的是这一个"。
 */
interface HostUploadWorkspace {
  id: string
  title: string
  path: string
  root: string
}

/**
 * 【上传】对话框里"当前会话的工作区"（宿主 `mentor/uploadState` 的 `currentWorkspaceId`）。
 *
 * 与【下载】同一判据：宿主按 `sessionId` 解析出当前工作区，界面据此**默认选中它** ——
 * 导师回传的通常就是手上这份研究。`null` = 当前会话工作区不在可回传列表里。
 */

/**
 * 「目标工作区校验」从哪个宿主协议号开始有（见 `src/protocol.ts` 的 `23`）。
 *
 * 客户端**不按服务器**版本号判断（那是 `workspace_id` 字段在不在的事），但**宿主**这一侧
 * 得看协议号：旧宿主的 `mentor/downloadState` 既不返回 `targets`、也不返回 `protocol`，
 * 于是界面**完全不显示校验状态** —— 退回旧行为，而不是把"没有字段"渲染成"校验通过"。
 */
const HOST_PROTOCOL_MIN_FOR_CHECK = 23

/**
 * 一个**候选下载目标工作区**的校验结果（宿主 `mentor/downloadState` 的 `items[]` 镜像）。
 *
 * 判据是服务器给的研究工作标识 `workspace_id`（全局唯一、跨项目生命周期不变）：
 * 这个工作区里已有的 `workspace/` 和我要下载的是不是**同一项研究**。
 */
interface HostDownloadTarget {
  id: string
  title: string
  path: string
  /** 目录还在吗。 */
  exists: boolean
  /** 研究根绝对路径（已有或将会是）。 */
  researchRoot: string | null
  /** `nested` = `<ws>/workspace`；`legacy` = 研究直接在 `<ws>`；`null` = 还没有研究。 */
  layout: 'nested' | 'legacy' | null
  /**
   * 结论：
   * · `new` 还没有研究工作区 → 允许（按新建处理）
   * · `same` 同一项研究 → 允许（下载后融合）
   * · `other` **另一项研究** → 禁止
   * · `unknown` 有研究但读不到标识 → 默认禁止，二次确认可强制
   * · `unverifiable` 服务器没给标识 → 允许，但明说"无法校验"
   * · `missing` 目录不存在 → 禁止
   */
  status: 'new' | 'same' | 'other' | 'unknown' | 'unverifiable' | 'missing'
  /** 本地读到的标识（`null` = 读不到）。 */
  localWorkspaceId: string | null
  /** 工作区内标记与本地记录冲突（读到了但值不同）。 */
  identityConflict: boolean
}

/**
 * 项目文件空间的**两侧**（宿主 `FileSource` 的镜像）：`owner` = 学生自己那份，
 * `mentor` = 导师回传的那份。同一路径两侧并存、互不覆盖。
 */
type HostFileSide = 'owner' | 'mentor'

/**
 * 发布按钮的**固定宽度**（px）。
 *
 * 为什么不用"字数碰巧一样"：同一行的按钮文案随角色与状态变
 * （【寻找学生】/【寻找线上导师】/【更新研究工作】），导师那一档还要再接一个 ▾ ——
 * 让它们各自按内容撑宽，同一列在不同角色、不同状态下就宽度不一
 * （2026-10 用户实测：带 ▾ 的【寻找学生】明显更宽）。所以给一个固定宽度，
 * 宽度一致由**布局**保证，而不是靠文案长度。
 *
 * 最长文案是 6 个汉字（【寻找优秀学生】/【寻找线上导师】/【更新研究工作】），
 * 12.5px × 600 字重下约 80px，加内边距 ≈ 96px；带下拉时还要腾出箭头那一段
 * （约 22px）→ 取 128 留出余量，避免文案贴边或折行。
 */
const PUBLISH_BUTTON_WIDTH = 128

/**
 * 发布动作按钮：**一个主按钮**，次要动作收进拆分按钮的下拉里。
 *
 * ```text
 * 研究者    → 【寻找指导】
 * 导师      → 【寻找学生】 ▾（下拉里有【寻找指导】）
 * 已发布    → 【更新文件】
 * ```
 *
 * 为什么做成"一个按钮 + 下拉"：两个方向是**两种身份**（学生发布自己的工作 / 导师发布一个
 * 选题），一个工作只属于一个；而导师的【寻找指导】极少使用 —— 把它留在主线上会让
 * 导师每次都要在两行按钮里挑。谁是主按钮由 {@link publishActionPlan} 决定（可自检）。
 */
function PublishButton({
  t,
  item,
  more,
  busyHere,
  busyLabel,
  disabled,
  onPick,
}: {
  t: Translate
  item: PublishActionItem
  more: readonly PublishActionItem[]
  busyHere: boolean
  /** 发布中的文案（含百分比）；不在忙时为 null。 */
  busyLabel: string | null
  disabled: boolean
  onPick: (direction: HostProjectDirection) => void
}): JSX.Element {
  const [open, setOpen] = React.useState(false)
  /** 主按钮文案（含方向与"首次发布 / 更新"的区别）。 */
  const label = (it: PublishActionItem): string =>
    it.kind === 'update'
      ? t('community.action.republish')
      : it.direction === 'SEEK_STUDENT'
        ? t('community.action.seekStudent')
        : t('community.action.seekMentor')
  /** 提示语说清"发到哪一类列表"（同一条产品承诺：研究方法不会被上传）。 */
  const tip = (it: PublishActionItem): string =>
    it.kind === 'update'
      ? t(it.direction === 'SEEK_STUDENT' ? 'community.tip.republishTopic' : 'community.tip.republish')
      : t(it.direction === 'SEEK_STUDENT' ? 'community.tip.publishTopic' : 'community.tip.publish')

  // 点空白处收起下拉（否则它只能靠再点一次箭头关掉）
  React.useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  /** 主按钮：单独用时就是整宽；带下拉时占满固定宽度减去箭头那一小段。 */
  const main = (withCaret: boolean): JSX.Element => (
    <button
      type="button"
      style={{
        ...S.ghostBtn,
        ...(withCaret
          ? { flex: '1 1 auto', padding: '6px 8px', borderTopRightRadius: 0, borderBottomRightRadius: 0 }
          : { width: PUBLISH_BUTTON_WIDTH }),
      }}
      disabled={disabled}
      title={tip(item)}
      onClick={() => onPick(item.direction)}
    >
      {busyHere ? (busyLabel ?? t('community.action.loading')) : label(item)}
    </button>
  )

  if (more.length === 0) return main(false)

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        width: PUBLISH_BUTTON_WIDTH,
      }}
    >
      {main(true)}
      <button
        type="button"
        style={{
          ...S.ghostBtn,
          padding: '6px 6px',
          borderLeft: 'none',
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        }}
        disabled={disabled}
        title={t('community.tip.morePublish')}
        aria-label={t('community.tip.morePublish')}
        aria-expanded={open}
        onClick={(e) => {
          // 别让 document 的 pointerdown 立刻把刚打开的下拉关掉
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ▾
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            padding: 4,
            minWidth: 132,
            borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-1)',
            boxShadow: '0 6px 20px rgba(0,0,0,.16)',
          }}
        >
          {more.map((it) => (
            <button
              key={it.direction}
              type="button"
              style={{ ...S.ghostBtn, border: 'none', textAlign: 'left', padding: '6px 8px' }}
              disabled={disabled}
              title={tip(it)}
              onClick={() => {
                setOpen(false)
                onPick(it.direction)
              }}
            >
              {label(it)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 传输进度条（**两条上传路径共用**：发布研究工作、导师回传文件）。
 *
 * 抽成组件的理由不是省代码，而是**两条路径必须显示同一根条** ——
 * 各画一遍迟早分叉：2026-10 实测【我的】→ 发布带附件的工作时**根本没有进度**
 * （只有导师回传那条画了），几十 MB 下用户看到的就是一句「发布中…」。
 */
function TransferProgress({
  t,
  busy,
  progress,
}: {
  t: Translate
  busy: boolean
  progress: HostUploadProgress | null
}): JSX.Element | null {
  if (!busy) return null
  const pct =
    progress && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.sentBytes / progress.totalBytes) * 100))
      : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={S.hint}>
        {progress && progress.totalFiles > 0
          ? t('community.exchange.uploading', {
              done: progress.doneFiles,
              files: progress.totalFiles,
              sent: formatBytes(progress.sentBytes),
              total: formatBytes(progress.totalBytes),
            })
          : t('community.action.loading')}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--dsw-alias-border-l1)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct ?? 0}%`,
            background: 'var(--dsw-alias-brand-primary, #4a43ea)',
            transition: 'width 400ms linear',
          }}
        />
      </div>
    </div>
  )
}

/** 回传进度（宿主 `mentor/uploadProgress` 的镜像）。 */
interface HostUploadProgress {
  doneFiles: number
  totalFiles: number
  sentBytes: number
  totalBytes: number
  running: boolean
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

/** 一条指导提案：我发起的 / 我收到的（两个方向共用这个结构）。 */
interface HostProposal {
  id: string
  projectId: string
  /**
   * 这条提案所属的方向（服务器的 `direction`）。
   *
   * ⚠️ 界面**必须**靠它（而不是"我是什么角色"）判断：谁能接受、我上传落在哪一侧、
   * 进展文案怎么称呼。旧服务器缺字段 → 宿主已归一到 `SEEK_MENTOR`。
   */
  direction: HostProjectDirection
  /**
   * 谁发起了这次提案（服务器的 `proposed_by_id`）。
   *
   * `null` = 旧服务器不返回 → 界面按方向推断（`SEEK_MENTOR` → 导师发起；
   * `SEEK_STUDENT` → 学生发起）。"谁能接受"= **未发起的那一方**。
   */
  proposedById: string | null
  /** 项目标题（后端 enrich 后才有；缺 → null）—— 旧服务器的兜底，见 {@link HostProposal.workName}。 */
  projectTitle: string | null
  /** **这项研究工作的名字**（服务器的 `work_name`）：列表该显示的就是它。 */
  workName?: string | null
  mentor: HostProposalParty | null
  researcher: HostProposalParty | null
  guidanceScope: string
  totalFee: number
  depositAmount: number
  successPaymentAmount: number
  /**
   * 成功条件。`jcrLevel` / `ccfLevel` 只在**论文类**条件上出现（价格 = 等级）——
   * 列表行与接受确认框靠它们说清"这份提案按什么等级定价"。
   */
  successCondition: {
    type: string
    description: string | null
    jcrLevel?: number | null
    ccfLevel?: string | null
  }
  status: HostProposalStatus
  /**
   * 关系建立（ACCEPTED）后，**非 owner 那一侧**交付的文件数（服务器 `review_files`）。
   *
   * 提案状态接受之后就不再变了，而用户要看的是**指导进展**；这个事实只在项目文件里。
   * 宿主在 `mentor/list` 里补齐；`null` = 没查到（未知），不是"没有"。
   *
   * ⚠️ v0.6.0：它是**非 owner 侧**的计数 —— 方向 A 下是导师的指导产物，
   * **方向 B 下是学生的交付**（项目 owner 是导师）。所以进展文案要按方向换称呼。
   */
  reviewFiles?: number | null
  /** **owner 那一侧**当前的文件数（服务器 `workspace_files`；与上面同一套三态）。 */
  workspaceFiles?: number | null
  /** **owner 那一侧**最后一次上传的时间（服务器 `workspace_updated_at`）。 */
  workspaceUpdatedAt?: string | null
  /**
   * **非 owner 那一侧**最后一次上传的时间（服务器 `counterpart_updated_at`）。
   *
   * 与 `workspaceUpdatedAt` 配对，只是**另一侧**：方向 B 下导师靠它发现
   * "学生又交付了"。界面不直接用它 —— 宿主把它比进 `syncBySide.mentor`。
   */
  counterpartUpdatedAt?: string | null
  /**
   * **宿主算好的**"我要下载的那一侧变了吗"，**按侧给**（判别联合，见 `sync-watermarks.ts`）。
   *
   * - `{ neverDownloaded: true }` —— 本地没有**这一侧**的水位 = 从没下载过这一侧 → 提示"先下载"；
   * - `{ changed: true, reason: 'uploaded' | 'deleted' }` —— 下载过、对方又动过 → 提示重新下载；
   * - `{ changed: false }` —— 下载过、两个判据都说没动；
   * - `null` —— **无从判断**（旧服务器不给字段 / 服务器说不可知 / 只有一半判据可用）。
   *
   * ⚠️ 为什么两侧都要：界面取**自己下载的那一侧**（`otherSide`），而那是哪一侧由**方向**决定
   *   —— 方向 A 的导师下 `owner` 侧，方向 B 的导师下 `mentor` 侧。
   *
   * ⚠️ `undefined` = 旧宿主不返回这个字段 → 界面**不提示**（那不等于"没更新"），
   * 不许编成 false。
   */
  syncBySide?: {
    owner: HostSyncCheck
    mentor: HostSyncCheck
  } | null
  /**
   * **旧形状**（协议 < 25）：只有 owner 侧这一个判读结果；界面为兼容继续认它。
   *
   * 只在 `syncBySide` 缺失时读 —— 两份都在时以 `syncBySide` 为准。
   */
  sync?: HostSyncCheck
  expiresAt: string
  createdAt: string
}

/**
 * 一侧的"变了吗"判读结果（宿主 `checkSideChange` 的镜像）。
 *
 * ⚠️ **"从没下载过"与"无从判断"必须分开**（2026-10 用户指出）：前者手里没副本、
 * 该提示下载；后者是判不出来，不该编造。早先两者都在 `null` 里 → 导师第一次进
 * 【指导中】一声不吭，而学生明明更新过了。
 */
type HostSyncCheck =
  | { neverDownloaded: true }
  | { changed: boolean; reason: 'uploaded' | 'deleted' | null }
  | null

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
  author,
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
  /** 作者显示名（【可指导】传；【我的】是自己的研究，不传）。 */
  author?: string | null
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
          {author ? <span>{t('community.work.byAuthor', { name: author })}</span> : null}
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
 * 复制文本到剪贴板。
 *
 * ⚠️ 两条路都要有：`navigator.clipboard` 需要**安全上下文**（回环地址算，所以 DSH Web
 * 正常可用），拿不到时退到 `execCommand('copy')` 那套老办法。
 * 无论哪条路失败都**只返回 false、不抛** —— 复制失败不该让界面崩，也不该打断下载。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?(t: string): Promise<void> } } })
      .navigator?.clipboard
    if (clipboard?.writeText) {
      await clipboard.writeText(text)
      return true
    }
  } catch {
    /* 落到下面的兜底 */
  }
  try {
    const doc = (globalThis as { document?: Document }).document
    if (!doc?.body) return false
    const area = doc.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    doc.body.appendChild(area)
    area.select()
    const okText = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false
    doc.body.removeChild(area)
    return Boolean(okText)
  } catch {
    return false
  }
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
 * - 分类可整体勾选；展开后是**目录树**（用户 2026-10："能不能去掉/选择某一个文件夹"）：
 *   目录行自带三态复选框，点一下就是整枝加入/整枝移出；文件行仍可单独调整
 *   ——"允许调整落到文件级"这条老契约没变，只是多了一层更省力的粒度；
 *   ```text
 *   ┈ papers/                                    ← 面包屑（唯一根目录已剥掉）
 *   ▸ paper-hmem-tpami/    300 项 · 8.17 MB      ← 目录：复选 + 点开（整枝 300 项）
 *   ·   paper.md           48 KB                 ← 文件：单独勾选
 *   ```
 * - 体积/项数/成本/余量/批次数全部实算并显示；
 * - 超过服务器单文件上限（100 MB）的文件**标出来说明传不上去**。
 */
/**
 * **分类清单**（发布对话框与导师回传对话框共用）。
 *
 * 两个对话框问的是同一件事 —— "这次传哪些文件" —— 区别只在数据来源与口径
 * （`publish` / `mentor`），渲染抄两遍是迟早写歪的写法（同 RefreshIconButton 的理由）。
 *
 * ⚠️ 只显示**可选**的分类（`recommended` / `optional`）：`excluded`（机器产物）
 * 一概不出现（2026-09 用户拍板），它留在数据里只为对账。
 */
function UploadCategoryList({
  t,
  categories,
  maxFileBytes,
  selection,
  expanded,
  onToggleFiles,
  onToggleExpand,
}: {
  t: Translate
  categories: HostUploadPlan['plan']['categories']
  maxFileBytes: number
  selection: ReadonlySet<string>
  expanded: ReadonlySet<string>
  /**
   * 勾选**一组**文件（分类整选、目录整枝切换共用）。
   *
   * 原先分成 `onToggleCategory(categoryId, files, next)` / `onToggleFile(relPath, next)` 两个，
   * 但前者其实也是"对一组文件做同样的动作"，`categoryId` 在两端实现里都没被用到 ——
   * 目录树出现后合并成一个（见 `upload-tree.ts` 文件头）。
   */
  onToggleFiles: (relPaths: string[], next: boolean) => void
  onToggleExpand: (categoryId: string) => void
}): JSX.Element {
  const visible = categories.filter((c) => c.decision !== 'excluded' && c.files.length > 0)
  return (
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
                onChange={(e) => onToggleFiles(files.map((f) => f.relPath), e.target.checked)}
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
              <div style={{ maxHeight: 240, overflow: 'auto', padding: '4px 12px 10px 34px' }}>
                <CategoryFileTree
                  t={t}
                  categoryId={cat.id}
                  files={files}
                  selection={selection}
                  maxFileBytes={maxFileBytes}
                  onToggleFiles={onToggleFiles}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 一个分类的**文件目录树**（发布 / 回传对话框里「展开」之后那一段）。
 *
 * 为什么不再平铺：一个分类几百个文件，想排除 `research/literature/fulltext/` 这种整枝，
 * 平铺就得逐个点几百下（用户 2026-10 的诉求）。树以后**目录行自带三态复选框**：
 * 点一下就是"整枝加入 / 整枝移出"，文件行仍可单独调整 —— 也就是"允许调整落到文件级"这条
 * 老契约没变，只是多了一个省力的粒度。
 *
 * 约定：
 * - **默认只展开到第一层**（看到的就是一级目录）—— 深层按需点开，几百项也不会一次全渲染；
 * - 目录行显示 `整枝文件数 · 整枝体积`，文件名 + 单文件体积；超上限仍标 ⚠；
 * - 宿主写的**跳过占位项**（`node_modules/` 之类，`relPath` 以 `/` 结尾）渲染成灰色的
 *   "已跳过"行、**不给复选框**（勾了也没有文件可传）。
 */
function CategoryFileTree({
  t,
  categoryId,
  files,
  selection,
  maxFileBytes,
  onToggleFiles,
}: {
  t: Translate
  categoryId: string
  files: HostUploadPlan['plan']['categories'][number]['files']
  selection: ReadonlySet<string>
  maxFileBytes: number
  onToggleFiles: (relPaths: string[], next: boolean) => void
}): JSX.Element {
  /*
   * 真实数据里一个分类几乎总是"全部在同一个顶层目录下"，所以先剥掉唯一的根
   * （`plans/…` → 直接看 `history/` 与各文件），否则点开「展开」只看到一层壳。
   * 剥掉的前缀以灰色面包屑显示（见 `CategoryFileTreeView`）。
   */
  const tree = React.useMemo(() => flattenSingleRoot(buildUploadTree(files)), [files])
  /*
   * 展开中的目录。键带分类前缀：同一份 `Map` 可能同时管多个分类（其实每个分类是独立组件，
   * 但这样即使将来把它们合并成一个也不会串）。
   */
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set<string>())
  const toggleOpen = (path: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      const key = `${categoryId}::${path}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <CategoryFileTreeView
      t={t}
      nodes={tree.nodes}
      prefix={tree.prefix}
      open={open}
      categoryId={categoryId}
      selection={selection}
      maxFileBytes={maxFileBytes}
      onToggleFiles={onToggleFiles}
      onToggleOpen={toggleOpen}
    />
  )
}

/**
 * 树的**纯渲染**部分（无 hook）：状态由 {@link CategoryFileTree} 用 `useState` 持有。
 *
 * 拆出来是为了能被离线自检**真的渲染一遍**（`scripts/verify-settings-page.mjs` 的渲染段
 * 直接调用无 hook 组件，见那里的 `expand()`）；带 hook 的组分只能在 React 里跑。
 */
/**
 * 一个目录一次最多渲染多少行。
 *
 * 真实工作区里 `experiments/github-repo/` 有 **6800+** 个文件：整枝展开会把浏览器卡住。
 * 所以超过这个数就只画前 MAX_CHILD_ROWS 行 + 一行"还有 N 项"提示 ——
 * **整枝勾选不受影响**（那只依赖树上的文件清单，不依赖渲染了多少行）。
 */
const MAX_CHILD_ROWS = 200

export function CategoryFileTreeView({
  t,
  nodes,
  prefix = '',
  open,
  categoryId,
  selection,
  maxFileBytes,
  onToggleFiles,
  onToggleOpen,
}: {
  t: Translate
  nodes: readonly UploadTreeNode[]
  /** 被剥掉的顶层前缀（如 `research/literature`）：渲染成一行灰色面包屑，没有则为空串。 */
  prefix?: string
  /** 展开中的目录（键 = `${categoryId}::${path}`）。 */
  open: ReadonlySet<string>
  categoryId: string
  selection: ReadonlySet<string>
  maxFileBytes: number
  onToggleFiles: (relPaths: string[], next: boolean) => void
  onToggleOpen: (path: string) => void
}): JSX.Element {
  /**
   * 画一层节点；**任何一层**超过 {@link MAX_CHILD_ROWS} 都只画前 N 个 + 一行"还有 N 项"。
   *
   * 截断必须在**每一层**（含剥层后的根层）：`flattenSingleRoot` 可能把
   * `experiments/github-repo/` 这种 6800+ 文件的目录一路剥到根层 —— 那里同样不能一次全画。
   * 截断只影响**画多少行**，整枝勾选仍覆盖全部文件（那依赖树上的文件清单）。
   */
  const renderNodes = (list: readonly UploadTreeNode[], depth: number): JSX.Element[] => {
    const shown = list.slice(0, MAX_CHILD_ROWS)
    const hidden = list.length - shown.length
    const rows = shown.flatMap((node) => {
      const pad = 8 + depth * 14
      if (node.kind === 'dir') {
        const isOpen = open.has(`${categoryId}::${node.path}`)
        const state = folderState(node, selection)
        const rows: JSX.Element[] = [
          <div
            key={`d:${node.path}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', paddingLeft: pad }}
          >
            {node.placeholder ? (
              <span style={{ width: 14 }} />
            ) : (
              <button
                type="button"
                aria-label={isOpen ? t('community.publish.collapse') : t('community.publish.expand')}
                onClick={() => onToggleOpen(node.path)}
                style={{
                  ...S.linkBtn,
                  // `+/−` 用等宽字体 + 固定宽高：开合时不左右跳动，也不依赖旋转动画
                  width: 14,
                  height: 14,
                  lineHeight: '14px',
                  padding: 0,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  textAlign: 'center',
                  color: 'var(--dsw-alias-text-secondary)',
                }}
              >
                {isOpen ? '−' : '+'}
              </button>
            )}
            {node.placeholder ? (
              <span style={{ width: 13 }} />
            ) : (
              <input
                type="checkbox"
                checked={state === 'all'}
                ref={(el) => {
                  if (el) el.indeterminate = state === 'some'
                }}
                onChange={(e) => onToggleFiles(nodeFilePaths(node), e.target.checked)}
              />
            )}
            {/* 目录名**也能点开/收起**（不只那个小三角）—— 树里最常按的就是目录名 */}
            <button
              type="button"
              onClick={() => onToggleOpen(node.path)}
              disabled={node.placeholder}
              style={{
                ...S.mono,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: node.placeholder ? 'default' : 'pointer',
                color: node.placeholder ? 'var(--dsw-alias-text-secondary)' : 'inherit',
                font: 'inherit',
                fontFamily: 'var(--dsw-alias-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
              }}
            >
              {node.name}/
            </button>
            <span style={{ ...S.hint, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {node.placeholder
                ? t('community.publish.skippedDir')
                : `${node.count} · ${formatBytes(node.bytes)}`}
            </span>
          </div>,
        ]
        if (isOpen && node.children.length > 0) rows.push(...renderNodes(node.children, depth + 1))
        return rows
      }
      return [
        <label
          key={`f:${node.path}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', paddingLeft: pad + 33 }}
        >
          <input
            type="checkbox"
            checked={selection.has(node.path)}
            onChange={(e) => onToggleFiles([node.path], e.target.checked)}
          />
          <span
            style={{ ...S.mono, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={node.path}
          >
            {node.name}
          </span>
          <span style={{ ...S.hint, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {formatBytes(node.bytes)}
            {node.bytes > maxFileBytes ? ` ⚠ ${t('community.publish.tooLarge')}` : ''}
          </span>
        </label>,
      ]
    })
    if (hidden > 0) {
      rows.push(
        <div
          key={`more:${depth}:${list.length}`}
          style={{ ...S.hint, padding: '2px 0', paddingLeft: 8 + depth * 14 + 33 }}
        >
          {t('community.publish.moreItems', { count: hidden })}
        </div>,
      )
    }
    return rows
  }

  if (nodes.length === 0) return <div style={S.hint}>{t('community.exchange.noUploadFiles')}</div>
  return (
    <div>
      {prefix ? (
        <div style={{ ...S.hint, ...S.mono, padding: '2px 0 4px 8px', opacity: 0.75 }}>
          {prefix}/
        </div>
      ) : null}
      {renderNodes(nodes, 0)}
    </div>
  )
}

function PublishDialog({
  t,
  data,
  selection,
  remember,
  expanded,
  busy,
  progress,
  onToggleFiles,
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
  /** 上传进度（宿主按批上报）——附件大时这一行就是"慢 ≠ 死"的唯一判据。 */
  progress: HostUploadProgress | null
  onToggleFiles: (relPaths: string[], next: boolean) => void
  onToggleExpand: (categoryId: string) => void
  onRemember: (next: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  /*
   * 清单本体交给 {@link UploadCategoryList}（与导师回传对话框共用）；这里只算汇总。
   * `excluded`（机器产物）在组件里就被滤掉了，所以汇总与清单天然一致。
   */
  const selectable = data.plan.categories
    .filter((c) => c.decision !== 'excluded')
    .flatMap((c) => c.files)
  const selectedFiles = selectable.map((f) => f.relPath).filter((r) => selection.has(r))
  const selectedBytes = selectable
    .filter((f) => selection.has(f.relPath))
    .reduce((n, f) => n + f.size, 0)
  const batches = Math.max(1, Math.ceil(selectedFiles.length / data.plan.limits.maxFilesPerRequest))
  const storage = data.usage?.storage
  const oversizeSelected = selectable.filter(
    (f) => selection.has(f.relPath) && f.size > data.plan.limits.maxFileBytes,
  )

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
          {/*
            标题里是**要发布到网络的名字**（这项工作自己的名字：有论文就是论文标题），
            而不是本机工作区名 —— 用户点完就能对上网络里会出现什么。
            本机工作区名在下面用一行提示指认（两者不同时才出现）。
          */}
          {t('community.publish.title', { title: data.title })}
          {/*
            这一版有两个发布方向，**必须**在确认框里说清发到哪一边 ——
            否则用户在同一个对话框里分不出自己点的是【寻找指导】还是【寻找学生】，
            而两者的后果（出现在谁的列表里）完全不同。
          */}
          <Badge tone="neutral">
            {t(data.direction === 'SEEK_STUDENT' ? 'community.action.seekStudent' : 'community.action.seekMentor')}
          </Badge>
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
          {/*
            名字与本机工作区名不同 → 指认一下是**哪个本机工作区**（对话框是从某一行打开的，
            但那行显示的是注册表标题，与上面的名字不一样，不说一句会让人以为点错了）。
          */}
          {data.workspaceTitle && data.workspaceTitle !== data.title ? (
            <div style={S.hint}>{t('community.publish.workspaceHint', { workspace: data.workspaceTitle })}</div>
          ) : null}
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

          <UploadCategoryList
            t={t}
            categories={data.plan.categories}
            maxFileBytes={data.plan.limits.maxFileBytes}
            selection={selection}
            expanded={expanded}
            onToggleFiles={onToggleFiles}
                        onToggleExpand={onToggleExpand}
          />

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
            {/* 发布中：与导师回传同一根进度条（附件阶段是几十 MB 的一串请求） */}
            <div style={{ flexBasis: '100%' }}>
              <TransferProgress t={t} busy={busy} progress={progress} />
            </div>
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
 * ⚠️ 为什么必须有它：接受会把押金从可用的钱转到 `frozen` —— 这是真正动 Token 的
 * 操作。用户规则是"所有扣费操作都要先提醒，不能点击即生效"。所以点【接受】只是
 * 打开这个框；点了「确认接受」才发请求。
 *
 * 框里必须说清三件事：跟谁合作（对方 + 机构）、冻多少钱（押金）、**冻的是谁的钱**。
 *
 * ⚠️ `iPayer`（v0.6.0）：两个方向都是**学生**出钱，但接受的人不同 ——
 * 方向 A 由学生接受（冻的是我自己的，要显示我的余额），方向 B 由导师接受
 * （冻的是**学生**的，显示导师自己的余额是误导，所以不显示）。
 *
 * ⚠️ **资金池（v0.6.3）**：押金只能从 `funded`（资金池）冻结，赠送额度**不能**付给导师。
 * 所以"我就是学生"时，这里用 `funded` 而不是两池之和来判断 —— 余额够但全在赠送池里时，
 * 点【确认接受】只会拿到 402。既然客户端已经知道这件事，就该在**点之前**拦住，
 * 并把可行动作写出来（自助付费尚未开通 → 找管理员发放 Token）。
 * 旧宿主不分开报两池（`funded === null`）→ 退回按 `available` 判断（旧语义下没错）。
 *
 * ⚠️ **导出是给离线自检用的**（`verify-settings-page.mjs` 把组件当普通函数调、遍历产出的树）：
 * 它**没有 hook**（状态都在上层 `CommunityTab` 里）才可能这样跑；加了 hook 就走不通了
 * （那时改回断言源码）。
 */
export function AcceptConfirmDialog({
  t,
  proposal,
  party,
  partyIsMentor,
  iPayer,
  balance,
  funded,
  grant,
  onCancel,
  onConfirm,
}: {
  t: Translate
  proposal: HostProposal
  /** 对方（方向 A 是导师、方向 B 是学生）。 */
  party: HostProposalParty
  partyIsMentor: boolean
  /** 押金是不是从我自己的账户冻结（= 我就是学生）。 */
  iPayer: boolean
  /** 可用余额（两池之和）；旧宿主只有这一个数。 */
  balance: number | null
  /** 资金池（能付给导师的那一池）；旧宿主 → `null`（按 `balance` 判断）。 */
  funded: number | null
  /** 赠送额度（只能买自营服务）；旧宿主 → `null`。 */
  grant: number | null
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const affiliation = [party.profile?.institution, party.profile?.department]
    .filter(Boolean)
    .join(' · ')
  /**
   * 押金付不付得起：只认**资金池**。
   *
   * `funded === null`（旧宿主）→ `null` = 判不出来，不拦（旧服务器上两池本来就是一体的，
   * 拦了反而会挡住本来能接受的人）。
   */
  const payable = funded === null ? null : funded >= proposal.depositAmount
  const short = iPayer && payable === false
  /** 论文类条件带出的等级（"论文被接收"到底按几区定价）—— 没有就是普通的约定条件。 */
  const level = paperLevelOf(proposal.successCondition)
  const levelText = paperLevelText(level)
  return (
    <div
      style={S.overlay}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ ...S.card, width: 'min(460px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t(iPayer ? 'community.mentor.acceptConfirmTitle' : 'community.mentor.acceptConfirmTitleOther')}
          <span style={{ flex: '1 1 auto' }} />
          {/* 论文类条件把等级摆出来：接受的是"按这个等级定价"的约定，不该只看到总数 */}
          {levelText ? <Badge tone="neutral">{t(levelText.key, levelText.params)}</Badge> : null}
          <Badge tone="brand">
            {t(
              iPayer ? 'community.mentor.acceptConfirmBadge' : 'community.mentor.acceptConfirmBadgeOther',
              { deposit: proposal.depositAmount },
            )}
          </Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>
            {t(
              partyIsMentor ? 'community.mentor.mentorIs' : 'community.mentor.researcherIs',
              { name: party.displayName || t('community.mentor.unknownParty') },
            )}
          </div>
          {affiliation ? <div style={S.hint}>{affiliation}</div> : null}
          <div style={S.hint}>
            {t('community.mentor.feeText', {
              total: proposal.totalFee,
              deposit: proposal.depositAmount,
              success: proposal.successPaymentAmount,
            })}
          </div>
          {/* 冻结语义说清楚：钱还是学生的，只是不可用 */}
          <div style={S.hint}>
            {t(
              iPayer ? 'community.mentor.acceptFreezeNote' : 'community.mentor.acceptFreezeNoteOther',
              { deposit: proposal.depositAmount },
            )}
          </div>
          {/* 余额只在"冻的是我的钱"时显示 —— 冻别人的钱时我的余额与本操作无关。
              有资金池就**只报资金池**：赠送额度再多也付不了押金，报个总数只会误导。 */}
          {iPayer ? (
            <div style={S.hint}>
              {typeof funded === 'number'
                ? typeof grant === 'number'
                  ? t('community.mentor.acceptPools', { funded, grant })
                  : t('community.mentor.acceptFundedOnly', { funded })
                : typeof balance === 'number'
                  ? t('community.mentor.acceptBalance', { balance })
                  : t('community.briefConfirm.balanceUnknown')}
            </div>
          ) : null}
          {/*
            资金池不够 → **点之前**就拦住，并把可行动作说出来：自助付费尚未开通，
            唯一的办法是找管理员发放 Token（服务器 402 的原话也是这句）。
          */}
          {short ? (
            <div style={{ ...S.hint, color: 'var(--dsw-alias-state-warn-primary)' }}>
              {t('community.mentor.acceptNoFunded', {
                funded: funded ?? 0,
                grant: grant ?? 0,
                deposit: proposal.depositAmount,
              })}
            </div>
          ) : null}
          <div style={S.footer}>
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" style={S.ghostBtn} onClick={onCancel}>
              {t('community.action.cancel')}
            </button>
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: short ? 0.55 : 1 }}
              disabled={short}
              onClick={onConfirm}
            >
              {t('community.mentor.acceptConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * **Token 余额环形图**（SVG，无外部库）——只画**弧**，不画字。
 *
 * 三段弧：**资金池**（品牌蓝，能付给导师、能提现）、**赠送**（浅品牌色，只能买平台自营
 * 服务）、**冻结**（灰色，押金，仍是自己的钱）。比例一眼能看懂，比几行数字快。
 *
 * ⚠️ **字一律不放进 SVG**（2026-10 用户反馈的可读性）：viewBox 固定 160、显示尺寸只有
 * 90–100px，SVG 里的 9–22px 字被等比缩到 5–13px，等于不可读。精确数字交给旁边的
 * **HTML 图例**（缩放不改变字号），这里只承担"比例"这一件事。
 *
 * ⚠️ 用 `stroke-dasharray` 控制弧长，这是 SVG 环形图的标准做法（不用 path，简单且
 * 能在纯 React 里写死）。`transform` 旋转使各段衔接无缝。
 *
 * ⚠️ SVG 内部固定 viewBox=160x160（计算简单可靠），用 CSS width/height 控制显示尺寸。
 * 不要动态改变 viewBox——这会导致渲染异常（弧形断开）。
 */
function TokenDonut({
  funded,
  grant,
  frozen,
  total,
  size = 100,
}: {
  /** 资金池；旧宿主 → `null`（那一版没有两池，整圈按"可用"画）。 */
  funded: number | null
  /** 赠送额度；旧宿主 → `null`。 */
  grant: number | null
  frozen: number
  /** 可用 + 冻结（分母）。 */
  total: number
  size?: number
}): JSX.Element {
  const r = 64
  const cx = 80
  const cy = 80
  const circumference = 2 * Math.PI * r
  const denom = total > 0 ? total : 1
  /**
   * 弧段表（顺序 = 绘制顺序 = 起点相接的顺序）。
   *
   * 旧宿主（两池未知）→ 只有一段"可用"（品牌蓝）：与 v0.6.2 的观感一致，
   * 不凭空画出一段"赠送"来冒充新语义。
   */
  const segments: Array<{ value: number; stroke: string }> =
    funded === null || grant === null
      ? [{ value: Math.max(0, total - frozen), stroke: 'var(--dsw-alias-state-business-primary)' }]
      : [
          { value: funded, stroke: 'var(--dsw-alias-state-business-primary)' },
          { value: grant, stroke: 'var(--dsw-alias-state-business-tertiary)' },
        ]
  if (frozen > 0) segments.push({ value: frozen, stroke: 'var(--dsw-alias-label-secondary)' })

  let offset = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const dash = circumference * (s.value / denom)
      const arc = (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={s.stroke}
          strokeWidth={14}
          strokeLinecap="butt"
          strokeDasharray={`${dash} ${circumference}`}
          strokeDashoffset={-offset}
          transform={`rotate(90 ${cx} ${cy})`}
        />
      )
      offset += dash
      return arc
    })

  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden="true">
      {/* 背景轨道（完整圆圈，淡色）：总余额为 0 时也能看出"这是个环" */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--dsw-alias-bg-layer-2)" strokeWidth={14} />
      {arcs}
    </svg>
  )
}

/** 环形图旁边的一行图例：色点 + 名称 + 精确数字（HTML 文本，不随图形缩放）。 */
function TokenLegendRow({
  color,
  label,
  value,
  hint,
}: {
  color: string
  label: string
  value: string
  hint?: string
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: color,
          flex: '0 0 auto',
        }}
      />
      <span style={{ ...S.hint, flex: '0 0 auto' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>{value}</span>
      {hint ? <span style={S.hint}>{hint}</span> : null}
    </div>
  )
}

/**
 * 仪表板里的**小圆环**（只有弧，没有文字）。
 *
 * 为什么不复用 {@link TokenDonut}：那张图把总额与图例画在 SVG **内部**，而 viewBox
 * 是固定 160 —— 缩到 54px 时那些字只有 3–7px，等于没有。小图只承担"比例"一件事，
 * 精确数字交给旁边**可读的 HTML 文本**（缩放不改变字号）。
 *
 * @param fraction 0–1；超出范围或非有限值一律夹住（服务器给什么数字都不能画坏）
 * @param tone 品牌蓝（正常）/ 警告色（快满）/ 中性（未知）
 */
function UsageRing({
  fraction,
  size = 54,
  tone = 'brand',
}: {
  fraction: number
  size?: number
  tone?: 'brand' | 'warn' | 'neutral'
}): JSX.Element {
  const r = 64
  const c = 80
  const circumference = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  const stroke =
    tone === 'warn'
      ? 'var(--dsw-alias-state-warn-primary)'
      : tone === 'neutral'
        ? 'var(--dsw-alias-label-tertiary)'
        : 'var(--dsw-alias-state-business-primary)'
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      {/* 背景轨道：即使比例是 0 也能看出"这里有个表" */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--dsw-alias-bg-layer-2)" strokeWidth={14} />
      {f > 0 ? (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${circumference * f} ${circumference}`}
          transform={`rotate(90 ${c} ${c})`}
        />
      ) : null}
    </svg>
  )
}

/**
 * 仪表板里的**一块小图**：左边图形、右边标题 + 数字 + 一行注释。
 *
 * 三块用同一个骨架，所以宽度不一致时眼睛也能横向对齐；数字一律走 `value`，
 * 不许把数字写进图形里（图形会被缩放，数字不会）。
 */
function DashTile({
  title,
  chart,
  value,
  unit,
  sub,
}: {
  title: string
  chart: React.ReactNode
  value?: string | null
  unit?: string | null
  sub?: string | null
}): JSX.Element {
  return (
    <div style={S.dashTile}>
      {chart}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={S.dashTitle}>{title}</span>
        {value ? (
          <span style={S.dashValue}>
            {value}
            {unit ? <span style={S.dashUnit}>{unit}</span> : null}
          </span>
        ) : null}
        {sub ? <span style={S.dashSub}>{sub}</span> : null}
      </div>
    </div>
  )
}

/**
 * **Token 余额弹窗**（点账号行的余额徽章打开，2026-09 用户要求）。
 *
 * 三件事：① 余额明细（**两池**：资金池 / 赠送，+ 可用 / 冻结 / 合计）；
 * ② **续费说明**（目前由管理员发放，暂未开通自助付费）；③ **申请续费** ——
 * 往服务器写一条申请记录，管理员事后在服务器上处理（本插件不接真实付费）。
 *
 * ⚠️ **两池为什么必须分开显示**（v0.6.3）：只有**资金池**能付给导师、能提现，
 * 赠送额度只能买平台自营服务。混成一个"可用余额"会让用户在点【接受指导】时
 * 撞上 402 而完全不明白为什么 —— 数字明明够。
 *
 * ⚠️ **防重复申请**：服务器 `POST /tokens/recharge-requests` **不幂等**（每次调用新增一条
 * `PENDING`），所以这里在打开时读一次自己的申请记录，有 `PENDING` 就**不再给表单**
 * （显示"已申请 N Token，等待管理员处理"）。不靠按钮禁用来兜 —— 用户重开弹窗也必须挡住。
 *
 * 数量是**必填**的：服务器 `RechargeRequestCreate.amount` 是 `gt=0` 的必填字段，
 * 申请得说清要多少（这正是管理员批准时的依据）。
 *
 * ⚠️ **导出是给离线自检用的**（同 `AcceptConfirmDialog`）：它没有 hook，所以能被直接调用、
 * 遍历产出的树，"两池是否真的分列"才验得动。
 */
export function TokenDialog({
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
  tokens: {
    available: number
    frozen: number
    total: number
    grant: number | null
    funded: number | null
  } | null
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
  /** 两池已知吗（旧宿主只有"可用"，分不出哪一份能付给导师）。 */
  const pools = tokens !== null && tokens.funded !== null && tokens.grant !== null

  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
      <div style={{ ...S.card, width: 'min(460px, 94vw)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <div style={S.cardHead}>
          {t('community.token.dialogTitle')}
          <span style={{ flex: '1 1 auto' }} />
          <RefreshIconButton t={t} busy={loading} onClick={onRefresh} />
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          {/* ① 左侧：环形图 + **HTML** 图例（数字不放进 SVG，缩放后仍可读）；
              右侧：续费说明 + 申请表单 */}
          {tokens ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* 左侧：环形图 + 图例 */}
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <TokenDonut
                  funded={tokens.funded}
                  grant={tokens.grant}
                  frozen={tokens.frozen}
                  total={tokens.total}
                  size={92}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* 两池已知就按池列（资金池 = 能付导师的那一份），否则退回旧的"可用 / 冻结" */}
                  {pools ? (
                    <>
                      <TokenLegendRow
                        color="var(--dsw-alias-state-business-primary)"
                        label={t('community.token.funded')}
                        value={String(tokens.funded)}
                        hint={t('community.token.fundedHint')}
                      />
                      <TokenLegendRow
                        color="var(--dsw-alias-state-business-tertiary)"
                        label={t('community.token.grant')}
                        value={String(tokens.grant)}
                        hint={t('community.token.grantHint')}
                      />
                    </>
                  ) : (
                    <TokenLegendRow
                      color="var(--dsw-alias-state-business-primary)"
                      label={t('community.token.available')}
                      value={String(tokens.available)}
                    />
                  )}
                  {tokens.frozen > 0 ? (
                    <TokenLegendRow
                      color="var(--dsw-alias-label-secondary)"
                      label={t('community.token.frozen')}
                      value={String(tokens.frozen)}
                    />
                  ) : null}
                  <TokenLegendRow
                    color="var(--dsw-alias-border-l2)"
                    label={t('community.token.total')}
                    value={String(tokens.total)}
                  />
                </div>
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
 * 发起指导 / **出价加入**的对话框（两个方向共用）。
 *
 * 为什么这个不用"二次确认"那一套：发起提案**不花 Token**（服务器只在接受时冻结押金），
 * 所以对话框本身就是确认 —— 填完点按钮才发请求。真正花钱的是**对方**的【接受】。
 *
 * `variant` 只换文案，不换逻辑：导师侧叫「发起指导申请」（我出价请人接受），
 * 学生侧叫「出价加入」（我出价请导师接受）—— **两边都是"未发起的那一方接受"**，
 * 而且两个方向都是学生出钱，所以学生侧那句分账说明要写清"冻结的是你的"。
 *
 * 费用三项里**成功付款是推导出来的**（`总额 − 押金`），不是独立输入框：
 * 服务器强校验 `押金 + 成功付款 == 总额`，与其让用户填出一个必然被拒的组合，
 * 不如让非法状态在界面上**无法表达**。
 *
 * ⚠️ **论文等级（v0.6.3）**：`PAPER_ACCEPTED` / `PAPER_PUBLISHED` 这两类条件的
 * **价格就是等级**，所以它们必须选等级 —— 未选等级时提交按钮禁用（服务器的规则是
 * 缺等级直接 400，界面不能把它做成一次莫名失败）。等级一变就重新问服务器要价钱
 * （`fee-suggestion?jcr_level=`）：价目表只有服务器有，客户端一个数字都不抄。
 * 两种情况的分工见 `onTermsChange`：非论文类条件要**兜底价**，论文类条件在选等级前
 * **没有价钱**（不显示兜底价冒充等级价）。
 */
function ProposeDialog({
  t,
  title,
  fee,
  feeLoading,
  busy,
  error,
  onCancel,
  onSubmit,
  onTermsChange,
  variant = 'mentor',
}: {
  t: Translate
  title: string
  fee: HostFeeSuggestion | null
  /** 正在问服务器该等级的价格（期间总费用先不动，也不显示"没价钱"）。 */
  feeLoading: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (input: {
    totalFee: number
    depositAmount: number
    successPaymentAmount: number
    successCondition: { type: string; jcrLevel?: number; ccfLevel?: string }
  }) => void
  /** 条件 / 等级变了：让**上层**去问服务器（上层才拿得到网络与登录态）。 */
  onTermsChange: (terms: { condition: string; level: PaperLevel | null }) => void
  /** `mentor` = 导师出价（学生发布的研究）；`researcher` = 学生出价（导师发布的选题）。 */
  variant?: 'mentor' | 'researcher'
}): JSX.Element {
  const [total, setTotal] = React.useState(String(fee?.suggestedFee ?? 100))
  /**
   * 成功条件：默认「双方确认完成」（平台默认，也是本字段的过渡值）。
   *
   * 只有论文类两种条件价格跟等级走，所以**先有条件、才有等级** —— 顺序反过来会出现
   * "选了个等级但条件是双方确认完成"这种说不通的中间态。
   */
  const [condition, setCondition] = React.useState<string>(PROPOSE_DEFAULT_CONDITION)
  /** 等级下拉的取值（`'JCR:2'` / `'CCF:A'`；空串 = 还没选）。 */
  const [levelKey, setLevelKey] = React.useState<string>('')
  const level = decodeLevel(levelKey)
  const paper = isPaperCondition(condition)
  const levelText = paperLevelText(level)

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
  // 论文类条件**必须**先选等级：等级没定，这份提案的价钱就无从谈起
  const valid = Number.isInteger(totalNum) && totalNum > 0 && (!paper || level !== null)
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
          {t(variant === 'researcher' ? 'community.mentor.bidTitle' : 'community.mentor.proposeTitle')}
          <span style={{ flex: '1 1 auto' }} />
          {/* 选了等级就把等级摆在标题行：这一份提案按什么定价，一眼可见 */}
          {levelText ? <Badge tone="neutral">{t(levelText.key, levelText.params)}</Badge> : null}
          <Badge tone="neutral">{t('community.mentor.proposeFree')}</Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>{title}</div>

          <div style={S.inlineRow}>
            <span style={S.label}>{t('community.mentor.conditionLabel')}</span>
            <select
              style={input}
              value={condition}
              onChange={(e) => {
                setCondition(e.target.value)
                setLevelKey('')
                onTermsChange({ condition: e.target.value, level: null })
              }}
            >
              {Object.keys(SUCCESS_CONDITION_KEYS).map((type) => (
                <option key={type} value={type}>
                  {enumText(t, SUCCESS_CONDITION_KEYS, type)}
                </option>
              ))}
            </select>
          </div>

          {/* 等级只在**论文类**条件上出现：其余条件没有等级，价格是双方约定的总额 */}
          {paper ? (
            <div style={S.inlineRow}>
              <span style={S.label}>{t('community.mentor.levelLabel')}</span>
              <select
                style={input}
                value={levelKey}
                onChange={(e) => {
                  setLevelKey(e.target.value)
                  onTermsChange({ condition, level: decodeLevel(e.target.value) })
                }}
              >
                <option value="">{t('community.mentor.levelNone')}</option>
                {/*
                 * 两个体系（JCR 分区 / CCF 类别）分组列在**一个**下拉里：一个字符串就是
                 * 一份完整状态，不会留下"选了 CCF 却还残留 JCR 等级"的半选状态。
                 * 两者的等价关系（1区=CCF-A、3区=CCF-B、4区=CCF-C）不在这里解释 ——
                 * 价格由服务器按等级算，用户按自己论文的实际情况选即可。
                 */}
                {(['JCR', 'CCF'] as PaperLevelSystem[]).map((system) => (
                  <optgroup key={system} label={t(`community.mentor.levelSystem.${system}`)}>
                    {levelOptions(system).map((lv) => {
                      const key = `${system}:${String(lv)}`
                      const text = paperLevelText({ system, level: lv })
                      return (
                        <option key={key} value={key}>
                          {text ? t(text.key, text.params) : key}
                        </option>
                      )
                    })}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : null}

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
          {/* 押金比例由平台定，只填总额：把分账说清楚，不让人去猜。
              两个方向的措辞不同 —— 学生侧必须写清"冻结的是**你**的押金"。 */}
          <div style={S.hint}>
            {paper && !level
              ? t('community.mentor.levelRequired')
              : valid
                ? t(
                    variant === 'researcher' ? 'community.mentor.bidNote' : 'community.mentor.feeNote',
                    { percent: Math.round(ratio * 100), deposit, success },
                  )
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
              style={{ ...S.primaryBtn, opacity: valid && !busy && !feeLoading ? 1 : 0.55 }}
              disabled={!valid || busy || feeLoading}
              onClick={() =>
                onSubmit({
                  totalFee: totalNum,
                  depositAmount: deposit,
                  successPaymentAmount: success,
                  successCondition: {
                    type: condition,
                    ...levelQuery(level),
                  },
                })
              }
            >
              {busy || feeLoading
                ? t('community.action.loading')
                : t(variant === 'researcher' ? 'community.action.bid' : 'community.action.propose')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 对方的信息（Profile 介绍）。
 *
 * 数据来自提案响应里**内嵌的** `profile`（后端 enrich 之后才有）——
 * 为此不需要任何额外请求。对方没填过 profile 就如实说"尚未填写"，不编内容。
 *
 * 为什么要有它：接受指导要冻结一笔押金，决定跟谁合作之前应当能看清对方是谁。
 * 两个方向下"对方"不同：方向 A 是提出申请的**导师**，方向 B 是出价的**学生**
 * （服务器按"谁要判断谁"投影 profile，见 v0.6.0 后端规格 §2 R5）—— 所以标题与
 * 空态文案随 `isMentor` 换，但结构完全一样。
 */
function PartyProfileDialog({
  t,
  party,
  isMentor,
  status,
  onClose,
}: {
  t: Translate
  party: HostProposalParty
  /** 对方是导师吗（决定标题与"尚未填写"的措辞）。 */
  isMentor: boolean
  status: HostProposalStatus
  onClose: () => void
}): JSX.Element {
  const profile = party.profile ?? null
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
          {t(isMentor ? 'community.mentor.profileTitle' : 'community.mentor.profileTitleResearcher')}
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone={proposalTone(status)}>{enumText(t, PROPOSAL_STATUS_KEYS, status)}</Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 9 }}>
          <div style={S.listTitle}>{party.displayName || t('community.mentor.unknownParty')}</div>
          {affiliation ? <div style={S.hint}>{affiliation}</div> : null}
          {profile ? (
            <>
              {line(t('community.mentor.profileBio'), profile.bio)}
              {line(t('community.mentor.profileFields'), profile.researchFields.join(' · '))}
              {line(t('community.mentor.profileInterests'), profile.researchInterests.join(' · '))}
              {line(t('community.mentor.profileExpertise'), profile.researchExpertise.join(' · '))}
            </>
          ) : (
            <div style={S.hint}>
              {t(isMentor ? 'community.mentor.profileEmpty' : 'community.mentor.profileEmptyResearcher')}
            </div>
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
 * 宿主的判定 → 提示词用的**五态**。
 *
 * `missing`（注册表里的目录暂时不在）归到 `new`：落盘那一步会把目录建出来，
 * 提示词要做的就是"解压成新的研究根" ✓（这与宿主侧的 `isDirectlySelectable` 同一口径）。
 */
function mergeStateOf(
  status: HostDownloadTarget['status'] | undefined,
): 'new' | 'same' | 'other' | 'unknown' | 'unverifiable' {
  switch (status) {
    case 'same':
      return 'same'
    case 'other':
      return 'other'
    case 'unknown':
      return 'unknown'
    case 'new':
    case 'missing':
      return 'new'
    default:
      return 'unverifiable'
  }
}

/**
 * 目标工作区是哪种布局（提示词在**旧布局**下要换一套备份说法）。
 *
 * 宿主不回状态（旧宿主 / 缺字段）时按路径猜：研究根就是工作区根本身 = 旧布局。
 * 这不会误伤 —— 猜错的后果只是提示词里那句"只搬研究数据"不适用，而 agent 会在
 * 只读盘查那一步把实际情况报告出来。
 */
function chosenTargetLayout(
  status: HostDownloadTarget['status'] | undefined,
  researchRoot: string,
  workspace: string,
): 'nested' | 'legacy' | null {
  if (status === 'new') return null
  return researchRoot.replace(/\/+$/, '') === workspace.replace(/\/+$/, '') ? 'legacy' : 'nested'
}

/**
 * 一个目标的校验结论 → 徽章（文案 + 颜色 + 一行说明）。
 *
 * 颜色只表达"能不能放心下"：绿 = 同一项研究，红 = **不能下**，
 * 黄 = 下得了但要知道有风险（无法确认），灰 = 中性信息（新工作区）。
 */
/**
 * ⚠️ `DownloadDialog` 是**导出**的，只为了离线自检能直接渲染它：
 * 它没有 hook（状态都在 `CommunityTab` 里），当普通函数调一次就能拿到整棵 JSX 树，
 * 于是"下拉框里是不是这几个工作区、默认选中的是不是当前工作区"可以被真的断言，
 * 而不是只对着源码正则猜。
 */
function statusBadge(
  t: Translate,
  target: HostDownloadTarget,
): { label: string; hint: string; tone: 'neutral' | 'brand' | 'success' | 'warn' | 'error' } {
  switch (target.status) {
    case 'same':
      return {
        label: t('community.exchange.ws.same'),
        hint: t('community.exchange.ws.sameHint'),
        tone: 'success',
      }
    case 'other':
      return {
        label: t('community.exchange.ws.other'),
        hint: t('community.exchange.ws.otherHint'),
        tone: 'error',
      }
    case 'missing':
      // 不拦（落盘会 mkdir 创建它），但值得提醒一句"它现在不在"
      return {
        label: t('community.exchange.ws.missing'),
        hint: t('community.exchange.ws.missingHint'),
        tone: 'warn',
      }
    case 'unknown':
      return {
        label: t('community.exchange.ws.unknown'),
        // 冲突（标记与本地记录矛盾）与"压根读不到"要分开说：前者是**两边都有值但不一样**，
        // 后者是**没有值**。补救动作也不同（前者该去查那两条记录）。
        hint: target.identityConflict
          ? t('community.exchange.ws.conflictHint')
          : t('community.exchange.ws.unknownHint'),
        tone: 'warn',
      }
    case 'unverifiable':
      return {
        label: t('community.exchange.ws.unverifiable'),
        hint: t('community.exchange.ws.unverifiableHint'),
        tone: 'warn',
      }
    default:
      return {
        label: t('community.exchange.ws.new'),
        hint: t('community.exchange.ws.newHint'),
        tone: 'neutral',
      }
  }
}

/**
 * 选中一个工作区之后、点【下载】之前的**后果提示**。
 *
 * ⚠️ 这道提示**必须留着**（2026-10 用户要求）：插件不再拦任何工作区，于是"选错"的代价
 * 全靠用户在看清楚后果的前提下自己判断 —— 尤其 `other`（会把现有研究根备份后换掉）。
 * `new` / `same` 没有需要提醒的后果 → `null`。
 */
function downloadWarning(
  t: Translate,
  target: HostDownloadTarget,
): { text: string; tone: 'warn' | 'error' } | null {
  switch (target.status) {
    case 'other':
      return { text: t('community.exchange.ws.otherWarn'), tone: 'error' }
    case 'unknown':
      return {
        text: target.identityConflict
          ? t('community.exchange.ws.conflictWarn')
          : t('community.exchange.ws.unknownWarn'),
        tone: 'warn',
      }
    case 'unverifiable':
      return { text: t('community.exchange.ws.unverifiableWarn'), tone: 'warn' }
    case 'missing':
      return { text: t('community.exchange.ws.missingWarn'), tone: 'warn' }
    default:
      return null
  }
}

/**
 * 【下载】：下载到**用户选的 DSH 工作区**（2026-09 用户要求）。
 *
 * 不用浏览器的默认下载，也不需要输地址：列出宿主注册表里的工作区，点一个就行。
 *
 * **只存 ZIP，不解压**（2026-09 用户拍板）：同名不覆盖（宿主自动加序号），
 * 所选工作区里原有的东西一个都不动。
 *
 * ⚠️ **0.5.8 起多了一道闸门**：每一项先判"这个工作区里已有的 `workspace/` 和我要下载的
 * 是不是**同一项研究**"（判据是服务器的 `workspace_id`）—— 同一项才允许下进去融合，
 * 另一项**在下之前就拦住**（而不是等文件都解压进去了才发现）。
 */
export function DownloadDialog({
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
  /** 下载中已收到的字节数（宿主如实报告；null = 还没开始/已结束）。 */
  received,
  notice,
  targets,
  currentWorkspaceId,
  done,
  onSelect,
  onDownload,
  onClose,
  onFill,
  onCopy,
  onRefill,
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
  received: number | null
  notice: { tone: 'success' | 'error'; text: string } | null
  /** v23：每个候选工作区的校验结论；`null` = 旧宿主（不显示状态，退回旧行为）。 */
  targets: HostDownloadTarget[] | null
  /** 当前会话的工作区 id（标出来 + 说明提示词能不能填）。 */
  currentWorkspaceId: string | null
  /**
   * 「整合提示词」面板；`null` = 没在下载也没下过。
   *
   * `phase = 'pending'` 发生在下载**进行中** —— 那时提示词已经先用预检的值填好了
   * （2026-10 用户要求：不要等下载完才出现），只是文件名还是猜的。
   */
  done: {
    phase: 'pending' | 'ready'
    dir: string
    name: string
    plan: string
    prompt: string
    correctedPrompt: string | null
    canFill: boolean
    filled: boolean
    fillHint: string | null
  } | null
  onSelect: (id: string) => void
  onDownload: () => void
  onClose: () => void
  /** 把提示词填进当前会话的输入框（**不发送**）。 */
  onFill: () => void
  /** 复制提示词到剪贴板。 */
  onCopy: () => void
  /** 用**实际落盘的文件名**替换提示词（只在这两者不一致时出现）。 */
  onRefill: () => void
}): JSX.Element {
  /*
   * **一个都不禁用**（2026-10 用户拍板："插件端全部设计成提示词构建"）。
   *
   * 校验结论不再决定"能不能下"，而是决定**提示词说什么**：
   *   · `new`     → 解压成新的研究根
   *   · `same`    → 融合进现有研究根
   *   · `other`   → **先备份现有研究根（移动，不删），再解压成新的研究根**
   *   · `unknown` / `unverifiable` → 先盘查、给出判断，用户确认后按对应的一支执行
   * 徽章仍然显示，因为用户有权在下载前知道"这一下会发生什么"。
   */
  const targetOf = (id: string): HostDownloadTarget | undefined => targets?.find((x) => x.id === id)
  const chosen = workspaces?.find((w) => w.id === selection)
  const chosenTarget = chosen ? targetOf(chosen.id) : undefined
  const chosenBadge = chosenTarget ? statusBadge(t, chosenTarget) : null
  const warning = chosenTarget ? downloadWarning(t, chosenTarget) : null
  const dest = chosen ? `${chosen.path}/${fileName}` : ''
  const ready = Boolean(selection) && files !== null && files > 0 && !busy
  /*
   * 进度条的分母：预检给的字节数是**解压后**的合计（服务器发的是压缩 ZIP），
   * 所以它只是上界，写「≈」。真实速率实测 ~120 KB/s 时十几 MB 要一两分钟 ——
   * 这段时间界面必须动，否则「慢」和「死」长得一模一样（2026-09 用户反馈）。
   */
  const pct = busy && bytes && bytes > 0 && received !== null
    ? Math.min(100, Math.round((received / bytes) * 100))
    : null
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
            {proposalWorkLabel(proposal) ?? t('community.mentor.untitledProject')}
          </div>
          {/* 只存 ZIP、其余交给用户：说清楚，免得以为会自动解压 */}
          <div style={S.hint}>{t('community.exchange.zipOnly')}</div>

          {/* 对方还没上传：0 个文件不是错误，但要说清（否则只剩一个灰按钮） */}
          {files === 0 ? <div style={S.hint}>{t('community.exchange.noSourceFiles')}</div> : null}
          {!workspacesAvailable ? (
            <div style={S.hint}>{workspacesReason ?? t('community.exchange.noWorkspaces')}</div>
          ) : workspaces === null ? (
            <div style={S.hint}>{t('community.action.loading')}</div>
          ) : workspaces.length === 0 ? (
            <div style={S.hint}>{t('community.exchange.noWorkspaces')}</div>
          ) : (
            /*
             * **下拉框**而不是单选列表（2026-10 用户要求）：工作区多起来时列表太长，
             * 而这里每次只会选一个。样式直接复用设置页既有的 `S.select`（与上传对话框同源）。
             *
             * 下拉框里塞不下徽章，所以把"当前会话"与判定结论压进**选项文字**；
             * 选中项的完整路径与结论说明放在框下面（`chosenBadge`）。
             * 默认选中**当前会话的工作区**（预选优先级在 `requestDownload` 里，第一顺位）。
             */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={S.label}>{t('community.exchange.workspaceLabel')}</div>
              <select
                style={S.select}
                value={selection}
                // 下载进行中不许改目标：请求已经发出去了，改了只会让人以为换成功了
                disabled={busy}
                onChange={(e) => onSelect(e.target.value)}
              >
                {workspaces.map((w) => {
                  const tg = targetOf(w.id)
                  const badge = tg ? statusBadge(t, tg) : null
                  const marks = [
                    // 只有当前会话的工作区才能把整合提示词填进输入框
                    currentWorkspaceId === w.id ? t('community.exchange.ws.current') : '',
                    badge ? badge.label : '',
                  ].filter(Boolean)
                  return (
                    <option key={w.id} value={w.id}>
                      {marks.length > 0 ? `${w.title}（${marks.join(' · ')}）` : w.title}
                    </option>
                  )
                })}
              </select>
              {/* 选中项的路径：下拉框里放不下（它可能很长） */}
              {chosen ? (
                <div style={{ ...S.hint, wordBreak: 'break-all' }}>{chosen.path}</div>
              ) : null}
              {/* 选中项的**校验结论**：这一行是"会发生什么"的一半（另一半是下面的后果提示） */}
              {chosenBadge ? (
                <div style={S.hint}>
                  <Badge tone={chosenBadge.tone}>{chosenBadge.label}</Badge> {chosenBadge.hint}
                </div>
              ) : null}
            </div>
          )}

          {/*
            下载成功之后：ZIP 只是躺在那儿，还要解压并**融合**。这一段给出**两步走**的
            提示词（先只读盘查并报告 → 我确认 → 再融合），**不自动发送**。
            能填就填进当前会话的输入框；目标不是当前会话的工作区、或不在会话里 →
            只给「复制提示词」，并把"为什么不能填"说清楚（DSH 只写自己会话的工作区）。
          */}
          {done ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={S.listTitle}>{t('community.merge.title')}</div>
              <div style={S.hint}>{t('community.exchange.downloadDone', { dir: done.dir, name: done.name })}</div>
              <div style={S.hint}>{done.plan}</div>
              <div style={S.hint}>{t('community.merge.hint')}</div>
              {/* 下载还没落盘：说清"已经填好了，但要等写完再发" */}
              {done.phase === 'pending' ? (
                <div style={S.hint}>{t('community.merge.pendingHint')}</div>
              ) : null}
              {/* 落盘后的真名与提示词里猜的不一致 → 给一个更正版（点了才替换） */}
              {done.correctedPrompt ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={S.hint}>{t('community.merge.nameChanged', { name: done.name })}</div>
                  <div>
                    <button type="button" style={S.ghostBtn} onClick={onRefill}>
                      {t('community.merge.refill')}
                    </button>
                  </div>
                </div>
              ) : null}
              {/* 输入框非空时「填入输入框」是**替换**：这一句必须在按之前就看得见 */}
              {done.canFill && !done.filled ? <div style={S.hint}>{t('community.merge.fillHint')}</div> : null}
              {done.filled ? (
                <div style={S.hint}>{t('community.merge.filled')}</div>
              ) : done.fillHint ? (
                <div style={S.hint}>{done.fillHint}</div>
              ) : null}
            </div>
          ) : null}

          {/* 写到哪里要看得见（用户可以选任何工作区，那就更该知道落点在哪） */}
          {!(done && done.phase === 'ready') && dest ? (
            <div style={{ ...S.hint, wordBreak: 'break-all' }}>
              {t('community.exchange.destHint', { dest })}
            </div>
          ) : null}
          {/*
            选中之后的**后果提示**：插件不拦任何工作区，所以"这一下会发生什么"必须写在
            用户按【下载】之前看得见的地方（尤其"另一项研究 → 会备份后换掉"）。
          */}
          {!(done && done.phase === 'ready') && warning ? (
            <div
              style={{
                ...S.hint,
                color:
                  warning.tone === 'error'
                    ? 'var(--dsw-alias-state-error-primary)'
                    : 'var(--dsw-alias-state-warn-primary)',
              }}
            >
              {warning.text}
            </div>
          ) : null}
          {/* 下载中：真实字节数 + 细进度条。不显示的话，慢链路下界面就是"卡住" */}
          {busy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={S.hint}>
                {received === null || !bytes
                  ? t('community.action.loading')
                  : t('community.exchange.downloading', {
                      done: formatBytes(received),
                      total: formatBytes(bytes),
                    })}
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--dsw-alias-border-l1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct ?? 0}%`,
                    background: 'var(--dsw-alias-brand-primary, #4a43ea)',
                    transition: 'width 400ms linear',
                  }}
                />
              </div>
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
            {done ? (
              <>
                <button type="button" style={S.ghostBtn} onClick={onCopy}>
                  {t('community.merge.copy')}
                </button>
                {done.canFill && !done.filled ? (
                  <button type="button" style={S.primaryBtn} onClick={onFill}>
                    {t('community.merge.fill')}
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                style={{ ...S.primaryBtn, opacity: ready ? 1 : 0.55 }}
                disabled={!ready}
                onClick={onDownload}
              >
                {busy ? t('community.exchange.downloadingBtn') : t('community.action.download')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 【上传】：把**这一份工作区**回传给项目 —— 导师是在学生的 workspace/ 里继续推进研究的，
 * 所以传回去的不是只有 `review/`，而是"我这份工作区"（学生下载后接着做）。
 *
 * ## 为什么是"下拉选工作区 + 勾选文件"而不是"选目录 + 扫描"
 *
 * 1. 工作区是**注册表里的实体**：宿主按 id 解析路径，客户端递不进任意路径，
 *    导师也不必自己记住"我把快照解压到哪了"；
 * 2. 清单由宿主扫描研究根给出（`mentor/uploadPlan`），**保留目录层次** ——
 *    浏览器文件选择器拿不到相对路径，而服务器要的就是它；
 * 3. 走宿主读盘顺带绕开了 RPC 的请求体上限（否则只能 base64 传字节，4 MB 就打住）。
 *
 * ## 口径（与发布不同，别混）
 *
 * 清单是 `mentor` 口径：`review/**` 与论文 PDF 都是**推荐**（发布时前者排除、后者按大小降级），
 * 机器产物（`harness/` 缓存、依赖、权重…）照样排除。
 *
 * ## 服务器侧的前提
 *
 * 回传要写学生的项目文件空间（`review/` 之外），服务器须放开"协作者只能写 `review/**`"。
 * 未放开时 403 `FILE_PATH_RESERVED` → 界面说"服务器需放开这条限制"，**不**说"没权限"、
 * 也**不**偷偷退回只传 `review/`（那会让人以为整包已经上去了）。
 */
function UploadDialog({
  t,
  proposal,
  workspaces,
  workspacesAvailable,
  workspacesReason,
  workspaceId,
  currentWorkspaceId,
  plan,
  planLoading,
  selection,
  expanded,
  busy,
  progress,
  notice,
  onSelectWorkspace,
  onToggleFiles,
  onToggleExpand,
  onUpload,
  onClose,
}: {
  t: Translate
  proposal: HostProposal
  workspaces: HostUploadWorkspace[] | null
  workspacesAvailable: boolean
  workspacesReason: string | null
  workspaceId: string
  /** 当前会话所在工作区（下拉里加标记）。 */
  currentWorkspaceId: string | null
  plan: HostMentorUploadPlan | null
  planLoading: boolean
  selection: ReadonlySet<string>
  expanded: ReadonlySet<string>
  busy: boolean
  progress: HostUploadProgress | null
  notice: { tone: 'success' | 'error'; text: string } | null
  onSelectWorkspace: (id: string) => void
  onToggleFiles: (relPaths: string[], next: boolean) => void
  onToggleExpand: (categoryId: string) => void
  onUpload: () => void
  onClose: () => void
}): JSX.Element {
  const chosen = workspaces?.find((w) => w.id === workspaceId) ?? null
  /*
   * 汇总**所选文件的体积**（用户要求：界面上要显示）。
   * 只算可选分类里的文件 —— `excluded` 不可勾选，出现即数据不一致。
   */
  const selectable = (plan?.plan.categories ?? [])
    .filter((c) => c.decision !== 'excluded')
    .flatMap((c) => c.files.filter((f) => !f.relPath.endsWith('/')))
  const selected = selectable.filter((f) => selection.has(f.relPath))
  const selectedBytes = selected.reduce((n, f) => n + f.size, 0)
  const limits = plan?.plan.limits ?? null
  const batches = limits ? Math.max(1, Math.ceil(selected.length / limits.maxFilesPerRequest)) : 1
  const oversize = limits ? selected.filter((f) => f.size > limits.maxFileBytes) : []
  const ready = Boolean(workspaceId) && selected.length > 0 && !busy && !planLoading
  const pct =
    busy && progress && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.sentBytes / progress.totalBytes) * 100))
      : null
  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
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
          {t('community.exchange.uploadTitle')}
          <span style={{ flex: '1 1 auto' }} />
          <Badge tone="neutral">{t('community.mentor.status.ACCEPTED')}</Badge>
        </div>
        <div style={{ ...S.cardBody, gap: 11 }}>
          <div style={S.listTitle}>
            {proposalWorkLabel(proposal) ?? t('community.mentor.untitledProject')}
          </div>

          {/* ① 选工作区：只有 **含研究定义** 的工作区会出现（宿主侧判定） */}
          {!workspacesAvailable ? (
            <div style={S.hint}>{workspacesReason ?? t('community.exchange.noWorkspaces')}</div>
          ) : workspaces === null ? (
            <div style={S.hint}>{t('community.action.loading')}</div>
          ) : workspaces.length === 0 ? (
            <div style={S.hint}>{t('community.exchange.noUploadWorkspaces')}</div>
          ) : (
            <div style={S.inlineRow}>
              <span style={S.label}>{t('community.exchange.workspaceLabel')}</span>
              <select
                style={{ ...S.compactInput, flex: '1 1 auto' }}
                value={workspaceId}
                onChange={(e) => onSelectWorkspace(e.target.value)}
              >
                <option value="">{t('community.exchange.workspacePlaceholder')}</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {currentWorkspaceId === w.id
                      ? `${w.title}（${t('community.exchange.ws.current')}）`
                      : w.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* 传的是哪一个目录要看得见：导师手上可能有几份快照 */}
          {chosen ? (
            <div style={{ ...S.hint, wordBreak: 'break-all' }}>
              {t('community.exchange.fromHint', { root: chosen.root })}
            </div>
          ) : null}

          {/* ② 文件清单（选中工作区之后才有） */}
          {planLoading ? (
            <div style={S.hint}>{t('community.action.loading')}</div>
          ) : plan === null ? (
            <div style={S.hint}>{t('community.exchange.selectWorkspaceFirst')}</div>
          ) : selectable.length === 0 ? (
            <div style={S.hint}>{t('community.exchange.noUploadFiles')}</div>
          ) : (
            <UploadCategoryList
              t={t}
              categories={plan.plan.categories}
              maxFileBytes={plan.plan.limits.maxFileBytes}
              selection={selection}
              expanded={expanded}
              onToggleFiles={onToggleFiles}
                            onToggleExpand={onToggleExpand}
            />
          )}
          {/* 机器产物被剔掉了 —— 说一句，免得导师找不到 node_modules 里的东西以为漏了 */}
          {plan && plan.plan.totals.excludedFiles > 0 ? (
            <div style={S.hint}>
              {t('community.exchange.skippedMachine', { count: plan.plan.totals.excludedFiles })}
            </div>
          ) : null}

          {oversize.length > 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--dsw-alias-state-warn-primary)', lineHeight: 1.6 }}>
              {t('community.exchange.oversizeWarning', { count: oversize.length })}
            </div>
          ) : null}

          {/* 上传中：真实进度（宿主按批上报；慢链路下界面必须动） */}
          <TransferProgress t={t} busy={busy} progress={progress} />

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
            {/* 还没选工作区时不显示"0 个文件 · 0 B"（那只是噪声） */}
            <span style={{ ...S.hint, marginRight: 'auto' }}>
              {plan
                ? t('community.exchange.uploadSummary', {
                    files: selected.length,
                    size: formatBytes(selectedBytes),
                    batches,
                  })
                : ''}
            </span>
            <button type="button" style={S.ghostBtn} onClick={onClose}>
              {t('community.action.close')}
            </button>
            <button
              type="button"
              style={{ ...S.primaryBtn, opacity: ready ? 1 : 0.55 }}
              disabled={!ready}
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

/**
 * 【设置】-【ConvFusion】-【ConvFusion.com】这一页的**全部内容**。
 *
 * ⚠️ 它同时被两处渲染：设置页的 Tab 2，以及会话 Tab「科V社区」的正文
 * （`./community-view.js`）。所以它必须**自给自足** —— 自己读 `account/state`、
 * 自己联网验证、自己持有全部对话状态；宿主状态传 `null` 也能正常站起来
 * （`initial` 只是首屏的乐观初值，省掉一次闪烁）。
 */
/**
 * 「把提示词放进输入框」的窄接口（**不发送**）。
 *
 * 只有**会话内**那个视图（`./community-view.js`）能提供它 —— DSH 把 `inputActions` 作为
 * session 标准 props 交给会话作用域槽位；设置页没有，所以那里只给「复制提示词」。
 */
export interface SessionBridge {
  /**
   * 当前会话（下载预检要用它算"当前会话的工作区"）。
   *
   * 只有它才能回答两件事：① 该预选哪个工作区；② 下载完**能不能**把提示词填进输入框
   * （DSH 的写权限按会话自己的工作区收窄，目标不是它时会话就写不进去）。
   */
  sessionId: string
  /** 把整段提示词放进输入框（**绝不**调用 submit）。缺省 = 拿不到输入框，只能复制。 */
  setDraft?: ((text: string) => void) | undefined
  /** 输入框现在是空的吗（空 → 自动填；非空 → 先问一句再替换）。 */
  draftEmpty: boolean
}

/**
 * 【科V社区】各列表的**模块级缓存**。
 *
 * 为什么要它（用户 2026-10 反馈："页面会自己刷新，不要自动刷新，加个刷新按钮"）：
 * 这些列表的加载 effect 依赖里带了 `account`（**对象**，每次 `account/state` /
 * `account/verify` 回来都是新对象）—— 于是任何一次状态回写都会让三个列表**重新联网**，
 * 界面上就是一次"自己刷新"。而刷新按钮本来就在每个 Tab 上（`RefreshIconButton`）。
 *
 * 缓存把"数据"和"要不要重拉"分开：
 *   · 挂载时命中缓存 → **直接显示**，不联网；
 *   · 服务器 / 账号变了（key 变化）→ 自然未命中 → 重拉；
 *   · 用户点 ↻ 或做了会改数据的动作（发布 / 接受 / 拒绝）→ 显式重拉。
 */
const COMMUNITY_LIST_CACHE = new Map<string, unknown>()
const communityCacheKey = (server: string, accountId: string | null, kind: string): string =>
  `${server}|${accountId ?? ''}|${kind}`

export function CommunityTab({
  send,
  initial,
  t,
  session,
}: {
  send: SettingsSend
  initial: HostAccountState | null
  t: Translate
  /**
   * 会话桥（会话内才有）。
   *
   * 它的有无**就是**"要不要/能不能把整合提示词填进输入框"那个开关：DSH 的写权限按会话
   * 自己的工作区收窄，所以只有"目标工作区 == 当前会话的工作区"时填进去才有意义。
   */
  session?: SessionBridge | undefined
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
  /**
   * 用户信息卡是否**展开**。默认**折叠**（2026-10 用户要求）。
   *
   * 折叠时卡片头就给出了"是谁 + 还剩多少 Token"这两个最常看的信息，展开才是
   * 账号 / 服务器设置。所以默认收起不会藏住任何**日常**要看的东西（账号行的
   * 刷新 / 登出、【服务器设置】都在展开之后）。
   *
   * ⚠️ 唯一的例外是**失败**：登录失败、凭据被拒这类事情必须看得见，所以
   * {@link call} 一失败就自动展开（见那里的说明）。
   */
  const [userOpen, setUserOpen] = React.useState(false)
  /* ── 仪表板数据（用量与配额：存储空间 / 项目阶梯）────────────────────
   *
   * 与 `state.tokens` 不同，这一份**要联网**（`account/usage`），所以只在卡片
   * **展开且已登录**时读（折叠着不打扰服务器）。读不到 = `null` = 界面显示"未知"。
   */
  const [usage, setUsage] = React.useState<HostUsage | null>(null)
  const [usagePhase, setUsagePhase] = React.useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  /** 宿主是旧的（没有 `account/usage` → unknown-endpoint）：要把"需重启"说出来。 */
  const [usageStaleHost, setUsageStaleHost] = React.useState(false)
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

  /* ── 研究工作：四个视图（我的 / 可指导 / 可加入 / 指导中）─────────────
   *
   * 「我的」在最前（所有人都可能**被**指导，先看自己的）；「可指导」只对导师显示
   * （v0.6.0：以前是"显示但说明需要角色"，现在按用户要求直接不显示），
   * 「可加入」对所有人都显示（学生找导师发布的选题）。
   */
  const [workTab, setWorkTab] = React.useState<'mine' | 'mentor' | 'joinable' | 'mentorship'>('mine')
  /** 本机研究项目（不联网、不需要登录）。 */
  const [mine, setMine] = React.useState<HostLocalWork[] | null>(null)
  const [mineLoading, setMineLoading] = React.useState(false)
  /** 「我的」读不到时的原因（**绝不能**把它显示成"没有研究项目"）。 */
  const [mineError, setMineError] = React.useState<{ code: string; message: string } | null>(null)
  /** 工作区注册表是否可用（不可用 = 读不到，而不是没有）。 */
  const [mineRegistry, setMineRegistry] = React.useState<{ available: boolean; reason?: string } | null>(null)
  /**
   * 正在发布的那一项 —— **带方向**（v0.6.0）。
   *
   * 两个按钮共用一个工作区，只记 id 的话两个按钮会同时显示「发布中…」，
   * 用户看不出点的是哪一个（而发布方向恰恰是这一版的核心信息）。
   */
  /** 发布进度（宿主 `mentor/uploadProgress`；与导师回传同一根进度条）。 */
  const [publishProgress, setPublishProgress] = React.useState<HostUploadProgress | null>(null)
  const [publishing, setPublishing] = React.useState<
    { id: string; direction: HostProjectDirection } | null
  >(null)
  /** 发布结果 / 失败（只在业务发生时出现）。 */
  const [publishNotice, setPublishNotice] = React.useState<
    { tone: 'success' | 'error'; code?: string; text: string; missing?: string[] } | null
  >(null)
  /** 发布确认对话框（点【寻找指导】/【寻找学生】/【更新…】时打开）。 */
  const [dialog, setDialog] = React.useState<{
    work: HostLocalWork
    /**
     * 本次发布到哪个方向。**存在对话框里**而不是从 `work` 再推一次：
     * 用户点的是哪个按钮，就发布到哪个方向，全程不能变（`work/uploadPlan` 与
     * `work/publish` 必须是同一个方向，否则记的指纹会落到另一个项目上）。
     */
    direction: HostProjectDirection
    data: HostUploadPlan
    selection: Set<string>
    remember: boolean
    expanded: Set<string>
  } | null>(null)
  /** 正在取上传计划的那一项（同样带方向：只有被点的那一个按钮该显示「读取中…」）。 */
  const [dialogLoading, setDialogLoading] = React.useState<
    { id: string; direction: HostProjectDirection } | null
  >(null)
  const [works, setWorks] = React.useState<HostWork[] | null>(null)
  const [worksLoading, setWorksLoading] = React.useState(false)
  const [worksError, setWorksError] = React.useState<{ code: string; message: string } | null>(null)
  /**
   * 【可加入】—— 导师发布的选题（`direction = SEEK_STUDENT`）。
   *
   * 结构与【可指导】完全一样（同一份发现列表 + 同一套两级披露），所以复用
   * `HostWork` / `WorkRow`；只有"行上的动作是【出价】"和空态文案不同。
   * 加载态与错误**各自独立**：两个 Tab 是两件事，一个失败不该把另一个也染红。
   */
  const [joinable, setJoinable] = React.useState<HostWork[] | null>(null)
  const [joinableLoading, setJoinableLoading] = React.useState(false)
  const [joinableError, setJoinableError] = React.useState<{ code: string; message: string } | null>(null)
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
    /**
     * 读**哪一侧**的快照（服务器 `?source=`）：预检与真正的下载必须同一侧，
     * 所以在这里记下来（侧由 {@link mySide} / {@link otherSide} 按角色定）。
     */
    source: HostFileSide
    workspaces: Array<{ id: string; title: string; path: string }> | null
    available: boolean
    reason: string | null
    selection: string
    files: number | null
    bytes: number | null
    /** 预计/实际保存成的文件名（服务器命名，落盘后由宿主回报真名）。 */
    fileName: string
    notice: { tone: 'success' | 'error'; text: string } | null
    /*
     * ── v23：目标工作区校验（这个工作区是不是**同一项研究**）────────────────
     * 旧宿主（协议 < 23）不返回下面这些 → `targets` 为 null、`statusAvailable` 为 false
     * → 界面**完全不显示状态**，退回今天的行为（不假装校验过）。
     */
    /** 每个候选工作区的状态（`null` = 旧宿主，不显示）。 */
    targets: HostDownloadTarget[] | null
    /** 本次下载项在服务器上的标识；`null` = 服务器没给（判定必为 `unverifiable`）。 */
    remoteWorkspaceId: string | null
    /** 当前会话的工作区 id（预选 + 决定提示词能不能填）。 */
    currentWorkspaceId: string | null
    /**
     * 下载成功后的「整合提示词」面板（**不自动发送**）。
     *
     * 下载完把 ZIP 存下来只是第一步 —— 要让它变成研究前进，还得解压并和本地内容**融合**，
     * 那件事交给用户会话里的 agent。这里只把提示词准备好：能填就填进输入框，不能填就复制。
     */
    done: {
      /**
       * `pending` = 下载还在跑（提示词已经先填好了）；`ready` = 落盘完成、判定已核准。
       */
      phase: 'pending' | 'ready'
      /** ZIP 落在哪个工作区根目录。 */
      dir: string
      /** 落盘后的真名（`pending` 时还是预检的猜测）。 */
      name: string
      /**
       * "接下来会发生什么"那句话（**已本地化**）。
       *
       * 由构建提示词时的同一套分叉规则算出来（`planKeyOf`）—— 面板与提示词不会各说一套。
       */
      plan: string
      /** 当前这段提示词（与输入框里那一版一致）。 */
      prompt: string
      /**
       * 落盘后的文件名与提示词里写的**不一致**时的更正版（点按钮才替换）。
       *
       * 为什么要它：提示词是**下载前**用预检猜的文件名填的；服务器才是命名的权威，
       * 同名还会加 `-2`。不一致时把更正版备着，让用户自己决定（绝不静默改掉输入框）。
       */
      correctedPrompt: string | null
      /** 目标就是当前会话的工作区（只有这时填进去才有意义）。 */
      canFill: boolean
      /** 已经自动填进输入框了吗。 */
      filled: boolean
      /** 不能填时的解释（`canFill` 为真时是 `null`）—— 由上层按"为什么不能填"算好。 */
      fillHint: string | null
    } | null
  } | null>(null)
  const [downloadBusy, setDownloadBusy] = React.useState(false)
  /**
   * 下载中**已收到的字节数**（宿主 `mentor/downloadProgress` 如实报告）。
   *
   * 自己算不出来：浏览器这边是"一次请求一次响应"，字节在宿主进程里落地。
   * `null` = 还没开始收到数据（与 0 不同：0 是"开始了但一个字节还没到"）。
   */
  const [downloadReceived, setDownloadReceived] = React.useState<number | null>(null)
  /**
   * 【上传】对话框：本机可回传的工作区（宿主 `mentor/uploadState`；`null` = 还没读）。
   *
   * `null` 与 `[]` 必须分开：拿不到（注册表不可用）和"本机真的没有研究工作区"
   * 是两件事 —— 后者导师该去建，前者该去查（同【我的】那条纪律）。
   */
  const [uploadWorkspaces, setUploadWorkspaces] = React.useState<HostUploadWorkspace[] | null>(null)
  const [uploadRegistry, setUploadRegistry] = React.useState<{ available: boolean; reason: string | null } | null>(
    null,
  )
  /** 选中的工作区 id（空 = 还没选）。 */
  const [uploadWorkspaceId, setUploadWorkspaceId] = React.useState('')
  /** 当前会话所在工作区的 id（宿主报的；用于默认选中与下拉标记）；`null` = 不可回传。 */
  const [uploadCurrentWorkspaceId, setUploadCurrentWorkspaceId] = React.useState<string | null>(null)
  /** 选中工作区的文件清单（宿主 `mentor/uploadPlan`；`null` = 还没算）。 */
  const [uploadPlan, setUploadPlan] = React.useState<HostMentorUploadPlan | null>(null)
  const [uploadPlanLoading, setUploadPlanLoading] = React.useState(false)
  /** 勾选要回传的文件（**研究根相对路径**）。 */
  const [uploadSelected, setUploadSelected] = React.useState<Set<string>>(new Set())
  /** 展开的分类（清单可能很长，默认收起）。 */
  const [uploadExpanded, setUploadExpanded] = React.useState<Set<string>>(new Set())
  const [exchangeBusy, setExchangeBusy] = React.useState(false)
  const [exchangeNotice, setExchangeNotice] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  /** 回传进度（宿主 `mentor/uploadProgress`；`null` = 未在跑）。 */
  const [uploadProgress, setUploadProgress] = React.useState<HostUploadProgress | null>(null)
  /** 正在查看导师信息的提案（非空 = 导师信息对话框开着）。 */
  /**
   * 打开对方资料的提案 + 算好的视角 + 要显示的当事人（v0.6.0 起方向化）。
   *
   * 存这三样而不是只存提案：对话框要的正是"对方是谁 + 对方是导师吗"，
   * 进了对话框再算一遍会与列表行的判断分叉。
   */
  const [profileTarget, setProfileTarget] = React.useState<{
    proposal: HostProposal
    view: HostProposalView
    party: HostProposalParty
  } | null>(null)
  /** 正在对它发起指导的那项研究工作（非空 = 提案对话框开着）。 */
  const [proposeTarget, setProposeTarget] = React.useState<HostWork | null>(null)
  /** 提案对话框里的费用预填（默认条件的兜底价 100 / 20 / 80；论文类条件是**该等级的价格**）。 */
  const [proposeFee, setProposeFee] = React.useState<HostFeeSuggestion | null>(null)
  /** 正在问服务器该等级的价格（期间禁用提交：价钱没定就不该发出去）。 */
  const [proposeFeeLoading, setProposeFeeLoading] = React.useState(false)
  /** 取价请求的序号：只认最后一次（等级连点时的回包顺序不保证，见 requestProposeFee）。 */
  const feeSeq = React.useRef(0)
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
        /*
         * 失败**必须看得见**：卡片默认是折叠的，而失败行在卡片体里 ——
         * 不自动展开的话，"登录失败"会安静地发生在一个收起来的盒子后面。
         */
        setUserOpen(true)
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
   * 能否用【可指导】视图。
   *
   * 由**服务器给的角色**决定（`MENTOR`；`ADMIN` 一并放行，否则管理员无法自查这一页）。
   * v0.6.0 起没有导师角色就**不显示这个 Tab**（用户要求：角色为研究者时只有
   * 【我的】【可加入】【指导中】）—— 而"为什么看不到"由【可加入】那边的语义自洽
   * （学生本来就该看导师出的题）。未登录时同样不显示：`canMentor` 需要 `account`。
   */
  const canMentor = Boolean(
    account && (account.roles.includes('MENTOR') || account.roles.includes('ADMIN')),
  )
  /**
   * 角色变化后当前 Tab 可能**不再可见**（例如刚登出、或换了账号）——
   * 回落到【我的】。不回落的后果是：顶栏没有任何一个 Tab 是选中态，
   * 而下面的内容却还是"可指导"，看着像坏了。
   */
  React.useEffect(() => {
    if (workTab === 'mentor' && !canMentor) setWorkTab('mine')
  }, [workTab, canMentor])
  /** 凭据来自环境变量时无法在界面里清除（它不在设置文档里）—— 如实说明，不装作能登出。 */
  const fromEnv = state?.keySource === 'env'

  /* ── 列表加载：**只有登录后才联网**；未登录显示示例数据 ─────────────── */
  /**
   * 拉一个方向的公开列表。
   *
   * 两个方向各有自己的列表与加载态（【可指导】/【可加入】），但**流程完全一样** ——
   * 所以只有一份实现，靠 `direction` 分派到对应的 state。
   *
   * `mentor/list` 顺带一起拉：【可指导】/【可加入】每行要靠它显示「等待响应」/
   * 「已出价」角标，而提案状态只有它知道 —— 不刷新的话角标一刷新页面就丢。
   * 失败**不清空**已有提案（拿不到 ≠ 没发起过）。
   */
  const loadWorks = React.useCallback(async (direction: HostProjectDirection): Promise<void> => {
    const toJoinable = direction === 'SEEK_STUDENT'
    const setLoading = toJoinable ? setJoinableLoading : setWorksLoading
    const setError = toJoinable ? setJoinableError : setWorksError
    const setList = toJoinable ? setJoinable : setWorks
    setLoading(true)
    setError(null)
    setChargeNotice(null)
    // 换账号 / 重新加载时收起展开态，避免显示上一个账号看到的内容
    setOpen(null)
    setDetail(null)
    // 不传条数：抽样与条数是**服务器**的策略（插件不复制服务端策略）
    /*
     * 两条请求互不依赖（一个是研究网络里的公开工作，一个是"我涉及的提案"），
     * 所以**并发发**：这一页的等待时间从"两者之和"变成"两者中较慢的那个"。
     */
    const [res, proposalsRes] = await Promise.all([
      post('work/list', { direction }),
      post('mentor/list', {}),
    ])
    setLoading(false)
    if (proposalsRes.ok) {
      setProposals((proposalsRes.value as { proposals: HostProposal[] }).proposals ?? [])
    }
    if (!res.ok) {
      setError(res.error ?? { code: 'unknown', message: t('community.error.readWorkList') })
      setList(null)
      return
    }
    const items = (res.value as { items: HostWork[] }).items ?? []
    setList(items)
    // 记住这一份（挂载命中就不再联网 —— 见 COMMUNITY_LIST_CACHE）
    COMMUNITY_LIST_CACHE.set(
      communityCacheKey(activeServer, account?.id ?? null, direction === 'SEEK_STUDENT' ? 'joinable' : 'works'),
      items,
    )
  }, [post, activeServer, account?.id])

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
    const proposals = (res.value as { proposals: HostProposal[] }).proposals ?? []
    setProposals(proposals)
    COMMUNITY_LIST_CACHE.set(communityCacheKey(activeServer, account?.id ?? null, 'proposals'), proposals)
  }, [post, activeServer, account?.id])

  /**
   * 点【接受】= 打开**确认框**（不直接发请求）。
   *
   * 接受会把押金从 `available` 转到 `frozen` —— 是真正动 Token 的操作，
   * 所以必须先让用户看清"冻多少、冻谁的"再确认。
   */
  const requestAccept = (p: HostProposal): void => {
    setMentorNotice(null)
    setAcceptConfirm(p)
  }

  /**
   * 确认接受：发 `mentor/accept`（带幂等键），成功后刷新提案与余额。
   *
   * ⚠️ 押金**永远从学生（`researcher`）账上冻**：方向 A 接受的人就是学生
   * （= 冻我自己的，402 说"我的余额不足"）；方向 B 接受的人是导师
   * （= 冻学生的，402 也要如实说成"**学生**余额不足"，不能写成"你余额不足"）。
   *
   * ⚠️ 判据是 `view.iAmPayer`（= **我是不是学生**），**不是** `!iAmOwner` ——
   * 两个方向的接受人都是 owner，`!iAmOwner` 恒为 false，会把方向 A 的学生说成
   * "冻学生的钱"（理由与四格表见 `mentorship-view.ts` 文件头）。
   */
  const confirmAccept = async (): Promise<void> => {
    const target = acceptConfirm
    if (!target) return
    const iPayer = viewOf(target).iAmPayer
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
            ? t(
                iPayer
                  ? 'community.mentor.acceptNoTokens'
                  : 'community.mentor.acceptNoTokensOther',
                { deposit: target.depositAmount },
              )
            : (res.error?.message ?? t('community.error.unknown')),
      })
      // 提案状态在操作期间变了（别人已处理 / 已过期 / 项目已有关系）→ 列表刷新一下，
      // 否则界面还停在一条已经不能接受的提案上，点几次都是同一个错。
      if (res.error?.code === 'proposal-state') await loadProposals()
      return
    }
    setMentorNotice({
      tone: 'success',
      text: t(
        iPayer ? 'community.mentor.acceptDone' : 'community.mentor.acceptDoneOther',
        { deposit: target.depositAmount },
      ),
    })
    // 提案状态已变（ACCEPTED），押金也冻结了 —— 两处都得刷新
    await Promise.all([loadProposals(), refreshBalance()])
  }

  /** 拒绝提案（收到提案的那一方）。不冻 Token，但会终止对方的这次提议，直接执行并给回执。 */
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
   * 按**条件 + 等级**取费用建议（`mentor/fee-suggestion`）。
   *
   * 两条规矩：
   * 1. **论文类条件在选等级之前没有价钱** —— 不拿兜底价（100/20/80）冒充等级价，
   *    否则用户会以为"论文被接收"就值 100，而服务器的规则是缺等级直接 400。
   *    此时把 `proposeFee` 清成 null，对话框显示"请选择等级"。
   * 2. 其余条件（`MUTUAL_COMPLETION` 等）取**兜底价**（不带等级参数）。
   *
   * 金额一律由服务器算（价目表只有它一份，见 `fetchFeeSuggestion`）；这里只转发等级。
   */
  const requestProposeFee = async (terms: {
    condition: string
    level: PaperLevel | null
  }): Promise<void> => {
    setProposeFee(null)
    if (isPaperCondition(terms.condition) && !terms.level) {
      setProposeFeeLoading(false)
      return
    }
    /*
     * 连点等级时会并发出几个请求，回包顺序**不保证**与发出顺序一致 —— 用序号只认
     * 最后一次：否则界面可能拿"上一等级的价钱"填这一次的总费用（用户改过总费用时
     * 看不出问题，但默认路径下就是一份按错价发出去的提案）。
     */
    const seq = ++feeSeq.current
    setProposeFeeLoading(true)
    const res = await post('mentor/fee-suggestion', levelQuery(terms.level))
    if (seq !== feeSeq.current) return
    setProposeFeeLoading(false)
    if (res.ok) setProposeFee((res.value as { suggestion: HostFeeSuggestion }).suggestion ?? null)
  }

  /**
   * 点【发起指导】/【出价】= 打开提案对话框（免费操作，对话框即确认）。
   *
   * 两个方向**共用这一个动作**（同一个端点、同一套费用结构）：区别只在对话框文案，
   * 由 `proposeTarget.direction` 决定（导师出价 / 学生出价）。
   *
   * 费用建议**当场取**而不是预先缓存：默认值属于服务器策略（将来可能按领域/阶段浮动），
   * 抄一份到客户端只会在两边悄悄漂移。取不到就退回对话框里的内置默认值，不拦着用户。
   */
  const openPropose = async (w: HostWork): Promise<void> => {
    setProposeError(null)
    setProposeFee(null)
    setProposeTarget(w)
    // 开框时是默认条件（双方确认完成）→ 取**兜底价**
    await requestProposeFee({ condition: PROPOSE_DEFAULT_CONDITION, level: null })
  }

  /**
   * 提交提案：成功 → 关框、给回执、刷新提案（该行立刻显示「等待响应」/「已出价」角标）。
   *
   * ⚠️ **不传方向**：方向由**项目自己**决定，服务端按它决定谁写在哪一边
   * （见 `server-client.ts` 的 `fetchPropose`）。客户端再传一份只可能矛盾。
   *
   * ⚠️ 成功条件由**对话框**给出（v0.6.3 起界面可选条件与论文等级）：论文类条件的等级
   * 是价格依据，**必须**随提案一起发出去 —— 服务器缺等级会直接 400，而已经成立的提案
   * 事后也**无法**再补出"当初按什么等级定的价"。
   */
  const submitPropose = async (input: {
    totalFee: number
    depositAmount: number
    successPaymentAmount: number
    successCondition: { type: string; jcrLevel?: number; ccfLevel?: string }
  }): Promise<void> => {
    const target = proposeTarget
    if (!target) return
    setProposeBusy(true)
    setProposeError(null)
    // 指导范围送占位符（服务器仍必填，见 PROPOSE_SCOPE_PLACEHOLDER 的说明）
    const res = await post('mentor/propose', {
      projectId: target.projectId,
      guidanceScope: PROPOSE_SCOPE_PLACEHOLDER,
      successCondition: { description: null, ...input.successCondition },
      totalFee: input.totalFee,
      depositAmount: input.depositAmount,
      successPaymentAmount: input.successPaymentAmount,
    })
    setProposeBusy(false)
    if (!res.ok) {
      // 不关对话框：用户填的内容要留着改（重复提案 409 是唯一常见的可预期失败）
      setProposeError(res.error?.message ?? t('community.error.unknown'))
      return
    }
    setProposeTarget(null)
    setMentorNotice({
      tone: 'success',
      text: t(
        target.direction === 'SEEK_STUDENT'
          ? 'community.mentor.bidDone'
          : 'community.mentor.proposeDone',
      ),
    })
    await loadProposals()
  }

  /* ── 指导闭环：下载工作区快照 / 回传我这一份工作区 ─────────────────── */

  /**
   * 我在这条指导关系里是**哪一侧**（服务器 `?source=`）—— **按方向算，不按角色**。
   *
   * 服务器两侧的名字取自"谁拥有项目"：`owner` = 项目所有者写的那一侧，
   * `mentor` = 另一方（历史上只有导师会写这一侧）。方向 B 下项目 owner 是**导师**，
   * 于是学生写的落在 `mentor` 侧 —— 继续用"我是不是导师"判断会**写反**，
   * 把两个人的工作区互相覆盖。
   *
   * 规矩一句话：**owner 侧是项目所有者，另一方是 counterpart**；
   * 比对自己那一侧（上传），下载对方那一侧。
   */
  const viewOf = (p: HostProposal): HostProposalView => proposalView(p, myAccountId)

  /**
   * 打开【上传】对话框：先问宿主"本机有哪些工作区**可以回传**"。
   *
   * ⚠️ 这里**不自动拉清单**：清单是一次读盘扫描，用户还没看就扫一个几百 MB 的工作区
   * 是白费力气（下拉选中哪个，才扫哪个）。
   */
  /**
   * 选工作区 → 拉文件清单（宿主扫描研究根，`mentor` 口径）。
   *
   * 默认勾选**推荐级**（研究状态 / 计划 / 论文 / 实验 / 评阅记录…）：导师回传的通常
   * 就是整份研究进展；文献原文之类的大件留给用户自己勾。
   */
  const selectUploadWorkspace = async (id: string): Promise<void> => {
    setUploadWorkspaceId(id)
    setUploadPlan(null)
    setUploadSelected(new Set())
    setUploadExpanded(new Set())
    setExchangeNotice(null)
    if (!id) return
    setUploadPlanLoading(true)
    const res = await post('mentor/uploadPlan', { workspaceId: id })
    setUploadPlanLoading(false)
    if (!res.ok) {
      setExchangeNotice({ tone: 'error', text: res.error?.message ?? t('community.error.unknown') })
      return
    }
    const v = res.value as HostMentorUploadPlan
    setUploadPlan(v)
    setUploadSelected(new Set(v.plan.defaultSelection))
  }

  /*
   * ⚠️ 定义顺序有约束：`openExchange` 要按宿主播报的 `currentWorkspaceId` **默认选中**当前
   * 会话的工作区，因此会调用下面这个函数。它是 `const`（不是函数声明），定义在 `openExchange`
   * **之前**才不会踩 TDZ。改动这里时不要把它挪到后面。
   */
  const openExchange = async (p: HostProposal): Promise<void> => {
    setExchangeNotice(null)
    setUploadWorkspaces(null)
    setUploadRegistry(null)
    setUploadWorkspaceId('')
    setUploadCurrentWorkspaceId(null)
    setUploadPlan(null)
    setUploadSelected(new Set())
    setUploadExpanded(new Set())
    setExchange({ proposal: p, mode: 'upload' })
    // 带上 sessionId：宿主据此算出"当前会话的工作区"（界面默认选中它）。
    // 旧宿主不认这个字段，会照常只返回 items —— 此时不预选，回退到"请选择"。
    const res = await post('mentor/uploadState', {
      ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
    })
    if (!res.ok) {
      // 读不到 ≠ 没有：如实说原因（旧宿主没有这个端点 → unknown-endpoint → 提示重启）
      setUploadWorkspaces([])
      setUploadRegistry({
        available: false,
        reason:
          res.error?.code === 'unknown-endpoint'
            ? t('community.error.hostRestart')
            : (res.error?.message ?? t('community.error.unknown')),
      })
      return
    }
    const v = res.value as {
      available?: boolean
      reason?: string | null
      items?: HostUploadWorkspace[]
      currentWorkspaceId?: string | null
    }
    const items = v.items ?? []
    setUploadWorkspaces(items)
    setUploadCurrentWorkspaceId(v.currentWorkspaceId ?? null)
    setUploadRegistry({ available: v.available ?? false, reason: v.reason ?? null })
    /*
     * 默认选中**当前会话的工作区**（与【下载】同一行为）。选中后立刻拉清单 ——
     * 与用户自己在下拉里选是同一个动作，走 `selectUploadWorkspace` 同一条路径，
     * 不另开一条"预设"分支。
     */
    const preferred = v.currentWorkspaceId && items.some((w) => w.id === v.currentWorkspaceId)
      ? v.currentWorkspaceId
      : ''
    if (preferred) void selectUploadWorkspace(preferred)
  }

  /** 分类级勾选（与发布对话框同一套语义）。 */
  /** 勾选 / 取消**一组**文件（分类整选、目录整枝切换都走它 —— 见 `upload-tree.ts`）。 */
  const toggleUploadFiles = (relPaths: string[], next: boolean): void => {
    setUploadSelected((prev) => {
      const out = new Set(prev)
      for (const rel of relPaths) {
        if (next) out.add(rel)
        else out.delete(rel)
      }
      return out
    })
  }

  const toggleUploadExpand = (categoryId: string): void => {
    setUploadExpanded((prev) => {
      const out = new Set(prev)
      if (out.has(categoryId)) out.delete(categoryId)
      else out.add(categoryId)
      return out
    })
  }

  /**
   * 回传：把勾选的文件交给宿主（算摘要 → 与服务器比对 → **只传变化的** → 分批上传）。
   *
   * 上传期间**按秒问宿主进度**（同【下载】那次的道理）：一次 `post` 要等**所有批次**
   * 做完，几十 MB 在一分钟以上 —— 没有进度就只有一句「上传中…」，慢与死分不出来。
   * 轮询失败不打断上传（那只是好看，不能把主流程弄挂）。
   */
  const runUpload = async (): Promise<void> => {
    const target = exchange?.proposal
    if (!target || !uploadWorkspaceId) return
    setExchangeBusy(true)
    setExchangeNotice(null)
    setUploadProgress(null)
    let timer: ReturnType<typeof setInterval> | undefined
    const stopPoll = (): void => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    }
    timer = setInterval(() => {
      void post('mentor/uploadProgress', { projectId: target.projectId }).then((p) => {
        if (!p.ok) return
        const v = p.value as HostUploadProgress | undefined
        if (v && typeof v.doneFiles === 'number') setUploadProgress(v)
      })
    }, 1000)
    let res: Awaited<ReturnType<typeof post>>
    try {
      res = await post('mentor/upload', {
        projectId: target.projectId,
        workspaceId: uploadWorkspaceId,
        paths: Array.from(uploadSelected),
        // 增量比对**自己那一侧**（服务器按"谁写的"分两侧，同名互不覆盖）
        source: viewOf(target).mySide,
      })
    } finally {
      stopPoll()
      setExchangeBusy(false)
      setUploadProgress(null)
    }
    if (!res.ok) {
      // 不关窗：失败原因（尤其"服务器还没放开 review/ 限制"）要留在眼前；文件也没丢
      setExchangeNotice({ tone: 'error', text: res.error?.message ?? t('community.error.unknown') })
      return
    }
    const v = res.value as {
      selected?: number
      uploaded?: number
      uploadedBytes?: number
      skippedExisting?: number
      oversize?: unknown[]
    }
    const skippedOversize = (v.oversize ?? []).length
    // 成功就关窗（同下载）：文件已经上去了，对话框没有可做的事，回执放到列表页顶部
    setExchange(null)
    setMentorNotice({
      tone: 'success',
      text:
        (v.uploaded ?? 0) === 0 && (v.skippedExisting ?? 0) > 0
          ? t('community.exchange.uploadNoChange', { count: v.selected ?? 0 })
          : skippedOversize > 0
            ? t('community.exchange.uploadPartial', { uploaded: v.uploaded ?? 0, skipped: skippedOversize })
            : t('community.exchange.uploadDone', { count: v.uploaded ?? 0 }),
    })
    // 刷新提案：["导师已指导"] 那行进展由服务器的 review 计数决定，传完要重读
    await loadProposals()
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
    // 下载的是**对方那一侧**：方向 A 导师下学生的工作区（owner 侧）、学生取导师的交付
    // （mentor 侧）；方向 B 反过来（学生下导师的选题、导师取学生的进展）。
    const source = viewOf(p).otherSide
    const res = await post('mentor/downloadState', {
      projectId: p.projectId,
      prefix,
      source,
      // v23：宿主按它算"当前会话的工作区"（预选 + 决定提示词能不能填）
      ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
    })
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
      /** v23 才有；旧宿主不返回 → 界面不显示校验状态。 */
      targets?: HostDownloadTarget[]
      remoteWorkspaceId?: string | null
      currentWorkspaceId?: string | null
      protocol?: number
    }
    /*
     * v23 的校验状态只有在**宿主报了新协议号**时才用：光有字段不够 ——
     * 旧宿主可能压根不返回 `targets`，这时按"完全没有校验"渲染（不假装校验过）。
     */
    const supportsCheck = typeof v.protocol === 'number' && v.protocol >= HOST_PROTOCOL_MIN_FOR_CHECK
    const targets = supportsCheck && Array.isArray(v.targets) ? v.targets : null
    /*
     * 预选优先级（v23 起）：
     *   ① **当前会话的工作区** —— 它是唯一"下载完能把提示词填进去"的目标（agent 只写得进
     *      自己会话的工作区），所以**默认就选它**；
     *   ② 这项工作**已发布到的那个工作区**（学生侧指导意见该落回那里）；
     *   ③ 第一个。
     *
     * ⚠️ 这里**不按判定过滤**：判定只决定提示词说什么，不决定"能不能下" ——
     * 早先有一版会把 `other` / `missing` 从预选里跳过，结果"当前工作区恰好是另一项研究"时
     * 默认落到别处，用户会以为提示词填不进去是坏了。
     */
    const current = v.currentWorkspaceId ? v.items.find((w) => w.id === v.currentWorkspaceId) : undefined
    /*
     * ② 这项工作**已发布到的那个工作区**（学生侧指导意见该落回那里）。
     * v0.6.0：`published` 变成"一个方向一条记录"，所以按 `projectId` 在数组里找
     * —— 项目 id 在整个服务器上唯一，方向不必再比一次。
     */
    const own = v.items.find((w) =>
      (mine ?? []).some((m) => m.id === w.id && m.published.some((r) => r.projectId === p.projectId)),
    )
    const preferred = [current, own, ...v.items].find(Boolean)
    setDownload({
      proposal: p,
      source,
      workspaces: v.items,
      available: v.available,
      reason: v.reason,
      selection: preferred?.id ?? '',
      files: v.files,
      bytes: v.bytes,
      fileName: v.expectedName,
      notice: null,
      targets,
      remoteWorkspaceId: v.remoteWorkspaceId ?? null,
      currentWorkspaceId: v.currentWorkspaceId ?? null,
      done: null,
    })
  }

  const runDownload = async (): Promise<void> => {
    const target = download
    if (!target || !target.selection) return
    const projectId = target.proposal.projectId
    const chosen = target.workspaces?.find((w) => w.id === target.selection)
    const chosenTarget = target.targets?.find((x) => x.id === target.selection)
    setDownloadBusy(true)
    setDownloadReceived(null)

    /*
     * ═══ 第一件事：**先把同步命令填进输入框**（2026-10 用户要求）═══
     *
     * 下载一份快照要几秒到两分钟 —— 没必要让用户干等到落盘完成才看见要发的那一行。
     * 所以这里**在下载之前**就把 `/research sync @<zip>` 填好：**只有文件名是猜的**
     * （服务器才是命名的权威，同名还会加 `-2`）。
     *
     * 名字猜错的代价很小：命令自己会校验——文件不存在时它会把同前缀的候选列出来。
     * 所以这里不再往文本里塞"以实际为准"的说明，落盘后真名不同时给一个更正按钮即可。
     */
    const provisionalDir = chosen?.path ?? ''
    const provisionalState = mergeStateOf(chosenTarget?.status)
    const provisionalName = target.fileName
    /*
     * 填不填得进输入框有个硬条件：**目标工作区必须就是当前会话的工作区** ——
     * DSH 的写权限按会话自己的工作区收窄，指向别处的话 agent 根本写不进去，
     * 填进去就是给用户一段必错的提示词。这时只给「复制提示词」。
     */
    const canFill = Boolean(session?.setDraft) && target.selection === target.currentWorkspaceId
    const fillHint = canFill
      ? null
      : !session
        ? t('community.merge.noComposer')
        : t('community.merge.otherWorkspace', { dir: provisionalDir })
    const provisionalPrompt = provisionalDir ? syncCommandLine(`${provisionalDir}/${provisionalName}`) : ''
    /*
     * 输入框空着就直接填好（用户少一步）；里面已经有内容就**绝不动它** ——
     * 只把提示词备着，等用户点「填入输入框」才替换（那句提示会说"会替换"）。
     */
    const autoFilled = Boolean(provisionalPrompt) && canFill && session?.draftEmpty === true
    if (autoFilled) session?.setDraft?.(provisionalPrompt)
    setDownload((prev) =>
      prev
        ? {
            ...prev,
            notice: null,
            done: {
              phase: 'pending',
              dir: provisionalDir,
              name: provisionalName,
              plan: t(`community.merge.plan.${provisionalState}`),
              prompt: provisionalPrompt,
              correctedPrompt: null,
              canFill,
              filled: autoFilled,
              fillHint,
            },
          }
        : prev,
    )

    /*
     * 下载期间**按秒问宿主收到了多少字节**。
     *
     * 为什么不在这条请求上做流式：浏览器↔宿主是请求/响应模型，`post` 只在整件事做完
     * 才返回；而真实快照是十几 MB / 一两分钟（实测 13.6 MB、115 秒），那段时间界面
     * 若只有一个转圈，用户分不清"慢"和"死" —— 2026-09 就是这么被报上来的。
     * 轮询的代价是本地一次读取（宿主不触网、不读盘），比改通道简单得多。
     *
     * 轮询失败**不打断下载**：进度只是好看，不能让一个辅助调用把主流程弄挂。
     */
    let timer: ReturnType<typeof setInterval> | undefined
    const stopPoll = (): void => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    }
    timer = setInterval(() => {
      void post('mentor/downloadProgress', { projectId }).then((p) => {
        if (!p.ok) return
        const got = (p.value as { received?: number } | undefined)?.received
        if (typeof got === 'number') setDownloadReceived(got)
      })
    }, 1000)
    let res: Awaited<ReturnType<typeof post>>
    try {
      res = await post('mentor/download', {
        projectId,
        workspaceId: target.selection,
        prefix: downloadPrefix(target.proposal),
        // 便签用它做展示（`/research sync` 的交接文本里给出"这是哪个项目"）
        projectTitle: target.proposal.projectTitle ?? '',
        // 与预检**同一侧**：否则会出现"预检说有 3 个文件、点下去 404"
        source: target.source,
        // v23：预检时那一侧的标识。宿主据此**在落盘前再判一次**，并用归档响应头复核。
        ...(target.remoteWorkspaceId ? { remoteWorkspaceId: target.remoteWorkspaceId } : {}),
      })
    } finally {
      stopPoll()
      setDownloadBusy(false)
      setDownloadReceived(null)
    }
    if (!res.ok) {
      /*
       * 失败：ZIP 没落盘 → **刚才填进输入框的那段提示词先别发送**。
       * 面板撤掉、回执说清楚（输入框是用户的，插件不动它）。
       */
      setDownload((prev) =>
        prev
          ? {
              ...prev,
              done: null,
              notice: {
                tone: 'error',
                text: `${res.error?.message ?? t('community.error.unknown')} ${t('community.merge.downloadFailedHint')}`,
              },
            }
          : prev,
      )
      return
    }
    const v = res.value as {
      dir: string
      path: string
      name: string
      bytes: number
      /** v23：目标研究根（已有或将会是）。 */
      researchRoot?: string | null
      /** v23：落盘前那一次判定。 */
      workspaceStatus?: HostDownloadTarget['status']
      /** v23：这项研究的标识（归档响应头优先）。 */
      workspaceId?: string | null
      /** v23：布局（`legacy` 时提示词要换一套备份说法）。 */
      workspaceLayout?: 'nested' | 'legacy' | null
    }
    /*
     * 下载成功**不等于**事情做完：ZIP 还在工作区根上躺着，要解压并和本地内容**融合**
     * 才算研究前进了一步。那一步交给用户会话里的 agent —— 那一行命令上面**已经填好了**，
     * 这里只做一件事：文件名与预检猜的不同时，给一个"按实际文件名更新"的更正版。
     */
    const correctedPrompt = syncCommandLine(`${v.dir}/${v.name}`)
    const nameChanged = Boolean(correctedPrompt) && v.name !== provisionalName
    setDownload((prev) =>
      prev
        ? {
            ...prev,
            notice: null,
            done: {
              phase: 'ready',
              dir: v.dir,
              name: v.name,
              plan: t(`community.merge.plan.${mergeStateOf(v.workspaceStatus)}`),
              // 没变就是同一个文本；变了则保留"已填进去的那一版"，更正版放另一栏等用户点
              prompt: nameChanged ? provisionalPrompt : correctedPrompt,
              correctedPrompt: nameChanged ? correctedPrompt : null,
              canFill,
              filled: autoFilled,
              fillHint,
            },
          }
        : prev,
    )
    setMentorNotice({
      tone: 'success',
      text: autoFilled
        ? t('community.merge.filled')
        : t('community.exchange.downloadDone', { dir: v.dir, name: v.name }),
    })
    /*
     * 下载成功的那一刻，宿主已把**这一版的水位**存下 —— 刷新提案让"学生更新了"
     * 的提示**当场消失**（否则要等下一次刷新才对上，用户会以为提示坏了）。
     */
    await loadProposals()
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
    COMMUNITY_LIST_CACHE.set(communityCacheKey(activeServer, account?.id ?? null, 'mine'), value.items ?? [])
  }, [post, activeServer, account?.id])

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
    /*
     * 命中缓存 → 直接显示，**不联网**（用户要求：不要自动刷新，用 ↻ 按钮）。
     * 未命中（首次进入 / 换了服务器或账号）→ 才拉一次。
     */
    const key = communityCacheKey(activeServer, account?.id ?? null, 'mine')
    const hit = COMMUNITY_LIST_CACHE.get(key)
    if (hit !== undefined) {
      setMine(hit as HostLocalWork[])
      return
    }
    // 【我的】不依赖登录（本机项目 + 服务器给的"已在网络中"），所以不按 configured 拦
    void loadMine()
  }, [activeServer, account?.id, loadMine])

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
    const key = communityCacheKey(activeServer, account?.id ?? null, 'proposals')
    const hit = COMMUNITY_LIST_CACHE.get(key)
    if (hit !== undefined) {
      setProposals(hit as HostProposal[])
      return
    }
    void loadProposals()
  }, [activeServer, account?.id, configured, loadProposals])

  /**
   * 点【寻找指导】/【寻找学生】/【更新…】：**先取上传计划**，再决定是直接更新还是弹对话框。
   *
   * - 从未发布过 → 一定弹（用户要看到"传什么、多少、花几个 Token"）；
   * - 该方向已发布且**没有变化** → 直接更新（配置被记住时），只给一条回执；
   * - 该方向已发布但**有变化** → 弹，并标出本次会更新哪些文件。
   *
   * ⚠️ `direction` 是**用户点的那个按钮**决定的，全程带着走：
   * 它决定查哪条本地记录、建哪个服务器项目、记回哪条指纹 —— 两个方向互不可复用。
   */
  const openPublish = async (w: HostLocalWork, direction: HostProjectDirection): Promise<void> => {
    setDialogLoading({ id: w.id, direction })
    setPublishNotice(null)
    const res = await post('work/uploadPlan', { id: w.id, direction })
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
    // 该方向已发布 + 记住过选择 + 内容没有变化 → 不打扰用户，直接更新
    const publishedHere = publishedIn(w, direction)
    if (publishedHere && data.remembered && data.changed.length === 0 && data.selection.length > 0) {
      await doPublish(w, direction, data.selection, true)
      return
    }
    setDialog({
      work: w,
      direction,
      data,
      selection: new Set(data.selection),
      remember: true,
      expanded: new Set(),
    })
  }

  /** 真正执行发布（对话框确认后 / 无变化直接更新时）。 */
  const doPublish = async (
    w: HostLocalWork,
    direction: HostProjectDirection,
    selection: string[],
    remember: boolean,
  ): Promise<void> => {
    setPublishing({ id: w.id, direction })
    setPublishNotice(null)
    /*
     * 上传期间按秒问进度（与导师回传同一条端点、同一根进度条）。
     *
     * 附件阶段是一串请求，`work/publish` 要等全部批次做完才返回 —— 没有这个轮询，
     * 【我的】里发布一个带附件的工作时界面上只有按钮的「发布中…」，慢与死分不出来。
     * 轮询失败不打断发布（那只是好看，不能把主流程弄挂）。
     */
    setPublishProgress(null)
    let publishTimer: ReturnType<typeof setInterval> | undefined
    const stopPublishPoll = (): void => {
      if (publishTimer !== undefined) clearInterval(publishTimer)
      publishTimer = undefined
    }
    publishTimer = setInterval(() => {
      void post('mentor/uploadProgress', { projectId: w.id }).then((p) => {
        if (!p.ok) return
        const v = p.value as HostUploadProgress | undefined
        if (v && typeof v.doneFiles === 'number') setPublishProgress(v)
      })
    }, 1000)
    let res: Awaited<ReturnType<typeof post>>
    try {
      res = await post('work/publish', { id: w.id, direction, selection, remember })
    } finally {
      stopPublishPoll()
    }
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
      published: {
        version: number
        created: boolean
        chargedTokens: number
        title?: string
        /** 名字没改成功的原因（缺省 = 改好了 / 不需要改）。 */
        renameFailed?: string
      }
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
     *
     * ⚠️ 两个按钮共用这一行回执，所以**必须写出方向**：发布到"寻找学生"却说成
     * 「已发布」，用户无从判断刚才点的是哪一个。
     */
    const bits: string[] = [
      // 回执用**网络里这次用的名字**：用户点完就知道发出去的名字对不对
      // （旧宿主不回 `title` → 退回本机工作区名，不编）
      t('community.notice.published', {
        title: value.published.title ?? w.title,
        version: value.published.version,
      }),
      t(direction === 'SEEK_STUDENT' ? 'community.action.seekStudent' : 'community.action.seekMentor'),
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
    /*
     * 名字没改成功要**说出来**：回执里写的是这次想用的名字，而网络里还是旧名字 ——
     * 不说就等于让用户以为改好了（发布本身是成功的，所以仍是成功回执 + 一句警告）。
     */
    if (value.published.renameFailed) {
      bits.push(t('community.notice.renameFailed', { reason: value.published.renameFailed }))
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
    /*
     * ⚠️ 依赖里有**生效地址**：换服务器后两个列表都必须重读，否则显示的是上一台的。
     * 未登录 / 没换到新地址时清空（不能把上一台的条目当成本机的）。
     *
     * 两个方向**都要拉**：【可指导】与【可加入】是两个 Tab，用户可能先点后者；
     * 只拉一个的话切过去是空的，看起来像"没有选题"（而真相是"还没读"）。
     */
    if (!activeServer || !account) {
      setWorks(null)
      setWorksError(null)
      setJoinable(null)
      setJoinableError(null)
      setOpen(null)
      setDetail(null)
      return
    }
    // 命中缓存 → 两个列表都直接显示；未命中才联网（↻ 按钮始终在 Tab 上）
    const keyMentor = communityCacheKey(activeServer, account.id, 'works')
    const keyJoin = communityCacheKey(activeServer, account.id, 'joinable')
    const hitMentor = COMMUNITY_LIST_CACHE.get(keyMentor)
    const hitJoin = COMMUNITY_LIST_CACHE.get(keyJoin)
    if (hitMentor !== undefined) setWorks(hitMentor as HostWork[])
    if (hitJoin !== undefined) setJoinable(hitJoin as HostWork[])
    if (hitMentor === undefined) void loadWorks('SEEK_MENTOR')
    if (hitJoin === undefined) void loadWorks('SEEK_STUDENT')
  }, [account?.id, activeServer, loadWorks])

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
    // 刷新身份顺带刷新仪表板（存储 / 项目阶梯也变了的话，这一下就对上）
    if (userOpen) void loadUsage()
  }

  /**
   * 读**用量与配额**（存储空间已用 / 总额、项目阶梯、下次发布花费）。
   *
   * ⚠️ 失败**不清空**已有数字：网络抖一下就显示"未知"，比显示上一次读到的值更糟
   * （2026-09 余额那次的口径）。`usagePhase` 只用来区分"还在读"与"读不到"，
   * 数字本身保持原样 —— 而 `null`（服务器真的没给）则如实显示"未知"。
   */
  const loadUsage = React.useCallback(async (): Promise<void> => {
    setUsagePhase('loading')
    setUsageStaleHost(false)
    const res = await post('account/usage', {})
    if (!res.ok) {
      setUsagePhase('unavailable')
      // 旧宿主没有这个端点 → 说清"需重启"，而不是让这一块永远空着（协议 v27）
      setUsageStaleHost(res.error?.code === 'unknown-endpoint')
      return
    }
    const next = (res.value as { usage: HostUsage | null }).usage ?? null
    setUsage(next)
    setUsagePhase(next ? 'ready' : 'unavailable')
  }, [post])

  /**
   * 换账号 / 换服务器 → **先作废**仪表板上的旧数字。
   *
   * 不这么做的话，切到另一台服务器之后，"存储空间"会短暂（或永久，如果读不到）
   * 显示**上一个账号**的配额 —— 那是最难发现的一类假信息。
   */
  React.useEffect(() => {
    setUsage(null)
    setUsagePhase('idle')
    setUsageStaleHost(false)
  }, [account?.id, activeServer])

  /** 展开且已登录才去读用量（折叠着不联网）。 */
  React.useEffect(() => {
    if (!userOpen || !account) return
    void loadUsage()
  }, [userOpen, account?.id, activeServer, loadUsage])

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

  /*
   * 指导提案分栏：**按方向**决定我在这条关系里的角色。
   *
   * ⚠️ 早先是"我是 researcher = 我收到的"，那只在方向 A 成立：方向 B 里
   * 项目 owner 是导师、发起人是学生，于是"我是 researcher"意味着**我发起的**。
   * 所以统一走 {@link proposalView}，这里只做一次映射。
   * 身份缺失时宿主已回退成 id，短 id 也能对上 account.id。
   */
  const myAccountId = account?.id ?? ''
  const trackItems = React.useMemo(
    () =>
      (proposals ?? [])
        .map((p) => ({ p, view: proposalView(p, myAccountId) }))
        .sort((a, b) => {
          // 该我动作（等处理）的顶上去，然后是跟踪中，最后是终态；同一档新的在前
          const rank: Record<string, number> = { PROPOSED: 0, ACCEPTED: 1 }
          const byStatus = (rank[a.p.status] ?? 9) - (rank[b.p.status] ?? 9)
          if (byStatus !== 0) return byStatus
          const byAction = Number(b.view.iAmAcceptor && b.p.status === 'PROPOSED') - Number(a.view.iAmAcceptor && a.p.status === 'PROPOSED')
          if (byAction !== 0) return byAction
          return (b.p.createdAt ?? '').localeCompare(a.p.createdAt ?? '')
        }),
    [proposals, myAccountId],
  )

  /**
   * 我**发起**的提案按项目索引 —— 【可指导】/【可加入】每行据此显示状态角标。
   *
   * ⚠️ 两个 Tab 各要一份，且取的是**不同**的提案集合：
   * 【可指导】里我是导师（我出价），【可加入】里我是学生（我出价）；
   * 混在一起会让"我导师身份对别人的工作发起的提案"出现在我的出价记录里。
   *
   * 同一项目可能有历史提案（被拒之后又发了一次），所以取**最需要用户注意**的那条：
   * `PROPOSED`（等对方响应）优先于 `ACCEPTED`，都优先于终态（已拒绝 / 已过期 / 已取消）。
   */
  const proposalsByProject = (from: 'mentor' | 'researcher'): Map<string, HostProposal> => {
    const rank: Record<string, number> = { PROPOSED: 0, ACCEPTED: 1 }
    const out = new Map<string, HostProposal>()
    for (const p of proposals ?? []) {
      const view = proposalView(p, myAccountId)
      // 既要"我在这条关系里是这一边"，又要"这次提案是我发起的" —— 后者不能省：
      // 方向 A 里我是学生时，这条提案是**导师**发起的，不该进我的出价角标。
      if (view.myRole !== from || !view.iProposed) continue
      const current = out.get(p.projectId)
      if (!current || (rank[p.status] ?? 9) < (rank[current.status] ?? 9)) out.set(p.projectId, p)
    }
    return out
  }
  /** 我在【可指导】里作为**导师**发起的提案（按项目）。 */
  const myMentorProposalByProject = proposalsByProject('mentor')
  /** 我在【可加入】里作为**学生**出价的提案（按项目）。 */
  const myResearcherProposalByProject = proposalsByProject('researcher')

  /**
   * 费用数字（只给数，不做解释性描述）。
   *
   * 论文类条件把**等级**带上（`· JCR 2区`）：同样的 800 Token，按几区定价是两回事，
   * 只报数字会让接受方看不清自己答应的是什么。非论文类条件没有等级，不加后缀。
   */
  const feeText = (p: HostProposal): string => {
    const base = t('community.mentor.feeText', {
      total: p.totalFee,
      deposit: p.depositAmount,
      success: p.successPaymentAmount,
    })
    const level = paperLevelOf(p.successCondition)
    const text = paperLevelText(level)
    return text ? `${base} · ${t(text.key, text.params)}` : base
  }

  /* ── 仪表板要画的比例（纯计算，先算好再画）──────────────────────────
   *
   * 三块小图的数字都从**服务器给的量**来：Token 来自 `state.tokens`，
   * 存储 / 项目来自 `usage`。任何一项拿不到就是 `null` → 画"未知"，
   * **不**用 0 兜底（0 是一个断言，不是"不知道"）。
   */
  const tokens = state?.tokens ?? null
  const storage = usage?.storage ?? null
  /** 可用 / 合计：没有余额或合计为 0 时是 0（不是"满"）。 */
  const tokenFraction = tokens && tokens.total > 0 ? tokens.available / tokens.total : 0
  /** 已用 / 容量：容量未知（0）时画不出比例。 */
  const storageFraction = storage && storage.capacityBytes > 0 ? storage.usedBytes / storage.capacityBytes : 0
  /** "还在读"与"读不到"要分开：前者给 `…`（马上就有），后者给 `—`（真的没有）。 */
  const pendingMark = usagePhase === 'loading' ? '…' : '—'

  return (
    <>
      {/* ══ 用户信息区（内部 Tabs：账号 / 服务器设置）══════════════════════ */}
      <div style={S.card}>
        {/*
         * 卡片头 = **折叠开关**（2026-10 用户要求：默认折叠）。
         *
         * 折叠时这一行就回答了最常看的两个问题"我是谁 / 还剩多少 Token"，
         * 展开才是账号与服务器设置。整行可点，键盘也能开（Enter / Space）——
         * 用 `div[role=button]` 而不是 `<button>`：里面还有一个余额按钮，
         * 按钮套按钮是非法 HTML（点击余额会连带切换折叠）。
         */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={userOpen}
          style={{ ...S.cardHead, cursor: 'pointer' }}
          title={userOpen ? t('community.tip.collapse') : t('community.tip.expand')}
          onClick={() => setUserOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setUserOpen((v) => !v)
            }
          }}
        >
          <span style={{ ...S.chevron, transform: userOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
          {t('community.title')}
          {/* 折叠时的摘要：用户名 + Token 数（展开后这两个信息在账号行 / 仪表板里） */}
          {!userOpen ? (
            <>
              {account ? (
                <span style={{ ...S.accountName, flex: '0 0 auto' }}>{account.displayName}</span>
              ) : phase === 'ready' ? (
                // 未登录：这里给的是"点开能做什么"，所以按提示样式（不是账号名）
                <span style={{ ...S.hint, flex: '0 0 auto' }}>{t('community.tab.signIn')}</span>
              ) : null}
              {tokens ? (
                <button
                  type="button"
                  style={{ ...S.tokenBadge, flex: '0 0 auto', opacity: busy ? 0.55 : 1 }}
                  disabled={busy}
                  title={t('community.tip.balance')}
                  // 折叠状态下也能直接看明细 —— 所以它不能触发整行的折叠开关
                  onClick={(e) => {
                    e.stopPropagation()
                    openTokenDialog()
                  }}
                >
                  ◎ {tokens.available} Token
                </button>
              ) : null}
            </>
          ) : null}
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

        {userOpen ? (
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
              <>
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
                        state.tokens.funded !== null && state.tokens.grant !== null
                          ? t('community.tip.balancePools', {
                              funded: state.tokens.funded,
                              grant: state.tokens.grant,
                            })
                          : state.tokens.frozen > 0
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

                {/*
                 * 仪表板：三块小图（Token / 存储 / 项目）—— 一屏回答"我还剩多少、
                 * 装不装得下、发布要花多少"。数据来自 `state.tokens`（已验证的余额）
                 * 与 `account/usage`（联网一次）；读不到就画 `—`，**绝不**画 0。
                 */}
                <div style={S.dash}>
                  <DashTile
                    title={t('community.dash.token')}
                    chart={<UsageRing fraction={tokenFraction} />}
                    value={tokens ? String(tokens.available) : pendingMark}
                    unit={tokens ? 'Token' : null}
                    sub={
                      tokens
                        ? tokens.funded !== null && tokens.grant !== null
                          ? tokens.frozen > 0
                            ? t('community.dash.tokenPoolsFrozen', {
                                funded: tokens.funded,
                                grant: tokens.grant,
                                frozen: tokens.frozen,
                              })
                            : t('community.dash.tokenPools', {
                                funded: tokens.funded,
                                grant: tokens.grant,
                              })
                          : tokens.frozen > 0
                            ? t('community.dash.tokenFrozen', { frozen: tokens.frozen })
                            : t('community.dash.tokenTotal', { total: tokens.total })
                        : t('community.dash.unknown')
                    }
                  />
                  <DashTile
                    title={t('community.dash.storage')}
                    chart={
                      <UsageRing
                        fraction={storageFraction}
                        // 用掉九成以上才变黄：不到那一档就别制造紧张感
                        tone={storage && storageFraction >= 0.9 ? 'warn' : storage ? 'brand' : 'neutral'}
                      />
                    }
                    value={storage ? `${Math.round(storageFraction * 100)}%` : pendingMark}
                    sub={
                      storage
                        ? t('community.dash.storageSub', {
                            used: formatBytes(storage.usedBytes),
                            total: formatBytes(storage.capacityBytes),
                          })
                        : t('community.dash.unknown')
                    }
                  />
                  <DashTile
                    title={t('community.dash.projects')}
                    chart={<div style={S.dashStat}>{usage ? usage.paidProjects : pendingMark}</div>}
                    sub={
                      usage
                        ? t('community.dash.projectsSub', {
                            tier: usage.tier,
                            cost: usage.nextPublishCost,
                          })
                        : t('community.dash.unknown')
                    }
                  />
                </div>
                {/* 旧宿主没有 `account/usage`（协议 v27）：说清"需重启"，不让它安静地空着 */}
                {usageStaleHost ? <div style={S.hint}>{t('community.error.hostRestart')}</div> : null}
              </>
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
        ) : null}
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
          progress={publishProgress}
          onToggleFiles={(relPaths, next) =>
            setDialog((d) => {
              if (!d) return d
              const sel = new Set(d.selection)
              for (const f of relPaths) {
                if (next) sel.add(f)
                else sel.delete(f)
              }
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
            void doPublish(dialog.work, dialog.direction, [...dialog.selection], dialog.remember)
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

      {/*
        * ══ 提案对话框（点【发起指导】/【出价】时出现；免费操作，对话框即确认）════
        *
        * `variant` 由这一行所属的**方向**决定（【可指导】= 导师出价、【可加入】= 学生出价）——
        * 不用"我是什么角色"：同一个人可能两个角色都有。
        */}
      {proposeTarget ? (
        <ProposeDialog
          t={t}
          title={proposeTarget.title}
          fee={proposeFee}
          feeLoading={proposeFeeLoading}
          busy={proposeBusy}
          error={proposeError}
          variant={proposeTarget.direction === 'SEEK_STUDENT' ? 'researcher' : 'mentor'}
          onCancel={() => {
            setProposeTarget(null)
            setProposeError(null)
          }}
          onTermsChange={(terms) => void requestProposeFee(terms)}
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
          received={downloadReceived}
          notice={download.notice}
          targets={download.targets}
          currentWorkspaceId={download.currentWorkspaceId}
          done={download.done}
          onSelect={(id) => setDownload((prev) => (prev ? { ...prev, selection: id } : prev))}
          onDownload={() => void runDownload()}
          onClose={() => setDownload(null)}
          onFill={() => {
            const prompt = download.done?.prompt
            if (!prompt || !session?.setDraft) return
            /*
             * 走到这里说明输入框里**已经有内容**（空的话下载完就自动填好了）——
             * 按钮旁边那句"会替换输入框里现有的内容"就是给这一步的确认。
             * ⚠️ 只填，**不发送**（绝不调用 submit）。
             */
            session.setDraft(prompt)
            setDownload((prev) =>
              prev?.done ? { ...prev, done: { ...prev.done, filled: true } } : prev,
            )
            setMentorNotice({ tone: 'success', text: t('community.merge.filled') })
          }}
          onCopy={() => {
            const prompt = download.done?.prompt
            if (!prompt) return
            void copyText(prompt).then((copied) => {
              setMentorNotice({
                tone: 'success',
                text: copied ? t('community.merge.copied') : t('community.merge.copyFailed'),
              })
            })
          }}
          onRefill={() => {
            const corrected = download.done?.correctedPrompt
            if (!corrected) return
            /*
             * 落盘的实际文件名与提示词里猜的不同 → 换成更正版。
             * 这是**用户明确点的一下**（不是静默改），所以可以替换输入框。
             */
            if (download.done?.canFill && session?.setDraft) session.setDraft(corrected)
            setDownload((prev) =>
              prev?.done
                ? {
                    ...prev,
                    done: {
                      ...prev.done,
                      prompt: corrected,
                      correctedPrompt: null,
                      filled: prev.done.filled || prev.done.canFill,
                    },
                  }
                : prev,
            )
            setMentorNotice({ tone: 'success', text: t('community.merge.filled') })
          }}
        />
      ) : null}

      {/* ══ 文件交换：【上传】我这一份工作区 ════════════════════════════════ */}
      {exchange?.mode === 'upload' ? (
        <UploadDialog
          t={t}
          proposal={exchange.proposal}
          workspaces={uploadWorkspaces}
          workspacesAvailable={uploadRegistry?.available ?? false}
          workspacesReason={uploadRegistry?.reason ?? null}
          workspaceId={uploadWorkspaceId}
          currentWorkspaceId={uploadCurrentWorkspaceId}
          plan={uploadPlan}
          planLoading={uploadPlanLoading}
          selection={uploadSelected}
          expanded={uploadExpanded}
          busy={exchangeBusy}
          progress={uploadProgress}
          notice={exchangeNotice}
          onSelectWorkspace={(id) => void selectUploadWorkspace(id)}
          onToggleFiles={toggleUploadFiles}
          onToggleExpand={toggleUploadExpand}
          onUpload={() => void runUpload()}
          onClose={() => setExchange(null)}
        />
      ) : null}

      {/* ══ 对方信息（点【导师】/【学生】时出现；数据来自提案内嵌的 profile）════ */}
      {profileTarget ? (
        <PartyProfileDialog
          t={t}
          party={profileTarget.party}
          isMentor={profileTarget.view.counterpartyIsMentor}
          status={profileTarget.proposal.status}
          onClose={() => setProfileTarget(null)}
        />
      ) : null}

      {/* ══ 接受确认（点【接受】时出现；确认前不发请求、不冻结押金）═══════════ */}
      {acceptConfirm ? (
        <AcceptConfirmDialog
          t={t}
          proposal={acceptConfirm}
          party={viewOf(acceptConfirm).counterparty ?? { id: '', displayName: '' }}
          partyIsMentor={viewOf(acceptConfirm).counterpartyIsMentor}
          iPayer={viewOf(acceptConfirm).iAmPayer}
          balance={state?.tokens?.available ?? null}
          funded={state?.tokens?.funded ?? null}
          grant={state?.tokens?.grant ?? null}
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
       * ══ 研究工作（四个视图）══════════════════════════════════════════════
       *
       *   我的   —— **本机**的研究项目（有效 research workspace 的工作区）。
       *            不联网、不需要登录；所有用户都能看到自己的。
       *   可指导 —— 研究网络里学生公开的研究工作（`SEEK_MENTOR`）。**只对导师显示**。
       *   可加入 —— 研究网络里导师公开的选题（`SEEK_STUDENT`）。所有人都能看到。
       *   指导中 —— 我涉及的指导提案（发起 / 接受 / 拒绝 / 文件交换都在这里）。
       *
       * 「我的」在最前（2026-09 用户拍板）：所有人都可能**被**指导，先看自己的。
       * v0.6.0（用户拍板）：Tab 按角色定 —— 研究者只看得到【我的】【可加入】【指导中】，
       * 导师四个都看得到。没有导师角色时**不显示**【可指导】（此前是"显示但说明需要角色"）。
       */}
      <div style={S.card}>
        <div style={S.cardHead}>
          {/* 卡片标题：只说"这一片是什么"，视图的名字交给后面的 Tab */}
          <span style={{ marginRight: 4 }}>{t('community.work.title')}</span>
          {/*
            Tab 上的条数取自**同一个 state**，所以它和点进去看到的行数永远一致
            （`trackItems` 是 `proposals` 的 1:1 映射，`mine`/`works`/`joinable` 直接渲染）。
            未读到 → `null` → 不显示数字（不是 `(0)`）。
          */}
          <MiniTab active={workTab === 'mine'} count={mine?.length ?? null} onClick={() => setWorkTab('mine')}>
            {t('community.tab.mine')}
          </MiniTab>
          {canMentor ? (
            <MiniTab active={workTab === 'mentor'} count={works?.length ?? null} onClick={() => setWorkTab('mentor')}>
              {t('community.tab.mentor')}
            </MiniTab>
          ) : null}
          <MiniTab active={workTab === 'joinable'} count={joinable?.length ?? null} onClick={() => setWorkTab('joinable')}>
            {t('community.tab.joinable')}
          </MiniTab>
          {/* 「指导中」= 我发起的 + 我收到的指导提案（发起 / 接受 / 拒绝都在这里） */}
          <MiniTab active={workTab === 'mentorship'} count={proposals?.length ?? null} onClick={() => setWorkTab('mentorship')}>
            {t('community.tab.mentorship')}
          </MiniTab>
          <span style={{ flex: '1 1 auto' }} />
          {workTab === 'mine' ? (
            <RefreshIconButton t={t} busy={mineLoading} onClick={() => void loadMine()} />
          ) : null}
          {workTab === 'mentor' && account ? (
            <RefreshIconButton t={t} busy={worksLoading} onClick={() => void loadWorks('SEEK_MENTOR')} />
          ) : null}
          {workTab === 'joinable' && account ? (
            <RefreshIconButton t={t} busy={joinableLoading} onClick={() => void loadWorks('SEEK_STUDENT')} />
          ) : null}
          {workTab === 'mentorship' && account ? (
            <RefreshIconButton t={t} busy={proposalsLoading} onClick={() => void loadProposals()} />
          ) : null}
          {workTab === 'joinable' && !account ? <Badge tone="neutral">{t('community.badge.sample')}</Badge> : null}
        </div>
        <div style={S.cardBody}>
          {/*
           * 四个视图。商业闭环：POST /projects/{id}/mentorship-proposals（发起）
           * → POST /mentorship-proposals/{id}/accept（接受 → **冻结押金** + 建合同 + 建关系）。
           * 两个方向走的是同一套端点，方向由**项目自己**决定。
           *
           * ⚠️ 不在「我的」「可指导」「可加入」列表里加内联动作（发起 / 接受都收在
           * 【指导中】一处）—— 两个列表的行保持只读，只有【我的】那两个按钮例外
           * （那是"发布"，不是指导关系上的动作）。
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
          {/* 列表级失败：【可指导】与【可加入】各一处，一个失败不染红另一个 */}
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
          {joinableError ? (
            <div style={S.inlineRow}>
              <Badge tone="error">{joinableError.code}</Badge>
              <span
                style={{
                  color: 'var(--dsw-alias-state-error-primary)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  flex: '1 1 320px',
                  minWidth: 0,
                }}
              >
                {joinableError.message}
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
                {trackItems.map(({ p, view }, i) => (
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
                        {/*
                          **第一行永远是"哪份研究工作"，第二行才是"和谁"**（2026-10 用户定稿）。

                          ⚠️ **不要再按"谁该接受"翻行序**（v0.6.7 修的就是这个）：
                          v0.6.0 曾写成"该我接受 → 粗体放对方名、工作名退到第二行"，理由是
                          "别人申请我时我更关心是谁"。但真实数据里【指导中】的每一行来自
                          **不同来源**（导师出题→学生选题、学生申请导师项目、导师邀请学生…），
                          于是同一个列表里有的行粗体是工作名、有的行粗体是学生名 ——
                          用户直接反馈"显示不一致"（2026-10-26）。列表是**按工作跟踪状态**的，
                          工作名必须是那个恒定的第一行。

                          两行都保留：只给人名时"同一个导师的多个研究工作"分不出来；
                          只给工作名时"**同名**工作分属两个学生"分不出来（本机实测就有两份
                          都叫「ConvFusion-dsh（run）」的提案）。对方是谁放第二行，信息不丢。

                          ⚠️ 粗体那行是 `whiteSpace: nowrap + ellipsis`，所以"和谁"**必须**
                          另起一行（`S.hint` 会换行）：挤进同一行会被省略号截掉，等于没显示。
                        */}
                        <div style={S.listTitle}>
                          {proposalWorkLabel(p) ?? t('community.mentor.untitledProject')}
                        </div>
                        <div style={S.hint}>
                          {view.counterparty?.displayName ?? t('community.mentor.unknownParty')}
                        </div>
                        {/* 费用数字（不做解释性描述）—— 名称之下一行 */}
                        <div style={S.hint}>{feeText(p)}</div>
                        {/*
                          **下载提示**（原"导师侧"提示，v0.6.0 起两侧通用）—— 三态各有说法：
                            · 从没下载过那一侧、且那一侧有内容 → "先下载"；
                            · 下载过、对方动过 → "对方更新了 / 删除了，需要重新下载"；
                            · 下载过、没动 / 无从判断 → 不提示。
                          判据由宿主**按侧**算好（`syncBySide`）：拿**上一次归档响应的水位**与
                          列表里**同一侧**的两个字段比 —— 时间戳变大 = 传了新文件，
                          文件数变了 = 删了文件（互补，缺一不可）。
                          ⚠️ 两侧各有各的水位（服务器 `workspace_*` 对 owner 侧、
                          `counterpart_updated_at` / `review_files` 对另一侧），而**方向决定
                          我下载哪一侧**：方向 A 的导师下 owner 侧、方向 B 的导师下 `mentor` 侧
                          （学生交付的进展）。所以这里不按角色判，只取 `otherSide` 那一份 ——
                          这样方向 B 的导师也能看到"学生又交了东西"。
                        */}
                        {sideSyncHint(t, p, view) ? (
                          <div style={{ ...S.hint, color: 'var(--dsw-alias-state-warn-primary)' }}>
                            {sideSyncHint(t, p, view)}
                          </div>
                        ) : null}
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
                        {translateOr(t, progressLabelKey(p, view), p.status)}
                      </Badge>
                      {/*
                        指导关系建立之后才有文件交换：
                          【下载】两端都显示 —— 下载**对方那一侧**的快照继续推进研究；
                          【上传】只有 **owner 之外** 的一方 —— 项目所有者本来就在
                          【我的】里更新自己的工作区（方向 A 是学生、方向 B 是导师）。
                      */}
                      {canDownloadProposal(p, view) ? (
                        <button
                          type="button"
                          style={S.ghostBtn}
                          title={t('community.tip.download')}
                          onClick={() => void requestDownload(p)}
                        >
                          {t('community.action.download')}
                        </button>
                      ) : null}
                      {p.status === 'ACCEPTED' && !view.iAmOwner ? (
                        <button
                          type="button"
                          style={{ ...S.accentBtn, opacity: 0.85 }}
                          title={t('community.tip.upload')}
                          onClick={() => void openExchange(p)}
                        >
                          {t('community.action.upload')}
                        </button>
                      ) : null}
                      {/*
                        对方的资料 —— 判据是"服务器**给没给**这一方的 profile 键"，
                        不是"profile 是不是非空"：
                          · 键在、值 `null`（投影了但对方没填）→ **显示**按钮，
                            点开如实说"尚未填写"；
                          · 键都不在（服务器不给看这一方的资料）→ **不显示**。
                        服务器按"谁要判断谁"投影（方向 A 给 researcher 看 mentor 的，
                        方向 B 给 mentor 看 researcher 的），所以这里不按角色判断。
                      */}
                      {view.counterparty?.profile !== undefined ? (
                        <button
                          type="button"
                          style={S.ghostBtn}
                          title={t(
                            view.counterpartyIsMentor
                              ? 'community.mentor.profileTitle'
                              : 'community.mentor.profileTitleResearcher',
                          )}
                          onClick={() =>
                            setProfileTarget({ proposal: p, view, party: view.counterparty! })
                          }
                        >
                          {t(view.counterpartyIsMentor ? 'community.action.viewMentor' : 'community.action.viewStudent')}
                        </button>
                      ) : null}
                      {/*
                        * 只有"等我处理"的这一条才给动作 —— 其余状态纯跟踪。
                        *
                        * ⚠️ 做成 **Split Button**（2026-09 用户要求）：一行里塞三个按钮时
                        * 宽度不够、右侧信息被挤掉。【拒绝】收进 ▾ 的下拉里，行上只剩
                        * 「对方 + 接受 ▾」两段。
                        *
                        * 下拉用 `position: fixed` 按按钮位置定位，而不是 `absolute`：
                        * 外层卡片有 `overflow: hidden`（圆角需要），absolute 菜单会被裁掉。
                        */}
                      {view.iAmAcceptor && p.status === 'PROPOSED' ? (
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
                        {/* 研究工作**自己的名字**（与【指导中】同一个取值规则，见 workLabelOf） */}
                        <div style={S.listTitle}>{workLabelOf(w)}</div>
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
                        {/*
                          身份 + 路径：**id 在前**（这是"哪一项研究"的判据），路径在后（技术细节）。
                          新建的本机研究还没有 id → 这一行只显示路径（名字就是判据）。
                          `detached`（本机没打开，但网络上仍是我的）→ 只说明"为什么不能更新"。
                        */}
                        {w.detached ? (
                          <div style={S.hint}>{t('community.hint.detachedWork')}</div>
                        ) : null}
                        <div
                          style={{
                            ...S.mono,
                            color: 'var(--dsw-alias-label-tertiary)',
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                          title={w.researchRoot}
                        >
                          {w.workId ? <span>{w.workId}</span> : null}
                          {w.path ? <span>{w.path}</span> : null}
                        </div>
                      </div>
                      {/*
                       * **发布动作随角色与发布状态收敛成"一个按钮"**（2026-10 用户拍板）：
                       *
                       * ```text
                       * 研究者（非导师）  → 【寻找指导】
                       * 导师              → 【寻找学生】 ▾（下拉里收着【寻找指导】）
                       * 已发布（任一方向） → 【更新文件】
                       * ```
                       *
                       * 三个理由：
                       *   ① 一个研究工作**只属于一个方向**（要么导师出题，要么学生发布自己的工作），
                       *      发布过一种就不可能再发另一种（宿主侧换方向直接拒绝：`already-published`）；
                       *   ② 研究者本来就不该看到"招学生"（那是导师的动作）；
                       *   ③ 导师的【寻找指导】**极少使用**，留在主线上会让导师每次都要在两行里挑 ——
                       *      收进拆分按钮的下拉，主按钮就是他的主要动作。
                       * 规则本身在 `research/publish-actions.ts`（纯函数，自检直接调用它）。
                       *
                       * 「已在网络中」徽章与按钮**垂直居中**对齐（`alignItems: 'center'`）——
                       * 只有一个按钮了，顶部对齐会显得徽章飘在按钮上方。
                       */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flex: '0 0 auto',
                        }}
                      >
                        {w.published.length > 0 ? (
                          <Badge tone="success">{t('community.badge.inNetwork')}</Badge>
                        ) : null}
                        {w.detached ? null : (() => {
                          const plan = publishActionPlan(
                            canMentor,
                            w.published.map((r) => r.direction),
                          )
                          /** 这个工作正在发布/取计划（只有一个按钮，所以不再按方向分）。 */
                          const busyHere = publishing?.id === w.id || dialogLoading?.id === w.id
                          const busyLabel =
                            publishing?.id === w.id
                              ? /* 无对话框的「更新文件」路径也要看得见进度（附件仍在传） */
                                `${t('community.action.publishing')}${
                                  publishProgress && publishProgress.totalBytes > 0
                                    ? ` ${Math.min(100, Math.round((publishProgress.sentBytes / publishProgress.totalBytes) * 100))}%`
                                    : ''
                                }`
                              : t('community.action.loading')
                          const disabled = !account || publishing !== null || dialogLoading !== null
                          return (
                            <div style={{ opacity: account && !busyHere && disabled ? 0.55 : 1 }}>
                              <PublishButton
                                t={t}
                                item={plan.primary}
                                more={plan.more}
                                busyHere={busyHere}
                                busyLabel={busyLabel}
                                disabled={disabled}
                                onPick={(direction) => void openPublish(w, direction)}
                              />
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : workTab === 'joinable' ? (
            /* ── 可加入：导师发布的选题（`SEEK_STUDENT`）──
             *
             * 与【可指导】**同一个形状**（同一份发现列表、同一套两级披露、同一个
             * WorkRow），差别只有三处：
             *   ① 未登录时给示例数据（原来是【可指导】承担的，v0.6.0 起那个 Tab
             *      对非导师不显示）；
             *   ② 行上的动作是【出价】（学生出价，导师接受）；
             *   ③ 空态/提示文案说"导师发布的选题"。
             */
            !account ? (
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
            ) : joinable === null ? (
              <div style={S.hint}>{joinableLoading ? t('community.hint.loadingWork') : t('community.hint.noData')}</div>
            ) : joinable.length === 0 ? (
              <div style={S.hint}>{t('community.hint.noJoinable')}</div>
            ) : (
              <div style={S.list}>
                {joinable.map((w, i) => {
                  const expanded = open?.projectId === w.projectId
                  const busyKind = detailBusy?.projectId === w.projectId ? detailBusy.kind : null
                  /** 我已经对这项选题出过的价（有 → 按钮禁用 + 显示状态角标）。 */
                  const bidded = myResearcherProposalByProject.get(w.projectId)
                  // 【出价】与【发起指导】同一条规则：**读过详情之后**才出现
                  const canBid = detailRead.has(w.projectId) || briefFree(w)
                  return (
                    <div
                      key={w.projectId}
                      style={i === 0 ? undefined : { borderTop: '1px solid var(--dsw-alias-border-l1)' }}
                    >
                      <WorkRow
                        t={t}
                        title={workLabelOf(w)}
                        author={w.owner?.displayName ?? null}
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
                        /* 第二行：出价 + 出价之后的状态角标 */
                        below={
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {/* 状态角标在前、按钮在后（同【可指导】的排法）。
                                ⚠️ `bidded` 恒为**我出价**的提案（我是学生），
                                接受之后提案状态不再变化，所以不能直接显示提案状态原值。 */}
                            {bidded ? (
                              <Badge tone={proposalTone(bidded.status)}>
                                {translateOr(t, progressLabelKey(bidded, proposalView(bidded, myAccountId)), bidded.status)}
                              </Badge>
                            ) : null}
                            {canBid ? (
                              <button
                                type="button"
                                style={{ ...S.accentBtn, opacity: bidded ? 0.55 : 1 }}
                                disabled={Boolean(bidded) || proposeBusy}
                                title={bidded ? t('community.tip.bidded') : t('community.tip.bid')}
                                onClick={() => void openPropose(w)}
                              >
                                {t('community.action.bid')}
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
            )
          ) : works === null ? (
            /* ── 可指导：学生发布的研究工作（`SEEK_MENTOR`，只对导师显示这个 Tab）── */
            <div style={S.hint}>{worksLoading ? t('community.hint.loadingWork') : t('community.hint.noData')}</div>
          ) : works.length === 0 ? (
            <div style={S.hint}>{t('community.hint.noDiscoverable')}</div>
          ) : (
            <div style={S.list}>
              {works.map((w, i) => {
                const expanded = open?.projectId === w.projectId
                const busyKind = detailBusy?.projectId === w.projectId ? detailBusy.kind : null
                /** 我已经对这项工作发起过的提案（有 → 按钮禁用 + 显示状态角标）。 */
                const proposed = myMentorProposalByProject.get(w.projectId)
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
                      title={workLabelOf(w)}
                      author={w.owner?.displayName ?? null}
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

                            ⚠️ 用 `progressLabelKey(..., view)` 而不是提案状态原值：
                            这里 `proposed` 恒为**我发起**的提案（我是导师），接受之后
                            提案状态不再变化，直接显示会永远停在「已接受」。
                          */}
                          {proposed ? (
                            <Badge tone={proposalTone(proposed.status)}>
                              {translateOr(
                                t,
                                progressLabelKey(proposed, proposalView(proposed, myAccountId)),
                                proposed.status,
                              )}
                            </Badge>
                          ) : null}
                          {canPropose ? (
                            <button
                              type="button"
                              style={{ ...S.accentBtn, opacity: proposed ? 0.55 : 1 }}
                              disabled={Boolean(proposed) || proposeBusy}
                              title={proposed ? t('community.tip.proposed') : t('community.tip.propose')}
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
  onSaveKey,
  onClearKey,
  onNotice,
  t,
}: {
  configured: boolean
  source: 'settings' | 'env' | 'none'
  envVar: string
  tectonic: HostDependency | null
  onRecheck: () => Promise<HostDependency | null>
  /**
   * 保存 / 清除 OpenAlex Key。
   *
   * ⚠️ 这两件事**必须由宿主落盘**（`retrieval/saveKey` / `clearKey`）：
   * 浏览器侧的 `configForm.set()` 在非 loopback 页面上是静默 no-op（见父组件里
   * `writeRetrievalKey` 的说明）。返回 `null` = 成功，否则是**给人看**的失败原因。
   */
  onSaveKey: (key: string) => Promise<string | null>
  onClearKey: () => Promise<string | null>
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
      const failure = await onSaveKey(draft.trim())
      if (failure !== null) {
        // **失败就把内容留在输入框里**：清空等于把用户刚粘的 Key 扔了，还得再找一次
        onNotice({ tone: 'error', text: t('system.retrieval.saveFailed', { detail: failure }) })
        return
      }
      setDraft('') // 成功才清（明文不留在界面状态里）
      onNotice({ tone: 'success', text: t('system.retrieval.saved') })
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      const failure = await onClearKey()
      if (failure !== null) {
        onNotice({ tone: 'error', text: t('system.retrieval.clearFailed', { detail: failure }) })
        return
      }
      setDraft('')
      onNotice({ tone: 'success', text: t('system.retrieval.cleared') })
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
