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
import Schema from '@deepseek-ai/schemastery';
import { type ConvFusionEnvironment } from './server-env.js';
/** 设置里没配 OpenAlex Key 时回退的环境变量名。 */
export declare const OPENALEX_API_KEY_ENV = "OPENALEX_API_KEY";
/** 设置里没配 ConvFusion.com API Key 时回退的环境变量名。 */
export declare const CONVFUSION_API_KEY_ENV = "CONVFUSION_API_KEY";
/** 设置里没配服务器地址时回退的环境变量名。 */
export declare const CONVFUSION_SERVER_URL_ENV = "CONVFUSION_SERVER_URL";
/**
 * 服务器地址的**内置兜底**（开发环境）。
 *
 * ⚠️ 真正的地址来自环境配置文件（`src/server-env.ts`）；这个常量只是"连配置文件都没有"
 * 时的最后手段。要"当前环境的默认地址"请调 {@link environmentServerUrl}。
 */
export declare const DEFAULT_SERVER_URL: string;
/** DSH 主目录（可用环境变量覆盖，便于测试与多 profile）。 */
export declare function dshHome(): string;
export interface Config {
    /**
     * 用户定制 Skill 的**文件名**（不含目录）。
     *
     * 默认 `skill-customizations.json`。设置面板"本地研究方法"展示它，
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
     * ConvFusion.com 服务器地址（不含 `/api/v1`）。
     *
     * ⚠️ **默认是空串 = "跟随环境配置"**，不是某个写死的地址：开发环境由
     * `convfusion.env.json` 指向 `http://localhost:8000`、生产指向
     * `https://convfusion.com`。schema 默认值不填地址是**故意的** ——
     * 一旦这里给了非空默认值，"设置文档"这一层就会永远盖住环境配置文件，
     * 配置文件里的生产地址就再也生效不了。
     *
     * 解析顺序见 {@link resolveServerUrl}。
     */
    serverUrl: string;
    /**
     * ConvFusion.com API Key（**secret**，`cf_live_…`）。
     *
     * ⚠️ 由宿主独占使用：浏览器只见"是否已登录 + 账号信息"（见 `server-client.ts`）。
     * 服务器没有口令登录，这份 Key 就是全部凭据。
     */
    convfusionApiKey: string;
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
 *
 * 现在是**两个** secret：OpenAlex Key 与 ConvFusion.com API Key。
 */
export declare function redactConfig(config: Config): Omit<Config, SecretField>;
/** 需要脱敏的字段名（集中一处，新增 secret 只需改这里）。 */
export type SecretField = 'openalexApiKey' | 'convfusionApiKey';
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
export declare function resolveServerUrl(config: Partial<Config>, env?: NodeJS.ProcessEnv, options?: {
    fresh?: boolean;
}): {
    url: string;
    source: 'settings' | 'env' | 'config' | 'default';
    environment: ConvFusionEnvironment;
    /** 地址与当前环境是否矛盾（生产却指向本机 / 开发却指向线上）。 */
    mismatched: boolean;
    /** 读到环境配置文件时给出它的路径（诊断用）。 */
    envFile?: string;
};
/** 当前环境的**默认**地址（界面"恢复默认"、占位符用）。 */
export declare function defaultServerUrl(env?: NodeJS.ProcessEnv): string;
/**
 * ConvFusion.com 凭据的**可用性**（只有布尔与来源，**没有密钥**）。
 *
 * 与 {@link describeOpenAlexKey} 同款：这个结果可以直接回给浏览器。
 */
export declare function describeConvFusionKey(config: Partial<Config>, env?: NodeJS.ProcessEnv): {
    configured: boolean;
    source: 'settings' | 'env' | 'none';
};
/**
 * 取出生效的 ConvFusion.com API Key（**明文**）。
 *
 * ⚠️ **只允许宿主调用**：返回值不得进入 `SettingsState`、日志、错误信息。
 * 设置文档优先，其次环境变量。
 */
export declare function resolveConvFusionApiKey(config: Partial<Config>, env?: NodeJS.ProcessEnv): string;
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