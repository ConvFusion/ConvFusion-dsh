#!/usr/bin/env python3
r"""科研论文示意图渲染器：由**实测文字尺寸**驱动的布局 + **程序化出厂校验**。

## 边界（与 Diagram-IR 渲染器同一分工）

> Agent 决定 **画什么**（节点/连线/车道/标注 → JSON），渲染器决定 **怎么画**。

读 stdin 里的 JSON spec，输出到论文的 `figures/` 与 `latex/figures/`。
本文件是 `research_schematic` 的**唯一绘图实现**，随插件发行，
所以任何工作区都用同一套样式，不再出现"某个工作区自己一份 kit"。

## 本课题组固定样式（Paper 1 定稿 2026-10-07）

  · 白底 `#ffffff`、近黑边框 `#1b1b1f`、线宽 1.15、小圆角；
  · 框内两层排版：**粗体标题 8.6pt + 灰描述 7.0pt**（不用一行超长标签）；
  · 强调边框只给关键对象：`accent` 蓝 `#1565c0`、`reject` 红 `#b3261e`；
  · 布局不手填像素坐标：行/列给**比例**，框高由实测文字行数算出；
  · 交付前跑 `assert_clean()`：文字在框内 / 任意两段文字不重叠 / 框不重叠 / 连线不穿非端点框。

## spec（stdin JSON）

```json
{
  "paperId": "paper-d2-method",
  "name": "fig_lhrdp_overview",
  "title": "LH-RDP and Decision Replay",
  "size": [3.30, 1.90],
  "margin": [0.12, 0.10, 0.12, 0.10],
  "grid": { "cols": [0.17, 0.50, 0.83], "rows": [0.28, 0.72] },
  "nodes": [
    { "id": "state", "col": 1, "row": 1, "label": "research state", "desc": "…", "role": "normal" }
  ],
  "edges": [
    { "id": "e1", "from": "state", "to": "decision" },
    { "id": "fb", "from": "replay", "to": "state", "route": "over" }
  ],
  "note": "可选的一行灰字说明"
}
```

`edges[].route`：`auto`（默认，按两框相对位置直接连）/ `down`（同列向下）/ `back`（从右侧绕行）/
`over`（`from` 的下边 → 顶部走廊 → `to` 的上边，回边专用）。
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

# 仓库内联的 kit（随插件发行，见 assets/figures_kit/）
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from figures_kit import INK, MUT, ACC, REJ, Sheet  # noqa: E402
except ImportError:  # pragma: no cover - 交给上层报错
    raise SystemExit("figures_kit.py 未随包发行：找不到 assets/figures_kit/figures_kit.py")

ROLES = {"normal": INK, "accent": ACC, "reject": REJ}
RESULT_PREFIX = "@@SCHEMATIC@@ "


class RenderError(RuntimeError):
    """结构性错误（IR 不合法），由上层转成工具返回值。"""


def _fail(msg: str) -> None:
    raise RenderError(msg)


def _grid_positions(spec: dict) -> tuple[dict[int, float], dict[int, float]]:
    size = spec.get("size") or [3.3, 1.9]
    margin = spec.get("margin") or [0.12, 0.12, 0.12, 0.12]
    grid = spec.get("grid") or {}
    # 两种写法都接受：扁平 cols/rows（工具参数就是这两个）或 grid:{cols,rows}
    cols = grid.get("cols") or spec.get("cols")
    rows = grid.get("rows") or spec.get("rows")
    if not cols or not rows:
        _fail("需要 cols 与 rows（列/行中心的比例数组）")
    W, H = float(size[0]), float(size[1])
    ml, mb, mr, mt = (float(v) for v in margin)
    inner_w, inner_h = W - ml - mr, H - mb - mt
    cx = {}
    for i, frac in enumerate(cols, start=1):
        if not 0.0 < float(frac) < 1.0:
            _fail(f"grid.cols[{i}] 必须是 (0,1) 比例")
        cx[i] = ml + inner_w * float(frac)
    cy = {}
    for i, frac in enumerate(rows, start=1):
        if not 0.0 < float(frac) < 1.0:
            _fail(f"grid.rows[{i}] 必须是 (0,1) 比例")
        # 行号自上而下（与写作习惯一致）：row 1 在页面/画布上部
        cy[i] = H - mt - inner_h * float(frac)
    return cx, cy


def _node_width(spec: dict) -> float:
    size = spec.get("size") or [3.3, 1.9]
    grid = spec.get("grid") or {}
    n = max(1, len(grid.get("cols") or spec.get("cols") or [1]))
    W = float(size[0])
    m = spec.get("margin") or [0.12, 0.12, 0.12, 0.12]
    inner = W - float(m[0]) - float(m[2])
    pitch = inner / n
    return float(spec.get("nodeWidth") or pitch * 0.86)


def render(spec: dict) -> dict:
    nodes = spec.get("nodes") or []
    if not nodes:
        _fail("nodes 为空：没有要画的节点")
    ids = [str(n.get("id") or "") for n in nodes]
    if len(set(ids)) != len(ids) or "" in ids:
        _fail("nodes[].id 必须唯一且非空")

    W, H = (float(v) for v in (spec.get("size") or [3.3, 1.9]))
    cx, cy = _grid_positions(spec)
    bw = _node_width(spec)

    s = Sheet(W, H)
    boxes: dict[str, tuple[float, float, float, float, str]] = {}

    for nd in nodes:
        nid = str(nd["id"])
        col, row = int(nd.get("col", 1)), int(nd.get("row", 1))
        if col not in cx:
            _fail(f"节点 {nid} 的 col={col} 超出 grid.cols 范围（{len(cx)} 列）")
        if row not in cy:
            _fail(f"节点 {nid} 的 row={row} 超出 grid.rows 范围（{len(cy)} 行）")
        role = str(nd.get("role", "normal"))
        if role not in ROLES:
            _fail(f"节点 {nid} 的 role='{role}' 不支持（{'/'.join(ROLES)}）")
        boxes[nid] = s.node(
            nid,
            str(nd.get("label", "")),
            str(nd.get("desc", "") or ""),
            cx[col],
            cy[row],
            w=bw,
            hatch_col=ROLES[role],
        )

    def center_x(b):  return b[0] + b[2] / 2.0
    def center_y(b):  return b[1] + b[3] / 2.0

    for ed in spec.get("edges") or []:
        src, dst = str(ed.get("from") or ""), str(ed.get("to") or "")
        if src not in boxes:
            _fail(f"边 {ed.get('id', '?')} 的 from='{src}' 不是已声明节点")
        if dst not in boxes:
            _fail(f"边 {ed.get('id', '?')} 的 to='{dst}' 不是已声明节点")
        a, b = boxes[src], boxes[dst]
        route = str(ed.get("route", "auto"))
        color = ROLES.get(str(ed.get("role", "normal")), INK)
        if route == "left":
            # 回边走上方，但从目标框的**左边**进入：与同列节点不共线
            y_cor = float(spec.get("corridorY") or (max(a[1] + a[3], b[1] + b[3]) + float(spec.get("corridor", 0.16))))
            x_left = b[0] - float(spec.get("swing", 0.22))
            s.poly([(center_x(a), a[1] + a[3]), (center_x(a), y_cor),
                    (x_left, y_cor), (x_left, center_y(b)),
                    (b[0], center_y(b))], color=color)
        elif route == "over":
            y_corridor = max(a[1] + a[3], b[1] + b[3]) + float(spec.get("corridor", 0.16))
            s.poly([(center_x(a), a[1] + a[3]), (center_x(a), y_corridor),
                    (center_x(b), y_corridor), (center_x(b), b[1] + b[3])], color=color)
        elif route == "down":
            # 从 a 的右缘出发，在 a 与右邻列之间下行，再从**右侧**进入 b。
            # 这样竖段落在列间净空里，不穿过后排中间节点。
            x_swing = a[0] + a[2] + float(spec.get("swing", 0.22))
            s.poly([(a[0] + a[2], center_y(a)), (x_swing, center_y(a)),
                    (x_swing, center_y(b)), (b[0] + b[2], center_y(b))], color=color)
        elif route == "back":
            x_corridor = max(a[0] + a[2], b[0] + b[2]) + float(spec.get("corridor", 0.16))
            s.poly([(a[0] + a[2], center_y(a)), (x_corridor, center_y(a)),
                    (x_corridor, center_y(b)), (b[0] + b[2], center_y(b))], color=color)
        else:
            s.edge(a, b)

    note = spec.get("note")
    if note:
        s.ax.text(float(spec.get("margin", [0.12])[0]),
                  float(spec.get("noteY", 0.07)), str(note),
                  ha="left", va="center", fontsize=7.0, color=MUT, zorder=3)

    stats = s.assert_clean(str(spec.get("name", "schematic")))

    out_dir = Path(str(spec.get("outDir") or ".")).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    name = str(spec.get("name") or "schematic")
    pdf = out_dir / f"{name}.pdf"
    s.fig.savefig(pdf, format="pdf", bbox_inches="tight", pad_inches=0.02)
    plt.close(s.fig)

    written = [str(pdf)]
    latex_dir = spec.get("latexFiguresDir")
    if latex_dir:
        ld = Path(str(latex_dir)).resolve()
        ld.mkdir(parents=True, exist_ok=True)
        shutil.copy2(pdf, ld / pdf.name)
        written.append(str(ld / pdf.name))

    # 供上层做"单栏可读性"判据：图缩放到栏宽后的字号
    col_pt = float(spec.get("columnWidthPt") or 252.0)
    scale = col_pt / (W * 72.0)
    return {
        "ok": True,
        "name": name,
        "pdf": written[0],
        "copies": written,
        "sizeIn": [W, H],
        "aspect": round(W / H, 3),
        "effectiveNodePt": [round(8.6 * scale, 2), round(7.0 * scale, 2)],
        "legible": 7.0 * scale >= 7.0,
        "stats": stats,
    }


def main() -> int:
    raw = sys.stdin.read()
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as e:
        print(RESULT_PREFIX + json.dumps({"ok": False, "error": f"spec 不是合法 JSON: {e}"}))
        return 1
    try:
        print(RESULT_PREFIX + json.dumps(render(spec), ensure_ascii=False))
        return 0
    except RenderError as e:
        print(RESULT_PREFIX + json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        return 1
    except AssertionError as e:                       # assert_clean 失败：几何不合格
        print(RESULT_PREFIX + json.dumps({"ok": False, "error": f"几何校验失败：{e}"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
