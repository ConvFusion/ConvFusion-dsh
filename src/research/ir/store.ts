/**
 * ConvFusion v0.5.6 — IR Store（持久化 / 版本 / Decision Trace）
 *
 * ## 落盘布局（§9 / §10 / §18）
 *
 * ```text
 * research/ir/
 * ├── IR001.json                   ← 当前修订（canonical，machine-facing JSON）
 * ├── .history/IR001.rev-002.json  ← 被取代的修订快照（不删除 —— Historical Integrity）
 * ├── states/S001.json             ← State Object（stateId / parentStateId / provenance）
 * └── trace.jsonl                  ← Decision Trace（D → IR → Execution → E → S）
 * ```
 *
 * ## 为什么 IR 用 JSON 而不是 Markdown
 *
 * IR 是 machine-facing 层（规格 §5 / §21）；用户接口是 Markdown
 * （`research-state.md` / `plans/*.md`），两者分工不混。Typed IR 落 JSON，
 * Schema 校验与 Delta 才有确定的对象可操作。
 *
 * ## 版本纪律（§10）
 *
 * 每次合法修订都**先归档旧版再写新版**，绝不覆盖删除。provenance graph
 * 通过 `states/S###.json` 的 `parentStateId` 链起来，可回答
 * "为什么现在的研究方向变成这样"。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RESEARCH_DIR } from '../research-data.js'
import type { IRTraceEntry, IRStateObject, ResearchIR } from './types.js'

/* ════════════════════════════════════════════════════════════════════════
 * 路径与 ID
 * ════════════════════════════════════════════════════════════════════════ */

/** IR 数据根（相对研究根）。 */
export const IR_DIR = `${RESEARCH_DIR}/ir`
/** 修订快照目录。 */
export const IR_HISTORY_DIR = `${IR_DIR}/.history`
/** State Object 目录。 */
export const IR_STATES_DIR = `${IR_DIR}/states`
/** Decision Trace 文件。 */
export const IR_TRACE_FILE = `${IR_DIR}/trace.jsonl`

/** IR id：`IR001`。 */
export function makeIrId(n: number): string {
  return `IR${String(n).padStart(3, '0')}`
}

/** 解析 IR id → 序号；非法返回 undefined。 */
export function parseIrId(id: string): number | undefined {
  const m = id.trim().match(/^IR(\d{1,4})$/i)
  return m ? Number(m[1]) : undefined
}

/** State id：`S001`。 */
export function makeStateId(n: number): string {
  return `S${String(n).padStart(3, '0')}`
}

/** 解析 State id → 序号；非法返回 undefined。 */
export function parseStateId(id: string): number | undefined {
  const m = id.trim().match(/^S(\d{1,4})$/i)
  return m ? Number(m[1]) : undefined
}

/** 写盘错误（与 claims.ts 的 IdWriteError 同形，调用方统一处理）。 */
export interface IRWriteError {
  error: string
}

export function isIRWriteError(v: unknown): v is IRWriteError {
  return Boolean(v) && typeof v === 'object' && typeof (v as IRWriteError).error === 'string'
}

function irFile(workspace: string, id: string): string {
  return join(workspace, IR_DIR, `${id.toUpperCase()}.json`)
}

function historyFile(workspace: string, id: string, revision: number): string {
  return join(workspace, IR_HISTORY_DIR, `${id.toUpperCase()}.rev-${String(revision).padStart(3, '0')}.json`)
}

