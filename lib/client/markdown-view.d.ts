/**
 * ConvFusion 2.0 — Markdown 子集**渲染**（React 元素，不用 HTML 字符串）
 *
 * 解析在 `./markdown.js`（纯函数，可离线断言）；这里只把 token 变成元素。
 * 因此源码里的 HTML 标签永远是文字，**不存在注入**，也不需要 sanitizer。
 *
 * 版面目标：挤在【可指导】的一行里也读得下去 —— 表格能横向滚动、代码块缩到 11px、
 * 引用用左边线、列表缩进 16px。
 */
/** 渲染一段 Markdown 正文（空文本渲染成空）。 */
export declare function Markdown({ text }: {
    text: string | null | undefined;
}): JSX.Element | null;
