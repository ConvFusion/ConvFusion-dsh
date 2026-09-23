#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 文献检索（OpenAlex）验证（**不联网**）。
 *
 * ## 为什么需要它
 *
 * v2 推倒 sidecar 之后只留下了 `literature-search` 这个**方法** Skill，没有任何东西
 * 能真的去检索 —— 设置页里那把 OpenAlex Key 因此一直没有消费者。本套验证守住
 * 补上的这条链路，重点是**失败与可追溯性**，不是"能发出请求"：
 *
 *   1. 请求构造正确（检索式、年份过滤、排序、开放获取、字段裁剪、每页上限）；
 *   2. **密钥只进请求、不进返回值**（否则会被随手写进 `research/evidence/*.md`）；
 *   3. 摘要倒排索引能重建（OpenAlex 不返回纯文本摘要）；
 *   4. 响应映射：总数 ≠ 返回数（覆盖度结论不能只看一页）；
 *   5. 失败**带原因**（无检索式 / HTTP / 网络 / 超时），绝不把失败表现成"没检索到"；
 *   6. 工具已注册且被注入检索依赖（否则 Agent 根本调不到）；
 *   7. **渲染输出含作者** —— 记录里有作者、渲染时却丢掉，等于模型看不到
 *      （曾发生：作者只进了结构化 payload，模型读到的文本里没有）。
 *
 * 用法：
 *   node scripts/verify-literature-search.mjs packages/dsh-convfusion
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const LIT = await import(lib('research/literature.js'))
const TOOLS = await import(lib('research/research-tools.js'))

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

const SECRET = 'sk-openalex-SUPER-SECRET-value'

/* ── 1. 请求构造 ───────────────────────────────────────────────────── */
console.log('\n[1] 请求构造')
{
  const url = LIT.buildOpenAlexUrl({ query: 'visual LiDAR UAV localization', perPage: 10 })
  const u = new URL(url)
  assertEq(u.origin + u.pathname, 'https://api.openalex.org/works', '端点正确')
  assertEq(u.searchParams.get('search'), 'visual LiDAR UAV localization', 'search 参数正确')
  assertEq(u.searchParams.get('per-page'), '10', 'per-page 正确')
  assert((u.searchParams.get('select') ?? '').includes('abstract_inverted_index'), '字段裁剪包含摘要索引')
  assert((u.searchParams.get('select') ?? '').includes('cited_by_count'), '字段裁剪包含被引数')
  assertEq(u.searchParams.get('sort'), null, '默认不传 sort（才是 OpenAlex 的相关性排序）')

  // 年份
  const yr = new URL(LIT.buildOpenAlexUrl({ query: 'x', yearFrom: 2020, yearTo: 2024 }))
  assertEq(yr.searchParams.get('filter'), 'publication_year:2020-2024', '年份区间过滤')
  const onlyFrom = new URL(LIT.buildOpenAlexUrl({ query: 'x', yearFrom: 2020 }))
  assertEq(onlyFrom.searchParams.get('filter'), 'publication_year:>2019', '只有起始年 → 开区间')
  const onlyTo = new URL(LIT.buildOpenAlexUrl({ query: 'x', yearTo: 2024 }))
  assertEq(onlyTo.searchParams.get('filter'), 'publication_year:<2025', '只有结束年 → 开区间')

  // 排序 / 开放获取
  assertEq(new URL(LIT.buildOpenAlexUrl({ query: 'x', sort: 'cited' })).searchParams.get('sort'), 'cited_by_count:desc', '按被引排序')
  assertEq(new URL(LIT.buildOpenAlexUrl({ query: 'x', sort: 'recent' })).searchParams.get('sort'), 'publication_date:desc', '按时间排序')
  assertEq(
    new URL(LIT.buildOpenAlexUrl({ query: 'x', openAccessOnly: true })).searchParams.get('filter'),
    'is_oa:true',
    '只看开放获取',
  )

  // 每页上限（越界收敛）
  assertEq(LIT.normalizePerPage(undefined), LIT.OPENALEX_DEFAULT_PER_PAGE, '缺省每页条数')
  assertEq(LIT.normalizePerPage(9999), LIT.OPENALEX_MAX_PER_PAGE, '每页条数收敛到上限')
  assertEq(LIT.normalizePerPage(-5), 1, '每页条数下限为 1')
  assertEq(LIT.normalizePerPage(3.7), 3, '每页条数取整')

  // key vs mailto
  const withKey = new URL(LIT.buildOpenAlexUrl({ query: 'x' }, SECRET, 'me@example.org'))
  assertEq(withKey.searchParams.get('api_key'), SECRET, '有 Key 时带上 api_key')
  assertEq(withKey.searchParams.get('mailto'), null, '有 Key 时不再传 mailto（Key 已进 polite pool）')
  const noKey = new URL(LIT.buildOpenAlexUrl({ query: 'x' }, '', 'me@example.org'))
  assertEq(noKey.searchParams.get('api_key'), null, '无 Key 时不带 api_key')
  assertEq(noKey.searchParams.get('mailto'), 'me@example.org', '无 Key 时用 mailto 进公共池')
}

