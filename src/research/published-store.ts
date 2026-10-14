/**
 * ConvFusion 2.0 — **本机研究工作 ↔ 服务器项目** 的映射（落盘）
 *
 * ## 为什么必须有这份映射
 *
 * 【研究工作 · 我的】里的一个本机工作区，在 ConvFusion.com 上对应一个
 * Research Project（`project_id`）。没有映射的话，每点一次「寻找指导」都会
 * **新建一个项目** —— 网络里很快会出现同一个研究的一堆副本，而且没有一个能持续更新。
 *
 * ```text
 * <研究根目录（realpath）> + <方向>  →  { projectId, serverUrl, accountId, version, … }
 * ```
 *
 * ## 为什么键里还有**方向**（v0.6.0）
 *
 * 一个工作区可以在**两个方向**上发布，而且是**两个不同的服务器项目**：
 *
 * - `SEEK_MENTOR`：学生把自己的研究发布出去求指导（【我的】→【寻找指导】）；
 * - `SEEK_STUDENT`：导师把自己的选题发布出去招学生（【我的】→【寻找学生】）。
 *
 * 早先一条工作区只存一条记录 —— 在同一台上先点【寻找指导】再点【寻找学生】，
 * 后者会**复用前者的 `project_id`**，把"学生求指导的研究"顶成"导师招学生的选题"。
 * 所以键是 `(研究根目录, 方向)`；旧文件里的记录没有方向，读作 `SEEK_MENTOR`
 * （那时只有这一个方向）。
 *
 * ## 为什么存在 `$DSH_HOME` 而不是工作区里
 *
 * `project_id` 是**「(哪台服务器, 哪个账号) 下的对象」**：
 *
 * - 同一个工作区被两个账号（或两台服务器）发布 → 必须是两个不同的项目；
 * - 工作区可能在共享盘上，而凭据是本机、本账号的。
 *
 * 所以映射属于**这台机器的这个 DSH 用户**，放在 `$DSH_HOME/convfusion/` 下，
 * 与 Skill 定制同一个目录（都经 `config.ts` 的路径解析）。
 * 记录里带 `serverUrl` 与 `accountId`：换服务器或换账号时**不重用**旧项目
 * （服务器上 `GET /projects/{id}` 是 owner-only，重用只会得到 404，
 * 与其撞上去再补救，不如按记录里的归属直接新建）。
 *
 * ## 容错
 *
 * 与定制文件同款：坏 JSON / 非对象 / 值类型不对 → 当作空表（**绝不**让插件起不来），
 * 写入用「临时文件 + rename」，避免半截文件。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ProjectDirection } from '../server-client.js'

/** 一条"已发布到服务器"的记录。 */
export interface PublishedRecord {
  /**
   * 这条记录属于哪个方向（见 `ProjectDirection`）。
   *
   * ⚠️ 旧的落盘文件里没有这个字段 → 读作 `SEEK_MENTOR`（那时只有这一个方向），
   * 不丢记录、也不把它误判成导师出题。
   */
  direction: ProjectDirection
  /**
   * 上次发布时用的**研究工作名**（项目标题）。
   *
   * 名字会随"论文起名 / 主题演进"变化，而项目标题只在建项目时写过一次 ——
   * 下次发布时拿它比一比，不同就 `PUT` 改名（见 `work/publish`）。
   * 旧记录没有这个字段 → 无从比较 → 会改名一次并记下来。
   */
  title?: string
  /** 服务器上的 Research Project id。 */
  projectId: string
  /** 发布时用的服务器地址（归一后的根地址）。 */
  serverUrl: string
  /** 发布时的账号 id（换账号不重用旧项目）。 */
  accountId: string
  /** 我们最后一次上传的版本号（下次上传的 `base_version`）。 */
  version: number
  /** 最后一次上传的内容哈希（内容没变时可以跳过上传）。 */
  contentHash?: string
  /** 首次发布时间（ISO）。 */
  publishedAt: string
  /** 最近一次发布时间（ISO）。 */
  updatedAt: string
  /**
   * 最近一次**向服务器核对**到的可见性（`PUBLISHED` / `PRIVATE`）。
   *
   * ⚠️ 这个字段只由核对回写（列【我的】/【可指导】时）——它记的是**服务器**的状态，
   * 与 `version`（我们自己传过什么）不是一回事：项目可能被服务器删除或取消发布。
   */
  serverVisibility?: string
  /** 最近一次核对成功的时刻（ISO）。 */
  checkedAt?: string
  /**
   * 已上传附件的**内容指纹**（研究根相对路径 → `sha256:<hex>`）。
   *
   * ⚠️ 服务器**不去重**：同一个路径重复上传会新建一行元数据 + 一份新字节，
   * 所以「更新」必须靠这份指纹做**增量**（只传新增/变化的文件）。
   */
  files?: Record<string, string>
  /**
   * 用户确认过的上传选择（「记住这次选择」）。
   *
   * 下次「更新」直接沿用它 —— 但**新文件按规则自动并入**（见 `work/uploadPlan`），
   * 否则新增的证据/计划会静默漏传。
   */
  selection?: string[]
}

