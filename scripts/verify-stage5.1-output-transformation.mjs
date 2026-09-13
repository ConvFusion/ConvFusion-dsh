#!/usr/bin/env node
/**
 * ConvFusion 2.0 — Stage 5.1 Research Output Transformation 离线验证。
 *
 * 覆盖 §31 的 Task 1–10：
 *   Output Entity / Output Profiles / Output Source / Transformation Skill /
 *   Transformation Plan / Native Harness / Output Review / Provenance /
 *   Impact Analysis / Output Registry
 *
 * 关键边界：
 *   - Output **不是**与 Research State 同等级的核心对象（§3）
 *   - Output **不修改** Research State（§18）
 *   - 来源不写死 source_paper：Research State / Paper / Claims / Evidence / Plans（§26）
 *   - Transformation **不是 summarization**（§14）：Patent 要重新组织，不是换标题
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const OD = await import(lib('research/output-data.js'))
const OP = await import(lib('research/output-profiles.js'))
const O = await import(lib('research/output.js'))
const P = await import(lib('research/paper.js'))
const EV = await import(lib('research/evidence.js'))
const CL = await import(lib('research/claims.js'))
const RS = await import(lib('research/research-state.js'))
const SK = await import(lib('research/skills.js'))

let passed = 0, failed = 0
const failures = []
const assert = (c, l) => { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ FAIL ${l}`) } }
const assertEq = (a, b, l) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) console.log(`    actual: ${JSON.stringify(a)}\n    expect: ${JSON.stringify(b)}`); assert(ok, l) }

const ws = mkdtempSync(join(tmpdir(), 'cf-stage51-'))
/** 跨块共享的 id（模块级，避免依赖 globalThis 的可变性）。 */
const ids = { e1: '', c1: '', reviewTarget: '', stateVersion: '' }

/* ── Task 2: Output Profiles ──────────────────────────────────────── */
console.log('\n[Task 2] Output Profiles')
{
  assertEq(OD.OUTPUT_TYPES, ['paper', 'patent', 'technical-report', 'slides'], '第一版支持 4 种类型（§6）')
  assert(OD.RESERVED_OUTPUT_TYPES.includes('proposal'), '预留 proposal 等类型（§6）')

  const profiles = OP.listOutputProfiles()
  assertEq(profiles.length, 4, '实现 4 个 Profile')
  for (const p of profiles) {
    assert(p.purpose.length > 20, `${p.type}: 有 purpose`)
    assert(p.audience.length > 10, `${p.type}: 有 audience`)
    assert(p.structure.length >= 5, `${p.type}: 有推荐结构（${p.structure.length} 节）`)
    assert(p.constraints.length >= 3, `${p.type}: 有内容约束`)
    assert(p.qualityChecks.length >= 3, `${p.type}: 有质量检查规则`)
  }

  // §9：Patent 必须重新组织，不是换标题
  const patent = OP.OUTPUT_PROFILES.patent
  const patentStructure = patent.structure.join(' ').toLowerCase()
  assert(patentStructure.includes('technical problem'), 'Patent Profile 含 Technical Problem')
  assert(patentStructure.includes('technical solution'), 'Patent Profile 含 Technical Solution')
  assert(patentStructure.includes('technical effect'), 'Patent Profile 含 Technical Effects')
  assert(patentStructure.includes('embodiment'), 'Patent Profile 含 Embodiments')
  assert(patent.constraints.some((c) => /not a research claim|patent claim is NOT/i.test(c)), '明确指出专利权利要求 ≠ 研究主张（§10）')
  assert(patent.qualityChecks.some((c) => c.id === 'patent-not-just-renamed'), '有"不是只换标题"的检查（§14）')

  // §10：Research Claim vs Patent Claim 的说明单独成文
  assert(OP.PATENT_CLAIM_NOTE.includes('Research Claim'), 'PATENT_CLAIM_NOTE 存在')
  assert(OP.PATENT_CLAIM_NOTE.includes('Patent Claim'), '并同时说明两者')
  assert(/不是.*同一种东西|不能互抄/.test(OP.PATENT_CLAIM_NOTE), '明确两者不可互抄')

  // Paper Profile 要求 claim 可追溯（§8）
  assert(OP.OUTPUT_PROFILES.paper.format.requiresClaimTraceability, 'Paper Profile 要求 Claim 可追溯')
  assert(!OP.OUTPUT_PROFILES.slides.format.requiresClaimTraceability, 'Slides 不要求逐句可追溯（✓ 合理差异）')
}

