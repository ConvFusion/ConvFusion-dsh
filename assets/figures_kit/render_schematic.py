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

`edges[].route`：`auto`（默认，按两框相对位置直接连）/ `v`（上下叠放的框，竖直相接）/ `down`（同列向下）/
`back`（从右侧绕行）/ `over`（`from` 的下边 → 顶部走廊 → `to` 的上边，回边专用）。

**泳道（swimlane）**：声明 `lanes:[{id,label}]` 并给框写 `nodes[].lane` —— 车道矩形与车道高由
**成员框的实测尺寸**推出，画布高度由内容算出（不填坐标）；没有 `lane` 的框构成底部「带」。
车道感知走线：`rowgap`（跨车道间隙，从**朝向目标的那一面**出发，`enterOffset` 可平移入口）、
`outer`（车道外侧走廊 + 顶部反馈带，`side`/`belt` 让两条回路各行其道）；两者的净空都从**车道边框**
起算，因此「车道名压框」「走线贴车道边框」两条出厂断言由构造保证。`points`（英寸）是折点逃生口。
完整样板：`assets/figures_kit/examples/lanes_feedback.json`（8 框 / 2 泳道 / 两条反馈回路）。
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
    from figures_kit import BOX_PAD, INK, MUT, ACC, ACC2, REJ, ROLES, Sheet, register_roles  # noqa: E402
except ImportError:  # pragma: no cover - 交给上层报错
    raise SystemExit("figures_kit.py 未随包发行：找不到 assets/figures_kit/figures_kit.py")

# ROLES 不再是本文件的常量，而是 figures_kit 里可扩展的注册表；
# 调用者用 register_role()/register_roles()，或按图写 spec["palette"]（见 render()）。
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


# ── 泳道（lane）与车道感知走线 ──────────────────────────────────────────────
# 声明式：`lanes[]` 只给 id/label，车道矩形由**成员节点实测尺寸**推出（不是手填坐标），
# 这与节点框"高度由文字实测决定"同一原则。任何工作区只要写 lanes + nodes[].lane，
# 就能得到"车道名不压框""走线不贴车道边框"这两条出厂断言保护的车道图。
LANE_SIDE = 0.08          # 车道容器在成员框两侧的外扩
LANE_PAD_T = 0.28         # 车道顶 → 最高成员框上沿（= 车道名保留带 0.16 + 净空 0.12）
LANE_PAD_B = 0.08         # 最低成员框下沿 → 车道底
LANE_GAP = 0.35           # 两条车道之间的空隙
LANE_BAND_GAP = 0.40      # 最后一个车道 → "带"（无 lane 的节点）
CANVAS_TOP, CANVAS_BOT = 0.56, 0.10
LANE_CLEAR = 0.07         # 走线 ↔ 车道视觉边框的净空（出厂断言要求 ≥ 0.04，留余量）
LANE_FRAME_PAD = 0.02     # 与 kit 的 lane() boxstyle pad 一致：视觉边框 = 登记矩形 ± 该值
BELT = [0.22, 0.44]       # 外侧反馈带高度（相对最上车道顶），供 route=outer 的 belt 选择


def _node_x(spec: dict, nd: dict, cx: dict) -> float:
    if nd.get("x") is not None:
        return float(nd["x"])
    col = int(nd.get("col", 1))
    if col not in cx:
        _fail(f"节点 {nd.get('id')} 的 col={col} 超出 grid.cols 范围（{len(cx)} 列）")
    return cx[col]


