/**
 * ConvFusion 2.0 — **环境配置**（开发 / 生产的分岔，唯一事实来源）
 *
 * ## 为什么要有这个模块
 *
 * 接入 ConvFusion.com 会引入两类"随环境而变"的值，它们**不能写死在代码里**：
 *
 * ```text
 * 服务器地址    开发 http://localhost:8000      生产 https://convfusion.com
 * 开发机路径    本地服务器仓库在哪、用哪个 python（只有开发机才有意义）
 * ```
 *
 * 写死的后果是**双向的**：开发机上能用、装到别人机器上就指向 `localhost`（明明该连
 * 线上），反过来线上环境又会去连不存在的本机端口。而且这些值一旦散落在源码里
 * （曾出现在验证脚本的 `PYTHON` 常量里），换一台机器就得改代码。所以集中到**配置文件**：
 *
 * ```text
 * convfusion.env.json              ← 本机配置（.gitignore，含机器相关路径）
 * convfusion.env.example.json      ← 提交进仓库的模板（新环境照它建）
 * $DSH_HOME/convfusion/server-env.json ← 安装级配置（部署后没有源码目录时的落点）
 * ```
 *
 * ## 解析顺序（**文件：取第一个存在的**；**值：后者覆盖前者**）
 *
 * ```text
 * 配置文件候选（取第一个存在的）：
 *   ① $CONVFUSION_ENV_FILE                  显式指定（脚本 / CI / 部署用；`-` = 完全不读文件）
 *   ② <包根>/convfusion.env.json             本机开发配置
 *   ③ $DSH_HOME/convfusion/server-env.json   安装级配置（部署场景）
 *   ④ <包根>/convfusion.env.example.json     模板兜底
 *
 * 生效的服务器地址：
 *   DSH 设置文档 convfusion.serverUrl  >  $CONVFUSION_SERVER_URL
 *     >  配置文件 environments[当前环境].serverUrl  >  内置默认（按环境）
 * ```
 *
 * ⚠️ **环境名本身**由 `$CONVFUSION_ENV` > `NODE_ENV`/`APP_ENV` > 配置文件 `environment`
 * > `development` 决定（**进程环境变量优先于文件**，理由见 {@link resolveEnvironmentName}）。
 * 判断顺序不是"猜地址"，而是"先知道我在哪个环境，再取那个环境的地址"。
 *
 * ## 读盘时机
 *
 * 进程内**缓存**（按候选路径做键）：这是启动级配置，同 DSH 宿主代码一样，
 * **改完要重启 DSH**。不要在每次请求里重新读盘。
 */
/** 支持的环境。新增环境要同时在内置默认表里给一个地址。 */
export type ConvFusionEnvironment = 'development' | 'production';
/** 本机开发配置（不提交，含机器相关路径）。 */
export declare const SERVER_ENV_FILE_NAME = "convfusion.env.json";
/** 提交进仓库的模板。 */
export declare const SERVER_ENV_FILE_EXAMPLE = "convfusion.env.example.json";
/** 显式指定配置文件路径的环境变量。 */
export declare const SERVER_ENV_FILE_ENV = "CONVFUSION_ENV_FILE";
/** 指定当前环境（`development` / `production`）的环境变量。 */
export declare const SERVER_ENV_ENV = "CONVFUSION_ENV";
/**
 * **内置兜底地址**（最后手段，正常应来自配置文件）。
 *
 * 这里保留"产品自己的地址"是合理的常量（它不是机器相关的）；但它是**兜底**，
 * 不是唯一来源 —— 开发机应当通过配置文件显式指向本地服务器。
 */
