/**
 * ConvFusion 2.0 — Workspace 数据规范（对齐 `v2-Workspace.md`）
 *
 * ## 会话工作区 / 研究根目录（两级，`v2-Workspace.md` §2）
 *
 * DSH 会话工作区是**用户的工作区**（放用户自己的论文、数据等）；ConvFusion 产生的
 * 全部数据文件收在会话工作区下的 **`workspace/` 子目录**（研究根目录）里：
 *
 * ```text
 * 会话工作区（用户材料可自由放置）
 * └── workspace/            ← 研究根目录：一个研究根目录 = 一个完整 Research
 *     ├── Research Definition   project.md · research-state.md
 *     ├── Research Inputs       attachments/
 *     ├── Research Assets       plans/ · experiments/ · research/
 *     ├── Research Outputs      papers/ · outputs/
 *     └── Harness Runtime       harness/
 * ```
 *
 * 兼容：早期版本直接用会话工作区当研究根目录（无 `workspace/` 一层），
 * 这类旧布局仍被识别与沿用（见 `workspace.ts` 的 `researchWorkspaceOf`）。
 *
 * ## 三个必须坚持的边界（§16）
 *
 * 1. **Skill 不属于 Workspace** —— Skill Library 与 Output Profiles 是**系统级能力层**
 *    （见 `skills.ts` / `output-profiles.ts`：包内只读资产）。
 * 2. **Plan 属于 Workspace** —— 它是针对**当前这个研究**制定的（`plans/`）。
 * 3. **Output 属于 Workspace** —— 当前研究真正产生的成果（`papers/` + `outputs/`）。
 *
 * ## 本模块的职责
 *
 * 把规范变成**可执行、可校验**的东西：
 *   - {@link WORKSPACE_LAYOUT}：规范目录清单（单一事实来源）；
 *   - {@link ensureWorkspaceLayout}：按需建立目录骨架；
 *   - {@link inspectWorkspace}：只读检查工作区是否符合规范（供测试/诊断）。
 *
 * ⚠️ 本模块**不创建内容文件**（除 `project.md` 由 `project.ts` 负责）：
 * 目录按需产生，未用到的实验/附件目录不该被凭空造出来。
 */

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RESEARCH_DIR, RESEARCH_STATE_FILE, PROJECT_FILE } from './research-data.js'
import { OUTPUTS_DIR } from './output-data.js'

/* ════════════════════════════════════════════════════════════════════════
 * 目录清单
 * ════════════════════════════════════════════════════════════════════════ */

/** 一个目录条目的规范定义。 */
export interface LayoutEntry {
  /** 相对 workspace 的路径。 */
  path: string
  /** 它属于哪一类数据（§1 的五类）。 */
  category: 'definition' | 'inputs' | 'assets' | 'outputs' | 'runtime'
  /** 是否属于"核心结构"（core = 研究一开始就应存在；optional = 按需产生）。 */
  kind: 'core' | 'optional'
  /** 职责（§3 的表格）。 */
  duty: string
}

/**
 * Workspace 的规范目录清单（`v2-Workspace.md` §2）。
 *
 * `kind: 'core'` 的条目由 {@link ensureWorkspaceLayout} 建立；
 * `kind: 'optional'` 的条目**按需产生**（例如还没有实验就不该有 `experiments/`）。
 */
