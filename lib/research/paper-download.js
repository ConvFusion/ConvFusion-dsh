/**
 * ConvFusion 2.0 — 论文全文下载（Paper Full-Text Download）
 *
 * ## 它补的是哪个洞
 *
 * 做基准 / 基线对比时，要从论文全文里抽取数据集名称、评测指标、实验设置等要素。
 * `research_literature_search` 能查到题录与摘要，但摘要不含这些细节 —— 必须读全文。
 * 通用网页检索（web_fetch）拿到的是 HTML 渲染页，对 PDF 论文（arXiv / 出版商）无能为力。
 *
 * 本模块是那条"把一篇 OpenAlex 记录变成工作区里的全文文件"的**窄工具**：
 *
 *   - 从 OpenAlex 记录的链接字段推导出**候选下载 URL**（PDF 直链优先 → OA 全文 → 落地页 → DOI）；
 *   - 对 arXiv / ACL Anthology 这类**稳定公开源**，从落地页/DOI 推导出 PDF 直链；
 *   - 真的把字节流拉下来，**校验是不是 PDF**（`%PDF-`）；
 *   - 落盘到 `research/literature/fulltext/`，带**自增序号**的文件名；
 *   - 同时维护一个 `manifest.json`（序号 → 论文元信息 → 文件 → 来源 URL），让后续抽取可追溯；
 *   - **拉不到全文**时不静默失败：生成一个同名占位 `.txt`，写清"未拿到全文 + 用户自取链接"，
 *     用户手动下载后替换同名文件即可被后续流程识别。
 *
 * ## 三条约束（沿用 literature.ts）
 *
 * 1. **失败必须说清原因**：网络失败 / 非 PDF / 403 都要带原因返回，不能返回空结果冒充"下载成功"。
 * 2. **序号稳定**：manifest 是单一事实来源；序号按下载顺序自增、不复用、不重排。
 * 3. **纯函数可离线测**：URL 推导、文件名构造、manifest 读写都不依赖网络。
 *
 * ## 与 literature.ts 的关系
 *
 * literature.ts 负责"检索"（题录 + provenance）；本模块负责"取全文"（字节流 + 落盘）。
 * 检索结果的链接字段（pdfUrl / openAccessUrl / landingPageUrl / doi）是本模块的输入。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/* ════════════════════════════════════════════════════════════════════════
 * 常量
 * ════════════════════════════════════════════════════════════════════════ */
/** 全文落盘目录（相对 workspace）。与 literature runtime 同级，便于后续抽取流程定位。 */
export const FULLTEXT_DIR = 'research/literature/fulltext';
/** manifest 文件名。序号 → 下载记录的单一事实来源。 */
export const FULLTEXT_MANIFEST = `${FULLTEXT_DIR}/manifest.json`;
/** 下载超时（毫秒）。论文 PDF 可达数 MB 且学术源常较慢，需足够宽松。 */
export const DOWNLOAD_TIMEOUT_MS = 120000;
/** 单文件大小上限（字节）。防异常响应灌爆工作区；50 MB 足够任何论文 PDF。 */
export const DOWNLOAD_MAX_BYTES = 50 * 1024 * 1024;
/** PDF 魔数。 */
const PDF_MAGIC = '%PDF-';
/**
 * arXiv 标识符正则。
 * 匹配 `arxiv.org/abs/2402.17753`、`arxiv.org/pdf/2402.17753.pdf`、
 * `arxiv.org/abs/2402.17753v2` 以及新版 `arxiv.org/abs/2305.10601` 等。
 */
const ARXIV_RE = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+\/[0-9]{7}(?:v[0-9]+)?)/i;
/** 从任意 URL 提取 arXiv id。 */
export function extractArxivId(url) {
    if (!url)
        return undefined;
    const m = url.match(ARXIV_RE);
    return m ? m[1] : undefined;
}
/**
 * 从 DOI（`https://doi.org/10.xxx` 或裸 `10.xxx`）提取 DOI 字符串。
 */
export function extractDoi(doi) {
    if (!doi)
        return undefined;
    const trimmed = doi.trim();
    if (!trimmed)
        return undefined;
    // OpenAlex 给的是 URL 形式
    const m = trimmed.match(/doi\.org\/(10\..+)$/i);
    if (m)
        return m[1];
    if (/^10\./.test(trimmed))
        return trimmed;
    return undefined;
}
/**
 * ACL Anthology 落地页 → PDF 直链。
 * `aclanthology.org/2024.acl-long.123/` → `.../2024.acl-long.123.pdf`
 */
