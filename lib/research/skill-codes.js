/**
 * ConvFusion 2.0 — 研究方法编号体系（CxxPyy）+ 中文名
 *
 * ## 为什么需要编号
 *
 * 技能库原先按 **id 字母序** 排列（`ablation-design` 排在 `baseline-selection` 前）。
 * 那是文件系统顺序，不是研究顺序：做研究时先用「理解问题」再「检索文献」，
 * 而字母序会把 `ablation-design`（消融，实验阶段）排在最前面，毫无导航价值。
 *
 * 因此给**类别**与**技能**各一套编号，排序一律按编号：
 *
 * ```text
 * C01 理解问题   C02 文献   C03 创新与假设   C04 方法
 * C05 实验       C06 分析   C07 决策         C08 写作   C09 研究管理
 *
 * 每个类别内的技能：P01, P02, …（各自从 P01 起）
 * 完整编号 = 类别号 + 技能号，如 C02P03（文献类第 3 个：论文全文下载）
 * ```
 *
 * ## 四条设计约束
 *
 * 1. **类别序号 = 研究进展顺序**，与 `research-process.ts` 的 `DEFAULT_STAGES` 一致
 *    （理解问题 → 文献 → 创新与假设 → 方法 → 实验 → 分析 → 决策 → 写作）。
 *    `research-management` 是横切能力（不专属某个阶段），排在最后。
 * 2. **编号是常量表，不是推导出来的**。类别内顺序是**研究判断**（先检索后筛选再下载全文），
 *    无法从 id 推出来；写死在这里，并由 {@link validateSkillCodes} 守住唯一性与完整性。
 * 3. **编号与中文名同表**。两者都是"一个技能的身份信息"，分成两张表迟早会不同步；
 *    合在一起，加技能时一次登记两样。
 * 4. **单一事实来源**。技能 frontmatter 里**不写**编号/中文名 —— 否则
 *    `gen-skill-library.mjs` 重新生成会覆盖它。只在本表里维护。
 */
/**
 * 类别编号表（**顺序即研究进展**）。
 *
 * 与 `research-process.ts` 的 `DEFAULT_STAGES` 对齐：
 * problem → literature → innovation → method → experiment → analysis → decision → writing。
 */
export const CATEGORY_CODES = [
    { categoryId: 'research-understanding', code: 'C01', order: 1, label: '理解问题', labelEn: 'Research Understanding' },
    { categoryId: 'literature', code: 'C02', order: 2, label: '文献', labelEn: 'Literature' },
    { categoryId: 'innovation', code: 'C03', order: 3, label: '创新与假设', labelEn: 'Innovation' },
    { categoryId: 'methodology', code: 'C04', order: 4, label: '方法', labelEn: 'Methodology' },
    { categoryId: 'experiment', code: 'C05', order: 5, label: '实验', labelEn: 'Experiment' },
    { categoryId: 'analysis', code: 'C06', order: 6, label: '分析', labelEn: 'Analysis' },
    { categoryId: 'research-decision', code: 'C07', order: 7, label: '决策', labelEn: 'Research Decision' },
    { categoryId: 'academic-writing', code: 'C08', order: 8, label: '写作', labelEn: 'Academic Writing' },
    { categoryId: 'research-management', code: 'C09', order: 9, label: '研究管理', labelEn: 'Research Management' },
];
/**
 * 技能编号表：`skillId` → `{ code, label }`。
 *
 * ⚠️ 类别内顺序是**研究判断**，不要按字母序重排：
 *   - C01：先理解主题 → 判断意图 → 定义问题 → 摸清自己的领域/基础
 *   - C02：先检索 → 再筛选 → 取全文 → 做综述 → 形成 landscape
 *   - C03：先发散（生成想法）→ 找缺口 → 评新颖性 → 立假设 → 定贡献
 *   - C05：先设计 → 选数据集 → 定基线 → 定评测 → 消融 → 复现规范 → 预期结果
 *   - C07：先探方向 → 排序 → 收敛 → 选择 → 评估风险/可行性 → go/no-go → venue
 *   - C08：先架构 → 叙事 → 起草 → 公式/图表 → 修订 → 编译 → 其它文体
 */