export const WORKSPACE_LAYOUT: readonly LayoutEntry[] = [
  // ── Research Definition（§2 根文件；由 project.ts / research-state.ts 写入）──
  { path: PROJECT_FILE, category: 'definition', kind: 'core', duty: '定义研究是什么' },
  { path: RESEARCH_STATE_FILE, category: 'definition', kind: 'core', duty: '描述当前研究状态' },

  // ── Research Inputs（§4：原始附件，保持原样，不静默修改）──
  { path: 'attachments', category: 'inputs', kind: 'optional', duty: '原始输入材料' },
  { path: 'attachments/papers', category: 'inputs', kind: 'optional', duty: '论文/文献原件' },
  { path: 'attachments/datasets', category: 'inputs', kind: 'optional', duty: '数据集原件' },
  { path: 'attachments/figures', category: 'inputs', kind: 'optional', duty: '图片原件' },
  { path: 'attachments/reference', category: 'inputs', kind: 'optional', duty: '参考资料原件' },

  // ── Research Assets ──
  { path: 'plans', category: 'assets', kind: 'core', duty: '针对当前研究的具体研究计划' },
  { path: 'experiments', category: 'assets', kind: 'optional', duty: '实验代码/配置/数据/结果' },
  { path: RESEARCH_DIR, category: 'assets', kind: 'core', duty: '结构化研究资产根' },
  { path: `${RESEARCH_DIR}/evidence`, category: 'assets', kind: 'core', duty: '经过确认的科学证据' },
  { path: `${RESEARCH_DIR}/claims`, category: 'assets', kind: 'core', duty: '科学主张' },
  { path: `${RESEARCH_DIR}/decisions`, category: 'assets', kind: 'core', duty: '研究决策及其依据' },
  { path: `${RESEARCH_DIR}/state-history`, category: 'assets', kind: 'core', duty: 'Research State 历史版本' },

  // ── Harness Runtime（§3：执行过程与原始运行产物）──
  { path: 'harness', category: 'runtime', kind: 'optional', duty: 'Harness 执行过程与原始产物根' },
  { path: 'harness/sessions', category: 'runtime', kind: 'optional', duty: '会话记录' },
  { path: 'harness/events', category: 'runtime', kind: 'optional', duty: '运行事件' },
  { path: 'harness/artifacts', category: 'runtime', kind: 'optional', duty: '原始运行产物' },

  // ── Research Outputs ──
  { path: 'papers', category: 'outputs', kind: 'optional', duty: 'Paper 及其演化' },
  { path: OUTPUTS_DIR, category: 'outputs', kind: 'optional', duty: '其他成果根' },
  { path: `${OUTPUTS_DIR}/patents`, category: 'outputs', kind: 'optional', duty: 'Patent' },
  { path: `${OUTPUTS_DIR}/reports`, category: 'outputs', kind: 'optional', duty: 'Technical Report' },
  { path: `${OUTPUTS_DIR}/slides`, category: 'outputs', kind: 'optional', duty: 'Presentation' },
]

/** 按类别分组（供文档 / 设置面板展示）。 */
export function layoutByCategory(): Record<LayoutEntry['category'], LayoutEntry[]> {
  const out = { definition: [], inputs: [], assets: [], outputs: [], runtime: [] } as Record<
    LayoutEntry['category'],
    LayoutEntry[]
  >
  for (const e of WORKSPACE_LAYOUT) out[e.category].push(e)
  return out
}

/* ════════════════════════════════════════════════════════════════════════
 * 建立骨架
 * ════════════════════════════════════════════════════════════════════════ */

/** 核心目录（研究一开始就应该存在的最小骨架）。 */
export function coreDirs(): string[] {
  return WORKSPACE_LAYOUT.filter((e) => e.kind === 'core' && !e.path.endsWith('.md')).map((e) => e.path)
}

/**
 * 建立**核心**目录骨架（幂等）。
 *
 * 刻意**不建立** optional 目录：没有实验就不该有 `experiments/`，
 * 没有附件就不该有 `attachments/` —— 空目录会误导（让人以为"应该往里放东西"）。
 */
export function ensureWorkspaceLayout(workspace: string): string[] {
  const created: string[] = []
  for (const rel of coreDirs()) {
    const abs = join(workspace, rel)
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true })
      created.push(rel)
    }
  }
  return created
}

/** 按需建立一个 optional 目录（如实验开始时建 `experiments/<name>/`）。 */
export function ensureWorkspaceSubdir(workspace: string, relPath: string): string {
  const abs = join(workspace, relPath)
  if (!existsSync(abs)) mkdirSync(abs, { recursive: true })
  return relPath
}

/** 实验工作空间的标准子目录（§6）。 */
export const EXPERIMENT_SUBDIRS: readonly string[] = ['data', 'src', 'scripts', 'results', 'figures']

