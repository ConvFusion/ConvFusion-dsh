#!/usr/bin/env node
/**
 * ConvFusion 2.0 — Skill Library 离线验证（无 LLM、无 DSH）。
 *
 * 验证架构（用户拍板）：
 *   系统 Skill Library = 包内资产，我们维护、**只读**
 *   用户定制           = 【设置】-【ConvFusion】-【本地设置】→ 独立文件（拼接覆盖）
 *
 * 重点三件事：
 *   1. 系统库来自包内、与 workspace 无关，且**运行时逐字节不被改动**；
 *   2. 用户定制存在**设置指定的文件**里（设置里只有文件名，所以设置文件不会变大）；
 *   3. 合成语义：用户文本在**前**，原有方法（含输出契约）在**后**。
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const S = await import(lib('research/skills.js'))
const LIB = await import(lib('research/library.js'))
const CUST = await import(lib('research/skill-customization.js'))
const TAX = await import(lib('research/taxonomy.js'))
const CFG = await import(lib('config.js'))

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ FAIL ${label}`) }
}
function assertEq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (!ok) console.log(`    actual: ${JSON.stringify(a)}\n    expect: ${JSON.stringify(b)}`)
  assert(ok, label)
}

const ws = mkdtempSync(join(tmpdir(), 'cf-stage2-'))
const cfgDir = mkdtempSync(join(tmpdir(), 'cf-cfg-'))
const customizationFile = join(cfgDir, 'skill-customizations.json')

/* ── A. 系统 Skill Library（包内资产，只读）────────────────────────── */
console.log('\n[A] 系统 Skill Library（包内资产）')
{
  const root = S.systemSkillRoot()
  // 断言"定位到**本包**的 skills/"，不写死仓库目录名 —— 仓库已从 monorepo
  // （packages/dsh-convfusion）扁平化为单包，目录名不再含 "dsh-convfusion"。
  assert(resolve(root) === join(PKG, 'skills'), `系统库定位到包内：${root}`)
  assert(existsSync(root), '系统库目录存在')

  const docs = S.listSystemSkills()
  assert(docs.length >= 5, `系统库至少有 5 个 Skill（实际 ${docs.length}）`)
  assert(docs.every((d) => d.type === 'system'), '全部 Skill type=system（我们维护）')
  assert(docs.every((d) => d.editable === false), '全部 Skill **只读**（editable=false）')
  assert(docs.every((d) => d.status === 'active'), '全部 Skill status=active')

  // 迁移完整性：**由旧提示词迁移来的** Skill 必须保留逐字来源。
  // 例外：**v2 原生**的能力在旧 ConvFusion 里没有对应提示词，它们的 method 是新写的，
  // 因此没有来源 —— 这是真实情况，不是遗漏。
  //   · Stage 5.1 的成果转换能力（旧实现只有论文，没有专利/报告/演讲的提示词）
  //   · `research-process`：v2 的过程定义（旧实现是硬编码的模块流水线，没有"过程"提示词）
  const V2_NATIVE = new Set([
    'patent-drafting',
    'technical-report-writing',
    'presentation-design',
    'research-process',
    // 论文全文下载：v2 原生能力（旧实现没有这条），手写正文、不伪造历史出处
    'paper-fulltext-download',
  ])
  const withSources = docs.filter((d) => d.sections.some((x) => x.title.startsWith('Source Prompts')))
  const migrated = docs.filter((d) => !V2_NATIVE.has(d.id))
  assertEq(
    withSources.filter((d) => !V2_NATIVE.has(d.id)).length,
    migrated.length,
    `由旧提示词迁移的 ${migrated.length} 个 Skill 都保留逐字来源`,
  )
  assertEq(
    docs.filter((d) => V2_NATIVE.has(d.id) && d.sections.some((x) => x.title.startsWith('Source Prompts'))).length,
    0,
    'v2 原生能力无逐字来源（不伪造出处）',
  )

  // 逐字来源必须真的引用了 ConvFusion 源文件路径
  for (const d of migrated) {
    const sec = d.sections.find((x) => x.title.startsWith('Source Prompts'))
    assert(/modules\//.test(sec.body), `${d.id}: 逐字来源可追溯到 modules/ 下的源文件`)
  }
  assert(docs.every((d) => d.category !== undefined), '每个 Skill 都有 category')
  const groups = new Set(docs.map((d) => d.category.split('/')[0]))
  assert(groups.size >= 4, `覆盖多个类别（${[...groups].sort().join(', ')}）`)
  assert(docs.every((d) => TAX.SYSTEM_CATEGORIES.some((c) => c.id === d.category)), '所有 category 都在系统 taxonomy 内')

  assert(docs.every((d) => /^skills\/[a-z-]+\/[a-z0-9-]+\.md$/.test(d.relPath)), '路径为 skills/<category>/<id>.md')
  assert(!readdirSync(root).some((f) => /^step|^stage|^phase/.test(f)), '系统库无 step/stage/phase 目录（§27）')
}

/* ── B. Markdown 与 Metadata ─────────────────────────────────────── */
console.log('\n[B] Skill Markdown 与 Metadata')
{
  const doc = S.listSystemSkills().find((d) => d.id === 'literature-search')
  assert(doc !== undefined, '按 id 找到 Skill')
  assert(doc.name.length > 0, 'name 取自正文 `# Skill:` 标题')
  assertEq(doc.category, 'literature/literature-search', 'category 归一为完整 id')
  assertEq(doc.version, '1.0', 'version 读取自 frontmatter')
  assert(S.skillPurpose(doc).length > 30, '`## Purpose` 解析')
  assert(S.skillWhenToUse(doc).length > 20, '`## When to Use` 解析')
  assert(S.skillMethod(doc).length > 100, '`## Research Method` 解析')
  assert(S.skillExpectedOutput(doc).length > 20, '`## Expected Output` 解析')
  assert(!doc.body.includes('category:'), 'body 不含 frontmatter')

  const tmp = join(cfgDir, 'tmp-skill.md')
  writeFileSync(tmp, ['---','name: T','category: literature','---','','# Skill: T','','## Purpose','','P.','','## 我的补充','','自定义内容.'].join('\n'))
  const extra = S.parseSkillDocument(tmp, 'skills/tmp.md')
  assert(extra.sections.some((s) => s.title === '我的补充'), '用户自加章节被完整保留（宽松解析）')
}

/* ── C. 可定制项 ─────────────────────────────────────────────────── */
console.log('\n[C] 可定制项（【设置】-【ConvFusion】-【本地设置】）')
{
  const points = CUST.listCustomizationPoints(ws, {})
  assert(points.length >= 4, `按类别展开（${points.length} 个类别）`)
  assert(points.every((c) => c.points.length > 0), '每个类别都有可定制项')
  assertEq(points.reduce((n, c) => n + c.overriddenCount, 0), 0, '初始无覆盖')

  const literature = points.find((c) => c.categoryId === 'literature')
  assert(literature !== undefined, '含 literature 类别')
  assertEq(literature.categoryName, 'Literature', '类别展示名')
  const p = literature.points.find((x) => x.skillId === 'literature-search' && x.section === 'Research Method')
  assert(p !== undefined, '可定制到「Skill × 章节」粒度')
  assert(p.base.length > 100, '可定制项带**基线内容**（用户知道自己在覆盖什么）')
  assertEq(p.overridden, false, '未覆盖')

  assert(points.every((c) => c.points.every((x) => CUST.CUSTOMIZABLE_SECTIONS.includes(x.section))), '只列出允许定制的章节')
}

/* ── D. 用户定制存储（文件后端）──────────────────────────────────── */
console.log('\n[D] 用户定制存储（文件后端；设置里只有文件名）')
{
  const config = CFG.resolveConfig({ customizationFile: 'my-skills.json' })
  assertEq(config.customizationFile, 'my-skills.json', '设置里存的是**文件名**')
  assertEq(CFG.resolveCustomizationPath({ customizationFile: 'my-skills.json', customizationDir: cfgDir }), join(cfgDir, 'my-skills.json'), '文件名解析为绝对路径')
  assertEq(CFG.resolveCustomizationPath({ customizationFile: '/abs/path/x.json', customizationDir: cfgDir }), '/abs/path/x.json', '绝对路径直接使用')
  assert(CFG.resolveCustomizationPath({}).includes('.dsh'), '默认落在 $DSH_HOME 下')

  const store = CUST.createFileCustomizationStore(() => customizationFile)
  assert(!existsSync(customizationFile), '初始无定制文件')
  store.set('literature-search', 'Research Method', '我通常先看评测设置，再看方法差异。')
  assert(existsSync(customizationFile), '写入后定制文件出现')

  const raw = JSON.parse(readFileSync(customizationFile, 'utf8'))
  assertEq(Object.keys(raw), ['literature-search'], '定制以 skillId 为键')
  assertEq(Object.keys(raw['literature-search']), ['Research Method'], '再以章节为键（Category → Skill → 可定制项）')

  store.set('literature-search', 'Reasoning Guidance', '关注评测维度的缺失。')
  store.set('literature-screening', 'Research Method', '先写候选再评估。')
  assertEq(Object.keys(store.load()).sort(), ['literature-screening', 'literature-search'], '多 Skill 定制共存')
  assert(store.description.includes(customizationFile), 'store 说明定制存在哪')

  store.set('research-direction', 'Research Method', '')
  assert(!('research-direction' in store.load()), '写入空文本 = 清除该覆盖')

  writeFileSync(customizationFile, '{ this is not json')
  assertEq(store.load(), {}, '定制文件损坏 → 退回空（研究不受影响）')
  writeFileSync(customizationFile, JSON.stringify({ 'literature-search': { 'Research Method': '我通常先看评测设置。' } }))

  const settingsLike = JSON.stringify(config)
  assert(settingsLike.length < 200, `设置里只有文件名，长度与定制量无关（${settingsLike.length} 字节）`)
}

/* ── E. 合成语义 ─────────────────────────────────────────────────── */
console.log('\n[E] 合成语义（不破坏输出契约）')
{
  const base = '# Skill: X\n\n## Research Method\n\n原方法。\n\n## Expected Output\n\n产出 A。'
  const composed = CUST.composeSkillContent(base, { 'Research Method': '我的方法要求 B。' })

  assert(composed.includes(CUST.USER_SECTION_HEADER), '含「用户额外要求」分隔标记')
  assert(composed.includes(CUST.BASE_SECTION_HEADER), '含「原有方法」分隔标记')
  assert(composed.includes('我的方法要求 B。'), '含用户文本')
  assert(composed.includes('原方法。'), '含原有方法')
  assert(composed.includes('## Expected Output'), '原有输出契约保留')

  const userIdx = composed.indexOf(CUST.USER_SECTION_HEADER)
  const baseIdx = composed.indexOf(CUST.BASE_SECTION_HEADER)
  const outputIdx = composed.indexOf('## Expected Output')
  assert(userIdx < baseIdx, '顺序：用户文本在**前**')
  assert(baseIdx < outputIdx, '顺序：原有方法（含输出契约）在**后** —— 契约不被破坏')

  assertEq(CUST.composeSkillContent(base, undefined), base, '无覆盖时正文原样（不含任何标记）')
  assertEq(CUST.composeSkillContent(base, {}), base, '空覆盖同上')
  assertEq(CUST.composeSkillContent(base, { 'Research Method': '   ' }), base, '空白覆盖视为无覆盖')
}

/* ── F. 库视图与发现 ─────────────────────────────────────────────── */
console.log('\n[F] 库视图与发现')
{
  const store = CUST.createFileCustomizationStore(() => customizationFile)
  const view = LIB.loadSkillLibrary(ws, store)
  assertEq(view.counts.system, view.entries.length, '全部 Skill 计入 system')
  assertEq(view.counts.customized, 1, '统计已定制 Skill 数（1 个）')
  const entry = view.entries.find((e) => e.document.id === 'literature-search')
  assertEq(entry.customizedSections, 1, '该 Skill 有 1 处覆盖')
  assert(entry.effectiveContent.includes('我通常先看评测设置'), 'effectiveContent 含用户定制')
  assert(entry.effectiveContent.includes('## Research Method'), 'effectiveContent 保留基线方法')

  const plain = view.entries.find((e) => e.document.id === 'experiment-design')
  assertEq(plain.effectiveContent, plain.document.body, '未定制 → 生效内容 = 基线正文')
  assertEq(plain.customizedSections, 0, '未定制 → 0 处覆盖')

  const bySearch = LIB.discoverSkills(ws, { search: 'gap' }, store)
  assert(bySearch.some((e) => e.document.id === 'literature-search'), 'Search 命中')

  const byCat = LIB.discoverSkills(ws, { category: 'literature' }, store)
  assert(byCat.every((e) => e.document.category?.startsWith('literature')), 'Category 过滤')

  const rec = LIB.recommendSkills(ws, { topic: 'we need an ablation and evaluation protocol' }, store)
  assert(rec.length > 0, 'Recommend 给出相关能力')
  assert(!('order' in rec[0]) && !('next' in rec[0]), '推荐不含顺序语义（不是流程）')

  // 架构（用户拍板）：系统库只读、Library 是**纯投影** —— 收藏/使用记录已随
  // "用户定制只经设置流入"的决定移除，且不得在 workspace 里落状态文件（§16 边界一）。
  const before = readdirSync(ws).sort()
  LIB.loadSkillLibrary(ws, store)
  LIB.discoverSkills(ws, { search: 'gap' }, store)
  assertEq(readdirSync(ws).sort(), before, 'Library 视图不写任何文件（纯投影）')
  assert(!existsSync(join(ws, 'skill-library.json')), '不再产生 skill-library.json（§16 边界一）')
  const probe = LIB.loadSkillLibrary(ws, store).entries[0]
  assert(!('favorite' in probe) && !('usageCount' in probe), 'Entry 不含收藏/使用字段')
}

/* ── G. 关键不变量：用户定制绝不写进系统库 ───────────────────────── */
console.log('\n[G] 用户定制绝不写进系统库')
{
  const root = S.systemSkillRoot()
  const snapshot = () => {
    const out = {}
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.md')) out[p] = { mtime: statSync(p).mtimeMs, body: readFileSync(p, 'utf8') }
      }
    }
    walk(root)
    return out
  }
  const before = snapshot()

  const store = CUST.createFileCustomizationStore(() => customizationFile)
  store.set('experiment-design', 'Research Method', '我的实验设计方法。')
  store.set('topic-understanding', 'Purpose', '我的目的描述。')
  void LIB.loadSkillLibrary(ws, store)
  S.listSystemSkills()
  CUST.listCustomizationPoints(ws, store.load())

  const after = snapshot()
  assertEq(Object.keys(after), Object.keys(before), '系统库文件集合未变（未新增/删除）')
  assertEq(Object.entries(after).filter(([p, v]) => v.body !== before[p].body).map(([p]) => p), [], '系统库文件内容**逐字节未变**（定制没有写进库）')
  assertEq(Object.entries(after).filter(([p, v]) => v.mtime !== before[p].mtime).map(([p]) => p), [], '系统库文件 mtime 未变（运行时不触碰库）')

  const entry = LIB.loadSkillLibrary(ws, store).entries.find((e) => e.document.id === 'experiment-design')
  assert(entry.effectiveContent.includes('我的实验设计方法。'), '定制在**合成结果**里生效')
  assert(!entry.document.body.includes('我的实验设计方法。'), '但**基线文档**不含定制（库保持原样）')
}

