# YT Tracker — Phase 2 Spec: Depth, Motion & Pro Features

> Save as `UI_POLISH_SPEC.md`. Instruction to the agent: *"The structure from Phase 1 is approved — do NOT change IA, routes, or data flow. This spec adds visual depth, a motion system, chart interactivity, and pro-grade UX on top. Vanilla JS/CSS only, no new dependencies, zero extra YouTube API calls. Implement phases in order, run QA at the end."*

---

## 1. Audit — why it still reads "basic/empty" (mapped to your screenshots)

**Global**
1. Flat pure-black canvas. Phase-1 tokens give cards a fill but the page has **no ambient depth** (no gradients, no glow, no layered surfaces) → everything floats on a void.
2. **Zero motion**: no entrance stagger, no hover lift, no chart draw-in, no count-ups, no animated tab indicator. Static = "template".
3. No chart interactivity — bars/sparks have no tooltips, no hover states.

**Dashboard (shot 1)**
4. "Top Competitors Comparison" chart floats in a tall card: bars occupy ~40% of card height, dead space below; only 4 bars in a very wide plot (no band-fill, no gridlines, no median marker).
5. "Automated Insights" card: 4 bullets then a void. Needs fill (more insight types + footer stat row).
6. Strip: `TOTAL VIEWS • 0.0%` is a meaningless delta chip; gap between Engagement tile and Deep Dive button (tiles don't stretch); sparkline has no area fill/gradient/draw-in.
7. Rank ladder rows are plain text — no hue dots, no proportional bars, no hover affordance.

**My Channels (shot 2)**
8. **`loading spark…` gray text + red `—` engagement on every competitor row** reads as *broken*, not loading. Red must never mean "missing". Needs real shimmer skeletons, neutral missing-state, retry on fail, and a persisted enrich cache so revisits paint instantly.
9. Page has a header → list → void. No summary stats, no bottom ghost "add" card, rows have no visible hover actions, no 30-day delta pills.

**Dashboard lower (shot 3)**
10. Velocity card: chart top-half only, **~45% of the card is empty** below the legend; 8-series legend is a noisy 2-line dot soup; bars are hairline-thin with no hover.
11. Face-off: rank badges are flat circles; no comparative bars; right card height doesn't balance left.
12. Recent uploads: raw clipped card at right edge, native-ish scrollbar, no hover zoom, no scroll affordances (fade/arrows/snap).

---

## 2. Depth & Atmosphere System (CSS)

### 2.1 Ambient canvas (kills the void)
```css
body{background:
  radial-gradient(1100px 520px at 88% -12%, rgba(34,211,238,.08), transparent 60%),
  radial-gradient(900px 480px at -12% 108%, rgba(245,197,66,.06), transparent 60%),
  radial-gradient(700px 400px at 50% 120%, rgba(56,189,248,.04), transparent 60%),
  var(--bg-0);}
body::before{ /* faint masked grid, top-anchored */
  content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.35;
  background:linear-gradient(var(--line-1) 1px,transparent 1px),
             linear-gradient(90deg,var(--line-1) 1px,transparent 1px);
  background-size:44px 44px;
  -webkit-mask-image:radial-gradient(ellipse 80% 55% at 50% 0%,#000,transparent 75%);
          mask-image:radial-gradient(ellipse 80% 55% at 50% 0%,#000,transparent 75%);}
```

### 2.2 Card depth (layered, not flat)
```css
.card{background:linear-gradient(180deg, color-mix(in srgb,var(--bg-2) 92%, #fff 2%), var(--bg-2) 30%, color-mix(in srgb,var(--bg-2) 85%, #000));
  border:1px solid var(--line-1);
  box-shadow:0 8px 28px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.035);}
.card-h{transition:transform var(--d-2) var(--e-out), border-color var(--d-2), box-shadow var(--d-2);}
.card-h:hover{transform:translateY(-2px);border-color:var(--line-2);
  box-shadow:0 14px 40px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05);}
```
Section headers get a 26px `.ic-tile` (tinted cyan) + title + right-aligned meta text — uniform on **every** card.

### 2.3 Motion tokens & reveal
```css
:root{--e-out:cubic-bezier(.22,1,.36,1); --e-spring:cubic-bezier(.34,1.56,.64,1);
 --d-1:.12s; --d-2:.24s; --d-3:.5s; --d-4:.9s;}
.rev{opacity:0;transform:translateY(14px);
 transition:opacity var(--d-3) var(--e-out), transform var(--d-3) var(--e-out);
 transition-delay:calc(var(--i,0)*45ms);}
.rev.in{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rev{opacity:1;transform:none}}
```
Rule: **only animate `transform` + `opacity`**. Everything below the fold reveals via one shared `IntersectionObserver` (threshold .12, then unobserve).

### 2.4 Skeleton system (replaces all "loading…" text)
```css
.skel{border-radius:6px;background:linear-gradient(90deg,var(--bg-3) 25%,#223140 37%,var(--bg-3) 63%);
 background-size:400% 100%;animation:shim 1.1s linear infinite;}
@keyframes shim{from{background-position:100% 0}to{background-position:-100% 0}}
```
Missing data = **neutral** `—` in `var(--t3)` (never red). Error = `—` + tiny `refresh` icon-btn with `data-tip="Retry"`.

---

## 3. The "Pro Kit" (new JS helpers — one `AnimKit` section in app.js)

```js
/* 1 count-up for every KPI value */
const countUp=(el,to,fmt=fmtN,dur=700)=>{const t0=performance.now();
 const step=t=>{const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);
 el.textContent=fmt(to*e);if(p<1)requestAnimationFrame(step);};requestAnimationFrame(step);};

/* 2 FLIP reorder (ladder re-sort, leaderboard sort, metric switch) */
function flip(list,mutate){const a=[...list.children],pos=new Map(a.map(e=>[e,e.getBoundingClientRect().top]));
 mutate();[...list.children].forEach(e=>{const f=pos.get(e);if(f==null)return;
  const d=f-e.getBoundingClientRect().top;if(!d)return;
  e.style.transition='none';e.style.transform=`translateY(${d}px)`;
  requestAnimationFrame(()=>{e.style.transition='transform .4s var(--e-out)';e.style.transform='';});});}

/* 3 singleton tooltip for ALL charts */
const tip=document.createElement('div');tip.className='tip';document.body.append(tip);
function showTip(html,x,y){tip.innerHTML=html;tip.classList.add('on');
 tip.style.left=x+'px';tip.style.top=y+'px';}
function hideTip(){tip.classList.remove('on');}
/* .tip{position:fixed;z-index:99;transform:translate(-50%,calc(-100% - 10px));
   background:var(--bg-3);border:1px solid var(--line-2);border-radius:8px;padding:8px 10px;
   font:500 12px var(--f-ui);color:var(--t1);box-shadow:var(--sh-1);pointer-events:none;
   opacity:0;transition:opacity .15s} .tip.on{opacity:1}  + ::after arrow */

/* 4 charts fill their card: ResizeObserver re-render */
const fit=(box,draw)=>{const ro=new ResizeObserver(()=>draw(box.clientWidth,box.clientHeight));ro.observe(box);};
```
Chart enter animations (pure CSS on SVG):
```css
.bars rect{transform-origin:bottom;transform-box:fill-box;animation:grow .7s var(--e-out) backwards}
@keyframes grow{from{transform:scaleY(0)}}
.spark polyline{stroke-dasharray:320;stroke-dashoffset:320;animation:draw 1s var(--e-out) .1s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
```
Every bar/point gets `data-tip` content + `mouseenter/mousemove/mouseleave` delegation → `showTip`.

---

## 4. Shell & Nav upgrades

1. **Sliding nav indicator**: one absolute `.nav-glider` pill behind active tab; on `sp()` set `left/width` from tab rect with `transition:.3s var(--e-out)`.
2. **Compare tray**: chip add = `pop` keyframe (`scale(.6)→1` spring); `[+]` opens an **animated popover** (origin top-right, scale+fade) listing all channels with hue dot + checkbox + mini search filter. When tray ≥2 → show `Compare now →` ghost button that opens Deep Dive **Compare** with exactly the tray set.
3. **Live ticker**: `updated <span data-ago>` next to refresh; `setInterval(30s)` rewrites all `[data-ago]` via `ago()`; refresh button icon spins (`.spin{animation:rot 1s linear infinite}`) during any fetch. All dates app-wide switch to `ago()` with exact date in `title`/tooltip.
4. **Command palette (Ctrl/Cmd+K)** — the biggest "pro" signal, ~120 lines: centered panel, input, grouped results **Channels** (hue dot + name + subs) and **Actions** (Go Dashboard / My Channels / Search / Export CSV / Refresh All / Toggle theme-free). Arrow keys + Enter, fuzzy `includes()`, Esc closes. `/` still → search page.
5. **Shortcuts modal (`?`)**: small card listing `/`, `Ctrl K`, `Esc`, `?`.
6. **First paint**: while `/api/channels` resolves, render a **skeleton shell** (strip + 3 cards of `.skel` blocks) instead of blank page.

---

## 5. Dashboard — block-by-block upgrades

**My Channel Strip**
- Grid `minmax(220px,1.1fr) repeat(4,1fr) auto` so tiles stretch (kills the gap before Deep Dive).
- Values `countUp()` on load; sparks get **area fill** (`<polygon>` hue→transparent gradient) + draw-in + hover dot tooltip.
- Delta rule: `|d|<0.05%` → neutral chip `— steady`; else `▲/▼` colored. Removes the `• 0.0%` nonsense.
- Engagement tile: add 3px horizontal gauge bar (value vs 10% benchmark) under value, gold→green gradient.
- Card left edge keeps gold bar; add faint gold radial tint `background:radial-gradient(400px 120px at 0% 50%, rgba(245,197,66,.06), transparent)`.

**You vs Field**
- Chart card: `.chart-box{flex:1;min-height:260px}` + `fit()` re-render → **chart always fills card** (void impossible). Band-scale bars across full width (4 bars spread, not clustered left), rounded tops, hue gradient fills, gold glow on your bar, 3 y-gridlines with mono labels, dashed **field-median line** with label, value labels fade in after grow. Metric chip switch → bars morph (CSS transition on `height/y`) + ladder re-sorts via `flip()`.
- Rank ladder: rows get hue avatar-dot + hidden proportional bar (`width:%` of #1, hue 12% opacity) that animates in on reveal; hover bg + `open_in_new` hint; click → Deep Dive.
- Insights card: `flex-column`; bullets stagger-reveal; add 2 more generators (momentum vs field median; your best metric trend last 30d); **footer pinned with `margin-top:auto`**: divider + "FIELD MEDIAN" chip row (Subs X · Avg Y · Eng Z) with your Δ per chip → no void ever.

**Leaderboard**
- Sortable headers (subs/avg/total/videos/last) with caret; re-sort via `flip()`.
- Sub bar animates width on reveal; row hover: bg lift + left hue inset bar grows + quick actions fade in (`+ compare`, `open_in_new`).
- Compare toggle: `+` morphs to `check` with spring pop; tray chip pops in sync.
- Rows entrance-stagger via `--i`.

**Velocity card**
- Legend **moves into card header** as compact hue chips (right side); clicking a chip **mutes/unmutes** that series (chip dims, bars animate out) — persisted in localStorage. This kills the 2-line dot soup AND the void.
- Chart fills via `fit()`; bars thicker (band/2.2), grouped, rounded, staggered grow; hover → tooltip `Channel · Jul '26 · 14 uploads`; y ticks nice-rounded.
- Grid row uses `align-items:stretch`; both cards flex-column so heights match naturally.

**Face-off**
- Medals: conic-gradient rings (gold/silver/bronze) + soft glow for #1–3.
- Each entry: 2px comparative view-bar under title (width = views/#1, channel hue), hover lift, stagger.

**Recent uploads**
- `scroll-snap-type:x mandatory`; cards `snap-start`; edge fade masks; hover-revealed ‹ › arrow buttons; custom 4px scrollbar; thumb `scale(1.06)` on hover inside `overflow:hidden`; views chip overlay bottom-left on thumb; external-link icon top-right on hover.

---

## 6. My Channels — upgrades & enrichment UX fix

1. **Summary strip** above list (fills header void, count-ups): `TRACKED 8 · COMBINED SUBS ~8.0M · COMBINED VIEWS ~702M · YOUR SHARE 0.3%` as four mini `.tile`s.
2. **Enrichment pipeline rewrite** (fixes `loading spark…` / red `—`):
   - Queue with concurrency 2; per-row spark cell renders `.skel` (90×26) while queued.
   - Success → crossfade skeleton→spark (`.in` class).
   - Fail → neutral `—` + retry icon-btn (one click re-queues). **Red dash never appears.**
   - Persist results to `localStorage['enrich:'+id]` (30-min TTL) → revisit paints sparks **instantly**, zero flicker, zero quota.
3. Rows: hover reveals action cluster (deep-dive / star / compare / refresh / delete) sliding from right; 30-day sub delta pill next to subscribers (`+1.2K/30d` from snapshots, neutral if 0); row bg tints 3% with channel hue on hover.
4. Bottom **ghost card**: dashed border, `+ Track another channel` — opens the Add panel; fills the page-bottom void usefully.
5. Toolbar sort change → `flip()` reorder instead of hard re-render.

---

## 7. Deep Dive polish pass (same kit, no IA change)

- Header banner: radial tint of channel hue + avatar ring glow; subtitle values count-up.
- Tabs: sliding indicator (same glider pattern); tab content swap = 200ms fade/slide.
- Sticky tab bar with blur on scroll.
- All charts (snapshot line, calendar heatmap, monthly bars) get `fit()`, tooltips, draw-in; line chart gets **hover crosshair** (vertical line + dot per series + unified tooltip).
- Compare matrix: column hover highlight (bg mix 4%), cell values count-up on tab open, read-out card bullets stagger.

---

## 8. CSS architecture rebuild (replaces the "deleted 4000 lines" with ~1800 *organized* lines)

```
/* 00 tokens & reset */        /* 01 base & typography */
/* 02 motion (keyframes, .rev, reduced-motion) */
/* 03 utilities (.skel .tip .sel .chip .delta .ic-tile) */
/* 04 components (card tile btn tabs table empty toast) */
/* 05 shell (topbar nav glider tray palette shortcuts) */
/* 06 page:dash */  /* 07 page:channels */ /* 08 page:search */
/* 09 deep-dive */  /* 10 charts(svg) */   /* 11 responsive */
```
Rules: no magic numbers — every color/spacing/radius/duration references a token; `font-variant-numeric:tabular-nums` on all mono values; one `@keyframes` library (`grow draw shim pop rot rotX fadeUp slideR`).

---

## 9. Phased task list

| Phase | Tasks | DoD |
|---|---|---|
| **P0 Atmosphere** | ambient bg, card depth, motion tokens, `.rev` observer, skeleton system, CSS re-sectioning | page no longer flat black; below-fold reveals on scroll |
| **P1 Pro Kit** | `countUp`, `flip`, `tip`, `fit()`, chart enter animations, `ago()` ticker | every KPI counts up; every chart has tooltip + fill-its-card |
| **P2 Shell** | nav glider, tray pop + popover + "Compare now", refresh spin + updated-ago, palette (Ctrl K), `?` modal, first-paint skeleton shell | palette opens channel in 2 keystrokes |
| **P3 Dashboard** | strip fixes (grid/delta rule/gauge/area-spark), field panel (band bars+median+gridlines, ladder bars, insights footer), leaderboard sort+hover, velocity legend-mute+fill, face-off medals+bars, uploads rail snap/fade/arrows | no card contains >32px unexplained empty space at 1280/1440 |
| **P4 Channels** | summary tiles, enrich queue + localStorage cache + skeleton/retry, hover actions, delta pills, ghost add-card, flip-sort | no "loading spark…" text, no red missing dashes, revisit = instant sparks |
| **P5 Deep Dive** | banner tint, tab glider, crosshair line chart, matrix hover/count-up | all old charts interactive |
| **P6 QA** | checklist below | — |

---

## 10. QA checklist

- [ ] Hover any bar/point/spark → tooltip; no `title=""` attributes used.
- [ ] Resize window → charts re-render to fill (no voids at 1280/1440/1680).
- [ ] Sort/metric switch → FLIP animation, no flash/re-render jump.
- [ ] Missing data always neutral `—`; red only for negative deltas.
- [ ] Revisit My Channels → sparks instant from localStorage (network tab: no duplicate video fetches within TTL).
- [ ] `prefers-reduced-motion` → fully static but complete UI.
- [ ] Animations use transform/opacity only; no CLS (heights reserved by `.skel`).
- [ ] Ctrl K, `/`, `Esc`, `?` all work; focus trapped in palette/modal.
- [ ] API call count identical to pre-polish build (quota parity).
- [ ] Every card header uses the same icon-tile + title + meta pattern.
