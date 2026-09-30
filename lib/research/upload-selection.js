/**
 * ConvFusion 2.0 — 上传时**该上传哪些文件**（规则引擎 + 体积核算）
 *
 * 两种用途共用这一份规则（口径差异见 {@link UploadPurpose}）：
 *
 *   - `publish`（默认）：学生把自己的研究发布到网络（`work/uploadPlan`）；
 *   - `mentor`：导师把自己这一份工作区**整包回传**（`mentor/uploadPlan`）——
 *     `review/**` 与论文 PDF 都算推荐，机器产物照样排除。
 *
 * ## 为什么必须先算清楚再上传
 *
 * 一个真实研究工作区可以很大：本机实测某个工作区 **657 MB**，其中
 *
 * ```text
 * research/literature/fulltext/*.pdf   543 MB（别人论文的原文 PDF）
 * .tectonic-cache/ + harness/           89 MB（LaTeX 构建缓存，纯机器产物）
 * research/literature 下的 .txt 抽取文本   19 MB（PDF 抽出来的纯文本）
 * ────────────────────────────────────────────────
 * 而真正对导师有用的：项目定义 / 研究状态 / 计划 / 论文 / 实验 / 证据 / 主张 …
 *                                        约 3 MB（0.5%）
 * ```
 *
 * 全量上传既浪费服务器空间（服务器免费额度 1 GB），也把真正该看的东西埋掉。
 * 所以：**先分类打分，再由用户确认**。
 *
 * ## 三级判定（不是"能/不能"两档）
 *
 * | 级别 | 含义 | 默认 |
 * |---|---|---|
 * | `recommended` | 导师判断"这项研究在做什么、做到哪"需要的 | ✅ 勾选 |
 * | `optional` | 有价值但体积大 / 是原始素材（文献全文、抽取文本、检索报文、单个大文件） | ⬜ 不勾 |
 * | `excluded` | 机器产物或与本研究无关（版本库、依赖、构建缓存、模型权重） | 🚫 不可选 |
 *
 * ⚠️ **一切都要可见**：被排除的文件也要列出来并写明原因，否则用户会以为"漏了"。
 *
 * ## 与小节的对应
 *
 * `plans/**`、`research/evidence|claims|decisions|analysis`、`papers/**`、`experiments/**`
 * 这些路径来自本插件自己的 v2 工作区约定（`research/workspace-layout.ts`）——
 * 规则的依据是"研究资产"，不是文件名猜测。
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
/** 服务器的硬限制（`ConvFusion-server/app/core/config.py`，可用环境变量覆盖）。 */
export const UPLOAD_LIMITS = {
    /** 单文件上限（`MAX_FILE_SIZE`）。 */
    maxFileBytes: 100 * 1024 * 1024,
    /** 单次请求文件数（`MAX_FILES_PER_REQUEST`）。 */
    maxFilesPerRequest: 20,
    /** 单次请求总量（`MAX_UPLOAD_SIZE`）。 */
    maxRequestBytes: 200 * 1024 * 1024,
};
/**
 * 默认"大文件"阈值：超过它的一律降级为 `optional`。
 *
 * 为什么需要这条兜底：规则表再全也会漏（有人把数据集、checkpoint、录屏放在
 * `experiments/` 里）。体积是最诚实的信号 —— 单个文件大于 10 MB 时，
 * 默认不传，但**允许用户手动勾上**。
 */
export const LARGE_FILE_BYTES = 10 * 1024 * 1024;
/* ════════════════════════════════════════════════════════════════════════
 * 规则
 * ════════════════════════════════════════════════════════════════════════ */
