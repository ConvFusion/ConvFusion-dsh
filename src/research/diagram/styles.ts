/**
 * ConvFusion — Diagram 样式 token（v0.5.5 / C08P07）
 *
 * 样式是**有限枚举**，不是自由 CSS。这是"同一篇论文的所有图看起来是一套"的唯一保证，
 * 也是校验器能对样式说"这个 token 不存在"的前提。
 *
 * 配色取克制的浅底深框：论文里常灰度打印，浅底+深框在灰度下仍分得开；同时避免
 * 高饱和色（会喧宾夺主、彩色打印失真）。
 */

import type { DiagramEdgeType, DiagramNodeType, StyleToken } from './types.js'

/** 字体栈：西文优先，附 CJK 回退（图中若出现中文不至于变成方框）。 */
export const FONT_FAMILY = "'Helvetica Neue', Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
export const MONO_FAMILY = "'SFMono-Regular', Consolas, 'Liberation Mono', monospace"

/** 字号表（一处定义，避免每张图各写一套）。 */
export const FONT_SIZE = {
  title: 16,
  groupLabel: 12,
  nodeLabel: 13,
  nodeDescription: 11,
  edgeLabel: 11,
  freeLabel: 12,
} as const

export interface NodeStyle {
  fill: string
  stroke: string
  text: string
  strokeWidth: number
  /** 虚线（如 external / 未定模块）。 */
  dash?: string
  rx: number
}

/** 11 个内置 node/group 样式 token。 */
export const NODE_STYLES: Record<StyleToken, NodeStyle> = {
  default: { fill: '#F5F7FA', stroke: '#4A5568', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  module: { fill: '#EDF2F7', stroke: '#4A5568', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  input: { fill: '#E8F1FB', stroke: '#2B6CB0', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  output: { fill: '#E9F7EF', stroke: '#276749', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  data: { fill: '#FDF6E3', stroke: '#B7791F', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  model: { fill: '#EDE9FE', stroke: '#6B46C1', text: '#1A202C', strokeWidth: 1.4, rx: 8 },
  process: { fill: '#FFF5F5', stroke: '#C53030', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  decision: { fill: '#FFFAF0', stroke: '#B7791F', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  loss: { fill: '#FED7D7', stroke: '#9B2C2C', text: '#1A202C', strokeWidth: 1.4, rx: 6 },
  container: { fill: 'none', stroke: '#718096', text: '#2D3748', strokeWidth: 1.2, dash: '6 4', rx: 8 },
  highlight: { fill: '#FEFCBF', stroke: '#B7791F', text: '#1A202C', strokeWidth: 1.8, rx: 6 },
}

/** Node type → 默认样式 token（Agent 不写 `style` 时的映射）。 */
export const NODE_STYLE_BY_TYPE: Record<DiagramNodeType, StyleToken> = {
  module: 'module',
  input: 'input',
  output: 'output',
  data: 'data',
  process: 'process',
  decision: 'decision',
  model: 'model',
  loss: 'loss',
  result: 'output',
  external: 'default',
}

export interface EdgeStyle {
  stroke: string
  strokeWidth: number
  /** 虚线；`feedback`/`residual` 用虚线，读者才知道那是回边而不是主流程。 */
  dash?: string
  /** 箭头大小（userSpaceOnUse 单位）。 */
  arrow: number
}

/** 6 个 edge type 的画法。 */
export const EDGE_STYLES: Record<DiagramEdgeType, EdgeStyle> = {
  'data-flow': { stroke: '#2D3748', strokeWidth: 1.6, arrow: 8 },
  'control-flow': { stroke: '#4A5568', strokeWidth: 1.6, dash: '7 4', arrow: 8 },
  dependency: { stroke: '#718096', strokeWidth: 1.3, dash: '3 3', arrow: 7 },
  association: { stroke: '#718096', strokeWidth: 1.3, arrow: 0 },
  residual: { stroke: '#2B6CB0', strokeWidth: 1.6, dash: '7 4', arrow: 8 },
  feedback: { stroke: '#C53030', strokeWidth: 1.6, dash: '2 4', arrow: 8 },
}

/** 命中一个样式 token；未知 token 回退 `default`（校验器已单独报 UNKNOWN_STYLE_TOKEN）。 */
export function nodeStyle(token: StyleToken | undefined): NodeStyle {
  return NODE_STYLES[token ?? 'default'] ?? NODE_STYLES.default
}

/** 命中一个边样式。 */
export function edgeStyle(type: DiagramEdgeType | undefined): EdgeStyle {
  return EDGE_STYLES[type ?? 'data-flow'] ?? EDGE_STYLES['data-flow']
}

/* ════════════════════════════════════════════════════════════════════════
 * 布局常量（dev-note §20：统一配置，不在各处硬编码）
 * ════════════════════════════════════════════════════════════════════════ */

export const LAYOUT = {
  /** 画布四周留白。 */
  canvasMargin: 24,
  /** 标题与内容之间的间距（有标题时才占）。 */
  titleBand: 34,
  /** 同层相邻 node 的间距。 */
  nodeGap: 22,
  /** 层与层之间的间距（也 ≥ 边标签需要的宽度）。 */
  layerGap: 64,
  /** group 容器相对成员的外扩（含顶部标签带）。 */
  groupPadding: 16,
  groupLabelBand: 20,
  /** node 内边距与最大宽度（超过就换行，而不是把盒子撑长）。 */
  nodePaddingX: 12,
  nodePaddingY: 10,
  nodeMaxLabelWidth: 168,
  nodeMinWidth: 84,
  lineHeightRatio: 1.32,
  /** 外绕走线距最外层 node 的距离。 */
  detourGap: 16,
} as const
