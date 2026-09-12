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
 * 设置面板的"本地设置"用它与 {@link resolveCustomizationPath} 展示真实落盘位置。
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
import Schema from '@deepseek-ai/schemastery';
/** 设置里没配 OpenAlex Key 时回退的环境变量名。 */
export declare const OPENALEX_API_KEY_ENV = "OPENALEX_API_KEY";
/** DSH 主目录（可用环境变量覆盖，便于测试与多 profile）。 */
export declare function dshHome(): string;
export interface Config {
    /**
     * 用户定制 Skill 的**文件名**（不含目录）。
     *
     * 默认 `skill-customizations.json`。设置面板"本地设置"展示它，
     * 用户可改名（例如按研究领域分文件）。
     */
    customizationFile: string;
    /** 定制文件所在目录（绝对路径；默认 `$DSH_HOME/convfusion`）。 */
    customizationDir: string;
    /**
     * OpenAlex API Key（**secret**，免费申请）。
     *
     * 设置页只显示"已配置/未配置"，明文从不回传浏览器。
     */
    openalexApiKey: string;
    /**
     * 方向明确时是否允许**自动继续推进**（用户要求）。
     *
     * 判定见 `advance.ts`：只有"下一步确实清楚、没有阻塞项、没有歧义、没有连续停滞"
     * 才会自动继续；否则停下等用户拍板。
     */
    autoContinue: boolean;
    /** 连续自动推进的轮数上限（防止无人值守跑飞）。 */
    autoContinueMaxRounds: number;
}
export declare const Config: Schema<Config>;
/**
 * 解析定制文件的绝对路径。
 *
 * - `customizationFile` 是绝对路径 → 直接用它（允许用户放到任何位置）；
 * - 否则相对 `customizationDir`（默认 `$DSH_HOME/convfusion`）。
 */
export declare function resolveCustomizationPath(config: Partial<Config>): string;
/** 归一配置（补默认值；`apply` 可能收到未校验的 `{}`）。 */
export declare function resolveConfig(input: Partial<Config> | undefined): Config;
/**
 * **给浏览器看的那一份配置**：剔除全部 secret 字段。
 *
 * ⚠️ 必须显式做这件事。`role('secret')` 的自动脱敏发生在 DSH 的**远端设置读取**路径上
 * （`redactSecrets: true`），而设置页走的是我们自己的 `/dsh-convfusion/state` 路由 ——
 * 那条路不经过 DSH 的脱敏，原样返回 `config` 就等于把密钥送进浏览器。
 * `verify-settings-page.mjs` 有一条断言专门守这个泄漏（曾经真的漏了）。
 */
export declare function redactConfig(config: Config): Omit<Config, 'openalexApiKey'>;
/**
 * OpenAlex Key 的有效来源。
 *
 * 设置文档优先；没配时看环境变量。**返回值只用于判断"能不能用"，不用于展示。**
 *
 * @returns 来源与是否可用（**绝不返回密钥本身**）
 */
export declare function describeOpenAlexKey(config: Partial<Config>, env?: NodeJS.ProcessEnv): {
    configured: boolean;
    source: 'settings' | 'env' | 'none';
};
//# sourceMappingURL=config.d.ts.map