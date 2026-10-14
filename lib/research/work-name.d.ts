/**
 * ConvFusion — **一项研究工作的名字**（发布到网络时用的那一个）
 *
 * ## 为什么需要它
 *
 * 【可指导】/【可加入】/【指导中】三个列表里显示的"研究工作名称"，来自**服务器上那个
 * 项目标题** —— 也就是我们发布时送上去的 `title`。早先送的是 **DSH 工作区的注册表标题**
 * （或目录名，如 `ConvFusion-dsh（run）`），那是"这台机器上的哪个文件夹"，不是这项工作
 * 的名字：同一个人有多个工作区时，网络里全是一串目录名；别人（导师/学生）看到的
 * 也是这些名字。
 *
 * 正确的一层是**这项工作自己的名字**：
 *
 * ```text
 * 有论文  → 论文标题（这项工作的正式名字）
 * 没论文  → project.md 的 topic（已采纳的主题；初始输入 topic 会随演进更新）
 * 都没有  → 注册表标题（兜底，宁可显示"本机还叫这个名字"也不显示空）
 * ```
 *
 * ## 论文标题取自哪一份
 *
 * 与项目约定一致：**论文正文以 `papers/<id>/latex/main.tex` 为准**
 * （`paper.md` 可能是过期的草稿）。所以：
 *
 * 1. `<paper>/latex/main.tex` 的 `\title{...}`（权威）；
 * 2. 退回 `paperTitle(paper)`（`metadata.md` 的 frontmatter / 手稿 H1 / 论文 id）——
 *    老工作区可能还没有 latex/。
 *
 * 多篇论文时取**当前活跃的那一篇**（`getActivePaperId`），其次取最近改动的那一篇目录。
 *
 * ## 两条纪律
 *
 * 1. **不编**：没论文就不用论文标题，topic 为空就用兜底 —— 不拿摘要、不拿第一个
 *    研究问题凑一个像名字的东西。
 * 2. **可展示**：结果是给人看的字符串 —— 清掉 LaTeX 转义（`\&`、`\%`、`--`）、
 *    折平空白、去掉首尾标点，并按服务器的标题上限（500）留足余量截断。
 *    `Title` / `Untitled` 这类**模板占位**不算名字（刚建的论文还没起名）。
 */
/**
 * 名字长度上限。
 *
 * 服务器允许 500（`ResearchProjectCreate.title` 的 `max_length`），但这个名字要出现在
 * **列表行**里（`whiteSpace: nowrap + ellipsis`），太长等于看不见 —— 所以收得更紧，
 * 与 `PUBLISH_SUMMARY_LIMIT` 同量级。
 */
export declare const WORK_NAME_LIMIT = 200;
/** 名字是从哪来的（界面/日志据此解释"为什么叫这个"）。 */
export type WorkNameSource = 'paper' | 'topic' | 'fallback';
export interface WorkName {
    /** 可以直接送去发布 / 显示的名字（已折平空白、清转义、截断）。 */
    name: string;
    /** 来源：`paper` = 论文标题，`topic` = 项目主题，`fallback` = 兜底（注册表标题）。 */
    source: WorkNameSource;
    /** 论文标题来自哪篇（`source === 'paper'` 时有值）。 */
    paperId?: string;
    /**
     * 论文标题本身（`source === 'paper'` 时有值；**未截断**）。
     *
     * 与 {@link WorkName.name} 分开：名字要截断（列表行宽度），而论文标题是**事实**，
     * 上送时按原文（`paper.title`）—— 两者用途不同，别让截断污染事实。
     */
    paperTitle?: string;
}
/**
 * 一项研究工作的**名字**：有论文用论文标题，否则用 `project.md` 的 topic，最后兜底。
 *
 * 纯读盘、不写、不抛（读不动就当没有 —— 名字永远有一个可显示的兜底值）。
 *
 * @param researchRoot 研究根（`<会话工作区>/workspace`，旧布局下就是会话工作区本身）
 * @param fallback 兜底名（注册表标题 / 目录名）—— 只在没有论文也没有主题时使用
 */
export declare function researchWorkName(researchRoot: string, fallback: string): WorkName;
/** 工作区里有没有论文目录（诊断用；`researchWorkName` 已隐含这件事）。 */
export declare function hasPaperDir(researchRoot: string): boolean;
//# sourceMappingURL=work-name.d.ts.map