#!/usr/bin/env python3
"""论文配图 SVG → PDF（C08P07 `paper-diagrams` 的 LaTeX 交付步骤）。

## 为什么需要它

LaTeX 的 `\\includegraphics` 不吃 SVG。第一阶段的产物是确定性 SVG（dev-note §17），
所以"图进 PDF"必须补一步确定性转换 —— 而且这一步**不能让 Agent 随手找个工具**，
否则前面辛苦保证的可复现性会在最后一步丢掉。

## 为什么用 PyMuPDF

| 判据 | PyMuPDF | cairosvg | svglib+reportlab | rsvg-convert / Inkscape / Chrome |
|---|---|---|---|---|
| 额外依赖 | **无**（已在环境里） | cairocffi + 系统 libcairo | 纯 Python | 非 Python、重 |
| 速度 | **≈5 ms/图** | 数十 ms | 数十 ms | 数百 ms ~ 数秒 |
| 逐字节可复现 | **是**（无 CreationDate/ID） | 否（有时间戳） | 视版本 | 否 |
| 字体 | **内嵌**（Helvetica Type0 CID；CJK → Droid Sans Fallback TTF） | 依赖系统 fontconfig | 依赖系统字体 | 依赖系统 |
| 文字 | **保留为真文字**（可选中/可搜索） | 保留 | 保留 | 保留 |

实测（本机 py3128CPU 环境，PyMuPDF 1.25.5）：20 张图 0.11 s；同一 SVG 转换两次
**逐字节相同**；与 Chrome 光栅化对比 MAE 2.9/255（差异只在字形抗锯齿）；
输出在 LaTeX 里是**矢量**（不产生位图），字体保持内嵌。

## 用法

```bash
python svg2pdf.py <input.svg> <output.pdf>
```

stdout 是**一行 JSON**（工具层解析用），失败也是 JSON（`{"ok": false, "error": ...}`），
不吐 traceback —— 调用方是一条工具链，不是一个交互终端。

## 单位

SVG 的画布单位（px）直接当 pt 用：输出 PDF 的页面尺寸 = SVG 的 `width`×`height`。
LaTeX 再按 `\\includegraphics[width=...]` 缩放它。**因此图内的最终字号取决于缩放比**，
这一点由工具层按 `--target-width-pt` 换算后提醒（见 `--help`）。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

RESULT_PREFIX = "@@SVG2PDF@@ "


def emit(payload: dict) -> None:
    """把结果写成一行 JSON。前缀让调用方在杂音里也能定位结果行。"""
    sys.stdout.write(RESULT_PREFIX + json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(message: str, **extra) -> int:
    emit({"ok": False, "error": message, **extra})
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert a paper-diagrams SVG to a deterministic, vector PDF (PyMuPDF).",
    )
    parser.add_argument("svg", help="input SVG path (produced by research_diagram)")
    parser.add_argument("pdf", help="output PDF path")
    parser.add_argument("--dpi", type=float, default=0.0, help="(unused; kept for CLI symmetry)")
    parser.add_argument(
        "--node-font-pt",
        type=float,
        default=13.0,
        help="node label font size used by the renderer, in SVG units (default 13)",
    )
    parser.add_argument(
        "--target-width-pt",
        type=float,
        default=252.0,
        help="width the figure will be drawn at in the paper, in pt (IEEE single column ≈ 252)",
    )
    parser.add_argument("--quiet", action="store_true", help="suppress the human-readable summary")
    args = parser.parse_args(argv)

    if not os.path.isfile(args.svg):
        return fail(f"input SVG not found: {args.svg}")
    if not args.svg.lower().endswith(".svg"):
        return fail(f"input is not an .svg file: {args.svg}")

    try:
        import fitz  # PyMuPDF
    except Exception as exc:  # pragma: no cover - 环境缺依赖时给出可执行的一句话
        return fail(
            "PyMuPDF is not importable in this interpreter — install it with "
            f"`python -m pip install pymupdf` ({type(exc).__name__}: {exc})",
            need="pymupdf",
        )

    started = time.time()
    try:
        # 打开 SVG：MuPDF 自带 SVG 解析器，不依赖任何系统图形库。
        doc = fitz.open(args.svg)
        if doc.page_count != 1:
            return fail(f"expected exactly one page in the SVG, got {doc.page_count}")
        page = doc[0]
        width_pt, height_pt = float(page.rect.width), float(page.rect.height)

        # 逐字节可复现的关键：MuPDF 的 SVG→PDF 不写 CreationDate / ModDate / ID。
        pdf_bytes = doc.convert_to_pdf()

        out_dir = os.path.dirname(os.path.abspath(args.pdf))
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(args.pdf, "wb") as handle:
            handle.write(pdf_bytes)

        # 回读一次：确认写出来的真是一份能打开的 PDF，而不是一堆字节。
        check = fitz.open(args.pdf)
        text = check[0].get_text().strip()
        fonts = [{"name": f[3], "ext": f[1], "embedded": bool(f[1])} for f in check[0].get_fonts(full=True)]
        drawings = len(check[0].get_drawings())
    except Exception as exc:
        return fail(f"conversion failed: {type(exc).__name__}: {exc}")

    # ── 字号换算：图在论文里被缩到 target_width_pt 后，节点文字还剩多少 pt ──
    scale = args.target_width_pt / width_pt if width_pt > 0 else 0.0
    effective_node_pt = round(args.node_font_pt * scale, 2)
    max_units_for_7pt = round(args.node_font_pt * args.target_width_pt / 7.0, 1)

    result = {
        "ok": True,
        "pdfPath": args.pdf,
        "svgPath": args.svg,
        "bytes": len(pdf_bytes),
        "widthPt": round(width_pt, 2),
        "heightPt": round(height_pt, 2),
        "pages": 1,
        "textChars": len(text),
        "vectorDrawings": drawings,
        "fonts": fonts,
        "allFontsEmbedded": all(f["embedded"] for f in fonts) if fonts else False,
        "seconds": round(time.time() - started, 4),
        # 论文里的可读性：节点文字缩到 target 宽度后还剩多少 pt
        "targetWidthPt": args.target_width_pt,
        "scale": round(scale, 4),
        "effectiveNodePt": effective_node_pt,
        "legible": effective_node_pt >= 7.0,
        "maxCanvasUnitsFor7pt": max_units_for_7pt,
        "pymupdf": getattr(fitz, "__version__", None) or getattr(fitz, "VersionBind", "?"),
    }

    if not args.quiet:
        verdict = "legible" if result["legible"] else "TOO SMALL"
        print(
            f"{args.svg} → {args.pdf}: {result['widthPt']}×{result['heightPt']} pt, "
            f"{len(pdf_bytes) / 1024:.1f} KB, {len(fonts)} font(s) embedded, "
            f"node text ≈ {effective_node_pt} pt at {args.target_width_pt} pt wide [{verdict}]",
            file=sys.stderr,
        )
    emit(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
