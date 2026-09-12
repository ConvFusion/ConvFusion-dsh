/**
 * ConvFusion 2.0 — Paper Gap Detection 与 Capability Recommendation（Stage 5）
 *
 * ## 为什么 Gap 是 Stage 5 的关键（§14 / §15）
 *
 * Paper 不只是记录已有成果，还要能回答 **"这篇论文目前缺什么？"**。
 * 但 §15 有一条**硬约束**：
 *
 * ```text
 * Gap ──✗──▶ Agent 自动执行
 *
 * Gap ──▶ Capability Recommendation ──▶ Skill ──▶ Plan ──▶ User Review ──▶ Harness
 * ```
 *
 * 因此本模块**只做检测与推荐**，绝不执行任何东西。推荐输出的是 **Skill id**，
 * 由 Agent/用户决定是否据此形成 Plan（Stage 3）。
 *
 * ## 检测方式（Task 8）
 *
 * 第一版 = **规则检查 + Agent 建议**。本模块实现规则部分：全部判据都来自
 * Stage 4 的资产（Claim / Evidence / Research State）与正文引用，因此**可复核**。
 * Agent 建议走 `research_paper_gap` 工具（`detectedBy: 'agent'`）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAPERS_DIR, PAPER_FILES, REQUIRED_PAPER_SECTIONS, normalizeSectionName, } from './paper-data.js';
import { buildEvidenceMap, paperDir, paperRelDir, readClaimMap, readPaper } from './paper.js';
import { parseListItems, stripFrontmatter } from './markdown.js';
import { listClaims } from './claims.js';
import { listEvidence } from './evidence.js';
import { loadResearchState } from './research-state.js';
/* ════════════════════════════════════════════════════════════════════════
 * Gap 文件读写
 * ════════════════════════════════════════════════════════════════════════ */
function gapsPath(workspace, paperId) {
    return join(paperDir(workspace, paperId), PAPER_FILES.gaps);
}
/**
 * 读已记录的 Gap（`gaps.md`）。
 *
 * ⚠️ 这里**不能**用「按 `\n## G` 切分」的写法：文件开头是 `# Research Gaps` 标题与
 * 说明注释，第一个 `## G001` 前面不一定有我们需要的那种分隔，结果会解析出 0 条 ——
 * 而 0 条会让"重复检测"每次都当成全新缺口重复追加。改为**按标题位置切片**。
 */
