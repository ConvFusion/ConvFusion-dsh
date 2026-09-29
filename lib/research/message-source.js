/**
 * ConvFusion 注入消息的**来源标识**（DSH 0.2.0 的消息来源契约）。
 *
 * ## 为什么需要这个文件
 *
 * DSH 0.2.0 **删除了 `MessageSourceMap['plugin']`**（`@deepseek-ai/dsh-llm`）。
 * 旧写法
 *
 * ```ts
 * source: { kind: 'plugin', plugin: 'convfusion' }   // ❌ 0.2.0 起非法
 * ```
 *
 * 在类型上已不属于任何已知 kind；运行期更硬 —— V4 会话格式**直接拒绝**
 * `kind === 'plugin'`（`dsh-session-format-v3-to-v4` 的 `source()`：
 * "format v4 message requires a producer-owned source kind"）。
 *
 * ## 正确的替代值：`plugin:convfusion`
 *
 * 这个值**不是猜的**：它就是**官方 V3→V4 迁移**对本插件历史会话里
 * `{ kind: 'plugin', plugin: 'convfusion' }` 的改写结果 ——
 * `dsh-session-format-v3-to-v4` 的 `producerKind()` 在既不在 `RENAMED_PRODUCERS`
 * 也不在 `RELEASED_SAME_NAME_PRODUCERS` 时返回 `` `plugin:${plugin}` ``。
 * 用同一个值，**新旧消息在客户端渲染上完全一致**，不会出现"老会话一种样式、
 * 新消息另一种样式"。
 *
 * ## 为什么要 `declare module`
 *
 * `MessageBase.source` 的类型是 `MessageSourceMap[keyof MessageSourceMap]` ——
 * 一个**封闭**的已知 kind 联合，`plugin:convfusion` 不在其中。所以必须按官方范式
 * 做**模块增强**把自己的 kind 声明进去（`dsh-webhook` 的 `webhook`、
 * `dsh-subagent` 的 `subagent-settled` 都是这么做的）。
 *
 * 运行期只要求 `kind` 是**非空字符串且不等于 `'plugin'`**（`dsh-session` 的
 * `source()` 校验），所以自定义 kind 是被支持的扩展点。
 */
/** 本插件作为消息生产者使用的名字（与历史 V3 会话 `source.plugin` 字段一致）。 */
export const CONVFUSION_PRODUCER = 'convfusion';
/**
 * 注入消息的来源。
 *
 * 冻结成常量、**只在这里写一次**：调用点各写一份串，迟早会有一处写歪，
 * 而那种错误既不报错也很难看出来。
 */
export const CONVFUSION_MESSAGE_SOURCE = Object.freeze({
    kind: `plugin:${CONVFUSION_PRODUCER}`,
});
//# sourceMappingURL=message-source.js.map