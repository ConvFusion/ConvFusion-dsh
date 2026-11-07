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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveConvFusionApiKey, resolveServerUrl } from '../config.js';
import { fetchDecisionAssist } from '../server-client.js';
import { loadProjectFile } from './project.js';
import { loadResearchState } from './research-state.js';
import { RESEARCH_DIR } from './research-data.js';
import { isResearchWorkspace } from './workspace.js';
/** 服务端支持的 4 类决策（与 `app/schemas/decision_model.py` 的 `Literal` 一一对应）。 */
export const DECISION_TYPES = [
    'C1_next_action_selection',
    'B1_evidence_sufficiency',
    'B2_claim_evidence_consistency',
    'D1_direction_decision',
];
/** 采纳判断的三种取值（与提示词里的"采纳 / 部分采纳 / 不采纳"一致）。 */
export const ADOPTION_STATUSES = ['adopt', 'partial', 'reject'];
/** 咨询记录目录（相对研究根）。 */
export const DECISION_ASSISTS_DIR = `${RESEARCH_DIR}/decision-assists`;
/* ════════════════════════════════════════════════════════════════════════
 * 状态投影
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 每个标量维度的字符预算。
 *
 * 为什么是 500：服务端把拼好的 prompt 限制在 **2048 token**，超了直接 422（不截断、不生成）。
 * 7 个维度 × 500 字符 ≈ 3500 字符，中文约 1 token/字，加上问题与候选项仍在预算内；
 * 再多就会把"输入太长"变成常规失败路径。
 */
const FIELD_CHARS = 500;
/** 数组维度里**单项**的字符预算（4 项 × 200 = 500，总量不变、信息更细）。 */
const LIST_ITEM_CHARS = 200;
/** 数组维度最多发几项（服务端允许 20；这里刻意少，因为 prompt 预算才是真约束）。 */
const LIST_ITEMS = 4;
/** 按**字符**（不是 UTF-16 码元）截断，超长时报告 `clipped`。 */
function clip(value, limit) {
    const chars = Array.from(value.trim());
    if (chars.length <= limit)
        return { text: chars.join(''), clipped: false };
    return { text: chars.slice(0, limit).join(''), clipped: true };
}
/**
 * 数组维度投影：按行切，最多 {@link LIST_ITEMS} 项、每项 ≤{@link LIST_ITEM_CHARS}、
 * 总量 ≤{@link FIELD_CHARS}。
 *
 * 为什么不照抄 codex 的"整个维度发一条字符串"：那会把"证据/主张是**列表**"这件事丢掉，
 * 模型看到的是一段被腰斩的散文。切项不增加总预算，只是把同样的字符用在该用的地方。
 */
function projectList(raw, budget) {
    const lines = (raw ?? '')
        .split('\n')
        .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
        .filter(Boolean);
    if (lines.length === 0)
        return { items: [], clipped: false };
    const items = [];
    let used = 0;
    let clipped = lines.length > LIST_ITEMS;
    for (const line of lines.slice(0, LIST_ITEMS)) {
        const remain = budget - used;
        if (remain <= 0) {
            clipped = true;
            break;
        }
        const piece = clip(line, Math.min(LIST_ITEM_CHARS, remain));
        if (piece.clipped)
            clipped = true;
        items.push(piece.text);
        used += Array.from(piece.text).length;
    }
    return { items, clipped };
}
/**
 * 当前研究状态的**决策投影**（发往服务端的那一份，逐字段有界）。
 *
 * `truncated_fields` 是给 Agent 看的：建议基于**被截断**的状态时，它得知道，
 * 否则会把"模型没看到那条证据"误读成"模型认为那条证据不重要"。
 */
