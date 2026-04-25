# YTTracker — Phase 2 Full Implementation Plan

## Overview

This plan covers every requested feature upgrade across **seven areas**:
1. **My Channel Deep Analytics** — expanded dashboard with 5-tab modal
2. **Real-time Search Autocomplete** — live dropdown as you type
3. **API Quota Management & Caching** — keep the free tier sustainable
4. **Growth & Multi-channel Insights** — month-wise data, video growth speed
5. **Supabase Integration** — cloud database replacing JSON files (since this is for your friend)
6. **Vercel Deployment** — host it publicly so your friend can access it from anywhere
7. **YouTube Analytics API (OAuth)** — unlock private studio data (watch time, CTR, impressions)
8. **Gemini AI Chat** — ask questions about your channel data in natural language

---

## 📊 YouTube API v3 Free Tier — Honest Assessment

| Operation | Cost (units) | Your Current Usage |
|---|---|---|
| `search.list` (search by name) | **100 units** | Used when adding a channel by name |
| `channels.list` | **1 unit** | Used everywhere — very cheap |
| `playlistItems.list` | **1 unit** | Used for latest video / recent videos |
| `videos.list` | **1 unit** | Used for video stats |
| **Daily budget** | **10,000 units** | Resets midnight Pacific time |

### Current Cost Per Full Refresh (1 channel)
- `channels.list` = 1
- `playlistItems.list` = 1
- `videos.list` = 1
- **Total ≈ 3 units/channel**

With 5 channels → **~15 units for a full refresh**. You can do ~660 full refreshes/day. Even with autocomplete search (100 units per typed query), 50 typed searches = 5,000 units — still within budget.

### ⚠️ Quota Risk Areas
- **Real-time autocomplete search**: If every keystroke fires `search.list`, you burn 100 units per character. **Must debounce** (500ms minimum) and use `channels.list?forHandle=@username` (1 unit) when the user types an `@handle`.
- **Historical monthly data**: The API does NOT provide historical view-count timeseries. You must **store snapshots** yourself to compute month-over-month growth.
- **Video upload dates by month**: Only available for videos you fetch. To get all 465 CADable videos with dates, you'd need ~50+ page calls to the uploads playlist (max 50 items/page) = ~50 units total. Very feasible.

### ✅ Verdict: Free Tier Is Enough — With Smart Caching
You do **not** need Supabase or a paid database for current scale (5 channels, personal use). The right approach is:

- **Server-side in-memory cache** (already partially done with `_enrichCache` client-side)
- **Persistent JSON snapshot store** for monthly growth data (no DB needed)
- **Supabase is optional** — only worth it if you want: multi-device sync, data history going back months, or sharing with a team

---

## 🗺️ Feature Breakdown

---

## Feature 1 — My Channel Deep-Dive Analytics (Dashboard → "More Details")

### What It Adds
Clicking the CADable hero card opens a **full-screen analytics modal** (replacing the existing side drawer for your own channel) with 5 tabs:

#### Tab 1: Overview
All existing drawer content — stats, latest video, description, etc.

#### Tab 2: Monthly Performance 📅
- Fetch all videos (paginated, up to 500) and group by `publishedAt` month
- Render an **SVG bar chart** (no external libraries) — each bar = one calendar month, height = total views in that month
- Shows: best month 🏆, worst month 📉, YoY trend arrow
- Add a channel selector so you can toggle between your channel and competitors
- Reveals seasonality (e.g., "June always slower for CAD content")

#### Tab 3: Video Growth Speed 🚀
- All recent videos sorted by **views per day since upload**
- Color-coded rows: 🔥 >1K/day · ✅ >200/day · ⚠️ <50/day
- Columns: Thumbnail, Title, Days Live, Total Views, Views/Day, Trend
- This is the single best indicator of which content is resonating RIGHT NOW

#### Tab 4: vs. Competitors 📊
- Side-by-side comparison table for all tracked channels
- Metrics: Subscribers, Avg Views, Engagement Rate, Views/Day (latest), Upload Frequency, Audience %
- Your channel row is highlighted gold
- Each metric shows your rank position (1st, 2nd, etc.)

