# YT Tracker — Pure UI & Design Upgrade Plan
## "Terminal Luxe" Aesthetic Direction

> **Design philosophy**: Think Bloomberg Terminal meets Linear.app. Every number is data, every pixel earns its place. Dark, dense, precise — but with moments of unexpected color that feel earned, not decorative. The vibe is "a senior engineer built this for themselves and it happens to look incredible."

---

## Section 0 — Design Tokens (CSS Variables Update)

These are the foundation. Replace the existing `:root` block entirely in `style.css`.

**Find:**
```css
:root{
  --bg:#101418;--sf:#1c2024; ...
}
```

**Replace with:**
```css
:root{
  /* ── Core Surfaces ── */
  --bg:         #0c0e12;       /* deeper, richer black */
  --sf:         #13171c;       /* card surface */
  --sf-low:     #0f1318;       /* recessed surface */
  --sf-lowest:  #090c10;       /* deepest inset */
  --sf-high:    #1c2128;       /* raised surface */
  --sf-highest: #252b33;       /* topmost raised */

  /* ── Brand Accents ── */
  --pr:         #00d4ff;       /* cyan — slightly less saturated, more refined */
  --pr-dim:     #7ee8fa;
  --pr-glow:    rgba(0,212,255,0.15);
  --gr:         #3ddc84;       /* green — more muted, less neon */
  --gr-glow:    rgba(61,220,132,0.12);
  --rd:         #ff6b6b;       /* red — warmer, less harsh */
  --rd-glow:    rgba(255,107,107,0.1);
  --gold:       #f5c842;       /* gold — slightly warmer */
  --gold-glow:  rgba(245,200,66,0.12);

  /* ── Typography ── */
  --t1:         #e8ecf0;       /* primary text — slightly cooler white */
  --t2:         #8899a6;       /* secondary — blue-grey tint */
  --t3:         #4a5568;       /* muted — noticeably dimmer */
  --t4:         #2d3748;       /* barely visible — divider-level */

  /* ── Borders ── */
  --bd:         rgba(255,255,255,0.055);
  --bd2:        rgba(255,255,255,0.11);
  --bd3:        rgba(255,255,255,0.18);

  /* ── Motion ── */
  --e:          cubic-bezier(0.16, 1, 0.3, 1);   /* expo out — snappy */
  --e-in:       cubic-bezier(0.4, 0, 1, 1);
  --dur-fast:   120ms;
  --dur-mid:    220ms;
  --dur-slow:   380ms;
}
```

---

## Section 1 — Typography System Overhaul

### 1.1 — Font Import (in `index.html` `<head>`)

**Replace existing Google Fonts import** with this refined selection:

```html
<!-- Remove old font links, add these: -->
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;400;600&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,300,0,0" rel="stylesheet"/>
```

- **Outfit** replaces DM Sans — same feel, more geometric, feels more "engineered"
- **Fraunces** replaces Syne for display headings — a beautiful optical-size serif that adds unexpected editorial weight to titles. Use it ONLY for the page title and channel names in cards.
- **JetBrains Mono** stays — it's perfect for data

### 1.2 — Global Font Application

**In `style.css`**, update `body`:
```css
body{
  font-family: 'Outfit', system-ui, sans-serif;
  /* rest stays same */
}
.mono{ font-family: 'JetBrains Mono', monospace; }
/* Add new utility: */
.serif{ font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
```

### 1.3 — Typographic Scale for Cards

The current problem: every label, value, and handle is the same visual weight. Here is the precise scale to apply:

| Element | Font | Size | Weight | Color | Letter-spacing |
|---|---|---|---|---|---|
| Channel name | Outfit | 14.5px | 600 | `--t1` | -0.2px |
| Handle | Outfit | 11px | 400 | `--t3` | 0 |
| Primary metric value (subs) | JetBrains Mono | 22px | 700 | `--gold` | -1px |
| Primary metric label | Outfit | 9px | 600 uppercase | `--t3` | 1.2px |
| Secondary metric value | JetBrains Mono | 12px | 600 | `--t2` | -0.3px |
| Secondary metric label | Outfit | 9px | 500 uppercase | `--t4` | 0.8px |
| Badge text | Outfit | 10px | 600 | varies | 0.3px |
| Page title | Fraunces | 30px | 400 | `--t1` | -0.5px |
| Section labels | Outfit | 10px | 700 uppercase | `--t3` | 1.5px |

