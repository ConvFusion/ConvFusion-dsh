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
import { SYSTEM_CATEGORIES, categoryGroup, categoryName, systemGroups } from './taxonomy.js';
import { composeSkillContent, createMemoryCustomizationStore } from './skill-customization.js';
import { filterSkills, listSystemSkills, skillMethod, skillPurpose, skillWhenToUse } from './skills.js';
/**
 * 按 id 取某个能力的**生效正文**（基线 + 用户覆盖的合成结果）。
 *
 * 用途：过程定义（`research-process`）本身是一个能力，用户可以在设置里覆盖它 ——
 * 因此读取它的正文必须走**合成后**的内容，而不是基线文件。
 *
 * @returns 生效正文；能力不存在时返回 `undefined`
 */
export function effectiveSkillContentById(id, store) {
    const doc = listSystemSkills().find((d) => d.id === id);
    if (!doc)
        return undefined;
    return effectiveSkillContent(doc, store?.load() ?? {});
}
/** 合成某 Skill 的实际生效正文（基线 + 用户覆盖）。 */
export function effectiveSkillContent(doc, customizations) {
    return composeSkillContent(doc.body, customizations[doc.id]);
}
/**
 * 构建 Library 视图（读盘 + 合成；纯投影，无副作用）。
 *
 * @param store 用户定制来源；缺省为空（只看基线）
 */
export function loadSkillLibrary(workspace, store) {
    const customizations = store?.load() ?? {};
    const docs = listSystemSkills();
    const entries = docs.map((document) => {
        const overrides = customizations[document.id] ?? {};
        return {
            document,
            purpose: skillPurpose(document),
            whenToUse: skillWhenToUse(document),
            categoryName: categoryName(document.category, []),
            ...(categoryGroup(document.category) ? { group: categoryGroup(document.category) } : {}),
            customizedSections: Object.values(overrides).filter((t) => t.trim()).length,
            effectiveContent: effectiveSkillContent(document, customizations),
        };
    });
    const count = (t) => entries.filter((e) => e.document.type === t).length;
    return {
        workspace,
        entries,
        categories: [...SYSTEM_CATEGORIES],
        groups: [...systemGroups()],
        counts: {
            system: count('system'),
            user: count('user'),
            derived: count('derived'),
            total: entries.length,
            customized: entries.filter((e) => e.customizedSections > 0).length,
        },
    };
}
/** 统一的 Skill 发现入口（Search / Category）。 */
export function discoverSkills(workspace, request = {}, store) {
    const view = loadSkillLibrary(workspace, store);
    let entries = view.entries;
    const docs = filterSkills(entries.map((e) => e.document), {
        ...(request.search ? { search: request.search } : {}),
        ...(request.category ? { category: request.category } : {}),
        ...(request.types ? { types: request.types } : {}),
    });
    const keep = new Set(docs.map((d) => d.id));
    entries = entries.filter((e) => keep.has(e.document.id));
    if (request.limit && request.limit > 0)
        entries = entries.slice(0, request.limit);
    return entries;
}
/**
 * 轻量建议（§17）。
 *
 * ⚠️ 只给"可能相关的能力"，**不**给"下一步该做什么" —— 后者是 Agent 的判断（Stage 1 §10）。
 */
export function recommendSkills(workspace, context, store) {
    const view = loadSkillLibrary(workspace, store);
    const terms = [context.topic ?? '', ...(context.keywords ?? [])]
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/)
        .filter((t) => t.length >= 3);
    if (terms.length === 0)
        return [];
    return view.entries
        .map((e) => {
        const hay = `${e.document.name} ${e.document.id} ${e.purpose} ${e.whenToUse} ${e.document.category ?? ''}`.toLowerCase();
        const score = terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
        return { e, score };
    })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((x) => x.e);
}
/** 生成 Skill 摘要列表（只用基线信息；定制不影响"何时该用"的判断依据）。 */
export function skillSummaries(_workspace) {
    return listSystemSkills()
        .filter((d) => d.status === 'active')
        .map((d) => ({
        id: d.id,
        name: d.name,
        purpose: skillPurpose(d),
        whenToUse: skillWhenToUse(d),
        ...(d.category ? { category: d.category } : {}),
        type: d.type,
        path: d.relPath,
    }));
}
/** Skill 的方法论主体（基线）。 */
export function skillMethodBody(_workspace, id) {
    const doc = listSystemSkills().find((d) => d.id === id);
    return doc ? skillMethod(doc) : undefined;
}
/* ════════════════════════════════════════════════════════════════════════
 * Harness 原生 Skill Provider
 * ════════════════════════════════════════════════════════════════════════ */
