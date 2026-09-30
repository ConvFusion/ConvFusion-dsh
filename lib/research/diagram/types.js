/**
 * ConvFusion — Diagram IR（论文配图中间表示，v0.5.5 / C08P07 `paper-diagrams`）
 *
 * ## 为什么要有 IR
 *
 * 让 LLM 直接画 SVG 有三个必然的坏结果：同一篇论文里每张图颜色/字体/线宽都不同；
 * 图不可复现（同一个意思画出不同的图）；模型把精力花在坐标而不是**语义**上。
 *
 * 所以职责被切成三段，互相不越界：
 *
 * ```text
 * Agent   → 画什么、为什么画      （Diagram Specification，自然语言）
 * IR      → 有哪些 node / group / edge（本文件，JSON）
 * Renderer→ 怎么摆、怎么连、怎么画   （layout.ts / render.ts，确定性）
 * Validator → 结构/图/视觉是否有效   （validate.ts，结构化 diagnostics）
 * ```
 *
 * **坐标不在 IR 里**：`x`/`y` 是布局的产物，不是语义。IR 只表达"谁连着谁"。
 *
 * ## 与研究状态的关系
 *
 * Diagram 不是新的核心实体，也不产生 `Diagram State` —— 它是 Research State 的
 * **Artifact**（`Research State → Method/Evidence → Diagram Artifact`）。
 */
/* ════════════════════════════════════════════════════════════════════════
 * 枚举
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 第一阶段固定支持的图类型（dev-note §7）。
 *
 * 刻意**不含** mindmap / timeline / 3D / 艺术插画 / 统计图表：统计图表必须由脚本
 * 直接读结果文件生成（单一事实源），不属于本能力的范围。
 */
export const DIAGRAM_TYPES = [
    'method-overview',
    'architecture',
    'module-structure',
    'workflow',
    'system-architecture',
    'data-flow',
    'component-relationship',
];
/**
 * Node 的**视觉角色**，不是论文里的具体模块。
 *
 * 判断标准：换个领域还能用它吗？`encoder` 不能，`module` 能。把 Node type 与具体
 * 方法绑定，IR 就会随论文漂移。
 */
export const NODE_TYPES = [
    'module',
    'input',
    'output',
    'data',
    'process',
    'decision',
    'model',
    'loss',
    'result',
    'external',
];
/** Edge 表达的是**结构关系**，不是画法（画法由 renderer 决定）。 */
export const EDGE_TYPES = ['data-flow', 'control-flow', 'dependency', 'association', 'residual', 'feedback'];
/**
 * 内置样式 token（dev-note §14）。
 *
 * 为什么不让 LLM 写 CSS：那样每张图都是独立的设计决策，同一篇论文里不可能一致，
 * 而且模型生成的 CSS 不可控、不可校验。样式只能**引用 token**。
 */
export const STYLE_TOKENS = [
    'default',
    'module',
    'input',
    'output',
    'data',
    'model',
    'process',
    'decision',
    'loss',
    'container',
    'highlight',
];
/** 图的整体流向。第一阶段不允许逐边指定方向 —— 一张图只有一个阅读方向。 */
export const LAYOUT_DIRECTIONS = ['LR', 'RL', 'TB', 'BT'];
/** 布局算法。第一阶段只有分层（hierarchical）；grid 是退化时的兜底。 */
export const LAYOUT_ALGORITHMS = ['hierarchical', 'grid'];
/** IR 版本（写入时固定；读取时只做兼容提示，不做迁移）。 */
export const IR_VERSION = '1.0';
/** 修复循环上限（dev-note §24）—— 超过就保留 last-good，不再重试。 */
export const MAX_REPAIR_ROUNDS = 3;
/** 诊断码。集中登记，便于 Agent 按 `code` 修复（而不是猜 message 措辞）。 */
export const DIAGNOSTIC_CODES = [
    // ── 结构 ──
    'NOT_AN_OBJECT',
    'MISSING_FIELD',
    'BAD_FIELD_TYPE',
    'EMPTY_DIAGRAM',
    'UNKNOWN_DIAGRAM_TYPE',
    'UNKNOWN_NODE_TYPE',
    'UNKNOWN_EDGE_TYPE',
    'UNKNOWN_STYLE_TOKEN',
    'DUPLICATE_ID',
    'INVALID_ID',
    'MISSING_SOURCE',
    'MISSING_TARGET',
    'SELF_EDGE',
    'UNKNOWN_GROUP_MEMBER',
    'GROUP_MEMBERSHIP_CONFLICT',
    'GROUP_CYCLE',
    'GROUP_NESTING_TOO_DEEP',
    'NODE_IN_MULTIPLE_GROUPS',
    'UNKNOWN_LABEL_ANCHOR',
    'UNKNOWN_LAYOUT_ALGORITHM',
    'UNKNOWN_LAYOUT_DIRECTION',
    'UNKNOWN_VERSION',
    // ── 图 ──
    'ISOLATED_NODE',
    'CYCLE_DETECTED',
    'UNLAYERABLE_STRUCTURE',
    // ── 视觉 ──
    'NODE_OVERLAP',
    'EDGE_CROSSES_NODE',
    'TEXT_OVERFLOW',
    'GROUP_OVERLAPS_FOREIGN_NODE',
    'CANVAS_TOO_SMALL',
    'LONG_LABEL',
    // ── 内容纪律（dev-note §27：最小充分表示）──
    'VAGUE_NODE_LABEL',
    'DUPLICATE_NODE_LABEL',
    'UNTRACED_NODE',
];
/** 造一条 error。 */
export function error(code, message, element, hint) {
    return { code, severity: 'error', message, ...(element !== undefined ? { element } : {}), ...(hint !== undefined ? { hint } : {}) };
}
/** 造一条 warning。 */
export function warning(code, message, element, hint) {
    return { code, severity: 'warning', message, ...(element !== undefined ? { element } : {}), ...(hint !== undefined ? { hint } : {}) };
}
//# sourceMappingURL=types.js.map