---
name: Research Presentation Design
category: academic-writing/presentation-design
type: system
status: active
version: 2.1
origin: stage5.1/output-transformation
---

# Skill: Research Presentation Design

## Purpose

Turn a research result into a talk that carries one argument and presents the work as a **completed, innovative, publishable contribution** — what background it was done in, what problem it solves, what the new method is, and what the experiments prove — rather than as a recount of how the research was done.

## When to Use

Use this skill when:

- A result must be presented live (conference, group meeting, review).
- An existing paper needs to become a talk for audiences with different backgrounds.
- A result is being questioned and you need to walk an audience through the evidence.

## Prerequisites

Each line is a precondition judged by an artifact signal — this skill is only advisable once the named signal has landed on disk. `/` = any-of; multiple lines = all-of.

```text
requires: experiments/simulation-result | 演讲要有可讲的结果（真实或仿真）
```

## Research Method

1. **Fix the single argument first.** A talk that tries to convey the whole paper conveys nothing. Decide the one thing the audience should remember, then cut everything that does not serve it.

2. **Speak as the researcher presenting completed work, not as a narrator of the process.** The talk answers, in order: under what background the work was done; what problem it solves; what the new method is; how the experiments were designed and what the results prove (that it is effective and novel); and the contributions. Never present the process of doing the research — no "we found a bug in the protocol", no project-internal paper-by-paper narrative, and no meta-statements about the talk itself ("the goal of this talk is to show this is publishable"). The cover carries the **published title of the work, verbatim**, plus authors and venue/date — a peer finds and cites the work by that title, so it must never be replaced or reworded. The thesis line and headline result may sit *under* the title (subtitle), never instead of it; and the cover shows **no quantity without its setting** (benchmark, group, model, metric, n), which in practice means no numbers on the cover at all. It never states the talk's goal.

3. **Order the narrative as background → problem → why existing answers fail → the new method → experimental design and evidence → contributions.** This is the order of a research argument, not a summary of the paper's section order.

4. **One idea per slide, and every content slide is a VISUAL COMPOSITION — never a bullet list.**
   An outline is not a deck. A slide that is a title plus a list of sentences is an outline rendered in HTML: the
   audience scans nothing, remembers nothing, and the speaker is reading. Bind the claim to a structure:

   | Situation on the slide | Visual composition to use |
   |---|---|
   | two or three options compared | comparison matrix (options × criteria, ✓/✗ cells) |
   | a sequence, pipeline or loop | flow with labelled steps and arrows |
   | before/after, cause/effect, model vs harness | two-panel split with a single connecting channel |
   | a failure, a trajectory, a distribution | figure generated from the result files, with annotated markers |
   | one headline quantity | stat block that states the quantity, its setting and n in the same block |
   | a taxonomy or class system | card grid, one card per class, each with the invariant it enforces |
   | what a claim does *not* cover | two-column table: claim vs its boundary |
   | dense reference material | table, not prose |

   Labels inside these structures are short (≤ ~8 words); quantities sit in stat blocks, tables or callouts; figures
   carry the numbers. A slide whose only structure is a `<ul>` of full sentences fails this rule and must be rebuilt.
   Where a conceptual diagram is needed and no result figure exists, generate one by script into the deck's figures
   directory (same discipline as the result figures), rather than hand-placing prose boxes.

5. **Write in the paper's academic register.** No colloquial or internet-style phrasing (e.g. 修法 "the fix", 买信息 "buy information", 更值钱 "worth more", 死法 "ways to die", 指对 / 说清 "point right / say clearly"): use the paper's own terms (决定性因素是表示而非能力, 投资不足, 目标正确但设计欠指定). When the talk is in Chinese, embed the paper's English term in small italics next to each key Chinese term (表示 *representation*; 推理努力 *reasoning effort*) so the audience can map the slide to the paper.

6. **Attach the setting to every number shown.** Slides get remembered without their caveats, so dataset, baseline and metric must be visible on the slide itself.

7. **State limitations in the talk, in their own slide.** It makes the rest credible and prevents the audience from drawing a stronger conclusion than the evidence supports.

   **Anticipate the questions you expect — the ablation, the failure cases, the alternative baseline — but decide
   deliberately where that material lives**, because venues and teams differ: (a) fold it into the main flow as a normal
   slide with a claim-style title; (b) compress it into an existing slide's bullets or stat blocks; (c) keep it in the
   speaker notes; or (d) put it in a clearly separated appendix section, *only if the venue and the presenting team allow
   appendix pages* — many talks are better without them, and a team may forbid them outright. What is not acceptable is
   neither anticipating the challenge nor placing it anywhere.

