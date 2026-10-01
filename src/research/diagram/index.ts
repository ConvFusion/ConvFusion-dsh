/**
 * ConvFusion — Diagram IR Kernel 公共出口（v0.5.5 / C08P07 `paper-diagrams`）
 *
 * 一句话概括这层的作用：
 *
 * > **语义由 Agent 决定，结构由 IR 固化，图形由 Renderer 确定性生成。**
 *
 * 对外只有四个动词，对应 dev-note §34 的四段边界：
 *
 * | 动词 | 回答的问题 | 在哪 |
 * |---|---|---|
 * | `normalizeIr` | 结构上具体有哪些 node / group / edge | `normalize.ts` |
 * | `inspectDiagram` | 生成结果结构和视觉上是否有效 | `validate.ts` |
 * | `layoutDiagram` | 怎么摆、怎么连 | `layout.ts` |
 * | `renderSvg` | 怎么画出来 | `render.ts` |
 *
 * 工具层（`research_diagram`）只做编排与落盘，不含任何绘图逻辑 —— 否则"图能不能画"
 * 就取决于调用路径，而不是取决于 IR。
 */

import { type NormalizedDiagram } from './normalize.js'
import { type LayoutResult, type RenderOptions } from './layout.js'
import { inspectDiagram, inspectNormalized } from './validate.js'
import { renderSvg } from './render.js'
import type { DiagramIR, DiagramStyleDefaults, ValidationReport } from './types.js'
import { NODE_STYLE_BY_TYPE } from './styles.js'

export * from './types.js'
export { normalizeIr, leafNodesOf, groupsDeepestFirst, groupsShallowestFirst } from './normalize.js'
export type { NormalizedDiagram, NormalizedNode, NormalizedGroup, NormalizedEdge, NormalizeResult } from './normalize.js'
export { layoutDiagram, clipAtRect } from './layout.js'
export { layoutSequence } from './sequence.js'
export { layoutAny, usesSequenceEngine } from './engine.js'
export type { LayoutResult, PlacedNode, PlacedGroup, RoutedEdge, PlacedLabel, RenderOptions } from './layout.js'
export { inspectDiagram, inspectNormalized } from './validate.js'
export type { DiagramInspection } from './validate.js'
export { renderSvg } from './render.js'
export type { RenderResult } from './render.js'
export { FONT_FAMILY, FONT_SIZE, LAYOUT, NODE_STYLE_BY_TYPE, NODE_STYLES, edgeStyle, nodeStyle } from './styles.js'
export {
  collinearOverlap,
  measureText,
  polylineIntersectsRect,
  r3,
  rectsOverlap,
  segmentIntersectsRect,
  simplifyPolyline,
  visualLength,
  wrapText,
} from './geometry.js'
export type { Point, Rect } from './geometry.js'
export {
  FIGURES_SUBDIR,
  LAST_GOOD_SUBDIR,
  diagramPaths,
  figuresDir,
  listDiagramArtifacts,
  readDiagramIr,
  sanitizeDiagramName,
  saveLastGood,
  writeDiagramIr,
  writeDiagramSvg,
} from './store.js'
export type { DiagramArtifactEntry, DiagramPaths } from './store.js'
export {
  COLUMN_WIDTH_PT,
  FULL_WIDTH_PT,
  MIN_LEGIBLE_PT,
  PYTHON_ENV,
  SVG2PDF_SCRIPT,
  effectiveNodeFontPt,
  exportDiagramPdf,
  findDiagramPython,
  findSvg2PdfScript,
  maxCanvasUnitsFor,
} from './export.js'
export type { ExportPdfOptions, ExportPdfResult, PythonProbe } from './export.js'

/* ════════════════════════════════════════════════════════════════════════
 * 一站式：IR → 诊断 → SVG
 * ════════════════════════════════════════════════════════════════════════ */

export interface DiagramBuild {
  report: ValidationReport
  /** 校验通过时才有值（坏 IR 绝不产出图）。 */
  svg: string | null
  diagram: NormalizedDiagram | null
  layout: LayoutResult | null
}

/**
 * 校验 + 渲染。
 *
 * 语义要点：**校验不过就没有 SVG**。这不是"少个文件"，而是把"输出损坏图"
 * 这条路径**从系统里去掉** —— 调用方拿不到半成品，只能去修 IR。
 */
export function buildDiagram(raw: unknown, options: RenderOptions = {}): DiagramBuild {
  const inspection = inspectDiagram(raw, options)
  if (!inspection.report.valid || inspection.diagram === null || inspection.layout === null) {
    return { report: inspection.report, svg: null, diagram: inspection.diagram, layout: inspection.layout }
  }
  return {
    report: inspection.report,
    svg: renderSvg(inspection.diagram, inspection.layout),
    diagram: inspection.diagram,
    layout: inspection.layout,
  }
}

/** 只渲染一份**已规范化**的图（测试与未来的内部调用用，避免重复解析）。 */
export function buildFromNormalized(diagram: NormalizedDiagram, options: RenderOptions = {}): DiagramBuild {
  const inspection = inspectNormalized(diagram, options)
  if (!inspection.report.valid || inspection.layout === null) {
    return { report: inspection.report, svg: null, diagram, layout: inspection.layout }
  }
  return { report: inspection.report, svg: renderSvg(diagram, inspection.layout), diagram, layout: inspection.layout }
}

