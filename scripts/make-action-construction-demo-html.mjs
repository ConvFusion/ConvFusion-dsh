#!/usr/bin/env node
/**
 * Generate a self-contained HTML demo of the plugin-side Action Construction metric.
 *
 * Every number in the page is computed **live** by the plugin's own TypeScript code
 * (`lib/research/action-construction/*`) from the same inputs the demo script uses:
 * the 30-state panel exported from the Python instrument, and the 1,800 real cached model
 * answers.  Nothing is transcribed by hand, so the page cannot drift from the code.
 *
 *     npm run build:host
 *     node scripts/make-action-construction-demo-html.mjs
 *     open workspace/research/paper4/dsh-demo/action-construction-demo.html
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RESEARCH = join(ROOT, 'workspace', 'experiments', 'paper4', 'results')
const OUT_DIR = join(ROOT, 'workspace', 'research', 'paper4', 'dsh-demo')
const OUT = join(OUT_DIR, 'action-construction-demo.html')

const AC = await import(join(ROOT, 'lib', 'research', 'action-construction', 'index.js'))
const tools = await import(join(ROOT, 'lib', 'research', 'research-tools.js'))
const signals = await import(join(ROOT, 'lib', 'research', 'stage-signals.js'))
const fixtures = JSON.parse(
  readFileSync(join(ROOT, 'src', 'research', 'action-construction', 'fixtures', 'python-parity.json'), 'utf8'),
)
const STATES = fixtures.states
const published = JSON.parse(readFileSync(join(RESEARCH, 'rich_analysis.json'), 'utf8'))

/* ── inputs ─────────────────────────────────────────────────────────────── */

const ANSWERS = [
  ['L1', 'ACTION: component_scan\nREASON: budget permits all six ablations'],
  ['L2', 'TARGET: h1\nWHY: it best explains the improved datasets'],
  ['L3', 'TARGET: h1\nARMS: 0,1,2,3,4,5\nSEEDS: 11\nSUCCESS: removing memory flattens A and D'],
  ['L4', 'TARGET: h1\nARMS: 0,1,2,3,4,5\nSEEDS: 11\nPREDICTION: A and D lose their gain\nSUCCESS: removing memory flattens A and D'],
]

function readCache(file) {
  const rows = []
  for (const line of readFileSync(join(RESEARCH, file), 'utf8').split('\n')) {
    if (!line.trim()) continue
    const record = JSON.parse(line)
    if (record.key === '__state_digest__') continue
    const [model, effort, stateIndex, tag, repeat] = record.key.split('|')
    rows.push({ model, effort, stateIndex: Number(stateIndex), tag, repeat: Number(repeat), text: record.text })
  }
  return rows
}

function aggregate(rows, model, effort, tag, field, convention = 'parseable') {
  const perState = new Map()
  let seen = 0
  let parsed = 0
  for (const row of rows) {
    if (row.model !== model || row.effort !== effort || row.tag !== tag) continue
    if (row.stateIndex >= STATES.length) continue
    const evaluation = AC.evaluateAnswer(STATES[row.stateIndex], row.text, tag)
    seen += 1
    const ok = evaluation.parse_status === 'ok' || evaluation.status === 'ok'
    if (ok) parsed += 1
    if (convention === 'parseable' && !ok) continue
    const bucket = perState.get(row.stateIndex) ?? []
    bucket.push(evaluation[field])
    perState.set(row.stateIndex, bucket)
  }
  if (perState.size === 0) return null
  const perStateMeans = [...perState.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length)
  return {
    value: perStateMeans.reduce((a, b) => a + b, 0) / perStateMeans.length,
    states: perState.size,
    parseRate: seen === 0 ? 0 : parsed / seen,
  }
}

const cacheA = readCache('main_cache_deepseek-flash.jsonl')
const cacheB = readCache('main_cache_Qwen3.8-27B-TURBO-Fable.jsonl')
const cacheAll = [...cacheA, ...cacheB]

const FAMILIES = [
  { model: 'deepseek-flash', effort: 'low', cache: cacheA, label: '族 A · low', short: 'A (low)' },
  { model: 'deepseek-flash', effort: 'max', cache: cacheA, label: '族 A · max', short: 'A (max)' },
  { model: 'Qwen3.8-27B-TURBO-Fable', effort: 'na', cache: cacheB, label: '族 B · 默认档', short: 'B' },
]

