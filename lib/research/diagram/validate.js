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
import { layoutAny } from './engine.js';
import { normalizeIr } from './normalize.js';
import { LAYOUT, FONT_SIZE, } from './styles.js';
import { collinearOverlap, measureText, rectsOverlap, polylineIntersectsRect, r3, rectBottom, rectRight, segmentDistance, segmentsIntersect } from './geometry.js';
import { error, warning, } from './types.js';
/** 校验一份任意 JSON 的 Diagram IR。 */
export function inspectDiagram(raw, options = {}) {
    const normalized = normalizeIr(raw);
    const diagnostics = [...normalized.diagnostics];
    if (normalized.diagram === null) {
        return finish(null, null, diagnostics);
    }
    const diagram = normalized.diagram;
    const layout = layoutAny(diagram, options);
    diagnostics.push(...layout.diagnostics);
    diagnostics.push(...graphChecks(diagram));
    diagnostics.push(...visualChecks(diagram, layout, options));
    return finish(diagram, layout, diagnostics);
}
/** 校验一份**已经规范化**的 IR（render 路径复用，避免重复解析）。 */
export function inspectNormalized(diagram, options = {}) {
    const layout = layoutAny(diagram, options);
    const diagnostics = [...layout.diagnostics, ...graphChecks(diagram), ...visualChecks(diagram, layout, options)];
    return finish(diagram, layout, diagnostics);
}
function finish(diagram, layout, diagnostics) {
    // 顺序稳定：先按严重度，再按出现顺序（诊断顺序本身就是确定性的一部分，
    // 否则同一份 IR 两次会得到顺序不同的报告，diff 起来很难看）。
    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warning');
    return { report: { valid: errors.length === 0, errors, warnings }, diagram, layout };
}
/* ════════════════════════════════════════════════════════════════════════
 * 图结构
 * ════════════════════════════════════════════════════════════════════════ */