function aclToPdf(url) {
    const m = url.match(/aclanthology\.org\/([0-9]{4}\.[a-z\-]+\.[0-9]+)\/?/i);
    if (!m)
        return undefined;
    return `https://aclanthology.org/${m[1]}.pdf`;
}
/**
 * 把一篇论文的链接字段解析为**有序候选下载 URL 列表**。
 *
 * 优先级（稳定公开源优先，落地页兜底）：
 *   1. `pdfUrl`（OpenAlex 已识别的直链 PDF）
 *   2. `openAccessUrl`（OA 全文 —— 多数是 PDF 或 HTML 落地页）
 *   3. arXiv 推导（从任意字段命中 arXiv id → `arxiv.org/pdf/<id>`）
 *   4. ACL Anthology 推导（落地页 → `.pdf`）
 *   5. `landingPageUrl`（出版商落地页 —— 可能是 HTML，需后续判断）
 *   6. `doi`（DOI resolver —— 通常到落地页）
 *
 * 去重，保持顺序。纯函数：不联网。
 */
export function resolveDownloadCandidates(links) {
    const out = [];
    const seen = new Set();
    const push = (url, source) => {
        if (!url)
            return;
        const u = url.trim();
        if (!u || seen.has(u))
            return;
        seen.add(u);
        out.push({ url: u, source });
    };
    // 1) 直链 PDF
    push(links.pdfUrl, 'pdf_direct');
    // 2) OA 全文
    push(links.openAccessUrl, 'oa_url');
    // 3) arXiv：从任意字段命中 id → PDF 直链（arXiv 是最稳定的开放源）
    const fields = [links.id, links.doi, links.openAccessUrl, links.landingPageUrl, links.pdfUrl];
    for (const f of fields) {
        const aid = extractArxivId(f);
        if (aid) {
            push(`https://arxiv.org/pdf/${aid}`, 'arxiv_derived');
            break; // 同一篇的多个字段会命中同一个 id，取一次
        }
    }
    // 4) ACL Anthology：落地页 → PDF
    if (links.landingPageUrl) {
        const aclPdf = aclToPdf(links.landingPageUrl);
        push(aclPdf, 'acl_derived');
    }
    // 5) 落地页
    push(links.landingPageUrl, 'landing');
    // 6) DOI
    const doi = extractDoi(links.doi);
    if (doi)
        push(`https://doi.org/${doi}`, 'doi');
    return out;
}
/* ════════════════════════════════════════════════════════════════════════
 * 文件名与占位（纯函数）
 * ════════════════════════════════════════════════════════════════════════ */
/**
 * 把标题收敛成安全的文件名基名（去掉路径分隔符与控制字符，限长）。
 * 不含序号与扩展名 —— 序号由 manifest 决定，扩展名由下载结果决定。
 */
export function slugifyTitle(title) {
    const raw = (title ?? '').trim() || 'untitled';
    // 去掉文件系统危险字符与控制字符
    const cleaned = raw
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // 限长：避免过长文件名
    return cleaned.length > 80 ? `${cleaned.slice(0, 80)}…` : cleaned;
}
/**
 * 构造带序号的文件名。
 * - 成功下载 PDF：`<seq>_<slug>.pdf`
 * - 成功下载 HTML 全文：`<seq>_<slug>.html`
 * - 占位：`<seq>_<slug>.txt`
 */
export function buildFilename(seq, slug, ext) {
    return `${String(seq).padStart(3, '0')}_${slug}.${ext}`;
}
/**
 * 构造占位文件内容：用户拿到后按提示自取全文，替换同名文件即可。
 */
