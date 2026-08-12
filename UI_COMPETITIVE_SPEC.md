# YT Tracker — Phase 8 Spec: Competitive Intelligence Pack (⚔️ Compete)

> **Agent instruction:** *"100% client-side computation from `all[]`, `_enrichCache`, and `_topicCache`. Zero new API quota. Build methodically in order C1 → C5. QA and verify at each step."*

---

## 1. Feature Specifications

### C1. Closest-Threat Score (Jaccard Topic Similarity)
- **Formula:**
  $$\text{Jaccard}(A, B) = \frac{|T_A \cap T_B|}{|T_A \cup T_B|} \times 100\%$$
  where $T_A$ and $T_B$ are the sets of top-20 topics for channel $A$ (You) and channel $B$ (Rival) extracted from `_topicCache.perChannel`.
- **UI Integration:**
  - **Leaderboard Table:** Adds "Threat Index" column (`⚔️ 74% overlap`) and clickable header sort `threat_score`.
  - **Channel Cards:** Badge showing `⚔️ 74% Threat` with tooltip breakdown (shared topics: *Ray Tracing, EUV, Shaders*).
  - **Deep Dive Sticky Header:** Displays threat affinity chip next to the channel name.

### C2. Copycat Detector
- **Formula:**
  For any rival video $v_{\text{rival}}$, compute token overlap with each of your top-20 videos $v_{\text{me}}$:
  $$\text{Overlap}(v_{\text{rival}}, v_{\text{me}}) = \frac{|\text{tokens}(v_{\text{rival}}) \cap \text{tokens}(v_{\text{me}})|}{\min(|\text{tokens}(v_{\text{rival}})|, |\text{tokens}(v_{\text{me}})|)}$$
  If $\text{Overlap} \ge 0.60$ and $v_{\text{rival}}$ was published *after* $v_{\text{me}}$, flag as a potential copycat.
- **UI Integration:**
  - Topic alerts toast notification & alert history item.
  - Video row badge `🕵️ Similar to your [Title]` in Deep Dive Videos list.

### C3. Collision Insight (Traffic Shadow)
- **Formula:**
  For your videos where performance $\le 0.75\times$ your 30-video average:
  Check if any competitor with $\ge 2\times$ your subscriber count published within $\pm 24$ hours on a shared topic ($|tokens_{\text{shared}}| \ge 1$).
- **UI Integration:**
  - Badge on video card: `⚡ Collision: [Channel] dropped on "[Topic]" 8h earlier`.
  - Tooltip: *"Publish timing coincided with a rival 3× your size. Avoid overlapping release windows."*

### C4. Evergreen vs. Hype Fingerprint
- **Formula:**
  Take the channel's top-10 videos by total views:
  $$\text{Evergreen Ratio} = \frac{\text{count}(\text{published} > 365\text{ days ago})}{10} \times 100\%$$
  - If $\ge 60\%$: `🌲 Evergreen (70%)` — Catalog compounds over years.
  - If $30\% - 59\%$: `⚖️ Balanced (50%)` — Mix of timely and sustained views.
  - If $< 30\%$: `⚡ Hype-Driven (80%)` — Front-loaded views, decays quickly.
- **UI Integration:**
  - Chip in Deep Dive Overview Health Card & About summary.
  - Strategy badge on My Channels rows.

### C5. Series Detector
- **Formula:**
  Detect titles matching regex `/\b(part|ep|episode|#|vol|volume|chapter)\s*(\d+)\b/i` or common recurring prefix phrases (min 3 videos).
  Compute:
  - $\text{Series Avg Views}$ vs $\text{Channel Avg Views}$
  - $\text{Dropoff Rate}$: views of latest episode vs Episode 1
  - Status: `▲ Double Down` ($>1.2\times$ avg) or `▼ Diminishing` ($<0.7\times$ avg).
- **UI Integration:**
  - "Series Detector" card in Deep Dive Videos tab with series breakdown cards.
