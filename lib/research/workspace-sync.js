/**
 * 工作区里的文件级操作：`review/`（导师交付指导结果的保留前缀）的**扫描与读取**。
 *
 * ## 为什么单独一个模块
 *
 * `settings-rpc.ts` 有一条既定的分层纪律：**RPC 层不做文件读写**（只经 store 或
 * 专门模块）。这里放"找文件、读字节、拼安全路径"这些机械动作，既能守住那条纪律，
 * 又能脱离 RPC 单独测。
 *
 * ## 【下载】不在这里
 *
 * 下载是**浏览器原生下载**（2026-09 用户拍板）：宿主只做带凭据的同源 GET 代理，
 * 把服务器的 ZIP 交给浏览器保存 —— 插件不落盘、不解压、不注册工作区
 * （浏览器把文件存到哪，页面无从得知）。所以这里没有解包逻辑。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { researchWorkspaceOf } from './workspace.js';
/**
 * 导师交付指导结果的目录名（相对**研究根**）。
 *
 * 服务器把这个前缀保留给关系方（`docs/API.md` §13.1）：导师只能写 `review/**`，
 * 结构上改不了 `project.md` / `research-state.md` 这些研究事实。
 */
export const REVIEW_DIR = 'review';
/**
 * 把一个不可信的相对路径解析成根目录下的**安全**绝对路径。
 *
 * 绝对路径、空、`..`、以及规范化后逃出根目录的路径一律拒绝 —— 拿到不可信的
 * 相对路径就往磁盘上写，一个被篡改的值就能写到 `~/.ssh/authorized_keys`。
 *
 * @returns 绝对路径；不安全时返回 `null`。
 */
export function safeJoin(root, relative) {
    const rel = (relative ?? '').trim();
    if (!rel || isAbsolute(rel))
        return null;
    const normalizedRoot = resolve(root);
    const target = normalize(resolve(normalizedRoot, rel));
    // 必须仍在根目录内。要带分隔符比较：`/root2` 不能因为前缀是 `/root` 就通过。
    if (target !== normalizedRoot && !target.startsWith(normalizedRoot + sep))
        return null;
    return target;
}
/**
 * 列出某个工作区里 `review/` 下的全部文件。
 *
 * 为什么以**目录**为输入而不是单个文件：导师的交付物可能带子目录
 * （`review/figures/x.png`），服务器要求 `relative_paths` 保留目录层次，
 * 所以必须能枚举出整棵树。
 *
 * @param dir 用户选的工作区目录（会话工作区**或**研究根都行，按 `researchWorkspaceOf` 判）。
 */
export function scanReviewFiles(dir) {
    const researchRoot = researchWorkspaceOf(dir);
    const reviewDir = join(researchRoot, REVIEW_DIR);
    const files = [];
    const walk = (current) => {
        let entries;
        try {
            entries = readdirSync(current);
        }
        catch {
            // 目录不存在 / 读不到：当作"还没有指导结果"，不是错误
            return;
        }
        for (const name of entries) {
            if (name.startsWith('.'))
                continue;
            const abs = join(current, name);
            let isDir = false;
            let size = 0;
            try {
                const st = statSync(abs);
                isDir = st.isDirectory();
                size = st.size;
            }
            catch {
                continue;
            }
            if (isDir) {
                walk(abs);
                continue;
            }
            // 统一用 `/` 分隔：服务器的相对路径约定是 POSIX 风格
            const rel = relative(researchRoot, abs).split(sep).join('/');
            files.push({ relPath: rel, size });
        }
    };
    walk(reviewDir);
    files.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return { researchRoot, reviewDir, files };
}
/** 读一个 `review/` 文件的字节（上传用；路径必须已在 `review/` 下）。 */
export function readReviewFile(researchRoot, relPath) {
    if (!relPath.startsWith(`${REVIEW_DIR}/`)) {
        throw new Error(`只能读取 ${REVIEW_DIR}/ 下的文件（收到 ${relPath}）`);
    }
    const abs = safeJoin(researchRoot, relPath);
    if (!abs)
        throw new Error(`不安全的相对路径：${relPath}`);
    return new Uint8Array(readFileSync(abs));
}
//# sourceMappingURL=workspace-sync.js.map