Apply these via the CSS rules in Section 2 below.

---

## Section 2 — Channel Card Visual Redesign

### 2.1 — Card Container: Depth & Atmosphere

**In `style.css`**, find and replace `.ch-card`:

```css
.ch-card{
  background: var(--sf);
  border-radius: 10px;
  /* Layered border: inner subtle line + outer near-invisible */
  border: 1px solid var(--bd);
  box-shadow:
    0 1px 0 0 rgba(255,255,255,0.04) inset, /* top inner highlight */
    0 0 0 0 transparent;                     /* placeholder for hover glow */
  overflow: hidden; /* keep for border-radius clipping */
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;

  /* Staggered entrance */
  opacity: 0;
  transform: translateY(12px);
  animation: cardIn var(--dur-slow) var(--e) both;

  transition:
    border-color var(--dur-mid) var(--e),
    box-shadow var(--dur-mid) var(--e),
    transform var(--dur-fast) var(--e);
}

/* Hover state: feels like it's lifting off the surface */
.ch-card:hover{
  border-color: var(--bd2);
  box-shadow:
    0 1px 0 0 rgba(255,255,255,0.06) inset,
    0 8px 32px rgba(0,0,0,0.4),
    0 2px 8px rgba(0,0,0,0.3);
  transform: translateY(-2px);
}

/* Press feedback */
.ch-card:active{
  transform: translateY(0px) scale(0.992);
  transition-duration: var(--dur-fast);
}

/* Mine: gold atmospheric glow */
.ch-card.mine{
  border-color: rgba(245,200,66,0.18);
  background: linear-gradient(
    160deg,
    rgba(245,200,66,0.03) 0%,
    var(--sf) 40%
  );
  box-shadow:
    0 1px 0 0 rgba(245,200,66,0.08) inset,
    0 0 0 0 transparent;
}
.ch-card.mine:hover{
  border-color: rgba(245,200,66,0.35);
  box-shadow:
    0 1px 0 0 rgba(245,200,66,0.1) inset,
    0 8px 32px rgba(0,0,0,0.4),
    0 0 40px rgba(245,200,66,0.05);
}

/* Stale: barely-there red tint, not alarming */
.ch-card.stale{
  border-color: rgba(255,107,107,0.12);
}

@keyframes cardIn{
  from{ opacity:0; transform:translateY(12px); }
  to{   opacity:1; transform:translateY(0); }
}
```

### 2.2 — Status Left Bar: Thinner, More Refined

```css
.cc-status-bar{
  position: absolute;
  left: 0; top: 12px; bottom: 12px; /* doesn't go full height — floats */
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: transparent;
  transition: background var(--dur-mid);
}
.cc-status-bar.status-growing{
  background: linear-gradient(to bottom, transparent, var(--gr), transparent);
}
.cc-status-bar.status-declining{
  background: linear-gradient(to bottom, transparent, var(--rd), transparent);
}
.cc-status-bar.status-stale{
  background: linear-gradient(to bottom, transparent, rgba(255,107,107,0.4), transparent);
}
```

### 2.3 — Main Row: Tighter, More Intentional Spacing

```css
.cc-row{
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 15px 18px 15px 20px; /* 20px left clears status bar with breathing room */
  min-height: 70px;
}
```

### 2.4 — Avatar: Subtle Ring Treatment

```css
.cc-logo-wrap{
  position: relative;
  width: 40px; height: 40px;
  flex-shrink: 0;
}
.cc-logo{
  width: 40px; height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--sf-highest);
  display: block;
  /* Subtle ring using box-shadow instead of border (doesn't affect layout) */
  box-shadow: 0 0 0 1.5px var(--bd2), 0 2px 8px rgba(0,0,0,0.4);
  transition: box-shadow var(--dur-mid);
}
.ch-card:hover .cc-logo{
  box-shadow: 0 0 0 2px var(--bd3), 0 2px 8px rgba(0,0,0,0.4);
}
.ch-card.mine .cc-logo{
  box-shadow: 0 0 0 2px rgba(245,200,66,0.4), 0 2px 8px rgba(0,0,0,0.4);
}
.cc-logo-fb{
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--sf-high);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Outfit', sans-serif;
  font-size: 16px; font-weight: 700; color: var(--t3);
  box-shadow: 0 0 0 1.5px var(--bd2);
}
.cc-crown{
  position: absolute;
  bottom: -2px; right: -2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--gold);
  display: grid; place-items: center;
  border: 1.5px solid var(--sf);
  font-size: 6px;
  box-shadow: 0 0 8px rgba(245,200,66,0.5);
}
```

