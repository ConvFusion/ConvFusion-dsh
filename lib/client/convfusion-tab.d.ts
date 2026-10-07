/**
 * ConvFusion 2.0 — 两个会话 Tab 的**闸门**（按会话条件注册 / 注销）
 *
 * ```text
 * 对话 | 轨迹 | 研究进展（19） | 科V社区（20）
 *                └─ 只在研究工作区出现，一起注册 / 一起注销
 * ```
 *
 * ## 为什么会有这么一个文件
 *
 * 用户 2026-10 拍板：两个 ConvFusion 页面都放进会话 tab（顶部的两个按钮随之移除，
 * 「只留 tab」），**只在当前会话的工作区是有效研究工作区时**才出现 —— 判据就是宿主
 * `progress/workspace` 的 `research`（按会话自己的 cwd 判定）。而 `conversation.view`
 * 的 roster 是**全局**的：
 *
 * ```text
 * dsh-client-ui-conversation: viewTabs()
 *   for (entry of slots.entries("conversation.view"))
 *     if (entry.id === "trajectory" && !developerTools) continue   ← 唯一的"按会话"过滤，且是硬编码的
 *     tabs.push({ id, label })
 * ```
 *
 * 也就是说 **tab 条没有"按会话显隐"的接口**（roster 由所有会话共用，选中哪个 tab 才是按会话存的）。
 * 所以"只在研究工作区显示"只能通过**随当前显示的会话注册 / 注销这几条**实现。
 *
 * ## 「当前显示的会话」怎么拿（不自己造全局状态）
 *
 * 用会话服务里 DSH 自己就在用的判据：`list.byId` 中 `retainedBy.mainView > 0` 的那一个
 * （`dsh-client-ui-workspace` 三处、`dsh-client-ui-layout` 的 DocumentTitle 都这么算；
 * `ui-workspace` 的 `replaceMain()` 正是以 `source: 'mainView'` 保留被显示的会话）。
 * 保留态一变，服务会推送新的 list 快照，所以订阅它就能跟上会话切换。
 *
 * ## 注销是安全的（已核实，不会留空白）
 *
 * 会话的视图选择按会话持久化（`dsh.conversation.<sessionId>.view`）。当我们的条目被注销：
 *
 * ```text
 * DefaultConversationViews:  active = resolveActiveView(tabs, store.view)
 *                            viewId = view ?? active?.id          // 主面板的 <Views /> 不带 view
 * resolveActiveView:         tabs 里找不到 → 回落到 chat
 * ```
 *
 * ⇒ 被我们条目选中过的会话**回落到显示对话**（不是空白页），且 `store.view` 未被改写
 * （`restoreView()` 只 `activate`，只有点击 tab 的 `selectView()` 才写 store）；
 * 条目重新注册后 `store.view` 仍是我们的 id ⇒ **自动恢复**。注销/重注册因此是自愈的。
 *
 * ## 六条纪律
 *
 * 1. **失败即隐藏**：没有会话服务、宿主不可达、协议号过旧 → 不注册（不猜）。
 * 2. **按会话缓存判定**：再次进入已知的研究会话时**同步**注册，不留"先闪一下对话"的窗口；
 *    未知会话则等探针（一次本机 POST）返回后再注册。
 * 3. **只有明确的答案才改状态**：探针返回 `research: false` 才注销；异常一律按"否"处理。
 * 4. **不碰别人的槽位**：只注册/注销自己这几条 `conversation.view`。
 * 5. **百分比进 tab 文案**：`research` 与百分比来自**同一次**探针，所以面板没挂载时 tab 上也有数；
 *    而 roster 只在槽位/语言变化时重读 label —— 数值变了必须**重注册**（`applyAnswer()`），
 *    没变则一动不动（不抖 roster）。
 * 6. **一次注册 / 一次注销**：两个 tab 同进同退，任何时刻 roster 里要么两条都在、要么都不在。
 *
 * 轮询：注册期间挂一个 `PROGRESS_REFRESH_MS` 的低频定时器（工作区与资产都可能变），
 * 它随插件卸载一起清掉 —— 没 tab 的时候不问宿主。
 */
import { type Translate } from './i18n/index.js';
/** 「研究进展」tab 的 id。 */
export declare const PROGRESS_VIEW_ID = "convfusion-progress";
/**
 * 「研究进展」的排序键。
 *
 * 官方两个 tab：`chat` = 0、`trajectory` = 10；我们的两个排在它们之后，
 * 其中研究进展 = **19**、科V社区 = **20**（用户 2026-10 指定：研究进展在科V社区之前）。
 */
