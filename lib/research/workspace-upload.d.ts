import { type ServerRequestOptions, type UploadManifestFile, type WorkspaceUploadReceipt, type WorkspaceUploadStatus } from '../server-client.js';
/** 界面上那根进度条的数据（与老的 `mentor/uploadProgress` 同形）。 */
export interface UploadProgress {
    doneFiles: number;
    totalFiles: number;
    sentBytes: number;
    totalBytes: number;
    running: boolean;
}
/**
 * 一次上传的**控制面**（宿主持有，界面通过 `upload/status` 读）。
 *
 * - `signal`：取消时 abort（本地读盘 / 在途请求都停）；
 * - `cancelRemote`：**服务器侧**的取消动作（`DELETE /uploads/{id}`）—— 只有在作业已经开出来
 *   之后才有；取消时由宿主调用，之后必须置 `undefined`；
 * - `finishing`：已经发出 `complete`（服务器可能已经提交）→ 这时**不许再取消**，
 *   否则会出现"界面说取消了、网络里其实已经有这版文件"。
 */
export interface UploadControl {
    signal: AbortSignal;
    progress: UploadProgress;
    cancelRemote?: (() => Promise<WorkspaceUploadStatus | null>) | undefined;
    finishing: boolean;
}
/** `transferWorkspace` 的结果。 */
export interface WorkspaceTransferResult {
    jobId: string;
    receipt: WorkspaceUploadReceipt;
    /** 超过服务器单文件上限、因此**没进清单**的文件（界面照旧如实提示）。 */
    oversize: Array<{
        relPath: string;
        size: number;
    }>;
    /** 本次提交的清单（`path` → `sha256:<hex>`）：调用方可以据此更新本地指纹。 */
    manifest: UploadManifestFile[];
}
/**
 * 把选中的文件**分阶段**传到服务器，返回提交回执。
 *
 * @param args.base 服务器地址
 * @param args.apiKey API Key
 * @param args.projectId 项目 id
 * @param args.root 本机研究根
 * @param args.paths 选中文件的**研究根相对路径**
 * @param args.options 网络选项（含 `workspaceId` → `X-Workspace-Id` 写守卫）
 * @param args.control 取消 / 进度
 * @param args.state 研究状态与基准版本（**只有 owner 能带**；导师回传不传）
 * @param args.timeoutForBytes 按字节数折算超时（`uploadTimeoutForBytes`）
 */
export declare function transferWorkspace(args: {
    base: string;
    apiKey: string;
    projectId: string;
    root: string;
    paths: readonly string[];
    options: ServerRequestOptions;
    control: UploadControl;
    state?: {
        content: Record<string, unknown>;
        baseVersion: number | null;
    } | undefined;
    timeoutForBytes: (bytes: number) => number;
}): Promise<WorkspaceTransferResult>;
//# sourceMappingURL=workspace-upload.d.ts.map