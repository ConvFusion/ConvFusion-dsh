/**
 * ConvFusion — Diagram 确定性布局（v0.5.5 / C08P07）
 *
 * ## 这份布局解决什么
 *
 * Agent 写的是**关系**（谁连着谁），不是坐标。布局负责把关系变成几何，并且每次都
 * 变成**同样的**几何。三个决定：
 *
 * 1. **分层**：按最长路径把节点分到层（lane）；回边（feedback/residual 或成环的边）
 *    先被识别出来、不参与分层，否则成环图会被判成"无法布局"。
 * 2. **层内顺序**：按声明顺序（group 成员结块）。这就是 Agent 控制排版的**唯一旋钮** ——
 *    想要 Feature Fusion 在 Backbone 下面，就把它的声明或 group 位置调到前面，
 *    不需要（也不给）坐标。
 * 3. **走线**：正交走线，且**只在层间空隙里做竖直移动** —— 空隙里没有节点，所以
 *    "线穿过盒子"不是靠运气避开的。直连走线不行时退到上/下外绕，两条外绕路径
 *    的竖直段同样落在空隙里、水平段在全部节点之上/之下。
 *
 * ## 坐标映射
 *
 * 布局全部在**流向空间** `(u, v)` 里做：`u` 沿阅读方向、`v` 横向。这样 LR/RL/TB/BT
 * 共用同一份代码，最后一步才映射到屏幕 x/y（RL/BT 是镜像）。少一份代码 = 少一类
 * "某个方向下才出现"的缺陷。
 */

import { LAYOUT, FONT_SIZE } from './styles.js'
import {
  longestSegment,
  measureText,
  polylineIntersectsRect,
  r3,
  rectBottom,
  rectRight,
  simplifyPolyline,
  textBlockHeight,
  unionRects,
  wrapText,
  type Point,
  type Rect,
} from './geometry.js'
import { leafNodesOf, type NormalizedDiagram, type NormalizedEdge, type NormalizedGroup, type NormalizedNode } from './normalize.js'
import { warning, type Diagnostic } from './types.js'

/* ════════════════════════════════════════════════════════════════════════
 * 出参类型
 * ════════════════════════════════════════════════════════════════════════ */

export interface PlacedNode {
  id: string
  type: NormalizedNode['type']
  style: NormalizedNode['style']
  label: string
  labelLines: string[]
  descriptionLines: string[]
  rect: Rect
  layer: number
  /** 该 node 在 IR 里声明了证据吗（validate 用）。 */
  traced: boolean
}

export interface PlacedGroup {
  id: string
  label: string
  style: NormalizedGroup['style']
  rect: Rect
  depth: number
  /** 直接成员（含子 group）。 */
  members: string[]
}

export interface RoutedEdge {
  id: string
  source: string
  target: string
  /** 声明的端点（可能是 group id）—— 与 source/target（解析成 node）区分开。 */
  declaredSource: string
  declaredTarget: string
  type: NormalizedEdge['type']
  label?: string
  points: Point[]
  labelPos?: Point
  labelAnchor: 'middle' | 'start'
  /** 全部候选都穿过了节点（validate 报 EDGE_CROSSES_NODE 用）。 */
  crossesNode: boolean
  /** 走线用了外绕（validate 报"曲线过长/交叉"之类时用）。 */
  detoured: boolean
}

export interface PlacedLabel {
  id: string
  text: string
  x: number
  y: number
  anchor: 'middle' | 'start' | 'end'
}

export interface LayoutResult {
  width: number
  height: number
  title?: string
  titleX: number
  titleY: number
  nodes: PlacedNode[]
  nodeById: Map<string, PlacedNode>
  groups: PlacedGroup[]
  groupById: Map<string, PlacedGroup>
  edges: RoutedEdge[]
  labels: PlacedLabel[]
  /** 走线检测用到的层带（供 validate 判定空间是否够）。 */
  layerBands: Array<{ start: number; end: number }>
  diagnostics: Diagnostic[]
}

export interface RenderOptions {
  /** 是否在节点里显示 `description`（默认 false —— dev-note §21：图上字越少越好）。 */
  showDescriptions?: boolean
}

/* ════════════════════════════════════════════════════════════════════════
 * 主入口
 * ════════════════════════════════════════════════════════════════════════ */