function stateFile(workspace: string, stateId: string): string {
  return join(workspace, IR_STATES_DIR, `${stateId.toUpperCase()}.json`)
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

function listJson(dir: string, pattern: RegExp): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => pattern.test(f))
      .sort()
  } catch {
    return []
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * IR 读写
 * ════════════════════════════════════════════════════════════════════════ */

/** 列出全部 IR（摘要）。 */
export function listIRs(workspace: string): Array<{
  id: string
  revision: number
  decisionType: string
  title: string
  requirements: number
  satisfied: number
}> {
  const dir = join(workspace, IR_DIR)
  return listJson(dir, /^IR\d{3,4}\.json$/i).flatMap((f) => {
    const ir = readJson<ResearchIR>(join(dir, f))
    if (!ir?.id) return []
    const satisfied = ir.evidenceRequirements.filter((r) => (r.satisfiedBy ?? []).length > 0).length
    return [
      {
        id: ir.id,
        revision: ir.revision,
        decisionType: ir.decision?.type ?? '',
        title: ir.research?.title ?? '',
        requirements: ir.evidenceRequirements.length,
        satisfied,
      },
    ]
  })
}

/** 读一个 IR（当前修订）。 */
export function readIR(workspace: string, id: string): ResearchIR | undefined {
  const norm = id.trim().toUpperCase()
  if (!parseIrId(norm)) return undefined
  return readJson<ResearchIR>(irFile(workspace, norm))
}

/** 读一个历史修订。 */
export function readIRRevision(workspace: string, id: string, revision: number): ResearchIR | undefined {
  return readJson<ResearchIR>(historyFile(workspace, id, revision))
}

/** 列出一个 IR 的历史修订号（升序，不含当前修订）。 */
export function listIRRevisions(workspace: string, id: string): number[] {
  const norm = id.trim().toUpperCase()
  return listJson(join(workspace, IR_HISTORY_DIR), new RegExp(`^${norm}\\.rev-\\d{3,4}\\.json$`, 'i')).flatMap((f) => {
    const m = f.match(/\.rev-(\d{3,4})\.json$/i)
    return m ? [Number(m[1])] : []
  })
}

/**
 * 保存 IR。
 *
 * - 新 IR：分配 id（未指定时取下一个 `IR###`）并落盘；
 * - 已存在的 IR：先把当前修订归档到 `.history/`（§10 不删除性覆盖），再写新修订。
 */
export function saveIR(
  workspace: string,
  ir: ResearchIR,
): ResearchIR | IRWriteError {
  const dir = join(workspace, IR_DIR)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(workspace, IR_HISTORY_DIR), { recursive: true })

  const existing = ir.id ? readIR(workspace, ir.id) : undefined
  const id = ir.id?.trim().toUpperCase() || nextIrId(workspace)
  if (!parseIrId(id)) return { error: `非法 IR id：${ir.id}（应为 IR001 形式）` }

  if (existing) {
    // 归档旧修订（内容以旧文件为准 —— 不相信调用方传来的旧 revision）
    writeFileSync(historyFile(workspace, id, existing.revision), `${JSON.stringify(existing, null, 2)}\n`, 'utf8')
  }
  const saved: ResearchIR = { ...ir, id }
  writeFileSync(irFile(workspace, id), `${JSON.stringify(saved, null, 2)}\n`, 'utf8')
  return saved
}

/** 下一个 IR id（按目录里的文件名取最大编号，损坏 JSON 也不丢号）。 */
export function nextIrId(workspace: string): string {
  const nums = listJson(join(workspace, IR_DIR), /^IR\d{3,4}\.json$/i).map((f) => {
    const m = f.match(/^IR(\d{3,4})\.json$/i)
    return m ? Number(m[1]) : 0
  })
  return makeIrId(Math.max(0, ...nums) + 1)
}

/* ════════════════════════════════════════════════════════════════════════
 * State Object（§9 / §10）
 * ════════════════════════════════════════════════════════════════════════ */

/** 写一个 State Object（状态只增，不覆盖）。 */
export function writeState(workspace: string, state: IRStateObject): IRStateObject | IRWriteError {
  const dir = join(workspace, IR_STATES_DIR)
  mkdirSync(dir, { recursive: true })
  const norm = state.stateId.trim().toUpperCase()
  if (!parseStateId(norm)) return { error: `非法 State id：${state.stateId}（应为 S001 形式）` }
  const file = stateFile(workspace, norm)
  if (existsSync(file)) return { error: `State \`${norm}\` 已存在（状态不可覆盖）。` }
  writeFileSync(file, `${JSON.stringify({ ...state, stateId: norm }, null, 2)}\n`, 'utf8')
  return { ...state, stateId: norm }
}

/** 列出全部 State（按 id 升序）。 */
export function listStates(workspace: string): IRStateObject[] {
  const dir = join(workspace, IR_STATES_DIR)
  return listJson(dir, /^S\d{3,4}\.json$/i)
    .flatMap((f) => {
      const s = readJson<IRStateObject>(join(dir, f))
      return s?.stateId ? [s] : []
    })
    .sort((a, b) => (parseStateId(a.stateId) ?? 0) - (parseStateId(b.stateId) ?? 0))
}

/** 最近一个 State（链头）。 */
export function latestState(workspace: string): IRStateObject | undefined {
  const all = listStates(workspace)
  return all[all.length - 1]
}

/** 下一个 State id。 */
export function nextStateId(workspace: string): string {
  const nums = listStates(workspace).map((s) => parseStateId(s.stateId) ?? 0)
  return makeStateId(Math.max(0, ...nums) + 1)
}

/* ════════════════════════════════════════════════════════════════════════
 * Decision Trace（§18）
 * ════════════════════════════════════════════════════════════════════════ */

/** 追加一行 trace。 */
export function appendTrace(workspace: string, entry: IRTraceEntry): void {
  const dir = join(workspace, IR_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(workspace, IR_TRACE_FILE), `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' })
}

/** 读取 trace（时间序）。 */
export function readTrace(workspace: string): IRTraceEntry[] {
  try {
    return readFileSync(join(workspace, IR_TRACE_FILE), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as IRTraceEntry]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}