/* ── Task 1: Output Entity ───────────────────────────────────────── */
console.log('\n[Task 1] Output Entity（create / read / edit / version / archive）')
{
  RS.createResearchState(ws, { dimensions: { Problem: 'P', 'Research Questions': 'Q' } })
  P.createPaper(ws, { title: 'Cross-Modal Calibration' })
  const e1 = EV.createEvidence(ws, { name: 'Calibration result', sourceKind: 'experiment', rawArtifacts: ['results/calib.csv'] })
  const c1 = CL.createClaim(ws, { statement: 'The method reduces localization error.' })
  EV.linkEvidenceToClaim(ws, e1.id, c1.id, 'supports')
  CL.reconcileClaimEvidence(ws, c1.id)
  ids.e1 = e1.id
  ids.c1 = c1.id

  const created = O.createOutput(ws, {
    type: 'patent',
    title: 'Cross-Modal Rigid Consistency Calibration',
    goal: 'Turn the mechanism into a protectable technical solution.',
    source: { paper: 'paper-main', claims: [c1.id], evidence: [e1.id] },
    harnessSession: 'session-abc',
  })
  assert(!O.isOutputWriteError(created), 'createOutput 成功')
  assertEq(created.id, 'patent-001', 'id 自动编号（patent-001）')
  assertEq(created.type, 'patent', 'type 记录')
  assertEq(created.status, 'draft', '初始 draft')
  assertEq(created.version, '0.1', '初始版本 0.1')
  assertEq(created.relPath, 'outputs/patents/patent-001/patent.md', '落在统一 outputs/ 注册表（复数目录 + 成果子目录，§10）')
  assertEq(created.skill, 'patent-drafting', '默认关联 Profile 推荐的转换 Skill（§15）')

  // 结构来自 Profile
  const titles = created.sections.map((s) => s.title)
  for (const want of ['Technical Field', 'Technical Solution', 'Claims', 'Embodiments']) {
    assert(titles.includes(want), `骨架含 ${want}（由 Profile 生成，§7）`)
  }

  // 编辑
  const edited = O.updateOutputSection(ws, 'patent-001', 'Technical Solution', 'A calibration method comprising: determining a common rigid structure; calibrating based on it.')
  assert(!O.isOutputWriteError(edited), 'updateOutputSection 成功')
  assert(edited.sections.find((s) => s.title === 'Technical Solution').body.includes('common rigid structure'), '章节已更新')

  // 版本化（§21 不删除性覆盖）
  O.updateOutputSection(ws, 'patent-001', 'Technical Effect', 'Improved robustness.')
  const v = O.archiveOutputVersion(ws, 'patent-001', { reason: 'before review' })
  assert(v !== undefined, '归档当前版本')
  assertEq(O.archiveOutputVersion(ws, 'patent-001', { reason: 'again' }), undefined, '同内容重复归档幂等')
  assert(O.listOutputVersions(ws, 'patent-001').length >= 1, '历史版本可列出')

  assert(O.isOutputWriteError(O.createOutput(ws, { type: 'patent', title: 'x', id: 'patent-001' })), '重复 id 被拒绝')
  assert(O.isOutputWriteError(O.deleteOutput(ws, 'patent-001')), '删除需显式确认（归档优先）')
  assert(!O.isOutputWriteError(O.archiveOutput(ws, 'patent-001', 'superseded by v2')), '可归档')
  assertEq(O.readOutput(ws, 'patent-001').status, 'archived', 'status=archived')
}