export function listPaperGaps(workspace, paperId) {
    let source;
    try {
        source = readFileSync(gapsPath(workspace, paperId), 'utf8');
    }
    catch {
        return [];
    }
    const body = stripFrontmatter(source);
    const lines = body.split(/\r?\n/);
    // 找出所有 `## G00N` 标题行
    const heads = [];
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^##\s+(G\d{1,4})\s*$/);
        if (m)
            heads.push({ index: i, id: m[1] });
    }
    const out = [];
    for (let h = 0; h < heads.length; h++) {
        const block = lines.slice(heads[h].index + 1, h + 1 < heads.length ? heads[h + 1].index : lines.length).join('\n');
        const field = (name) => {
            const m = block.match(new RegExp(`^\\*\\*${name}\\*\\*:\\s*(.*)$`, 'm')) ??
                block.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'));
            return m?.[1]?.trim() ?? '';
        };
        out.push({
            id: heads[h].id,
            type: (field('Type') || 'experimental-validation'),
            description: field('Description'),
            ...(field('Related Claim') ? { relatedClaim: field('Related Claim') } : {}),
            ...(field('Related Section') ? { relatedSection: field('Related Section') } : {}),
            ...(field('Suggested Capability') ? { suggestedSkill: field('Suggested Capability') } : {}),
            priority: (field('Priority') || 'medium'),
            detectedBy: (field('Detected By') || 'rule'),
            createdAt: field('Created At') || new Date().toISOString(),
            ...(field('Resolved') ? { resolved: { at: field('Resolved'), by: field('Resolved By') || 'user' } } : {}),
        });
    }
    return out;
}
/** 序列化 Gap 列表（Markdown，§14 的结构）。 */
export function serializePaperGaps(gaps) {
    const parts = [
        '# Research Gaps',
        '',
        '<!-- 论文当前缺什么。每条 Gap 只**推荐**能力，不触发执行（Stage 5 §15）。 -->',
        '',
    ];
    if (gaps.length === 0)
        parts.push('<!-- 规则检查未发现缺口。 -->', '');
    for (const g of gaps) {
        parts.push(`## ${g.id}`, '');
        parts.push(`**Type**: ${g.type}`);
        parts.push(`**Description**: ${g.description}`);
        if (g.relatedClaim)
            parts.push(`**Related Claim**: ${g.relatedClaim}`);
        if (g.relatedSection)
            parts.push(`**Related Section**: ${g.relatedSection}`);
        if (g.suggestedSkill)
            parts.push(`**Suggested Capability**: ${g.suggestedSkill}`);
        parts.push(`**Priority**: ${g.priority}`);
        parts.push(`**Detected By**: ${g.detectedBy}`);
        parts.push(`**Created At**: ${g.createdAt}`);
        if (g.resolved)
            parts.push(`**Resolved**: ${g.resolved.at}`, `**Resolved By**: ${g.resolved.by}`);
        parts.push('');
    }
    return parts.join('\n').trim() + '\n';
}
/** 写回 Gap 列表。 */
export function writePaperGaps(workspace, paperId, gaps) {
    mkdirSync(paperDir(workspace, paperId), { recursive: true });
    writeFileSync(gapsPath(workspace, paperId), serializePaperGaps(gaps), 'utf8');
    return `${paperRelDir(paperId)}/${PAPER_FILES.gaps}`;
}
/** 下一个 Gap id。 */
export function nextGapId(existing) {
    const max = existing.reduce((n, g) => Math.max(n, Number(g.id.replace(/^G/, '')) || 0), 0);
    return `G${String(max + 1).padStart(3, '0')}`;
}
/* ════════════════════════════════════════════════════════════════════════
 * 规则检测（Task 8 `detect`）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 规则 → 推荐能力（Skill id）的映射。
 *
 * ⚠️ 值是 **Skill id**（Stage 2 系统库中的能力），不是命令、不是步骤。
 * 这里只是"哪类缺口适合用哪种研究方法"，**不表示执行顺序**。
 */
export const GAP_SKILL_HINTS = {
    'unsupported-claim': 'evidence-assessment',
    'contested-claim': 'comparative-analysis',
    'missing-evidence': 'experiment-design',
    'evidence-without-artifact': 'reproducible-implementation-spec',
    'missing-ablation': 'ablation-design',
    'experimental-validation': 'evaluation-protocol',
    'missing-section': 'paper-architecture',
    'thin-section': 'section-drafting',
    'unreferenced-evidence': 'section-drafting',
    'outdated-related-work': 'literature-review',
    reproducibility: 'reproducible-implementation-spec',
};
/**
 * 跑**规则检查**（纯函数，不写盘）。
 *
 * 判据全部来自可复核的资产：
 *   - 正文是否有必需章节（§7）；
 *   - 章节是否有实质内容（占位注释不算）；
 *   - Claim 是否有证据 / 是否有矛盾证据（Stage 4 §10）；
 *   - Evidence 是否引用了原始产物（Stage 4 §30）；
 *   - Evidence 是否真的被正文使用（§9）；
 *   - Research State 是否有未解决问题（Stage 4 §24）。
 */
