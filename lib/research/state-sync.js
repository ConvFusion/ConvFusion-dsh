/**
 * ConvFusion — **Research State 的自进化**（产物 → 状态维度的自动同步）
 *
 * ## 为什么有它
 *
 * 架构定的那条环是：
 *
 * ```text
 * Evidence is produced → Paper evolves → Research State changes → Harness decides again
 * ```
 *
 * 而 Research State 的定义是"**当前整个研究对象的可持续、可更新状态表示**"（State Space）。
 * 但中间那一环以前**没有任何机制**：技能只产出对话正文，产物（`research/decisions/`、
 * `research/claims/`、`research/evidence/`…）与状态之间没人接 —— 实测后果：
 * `research/decisions/` 里有 8 条决策，而 `research-state.md` **连 Decisions 维度都没有**。
 *
 * 这个模块就是那一环：**把已有产物汇总成各维度的"自动段"并写进状态**。
 *
 * ## 三条纪律（都很要紧）
 *
 * ### ① 只写"自动段"，绝不碰人手写的内容
 *
 * 每个维度里，插件维护的部分固定以这一行开头：
 *
 * ```markdown
 * ### Auto-synced artifacts
 * ```
 *
 * 约定：**从这一行到该维度章节末尾，都是插件的地盘，每次同步整段重写**；
 * 人手写的内容放在这一行**之前**，永远不动。
 *
 * 为什么用 `###` 小标题而不是 HTML 注释：**解析器会把注释剥掉**
 * （`extractDimensions` 用 `<!--[\s\S]*?-->` 清洗后存进 `dimensions`），
 * 注释标记过一轮"读-写"就消失了，第二次同步就找不到自己的段、会重复追加。
 * `###` 小标题是正文文本，能活过整个读写循环。
 *
 * ### ② 有变化才写；写就归档旧版本
 *
 * - 汇总结果与现状**逐字相同 → 不写**（否则每次工具调用都涨版本号）；
 * - 要写就**先归档旧版本**（`archiveStateVersion`，带 note）再升版本号 ——
 *   与 `applyStateUpdate` 走同一条路，所以自动写入**同样可回退**（`research/state-history/`）。
 * - 每次写入在 `research/state-proposals/applied.json` 留一条 `auto-synced` 记录。
 *
 * ### ③ 只汇总，不发明
 *
 * 自动段里只有**产物本身的事实**（id、名称、状态、路径、条数）。**不**替研究者写结论、
 * 不判断成熟度、不改 `maturity_*` —— 那是研究方法与人的判断（走 `research_state_propose`）。
 *
 * ## 谁能被自动汇总
 *
 * | 维度 | 产物 |
 * |---|---|
 * | `Decisions` | `research/decisions/D*.md` |
 * | `Claims` | `research/claims/C*.md` |
 * | `Evidence` | `research/evidence/E*.md` |
 * | `Literature` | 来源为文献的 Evidence + `research/literature/fulltext/` 的全文数 |
 * | `Experiments` | `experiments/<name>/results/` 的结果文件 |
 *
 * 其余维度（Problem / Research Questions / Current Knowledge / Innovation / Hypotheses /
 * Method / Risks / Open Questions）**没有结构化产物**，靠方法技能把结论写回
 * （`research_state_propose`；阶段定义里的 `state=` 字段会告诉 Agent 该写哪个）。
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listClaims, listDecisions } from './claims.js';
import { listEvidence } from './evidence.js';
import { isPlaceholderSection, loadProjectFile, updateProjectDefinition, updateProjectTopic, } from './project.js';
import { researchWorkName } from './work-name.js';
import { STATE_DIMENSIONS, } from './research-data.js';
import { appendStateUpdateRecord, archiveStateVersion, bumpStateVersion, ensureResearchState, isStateWriteError, serializeResearchState, } from './research-state.js';
import { FULLTEXT_DIR } from './paper-download.js';
/** 自动段的起始小标题（**稳定契约**：改它就等于让所有旧状态里的自动段失联）。 */
export const STATE_AUTO_HEADING = '### Auto-synced artifacts';
/** 自动段里的维护说明（**普通文本**，不是注释 —— 注释会被解析器剥掉）。 */
const AUTO_NOTE = '*Auto-maintained by ConvFusion: everything from this heading to the end of this section is ' +
    'rewritten on every sync. Keep hand-written content above this line.*';