export declare const PROGRESS_VIEW_ORDER = 19;
/** 「科V社区」tab 的 id。 */
export declare const COMMUNITY_VIEW_ID = "convfusion-community";
/** 「科V社区」的排序键（20，紧接研究进展之后 ⇒ 两个 ConvFusion tab 一起在最右）。 */
export declare const COMMUNITY_VIEW_ORDER = 20;
/** 我们占用的槽位 key（两个 tab 都在这一槽位里）。 */
export declare const CONVFUSION_VIEW_SLOT = "conversation.view";
/** 一行会话摘要里我们**只用**这两个字段（其余字段不镜像，避免跟着上游漂）。 */
interface SessionRowLike {
    id?: string;
    retainedBy?: Record<string, number> | undefined;
}
/** 会话服务的最小切片（`ctx.sessions` 的公开面）。 */
export interface SessionsLike {
    list: {
        getSnapshot(): {
            byId?: Record<string, SessionRowLike> | undefined;
        };
        subscribe(listener: () => void): () => void;
    };
}
/** 我们一条 `conversation.view` 的注册项（字段与 DSH `SlotRegisterOptions` 同形）。 */
export interface ConvFusionViewRegistration {
    name: string;
    id: string;
    order: number;
    label: () => string;
    locale: string;
}
/** 一个 tab 的声明：id / 顺序 / 文案（可读进度值）/ 正文组件。 */
export interface ConvFusionTabSpec {
    id: string;
    order: number;
    /**
     * 文案：拿得到百分比时带上它（「研究进展 62%」）。
     *
     * ⚠️ roster 只在**槽位变更 / 语言切换**时重读 label，所以数值变化时必须
     * **重新注册**一次这条目 —— 见 `applyAnswer()` 里的 percent 比较。
     */
    label: (percent: string | undefined) => string;
    component: unknown;
}
/** 一次探针的答案：是不是研究工作区 + 可选的成熟度折算（tab 文案用）。 */
export interface GateAnswer {
    research: boolean;
    /** 已格式化的百分比（如 `62%`）；宿主没给报告时为 undefined。 */
    percent?: string | undefined;
}
interface SlotsLike {
    inject(key: string, fn: () => void | (() => void)): unknown;
    /**
     * 注册项写具体形状而**不是** `Record<string, unknown>`：DSH 的 `SlotRegisterOptions`
     * 是 interface（无隐式索引签名），`Record<string, unknown>` 会让它不可赋值。
     */
    register(options: ConvFusionViewRegistration, component: unknown): () => void;
}
/**
 * 「当前显示在中央列的那个会话」。
 *
 * 与 DSH 自己一致：`retainedBy.mainView > 0` 的那一行。拿不到就返回 `undefined`
 * （没有会话被显示 → 不该有 tab）。
 */
export declare function currentMainSessionId(list: {
    byId?: Record<string, SessionRowLike> | undefined;
} | undefined): string | undefined;
export interface ConvFusionGateOptions {
    /** DSH Slot 标准注入（`ctx.locale.bind(CONVFUSION_LOCALE_NS)`）。 */
    t: Translate;
    /** 会话服务；缺失（老宿主 / 服务不可用）→ 不注册。 */
    sessions: SessionsLike | undefined;
    /** 判定实现（缺省 = 问宿主 `progress/workspace`）。可注入以便离线测试。 */
    probe?: ((sessionId: string) => Promise<GateAnswer>) | undefined;
    /** 要一起注册/注销的 tab（缺省 = 研究进展 + 科V社区）。 */
    tabs?: readonly ConvFusionTabSpec[] | undefined;
}
/** 百分比文本（与 `./progress-panel.js` 里的 `pct()` 同一个口径：四舍五入到整数）。 */
export declare function percentText(overall: number | undefined): string | undefined;
/**
 * 两个 tab 的声明（顺序即 `order`：研究进展 19 → 科V社区 20）。
 *
 * @param t - 绑定到 convfusion namespace 的翻译函数。
 */
export declare function convfusionTabSpecs(t: Translate): readonly ConvFusionTabSpec[];
/**
 * 装上闸门：跟随当前显示的会话，决定 `conversation.view` 里我们这几条在不在。
 *
 * @param ctx - 客户端上下文（只需 `slots`）。
 * @param options - 文案注入、会话服务、判定实现、tab 列表。
 */
export declare function installConvFusionTabs(ctx: {
    slots: SlotsLike;
}, options: ConvFusionGateOptions): void;
export {};
