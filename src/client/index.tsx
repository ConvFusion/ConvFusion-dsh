/**
 * ConvFusion 2.0 — browser half（设置页 + 会话头部的研究进展按钮）
 *
 * 这个文件只做装配：
 *
 * ```text
 * settings.section                       ← 【设置】-【ConvFusion】（本体在 ./settings.js）
 * conversation.session.header.utilities  ← 顶部「研究进展」按钮（本体在 ./progress-panel.js）
 *                                        ← 顶部「ConvFusion.com」按钮（本体在 ./community-panel.js）
 * ```
 *
 * ## 两个容易踩的坑（重建时必看，来自 v0.1.5 的实测记录）
 *
 * 1. `inject` 里的**每一个**服务都必须真实存在。任一缺失，整个客户端条目会停在
 *    `pending (waiting for service: X)` —— 界面不出现，且不会被当成错误报出来。
 *    数据面走同源 `fetch`，因此这里只需要渲染用的两个服务。
 * 2. `slots` / `configForms` 由 DSH 的客户端包提供，不 value-import 它们 ——
 *    它们本来就是 bundle 的 external，import 值只会在运行期炸。
 */

import type React from 'react'
import logoUrl from '../../assets/favicon.svg'
import { CONVFUSION_LOCALE_NS, dictionaries, type Translate } from './i18n/index.js'
import { ConvFusionProjectSettings, loadSettingsState } from './settings.js'
import { applyNavIcon, installNavIcon } from './nav-icon.js'
import { ConvFusionComButton } from './community-panel.js'
import {
  ResearchProgressButton,
  readProgressValue,
  shortenPath,
} from './progress-panel.js'

/** 供离线测试直接调用（bundle 的 `apply`/`inject` 之外再导出这些）。 */
export { loadSettingsState, applyNavIcon, installNavIcon, logoUrl }
export { preferredCategory, preferredSection, preferredSkill } from './settings.js'
/** 【ConvFusion.com】这一页的正文：设置页与顶部浮层共用同一份（离线验证也要能拿到）。 */
export { CommunityTab } from './settings.js'
export { ResearchProgressButton, readProgressValue, shortenPath }
export { ConvFusionComButton }

/* ════════════════════════════════════════════════════════════════════════
 * 服务的结构化契约（镜像，不 import：见文件头第 2 条）
 * ════════════════════════════════════════════════════════════════════════ */

interface ScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: { customizationFile?: string; customizationDir?: string } | undefined
  writable: boolean
}

interface SettingsScopeLike {
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  /** 0.2.0 起写操作返回"宿主是否接受"，不再是无返回值的 `void`。 */
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
}

interface SlotRegisterOptions {
  name: string
  id?: string
  order?: number
  label?: () => string
  locale?: string
  inject?: () => Record<string, unknown>
  priority?: number
  /**
   * chain 型槽位（如 `conversation.chat.turnTail`）的选择器：
   * 按升序尝试，**首个返回非 null** 的条目渲染，全为 null 则回落到拥有者的默认。
   *
   * ⚠️ **不要用它做"按会话判定"**：selector 只拿得到 owner props（例如 turnTail 的
   * `{turn, seq, openFile}`），**不含会话身份**；用它路由就得引入进程级全局变量，
   * 结果会命中所有会话（2026-09 实测故障，见 `progress-panel.tsx` 文件头）。
   * 按会话的显隐请用 **session 作用域的 list 槽位**（组件能拿到 `sessionId`）。
   */
  select?: (owner: unknown) => unknown | null
}

interface SlotsService {
  inject(key: string, fn: () => unknown): unknown
  register(options: SlotRegisterOptions, component: unknown): () => void
}

