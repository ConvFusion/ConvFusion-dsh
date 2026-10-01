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
  /**
   * **时序图**：声明顺序即时间顺序，参与者是列、消息是从上到下的箭头。
   * 与分层图是**两套布局**（见 `sequence.ts`）—— 时序信息画不进"分层流程图"里，
   * 硬画只能得到一个像流程图的近似物，那正是这个类型过去的问题。
   */
  'sequence',
  /**
   * **状态机 / 生命周期**：状态 + 带事件标签的转移（含自转移）。
   * 走分层引擎，但有独立渲染契约：`input` 节点画初始态标记、`output` 画终态环、
   * 自转移画成环（`SELF_EDGE` 不再是错误）。
   */
  'lifecycle',
] as const
export type DiagramType = (typeof DIAGRAM_TYPES)[number]

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
] as const
export type DiagramNodeType = (typeof NODE_TYPES)[number]

/** Edge 表达的是**结构关系**，不是画法（画法由 renderer 决定）。 */
export const EDGE_TYPES = ['data-flow', 'control-flow', 'dependency', 'association', 'residual', 'feedback'] as const
export type DiagramEdgeType = (typeof EDGE_TYPES)[number]

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
] as const
export type StyleToken = (typeof STYLE_TOKENS)[number]

/** 图的整体流向。第一阶段不允许逐边指定方向 —— 一张图只有一个阅读方向。 */
export const LAYOUT_DIRECTIONS = ['LR', 'RL', 'TB', 'BT'] as const
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number]

/** 布局算法。第一阶段只有分层（hierarchical）；grid 是退化时的兜底。 */
export const LAYOUT_ALGORITHMS = ['hierarchical', 'grid'] as const
export type LayoutAlgorithm = (typeof LAYOUT_ALGORITHMS)[number]

/** IR 版本（写入时固定；读取时只做兼容提示，不做迁移）。 */
export const IR_VERSION = '1.0'

/** 修复循环上限（dev-note §24）—— 超过就保留 last-good，不再重试。 */
export const MAX_REPAIR_ROUNDS = 3

/* ════════════════════════════════════════════════════════════════════════
 * IR 结构（用户/Agent 写下来的形态）
 * ════════════════════════════════════════════════════════════════════════ */

/** 一个图元素的可选溯源（dev-note §28）："这个模块来自论文哪一部分？" */
export interface DiagramEvidence {
  /** 来源标识，如 `section-3.2` / `eq:loss` / `user`。 */
  source: string
  /** 可选说明。 */
  note?: string
}

/** 主要视觉实体。 */
export interface DiagramNode {
  id: string
  type: DiagramNodeType
  label: string
  /** 补充说明。**默认不显示**（dev-note §21：论文配图最常见的问题是字太多）。 */
  description?: string
  /** 所属 group id（与 group.children 是同一件事的两种写法，冲突会报 warning）。 */
  group?: string
  style?: StyleToken
  evidence?: DiagramEvidence[]
  /**
   * 绑到**论文资产**上的编号，如 `["C1", "E008"]`（claim / evidence）。
   *
   * 与 `evidence` 的区别：`evidence` 是"这条信息出自手稿哪一节"的溯源，
   * `refs` 是"这个图元**承载了哪条论点**"。论文配图的用途是带观点，
   * 所以图元必须能指向论点本身；渲染为盒子底部的一行小字，并可在
   * `knownRefs` 提供时校验编号**真的存在**（不存在的引用会报 `UNKNOWN_REF`）。
   */
  refs?: string[]
}

/**
 * 卡片：挂在流程图**旁边**的一段文字（论点 / 关键数字 / 条件）。
 *
 * 为什么需要它：想在图里多表达一点观点，最省事的做法是**再加一条边或一个节点**，
 * 于是图越来越密、连线越来越难读。卡片给了第二条路 —— 细节放卡片，图保持干净。
 * 卡片不参与走线（整块放在流程之外的一栏里），所以不会制造连线问题。
 */
export interface DiagramCard {
  id?: string
  title: string
  body?: string
  /** 同 `DiagramNode.refs`。 */
  refs?: string[]
}

/** 论文里的模块 / 阶段 / 子系统；可嵌套（第一阶段最多两层）。 */
export interface DiagramGroup {
  id: string
  label: string
  /** 成员 id：node id 或**子 group** id。 */
  children: string[]
  style?: StyleToken
  /** 这个模块承载的论文资产编号，渲染时并入容器标签。 */
  refs?: string[]
}

/** 结构关系。 */
export interface DiagramEdge {
  /** 可选；缺省时按声明顺序合成 `e1`、`e2`…。 */
  id?: string
  source: string
  target: string
  type?: DiagramEdgeType
  label?: string
  style?: StyleToken
  /** 这条关系**在论证里承担什么**（论文资产编号），渲染时并入关系标签。 */
  refs?: string[]
}

/** 独立文字（第一阶段尽量少用；优先 Node/Edge/Group 的 label）。 */
export interface DiagramLabel {
  id: string
  text: string
  anchor: string
}

