/**
 * ConvFusion — Diagram 校验（v0.5.5 / C08P07）
 *
 * 三层，顺序不能换：
 *
 * 1. **结构**（`normalize.ts`）：id、枚举、引用、group 关系。
 * 2. **图**：孤立节点、成环、无法分层。
 * 3. **视觉**（需要先布局）：重叠、线穿盒子、文字溢出、容器压到别的节点、画布不够。
 *
 * 输出一律是**结构化 diagnostics**（`{code, severity, element, message, hint}`），
 * 不是自然语言错误串。理由很实际：Agent 要按 `code` 做确定性修复；message 是给人读的，
 * 措辞随时会变。dev-note §23 明确要求这一点。
 *
 * ⚠️ 这里只**报告**，不修。修由 Agent 做（结构性修改），因为"自动修"意味着系统替
 * Agent 改论文内容 —— 那是 dev-note §33 禁止的越界。
 */

import { layoutDiagram, type LayoutResult, type RenderOptions } from './layout.js'
import { normalizeIr, type NormalizedDiagram } from './normalize.js'
import {
  LAYOUT,
  FONT_SIZE,
} from './styles.js'
import {
  measureText,
  polylineIntersectsRect,
  r3,
  rectBottom,
  rectRight,
  type Rect,
} from './geometry.js'
import {
  error,
  warning,
  type Diagnostic,
  type ValidationReport,
} from './types.js'

export interface DiagramInspection {
  report: ValidationReport
  /** 规范化的 IR（致命错误时为 null）。 */
  diagram: NormalizedDiagram | null
  /** 布局结果（致命错误时为 null）。 */
  layout: LayoutResult | null
}

/** 校验一份任意 JSON 的 Diagram IR。 */
export function inspectDiagram(raw: unknown, options: RenderOptions = {}): DiagramInspection {
  const normalized = normalizeIr(raw)
  const diagnostics: Diagnostic[] = [...normalized.diagnostics]
  if (normalized.diagram === null) {
    return finish(null, null, diagnostics)
  }
  const diagram = normalized.diagram
  const layout = layoutDiagram(diagram, options)
  diagnostics.push(...layout.diagnostics)
  diagnostics.push(...graphChecks(diagram))
  diagnostics.push(...visualChecks(diagram, layout))
  return finish(diagram, layout, diagnostics)
}

/** 校验一份**已经规范化**的 IR（render 路径复用，避免重复解析）。 */
export function inspectNormalized(diagram: NormalizedDiagram, options: RenderOptions = {}): DiagramInspection {
  const layout = layoutDiagram(diagram, options)
  const diagnostics: Diagnostic[] = [...layout.diagnostics, ...graphChecks(diagram), ...visualChecks(diagram, layout)]
  return finish(diagram, layout, diagnostics)
}

function finish(diagram: NormalizedDiagram | null, layout: LayoutResult | null, diagnostics: Diagnostic[]): DiagramInspection {
  // 顺序稳定：先按严重度，再按出现顺序（诊断顺序本身就是确定性的一部分，
  // 否则同一份 IR 两次会得到顺序不同的报告，diff 起来很难看）。
  const errors = diagnostics.filter((d) => d.severity === 'error')
  const warnings = diagnostics.filter((d) => d.severity === 'warning')
  return { report: { valid: errors.length === 0, errors, warnings }, diagram, layout }
}

/* ════════════════════════════════════════════════════════════════════════
 * 图结构
 * ════════════════════════════════════════════════════════════════════════ */

