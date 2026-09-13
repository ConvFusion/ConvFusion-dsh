#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 从旧模块提示词生成新的系统 Skill Library。
 *
 * ## 数据流
 *
 * ```text
 * ConvFusion-dev 的 8 模块提示词（161 个常量）
 *        ↓  按人工映射表重组（scripts/lib/skill-migration-map.mjs）
 * 系统 Skill Library（包内资产 skills/<category>/<id>.md，只读）
 * ```
 *
 * ## 关键设计
 *
 * 1. **逐字提示词被保留**在 `## Source Prompts (verbatim from ConvFusion)`：
 *    那是 accumulated research intelligence（v2-Stage0 §9），不是要丢弃的旧格式；
 *    同时把 origin 写进 frontmatter，可追溯到具体文件。
 * 2. **不是名称映射**（Stage 2 §26-I）：按**能力**重新组织，一个 Skill 可能合并多个旧节点，
 *    也可能只取其中一个的语义。
 * 3. **快照可复现**：逐字正文写入 `skills/.sources/<id>.json`，因此重新生成
 *    不依赖 ConvFusion-dev 是否在场；有它时可用 `--refresh` 更新快照。
 *
 * 用法：
 *   node scripts/gen-skill-library.mjs            # 从快照生成 skills/
 *   node scripts/gen-skill-library.mjs --refresh  # 重新从 ConvFusion-dev 取逐字正文
 *   node scripts/gen-skill-library.mjs --check    # 只校验，不写文件
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { SKILLS as CORE_SKILLS } from './lib/skill-migration-map.mjs'
import { SKILLS as INNOVATION_DECISION } from './lib/skill-migration-map-innovation-decision.mjs'
import { SKILLS as PLANNING_RESOURCE } from './lib/skill-migration-map-planning-resource.mjs'
import { SKILLS as EXPERIMENT_ANALYSIS } from './lib/skill-migration-map-experiment-analysis.mjs'
import { SKILLS as PAPER } from './lib/skill-migration-map-paper.mjs'
import { SKILLS as OUTPUT } from './lib/skill-migration-map-output.mjs'
import { SKILLS as PROCESS } from './lib/skill-migration-map-process.mjs'