/**
 * 表键 = `<研究根目录>\u0000<方向>`。
 *
 * 用 NUL 而不是 `/` 或 `|`：研究根是**绝对路径**，任何可打印字符都可能出现在里面，
 * 而 NUL 不可能出现在路径里（`realpath` 的结果里不会带它）。
 */
const KEY_SEP = '\u0000'

/** 组装表键（落盘 / 遍历用）。 */
export function publishedStoreKey(researchRoot: string, direction: ProjectDirection): string {
  return `${researchRoot}${KEY_SEP}${direction}`
}

/** 拆表键；不带分隔符的旧键 → 研究根本身 + `SEEK_MENTOR`（旧文件只有这一个方向）。 */
export function parsePublishedStoreKey(key: string): { researchRoot: string; direction: ProjectDirection } {
  const at = key.indexOf(KEY_SEP)
  if (at < 0) return { researchRoot: key, direction: 'SEEK_MENTOR' }
  return {
    researchRoot: key.slice(0, at),
    direction: key.slice(at + KEY_SEP.length) === 'SEEK_STUDENT' ? 'SEEK_STUDENT' : 'SEEK_MENTOR',
  }
}

export interface PublishedStore {
  /** 读一条记录（研究根目录 + 方向 → 记录）。方向省略 = `SEEK_MENTOR`（今天的行为）。 */
  get(researchRoot: string, direction?: ProjectDirection): PublishedRecord | undefined
  /** 写一条记录（整表落盘）；方向取自 `record.direction`。 */
  set(researchRoot: string, record: PublishedRecord): void
  /** 删一条记录（例如服务器上项目已不存在时）。 */
  remove(researchRoot: string, direction?: ProjectDirection): void
  /** 全部记录（只读快照）；键是 {@link publishedStoreKey} —— 同一个根**可以出现两次**。 */
  all(): Record<string, PublishedRecord>
  /** 落盘位置（设置页/日志展示用）。 */
  readonly path: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 单条记录的形状校验（坏记录直接丢掉，不留半截数据）。 */
function parseRecord(raw: unknown): PublishedRecord | undefined {
  if (!isRecord(raw)) return undefined
  const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : ''
  const serverUrl = typeof raw.serverUrl === 'string' ? raw.serverUrl.trim() : ''
  const accountId = typeof raw.accountId === 'string' ? raw.accountId.trim() : ''
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 0
  if (!projectId || !serverUrl) return undefined
  return {
    // 缺方向 = 旧记录（那时只有 SEEK_MENTOR 一个方向），不猜成导师出题
    direction: raw.direction === 'SEEK_STUDENT' ? 'SEEK_STUDENT' : 'SEEK_MENTOR',
    ...(typeof raw.title === 'string' && raw.title.trim() ? { title: raw.title.trim() } : {}),
    projectId,
    serverUrl,
    accountId,
    version,
    ...(typeof raw.contentHash === 'string' && raw.contentHash ? { contentHash: raw.contentHash } : {}),
    ...(isRecord(raw.files)
      ? {
          files: Object.fromEntries(
            Object.entries(raw.files).filter((e): e is [string, string] => typeof e[1] === 'string'),
          ),
        }
      : {}),
    ...(Array.isArray(raw.selection)
      ? { selection: raw.selection.filter((x): x is string => typeof x === 'string') }
      : {}),
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    ...(typeof raw.serverVisibility === 'string' && raw.serverVisibility
      ? { serverVisibility: raw.serverVisibility }
      : {}),
    ...(typeof raw.checkedAt === 'string' && raw.checkedAt ? { checkedAt: raw.checkedAt } : {}),
  }
}

function parseTable(text: string): Record<string, PublishedRecord> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(data)) return {}
  const out: Record<string, PublishedRecord> = {}
  for (const [key, value] of Object.entries(data)) {
    const record = parseRecord(value)
    // ⚠️ 键用**解析后**的规范形式回写：旧文件（裸研究根做键）读进来后落到
    // `(root, SEEK_MENTOR)` 上，于是"再存一次就带上方向了"，不会两套键并存。
    if (record) out[publishedStoreKey(parsePublishedStoreKey(key).researchRoot, record.direction)] = record
  }
  return out
}