8. **Write the talk script.** Each slide carries speaker notes that are actual spoken lines — academic register, researcher voice, directly readable aloud — not meta-comments about the slide ("this slide shows…").

9. **Build the deck as a self-contained HTML file** — no build step, opens anywhere offline; style is free (light or dark, dense or sparse, chosen per paper; the skeleton is style-agnostic). Use the proven skeleton below.

   **Layout — viewport-relative, never a scaled fixed canvas.**

   ```css
   .deck{position:relative; width:100vw; height:100vh}
   .slide{position:absolute; inset:0; display:none; flex-direction:column;
     padding:5.2vh 6vw 8vh; overflow:auto}          /* overflow:auto ⇒ a dense slide scrolls, never breaks navigation */
   .slide.active{display:flex; animation:fade .28s ease}
   @keyframes fade{from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none}}
   ```

   Do **not** use a fixed `1280×720` canvas plus `transform: scale()` to fit the window. That approach has a fatal failure mode: the scale/navigation JS is the only thing that makes slides after the first one visible, so a single runtime error in it (a typo'd variable, a null element) leaves the deck showing only the first slide — the one with hard-coded `active` — while every keypress throws and nothing happens. Viewport-relative units make the layout correct with zero JS, and `overflow:auto` means a slide that is too dense scrolls instead of swallowing the rest of the talk.

   **Navigation JS (proven, ~20 lines).** Keep it this simple; every feature added is a chance to break the one thing the deck must do — turn the page.

   ```js
   (function(){
     var slides=[].slice.call(document.querySelectorAll('.slide'));
     var i=0, total=slides.length;
     var page=document.getElementById('page'), bar=document.getElementById('bar');
     function render(){
       slides.forEach(function(sl,k){ sl.classList.toggle('active', k===i); });
       page.textContent=(i+1)+' / '+total;
       bar.style.width=((i+1)/total*100)+'%';
       var a=document.querySelector('.slide.active');
       if(a){ a.scrollTop=0; if(location.hash!=='#p'+(i+1)) location.hash='p'+(i+1); }
     }
     function go(d){ i=Math.max(0,Math.min(total-1,i+d)); render(); }
     document.addEventListener('keydown',function(e){
       var k=e.key;
       if(['ArrowRight','ArrowDown',' ','PageDown','Enter'].includes(k)){ e.preventDefault(); go(1); }
       else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(k)){ e.preventDefault(); go(-1); }
       else if(k==='Home'){ i=0; render(); }
       else if(k==='End'){ i=total-1; render(); }
     });
     document.addEventListener('click',function(e){
       if(e.target.closest('a,pre,code,table,.hud,.hint')) return;
       go(e.clientX < window.innerWidth*0.3 ? -1 : 1);     /* left 30% = back, rest = forward */
     });
     var h=(location.hash.match(/^#p(\d+)$/)||[])[1];        /* deep-link: deck.html#p7 */
     if(h) i=Math.min(total-1,Math.max(0,parseInt(h,10)-1));
     render();
   })();
   ```

   **HUD** (fixed bottom-right) and hint (fixed bottom-left):

   ```html
   <div class="hint">← → / 空格 翻页 · 点击翻页 · N 讲稿 · F 全屏</div>
   <div class="hud"><span id="page">1 / N</span><span class="bar"><i id="bar"></i></span></div>
   ```

   **Portability.** Embed figures as base64 data URIs so the deck is a single `.html` that opens anywhere offline — and embed **raster images only (PNG)**: an `<img src="data:application/pdf;base64,…">` does **not** render in browsers, so a PDF figure silently disappears from the talk. Convert first (e.g. render the PDF page to PNG at ≥150 dpi) and check that `deck.html` contains as many `data:image` URIs as it has figures and **zero** `data:application/pdf`. Keep an editable source copy with relative `assets/` paths, and a small regeneration script that inlines the images only into the final deliverable (src → embedded workflow).

10. **Verify navigation behaviourally, do not trust a syntax check — and do not assume jsdom exists.** `node --check` validates syntax but not behaviour; a reference error that fires only when a key is pressed passes syntax and silently breaks the deck — which then shows only its first slide. The requirement is behavioural: **execute the deck's own navigation script and assert that the active-slide index actually changes on a keypress** (initial 0; ArrowRight → 1; End → last; Home → 0; ArrowLeft clamps at 0; exactly one `.slide.active` at all times). Implement it with whatever is available, in this order of preference: (a) jsdom, if it resolves from the repository:

    ```js
    const {JSDOM}=require('jsdom');
    const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'file:///'+path});
    const w=dom.window; const press=k=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:k}));
    // assert: initial active index 0; after ArrowRight → 1; after End → last; after Home → 0
    ```

    (b) if jsdom is **not** installed (a bare checkout: `require.resolve('jsdom')` throws), do **not** skip the check —
    drive the extracted `<script>` against a minimal DOM stub you write yourself (elements with `classList`, `style`,
    `textContent`, `scrollTop`, `querySelector(All)`, `getElementById`, an event listener registry, `location.hash`,
    `window.innerWidth`, and a `KeyboardEvent` shim), then dispatch the same key events and assert the same facts. State
    in the report which of (a)/(b) you used. A deck is done only when this asserts that the active slide index actually
    changes on a keypress — a text-scan for `function go(` is not a check.

    **HTML decks do not auto-convert to .pptx.** Pandoc/decktape mangle the layout; if a native PowerPoint is required, re-author it in python-pptx from the same content rather than converting the HTML.

11. **Audit the numbers and the time, with scripts — not by eye.** Two checks belong to the deck, not to the speaker:

    * **Number provenance.** Every *visible* number must resolve to a result file, a generated asset, a citation record or an explicit whitelisted definition. Write a small audit script that extracts the numbers from the built deck and prints the ones it cannot source **together with their page numbers**; add a page to the deck only after it passes. A deck is not finished while a single visible number is unsourced.
    * **Timing.** Fix a spoken budget per section (talk length minus Q&A) and count the words of the speaker notes per section; report the measured total and a sensitivity line at 125–150 words per minute. A deck that is 25% over budget is not a finished deck — cut slides or shorten notes, and say which.

12. **Give the deck a Contents page.** After the cover, one page that states the route (sections) **and carries the hook numbers** the audience should remember. A peer audience needs to know where the argument is going, and the hooks are what they will quote back to you.

## Reasoning Guidance

Focus on:

- What the audience already believes, and what must be shifted.
- Which single result is most convincing, and what setup it needs to be understood.
- Where the audience is likely to disbelieve, and which slide answers it.
- What can be removed without weakening the argument.
- Which phrases would sound colloquial to a reviewer, and their academic equivalents.

Avoid:

- Reproducing the paper's structure slide by slide.
- Narrating how the research was done instead of what it establishes.
- Showing numbers without their setting.
- Unbounded claims in headlines — the caveat is never remembered with the claim.
- Dense slides that the speaker then reads aloud.
- Meta-statements about the talk itself on the cover or anywhere else.

## Evidence Requirements

Numbers shown must be traceable to evidence items; cite the evidence id on the slide or in the notes. Any comparison shown must state its setting on the same slide. When a deck carries figures, they must be the paper's actual figures or plots generated from the same result files — never hand-typed numbers.

## Expected Output

Two artefacts, in this order — **do not hand in the first as if it were the second**:

**(A) The outline — a planning artefact, not a deck.**
- the single argument of the talk, stated in one sentence
- the slide sequence following background → problem → gap → method → evidence → contributions
- per slide: the claim, its support, the setting of any number, and the paper's English term next to each key Chinese concept

**(B) The deck — the designed deliverable, in which each outline entry is realised as a visual composition.**
- cover with the published title verbatim, authors and venue (no numbers without setting)
- a Contents page stating the route and the hook numbers
- every content slide composed as matrix / flow / split panel / generated figure with annotations / card grid / stat block / two-column boundary table — labels short, no slide that is only a bullet list
- a limitations slide, and the anticipated-question material placed deliberately (main flow, existing slide, notes, or an appendix **only where the venue and team allow it**)
- speaker-notes talk script, one per slide, readable aloud
- one self-contained HTML deck (raster figures embedded) plus its editable source and the regeneration script
- the navigation check of item 10 (behavioural; jsdom if available, otherwise a self-written DOM stub) showing that the active-slide index changes on a keypress
- the number-provenance audit (unsourced numbers listed with their page numbers) and the timing audit (measured minutes plus a 125–150 wpm sensitivity line)
