/**
 * ConvFusion — Diagram SVG 渲染（v0.5.5 / C08P07）
 *
 * 这是整条链路里**唯一**把几何变成图形的地方，也是唯一碰 SVG 的地方。
 * Agent 永远不写 SVG（dev-note §2 / §33）。
 *
 * 三条硬约束：
 *
 * 1. **确定性**：同一个 IR 渲染 N 次得到逐字节相同的 SVG。没有时间戳、没有随机数、
 *    没有 Map 迭代顺序依赖（只用数组与按声明顺序插入的 Map）、所有数字 `r3` 取整。
 * 2. **自包含**：不引用外部字体文件、图片或 CSS。字体用系统字体栈，样式用展示属性
 *    （presentation attributes）而不是 `<style>` —— 后者在部分 SVG→PDF 转换器里会被丢。
 * 3. **不改输入**：`layoutDiagram` 的结果只读使用；渲染不产生隐藏状态。
 */
import { EDGE_TYPES } from './types.js';
import { FONT_FAMILY, FONT_SIZE, LAYOUT } from './styles.js';
import { edgeStyle, nodeStyle } from './styles.js';
import { escapeXml, measureText, polylineToPath, r3 } from './geometry.js';
/** 渲染成 SVG 字符串。 */
export function renderSvg(diagram, layout) {
    const parts = [];
    const usedEdgeTypes = new Set(layout.edges.map((e) => e.type));
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" ` +
        `viewBox="0 0 ${layout.width} ${layout.height}" role="img" ` +
        `data-cf-diagram-type="${escapeXml(diagram.type)}">`);
    parts.push(`<title>${escapeXml(layout.title ?? diagram.type)}</title>`);
    parts.push(`<desc>${escapeXml(`${diagram.type} diagram with ${layout.nodes.length} nodes and ${layout.edges.length} edges (Diagram IR v${diagram.version}).`)}</desc>`);
    /* ── 箭头 marker：只为真正用到的边类型生成 ─────────────────────── */
    const markers = [];
    for (const type of EDGE_TYPES) {
        if (!usedEdgeTypes.has(type))
            continue;
        const st = edgeStyle(type);
        if (st.arrow <= 0)
            continue;
        const a = st.arrow;
        markers.push(`<marker id="cf-arrow-${type}" viewBox="0 0 ${a} ${a}" refX="${r3(a - 1)}" refY="${r3(a / 2)}" ` +
            `markerWidth="${a}" markerHeight="${a}" markerUnits="userSpaceOnUse" orient="auto">` +
            `<path d="M 0 0 L ${a} ${r3(a / 2)} L 0 ${a} z" fill="${st.stroke}"/></marker>`);
    }
    if (markers.length > 0)
        parts.push(`<defs>${markers.join('')}</defs>`);
    /* ── 生命线（时序图；在节点与边之下）───────────────────────────── */
    for (const lifeline of layout.lifelines ?? []) {
        parts.push(`<line class="cf-lifeline" data-cf-id="${escapeXml(lifeline.nodeId)}" x1="${r3(lifeline.x)}" y1="${r3(lifeline.y0)}" ` +
            `x2="${r3(lifeline.x)}" y2="${r3(lifeline.y1)}" stroke="#A0AEC0" stroke-width="1" stroke-dasharray="5 4"/>`);
    }
    /* ── 状态机的初始态标记（`input` 节点左侧的实心圆 + 短箭头）──────── */
    if (diagram.type === 'lifecycle') {
        for (const node of layout.nodes) {
            if (node.type !== 'input')
                continue;
            const cy = r3(node.rect.y + node.rect.h / 2);
            const cx = r3(node.rect.x - 26);
            parts.push(`<g class="cf-initial-state" data-cf-id="${escapeXml(node.id)}">` +
                `<circle cx="${cx}" cy="${cy}" r="6" fill="#1A202C"/>` +
                `<line x1="${r3(cx + 6)}" y1="${cy}" x2="${r3(node.rect.x - 2)}" y2="${cy}" stroke="#1A202C" stroke-width="1.2" marker-end="url(#cf-arrow-control-flow)"/>` +
                `</g>`);
        }
        for (const node of layout.nodes) {
            if (node.type !== 'output')
                continue;
            // 终态：外圈一个细环（UML 记法）
            parts.push(`<circle class="cf-final-state" data-cf-id="${escapeXml(node.id)}" cx="${r3(node.rect.x + node.rect.w / 2)}" ` +
                `cy="${r3(node.rect.y + node.rect.h / 2)}" r="${r3(Math.min(node.rect.w, node.rect.h) / 2 + 5)}" fill="none" stroke="#1A202C" stroke-width="1.2"/>`);
        }
    }
    /* ── group 容器（在节点与边之下）───────────────────────────────── */
    for (const group of layout.groups) {
        const st = nodeStyle(group.style);
        parts.push(`<g class="cf-group" data-cf-id="${escapeXml(group.id)}">` +
            `<rect x="${r3(group.rect.x)}" y="${r3(group.rect.y)}" width="${r3(group.rect.w)}" height="${r3(group.rect.h)}" ` +
            `rx="${st.rx}" fill="${st.fill === 'none' ? 'none' : st.fill}" fill-opacity="0.5" stroke="${st.stroke}" ` +
            `stroke-width="${st.strokeWidth}"${st.dash !== undefined ? ` stroke-dasharray="${st.dash}"` : ''}/>` +
            `<text x="${r3(group.rect.x + 8)}" y="${r3(group.rect.y + 14)}" font-family="${FONT_FAMILY}" ` +
            `font-size="${FONT_SIZE.groupLabel}" font-weight="600" fill="${st.text}">${escapeXml(group.refText !== undefined ? `${group.label} ${group.refText}` : group.label)}</text>` +
            `</g>`);
    }
    /* ── 边 ────────────────────────────────────────────────────────── */
    for (const edge of layout.edges) {
        parts.push(renderEdge(edge));
    }
    /* ── 节点 ──────────────────────────────────────────────────────── */
    for (const node of layout.nodes) {
        parts.push(renderNode(node, diagram.type === 'lifecycle'));
    }
    /* ── 卡片栏（流程之外）─────────────────────────────────────────── */
    for (const card of layout.cards) {
        parts.push(renderCard(card));
    }
    /* ── 独立 label ────────────────────────────────────────────────── */
    for (const label of layout.labels) {
        parts.push(`<text class="cf-label" data-cf-id="${escapeXml(label.id)}" x="${r3(label.x)}" y="${r3(label.y)}" ` +
            `text-anchor="${label.anchor}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE.freeLabel}" ` +
            `fill="#2D3748">${escapeXml(label.text)}</text>`);
    }
    /* ── 标题 ──────────────────────────────────────────────────────── */
    if (layout.title !== undefined) {
        parts.push(`<text class="cf-title" x="${r3(layout.titleX)}" y="${r3(layout.titleY)}" font-family="${FONT_FAMILY}" ` +
            `font-size="${FONT_SIZE.title}" font-weight="600" fill="#1A202C">${escapeXml(layout.title)}</text>`);
    }
    parts.push('</svg>');
    return `${parts.join('\n')}\n`;
}
/* ════════════════════════════════════════════════════════════════════════
 * 单个元素
 * ════════════════════════════════════════════════════════════════════════ */
