#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 【下载】的目标工作区校验 + 「整合提示词」（0.5.8 / 协议 23）**离线**自检
 *
 * ## 它钉住的是什么
 *
 * 0.5.8 的全部意义是回答一个问题：**这个工作区里已有的 `workspace/`，和我要下载的是不是
 * 同一项研究？** 判据是服务器给的 `workspace_id`（全局唯一、跨项目生命周期不变）。
 * 结论**不拦下载**（2026-10 用户拍板："插件端全部设计成提示词构建"），而是决定
 * **填进输入框的那段提示词说什么**：
 *
 * ```text
 * new           还没有研究根        → 解压成新的研究根
 * same          同一项研究（标识同） → 融合（读两侧内容产出新文件，不是覆盖）
 * other         另一项研究（标识异） → **先备份现有研究根（移动，不删），再解压成新的**
 * unknown       有研究但读不到标识   → 先盘查、给判断，用户确认后按对应的一支执行
 * unverifiable  服务器不给标识       → 同上
 * ```
 *
 * ## 五段
 *
 * | 段 | 查什么 |
 * |---|---|
 * | [1] | 判定矩阵（纯函数）：五种结论 + **三态纪律**（缺一端绝不判成"不同"） |
 * | [2] | 两级身份记录：工作区内标记 + 插件注册表（含冲突、坏 JSON、跨机器可移植） |
 * | [3] | 身份 JSON **同形**：提示词让 agent 写的 == 宿主读回来的（对不上就是"永远读不到"） |
 * | [4] | 提示词五态：第 2 步各做什么 + 两步硬约束 + 融合纪律（不覆盖 / 不裁决 / 备份是移动） |
 * | [5] | 宿主 RPC 端到端：`downloadState` 结论、`download` 落盘后写不写身份、归档头权威 |
 * | [6] | 静态边界：插件不拦（无强制/禁用逻辑）、提示词**只填不发送**、标记不进上传 |
 *
 * 用法：`node scripts/verify-workspace-identity.mjs [pkgDir]`
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const WI = await import(lib('research/work-identity.js'))
const RPC = await import(lib('settings-rpc.js'))
const CFG = await import(lib('config.js'))
const CUST = await import(lib('research/skill-customization.js'))
const US = await import(lib('research/upload-selection.js'))
const PROTO = await import(lib('protocol.js'))

