/**
 * ConvFusion 2.0 — Paper Entity 与 Manuscript（Stage 5）
 *
 * ## 本模块负责
 *
 * - **Paper 实体**：create / read / update / version / archive / restore（Task 1）
 * - **Manuscript**：`paper.md` 的 create / read / edit / save / version / diff（Task 2）
 * - **Metadata**：`metadata.md`（Task 3）
 * - **Claim Map**（Task 4）与 **Evidence Map**（Task 5）
 * - **Evolution History**：`evolution.md` + `history/`（Task 6）
 *
 * ## 三条不变式
 *
 * 1. **最小 Paper 只需要 `paper.md`**（§5）：其余文件**按需产生**，缺文件不是错误。
 *    `readPaper` 对缺文件一律返回空值而不是抛错。
 * 2. **不删除性覆盖**（§12）：每次版本推进先把当前正文归档到 `history/v<version>.md`，
 *    旧版本永远可读；`restore` 可以回到任意历史版本。
 * 3. **Paper 不被"写完"**（§27）：`status: evolving` 是常态；不存在"完成"状态。
 *    `frozen` 只是"暂时不再演化"，仍可恢复为 `evolving`。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PAPER_ID, PAPERS_DIR, PAPER_FILES, PAPER_STATUSES, normalizeSectionName, } from './paper-data.js';
import { findSection, parseFrontmatter, parseSections, renderFrontmatter, renderSections, stripFrontmatter, } from './markdown.js';
import { listClaims } from './claims.js';
import { ensurePaperLayout } from './workspace-layout.js';
/* ════════════════════════════════════════════════════════════════════════
 * 路径
 * ════════════════════════════════════════════════════════════════════════ */
/** Paper 目录（绝对）。 */
export function paperDir(workspace, paperId = DEFAULT_PAPER_ID) {
    return join(workspace, PAPERS_DIR, paperId);
}
/** 相对 workspace 的 Paper 目录。 */
export function paperRelDir(paperId = DEFAULT_PAPER_ID) {
    return `${PAPERS_DIR}/${paperId}`;
}
function filePath(workspace, paperId, name) {
    return join(paperDir(workspace, paperId), name);
}
function readTextOrNull(p) {
    try {
        return readFileSync(p, 'utf8');
    }
    catch {
        return null;
    }
}
/* ════════════════════════════════════════════════════════════════════════
 * Metadata（Task 3）
 * ════════════════════════════════════════════════════════════════════════ */
