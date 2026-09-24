---
name: Submission Formatting and Compile Repair
category: academic-writing/submission-compile-and-format
type: system
status: active
version: 1.0
origin: paper/latex (latex_validator, latex_llm_fixer), paper/narrative (reference)
---

# Skill: Submission Formatting and Compile Repair

## Purpose

Turn the revised text into a venue-conformant manuscript that compiles: correct LaTeX, escaped special characters, a reference list built from real metadata, and no leftover markup artefacts.

## When to Use

Use this skill when:

- The manuscript must leave Markdown and become a compilable LaTeX document (every paper does, eventually).
- The manuscript fails to compile, or the compile log reports errors that must be addressed.
- The text still contains Markdown artefacts such as heading hashes, emphasis markers or raw underscores.
- References are missing, are placeholders, or use "Anonymous" as an author.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: manuscript | 先有正文才谈得上编译成稿
```

## Research Method

0. **Drive the `research_paper_latex` tool — do not hand-write LaTeX.** The manuscript stays Markdown (`papers/<paperId>/paper.md`) and is converted, never re-typed:
   - `action: "compose"` — turns `paper.md` into `papers/<paperId>/latex/main.tex` (+ `main_intermediate.tex`, which keeps raw `[cite_key]` placeholders so you can read what the converter saw). Markdown headings, inline emphasis and stray `%` are handled here; an existing `main.tex` is backed up first. Pick the template at this step: `conference` (IEEEtran, default) or `journal` (IEEEtran journal option).
   - `action: "compile"` — runs Tectonic and produces `main.pdf`; returns `{ success, errors }`.
   - `action: "repair"` — deterministic, LLM-free repair of `main.tex` from the last compile log (escapes stray `%`, fixes double-subscript and math-mode errors). Run it before spending your own effort.
   - `action: "errors"` — structured errors with line numbers **and the surrounding code**, which is what you need to fix what `repair` could not. Then `compile` again.
   - `action: "validate"` — advisory list of unrecognised commands/environments; it is not a gate and a nonzero list is not a failure.
   - `action: "status"` — what is currently in `latex/`.
   The loop is: `compose` → `compile` → if it fails, `repair` → `compile` → if it still fails, read `errors` and **edit `main.tex` yourself** → `compile`. Stop when `compile` returns `success: true`; do not loop indefinitely.
1. **Separate syntax repair from content.** Every fix in this skill is syntactic; if a correction would change a claim, a number or a citation, stop and route it back to the writing skill.
2. **Fix encoding and escaping first**, because they cascade: escape reserved characters, convert Markdown emphasis and headings into the corresponding LaTeX environments and commands, and replace Unicode math symbols with their commands.
3. **Balance environments and structure** so every begin has an end, required packages are declared, and no empty environment remains.
4. **Repair errors in bounded batches grouped by cause, not by symptom.** When many errors share one cause, fix a representative, recompile and re-read the log rather than patching every occurrence blindly; if the log cannot be parsed, treat the raw log as the error context instead of guessing.
5. **Build the reference list from real metadata.** Format entries in the venue style, order them by citation number, and omit a missing field rather than filling it with a placeholder — never emit "Anonymous" or fabricated page ranges. Note what the converter does and does not do: it rewrites `[key]`, `[key1, key2]` and `[12]`-style citations into `\cite{...}` from the `## References` section, but **author–year prose citations like `(Smith et al., 2024)` are left as plain text** — they need a real `.bib`/`\citep` pass or a rewrite in the manuscript.
6. **Re-verify after each pass**: the document compiles, the reference list contains exactly the cited keys, and the diff contains no change to scientific content.

## Known Limits of the Converter

- **Markdown tables are passed through as plain text** (pipes and all); they must be turned into `table`/`tabular` LaTeX separately. This matches the legacy pipeline, where tables arrived pre-rendered as artifacts.
- **Inline emphasis is converted** (`**x**` → `\textbf{x}`, `*x*` → `\textit{x}`) while math regions are protected, but an *unpaired* `*` (e.g. a footnote dagger like `f*`) is intentionally left alone.
- Abstract comes from `## Abstract`; the title from the `#` heading; `## References` feeds `\bibitem`. Everything else becomes a `\section`.
- Tectonic needs a writable cache; the tool points it inside the paper's `latex/` directory, so the first compile may download packages.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Every reference entry must be constructed from actual captured metadata (authors, title, venue, year, pages); missing fields are omitted, never invented. Compile fixes stay syntactic — the change set must not alter a claim, number, citation key or placeholder. The end state must be a document that compiles.

## Expected Output

Produce:

- a corrected, compiling LaTeX document or a bounded set of patches
- a venue-style reference list built from real metadata
- the compile errors grouped by category, with anything unresolved listed
- confirmation that no scientific content changed during formatting

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/paper/latex/prompts/latex_validator_prompt.py` — TEMPLATE

```text
You are a LaTeX expert. Fix ALL compilation errors in the provided LaTeX document.

## LaTeX Document:
```latex
{latex_document}
```

## Compile Logs (read carefully — each error must be addressed):
```
{compile_log}
```

