/**
 * ConvFusion 2.0 — **下载之后的「整合提示词」**（0.5.8）
 *
 * ## 插件只做一件事：把提示词写对
 *
 * 【下载】只把 ZIP 存进工作区。接下来要发生什么，**由这段提示词决定**，由用户会话里的
 * agent 执行 —— 插件自己**不碰文件**、也**不发送**这段提示词（绝不调用 `submit()`）。
 * 这是 2026-10 用户拍板的口径："插件端全部设计成提示词构建"。
 *
 * ## 四种情形，四段提示词（判据是服务器的 `workspace_id`）
 *
 * | 情形 | 第 2 步做什么 |
 * |---|---|
 * | `new` 还没有研究根 | 解压成**新的**研究根 |
 * | `same` 同一项研究（标识一致） | **融合**：逐个文件读两侧内容，产出融合后的新文件（不是覆盖） |
 * | `other` **另一项**研究（标识不一致） | **先备份**现有研究根（**移动**，不删），再把下载的这份解压成**新的**研究根 |
 * | `unknown` / `unverifiable` 判不出来 | 先盘查两侧主题、给出"同一项/另一项"的判断，**等用户确认**后按对应的一支执行 |
 *
 * `other` 那一行是这次的关键：**不禁止下载**（早先的设计是硬拦），而是把"换一项研究"这件事
 * 变成一次**可恢复的**操作 —— 旧研究根被整体移进备份目录，什么都不丢；用户随时能搬回来。
 *
 * ## 为什么是两步走
 *
 * 融合/替换都会改动研究文件，所以第 1 步**只读盘查**：四类清单（仅包内 / 仅本地 /
 * 两侧相同 / 两侧不同），重点是第 ④ 类（逐个给出两侧大小、时间、类型、差在哪），
 * **报告完停下来等确认**；用户点头之后才做第 2 步。
 *
 * ## 为什么"融合"不是"覆盖"
 *
 * 用户的原话：**"覆盖就不是融合了 —— 应该是 Agent 分析文件内容，然后整合为新的文件。"**
 * 所以提示词把裁决权写清楚：文本按语义合并（两侧信息都保留）、结论冲突**不裁决不丢弃**、
 * 二进制语义不可融合（新的留原处，另一份移进 `.convfusion/incoming/<时间戳>/`）。
 * 插件**不实现任何合并规则** —— 那会在真实研究文本上出错，而且一旦插件自己动手，
 * "融合"就退化成了它有把握实现的那一种：覆盖。
 *
 * ## 身份文件
 *
 * 目标工作区要能自己说出"我属于哪一项研究"（判据见 `research/work-identity.ts`）。
 * 下载时研究根可能还不存在（新工作区）、也可能正要被换掉（`other`），没法由宿主先写；
 * 而解压正是 agent 在做的事 —— 所以让 agent 顺手写 `<研究根>/.convfusion/work.json`。
 * 写进去的 JSON 与宿主读取器**同一个形状**（`identityJsonFor` ↔ `markerJson`，自检钉住）。
 */
import type { Translate } from './i18n/index.js';
/** 身份标记在研究根里的相对路径（**研究根相对**，与归档内路径同一口径）。 */
export declare const IDENTITY_FILE_REL = ".convfusion/work.json";
/** 二进制冲突的"落败方"暂存目录（研究根相对）。 */
export declare const INCOMING_DIR_REL = ".convfusion/incoming";
/** 研究根目录名（现行布局：`<工作区>/workspace`）。 */
export declare const RESEARCH_ROOT_DIR = "workspace";
/**
 * 目标工作区的判定结论（宿主 `mentor/downloadState` 给的 `status`）。
 *
 * 五种都会走到提示词 —— 一个都不拦（用户 2026-10 的决定）。
 */
export type MergeState = 'new' | 'same' | 'other' | 'unknown' | 'unverifiable';
export interface MergePromptInput {
    t: Translate;
    /**
     * 服务器上的项目标题（只用来**建议**备份目录名 —— 真正取缩写的是 DSH，
     * 它读得到工作区里的 `project.md`）。
     */
    projectTitle?: string;
    /** 刚落盘的 ZIP 绝对路径。 */
    zipPath: string;
    /** 目标工作区的**根目录**（`<工作区>`）。 */
    workspace: string;
    /** 本工作区当前的研究根；`new` 时是"将会是"的路径（`<工作区>/workspace`）。 */
    researchRoot: string;
    state: MergeState;
    /** 布局：`legacy` 时备份只搬研究数据（工作区根还混着用户的材料）。 */
    layout: 'nested' | 'legacy' | null;
    /** 服务器给的研究标识；`null` = 没给 → 提示词跳过写身份文件那一步。 */
    workspaceId: string | null;
    projectId: string;
    serverUrl: string;
    /** 下的是哪一侧：`owner` = 对方的工作区（我当导师）；`mentor` = 对方回传的交付。 */
    source: 'owner' | 'mentor';
    /** 时间戳（备份目录名 / incoming 子目录名）；缺省 = 现在。 */
    now?: Date;
    /**
     * 这个 ZIP **还没落盘**、文件名只是预检的猜测（2026-10 用户要求"下载前先填提示词"）。
     *
     * 为真时提示词里会附一句"以实际落盘的名字为准 / 若还在下载就等它写完" ——
     * 因为服务器才是命名的权威，同名还会加 `-2` 序号。
     */
    zipNamePending?: boolean;
}
/** `<研究根>/.convfusion/work.json`。 */
export declare function identityFileOf(researchRoot: string): string;
/** `<研究根>/.convfusion/incoming/<时间戳>/`（二进制冲突的落败方放这里，不删除）。 */
export declare function incomingDirOf(researchRoot: string, now: Date): string;
/**
 * 备份目录名的**建议起点**。
 *
 * ⚠️ 最终的**名字由 DSH 取**（2026-10 用户定）：它读得到工作区里的 `project.md`，
 * 取"研究主题 / 方法的首字母缩写 + 日期"比我在这里猜得准；同名时它还会加 `-2`、`-3`。
 * 这个函数只负责给一个像样的起点，免得提示词把这件事悬空。
 *
 * 形状：**`workspace_<缩写>_<日期>`**（前缀固定 `workspace_`，2026-10 用户定）——
 * 研究根本身就叫 `workspace`，备份就摆在它旁边，前缀一致才能一眼看出"这是同一个根的另一份"，
 * 而"整个目录移过去"这件事看起来也更像一次改名。
 *
 * 缩写取值顺序：
 *   1. 标题里带括号的缩写优先 —— `Long-Horizon Scientific Decision (LH-RDP)` → `LHRDP`
 *      （方法缩写通常就写在括号里，比逐词取首字母准）；
 *   2. 否则取 ASCII 词的首字母（最多 4 个词）—— `Retrieval Augmented Reasoning` → `RAR`；
 *   3. 中文 / 单词标题没法取首字母 → 用前 6 个非标点字符（可读即可）；
 *   4. 实在取不出来 → `research`。
 * 日期用 `YYYYMMDD`（紧凑；这样整个名字就是干净的三段，也能按时间排序）。
 *
 * 为什么不带时间戳：目录名是给人看的（用户要能一眼认出"这是哪天那份备份"）；
 * 同一天撞名由 DSH 加序号解决（`workspace_ABC_20261011-2`）。
 */