### 2.5 — Identity: Fraunces for Name, Dimmer Handle

```css
.cc-ident{
  flex: 1;
  min-width: 0;
}
.cc-name{
  font-family: 'Outfit', sans-serif; /* could try Fraunces here for personality */
  font-weight: 600;
  font-size: 14.5px;
  letter-spacing: -0.2px;
  color: var(--t1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}
.cc-handle{
  font-size: 11px;
  font-weight: 400;
  color: var(--t3);
  margin-top: 2px;
  letter-spacing: 0;
}
.cc-tags{
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
```

### 2.6 — Badge Redesign: More Refined, Less "Bubbly"

**In `style.css`**, replace all `.badge` and `.bdg-*` rules:

```css
.badge{
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px 2px;
  border-radius: 4px; /* rectangular, not pill — more data-viz feel */
  font-family: 'Outfit', sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  line-height: 1.6;
}
.bdg-pr{
  background: rgba(0,212,255,0.08);
  color: var(--pr);
  border: 1px solid rgba(0,212,255,0.16);
}
.bdg-gr{
  background: rgba(61,220,132,0.08);
  color: var(--gr);
  border: 1px solid rgba(61,220,132,0.16);
}
.bdg-rd{
  background: rgba(255,107,107,0.08);
  color: var(--rd);
  border: 1px solid rgba(255,107,107,0.16);
}
.bdg-gd{
  background: rgba(245,200,66,0.08);
  color: var(--gold);
  border: 1px solid rgba(245,200,66,0.16);
}
.bdg-dim{
  background: rgba(255,255,255,0.04);
  color: var(--t3);
  border: 1px solid var(--bd);
}
```

### 2.7 — Primary Metric: Bigger Contrast, Proper Hierarchy

```css
.cc-primary-metric{
  flex-shrink: 0;
  text-align: right;
  min-width: 90px;
}
.cc-pm-val{
  font-family: 'JetBrains Mono', monospace;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 1;
  color: var(--t1);
  transition: color var(--dur-fast);
}
.cc-pm-val.gold{ color: var(--gold); }

/* Label sits BELOW value, very dim */
.cc-pm-lbl{
  font-family: 'Outfit', sans-serif;
  font-size: 8.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--t3);
  margin-top: 4px;
  text-align: right;
}
```

### 2.8 — Secondary Metrics: Two-Column Info Block

```css
.cc-secondary-metrics{
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 80px;
  padding-left: 14px;
  /* Elegant divider using box-shadow instead of border */
  box-shadow: -1px 0 0 0 var(--bd);
}
.cc-sm-item{
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.cc-sm-val{
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--t2);
  letter-spacing: -0.3px;
  line-height: 1.2;
}
.cc-sm-lbl{
  font-family: 'Outfit', sans-serif;
  font-size: 8.5px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--t4);
}
```

### 2.9 — Action Buttons: Appear on Hover, Not Cluttering Compact View

```css
.cc-acts{
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
  margin-left: 4px;

  /* Hidden by default — revealed on card hover */
  opacity: 0;
  transform: translateX(6px);
  transition:
    opacity var(--dur-mid) var(--e),
    transform var(--dur-mid) var(--e);
}
.ch-card:hover .cc-acts{
  opacity: 1;
  transform: translateX(0);
}
.cc-act{
  width: 26px; height: 26px;
  border: none; background: transparent;
  color: var(--t3);
  cursor: pointer;
  border-radius: 6px;
  display: grid; place-items: center;
  font-family: 'Material Symbols Outlined';
  font-size: 15px; font-style: normal; line-height: 1;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.cc-act:hover{ color: var(--t1); background: rgba(255,255,255,0.07); }
.cc-act.danger:hover{ color: var(--rd); background: var(--rd-glow); }
.cc-act.gold:hover{ color: var(--gold); background: var(--gold-glow); }
```

