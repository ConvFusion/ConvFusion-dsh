/**
 * ConvFusion v0.5.6 — Research Decision Policy（规格 §7）
 *
 * > Skill 给 LLM 方法，Policy 给 LLM 边界。
 *
 * ```text
 * Skill → LLM reasoning → Decision Policy → Research IR
 * ```
 *
 * 本模块是**边界**：每种决策类型需要哪些字段（required）、受哪些结构约束
 * （constraints → `validate.ts` 的 R1xx 规则）。它刻意不含任何"科研是否正确"
 * 的判断（§19）—— 只保证决策**可执行、可验证**。
 *
 * 后续 Stage 3 技能迁移时，Skill frontmatter 可以声明自己产生哪些
 * decision_types / required_ir，进而绑定到这里的 Policy；Policy 注册表
 * 本身就是为此预留的挂点。
 */
/* ════════════════════════════════════════════════════════════════════════
 * 决策类型（闭集 —— §4 Typed 的前提）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 科研决策类型闭集。
 *
 * 覆盖长期科研决策的高频判断（方向 / 假设 / 实验 / 基线 / 方法 / 证据 / 主张 /
 * 风险 / 停止）。新增类型 = 新增 Policy 条目，而不是放开自由文本。
 */
export const DECISION_TYPES = [
    /** 是否推进、往哪个方向推进。 */
    'research_direction',
    /** 是否修改假设。 */
    'hypothesis_revision',
    /** 如何区分（判别）多个假设。 */
    'hypothesis_discrimination',
    /** 设计新实验。 */
    'experiment_design',
    /** 修改既有实验（加对照、换指标等）。 */
    'experiment_revision',
    /** 选择/替换 baseline。 */
    'baseline_selection',
    /** 选择研究方法/模型。 */
    'method_selection',
    /** 比较多个方法。 */
    'compare_methods',
    /** 当前证据是否足以支持主张。 */
    'evidence_sufficiency',
    /** 更新科学主张。 */
    'claim_update',
    /** 风险识别与处置。 */
    'risk_management',
    /** 是否停止当前研究路径。 */
    'stop_path',
];
const BASE_REQUIRED = ['objective', 'selected', 'rationale'];
/** Decision Policy 注册表（§7：Policy 给边界）。 */
export const DECISION_POLICIES = {
    research_direction: {
        type: 'research_direction',
        label: '研究方向',
        question: '当前应该往哪个方向推进？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required'],
    },
    hypothesis_revision: {
        type: 'hypothesis_revision',
        label: '假设修订',
        question: '是否应该修改假设？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required', 'observable_outcome_required'],
    },
    hypothesis_discrimination: {
        type: 'hypothesis_discrimination',
        label: '假设判别',
        question: '怎样区分当前的几个假设？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required', 'measurable_outcome_required', 'observable_outcome_required'],
    },
    experiment_design: {
        type: 'experiment_design',
        label: '实验设计',
        question: '新实验怎么设计？',
        required: [...BASE_REQUIRED],
        constraints: [
            'alternatives_required',
            'at_least_one_baseline',
            'measurable_outcome_required',
            'evidence_requirement_required',
        ],
    },
    experiment_revision: {
        type: 'experiment_revision',
        label: '实验修订',
        question: '已有实验要怎么改？',
        required: ['objective', 'alternatives', 'selected', 'rationale'],
        constraints: ['alternatives_required', 'measurable_outcome_required', 'evidence_requirement_required'],
    },
    baseline_selection: {
        type: 'baseline_selection',
        label: '基线选择',
        question: '应该与哪些 baseline 比较？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required', 'at_least_one_baseline'],
    },
    method_selection: {
        type: 'method_selection',
        label: '方法选择',
        question: '应该采用哪种方法/模型？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required', 'measurable_outcome_required'],
    },
    compare_methods: {
        type: 'compare_methods',
        label: '方法比较',
        question: '这些方法孰优孰劣、在什么指标上？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required', 'at_least_one_baseline', 'measurable_outcome_required'],
    },
    evidence_sufficiency: {
        type: 'evidence_sufficiency',
        label: '证据充分性',
        question: '当前证据是否足以支持主张？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required', 'evidence_requirement_required'],
    },
    claim_update: {
        type: 'claim_update',
        label: '主张更新',
        question: '是否应该更新科学主张？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required', 'evidence_required_before_claim_update'],
    },
    risk_management: {
        type: 'risk_management',
        label: '风险处置',
        question: '当前风险如何处置？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required'],
    },
    stop_path: {
        type: 'stop_path',
        label: '路径停止',
        question: '是否应该停止当前研究路径？',
        required: [...BASE_REQUIRED],
        constraints: ['alternatives_required'],
    },
};
/** 取 Policy；未知类型返回 undefined（调用方报 R002）。 */
export function decisionPolicy(type) {
    return DECISION_POLICIES[type];
}
//# sourceMappingURL=policy.js.map