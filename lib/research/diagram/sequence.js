/**
 * 时序图布局引擎（`type: "sequence"`）。
 *
 * ── 为什么它必须是**第二套布局**，而不是分层引擎的一个样式 ──
 * 分层引擎画的是"谁依赖谁"：节点按拓扑分层、边绕通道走。时序图画的是
 * "**谁在第几步对谁说了什么**"：横轴是参与者，纵轴是时间，消息是水平箭头。
 * 两者信息结构不同：分层图里"第几步"根本不存在，把它塞进分层引擎，只能得到一个
 * 像流程图的近似物（这正是 `sequence` 这个类型名过去的问题——有名字，没有对应渲染）。
 *
 * ── IR 契约（与分层模式共用同一套字段，不引入新概念）──
 *   · `nodes[]`     参与者，**声明顺序 = 从左到右的列序**
 *   · `edges[]`     消息，**声明顺序 = 从上到下的时序**
 *   · `edge.label`  消息内容；`edge.refs` 并入标签
 *   · `cards[]`     同分层模式：整块排在参与者列之外
 *   · `groups[]`    在时序图里没有意义 → `UNSUPPORTED_IN_MODE` 警告并忽略
 *
 * 全程纯函数、无随机：同样输入必然得到逐点相同的几何。
 */
import { rectBottom, rectRight, r3, unionRects, } from './geometry.js';
import { FONT_SIZE, LAYOUT } from './styles.js';
import { buildCardRow, measureNodeBox, } from './layout.js';
import { warning } from './types.js';
/**
 * 时序图布局。
 *
 * 返回的 `LayoutResult` 与分层引擎**同构**（nodes = 参与者头、edges = 消息），
 * 所以渲染器、卡片、导出、校验全都不用分叉；额外多出 `lifelines` 与 `messages`。
 */