---

## Section 3 — Hover Expansion Panel

### 3.1 — Expand Container: Glass Separator Feel

```css
.cc-expand{
  display: grid;
  grid-template-rows: 0fr;
  transition:
    grid-template-rows var(--dur-mid) var(--e),
    padding var(--dur-mid) var(--e);
  padding: 0 20px;
  /* Top border fades in with opacity trick */
  border-top: 1px solid transparent;
  transition:
    grid-template-rows var(--dur-mid) var(--e),
    padding var(--dur-mid) var(--e),
    border-color var(--dur-mid) var(--e);
}
.ch-card:hover .cc-expand{
  grid-template-rows: 1fr;
  padding: 14px 20px 16px;
  border-top-color: var(--bd);
}
.cc-expand-inner{
  min-height: 0;
  overflow: hidden;
}
```

### 3.2 — Sparkline: Polished Mini Chart

```css
.cc-sparkline{
  height: 36px;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  margin-bottom: 12px;
  position: relative;
}
/* Add a baseline rule under the bars */
.cc-sparkline::after{
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 1px;
  background: var(--bd);
}
.cc-spark-bar{
  flex: 1;
  border-radius: 2px 2px 0 0;
  min-height: 3px;
  opacity: 0;
  transform: scaleY(0);
  transform-origin: bottom;
  /* Bars animate IN when expand panel opens */
  transition:
    opacity 0.3s var(--e),
    transform 0.3s var(--e),
    height 0.4s var(--e);
}
/* Stagger each bar using nth-child */
.cc-spark-bar:nth-child(1){ transition-delay: 0.02s; }
.cc-spark-bar:nth-child(2){ transition-delay: 0.04s; }
.cc-spark-bar:nth-child(3){ transition-delay: 0.06s; }
.cc-spark-bar:nth-child(4){ transition-delay: 0.08s; }
.cc-spark-bar:nth-child(5){ transition-delay: 0.10s; }
.cc-spark-bar:nth-child(6){ transition-delay: 0.12s; }
.cc-spark-bar:nth-child(7){ transition-delay: 0.14s; }
.cc-spark-bar:nth-child(8){ transition-delay: 0.16s; }

/* Trigger animation when card is hovered */
.ch-card:hover .cc-spark-bar{
  opacity: 0.85;
  transform: scaleY(1);
}
```

**In `app.js`**, when building sparkline bars, add inline CSS for height AND color directly:
```javascript
// High bars = cyan, middle = muted cyan, low = dim grey
const c = vc >= maxV * 0.7 ? 'var(--pr)' 
        : vc >= maxV * 0.35 ? 'rgba(0,212,255,0.4)' 
        : 'var(--t4)';
return `<div class="cc-spark-bar" style="height:${pct}%;background:${c}" title="${v.views||vc} views"></div>`;
```

### 3.3 — Expanded Metrics Row

```css
.cc-expand-metrics{
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  background: var(--sf-low);
  border: 1px solid var(--bd);
  border-radius: 8px;
  overflow: hidden;
}
.cc-em-item{
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-right: 1px solid var(--bd);
}
.cc-em-item:last-child{ border-right: none; }
.cc-em-val{
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--t1);
  letter-spacing: -0.3px;
  line-height: 1;
}
.cc-em-lbl{
  font-family: 'Outfit', sans-serif;
  font-size: 8.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--t3);
}
```

### 3.4 — Latest Video Strip: Compact & Clean

```css
.cc-expand-vid{
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--sf-lowest);
  border: 1px solid var(--bd);
  border-radius: 7px;
  padding: 8px 10px;
  cursor: pointer;
  margin-bottom: 10px;
  transition: border-color var(--dur-fast), background var(--dur-fast);
  text-decoration: none;
  color: inherit;
}
.cc-expand-vid:hover{
  border-color: var(--bd2);
  background: var(--sf-low);
}
.cc-expand-thumb{
  width: 56px;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 4px;
  background: var(--sf-highest);
  flex-shrink: 0;
  display: block;
}
.cc-expand-vid-title{
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--t2);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}
.cc-expand-vid-meta{
  font-size: 10px;
  color: var(--t3);
  margin-top: 2px;
  font-family: 'JetBrains Mono', monospace;
}
```