function norm(relPath) {
    return relPath.split(sep).join('/');
}
/** 路径是否落在某个目录下（含该目录本身）。 */
function under(relPath, dir) {
    return relPath === dir || relPath.startsWith(`${dir}/`);
}
function ext(relPath) {
    const base = relPath.slice(relPath.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot).toLowerCase() : '';
}
/** 模型权重 / 数据集二进制：永远不该上传（体积大且无解释价值）。 */
const WEIGHT_EXTS = new Set([
    '.safetensors', '.bin', '.pt', '.pth', '.ckpt', '.gguf', '.onnx', '.h5', '.pb', '.mlmodel',
    '.npy', '.npz', '.parquet', '.feather', '.arrow', '.pkl', '.joblib', '.zip', '.tar', '.gz',
]);
/** LaTeX 构建产物（宏包缓存里的字体/格式文件），不是论文源文件。 */
const BUILD_EXTS = new Set(['.fmt', '.index', '.tfm', '.pfb', '.afm', '.otf', '.ttf', '.map', '.pat']);
/**
 * 纯机器产物目录（任意层级）。
 *
 * ⚠️ `.npmcache` / `_cacache` 是 2026-09 补的，代价很实在：某个真实工作区的
 * `papers/paper-main/presentation/.npmcache/_cacache/…` 有 158 个 blob、18.9 MiB，
 * 占那份工作区快照的 **55%**（快照 34.15 MiB = 475 个文件）。它们因为"落在 `papers/**`
 * 下"被判成 `recommended`，于是随发布上传、再被导师原样下载回来 ——
 * 一个 13.6 MB 的 ZIP 里一半是 npm 缓存。
 *
 * 判据仍是"这是不是研究事实"：包管理器的内容寻址缓存不是任何人研究的对象。
 */
const JUNK_DIRS = new Set([
    '.git', 'node_modules', '__pycache__', '.tectonic-cache', '.venv', 'venv',
    '.mypy_cache', '.pytest_cache', '.ruff_cache', '.ipynb_checkpoints',
    // Node/npm 系缓存（`.npmcache` 是 npm 在自定义 cache 目录下自建的）
    '.npmcache', '_cacache', '.cache', '.parcel-cache', '.turbo', '.eslintcache',
    '.pnpm-store', '.yarn', '.next', '.nuxt', '.svelte-kit', '.output',
]);
/** 无扩展名的机器文件。 */
const JUNK_NAME = /^(\.DS_Store|Thumbs\.db|\.gitignore|\.gitattributes)$/i;
/**
 * **备份 / 临时文件**：编辑器、格式化脚本、构建工具留下的中间产物（2026-09 用户要求）。
 *
 * 实测来源：`papers/paper-main/latex/main_bak_20260921021516..tex` × 64 个、3.6 MB ——
 * 一篇论文的 LaTeX 目录里**大多数文件**是这种东西。它们落在 `papers/**` 下，
 * 于是被规则判成"论文与图表"（推荐），随之随发布上传、又被导师原样下载回来。
 *
 * 判据只看**文件名**（与 `JUNK_DIRS` 那样的目录判据互补）：
 *
 * | 形态 | 例 |
 * |---|---|
 * | `bak` 作为独立片段 | `main_bak_2026….tex`、`main.tex.bak`、`main_bak.tex`、`bak.md` |
 * | 编辑器/工具后缀 | `*.orig` `*.rej` `*.swp` `*.swo` `*.tmp` `*.temp` |
 * | 编辑器临时名 | 结尾 `~`（`main.tex~`）、Emacs 自动保存 `#main.tex#` |
 *
 * ⚠️ 片段边界（前一个字符必须是开头或 `.` `_` `-`，后一个必须是 `.` `_` `-` 或结尾）
 * 是**故意的**：正常的词不会误伤 —— `bakeoff.md`、`rebake.py`、`bakehouse` 都照常推荐。
 */
const BACKUP_NAME = /(^|[._-])bak([._-]|$)|\.(orig|rej|swp|swo|tmp|temp)$|~$|^#.*#$/i;
/**
 * 一个文件的**研究资产**归类（`project.md` / `plans/**` / `papers/**` / `review/**` …）。
 *
 * 抽出来是为了让两种用途共用同一张路径表：`publish` 与 `mentor` 的区别只在
 * "`review/` 算不算资产"以及"资产判定与大文件判定谁先"，不在路径归属。
 *
 * @returns 命中的分类；不是研究资产时返回 `null`
 */