export function detectPaperGaps(workspace, paperId) {
    const paper = readPaper(workspace, paperId);
    if (!paper)
        return [];
    const out = [];
    const sectionNames = paper.sections.map((s) => s.title);
    const sectionTitles = new Set(sectionNames.map((s) => s.toLowerCase()));
    // ── 1. 缺章节 ──────────────────────────────────────────────────────
    for (const want of REQUIRED_PAPER_SECTIONS) {
        if (!sectionTitles.has(want.toLowerCase())) {
            // Abstract / Introduction 缺失影响最大
            const priority = want === 'Abstract' || want === 'Method' ? 'high' : 'medium';
            out.push({
                type: 'missing-section',
                description: `The manuscript has no \`${want}\` section.`,
                relatedSection: want,
                priority,
            });
        }
    }
    // ── 2. 章节空/占位（只有注释或极短）─────────────────────────────────
    for (const s of paper.sections) {
        const substantive = s.body.replace(/<!--[\s\S]*?-->/g, '').trim();
        if (substantive.length === 0) {
            out.push({
                type: 'thin-section',
                description: `Section \`${s.title}\` has no substantive content (only a placeholder).`,
                relatedSection: s.title,
                priority: ['method', 'experiments', 'results'].includes(s.title.toLowerCase()) ? 'high' : 'low',
            });
        }
    }
    // ── 3. Claim 无证据 / 有争议（Stage 4 §10）────────────────────────
    const claims = readClaimMap(workspace, paperId);
    const researchClaims = new Map(listClaims(workspace).map((c) => [c.id, c]));
    for (const c of claims) {
        const authoritative = researchClaims.get(c.id);
        const evidence = authoritative?.evidence ?? c.evidence;
        const contradictions = authoritative?.contradictions ?? c.contradictions;
        if (evidence.length === 0) {
            out.push({
                type: 'unsupported-claim',
                description: `Claim ${c.id} appears in the manuscript with no supporting evidence.`,
                relatedClaim: c.id,
                ...(c.sections[0] ? { relatedSection: c.sections[0] } : {}),
                priority: 'high',
            });
        }
        if (contradictions.length > 0) {
            out.push({
                type: 'contested-claim',
                description: `Claim ${c.id} has contradicting evidence (${contradictions.join(', ')}) that the manuscript does not address.`,
                relatedClaim: c.id,
                ...(c.sections[0] ? { relatedSection: c.sections[0] } : {}),
                priority: 'high',
            });
        }
    }
    // ── 4. 正文引用了不存在的 Claim / Evidence ────────────────────────
    const evidenceIds = new Set(listEvidence(workspace).map((e) => e.id));
    for (const c of claims) {
        if (!researchClaims.has(c.id)) {
            out.push({
                type: 'missing-evidence',
                description: `The manuscript cites claim ${c.id}, but no such claim is recorded in the research state.`,
                relatedClaim: c.id,
                priority: 'high',
            });
        }
    }
    // ── 5. Evidence 缺原始产物（Stage 4 §30 provenance 不完整）────────
    for (const e of listEvidence(workspace)) {
        if (e.provenance.rawArtifacts.length === 0 && e.status !== 'rejected') {
            out.push({
                type: 'evidence-without-artifact',
                description: `Evidence ${e.id} (${e.name}) has no raw artifact reference, so it cannot be reproduced or checked.`,
                priority: 'medium',
            });
        }
    }
    // ── 6. Evidence 未被正文使用（§9：能不能回答"这个结果用在哪"）──────
    const map = buildEvidenceMap(workspace, paperId);
    for (const entry of map) {
        if (entry.sections.length === 0) {
            out.push({
                type: 'unreferenced-evidence',
                description: `Evidence ${entry.id} is recorded but never used in the manuscript. (Deleting it would change nothing.)`,
                priority: 'low',
            });
        }
    }
    // 有证据但正文完全没引用（没有任何 Claim 也没被引用）
    const usedEvidence = new Set(map.map((m) => m.id));
    for (const e of listEvidence(workspace)) {
        if (!usedEvidence.has(e.id) && e.status === 'verified') {
            out.push({
                type: 'unreferenced-evidence',
                description: `Verified evidence ${e.id} is not referenced anywhere in the manuscript — either use it or record why it is excluded.`,
                priority: 'medium',
            });
        }
    }
    void evidenceIds;
    // ── 7. 消融缺失：实验章节有内容但无任何消融相关证据/描述 ────────────
    const hasExperiment = paper.sections.some((s) => /experiment|result/i.test(s.title) && s.body.replace(/<!--[\s\S]*?-->/g, '').trim().length > 80);
    const mentionsAblation = /ablation/i.test(paper.manuscript);
    const hasAblationEvidence = listEvidence(workspace).some((e) => /ablation/i.test(e.name) || /ablation/i.test(e.type));
    if (hasExperiment && !mentionsAblation && !hasAblationEvidence) {
        out.push({
            type: 'missing-ablation',
            description: 'The manuscript reports experiments but contains no ablation. There is no evidence isolating which component causes the reported effect.',
            relatedSection: 'Experiments',
            priority: 'high',
        });
    }
    // ── 8. 可复现性：方法/实验章节没有提到数据或环境 ────────────────────
    const reproText = paper.sections
        .filter((s) => /method|experiment/i.test(s.title))
        .map((s) => s.body)
        .join('\n');
    if (reproText.length > 80 &&
        !/(dataset|data set|benchmark|seed|environment|version|hyperparameter|hyper-parameter)/i.test(reproText)) {
        out.push({
            type: 'reproducibility',
            description: 'The method/experiment sections do not mention dataset, seeds, environment or hyper-parameters, so the result cannot be reproduced from the paper.',
            priority: 'medium',
        });
    }
    // ── 9. Research State 的未解决问题未在论文中出现 ────────────────────
    const state = loadResearchState(workspace);
    const openQ = state?.dimensions['Open Questions'];
    if (openQ) {
        for (const q of parseListItems(openQ)) {
            const key = q.split(/\s+/).slice(0, 4).join(' ').toLowerCase();
            if (key.length > 12 && !paper.manuscript.toLowerCase().includes(key)) {
                out.push({
                    type: 'missing-section',
                    description: `Open research question not addressed in the paper: "${q}"`,
                    relatedSection: 'Discussion',
                    priority: 'medium',
                });
            }
        }
    }
    return out;
}
/**
 * 把检测结果**并入** Gap 列表（去重：同类型 + 同关联对象视为同一条）。
 *
 * @returns `{ gaps, added }` —— 合并后的完整列表与新增条数
 */
