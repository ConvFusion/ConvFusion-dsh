/**
 * ConvFusion — Diagram IR 规范化与**结构**校验（v0.5.5 / C08P07）
 *
 * 输入是 Agent 写的任意 JSON（`unknown`），输出是**内部规范化结构** + 结构诊断。
 * 这一层只回答"这份 IR 说不说得通"：字段类型、id 唯一、枚举合法、引用存在、
 * group 关系成树。图的连通性与视觉问题在 `validate.ts` 里查（那一层需要先布局）。
 *
 * 设计取向：**尽可能恢复**。一处枚举写错不该让整张图消失 —— 能回退到默认值的就回退，
 * 同时报一条 error/warning，让 Agent 按 `code` 改。只有"根本没有图"（nodes 为空或
 * 不是对象）才算致命。
 */

import {
  DIAGRAM_TYPES,
  EDGE_TYPES,
  IR_VERSION,
  LAYOUT_ALGORITHMS,
  LAYOUT_DIRECTIONS,
  NODE_TYPES,
  STYLE_TOKENS,
  error,
  warning,
  type Diagnostic,
  type DiagramEdge,
  type DiagramEdgeType,
  type DiagramEvidence,
  type DiagramGroup,
  type DiagramIR,
  type DiagramLabel,
  type DiagramNode,
  type DiagramNodeType,
  type DiagramStyleDefaults,
  type DiagramType,
  type LayoutAlgorithm,
  type LayoutDirection,
  type StyleToken,
} from './types.js'
import { NODE_STYLE_BY_TYPE } from './styles.js'

/* ════════════════════════════════════════════════════════════════════════
 * 规范化结构
 * ════════════════════════════════════════════════════════════════════════ */

export interface NormalizedNode {
  id: string
  type: DiagramNodeType
  label: string
  description?: string
  style: StyleToken
  /** 直接所属 group（多写冲突时取第一个并报错）。 */
  group?: string
  /** 声明顺序 —— 层内排序的依据（Agent 用它控制同层次序，不需要坐标）。 */
  order: number
  evidence: DiagramEvidence[]
}

export interface NormalizedGroup {
  id: string
  label: string
  style: StyleToken
  /** 直接成员（node id 或子 group id），去重后保持声明顺序。 */
  members: string[]
  order: number
  /** 父 group id（由成员关系推出）。 */
  parent?: string
  /** 1 = 顶层；2 = 嵌套一层。 */
  depth: number
}

export interface NormalizedEdge {
  id: string
  source: string
  target: string
  type: DiagramEdgeType
  label?: string
  order: number
}

export interface NormalizedLabel {
  id: string
  text: string
  anchor: string
}

/** 层间距的可调范围（见 `DiagramLayoutSpec.layer_gap`）。 */
export const LAYER_GAP_MIN = 12
export const LAYER_GAP_MAX = 120

export interface NormalizedDiagram {
  version: string
  type: DiagramType
  title?: string
  direction: LayoutDirection
  algorithm: LayoutAlgorithm
  /** 层间距覆盖值（未指定时用 `LAYOUT.layerGap`）。 */
  layerGap?: number
  /** 是否显示节点说明（来自 IR；渲染调用的显式参数优先）。 */
  showDescriptions?: boolean
  canvas: { width?: number; height?: number }
  nodes: NormalizedNode[]
  groups: NormalizedGroup[]
  edges: NormalizedEdge[]
  labels: NormalizedLabel[]
  styleDefaults: DiagramStyleDefaults
}

export interface NormalizeResult {
  /** 致命错误（写不出图）时为 null。 */
  diagram: NormalizedDiagram | null
  /**
   * 结构诊断。
   *
   * `fatal` = 连图都没有（`nodes` 缺失/为空/不是数组）：后面所有检查都不必做。
   */
  diagnostics: Diagnostic[]
  fatal: boolean
}

/* ════════════════════════════════════════════════════════════════════════
 * 小工具
 * ════════════════════════════════════════════════════════════════════════ */

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = asString(v)
  return s !== undefined && (allowed as readonly string[]).includes(s) ? (s as T) : undefined
}

/* ════════════════════════════════════════════════════════════════════════
 * 主入口
 * ════════════════════════════════════════════════════════════════════════ */

