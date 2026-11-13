/**
 * ConvFusion — **分阶段上传**（v0.7.3 / 协议 34）
 *
 * ```text
 * 清单（path + size + sha256）→ 服务器回 received / needed → 只传缺的 → complete
 * ```
 *
 * ## 为什么要换掉"一次 multiplex 整批传完"
 *
 * 老路径（`uploadProjectFiles` 一批一批传）有三个绕不过去的问题：
 *
 * 1. **去重只能靠本地指纹**：服务器不去重，别处传过的文件再传一次就是新的一版、翻倍占空间；
 * 2. **断线即重来**：哪一批的 ACK 丢了，客户端不知道服务器收没收到，保守做法就是整批重传；
 * 3. **不可查询、不可取消**：一次 `post` 要等全部批次做完，用户只能看着"上传中…"。
 *
 * 服务器现在有了 `/projects/{id}/uploads` 一族（`app/api/v1/uploads.py`），于是：
 *
 * | 问题 | 新流程怎么解 |
 * |---|---|
 * | 去重 | 清单先发，服务器算 `needed`（比 path+sha256+size+blob 是否在盘上） |
 * | 丢 ACK | 启动丢 → **同一个 id 重发同一份清单**，服务器返回原作业；批次丢 → `GET` 核对 `received` |
 * | 查询 / 取消 | 作业在服务器上；`GET /{id}` 查、`DELETE /{id}` 取消（pending 连同暂存一起清掉） |
 * | 状态与文件 | `complete` 里一起提交，回执直接给 `version` / `content_hash`（不再单独 `uploadState`） |
 *
 * ## 纪律（每一条都对应一次真实的失败）
 *
 * - **`sha256` 带前缀**：服务器正则 `^sha256:[0-9a-f]{64}$`，不带就是 422；
 * - **清单必须完整**：`needed` 之外不收；少一个文件就 `UPLOAD_INCOMPLETE`（409）；
 * - **失败要收尾**：pending 作业会挡住这台工作区**所有**写操作（改名 / 发布 / 删文件…）
 *   直到取消或过期（租约 1 天）—— 所以任何终态失败都要 `DELETE`（`__cancelRemote`）；
 * - **取消不撤回已传**：`DELETE` 会把暂存文件一起删掉，所以"取消 = 要重新传"，
 *   界面文案必须这么说；
 * - **读完再用**：清单里的 `size` 是**磁盘上那一刻**的大小，暂存时服务器会按它校验 ——
 *   文件在被扫描之后变大/变小都会 422，这是刻意的（宁可报错，也不传一份对不上的东西）。
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import {
  stageWorkspaceFiles,
  workspaceUploadRequest,
  ServerError,
  type ServerRequestOptions,
  type UploadManifestFile,
  type WorkspaceUploadReceipt,
  type WorkspaceUploadStatus,
} from '../server-client.js'
import { planUploadBatches } from './upload-selection.js'
import { safeJoin } from './workspace-sync.js'

/** 界面上那根进度条的数据（与老的 `mentor/uploadProgress` 同形）。 */
export interface UploadProgress {
  doneFiles: number
  totalFiles: number
  sentBytes: number
  totalBytes: number
  running: boolean
}

/**
 * 一次上传的**控制面**（宿主持有，界面通过 `upload/status` 读）。
 *
 * - `signal`：取消时 abort（本地读盘 / 在途请求都停）；
 * - `cancelRemote`：**服务器侧**的取消动作（`DELETE /uploads/{id}`）—— 只有在作业已经开出来
 *   之后才有；取消时由宿主调用，之后必须置 `undefined`；
 * - `finishing`：已经发出 `complete`（服务器可能已经提交）→ 这时**不许再取消**，
 *   否则会出现"界面说取消了、网络里其实已经有这版文件"。
 */
export interface UploadControl {
  signal: AbortSignal
  progress: UploadProgress
  cancelRemote?: (() => Promise<WorkspaceUploadStatus | null>) | undefined
  finishing: boolean
}

/** `transferWorkspace` 的结果。 */
export interface WorkspaceTransferResult {
  jobId: string
  receipt: WorkspaceUploadReceipt
  /** 超过服务器单文件上限、因此**没进清单**的文件（界面照旧如实提示）。 */
  oversize: Array<{ relPath: string; size: number }>
  /** 本次提交的清单（`path` → `sha256:<hex>`）：调用方可以据此更新本地指纹。 */
  manifest: UploadManifestFile[]
}

