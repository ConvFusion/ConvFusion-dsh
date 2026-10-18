#!/usr/bin/env python3
r"""论文示意图工具：由**实测文字尺寸**驱动的布局 + **程序化出厂校验**。

为什么需要它（都是本项目踩过的坑）：
  · 手填固定坐标 -> 文字压字 / 越框（Fig 1、Fig 2 都出过）；
  · Diagram-IR 渲染器的 show_descriptions 在已构建的 lib 里曾静默失效（每个节点只剩标签，
    描述全丢）——修好前把描述并入 label 的 \n 多行是可用绕行；
  · 只看「文字在框内」仍不够：**文字与文字重叠**必须单独查（加粗标题压住首行说明就是这么漏出去的）；
  · 只看节点框还不够：**泳道容器（lane）**是后加的，此前 assert_clean 里没有它的概念，
    于是「车道名压住车道内的节点框」「连线沿着车道边框走」这两类缺陷全部漏检
    （Paper 1 Fig 1 实测：kernel lane 的车道名与 guards/commit 框净空 0.0 in，
     左走廊竖线与车道左边框净空 0.03 in，Typed proposal / Kernel guards / Rejected+reason
     三条边分别贴着 lane 1 下边框、lane 2 上边框、lane 2 右边框走）。
    现在 lane() 把车道矩形登记进 sheet.lanes，下面 ④⑤ 两条检查因此真正跑起来。
本模块把上述判据做成断言，任一失败即报错退出。

用法：
    from figures_kit import Sheet, INK, MUT, ACC, REJ
    s = Sheet(7.16, 3.0)
    body = s.lane(0.16, 1.0, 5.40, 1.9, "model lane: never gated")   # 返回保留带下沿 y
    a = s.node("id", "标签 $S_t$", "说明文字", x=1.0, y=body - 0.3, w=1.5)
    b = s.node("id2", "另一个", "...", x=3.2, y=body - 0.3, w=1.5)
    s.poly([(a[0]+a[2], a[1]+a[3]/2), (b[0], b[1]+b[3]/2)])
    s.assert_clean("figure_name")
    s.save("figure_name")
"""
from __future__ import annotations
import shutil
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

HERE = Path(__file__).resolve().parent
LATEX = HERE.parent / "latex" / "figures"
INK, MUT, ACC, REJ = "#1b1b1f", "#5b5b63", "#1565c0", "#b3261e"
# 一对部署目标色（蓝 / 橙）：白底上都醒目，互为对立色，且对色觉障碍友好。
# 图中只把"这是被考核的目标"涂色，其余节点一律近黑 —— 颜色必须有单一含义。
ACC2 = "#c2410c"
FS_LAB, FS_DESC = 8.6, 7.0
PAD, LH = 0.075, 1.42          # 内边距(英寸)、行高系数
BOX_PAD = 0.012                # 节点框 boxstyle pad：视觉边框比登记矩形外扩这么多
LANE_PAD = 0.02                # 车道框 boxstyle pad：同上（登记的 rect 即视觉边框）
LANE_EC, LANE_FC, LANE_LS = "#c7ccd4", "#f7f8fa", (0, (4, 3))
LANE_BAND = 0.16               # 车道名默认保留带高度（车道名文字必须整段落在其内）
LANE_LABEL_CLEAR = 0.06        # 车道名文字矩形 ↔ 任一节点框 的最小净空
LANE_EDGE_CLEAR = 0.04         # 近水平/近垂直连线 ↔ 车道边框 的最小净空（共线重叠即违规）
LANE_EDGE_EPS = 0.02           # 判定「近水平 / 近垂直」的斜率阈值

# 角色注册表：role 名 -> 颜色，节点与连线都按它上色。
# 调用者可用 register_role()/register_roles() 追加自己的语义色，不必改本文件；
# spec 也可以写顶层 "palette" 字段按图声明，render_schematic 会代其注册。
ROLES: dict[str, str] = {
    "normal": INK,
    "muted": MUT,
    "accent": ACC,
    "accent2": ACC2,
    "reject": REJ,
}


