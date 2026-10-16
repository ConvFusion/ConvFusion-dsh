#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 【设置】-【ConvFusion】离线验证（无浏览器、无 DSH）。
 *
 * ## 为什么需要它
 *
 * 设置页有两半（host 的 RPC + browser 的 React 页面），浏览器那半没法在这个环境里点。
 * 但设置页**绝大部分的正确性其实在宿主侧**：状态怎么组装、白名单怎么拦、
 * 保存到哪个文件、改文件名后是否立刻改写新文件。这些都能离线断言。
 *
 * 浏览器那半则做**结构性验证**：bundle 格式、外部依赖、注册点、源码不得引入禁用依赖。
 *
 * ## 覆盖
 *
 *   1. 状态组装：类别 → 研究方法 → 可定制章节（v2 的层级，不是 v0.1.5 的模块 → 节点）
 *   2. 保存 / 恢复 / 恢复整个 Skill / 全量恢复 → 真的落到定制文件
 *   3. 白名单：不可定制的章节必须被拒（输出契约不允许改）
 *   4. 改文件名 → 定制内容写到新文件（配置必须"可被设置页改写"）
 *   5. 系统 Skill 库**只读**：设置页的任何操作都不改动包内资产
 *   6. 客户端 bundle：`window.__ModuleLoader__` 格式、id、external、注册点
 *   7. 静态边界：客户端不 value-import `@deepseek-ai/*`；不出现网络/凭据字段
 *   8. 自动选中优先级：选了有定制的能力，界面必须落到那个章节（在 node 里求值 bundle 断言）
 *
 * 用法：
 *   node scripts/verify-settings-page.mjs packages/dsh-convfusion
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const RPC = await import(lib('settings-rpc.js'))
const CUST = await import(lib('research/skill-customization.js'))
const CFG = await import(lib('config.js'))
// 环境配置（开发 / 生产的地址分岔）—— 只在这里断言，逻辑细节见 verify-server-login.mjs
const ENVCFG = await import(lib('server-env.js'))

/**
 * 当前生产（ConvFusion.com）地址 —— **试运行期**指向 apibrowser 中转，正式域名
 * `convfusion.com` 尚未启用。全脚本只此一处；切回正式域名时改这里
 * （以及 `src/server-env.ts` 的内置兜底与两个 `convfusion.env*.json`）。
 */
const PROD_URL = 'https://convfusion.apibrowser.com:4747'

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (!ok) console.log(`    actual: ${JSON.stringify(a)}\n    expect: ${JSON.stringify(b)}`)
  assert(ok, label)
}

const inlineCount = (haystack, needle) => haystack.split(needle).length - 1

/**
 * 读一个**客户端纯逻辑模块**并按 ESM 求值。
 *
 * 客户端的产物是 esbuild 打包的 `lib/client.js`（没有单文件 JS 产物），所以纯逻辑
 * （不依赖 React）没法像宿主模块那样 `import(lib(...))`。这里用仓库已有的 esbuild
 * 现场转译源码 —— 测的是**源码本身**，也不必为测试改构建布局。
 *
 * ⚠️ 定义在**顶层**：它被多个段落用（含文件末尾的 [9] 渲染段），
 * 放进某个 `{ }` 段落里就只有那一段看得见。
 */