function normalizeStatus(raw) {
    const v = (raw ?? '').trim().toLowerCase();
    return PAPER_STATUSES.includes(v) ? v : 'evolving';
}
function parseMetadata(source, fallbackId) {
    const fm = source ? parseFrontmatter(source) : {};
    const body = source ? stripFrontmatter(source) : '';
    // metadata.md 的标题也可作为 title 回退
    const h1 = body.match(/^#\s+(.+)$/m);
    return {
        id: fm.id || fallbackId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'PAPER001',
        ...(fm.title ? { title: fm.title } : h1 ? { title: h1[1].trim() } : {}),
        status: normalizeStatus(fm.status),
        version: fm.version || '0.1',
        ...(fm.research_project ? { researchProject: fm.research_project } : {}),
        ...(fm.research_state_version ? { researchStateVersion: fm.research_state_version } : {}),
        ...(fm.authors ? { authors: fm.authors } : {}),
        ...(fm.target_venue ? { targetVenue: fm.target_venue } : {}),
        ...(fm.research_domain ? { researchDomain: fm.research_domain } : {}),
        ...(fm.created_at ? { createdAt: fm.created_at } : {}),
        ...(fm.updated_at ? { updatedAt: fm.updated_at } : {}),
    };
}
/** 序列化 metadata.md（frontmatter + 人类可读摘要）。 */
export function serializeMetadata(meta) {
    const front = renderFrontmatter({
        id: meta.id,
        type: 'research-paper',
        title: meta.title,
        status: meta.status,
        version: meta.version,
        research_project: meta.researchProject,
        research_state_version: meta.researchStateVersion,
        authors: meta.authors,
        target_venue: meta.targetVenue,
        research_domain: meta.researchDomain,
        created_at: meta.createdAt,
        updated_at: meta.updatedAt ?? new Date().toISOString(),
    });
    const lines = [`# Paper: ${meta.title ?? meta.id}`, ''];
    lines.push(`- **Status**: ${meta.status}`);
    lines.push(`- **Version**: ${meta.version}`);
    if (meta.researchDomain)
        lines.push(`- **Domain**: ${meta.researchDomain}`);
    if (meta.researchStateVersion)
        lines.push(`- **Based on research state**: v${meta.researchStateVersion}`);
    if (meta.targetVenue)
        lines.push(`- **Target venue**: ${meta.targetVenue}`);
    if (meta.authors)
        lines.push(`- **Authors**: ${meta.authors}`);
    return `${front}\n\n${lines.join('\n')}\n`;
}
/* ════════════════════════════════════════════════════════════════════════
 * 读（Task 1 read）
 * ════════════════════════════════════════════════════════════════════════ */
/** 列出全部 Paper id。 */
export function listPaperIds(workspace) {
    try {
        return readdirSync(join(workspace, PAPERS_DIR), { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .map((e) => e.name)
            .sort();
    }
    catch {
        return [];
    }
}
/**
 * 读一个 Paper（缺文件 → 空值，**不抛错**）。
 *
 * @returns Paper 文档；Paper 目录与 `paper.md` 都不存在时返回 `null`
 */
export function readPaper(workspace, paperId = DEFAULT_PAPER_ID) {
    const dir = paperDir(workspace, paperId);
    if (!existsSync(dir))
        return null;
    const manuscriptSource = readTextOrNull(filePath(workspace, paperId, PAPER_FILES.manuscript));
    const metadataSource = readTextOrNull(filePath(workspace, paperId, PAPER_FILES.metadata));
    if (manuscriptSource === null && metadataSource === null)
        return null;
    const manuscript = manuscriptSource ? stripFrontmatter(manuscriptSource).trim() : '';
    const parsed = parseSections(manuscript);
    return {
        id: paperId,
        dir,
        relDir: paperRelDir(paperId),
        metadata: parseMetadata(metadataSource, paperId),
        manuscript,
        sections: parsed.sections.map((s) => ({ title: normalizeSectionName(s.title), body: s.body })),
        present: {
            manuscript: manuscriptSource !== null,
            metadata: metadataSource !== null,
            evolution: existsSync(filePath(workspace, paperId, PAPER_FILES.evolution)),
            claims: existsSync(filePath(workspace, paperId, PAPER_FILES.claims)),
            evidence: existsSync(filePath(workspace, paperId, PAPER_FILES.evidence)),
            gaps: existsSync(filePath(workspace, paperId, PAPER_FILES.gaps)),
        },
    };
}
export function isPaperWriteError(v) {
    return typeof v === 'object' && v !== null && 'error' in v;
}
/**
 * 把 `readPaper` 的 `null` 归一为可读错误 —— 写操作应当给调用方明确原因，
 * 而不是返回一个需要额外判空的 `null`。
 */
function mustRead(workspace, paperId, action) {
    const paper = readPaper(workspace, paperId);
    return paper ?? { error: `找不到 Paper \`${paperId}\`，无法${action}。` };
}
/** 最小 Paper 正文骨架（§7 的推荐章节；**可裁剪**）。 */
export function manuscriptTemplate(title) {
    const h1 = title ? `# ${title}` : '# Title';
    const sections = ['Abstract', '1. Introduction', '2. Related Work', '3. Method', '4. Experiments', '5. Results', '6. Discussion', '7. Conclusion'];
    return [`${h1}`, '', ...sections.flatMap((s) => [`## ${s}`, '', `<!-- ${s} -->`, ''])].join('\n').trim() + '\n';
}
/**
 * 创建 Paper（Task 1 create）。
 *
 * 最小形态只需要 `paper.md`（§5）。
 */
export function createPaper(workspace, input = {}) {
    const paperId = (input.id ?? DEFAULT_PAPER_ID).trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(paperId)) {
        return { error: `非法 Paper id：${paperId}（kebab-case，如 paper-main）` };
    }
    const dir = paperDir(workspace, paperId);
    if (existsSync(filePath(workspace, paperId, PAPER_FILES.manuscript))) {
        return { error: `Paper \`${paperId}\` 已存在。` };
    }
    mkdirSync(dir, { recursive: true });
    // §8：Paper 目录结构含 history / latex / figures（与正文并列）
    ensurePaperLayout(workspace, paperId);
    const now = new Date().toISOString();
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.manuscript), input.manuscript ?? manuscriptTemplate(input.title), 'utf8');
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.metadata), serializeMetadata({
        id: paperId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'PAPER001',
        ...(input.title ? { title: input.title } : {}),
        status: 'evolving',
        version: '0.1',
        ...(input.researchProject ? { researchProject: input.researchProject } : { researchProject: 'current' }),
        ...(input.researchStateVersion ? { researchStateVersion: input.researchStateVersion } : {}),
        ...(input.researchDomain ? { researchDomain: input.researchDomain } : {}),
        ...(input.targetVenue ? { targetVenue: input.targetVenue } : {}),
        ...(input.authors ? { authors: input.authors } : {}),
        createdAt: now,
        updatedAt: now,
    }), 'utf8');
    return mustRead(workspace, paperId, '创建 Paper');
}
/** 更新 metadata（不改正文）。 */
export function updatePaperMetadata(workspace, paperId, patch) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return { error: `找不到 Paper \`${paperId}\`。` };
    const meta = { ...paper.metadata, ...patch, id: paper.metadata.id };
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.metadata), serializeMetadata(meta), 'utf8');
    return mustRead(workspace, paperId, '更新 metadata');
}
/* ════════════════════════════════════════════════════════════════════════
 * Manuscript 编辑（Task 2）
 * ════════════════════════════════════════════════════════════════════════ */
