/**
 * ConvFusion 2.0 — 研究方法编号体系（CxxPyy）+ 中文名
 *
 * ## 为什么需要编号
 *
 * 技能库原先按 **id 字母序** 排列（`ablation-design` 排在 `baseline-selection` 前）。
 * 那是文件系统顺序，不是研究顺序：做研究时先用「理解输入」再「检索文献」，
 * 而字母序会把 `ablation-design`（消融，实验阶段）排在最前面，毫无导航价值。
 *
 * 因此给**类别**与**技能**各一套编号，排序一律按编号：
 *
 * ```text
 * C01 理解输入   C02 文献调研   C03 创新与假设   C04 研究计划   C05 资源估计
 * C06 研究决策   C07 实验验证   C08 论文写作     C09 工作评阅
 *
 * 每个类别内的技能：P01, P02, …（各自从 P01 起）
 * 完整编号 = 类别号 + 技能号，如 C02P03（文献类第 3 个：论文全文下载）
 * ```
 *
 * ## 四条设计约束
 *
 * 1. **类别序号 = 研究进展顺序**，与 `research-process.ts` 的 `DEFAULT_STAGES` 一致
 *    （理解输入 → 文献调研 → 创新假设 → 研究计划 → 资源估计 → 研究决策 → 实验验证 → 论文写作）。
 *    `review`（工作评阅）是横切能力（作用于已有研究资产），排在最后。
 * 2. **编号是常量表，不是推导出来的**。类别内顺序是**研究判断**（先检索后筛选再下载全文），
 *    无法从 id 推出来；写死在这里，并由 {@link validateSkillCodes} 守住唯一性与完整性。
 * 3. **编号与中文名同表**。两者都是"一个技能的身份信息"，分成两张表迟早会不同步；
 *    合在一起，加技能时一次登记两样。
 * 4. **单一事实来源**。技能 frontmatter 里**不写**编号/中文名 —— 否则
 *    `gen-skill-library.mjs` 重新生成会覆盖它。只在本表里维护。
 */
/** 一个类别的编号信息。 */
export interface CategoryCode {
    /** 类别 id（与 taxonomy 的 `group` 一致）。 */
    categoryId: string;
    /** 类别编号（`C01`…`C09`）。 */
    code: string;
    /** 研究顺序（决定排序，1 起）。 */
    order: number;
    /** 中文名（导出与界面展示）。 */
    label: string;
    /** 英文名（与 taxonomy 的 name 一致）。 */
    labelEn: string;
}
/**
 * 类别编号表（**顺序即研究进展**）。
 *
 * 与 `research-process.ts` 的 `DEFAULT_STAGES` 对齐：
 * problem → literature → innovation → planning → resource → decision → experiment → writing。
 */
export declare const CATEGORY_CODES: readonly CategoryCode[];
/** 一个技能的身份信息：编号 + 中文名。 */
export interface SkillCodeEntry {
    /** 完整编号（`CxxPyy`）。 */
    code: string;
    /** 中文名（导出与界面展示）。 */
    label: string;
}
/**
 * 技能编号表：`skillId` → `{ code, label }`。
 *
 * ⚠️ 类别内顺序是**研究判断**，不要按字母序重排：
 *   - C01：先理解输入 → 判断意图 → 提出话题 → 摸清自己的领域/基础 → 引导方向
 *   - C02：先检索 → 再筛选 → 取全文 → 做综述 → 形成 landscape
 *   - C03：先生成研究主题 → 找缺口 → 评新颖性 → 立假设 → 定贡献
 *   - C04：先定过程 → 组策略 → 展开方法 → 排流水线 → 评计划/研究风险
 *   - C05：先估资源需求 → 选基础设施 → 定可行性与资源规划
 *   - C06：先排序主题 → 收敛 → 选择 → go/no-go
 *   - C07：先设计 → **立即仿真** → 选数据集 → 定基线 → 定评测 → 消融 → 复现规范 → 结果/对比分析 → 证据评估
 *   - C08：先定投稿渠道 → 架构 → 叙事 → 起草 → 公式/图表 → 修订 → 编译 → 其它文体
 *   - C09：评阅场合从早到晚
 */
export declare const SKILL_CODES: Readonly<Record<string, SkillCodeEntry>>;
/** 取技能的完整编号（未登记返回 `undefined`）。 */
export declare function skillCode(skillId: string): string | undefined;
/** 取技能的中文名（未登记返回 `undefined`）。 */
export declare function skillLabel(skillId: string): string | undefined;
/**
 * 反查：编号（`CxxPyy`）→ skillId。
 *
 * 用途：定制文件允许**用编号作键**（人好记），读取时在这里解析成稳定的 skillId。
 *
 * ⚠️ 方向只能是「编号 → id」。反过来的危险在于编号**位置相关**：类别内插入一个技能，
 * 后面的 `P` 号会整体顺移，于是旧的编号键会指到**另一个技能**上 —— 定制内容悄悄错位。
 * 因此编号只作为可读别名被接受，写入一律落 id（见 `parseCustomizations`）。
 */
export declare function skillIdByCode(code: string): string | undefined;
/** 是否形如技能编号（`CxxPyy`）。 */
export declare function looksLikeSkillCode(key: string): boolean;
/** 取类别的编号信息（未登记返回 `undefined`）。 */
export declare function categoryCodeInfo(categoryId: string | undefined): CategoryCode | undefined;
/** 取类别的短编号（`C02`）。 */
export declare function categoryCode(categoryId: string | undefined): string | undefined;
/**
 * 排序键：先类别序号，再技能序号。
 *
 * 未登记编号的技能排在最后（不静默丢弃 —— {@link validateSkillCodes} 会报出来）。
 */
export declare function skillSortKey(skillId: string): string;
/** 按编号排序（不改入参）。 */
export declare function sortByCode<T>(items: readonly T[], idOf: (item: T) => string): T[];
/** 校验结果。 */
export interface CodeValidation {
    /** 已登记、且技能存在的 id 数。 */
    mapped: number;
    /** 技能存在但没编号（漏登记）。 */
    unmapped: string[];
    /** 有编号但没有对应技能（表里多余 / 改名后忘了改）。 */
    orphans: string[];
    /** 重复编号。 */
    duplicates: Array<{
        code: string;
        skillIds: string[];
    }>;
    /** 编号格式非法。 */
    malformed: Array<{
        skillId: string;
        code: string;
    }>;
    /** 缺中文名的技能。 */
    missingLabels: string[];
    /** 是否全部通过。 */
    ok: boolean;
}
/**
 * 校验编号表与真实技能集合是否一致。
 *
 * 这是**唯一性、完整性与中文名**的守门人：编号少一个、重一个、格式错一个、
 * 或者忘了配中文名，都算失败。供验证脚本与设置页诊断调用。
 *
 * @param skillIds 实际存在的技能 id（如 `listSystemSkills().map(s => s.id)`）
 */
export declare function validateSkillCodes(skillIds: readonly string[]): CodeValidation;
//# sourceMappingURL=skill-codes.d.ts.map