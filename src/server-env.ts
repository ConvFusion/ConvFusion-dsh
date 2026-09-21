/**
 * ConvFusion 2.0 — **环境配置**（开发 / 生产的分岔，唯一事实来源）
 *
 * ## 为什么要有这个模块
 *
 * 接入 ConvFusion.com 会引入两类"随环境而变"的值，它们**不能写死在代码里**：
 *
 * ```text
 * 服务器地址    开发 http://localhost:8000      生产 https://convfusion.apibrowser.com:4747
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

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 支持的环境。新增环境要同时在内置默认表里给一个地址。 */
export type ConvFusionEnvironment = 'development' | 'production'

/** 本机开发配置（不提交，含机器相关路径）。 */
export const SERVER_ENV_FILE_NAME = 'convfusion.env.json'

/** 提交进仓库的模板。 */
export const SERVER_ENV_FILE_EXAMPLE = 'convfusion.env.example.json'

/** 显式指定配置文件路径的环境变量。 */
export const SERVER_ENV_FILE_ENV = 'CONVFUSION_ENV_FILE'

/** 指定当前环境（`development` / `production`）的环境变量。 */
export const SERVER_ENV_ENV = 'CONVFUSION_ENV'

/**
 * **内置兜底地址**（最后手段，正常应来自配置文件）。
 *
 * 这里保留"产品自己的地址"是合理的常量（它不是机器相关的）；但它是**兜底**，
 * 不是唯一来源 —— 开发机应当通过配置文件显式指向本地服务器。
 *
 * ⚠️ **试运行期**：生产地址暂时指向 `convfusion.apibrowser.com:4747` 中转，
 * 尚未启用正式域名 `convfusion.com`。切回正式域名时**只改这一处**（以及
 * `convfusion.env.json` / `convfusion.env.example.json` 两个配置文件）即可。
 */
export const BUILTIN_SERVER_URL: Record<ConvFusionEnvironment, string> = {
  development: 'http://localhost:8000',
  production: 'https://convfusion.apibrowser.com:4747',
}

/** 配置文件里与**开发流程**有关的值（验证脚本 / 本地工具用；不影响运行时行为）。 */
export interface ServerEnvDev {
  /** 本地服务器仓库路径（相对配置文件所在目录，或绝对路径）。 */
  serverDir?: string
  /** 跑服务器与本仓库 Python 工具的解释器（命令名或绝对路径）。 */
  python?: string
  /** 隔离验证实例绑定的地址与端口。 */
  host?: string
  port?: number
}

/** 一个环境下的一条配置。 */
export interface ServerEnvEntry {
  serverUrl?: string
}

/** 解析后的环境配置。 */
export interface ServerEnvConfig {
  /** 生效的环境名。 */
  environment: ConvFusionEnvironment
  /** 各环境的地址表（文件里的原样）。 */
  environments: Partial<Record<ConvFusionEnvironment, ServerEnvEntry>>
  /** 开发流程用值（已把 `serverDir` 解析成绝对路径）。 */
  dev: ServerEnvDev
  /** 实际读到的配置文件路径（没有任何文件时为 undefined）。 */
  path?: string
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])

/** DSH 主目录（与 `config.ts` 同款规则；这里独立实现以避免循环依赖）。 */
function dshHome(env: NodeJS.ProcessEnv): string {
  const custom = (env.DSH_HOME ?? '').trim()
  return custom || join(homedir(), '.dsh')
}

/** 插件包根目录（`lib/server-env.js` 的上一级）。 */
export function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

/**
 * 配置文件候选列表（**按优先级**；取第一个存在的）。
 *
 * 导出它是为了可验证：脚本与测试都要能断言"我到底读的是哪个文件"。
 *
 * ⚠️ `CONVFUSION_ENV_FILE=-`（或 `none`）表示**不读任何文件**，只用环境变量与内置兜底。
 * 部署环境（容器 / systemd）常常希望配置**只**来自环境变量，这一条让那成为可能，
 * 也让"没有任何配置文件时是什么行为"可以被测试固定下来。
 */
export function serverEnvFileCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const explicit = (env[SERVER_ENV_FILE_ENV] ?? '').trim()
  if (explicit === '-' || explicit.toLowerCase() === 'none') return []
  const root = packageRoot()
  return [
    ...(explicit ? [resolve(explicit)] : []),
    join(root, SERVER_ENV_FILE_NAME),
    join(dshHome(env), 'convfusion', 'server-env.json'),
    join(root, SERVER_ENV_FILE_EXAMPLE),
  ]
}

/** 把任意字符串收敛成受支持的环境名（不认识的一律当开发环境，并保留原名的痕迹由调用方决定）。 */
function normalizeEnvironment(raw: string): ConvFusionEnvironment | undefined {
  const v = raw.trim().toLowerCase()
  if (!v) return undefined
  if (v === 'production' || v === 'prod' || v === 'live') return 'production'
  if (v === 'development' || v === 'dev' || v === 'local' || v === 'test' || v === 'testing') {
    return 'development'
  }
  return undefined
}

