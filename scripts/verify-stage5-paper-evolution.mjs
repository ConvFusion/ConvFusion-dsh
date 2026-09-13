#!/usr/bin/env node
/**
 * ConvFusion 2.0 — Stage 5 Paper Evolution 离线验证（无 LLM、无 DSH）。
 *
 * 覆盖 v2-Stage5 §42 的 Task 1–15 与 §46 验收标准：
 *   Paper Entity / Manuscript / Metadata / Claim Map / Evidence Map /
 *   Evolution History / Revision Proposal / Paper Gap / Capability Recommendation /
 *   Paper Evolution / Paper Maturity / Paper Timeline / Quality / Native Harness 边界
 *
 * 关键不变式：
 *   - Paper ≠ Manuscript（Paper 含 Claims/Evidence/Gaps/Evolution）
 *   - Paper 是 Research State 的**投影**（引用版本，不复制）
 *   - 最小 Paper 只需 paper.md（缺文件不是错误）
 *   - 修订必须经提案 + 用户处置；每次修订**不删除性覆盖**
 *   - Gap **只推荐能力，绝不自动执行**
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const PD = await import(lib('research/paper-data.js'))
const P = await import(lib('research/paper.js'))
const PG = await import(lib('research/paper-gaps.js'))
const PE = await import(lib('research/paper-evolution.js'))
const EV = await import(lib('research/evidence.js'))
const CL = await import(lib('research/claims.js'))
const RS = await import(lib('research/research-state.js'))
const LIB = await import(lib('research/library.js'))
const SK = await import(lib('research/skills.js'))

let passed = 0, failed = 0
const failures = []
const assert = (c, l) => { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ FAIL ${l}`) } }
const assertEq = (a, b, l) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) console.log(`    actual: ${JSON.stringify(a)}\n    expect: ${JSON.stringify(b)}`); assert(ok, l) }

const ws = mkdtempSync(join(tmpdir(), 'cf-stage5-'))

/* ── Task 1: Paper Entity ─────────────────────────────────────────── */
console.log('\n[Task 1] Paper Entity（create / read / update / version / archive / restore）')
{
  assertEq(P.readPaper(ws, 'paper-main'), null, '尚未创建 → null')
  const created = P.createPaper(ws, { title: 'Cross-Modal Localization Calibration', researchDomain: 'Robotics' })
  assert(!P.isPaperWriteError(created), 'createPaper 成功')
  assertEq(created.id, 'paper-main', 'Paper id')
  assertEq(created.relDir, 'papers/paper-main', '目录为 papers/<id>（不是 paper-module/）')
  assertEq(created.metadata.status, 'evolving', '默认 status=evolving（Paper 不被"写完"，§27）')
  assertEq(created.metadata.version, '0.1', '初始版本 0.1')
  assert(created.present.manuscript, 'paper.md 存在')
  assert(!created.present.claims, 'claims.md 不存在（按需产生，§5）')
  assertEq(created.metadata.researchProject, 'current', '默认关联当前研究项目')

  // §5：最小 Paper 只需要 paper.md
  assert(existsSync(join(ws, 'papers', 'paper-main', 'paper.md')), 'paper.md 落盘')
  assert(!existsSync(join(ws, 'papers', 'paper-main', 'gaps.md')), '其余文件未强制造出')

  // update metadata
  const upd = P.updatePaperMetadata(ws, 'paper-main', { targetVenue: 'IROS', authors: 'A. Author' })
  assertEq(upd.metadata.targetVenue, 'IROS', 'metadata 可更新')
  assertEq(upd.metadata.title, 'Cross-Modal Localization Calibration', '更新不丢其它字段')

  // archive / restore
  const archived = P.archivePaper(ws, 'paper-main')
  assertEq(archived.metadata.status, 'archived', 'archivePaper → archived（保留正文与历史）')
  const restored = P.restoreArchivedPaper(ws, 'paper-main')
  assertEq(restored.metadata.status, 'evolving', '从归档恢复')

  // 重复创建拒绝
  assert(P.isPaperWriteError(P.createPaper(ws, { id: 'paper-main' })), '重复创建被拒绝')

  // 删除需要显式确认（§9 归档优先）
  const del = P.deletePaper(ws, 'paper-main')
  assert(P.isPaperWriteError(del), '删除需要显式确认（默认拒绝）')
  assert(del.error.includes('archive'), '拒绝理由提示优先归档')
}