def register_role(name: str, color: str, *, overwrite: bool = False) -> None:
    """注册一个 role 色，供 spec 里节点/边的 role 字段引用。

    name        角色名，必须是非空字符串
    color       颜色，形如 "#c2410c" 或 "#abc"
    overwrite   已存在的角色默认拒绝覆盖，避免静默改掉既有语义色
    """
    if not isinstance(name, str) or not name.strip():
        raise ValueError("role 名必须是非空字符串")
    if not (isinstance(color, str) and color.startswith("#") and len(color) in (4, 7)):
        raise ValueError(f"role '{name}' 的颜色须为 #rgb 或 #rrggbb，收到 {color!r}")
    key = name.strip()
    if key in ROLES and not overwrite:
        raise ValueError(f"role '{key}' 已注册为 {ROLES[key]}；确要覆盖请传 overwrite=True")
    ROLES[key] = color


def register_roles(mapping, *, overwrite: bool = False) -> None:
    """批量注册，键为角色名、值为颜色（spec 的 palette 字段走这里）。"""
    for name, color in (mapping or {}).items():
        register_role(name, color, overwrite=overwrite)


def wrap(text: str, max_lines: int = 3, max_chars: int = 26) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= max_chars:
            cur += " " + w
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:                       # 合并溢出，避免框高失控
        lines = lines[:max_lines - 1] + [" ".join(lines[max_lines - 1:])]
    return lines


def _segment_rect_interval(px, py, qx, qy, x0, y0, x1, y1):
    """Liang–Barsky: the parameter interval [t0,t1] of segment p→q inside the rectangle.

    Returns None when the segment misses the rectangle.  The interval (rather than a boolean) is
    what makes the caller able to tell "the segment ends at this box" (t0≈0 or t1≈1) from "the
    segment passes through this box" — the distinction the old 5-point sampling could not make.
    """
    if x1 <= x0 or y1 <= y0:
        return None
    dx, dy = qx - px, qy - py
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, px - x0), (dx, x1 - px), (-dy, py - y0), (dy, y1 - py)):
        if abs(p) < 1e-12:
            if q < 0:
                return None
            continue
        t = q / p
        if p < 0:
            if t > t1:
                return None
            if t > t0:
                t0 = t
        else:
            if t < t0:
                return None
            if t < t1:
                t1 = t
    return (t0, t1) if t0 < t1 else None


def _segment_crosses_rect(px, py, qx, qy, x0, y0, x1, y1, endpoint_margin: float = 0.02) -> bool:
    """True when the *middle* of segment p→q runs inside the rectangle.

    An arrow legitimately starts or ends at a box boundary, so the portion of the segment within
    ``endpoint_margin`` (as a fraction of the segment) of either end is ignored.  Everything that
    survives that margin is a genuine crossing of a box the edge does not belong to.
    """
    iv = _segment_rect_interval(px, py, qx, qy, x0, y0, x1, y1)
    if iv is None:
        return False
    t0, t1 = iv
    return t0 > endpoint_margin and t1 < 1.0 - endpoint_margin