/** 整体保存正文（编辑器路径）。 */
export function saveManuscript(workspace, paperId, manuscript) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return { error: `找不到 Paper \`${paperId}\`。` };
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.manuscript), manuscript, 'utf8');
    return touchMetadata(workspace, paperId);
}
/** 替换单个章节（其余内容原样保留）。章节不存在则追加。 */
export function updatePaperSection(workspace, paperId, section, body) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return { error: `找不到 Paper \`${paperId}\`。` };
    const want = normalizeSectionName(section).toLowerCase();
    const idx = paper.sections.findIndex((s) => s.title.toLowerCase() === want);
    const sections = [...paper.sections];
    if (idx >= 0)
        sections[idx] = { title: sections[idx].title, body };
    else
        sections.push({ title: normalizeSectionName(section), body });
    const title = paper.manuscript.match(/^#\s+(.+)$/m)?.[1];
    const rendered = renderSections(title ?? 'Title', sections);
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.manuscript), rendered, 'utf8');
    return touchMetadata(workspace, paperId);
}
/** 刷新 metadata 的 updatedAt。 */
function touchMetadata(workspace, paperId) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return { error: `找不到 Paper \`${paperId}\`。` };
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.metadata), serializeMetadata({ ...paper.metadata, updatedAt: new Date().toISOString() }), 'utf8');
    return mustRead(workspace, paperId, '更新 Paper');
}
/* ════════════════════════════════════════════════════════════════════════
 * 版本化（Task 1 version / archive / restore，§12）
 * ════════════════════════════════════════════════════════════════════════ */
