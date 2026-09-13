#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 论文全文下载（paper-download）验证。
 *
 * ## 它守的是什么
 *
 * `research_paper_download` 把 OpenAlex 检索记录变成工作区里的全文文件：
 * 候选 URL 解析 → 下载 → PDF/HTML 校验 → 带序号落盘 → manifest 登记；
 * 拉不到全文则生成同名占位 .txt（用户自取替换）。
 *
 * 本套验证（**默认不联网**，与仓库其它 verify-*.mjs 一致）守住：
 *
 *   1. 纯函数：arXiv id / DOI 提取、候选 URL 解析（pdf 直链→OA→arXiv→ACL→落地页→DOI）、
 *      文件名构造、PDF/HTML 魔数检测、占位内容；
 *   2. manifest：序号自增稳定、条目写入不丢字段；
 *   3. 下载执行（mock fetch）：PDF 成功落盘、HTTP 失败带原因、非 PDF 内容回退；
 *   4. 占位路径：下载全失败 → 同名 .txt + manifest 标 placeholder；
 *   5. 工具层：已注册、注入依赖后可执行 candidates/list、缺链接时 download 报原因；
 *   6. Skill 指向真实工具（否则选择到了也不知道怎么执行）。
 *
 * 用法：
 *   node scripts/verify-paper-download.mjs            # 默认：不联网
 *   node scripts/verify-paper-download.mjs --live     # 额外跑一次真实 arXiv 下载（慢，~90s）
 */
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const DL = await import(lib('research/paper-download.js'))
const TOOLS = await import(lib('research/research-tools.js'))

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) {
    passed++
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(actual, expect, label) {
  const ok = Object.is(actual, expect)
  if (ok) {
    passed++
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}\n    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expect)}`)
  }
}

/* ── 1. arXiv / DOI 提取 ──────────────────────────────────────────── */
console.log('\n[1] arXiv id / DOI 提取（纯函数）')
{
  assertEq(DL.extractArxivId('https://arxiv.org/abs/2402.17753'), '2402.17753', 'abs 页提取')
  assertEq(DL.extractArxivId('https://arxiv.org/pdf/2502.12110.pdf'), '2502.12110', 'pdf 页提取')
  assertEq(DL.extractArxivId('https://arxiv.org/abs/2402.17753v2'), '2402.17753v2', '带版本号提取')
  assertEq(DL.extractArxivId('https://example.com/x'), undefined, '非 arxiv 返回 undefined')
  assertEq(DL.extractArxivId(undefined), undefined, 'undefined 输入')

  assertEq(DL.extractDoi('https://doi.org/10.18653/v1/2024.acl-long.123'), '10.18653/v1/2024.acl-long.123', 'URL 形式 DOI')
  assertEq(DL.extractDoi('10.18653/v1/2024.acl-long.123'), '10.18653/v1/2024.acl-long.123', '裸 DOI')
  assertEq(DL.extractDoi(undefined), undefined, 'undefined DOI')
}

/* ── 2. 候选 URL 解析 ─────────────────────────────────────────────── */
console.log('\n[2] 候选 URL 解析（纯函数）')
{
  // 完整 OpenAlex 记录：pdf 直链第一（CDN 独立 URL，避免与 OA/ACL 推导撞 URL 被去重）
  const c1 = DL.resolveDownloadCandidates({
    doi: 'https://doi.org/10.18653/v1/2024.acl-long.123',
    landingPageUrl: 'https://aclanthology.org/2024.acl-long.123/',
    openAccessUrl: 'https://aclanthology.org/2024.acl-long.123.pdf',
    pdfUrl: 'https://cdn.example.com/paper.pdf',
  })
  assertEq(c1[0]?.source, 'pdf_direct', 'pdf 直链第一')
  assert(c1.some((c) => c.source === 'oa_url' && c.url === 'https://aclanthology.org/2024.acl-long.123.pdf'), 'OA 全文在候选里')
  // acl_derived 与 oa_url 是同 URL，被去重正确跳过 —— 单测 ACL 推导本身
  assert(c1.some((c) => c.source === 'landing'), '落地页在候选里')
  assert(c1.some((c) => c.source === 'doi'), 'DOI 在候选里')
  assertEq(new Set(c1.map((c) => c.url)).size, c1.length, '候选去重')

  // ACL 落地页 → PDF 直链推导（独立验证）
  const cAcl = DL.resolveDownloadCandidates({ landingPageUrl: 'https://aclanthology.org/2024.acl-long.123/' })
  assert(cAcl.some((c) => c.source === 'acl_derived' && c.url === 'https://aclanthology.org/2024.acl-long.123.pdf'), 'ACL 落地页推导 PDF')

  // 只有 arXiv 落地页 → 推导出 pdf 直链
  const c2 = DL.resolveDownloadCandidates({ landingPageUrl: 'https://arxiv.org/abs/2402.17753' })
  assert(c2.some((c) => c.source === 'arxiv_derived' && c.url === 'https://arxiv.org/pdf/2402.17753'), 'arXiv 落地页推导 PDF')

  // 空输入 → 空候选
  assertEq(DL.resolveDownloadCandidates({}).length, 0, '空链接 → 空候选')
}

/* ── 3. 文件名与内容检测 ──────────────────────────────────────────── */
console.log('\n[3] 文件名与内容检测（纯函数）')
{
  assert(!DL.slugifyTitle('a/b\\c:d*e?f"g<h>i|j').includes('/'), '文件名清理路径分隔符')
  assert(DL.slugifyTitle('').length > 0, '空标题回退 untitled')
  assert(DL.slugifyTitle('x'.repeat(200)).length <= 82, '超长标题限长')
  assertEq(DL.buildFilename(7, 'Think Parallax', 'pdf'), '007_Think Parallax.pdf', '序号补零 + 扩展名')
  assertEq(DL.buildFilename(1, 'untitled', 'txt'), '001_untitled.txt', '占位扩展名 txt')

  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]) // %PDF-
  assertEq(DL.isPdf(pdfBytes), true, 'PDF 魔数命中')
  assertEq(DL.isPdf(new Uint8Array([1, 2, 3])), false, '短字节非 PDF')
  const htmlBytes = new TextEncoder().encode('<!DOCTYPE html><html><body>x</body></html>')
  assertEq(DL.looksLikeHtml(htmlBytes), true, 'HTML doctype 命中')
  assertEq(DL.looksLikeHtml(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false, 'PNG 非 HTML')

  const ph = DL.buildPlaceholderContent({ title: 'T', seq: 3, candidates: [{ url: 'https://x', source: 'doi' }], reason: '网络失败' })
  assert(ph.includes('3') && ph.includes('https://x') && ph.includes('网络失败'), '占位内容含序号/链接/原因')
}

/* ── 4. manifest 读写 ─────────────────────────────────────────────── */
console.log('\n[4] manifest 读写')
{
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-dl-manifest-'))
  const empty = DL.readManifest(ws)
  assertEq(empty.nextSeq, 1, '空 manifest 起始序号 1')
  assertEq(empty.entries.length, 0, '空 manifest 无条目')

  const { entry } = DL.appendManifestEntry(ws, {
    title: 'A', filename: '001_A.pdf', path: 'research/literature/fulltext/001_A.pdf',
    kind: 'pdf', placeholder: false, createdAt: 'now',
  })
  assertEq(entry.seq, 1, '第一条序号 1')
  const m2 = DL.readManifest(ws)
  assertEq(m2.nextSeq, 2, '序号自增到 2')
  assertEq(m2.entries.length, 1, '条目写入')

  // writeManifestEntry：显式序号，不重复读 manifest
  const m3 = DL.readManifest(ws)
  DL.writeManifestEntry(ws, m3, {
    seq: 5, title: 'B', filename: '005_B.txt', path: 'research/literature/fulltext/005_B.txt',
    kind: 'txt', placeholder: true, createdAt: 'now', reason: 'x',
  })
  const m4 = DL.readManifest(ws)
  assertEq(m4.nextSeq, 6, '显式序号推进 nextSeq')
  assertEq(m4.entries.length, 2, '两条条目')
  assertEq(m4.entries[1].reason, 'x', '占位原因保留')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 5. 下载执行（mock fetch，不联网）────────────────────────────── */
console.log('\n[5] 下载执行（mock fetch）')
{
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9, 9])
  const html = new TextEncoder().encode('<!DOCTYPE html><html><body>paper</body></html>')

  const okPdf = await DL.downloadFromCandidates(
    [{ url: 'https://x/a.pdf', source: 'pdf_direct' }],
    { fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => pdf.buffer }) },
  )
  assertEq(okPdf.ok, true, 'PDF 候选成功')
  assertEq(okPdf.kind, 'pdf', 'PDF 类型识别')

  const httpFail = await DL.downloadFromCandidates(
    [{ url: 'https://x/a.pdf', source: 'pdf_direct' }],
    { fetchImpl: async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) }) },
  )
  assertEq(httpFail.ok, false, 'HTTP 403 → 失败')
  assert(httpFail.reason?.includes('403'), '失败原因带状态码')

  const nonPdf = await DL.downloadFromCandidates(
    [{ url: 'https://x/a.bin', source: 'pdf_direct' }],
    { fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6]).buffer }) },
  )
  assertEq(nonPdf.ok, false, '非 PDF/HTML → 失败')

  // 多候选回退：第一个 404，第二个 HTML 成功
  const fallback = await DL.downloadFromCandidates(
    [
      { url: 'https://x/a.pdf', source: 'pdf_direct' },
      { url: 'https://y/abs', source: 'landing' },
    ],
    {
      fetchImpl: async (url) =>
        url.includes('a.pdf')
          ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
          : { ok: true, status: 200, arrayBuffer: async () => html.buffer },
    },
  )
  assertEq(fallback.ok, true, '候选回退成功')
  assertEq(fallback.kind, 'html', '回退得到 HTML')
  assertEq(fallback.source, 'landing', '回退来源记录')
}

/* ── 6. downloadPaper 落盘 + 占位（mock fetch）────────────────────── */
console.log('\n[6] downloadPaper 落盘与占位（mock fetch）')
{
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-dl-e2e-'))
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9, 9])

  // 成功路径
  const okRes = await DL.downloadPaper(
    ws,
    { title: 'MemLifecycle Benchmark', links: { landingPageUrl: 'https://arxiv.org/abs/2402.17753' } },
    { fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => pdf.buffer }) },
  )
  assertEq(okRes.placeholder, false, '成功 → 非占位')
  assertEq(okRes.kind, 'pdf', '成功 → pdf')
  assert(okRes.path.endsWith('.pdf'), '落盘为 .pdf')
  assert(existsSync(join(ws, okRes.path)), '文件真实存在')
  assertEq(statSync(join(ws, okRes.path)).size, 7, '文件字节数正确')
  const mOk = DL.readManifest(ws)
  assertEq(mOk.entries[0].kind, 'pdf', 'manifest 记录 pdf')
  assertEq(mOk.nextSeq, 2, '成功后序号自增')

  // 失败路径 → 占位 txt
  const failRes = await DL.downloadPaper(
    ws,
    { title: 'Paywalled Paper', links: { doi: 'https://doi.org/10.1000/xyz' } },
    { fetchImpl: async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) }) },
  )
  assertEq(failRes.placeholder, true, '失败 → 占位')
  assert(failRes.path.endsWith('.txt'), '占位为 .txt')
  const mFail = DL.readManifest(ws)
  assertEq(mFail.entries[1].placeholder, true, '占位条目标记 placeholder')
  assert(mFail.entries[1].reason?.includes('403'), '占位原因带 HTTP 状态')
  assertEq(mFail.nextSeq, 3, '占位也消耗序号')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 7. 工具层注册与执行 ──────────────────────────────────────────── */
console.log('\n[7] 工具层注册与执行')
{
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-dl-tools-'))
  const withDeps = TOOLS.defineResearchTools(
    () => ws,
    undefined,
    { fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer }) },
  )
  const tool = withDeps.find((t) => t.name === TOOLS.PAPER_DOWNLOAD_TOOL)
  assert(tool !== undefined, 'research_paper_download 已注册')
  assert(tool !== undefined && tool.parameters?.properties?.action !== undefined, '工具 schema 暴露 action')
  assertEq(tool?.isConcurrencySafe?.({}), false, '写文件工具不并发安全')

  if (tool) {
    const cand = await tool.execute({ action: 'candidates', landingPageUrl: 'https://arxiv.org/abs/2402.17753' }, {})
    assert(cand.ok === true && cand.candidates?.some((c) => c.source === 'arxiv_derived'), 'candidates 动作可用')

    const listEmpty = await tool.execute({ action: 'list' }, {})
    assertEq(listEmpty.count, 0, 'list 空 manifest')

    const noLink = await tool.execute({ action: 'download', title: 'X' }, {})
    assert(noLink.ok === false && typeof noLink.error === 'string', '缺链接 → 报原因')

    // action 有 enum 时 schema 校验提前拦截非法值（与 project 工具同风格）
    let threwOnBadAction = false
    try {
      await tool.execute({ action: 'nope' }, {})
    } catch {
      threwOnBadAction = true
    }
    assert(threwOnBadAction, '未知 action → schema 校验拦截（ToolArgsError）')
  }

  // 未注入 downloadDeps 时 download 应报"未启用"
  const noDeps = TOOLS.defineResearchTools(() => ws)
  const t2 = noDeps.find((t) => t.name === TOOLS.PAPER_DOWNLOAD_TOOL)
  if (t2) {
    const out = await t2.execute({ action: 'download', title: 'X', doi: '10.1000/x' }, {})
    assert(out.ok === false && String(out.error).includes('未启用'), '未注入依赖 → 明确报未启用')
  }
  rmSync(ws, { recursive: true, force: true })
}

/* ── 8. Skill 指向真实工具 ────────────────────────────────────────── */
console.log('\n[8] paper-fulltext-download Skill 指向真实工具')
{
  const skill = readFileSync(join(ROOT, 'skills', 'literature', 'paper-fulltext-download.md'), 'utf8')
  assert(skill.includes('research_paper_download'), 'Skill 正文提到该工具')
  assert(skill.includes('placeholder'), 'Skill 讲清占位处理')
  const snap = readFileSync(join(ROOT, 'skills', '.sources', 'paper-fulltext-download.json'), 'utf8')
  assert(snap.includes('paper-fulltext-download'), '.sources 快照存在')
}

/* ── 9.（可选）真实 arXiv 下载 ─────────────────────────────────────── */
if (process.argv.includes('--live')) {
  console.log('\n[9] 真实 arXiv 下载（联网，可能较慢）')
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-dl-live-'))
  const res = await DL.downloadPaper(
    ws,
    { title: 'LoCoMo', links: { landingPageUrl: 'https://arxiv.org/abs/2402.17753' } },
    {},
  )
  assertEq(res.placeholder, false, '真实 arXiv 下载成功')
  assertEq(res.kind, 'pdf', '真实下载得到 PDF')
  if (res.placeholder === false && res.kind === 'pdf') {
    const buf = readFileSync(join(ws, res.path))
    assertEq(Buffer.from(buf.slice(0, 5)).toString('hex'), '255044462d', '真实文件是 %PDF-')
  }
  rmSync(ws, { recursive: true, force: true })
} else {
  console.log('\n[9] 真实 arXiv 下载：跳过（传 --live 启用）')
}

console.log(`\n${failed === 0 ? '✅' : '❌'} paper-download: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