/** 建立一个实验的工作空间（§6）。 */
export function ensureExperimentLayout(workspace: string, name: string): string[] {
  const created: string[] = []
  const base = `experiments/${name}`
  for (const sub of ['', ...EXPERIMENT_SUBDIRS]) {
    const rel = sub ? `${base}/${sub}` : base
    const abs = join(workspace, rel)
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true })
      created.push(rel)
    }
  }
  return created
}

/** Paper 目录内的标准子目录（§8 / §9）。 */
export const PAPER_SUBDIRS: readonly string[] = ['history', 'latex', 'figures']

/** 建立 Paper 的标准子目录（§8：history/latex/figures 与正文并列）。 */
export function ensurePaperLayout(workspace: string, paperId: string): string[] {
  const created: string[] = []
  for (const sub of PAPER_SUBDIRS) {
    const rel = `papers/${paperId}/${sub}`
    const abs = join(workspace, rel)
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true })
      created.push(rel)
    }
  }
  return created
}

/* ════════════════════════════════════════════════════════════════════════
 * 只读检查
 * ════════════════════════════════════════════════════════════════════════ */

/** 一个目录条目的实际状态。 */
export interface LayoutStatus extends LayoutEntry {
  present: boolean
  /** 存在但为空（optional 目录为空是正常的；core 目录为空可能意味着还没写入）。 */
  empty: boolean
}

/** 工作区检查结果。 */
export interface WorkspaceInspection {
  workspace: string
  /** 是否是研究工作区（有 `project.md` 或 `research-state.md`）。 */
  isResearch: boolean
  entries: LayoutStatus[]
  /** 规范里没有、但实际存在的顶层条目（可能是旧的/无关的）。 */
  unexpectedTopLevel: string[]
  /** 实际存在但不在规范里的 `outputs/` 子目录。 */
  unexpectedOutputDirs: string[]
}

/** 规范允许的顶层条目（含非目录文件）。 */
const ALLOWED_TOP_LEVEL = new Set([
  PROJECT_FILE,
  RESEARCH_STATE_FILE,
  // 研究数据根目录（新布局：会话工作区下多一层 `workspace/`，v2-Workspace.md §2）
  'workspace',
  'attachments',
  'plans',
  'experiments',
  RESEARCH_DIR,
  'harness',
  'papers',
  OUTPUTS_DIR,
  // 会话/工具自身的工作区文件（Harness 或用户产生，不属于 ConvFusion 规范）
  'skills',
  '.git',
  '.DS_Store',
  'AGENTS.md',
  'AGENTS.local.md',
  'CLAUDE.md',
  'README.md',
])

/**
 * 只读检查工作区是否符合规范（供诊断 / 测试）。
 *
 * **不修改任何东西**；`unexpectedTopLevel` 只是提示，不代表错误
 * （用户可能在工作区放任何东西）。
 */
export function inspectWorkspace(workspace: string): WorkspaceInspection {
  let topLevel: string[] = []
  try {
    topLevel = readdirSync(workspace)
  } catch {
    topLevel = []
  }

  const present = new Set(topLevel)
  const entries: LayoutStatus[] = WORKSPACE_LAYOUT.filter((e) => !e.path.includes('/')).map((e) => {
    const abs = join(workspace, e.path)
    const exists = existsSync(abs)
    let empty = false
    if (exists) {
      try {
        empty = statSync(abs).isDirectory() && readdirSync(abs).length === 0
      } catch {
        empty = false
      }
    }
    return { ...e, present: exists, empty }
  })

  const unexpectedTopLevel = topLevel.filter((t) => !ALLOWED_TOP_LEVEL.has(t) && !t.startsWith('.'))

  let unexpectedOutputDirs: string[] = []
  const outputsPath = join(workspace, OUTPUTS_DIR)
  if (existsSync(outputsPath)) {
    try {
      unexpectedOutputDirs = readdirSync(outputsPath, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .filter((n) => !['patents', 'reports', 'slides'].includes(n))
    } catch {
      unexpectedOutputDirs = []
    }
  }

  return {
    workspace,
    isResearch: present.has(PROJECT_FILE) || present.has(RESEARCH_STATE_FILE),
    entries,
    unexpectedTopLevel,
    unexpectedOutputDirs,
  }
}
