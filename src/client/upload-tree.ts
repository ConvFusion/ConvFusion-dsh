/**
 * ConvFusion 2.0 — 上传清单的**目录树**（纯逻辑，无 React）
 *
 * ## 为什么需要它
 *
 * 发布 / 回传对话框里的「展开」原本是**一层平铺的文件列表**（一个分类几百项）。
 * 用户 2026-10 的诉求：
 *
 * > 能做成树吗？这样我们可以去掉或选择某一个文件夹，而不需要一个个地选文件里的大量文件。
 *
 * 于是把 `relPath` 前缀相同的文件收成一层层目录，**目录行自带三态复选框**
 * （全选 / 部分 / 未选），点一下就是"整枝加入 / 整枝移出"。
 *
 * ## 与宿主数据的关系（别在这里做判定）
 *
 * - 这里**只按路径分组**，不做"该不该传"的判断 —— 分类（`recommended` / `optional` /
 *   `excluded`）已经由宿主 `upload-selection.ts` 算好，本模块只负责把**同一分类里**
 *   的文件排成树。
 * - `relPath` 允许以 `/` 结尾：那是宿主写的**跳过占位项**（"整个目录被当作机器产物跳过"），
 *   它不代表可上传文件 —— 这类节点标记为 `placeholder`，**不可勾选**（勾了也没有文件可传）。
 *
 * ## 排序规则（确定，便于自检与阅读）
 *
 * 同一层内：**目录在前、文件在后**；各自按名字小写比较（`localeCompare` 的 en 规则，
 * 避免不同机器 locale 让顺序漂移）。`a/` 与 `a` 不会同时出现（前者必是占位项）。
 */

/** 上传清单里的一项（与宿主 `UploadCategory.files` 同形）。 */
export interface UploadPlanEntry {
  relPath: string
  size: number
}

/** 树节点：目录或文件。 */
export interface UploadTreeNode {
  kind: 'dir' | 'file'
  /** 这一层的显示名（最后一段；目录不带尾部 `/`）。 */
  name: string
  /** 从研究根起算的完整相对路径（目录不带尾部 `/`）。 */
  path: string
  /** 目录：整枝的文件数（含更深层）；文件：1。占位目录为 0。 */
  count: number
  /** 目录：整枝文件体积之和；文件：自身体积。 */
  bytes: number
  /**
   * 目录是否为宿主写的**跳过占位项**（`relPath` 以 `/` 结尾）。
   * 占位目录没有可上传文件 ⇒ 不给复选框。
   */
  placeholder: boolean
  /** 目录的子节点（文件恒为空数组）。 */
  children: UploadTreeNode[]
}

/** 名字比较：小写、en 规则，跨机器稳定。 */
function compareName(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase(), 'en')
}