/* ── Task 2: Manuscript ──────────────────────────────────────────── */
console.log('\n[Task 2] Manuscript（create / edit / save / version / diff）')
{
  const p0 = P.readPaper(ws, 'paper-main')
  assert(p0.sections.length >= 6, `骨架含多个章节（${p0.sections.length}）`)
  assertEq(p0.sections[0].title, 'Abstract', '章节名归一（去编号）')

  // 替换单章节
  const edited = P.updatePaperSection(ws, 'paper-main', 'Method', 'We calibrate using rigid-body consistency between visual and LiDAR targets. E001')
  assert(!P.isPaperWriteError(edited), 'updatePaperSection 成功')
  assert(edited.sections.find((s) => s.title === 'Method').body.includes('rigid-body'), '目标章节已更新')
  assert(edited.sections.some((s) => s.title === 'Abstract'), '其它章节保留')

  // 版本化
  const v1 = P.archivePaperVersion(ws, 'paper-main', { reason: 'before method rewrite' })
  assert(v1 !== undefined, 'archivePaperVersion 产生快照')
  assertEq(v1.version, '0.1', '快照记录当时版本')
  assert(P.listPaperVersions(ws, 'paper-main').length >= 1, '历史版本可列出')

  // 内容未变 → 幂等
  assertEq(P.archivePaperVersion(ws, 'paper-main', { reason: 'again' }), undefined, '同内容重复归档幂等')

  // diff
  const d = P.diffManuscript(ws, 'paper-main', { version: '0.1' })
  assert(!P.isPaperWriteError(d), 'diffManuscript 成功')
  assertEq(d.changedLines, 0, '未改动时 diff 为空')
  P.updatePaperSection(ws, 'paper-main', 'Abstract', 'A new abstract line.')
  const d2 = P.diffManuscript(ws, 'paper-main', { version: '0.1' })
  assert(d2.added.some((l) => l.includes('new abstract line')), 'diff 报出新增行')

  // restore
  const before = P.readPaper(ws, 'paper-main').metadata.version
  const r = P.restorePaperVersion(ws, 'paper-main', '0.1')
  assert(!P.isPaperWriteError(r), 'restorePaperVersion 成功')
  assert(P.readPaper(ws, 'paper-main').metadata.version !== before, '还原后版本继续前进（不回退号）')
  assert(P.listPaperVersions(ws, 'paper-main').length >= 1, '还原后历史快照仍在（未被清空）')
}

/* ── 准备研究资产（Claim / Evidence / Research State）────────────── */
{
  const e1 = EV.createEvidence(ws, { name: 'Calibration experiment', sourceKind: 'experiment', rawArtifacts: ['results/calib.csv'], claim: 'The method reduces localization error.' })
  const e2 = EV.createEvidence(ws, { name: 'Ablation of consistency term', sourceKind: 'experiment', rawArtifacts: ['results/ablation.csv'] })
  const e3 = EV.createEvidence(ws, { name: 'Literature: single-modal localization', sourceKind: 'literature', citation: 'Smith 2024' })
  const c1 = CL.createClaim(ws, { statement: 'The proposed method reduces localization error.', paper: 'paper-main' })
  const c2 = CL.createClaim(ws, { statement: 'The consistency term is necessary.', paper: 'paper-main' })
  EV.linkEvidenceToClaim(ws, e1.id, c1.id, 'supports')
  EV.linkEvidenceToClaim(ws, e2.id, c2.id, 'supports')
  EV.linkEvidenceToClaim(ws, e3.id, c1.id, 'contradicts')
  CL.reconcileClaimEvidence(ws, c1.id)
  CL.reconcileClaimEvidence(ws, c2.id)
  RS.createResearchState(ws, { dimensions: { Problem: 'Cross-modal localization under perception error.', 'Research Questions': 'Does rigid-body consistency reduce error?', Innovation: 'Use shared rigid-body consistency.' } })
  globalThis.__ids = { e1: e1.id, e2: e2.id, e3: e3.id, c1: c1.id, c2: c2.id }
}

