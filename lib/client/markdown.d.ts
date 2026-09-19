/**
 * ConvFusion 2.0 — Markdown 子集**解析**（纯函数，无 React、无 DOM）
 *
 * ## 为什么需要
 *
 * 【可指导】里的摘要/简报字段（研究问题、动机、核心想法、假设、方法概览、待解问题）
 * 是研究者**自己的 Markdown 文件**里的一段正文 —— 里面必然有 `**强调**`、列表、
 * 引用块、表格、`` `代码` ``。原来这些值是 `white-space: pre-wrap` 直接当纯文本渲染，
 * 于是界面上出现的是 Markdown **源码**（`**分层结构**（D001 读法 B 之后）：| 层 | 假设 |…`），
 * 不是它的视觉效果。
 *
 * 解析放在**这里**（`.ts`，不带 JSX）而不是渲染组件里，是为了能被离线脚本直接执行断言
 * （`lib/**` 只编译宿主半边，客户端 .tsx 只出 d.ts；见 `scripts/verify-settings-page.mjs`）。
 *
 * ## 支持的范围（够用就好，不追规范）
 *
 * `#` 标题 · `-`/`1.` 列表 · `>` 引用 · ``` 代码块 · `| a | b |` 表格 · `---` 分隔线 ·
 * 段落；行内：`**粗**` `*斜*` `~~删~~` `` `代码` `` `[文字](链接)`。
 *
 * ## 安全
 *
 * 只产出**token**（字符串片段），由调用方用 React 元素渲染 —— 源码里的 HTML 标签
 * 会原样当文字显示，绝不会变成节点（不需要 sanitizer，也不许走危险注入那条路）。
 */
/** 行内 token。 */
export type MdInline = {
    kind: 'text';
    text: string;
} | {
    kind: 'bold';
    text: string;
} | {
    kind: 'italic';
    text: string;
} | {
    kind: 'strike';
    text: string;
} | {
    kind: 'code';
    text: string;
} | {
    kind: 'link';
    text: string;
    href: string;
};
/** 块级 token。`paragraph` / `quote` / `list.items` 里的正文由 `parseInline` 再切一遍。 */
export type MdBlock = {
    kind: 'heading';
    level: number;
    text: string;
} | {
    kind: 'paragraph';
    text: string;
} | {
    kind: 'list';
    ordered: boolean;
    items: string[];
} | {
    kind: 'quote';
    text: string;
} | {
    kind: 'code';
    lang: string;
    text: string;
} | {
    kind: 'table';
    head: string[];
    rows: string[][];
} | {
    kind: 'hr';
};
/**
 * 把一个块级正文拆成块 token。
 *
 * 段落里的**单个换行保留**（渲染端用 `pre-wrap`）——研究笔记常按行断句，
 * 折行成空格会把它变成一坨。
 */
export declare function parseMarkdownBlocks(src: string): MdBlock[];
/** 把一段行内文本拆成 token（未闭合的标记原样当文字）。 */
export declare function parseInline(src: string): MdInline[];