/* ── 2. 密钥不进返回值（这条最容易出错，也最贵）──────────────────── */
console.log('\n[2] 密钥只进请求，不进返回值')
{
  const url = LIT.buildOpenAlexUrl({ query: 'x' }, SECRET)
  assert(url.includes(SECRET), '（前提）请求 URL 里确实带 Key')
  const redacted = LIT.redactOpenAlexUrl(url)
  assert(!redacted.includes(SECRET), 'redact 后不含 Key 明文')
  assert(redacted.includes('api_key=***'), 'redact 后以 *** 占位')
  assert(redacted.startsWith('https://api.openalex.org/works?'), '其余部分保持不变')

  // 映射后的结果里也不能出现
  const mapped = LIT.mapOpenAlexResponse(
    { meta: { count: 1 }, results: [] },
    { query: 'x', requestUrl: url, usedApiKey: true },
  )
  assert(!JSON.stringify(mapped).includes(SECRET), '映射结果里没有 Key 明文')
  assertEq(mapped.usedApiKey, true, '只记录"用了 Key"这个事实')
  assert(mapped.requestUrl.includes('api_key=***'), 'provenance 里的 URL 已脱敏')
}

/* ── 3. 摘要重建 ───────────────────────────────────────────────────── */
console.log('\n[3] 摘要倒排索引重建')
{
  const inv = { We: [0], propose: [1], a: [2], method: [3], for: [4], UAV: [5], localization: [6] }
  assertEq(LIT.reconstructAbstract(inv), 'We propose a method for UAV localization', '按位置还原顺序')
  assertEq(LIT.reconstructAbstract(inv, 10), 'We propose…', '超长截断并加省略号')
  assertEq(LIT.reconstructAbstract(undefined), undefined, '缺索引 → undefined')
  assertEq(LIT.reconstructAbstract({ a: 'not-an-array' }), undefined, '非法索引 → undefined')
  assertEq(LIT.reconstructAbstract({ a: [-1] }), undefined, '非法位置 → undefined')
}

/* ── 4. 响应映射 ───────────────────────────────────────────────────── */
console.log('\n[4] 响应映射（总数 ≠ 返回数）')
{
  const raw = {
    meta: { count: 12532 },
    results: [
      {
        id: 'https://openalex.org/W1',
        display_name: 'Robust Visual-Lidar SLAM for UAV',
        publication_year: 2021,
        doi: 'https://doi.org/10.1109/x',
        cited_by_count: 50,
        primary_location: { source: { display_name: 'IEEE GRSL' } },
        open_access: { oa_url: 'https://example.org/paper.pdf' },
        authorships: [
          { author: { display_name: 'Jie Qian' } },
          { author: { display_name: 'Second Author' } },
          { author: { display_name: 'Third' } },
          { author: { display_name: 'Fourth' } },
          { author: { display_name: 'Fifth' } },
        ],
        abstract_inverted_index: { We: [0], propose: [1] },
        type: 'article',
      },
      { garbage: true },
    ],
  }
  const r = LIT.mapOpenAlexResponse(raw, { query: 'q', requestUrl: 'https://x/?api_key=***', usedApiKey: true })
  assertEq(r.total, 12532, 'total 取 meta.count（命中总数）')
  assertEq(r.returned, 1, 'returned 只算能映射的记录')
  assertEq(r.source, 'openalex', 'source 标注为 openalex')
  assert(typeof r.retrievedAt === 'string' && r.retrievedAt.includes('T'), '记录检索时刻（Skill 要求 retrieval date）')
  assert(r.total > r.returned, '（演示）总数大于返回数 → 覆盖度结论不能只看这一页')

  const w = r.results[0]
  assertEq(w.title, 'Robust Visual-Lidar SLAM for UAV', '标题')
  assertEq(w.year, 2021, '年份')
  assertEq(w.venue, 'IEEE GRSL', '发表处')
  assertEq(w.citedByCount, 50, '被引数')
  assertEq(w.authors.length, 4, '作者截断到 4 位')
  assertEq(w.openAccessUrl, 'https://example.org/paper.pdf', '开放获取地址')
  assertEq(w.abstract, 'We propose', '摘要重建')
  assert(!('garbage' in w), '无关字段不透传')
}

