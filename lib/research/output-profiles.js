/**
 * ConvFusion 2.0 — Output Profiles（Stage 5.1 Task 2）
 *
 * ## Profile 是什么（§7）
 *
 * 「输出类型 / 目标受众 / 推荐结构 / 内容约束 / 来源对象 / 格式要求」的描述。
 *
 * **不是 Workflow**：Profile 里没有执行顺序，也没有"必须先做 A 再做 B"。
 * 它只说明"这种成果长什么样、要满足什么"，执行仍由 Harness 的 Agent 决定。
 *
 * ## 为什么 Profile 是数据而不是 Prompt
 *
 * §14 明确：**Output Transformation 不是 summarization**。
 * Patent 不等于"把 Paper 的标题换掉" —— 它要重新组织成
 * 技术问题 / 技术方案 / 技术效果 / 实施方式（§9）。
 * 这类差异必须**可复核地表达**（结构 + 约束 + 质量规则），而不是藏在某段提示词里。
 */
/* ════════════════════════════════════════════════════════════════════════
 * Paper Profile（§8）
 * ════════════════════════════════════════════════════════════════════════ */
const PAPER = {
    type: 'paper',
    name: 'Research Paper',
    audience: 'Peer reviewers and the research community of the target venue.',
    purpose: 'Communicate the research so that a reader can judge the claim, reproduce the evidence, and place it against prior work.',
    structure: [
        'Abstract',
        'Introduction',
        'Related Work',
        'Method',
        'Experiments',
        'Results',
        'Discussion',
        'Conclusion',
        'References',
    ],
    constraints: [
        'Every substantive claim in the text must correspond to a recorded research claim, and that claim must have evidence.',
        'The experimental setting (dataset, baselines, metrics, tuning policy) must be stated before the results.',
        'Contradicting evidence must be addressed in the text, not omitted.',
        'References must be real works with complete metadata — never placeholders.',
    ],
    qualityChecks: [
        {
            id: 'paper-claim-refs',
            description: 'The manuscript references recorded claims (C001 style ids).',
            pattern: '\\bC\\d{1,4}\\b',
            kind: 'require',
            advice: 'Tag the statements that correspond to recorded claims so they can be traced.',
        },
        {
            id: 'paper-no-placeholder',
            description: 'No placeholder text left in the manuscript.',
            pattern: '(TODO|TBD|FIXME|XXX|Lorem ipsum|\\[TBD\\]|Anonymous,? \\d{4})',
            kind: 'forbid',
            advice: 'Replace placeholder text with real content, or remove the sentence.',
        },
        {
            id: 'paper-reproducibility',
            description: 'Method/experiments mention data, seeds, environment or hyper-parameters.',
            pattern: '(dataset|data set|benchmark|seed|environment|hyperparameter|hyper-parameter|learning rate)',
            kind: 'require',
            advice: 'State the dataset, seeds, environment and key hyper-parameters so the result can be rerun.',
        },
        {
            id: 'paper-no-overclaim',
            description: 'Avoid unbounded superiority claims (they are usually not supportable).',
            pattern: '(state[- ]of[- ]the[- ]art in all|always outperforms|universally better|solves the problem completely)',
            kind: 'forbid',
            advice: 'Scope the claim to the evaluated setting, or support the generalisation with evidence.',
        },
    ],
    format: { primary: 'markdown+latex', requiresClaimTraceability: true },
    recommendedSkill: 'section-drafting',
};
/* ════════════════════════════════════════════════════════════════════════
 * Patent Profile（§9 / §10）
 * ════════════════════════════════════════════════════════════════════════ */
