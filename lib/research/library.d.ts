/**
 * ConvFusion 2.0 — Skill Library 视图与 Harness 集成
 *
 * ## 架构（用户拍板）
 *
 * ```text
 * 系统 Skill Library（包内资产，只读，我们维护）
 *        +
 * 用户定制（【本地设置】→ 独立文件，拼接覆盖）
 *        ↓
 * 模型看到的 Skill = composeSkillContent(基线正文, 用户覆盖)
 * ```
 *
 * **用户定制不写进 Skill 库** —— 库本身恒定不变，个性化只发生在合成时。
 * 因此本模块没有"创建 / Fork / 删除 Skill"这类操作；改方法请改设置里的定制文本。
 *
 * ## 本模块负责
 *
 * - **视图**：把系统库 × 用户覆盖合成成"当前实际生效的 Skill"；
 * - **发现**：Search / Category 过滤 / 收藏 / 使用记录；
 * - **Harness 集成**：`ctx.skills.registerProvider()` 暴露给原生 Skill 通道。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SkillCategory } from './taxonomy.js';
import type { SkillCustomizationStore, SkillCustomizations } from './skill-customization.js';
import type { SkillDocument, SkillType } from './skills.js';
/** Library 视图中的一个 Skill。 */
export interface SkillEntry {
    document: SkillDocument;
    purpose: string;
    whenToUse: string;
    categoryName: string;
    group?: string;
    /** 用户对该 Skill 的覆盖章节数（0 = 完全使用基线）。 */
    customizedSections: number;
    /** 实际生效的正文（基线 + 用户覆盖拼接）。 */
    effectiveContent: string;
}
/** Library 视图。 */
export interface SkillLibraryView {
    workspace: string;
    entries: SkillEntry[];
    categories: SkillCategory[];
    groups: SkillCategory[];
    counts: {
        system: number;
        user: number;
        derived: number;
        total: number;
        customized: number;
    };
}
/**
 * 按 id 取某个能力的**生效正文**（基线 + 用户覆盖的合成结果）。
 *
 * 用途：过程定义（`research-process`）本身是一个能力，用户可以在设置里覆盖它 ——
 * 因此读取它的正文必须走**合成后**的内容，而不是基线文件。
 *
 * @returns 生效正文；能力不存在时返回 `undefined`
 */
export declare function effectiveSkillContentById(id: string, store?: SkillCustomizationStore): string | undefined;
/** 合成某 Skill 的实际生效正文（基线 + 用户覆盖）。 */
export declare function effectiveSkillContent(doc: SkillDocument, customizations: SkillCustomizations): string;
/**
 * 构建 Library 视图（读盘 + 合成；纯投影，无副作用）。
 *
 * @param store 用户定制来源；缺省为空（只看基线）
 */
export declare function loadSkillLibrary(workspace: string, store?: SkillCustomizationStore): SkillLibraryView;
export interface DiscoverRequest {
    search?: string;
    category?: string;
    types?: readonly SkillType[];
    limit?: number;
}
/** 统一的 Skill 发现入口（Search / Category）。 */
export declare function discoverSkills(workspace: string, request?: DiscoverRequest, store?: SkillCustomizationStore): SkillEntry[];
/**
 * 轻量建议（§17）。
 *
 * ⚠️ 只给"可能相关的能力"，**不**给"下一步该做什么" —— 后者是 Agent 的判断（Stage 1 §10）。
 */
export declare function recommendSkills(workspace: string, context: {
    topic?: string;
    keywords?: readonly string[];
}, store?: SkillCustomizationStore): SkillEntry[];
/** Skill 摘要（注入 Research Context 用）。 */
export interface SkillSummary {
    id: string;
    name: string;
    purpose: string;
    whenToUse: string;
    category?: string;
    type: SkillType;
    path: string;
}
/** 生成 Skill 摘要列表（只用基线信息；定制不影响"何时该用"的判断依据）。 */
export declare function skillSummaries(_workspace: string): SkillSummary[];
/** Skill 的方法论主体（基线）。 */
export declare function skillMethodBody(_workspace: string, id: string): string | undefined;
export declare const SKILL_PROVIDER_NAME = "convfusion";
/** ConvFusion skill 优先级（小于 BUNDLED_SKILL_RANK=600，同名时我们的能力优先）。 */
export declare const CONVFUSION_SKILL_RANK = 500;
/** 结构化镜像 `@deepseek-ai/dsh-skill` 的 provider 契约（避免依赖未安装的包）。 */
interface SkillInvocationPolicy {
    readonly modelInvocable: boolean;
    readonly userInvocable: boolean;
}
interface SkillCandidate {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly invocation: SkillInvocationPolicy;
    readonly source: string;
    readonly provider: string;
    readonly rank: number;
    readonly locator: unknown;
    readonly path?: string;
}
interface SkillDefinition extends Omit<SkillCandidate, 'rank' | 'locator'> {
    readonly content: string;
    readonly resourceBase?: {
        readonly kind: 'directory';
        readonly path: string;
    };
    readonly metadata?: Readonly<Record<string, unknown>>;
}
interface SkillLookupOptions {
    readonly cwd?: string | undefined;
    readonly signal?: AbortSignal | undefined;
}
export interface ConvFusionSkillProvider {
    readonly name: string;
    readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[]>;
    readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>;
}
/**
 * 把系统 Skill Library 暴露为 Harness Skill 候选。
 *
 * ⚠️ **不使用 cwd 定位 Skill**：系统库是包内资产，任何 workspace 都看到同一套能力。
 * 用户定制在 `get()` 时实时读取并拼接，因此设置端改完立刻生效。
 *
 * @param store 用户定制来源（可选）
 */
export declare function createConvFusionSkillProvider(store?: SkillCustomizationStore): (control: {
    signal: AbortSignal;
    invalidate: () => void;
}) => ConvFusionSkillProvider;
export declare function mountSkillProvider(ctx: Context, store?: SkillCustomizationStore): () => void;
/** 便捷：把可选 store 归一（未配置时用内存空实现）。 */
export declare function orEmptyStore(store?: SkillCustomizationStore): SkillCustomizationStore;
/** 供测试/UI：Skill 总数。 */
export declare function skillCounts(): {
    total: number;
};
/** 供测试/UI：某个 Skill 的分类名。 */
export declare function skillCategoryName(doc: SkillDocument): string;
export {};
//# sourceMappingURL=library.d.ts.map