#### Tab 5: Growth Timeline 📈
- Line chart showing subscriber & total-view growth over time
- Powered by `snapshots.json` — a new daily snapshot file
- Shows "Tracking since April 20" with data points accumulating daily
- After a week you'll see a real trend line

---

## Feature 2 — Real-Time Search Autocomplete Dropdown

### What It Adds
As you type "mr beast" in the Search box, a dropdown instantly appears beneath the input showing up to **5 channel suggestions**:

```
┌─────────────────────────────────────────┐
│ [avatar] MrBeast           102M subs  [Select] │
│ [avatar] MrBeast Gaming     42M subs  [Select] │
│ [avatar] MrBeast2           14M subs  [Select] │
└─────────────────────────────────────────┘
```

Clicking **Select** immediately loads that channel's full details card below — no Enter press needed.

### How It Works (Quota-Safe)
- **500ms debounce** on `keyup` — only fires after you stop typing for half a second
- Skip queries ≤ 2 characters to avoid thrashing
- Calls `/api/channels/search-suggest?q=...` → backend calls `search.list(maxResults=5)` = **100 units**
- Clicking a suggestion fetches by Channel ID using `channels.list` = **1 unit** (not another search.list)
- **Quota guard**: if user does >8 autocomplete searches in 60 seconds, pause with a friendly message

### Special case: `@handle` input
If the user types `@cadable` (starts with `@`), use `channels.list?forHandle=@cadable` instead of `search.list` — costs only **1 unit** and is exact.

---

## Feature 3 — Caching Layer (Server-Side)

### 3A. `/api/channels/<id>/videos` — Add TTL Cache (15 min)
```python
_video_cache = {}  # { channel_id: { "data": [...], "ts": float } }
VIDEO_CACHE_TTL = 15 * 60  # 15 minutes
```
If cached data is fresh, return instantly (0 API units). Only re-fetch after TTL.

### 3B. New: `/api/channels/<id>/videos/full` — Paginated Full Fetch (4hr cache)
Fetches ALL videos (up to 500) by paginating the uploads playlist 50 at a time.  
Each page = 1 `playlistItems.list` call + 1 `videos.list` call = 2 units.  
500 videos = ~20 pages = **~40 units total**. Cached for 4 hours.

### 3C. New: `snapshots.json` — Persistent Growth History
```json
{
  "UCd5nH2Uusr0TA075ZW8R1zg": [
    { "date": "2026-04-20", "subscribers": 23700, "views": 3424470 },
    { "date": "2026-04-19", "subscribers": 23650, "views": 3419200 }
  ]
}
```
- Auto-saved every time **Refresh All** or **Refresh** is called
- Deduplicates by date (one entry per day per channel)
- No database needed — plain JSON, checked into git if you want version history

---

## Feature 4 — Monthly Watch Data & Cross-Channel Growth

### 4A. "This Month at a Glance" Panel (Dashboard, primary channel)
A new card on the Dashboard directly below the hero card:
- Videos uploaded this month: **X**
- Total views earned this month: **Y** (sum from full video list)
- Engagement rate this month: **Z%**
- Month-over-month delta: **↑ +12%** or **↓ -5%** (from snapshot diffs)

### 4B. "Fastest Growing This Month" Leaderboard (All channels)
New section below the Competitor Leaderboard:
- Ranks all channels by **view gain since last snapshot**
- Shows a sparkline progress bar
- Highlights if you're outgrowing competitors despite having fewer subs

### 4C. "Monthly Upload Velocity" Grouped Bar Chart (All channels)
- X-axis: last 6 months
- Each month has one bar per channel (color-coded)
- Shows who is publishing more/less over time
- Pure SVG — no Chart.js or D3 needed

---

## 🏗️ Proposed Changes

---

### Component 1: Backend

#### [MODIFY] [server.py](file:///g:/Youtube%20Data%20Manager/server.py)

