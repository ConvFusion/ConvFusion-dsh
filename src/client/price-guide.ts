/**
 * ConvFusion 2.0 — **挂牌价**的界面逻辑（纯函数，无 React）
 *
 * ## 这一步在做什么
 *
 * 导师「出题」（`SEEK_STUDENT`）时要在发题的那一刻标价（服务器
 * `research_projects.asking_fee`）。价目参考来自服务器
 * `GET /mentorship/price-guide`，**客户端不自带价目表**：写死价目的界面在平台调价那天会
 * 撒谎，而且是没人会立刻发现的那种（服务器文档 `payment-system.md` §3.2.6 明确要求）。
 *
 * ## 三件事
 *
 * 1. {@link priceOptionsOf} —— 把服务器的档位整理成下拉选项：**按价格升序**（500 入门档在前）、
 *    去掉重复价（不同等级同价时只留一条）、并保留服务器给的 `label`（"JCR 4区 / CCF-C"）。
 * 2. {@link normalizePrice} —— 用户输入 → `number | null`：只接受**整数**（服务器是 `int`），
 *    空串 / 非数字 / 0 / 负数 / 超过上限 → `null`（交给 {@link validatePrice} 说清原因）。
 * 3. {@link validatePrice} —— 能不能发：`>= minAllowed`（服务器硬下限 1，**不支持免费**）、
 *    不超过服务器上限（1000000）、必须是整数。
 *
 * ## 为什么"挂牌价"不是成交价
 *
 * 服务器把它做成**信息**而不是锁：导师开价 800、学生出 500、导师接受 500 依然成立，
 * 成交价仍是提案上的 `total_fee`。所以界面上只说"挂牌价"，不写"定价 / 一口价"。
 */

/** 服务器 `GET /mentorship/price-guide` 的镜像（宿主已把 snake_case 归一成 camelCase）。 */
export interface PriceGuideLike {
  /** 硬下限（服务器 `min_allowed`，当前为 1 —— 免费不支持）。 */
  minAllowed: number
  /** 推荐区间（服务器 `recommended_min` / `recommended_max`）。 */
  recommendedMin: number
  recommendedMax: number
  /** 1 Token 合多少分（服务器 `token_value_fen`，当前 1000 = ¥10）。 */
  tokenValueFen: number
  /** 全档价目（服务器的 `tiers`）。 */
  tiers: Array<{ jcrLevel: number; ccfLevel: string | null; label: string; tokens: number }>
}

/** 下拉里的一档。 */
export interface PriceOption {
  tokens: number
  /** 服务器给的档位名（"JCR 4区 / CCF-C"）；自定义档为空串。 */
  label: string
}

/** 服务器允许的最大挂牌价（与 `ResearchProjectCreate.asking_fee` 的 `maximum` 一致）。 */
export const MAX_ASKING_FEE = 1_000_000

/**
 * 价目参考 → 下拉选项（**按价格升序**、同价去重）。
 *
 * 为什么升序：用户的直觉是"入门档在最上面"（500 入门 / 1000 顶级），而服务器的 `tiers`
 * 是**等级降序**（1区首）。界面从便宜到贵排，选完顺手就往下看。
 *
 * @param guide - 服务器给的价目参考（`null` = 旧服务器 / 取不到 → 没有预设档位）
 * @returns 下拉选项；没有参考时为空数组（界面退化成"直接填价格"）
 */
export function priceOptionsOf(guide: PriceGuideLike | null | undefined): PriceOption[] {
  if (!guide || !Array.isArray(guide.tiers)) return []
  const seen = new Set<number>()
  const out: PriceOption[] = []
  for (const tier of [...guide.tiers].sort((a, b) => a.tokens - b.tokens)) {
    const tokens = Math.trunc(Number(tier.tokens))
    if (!Number.isFinite(tokens) || tokens < 1 || seen.has(tokens)) continue
    seen.add(tokens)
    out.push({ tokens, label: String(tier.label ?? '') })
  }
  return out
}

/**
 * 默认档位：价目参考里**最便宜**的那一档（用户 2026-10 的排序以 500 入门档起）。
 *
 * @returns 默认价格；没有参考 → `undefined`（界面不预设，让导师自己填）
 */
export function defaultPriceOf(guide: PriceGuideLike | null | undefined): number | undefined {
  return priceOptionsOf(guide)[0]?.tokens
}

/**
 * 用户输入 → 数字（不合法 → `null`）。
 *
 * 服务器字段是 **int**，所以小数一律拒绝（`12.5` 不悄悄四舍五入成 12 —— 那是替用户
 * 改了他填的数）。`null` 与"没填"在语义上都表示"这一项不合法/没有值"，
 * 具体原因由 {@link validatePrice} 说。
 */
export function normalizePrice(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') {
    return Number.isInteger(input) && input > 0 ? input : null
  }
  const text = String(input ?? '').trim()
  if (!text) return null
  if (!/^\d+$/.test(text)) return null
  const n = Number(text)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * 这个价格能不能发（`null` = 可以；否则返回 i18n key）。
 *
 * @param tokens - 已经 {@link normalizePrice} 过的值（`null` = 用户没填 / 填错）
 * @param guide - 价目参考（`null` 时只按服务器硬约束检查）
 * @returns 错误文案的 i18n key，或 `null`
 */
export function validatePrice(
  tokens: number | null,
  guide: PriceGuideLike | null | undefined,
): 'empty' | 'tooHigh' | null {
  if (tokens === null) return 'empty'
  if (tokens > MAX_ASKING_FEE) return 'tooHigh'
  // `minAllowed` 由服务器给（当前 1）；旧服务器没有参考 → 按 1 兜底，和服务器的 CHECK 一致
  const min = guide && Number.isFinite(guide.minAllowed) ? Math.trunc(guide.minAllowed) : 1
  if (tokens < Math.max(1, min)) return 'empty'
  return null
}

/**
 * Token → 人民币（服务器给 `token_value_fen` = 1 Token 多少分）。
 *
 * @returns 形如 `¥5,000`；没有汇率（旧服务器）→ `null`（界面就不显示这一句）
 */
export function formatTokenYuan(
  tokens: number | null,
  tokenValueFen: number | null | undefined,
): string | null {
  if (tokens === null || typeof tokenValueFen !== 'number' || !Number.isFinite(tokenValueFen)) return null
  const fen = tokens * tokenValueFen
  const yuan = fen / 100
  const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)
  // 千分位：¥5,000 / ¥12,500（中文与英文界面都用同一种写法，数字对齐更好读）
  const grouped = text.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `¥${grouped}`
}