/** 把规范化 IR 布局成几何。纯函数：不读文件、不用随机数、不看时钟。 */
export function layoutDiagram(diagram: NormalizedDiagram, options: RenderOptions = {}): LayoutResult {
  const diagnostics: Diagnostic[] = []
  const horizontal = diagram.direction === 'LR' || diagram.direction === 'RL'
  // 显式渲染参数优先；IR 里声明的（`show_descriptions`）次之 —— 后者保证"重渲染得到同一张图"。
  const showDescriptions = options.showDescriptions ?? diagram.showDescriptions === true
  /**
   * 层间距：IR 可覆盖（`layout.layer_gap`）。
   *
   * 统一配置（dev-note §20）是"默认值集中在一处"，不是"所有图必须一样松"：
   * 内容多、链条长的图需要密排才能在论文里保持可读，密排与否属于**这张图**的决定。
   */
  const layerGap = diagram.layerGap ?? LAYOUT.layerGap

  /* ── 1. 节点尺寸（由文字决定，不由 Agent 决定）───────────────────── */
  const sizes = new Map<string, { w: number; h: number; labelLines: string[]; descriptionLines: string[] }>()
  for (const node of diagram.nodes) {
    const labelLines = wrapText(node.label, LAYOUT.nodeMaxLabelWidth, FONT_SIZE.nodeLabel)
    const descriptionLines =
      showDescriptions && node.description ? wrapText(node.description, LAYOUT.nodeMaxLabelWidth, FONT_SIZE.nodeDescription) : []
    const widest = Math.max(
      ...labelLines.map((l) => measureText(l, FONT_SIZE.nodeLabel)),
      ...descriptionLines.map((l) => measureText(l, FONT_SIZE.nodeDescription)),
      0,
    )
    const w = Math.max(LAYOUT.nodeMinWidth, Math.min(LAYOUT.nodeMaxLabelWidth, widest) + 2 * LAYOUT.nodePaddingX)
    const labelH = textBlockHeight(labelLines.length, FONT_SIZE.nodeLabel, LAYOUT.lineHeightRatio)
    const descH = textBlockHeight(descriptionLines.length, FONT_SIZE.nodeDescription, LAYOUT.lineHeightRatio)
    const gap = descriptionLines.length > 0 ? 4 : 0
    const h = 2 * LAYOUT.nodePaddingY + labelH + gap + descH
    sizes.set(node.id, { w: r3(w), h: r3(h), labelLines, descriptionLines })
  }

  /* ── 2. 端点解析：group → 代表节点 ──────────────────────────────── */
  const nodeById0 = new Map(diagram.nodes.map((n) => [n.id, n]))
  const groupById0 = new Map(diagram.groups.map((g) => [g.id, g]))

  /**
   * 一条边可以指向一个 group（dev-note §12 的示例就是 `target: "encoder"`，而
   * `encoder` 是 §11 定义的 group）。这里把它解析成组内的**入口/出口节点**参与分层，
   * 画的时候再把线裁到 group 边框上 —— 读者看到的是"箭头指向 Encoder 这个块"。
   *
   * 解析要两轮：第一轮用声明顺序猜入口/出口（此时还没有层号），拿到层号后再用
   * **层号**重解析一次。一轮就够用了，但一轮不够诚实 —— 组里节点的层号才真正
   * 决定谁是入口。两轮是确定性的，且不会来回震荡（第二轮的结果被直接采用）。
   */
  const resolveEndpoints = (layerHint?: Map<string, number>): Map<string, string> => {
    const out = new Map<string, string>()
    for (const e of diagram.edges) {
      for (const [ref, role] of [
        [e.source, 'source'],
        [e.target, 'target'],
      ] as const) {
        if (nodeById0.has(ref)) {
          out.set(`${e.id}:${role}`, ref)
          continue
        }
        if (!groupById0.has(ref)) continue
        const leaves = leafNodesOf(diagram, ref)
        if (leaves.length === 0) continue
        const sorted = [...leaves].sort((a, b) => {
          const la = layerHint?.get(a.id) ?? 0
          const lb = layerHint?.get(b.id) ?? 0
          // 出口取最靠后的（层大者优先，同层按声明顺序靠后者）；入口取最靠前的。
          return role === 'source' ? lb - la || b.order - a.order : la - lb || a.order - b.order
        })
        out.set(`${e.id}:${role}`, (sorted[0] as NormalizedNode).id)
      }
    }
    return out
  }

  const toLayeringEdges = (resolved: Map<string, string>): Array<{ id: string; source: string; target: string }> =>
    diagram.edges
      .map((e) => ({ id: e.id, source: resolved.get(`${e.id}:source`), target: resolved.get(`${e.id}:target`) }))
      .filter((e): e is { id: string; source: string; target: string } => e.source !== undefined && e.target !== undefined)

  let endpointOf = resolveEndpoints()
  let layered = computeLayers(diagram, toLayeringEdges(endpointOf))
  endpointOf = resolveEndpoints(layered.layer)
  layered = computeLayers(diagram, toLayeringEdges(endpointOf))

  /** 供画线复用同一份解析结果（否则层号与实际锚点会不一致）。 */
  const resolveEndpoint = (id: string, role: 'source' | 'target'): string | null =>
    endpointOf.get(`${id}:${role}`) ?? (nodeById0.has(id) ? id : null)
  /* ── 3. 分层：回边 + 最长路径 ───────────────────────────────────── */
  if (layered.backEdges.size > 0) {
    diagnostics.push(
      warning(
        'CYCLE_DETECTED',
        `${layered.backEdges.size} edge(s) form a cycle in the flow graph.`,
        [...layered.backEdges].sort().join(', '),
        'Cycles are allowed (feedback/residual), but check that the direction is what the text claims.',
      ),
    )
  }
  if (layered.unlayerable) {
    diagnostics.push(
      warning('UNLAYERABLE_STRUCTURE', 'The graph could not be fully layered; some nodes were placed in declaration order.', undefined, 'Check for contradictory edge directions.'),
    )
  }

  const layerOf = new Map<string, number>()
  for (const node of diagram.nodes) layerOf.set(node.id, layered.layer.get(node.id) ?? 0)

  if (diagram.algorithm === 'grid') {
    // grid：忽略边，按声明顺序铺格子。用于"没有主流程"的结构图。
    const cols = Math.max(1, Math.ceil(Math.sqrt(diagram.nodes.length)))
    diagram.nodes.forEach((n, i) => layerOf.set(n.id, Math.floor(i / cols)))
  }

  /* ── 4. 层桶 + 尺寸工具 ─────────────────────────────────────────── */
  /** 沿流方向的尺寸：LR/RL 用宽，TB/BT 用高。 */
  const uExtent = (id: string): number => {
    const s = sizes.get(id) as { w: number; h: number }
    return horizontal ? s.w : s.h
  }
  /** 横向（层内堆叠方向）的尺寸。 */
  const vExtent = (id: string): number => {
    const s = sizes.get(id) as { w: number; h: number }
    return horizontal ? s.h : s.w
  }

  const layers = new Map<number, NormalizedNode[]>()
  for (const node of diagram.nodes) {
    const l = layerOf.get(node.id) ?? 0
    const bucket = layers.get(l)
    if (bucket === undefined) layers.set(l, [node])
    else bucket.push(node)
  }
  const layerIndexes = [...layers.keys()].sort((a, b) => a - b)
  // 层内按声明顺序（渲染顺序与泳道内的堆叠顺序都以它为准）
  for (const l of layerIndexes) {
    ;(layers.get(l) as NormalizedNode[]).sort((a, b) => a.order - b.order)
  }

  /* ── 5. 泳道划分：一个 group 占一条横向泳道 ────────────────────── */
  /**
   * 为什么需要泳道，而不是"把成员放一起、容器画个大框"：
   *
   * 一个 group 的成员可能落在**不同层**（比如 Encoder 的 Backbone 在第 1 层、
   * Feature Fusion 在第 2 层）。如果容器只是成员外接矩形，而别的节点恰好也在这两层里、
   * 纵向又落在同一段高度上，那个框就会**把不相干的节点也圈进去** —— 读者无法判断
   * "哪些盒子属于 Encoder"。这是实测出来的缺陷（`GROUP_OVERLAPS_FOREIGN_NODE` 报过两次）。
   *
   * 泳道的做法：每个 group 在**横向上独占一段高度**，成员在自己那段里排，非成员一律
   * 排到别的段里。于是容器的纵向范围天然只含成员，`GROUP_OVERLAPS_FOREIGN_NODE`
   * 从"靠运气不出现"变成"构造上不出现"。
   *
   * 规则（都属于"声明顺序是唯一旋钮"）：
   *   - 同一容器里，**直接成员节点**合成一条"打包泳道"（按层堆叠，不各占一条），
   *     否则一条 10 个节点的链会把画布拉成 10 个节点那么高；
   *   - **每个子 group** 各占一条泳道（递归下去，所以嵌套 = 泳道套泳道）；
   *   - 泳道之间的先后 = 各自叶子节点里**最先声明**的那个。
   */
  interface Lane {
    /** 泳道所属容器（`__root__` 或 group id）。 */
    owner: string
    /** 这条泳道代表的子 group（打包泳道没有）。 */
    subgroup?: string
    /** 打包泳道里的直接成员节点 id。 */
    packed: string[]
    /** 子泳道（仅当这条泳道代表一个 group）。 */
    children: Lane[]
    /** 这条泳道占的高度（取各层内容的最大值）。 */
    size: number
    /** 在本容器内的纵向偏移。 */
    offset: number
  }

  const nodeByOrder = new Map(diagram.nodes.map((n) => [n.id, n]))
  const orderOf = (id: string): number => (nodeByOrder.get(id) as NormalizedNode).order
  const minOrderOfLane = (lane: Lane): number => {
    if (lane.subgroup !== undefined) {
      const leaves = leafNodesOf(diagram, lane.subgroup)
      return leaves.length > 0 ? Math.min(...leaves.map((n) => n.order)) : Number.MAX_SAFE_INTEGER
    }
    return lane.packed.length > 0 ? Math.min(...lane.packed.map(orderOf)) : Number.MAX_SAFE_INTEGER
  }

  /**
   * 一个 group 是否需要**独占一条泳道**。
   *
   * 判据：**它跨越的那个层区间里，有没有哪一层装着非成员**。
   *
   * ⚠️ 是"层区间"，不是"成员所在的那几层"。容器框是一个矩形，纵向覆盖
   * `[首行, 末行]`；只要**区间内任何一层**有外来节点，它就会被框进去 ——
   * 哪怕那一层里一个成员都没有。实测（自检 Test 4）：`stage2 = {conv2, fusion}`
   * 占第 2、4 层，而 `branch-a/branch-b` 恰好在中间的第 3 层；按"同层混装"判会
   * 误判成可就地排版，结果容器把两个分支一起圈了进去（自检当场报出）。
   *
   * - 有外来节点 → 独占泳道（最初引入泳道的场景：Encoder 跨第 1、2 层，
   *   而 Input / Prediction 也在那两层里）。
   * - 没有 → **就地排版**。此时框的纵向范围只覆盖自己的若干行，而每一行互不相交，
   *   框里天然只有成员；硬塞一条泳道反而会把整张图拧成"左→右→左"的蛇形
   *   （实测：忠实还原 RDP 那张图时 DCRM 被推到右侧竖带，中间空一大片，
   *   而原图是**单列居中**的流程）。
   */
  const needsLane = (groupId: string): boolean => {
    const group = diagram.groups.find((g) => g.id === groupId)
    if (group === undefined) return true
    /**
     * 只对**顶层且成员全是节点**的 group 做就地排版。
     *
     * 其余（嵌套 / 含子 group）一律走泳道。原因是叠层会让"装修高度"重复计入：
     * 子 group 的框顶已经含了一份标签带与 padding，父 group 再往上加一份，
     * 而泳道只预留了一份 —— 实测（自检 Test 4）：`backbone` 的框会顶进上面那一条
     * 泳道，把 `branch-b` 圈进去。就地排版是**优化**不是必需，所以宁可收紧适用范围，
     * 也不要为了省一条泳道去承担这个坑。
     */
    const memberIsGroup = group.members.some((m) => diagram.groups.some((g) => g.id === m))
    if (group.parent !== undefined || memberIsGroup) return true
    if (group.members.length === 0) return false

    // 就地排版的前提：它跨越的层区间里没有任何非成员（否则框会把外来节点圈进去）。
    const members = new Set(group.members)
    const ls = group.members.map((id) => layerOf.get(id) ?? 0)
    const first = Math.min(...ls)
    const last = Math.max(...ls)
    for (const l of layerIndexes) {
      if (l < first || l > last) continue
      const bucket = layers.get(l) as NormalizedNode[]
      if (bucket.some((n) => !members.has(n.id))) return true
    }
    return false
  }

  /** 构造某个容器（`__root__` 或 group id）下的泳道列表。 */
  const buildLanes = (owner: string): Lane[] => {
    const isRoot = owner === '__root__'
    const subGroups = diagram.groups.filter((g) => (isRoot ? g.parent === undefined : g.parent === owner)).map((g) => g.id)
    // 直接成员节点 + **不需要独占泳道**的子 group 的节点（拍平进本容器）
    const packed: string[] = diagram.nodes.filter((n) => (isRoot ? n.group === undefined : n.group === owner)).map((n) => n.id)
    const lanes: Lane[] = []
    /** 把一个不需要泳道的 group 递归拍平：它的节点进 packed，需要泳道的孙 group 仍各自成道。 */
    const flatten = (gid: string): void => {
      for (const n of diagram.nodes) if (n.group === gid) packed.push(n.id)
      for (const child of diagram.groups) {
        if (child.parent !== gid) continue
        if (needsLane(child.id)) lanes.push({ owner, subgroup: child.id, packed: [], children: buildLanes(child.id), size: 0, offset: 0 })
        else flatten(child.id)
      }
    }
    for (const gid of subGroups) {
      if (needsLane(gid)) lanes.push({ owner, subgroup: gid, packed: [], children: buildLanes(gid), size: 0, offset: 0 })
      else flatten(gid)
    }
    if (packed.length > 0) lanes.unshift({ owner, packed, children: [], size: 0, offset: 0 })
    lanes.sort((a, b) => minOrderOfLane(a) - minOrderOfLane(b))
    return lanes
  }


  const rootLanes = buildLanes('__root__')



  /**
   * 容器自身的"装修高度"：上下 padding + 顶部标签带。
   *
   * ⚠️ 它必须计入**泳道尺寸**，不能只在画框时加上去。否则容器框会长出自己那条泳道、
   * 压到相邻泳道的节点上（实测：Encoder 框的下沿压到了 Input 那一行，
   * `GROUP_OVERLAPS_FOREIGN_NODE` 照样报）。把它算进尺寸，框就正好等于泳道带。
   */
  const GROUP_CHROME = 2 * LAYOUT.groupPadding + LAYOUT.groupLabelBand

  /** 打包泳道在某一层的内容高度；group 泳道是层无关的（= 子泳道之和）。 */
  const contentHeight = (lane: Lane, layer: number | null): number => {
    if (lane.subgroup !== undefined) {
      return lane.children.reduce((sum, c) => sum + c.size, 0) + LAYOUT.nodeGap * Math.max(0, lane.children.length - 1)
    }
    const present = lane.packed.filter((id) => layer === null || (layerOf.get(id) ?? 0) === layer).sort((a, b) => orderOf(a) - orderOf(b))
    if (present.length === 0) return 0
    return present.reduce((sum, id) => sum + vExtent(id), 0) + LAYOUT.nodeGap * Math.max(0, present.length - 1)
  }

  /** 自底向上定尺寸：子泳道先定，父泳道才能是"子泳道之和"。 */
  const measureLanes = (lanes: Lane[]): void => {
    for (const lane of lanes) if (lane.subgroup !== undefined) measureLanes(lane.children)
    for (const lane of lanes) {
      lane.size =
        lane.subgroup !== undefined
          ? contentHeight(lane, null) + GROUP_CHROME
          : Math.max(0, ...layerIndexes.map((l) => contentHeight(lane, l)))
    }
  }
  measureLanes(rootLanes)

  {
    let v = 0
    for (const lane of rootLanes) {
      lane.offset = v
      v += lane.size + LAYOUT.nodeGap
    }
    const assignInner = (lanes: Lane[]): void => {
      let cursor2 = 0
      for (const lane of lanes) {
        lane.offset = cursor2
        cursor2 += lane.size + LAYOUT.nodeGap
        if (lane.subgroup !== undefined) assignInner(lane.children)
      }
    }
    for (const lane of rootLanes) if (lane.subgroup !== undefined) assignInner(lane.children)
  }

  const flowVEnd = rootLanes.reduce((sum, l) => sum + l.size, 0) + LAYOUT.nodeGap * Math.max(0, rootLanes.length - 1)

  /* ── 6. 流向空间定位（u 沿层推进，v 由泳道决定）────────────────── */
  const bandWidth = new Map<number, number>()
  for (const l of layerIndexes) {
    const bucket = layers.get(l) as NormalizedNode[]
    bandWidth.set(l, Math.max(...bucket.map((n) => uExtent(n.id))))
  }

  /**
   * **就地排版**的容器要沿流向在首/末行之外留出 `groupPadding`，否则容器框会压到相邻
   * 那一层的节点上（泳道化的容器不需要：它的装修已算进泳道尺寸）。
   *
   * ⚠️ 这里只补"沿流向"的那一份：标签带在**横向**（TB 里是屏幕 x），而就地排版的前提
   * 就是那几行没有别的节点，所以横向那份天然安全。
   */
  const flowChrome = Math.max(0, LAYOUT.groupPadding - layerGap)
  const chromeBefore = new Set<number>()
  const chromeAfter = new Set<number>()
  if (flowChrome > 0) {
    for (const g of diagram.groups) {
      if (needsLane(g.id)) continue
      const leaves = leafNodesOf(diagram, g.id)
      if (leaves.length === 0) continue
      const ls = leaves.map((n) => layerOf.get(n.id) ?? 0)
      chromeBefore.add(Math.min(...ls))
      chromeAfter.add(Math.max(...ls))
    }
  }

  const bandStart = new Map<number, number>()
  let cursor = 0
  for (const l of layerIndexes) {
    if (chromeBefore.has(l)) cursor += flowChrome
    bandStart.set(l, cursor)
    cursor += (bandWidth.get(l) as number) + layerGap + (chromeAfter.has(l) ? flowChrome : 0)
  }
  const flowUEnd = Math.max(0, cursor - layerGap)

  interface FlowBox {
    node: NormalizedNode
    u: number
    v: number
    uSize: number
    vSize: number
  }
  /** 由泳道树算出每个节点在流向空间里的 v（自上而下）。 */
  const nodeV = new Map<string, number>()
  const placeLanes = (lanes: Lane[], baseV: number): void => {
    for (const lane of lanes) {
      const laneTop = baseV + lane.offset
      if (lane.subgroup !== undefined) {
        // 子泳道排在容器的"装修"之内：框线之下的内容区
        placeLanes(lane.children, laneTop + LAYOUT.groupPadding + LAYOUT.groupLabelBand)
        continue
      }
      for (const l of layerIndexes) {
        const present = lane.packed.filter((id) => (layerOf.get(id) ?? 0) === l).sort((a, b) => orderOf(a) - orderOf(b))
        if (present.length === 0) continue
        const height = present.reduce((sum, id) => sum + vExtent(id), 0) + LAYOUT.nodeGap * Math.max(0, present.length - 1)
        let v = laneTop + (lane.size - height) / 2
        for (const id of present) {
          nodeV.set(id, v)
          v += vExtent(id) + LAYOUT.nodeGap
        }
      }
    }
  }
  placeLanes(rootLanes, 0)

  const flowBoxes: FlowBox[] = []
  for (const l of layerIndexes) {
    const bucket = layers.get(l) as NormalizedNode[]
    const band = bandWidth.get(l) as number
    for (const n of bucket) {
      const uSize = uExtent(n.id)
      const vSize = vExtent(n.id)
      flowBoxes.push({ node: n, u: (bandStart.get(l) as number) + (band - uSize) / 2, v: nodeV.get(n.id) ?? 0, uSize, vSize })
    }
  }

  /* ── 7. 流向 → 屏幕 ─────────────────────────────────────────────── */
  const mapPoint = (u: number, v: number): Point => {
    switch (diagram.direction) {
      case 'LR':
        return { x: u, y: v }
      case 'RL':
        return { x: flowUEnd - u, y: v }
      case 'TB':
        return { x: v, y: u }
      case 'BT':
        return { x: v, y: flowUEnd - u }
    }
  }
  /** 把一个流向矩形映射成屏幕矩形（镜像会让"左上角"变到另一边，所以不能只映射角点）。 */
  const mapRect = (u: number, v: number, uSize: number, vSize: number): Rect => {
    const a = mapPoint(u, v)
    const b = mapPoint(u + uSize, v + vSize)
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
  }

  const nodes: PlacedNode[] = flowBoxes.map((box) => {
    const size = sizes.get(box.node.id) as { w: number; h: number; labelLines: string[]; descriptionLines: string[] }
    return {
      id: box.node.id,
      type: box.node.type,
      style: box.node.style,
      label: box.node.label,
      labelLines: size.labelLines,
      descriptionLines: size.descriptionLines,
      rect: mapRect(box.u, box.v, box.uSize, box.vSize),
      layer: layerOf.get(box.node.id) ?? 0,
      traced: box.node.evidence.length > 0 || box.node.group !== undefined,
    }
  })
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const flowOf = new Map(flowBoxes.map((b) => [b.node.id, b]))

  /* ── 8. group 容器（正好是它自己那条泳道带）─────────────────────── */
  const groups: PlacedGroup[] = []
  const groupFlowRect = new Map<string, Rect>()
  const deepFirst = [...diagram.groups].sort((a, b) => b.depth - a.depth || a.order - b.order)
  for (const g of deepFirst) {
    const memberRects: Rect[] = []
    for (const m of g.members) {
      const child = groupFlowRect.get(m)
      if (child !== undefined) memberRects.push(child)
      const flow = flowOf.get(m)
      if (flow !== undefined) memberRects.push({ x: flow.u, y: flow.v, w: flow.uSize, h: flow.vSize })
    }
    const union = unionRects(memberRects)
    if (union === null) continue
    const rect: Rect = {
      x: r3(union.x - LAYOUT.groupPadding),
      y: r3(union.y - LAYOUT.groupPadding - LAYOUT.groupLabelBand),
      w: r3(union.w + 2 * LAYOUT.groupPadding),
      h: r3(union.h + 2 * LAYOUT.groupPadding + LAYOUT.groupLabelBand),
    }
    groupFlowRect.set(g.id, rect)
    groups.push({ id: g.id, label: g.label, style: g.style, rect: mapRect(rect.x, rect.y, rect.w, rect.h), depth: g.depth, members: g.members })
  }
  const groupById = new Map(groups.map((g) => [g.id, g]))
  if (process.env.CF_DBG) {
    const dump = (lanes: any[], depth: number): void => {
      for (const lane of lanes) {
        console.log('  '.repeat(depth), `lane owner=${lane.owner} sub=${lane.subgroup ?? '-'} packed=[${lane.packed.join(',')}] size=${lane.size.toFixed(0)} offset=${lane.offset.toFixed(0)} children=${lane.children.length}`)
        if (lane.children.length) dump(lane.children, depth + 1)
      }
    }
    console.log('=== root lanes ==='); dump(rootLanes, 0)
    console.log('=== flow group rects ===')
    for (const [id, r] of groupFlowRect) console.log(`   ${id}: u/v=(${r.x.toFixed(0)},${r.y.toFixed(0)}) ${r.w.toFixed(0)}x${r.h.toFixed(0)}`)
    console.log('=== flow boxes (v ranges) ===')
    for (const b of flowBoxes) console.log(`   ${b.node.id.padEnd(9)} u=${b.u.toFixed(0)} v=${b.v.toFixed(0)}..${(b.v + b.vSize).toFixed(0)}`)
    console.log('=== total flowVEnd', flowVEnd.toFixed(0), '===') 
  }

  /* ── 9. 走线 ────────────────────────────────────────────────────── */
  const vTop = Math.min(...flowBoxes.map((b) => b.v))
  const vBottom = Math.max(...flowBoxes.map((b) => b.v + b.vSize))

  const laneBefore = (l: number): number => {
    const idx = layerIndexes.indexOf(l)
    if (idx <= 0) return (bandStart.get(l) as number) - layerGap / 2
    const prev = layerIndexes[idx - 1] as number
    return ((bandStart.get(prev) as number) + (bandWidth.get(prev) as number) + (bandStart.get(l) as number)) / 2
  }
  const laneAfter = (l: number): number => {
    const idx = layerIndexes.indexOf(l)
    if (idx < 0 || idx >= layerIndexes.length - 1) {
      return (bandStart.get(l) as number) + (bandWidth.get(l) as number) + layerGap / 2
    }
    const next = layerIndexes[idx + 1] as number
    return ((bandStart.get(l) as number) + (bandWidth.get(l) as number) + (bandStart.get(next) as number)) / 2
  }

  const obstacles = (sourceId: string, targetId: string): Rect[] =>
    flowBoxes.filter((b) => b.node.id !== sourceId && b.node.id !== targetId).map((b) => ({ x: b.u, y: b.v, w: b.uSize, h: b.vSize }))

  const isClear = (path: Point[], sourceId: string, targetId: string): boolean => {
    const rects = obstacles(sourceId, targetId)
    for (const r of rects) if (polylineIntersectsRect(path, r, 1.5)) return false
    return true
  }

  const edges: RoutedEdge[] = []
  for (const edge of diagram.edges) {
    const sourceId = resolveEndpoint(edge.id, 'source')
    const targetId = resolveEndpoint(edge.id, 'target')
    if (sourceId === null || targetId === null) continue // normalize 已报过错
    const sBox = flowOf.get(sourceId)
    const tBox = flowOf.get(targetId)
    if (sBox === undefined || tBox === undefined) continue
    const ls = layerOf.get(sourceId) ?? 0
    const lt = layerOf.get(targetId) ?? 0

    const sV = sBox.v + sBox.vSize / 2
    const tV = tBox.v + tBox.vSize / 2

    const candidates: Point[][] = []
    if (ls < lt) {
      // 前向：从 uEnd 出、uStart 进
      const uOut = sBox.u + sBox.uSize
      const uIn = tBox.u
      const lane = laneAfter(ls)
      candidates.push([
        { x: uOut, y: sV },
        { x: lane, y: sV },
        { x: lane, y: tV },
        { x: uIn, y: tV },
      ])
      const laneT = laneBefore(lt)
      for (const vLane of [vTop - LAYOUT.detourGap, vBottom + LAYOUT.detourGap]) {
        candidates.push([
          { x: uOut, y: sV },
          { x: lane, y: sV },
          { x: lane, y: vLane },
          { x: laneT, y: vLane },
          { x: laneT, y: tV },
          { x: uIn, y: tV },
        ])
      }
    } else if (ls > lt) {
      // 回边：从 uStart 出、uEnd 进
      const uOut = sBox.u
      const uIn = tBox.u + tBox.uSize
      const lane = laneBefore(ls)
      candidates.push([
        { x: uOut, y: sV },
        { x: lane, y: sV },
        { x: lane, y: tV },
        { x: uIn, y: tV },
      ])
      const laneT = laneAfter(lt)
      for (const vLane of [vTop - LAYOUT.detourGap, vBottom + LAYOUT.detourGap]) {
        candidates.push([
          { x: uOut, y: sV },
          { x: lane, y: sV },
          { x: lane, y: vLane },
          { x: laneT, y: vLane },
          { x: laneT, y: tV },
          { x: uIn, y: tV },
        ])
      }
    } else {
      // 同层：都从 uEnd 侧进出，借层后空隙折返
      const uOut = sBox.u + sBox.uSize
      const uIn = tBox.u + tBox.uSize
      const lane = laneAfter(ls)
      candidates.push([
        { x: uOut, y: sV },
        { x: lane, y: sV },
        { x: lane, y: tV },
        { x: uIn, y: tV },
      ])
      for (const vLane of [vTop - LAYOUT.detourGap, vBottom + LAYOUT.detourGap]) {
        candidates.push([
          { x: uOut, y: sV },
          { x: lane, y: sV },
          { x: lane, y: vLane },
          { x: uIn, y: vLane },
          { x: uIn, y: tV },
        ])
      }
    }

    let chosen: Point[] | null = null
    let detoured = false
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i] as Point[]
      if (isClear(cand, sourceId, targetId)) {
        chosen = cand
        detoured = i > 0
        break
      }
    }
    const crosses = chosen === null
    if (chosen === null) chosen = candidates[0] as Point[]

    let points = simplifyPolyline(chosen.map((p) => mapPoint(p.x, p.y)))

    const declaredSource = groupById0.has(edge.source) ? edge.source : sourceId
    const declaredTarget = groupById0.has(edge.target) ? edge.target : targetId
    const srcGroup = declaredSource !== sourceId ? groupById.get(declaredSource) : undefined
    const tgtGroup = declaredTarget !== targetId ? groupById.get(declaredTarget) : undefined
    if (srcGroup !== undefined) points = clipAtRect(points, srcGroup.rect, 'start')
    if (tgtGroup !== undefined) points = clipAtRect(points, tgtGroup.rect, 'end')
    points = simplifyPolyline(points)

    const routed: RoutedEdge = {
      id: edge.id,
      source: sourceId,
      target: targetId,
      declaredSource,
      declaredTarget,
      type: edge.type,
      ...(edge.label !== undefined ? { label: edge.label } : {}),
      points,
      labelAnchor: 'middle',
      crossesNode: crosses,
      detoured,
    }
    if (edge.label !== undefined && points.length >= 2) {
      const seg = longestSegment(points)
      routed.labelPos = seg.horizontal
        ? { x: r3(seg.mid.x), y: r3(seg.mid.y - 6) }
        : { x: r3(seg.mid.x + 6), y: r3(seg.mid.y) }
      routed.labelAnchor = seg.horizontal ? 'middle' : 'start'
    }
    edges.push(routed)
  }

  /* ── 10. 独立 Label ─────────────────────────────────────────────── */
  const labels: PlacedLabel[] = []
  for (const label of diagram.labels) {
    const node = nodeById.get(label.anchor)
    if (node !== undefined) {
      labels.push({ id: label.id, text: label.text, x: r3(node.rect.x + node.rect.w / 2), y: r3(rectBottom(node.rect) + 15), anchor: 'middle' })
      continue
    }
    const group = groupById.get(label.anchor)
    if (group !== undefined) {
      labels.push({ id: label.id, text: label.text, x: r3(rectRight(group.rect) - 8), y: r3(group.rect.y + 14), anchor: 'end' })
      continue
    }
    const edge = edges.find((e) => e.id === label.anchor)
    if (edge?.labelPos !== undefined) {
      labels.push({ id: label.id, text: label.text, x: r3(edge.labelPos.x), y: r3(edge.labelPos.y), anchor: edge.labelAnchor })
    }
  }

  /* ── 11. 整体平移 + 画布尺寸 ────────────────────────────────────── */
  const title = diagram.title
  const titleBand = title !== undefined ? LAYOUT.titleBand : 0
  const boundsList: Rect[] = [
    ...nodes.map((n) => n.rect),
    ...groups.map((g) => g.rect),
    ...edges.map((e) => unionRects(e.points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))).filter((r): r is Rect => r !== null),
  ]
  const bounds = unionRects(boundsList) ?? { x: 0, y: 0, w: 0, h: 0 }
  const dx = LAYOUT.canvasMargin - bounds.x
  const dy = LAYOUT.canvasMargin + titleBand - bounds.y
  const shift = (p: Point): Point => ({ x: r3(p.x + dx), y: r3(p.y + dy) })
  for (const n of nodes) n.rect = { x: r3(n.rect.x + dx), y: r3(n.rect.y + dy), w: n.rect.w, h: n.rect.h }
  for (const g of groups) g.rect = { x: r3(g.rect.x + dx), y: r3(g.rect.y + dy), w: g.rect.w, h: g.rect.h }
  for (const e of edges) {
    e.points = e.points.map(shift)
    if (e.labelPos !== undefined) e.labelPos = shift(e.labelPos)
  }
  for (const l of labels) {
    l.x = r3(l.x + dx)
    l.y = r3(l.y + dy)
  }

  const contentW = bounds.w + 2 * LAYOUT.canvasMargin
  const contentH = bounds.h + 2 * LAYOUT.canvasMargin + titleBand
  const requestedW = diagram.canvas.width ?? 0
  const requestedH = diagram.canvas.height ?? 0
  if (requestedW > 0 && requestedW + 0.5 < contentW) {
    diagnostics.push(
      warning('CANVAS_TOO_SMALL', `Requested canvas width ${requestedW} is smaller than the content (${r3(contentW)}).`, undefined, 'Omit canvas to let the renderer size it, or raise the value.'),
    )
  }
  if (requestedH > 0 && requestedH + 0.5 < contentH) {
    diagnostics.push(
      warning('CANVAS_TOO_SMALL', `Requested canvas height ${requestedH} is smaller than the content (${r3(contentH)}).`, undefined, 'Omit canvas to let the renderer size it, or raise the value.'),
    )
  }
  const width = r3(Math.max(requestedW, contentW))
  const height = r3(Math.max(requestedH, contentH))

  return {
    width,
    height,
    ...(title !== undefined ? { title } : {}),
    titleX: LAYOUT.canvasMargin,
    titleY: LAYOUT.canvasMargin + FONT_SIZE.title,
    nodes,
    nodeById,
    groups,
    groupById,
    edges,
    labels,
    layerBands: layerIndexes.map((l) => ({ start: bandStart.get(l) as number, end: (bandStart.get(l) as number) + (bandWidth.get(l) as number) })),
    diagnostics,
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 分层
 * ════════════════════════════════════════════════════════════════════════ */

interface LayerResult {
  layer: Map<string, number>
  backEdges: Set<string>
  unlayerable: boolean
}

/**
 * 最长路径分层 + 先去掉回边。
 *
 * 为什么必须先识别回边：`A→B→C→A` 这种图如果直接做最长路径，Kahn 队列会提前空掉，
 * 剩下的节点拿不到层号，布局只能随便塞。反馈边（feedback）本来就是论文图里的正常
 * 结构，不该让整张图退化。
 *
 * DFS 顺序按**节点声明顺序 + 边的声明顺序**，因此回边的判定是确定的。
 */
function computeLayers(
  diagram: NormalizedDiagram,
  edges: ReadonlyArray<{ id: string; source: string; target: string }>,
): LayerResult {
  const outgoing = new Map<string, Array<{ id: string; target: string }>>()
  for (const node of diagram.nodes) outgoing.set(node.id, [])
  for (const e of edges) {
    if (e.source === e.target) continue
    outgoing.get(e.source)?.push({ id: e.id, target: e.target })
  }

  const color = new Map<string, 0 | 1 | 2>()
  for (const node of diagram.nodes) color.set(node.id, 0)
  const backEdges = new Set<string>()
  const forward = new Map<string, string[]>()

  // 迭代式 DFS：递归在深图上会爆栈，而"论文方法图"恰恰可能很深。
  for (const root of diagram.nodes) {
    if (color.get(root.id) !== 0) continue
    const stack: Array<{ id: string; next: number }> = [{ id: root.id, next: 0 }]
    color.set(root.id, 1)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as { id: string; next: number }
      const children = outgoing.get(frame.id) ?? []
      if (frame.next >= children.length) {
        color.set(frame.id, 2)
        stack.pop()
        continue
      }
      const child = children[frame.next] as { id: string; target: string }
      frame.next += 1
      const c = color.get(child.target) ?? 0
      if (c === 1) {
        backEdges.add(child.id)
        continue
      }
      const list = forward.get(frame.id)
      if (list === undefined) forward.set(frame.id, [child.target])
      else list.push(child.target)
      if (c === 0) {
        color.set(child.target, 1)
        stack.push({ id: child.target, next: 0 })
      }
    }
  }

  // DAG 上的最长路径
  const indegree = new Map<string, number>()
  for (const node of diagram.nodes) indegree.set(node.id, 0)
  for (const targets of forward.values()) for (const t of targets) indegree.set(t, (indegree.get(t) ?? 0) + 1)

  const layer = new Map<string, number>()
  for (const node of diagram.nodes) layer.set(node.id, 0)
  const queue: string[] = diagram.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  let processed = 0
  while (queue.length > 0) {
    const id = queue.shift() as string
    processed += 1
    for (const t of forward.get(id) ?? []) {
      layer.set(t, Math.max(layer.get(t) ?? 0, (layer.get(id) ?? 0) + 1))
      const d = (indegree.get(t) ?? 1) - 1
      indegree.set(t, d)
      if (d === 0) queue.push(t)
    }
  }

  return { layer, backEdges, unlayerable: processed < diagram.nodes.length }
}