/* ── Task 3: Output Source（不写死 paper）────────────────────────── */
console.log('\n[Task 3] Output Source')
{
  const { e1, c1 } = ids
  // §26：来源可以是 Research State，不必来自 Paper
  const fromState = O.createOutput(ws, {
    type: 'technical-report',
    title: 'Directly from research state',
    source: { researchState: RS.loadResearchState(ws).version, claims: [c1], evidence: [e1], plans: ['experiment-design'] },
  })
  assert(!O.isOutputWriteError(fromState), '可直接以 Research State 为来源（§5/§26）')
  assertEq(fromState.source.researchState, RS.loadResearchState(ws).version, '记录 researchState 版本')
  assertEq(fromState.source.paper, undefined, '**不要求**有 paper（未写死 source_paper）')
  assertEq(fromState.source.claims, [c1], '记录 claims 来源')
  assertEq(fromState.source.evidence, [e1], '记录 evidence 来源')
  assertEq(fromState.source.plans, ['experiment-design'], '记录 plans 来源')

  // 落盘后 frontmatter 可往返
  const reread = O.readOutput(ws, fromState.id)
  assertEq(reread.source.claims, [c1], '来源引用可往返（frontmatter）')
  assertEq(reread.source.researchState, fromState.source.researchState, 'researchState 版本可往返')
}

/* ── Task 4: Transformation Skill 在 Skill Library ───────────────── */
console.log('\n[Task 4] Output Transformation Skill')
{
  const docs = SK.listSystemSkills()
  const ids = docs.map((d) => d.id)
  for (const want of ['patent-drafting', 'technical-report-writing', 'presentation-design']) {
    assert(ids.includes(want), `Skill Library 含 ${want}（§15）`)
  }
  const patentSkill = docs.find((d) => d.id === 'patent-drafting')
  const body = patentSkill.body
  assert(/patent claim/i.test(body) && /research claim/i.test(body), 'Patent Drafting Skill 明确区分两类 claim（§10）')
  assert(isPatentMethodSubstantive(body), 'Patent Drafting Skill 是真实方法（非占位）')
  function isPatentMethodSubstantive(t) {
    return /technical problem/i.test(t) && /embodiment/i.test(t) && t.length > 1500
  }
  // 每个 Profile 都指向一个真实存在的 Skill
  for (const p of OP.listOutputProfiles()) {
    if (p.recommendedSkill) assert(ids.includes(p.recommendedSkill), `${p.type} 推荐的 Skill \`${p.recommendedSkill}\` 存在`)
  }
}

/* ── Task 5: Transformation Plan（§16）───────────────────────────── */
console.log('\n[Task 5] Output Transformation Plan')
{
  const { e1, c1 } = ids
  // §16：Plan 应说明 Source / Target / Goal / Claims / Evidence / Structure / Constraints / Validation
  const plan = P.createPaper ? null : null
  void plan
  const entries = require_planlib()
  function require_planlib() { return null }
  void entries
  const planMod = await import(lib('research/plan-library.js'))
  const created = planMod.createPlan(ws, {
    name: 'Patent Transformation',
    objective: 'Turn the calibration mechanism into a patent draft.',
    sourceSkill: 'patent-drafting',
    expectedEvidence: `Claims ${c1} backed by ${e1}.`,
    completionCriteria: 'A draft whose claim set defines technical features and whose embodiments are implementable.',
    sections: [
      { title: 'Objective', body: 'Turn the calibration mechanism into a patent draft.' },
      { title: 'Source Research', body: `Paper paper-main; claim ${c1}; evidence ${e1}; research state v${RS.loadResearchState(ws).version}.` },
      { title: 'Target Output', body: 'patent (patent-001)' },
      { title: 'Relevant Claims', body: `- ${c1}` },
      { title: 'Relevant Evidence', body: `- ${e1}` },
      { title: 'Required Sections', body: 'Technical Field / Technical Problem / Technical Solution / Effects / Embodiments / Claims' },
      { title: 'Constraints', body: 'Patent claims must state technical features, not research findings.' },
      { title: 'Validation Criteria', body: 'All quality checks in the patent profile pass.' },
    ],
  })
  assert(!planMod.isPlanWriteError(created), '可创建 Output Transformation Plan（Task 5）')
  assertEq(created.sourceSkill, 'patent-drafting', 'Plan 记录 source_skill')
  assert(created.sections.some((s) => s.title === 'Target Output'), 'Plan 含 Target Output 段')
  assert(created.sections.some((s) => s.title === 'Validation Criteria'), 'Plan 含 Validation Criteria 段')
  assertEq(created.status, 'draft', 'Plan 默认 draft → 需用户审阅后执行（§17）')
}

