/**
 * 工作区里的文件级操作：**读**研究根下的一个文件（导师整包回传时上传用），
 * 以及下载时**往工作区写一个文件**。
 *
 * ## 为什么单独一个模块
 *
 * `settings-rpc.ts` 有一条既定的分层纪律：**RPC 层不做文件读写**（只经 store 或
 * 专门模块）。这里放"找文件、读字节、拼安全路径、写一个文件"这些机械动作，
 * 既守住那条纪律，又能脱离 RPC 单独测。
 *
 * ## 上传源由 `upload-selection` 决定，这里只负责"安全地读出来"
 *
 * 清单（哪些文件、分到哪一级）来自 `buildUploadPlan(root, 'mentor')`；
 * 本模块只做"把一个已在白名单里的相对路径读成字节"，路径安全由 {@link safeJoin} 保证。
 *
 * ## 下载只负责"把 .zip 存下来"
 *
 * 2026-09 用户拍板：下载**不解压**、不生成目录结构、不动别的文件 ——
 * 只把服务器给的 ZIP 写进用户选的工作区，其余交给用户处理。
 * 于是"不覆盖所选工作区里的东西"是**结构性成立**的（同名只加序号，从不覆盖），
 * 不需要在运行时空想哪些文件属于"这个工作区自己"。
 *
 * 落盘走 {@link openDownloadPart}：**边收边写**临时文件，校验通过才改名 ——
 * 一个 13 MB / 两分钟的下载，界面要能看见进度，失败时不能留下坏 ZIP 冒充结果。
 */
import { randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

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
 * 读研究根下的一个文件（上传用）。
 *
 * 调用方必须先拿 `buildUploadPlan(root, 'mentor')` 的扫描结果当**白名单**：
 * 这个函数只保证"不会读到根目录之外"，不判断"该不该上传"。
 *
 * @param relPath 研究根相对路径（POSIX 风格，如 `papers/paper-main/paper.pdf`）
 */
export function readResearchFile(researchRoot: string, relPath: string): Uint8Array {
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
 * 一个**流式**落盘目标：先写临时文件，**校验通过才改名**成正式名字。
 *
 * ## 为什么不是"收完再写"
 *
 * 2026-09 用户反馈：【指导中】点【下载】一直「读取中…」，磁盘上什么也没有。
 * 实测那个工作区的 ZIP 是 13.6 MB、链路 ~118 KB/s → **115 秒**；而旧写法
 * （`arrayBuffer()` 收完再 `writeFileSync`）在这 115 秒里既看不到字节、也看不到进度，
 * 只有一句「读取中…」—— 慢与死长得一模一样。
 *
 * 所以改成边收边写：
 *   - 界面上"已下载 x MB"是**真的**（字节确实在盘上）；
 *   - 内存不随文件大小增长（旧写法整包驻留内存）；
 *   - 半成品叫 `.convfusion-<hex>.zip.part`，**不占正式名字**，失败就删掉。
 *
 * ## 为什么要校验
 *
 * 生产实测出现过一次：HTTP 200、响应头正常，正文传到 126 KB 就结束了 —— 得到一个
 * **没有 EOCD 的坏 ZIP**。旧写法会把它写下来并报「已保存」，用户解压时才发现。
 * `commit` 因此先查 ZIP 结尾的 EOCD（中央目录结束记录）与条目数，不合格**抛错**。
 */
export interface DownloadPart {
  /** 已经写到盘上的字节数（进度用）。 */
  readonly received: number
  /** 顺序追加一块。 */
  write(chunk: Uint8Array): void
  /**
   * 校验后改名成正式名字（同名自动加序号，**绝不覆盖**）。
   *
   * @param rawName 服务器给的或客户端兜底的文件名
   * @param expect 服务器声明的条目数（`X-File-Count`）；对不上就是没传全
   * @throws 校验不通过时抛错，并已清掉临时文件（不留半成品、绝不报成功）
   */
  commit(rawName: string, expect?: { fileCount?: number | null }): WrittenFile
  /** 放弃这次下载：关掉并删掉临时文件。 */
  abort(): void
}

/** EOCD（中央目录结束记录）签名 `PK\x05\x06` 的小端 u32。 */
const EOCD_SIGNATURE = 0x06054b50
/** EOCD 固定长度（22 字节）。 */
const EOCD_SIZE = 22
/** 尾部保留窗口 = EOCD + 最长注释（65535）。 */
const EOCD_WINDOW = EOCD_SIZE + 0xffff

/**
 * 查一段"文件结尾"是不是一个完整 ZIP 的结尾。
 *
 * 判据（标准做法）：EOCD 的注释长度必须让记录**正好**结束在文件末尾 —— 截断的文件
 * 两条都不满足。ZIP64 时条目数用不上，返回 `null` 表示"条目数不可知"（只判完整性）。
 */
function zipTailCheck(tail: Uint8Array): { ok: true; entries: number | null } | { ok: false; reason: string } {
  if (tail.byteLength < EOCD_SIZE) return { ok: false, reason: '数据太短，不像一个完整的 ZIP' }
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  for (let i = tail.byteLength - EOCD_SIZE; i >= 0; i -= 1) {
    if (view.getUint32(i, true) !== EOCD_SIGNATURE) continue
    const commentLength = view.getUint16(i + 20, true)
    if (i + EOCD_SIZE + commentLength !== tail.byteLength) continue
    const entries = view.getUint16(i + 10, true)
    const size = view.getUint32(i + 16, true)
    const offset = view.getUint32(i + 12, true)
    // ZIP64 的哨兵值：条目数/偏移不可信，只当"完整性通过"
    const zip64 = entries === 0xffff || size === 0xffffffff || offset === 0xffffffff
    return { ok: true, entries: zip64 ? null : entries }
  }
  return { ok: false, reason: '结尾没有 ZIP 的中央目录记录（传输被截断了）' }
}

/**
 * 清掉**上一次中断留下的**临时文件（同目录里超过一天的 `.convfusion-*.zip.part`）。
 *
 * 什么时候会有：下载到一半宿主被重启/杀掉（`abort()` 没机会跑）—— 比如这次修完之后
 * 让用户重启 DSH，而那时可能正有一个下载在跑。门槛取 24 小时：**绝不**碰正在进行的那一份。
 */
function sweepStaleParts(dir: string): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const name of names) {
    if (!/^\.convfusion-.*\.zip\.part$/.test(name)) continue
    const abs = join(dir, name)
    try {
      if (statSync(abs).mtimeMs < cutoff) unlinkSync(abs)
    } catch {
      /* 读不到 / 动不了就不动它 —— 清理是顺手，不是职责 */
    }
  }
}