/* ════════════════════════════════════════════════════════════════════════
 * 裁到 group 边框
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 把折线的 `start` 或 `end` 端裁到矩形边框上。
 *
 * 用途：边指向一个 group 时，线要停在**块的边框**，而不是画进块里停在某个成员节点上。
 *
 * 做法：先把折线排成"从**外端**走向矩形内部"的顺序（裁 `end` 用原序、裁 `start` 用逆序），
 * 再取**最后一个落在矩形外的点** k —— 点 k+1 就已经在矩形内了，跨越段 k→k+1 与边框
 * 的交点就是裁剪点。
 *
 * ⚠️ 不要写成"从内端往回找第一段相交"：那样遍历方向反了，`segmentEntryPoint` 的
 * 求交会退化成返回内端点本身（线上实测过：箭头停在成员节点上，差了一个 groupPadding）。
 */
export function clipAtRect(points: readonly Point[], rect: Rect, side: 'start' | 'end'): Point[] {
  if (points.length < 2) return [...points]
  const seq = side === 'end' ? [...points] : [...points].reverse()
  let k = -1
  for (let i = 0; i < seq.length; i++) {
    if (!insideRect(seq[i] as Point, rect)) k = i
  }
  if (k < 0 || k + 1 >= seq.length) return [...points]
  const hit = segmentEntryPoint(seq[k] as Point, seq[k + 1] as Point, rect)
  if (hit === null) return [...points]
  const trimmedSeq = [...seq.slice(0, k + 1), hit]
  return side === 'end' ? trimmedSeq : trimmedSeq.reverse()
}

function insideRect(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < rectRight(r) && p.y > r.y && p.y < rectBottom(r)
}

/** 线段 a→b 首次进入矩形内部的点；不进入返回 null。 */
function segmentEntryPoint(a: Point, b: Point, r: Rect): Point | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  // 轴向线段（正交走线只有这两种）：直接解交点
  if (Math.abs(dy) < 0.001) {
    const y = a.y
    if (y <= r.y || y >= rectBottom(r)) return null
    const lo = Math.min(a.x, b.x)
    const hi = Math.max(a.x, b.x)
    if (hi <= r.x || lo >= rectRight(r)) return null
    const x = dx > 0 ? Math.max(lo, r.x) : Math.min(hi, rectRight(r))
    return { x: r3(x), y: r3(y) }
  }
  if (Math.abs(dx) < 0.001) {
    const x = a.x
    if (x <= r.x || x >= rectRight(r)) return null
    const lo = Math.min(a.y, b.y)
    const hi = Math.max(a.y, b.y)
    if (hi <= r.y || lo >= rectBottom(r)) return null
    const y = dy > 0 ? Math.max(lo, r.y) : Math.min(hi, rectBottom(r))
    return { x: r3(x), y: r3(y) }
  }
  return null
}