const PATENT = {
    type: 'patent',
    name: 'Patent Draft',
    audience: 'A patent examiner and a technically trained reader assessing novelty, inventive step and enablement.',
    purpose: 'Express the research as a protectable technical solution: a technical problem, the solution that solves it, the effects it produces, and how it is implemented.',
    structure: [
        'Technical Field',
        'Background / Technical Problem',
        'Technical Solution',
        'Technical Effects',
        'Detailed Implementation',
        'Embodiments',
        'Claims',
        'Abstract',
    ],
    constraints: [
        'A patent claim is NOT a research claim (see the writer note below): research claims state what is true about the world, patent claims define the metes and bounds of the exclusive right. Do not copy one into the other.',
        'The technical problem must be stated as a problem, independently of the paper\'s framing.',
        'The technical solution must be described as a method/apparatus a person skilled in the art could carry out.',
        'Technical effects must be stated as consequences of the solution, not as research findings.',
        'Every embodiment must be implementable from the description alone; no "as described in the paper" shortcuts.',
    ],
    qualityChecks: [
        {
            id: 'patent-technical-problem',
            description: 'Draft states an explicit technical problem.',
            pattern: '(technical problem|problem to be solved|drawback|disadvantage of the prior art)',
            kind: 'require',
            advice: 'State the technical problem the invention solves, independently of the paper framing.',
        },
        {
            id: 'patent-technical-effect',
            description: 'Draft states technical effects of the solution.',
            pattern: '(technical effect|advantage|improves|reduces|increases)',
            kind: 'require',
            advice: 'State the technical effects produced by the solution.',
        },
        {
            id: 'patent-claims-present',
            description: 'Draft contains a claims section with enumerated claims.',
            pattern: '(?m)^\\s*(?:\\d+\\.|Claim\\s+\\d+)',
            kind: 'require',
            advice: 'Enumerate the claims as numbered statements defining the scope of protection.',
        },
        {
            id: 'patent-no-paper-language',
            description: 'Do not reuse manuscript-dissertation phrasing that has no patent meaning.',
            pattern: '(in this paper|we propose in this paper|as shown in Table \\d+ of the paper|our contribution)',
            kind: 'forbid',
            advice: 'Rewrite in patent register: method/apparatus/embodiment, not "paper" and "contribution".',
        },
        {
            id: 'patent-not-just-renamed',
            description: 'Draft is not merely the paper with renamed headings (should mention implementation/embodiment).',
            pattern: '(embodiment|implementation|apparatus|module|unit|step of)',
            kind: 'require',
            advice: 'Add the implementation/embodiment content a patent needs — a renamed paper is not a patent draft.',
        },
    ],
    format: { primary: 'markdown', requiresClaimTraceability: false },
    recommendedSkill: 'patent-drafting',
};
/* ════════════════════════════════════════════════════════════════════════
 * Technical Report Profile（§12）
 * ════════════════════════════════════════════════════════════════════════ */
const TECHNICAL_REPORT = {
    type: 'technical-report',
    name: 'Technical Report',
    audience: 'Engineers and collaborators who must act on the result rather than cite it.',
    purpose: 'Document what was done and what was found in enough operational detail that a colleague can reproduce or build on it without asking questions.',
    structure: [
        'Summary',
        'Context and Scope',
        'Approach',
        'Implementation Details',
        'Results',
        'Limitations',
        'Reproduction Instructions',
        'References',
    ],
    constraints: [
        'Operational detail over argument: exact configurations, versions, commands and paths belong here.',
        'Do not claim novelty; a technical report documents work, it does not establish priority.',
        'Limitations must be stated explicitly — a report without limitations is not usable by the reader.',
        'Raw artifacts referenced by the evidence must be listed so the reader can find them.',
    ],
    qualityChecks: [
        {
            id: 'report-reproduction',
            description: 'Report contains reproduction instructions.',
            pattern: '(reproduc|how to run|command|install|environment|version)',
            kind: 'require',
            advice: 'Add reproduction instructions: environment, versions, commands, expected outputs.',
        },
        {
            id: 'report-limitations',
            description: 'Report states its limitations.',
            pattern: '(limitation|not evaluated|out of scope|caveat|assumption)',
            kind: 'require',
            advice: 'State what was not tested or is out of scope.',
        },
        {
            id: 'report-artifacts',
            description: 'Report references concrete artifacts (paths/files).',
            pattern: '([\\w./-]+\\.(csv|json|log|py|ipynb|png|pdf)|/|results/)',
            kind: 'require',
            advice: 'Point at the actual result files so the reader can inspect them.',
        },
        {
            id: 'report-no-novelty-claim',
            description: 'A technical report should not assert novelty/priority.',
            pattern: '(first to|novel contribution|state of the art|we are the first)',
            kind: 'forbid',
            advice: 'Remove novelty claims — those belong in a paper, not a technical report.',
        },
    ],
    format: { primary: 'markdown', requiresClaimTraceability: false },
    recommendedSkill: 'technical-report-writing',
};
/* ════════════════════════════════════════════════════════════════════════
 * Slides Profile（§13）
 * ════════════════════════════════════════════════════════════════════════ */