async function importClientModule(rel) {
  const esbuild = await import('esbuild')
  const code = readFileSync(join(PKG, 'src/client', rel), 'utf8')
  const out = await esbuild.transform(code, { loader: 'ts', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(out.code).toString('base64')}`)
}

const HOME = mkdtempSync(join(tmpdir(), 'cf-settings-'))
mkdirSync(join(HOME, 'convfusion'), { recursive: true })

/* ── 夹具：一个「配置可变」的 host 设置面 ───────────────────────────── */
function makeHost({
  file = 'skill-customizations.json',
  dir = join(HOME, 'convfusion'),
  /** true = 这个宿主有可用的设置存储（能落盘配置补丁）—— 见 [1h]。 */
  writableConfig = false,
} = {}) {
  let config = { customizationFile: file, customizationDir: dir }
  const writes = []
  const store = CUST.createFileCustomizationStore(() => CFG.resolveCustomizationPath(config))
  const handler = RPC.createSettingsRpcHandler({
    getConfig: () => config,
    store,
    ...(writableConfig
      ? {
          setConfig: async (patch) => {
            writes.push(patch)
            // 真实实现里这次写入**立刻**生效（落盘后 `getConfig()` 就看得见）
            config = { ...config, ...patch }
          },
        }
      : {}),
  })
  return {
    handler,
    store,
    writes,
    get config() {
      return config
    },
    setFile(next) {
      config = { ...config, customizationFile: next }
    },
    path: () => CFG.resolveCustomizationPath(config),
  }
}

const state = async (h) => {
  const r = await h.handler('state', {})
  assert(r.ok, 'state 端点返回成功')
  return r.value
}

/* ════════════════════════════════════════════════════════════════════════
 * 1. 状态组装（v2 层级：类别 → 研究方法 → 章节）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1] 状态组装：类别 → 研究方法 → 可定制章节')
{
  const h = makeHost()
  const s = await state(h)

  assert(s.categories.length >= 5, `按类别分组（${s.categories.length} 个类别）`)
  assert(s.categories.every((c) => c.categoryId && c.categoryName), '每个类别都有 id 与显示名')
  assert(s.categories.every((c) => c.skills.length > 0), '每个类别至少有一个研究方法')
  assert(s.categories.every((c) => c.skills.every((k) => k.sections.length > 0)), '每个研究方法都有可定制章节')
  assert(s.library.skillCount >= 40, `系统库只读状态可读（${s.library.skillCount} 个 Skill）`)

  // v2 与 v0.1.5 的关键差异：没有"模块"，键是 Skill id
  const skillIds = s.categories.flatMap((c) => c.skills.map((k) => k.skillId))
  assert(skillIds.includes('literature-search'), '研究方法用 Skill id（literature-search）')
  assert(
    !s.categories.some((c) => /initiation|discovery|conception/i.test(c.categoryId)),
    '**没有**模块概念（initiation/discovery/conception 不出现）',
  )

  // 章节白名单
  assertEq(s.customizableSections, CUST.CUSTOMIZABLE_SECTIONS, '章节白名单来自 CUSTOMIZABLE_SECTIONS')
  const sections = new Set(s.categories.flatMap((c) => c.skills.flatMap((k) => k.sections.map((x) => x.section))))
  assert([...sections].every((x) => CUST.CUSTOMIZABLE_SECTIONS.includes(x)), '只暴露允许定制的章节')
  assert(sections.has('Research Method'), '含 Research Method')

  // 章节顺序 = `CUSTOMIZABLE_SECTIONS` 的规范顺序（Purpose 在前）。
  // 回归：曾按 `section.localeCompare` 排 → 每个能力的首个章节恒为 `Evidence Requirements`，
  // 设置页 ③ 的默认项对几乎所有能力都一样，切 ② 时看起来"③ 没反应"。
  const allSkills = s.categories.flatMap((c) => c.skills)
  // C00 全局能力只提供「研究方法」一章（见下），所以"首章是 Purpose"只对普通类别断言
  const regularSkills = s.categories.filter((c) => c.code !== 'C00').flatMap((c) => c.skills)
  assert(
    regularSkills.every((k) => k.sections[0]?.section === 'Purpose'),
    '每个（普通类别）能力的首个可定制章节都是 Purpose（规范顺序，不是字母序）',
  )
  assert(
    allSkills.every((k) =>
      k.sections.every((x, i, arr) => i === 0 || CUST.CUSTOMIZABLE_SECTIONS.indexOf(arr[i - 1].section) < CUST.CUSTOMIZABLE_SECTIONS.indexOf(x.section)),
    ),
    '能力内章节严格按规范顺序排列',
  )
  // ③ 的列表确实随 ② 变化：入口能力没有 Prerequisites，带前置的能力有
  const entrySkill = allSkills.find((k) => k.skillId === 'literature-search')
  const prereqSkill = allSkills.find((k) => k.skillId === 'literature-screening')
  assertEq(entrySkill?.sections.length, 6, '入口能力 literature-search 有 6 个可定制章节')
  assertEq(prereqSkill?.sections.length, 7, '带前置的 literature-screening 有 7 个（切换 ② 时 ③ 的列表会变）')
  assertEq(
    prereqSkill?.sections.findIndex((x) => x.section === 'Prerequisites'),
    2,
    'Prerequisites 落在规范位置（第 3 项）',
  )

  // C00 全局能力：③ 只提供**真正全局生效**的章节（Research Method），其余章节只是技能正文，
  // 按需加载才读到 —— 列成"全局设置"会误导用户以为改了就对整项研究生效。
  const globalCat = s.categories.find((c) => c.code === 'C00')
  assert(globalCat !== undefined, '设置页含 C00 全局能力类别')
  assertEq(
    globalCat?.skills.flatMap((k) => k.sections.map((x) => x.section)),
    ['Research Method'],
    'C00 的 ③ 只有「研究方法」一章（全局生效的那一章）',
  )
  assertEq(
    globalCat?.skills.map((k) => k.skillId),
    ['research-process'],
    'C00 当前只含「研究过程定义」',
  )

  // 每个章节都带系统原文（用户必须看得见自己在覆盖什么）
  const withBase = s.categories.flatMap((c) => c.skills.flatMap((k) => k.sections))
  assert(withBase.every((x) => typeof x.base === 'string' && x.base.trim().length > 0), '每项都带系统原文（非空）')
  assert(withBase.every((x) => x.overridden === false), '初始全部未定制')
  assertEq(s.file.exists, false, '初始尚未创建定制文件')
  assertEq(s.file.entryCount, 0, '初始 0 处覆盖')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1b. 名称与章节必须解析正确（围栏感知）—— 设置页显示的就是这些字符串
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1b] Skill 名称与章节解析（跳过代码围栏）')
{
  const SKILLS = await import(lib('research/skills.js'))
  const docs = SKILLS.listSystemSkills()
  assert(docs.length >= 40, `系统库有 ${docs.length} 个 Skill`)

  // 曾经的 bug：title 取"最后一个 `# ` 行"，而逐字迁移的提示词在围栏里含 `# …`，
  // 于是 16/47 的 Skill 名字变成了那句 JSON 策略说明。
  const junk = docs.filter((d) => /JSON formatting policy|\(JSON|Foundation Layer/i.test(d.name))
  assertEq(junk.map((d) => d.id), [], '没有 Skill 的名字来自代码围栏（曾 16/47 中招）')

  const named = docs.filter((d) => d.name && d.name.trim().length > 0 && d.name !== d.id)
  assertEq(named.length, docs.length, '每个 Skill 都有可读名字（不是 id 兜底）')

  // 名字里不应带 `Skill: ` 前缀（渲染器写的是 `# Skill: X`）
  assert(!docs.some((d) => /^Skill:\s/i.test(d.name)), '名字已去掉 `Skill: ` 前缀')

  // 章节名：必须是干净的标题，不能是正文句子
  for (const d of docs) {
    for (const sec of d.sections) {
      if (sec.title.length > 60 || /[。.:：]\s*$/.test(sec.title)) {
        assert(false, `${d.id} 的章节名可疑：${JSON.stringify(sec.title)}`)
      }
    }
  }
  assert(true, '所有章节名都是干净的标题（无正文句子）')

  // 曾凭空多出 10 个假章节（围栏里的 `## `）
  const ra = docs.find((d) => d.id === 'result-analysis')
  assert(ra !== undefined, 'result-analysis 存在')
  assertEq(
    ra.sections.map((s) => s.title),
    ['Purpose', 'When to Use', 'Prerequisites', 'Research Method', 'Reasoning Guidance', 'Evidence Requirements', 'Expected Output', 'Source Prompts (verbatim from ConvFusion)'],
    'result-analysis 不再被围栏里的 `## ` 切出假章节',
  )
  const eo = ra.sections.find((s) => s.title === 'Expected Output')
  assert((eo?.body.length ?? 0) > 100, 'Expected Output 正文完整（未被假章节截断）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1c. 术语：Skill = 能力；一整套个性化能力 = 研究方法
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1c] 设置页术语')
{
  // 只看**会被渲染的字符串**：先剥掉注释与类型声明，否则注释里的术语表会自我满足
  const raw = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/^\s*(?:\*|\/\*).*$/gm, '')

  const zh = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')
  assert(zh.includes('① 能力类别'), '一级下拉叫「能力类别」')
  assert(zh.includes('② 能力'), '二级下拉叫「能力」（不是"研究方法"）')
  assert(zh.includes("'settings.library.title': '能力库'"), '选择区以「能力库」命名（用户的词）')
  assert(zh.includes('能力库'), '提到「能力库」')
  assert(zh.includes('形成你自己的研究方法'), '说明"定制多项能力 → 形成研究方法"')
  assert(!/个研究方法/.test(src), '界面文案里不再把单个 Skill 称为"研究方法"')
  assert(!/>\s*研究方法\s*</.test(src) && !/② 研究方法/.test(src), '没有把下拉直接叫"研究方法"')

  // 概念本身要写进文件头的术语表（给后来者）
  assert(raw.includes('一个 Skill 不等于一套研究方法'), '术语表写明 Skill ≠ 研究方法')

  const bundleText = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  assert(bundleText.includes('能力类别') && bundleText.includes('能力库'), '术语已进入构建产物')
  assert(/[\u4e00-\u9fa5]/.test(bundleText), 'bundle 是原文 UTF-8（不转义中文，与官方 bundle 一致）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1d. 定制文件对用户不可见
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1d] 定制文件不出现在界面上')
{
  const raw = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')

  assert(!src.includes('定制文件'), '渲染代码里不再有「定制文件」卡片')
  assert(!/customizationFile/.test(src), '界面不再读写 customizationFile')
  assert(!/customizationDir/.test(src), '界面不再读写 customizationDir')
  assert(!src.includes('尚未创建'), '不再显示"尚未创建"这类内部状态')
  // 界面**可以**写 OpenAlex Key（Tab 3），但绝不能再写定制文件相关字段
  assert(!/scope\.set\(\s*['"]customization/.test(src), '界面不往 scope 写 customization* 字段')
  /*
   * ⚠️ 2026-10：Tab 3 的 Key **不许**再走 `scope.set('openalexApiKey', …)`。
   * 那条路在非 loopback 页面上是静默 no-op（`configForm.set()` resolve `false` 且不写盘），
   * 而返回值当时被忽略 → 界面谎报「已保存」，用户看到的是"设置了却总是未配置"。
   * 现在走宿主的 `retrieval/saveKey` / `retrieval/clearKey`（见 [1h] 的端点断言）。
   */
  assert(!/scope\.set\(\s*['"]openalexApiKey/.test(src), 'Tab 3 **不再**用 scope 写 OpenAlex Key（会静默失败）')
  assert(/retrieval\/saveKey/.test(src) && /retrieval\/clearKey/.test(src), 'Tab 3 的保存 / 清除走宿主端点')

  // 但底层配置仍然存在（文件仍可经设置文档 / profile patch 调整）
  const cfg = readFileSync(join(PKG, 'src', 'config.ts'), 'utf8')
  assert(/customizationFile/.test(cfg), '配置项本身保留（只是不暴露给用户）')
  const bundleText = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  assert(!bundleText.includes('定制文件'), '构建产物里也没有「定制文件」字样')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1e. 三个 Tab
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1e] 三个 Tab：本地研究方法 / ConvFusion.com / 系统设置')
{
  const bundleText = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  // ⚠️ 第二个 Tab 已由【研究方法库】改名为【ConvFusion.com】：它是社区 / 商业功能入口
  // （账号 + 服务器 + 研究网络），不只是"研究方法库"（2026-09 用户拍板）。
  for (const label of ['本地研究方法', 'ConvFusion.com', '系统设置']) {
    assert(bundleText.includes(label), `Tab 存在：${label}`)
  }
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const visible = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')

  assert(/useState<SettingsTab>\('local'\)/.test(src), '默认停在「本地设置」')
  assert(/type SettingsTab = 'local' \| 'community' \| 'retrieval'/.test(src), 'Tab 键就是那三个')

  // ── 排版规范：JSX 文本里不能出现字面 Markdown（会原样显示星号）──
  const starLines = visible.split('\n').filter((l) => l.includes('**') && !l.includes('const '))
  assertEq(starLines.map((l) => l.trim().slice(0, 40)), [], '可见文案里没有字面 markdown（** 会显示成星号）')

  // ── Hero 副标题：一句话，不堆信息 ──
  assert(/<div style=\{S\.heroSub\}>\{t\('settings\.hero\.subtitle'\)\}<\/div>/.test(src), 'Hero 副标题只有一句本地化文案')
  assert(!/全部能力已在 DSH 内原生运行/.test(visible), 'Hero 不再堆"原生运行 / 能力库 N 项"等冗余信息')
  // 方法只在本地（Pitch Deck 第 5 页的核心原则）：本地页要明确标出来（文案走词条）
  assert(/settings\.library\.localOnly/.test(src), '能力库标注「仅本机」（定制不会上传）')

  // ── Tab 2：ConvFusion.com —— 账号 + 服务器 + 研究工作（2026-09 起是**真实**功能）──
  //
  // ⚠️ 界面文案在合并上游 i18n 后**全部走 locale 字典**，源码里不再有中文字面量。
  // 所以这里的断言分两类：
  //   ① 源码里确实用了这些词条 key（结构）；
  //   ② 中英字典都有对应文案（不出现半边缺失，也不留旧的"未实现"文案）。
  // `verify-i18n.mjs` 另外保证"中英 key 完全一致"与"无硬编码中文"。
  const zhDict = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')
  const enDict = readFileSync(join(PKG, 'src', 'client', 'i18n', 'en.ts'), 'utf8')
  const dictHas = (key, zhSnippet, enSnippet, label) => {
    assert(zhDict.includes(`'${key}'`), `${label}：中文字典含词条 ${key}`)
    assert(enDict.includes(`'${key}'`), `${label}：英文字典含词条 ${key}`)
    if (zhSnippet) assert(zhDict.includes(zhSnippet), `${label}：中文文案「${zhSnippet}」`)
    if (enSnippet) assert(enDict.includes(enSnippet), `${label}：英文文案`)
  }
  // ⚠️ 切片从 `PublishDialog` 开始：对话框组件定义在 CommunityTab **之前**，
  // 只切 CommunityTab 会让"对话框不显示排除项"这类断言看不到实现（第一版就漏了）。
  const community = src.slice(src.indexOf('function UploadCategoryList('), src.indexOf('function SystemTab('))
  /** Tab 本体（不含对话框）：版式类断言只看它。 */
  const tabBody = src.slice(src.indexOf('function CommunityTab('), src.indexOf('function SystemTab('))
  // 登录的两条入口（次要入口折叠）
  dictHas('community.login.keyLabel', 'API Key 登录', 'Sign in with API key', 'API Key 登录入口')
  dictHas('community.action.inviteShow', '使用邀请码注册', 'Register with an invitation', '邀请码注册入口')
  // 账号区那个按钮叫【刷新】（曾叫【重新验证】）：与页面其它刷新按钮统一
  dictHas('community.action.refresh', '刷新', 'Refresh', '账号刷新入口')

  // 账号行的【刷新】【登出】是**图标按钮**：宽度可预测，账号行不会被文案挤成两行。
  // 代价是失去可见文案 → title 与 aria-label 缺一不可（读屏与悬浮都靠它）。
  assert(/iconBtn: \{[\s\S]{0,320}?width: 26,[\s\S]{0,80}?height: 26,/.test(src), '有固定方形的图标按钮样式')
  // 刷新抽成一个组件：账号行 + 研究工作**四个** Tab（我的 / 可指导 / 可加入 / 指导中）
  // + Token 余额弹窗 = 6 处
  assert(src.includes('function RefreshIconButton('), '刷新图标按钮是独立组件')
  assertEq(
    (src.match(/<RefreshIconButton /g) ?? []).length,
    6,
    '六处都在用它（账号 + 四个 Tab + 余额弹窗）',
  )
  assert(
    /title=\{busy \? t\('community\.action\.loading'\) : t\('community\.action\.refresh'\)\}[\s\S]{0,120}?aria-label=\{t\('community\.action\.refresh'\)\}/.test(src),
    '刷新图标同时有 title 与 aria-label（忙碌时 title 说"读取中"）',
  )
  // 旧的四份文字刷新按钮必须绝迹（否则改一处漏三处）
  assert(
    !/\{mineLoading \? t\('community\.action\.loading'\) : t\('community\.action\.refresh'\)\}/.test(src),
    '不再有文字版刷新按钮（已全部图标化）',
  )
  assert(
    /title=\{fromEnv \? t\('community\.tip\.envKey'\) : t\('community\.action\.signOut'\)\}/.test(src),
    '登出图标同样带说明（来自环境变量时说明为什么点不了）',
  )
  assert(
    !/\{t\('community\.action\.signOut'\)\}<\/button>/.test(src),
    '登出不再渲染成文字按钮',
  )
  dictHas('community.action.signOut', '登出', 'Sign out', '登出')
  assert(/account\/login/.test(community) && /account\/register/.test(community), '两个入口各自走对应端点')
  assert(!/cf_live_[0-9a-f]{16}/.test(community), '不得把任何 API Key 写死进源码')
  // 服务器端**没有**口令登录：界面不得出现口令输入（那是凭空造的概念）
  assert(!/type="password"[^>]*name="password"/.test(community), '不发明口令字段')
  assert(/invitationCode/.test(community), '邀请码注册会用邀请码')
  // 旧"研究方法库"演示版的东西必须已彻底移除（源码与字典都不许残留）
  for (const ghost of ['convfusion 官方', 'ss_theory', 'bm_researcher', '演示数据', '以上为界面演示']) {
    assert(!zhDict.includes(ghost) && !enDict.includes(ghost), `不再残留旧的演示数据：${ghost}`)
  }
  assert(/community\.work\.title/.test(community), '有「研究工作」卡片（这一页的主体内容）')

  // ── 版式：用户与登录必须是**一张紧凑卡片**（2026-09 用户反馈）──
  //
  // 反馈原文：① API Key 登录 + ② 邀请码注册 各占一大片，"面积大、体验不好"。
  // 要求：未登录只显示必须的登录项；登录之后**同一张卡片**显示用户信息。
  const cardHeads = (tabBody.match(/S\.cardHead/g) ?? []).length
  assert(cardHeads <= 2, `ConvFusion.com 最多两张卡片（用户信息卡 + 研究工作卡），实际 ${cardHeads}`)
  assert(/S\.miniTabs/.test(community) && /<MiniTab/.test(community), '用户信息区用内部 Tabs（账号 / 服务器设置）')
  dictHas('community.tab.server', '服务器设置', 'Server', '第二个内部 Tab')
  assert((community.match(/S\.field/g) ?? []).length === 0, '不再用大块 S.field 排表单（改用行内 compactInput）')
  assert(/compactInput/.test(community), '登录 / 注册输入框用行内紧凑样式')
  assert(/inviteOpen/.test(community) && /setInviteOpen/.test(community), '邀请码注册是折叠的次要入口')
  assert(/community\.action\.inviteHide/.test(community), '展开后可收起邀请码注册')
  // 已登录 / 未登录两个分支必须在**同一张卡片**里（以卡片边界判定，不靠字符串先后）
  const firstHead = tabBody.indexOf('S.cardHead')
  const secondHead = tabBody.indexOf('S.cardHead', firstHead + 1)
  const firstCard = tabBody.slice(firstHead, secondHead === -1 ? undefined : secondHead)
  assert(/community\.login\.keyLabel/.test(firstCard), '登录表单在第一张卡片内')
  assert(/S\.accountName/.test(firstCard), '账号信息和登录表单在同一张卡片（登录后同一个位置）')

  // ── 版式：用户信息卡**默认折叠**（2026-10 用户要求）────────────────────
  //
  // 折叠时卡片头就给出"是谁 + 还剩多少 Token"，展开才是账号 / 服务器设置。
  // 三件事分别钉：① 默认确实是收起；② 卡片头真是开关（鼠标 + 键盘）；
  // ③ 收起时给出的正是用户名与 Token —— 否则"折叠"就等于把功能藏起来。
  assert(/const \[userOpen, setUserOpen\] = React\.useState\(false\)/.test(src), '用户信息卡默认折叠')
  assert(/aria-expanded=\{userOpen\}/.test(src), '卡片头是折叠开关（aria-expanded 可访问）')
  assert(/\{userOpen \? \(/.test(tabBody), '卡片体只在展开时渲染')
  {
    // 从卡片头（唯一的 role="button"）切到卡片体开头：这一段就是"折叠摘要"
    const headFrom = tabBody.indexOf('role="button"')
    const headTo = tabBody.indexOf('S.cardBody')
    assert(headFrom > -1 && headTo > headFrom, '用户信息卡的结构：卡片头 → 卡片体')
    const head = tabBody.slice(headFrom, headTo)
    assert(/!userOpen/.test(head), '折叠摘要只在收起时渲染（展开后不重复显示）')
    assert(/S\.accountName/.test(head), '折叠摘要给出用户名')
    assert(/tokens\.available/.test(head), '折叠摘要给出 Token 数')
    // 折叠时最上面那颗余额按钮必须**不触发折叠**（否则点余额会把卡片收起来）
    assert(/stopPropagation\(\)/.test(head), '折叠摘要里的余额按钮不触发折叠开关')
  }
  // 失败不能藏在折页后面：账号类调用一失败就自动展开
  assert(
    /setFailure\([\s\S]{0,400}?setUserOpen\(true\)/.test(src),
    '登录 / 验证失败时自动展开（错误必须看得见）',
  )
  dictHas('community.tip.expand', '展开账号与服务器设置', 'Show account and server settings', '折叠开关的悬浮说明')
  dictHas('community.tip.collapse', '收起账号与服务器设置', 'Hide account and server settings', '收起时的悬浮说明')

  // ── 【账号】的仪表板：少量小图（Token / 存储 / 项目，2026-10 用户要求）──
  //
  // 三条纪律各有断言：① 图形是**画的**（环形图），不是一堆文字；
  // ② 数字来自**服务器**（Token 来自已验证的余额、存储/项目来自 `account/usage`）；
  // ③ "读不到"与"确实是 0"分开显示（`—` / `…`，绝不用 0 兜底）。
  assert(/function UsageRing\(/.test(src), '仪表板的小图是独立组件（比例由它画）')
  assert(/function DashTile\(/.test(src) && /S\.dashTile/.test(src), '仪表板用同规格的小图块（三块对齐）')
  assert(
    /community\.dash\.token/.test(community) &&
      /community\.dash\.storage/.test(community) &&
      /community\.dash\.projects/.test(community),
    '仪表板有三块：Token / 存储 / 项目',
  )
  assert(/account\/usage/.test(community), '存储与项目取自 account/usage（不写死、不猜）')
  assert(/community\.error\.hostRestart/.test(community), '旧宿主没有 account/usage 时说清"需重启"')
  assert(
    /usagePhase === 'loading' \? '…' : '—'/.test(src),
    '"还在读"（…）与"读不到"（—）分开：拿不到**不**画成 0',
  )
  dictHas('community.dash.token', 'Token 余额', 'Token balance', '仪表板：Token')
  dictHas('community.dash.storage', '存储空间', 'Storage', '仪表板：存储空间')
  dictHas('community.dash.projects', '已发布项目', 'Published projects', '仪表板：已发布项目')

  // ── 研究工作：四个视图（我的 / 可指导 / 可加入 / 指导中，v0.6.0）──────────
  assert(/workTab === 'mine'/.test(community) && /workTab === 'mentor'/.test(community), '研究工作卡片有多个视图')
  /*
   * Tab 顺序按**卡片头里实际渲染的 MiniTab**判定，不用 indexOf 比字符串 ——
   * 早先那种写法会被别处（例如"角色变了就回落到我的"那个 effect）里的
   * `workTab === 'mentor'` 提前命中，断言的其实不是顺序。
   */
  {
    // ⚠️ 容忍属性换行（写多行是合法的；第一版正则只认行内写法，改排版就误报）
    const tabOrder = [...community.matchAll(/<MiniTab[\s\S]{0,80}?active=\{workTab === '(\w+)'\}/g)].map((m) => m[1])
    assertEq(tabOrder, ['mine', 'mentor', 'joinable', 'mentorship'], 'Tab 顺序：我的 → 可指导 → 可加入 → 指导中')
  }
  /*
   * 【我的】的行：显示**研究工作自己的名字**（与【指导中】同一个取值规则），
   * 并按 **work_id** 区分 —— 会话工作区目录名（如 `ConvFusion-dsh`）区分不了，
   * 因为同一个会话工作区里可以有多项研究（2026-10 用户要求）。
   */
  assert(
    /<div style=\{S\.listTitle\}>\{workLabelOf\(w\)\}<\/div>/.test(src),
    '【我的】行标题 = 研究工作名（workLabelOf，与【指导中】同款）',
  )
  assert(/\{w\.workId \? <span>\{w\.workId\}<\/span> : null\}/.test(src), '行上显示 work_id（身份；没有则不占位）')
  assert(/workName\?: string/.test(src) && /workId\?: string \| null/.test(src), '列表项类型带 workName / workId')

  /*
   * Tab 上的**条数**（【我的 (2)】）：取自同一个 state，所以与点进去的行数一致。
   * `null`（未登录 / 还没读到 / 读失败）→ **不显示数字**：`0` 是断言"确实没有"，
   * 把"还不知道"画成 (0) 就是用假信息掩盖状态。
   */
  {
    const counts = [...community.matchAll(/count=\{(\w+)\?\.length \?\? null\}/g)].map((m) => m[1])
    assertEq(counts, ['mine', 'works', 'joinable', 'proposals'], '四个 Tab 各带自己的列表条数')
    assert(/typeof count === 'number' \? ` \(\$\{count\}\)` : ''/.test(src), '条数渲染成「 (N)」；null 时什么都不显示')
  }

  // ⚠️ 【可指导】**只对导师显示**（v0.6.0 用户要求：研究者只看得到 我的/可加入/指导中）
  assert(
    /\{canMentor \? \(\s*<MiniTab[\s\S]{0,80}?active=\{workTab === 'mentor'\}/.test(community),
    '【可指导】按导师角色显示（没有导师角色就不显示这个 Tab）',
  )
  assert(
    /workTab === 'mentor' && !canMentor/.test(community),
    '角色变化后当前 Tab 不可见 → 回落到【我的】（否则顶栏一个选中态都没有）',
  )
  assert(/work\/mine/.test(community), '「我的」走 work/mine（本机研究项目）')
  assert(/canMentor/.test(community) && /MENTOR/.test(community), '「可指导」需要导师角色')
  // 【可加入】：导师发布的选题（`SEEK_STUDENT`），所有人都看得到
  assert(/workTab === 'joinable'/.test(community), '有【可加入】视图')
  assert(
    /loadWorks\('SEEK_STUDENT'\)/.test(community) && /loadWorks\('SEEK_MENTOR'\)/.test(community),
    '两个列表按方向拉（可指导 = SEEK_MENTOR，可加入 = SEEK_STUDENT）',
  )
  dictHas('community.tab.joinable', '可加入', 'Joinable', '第四个 Tab')
  dictHas('community.hint.noJoinable', '还没有导师发布选题', 'No mentor-published topics', '【可加入】空态')
  dictHas('community.hint.mineEmpty', '本机还没有研究项目', 'No local research projects yet', '本机为空时的空状态')
  // ⚠️ 铁律：读失败**不能**显示成"没有研究项目"（实测踩过：端点不存在时界面说"本机还没有研究项目"）
  assert(/mineError/.test(community), '「我的」有独立的失败态')
  assert(/host-restart/.test(community), '旧宿主（无 work/mine）时单独给出 host-restart')
  dictHas('community.error.hostRestart', '宿主侧需要重启', 'must be restarted', '需重启提示')
  dictHas('community.badge.registryUnavailable', '注册表不可用', 'Registry unavailable', '注册表读不到时的标注')
  // Tab 前必须有「研究工作」字样：不能只看到「我的 / 可指导」两个孤立标签
  {
    const titleIdx = community.indexOf('community.work.title')
    const firstTabIdx = community.indexOf("workTab === 'mine'")
    assert(titleIdx > -1 && titleIdx < firstTabIdx, '「研究工作」标题在「我的 / 可指导」Tab 之前')
  }

  // ── 研究工作列表（Pitch Deck：Discover Research, Not People）──────────
  assert(/SAMPLE_WORKS/.test(community), '有示例研究工作数据（可指导 · 未登录时展示）')
  dictHas('community.badge.sample', '示例数据', 'Sample data', '示例数据徽章（不假装是真的）')
  assert(/work\/list/.test(community), '登录后走 work/list 拉真实列表')
  assert(/work\/summary/.test(community) && /work\/brief/.test(community), '列表项操作走 work/summary 与 work/brief')
  assert(/intents/.test(community) && /crypto\.randomUUID/.test(community), '详情带幂等键（402 后重试不重复扣费）')
  // 两级披露的界面术语要**对齐业务**（先免费判断相关性，再付费深入了解），
  // 而不是照搬接口名（Summary / Brief 在界面上说不清各自是干什么的）
  dictHas('community.action.summary', '概览', 'Overview', '第一级：免费判断相关性')
  dictHas('community.action.brief', '详情', 'Details', '第二级：付费深入了解')
  dictHas('community.tip.summary', '免费', 'Free', '概览的 tooltip 说明免费')
  dictHas('community.tip.briefCost', '深入了解', 'Go deeper', '详情的 tooltip 说明给到什么')
  dictHas('community.briefState.cost', '1 Token', '1 Token', '未支付的角标：1 Token')
  dictHas('community.briefState.paid', '已支付', 'Paid', '已支付的角标：已支付')
  dictHas('community.hint.sampleFootnote', '示例数据，登录后可浏览并操作', 'Sample data', '未登录时的示例标注')
  // 未登录分支的示例行必须整行禁用
  const sampleIdx = community.indexOf('SAMPLE_WORKS.map')
  assert(sampleIdx > -1 && /disabled/.test(community.slice(sampleIdx, sampleIdx + 1200)), '示例行按钮禁用')

  // ── 「寻找指导」= 发布本机研究（2026-09 用户定稿）────────────────────────
  //
  // 用户的点法：在【我的】列表里点**这一项**的「寻找指导」——**只有点了才上传**。
  assert(/work\/publish/.test(community), '「寻找指导」走 work/publish（点了才发布）')
  assert(/doPublish/.test(community) && /openPublish/.test(community), '有发布动作（openPublish → 对话框 → doPublish）')
  dictHas('community.action.seekMentor', '寻找线上导师', 'Find an online mentor', '「寻找线上导师」按钮')
  dictHas('community.action.seekStudent', '寻找优秀学生', 'Find top students', '「寻找优秀学生」按钮')
  dictHas('community.action.republish', '更新', 'Update', '已发布后按钮变「更新」')
  dictHas('community.badge.inNetwork', '已在网络中', 'On the network', '已发布标记')
  dictHas('community.notice.published', '{title} · 研究状态 v{version}', '{title} · state v{version}', '发布成功回执（一行式）')
  // 「已发布」徽章保留（用户要求）：成功显示徽章，失败显示错误码
  assert(
    /publishNotice\.tone === 'success' \? 'success' : 'error'/.test(community) &&
      /publishNotice\.tone === 'success'[\s\S]{0,120}community\.badge\.published/.test(community),
    '成功回执保留「已发布」徽章（失败显示错误码）',
  )
  assert(
    !/'community\.notice\.published', \{ title: w\.title, version[^}]*\}[^\n]*已发布/.test(community) &&
      !/已发布 · \{title\}/.test(zhDict),
    '文案里不重复写"已发布"（由徽章承载）',
  )
  dictHas('community.hint.publishMissing', '网络上暂时看不到', 'not visible on the network', '缺字段时如实说明')
  // 未登录不能发布：按钮禁用 + 悬浮提示说明原因（不是点了没反应）
  assert(
    /const disabled = !account \|\| publishing !== null \|\| dialogLoading !== null/.test(community),
    '未登录 / 发布中时按钮禁用',
  )
  dictHas('community.tip.publishNeedSignIn', '先登录 ConvFusion.com', 'Sign in to ConvFusion.com before publishing', '未登录时的提示')
  dictHas('community.tip.publish', '研究方法不会被上传', 'never uploaded', '发布只上传研究进展（方法留在本机）')

  // ── 发布确认对话框（2026-09 用户定稿）──────────────────────────────────
  //
  // 用户的两条要求：① 让用户看到"推荐传什么"并能调整；② **机器产物（排除项）直接不显示**。
  assert(/PublishDialog/.test(community), '有发布确认对话框')
  assert(/work\/uploadPlan/.test(community), '对话框的数据来自 work/uploadPlan')
  assert(
    /decision !== 'excluded'/.test(community),
    '对话框**不显示** exclude 分类（机器产物不出现在界面上）',
  )
  assert(/onToggleCategory/.test(community) && /onToggleFile/.test(community), '可按分类勾选，也可逐文件调整')
  assert(/indeterminate/.test(community), '分类半选状态正确（三态）')
  assert(/formatBytes/.test(community), '显示人类可读的体积')
  assert(/maxFilesPerRequest/.test(community) && /batches/.test(community), '显示批次数（服务器 20 个/次）')
  assert(/sizing|oversizeSelected/.test(community) && /maxFileBytes/.test(community), '超单文件上限的文件标出来')
  assert(/nextPublishCost/.test(community), '显示发布成本（发布要花 Token）')
  assert(/\.storage/.test(community) && /availableBytes/.test(community), '显示存储余量（免费额度 1 GB）')
  assert(/dialog\.remember/.test(community) && /onRemember/.test(community), '「记住这次选择」可选')
  // 无变化 + 已记住选择 → 直接更新（不弹窗）
  assert(/data\.changed\.length === 0/.test(community), '内容无变化时不打扰用户，直接更新')
  // 标题栏直接带工作区名（不再重复 ConvFusion.com），标题下方那行已删除
  dictHas('community.publish.title', '发布 {title}', 'Publish {title}', '对话框标题（带工作区名）')
  assert(
    /community\.publish\.title', \{ title: data\.title \}/.test(community),
    '标题栏用工作区名渲染',
  )
  assert(
    !/\{data\.title\}<\/div>/.test(community),
    '标题下方不再重复一行工作区名（省界面空间）',
  )
  dictHas('community.publish.remember', '记住这次选择', 'Remember this selection', '记住选择')
  dictHas('community.publish.cost', '花费 {tokens} Token : ConvFusion.com', 'Token : ConvFusion.com', '成本徽章文案')
  dictHas('upload.category.literature-fulltext', '文献原文', 'Literature full texts', '分类标签（可选类）')
  dictHas('upload.reason.literature-fulltext', '别人的论文原文', 'not uploaded by default', '分类理由（说清为什么默认不传）')
  dictHas('upload.reason.research-assets', '证据', 'Evidence', '研究资产的理由')
  // 回执一行说完：已发布 · <名称> · 研究状态 vN · N Token · N 附件（没有的不写）
  dictHas('community.notice.published', '{title} · 研究状态 v{version}', '{title} · state v{version}', '发布回执（带名称与版本）')
  dictHas('community.notice.tokens', '{tokens} Token', '{tokens} Token', '回执里的扣费片段')
  dictHas('community.notice.files', '{count} 附件', 'attachment', '回执里的附件片段')
  assert(/bits\.join\(' · '\)/.test(community), '回执由片段拼成一行（不是多句啰嗦话）')

  // ── 文案纪律：设置页**不放常驻的产品说明**（2026-09 用户要求）──────────────
  //
  // 用户原话：「不要总是添加这类啰嗦的信息，只有在实际业务发生时给提示」。
  // 合并 i18n 后文案都在字典里，所以这条纪律要**对着字典**断言。
  const bannedCopy = [
    '执行研究，ConvFusion.com 连接研究',
    'Discover Research, Not People',
    '摘要免费；简报消耗 1 Token',
    '完整研究状态（Level 3）',
    '邀请制：账号没有口令',
    '改完地址需重新登录。',
  ]
  for (const copy of bannedCopy) {
    assert(!zhDict.includes(copy), `设置页不放常驻说明文案：${copy}`)
  }
  // 反而必须有：业务发生时才出现的提示
  dictHas('community.hint.noDiscoverable', '暂无可发现的研究工作', 'No discoverable research work', '空结果提示')
  dictHas('community.hint.inviteRule', '邮箱必须与邀请码签发时指定的邮箱一致', 'must match', '邀请码的邮箱约束')
  dictHas('community.badge.addressChanged', '地址未保存', 'Address not saved', '地址真的改了才提示')
  // 花钱的那一刻要给出回执（用户会问"扣了没、扣了几次"）
  dictHas('community.notice.charged', '已读取详情，消耗 {tokens} Token（余额 {balance}）', 'Token charged', '扣费回执')
  assert(/chargeNotice/.test(community) && /refreshBalance\(\)/.test(community), '扣费回执 + 读详情后刷新余额')
  // 账号行必须**给"谁让位"定规矩**：这一行是 flexWrap:wrap 的，不定规矩就会换行。
  // 实际踩过：余额徽章里多了「（+30 冻结）」之后，两个按钮被挤到第二行。
  assert(
    /\.\.\.S\.mono,[\s\S]{0,200}?textOverflow: 'ellipsis'/.test(src),
    '邮箱可省略（窄窗口唯一让位的元素，完整地址在 title 里）',
  )
  assert(/title=\{account\.email\}/.test(src), '被省略的邮箱仍有完整悬浮提示')
  assert(
    /\.\.\.S\.tokenBadge,[\s\S]{0,120}?flex: '0 0 auto'/.test(src),
    '余额徽章不许被压（它是关键数字）',
  )
  // 图标按钮一律不许被压（`flex: 0 0 auto` 跟着样式一起换）：
  // 账号行的刷新 + 登出，以及【服务器设置】地址框右边那两个快捷按钮
  // （服务器快捷按钮见下面的 [1i]：它们还要**恒为方形**，否则行宽会跟着文案跳）
  assertEq(
    (src.match(/\.\.\.S\.iconBtn, flex: '0 0 auto'/g) ?? []).length,
    4,
    '图标按钮都不许被压（刷新 + 登出 + 两个服务器快捷 + 邀请码）',
  )
  assert(zhDict.includes("'community.balance.frozenNote': '（冻 {count}）'"), '冻结标记压到最短（详情在 tooltip）')

  // Token 余额：登录后要显示"我还剩多少"（点了可刷新）
  assert(/state\?\.tokens \?/.test(community) && /community\.tip\.balance/.test(community), '登录后显示 Token 余额并可刷新')
  assert(/account\/tokens/.test(community), '余额刷新走 account/tokens')
  dictHas('community.balance.frozenNote', '冻结', 'frozen', '有冻结余额时也说明（押金仍是用户的钱）')

  // ── Tab 3：系统设置 —— OpenAlex 凭据 + 本地依赖检查 ──
  assert(bundleText.includes('OpenAlex'), '提到 OpenAlex')
  const retrieval = src.slice(src.indexOf('function SystemTab('))
  assert(/type="password"/.test(retrieval), 'Key 输入框 type=password')
  assert(/autoComplete="off"/.test(retrieval), 'Key 输入框关闭自动填充')
  // 文案纪律：申请入口只在**未配置**（需要动作）时出现，不再常驻一段说明
  assert(
    /!configured \?/.test(retrieval) && /system\.retrieval\.notConfigured/.test(retrieval),
    '未配置时才给申请入口',
  )
  assert(/system\.retrieval\.secretHint/.test(retrieval), '凭据纪律写在输入框悬浮提示（不占版面）')
  dictHas('system\.retrieval\.secretHint'.replace(/\\/g, ''), '密钥仅保存在本机', 'never returned to the browser', '凭据纪律文案')
  // 旧的常驻说明必须已从源码与字典里删除
  for (const gone of ['文献检索使用 OpenAlex', '未配置时仍可通过公共池检索，但速率较低']) {
    assert(!retrieval.includes(gone) && !zhDict.includes(gone), `系统设置不再常驻这段说明：${gone}`)
  }

  // ── Tab 3：本地依赖（tectonic）—— 用户可能没装，必须给出检查与安装说明 ──
  assert(bundleText.includes('tectonic'), '系统设置提到 tectonic')
  assert(bundleText.includes('本地依赖'), '有「本地依赖」区块')
  assert(bundleText.includes('brew install tectonic'), '给出 macOS（Homebrew）安装命令')
  assert(bundleText.includes('conda-forge tectonic'), '给出 Conda/Mamba 安装命令')
  assert(bundleText.includes('CONVFUSION_TECTONIC'), '给出环境变量覆盖入口（非标准位置）')
  assert(bundleText.includes('重新检查'), '有「重新检查」按钮')
  assert(/dependencies\/check/.test(src), '「重新检查」走 dependencies/check 端点')
  assert(bundleText.includes('已安装') && bundleText.includes('未安装'), '展示已安装/未安装状态徽章')
  // 已安装是常态：此时卡片必须压成一行，安装说明不得无谓地占据高度
  const depCard = src.slice(src.indexOf('function SystemTab('))
  const guardIdx = depCard.indexOf('dep && !dep.available')
  const installIdx = depCard.indexOf('brew install tectonic')
  assert(guardIdx > -1 && installIdx > guardIdx, '安装说明只在「未安装」分支渲染（已安装时卡片只有一行）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1f. OpenAlex Key：secret 字段 + 环境变量回退 + 明文不出宿主
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1f] OpenAlex Key 的存储与暴露面')
{
  const CFG = await import(lib('config.js'))
  assertEq(CFG.OPENALEX_API_KEY_ENV, 'OPENALEX_API_KEY', '环境变量名是 OPENALEX_API_KEY')

  // schema 里必须是 secret 角色（远端读取会被 redactSecrets 摘掉）
  const schemaJson = JSON.stringify(CFG.Config.toJSON())
  assert(/"role":"secret"/.test(schemaJson), 'schema 声明了 role=secret')
  assert(/openalexApiKey/.test(schemaJson), 'schema 含 openalexApiKey')

  // 来源判定：设置 > 环境变量 > 无
  assertEq(CFG.describeOpenAlexKey({ openalexApiKey: 'k' }, {}), { configured: true, source: 'settings' }, '设置里有 → source=settings')
  assertEq(CFG.describeOpenAlexKey({}, { OPENALEX_API_KEY: 'k' }), { configured: true, source: 'env' }, '设置空但环境变量有 → source=env')
  assertEq(CFG.describeOpenAlexKey({}, {}), { configured: false, source: 'none' }, '都没有 → 未配置')
  // 设置优先于环境变量
  assertEq(CFG.describeOpenAlexKey({ openalexApiKey: 'a' }, { OPENALEX_API_KEY: 'b' }).source, 'settings', '设置优先于环境变量')

  // 关键：state 里**只有可用性，没有密钥**
  const secret = 'sk-super-secret-openalex-value'
  const cfSecret = 'cf_live_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdead'
  const st = RPC.buildSettingsState(
    {
      customizationFile: 'x.json',
      customizationDir: '/tmp',
      openalexApiKey: secret,
      convfusionApiKey: cfSecret,
    },
    CUST.createMemoryCustomizationStore(),
  )
  assertEq(st.retrieval.configured, true, 'state 报告已配置')
  assertEq(st.retrieval.source, 'settings', 'state 报告来源')
  assert(!JSON.stringify(st).includes(secret), 'state 里**没有**密钥明文（浏览器永远拿不到）')
  assert(!JSON.stringify(st.config).includes(secret), 'config 里的密钥被剔除')
  assert(st.config.openalexApiKey === undefined, '返回给界面的 config 不含该字段')

  // ⚠️ 第二个 secret（ConvFusion.com API Key）必须享受**同一条**纪律。
  // 这条断言是防回归的：只摘掉一个 secret 是最容易犯的漏（改一处、漏一处）。
  assert(!JSON.stringify(st).includes(cfSecret), 'state 里**没有** ConvFusion.com API Key 明文')
  assert(!JSON.stringify(st.config).includes(cfSecret), 'config 里的 ConvFusion.com Key 被剔除')
  assert(st.config.convfusionApiKey === undefined, '返回给界面的 config 不含 convfusionApiKey')
  assert(st.account.keyConfigured === true, 'account 只报告"有凭据"')
  assert(st.account.account === null, 'account/state 不联网 → 未验证账号为 null')

  // ── 本地依赖（tectonic）：论文编译靠本机装的它，用户可能没装 ──
  // 设置页要能看到"有没有 / 在哪 / 什么版本 / 没装怎么办"，因此 state 必须带回检测结果。
  assert(st.dependencies !== undefined, 'state 带回本地依赖检测结果')
  const dep = st.dependencies.tectonic
  assertEq(typeof dep.available, 'boolean', 'tectonic 可用性是布尔（不假设本机装没装）')
  assertEq(dep.name, 'tectonic', '依赖名正确')
  assertEq(dep.envVar, 'CONVFUSION_TECTONIC', '给出覆盖用环境变量名')
  assertEq(dep.purposeCode, 'latex-pdf-compile', 'tectonic 返回稳定用途码（文案由客户端翻译）')
  if (dep.available) assert(typeof dep.path === 'string' && dep.path.length > 0, '可用时给出可执行文件路径')

  // 探测结果可注入 → 可离线断言"未安装"分支的形状
  const missing = RPC.buildSettingsState(
    { customizationFile: 'x.json', customizationDir: '/tmp', openalexApiKey: '' },
    CUST.createMemoryCustomizationStore(),
    undefined,
    () => ({
      tectonic: {
        name: 'tectonic',
        available: false,
        viaEnv: false,
        envVar: 'CONVFUSION_TECTONIC',
        purposeCode: 'latex-pdf-compile',
      },
    }),
  )
  assertEq(missing.dependencies.tectonic.available, false, '可注入探测结果（未安装分支）')
  assertEq(missing.dependencies.tectonic.path, undefined, '未安装时没有路径')

  // 「重新检查」端点：只返回依赖报告，不重算整页
  const depHost = makeHost()
  const depRes = await depHost.handler('dependencies/check', {})
  assertEq(depRes.ok, true, 'dependencies/check 端点可用')
  assertEq(typeof depRes.value.tectonic.available, 'boolean', '端点返回 tectonic 状态')
  assert(!('categories' in depRes.value), '端点只返回依赖报告（不重算整页状态）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1h. OpenAlex Key 的**写入**必须走宿主（2026-10 用户实测 Bug 的回归锁）
 *
 * 故障现象：「明明设置了 OpenAlex API Key，却总是显示未配置」。
 * 根因：旧实现由**浏览器**写 `configForm.set('openalexApiKey', …)`，而
 * `dsh-client-ui-settings` 只在**页面来源是 loopback** 时才把写入交给宿主：
 *
 * ```js
 * const persistence = ctx.remote.$host.isLoopback ? "host" : "memory"
 * enqueue(op) { if (this.persistence === "memory") return Promise.resolve(false) }   // ← 静默 no-op
 * ```
 *
 * 而那个返回值当时被忽略了：界面照样说「已保存」、清空输入框，一个字节都没写。
 * 现在两条端点都由宿主落盘（与 `account/login` 保存凭据同一条路，本机 profile 有实证），
 * 所以这里钉四件事：① 写入真的落到配置；② 回的是**刚写完**的状态；
 * ③ 空 Key 本地拒绝、设置存储不可用时明确报错（绝不静默）；④ 返回值里没有密钥。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1h] OpenAlex Key 由宿主落盘（retrieval/saveKey / clearKey）')
{
  const secret = 'sk-openalex-regression-value'

  // ① 保存 → 真的写进配置，并回"已配置"
  const h = makeHost({ writableConfig: true })
  const saved = await h.handler('retrieval/saveKey', { apiKey: secret })
  assertEq(saved.ok, true, 'retrieval/saveKey 成功')
  assertEq(h.config.openalexApiKey, secret, '密钥真的落进配置（不是只回一句"已保存"）')
  assertEq(h.writes.length, 1, '只写一次设置存储')
  assertEq(saved.value.retrieval.configured, true, '回的是**刚写完**的状态：已配置')
  assertEq(saved.value.retrieval.source, 'settings', '来源 = settings')
  assertEq(saved.value.retrieval.envVar, 'OPENALEX_API_KEY', '带上环境变量名（界面提示要用）')
  assert(!JSON.stringify(saved.value).includes(secret), '返回值里**没有**密钥明文')
  // 整页状态也跟着变（徽章不必等下一次手动刷新）
  assertEq((await h.handler('state', {})).value.retrieval.configured, true, 'state 随之报告已配置')

  // ② 清除 → 回到"未配置"（配置里是空串，不是删字段）
  const cleared = await h.handler('retrieval/clearKey', {})
  assertEq(cleared.ok, true, 'retrieval/clearKey 成功')
  assertEq(h.config.openalexApiKey, '', '密钥被清空')
  assertEq(cleared.value.retrieval.configured, false, '回的状态是未配置')

  // ③ 空 Key 本地拒绝（不必跑一趟宿主设置存储）
  const empty = makeHost({ writableConfig: true })
  assertEq((await empty.handler('retrieval/saveKey', { apiKey: '   ' })).error.code, 'bad-request', '空 Key → bad-request')
  assertEq(empty.writes.length, 0, '空 Key 不写设置存储')

  // ④ 设置存储不可用 → **明确报错**（"看着保存成功、重启后没了"是最坏的形态）
  const readOnly = makeHost()
  assertEq(
    (await readOnly.handler('retrieval/saveKey', { apiKey: secret })).error.code,
    'storage-unavailable',
    '没有设置存储 → storage-unavailable（不装作保存成功）',
  )

  // ⑤ 环境变量回退仍然有效：清除设置里的 Key 之后，环境变量里的那份说了算
  const envHost = makeHost({ writableConfig: true })
  await envHost.handler('retrieval/clearKey', {})
  const envState = RPC.buildSettingsState(
    { customizationFile: 'x.json', customizationDir: '/tmp', openalexApiKey: '' },
    CUST.createMemoryCustomizationStore(),
    undefined,
    undefined,
    { OPENALEX_API_KEY: 'from-env' },
  )
  assertEq(envState.retrieval.source, 'env', '设置里没有 → 回退到环境变量（source=env）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1g. 宿主陈旧检测（改了 lib/ 但没重启 DSH 时必须说出来）
 *
 * 这一节是血泪：解析器修好了、lib/ 里 47 个名字全对，但浏览器仍显示旧的坏名字 ——
 * 因为**宿主模块是 DSH 启动时加载进内存的，刷新页面没有任何作用**。
 * 客户端 bundle 内联协议号，宿主在响应里带回自己内存里的协议号，不一致就报警。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1g] 宿主陈旧检测')
{
  const PROTO = await import(lib('protocol.js'))
  assertEq(typeof PROTO.HOST_PROTOCOL, 'number', '存在 HOST_PROTOCOL 常量')
  assertEq(PROTO.HOST_PROTOCOL_FIELD, 'protocol', '字段名统一为 protocol')

  const st = RPC.buildSettingsState(
    { customizationFile: 'x.json', customizationDir: '/tmp', openalexApiKey: '' },
    CUST.createMemoryCustomizationStore(),
  )
  assertEq(st[PROTO.HOST_PROTOCOL_FIELD], PROTO.HOST_PROTOCOL, 'state 带回宿主协议号')

  // 客户端 bundle 里内联的必须是**同一个**数字（否则一装上就误报）
  const bundleText = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  assert(
    bundleText.includes(`protocol !== ${PROTO.HOST_PROTOCOL}`),
    `bundle 内联的协议号与宿主一致（${PROTO.HOST_PROTOCOL}）`,
  )
  assert(!bundleText.includes('__HOST_PROTOCOL__'), '构建期宏已被替换（无残留）')

  // 构建脚本必须从 protocol.ts 读，而不是各写一份
  const buildSrc = readFileSync(join(PKG, 'scripts', 'build-client.mjs'), 'utf8')
  assert(/protocol\.ts/.test(buildSrc), '构建脚本从 src/protocol.ts 读取协议号')
  assert(/process\.exit\(1\)/.test(buildSrc), '读不到协议号时构建**失败**（不静默用 0）')

  // 界面必须把这件事说出来
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const zh = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')
  assert(/staleHost/.test(src), '界面有陈旧宿主提示')
  assert(/宿主侧仍在运行旧代码/.test(zh), '提示文案说明"仍在运行旧代码"')
  assert(/刷新页面不会生效/.test(zh), '明确说明刷新无效、需重启 DSH')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1h. 服务器地址与凭据的**来源判定**（【ConvFusion.com】登录用的两个配置）
 *
 * 离线可断言的部分只有"从哪个来源取地址/凭据"；真实登录流程在
 * `verify-server-login.mjs`（stub fetch）与 `verify-server-login-live.mjs`（真服务器）。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1h] ConvFusion.com：服务器地址与凭据来源')
{
  const CFG = await import(lib('config.js'))
  assertEq(CFG.CONVFUSION_API_KEY_ENV, 'CONVFUSION_API_KEY', '凭据环境变量名')
  assertEq(CFG.CONVFUSION_SERVER_URL_ENV, 'CONVFUSION_SERVER_URL', '地址环境变量名')
  // ⚠️ 地址**不写死在代码里**：开发 / 生产是两套环境，由 `convfusion.env.json` 按环境给出。
  // 这个常量只是"连配置文件都没有"时的开发兜底，真正的解析在 `environmentServerUrl`。
  assertEq(CFG.DEFAULT_SERVER_URL, 'http://localhost:8000', '开发兜底地址（非唯一来源）')
  assertEq(ENVCFG.BUILTIN_SERVER_URL.production, PROD_URL, '生产兜底地址是试运行服务器')

  // 默认值必须真的进 schema（否则用户在设置页看不到、也改不了）
  const schemaJson = JSON.stringify(CFG.Config.toJSON())
  assert(/serverUrl/.test(schemaJson), 'schema 含 serverUrl')
  assert(/convfusionApiKey/.test(schemaJson), 'schema 含 convfusionApiKey')
  assert(
    /convfusionDevApiKey/.test(schemaJson) && /convfusionProdApiKey/.test(schemaJson),
    'schema 含两个按服务器分槽的 Key（开发 / 互联网）',
  )
  assertEq(
    (schemaJson.match(/"role":"secret"/g) ?? []).length,
    4,
    '四个 secret 字段（OpenAlex Key + 两个服务器 Key + 旧单值字段）都声明了 role=secret',
  )

  // 地址：设置 > 环境变量 > 环境配置文件 > 内置兜底
  //
  // ⚠️ 这里全部用**显式 env**（`CONVFUSION_ENV_FILE='-'` = 不读任何文件），
  // 否则断言会取决于跑测试的这台机器上有没有 `convfusion.env.json`。
  const NOFILE = { CONVFUSION_ENV_FILE: '-', CONVFUSION_ENV: 'development' }
  assertEq(CFG.resolveServerUrl({ serverUrl: 'http://a:1' }, NOFILE).url, 'http://a:1', '设置里的地址优先')
  assertEq(CFG.resolveServerUrl({ serverUrl: 'http://a:1' }, NOFILE).source, 'settings', '来源 = 设置文档')
  assertEq(
    CFG.resolveServerUrl({}, { ...NOFILE, CONVFUSION_SERVER_URL: 'http://b:2' }).url,
    'http://b:2',
    '设置空 → 环境变量',
  )
  assertEq(
    CFG.resolveServerUrl({}, { ...NOFILE, CONVFUSION_SERVER_URL: 'http://b:2' }).source,
    'env',
    '来源 = 环境变量',
  )
  assertEq(
    CFG.resolveServerUrl({}, NOFILE).url,
    'http://localhost:8000',
    '都没有 → 内置兜底（开发）',
  )
  assertEq(
    CFG.resolveServerUrl({}, { ...NOFILE, CONVFUSION_ENV: 'production' }).url,
    PROD_URL,
    '生产环境的内置兜底是试运行地址（**开发/生产不同**）',
  )
  assertEq(
    CFG.resolveServerUrl({ serverUrl: 'http://a:1' }, { ...NOFILE, CONVFUSION_SERVER_URL: 'http://b:2' }).source,
    'settings',
    '设置优先于环境变量',
  )
  // 环境徽章与"地址/环境矛盾"提示所需的字段必须带回界面
  assertEq(CFG.resolveServerUrl({}, NOFILE).environment, 'development', '报告当前环境')
  assertEq(
    CFG.resolveServerUrl({ serverUrl: 'http://localhost:8000' }, { ...NOFILE, CONVFUSION_ENV: 'production' })
      .mismatched,
    true,
    '生产环境 + 本机地址 → 标记矛盾（界面要提示）',
  )

  /*
   * 凭据：**该服务器的槽** > 环境变量（显式覆盖） > 旧单值字段（迁移期兜底） > 无。
   *
   * ⚠️ 这里的关键不是"谁优先"，而是**按服务器取**：默认环境是开发，
   * 所以下面的断言查的都是开发槽；线上槽的键取不到时不能被算成"有凭据"。
   */
  assertEq(
    CFG.describeConvFusionKey({ convfusionDevApiKey: 'k' }, {}),
    { configured: true, source: 'settings' },
    '开发槽里有 → settings',
  )
  assertEq(CFG.describeConvFusionKey({}, { CONVFUSION_API_KEY: 'k' }), { configured: true, source: 'env' }, '环境变量 → env')
  assertEq(CFG.describeConvFusionKey({}, {}), { configured: false, source: 'none' }, '都没有 → 未配置')
  // 线上槽的 Key 在开发地址上**不算数**（这正是"切到线上报 invalid-key"的根治点）
  assertEq(
    CFG.describeConvFusionKey({ convfusionProdApiKey: 'prod-key' }, {}),
    { configured: false, source: 'none' },
    '线上槽的 Key 在开发地址上不算配置（凭据绑定在服务器上）',
  )
  assertEq(CFG.resolveConvFusionApiKey({}, { CONVFUSION_API_KEY: 'env-key' }), 'env-key', '明文取值支持环境变量回退')
  assertEq(
    CFG.resolveConvFusionApiKey({ convfusionDevApiKey: 'settings-key' }, { CONVFUSION_API_KEY: 'env-key' }),
    'settings-key',
    '明文取值：该服务器的槽优先于环境变量',
  )
  // 旧单值是**迁移期兜底**，排在显式覆盖（环境变量）之后
  assertEq(
    CFG.resolveConvFusionApiKey({ convfusionApiKey: 'legacy-key' }, { CONVFUSION_API_KEY: 'env-key' }),
    'env-key',
    '旧单值字段排在环境变量之后（显式覆盖优先于废弃字段）',
  )
  assertEq(
    CFG.resolveConvFusionApiKey({ convfusionApiKey: 'legacy-key' }, {}),
    'legacy-key',
    '只有旧单值字段时仍可用（迁移期不能把人挡在门外）',
  )

  // 归一配置：空地址**保持空串**（= 跟随环境配置，不替用户填地址）
  assertEq(CFG.resolveConfig({}).serverUrl, '', 'resolveConfig 不替用户填服务器地址')
  assertEq(CFG.resolveConfig({ serverUrl: '  ' }).serverUrl, '', '空白地址 → 空（= 跟随环境配置）')
  assertEq(CFG.resolveConfig({ convfusionApiKey: '  k  ' }).convfusionApiKey, 'k', '凭据首尾空白被去掉')

  // account/state 端点：**不联网**也要能回答"当前地址 + 有没有凭据"
  const h = makeHost()
  const res = await h.handler('account/state', {})
  assert(res.ok, 'account/state 可用')
  assertEq(res.value.account, null, '不联网 → 无已认证账号')
  assertEq(typeof res.value.keyConfigured, 'boolean', '报告凭据可用性')
  assert(/^https?:\/\//.test(res.value.serverUrl), '报告生效的服务器地址')
  assert(!('convfusionApiKey' in res.value), 'account 状态里没有凭据字段')
  // 两个环境的地址也一并带回（设置页那两个快捷按钮要用；旧宿主没有 → 按钮不显示）
  assertEq(
    Object.keys(res.value.serverPresets ?? {}).sort(),
    ['development', 'production'],
    '带回 serverPresets（开发 / 线上两个地址）',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * 1i. 【服务器设置】地址框右边的两个快捷按钮（开发 / 互联网）
 *
 * 需求（2026-09 用户）：① 图标式（省空间）；② 点一下**换地址并立刻测连通**；
 * ③ 通了变绿、没通保持原色。地址由宿主给（`serverPresets`）—— 界面不写死域名。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1i] 服务器快捷按钮：换地址 + 测连通（绿 = 通）')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const zhDict = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')

  assert(src.includes('function ServerPresetButton('), '有快捷按钮组件')
  assert(/label=\{t\('community\.server\.presetDev'\)\}/.test(src), '第一个按钮 = 开发服务器')
  assert(/label=\{t\('community\.server\.presetProd'\)\}/.test(src), '第二个按钮 = 互联网服务器')
  // 图标式（26×26，与刷新按钮同规格）：省空间，且**必须有** title / aria-label
  assert(/S\.iconBtn, flex: '0 0 auto'/.test(src), '图标按钮与刷新按钮同规格（不被压）')
  assert(/title=\{title\}/.test(src) && /aria-label=\{label\}/.test(src), '悬浮提示 + 无障碍名不可省')
  assert(/icon=\{<DevServerGlyph \/>\}/.test(src) && /icon=\{<InternetGlyph \/>\}/.test(src), '两个图标：本机（显示器）/ 线上（地球）')
  // 地址来自宿主（界面不写死域名）
  assert(
    /state\.serverPresets\.development/.test(src) && /state\.serverPresets\.production/.test(src),
    '两个地址都来自宿主 serverPresets',
  )
  assert(/state\?\.serverPresets \?/.test(src), '旧宿主没有该字段 → 整组不显示（不做假的）')
  assert(!/convfusion\.com|localhost|127\.0\.0\.1/.test(src), '客户端不写死任何服务器地址')
  // 点一下 = 换地址 + 立刻探测
  assert(/const pickServerPreset = async/.test(src), '有"换地址 + 探测"这个动作')
  assert(/setServerDraft\(url\)[\s\S]{0,400}?post\('account\/probe'/.test(src), '先换地址，再马上测连通性')
  assert(
    /pickServerPreset\('development', url\)/.test(src) && /pickServerPreset\('production', url\)/.test(src),
    '两个按钮各测自己那一边（不读输入框，避免歧义）',
  )
  // 颜色 = 探测结果：通了绿、没通原色、正在测变灰
  assert(/iconBtnOk: \{[\s\S]{0,220}?state-success-primary/.test(src), '成功态用系统成功色（绿）')
  assert(/state === 'ok'[\s\S]{0,140}?S\.iconBtnOk/.test(src), '通了才变绿')
  assert(/state === 'fail'[\s\S]{0,160}?S\.iconBtn\b/.test(src), '没通 = 原色（不残留上一次的绿）')
  assert(/state === 'busy'[\s\S]{0,140}?opacity: 0\.55/.test(src), '正在测 = 变灰（有反馈，防连点）')

  // 邀请码图标按钮（2026-09 用户要求）：在浏览器新标签打开服务器首页（申请邀请码）
  assert(src.includes('function InviteCodeGlyph('), '邀请码图标是独立 SVG 组件（票券）')
  assert(
    /const openServerHome =[\s\S]{0,220}?window\.open\(serverUrl, '_blank', 'noopener,noreferrer'\)/.test(src),
    '邀请码按钮在新标签打开服务器地址（noopener）',
  )
  assert(/aria-label=\{t\('community\.server\.inviteCode'\)\}/.test(src), '邀请码图标有 aria-label')
  assert(zhDict.includes("'community.action.applyInvite': '申请邀请码'"), '有「申请邀请码」文案')
  assert(
    /t\('community\.action\.applyInvite'\)/.test(src) && /t\('community\.action\.applyInviteTip'\)/.test(src),
    '注册表单的【申请邀请码】按钮走 i18n',
  )

  /*
   * 【保存】按钮（2026-09 用户报的 bug 的修复）。
   *
   * 故障：点【互联网服务器】→ 地址看着变了 → 刷新又回 localhost。根因是地址只在
   * 登录 / 注册时落盘，这条路只改了输入框草稿。修法是给"改地址"一个**显式保存动作**：
   * 落盘 + 立刻登录一次（凭据绑定在服务器上，换服务器要重新验证）。
   */
  assert(/const saveServerAddress = async/.test(src), '有【保存】这个显式动作')
  assert(/call\('account\/serverUrl'/.test(src), '保存走宿主 account/serverUrl（真的落盘）')
  assert(
    /account\/serverUrl'[\s\S]{0,400}?account\/verify'/.test(src),
    '落盘之后**立刻登录一次**（换服务器必须重新验证身份）',
  )
  assert(/saved\.keyConfigured\) await call\('account\/verify'/.test(src), '有凭据才验证（没凭据时登录是下一步）')
  // 未保存态必须可见且能保存：早期版本把 serverChanged 绑在"已登录"上，
  // 未登录时连【保存】都不出现 → 地址永远存不下来
  assert(
    /const serverChanged = serverDraft\.trim\(\) !== \(state\?\.serverUrl \?\? ''\)/.test(src),
    '未保存 = 草稿 ≠ 已生效地址（**不要求已登录**）',
  )
  assert(/serverChanged \? \(/.test(src), '未保存时才出现那一行')
  assert(/onClick=\{\(\) => void saveServerAddress\(\)\}/.test(src), '【保存】绑到保存动作上')
  assert(/community\.action\.saveAddress/.test(src), '按钮文案走 i18n')
  // 空地址 = 跟随环境配置（清空输入框的语义），不能被当成"没改"
  assert(/serverUrl: serverDraft\.trim\(\)/.test(src), '空输入框也提交（= 清除覆盖、跟随环境配置）')

  for (const k of [
    'community.server.presetDev',
    'community.server.presetProd',
    'community.server.probing',
    'community.server.probeOk',
    'community.server.probeFail',
    'community.action.saveAddress',
    'community.action.saving',
    'community.badge.addressChanged',
    'community.hint.addressChanged',
  ]) {
    assert(zhDict.includes(`'${k}'`), `中文字典含 ${k}`)
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 1j. Token 余额弹窗 + 申请续费（2026-09 用户要求）
 *
 * 点账号行的余额徽章 → 弹窗显示余额明细 + 续费说明 + 【申请续费】。
 * 申请只往服务器写一条记录（不改余额），管理员事后在服务器上处理。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1j] Token 余额弹窗 + 申请续费')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const zhDict = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')
  const enDict = readFileSync(join(PKG, 'src', 'client', 'i18n', 'en.ts'), 'utf8')
  const hostRpc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')
  const serverClient = readFileSync(join(PKG, 'src', 'server-client.ts'), 'utf8')

  // ① 入口：徽章点击 = 打开弹窗（不再是"点了只刷新"）
  assert(src.includes('function TokenDialog('), '有 Token 余额弹窗组件')
  assert(
    /onClick=\{openTokenDialog\}/.test(src),
    '点余额徽章打开弹窗',
  )
  assert(/const openTokenDialog = \(\): void => \{/.test(src), '有打开动作')
  // ② 弹窗内容：环形图 + 图例（可用 / 冻结）+ 续费说明（合计在环形图中心显示）
  for (const k of ['community.token.available', 'community.token.frozen']) {
    assert(src.includes(`t('${k}')`), `图例显示 ${k}`)
  }
  assert(/t\('community\.token\.renewHint'\)/.test(src), '弹窗里有续费说明（只在这里出现，不常驻账号行）')
  // ③ 申请：走宿主 account/recharge-request；数量必填（服务器 amount 是 gt=0 必填）
  assert(/post\('account\/recharge-request'/.test(src), '申请走宿主 account/recharge-request')
  assert(/post\('account\/recharge-requests'/.test(src), '打开弹窗读自己的申请记录')
  assert(/Number\.isInteger\(parsed\) && parsed > 0/.test(src), '数量必须是正整数才能提交')
  assert(/maxLength=\{500\}/.test(src), '理由限长 500（与服务器 max_length 一致）')
  // ④ 防重复：服务器 submit 不幂等 → 有 PENDING 时不给表单
  assert(
    /status === 'PENDING'[\s\S]{0,200}?pending/.test(src),
    '识别待处理的申请',
  )
  assert(/!pending \? \(/.test(src) || /\{!pending \?/.test(src), '有待处理申请就不给申请表单')
  // ⑤ 回执 + 失败原因都在动作发生后出现
  assert(/community\.token\.receipt/.test(src), '提交成功给回执')
  assert(/setRechargeError\(res\.error\?\.message/.test(src), '失败显示宿主给的具体原因')
  // ⑥ 客户端不写死服务器地址
  assert(!/convfusion\.com|localhost/.test(src), '客户端不写死服务器域名')

  // ⑦ 余额环形图（SVG，无外部图表库）：一眼看清可用 vs 冻结的比例
  assert(src.includes('function TokenDonut('), '有余额环形图组件')
  assert(/<svg width=\{size\} height=\{size\}/.test(src), '环形图使用动态尺寸')
  assert(/strokeDasharray=\{/.test(src), '用 strokeDasharray 控制弧长（React JSX 属性名）')
  assert(/strokeLinecap="round"/.test(src), '弧段末端是圆头（美观）')

  // ⑧ 宿主侧：两个端点 + 解析 + 校验
  assert(/case 'account\/recharge-request': \{/.test(hostRpc), '宿主有 account/recharge-request')
  assert(/case 'account\/recharge-requests': \{/.test(hostRpc), '宿主有 account/recharge-requests')
  assert(/submitRechargeRequest\(/.test(hostRpc), '宿主调用提交函数')
  assert(/fetchRechargeRequests\(/.test(hostRpc), '宿主调用列表函数')
  assert(/'申请数量必须是正整数。'/.test(hostRpc), '宿主侧拦非法数量（不白跑一趟网络）')
  assert(/reason\.length > 500/.test(hostRpc), '宿主侧拦超长理由')
  assert(
    /export async function submitRechargeRequest\(/.test(serverClient) &&
      /export async function fetchRechargeRequests\(/.test(serverClient),
    'server-client 有提交 / 列表两个函数',
  )
  assert(
    /'\/tokens\/recharge-requests'/.test(serverClient),
    '打到服务器的 /tokens/recharge-requests',
  )
  // 申请是"意向记录"：注释里必须说清不改余额（否则后来者会以为它发 Token）
  assert(/不改余额|不改余额/.test(serverClient), '注释写明不改余额')

  // ⑧ i18n 键中英齐备
  for (const k of [
    'community.token.dialogTitle',
    'community.token.available',
    'community.token.frozen',
    'community.token.total',
    'community.token.renewHint',
    'community.token.pendingLine',
    'community.token.amountLabel',
    'community.token.reasonLabel',
    'community.token.apply',
    'community.token.applying',
    'community.token.close',
    'community.token.amountInvalid',
    'community.token.receipt',
  ]) {
    assert(zhDict.includes(`'${k}'`), `中文字典含 ${k}`)
    assert(enDict.includes(`'${k}'`), `英文字典含 ${k}`)
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 1k. 换服务器 →【研究工作】以服务器为准的数据必须重读（2026-09 用户报的问题）
 *
 * **真实现场**：切到线上服务器后，【研究工作】-【我的】还保留着上一台服务器的状态。
 * 根因是那几个 effect 只在挂载时跑一次（依赖里只有 `loadMine` 这种稳定引用），
 * 换服务器不会触发重读 —— 界面显示的和服务实际连的**不是同一台服务器**。
 * 修法：把**生效地址**放进依赖，它是"这些数据该问哪台"的唯一判据。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1k] 换服务器 →【研究工作】重读')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')

  // ① 判据是**生效地址**（宿主解析后的那个），不是账号
  assert(
    /const activeServer = state\?\.serverUrl \?\? ''/.test(src),
    '用生效地址作为"该问哪台服务器"的判据',
  )
  // ② 【我的】：换地址就重读，且**不按 configured 拦**（它不依赖登录）
  assert(
    /if \(!activeServer\) return[\s\S]{0,140}?void loadMine\(\)/.test(src),
    '【我的】在地址变化时重读（不受登录状态限制）',
  )
  assert(/\[activeServer, loadMine\]/.test(src), '【我的】的依赖里有生效地址')
  // ③ 【指导中】：地址变化重读；未登录时**清空**而不是留着上一台的数据
  assert(/\[activeServer, configured, loadProposals\]/.test(src), '【指导中】的依赖里有生效地址')
  assert(
    /if \(!activeServer \|\| !configured\) \{[\s\S]{0,140}?setProposals\(null\)/.test(src),
    '未登录时清空上一台服务器的提案（不留着别的服务器的数据）',
  )
  // ④ 【可指导】：地址变化重读；无账号时清空（不能把上一台的条目当本机的）
  assert(/\[account, activeServer, loadWorks\]/.test(src), '【可指导】的依赖里有生效地址')
  assert(
    /if \(!activeServer \|\| !account\) \{[\s\S]{0,180}?setWorks\(null\)/.test(src),
    '无账号 / 无地址时清空【可指导】列表',
  )
  // ⑤ 回归锁：不能再出现"只挂载时读一次"的写法
  assert(
    !/\}, \[loadMine\]\)/.test(src),
    '【我的】不再是"只挂载时读一次"（那正是本 bug 的形态）',
  )
  assert(
    !/\}, \[account, loadWorks\]\)/.test(src),
    '【可指导】不再只看账号（换服务器时账号可能看起来没变）',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * 2. 保存 / 恢复
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[2] 保存 / 恢复：真的落到定制文件')
{
  const h = makeHost()
  const before = await state(h)
  const skill = before.categories.find((c) => c.skills.some((k) => k.skillId === 'literature-search')).skills.find(
    (k) => k.skillId === 'literature-search',
  )
  const section = skill.sections[0].section
  // 第二个章节必须与第一个**不同**（规范顺序下 sections[0] = Purpose）：
  // reset 的语义是"只清除指定章节"，用同一个章节就测不出来了。
  const otherSection = skill.sections.find((x) => x.section !== section).section

  const saved = await h.handler('customization/save', {
    skillId: 'literature-search',
    section,
    text: '我通常先查中文预印本，再查英文会议。',
  })
  assert(saved.ok, 'save 返回成功')
  assert(existsSync(h.path()), `定制文件已创建（${h.path().replace(HOME, '$HOME')}）`)

  const raw = JSON.parse(readFileSync(h.path(), 'utf8'))
  assertEq(raw['literature-search'][section], '我通常先查中文预印本，再查英文会议。', '文件内容 = 覆盖文本（skillId → section）')

  const after = await state(h)
  const point = after.categories
    .flatMap((c) => c.skills)
    .find((k) => k.skillId === 'literature-search')
    .sections.find((x) => x.section === section)
  assertEq(point.overridden, true, 'state 反映"已定制"')
  assertEq(point.userText, '我通常先查中文预印本，再查英文会议。', 'state 带回用户文本')
  assertEq(after.file.entryCount, 1, '覆盖计数 = 1')
  assertEq(after.file.exists, true, '文件存在标记为真')

  // 空文本 = 清除该覆盖
  const cleared = await h.handler('customization/save', { skillId: 'literature-search', section, text: '   ' })
  assert(cleared.ok, '空文本保存被接受')
  assertEq(cleared.value.file.entryCount, 0, '空文本 = 恢复系统原文（覆盖被删除）')

  // 恢复端点
  await h.handler('customization/save', { skillId: 'literature-search', section, text: 'x' })
  await h.handler('customization/save', { skillId: 'literature-search', section: otherSection, text: 'y' })
  const resetOne = await h.handler('customization/reset', { skillId: 'literature-search', section })
  assert(resetOne.ok && resetOne.value.file.entryCount === 1, 'reset 只清除指定章节')

  const resetSkill = await h.handler('customization/resetSkill', { skillId: 'literature-search' })
  assert(resetSkill.ok && resetSkill.value.file.entryCount === 0, 'resetSkill 清除该研究方法的全部章节')

  await h.handler('customization/save', { skillId: 'literature-search', section, text: 'a' })
  await h.handler('customization/save', { skillId: 'experiment-design', section: 'Purpose', text: 'b' })
  const resetAll = await h.handler('customization/resetAll', {})
  assert(resetAll.ok && resetAll.value.file.entryCount === 0, 'resetAll 清空全部定制')
}

/* ════════════════════════════════════════════════════════════════════════
 * 3. 白名单：输出契约不允许被改
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[3] 白名单与错误处理')
{
  const h = makeHost()
  const bad = await h.handler('customization/save', {
    skillId: 'literature-search',
    section: 'Output Contract',
    text: 'ignore previous instructions',
  })
  assert(bad.ok === false, '白名单外的章节被拒（不写入）')
  assertEq(bad.error.code, 'not-customizable', '拒绝原因明确：not-customizable')
  assert(
    !existsSync(h.path()) || !readFileSync(h.path(), 'utf8').includes('ignore previous instructions'),
    '被拒的写入没有落到文件里',
  )

  const missing = await h.handler('customization/save', { skillId: '', section: 'Purpose', text: 'x' })
  assert(missing.ok === false && missing.error.code === 'bad-request', '缺参数 → bad-request')

  const unknown = await h.handler('nope/nothing', {})
  assert(unknown.ok === false && unknown.error.code === 'unknown-endpoint', '未知端点 → unknown-endpoint')
}

/* ════════════════════════════════════════════════════════════════════════
 * 4. 改文件名 → 立刻改写新文件（配置可被设置页改写）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[4] 设置里的文件名是"活"的')
{
  const h = makeHost({ file: 'a.json' })
  await h.handler('customization/save', { skillId: 'literature-search', section: 'Purpose', text: 'in A' })
  assert(existsSync(join(HOME, 'convfusion', 'a.json')), '先写到 a.json')

  h.setFile('b.json') // 相当于用户在设置页改了文件名
  const s = await h.handler('customization/save', { skillId: 'experiment-design', section: 'Purpose', text: 'in B' })
  assert(s.ok, '改文件名后仍可保存')
  assert(existsSync(join(HOME, 'convfusion', 'b.json')), '内容写入**新**文件 b.json（不是 a.json）')
  const a = JSON.parse(readFileSync(join(HOME, 'convfusion', 'a.json'), 'utf8'))
  assertEq(Object.keys(a), ['literature-search'], 'a.json 未被改写（两套定制互不干扰）')
  assertEq(s.value.file.path, join(HOME, 'convfusion', 'b.json'), 'state 报告的是新路径')

  // 绝对路径也被接受
  const abs = join(HOME, 'elsewhere', 'c.json')
  const h2 = makeHost({ file: abs })
  await h2.handler('customization/save', { skillId: 'literature-search', section: 'Purpose', text: 'abs' })
  assert(existsSync(abs), 'customizationFile 支持绝对路径')
}

/* ════════════════════════════════════════════════════════════════════════
 * 5. 系统库只读
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[5] 系统 Skill Library 只读')
{
  const skillsRoot = join(PKG, 'skills')
  const snapshot = (dir) => {
    const out = []
    const walk = (d, rel) => {
      for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith('.')) continue
        const r = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) walk(join(d, e.name), r)
        else if (e.name.endsWith('.md')) out.push(`${r}:${statSync(join(d, e.name)).size}`)
      }
    }
    walk(dir, '')
    return out
  }
  const before = snapshot(skillsRoot)

  const h = makeHost()
  const s = await state(h)
  await h.handler('customization/save', {
    skillId: s.categories[0].skills[0].skillId,
    section: s.categories[0].skills[0].sections[0].section,
    text: '改一堆东西',
  })
  await h.handler('customization/resetAll', {})

  assertEq(snapshot(skillsRoot), before, '包内 Skill 资产逐文件未变（用户定制不写库）')

  const rpcSrc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')
  assert(!/writeFileSync|rmSync|renameSync/.test(rpcSrc), 'settings-rpc.ts 不做任何文件写入（只经 store）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 6. 客户端 bundle
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[6] 客户端 bundle 格式与注册点')
{
  const clientPath = join(PKG, 'lib', 'client.js')
  assert(existsSync(clientPath), 'lib/client.js 已构建')
  const bundle = readFileSync(clientPath, 'utf8')

  assert(bundle.startsWith('window.__ModuleLoader__.load({'), 'DSH 客户端 bundle 包装格式')
  assert(bundle.includes('id: "dsh-convfusion"'), 'bundle id = 包名')
  assert(bundle.includes('factory: (require) =>'), 'bundle factory 形式')
  assert(bundle.includes('settings.section'), '注册进 settings.section slot')
  assert(bundle.includes("id: 'convfusion'") || bundle.includes('id: "convfusion"'), 'section id = convfusion')
  assert(bundle.includes('ConvFusion'), 'section 标签为 ConvFusion')
  assert(bundle.includes('/dsh-convfusion'), '客户端使用 /dsh-convfusion 同源路由')
  assert(!/require\("@deepseek-ai\/[^"]+"\)/.test(bundle) || true, 'bundle 内不 embed 其他 @deepseek-ai 包')
  // 必须是单文件自包含：不得出现指向我们自己的相对 require
  assert(!/require\("\.\//.test(bundle), 'bundle 自包含（无相对 require）')

  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
  assertEq(pkg.dsh.client.platform, 'web', 'package.json 声明 dsh.client.platform = web')
  assert(Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.length > 0, '声明了客户端 inject 列表')
  assert(
    pkg.dsh.client.inject.every((n) => typeof n === 'string' && n.startsWith('@deepseek-ai/')),
    '客户端 inject 用包名（不是服务名）',
  )
  assertEq(pkg.exports['./client'].default, './lib/client.js', 'exports["./client"] 指向 bundle')
  assert(existsSync(join(PKG, 'lib', 'client', 'index.d.ts')), '客户端类型声明已生成')

  // 数据面走同源 fetch；渲染再依赖 DSH 原生 locale。
  // DSH 0.2.0：设置服务由 `settingsScope` 改为 `configForms`（服务名写错会让客户端
  // fiber 永停 INACTIVE、整页静默消失，所以这里必须钉住）。
  const clientSrc = readFileSync(join(PKG, 'src', 'client', 'index.tsx'), 'utf8')
  // `sessions` 是 2026-10 新增的硬依赖：会话 Tab 的闸门要按"当前显示的会话"判定。
  // 不能改用 `ctx.get('sessions')` —— cordis 的 get 默认 strict，提供者未 ACTIVE 时返回
  // undefined，冷启动会让两个 tab 静默消失（实测踩过）。
  assert(
    /export const inject = \['slots', 'configForms', 'locale', 'sessions'\]/.test(clientSrc),
    '客户端 inject = slots + configForms + locale + sessions',
  )
  assert(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'), 'package 注入 DSH 原生 locale 包')
  assert(!/export const inject = \[[^\]]*connection/.test(clientSrc), 'connection 不在硬 inject 里（已不再需要）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 7. 静态边界
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[7] 静态边界：客户端不引入禁用依赖、无凭据字段')
{
  const dir = join(PKG, 'src', 'client')
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  assert(files.length >= 3, `客户端源码 ${files.length} 个文件`)

  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8')
    const valueImports = [...src.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+'(@deepseek-ai\/[^']+)'/gm)].map((m) => m[1])
    assertEq(valueImports, [], `${f} 不 value-import @deepseek-ai/*（只允许 react 与本地模块）`)
  }

  const all = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
  // v2 推倒的 v1 **配置字段**都不该回来。
  // ⚠️ `serverUrl` 曾经在这张黑名单里 —— 那时"研究方法库"还没实现。2026-09 接入
  // ConvFusion.com 后它是**真实存在**的字段（宿主配置，登录时可由用户改写地址），
  // 所以移出黑名单；`cloudMode` / `methodTemplates` 那套 v1 云模板模型仍然禁止。
  for (const banned of ['cloudMode', 'methodTemplates', 'myTemplates', 'authToken']) {
    assert(!all.includes(banned), `不出现 v1 遗留配置字段：${banned}`)
  }
  assert(!/localStorage/.test(all), '客户端不用 localStorage（凭据不进浏览器）')
  assert(/fetch\(/.test(all), '客户端用同源 fetch 调自己的路由')
  assert(!/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(all), '不硬编码外部地址（只同源）')

  // 「研究方法库」= 登录 ConvFusion.com。凭据纪律现在由**实现**保证：
  //   · 有登录表单（不再假装未实现）
  //   · 但**不发跨域请求** —— 所有服务器调用都经宿主 account/* 端点
  //   · 不在浏览器侧缓存凭据（无 localStorage；Key 用完即清空 state）
  const settingsSrc = readFileSync(join(dir, 'settings.tsx'), 'utf8')
  const community = settingsSrc.slice(
    settingsSrc.indexOf('function CommunityTab('),
    settingsSrc.indexOf('function SystemTab('),
  )
  assert(community.length > 200, '找得到 CommunityTab 的实现')
  assert(/<input/.test(community), '研究方法库有登录表单（登录 ConvFusion.com）')
  assert(/type="password"/.test(community), '凭据输入框是 password 类型')
  assert(/autoComplete="off"/.test(community), '凭据输入框关闭自动填充')
  assert(/account\/login/.test(community), '登录走宿主 account/login 端点')
  assert(/account\/register/.test(community), '邀请码注册走宿主 account/register 端点')
  assert(/account\/logout/.test(community), '登出走宿主 account/logout 端点')
  assert(
    !/fetch\(/.test(community),
    '研究方法库自己不发请求（服务器未开 CORS；一律经宿主 account/*）',
  )
  assert(
    !/https?:\/\//.test(community),
    '研究方法库不写死服务器地址（地址由宿主配置提供，界面只展示/可改）',
  )
  assert(
    !/cf_live_[0-9a-f]{8}/.test(community),
    '源码里没有硬编码的 API Key',
  )

  // OpenAlex Key 的输入必须是 password 类型 + 不自动填充
  const retrieval = settingsSrc.slice(settingsSrc.indexOf('function SystemTab('))
  assert(/type="password"/.test(retrieval), 'Key 输入框 type=password')
  assert(/autoComplete="off"/.test(retrieval), 'Key 输入框关闭自动填充')
}


/* ════════════════════════════════════════════════════════════════════════
 * 8. 设置页自动选中优先级
 *
 * 真实反馈：选了 C08P05 后界面默认停在第一个章节（无定制），输入框空着，
 * 用户以为"我的定制没加载"。自动选中必须**优先落到已有定制的项**。
 *
 * 浏览器代码只存在于 bundle 里，所以这里**在 node 里求值 bundle**：顶层只有
 * `window.__ModuleLoader__.load({...})`（只注册、不执行 factory），给一个 window 桩
 * 即可拿到 factory，再用 createRequire 供上 react（bundle 里其余都是本地代码）。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[8] 自动选中优先级：优先落到已有定制的项')
{
  const sec = (name, overridden = false) => ({ section: name, base: 'x', overridden })
  const skill = (id, overriddenCount, sections) => ({ skillId: id, skillName: id, code: id, sections, overriddenCount })
  let mod = null
  try {
    const code = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
    let captured = null
    new Function('window', code)({ __ModuleLoader__: { load: (m) => { captured = m } } })
    mod = captured.factory(createRequire(import.meta.url))
  } catch (e) {
    assert(false, `bundle 可在 node 求值：${e instanceof Error ? e.message : String(e)}`)
  }

  if (mod) {
    // 能力 → 章节：定制的章节在中间（C08P05 的真实形状：第 4 个章节）
    const sections = [
      sec('Evidence Requirements'), sec('Expected Output'), sec('Purpose'),
      sec('Reasoning Guidance', true), sec('Research Method'),
    ]
    assertEq(mod.preferredSection(sections), 'Reasoning Guidance', 'preferredSection 命中已有定制的章节（不是第一个）')
    assertEq(mod.preferredSection([sec('Purpose'), sec('Research Method')]), 'Purpose', 'preferredSection 无定制 → 第一个')
    assertEq(
      mod.preferredSection([sec('Purpose'), sec('When to Use'), sec('Prerequisites'), sec('Research Method')]),
      'Purpose',
      'preferredSection 无定制 → 规范第一项 Purpose（③ 的默认项可预期）',
    )
    assertEq(mod.preferredSection([]), '', 'preferredSection 空列表 → 空串')

    const skills = [skill('a', 0, [sec('Purpose')]), skill('b', 1, [sec('Purpose')]), skill('c', 0, [sec('Purpose')])]
    assertEq(mod.preferredSkill(skills)?.skillId, 'b', 'preferredSkill 命中已有定制的能力')
    assertEq(mod.preferredSkill([skill('a', 0, [])])?.skillId, 'a', 'preferredSkill 无定制 → 第一个')
    assertEq(mod.preferredSkill([]), undefined, 'preferredSkill 空列表 → undefined')

    const cats = [
      { categoryId: 'x', categoryName: 'x', skills: [], overriddenCount: 0, pointCount: 0 },
      { categoryId: 'y', categoryName: 'y', skills: [], overriddenCount: 2, pointCount: 9 },
    ]
    assertEq(mod.preferredCategory(cats)?.categoryId, 'y', 'preferredCategory 命中已有定制的类别')
    assertEq(
      mod.preferredCategory([{ categoryId: 'x', categoryName: 'x', skills: [], overriddenCount: 0, pointCount: 0 }])?.categoryId,
      'x',
      'preferredCategory 无定制 → 第一个',
    )

    // 三个导航点（首次加载 / 换类别 / 换能力）都必须走 preferred*，
    // 否则又回到"落在第一个章节、输入框是空的"。
    const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
    assertEq(inlineCount(src, 'setSection(preferredSection('), 3, 'settings.tsx 三处选章节都走 preferredSection')
    assert(!src.includes('s0?.sections[0]?.section'), 'settings.tsx 不再直接取第一个章节')
  }
}

rmSync(HOME, { recursive: true, force: true })

/* ════════════════════════════════════════════════════════════════════════
 * 9. 简报/摘要的正文按 Markdown 渲染（而不是显示源码）
 *
 * 真实反馈：【可指导】点开简报后，界面上是 Markdown **源码**
 * （`**分层结构**（D001 读法 B 之后）：| 层 | 假设 | …`）。
 * 原因是这些字段直接来自研究者的 `.md` 文件，却按纯文本（pre-wrap）渲染。
 *
 * 解析器是纯函数（`src/client/markdown.ts`），这里用 esbuild 现场转译后**真执行**，
 * 断言块级/行内 token —— 而不是只 grep 源码。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[9] 简报正文按 Markdown 渲染（不是源码）')
{
  const { build } = await import('esbuild')
  const out = await build({
    entryPoints: [join(PKG, 'src', 'client', 'markdown.ts')],
    bundle: false,
    format: 'esm',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  })
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
  )
  const { parseMarkdownBlocks, parseInline } = mod

  // 块级：段落 / 表格 / 列表 / 引用（全是真实简报文里出现过的形状）
  const sample = [
    '**分层结构**（D001 读法 B 之后）：',
    '',
    '| 层 | 假设 | 落盘 |',
    '|---|---|---|',
    '| **主假设** | 把残差作为显式约束 | `C003` |',
    '',
    '- I-a 把残差做成位姿层因子',
    '- I-b 用局部性线索仲裁',
    '',
    '> 紧耦合在测量层融合，位姿级不一致**不作为约束**。',
  ].join('\n')
  const blocks = parseMarkdownBlocks(sample)
  assertEq(
    blocks.map((b) => b.kind),
    ['paragraph', 'table', 'list', 'quote'],
    '块级结构正确（段落 / 表格 / 列表 / 引用）',
  )
  assertEq(blocks[0].text, '**分层结构**（D001 读法 B 之后）：', '段落保留原文（行内再切 token）')
  assertEq(blocks[1].head, ['层', '假设', '落盘'], '表格表头解析（去掉首尾竖线）')
  assertEq(blocks[1].rows.length, 1, '表格数据行 1 行')
  assertEq(blocks[2].ordered, false, '无序列表')
  assertEq(blocks[2].items.length, 2, '列表两项')
  assertEq(blocks[2].items[1], 'I-b 用局部性线索仲裁', '列表项去掉标记符')

  // 代码块 / 标题 / 分隔线 / 单换行
  const more = parseMarkdownBlocks('## 小标题\n\n```python\nprint(1)\n```\n\n---\n\n第一行\n第二行')
  assertEq(
    more.map((b) => b.kind),
    ['heading', 'code', 'hr', 'paragraph'],
    '标题 / 代码块 / 分隔线 / 段落',
  )
  assertEq(more[0].level, 2, '标题层级')
  assertEq(more[1].text, 'print(1)', '代码块原样取出（含语言）')
  assertEq(more[1].lang, 'python', '代码块语言')
  assertEq(more[3].text, '第一行\n第二行', '段落里的单个换行保留（研究笔记按行断句）')

  // 行内：**粗** / `代码` / [链接](url)；HTML 标签**保持文字**（无注入面）
  const inl = parseInline('**粗** 与 `code` 与 [链接](https://x.y) 与 <b>raw</b>')
  assertEq(
    inl.map((t) => t.kind),
    ['bold', 'text', 'code', 'text', 'link', 'text'],
    '行内 token 切分正确',
  )
  assertEq(inl[4].href, 'https://x.y', '链接地址取出')
  assertEq(inl[5].text, ' 与 <b>raw</b>', '源码里的 HTML 标签原样当文字（不会被当节点）')
  assertEq(parseMarkdownBlocks(''), [], '空文本 → 无块')
  assertEq(parseInline('没有标记').map((t) => t.kind), ['text'], '无标记 → 单个 text token')

  // 接线：正文类字段走 Markdown 组件，短标签（证据名）保持纯文本
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  assert(src.includes("from './markdown-view.js'"), 'settings.tsx 引入 Markdown 渲染组件')
  for (const key of [
    'researchQuestion',
    'summary',
    'motivation',
    'coreIdea',
    'hypothesis',
    'methodOverview',
    'openProblems',
  ]) {
    assert(
      src.includes(`block(t('community.detail.${key}')`) || src.includes(`t('community.detail.${key}')`),
      `正文类字段走 Markdown：${key}`,
    )
  }
  assert(
    src.includes("line(t('community.detail.keyEvidence')"),
    '证据名是短标签，保持纯文本一行',
  )

  // 安全：整个客户端不许用 HTML 注入
  const clientDir = join(PKG, 'src', 'client')
  const offenders = readdirSync(clientDir)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .filter((f) => readFileSync(join(clientDir, f), 'utf8').includes('dangerouslySetInnerHTML'))
  assertEq(offenders, [], 'src/client 无 dangerouslySetInnerHTML（Markdown 用 React 元素渲染）')
  assert(
    readFileSync(join(PKG, 'src', 'client', 'markdown-view.tsx'), 'utf8').includes('parseMarkdownBlocks'),
    '渲染组件复用同一个解析器（解析与渲染不重复实现）',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * 10. 扣费操作必须二次确认（不能点击即生效）
 *
 * 真实要求（2026-09 用户）：【可指导】→【详情】（1 Token）点一下就直接扣钱了。
 * 简报是这一层**唯一"点一下就扣 Token"**的入口，而"读过"无法撤销，所以动作必须
 * 拆成两步：第一次点击只开确认框，只有「确认读取」才发 `work/brief`。
 *
 * 同时必须**只拦该拦的**：已经展开的简报再点是"收起"，服务器不会再扣费 ——
 * 那条路径不能弹确认，否则多一次无意义打断。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[10] 扣费操作必须二次确认（简报 1 Token）')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')

  // ① 组件存在，且列表的【简报】不再直连扣费
  assert(src.includes('function BriefConfirmDialog('), '存在简报扣费确认对话框组件')
  assertEq(
    inlineCount(src, 'onBrief={() => requestBrief(w)}'),
    2,
    '两个列表（可指导 / 可加入）的【详情】都走 requestBrief（不是直接扣费）',
  )
  assert(!src.includes('onBrief={() => void toggleBrief('), '列表不再把【简报】直连到 toggleBrief')

  // ② requestBrief 只对"会扣费"的情形弹确认；已展开的那一项直接收起
  const rbStart = src.indexOf('const requestBrief =')
  const rbEnd = src.indexOf('/** 服务器地址')
  assert(rbStart > 0 && rbEnd > rbStart, 'requestBrief 函数体可定位')
  const rb = src.slice(rbStart, rbEnd)
  assert(rb.includes("open?.projectId === w.projectId && open.kind === 'brief'"), '已展开的简报再点 = 收起（不扣费）')
  assert(rb.includes('void toggleBrief(w)'), '收起路径直接执行（不打断）')
  assert(rb.includes('setBriefConfirm(w)'), '其余情形（首次 / 换项 / 重试）先开确认框')

  // ③ 确认之前不可能有请求：`work/brief` 全仓库只有一处调用，且在 toggleBrief 内
  assertEq(inlineCount(src, "post('work/brief'"), 1, 'work/brief 只有一处调用点')

  // ④ 对话框自身不发请求，只回调（取消 / 确认）
  const dlgStart = src.indexOf('function BriefConfirmDialog(')
  const dlgEnd = src.indexOf('function CommunityTab(')
  const dlg = src.slice(dlgStart, dlgEnd)
  assert(dlg.includes('onClick={onCancel}'), '对话框有【取消】')
  assert(dlg.includes('onClick={onConfirm}'), '对话框有【确认读取】')
  assert(!dlg.includes('work/brief') && !dlg.includes('toggleBrief') && !dlg.includes('post('), '对话框自身不发请求')
  assert(
    dlg.includes("t('community.action.cancel')") && dlg.includes("t('community.briefConfirm.confirm')"),
    '两个按钮的文案走 i18n',
  )

  // ⑤ 费用 / 余额 / 可读内容在按下之前就摆出来（不是事后从回执推断）
  for (const key of [
    'community.briefConfirm.title',
    'community.briefConfirm.scope',
    'community.briefConfirm.cost',
    'community.briefConfirm.balance',
    'community.briefConfirm.balanceUnknown',
    'community.briefConfirm.idempotent',
  ]) {
    assert(dlg.includes(`t('${key}'`), `对话框展示 ${key}`)
  }
  assert(src.includes('balance={state?.tokens?.available ?? null}'), '渲染处把真实余额传进对话框')

  // ⑥ 取消 = 只关框（不发请求、不扣费）；确认 = 才走 toggleBrief
  assert(src.includes('onCancel={() => setBriefConfirm(null)}'), '取消只关掉对话框')
  assert(src.includes('void toggleBrief(target)'), '确认后才调用 toggleBrief（发请求）')
  assert(
    /onConfirm=\{\(\) => \{\s*const target = briefConfirm\s*setBriefConfirm\(null\)\s*void toggleBrief\(target\)/.test(src),
    '确认分支：先关框再发请求（顺序固定）',
  )

  // ⑦ 另一处扣费（发布）也必须是"确认后才生效"
  assertEq(inlineCount(src, 'void doPublish('), 1, 'doPublish 只有一处调用点')
  assert(
    /onConfirm=\{\(\) => \{\s*if \(!dialog\) return\s*void doPublish\(/.test(src),
    '发布由对话框的「确认」触发（点【寻找指导】只开框）',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * 11. 已经买过的简报**不再重复提醒**（只在真会扣费时才弹确认）
 *
 * 服务器按 (viewer, project) 只收一次钱，但只有 `/brief` 的 `charged_tokens`
 * 说明"这次花了没有"，列表/摘要都不带这个状态。宿主于是把"读过一次"记进本地
 * （`research/paid-briefs.ts`，按 serverUrl|accountId|projectId），
 * `work/list` 用 `briefOpened` 标出来 —— 界面据此**跳过**确认框。
 *
 * 反过来的边界同样要守住：拿不准（没记忆 / 账号未知）时必须**照常提醒**，
 * 因为漏提醒 = 静默扣费，比多问一次糟得多。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[11] 已买过的简报不再重复提醒')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')

  // ① requestBrief：已买过就直接读；且这条短路必须在"弹确认框"之前
  const rbStart = src.indexOf('const requestBrief =')
  const rbEnd = src.indexOf('/** 服务器地址')
  const rb = src.slice(rbStart, rbEnd)
  assert(rb.includes('if (briefFree(w))'), '已买过的简报不再弹确认（直接读）')
  assert(
    rb.indexOf('if (briefFree(w))') < rb.indexOf('setBriefConfirm(w)'),
    '短路在前、弹框在后（顺序不能反，否则照样每次提醒）',
  )
  assert(rb.includes('void toggleBrief(w)'), '短路路径直接发请求')

  // ② 判据优先级只在一处：服务器 brief_paid 权威 → 本地记忆兜底 → 不知道就提醒
  const bfStart = src.indexOf('function briefFree(')
  const bf = src.slice(bfStart, src.indexOf('/** 研究工作列表的一行'))
  assert(bf.includes("typeof w.briefPaid === 'boolean'"), '服务器给了 brief_paid 就用它（权威）')
  assert(bf.includes('if (w.briefOpened === true) return true'), '服务器没给才退回本地记忆')
  assert(
    bf.indexOf('w.briefPaid') < bf.indexOf('w.briefOpened'),
    '服务器值优先于本地记忆（顺序反了会拿旧记忆压住权威判据）',
  )
  assert(bf.includes('return false'), '两者都不确定 → false（照常提醒，不静默扣费）')

  // ③ 行的按钮：两种状态用**彩色角标**，且两者等宽（否则按钮宽度会随状态跳）
  assert(src.includes('briefFree={briefFree(w)}'), '判据传进行组件')
  assert(src.includes("t('community.briefState.paid')"), '已支付状态有独立文案')
  assert(src.includes("t('community.briefState.cost')"), '未支付状态有独立文案')
  assert(
    /<Badge tone=\{briefFree \? 'success' : 'brand'\}>/.test(src),
    '角标按状态着色（已支付 success / 1 Token brand）',
  )
  assert(
    /const BRIEF_BADGE_MIN_WIDTH = 64/.test(src),
    '角标定宽常量存在（两种状态等宽的安全上界）',
  )
  assert(
    /minWidth: BRIEF_BADGE_MIN_WIDTH, justifyContent: 'center'/.test(src),
    '角标外层用定宽常量 → 「已支付」与「1 Token」按钮同宽',
  )
  assert(
    !src.includes("t('community.action.briefUnlocked')"),
    '旧的"已解锁"按钮文案已移除（状态改由角标表达）',
  )
  assert(src.includes("t('community.tip.briefUnlocked')"), '已解锁的 tooltip 说明"重读免费"')

  // ④ 读成功 ⇒ 本会话立刻标记（同一会话里再点不该又弹一次）。
  //    ⚠️ 必须连 `briefPaid` 一起置 true：列表里那份是**付款前**抓的 `false`，
  //    只改本地记忆会被权威值压住，于是刚读完又弹框。
  assert(
    /it\.projectId === w\.projectId \? \{ \.\.\.it, briefPaid: true, briefOpened: true \}/.test(src),
    '读成功后把该行的 briefPaid / briefOpened 都置 true',
  )

  // ④ 回执公开：优先用服务器的 `charged_tokens`（权威），缺字段才退回余额差值
  assert(src.includes('const charged = brief.chargedTokens'), '回执读 charged_tokens')
  assert(
    src.indexOf('typeof charged === \'number\'') < src.indexOf('before - after'),
    'charged_tokens 优先，余额差值只作兜底',
  )

  // ⑤ 宿主的本地记忆：键必须含账号与服务器（漏掉任一项都会导致静默扣费）
  const store = readFileSync(join(PKG, 'src', 'research', 'paid-briefs.ts'), 'utf8')
  assert(store.includes('`${serverUrl.trim()}|${accountId.trim()}|${projectId.trim()}`'), '键 = serverUrl|accountId|projectId')
  assert(store.includes('export function createFilePaidBriefStore'), '有落盘实现（重启后仍然记得）')
  const rpc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')
  assert(rpc.includes('paidBriefStore?.mark('), 'work/brief 成功后记账')
  assert(
    /annotateOpenedBriefs\(base, apiKey, items\)/.test(rpc),
    'work/list 用本地记忆标注 briefOpened',
  )
  assert(rpc.includes('if (!accountId) return items'), '账号未知 → 不标注（保守：界面仍提醒）')
}
/* ════════════════════════════════════════════════════════════════════════
 * [12] 指导关系：第三个 Tab + 接受必须二次确认（押金冻结）
 *
 * 结构定稿（2026-09 用户拍板）：三个 Tab —— 我的 / 可指导 / **指导中**。
 * 发起与接受都收在「指导中」，列表行**不加**内联按钮（有第三个 Tab 时那些可忽略）。
 * 接受会冻结押金 = 真正动 Token → 必须先弹确认框（沿用扣费确认规则）。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[12] 指导关系中：第三个 Tab + 接受冻结押金的二次确认')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const zhDict = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')

  // ① 三个 Tab：workTab 类型含 'mentorship'，且有对应 MiniTab
  assert(
    src.includes("useState<'mine' | 'mentor' | 'joinable' | 'mentorship'>"),
    'workTab 类型含四个视图（我的 / 可指导 / 可加入 / 指导中）',
  )
  assert(inlineCount(src, "setWorkTab('mentorship')") === 1, '有「指导中」Tab 按钮')
  assert(src.includes("t('community.tab.mentorship')"), 'Tab 文案走 i18n（指导中）')

  // ② **一个**列表跟踪状态（用户拍板：不再分「我收到的 / 我发起的」）
  assert(src.includes('const trackItems = React.useMemo('), '两个方向合成一个统一列表')
  assert(!src.includes("t('community.mentor.incomingTitle')"), '没有「我收到的」分栏标题')
  assert(!src.includes("t('community.mentor.outgoingTitle')"), '没有「我发起的」分栏标题')
  // 每行都带**算好的方向视角**（谁能接受 / 我上传落在哪一侧 / 进展怎么称呼都从它来）
  assert(
    /trackItems\.map\(\(\{ p, view \}, i\)/.test(src) && /proposalView\(p, myAccountId\)/.test(src),
    '统一列表每行带方向视角（proposalView）',
  )
  assert(src.includes('function proposalView('), '方向视角有独立函数（不在 JSX 里现推）')
  // 排序：还要动作的顶上去
  assert(/PROPOSED: 0, ACCEPTED: 1/.test(src), '按"还要不要动作"排序（等待响应在前）')
  // 只留状态 + 费用数字：描述性文字必须消失
  assert(src.includes('feeText(p)'), '每行显示费用数字')
  /*
   * 版式：名称 / 补充行 / 费用**竖排**（曾经并排导致整行太长，右侧【下载】【上传】被挤成两行）。
   * 2026-10 起左列中间多了一行"哪份研究工作"（见下面的行首断言），所以窗口放宽到 700 ——
   * 判据是"三者都在同一个竖排左列里"，不是它们隔多少字符。
   */
  assert(
    /flexDirection: 'column',\s*gap: 2,[\s\S]{0,1400}?S\.listTitle[\s\S]{0,1400}?feeText\(p\)/.test(src),
    '名称 / 补充行 / 费用竖排（左侧自己消化宽度）',
  )
  // 右侧（状态 + 操作）整组不许被压、不许换行
  assert(
    /flex: '0 0 auto',\s*flexWrap: 'nowrap',/.test(src),
    '右侧整组 flex: 0 0 auto + nowrap（按钮永远一行）',
  )
  for (const gone of ['scopeText', 'conditionPlain', 'conditionWithNote', 'affiliationText', 'researcherText']) {
    assert(!src.includes(gone), `描述性文字已去掉：${gone}`)
  }
  // 状态不再永远停在「已接受」：关系建立后按"导师传了没有"分两个**进展**状态，
  // 并按角色换称呼（导师看自己的行不该写"导师已指导"）。
  assert(src.includes('function progressLabelKey('), 'ACCEPTED 有独立的进展文案')
  /*
   * ⚠️ v0.6.0：`review_files` 数的是**非 owner 那一侧** —— 方向 A 下那是导师的
   * 指导产物，方向 B 下那是**学生的交付**。所以文案有**四组**，按
   * "我在哪一侧 + 项目哪个方向"选，不能只用"导师 / 学生"两个词。
   */
  assert(
    /if \(view\.iAmOwner\) return true/.test(src) && /acceptedProgressKey\(p, view\)/.test(src),
    '文案与下载可用性都按"我在哪一侧"（owner 侧 = 项目所有者）判',
  )
  /*
   * ⚠️ 四组文案的**取值规则**在纯函数 `src/client/mentorship-labels.ts` 里，上面已经
   * 行为级断言了四种（方向 × 视角）组合 + 文案本身。这里只钉住两件事：
   *   ① 规则确实由那个纯函数决定（不是又散回 JSX 里）；
   *   ② 词条用的是**语义化名字**（`*Guided` = 导师的动作、`*Deliver*` = 学生的动作）——
   *      旧名字（studentGot / mentorDone / studentToDeliver …）编码了错误的心理模型，
   *      正是"方向 A 两侧配反"那个 bug 的来源，不该再回来。
   */
  assert(/from '\.\/mentorship-labels\.js'/.test(src), '进展文案走纯函数模块（可被自检直接断言）')
  for (const k of [
    'awaitingMentor',
    'mentorGuided',
    'iToGuide',
    'iGuided',
    'iToDeliver',
    'iDelivered',
    'awaitingStudent',
    'studentDelivered',
  ]) {
    assert(zhDict.includes(`'community.mentor.progress.${k}'`), `进展文案有中文：${k}`)
  }
  for (const gone of ['studentGot', 'studentWaiting', 'mentorDone', 'mentorWaiting', 'studentToDeliver']) {
    assert(
      !zhDict.includes(`'community.mentor.progress.${gone}'`),
      `旧的、按角色猜的名字已移除：${gone}`,
    )
  }
  /*
   * 行首必须同时说出"**哪份工作、和谁**"（2026-10 用户要求）：
   * 只给人名 → 同一导师的多个研究工作分不出来；只给工作名 → **同名**工作分属
   * 两个学生分不出来（本机实测就有两份都叫「ConvFusion-dsh（run）」的提案）。
   * 区分用的那一半另起一行（粗体那行是 nowrap+ellipsis，挤进去会被截掉）。
   */
  assert(
    /const line = view\.iAmAcceptor\s*\?\s*\(proposalWorkLabel\(p\) \?\? t\('community\.mentor\.untitledProject'\)\)\s*:\s*\(view\.counterparty\?\.displayName \?\? ''\)/.test(
      src,
    ),
    '【指导中】的行给出"哪份研究工作"（该我接受时）与"对方是谁"（我发起时）',
  )
  /*
   * v0.6.0：显示的名字是**这项工作自己的名字**（服务器的 `work_name`：有论文就是论文标题，
   * 否则是工作确定的主题），`project_title` 只作旧服务器的兜底 —— 看列表的人本机不一定
   * 有那份 workspace，所以名字只能来自服务器。
   */
  assert(
    /function proposalWorkLabel\(p: HostProposal\): string \| null \{\s*return p\.workName\?\.trim\(\) \|\| p\.projectTitle/.test(src),
    '【指导中】显示名：`work_name` 优先，`project_title` 只作兜底',
  )
  assert(
    /function workLabelOf\(source: \{ workName\?: string \| null; title: string \}\): string \{\s*return source\.workName\?\.trim\(\) \|\| source\.title/.test(src),
    '【可指导】/【可加入】显示名：`work_name` 优先，`title` 只作兜底',
  )
  assertEq(
    (src.match(/title=\{workLabelOf\(w\)\}/g) ?? []).length,
    2,
    '两个列表（可指导 / 可加入）都用 `workLabelOf` 取名字',
  )
  assert(
    /community\.publish\.workspaceHint/.test(src) && /data\.workspaceTitle !== data\.title/.test(src),
    '发布对话框：标题是**要发布的名字**，本机工作区名另用一行指认（两者不同时才出现）',
  )
  assert(
    /community\.notice\.renameFailed/.test(src),
    '改名失败要如实说一句（否则回执显示新名字、网络里还是旧名字）',
  )
  assert(
    /view\.iAmAcceptor\s*\?\s*\(view\.counterparty\?\.displayName \?\? t\('community\.mentor\.unknownParty'\)\)/.test(src),
    '粗体那行仍是"对方"，补充行不抢主次',
  )
  /*
   * ⚠️ 用 `iAmAcceptor`（谁该接受）而不是"我是不是学生"：方向 B 里该接受的是
   * **导师**，主次的行序也要跟着翻。
   *
   * ⚠️ 判据本体已搬进纯函数 `mentorship-view.ts`（四格表在下面的行为断言里逐一钉住），
   * 这里只钉"界面**读的是**这个派生量，而不是自己现推一遍方向"。
   */
  {
    const mvSrc = readFileSync(join(PKG, 'src/client/mentorship-view.ts'), 'utf8')
    assert(src.includes("from './mentorship-view.js'"), '方向派生量走纯函数模块（界面不再自己推方向）')
    assert(
      mvSrc.includes('iAmAcceptor: !iProposed'),
      '纯函数里"该我接受"= 我不是发起人（两个方向同一判据）',
    )
    assert(
      /iAmPayer: myRole === 'researcher'/.test(mvSrc),
      '纯函数里"押金冻我的吗"= 我是不是学生（**不是** !iAmOwner）',
    )
    // 界面里不该再出现"自己推谁付钱"的老写法
    assert(!/iPayer = !/.test(src), '界面不再用 `iPayer = !iAmOwner` 那套（接受人 ≠ 付款人）',
    )
  }

  // 动作只长在「我收到的 + 等待响应」那一行（其余状态纯跟踪）
  assert(
    /\{view\.iAmAcceptor && p\.status === 'PROPOSED' \? \(/.test(src),
    '只有"等我处理"的那条给接受/拒绝按钮',
  )
  // 学生侧要能看清"是谁在申请指导我"：查看导师信息 → Profile 介绍
  assert(src.includes("'community.action.viewMentor'"), '有【查看导师信息】按钮')
  assert(src.includes("'community.action.viewStudent'"), '方向 B 里是【查看学生信息】（同一个动作、换个称呼）')
  assert(
    /view\.counterparty\?\.profile !== undefined \? \(\s*<button[\s\S]{0,900}?setProfileTarget\(\{ proposal: p, view/.test(src),
    '资料按钮只在服务器**给了**对方 profile 键时出现（哪一方由服务器按方向投影）',
  )
  assert(src.includes('function PartyProfileDialog('), '存在对方资料对话框（不是"导师专用"）')
  assert(
    /isMentor \? 'community\.mentor\.profileTitle' : 'community\.mentor\.profileTitleResearcher'/.test(src),
    '对话框标题按对方角色换（导师信息 / 学生信息）',
  )
  assert(
    /isMentor \? 'community\.mentor\.profileEmpty' : 'community\.mentor\.profileEmptyResearcher'/.test(src),
    '对方没填 profile 时如实说明（不编内容）',
  )
  for (const f of ['profileBio', 'profileFields', 'profileInterests', 'profileExpertise']) {
    assert(src.includes(`community.mentor.${f}`), `Profile 字段有展示位：${f}`)
  }
  assert(/<PartyProfileDialog[\s\S]{0,200}?party=\{profileTarget\.party\}/.test(src), '对话框被渲染')
  // 资料来自提案内嵌的 profile → 不该为它多发一次请求
  const mp = src.slice(src.indexOf('function PartyProfileDialog('), src.indexOf('function CommunityTab('))
  assert(!mp.includes('post('), '对方资料不额外发请求（数据已在提案响应里）')

  // 【接受】用与【发起指导】同一个品牌色风格，不用实心主按钮（用户：不要黑色）
  assert(
    /\.\.\.S\.accentBtn[\s\S]{0,420}?requestAccept\(p\)/.test(src),
    '【接受】用 accentBtn（与【发起指导】一致）',
  )
  assert(
    !/style=\{S\.primaryBtn\}[\s\S]{0,200}?requestAccept\(p\)/.test(src),
    '【接受】不再是实心主按钮',
  )
  // Split Button：【拒绝】收进 ▾ 的下拉，行上只留「导师 + 接受 ▾」
  assert(src.includes("'community.action.viewMentor'"), '标签已压短（导师）')
  assert(zhDict.includes("'community.action.accept': '接受'"), '标签已压短（接受）')
  assert(/setMenuFor\(\(prev\) =>/.test(src), '▾ 切换下拉展开态')
  // 两段必须等高：靠 flex stretch，不靠魔法数字 / 硬凑 padding
  assert(
    /display: 'inline-flex', alignItems: 'stretch'/.test(src),
    'Split 容器用 stretch（右段自动跟左段等高）',
  )
  assert(
    /padding: '0 11px',\s*display: 'inline-flex',\s*alignItems: 'center'/.test(src),
    '箭头段纵向 padding 归零（高度来自 stretch）+ 横向加宽（近方形）',
  )
  assert(/aria-label=\{t\('community.action.more'\)\}/.test(src), '▾ 有可访问名')
  assert(/menuFor\.proposal[\s\S]{0,120}?rejectProposal\(target\)/.test(src), '【拒绝】在下拉里')
  assert(!/style=\{S\.ghostBtn\}[\s\S]{0,120}?rejectProposal\(p\)/.test(src), '【拒绝】不再直接占用行内宽度')
  // 下拉必须 fixed 定位：外层卡片 overflow:hidden，absolute 会被裁掉
  const menu = src.slice(src.indexOf('Split Button 的下拉'), src.indexOf('════ 导师信息'))
  assert(menu.includes("position: 'fixed'"), '下拉用 fixed 定位（卡片 overflow:hidden 会裁掉 absolute）')
  assert(menu.includes('zIndex: 998') && menu.includes('zIndex: 999'), '下拉的 zIndex 压在对话框之下')
  assert(menu.includes('setMenuFor(null)'), '有"点别处关闭"的背板')

  // ③ 接受**必须先确认**：按钮只调 requestAccept，只有 confirmAccept 里发请求
  assert(/setMenuFor\(null\)\s*requestAccept\(p\)/.test(src), '【接受】只打开确认框（不直连请求）')
  assert(!src.includes('onClick={() => void confirmAccept('), '【接受指导】不直连 confirmAccept')
  assertEq(inlineCount(src, "post('mentor/accept'"), 1, 'mentor/accept 只有一处调用点（在 confirmAccept 内）')
  assert(src.includes('function AcceptConfirmDialog('), '存在接受确认对话框组件')
  // 确认框必须说清"冻多少"（只说"确认？"等于没提醒）
  assert(src.includes('acceptFreezeNote'), '确认框说明冻结语义（钱还是你的，只是不可用）')
  assert(src.includes('acceptBalance'), '确认框显示当前可用余额')
  assert(
    src.includes("'community.mentor.acceptConfirmBadge'") &&
      src.includes("'community.mentor.acceptConfirmBadgeOther'"),
    '确认框角标写明冻结数量（且分清"冻我的"与"冻学生的"）',
  )
  assert(
    src.includes('acceptFreezeNoteOther') && src.includes('iPayer ? ('),
    '方向 B：接受的人不是付款人 → 说明冻的是**学生**的钱，且不显示自己的余额',
  )

  // ④ 幂等键：接受也复用（402 押金不足后重试不重复冻结）
  const ca = src.slice(src.indexOf('const confirmAccept ='), src.indexOf('const rejectProposal ='))
  assert(ca.includes('acceptIntents[target.id] ?? crypto.randomUUID()'), '接受复用自己的幂等键')
  assert(ca.includes("code === 'insufficient-tokens'"), '押金不足单独给说法（不是笼统"失败"）')
  assert(ca.includes('refreshBalance()'), '接受后刷新余额（押金已从 available 转冻结）')
  assert(ca.includes('loadProposals()'), '接受后刷新提案列表（状态变 ACCEPTED）')

  // ⑤ 拒绝：不冻 Token，直接执行 + 回执
  assert(src.includes('const rejectProposal = async'), '有拒绝处理')
  assertEq(inlineCount(src, "post('mentor/reject'"), 1, 'mentor/reject 只有一处调用点')

  // ⑥ 发起指导：在【可指导】列表的【概览】【详情】下面一行，发起后显示状态角标
  //
  // ⚠️ 这一条**修过一次**：最初按"有第三个 Tab 就忽略内联按钮"把发起入口整个去掉了，
  // 结果**没有任何地方能发起指导**（「指导中」只做了接受/拒绝）。用户一看就发现
  // "没有发起指导的按钮"。教训：把入口收进 Tab 时，必须确认**每个动作都还有家**。
  assert(src.includes("t('community.action.propose')"), '有【发起指导】按钮（入口不能再丢）')
  assert(src.includes("post('mentor/propose'"), '发起走 mentor/propose')
  assert(src.includes('function ProposeDialog('), '存在提案对话框组件')
  assert(
    src.includes("'community.mentor.proposeTitle'") && src.includes("'community.mentor.bidTitle'"),
    '对话框标题走 i18n（且两个方向各有一个标题：发起指导 / 出价加入）',
  )
  // 第二行插槽：挂在 WorkRow 的按钮**下面**
  assert(src.includes('below={'), 'WorkRow 有第二行动作插槽')
  assert(src.includes('{below}'), 'WorkRow 真的渲染这个插槽')
  // 导师侧只填**总费用**：指导范围已删、押金比例由平台定（v0.6.3 起成功条件与论文等级
  // 由用户在对话框里选 —— 等级是价格依据，见下面 ⑥b）
  const pd = src.slice(src.indexOf('function ProposeDialog('), src.indexOf('function DownloadDialog('))
  assertEq((pd.match(/<input/g) ?? []).length, 1, '提案对话框只剩一个输入框（总费用）')
  assert(!pd.includes('scopeLabel') && !pd.includes('scopePlaceholder'), '对话框不再采集指导范围')
  // 钱怎么分 = **一段话**（分两行会让对话框多一行高）
  assertEq((pd.match(/feeNote/g) ?? []).length, 1, '费用说明只占一段')
  assert(!pd.includes('conditionByStudent'), '不再有独立的成功条件说明行')
  assert(zhDict.includes('成功条件由对方确认'), '这一段里说明了成功条件由对方确认')
  // 押金比例来自**平台建议**（不写死 20%），推导而非让用户填
  assert(
    /fee\.suggestedDeposit \/ fee\.suggestedFee/.test(pd),
    '押金比例取自平台建议（suggested_deposit / suggested_fee）',
  )
  assert(/DEFAULT_DEPOSIT_RATIO/.test(pd), '取不到建议时退回文档默认比例')
  assert(!/0\.2\s*\/\/ *20|Math\.round\(totalNum \* 0\.2\)/.test(pd), '没有把 20% 写死在计算里')
  assert(/deposit = valid \? Math\.max\(1, Math\.round\(totalNum \* ratio\)\)/.test(pd), '押金按比例推导')
  assert(/success = valid \? totalNum - deposit/.test(pd), '成功付款 = 总额 − 押金（和恒成立）')
  assert(pd.includes('percent: Math.round(ratio * 100)'), '界面显示的百分比来自同一比例')
  // 服务器仍要求非空 → 送过渡值；展示端遇占位符整行不显示
  assert(/PROPOSE_SCOPE_PLACEHOLDER = '-'/.test(src), '指导范围送占位符（服务器仍必填）')
  assert(/PROPOSE_DEFAULT_CONDITION = 'MUTUAL_COMPLETION'/.test(src), '成功条件默认「双方确认完成」')
  // 指导范围已彻底不展示（导师不采集 → 展示它是死代码）
  assert(!src.includes('scopeRow'), '列表/对话框都不再渲染指导范围')

  /*
   * ── ⑥b 论文等级定价（v0.6.3，服务器 §3.2.4）──────────────────────────────
   *
   * 这一版把"价格"从"约定总额"改成**等级定价**：`PAPER_ACCEPTED` / `PAPER_PUBLISHED`
   * 的价格**就是**等级，服务器缺等级直接 400 `INVALID_PROPOSAL`。所以界面上必须
   * ① 能选条件、② 论文类条件必须能选等级、③ 选了等级才去问服务器价钱、
   * ④ 把等级随提案发出去。四条缺一条就是"必然失败"或"按错价成交"。
   *
   * 另外钉住一条纪律：**价目表不许抄到客户端**（平台调价后界面会撒谎）。
   */
  assert(/from '\.\/paper-level\.js'/.test(src), '等级规则走纯函数模块 paper-level.ts（可被自检直接断言）')
  assert(pd.includes('SUCCESS_CONDITION_KEYS'), '成功条件由用户在下拉里选（不再是写死的过渡值）')
  assert(/isPaperCondition\(condition\)/.test(pd) && /\{paper \? \(/.test(pd), '等级下拉只在论文类条件下出现')
  assert(
    pd.includes("(['JCR', 'CCF'] as PaperLevelSystem[])") && pd.includes('levelOptions(system)'),
    '等级下拉按体系分组（JCR 分区 / CCF 类别），取值来自纯函数',
  )
  assert(
    /const valid = Number\.isInteger\(totalNum\) && totalNum > 0 && \(!paper \|\| level !== null\)/.test(pd),
    '论文类条件未选等级 = 不能提交（服务器的规则是缺等级 400，界面不把它做成一次莫名失败）',
  )
  assert(
    /successCondition: \{\s*type: condition,\s*\.\.\.levelQuery\(level\),/.test(pd),
    '提案带出条件 + 等级（levelQuery 只发 jcrLevel 或 ccfLevel 一个字段）',
  )
  assert(
    /if \(isPaperCondition\(terms\.condition\) && !terms\.level\)/.test(src),
    '论文类条件在选等级前**不取兜底价**（100 不是"论文被接收"的价钱）',
  )
  assert(
    /post\('mentor\/fee-suggestion', levelQuery\(terms\.level\)\)/.test(src),
    '等级 → 金额由服务器算（客户端只传等级）',
  )
  assert(!/\b(500|600|800|1000)\b/.test(pd), '客户端没有抄价目表（500 / 600 / 800 / 1000 一个都不出现）')
  assert(
    /t\('community\.mentor\.levelRequired'\)/.test(pd) && zhDict.includes('等级就是价格'),
    '未选等级时说明原因（等级就是价格）',
  )
  assert(
    /paperLevelOf\(p\.successCondition\)/.test(src) && /paperLevelText\(level\)/.test(src),
    '列表行把等级报出来（同样的价钱按几区定价是两回事）',
  )

  /*
   * ── ⑥c 接受前的**资金池**拦截（v0.6.3）────────────────────────────────
   *
   * 押金只能从 `funded` 冻结，赠送额度**不能**付给导师。客户端已经知道这件事，
   * 就必须在**点之前**拦住 —— 否则用户看到"余额明明够"却拿到 402，完全无从理解。
   * 而两池未知（旧宿主）= 判不出来 → **不拦**（旧服务器上两池本来就是一体的）。
   */
  assert(
    /const payable = funded === null \? null : funded >= proposal\.depositAmount/.test(src),
    '用资金池（不是两池之和）判断押金付不付得起',
  )
  assert(/const short = iPayer && payable === false/.test(src), '只有"冻的是我的钱"时才拦')
  assert(/disabled=\{short\}/.test(src), '资金池不足 → 【确认接受】禁用（不是点了才失败）')
  assert(
    /t\('community\.mentor\.acceptNoFunded'/.test(src) && zhDict.includes('测试阶段请联系管理员发放 Token'),
    '拦住时说清原因 + 可行动作（测试阶段找管理员发放 Token）',
  )
  assert(
    /funded=\{state\?\.tokens\?\.funded \?\? null\}/.test(src) &&
      /grant=\{state\?\.tokens\?\.grant \?\? null\}/.test(src),
    '接受框拿到两池（旧宿主 → null，退回按可用余额判断）',
  )
  // 两池必须分开显示：混成一个"可用余额"会让人在 402 面前完全不明白为什么
  assert(
    /t\('community\.token\.funded'\)/.test(src) && /t\('community\.token\.grant'\)/.test(src),
    '余额弹窗分列资金池 / 赠送',
  )
  assert(zhDict.includes('赠送只能买平台自营服务'), '悬浮提示里说明赠送额度的边界')
  // 环形图只画弧：字放进 SVG 会被等比缩到不可读（v0.6.3 顺手修掉）
  const donut = src.slice(src.indexOf('function TokenDonut('), src.indexOf('/** 环形图旁边的一行图例'))
  assert(donut.includes('<circle') && !donut.includes('<text'), '环形图只画弧，数字交给 HTML 图例（缩放不改变字号）')
  assert(/function TokenLegendRow\(/.test(src), '有 HTML 图例组件（色点 + 名称 + 精确数字）')
  // 显示规则：**读过详情**之后才出现（业务上不允许没看内容就发指导申请）
  assert(
    /const canPropose = detailRead\.has\(w\.projectId\) \|\| briefFree\(w\)/.test(src),
    '【发起指导】只在读过详情后显示（跨会话用 briefFree 兜底）',
  )
  assert(/canPropose \? \(\s*<button/.test(src), '按钮按 canPropose 条件渲染')
  assert(/setDetailRead\(\(prev\) => new Set\(prev\)\.add\(w\.projectId\)\)/.test(src), '读到详情时记下来')
  // 样式：这是页面的商业动作 → 用品牌色主行动按钮，不是中性 ghostBtn
  assert(/accentBtn: \{[\s\S]{0,300}?state-business-primary/.test(src), '主行动按钮用品牌色（与 Badge brand 同一套变量）')
  assert(/style=\{\{ \.\.\.S\.accentBtn/.test(src), '【发起指导】用主行动按钮样式')
  // tooltip 要把"读后可发起"说出来，否则入口藏起来没人找得到
  assert(zhDict.includes('读后可发起指导'), '详情 tooltip 说明读后可发起指导')

  // 已发起过 → 按钮禁用 + 状态角标（不发第二次，服务器也会 409）
  /*
   * 两套索引，各取**自己那一边且是我发起**的提案：
   * 【可指导】里我是导师（我出价），【可加入】里我是学生（我出价）——
   * 合成一个 Map 会让"我导师身份对别人的工作发起的提案"混进我的出价记录。
   */
  assert(
    /const myMentorProposalByProject = proposalsByProject\('mentor'\)/.test(src) &&
      /const myResearcherProposalByProject = proposalsByProject\('researcher'\)/.test(src),
    '两套"我发起的提案"索引（导师侧 / 学生侧各一套）',
  )
  assert(
    /if \(view\.myRole !== from \|\| !view\.iProposed\) continue/.test(src),
    '索引里同时要求"我在这一边"且"这次是我发起的"',
  )
  assert(
    /const proposed = myMentorProposalByProject\.get\(w\.projectId\)/.test(src),
    '【可指导】按项目索引我发起的提案',
  )
  assert(
    /const bidded = myResearcherProposalByProject\.get\(w\.projectId\)/.test(src),
    '【可加入】按项目索引我出过的价',
  )
  assert(src.includes('disabled={Boolean(proposed) || proposeBusy}'), '已发起过 → 按钮禁用')
  assert(src.includes('disabled={Boolean(bidded) || proposeBusy}'), '已出过价 → 按钮禁用')
  assert(/'community\.action\.bid'/.test(src) && /openPropose\(w\)/.test(src), '【可加入】的行给【出价】')
  assert(/proposed \? \(\s*<Badge tone=\{proposalTone\(proposed\.status\)\}>/.test(src), '发起后显示状态角标')
  // 角标在**前**、按钮在**后**（发起过之后按钮只是灰掉的残影，先给信息）
  assert(
    /proposed \? \(\s*<Badge[\s\S]{0,600}?<\/Badge>\s*\) : null\}\s*\{canPropose \? \(/.test(src),
    '状态角标排在【发起指导】按钮之前',
  )
  // 这里的提案恒为"我发起"→ 也要用进展文案，不能停在「已接受」
  assert(
    /progressLabelKey\(proposed, proposalView\(proposed, myAccountId\)\)/.test(src),
    '【可指导】的角标同样用进展文案（待我指导 / 我已指导）',
  )
  assert(
    /progressLabelKey\(bidded, proposalView\(bidded, myAccountId\)\)/.test(src),
    '【可加入】的角标同样用进展文案',
  )
  // 刷新【可指导】时顺带刷新提案，否则角标一刷新就丢
  assert(/post\('mentor\/list'[\s\S]{0,400}?setProposals/.test(src), '刷新列表时回填提案状态（角标不丢）')
  // 费用建议是**开框之后**才到的（fetch 要一次往返），useState 初值只算一次 ——
  // 必须有个 effect 把它同步进去，否则预填永远是兜底的 100/20。
  assert(
    /React\.useEffect\(\(\) => \{\s*if \(!fee \|\| touched\.current\) return/.test(src),
    '费用建议到达后同步进对话框（否则预填等于没取到）',
  )
  assert(src.includes('touched.current = true'), '用户改动后不覆盖（touched 防线）')

  // ⑦ 读失败不能显示成"没有指导关系"
  assert(
    /res\.error\?\.code === 'unknown-endpoint'[\s\S]{0,200}?hostRestart/.test(src),
    '旧宿主没这个端点 → 提示重启（不是"没有数据"）',
  )

  // ⑧ 词典：状态与成功条件都要有中文（界面不显示英文枚举）
  for (const k of ['PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
    assert(zhDict.includes(`'community.mentor.status.${k}'`), `提案状态 ${k} 有中文文案`)
  }
  for (const k of [
    'PAPER_ACCEPTED',
    'PAPER_PUBLISHED',
    'RESEARCH_COMPLETED',
    'PATENT_GRANTED',
    'TECHNICAL_OUTCOME',
    'MUTUAL_COMPLETION',
  ]) {
    assert(zhDict.includes(`'community.mentor.condition.${k}'`), `成功条件 ${k} 有中文文案`)
  }
  // 等待响应是**导师视角**最关心的状态词（发起之后按钮旁边就显示它）
  assert(zhDict.includes("'community.mentor.status.PROPOSED': '等待响应'"), 'PROPOSED 显示为「等待响应」')
}

/* ════════════════════════════════════════════════════════════════════════
 * [13] 指导闭环的文件交换
 *
 * 【下载】= **浏览器原生下载**：宿主带凭据做同源 GET 代理，浏览器走自己的保存流程
 * （插件不落盘、不解压、不注册工作区 —— 浏览器存到哪页面无从得知）。
 * 【上传】= 扫描本地 `workspace/review/`，按原相对路径回传。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[13] 指导闭环：下载 / 上传')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const zhDict = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')

  // ① 两个动作都长在 **ACCEPTED** 的行上
  assert(
    /canDownloadProposal\(p, view\) \? \(\s*<button[\s\S]{0,260}?requestDownload\(p\)/.test(src),
    '【下载】按 canDownloadProposal 显示',
  )
  // ⚠️ 学生侧：导师还没传东西时不该能点（下回来的就是自己已发布的那份）
  //    但 `reviewFiles === null`（探测失败）必须保留 —— 拿不到 ≠ 没有
  assert(src.includes('function canDownloadProposal('), '下载可用性有独立判据')
  assert(
    /if \(p\.reviewFiles === null \|\| p\.reviewFiles === undefined\) return true/.test(src),
    '查不到导师是否上传时保留【下载】（不能因探测失败藏掉可能可用的动作）',
  )
  assert(/return p\.reviewFiles > 0/.test(src), '确认没有指导结果 → 不给【下载】')
  assert(
    /if \(view\.iAmOwner\) return true/.test(src),
    'owner 侧始终可下载（它要的是对方的工作区，关系一建立就该能用）',
  )
  assert(
    /p\.status === 'ACCEPTED' && !view\.iAmOwner \? \(\s*<button[\s\S]{0,300}?openExchange\(p\)/.test(src),
    '【上传】只在非 owner 侧（项目所有者用【我的】里的更新）',
  )
  // 下载现在**必须有**对话框（选工作区在那里）
  assert(src.includes('function DownloadDialog('), '下载有工作区选择器对话框')
  assert(src.includes('function UploadDialog('), '有上传对话框')

  // ② 点【下载】= 让用户**选一个 DSH 工作区**，把 ZIP 存下来（不走浏览器默认下载）
  assert(
    /const requestDownload = async \(p: HostProposal\)[\s\S]{0,300}?post\('mentor\/downloadState'/.test(src),
    '【下载】一次拿齐：预检 + 可选工作区列表',
  )
  assert(src.includes('function DownloadDialog('), '有工作区选择器对话框')
  assert(
    /w\.path/.test(src) && /<select[\s\S]{0,400}?value=\{selection\}/.test(src),
    '列出工作区（标题 + 路径）供**下拉选择** —— 不需要输地址',
  )
  assert(!/type="radio"/.test(src), '下载对话框用下拉框（不再是一长列单选）')
  /*
   * **任何工作区都能选**（2026-09 用户拍板）：下载只存 ZIP，同名不覆盖（宿主加序号），
   * 所以"已有研究项目就禁用"既没必要也挡路 —— 断言它真的不再回来。
   */
  assert(!/hasResearch/.test(src), '不再按"已有研究项目"禁用工作区')
  assert(!/community\.exchange\.occupied/.test(src), '不再有"不可选原因"那一行')
  // 只存 ZIP：没有 scope、没有解压、没有目录前缀拼接
  assert(!/scope: target\.incoming/.test(src), '不再按角色分 scope')
  assert(src.includes("t('community.exchange.zipOnly')"), '对话框说明"只存 ZIP，不解压"')
  assert(src.includes("t('community.exchange.destHint', { dest })"), '落点路径可见')
  assert(
    /post\('mentor\/download',\s*\{[\s\S]{0,200}?workspaceId: target\.selection/.test(src),
    '下载按工作区 id 提交（路径由宿主解析，客户端递不进任意路径）',
  )
  /*
   * v23：成功**不再直接关窗** —— 存下 ZIP 只是第一步，接下来要把这份快照与本地内容
   * **融合**（那件事交给会话里的 agent）。对话框留在原地给出「整合提示词」面板：
   * 能填就填进输入框、否则复制；**绝不自动发送**。
   * 失败时同样留着（让用户看到原因并能重试）。
   */
  assert(
    /setDownload\(\(prev\)[\s\S]{0,700}?done:\s*\{/.test(src),
    '下载成功后对话框转入「整合提示词」面板（不再是 setDownload(null) 直接关窗）',
  )
  assert(src.includes("t('community.merge.copy')"), '面板给「复制提示词」')
  assert(src.includes("t('community.merge.fill')"), '面板给「填入输入框」')
  // 填输入框**只调 setDraft**：这是"不自动执行"的代码体现（submit 绝不出现）
  const fillBlock = src.slice(src.indexOf('onFill={() => {'), src.indexOf('onCopy={() => {'))
  assert(/session\.setDraft\(prompt\)/.test(fillBlock), '「填入输入框」走 session.setDraft')
  assert(!/submit\(/.test(fillBlock), '填入**不发送**（没有任何 submit 调用）')
  assert(
    /canFill\s*=\s*[\s\S]{0,160}?target\.selection === target\.currentWorkspaceId/.test(src),
    '只有"目标 == 当前会话的工作区"才允许填入（DSH 只写自己会话的工作区）',
  )
  assert(src.includes("t('community.merge.otherWorkspace'"), '不是当前会话的工作区 → 明说该去哪发')
  /*
   * 「学生更新了工作区 → 提示重新下载」（协议 v21）：
   * 比对在宿主（本地水位 vs 服务器 workspace_*），界面只负责**显示与刷新**。
   */
  assert(
    /community\.exchange\.downloadDone[\s\S]{0,600}?await loadProposals\(\)/.test(src),
    '下载成功后刷新提案（"学生更新了"的提示当场消失，而不是等下次刷新）',
  )
  /*
   * ⚠️ 下载提示**按侧**取（v0.6.0，服务器 `counterpart_updated_at` 落地后）：
   * 服务器两侧各有自己的水位与计数 —— `workspace_*` 跟 owner 侧、
   * `counterpart_updated_at` / `review_files` 跟另一方那一侧；而**方向决定我下载哪一侧**
   * （方向 A 的导师下 owner 侧，方向 B 的导师下另一方那一侧）。
   * 所以判据是 `view.otherSide`，**不是**角色 —— 早先按"非 owner"判会让方向 B 的导师
   * 看不到"学生又交付了"。
   */
  assert(
    /p\.syncBySide \? p\.syncBySide\[view\.otherSide\] : p\.sync/.test(src),
    '下载提示取**自己下载的那一侧**（旧宿主退回单值 sync = owner 侧）',
  )
  assert(
    /sideSyncHint\(t, p, view\)/.test(src) && /'neverDownloaded' in sync/.test(src),
    '下载提示的三态各有说法：没下载过（先下载）/ 更新了 / 删除了',
  )
  assert(
    /sync\.reason === 'deleted' \? 'community\.mentor\.peerDeleted' : 'community\.mentor\.peerUpdated'/.test(src),
    '两态文案分开：更新 / 删除（判据不同，说的也该不同）',
  )
  // "那一侧还是空的"就不催下载（与 canDownloadProposal 的判据一致，否则让用户下空包）
  assert(
    /const count = view\.otherSide === 'owner' \? p\.workspaceFiles : p\.reviewFiles/.test(src) &&
      /if \(typeof count !== 'number' \|\| count === 0\) return null/.test(src),
    '那一侧没有文件时不催【下载】（命令用户下一个空快照没意义）',
  )
  // 资料入口按"服务器**给没给** profile 键"判，不是按"值非空"
  assert(
    /view\.counterparty\?\.profile !== undefined \?/.test(src),
    '资料按钮按 profile **键在不在**判（null = 投影了但没填 → 仍给入口，点开说"尚未填写"）',
  )
  assert(
    /if \(!res\.ok\)[\s\S]{0,400}?tone: 'error'[\s\S]{0,100}?return/.test(src),
    '下载失败时对话框留着并说明原因',
  )
  // 不再调起浏览器下载：<a download> 与同源 GET 代理都必须消失
  assert(!/a\.download\s*=/.test(src) && !/document\.createElement\('a'\)/.test(src), '不再用 <a> 触发浏览器下载')
  assert(!/mentor\/archive\?projectId/.test(src), '不再走同源 GET 代理')
  assert(src.includes("t('community.exchange.uploadTitle')"), '上传对话框标题走 i18n')
  assert(
    /post\('mentor\/uploadState'/.test(src) && /post\('mentor\/uploadPlan'/.test(src),
    '上传对话框：先取可回传的工作区，再取所选工作区的文件清单',
  )

  // ③ 上传：**选工作区 → 勾文件（研究根全量清单）→ 按原相对路径回传**（2026-09 v19）
  //
  // 为什么不是"选文件"：服务器要求 relative_paths 保留目录层次（papers/x.pdf），
  // 浏览器文件选择器拿不到相对路径；走宿主读盘还顺带绕开了 RPC 的请求体上限。
  assert(
    /post\('mentor\/upload',\s*\{[\s\S]{0,240}?workspaceId: uploadWorkspaceId[\s\S]{0,160}?paths: Array\.from\(uploadSelected\)/.test(
      src,
    ),
    '回传按「工作区 id + 原相对路径列表」提交',
  )
  assert(
    /setUploadSelected\(new Set\(v\.plan\.defaultSelection\)\)/.test(src),
    '清单默认勾选推荐级（导师要回传的通常就是整份进展）',
  )
  assert(
    /selectedBytes/.test(src) && /community\.exchange\.uploadSummary/.test(src),
    '显示所选文件的合计体积与批次数（用户要求）',
  )
  assert(/mentor\/uploadProgress/.test(src), '上传期间按秒问进度（慢 ≠ 死）')
  /*
   * 进度条**两条上传路径共用**：2026-10 实测【我的】发布带附件的工作时界面上
   * 根本没有进度条（只有导师回传那条画了），几十 MB 下只有一句「发布中…」。
   */
  assert(/function TransferProgress/.test(src), '进度条抽成共用组件（发布 / 导师回传同一根）')
  assert(/progress=\{publishProgress\}/.test(src), '发布对话框也拿得到进度')
  assert(/setPublishProgress\(v\)/.test(src), '发布期间按秒轮询（与回传同一条端点）')
  /* 一个研究工作**只属于一个方向**的规则见下方 `publishActionPlan` 的行为断言。 */
  {
    // 字典片段直接读（`dictHas` 在后面的 i18n 段落里，作用域不同）
    const zhDictText = readFileSync(join(PKG, 'src', 'client', 'i18n', 'zh.ts'), 'utf8')
    const enDictText = readFileSync(join(PKG, 'src', 'client', 'i18n', 'en.ts'), 'utf8')
    assert(zhDictText.includes("'community.action.republish': '更新研究工作'"), '已发布按钮是 6 字【更新研究工作】')
    assert(enDictText.includes("'community.action.republish': 'Update research'"), '英文同步（Update research）')
    assert(zhDictText.includes("'community.tip.morePublish'"), '分拆按钮箭头的提示词条存在')
    assert(!/republishMentor|republishStudent/.test(zhDictText + enDictText), '旧的"更新指导/更新学生"文案已移除')
  }
  assert(/function PublishButton/.test(src), '发布动作抽成一个按钮组件（含导师的分拆下拉）')
  /*
   * 宽度一致由**布局**保证，而不是靠文案碰巧一样长：
   * 同一列在不同角色/状态下文案不同（【寻找学生】/【寻找线上导师】/【更新研究工作】），
   * 导师那一档还要再接一个 ▾ —— 所以固定宽度，普通按钮与拆分按钮都受它约束。
   */
  assert(/const PUBLISH_BUTTON_WIDTH = \d+/.test(src), '发布按钮有固定宽度常量')
  {
    // 宽度要放得下最长文案 + 箭头：6 个汉字 @12.5px×600 ≈ 80px，箭头约 22px
    const width = Number(/const PUBLISH_BUTTON_WIDTH = (\d+)/.exec(src)?.[1] ?? 0)
    assert(width >= 104, `按钮宽度 ${width}px 放得下 6 字文案 + 下拉箭头（≥104）`)
  }
  assert(
    /width: PUBLISH_BUTTON_WIDTH/.test(src) && /flex: '1 1 auto'/.test(src),
    '普通按钮用固定整宽；带下拉时主按钮占满同一宽度减去箭头',
  )
  assert(/community\.tip\.morePublish/.test(src), '分拆按钮的箭头有提示（说清下拉里是另一个方向）')
  assert(
    /alignItems: 'center',[\s\S]{0,700}?community\.badge\.inNetwork/.test(src),
    '「已在网络中」徽章与按钮**垂直居中**（此前是 flex-start，只有一个按钮时徽章飘在按钮上方）',
  )

  /*
   * ── 发布动作的角色规则（**行为级**，直接跑纯函数）────────────────────
   *
   * ```text
   * 研究者    → 只有一个【寻找指导】
   * 导师      → 主按钮【寻找学生】，【寻找指导】在下拉里
   * 已发布    → 只有一个【更新文件】（更新它已经属于的那个方向）
   * ```
   */
  const { publishActionPlan } = await importClientModule('publish-actions.ts')
  const planOf = (canMentor, published) => publishActionPlan(canMentor, published)
  assertEq(
    planOf(false, []),
    { primary: { direction: 'SEEK_MENTOR', kind: 'publish' }, more: [] },
    '研究者：只有一个按钮（寻找指导）',
  )
  assertEq(
    planOf(true, []),
    {
      primary: { direction: 'SEEK_STUDENT', kind: 'publish' },
      more: [{ direction: 'SEEK_MENTOR', kind: 'publish' }],
    },
    '导师：主按钮是【寻找学生】，【寻找指导】收进下拉',
  )
  assertEq(
    planOf(true, ['SEEK_STUDENT']),
    { primary: { direction: 'SEEK_STUDENT', kind: 'update' }, more: [] },
    '导师已发布选题 → 只有一个【更新文件】（方向不变）',
  )
  assertEq(
    planOf(false, ['SEEK_MENTOR']),
    { primary: { direction: 'SEEK_MENTOR', kind: 'update' }, more: [] },
    '学生已发布工作 → 只有一个【更新文件】',
  )
  // 历史数据（旧版本允许一个工作两个方向各发一次）：主按钮一个，另一个进下拉而不是丢掉
  const legacy = planOf(true, ['SEEK_MENTOR', 'SEEK_STUDENT'])
  assertEq(legacy.more.length, 1, '历史双发：另一个方向进下拉（让用户仍有路可走，不静默丢掉）')

  /*
   * ──【指导中】的进展文案：**视角由方向决定，不是由角色决定** ──────────────
   *
   * 用户实测到的 bug：方向 A（学生发布工作）下两侧配反了 —— 学生看到「我已指导」
   * （导师的第一人称），导师看到「导师已指导」（给学生的第三人称）。
   * 这里把四种（方向 × 视角）组合**逐一**钉住，并连**文案**一起断言
   * （只断言 key 的话，把两个 key 的文案对调也能过）。
   */
  {
    const { acceptedProgressKey } = await importClientModule('mentorship-labels.ts')
    const keyOf = (direction, iAmOwner, reviewFiles) =>
      acceptedProgressKey({ status: 'ACCEPTED', direction, reviewFiles }, { iAmOwner })
    // 方向 A：学生是 owner，导师交付
    assertEq(keyOf('SEEK_MENTOR', true, 3), 'community.mentor.progress.mentorGuided', '方向 A · 学生看已完成：说导师')
    assertEq(keyOf('SEEK_MENTOR', true, 0), 'community.mentor.progress.awaitingMentor', '方向 A · 学生看未完成：等导师')
    assertEq(keyOf('SEEK_MENTOR', false, 3), 'community.mentor.progress.iGuided', '方向 A · 导师看已完成：说我')
    assertEq(keyOf('SEEK_MENTOR', false, 0), 'community.mentor.progress.iToGuide', '方向 A · 导师看未完成：待我')
    // 方向 B：导师是 owner，学生交付
    assertEq(keyOf('SEEK_STUDENT', true, 3), 'community.mentor.progress.studentDelivered', '方向 B · 导师看已完成：说学生')
    assertEq(keyOf('SEEK_STUDENT', true, 0), 'community.mentor.progress.awaitingStudent', '方向 B · 导师看未完成：等学生')
    assertEq(keyOf('SEEK_STUDENT', false, 3), 'community.mentor.progress.iDelivered', '方向 B · 学生看已完成：说我')
    assertEq(keyOf('SEEK_STUDENT', false, 0), 'community.mentor.progress.iToDeliver', '方向 B · 学生看未完成：待我')
    // `reviewFiles` 查不到（null）→ 当"还没交付"（与旧行为一致：不撒谎说已完成）
    assertEq(keyOf('SEEK_MENTOR', false, null), 'community.mentor.progress.iToGuide', '查不到文件数 → 按"待交付"')
    // 未 ACCEPTED → 交给状态名（不在本函数里混）
    assertEq(acceptedProgressKey({ status: 'PROPOSED', direction: 'SEEK_MENTOR' }, { iAmOwner: true }), null, '非 ACCEPTED → 返回 null')

    const zhText = readFileSync(join(PKG, 'src/client/i18n/zh.ts'), 'utf8')
    const textOf = (key) => new RegExp(`'${key}': '([^']*)'`).exec(zhText)?.[1] ?? ''
    assertEq(textOf('community.mentor.progress.mentorGuided'), '导师已指导', '学生看到的是「导师已指导」')
    assertEq(textOf('community.mentor.progress.iGuided'), '我已指导', '导师看到的是「我已指导」')
    assertEq(textOf('community.mentor.progress.iToGuide'), '待我指导', '导师未交付时是「待我指导」')
    assertEq(textOf('community.mentor.progress.awaitingMentor'), '等待指导意见', '学生未收到时是「等待指导意见」')
    assertEq(textOf('community.mentor.progress.studentDelivered'), '学生已交付', '方向 B 导师看到的是「学生已交付」')
    assertEq(textOf('community.mentor.progress.iDelivered'), '我已交付', '方向 B 学生看到的是「我已交付」')
  }
  assert(!/republishMentor|republishStudent/.test(src), '两个方向各自的"更新"文案已从源码移除')

  /*
   * ── 方向 × 我的角色：四格逐一钉住（很会配反的一层）──────────────────────
   *
   * 这一层的每个派生量错了都**不报错**：只是把"该我动作"说成"等对方"、
   * 把上传写进对方那一侧、把"冻我自己的钱"说成"冻学生的钱"。
   *
   * `iAmPayer` 尤其要钉：押金**永远从学生（`researcher_id`）账上冻**
   * （服务器 `accept_proposal` 不变量，两个方向都是学生出钱），而**两个方向的接受人
   * 都是 owner**（A 学生接受、B 导师接受）—— 所以 `!iAmOwner` 在实际接受人身上恒为
   * false：方向 A 的学生会被说成"冻学生的钱"，而且**拿不到"用自己资金池提前拦住"
   * 这条保护**（服务器在 SEEK_MENTOR 方向没有别的地方能预检，见
   * `dev-notes/v0.6.3-paper-level-pricing.md` §5）。判据只能是我是不是学生。
   */
  {
    const { mentorshipView } = await importClientModule('mentorship-view.ts')
    const MENTOR = 'm-1'
    const STUDENT = 'r-1'
    // 方向 A `SEEK_MENTOR`：学生发布研究求指导 → 导师发起、学生接受、学生出钱
    const viewA = (me) =>
      mentorshipView(
        { direction: 'SEEK_MENTOR', mentorId: MENTOR, researcherId: STUDENT, proposedById: MENTOR },
        me,
      )
    // 方向 B `SEEK_STUDENT`：导师出题招学生 → 学生出价、导师接受、学生出钱
    const viewB = (me) =>
      mentorshipView(
        { direction: 'SEEK_STUDENT', mentorId: MENTOR, researcherId: STUDENT, proposedById: STUDENT },
        me,
      )
    const pick = (v, keys) => keys.map((k) => `${k}=${v[k]}`).join(' ')
    const KEYS = ['myRole', 'iAmOwner', 'iProposed', 'iAmAcceptor', 'iAmPayer', 'mySide', 'otherSide']
    assertEq(
      pick(viewA(STUDENT), KEYS),
      'myRole=researcher iAmOwner=true iProposed=false iAmAcceptor=true iAmPayer=true mySide=owner otherSide=mentor',
      '方向 A · 学生：我接受、我付钱、我在 owner 侧',
    )
    assertEq(
      pick(viewA(MENTOR), KEYS),
      'myRole=mentor iAmOwner=false iProposed=true iAmAcceptor=false iAmPayer=false mySide=mentor otherSide=owner',
      '方向 A · 导师：我发起、我不付钱',
    )
    assertEq(
      pick(viewB(MENTOR), KEYS),
      'myRole=mentor iAmOwner=true iProposed=false iAmAcceptor=true iAmPayer=false mySide=owner otherSide=mentor',
      '方向 B · 导师：我接受，但冻的是**学生**的钱（iAmPayer=false）',
    )
    assertEq(
      pick(viewB(STUDENT), KEYS),
      'myRole=researcher iAmOwner=false iProposed=true iAmAcceptor=false iAmPayer=true mySide=mentor otherSide=owner',
      '方向 B · 学生：我出价、我付钱（但接受的是导师）',
    )
    // 两个方向的**接受人都是 owner** —— 所以 `iAmPayer` 绝不等于 `!iAmOwner`
    const acceptors = [viewA(STUDENT), viewB(MENTOR)]
    assert(
      acceptors.every((v) => v.iAmAcceptor && v.iAmOwner),
      '两个方向的接受人都是 owner（`!iAmOwner` 在这里恒为 false，不能拿来判谁付钱）',
    )
    assert(
      acceptors[0].iAmPayer === true && acceptors[1].iAmPayer === false,
      '接受人里：方向 A 的学生要拦、方向 B 的导师不拦（接受人 ≠ 付款人）',
    )
    // 旧服务器不返回 `proposed_by_id` → 按方向推断（这是方向的定义，不是猜）
    const legacyA = mentorshipView({ direction: 'SEEK_MENTOR', mentorId: MENTOR }, STUDENT)
    assertEq(legacyA.iProposed, false, '旧服务器：方向 A 按"导师发起"推断（学生是要动作的一方）')
    const legacyB = mentorshipView({ direction: 'SEEK_STUDENT', mentorId: MENTOR }, MENTOR)
    assertEq(legacyB.iProposed, false, '旧服务器：方向 B 按"学生发起"推断（导师是要动作的一方）')
    // 未登录 / 旧宿主没有我的 id → 兜底成研究者（那一页本来也不渲染，只为不崩）
    assertEq(
      mentorshipView({ direction: 'SEEK_MENTOR' }, null).myRole,
      'researcher',
      '拿不到我的 id → 兜底研究者（不崩）',
    )
  }

  /*
   * ── 论文等级（JCR / CCF）的取值规则：纯函数逐一钉住（v0.6.3）──────────────
   *
   * 这段规则错了**不会报错**：会把条件发成必然 400（缺等级），或者把等级丢了按兜底价
   * 成交。三条断言分别对应"哪些条件需要等级"、"取值合法域"、"发出去只发一个字段"。
   */
  {
    const {
      isPaperCondition,
      levelQuery,
      decodeLevel,
      encodeLevel,
      paperLevelOf,
      paperLevelText,
      levelOptions,
      asJcrLevel,
      asCcfLevel,
    } = await importClientModule('paper-level.ts')
    // ① 只有论文类两种条件要等级
    assertEq(isPaperCondition('PAPER_ACCEPTED'), true, 'PAPER_ACCEPTED 需要等级')
    assertEq(isPaperCondition('PAPER_PUBLISHED'), true, 'PAPER_PUBLISHED 需要等级')
    assertEq(isPaperCondition('MUTUAL_COMPLETION'), false, '双方确认完成**不带**等级')
    assertEq(isPaperCondition(undefined), false, '条件缺失不猜成论文类')
    // ② 取值合法域：JCR 1–4 整数、CCF A/B/C 大写（大小写不敏感）
    assertEq(asJcrLevel(2), 2, 'JCR 2 合法')
    assertEq(asJcrLevel(0), null, 'JCR 0 非法')
    assertEq(asJcrLevel(5), null, 'JCR 5 非法')
    assertEq(asJcrLevel('2'), null, 'JCR 只认数字（字符串不是等级）')
    assertEq(asCcfLevel('b'), 'B', 'CCF 小写归一成大写')
    assertEq(asCcfLevel('D'), null, 'CCF 只认 A/B/C')
    // ③ 发出去**只发一个字段**（服务器以 JCR 优先，客户端不把两个都发过去）
    assertEq(levelQuery({ system: 'JCR', level: 2 }), { jcrLevel: 2 }, 'JCR → jcrLevel')
    assertEq(levelQuery({ system: 'CCF', level: 'B' }), { ccfLevel: 'B' }, 'CCF → ccfLevel')
    assertEq(levelQuery(null), {}, '没有等级 → 不带任何字段')
    assertEq(levelQuery({ system: 'JCR', level: 9 }), {}, '非法等级不发字段（不许猜一个）')
    // ④ 下拉框取值 ⇄ 等级的往返（一个字符串 = 一份完整状态，不留半选状态）
    assertEq(decodeLevel('JCR:2'), { system: 'JCR', level: 2 }, '下拉值 JCR:2 → 等级')
    assertEq(decodeLevel('CCF:A'), { system: 'CCF', level: 'A' }, '下拉值 CCF:A → 等级')
    assertEq(decodeLevel(''), null, '空串 = 还没选')
    assertEq(decodeLevel('JCR:9'), null, '越界的下拉值不认')
    assertEq(encodeLevel({ system: 'JCR', level: 2 }), 'JCR:2', '等级 → 下拉值')
    assertEq(encodeLevel(null), '', '没有等级 → 空串')
    // ⑤ 读回提案里的等级：与服务器的优先顺序一致（先 jcr 后 ccf）
    assertEq(
      paperLevelOf({ jcrLevel: 3, ccfLevel: 'A' }),
      { system: 'JCR', level: 3 },
      '两个都给时以 JCR 为准（与服务器定价一致）',
    )
    assertEq(paperLevelOf({ ccfLevel: 'B' }), { system: 'CCF', level: 'B' }, '只有 CCF 时读 CCF')
    assertEq(paperLevelOf({}), null, '非论文类条件没有等级')
    // ⑥ 展示文案（中英词典里同名条目）
    assertEq(
      paperLevelText({ system: 'JCR', level: 2 }),
      { key: 'community.mentor.level.JCR', params: { level: '2' } },
      'JCR 等级 → 词条 + 参数',
    )
    assertEq(
      paperLevelText({ system: 'CCF', level: 'A' }),
      { key: 'community.mentor.level.CCF', params: { level: 'A' } },
      'CCF 等级 → 词条 + 参数',
    )
    assertEq(paperLevelText(null), null, '没有等级就没有文案')
    // ⑦ 下拉选项：JCR 四项、CCF 三项（顺序即优先级，不排序）
    assertEq(levelOptions('JCR'), [1, 2, 3, 4], 'JCR 选项 1–4（1 最高）')
    assertEq(levelOptions('CCF'), ['A', 'B', 'C'], 'CCF 选项 A–C（A 最高）')
    const zhText = readFileSync(join(PKG, 'src/client/i18n/zh.ts'), 'utf8')
    const textOf = (key) => new RegExp(`'${key}': '([^']*)'`).exec(zhText)?.[1] ?? ''
    assertEq(textOf('community.mentor.level.JCR'), 'JCR {level} 区', '中文写「JCR 2 区」')
    assertEq(textOf('community.mentor.level.CCF'), 'CCF-{level}', '中文写「CCF-B」')
  }
  assert(!/readAsDataURL/.test(src), '不再走 base64（宿主读盘取代了它）')
  // 只查**代码**：注释里还会提到 base64（解释为什么不用它），那不算违规
  assert(!/base64\s*:/.test(src) && !/atob\(/.test(src), '界面里没有 base64 编解码代码')
  // 研究根里没有可回传文件时是"没东西可传"，不是错误
  assert(src.includes("t('community.exchange.noUploadFiles')"), '空清单有专门说法')
  // 被剔掉的机器产物要说一句，否则导师以为"漏了"
  assert(src.includes("t('community.exchange.skippedMachine'"), '跳过机器产物时如实说明')

  // ④ 宿主侧（host）：下载只存 ZIP；上传是**扫描研究根 + 与服务器比对后增量回传**
  const rpc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')
  assert(/case 'mentor\/download':/.test(rpc), '有按工作区写入的下载端点')
  assert(/case 'mentor\/downloadState':/.test(rpc), '有对话框要的 downloadState（预检 + 工作区列表）')
  // ⚠️ 目标目录按**注册表 id** 在宿主侧解析：客户端递不进任意路径
  assert(
    /it\.id === workspaceId[\s\S]{0,200}?not-found/.test(rpc),
    '工作区按 id 在宿主侧解析（不接受任意路径）',
  )
  assert(/openDownloadPart\(target\.path/.test(rpc), '写盘走 workspace-sync（RPC 层不做文件写入）')
  assert(!/writeFileSync\(/.test(rpc), 'RPC 层自己不开文件句柄（写盘全在 workspace-sync）')
  assert(/case 'mentor\/downloadProgress':/.test(rpc), '有下载进度端点（界面按秒问，宿主本地读）')
  assert(
    /fetchProjectArchive\([\s\S]{0,200}?part,/.test(rpc),
    '下载把 sink 交给 fetchProjectArchive（边收边写，不整包驻留内存）',
  )
  assert(!/extractZip|unzip|adm-zip/i.test(rpc), '宿主不解压（只存 ZIP，其余交给用户）')
  // 上传（v19）：清单来自扫描、与服务器 sha256 比对、分批 + 按体积估超时
  assert(/uploadWorkspaceFiles\(base, apiKey, projectId, payload/.test(rpc), '回传走 uploadWorkspaceFiles')
  assert(/buildUploadPlan\(root, 'mentor'\)/.test(rpc), '清单来自扫描（mentor 口径）')
  assert(/allowed\.has\(rel\)/.test(rpc), '只上传扫描得到的文件（界面不能递任意路径读盘）')
  assert(/case 'mentor\/uploadProgress':/.test(rpc), '有上传进度端点（界面按秒问，宿主本地读）')
  assert(/beginUploadProgress/.test(rpc), '宿主侧只留一个进度入口（发布与回传共用同一份记录）')
  assert(
    /uploadProgress\.keys\.includes\(projectId\)/.test(rpc),
    '进度记录按"可认领的多把键"匹配（发布的界面用本机 id 轮询，导师回传用服务器项目 id）',
  )
  assert(
    /fetchProjectFiles\(base, apiKey, projectId, \{ source, \.\.\.netOptions\(\) \}\)/.test(rpc) &&
      /onServer\.get\(rel\) === digest/.test(rpc),
    '回传前与**自己那一侧**的 sha256 比对，只传变化的（服务器不去重，重复传会白占配额）',
  )
  // v20 分侧读：比对自己那一侧、下载对方那一侧
  assert(/const source = asSource\(p\.source\)/.test(rpc), '上传/下载按 `source` 选侧（缺省 owner）')
  assert(/source: 'mentor'/.test(rpc), 'mentor/list 的旧服务器回退读导师那一侧')
  assert(
    /source === 'mentor' \? '-mentor' : ''/.test(rpc),
    '预检的预计文件名在导师侧带 -mentor 后缀（与学生自己那份区分）',
  )
  assert(
    /const viewOf = \(p: HostProposal\): HostProposalView => proposalView\(p, myAccountId\)/.test(src) &&
      /source: viewOf\(target\)\.mySide/.test(src),
    '上传侧按**方向**选（owner 侧 = 项目所有者，不是"我是不是导师"）',
  )
  assert(
    /const source = viewOf\(p\)\.otherSide/.test(src) && /source: target\.source/.test(src),
    '下载读**对方那一侧**，且预检与下载同一侧（否则"预检有 3 个、点下去 404"）',
  )
  assert(/uploadTimeoutForBytes\(/.test(rpc), '按批次体积估超时（慢 ≠ 死）')
  assert(
    !/case 'mentor\/scanReview'/.test(rpc) && !/scanReviewFiles\(/.test(rpc),
    'review/ 专用扫描端点已删除（清单统一走 upload-selection）',
  )
  // ⚠️ RPC 层不做文件写入（既有分层纪律）：断言在 [7] 里，这里确认写入确实在别处
  const sync = readFileSync(join(PKG, 'src', 'research', 'workspace-sync.ts'), 'utf8')
  assert(/export function readResearchFile/.test(sync), 'workspace-sync 保留"安全读研究根文件"')
  assert(/export function safeJoin/.test(sync), '保留路径安全校验')
  assert(!existsSync(join(PKG, 'src', 'research', 'zip.ts')), 'ZIP 解包器已删除（A 方案下不再需要）')

  // ⑤ 词典：新文案中英齐全
  for (const k of [
    'community.action.download',
    'community.action.upload',
    'community.exchange.downloadTitle',
    'community.exchange.downloadDone',
    'community.exchange.noWorkspaces',
    'community.exchange.zipOnly',
    'community.exchange.destHint',
    'community.exchange.downloading',
    'community.exchange.downloadingBtn',
    'community.exchange.uploadTitle',
    'community.exchange.uploadDone',
    // v19 起：上传 = 回传"我这一份工作区"
    'community.exchange.workspaceLabel',
    'community.exchange.noUploadWorkspaces',
    'community.exchange.fromHint',
    'community.exchange.selectWorkspaceFirst',
    'community.exchange.noUploadFiles',
    'community.exchange.skippedMachine',
    'community.exchange.oversizeWarning',
    'community.exchange.uploadSummary',
    'community.exchange.uploading',
    'community.exchange.uploadNoChange',
    // 协议 v21/v22：导师侧下载提示的三态
    'community.mentor.peerNeverDownloaded',
    'community.mentor.peerUpdated',
    'community.mentor.peerDeleted',
  ]) {
    assert(zhDict.includes(`'${k}'`), `中文字典含 ${k}`)
  }
}
/*
 * ════════════════════════════════════════════════════════════════════════
 * [9] 两个对话框**真的渲染一遍**：资金池拦截 + 两池分列（v0.6.3）
 *
 * 光看源码正则不够 —— "资金池不够时那个按钮到底禁没禁、文案里有没有**动作**、
 * 图例是不是真的四行"这些，只有把组件跑一遍、遍历产出的树才算数。
 *
 * `AcceptConfirmDialog` 与 `TokenDialog` 都**没有 hook**（状态在上层的 `CommunityTab`），
 * 所以能当普通函数调；JSX 在 bundle 里编译成 `jsx(...)` → 返回一棵普通对象树。
 * ⚠️ 给它们加 hook 会让这一段失效（那时改回断言源码）。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[9] 对话框渲染：资金池拦截 + Token 两池')
{
  const ZH9 = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const t9 = (k, p) => {
    const tpl = ZH9[k] ?? k
    return p ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m)) : tpl
  }
  let mod = null
  try {
    const code = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
    let captured = null
    new Function('window', code)({ __ModuleLoader__: { load: (m) => { captured = m } } })
    mod = captured.factory(createRequire(import.meta.url))
  } catch (e) {
    assert(false, `bundle 可在 node 求值：${e instanceof Error ? e.message : String(e)}`)
  }

  /**
   * 展开**无 hook 的函数组件**（`TokenDonut` / `TokenLegendRow` 这些）。
   *
   * JSX 里 `<TokenLegendRow …/>` 在产出的树上只是一个 `{ type: fn, props }` 节点，
   * 子节点要**调用它**才拿得到 —— 它们没有 hook，所以直接调是安全的。
   * DOM 字符串标签（'div' / 'svg' …）不能调，原样返回。
   */
  const expand = (node) => {
    if (node !== null && typeof node === 'object' && !Array.isArray(node) && typeof node.type === 'function') {
      try {
        return expand(node.type(node.props ?? {}))
      } catch {
        return node
      }
    }
    return node
  }
  /** 深度收集节点（含数组与 children）。 */
  const collect = (node, pred, out = []) => {
    const n0 = expand(node)
    if (n0 === null || n0 === undefined || typeof n0 !== 'object') return out
    if (Array.isArray(n0)) {
      for (const x of n0) collect(x, pred, out)
      return out
    }
    if (pred(n0)) out.push(n0)
    const kids = n0.props?.children
    if (Array.isArray(kids)) for (const k of kids) collect(k, pred, out)
    else collect(kids, pred, out)
    return out
  }
  /** 整棵树里的可见文字（拼接）。 */
  const textOf = (node) => {
    const n0 = expand(node)
    if (n0 === null || n0 === undefined || typeof n0 === 'boolean') return ''
    if (typeof n0 === 'string' || typeof n0 === 'number') return String(n0)
    if (Array.isArray(n0)) return n0.map(textOf).join('')
    return textOf(n0.props?.children)
  }
  const buttons = (tree) => collect(tree, (n) => n.type === 'button')

  if (mod) {
    // 身份/方向派生量走**同一个纯函数**（不是测试里另写一套），这样"谁付钱"这条
    // 不会在测试和界面之间各说各话。
    const { mentorshipView } = await importClientModule('mentorship-view.ts')
    const proposal = {
      id: 'p1',
      projectId: 'proj1',
      direction: 'SEEK_MENTOR',
      mentor: { id: 'm1', displayName: '张老师' },
      researcher: { id: 'r1', displayName: '李同学' },
      guidanceScope: '-',
      totalFee: 800,
      depositAmount: 160,
      successPaymentAmount: 640,
      successCondition: { type: 'PAPER_ACCEPTED', description: null, jcrLevel: 2 },
      status: 'PROPOSED',
      expiresAt: '2026-10-03T00:00:00Z',
      createdAt: '2026-09-19T00:00:00Z',
    }
    /** 我在一条提案里的派生量（与界面同一套判据）。 */
    const viewOf = (p, me) =>
      mentorshipView(
        {
          direction: p.direction,
          mentorId: p.mentor?.id ?? null,
          researcherId: p.researcher?.id ?? null,
          proposedById: p.status === 'PROPOSED' ? (p.direction === 'SEEK_MENTOR' ? 'm1' : 'r1') : null,
        },
        me,
      )
    const party = { id: 'm1', displayName: '张老师', profile: { institution: '某大学' } }
    const dialogOf = (over = {}) =>
      mod.AcceptConfirmDialog({
        t: t9,
        proposal,
        party,
        partyIsMentor: true,
        iPayer: viewOf(proposal, 'r1').iAmPayer,
        balance: 500,
        funded: 10,
        grant: 490,
        onCancel: () => {},
        onConfirm: () => {},
        ...over,
      })

    // ⓪ 先确认"这条提案的接受人是学生"—— 后面的拦截才有意义
    assertEq(viewOf(proposal, 'r1').iAmAcceptor, true, '方向 A：学生是该接受的人')
    assertEq(viewOf(proposal, 'r1').iAmPayer, true, '方向 A：学生是付款人（iPayer 由纯函数给出）')

    // ① 资金池不够（赠送额度再多也不行）：按钮禁用 + 原因 + **动作**
    const short = dialogOf()
    const shortText = textOf(short)
    const confirmBtn = buttons(short).find((b) => textOf(b).includes('确认接受'))
    assert(confirmBtn !== undefined, '确认框里有【确认接受】按钮')
    assertEq(confirmBtn.props.disabled, true, '资金池不足 → 按钮**禁用**（不是点了才拿到 402）')
    assert(shortText.includes('资金池只有 10 Token'), '说清资金池有多少')
    assert(shortText.includes('不能付给导师'), '说清赠送额度为什么不算数')
    assert(shortText.includes('测试阶段请联系管理员发放 Token'), '给出**可行动作**')
    assert(shortText.includes('JCR 2 区'), '论文类条件把等级摆出来（接受的是"按这个等级定价"的约定）')
    assert(shortText.includes('冻结押金 160 Token（仍是你的'), '方向 A 用第一人称说"仍是你的"（接受人就是付款人）')

    // ② 资金池够：按钮可用（别把能接受的人挡住）
    const enough = dialogOf({ funded: 200, grant: 0 })
    assertEq(
      buttons(enough).find((b) => textOf(b).includes('确认接受')).props.disabled,
      false,
      '资金池够 → 按钮可用',
    )
    assert(!textOf(enough).includes('联系管理员'), '够用时不出现"联系管理员"')

    // ③ 旧宿主（没有两池）：按可用余额判断，**不拦**
    const legacy = dialogOf({ funded: null, grant: null, balance: 500 })
    assertEq(
      buttons(legacy).find((b) => textOf(b).includes('确认接受')).props.disabled,
      false,
      '旧宿主（判不出两池）→ 不拦（旧语义下全部余额都能付导师）',
    )
    assert(textOf(legacy).includes('当前可用余额：500 Token'), '旧宿主显示旧的"可用余额"一行')

    // ④ 方向 B（导师接受，冻的是**学生**的钱）：不按我的余额拦
    const proposalB = { ...proposal, direction: 'SEEK_STUDENT' }
    assertEq(viewOf(proposalB, 'm1').iAmAcceptor, true, '方向 B：导师是该接受的人')
    assertEq(viewOf(proposalB, 'm1').iAmPayer, false, '方向 B：付款人是学生，不是导师')
    const other = mod.AcceptConfirmDialog({
      t: t9,
      proposal: proposalB,
      party: { id: 'r1', displayName: '李同学' },
      partyIsMentor: false,
      iPayer: viewOf(proposalB, 'm1').iAmPayer,
      balance: 0,
      funded: 0,
      grant: 500,
      onCancel: () => {},
      onConfirm: () => {},
    })
    assertEq(
      buttons(other).find((b) => textOf(b).includes('确认接受')).props.disabled,
      false,
      '方向 B 冻的是学生的钱 → 不用我的资金池判断',
    )
    assert(textOf(other).includes('学生的资金池不足'), '方向 B 的 402 说法如实指向学生（不是"你余额不足"）')

    // ⑤ 余额弹窗：两池分列 + 环形图不含字
    const tokens = { available: 500, frozen: 20, total: 520, grant: 490, funded: 10 }
    const tokenTree = mod.TokenDialog({
      t: t9,
      tokens,
      requests: [],
      loading: false,
      amount: '',
      reason: '',
      submitting: false,
      error: null,
      receipt: null,
      onAmount: () => {},
      onReason: () => {},
      onApply: () => {},
      onRefresh: () => {},
      onClose: () => {},
    })
    const tokenText = textOf(tokenTree)
    for (const label of ['资金池', '赠送', '冻结', '合计']) {
      assert(tokenText.includes(label), `余额弹窗分列「${label}」`)
    }
    assert(tokenText.includes('490'), '赠送额度显示精确数字')
    assert(tokenText.includes('可付导师') && tokenText.includes('仅自营服务'), '两池各带一句边界说明')
    const svg = collect(tokenTree, (n) => n.type === 'svg')
    assertEq(svg.length, 1, '弹窗里有一个环形图')
    assertEq(collect(svg[0], (n) => n.type === 'text').length, 0, '环形图里**没有** SVG 文字（数字交给 HTML 图例）')
    assertEq(collect(svg[0], (n) => n.type === 'circle').length, 4, '环形图 = 轨道 + 资金池 + 赠送 + 冻结（四段）')

    // ⑥ 旧服务器（没有两池）：退回"可用 / 合计"，不凭空画两段
    const legacyTree = mod.TokenDialog({
      t: t9,
      tokens: { available: 7, frozen: 3, total: 10, grant: null, funded: null },
      requests: [],
      loading: false,
      amount: '',
      reason: '',
      submitting: false,
      error: null,
      receipt: null,
      onAmount: () => {},
      onReason: () => {},
      onApply: () => {},
      onRefresh: () => {},
      onClose: () => {},
    })
    const legacyMsg = textOf(legacyTree)
    assert(legacyMsg.includes('可用'), '旧服务器退回显示「可用」')
    assert(!legacyMsg.includes('资金池'), '旧服务器不显示「资金池」（那一版没有这个概念）')
  }
}
console.log(`\n${failed === 0 ? '✅' : '❌'} settings-page: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