/** 把任意 JSON 规范化为内部结构。**不抛异常**：坏输入变成诊断。 */
export function normalizeIr(raw: unknown): NormalizeResult {
  const diagnostics: Diagnostic[] = []
  if (!isObject(raw)) {
    diagnostics.push(error('NOT_AN_OBJECT', 'Diagram IR must be a JSON object.', undefined, 'Pass an object like {"type":"method-overview","nodes":[...]}.'))
    return { diagram: null, diagnostics, fatal: true }
  }
  const src = raw as Partial<DiagramIR>

  /* ── 顶层枚举 ─────────────────────────────────────────────────────── */
  const type = pickEnum(src.type, DIAGRAM_TYPES)
  if (type === undefined) {
    diagnostics.push(
      error('UNKNOWN_DIAGRAM_TYPE', `Unknown or missing diagram type: ${JSON.stringify(src.type ?? null)}`, undefined, `Use one of: ${DIAGRAM_TYPES.join(', ')}.`),
    )
  }
  const version = asString(src.version) ?? IR_VERSION
  if (asString(src.version) !== undefined && version !== IR_VERSION) {
    diagnostics.push(warning('UNKNOWN_VERSION', `IR version "${version}" is not "${IR_VERSION}".`, undefined, `Omit version or use "${IR_VERSION}".`))
  }

  const layoutRaw = isObject(src.layout) ? src.layout : {}
  const direction = pickEnum(layoutRaw.direction, LAYOUT_DIRECTIONS) ?? 'LR'
  if (layoutRaw.direction !== undefined && pickEnum(layoutRaw.direction, LAYOUT_DIRECTIONS) === undefined) {
    diagnostics.push(
      error('UNKNOWN_LAYOUT_DIRECTION', `Unknown layout.direction: ${JSON.stringify(layoutRaw.direction)}`, undefined, `Use one of: ${LAYOUT_DIRECTIONS.join(', ')}.`),
    )
  }
  const algorithm = pickEnum(layoutRaw.algorithm, LAYOUT_ALGORITHMS) ?? 'hierarchical'
  let layerGap: number | undefined
  if (layoutRaw.layer_gap !== undefined) {
    const v = layoutRaw.layer_gap
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      diagnostics.push(
        error('BAD_FIELD_TYPE', `layout.layer_gap must be a number, got ${JSON.stringify(v)}.`, undefined, 'Omit it to use the default spacing.'),
      )
    } else {
      const clamped = Math.min(LAYER_GAP_MAX, Math.max(LAYER_GAP_MIN, v))
      if (clamped !== v) {
        diagnostics.push(
          warning('BAD_FIELD_TYPE', `layout.layer_gap ${v} is outside [${LAYER_GAP_MIN}, ${LAYER_GAP_MAX}] and was clamped to ${clamped}.`, undefined, 'Smaller than 12 makes edges and labels collide; larger than 120 wastes the canvas.'),
        )
      }
      layerGap = clamped
    }
  }
  if (layoutRaw.algorithm !== undefined && pickEnum(layoutRaw.algorithm, LAYOUT_ALGORITHMS) === undefined) {
    diagnostics.push(
      error('UNKNOWN_LAYOUT_ALGORITHM', `Unknown layout.algorithm: ${JSON.stringify(layoutRaw.algorithm)}`, undefined, `Use one of: ${LAYOUT_ALGORITHMS.join(', ')}.`),
    )
  }

  /* ── IR 级默认样式（要在 nodes/edges 之前解析，它们会用到）────────── */
  const styleDefaults: DiagramStyleDefaults = {}
  if (src.styles !== undefined && !isObject(src.styles)) {
    diagnostics.push(error('BAD_FIELD_TYPE', '`styles` must be an object.', undefined, 'Omit it, or use {"node":"module","edge":"data-flow","group":"container"}.'))
  } else if (isObject(src.styles)) {
    for (const key of ['node', 'edge', 'group'] as const) {
      const v = src.styles[key]
      if (v === undefined) continue
      // `edge` 取 edge type 而不是 node 样式 token（见 DiagramStyleDefaults 的说明）
      const allowed: readonly string[] = key === 'edge' ? EDGE_TYPES : STYLE_TOKENS
      const token = pickEnum(v, allowed)
      if (token === undefined) {
        diagnostics.push(
          error('UNKNOWN_STYLE_TOKEN', `styles.${key} is not a built-in token: ${JSON.stringify(v)}.`, undefined, `Use one of: ${allowed.join(', ')}.`),
        )
        continue
      }
      if (key === 'edge') styleDefaults.edge = token as DiagramEdgeType
      else styleDefaults[key] = token as StyleToken
    }
  }

  /* ── nodes（唯一的必需字段）───────────────────────────────────────── */
  if (!Array.isArray(src.nodes) || src.nodes.length === 0) {
    diagnostics.push(
      error('EMPTY_DIAGRAM', '`nodes` must be a non-empty array.', undefined, 'A diagram needs at least one node; add the entities the figure must show.'),
    )
    return { diagram: null, diagnostics, fatal: true }
  }

  const nodes: NormalizedNode[] = []
  const seenIds = new Map<string, string>() // id → 元素种类（报重复用）
  const claimId = (id: string, kind: string, label: string): void => {
    const prev = seenIds.get(id)
    if (prev !== undefined) {
      diagnostics.push(error('DUPLICATE_ID', `Id "${id}" is used by more than one element (${prev} and ${kind}).`, id, 'Ids must be unique across nodes, groups, edges and labels.'))
      return
    }
    seenIds.set(id, kind)
    if (!ID_PATTERN.test(id)) {
      diagnostics.push(error('INVALID_ID', `${kind} id "${id}" has an unsupported character.`, id, 'Use letters, digits, dot, dash, underscore or colon (e.g. "feature-fusion").'))
    }
    if (!label.trim()) {
      diagnostics.push(error('MISSING_FIELD', `${kind} "${id}" has an empty label.`, id, 'Every visible element needs a label — it is the text the reader sees.'))
    }
  }

  for (let i = 0; i < src.nodes.length; i++) {
    const rawNode = src.nodes[i]
    if (!isObject(rawNode)) {
      diagnostics.push(error('BAD_FIELD_TYPE', `nodes[${i}] is not an object.`, undefined, 'Each node is an object: {"id","type","label"}.'))
      continue
    }
    const id = asString(rawNode.id)
    if (id === undefined || !id.trim()) {
      diagnostics.push(error('MISSING_FIELD', `nodes[${i}] has no string "id".`, undefined, 'Give every node a stable id.'))
      continue
    }
    const label = asString(rawNode.label) ?? ''
    claimId(id, 'node', label)

    let nodeType = pickEnum(rawNode.type, NODE_TYPES)
    if (nodeType === undefined) {
      diagnostics.push(
        error('UNKNOWN_NODE_TYPE', `Node "${id}" has unknown type ${JSON.stringify(rawNode.type ?? null)}.`, id, `Use one of: ${NODE_TYPES.join(', ')}.`),
      )
      nodeType = 'module'
    }
    let style = pickEnum(rawNode.style, STYLE_TOKENS)
    if (rawNode.style !== undefined && style === undefined) {
      diagnostics.push(
        error('UNKNOWN_STYLE_TOKEN', `Node "${id}" has unknown style ${JSON.stringify(rawNode.style)}.`, id, `Use one of: ${STYLE_TOKENS.join(', ')}.`),
      )
    }
    const group = asString(rawNode.group)
    const description = asString(rawNode.description)
    const evidence = normalizeEvidence(rawNode.evidence)

    nodes.push({
      id,
      type: nodeType,
      label,
      ...(description !== undefined ? { description } : {}),
      style: style ?? styleDefaults.node ?? NODE_STYLE_BY_TYPE[nodeType],
      ...(group !== undefined ? { group } : {}),
      order: nodes.length,
      evidence,
    })
  }

  if (nodes.length === 0) {
    diagnostics.push(error('EMPTY_DIAGRAM', 'No usable node found in `nodes`.', undefined, 'Each node needs at least a string "id" and "label".'))
    return { diagram: null, diagnostics, fatal: true }
  }

  /* ── groups ───────────────────────────────────────────────────────── */
  const groups: NormalizedGroup[] = []
  const groupById = new Map<string, NormalizedGroup>()
  if (src.groups !== undefined) {
    if (!Array.isArray(src.groups)) {
      diagnostics.push(error('BAD_FIELD_TYPE', '`groups` must be an array.', undefined, 'Use [] or omit it.'))
    } else {
      for (let i = 0; i < src.groups.length; i++) {
        const rawGroup = src.groups[i]
        if (!isObject(rawGroup)) {
          diagnostics.push(error('BAD_FIELD_TYPE', `groups[${i}] is not an object.`))
          continue
        }
        const id = asString(rawGroup.id)
        if (id === undefined || !id.trim()) {
          diagnostics.push(error('MISSING_FIELD', `groups[${i}] has no string "id".`))
          continue
        }
        const label = asString(rawGroup.label) ?? ''
        claimId(id, 'group', label)
        let style = pickEnum(rawGroup.style, STYLE_TOKENS)
        if (rawGroup.style !== undefined && style === undefined) {
          diagnostics.push(
            error('UNKNOWN_STYLE_TOKEN', `Group "${id}" has unknown style ${JSON.stringify(rawGroup.style)}.`, id, `Use one of: ${STYLE_TOKENS.join(', ')}.`),
          )
        }
        const rawChildren = Array.isArray(rawGroup.children) ? rawGroup.children : []
        if (!Array.isArray(rawGroup.children)) {
          diagnostics.push(error('BAD_FIELD_TYPE', `Group "${id}" has no \`children\` array.`, id, 'A group without children encloses nothing.'))
        }
        const members: string[] = []
        for (const c of rawChildren) {
          const cid = asString(c)
          if (cid === undefined) {
            diagnostics.push(error('BAD_FIELD_TYPE', `Group "${id}" has a non-string child entry.`, id))
            continue
          }
          if (members.includes(cid)) {
            diagnostics.push(warning('DUPLICATE_ID', `Group "${id}" lists child "${cid}" twice.`, id, 'Remove the duplicate entry.'))
            continue
          }
          members.push(cid)
        }
        const g: NormalizedGroup = { id, label, style: style ?? styleDefaults.group ?? 'container', members, order: groups.length, depth: 1 }
        groups.push(g)
        groupById.set(id, g)
      }
    }
  }

  /* ── 成员关系：node.group 与 group.children 合并 ──────────────────── */
  // 两种写法都合法（dev-note §10 的 node.group、§11 的 group.children）。
  // 冲突/未知引用必须报出来 —— 静默丢弃成员会让"图少了一个模块"这种缺陷无法追查。
  for (const g of groups) {
    for (const m of g.members) {
      if (!groupById.has(m) && !nodes.some((n) => n.id === m)) {
        diagnostics.push(
          error('UNKNOWN_GROUP_MEMBER', `Group "${g.id}" lists unknown child "${m}".`, g.id, 'children must reference an existing node id or group id.'),
        )
      }
      if (groupById.has(m)) {
        const child = groupById.get(m) as NormalizedGroup
        if (child.parent !== undefined && child.parent !== g.id) {
          diagnostics.push(
            error('GROUP_CYCLE', `Group "${m}" is a child of both "${child.parent}" and "${g.id}".`, m, 'A group may belong to at most one parent group.'),
          )
        } else {
          child.parent = g.id
        }
        if (m === g.id) {
          diagnostics.push(error('GROUP_CYCLE', `Group "${g.id}" contains itself.`, g.id, 'Remove the self-reference.'))
        }
      }
    }
  }

  const groupOfNode = new Map<string, string>()
  for (const n of nodes) {
    if (n.group === undefined) continue
    if (!groupById.has(n.group)) {
      diagnostics.push(
        error('UNKNOWN_GROUP_MEMBER', `Node "${n.id}" declares group "${n.group}", which does not exist.`, n.id, 'Declare the group in `groups`, or drop the `group` field.'),
      )
      delete n.group
      continue
    }
    groupOfNode.set(n.id, n.group)
    const g = groupById.get(n.group) as NormalizedGroup
    if (!g.members.includes(n.id)) g.members.push(n.id)
  }

  // group.children 里出现的 node 也要记进 groupOfNode（两种写法等价）
  for (const g of groups) {
    for (const m of g.members) {
      const node = nodes.find((n) => n.id === m)
      if (node === undefined) continue
      const existing = groupOfNode.get(m)
      if (existing !== undefined && existing !== g.id) {
        diagnostics.push(
          error('NODE_IN_MULTIPLE_GROUPS', `Node "${m}" is claimed by groups "${existing}" and "${g.id}".`, m, 'A node belongs to exactly one group.'),
        )
        continue
      }
      groupOfNode.set(m, g.id)
      if (node.group !== undefined && node.group !== g.id) {
        diagnostics.push(
          error('GROUP_MEMBERSHIP_CONFLICT', `Node "${m}" says group="${node.group}" but is listed under "${g.id}".`, m, 'Keep one of the two ways of declaring membership, and make them agree.'),
        )
      }
      node.group = g.id
    }
  }

  // 深度（含环保护）
  for (const g of groups) {
    let depth = 1
    let cursor: NormalizedGroup | undefined = g
    const seen = new Set<string>([g.id])
    while (cursor?.parent !== undefined) {
      const parentId: string = cursor.parent
      if (seen.has(parentId)) {
        diagnostics.push(error('GROUP_CYCLE', `Group nesting cycle through "${parentId}".`, g.id, 'Group membership must form a tree.'))
        break
      }
      seen.add(parentId)
      depth += 1
      cursor = groupById.get(parentId)
    }
    g.depth = depth
    if (depth > 2) {
      diagnostics.push(
        error('GROUP_NESTING_TOO_DEEP', `Group "${g.id}" is nested ${depth} levels deep.`, g.id, 'Phase 1 supports at most two levels of nesting.'),
      )
    }
  }

  /* ── edges ────────────────────────────────────────────────────────── */
  const knownEndpoint = (id: string): boolean => nodes.some((n) => n.id === id) || groupById.has(id)
  const edges: NormalizedEdge[] = []
  const rawEdges = Array.isArray(src.edges) ? src.edges : []
  if (src.edges !== undefined && !Array.isArray(src.edges)) {
    diagnostics.push(error('BAD_FIELD_TYPE', '`edges` must be an array.', undefined, 'Use [] or omit it.'))
  }
  for (let i = 0; i < rawEdges.length; i++) {
    const rawEdge = rawEdges[i]
    if (!isObject(rawEdge)) {
      diagnostics.push(error('BAD_FIELD_TYPE', `edges[${i}] is not an object.`))
      continue
    }
    const id = asString(rawEdge.id) ?? `e${i + 1}`
    claimId(id, 'edge', asString(rawEdge.label) ?? id)
    const source = asString(rawEdge.source)
    const target = asString(rawEdge.target)
    if (source === undefined || !source.trim()) {
      diagnostics.push(error('MISSING_SOURCE', `Edge "${id}" has no string "source".`, id, 'Every edge needs a source node id.'))
      continue
    }
    if (target === undefined || !target.trim()) {
      diagnostics.push(error('MISSING_TARGET', `Edge "${id}" has no string "target".`, id, 'Every edge needs a target node id.'))
      continue
    }
    if (!knownEndpoint(source)) {
      diagnostics.push(error('MISSING_SOURCE', `Edge "${id}" starts at unknown id "${source}".`, id, `Declare a node or group with id "${source}", or fix the typo.`))
      continue
    }
    if (!knownEndpoint(target)) {
      diagnostics.push(error('MISSING_TARGET', `Edge "${id}" points at unknown id "${target}".`, id, `Declare a node or group with id "${target}", or fix the typo.`))
      continue
    }
    if (source === target) {
      diagnostics.push(error('SELF_EDGE', `Edge "${id}" connects "${source}" to itself.`, id, 'Self-loops are not supported; model the recurrence as a feedback edge between two distinct nodes.'))
      continue
    }
    let edgeType = pickEnum(rawEdge.type, EDGE_TYPES)
    if (rawEdge.type !== undefined && edgeType === undefined) {
      diagnostics.push(
        error('UNKNOWN_EDGE_TYPE', `Edge "${id}" has unknown type ${JSON.stringify(rawEdge.type)}.`, id, `Use one of: ${EDGE_TYPES.join(', ')}.`),
      )
    }
    if (rawEdge.style !== undefined && pickEnum(rawEdge.style, STYLE_TOKENS) === undefined) {
      diagnostics.push(
        error('UNKNOWN_STYLE_TOKEN', `Edge "${id}" has unknown style ${JSON.stringify(rawEdge.style)}.`, id, `Edge appearance follows \`type\`; use one of: ${EDGE_TYPES.join(', ')}.`),
      )
    }
    const label = asString(rawEdge.label)
    edges.push({
      id,
      source,
      target,
      type: edgeType ?? styleDefaults.edge ?? 'data-flow',
      ...(label !== undefined ? { label } : {}),
      order: edges.length,
    })
  }

  /* ── labels ───────────────────────────────────────────────────────── */
  const labels: NormalizedLabel[] = []
  const rawLabels = Array.isArray(src.labels) ? src.labels : []
  if (src.labels !== undefined && !Array.isArray(src.labels)) {
    diagnostics.push(error('BAD_FIELD_TYPE', '`labels` must be an array.', undefined, 'Use [] or omit it.'))
  }
  for (let i = 0; i < rawLabels.length; i++) {
    const rawLabel = rawLabels[i]
    if (!isObject(rawLabel)) {
      diagnostics.push(error('BAD_FIELD_TYPE', `labels[${i}] is not an object.`))
      continue
    }
    const id = asString(rawLabel.id) ?? `label${i + 1}`
    claimId(id, 'label', asString(rawLabel.text) ?? id)
    const text = asString(rawLabel.text)
    if (text === undefined || !text.trim()) {
      diagnostics.push(error('MISSING_FIELD', `Label "${id}" has no text.`, id))
      continue
    }
    const anchor = asString(rawLabel.anchor)
    if (anchor === undefined || !knownEndpoint(anchor)) {
      diagnostics.push(
        error('UNKNOWN_LABEL_ANCHOR', `Label "${id}" is anchored to unknown id ${JSON.stringify(anchor ?? null)}.`, id, 'anchor must be an existing node, group or edge id.'),
      )
      continue
    }
    labels.push({ id, text, anchor })
  }

  /* ── 画布与默认样式 ───────────────────────────────────────────────── */
  const canvasRaw = isObject(src.canvas) ? src.canvas : {}
  const canvas: { width?: number; height?: number } = {}
  for (const key of ['width', 'height'] as const) {
    const v = canvasRaw[key]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      diagnostics.push(error('BAD_FIELD_TYPE', `canvas.${key} must be a positive number, got ${JSON.stringify(v)}.`, undefined, 'Omit it to let the renderer size the canvas.'))
      continue
    }
    canvas[key] = v
  }

  return {
    diagram: {
      version,
      type: type ?? 'method-overview',
      ...(asString(src.title) !== undefined ? { title: asString(src.title) as string } : {}),
      direction,
      algorithm,
      ...(layerGap !== undefined ? { layerGap } : {}),
      ...(src.show_descriptions === true ? { showDescriptions: true } : {}),
      canvas,
      nodes,
      groups,
      edges,
      labels,
      styleDefaults,
    },
    diagnostics,
    fatal: false,
  }
}

