---
name: Paper Diagrams
category: academic-writing/paper-diagrams
type: system
status: active
version: 1.0
origin: v0.5.5 dev-note (C08P07 paper-diagrams)
---

# Skill: Paper Diagrams

## Purpose

Generate structured, publication-oriented figures from research content by describing them, never by drawing them.

Two renderers ship with the plugin and **the skill is responsible for picking the right one** (see [Which tool](#which-tool)): `research_schematic` writes the lab's fixed-style schematic, `research_diagram` renders a Diagram IR. Both keep the same division of labour, and it must not be blurred:

> The agent decides **what to draw and why**; a declarative description fixes **which boxes and connections exist**; the renderer decides **how it is drawn**.

The agent never writes SVG, XML, HTML, CSS or matplotlib for a figure. It describes the figure and renders it.

## When to Use

Use this skill when:

- A method, model architecture, module structure, pipeline, system or data flow needs a figure for the paper.
- `visual-evidence-selection` has decided that a figure is warranted and what it must communicate, but the figure does not exist yet.
- An existing figure must be edited in natural language ("move Feature Fusion under Backbone", "split this module into three") instead of redrawn.

Do **not** use this skill for:

- deciding whether a figure belongs in the paper (that is `visual-evidence-selection`);
- statistical charts — training curves, bar charts, scatter plots of results (produce those from the result files with a plotting script, so the numbers have one source of truth);
- artistic or illustrative scientific imagery;
- slide decks (that is `presentation-design`);
- editing the manuscript text (that is `manuscript-revision`).

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: method-plan | 图要画的是已经定下来的方法／系统结构，不是还在讨论的设想
```

## Research Method

1. **State what the figure must communicate, in one sentence, before choosing anything else.** A figure that has no sentence is decoration; if the sentence cannot be written, the figure is not ready to be drawn.
2. **Read the sources first**: the Research State (question / method / experiments / evidence / decisions), the active paper's `paper.md`, and the user's own description. These are the only admissible origins for figure content.
3. **Choose the tool from the sentence, then the type** — read [Which tool](#which-tool) first: `research_schematic` for an ordinary boxes-and-arrows figure, `research_diagram` when the sentence is about *order*, *state*, or *which claim the figure carries*. Only then pick the shape (method overview, architecture, workflow, sequence, lifecycle, …).
4. **Select the minimum set of entities and relations that carries the sentence.** Every box must be traceable to at least one source (Research State, manuscript, user description, equation or method definition). Do not add visual elements merely to make the figure look richer.
5. **Describe the figure and render it with that tool.** Do not attempt to draw it yourself.
6. **Read the validation diagnostics** and repair only what they report — a structural repair (add the module the paper actually defines, merge duplicates, put the nodes in the group they belong to), never a cosmetic one.
7. **Check the figure against the manuscript**: terminology, module set, direction of flow and symbol names must match the text exactly. A figure that renames a module is a defect, not a stylistic choice.
8. **Record the figure as an artifact**: the `.json` IR is the editable source; the `.svg` is a build product. A later natural-language edit modifies the IR, never a fresh redraw.

## Reasoning Guidance

### What makes a figure work

A paper figure is read in seconds by a reader who has not read the text. It works when it answers, without words, the question the surrounding paragraph raises — typically "what are the parts and how do they connect?" — and it fails when the reader must reconstruct the text to decode it.

### Minimum sufficient representation

The characteristic failure of an LLM-drawn method figure is **invented intermediate stages**: `AI Module`, `Advanced Processing`, `Optimization`, `Smart Decision`, `Fusion Layer` where the paper defines none. These read as plausible and are false: the reader will look for them in the text and not find them. If a stage is needed to make the figure read as a flow, the paper is missing a definition — report that, do not draw it.

The reverse failure is the **complete dump**: every component, every tensor shape, every loss term on one canvas. Prefer the figure the text needs. Sub-module detail belongs in its own module-structure figure.

### Graph shape drives legibility

Read the IR as a graph before drawing it:

- A chain has one reading direction and needs no groups.
- A diamond (branch → fuse) reads only if the branches leave the same layer and the fusion node is centred below/right of both.
- A residual or feedback edge is the one case where a backward arrow is correct; it should be visually distinct (`residual` / `feedback` edge style) or the reader will read the diagram as cyclic.
- A group is a claim about the paper's structure ("these two blocks form the Encoder"), so group membership must come from the method definition, not from visual tidiness.

### Layering and direction

Flow direction follows the method: left-to-right for pipelines and architecture diagrams, top-to-bottom for workflows and processes, whichever for data flow. Chopping and changing direction within one figure makes it unreadable — set `layout.direction` once, for the whole figure.

### One group, one lane

Layers are the same for every node, but a group that spans several layers would otherwise get a bounding box that also encloses unrelated nodes sitting in those layers — the reader could not tell which boxes belong to the group. So each group **owns a horizontal lane**: its members are placed inside that lane, and non-members are placed outside it, at every layer. Nested groups get lanes inside their parent's lane.

The consequence for you: **a group is a claim about the figure's layout, not just a label.** Putting a node in a group moves it into that group's lane. Lanes are ordered by where their members are first declared, so reordering the `nodes` array also reorders the lanes.

### Determinism is a feature of the skill, not of the renderer only

The same IR must draw the same figure tomorrow, on another machine. That is what makes the figure an editable, version-controlled research asset. It is also why the IR must not carry pixel coordinates: coordinates make the artifact fragile and hide the layout decisions that the renderer should make consistently.

### Repair discipline

Validation errors are structural facts about the IR, not opinions. Repair them by changing the structure (which nodes exist, which group they belong to, what connects to what). Do not repair by nudging — the IR has no nudging. If a diagnostic cannot be satisfied without inventing content the paper does not contain, stop and report the gap instead of satisfying the validator.

The loop is bounded: at most `max_repair_rounds = 3` regenerate-validate cycles. After that, keep the last valid figure and report what remains unresolved rather than emitting a broken one.

## Evidence Requirements

- **Every node must trace to a source** — a section, an equation, a method definition or the user's explicit description. Record it in the node's `evidence` field where the source is identifiable; an untraceable node is an invention and must be removed.
- **No invented modules.** The node set is bounded by the module set the method defines.
- **Terminology consistency**: node, group and edge labels must use the manuscript's wording for the same concept. Renaming a module in the figure silently diverges the paper from its own figure.
- **Direction consistency**: the figure's flow must agree with the method's stated order (e.g. `Input → Encoder → Decoder → Output` may not be drawn as `Input → Decoder → Encoder → Output`).
- **Equation consistency**: when a node corresponds to a quantity in an equation, use that symbol.
- Diagnostics from the validator are evidence about the figure: a render is not "done" because a file was written, but because validation passed and the SVG exists.

## Expected Output

Produce:

- the one-sentence statement of what the figure communicates
- **which renderer you used and why that one** — `research_schematic` for the ordinary boxes-and-arrows figure, `research_diagram` when the sentence is about order, state, or which claim the figure carries
- the shape you chose and why it fits the sentence
- the figure's **description, kept with it** — the Diagram IR for `research_diagram`; for `research_schematic`, the node/edge spec you fed the renderer. A figure whose description is lost can only be redrawn from scratch, which is how two versions of the same figure end up disagreeing
- the artifact in the paper's `figures/` directory: a `.pdf` from the schematic renderer, or `.json` IR + `.svg` + exported `.pdf` from the diagram renderer
- the measured on-page text size and whether the figure is legible **at the width it will be placed at** (one column and two columns are different figures)
- the validation report: `valid`, plus every remaining error or warning and what was done about it
- the list of contents deliberately left out of the figure, with the reason (detail moved to a second figure, a table, or the text)
- any place where the paper does not define something the figure needed — reported as a gap in the paper, not silently drawn

## Which tool

Two renderers ship with the plugin. They are **not** interchangeable, and **one paper uses one of them**: the two styles are visibly different, so a paper assembled from both reads as though it came from two hands.

| | `research_schematic` | `research_diagram` |
|---|---|---|
| **style** | the lab's **fixed** style — white box, near-black border, bold title + grey line — so figures from different workspaces still look like one project's | your own style tokens, chosen per figure |
| **you author** | boxes on a grid (`col` / `row`) or placed in inches inside lane containers (`x`, `width`, `lane`), plus **explicit routes** (`auto` / `v` / `down` / `back` / `over` / `rowgap` / `outer` / `points`) | a Diagram IR: nodes / groups / edges, routed by the renderer |
| **it verifies** | text inside its box · no text-on-text · no box-on-box · no edge through a non-endpoint box · lane clearances | endpoint piling · edges drawn on top of each other · an edge crossing a foreign container · label clearance · claim refs that do not exist |
| **it cannot express** | a message timeline · a state machine with self-transitions · claim/evidence binding · cards | — |
| **output** | `figures/<name>.pdf` (vector, directly usable by LaTeX) | `figures/<name>.{json,svg}` + an exported `.pdf` |

**Default to `research_schematic`.** For the ordinary publication figure — boxes and arrows — it gives you the lab's one style *and* it verifies the geometry before the figure is delivered, which is precisely what a figure needs and what a hand-tuned layout quietly gets wrong (overlapping text, an edge through a box, a label sitting on another label).

**Switch to `research_diagram`** when the figure says something the grid-and-lane model has no way to say:

- a **message timeline** (`type: "sequence"`) — the information is *who says what to whom, in what order*, and in a layered figure "step 3" does not exist;
- a **state machine** (`type: "lifecycle"`) — states and transitions, including a state that re-enters itself;
- a figure whose boxes must be **bound to the paper's claims** (`refs`, e.g. `["C1","E008"]`) or that must carry **secondary points in cards** — see [A figure carries an argument](#a-figure-carries-an-argument-not-a-shape).

Neither tool draws statistical charts (bar / line / scatter). Those come from a script that reads the result files, so the numbers have one source of truth.

## Tool Contract

### `research_schematic` — the lab's fixed style

One call renders one `.pdf`; there is no IR to keep in sync.

| Input | Meaning |
|---|---|
| `nodes[]` | boxes in reading order: `label` (bold), `desc` (grey), `role` = normal / accent / reject, and placement — `col`/`row` on the grid, or `lane` + `x`/`width` in lane mode |
| `lanes[]` | optional lane containers (`{id, label}`): the lane rectangle and the canvas height are computed from the measured size of their member boxes, so never pass coordinates |
| `edges[]` | connections with an explicit `route`: `auto` / `v` / `down` / `back` / `over` / `around` / `lshape` / `leftup` / `left` / `rowgap` / `outer` / `points`. See the return-edge note below — the choice matters and the wrong one is rejected with an error naming a box |
| `cols` / `rows` | column and row centres as fractions of the inner width / height |
| `size` | canvas in inches (default `[3.45, 1.9]`, aspect 1.8) |
| `note` | one grey line under the flow |
| `columnWidthPt` | the width the figure will be drawn at (252 single column / 516 full width); decides the reported `legible` flag |

A worked swimlane example ships with the plugin at `assets/figures_kit/examples/lanes_feedback.json` — read it before writing your first lane figure.

**Text the default font cannot draw is dropped silently.** The kit renders with DejaVuSans, which has no CJK coverage: Chinese/Japanese/Korean labels disappear from the PDF with **no warning and no tofu box**, leaving blank space in the figure. Match the language of the manuscript (English for an English paper). Check the produced PDF's extracted text, not just `ok: true` — the geometry checks pass either way.

**A lane figure takes `cols` and must NOT take `rows`.** The renderer has two modes, and the presence of `rows` picks between them:

- **mode A (no `rows`) — the lane figure.** Each lane is a row; member boxes get their y from the lane, so give `col` (or `x`/`width`) and omit `row` entirely. Non-member boxes form the bottom belt.
- **mode B (`rows` present) — a grid figure with lane containers.** All boxes are placed by `cols`/`rows`, and `lanes[]` is only drawn *around* its members. This suits a figure like a central guarded band with boxes on both sides — not a swimlane.

Passing `rows` to a lane figure silently switches it to mode B, so boxes in different lanes that share a `col`/`row` land on the same coordinate; the geometry check then reports *text/box overlap*, which points at the wrong cause. **If a lane figure reports overlapping boxes, first check whether `rows` was passed.** (Triggered for real on 2026-10-16: four failed attempts, and the figure had to be drawn with the other renderer instead.)

**A cross-lane feedback edge needs `around`, not `outer`.** `route: outer` runs along the outside of the *whole lane stack* and returns along the top belt, so an edge from a lower lane back to an upper one crosses the boxes of every lane in between, and the geometry check rejects it by naming the box it hit. To close a loop from a box in one lane back to a box in another, use `route: around` (also `lshape` or `leftup` for same-lane returns): it exits the side, runs outside the lane stack, and re-enters the target lane's side. Verified on 2026-10-16 — `outer` was rejected on a two-lane figure, `around` rendered and passed on the same spec. The outer corridor needs room in the margin (0.30 in was enough for a full-width two-lane figure), otherwise the error is `回边外侧净空不足`.

**Every edge must be horizontal or vertical, and `route: "v"` only works in-column.** `route: "v"` connects box A's bottom to box B's top, but it draws between the two boxes' **centre x** — so if the boxes do not overlap horizontally the result is a **diagonal** that starts and ends exactly on the box borders. That diagonal passes every endpoint-anchored check while looking like the line leaves the box. So: same-row neighbours use the default horizontal connection; a cross-lane trunk is `v` **only** when the two boxes share a column, which usually means reordering one lane (a right-to-left lane reads fine and puts the entry box under its predecessor). Check the produced figure, not just `ok: true`: pick a few segments and confirm Δx = 0 or Δy = 0.

**Keep it wide and short** (aspect ≥ 1.8): the figure is scaled by column width / canvas width, so a wide canvas makes the text unreadable. The result reports `effectiveNodePt` and `legible`; a wide schematic is normally a **full-width** float, and the same figure that fails at one column can pass at two.

### `research_diagram` — a Diagram IR you control

| Action | Purpose |
|---|---|
| `create` | Write an IR to the workspace (and optionally render it in the same call) |
| `validate` | IR → structured diagnostics, no rendering |
| `render` | IR → SVG; refuses to overwrite a good figure when the IR is invalid |
| `export` | SVG → vector PDF for LaTeX, and report the figure's on-page text size |
| `list` | List diagram artifacts already in the paper's `figures/` directory |
| `read` | Read one IR back, for an incremental edit |

The IR is JSON. Its shape (see the tool description for the live schema):

```json
{
  "version": "1.0",
  "type": "method-overview",
  "title": "Overall Framework",
  "layout": { "direction": "LR", "algorithm": "hierarchical" },
  "nodes": [
    { "id": "input", "type": "input", "label": "Input" },
    { "id": "encoder", "type": "module", "label": "Encoder" },
    { "id": "head", "type": "output", "label": "Prediction" }
  ],
  "groups": [ { "id": "enc", "label": "Encoder", "children": ["encoder"] } ],
  "edges": [
    { "id": "e1", "source": "input", "target": "encoder", "type": "data-flow" },
    { "id": "e2", "source": "encoder", "target": "head", "type": "data-flow" }
  ]
}
```

Rules the schema enforces:

- `nodes[].type` ∈ module / input / output / data / process / decision / model / loss / result / external — these describe the **role in the figure**, never a specific method.
- `groups[].children` hold node or group ids; nesting is allowed up to two levels.
- `edges[].type` ∈ data-flow / control-flow / dependency / association / residual / feedback.
- `edges[].style`, node `style` and group `style` may only name built-in style tokens (default, module, input, output, data, model, process, decision, loss, container, highlight). There is no free-form styling; that is what keeps figures in one paper visually consistent.
- No `x` / `y` fields. Layout is the renderer's job.
- `refs` (optional, on a node / group / edge / card) binds the element to the **paper assets it carries**, e.g. `["C1","E008"]`. Ids are checked against the research record: a ref that is not a recorded claim or evidence is an error (`UNKNOWN_REF`).
- `cards` (optional, top level): `[{"title","body?","refs?"}]`, rendered in a panel **outside** the flow.
- `show_descriptions` (top level) and `layout.layer_gap` (12–120) are the two **content-and-density** switches; see below.

### A figure carries an argument, not a shape

The reason a paper has a figure at all is that some part of the argument is easier to see than to read. A picture of the pipeline — boxes and labelled arrows — carries the *process*, which the prose already states. What it can carry and the prose usually cannot is **which part of the argument each element is doing work for**.

`refs` is that link. Put on the box that implements a mechanism the claim it supports, on the edge that measures something the claim about measuring it, and on a `card` the supporting detail. The validator checks the ids against the workspace, so a figure cannot cite a claim that does not exist — a dead citation on a figure is worse than no citation, because the reader goes looking for it.

Two habits follow from this:

- **If you are about to add an edge or a node to say one more thing, write a `card` instead.** A card sits outside the flow, cannot create a routing problem, and does not make the graph denser. The flow should show the process; the cards should carry the points. Moving per-node `description` text into cards is usually the right trade: it keeps the boxes small enough to stay legible when the figure is scaled into a column.
- **Read the diagnostics as a work list, not as errors.** `UNKNOWN_REF` means the figure claims something the record does not have. `LABEL_OVERLAP` means a label could not be placed anywhere without covering a box — the label is too long for the space, so shorten it or give the layout more room. `EDGE_OVERLAP` means two edges are drawn on top of each other and read as one line.

### When a figure has to carry a lot

`nodes[].description` is a second line of text inside a box. It is for the sub-parts a node really has ("text / set / trajectory encoders"), or the condition a branch fires under ("confidence ≥ θ") — the kind of detail that belongs in the figure, not only in the caption.

Descriptions are **off by default**, because a figure whose every node also carries a paragraph is a figure nobody reads. Turn them on (`show_descriptions: true` in the IR) when the boxes genuinely have two levels. The switch lives in the IR, so re-rendering the same IR gives the same figure.

A faithful figure of a long process gets tall. The drawn width is fixed by the column, so a tall figure is scaled down and its text shrinks with it — the height budget **is** a text-legibility budget. `layout.layer_gap` is the lever: the default 64 units suits short figures, while a figure of eight or more layers usually needs 16–32 to stay above 7 pt once scaled into a column. Lower the gap rather than dropping content, and check `effectiveNodePt` after `export`.

### The diagram type is a contract, not a label

Three contracts are implemented, and they are not interchangeable — picking the wrong one produces a figure that merely *looks* like the thing you meant:

| type | what it draws | use when the point is |
|---|---|---|
| `method-overview`, `architecture`, `module-structure`, `system-architecture`, `data-flow`, `component-relationship`, `workflow` | the layered flow: nodes in layers, routed edges | **what depends on what** |
| `sequence` | participants as columns, messages top-to-bottom in **declaration order** | **who says what to whom, in what order** |
| `lifecycle` | states and transitions, self-transitions drawn as loops, initial/final markers from the `input` / `output` node roles | **which states the system moves between, and on what event** |

Two consequences that surprise people:

- **In a layered figure, "step 3" does not exist.** Layer ordering encodes dependency, and the renderer is free to place independent nodes in any order within a layer. If the order *is* the message, use `sequence` — its vertical axis is declaration order and nothing else.
- **Self-transitions are legal.** A state that re-enters itself is a loop, not an error; and a cycle in a `lifecycle` figure is the normal case, so the renderer does not warn about it there.

Two things the renderer does not do, so do not assume them:

- A group that spans several layers **while other nodes sit in those same layers** is given its own lane, and the flow zigzags to reach it. For a figure that should read as one straight flow, do not group nodes that share layers with ungrouped ones.
- Nested groups reserve their label bands separately, so deep nesting consumes vertical space fast. Two levels is the documented limit; beyond that, use two figures.

If a figure still cannot be made legible, the fix is to **split it** — a process overview plus a separate module-structure figure — not to shrink the type until it disappears.

Diagnostics are structured, not prose:

```json
{ "valid": false,
  "errors": [ { "code": "MISSING_TARGET", "severity": "error", "element": "edge-2",
                "message": "Edge edge-2 targets unknown id 'fussion'",
                "hint": "did you mean 'fusion'?" } ],
  "warnings": [] }
```

Repair from the `code` and `hint`, not from the message wording.

## Getting the figure into the paper

LaTeX cannot include an SVG, so the last step is `export`: it converts the rendered SVG into a **vector PDF** (fonts embedded, text still selectable) and writes it next to the SVG as `<name>.pdf`. Reference it from the manuscript as `figures/<name>.pdf` and let `submission-compile-and-format` handle the float.

`export` also answers the question that decides whether the figure is usable at all: **how big will the text be in the paper?** Pass where the figure will be drawn — `column_width_pt: 252` for a single IEEE column, `516` for a full-width figure — and read the result:

- `effectiveNodePt` — the on-page size of the node labels;
- `legible` — false below 7 pt, which is roughly the smallest text a reader can be asked to read in print;
- `maxCanvasUnitsFor7pt` — how wide the canvas may be for that column.

The arithmetic is unforgiving: a figure is scaled by `column width / canvas width`, so a 1500-unit-wide canvas drawn in one 252 pt column renders 13 pt labels at about 2 pt. **A figure that is too wide cannot be fixed by exporting it in a better format — it has to get narrower.** When `legible` is false, do one of these, in order of preference:

1. split it — a method overview plus a separate module-structure figure;
2. drop detail that the text already carries (the minimum-sufficient-representation rule again);
3. give it the full text width (`column_width_pt: 516`) and make it wide and short rather than long;
4. only then, accept smaller text.

Check `legible` before you tell the user the figure is done. A figure that renders correctly and reads at 3 pt is not a finished figure.

Export needs a Python interpreter with PyMuPDF; if the tool reports it cannot find one, report that to the user rather than converting the SVG by hand with some other tool — a different converter produces a different figure from the same IR, which is exactly what the IR exists to prevent.

## Notes on Scope

This skill does **not** draw statistical charts, mind maps, or 3D diagrams. A chart's numbers must come from a script that reads the result files, so that they have one source of truth; a figure drawn by hand from numbers copied out of a table is a second, silently diverging source.

Both renderers do produce what LaTeX needs: `research_schematic` writes a vector `.pdf` directly, and `research_diagram` exports its SVG to a vector PDF with the `export` action. **Never** convert a figure with an arbitrary tool (a screenshot, an online converter, `img2pdf`): SVG-to-PDF conversion that loses the embedded fonts produces a figure that looks right locally and prints wrong.
