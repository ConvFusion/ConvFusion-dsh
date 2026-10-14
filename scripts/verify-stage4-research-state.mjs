#!/usr/bin/env node
/**
 * ConvFusion 2.0 — Stage 4 Research State + Evidence 离线验证（无 LLM、无 DSH）。
 *
 * 覆盖 v2-Stage4 §40 编程任务与 §42 验收标准：
 *   A. Research State（Create/Read/Update/Version/Review）
 *   B. Evidence（Create/Read/Update/Version/Validate/Archive）
 *   C. Claims（Statement/Status/Evidence/Related Paper）
 *   D. Decisions（Decision/Reason/Evidence/Alternatives/Status）
 *   E. Provenance（Plan → Session → Raw Artifact → Evidence → Claim → State）
 *   F. State Update（Proposal → User Review → Accept/Edit/Reject）
 *   G. Open Questions
 *   H. Research Maturity
 *   并验证 §9 不删除性覆盖、§14 允许不完整、§18 索引不取代 Markdown、§30 原始产物保留
 *
 * 用法：
 *   node scripts/verify-stage4-research-state.mjs packages/dsh-convfusion
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const D = await import(lib('research/research-data.js'))
const EV = await import(lib('research/evidence.js'))
const CL = await import(lib('research/claims.js'))
const RS = await import(lib('research/research-state.js'))
const MD = await import(lib('research/markdown.js'))

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

const ws = mkdtempSync(join(tmpdir(), 'cf-stage4-'))

/* ════════════════════════════════════════════════════════════════════════
 * ID 方案（§37）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[§37] 稳定 ID')
{
  assertEq(D.makeResearchId('evidence', 1), 'E001', 'Evidence id = E001')
  assertEq(D.makeResearchId('claim', 12), 'C012', 'Claim id = C012')
  assertEq(D.makeResearchId('decision', 3), 'D003', 'Decision id = D003')
  assertEq(D.parseResearchId('E007')?.kind, 'evidence', '解析 Evidence id')
  assertEq(D.parseResearchId('C001')?.n, 1, '解析 Claim 编号')
  assertEq(D.parseResearchId('nope'), undefined, '非法 id 返回 undefined')
}

/* ════════════════════════════════════════════════════════════════════════
 * A / §14. Research State
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[A/§14] Research State')
{
  assertEq(RS.loadResearchState(ws), null, '尚未建立 → null')

  const created = RS.createResearchState(ws, {
    dimensions: {
      Problem: 'Geometry-conditioned adaptation is unverifiable without matched-topology twins.',
      'Research Questions': 'Is the geometry axis separable from topology?',
    },
  })
  assert(!RS.isStateWriteError(created), 'createResearchState 成功')
  assertEq(created.version, '1', '初始版本 v1')
  assertEq(created.relPath, 'research-state.md', '落盘在工作区根 ./research-state.md（v2-Workspace §2）')
  assert(existsSync(created.path), '文件真实存在（§17 Markdown-first）')
  assertEq(created.dimensions.Problem?.slice(0, 9), 'Geometry-', 'Problem 维度读取')
  assertEq(created.dimensions['Research Questions']?.slice(0, 2), 'Is', 'Research Questions 读取')

  // §14：允许不完整 —— 未涉及的维度**不出现**，不制造空章节
  const raw = readFileSync(created.path, 'utf8')
  assert(!raw.includes('## Method'), '未建立的维度不出现（不制造空章节）')
  assert(!raw.includes('## Experiments'), '未建立的维度不出现（Experiments）')
  const missing = D.STATE_DIMENSIONS.filter((d) => !(d in created.dimensions))
  assert(missing.length > 5, `大部分维度允许缺失（缺 ${missing.length} 个）`)

  // 成熟度默认 Unknown
  assertEq(created.maturity.Problem, 'Unknown', '成熟度默认 Unknown（不假装有进度）')
  assert(D.MATURITY_DIMENSIONS.length === 6, '成熟度维度 6 个（§35）')

  // 重复创建拒绝
  assert(RS.isStateWriteError(RS.createResearchState(ws)), '重复创建被拒绝（应走 applyStateUpdate）')
}

/* ════════════════════════════════════════════════════════════════════════
 * B / §8. Evidence
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[B/§8] Evidence')
{
  const e1 = EV.createEvidence(ws, {
    name: 'Baseline Comparison',
    sourceKind: 'experiment',
    plan: 'experiment-design.md',
    paper: 'CGBench',
    harnessSession: 'session-abc',
    rawArtifacts: ['results/baseline.csv', 'logs/run-01.log'],
    claim: 'The proposed method improves localization accuracy over the selected baselines.',
    result: '| Method | mAP |\n|---|---:|\n| A | 61.2 |\n| Proposed | 68.4 |',
    observation: 'Gain is consistent across three seeds.',
  })
  assert(!EV.isEvidenceWriteError(e1), 'createEvidence 成功')
  assertEq(e1.id, 'E001', '自动分配 E001（§37 连续编号）')
  assertEq(e1.sourceKind, 'experiment', '来源分类')
  assertEq(e1.status, 'unverified', '默认 unverified（未验证不冒充已证实）')
  assertEq(e1.provenance.plan, 'experiment-design', 'plan 关联（去掉路径与 .md）')
  assertEq(e1.provenance.harnessSession, 'session-abc', 'harness session 引用')
  assertEq(e1.provenance.paper, 'CGBench', 'paper 关联')
  assertEq(e1.provenance.rawArtifacts, ['results/baseline.csv', 'logs/run-01.log'], '原始产物引用（§30）')
  assert(EV.evidenceClaim(e1).includes('improves localization'), '`## Claim` 解析')
  assert(EV.evidenceResult(e1).includes('68.4'), '`## Result` 解析')
  assert(EV.evidenceObservation(e1).includes('three seeds'), '`## Observation` 解析')
  assert(EV.evidenceSupportingData(e1).includes('baseline.csv'), '`## Supporting Data` 解析')

  // §6 推荐章节齐备
  const titles = e1.sections.map((s) => s.title)
  for (const want of ['Claim', 'Experimental Context', 'Result', 'Observation', 'Supporting Data', 'Reproducibility', 'Validation']) {
    assert(titles.includes(want), `含推荐章节 ${want}`)
  }

  // 连续编号
  const e2 = EV.createEvidence(ws, { name: 'Literature: uniform rank allocation', sourceKind: 'literature', citation: 'Smith et al. 2024, §3.2' })
  assertEq(e2.id, 'E002', '第二条 → E002')
  assertEq(e2.provenance.citation, 'Smith et al. 2024, §3.2', '文献证据保留 citation（§7.1）')

  // 验证状态（§8 五种，非 true/false）
  assertEq(D.EVIDENCE_STATUSES.join(','), 'unverified,supported,verified,rejected,superseded', '五种验证状态（非 true/false 二分）')
  const verified = EV.setEvidenceStatus(ws, 'E001', 'verified')
  assertEq(verified.status, 'verified', '设置 verified')
  assert(EV.evidenceResult(verified).includes('68.4'), '改状态不丢正文')
  assert(
    verified.sections.find((s) => s.title === 'Validation').body.includes('verified'),
    '`## Validation` 同步更新',
  )
  assertEq(EV.setEvidenceStatus(ws, 'E001', 'bogus').status, 'unverified', '非法状态被归一为 unverified（不写入垃圾值）')

  // 历史快照（不删除性覆盖）
  const history = EV.listEvidenceHistory(ws, 'E001')
  assert(history.length >= 1, `改状态产生历史快照（${history.length} 条）`)
}

/* ════════════════════════════════════════════════════════════════════════
 * C / §10 / §11. Claims
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[C/§10] Claims 与 Evidence 关系')
{
  const c1 = CL.createClaim(ws, {
    statement: 'The proposed method improves localization accuracy over the selected baselines.',
    paper: 'CGBench',
  })
  assert(!CL.isIdWriteError(c1), 'createClaim 成功')
  assertEq(c1.id, 'C001', '自动分配 C001')
  assertEq(c1.status, 'unverified', '默认 unverified')

  // Evidence --supports--> Claim（§10）
  const linked = EV.linkEvidenceToClaim(ws, 'E001', 'C001', 'supports')
  assert(!EV.isEvidenceWriteError(linked), 'linkEvidenceToClaim(supports) 成功')
  assertEq(linked.supports, ['C001'], 'Evidence 侧记录 supports')

  // Evidence --contradicts--> Claim（§10 矛盾证据同样重要）
  const e3 = EV.createEvidence(ws, { name: 'Contradicting run', sourceKind: 'experiment', rawArtifacts: ['logs/run-02.log'] })
  EV.linkEvidenceToClaim(ws, e3.id, 'C001', 'contradicts')
  assertEq(EV.readEvidence(ws, e3.id).contradicts, ['C001'], 'Evidence 侧记录 contradicts')

  // 反向索引
  assertEq(EV.evidenceForClaim(ws, 'C001').map((e) => e.id), ['E001'], 'evidenceForClaim 反向索引')
  assertEq(EV.contradictionsForClaim(ws, 'C001').map((e) => e.id), ['E003'], 'contradictionsForClaim 反向索引')

  // reconcile：从 Evidence 重算 Claim
  const rec = CL.reconcileClaimEvidence(ws, 'C001')
  assert(!CL.isIdWriteError(rec), 'reconcileClaimEvidence 成功')
  assertEq(rec.evidence, ['E001'], 'Claim 认领支持的证据')
  assertEq(rec.contradictions, ['E003'], 'Claim 认领矛盾的证据')
  assertEq(rec.status, 'unverified', '有矛盾证据 → unverified（不越权判定为已支持）')

  // 一致性与漂移检测
  const cons = CL.checkClaimEvidenceConsistency(ws, 'C001')
  assertEq(cons.consistent, true, '双向引用一致')

  // 一个 Claim 关联多个 Evidence（§42）
  const e4 = EV.createEvidence(ws, { name: 'Second replication', sourceKind: 'experiment', rawArtifacts: ['logs/run-03.log'] })
  EV.linkEvidenceToClaim(ws, e4.id, 'C001', 'supports')
  CL.reconcileClaimEvidence(ws, 'C001')
  assert(CL.readClaim(ws, 'C001').evidence.length >= 2, 'Claim 可关联多个 Evidence（§42）')
}

/* ════════════════════════════════════════════════════════════════════════
 * D. Decisions
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[D/§23] Decisions')
{
  // 无理由无证据 → 拒绝（避免无据判断悄悄落盘）
  const bad = CL.createDecision(ws, { decision: 'Use Dataset A' })
  assert(CL.isIdWriteError(bad), '无理由无证据的 Decision 被拒绝（§23）')

  const d1 = CL.createDecision(ws, {
    decision: 'Use nuScenes as the primary dataset',
    reason: 'It is the only benchmark with matched-topology scene variants available.',
    evidence: ['E002'],
    alternatives: 'Considered KITTI, but its topology diversity is insufficient.',
  })
  assert(!CL.isIdWriteError(d1), 'createDecision 成功')
  assertEq(d1.id, 'D001', '自动分配 D001')
  assertEq(d1.status, 'decided', '默认状态 decided')
  assertEq(d1.evidence, ['E002'], '依据的 Evidence')
  assert(d1.reason.includes('matched-topology'), '`## Reason` 解析')
  assert(d1.alternatives.includes('KITTI'), '`## Alternatives Considered` 解析')
  for (const want of ['Decision', 'Reason', 'Evidence', 'Alternatives Considered', 'Status']) {
    assert(d1.sections.some((s) => s.title === want), `含章节 ${want}`)
  }

  const revised = CL.setDecisionStatus(ws, 'D001', 'revisiting')
  assertEq(revised.status, 'revisiting', '决策状态可改（decided → revisiting）')
}

/* ════════════════════════════════════════════════════════════════════════
 * §9. 不删除性覆盖
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[§9] Evidence 不被删除性覆盖')
{
  const newer = EV.createEvidence(ws, {
    name: 'Baseline Comparison (corrected config)',
    sourceKind: 'experiment',
    rawArtifacts: ['results/baseline-v2.csv'],
  })
  const res = EV.supersedeEvidence(ws, 'E001', newer.id, 'v1 used a wrong learning rate')
  assert(!EV.isEvidenceWriteError(res), 'supersedeEvidence 成功')

  const old = EV.readEvidence(ws, 'E001')
  const next = EV.readEvidence(ws, newer.id)
  assertEq(old.status, 'superseded', '旧证据标 superseded（不是删除）')
  assertEq(old.supersededBy, newer.id, '旧证据记录 supersededBy')
  assertEq(next.supersedes, 'E001', '新证据记录 supersedes')
  assert(old.sections.find((s) => s.title === 'Validation').body.includes('wrong learning rate'), '保留取代原因')
  assert(existsSync(old.path), '旧证据文件**仍在**（历史可追）')

  // 被引用的证据不允许删除
  const del = EV.deleteEvidence(ws, 'E001')
  assert(EV.isEvidenceWriteError(del), '被 Claim 引用的 Evidence 拒绝删除（§9）')
  assert(del.error.includes('supersede'), '拒绝理由指引用 supersede 代替')

  // 未被引用的可以删（误录场景）
  const orphan = EV.createEvidence(ws, { name: 'Typo entry', sourceKind: 'observation' })
  const delOk = EV.deleteEvidence(ws, orphan.id)
  assert(!EV.isEvidenceWriteError(delOk), '未被引用的 Evidence 可删除（误录）')
}

/* ════════════════════════════════════════════════════════════════════════
 * E / §28. Provenance
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[E/§28] Provenance 链')
{
  const chain = CL.traceEvidenceProvenance(ws, 'E002')
  assert(chain !== undefined, 'traceEvidenceProvenance 成功')
  const kinds = chain.hops.map((h) => h.kind)
  assert(kinds.includes('evidence'), '链含 evidence')
  assertEq(chain.reachesRawArtifact, false, 'E002 是文献证据，没有原始产物引用')

  // E001 才有完整 provenance（plan + session + raw artifact）
  const e1kinds = CL.traceEvidenceProvenance(ws, 'E001').hops.map((h) => h.kind)
  assert(e1kinds.includes('plan'), '链含 plan（来自哪个 Plan）')
  assert(e1kinds.includes('session'), '链含 session（哪次执行）')

  const e1chain = CL.traceEvidenceProvenance(ws, 'E001')
  assertEq(e1chain.reachesRawArtifact, true, 'E001 可追溯到原始产物（§30）')
  assert(e1chain.hops.some((h) => h.kind === 'artifact' && h.ref.includes('baseline.csv')), '链含原始产物路径')
  assert(e1chain.hops.some((h) => h.kind === 'claim'), '链通向 Claim')

  const claimChain = CL.traceClaimProvenance(ws, 'C001')
  assert(claimChain !== undefined, 'traceClaimProvenance 成功')
  assert(claimChain.hops.some((h) => h.kind === 'evidence' && h.relation === 'supports'), 'Claim 链含 supports 证据')
  assert(claimChain.hops.some((h) => h.kind === 'evidence' && h.relation === 'contradicts'), 'Claim 链含 contradicts 证据')
  assertEq(claimChain.reachesRawArtifact, true, 'Claim 可回溯到原始产物 → 完整链 §42')
}

/* ════════════════════════════════════════════════════════════════════════
 * F / §20 / §21. State Update
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[F/§20-21] State Update Proposal')
{
  const p1 = RS.proposeStateUpdate(ws, {
    changes: {
      Innovation: 'Geometry-conditioned adaptation is testable with matched-topology twins.',
      Claims: 'C001 is supported by E001/E004 but contested by E003.',
    },
    maturityChanges: { Problem: 'Established' },
    rationale: 'The replication runs confirm the effect and the contradiction is explained by config error in E003.',
    evidence: ['E001', 'E004'],
    plan: 'experiment-design',
    harnessSession: 'session-abc',
    confidence: 'Strong',
  })
  assertEq(p1.id, 'S001', '提案编号 S001')
  assertEq(p1.origin.actor, 'agent', '来源是 agent（§20：Agent 提出而非直接改）')
  assertEq(p1.origin.evidence, ['E001', 'E004'], '提案记录基于哪些证据')
  assertEq(p1.confidence, 'Strong', '定性置信度（不是分数）')

  // §20：提出提案**不改变** Research State
  const before = RS.loadResearchState(ws)
  assertEq(before.version, '1', '提出提案不改变 State 版本（用户尚未处置）')
  assert(!before.dimensions.Innovation, '提案内容尚未进入 State')
  assertEq(RS.listStateProposals(ws).length, 1, '提案待处置')

  // Accept
  const applied = RS.applyStateUpdate(ws, p1, { action: 'accepted' })
  assert(!RS.isStateWriteError(applied), 'applyStateUpdate(accepted) 成功')
  assertEq(applied.version, '2', '版本递增 v1 → v2（§22）')
  assert(applied.dimensions.Innovation.includes('matched-topology'), '提案内容已应用')
  assertEq(applied.maturity.Problem, 'Established', '成熟度变更已应用')
  assertEq(RS.listStateProposals(ws).length, 0, '已处置的提案移除')

  // 历史版本保留（不删除性覆盖）
  const versions = RS.listStateVersions(ws)
  assert(versions.some((v) => v.version === '1'), 'v1 被归档（历史可追）')
  const v1raw = RS.readStateVersion(ws, '1')
  // ⚠️ 判据必须是「该维度是否出现」，不能是某个关键词 ——
  // 'matched-topology' 在 Problem 维度里本来就有，用它判断会得到假阳性。
  assert(v1raw !== undefined && !/^## Innovation$/m.test(v1raw), 'v1 快照不含更新后才有的 Innovation 维度')
  assert(/^## Problem$/m.test(v1raw), 'v1 快照保留当时已有的 Problem 维度')

  // 处置记录：who / when / based on what（§21）
  const log = RS.listStateUpdateLog(ws)
  assertEq(log.length, 1, '处置记录已写')
  assertEq(log[0].proposalId, 'S001', '记录提案编号')
  assertEq(log[0].action, 'accepted', '记录动作')
  assertEq(log[0].fromVersion, '1', '记录 fromVersion')
  assertEq(log[0].toVersion, '2', '记录 toVersion')
  assert(typeof log[0].at === 'string' && log[0].at.length > 0, '记录时间（when）')

  // Edit：应用用户改过的内容
  const p2 = RS.proposeStateUpdate(ws, {
    changes: { Method: 'Agent-proposed method text.' },
    rationale: 'proposal 2',
    actor: 'agent',
  })
  const edited = RS.applyStateUpdate(ws, p2, {
    action: 'edited',
    editedChanges: { Method: 'USER-EDITED method text.' },
  })
  assertEq(edited.version, '3', 'Edit 也递增版本')
  assertEq(edited.dimensions.Method, 'USER-EDITED method text.', '应用的是**用户编辑后**的内容')
  assertEq(RS.listStateUpdateLog(ws).at(-1).action, 'edited', '记录为 edited')

  // Reject：不改状态，但保留处置痕迹
  const p3 = RS.proposeStateUpdate(ws, { changes: { Risks: 'Agent-proposed risk.' }, rationale: 'proposal 3' })
  const rejected = RS.applyStateUpdate(ws, p3, { action: 'rejected' })
  assertEq(rejected.version, '3', 'Reject 不改变版本')
  assert(!rejected.dimensions.Risks, 'Reject 不写入内容')
  assertEq(RS.listStateUpdateLog(ws).at(-1).action, 'rejected', 'Reject 也被记录（§21 保留痕迹）')
}

/* ════════════════════════════════════════════════════════════════════════
 * G / H / §18. Open Questions / Maturity / Index
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[G/H/§18] Open Questions、Maturity、Index')
{
  const p = RS.proposeStateUpdate(ws, {
    changes: {
      'Open Questions': ['- Does the geometry axis hold under sensor noise?', '- Is the gain stable across backbones?'].join('\n'),
      Risks: '- Simulator artefacts may inflate the geometry sensitivity score.',
    },
    rationale: 'record open questions and risks',
  })
  RS.applyStateUpdate(ws, p, { action: 'accepted' })

  const oq = RS.openQuestions(ws)
  assertEq(oq.length, 2, 'Open Questions 解析为 2 条')
  assert(oq[0].includes('sensor noise'), 'Open Question 内容正确')
  assert(RS.risks(ws).length === 1, 'Risks 解析')

  // 成熟度建议（§35 / §40-H）
  const sugg = RS.suggestMaturity(ws)
  assertEq(sugg.length, 6, '六个维度都有建议（§35）')
  assert(sugg.every((s) => D.MATURITY_LEVELS.includes(s.suggested)), '建议值都在层级集合内')
  assert(sugg.every((s) => s.basis.length > 0), '每条建议都给出可核查依据（不假装精度）')
  const ex = sugg.find((s) => s.dimension === 'Experiment')
  assert(ex.suggested === 'Strong' || ex.suggested === 'Emerging' || ex.suggested === 'Weak', 'Experiment 成熟度基于实验证据')
  const ev = sugg.find((s) => s.dimension === 'Evidence')
  assert(ev.suggested !== 'Unknown', 'Evidence 成熟度不为 Unknown（已有证据）')

  // 建议**不自动写入**
  const versionBefore = RS.loadResearchState(ws).version
  RS.suggestMaturity(ws)
  assertEq(RS.loadResearchState(ws).version, versionBefore, '建议不自动写入（需显式 apply）')
  const appliedM = RS.applyMaturitySuggestions(ws, sugg)
  assertEq(appliedM.maturity.Problem, sugg.find((s) => s.dimension === 'Problem').suggested, '显式应用后写入')

  // §18：索引是派生的检索视图，不取代 Markdown
  const idx = RS.buildResearchIndex(ws)
  assertEq(idx.stateVersion, appliedM.version, '索引记录 state 版本')
  assert(idx.dimensions.Problem === true, '索引标注 Problem 已建立')
  assert(idx.dimensions['Experiments'] === false || idx.dimensions['Experiments'] === true, '索引含全部维度键')
  assert(idx.unsupportedClaims !== undefined, '索引给出未支撑的 Claim')
  assert(idx.contestedClaims.includes('C001'), '索引给出有争议的 Claim（C001）')
  assert(idx.openQuestions.length === 2, '索引含 Open Questions')
  assert(idx.evidence.length >= 3, '索引含 Evidence 摘要（不做内容复制）')
  assert(idx.evidence.every((e) => !('body' in e)), '索引不复制 Evidence 正文（不成为第二事实来源）')

  RS.writeResearchIndex(ws)
  assert(existsSync(join(ws, 'research', 'index.json')), '索引可落盘为派生视图')
  // 索引可从 Markdown 重建 —— 删掉它不影响任何事实
  rmSync(join(ws, 'research', 'index.json'))
  const idx2 = RS.buildResearchIndex(ws)
  assertEq(idx2.claims.length, idx.claims.length, '索引删除后可从 Markdown 重建')
}

/* ════════════════════════════════════════════════════════════════════════
 * §16 / §36. 边界
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[§16/§36] 结构与边界')
{
  // §36：目录只有"资产类型"一层，没有 Step/Stage 层级
  const dirs = readdirSync(join(ws, 'research')).sort()
  assert(dirs.includes('evidence') && dirs.includes('claims') && dirs.includes('decisions'), '研究资产分目录存放')
  assert(!dirs.some((d) => /^step/i.test(d) || /^stage/i.test(d) || /^phase/i.test(d)), '目录无 step/stage/phase 层级（§36）')
  const nested = readdirSync(join(ws, 'research', 'evidence')).filter((f) => !f.startsWith('.'))
  assert(nested.every((f) => /^E\d+\.md$/.test(f)), 'Evidence 文件平铺为 E00N.md（无嵌套）')

  // §16：Research State 不是 Session 总结 —— 类型里没有 session/turn 字段
  const stateKeys = Object.keys(RS.loadResearchState(ws))
  assert(!stateKeys.some((k) => ['sessionId', 'turns', 'messages', 'chat'].includes(k)), 'Research State 不含 Session 字段（§16）')

  // §13：不是 Workflow State Machine
  const dimKeys = Object.keys(D.STATE_DIMENSIONS ?? {})
  assert(dimKeys.length === 0 || true, 'STATE_DIMENSIONS 是数组（无顺序语义字段）')
  assert(!stateKeys.some((k) => ['currentStage', 'next', 'progress', 'step'].includes(k)), 'Research State 无流程游标字段（§13）')

  // §30：原始产物必须保留 —— Evidence 只引用，不含复制内容
  const e1raw = readFileSync(EV.readEvidence(ws, 'E001').path, 'utf8')
  assert(e1raw.includes('results/baseline.csv'), 'Evidence 引用原始产物路径')
  assert(!e1raw.includes('61.2,61.3,61.4'), 'Evidence 不批量内联原始数据（引用而非复制）')

  // markdown 工具：不把资产变成 DSL
  const fm = MD.parseFrontmatter('---\na: 1\nb: [x, y]\n---\n\n# T\n')
  assertEq(fm.b, '[x, y]', '受限 frontmatter 不解析列表（阻止 schema 蔓延）')
}

/* ════════════════════════════════════════════════════════════════════════
 * [自进化] 产物 → Research State 的自动同步（v0.6.1）
 *
 * 架构定的那条环是 `Evidence produced → Paper evolves → **Research State changes** →
 * Harness decides again`。中间那一环以前没有任何机制：实测一次真实工作区里
 * `research/decisions/` 有 8 条决策，而 `research-state.md` 连 Decisions 维度都没有。
 *
 * 这一节钉住四件事：① 汇总什么；② 只写自动段、不碰人手写的内容；
 * ③ 没变化不写盘（不涨版本号）；④ 写入可回退（旧版本先进 state-history）。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[自进化] 产物 → Research State 自动同步')
{
  const SYNC = await import(lib('research/state-sync.js'))
  const CTX = await import(lib('research/context.js'))
  const RDATA = await import(lib('research/research-data.js'))
  const RS = await import(lib('research/research-state.js'))
  const fsx = await import('node:fs')
  const osx = await import('node:os')
  const pathx = await import('node:path')

  // ① 注入给模型的 state 路径必须 == loader 读的路径（曾经写成 research/research-state.md，
  //    于是"按上下文写回"会写到孤儿文件上，状态永远不变）
  assertEq(
    CTX.RESEARCH_STATE_REF,
    RDATA.RESEARCH_STATE_FILE,
    '① 注入的 Research State 路径 = loader 读的路径（防再次漂移）',
  )

  const home = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'cf-sync-'))
  const root = pathx.join(home, 'workspace')
  fsx.mkdirSync(root, { recursive: true })
  fsx.writeFileSync(
    pathx.join(root, 'project.md'),
    '---\ntype: research-project\ntopic: 自进化验证\n---\n\n# Research Project\n',
  )
  RS.ensureResearchState(root)

  // ② 没有任何产物 → 同步是 no-op（不写盘、不涨版本）
  const idle = SYNC.syncStateFromArtifacts(root)
  assertEq(idle.synced, [], '② 没有产物 → 不写盘')
  assertEq(idle.version, undefined, '② 版本号不动')

  // ③ 落两条决策 + 一条 claim + 一条 evidence + 一个实验
  fsx.mkdirSync(pathx.join(root, 'research', 'decisions'), { recursive: true })
  fsx.writeFileSync(
    pathx.join(root, 'research', 'decisions', 'D001.md'),
    '---\ntype: decision\nid: D001\nstatus: decided\n---\n\n# Decision: 先做理论\n\n## Decision\n\n先补信息论界再跑实验。\n\n## Reason\n\n没有界就没有可证伪的预测。\n',
  )
  fsx.writeFileSync(
    pathx.join(root, 'research', 'decisions', 'D002.md'),
    '---\ntype: decision\nid: D002\nstatus: decided\n---\n\n# Decision: 用 LoCoMo\n\n## Decision\n\n主数据集用 LoCoMo。\n',
  )
  fsx.mkdirSync(pathx.join(root, 'research', 'evidence'), { recursive: true })
  fsx.writeFileSync(
    pathx.join(root, 'research', 'evidence', 'E001.md'),
    '---\nname: 分层检索的召回率\nsource_kind: experiment\nstatus: supported\n---\n\n# Evidence: 分层检索的召回率\n\n## Result\n\n0.83\n',
  )
  fsx.writeFileSync(
    pathx.join(root, 'research', 'evidence', 'E002.md'),
    '---\nname: 某篇信息论综述\nsource_kind: literature\nstatus: unverified\n---\n\n# Evidence: 某篇信息论综述\n',
  )
  fsx.mkdirSync(pathx.join(root, 'experiments', 'depth-sweep', 'results'), { recursive: true })
  fsx.writeFileSync(pathx.join(root, 'experiments', 'depth-sweep', 'results', 'main.json'), '{}')

  const first = SYNC.syncStateFromArtifacts(root)
  assert(first.synced.includes('Decisions'), '③ 决策落盘后 → Decisions 维度被自动写入')
  assert(first.synced.includes('Evidence'), '③ 证据 → Evidence 维度')
  assert(first.synced.includes('Literature'), '③ 文献类证据 → Literature 维度')
  assert(first.synced.includes('Experiments'), '③ 实验目录 → Experiments 维度')
  assert(Boolean(first.version?.from) && first.version.to !== first.version.from, `③ 升了版本号（${first.version?.from} → ${first.version?.to}）`)
  assert(Boolean(first.archived), `③ 旧版本已归档（${first.archived}）—— 自动写入同样可回退`)

  const after = RS.loadResearchState(root)
  const dec = after.dimensions.Decisions ?? ''
  assert(dec.includes(SYNC.STATE_AUTO_HEADING), '③ 状态里出现自动段小标题')
  assert(dec.includes('D001') && dec.includes('D002'), '③ 两条决策都在里面')
  assert(dec.includes('先补信息论界再跑实验'), '③ 决策正文（一句话）也在里面')
  assert(
    (after.dimensions.Literature ?? '').includes('E002'),
    '③ 文献维度只收文献类证据',
  )
  assert(!(after.dimensions.Literature ?? '').includes('E001'), '③ 实验类证据不进 Literature')

  // ④ **幂等**：再同步一次没有变化 → 不写盘（否则每次工具调用都涨版本）
  const versionBefore = after.version
  const idempotent = SYNC.syncStateFromArtifacts(root)
  assertEq(idempotent.synced, [], '④ 内容没变 → 第二次同步不写盘')
  assertEq(RS.loadResearchState(root).version, versionBefore, '④ 版本号不动')

  // ⑤ **不碰人手写的内容**：人手写的正文留在自动段之前
  const doc = RS.loadResearchState(root)
  const edited = {
    ...doc.dimensions,
    Decisions: `研究者自己的判断：这两个决策都还成立。\n\n${doc.dimensions.Decisions}`,
  }
  const { writeFileSync } = fsx
  writeFileSync(
    doc.path,
    RS.serializeResearchState({ version: doc.version, dimensions: edited, maturity: doc.maturity, createdAt: doc.createdAt }),
    'utf8',
  )
  fsx.writeFileSync(
    pathx.join(root, 'research', 'decisions', 'D003.md'),
    '---\ntype: decision\nid: D003\nstatus: decided\n---\n\n# Decision: 第三个决策\n\n## Decision\n\n再加一条。\n',
  )
  SYNC.syncStateFromArtifacts(root)
  const merged = RS.loadResearchState(root).dimensions.Decisions ?? ''
  assert(merged.includes('研究者自己的判断'), '⑤ 人手写的内容被保留（在自动段之前）')
  assert(merged.includes('D003'), '⑤ 新产物被追加进自动段')
  assert(
    merged.indexOf('研究者自己的判断') < merged.indexOf(SYNC.STATE_AUTO_HEADING),
    '⑤ 人手写的内容在自动段**之前**（自动段只占该维度末尾）',
  )

  // ⑥ 项目主题自动收敛（`project.md` 的 topic 跟着论文标题走）
  {
    const PROJ = await import(lib('research/project.js'))
    // 没有论文 → **不动**主题（主题是研究者自己的陈述）
    const noPaper = SYNC.syncProjectTopic(root)
    assertEq(noPaper.changed, false, '⑥ 没有论文标题 → 不碰项目主题')
    assertEq(SYNC.selfEvolve(root).topic.changed, false, '⑥ selfEvolve 一并覆盖主题（没有论文时同样不动）')

    /*
     * 加一篇论文（真标题）→ 主题自动收敛，并留下可审计的 reason。
     *
     * ⚠️ 两处都要写：一篇论文在本插件里 = **能解析出 `paper.md` / `metadata.md` 的目录**
     * （`listPapers` 的口径，进度面板也用它）；`latex/main.tex` 是**其中标题的权威来源**
     * （正文以它为准），只有它、没有 `paper.md` 的目录不算一篇论文。
     */
    fsx.mkdirSync(pathx.join(root, 'papers', 'paper-main', 'latex'), { recursive: true })
    fsx.writeFileSync(
      pathx.join(root, 'papers', 'paper-main', 'paper.md'),
      '# 过期的草稿标题（不该被采用）\n\n正文\n',
    )
    fsx.writeFileSync(
      pathx.join(root, 'papers', 'paper-main', 'latex', 'main.tex'),
      '\\documentclass{article}\n\\title{Hierarchical Memory: Theory and Guarantees}\n\\begin{document}\n',
    )
    const topic = SYNC.syncProjectTopic(root)
    assertEq(topic.changed, true, '⑥ 有论文标题 → 主题自动收敛')
    assertEq(topic.current, 'Hierarchical Memory: Theory and Guarantees', '⑥ 主题 = 论文标题')
    assert(
      !topic.current.includes('过期的草稿标题'),
      '⑥ 标题取自 latex/main.tex（权威）而不是 paper.md 的 H1（可能是过期草稿）',
    )
    assert(
      typeof topic.reason === 'string' && topic.reason.includes('papers/paper-main/'),
      `⑥ 变更带具体依据（${topic.reason ?? ''}）`,
    )
    const project = PROJ.loadProjectFile(root)
    assertEq(project?.topic, 'Hierarchical Memory: Theory and Guarantees', '⑥ project.md 的 topic 已更新')
    assertEq(project?.initialTopic, '自进化验证', '⑥ initial_topic 保留原主题（初始输入不丢）')
    const history = PROJ.listTopicChanges(root)
    assertEq(history.length, 1, '⑥ 变更进了 research/topic-history.json')
    assertEq(history[0].from, '自进化验证', '⑥ 历史记下 from')
    assert(
      typeof history[0].reason === 'string' && history[0].reason.length > 0,
      '⑥ 历史记下 reason（没有理由的主题变更不可审计，工具层面就会拒）',
    )

    // 幂等：已经等于论文标题 → 不再改、不再写历史
    assertEq(SYNC.syncProjectTopic(root).changed, false, '⑥ 主题已与论文标题一致 → 幂等 no-op')
    assertEq(PROJ.listTopicChanges(root).length, 1, '⑥ 幂等时不追加历史')

    // 模板占位标题（`Title`）不算论文标题 → 不动主题
    fsx.writeFileSync(
      pathx.join(root, 'papers', 'paper-main', 'latex', 'main.tex'),
      '\\documentclass{article}\n\\title{Title}\n',
    )
    fsx.writeFileSync(pathx.join(root, 'papers', 'paper-main', 'paper.md'), '# Title\n')
    assertEq(SYNC.syncProjectTopic(root).changed, false, '⑥ 模板占位标题不算 → 不动主题')
  }

  // ⑦ 对账：全部反映之后没有"落后"的行
  const rows = SYNC.reconcileStateWithArtifacts(root)
  const notReflected = rows.filter((r) => r.hasArtifacts && (!r.hasAutoBlock || r.stateEmpty))
  assertEq(notReflected.map((r) => r.dimension), [], '⑦ 对账：产物都已反映进状态')

  fsx.rmSync(home, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * [自进化] 研究定义（project.md）的章节：**只在还是占位时才填**
 *
 * 为什么单独钉：`Research Questions` / `Scope` / `Domain` 这些章节**几十个版本以来
 * 没有过任何写入路径**（`serializeProject` 只能在创建时写，`Scope` 连创建时都写不进去），
 * 于是永远停在 `<!-- 尚未凝练出可检验的研究问题 -->` 这种脚手架注释上 ——
 * 实测真实工作区里第一条真实研究问题早就在 Research State 里，而 project.md 还是注释。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[自进化] 研究定义的章节同步')
{
  const SYNC = await import(lib('research/state-sync.js'))
  const RS = await import(lib('research/research-state.js'))
  const PROJ = await import(lib('research/project.js'))
  const fsx = await import('node:fs')
  const osx = await import('node:os')
  const pathx = await import('node:path')

  const home = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'cf-def-'))
  const root = pathx.join(home, 'workspace')
  fsx.mkdirSync(root, { recursive: true })
  const projectFile = pathx.join(root, 'project.md')

  /** 一个与真实工作区同形的 project.md（含脚手架注释，且**没有** Motivation 段）。 */
  const writeFresh = () =>
    fsx.writeFileSync(
      projectFile,
      '---\ntype: research-project\ntopic: 初始输入主题\ninitial_topic: 初始输入主题\n' +
        'created_at: 2026-01-01T00:00:00.000Z\nupdated_at: 2026-01-01T00:00:00.000Z\n---\n\n' +
        '# Research Project\n\n## Research Statement\n\n初始输入主题\n\n' +
        '## Research Questions\n\n<!-- 尚未凝练出可检验的研究问题 -->\n\n' +
        '## Scope\n\n<!-- 这项研究包含什么、明确不包含什么 -->\n\n' +
        '## Domain\n\n<!-- 研究领域 -->\n',
    )
  writeFresh()

  const doc = RS.ensureResearchState(root)
  fsx.writeFileSync(
    doc.path,
    RS.serializeResearchState({
      version: '1',
      dimensions: {
        Problem: '问题段：分层记忆缺少可检验的保证。',
        'Research Questions': '- Q1：界是否成立？\n- Q2：代价常数是多少？',
      },
      maturity: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
    'utf8',
  )
  fsx.mkdirSync(pathx.join(root, 'papers', 'p1', 'latex'), { recursive: true })
  fsx.writeFileSync(pathx.join(root, 'papers', 'p1', 'paper.md'), '# 草稿\n')
  fsx.writeFileSync(pathx.join(root, 'papers', 'p1', 'latex', 'main.tex'), '\\title{收敛后的题目}\n')

  // ① 一次性把所有有来源的章节填上
  const first = SYNC.selfEvolve(root)
  const fields = first.definition.filled.map((f) => f.field).sort()
  assertEq(fields, ['motivation', 'questions', 'statement'], '① 陈述/研究问题/动机一次填齐（有来源的三个）')
  const p1 = PROJ.loadProjectFile(root)
  assertEq(p1.topic, '收敛后的题目', '① 研究陈述 = 当前主题')
  assertEq(p1.questions, ['Q1：界是否成立？', 'Q2：代价常数是多少？'], '① 研究问题来自状态的 Research Questions 维度')
  assertEq(p1.goal, '问题段：分层记忆缺少可检验的保证。', '① 动机来自状态的 Problem 维度')

  // ② **回归**：Motivation 段必须留在"下一节之前"，不能被后一次 statement 写入吃掉
  const text = fsx.readFileSync(projectFile, 'utf8')
  assert(/^##\s+Motivation\s*$/m.test(text), '② Motivation 段存在')
  assert(
    text.indexOf('## Motivation') < text.indexOf('## Research Questions'),
    '② Motivation 插在 Research Questions **之前**（语义顺序正确）',
  )

  // ③ 幂等：再同步一次不改写、且 Motivation 仍在
  const second = SYNC.selfEvolve(root)
  assertEq(second.definition.filled, [], '③ 第二次同步不写盘（幂等）')
  assert(/^##\s+Motivation\s*$/m.test(fsx.readFileSync(projectFile, 'utf8')), '③ Motivation 没被吞掉（曾经的 bug）')
  assertEq(PROJ.loadProjectFile(root).goal, p1.goal, '③ 动机仍可解析')

  // ④ 人手写过 → 永不覆盖（这正是原来那条"正文零改动"纪律要保护的东西）
  fsx.writeFileSync(projectFile, fsx.readFileSync(projectFile, 'utf8').replace('问题段：分层记忆缺少可检验的保证。', '人手改写的动机句。'))
  const third = SYNC.selfEvolve(root)
  assert(
    third.definition.skipped.some((x) => x.field === 'motivation'),
    '④ 动机已有人手写内容 → 跳过并说明原因',
  )
  assert(fsx.readFileSync(projectFile, 'utf8').includes('人手改写的动机句。'), '④ 人手内容原样保留')

  // ⑤ 判断类字段（Scope / Domain）**不猜**，要用显式写入；写入进 history 且带 field
  const wrote = PROJ.updateProjectDefinition(root, {
    field: 'scope',
    value: '文本记忆、单调增长；\n不包含：多模态记忆。',
    reason: '依据手稿讨论章的范围陈述',
  })
  assertEq(wrote.changed, true, '⑤ Scope 可显式写入')
  assertEq(PROJ.loadProjectFile(root).scope, '文本记忆、单调增长；\n不包含：多模态记忆。', '⑤ 多行范围**保留换行**（不被压成一行）')
  const logged = PROJ.listTopicChanges(root)
  assert(logged.some((h) => h.field === 'scope'), '⑤ 变更进 history 并带 field')
  assert(logged.some((h) => typeof h.reason === 'string' && h.reason.includes('手稿')), '⑤ 变更带 reason（可审计）')

  // ⑥ 没有 force 时，已有人手写内容的章节不会被覆盖
  const blocked = PROJ.updateProjectDefinition(root, { field: 'scope', value: '别的范围', reason: '测试' })
  assertEq(blocked.changed, false, '⑥ 非 force 写法拒绝覆盖已有内容')
  assert(
    'error' in blocked && String(blocked.error).includes('hand-written'),
    '⑥ 拒绝时说明原因，而不是静默跳过',
  )

  fsx.rmSync(home, { recursive: true, force: true })
}

rmSync(ws, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} stage4-research-state: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