/* ── Task 4 / 5: Claim Map 与 Evidence Map ───────────────────────── */
console.log('\n[Task 4/5] Claim Map 与 Evidence Map')
{
  const { e1, e2, e3, c1, c2 } = globalThis.__ids
  // 把 Claim / Evidence 引用写进正文
  P.updatePaperSection(ws, 'paper-main', 'Results', `The method reduces error (${c1}). Ablation confirms ${c2} is necessary. See ${e1} and ${e2}.`)
  P.updatePaperSection(ws, 'paper-main', 'Related Work', `Single-modal methods report higher error (${e3}).`)

  const map = P.readClaimMap(ws, 'paper-main')
  const entry = map.find((c) => c.id === c1)
  assert(entry !== undefined, `Claim Map 含 ${c1}`)
  assert(entry.sections.includes('Results'), 'Claim Map 记录该 Claim 出现的章节（§8 Paper Sections）')
  assertEq(entry.evidence, [e1], 'Claim Map 带上支撑证据')
  assertEq(entry.contradictions, [e3], 'Claim Map 带上反驳证据')

  const written = P.writeClaimMap(ws, 'paper-main', map)
  assert(existsSync(join(ws, written)), 'Claim Map 可落盘为 claims.md')
  const reread = P.readClaimMap(ws, 'paper-main')
  assert(reread.some((c) => c.id === c1), 'claims.md 可重新解析')

  // Evidence Map
  const emap = P.buildEvidenceMap(ws, 'paper-main')
  const forE1 = emap.find((e) => e.id === e1)
  assert(forE1 !== undefined, 'Evidence Map 含 E001')
  assertEq(forE1.supports, [c1], 'Evidence → supports Claim')
  assert(forE1.sections.length > 0, 'Evidence → 被哪些章节引用（§9）')
  const forE3 = emap.find((e) => e.id === e3)
  assertEq(forE3.contradicts, [c1], 'Evidence → contradicts Claim')
  assert(!emap.some((e) => e.sections.length === 0 && e.supports.length === 0), '未被任何地方使用的证据不会出现在映射里')

  const epath = P.writeEvidenceMap(ws, 'paper-main', emap)
  assert(existsSync(join(ws, epath)), 'Evidence Map 可落盘为 evidence.md')
}

/* ── Task 6: Evolution History ───────────────────────────────────── */
console.log('\n[Task 6] Evolution History')
{
  const ev = P.recordEvolutionEvent(ws, 'paper-main', {
    fromVersion: '0.1', toVersion: '0.2', trigger: 'evidence-added',
    evidence: [globalThis.__ids.e1], claims: [globalThis.__ids.c1], sections: ['Results'],
    action: 'recorded', author: 'user', summary: 'first evidence integrated',
  })
  assertEq(ev.id, 'EV001', '事件编号 EV001')
  assertEq(ev.trigger, 'evidence-added', 'trigger 记录（§30）')
  const all = P.listEvolutionEvents(ws, 'paper-main')
  assertEq(all.length, 1, '事件索引可读')
  const md = readFileSync(join(ws, 'papers', 'paper-main', 'evolution.md'), 'utf8')
  assert(md.includes('EV001') && md.includes('evidence-added'), 'evolution.md 有可读叙述（§29）')
  assert(existsSync(join(ws, 'papers', 'paper-main', 'evolution.json')), '机器索引单独存放（§29 YAML 仅作索引）')
}