/* ── Task 7: Output Review ───────────────────────────────────────── */
console.log('\n[Task 7] Output Review')
{
  // 归档是终态：先验证它不能被复活
  const revived = O.reviewOutput(ws, 'patent-001', 'approved', { note: 'should fail' })
  assert('error' in revived, '已归档的 Output 不能被重新审阅/批准（归档是终态）')

  // 用一个处于 draft 的成果做审阅流程
  const target = O.createOutput(ws, {
    type: 'patent',
    title: 'Reviewed patent draft',
    source: { paper: 'paper-main', claims: [ids.c1], evidence: [ids.e1] },
    harnessSession: 'session-draft-001',
  })
  ids.reviewTarget = target.id
  const before = O.readOutput(ws, target.id)
  const reviewed = O.reviewOutput(ws, target.id, 'reviewed', { note: 'structure looks right' })
  assert(!('error' in reviewed), 'review 成功')
  assertEq(reviewed.output.status, 'reviewed', 'status → reviewed')
  assertEq(reviewed.fromVersion, before.version, '记录 fromVersion')
  assert(reviewed.toVersion !== reviewed.fromVersion, 'review 推进版本')

  const approved = O.reviewOutput(ws, target.id, 'approved', { note: 'send to counsel' })
  assertEq(approved.output.status, 'approved', 'status → approved')

  // 历史与处置记录（§19 / §21）
  const versions = O.listOutputVersions(ws, target.id)
  assert(versions.length >= 2, `历史版本被保留（${versions.length}）`)
  const reviews = O.readOutputReviews(ws, target.id)
  assertEq(reviews.length, 2, '处置记录累积')
  assertEq(reviews[0].action, 'reviewed', '处置记录含 action')
  assert(reviews.every((r) => r.at && r.by && r.fromVersion && r.toVersion), '处置记录含 who / when / from→to（§21）')

  // Reject：不改正文、不推进版本，但留痕
  const vBefore = O.readOutput(ws, target.id).version
  const bodyBefore = O.readOutput(ws, target.id).body
  const rejected = O.reviewOutput(ws, target.id, 'rejected', { note: 'claim scope too broad' })
  assertEq(rejected.output.version, vBefore, 'Reject 不推进版本')
  assertEq(rejected.output.body, bodyBefore, 'Reject 不改正文')
  assertEq(O.readOutputReviews(ws, target.id).at(-1).action, 'rejected', 'Reject 也留痕')

  // edited：写入新正文并推进版本
  const newBody = O.readOutput(ws, target.id).body.replace('Technical Effect', 'Technical Effects')
  const edited = O.reviewOutput(ws, target.id, 'edited', { finalText: newBody, note: 'narrowed claims' })
  assertEq(edited.output.status, 'approved', 'edited 保持状态')
  assert(edited.toVersion !== edited.fromVersion, 'edited 推进版本')
}

/* ── Task 8: Provenance ──────────────────────────────────────────── */
console.log('\n[Task 8] Provenance 链')
{
  const prov = O.traceOutputProvenance(ws, ids.reviewTarget)
  assert(prov !== undefined, 'traceOutputProvenance 成功')
  const kinds = prov.hops.map((h) => h.kind)
  assert(kinds.includes('output'), '链含 output')
  assert(kinds.includes('skill'), '链含 skill（§15）')
  assert(kinds.includes('source'), '链含 source（paper / research state）')
  assert(kinds.includes('claim'), '链含 claim')
  assert(kinds.includes('evidence'), '链含 evidence（Task 8 终点）')
  assertEq(prov.reachesEvidence, true, '可追溯到 Evidence（完整链）')
  assert(prov.hops.some((h) => h.kind === 'session'), '链含 harness session')
}

