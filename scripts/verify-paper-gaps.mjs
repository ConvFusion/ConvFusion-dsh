#!/usr/bin/env node
/**
 * ConvFusion — 论文 Gap 检测器自检。
 *
 * 守的是**四类假阳性**（它们曾在一篇真实稿子上报出 19 条缺口中的 14 条），
 * 以及一个反向要求：**真阳性必须仍然被报出来**。修假阳性时最容易顺手把真阳性
 * 也一起修没 —— 那样自检全绿、仪器却瞎了，比不修更糟。
 *
 *   [1] 章节按**角色**匹配（别名/包含），不是标题全等
 *   [2] 正文里的 `C1` 这类**决策类型编号**不能被当成 Claim 引用
 *   [3] 已裁定（rejected / superseded）的 Claim 不再报"缺证据/有争议"
 *   [4] 映射资产不存在时，报**一条**"缺映射"，而不是每条证据一条"未被使用"
 *
 * 用法：node scripts/verify-paper-gaps.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const G = await import(lib('research/paper-gaps.js'))
const P = await import(lib('research/paper.js'))
const EV = await import(lib('research/evidence.js'))
const CL = await import(lib('research/claims.js'))

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

/** 建一个临时研究根，只放一篇正文。 */
function paperWorkspace(markdown) {
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-gaps-'))
  const dir = join(ws, 'papers', 'paper-main')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'paper.md'), markdown, 'utf8')
  return ws
}

/** 一篇"章节齐备"的正文（可插入额外内容）。 */
const FULL_PAPER = (extra = '') =>
  [
    '# T', '',
    '## Abstract', '', 'A.', '',
    '## 1. Introduction', '', 'I.', '',
    '## 2. Background and Related Work', '', 'R.', '',
    '## 3. Framework and Model', '', `M. ${extra}`, '',
    '## 4. Evaluation', '', 'E.', '',
    '## 5. Discussion', '', 'D.', '',
    '## 6. Conclusion', '', 'C.',
  ].join('\n')

const gapsOf = (ws) => G.detectPaperGaps(ws, 'paper-main')
const typesOf = (ws) => gapsOf(ws).map((g) => g.type)
const claimsOf = (ws, type) => gapsOf(ws).filter((g) => g.type === type).map((g) => g.relatedClaim)

const cleanups = []