/**
 * 环境名解析：`CONVFUSION_ENV` > `NODE_ENV`/`APP_ENV` > 文件 `environment` > development。
 *
 * ⚠️ **进程环境变量必须排在文件之前**。文件里有两条容易踩的路径：本机配置与
 * **随包发布的模板**（`convfusion.env.example.json` 里写的是 `development`）。
 * 若让文件优先，一个部署环境（`NODE_ENV=production`）会因为读到模板而把自己当成开发环境，
 * 于是去连 `localhost:8000` —— 部署最常见、也最难查的错就来自这种"配置赢过了运行时"。
 */
export function resolveEnvironmentName(
  env: NodeJS.ProcessEnv = process.env,
  fileEnvironment?: string,
): ConvFusionEnvironment {
  return (
    normalizeEnvironment(env[SERVER_ENV_ENV] ?? '') ??
    normalizeEnvironment(env.NODE_ENV ?? '') ??
    normalizeEnvironment(env.APP_ENV ?? '') ??
    normalizeEnvironment(fileEnvironment ?? '') ??
    'development'
  )
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 容错解析一份配置文件（坏 JSON / 错类型都不应让插件起不来）。 */
function parseServerEnvFile(path: string): {
  environment?: string
  environments: Partial<Record<ConvFusionEnvironment, ServerEnvEntry>>
  dev: ServerEnvDev
} {
  const empty = { environments: {}, dev: {} } as {
    environment?: string
    environments: Partial<Record<ConvFusionEnvironment, ServerEnvEntry>>
    dev: ServerEnvDev
  }
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return empty
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return empty
  }
  const obj = asRecord(data)

  const environments: Partial<Record<ConvFusionEnvironment, ServerEnvEntry>> = {}
  for (const [key, value] of Object.entries(asRecord(obj.environments))) {
    const name = normalizeEnvironment(key)
    if (!name) continue
    const url = asString(asRecord(value).serverUrl)
    if (url) environments[name] = { serverUrl: url }
  }

  const devRaw = asRecord(obj.dev)
  const dev: ServerEnvDev = {}
  const base = dirname(path)
  const serverDir = asString(devRaw.serverDir)
  if (serverDir) dev.serverDir = isAbsolute(serverDir) ? serverDir : resolve(base, serverDir)
  const python = asString(devRaw.python)
  if (python) dev.python = python
  const host = asString(devRaw.host)
  if (host) dev.host = host
  if (typeof devRaw.port === 'number' && Number.isFinite(devRaw.port)) {
    dev.port = Math.floor(devRaw.port)
  }

  const environment = asString(obj.environment)
  return { ...(environment ? { environment } : {}), environments, dev }
}

/**
 * 读出当前环境配置。
 *
 * @param options.fresh 忽略进程内缓存重新读盘（测试与"重新检查"用）
 */
export function loadServerEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { fresh?: boolean } = {},
): ServerEnvConfig {
  const candidates = serverEnvFileCandidates(env)
  // ⚠️ 缓存键必须**同时**含环境名相关的变量：否则同一个文件在 `CONVFUSION_ENV=production`
  // 与未设置时会被判成同一份缓存，把开发环境的结果回给生产（反之亦然）。
  const key = [
    ...candidates,
    env[SERVER_ENV_ENV] ?? '',
    env.NODE_ENV ?? '',
    env.APP_ENV ?? '',
  ].join('|')
  if (!options.fresh && cache.key === key) return cache.value

  const found = candidates.find((p) => {
    try {
      return existsSync(p)
    } catch {
      return false
    }
  })
  const parsed = found ? parseServerEnvFile(found) : { environments: {}, dev: {} }
  const value: ServerEnvConfig = {
    environment: resolveEnvironmentName(env, parsed.environment),
    environments: parsed.environments,
    dev: parsed.dev,
    ...(found ? { path: found } : {}),
  }
  cache = { key, value }
  return value
}

/** 缓存（按候选路径集合做键：不同 `DSH_HOME` / `CONVFUSION_ENV_FILE` 互不污染）。 */
let cache: { key: string; value: ServerEnvConfig } = { key: '', value: null as unknown as ServerEnvConfig }

/** 测试与"重新检查"用：丢掉缓存。 */
export function resetServerEnvCache(): void {
  cache = { key: '', value: null as unknown as ServerEnvConfig }
}

/** 环境对应的服务器地址（配置文件 > 内置兜底）。`source` 让界面能说清"这个地址哪来的"。 */
export function environmentServerUrl(
  env: NodeJS.ProcessEnv = process.env,
  options: { fresh?: boolean } = {},
): { url: string; source: 'config' | 'builtin'; environment: ConvFusionEnvironment; path?: string } {
  const cfg = loadServerEnv(env, options)
  const fromFile = cfg.environments[cfg.environment]?.serverUrl
  return {
    url: fromFile || BUILTIN_SERVER_URL[cfg.environment],
    source: fromFile ? 'config' : 'builtin',
    environment: cfg.environment,
    ...(cfg.path ? { path: cfg.path } : {}),
  }
}

