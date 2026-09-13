/**
 * ConvFusion 2.0 — 插件配置（Stage 1–4 收敛）
 *
 * ## 只有一个配置项：用户定制的**文件名**
 *
 * 用户拍板：**用户定制保存为文件，设置里配置的是文件名称** ——
 * 这样设置文件绝不会因为定制内容增多而过大。
 *
 * ```text
 * ~/.dsh/settings.yaml
 *   convfusion:
 *     customizationFile: skill-customizations.json   ← 只有文件名
 *
 * ~/.dsh/convfusion/skill-customizations.json      ← 定制内容在这里
 * ```
 *
 * 除文件名外只有 `customizationDir`（默认 `$DSH_HOME/convfusion`），
 * 设置面板的"本地研究方法"用它与 {@link resolveCustomizationPath} 展示真实落盘位置。
 *
 * ## 文献检索凭据（`openalexApiKey`）
 *
 * 设置里还有一项 **OpenAlex API Key**（免费申请）。它按 DSH 的惯例声明为
 * `role('secret')`：
 *
 *   - 远端读取会被 `redactSecrets` 摘掉，**密钥不会回传浏览器**；
 *   - 设置页只从宿主拿到 `configured: true/false`，自己从不持有明文；
 *   - 未在设置里配置时回退到环境变量 `OPENALEX_API_KEY`
 *     （与 `dsh-web-search-deepseek` 的 `apiKey` + `apiKeyEnv` 同款）。
 *
 * ⚠️ 它目前**只做存储与可用性提示**：v2 的文献检索由 Harness 原生 web 工具完成，
 * 插件自身不发网络请求。把密钥注入对话是另一个决定（等于发给模型提供方），
 * 需要单独确认，不在本轮范围内。
 *
 * ⚠️ 刻意**没有**"默认 Skill 目录"之类的配置：系统 Skill Library 是包内资产，
 * 由我们维护；把它做成可配置项会诱导用户去改库，与架构冲突。
 */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import Schema from '@deepseek-ai/schemastery'

/** 设置里没配 OpenAlex Key 时回退的环境变量名。 */
export const OPENALEX_API_KEY_ENV = 'OPENALEX_API_KEY'

/** DSH 主目录（可用环境变量覆盖，便于测试与多 profile）。 */
export function dshHome(): string {
  const env = process.env.DSH_HOME?.trim()
  return env ? env : join(homedir(), '.dsh')
}

export interface Config {
  /**
   * 用户定制 Skill 的**文件名**（不含目录）。
   *
   * 默认 `skill-customizations.json`。设置面板"本地研究方法"展示它，
   * 用户可改名（例如按研究领域分文件）。
   */
  customizationFile: string
  /** 定制文件所在目录（绝对路径；默认 `$DSH_HOME/convfusion`）。 */
  customizationDir: string
  /**
   * OpenAlex API Key（**secret**，免费申请）。
   *
   * 设置页只显示"已配置/未配置"，明文从不回传浏览器。
   */
  openalexApiKey: string
  /**
   * 方向明确时是否允许**自动继续推进**（用户要求）。
   *
   * 判定见 `advance.ts`：只有"下一步确实清楚、没有阻塞项、没有歧义、没有连续停滞"
   * 才会自动继续；否则停下等用户拍板。
   */
  autoContinue: boolean
  /** 连续自动推进的轮数上限（防止无人值守跑飞）。 */
  autoContinueMaxRounds: number
}

export const Config: Schema<Config> = Schema.object({
  customizationFile: Schema.string()
    .default('skill-customizations.json')
    .description('用户定制 Skill 的文件名（内容存该文件，设置文件不会因此变大）。'),
  customizationDir: Schema.string()
    .default('')
    .description('定制文件所在目录；留空 = $DSH_HOME/convfusion。'),
  openalexApiKey: Schema.string()
    .role('secret')
    .default('')
    .description('OpenAlex API Key（免费申请：https://openalex.org/）。用于文献检索。'),
  autoContinue: Schema.boolean()
    .default(true)
    .description('方向明确时自动继续推进；遇到需要取舍的抉择会停下来问你。'),
  autoContinueMaxRounds: Schema.number()
    .default(3)
    .description('单次会话内最多连续自动推进多少轮。'),
})

/**
 * 解析定制文件的绝对路径。
 *
 * - `customizationFile` 是绝对路径 → 直接用它（允许用户放到任何位置）；
 * - 否则相对 `customizationDir`（默认 `$DSH_HOME/convfusion`）。
 */
export function resolveCustomizationPath(config: Partial<Config>): string {
  const file = (config.customizationFile ?? '').trim() || 'skill-customizations.json'
  if (isAbsolute(file)) return file
  const dir = (config.customizationDir ?? '').trim() || join(dshHome(), 'convfusion')
  return join(dir, file)
}

/** 归一配置（补默认值；`apply` 可能收到未校验的 `{}`）。 */
export function resolveConfig(input: Partial<Config> | undefined): Config {
  const c = input ?? {}
  return {
    customizationFile: (c.customizationFile ?? '').trim() || 'skill-customizations.json',
    customizationDir: (c.customizationDir ?? '').trim(),
    openalexApiKey: (c.openalexApiKey ?? '').trim(),
    autoContinue: c.autoContinue !== false,
    autoContinueMaxRounds:
      typeof c.autoContinueMaxRounds === 'number' && c.autoContinueMaxRounds >= 0
        ? Math.floor(c.autoContinueMaxRounds)
        : 3,
  }
}

/**
 * **给浏览器看的那一份配置**：剔除全部 secret 字段。
 *
 * ⚠️ 必须显式做这件事。`role('secret')` 的自动脱敏发生在 DSH 的**远端设置读取**路径上
 * （`redactSecrets: true`），而设置页走的是我们自己的 `/dsh-convfusion/state` 路由 ——
 * 那条路不经过 DSH 的脱敏，原样返回 `config` 就等于把密钥送进浏览器。
 * `verify-settings-page.mjs` 有一条断言专门守这个泄漏（曾经真的漏了）。
 */
export function redactConfig(config: Config): Omit<Config, 'openalexApiKey'> {
  const { openalexApiKey: _omit, ...rest } = config
  void _omit
  return rest
}

/**
 * OpenAlex Key 的有效来源。
 *
 * 设置文档优先；没配时看环境变量。**返回值只用于判断"能不能用"，不用于展示。**
 *
 * @returns 来源与是否可用（**绝不返回密钥本身**）
 */
export function describeOpenAlexKey(
  config: Partial<Config>,
  env: NodeJS.ProcessEnv = process.env,
): { configured: boolean; source: 'settings' | 'env' | 'none' } {
  if ((config.openalexApiKey ?? '').trim()) return { configured: true, source: 'settings' }
  if ((env[OPENALEX_API_KEY_ENV] ?? '').trim()) return { configured: true, source: 'env' }
  return { configured: false, source: 'none' }
}