function graphChecks(diagram) {
    const out = [];
    const touched = new Set();
    for (const e of diagram.edges) {
        touched.add(e.source);
        touched.add(e.target);
    }
    for (const n of diagram.nodes) {
        if (touched.has(n.id))
            continue;
        if (n.group !== undefined)
            continue;
        out.push(warning('ISOLATED_NODE', `Node "${n.id}" has no edge and no group — nothing connects it to the figure.`, n.id, 'Connect it, put it in a group, or delete it: an unconnected box reads as a mistake.'));
    }
    // 溯源：**整张图一个 evidence 都没有**才提示，不逐节点提示 ——
    // dev-note §28 说第一阶段不要求 evidence，逐节点报警只会变成噪声，Agent 会学会忽略它。
    // 绑定论文资产（`refs`）是比 `evidence` 更强的溯源：它直接指向那条 claim / evidence。
    if (diagram.nodes.length > 0 && diagram.nodes.every((n) => n.evidence.length === 0 && (n.refs ?? []).length === 0)) {
        out.push(warning('UNTRACED_NODE', 'No node records where its content comes from.', undefined, 'Add `evidence: [{"source": "section-3.2"}]` to nodes you took from the manuscript, so the figure can be traced back later.'));
    }
    // 同一标签的两个节点：读者分不清它们是不是同一个东西。
    const byLabel = new Map();
    for (const n of diagram.nodes) {
        const key = n.label.trim().toLowerCase().replace(/\s+/g, ' ');
        const list = byLabel.get(key);
        if (list === undefined)
            byLabel.set(key, [n.id]);
        else
            list.push(n.id);
    }
    for (const [label, ids] of byLabel) {
        if (ids.length < 2)
            continue;
        out.push(warning('DUPLICATE_NODE_LABEL', `${ids.length} nodes share the label "${label}".`, ids.join(', '), 'If they are the same thing, merge them; if not, give them distinct names.'));
    }
    for (const n of diagram.nodes) {
        const vague = vagueReason(n.label);
        if (vague !== null) {
            out.push(warning('VAGUE_NODE_LABEL', `Node "${n.id}" is labelled "${n.label}", which names no module the paper defines (${vague}).`, n.id, 'Every node must trace to the method, an equation, a section or the user description — remove it or name it as the text does.'));
        }
    }
    return out;
}
/** 空泛标签检测（dev-note §27 那条"不要自动加 AI Module / Advanced Processing"）。 */
function vagueReason(label) {
    const t = label.trim().toLowerCase().replace(/\s+/g, ' ');
    const exact = new Set([
        'ai', 'ai module', 'ml module', 'module', 'modules', 'component', 'components',
        'block', 'blocks', 'processing', 'stage', 'stages', 'step', 'steps', 'layer', 'layers',
        'part', 'parts', 'advanced processing', 'optimization', 'optimisation', 'optimizer',
        'smart decision', 'smart module', 'misc', 'miscellaneous', 'other', 'others', 'etc',
        'tbd', 'todo', 'placeholder', 'n/a', 'thing', 'stuff', 'core module', 'main module',
    ]);
    if (exact.has(t))
        return 'generic placeholder wording';
    if (/^(module|component|block|stage|step|part|layer)\s*[-#]?\s*\d+$/.test(t))
        return 'numbered placeholder';
    if (/^[a-z]\d*$/.test(t))
        return 'single-letter label';
    return null;
}
/* ════════════════════════════════════════════════════════════════════════
 * 视觉
 * ════════════════════════════════════════════════════════════════════════ */
function visualChecks(diagram, layout, options = {}) {
    const out = [];
    /* ── 节点重叠（布局保证不重叠；这是"布局实现坏了"的安全网）───────── */
    const rects = layout.nodes.map((n) => ({ id: n.id, rect: n.rect }));
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            if (overlaps(a.rect, b.rect)) {
                out.push(error('NODE_OVERLAP', `Nodes "${a.id}" and "${b.id}" overlap.`, a.id, 'This indicates a layout defect; reduce the number of nodes per layer or split the figure.'));
            }
        }
    }
    /* ── 线穿过盒子 ─────────────────────────────────────────────────── */
    for (const edge of layout.edges) {
        if (!edge.crossesNode)
            continue;
        const hit = layout.nodes.find((n) => n.id !== edge.source && n.id !== edge.target && polylineIntersectsRect(edge.points, n.rect, 1.5));
        out.push(error('EDGE_CROSSES_NODE', `Edge "${edge.id}" (${edge.source} → ${edge.target}) crosses node${hit !== undefined ? ` "${hit.id}"` : ''}.`, edge.id, 'Repair structurally: add the intermediate node the flow actually passes through, reorder the layer (declaration order controls it), or route through a group endpoint.', hit !== undefined ? `crosses node ${hit.id} at ${JSON.stringify({ x: Math.round(hit.rect.x), y: Math.round(hit.rect.y), w: Math.round(hit.rect.w), h: Math.round(hit.rect.h) })}` : undefined));
    }
    /* ── 端点堆积：同一节点同一侧的多条边共用一个锚点 ─────────────────
     * 这是"连线看起来不对"最常见的一类：3 条边从同一个点出发，画出来是一根线再分叉。
     * 渲染器已经会确定性分散端点，这里保留一条**可复核**的判据：分散失效时必须报出来。
     */
    const piledAt = (pick, key) => {
        const byNode = new Map();
        for (const e of layout.edges) {
            const node = key(e);
            const arr = byNode.get(node);
            const item = { id: e.id, p: pick(e) };
            if (arr === undefined)
                byNode.set(node, [item]);
            else
                arr.push(item);
        }
        for (const [node, arr] of byNode) {
            if (arr.length < 2)
                continue;
            const uniq = new Map();
            for (const it of arr) {
                const k = `${it.p.x.toFixed(1)},${it.p.y.toFixed(1)}`;
                uniq.set(k, [...(uniq.get(k) ?? []), it.id]);
            }
            for (const [at, ids] of uniq) {
                if (ids.length < 2)
                    continue;
                out.push(error('EDGE_ENDPOINT_PILED', `${ids.length} edges share one anchor at node "${node}", so they are drawn as a single line that splits.`, node, 'The renderer spreads shared endpoints deterministically; if this fires, the layout needs the edges separated (split the figure, or send some through a group endpoint).', `${ids.join(', ')} all at (${at})`));
            }
        }
    };
    piledAt((e) => e.points[0], (e) => e.declaredSource);
    piledAt((e) => e.points[e.points.length - 1], (e) => e.declaredTarget);
    /* ── 线穿过**容器框**：容器是矩形，不是节点，容易被漏掉 ───────────── */
    const ancestorsOf = (nodeId) => {
        const out = new Set();
        let gid = layout.nodeById.get(nodeId)?.id !== undefined ? diagram.nodes.find((n) => n.id === nodeId)?.group : undefined;
        while (gid !== undefined && !out.has(gid)) {
            out.add(gid);
            gid = diagram.groups.find((g) => g.id === gid)?.parent;
        }
        return out;
    };
    for (const edge of layout.edges) {
        const allowed = new Set([...ancestorsOf(edge.source), ...ancestorsOf(edge.target)]);
        if (diagram.groups.some((g) => g.id === edge.declaredSource))
            allowed.add(edge.declaredSource);
        if (diagram.groups.some((g) => g.id === edge.declaredTarget))
            allowed.add(edge.declaredTarget);
        for (const g of layout.groups) {
            if (allowed.has(g.id))
                continue;
            if (!polylineIntersectsRect(edge.points, g.rect, 1))
                continue;
            out.push(error('EDGE_CROSSES_CONTAINER', `Edge "${edge.id}" (${edge.declaredSource} → ${edge.declaredTarget}) runs through container "${g.id}", which neither endpoint belongs to.`, edge.id, 'Move the container out of the way (regroup or carry the edge through a group endpoint), or accept a detour — the renderer treats foreign containers as obstacles.', `container ${g.id} at ${JSON.stringify({ x: Math.round(g.rect.x), y: Math.round(g.rect.y), w: Math.round(g.rect.w), h: Math.round(g.rect.h) })}`));
        }
    }
    /* ── 引用必须真的存在：图上印的论点编号不能是死的 ─────────────────
     * 图承载的"论文观点"就是这些编号。印一个不存在的 `C7`，读者按编号回正文会找不到 ——
     * 这比不标更糟。`knownRefs` 由**调用方**提供（工具层从工作区的 claim / evidence 里读），
     * 内核本身保持纯净：没有 `knownRefs` 就只做形状检查（normalize 的 BAD_REF_SHAPE）。
     */
    if (options.knownRefs !== undefined) {
        const known = options.knownRefs;
        const sites = [
            ...diagram.nodes.map((n) => ({ owner: `node "${n.id}"`, kind: 'node', refs: n.refs ?? [] })),
            ...diagram.groups.map((g) => ({ owner: `group "${g.id}"`, kind: 'group', refs: g.refs ?? [] })),
            ...diagram.edges.map((e) => ({ owner: `edge "${e.id}"`, kind: 'edge', refs: e.refs ?? [] })),
            ...diagram.cards.map((c) => ({ owner: `card "${c.id}"`, kind: 'card', refs: c.refs ?? [] })),
        ];
        const sample = [...known].slice(0, 6).join(', ');
        for (const site of sites) {
            for (const ref of site.refs) {
                if (known.has(ref))
                    continue;
                out.push(error('UNKNOWN_REF', `${site.owner} refers to "${ref}", which does not exist in the research record.`, site.owner.split('"')[1], `Use a recorded id (known: ${sample}${known.size > 6 ? ', …' : ''}), or record the claim / evidence before putting it on a figure.`, `ref "${ref}" not in ${known.size} known ids`));
            }
        }
    }
    /* ── 标签压线 / 压盒子：论文图最常见的低级错误 ───────────────────── */
    {
        const labelRects = [];
        for (const edge of layout.edges) {
            if (edge.label === undefined || edge.labelPos === undefined)
                continue;
            const w = measureText(edge.label, FONT_SIZE.edgeLabel);
            const x0 = edge.labelAnchor === 'middle' ? edge.labelPos.x - w / 2 : edge.labelPos.x;
            labelRects.push({
                id: edge.id,
                rect: {
                    x: x0 - 3,
                    y: edge.labelPos.y - FONT_SIZE.edgeLabel,
                    w: w + 6,
                    h: FONT_SIZE.edgeLabel * 1.3,
                },
            });
        }
        // 标签压节点 / 压容器
        for (const lr of labelRects) {
            for (const n of layout.nodes) {
                if (n.id === lr.id)
                    continue;
                if (rectsOverlap(lr.rect, n.rect, 1)) {
                    out.push(warning('LABEL_OVERLAP', `Edge label "${lr.id}" overlaps node "${n.id}".`, lr.id, 'Shorten the label, or let the layout breathe (raise `layer_gap`) so the label lands in open space.', `label rect ${JSON.stringify({ x: Math.round(lr.rect.x), y: Math.round(lr.rect.y), w: Math.round(lr.rect.w) })} ∩ node "${n.id}"`));
                    break;
                }
            }
            for (const g of layout.groups) {
                const isOwn = diagram.groups.find((x) => x.id === g.id)?.members.length === 0;
                if (isOwn)
                    continue;
                // 容器内部允许有标签（那是它的成员的通道），只报压到容器**标签带**的情况
                const band = { x: g.rect.x, y: g.rect.y, w: g.rect.w, h: LAYOUT.groupLabelBand };
                if (rectsOverlap(lr.rect, band, 1)) {
                    out.push(warning('LABEL_OVERLAP', `Edge label "${lr.id}" sits on the label band of container "${g.id}".`, lr.id, 'Move the container label or shorten the edge label.', `label ∩ container "${g.id}" label band`));
                }
            }
        }
        // 标签互相压
        for (let i = 0; i < labelRects.length; i++) {
            for (let j = i + 1; j < labelRects.length; j++) {
                const a = labelRects[i];
                const b = labelRects[j];
                if (!rectsOverlap(a.rect, b.rect, 1))
                    continue;
                out.push(warning('LABEL_OVERLAP', `Edge labels "${a.id}" and "${b.id}" overlap each other, so neither can be read.`, a.id, 'Shorten one label, or separate the two edges structurally.', `"${a.id}" ∩ "${b.id}"`));
            }
        }
    }
    /* ── 边与边共线重叠：两条线叠在一起，读者只看到一条 ─────────────── */
    {
        const segs = [];
        for (const e of layout.edges) {
            for (let i = 0; i + 1 < e.points.length; i++) {
                segs.push({ id: e.id, a: e.points[i], b: e.points[i + 1] });
            }
        }
        // 短拐角（节点贴边处的几单位重合）不报：报出来只会淹没有用的信号。
        const MIN_REPORTED_OVERLAP = 12;
        for (let i = 0; i < segs.length; i++) {
            for (let j = i + 1; j < segs.length; j++) {
                const p = segs[i];
                const q = segs[j];
                if (p.id === q.id)
                    continue;
                const ov = collinearOverlap(p.a, p.b, q.a, q.b);
                if (ov < MIN_REPORTED_OVERLAP)
                    continue;
                out.push(warning('EDGE_OVERLAP', `Edges "${p.id}" and "${q.id}" run on top of each other, so they read as one line.`, p.id, 'Give one of them a different lane: reorder the nodes so the targets are not adjacent, or route one through a group endpoint.', `${ov.toFixed(1)} units shared between ${p.id} and ${q.id}`));
            }
        }
    }
    /* ── 线间最小间距（`layout.edge_gap`）：近平行线贴太近同样读不出来 ──────
     * `EDGE_OVERLAP` 只抓共线叠置；两条线既不共线也不重叠、却只隔 2–3 个单位时，
     * 打印出来是一团。这条规则按 IR 声明的阈值把它们报出来。
     * 共享端点（同一节点边的进/出）不计 —— 它们本来就要在节点处汇合。
     */
    {
        const edgeGap = diagram.edgeGap ?? 0;
        if (edgeGap > 0) {
            const segs = [];
            for (const e of layout.edges) {
                for (let i = 0; i + 1 < e.points.length; i++) {
                    segs.push({ id: e.id, a: e.points[i], b: e.points[i + 1] });
                }
            }
            const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
            let reported = 0;
            for (let i = 0; i < segs.length && reported < 8; i++) {
                for (let j = i + 1; j < segs.length && reported < 8; j++) {
                    const p = segs[i];
                    const q = segs[j];
                    if (p.id === q.id)
                        continue;
                    const sharing = Math.min(dist(p.a, q.a), dist(p.a, q.b), dist(p.b, q.a), dist(p.b, q.b));
                    if (sharing <= 3)
                        continue;
                    // 交叉 ≠ 并排过近：两条线在一点相交是可接受的（甚至不可避免），
                    // 这条规则要抓的是"平行贴在一起、读者分不出是两条线"。
                    if (segmentsIntersect(p.a, p.b, q.a, q.b))
                        continue;
                    const d = segmentDistance(p.a, p.b, q.a, q.b);
                    if (d >= edgeGap)
                        continue;
                    reported += 1;
                    out.push(warning('EDGE_TOO_CLOSE', `Edges "${p.id}" and "${q.id}" pass within ${d.toFixed(1)} units, below layout.edge_gap = ${edgeGap}.`, p.id, 'Increase layer_gap/node spacing so the routes have room, or reorder the nodes that share a corridor.', `${d.toFixed(1)} < ${edgeGap}`));
                }
            }
        }
    }
    /* ── 文字溢出 ───────────────────────────────────────────────────── */
    for (const node of layout.nodes) {
        const inner = node.rect.w - 2 * LAYOUT.nodePaddingX;
        const worst = Math.max(...node.labelLines.map((l) => measureText(l, FONT_SIZE.nodeLabel)), 0);
        if (worst > inner + 0.5) {
            out.push(error('TEXT_OVERFLOW', `Label of node "${node.id}" is wider than its box (${r3(worst)} > ${r3(inner)}).`, node.id, 'Shorten the label; a node box never grows past the label width limit.'));
        }
        for (const line of node.labelLines) {
            if (measureText(line, FONT_SIZE.nodeLabel) > LAYOUT.nodeMaxLabelWidth + 0.5) {
                out.push(warning('LONG_LABEL', `A line of node "${node.id}" exceeds the label width limit.`, node.id, 'Two or three short lines read better than one long one.'));
            }
        }
        if (node.labelLines.length > 3) {
            out.push(warning('LONG_LABEL', `Label of node "${node.id}" wraps to ${node.labelLines.length} lines.`, node.id, 'Move the detail to the caption or the text; a figure is not a paragraph.'));
        }
        const visual = [...node.label].length;
        if (visual > 60) {
            out.push(warning('LONG_LABEL', `Label of node "${node.id}" has ${visual} characters.`, node.id, 'Aim for two or three words per node.'));
        }
    }
    /* ── group 容器压到别的节点 ─────────────────────────────────────── */
    for (const group of layout.groups) {
        const members = memberNodeIds(diagram, group.id);
        for (const node of layout.nodes) {
            if (members.has(node.id))
                continue;
            if (overlaps(group.rect, node.rect)) {
                out.push(warning('GROUP_OVERLAPS_FOREIGN_NODE', `Group "${group.id}" encloses node "${node.id}", which is not one of its members.`, group.id, 'Add the node to the group, or move it out by reordering the layer.'));
            }
        }
        const labelWidth = measureText(group.label, FONT_SIZE.groupLabel);
        if (labelWidth > group.rect.w - 16) {
            out.push(warning('TEXT_OVERFLOW', `Group label "${group.label}" is wider than the group box.`, group.id, 'Shorten the group label or add more members to the group.'));
        }
    }
    return out;
}
function overlaps(a, b, slack = 0.5) {
    return a.x + slack < rectRight(b) && b.x + slack < rectRight(a) && a.y + slack < rectBottom(b) && b.y + slack < rectBottom(a);
}
/** 一个 group 递归包住的全部节点 id。 */
function memberNodeIds(diagram, groupId) {
    const groups = new Map(diagram.groups.map((g) => [g.id, g]));
    const nodes = new Set(diagram.nodes.map((n) => n.id));
    const out = new Set();
    const seen = new Set();
    const walk = (id) => {
        if (seen.has(id))
            return;
        seen.add(id);
        const g = groups.get(id);
        if (g === undefined)
            return;
        for (const m of g.members) {
            if (nodes.has(m))
                out.add(m);
            else
                walk(m);
        }
    };
    walk(groupId);
    return out;
}
//# sourceMappingURL=validate.js.map