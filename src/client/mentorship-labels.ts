/**
 * ConvFusion — 【指导中】的**进展文案**取值规则（纯函数，界面与自检共用）
 *
 * ## 为什么单独一个模块
 *
 * 这段规则曾经把**方向 A 的两侧配反**（用户 2026-10 实测）：学生会看到
 * 「我已指导」（那是导师的第一人称），导师反而看到「导师已指导」（那是给学生的第三人称）。
 * 抽成不依赖 React 的纯函数之后，自检可以把四种（方向 × 视角）组合逐一钉住 ——
 * 这类"视角配反"的 bug 靠读代码或正则都看不出来。
 *
 * ## 规则（2026-11 用户口径）
 *
 * 「无论选题是谁发布的，都是**导师指导学生**的关系」——所以：
 *
 * | 视角 | 说谁 | 已交付 | 未交付 |
 * |---|---|---|---|
 * | **导师**（两个方向一致） | **我** | `iGuided`「我已指导」 | `iToGuide`「待我指导」 |
 * | 学生 · 方向 A（我是 owner） | 对方（导师） | `mentorGuided` | `awaitingMentor` |
 * | 学生 · 方向 B（我是非 owner） | 我 | `iDelivered`「我已交付」 | `iToDeliver` |
 *
 * **导师在方向 B 里是 owner**，他的上传落在 owner 侧 —— `reviewFiles` 数的是非 owner 侧
 * （学生那一份），拿它判"导师指导过没有"永远为假。所以导师的"已指导"按方向分两个判据：
 *
 * - 方向 A（导师 = 非 owner）：`reviewFiles > 0`（非 owner 侧就是他的指导产物）；
 * - 方向 B（导师 = owner）：`workspaceUpdatedAt > createdAt` —— **立约之后**他在自己那一侧
 *   上传过（选题发布早于提案，所以初始发布不会误判成"已指导"）。
 *
 * ⚠️ 本模块**自包含、不 import 任何东西**：客户端 `tsconfig.client.json` 把 `rootDir`
 * 钉在 `src/client`，一旦 import 宿主的模块就会把 node 内置模块拖进来而报错。
 */

/** 交付方向（与宿主 `ProjectDirection` 同构）。 */
export type MentorshipDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT'

/** 我在关系里的角色（与 `MentorshipView.myRole` 同构）。 */
export type ProgressRole = 'mentor' | 'researcher'

/** 取值只需要这几样（不依赖完整的提案对象，便于自检直接构造）。 */
export interface ProgressProposalLike {
  status: string
  direction: MentorshipDirection
  /** 非 owner 那一侧的文件数（服务器口径）；`null`/缺省 = 查不到。 */
  reviewFiles?: number | null
  /** **owner 侧**最后一次上传时间（方向 B 里导师的交付信号，服务器 `workspace_updated_at`）。 */
  workspaceUpdatedAt?: string | null
  /** 提案创建时间（判"立约之后有没有上传"的基准）。 */
  createdAt?: string | null
}

/** 视角：我是 owner 吗 + 我是导师还是学生。 */
export interface ProgressViewerLike {
  iAmOwner: boolean
  /**
   * 我在这条关系里的角色。缺省时退回旧行为（按 owner 说话）—— 老调用方不会因此错位，
   * 但新代码应当传它（导师视角在两个方向上一致，靠的就是这一项）。
   */
  myRole?: ProgressRole
}

/** **导师**在方向 B 里"立约之后上传过"吗（`workspace_updated_at` 晚于提案创建时间）。 */
export function mentorUploadedAfterProposal(proposal: ProgressProposalLike): boolean {
  const at = proposal.workspaceUpdatedAt
  const since = proposal.createdAt
  if (typeof at !== 'string' || typeof since !== 'string') return false
  const uploaded = Date.parse(at)
  const created = Date.parse(since)
  return Number.isFinite(uploaded) && Number.isFinite(created) && uploaded > created
}

/**
 * `ACCEPTED` 之后的进展文案 key；**非 `ACCEPTED` → `null`**（调用方用状态名，
 * 那是另一套文案，混在一起就分不清"流程没开始"与"交付到哪一步"）。
 */
export function acceptedProgressKey(
  proposal: ProgressProposalLike,
  viewer: ProgressViewerLike,
): string | null {
  if (proposal.status !== 'ACCEPTED') return null
  const prefix = 'community.mentor.progress.'
  /** 非 owner 侧有文件（方向 A = 导师的指导产物；方向 B = 学生的交付）。 */
  const nonOwnerDelivered = typeof proposal.reviewFiles === 'number' && proposal.reviewFiles > 0

  // ① 导师视角：两个方向都说"我"，判据按方向换（见文件头）
  if (viewer.myRole === 'mentor') {
    const guided =
      proposal.direction === 'SEEK_MENTOR' ? nonOwnerDelivered : mentorUploadedAfterProposal(proposal)
    return prefix + (guided ? 'iGuided' : 'iToGuide')
  }

  // ② 学生视角
  if (proposal.direction === 'SEEK_MENTOR') {
    // 方向 A：我是 owner，说**对方**（导师）
    return prefix + (nonOwnerDelivered ? 'mentorGuided' : 'awaitingMentor')
  }
  // 方向 B：我是非 owner，说**我**（我的研究进展 = 非 owner 侧）
  return prefix + (nonOwnerDelivered ? 'iDelivered' : 'iToDeliver')
}