export function mergeDetectedGaps(existing, detected) {
    // ⚠️ 必须显式 return：这是块体箭头函数，漏 return 会让所有 key 都是 undefined，
    // 去重集合永远为空 → 每次检测都重复追加全部 Gap。
    const key = (g) => {
        return `${g.type}|${g.relatedClaim ?? ''}|${g.relatedSection ?? ''}|${g.description.slice(0, 60)}`;
    };
    const seen = new Set(existing.filter((g) => !g.resolved).map(key));
    const added = [];
    const gaps = [...existing];
    for (const d of detected) {
        if (seen.has(key(d)))
            continue;
        const gap = {
            id: nextGapId(gaps),
            type: d.type,
            description: d.description,
            ...(d.relatedClaim ? { relatedClaim: d.relatedClaim } : {}),
            ...(d.relatedSection ? { relatedSection: d.relatedSection } : {}),
            ...(GAP_SKILL_HINTS[d.type] ? { suggestedSkill: GAP_SKILL_HINTS[d.type] } : {}),
            priority: d.priority,
            detectedBy: 'rule',
            createdAt: new Date().toISOString(),
        };
        gaps.push(gap);
        added.push(gap);
        seen.add(key(d));
    }
    return { gaps, added };
}
/** 检测 + 落盘（Task 8 的 `detect` + `record`）。 */
export function detectAndRecordGaps(workspace, paperId) {
    const existing = listPaperGaps(workspace, paperId);
    const merged = mergeDetectedGaps(existing, detectPaperGaps(workspace, paperId));
    const path = writePaperGaps(workspace, paperId, merged.gaps);
    return { ...merged, path };
}
/** 手工/Agent 记录一条 Gap（Task 8 的 `record`，`detectedBy: 'agent' | 'user'`）。 */
export function recordPaperGap(workspace, paperId, input) {
    const gaps = listPaperGaps(workspace, paperId);
    const gap = {
        ...input,
        id: nextGapId(gaps),
        detectedBy: input.detectedBy ?? 'agent',
        createdAt: new Date().toISOString(),
        ...(input.suggestedSkill ?? GAP_SKILL_HINTS[input.type]
            ? { suggestedSkill: input.suggestedSkill ?? GAP_SKILL_HINTS[input.type] }
            : {}),
    };
    const next = [...gaps, gap];
    const path = writePaperGaps(workspace, paperId, next);
    return { gap, path };
}
/** 标记 Gap 已解决（Task 8 `resolve`）。 */
export function resolvePaperGap(workspace, paperId, gapId, note) {
    const gaps = listPaperGaps(workspace, paperId);
    const i = gaps.findIndex((g) => g.id === gapId);
    if (i < 0)
        return undefined;
    gaps[i] = {
        ...gaps[i],
        resolved: { at: new Date().toISOString(), by: 'user', ...(note ? { note } : {}) },
    };
    writePaperGaps(workspace, paperId, gaps);
    return gaps;
}
/** Gap 优先级排序（Task 8 `prioritize`）：high → medium → low，未解决优先。 */
export function prioritizeGaps(gaps) {
    const rank = { high: 0, medium: 1, low: 2 };
    return [...gaps].sort((a, b) => {
        if (Boolean(a.resolved) !== Boolean(b.resolved))
            return a.resolved ? 1 : -1;
        return rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id);
    });
}
/**
 * Gap → Skill 推荐（Task 9）。
 *
 * **不执行任何东西**：只给出"这类缺口适合用哪种研究方法"，
 * 并给出建议的 Plan 路径（Stage 3 的资产位置），由 Agent/用户决定是否创建。
 */