### 3.5 — "View Details" Link: Animated Arrow

```css
.cc-view-link{
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: 'Outfit', sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--pr);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  letter-spacing: 0.2px;
  /* Underline that slides in on hover */
  position: relative;
}
.cc-view-link::after{
  content: '';
  position: absolute;
  bottom: -1px; left: 0;
  width: 0; height: 1px;
  background: var(--pr);
  transition: width var(--dur-mid) var(--e);
}
.cc-view-link:hover::after{ width: 100%; }
/* Arrow character animates right */
.cc-view-link .arrow{
  display: inline-block;
  transition: transform var(--dur-mid) var(--e);
}
.cc-view-link:hover .arrow{ transform: translateX(3px); }
```

In the JS template, update the link to:
```html
<button class="cc-view-link" ...>
  ${isMine ? 'Full Analytics' : 'View Details'} <span class="arrow">→</span>
</button>
```

---

## Section 4 — Page-Level Polish

### 4.1 — Page Header Upgrade

**In `style.css`**, update `.pg-title`:
```css
.pg-title{
  font-family: 'Fraunces', serif;
  font-optical-sizing: auto;
  font-weight: 400;          /* Fraunces looks best at regular weight — it's already heavy */
  font-size: 28px;
  letter-spacing: -0.5px;
  color: var(--t1);
  line-height: 1.1;
}
.pg-sub{
  margin-top: 6px;
  font-size: 12px;
  color: var(--t3);
  font-family: 'Outfit', sans-serif;
}
```

### 4.2 — Section Labels: More Editorial

```css
.sl{
  font-family: 'Outfit', sans-serif;
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.8px;
  color: var(--t3);
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 36px 0 14px;
}
.sl::after{
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, var(--bd2), transparent);
}
.sl em{
  color: var(--t2);
  font-style: normal;
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}
```

### 4.3 — Top Nav: Frosted Glass Refinement

```css
.topnav{
  position: sticky; top: 0; z-index: 60;
  background: rgba(12,14,18,0.8);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid var(--bd);
  /* Subtle top highlight */
  box-shadow: 0 1px 0 0 rgba(255,255,255,0.03) inset;
}
.nav-brand{
  font-family: 'Outfit', sans-serif;
  font-weight: 800;
  font-size: 18px;
  color: var(--t1); /* not cyan — more sophisticated */
  letter-spacing: -0.5px;
  cursor: pointer;
}
.nav-brand span{
  color: var(--pr); /* only the "Tracker" part gets color */
}
```

### 4.4 — Buttons: Tighter, More Purposeful

```css
.btn-pr{
  background: var(--pr);
  color: #001a20;
  padding: 7px 16px;
  font-size: 12.5px;
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  letter-spacing: 0.2px;
  border-radius: 7px;
  /* Glow on hover only */
  transition: all var(--dur-mid) var(--e);
}
.btn-pr:hover{
  background: var(--pr-dim);
  box-shadow: 0 0 0 1px var(--pr), 0 4px 20px rgba(0,212,255,0.2);
}
.btn-gh{
  background: rgba(255,255,255,0.04);
  color: var(--t2);
  border: 1px solid var(--bd);
  padding: 7px 13px;
  font-size: 12.5px;
  font-family: 'Outfit', sans-serif;
  border-radius: 7px;
}
.btn-gh:hover{
  color: var(--t1);
  border-color: var(--bd2);
  background: rgba(255,255,255,0.07);
}
```

### 4.5 — Background: More Depth

**In `style.css`**, update `body`:
```css
body{
  font-family: 'Outfit', system-ui, sans-serif;
  background: var(--bg);
  color: var(--t1);
  min-height: 100vh;
  overflow-x: hidden;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* Subtle grid pattern — tighter, less visible */
  background-image:
    radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Ambient orbs — reposition and recolor */
body::before{
  content: '';
  position: fixed;
  top: -300px; left: -200px;
  width: 700px; height: 700px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(circle, rgba(0,212,255,0.04) 0%, transparent 65%);
  /* Slow drift animation */
  animation: orb1 18s ease-in-out infinite alternate;
}
body::after{
  content: '';
  position: fixed;
  bottom: -200px; right: -150px;
  width: 600px; height: 600px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(circle, rgba(61,220,132,0.03) 0%, transparent 68%);
  animation: orb2 22s ease-in-out infinite alternate;
}
@keyframes orb1{
  from{ transform: translate(0,0) scale(1); }
  to{   transform: translate(40px, 30px) scale(1.08); }
}
@keyframes orb2{
  from{ transform: translate(0,0) scale(1); }
  to{   transform: translate(-30px, -40px) scale(1.05); }
}
```