/** 递增论文版本：`0.4` → `0.5`。 */
export function bumpPaperVersion(version, kind = 'minor') {
    const m = version.replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?/);
    const major = m ? Number(m[1]) : 0;
    const minor = m && m[2] ? Number(m[2]) : 0;
    return kind === 'major' ? `${major + 1}.0` : `${major}.${minor + 1}`;
}
const ARCHIVE_HEADER_RE = /^<!--\s*(?:snapshot|archived):[\s\S]*?-->\r?\n/;
/** 归档当前版本（`history/v<version>.md`），幂等。 */
export function archivePaperVersion(workspace, paperId, options = {}) {
    const paper = readPaper(workspace, paperId);
    if (!paper || !paper.present.manuscript)
        return undefined;
    const version = options.version ?? paper.metadata.version;
    const dir = filePath(workspace, paperId, PAPER_FILES.historyDir);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `v${version.replace(/^v/i, '')}.md`);
    let current;
    try {
        current = readFileSync(filePath(workspace, paperId, PAPER_FILES.manuscript), 'utf8');
    }
    catch {
        return undefined;
    }
    if (existsSync(file)) {
        const existing = readFileSync(file, 'utf8').replace(ARCHIVE_HEADER_RE, '');
        if (existing.trim() === current.trim())
            return undefined;
    }
    const header = options.reason
        ? `<!-- snapshot: ${new Date().toISOString()} — ${options.reason} -->\n`
        : '';
    writeFileSync(file, header + current, 'utf8');
    return {
        version,
        path: `${paperRelDir(paperId)}/${PAPER_FILES.historyDir}/v${version.replace(/^v/i, '')}.md`,
        ...(options.reason ? { reason: options.reason } : {}),
        at: new Date().toISOString(),
    };
}
/** 列出历史版本。 */
export function listPaperVersions(workspace, paperId) {
    const dir = filePath(workspace, paperId, PAPER_FILES.historyDir);
    let files;
    try {
        files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    }
    catch {
        return [];
    }
    return files
        .map((f) => {
        const version = f.replace(/^v/, '').replace(/\.md$/, '');
        const source = readTextOrNull(join(dir, f)) ?? '';
        const reason = source.match(/^<!--\s*snapshot:[^—]*—\s*(.*?)\s*-->/)?.[1];
        const at = source.match(/^<!--\s*snapshot:\s*([0-9T:.\-Z]+)/)?.[1];
        return {
            version,
            path: `${paperRelDir(paperId)}/${PAPER_FILES.historyDir}/${f}`,
            ...(reason ? { reason } : {}),
            ...(at ? { at } : {}),
        };
    })
        .sort((a, b) => {
        const [a1, a2 = 0] = a.version.split('.').map(Number);
        const [b1, b2 = 0] = b.version.split('.').map(Number);
        return a1 - b1 || a2 - b2;
    });
}
/** 读某个历史版本正文（含归档注释，便于追溯原因）。 */
export function readPaperVersion(workspace, paperId, version) {
    return readTextOrNull(join(filePath(workspace, paperId, PAPER_FILES.historyDir), `v${version.replace(/^v/i, '')}.md`)) ?? undefined;
}
/**
 * 还原到某个历史版本（Task 1 restore）。
 *
 * ⚠️ 还原本身也是一次演化：**先把当前正文归档**，再写入历史内容，并递增版本，
 * 因此还原不会丢掉还原前的状态（§12 不删除性覆盖）。
 */
export function restorePaperVersion(workspace, paperId, version, reason = `restore from v${version}`) {
    const historical = readPaperVersion(workspace, paperId, version);
    if (historical === undefined)
        return { error: `找不到历史版本 v${version}。` };
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return { error: `找不到 Paper \`${paperId}\`。` };
    // 1) 归档当前状态（还原也是演化，不能覆盖历史）
    archivePaperVersion(workspace, paperId, { reason });
    // 2) 写回历史正文（去掉归档注释）
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.manuscript), historical.replace(ARCHIVE_HEADER_RE, ''), 'utf8');
    // 3) 版本继续前进（不回到旧号，避免与已有快照冲突）
    return updatePaperMetadata(workspace, paperId, {
        version: bumpPaperVersion(paper.metadata.version),
        status: 'evolving',
    });
}
/** 正文 diff（Task 2 diff）：按行给出统一格式的差异。 */
export function diffManuscript(workspace, paperId, other) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return { error: `找不到 Paper \`${paperId}\`。` };
    const target = other.text ?? (other.version ? readPaperVersion(workspace, paperId, other.version) : undefined);
    if (target === undefined)
        return { error: '需要提供 version 或 text 作为对比目标。' };
    const a = target.replace(ARCHIVE_HEADER_RE, '').split(/\r?\n/);
    const b = paper.manuscript.split(/\r?\n/);
    const aSet = new Set(a);
    const bSet = new Set(b);
    const added = b.filter((l) => l.trim() && !aSet.has(l));
    const removed = a.filter((l) => l.trim() && !bSet.has(l));
    return { added, removed, changedLines: added.length + removed.length };
}
/* ════════════════════════════════════════════════════════════════════════
 * Claim Map（Task 4 / §8）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 读 Claim Map（`claims.md`）。
 *
 * 若文件不存在，则**从正文推导**一个初始映射：正文里出现的 `C001` / `E001` 引用
 * 会被收集起来，这样即使用户没有手工维护 Claim Map，Paper 也能回答
 * "这句话对应哪个 Claim"（§8 的意图）。
 */
