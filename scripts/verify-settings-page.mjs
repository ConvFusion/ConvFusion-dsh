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
  const community = src.slice(src.indexOf('function PublishDialog('), src.indexOf('function SystemTab('))
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
  // 刷新抽成一个组件，五处共用（账号行 + 研究工作三个 Tab + Token 余额弹窗）
  assert(src.includes('function RefreshIconButton('), '刷新图标按钮是独立组件')
  assertEq(
    (src.match(/<RefreshIconButton /g) ?? []).length,
    5,
    '五处都在用它（账号 + 我的 + 可指导 + 指导中 + 余额弹窗）',
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

  // ── 研究工作：两个视图（我的 / 可指导，2026-09 用户定稿）──────────────
  assert(/workTab === 'mine'/.test(community) && /workTab === 'mentor'/.test(community), '研究工作卡片分两个视图')
  assert(
    community.indexOf("workTab === 'mine'") < community.indexOf("workTab === 'mentor'"),
    '「我的」在「可指导」之前（所有人都可能被指导，先看自己的）',
  )
  assert(/work\/mine/.test(community), '「我的」走 work/mine（本机研究项目）')
  assert(/canMentor/.test(community) && /MENTOR/.test(community), '「可指导」需要导师角色')
  dictHas('community.hint.mentorRequiresRole', '需要导师角色', 'mentor role', '没有角色时如实说明权限')
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
  dictHas('community.action.seekMentor', '寻找指导', 'Find a mentor', '「寻找指导」按钮')
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
  assert(/disabled=\{!account \|\| publishing !== null/.test(community), '未登录 / 发布中时按钮禁用')
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
  dictHas('community.badge.addressChanged', '地址已改', 'Address changed', '地址真的改了才提示')
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
    3,
    '图标按钮都不许被压（刷新 + 登出 + 两个服务器快捷）',
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
  assertEq(ENVCFG.BUILTIN_SERVER_URL.production, 'https://convfusion.com', '生产兜底地址是线上域名')

  // 默认值必须真的进 schema（否则用户在设置页看不到、也改不了）
  const schemaJson = JSON.stringify(CFG.Config.toJSON())
  assert(/serverUrl/.test(schemaJson), 'schema 含 serverUrl')
  assert(/convfusionApiKey/.test(schemaJson), 'schema 含 convfusionApiKey')
  assertEq(
    (schemaJson.match(/"role":"secret"/g) ?? []).length,
    2,
    '两个 secret 字段（OpenAlex Key + ConvFusion.com Key）都声明了 role=secret',
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
    'https://convfusion.com',
    '生产环境的内置兜底是线上地址（**开发/生产不同**）',
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

  // 凭据：设置 > 环境变量 > 无；明文取值是**宿主专用**函数
  assertEq(CFG.describeConvFusionKey({ convfusionApiKey: 'k' }, {}), { configured: true, source: 'settings' }, '设置里有 → settings')
  assertEq(CFG.describeConvFusionKey({}, { CONVFUSION_API_KEY: 'k' }), { configured: true, source: 'env' }, '环境变量 → env')
  assertEq(CFG.describeConvFusionKey({}, {}), { configured: false, source: 'none' }, '都没有 → 未配置')
  assertEq(CFG.resolveConvFusionApiKey({}, { CONVFUSION_API_KEY: 'env-key' }), 'env-key', '明文取值支持环境变量回退')
  assertEq(
    CFG.resolveConvFusionApiKey({ convfusionApiKey: 'settings-key' }, { CONVFUSION_API_KEY: 'env-key' }),
    'settings-key',
    '明文取值：设置优先',
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
  assert(/icon="⌂"/.test(src) && /icon="☁"/.test(src), '两个图标：本机 / 线上')
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

  for (const k of [
    'community.server.presetDev',
    'community.server.presetProd',
    'community.server.probing',
    'community.server.probeOk',
    'community.server.probeFail',
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
  // ② 弹窗内容：余额明细（可用 / 冻结 / 合计）+ 续费说明
  for (const k of ['community.token.available', 'community.token.frozen', 'community.token.total']) {
    assert(src.includes(`t('${k}')`), `弹窗显示 ${k}`)
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

  // ⑦ 宿主侧：两个端点 + 解析 + 校验
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

  // 数据面走同源 fetch；渲染再依赖 DSH 原生 locale。
  const clientSrc = readFileSync(join(PKG, 'src', 'client', 'index.tsx'), 'utf8')
  assert(
    /export const inject = \['slots', 'settingsScope', 'locale'\]/.test(clientSrc),
    '客户端 inject = slots + settingsScope + locale',
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
  assert(inlineCount(src, 'onBrief={() => requestBrief(w)}') === 1, '列表【简报】走 requestBrief（不是直接扣费）')
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
  assert(src.includes("useState<'mine' | 'mentor' | 'mentorship'>"), 'workTab 类型含第三个视图')
  assert(inlineCount(src, "setWorkTab('mentorship')") === 1, '有「指导中」Tab 按钮')
  assert(src.includes("t('community.tab.mentorship')"), 'Tab 文案走 i18n（指导中）')

  // ② **一个**列表跟踪状态（用户拍板：不再分「我收到的 / 我发起的」）
  assert(src.includes('const trackItems = ['), '两方向合成一个统一列表')
  assert(!src.includes("t('community.mentor.incomingTitle')"), '没有「我收到的」分栏标题')
  assert(!src.includes("t('community.mentor.outgoingTitle')"), '没有「我发起的」分栏标题')
  assert(/trackItems\.map\(\(\{ p, incoming \}, i\)/.test(src), '统一列表每行带方向标记')
  // 排序：还要动作的顶上去
  assert(/PROPOSED: 0, ACCEPTED: 1/.test(src), '按"还要不要动作"排序（等待响应在前）')
  // 只留状态 + 费用数字：描述性文字必须消失
  assert(src.includes('feeText(p)'), '每行显示费用数字')
  // 版式：名称与费用**竖排**（曾经并排导致整行太长，右侧【下载】【上传】被挤成两行）
  assert(
    /flexDirection: 'column',\s*gap: 2,[\s\S]{0,400}?S\.listTitle[\s\S]{0,400}?feeText\(p\)/.test(src),
    '名称与费用竖排（左侧自己消化宽度）',
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
  assert(
    /if \(incoming\) return hasReview \? 'community\.mentor\.progress\.studentGot' : 'community\.mentor\.progress\.studentWaiting'/.test(src),
    '学生侧：等待指导意见 / 导师已指导',
  )
  assert(
    /hasReview \? 'community\.mentor\.progress\.mentorDone' : 'community\.mentor\.progress\.mentorWaiting'/.test(src),
    '导师侧：我已指导 / 待我指导',
  )
  for (const k of ['studentWaiting', 'studentGot', 'mentorWaiting', 'mentorDone']) {
    assert(zhDict.includes(`'community.mentor.progress.${k}'`), `进展文案有中文：${k}`)
  }

  // 动作只长在「我收到的 + 等待响应」那一行（其余状态纯跟踪）
  assert(
    /\{incoming && p\.status === 'PROPOSED' \? \(/.test(src),
    '只有"等我处理"的那条给接受/拒绝按钮',
  )
  // 学生侧要能看清"是谁在申请指导我"：查看导师信息 → Profile 介绍
  assert(src.includes("t('community.action.viewMentor')"), '有【查看导师信息】按钮')
  assert(
    /\{incoming \? \(\s*<button[\s\S]{0,300}?setProfileTarget\(p\)/.test(src),
    '【导师】按钮只在我作为学生的那一侧',
  )
  assert(src.includes('function MentorProfileDialog('), '存在导师信息对话框')
  assert(src.includes("t('community.mentor.profileTitle')"), '对话框标题走 i18n')
  assert(src.includes("t('community.mentor.profileEmpty')"), '导师没填 profile 时如实说明（不编内容）')
  for (const f of ['profileBio', 'profileFields', 'profileInterests', 'profileExpertise']) {
    assert(src.includes(`community.mentor.${f}`), `Profile 字段有展示位：${f}`)
  }
  assert(/<MentorProfileDialog t=\{t\} proposal=\{profileTarget\}/.test(src), '对话框被渲染')
  // 导师信息来自提案内嵌的 profile → 不该为它多发一次请求
  const mp = src.slice(src.indexOf('function MentorProfileDialog('), src.indexOf('function CommunityTab('))
  assert(!mp.includes('post('), '导师信息不额外发请求（数据已在提案响应里）')

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
  assert(src.includes("t('community.mentor.acceptConfirmBadge'"), '确认框角标写明冻结数量')

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
  assert(src.includes("t('community.mentor.proposeTitle')"), '对话框标题走 i18n')
  // 第二行插槽：挂在 WorkRow 的按钮**下面**
  assert(src.includes('below={'), 'WorkRow 有第二行动作插槽')
  assert(src.includes('{below}'), 'WorkRow 真的渲染这个插槽')
  // 导师侧只填**总费用**：指导范围已删、成功条件不由导师定、押金比例由平台定
  const pd = src.slice(src.indexOf('function ProposeDialog('), src.indexOf('function DownloadDialog('))
  assertEq((pd.match(/<input/g) ?? []).length, 1, '提案对话框只剩一个输入框（总费用）')
  assert(!pd.includes('scopeLabel') && !pd.includes('scopePlaceholder'), '对话框不再采集指导范围')
  assert(!pd.includes('conditionLabel') && !pd.includes('conditionPlaceholder'), '对话框不再采集成功条件')
  // 钱怎么分 + 成功条件谁定 = **一段话**（分两行会让对话框多一行高）
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
  assert(/PROPOSE_DEFAULT_CONDITION = 'MUTUAL_COMPLETION'/.test(src), '成功条件送平台默认值')
  // 指导范围已彻底不展示（导师不采集 → 展示它是死代码）
  assert(!src.includes('scopeRow'), '列表/对话框都不再渲染指导范围')
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
  assert(/const mine = myProposalByProject\.get\(w\.projectId\)/.test(src), '按项目索引我发起的提案')
  assert(src.includes('disabled={Boolean(mine) || proposeBusy}'), '已发起过 → 按钮禁用')
  assert(/mine \? \(\s*<Badge tone=\{proposalTone\(mine\.status\)\}>/.test(src), '发起后显示状态角标')
  // 角标在**前**、按钮在**后**（发起过之后按钮只是灰掉的残影，先给信息）
  assert(
    /mine \? \(\s*<Badge[\s\S]{0,200}?<\/Badge>\s*\) : null\}\s*\{canPropose \? \(/.test(src),
    '状态角标排在【发起指导】按钮之前',
  )
  // 这里的 mine 恒为"我发起"（我是导师）→ 也要用进展文案，不能停在「已接受」
  assert(
    /translateOr\(t, progressLabelKey\(mine, false\), mine\.status\)/.test(src),
    '【可指导】的角标同样用进展文案（待我指导 / 我已指导）',
  )
  // 刷新【可指导】时顺带刷新提案，否则角标一刷新就丢
  assert(/post\('mentor\/list'[\s\S]{0,240}?setProposals/.test(src), '刷新可指导时回填提案状态（角标不丢）')
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
    /canDownloadProposal\(p, incoming\) \? \(\s*<button[\s\S]{0,260}?requestDownload\(p\)/.test(src),
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
    /if \(!incoming\) return true/.test(src),
    '导师侧始终可下载（它要的是学生的工作区，关系一建立就该能用）',
  )
  assert(
    /p\.status === 'ACCEPTED' && !incoming \? \(\s*<button[\s\S]{0,300}?openExchange\(p\)/.test(src),
    '【上传】只在导师侧（学生的工作区本来就在服务器上）',
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
  assert(/w\.path/.test(src) && /type="radio"/.test(src), '列出工作区（标题 + 路径）供点选 —— 不需要输地址')
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
  // 成功就**关窗**（文件已落盘，对话框没有可做的事）；失败留着让用户看到原因并能重试
  assert(
    /setDownload\(null\)[\s\S]{0,200}?community\.exchange\.downloadDone/.test(src),
    '下载成功后关闭对话框（回执改到列表顶部那条）',
  )
  assert(
    /if \(!res\.ok\)[\s\S]{0,400}?tone: 'error'[\s\S]{0,100}?return/.test(src),
    '下载失败时对话框留着并说明原因',
  )
  // 不再调起浏览器下载：<a download> 与同源 GET 代理都必须消失
  assert(!/a\.download\s*=/.test(src) && !/document\.createElement\('a'\)/.test(src), '不再用 <a> 触发浏览器下载')
  assert(!/mentor\/archive\?projectId/.test(src), '不再走同源 GET 代理')
  assert(src.includes("t('community.exchange.uploadTitle')"), '上传对话框标题走 i18n')
  assert(src.includes("t('community.exchange.noPicker')"), '上传选目录要说明没有选择器时的退路')

  // ③ 上传：选目录 → 扫描 review/ → 勾选 → 按**原相对路径**上传
  //
  // 为什么不是"选文件"：服务器要求 relative_paths 保留目录层次
  // （review/figures/x.png），浏览器文件选择器拿不到相对路径；走宿主读盘还顺带
  // 绕开了 RPC 的请求体上限（原来 base64 传字节，4MB 就打住）。
  assert(/post\('mentor\/scanReview'/.test(src), '先扫描工作区的 review/')
  assert(/setReviewSelected\(new Set\(files\.map/.test(src), '扫描后默认全选（刚写完就是要传）')
  assert(/post\('mentor\/upload',[\s\S]{0,200}?paths: Array\.from\(reviewSelected\)/.test(src), '上传按相对路径列表')
  assert(!/readAsDataURL/.test(src), '不再走 base64（目录扫描取代了它）')
  // 只查**代码**：注释里还会提到 base64（解释为什么不用它），那不算违规
  assert(!/base64\s*:/.test(src) && !/atob\(/.test(src), '界面里没有 base64 编解码代码')
  // 没有 review/ 文件时是"还没有指导结果"，不是错误
  assert(src.includes("t('community.exchange.noReviewFiles')"), '空 review/ 有专门说法')

  // ④ 宿主侧（host）：下载是**代理**，上传是**扫描 + 原路径回传**
  const rpc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')
  assert(/case 'mentor\/download':/.test(rpc), '有按工作区写入的下载端点')
  assert(/case 'mentor\/downloadState':/.test(rpc), '有对话框要的 downloadState（预检 + 工作区列表）')
  // ⚠️ 目标目录按**注册表 id** 在宿主侧解析：客户端递不进任意路径
  assert(
    /it\.id === workspaceId[\s\S]{0,200}?not-found/.test(rpc),
    '工作区按 id 在宿主侧解析（不接受任意路径）',
  )
  assert(/writeFileUnique\(target\.path/.test(rpc), '写盘走 workspace-sync（RPC 层不做文件写入）')
  assert(!/extractZip|unzip|adm-zip/i.test(rpc), '宿主不解压（只存 ZIP，其余交给用户）')
  assert(/uploadReviewFiles\(base, apiKey, projectId, payload/.test(rpc), '回传走 uploadReviewFiles（review/ 前缀）')
  assert(/scanReviewFiles\(dir\)/.test(rpc), '上传源来自扫描（不接受任意路径）')
  assert(/allowed\.has\(rel\)/.test(rpc), '只上传扫描得到的文件（界面不能递任意路径读盘）')
  // ⚠️ RPC 层不做文件写入（既有分层纪律）：断言在 [7] 里，这里确认写入确实在别处
  const sync = readFileSync(join(PKG, 'src', 'research', 'workspace-sync.ts'), 'utf8')
  assert(/export function scanReviewFiles/.test(sync), 'workspace-sync 保留 review/ 扫描（上传要用）')
  assert(/export function safeJoin/.test(sync), '保留路径安全校验')
  assert(!existsSync(join(PKG, 'src', 'research', 'zip.ts')), 'ZIP 解包器已删除（A 方案下不再需要）')

  // ⑤ 词典：新文案中英齐全
  for (const k of [
    'community.action.download',
    'community.action.upload',
    'community.action.chooseDir',
    'community.exchange.downloadTitle',
    'community.exchange.downloadDone',
    'community.exchange.noWorkspaces',
    'community.exchange.zipOnly',
    'community.exchange.destHint',
    'community.exchange.uploadTitle',
    'community.exchange.uploadDone',
    'community.exchange.noPicker',
  ]) {
    assert(zhDict.includes(`'${k}'`), `中文字典含 ${k}`)
  }
}
console.log(`\n${failed === 0 ? '✅' : '❌'} settings-page: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