1. Add `_video_cache` dict + `VIDEO_CACHE_TTL` constant (15 min)
2. Add `_full_cache` dict + `FULL_CACHE_TTL` constant (4 hr)
3. Modify existing `/api/channels/<id>/videos` to use `_video_cache`
4. Add `GET /api/channels/<id>/videos/full` — paginated, up to 500 videos
5. Add `SNAPSHOTS_FILE = Path(__file__).parent / "snapshots.json"`
6. Add `load_snapshots()` / `save_snapshot(channel_id, subs, views)` helpers
7. Modify `refresh_channel` to auto-call `save_snapshot()` after each refresh
8. Add `GET /api/snapshots/<channel_id>` — returns snapshot list
9. Add `GET /api/channels/search-suggest?q=` — returns 5 channel suggestions

---

### Component 2: Frontend Search Autocomplete

#### [MODIFY] [app.js](file:///g:/Youtube%20Data%20Manager/static/app.js)

1. Add `let _srDebounce = null; let _srQuotaCount = 0; let _srQuotaReset = Date.now();` globals
2. Replace `keydown` Enter handler with full `keyup` debounce handler
3. Add `doAutocomplete(q)` function
4. Add `renderSuggestions(items)` function — builds `#srDropdown` HTML
5. Add `selectSuggestion(channelId)` function — fetches by ID, calls `renderSearch()`
6. Add `closeSuggestions()` function
7. Handle Escape key and input blur (200ms delay before closing)

---

### Component 3: My Channel Analytics Modal

#### [MODIFY] [index.html](file:///g:/Youtube%20Data%20Manager/static/index.html)

Add a new `<div id="analyticsModal" class="analytics-modal">` to the body (hidden by default) with:
- Close button (×)
- Tab bar: Overview | Monthly | Growth Speed | vs Competitors | Timeline
- 5 `<div class="analytics-panel">` content areas

#### [MODIFY] [app.js](file:///g:/Youtube%20Data%20Manager/static/app.js)

1. Add `openAnalyticsModal(channelId)` function
2. Add `closeAnalyticsModal()` function
3. Add `switchAnalyticsTab(tabName)` function
4. Add `renderMonthlyChart(channelId)` — fetches `/videos/full`, builds SVG bar chart
5. Add `renderGrowthSpeed(channelId)` — builds sortable views/day table
6. Add `renderVsCompetitors()` — builds comparison table for all channels
7. Add `renderGrowthTimeline(channelId)` — fetches `/api/snapshots/<id>`, builds SVG line chart
8. Modify the "Click to view full details →" link on the hero card to call `openAnalyticsModal()` for primary channel

---

### Component 4: Dashboard Enhancements

#### [MODIFY] [app.js](file:///g:/Youtube%20Data%20Manager/static/app.js)

1. Add `buildThisMonthPanel(primary, fullVideos)` function
2. Add `buildFastestGrowing(snapshots)` function  
3. Add `buildUploadVelocity(channelVideoMap)` function with SVG grouped bar chart
4. Call these in `renderDash()` after the leaderboard section

---

### Component 5: Styles

#### [MODIFY] [style.css](file:///g:/Youtube%20Data%20Manager/static/style.css)

New CSS blocks:
- **Search dropdown**: `.sr-wrap { position: relative }` · `#srDropdown` (glassmorphism card, absolute, z-index 200) · `.sug-row` (flex, hover glow) · `.sug-avatar` (28px circle)
- **Analytics modal**: `.analytics-modal` (fixed full-screen overlay, z-index 500, backdrop blur) · `.am-header` · `.am-tabs` (pill-style tab bar) · `.am-tab.on` (active gradient glow) · `.am-panel` (fade-in animation)
- **Charts**: `.svg-chart` · `.chart-bar-label` · `.chart-bar-tooltip` (hover tooltip)
- **Dashboard new cards**: `.month-card` (gradient border card) · `.fgrow-row` · `.velocity-chart`

---

