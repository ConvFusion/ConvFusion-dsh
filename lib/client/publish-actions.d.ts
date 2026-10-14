/**
 * ConvFusion — 【我的】行上的发布动作（**纯规则**，界面与自检共用同一份）
 *
 * ## 规则（2026-10 用户拍板）
 *
 * ```text
 * 研究者（非导师）    → 一个按钮：寻找指导
 * 导师                → 主按钮：寻找学生；【寻找指导】收进拆分按钮的下拉里
 * 已发布（任一方向）   → 一个按钮：更新文件（更新它已经属于的那个方向）
 * ```
 *
 * ## 为什么放在这里而不是写在界面里
 *
 * 这段规则有**三个角色分支 + 已发布分支**，写在 JSX 里就只能靠"读代码"确认
 * （自检只能正则匹配源码文本，匹配不到行为）。抽成不依赖 React / i18n 的纯函数之后，
 * 自检可以直接调用它把四种情形逐一钉住 —— 与 `publishButtonOrder` 的取舍相同。
 *
 * ## 两个方向为什么不是"两个按钮"
 *
 * "求指导"与"招学生"是**两种身份**（学生发布自己的工作 / 导师发布一个选题），
 * 一个研究工作只属于其中一个（宿主侧对换方向发布直接拒绝，见 `settings-rpc.ts`
 * 的 `already-published`）。所以界面上永远只该有一个发布入口。
 */
/**
 * ⚠️ 这个模块**自包含、不 import 任何东西**：它是客户端源码，而客户端的 tsconfig
 * (`tsconfig.client.json`) 把 `rootDir` 钉在 `src/client` —— 一旦 import 宿主的
 * `server-client.js`，tsc 会把整条依赖链（含 node 内置模块）拖进来而报错。
 * 方向的两个字面量与宿主 `PublishDirection` 同构，这里自己声明。
 */
export type PublishDirection = 'SEEK_MENTOR' | 'SEEK_STUDENT';
export type PublishActionKind = 'publish' | 'update';
export interface PublishActionItem {
    direction: PublishDirection;
    /** `publish` = 首次发布；`update` = 更新已经发布过的那一份。 */
    kind: PublishActionKind;
}
export interface PublishActionPlan {
    /** 主按钮（永远有且只有一个）。 */
    primary: PublishActionItem;
    /** 收进下拉的次要动作（导师的【寻找指导】；正常情况下为空）。 */
    more: PublishActionItem[];
}
/**
 * 未发布时，两个方向的**角色顺序**：导师把【寻找学生】放前面，研究者只剩【寻找指导】。
 *
 * 顺序的用途只有一个：把"主按钮"选出来（导师的主按钮是招学生）。
 */
export declare function publishButtonOrder(canMentor: boolean): [PublishDirection, PublishDirection];
/**
 * 算出一行该显示哪些发布动作。
 *
 * @param canMentor 有没有导师角色（`MENTOR` / `ADMIN`）
 * @param published 这项工作**已经发布过的**方向（正常 0 或 1 个）
 */
export declare function publishActionPlan(canMentor: boolean, published: readonly PublishDirection[]): PublishActionPlan;