interface ClientContext {
  slots: SlotsService
  /**
   * DSH 0.2.0 的设置服务。
   *
   * ⚠️ **旧 `settingsScope.bind({ namespace })` 已被整体删除**：0.2.0 里客户端
   * 服务名与形状都变了，换成 `configForms.get(entryId)`（`entryId` = **profile 条目
   * id**，与宿主 `SettingsForms.update` 的 `ns` 是同一个值）。
   *
   * ⚠️ 服务名写错的后果**不是报错**：cordis 的 fiber 会因为 inject 的服务缺失而
   * 永久停在 `INACTIVE`，`apply` 从不执行 —— 整页（设置页 + 进展面板）静默消失。
   * 所以这里的名字必须与新宿主一致。
   */
  configForms: {
    get(entryId: string): SettingsScopeLike
  }
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): Translate
  }
  effect(callback: () => void | (() => void), label?: string): void
  /**
   * 读一个服务**不触发 inject 检查**（本插件目前不用可选服务，保留以便将来扩展）。
   *
   * ⚠️ 若要用可选服务，必须写成 `ctx.get('X')` 而**不是** `ctx.X`：
   * Cordis 的 get 代理会把「未 inject 的属性访问」直接抛成
   * `cannot get property "X" without inject`，而客户端条目 apply 抛错 = 整页加载失败
   * （2026-09-12 实际发生：DSH 里报 `Failed to load plugins / dsh-convfusion`）。
   */
  get(name: string): unknown
}

/** 只有这些服务是硬依赖（缺一个，这一页就无从渲染）。 */
export const inject = ['slots', 'configForms', 'locale']

/**
 * 【设置】导航里的位置。
 *
 * 官方：General `0` / Models `10` / Plugins `15`；同目录的 Additive 用 `50`。
 * ConvFusion 取 `60` —— **排在 Additive 之后**，且不与任何现有条目抢位置。
 */
const SECTION_ORDER = 60

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(CONVFUSION_LOCALE_NS, dictionaries),
    'convfusion: browser dictionaries',
  )
  const t = ctx.locale.bind(CONVFUSION_LOCALE_NS)
  // 设置命名空间 = **profile 条目 id**（`cordis.patch.yml` 的 `id: convfusion`）。
  const scope = ctx.configForms.get('convfusion')

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'convfusion',
        order: SECTION_ORDER,
        label: () => t('settings.nav'),
        locale: CONVFUSION_LOCALE_NS,
        inject: () => ({ scope }),
      },
      ConvFusionProjectSettings as unknown as React.ComponentType<unknown>,
    ),
  )

  // ── 研究进展（`v2-Progress.md`：顶部按钮 → 展开面板）──────────────────
  // 为什么不再注入对话流：回合尾部的 `conversation.chat.turnTail` 是**链式**槽位，
  // 它的 selector 只拿得到 `{turn, seq, openFile}` —— **没有会话身份**，于是"这个会话
  // 是不是研究项目"只能靠进程级全局变量猜，结果会命中所有会话（旧实现的实际故障）。
  // `conversation.session.header.utilities` 是 **session 作用域的 list 槽位**：
  // 追加式（不动官方条目），组件拿得到自己会话的 `sessionId`，判定天然按会话正确。
  // 非研究工作区连按钮都不渲染；点击后才由宿主（`/dsh-convfusion/progress/workspace`）
  // 按磁盘真实资产算一份当前进展。
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'convfusion-progress',
        order: 20,
        locale: CONVFUSION_LOCALE_NS,
      },
      ResearchProgressButton as unknown as React.ComponentType<unknown>,
    ),
  )

  // ── ConvFusion.com（顶部按钮 → 展开【设置】-【ConvFusion】-【ConvFusion.com】）──
  // 与进展按钮同一个槽位、紧挨其后（order 21）。区别只有一条：**不按工作区判定** ——
  // 账号、Token、研究工作/指导关系在任何会话里都可能要用到。
  // 内容直接复用设置页那一个 `CommunityTab`（见 ./community-panel.js 的文件头）。
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'convfusion-community',
        order: 21,
        locale: CONVFUSION_LOCALE_NS,
      },
      ConvFusionComButton as unknown as React.ComponentType<unknown>,
    ),
  )

  // ── 导航图标 ────────────────────────────────────────────────────────
  // 壳层的导航图标是硬编码的（只有 models / agent-presets / plugins 有专属图标），
  // 外部插件无法通过 slot 契约提供 —— 详见 `./nav-icon.js` 的说明。
  // 这是一个**纯装饰性**补丁：失效即静默，可随壳层改版随时删除。
  try {
    installNavIcon(logoUrl)
  } catch {
    /* 装饰失败绝不影响设置页功能 */
  }
}