/* ── H. Harness Provider ────────────────────────────────────────── */
console.log('\n[H] Harness Skill Provider')
{
  const store = CUST.createFileCustomizationStore(() => customizationFile)
  const provider = LIB.createConvFusionSkillProvider(store)({ signal: new AbortController().signal, invalidate: () => {} })
  assertEq(provider.name, 'convfusion', 'provider 名')

  const candidates = await provider.list({ cwd: ws })
  assert(candidates.length >= 5, '暴露系统库全部 Skill')
  const gap = candidates.find((c) => c.name === 'literature-search')
  assertEq(gap.rank, LIB.CONVFUSION_SKILL_RANK, 'rank 设置')
  assertEq(gap.invocation.modelInvocable, true, '模型可调用')
  assertEq((await provider.list({ cwd: '/nope' })).length, candidates.length, 'cwd 不影响候选（包内资产）')

  const c = candidates.find((x) => x.name === 'experiment-design')
  const def = await provider.get(c, { cwd: ws })
  assert(def.content.includes('我的实验设计方法。'), 'get().content 含用户定制')
  assert(def.content.includes('## Research Method'), 'get().content 含原有方法结构')
  assert(def.metadata.customizedSections >= 1, 'metadata 标注定制处数')

  store.set('experiment-design', 'Research Method', '改后的方法。')
  const def2 = await provider.get(c, { cwd: ws })
  assert(def2.content.includes('改后的方法。'), '改定制后 get() 立即反映（刻意不缓存）')
  assert(!def2.content.includes('我的实验设计方法。'), '旧定制不再出现')

  const aborted = new AbortController()
  aborted.abort()
  assertEq(await provider.list({ cwd: ws, signal: aborted.signal }), [], 'signal aborted → 立即返回空')

  const bare = LIB.createConvFusionSkillProvider()({ signal: new AbortController().signal, invalidate: () => {} })
  const bareDef = await bare.get(c, { cwd: ws })
  assert(!bareDef.content.includes('改后的方法。'), '无 store → 返回纯基线')
  assert(bareDef.content.includes('## Research Method'), '无 store 仍返回可用 Skill')
}

/* ── I. 边界：库只读 ────────────────────────────────────────────── */
console.log('\n[I] 边界')
{
  for (const op of ['createSkill','forkSkill','reviseSkill','deleteSkill','saveSkillBody','renameSkill','updateSkillMeta']) {
    assert(!(op in S), `skills.ts 无写操作 ${op}（用户定制走设置，不改库）`)
  }
  assert('listSystemSkills' in S, 'skills.ts 提供只读发现')
}

rmSync(ws, { recursive: true, force: true })
rmSync(cfgDir, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} stage2-skill-library: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
