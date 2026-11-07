/**
 * ConvFusion 2.0 — 研究决策辅助（DCRM，v0.7.0）
 *
 * ## 它解决的问题
 *
 * 研究过程中的"下一步做什么 / 证据够不够 / 这两个主张矛不矛盾 / 方向要不要改"，
 * 是 Agent 与研究者每轮都在做的判断，却一直是**纯自由发挥**：没有第二个模型看过它，
 * 也没有任何记录说明"当时参考了什么"。DCRM 就是那个"第二意见"：
 * 把一个**有界**的决策问题（4 类之一）+ **2–26 个带标签的候选项** + **当前研究状态的投影**
 * 发给 ConvFusion 决策服务，取回候选项的**候选内归一化概率**与推荐项。
 *
 * ## 三条不可越过的边界（照 codex `3c661e0` 的最终形态，不要复活 39c2cc8 的落盘）
 *
 * 1. **咨询不改研究状态**：不生成 Decision / Evidence / Claim，不动 `research-state.md`。
 * 2. **咨询不是权限**：概率是"候选集合内归一化分数"，**不是校准置信度**，
 *    不能当证据、不能授权操作、不能绕过评审。
 * 3. **跳过 ≠ 用过**：`status:'skipped'` 永远不能被表述成"模型影响了这个决策"。
 *
 * ## 留痕（v0.7.0 用户拍板：要留痕）
 *
 * 每次**真正拿到建议**的咨询写一条 `research/decision-assists/A###.json`：
 * 发出去的状态投影、候选项、返回的概率与推荐、以及（稍后）**采纳情况**。
 * 为什么是"稍后"：工具在调用时并不知道 Agent 是否会采纳 —— 采纳判断在拿到建议之后，
 * 由 Agent 用 `action:'annotate'` 回填。
 *
 * ⚠️ 留痕是**尽力而为**的：工作区不可写（只读任务、文件沙箱收紧）时咨询照常返回结果，
 * 只带上 `record_warning`。这是 v0.7.0 与 codex 首发实现的关键差别 —— codex 在
 * `39c2cc8` 里把咨询结果写盘、又在 `3c661e0` 里整段撤掉（落盘会让只读会话无法咨询）。
 * 本模块把两件事拆开：**咨询永远可做，留痕能做就做**。
 *
 * ## 门禁顺序（顺序即语义，一条都不能少）
 *
 * ```text
 * disabled → not_logged_in → no_research_workspace → invalid_input → input_too_long
 *          → cache(60s) → 在途合并 → 网络 → 事后设置校验 → （尽力）留痕
 * ```
 *
 * 前四道门**不发任何网络请求**（`verify-decision-assist.mjs` 逐条钉住）：
 * 关着开关还联网是隐私事故；没登录还联网是把"未配置"伪装成"服务异常"。
 */
import { type Config } from '../config.js';
import { type ServerRequestOptions } from '../server-client.js';
/** 服务端支持的 4 类决策（与 `app/schemas/decision_model.py` 的 `Literal` 一一对应）。 */
export declare const DECISION_TYPES: readonly ["C1_next_action_selection", "B1_evidence_sufficiency", "B2_claim_evidence_consistency", "D1_direction_decision"];
export type DecisionType = (typeof DECISION_TYPES)[number];
/** 采纳判断的三种取值（与提示词里的"采纳 / 部分采纳 / 不采纳"一致）。 */
export declare const ADOPTION_STATUSES: readonly ["adopt", "partial", "reject"];
export type AdoptionStatus = (typeof ADOPTION_STATUSES)[number];
/** 咨询记录目录（相对研究根）。 */
export declare const DECISION_ASSISTS_DIR = "research/decision-assists";
/**
 * 当前研究状态的**决策投影**（发往服务端的那一份，逐字段有界）。
 *
 * `truncated_fields` 是给 Agent 看的：建议基于**被截断**的状态时，它得知道，
 * 否则会把"模型没看到那条证据"误读成"模型认为那条证据不重要"。
 */
export declare function decisionState(workspace: string): {
    research_state: {
        research_question: string;
        hypothesis: string;
        method: string;
        experiments: string[];
        evidence: string[];
        claims: string[];
        history: string[];
    };
    truncated_fields: string[];
    sources: string[];
    state_version: string | null;
};
/**
 * 回填采纳情况（v0.7.0 的"留痕"第二步）。
 *
 * 为什么单独一个动作：工具被调用时**不知道** Agent 会不会采纳；而"建议 → 采纳/不采纳 + 依据"
 * 才是研究者日后回看时真正要找的东西。重新标注会保留旧值到 `adoption_history`，不覆盖历史。
 */
export declare function annotateDecisionAssist(workspace: string, id: string, adoption: AdoptionStatus, note: string): {
    ok: true;
    id: string;
    record: string;
    adoption: Record<string, unknown>;
} | {
    error: string;
};
/**
 * 造一个**有内存缓存**的咨询函数（每个宿主一份，进程内共享）。
 *
 * 缓存/合并/事后校验三件事都是为了让同一决策**只付一次推理**：
 * - 60 秒内同 key → 直接返回（`cached:true`）；
 * - 同 key 正在飞 → 共享那个 Promise（`shared_request:true`），不重复发请求；
 * - 返回后设置（开关 / 账号 / 服务器）变了 → **丢弃**结果（`settings_changed`），
 *   否则"刚关掉开关，界面还弹了建议"。
 */
export declare function createDecisionAssistant(getConfig: () => Partial<Config>, env?: NodeJS.ProcessEnv, net?: ServerRequestOptions): (workspace: string, args: Record<string, unknown>, onRequest?: () => void) => Promise<Record<string, unknown>>;
//# sourceMappingURL=decision-assist.d.ts.map