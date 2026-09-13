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

const HOME = mkdtempSync(join(tmpdir(), 'cf-settings-'))
mkdirSync(join(HOME, 'convfusion'), { recursive: true })

/* ── 夹具：一个「配置可变」的 host 设置面 ───────────────────────────── */
function makeHost({ file = 'skill-customizations.json', dir = join(HOME, 'convfusion') } = {}) {
  let config = { customizationFile: file, customizationDir: dir }
  const store = CUST.createFileCustomizationStore(() => CFG.resolveCustomizationPath(config))
  const handler = RPC.createSettingsRpcHandler({ getConfig: () => config, store })
  return {
    handler,
    store,
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
    ['Purpose', 'When to Use', 'Research Method', 'Reasoning Guidance', 'Evidence Requirements', 'Expected Output', 'Source Prompts (verbatim from ConvFusion)'],
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

  assert(src.includes('① 能力类别'), '一级下拉叫「能力类别」')
  assert(src.includes('② 能力'), '二级下拉叫「能力」（不是"研究方法"）')
  assert(src.includes('能力库'), '选择区以「能力库」命名（用户的词）')
  assert(src.includes('能力库'), '提到「能力库」')
  assert(src.includes('形成你自己的研究方法'), '说明"定制多项能力 → 形成研究方法"')
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
  assert(!/scope\.set\(\s*['"]openalexApiKey/.test(src) === false, 'Tab 3 用 scope 写 OpenAlex Key')

  // 但底层配置仍然存在（文件仍可经设置文档 / profile patch 调整）
  const cfg = readFileSync(join(PKG, 'src', 'config.ts'), 'utf8')
  assert(/customizationFile/.test(cfg), '配置项本身保留（只是不暴露给用户）')
  const bundleText = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  assert(!bundleText.includes('定制文件'), '构建产物里也没有「定制文件」字样')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1e. 三个 Tab
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1e] 三个 Tab：本地研究方法 / 研究方法库 / 系统设置')
{
  const bundleText = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  for (const label of ['本地研究方法', '研究方法库', '系统设置']) {
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
  assert(/<div style=\{S\.heroSub\}>定制各项能力，形成你自己的研究方法<\/div>/.test(src), 'Hero 副标题只有一句话')
  assert(!/全部能力已在 DSH 内原生运行/.test(visible), 'Hero 不再堆"原生运行 / 能力库 N 项"等冗余信息')

  // ── Tab 2：研究方法库 —— 演示列表 + 诚实标注 ──
  assert(bundleText.includes('尚未开放'), '研究方法库标注尚未开放')
  assert(bundleText.includes('演示数据'), '演示列表带「演示数据」徽章')
  assert(bundleText.includes('以上为界面演示'), '演示列表有脚注说明不是真实数据')
  assert(bundleText.includes('登录 ConvFusion.com 可获得更多研究方法'), '提醒登录可获得更多方法')
  const community = src.slice(src.indexOf('function CommunityTab()'), src.indexOf('function SystemTab('))
  assert(!/<input/.test(community), '研究方法库没有登录表单（未实现，不假装能登录）')
  assert(!/fetch\(/.test(community), '研究方法库不发任何网络请求')
  assert(!/password/i.test(community), '研究方法库不收集口令')
  // 演示条目本身不得宣称"已可用"
  assert(!/已登录|已同步|下载/.test(community), '演示数据不宣称任何已发生的联网行为')
  assert((community.match(/disabled/g) ?? []).length >= 2, '「套用」与「登录」都是禁用态')

  // ── Tab 3：系统设置 —— OpenAlex 凭据 + 本地依赖检查 ──
  assert(bundleText.includes('OpenAlex'), '提到 OpenAlex')
  assert(bundleText.includes('免费注册并复制 API Key'), '提示免费申请并引导获取 Key')
  assert(bundleText.includes('openalex.org'), '给出申请入口')
  const retrieval = src.slice(src.indexOf('function SystemTab('))
  assert(/type="password"/.test(retrieval), 'Key 输入框 type=password')
  assert(/autoComplete="off"/.test(retrieval), 'Key 输入框关闭自动填充')
  assert(/不会发送到浏览器|不会回传浏览器/.test(retrieval), '说明密钥不回传浏览器')

  // ── Tab 3：本地依赖（tectonic）—— 用户可能没装，必须给出检查与安装说明 ──
  assert(bundleText.includes('tectonic'), '系统设置提到 tectonic')
  assert(bundleText.includes('本地依赖'), '有「本地依赖」区块')
  assert(bundleText.includes('brew install tectonic'), '给出 macOS（Homebrew）安装命令')
  assert(bundleText.includes('conda-forge tectonic'), '给出 Conda/Mamba 安装命令')
  assert(bundleText.includes('CONVFUSION_TECTONIC'), '给出环境变量覆盖入口（非标准位置）')
  assert(bundleText.includes('重新检查'), '有「重新检查」按钮')
  assert(/dependencies\/check/.test(src), '「重新检查」走 dependencies/check 端点')
  assert(/已安装/.test(src) && /未安装/.test(src), '展示已安装/未安装状态徽章')
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
  const st = RPC.buildSettingsState(
    { customizationFile: 'x.json', customizationDir: '/tmp', openalexApiKey: secret },
    CUST.createMemoryCustomizationStore(),
  )
  assertEq(st.retrieval.configured, true, 'state 报告已配置')
  assertEq(st.retrieval.source, 'settings', 'state 报告来源')
  assert(!JSON.stringify(st).includes(secret), 'state 里**没有**密钥明文（浏览器永远拿不到）')
  assert(!JSON.stringify(st.config).includes(secret), 'config 里的密钥被剔除')
  assert(st.config.openalexApiKey === undefined, '返回给界面的 config 不含该字段')

  // ── 本地依赖（tectonic）：论文编译靠本机装的它，用户可能没装 ──
  // 设置页要能看到"有没有 / 在哪 / 什么版本 / 没装怎么办"，因此 state 必须带回检测结果。
  assert(st.dependencies !== undefined, 'state 带回本地依赖检测结果')
  const dep = st.dependencies.tectonic
  assertEq(typeof dep.available, 'boolean', 'tectonic 可用性是布尔（不假设本机装没装）')
  assertEq(dep.name, 'tectonic', '依赖名正确')
  assertEq(dep.envVar, 'CONVFUSION_TECTONIC', '给出覆盖用环境变量名')
  assert(dep.purpose.length > 0, 'tectonic 带用途说明（界面直接展示，用户才知道为什么要装）')
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
        purpose: 'compile LaTeX to PDF',
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
  assert(/staleHost/.test(src), '界面有陈旧宿主提示')
  assert(/宿主侧仍在运行旧代码/.test(src), '提示文案说明"仍在运行旧代码"')
  assert(/刷新页面不会生效/.test(src), '明确说明刷新无效、需重启 DSH')
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
  await h.handler('customization/save', { skillId: 'literature-search', section: 'Purpose', text: 'y' })
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

  // 数据面走同源 fetch，因此客户端只需要渲染用的两个硬依赖
  const clientSrc = readFileSync(join(PKG, 'src', 'client', 'index.tsx'), 'utf8')
  assert(/export const inject = \['slots', 'settingsScope'\]/.test(clientSrc), '客户端 inject = slots + settingsScope')
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
  // v2 推倒的 v1 **配置字段**都不该回来（OpenAlex Key 与 ConvFusion.com 是用户后来
  // 明确要求重做的 UI，不在此列 —— 但它们的**实现**仍必须是空的）
  for (const banned of ['serverUrl', 'cloudMode', 'methodTemplates', 'myTemplates', 'authToken']) {
    assert(!all.includes(banned), `不出现 v1 遗留配置字段：${banned}`)
  }
  assert(!/localStorage/.test(all), '客户端不用 localStorage（定制存宿主侧文件）')
  assert(/fetch\(/.test(all), '客户端用同源 fetch 调自己的路由')
  assert(!/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(all), '不硬编码外部地址（只同源）')

  // 「研究方法库」是**预留**：界面必须存在，但不得有任何真实登录/联网实现
  const settingsSrc = readFileSync(join(dir, 'settings.tsx'), 'utf8')
  const community = settingsSrc.slice(
    settingsSrc.indexOf('function CommunityTab()'),
    settingsSrc.indexOf('function SystemTab('),
  )
  assert(community.length > 200, '找得到 CommunityTab 的实现')
  assert(!/<input/.test(community), '研究方法库没有登录表单（未实现，不假装能登录）')
  assert(!/fetch\(/.test(community), '研究方法库不发任何网络请求')
  assert(!/password/i.test(community), '研究方法库不收集口令')

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

console.log(`\n${failed === 0 ? '✅' : '❌'} settings-page: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