export function decisionState(workspace) {
    const state = loadResearchState(workspace);
    const dimensions = state?.dimensions ?? {};
    const project = loadProjectFile(workspace);
    const truncated = [];
    const one = (key, value) => {
        const { text, clipped } = clip(value ?? '', FIELD_CHARS);
        if (clipped)
            truncated.push(key);
        return text;
    };
    const list = (key, value) => {
        const { items, clipped } = projectList(value, FIELD_CHARS);
        if (clipped)
            truncated.push(key);
        return items;
    };
    // 研究问题的回退链：状态里的显式维度 → Problem → 项目定义里的问题列表 → 主题
    const questionSource = dimensions['Research Questions'] ||
        dimensions.Problem ||
        (project?.questions ?? []).join('\n') ||
        project?.topic ||
        '';
    return {
        research_state: {
            research_question: one('research_question', questionSource),
            hypothesis: one('hypothesis', dimensions.Hypotheses),
            method: one('method', dimensions.Method),
            experiments: list('experiments', dimensions.Experiments),
            evidence: list('evidence', dimensions.Evidence),
            claims: list('claims', dimensions.Claims),
            history: list('history', dimensions.Decisions),
        },
        truncated_fields: truncated,
        sources: ['project.md', 'research-state.md'].filter((file) => existsSync(join(workspace, file))),
        state_version: state?.version ?? null,
    };
}
/** prompt 预算：服务端硬限 2048 token，留 10% 余量给分隔符与模板文本。 */
const PROMPT_TOKEN_BUDGET = 1800;
/**
 * 估算 token 数（**保守**）：CJK 记 1 token/字，其余记 ~1 token / 3.5 字符。
 *
 * 这里不可能精确（不同 tokenizer 不同），目的只是**在发请求前拦住明显超预算的输入**：
 * 服务端 422 `DECISION_INPUT_TOO_LONG` 会被上层折成 `service_unavailable`，
 * 对 Agent 是"服务挂了"的错误归因 —— 失败要响在正确的地方。
 */
function estimateTokens(text) {
    let cjk = 0;
    let other = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        if (code >= 0x2e80)
            cjk += 1;
        else
            other += 1;
    }
    return cjk + Math.ceil(other / 3.5);
}
/** 校验并归一工具入参；任何一条不满足都返回 `null`（= `invalid_input`）。 */
function readRequest(args) {
    const type = args.decision_type;
    if (typeof type !== 'string' || !DECISION_TYPES.includes(type))
        return null;
    const question = typeof args.decision_question === 'string' ? args.decision_question.trim() : '';
    // 服务端允许 2000；这里收得更紧（1000）—— 问题本来就该是一句话，超长说明候选没想清楚。
    if (!question || Array.from(question).length > 1000)
        return null;
    const raw = args.candidate_options;
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > 26)
        return null;
    const options = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object')
            return null;
        const option = item;
        const label = typeof option.label === 'string' ? option.label.trim() : '';
        const text = typeof option.text === 'string' ? option.text.trim() : '';
        if (!label || Array.from(label).length > 64)
            return null;
        // 服务端允许 1000；这里同样收紧到 500（一个候选项就是一句话）。
        if (!text || Array.from(text).length > 500)
            return null;
        options.push({ label, text });
    }
    if (new Set(options.map((o) => o.label)).size !== options.length)
        return null;
    return { decision_type: type, decision_question: question, candidate_options: options };
}
/**
 * 严格解析服务端响应（**逐字段白名单**）。
 *
 * 为什么这么刁钻：工具返回值会直接进模型上下文。上游若返回一段任意文本，宽松解析就等于
 * 让"服务端的任何东西"变成"研究建议"。这里只认我们声明的那些字段，并要求
 * 概率和 = 1、推荐项 = 最大项、top3 = 排序前 3 —— 任何不一致都按不可用处理。
 */
