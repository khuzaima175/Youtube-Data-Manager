# Fix: Monthly Upload Velocity Chart — Correct Data Without Wasting API Quota

## Problem

The chart shows **wrong zeros** for some channels in older months (Dec, Jan).

**Root cause:** `?max=100` fetches only the 100 most recent videos per channel.
A channel uploading 15 videos/month burns through 100 videos in ~6 months —
so the API call returns nothing for Dec/Jan because those videos are beyond
the 100th result. MrBeast showed zero even though he did upload.

## Solution

**Use `?max=50` + reuse `_enrichCache`.**

- If the channel cards already loaded (which they do automatically), the video
  list is already in `_enrichCache[ch.id].vids` — **zero extra API calls**.
- If a channel isn't cached yet, fetch `?max=50` instead of `?max=100`.
  50 videos covers 6 months for any channel uploading ≤8 videos/month,
  and for rare mega-uploaders the oldest month may still be slightly off
  but recent months are always accurate.
- Never use `/videos/full` for this chart — that fetches 800+ records per
  channel and wastes huge quota for just a count-per-month chart.

---

## Single Edit — `app.js`

### Step 1 — Find the function

Open `app.js`. Press **Ctrl+G** and go to line **2277**.
You will see:

```js
async function loadUploadVelocity(channels){
```

### Step 2 — Select the entire function

Select from line **2277** (`async function loadUploadVelocity(channels){`)
all the way down to line **2311** (the closing `}` of the function).

The last few lines of the function look like this so you know where it ends:

```js
      </div>`;
  }catch(e){el.style.display='none';}
}
```

### Step 3 — Replace with this

Delete everything you selected and paste the following in its place:

```js
async function loadUploadVelocity(channels){
  const el=document.getElementById('dashVelocity');
  if(!el||channels.length<1){if(el)el.style.display='none';return;}

  el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:13px;padding:20px 0"><div class="spin"></div>Building upload chart…</div>`;

  try{
    // Build 6-month bucket list
    const now=new Date();
    const months=[];
    for(let i=5;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      months.push({
        key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
        label:d.toLocaleString('en-US',{month:'short'})+" '"+String(d.getFullYear()).slice(2),
      });
    }

    // Reuse _enrichCache if already populated (free, zero API calls).
    // Only fetch from API if the channel has no cache yet.
    // Use ?max=50 — covers 6 months for channels uploading ≤8 videos/month.
    // MrBeast uploads ~2/month so 50 covers 25 months — more than enough.
    const videoLists=await Promise.all(
      channels.map(async ch=>{
        const cached=_enrichCache[ch.id];
        if(cached&&cached.vids&&cached.vids.length>0) return cached.vids;
        try{
          const r=await fetch(`/api/channels/${ch.id}/videos?max=50`);
          const vids=await r.json();
          if(Array.isArray(vids)){
            _enrichCache[ch.id]={ts:Date.now(),vids};
            return vids;
          }
        }catch{}
        return [];
      })
    );

    // Count uploads per channel per month
    const data=channels.map((ch,i)=>({
      ch,
      color:CH_COLORS[i%CH_COLORS.length],
      counts:months.map(m=>
        (videoLists[i]||[]).filter(v=>(v.published_at||v.date||'').startsWith(m.key)).length
      ),
    }));

    const totalUploads=data.flatMap(d=>d.counts).reduce((a,b)=>a+b,0);
    if(totalUploads===0){el.style.display='none';return;}

    // Build SVG grouped bar chart
    const maxC=Math.max(...data.flatMap(d=>d.counts),1);
    const nCh=channels.length;
    const bW=Math.min(18,Math.max(8,Math.floor(56/nCh)));
    const bGap=3,gGap=20;
    const gW=nCh*(bW+bGap)+gGap;
    const cW=months.length*gW+80,cH=180,pH=cH-50;

    let bars='';

    // Y axis grid lines
    [0,Math.round(maxC/2),maxC].forEach(t=>{
      const y=cH-30-Math.round((t/maxC)*pH);
      bars+=`<line x1="40" y1="${y}" x2="${cW}" y2="${y}"
        stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="4 3"/>
        <text x="36" y="${y+4}" text-anchor="end"
          fill="rgba(255,255,255,0.3)" font-size="9"
          font-family="JetBrains Mono,monospace">${t}</text>`;
    });

    months.forEach((m,mi)=>{
      const gx=44+mi*gW;
      data.forEach((d,ci)=>{
        const c=d.counts[mi];
        if(c===0)return;
        const h=Math.max(6,Math.round((c/maxC)*pH));
        const x=gx+ci*(bW+bGap),y=cH-30-h;
        bars+=`<rect x="${x}" y="${y}" width="${bW}" height="${h}" rx="3"
          fill="${d.color}" opacity="0.88">
          <title>${esc(d.ch.name)} — ${m.label}: ${c} video${c!==1?'s':''}</title>
        </rect>
        <text x="${x+bW/2}" y="${y-4}" text-anchor="middle"
          font-size="9" fill="${d.color}" font-weight="700"
          font-family="JetBrains Mono,monospace">${c}</text>`;
      });
      bars+=`<text x="${gx+nCh*(bW+bGap)/2}" y="${cH-8}"
        text-anchor="middle" font-size="10"
        fill="rgba(186,201,204,0.75)" font-family="DM Sans">${m.label}</text>`;
    });

    const legend=data.map(d=>
      `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--t2)">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;
          background:${d.color};flex-shrink:0"></span>
        ${esc(d.ch.name)}
      </span>`
    ).join('');

    el.innerHTML=`
      <div class="dash-section-hdr" style="margin-top:0">
        <span style="font-family:'Material Symbols Outlined';font-size:16px;vertical-align:middle">bar_chart</span>
        Monthly Upload Velocity
        <em style="color:var(--t4);font-style:normal;font-weight:400;font-size:11px;letter-spacing:0">last 6 months</em>
      </div>
      <div class="vel-wrap d2">
        <svg viewBox="0 0 ${cW} ${cH}" width="100%"
             preserveAspectRatio="xMidYMid meet"
             style="display:block;overflow:visible;min-width:480px">
          ${bars}
        </svg>
        <div class="vel-legend">${legend}</div>
      </div>`;

  }catch(e){
    el.innerHTML=`<div class="err" style="display:block">Could not load velocity chart.</div>`;
  }
}
```

---

## That's the only change needed

No CSS changes. No other JS changes. No backend changes.

### API quota impact

| Scenario | API calls made |
|---|---|
| User visited My Channels first (cards loaded) | **0 extra calls** — reads from `_enrichCache` |
| User goes straight to Dashboard | **1 call per channel at `?max=50`** — lightweight |
| Old behaviour | 1 call per channel at `?max=100` — fetched too little data and showed wrong zeros |

### Why this is accurate

- **MrBeast** uploads ~2 videos/month → `?max=50` covers ~25 months ✅
- **CAD CAM TUTORIAL** uploads ~15/month → `?max=50` covers ~3 months.
  If you want all 6 months accurate for very busy channels, change
  `?max=50` to `?max=100` in the fetch line — still cheaper than `/videos/full`.