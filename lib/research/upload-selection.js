/**
 * ConvFusion 2.0 — 发布时**该上传哪些文件**（规则引擎 + 体积核算）
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
/** 纯机器产物目录（任意层级）。 */
const JUNK_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.tectonic-cache', '.venv', 'venv', '.mypy_cache', '.pytest_cache']);
/** 无扩展名的机器文件。 */
const JUNK_NAME = /^(\.DS_Store|Thumbs\.db|\.gitignore|\.gitattributes)$/i;
/**
 * 判定一个文件。
 *
 * 顺序很重要：**先排除**（机器产物/权重），**再看是否原始素材**（optional），
 * 最后按研究资产目录判 recommended。反过来的话 `research/literature/fulltext/*.pdf`
 * 会因为落在 `research/**` 下而被误判为推荐。
 */
export function classify(relPath, size) {
    const p = norm(relPath);
    const parts = p.split('/');
    // ① 机器产物：任何一层是构建/依赖目录，或文件名/扩展名属于机器产物
    if (parts.some((seg) => JUNK_DIRS.has(seg)))
        return { categoryId: 'build-artifacts', decision: 'excluded' };
    if (JUNK_NAME.test(parts[parts.length - 1] ?? ''))
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
    if (size >= LARGE_FILE_BYTES)
        return { categoryId: 'large-files', decision: 'optional' };
    // ③ 研究资产：推荐
    if (p === 'project.md' || p === 'research-state.md')
        return { categoryId: 'state', decision: 'recommended' };
    if (under(p, 'plans'))
        return { categoryId: 'plans', decision: 'recommended' };
    if (under(p, 'papers'))
        return { categoryId: 'papers', decision: 'recommended' };
    if (under(p, 'experiments'))
        return { categoryId: 'experiments', decision: 'recommended' };
    if (under(p, 'outputs'))
        return { categoryId: 'outputs', decision: 'recommended' };
    if (under(p, 'research'))
        return { categoryId: 'research-assets', decision: 'recommended' };
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
 */
export function buildUploadPlan(root) {
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
                    const { categoryId, decision } = classify(relPath, 0);
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
            const { categoryId, decision } = classify(relPath, size);
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