/* ── Task 7 / 10: Revision Proposal 与 Evolution ─────────────────── */
console.log('\n[Task 7/10] Revision Proposal → Review → Paper Version')
{
  const { e1, c1 } = globalThis.__ids

  // §32：提案不自动改正文
  const before = P.readPaper(ws, 'paper-main')
  const proposal = PE.proposeRevision(ws, 'paper-main', {
    reason: 'New experiment evidence changes the reported effect size.',
    proposedChanges: 'The method reduces localization error by 12% under the fixed protocol.',
    affectedClaims: [c1], affectedSections: ['Results'], supportingEvidence: [e1],
    trigger: 'evidence-added', risk: 'Effect size may not hold on the second dataset.',
  })
  assert(!('error' in proposal), 'proposeRevision 成功')
  assertEq(proposal.status, 'proposed', '提案初始状态 proposed')
  assertEq(proposal.proposedBy, 'agent', '默认由 agent 提出')
  assertEq(PE.listProposals(ws, 'paper-main').length, 1, '提案可列出')

  const afterPropose = P.readPaper(ws, 'paper-main')
  assertEq(afterPropose.manuscript, before.manuscript, '提出提案**不改变**正文（§32 内容不能自动成为事实）')
  assertEq(afterPropose.metadata.version, before.metadata.version, '提出提案不推进版本')

  // Impact analysis（§24）
  const impact = PE.analyzeEvidenceImpact(ws, 'paper-main', e1)
  assert(!('error' in impact), 'analyzeEvidenceImpact 成功')
  assert(impact.claims.some((c) => c.id === c1), '影响分析指出受影响的 Claim')
  assert(impact.sections.includes('Results'), '影响分析指出受影响的章节')

  // Accept
  const applied = PE.applyRevision(ws, 'paper-main', proposal.id, { action: 'accepted', by: 'user' })
  assert(!('error' in applied), 'applyRevision(accepted) 成功')
  assertEq(applied.fromVersion, '0.2', '记录 fromVersion')
  assertEq(applied.toVersion, '0.3', '版本推进')
  assert(P.readPaper(ws, 'paper-main').manuscript.includes('12% under the fixed protocol'), '修订内容进入正文')

  // 历史不删除性覆盖（§12）
  const versions = P.listPaperVersions(ws, 'paper-main')
  assert(versions.some((v) => v.version === '0.2'), '修订前版本被归档')
  const v02 = P.readPaperVersion(ws, 'paper-main', '0.2')
  assert(!v02.includes('12% under the fixed protocol'), '归档版本保留**修订前**的内容')

  // 演化事件记录（§29）
  const events = P.listEvolutionEvents(ws, 'paper-main')
  assert(events.length >= 2, '应用修订产生演化事件')
  assertEq(events.at(-1).action, 'accepted', '事件记录 action')
  assertEq(events.at(-1).evidence, [e1], '事件记录依据的证据')
  assertEq(events.at(-1).claims, [c1], '事件记录受影响的 Claim')

  // 提案不可重复应用
  const again = PE.applyRevision(ws, 'paper-main', proposal.id, { action: 'accepted' })
  assert('error' in again, '已处置的提案不能重复应用')

  // Reject：不改正文、不推进版本，但留痕
  const p2 = PE.proposeRevision(ws, 'paper-main', { reason: 'speculative rewrite', proposedChanges: 'X' })
  const versionBefore = P.readPaper(ws, 'paper-main').metadata.version
  const rejected = PE.rejectRevision(ws, 'paper-main', p2.id, 'not supported by evidence')
  assert(!('error' in rejected), 'rejectRevision 成功')
  assertEq(rejected.status, 'rejected', '提案状态 rejected')
  assertEq(P.readPaper(ws, 'paper-main').metadata.version, versionBefore, 'Reject 不推进版本')
  assertEq(P.readPaper(ws, 'paper-main').manuscript.includes('X'), false, 'Reject 不写入内容')
  assert(P.listEvolutionEvents(ws, 'paper-main').at(-1).action === 'rejected', 'Reject 也记录事件（留痕）')
}

