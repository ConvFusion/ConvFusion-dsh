/**
 * ConvFusion — 一条指导提案**在我眼里**是什么（方向 + 当事人 id 推出的派生量）
 *
 * ## 为什么单独一个模块
 *
 * 早先界面用一个 `incoming = (我是 researcher)` 同时表达了四件事：我要不要动作、
 * 我上传落在哪一侧、进展文案怎么称呼、谁的资料该给我看。**方向 B（导师出题）里
 * 这四件事不再一致** —— 项目 owner 是导师、发起人是学生、接受人是导师，
 * 继续用"我是不是 researcher"判断会在每一处都反过来。
 *
 * 所以统一在这里算清楚，其余地方只读这些派生量。**算错的代价是安静的**：界面不报错，
 * 只是把"冻我自己的钱"说成"冻学生的钱"、把该拦的人放过去 —— 这类"方向/视角配反"的 bug
 * 本仓库已经出过两次（进展文案、`iPayer`）。所以规则抽成纯函数，自检按
 * **方向 × 我的角色** 四格逐一钉住。
 *
 * ## 四格表（`myRole` 由"我的 id 是不是 `mentor.id`"定）
 *
 * | 派生量 | 方向 A `SEEK_MENTOR`（学生出题） | 方向 B `SEEK_STUDENT`（导师出题） |
 * |---|---|---|
 * | `iAmOwner`（服务器 `owner` 侧） | 我是学生 | 我是导师 |
 * | `mySide` | 学生 → `owner` | 导师 → `owner` |
 * | `iProposed` | 导师 | 学生 |
 * | `iAmAcceptor`（该我接受/拒绝） | 学生 | 导师 |
 * | `iAmPayer`（押金冻我的吗） | 学生 → **是** | 导师 → **否**（冻学生的） |
 *
 * ⚠️ **`iAmPayer` 不是 `!iAmOwner`**。两个方向的**接受人都是 owner**
 * （A 是学生接受、B 是导师接受），而押金**永远从学生（`researcher_id`）账上冻**
 * （服务器 `accept_proposal` 不变量：两个方向都是学生出钱）。
 * 于是 `!iAmOwner` 在**实际接受人**身上恒为 false —— 方向 A 的学生会被说成
 * "冻学生的钱"、而且拿不到"用自己的资金池提前拦住"这条保护。判据只能是
 * **我是不是学生**（`myRole === 'researcher'`）。
 *
 * ⚠️ 本模块**自包含、不 import 任何东西**：客户端 `tsconfig.client.json` 把 `rootDir`
 * 钉在 `src/client`，一旦 import 宿主的模块就会把 node 内置模块拖进来而报错。
 */

/** 交付方向（与宿主 `ProjectDirection` 同构）。 */
export type MentorshipDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT'

/** 我在这条关系里的角色（服务器侧：`mentor_id` 是不是我）。 */
export type ProposalRole = 'mentor' | 'researcher'

/** 文件侧（与宿主 `FileSide` / 服务器 `?source=` 同构）。 */
export type ProposalFileSide = 'owner' | 'mentor'

/** 取值只需要这四样（不依赖完整的提案对象，便于自检直接构造）。 */
export interface ProposalViewLike {
  direction: MentorshipDirection
  /** 导师的账号 id（提案 enrich 后内嵌；缺失 → `null`，此时角色按"我是研究者"兜底）。 */
  mentorId?: string | null
  /** 学生的账号 id（同上，目前只用于完整性，不参与判定）。 */
  researcherId?: string | null
  /** 谁发起的（服务器 `proposed_by_id`）；缺失 → 按方向推断。 */
  proposedById?: string | null
}

/** 派生量（界面只读这些，不再各处自己判方向）。 */
export interface MentorshipView {
  /** 我在这条关系里是导师还是研究者。 */
  myRole: ProposalRole
  /** 项目 owner 侧是不是我（服务器按"谁写的"分两侧，owner 侧 = 项目所有者写的）。 */
  iAmOwner: boolean
  /** 我上传时要与自己比对的那一侧（服务器 `?source=`）。 */
  mySide: ProposalFileSide
  /** 对方的侧（下载读它）。 */
  otherSide: ProposalFileSide
  /** 这次提案是我发起的吗。 */
  iProposed: boolean
  /** 该我接受 / 拒绝吗（`PROPOSED` 且不是我发起的）。 */
  iAmAcceptor: boolean
  /**
   * **押金冻的是我的钱吗** —— 也就是"我是不是学生（`researcher`）"。
   *
   * 接受指导的 402（资金池不足）只可能出现在这里为 `true` 的场合，所以界面**只在这时**
   * 用自己的 `funded_balance` 提前拦人、也只用第一人称说"资金池不足"。
   */
  iAmPayer: boolean
}

/**
 * 从提案算出 {@link MentorshipView}。
 *
 * "谁发起了"优先用服务器的 `proposed_by_id`；旧服务器不返回时**按方向推断**
 * （A 由导师发起、B 由学生发起）—— 这是那个方向的定义，不是猜测。
 * `myAccountId` 缺失（未登录 / 旧宿主）时按"我是研究者"兜底：那种情况下这些行
 * 本来也不渲染（【指导中】要求登录），兜底只为不崩。
 */
export function mentorshipView(
  proposal: ProposalViewLike,
  myAccountId: string | null,
): MentorshipView {
  const myRole: ProposalRole =
    myAccountId && proposal.mentorId === myAccountId ? 'mentor' : 'researcher'
  const direction = proposal.direction
  const iAmOwner = direction === 'SEEK_MENTOR' ? myRole === 'researcher' : myRole === 'mentor'
  const proposerRole: ProposalRole = direction === 'SEEK_MENTOR' ? 'mentor' : 'researcher'
  const iProposed =
    proposal.proposedById != null ? proposal.proposedById === myAccountId : myRole === proposerRole
  return {
    myRole,
    iAmOwner,
    mySide: iAmOwner ? 'owner' : 'mentor',
    otherSide: iAmOwner ? 'mentor' : 'owner',
    iProposed,
    iAmAcceptor: !iProposed,
    // 押金永远从**学生**账上冻（服务器不变量，两个方向都一样）——判据是"我是不是学生"，
    // **不是** `!iAmOwner`（理由见文件头）。
    iAmPayer: myRole === 'researcher',
  }
}