/* ── 5. 失败必须带原因（绝不冒充"没检索到"）───────────────────────── */
console.log('\n[5] 失败的四种形态')
{
  const noKeyDeps = { apiKey: () => '' }

  const empty = await LIT.searchOpenAlex({ query: '   ' }, noKeyDeps)
  assert(LIT.isLiteratureError(empty) && empty.kind === 'no-query', '空检索式 → no-query')

  const httpErr = await LIT.searchOpenAlex(
    { query: 'x' },
    { apiKey: () => SECRET, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) },
  )
  assert(LIT.isLiteratureError(httpErr) && httpErr.kind === 'http', 'HTTP 失败 → kind=http')
  assertEq(httpErr.status, 401, '带上状态码')
  assert(/检索源|Key/.test(httpErr.message), '401 时提示去设置里检查 Key')

  const netErr = await LIT.searchOpenAlex(
    { query: 'x' },
    {
      apiKey: () => '',
      fetchImpl: async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      },
    },
  )
  assert(LIT.isLiteratureError(netErr) && netErr.kind === 'network', '网络异常 → kind=network')
  assert(/ENOTFOUND/.test(netErr.message), '保留底层原因')

  // 超时：底层 fetch 永不 settle，也必须返回而不是挂死
  const t0 = Date.now()
  const timedOut = await LIT.searchOpenAlex(
    { query: 'x' },
    { apiKey: () => '', fetchImpl: () => new Promise(() => {}), timeoutMs: 120 },
  )
  assert(LIT.isLiteratureError(timedOut), '挂起 → 超时后返回错误（不挂死）')
  assert(/超时/.test(timedOut.message), '错误信息说明是超时')
  assert(Date.now() - t0 < 5000, '超时可配置且真的生效')

  // 成功路径
  const ok = await LIT.searchOpenAlex(
    { query: 'uav' },
    {
      apiKey: () => SECRET,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ meta: { count: 3 }, results: [] }) }),
    },
  )
  assert(!LIT.isLiteratureError(ok), '正常响应 → 返回结果而不是错误')
  assertEq(ok.total, 3, '总数正确')
}

