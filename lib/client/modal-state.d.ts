/** 弹窗挂载时调用；同一 id 重复进入是幂等的。 */
export declare function enterModal(id: string): void;
/** 弹窗卸载时调用。 */
export declare function exitModal(id: string): void;
/**
 * 是否有**其它**弹窗开着。
 *
 * @param self 调用方自己的 id；不传表示"任何一个弹窗都算"
 */
export declare function isOtherModalOpen(self?: string): boolean;
/** 测试与诊断用。 */
export declare function openModalIds(): string[];