function assetCategory(relPath) {
    if (relPath === 'project.md' || relPath === 'research-state.md')
        return 'state';
    if (under(relPath, 'review'))
        return 'review';
    if (under(relPath, 'plans'))
        return 'plans';
    if (under(relPath, 'papers'))
        return 'papers';
    if (under(relPath, 'experiments'))
        return 'experiments';
    if (under(relPath, 'outputs'))
        return 'outputs';
    if (under(relPath, 'research'))
        return 'research-assets';
    return null;
}
/**
 * 判定一个文件。
 *
 * 顺序很重要：**先排除**（机器产物/权重），**再看是否原始素材**（optional），
 * 最后按研究资产目录判 recommended。反过来的话 `research/literature/fulltext/*.pdf`
 * 会因为落在 `research/**` 下而被误判为推荐。
 *
 * ⚠️ `mentor` 用途把"研究资产"提到"≥10 MB"**之前**，见 {@link UploadPurpose}：
 * 导师自己写的论文 PDF 常常就是这份工作区里最大的研究资产，不能因为大而降级成"默认不传"。
 */
export function classify(relPath, size, purpose = 'publish') {
    const p = norm(relPath);
    const parts = p.split('/');
    // ① 机器产物：任何一层是构建/依赖目录，或文件名/扩展名属于机器产物
    if (parts.some((seg) => JUNK_DIRS.has(seg)))
        return { categoryId: 'build-artifacts', decision: 'excluded' };
    if (JUNK_NAME.test(parts[parts.length - 1] ?? ''))
        return { categoryId: 'build-artifacts', decision: 'excluded' };
    // 备份 / 临时文件（`main_bak_….tex`、`*.bak`、`*~`、`#…#`）同样是机器产物
    if (BACKUP_NAME.test(parts[parts.length - 1] ?? ''))
        return { categoryId: 'build-artifacts', decision: 'excluded' };
    if (BUILD_EXTS.has(ext(p)))
        return { categoryId: 'build-artifacts', decision: 'excluded' };
    if (WEIGHT_EXTS.has(ext(p)))
        return { categoryId: 'models-data', decision: 'excluded' };
    // `harness/` 是 DSH 运行期产物（会话/缓存），不属于研究内容
    if (under(p, 'harness'))
        return { categoryId: 'runtime-artifacts', decision: 'excluded' };
    // ② 原始素材 / 大文件：有价值但默认不传
    if (under(p, 'research/literature/fulltext'))
        return { categoryId: 'literature-fulltext', decision: 'optional' };
    // 文献目录里的**文档本体**（不限 fulltext/ 子目录）同样算"原文"：
    // 实测有 8 MB 的 pdf 落在 research/literature/<子目录>/ 下，按目录名判定会漏。
    if (under(p, 'research/literature') && ['.pdf', '.ps', '.djvu', '.epub'].includes(ext(p))) {
        return { categoryId: 'literature-fulltext', decision: 'optional' };
    }
    if (under(p, 'research/literature') && ['.txt', '.json', '.html', '.xml'].includes(ext(p))) {
        return { categoryId: 'literature-raw', decision: 'optional' };
    }
    if (purpose === 'mentor') {
        // ③（导师口径）研究资产先于体积：论文 PDF、图表、指导结果都要能回传
        const asset = assetCategory(p);
        if (asset)
            return { categoryId: asset, decision: 'recommended' };
        if (size >= LARGE_FILE_BYTES)
            return { categoryId: 'large-files', decision: 'optional' };
        return { categoryId: 'others', decision: 'optional' };
    }
    if (size >= LARGE_FILE_BYTES)
        return { categoryId: 'large-files', decision: 'optional' };
    // ③ 研究资产：推荐
    const asset = assetCategory(p);
    if (asset) {
        /*
         * 评阅记录（`review/`）：与 `research/` 平级的一层，**上传时排除**（2026-09 用户拍板）。
         *
         * 为什么排除而不是推荐：
         *   1. 这一层里的导师指导结果**本来就是从服务器下来的**（导师写 → 上传 → 学生下载），
         *      再原样传回去是一次回声，最好的情况是空操作；
         *   2. 学生的自查记录属于"研究的判断过程"，不是要对外发布的研究事实；
         *   3. 学生的评阅与导师的指导混在同一层，学生无从分辨哪些是别人的 —— 一律不传最省事。
         *
         * ⚠️ 这只影响**学生的发布/更新**（`work/publish` 走本函数）。
         * 导师【上传】走的是另一条通道：`mentor` 用途把 `review/` 判成 `recommended`
         * （见 {@link UploadPurpose}）—— 指导结果正是他要带回去的东西。这一条不对称是刻意的，
         * 两种口径各有断言钉住。
         */
        if (asset === 'review')
            return { categoryId: 'review', decision: 'excluded' };
        return { categoryId: asset, decision: 'recommended' };
    }
    // ④ 其余：默认不传，但可选（用户自己的东西，不该被判死）
    return { categoryId: 'others', decision: 'optional' };
}
/** 分类顺序（对话框里的显示顺序；推荐在前，排除在后）。 */
export const CATEGORY_ORDER = [
    'state',
    'plans',
    'papers',
    'experiments',
    'research-assets',
    'review',
    'outputs',
    'literature-raw',
    'literature-fulltext',
    'large-files',
    'others',
    'runtime-artifacts',
    'build-artifacts',
    'models-data',
];
/** 是否可被用户勾选（`excluded` 不可选）。 */
export function isSelectable(decision) {
    return decision !== 'excluded';
}
/* ════════════════════════════════════════════════════════════════════════
 * 扫描
 * ════════════════════════════════════════════════════════════════════════ */