export const SKILL_PROVIDER_NAME = 'convfusion';
/** ConvFusion skill 优先级（小于 BUNDLED_SKILL_RANK=600，同名时我们的能力优先）。 */
export const CONVFUSION_SKILL_RANK = 500;
/**
 * 把系统 Skill Library 暴露为 Harness Skill 候选。
 *
 * ⚠️ **不使用 cwd 定位 Skill**：系统库是包内资产，任何 workspace 都看到同一套能力。
 * 用户定制在 `get()` 时实时读取并拼接，因此设置端改完立刻生效。
 *
 * @param store 用户定制来源（可选）
 */
export function createConvFusionSkillProvider(store) {
    return (control) => {
        void control;
        return {
            name: SKILL_PROVIDER_NAME,
            async list(options) {
                if (options.signal?.aborted)
                    return [];
                return listSystemSkills()
                    .filter((d) => d.status === 'active')
                    .map((d) => ({
                    name: d.id,
                    description: skillPurpose(d).split('\n')[0] || d.name,
                    ...(skillWhenToUse(d).split('\n')[0] ? { whenToUse: skillWhenToUse(d).split('\n')[0] } : {}),
                    invocation: { modelInvocable: true, userInvocable: false },
                    source: 'bundled',
                    provider: SKILL_PROVIDER_NAME,
                    rank: CONVFUSION_SKILL_RANK,
                    locator: { id: d.id },
                    path: d.path,
                }));
            },
            async get(candidate, options) {
                if (options.signal?.aborted)
                    return undefined;
                const doc = listSystemSkills().find((d) => d.id === candidate.name);
                if (!doc)
                    return undefined;
                // 每次加载都重新读定制：设置里改完即可生效（刻意不缓存）
                const customizations = store?.load() ?? {};
                const overrides = customizations[doc.id] ?? {};
                return {
                    name: candidate.name,
                    description: candidate.description,
                    ...(candidate.whenToUse ? { whenToUse: candidate.whenToUse } : {}),
                    invocation: candidate.invocation,
                    source: candidate.source,
                    provider: SKILL_PROVIDER_NAME,
                    resourceBase: { kind: 'directory', path: doc.path.replace(/\/[^/]+$/, '') },
                    content: effectiveSkillContent(doc, customizations),
                    path: doc.path,
                    metadata: {
                        type: doc.type,
                        ...(doc.category ? { category: doc.category } : {}),
                        version: doc.version,
                        customizedSections: Object.values(overrides).filter((t) => t.trim()).length,
                    },
                };
            },
        };
    };
}
export function mountSkillProvider(ctx, store) {
    // `skills` 已在插件 inject 列表里声明（未声明时属性访问会抛错，见 index.ts 注释）。
    const skills = ctx.skills;
    return skills.registerProvider(createConvFusionSkillProvider(store));
}
/** 便捷：把可选 store 归一（未配置时用内存空实现）。 */
export function orEmptyStore(store) {
    return store ?? createMemoryCustomizationStore();
}
/** 供测试/UI：Skill 总数。 */
export function skillCounts() {
    return { total: listSystemSkills().length };
}
/** 供测试/UI：某个 Skill 的分类名。 */
export function skillCategoryName(doc) {
    return categoryName(doc.category, []);
}
//# sourceMappingURL=library.js.map