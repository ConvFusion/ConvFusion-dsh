/**
 * ConvFusion 2.0 — 用户定制 Skill 覆盖层
 *
 * ## 架构（用户拍板）
 *
 * ```text
 * 系统 Skill Library（包内资产，我们维护，**只读**）
 *        +
 * 用户定制（【设置】-【ConvFusion】-【本地研究方法】，按类别逐个定制可覆盖项）
 *        ↓ 以**拼接**方式合成
 * 模型看到的 Skill 正文
 * ```
 *
 * **用户定制绝不会写进系统 Skill 库。** 库本身不发生变化；用户只提供一段文本，
 * 在合成时被拼接进去（用户文本在前，原有方法主体与输出契约保持在后 —— 与原
 * ConvFusion 的 `user_skill` 层语义一致：注入个人方法而不破坏输出契约）。
 *
 * ## 存储：独立文件，设置里只存**文件名**
 *
 * 用户拍板：**用户定制保存为文件，设置里配置的是文件名** ——
 * 这样设置文件绝不会因为定制内容增多而过大。
 *
 * ```text
 * ~/.dsh/settings.yaml
 *   convfusion:
 *     customizationFile: skill-customizations.json    ← 只有文件名
 *
 * ~/.dsh/convfusion/skill-customizations.json       ← 定制内容在这里
 *   { "research-gap-analysis": { "Research Method": "我通常先……" } }
 * ```
 *
 * 存哪里被抽成 {@link SkillCustomizationStore}，因此换成别的位置（或云端同步）
 * 只需换一个实现，调用方（provider / 设置面 / Research Context）不动。
 *
 * ## 设置界面需要什么
 *
 * 【本地研究方法】要能**列出每个类别下允许定制的提示词**，因此本模块提供
 * {@link listCustomizationPoints}：把系统库按类别展开成
 * `类别 → 技能 → 可定制项`，并标注用户当前是否已覆盖。
 */
import type { SkillDocument } from './skills.js';
/**
 * 一个可定制的部分（"提示词"）。
 *
 * 粒度是 Skill 的章节 —— 与原 ConvFusion 的节点提示词定制对应，
 * 但 v2 里按 **Category → Skill → 可定制项** 组织（原为 模块 → 节点）。
 */
export interface CustomizationPoint {
    /** Skill id（如 `research-gap-analysis`）。 */
    skillId: string;
    /** Skill 显示名。 */
    skillName: string;
    /** 所属类别（顶层大类，设置面板的一级分组）。 */
    category: string;
    /** 可定制章节标题（如 `Research Method`）。 */
    section: string;
    /** 该部分的基线内容（只读展示，让用户知道自己在覆盖什么）。 */
    base: string;
    /** 是否已被用户覆盖。 */
    overridden: boolean;
    /** 用户当前的覆盖文本。 */
    userText?: string;
}
/**
 * 允许用户定制的章节。
 *
 * ⚠️ **刻意不包含** `Expected Output` / `Evidence Requirements` 之外的结构性内容：
 * Skill 的输出契约是模型可靠性的基础，用户改它会让 Skill 失效。
 * 这对应原 ConvFusion 把用户文本拼在**前面**、把 JSON 输出要求留在**最后**的设计。
 */
export declare const CUSTOMIZABLE_SECTIONS: readonly string[];
/**
 * 用户覆盖集合（持久化形状，与设置里的 JSON 完全一致）。
 *
 * ```json
 * { "research-gap-analysis": { "Research Method": "我通常先……" } }
 * ```
 */
export type SkillCustomizations = Record<string, Record<string, string>>;
/** 覆盖存储后端。 */
export interface SkillCustomizationStore {
    /** 读取全部覆盖。 */
    load(): SkillCustomizations;
    /** 写入一个覆盖（`text` 为空 → 清除该覆盖）。 */
    set(skillId: string, section: string, text: string): void;
    /** 后端说明（设置面板展示用，让用户知道定制存在哪里）。 */
    readonly description: string;
}
/** 解析设置里的 JSON 字符串（损坏 → 空，绝不让坏数据让 Skill 不可用）。 */
export declare function parseCustomizations(raw: string | undefined): SkillCustomizations;
/** 序列化覆盖集合。 */
export declare function serializeCustomizations(c: SkillCustomizations): string;
/**
 * 文件后端：定制内容存独立 JSON 文件，设置里只有文件名。
 *
 * @param resolvePath 由插件入口注入：把设置里的文件名解析成绝对路径
 *                    （相对名相对于 `$DSH_HOME`）。
 */