def _lane_layout(spec: dict, s: "Sheet", ninfo: dict, cx: dict) -> dict | None:
    """把 `lanes[]`（成员制）算成矩形，并定出每个节点的行 y 与画布高度。

    返回 {lanes:{id:{x0,y0,x1,y1,label,top,members}}, y:{nid:y}, H}；spec 无 lanes 时返回 None。
    """
    lanes_spec = spec.get("lanes") or []
    if not lanes_spec:
        return None
    W = float((spec.get("size") or [3.3, 1.9])[0])
    ids = {str(l.get("id") or ""): l for l in lanes_spec}
    if "" in ids or len(ids) != len(lanes_spec):
        _fail("lanes[].id 必须唯一且非空")
    members: dict[str, list[str]] = {k: [] for k in ids}
    belt: list[str] = []
    for nd in spec["nodes"]:
        lid = nd.get("lane")
        if lid is None:
            belt.append(str(nd["id"]))
        elif str(lid) in members:
            members[str(lid)].append(str(nd["id"]))
        else:
            _fail(f"节点 {nd.get('id')} 的 lane='{lid}' 未在 lanes[] 中声明")

    # 两种摆放方式：
    #  · 模式 A（未给 rows）：车道驱动 —— 成员行由车道推、非成员构成底部「带」；
    #  · 模式 B（给了 rows）：grid 驱动 —— 所有框按 cols/rows 摆放，车道只作**容器**画在成员框外面
    #    （Paper 2 Fig 1 那种"中列一块守卫带、左右各有框"的图就是模式 B）。
    if spec.get("rows"):
        cx2, cy2 = _grid_positions(spec)
        y: dict[str, float] = {}
        tops: dict[str, list[float]] = {k: [] for k in ids}
        bots: dict[str, list[float]] = {k: [] for k in ids}
        for nd in spec["nodes"]:
            nid = str(nd["id"])
            yy = cy2[int(nd.get("row", 1))]
            y[nid] = yy
            lid = nd.get("lane")
            if lid is not None:
                w, h = ninfo[nid]
                tops[str(lid)].append(yy + h / 2)
                bots[str(lid)].append(yy - h / 2)
        plan = {}
        for lid, l in ids.items():
            if not tops[lid]:
                _fail(f"lane {lid} 没有成员节点（车道高无从推出）")
            _xl = [_node_x(spec, _nd(spec, n), cx2) - ninfo[n][0] / 2 for n in members[lid]]
            _xr = [_node_x(spec, _nd(spec, n), cx2) + ninfo[n][0] / 2 for n in members[lid]]
            plan[lid] = {"label": str(l.get("label", "")), "band": float(l.get("band") or 0.16),
                         "x0": min(_xl) - LANE_SIDE, "x1": max(_xr) + LANE_SIDE,
                         "y0": min(bots[lid]) - LANE_PAD_B, "y1": max(tops[lid]) + LANE_PAD_T,
                         "h": (max(tops[lid]) - min(bots[lid])) + LANE_PAD_T + LANE_PAD_B,
                         "max_h": max(tops[lid]) - min(bots[lid])}
            plan[lid]["top"] = plan[lid]["y1"]
        return {"lanes": plan, "y": y, "H": float((spec.get("size") or [3.3, 1.9])[1]), "belt": []}

    # 每个车道：x 由成员框决定，行高由**最高的成员框**决定
    plan: dict[str, dict] = {}
    for lid, l in ids.items():
        ms = members[lid]
        if not ms:
            _fail(f"lane {lid} 没有成员节点（车道高无从推出）")
        left = min(_node_x(spec, _nd(spec, n), cx) - ninfo[n][0] / 2 for n in ms)
        right = max(_node_x(spec, _nd(spec, n), cx) + ninfo[n][0] / 2 for n in ms)
        max_h = max(ninfo[n][1] for n in ms)
        plan[lid] = {"label": str(l.get("label", "")), "band": float(l.get("band") or 0.16),
                     "x0": left - LANE_SIDE, "x1": right + LANE_SIDE,
                     "h": max_h + LANE_PAD_T + LANE_PAD_B, "max_h": max_h}

    belt_h = max((ninfo[n][1] for n in belt), default=0.0)
    H = CANVAS_TOP + sum(p["h"] for p in plan.values()) + LANE_GAP * (len(plan) - 1)
    if belt:
        H += LANE_BAND_GAP + belt_h
    H += CANVAS_BOT

    # 自上而下摆放车道；成员框中心统一 = 车道顶 - LANE_PAD_T - max_h/2（同行严格同高）
    top = H - CANVAS_TOP
    y: dict[str, float] = {}
    for lid, p in plan.items():
        p["y1"] = top
        p["y0"] = top - p["h"]
        p["top"] = top
        yc = p["y1"] - LANE_PAD_T - p["max_h"] / 2
        for n in members[lid]:
            y[n] = yc
        top = p["y0"] - LANE_GAP
    if belt:
        b_top = top + LANE_GAP - LANE_BAND_GAP if plan else H - CANVAS_TOP - LANE_BAND_GAP
        yc = b_top - belt_h / 2
        for n in belt:
            y[n] = yc
    return {"lanes": plan, "y": y, "H": H, "belt": belt}