export function readClaimMap(workspace, paperId = DEFAULT_PAPER_ID) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return [];
    const source = readTextOrNull(filePath(workspace, paperId, PAPER_FILES.claims));
    if (source) {
        const sections = parseSections(stripFrontmatter(source)).sections;
        const entries = [];
        for (const s of sections) {
            if (!/^C\d{1,4}$/.test(s.title.trim()))
                continue;
            entries.push({
                id: s.title.trim(),
                statement: findSection([s], 'Statement') || s.body.split('\n')[0] || '',
                status: (findSection([s], 'Status') || 'unknown').split('\n')[0].trim(),
                evidence: (findSection([s], 'Evidence').match(/E\d{1,4}/g) ?? []).map((x) => x.toUpperCase()),
                contradictions: (findSection([s], 'Contradicting Evidence').match(/E\d{1,4}/g) ?? []).map((x) => x.toUpperCase()),
                sections: (findSection([s], 'Paper Sections').match(/^[-*]\s*(.+)$/gm) ?? []).map((l) => l.replace(/^[-*]\s*/, '').trim()),
            });
        }
        // 三条信息源必须合并，缺一条都会得出错误结论：
        //   1. claims.md      —— 论文自己的映射资产（Statement / Status / Evidence）
        //   2. 正文引用        —— **唯一**能回答"这个 Claim 出现在哪一节"的来源
        //   3. research/claims —— 证据与状态的权威事实（Stage 4）
        const fromManuscript = deriveClaimMapFromManuscript(paper);
        if (entries.length > 0) {
            return mergeWithResearchClaims(entries, workspace, { derived: fromManuscript });
        }
        // claims.md 存在但为空：仍要合并 `research/claims/` —— 论文里已记录的 Claim
        // 不应因为它还没被写进正文而消失（§8 的映射是研究关系的表达，不是正文的镜像）。
        return mergeWithResearchClaims([], workspace, { requireInManuscript: false, derived: fromManuscript });
    }
    // 回退：从正文推导章节，并与 `research/claims/` 的**权威**内容合并。
    //
    // 为什么必须合并：Claim 的证据/状态是 Stage 4 管理的事实（`research/claims/C001.md`），
    // 正文只告诉你"这个 Claim 出现在哪一节"。只靠正文推导会得到"有 Claim、无证据"的
    // 假象，进而让 Gap 检测误报 unsupported-claim。
    return mergeWithResearchClaims([], workspace, { requireInManuscript: false, derived: deriveClaimMapFromManuscript(paper) });
}
/** 把正文推导的章节信息与 `research/claims/` 的权威内容合并。 */
function mergeWithResearchClaims(entries, workspace, options = {}) {
    const requireInManuscript = options.requireInManuscript ?? true;
    const authoritative = new Map(listClaims(workspace).map((c) => [c.id, c]));
    // 正文推导出的章节归属（claims.md 不记录它，必须来自正文）
    const sectionsById = new Map((options.derived ?? []).map((d) => [d.id, d.sections]));
    const byId = new Map();
    for (const e of entries) {
        byId.set(e.id, { ...e, sections: [...new Set([...e.sections, ...(sectionsById.get(e.id) ?? [])])] });
    }
    // 正文里出现、但 `research/claims/` 与 `claims.md` 都没有的 Claim：
    // **必须保留**，否则"论文引用了研究中不存在的 Claim"这类完整性缺陷会被静默吞掉。
    // 这类条目没有权威证据（本来就是可疑状态），交由 Gap 检测报出。
    for (const d of options.derived ?? []) {
        if (!byId.has(d.id))
            byId.set(d.id, { ...d });
    }
    for (const [id, c] of authoritative) {
        const existing = byId.get(id);
        if (!existing && requireInManuscript)
            continue;
        byId.set(id, {
            id,
            statement: existing?.statement || c.statement,
            status: c.status,
            evidence: c.evidence,
            contradictions: c.contradictions,
            sections: existing?.sections ?? sectionsById.get(id) ?? [],
        });
    }
    return [...byId.values()];
}
/** 从正文推导 Claim → Sections（§8 的 `Paper Sections` 部分）。 */
export function deriveClaimMapFromManuscript(paper) {
    const byClaim = new Map();
    for (const section of paper.sections) {
        const ids = [...new Set((section.body.match(/\bC\d{1,4}\b/g) ?? []).map((x) => x.toUpperCase()))];
        for (const id of ids) {
            const entry = byClaim.get(id) ?? { id, statement: '', status: 'unknown', evidence: [], contradictions: [], sections: [] };
            entry.sections.push(section.title);
            byClaim.set(id, entry);
        }
    }
    return [...byClaim.values()];
}
/** 写 Claim Map（由 `research/claims/*.md` 与正文引用合成，不新增事实）。 */
export function writeClaimMap(workspace, paperId, entries) {
    const parts = ['# Claim Map', ''];
    if (entries.length === 0) {
        parts.push('<!-- 尚无 Claim。先记录 Claim（research/claims/），再把它写进论文。 -->', '');
    }
    for (const e of entries) {
        parts.push(`## ${e.id}`, '');
        parts.push('Statement:', '', e.statement || '(none recorded)', '');
        parts.push('Status:', '', e.status, '');
        parts.push('Evidence:', '', ...(e.evidence.length ? e.evidence.map((x) => `- ${x}`) : ['- (none)']), '');
        if (e.contradictions.length) {
            parts.push('Contradicting Evidence:', '', ...e.contradictions.map((x) => `- ${x}`), '');
        }
        parts.push('Paper Sections:', '', ...(e.sections.length ? e.sections.map((x) => `- ${x}`) : ['- (none)']), '');
    }
    const content = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    mkdirSync(paperDir(workspace, paperId), { recursive: true });
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.claims), content, 'utf8');
    return `${paperRelDir(paperId)}/${PAPER_FILES.claims}`;
}
/* ════════════════════════════════════════════════════════════════════════
 * Evidence Map（Task 5 / §9）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 构建 Evidence Map：`evidence id → { supports, contradicts, sections }`。
 *
 * 从 Claim Map + 正文引用推导。这回答了 §9 的两个问题：
 * "这个实验结果最终被论文哪里使用了？" 与
 * "如果删除 Evidence E008，会影响论文哪些结论？"
 */
