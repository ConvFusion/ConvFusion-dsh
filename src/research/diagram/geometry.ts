/**
 * ConvFusion — Diagram 几何与文本度量（v0.5.5 / C08P07）
 *
 * 这里刻意**不引入字体库**：论文配图只需要"够准"的度量来做换行与画布尺寸，
 * 不需要像素级一致的排版。用一张确定性的字宽表，代价是 SVG 里文字宽度与
 * 浏览器实测有百分之几的差，收益是渲染**完全确定、无外部依赖、可离线**。
 *
 * 所有对外导出的数值都经过 {@link r3} 取整，因此同一个 IR 反复渲染得到**逐字节相同**
 * 的 SVG（dev-note §40 Test 7）。
 */

/* ════════════════════════════════════════════════════════════════════════
 * 数值
 * ════════════════════════════════════════════════════════════════════════ */

/** 取 3 位小数：抹掉浮点噪声，是"相同 IR ⇒ 相同 SVG"的前提。 */
export function r3(n: number): number {
  const v = Math.round(n * 1000) / 1000
  return Object.is(v, -0) ? 0 : v
}

/* ════════════════════════════════════════════════════════════════════════
 * 矩形
 * ════════════════════════════════════════════════════════════════════════ */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export function rectRight(r: Rect): number {
  return r.x + r.w
}

export function rectBottom(r: Rect): number {
  return r.y + r.h
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** 两个矩形是否**内部**相交（只贴边不算，避免 1px 相切被误判重叠）。 */
export function rectsOverlap(a: Rect, b: Rect, slack = 0.5): boolean {
  return (
    a.x + slack < rectRight(b) &&
    b.x + slack < rectRight(a) &&
    a.y + slack < rectBottom(b) &&
    b.y + slack < rectBottom(a)
  )
}

/** 点是否落在矩形**内部**（同样只贴边不算）。 */
export function rectContainsPoint(r: Rect, p: Point, slack = 0.5): boolean {
  return p.x > r.x + slack && p.x < rectRight(r) - slack && p.y > r.y + slack && p.y < rectBottom(r) - slack
}

/** 把一组矩形并成外接矩形。 */
export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, rectRight(r))
    y2 = Math.max(y2, rectBottom(r))
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/* ════════════════════════════════════════════════════════════════════════
 * 线段 / 折线 vs 矩形
 * ════════════════════════════════════════════════════════════════════════ */

/** 线段是否穿过矩形内部（**轴对齐或任意**线段都支持，用 Liang–Barsky 裁剪）。 */
export function segmentIntersectsRect(a: Point, b: Point, r: Rect, slack = 0): boolean {
  const x1 = r.x + slack
  const y1 = r.y + slack
  const x2 = rectRight(r) - slack
  const y2 = rectBottom(r) - slack
  if (x2 <= x1 || y2 <= y1) return false

  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const p = [-dx, dx, -dy, dy]
  const q = [a.x - x1, x2 - a.x, a.y - y1, y2 - a.y]
  for (let i = 0; i < 4; i++) {
    const pi = p[i] as number
    const qi = q[i] as number
    if (pi === 0) {
      if (qi < 0) return false
      continue
    }
    const t = qi / pi
    if (pi < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return true
}

/** 折线（≥2 点）是否穿过矩形内部。 */
export function polylineIntersectsRect(points: readonly Point[], r: Rect, slack = 0): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    if (segmentIntersectsRect(a, b, r, slack)) return true
  }
  return false
}

/** 折线总长度（用于挑最长的段放边标签）。 */
export function polylineLength(points: readonly Point[]): number {
  let total = 0
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    total += Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
  }
  return total
}

/** 折线上最长一段的中点与走向（放边标签用）。 */
export function longestSegment(points: readonly Point[]): { mid: Point; horizontal: boolean; length: number } {
  let best = { mid: points[0] ?? { x: 0, y: 0 }, horizontal: true, length: -1 }
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (len > best.length) {
      best = {
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        horizontal: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y),
        length: len,
      }
    }
  }
  return best
}

/* ════════════════════════════════════════════════════════════════════════
 * 文本度量（确定性字宽表，单位 = px）
 * ════════════════════════════════════════════════════════════════════════ */

/** 窄字符。 */
const NARROW = new Set("iljtfr.,;:!|'`()[]{}<>/\\\"-".split(''))
/** 宽字符。 */
const WIDE = new Set('mwMW@%&'.split(''))

/**
 * 单字符视觉宽度（em）。
 *
 * 取值偏保守（略宽于多数无衬线体的实际值）：宁可把盒子算宽一点，也不要文字溢出
 * 盒子 —— 溢出是视觉校验要报的缺陷，而"盒子略宽"没有代价。
 */
