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
 *
 * ## ConvFusion.com 凭据（`serverUrl` + `convfusionApiKey`）
 *
 * 【设置】-【ConvFusion】-【ConvFusion.com】的「登录」把两样东西落在这里：
 *
 * ```text
 * serverUrl         服务器地址（**留空 = 跟随环境配置**，见 src/server-env.ts）
 * convfusionApiKey  cf_live_…   ← role('secret')，只被宿主使用
 * ```
 *
 * 服务器**没有口令登录**：账号是邀请制，鉴权只有 `Authorization: Bearer cf_live_…`
 * 一条通道（见 `ConvFusion-server/docs/API.md` §2）。所以"登录"= 把一份有效凭据
 * 交给宿主、由宿主调 `GET /api/v1/auth/me` 验证身份 —— 浏览器从头到尾拿不到明文。
 *
 * ⚠️ **地址不写死在这个文件里**。开发（`http://localhost:8000`）与生产
 * （`https://convfusion.com`）是两套环境，地址由 `convfusion.env.json` 按环境给出，
 * 解析顺序见 {@link resolveServerUrl}。
 */
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import Schema from '@deepseek-ai/schemastery';
import { BUILTIN_SERVER_URL, environmentServerUrl, serverUrlMismatch, } from './server-env.js';
export { serverUrlPresets } from './server-env.js';
/** 设置里没配 OpenAlex Key 时回退的环境变量名。 */
export const OPENALEX_API_KEY_ENV = 'OPENALEX_API_KEY';
/** 设置里没配 ConvFusion.com API Key 时回退的环境变量名。 */
export const CONVFUSION_API_KEY_ENV = 'CONVFUSION_API_KEY';
/** 设置里没配服务器地址时回退的环境变量名。 */
export const CONVFUSION_SERVER_URL_ENV = 'CONVFUSION_SERVER_URL';
/**
 * 服务器地址的**内置兜底**（开发环境）。
 *
 * ⚠️ 真正的地址来自环境配置文件（`src/server-env.ts`）；这个常量只是"连配置文件都没有"
 * 时的最后手段。要"当前环境的默认地址"请调 {@link environmentServerUrl}。
 */
export const DEFAULT_SERVER_URL = BUILTIN_SERVER_URL.development;
/** DSH 主目录（可用环境变量覆盖，便于测试与多 profile）。 */
export function dshHome() {
    const env = process.env.DSH_HOME?.trim();
    return env ? env : join(homedir(), '.dsh');
}
export const Config = Schema.object({
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
    serverUrl: Schema.string()
        .default('')
        .description('ConvFusion.com 服务器地址；留空 = 跟随环境配置（开发 localhost:8000 / 生产 convfusion.com）。'),
    convfusionApiKey: Schema.string()
        .role('secret')
        .default('')
        .description('ConvFusion.com API Key（cf_live_…）。由【ConvFusion.com】页的登录流程写入。'),
    autoContinue: Schema.boolean()
        .default(true)
        .description('方向明确时自动继续推进；遇到需要取舍的抉择会停下来问你。'),
    autoContinueMaxRounds: Schema.number()
        .default(3)
        .description('单次会话内最多连续自动推进多少轮。'),
});
/**
 * 解析定制文件的绝对路径。
 *
 * - `customizationFile` 是绝对路径 → 直接用它（允许用户放到任何位置）；
 * - 否则相对 `customizationDir`（默认 `$DSH_HOME/convfusion`）。
 */
export function resolveCustomizationPath(config) {
    const file = (config.customizationFile ?? '').trim() || 'skill-customizations.json';
    if (isAbsolute(file))
        return file;
    const dir = (config.customizationDir ?? '').trim() || join(dshHome(), 'convfusion');
    return join(dir, file);
}
/** 归一配置（补默认值；`apply` 可能收到未校验的 `{}`）。 */
export function resolveConfig(input) {
    const c = input ?? {};
    return {
        customizationFile: (c.customizationFile ?? '').trim() || 'skill-customizations.json',
        customizationDir: (c.customizationDir ?? '').trim(),
        openalexApiKey: (c.openalexApiKey ?? '').trim(),
        // ⚠️ 空串**保持空串**：它表示"跟随环境配置"。这里若补成某个地址，
        // 就会永久压住 `convfusion.env.json` 里的生产地址（见 Config.serverUrl 注释）。
        serverUrl: (c.serverUrl ?? '').trim(),
        convfusionApiKey: (c.convfusionApiKey ?? '').trim(),
        autoContinue: c.autoContinue !== false,
        autoContinueMaxRounds: typeof c.autoContinueMaxRounds === 'number' && c.autoContinueMaxRounds >= 0
            ? Math.floor(c.autoContinueMaxRounds)
            : 3,
    };
}
/**
 * **给浏览器看的那一份配置**：剔除全部 secret 字段。
 *
 * ⚠️ 必须显式做这件事。`role('secret')` 的自动脱敏发生在 DSH 的**远端设置读取**路径上
 * （`redactSecrets: true`），而设置页走的是我们自己的 `/dsh-convfusion/state` 路由 ——
 * 那条路不经过 DSH 的脱敏，原样返回 `config` 就等于把密钥送进浏览器。
 * `verify-settings-page.mjs` 有一条断言专门守这个泄漏（曾经真的漏了）。
 *
 * 现在是**两个** secret：OpenAlex Key 与 ConvFusion.com API Key。
 */
