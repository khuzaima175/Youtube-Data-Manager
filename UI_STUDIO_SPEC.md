# YT Tracker — Phase 9 Spec: Studio & Creator Lab Pack (🎬 Create)

> **Agent instruction:** *"100% client-side calculation from `_topicCache`, `_enrichCache`, and `all[]`. Zero new API calls. Clean, reactive, highly responsive studio workflow."*

---

## 1. Core Modules

### S1. Title Lab (Real-Time Algorithmic Scorer)
- **Live Scoring Formula (0–100):**
  - **Length (25 pts):** 40–60 chars (optimal for mobile & search truncation) = 25 pts. 30–39 or 61–70 = 18 pts. < 30 or > 70 = 8–12 pts.
  - **Topic Engine Match (35 pts):** Matches unigrams/bigrams in `_topicCache.topics`. Bonus if topic has high momentum ($\ge 1.5\times$).
  - **Format / Hook Elements (25 pts):**
    - Numbers (`\b\d+\b`): +8 pts
    - Brackets/Parens (`[...]` or `(...)`): +8 pts
    - Power Words (`How, Why, Secret, Never, Ultimate, Masterclass, Explained, Truth, Stop, Fast, Guide, Pro, Mistakes, Best, Worst, vs, Real`): +9 pts
  - **Word Count & Structure (15 pts):** 5–12 words, proper capitalization.
- **Missing Token Suggestions:**
  - Finds top 5 hot topics from `_topicCache` with $\text{momentum} \ge 1.3\times$ not present in the draft title.
  - Rendered as clickable pill buttons: clicking appends token directly to the draft title.
- **Action:** "+ Send to Pipeline" sends current draft to Kanban `Idea` column.

---

### S2. Gap-Driven Idea Generator
- **Idea Formulas:**
  1. **Moat Convergence:** `{yourMoat} × {fieldHotTopic}`
  2. **Gap Attack:** `{untappedGapTopic} Demystified: What No One Is Telling You`
  3. **Franchise Follow-Up:** `Part 2: Why {yourTopVideoTopic} Really Matters`
  4. **Contrarian Angle:** `The Hard Truth About {rivalSpikingTopic}`
  5. **Mastery Blueprint:** `From Zero to Master: {moatTopic} Blueprint`
- **Scoring:** Calculated 🔥 **Potential Score** based on topic momentum, field average views, and your moat rank.
- **Actions:**
  - `🧪 Test in Title Lab`: loads title directly into Title Lab.
  - `+ Add to Pipeline`: inserts into Content Pipeline.

---

### S3. Content Pipeline Board (Kanban)
- **Columns:**
  1. `💡 Idea`
  2. `🛠 In Production`
  3. `⏳ Scheduled`
  4. `🚀 Published`
- **Card Data Schema:**
  ```ts
  interface PipelineCard {
    id: string;
    title: string;
    topic: string;
    stage: 'idea' | 'making' | 'scheduled' | 'published';
    score: number;
    targetDate?: string;
    notes?: string;
    actualViews?: number;
    publishedUrl?: string;
    createdAt: number;
  }
  ```
- **Drag & Drop + Move Arrows:** Supports standard HTML5 drag & drop between columns, plus quick stage shift buttons.
- **Auto-Publish Detection:**
  - On channel data refresh (`refreshOne` / `fetchAll`), checks cards in `idea`, `making`, `scheduled` against your channel's recent uploads (`_enrichCache[primary.id].vids`).
  - If token overlap $\ge 50\%$, card automatically shifts to `🚀 Published` and records `actualViews` + `publishedUrl`.
- **Persistence:** Local-first in `localStorage.getItem('yt_pipeline_cards')`.

---

## 2. Navigation & Layout
- Top navigation link: **🎬 Studio** (`#nav-studio` / `sp('studio')`).
- Tabbed Studio Workspace:
  - Top tab switches: **Title Lab & Idea Generator** | **Content Pipeline Board**.
  - Glassmorphic, modern dark-mode aesthetic with reactive counters, drag transitions, and live scoring.
