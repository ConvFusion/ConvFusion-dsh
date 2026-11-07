#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 研究决策辅助（DCRM，v0.7.0）验证。
 *
 * ## 它守的是什么
 *
 * `research_decision_assist` 把"当前研究状态的投影 + 决策问题 + 候选项"发给
 * ConvFusion 决策服务，取回候选内归一化概率，并把这次咨询**留痕**在
 * `research/decision-assists/`。这类"把本机研究数据发出去"的功能，错的形态都很安静：
 *
 *   1. **关着开关还联网** —— 隐私事故，而且用户完全看不出来；
 *   2. **跳过被说成用过** —— 研究记录里于是多了一条并不存在的依据；
 *   3. **同一决策重复推理** —— 缓存/在途合并失效（codex 侧实测踩过）；
 *   4. **关掉开关后还命中缓存** —— 用户以为关掉了，建议还在弹；
 *   5. **留痕把只读会话弄坏** —— 咨询本身不该依赖写权限；
 *   6. **超时没兜住** —— 响应头回来了、JSON 体卡住，调用永远不返回。
 *
 * 本套验证**不联网**：注入 `fetchImpl`，逐条钉住上面六件事。
 *
 * 用法：`node scripts/verify-decision-assist.mjs`
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const DA = await import(lib('research/decision-assist.js'))
const TOOLS = await import(lib('research/research-tools.js'))

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

const temp = mkdtempSync(join(tmpdir(), 'convfusion-dcrm-'))
const ws = join(temp, 'workspace')
mkdirSync(join(ws, 'research'), { recursive: true })
writeFileSync(
  join(ws, 'project.md'),
  '---\ntopic: Offline decision test\n---\n# Offline decision test\n\n## Research Questions\n- Does the projection carry the question?\n',
)
writeFileSync(
  join(ws, 'research-state.md'),
  [
    '# Research State',
    '',
    '## Research Questions',
    'Does the projection carry the question?',
    '',
    '## Hypotheses',
    'H1: it does.',
    '',
    '## Method',
    'Project the state, ask the model.',
    '',
    '## Evidence',
    '- A baseline is missing.',
    '- The split is not documented.',
    '',
    '## Claims',
    'C001: the metric is identifiable.',
    '',
    '## Decisions',
    'D001: keep the small stratum visible.',
    '',
  ].join('\n'),
)

const env = { CONVFUSION_ENV: 'production' }
const config = {
  serverUrl: 'https://convfusion.invalid',
  convfusionProdApiKey: 'cf_live_offline_test',
  decisionAssistEnabled: true,
}
const args = {
  decision_type: 'C1_next_action_selection',
  decision_question: 'What should we do next?',
  candidate_options: [
    { label: 'ablation', text: 'Run the missing size-stratum ablation' },
    { label: 'write', text: 'Write the results section first' },
  ],
}

/** 成功响应（与 `app/services/decision_model.py` 的返回同形）。 */
function goodResponse(body) {
  const probs = body.candidate_options.map((o, i) => ({ ...o, probability: i === 0 ? 0.8 : 0.2 }))
  return new Response(
    JSON.stringify({
      status: 'used',
      decision_type: body.decision_type,
      predicted_label: probs[0].label,
      predicted_text: probs[0].text,
      probabilities: probs,
      top3_labels: probs.map((p) => p.label),
      model: 'DCRM',
      input_tokens: 100,
      input_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      probability_kind: 'candidate_normalized_uncalibrated',
    }),
    { status: 200 },
  )
}

/** 研究根快照（除咨询记录目录外的一切都要逐字节不变）。 */
function snapshot(dir, { skipAssists = true } = {}) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(current, entry.name)
      const rel = abs.slice(dir.length + 1)
      if (skipAssists && rel.startsWith('research/decision-assists')) continue
      out.push(entry.isDirectory() ? `D ${rel}` : `F ${rel} ${createHash('sha256').update(readFileSync(abs)).digest('hex')}`)
      if (entry.isDirectory()) walk(abs)
    }
  }
  walk(dir)
  return out
}

