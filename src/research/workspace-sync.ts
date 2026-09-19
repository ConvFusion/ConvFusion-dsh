/**
 * 工作区里的文件级操作：`review/` 的**扫描与读取**（导师回传），
 * 以及下载时**往工作区写一个文件**。
 *
 * ## 为什么单独一个模块
 *
 * `settings-rpc.ts` 有一条既定的分层纪律：**RPC 层不做文件读写**（只经 store 或
 * 专门模块）。这里放"找文件、读字节、拼安全路径、写一个文件"这些机械动作，
 * 既守住那条纪律，又能脱离 RPC 单独测。
 *
 * ## 下载只负责"把 .zip 存下来"
 *
 * 2026-09 用户拍板：下载**不解压**、不生成目录结构、不动别的文件 ——
 * 只把服务器给的 ZIP 写进用户选的工作区，其余交给用户处理。
 * 于是"不覆盖所选工作区里的东西"是**结构性成立**的（同名只加序号，从不覆盖），
 * 不需要在运行时空想哪些文件属于"这个工作区自己"。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

import { researchWorkspaceOf } from './workspace.js'
import { REVIEW_DIR } from './workspace-layout.js'

export { REVIEW_DIR }

/** `review/` 下的一个待上传文件。 */
export interface ReviewFile {
  /** 研究根相对路径，已带 `review/` 前缀（直接作为服务器的 `relative_paths`）。 */
  relPath: string
  size: number
}

/**
 * 把一个不可信的相对路径解析成根目录下的**安全**绝对路径。
 *
 * 绝对路径、空、`..`、以及规范化后逃出根目录的路径一律拒绝。拿到不可信的相对路径
 * 就往磁盘上写，一个被篡改的值就能写到 `~/.ssh/authorized_keys`。
 *
 * @returns 绝对路径；不安全时返回 `null`。
 */
export function safeJoin(root: string, relativePath: string): string | null {
  const rel = (relativePath ?? '').trim()
  if (!rel || isAbsolute(rel)) return null
  const normalizedRoot = resolve(root)
  const target = normalize(resolve(normalizedRoot, rel))
  // 必须仍在根目录内。要带分隔符比较：`/root2` 不能因为前缀是 `/root` 就通过。
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + sep)) return null
  return target
}

/**
 * 列出某个工作区里 `review/` 下的全部文件。
 *
 * 为什么以**目录**为输入而不是单个文件：导师的交付物可能带子目录
 * （`review/figures/x.png`），服务器要求 `relative_paths` 保留目录层次，
 * 所以必须能枚举出整棵树。
 *
 * @param dir 用户选的工作区目录（会话工作区**或**研究根都行，按 `researchWorkspaceOf` 判）。
 */
export function scanReviewFiles(dir: string): {
  researchRoot: string
  reviewDir: string
  files: ReviewFile[]
} {
  const researchRoot = researchWorkspaceOf(dir)
  const reviewDir = join(researchRoot, REVIEW_DIR)
  const files: ReviewFile[] = []
  const walk = (current: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      // 目录不存在 / 读不到：当作"还没有指导结果"，不是错误
      return
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const abs = join(current, name)
      let isDir = false
      let size = 0
      try {
        const st = statSync(abs)
        isDir = st.isDirectory()
        size = st.size
      } catch {
        continue
      }
      if (isDir) {
        walk(abs)
        continue
      }
      // 统一用 `/` 分隔：服务器的相对路径约定是 POSIX 风格
      files.push({ relPath: relative(researchRoot, abs).split(sep).join('/'), size })
    }
  }
  walk(reviewDir)
  files.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return { researchRoot, reviewDir, files }
}

/** 读一个 `review/` 文件的字节（上传用；路径必须已在 `review/` 下）。 */
export function readReviewFile(researchRoot: string, relPath: string): Uint8Array {
  if (!relPath.startsWith(`${REVIEW_DIR}/`)) {
    throw new Error(`只能读取 ${REVIEW_DIR}/ 下的文件（收到 ${relPath}）`)
  }
  const abs = safeJoin(researchRoot, relPath)
  if (!abs) throw new Error(`不安全的相对路径：${relPath}`)
  return new Uint8Array(readFileSync(abs))
}

/** 一次落盘的结果。 */
export interface WrittenFile {
  /** 实际写出的绝对路径（重名时名字与请求的不同）。 */
  path: string
  /** 实际写出的文件名。 */
  name: string
  bytes: number
}

/** 把一段用户可见的文字变成**安全的文件名片段**（去掉分隔符与危险片段）。 */
export function safeDirName(raw: string, fallback = 'download'): string {
  const cleaned = (raw ?? '')
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .trim()
  return cleaned || fallback
}

/**
 * 把一个文件写进目录，**绝不覆盖已有文件**（同名就加 `-2`、`-3`…）。
 *
 * 这是"下载只是把 .zip 存下来"的直接后果：目标目录里原来的东西一个都不动，
 * 所以任何工作区都能安全地当目标（用户 2026-09 拍板：不必因此禁用工作区）。
 */
export function writeFileUnique(dir: string, rawName: string, bytes: Uint8Array): WrittenFile {
  const name = safeDirName(rawName, 'download.zip')
  mkdirSync(dir, { recursive: true })
  const stem = name.replace(/\.zip$/i, '')
  let target = join(dir, name)
  let n = 2
  while (existsSync(target)) {
    target = join(dir, `${stem}-${n}.zip`)
    n += 1
  }
  writeFileSync(target, bytes)
  return { path: target, name: relative(dir, target), bytes: bytes.byteLength }
}
