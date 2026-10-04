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
import { LAYOUT, FONT_SIZE } from './styles.js';
import { measureText, polylineIntersectsRect, r3, rectBottom, rectsOverlap, rectRight, simplifyPolyline, textBlockHeight, unionRects, wrapText, } from './geometry.js';
import { leafNodesOf, } from './normalize.js';
import { warning } from './types.js';
export function measureNodeBox(node, showDescriptions, maxTextWidth = LAYOUT.nodeMaxLabelWidth) {
    const labelLines = wrapText(node.label, maxTextWidth, FONT_SIZE.nodeLabel);
    const descriptionLines = showDescriptions && node.description ? wrapText(node.description, maxTextWidth, FONT_SIZE.nodeDescription) : [];
    /**
     * `refs` 是**论点锚点**（这条图元承载哪条 claim / evidence），不是说明文字，
     * 所以它**不随 `show_descriptions` 开关**：开关管的是"要不要展开细节"，
     * 而"这个盒子对应论文里哪条主张"是配图存在的理由，不能默认藏起来。
     */
    const refText = node.refs !== undefined && node.refs.length > 0 ? `[${node.refs.join(' · ')}]` : undefined;
    const refLines = refText !== undefined ? wrapText(refText, maxTextWidth, FONT_SIZE.nodeRef) : [];
    const widest = Math.max(...labelLines.map((l) => measureText(l, FONT_SIZE.nodeLabel)), ...descriptionLines.map((l) => measureText(l, FONT_SIZE.nodeDescription)), ...refLines.map((l) => measureText(l, FONT_SIZE.nodeRef)), 0);
    const w = Math.max(LAYOUT.nodeMinWidth, Math.min(maxTextWidth, widest) + 2 * LAYOUT.nodePaddingX);
    const labelH = textBlockHeight(labelLines.length, FONT_SIZE.nodeLabel, LAYOUT.lineHeightRatio);
    const descH = textBlockHeight(descriptionLines.length, FONT_SIZE.nodeDescription, LAYOUT.lineHeightRatio);
    const refH = textBlockHeight(refLines.length, FONT_SIZE.nodeRef, LAYOUT.lineHeightRatio);
    const gap = descriptionLines.length > 0 ? 4 : 0;
    const refGap = refLines.length > 0 ? 3 : 0;
    const h = 2 * LAYOUT.nodePaddingY + labelH + gap + descH + refGap + refH;
    return {
        w: r3(w),
        h: r3(h),
        labelLines,
        descriptionLines,
        ...(refText !== undefined ? { refText } : {}),
        refLines,
    };
}
/**
 * 卡片排成**一行**（时序图用）。
 *
 * 为什么时序图不用右侧竖栏：时序图天然是"宽而扁"的（参与者成列、消息成行），
 * 右侧再挂一条 250 单位的竖栏会把画布撑到近千单位宽，缩进栏宽后字只有 6~7pt。
 * 改成排在下方的**一行**，宽度不动、只加高度，缩进跨栏正好落在可读区间。
 * 同一件事在两种图型里要有不同的做法 —— 这就是"按模式分契约"。
 */
export function buildCardRow(cards, flowBounds) {
    const out = [];
    if (cards.length === 0)
        return out;
    const textW = LAYOUT.cardWidth - 2 * LAYOUT.cardPaddingX;
    const heights = [];
    const prepared = cards.map((card) => {
        const titleLines = wrapText(card.title, textW, FONT_SIZE.cardTitle);
        const bodyLines = card.body !== undefined ? wrapText(card.body, textW, FONT_SIZE.cardBody) : [];
        const refText = card.refs !== undefined && card.refs.length > 0 ? `[${card.refs.join(' · ')}]` : undefined;
        const titleH = textBlockHeight(titleLines.length, FONT_SIZE.cardTitle, LAYOUT.lineHeightRatio);
        const bodyH = textBlockHeight(bodyLines.length, FONT_SIZE.cardBody, LAYOUT.lineHeightRatio);
        const refH = refText !== undefined ? textBlockHeight(1, FONT_SIZE.nodeRef, LAYOUT.lineHeightRatio) : 0;
        const h = 2 * LAYOUT.cardPaddingY + titleH + (bodyLines.length > 0 ? 4 + bodyH : 0) + (refText !== undefined ? 4 + refH : 0);
        heights.push(h);
        return { card, titleLines, bodyLines, refText, h };
    });
    const rowH = Math.max(...heights);
    const y = flowBounds.y + flowBounds.h + LAYOUT.cardPanelGap;
    let x = flowBounds.x;
    for (const item of prepared) {
        out.push({
            id: item.card.id,
            titleLines: item.titleLines,
            bodyLines: item.bodyLines,
            ...(item.refText !== undefined ? { refText: item.refText } : {}),
            rect: { x: r3(x), y: r3(y), w: LAYOUT.cardWidth, h: r3(rowH) },
        });
        x += LAYOUT.cardWidth + LAYOUT.cardGap;
    }
    return out;
}
/**
 * 卡片栏：整块排在**给定流程边界之外**的右侧。
 *
 * 两套引擎共用（分层 / 时序）：卡片永远不参与走线，所以它在哪种图里都不会制造连线问题。
 */
export function buildCardPanel(cards, flowBounds) {
    const out = [];
    if (cards.length === 0)
        return out;
    const panelX = flowBounds.x + flowBounds.w + LAYOUT.cardPanelGap;
    const textW = LAYOUT.cardWidth - 2 * LAYOUT.cardPaddingX;
    let cursor = flowBounds.y;
    for (const card of cards) {
        const titleLines = wrapText(card.title, textW, FONT_SIZE.cardTitle);
        const bodyLines = card.body !== undefined ? wrapText(card.body, textW, FONT_SIZE.cardBody) : [];
        const refText = card.refs !== undefined && card.refs.length > 0 ? `[${card.refs.join(' · ')}]` : undefined;
        const titleH = textBlockHeight(titleLines.length, FONT_SIZE.cardTitle, LAYOUT.lineHeightRatio);
        const bodyH = textBlockHeight(bodyLines.length, FONT_SIZE.cardBody, LAYOUT.lineHeightRatio);
        const refH = refText !== undefined ? textBlockHeight(1, FONT_SIZE.nodeRef, LAYOUT.lineHeightRatio) : 0;
        const h = 2 * LAYOUT.cardPaddingY + titleH + (bodyLines.length > 0 ? 4 + bodyH : 0) + (refText !== undefined ? 4 + refH : 0);
        out.push({
            id: card.id,
            titleLines,
            bodyLines,
            ...(refText !== undefined ? { refText } : {}),
            rect: { x: r3(panelX), y: r3(cursor), w: LAYOUT.cardWidth, h: r3(h) },
        });
        cursor += h + LAYOUT.cardGap;
    }
    return out;
}
/* ════════════════════════════════════════════════════════════════════════
 * 主入口
 * ════════════════════════════════════════════════════════════════════════ */
