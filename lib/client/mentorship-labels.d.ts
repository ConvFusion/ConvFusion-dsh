/**
 * ConvFusion — 【指导中】的**进展文案**取值规则（纯函数，界面与自检共用）
 *
 * ## 为什么单独一个模块
 *
 * 这段规则曾经把**方向 A 的两侧配反**（用户 2026-10 实测）：学生会看到
 * 「我已指导」（那是导师的第一人称），导师反而看到「导师已指导」（那是给学生的第三人称）。
 * 根因是它按"角色"配文案，而这项业务里**谁在交付**由**方向**决定：
 *
 * | 方向 | 谁拥有项目（owner） | 非 owner 那一侧 = **交付方** |
 * |---|---|---|
 * | `SEEK_MENTOR`（学生发布工作求指导） | **学生** | 导师 → 交付**指导产物** |
 * | `SEEK_STUDENT`（导师出题招学生） | **导师** | 学生 → 交付**研究进展** |
 *
 * 而 `reviewFiles`（服务器口径）数的正是**非 owner 那一侧**的去重文件数 ——
 * 所以"已交付 / 待交付"的文案，owner 侧说的是**对方**，非 owner 侧说的是**我**。
 *
 * 抽成不依赖 React 的纯函数之后，自检可以把四种（方向 × 视角）组合逐一钉住 ——
 * 这类"视角配反"的 bug 靠读代码或正则都看不出来。
 *
 * ⚠️ 本模块**自包含、不 import 任何东西**：客户端 `tsconfig.client.json` 把 `rootDir`
 * 钉在 `src/client`，一旦 import 宿主的模块就会把 node 内置模块拖进来而报错。
 */
/** 交付方向（与宿主 `ProjectDirection` 同构）。 */
export type MentorshipDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT';
/** 取值只需要这三样（不依赖完整的提案对象，便于自检直接构造）。 */
export interface ProgressProposalLike {
    status: string;
    direction: MentorshipDirection;
    /** 非 owner 那一侧的文件数（服务器口径）；`null`/缺省 = 查不到。 */
    reviewFiles?: number | null;
}
/** 视角：**我是不是项目 owner**（学生/导师由方向决定，不看角色）。 */
export interface ProgressViewerLike {
    iAmOwner: boolean;
}
/**
 * `ACCEPTED` 之后的进展文案 key；**非 `ACCEPTED` → `null`**（调用方用状态名，
 * 那是另一套文案，混在一起就分不清"流程没开始"与"交付到哪一步"）。
 *
 * key 与文案的对应（中英词典里同名条目）：
 *
 * ```text
 * 方向 A（导师交付）  学生看：mentorGuided / awaitingMentor    导师看：iGuided / iToGuide
 * 方向 B（学生交付）  导师看：studentDelivered / awaitingStudent 学生看：iDelivered / iToDeliver
 * ```
 */
export declare function acceptedProgressKey(proposal: ProgressProposalLike, viewer: ProgressViewerLike): string | null;