/** `evidence` 字段宽松解析：字符串或 `{source, note}` 都接受。 */
function normalizeEvidence(raw: unknown): DiagramEvidence[] {
  if (raw === undefined) return []
  const list = Array.isArray(raw) ? raw : [raw]
  const out: DiagramEvidence[] = []
  for (const item of list) {
    if (typeof item === 'string') {
      if (item.trim()) out.push({ source: item })
      continue
    }
    if (isObject(item)) {
      const source = asString(item.source)
      if (source !== undefined && source.trim()) {
        const note = asString(item.note)
        out.push({ source, ...(note !== undefined ? { note } : {}) })
      }
    }
  }
  return out
}

/* ════════════════════════════════════════════════════════════════════════
 * group 树查询（layout / validate 共用）
 * ════════════════════════════════════════════════════════════════════════ */

/** 一个 group 下的**叶子 node**（递归展开子 group）。 */
export function leafNodesOf(diagram: NormalizedDiagram, groupId: string): NormalizedNode[] {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const groups = new Map(diagram.groups.map((g) => [g.id, g]))
  const out: NormalizedNode[] = []
  const seen = new Set<string>()
  const walk = (gid: string): void => {
    if (seen.has(gid)) return
    seen.add(gid)
    const g = groups.get(gid)
    if (g === undefined) return
    for (const m of g.members) {
      const node = byId.get(m)
      if (node !== undefined) out.push(node)
      else walk(m)
    }
  }
  walk(groupId)
  return out
}

/** 由最深层 group 开始向上排序（画容器时要先画内层）。 */
export function groupsDeepestFirst(diagram: NormalizedDiagram): NormalizedGroup[] {
  return [...diagram.groups].sort((a, b) => b.depth - a.depth || a.order - b.order)
}

/** 由最外层 group 开始（父节点优先）。 */
export function groupsShallowestFirst(diagram: NormalizedDiagram): NormalizedGroup[] {
  return [...diagram.groups].sort((a, b) => a.depth - b.depth || a.order - b.order)
}

/** 类型化的 `DiagramGroup` 出参（重新导出，供工具层做 JSON 输出）。 */
export type { DiagramGroup, DiagramIR, DiagramLabel, DiagramNode, DiagramEdge }
