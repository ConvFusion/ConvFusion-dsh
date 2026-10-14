/**
 * 「待同步便签」：下载成功时记一笔"这个 ZIP 是哪项研究"，供 `/research sync` 读取。
 *
 * ## 为什么需要它
 *
 * 同步的**判定**（同一项研究 → 融合；另一项 → 先备份再换）取决于两端的
 * `workspace_id`：本机那份读得到（`<研究根>/.convfusion/work.json`），
 * 下载的这份**只有下载那一刻才知道** —— 它来自 `mentor/download` 的响应
 * （归档响应头 `X-Workspace-Id` 为权威）。
 *
 * 下载完就把它写下来，之后 `/research sync @那个.zip` 才不用再猜：
 *
 * ```text
 * 下载时  : mentor/download 成功 → putSyncNote({ zipPath, remoteWorkspaceId, … })
 * 同步时  : /research sync @x.zip → getSyncNote(realpath(x.zip)) → 精确判定
 * ```
 *
 * 查不到便签也**不是错误**（用户可能换了台机器、挪过文件、或用了旧版本下载）：
 * 那时判定退化为 `unverifiable` —— sync 技能的第一步就是只读盘查 + 让用户确认，
 * 功能不缺失，只是少一个自动化结论。
 *
 * ## 存储
 *
 * 与身份注册表同目录（`$DSH_HOME/convfusion/`）的一个 JSON 文件，键是 ZIP 的
 * **规范化绝对路径**（`realpath` 优先 —— macOS 上 `/var` 与 `/private/var` 是同一处，
 * 只用字符串比较会查不到）。
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** 一条便签：这次下载的是"哪项研究"。 */
export interface SyncNote {
  /** 落盘后的 ZIP 绝对路径（规范化）。 */
  zipPath: string
  /** 服务器给这项研究的标识（权威值）。 */
  remoteWorkspaceId: string | null
  /** 服务器上的项目 id（排查用）。 */
  projectId: string | null
  /** 项目标题（只用于展示与备份名建议）。 */
  projectTitle: string | null
  /** 服务器地址（写进身份文件时用）。 */
  serverUrl: string | null
  /** 下载的是哪一侧：`owner` = 导师拿学生的工作区，`mentor` = 研究者取回回传那份。 */
  source: 'owner' | 'mentor' | null
  /** 记录时间（ISO）。 */
  savedAt: string
}

export interface SyncNoteStore {
  get(zipPath: string): SyncNote | undefined
  put(note: SyncNote): void
  all(): SyncNote[]
}

/** 便签最多留这么多条（按时间取最新；超出就丢最旧的）。 */
export const SYNC_NOTE_LIMIT = 50

/**
 * ZIP 路径的**规范化形式**（存储与查询都用它）。
 *
 * `realpath` 优先：macOS 上 `/var/folders/...` 与 `/private/var/folders/...` 是同一处，
 * 下载时写的是前者、命令解析出来可能是后者 —— 只按字符串比就会"查不到便签"。
 * 文件不在（还没落盘 / 已删）时退回 `resolve()`。
 */
export function canonicalZipPath(zipPath: string): string {
  const abs = resolve(zipPath)
  try {
    return realpathSync(abs)
  } catch {
    return abs
  }
}

function parseNotes(text: string): SyncNote[] {
  try {
    const raw = JSON.parse(text) as unknown
    const list = Array.isArray(raw) ? raw : []
    return list.filter((n): n is SyncNote => {
      if (!n || typeof n !== 'object') return false
      const o = n as Record<string, unknown>
      return typeof o.zipPath === 'string' && o.zipPath.length > 0
    })
  } catch {
    // 坏文件不致命：便签只是"更好的判定"，丢了就退化成 unverifiable
    return []
  }
}

/** 文件后端（宿主用）。`resolvePath()` 每次现取，配置改了立刻生效。 */
export function createFileSyncNoteStore(resolvePath: () => string): SyncNoteStore {
  const read = (): SyncNote[] => {
    const file = resolvePath()
    if (!existsSync(file)) return []
    try {
      return parseNotes(readFileSync(file, 'utf8'))
    } catch {
      return []
    }
  }
  const write = (notes: SyncNote[]): void => {
    const file = resolvePath()
    try {
      mkdirSync(dirname(file), { recursive: true })
      // 先写临时文件再改名：中途被杀不会留下半个 JSON（同 work-identities 的做法）
      const tmp = `${file}.tmp`
      writeFileSync(tmp, `${JSON.stringify(notes, null, 2)}\n`, 'utf8')
      renameSync(tmp, file)
    } catch {
      /* 不可写就不记：这是"锦上添花"的数据，不能阻断下载 */
    }
  }
  return {
    get(zipPath) {
      const key = canonicalZipPath(zipPath)
      return read().find((n) => canonicalZipPath(n.zipPath) === key)
    },
    put(note) {
      const key = canonicalZipPath(note.zipPath)
      const kept = read().filter((n) => canonicalZipPath(n.zipPath) !== key)
      const next = [{ ...note, zipPath: key }, ...kept]
        // 新的在前；超出上限丢最旧的
        .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
        .slice(0, SYNC_NOTE_LIMIT)
      write(next)
    },
    all() {
      return read().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    },
  }
}

/** 内存后端（未配置路径 / 自检用）。 */
export function createMemorySyncNoteStore(): SyncNoteStore {
  let notes: SyncNote[] = []
  return {
    get: (zipPath) => {
      const key = canonicalZipPath(zipPath)
      return notes.find((n) => canonicalZipPath(n.zipPath) === key)
    },
    put: (note) => {
      const key = canonicalZipPath(note.zipPath)
      notes = [{ ...note, zipPath: key }, ...notes.filter((n) => canonicalZipPath(n.zipPath) !== key)].slice(
        0,
        SYNC_NOTE_LIMIT,
      )
    },
    all: () => [...notes],
  }
}