/** 树里全部**可上传文件**的相对路径（占位目录不计）。 */
export function treeFilePaths(nodes: readonly UploadTreeNode[]): string[] {
  const out: string[] = []
  const walk = (list: readonly UploadTreeNode[]): void => {
    for (const n of list) {
      if (n.kind === 'file') out.push(n.path)
      else walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** 目录（或节点）下全部可上传文件的相对路径 —— 目录复选框用它做"整枝切换"。 */
export function nodeFilePaths(node: UploadTreeNode): string[] {
  if (node.kind === 'file') return [node.path]
  return treeFilePaths(node.children)
}

/**
 * 目录的三态：`all` 全选 / `none` 全不选 / `some` 部分选中。
 *
 * 占位目录恒为 `none`（它没有文件可传，界面也不给复选框）。
 */
export function folderState(
  node: UploadTreeNode,
  selection: ReadonlySet<string>,
): 'all' | 'some' | 'none' {
  const files = nodeFilePaths(node)
  if (files.length === 0) return 'none'
  let hit = 0
  for (const f of files) if (selection.has(f)) hit += 1
  if (hit === 0) return 'none'
  return hit === files.length ? 'all' : 'some'
}

/** 排序（就地，返回同一个数组便于链式使用）。 */
function sortNodes(nodes: UploadTreeNode[]): UploadTreeNode[] {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return compareName(a.name, b.name)
  })
  for (const n of nodes) if (n.kind === 'dir') sortNodes(n.children)
  return nodes
}

/**
 * 去掉**唯一根目录**造成的空转。
 *
 * 实际数据里，一个分类的文件几乎总在同一顶层目录下（`plans/…`、`papers/…`、`experiments/…`、
 * `research/…`），于是树的第一层只有一个目录节点 —— 用户点开「展开」只看到它，还要再点一次。
 * 这条规则把这种"单根"一路剥掉（`research/literature/fulltext/` 也一样剥），
 * 返回剥掉的**前缀**（界面上显示成一行灰色面包屑，避免用户不知道自己在看哪一层）。
 *
 * 停止条件：
 * - 当前层不是"恰好一个目录"；
 * - 那个目录是**跳过占位项**（它没有子节点，剥下去是空的）；
 * - 那个目录没有子节点。
 *
 * 注意：剥掉的层级**仍然可以通过分类复选框整选**（两者等价），所以不会丢能力。
 *
 * @param nodes - {@link buildUploadTree} 的根层
 * @returns 剥后的根层节点 + 被剥掉的前缀（没有剥时为 `''`）
 */
export function flattenSingleRoot(nodes: readonly UploadTreeNode[]): {
  nodes: UploadTreeNode[]
  prefix: string
} {
  let current: readonly UploadTreeNode[] = nodes
  let prefix = ''
  while (current.length === 1) {
    const only = current[0]
    if (only === undefined || only.kind !== 'dir' || only.placeholder) break
    if (only.children.length === 0) break
    prefix = only.path
    current = only.children
  }
  return { nodes: current as UploadTreeNode[], prefix }
}

/**
 * 把一层平铺的清单排成目录树。
 *
 * @param files - 同一分类里的条目（可含 `relPath` 以 `/` 结尾的跳过占位项）
 * @returns 树的根层**子节点**（调用方直接渲染这一层，不要自己造一个假的根目录 ——
 *          否则用户会看到一个多出来的、与研究根同名的空壳）
 */
export function buildUploadTree(files: readonly UploadPlanEntry[]): UploadTreeNode[] {
  const roots: UploadTreeNode[] = []
  /** `path → 目录节点`（跨分支复用，保证同名目录只出现一次）。 */
  const dirs = new Map<string, UploadTreeNode>()

  const dirOf = (path: string, placeholder = false): UploadTreeNode => {
    const existing = dirs.get(path)
    if (existing) {
      if (placeholder) existing.placeholder = true
      return existing
    }
    const cut = path.lastIndexOf('/')
    const name = cut < 0 ? path : path.slice(cut + 1)
    const node: UploadTreeNode = {
      kind: 'dir',
      name,
      path,
      count: 0,
      bytes: 0,
      placeholder,
      children: [],
    }
    dirs.set(path, node)
    if (cut < 0) roots.push(node)
    else dirOf(path.slice(0, cut)).children.push(node)
    return node
  }

  for (const f of files) {
    const raw = String(f.relPath ?? '').trim()
    if (raw === '') continue
    const isPlaceholder = raw.endsWith('/')
    const path = isPlaceholder ? raw.replace(/\/+$/, '') : raw
    if (path === '') continue
    if (isPlaceholder) {
      dirOf(path, true)
      continue
    }
    const cut = path.lastIndexOf('/')
    const name = cut < 0 ? path : path.slice(cut + 1)
    const parent = cut < 0 ? undefined : dirOf(path.slice(0, cut))
    const node: UploadTreeNode = {
      kind: 'file',
      name,
      path,
      count: 1,
      bytes: Number(f.size) || 0,
      placeholder: false,
      children: [],
    }
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
  }

  // 自底向上累计 count/bytes（排好序再算，顺序无关但一次遍历更省事）
  const accumulate = (node: UploadTreeNode): void => {
    if (node.kind === 'file' || node.placeholder) return
    let count = 0
    let bytes = 0
    for (const child of node.children) {
      accumulate(child)
      count += child.count
      bytes += child.bytes
    }
    node.count = count
    node.bytes = bytes
  }
  for (const node of roots) accumulate(node)

  // 防御：占位项与真实文件理论上不会共存（占位 = 整枝被跳过），但真出现了就以真实文件为准
  // —— 否则那个目录会既没有复选框、又挂着可选文件。
  const clearPlaceholder = (node: UploadTreeNode): void => {
    if (node.kind !== 'dir') return
    if (node.count > 0) node.placeholder = false
    for (const child of node.children) clearPlaceholder(child)
  }
  for (const node of roots) clearPlaceholder(node)

  return sortNodes(roots)
}