export declare const BUILTIN_SERVER_URL: Record<ConvFusionEnvironment, string>;
/** 配置文件里与**开发流程**有关的值（验证脚本 / 本地工具用；不影响运行时行为）。 */
export interface ServerEnvDev {
    /** 本地服务器仓库路径（相对配置文件所在目录，或绝对路径）。 */
    serverDir?: string;
    /** 跑服务器与本仓库 Python 工具的解释器（命令名或绝对路径）。 */
    python?: string;
    /** 隔离验证实例绑定的地址与端口。 */
    host?: string;
    port?: number;
}
/** 一个环境下的一条配置。 */
export interface ServerEnvEntry {
    serverUrl?: string;
}
/** 解析后的环境配置。 */
export interface ServerEnvConfig {
    /** 生效的环境名。 */
    environment: ConvFusionEnvironment;
    /** 各环境的地址表（文件里的原样）。 */
    environments: Partial<Record<ConvFusionEnvironment, ServerEnvEntry>>;
    /** 开发流程用值（已把 `serverDir` 解析成绝对路径）。 */
    dev: ServerEnvDev;
    /** 实际读到的配置文件路径（没有任何文件时为 undefined）。 */
    path?: string;
}
/** 插件包根目录（`lib/server-env.js` 的上一级）。 */
export declare function packageRoot(): string;
/**
 * 配置文件候选列表（**按优先级**；取第一个存在的）。
 *
 * 导出它是为了可验证：脚本与测试都要能断言"我到底读的是哪个文件"。
 *
 * ⚠️ `CONVFUSION_ENV_FILE=-`（或 `none`）表示**不读任何文件**，只用环境变量与内置兜底。
 * 部署环境（容器 / systemd）常常希望配置**只**来自环境变量，这一条让那成为可能，
 * 也让"没有任何配置文件时是什么行为"可以被测试固定下来。
 */
export declare function serverEnvFileCandidates(env?: NodeJS.ProcessEnv): string[];
/**
 * 环境名解析：`CONVFUSION_ENV` > `NODE_ENV`/`APP_ENV` > 文件 `environment` > development。
 *
 * ⚠️ **进程环境变量必须排在文件之前**。文件里有两条容易踩的路径：本机配置与
 * **随包发布的模板**（`convfusion.env.example.json` 里写的是 `development`）。
 * 若让文件优先，一个部署环境（`NODE_ENV=production`）会因为读到模板而把自己当成开发环境，
 * 于是去连 `localhost:8000` —— 部署最常见、也最难查的错就来自这种"配置赢过了运行时"。
 */
export declare function resolveEnvironmentName(env?: NodeJS.ProcessEnv, fileEnvironment?: string): ConvFusionEnvironment;
/**
 * 读出当前环境配置。
 *
 * @param options.fresh 忽略进程内缓存重新读盘（测试与"重新检查"用）
 */
export declare function loadServerEnv(env?: NodeJS.ProcessEnv, options?: {
    fresh?: boolean;
}): ServerEnvConfig;
/** 测试与"重新检查"用：丢掉缓存。 */
export declare function resetServerEnvCache(): void;
/** 环境对应的服务器地址（配置文件 > 内置兜底）。`source` 让界面能说清"这个地址哪来的"。 */
export declare function environmentServerUrl(env?: NodeJS.ProcessEnv, options?: {
    fresh?: boolean;
}): {
    url: string;
    source: 'config' | 'builtin';
    environment: ConvFusionEnvironment;
    path?: string;
};
/** 开发流程用值的读取（脚本用；`env` 覆盖文件）。 */
export declare function resolveDevTooling(env?: NodeJS.ProcessEnv): {
    serverDir?: string;
    python: string;
    host: string;
    port: number;
};
/** 地址是不是"本机"（用来发现"生产环境却指向 localhost"这类配置错）。 */
export declare function isLocalServerUrl(url: string): boolean;
/**
 * 地址与环境是否**互相矛盾**。
 *
 * 只判两种最明确、也最容易真实发生的错配（不猜中间态）：
 *
 * ```text
 * 生产环境 + 本机地址        → 多半连的是自己电脑上的开发服务器
 * 开发环境 + 线上地址        → 多半在开发机上误连生产（危险方向：会写线上数据）
 * ```
 */
export declare function serverUrlMismatch(environment: ConvFusionEnvironment, url: string, env?: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=server-env.d.ts.map