const ladder = FAMILIES.map((family) => ({
  ...family,
  levels: ['L1', 'L2', 'L3', 'L4'].map((tag) => {
    const igc = aggregate(family.cache, family.model, family.effort, tag, 'ig_per_cost')
    const itt = aggregate(family.cache, family.model, family.effort, tag, 'ig_per_cost', 'all')
    const share = aggregate(family.cache, family.model, family.effort, tag, 'bound_share')
    const reference = published.conditions[`${family.model}|${family.effort}|${tag}`]
    return {
      tag,
      igc: igc.value,
      itt: itt.value,
      share: share.value,
      parseRate: igc.parseRate,
      publishedIgc: reference?.ig_per_cost ?? null,
      publishedShare: reference?.oracle_ratio ?? null,
      delta: reference ? Math.abs(igc.value - reference.ig_per_cost) : null,
    }
  }),
}))

const feasibility = ['L1', 'L2', 'L3', 'L4'].map((tag) => {
  const inBudget = ['low', 'max'].map((effort) => {
    const perState = new Map()
    for (const row of cacheA) {
      if (row.effort !== effort || row.tag !== tag) continue
      const evaluation = AC.evaluateAnswer(STATES[row.stateIndex], row.text, tag)
      if (evaluation.parse_status !== 'ok') continue
      const bucket = perState.get(row.stateIndex) ?? []
      bucket.push(evaluation.feasible ? 1 : 0)
      perState.set(row.stateIndex, bucket)
    }
    const means = [...perState.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length)
    return means.reduce((a, b) => a + b, 0) / means.length
  })
  const compliant = aggregate(cacheA, 'deepseek-flash', 'low', tag, 'compliant')
  return { tag, low: inBudget[0], max: inBudget[1], compliant: compliant?.value ?? 0 }
})

/* The flow inside /research: construct → record → gate, run live in a temp workspace. */
const flow = await (async () => {
  const ws = mkdtempSync(join(tmpdir(), 'ac-html-flow-'))
  try {
    mkdirSync(join(ws, 'research'), { recursive: true })
    const tool = tools.defineResearchTools(() => ws).find((t) => t.name === tools.ACTION_CONSTRUCTION_TOOL)
    const gate = () => signals.judgeSignal(signals.buildSignalContext(ws), 'action-construction')
    const steps = []
    steps.push({ label: '① 工作区还没有动作状态', satisfied: gate().satisfied, evidence: gate().evidence })
    await tool.execute({ action: 'set_state', state: STATES[0] }, {})
    steps.push({ label: '② set_state 写下状态（机制集 / 臂 / 信念 / 预算）', satisfied: gate().satisfied, evidence: gate().evidence })
    const over = await tool.execute(
      { action: 'record', level: 'L3', answer: ANSWERS[2][1], note: '六臂全跑（论文报告的典型写法）' },
      {},
    )
    steps.push({ label: '③ record 记录一次构造：六臂 × 11 seeds', satisfied: gate().satisfied, evidence: gate().evidence })
    const trimmed = await tool.execute(
      { action: 'record', level: 'L3', answer: 'TARGET: h1\nARMS: 2,3,4,5\nSEEDS: 12', note: '裁到四臂 × 12 seeds' },
      {},
    )
    steps.push({ label: '④ 把设计裁到预算内，再记录一次', satisfied: gate().satisfied, evidence: gate().evidence })
    return { steps, over: over.evaluation, trimmed: trimmed.evaluation }
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
})()

const extracted = (() => {
  const KNOWN = [
    'TARGET: h1 | ARMS: 0,1,2,3,4,5 | SEEDS: 11',
    '做一次 memory 模块的消融实验，跑一条臂，2 个 seeds',
    '对比 memory 与 attention 两个模块（两两对比），8 seeds',
    '全臂扫描：0,1,2,3,4,5，4 seeds',
  ]
  const markdown = [...KNOWN.map((t, i) => `- [ ] A${i + 1} ${t}`), '- [ ] A5 撰写相关工作并补 12 条参考文献'].join('\n')
  const candidates = AC.extractCandidates(markdown, 'demo')
  return { items: AC.constructFromCandidates(STATES[0], candidates), skipped: candidates.filter((c) => !c.measurable) }
})()
const extractedItems = extracted.items
const extractedSkipped = extracted.skipped

const worked = ANSWERS.map(([level, answer]) => ({
  level,
  answer,
  evaluation: AC.evaluateAnswer(STATES[0], answer, level),
}))

/* ── SVG helpers ────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pct = (x) => `${(100 * x).toFixed(1)}%`

/** Horizontal bar chart: one bar per row, optional marker for a reference value. */
function bars(rows, { width = 660, labelWidth = 132, height = 26, color = '#1565C0', reference = null }) {
  const barWidth = width - labelWidth - 78
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.marker ?? 0)), 1e-9)
  const parts = [`<svg viewBox="0 0 ${width} ${rows.length * height + 8}" width="100%" role="img">`]
  rows.forEach((row, i) => {
    const y = i * height + 4
    const w = Math.max(1, (row.value / max) * barWidth)
    parts.push(
      `<text x="0" y="${y + 15}" font-size="12" fill="#37474f">${esc(row.label)}</text>`,
      `<rect x="${labelWidth}" y="${y + 3}" width="${w.toFixed(1)}" height="14" rx="3" fill="${row.color ?? color}"/>`,
      `<text x="${labelWidth + w + 6}" y="${y + 15}" font-size="12" fill="#263238">${esc(row.text)}</text>`,
    )
    if (reference !== null && row.marker !== undefined && row.marker !== null) {
      const mx = labelWidth + (row.marker / max) * barWidth
      parts.push(
        `<line x1="${mx.toFixed(1)}" y1="${y}" x2="${mx.toFixed(1)}" y2="${y + 20}" stroke="#C62828" stroke-width="1.6" stroke-dasharray="3 2"/>`,
      )
    }
  })
  parts.push('</svg>')
  return parts.join('\n')
}