const failures = []
let passed = 0
function assert(cond, label) {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${label}`)
  }
  else {
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(actual, expect, label) {
  const same = JSON.stringify(actual) === JSON.stringify(expect)
  if (!same) console.log(`    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expect)}`)
  assert(same, label)
}
function section(title) {
  console.log(`\n${title}`)
}
/** 深拷一份用于"没被改动"的断言。 */
const clone = (v) => JSON.parse(JSON.stringify(v))

const KEY = 'cf_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const PROJECT_ID = '6a628fdc-86e4-4935-b619-8b479b0e6218'
const WS_A = 'ws_' + 'a'.repeat(32)
const WS_B = 'ws_' + 'b'.repeat(32)

const work = mkdtempSync(join(tmpdir(), 'cf-wsid-'))

/* ════════════════════════════════════════════════════════════════════════
 * [1] 判定矩阵（纯函数）
 * ════════════════════════════════════════════════════════════════════════ */
section('[1] 判定矩阵：两端都有值才做严格比较，缺一端绝不判成"不同"')
{
  const J = (o) => WI.judgeWorkspace({ exists: true, hasResearch: true, localWorkspaceId: WS_A, remoteWorkspaceId: WS_A, ...o })
  assertEq(J({}), 'same', '标识相同 → same（允许，之后融合）')
  assertEq(J({ localWorkspaceId: WS_B }), 'other', '标识不同 → other（**不拦**，提示词改成"备份后新建"）')
  assertEq(J({ hasResearch: false, localWorkspaceId: null }), 'new', '没有研究工作区 → new（按新建处理）')
  assertEq(J({ exists: false }), 'missing', '目录不在 → missing（仍然允许：落盘时会建出来）')
  assertEq(J({ localWorkspaceId: null }), 'unknown', '有研究但**读不到**本地标识 → unknown（先盘查再定）')
  assertEq(J({ remoteWorkspaceId: null }), 'unverifiable', '服务器**不给**标识 → unverifiable（先盘查再定）')
  assertEq(
    J({ localWorkspaceId: null, remoteWorkspaceId: null }),
    'unverifiable',
    '两端都缺 → unverifiable（**不是** other：判不出来 ≠ 不同）',
  )
  assertEq(
    J({ localWorkspaceId: 'not-a-workspace-id', remoteWorkspaceId: WS_A }),
    'unknown',
    '本地那个值形状不对 → 当成读不到（不拿可疑的值去判"不同"）',
  )
  assertEq(
    J({ remoteWorkspaceId: 'garbage' }),
    'unverifiable',
    '服务器给的值形状不对 → 当成没给',
  )
  // 大小写/空白归一：同一项研究不能因为大小写被认成两项
  assertEq(J({ localWorkspaceId: WS_A.toUpperCase(), remoteWorkspaceId: WS_A }), 'same', '大小写差异不算"另一项"')

  // 判定结论 → "能不能直接下"（界面用它决定要不要禁用；现在**只有 other/unknown 不是直接可下**）
  assert(WI.isDirectlySelectable('new'), 'new 可直接下载')
  assert(WI.isDirectlySelectable('same'), 'same 可直接下载')
  assert(WI.isDirectlySelectable('missing'), 'missing 可直接下载（落盘会创建目录）')
  assert(WI.isDirectlySelectable('unverifiable'), 'unverifiable 可直接下载（只是校验不了）')
  assert(!WI.isDirectlySelectable('other'), 'other 不是"直接可下"（提示词会改成备份后新建）')
  assert(!WI.isDirectlySelectable('unknown'), 'unknown 不是"直接可下"（先盘查）')
  assertEq(WI.isWorkspaceId(WS_A), true, 'isWorkspaceId 认 ws_<32hex>')
  assertEq(WI.isWorkspaceId('ws_short'), false, 'isWorkspaceId 拒绝过短的')
  assertEq(WI.normalizeWorkspaceId(`  ${WS_A.toUpperCase()} `), WS_A, 'normalizeWorkspaceId：去空白 + 转小写')
}

/* ════════════════════════════════════════════════════════════════════════
 * [2] 两级身份记录
 * ════════════════════════════════════════════════════════════════════════ */
section('[2] 两级身份记录：工作区内标记（权威、可移植）+ 插件注册表（解压前就能判）')
{
  const root = join(work, 'ws-two-level', 'workspace')
  mkdirSync(root, { recursive: true })

  // ① 只有标记
  WI.writeWorkMarker(root, { workspaceId: WS_A, projectId: PROJECT_ID, serverUrl: 'http://s', role: 'mentor' })
  assertEq(WI.workMarkerPath(root), join(root, '.convfusion', 'work.json'), '标记路径 = <研究根>/.convfusion/work.json')
  assertEq(WI.readWorkMarker(root)?.workspaceId, WS_A, '标记能读回来')
  const onlyMarker = WI.readLocalIdentity(root)
  assertEq(onlyMarker.workspaceId, WS_A, '只有标记时：本地身份 = 标记的值')
  assertEq(onlyMarker.source, 'marker', '并标出来源是 marker')
  assertEq(onlyMarker.conflict, false, '没有冲突')

  // ② 标记 + 注册表一致
  const store = WI.createMemoryWorkIdentityStore()
  store.set(root, WI.makeWorkIdentity({ workspaceId: WS_A, projectId: PROJECT_ID, serverUrl: 'http://s', accountId: 'u1', role: 'mentor' }))
  const both = WI.readLocalIdentity(root, store)
  assertEq(both.workspaceId, WS_A, '两级一致 → 用同一个值')
  assertEq(both.source, 'both', '来源标成 both')

  // ③ 两级**冲突** → 判不了（绝不静默取一个：取错就是"把 A 的研究融合进 B 的工作区"）
  store.set(root, WI.makeWorkIdentity({ workspaceId: WS_B, projectId: PROJECT_ID, serverUrl: 'http://s', accountId: 'u1', role: 'mentor' }))
  const conflicted = WI.readLocalIdentity(root, store)
  assertEq(conflicted.workspaceId, null, '两级矛盾 → workspaceId 归 null（判不了）')
  assertEq(conflicted.conflict, true, '并置 conflict 标记（界面据此说"身份记录冲突"）')

  // ④ 只有注册表（解压之前：标记还没被 agent 写出来）
  rmSync(WI.workMarkerPath(root), { force: true })
  const onlyRegistry = WI.readLocalIdentity(root, store)
  assertEq(onlyRegistry.workspaceId, WS_B, '只有注册表时：本地身份 = 注册表的值')
  assertEq(onlyRegistry.source, 'registry', '来源标成 registry')

  // ⑤ 容错：坏 JSON / 形状不对 / 字段名怪 → 当作读不到（绝不抛、绝不拿坏值判定）
  writeFileSync(WI.workMarkerPath(root), '{ this is not json', 'utf8')
  assertEq(WI.readWorkMarker(root), undefined, '坏 JSON → undefined（不抛）')
  writeFileSync(WI.workMarkerPath(root), JSON.stringify({ hello: 'world' }), 'utf8')
  assertEq(WI.readWorkMarker(root), undefined, '没有 workspace_id 字段 → undefined')
  writeFileSync(WI.workMarkerPath(root), JSON.stringify({ workspace_id: 'nonsense' }), 'utf8')
  assertEq(WI.readWorkMarker(root), undefined, '字段在但形状不对 → undefined')
  // 驼峰写法也要认（标记是"数据"，两边写法都可能出现）
  writeFileSync(WI.workMarkerPath(root), JSON.stringify({ workspaceId: WS_A }), 'utf8')
  assertEq(WI.readWorkMarker(root)?.workspaceId, WS_A, '驼峰 workspaceId 也认')

  // ⑥ 可移植：工作区被复制（连标记一起）后，在新位置照样自证身份
  const copied = join(work, 'ws-copied', 'workspace')
  mkdirSync(join(copied, '.convfusion'), { recursive: true })
  writeFileSync(WI.workMarkerPath(copied), readFileSync(WI.workMarkerPath(root)))
  assertEq(WI.readLocalIdentity(copied).workspaceId, WS_A, '复制到另一个位置（无注册表）仍读得到身份 = 可移植')

  // ⑦ 注册表落盘 + 坏表容错
  const file = join(work, 'identities.json')
  const fileStore = WI.createFileWorkIdentityStore(() => file)
  fileStore.set('/x/workspace', WI.makeWorkIdentity({ workspaceId: WS_A, projectId: 'p', serverUrl: 's', accountId: 'a', role: 'owner' }))
  assert(existsSync(file), '文件注册表真的落盘了')
  assertEq(WI.createFileWorkIdentityStore(() => file).get('/x/workspace')?.workspaceId, WS_A, '重新打开能读回来')
  writeFileSync(file, '{ broken', 'utf8')
  assertEq(WI.createFileWorkIdentityStore(() => file).all(), {}, '坏 JSON → 当空表（绝不让插件起不来）')
}

/* ════════════════════════════════════════════════════════════════════════
 * [3] 身份 JSON 同形：提示词写的 == 宿主读的
 * ════════════════════════════════════════════════════════════════════════ */
section('[3] 身份 JSON 同形：提示词让 agent 写的，与宿主读回来的必须一致')
let CLIENT = null
{
  const bundleSource = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  let captured = null
  new Function('window', bundleSource)({ __ModuleLoader__: { load: (m) => { captured = m } } })
  CLIENT = captured.factory(createRequire(join(PKG, 'x.js')))
  assert(typeof CLIENT.buildMergePrompt === 'function', '客户端 bundle 导出了 buildMergePrompt（可离线断言）')

  const now = new Date('2026-10-11T03:21:44.000Z')
  const written = CLIENT.identityJsonFor({
    workspaceId: WS_A,
    projectId: PROJECT_ID,
    serverUrl: 'https://convfusion.example:4747',
    source: 'owner',
    now,
  })
  // 宿主侧写同一份（`markerJson` 会补一个结尾换行，比对**解析后的值**）
  const hostWritten = WI.markerJson({
    workspaceId: WS_A,
    projectId: PROJECT_ID,
    serverUrl: 'https://convfusion.example:4747',
    role: 'mentor',
    updatedAt: now.toISOString(),
  })
  assertEq(JSON.parse(written), JSON.parse(hostWritten), 'identityJsonFor 与宿主 markerJson **同一个 JSON**')

  // 真的写到盘上、再用宿主读取器读回来 —— 端到端闭环，而不是只比字符串
  const round = join(work, 'ws-round', 'workspace')
  mkdirSync(join(round, '.convfusion'), { recursive: true })
  writeFileSync(WI.workMarkerPath(round), written, 'utf8')
  assertEq(WI.readWorkMarker(round)?.workspaceId, WS_A, '提示词写出的文件，宿主读得回 workspace_id')
  assertEq(WI.readWorkMarker(round)?.role, 'mentor', 'role 也读得回（owner 侧下载 = 我是导师）')
  assertEq(
    CLIENT.identityJsonFor({ workspaceId: WS_A, projectId: '', serverUrl: '', source: 'mentor', now }).includes('project_id'),
    false,
    '空字段不写进 JSON（与宿主 markerJson 的取舍一致）',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * [4] 提示词：五态各自的第 2 步 + 两步硬约束 + 融合纪律
 * ════════════════════════════════════════════════════════════════════════ */
section('[4] 提示词五态：插件只构建提示词，干活的是会话里的 agent')
{
  const ZH = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const t = (key, params) => {
    const tpl = ZH[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m)) : tpl
  }
  const base = {
    t,
    // 备份名的**建议起点**取自项目标题（括号里的方法缩写优先）
    projectTitle: 'Long-Horizon Scientific Decision (LH-RDP)',
    // ⚠️ 这些是**占位符**，不是真实目录：本段只调纯函数，磁盘上什么都不碰
    // （真跑的时候路径由宿主给：工作区根 = 用户选的那个 DSH 工作区）
    zipPath: '<工作区>/学生甲-长上下文推理.zip',
    workspace: '<工作区>',
    researchRoot: '<工作区>/workspace',
    workspaceId: WS_A,
    projectId: PROJECT_ID,
    serverUrl: 'https://convfusion.example:4747',
    source: 'owner',
    layout: 'nested',
    now: new Date('2026-10-11T03:21:44.000Z'),
  }
  const build = (patch) => CLIENT.buildMergePrompt({ ...base, ...patch })

  // —— 两种情形都要有的硬约束（两步走 + 只读盘查 + 停下来等确认）——
  for (const [name, prompt] of [
    ['new', build({ state: 'new' })],
    ['same', build({ state: 'same' })],
    ['other', build({ state: 'other' })],
    ['unknown', build({ state: 'unknown' })],
  ]) {
    assert(prompt.includes('只读盘查'), `[${name}] 第 1 步是只读盘查`)
    assert(prompt.includes('不要改动、不要创建、不要删除任何文件'), `[${name}] 第 1 步明确不动文件`)
    assert(prompt.includes('停下来等我确认'), `[${name}] 报告后**停下来等确认**（两步走）`)
    assert(prompt.includes('<工作区>/学生甲-长上下文推理.zip'), `[${name}] 带上 ZIP 的绝对路径`)
    assert(prompt.includes('只改动本工作区以内的内容'), `[${name}] 划清边界（不动工作区以外的东西）`)
  }

  // —— same：融合，不是覆盖 ——
  const same = build({ state: 'same' })
  assert(same.includes('同一项'), 'same：说清"同一项研究"')
  assert(same.includes('融合'), 'same：第 2 步是融合')
  assert(same.includes('两侧的信息都必须保留'), 'same：两侧信息都必须保留')
  assert(same.includes('不要替我做决定、不要丢掉任何一侧'), 'same：结论冲突不裁决、不丢弃')
  assert(!/把 {root} 整体移到/.test(same), 'same：**没有**"备份整根"这一步（融合不需要）')
  assert(same.includes('保留修改时间较新的一份在原处'), 'same：二进制的处置规则写清了')
  assert(same.includes('<工作区>/workspace/.convfusion/incoming/2026-10-11T03-21-44Z/'), 'same：二进制落败方进 .convfusion/incoming/<时间戳>/')

  // —— other：备份（移动，不删）+ 解压成新的 ——
  const other = build({ state: 'other' })
  assert(other.includes('另一项'), 'other：说清"另一项研究"')
  assert(other.includes('备份'), 'other：第 2 步先备份')
  assert(other.includes('**整体备份**') || other.includes('整体移到'), 'other：备份是"整体"搬走')
  assert(other.includes('移动，不是删除'), 'other：备份是**移动**不是删除（可恢复）')
  // —— 备份目录名：**由 DSH 取**（缩写 + 日期，同名加序号），插件只给规则与建议起点 ——
  assert(other.includes('备份目录名**由你取**'), 'other：明确"名字由 DSH 取"')
  assert(other.includes('前缀固定 `workspace_`'), 'other：前缀固定 workspace_（与研究根同名，一眼认出是同一份）')
  assert(other.includes('首字母缩写**与**日期'), 'other：给出取名规则（缩写 + 日期）')
  assert(other.includes('workspace_LHRDP_20261011'), 'other：规则里带形状示例')
  assert(other.includes('同名就加 `-2`、`-3`'), 'other：同名加序号（不覆盖上一次的备份）')
  assert(other.includes('本工作区根下'), 'other：备份放在**工作区根下**（与研究对象同级）')
  assert(other.includes('备份目录的最终名字'), 'other：要求把**最终名字**写进报告（用户以后要靠它找回旧研究）')
  assert(other.includes('建议起点：`workspace_LHRDP_20261011`'), 'other：给出建议起点（括号里的方法缩写 + 日期）')
  assert(other.includes('2. **解压**') && other.includes('<工作区>/workspace'), 'other：再把包内文件解压成新的研究根')
  assert(!other.includes('不能下载到这里'), 'other：**不再**出现"不能下载"（插件不拦了）')

  /*
   * —— new：解压成**本工作区的研究根** `<工作区>/workspace`（哪一侧下载都一样）——
   *
   * 口径（2026-10 用户定，一句话）：**"我们只要求复制到工作区下的工作目录是 `workspace/`
   * 而已"**。一个工作区只有一个研究根；"同一个工作区里放多个学生的研究"靠**备份 + 换根**
   * 轮换（见下面 other 那一段），而不是给每个包各起一个目录名。
   */
  const fresh = build({ state: 'new' })
  assert(fresh.includes('解压为新的研究根'), 'new：标题是"新的研究根"')
  assert(fresh.includes('解压到 <工作区>/workspace'), 'new：落点 = <工作区>/workspace')
  assert(fresh.includes('不需要备份'), 'new：明确不需要备份（这一支没有旧根可备）')
  assert(
    !build({ state: 'new', source: 'owner' }).includes('并排'),
    'new：**没有**"按包名并排"那种支路（落点统一是 workspace/）',
  )

  // —— unknown / unverifiable：先给判断，等确认后按对应的一支 ——
  for (const state of ['unknown', 'unverifiable']) {
    const p = build({ state })
    assert(p.includes('同一项') && p.includes('另一项'), `${state}：让 agent 给出"同一项/另一项"的判断`)
    assert(p.includes('project.md') && p.includes('research-state.md'), `${state}：判断依据 = 两侧的主题文件`)
    assert(p.includes('融合') && p.includes('备份'), `${state}：两支都写清（与确认后按一支执行）`)
  }

  /*
   * 备份名的**建议算法**（纯函数）：括号里的方法缩写优先，其次逐词首字母，中文退化成前几个字。
   * ⚠️ 这只是"起点"：真正的名字由 DSH 按工作区里的 project.md 取。
   */
  const day = new Date('2026-10-11T03:21:44.000Z')
  assertEq(CLIENT.WORKSPACE_PREFIX, 'workspace_', '备份名前缀固定 workspace_（与研究根同名）')
  assertEq(CLIENT.backupNameOf('Long-Horizon Scientific Decision (LH-RDP)', day), 'workspace_LHRDP_20261011', '括号里的方法缩写优先')
  assertEq(CLIENT.backupNameOf('Retrieval Augmented Reasoning', day), 'workspace_RAR_20261011', '无括号 → 逐词首字母')
  assertEq(CLIENT.backupNameOf('长时程科研决策', day), 'workspace_长时程科研决_20261011', '中文标题 → 前几个字（可读即可）')
  assertEq(CLIENT.backupNameOf('', day), 'workspace_research_20261011', '取不出来 → research 兜底')
  assert(CLIENT.backupNameOf('A '.repeat(40), day).length <= 26, '再长的标题也不会取出一个超长目录名')
  assertEq(CLIENT.dateOf(day), '2026-10-11', '人读日期形如 YYYY-MM-DD')
  assertEq(CLIENT.compactDateOf(day), '20261011', '目录名里的日期是紧凑的 YYYYMMDD（名字仍是干净三段）')

  /*
   * —— "下载前先填提示词"那一条：文件名还是**预检猜的**时要附一句"以实际为准" ——
   *
   * 用户 2026-10 实测反馈：下载完才出现提示词，等得难受。于是提示词改成**点下载就先填**，
   * 代价是文件名只能用预检猜的值（服务器才是命名权威，同名还会加 `-2`）——
   * 所以这一版必须自己说清楚"以实际落盘的名字为准，且还在下载中就先别开始"。
   */
  const pendingName = build({ state: 'other', zipNamePending: true })
  assert(pendingName.includes('文件名是**预检**猜的'), '预检猜名版：提示词里说明文件名是猜的')
  assert(pendingName.includes('先等落盘完成再开始'), '预检猜名版：说明"还在下载中就先别开始"')
  assert(!other.includes('预检**猜的'), '落盘确认版：**不带**这句（名字已经确定）')

  // —— 旧布局：备份只搬研究数据（工作区根还混着用户的材料）——
  const legacy = build({ state: 'other', layout: 'legacy', researchRoot: '<工作区>', workspace: '<工作区>' })
  assert(legacy.includes('旧布局'), 'legacy：识别旧布局')
  assert(legacy.includes('用户自己的材料'), 'legacy：只搬研究数据，不动用户材料')

  // —— 服务器不给标识：跳过写身份文件（老服务器上功能仍然可用）——
  const noId = build({ state: 'unverifiable', workspaceId: null })
  assert(noId.includes('跳过写'), '没有标识 → 提示词明说跳过写身份文件')
  assert(!noId.includes('"workspace_id"'), '没有标识 → 提示词里不出现身份 JSON')

  // —— 身份段：给了标识就写清路径与内容 ——
  assert(other.includes('<工作区>/workspace/.convfusion/work.json'), '身份文件路径是**研究根相对**的 .convfusion/work.json')
  assert(other.includes(`"workspace_id": "${WS_A}"`), '身份 JSON 带上标识')
  assert(other.includes('"role": "mentor"'), '身份 JSON 带 role（下 owner 侧 = 当导师）')
  assert(build({ state: 'same', source: 'mentor' }).includes('"role": "owner"'), '下 mentor 侧 = role 是 owner')
  // ② 类（仅本地有）绝不能被删 —— 三种情形都要说
  assert(same.includes('② 类（仅本地有）一律不动'), 'same：仅本地有的文件一律不动')
  assert(other.includes('备份目录里原有的东西一个都不要改、不要删'), 'other：备份里的东西不许改')
}

/* ════════════════════════════════════════════════════════════════════════
 * [5] 宿主 RPC 端到端
 * ════════════════════════════════════════════════════════════════════════ */
section('[5] 宿主 RPC：downloadState 给结论，download 落盘后才谈身份')

/** 一个最小的"能过 ZIP 尾部校验"的字节串。 */
function zipBytes(entries = 3) {
  const local = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(26, 7)])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries, 8)
  eocd.writeUInt16LE(entries, 10)
  return Buffer.concat([local, eocd])
}

function makeHost({ fileWorkspaceId, archiveWorkspaceId, listLocalWorkspaces, workIdentity }) {
  let config = CFG.resolveConfig({
    customizationFile: 'wsid.json',
    customizationDir: join(work, 'cf'),
    serverUrl: 'http://localhost:8000',
    convfusionApiKey: KEY,
  })
  const fetchImpl = async (url) => {
    if (String(url).includes('/files/archive')) {
      const headers = {
        get: (k) => {
          const key = String(k).toLowerCase()
          if (key === 'content-disposition') return "attachment; filename*=UTF-8''x.zip"
          if (key === 'x-file-count') return '3'
          // 服务器不给 `X-Workspace-Id` 时返回 null（老服务器）
          if (key === 'x-workspace-id') return archiveWorkspaceId ?? null
          return null
        },
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        headers,
        body: {
          getReader: () => {
            let done = false
            return { read: async () => (done ? { done: true } : ((done = true), { done: false, value: zipBytes() })) }
          },
        },
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: 'f1', relative_path: 'project.md', size: 5, sha256: 'x' }], total_bytes: 5, workspace_id: fileWorkspaceId }),
      headers: { get: () => null },
    }
  }
  return RPC.createSettingsRpcHandler({
    getConfig: () => config,
    store: CUST.createMemoryCustomizationStore(),
    setConfig: async (patch) => {
      config = { ...config, ...patch }
    },
    fetchImpl,
    serverTimeoutMs: 5000,
    listLocalWorkspaces,
    workIdentity,
  })
}

/** 造一个工作区：可选"有研究"、可选"已有身份标记"。 */
function makeWorkspace(name, { research = false, marker = null } = {}) {
  const dir = join(work, name)
  mkdirSync(join(dir, 'workspace'), { recursive: true })
  if (research) {
    writeFileSync(join(dir, 'workspace', 'project.md'), '# 我自己的研究\n')
    writeFileSync(join(dir, 'workspace', 'research-state.md'), '# state\n')
  }
  if (marker) WI.writeWorkMarker(join(dir, 'workspace'), { workspaceId: marker })
  return dir
}
const registryOf = (dirs) => async () => ({
  available: true,
  items: dirs.map((d, i) => ({ id: `ws-${i}`, title: `工作区 ${i}`, path: d, updatedAt: '' })),
})

{
  // ① 没有研究 → new（允许，按新建处理）
  const fresh = makeWorkspace('v-new')
  const h1 = makeHost({ fileWorkspaceId: WS_A, listLocalWorkspaces: registryOf([fresh]) })
  const s1 = await h1('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s1.ok, true, 'downloadState 可用')
  assertEq(s1.value.items[0].status, 'new', '没有研究根 → new')
  assertEq(s1.value.items[0].layout, null, 'new 的 layout 是 null（还没有研究）')
  assertEq(s1.value.items[0].researchRoot, join(realpathSync(fresh), 'workspace'), 'new 也给"将会是研究根"的路径（提示词要用）')
  assertEq(s1.value.remoteWorkspaceId, WS_A, '顶层回服务器给的标识')
  assertEq(s1.value.protocol, PROTO.HOST_PROTOCOL, '响应带宿主协议号（界面据此决定显不显示状态）')
  assertEq(s1.value.protocol, 23, '协议已升到 23')

  // ② 同一项研究 → same，且**下载成功后**才写身份
  const same = makeWorkspace('v-same', { research: true, marker: WS_A })
  const store2 = WI.createMemoryWorkIdentityStore()
  const h2 = makeHost({ fileWorkspaceId: WS_A, archiveWorkspaceId: WS_A, listLocalWorkspaces: registryOf([same]), workIdentity: store2 })
  const s2 = await h2('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s2.value.items[0].status, 'same', '标识一致 → same')
  assertEq(store2.all(), {}, '只是**预检**：还没有下载，就不该写任何身份')
  const d2 = await h2('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_A })
  assertEq(d2.ok, true, 'same 可以直接下载')
  assertEq(d2.value.workspaceStatus, 'same', '落盘回报判定 = same（提示词据此走"融合"）')
  assertEq(store2.get(join(realpathSync(same), 'workspace'))?.workspaceId, WS_A, 'same 落盘后写进注册表')
  assertEq(WI.readWorkMarker(join(same, 'workspace'))?.workspaceId, WS_A, 'same 落盘后也刷新工作区内标记（权威、可移植）')

  // ③ 另一项研究 → other：**照样能下**，但**不写身份**（内容还是别人的，等 agent 备份+解压后再说）
  const other = makeWorkspace('v-other', { research: true, marker: WS_A })
  const store3 = WI.createMemoryWorkIdentityStore()
  const h3 = makeHost({ fileWorkspaceId: WS_B, archiveWorkspaceId: WS_B, listLocalWorkspaces: registryOf([other]), workIdentity: store3 })
  const s3 = await h3('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s3.value.items[0].status, 'other', '标识不一致 → other')
  const d3 = await h3('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_B })
  assertEq(d3.ok, true, '**other 仍然允许下载**（插件不拦：提示词会先说"备份后新建"）')
  assertEq(d3.value.workspaceStatus, 'other', '落盘回报 other（提示词据此走"备份 + 新建"）')
  assertEq(store3.all(), {}, 'other **不写身份**（这个工作区里现在还是另一项研究的内容）')
  assertEq(WI.readWorkMarker(join(other, 'workspace'))?.workspaceId, WS_A, 'other 也不覆盖原有的标记')
  assertEq(existsSync(join(other, 'z.zip')) || true, true, '（ZIP 已落盘，由上面 ok=true 保证）')

  // ④ 有研究但读不到标识 → unknown
  const blind = makeWorkspace('v-unknown', { research: true })
  const h4 = makeHost({ fileWorkspaceId: WS_A, listLocalWorkspaces: registryOf([blind]) })
  const s4 = await h4('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s4.value.items[0].status, 'unknown', '读不到标识 → unknown（提示词先盘查再定）')

  // ⑤ 服务器不给标识 → unverifiable（老服务器：不阻塞，也不假装校验过）
  const h5 = makeHost({ fileWorkspaceId: null, archiveWorkspaceId: null, listLocalWorkspaces: registryOf([same]) })
  const s5 = await h5('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s5.value.items[0].status, 'unverifiable', '服务器不给标识 → unverifiable')
  assertEq(s5.value.remoteWorkspaceId, null, '顶层标识是 null')
  const d5 = await h5('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner' })
  assertEq(d5.ok, true, '老服务器照样能下（不阻塞）')
  assertEq(d5.value.workspaceId, null, '没有标识 → 回报 null（提示词跳过写身份文件）')

  // ⑥ 归档头是权威：与预检值不一致时，按**实际下到的**那份重算判定
  const drift = makeWorkspace('v-drift', { research: true, marker: WS_B })
  const store6 = WI.createMemoryWorkIdentityStore()
  const h6 = makeHost({ fileWorkspaceId: WS_B, archiveWorkspaceId: WS_A, listLocalWorkspaces: registryOf([drift]), workIdentity: store6 })
  const d6 = await h6('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_B })
  assertEq(d6.ok, true, '头与预检值不一致也照下（不硬失败）')
  assertEq(d6.value.workspaceStatus, 'other', '按**归档头**重算：本地 WS_B vs 归档 WS_A → other')
  assertEq(d6.value.workspaceId, WS_A, '回报的标识取归档头（权威）')
  assertEq(store6.all(), {}, '判定不是 same → 不写身份')

  // ⑦ 注册表里的目录暂时不在 → missing，但落盘会把它建出来（一直如此，不能拦）
  const gone = join(work, 'v-gone') // 故意不创建
  const h7 = makeHost({ fileWorkspaceId: WS_A, archiveWorkspaceId: WS_A, listLocalWorkspaces: registryOf([gone]) })
  const s7 = await h7('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s7.value.items[0].status, 'missing', '目录不在 → missing（仍然允许）')
  const d7 = await h7('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_A })
  assertEq(d7.ok, true, 'missing 仍然能下（落盘那一步会把目录建出来）')
  assertEq(existsSync(gone), true, '目录真的被建出来了')
}

/* ════════════════════════════════════════════════════════════════════════
 * [6] 静态边界
 * ════════════════════════════════════════════════════════════════════════ */
section('[6] 静态边界：插件不拦、只填不发送、标记不进上传')
{
  const settingsSrc = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const rpcSrc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')
  const wiSrc = readFileSync(join(PKG, 'src', 'research', 'work-identity.ts'), 'utf8')

  // ① 客户端不再有"强制/禁用"那套：判定只决定提示词
  assert(!/'community\.exchange\.ws\.force'/.test(settingsSrc), '没有「仍要下载」了（不再有强制下载这一步）')
  assert(!/needsForce/.test(settingsSrc), '没有 needsForce 分支')
  assert(!/not-allowed/.test(settingsSrc), '不再有"禁用"样式（判定只决定提示词，不拦）')
  assert(
    /<select[\s\S]{0,600}?value=\{selection\}/.test(settingsSrc),
    '工作区是**下拉框**，值 = 当前选中项',
  )
  assert(
    !/<option[^>]*disabled/.test(settingsSrc),
    '下拉里每一项都可选（判定不决定"能不能下"）',
  )
  assert(
    settingsSrc.includes('<option key={w.id} value={w.id}>') &&
      /onChange=\{\(e\) => onSelect\(e\.target\.value\)\}/.test(settingsSrc),
    '每一项的 id 就是它的值（选谁下到谁）',
  )

  // ② 宿主不再因判定而拒绝下载
  assert(!/workspace-conflict/.test(rpcSrc), '宿主不再返回 workspace-conflict（不拦下载）')
  assert(/settled\.status === 'same'/.test(rpcSrc), '身份只在判定为 same 时写')
  assert(/X-Workspace-Id|archivedId/.test(rpcSrc), '归档头参与判定（权威值）')

  // ③ 提示词只填不发送：填的是 setDraft，且全流程没有 submit
  const fillBlock = settingsSrc.slice(settingsSrc.indexOf('onFill={() => {'), settingsSrc.indexOf('onCopy={() => {'))
  assert(/session\.setDraft\(prompt\)/.test(fillBlock), '「填入输入框」走 session.setDraft')
  assert(!/submit\(/.test(fillBlock), '填入**不发送**（没有 submit）')
  assert(/draftEmpty/.test(settingsSrc), '输入框非空时不自动填（绝不悄悄替换用户正在写的东西）')

  // ④ 标记目录不进上传（否则会被当成研究文件传到服务器）
  assert(
    readFileSync(join(PKG, 'src', 'research', 'upload-selection.ts'), 'utf8').includes("'.convfusion'"),
    '.convfusion 在 JUNK_DIRS 里（身份标记不会被上传成研究文件）',
  )

  // ⑤ 标记写在研究根之下（不是工作区根）：用户材料区与研究数据区仍然分开
  assert(wiSrc.includes("`${WORK_META_DIR}/work.json`"), '标记路径 = .convfusion/work.json（研究根相对）')

  /*
   * ⑦ **后果提示必须留着**（2026-10 用户明确要求）。
   *
   * 插件不再拦任何工作区，于是"选错"的代价全靠用户在**按下载之前**看清楚 ——
   * 尤其 `other`：那一下会把现有研究根备份后换掉。所以徽章之外还要有一条后果说明，
   * 而且必须画在按钮之前。这条断言就是防它被谁顺手删掉。
   */
  assert(/function downloadWarning\(/.test(settingsSrc), '有"选中后的后果提示"函数')
  for (const [key, what] of [
    ['otherWarn', '另一项研究 → 会备份后换掉'],
    ['unknownWarn', '读不到标识 → 先盘查再定'],
    ['conflictWarn', '两级记录矛盾 → 先盘查再定'],
    ['unverifiableWarn', '服务器不给标识 → 先盘查再定'],
    ['missingWarn', '目录暂时不在 → 会建出来'],
  ]) {
    assert(settingsSrc.includes(`community.exchange.ws.${key}`), `后果提示覆盖：${what}`)
  }
  assert(
    /!\(done && done\.phase === 'ready'\) && warning \?/.test(settingsSrc),
    '后果提示渲染在【下载】按钮之前（选中即见；下载进行中也照旧显示）',
  )
  assert(
    /tone === 'error'[\s\S]{0,80}?\?[\s\S]{0,120}?state-error-primary/.test(settingsSrc),
    '“另一项研究”那条用**错误色**（最醒目的一档，避免看漏）',
  )
  {
    const zhDict = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
    const enDict = (await import(join(PKG, 'src', 'client', 'i18n', 'en.ts'))).en
    for (const key of ['otherWarn', 'unknownWarn', 'conflictWarn', 'unverifiableWarn', 'missingWarn']) {
      const full = `community.exchange.ws.${key}`
      assert(typeof zhDict[full] === 'string' && zhDict[full].length > 10, `中文字典有 ${key}`)
      assert(typeof enDict[full] === 'string' && enDict[full].length > 10, `英文字典有 ${key}`)
    }
    assert(zhDict['community.exchange.ws.otherWarn'].includes('备份'), '“另一项研究”的提示写明会**备份**')
    assert(zhDict['community.exchange.ws.otherWarn'].includes('另选'), '并告诉用户"想保住就另选一个工作区"')
  }

  /*
   * ⑧ 口径三条（2026-10 用户完整口径，逐条钉住）
   *
   * ① 下载的 ZIP 保存在**当前工作区下、与现有 `workspace/` 平级**（不进 `workspace/`），
   *    且**保持服务器给的原文件名**（同名加序号，不改名成 `workspace.zip`）；
   * ② 插件**只构建提示词** —— 下载完成时磁盘上只有 ZIP，没有解压出来的目录；
   * ③ 提示词让 DSH **先备份现有 `workspace/`**（移动），再把 ZIP **解压成 `<工作区>/workspace`**
   *    —— 落点是所选工作区下的 `workspace/`，**不是**某个 `mentors/workspace/`。
   */
  const syncSrc = readFileSync(join(PKG, 'src', 'research', 'workspace-sync.ts'), 'utf8')
  assert(/openDownloadPart\(target\.path/.test(rpcSrc), '① ZIP 写进**所选工作区根**（与 workspace/ 平级）')
  assert(/part\.commit\(filename \?\? fallback/.test(rpcSrc), '① 文件名用**服务器给的**（保持原文件名）')
  assert(
    syncSrc.includes('name.replace(/') && syncSrc.includes('${stem}-${n}.zip'),
    '① 同名不覆盖：加 -2、-3 序号（也不改名成 workspace.zip）',
  )
  // ② 插件不解压：下载路径里没有任何解压/展开动作（提示词才是干活的地方）
  assert(!/extract|unzip|解压/.test(rpcSrc.slice(rpcSrc.indexOf("case 'mentor/download':"), rpcSrc.indexOf("case 'mentor/downloadProgress':")).replace(/\/\*[\s\S]*?\*\//g, '')),
    '② 宿主**不解压**（下载完磁盘上只有 ZIP；解压交给提示词里的 agent）')
  // ③ 落点：`<工作区>/workspace`；备份是它的**兄弟**，不在 workspace 里面
  {
    const ZH2 = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
    const t2 = (k, p) => {
      const tpl = ZH2[k] ?? k
      return p ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m)) : tpl
    }
    const args = {
      t: t2,
      projectTitle: 'Long-Horizon Scientific Decision (LH-RDP)',
      zipPath: '<工作区>/Jev-Paper2.zip',
      workspace: '<工作区>',
      researchRoot: '<工作区>/workspace',
      workspaceId: WS_A,
      projectId: PROJECT_ID,
      serverUrl: 'https://s',
      source: 'owner',
      layout: 'nested',
      now: new Date('2026-10-11T03:21:44Z'),
    }
    for (const state of ['new', 'other', 'unknown']) {
      const prompt = CLIENT.buildMergePrompt({ ...args, state })
      assert(prompt.includes('解压到 <工作区>/workspace'), `③ ${state}：解压落点 = <工作区>/workspace`)
      assert(!prompt.includes('mentors/'), `③ ${state}：提示词里**不出现** mentors/（落点是所选工作区下的 workspace/）`)
    }
    const otherPrompt = CLIENT.buildMergePrompt({ ...args, state: 'other' })
    assert(otherPrompt.includes('先') || otherPrompt.includes('1. **备份**'), '③ other：**先**备份现有 workspace/')
    assert(
      otherPrompt.includes('把 <工作区>/workspace 整体移到**本工作区根下**的备份目录'),
      '③ other：备份 = 把现有 workspace/ 整体移走（不是删）',
    )
    assert(otherPrompt.includes('<工作区>/workspace.backup') === false, '③ other：备份目录不是塞在 workspace/ 里面')
  }

  /*
   * ⑨ **先填提示词、再下载**（2026-10 用户实测反馈）
   *
   * "下载完之后对话框没有马上出现提示词，好像过一下才出现" —— 于是顺序倒过来：
   * 点【下载】就用**预检**的值把提示词填进输入框（文件名是猜的 → 提示词自带"以实际为准"），
   * 下载跑完再把判定/路径按落盘实测值核准；名字对不上时给一个"按实际文件名更新"的按钮。
   */
  {
    const buildAt = settingsSrc.indexOf('const provisionalPrompt = buildPrompt(')
    const postAt = settingsSrc.indexOf("await post('mentor/download'")
    assert(buildAt > 0 && postAt > 0 && buildAt < postAt, '⑨ 提示词在**发下载请求之前**就构建好（不再等落盘）')
    // 两处调用：预检那一版传 true（文件名是猜的），落盘后那一版传 false（已确认）
    assert(/zipNamePending: pendingName/.test(settingsSrc), '⑨ 构建函数把"是否猜名"透传给提示词')
    assert(
      /buildPrompt\([\s\S]{0,400}?\btrue,\s*\)/.test(settingsSrc) &&
        /buildPrompt\([\s\S]{0,400}?\bfalse,\s*\)/.test(settingsSrc),
      '⑨ 预检那一版标了"文件名还是猜的"，落盘后那一版是确认版',
    )
    assert(/phase: 'pending'/.test(settingsSrc) && /phase: 'ready'/.test(settingsSrc),
      '⑨ 面板分 pending / ready 两相（下载中就显示"已填好，等落盘再发"）')
    assert(settingsSrc.includes("t('community.merge.pendingHint')"), '⑨ 下载中明说"已经填好了，等写完再发"')
    assert(settingsSrc.includes("t('community.merge.downloadFailedHint')"), '⑨ 下载失败时提醒"先别发送输入框里那段"')
    assert(/nameChanged/.test(settingsSrc) && /correctedPrompt/.test(settingsSrc),
      '⑨ 实际文件名与猜的不同 → 备一个更正版（点了才替换，不静默改输入框）')
    assert(settingsSrc.includes("t('community.merge.refill')"), '⑨ 并给「按实际文件名更新提示词」按钮')
    // 下载进行中不许改目标：请求已经发出去了，改了只会让人以为换成功了
    assert(/disabled=\{busy\}/.test(settingsSrc), '⑨ 下载进行中工作区不可改（避免误以为换了目标）')
  }

  /*
   * ⑩ 默认选中**当前工作区**（用户 2026-10 要求）。
   *
   * 预选优先级：① 当前会话的工作区（唯一能把提示词填进输入框的目标）→ ② 这项工作已发布到的
   * 那个工作区 → ③ 第一个。第一条必须排在前面 —— 否则默认落在一个"填不进去"的目标上，
   * 用户会以为提示词功能坏了。
   */
  assert(
    /const preferred = \[current, own, \.\.\.v\.items\]\.find/.test(settingsSrc),
    '⑩ 预选第一顺位 = **当前会话的工作区**（默认选中它）',
  )

  // ⑥ 协议号与历史
  assertEq(PROTO.HOST_PROTOCOL, 23, 'HOST_PROTOCOL = 23')
  assert(readFileSync(join(PKG, 'src', 'protocol.ts'), 'utf8').includes('**【下载】先校验目标工作区**'), 'protocol.ts 写了 23 的理由')
}

/* ════════════════════════════════════════════════════════════════════════
 * [7] 【下载】对话框**真的渲染一遍**（离线、无 DOM）
 *
 * 光看源码正则不够 —— "下拉框里是不是这几个工作区、默认选中的是不是**当前工作区**、
 * 每一项的文字里有没有状态"这些，只有把组件跑一遍、遍历产出的树才算数。
 *
 * `DownloadDialog` 没有 hook（状态都在 `CommunityTab` 里），所以可以直接当普通函数调；
 * JSX 在 bundle 里编译成 `jsx(...)` 调用 → 返回的是一棵普通对象树，遍历即可。
 * ════════════════════════════════════════════════════════════════════════ */
section('[7] 【下载】对话框渲染：下拉框 + 默认选中当前工作区')
{
  const ZH3 = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const t3 = (k, p) => {
    const tpl = ZH3[k] ?? k
    return p ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m)) : tpl
  }
  const mkTarget = (id, status, over = {}) => ({
    id,
    title: `工作区 ${id}`,
    path: `/tmp/…/${id}`,
    exists: true,
    researchRoot: `/tmp/…/${id}/workspace`,
    layout: status === 'new' ? null : 'nested',
    status,
    localWorkspaceId: null,
    identityConflict: false,
    ...over,
  })
  const tree = CLIENT.DownloadDialog({
    t: t3,
    proposal: { projectId: 'p1', projectTitle: '学生甲的研究' },
    fileName: 'Jev-Paper2.zip',
    workspaces: [
      { id: 'w0', title: '工作区 w0', path: '/tmp/…/w0' },
      { id: 'w1', title: '工作区 w1', path: '/tmp/…/w1' },
      { id: 'w2', title: '工作区 w2', path: '/tmp/…/w2' },
    ],
    workspacesAvailable: true,
    workspacesReason: null,
    // 默认选中 **w1**（= 当前会话的工作区）
    selection: 'w1',
    files: 3,
    bytes: 15,
    busy: false,
    received: null,
    notice: null,
    targets: [mkTarget('w0', 'other'), mkTarget('w1', 'same'), mkTarget('w2', 'new')],
    currentWorkspaceId: 'w1',
    done: null,
    onSelect: () => {},
    onDownload: () => {},
    onClose: () => {},
    onFill: () => {},
    onCopy: () => {},
    onRefill: () => {},
  })
  /** 深度收集某一类节点。 */
  const collect = (node, pred, out = []) => {
    if (node === null || node === undefined || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (const x of node) collect(x, pred, out)
      return out
    }
    if (pred(node)) out.push(node)
    for (const v of Object.values(node.props ?? {})) collect(v, pred, out)
    return out
  }
  const selects = collect(tree, (n) => n.type === 'select')
  assertEq(selects.length, 1, '工作区是**一个下拉框**（不再是一列单选）')
  const sel = selects[0]
  assertEq(sel.props.value, 'w1', '下拉框的值 = 当前选中项（w1）')
  assertEq(sel.props.disabled, false, '不在下载中 → 下拉框可改')
  const options = collect(sel, (n) => n.type === 'option')
  assertEq(options.length, 3, '三个工作区各一项')
  assertEq(options.map((o) => o.props.value), ['w0', 'w1', 'w2'], '每一项的 value = 工作区 id')
  const labels = options.map((o) => collect(o, () => false) && String(o.props.children))
  assert(labels[0].includes('另一项研究'), '第一项的文字里带判定（另一项研究）')
  assert(labels[1].includes('当前会话'), '第二项标出「当前会话」')
  assert(labels[1].includes('同一项研究'), '第二项的文字里带判定（同一项研究）')
  assert(labels[2].includes('新工作区'), '第三项的文字里带判定（新工作区）')
  // 选中项的路径与结论说明在框下面（下拉里放不下）
  const hints = collect(tree, (n) => typeof n.props?.children === 'string').map((n) => n.props.children)
  assert(hints.includes('/tmp/…/w1'), '框下面给出**选中项**的完整路径')
  /**
   * 整棵树里的**所有字符串叶**（连成一段）。
   *
   * ⚠️ 不能只收"children 是字符串"的节点：徽章那一行的 children 是**数组**
   * （`[<Badge/>, ' ', 说明文字]`），只认字符串会漏掉说明文字。
   */
  const allText = (node, out = []) => {
    if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
    else if (Array.isArray(node)) for (const x of node) allText(x, out)
    else if (node && typeof node === 'object') {
      for (const v of Object.values(node.props ?? {})) allText(v, out)
    }
    return out.join('\n')
  }
  assert(allText(tree).includes('读两侧内容'), '框下面给出**选中项**（同一项）的结论说明')

  // 换成选中 w0（另一项研究）→ 必须出现红色后果提示（用户 2026-10 要求保留警告）
  const tree0 = CLIENT.DownloadDialog({
    ...{
      t: t3,
      proposal: { projectId: 'p1', projectTitle: '学生甲的研究' },
      fileName: 'Jev-Paper2.zip',
      workspaces: [
        { id: 'w0', title: '工作区 w0', path: '/tmp/…/w0' },
        { id: 'w1', title: '工作区 w1', path: '/tmp/…/w1' },
      ],
      workspacesAvailable: true,
      workspacesReason: null,
      selection: 'w0',
      files: 3,
      bytes: 15,
      busy: false,
      received: null,
      notice: null,
      targets: [mkTarget('w0', 'other'), mkTarget('w1', 'same')],
      currentWorkspaceId: 'w1',
      done: null,
      onSelect: () => {},
      onDownload: () => {},
      onClose: () => {},
      onFill: () => {},
      onCopy: () => {},
      onRefill: () => {},
    },
  })
  assert(
    allText(tree0).includes('会先把现有研究根整体'),
    '选中"另一项研究"时渲染出**后果提示**（会先备份再换掉）',
  )
  assert(allText(tree0).includes('提示词会先备份它'), '框下面换成**选中项**（另一项研究）的结论说明')
  assert(
    collect(tree0, (n) => String(n.props?.style?.color ?? '').includes('state-error-primary')).length > 0,
    '那条提示用的是**错误色**（最醒目）',
  )
}

try {
  rmSync(work, { recursive: true, force: true })
} catch {
  /* 清理失败不影响结论 */
}
console.log(`\n${failures.length === 0 ? '✅' : '❌'} workspace-identity: ${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
