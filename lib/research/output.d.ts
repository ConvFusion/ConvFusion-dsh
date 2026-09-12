/**
 * ConvFusion 2.0 — Output Artifact 注册表与转换（Stage 5.1）
 *
 * ## 本模块负责
 *
 * - **Output Artifact**：create / read / edit / version / archive（Task 1）
 * - **Output Source**：Research State / Paper / Claims / Evidence / Plans（Task 3）
 * - **Output Review**：review / accept / edit / reject / version（Task 7）
 * - **Provenance**：Output → Source → Skill → Plan → Session → Evidence（Task 8）
 * - **Impact Analysis**：哪些 Output 受研究变化影响（Task 9）
 * - **Output Registry**：统一 `outputs/`，不为每种类型建独立系统（Task 10）
 *
 * ## 两条硬边界
 *
 * 1. **Output 不应修改 Research State**（§18）。本模块的**类型签名**体现了这一点：
 *    所有函数只接收输出目录，绝不触碰 `research/`；并且没有任何函数
 *    返回对 Research State 的写操作。
 * 2. **不做三套 workflow**（Task 10）：Patent / Report / Slides 共用同一套
 *    Artifact + Profile 机制，差异只在 `output-profiles.ts` 的数据里。
 */
import { type OutputArtifact, type OutputDependency, type OutputProfile, type OutputQualityResult, type OutputReviewRecord, type OutputSource, type OutputStatus, type OutputType, type OutputVersionEntry } from './output-data.js';
/**
 * 一个成果**自己的目录**（`outputs/<type>/<id>/`，§14）。
 *
 * ⚠️ `paper` 是**特例**：Paper 是核心 Research Output，按 §8 放在 `papers/<id>/`，
 * **不在 `outputs/` 下**。
 *
 * 成果用子目录而不是单文件，是为了容纳它的附属产物（§14 的 `provenance.md`，
 * 以及将来的图表 / 版本）。§24 的"统一注册表"体现在**同一套结构**，
 * 而不是把它们压成同名文件。
 */
export declare function outputDir(workspace: string, type: OutputType, id: string): string;
/** 相对 workspace 的成果目录（如 `outputs/patents/patent-001`）。 */
export declare function outputRelDir(type: OutputType, id: string): string;
/** 一个类型目录（绝对；= 该类型下所有成果目录的父目录）。 */
export declare function outputTypeDir(workspace: string, type: OutputType): string;
/** 相对 workspace 的类型目录。 */
export declare function outputTypeRelDir(type: OutputType): string;
/** 解析一个 Output Artifact。 */
export declare function parseOutputArtifact(absPath: string, relPath: string, typeHint?: OutputType): OutputArtifact | null;
/** 序列化一个 Output Artifact。 */
export declare function serializeOutputArtifact(input: {
    id?: string;
    title: string;
    type: OutputType;
    status: OutputStatus;
    version: string;
    goal?: string;
    source: OutputSource;
    skill?: string;
    plan?: string;
    harnessSession?: string;
    createdAt?: string;
    updatedAt?: string;
    sections: Array<{
        title: string;
        body: string;
    }>;
}): string;
/**
 * 列出某个类型的全部 Output。
 *
 * `paper` 类型**不在此扫描** —— Paper 的文件由 `paper.ts` 管理（它有独立结构：
 * metadata/claims/gaps/evolution/history）。这里只处理 `outputs/` 下的其他成果。
 */
export declare function listOutputs(workspace: string, type: OutputType): OutputArtifact[];
/**
 * 列出全部 Output（跨类型；统一注册表视图）。
 *
 * 不含 Paper —— 它由 `papers/` 承载，`paperStatusSummary()` 是其视图。
 */
export declare function listAllOutputs(workspace: string): OutputArtifact[];
/** 按 id 找 Output（跨类型）。 */
export declare function readOutput(workspace: string, id: string): OutputArtifact | undefined;
/** 下一个 id（如 `patent-001`）。 */
export declare function nextOutputId(workspace: string, type: OutputType): string;
export interface OutputWriteError {
    error: string;
}
export declare function isOutputWriteError(v: unknown): v is OutputWriteError;
/**
 * Output 的正文骨架 —— **由 Profile 的结构生成**（§7）。
 *
 * 这是"Profile 是数据"的直接体现：结构不同只因为数据不同，
 * 不需要为每种类型写一段代码。
 */