---

## Section 5 — Skeleton Loader Redesign

The current skeleton is just grey boxes. Make it match the exact card structure:

```css
.ch-card-skel{
  background: var(--sf);
  border-radius: 10px;
  border: 1px solid var(--bd);
  height: 72px;
  display: flex;
  align-items: center;
  padding: 15px 20px;
  gap: 14px;
  overflow: hidden;
  position: relative;
}
/* Shimmer sweep */
.ch-card-skel::after{
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255,255,255,0.03) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: skelSwipe 1.8s ease-in-out infinite;
}
@keyframes skelSwipe{
  from{ background-position: 200% 0; }
  to{   background-position: -200% 0; }
}
.ch-skel-av{
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--sf-high);
  flex-shrink: 0;
}
.ch-skel-lines{
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ch-skel-name{
  height: 13px;
  width: 45%;
  background: var(--sf-high);
  border-radius: 3px;
}
.ch-skel-handle{
  height: 10px;
  width: 28%;
  background: var(--sf-highest);
  border-radius: 3px;
  opacity: 0.6;
}
.ch-skel-num{
  width: 76px; height: 24px;
  background: var(--sf-high);
  border-radius: 4px;
  flex-shrink: 0;
}
```

**Update the skeleton JS** to match new structure:
```javascript
function renderChannelSkeletons(n=6){
  const tbl = document.getElementById('chTbl');
  tbl.innerHTML = `<div class="ch-grid">${
    Array.from({length: n}, (_,i) => `
      <div class="ch-card-skel" style="animation-delay:${i*0.04}s">
        <div class="ch-skel-av"></div>
        <div class="ch-skel-lines">
          <div class="ch-skel-name"></div>
          <div class="ch-skel-handle"></div>
        </div>
        <div class="ch-skel-num"></div>
      </div>`).join('')
  }</div>`;
}
```

---

## Section 6 — Micro-Interaction Inventory

These are small but they make the whole thing feel alive. Each is a targeted CSS addition.

### 6.1 — Sort Dropdown: Styled to Match

```css
#chSortSel{
  background: var(--sf);
  border: 1px solid var(--bd);
  color: var(--t2);
  padding: 7px 30px 7px 11px;
  border-radius: 7px;
  font-family: 'Outfit', sans-serif;
  font-size: 12.5px;
  cursor: pointer;
  outline: none;
  appearance: none;
  /* Custom arrow */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%234a5568'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color var(--dur-fast), color var(--dur-fast);
}
#chSortSel:hover{
  border-color: var(--bd2);
  color: var(--t1);
}
```

### 6.2 — Toast: More Polished

```css
#toast{
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: var(--sf-high);
  border: 1px solid var(--bd2);
  border-radius: 8px;        /* rectangular, not pill */
  padding: 10px 18px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s var(--e), transform 0.2s var(--e);
  z-index: 999;
}
#toast.show{
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
#toast.s{ color: var(--gr); border-color: rgba(61,220,132,0.25); }
#toast.e{ color: var(--rd); border-color: rgba(255,107,107,0.25); }
```

### 6.3 — Spinner: Thinner, More Elegant

```css
.spin{
  width: 13px; height: 13px;
  border: 1.5px solid rgba(255,255,255,0.08);
  border-top-color: var(--pr);
  border-radius: 50%;
  animation: rot 0.6s linear infinite;
  flex-shrink: 0;
}
```

### 6.4 — Nav Link Active State: Underline Only (remove background box)

