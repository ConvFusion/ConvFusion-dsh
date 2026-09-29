---
name: Research Presentation Design
category: academic-writing/presentation-design
type: system
status: active
version: 2.0
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

2. **Speak as the researcher presenting completed work, not as a narrator of the process.** The talk answers, in order: under what background the work was done; what problem it solves; what the new method is; how the experiments were designed and what the results prove (that it is effective and novel); and the contributions. Never present the process of doing the research — no "we found a bug in the protocol", no project-internal paper-by-paper narrative, and no meta-statements about the talk itself ("the goal of this talk is to show this is publishable"). The cover slide carries the thesis and the headline result, never the talk's goal.

3. **Order the narrative as background → problem → why existing answers fail → the new method → experimental design and evidence → contributions.** This is the order of a research argument, not a summary of the paper's section order.

4. **One idea per slide, concise.** Text competes with the speaker. Keep the slide to the claim plus the support it needs; express quantities as stat blocks, small tables or callouts, and let figures carry the numbers.

5. **Write in the paper's academic register.** No colloquial or internet-style phrasing (e.g. 修法 "the fix", 买信息 "buy information", 更值钱 "worth more", 死法 "ways to die", 指对 / 说清 "point right / say clearly"): use the paper's own terms (决定性因素是表示而非能力, 投资不足, 目标正确但设计欠指定). When the talk is in Chinese, embed the paper's English term in small italics next to each key Chinese term (表示 *representation*; 推理努力 *reasoning effort*) so the audience can map the slide to the paper.

6. **Attach the setting to every number shown.** Slides get remembered without their caveats, so dataset, baseline and metric must be visible on the slide itself.

7. **State limitations in the talk, in their own slide.** It makes the rest credible and prevents the audience from drawing a stronger conclusion than the evidence supports. **Prepare backup slides from the questions you expect** — the ablation, the failure cases, the alternative baseline. Anticipating the challenge is part of the design.

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

   **Portability.** Embed figures as base64 data URIs so the deck is a single `.html` that opens anywhere offline. Keep an editable source copy with relative `assets/` paths, and a small regeneration script that inlines the images only into the final deliverable (src → embedded workflow).

10. **Verify navigation, do not trust a syntax check.** `node --check` validates syntax but not behaviour; a reference error that fires only when a key is pressed passes syntax and silently breaks the deck — which then shows only its first slide. Test behaviour in jsdom:

    ```js
    const {JSDOM}=require('jsdom');
    const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'file:///'+path});
    const w=dom.window; const press=k=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:k}));
    // assert: initial active index 0; after ArrowRight → 1; after End → last; after Home → 0
    ```

    A deck is done only when this asserts that the active slide index actually changes on a keypress.

    **HTML decks do not auto-convert to .pptx.** Pandoc/decktape mangle the layout; if a native PowerPoint is required, re-author it in python-pptx from the same content rather than converting the HTML.

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

Produce:

- the single argument of the talk, stated in one sentence
- a slide outline following background → problem → gap → method → evidence → contributions
- per-slide content: the claim, its support, the setting for any number, and the paper's English term next to each key Chinese concept
- a limitations slide and backup slides for anticipated questions
- speaker-notes talk script, one per slide, readable aloud
- one self-contained HTML deck (figures embedded) plus its editable source and the regeneration script
- a jsdom navigation check showing that the active-slide index changes on a keypress