export function buildEvidenceMap(workspace, paperId = DEFAULT_PAPER_ID) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return [];
    const claims = readClaimMap(workspace, paperId);
    const byEvidence = new Map();
    // 1) 从 Claim Map 汇总 supports / contradicts
    for (const c of claims) {
        for (const e of c.evidence) {
            const entry = byEvidence.get(e) ?? { id: e, supports: [], contradicts: [], sections: [] };
            if (!entry.supports.includes(c.id))
                entry.supports.push(c.id);
            entry.sections.push(...c.sections);
            byEvidence.set(e, entry);
        }
        for (const e of c.contradictions) {
            const entry = byEvidence.get(e) ?? { id: e, supports: [], contradicts: [], sections: [] };
            if (!entry.contradicts.includes(c.id))
                entry.contradicts.push(c.id);
            byEvidence.set(e, entry);
        }
    }
    // 2) 正文里直接引用的 Evidence（未必挂在 Claim 上）
    for (const section of paper.sections) {
        const ids = [...new Set((section.body.match(/\bE\d{1,4}\b/g) ?? []).map((x) => x.toUpperCase()))];
        for (const id of ids) {
            const entry = byEvidence.get(id) ?? { id, supports: [], contradicts: [], sections: [] };
            if (!entry.sections.includes(section.title))
                entry.sections.push(section.title);
            byEvidence.set(id, entry);
        }
    }
    return [...byEvidence.values()]
        .map((e) => ({ ...e, sections: [...new Set(e.sections)] }))
        .sort((a, b) => a.id.localeCompare(b.id));
}
/** 写 Evidence Map（`evidence.md`）。 */
export function writeEvidenceMap(workspace, paperId, entries) {
    const parts = ['# Evidence Map', '', '<!-- Evidence → 论文使用位置。由 Claim Map 与正文引用推导。 -->', ''];
    for (const e of entries) {
        parts.push(`## ${e.id}`, '');
        parts.push(`- supports: ${e.supports.length ? e.supports.join(', ') : '(none)'}`);
        parts.push(`- contradicts: ${e.contradicts.length ? e.contradicts.join(', ') : '(none)'}`);
        parts.push(`- referenced by: ${e.sections.length ? e.sections.join(', ') : '(not referenced in the manuscript)'}`);
        parts.push('');
    }
    const content = parts.join('\n').trim() + '\n';
    mkdirSync(paperDir(workspace, paperId), { recursive: true });
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.evidence), content, 'utf8');
    return `${paperRelDir(paperId)}/${PAPER_FILES.evidence}`;
}
/* ════════════════════════════════════════════════════════════════════════
 * Evolution History（Task 6 / §29）
 * ════════════════════════════════════════════════════════════════════════ */