/**
 * IR 级默认样式（dev-note §14 的 `styles`）。
 *
 * ⚠️ `edge` 取的是 **edge type**（`data-flow`…）而不是 node 样式 token ——
 * 边的外观由"它是什么关系"决定，不由"它想长什么样"决定。这与 §14 示例里的
 * `{"edgeStyle": "data-flow"}` 一致。
 */
export interface DiagramStyleDefaults {
  node?: StyleToken
  edge?: DiagramEdgeType
  group?: StyleToken
}

export interface DiagramLayoutSpec {
  direction?: LayoutDirection
  algorithm?: LayoutAlgorithm
  /**
   * 层间距（流向方向上相邻两层之间的空隙），SVG 单位。
   *
   * 为什么需要一个旋钮：默认 64 单位对**内容多、链条长**的图太松 —— 实测一张
   * 忠实还原 10 行内容的图会被拉到 1300+ 单位高，缩进论文后字小于 7pt 读不了。
   * 密排到 24–32 单位就能让同一份内容落在可读区间（见 paper C08P07 的 legible 判据）。
   *
   * 不是所有图都该密排：链条短、节点少的图，默认行距更透气。所以做成**按图指定**，
   * 而不是改全局默认。范围 12–120，越界会 clamp 并报 warning。
   */
  layer_gap?: number
}

export interface DiagramCanvasSpec {
  width?: number
  height?: number
}

/** Diagram IR —— 唯一被渲染的输入。 */
export interface DiagramIR {
  version?: string
  type: DiagramType
  title?: string
  /**
   * 是否在节点里显示 `description`（默认 false —— dev-note §21：图上字越少越好）。
   *
   * 为什么它是 **IR 的一部分**而不是纯渲染参数：对一张真的需要二级说明的图
   * （模块内部的构成、分支的触发条件），"显示说明"就是这张图的**内容**，
   * 不是调用时的一个偏好。放在 IR 里，重渲染/换机器才会得到同一张图。
   */
  show_descriptions?: boolean
  canvas?: DiagramCanvasSpec
  layout?: DiagramLayoutSpec
  nodes: DiagramNode[]
  groups?: DiagramGroup[]
  edges?: DiagramEdge[]
  /**
   * 流程之外的**卡片栏**：承载次级论点、关键数字、成立条件。
   *
   * 想在图里多表达一点，最省事的做法是再加一条边或一个节点 —— 于是图越来越密、
   * 连线越来越难读。卡片是第二条路：细节放卡片，流程保持干净。
   * 卡片整块放在流程之外，不参与走线，所以不会制造连线问题。
   */
  cards?: DiagramCard[]
  labels?: DiagramLabel[]
  styles?: DiagramStyleDefaults
}

/* ════════════════════════════════════════════════════════════════════════
 * Diagnostics（dev-note §22 / §23：结构化，不是自然语言）
 * ════════════════════════════════════════════════════════════════════════ */

export type DiagnosticSeverity = 'error' | 'warning'

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
  'EDGE_ENDPOINT_PILED',
  'EDGE_CROSSES_CONTAINER',
  'EDGE_OVERLAP',
  'UNKNOWN_REF',
  'BAD_REF_SHAPE',
  'CARD_EMPTY',
  'LABEL_OVERLAP',
  /** 某个字段在**这个模式**下没有意义（如 sequence 里的 groups），已忽略并说明。 */
  'UNSUPPORTED_IN_MODE',
  'TEXT_OVERFLOW',
  'GROUP_OVERLAPS_FOREIGN_NODE',
  'CANVAS_TOO_SMALL',
  'LONG_LABEL',
  // ── 内容纪律（dev-note §27：最小充分表示）──
  'VAGUE_NODE_LABEL',
  'DUPLICATE_NODE_LABEL',
  'UNTRACED_NODE',
] as const
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number]

export interface Diagnostic {
  code: DiagnosticCode
  severity: DiagnosticSeverity
  /** 出问题的元素 id（node / edge / group / label）。 */
  element?: string
  message: string
  /** 修复方向（可执行的一句话）。 */
  hint?: string
  /**
   * **实测证据**：这条诊断依据的具体数值/位置（如 `"3 edges at (108,102)"`、
   * `"79.7 units shared with e13"`）。
   *
   * 为什么单独一个字段：只说"连线有问题"，调用方只能猜；给出数值它才知道
   * 严重到什么程度、该改哪里。取自 archify 的 `validate --json` 契约
   * （stable rule code + exact subject + measured evidence）。
   */
  measured?: string
}

export interface ValidationReport {
  valid: boolean
  errors: Diagnostic[]
  warnings: Diagnostic[]
}

/** 造一条 error。 */
export function error(code: DiagnosticCode, message: string, element?: string, hint?: string, measured?: string): Diagnostic {
  return {
    code,
    severity: 'error',
    message,
    ...(element !== undefined ? { element } : {}),
    ...(hint !== undefined ? { hint } : {}),
    ...(measured !== undefined ? { measured } : {}),
  }
}

/** 造一条 warning。 */
export function warning(code: DiagnosticCode, message: string, element?: string, hint?: string, measured?: string): Diagnostic {
  return {
    code,
    severity: 'warning',
    message,
    ...(element !== undefined ? { element } : {}),
    ...(hint !== undefined ? { hint } : {}),
    ...(measured !== undefined ? { measured } : {}),
  }
}