/* ── Task 9: Impact Analysis ─────────────────────────────────────── */
console.log('\n[Task 9] Impact Analysis')
{
  const { c1, e1 } = ids
  // 再加一个 slides，让依赖图有多个成果
  O.createOutput(ws, { type: 'slides', title: 'Group meeting talk', source: { claims: [c1], evidence: [e1] } })

  const map = O.buildOutputDependencyMap(ws)
  assert(map.length > 0, '依赖图非空')
  const byClaim = map.find((d) => d.kind === 'claim' && d.dependsOn === c1)
  assert(byClaim !== undefined, `依赖图含 ${c1} → outputs（§23）`)
  assert(byClaim.outputs.length >= 2, '同一 Claim 被多个成果依赖')
  assert(byClaim.outputs.some((o) => o.type === 'patent'), '依赖图含 patent')
  assert(byClaim.outputs.some((o) => o.type === 'slides'), '依赖图含 slides')

  // 回答 §23 的问题："如果 C003 被推翻，哪些成果需要重新检查？"
  const impacts = O.analyzeOutputImpact(ws, c1)
  assert(impacts.length > 0, 'analyzeOutputImpact 给出受影响成果')
  assert(impacts[0].affected.length >= 2, '列出多个受影响成果')
  assert(impacts[0].affected.every((a) => a.recommendation.length > 20), '每个都给出 Update Recommendation（Task 9）')

  const eImpacts = O.analyzeOutputImpact(ws, e1, 'evidence')
  assert(eImpacts.length > 0, 'Evidence 变化的影响也能分析')
  assert(eImpacts[0].affected[0].recommendation.includes('Re-check'), '建议说明要重新检查什么')

  const none = O.analyzeOutputImpact(ws, 'C999')
  assertEq(none.length, 0, '无人依赖的对象不影响任何成果')

  const summary = O.outputImpactSummary(ws)
  assert(summary.totalOutputs >= 3, '注册表统计成果总数')
  assert(summary.byType.patent >= 1 && summary.byType.slides >= 1, '按类型统计')
}

/* ── Task 10: Output Registry ────────────────────────────────────── */
console.log('\n[Task 10] Output Registry（统一 outputs/）')
{
  const all = O.listAllOutputs(ws)
  assert(all.length >= 3, `统一注册表列出全部成果（${all.length}）`)
  assert(all.every((o) => o.relPath.startsWith('outputs/')), '全部落在 outputs/ 下')
  assert(existsSync(join(ws, 'outputs', 'patents')), '类型目录按需建立（复数名，§10）')
  // 类型目录就是目录，不含独立 workflow 结构
  assert(!existsSync(join(ws, 'outputs', 'patent', 'step1')), '不含 step 层级（Task 10 / §32）')
  const byId = O.readOutput(ws, all[0].id)
  assert(byId !== undefined, '可按 id 跨类型读取')
}

/* ── §20: Output Quality Check ───────────────────────────────────── */
console.log('\n[§20] Output Quality Check（规则化，可复核）')
{
  // 一个故意不合格的 patent：只有换过标题的论文文本
  const bad = O.createOutput(ws, { type: 'patent', title: 'Renamed paper' })
  O.saveOutputBody(ws, bad.id, [
    '---', 'title: Renamed paper', 'type: patent', 'status: draft', 'version: 0.1', '---', '',
    '# Patent: Renamed paper', '',
    '## Technical Field', '', 'In this paper we propose a method. Our contribution is a calibration approach.', '',
    '## Technical Solution', '', 'We propose a method in this paper.', '',
  ].join('\n'))

  const q = O.checkOutputQuality(ws, bad.id)
  assert(!('error' in q), '质量检查可运行')
  assertEq(q.passed, false, '不合格草稿未通过检查')
  // ⚠️ ok:true 表示"未命中禁止模式"，因此"检出论文口吻"要断言 ok === false
  const paperLanguage = q.checks.find((c) => c.id === 'patent-no-paper-language')
  assert(paperLanguage !== undefined && paperLanguage.ok === false, '检出论文口吻（paper/contribution）')
  assert(q.checks.some((c) => !c.ok && c.id === 'patent-not-just-renamed'), '检出"只是换了标题"（§14）')
  // 该草稿只有两个章节，Profile 要求的其余章节都缺
  assert(q.missingSections.length > 0, `报告缺失的结构章节（${q.missingSections.length} 个）`)
  assert(q.missingSections.includes('Claims'), '缺失清单含 Claims')
  assert(q.checks.every((c) => typeof c.ok === 'boolean' && c.advice.length > 0), '每条检查都给建议')

  // 合格草稿应通过
  const good = O.createOutput(ws, { type: 'technical-report', title: 'Reproduction report' })
  O.saveOutputBody(ws, good.id, [
    '---', 'title: Reproduction report', 'type: technical-report', 'status: draft', 'version: 0.1', '---', '',
    '# Technical Report: Reproduction report', '',
    '## Summary', '', 'We document the calibration experiment. Reproduction instructions below.', '',
    '## Reproduction Instructions', '', 'Install version 1.2, run `python train.py` with seed 0. Outputs land in results/calib.csv.', '',
    '## Limitations', '', 'Only evaluated on one dataset; the assumption of rigid targets is not tested under deformation.', '',
  ].join('\n'))
  const q2 = O.checkOutputQuality(ws, good.id)
  assert(!('error' in q2), '第二条质量检查可运行')
  const passedChecks = q2.checks.filter((c) => c.ok).length
  assert(passedChecks >= 3, `合格草稿通过大部分规则检查（${passedChecks}/${q2.checks.length}）`)
  assert(q2.checks.filter((c) => !c.ok).length <= 2, '未通过的检查很少（结构由 Profile 保证）')
}

