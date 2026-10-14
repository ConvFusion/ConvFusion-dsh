/**
 * 「同步下载的研究工作区」在**客户端**只做两件事：
 *
 *   1. 拼**一行命令** `/research sync @<zip>`（用户不必再往输入框里塞几十行提示词）；
 *   2. 判定 → 面板上"接下来会发生什么"那一句（i18n `community.merge.plan.<状态>`）。
 *
 * ## 流程搬去哪了
 *
 * 这里原本有一整套五态提示词模板（第 1 步只读盘查 → 停 → 融合 / 备份后换根 / 先判断），
 * 2026-10 用户拍板：**固定流程写成技能** `skills/sync.md`，命令只传**本次参数**
 * （哪个 zip、哪个研究根、判成什么、两端标识），agent 按需加载技能执行。
 *
 * 所以那段文字**不该留在客户端**：它需要的参数（服务器标识、本机标识、判定）都在宿主侧，
 * 由 `/research sync` 现场收集（见 `research/sync-request.ts`）。客户端只负责让用户少打字。
 *
 * 方案与依据见 `dev-notes/v0.5.9-sync-skill.md`。
 */

/** 同步的判定（与 `judgeWorkspace` 的结果一一对应，`missing` 归到 `new`）。 */
export type MergeState = 'new' | 'same' | 'other' | 'unknown' | 'unverifiable'

/**
 * 一行命令：`/research sync @<zip>`。
 *
 * 引用形式照抄 DSH `@` 引用的 clipboardText 投影：**含空白时写成 `@"…"`**
 * （`dsh-client-ui-reference` 的 `openReference` 就是这么反解的
 * `ref.startsWith('@"') ? ref.slice(2, -1) : ref.slice(1)`）——
 * 否则路径里的空格会把参数切断，命令会以为用户只给了前半段。
 */
export function syncCommandLine(zipPath: string): string {
  const path = zipPath.trim()
  const ref = /\s/.test(path) ? `@"${path}"` : `@${path}`
  return `/research sync ${ref}`
}