/** 把规范化 IR 布局成几何。纯函数：不读文件、不用随机数、不看时钟。 */
export function layoutDiagram(diagram, options = {}) {
    const diagnostics = [];
    const horizontal = diagram.direction === 'LR' || diagram.direction === 'RL';
    // 显式渲染参数优先；IR 里声明的（`show_descriptions`）次之 —— 后者保证"重渲染得到同一张图"。
    const showDescriptions = options.showDescriptions ?? diagram.showDescriptions === true;
    /**
     * 层间距：IR 可覆盖（`layout.layer_gap`）。
     *
     * 统一配置（dev-note §20）是"默认值集中在一处"，不是"所有图必须一样松"：
     * 内容多、链条长的图需要密排才能在论文里保持可读，密排与否属于**这张图**的决定。
     */
    const layerGap = diagram.layerGap ?? LAYOUT.layerGap;
    /** 顶层 group 并排排布（见 `DiagramLayoutSpec.arrange`）。 */
    const arrange = diagram.arrange ?? 'auto';
    /** 并排 cluster 之间的水平间距。 */
    const groupGap = diagram.groupGap ?? 110;
    /** 线间最小间距；0 = 关闭（默认，保持旧版式完全不变）。 */
    const edgeGap = diagram.edgeGap ?? 0;
    let laneCorridor = null;
    /**
     * 并排泳道下走廊/总线的**分道步长**：必须明显大于 `edge_gap`，否则"相邻两条道"
     * 的距离正好等于阈值、校验器仍会判为过近（实测 8 单位步长 + `edge_gap = 8` 触发 8 条警告）。
     */
    const routeStep = edgeGap > 0 ? Math.max(4, edgeGap * 1.25) : 6;
    /* ── 1. 节点尺寸（由文字决定，不由 Agent 决定）───────────────────── */
    const sizes = new Map();
    for (const node of diagram.nodes) {
        sizes.set(node.id, measureNodeBox(node, showDescriptions));
    }
    /* ── 2. 端点解析：group → 代表节点 ──────────────────────────────── */
    const nodeById0 = new Map(diagram.nodes.map((n) => [n.id, n]));
    const groupById0 = new Map(diagram.groups.map((g) => [g.id, g]));
    /**
     * 一条边可以指向一个 group（dev-note §12 的示例就是 `target: "encoder"`，而
     * `encoder` 是 §11 定义的 group）。这里把它解析成组内的**入口/出口节点**参与分层，
     * 画的时候再把线裁到 group 边框上 —— 读者看到的是"箭头指向 Encoder 这个块"。
     *
     * 解析要两轮：第一轮用声明顺序猜入口/出口（此时还没有层号），拿到层号后再用
     * **层号**重解析一次。一轮就够用了，但一轮不够诚实 —— 组里节点的层号才真正
     * 决定谁是入口。两轮是确定性的，且不会来回震荡（第二轮的结果被直接采用）。
     */
    const resolveEndpoints = (layerHint) => {
        const out = new Map();
        for (const e of diagram.edges) {
            for (const [ref, role] of [
                [e.source, 'source'],
                [e.target, 'target'],
            ]) {
                if (nodeById0.has(ref)) {
                    out.set(`${e.id}:${role}`, ref);
                    continue;
                }
                if (!groupById0.has(ref))
                    continue;
                const leaves = leafNodesOf(diagram, ref);
                if (leaves.length === 0)
                    continue;
                const sorted = [...leaves].sort((a, b) => {
                    const la = layerHint?.get(a.id) ?? 0;
                    const lb = layerHint?.get(b.id) ?? 0;
                    // 出口取最靠后的（层大者优先，同层按声明顺序靠后者）；入口取最靠前的。
                    return role === 'source' ? lb - la || b.order - a.order : la - lb || a.order - b.order;
                });
                out.set(`${e.id}:${role}`, sorted[0].id);
            }
        }
        return out;
    };
    const toLayeringEdges = (resolved) => diagram.edges
        .map((e) => ({ id: e.id, source: resolved.get(`${e.id}:source`), target: resolved.get(`${e.id}:target`) }))
        .filter((e) => e.source !== undefined && e.target !== undefined);
    let endpointOf = resolveEndpoints();
    let layered = computeLayers(diagram, toLayeringEdges(endpointOf));
    endpointOf = resolveEndpoints(layered.layer);
    layered = computeLayers(diagram, toLayeringEdges(endpointOf));
    /** 供画线复用同一份解析结果（否则层号与实际锚点会不一致）。 */
    const resolveEndpoint = (id, role) => endpointOf.get(`${id}:${role}`) ?? (nodeById0.has(id) ? id : null);
    /* ── 3. 分层：回边 + 最长路径 ───────────────────────────────────── */
    // 状态机/生命周期里**环就是常态**（状态互相转移），报它只是噪声 —— 那类图里
    // "有环"不是需要检查的信号，而是这个图型存在的理由。
    if (layered.backEdges.size > 0 && diagram.type !== 'lifecycle') {
        diagnostics.push(warning('CYCLE_DETECTED', `${layered.backEdges.size} edge(s) form a cycle in the flow graph.`, [...layered.backEdges].sort().join(', '), 'Cycles are allowed (feedback/residual), but check that the direction is what the text claims.'));
    }
    if (layered.unlayerable) {
        diagnostics.push(warning('UNLAYERABLE_STRUCTURE', 'The graph could not be fully layered; some nodes were placed in declaration order.', undefined, 'Check for contradictory edge directions.'));
    }
    const layerOf = new Map();
    for (const node of diagram.nodes)
        layerOf.set(node.id, layered.layer.get(node.id) ?? 0);
    if (diagram.algorithm === 'grid') {
        // grid：忽略边，按声明顺序铺格子。用于"没有主流程"的结构图。
        const cols = Math.max(1, Math.ceil(Math.sqrt(diagram.nodes.length)));
        diagram.nodes.forEach((n, i) => layerOf.set(n.id, Math.floor(i / cols)));
    }
    /* ── 4. 层桶 + 尺寸工具 ─────────────────────────────────────────── */
    /** 沿流方向的尺寸：LR/RL 用宽，TB/BT 用高。 */
    const uExtent = (id) => {
        const s = sizes.get(id);
        return horizontal ? s.w : s.h;
    };
    /** 横向（层内堆叠方向）的尺寸。 */
    const vExtent = (id) => {
        const s = sizes.get(id);
        return horizontal ? s.h : s.w;
    };
    const layers = new Map();
    for (const node of diagram.nodes) {
        const l = layerOf.get(node.id) ?? 0;
        const bucket = layers.get(l);
        if (bucket === undefined)
            layers.set(l, [node]);
        else
            bucket.push(node);
    }
    const layerIndexes = [...layers.keys()].sort((a, b) => a - b);
    // 层内按声明顺序（渲染顺序与泳道内的堆叠顺序都以它为准）
    for (const l of layerIndexes) {
        ;
        layers.get(l).sort((a, b) => a.order - b.order);
    }
    const nodeByOrder = new Map(diagram.nodes.map((n) => [n.id, n]));
    const orderOf = (id) => nodeByOrder.get(id).order;
    const minOrderOfLane = (lane) => {
        if (lane.subgroup !== undefined) {
            const leaves = leafNodesOf(diagram, lane.subgroup);
            return leaves.length > 0 ? Math.min(...leaves.map((n) => n.order)) : Number.MAX_SAFE_INTEGER;
        }
        return lane.packed.length > 0 ? Math.min(...lane.packed.map(orderOf)) : Number.MAX_SAFE_INTEGER;
    };
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
    const needsLane = (groupId) => {
        const group = diagram.groups.find((g) => g.id === groupId);
        if (group === undefined)
            return true;
        /**
         * 只对**顶层且成员全是节点**的 group 做就地排版。
         *
         * 其余（嵌套 / 含子 group）一律走泳道。原因是叠层会让"装修高度"重复计入：
         * 子 group 的框顶已经含了一份标签带与 padding，父 group 再往上加一份，
         * 而泳道只预留了一份 —— 实测（自检 Test 4）：`backbone` 的框会顶进上面那一条
         * 泳道，把 `branch-b` 圈进去。就地排版是**优化**不是必需，所以宁可收紧适用范围，
         * 也不要为了省一条泳道去承担这个坑。
         */
        const memberIsGroup = group.members.some((m) => diagram.groups.some((g) => g.id === m));
        if (group.parent !== undefined || memberIsGroup)
            return true;
        if (group.members.length === 0)
            return false;
        // 就地排版的前提：它跨越的层区间里没有任何非成员（否则框会把外来节点圈进去）。
        const members = new Set(group.members);
        const ls = group.members.map((id) => layerOf.get(id) ?? 0);
        const first = Math.min(...ls);
        const last = Math.max(...ls);
        for (const l of layerIndexes) {
            if (l < first || l > last)
                continue;
            const bucket = layers.get(l);
            if (bucket.some((n) => !members.has(n.id)))
                return true;
        }
        return false;
    };
    /** 构造某个容器（`__root__` 或 group id）下的泳道列表。 */
    const buildLanes = (owner) => {
        const isRoot = owner === '__root__';
        const subGroups = diagram.groups.filter((g) => (isRoot ? g.parent === undefined : g.parent === owner)).map((g) => g.id);
        // 直接成员节点 + **不需要独占泳道**的子 group 的节点（拍平进本容器）
        const packed = diagram.nodes.filter((n) => (isRoot ? n.group === undefined : n.group === owner)).map((n) => n.id);
        const lanes = [];
        /** 把一个不需要泳道的 group 递归拍平：它的节点进 packed，需要泳道的孙 group 仍各自成道。 */
        const flatten = (gid) => {
            for (const n of diagram.nodes)
                if (n.group === gid)
                    packed.push(n.id);
            for (const child of diagram.groups) {
                if (child.parent !== gid)
                    continue;
                if (needsLane(child.id))
                    lanes.push({ owner, subgroup: child.id, packed: [], children: buildLanes(child.id), size: 0, offset: 0 });
                else
                    flatten(child.id);
            }
        };
        for (const gid of subGroups) {
            if (needsLane(gid))
                lanes.push({ owner, subgroup: gid, packed: [], children: buildLanes(gid), size: 0, offset: 0 });
            else
                flatten(gid);
        }
        if (packed.length > 0)
            lanes.unshift({ owner, packed, children: [], size: 0, offset: 0 });
        lanes.sort((a, b) => minOrderOfLane(a) - minOrderOfLane(b));
        return lanes;
    };
    const rootLanes = buildLanes('__root__');
    /**
     * 容器自身的"装修高度"：上下 padding + 顶部标签带。
     *
     * ⚠️ 它必须计入**泳道尺寸**，不能只在画框时加上去。否则容器框会长出自己那条泳道、
     * 压到相邻泳道的节点上（实测：Encoder 框的下沿压到了 Input 那一行，
     * `GROUP_OVERLAPS_FOREIGN_NODE` 照样报）。把它算进尺寸，框就正好等于泳道带。
     */
    const GROUP_CHROME = 2 * LAYOUT.groupPadding + LAYOUT.groupLabelBand;
    /** 打包泳道在某一层的内容高度；group 泳道是层无关的（= 子泳道之和）。 */
    const contentHeight = (lane, layer) => {
        if (lane.subgroup !== undefined) {
            return lane.children.reduce((sum, c) => sum + c.size, 0) + LAYOUT.nodeGap * Math.max(0, lane.children.length - 1);
        }
        const present = lane.packed.filter((id) => layer === null || (layerOf.get(id) ?? 0) === layer).sort((a, b) => orderOf(a) - orderOf(b));
        if (present.length === 0)
            return 0;
        return present.reduce((sum, id) => sum + vExtent(id), 0) + LAYOUT.nodeGap * Math.max(0, present.length - 1);
    };
    /** 自底向上定尺寸：子泳道先定，父泳道才能是"子泳道之和"。 */
    const measureLanes = (lanes) => {
        for (const lane of lanes)
            if (lane.subgroup !== undefined)
                measureLanes(lane.children);
        for (const lane of lanes) {
            lane.size =
                lane.subgroup !== undefined
                    ? contentHeight(lane, null) + GROUP_CHROME
                    : Math.max(0, ...layerIndexes.map((l) => contentHeight(lane, l)));
        }
    };
    measureLanes(rootLanes);
    {
        let v = 0;
        for (const lane of rootLanes) {
            lane.offset = v;
            v += lane.size + LAYOUT.nodeGap;
        }
        const assignInner = (lanes) => {
            let cursor2 = 0;
            for (const lane of lanes) {
                lane.offset = cursor2;
                cursor2 += lane.size + LAYOUT.nodeGap;
                if (lane.subgroup !== undefined)
                    assignInner(lane.children);
            }
        };
        for (const lane of rootLanes)
            if (lane.subgroup !== undefined)
                assignInner(lane.children);
    }
    const flowVEnd = rootLanes.reduce((sum, l) => sum + l.size, 0) + LAYOUT.nodeGap * Math.max(0, rootLanes.length - 1);
    /* ── 6. 流向空间定位（u 沿层推进，v 由泳道决定）────────────────── */
    const bandWidth = new Map();
    for (const l of layerIndexes) {
        const bucket = layers.get(l);
        bandWidth.set(l, Math.max(...bucket.map((n) => uExtent(n.id))));
    }
    /**
     * **就地排版**的容器要沿流向在首/末行之外留出 `groupPadding`，否则容器框会压到相邻
     * 那一层的节点上（泳道化的容器不需要：它的装修已算进泳道尺寸）。
     *
     * ⚠️ 这里只补"沿流向"的那一份：标签带在**横向**（TB 里是屏幕 x），而就地排版的前提
     * 就是那几行没有别的节点，所以横向那份天然安全。
     */
    const flowChrome = Math.max(0, LAYOUT.groupPadding - layerGap);
    const chromeBefore = new Set();
    const chromeAfter = new Set();
    if (flowChrome > 0) {
        for (const g of diagram.groups) {
            if (needsLane(g.id))
                continue;
            const leaves = leafNodesOf(diagram, g.id);
            if (leaves.length === 0)
                continue;
            const ls = leaves.map((n) => layerOf.get(n.id) ?? 0);
            chromeBefore.add(Math.min(...ls));
            chromeAfter.add(Math.max(...ls));
        }
    }
    const bandStart = new Map();
    let cursor = 0;
    for (const l of layerIndexes) {
        if (chromeBefore.has(l))
            cursor += flowChrome;
        bandStart.set(l, cursor);
        cursor += bandWidth.get(l) + layerGap + (chromeAfter.has(l) ? flowChrome : 0);
    }
    const flowUEnd = Math.max(0, cursor - layerGap);
    /** 由泳道树算出每个节点在流向空间里的 v（自上而下）。 */
    const nodeV = new Map();
    const placeLanes = (lanes, baseV) => {
        for (const lane of lanes) {
            const laneTop = baseV + lane.offset;
            if (lane.subgroup !== undefined) {
                // 子泳道排在容器的"装修"之内：框线之下的内容区
                placeLanes(lane.children, laneTop + LAYOUT.groupPadding + LAYOUT.groupLabelBand);
                continue;
            }
            for (const l of layerIndexes) {
                const present = lane.packed.filter((id) => (layerOf.get(id) ?? 0) === l).sort((a, b) => orderOf(a) - orderOf(b));
                if (present.length === 0)
                    continue;
                const height = present.reduce((sum, id) => sum + vExtent(id), 0) + LAYOUT.nodeGap * Math.max(0, present.length - 1);
                let v = laneTop + (lane.size - height) / 2;
                for (const id of present) {
                    nodeV.set(id, v);
                    v += vExtent(id) + LAYOUT.nodeGap;
                }
            }
        }
    };
    placeLanes(rootLanes, 0);
    const flowBoxes = [];
    for (const l of layerIndexes) {
        const bucket = layers.get(l);
        const band = bandWidth.get(l);
        for (const n of bucket) {
            const uSize = uExtent(n.id);
            const vSize = vExtent(n.id);
            flowBoxes.push({ node: n, u: bandStart.get(l) + (band - uSize) / 2, v: nodeV.get(n.id) ?? 0, uSize, vSize });
        }
    }
    /* ── 6.5 顶层 group 并排排布（`layout.arrange: "lanes"`）────────────
     * 目标版式：顶层 group 作为 cluster 在**同一带内左右并排、顶部对齐**（间距 groupGap），
     * 非分组节点统一排到 cluster 带**之下**。
     *
     * 为什么必须单独一个 pass：`needsLane()` 只在"层区间里混进了外来节点"时给泳道，
     * 否则 group 走就地排版 —— 两个 group 于是各自贴着子节点，在屏幕上走成**对角**；
     * 而真正的泳道只能沿 v 方向堆叠。所以"两个并排泳道框 + 其余节点在下方"
     * 在分层引擎里没有对应表达，只能显式重排。此处仍在**流向空间**里做，
     * 路由、容器框、通道簿记都在这之后计算，于是它们自动跟着新位置走。
     */
    if (arrange === 'lanes' && flowBoxes.length > 0) {
        if (diagram.direction !== 'LR' && diagram.direction !== 'TB') {
            diagnostics.push(warning('UNSUPPORTED_IN_MODE', `layout.arrange "lanes" supports LR and TB only; "${diagram.direction}" falls back to "auto".`, undefined, 'Use direction LR or TB, or drop arrange.'));
        }
        else {
            // 屏幕 x 轴 / y 轴分别对应哪条流向轴
            const xAxis = diagram.direction === 'LR' ? 'u' : 'v';
            const yAxis = diagram.direction === 'LR' ? 'v' : 'u';
            const gx = (b) => (xAxis === 'u' ? b.u : b.v);
            const gy = (b) => (yAxis === 'u' ? b.u : b.v);
            const sx = (b) => (xAxis === 'u' ? b.uSize : b.vSize);
            const sy = (b) => (yAxis === 'u' ? b.vSize : b.uSize);
            const moveX = (b, v) => { if (xAxis === 'u')
                b.u = v;
            else
                b.v = v; };
            const moveY = (b, v) => { if (yAxis === 'u')
                b.u = v;
            else
                b.v = v; };
            const boxByNode = new Map(flowBoxes.map((b) => [b.node.id, b]));
            /** 递归收集一个 group 下的全部节点 id。 */
            const collectNodes = (rootId) => {
                const out = [];
                const walk = (id) => {
                    const g = diagram.groups.find((x) => x.id === id);
                    if (g === undefined) {
                        if (boxByNode.has(id))
                            out.push(id);
                        return;
                    }
                    for (const m of g.members)
                        walk(m);
                };
                walk(rootId);
                return out;
            };
            const topGroups = diagram.groups.filter((g) => g.parent === undefined).sort((a, b) => a.order - b.order);
            const clustered = new Set();
            const clusters = [];
            for (const g of topGroups) {
                const ids = collectNodes(g.id);
                if (ids.length === 0)
                    continue;
                for (const id of ids)
                    clustered.add(id);
                clusters.push(ids);
            }
            const loose = diagram.nodes.map((n) => n.id).filter((id) => !clustered.has(id) && boxByNode.has(id));
            if (clusters.length > 1) {
                /** cluster 框（含容器装修）沿 x 的宽度。 */
                const metrics = clusters.map((ids) => {
                    const boxes = ids.map((id) => boxByNode.get(id));
                    const x0 = Math.min(...boxes.map(gx));
                    const x1 = Math.max(...boxes.map((b) => gx(b) + sx(b)));
                    const y0 = Math.min(...boxes.map(gy));
                    return { x0, y0, w: x1 - x0 + 2 * LAYOUT.groupPadding };
                });
                let cursor = 0;
                clusters.forEach((ids, i) => {
                    const m = metrics[i];
                    const dx = cursor + LAYOUT.groupPadding - m.x0;
                    const dy = LAYOUT.groupPadding + LAYOUT.groupLabelBand - m.y0; // 顶部对齐到 0
                    for (const id of ids) {
                        const b = boxByNode.get(id);
                        moveX(b, gx(b) + dx);
                        moveY(b, gy(b) + dy);
                    }
                    cursor += m.w + groupGap;
                });
                if (loose.length > 0) {
                    const bottom = Math.max(...[...clustered].map((id) => gy(boxByNode.get(id)) + sy(boxByNode.get(id)))) +
                        LAYOUT.groupPadding; // 泳道框下沿（节点下沿 + 装修），带宽按框算才不会被装修吃掉
                    const top = Math.min(...loose.map((id) => gy(boxByNode.get(id))));
                    // 泳道框下沿与松散节点之间要留出**总线带**：跨簇边全在这里分道，
                    // 只留一个 layerGap 时带宽不足，分道退化成一条 → 五条线叠成一根（实测）。
                    const busBand = Math.max(layerGap * 2, 6 * routeStep + 20);
                    const dy = bottom + busBand - top;
                    for (const id of loose) {
                        const b = boxByNode.get(id);
                        moveY(b, gy(b) + dy);
                    }
                }
                // 走廊模型：泳道矩形（含装修）+ 之间/两侧的竖向自由档 + 泳道下方总线
                if (diagram.direction === 'LR') {
                    const rects = clusters.map((ids, i) => {
                        const boxes = ids.map((id) => boxByNode.get(id));
                        const x0 = Math.min(...boxes.map(gx)) - LAYOUT.groupPadding;
                        const x1 = Math.max(...boxes.map((b) => gx(b) + sx(b))) + LAYOUT.groupPadding;
                        const y0 = Math.min(...boxes.map(gy)) - LAYOUT.groupPadding - LAYOUT.groupLabelBand;
                        const y1 = Math.max(...boxes.map((b) => gy(b) + sy(b))) + LAYOUT.groupPadding;
                        return { id: `cluster${i}`, x0, x1, y0, y1, ids: new Set(ids) };
                    });
                    rects.sort((a, b) => a.x0 - b.x0);
                    const corridorX = [];
                    corridorX.push(rects[0].x0 - layerGap * 1.2);
                    for (let i = 0; i + 1 < rects.length; i++) {
                        corridorX.push((rects[i].x1 + rects[i + 1].x0) / 2);
                    }
                    corridorX.push(rects[rects.length - 1].x1 + layerGap * 1.2);
                    const clusterBottom = Math.max(...rects.map((r) => r.y1));
                    const looseTop = loose.length > 0
                        ? Math.min(...loose.map((id) => gy(boxByNode.get(id))))
                        : clusterBottom + layerGap;
                    const nodeCluster = new Map();
                    for (const n of diagram.nodes) {
                        const idx = rects.findIndex((r) => r.ids.has(n.id));
                        if (idx >= 0)
                            nodeCluster.set(n.id, idx);
                    }
                    const busY = clusterBottom + Math.max(8, (looseTop - clusterBottom) * 0.25);
                    if (process.env.DBG_LANES === '1') {
                        console.log('[lanes]', JSON.stringify({ clusterBottom, looseTop, busY, busMaxY: looseTop - 10, corridorX: corridorX.map((v) => Math.round(v)) }));
                    }
                    laneCorridor = {
                        clusters: rects,
                        corridorX,
                        busY,
                        // 留出 10 单位余量：分道错位最多把总线推到 looseTop - 10
                        busMaxY: looseTop - 10,
                        nodeCluster,
                    };
                }
                // 通道簿记跟着实际位置更新（实验：可开关）
                for (const l of layerIndexes) {
                    const bucket = flowBoxes.filter((b) => (layerOf.get(b.node.id) ?? 0) === l);
                    if (bucket.length === 0)
                        continue;
                    const u0 = Math.min(...bucket.map((b) => b.u));
                    const u1 = Math.max(...bucket.map((b) => b.u + b.uSize));
                    bandStart.set(l, u0);
                    bandWidth.set(l, u1 - u0);
                }
            }
        }
    }
    /* ── 7. 流向 → 屏幕 ─────────────────────────────────────────────── */
    const mapPoint = (u, v) => {
        switch (diagram.direction) {
            case 'LR':
                return { x: u, y: v };
            case 'RL':
                return { x: flowUEnd - u, y: v };
            case 'TB':
                return { x: v, y: u };
            case 'BT':
                return { x: v, y: flowUEnd - u };
        }
    };
    /** 把一个流向矩形映射成屏幕矩形（镜像会让"左上角"变到另一边，所以不能只映射角点）。 */
    const mapRect = (u, v, uSize, vSize) => {
        const a = mapPoint(u, v);
        const b = mapPoint(u + uSize, v + vSize);
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    };
    const nodes = flowBoxes.map((box) => {
        const size = sizes.get(box.node.id);
        return {
            id: box.node.id,
            type: box.node.type,
            style: box.node.style,
            label: box.node.label,
            labelLines: size.labelLines,
            descriptionLines: size.descriptionLines,
            rect: mapRect(box.u, box.v, box.uSize, box.vSize),
            layer: layerOf.get(box.node.id) ?? 0,
            refLines: size.refLines,
            ...(size.refText !== undefined ? { refText: size.refText } : {}),
            traced: box.node.evidence.length > 0 || box.node.group !== undefined,
        };
    });
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const flowOf = new Map(flowBoxes.map((b) => [b.node.id, b]));
    /* ── 8. group 容器（正好是它自己那条泳道带）─────────────────────── */
    const groups = [];
    const groupFlowRect = new Map();
    const deepFirst = [...diagram.groups].sort((a, b) => b.depth - a.depth || a.order - b.order);
    for (const g of deepFirst) {
        const memberRects = [];
        for (const m of g.members) {
            const child = groupFlowRect.get(m);
            if (child !== undefined)
                memberRects.push(child);
            const flow = flowOf.get(m);
            if (flow !== undefined)
                memberRects.push({ x: flow.u, y: flow.v, w: flow.uSize, h: flow.vSize });
        }
        const union = unionRects(memberRects);
        if (union === null)
            continue;
        const rect = {
            x: r3(union.x - LAYOUT.groupPadding),
            y: r3(union.y - LAYOUT.groupPadding - LAYOUT.groupLabelBand),
            w: r3(union.w + 2 * LAYOUT.groupPadding),
            h: r3(union.h + 2 * LAYOUT.groupPadding + LAYOUT.groupLabelBand),
        };
        groupFlowRect.set(g.id, rect);
        const refText = g.refs !== undefined && g.refs.length > 0 ? `[${g.refs.join(' · ')}]` : undefined;
        groups.push({
            id: g.id,
            label: g.label,
            style: g.style,
            rect: mapRect(rect.x, rect.y, rect.w, rect.h),
            depth: g.depth,
            members: g.members,
            ...(refText !== undefined ? { refText } : {}),
        });
    }
    const groupById = new Map(groups.map((g) => [g.id, g]));
    /* ── 9. 走线 ────────────────────────────────────────────────────── */
    // 绕行线要越过**所有**障碍，包括容器框 —— 容器框会伸出到节点之外（标签带 + padding），
    // 只按节点算 vTop/vBottom 的话，上/下绕行线会从容器框里穿过去（实测：容器是障碍之后，
    // 绕行线反而成了唯一"穿过容器"的那条）。
    const groupRectsFlow = [...groupFlowRect.values()];
    const vTop = Math.min(...flowBoxes.map((b) => b.v), ...groupRectsFlow.map((r) => r.y));
    const vBottom = Math.max(...flowBoxes.map((b) => b.v + b.vSize), ...groupRectsFlow.map((r) => r.y + r.h));
    /**
     * 同一通道内的**微量错位**。
     *
     * 通道中点被所有边共用，于是"进这个节点"的边和"出这个节点"的边会在贴边那一段
     * 完全重合（实测 RDP 图 e12 ↔ e13 重合 24.3 单位）。按边序在通道内错开几个单位，
     * 既保持正交、又不会越出通道（通道宽 = layerGap，错位幅度 ≤3）。
     */
    const nudgeUnit = edgeGap > 0 ? Math.max(2, edgeGap / 1.5) : 2;
    const laneNudge = (order) => (((order % 4) - 1.5) * nudgeUnit);
    const laneBefore = (l) => {
        const idx = layerIndexes.indexOf(l);
        if (idx <= 0)
            return bandStart.get(l) - layerGap / 2;
        const prev = layerIndexes[idx - 1];
        return (bandStart.get(prev) + bandWidth.get(prev) + bandStart.get(l)) / 2;
    };
    const laneAfter = (l) => {
        const idx = layerIndexes.indexOf(l);
        if (idx < 0 || idx >= layerIndexes.length - 1) {
            return bandStart.get(l) + bandWidth.get(l) + layerGap / 2;
        }
        const next = layerIndexes[idx + 1];
        return (bandStart.get(l) + bandWidth.get(l) + bandStart.get(next)) / 2;
    };
    /** 一个节点的全部祖先容器（自己所属的 group + 其上级）。 */
    const ancestorsOf = (nodeId) => {
        const out = new Set();
        let gid = diagram.nodes.find((n) => n.id === nodeId)?.group;
        while (gid !== undefined && !out.has(gid)) {
            out.add(gid);
            gid = diagram.groups.find((g) => g.id === gid)?.parent;
        }
        return out;
    };
    /**
     * 障碍 = 其它节点 **+ 与这条边无关的容器框**。
     *
     * 为什么容器也要算障碍：容器框是矩形，会挡住节点之间的通道；不把它当障碍时，
     * 一条"绕过所有节点"的边会直接从容器里穿过去（实测：RDP 图的回边穿过 DCRM 框、
     * 残差边穿过 Encoder 框）。两端自己的祖先容器当然要放行 —— 边本来就该进出它。
     */
    const obstacles = (sourceId, targetId) => {
        const allowed = new Set([...ancestorsOf(sourceId), ...ancestorsOf(targetId)]);
        const rects = flowBoxes
            .filter((b) => b.node.id !== sourceId && b.node.id !== targetId)
            .map((b) => ({ x: b.u, y: b.v, w: b.uSize, h: b.vSize }));
        for (const g of diagram.groups) {
            if (allowed.has(g.id))
                continue;
            const r = groupFlowRect.get(g.id);
            if (r !== undefined)
                rects.push(r);
        }
        return rects;
    };
    const isClear = (path, sourceId, targetId) => {
        const rects = obstacles(sourceId, targetId);
        for (const r of rects)
            if (polylineIntersectsRect(path, r, 1.5))
                return false;
        return true;
    };
    const plans = [];
    for (const edge of diagram.edges) {
        const sourceId = resolveEndpoint(edge.id, 'source');
        const targetId = resolveEndpoint(edge.id, 'target');
        if (sourceId === null || targetId === null)
            continue; // normalize 已报过错
        const sBox = flowOf.get(sourceId);
        const tBox = flowOf.get(targetId);
        if (sBox === undefined || tBox === undefined)
            continue;
        const ls = layerOf.get(sourceId) ?? 0;
        const lt = layerOf.get(targetId) ?? 0;
        // 前向从 uEnd 出、uStart 进；回边反过来；同层都从 uEnd 侧进出
        const sSide = ls > lt ? 'start' : 'end';
        const tSide = ls < lt ? 'start' : 'end';
        plans.push({ edge, sourceId, targetId, sBox, tBox, ls, lt, sSide, tSide, sV: 0, tV: 0 });
    }
    /** 端点分组的键：节点 + 物理侧（flow 空间的 uStart / uEnd）。 */
    const anchorGroups = new Map();
    const pushAnchor = (plan, role) => {
        const side = role === 's' ? plan.sSide : plan.tSide;
        const nodeId = role === 's' ? plan.sourceId : plan.targetId;
        const other = role === 's' ? plan.tBox : plan.sBox;
        const key = `${nodeId}|${side}`;
        const arr = anchorGroups.get(key);
        const item = { plan, role, otherV: other.v + other.vSize / 2 };
        if (arr === undefined)
            anchorGroups.set(key, [item]);
        else
            arr.push(item);
    };
    for (const plan of plans) {
        pushAnchor(plan, 's');
        pushAnchor(plan, 't');
    }
    for (const [key, arr] of anchorGroups) {
        const nodeId = key.slice(0, key.lastIndexOf('|'));
        const side = key.slice(key.lastIndexOf('|') + 1);
        const box = flowOf.get(nodeId);
        if (box === undefined)
            continue;
        const k = arr.length;
        // 按对端位置排序（同位置时按声明顺序），保证确定性且节点附近不交叉
        arr.sort((a, b) => a.otherV - b.otherV || a.plan.edge.order - b.plan.edge.order);
        arr.forEach((item, i) => {
            const v = box.v + (box.vSize * (i + 1)) / (k + 1);
            if (item.role === 's')
                item.plan.sV = v;
            else
                item.plan.tV = v;
        });
    }
    /**
     * 外绕通道也要"分散"。
     *
     * 端点分散解决了节点处的堆叠，但**外绕通道**还是共用一条：实测 RDP 图里
     * 有两条边同时走上侧通道，重叠了 79.7 个单位 —— 画出来就是一根线的一段，
     * 读者根本看不出那是两条边。所以第 k 条用某侧通道的边，走第 k 条车道。
     */
    let topLaneUse = 0;
    let bottomLaneUse = 0;
    /** 走廊与总线的占用计数（并排泳道模式；按边序确定性递增，避免共线叠置）。 */
    const corridorUse = new Map();
    const busUse = { n: 0 };
    /** 松散节点（泳道下方的 ir/state）上下入口的交替错位计数。 */
    const loosePortUse = new Map();
    /** 已经放好的边标签矩形：后面的标签要避开它们（贪心、确定性）。 */
    const placedLabelRects = [];
    const edges = [];
    for (const plan of plans) {
        const { edge, sourceId, targetId, sBox, tBox, ls, lt, sV, tV } = plan;
        const candidates = [];
        /**
         * 并排泳道下的**走廊式路由**（只对跨 cluster 的边）。
         *
         * 为什么不能沿用下面的分层分支：那些分支用 `ls/lt`（层序）决定折线通道，
         * 并排排布后层序与几何位置脱钩 —— v 向移动会落在泳道内部。这条分支把跨簇边
         * 一律送进自由空间：源所在列的**外侧走廊** → 泳道下方的**横向总线** →
         * 目标所在列的**外侧走廊** → 进入目标。同簇边仍走原分层路由（它们本来就干净）。
         */
        const srcCluster = laneCorridor?.nodeCluster.get(sourceId) ?? -1;
        const tgtCluster = laneCorridor?.nodeCluster.get(targetId) ?? -1;
        if (laneCorridor !== null && sourceId !== targetId && srcCluster !== tgtCluster) {
            const lc = laneCorridor;
            const laneSide = (nodeId, box, clusterIdx) => {
                const c = lc.clusters[clusterIdx];
                // 节点在所属泳道的哪一列：偏左 → 用左侧走廊，偏右 → 用右侧走廊（这样横向出口
                // 只穿过空档，不穿过同排的另一个节点）。
                return box.u + box.uSize / 2 < (c.x0 + c.x1) / 2 ? -1 : 1;
            };
            const step = routeStep;
            /**
             * 走廊内的**有界分道**：第 k 条用这条走廊的边取第 k 条车道（`lane` 从中间向外
             * 来回取），而不是无限右移 —— 无限右移会越出走廊、压到泳道框上；
             * 也不夹紧到同一个 y/x（夹紧等于把多条线叠成一条，正是 EDGE_OVERLAP 的来源）。
             */
            const laneOffset = (use, lanes) => ((use % lanes) - (lanes - 1) / 2) * step;
            const CORRIDOR_LANES = 6;
            const corridor = (idx, side) => {
                const key = idx + (side > 0 ? 1 : 0);
                const used = corridorUse.get(key) ?? 0;
                corridorUse.set(key, used + 1);
                return lc.corridorX[key] + laneOffset(used, CORRIDOR_LANES);
            };
            /** 松散节点的接入点：同一条边沿节点上边左右交替错开，避免两条线共用一个锚点。 */
            const loosePort = (nodeId, box) => {
                const used = loosePortUse.get(nodeId) ?? 0;
                loosePortUse.set(nodeId, used + 1);
                const k = Math.ceil(used / 2);
                const dir = used === 0 ? 0 : used % 2 === 1 ? 1 : -1;
                return box.u + box.uSize / 2 + dir * k * Math.max(6, step);
            };
            const srcSide = srcCluster >= 0 ? laneSide(sourceId, sBox, srcCluster) : 1;
            const tgtSide = tgtCluster >= 0 ? laneSide(targetId, tBox, tgtCluster) : 1;
            const srcX = srcCluster >= 0 ? corridor(srcCluster, srcSide) : loosePort(sourceId, sBox);
            const tgtX = tgtCluster >= 0 ? corridor(tgtCluster, tgtSide) : loosePort(targetId, tBox);
            const busLanes = Math.max(1, Math.floor((lc.busMaxY - lc.busY) / step) + 1);
            const bus = lc.busY + laneOffset(busUse.n++, Math.min(busLanes, 6));
            const srcInLane = srcCluster >= 0;
            const tgtInLane = tgtCluster >= 0;
            /**
             * 源是否位于所属泳道的**最底一行**：只有这时才允许直接向下出泳道。
             *
             * ⚠️ 判据必须是"本簇里没有别的节点在它下方"，不能拿节点下沿去比**泳道框**下沿 ——
             * 框含装修（`groupPadding` + 标签带），底行的节点也会被判成"不能向下出"，
             * 于是绕到泳道最外侧走长竖线（实测 `exev → ir` 就是这样多出一条右边距长线）。
             */
            const bottomRowFree = srcInLane &&
                ![...lc.clusters[srcCluster].ids].some((id) => {
                    const b = flowBoxes.find((x) => x.node.id === id);
                    return b !== undefined && b.node.id !== sourceId && b.v > sBox.v + sBox.vSize + 1;
                });
            const pts = [];
            if (srcInLane && !tgtInLane && bottomRowFree) {
                // 泳道 → 下方节点：直接从底边向下出。**不要**横着出 —— 那条横向短边会和同列
                // 上下相邻边的分层路由抢同一条 y（实测 commit→exev 与 exev→ir 在 y=197 上重合 20 单位）。
                const x = loosePort(sourceId, sBox);
                pts.push({ x, y: sBox.v + sBox.vSize });
                pts.push({ x, y: bus });
                pts.push({ x: tgtX, y: bus });
                pts.push({ x: tgtX, y: tBox.v });
            }
            else if (!srcInLane && tgtInLane) {
                // 下方节点 → 泳道：上到总线，沿总线到目标所在列的走廊，再在走廊里升到目标行、横向进入。
                pts.push({ x: srcX, y: sBox.v });
                pts.push({ x: srcX, y: bus });
                pts.push({ x: tgtX, y: bus });
                pts.push({ x: tgtX, y: tV });
                pts.push({ x: tBox.u + (tgtSide > 0 ? tBox.uSize : 0), y: tV });
            }
            else if (srcInLane && tgtInLane) {
                // 泳道 ↔ 泳道：两框之间的空档本身就是自由空间，v 向移动在走廊里做完即可。
                pts.push({ x: sBox.u + (srcSide > 0 ? sBox.uSize : 0), y: sV });
                pts.push({ x: srcX, y: sV });
                pts.push({ x: srcX, y: tV });
                pts.push({ x: tBox.u + (tgtSide > 0 ? tBox.uSize : 0), y: tV });
            }
            else if (srcInLane && !tgtInLane) {
                // 源在泳道但**不在最底一行**（正下方还有同簇节点）：只能从侧面出泳道，
                // 沿外侧走廊下行到总线，再横穿到目标列。
                // ⚠️ 起笔点必须是**节点边框**：早先这种情况落到"两端都在下方"的兜底分支，
                // 起笔写成走廊 x，于是画出一端悬空的长线（实测 `commit → state`）。
                pts.push({ x: sBox.u + (srcSide > 0 ? sBox.uSize : 0), y: sV });
                pts.push({ x: srcX, y: sV });
                pts.push({ x: srcX, y: bus });
                pts.push({ x: tgtX, y: bus });
                pts.push({ x: tgtX, y: tBox.v });
            }
            else {
                // 两个端点都在下方（少见）：沿总线直接连。
                pts.push({ x: srcX, y: sBox.v });
                pts.push({ x: srcX, y: bus });
                pts.push({ x: tgtX, y: bus });
                pts.push({ x: tgtX, y: tBox.v });
            }
            candidates.push(pts);
        }
        else if (laneCorridor !== null &&
            srcCluster >= 0 &&
            srcCluster === tgtCluster &&
            /**
             * 同簇、**同一行**、左右相邻的两列节点之间的边，直接走两节点之间的微通道。
             *
             * 为什么不能用下面的分层分支：那会把边先送到"层通道"再折回目标所在列，
             * 折回的那一段会落回本行的 y 上，与同源另一条边的横向短边**共线重叠**
             * （实测 `guards → commit` 与 `guards → reject` 共享 12 单位，且反复调整锚点无效）。
             * 两列之间本来就是自由空间，直连即可 —— 既不共线，也更短。
             */
            (tBox.u >= sBox.u + sBox.uSize || sBox.u >= tBox.u + tBox.uSize) &&
            Math.min(sBox.v + sBox.vSize, tBox.v + tBox.vSize) - Math.max(sBox.v, tBox.v) > 0 &&
            (() => {
                const rightward = tBox.u > sBox.u;
                const mid = rightward
                    ? (sBox.u + sBox.uSize + tBox.u) / 2
                    : (tBox.u + tBox.uSize + sBox.u) / 2;
                const vLo = Math.min(sV, tV) - 2;
                const vHi = Math.max(sV, tV) + 2;
                // 微通道必须真的空着：任何别的节点都不能占住这条竖带
                return !flowBoxes.some((b) => b.node.id !== sourceId &&
                    b.node.id !== targetId &&
                    b.u <= mid + 2 &&
                    b.u + b.uSize >= mid - 2 &&
                    b.v < vHi &&
                    b.v + b.vSize > vLo);
            })()) {
            const rightward = tBox.u > sBox.u;
            const mid = rightward
                ? (sBox.u + sBox.uSize + tBox.u) / 2
                : (tBox.u + tBox.uSize + sBox.u) / 2;
            candidates.push([
                { x: rightward ? sBox.u + sBox.uSize : sBox.u, y: sV },
                { x: mid, y: sV },
                { x: mid, y: tV },
                { x: rightward ? tBox.u : tBox.u + tBox.uSize, y: tV },
            ]);
        }
        else if (sourceId === targetId) {
            /**
             * 自环（`source === target`）：状态机的自转移、流程的"就地重试"。
             *
             * 过去这里直接报 `SELF_EDGE` 拒掉，于是**状态机根本画不出来** —— 而自转移是
             * 状态机里最常见的转移之一。现在画成"向外折出再折回"的环：两个锚点由
             * 共享端点分散给出（同一侧的两个不同位置），所以进出不会重合。
             */
            const uOut = sBox.u + sBox.uSize;
            const uBack = uOut + LAYOUT.selfLoopW;
            candidates.push([
                { x: uOut, y: sV },
                { x: uBack, y: sV },
                { x: uBack, y: tV },
                { x: uOut, y: tV },
            ]);
        }
        else if (ls < lt) {
            // 前向：从 uEnd 出、uStart 进
            const uOut = sBox.u + sBox.uSize;
            const uIn = tBox.u;
            const lane = laneAfter(ls) + laneNudge(edge.order);
            candidates.push([
                { x: uOut, y: sV },
                { x: lane, y: sV },
                { x: lane, y: tV },
                { x: uIn, y: tV },
            ]);
            // 外绕：走到全图之外的那条通道，再**在目标自己的锚点 u 上**做 v 向移动后进入。
            // ⚠️ 不要在 `laneBefore(lt)` / `laneAfter(lt)` 上做这次 v 向移动：那一格的空隙
            // 可能已被容器的标签带占满（实测 RDP 图的回边就是这样穿进 DCRM 框的）。
            // 目标锚点 u 是目标的边界平面，贴着它移动不会碰到别人。
            for (const vLane of [vTop - LAYOUT.detourGap * (1 + topLaneUse), vBottom + LAYOUT.detourGap * (1 + bottomLaneUse)]) {
                candidates.push([
                    { x: uOut, y: sV },
                    { x: lane, y: sV },
                    { x: lane, y: vLane },
                    { x: uIn, y: vLane },
                    { x: uIn, y: tV },
                ]);
            }
        }
        else if (ls > lt) {
            // 回边：从 uStart 出、uEnd 进
            const uOut = sBox.u;
            const uIn = tBox.u + tBox.uSize;
            const lane = laneBefore(ls) + laneNudge(edge.order);
            candidates.push([
                { x: uOut, y: sV },
                { x: lane, y: sV },
                { x: lane, y: tV },
                { x: uIn, y: tV },
            ]);
            for (const vLane of [vTop - LAYOUT.detourGap * (1 + topLaneUse), vBottom + LAYOUT.detourGap * (1 + bottomLaneUse)]) {
                candidates.push([
                    { x: uOut, y: sV },
                    { x: lane, y: sV },
                    { x: lane, y: vLane },
                    { x: uIn, y: vLane },
                    { x: uIn, y: tV },
                ]);
            }
        }
        else {
            // 同层：都从 uEnd 侧进出，借层后空隙折返
            const uOut = sBox.u + sBox.uSize;
            const uIn = tBox.u + tBox.uSize;
            const lane = laneAfter(ls) + laneNudge(edge.order);
            candidates.push([
                { x: uOut, y: sV },
                { x: lane, y: sV },
                { x: lane, y: tV },
                { x: uIn, y: tV },
            ]);
            for (const vLane of [vTop - LAYOUT.detourGap * (1 + topLaneUse), vBottom + LAYOUT.detourGap * (1 + bottomLaneUse)]) {
                candidates.push([
                    { x: uOut, y: sV },
                    { x: lane, y: sV },
                    { x: lane, y: vLane },
                    { x: uIn, y: vLane },
                    { x: uIn, y: tV },
                ]);
            }
        }
        let chosen = null;
        let detoured = false;
        let picked = 0;
        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            if (isClear(cand, sourceId, targetId)) {
                chosen = cand;
                detoured = i > 0;
                picked = i;
                break;
            }
        }
        // 占用了哪条外绕车道就把那条车道的序号往前推（候选顺序固定：0 直连 / 1 上绕 / 2 下绕）
        if (picked === 1)
            topLaneUse += 1;
        else if (picked === 2)
            bottomLaneUse += 1;
        const crosses = chosen === null;
        if (chosen === null)
            chosen = candidates[0];
        let points = simplifyPolyline(chosen.map((p) => mapPoint(p.x, p.y)));
        const declaredSource = groupById0.has(edge.source) ? edge.source : sourceId;
        const declaredTarget = groupById0.has(edge.target) ? edge.target : targetId;
        const srcGroup = declaredSource !== sourceId ? groupById.get(declaredSource) : undefined;
        const tgtGroup = declaredTarget !== targetId ? groupById.get(declaredTarget) : undefined;
        if (srcGroup !== undefined)
            points = clipAtRect(points, srcGroup.rect, 'start');
        if (tgtGroup !== undefined)
            points = clipAtRect(points, tgtGroup.rect, 'end');
        points = simplifyPolyline(points);
        const routed = {
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
        };
        if (edge.label !== undefined && points.length >= 2) {
            /**
             * 标签落点：先在**最长线段**上取中点，然后检查它有没有压到盒子；
             * 压到了就依次试其它候选落点（各段中点、沿段滑动 ±25%），取第一个不压的。
             *
             * 为什么要试而不是"报了让 Agent 改"：标签落点是渲染器的职责，而"标签压在盒子上"
             * 在论文图里是硬伤（读者会以为标签属于那个盒子）。实测：LR 布局里
             * `kernel → reject` 的标签（117 单位宽）正好压住 `kernel` 盒。
             * 布局仍然确定（候选顺序固定），只是多了一层"选一个不压的"。
             */
            const segs = points.slice(0, -1).map((a, i) => ({ a, b: points[i + 1] }));
            const segLen = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
            const ordered = [...segs].sort((x, y) => segLen(y.a, y.b) - segLen(x.a, x.b));
            const boxRects = [
                ...nodes.map((n) => n.rect),
                ...groups.map((g) => g.rect),
            ];
            const labelW = measureText(edge.label, FONT_SIZE.edgeLabel);
            const candidates = [];
            for (const seg of ordered) {
                const horizontal = Math.abs(seg.a.y - seg.b.y) < 0.5;
                for (const t of [0.5, 0.35, 0.65, 0.25, 0.75]) {
                    const p = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
                    /**
                     * 除了沿线段平移，还要能**垂直错开**：多条边落在同一列时（状态机的转移、
                     * 时序里相邻的消息），它们的标签会在同一个位置互相压 —— 只沿线段找位置
                     * 永远找不到空档，因为空档在垂直于线的方向上。
                     */
                    for (const off of [6, 18, 30, -12]) {
                        candidates.push(horizontal
                            ? { pos: { x: p.x, y: p.y - off }, anchor: 'middle' }
                            : { pos: { x: p.x + off, y: p.y }, anchor: 'start' });
                    }
                }
            }
            const fits = (c) => {
                const x0 = c.anchor === 'middle' ? c.pos.x - labelW / 2 : c.pos.x;
                const rect = { x: x0 - 3, y: c.pos.y - FONT_SIZE.edgeLabel, w: labelW + 6, h: FONT_SIZE.edgeLabel * 1.3 };
                for (const b of boxRects)
                    if (rectsOverlap(rect, b, 1))
                        return false;
                // 也要避开**已经放好的标签**：两个标签叠在一起，等于两个都读不了。
                for (const placed of placedLabelRects)
                    if (rectsOverlap(rect, placed, 1))
                        return false;
                return true;
            };
            const pick = candidates.find(fits) ?? candidates[0];
            {
                const x0 = pick.anchor === 'middle' ? pick.pos.x - labelW / 2 : pick.pos.x;
                placedLabelRects.push({ x: x0 - 3, y: pick.pos.y - FONT_SIZE.edgeLabel, w: labelW + 6, h: FONT_SIZE.edgeLabel * 1.3 });
            }
            routed.labelPos = { x: r3(pick.pos.x), y: r3(pick.pos.y) };
            routed.labelAnchor = pick.anchor;
        }
        edges.push(routed);
    }
    /* ── 10. 独立 Label ─────────────────────────────────────────────── */
    const labels = [];
    for (const label of diagram.labels) {
        const node = nodeById.get(label.anchor);
        if (node !== undefined) {
            labels.push({ id: label.id, text: label.text, x: r3(node.rect.x + node.rect.w / 2), y: r3(rectBottom(node.rect) + 15), anchor: 'middle' });
            continue;
        }
        const group = groupById.get(label.anchor);
        if (group !== undefined) {
            labels.push({ id: label.id, text: label.text, x: r3(rectRight(group.rect) - 8), y: r3(group.rect.y + 14), anchor: 'end' });
            continue;
        }
        const edge = edges.find((e) => e.id === label.anchor);
        if (edge?.labelPos !== undefined) {
            labels.push({ id: label.id, text: label.text, x: r3(edge.labelPos.x), y: r3(edge.labelPos.y), anchor: edge.labelAnchor });
        }
    }
    /* ── 10b. 卡片栏 ────────────────────────────────────────────────── */
    /**
     * 卡片整块放在**流程之外**（永远在右侧一栏），所以：
     * ① 不参与走线，不会制造连线问题；② 不需要为它做避让；
     * ③ 流程本身保持"一列/一行"的干净读法 —— 这正是卡片的用途：
     * 想多表达观点时，加卡片而不是加边。
     */
    const flowBounds = unionRects([
        ...nodes.map((n) => n.rect),
        ...groups.map((g) => g.rect),
        ...edges.map((e) => unionRects(e.points.map((pt) => ({ x: pt.x, y: pt.y, w: 0, h: 0 })))).filter((r) => r !== null),
    ]) ?? { x: 0, y: 0, w: 0, h: 0 };
    const cards = buildCardPanel(diagram.cards, flowBounds);
    /* ── 11. 整体平移 + 画布尺寸 ────────────────────────────────────── */
    const title = diagram.title;
    const titleBand = title !== undefined ? LAYOUT.titleBand : 0;
    const boundsList = [
        ...nodes.map((n) => n.rect),
        ...groups.map((g) => g.rect),
        ...cards.map((c) => c.rect),
        ...edges.map((e) => unionRects(e.points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))).filter((r) => r !== null),
    ];
    const bounds = unionRects(boundsList) ?? { x: 0, y: 0, w: 0, h: 0 };
    const dx = LAYOUT.canvasMargin - bounds.x;
    const dy = LAYOUT.canvasMargin + titleBand - bounds.y;
    const shift = (p) => ({ x: r3(p.x + dx), y: r3(p.y + dy) });
    for (const n of nodes)
        n.rect = { x: r3(n.rect.x + dx), y: r3(n.rect.y + dy), w: n.rect.w, h: n.rect.h };
    for (const g of groups)
        g.rect = { x: r3(g.rect.x + dx), y: r3(g.rect.y + dy), w: g.rect.w, h: g.rect.h };
    for (const c of cards)
        c.rect = { x: r3(c.rect.x + dx), y: r3(c.rect.y + dy), w: c.rect.w, h: c.rect.h };
    for (const e of edges) {
        e.points = e.points.map(shift);
        if (e.labelPos !== undefined)
            e.labelPos = shift(e.labelPos);
    }
    for (const l of labels) {
        l.x = r3(l.x + dx);
        l.y = r3(l.y + dy);
    }
    const contentW = bounds.w + 2 * LAYOUT.canvasMargin;
    const contentH = bounds.h + 2 * LAYOUT.canvasMargin + titleBand;
    const requestedW = diagram.canvas.width ?? 0;
    const requestedH = diagram.canvas.height ?? 0;
    if (requestedW > 0 && requestedW + 0.5 < contentW) {
        diagnostics.push(warning('CANVAS_TOO_SMALL', `Requested canvas width ${requestedW} is smaller than the content (${r3(contentW)}).`, undefined, 'Omit canvas to let the renderer size it, or raise the value.'));
    }
    if (requestedH > 0 && requestedH + 0.5 < contentH) {
        diagnostics.push(warning('CANVAS_TOO_SMALL', `Requested canvas height ${requestedH} is smaller than the content (${r3(contentH)}).`, undefined, 'Omit canvas to let the renderer size it, or raise the value.'));
    }
    const width = r3(Math.max(requestedW, contentW));
    const height = r3(Math.max(requestedH, contentH));
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
        cards,
        layerBands: layerIndexes.map((l) => ({ start: bandStart.get(l), end: bandStart.get(l) + bandWidth.get(l) })),
        diagnostics,
    };
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
function computeLayers(diagram, edges) {
    const outgoing = new Map();
    for (const node of diagram.nodes)
        outgoing.set(node.id, []);
    for (const e of edges) {
        if (e.source === e.target)
            continue;
        outgoing.get(e.source)?.push({ id: e.id, target: e.target });
    }
    const color = new Map();
    for (const node of diagram.nodes)
        color.set(node.id, 0);
    const backEdges = new Set();
    const forward = new Map();
    // 迭代式 DFS：递归在深图上会爆栈，而"论文方法图"恰恰可能很深。
    for (const root of diagram.nodes) {
        if (color.get(root.id) !== 0)
            continue;
        const stack = [{ id: root.id, next: 0 }];
        color.set(root.id, 1);
        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            const children = outgoing.get(frame.id) ?? [];
            if (frame.next >= children.length) {
                color.set(frame.id, 2);
                stack.pop();
                continue;
            }
            const child = children[frame.next];
            frame.next += 1;
            const c = color.get(child.target) ?? 0;
            if (c === 1) {
                backEdges.add(child.id);
                continue;
            }
            const list = forward.get(frame.id);
            if (list === undefined)
                forward.set(frame.id, [child.target]);
            else
                list.push(child.target);
            if (c === 0) {
                color.set(child.target, 1);
                stack.push({ id: child.target, next: 0 });
            }
        }
    }
    // DAG 上的最长路径
    const indegree = new Map();
    for (const node of diagram.nodes)
        indegree.set(node.id, 0);
    for (const targets of forward.values())
        for (const t of targets)
            indegree.set(t, (indegree.get(t) ?? 0) + 1);
    const layer = new Map();
    for (const node of diagram.nodes)
        layer.set(node.id, 0);
    const queue = diagram.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
    let processed = 0;
    while (queue.length > 0) {
        const id = queue.shift();
        processed += 1;
        for (const t of forward.get(id) ?? []) {
            layer.set(t, Math.max(layer.get(t) ?? 0, (layer.get(id) ?? 0) + 1));
            const d = (indegree.get(t) ?? 1) - 1;
            indegree.set(t, d);
            if (d === 0)
                queue.push(t);
        }
    }
    return { layer, backEdges, unlayerable: processed < diagram.nodes.length };
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
export function clipAtRect(points, rect, side) {
    if (points.length < 2)
        return [...points];
    const seq = side === 'end' ? [...points] : [...points].reverse();
    let k = -1;
    for (let i = 0; i < seq.length; i++) {
        if (!insideRect(seq[i], rect))
            k = i;
    }
    if (k < 0 || k + 1 >= seq.length)
        return [...points];
    const hit = segmentEntryPoint(seq[k], seq[k + 1], rect);
    if (hit === null)
        return [...points];
    const trimmedSeq = [...seq.slice(0, k + 1), hit];
    return side === 'end' ? trimmedSeq : trimmedSeq.reverse();
}
function insideRect(p, r) {
    return p.x > r.x && p.x < rectRight(r) && p.y > r.y && p.y < rectBottom(r);
}
/** 线段 a→b 首次进入矩形内部的点；不进入返回 null。 */
function segmentEntryPoint(a, b, r) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // 轴向线段（正交走线只有这两种）：直接解交点
    if (Math.abs(dy) < 0.001) {
        const y = a.y;
        if (y <= r.y || y >= rectBottom(r))
            return null;
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        if (hi <= r.x || lo >= rectRight(r))
            return null;
        const x = dx > 0 ? Math.max(lo, r.x) : Math.min(hi, rectRight(r));
        return { x: r3(x), y: r3(y) };
    }
    if (Math.abs(dx) < 0.001) {
        const x = a.x;
        if (x <= r.x || x >= rectRight(r))
            return null;
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        if (hi <= r.y || lo >= rectBottom(r))
            return null;
        const y = dy > 0 ? Math.max(lo, r.y) : Math.min(hi, rectBottom(r));
        return { x: r3(x), y: r3(y) };
    }
    return null;
}
//# sourceMappingURL=layout.js.map