/**
 * ConvFusion 2.0 — `project.md`：研究定义（`v2-Workspace.md` §3）
 *
 * ## 它和 `research-state.md` 的分工
 *
 * ```text
 * project.md         定义研究**是什么**     ← 目标、问题、范围（相对稳定）
 * research-state.md  描述研究**到了哪一步** ← 知道什么、相信什么、缺什么（持续变化）
 * ```
 *
 * 二者共同构成 Workspace 的 **Research Definition** 层（§1），放在工作区根目录。
 *
 * ## 不存在第二份定义
 *
 * v1 用 `research.json` 存 `work_id` 等机器可读字段。v2 **推倒**这条线：
 * `v2-Workspace.md` §2 的最终目录结构里没有 `research.json`，因为
 * **workspace 路径本身就是研究身份**，不需要额外锚文件。所以研究定义只有 `project.md` 一份。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROJECT_FILE } from './research-data.js';
import { parseListItems, stripFrontmatter, parseFrontmatter, renderFrontmatter } from './markdown.js';
/** `project.md` 的推荐章节（**弱结构**：缺章节不报错）。 */
export const PROJECT_SECTIONS = [
    'Research Statement',
    'Motivation',
    'Research Questions',
    'Scope',
    'Domain',
];
/** `project.md` 的绝对路径。 */
export function projectPath(workspace) {
    return join(workspace, PROJECT_FILE);
}
/** 从 `project.md` 解析研究定义；不存在/损坏 → null。 */
export function loadProjectFile(workspace) {
    const file = projectPath(workspace);
    if (!existsSync(file))
        return null;
    let source;
    try {
        source = readFileSync(file, 'utf8');
    }
    catch {
        return null;
    }
    const fm = parseFrontmatter(source);
    const body = stripFrontmatter(source);
    /**
     * 取一个 `## 章节` 的正文（到下一个 `##` 或文末）。
     *
     * ⚠️ 这里修过一个**静默截断**的 bug：早先的 lookahead 写成 `(?=^##\\s|\\s*$)`，
     * 而带 `m` 标志时 `$` 会在**任意行尾**成立 —— 于是每个多行章节都被截成**第一行**。
     * 症状很隐蔽：单行章节（如早先的 Research Statement）看起来正常，
     * 一旦用户写多行（研究问题、Motivation）就只剩第一句。
     */
    const section = (name) => {
        const re = new RegExp(`^##\\s+${name}\\s*$\\n([\\s\\S]*?)(?=\\n##\\s|(?![\\s\\S]))`, 'm');
        return body.match(re)?.[1]?.replace(/<!--[\s\S]*?-->/g, '').trim() ?? '';
    };
    const statement = section('Research Statement');
    const topic = fm.topic || firstLine(statement);
    if (!topic)
        return null;
    const initialTopic = fm.initial_topic || undefined;
    // 用共享的段落级解析：跨行的条目要合成一条，且不能被 `**加粗**` 的
    // `*` 误当列表标记（曾经把 `**Q1（…）**` 解析成 `Q1（…）**`）
    const questions = parseListItems(section('Research Questions'));
    return {
        topic,
        ...(initialTopic ? { initialTopic } : {}),
        ...(fm.domain || section('Domain') ? { domain: fm.domain || firstLine(section('Domain')) } : {}),
        ...(questions.length > 0 ? { questions } : {}),
        ...(section('Motivation') ? { goal: firstLine(section('Motivation')) } : {}),
        ...(fm.created_at ? { createdAt: fm.created_at } : {}),
        ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    };
}
function firstLine(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
}
/** 序列化 `project.md`（研究定义）。 */
export function serializeProject(input) {
    const front = renderFrontmatter({
        type: 'research-project',
        topic: input.topic,
        // 初始输入主题：创建时等于 topic；主题演进后与 topic 不同（追溯"怎么演进的"）
        initial_topic: input.initialTopic ?? input.topic,
        domain: input.domain,
        created_at: input.createdAt,
        updated_at: input.updatedAt ?? new Date().toISOString(),
    });
    const parts = [front, '', '# Research Project', '', '## Research Statement', '', input.topic, ''];
    if (input.goal)
        parts.push('## Motivation', '', input.goal, '');
    parts.push('## Research Questions', '', ...(input.questions?.length ? input.questions.map((q) => `- ${q}`) : ['<!-- 尚未凝练出可检验的研究问题 -->']), '');
    parts.push('## Scope', '', '<!-- 这项研究包含什么、明确不包含什么 -->', '');
    parts.push('## Domain', '', input.domain || '<!-- 研究领域 -->', '');
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
/**
 * 写入研究定义（幂等）。
 *
 * @returns 实际写入的字段
 */
export function saveProjectFile(workspace, input) {
    const file = projectPath(workspace);
    const now = new Date().toISOString();
    // 保留已有字段（用户/前序写入的内容不被静默丢弃）
    const existing = loadProjectFile(workspace);
    const merged = {
        topic: input.topic.trim(),
        // 初始主题只允许"首次确定"：已有值（含前次演进保留下来的）绝不覆盖
        initialTopic: existing?.initialTopic ?? input.topic.trim(),
        ...(input.domain ?? existing?.domain ? { domain: (input.domain ?? existing?.domain) } : {}),
        ...(input.goal ?? existing?.goal ? { goal: (input.goal ?? existing?.goal) } : {}),
        ...(input.questions?.length ?? existing?.questions?.length
            ? { questions: [...(input.questions ?? existing?.questions ?? [])] }
            : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    writeFileSync(file, serializeProject(merged), 'utf8');
    return merged;
}
/** 主题演进历史（与 `project.md` 同层的结构化资产，放 `research/` 下）。 */
export const TOPIC_HISTORY_FILE = 'research/topic-history.json';
/** 读取主题演进历史；缺失 / 损坏 → 空列表。 */
export function listTopicChanges(workspace) {
    try {
        const raw = JSON.parse(readFileSync(join(workspace, TOPIC_HISTORY_FILE), 'utf8'));
        return Array.isArray(raw) ? raw : [];
    }
    catch {
        return [];
    }
}
/** 把任意输入收敛成可安全写入 frontmatter 的单行主题。 */
function sanitizeTopic(raw) {
    return raw.replace(/\s+/g, ' ').trim().replace(/^["']+|["']+$/g, '');
}
/**
 * 把项目主题更新为最后采纳的主题（**外科手术式**，只动 frontmatter 指定行）。
 *
 * - 主题相同 → 幂等 no-op；
 * - 首次更新时（旧项目没有 `initial_topic`）把**当前**主题固化为初始输入；
 * - 变更追加到 `research/topic-history.json`。
 */
export function updateProjectTopic(workspace, input) {
    const file = projectPath(workspace);
    if (!existsSync(file))
        return { changed: false, error: 'No project.md in this workspace.' };
    const source = readFileSync(file, 'utf8');
    const current = loadProjectFile(workspace)?.topic ?? '';
    const next = sanitizeTopic(input.topic);
    if (!next)
        return { changed: false, error: 'Topic must be a non-empty single line.' };
    if (next === current) {
        return { changed: false, previous: current, current };
    }
    const fm = parseFrontmatter(source);
    // 旧项目没有 initial_topic：此刻的（即将被替换的）主题就是初始输入
    const initial = fm.initial_topic || current;
    // ── 外科手术：逐行处理 frontmatter，只替换/插入目标键，其余行原样保留 ──
    const m = source.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
    if (!m)
        return { changed: false, error: 'project.md has no frontmatter block.' };
    const now = new Date().toISOString();
    const lines = m[2].split(/\r?\n/);
    const out = [];
    let topicDone = false;
    let initialDone = Boolean(fm.initial_topic);
    for (const line of lines) {
        const key = line.split(':')[0]?.trim();
        if (key === 'topic') {
            out.push(`topic: ${next}`);
            if (!initialDone) {
                out.push(`initial_topic: ${initial}`);
                initialDone = true;
            }
            topicDone = true;
            continue;
        }
        if (key === 'initial_topic') {
            out.push(line);
            initialDone = true;
            continue;
        }
        if (key === 'updated_at') {
            out.push(`updated_at: ${now}`);
            continue;
        }
        out.push(line);
    }
    if (!initialDone)
        out.unshift(`initial_topic: ${initial}`);
    if (!topicDone)
        out.unshift(`topic: ${next}`);
    if (!fm.updated_at)
        out.push(`updated_at: ${now}`);
    writeFileSync(file, `${m[1]}${out.join('\n')}${m[3]}${source.slice(m[0].length)}`, 'utf8');
    // ── 留痕：追加变更记录（历史不被擦除）──
    const change = {
        from: current,
        to: next,
        at: now,
        by: input.by ?? 'agent',
        ...(input.reason ? { reason: input.reason.replace(/\s+/g, ' ').trim() } : {}),
        ...(input.evidence && input.evidence.length ? { evidence: [...input.evidence] } : {}),
    };
    const history = listTopicChanges(workspace);
    history.push(change);
    const historyFile = join(workspace, TOPIC_HISTORY_FILE);
    mkdirSync(dirname(historyFile), { recursive: true });
    writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n', 'utf8');
    return { changed: true, previous: current, current: next, initial };
}
/** 研究定义是否存在（即 `project.md`）。 */
export function hasProjectDefinition(workspace) {
    return existsSync(projectPath(workspace));
}
/** 供工具/命令：取研究主题。 */
export function projectTopic(workspace) {
    return loadProjectFile(workspace)?.topic;
}
//# sourceMappingURL=project.js.map