def _nd(spec: dict, nid: str) -> dict:
    for nd in spec["nodes"]:
        if str(nd["id"]) == nid:
            return nd
    _fail(f"节点 {nid} 不存在")


def _lane_of(spec: dict, nid: str) -> str | None:
    lid = _nd(spec, nid).get("lane")
    return None if lid is None else str(lid)


def render(spec: dict) -> dict:
    # 按图声明扩展角色表（spec["palette"]）。配色是图的性质，调用者不该为加一种
    # 语义色去改 kit 源码；overwrite=True 让同一进程内重复渲染时后者说了算。
    register_roles(spec.get("palette") or {}, overwrite=True)

    nodes = spec.get("nodes") or []
    if not nodes:
        _fail("nodes 为空：没有要画的节点")
    ids = [str(n.get("id") or "") for n in nodes]
    if len(set(ids)) != len(ids) or "" in ids:
        _fail("nodes[].id 必须唯一且非空")

    W = float((spec.get("size") or [3.3, 1.9])[0])
    # 每个框都给了绝对 x 时不需要 grid（泳道图常见写法）；否则从 cols 取列中心。
    if any(nd.get("x") is None for nd in nodes):
        cx, _cy_probe = _grid_positions({**spec, "size": [W, 2.0],
                                         "rows": spec.get("rows") or [0.5]})
    else:
        cx = {}
    bw = _node_width(spec)

    # 逐节点实测尺寸：宽度取 nodes[].width（缺省用全局 bw），高度由文字行数推出
    probe = Sheet(W, 2.0)
    ninfo: dict[str, tuple[float, float]] = {}
    for nd in nodes:
        nid = str(nd["id"])
        w = float(nd.get("width") or bw)
        ninfo[nid] = (w, probe.size(str(nd.get("label", "")), str(nd.get("desc", "") or ""), w)[1])
    plt.close(probe.fig)

    layout = _lane_layout(spec, None, ninfo, cx)
    if layout is None:
        H = float((spec.get("size") or [3.3, 1.9])[1])
        cx, cy = _grid_positions(spec)
    else:
        H = layout["H"]
        cy = layout["y"]                     # 车道/带内节点的行 y 由布局算出，不再读 grid.rows

    s = Sheet(W, H)
    boxes: dict[str, tuple[float, float, float, float, str]] = {}

    if layout is not None:                   # 先画车道容器（在节点之下），拿到保留带下沿
        for lid, p in layout["lanes"].items():
            p["band_y"] = s.lane(p["x0"], p["y0"], p["x1"], p["y1"], p["label"], label_band=p["band"])

    for nd in nodes:
        nid = str(nd["id"])
        role = str(nd.get("role", "normal"))
        if role not in ROLES:
            _fail(f"节点 {nid} 的 role='{role}' 不支持（{'/'.join(ROLES)}）")
        if layout is None:
            col, row = int(nd.get("col", 1)), int(nd.get("row", 1))
            if col not in cx:
                _fail(f"节点 {nid} 的 col={col} 超出 grid.cols 范围（{len(cx)} 列）")
            if row not in cy:
                _fail(f"节点 {nid} 的 row={row} 超出 grid.rows 范围（{len(cy)} 行）")
            y = cy[row]
        else:
            if nid not in cy:
                _fail(f"节点 {nid} 既不在任何 lane 里，也不在带（belt）里")
            y = cy[nid]
        boxes[nid] = s.node(
            nid,
            str(nd.get("label", "")),
            str(nd.get("desc", "") or ""),
            _node_x(spec, nd, cx),
            y,
            w=ninfo[nid][0],
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
        ls = str(ed.get("ls", "-"))
        if ed.get("points"):
            # 逃生口：显式折点（英寸，左下原点）。语义化走线覆盖不到时才用。
            pts = [(float(p[0]), float(p[1])) for p in ed["points"]]
            if len(pts) < 2:
                _fail(f"边 {ed.get('id', '?')} 的 points 至少两个点")
            s.poly(pts, color=color, ls=ls)
            s.edges[-1] = (list(pts), (str(ed.get("from")), str(ed.get("to"))))
        elif route in ("v", "vertical"):
            # 竖直相接：a 在下 → 从 a 的上边到 b 的下边；a 在上 → 反之。
            # 用于上下叠放的框（`auto` 只在左右两侧接边，叠放时会画成侧接）。
            xa, xb = center_x(a), center_x(b)
            if center_y(a) < center_y(b):
                p, q = (xa, a[1] + a[3]), (xb, b[1])
            else:
                p, q = (xa, a[1]), (xb, b[1] + b[3])
            s.arrow(p, q, color=color, ls=ls)
            s.edges[-1] = ([p, q], (str(ed.get("from")), str(ed.get("to"))))
        elif route == "rowgap":
            # 跨车道间隙：从上方框的**上边**绕到目标框的**上边**，走廊贴着（两个车道中）
            # 上方那个车道的边框留净空 —— 车道感知，所以 ⑤（走线贴车道边框）由构造保证。
            if layout is None:
                _fail("route=rowgap 需要 lanes[]（车道感知走线）")
            la, lb = _lane_of(spec, src), _lane_of(spec, dst)
            if la is None or lb is None:
                _fail("route=rowgap 的两个端点都必须属于某个 lane")
            lanes = layout["lanes"]
            if la == lb:
                # 同一车道：从 a 的**上边**出发，走廊在车道上边框之上（道外），进 b 的上边
                y_cor = lanes[la]["y1"] + LANE_FRAME_PAD + LANE_CLEAR
                y_from, y_to = a[1] + a[3], b[1] + b[3]
            elif center_y(a) > center_y(b):
                # a 在上方车道：从 a 的**下边**出发 —— 走廊贴 a 的车道下边框（两车道之间），进 b 的上边
                y_cor = lanes[la]["y0"] - LANE_FRAME_PAD - LANE_CLEAR
                y_from, y_to = a[1], b[1] + b[3]
            else:
                # a 在下方车道：从 a 的**上边**出发，走廊贴 b 的车道下边框，进 b 的下边
                y_cor = lanes[lb]["y0"] - LANE_FRAME_PAD - LANE_CLEAR
                y_from, y_to = a[1] + a[3], b[1]
            x_in = center_x(b) + float(ed.get("enterOffset", 0.0))
            pts = [(center_x(a), y_from), (center_x(a), y_cor),
                   (x_in, y_cor), (x_in, y_to)]
            s.poly(pts, color=color, ls=ls)
            s.edges[-1] = (list(pts), (str(ed.get("from")), str(ed.get("to"))))
        elif route == "outer":
            # 外侧走廊 + 顶部反馈带：从 a 的侧边出，走车道**外侧**净空上行，沿反馈带走，
            # 再从 b 的上边进入。两条带（belt 0/1）供两条回路各行其道，互不重叠。
            if layout is None:
                _fail("route=outer 需要 lanes[]")
            side = str(ed.get("side", "right"))
            if side not in ("left", "right"):
                _fail(f"route=outer 的 side='{side}' 不支持（left/right）")
            belt = min(int(ed.get("belt", 0)), len(BELT) - 1)
            lanes = layout["lanes"]
            x_out = (min(p["x0"] for p in lanes.values()) - LANE_FRAME_PAD - LANE_CLEAR
                     if side == "left" else
                     max(p["x1"] for p in lanes.values()) + LANE_FRAME_PAD + LANE_CLEAR)
            y_belt = max(p["y1"] for p in lanes.values()) + LANE_FRAME_PAD + BELT[belt]
            swing = float(ed.get("swing", spec.get("swing", 0.22)))
            x_in = center_x(b) + (swing if side == "right" else -swing)
            x_from = a[0] if side == "left" else a[0] + a[2]
            pts = [(x_from, center_y(a)), (x_out, center_y(a)), (x_out, y_belt),
                   (x_in, y_belt), (x_in, b[1] + b[3])]
            s.poly(pts, color=color, ls=ls)
            s.edges[-1] = (list(pts), (str(ed.get("from")), str(ed.get("to"))))
        elif route == "left":
            # 回边走上方，但从目标框的**左边**进入：与同列节点不共线
            y_cor = float(spec.get("corridorY") or (max(a[1] + a[3], b[1] + b[3]) + float(spec.get("corridor", 0.16))))
            x_left = b[0] - float(spec.get("swing", 0.22))
            s.poly([(center_x(a), a[1] + a[3]), (center_x(a), y_cor),
                    (x_left, y_cor), (x_left, center_y(b)),
                    (b[0], center_y(b))], color=color)
        elif route == "lshape":
            # 回边（L 型）：从 a 的**左边中点**出，在左侧净空上行到 b 的**中高**，
            # 再**水平**进入 b 的左边中点。终点段始终是水平的，不会出现"竖直落进框"。
            assert center_y(b) > center_y(a), "lshape 路由只用于目标在上的回边"
            x_gap = a[0] - float(spec.get("swing", 0.22))
            assert x_gap > 0, "左侧净空不足（缩小 swing 或增大左边距）"
            y_in = center_y(b)
            s.poly([(a[0], center_y(a)), (x_gap, center_y(a)),
                    (x_gap, y_in), (b[0], y_in)], color=color)
        elif route == "around":
            # 回边：**出口与入口都取侧边中点**，走外侧净空 + 顶部走廊。
            # 从下往上（目标在上）：从 a 的**左边中点**出发，在左净空上行，进 b 的左边中点；
            # 从上往下（目标在下）：从 a 的**上边中点**出发，进 b 的上边中点。
            upward = center_y(b) > center_y(a)
            corridor = float(spec.get("corridorY") or (max(a[1] + a[3], b[1] + b[3]) + float(spec.get("corridor", 0.16))))
            swing = float(spec.get("swing", 0.22))
            if upward:
                x_out = a[0] - swing
                x_in = b[0] - swing
                assert x_out > 0 and x_in > 0, "回边外侧净空不足（缩小 swing 或增大左边距）"
                s.poly([(a[0], center_y(a)), (x_out, center_y(a)), (x_out, corridor),
                        (x_in, corridor), (x_in, center_y(b)), (b[0], center_y(b))], color=color)
            else:
                x_out = a[0] + a[2] / 2
                s.poly([(x_out, a[1] + a[3]), (x_out, corridor),
                        (b[0] + b[2] / 2, corridor), (b[0] + b[2] / 2, b[1] + b[3])], color=color)
        elif route == "over":
            y_corridor = max(a[1] + a[3], b[1] + b[3]) + float(spec.get("corridor", 0.16))
            s.poly([(center_x(a), a[1] + a[3]), (center_x(a), y_corridor),
                    (center_x(b), y_corridor), (center_x(b), b[1] + b[3])], color=color)
        elif route == "leftup":
            # 从 a 的**左缘**出发，在 a 与左邻列之间的净空里上行，再从 b 的**左缘**进入。
            # 用于右上→右下这一对：避免竖段压住中间列的后排节点，也避免与同列节点共线。
            x_swing = a[0] - float(spec.get("swing", 0.22))
            s.poly([(a[0], center_y(a)), (x_swing, center_y(a)),
                    (x_swing, center_y(b)), (b[0], center_y(b))], color=color)
        elif route == "down":
            # 从 a 的右缘出发，在 a 与右邻列之间下行，再从**右侧**进入 b。
            # 这样竖段落在列间净空里，不穿过后排中间节点。
            # 竖段走在**两框右侧的净空**里，再从 b 的**右边**进入 —— 保持"从最右边连接"。
            x_swing = max(a[0] + a[2], b[0] + b[2]) + float(spec.get("swing", 0.22))
            s.poly([(a[0] + a[2], center_y(a)), (x_swing, center_y(a)),
                    (x_swing, center_y(b)), (b[0] + b[2], center_y(b))], color=color)
        elif route == "back":
            x_corridor = max(a[0] + a[2], b[0] + b[2]) + float(spec.get("corridor", 0.16))
            s.poly([(a[0] + a[2], center_y(a)), (x_corridor, center_y(a)),
                    (x_corridor, center_y(b)), (b[0] + b[2], center_y(b))], color=color)
        else:
            s.edge(a, b, ls=ls)

    if spec.get("debugEdges"):
        for path, _ in s.edges:
            pts = " → ".join(f"({p[0]:.2f},{p[1]:.2f})" for p in path)
            print(f"[edge] {pts}", file=sys.stderr)

    note = spec.get("note")
    if note:
        # note 锚定**最低的框**：向下留固定间距（note_gap），而不是用绝对坐标 —— 
        # 绝对坐标在画布缩放时会与框重叠（曾实测重叠 2pt）。
        lowest = min((bb[1] for bb in boxes.values()), default=float(spec.get("noteY", 0.07)))
        gap = float(spec.get("noteGap", 0.14))
        s.ax.text(float(spec.get("margin", [0.12])[0]), lowest - gap, str(note),
                  ha="left", va="top", fontsize=7.0, color=MUT, zorder=3)

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