export declare function outputSectionsTemplate(profile: OutputProfile, context?: {
    goal?: string;
}): Array<{
    title: string;
    body: string;
}>;
/**
 * 创建一个 Output Artifact（Task 1 create）。
 *
 * 注意：**不触碰 Research State**（§18）。来源只作为引用记录在 frontmatter。
 */
export declare function createOutput(workspace: string, input: {
    id?: string;
    type: OutputType;
    title: string;
    goal?: string;
    source?: Partial<OutputSource>;
    skill?: string;
    plan?: string;
    harnessSession?: string;
    /** 自定义正文；缺省用 Profile 结构生成骨架。 */
    sections?: Array<{
        title: string;
        body: string;
    }>;
}): OutputArtifact | OutputWriteError;
/** 写成果自己的 `metadata.md`（§11–§13 都要求）。 */
export declare function writeOutputMetadata(workspace: string, id: string): string | undefined;
/**
 * 写专利的 `claims.md`（§11）。
 *
 * ⚠️ **Patent Claim ≠ Research Claim**（§10）。这里生成的**只是骨架**：
 * 真正的权利要求必须由 Patent Drafting Skill 依据技术方案重新表述出技术特征，
 * 不能把 `research/claims/C001.md` 的内容抄过来。因此骨架里显式写明这一点，
 * 避免后来者（人或 Agent）把研究主张直接填进去。
 */
export declare function writePatentClaimsFile(workspace: string, id: string): string | undefined;
/**
 * 整体保存正文（编辑器路径）。
 *
 * ⚠️ 必须把新正文的**章节重新解析**后交给 writeOutput —— 否则 writeOutput 会用
 * 内存里那份**旧的** `doc.sections` 重新序列化，把刚写进去的内容覆盖掉
 * （表现为"保存成功但内容没变"）。
 */
export declare function saveOutputBody(workspace: string, id: string, body: string): OutputArtifact | OutputWriteError;
/** 替换单个章节。 */
export declare function updateOutputSection(workspace: string, id: string, section: string, body: string): OutputArtifact | OutputWriteError;
/** 递增 Output 版本：`0.1` → `0.2`。 */
export declare function bumpOutputVersion(version: string, kind?: 'minor' | 'major'): string;
/** 归档当前版本（`<成果目录>/history/v<version>.md`），幂等。 */
export declare function archiveOutputVersion(workspace: string, id: string, options?: {
    reason?: string;
    version?: string;
}): OutputVersionEntry | undefined;
/** 列出历史版本。 */
export declare function listOutputVersions(workspace: string, id: string): OutputVersionEntry[];
/** 读某个历史版本。 */
export declare function readOutputVersion(workspace: string, id: string, version: string): string | undefined;
/** 读处置记录（who / when / based on what，§19）。 */
export declare function readOutputReviews(workspace: string, id: string): OutputReviewRecord[];
export interface OutputReviewOutcome {
    output: OutputArtifact;
    fromVersion: string;
    toVersion: string;
    action: OutputReviewRecord['action'];
}
/**
 * 处置一个 Output（Task 7）。
 *
 * 顺序（与 Paper 修订一致，§21 不删除性覆盖）：
 *   1. 归档当前版本
 *   2. `edited` 时写入新正文
 *   3. `approved` / `edited` 推进版本号
 *   4. 记录处置（who / when / from → to）
 *
 * `rejected` **不推进版本**也不改正文 —— 但同样留痕。
 */