/**
 * 开一个**流式下载目标**（临时文件 + 校验 + 改名）。
 *
 * @param dir 目标工作区目录（写在这里，不进 `<工作区>/workspace/` 研究数据区）
 * @param nameHint 只用来给临时文件起个可读的前缀；正式名字在 `commit` 时定
 */
export function openDownloadPart(dir: string, nameHint = 'download'): DownloadPart {
  mkdirSync(dir, { recursive: true })
  sweepStaleParts(dir)
  const hint = safeDirName(nameHint, 'download.zip').replace(/\.zip$/i, '')
  // 随机后缀：同一个工作区并发两次下载也不会互相踩临时文件
  const partPath = join(dir, `.convfusion-${hint.slice(0, 40)}-${randomBytes(6).toString('hex')}.zip.part`)
  const fd = openSync(partPath, 'w')
  let received = 0
  let tail = new Uint8Array(0)
  let head = new Uint8Array(0)
  let closed = false

  const closeFd = (): void => {
    if (closed) return
    closed = true
    try {
      closeSync(fd)
    } catch {
      /* 关不掉就算了：下面的 unlink / rename 才是结果 */
    }
  }

  /** 丢弃这次下载（关掉 + 删临时文件），并给出要抛给调用方的错误。 */
  const discard = (message: string): Error => {
    closeFd()
    try {
      unlinkSync(partPath)
    } catch {
      /* 半成品清不掉也不是错误：它叫 .part，不会被当成结果 */
    }
    return new Error(message)
  }

  return {
    get received() {
      return received
    },

    write(chunk: Uint8Array): void {
      if (closed) throw new Error('下载已结束，不能再写入。')
      writeSync(fd, chunk)
      received += chunk.byteLength
      if (head.byteLength < 4) {
        head = Buffer.concat([head, Buffer.from(chunk)]).subarray(0, 4)
      }
      tail = Buffer.concat([tail, Buffer.from(chunk)])
      if (tail.byteLength > EOCD_WINDOW) tail = tail.subarray(tail.byteLength - EOCD_WINDOW)
    },

    commit(rawName: string, expect?: { fileCount?: number | null }): WrittenFile {
      if (received === 0) throw discard('服务器没有返回任何数据，请重试。')
      // `PK` = ZIP 的本地文件头；不是 ZIP 就没必要再往下查
      if (head.byteLength < 2 || head[0] !== 0x50 || head[1] !== 0x4b) {
        throw discard('下载到的不是一个 ZIP（服务器返回了意外内容），请重试。')
      }
      const check = zipTailCheck(tail)
      if (!check.ok) throw discard(`下载不完整：${check.reason}。请重试。`)
      const want = expect?.fileCount
      if (typeof want === 'number' && check.entries !== null && check.entries !== want) {
        throw discard(`下载不完整：ZIP 里只有 ${check.entries} 个条目，服务器说有 ${want} 个。请重试。`)
      }
      closeFd()
      // 正式名字在**这一刻**才定：同名不覆盖，加 -2、-3…
      const name = safeDirName(rawName, 'download.zip')
      const stem = name.replace(/\.zip$/i, '')
      let target = join(dir, name)
      let n = 2
      while (existsSync(target)) {
        target = join(dir, `${stem}-${n}.zip`)
        n += 1
      }
      renameSync(partPath, target)
      return { path: target, name: relative(dir, target), bytes: received }
    },

    abort(): void {
      closeFd()
      try {
        unlinkSync(partPath)
      } catch {
        /* 半成品清不掉也不是错误：它叫 .part，不会被当成结果 */
      }
    },
  }
}