export declare function createFileCustomizationStore(resolvePath: () => string): SkillCustomizationStore;
/**
 * 清空定制（设置面板的"恢复系统原文"）。
 *
 * @param skillId 只清这一个研究方法；缺省 = 清空全部
 *
 * ⚠️ 这里曾经写反过：原实现构造 `{...c, [skillId]: {}}` 后**删掉** skillId，
 * 于是"恢复这个 Skill"实际清空的是**其他所有** Skill，而"恢复全部"什么也不清。
 * 两个分支都是静默的（界面显示成功），所以只能靠断言抓住 ——
 * 见 `scripts/verify-settings-page.mjs` 第 2 节。
 */
export declare function clearAllCustomizations(store: SkillCustomizationStore, skillId?: string): void;
/**
 * 纯内存后端（测试与"尚未接入设置"的降级用）。
 *
 * 也在"将来改成独立文件"时作为实现模板。
 */
export declare function createMemoryCustomizationStore(initial?: SkillCustomizations): SkillCustomizationStore & {
    current(): SkillCustomizations;
};
/** 用户覆盖在合成文本里的分隔标记（与 v1 的包裹语义一致，可读、可辨识）。 */
export declare const USER_SECTION_HEADER = "=== \u7528\u6237\u989D\u5916\u8981\u6C42\uFF08User additions\uFF09===";
export declare const BASE_SECTION_HEADER = "=== \u539F\u6709\u65B9\u6CD5\uFF08Original method\uFF09===";
/**
 * 把用户覆盖以**拼接**方式合成到 Skill 正文里。
 *
 * 顺序契约（重要，与原 ConvFusion 的 `user_skill` 层一致）：
 *
 * ```text
 * === 用户额外要求（User additions）===
 * <用户文本>
 * === 原有方法（Original method）===
 * <系统 Skill 正文>
 * ```
 *
 * 用户文本在**前**、原有方法在**后** —— 因此 Skill 末尾的输出契约与结构不被破坏，
 * 注入个人研究方法不会让 Skill 失效。
 */
export declare function composeSkillContent(baseContent: string, overrides: Record<string, string> | undefined): string;
/** 某个 Skill 的某章节的**基线**内容（用于设置面板展示"你在覆盖什么"）。 */
export declare function sectionBase(doc: SkillDocument, section: string): string;
/** 一个类别下的全部可定制项（设置面板的一级分组）。 */
export interface CategoryCustomization {
    /** 类别 id（顶层大类，如 `literature`）。 */
    categoryId: string;
    /** 类别显示名（如 `Literature`）。 */
    categoryName: string;
    points: CustomizationPoint[];
    /** 该类别下已覆盖的数量。 */
    overriddenCount: number;
}
/**
 * 列出**全部**可定制项，按类别分组（【本地研究方法】的数据面）。
 *
 * 这是"允许用户定制每一个类别中各个允许定制的提示词"的直接实现：
 * 遍历系统 Skill Library → 按 Category 分组 → 展开允许定制的章节。
 */
export declare function listCustomizationPoints(workspace: string, customizations: SkillCustomizations): CategoryCustomization[];
/**
 * 系统 Skill Library 的目录（**包内资产**，不随 workspace 变化）。
 *
 * 定位顺序：`lib/research/` 或 `src/research/` → 包根 → `skills/`。
 * 与 Stage 1 的 `skillDir()` 同款兜底，兼容直接跑 `src` 与跑构建产物 `lib`。
 */
export declare function systemSkillRoot(): string;
/** 供设置面板展示"系统模板加载情况"。 */
export declare function systemLibraryStatus(): {
    root: string;
    skillCount: number;
};
/** 读取一个 Skill 的基线正文（不经注册表；设置面板与测试用）。 */
export declare function readBaseSkillContent(workspace: string, skillId: string): string | undefined;
/** Skill 的展示摘要（设置面板的列表项）。 */
export declare function skillBrief(doc: SkillDocument): {
    id: string;
    name: string;
    purpose: string;
    whenToUse: string;
};
/** 便捷：取某 Skill 的方法主体（供 Agent 阅读）。 */
export declare function skillMethodBody(workspace: string, skillId: string): string | undefined;
/** 便捷：取某 Skill 的任意章节。 */
export declare function skillSectionBody(workspace: string, skillId: string, section: string): string | undefined;
/** 读一个 Skill 的定义（供工具/命令使用）。 */
export declare function readSkillDocument(workspace: string, skillId: string): SkillDocument | undefined;
/** 供测试：读取任意文件的文本（失败 → undefined）。 */
export declare function tryRead(path: string): string | undefined;
//# sourceMappingURL=skill-customization.d.ts.map