export function redactConfig(config) {
    const { openalexApiKey: _a, convfusionApiKey: _b, ...rest } = config;
    void _a;
    void _b;
    return rest;
}
/**
 * ConvFusion.com 服务器地址的**有效值**与来源。
 *
 * ```text
 * ① 设置文档 convfusion.serverUrl        用户显式指定过（设置页登录时会写入）
 * ② $CONVFUSION_SERVER_URL               部署 / CI 覆盖
 * ③ 环境配置文件 environments[环境]      开发 → localhost:8000；生产 → convfusion.com
 * ④ 内置兜底（按环境）                   连配置文件都没有时的最后手段
 * ```
 *
 * ⚠️ 顺序**不能颠倒**：配置文件是"每个环境应连哪里"，用户设置是"这台机器实际连哪里"。
 * 也正因为如此，`Config.serverUrl` 的默认值必须是空串（见其注释）。
 *
 * `source` 与 `environment` 只用于界面提示，不参与任何鉴权判断。
 */
export function resolveServerUrl(config, env = process.env, options = {}) {
    const fallback = environmentServerUrl(env, options);
    const fromSettings = (config.serverUrl ?? '').trim();
    const fromEnv = (env[CONVFUSION_SERVER_URL_ENV] ?? '').trim();
    const url = fromSettings || fromEnv || fallback.url;
    const source = fromSettings
        ? 'settings'
        : fromEnv
            ? 'env'
            : fallback.source === 'config'
                ? 'config'
                : 'default';
    return {
        url,
        source,
        environment: fallback.environment,
        mismatched: serverUrlMismatch(fallback.environment, url, env),
        ...(fallback.path ? { envFile: fallback.path } : {}),
    };
}
/** 当前环境的**默认**地址（界面"恢复默认"、占位符用）。 */
export function defaultServerUrl(env = process.env) {
    return environmentServerUrl(env).url;
}
/**
 * ConvFusion.com 凭据的**可用性**（只有布尔与来源，**没有密钥**）。
 *
 * 与 {@link describeOpenAlexKey} 同款：这个结果可以直接回给浏览器。
 */
export function describeConvFusionKey(config, env = process.env) {
    if ((config.convfusionApiKey ?? '').trim())
        return { configured: true, source: 'settings' };
    if ((env[CONVFUSION_API_KEY_ENV] ?? '').trim())
        return { configured: true, source: 'env' };
    return { configured: false, source: 'none' };
}
/**
 * 取出生效的 ConvFusion.com API Key（**明文**）。
 *
 * ⚠️ **只允许宿主调用**：返回值不得进入 `SettingsState`、日志、错误信息。
 * 设置文档优先，其次环境变量。
 */
export function resolveConvFusionApiKey(config, env = process.env) {
    const fromSettings = (config.convfusionApiKey ?? '').trim();
    if (fromSettings)
        return fromSettings;
    return (env[CONVFUSION_API_KEY_ENV] ?? '').trim();
}
/**
 * OpenAlex Key 的有效来源。
 *
 * 设置文档优先；没配时看环境变量。**返回值只用于判断"能不能用"，不用于展示。**
 *
 * @returns 来源与是否可用（**绝不返回密钥本身**）
 */
export function describeOpenAlexKey(config, env = process.env) {
    if ((config.openalexApiKey ?? '').trim())
        return { configured: true, source: 'settings' };
    if ((env[OPENALEX_API_KEY_ENV] ?? '').trim())
        return { configured: true, source: 'env' };
    return { configured: false, source: 'none' };
}
//# sourceMappingURL=config.js.map