export function recommendCapabilities(workspace, paperId, knownSkillIds) {
    const known = new Set(knownSkillIds);
    return prioritizeGaps(listPaperGaps(workspace, paperId))
        .filter((g) => !g.resolved)
        .map((g) => {
        const skillId = g.suggestedSkill ?? GAP_SKILL_HINTS[g.type];
        const usable = skillId && known.has(skillId) ? skillId : undefined;
        return {
            gapId: g.id,
            gapType: g.type,
            gapDescription: g.description,
            priority: g.priority,
            ...(usable ? { skillId: usable } : {}),
            ...(usable ? { suggestedPlanPath: `plans/${usable}.md` } : {}),
            executed: false,
        };
    });
}
/** 供 Paper 状态摘要使用的 gap 统计。 */
export function gapSummary(gaps) {
    const byType = {};
    for (const g of gaps)
        byType[g.type] = (byType[g.type] ?? 0) + 1;
    const open = gaps.filter((g) => !g.resolved);
    return {
        total: gaps.length,
        open: open.length,
        high: open.filter((g) => g.priority === 'high').length,
        byType,
    };
}
/** 确认 Paper 目录存在（供工具层给出友好错误）。 */
export function paperExists(workspace, paperId) {
    return existsSync(join(workspace, PAPERS_DIR, paperId));
}
/** 供工具层：把 Paper 标题读出来做展示。 */
export function paperTitle(paper) {
    return paper.metadata.title ?? paper.manuscript.match(/^#\s+(.+)$/m)?.[1] ?? paper.id;
}
/** 供工具层：章节名归一（外部也要用）。 */
export { normalizeSectionName };
//# sourceMappingURL=paper-gaps.js.map