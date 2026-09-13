/**
 * ConvFusion 2.0 — LaTeX 编译与修复（移植自 ConvFusion-dev `latex_renderer` / `latex_validator`）
 *
 * ## 它补的是哪个洞
 *
 * `latex.ts` 把 Markdown 变成 `main.tex`，但「编译成 PDF」与「按日志修错」这两步
 * 在旧版里是 `latex_renderer_skill`（调 tectonic）+ `latex_validator_skill`（确定性修复）。
 * 迁移时同样丢了。本模块把这两步变成可被工具调用的实现。
 *
 * ## 与旧版的关系
 *
 * - **编译**：旧版 `core/tools/tectonic/tool.py` 的 `subprocess: tectonic <file> --keep-logs`，
 *   返回 `{success, pdf_path, logs}`，成功判据是 `returncode == 0 and pdf 存在`。
 *   这里保持同一 schema 与判据（tectonic 容错性强，很多 LaTeX 错误只产生警告 ——
 *   实测 `100%`、`a_b_c`、`\undefinedcmd` 都不中止编译，只有真正致命错误才无 PDF）。
 * - **日志解析**：旧版只认 pdflatex 风格的 `main.tex:NN: error:` 与 `! ... l.NN`，
 *   且勘察确认有两个缺陷：warning 正则用 DOTALL 会**吞掉下一行**（D3），
 *   error Pattern 2 的 lookahead 要求字面 `\n` 导致几乎不可达（D4）。
 *   这里修正为**按行解析**并同时支持 tectonic 的 `error: <file>:<line>: <msg>` 形态。
 * - **确定性修复**：移植旧版三分支，并修正 D1（`\\\\\{` 要求两个反斜杠，真实 `\{` 永不匹配）
 *   与 D2（分支 d 多发一个 `$`）。
 *
 * ## 环境事实（实测）
 *
 * tectonic 不在默认 PATH；`/opt/homebrew/bin/tectonic` 与 `/Library/TeX/texbin/*` 存在。
 * 且 tectonic 默认缓存写在 `~/Library/Caches/Tectonic`，在受限沙箱下**写入被拒**，
 * 因此编译时必须把 `TECTONIC_CACHE_DIR` 指到工作区内可写目录。
 */
/**
 * 编译超时（毫秒）。
 *
 * 旧版是 300 秒。tectonic 首次编译需要下载宏包（实测全新缓存约 43 MB），
 * 180 秒不够 —— 实测在真实工作区因超时而失败，故与旧版对齐取 300 秒。
 */
export declare const COMPILE_TIMEOUT_MS = 300000;
/** 定位 tectonic 可执行文件；找不到返回 undefined。 */
export declare function findTectonic(env?: NodeJS.ProcessEnv): string | undefined;
/** 一条编译错误。 */
export interface CompileError {
    /** 1-based 行号；无法确定时为 0。 */
    line: number;
    /** 错误消息。 */
    message: string;
    /** 严重级别。 */
    severity: 'error' | 'warning';
}
/**
 * 从 tectonic stderr 与 TeX 日志中解析错误。
 *
 * 支持三种形态（按可靠性排序）：
 *   1. `error: <file>:<line>: <msg>` —— tectonic 包装后的带行号错误（首选）
 *   2. `! <msg>` 后跟 `l.<line> <上下文>` —— TeX 经典格式（配对取行号）
 *   3. 无行号的 `error:` / `!` 行 —— 收集但 line=0
 *
 * 按行扫描（修正旧版 D3/D4 的跨行吞并问题）；过滤 underfull/overfull 排版警告。
 */
export declare function parseCompileErrors(raw: string): CompileError[];
/** 编译结果（保持旧版 `tectonic` 工具的 `{success, pdf_path, logs}` 语义）。 */
export interface CompileResult {
    success: boolean;
    /** PDF 绝对路径（成功时）。 */
    pdfPath: string;
    /** 编译输出（stderr + stdout）。 */
    logs: string;
    /** 解析出的错误。 */
    errors: CompileError[];
    /** 失败/拒答原因（如找不到 tectonic）。 */
    reason?: string;
}
/** 编译选项。 */
export interface CompileOptions {
    /** 超时（毫秒）。 */
    timeoutMs?: number;
    /** 缓存目录（务必在可写位置）。 */
    cacheDir?: string;
    /** 环境变量覆盖。 */
    env?: NodeJS.ProcessEnv;
}
/**
 * 编译一个 `.tex` 文件为 PDF。
 *
 * 在 tex 文件所在目录执行 `tectonic <file> --keep-logs`，与旧版一致。
 * `TECTONIC_CACHE_DIR` 默认指到 `latex/.tectonic-cache`（工作区内可写）。
 */
export declare function compileLatex(texPath: string, opts?: CompileOptions): CompileResult;
/**
 * 转义**非数学区**的 `%`（旧版 `_escape_percent_outside_math`，全局防御性修复）。
 * `100%` 是最常见的编译错误源，而 `$x \% y$` 里的必须保留。
 */
export declare function escapePercentOutsideMath(latex: string): string;
/** 取错误行附近的上下文（旧版 `extract_context`，供 Agent 精修用）。 */
export declare function extractErrorContext(latex: string, lineNum: number, contextSize?: number): {
    startLine: number;
    endLine: number;
    text: string;
};
/** 修复结果。 */
export interface RepairResult {
    latex: string;
    /** 修好的处数。 */
    fixedCount: number;
    /** 无法程序化修复的错误（留给 Agent）。 */
    remaining: CompileError[];
}
/**
 * 按编译日志做**确定性**修复（不调 LLM）。
 *
 * 与旧版一致：先做全局 `%` 转义，再按错误逐行修（**行号降序**，避免改前一行后
 * 后面行号错位）。修不动的留在 `remaining` 里，由 Agent 精修。
 */
export declare function repairLatex(latex: string, errors: readonly CompileError[]): RepairResult;
/** 扫描结果。 */
export interface GrammarScan {
    /** 未识别的命令（去重、按出现顺序）。 */
    unknownCommands: string[];
    /** 未识别的环境（去重）。 */
    unknownEnvs: string[];
    /** 是否全部识别。 */
    allKnown: boolean;
}
/** 扫描未识别的命令 / 环境（报告性，不作为编译 gate）。 */
export declare function scanUnsafeTokens(latex: string): GrammarScan;
//# sourceMappingURL=latex-compile.d.ts.map