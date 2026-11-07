/**
 * ConvFusion 2.0 — 决策辅助的注入提示（v0.7.0）
 *
 * 为什么是"注入段"而不是 `skills/` 里的一条技能：
 * 「什么时候调 DCRM、怎么报采纳」是**宿主行为**，随插件配置（开关）与那台服务器是否可用
 * 变化；而 `skills/` 是对所有用户成立的**研究方法**（见 `AGENTS.local.md` 的分层约定）。
 * 而且这一段要**每轮重新求值**（开关可以在会话中途被关掉），因此它挂在
 * `systemPrompt.context()` 的动态段上，而不是稳定段 `RESEARCH_GUIDE_TEXT` 里。
 *
 * 正文用英文（与其它注入段一致，模型侧更省 token），但**标签用中文**：
 * 用户看的是聊天区，`**DCRM 决策辅助**` 是这个功能唯一的可见锚点。
 */

/** 一次咨询里"要做什么 / 不要做什么"的七条纪律。 */
const DISCIPLINE = [
  '- Consult **before** the decision, then report the recommendation and state whether you adopt, partially adopt or reject it, with a short reason grounded in the actual state/evidence.',
  '- Use a standalone bold **DCRM 决策辅助** label in your progress commentary (in the user\'s language), and summarize its actual role in the final task summary. If it was disabled, skipped, unavailable or irrelevant, say so instead of claiming participation.',
  '- A `skipped` result never counts as advice. `cached: true` / `shared_request: true` mean an existing result was reused, not that a new inference was requested.',
  '- `truncated_fields` means the advice saw a clipped research state: inspect the original before acting on it.',
  '- Consultations are read-only: they never write decisions, evidence, claims or research state, and they are allowed even when workspace writes are prohibited. Saving research outcomes with the normal tools is separate and optional.',
  '- When writes are permitted, record the adoption with `research_decision_assist` action `annotate` (id + adoption + reason), so the trace exists under `research/decision-assists/`.',
  '- Probabilities are candidate-normalized **uncalibrated** scores, not confidence: never evidence, never permission, never a replacement for review.',
].join('\n')

/**
 * 渲染注入段。`enabled` 取自**本次上下文组装时**的配置（不是会话开始时的快照）——
 * 设置页关掉开关后，下一轮就按关闭口径说话。
 */
export function decisionAssistGuidance(enabled: boolean): string {
  const preference = enabled
    ? 'DCRM decision assistance is **enabled** at this refresh. Consult `research_decision_assist` before ' +
      'selecting the next research action (`C1_next_action_selection`), judging evidence sufficiency ' +
      '(`B1_evidence_sufficiency`), judging claim/evidence consistency (`B2_claim_evidence_consistency`), or ' +
      'changing the research direction (`D1_direction_decision`) — including read-only/chat-only tasks. ' +
      'Ordinary reading, formatting and downloads do not need it, and one unchanged decision needs one consultation.'
    : 'DCRM decision assistance is **disabled** at this refresh. Continue the normal workflow without ' +
      'consulting it, unless the user explicitly asks to test the disabled behavior.'
  return ['## Decision assistance (DCRM)', '', preference, '', DISCIPLINE].join('\n')
}