function graphChecks(diagram: NormalizedDiagram): Diagnostic[] {
  const out: Diagnostic[] = []
  const touched = new Set<string>()
  for (const e of diagram.edges) {
    touched.add(e.source)
    touched.add(e.target)
  }
  for (const n of diagram.nodes) {
    if (touched.has(n.id)) continue
    if (n.group !== undefined) continue
    out.push(
      warning(
        'ISOLATED_NODE',
        `Node "${n.id}" has no edge and no group — nothing connects it to the figure.`,
        n.id,
        'Connect it, put it in a group, or delete it: an unconnected box reads as a mistake.',
      ),
    )
  }

  // 溯源：**整张图一个 evidence 都没有**才提示，不逐节点提示 ——
  // dev-note §28 说第一阶段不要求 evidence，逐节点报警只会变成噪声，Agent 会学会忽略它。
  if (diagram.nodes.length > 0 && diagram.nodes.every((n) => n.evidence.length === 0)) {
    out.push(
      warning(
        'UNTRACED_NODE',
        'No node records where its content comes from.',
        undefined,
        'Add `evidence: [{"source": "section-3.2"}]` to nodes you took from the manuscript, so the figure can be traced back later.',
      ),
    )
  }

  // 同一标签的两个节点：读者分不清它们是不是同一个东西。
  const byLabel = new Map<string, string[]>()
  for (const n of diagram.nodes) {
    const key = n.label.trim().toLowerCase().replace(/\s+/g, ' ')
    const list = byLabel.get(key)
    if (list === undefined) byLabel.set(key, [n.id])
    else list.push(n.id)
  }
  for (const [label, ids] of byLabel) {
    if (ids.length < 2) continue
    out.push(
      warning('DUPLICATE_NODE_LABEL', `${ids.length} nodes share the label "${label}".`, ids.join(', '), 'If they are the same thing, merge them; if not, give them distinct names.'),
    )
  }

  for (const n of diagram.nodes) {
    const vague = vagueReason(n.label)
    if (vague !== null) {
      out.push(
        warning(
          'VAGUE_NODE_LABEL',
          `Node "${n.id}" is labelled "${n.label}", which names no module the paper defines (${vague}).`,
          n.id,
          'Every node must trace to the method, an equation, a section or the user description — remove it or name it as the text does.',
        ),
      )
    }
  }

  return out
}