function renderNode(node, lifeCycle = false) {
    const st = nodeStyle(node.style);
    // 状态机的"状态"用更圆的圆角，与流程图的"步骤"在观感上区分开
    const rx = lifeCycle ? Math.min(node.rect.h / 2, 14) : st.rx;
    const cx = node.rect.x + node.rect.w / 2;
    const lineH = FONT_SIZE.nodeLabel * 1.32;
    const descLineH = FONT_SIZE.nodeDescription * 1.32;
    const descGap = node.descriptionLines.length > 0 ? 4 : 0;
    const refLineH = FONT_SIZE.nodeRef * 1.32;
    const refGap = node.refLines.length > 0 ? 3 : 0;
    const blockH = node.labelLines.length * lineH + descGap + node.descriptionLines.length * descLineH + refGap + node.refLines.length * refLineH;
    let baseline = node.rect.y + (node.rect.h - blockH) / 2 + FONT_SIZE.nodeLabel * 0.82;
    const spans = [];
    for (const line of node.labelLines) {
        spans.push(`<tspan x="${r3(cx)}" y="${r3(baseline)}">${escapeXml(line)}</tspan>`);
        baseline += lineH;
    }
    if (node.descriptionLines.length > 0) {
        baseline += descGap - lineH + FONT_SIZE.nodeDescription * 0.82;
        for (const line of node.descriptionLines) {
            spans.push(`<tspan x="${r3(cx)}" y="${r3(baseline)}" font-size="${FONT_SIZE.nodeDescription}" fill="#4A5568">${escapeXml(line)}</tspan>`);
            baseline += descLineH;
        }
    }
    if (node.refLines.length > 0) {
        baseline += refGap - descLineH + FONT_SIZE.nodeRef * 0.82;
        for (const line of node.refLines) {
            spans.push(`<tspan x="${r3(cx)}" y="${r3(baseline)}" font-size="${FONT_SIZE.nodeRef}" fill="#718096">${escapeXml(line)}</tspan>`);
            baseline += refLineH;
        }
    }
    return (`<g class="cf-node cf-node--${node.style}" data-cf-id="${escapeXml(node.id)}" data-cf-node-type="${node.type}">` +
        `<rect x="${r3(node.rect.x)}" y="${r3(node.rect.y)}" width="${r3(node.rect.w)}" height="${r3(node.rect.h)}" ` +
        `rx="${st.rx}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"/>` +
        `<text x="${r3(cx)}" y="${r3(node.rect.y)}" text-anchor="middle" font-family="${FONT_FAMILY}" ` +
        `font-size="${FONT_SIZE.nodeLabel}" fill="${st.text}">${spans.join('')}</text>` +
        `</g>`);
}
/**
 * 卡片：流程之外的一段文字（标题 / 正文 / 引用）。
 * 见 `DiagramCard` —— 想多表达观点时加卡片，而不是加边。
 */