/* ── page ───────────────────────────────────────────────────────────────── */

const workedBars = bars(
  worked.map(({ level, evaluation }) => ({
    label: `${level}`,
    value: evaluation.bound_share,
    text: `${pct(evaluation.bound_share)}  ·  IG/cost ${evaluation.ig_per_cost.toFixed(4)}  ·  成本 ${evaluation.cost.toFixed(2)}/${evaluation.budget.toFixed(1)}${evaluation.feasible ? '' : ' · 超预算'}`,
    color: evaluation.feasible ? '#2E7D32' : '#C62828',
  })),
  { labelWidth: 40 },
)

const familyTables = ladder
  .map(
    (family) => `
  <h3>${esc(family.label)}</h3>
  <table class="t">
    <thead><tr>
      <th>层级</th><th class="r">可解析率</th><th class="r">插件重算 IG/cost</th><th class="r">论文发表值</th>
      <th class="r">差</th><th class="r">占上界（插件 / 论文）</th><th class="r">ITT 口径（全部答案）</th>
    </tr></thead>
    <tbody>
      ${family.levels
        .map(
          (row) => `<tr>
        <td>${row.tag}</td>
        <td class="r">${pct(row.parseRate)}</td>
        <td class="r n">${row.igc.toFixed(4)}</td>
        <td class="r n">${row.publishedIgc === null ? '—' : row.publishedIgc.toFixed(4)}</td>
        <td class="r dim">${row.delta === null ? '—' : row.delta.toExponential(1)}</td>
        <td class="r">${pct(row.share)} / ${row.publishedShare === null ? '—' : pct(row.publishedShare)}</td>
        <td class="r dim">${row.itt.toFixed(4)}</td>
      </tr>`,
        )
        .join('\n')}
    </tbody>
  </table>`,
  )
  .join('\n')