export function layoutSequence(diagram, options = {}) {
    const diagnostics = [];
    const showDescriptions = options.showDescriptions ?? diagram.showDescriptions === true;
    const title = diagram.title;
    const titleBand = title !== undefined ? LAYOUT.titleBand : 0;
    if (diagram.groups.length > 0) {
        diagnostics.push(warning('UNSUPPORTED_IN_MODE', `This is a sequence diagram; ${diagram.groups.length} declared group(s) are ignored.`, undefined, 'Sequence diagrams have no containers — participants are columns. Drop the groups, or use `method-overview` / `architecture` if the grouping matters.'));
    }
    /* ── 1. 参与者头（横轴：声明顺序 = 列序）─────────────────────────── */
    const participants = diagram.nodes;
    const boxes = new Map();
    for (const node of participants)
        boxes.set(node.id, measureNodeBox(node, showDescriptions));
    const headerH = Math.max(...participants.map((n) => boxes.get(n.id).h));
    const colX = new Map();
    const headerRects = new Map();
    let cursorX = LAYOUT.canvasMargin;
    for (const node of participants) {
        const box = boxes.get(node.id);
        const w = box.w;
        headerRects.set(node.id, { x: r3(cursorX), y: r3(LAYOUT.canvasMargin + titleBand), w, h: r3(headerH) });
        colX.set(node.id, r3(cursorX + w / 2));
        cursorX += w + LAYOUT.sequenceColumnGap;
    }
    const columnsRight = cursorX - LAYOUT.sequenceColumnGap;
    /* ── 2. 消息（纵轴：声明顺序 = 时序）────────────────────────────── */
    const liftTop = r3(LAYOUT.canvasMargin + titleBand + headerH + LAYOUT.sequenceHeaderGap);
    const messages = [];
    const edges = [];
    let rowY = liftTop + LAYOUT.sequenceRowGap;
    for (const edge of diagram.edges) {
        const fromId = edge.source;
        const toId = edge.target;
        const fromX = colX.get(fromId);
        const toX = colX.get(toId);
        if (fromX === undefined || toX === undefined)
            continue; // 端点问题由 graphChecks 报
        const selfMessage = fromId === toId;
        const label = edge.refs !== undefined && edge.refs.length > 0
            ? `${edge.label ?? ''}${edge.label !== undefined ? ' ' : ''}[${edge.refs.join(' · ')}]`
            : edge.label;
        const y = r3(rowY);
        const points = selfMessage
            ? [
                { x: fromX, y },
                { x: r3(fromX + LAYOUT.sequenceSelfLoopW), y },
                { x: r3(fromX + LAYOUT.sequenceSelfLoopW), y: r3(y + LAYOUT.sequenceSelfLoopH) },
                { x: fromX, y: r3(y + LAYOUT.sequenceSelfLoopH) },
            ]
            : [
                { x: fromX, y },
                { x: toX, y },
            ];
        messages.push({
            id: edge.id,
            fromId,
            toId,
            y,
            ...(label !== undefined ? { label } : {}),
            selfMessage,
        });
        edges.push({
            id: edge.id,
            source: fromId,
            target: toId,
            declaredSource: edge.source,
            declaredTarget: edge.target,
            type: edge.type,
            ...(label !== undefined ? { label } : {}),
            points,
            ...(label !== undefined ? { labelPos: { x: r3((fromX + toX) / 2), y: r3(y - 6) } } : {}),
            labelAnchor: 'middle',
            crossesNode: false,
            detoured: false,
        });
        rowY += LAYOUT.sequenceRowGap;
    }
    const liftBottom = r3(messages.length > 0 ? rowY - LAYOUT.sequenceRowGap + LAYOUT.sequenceLifelineTail : liftTop + LAYOUT.sequenceLifelineTail);
    const lifelines = participants.map((n) => ({
        nodeId: n.id,
        x: colX.get(n.id),
        y0: liftTop,
        y1: liftBottom,
    }));
    /* ── 3. 卡片栏（参与者列之外）──────────────────────────────────── */
    const flowBounds = unionRects([
        ...headerRects.values(),
        { x: LAYOUT.canvasMargin, y: liftTop, w: Math.max(1, columnsRight - LAYOUT.canvasMargin), h: Math.max(1, liftBottom - liftTop) },
    ]) ?? { x: 0, y: 0, w: 0, h: 0 };
    // 时序图用**下方一行**而不是右侧竖栏（见 `buildCardRow` 的说明）
    const cards = buildCardRow(diagram.cards, flowBounds);
    /* ── 4. 出参 ───────────────────────────────────────────────────── */
    const nodes = participants.map((node) => {
        const box = boxes.get(node.id);
        const rect = headerRects.get(node.id);
        return {
            id: node.id,
            type: node.type,
            style: node.style,
            label: node.label,
            labelLines: box.labelLines,
            descriptionLines: box.descriptionLines,
            ...(box.refText !== undefined ? { refText: box.refText } : {}),
            refLines: box.refLines,
            rect,
            layer: 0,
            traced: node.evidence.length > 0 || (node.refs ?? []).length > 0,
        };
    });
    const contentW = Math.max(columnsRight, ...cards.map((c) => rectRight(c.rect)), LAYOUT.canvasMargin) + LAYOUT.canvasMargin;
    const contentH = Math.max(liftBottom, ...cards.map((c) => rectBottom(c.rect)), LAYOUT.canvasMargin) + LAYOUT.canvasMargin;
    const requestedW = diagram.canvas.width ?? 0;
    const requestedH = diagram.canvas.height ?? 0;
    if (requestedW > 0 && requestedW + 0.5 < contentW) {
        diagnostics.push(warning('CANVAS_TOO_SMALL', `Requested canvas width ${requestedW} is smaller than the content (${r3(contentW)}).`, undefined, 'Omit canvas to let the renderer size it, or raise the value.'));
    }
    if (requestedH > 0 && requestedH + 0.5 < contentH) {
        diagnostics.push(warning('CANVAS_TOO_SMALL', `Requested canvas height ${requestedH} is smaller than the content (${r3(contentH)}).`, undefined, 'Omit canvas to let the renderer size it, or raise the value.'));
    }
    return {
        width: r3(Math.max(requestedW, contentW)),
        height: r3(Math.max(requestedH, contentH)),
        ...(title !== undefined ? { title } : {}),
        titleX: LAYOUT.canvasMargin,
        titleY: LAYOUT.canvasMargin + FONT_SIZE.title,
        nodes,
        nodeById: new Map(nodes.map((n) => [n.id, n])),
        groups: [],
        groupById: new Map(),
        edges,
        labels: diagram.labels
            .filter((l) => colX.has(l.anchor))
            .map((l) => ({ id: l.id, text: l.text, x: colX.get(l.anchor), y: r3(liftBottom + 16), anchor: 'middle' })),
        cards,
        lifelines,
        messages,
        layerBands: [],
        diagnostics,
    };
}
//# sourceMappingURL=sequence.js.map