```css
.nav-link{
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Outfit', sans-serif;
  color: var(--t3);
  cursor: pointer;
  border: none;
  background: transparent;
  transition: color var(--dur-fast);
  position: relative;
}
.nav-link:hover{ color: var(--t2); }
.nav-link.on{ color: var(--t1); }
.nav-link.on::after{
  content: '';
  position: absolute;
  bottom: -2px;
  left: 12px; right: 12px;
  height: 1.5px;
  background: var(--pr);
  border-radius: 2px;
  /* subtle glow on the underline */
  box-shadow: 0 0 8px var(--pr);
}
/* Remove the background on .nav-link.on: */
/* NO background: rgba(0,229,255,.08) — delete that */
```

### 6.5 — "Best This Month" Box: More Atmospheric

In `app.js`, find the `cc-best-${ch.id}` innerHTML assignment. Update the styling in the template string:

```javascript
// Replace the existing bestEl.innerHTML with:
bestEl.innerHTML = `
  <div style="
    background: linear-gradient(135deg, rgba(61,220,132,0.06), rgba(61,220,132,0.02));
    border-radius: 7px;
    padding: 9px 11px;
    border: 1px solid rgba(61,220,132,0.12);
    border-left: 2px solid var(--gr);
    margin-top: 8px;
  ">
    <div style="
      font-family:'Outfit',sans-serif;
      font-size:8.5px;font-weight:700;
      text-transform:uppercase;letter-spacing:1.2px;
      color:var(--gr);margin-bottom:4px;
    ">🏆 Best this month</div>
    <div style="
      font-family:'Outfit',sans-serif;
      font-size:12px;font-weight:500;
      line-height:1.35;
      display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;
      color:var(--t1);
    ">${esc(best.title)}</div>
    <div style="
      font-family:'JetBrains Mono',monospace;
      font-size:11px;color:var(--gr);
      margin-top:3px;font-weight:600;
    ">${best.views||''} views</div>
  </div>`;
```

### 6.6 — Staggered Card Entrance: Precise Timing

The `cardIn` keyframe is defined in Section 2.1. In `app.js`, ensure the stagger delay is applied with this formula:

```javascript
// In the renderChannels loop:
const delay = Math.min(index * 0.06, 0.5); // cap at 0.5s so last card isn't too delayed
// Apply as inline style on the card:
style="animation-delay:${delay}s"
```

---

## Section 7 — Drawer Panel Polish

### 7.1 — Drawer Header: Full-bleed Avatar Treatment

**In `style.css`**, update `.drw`:
```css
.drw{
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 400px;
  background: var(--sf-low);
  border-left: 1px solid var(--bd);
  z-index: 80;
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform var(--dur-slow) var(--e);
  /* Subtle shadow bleeding from left edge */
  box-shadow: -20px 0 60px rgba(0,0,0,0.5);
}
.drw.open{ transform: translateX(0); }
```

Update `.drw-bar` (the "Channel Details" header bar):
```css
.drw-bar{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--bd);
  background: var(--sf-lowest);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(12px);
}
.drw-bar-t{
  font-family: 'Outfit', sans-serif;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--t3);
}
```

### 7.2 — Drawer Stats: Clean Grid

```css
.drw-bento{
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 6px;
  padding: 16px;
}
.drw-bento-main{
  grid-row: span 2;
  background: linear-gradient(160deg, rgba(245,200,66,0.06), transparent);
  border: 1px solid rgba(245,200,66,0.14);
  border-radius: 9px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.drw-bento-cell{
  background: var(--sf-lowest);
  border: 1px solid var(--bd);
  border-radius: 7px;
  padding: 10px 12px;
}
.drw-bento-lbl{
  font-family: 'Outfit', sans-serif;
  font-size: 8.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--t3);
  margin-bottom: 5px;
}
.drw-bento-val{
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  color: var(--t1);
}
.drw-bento-main .drw-bento-val{
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
}
```

---

## Section 8 — Complete Change Summary by File

### `index.html`
1. Replace Google Fonts `<link>` tags with Outfit + Fraunces + JetBrains Mono import (§1.1)
2. Update Material Symbols import to use `wght:300` for thinner icons (§1.1)

