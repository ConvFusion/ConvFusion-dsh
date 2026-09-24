---
name: Paper Full-Text Download
category: literature/paper-fulltext-download
type: system
status: active
version: 1.0
origin: discovery/fulltext
---

# Skill: Paper Full-Text Download

## Purpose

Fetch the full text of a paper into the workspace as a numbered file, so that datasets, baselines, metrics and experimental settings — which only appear in the full text, never in the abstract — can be extracted for benchmark and baseline analysis.

## When to Use

Use this skill when:

- You are designing a benchmark or selecting baselines and need the *actual* dataset names, evaluation metrics and experimental configurations from the full text — the abstract will not carry them.
- A `research_literature_search` returned a promising record but you need the paper body to read the comparison tables, the dataset descriptions or the method details.
- You want to build a local corpus of full-text papers for systematic comparison (every paper gets a stable sequence number and a manifest entry, so nothing is lost or duplicated).

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: literature-evidence | 先有检索到的文献证据，才谈得上取哪几篇的全文
```

## Research Method

0. **Take the link fields from the search record — do not fabricate URLs.** A `research_literature_search` record carries `pdfUrl`, `openAccessUrl`, `landingPageUrl`, `doi` and `openAccessStatus`. Pass them (plus the paper `title`) to the `research_paper_download` tool with `action: "download"`. The tool resolves an ordered candidate list (PDF direct → OA → arXiv → ACL Anthology → landing → DOI), fetches the bytes, validates them as PDF or HTML, and writes the file to `research/literature/fulltext/<NNN>_<title>.pdf|.html`.
1. **Check the outcome before extracting.** The tool tells you whether it got a real full text (`kind: pdf|html`) or created a placeholder (`kind: txt`, `placeholder: true`). Only extract from real full-text files; a placeholder means the open full text could not be fetched — see step 3.
2. **Prefer stable open sources first.** arXiv and ACL Anthology have predictable, stable PDF URLs. When a paper is on arXiv, the tool derives the PDF direct link from any field that carries the arXiv id; this is the most reliable path. When `openAccessStatus` is `closed`, expect a placeholder.
3. **Handle placeholders honestly.** If the tool returns a placeholder `.txt`, it lists the candidate links it tried. Do not pretend you have the full text. Tell the user which paper could not be fetched, and that they can download it manually and replace the placeholder with a same-named `.pdf` (the manifest entry already points at the right file path).
4. **Use the manifest as the index.** `action: "list"` returns every full-text file with its sequence number, title, kind and source. Use it to look up a paper by title or seq before downloading it again — the sequence number is stable and is how later extraction references the source.
5. **Preview candidates without fetching.** `action: "candidates"` shows which URLs would be tried for given link fields, without downloading anything. Use it to diagnose why a download failed or to confirm a source exists before committing to a download.

## Reasoning Guidance

<!-- 工具已内置候选解析与顺序逻辑；这里只说研究判断。 -->

A full-text download is not an end in itself — it is fuel for dataset/baseline extraction. After a successful download, the next step is to read the paper's experiment section and record the datasets, metrics and baselines as evidence (`research_evidence`), citing the full-text file path as `raw_artifacts`. If the paper is behind a paywall and only a placeholder exists, do not extract from the abstract and present it as if it were the full text — mark the evidence as `unverified` and note the limitation.

## Evidence Requirements

Every full text that informs a claim must be traceable to a workspace file. Record the manifest entry (sequence number + path) and the source URL in the evidence's `raw_artifacts`. A comparison claim built on a placeholder `.txt` (no real full text) is not supported evidence — say so explicitly.

## Expected Output

Produce:

- the sequence number and workspace path of each downloaded full text
- whether it is a real full text (pdf/html) or a placeholder (txt)
- the source it was downloaded from (e.g. `arxiv_derived`, `pdf_direct`)
- a note on any papers that could not be fetched, with the candidate links for manual retrieval
