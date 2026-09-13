#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 研究方法编号（CxxPyy）与导出验证。
 *
 * 守住两件事：
 *
 *   1. **编号体系**：9 个类别 `C01`–`C09` 按研究过程排序；50 个技能各自唯一编号；
 *      编号表与真实技能集合**完全一致**（不多、不少、不重、格式合法）。
 *   2. **排序按编号而非字母序**：技能库列表、设置页的类别与技能列表，
 *      都必须按 `CxxPyy` 排 —— 字母序会把实验阶段的技能排到理解问题之前。
 *   3. **导出**：`/research 导出研究方法` 产出的 Markdown 必须带编号锚点
 *      （`### CxxPyy`，将来按编号合并用），默认只含 6 个可定制章节，`--full` 才含历史提示词。
 *
 * 用法：node scripts/verify-method-codes.mjs
 */
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const CODES = await import(lib('research/skill-codes.js'))
const SKILLS = await import(lib('research/skills.js'))
const EXPORT = await import(lib('research/methods-export.js'))
const RPC = await import(lib('settings-rpc.js'))
const CUST = await import(lib('research/skill-customization.js'))
const TAX = await import(lib('research/taxonomy.js'))

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

const docs = SKILLS.listSystemSkills()

/* ── 1. 类别编号 ──────────────────────────────────────────────────── */
console.log('\n[1] 类别编号 C01–C09')
{
  assertEq(CODES.CATEGORY_CODES.length, 9, '9 个类别')
  const codes = CODES.CATEGORY_CODES.map((c) => c.code)
  assertEq(codes.join(','), 'C01,C02,C03,C04,C05,C06,C07,C08,C09', '类别编号连续 C01–C09')
  const orders = CODES.CATEGORY_CODES.map((c) => c.order)
  assertEq(orders.join(','), '1,2,3,4,5,6,7,8,9', 'order 单调递增（排序依据）')

  // 类别顺序必须与 research-process 的阶段意图一致：理解问题在最前、写作业靠后
  assertEq(CODES.CATEGORY_CODES[0].categoryId, 'research-understanding', 'C01 = 理解问题')
  assertEq(CODES.CATEGORY_CODES[1].categoryId, 'literature', 'C02 = 文献')
  assertEq(CODES.CATEGORY_CODES[7].categoryId, 'academic-writing', 'C08 = 写作')
  assertEq(CODES.CATEGORY_CODES[8].categoryId, 'research-management', 'C09 = 研究管理（横切，置末）')

  // taxonomy 里的大类都应被编号覆盖
  for (const g of TAX.systemGroups()) {
    assert(
      CODES.CATEGORY_CODES.some((c) => c.categoryId === g.id),
      `taxonomy 大类已编号：${g.id}`,
    )
  }
}

/* ── 2. 技能编号完整性 ────────────────────────────────────────────── */
console.log('\n[2] 技能编号 CxxPyy')
{
  assertEq(Object.keys(CODES.SKILL_CODES).length, docs.length, '编号条数 = 技能数')

  const v = CODES.validateSkillCodes(docs.map((d) => d.id))
  assertEq(v.unmapped.length, 0, `没有未编号的技能${v.unmapped.length ? `：${v.unmapped.join(', ')}` : ''}`)
  assertEq(v.orphans.length, 0, `没有多余编号${v.orphans.length ? `：${v.orphans.join(', ')}` : ''}`)
  assertEq(v.duplicates.length, 0, '没有重复编号')
  assertEq(v.malformed.length, 0, '编号格式都合法（CxxPyy）')
  assertEq(v.missingLabels.length, 0, `每个技能都有中文名${v.missingLabels.length ? `：${v.missingLabels.join(', ')}` : ''}`)
  assertEq(v.ok, true, '整体校验通过')

  // 编号必须落在它所属类别的 C 号上
  for (const doc of docs) {
    const code = CODES.skillCode(doc.id)
    const info = CODES.categoryCodeInfo(doc.category)
    assert(code !== undefined, `已编号：${doc.id}`)
    if (code && info) {
      assert(code.startsWith(info.code), `${doc.id} 的编号 ${code} 属于 ${info.code}`)
    }
  }

  // 每个类别内的 P 号从 P01 连续开始
  const byCat = new Map()
  for (const doc of docs) {
    const info = CODES.categoryCodeInfo(doc.category)
    if (!info) continue
    const list = byCat.get(info.code) ?? []
    list.push(CODES.skillCode(doc.id))
    byCat.set(info.code, list)
  }
  for (const [cat, list] of byCat) {
    const sorted = [...list].sort()
    for (let i = 0; i < sorted.length; i++) {
      assertEq(sorted[i], `${cat}P${String(i + 1).padStart(2, '0')}`, `${cat} 内 P 号连续（第 ${i + 1} 个）`)
    }
  }
}