/**
 * **两种环境各自的地址**（配置文件 > 内置兜底）—— 设置页那两个快捷按钮用。
 *
 * 为什么要两边都要：`environmentServerUrl` 只回答"当前环境是哪台"。而用户想做的动作是
 * **在两边之间切**（本机调试 ↔ 线上），所以他必须同时看到另一个环境的地址。
 * ⚠️ 地址依然只来自配置文件 / 内置兜底 —— 界面**不自己写死** `localhost:8000`，
 * 否则某个部署把生产地址换成自有域名后，按钮会指向错误的地方。
 */
export function serverUrlPresets(
  env: NodeJS.ProcessEnv = process.env,
  options: { fresh?: boolean } = {},
): Record<ConvFusionEnvironment, string> {
  const cfg = loadServerEnv(env, options)
  return {
    development: cfg.environments.development?.serverUrl || BUILTIN_SERVER_URL.development,
    production: cfg.environments.production?.serverUrl || BUILTIN_SERVER_URL.production,
  }
}

/**
 * 服务器地址的**归一化键**（只用于**比较**，不校验合法性）。
 *
 * 为什么需要它：判断"当前地址等于哪个预设"时，两边写法可能不同 —— 配置文件里可能带
 * 末尾斜杠，用户可能粘贴带 `/api`、`/docs` 的地址。不归一就会出现"明明是同一台服务器，
 * 却判成另一台"，进而**把 Key 发错地方**。
 *
 * 与 `normalizeBaseUrl`（`server-client.ts`）的区别：那个会**抛 `bad-url`**（因为它要拿去发请求）；
 * 这个只做字符串归一，永不抛 —— 它被配置解析调用，不该因为一个坏地址让整页读不出来。
 */
export function serverAddressKey(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    let path = url.pathname.replace(/\/+$/, '')
    path = path.replace(/\/api\/v1$/, '').replace(/\/api$/, '').replace(/\/docs$/, '')
    path = path.replace(/\/+$/, '')
    return `${url.origin.toLowerCase()}${path}`
  } catch {
    // 不是合法 URL：退化成"小写 + 去末尾斜杠"当键，至少同一串写法能对上
    return trimmed.replace(/\/+$/, '').toLowerCase()
  }
}

/**
 * 一个地址属于哪个**凭据槽**（开发 / 互联网）。
 *
 * 凭据只有两把（`convfusionDevApiKey` / `convfusionProdApiKey`），因为界面上就只有
 * 两个服务器预设按钮。判定分三步：
 *   ① 等于**开发预设** → 开发槽；
 *   ② 等于**互联网预设** → 互联网槽；
 *   ③ 都不是（用户手输的自定义地址）→ 按"**是不是本机**"归类：本机地址用开发槽，
 *      其余用互联网槽。
 *
 * ③ 不能偷懒写成"不是开发预设就算互联网"：那样 `http://localhost:9000`（换端口的本地
 * 服务器）会被当成线上，登出时清错槽、也让本地调试的凭据取不出来。
 */
export function serverSlotOf(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { fresh?: boolean } = {},
): ConvFusionEnvironment {
  const target = serverAddressKey(url)
  const presets = serverUrlPresets(env, options)
  if (target === serverAddressKey(presets.development)) return 'development'
  if (target === serverAddressKey(presets.production)) return 'production'
  return isLocalServerUrl(url) ? 'development' : 'production'
}

/** 开发流程用值的读取（脚本用；`env` 覆盖文件）。 */
export function resolveDevTooling(env: NodeJS.ProcessEnv = process.env): {
  serverDir?: string
  python: string
  host: string
  port: number
} {
  const cfg = loadServerEnv(env)
  const serverDir = (env.CONVFUSION_SERVER_DIR ?? '').trim() || cfg.dev.serverDir
  return {
    ...(serverDir ? { serverDir: resolve(serverDir) } : {}),
    // 解释器：环境变量 > 配置文件 > PATH 上的 python3（**不写死任何机器路径**）
    python: (env.CONVFUSION_PYTHON ?? '').trim() || cfg.dev.python || 'python3',
    host: (env.CONVFUSION_HOST ?? '').trim() || cfg.dev.host || '127.0.0.1',
    port:
      Number(env.CONVFUSION_TEST_PORT ?? '') ||
      cfg.dev.port ||
      8123,
  }
}

/** 地址是不是"本机"（用来发现"生产环境却指向 localhost"这类配置错）。 */
export function isLocalServerUrl(url: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname)
  } catch {
    return false
  }
}

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
export function serverUrlMismatch(
  environment: ConvFusionEnvironment,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const productionHost = new URL(BUILTIN_SERVER_URL.production).hostname
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  if (environment === 'production') return isLocalServerUrl(url)
  return host === productionHost
}
