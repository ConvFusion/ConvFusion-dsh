/**
 * 谁在弹窗里。
 *
 * 后台轮询（进度面板每 60 秒、以及发布/上传/下载的进度轮询）会在用户正在填写的弹窗上方
 * 重新拉数据并 `setState`，把已勾选的项清掉、把焦点挪走。用户看到的是"界面自己刷新了"。
 *
 * 这里只记"当前有哪些弹窗开着"，不做任何渲染：轮询方问一句 `isOtherModalOpen(self)`，
 * 有**别人**开着就跳过这一轮。用 id 而不是布尔值，是因为弹窗**自己**的进度轮询不该被
 * 自己挡住 —— 发布进度停了，用户就看不到附件阶段在做什么。
 */
const openModals = new Set<string>()

/** 弹窗挂载时调用；同一 id 重复进入是幂等的。 */
export function enterModal(id: string): void {
  openModals.add(id)
}

/** 弹窗卸载时调用。 */
export function exitModal(id: string): void {
  openModals.delete(id)
}

/**
 * 是否有**其它**弹窗开着。
 *
 * @param self 调用方自己的 id；不传表示"任何一个弹窗都算"
 */
export function isOtherModalOpen(self?: string): boolean {
  for (const id of openModals) if (id !== self) return true
  return false
}

/** 测试与诊断用。 */
export function openModalIds(): string[] {
  return [...openModals]
}