/** 空泛标签检测（dev-note §27 那条"不要自动加 AI Module / Advanced Processing"）。 */
function vagueReason(label: string): string | null {
  const t = label.trim().toLowerCase().replace(/\s+/g, ' ')
  const exact = new Set([
    'ai', 'ai module', 'ml module', 'module', 'modules', 'component', 'components',
    'block', 'blocks', 'processing', 'stage', 'stages', 'step', 'steps', 'layer', 'layers',
    'part', 'parts', 'advanced processing', 'optimization', 'optimisation', 'optimizer',
    'smart decision', 'smart module', 'misc', 'miscellaneous', 'other', 'others', 'etc',
    'tbd', 'todo', 'placeholder', 'n/a', 'thing', 'stuff', 'core module', 'main module',
  ])
  if (exact.has(t)) return 'generic placeholder wording'
  if (/^(module|component|block|stage|step|part|layer)\s*[-#]?\s*\d+$/.test(t)) return 'numbered placeholder'
  if (/^[a-z]\d*$/.test(t)) return 'single-letter label'
  return null
}

/* ════════════════════════════════════════════════════════════════════════
 * 视觉
 * ════════════════════════════════════════════════════════════════════════ */

function visualChecks(diagram: NormalizedDiagram, layout: LayoutResult): Diagnostic[] {
  const out: Diagnostic[] = []

  /* ── 节点重叠（布局保证不重叠；这是"布局实现坏了"的安全网）───────── */
  const rects = layout.nodes.map((n) => ({ id: n.id, rect: n.rect }))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i] as { id: string; rect: Rect }
      const b = rects[j] as { id: string; rect: Rect }
      if (overlaps(a.rect, b.rect)) {
        out.push(error('NODE_OVERLAP', `Nodes "${a.id}" and "${b.id}" overlap.`, a.id, 'This indicates a layout defect; reduce the number of nodes per layer or split the figure.'))
      }
    }
  }

  /* ── 线穿过盒子 ─────────────────────────────────────────────────── */
  for (const edge of layout.edges) {
    if (!edge.crossesNode) continue
    const hit = layout.nodes.find(
      (n) => n.id !== edge.source && n.id !== edge.target && polylineIntersectsRect(edge.points, n.rect, 1.5),
    )
    out.push(
      error(
        'EDGE_CROSSES_NODE',
        `Edge "${edge.id}" (${edge.source} → ${edge.target}) crosses node${hit !== undefined ? ` "${hit.id}"` : ''}.`,
        edge.id,
        'Repair structurally: add the intermediate node the flow actually passes through, reorder the layer (declaration order controls it), or route through a group endpoint.',
      ),
    )
  }

  /* ── 文字溢出 ───────────────────────────────────────────────────── */
  for (const node of layout.nodes) {
    const inner = node.rect.w - 2 * LAYOUT.nodePaddingX
    const worst = Math.max(...node.labelLines.map((l) => measureText(l, FONT_SIZE.nodeLabel)), 0)
    if (worst > inner + 0.5) {
      out.push(
        error('TEXT_OVERFLOW', `Label of node "${node.id}" is wider than its box (${r3(worst)} > ${r3(inner)}).`, node.id, 'Shorten the label; a node box never grows past the label width limit.'),
      )
    }
    for (const line of node.labelLines) {
      if (measureText(line, FONT_SIZE.nodeLabel) > LAYOUT.nodeMaxLabelWidth + 0.5) {
        out.push(warning('LONG_LABEL', `A line of node "${node.id}" exceeds the label width limit.`, node.id, 'Two or three short lines read better than one long one.'))
      }
    }
    if (node.labelLines.length > 3) {
      out.push(warning('LONG_LABEL', `Label of node "${node.id}" wraps to ${node.labelLines.length} lines.`, node.id, 'Move the detail to the caption or the text; a figure is not a paragraph.'))
    }
    const visual = [...node.label].length
    if (visual > 60) {
      out.push(warning('LONG_LABEL', `Label of node "${node.id}" has ${visual} characters.`, node.id, 'Aim for two or three words per node.'))
    }
  }

  /* ── group 容器压到别的节点 ─────────────────────────────────────── */
  for (const group of layout.groups) {
    const members = memberNodeIds(diagram, group.id)
    for (const node of layout.nodes) {
      if (members.has(node.id)) continue
      if (overlaps(group.rect, node.rect)) {
        out.push(
          warning(
            'GROUP_OVERLAPS_FOREIGN_NODE',
            `Group "${group.id}" encloses node "${node.id}", which is not one of its members.`,
            group.id,
            'Add the node to the group, or move it out by reordering the layer.',
          ),
        )
      }
    }
    const labelWidth = measureText(group.label, FONT_SIZE.groupLabel)
    if (labelWidth > group.rect.w - 16) {
      out.push(
        warning('TEXT_OVERFLOW', `Group label "${group.label}" is wider than the group box.`, group.id, 'Shorten the group label or add more members to the group.'),
      )
    }
  }

  return out
}

function overlaps(a: Rect, b: Rect, slack = 0.5): boolean {
  return a.x + slack < rectRight(b) && b.x + slack < rectRight(a) && a.y + slack < rectBottom(b) && b.y + slack < rectBottom(a)
}

/** 一个 group 递归包住的全部节点 id。 */
function memberNodeIds(diagram: NormalizedDiagram, groupId: string): Set<string> {
  const groups = new Map(diagram.groups.map((g) => [g.id, g]))
  const nodes = new Set(diagram.nodes.map((n) => n.id))
  const out = new Set<string>()
  const seen = new Set<string>()
  const walk = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    const g = groups.get(id)
    if (g === undefined) return
    for (const m of g.members) {
      if (nodes.has(m)) out.add(m)
      else walk(m)
    }
  }
  walk(groupId)
  return out
}