/* ══════════════════════════════════════════════════════════════════════
 * [1] 章节按角色匹配
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[1] 章节角色（别名 / 包含匹配）')
{
  // 真实稿子的章节名：没有任何一节叫 "Method" / "Results"
  const realistic = [
    '# T',
    '',
    '## Abstract',
    '',
    'Abstract body.',
    '',
    '## 1. Introduction',
    '',
    'Intro body.',
    '',
    '## 2. Background and Related Work',
    '',
    'Related body.',
    '',
    '## 3. Decision-Centric Research: Framework and DCRM Model',
    '',
    'Method body.',
    '',
    '## 4. Evaluation',
    '',
    'Setup and results.',
    '',
    '## 5. Discussion',
    '',
    'Discussion body.',
    '',
    '## 6. Conclusion',
    '',
    'Conclusion body.',
  ].join('\n')
  const ws1 = paperWorkspace(realistic)
  cleanups.push(ws1)
  assertEq(typesOf(ws1).filter((t) => t === 'missing-section').length, 0, '用别的章节名不再误报缺章节')

  // 反向：真的缺 Method 与 Related Work 时必须报
  const thin = ['# T', '', '## Abstract', '', 'A.', '', '## 1. Introduction', '', 'I.', '', '## 7. Conclusion', '', 'C.'].join('\n')
  const ws2 = paperWorkspace(thin)
  cleanups.push(ws2)
  const missing = gapsOf(ws2)
    .filter((g) => g.type === 'missing-section')
    .map((g) => g.relatedSection)
  assert(missing.includes('Method'), '真的缺 Method 仍要报')
  assert(missing.includes('Related Work'), '真的缺 Related Work 仍要报')
}

/* ══════════════════════════════════════════════════════════════════════
 * [2] 决策类型编号 ≠ Claim 引用
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[2] 正文里的 C1–C4（决策类型编号）不能被当成 Claim')
{
  // 与 paper-main 同形：taxonomy 用 C1..C4 表示 "C. Planning and next action" 下的类型
  const taxonomyText = [
    '# T',
    '',
    '## Abstract',
    '',
    'A.',
    '',
    '## 1. Introduction',
    '',
    'I.',
    '',
    '## 2. Background and Related Work',
    '',
    'R.',
    '',
    '## 3. Framework and Model',
    '',
    '| Category | Types |',
    '|---|---|',
    '| C. Planning and next action | C1 next action; C2 action priority; C3 continuation; C4 stopping condition |',
    '',
    'The ten types are A1, A2, B1, B2, C1, C4, D1, E2, F1, F2.',
    '',
    '## 4. Evaluation',
    '',
    'E.',
    '',
    '## 5. Discussion',
    '',
    'D.',
    '',
    '## 6. Conclusion',
    '',
    'C.',
  ].join('\n')

  // (a) 记录里是 C001 形状 → C1/C4 不算引用
  const wsA = paperWorkspace(taxonomyText)
  cleanups.push(wsA)
  CL.createClaim(wsA, { statement: 'The structured state is the mechanism.', paper: 'paper-main' })
  assertEq(claimsOf(wsA, 'unsupported-claim').length, 0, '决策类型编号不再被报成"无证据的 Claim"')
  assertEq(claimsOf(wsA, 'missing-evidence').length, 0, '决策类型编号不再被报成"引用了不存在的 Claim"')

  // (b) 同样正文，但**一个 Claim 都没记录** → 保守要求 3 位，仍然不误报
  const wsB = paperWorkspace(taxonomyText)
  cleanups.push(wsB)
  assertEq(claimsOf(wsB, 'missing-evidence').length, 0, '无记录时仍不把 C1 当 Claim')

  // (c) 反向：正文真的引用了一个不存在的三位编号 → 必须报
  const withBrokenRef = taxonomyText.replace('C. Planning and next action', 'see C099')
  const wsC = paperWorkspace(withBrokenRef)
  cleanups.push(wsC)
  CL.createClaim(wsC, { statement: 'x', paper: 'paper-main' })
  assertEq(claimsOf(wsC, 'missing-evidence').join(','), 'C099', '真的引用了不存在的 Claim 仍要报')
}

/* ══════════════════════════════════════════════════════════════════════
 * [3] 已裁定的 Claim 不是"缺证据"
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[3] rejected / superseded 的 Claim 不再报缺证据或有争议')
{
  const ws = paperWorkspace(FULL_PAPER('We report the negative result on C001.'))
  cleanups.push(ws)
  const claim = CL.createClaim(ws, { statement: 'Calibration beats LLM self-reported confidence.', paper: 'paper-main' })
  const contra = EV.createEvidence(ws, { name: 'Calibration ablation', sourceKind: 'experiment', rawArtifacts: ['r.json'], claim: 'Refutes the calibration claim.' })
  EV.linkEvidenceToClaim(ws, contra.id, claim.id, 'contradicts')
  // 同上：反驳关系要 reconcile 才落到 Claim 侧，否则"有争议"这条判据根本读不到它。
  CL.reconcileClaimEvidence(ws, claim.id)
  CL.setClaimStatus(ws, claim.id, 'rejected')
  assertEq(claimsOf(ws, 'unsupported-claim').length, 0, '被证伪的 Claim 不再报"无支持证据"')
  assertEq(claimsOf(ws, 'contested-claim').length, 0, '被证伪的 Claim 不再报"有争议"')
  // 非空洞性检查：把状态改回未裁定，同一份资产**必须**报出有争议 ——
  // 否则上面两条断言可能只是因为反驳证据根本没接上而"通过"。
  CL.setClaimStatus(ws, claim.id, 'unverified')
  assertEq(claimsOf(ws, 'contested-claim').join(','), claim.id, '未裁定时矛盾证据仍要报（证明夹具是活的）')
  CL.setClaimStatus(ws, claim.id, 'rejected')

  // 反向：没被裁定、正文引用了、且没有证据 → 必须报
  // 编号按**工作区**独立分配，所以先建 Claim 再把它写进正文（不要假定是 C002）。
  const ws2 = paperWorkspace(FULL_PAPER())
  cleanups.push(ws2)
  const c2 = CL.createClaim(ws2, { statement: 'An unbacked claim.', paper: 'paper-main' })
  writeFileSync(join(ws2, 'papers', 'paper-main', 'paper.md'), FULL_PAPER(`This depends on ${c2.id}.`), 'utf8')
  assertEq(claimsOf(ws2, 'unsupported-claim').join(','), c2.id, '真的无证据的 Claim 仍要报')
}

/* ══════════════════════════════════════════════════════════════════════
 * [4] 缺映射 ≠ 证据没用
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[4] 映射资产缺失时只报一条，而不是每条证据一条')
{
  const ws = paperWorkspace(FULL_PAPER())
  cleanups.push(ws)
  for (const n of ['Ten-type run', 'Frontier comparison', 'Ablation']) {
    EV.createEvidence(ws, { name: n, sourceKind: 'experiment', rawArtifacts: ['r.json'] })
  }
  const t = typesOf(ws)
  assertEq(t.filter((x) => x === 'unreferenced-evidence').length, 0, '没有映射时不逐条报"证据未被使用"')
  assertEq(t.filter((x) => x === 'no-claim-map').length, 1, '改为报一条"缺 Claim/Evidence 映射"')

  // 反向：**映射资产存在**时，逐条判定必须恢复。
  // 构造：Claim 有证据，但正文一处都没引用它 → claims.md 落盘后，
  // 映射"存在但为空"，此时"这条证据没被用在哪一节"是**可判定**的，必须报出来。
  const ws2 = paperWorkspace(FULL_PAPER())
  cleanups.push(ws2)
  const c = CL.createClaim(ws2, { statement: 'x', paper: 'paper-main' })
  const used = EV.createEvidence(ws2, { name: 'linked run', sourceKind: 'experiment', rawArtifacts: ['r.json'] })
  EV.linkEvidenceToClaim(ws2, used.id, c.id, 'supports')
  EV.setEvidenceStatus(ws2, used.id, 'verified')
  const orphan = EV.createEvidence(ws2, { name: 'orphan run', sourceKind: 'experiment', rawArtifacts: ['o.json'] })
  EV.setEvidenceStatus(ws2, orphan.id, 'verified')
  // ⚠️ `linkEvidenceToClaim` 只写**证据侧**（`evidence.supports`）；Claim 侧的 `evidence`
  // 列表要 `reconcileClaimEvidence` 才落到 `research/claims/C001.md`。漏了这步，
  // Claim 在记录里就是"无证据"，映射也就建不起来。
  CL.reconcileClaimEvidence(ws2, c.id)
  P.writeClaimMap(ws2, 'paper-main', P.readClaimMap(ws2, 'paper-main'))
  writeFileSync(join(ws2, 'papers', 'paper-main', 'paper.md'), FULL_PAPER(`See ${c.id}.`), 'utf8')
  const t2 = typesOf(ws2)
  assertEq(t2.filter((x) => x === 'no-claim-map').length, 0, '映射资产存在时不再报"缺映射"')
  const orphanGaps = gapsOf(ws2).filter((g) => g.type === 'unreferenced-evidence')
  assert(
    orphanGaps.some((g) => g.description.includes(orphan.id)),
    `映射存在时，真正没被用到的证据必须报出来（${orphan.id}）`,
  )
  assert(
    !orphanGaps.some((g) => g.description.includes(used.id)),
    '被正文用到的证据不报',
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
for (const ws of cleanups) rmSync(ws, { recursive: true, force: true })
console.log(`\n== paper-gaps 自检：${passed} passed, ${failed} failed ==`)
if (failed > 0) {
  console.log('失败项：')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