/** 统计一个目录的体积与文件数（只用于"被整枝跳过的机器产物"对账）。 */
function measureDir(dir, budget = 20000) {
    let bytes = 0;
    let files = 0;
    const walk = (d) => {
        let entries;
        try {
            entries = readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (files >= budget)
                return;
            const abs = join(d, e.name);
            if (e.isSymbolicLink())
                continue;
            if (e.isDirectory()) {
                walk(abs);
                continue;
            }
            if (!e.isFile())
                continue;
            try {
                bytes += statSync(abs).size;
                files += 1;
            }
            catch {
                /* 读不到就不计 */
            }
        }
    };
    walk(dir);
    return { bytes, files };
}
/** 扫描上限（防御性：某些工作区可能塞了几十万个文件）。 */
export const SCAN_MAX_FILES = 20000;
/**
 * 扫描研究根目录并给出上传计划。
 *
 * - 不跟随符号链接（避免环 / 指到工作区外）；
 * - 只有**被排除**的分类会被跳过目录（省时间），其余照常统计；
 * - 单个目录读不动（权限等）→ 跳过，不让整份计划失败。
 *
 * @param purpose `publish` = 学生发布（默认，口径与历史一致）；
 *   `mentor` = 导师整包回传（`review/**` 与论文 PDF 都算推荐，见 {@link UploadPurpose}）
 */