/* ── §18: Output 不修改 Research State ───────────────────────────── */
console.log('\n[§18] Output 不修改 Research State')
{
  const statePath = join(ws, 'research-state.md')
  const before = readFileSync(statePath, 'utf8')
  const evidenceCountBefore = EV.listEvidence(ws).length
  const claimCountBefore = CL.listClaims(ws).length

  // 做一轮完整的成果操作
  const o = O.createOutput(ws, { type: 'slides', title: 'State safety test', source: { claims: [ids.c1] } })
  O.updateOutputSection(ws, o.id, 'Results', 'numbers moved here')
  O.reviewOutput(ws, o.id, 'approved')
  O.archiveOutputVersion(ws, o.id, { reason: 'test' })
  O.checkOutputQuality(ws, o.id)
  O.traceOutputProvenance(ws, o.id)
  O.analyzeOutputImpact(ws, ids.c1)

  const after = readFileSync(statePath, 'utf8')
  assertEq(after, before, 'Research State 文件**逐字节未变**（§18）')
  assertEq(EV.listEvidence(ws).length, evidenceCountBefore, 'Evidence 数量未变')
  assertEq(CL.listClaims(ws).length, claimCountBefore, 'Claim 数量未变')

  // 类型级约束：output 模块不引用 Research State 的写操作
  const src = readFileSync(join(PKG, 'src', 'research', 'output.ts'), 'utf8')
  assert(!/writeResearchState|applyStateUpdate|proposeStateUpdate|createResearchState/.test(src), 'output.ts 不调用任何 Research State 写操作（类型级边界）')
  assert(!/createEvidence|createClaim|createDecision/.test(src), 'output.ts 不创建研究资产（只引用）')
}

/* ── §31 Task 6 + §46: Native Harness 边界 ──────────────────────── */
console.log('\n[Task 6] Native Harness 边界')
{
  for (const f of ['research/output.ts', 'research/output-profiles.ts', 'research/output-data.ts']) {
    const src = readFileSync(join(PKG, 'src', f), 'utf8')
    assert(!/ctx\.llm|agents\.create|createAgentDriver/.test(src), `${f} 不创建 Agent / 不直接调 LLM`)
    assert(!/session\.append\(/.test(src), `${f} 不写自定义会话事件`)
  }
  // 转换 Skill 是 Markdown（Task 4）
  const patent = SK.listSystemSkills().find((d) => d.id === 'patent-drafting')
  assert(patent.path.endsWith('.md'), 'Transformation Skill 是 Markdown 文件（Task 4）')
}

rmSync(ws, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '✅' : '❌'} stage5.1-output-transformation: ${passed} passed, ${failed} failed`)
if (failed > 0) { console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n')); process.exit(1) }