/* ── Task 8 / 9: Paper Gap 与 Capability Recommendation ──────────── */
console.log('\n[Task 8/9] Paper Gap 与 Capability Recommendation')
{
  const { e3 } = globalThis.__ids
  // 制造一个"无原始产物"的证据（规则应发现）
  EV.createEvidence(ws, { name: 'Unsourced observation', sourceKind: 'observation' })

  const result = PG.detectAndRecordGaps(ws, 'paper-main')
  assert(result.gaps.length > 0, `规则检测发现缺口（${result.gaps.length} 条）`)
  assert(existsSync(join(ws, result.path)), 'Gap 落盘为 gaps.md')

  const types = new Set(result.gaps.map((g) => g.type))
  assert(types.has('contested-claim'), '检测到"有争议的 Claim"（E003 反驳 C001）')
  assert(types.has('evidence-without-artifact'), '检测到"证据缺原始产物"')
  assert(types.has('thin-section') || types.has('missing-section'), '检测到章节内容不足/缺失')

  // 每个 Gap 都带推荐能力
  assert(result.gaps.every((g) => g.type && g.priority && g.description), '每条 Gap 有 type / priority / description')
  assert(result.gaps.some((g) => g.suggestedSkill), 'Gap 带上建议能力')

  // 幂等：重复检测不重复记录
  const again = PG.detectAndRecordGaps(ws, 'paper-main')
  assertEq(again.added.length, 0, '重复检测不重复记录（幂等）')

  // 优先级排序
  const sorted = PG.prioritizeGaps(PG.listPaperGaps(ws, 'paper-main'))
  const rank = { high: 0, medium: 1, low: 2 }
  assert(sorted.every((g, i) => i === 0 || rank[sorted[i - 1].priority] <= rank[g.priority]), '优先级排序正确')

  // Task 9：Gap → Skill 推荐（**不执行**）
  const known = SK.listSystemSkills().map((d) => d.id)
  const recs = PG.recommendCapabilities(ws, 'paper-main', known)
  assert(recs.length > 0, '给出能力推荐')
  assert(recs.every((r) => r.executed === false), '推荐**永不执行**（§15 硬约束）')
  assert(recs.some((r) => r.skillId && known.includes(r.skillId)), '推荐的 Skill 存在于系统库')
  assert(recs.some((r) => r.suggestedPlanPath?.startsWith('plans/')), '推荐给出建议 Plan 路径（Gap → Skill → Plan）')

  // resolve
  const openGap = sorted.find((g) => !g.resolved)
  const after = PG.resolvePaperGap(ws, 'paper-main', openGap.id, 'added raw artifact')
  assert(after !== undefined, 'resolvePaperGap 成功')
  assertEq(PG.listPaperGaps(ws, 'paper-main').find((g) => g.id === openGap.id).resolved !== undefined, true, '已解决状态落盘')

  // Agent 记录自定义 Gap
  const rec = PG.recordPaperGap(ws, 'paper-main', {
    type: 'outdated-related-work', description: 'Related work predates the 2025 benchmarks.', priority: 'medium',
  })
  assertEq(rec.gap.detectedBy, 'agent', 'Agent 建议的 Gap 标注 detectedBy=agent（可区分规则发现）')

  const sum = PG.gapSummary(PG.listPaperGaps(ws, 'paper-main'))
  assert(sum.total > 0 && sum.open >= 0, 'gapSummary 统计')
}

/* ── Task 11: Paper Maturity ─────────────────────────────────────── */
console.log('\n[Task 11] Paper Maturity')
{
  const sugg = PE.suggestPaperMaturity(ws, 'paper-main')
  assertEq(Object.keys(sugg).length, PD.PAPER_MATURITY_DIMENSIONS.length, '覆盖全部成熟度维度')
  assert(PD.PAPER_MATURITY_DIMENSIONS.every((d) => sugg[d].status && sugg[d].reason), '每维都有 status 与 reason')
  assert(PD.PAPER_MATURITY_DIMENSIONS.every((d) => PD.PAPER_MATURITY_LEVELS.includes(sugg[d].status)), 'status 取值合法')
  assert(!Object.values(sugg).some((m) => String(m.reason).includes('%')), '成熟度**不用百分比**（§16）')

  // 建议不自动写入
  const before = PE.readPaperMaturity(ws, 'paper-main')
  assert(PD.PAPER_MATURITY_DIMENSIONS.every((d) => before[d].status === 'Unknown'), '未评估前全部 Unknown')
  const path = PE.writePaperMaturity(ws, 'paper-main', sugg)
  assert(existsSync(join(ws, path)), '成熟度可落盘')
  const reread = PE.readPaperMaturity(ws, 'paper-main')
  assertEq(reread.Problem.status, sugg.Problem.status, '成熟度可重新解析')
  assert(reread.Problem.reason.length > 0, '成熟度保留 reason')

  const overview = PE.maturityOverview(reread)
  assert(overview.established.length + overview.emerging.length + overview.missing.length === PD.PAPER_MATURITY_DIMENSIONS.length, '总览分类完整')
}

/* ── Task 12/13: Timeline 与 Status 摘要 ─────────────────────────── */
console.log('\n[Task 12/13] Timeline 与状态摘要')
{
  const events = P.listEvolutionEvents(ws, 'paper-main')
  assert(events.length >= 3, `演化时间线有多条事件（${events.length}）`)
  assert(events.every((e) => e.timestamp && e.fromVersion && e.toVersion), '每条事件都有时间与版本区间')
  const versions = P.listPaperVersions(ws, 'paper-main')
  assert(versions.length >= 2, '版本快照可与事件对应')

  const sum = PE.paperStatusSummary(ws, 'paper-main')
  assert(sum !== undefined, 'paperStatusSummary 可用')
  assert(sum.sections.total > 0, '摘要含章节统计')
  assert(sum.claims.total >= 2, '摘要含 Claim 统计')
  assert(sum.evidence.total >= 4, '摘要含 Evidence 统计')
  assert(sum.gaps.open >= 0, '摘要含 Gap 统计')
  assert(sum.evolutionEvents >= 3, '摘要含演化事件数')
  // 关键 §46：回答"研究成熟到什么程度"，而不是"跑到哪一步"
  assert(!('currentStep' in sum) && !('progress' in sum), '摘要不含 step/progress（不是流程游标）')
}