### `style.css`
1. **`:root`** — replace entire block with new design tokens (§0)
2. **`body`** — update font + background orb animations (§4.5)
3. **`body::before` + `body::after`** — orb drift animations (§4.5)
4. **`.topnav`** — frosted glass refinement (§4.3)
5. **`.nav-brand`** — font update (§4.3)
6. **`.nav-link`** — underline-only active state (§6.4)
7. **`.btn-pr` `.btn-gh`** — tighter, more purposeful (§4.4)
8. **`.badge` + all `.bdg-*`** — rectangular, less bubbly (§2.6)
9. **`#toast`** — rectangular, more polished (§6.2)
10. **`.spin`** — thinner (§6.3)
11. **`.pg-title`** — Fraunces serif (§4.1)
12. **`.sl`** — editorial section labels with gradient line (§4.2)
13. **`.ch-grid`** — keep 2-column layout from previous plan
14. **`.ch-card`** — full replacement (§2.1)
15. **`.cc-status-bar`** — floating gradient bar (§2.2)
16. **`.cc-row`** — spacing update (§2.3)
17. **`.cc-logo-wrap` `.cc-logo` `.cc-logo-fb` `.cc-crown`** — ring treatment (§2.4)
18. **`.cc-ident` `.cc-name` `.cc-handle` `.cc-tags`** — typography (§2.5)
19. **`.cc-primary-metric` `.cc-pm-val` `.cc-pm-lbl`** — hierarchy (§2.7)
20. **`.cc-secondary-metrics` `.cc-sm-item` `.cc-sm-val` `.cc-sm-lbl`** — two-col info (§2.8)
21. **`.cc-acts` `.cc-act`** — slide-in on hover (§2.9)
22. **`.cc-expand` `.cc-expand-inner`** — grid-rows transition (§3.1)
23. **`.cc-sparkline` `.cc-spark-bar`** — staggered bar animations (§3.2)
24. **`.cc-expand-metrics` `.cc-em-item` `.cc-em-val` `.cc-em-lbl`** — grouped metric panel (§3.3)
25. **`.cc-expand-vid` + children** — compact video strip (§3.4)
26. **`.cc-view-link`** — animated underline + arrow (§3.5)
27. **`.ch-card-skel` + skeleton children** — shimmer sweep (§5)
28. **`#chSortSel`** — styled dropdown (§6.1)
29. **`.drw` `.drw-bar` `.drw-bar-t`** — drawer polish (§7.1)
30. **`.drw-bento` + children** — stat grid (§7.2)
31. **`@keyframes cardIn`** — card entrance (§2.1)
32. **`@keyframes skelSwipe`** — skeleton shimmer (§5)
33. **`@keyframes orb1` `@keyframes orb2`** — ambient drift (§4.5)

### `app.js`
1. **Sparkline bar color logic** — 3-tier cyan gradient (§3.2)
2. **`renderChannelSkeletons()`** — new skeleton HTML (§5)
3. **Best-this-month box** — refined green template (§6.5)
4. **Card entrance delay formula** — capped stagger (§6.6)
5. **`.cc-view-link` template** — add `.arrow` span (§3.5)

---

## Visual Before/After Summary

| Element | Before | After |
|---|---|---|
| Card background | flat `#1c2024` | `#13171c` + gold gradient for mine |
| Card border | uniform `rgba(255,255,255,0.07)` | layered inner highlight + outer |
| Card hover | `translateY(-2px)` | lift + shadow + glow for mine |
| Card press | `scale(0.985)` | `scale(0.992)` + snap timing |
| Status bar | solid color, full height | gradient, floats vertically |
| Action buttons | fade in, static | slide-in from right |
| Channel name | DM Sans 14px/700 | Outfit 14.5px/600 |
| Subscriber value | JetBrains Mono 20px | JetBrains Mono 21px + letter-spacing -1px |
| Labels | all same `var(--t3)` | tiered: `--t3` primary, `--t4` secondary |
| Badges | pill-shaped, pill radius | 4px radius, more data-viz |
| Sparkline bars | pop in all at once | staggered 20ms delay each, scaleY from 0 |
| Expand panel | border-top pops in | fades in via `border-color: transparent → --bd` |
| Background orbs | static | slow drift animation, 18-22s |
| Skeleton | `.sk` shimmer sweep | exact card shape + sweep direction |
| Section labels | solid rule line | gradient rule that fades right |
| Nav active | background box + underline | underline only + subtle glow |
| Page title | Syne sans-serif | Fraunces optical-size serif |
| Buttons | generic rounded | tighter, glow on hover only |