/* ── 6. 工具注册与注入 ─────────────────────────────────────────────── */
console.log('\n[6] Agent 能不能真的调到')
{
  assertEq(TOOLS.LITERATURE_TOOL, 'research_literature_search', '工具名符合研究工具命名')

  const ws = mkdtempSync(join(tmpdir(), 'cf-lit-tool-'))
  // 未注入依赖时**也注册**该工具：让 Agent 能发现它，并在调用时得到一句解释。
  // 静默不注册会让"检索能力存在与否"完全不可见 —— 那正是这次要修的问题。
  const without = TOOLS.defineResearchTools(() => ws)
  assertEq(without.length, 8, '未注入依赖时仍注册 8 个工具（可发现）')
  const bare = without.find((t) => t.name === TOOLS.LITERATURE_TOOL)
  const bareOut = await bare.execute({ query: 'x' }, {})
  assert(bareOut.ok === false, '未注入依赖时调用返回失败而不是抛错')
  assert(/未启用/.test(bareOut.error ?? ''), '失败信息说明检索未启用')

  let seenKey = null
  const withDeps = TOOLS.defineResearchTools(() => ws, {
    apiKey: () => {
      seenKey = 'read'
      return SECRET
    },
    fetchImpl: async (url) => {
      assert(url.includes(`api_key=${SECRET}`), '（被测）请求 URL 带上配置的 Key')
      return { ok: true, status: 200, json: async () => ({ meta: { count: 7 }, results: [] }) }
    },
  })
  assertEq(withDeps.length, 8, '注入后注册 8 个工具（多了文献检索）')

  const tool = withDeps.find((t) => t.name === TOOLS.LITERATURE_TOOL)
  assert(tool !== undefined, '找到文献检索工具')
  const out = await tool.execute({ query: 'visual lidar uav', perPage: 5 }, {})
  assertEq(seenKey, 'read', '每次调用都实时读取 Key（设置改完立即生效）')
  assert(out.ok === true, '工具返回 ok')
  assert(out.provenance && out.provenance.total === 7, '返回 provenance（含命中总数）')
  assert(!JSON.stringify(out).includes(SECRET), '工具返回值里**没有**密钥明文')
  assert(/命中 7 条/.test(out.coverageNote ?? ''), '给出覆盖度提示')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 8. 检索字段（field）：覆盖度结论必须写明检索有多宽 ─────────────── */
console.log('\n[7] 检索字段（any / title_abstract / title）')
{
  // 默认（any）走全文 search，不能退化成 filter
  const dflt = new URL(LIT.buildOpenAlexUrl({ query: 'solution separation' }))
  assertEq(dflt.searchParams.get('search'), 'solution separation', '默认用全文 search 参数')
  assertEq(dflt.searchParams.get('filter'), null, '默认不带 filter')

  // 受限字段必须走 filter，且**不能**再带 search（否则两个条件会互相稀释）
  const ta = new URL(LIT.buildOpenAlexUrl({ query: 'solution separation', field: 'title_abstract' }))
  assertEq(ta.searchParams.get('search'), null, 'title_abstract 时不再传 search')
  assertEq(ta.searchParams.get('filter'), 'title_and_abstract.search:solution separation', '标题+摘要过滤')

  const ti = new URL(LIT.buildOpenAlexUrl({ query: 'GRIL-Calib', field: 'title' }))
  assertEq(ti.searchParams.get('filter'), 'title.search:GRIL-Calib', '仅标题过滤（用于"是否已有人以此为题"）')

  // 与年份/开放获取叠加时仍是**一个** filter（OpenAlex 用逗号分隔）
  const both = new URL(
    LIT.buildOpenAlexUrl({ query: 'x', field: 'title', yearFrom: 2020, yearTo: 2024, openAccessOnly: true }),
  )
  assertEq(both.searchParams.get('filter'), 'title.search:x,publication_year:2020-2024,is_oa:true', '字段与年份/OA 合并')

  // 字段名归一化：大小写与未知值都要收敛，不能让拼错静默变宽或变窄
  assertEq(LIT.normalizeField('TITLE'), 'title', '字段名大小写不敏感')
  assertEq(LIT.normalizeField('title_and_abstract'), 'title_abstract', '合法字段直通')
  assertEq(LIT.normalizeField('nonsense'), 'any', '未知字段收敛到 any')
  assertEq(LIT.normalizeField(undefined), 'any', '缺省字段为 any')
  assert(LIT.LITERATURE_FIELDS.includes('title_abstract'), '字段枚举含 title_abstract')

  // provenance 必须记下用了哪个字段：否则"未发现"无法被解释
  const q = LIT.mapOpenAlexResponse(
    { meta: { count: 1 }, results: [] },
    { query: 'x', requestUrl: 'https://api.openalex.org/works?search=x', usedApiKey: false, field: 'title' },
  )
  assertEq(q.field, 'title', 'provenance 记录实际使用的字段')
  assertEq(
    LIT.mapOpenAlexResponse({}, { query: 'x', requestUrl: 'u', usedApiKey: false }).field,
    'any',
    '未声明字段时 provenance 记为 any',
  )

  // 工具层：schema 必须暴露 field，且执行时真的传到 URL 上
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-lit-field-'))
  let seenUrl = null
  const withDeps = TOOLS.defineResearchTools(() => ws, {
    apiKey: () => '',
    fetchImpl: async (url) => {
      seenUrl = url
      return { ok: true, status: 200, json: async () => ({ meta: { count: 3 }, results: [] }) }
    },
  })
  const tool = withDeps.find((t) => t.name === TOOLS.LITERATURE_TOOL)
  const fieldParam = tool?.parameters?.properties?.field
  assert(fieldParam !== undefined, '工具 schema 暴露 field 参数')
  assertEq((fieldParam?.enum ?? []).join(','), 'any,title_abstract,title', 'schema 枚举与常量一致')
  const out = await tool.execute({ query: 'consistency residual', field: 'title' }, {})
  assert(out.ok === true, '带 field 调用成功')
  assert(String(seenUrl).includes('title.search'), 'field 真的进了请求 URL')
  assert(!String(seenUrl).includes('&search='), '受限字段时不带全文 search')
  assertEq(out.provenance?.field, 'title', '返回值 provenance 带字段')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 7. Skill 必须指向这个工具 ─────────────────────────────────────── */
console.log('\n[8] literature-search Skill 指向真实工具')
{
  const skill = readFileSync(join(PKG, 'skills', 'literature', 'literature-search.md'), 'utf8')
  assert(skill.includes('research_literature_search'), 'Skill 正文提到该工具（否则选择到了也不知道怎么执行）')
  assert(/never\*{0,2} present an empty result|绝不.*空结果|never present an empty/.test(skill), 'Skill 要求：失败不许伪装成"没检索到"')
  // 迁移映射的位置随仓库布局而异（monorepo 里包在 packages/<pkg> 下，
  // 独立仓库里包就是仓库根）——向上找，别写死相对层级。
  const mapPath = (() => {
    let dir = resolve(PKG)
    for (let i = 0; i < 5; i++) {
      const cand = join(dir, 'scripts', 'lib', 'skill-migration-map.mjs')
      if (existsSync(cand)) return cand
      dir = resolve(dir, '..')
    }
    return null
  })()
  assert(mapPath !== null, '找得到迁移映射（生成源）')
  assert(mapPath !== null && readFileSync(mapPath, 'utf8').includes('research_literature_search'), '迁移映射（生成源）里也有 —— 重新生成不会丢')
}

/* ── 9. 渲染输出：作者必须出现在模型看到的文本里 ───────────────────── */
console.log('\n[9] 渲染输出（作者可见）')
{
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-lit-render-'))
  const rawResults = [
    {
      id: 'https://openalex.org/W1',
      display_name: 'FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance',
      publication_year: 2023,
      doi: 'https://doi.org/10.48550/arxiv.2305.05176',
      cited_by_count: 52,
      primary_location: { source: { display_name: 'arXiv (Cornell University)' } },
      open_access: { oa_status: 'green' },
      authorships: [
        { author: { display_name: 'Lingjiao Chen' } },
        { author: { display_name: 'Matei Zaharia' } },
        { author: { display_name: 'James Zou' } },
      ],
    },
    {
      id: 'https://openalex.org/W2',
      display_name: 'A Paper With Many Authors',
      publication_year: 2024,
      authorships: [
        { author: { display_name: 'A One' } },
        { author: { display_name: 'B Two' } },
        { author: { display_name: 'C Three' } },
        { author: { display_name: 'D Four' } },
        { author: { display_name: 'E Five' } },
        { author: { display_name: 'F Six' } },
      ],
    },
  ]
  const tools = TOOLS.defineResearchTools(() => ws, {
    apiKey: () => '',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ meta: { count: 2 }, results: rawResults }) }),
  })
  const tool = tools.find((t) => t.name === TOOLS.LITERATURE_TOOL)
  const args = { query: 'frugalgpt' }
  const value = await tool.execute(args, {})
  const text = tool.output
    .render(args, value)
    .map((b) => b.text ?? '')
    .join('\n')

  assert(text.includes('Lingjiao Chen'), '渲染输出含第一位作者')
  assert(text.includes('Matei Zaharia') && text.includes('James Zou'), '渲染输出含其余作者')
  assert(text.includes('2023'), '渲染输出含年份')
  assert(text.includes('arXiv (Cornell University)'), '渲染输出含发表处')
  assert(text.includes('52 cites'), '渲染输出含被引数')
  assert(text.includes('2305.05176'), '渲染输出含全文/DOI 链接')
  assert(text.includes('A One, B Two, C Three, D Four, et al.'), '作者被截断时补 et al.（6 位 → 4 位 + et al.）')
  // 回归：作者曾经只进结构化 payload，渲染文本以"— 年份"开头，作者无从可见
  assert(!text.includes('— 2023 ·'), '作者排在年份之前（不再以"— 年份"开头）')

  // 失败路径也要渲染出原因，而不是空文本
  const failText = tool.output
    .render({ query: 'x' }, { ok: false, error: 'boom' })
    .map((b) => b.text ?? '')
    .join('')
  assert(/boom/.test(failText), '失败时渲染出原因')
  rmSync(ws, { recursive: true, force: true })
}

console.log(`\n${failed === 0 ? '✅' : '❌'} literature-search: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