## 📋 Implementation Sequence

```
Phase A — Backend (server.py only):
  Step 1. Add _video_cache + modify /videos endpoint
  Step 2. Add /videos/full endpoint
  Step 3. Add snapshot helpers + auto-save on refresh
  Step 4. Add /api/snapshots/<id> endpoint
  Step 5. Add /api/channels/search-suggest endpoint

Phase B — Search Autocomplete (app.js + style.css):
  Step 6. Add debounce + quota guard globals
  Step 7. Add doAutocomplete() + renderSuggestions()
  Step 8. Add selectSuggestion() + closeSuggestions()
  Step 9. Add dropdown CSS

Phase C — Analytics Modal (index.html + app.js + style.css):
  Step 10. Add modal HTML to index.html
  Step 11. Add openAnalyticsModal / closeAnalyticsModal / switchTab
  Step 12. Implement Monthly Performance tab (SVG bar chart)
  Step 13. Implement Growth Speed tab (views/day table)
  Step 14. Implement vs Competitors tab
  Step 15. Implement Growth Timeline tab (SVG line chart)
  Step 16. Wire hero card → openAnalyticsModal
  Step 17. Add all modal + chart CSS

Phase D — Dashboard Enhancements (app.js + style.css):
  Step 18. Add "This Month at a Glance" panel
  Step 19. Add "Fastest Growing This Month" leaderboard
  Step 20. Add "Monthly Upload Velocity" grouped bar chart
  Step 21. Add CSS for new dashboard cards
```

---

---

## 🗄️ Feature 5 — Supabase Integration

Since you're building this **for your friend** (not just yourself), Supabase is now the right call. It replaces the JSON file store with a real cloud database your friend can access from any device/browser.

### What Supabase Replaces
| Current (JSON files) | Supabase replacement |
|---|---|
| `channels.json` | `channels` table |
| `snapshots.json` | `snapshots` table |
| In-memory video cache | `video_cache` table with `cached_at` column |

### Database Schema

```sql
-- Tracked channels
CREATE TABLE channels (
  id TEXT PRIMARY KEY,              -- YouTube channel ID
  name TEXT,
  handle TEXT,
  country TEXT,
  logo_url TEXT,
  subscribers_raw BIGINT,
  total_views_raw BIGINT,
  total_videos_raw INT,
  avg_views_raw INT,
  is_primary BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT now(),
  last_refreshed TIMESTAMPTZ,
  video_json JSONB                  -- latest video snapshot
);

-- Daily growth snapshots (one row per channel per day)
CREATE TABLE snapshots (
  id SERIAL PRIMARY KEY,
  channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
  recorded_at DATE DEFAULT CURRENT_DATE,
  subscribers BIGINT,
  total_views BIGINT,
  UNIQUE(channel_id, recorded_at)   -- one per day
);

-- Cached full video lists (avoids re-fetching 500 videos)
CREATE TABLE video_cache (
  channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
  videos JSONB,
  cached_at TIMESTAMPTZ DEFAULT now()
);
```

### Backend Changes for Supabase
- Replace `channels.json` read/write with `supabase-py` calls
- Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env`
- All existing API routes stay the same — only the storage layer changes
- Snapshots table has a `UNIQUE(channel_id, recorded_at)` constraint — safe to call `upsert` on every refresh

### Supabase Free Tier
- **500MB DB storage** — overkill for this use case (you'll use <5MB)
- **50,000 API calls/month** — easily sufficient
- **No credit card required**

---

## 🚀 Feature 6 — Vercel Deployment

### ⚠️ Critical Issue: Vercel is Serverless

Vercel runs **stateless serverless functions** — this means:
- No persistent filesystem (can't write `channels.json` or `snapshots.json`)
- Each request spins up a fresh container
- In-memory caches are cleared between requests

This is exactly why **Supabase is now required** — Vercel + Supabase perfectly complement each other.

### Architecture on Vercel
```
User's Browser
     │
     ▼
 Vercel (Flask serverless via @vercel/python)
     │  ← reads/writes
     ▼
 Supabase (PostgreSQL)
     │
     ▼
 YouTube Data API v3  (API key in Vercel env vars)