/**
 * 文件存储。
 *
 * @param resolvePath 延迟求值（与 Skill 定制同款：设置里改了目录立刻生效）
 */
export function createFilePublishedStore(resolvePath: () => string): PublishedStore {
  const load = (): Record<string, PublishedRecord> => {
    const path = resolvePath()
    try {
      if (!existsSync(path)) return {}
      return parseTable(readFileSync(path, 'utf8'))
    } catch {
      return {}
    }
  }
  const save = (table: Record<string, PublishedRecord>): void => {
    const path = resolvePath()
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, `${JSON.stringify(table, null, 2)}\n`, 'utf8')
    renameSync(tmp, path)
  }
  return {
    get: (root, direction = 'SEEK_MENTOR') => load()[publishedStoreKey(root, direction)],
    set: (root, record) => {
      const table = load()
      table[publishedStoreKey(root, record.direction)] = record
      save(table)
    },
    remove: (root, direction = 'SEEK_MENTOR') => {
      const table = load()
      const key = publishedStoreKey(root, direction)
      if (!(key in table)) return
      delete table[key]
      save(table)
    },
    all: () => load(),
    get path() {
      return resolvePath()
    },
  }
}

/**
 * 内存存储（离线验证 / 精简环境）。
 *
 * `seed` 的键可以是**裸研究根**（旧写法，按 `SEEK_MENTOR` 收）或
 * {@link publishedStoreKey} 的完整键；记录自己带的 `direction` 优先。
 */
export function createMemoryPublishedStore(seed: Record<string, PublishedRecord> = {}): PublishedStore {
  const table: Record<string, PublishedRecord> = {}
  for (const [key, record] of Object.entries(seed)) {
    const parsed = parsePublishedStoreKey(key)
    const direction = record.direction ?? parsed.direction
    table[publishedStoreKey(parsed.researchRoot, direction)] = { ...record, direction }
  }
  return {
    get: (root, direction = 'SEEK_MENTOR') => table[publishedStoreKey(root, direction)],
    set: (root, record) => {
      table[publishedStoreKey(root, record.direction)] = record
    },
    remove: (root, direction = 'SEEK_MENTOR') => {
      delete table[publishedStoreKey(root, direction)]
    },
    all: () => ({ ...table }),
    path: '(memory)',
  }
}