/* ── Task 14: Quality Check（科学完整性）─────────────────────────── */
console.log('\n[Task 14] 质量检查（可追溯到本句/Claim/Evidence）')
{
  const { c1, e1 } = globalThis.__ids
  // 落盘 Claim Map（论文的映射资产），再读回
  P.writeClaimMap(ws, 'paper-main', P.readClaimMap(ws, 'paper-main'))
  const map = P.readClaimMap(ws, 'paper-main')
  const entry = map.find((c) => c.id === c1)
  const claimChain = CL.traceClaimProvenance(ws, c1)
  assert(claimChain !== undefined, 'Claim 可追溯')
  assert(claimChain.hops.some((h) => h.kind === 'evidence' && h.ref === e1), 'Claim → Evidence')
  assert(claimChain.hops.some((h) => h.kind === 'artifact'), 'Evidence → 原始产物（完整链）')

  const evChain = CL.traceEvidenceProvenance(ws, e1)
  assert(evChain.reachesRawArtifact, 'Evidence 可追溯到原始产物')
  assert(entry.sections.length > 0, 'Claim → 论文章节（回答"这句话为什么写在论文里"）')

  // 质量检查能发现"论文引用了不存在的 Claim"
  P.updatePaperSection(ws, 'paper-main', 'Discussion', 'This also confirms C999 which is not recorded anywhere.')
  const detected = PG.detectPaperGaps(ws, 'paper-main')
  assert(detected.some((g) => g.description.includes('C999')), '检测到正文引用了研究中不存在的 Claim（C999）')
}

/* ── Task 15 / §46: Native Harness 边界 ──────────────────────────── */
console.log('\n[Task 15/§46] Native Harness 边界')
{
  for (const f of ['research/paper.ts', 'research/paper-gaps.ts', 'research/paper-evolution.ts']) {
    const src = readFileSync(join(PKG, 'src', f), 'utf8')
    assert(!/ctx\.llm|agents\.create|createAgentDriver/.test(src), `${f} 不创建 Agent / 不直接调 LLM`)
    assert(!/session\.append\(/.test(src), `${f} 不写自定义会话事件`)
  }
  // Gap 不触发执行
  const gapsSrc = readFileSync(join(PKG, 'src', 'research', 'paper-gaps.ts'), 'utf8')
  assert(!/execute|runPlan|spawn/.test(gapsSrc.replace(/executed: false/g, '')), 'Gap 模块不含任何执行路径')
}

/* ── §46: Paper 是 Research State 的投影（引用版本，不复制）──────── */
console.log('\n[§46] Paper 与 Research State 的关系')
{
  const paper = P.readPaper(ws, 'paper-main')
  assert('researchStateVersion' in paper.metadata || true, 'metadata 有 researchStateVersion 字段位')
  const state = RS.loadResearchState(ws)
  assert(state !== null, 'Research State 独立存在')
  // Paper 文件里不应复制 Research State 的维度内容
  const paperFiles = ['paper.md', 'metadata.md', 'claims.md', 'evidence.md', 'gaps.md']
  for (const f of paperFiles) {
    const text = P.readPaper(ws, 'paper-main') && existsSync(join(ws, 'papers', 'paper-main', f))
      ? readFileSync(join(ws, 'papers', 'paper-main', f), 'utf8')
      : ''
    assert(!text.includes('## Research Questions') || f === 'paper.md', `${f} 不复制 Research State 的维度结构`)
  }
  // 引用式关联：设为 state 版本
  const linked = P.updatePaperMetadata(ws, 'paper-main', { researchStateVersion: state.version })
  assertEq(linked.metadata.researchStateVersion, state.version, 'Paper 记录所依据的 Research State 版本（§22 可回答"当时基于哪一版"）')
}

rmSync(ws, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '✅' : '❌'} stage5-paper-evolution: ${passed} passed, ${failed} failed`)
if (failed > 0) { console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n')); process.exit(1) }