/** 演化事件索引（`evolution.md` 的机器可读部分用 JSON 存在同目录）。 */
const EVOLUTION_INDEX = 'evolution.json';
function evolutionIndexPath(workspace, paperId) {
    return filePath(workspace, paperId, EVOLUTION_INDEX);
}
/** 读演化事件索引。 */
export function listEvolutionEvents(workspace, paperId = DEFAULT_PAPER_ID) {
    const raw = readTextOrNull(evolutionIndexPath(workspace, paperId));
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
/**
 * 记录一次演化事件（Task 6）。
 *
 * 同时更新：
 *   - `evolution.json`（机器索引，§29）
 *   - `evolution.md`（人类可读叙述，§29 强调说明仍放 Markdown）
 */
export function recordEvolutionEvent(workspace, paperId, event) {
    const events = listEvolutionEvents(workspace, paperId);
    const id = event.id ?? `EV${String(events.length + 1).padStart(3, '0')}`;
    const full = { ...event, id, timestamp: event.timestamp ?? new Date().toISOString() };
    mkdirSync(paperDir(workspace, paperId), { recursive: true });
    writeFileSync(evolutionIndexPath(workspace, paperId), JSON.stringify([...events, full], null, 2) + '\n', 'utf8');
    // 人类可读叙述
    const existing = readTextOrNull(filePath(workspace, paperId, PAPER_FILES.evolution)) ?? '# Paper Evolution\n';
    const lines = [
        '',
        `## ${id} — ${full.fromVersion} → ${full.toVersion}`,
        '',
        `- Trigger: ${full.trigger}`,
        `- Action: ${full.action} (by ${full.author})`,
        `- When: ${full.timestamp}`,
        ...(full.researchStateVersion ? [`- Research state: v${full.researchStateVersion}`] : []),
        ...(full.plan ? [`- Plan: ${full.plan}`] : []),
        ...(full.evidence.length ? [`- Evidence: ${full.evidence.join(', ')}`] : []),
        ...(full.claims.length ? [`- Claims: ${full.claims.join(', ')}`] : []),
        ...(full.sections.length ? [`- Sections: ${full.sections.join(', ')}`] : []),
        ...(full.summary ? ['', full.summary] : []),
        '',
    ];
    writeFileSync(filePath(workspace, paperId, PAPER_FILES.evolution), existing.trimEnd() + '\n' + lines.join('\n'), 'utf8');
    return full;
}
/* ════════════════════════════════════════════════════════════════════════
 * 归档 / 删除（Task 1 archive / restore）
 * ════════════════════════════════════════════════════════════════════════ */
/** 归档 Paper（不是删除：置 `status: archived`，正文与历史都保留）。 */
export function archivePaper(workspace, paperId) {
    return updatePaperMetadata(workspace, paperId, { status: 'archived' });
}
/** 从归档恢复为演化中。 */
export function restoreArchivedPaper(workspace, paperId) {
    return updatePaperMetadata(workspace, paperId, { status: 'evolving' });
}
/** 冻结（暂时不再演化）—— 与归档不同，仍视为当前论文。 */
export function freezePaper(workspace, paperId) {
    return updatePaperMetadata(workspace, paperId, { status: 'frozen' });
}
/**
 * 彻底删除 Paper（含历史）。
 *
 * ⚠️ 与 Evidence 的规则一致（Stage 4 §9）：**归档优先**。删除仅用于误建场景，
 * 因此要求显式 `confirm`，且不删除任何 `research/` 下的证据。
 */
export function deletePaper(workspace, paperId, options = {}) {
    if (!options.confirm) {
        return { error: `删除 Paper \`${paperId}\` 会丢失其演化历史。请先考虑 archive；确需删除请显式确认。` };
    }
    const dir = paperDir(workspace, paperId);
    if (!existsSync(dir))
        return { error: `找不到 Paper \`${paperId}\`。` };
    try {
        rmSync(dir, { recursive: true, force: true });
    }
    catch (e) {
        return { error: `删除失败：${e instanceof Error ? e.message : String(e)}` };
    }
    return { ok: true, id: paperId };
}
//# sourceMappingURL=paper.js.map