function renderCard(card) {
    const x = card.rect.x;
    const y = card.rect.y;
    const w = card.rect.w;
    const h = card.rect.h;
    const textX = x + LAYOUT.cardPaddingX;
    const lineH = FONT_SIZE.cardTitle * 1.32;
    const bodyLineH = FONT_SIZE.cardBody * 1.32;
    let baseline = y + LAYOUT.cardPaddingY + FONT_SIZE.cardTitle * 0.82;
    const parts = [];
    for (const line of card.titleLines) {
        parts.push(`<text x="${r3(textX)}" y="${r3(baseline)}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE.cardTitle}" font-weight="600" fill="#1A202C">${escapeXml(line)}</text>`);
        baseline += lineH;
    }
    if (card.bodyLines.length > 0) {
        baseline += 4 - lineH + FONT_SIZE.cardBody * 0.82;
        for (const line of card.bodyLines) {
            parts.push(`<text x="${r3(textX)}" y="${r3(baseline)}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE.cardBody}" fill="#4A5568">${escapeXml(line)}</text>`);
            baseline += bodyLineH;
        }
    }
    if (card.refText !== undefined) {
        baseline += 4 - bodyLineH + FONT_SIZE.nodeRef * 0.82;
        parts.push(`<text x="${r3(textX)}" y="${r3(baseline)}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE.nodeRef}" fill="#718096">${escapeXml(card.refText)}</text>`);
    }
    return (`<g class="cf-card" data-cf-id="${escapeXml(card.id)}">` +
        `<rect x="${r3(x)}" y="${r3(y)}" width="${r3(w)}" height="${r3(h)}" rx="6" fill="#F7FAFC" stroke="#CBD5E0" stroke-width="1" stroke-dasharray="4 3"/>` +
        parts.join('') +
        `</g>`);
}
function renderEdge(edge) {
    const st = edgeStyle(edge.type);
    const path = polylineToPath(edge.points);
    const marker = st.arrow > 0 ? ` marker-end="url(#cf-arrow-${edge.type})"` : '';
    const parts = [
        `<path class="cf-edge cf-edge--${edge.type}" data-cf-id="${escapeXml(edge.id)}" data-cf-source="${escapeXml(edge.declaredSource)}" ` +
            `data-cf-target="${escapeXml(edge.declaredTarget)}" d="${path}" fill="none" stroke="${st.stroke}" ` +
            `stroke-width="${st.strokeWidth}" stroke-linejoin="round"${st.dash !== undefined ? ` stroke-dasharray="${st.dash}"` : ''}${marker}/>`,
    ];
    if (edge.label !== undefined && edge.labelPos !== undefined) {
        parts.push(renderEdgeLabel(edge.label, edge.labelPos, edge.labelAnchor));
    }
    return `<g class="cf-edge-group">${parts.join('')}</g>`;
}
/**
 * 边标签 + 一块底色。
 *
 * 为什么必须加底色：论文图里最容易出的视觉缺陷就是"箭头/线条从文字中间穿过去"。
 * 一块与画布同色的底把线段挡住，比让读者去猜那行字是什么要好得多。
 */
function renderEdgeLabel(text, pos, anchor) {
    const width = measureText(text, FONT_SIZE.edgeLabel);
    const x0 = anchor === 'middle' ? pos.x - width / 2 : pos.x;
    const bg = `<rect x="${r3(x0 - 3)}" y="${r3(pos.y - FONT_SIZE.edgeLabel)}" width="${r3(width + 6)}" ` +
        `height="${r3(FONT_SIZE.edgeLabel * 1.3)}" fill="#FFFFFF" fill-opacity="0.88" stroke="none"/>`;
    const label = `<text x="${r3(anchor === 'middle' ? pos.x : pos.x)}" y="${r3(pos.y)}" text-anchor="${anchor}" ` +
        `font-family="${FONT_FAMILY}" font-size="${FONT_SIZE.edgeLabel}" fill="#2D3748">${escapeXml(text)}</text>`;
    return `${bg}${label}`;
}
/** 供工具层做 PNG/PDF 导出时复用的几何（第一阶段不导出，仅暴露给测试）。 */
export function edgePathBounds(edge) {
    const xs = edge.points.map((p) => p.x);
    const ys = edge.points.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
//# sourceMappingURL=render.js.map