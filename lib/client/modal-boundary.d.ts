/**
 * 把一段渲染**登记成"弹窗开着"**（`./modal-state.js` 的 React 侧入口）。
 *
 * ## 为什么需要它
 *
 * 后台轮询（进度面板 / 两个会话 Tab / 发布与下载进度）每 60 秒会重问一次宿主。
 * 其中会话 Tab 的那一路，百分比一变就要**重注册**条目让 roster 重读 label ——
 * 而 DSH 给槽位条目分配的 React key 是"每个 entry 对象一个"（`dsh-client-ui-renderer`
 * 的 `entryKeyOf`），所以重注册 = 卸载 + 重挂载 tab 正文：
 * 用户正在填的对话框连同它的 `open` state 一起没了（2026-11 用户报的"界面自己刷新一次、
 * 弹窗消失"就是这个）。
 *
 * 挡法有两道，这里提供第二道：轮询方问 `isOtherModalOpen()`，弹窗方把自己的 id 挂上去。
 * 第一道在 `./convfusion-tab.js`：`applyAnswer()` 在任何弹窗开着时不重注册（只更新缓存，
 * 等下次轮询再改文案）。
 *
 * ## 为什么是组件而不是在各对话框里 `useEffect`
 *
 * 两个对话框（`AcceptConfirmDialog` / `TokenDialog`）是**无 hook**导出的 ——
 * `scripts/verify-settings-page.mjs` 把它们当普通函数调用、遍历产出的树。在里面加 hook
 * 会让那条自检走不通。这里在**渲染处**包一层：组件本身一行不动，树里也不多出节点
 * （返回 `Fragment`，而对话框本体是 `position: fixed` 的背板，不影响布局）。
 */
import React from 'react';
/**
 * 渲染 `children`，并在挂载期间把 `id` 登记为"开着的弹窗"。
 *
 * @param id - 弹窗身份；与轮询方 `isOtherModalOpen(self)` 的 `self` **必须是同一个值**，
 *   否则弹窗**自己**的进度轮询会被挡掉（发布进度停了，用户就看不到附件阶段在做什么）。
 * @param children - 对话框本体（通常是一个 `position: fixed` 的背板）。
 */
export declare function ModalBoundary({ id, children, }: {
    id: string;
    children: React.ReactNode;
}): JSX.Element;