try {
  const original = snapshot(ws)

  /* ── [1] 门禁：四道门都不许联网 ─────────────────────────────────── */
  console.log('\n[1] 未发请求就该返回的四种情况')
  {
    const calls = []
    const fetchImpl = async (url) => {
      calls.push(url)
      return new Response('{}')
    }
    const assist = DA.createDecisionAssistant(() => config, env, { fetchImpl })
    config.decisionAssistEnabled = false
    assertEq((await assist(ws, args)).reason, 'disabled', '关闭开关 → skipped/disabled')
    config.decisionAssistEnabled = true

    const saved = config.convfusionProdApiKey
    config.convfusionProdApiKey = ''
    assertEq((await assist(ws, args)).reason, 'not_logged_in', '未登录 → skipped/not_logged_in')
    config.convfusionProdApiKey = saved

    assertEq((await assist(temp, args)).reason, 'no_research_workspace', '非研究工作区 → skipped/no_research_workspace')

    assertEq(
      (await assist(ws, { ...args, candidate_options: [args.candidate_options[0], args.candidate_options[0]] })).reason,
      'invalid_input',
      '候选项 label 重复 → skipped/invalid_input',
    )
    assertEq(
      (await assist(ws, { ...args, candidate_options: [args.candidate_options[0]] })).reason,
      'invalid_input',
      '只给 1 个候选项 → skipped/invalid_input',
    )
    assertEq(
      (await assist(ws, { ...args, decision_type: 'Z9_not_a_type' })).reason,
      'invalid_input',
      '非法决策类型 → skipped/invalid_input',
    )
    assertEq(calls.length, 0, '以上全部零网络请求')
  }

  /* ── [2] 状态投影 ──────────────────────────────────────────────── */
  console.log('\n[2] 状态投影')
  {
    const projection = DA.decisionState(ws)
    assertEq(projection.research_state.research_question, 'Does the projection carry the question?', '研究问题取自 Research Questions 维度')
    assertEq(projection.research_state.hypothesis, 'H1: it does.', '假设维度逐字投影')
    assertEq(projection.research_state.evidence.length, 2, '证据按行切成 2 项（而不是压成一条）')
    assertEq(projection.research_state.evidence[0], 'A baseline is missing.', '列表项去掉了 Markdown 项目符号')
    assertEq(projection.research_state.claims[0], 'C001: the metric is identifiable.', '主张维度进入投影')
    assertEq(projection.research_state.history[0], 'D001: keep the small stratum visible.', '决策维度进入 history')
    assertEq(projection.state_version, '1', 'state_version 取自 research-state.md 的 frontmatter')
    assert(
      projection.sources.includes('project.md') && projection.sources.includes('research-state.md'),
      'sources 列出实际存在的文件',
    )
    assertEq(projection.truncated_fields.length, 0, '未截断时 truncated_fields 为空')
  }

  /* ── [3] 预算守卫 ──────────────────────────────────────────────── */
  console.log('\n[3] 超预算先拦（不发请求）')
  {
    const heavy = join(temp, 'heavy')
    mkdirSync(join(heavy, 'research'), { recursive: true })
    writeFileSync(join(heavy, 'project.md'), '---\ntopic: Heavy\n---\n# Heavy\n')
    const longCjk = '研'.repeat(500)
    writeFileSync(
      join(heavy, 'research-state.md'),
      ['# Research State', '', '## Problem', longCjk, '## Hypotheses', longCjk, '## Method', longCjk, '## Evidence', longCjk, '## Claims', longCjk, '## Decisions', longCjk, '## Experiments', longCjk].join('\n'),
    )
    let calls = 0
    const assist = DA.createDecisionAssistant(() => config, env, {
      fetchImpl: async () => {
        calls++
        return new Response('{}')
      },
    })
    const res = await assist(heavy, args)
    assertEq(res.reason, 'input_too_long', '中文状态撑满预算 → skipped/input_too_long')
    assertEq(calls, 0, '超预算不发送请求')
    assert(typeof res.estimated_tokens === 'number' && res.estimated_tokens > 1800, '回执给出估算 token（便于收缩）')
  }

  /* ── [4] 正常咨询、在途合并、缓存 ──────────────────────────────── */
  console.log('\n[4] 咨询 / 合并 / 缓存')
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization })
    const body = JSON.parse(init.body)
    assert(body.research_state.evidence.includes('A baseline is missing.'), '请求体带上了状态投影')
    return goodResponse(body)
  }
  {
    const assist = DA.createDecisionAssistant(() => config, env, { fetchImpl })
    let requesting = 0
    const onRequest = () => {
      requesting++
    }
    const [first, second] = await Promise.all([assist(ws, args, onRequest), assist(ws, args, onRequest)])
    assertEq(first.status, 'used', '正常响应 → status used')
    assertEq(first.predicted_label, 'ablation', '推荐项 = 概率最大项')
    assertEq(first.probabilities.length, 2, '概率与候选项等长')
    assert(Array.isArray(first.top3_labels) && first.top3_labels[0] === 'ablation', 'top3 与排序一致')
    assertEq(second.shared_request, true, '同一在途请求被合并（shared_request）')
    assertEq(requesting, 1, '只有真正的新请求触发一次 onRequest')
    assertEq(calls.length, 1, '并发两次只发一次网络请求')
    assertEq(calls[0].url, 'https://convfusion.invalid/api/v1/decision-model/assist', '打的是决策辅助端点')
    assertEq(calls[0].auth, 'Bearer cf_live_offline_test', '带 ConvFusion 凭据')

    const third = await assist(ws, args, onRequest)
    assertEq(third.cached, true, '60 秒内复用 → cached')
    assertEq(calls.length, 1, '缓存命中不再联网')
    assertEq(requesting, 1, '缓存命中不触发 onRequest')
    assertEq(first.cached, false, '首次结果不是 cached')

    /* ── [5] 留痕与采纳回填 ───────────────────────────────────────── */
    console.log('\n[5] 留痕（consult 写记录 + annotate 回填）')
    assert(typeof first.id === 'string' && /^A\d{3}$/.test(first.id), `咨询返回 id（${first.id}）`)
    assertEq(first.record, `research/decision-assists/${first.id}.json`, 'record 是研究根相对路径')
    const recordPath = join(ws, first.record)
    assert(existsSync(recordPath), '咨询记录已落盘')
    const saved = JSON.parse(readFileSync(recordPath, 'utf8'))
    assertEq(saved.id, first.id, '记录里的 id 与回执一致')
    assertEq(saved.decision_type, args.decision_type, '记录保留决策类型')
    assertEq(saved.response.predicted_label, 'ablation', '记录保留返回的推荐项')
    assertEq(saved.adoption, null, '采纳情况初始为 null（等 Agent 回填）')
    assert(Array.isArray(saved.research_state.evidence), '记录保留发出去的状态投影（可追溯）')
    assertEq(third.id, first.id, '缓存命中返回同一个记录 id（不重复留痕）')

    const annotated = DA.annotateDecisionAssist(ws, first.id, 'adopt', 'it names the missing ablation')
    assert(annotated.ok === true, 'annotate 成功')
    const afterAdopt = JSON.parse(readFileSync(recordPath, 'utf8'))
    assertEq(afterAdopt.adoption.status, 'adopt', '采纳情况已写入')
    assertEq(afterAdopt.adoption.note, 'it names the missing ablation', '采纳依据已写入')
    assert(typeof afterAdopt.updated_at === 'string', '回填写了 updated_at')

    DA.annotateDecisionAssist(ws, first.id, 'reject', 'the ablation is already in the plan')
    const afterReject = JSON.parse(readFileSync(recordPath, 'utf8'))
    assertEq(afterReject.adoption.status, 'reject', '允许改判')
    assertEq(afterReject.adoption_history.length, 1, '改判保留旧值（不覆盖历史）')
    assertEq(afterReject.adoption_history[0].status, 'adopt', '历史里是上一次的 adopt')

    assert('error' in DA.annotateDecisionAssist(ws, 'A999', 'adopt', 'x'), '未知编号 → 报错')
    assert('error' in DA.annotateDecisionAssist(ws, first.id, 'maybe', 'x'), '非法采纳值 → 报错')
    assert('error' in DA.annotateDecisionAssist(ws, first.id, 'adopt', '  '), '空依据 → 报错')

    /* ── [6] 缓存失效条件 ─────────────────────────────────────────── */
    console.log('\n[6] 缓存失效：状态变化 / 换账号 / 关开关')
    // 往**被投影**的维度里加一行（这里落在最后一个章节 Decisions → 投影里的 history）
    writeFileSync(
      join(ws, 'research-state.md'),
      `${readFileSync(join(ws, 'research-state.md'), 'utf8')}\n- D002: keep the metric comparison honest.\n`,
    )
    await assist(ws, args)
    assertEq(calls.length, 2, '研究状态变化 → 缓存失效（新请求）')

    config.convfusionProdApiKey = 'cf_live_other_offline_user'
    await assist(ws, args)
    assertEq(calls.length, 3, '换账号 → 不共享缓存')
    config.convfusionProdApiKey = 'cf_live_offline_test'

    config.decisionAssistEnabled = false
    assertEq((await assist(ws, args)).reason, 'disabled', '关掉开关后即使有缓存也返回 disabled')
    config.decisionAssistEnabled = true
    await assist(ws, args)
    assertEq(calls.length, 4, '关过再开 → 缓存已被清空，重新请求')
  }

  /* ── [7] 失败一律降级 ─────────────────────────────────────────── */
  console.log('\n[7] 服务端失败 / 畸形响应 / 卡死')
  {
    for (const status of [401, 403, 404, 422, 429, 503]) {
      const failing = DA.createDecisionAssistant(() => config, env, { fetchImpl: async () => new Response('{}', { status }) })
      assertEq((await failing(ws, args)).reason, 'service_unavailable', `HTTP ${status} → skipped/service_unavailable`)
    }

    const malformed = DA.createDecisionAssistant(() => config, env, { fetchImpl: async () => new Response('{}') })
    assertEq((await malformed(ws, args)).reason, 'service_unavailable', '缺字段的响应 → skipped（不抛到工具层）')

    /** 概率和 ≠ 1 / 排序不一致 / 非 hex hash：一律拒绝。 */
    const bad = async (mutate) => {
      const impl = async (_url, init) => {
        const body = JSON.parse(init.body)
        const raw = JSON.parse(await goodResponse(body).text())
        mutate(raw)
        return new Response(JSON.stringify(raw))
      }
      const one = DA.createDecisionAssistant(() => config, env, { fetchImpl: impl })
      return one(ws, args)
    }
    assertEq((await bad((r) => (r.probabilities[0].probability = 0.9))).reason, 'service_unavailable', '概率和 ≠ 1 → 拒绝')
    assertEq(
      (await bad((r) => {
        r.predicted_label = r.candidate_options?.[1]?.label ?? 'write'
      })).reason,
      'service_unavailable',
      '推荐项与最大概率项不一致 → 拒绝',
    )
    assertEq((await bad((r) => (r.input_hash = 'not-a-hash'))).reason, 'service_unavailable', 'input_hash 非 64 位 hex → 拒绝')
    assertEq(
      (await bad((r) => (r.probability_kind = 'calibrated'))).reason,
      'service_unavailable',
      '概率类型不是 candidate_normalized_uncalibrated → 拒绝',
    )

    let aborted
    const stalled = DA.createDecisionAssistant(() => config, env, {
      timeoutMs: 20,
      fetchImpl: async (_url, init) => {
        aborted = init.signal
        return { ok: true, status: 200, json: () => new Promise(() => {}), text: () => new Promise(() => {}) }
      },
    })
    assertEq((await stalled(ws, args)).reason, 'service_unavailable', '响应体卡住 → 超时降级')
    assertEq(aborted.aborted, true, '超时确实 abort 了请求')
  }

  /* ── [8] 等待期间关掉开关 → 结果作废 ─────────────────────────── */
  console.log('\n[8] 事后设置校验')
  {
    let finish
    const changing = DA.createDecisionAssistant(() => config, env, {
      fetchImpl: (...values) =>
        new Promise((res) => {
          finish = async () => res(await goodResponse(JSON.parse(values[1].body)))
        }),
    })
    const waiting = changing(ws, args)
    config.decisionAssistEnabled = false
    await finish()
    assertEq((await waiting).reason, 'settings_changed', '等待期间关开关 → skipped/settings_changed')
    config.decisionAssistEnabled = true
  }

  /* ── [9] 只读研究根：咨询照做，留痕降级 ───────────────────────── */
  console.log('\n[9] 只读研究根')
  {
    const readonly = join(temp, 'readonly')
    mkdirSync(join(readonly, 'research'), { recursive: true })
    writeFileSync(join(readonly, 'project.md'), '---\ntopic: Read only\n---\n# Read only\n')
    writeFileSync(join(readonly, 'research-state.md'), '# Research State\n\n## Method\nNothing to write.\n')
    // 只读要落在**真正会被写入的目录**上：记录写进 `research/` 下，
    // 只 chmod 根目录挡不住（`mkdir research/decision-assists` 只要求 research/ 可写）。
    chmodSync(join(readonly, 'research'), 0o555)
    chmodSync(readonly, 0o555)
    try {
      // 用一份**独立的** mock：只关心"能不能咨询"，不关心投影内容
      const readonlyFetch = async (_url, init) => goodResponse(JSON.parse(init.body))
      const out = await DA.createDecisionAssistant(() => config, env, { fetchImpl: readonlyFetch })(readonly, args)
      assertEq(out.status, 'used', '只读研究根仍然可以咨询')
      assert(typeof out.record_warning === 'string', '留痕失败给出 record_warning（而不是让咨询失败）')
      assertEq(out.record, undefined, '没有记录路径')
      assert(!existsSync(join(readonly, 'research/decision-assists')), '只读根下没有创建任何目录')
    } finally {
      chmodSync(readonly, 0o755)
      chmodSync(join(readonly, 'research'), 0o755)
    }
  }

  /* ── [10] 零写盘（除咨询记录）────────────────────────────────── */
  console.log('\n[10] 咨询不改研究资产')
  {
    const before = snapshot(ws)
    const fresh = await DA.createDecisionAssistant(() => config, env, { fetchImpl })(ws, {
      ...args,
      decision_question: 'Snapshot check with a different question?',
    })
    assertEq(fresh.status, 'used', '（快照用例的一次真实咨询）')
    const after = snapshot(ws)
    assertEq(JSON.stringify(after), JSON.stringify(before), '一次咨询前后研究资产逐字节不变（除 research/decision-assists/）')
  }
  {
    const dirs = readdirSync(join(ws, 'research')).sort()
    assert(dirs.includes('decision-assists'), '咨询记录落在 research/decision-assists/')
    for (const name of ['evidence', 'claims', 'decisions', 'state-history']) {
      assert(!dirs.includes(name) || readdirSync(join(ws, 'research', name)).length === 0, `咨询没有往 research/${name}/ 写任何东西`)
    }
  }
  assert(original.length > 0, '基准快照非空')

  /* ── [11] 工具层：注册、参数、渲染、annotate 分支 ─────────────── */
  console.log('\n[11] 工具层')
  {
    const tools = TOOLS.defineResearchTools(() => ws, undefined, undefined, {
      getConfig: () => config,
      net: { fetchImpl },
    })
    const tool = tools.find((t) => t.name === TOOLS.DECISION_ASSIST_TOOL)
    assert(!!tool, 'research_decision_assist 已注册')
    // 注意：defineTool 的包装会**先校验参数**，所以必须传一份合法参数才拿到 true
    assertEq(tool.isConcurrencySafe?.({ ...args }), true, '只读咨询是并发安全的')

    const envelope = await tool.execute({ ...args }, { agent: { id: 'verify' } })
    assertEq(envelope.status, 'used', '经工具执行仍拿到 used')
    assert(typeof envelope.id === 'string', '工具回执带记录 id')

    const rendered = tool.output.render({ ...args }, envelope)
    const text = rendered.map((b) => b.text).join('\n')
    assert(/DCRM/.test(text), '渲染里出现 DCRM 标识')
    assert(/决策辅助/.test(text), '渲染里出现「决策辅助」中文标识')
    assert(/采纳情况/.test(text), '渲染要求说明采纳情况')
    assert(new RegExp(envelope.id).test(text), '渲染给出记录 id（可 annotate）')

    const annotated = await tool.execute(
      { action: 'annotate', id: envelope.id, adoption: 'partial', note: 'only the ablation part applies' },
      { agent: { id: 'verify' } },
    )
    assertEq(annotated.ok, true, 'annotate 分支可用')
    const renderedAnnotate = tool.output.render({ action: 'annotate' }, annotated)
    assert(/partial/.test(renderedAnnotate.map((b) => b.text).join('\n')), 'annotate 渲染显示采纳值')

    const bad = await tool.execute({ action: 'annotate', id: 'A999', adoption: 'adopt', note: 'x' }, { agent: { id: 'verify' } })
    assertEq(bad.ok, false, '未知编号 → ok:false（模型能看到原因）')

    // 枚举在 schema 层就被拒（ToolArgsError），到不了 execute —— 这是更早、更好的失败
    let threw = false
    try {
      await tool.execute({ action: 'nope' }, { agent: { id: 'verify' } })
    } catch {
      threw = true
    }
    assert(threw, '未知 action 在参数校验处就被拒（ToolArgsError）')

    const title = tool.presentCall({ ...args }).title
    assert(/DCRM 决策辅助/.test(title), `调用卡标题带 DCRM 决策辅助（${title}）`)
    assert(/调用中/.test(title), '调用卡标题表明"调用中"（DSH 没有进度通知，这就是可见面）')

    // 未接线（无 decisionDeps）时不能联网、也不能谎报"未登录"
    const bare = TOOLS.defineResearchTools(() => ws).find((t) => t.name === TOOLS.DECISION_ASSIST_TOOL)
    const bareResult = await bare.execute({ ...args }, { agent: { id: 'verify' } })
    assertEq(bareResult.reason, 'disabled', '没有注入依赖 → skipped/disabled')
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}

console.log(`\n${failed === 0 ? '✅' : '❌'} decision-assist: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