export function buildPlaceholderContent(meta) {
    const lines = [
        '# 论文全文未自动下载（占位文件）',
        '',
        `序号：${meta.seq}`,
        `标题：${meta.title ?? '(未知)'}`,
        `原因：${meta.reason}`,
        '',
        '## 候选下载链接（请手动下载全文，下载后用同名的 PDF / HTML 替换本文件）',
        '',
    ];
    for (const c of meta.candidates) {
        lines.push(`- [${c.source}] ${c.url}`);
    }
    lines.push('', '## 替换说明', '', '将本 .txt 删除，把下载到的全文命名为同名 .pdf（或 .html）放进本目录，', '后续论文要素抽取流程会自动识别。');
    return `${lines.join('\n')}\n`;
}
/** manifest 版本。 */
const MANIFEST_VERSION = 1;
/** 读 manifest（不存在返回空 manifest）。纯 I/O，不抛。 */
export function readManifest(workspace) {
    const abs = join(workspace, FULLTEXT_MANIFEST);
    try {
        const raw = readFileSync(abs, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            version: typeof parsed.version === 'number' ? parsed.version : MANIFEST_VERSION,
            nextSeq: typeof parsed.nextSeq === 'number' && parsed.nextSeq > 0 ? parsed.nextSeq : 1,
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        };
    }
    catch {
        return { version: MANIFEST_VERSION, nextSeq: 1, entries: [] };
    }
}
/** 写 manifest（幂等覆盖）。纯 I/O。 */
export function writeManifest(workspace, manifest) {
    const abs = join(workspace, FULLTEXT_DIR);
    if (!existsSync(abs))
        mkdirSync(abs, { recursive: true });
    writeFileSync(join(workspace, FULLTEXT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
/** 分配下一个序号并写入一条记录，返回新记录与新 manifest。 */
export function appendManifestEntry(workspace, entry) {
    const manifest = readManifest(workspace);
    const seq = manifest.nextSeq;
    const full = { ...entry, seq };
    manifest.entries.push(full);
    manifest.nextSeq = seq + 1;
    writeManifest(workspace, manifest);
    return { entry: full, manifest };
}
/**
 * 写入一条已分配序号的记录（序号由调用方从 manifest 决定）。
 * 用于"先拿序号定文件名、再写文件、最后登记记录"的流程，避免重复读 manifest。
 */
export function writeManifestEntry(workspace, manifest, entry) {
    manifest.entries.push(entry);
    manifest.nextSeq = Math.max(manifest.nextSeq, entry.seq + 1);
    writeManifest(workspace, manifest);
    return manifest;
}
/** 判断字节是否为 PDF（魔数）。 */
export function isPdf(bytes) {
    if (bytes.length < 5)
        return false;
    return (bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46 &&
        bytes[4] === 0x2d); // %PDF-
}
/** 判断字节是否像 HTML（宽松：含 `<html` 或 `<!doctype html`）。 */
export function looksLikeHtml(bytes) {
    if (bytes.length < 8)
        return false;
    // 只取前 2KB 判断，避免大文件全扫
    const head = Buffer.from(bytes.slice(0, 2048)).toString('utf8').toLowerCase();
    return head.includes('<!doctype html') || head.includes('<html');
}
/**
 * 尝试下载一个候选 URL。
 *
 * 对每个候选：fetch → 取字节 → 判断是否 PDF（首选）/ HTML（次选）。
 * 非 PDF 非 HTML、4xx/5xx、超时、超大都会跳到下一个候选。
 * 全部失败时返回带原因的 `ok: false`。
 */
export async function downloadFromCandidates(candidates, deps) {
    const doFetch = deps.fetchImpl ?? globalThis.fetch;
    const timeoutMs = deps.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
    if (candidates.length === 0) {
        return { ok: false, kind: 'txt', reason: '没有可用的候选下载链接（该论文可能无开放获取全文）。' };
    }
    const failures = [];
    for (const c of candidates) {
        const ac = new AbortController();
        let timedOut = false;
        // 超时只针对"连不上 / 拿不到响应头"。一旦拿到响应头就清掉定时器，
        // 让正文传输不被打断（arXiv 等 1.6 MB PDF 的 body 传输可达数十秒）。
        let timer = setTimeout(() => {
            timedOut = true;
            ac.abort();
        }, timeoutMs);
        try {
            const res = await doFetch(c.url, {
                headers: {
                    accept: 'application/pdf,text/html,*/*;q=0.8',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: ac.signal,
                redirect: 'follow',
            });
            // 拿到响应头：清掉连接超时，正文传输不再受 timeoutMs 限制
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            if (!res.ok) {
                failures.push(`${c.source}: HTTP ${res.status}`);
                continue;
            }
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf);
            // 体积上限
            if (bytes.length > DOWNLOAD_MAX_BYTES) {
                failures.push(`${c.source}: 文件过大 (${bytes.length} bytes > ${DOWNLOAD_MAX_BYTES})`);
                continue;
            }
            // 空响应
            if (bytes.length === 0) {
                failures.push(`${c.source}: 空响应`);
                continue;
            }
            if (isPdf(bytes)) {
                return { ok: true, kind: 'pdf', bytes, downloadedFrom: c.url, source: c.source };
            }
            if (looksLikeHtml(bytes)) {
                return { ok: true, kind: 'html', bytes, downloadedFrom: c.url, source: c.source };
            }
            failures.push(`${c.source}: 非 PDF/HTML 内容`);
        }
        catch (e) {
            failures.push(timedOut
                ? `${c.source}: 连接超时（${Math.round(timeoutMs / 1000)}s 无响应头）`
                : `${c.source}: ${e instanceof Error ? e.message : String(e)}`);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    return {
        ok: false,
        kind: 'txt',
        reason: `全部候选源下载失败 —— ${failures.join('；')}。该论文可能无开放获取全文，或需机构权限。`,
    };
}
/**
 * 下载一篇论文全文到工作区，并登记 manifest。
 *
 * - 解析候选 URL → 逐个尝试下载；
 * - 拿到 PDF/HTML → 落盘 `research/literature/fulltext/<seq>_<slug>.<ext>`；
 * - 拿不到 → 生成同名 `.txt` 占位（含候选链接，用户自取替换）；
 * - 无论成败都写一条 manifest 记录。
 *
 * @param workspace 研究 workspace 根目录（绝对路径）
 * @param input 下载参数
 * @param deps 下载依赖
 */
export async function downloadPaper(workspace, input, deps) {
    const candidates = resolveDownloadCandidates(input.links);
    const slug = slugifyTitle(input.title);
    const dirAbs = join(workspace, FULLTEXT_DIR);
    if (!existsSync(dirAbs))
        mkdirSync(dirAbs, { recursive: true });
    const outcome = await downloadFromCandidates(candidates, deps);
    const createdAt = new Date().toISOString();
    // 先取序号（manifest 是序号的单一事实来源），再据序号定文件名、落盘、登记。
    const manifest = readManifest(workspace);
    const seq = manifest.nextSeq;
    if (outcome.ok && outcome.bytes) {
        const ext = outcome.kind; // 'pdf' | 'html'
        const filename = buildFilename(seq, slug, ext);
        writeFileSync(join(dirAbs, filename), outcome.bytes);
        writeManifestEntry(workspace, manifest, {
            seq,
            title: input.title,
            ...(input.links.id ? { openalexId: input.links.id } : {}),
            ...(input.links.doi ? { doi: input.links.doi } : {}),
            filename,
            path: `${FULLTEXT_DIR}/${filename}`,
            kind: ext,
            placeholder: false,
            ...(outcome.downloadedFrom ? { downloadedFrom: outcome.downloadedFrom } : {}),
            ...(outcome.source ? { source: outcome.source } : {}),
            createdAt,
            bytes: outcome.bytes.length,
        });
        return {
            seq,
            filename,
            path: `${FULLTEXT_DIR}/${filename}`,
            kind: ext,
            placeholder: false,
            ...(outcome.downloadedFrom ? { downloadedFrom: outcome.downloadedFrom } : {}),
        };
    }
    // 占位：无法下载全文 —— 写同名 .txt，含候选链接供用户自取替换
    const placeholderName = buildFilename(seq, slug, 'txt');
    const placeholderContent = buildPlaceholderContent({
        title: input.title,
        seq,
        candidates,
        reason: outcome.reason ?? '未知原因',
    });
    writeFileSync(join(dirAbs, placeholderName), placeholderContent, 'utf8');
    writeManifestEntry(workspace, manifest, {
        seq,
        title: input.title,
        ...(input.links.id ? { openalexId: input.links.id } : {}),
        ...(input.links.doi ? { doi: input.links.doi } : {}),
        filename: placeholderName,
        path: `${FULLTEXT_DIR}/${placeholderName}`,
        kind: 'txt',
        placeholder: true,
        candidates,
        createdAt,
        reason: outcome.reason,
    });
    return {
        seq,
        filename: placeholderName,
        path: `${FULLTEXT_DIR}/${placeholderName}`,
        kind: 'txt',
        placeholder: true,
        reason: outcome.reason,
    };
}
//# sourceMappingURL=paper-download.js.map