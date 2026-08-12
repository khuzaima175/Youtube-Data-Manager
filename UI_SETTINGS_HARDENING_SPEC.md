# YT Tracker — Phase 11 Spec: Settings Control Room & Hardening (W3 + W5)

> **Agent instruction:** *"100% client-side execution, persistent user preferences in `localStorage('yt_user_prefs')`, sub-16ms render performance via memoization and `content-visibility: auto`, zero new YouTube quota usage."*

---

## 1. Preferences Schema (`userPrefs`)

```ts
interface UserPrefs {
  // Topics Engine
  customStopwords: string[];
  topicAliases: Record<string, string>; // e.g. { "gdt": "geometric dimensioning", "euv": "extreme ultraviolet" }

  // Alert Thresholds
  copycatThreshold: number; // default: 60 (40-90%)
  collisionRatio: number;   // default: 1.8 (1.2 - 3.0x)
  surgeVelThreshold: number; // default: 2000 (500 - 10000/day)

  // Appearance & Theme
  accentColor: string; // 'cyan' | 'emerald' | 'gold' | 'purple' | 'crimson'
  denseMode: boolean;

  // Cache & Refresh
  smartRefreshBudget: number; // default: 20 calls/day
}
```

---

## 2. Settings Control Room (`#settingsModal`)

### Tab 1: 🏷️ Topics
- **Custom Stopwords Manager**: List of active stopwords as removable pill chips with an `+ Add word` input. Saving dynamically updates the `STOP` set and recomputes `_topicCache`.
- **Topic Aliases Dictionary**: Key-value pair editor (e.g. `gdt` $\to$ `geometric dimensioning`). Merges synonym tokens under unified topic buckets.

### Tab 2: 🔔 Alerts & Thresholds
- **Copycat Match Threshold**: Range slider ($40\% – 90\%$, default $60\%$) with live value display.
- **Collision Traffic Shadow Multiplier**: Range slider ($1.2\times – 3.0\times$, default $1.8\times$).
- **Viral Surge Velocity Trigger**: Range slider ($500 – 10,000/\text{day}$, default $2000/\text{day}$).

### Tab 3: 💾 Data, Cache & Backup
- **Cache Storage Inspector**: Real-time breakdown of local storage size, number of cached channels, and cached videos count.
- **Cache Purge Actions**: 1-Click buttons to `Purge Topic Cache` or `Clear Video History`.
- **📦 Full Data Backup (Export JSON)**: Exports all tracked channels, pipeline cards, topic aliases, and inbox alerts into a single downloadable `yt_tracker_backup_[date].json`.
- **📥 Restore from Backup (Import JSON)**: File upload input reading and validating backup files, updating state and localStorage immediately.

### Tab 4: 🎨 Appearance & Preferences
- **Theme Accent Presets**: 5 curated visual color swatches (`Cyan (#00e5ff)`, `Emerald (#3ddc97)`, `Gold (#f5a623)`, `Purple (#8b5cf6)`, `Crimson (#ff4d4d)`).
- **Tour Reset & Replay**: Button to restart the 6-step Spotlight Tour.

---

## 3. Hardening & Performance (W5)

1. **Version-Key Memoization**:
   - `_memoCache` tracking `enrichVersion` hash.
   - Computations like `calcThreatScore`, `detectSeries`, and `calcEvergreenFingerprint` read from memoization cache if channel video timestamps have not changed.
2. **`content-visibility: auto`**:
   - Applied to `.lb-table tr`, `.dd-vrow`, `.rrow`, and `.pipeline-card` with `contain-intrinsic-size` to keep long catalog scroll rates at steady 60fps.
3. **Empty State Guards**:
   - Graceful UI prompts when tracking 0, 1, or 2 channels without throwing exceptions or rendering hollow tables.
4. **Accessible Focus Trap Utility**:
   - Traps Tab/Shift-Tab key navigation within opened modal dialogs (`#settingsModal`, `#scModal`, `#cmdPal`).