export const SKILL_CODES = {
    // ── C01 理解问题 ──
    'topic-understanding': { code: 'C01P01', label: '主题理解' },
    'research-intent-assessment': { code: 'C01P02', label: '研究意图判断' },
    'problem-definition': { code: 'C01P03', label: '问题定义' },
    'research-domain-profiling': { code: 'C01P04', label: '研究领域画像' },
    'research-foundation-assessment': { code: 'C01P05', label: '研究基础评估' },
    // ── C02 文献 ──
    'literature-search': { code: 'C02P01', label: '文献检索' },
    'literature-screening': { code: 'C02P02', label: '文献筛选' },
    'paper-fulltext-download': { code: 'C02P03', label: '论文全文下载' },
    'literature-review': { code: 'C02P04', label: '文献综述' },
    'research-landscape': { code: 'C02P05', label: '研究全景' },
    // ── C03 创新与假设 ──
    'research-idea-generation': { code: 'C03P01', label: '研究想法生成' },
    'innovation-gap-analysis': { code: 'C03P02', label: '创新缺口分析' },
    'idea-novelty-assessment': { code: 'C03P03', label: '新颖性评估' },
    'hypothesis-formulation': { code: 'C03P04', label: '假设形式化' },
    'contribution-design': { code: 'C03P05', label: '贡献设计' },
    // ── C04 方法 ──
    'research-method-design': { code: 'C04P01', label: '研究方法设计' },
    // ── C05 实验 ──
    'experiment-design': { code: 'C05P01', label: '实验设计' },
    'dataset-selection': { code: 'C05P02', label: '数据集选择' },
    'baseline-selection': { code: 'C05P03', label: '基线选择' },
    'evaluation-protocol': { code: 'C05P04', label: '评测协议' },
    'ablation-design': { code: 'C05P05', label: '消融设计' },
    'reproducible-implementation-spec': { code: 'C05P06', label: '可复现实现规范' },
    'simulation-baseline': { code: 'C05P07', label: '仿真预期结果' },
    // ── C06 分析 ──
    'result-analysis': { code: 'C06P01', label: '结果分析' },
    'comparative-analysis': { code: 'C06P02', label: '对比分析' },
    'evidence-assessment': { code: 'C06P03', label: '证据评估' },
    // ── C07 决策 ──
    'research-direction-steering': { code: 'C07P01', label: '研究方向引导' },
    'research-topic-ranking': { code: 'C07P02', label: '研究主题排序' },
    'research-direction': { code: 'C07P03', label: '研究方向收敛' },
    'research-direction-selection': { code: 'C07P04', label: '研究方向选择' },
    'plan-risk-assessment': { code: 'C07P05', label: '计划风险评估' },
    'research-risk-assessment': { code: 'C07P06', label: '研究风险评估' },
    'feasibility-cost-and-resource-plan': { code: 'C07P07', label: '可行性与资源规划' },
    'go-no-go-decision': { code: 'C07P08', label: '继续/放弃决策' },
    'venue-fit-decision': { code: 'C07P09', label: '投稿渠道决策' },
    // ── C08 写作 ──
    'paper-architecture': { code: 'C08P01', label: '论文架构' },
    'research-narrative': { code: 'C08P02', label: '研究叙事' },
    'section-drafting': { code: 'C08P03', label: '章节起草' },
    'equation-formalization': { code: 'C08P04', label: '公式形式化' },
    'visual-evidence-selection': { code: 'C08P05', label: '图表证据选择' },
    'manuscript-revision': { code: 'C08P06', label: '手稿修订' },
    'submission-compile-and-format': { code: 'C08P07', label: '投稿编译与格式化' },
    'technical-report-writing': { code: 'C08P08', label: '技术报告写作' },
    'patent-drafting': { code: 'C08P09', label: '专利撰写' },
    'presentation-design': { code: 'C08P10', label: '演讲设计' },
    // ── C09 研究管理 ──
    'research-process': { code: 'C09P01', label: '研究过程定义' },
    'research-strategy-portfolio': { code: 'C09P02', label: '研究策略组合' },
    'experiment-pipeline-design': { code: 'C09P03', label: '实验流水线设计' },
    'resource-requirement-estimation': { code: 'C09P04', label: '资源需求估算' },
    'infrastructure-cost-selection': { code: 'C09P05', label: '基础设施选型' },
};
/* ════════════════════════════════════════════════════════════════════════
 * 查询
 * ════════════════════════════════════════════════════════════════════════ */