## Critical Error Patterns to Fix:
1. "macro parameter character #" / "# in vertical mode" → Remove or escape ALL raw # characters.
   - If the text contains Markdown headings (###, ####), remove the # marks and keep only the heading text.
   - Never use # for emphasis or formatting in LaTeX.
2. "Undefined control sequence" / "Missing \\begin{{document}}" → Add missing \\usepackage or fix typos.
3. "Unclosed environment" → Match every \\begin{{X}} with a corresponding \\end{{X}}.
4. "Missing $" / "Invalid math mode" → Properly wrap math expressions in $...$ or $$...$$.
5. Underfull/Overfull hbox → These are warnings, only fix if they cause visible layout issues.
6. Unescaped special characters: % → \\%, & → \\&, _ → \\_, $ → \\$, {{ → \\{{, }} → \\}}.
7. **Bold Markdown** (`**text**`) → Replace with `\\textbf{{text}}`.
8. *Italic Markdown* (`*text*`) → Replace with `\\textit{{text}}`.
9. Blank or empty environments → Remove if they contain no content.

## Rules (STRICT):
1. Return ONLY the complete corrected LaTeX document as plain text.
2. Do NOT wrap the output in ```latex ``` code fences.
3. Do NOT add any explanations, comments, or markdown before/after the LaTeX code.
4. Preserve ALL original content, structure, equations, and citations.
5. Fix EVERY error mentioned in the compile logs.
6. If there are Markdown artifacts (###, **, __, etc.) inside the LaTeX document body, convert them to proper LaTeX.
7. Never create new latex commands - only use predefined standard commands:
   - \section, \subsection
   - \textbf, \textit, \emph
   - \cite, \ref, \label
   - \begin, \end for allowed environments
8. Use LaTeX commands instead of Unicode symbols:
   - Use \alpha instead of α
   - Use \le instead of ≤
   - Use \ge instead of ≥
   - Use \rightarrow instead of →
   - Use \times instead of ×
9. Fix syntax only - do not modify the actual content of the paper.
```

### `modules/paper/latex/prompts/latex_llm_fixer_prompt.py` — FIX_PROMPT_TEMPLATE

```text
You are a LaTeX expert. Fix the compilation error(s) in the provided LaTeX code snippet(s).

IMPORTANT:
- There are {total_errors} total compilation errors. Only the first {batch_errors} critical errors are shown below to avoid exceeding context limits.
- Fix ONLY these {batch_errors} errors — do NOT touch anything else.
- The LaTeX document has {document_lines} lines total.

## Error Information:
{error_message}

## LaTeX Code Context (error line marked with →):
```latex
{error_context}
```

## Rules (STRICT):
1. Fix ONLY the lines with compilation errors shown above
2. Maintain the original indentation and structure
3. Output ONLY the fixed lines — exactly the same number of lines as the input context
4. Do NOT include ```latex``` fences
5. Do NOT add explanations or comments
6. Ensure the fixed code is syntactically valid LaTeX
7. If a line doesn't need fixing, keep it exactly as is
8. Focus on the most common LaTeX compilation issues:
   - Missing or mismatched braces/brackets
   - Undefined control sequences
   - Missing character handling or replacements
   - Environment mismatches

Output ONLY a valid JSON object with exactly this field:
{{
  "latex_document": "<the fixed LaTeX code, same number of lines as input>"
}}

CRITICAL: Output ONLY the JSON object — no markdown fences, no explanations.
```

### `modules/paper/narrative/prompts/reference_prompt.py` — IEEE_TEMPLATE

```text
You are formatting the References section for an IEEE Transactions paper.

Generate a comprehensive, properly formatted reference list in IEEE journal style.

Cited Papers (to be included in references):
{cited_papers_info}

All Papers (from Discovery module, for complete reference data):
{all_papers_info}

Requirements:
1. Format all references in IEEE journal style: [N] A. Author, B. Author, and C. Author, "Title of the paper," IEEE Trans. Pattern Anal. Mach. Intell., vol. xx, no. xx, pp. xx-xx, Month Year.
2. Order references sequentially by number [1], [2], ...
3. If authors are available, use format: [N] A. Author, B. Author, and C. Author, "Title of the paper," IEEE Trans. ..., vol. xx, no. xx, pp. xx-xx, Month Year.
4. If authors are NOT available, SKIP the author part entirely and start directly with the title: [N] "Title of the paper," IEEE Trans. ..., vol. xx, no. xx, pp. xx-xx, Month Year.
5. DO NOT use "Anonymous" as author name under any circumstances. Either use real author names or omit the author part.
6. Use all available metadata (authors, title, venue, year, volume, issue, pages) to construct complete citations
7. If year is missing or 0, omit it
8. If venue is missing, omit the venue part
9. If pages are missing, omit pp. xx-xx
10. DO NOT include placeholder text like "A. Author", "B. Author", "Title", "IEEE Trans...", "Month Year", "pp. xx-xx"
11. DO NOT repeat citations with the same number
12. Ensure consistency in formatting across all references

Important:
- Do NOT generate placeholder references
- Use actual paper data from the provided papers
- For each cited paper, generate the most complete IEEE citation possible with whatever metadata is available

Output JSON format (CRITICAL: ONLY output JSON, NO additional text, NO markdown, NO explanations): {{"references": "[1] A. Author, B. Author, and C. Author, \"Title,\" IEEE Trans. ..., vol. x, no. x, pp. xx-xx, 2024.\\n[2] ..."}}
```
