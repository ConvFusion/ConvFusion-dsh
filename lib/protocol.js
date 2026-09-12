/**
 * ConvFusion 2.0 — 宿主 ↔ 浏览器 的协议版本
 *
 * ## 为什么需要这个常量
 *
 * 客户端 bundle 由浏览器**刷新即更新**（`dsh-client-hmr` 按 mtime/size 轮询），
 * 但宿主半边的模块是 **DSH 启动时加载进内存的** —— 改了 `lib/**` 之后不重启 DSH，
 * 页面拿到的仍是旧代码算出来的数据。
 *
 * 这个不对称已经造成过一次真实误判：解析器修好了（`lib/` 里 47 个 Skill 名字全对），
 * 但浏览器仍显示旧的坏名字，看起来像"修了没用"。刷新页面在这件事上**没有任何作用**。
 *
 * 所以两边各带一份版本号：客户端 bundle 在构建时**内联**当前值，宿主在响应里带上
 * 它内存中的值。两者不一致 = 宿主是旧的 → 设置页直接把这件事说出来。
 *
 * ## 什么时候要改这个数字
 *
 * **任何会改变 `/dsh-convfusion/state` 返回形状或语义的宿主改动**都必须 +1。
 * 纯界面改动不用改。
 */
export const HOST_PROTOCOL = 2;
/** 状态响应里的协议字段名（两边共用，避免拼错）。 */
export const HOST_PROTOCOL_FIELD = 'protocol';
//# sourceMappingURL=protocol.js.map