/* ── 3. 排序按编号（不是字母序）──────────────────────────────────── */
console.log('\n[3] 排序：技能库与设置页')
{
  const keys = docs.map((d) => CODES.skillSortKey(d.id))
  const sorted = [...keys].sort()
  assertEq(keys.join(','), sorted.join(','), 'listSystemSkills 按编号排序')

  // 字母序的反例：ablation-design 属于实验（C05），绝不能排在理解问题（C01）之前
  const ablationIdx = docs.findIndex((d) => d.id === 'ablation-design')
  const topicIdx = docs.findIndex((d) => d.id === 'topic-understanding')
  assert(topicIdx >= 0 && ablationIdx > topicIdx, '理解问题排在消融之前（字母序会反过来）')

  const st = RPC.buildSettingsState(
    { customizationFile: 'x.json', customizationDir: '/tmp', openalexApiKey: '' },
    CUST.createMemoryCustomizationStore(),
    undefined,
    () => ({ tectonic: { name: 'tectonic', available: false, viaEnv: false, envVar: 'CONVFUSION_TECTONIC', purpose: 'x' } }),
  )
  assertEq(
    st.categories.map((c) => c.code).join(','),
    'C01,C02,C03,C04,C05,C06,C07,C08,C09',
    '设置页类别按研究过程排序（字母序会让写作排最前）',
  )
  assertEq(st.categories[0].label, '理解问题', 'C01 中文名')
  for (const c of st.categories) {
    const codes = c.skills.map((s) => s.code ?? 'Z')
    assertEq(codes.join(','), [...codes].sort().join(','), `${c.code} 内技能按编号排序`)
  }
  // 技能带上编号（界面展示用）
  assert(st.categories.every((c) => c.skills.every((s) => typeof s.code === 'string')), '每个技能都带编号')
}

/* ── 4. 导出 ──────────────────────────────────────────────────────── */
console.log('\n[4] 导出研究方法')
{
  const def = EXPORT.buildMethodsExport({ now: new Date('2026-01-01T00:00:00Z') })
  const full = EXPORT.buildMethodsExport({ full: true, now: new Date('2026-01-01T00:00:00Z') })

  assertEq(def.skillCount, docs.length, '导出全部技能')
  assertEq(def.categoryCount, 9, '导出全部类别')
  assertEq(def.full, false, '默认非 full')
  assert(def.markdown.includes('CxxPyy'), '头部说明编号规则')
  assert(def.markdown.includes('## C01 · 理解问题'), '按类别分节且带编号')
  assert(def.markdown.includes('### C01P01 · 理解问题 · 主题理解'), '技能标题行 = 编号 + 类别 + 中文名')
  assert(CODES.skillLabel('literature-search') === '文献检索', '中文名映射')

  // 编号锚点：每个技能恰好出现一次
  for (const doc of docs) {
    const anchor = `### ${doc.code} ·`
    assertEq(def.markdown.split(anchor).length - 1, 1, `锚点唯一：${doc.code}`)
  }

  // 默认只含 6 个可定制章节，不含逐字历史提示词
  for (const section of CUST.CUSTOMIZABLE_SECTIONS) {
    assert(def.markdown.includes(`#### ${section}`), `含可定制章节：${section}`)
  }
  assert(!def.markdown.includes('## Source Prompts'), '默认**不含** Source Prompts（历史逐字提示词）')
  assert(full.markdown.includes('## Source Prompts'), 'full 模式含 Source Prompts')
  assert(full.bytes > def.bytes, 'full 体积更大')
  assert(def.bytes > 50000, `默认导出体量合理（${Math.round(def.bytes / 1024)} KB）`)

  // 用户定制必须在导出里可见（导出的是"生效版本"）
  const store = CUST.createMemoryCustomizationStore()
  store.set('literature-search', 'Research Method', 'Always search OpenAlex twice.')
  const custom = EXPORT.buildMethodsExport({ store, now: new Date('2026-01-01T00:00:00Z') })
  assert(custom.markdown.includes('用户补充'), '含定制的章节被标出')
  assert(custom.markdown.includes('Always search OpenAlex twice.'), '定制正文进入导出')
  assert(custom.markdown.includes('用户定制：1 处'), '头部统计定制数')

  // 落盘
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-methods-'))
  const written = EXPORT.writeMethodsExport(ws, { now: new Date('2026-01-01T00:00:00Z') })
  assertEq(written.path, 'research/methods-export.md', '默认落点')
  assert(existsSync(join(ws, written.path)), '文件真实写出')
  assertEq(readFileSync(join(ws, written.path), 'utf8'), written.markdown, '落盘内容与返回值一致')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 5. 命令识别 ──────────────────────────────────────────────────── */
console.log('\n[5] /research 导出指令')
{
  // 命令处理器里做前缀识别；这里断言源码里的识别规则存在且先于 followup
  const src = readFileSync(join(ROOT, 'src', 'research', 'commands.ts'), 'utf8')
  assert(/isMethodsExportArg/.test(src), '存在导出指令识别函数')
  assert(/导出研究方法/.test(src), '支持中文触发词「导出研究方法」')
  assert(/export-methods/.test(src), '支持英文触发词 export-methods')
  const exportIdx = src.indexOf('isMethodsExportArg(arg)')
  const followupIdx = src.indexOf('followup(ctx, agent, buildContinueText')
  assert(exportIdx > -1 && exportIdx < followupIdx, '导出分支先于 followup（否则被当成研究任务丢给 Agent）')
}

console.log(`\n${failed === 0 ? '✅' : '❌'} method-codes: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