function parsePrediction(raw, type, options) {
    const p = raw;
    if (!p || p.status !== 'used' || p.decision_type !== type)
        throw new Error('Invalid decision response');
    if (!Array.isArray(p.probabilities) || p.probabilities.length !== options.length) {
        throw new Error('Invalid decision response');
    }
    if (typeof p.model !== 'string' || !p.model)
        throw new Error('Invalid decision response');
    if (!/^[a-f0-9]{64}$/.test(String(p.input_hash ?? '')))
        throw new Error('Invalid decision response');
    if (!Number.isInteger(p.input_tokens) || p.input_tokens < 1 || p.input_tokens > 2048) {
        throw new Error('Invalid decision response');
    }
    if (p.probability_kind !== 'candidate_normalized_uncalibrated')
        throw new Error('Invalid decision response');
    let sum = 0;
    for (const [i, row] of p.probabilities.entries()) {
        if (!row || row.label !== options[i]?.label || row.text !== options[i]?.text) {
            throw new Error('Invalid probabilities');
        }
        if (!Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1) {
            throw new Error('Invalid probabilities');
        }
        sum += row.probability;
    }
    const order = p.probabilities
        .map((row, i) => ({ ...row, i }))
        .sort((a, b) => b.probability - a.probability || a.i - b.i);
    if (Math.abs(sum - 1) > 1e-6)
        throw new Error('Inconsistent probabilities');
    if (p.predicted_label !== order[0]?.label || p.predicted_text !== order[0]?.text) {
        throw new Error('Inconsistent ranking');
    }
    const top3 = order.slice(0, 3).map((row) => row.label);
    if (JSON.stringify(p.top3_labels) !== JSON.stringify(top3))
        throw new Error('Inconsistent ranking');
    // 显式挑字段重建：任意上游数据都进不了记录与工具输出
    return {
        status: 'used',
        decision_type: type,
        predicted_label: String(p.predicted_label),
        predicted_text: String(p.predicted_text),
        probabilities: p.probabilities.map((row) => ({
            label: row.label,
            text: row.text,
            probability: row.probability,
        })),
        top3_labels: top3,
        model: p.model,
        input_tokens: p.input_tokens,
        input_hash: String(p.input_hash),
        probability_kind: p.probability_kind,
    };
}
/* ════════════════════════════════════════════════════════════════════════
 * 留痕（尽力而为）
 * ════════════════════════════════════════════════════════════════════════ */
/** 取下一个 `A###` 编号（扫目录，只认本目录自己的名字）。 */
function nextAssistId(dir) {
    let max = 0;
    try {
        for (const name of readdirSync(dir)) {
            const m = name.match(/^A(\d{3,4})\.json$/);
            if (m)
                max = Math.max(max, Number(m[1]));
        }
    }
    catch {
        /* 目录还不存在 → 从 A001 开始 */
    }
    return `A${String(max + 1).padStart(3, '0')}`;
}
/**
 * 写一条咨询记录（`flag: 'wx'` + 冲突重试，避免并发两次咨询抢同一个编号）。
 *
 * 失败**不抛**：只读任务、只读文件系统、权限收紧都不该让一次咨询失效。
 */
function writeConsultRecord(workspace, input) {
    const dir = join(workspace, DECISION_ASSISTS_DIR);
    try {
        mkdirSync(dir, { recursive: true });
    }
    catch {
        return { warning: '决策记录未写入：研究根不可写。咨询本身不受影响。' };
    }
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const id = nextAssistId(dir);
        const abs = join(dir, `${id}.json`);
        const payload = {
            id,
            created_at: now,
            server: input.server,
            decision_type: input.request.decision_type,
            decision_question: input.request.decision_question,
            candidate_options: input.request.candidate_options,
            research_state: input.projection.research_state,
            truncated_fields: input.projection.truncated_fields,
            sources: input.projection.sources,
            state_version: input.projection.state_version,
            response: input.prediction,
            // 采纳判断在拿到建议**之后**由 Agent 回填（`action:'annotate'`）。
            adoption: null,
        };
        try {
            writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
            return { id, record: `${DECISION_ASSISTS_DIR}/${id}.json` };
        }
        catch (e) {
            if (e.code !== 'EEXIST') {
                return { warning: '决策记录未写入：写文件失败。咨询本身不受影响。' };
            }
            /* 编号被并发占用 → 重新扫一次，换下一个号 */
        }
    }
    return { warning: '决策记录未写入：并发编号冲突。咨询本身不受影响。' };
}
/**
 * 回填采纳情况（v0.7.0 的"留痕"第二步）。
 *
 * 为什么单独一个动作：工具被调用时**不知道** Agent 会不会采纳；而"建议 → 采纳/不采纳 + 依据"
 * 才是研究者日后回看时真正要找的东西。重新标注会保留旧值到 `adoption_history`，不覆盖历史。
 */