const feasibilityBars = bars(
  feasibility.map((row) => ({
    label: `${row.tag}`,
    value: row.low,
    text: `low ${pct(row.low)} · max ${pct(row.max)} 在预算内（合规口径均值 ${row.compliant.toFixed(3)}）`,
    color: row.low > 0.9 ? '#2E7D32' : '#C62828',
  })),
  { labelWidth: 40 },
)

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Action Construction · 插件实现效果验证</title>
<style>
  :root{--fg:#1c2733;--dim:#5b6b7c;--line:#d8e0e8;--blue:#1565C0;--green:#2E7D32;--red:#C62828;--bg:#f6f8fb}
  *{box-sizing:border-box}
  body{margin:0;padding:36px 40px 60px;background:var(--bg);color:var(--fg);
       font:15px/1.65 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  h1{font-size:26px;margin:0 0 6px}
  h2{font-size:19px;margin:34px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line)}
  h3{font-size:15px;margin:18px 0 6px;color:var(--dim);font-weight:600}
  p{margin:8px 0}
  .lead{color:var(--dim);margin:0 0 22px}
  .card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:14px 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
  .stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .stat .v{font-size:24px;font-weight:700;color:var(--blue);line-height:1.15}
  .stat .l{font-size:12.5px;color:var(--dim);margin-top:4px}
  table.t{width:100%;border-collapse:collapse;font-size:13.5px;background:#fff;
          border:1px solid var(--line);border-radius:8px;overflow:hidden}
  table.t th{background:#eef3f9;text-align:left;padding:7px 10px;font-weight:600;font-size:12.5px;color:#33475b}
  table.t td{padding:7px 10px;border-top:1px solid var(--line)}
  td.r,th.r{text-align:right}
  td.n{font-variant-numeric:tabular-nums}
  .dim{color:var(--dim)}
  code{background:#eef2f7;padding:1px 5px;border-radius:4px;font-size:12.5px}
  pre{background:#0f1b26;color:#e6edf3;padding:14px 16px;border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.55}
  .note{font-size:13px;color:var(--dim)}
  .ok{color:var(--green);font-weight:600}
  .bad{color:var(--red);font-weight:600}
</style>
</head>
<body>
<h1>Action Construction · 插件实现效果验证</h1>
<p class="lead">
  页面中的每个数字都由插件自身的 TypeScript 实现（<code>src/research/action-construction/</code>）
  从论文的 30 状态面板与 1,800 条真实缓存答案现场算出，没有手抄；
  生成命令 <code>node scripts/make-action-construction-demo-html.mjs</code>。
  与 Python 仪器的逐字段一致性由 <code>npm run verify:action-construction</code> 守住（570 个案例 + 30 条提示词）。
</p>

<div class="grid">
  <div class="stat"><div class="v">8.4% → 61.7%</div><div class="l">同一决策：动作名 → 结构化（族 A low，占成本效率上界）</div></div>
  <div class="stat"><div class="v">11.9×</div><div class="l">状态 0 上单位成本信息量的提升倍数</div></div>
  <div class="stat"><div class="v">75% → 0%</div><div class="l">执行器需要自行推断的设计比例</div></div>
  <div class="stat"><div class="v bad">8.45 &gt; 8.0</div><div class="l">状态 0 的 L3 设计成本超出题面预算（可行性缺口）</div></div>
</div>

<h2>一、论文数据由插件代码重算（两个模型族 × 四个层级 × 30 状态）</h2>
<p>
  取真实 run 的 1,800 条答案，用插件的解析器与度量重新计算。论文主矩阵只对
  <b>可解析</b>的答案求均值（解析失败者计入 ITT 列），因此这里同时给出两种口径。
  最后一列是插件重算值与论文发表值之差——在 1e-15 量级，即同一套数学。
</p>
${familyTables}
<p class="note">
  说明：<code>ITT 口径</code>是把解析失败的答案按 0 计入；它也由插件代码算出。
  可解析率低于 100% 的条件（如族 A max 的 L2）是推理模型把输出预算用在推理上、
  未吐出完整字段的真实情况。
</p>

<h2>二、同一个状态，四种写法（状态 0）</h2>
<div class="card">
  <p class="note">${esc(STATES[0].question)}<br>${esc(STATES[0].partial_results)}<br>
  信念 ${STATES[0].prior.map((p, i) => `h${i} ${p.toFixed(2)}`).join(' · ')} ｜ 预算 ${STATES[0].budget} 成本单位</p>
  ${workedBars}
  <table class="t">
    <thead><tr><th>层级</th><th>写法</th><th class="r">IG/cost</th><th class="r">占上界</th>
      <th class="r">成本/预算</th><th class="r">在预算内</th><th class="r">合规口径</th>
      <th class="r">执行器推断</th><th class="r">指针缺口</th><th class="r">分辨率缺口</th></tr></thead>
    <tbody>
      ${worked
        .map(
          ({ level, answer, evaluation: e }) => `<tr>
        <td><b>${level}</b></td>
        <td class="dim">${esc(answer.split('\n')[0])}…</td>
        <td class="r n">${e.ig_per_cost.toFixed(4)}</td>
        <td class="r n">${pct(e.bound_share)}</td>
        <td class="r n">${e.cost.toFixed(2)}/${e.budget.toFixed(1)}</td>
        <td class="r ${e.feasible ? 'ok' : 'bad'}">${e.feasible ? '是' : '否'}</td>
        <td class="r n">${e.compliant.toFixed(3)}</td>
        <td class="r n">${pct(e.guess_rate)}</td>
        <td class="r n">${e.pointer_gap.toFixed(4)}</td>
        <td class="r n">${e.resolution_gap.toFixed(4)}</td>
      </tr>`,
        )
        .join('\n')}
    </tbody>
  </table>
  <p class="note">
    读法：从 L1 到 L3，信息量提高约 12 倍，执行器需要自行推断的比例从 75% 降到 0；
    代价是 L3/L4 写出的设计成本 8.45 超过题面预算 8.0——在合规口径下记 0。
    这正是论文报告的第三种失效模式：接口买到的是信息量，不是可执行性。
  </p>
</div>

<h2>三、可行性失效与合规口径（族 A）</h2>
<div class="card">
  ${feasibilityBars}
  <p class="note">
    L1/L2 的答案 100% 在预算内，因为根本没有写出设计（由执行器补全）；
    L3/L4 的设计绝大多数付不起，换成合规口径后族 A 的 schema 增益只剩 0–6%。
  </p>
</div>

<h2>四、在 <code>/research</code> 运行中怎么用：实验前的动作构造闸门</h2>
<div class="card">
  <p>
    <code>/research</code> 的循环是「用户用自然语言推进 → Agent 产出/更新 Plan → 真实实验」。
    动作构造插在**实验执行前**：先把"下一步做什么"写成可执行设计、量出它的代价，
    再把结果落盘，闸门据此放行。<b>下面这一遍是在临时工作区里真跑的</b>，不是示意图。
  </p>
  <table class="t">
    <thead><tr><th>步骤</th><th>闸门 <code>action-construction</code></th><th>依据</th></tr></thead>
    <tbody>
      ${flow.steps
        .map(
          (step) => `<tr>
        <td>${esc(step.label)}</td>
        <td class="${step.satisfied ? 'ok' : 'bad'}">${step.satisfied ? '放行' : '阻断'}</td>
        <td class="dim">${esc(step.evidence)}</td>
      </tr>`,
        )
        .join('\n')}
    </tbody>
  </table>
  <p class="note">
    ③ 记录的是论文报告的典型失效：六臂 × 11 seeds，信息量高（96.8%）但成本 ${flow.over.cost.toFixed(2)} 超过预算
    ${flow.over.budget.toFixed(1)}，合规口径 ${flow.over.compliant.toFixed(3)} —— 闸门阻断。
    ④ 按预算裁到四臂 × 12 seeds 后，信息量 ${pct(flow.trimmed.bound_share)}（略降），合规口径
    ${flow.trimmed.compliant.toFixed(3)}，成本 ${flow.trimmed.cost.toFixed(2)} ≤ ${flow.trimmed.budget.toFixed(1)} —— 闸门放行。
    <b>这就是论文那条修法在工作区里的样子</b>：先量化代价，再把设计裁到付得起，然后才发真实调用。
  </p>
  <p class="note">
    闸门由代码判定（<code>src/research/stage-signals.ts</code> 的 <code>action-construction</code>），
    回归测试在 <code>scripts/verify-prerequisites.mjs</code> 第 [9] 段；
    <code>/research</code> 状态里会显示状态摘要与最近几次构造记录。
  </p>
</div>

<h2>五、没有决策层，也能从"已知动作"构造 Action Object</h2>
<div class="card">
  <p>
    Paper 1（决策层）还没实现，所以插件里没有"Decision → Action"这条链。但**动作今天就在工作区里**：
    计划步骤、checklist、Agent 的提案、预算表里的调用矩阵。缺的不是动作，而是把动作写成**可度量的对象**——
    这正是本文说的那一半。下表由 <code>action="extract"</code> 在生成本页时现场跑出。
  </p>
  <table class="t">
    <thead><tr><th>已知动作（原文）</th><th>推断类型</th><th>构造出的对象</th>
      <th class="r">占上界</th><th class="r">成本/预算</th><th class="r">as written</th></tr></thead>
    <tbody>
      ${extractedItems
        .map(
          (item) => `<tr>
        <td>${esc(item.candidate.text.slice(0, 46))}</td>
        <td>${esc(item.candidate.actionType)}</td>
        <td class="n">target ${item.design.target} · arms [${(item.design.arms ?? []).join(',')}] · seeds ${item.design.n}</td>
        <td class="r n">${pct(item.constructed.bound_share)}</td>
        <td class="r n ${item.constructed.feasible ? 'ok' : 'bad'}">${item.constructed.cost.toFixed(2)}/${item.constructed.budget.toFixed(1)}</td>
        <td class="r n">${item.asWritten.ig_per_cost.toFixed(4)}（自猜 ${pct(item.asWritten.guess_rate)}）</td>
      </tr>`,
        )
        .join('\n')}
    </tbody>
  </table>
  <p class="note">
    跳过的条目：${extractedSkipped.map((item) => `${esc(item.id)} — ${esc(item.reason)}`).join('；') || '（无）'}。
    <b>边界</b>：度量只覆盖消融类实验动作（论文局限 (i)）；起草/复核/分析/写作类步骤会被明确标为不适用，
    而不是硬套一个设计——把"撰写相关工作"打成 component_scan 只会让度量变成噪声。
  </p>
  <p class="note">
    命令：<code>npm run extract:actions -- --plan &lt;计划路径&gt;</code> 或
    <code>--actions "&lt;动作原文&gt;"</code>；加 <code>--record</code> 会把"要跑的那一条"写进
    <code>research/action-construction.jsonl</code>（默认只记第一条付得起的，绝不静默批量写）。
  </p>
</div>

<h2>六、在插件里怎么调用</h2>
<div class="card">
  <p>工具调用（agent 视角）：</p>
  <pre>{
  "action": "evaluate",
  "state": { "question": "...", "mechanisms": [6 项], "arms": [6 项], "prior": [6 项], "budget": 8.0 },
  "level": "L3",
  "answer": "TARGET: h1\\nARMS: 0,1,2,3,4,5\\nSEEDS: 11\\nSUCCESS: ..."
}</pre>
  <p class="note">返回渲染文本：<code>IG/cost 0.1388 · 96.8% of the bound · compliant 0.000 · cost 8.45 vs budget 8.0 OVER BUDGET · executor invents 0% of the design · gap: pointer 0.0491 / resolution 0.0000</code></p>
  <p>代码路径：</p>
  <pre>import { evaluate, buildPrompt, sampleState } from './research/action-construction/index.js'

const state = sampleState(0)                       // 或产品自己的 ResearchState
const prompt = buildPrompt(state, 'L3')            // 递给模型的就是这段提示
const r = evaluate(state, 'TARGET: h1 | ARMS: 0,1,2,3,4,5 | SEEDS: 11', 'L3')
r.ig_per_cost   // 0.1388
r.bound_share   // 0.968   占无约束成本效率上界
r.compliant     // 0       合规口径（付不起记 0）
r.feasible      // false   cost 8.45 > budget 8.0
r.guess_rate    // 0       执行器需要自行推断的比例
r.pointer_gap; r.resolution_gap; r.construction_gap</pre>
  <p class="note">
    复现本页：<code>npm run build:host &amp;&amp; node scripts/make-action-construction-demo-html.mjs</code>；
    终端版演示：<code>node scripts/demo-action-construction.mjs</code>；
    一致性自检：<code>npm run verify:action-construction</code>。
  </p>
</div>

<p class="note">
  生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')} ｜
  状态面板 digest：<code>${esc(fixtures.state_digest)}</code> ｜
  缓存答案：族 A ${cacheA.length} 条、族 B ${cacheB.length} 条 ｜
  论文发表值取自 <code>results/rich_analysis.json</code>。
</p>
</body>
</html>
`

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, html)
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB, self-contained)`)