export function charWidthEm(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  // CJK / 全角 / 常见符号区：按 1em 算
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 1
  }
  if (ch === ' ') return 0.28
  if (NARROW.has(ch)) return 0.3
  if (WIDE.has(ch)) return 0.9
  if (ch >= 'A' && ch <= 'Z') return 0.68
  if (ch >= '0' && ch <= '9') return 0.58
  if (ch >= 'a' && ch <= 'z') return 0.55
  return 0.6
}

/** 一行文本的视觉宽度（px）。 */
export function measureText(text: string, fontSize: number): number {
  let em = 0
  for (const ch of text) em += charWidthEm(ch)
  return em * fontSize
}

/**
 * 按**视觉宽度**换行。
 *
 * 规则：优先在空格处断；单个词比整行还宽时按字符硬断（否则长标识符会把盒子撑爆）；
 * 已有显式换行的 `\n` 永远保留（Agent 用它控制断行）。
 */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let current = ''
    const flush = (): void => {
      if (current) lines.push(current)
      current = ''
    }
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (measureText(candidate, fontSize) <= maxWidth || !current) {
        // 单词本身就超宽 → 硬断
        if (!current && measureText(word, fontSize) > maxWidth) {
          let chunk = ''
          for (const ch of word) {
            if (measureText(chunk + ch, fontSize) > maxWidth && chunk) {
              lines.push(chunk)
              chunk = ch
            } else {
              chunk += ch
            }
          }
          current = chunk
          continue
        }
        current = candidate
        continue
      }
      flush()
      current = word
    }
    flush()
  }
  return lines.length > 0 ? lines : ['']
}

/** 一组行的总高度。 */
export function textBlockHeight(lineCount: number, fontSize: number, lineHeightRatio: number): number {
  return lineCount > 0 ? fontSize * lineHeightRatio * lineCount : 0
}

/** 视觉宽度（CJK 记 2）——用于"标签过长"的判定。 */
export function visualLength(text: string): number {
  let n = 0
  for (const ch of text) n += charWidthEm(ch) >= 0.95 ? 2 : 1
  return n
}

/* ════════════════════════════════════════════════════════════════════════
 * SVG 片段
 * ════════════════════════════════════════════════════════════════════════ */

/** XML 文本转义（含引号：属性里也会用到）。 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 折线 → SVG path 的 `d`（只用直线段，正交走线天然如此）。 */
export function polylineToPath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  const [head, ...rest] = points as [Point, ...Point[]]
  const parts = [`M ${r3(head.x)} ${r3(head.y)}`]
  for (const p of rest) parts.push(`L ${r3(p.x)} ${r3(p.y)}`)
  return parts.join(' ')
}

/**
 * 去掉折线里**重复的相邻点**与共线的中间点。
 *
 * 为什么必须做：正交走线会产生 `(100,50) → (100,50)` 这样的零长度段，浏览器对
 * `orient="auto"` 的箭头在零长度段上行为未定义（箭头会消失或乱指）。
 */
export function simplifyPolyline(points: readonly Point[]): Point[] {
  const dedup: Point[] = []
  for (const p of points) {
    const last = dedup[dedup.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.001 && Math.abs(last.y - p.y) < 0.001) continue
    dedup.push({ x: r3(p.x), y: r3(p.y) })
  }
  const out: Point[] = []
  for (let i = 0; i < dedup.length; i++) {
    const prev = out[out.length - 1]
    const cur = dedup[i] as Point
    const next = dedup[i + 1]
    if (prev && next) {
      const collinear =
        (Math.abs(prev.x - cur.x) < 0.001 && Math.abs(cur.x - next.x) < 0.001) ||
        (Math.abs(prev.y - cur.y) < 0.001 && Math.abs(cur.y - next.y) < 0.001)
      if (collinear) continue
    }
    out.push(cur)
  }
  return out
}

/* ════════════════════════════════════════════════════════════════════════
 * 共线重叠（走线审计用）
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 两条**轴对齐**线段的共线重叠长度（不共线或不相交时返回 0）。
 *
 * 用途：两条边在同一条通道上叠着走时，读者看到的是一根线 —— 这是"连线错误"里
 * 最容易被当成画错的一类，必须在 diagnostics 里点名并给出**实测长度**。
 */
export function collinearOverlap(a1: Point, a2: Point, b1: Point, b2: Point): number {
  const aHoriz = Math.abs(a1.y - a2.y) < 0.5
  const aVert = Math.abs(a1.x - a2.x) < 0.5
  const bHoriz = Math.abs(b1.y - b2.y) < 0.5
  const bVert = Math.abs(b1.x - b2.x) < 0.5
  if (aHoriz && bHoriz && Math.abs(a1.y - b1.y) < 0.5) {
    const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x))
    const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
    return Math.max(0, hi - lo)
  }
  if (aVert && bVert && Math.abs(a1.x - b1.x) < 0.5) {
    const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y))
    const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
    return Math.max(0, hi - lo)
  }
  return 0
}