/** 取技能的完整编号（未登记返回 `undefined`）。 */
export function skillCode(skillId) {
    return SKILL_CODES[skillId]?.code;
}
/** 取技能的中文名（未登记返回 `undefined`）。 */
export function skillLabel(skillId) {
    return SKILL_CODES[skillId]?.label;
}
/** 取类别的编号信息（未登记返回 `undefined`）。 */
export function categoryCodeInfo(categoryId) {
    if (!categoryId)
        return undefined;
    // 兼容 `literature/literature-search` 这类完整分类 id
    const group = categoryId.includes('/') ? categoryId.split('/')[0] : categoryId;
    return CATEGORY_CODES.find((c) => c.categoryId === group);
}
/** 取类别的短编号（`C02`）。 */
export function categoryCode(categoryId) {
    return categoryCodeInfo(categoryId)?.code;
}
/**
 * 排序键：先类别序号，再技能序号。
 *
 * 未登记编号的技能排在最后（不静默丢弃 —— {@link validateSkillCodes} 会报出来）。
 */
export function skillSortKey(skillId) {
    const code = SKILL_CODES[skillId]?.code;
    if (code)
        return code;
    return `Z${skillId}`;
}
/** 按编号排序（不改入参）。 */
export function sortByCode(items, idOf) {
    return [...items].sort((a, b) => skillSortKey(idOf(a)).localeCompare(skillSortKey(idOf(b))));
}
/**
 * 校验编号表与真实技能集合是否一致。
 *
 * 这是**唯一性、完整性与中文名**的守门人：编号少一个、重一个、格式错一个、
 * 或者忘了配中文名，都算失败。供验证脚本与设置页诊断调用。
 *
 * @param skillIds 实际存在的技能 id（如 `listSystemSkills().map(s => s.id)`）
 */
export function validateSkillCodes(skillIds) {
    const present = new Set(skillIds);
    const unmapped = skillIds.filter((id) => !SKILL_CODES[id]).sort();
    const orphans = Object.keys(SKILL_CODES)
        .filter((id) => !present.has(id))
        .sort();
    const byCode = new Map();
    const malformed = [];
    const missingLabels = [];
    for (const [skillId, entry] of Object.entries(SKILL_CODES)) {
        if (!/^C\d{2}P\d{2}$/.test(entry.code))
            malformed.push({ skillId, code: entry.code });
        if (!entry.label.trim())
            missingLabels.push(skillId);
        const list = byCode.get(entry.code) ?? [];
        list.push(skillId);
        byCode.set(entry.code, list);
    }
    const duplicates = [...byCode.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([code, skillIds]) => ({ code, skillIds: skillIds.sort() }));
    return {
        mapped: skillIds.filter((id) => SKILL_CODES[id]).length,
        unmapped,
        orphans,
        duplicates,
        malformed,
        missingLabels: missingLabels.sort(),
        ok: unmapped.length === 0 &&
            orphans.length === 0 &&
            duplicates.length === 0 &&
            malformed.length === 0 &&
            missingLabels.length === 0,
    };
}
//# sourceMappingURL=skill-codes.js.map