export declare function reviewOutput(workspace: string, id: string, action: 'reviewed' | 'approved' | 'rejected' | 'edited' | 'archived', options?: {
    note?: string;
    finalText?: string;
    by?: 'user' | 'agent';
}): OutputReviewOutcome | OutputWriteError;
/** 归档一个 Output（不是删除：保留正文与历史）。 */
export declare function archiveOutput(workspace: string, id: string, note?: string): OutputReviewOutcome | OutputWriteError;
/**
 * 彻底删除一个 Output（含历史与处置记录）。
 *
 * 与 Evidence / Paper 的取向一致：**归档优先**；删除需显式确认。
 */
export declare function deleteOutput(workspace: string, id: string, options?: {
    confirm?: boolean;
}): {
    ok: true;
    id: string;
} | OutputWriteError;
/**
 * 按 Profile 跑**规则化**质量检查（§20）。
 *
 * 为什么用正则而不是模型自评：检查必须**可复核**。模型可以声称"我已经检查过了"，
 * 但只有规则能给出同样的结论两次。
 */
export declare function checkOutputQuality(workspace: string, id: string): OutputQualityResult | OutputWriteError;
/** Output 的完整 provenance 链。 */
export interface OutputProvenance {
    output: string;
    /** 链上的每一跳。 */
    hops: Array<{
        kind: 'output' | 'skill' | 'plan' | 'session' | 'source' | 'evidence' | 'claim';
        ref: string;
        relation: string;
    }>;
    /** 是否可追溯到 Evidence（Task 8 要求的完整链）。 */
    reachesEvidence: boolean;
}
/**
 * 追踪 Output → Source → Skill → Plan → Session → Evidence（Task 8）。
 *
 * 只读遍历：不复制任何内容，只把已存在的引用串起来。
 */
export declare function traceOutputProvenance(workspace: string, id: string): OutputProvenance | undefined;
/**
 * 把 provenance 落盘为 `provenance.md`（`v2-Workspace.md` §14）。
 *
 * 为什么必须落盘：provenance 只在内存里可算是不够的 —— §14 要求
 * **成果自身携带**"我从哪些 Research Knowledge 转换而来"，
 * 这样成果被复制/归档/移交时仍然可追溯，而不是依赖某个进程能重新算出它。
 *
 * @returns 相对路径；成果不存在时返回 `undefined`
 */
export declare function writeOutputProvenance(workspace: string, id: string): string | undefined;
/**
 * 构建依赖图（§23）：`Claim C003 → { Paper v0.8, Patent v0.2, Slides v0.3 }`。
 *
 * 这样系统能回答：**"如果 C003 被推翻，哪些成果需要重新检查？"**
 */
export declare function buildOutputDependencyMap(workspace: string): OutputDependency[];
/** 一次研究变化对 Output 的影响。 */
export interface OutputImpact {
    /** 变化的对象（如 `C003`）。 */
    changed: string;
    kind: OutputDependency['kind'];
    /** 受影响的 Output 与建议动作。 */
    affected: Array<{
        id: string;
        type: OutputType;
        version: string;
        relPath: string;
        /** §23 要求输出 **Update Recommendation**。 */
        recommendation: string;
    }>;
}
/**
 * 影响分析（Task 9）：当 Research State / Claim / Evidence 发生变化，
 * 找出受影响的 Output 并给出**更新建议**。
 *
 * ⚠️ **只给建议，不改任何 Output** —— 与 §18（Output 不改 Research State）对称：
 * 研究变化也不会自动改写成果，必须由人决定。
 */
export declare function analyzeOutputImpact(workspace: string, changed: string, kind?: OutputDependency['kind']): OutputImpact[];
/** 影响摘要（供 Research Context / 工具输出）。 */
export declare function outputImpactSummary(workspace: string): {
    totalOutputs: number;
    byType: Record<OutputType, number>;
    pendingReview: number;
    dependencies: number;
};
/** 取某个 Output 的 Profile（含区分说明，供 UI/工具）。 */
export declare function outputProfileFor(doc: OutputArtifact): OutputProfile;
/** 供工具层：Profile 的结构是否齐全。 */
export declare function missingStructure(workspace: string, id: string): string[];
/** 供工具层：读取某个章节。 */
export declare function outputSection(doc: OutputArtifact, ...names: string[]): string;
//# sourceMappingURL=output.d.ts.map