/** 每个维度最多列多少条（超出只报个数，免得状态被产物清单淹没）。 */
export const STATE_AUTO_MAX_ITEMS = 40;
/** 单行化 + 截断（产物里的名称可能很长，状态里要能扫读）。 */
function oneLine(input, limit = 120) {
    const text = input.replace(/\s+/g, ' ').trim();
    const chars = [...text];
    return chars.length <= limit ? text : `${chars.slice(0, limit - 1).join('')}…`;
}
/** 一句"人可读的摘要"：取第一个非空行。 */
function firstLine(input) {
    return oneLine(input.split(/\r?\n/).find((l) => l.trim()) ?? '');
}
function countResultFiles(workspace, experiment) {
    const dir = join(workspace, 'experiments', experiment, 'results');
    try {
        return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length;
    }
    catch {
        return 0;
    }
}
function listExperimentDirs(workspace) {
    try {
        return readdirSync(join(workspace, 'experiments'), { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .map((e) => e.name)
            .sort();
    }
    catch {
        return [];
    }
}
function countFulltexts(workspace) {
    try {
        return readdirSync(join(workspace, FULLTEXT_DIR)).filter((f) => /\.(pdf|html|txt)$/i.test(f))
            .length;
    }
    catch {
        return 0;
    }
}
/** 产物的"最新改动时刻"（用于判断"状态是不是落后于产物"）。 */
function newestMtimeMs(paths) {
    let newest = 0;
    for (const p of paths) {
        try {
            newest = Math.max(newest, statSync(p).mtimeMs);
        }
        catch {
            /* 读不到就当没有 */
        }
    }
    return newest;
}
/**
 * 汇总一个维度的**自动段内容**（不含小标题；空串 = 这个维度没有可汇总的产物）。
 *
 * 纯读盘、不抛。顺序固定（按 id 排序），所以同一份产物永远得到同一段文本 ——
 * 这是"没变化就不写盘"能成立的前提。
 */
export function deriveAutoBlock(workspace, dimension) {
    const lines = [];
    if (dimension === 'Decisions') {
        const items = listDecisions(workspace).sort((a, b) => a.id.localeCompare(b.id));
        for (const d of items.slice(0, STATE_AUTO_MAX_ITEMS)) {
            // 决策正文常常是多行（分点列出结论）：取**第一行**读起来才像一句话，
            // 折叠成一行再截断会在句子中间断掉
            const head = firstLine(d.decision || d.id);
            lines.push(`- **${d.id}** ${head}${d.status ? ` — \`${d.status}\`` : ''}（\`${d.relPath}\`）`);
        }
        if (items.length > STATE_AUTO_MAX_ITEMS)
            lines.push(`- …共 ${items.length} 条`);
    }
    if (dimension === 'Claims') {
        const items = listClaims(workspace).sort((a, b) => a.id.localeCompare(b.id));
        for (const c of items.slice(0, STATE_AUTO_MAX_ITEMS)) {
            lines.push(`- **${c.id}** ${firstLine(c.statement || c.id)} — \`${c.status}\``);
        }
        if (items.length > STATE_AUTO_MAX_ITEMS)
            lines.push(`- …共 ${items.length} 条`);
    }
    if (dimension === 'Evidence') {
        const items = listEvidence(workspace).sort((a, b) => a.id.localeCompare(b.id));
        for (const e of items.slice(0, STATE_AUTO_MAX_ITEMS)) {
            const kind = e.sourceKind ? `，${e.sourceKind}` : '';
            lines.push(`- **${e.id}** ${oneLine(e.name || e.id)} — \`${e.status}\`${kind}`);
        }
        if (items.length > STATE_AUTO_MAX_ITEMS)
            lines.push(`- …共 ${items.length} 条`);
    }
    if (dimension === 'Literature') {
        const literature = listEvidence(workspace)
            .filter((e) => e.sourceKind === 'literature')
            .sort((a, b) => a.id.localeCompare(b.id));
        const fulltexts = countFulltexts(workspace);
        if (fulltexts > 0)
            lines.push(`- 已下载全文 **${fulltexts}** 篇（\`${FULLTEXT_DIR}/\`）`);
        for (const e of literature.slice(0, STATE_AUTO_MAX_ITEMS)) {
            lines.push(`- **${e.id}** ${oneLine(e.name || e.id)} — \`${e.status}\``);
        }
        if (literature.length > STATE_AUTO_MAX_ITEMS)
            lines.push(`- …共 ${literature.length} 条文献证据`);
    }
    if (dimension === 'Experiments') {
        const dirs = listExperimentDirs(workspace);
        for (const name of dirs.slice(0, STATE_AUTO_MAX_ITEMS)) {
            const files = countResultFiles(workspace, name);
            lines.push(`- **${name}** — ${files} 个结果文件（\`experiments/${name}/results/\`）`);
        }
        if (dirs.length > STATE_AUTO_MAX_ITEMS)
            lines.push(`- …共 ${dirs.length} 项实验`);
    }
    return lines.join('\n');
}
/** 把"自动段"从维度正文里切出来：返回 { head 人手写的内容, block 现有自动段内容 }。 */
function splitAutoBlock(body) {
    const at = body.indexOf(STATE_AUTO_HEADING);
    if (at < 0)
        return { head: body.trim(), block: null };
    return {
        head: body.slice(0, at).trim(),
        // 小标题之后就是自动段正文（含我们写的那句维护说明）
        block: body.slice(at).trim(),
    };
}
/** 组装一个维度的最终正文（人手写 + 自动段；自动段为空则只留人手写）。 */
function joinDimension(head, auto) {
    if (!auto)
        return head;
    const block = `${STATE_AUTO_HEADING}\n\n${AUTO_NOTE}\n\n${auto}`;
    return head ? `${head}\n\n${block}` : block;
}
/**
 * **把产物汇总进 Research State**（自进化的那一环）。
 *
 * @param workspace 研究根
 * @param options.dimensions 只同步这些维度（缺省 = 所有**能自动汇总**且有产物的维度）
 * @param options.reason 归档说明（进 `state-history` 的快照头，便于回退时知道为什么）
 * @returns 同步结果（`synced` 为空 = 没有任何变化，**没有写盘**）
 */
export function syncStateFromArtifacts(workspace, options = {}) {
    const current = ensureResearchState(workspace);
    if (isStateWriteError(current))
        return { error: current.error };
    const scope = options.dimensions
        ? [...options.dimensions]
        : ['Decisions', 'Claims', 'Evidence', 'Literature', 'Experiments'];
    const dimensions = { ...current.dimensions };
    const synced = [];
    const sources = [];
    for (const dim of scope) {
        const auto = deriveAutoBlock(workspace, dim);
        const existing = dimensions[dim] ?? '';
        const { head, block } = splitAutoBlock(existing);
        const next = joinDimension(head, auto);
        if (next === existing.trim())
            continue; // 逐字相同 → 不动（不涨版本号）
        if (auto)
            sources.push(`research/${dim.toLowerCase()}`);
        if (next)
            dimensions[dim] = next;
        else
            delete dimensions[dim];
        synced.push(dim);
    }
    if (synced.length === 0)
        return { synced, sources };
    // 归档旧版本 + 升版本号（与 applyStateUpdate 同一条路 → 自动写入同样可回退）
    const archived = archiveStateVersion(workspace, current, options.reason ?? `auto-sync ${synced.join(', ')}`);
    const from = current.version;
    const to = bumpStateVersion(from);
    writeFileSync(current.path, serializeResearchState({
        version: to,
        dimensions,
        // ⚠️ 成熟度**不动**：它是研究方法的判断，不是产物清单能推出来的
        maturity: current.maturity,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
    }), 'utf8');
    /*
     * 留痕：复用状态提案的处置日志（同一份文件、同一套字段），`action: 'auto-synced'` ——
     * "状态为什么变了"永远只有一个地方要查。
     *
     * ⚠️ 不抛：状态已经写好了，日志是辅助。
     */
    appendStateUpdateRecord(workspace, {
        proposalId: `auto-sync:${synced.join('+')}`,
        action: 'auto-synced',
        at: new Date().toISOString(),
        fromVersion: from,
        toVersion: to,
        by: 'agent',
    });
    return { synced, version: { from, to }, ...(archived ? { archived } : {}), sources };
}
export function reconcileStateWithArtifacts(workspace) {
    const state = (() => {
        const doc = ensureResearchState(workspace);
        return isStateWriteError(doc) ? null : doc;
    })();
    const rows = [];
    for (const dim of ['Decisions', 'Claims', 'Evidence', 'Literature', 'Experiments']) {
        const auto = deriveAutoBlock(workspace, dim);
        const body = state?.dimensions[dim] ?? '';
        const { block } = splitAutoBlock(body);
        const paths = artifactPathsFor(workspace, dim);
        rows.push({
            dimension: dim,
            hasArtifacts: auto.length > 0,
            hasAutoBlock: block !== null,
            stateEmpty: body.trim() === '',
            stale: auto.length > 0 && newestMtimeMs(paths) > newestMtimeMs([state?.path ?? '']),
        });
    }
    return rows;
}
/** 一个维度背后的产物文件（对账用）。 */
function artifactPathsFor(workspace, dimension) {
    const dirOf = (rel) => {
        try {
            return readdirSync(join(workspace, rel)).map((f) => join(workspace, rel, f));
        }
        catch {
            return [];
        }
    };
    switch (dimension) {
        case 'Decisions':
            return dirOf('research/decisions');
        case 'Claims':
            return dirOf('research/claims');
        case 'Evidence':
            return dirOf('research/evidence');
        case 'Literature':
            return dirOf('research/literature');
        case 'Experiments':
            return listExperimentDirs(workspace).map((d) => join(workspace, 'experiments', d));
        default:
            return [];
    }
}
/** 这个维度能不能被自动汇总（给工具/界面用）。 */
export function isAutoSyncedDimension(dimension) {
    return ['Decisions', 'Claims', 'Evidence', 'Literature', 'Experiments'].includes(dimension);
}
/** 全部能自动汇总的维度（按状态维度顺序）。 */
export const AUTO_SYNCED_DIMENSIONS = STATE_DIMENSIONS.filter((d) => isAutoSyncedDimension(d));
/**
 * **主题自动收敛**：研究已有论文标题时，把 `project.md` 的 topic 跟上去。
 *
 * 只在 `researchWorkName` 的结论来自**论文标题**时才动主题 —— 没有论文就不改：
 * 那时"主题"是研究者自己的陈述，插件没有事实可依据（宁可不动，也不拿兜底名覆盖它）。
 */
export function syncProjectTopic(workspace) {
    const project = loadProjectFile(workspace);
    if (!project)
        return { changed: false, source: null, error: 'No project.md in this workspace.' };
    const current = project.topic ?? '';
    const work = researchWorkName(workspace, current);
    if (work.source !== 'paper' || !work.paperTitle)
        return { changed: false, source: null };
    if (work.paperTitle.trim() === current.trim())
        return { changed: false, source: null, current };
    const source = `papers/${work.paperId}/`;
    const reason = `论文标题已定为「${work.paperTitle}」（${source}latex/main.tex），主题随之收敛（自动同步）`;
    const res = updateProjectTopic(workspace, { topic: work.paperTitle, reason, by: 'agent' });
    if (!res.changed) {
        if ('error' in res)
            return { changed: false, source, error: res.error };
        return { changed: false, source, current: res.current };
    }
    return { changed: true, source, previous: res.previous, current: res.current, reason };
}
/**
 * **一次自进化**：状态维度 + 项目主题。
 *
 * 所有触发点都调这一个入口 —— 分开调的话迟早有人只调一半，
 * 而"状态更新了、主题没跟上"正是这一轮要修的东西。
 */
export function selfEvolve(workspace, options = {}) {
    // 定义章节的同步在文件末尾定义（`selfEvolveFull` 是同一件事；这里保持入口唯一）
    return selfEvolveFull(workspace, options);
}
/**
 * 把"有来源"的研究定义章节从状态/主题补上（**只补占位**）。
 *
 * 不处理的字段（本机没有可靠来源）：`Scope`（范围判断）、`Domain`（领域判断）——
 * 它们要用 `research_project action=set` 显式写，且要带 reason。
 */
export function syncProjectDefinition(workspace) {
    const filled = [];
    const skipped = [];
    const project = loadProjectFile(workspace);
    if (!project)
        return { filled, skipped };
    const state = ensureResearchState(workspace);
    const dimension = (d) => isStateWriteError(state) ? '' : (state.dimensions[d] ?? '');
    /** 一次尝试：占位才写。 */
    const attempt = (field, value, reason) => {
        const section = field === 'statement' ? 'Research Statement' : field === 'questions' ? 'Research Questions' : 'Motivation';
        const flat = Array.isArray(value) ? value.join('\n') : value;
        if (!String(flat).trim())
            return;
        // 研究陈述是主题的镜像 → 不走"占位"判断（它本来就有创建时的旧主题）
        if (field !== 'statement' && !isPlaceholderSection(workspace, section)) {
            skipped.push({ field, reason: `${section} 已有人手写内容，不覆盖` });
            return;
        }
        const res = updateProjectDefinition(workspace, { field, value, reason });
        if (res.changed)
            filled.push({ field, reason });
        else if ('error' in res && res.error)
            skipped.push({ field, reason: res.error });
    };
    // 研究陈述 = 当前主题（修掉"frontmatter 已收敛、正文还写着初始输入"的内部不一致）
    if (project.topic) {
        attempt('statement', project.topic, '研究陈述跟随当前主题（自动同步）');
    }
    // 研究问题 ← 状态维度（研究者自己凝练过的那几条）
    const questions = dimension('Research Questions')
        .split(/\n(?=\s*(?:[-*]|\d+[.)])\s)/)
        .map((q) => q.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
        .filter((q) => q.length > 0);
    if (questions.length > 0) {
        attempt('questions', questions, `研究问题来自 Research State 的 Research Questions 维度（自动同步）`);
    }
    // 动机 ← 状态 Problem 段
    const problem = dimension('Problem').trim();
    if (problem) {
        attempt('motivation', problem, '动机来自 Research State 的 Problem 维度（自动同步）');
    }
    return { filled, skipped };
}
/**
 * **一次自进化**：状态维度 + 项目主题 + 研究定义章节。
 */
export function selfEvolveFull(workspace, options = {}) {
    const state = syncStateFromArtifacts(workspace, options);
    const topic = syncProjectTopic(workspace);
    const definition = syncProjectDefinition(workspace);
    return { state, topic, definition };
}
//# sourceMappingURL=state-sync.js.map