```

### Vercel Config (`vercel.json`)
```json
{
  "builds": [{ "src": "server.py", "use": "@vercel/python" }],
  "routes": [{ "src": "/(.*)", "dest": "server.py" }]
}
```

### Environment Variables on Vercel
Set these in Vercel Dashboard → Settings → Environment Variables:
- `YOUTUBE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`

### Deployment Steps
1. Push code to GitHub (already done)
2. Create Vercel account → Import the GitHub repo
3. Set environment variables in Vercel dashboard
4. Every `git push` auto-deploys — your friend gets the latest version instantly

### Vercel Limitations to Know
- **Max function duration**: 10 seconds (free tier) — fetching 500 videos in one call might hit this. Solution: paginate and cache aggressively in Supabase
- **Cold starts**: First request after inactivity takes ~2s — acceptable
- **Static files**: The `static/` folder is served correctly by `send_from_directory`

---

## 🔐 Feature 7 — YouTube Analytics API (OAuth) — Private Studio Data

### Your Question: "Can I connect my friend's channel for private data?"

**YES — 100% possible and it's the right approach.** Here's what this unlocks:

| Data | YouTube Data API v3 (current) | YouTube Analytics API (OAuth) |
|---|---|---|
| Subscriber count | ✅ Public | ✅ More accurate |
| Total views | ✅ Public | ✅ With date breakdown |
| **Watch Time (minutes)** | ❌ Not available | ✅ **YES** |
| **Impressions** | ❌ Not available | ✅ **YES** |
| **CTR (Click-Through Rate)** | ❌ Not available | ✅ **YES** |
| **Avg View Duration** | ❌ Not available | ✅ **YES** |
| **Traffic sources** | ❌ Not available | ✅ (search, browse, external) |
| **Audience demographics** | ❌ Not available | ✅ (age, gender, country) |
| **Revenue (if monetized)** | ❌ Not available | ✅ **YES** |
| **Daily/weekly breakdown** | ❌ Not available | ✅ Any date range |

### How OAuth Works for Your Use Case
Your friend visits the app → clicks "Connect YouTube Channel" → logs in with Google → grants permission → the app gets a **refresh token** stored in Supabase → from then on it can pull their private analytics 24/7 without them logging in again.

### Implementation Plan for OAuth
1. Add `google-auth-oauthlib` and `google-auth-httplib2` to `requirements.txt`
2. Create OAuth credentials (type: "Web Application") in Google Cloud Console
3. Add route `GET /auth/youtube` → redirects to Google consent screen
4. Add route `GET /auth/callback` → receives auth code → exchanges for tokens → stores `refresh_token` in Supabase
5. Add route `GET /api/analytics/private` → uses stored refresh token to call YouTube Analytics API
6. Show a "Connect Your Channel" button in the UI that triggers the OAuth flow

### What You Can Then Show
With private OAuth data, the "My Channel" tab becomes **dramatically more powerful**:
- Real watch time per video (not just views)
- Actual CTR heatmap (which months had best click rates)
- Audience retention curves per video
- Traffic source breakdown (how people find the channel)
- Daily impression funnel: impressions → clicks → watches
- Revenue timeline (if monetized)

> **Note**: The OAuth token only gives access to the channel that consented. Competitor data still uses the public API. This is exactly how YouTube Studio itself works.

---

## 🤖 Feature 8 — Gemini AI Chat Over Your Data

### Your Question: "What if I connect Gemini and ask questions in real time?"

**Brilliant idea — and very practical to implement.** Here's exactly how it works:

### How It Works (No Fine-Tuning Required)
Gemini doesn't need to "learn" your data. Instead, you **inject your channel data into each prompt** as context (this is called Retrieval-Augmented Generation / RAG). The model is already smart — it just needs the facts.

```
User types: "Which video has the best growth rate this month?"