export declare function backupNameOf(title: string, now: Date): string;
/** 备份目录名的**前缀**：与研究根同名，一眼看出是"同一个根的另一份"。 */
export declare const WORKSPACE_PREFIX = "workspace_";
/** 备份目录名里的那段缩写（由标题猜；DSH 会按工作区里的 `project.md` 取更准的）。 */
export declare function backupTagOf(title: string): string;
/** `YYYY-MM-DD`（人读的日期）。 */
export declare function dateOf(now: Date): string;
/** `YYYYMMDD`（目录名里的日期：紧凑、可按时间排序）。 */
export declare function compactDateOf(now: Date): string;
/**
 * 时间戳目录名：`2026-10-11T03-21-44Z`。
 *
 * ⚠️ 冒号要换成 `-`：Windows 与各类 ZIP 工具都不接受文件名里有冒号。
 * 只用在**二进制冲突**的暂存目录（`.convfusion/incoming/<时间戳>/`）——
 * 那是一天里可能发生多次的动作，需要精确到秒；备份目录名不用它（给人看，日期就够）。
 */
export declare function stampOf(now: Date): string;
/**
 * 下载的这份应当落在**哪个目录**。
 *
 * | 情形 | 目标 |
 * |---|---|
 * | `same`（同一项研究） | 现有研究根 —— **就地融合**，不新建目录 |
 * | 其余（`new` / `other` / `unknown` / `unverifiable`） | **`<工作区>/workspace/`** |
 *
 * ⚠️ 口径（2026-10 用户定，一句话）：**"我们只要求复制到工作区下的工作目录是 `workspace/`
 * 而已"** —— 一个工作区只有一个研究根，就是 `<工作区>/workspace`（本插件认研究根也只认它，
 * 见 `research/workspace.ts` 的 `researchWorkspaceOf`）。
 *
 * 那"同一个工作区里放多个学生的研究"怎么办？靠**备份 + 换根**轮换，而不是靠不同目录名并存：
 * 下载第二份时判定是 `other`，提示词会先把现有 `workspace/` 改名成
 * `workspace_<缩写>_<日期>/`（移动，不删），再把新的解压成 `workspace/`。
 * ZIP 文件本身**保持服务器给的名字**（`<owner>-<title>.zip`），宿主落盘时同名加序号 ——
 * 那一条从来没有改过。
 */
export declare function targetRootOf(input: Pick<MergePromptInput, 'workspace' | 'researchRoot' | 'state'>): string;
/**
 * 要写进身份文件的 JSON。
 *
 * ⚠️ **必须与宿主侧的 `markerJson`（`src/research/work-identity.ts`）同形状** ——
 * 一个是写（提示词让 agent 写）、一个是读（判定时读回来），对不上就是"身份永远读不到"。
 * 两边的字段名/取舍由离线自检直接比对（`verify-workspace-identity.mjs`）。
 */
export declare function identityJsonFor(input: {
    workspaceId: string;
    projectId: string;
    serverUrl: string;
    source: 'owner' | 'mentor';
    now: Date;
}): string;
/** 第 2 步用哪一段（情形 → i18n 键后缀）。 */
export declare function actionKeyOf(state: MergeState): 'new' | 'merge' | 'switch' | 'decide';
/**
 * 界面"接下来会发生什么"那一行（以及提示词里的 `{plan}`）用哪个 i18n 键。
 *
 * 与 `{actionTitle}` 同一套分叉规则：就是状态本身（`new` / `same` / `other` /
 * `unknown` / `unverifiable`）—— 提示词与面板因此不会各说一套。
 */
export declare function planKeyOf(state: MergeState): string;
/**
 * 构建整段提示词（**纯函数**：除 `t` 与本输入外无依赖，便于离线断言）。
 */
export declare function buildMergePrompt(input: MergePromptInput): string;