/** 合并全部分段映射表（分段便于并行维护）。 */
const SEGMENTS = [CORE_SKILLS, INNOVATION_DECISION, PLANNING_RESOURCE, EXPERIMENT_ANALYSIS, PAPER, OUTPUT, PROCESS]
const SKILLS = SEGMENTS.flat()
/** id 冲突检测：两个分段定义了同一个 id 说明重组判断不一致。 */
{
  const seen = new Map()
  for (const s of SKILLS) {
    if (seen.has(s.id)) {
      console.error(`✗ duplicate skill id "${s.id}" defined in two segments`)
      process.exit(1)
    }
    seen.set(s.id, s)
  }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * 包根目录。
 *
 * ⚠️ 仓库已从 monorepo（`packages/dsh-convfusion/`）**扁平化**为单包仓库：
 * 插件即仓库根。这里曾写死 `packages/dsh-convfusion`，扁平化后会让生成器
 * 找不到 `skills/` 而静默失败。
 */
const PKG = ROOT
const SKILLS_DIR = join(PKG, 'skills')
const SNAP_DIR = join(SKILLS_DIR, '.sources')
/** 旧库路径（仅 `--refresh` 需要）：可经环境变量覆盖，避免硬编码本机路径。 */
const CONVFUSION_DEV = process.env.CONVFUSION_DEV || ''

const args = process.argv.slice(2)
const REFRESH = args.includes('--refresh')
const CHECK = args.includes('--check')
/** 删除不在映射表里的 .md（改名/合并后防止孤儿 Skill 残留）。 */
const PRUNE = args.includes('--prune')

/* ── 从 ConvFusion-dev 提取逐字提示词 ─────────────────────────────────── */

/** 提取文件里最长的三引号字符串常量（= 提示词正文）。 */
/**
 * 提取文件里的提示词正文。
 *
 * 旧代码库有两种形态（子代理勘察确认）：
 *   1. **模块级常量**：`SYSTEM_PROMPT = """..."""` —— 最常见，记录常量名。
 *   2. **函数内 f-string**：提示词在 `build_prompt()` 里拼装，没有模块级常量。
 *      这类仍有真实内容，不能因为不是顶层常量就丢掉（那是研究智能）。
 *
 * 因此按「最长的三引号字符串」提取，不限定必须在模块级；
 * 名字附 `(function-embedded)` 标示第二种形态，便于人工复核。
 */
function extractPrompt(absPath) {
  let src
  try {
    src = readFileSync(absPath, 'utf8')
  } catch {
    return null
  }

  // 候选 1：模块级常量（带名字）
  const named = []
  const namedRe = /^([A-Z][A-Z0-9_]*)\s*=\s*("""|\'\'\')([\s\S]*?)\2/gm
  let m
  while ((m = namedRe.exec(src))) {
    const body = m[3].trim()
    if (body.length >= 80) named.push({ name: m[1], body, embedded: false })
  }

  // 候选 2：任意位置的三引号字符串（含函数内 f-string）
  const any = []
  const anyRe = /("""|\'\'\')([\s\S]*?)\1/g
  while ((m = anyRe.exec(src))) {
    const body = m[2].trim()
    if (body.length >= 80) any.push({ name: 'PROMPT', body, embedded: true })
  }

  const pool = named.length > 0 ? named : any
  if (pool.length === 0) return null
  return pool.reduce((a, b) => (b.body.length > a.body.length ? b : a))
}

/** 为一个 Skill 收集逐字来源。 */
function collectSources(skill) {
  const out = []
  for (const s of skill.sources ?? []) {
    const abs = join(CONVFUSION_DEV, s.file)
    const prompt = extractPrompt(abs)
    if (!prompt) {
      out.push({ file: s.file, missing: true })
      continue
    }
    out.push({ file: s.file, const: s.const ?? (prompt.embedded ? `${prompt.name} (function-embedded)` : prompt.name), text: prompt.body })
  }
  return out
}

/* ── 快照读写 ─────────────────────────────────────────────────────────── */

function snapshotPath(id) {
  return join(SNAP_DIR, `${id}.json`)
}

function loadSnapshot(id) {
  const p = snapshotPath(id)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function writeSnapshot(id, data) {
  mkdirSync(SNAP_DIR, { recursive: true })
  writeFileSync(snapshotPath(id), JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/* ── 生成 Skill Markdown ──────────────────────────────────────────────── */

function bullets(items) {
  return items.map((s) => `- ${s}`).join('\n')
}

function buildSkillMarkdown(skill, sources) {
  const usable = sources.filter((s) => !s.missing && s.text)

  const parts = [
    '---',
    `name: ${skill.name}`,
    `category: ${skill.category}`,
    'type: system',
    'status: active',
    `version: 1.0`,
    ...(skill.origin ? [`origin: ${skill.origin}`] : []),
    '---',
    '',
    `# Skill: ${skill.name}`,
    '',
    '## Purpose',
    '',
    skill.purpose,
    '',
    '## When to Use',
    '',
    'Use this skill when:',
    '',
    bullets(skill.whenToUse),
    '',
    ...(skill.avoidWhen?.length ? ['Do **not** use it when:', '', bullets(skill.avoidWhen), ''] : []),
    '## Research Method',
    '',
    skill.method.join('\n'),
    '',
    '## Reasoning Guidance',
    '',
    ...(skill.reasoning
      ? [`Focus on:`, '', bullets(skill.reasoning.focus), '', 'Avoid:', '', bullets(skill.reasoning.avoid), '']
      : ['<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->', '']),
    '## Evidence Requirements',
    '',
    skill.evidenceRequirements,
    '',
    '## Expected Output',
    '',
    'Produce:',
    '',
    bullets(skill.expectedOutput),
    '',
  ]

  if (usable.length > 0) {
    parts.push(
      '## Source Prompts (verbatim from ConvFusion)',
      '',
      'These are the original module prompts this skill was reorganised from — preserved as',
      'accumulated research intelligence, not as an execution contract. They reference state keys',
      '(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,',
      'not for a pipeline.',
      '',
    )
    for (const s of usable) {
      parts.push(`### \`${s.file}\` — ${s.const}`, '', '```text', s.text, '```', '')
    }
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */

const report = { written: [], skipped: [], missingSources: [] }

for (const skill of SKILLS) {
  let snap = loadSnapshot(skill.id)
  if (REFRESH || !snap) {
    if (!existsSync(CONVFUSION_DEV)) {
      if (!snap) {
        report.missingSources.push({ id: skill.id, reason: 'no snapshot and ConvFusion-dev absent' })
        continue
      }
    } else {
      const sources = collectSources(skill)
      const missing = sources.filter((s) => s.missing).map((s) => s.file)
      if (missing.length) report.missingSources.push({ id: skill.id, reason: `missing: ${missing.join(', ')}` })
      snap = { id: skill.id, generatedAt: new Date().toISOString(), sources: sources.filter((s) => !s.missing) }
      if (!CHECK) writeSnapshot(skill.id, snap)
    }
  }
  if (!snap) continue

  const md = buildSkillMarkdown(skill, snap.sources ?? [])
  const dir = join(SKILLS_DIR, skill.category.split('/')[0])
  const file = join(dir, `${skill.id}.md`)

  if (CHECK) {
    if (!existsSync(file)) report.written.push({ id: skill.id, action: 'would-create', file })
    else if (readFileSync(file, 'utf8') !== md) report.written.push({ id: skill.id, action: 'would-update', file })
    else report.skipped.push(skill.id)
    continue
  }

  mkdirSync(dir, { recursive: true })
  writeFileSync(file, md, 'utf8')
  report.written.push({ id: skill.id, action: existsSync(file) ? 'updated' : 'created', file })
}

// ── 孤儿清理（--prune）────────────────────────────────────────────────
if (PRUNE && !CHECK) {
  const expected = new Set(SKILLS.map((s) => `${s.id}.md`))
  /**
   * 手写技能不受映射表管理：它们的 `.sources/<id>.json` 标了 `origin: "handwritten"`。
   * prune 必须跳过它们 —— 否则"生成器重新跑一遍"会把新功能技能当孤儿删掉。
   */
  const handwritten = new Set()
  try {
    for (const f of readdirSync(SNAP_DIR)) {
      if (!f.endsWith('.json')) continue
      try {
        const snap = JSON.parse(readFileSync(join(SNAP_DIR, f), 'utf8'))
        if (snap.origin === 'handwritten') handwritten.add(f)
      } catch {
        /* 坏快照忽略：不因此阻断 prune */
      }
    }
  } catch {
    /* .sources 不存在：无手写技能可保护 */
  }
  let pruned = 0
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md') && !expected.has(e.name) && !handwritten.has(`${e.name.slice(0, -3)}.json`)) {
        rmSync(p)
        pruned++
        console.log(`  · pruned orphan ${p.slice(SKILLS_DIR.length + 1)}`)
      }
    }
  }
  walk(SKILLS_DIR)
  if (pruned === 0) console.log('  no orphan skills to prune')
  if (handwritten.size) console.log(`  ${handwritten.size} handwritten skill(s) protected from prune`)
}

console.log(`Skill Library generation — ${SKILLS.length} definitions in the map`)
console.log(`  ${report.written.length} file(s) ${CHECK ? 'need changes' : 'written'}`)
for (const w of report.written) console.log(`    · ${w.action.padEnd(13)} ${w.id}`)
if (report.skipped.length) console.log(`  ${report.skipped.length} unchanged: ${report.skipped.join(', ')}`)
if (report.missingSources.length) {
  console.log(`  ⚠ ${report.missingSources.length} with missing sources:`)
  for (const m of report.missingSources) console.log(`    · ${m.id}: ${m.reason}`)
}