Server builds prompt:
  "You are a YouTube analytics assistant. Here is the channel data:
   [JSON of all videos with views, dates, likes, comments]
   User question: Which video has the best growth rate this month?"

Gemini answers: "Your video 'Model Flange Elbow' uploaded on Apr 17 
  has gained 1,879 views in 3 days = ~626 views/day, making it..."
```

### What It Can Answer
- "How is my channel performing compared to last month?"
- "Which competitor is growing the fastest?"
- "What type of videos get the most engagement on my channel?"
- "When should I upload to maximize views?"
- "How long will it take me to reach 50K subscribers at this rate?"
- "Which of my videos underperformed and why might that be?"
- "Compare my engagement rate vs SourceCAD's"

### UI: Chat Panel
A collapsible chat panel in the bottom-right corner (like a support chat widget):
- Click the 🤖 button → panel slides up
- Text input at the bottom
- Chat history above (user messages right, AI messages left)
- Shows which data it's referencing (e.g., "Based on your last 20 videos...")

### Backend: `/api/ai/chat` Endpoint
```python
@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    question = request.json.get("question", "")
    channels = load_channels_from_supabase()
    # Inject data as context
    context = build_context(channels)  # JSON summary of all channel data
    prompt = f"""You are a YouTube analytics expert assistant...
    Channel data: {context}
    User question: {question}"""
    response = gemini_client.generate_content(prompt)
    return jsonify({"answer": response.text})
```

### Gemini Model Choice
- Use **`gemini-1.5-flash`** — fast, cheap, handles large context windows (up to 1M tokens)
- Cost: ~$0.00 for personal/low-traffic use (generous free tier)
- Add `google-generativeai` to `requirements.txt`

### Privacy Note
Only your channel's data (and the public data of tracked competitors) is sent to Gemini. No private YouTube OAuth data should be sent without explicit user consent.

---

---

## ✅ Verification Plan

### Backend Tests
- `GET /api/channels/search-suggest?q=mr+beast` → 5 items with `id, name, logo_url, subscribers`
- `GET /api/channels/<id>/videos/full` → 50+ videos with `published_at` dates
- `POST /api/channels/<id>/refresh` → Supabase snapshots table has a new row
- `GET /auth/youtube` → redirects to Google OAuth consent screen
- `POST /api/ai/chat` with `{"question":"which video is growing fastest?"}` → natural language answer

### UI Tests
- Type "Sol" in Search → dropdown appears within ~600ms
- Click a suggestion → result card fills instantly (no Enter needed)
- Press Escape → dropdown closes
- Click "View full details" on CADable hero → analytics modal opens with 5 tabs
- Monthly Performance tab → SVG bar chart with month labels
- Growth Speed tab → views/day table, color-coded rows
- vs Competitors tab → all channels with rank column
- Growth Timeline tab → line chart (after 2+ days of snapshots)
- Click 🤖 AI button → chat panel opens, type question → Gemini answers with channel context
- Connect YouTube Channel → OAuth flow completes → private analytics tab unlocks
- Deploy to Vercel → friend can open the URL and use all features

---

## 💡 Bonus Ideas & Recommendations

1. **Best Upload Day/Time** — analyze 465 videos' publish timestamps vs 7-day view velocity → "Your best slot is Tuesday 2–5 PM PST" — Gemini can compute this!
2. **Title Length vs. Views Scatter** — SVG scatter plot of title char count vs view count; often reveals a 50–70 char sweet spot
3. **Hook Score** — views/day in first 48h is a reliable CTR proxy; Gemini can identify patterns
4. **Competitor Gap Tracker** — "At current rate, you'll reach SourceCAD's subscribers in ~18 months" — computed from snapshot diffs
5. **Weekly Gemini Report** — a Vercel cron job that runs every Sunday, asks Gemini to summarize the week, and emails it
6. **Multi-user Support** — Supabase Row Level Security (RLS) lets you add multiple YouTube channels with separate OAuth tokens; each user sees only their own private data