export function buildUploadPlan(root, purpose = 'publish') {
    const files = [];
    /** 整枝跳过的机器产物目录：按**分类**累计体积/计数（分类行也要算得平）。 */
    const skipped = new Map();
    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (files.length >= SCAN_MAX_FILES)
                return;
            const abs = join(dir, entry.name);
            const relPath = norm(relative(root, abs));
            if (entry.isSymbolicLink())
                continue;
            if (entry.isDirectory()) {
                // 只在**已知是机器产物目录**时整枝跳过（其它目录里的文件仍需按规则判定）
                if (JUNK_DIRS.has(entry.name) || relPath === 'harness') {
                    // ⚠️ 整枝跳过，但**要把体积与文件数算进去**：否则"全部 = 推荐+可选+排除"
                    // 这条账对不上（实测漏掉 89 MB 的 LaTeX 缓存，看起来像文件凭空少了）。
                    const stat = measureDir(abs);
                    const { categoryId, decision } = classify(relPath, 0, purpose);
                    files.push({ relPath: `${relPath}/`, size: 0, categoryId, decision });
                    skipped.set(categoryId, {
                        bytes: (skipped.get(categoryId)?.bytes ?? 0) + stat.bytes,
                        files: (skipped.get(categoryId)?.files ?? 0) + stat.files,
                    });
                    continue;
                }
                walk(abs);
                continue;
            }
            if (!entry.isFile())
                continue;
            let size = 0;
            try {
                size = statSync(abs).size;
            }
            catch {
                continue;
            }
            const { categoryId, decision } = classify(relPath, size, purpose);
            files.push({ relPath, size, categoryId, decision });
        }
    };
    walk(root);
    const byCategory = new Map();
    for (const f of files) {
        // 目录占位项（`xxx/`）只用于把"被整枝跳过的目录"展示给用户，不计入体积/文件数
        const isPlaceholder = f.relPath.endsWith('/');
        const cat = byCategory.get(f.categoryId) ?? {
            id: f.categoryId,
            decision: f.decision,
            files: [],
            bytes: 0,
        };
        if (!isPlaceholder) {
            cat.files.push({ relPath: f.relPath, size: f.size });
            cat.bytes += f.size;
        }
        else {
            cat.files.push({ relPath: f.relPath, size: 0 });
            // 被整枝跳过的目录：把实测体积记到本分类（保证"分类之和 = 全部"）
            const extra = skipped.get(f.categoryId);
            if (extra)
                cat.bytes += extra.bytes;
        }
        byCategory.set(f.categoryId, cat);
    }
    const categories = [...byCategory.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.id) - CATEGORY_ORDER.indexOf(b.id));
    for (const c of categories)
        c.files.sort((a, b) => a.relPath.localeCompare(b.relPath));
    const sum = (d) => {
        let bytes = 0;
        let files = 0;
        for (const c of categories) {
            if (c.decision !== d)
                continue;
            bytes += c.bytes;
            files += c.files.filter((f) => !f.relPath.endsWith('/')).length;
            files += skipped.get(c.id)?.files ?? 0; // 被整枝跳过的目录里的文件数
        }
        return { bytes, files };
    };
    const all = sum('recommended');
    const optional = sum('optional');
    const excluded = sum('excluded');
    const defaultSelection = [];
    const oversize = [];
    for (const c of categories) {
        if (c.decision !== 'recommended')
            continue;
        for (const f of c.files) {
            if (f.relPath.endsWith('/'))
                continue;
            if (f.size > UPLOAD_LIMITS.maxFileBytes) {
                oversize.push({ relPath: f.relPath, size: f.size });
                continue;
            }
            defaultSelection.push(f.relPath);
        }
    }
    return {
        root,
        categories,
        totals: {
            // ⚠️ 分类的 bytes 已包含"整枝跳过的机器产物目录"的实测体积（见上面 cat.bytes +=），
            // 所以这里**不能**再加一次，否则总账会翻倍（第一版就是这样）。
            allBytes: all.bytes + optional.bytes + excluded.bytes,
            allFiles: all.files + optional.files + excluded.files,
            recommendedBytes: all.bytes,
            recommendedFiles: all.files,
            optionalBytes: optional.bytes,
            optionalFiles: optional.files,
            excludedBytes: excluded.bytes,
            excludedFiles: excluded.files,
        },
        limits: UPLOAD_LIMITS,
        defaultSelection,
        oversize,
        requestCount: Math.max(1, Math.ceil(defaultSelection.length / UPLOAD_LIMITS.maxFilesPerRequest)),
    };
}
/**
 * 把用户的选择整理成**上传批次**（服务器：≤20 个文件 / ≤200 MB 每次）。
 *
 * 超过单文件上限的文件**不会**进批次，而是出现在 `skipped` 里 ——
 * 让界面如实告诉用户"这几个传不上去"，而不是等服务器 413。
 */
export function planUploadBatches(root, selection) {
    const skipped = [];
    const batches = [];
    let current = [];
    let currentBytes = 0;
    let total = 0;
    for (const relPath of [...selection].sort()) {
        const abs = join(root, relPath);
        let size = 0;
        try {
            size = statSync(abs).size;
        }
        catch {
            continue; // 已经被删除的文件：跳过，不阻塞发布
        }
        total += size;
        if (size > UPLOAD_LIMITS.maxFileBytes) {
            skipped.push({ relPath, size });
            continue;
        }
        if (current.length >= UPLOAD_LIMITS.maxFilesPerRequest ||
            currentBytes + size > UPLOAD_LIMITS.maxRequestBytes) {
            if (current.length)
                batches.push(current);
            current = [];
            currentBytes = 0;
        }
        current.push(relPath);
        currentBytes += size;
    }
    if (current.length)
        batches.push(current);
    return { batches, skipped, bytes: total };
}
//# sourceMappingURL=upload-selection.js.map