/** 一次读盘得到的文件内容 + 指纹。 */
interface ReadFile {
  bytes: Uint8Array
  sha256: string
}

/**
 * 把选中的文件**分阶段**传到服务器，返回提交回执。
 *
 * @param args.base 服务器地址
 * @param args.apiKey API Key
 * @param args.projectId 项目 id
 * @param args.root 本机研究根
 * @param args.paths 选中文件的**研究根相对路径**
 * @param args.options 网络选项（含 `workspaceId` → `X-Workspace-Id` 写守卫）
 * @param args.control 取消 / 进度
 * @param args.state 研究状态与基准版本（**只有 owner 能带**；导师回传不传）
 * @param args.timeoutForBytes 按字节数折算超时（`uploadTimeoutForBytes`）
 */
export async function transferWorkspace(args: {
  base: string
  apiKey: string
  projectId: string
  root: string
  paths: readonly string[]
  options: ServerRequestOptions
  control: UploadControl
  state?: { content: Record<string, unknown>; baseVersion: number | null } | undefined
  timeoutForBytes: (bytes: number) => number
}): Promise<WorkspaceTransferResult> {
  const { base, apiKey, projectId, root, options, control, state, timeoutForBytes } = args
  const { signal, progress } = control
  const uniquePaths = [...new Set(args.paths)]
  if (uniquePaths.length === 0) throw new Error('没有选中任何文件。')

  // ① 超限文件不进清单（服务器会 422）：照旧如实报给界面
  const { batches, skipped } = planUploadBatches(root, uniquePaths)
  if (!batches.flat().length && !skipped.length) throw new Error('选中的文件都不在了，请重新扫描工作区。')
  const listed = batches.flat()
  const oversize = skipped

  // ② 清单：逐个读盘算指纹（读不到 / 变成符号链接 → 直接失败，不悄悄少传一个）
  const canonicalRoot = await realpath(root)
  const readVerified = async (path: string): Promise<ReadFile> => {
    signal.throwIfAborted()
    const absolute = safeJoin(root, path)
    if (!absolute) throw new Error(`所选文件路径无效：${path}`)
    const canonical = await realpath(absolute)
    if (canonical !== safeJoin(canonicalRoot, path)) {
      throw new Error(`选中的文件已变为符号链接，请重新选择：${path}`)
    }
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(canonical, { signal }))
    } catch {
      // 取消 / 中断优先（别把用户主动取消报成"文件读不到"）
      signal.throwIfAborted()
      throw new Error(`文件已被移动、删除或读不动，请重新扫描后再上传：${path}`)
    }
    const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    return { bytes, sha256 }
  }

  const manifest: UploadManifestFile[] = []
  for (const path of listed) {
    const { bytes, sha256 } = await readVerified(path)
    manifest.push({ path, size: bytes.length, sha256 })
  }
  signal.throwIfAborted()

  const jobId = randomUUID()
  const job = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', suffix: string, body?: unknown, timeoutMs?: number) =>
    workspaceUploadRequest(
      base,
      apiKey,
      projectId,
      method,
      suffix,
      body,
      { ...options, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
      '分阶段上传',
    )

  /** 只对"连不上"重试（超时 / 网络）：别的错误重试也不会变好。 */
  const retry = async <T>(send: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await send()
      } catch (error) {
        if (!(error instanceof ServerError && error.code === 'unreachable') || attempt >= 2) throw error
      }
    }
  }

  const body: Record<string, unknown> = {
    id: jobId,
    files: manifest,
    ...(state
      ? { state: state.content, ...(state.baseVersion === null ? {} : { base_version: state.baseVersion }) }
      : {}),
  }

  let jobStatus: WorkspaceUploadStatus
  try {
    // ③ 开作业：启动 ACK 丢了 → **同一个 id 重发**（服务器按 id 认领，不会开两份）
    const started = await retry(() => job('POST', '', body, 60_000))
    if (!started) throw new ServerError('bad-response', '服务器没有返回上传作业。')
    jobStatus = started
  } catch (error) {
    if (error instanceof ServerError && error.code === 'upload-in-progress') {
      // 这台工作区已经有作业：把**那个**作业的取消动作交给界面（别让用户只能干等 24 小时）
      try {
        const active = await job('GET', '/active')
        if (active?.id) control.cancelRemote = () => job('DELETE', `/${active.id}`)
      } catch {
        /* 查不到就算了：至少错误本身已经说清"有别的上传在跑" */
      }
    } else if (error instanceof ServerError && error.code === 'unreachable') {
      // 启动请求可能已经到了服务器：用同一个 id 兜一个取消动作，免得留下卡住的作业
      control.cancelRemote = () => job('DELETE', `/${jobId}`)
    }
    throw error
  }

  const resource = `/${jobStatus.id}`
  control.cancelRemote = () => job('DELETE', resource)
  signal.throwIfAborted()

  try {
    if (jobStatus.status === 'cancelled') {
      throw new ServerError('upload-closed', '这次上传已过期或被取消了，需要重新开始。')
    }

    if (jobStatus.status === 'pending') {
      const indexes = new Map(manifest.map((file, index) => [file.path, index]))
      const received = new Set(jobStatus.received)
      const needed = new Set(jobStatus.needed)
      progress.totalFiles = needed.size
      progress.totalBytes = jobStatus.needed.reduce((sum, index) => sum + (manifest[index]?.size ?? 0), 0)
      progress.doneFiles = received.size
      progress.sentBytes = jobStatus.receivedBytes

      for (const batch of batches) {
        signal.throwIfAborted()
        const pendingIndexes = batch
          .map((path) => indexes.get(path))
          .filter((index): index is number => index !== undefined && needed.has(index) && !received.has(index))
        if (pendingIndexes.length === 0) continue
        const files: Array<{ index: number; path: string; bytes: Uint8Array }> = []
        for (const index of pendingIndexes) {
          const { path } = manifest[index] as UploadManifestFile
          files.push({ index, path, bytes: (await readVerified(path)).bytes })
        }
        const batchBytes = files.reduce((sum, file) => sum + file.bytes.length, 0)
        let remaining = files
        await retry(async () => {
          signal.throwIfAborted()
          if (remaining.length === 0) return
          try {
            await stageWorkspaceFiles(base, apiKey, projectId, jobStatus.id, remaining, {
              ...options,
              timeoutMs: timeoutForBytes(batchBytes),
            })
          } catch (error) {
            if (error instanceof ServerError && error.code === 'unreachable') {
              // 批次 ACK 丢了：问服务器到底收下了哪些，只补它没收的（已验证的不重传）
              const status = await job('GET', resource)
              const verified = new Set(status?.received ?? [])
              remaining = remaining.filter((file) => !verified.has(file.index))
              if (remaining.length === 0) return
            }
            throw error
          }
        })
        progress.doneFiles += files.length
        progress.sentBytes += batchBytes
      }

      signal.throwIfAborted()
      // ④ 提交：这一步之后服务器可能已经落盘 —— 界面从这一刻起不许再"取消"
      control.finishing = true
      try {
        const completed = await retry(() => job('POST', `${resource}/complete`, undefined, 120_000))
        if (!completed) throw new ServerError('bad-response', '服务器没有返回提交结果。')
        jobStatus = completed
      } catch (error) {
        if (error instanceof ServerError && error.code === 'unreachable') {
          const status = await job('GET', resource)
          if (status?.status === 'completed' && status.receipt) jobStatus = status
          else throw error
        } else {
          throw error
        }
      } finally {
        control.finishing = false
      }
    }

    if (jobStatus.status !== 'completed' || !jobStatus.receipt) {
      throw new ServerError('bad-response', '服务器尚未确认这次上传已完成。')
    }
    control.cancelRemote = undefined
    return { jobId, receipt: jobStatus.receipt, oversize, manifest }
  } catch (error) {
    /*
     * ⚠️ **失败要收尾**：pending 作业会让这台工作区的所有写操作都 409（服务器
     * `ensure_workspace_idle`），最多卡 1 天（租约），而用户根本不知道有这个作业。
     * 所以任何终态失败都尽力 `DELETE` 一次；失败也只是"卡住"，不该盖掉真正的错误。
     */
    const cancel = control.cancelRemote
    control.cancelRemote = undefined
    if (cancel && !(error instanceof ServerError && error.code === 'upload-closed')) {
      try {
        await cancel()
      } catch {
        /* 收尾失败不覆盖原始错误 */
      }
    }
    throw error
  }
}
