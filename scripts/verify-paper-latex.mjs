#!/usr/bin/env node
/**
 * ConvFusion 2.0 — LaTeX 工具链验证（移植自 ConvFusion-dev `modules/paper/latex`）。
 *
 * 默认**不联网、不编译**（与仓库其它 verify-*.mjs 一致），守住：
 *
 *   1. 纯函数：文本安全化、Markdown 残留清理、数学区净化、Unicode 标点、引用三层转换、
 *      参考文献构造、公式注入；
 *   2. 组装：两套模板、abstract/title 归位、终态 vs 中间态（`\cite{}` vs `[key]`）；
 *   3. 日志解析：tectonic 与 TeX 两种格式，含旧版缺陷 D3（跨行吞并）/D4 的回归样例；
 *   4. 确定性修复：`%` 转义、double subscript，含 D1（过转义反斜杠）/D2（多余 `$`）回归样例；
 *   5. 工具层：`research_paper_latex` 已注册、动作枚举、`buildComposeInput` 章节切分。
 *
 * 用法：
 *   node scripts/verify-paper-latex.mjs            # 不编译
 *   node scripts/verify-paper-latex.mjs --live     # 额外用真实 paper.md 编译一次（慢）
 */
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const L = await import(lib('research/latex.js'))
const C = await import(lib('research/latex-compile.js'))
const T = await import(lib('research/research-tools.js'))

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) passed++
  else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(actual, expect, label) {
  if (Object.is(actual, expect)) passed++
  else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}\n    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expect)}`)
  }
}

/* ── 1. 模板与文本安全化 ─────────────────────────────────────────── */
console.log('\n[1] 模板与 safeText')
{
  assertEq(L.normalizeTemplate('journal'), 'journal', 'journal 归一')
  assertEq(L.normalizeTemplate('ieee'), 'journal', 'ieee 归一为 journal')
  assertEq(L.normalizeTemplate('conference'), 'conference', 'conference 归一')
  assertEq(L.normalizeTemplate(undefined), 'conference', '缺省为 conference')
  assertEq(L.normalizeTemplate('bogus'), 'conference', '未知收敛到 conference')

  assertEq(L.safeText('50% of A&B'), '50\\% of A\\&B', 'safeText 转义 % 与 &')
  assertEq(L.safeText('a_b'), 'a\\_b', 'safeText 转义下划线')
  assertEq(L.safeText('math $x_1$ kept'), 'math $x_1$ kept', 'safeText 保护行内数学')
  assertEq(L.safeText('brace {x}'), 'brace \\{x\\}', 'safeText 转义花括号')
}

/* ── 2. Markdown 残留清理 ─────────────────────────────────────────── */
console.log('\n[2] stripMarkdownHeaders 与内联强调')
{
  assertEq(L.stripMarkdownHeaders('# Heading\ntext'), 'text', '移除行首 # 标题')
  assertEq(L.stripMarkdownHeaders('## 3. Method\nbody'), 'body', '移除带编号标题')
  assertEq(L.stripMarkdownHeaders('a <!-- 1. Introduction --> b'), 'a  b', '移除 HTML 注释')
  assertEq(L.stripMarkdownHeaders('[STATUS: FULL DRAFT]\nbody'), 'body', '移除 [STATUS:] 标记')
  assertEq(L.stripMarkdownHeaders('x **bold** y'), 'x \\textbf{bold} y', '内联粗体 → \\textbf')
  assertEq(L.stripMarkdownHeaders('x *ital* y'), 'x \\textit{ital} y', '内联斜体 → \\textit')
  // 不成对的 * （脚注）必须保留
  assertEq(L.stripMarkdownHeaders('| a | f* |'), '| a | f* |', '不成对 * 保留（脚注）')
  // 数学区的 * 是乘号，不能转
  assertEq(L.convertInlineEmphasis('$a*b$'), '$a*b$', '数学区 * 不被转成斜体')
  assertEq(L.convertInlineEmphasis('$**x**$'), '$**x**$', '数学区强调标记不动')
}

/* ── 3. 数学区净化 ────────────────────────────────────────────────── */
console.log('\n[3] sanitizeLatexMath')
{
  assertEq(L.sanitizeLatexMath('50% of A&B'), '50\\% of A\\&B', '转义 % 与 &')
  assertEq(L.sanitizeLatexMath('$x_1 + y$'), '$x_1 + y$', '保护行内数学')
  assertEq(L.sanitizeLatexMath('$$a_b$$'), '$$a_b$$', '保护 display 数学')
  assertEq(
    L.sanitizeLatexMath('\\begin{equation} a_b = c% \\end{equation} then 10% done'),
    '\\begin{equation} a_b = c% \\end{equation} then 10\\% done',
    '保护数学环境，转义环境外的 %',
  )
  assertEq(L.sanitizeLatexMath('esc\\_ok'), 'esc\\_ok', '已转义下划线不重复转义')
  // 旧版实测行为：裸下标被包进数学
  assertEq(L.sanitizeLatexMath('v is x_1 here'), 'v is $x_1$ here', '裸下标自动包数学（旧版行为）')
}

/* ── 4. Unicode 标点 ──────────────────────────────────────────────── */
console.log('\n[4] sanitizeUnicodeChars')
{
  assertEq(L.sanitizeUnicodeChars('a\u2014b'), 'a---b', 'em dash → ---')
  assertEq(L.sanitizeUnicodeChars('a\u2013b'), 'a--b', 'en dash → --')
  assertEq(L.sanitizeUnicodeChars('\u2019q\u2018'), "'q'", '弯引号 → 直引号')
}

/* ── 5. 引用与参考文献 ────────────────────────────────────────────── */
console.log('\n[5] 引用三层转换与 bibliography')
{
  assertEq(L.injectCitations('[smith2024]'), '\\cite{smith2024}', '单 key → \\cite')
  assertEq(L.injectCitations('[a1, b2]'), '\\cite{a1,b2}', '多 key → \\cite{a,b}')
  assertEq(
    L.injectCitations('[1] and [2]', { numberToKey: { 1: 'k1', 2: 'k2' } }),
    '\\cite{k1} and \\cite{k2}',
    '数字引用 → key',
  )
  assertEq(L.injectCitations('$[a1]$'), '$[a1]$', '数学区不注入 \\cite')

  // 引用写法容错（D 修复：论文正文用分号分隔 + arXiv/doi 后缀注解）
  assertEq(L.injectCitations('[a1; b2; c3]'), '\\cite{a1,b2,c3}', '分号分隔多引用 → \\cite')
  assertEq(L.injectCitations('[a1, arXiv:2609.02265]'), '\\cite{a1}', 'arXiv 后缀剥离 → \\cite{key}')
  assertEq(L.injectCitations('[a1; b2, doi:10.1/x; c3]'), '\\cite{a1,b2,c3}', '混合分隔 + doi 后缀')
  // 已知键过滤：单引用兜底不误转 [TBD] / [t] / [width=...]
  assertEq(L.injectCitations('[TBD]', { knownKeys: ['a1'] }), '[TBD]', '已知键过滤：未知单键保留')
  assertEq(L.injectCitations('[t] and [a1]', { knownKeys: ['a1'] }), '[t] and \\cite{a1}', '[t] 不误转')
  assertEq(L.injectCitations('[width=\\textwidth]', { knownKeys: ['a1'] }), '[width=\\textwidth]', 'LaTeX 参数不误转')
  assertEq(L.injectCitations('[a1; b2]', { knownKeys: ['a1'] }), '\\cite{a1}', '分号多引用按已知键过滤')
  // 无 knownKeys 时保持宽松兜底
  assertEq(L.injectCitations('[zzz]'), '\\cite{zzz}', '无 knownKeys 时未知单键仍转换')

  const bib = L.buildThebibliography([{ key: 'k1', text: 'A. Author, "T," V, 2024.' }])
  assert(bib.includes('\\begin{thebibliography}') && bib.includes('\\bibitem{k1}'), 'bibitem 构造')
  assertEq(L.buildThebibliography([]), '', '空 bibliography 返回空串')
}

/* ── 6. 公式注入 ──────────────────────────────────────────────────── */
console.log('\n[6] 公式渲染与注入')
{
  const eq = { equationId: 'eq-attention', equationType: 'attention', label: 'eq:attention' }
  const rendered = L.renderEquation(eq, true)
  assert(rendered.startsWith('\\begin{equation}') && rendered.includes('\\text{Attention}'), 'attention 渲染')
  assert(rendered.includes('\\label{eq:attention}'), 'label 写入')
  assertEq(L.normalizeEquationType('bogus'), 'custom', '未知类型收敛 custom')
  assertEq(L.normalizeEquationType('attention'), 'attention', '已知类型直通')

  const injected = L.injectEquationCode('see <<EQ:eq-attention>> here', [eq])
  assert(injected.includes('\\begin{equation}'), '占位符被替换')
  assertEq(L.injectEquationCode('x <<EQ:nope>> y', [eq]), 'x <<EQ:nope>> y', '未匹配占位符保留')
  // 7 键：type 也应能命中
  assert(L.injectEquationCode('<<EQ:attention>>', [eq]).includes('\\begin{equation}'), 'type 键可命中')
  assertEq(L.injectEquationCode('no placeholders', []), 'no placeholders', '无公式时原样返回')
}

/* ── 7. 文档组装 ──────────────────────────────────────────────────── */
console.log('\n[7] composeDocument')
{
  const input = {
    template: 'conference',
    title: 'Probe: A & B',
    abstract: 'An abstract with 50% and *emphasis*.',
    sections: [
      { title: '1. Introduction', body: 'Body with [k1] and a value of 10%.' },
      { title: '2. Method', body: 'Math $x_1$ kept.' },
    ],
    bibliography: [{ key: 'k1', text: 'A. Author, "T," V, 2024.' }],
    knownKeys: ['k1'],
  }
  const out = L.composeDocument(input)
  assert(out.latex.includes('\\documentclass{IEEEtran}'), '会议模板 documentclass')
  assert(out.latex.includes('\\section{Introduction}'), '章节编号被剥掉')
  assert(out.latex.includes('\\begin{abstract}'), 'abstract 环境存在')
  assert(out.latex.includes('50\\%'), '正文 % 被转义')
  assert(out.latex.includes('\\cite{k1}'), '终态注入 \\cite')
  assert(out.latexIntermediate.includes('[k1]'), '中间态保留 [key]')
  assert(!out.latexIntermediate.includes('\\cite{k1}'), '中间态不含 \\cite')
  assert(out.latex.includes('\\bibitem{k1}'), 'bibliography 写入')

  const journal = L.composeDocument({ ...input, template: 'journal', keywords: ['memory', 'agents'] })
  assert(journal.latex.includes('\\documentclass[journal]{IEEEtran}'), '期刊模板带 journal 选项')
  assert(journal.latex.includes('IEEEkeywords'), '期刊模板含 keywords')
  assertEq(L.composeDocument(input).warnings.length, 0, '无告警')
  const warn = L.composeDocument({ ...input, sections: [{ title: 'A', body: '<<EQ:missing>>' }] })
  assert(warn.warnings.length > 0, '未匹配公式占位符产生告警')
}

/* ── 7.5 Markdown 表格 → LaTeX（D 修复：正文管道表格转换）──────────── */
console.log('\n[7.5] convertMarkdownTables')
{
  const md = [
    'Table: Probe tracks and their counts.',
    '',
    '| Track | Instances | What is injected |',
    '|:------|----------:|:----:|',
    '| T1 fact_update | 6 (2 abrupt, 2 gradual, 1 correction, 1 multi_step) | a fact value changes across sessions |',
    '| T2 pref_drift | 4 (gradual, step, oscillating, contextual) | a preference dimension shifts over time |',
  ].join('\n')
  const tables = []
  const sentinel = L.convertMarkdownTables(md, tables)
  assertEq(tables.length, 1, '识别一个表格块')
  assert(sentinel.includes('\u0000MDTABLE0\u0000'), '正文换成哨兵')
  assert(!sentinel.includes('fact_update'), '哨兵化正文不含表格内容')
  const tex = L.restoreMarkdownTables(sentinel, tables)
  assert(tex.includes('\\begin{table*}[t]'), '宽表用 table*（跨栏）')
  assert(tex.includes('\\caption{Probe tracks and their counts.}'), 'Table: 题注行被消费')
  assert(tex.includes('\\label{tab:md-0}'), '自动 label')
  assert(tex.includes('\\toprule') && tex.includes('\\bottomrule'), 'booktabs 规则')
  assert(tex.includes('fact\\_update'), 'snake_case 单元格转义')
  assert(tex.includes('fact\\_update & 6 (2 abrupt'), '& 分隔符保留（未被净化转义）')

  // 窄表（2 列短内容）→ 单栏 table + l/r 对齐
  const narrowTables = []
  const narrowSentinel = L.convertMarkdownTables('| a | b |\n|---|---|\n| 1 | 2 |', narrowTables)
  const narrow = L.restoreMarkdownTables(narrowSentinel, narrowTables)
  assert(narrow.includes('\\begin{table}[t]'), '窄表用单栏 table')
  assert(narrow.includes('{l l}') || narrow.includes('{l r}'), '窄列用 l/r 而非 p{...}')

  // composeDocument 集成：管道里 markdown 表格自动转换且不破坏引用
  const composed = L.composeDocument({
    template: 'conference',
    title: 'T',
    abstract: '',
    sections: [
      {
        title: '1. Intro',
        body: 'Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter [k1].',
      },
    ],
    bibliography: [{ key: 'k1', text: 'A. Author, "T," 2024.' }],
    knownKeys: ['k1'],
  })
  assert(composed.latex.includes('\\begin{tabular}'), '集成：表格被转换')
  assert(composed.latex.includes('\\cite{k1}'), '集成：引用仍注入')
  assert(!/^\|/.test(composed.latex.split('\n').find((l) => l.startsWith('|')) ?? ''), '集成：无管道残留')
}

/* ── 8. 日志解析（含 D3 回归）────────────────────────────────────── */
console.log('\n[8] parseCompileErrors')
{
  const tectonicLog = 'error: main.tex:42: Missing $ inserted\nerror: halted on potentially-recoverable error as specified'
  const e1 = C.parseCompileErrors(tectonicLog)
  assertEq(e1.length, 1, 'tectonic 格式只取真错误（跳过 halted 提示）')
  assertEq(e1[0].line, 42, '行号解析')
  assert(e1[0].message.includes('Missing $ inserted'), '消息解析')

  const texLog = '! Undefined control sequence.\nl.17 \\foo\n'
  const e2 = C.parseCompileErrors(texLog)
  assertEq(e2.length, 1, 'TeX 经典格式解析')
  assertEq(e2[0].line, 17, 'TeX 格式行号来自 l.NN')

  // D3 回归：warning 不得吞掉下一行的 error
  const mixed = 'warning: main.tex:5: Missing character: There is no X\nerror: main.tex:9: Too many }\'s'
  const e3 = C.parseCompileErrors(mixed)
  assert(e3.some((e) => e.line === 9), 'D3 回归：后续错误未被吞并')

  assertEq(C.parseCompileErrors('Underfull \\hbox (badness 10000)').length, 0, 'underfull 被过滤')
  assertEq(C.parseCompileErrors('').length, 0, '空日志返回空')

  const ctx = C.extractErrorContext('a\nb\nc\nd\ne', 3, 1)
  assert(ctx.text.includes('→') && ctx.text.includes('c'), '错误上下文带标记')
}

/* ── 9. 确定性修复（含 D1 / D2 回归）─────────────────────────────── */
console.log('\n[9] repairLatex')
{
  const p = C.escapePercentOutsideMath('100% done and $x \\% y$')
  assertEq(p, '100\\% done and $x \\% y$', '% 转义且保护数学区')

  const sub = C.repairLatex('$g_(A_t) = x$', [{ line: 1, message: 'Double subscript', severity: 'error' }])
  assert(sub.fixedCount > 0 && !sub.latex.includes('g_('), 'double subscript 修复')

  // D2 回归：不得产出 $$
  const cite = C.repairLatex('$\\alpha \\in \\cite{k}$', [
    { line: 1, message: 'Missing $ inserted (invalid in math mode)', severity: 'error' },
  ])
  assert(!cite.latex.includes('$$'), 'D2 回归：修复不产生 $$')

  // 无行号错误进入 remaining
  const rem = C.repairLatex('x', [{ line: 0, message: 'unknown', severity: 'error' }])
  assertEq(rem.fixedCount, 0, '无行号不修')
  assertEq(rem.remaining.length, 1, '无行号进入 remaining')
}

/* ── 10. 语法扫描 ─────────────────────────────────────────────────── */
console.log('\n[10] scanUnsafeTokens')
{
  const scan = C.scanUnsafeTokens('\\documentclass{article}\\begin{document}\\usepackage{x}\\foo{}\n\\begin{align}x\\end{align}')
  assert(scan.unknownCommands.includes('foo'), '未识别命令被报告')
  assert(!scan.unknownCommands.includes('documentclass'), '已知命令不报告')
  assert(!scan.unknownCommands.includes('usepackage'), 'D5：\\usepackage 已在已知集')
  assertEq(scan.unknownEnvs.length, 0, '常见环境不报未知')
}

/* ── 11. 章节切分与参考文献解析 ──────────────────────────────────── */
console.log('\n[11] buildComposeInput / parseBibEntries')
{
  const md = [
    '# My Paper',
    '',
    '## Abstract',
    '',
    'An abstract.',
    '',
    '## 1. Introduction',
    '',
    'Intro text.',
    '',
    '## References (to be compiled)',
    '',
    '- [smith2024] A. Smith, "Title," Venue, 2024.',
    '- [2] B. Doe, "Other," Venue, 2023.',
  ].join('\n')
  const input = T.buildComposeInput(md, 'conference')
  assertEq(input.title, 'My Paper', '标题取 # 标题')
  assertEq(input.abstract, 'An abstract.', 'abstract 归位')
  assertEq(input.sections.length, 1, 'References 前缀匹配被排除（D 修复）')
  assertEq(input.sections[0].title, '1. Introduction', '正文章节保留')
  assertEq(input.bibliography.length, 2, '两条参考文献')
  assertEq(input.numberToKey['2'], 'ref2', '数字引用建 numberToKey')

  const parsed = T.parseBibEntries('- **[k1]** A. Author, "T," 2024.')
  assertEq(parsed.entries[0].key, 'k1', '粗体包裹的 key 解析')
}

/* ── 12. 工具注册 ─────────────────────────────────────────────────── */
console.log('\n[12] 工具层注册')
{
  const toolList = T.defineResearchTools(() => '/tmp')
  const tool = toolList.find((t) => t.name === T.PAPER_LATEX_TOOL)
  assert(tool !== undefined, 'research_paper_latex 已注册')
  if (tool) {
    const actions = tool.parameters?.properties?.action?.enum ?? []
    assertEq(actions.join(','), 'compose,compile,repair,errors,validate,status', '动作枚举完整')
    assertEq(tool.isConcurrencySafe?.({}), false, '写文件工具不并发安全')
    const st = await tool.execute({ action: 'status', paperId: 'nope' }, {})
    assert(st.ok === true, 'status 在无 latex 目录时仍 ok')
  }
}

/* ── 13. tectonic 定位 ────────────────────────────────────────────── */
console.log('\n[13] findTectonic')
{
  const bin = C.findTectonic()
  console.log(`  tectonic: ${bin ?? '(未找到)'}`)
  assert(typeof bin === 'string' || bin === undefined, 'findTectonic 返回字符串或 undefined')
}

/* ── 14.（可选）真实编译 ──────────────────────────────────────────── */
if (process.argv.includes('--live')) {
  console.log('\n[14] 真实 compose + compile（联网/较慢）')
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-latex-live-'))
  const mdPath = join(ROOT, 'workspace', 'papers', 'paper-main', 'paper.md')
  if (!existsSync(mdPath)) {
    console.log('  (跳过：workspace/papers/paper-main/paper.md 不存在)')
  } else {
    const input = T.buildComposeInput(readFileSync(mdPath, 'utf8'), 'conference')
    const out = L.composeDocument(input)
    const latexDir = join(ws, 'latex')
    const { mkdirSync, cpSync } = await import('node:fs')
    mkdirSync(latexDir, { recursive: true })
    // 复刻 compose-paper.mjs 的最小后处理：xcolor（正文 \textcolor 红字）+ figures/
    let live = out.latex
    if (/\\textcolor/.test(live) && !/\\usepackage\{xcolor\}/.test(live)) {
      live = live.replace('\\documentclass{IEEEtran}', '\\documentclass{IEEEtran}\n\\usepackage{xcolor}')
    }
    const figSrc = join(ROOT, 'workspace', 'papers', 'paper-main', 'latex', 'figures')
    if (existsSync(figSrc)) cpSync(figSrc, join(latexDir, 'figures'), { recursive: true })
    const texPath = join(latexDir, 'main.tex')
    writeFileSync(texPath, live, 'utf8')
    const res = C.compileLatex(texPath, { timeoutMs: 240000 })
    assertEq(res.success, true, '真实论文编译成功')
    if (res.pdfPath && existsSync(res.pdfPath)) {
      const size = statSync(res.pdfPath).size
      console.log(`  PDF: ${size} bytes`)
      assert(size > 10000, 'PDF 大小合理')
      const head = readFileSync(res.pdfPath).subarray(0, 5).toString('latin1')
      assertEq(head, '%PDF-', 'PDF 魔数正确')
    }
    rmSync(ws, { recursive: true, force: true })
  }
} else {
  console.log('\n[14] 真实编译：跳过（传 --live 启用）')
}

console.log(`\n${failed === 0 ? '✅' : '❌'} paper-latex: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