class Sheet:
    """以英寸为数据坐标的画布；提供文字实测与几何断言。"""

    def __init__(self, w: float, h: float):
        self.fig = plt.figure(figsize=(w, h), dpi=200)
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_xlim(0, w); self.ax.set_ylim(0, h); self.ax.axis("off")
        self.w, self.h = w, h
        self.texts: list[tuple] = []                 # (artist, x, y, w, h)
        self.boxes: list[tuple] = []                 # (x, y, w, h, id)
        self.edges: list[tuple] = []                 # (p, q, endpoints)
        self.lanes: list[tuple] = []                 # (x, y, w, h, label)：**视觉边框**（含 LANE_PAD）
        self.lane_labels: list = []                  # 与 self.lanes 一一对应的车道名 Text
        self.lane_bands: list[float] = []            # 与 self.lanes 一一对应的保留带高度

    # ── 文字实测（英寸） ───────────────────────────────────────────────
    def measure(self, s: str, fs: float, weight: str = "normal") -> tuple[float, float]:
        t = self.ax.text(0, -20, s, fontsize=fs, fontweight=weight)
        self.fig.canvas.draw()
        bb = t.get_window_extent(self.fig.canvas.get_renderer())
        t.remove()
        return bb.width / self.fig.dpi, bb.height / self.fig.dpi

    def wrap_fit(self, text: str, max_w: float, fs: float, max_lines: int = 4) -> list[str]:
        """按**实测宽度**换行（不是按字符数）——这样文字绝不会越框。"""
        words, lines, cur = text.split(), [], ""
        for w in words:
            trial = f"{cur} {w}".strip()
            if not cur or self.measure(trial, fs)[0] <= max_w:
                cur = trial
            else:
                lines.append(cur); cur = w
        if cur:
            lines.append(cur)
        if len(lines) > max_lines:
            lines = lines[:max_lines - 1] + [" ".join(lines[max_lines - 1:])]
        return lines

    def size(self, label: str, desc: str, w: float) -> tuple[float, float]:
        """预测量框高（供堆叠布局使用）。"""
        lab = self.wrap_fit(label, w - 2 * PAD, FS_LAB, 2)
        dsc = self.wrap_fit(desc, w - 2 * PAD, FS_DESC, 4) if desc else []
        bh = len(lab) * FS_LAB * LH / 72 + len(dsc) * FS_DESC * LH / 72 + 2 * PAD
        return w, bh

    def node(self, nid: str, label: str, desc: str, x: float, y: float,
             w: float | None = None, hatch_col: str = INK) -> tuple[float, float, float, float, str]:
        """画一个节点框（左上角 x,y 为**框中心**）；返回 (x0,y0,w,h)。"""
        bw = w if w else max(self.measure(label, FS_LAB, "bold")[0],
                             self.measure(desc, FS_DESC)[0] if desc else 0.0) + 2 * PAD
        lab_lines = self.wrap_fit(label, bw - 2 * PAD, FS_LAB, 2)
        desc_lines = self.wrap_fit(desc, bw - 2 * PAD, FS_DESC, 4) if desc else []
        bh = len(lab_lines) * FS_LAB * LH / 72 + len(desc_lines) * FS_DESC * LH / 72 + 2 * PAD
        x0, y0 = x - bw / 2, y - bh / 2
        self.ax.add_patch(FancyBboxPatch((x0, y0), bw, bh,
                                         boxstyle=f"round,pad={BOX_PAD},rounding_size=0.03",
                                         ec=hatch_col, fc="white", lw=1.15, zorder=2))
        # 游标式排版：每行占据自己完整的一行高，行与行不可能重叠
        # （此前用"加回一行高再减半差"定位描述首行，标题与首行中心只差约 1 pt，必然压字）
        cur = y0 + bh - PAD
        for l in lab_lines:
            lh = FS_LAB * LH / 72
            a = self.ax.text(x, cur - lh / 2, l, ha="center", va="center", fontsize=FS_LAB,
                             fontweight="bold", color=INK, zorder=3)
            self.texts.append((a, x0, y0, bw, bh)); cur -= lh
        for d in desc_lines:
            lh = FS_DESC * LH / 72
            a = self.ax.text(x, cur - lh / 2, d, ha="center", va="center", fontsize=FS_DESC,
                             color=MUT, zorder=3)
            self.texts.append((a, x0, y0, bw, bh)); cur -= lh
        self.boxes.append((x0, y0, bw, bh, nid))
        return x0, y0, bw, bh, nid

    def group(self, x0, y0, x1, y1, label: str):
        """虚线组框（无保留带语义）；返回**实际绘制**的矩形 (x0,y0,w,h)（含 boxstyle pad）。

        注意：group() **不登记车道**，因此 ④（车道名压节点框）⑤（连线沿车道边框）对它不生效。
        只要图里有"泳道"语义（容器内排节点、容器名写在容器上），就必须用 lane()。
        """
        self.ax.add_patch(FancyBboxPatch((x0, y0), x1 - x0, y1 - y0,
                                         boxstyle=f"round,pad={LANE_PAD},rounding_size=0.04",
                                         ec=LANE_EC, fc=LANE_FC, lw=1.0, ls=LANE_LS, zorder=1))
        self.ax.text(x0 + 0.07, y1 - 0.055, label, ha="left", va="top",
                     fontsize=FS_DESC, color=MUT, zorder=3)
        return (x0 - LANE_PAD, y0 - LANE_PAD, (x1 - x0) + 2 * LANE_PAD, (y1 - y0) + 2 * LANE_PAD)

    def lane(self, x0, y0, x1, y1, label: str, label_band: float = LANE_BAND) -> float:
        """**泳道容器**：虚线框（与 group 同一套视觉样式）+ 顶部保留带内的车道名。

        返回保留带的下沿 y（= y1 - label_band）——节点应当排在该值之下，且留出净空，
        这样车道名与车道内节点框之间不可能再发生"标题压框"。

        登记三件事，缺一不可（此前正是因为没有登记，车道类的碰撞才全部漏检）：
          · self.lanes      ← 视觉边框矩形 (x,y,w,h,label)，供 assert_clean ④⑤ 检查；
          · self.texts      ← 车道名文字，供"文字在框内 / 文字与文字不重叠"检查；
          · self.lane_labels/self.lane_bands ← 供 ④ 精确测量车道名矩形与保留带。
        """
        rect = self.group(x0, y0, x1, y1, label)     # 登记的即视觉边框
        lab = self.ax.texts[-1]                      # group 刚画的车道名
        lab.set_y(y1 - 0.04)                         # 略上移，使其整段落在保留带内
        self.texts.append((lab, rect[0], rect[1], rect[2], rect[3]))
        self.lanes.append((rect[0], rect[1], rect[2], rect[3], label))
        self.lane_labels.append(lab)
        self.lane_bands.append(label_band)
        return y1 - label_band

    def arrow(self, p, q, color=INK, ls="-", rad=0.0, lw=1.15):
        self.ax.add_patch(FancyArrowPatch(p, q, arrowstyle="-|>", mutation_scale=8,
                                          color=color, lw=lw, linestyle=ls, zorder=4,
                                          connectionstyle=f"arc3,rad={rad}",
                                          shrinkA=1.5, shrinkB=1.5))
        self.edges.append(([p, q], None))

    def poly(self, pts, color=INK, ls="-", lw=1.15):
        """折线箭头：逐段画直线，末段带箭头；登记为多段折线供穿框检查。"""
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            last = i == len(pts) - 2
            self.ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>" if last else "-",
                                              mutation_scale=9, color=color, lw=lw,
                                              linestyle=ls, zorder=4, shrinkA=0, shrinkB=0))
        self.edges.append((list(pts), None))

    def edge(self, src: tuple[float, float, float, float, str],
             dst: tuple[float, float, float, float, str], side: str = "h", **kw):
        """按两框相对位置接边，并记录端点（供穿框检查）。"""
        sx, sy, sw, sh, _ = src; dx, dy, dw, dh, _ = dst
        p = (sx + sw, sy + sh / 2) if sx < dx else (sx, sy + sh / 2)
        q = (dx, dy + dh / 2) if sx < dx else (dx + dw, dy + dh / 2)
        self.arrow(p, q, **kw)
        self.edges[-1] = ([p, q], (src[4], dst[4]))

    # ── 出厂校验 ─────────────────────────────────────────────────────
    def assert_clean(self, name: str) -> dict:
        """六条几何判据；任一失败即 AssertionError。返回实测的最小净空（英寸），供出图脚本与复核脚本引用。

        ① 每段文字都在自己的框内；①b 任意两段文字不重叠；② 任意两节点框不重叠；
        ③ 连线不穿非端点框；④ **车道名不压任何节点框**（净空 >= LANE_LABEL_CLEAR）；
        ⑤ **连线不沿着车道边框走**（近水平段查车道上下边框 / 近垂直段查车道左右边框，
           共线且投影重叠即违规，净空 >= LANE_EDGE_CLEAR）——垂直穿过边框一点仍合法。
        """
        r = self.fig.canvas.get_renderer()
        bad = []
        for a, x0, y0, bw, bh in self.texts:                      # ① 文字在框内
            bb = a.get_window_extent(r)
            dx0, dy0 = bb.x0 / self.fig.dpi, bb.y0 / self.fig.dpi
            dx1, dy1 = bb.x1 / self.fig.dpi, bb.y1 / self.fig.dpi
            if dx0 < x0 - 0.012 or dx1 > x0 + bw + 0.012 or dy0 < y0 - 0.012 or dy1 > y0 + bh + 0.012:
                bad.append(f"文字越框: 「{a.get_text()[:34]}」")
        rects = []                                                # ①b 文字与文字不重叠（本条此前缺失，
        for a, x0, y0, bw, bh in self.texts:                      #     导致"加粗标题压住首行说明"漏检出厂）
            bb = a.get_window_extent(r)
            rects.append((bb.x0 / self.fig.dpi, bb.y0 / self.fig.dpi,
                          bb.x1 / self.fig.dpi, bb.y1 / self.fig.dpi, a.get_text()))
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                ax0, ay0, ax1, ay1, at = rects[i]; bx0, by0, bx1, by1, bt = rects[j]
                ox = min(ax1, bx1) - max(ax0, bx0)
                oy = min(ay1, by1) - max(ay0, by0)
                if ox > 0.004 and oy > 0.004:
                    bad.append(f"文字重叠: 「{at[:24]}」 × 「{bt[:24]}」 ({ox*72:.1f}×{oy*72:.1f} pt)")
        for i in range(len(self.boxes)):                          # ② 框不重叠
            for j in range(i + 1, len(self.boxes)):
                ax0, ay0, aw, ah, ai = self.boxes[i]; bx0, by0, bw2, bh2, bi = self.boxes[j]
                ox = min(ax0 + aw, bx0 + bw2) - max(ax0, bx0)
                oy = min(ay0 + ah, by0 + bh2) - max(ay0, by0)
                if ox > 0.02 and oy > 0.02:
                    bad.append(f"框重叠: {ai} × {bi} ({ox:.3f}×{oy:.3f} in)")
        for pts, ends in self.edges:                              # ③ 连线不穿非端点框
            if not ends:
                continue
            for i in range(len(pts) - 1):
                (px, py), (qx, qy) = pts[i], pts[i + 1]
                for x0, y0, bw, bh, nid in self.boxes:
                    if nid in ends:
                        continue
                    # 用**精确线段-矩形求交**，不做采样。此前按 5 个参数点采样，一条斜穿薄框的
                    # 线段可以整体落在采样点之间而不被发现（实测：4 条横向流程全部用 route="v"
                    # 画成斜线、斜穿左右邻居，而 ③ 判据"校验通过"）。
                    if _segment_crosses_rect(px, py, qx, qy, x0 + 0.02, y0 + 0.02,
                                             x0 + bw - 0.02, y0 + bh - 0.02):
                        bad.append(f"连线穿过 {nid}: {ends[0]}→{ends[1]} ({px:.2f},{py:.2f})→({qx:.2f},{qy:.2f})")
                        break
        # ④ 车道名不得压到任何节点框（车道名保留带就是为此存在的）
        m_lab = None
        for (lx0, ly0, lw, lh, lbl), artist, band in zip(self.lanes, self.lane_labels, self.lane_bands):
            bb = artist.get_window_extent(r)
            tx0, ty0 = bb.x0 / self.fig.dpi, bb.y0 / self.fig.dpi
            tx1, ty1 = bb.x1 / self.fig.dpi, bb.y1 / self.fig.dpi
            if ty0 < ly0 + lh - band - 0.005:                     # 保留带没留够：车道名伸到带外
                bad.append(f"车道名越出保留带({band:.2f} in): 「{lbl[:24]}」")
            for x0, y0, bw, bh, nid in self.boxes:
                bx0, by0 = x0 - BOX_PAD, y0 - BOX_PAD             # 用**视觉边框**（含 pad）算净空
                bx1, by1 = x0 + bw + BOX_PAD, y0 + bh + BOX_PAD
                dx = max(bx0 - tx1, tx0 - bx1, 0.0)
                dy = max(by0 - ty1, ty0 - by1, 0.0)
                gap = (dx * dx + dy * dy) ** 0.5
                m_lab = gap if m_lab is None else min(m_lab, gap)
                if dx == 0.0 and dy == 0.0:
                    bad.append(f"车道名压节点框: 「{lbl[:24]}」 × {nid}")
                elif gap < LANE_LABEL_CLEAR:
                    bad.append(f"车道名离节点框过近: 「{lbl[:24]}」 × {nid}"
                               f"（净空 {gap*72:.1f} pt < {LANE_LABEL_CLEAR*72:.0f} pt）")
        # ⑤ 连线不得**沿着**车道边框走：近水平段只可能与车道上下边框共线、近垂直段只可能与
        #    左右边框共线；垂直穿过边框一点（投影在另一轴上）不算违规，故两轴分开查。
        m_edge = None
        for pts, ends in self.edges:
            who = f"{ends[0]}→{ends[1]}" if ends else "?"
            for i in range(len(pts) - 1):
                (px, py), (qx, qy) = pts[i], pts[i + 1]
                sx0, sx1 = sorted((px, qx)); sy0, sy1 = sorted((py, qy))
                for x0, y0, bw, bh, lbl in self.lanes:
                    short = f"「{lbl[:22]}」"
                    if abs(qy - py) < LANE_EDGE_EPS:              # 近水平 → 查车道上下边框
                        if min(sx1, x0 + bw) - max(sx0, x0) > 0.01:
                            for by, tag in ((y0, "下"), (y0 + bh, "上")):
                                d = abs(py - by)
                                m_edge = d if m_edge is None else min(m_edge, d)
                                if d < LANE_EDGE_CLEAR:
                                    bad.append(f"连线沿车道{tag}边框: {who} × {short}"
                                               f"（净空 {d*72:.1f} pt < {LANE_EDGE_CLEAR*72:.0f} pt）")
                    elif abs(qx - px) < LANE_EDGE_EPS:            # 近垂直 → 查车道左右边框
                        if min(sy1, y0 + bh) - max(sy0, y0) > 0.01:
                            for bx, tag in ((x0, "左"), (x0 + bw, "右")):
                                d = abs(px - bx)
                                m_edge = d if m_edge is None else min(m_edge, d)
                                if d < LANE_EDGE_CLEAR:
                                    bad.append(f"连线沿车道{tag}边框: {who} × {short}"
                                               f"（净空 {d*72:.1f} pt < {LANE_EDGE_CLEAR*72:.0f} pt）")
        if bad:
            raise AssertionError(f"{name} 布局校验失败:\n  " + "\n  ".join(sorted(set(bad))[:12]))
        tail = f" / {len(self.lanes)} 车道" if self.lanes else ""
        if m_lab is not None:
            tail += f"；车道名↔节点框最小净空 {m_lab*72:.1f} pt"
        if m_edge is not None:
            tail += f"；连线↔车道边框最小净空 {m_edge*72:.1f} pt"
        print(f"  {name}: 校验通过（{len(self.boxes)} 框 / {len(self.texts)} 段文字 / "
              f"{len(self.edges)} 连线{tail}）")
        return {"boxes": len(self.boxes), "texts": len(self.texts), "edges": len(self.edges),
                "lanes": len(self.lanes), "lane_label_clear_in": m_lab, "lane_edge_clear_in": m_edge}

    def save(self, name: str, png: bool = False):
        """写 PDF 并同步到 latex/figures/。png=True 时再导一张 300 dpi PNG
        （deck 侧脚本读的是 latex/figures/<name>.png —— 只出 PDF 会让论文与 deck 变成两个版本）。"""
        LATEX.mkdir(parents=True, exist_ok=True)
        out = HERE / f"{name}.pdf"
        self.fig.savefig(out, format="pdf", bbox_inches="tight", pad_inches=0.02)
        shutil.copy2(out, LATEX / out.name)
        note = "（已同步到 latex/figures/）"
        if png:
            ip = HERE / f"{name}.png"
            self.fig.savefig(ip, format="png", dpi=300, bbox_inches="tight", pad_inches=0.02)
            shutil.copy2(ip, LATEX / ip.name)
            note = "（PDF + PNG 均已同步）"
        plt.close(self.fig)
        print(f"  → {out.name} {note}")