export function annotateDecisionAssist(workspace, id, adoption, note) {
    if (!/^A\d{3,4}$/.test(id))
        return { error: `未知的咨询编号「${id}」（形如 A001）。` };
    if (!ADOPTION_STATUSES.includes(adoption)) {
        return { error: `adoption 必须是 ${ADOPTION_STATUSES.join(' / ')} 之一。` };
    }
    const trimmed = note.trim();
    if (!trimmed)
        return { error: '请给出采纳依据（note）——没有依据的采纳判断不是可追溯的记录。' };
    if (Array.from(trimmed).length > 2000)
        return { error: 'note 过长（上限 2000 字符）。' };
    const rel = `${DECISION_ASSISTS_DIR}/${id}.json`;
    const abs = join(workspace, rel);
    if (!existsSync(abs))
        return { error: `找不到咨询记录 ${rel}。` };
    let record;
    try {
        record = JSON.parse(readFileSync(abs, 'utf8'));
    }
    catch {
        return { error: `咨询记录 ${rel} 无法解析。` };
    }
    const at = new Date().toISOString();
    const previous = record.adoption;
    const next = { status: adoption, note: trimmed, annotated_at: at };
    const history = Array.isArray(record.adoption_history) ? [...record.adoption_history] : [];
    if (previous)
        history.push(previous);
    const updated = {
        ...record,
        adoption: next,
        ...(history.length > 0 ? { adoption_history: history } : {}),
        updated_at: at,
    };
    const tmp = `${abs}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, `${JSON.stringify(updated, null, 2)}\n`);
        renameSync(tmp, abs);
    }
    catch {
        return { error: `写入 ${rel} 失败（研究根不可写？）。` };
    }
    return { ok: true, id, record: rel, adoption: next };
}
/* ════════════════════════════════════════════════════════════════════════
 * 咨询主体
 * ════════════════════════════════════════════════════════════════════════ */
const SKIP_INSTRUCTION = 'Continue the existing workflow without decision assistance. No advice was used and nothing was written.';
const USED_INSTRUCTION = [
    'Tell the user in chat the DCRM recommendation, then state whether you adopt, partially adopt or reject it,',
    'with a short reason grounded in the actual state/evidence, using a prominent **DCRM 决策辅助** label.',
    'When the workspace is writable, record that judgement with action:"annotate", the returned id, an adoption',
    'value and the reason; when writes are prohibited, report it in chat instead.',
    'This consultation never writes decisions, evidence or claims by itself.',
    'Candidate probabilities are candidate-normalized, not calibrated confidence: advisory only, never a',
    'permission, a substitute for evidence, or a bypass of review.',
].join(' ');
function skipped(reason) {
    return { ok: true, status: 'skipped', reason, instruction: SKIP_INSTRUCTION };
}
/**
 * 造一个**有内存缓存**的咨询函数（每个宿主一份，进程内共享）。
 *
 * 缓存/合并/事后校验三件事都是为了让同一决策**只付一次推理**：
 * - 60 秒内同 key → 直接返回（`cached:true`）；
 * - 同 key 正在飞 → 共享那个 Promise（`shared_request:true`），不重复发请求；
 * - 返回后设置（开关 / 账号 / 服务器）变了 → **丢弃**结果（`settings_changed`），
 *   否则"刚关掉开关，界面还弹了建议"。
 */
export function createDecisionAssistant(getConfig, env = process.env, net = {}) {
    const cache = new Map();
    const pending = new Map();
    return async (workspace, args, onRequest) => {
        const config = getConfig();
        if (config.decisionAssistEnabled === false) {
            // 关掉开关后旧结果**必须**失效，否则"关了还命中缓存"
            cache.clear();
            return skipped('disabled');
        }
        const apiKey = resolveConvFusionApiKey(config, env);
        if (!apiKey) {
            cache.clear();
            return skipped('not_logged_in');
        }
        if (!isResearchWorkspace(workspace))
            return skipped('no_research_workspace');
        const request = readRequest(args);
        if (!request)
            return skipped('invalid_input');
        const projection = decisionState(workspace);
        const body = {
            decision_type: request.decision_type,
            decision_question: request.decision_question,
            candidate_options: request.candidate_options.map((o) => ({ label: o.label, text: o.text })),
            research_state: projection.research_state,
        };
        // 预算守卫：超预算**不发请求**，返回可读的失败原因（而不是让服务端 422 伪装成服务异常）
        const estimated = estimateTokens([
            ...Object.values(projection.research_state).flatMap((v) => (Array.isArray(v) ? v : [v])),
            body.decision_question,
            ...body.candidate_options.map((o) => `A = ${o.text}`),
        ].join('\n'));
        if (estimated > PROMPT_TOKEN_BUDGET) {
            const skippedLong = skipped('input_too_long');
            skippedLong.estimated_tokens = estimated;
            return skippedLong;
        }
        const base = resolveServerUrl(config, env).url;
        const key = createHash('sha256')
            .update(JSON.stringify([workspace, base, createHash('sha256').update(apiKey).digest('hex'), body, projection.state_version]))
            .digest('hex');
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < 60_000)
            return { ...hit.value, cached: true };
        const active = pending.get(key);
        if (active) {
            const shared = await active;
            return shared.status === 'used' ? { ...shared, shared_request: true } : shared;
        }
        const run = (async () => {
            try {
                // 只在**真正要发新请求前**通知一次（展示失败不得影响推理与降级）
                try {
                    onRequest?.();
                }
                catch {
                    /* 可选观察者 */
                }
                const prediction = parsePrediction(await fetchDecisionAssist(base, apiKey, body, net), request.decision_type, body.candidate_options);
                // 等待期间开关/账号/服务器变了 → 结果作废
                const current = getConfig();
                if (current.decisionAssistEnabled === false ||
                    resolveConvFusionApiKey(current, env) !== apiKey ||
                    resolveServerUrl(current, env).url !== base) {
                    return skipped('settings_changed');
                }
                const written = writeConsultRecord(workspace, {
                    server: base,
                    request,
                    projection,
                    prediction,
                });
                const value = {
                    ok: true,
                    ...prediction,
                    cached: false,
                    research_state: projection.research_state,
                    truncated_fields: projection.truncated_fields,
                    sources: projection.sources,
                    state_version: projection.state_version,
                    ...(written.id ? { id: written.id } : {}),
                    ...(written.record ? { record: written.record } : {}),
                    ...(written.warning ? { record_warning: written.warning } : {}),
                    instruction: USED_INSTRUCTION,
                };
                if (cache.size >= 64)
                    cache.delete(cache.keys().next().value);
                cache.set(key, { at: Date.now(), value });
                return value;
            }
            catch {
                // 不重试、不透服务器原文：一次没取到建议 ≠ 服务坏了，按原流程继续
                return skipped('service_unavailable');
            }
        })();
        pending.set(key, run);
        try {
            return await run;
        }
        finally {
            pending.delete(key);
        }
    };
}
//# sourceMappingURL=decision-assist.js.map