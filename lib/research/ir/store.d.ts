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
import type { IRTraceEntry, IRStateObject, ResearchIR } from './types.js';
/** IR 数据根（相对研究根）。 */
export declare const IR_DIR = "research/ir";
/** 修订快照目录。 */
export declare const IR_HISTORY_DIR = "research/ir/.history";
/** State Object 目录。 */
export declare const IR_STATES_DIR = "research/ir/states";
/** Decision Trace 文件。 */
export declare const IR_TRACE_FILE = "research/ir/trace.jsonl";
/** IR id：`IR001`。 */
export declare function makeIrId(n: number): string;
/** 解析 IR id → 序号；非法返回 undefined。 */
export declare function parseIrId(id: string): number | undefined;
/** State id：`S001`。 */
export declare function makeStateId(n: number): string;
/** 解析 State id → 序号；非法返回 undefined。 */
export declare function parseStateId(id: string): number | undefined;
/** 写盘错误（与 claims.ts 的 IdWriteError 同形，调用方统一处理）。 */
export interface IRWriteError {
    error: string;
}
export declare function isIRWriteError(v: unknown): v is IRWriteError;
/** 列出全部 IR（摘要）。 */
export declare function listIRs(workspace: string): Array<{
    id: string;
    revision: number;
    decisionType: string;
    title: string;
    requirements: number;
    satisfied: number;
}>;
/** 读一个 IR（当前修订）。 */
export declare function readIR(workspace: string, id: string): ResearchIR | undefined;
/** 读一个历史修订。 */
export declare function readIRRevision(workspace: string, id: string, revision: number): ResearchIR | undefined;
/** 列出一个 IR 的历史修订号（升序，不含当前修订）。 */
export declare function listIRRevisions(workspace: string, id: string): number[];
/**
 * 保存 IR。
 *
 * - 新 IR：分配 id（未指定时取下一个 `IR###`）并落盘；
 * - 已存在的 IR：先把当前修订归档到 `.history/`（§10 不删除性覆盖），再写新修订。
 */
export declare function saveIR(workspace: string, ir: ResearchIR): ResearchIR | IRWriteError;
/** 下一个 IR id（按目录里的文件名取最大编号，损坏 JSON 也不丢号）。 */
export declare function nextIrId(workspace: string): string;
/** 写一个 State Object（状态只增，不覆盖）。 */
export declare function writeState(workspace: string, state: IRStateObject): IRStateObject | IRWriteError;
/** 列出全部 State（按 id 升序）。 */
export declare function listStates(workspace: string): IRStateObject[];
/** 最近一个 State（链头）。 */
export declare function latestState(workspace: string): IRStateObject | undefined;
/** 下一个 State id。 */
export declare function nextStateId(workspace: string): string;
/** 追加一行 trace。 */
export declare function appendTrace(workspace: string, entry: IRTraceEntry): void;
/** 读取 trace（时间序）。 */
export declare function readTrace(workspace: string): IRTraceEntry[];
//# sourceMappingURL=store.d.ts.map