/* ════════════════════════════════════════════════════════════════════════
 * 规范化 IR → 可回写的 IR
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 把内部规范化结构还原成一份**稳定的** IR 文本。
 *
 * 为什么落盘要写这一份、而不是 Agent 提交的原文：边可以不带 `id`，那时 id 是按
 * 声明顺序合成的（`e1`、`e2`…）。若把原文落盘，下次读回来会再合成一次 —— 只要
 * 中间插了一条边，所有后续边的 id 就整体漂移，`last-good` 与诊断里的 `element`
 * 也会跟着对不上。落盘时把 id 固化，图才真的是"可演化的资产"。
 *
 * 同时它也是**规范化的**：group 成员关系只保留 `children` 一处（node.group 与
 * children 冲突已在 normalize 阶段报错并统一），样式只在偏离类型默认值时写出。
 */
export function toCanonicalIr(diagram: NormalizedDiagram): DiagramIR {
  const styleDefaults: DiagramStyleDefaults = {}
  if (diagram.styleDefaults.node !== undefined) styleDefaults.node = diagram.styleDefaults.node
  if (diagram.styleDefaults.edge !== undefined) styleDefaults.edge = diagram.styleDefaults.edge
  if (diagram.styleDefaults.group !== undefined) styleDefaults.group = diagram.styleDefaults.group

  const ir: DiagramIR = {
    version: diagram.version,
    type: diagram.type,
    ...(diagram.title !== undefined ? { title: diagram.title } : {}),
    ...(diagram.showDescriptions === true ? { show_descriptions: true } : {}),
    ...(diagram.canvas.width !== undefined || diagram.canvas.height !== undefined
      ? { canvas: { ...(diagram.canvas.width !== undefined ? { width: diagram.canvas.width } : {}), ...(diagram.canvas.height !== undefined ? { height: diagram.canvas.height } : {}) } }
      : {}),
    layout: {
      direction: diagram.direction,
      algorithm: diagram.algorithm,
      ...(diagram.layerGap !== undefined ? { layer_gap: diagram.layerGap } : {}),
    },
    nodes: diagram.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      ...(n.description !== undefined ? { description: n.description } : {}),
      ...(n.group !== undefined ? { group: n.group } : {}),
      ...(n.style !== NODE_STYLE_BY_TYPE[n.type] ? { style: n.style } : {}),
      ...(n.evidence.length > 0 ? { evidence: n.evidence } : {}),
      ...(n.refs !== undefined && n.refs.length > 0 ? { refs: [...n.refs] } : {}),
    })),
  }
  if (diagram.groups.length > 0) {
    ir.groups = diagram.groups.map((g) => ({
      id: g.id,
      label: g.label,
      children: [...g.members],
      ...(g.style !== 'container' ? { style: g.style } : {}),
      ...(g.refs !== undefined && g.refs.length > 0 ? { refs: [...g.refs] } : {}),
    }))
  }
  if (diagram.edges.length > 0) {
    ir.edges = diagram.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      ...(e.label !== undefined ? { label: e.label } : {}),
      ...(e.refs !== undefined && e.refs.length > 0 ? { refs: [...e.refs] } : {}),
    }))
  }
  if (diagram.cards.length > 0) {
    ir.cards = diagram.cards.map((c) => ({
      id: c.id,
      title: c.title,
      ...(c.body !== undefined ? { body: c.body } : {}),
      ...(c.refs !== undefined && c.refs.length > 0 ? { refs: [...c.refs] } : {}),
    }))
  }
  if (diagram.labels.length > 0) {
    ir.labels = diagram.labels.map((l) => ({ id: l.id, text: l.text, anchor: l.anchor }))
  }
  if (Object.keys(styleDefaults).length > 0) ir.styles = styleDefaults
  return ir
}

/* ════════════════════════════════════════════════════════════════════════
 * 报告 → 人/模型可读文本
 * ════════════════════════════════════════════════════════════════════════ */

/** 紧凑地把诊断排成几行（工具返回值用，让 Agent 一眼看到要看什么）。 */
export function formatDiagnostics(report: ValidationReport, limit = 12): string {
  const lines: string[] = []
  lines.push(report.valid ? 'valid ✅' : `invalid ❌ (${report.errors.length} error(s), ${report.warnings.length} warning(s))`)
  for (const d of report.errors.slice(0, limit)) {
    lines.push(`  [error] ${d.code}${d.element !== undefined ? ` @${d.element}` : ''}: ${d.message}${d.hint !== undefined ? `\n          → ${d.hint}` : ''}`)
  }
  if (report.errors.length > limit) lines.push(`  … ${report.errors.length - limit} more error(s)`)
  for (const d of report.warnings.slice(0, limit)) {
    lines.push(`  [warn ] ${d.code}${d.element !== undefined ? ` @${d.element}` : ''}: ${d.message}`)
  }
  if (report.warnings.length > limit) lines.push(`  … ${report.warnings.length - limit} more warning(s)`)
  return lines.join('\n')
}

/** 每类诊断出现多少次（release note / 自检里做统计用）。 */
export function diagnosticCounts(report: ValidationReport): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const d of [...report.errors, ...report.warnings]) {
    counts[d.code] = (counts[d.code] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}