const SLIDES = {
    type: 'slides',
    name: 'Research Presentation',
    audience: 'A live audience with limited attention and no ability to re-read.',
    purpose: 'Carry one argument through the talk: what problem, why existing answers fail, what was done, what was found, what it means.',
    structure: [
        'Title',
        'Motivation / Problem',
        'Limitations of Prior Work',
        'Key Insight',
        'Approach',
        'Experiment Setup',
        'Results',
        'Analysis / Ablation',
        'Limitations',
        'Conclusion',
        'Backup',
    ],
    constraints: [
        'One idea per slide; the slide supports the speaker rather than replacing them.',
        'Every number shown must be traceable to a recorded evidence item.',
        'Report the setting for any comparison shown (dataset, baseline, metric).',
        'Do not put a claim on a slide that the evidence does not support — an audience remembers the headline, not the caveat.',
    ],
    qualityChecks: [
        {
            id: 'slides-one-idea',
            description: 'Slides are short enough to be slides, not paragraphs.',
            pattern: '(?s)^(?!.{4000,})',
            kind: 'require',
            advice: 'Cut the text; long paragraphs belong in the paper, not on a slide.',
        },
        {
            id: 'slides-evidence-refs',
            description: 'Slides reference the evidence behind the numbers shown.',
            pattern: '\\bE\\d{1,4}\\b',
            kind: 'require',
            advice: 'Tag the numbers with the evidence they come from (E001 style ids).',
        },
        {
            id: 'slides-limitations',
            description: 'Talk states limitations (protects against misreading).',
            pattern: '(limitation|caveat|not tested|only evaluated)',
            kind: 'require',
            advice: 'Include a limitations slide — it makes the rest credible.',
        },
        {
            id: 'slides-no-unbounded-claim',
            description: 'Avoid unbounded claims in slide headlines.',
            pattern: '(solves everything|always works|universally|state of the art in all)',
            kind: 'forbid',
            advice: 'Scope the claim to what was measured.',
        },
    ],
    format: { primary: 'markdown', requiresClaimTraceability: false },
    recommendedSkill: 'presentation-design',
};
/* ════════════════════════════════════════════════════════════════════════
 * 注册表
 * ════════════════════════════════════════════════════════════════════════ */
/** 第一版实现的四个 Profile（§6）。 */
export const OUTPUT_PROFILES = {
    paper: PAPER,
    patent: PATENT,
    'technical-report': TECHNICAL_REPORT,
    slides: SLIDES,
};
/** 取一个 Profile。 */
export function getOutputProfile(type) {
    return OUTPUT_PROFILES[type];
}
/** 列出全部 Profile（供设置面板 / 工具展示）。 */
export function listOutputProfiles() {
    return Object.values(OUTPUT_PROFILES);
}
/**
 * Patent claim 与 Research claim 的区别说明（§10）。
 *
 * 这是本阶段最容易做错的地方，因此**单独成文**，供 Patent Profile 的审核者阅读，
 * 也供工具在自检时引用。
 */
export const PATENT_CLAIM_NOTE = [
    '# Research Claim vs Patent Claim',
    '',
    '这两个概念**不是**同一种东西，不能互抄（Stage 5.1 §10）。',
    '',
    '## Research Claim',
    '',
    '陈述世界是怎样的，需要证据支撑：',
    '',
    '```text',
    'C003 — The proposed method improves localization accuracy.',
    '```',
    '',
    '## Patent Claim',
    '',
    '定义**排他权的边界**，由技术特征限定：',
    '',
    '```text',
    '1. A localization calibration method, comprising:',
    '     receiving first and second modality observations;',
    '     determining a common rigid structure between them;',
    '     calibrating a localization error based on said structure.',
    '```',
    '',
    '## 区别',
    '',
    '| | Research Claim | Patent Claim |',
    '|---|---|---|',
    '| 目的 | 陈述为真的事实 | 界定保护范围 |',
    '| 依据 | Evidence | 技术特征（components/steps） |',
    '| 写法 | 陈述句 | 单句、由特征限定、尽量宽而上位 |',
    '| 验伪 | 可被实验推翻 | 由新颖性/创造性衡量 |',
    '',
    '把 C003 直接抄成专利权利要求是**错的**：它没有限定任何技术特征，',
    '因此既无法界定范围，也无法通过审查。正确做法是由技术方案重新表述出特征组合。',
].join('\n');
//# sourceMappingURL=output-profiles.js.map