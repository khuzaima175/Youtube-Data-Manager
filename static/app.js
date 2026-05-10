/* ── Analytics Utilities ──────────────────────────────── */
function calcEngagementRate(likeCount,commentCount,viewCount){
  if(!viewCount||parseInt(viewCount)===0)return null;
  const rate=((parseInt(likeCount||0)+parseInt(commentCount||0))/parseInt(viewCount))*100;
  return parseFloat(rate.toFixed(1));
}
function engagementColor(rate){
  if(rate===null)return 'color:var(--t3)';
  if(rate>=4)return 'color:var(--gr)';
  if(rate>=2)return 'color:var(--gold)';
  return 'color:var(--rd)';
}
function isInactive(latestVideoDate,uploadFrequencyDays){
  if(!latestVideoDate||!uploadFrequencyDays)return false;
  const days=Math.floor((Date.now()-new Date(latestVideoDate).getTime())/(1000*60*60*24));
  return days>(uploadFrequencyDays*2);
}
function calcInactiveDays(latestVideoDate){
  if(!latestVideoDate)return 0;
  return Math.floor((Date.now()-new Date(latestVideoDate).getTime())/(1000*60*60*24));
}
function isHotVideo(latestViewsPerDay,totalViews,videoCount){
  if(!latestViewsPerDay||!totalViews||!videoCount)return false;
  const avgVPV=parseInt(totalViews)/parseInt(videoCount);
  const estAvgVPD=avgVPV/30;
  return latestViewsPerDay>estAvgVPD*2.5;
}
function calcRecentVsAvg(recentVideos,totalViews,totalVideoCount){
  if(!recentVideos||recentVideos.length<3||!totalViews||!totalVideoCount)return null;
  const last5=recentVideos.slice(0,5);
  const last5Avg=last5.reduce((sum,v)=>sum+parseInt(v.view_count||0),0)/last5.length;
  const allTimeAvg=parseInt(totalViews)/parseInt(totalVideoCount);
  if(allTimeAvg===0)return null;
  return Math.round(((last5Avg-allTimeAvg)/allTimeAvg)*100);
}
function recentVsAvgColor(diff){
  if(diff===null)return 'color:var(--t3)';
  if(diff>10)return 'color:var(--gr)';
  if(diff<-10)return 'color:var(--rd)';
  return 'color:var(--t3)';
}
function formatRecentVsAvg(diff){
  if(diff===null)return '—';
  if(diff>-10&&diff<10)return '~avg';
  return diff>0?`+${diff}%`:`${diff}%`;
}
function calcSubViewRatio(subscriberCount,totalViews){
  if(!totalViews||!subscriberCount||parseInt(totalViews)===0)return null;
  return parseFloat(((parseInt(subscriberCount)/parseInt(totalViews))*100).toFixed(1));
}
function subViewRatioColor(ratio){
  if(ratio===null)return 'color:var(--t3)';
  if(ratio>=10)return 'color:var(--gr)';
  if(ratio>=5)return 'color:var(--t1)';
  return 'color:var(--rd)';
}
function calcUploadFrequency(recentVideos){
  if(!recentVideos||recentVideos.length<2)return null;
  const sorted=[...recentVideos].sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));
  let totalDays=0,count=0;
  for(let i=0;i<sorted.length-1;i++){
    const diff=(new Date(sorted[i].published_at)-new Date(sorted[i+1].published_at))/(1000*60*60*24);
    if(diff>0){totalDays+=diff;count++;}
  }
  return count>0?Math.round(totalDays/count):null;
}
function viewsPerDay(viewCount,publishedAt){
  if(!viewCount||!publishedAt)return null;
  const days=Math.max(1,Math.floor((Date.now()-new Date(publishedAt).getTime())/(1000*60*60*24)));
  return parseFloat((parseInt(viewCount)/days).toFixed(1));
}
function fmtN(n){
  if(!n&&n!==0)return '—';
  n=parseFloat(n);
  if(n>=1e9)return(n/1e9).toFixed(1)+'B';
  if(n>=1e6)return(n/1e6).toFixed(1)+'M';
  if(n>=1e3)return(n/1e3).toFixed(1)+'K';
  return String(Math.round(n));
}

/* ── State & Utils ────────────────────────────────────── */
let all=[];
let sort='subscribers_raw';
let chSort='subscribers_raw';
const _enrichCache={};
const ENRICH_TTL=30*60*1000;
let _amChannelId=null;        // Currently open analytics modal channel id
let _amFullVideos=null;       // Cached full video list for modal
let _amSnapshots=null;        // Cached snapshots for modal

/* Drawer State */
let _drwLatestMode = 'latest';
let _drwOpenId = null;
let _drwVideosCache = null;

const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Route YouTube CDN images through our proxy to avoid hotlink-block
function proxyImg(url){
  if(!url) return '';
  if(url.includes('ggpht.com')||url.includes('ytimg.com')||url.includes('googleusercontent.com'))
    return '/api/img-proxy?url='+encodeURIComponent(url);
  return url;
}

/**
 * Returns true if a video object is a YouTube Short.
 * Checks: duration <= 62s, or URL contains /shorts/, or title has #shorts.
 */
function isYouTubeShort(v) {
  if (!v) return false;
  // Check URL
  if (v.url && v.url.includes('/shorts/')) return true;
  // Check duration (in seconds)
  // Backend returns duration_secs. Fallback to parsing if needed.
  let dur = 0;
  if (typeof v.duration_secs === 'number') {
    dur = v.duration_secs;
  } else if (v.duration_seconds) {
    dur = parseInt(v.duration_seconds, 10);
  } else if (v.duration && typeof v.duration === 'string') {
    // If it's MM:SS or H:MM:SS format
    const parts = v.duration.split(':').map(n => parseInt(n, 10));
    if (parts.length === 3) dur = parts[0]*3600 + parts[1]*60 + parts[2];
    else if (parts.length === 2) dur = parts[0]*60 + parts[1];
    else dur = parseInt(v.duration, 10) || 0;
  }

  if (dur > 0 && dur <= 180) return true;
  // Check title for #shorts tag
  const title = (v.title || '').toLowerCase();
  if (title.includes('#shorts') || title.includes('#short')) return true;
  return false;
}

function toast(msg,t=''){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className='show '+t;
  clearTimeout(el._t);el._t=setTimeout(()=>el.className='',3000);
}
function showErr(id,msg){const e=document.getElementById(id);e.textContent='⚠ '+msg;e.style.display='block';}
function hideErr(id){document.getElementById(id).style.display='none';}

function logoImg(url,name,cls){
  const fb=(name||'?')[0].toUpperCase();
  if(url)return `<img class="${cls}" src="${esc(proxyImg(url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`;
  return `<div class="${cls}-fb" style="display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-weight:800;color:var(--t3)">${fb}</div>`;
}

function greet(){
  const h=new Date().getHours();
  return h<12?'Good morning':h<18?'Good afternoon':'Good evening';
}

/* ── Navigation ───────────────────────────────────────── */
function sp(p){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.mob-nav-btn').forEach(x=>x.classList.remove('on'));
  document.getElementById('page-'+p).classList.add('on');
  const nl=document.getElementById('nav-'+p);if(nl)nl.classList.add('on');
  const mb=document.getElementById('mob-'+p);if(mb)mb.classList.add('on');
  if(p==='channels')renderChannels();
  if(p==='dash')renderDash();
}

/* ── Data ─────────────────────────────────────────────── */
async function fetchAll(){
  const r=await fetch('/api/channels');
  all=await r.json();
  const b=document.getElementById('sbBadge');
  if(b)b.textContent=all.length||'';
}

/* ── Refresh All Channels ──────────────────────────────────────── */
async function refreshAll(){
  const btn=document.getElementById('refAllBtn');
  if(btn){
    btn.style.animation='rot 0.5s linear infinite';
    btn.disabled=true;
    btn.title='Refreshing…';
  }
  try{
    await fetchAll();
    if(!all.length){toast('No channels to refresh','e');return;}
    toast(`Refreshing ${all.length} channel${all.length>1?'s':''}…`);
    let done=0;
    for(const ch of all){
      try{
        await fetch(`/api/channels/${ch.id}/refresh`,{method:'POST'});
      }catch{/* individual channel failure is non-fatal */}
      done++;
      if(done<all.length)toast(`Refreshing… ${done}/${all.length}`);
    }
    await fetchAll();
    // Re-render whichever page is visible
    const dashActive=document.getElementById('page-dash')?.classList.contains('on');
    const chActive=document.getElementById('page-channels')?.classList.contains('on');
    if(dashActive)renderDash();
    if(chActive)renderChannels();
    toast(`All ${all.length} channels refreshed!`,'s');
  }catch(ex){
    toast('Refresh failed — check console','e');
  }finally{
    if(btn){btn.style.animation='';btn.disabled=false;btn.title='Refresh all channels';}
  }
}

/* ════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════ */
async function renderDash(){
  const el=document.getElementById('dashMain');
  el.innerHTML=`<div style="display:flex;align-items:center;gap:12px;color:var(--t3);font-size:13px;padding:60px 0"><div class="spin"></div>Loading…</div>`;
  try{
    await fetchAll();
    const primary=all.find(c=>c.is_primary);
    const comps=all.filter(c=>!c.is_primary);
    let html='';

    html+=`<div class="dash-greet">${greet()}</div>
    <div class="dash-title">${primary?esc(primary.name)+' Analytics':'YT Tracker Dashboard'}</div>`;

    if(!primary){
      html+=`<div class="no-pr au">
        <div class="no-pr-ico"><span style="font-family:'Material Symbols Outlined';font-size:48px;color:var(--t4)">subscriptions</span></div>
        <h3>Set your primary channel</h3>
        <p>Go to <strong>My Channels</strong>, add your channel, then click <strong>Set Mine</strong> to see your analytics here.</p>
        <button class="btn btn-pr" onclick="sp('channels')">Open My Channels</button>
      </div>`;
    } else {
      const v=primary.video||{};
      html+=`
      <div class="my-hero au" onclick="openAnalyticsModal('${esc(primary.id)}')">
        <div class="my-hero-top">
          <div class="my-hero-l">
            ${primary.logo_url
              ?`<img class="my-hero-logo" src="${esc(proxyImg(primary.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`
              :`<div class="my-hero-logo" style="display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-size:28px;font-weight:800;color:var(--t3)">${(primary.name||'?')[0].toUpperCase()}</div>`}
            <div class="my-hero-text">
              <div class="my-hero-name">${esc(primary.name)}</div>
              <div class="my-hero-meta">
                ${primary.handle?`<span>${esc(primary.handle)}</span>`:''}
                ${primary.country?`<span class="meta-sep">•</span><span>${esc(primary.country)}</span>`:''}
                ${primary.created?`<span class="meta-sep">•</span><span>Since ${primary.created}</span>`:''}
              </div>
              <div class="my-hero-hint">Click to view full analytics ›</div>
            </div>
          </div>
          ${v.title?`
          <div class="my-hero-vid" onclick="event.stopPropagation();window.open('${esc(v.url)}','_blank')">
            <div class="my-vid-lbl">Latest Upload</div>
            <div class="my-vid-mini">
              <img class="my-vid-thumb" src="${esc(v.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
              <div class="my-vid-body">
                <div class="my-vid-title" title="${esc(v.title)}">${esc(v.title)}</div>
                <div class="my-vid-meta"><span class="ms-icon">visibility</span> ${esc(v.views)} <span class="meta-sep">•</span> ${v.date||''}</div>
              </div>
            </div>
          </div>`:''}
        </div>
        <div class="my-stats">
          <div class="my-stat"><div class="my-stat-lbl">Subscribers</div><div class="my-stat-val gold">${esc(primary.subscribers)}</div></div>
          <div class="my-stat"><div class="my-stat-lbl">Total Views</div><div class="my-stat-val">${esc(primary.total_views)}</div></div>
          <div class="my-stat"><div class="my-stat-lbl">Videos</div><div class="my-stat-val">${esc(primary.total_videos)}</div></div>
          <div class="my-stat"><div class="my-stat-lbl">Avg Views</div><div class="my-stat-val green">${esc(primary.avg_views)}</div></div>
        </div>
      </div>`

      html+=`<div class="dash-section-hdr">📊 Performance</div>`;
      html+=`<div id="dashMonthGlance" class="dash-mg-wrap au"><div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:13px"><div class="spin"></div>Loading this month…</div></div>`;

      if(all.length>1)html+=buildLB(primary,comps);

      html+=`<div class="dash-section-hdr">🎬 Content</div>`;
      html+=`<div id="dashVelocity"></div>`;

      const forRace=[primary,...comps].filter(c=>c.video&&c.video.title);
      if(forRace.length){
        const ranked=[...forRace].sort((a,b)=>(b.video.views_raw||0)-(a.video.views_raw||0));
        const rankIco = i => ['1','2','3'][i] || String(i+1);
        html+=`<div class="dash-section-hdr" style="border:none;margin-bottom:0">Latest Video Face-off <em style="color:var(--t4);font-style:normal;font-weight:400;font-size:11px;margin-left:8px">${forRace.length} channels compared</em></div>
        <div class="vr-grid d2">`;
        forRace.forEach(ch=>{
          const vv=ch.video,ri=ranked.findIndex(x=>x.id===ch.id),isMine=ch.id===primary.id;
          html+=`<div class="vr-card ${isMine?'mc':''}" onclick="openAnalyticsModal('${esc(ch.id)}')">
            <img class="vr-thumb" src="${esc(vv.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
            <div class="vr-body">
              <div class="vr-ch-row">
                ${ch.logo_url?`<img class="vr-ch-logo" src="${esc(proxyImg(ch.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`:
                  `<div class="vr-ch-logo" style="display:flex;align-items:center;justify-content:center;font-weight:700;font-size:8px;color:var(--t3)">${(ch.name||'?')[0]}</div>`}
                <span class="vr-ch-name" style="${isMine?'color:var(--gold)':''}">${esc(ch.name)}</span>
                <span class="rank-badge rank-${ri+1}">${rankIco(ri)}</span>
              </div>
              <div class="vr-title" title="${esc(vv.title)}">${esc(vv.title)}</div>
              <div class="vr-views">${esc(vv.views)} <span style="font-size:11px;font-weight:400;color:var(--t3)">views</span></div>
              <div class="vr-date"><span class="ms-icon">calendar_today</span> ${vv.date} <span class="meta-sep">•</span> <span class="ms-icon">thumb_up</span> ${esc(vv.likes)}</div>
            </div>
          </div>`;
        });
        html+=`</div>`;
      }

      html+=`<div class="dash-section-hdr">📁 Your Uploads</div>`;
      html+=`<div class="ru-grid d4" id="ruGrid">
          <div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:12.5px"><div class="spin"></div>Loading…</div>
        </div>`;
      
      html+=`<div id="dashFastGrow"></div>`;
    }

    el.innerHTML=html;
    if(all.length>1)setTimeout(animateBars,60);
    /* Load Feature 4 async panels */
    if(primary){
      loadThisMonthPanel(primary.id);
      if(all.length>1){loadFastestGrowing([primary,...comps]);loadUploadVelocity([primary,...comps]);}
    }
    setTimeout(()=>{
      document.querySelectorAll('.count-up').forEach(el=>{
        const target=parseFloat(el.dataset.target||0);
        const suffix=el.dataset.suffix||'';
        const dur=1200;const step=16;const steps=dur/step;
        let cur=0;const inc=target/steps;
        const t=setInterval(()=>{
          cur=Math.min(cur+inc,target);
          const v=target>=10?Math.round(cur):cur.toFixed(1);
          el.textContent=v+suffix;
          if(cur>=target)clearInterval(t);
        },step);
      });
    },100);

    if(primary){
      try{
        const r2=await fetch(`/api/channels/${primary.id}/videos?max=6`);
        const vids=await r2.json();
        const ru=document.getElementById('ruGrid');
        if(!ru)return;
        if(!vids.length){ru.innerHTML='<p style="color:var(--t3);font-size:13px">No uploads found.</p>';return;}
        ru.innerHTML=vids.map((v,i)=>`
          <a class="ru-card au" style="animation-delay:${i*.04}s" href="${esc(v.url)}" target="_blank" rel="noopener">
            <img class="ru-thumb" src="${esc(v.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
            <div class="ru-body">
              <div class="ru-title">${esc(v.title)}</div>
              <div class="ru-meta">
                <span class="ru-stat" style="color:var(--pr)"><span class="ms-icon">visibility</span> ${esc(v.views)}</span>
                <span class="ru-stat" style="color:var(--gr)"><span class="ms-icon">thumb_up</span> ${esc(v.likes)}</span>
                <span style="font-size:11px;color:var(--t3);margin-left:auto">${v.date}</span>
              </div>
            </div>
          </a>`).join('');
      }catch{
        const ru=document.getElementById('ruGrid');
        if(ru)ru.innerHTML='<p style="color:var(--t3);font-size:13px">Could not load.</p>';
      }
    }
  }catch(ex){
    el.innerHTML=`<div class="err" style="display:block">Error: ${esc(String(ex))}</div>`;
  }
}

function buildLB(primary, comps) {
  const rows_all = [primary, ...comps];
  const sorted = [...rows_all].sort((a, b) => (b[sort] || 0) - (a[sort] || 0));

  const lbl  = sort === 'subscribers_raw' ? 'Subscribers'
             : sort === 'avg_views_raw'   ? 'Avg Views'
             : 'Total Views';
  const lbl2 = sort === 'subscribers_raw' ? 'Avg Views' : 'Subscribers';
  const fld2 = sort === 'subscribers_raw' ? 'avg_views' : 'subscribers';

  // Logarithmic scale so MrBeast vs small channels both show a meaningful bar
  const maxVal = Math.max(...rows_all.map(c => c[sort] || 0), 1);
  function logPct(val) {
    if (!val || val <= 0) return 0;
    return Math.round((Math.log10(val + 1) / Math.log10(maxVal + 1)) * 100);
  }

  const rk = ['1st', '2nd', '3rd'];
  let rows = '';
  sorted.forEach((ch, i) => {
    const mine  = ch.id === primary.id;
    const pct   = logPct(ch[sort] || 0);
    const dispV = sort === 'subscribers_raw' ? ch.subscribers
                : sort === 'avg_views_raw'   ? ch.avg_views
                : ch.total_views;
    const vsColor = i === 0 ? 'var(--gold)' : 'var(--t3)';
    const vsText = i === 0 ? '👑 Leader' : '';

    rows += `
    <div class="lb-row ${mine ? 'mine' : ''}" onclick="openAnalyticsModal('${esc(ch.id)}')">
      <div class="lb-rk">
        <span class="rank-badge rank-${i + 1}">${rk[i] || i + 1}</span>
      </div>
      <div class="lb-ch">
        ${ch.logo_url
          ? `<img class="lb-logo" src="${esc(proxyImg(ch.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`
          : `<div class="lb-logo-fb">${(ch.name || '?')[0].toUpperCase()}</div>`}
        <div>
          <div class="lb-ch-name">${esc(ch.name)}${mine ? '<span class="lb-you">⭐ You</span>' : ''}</div>
          <div class="lb-ch-hdl">${esc(ch.handle || '')}</div>
        </div>
      </div>
      <div class="lb-bar-col">
        <div class="lb-log-bar-bg">
          <div class="lb-log-bar ${mine ? 'mb' : ''}" data-pct="${pct}" style="width:0%"></div>
        </div>
        <span class="lb-vs" style="color:${vsColor}">${vsText}</span>
      </div>
      <div class="lb-num ${mine ? 'hi' : ''}">${esc(dispV)}</div>
      <div class="lb-num lo">${esc(ch[fld2])}</div>
      <div class="lb-upload">${ch.video?.date ?? '—'}</div>
      <div class="lb-arr">›</div>
    </div>`;
  });

  return `
  <div class="section-hdr">
    <span style="font-family:'Material Symbols Outlined';font-size:16px;vertical-align:middle">leaderboard</span>
    Competitor Leaderboard
  </div>
  <div class="lb d2">
    <div class="lb-top">
      <span class="lb-top-t">Ranked by ${lbl}</span>
      <div class="lb-sorts">
        <button class="lsb ${sort === 'subscribers_raw' ? 'on' : ''}" onclick="setSort('subscribers_raw')">Subscribers</button>
        <button class="lsb ${sort === 'avg_views_raw'   ? 'on' : ''}" onclick="setSort('avg_views_raw')">Avg Views</button>
        <button class="lsb ${sort === 'total_views_raw' ? 'on' : ''}" onclick="setSort('total_views_raw')">Total Views</button>
      </div>
    </div>
    <div class="lb-head">
      <span class="lh">#</span>
      <span class="lh" style="text-align:left">Channel</span>
      <span class="lh">Scale</span>
      <span class="lh">${lbl}</span>
      <span class="lh">${lbl2}</span>
      <span class="lh">Last Upload</span>
      <span class="lh"></span>
    </div>
    ${rows}
  </div>`;
}

function setSort(f){sort=f;renderDash();}
function animateBars(){document.querySelectorAll('.lb-log-bar').forEach(b=>b.style.width=(b.dataset.pct||0)+'%');}

/* ════════════════════════════════════════════════════════
   DRAWER LOGIC (Terminal Luxe)
════════════════════════════════════════════════════════ */






function buildWordCloud(vids){
  if(!vids||vids.length<2)return '';
  const stop=new Set(['the','and','for','with','how','that','this','from','your','more','have','will','are','can','all','not','into','what','when','make','were','been','its','was','but','our','you','they','their','has','had','also','about','some','after','using','use','tutorial','video','part','best','full','guide','new','top','most','these','then','than','very','just','out','get','let','now','see','too','over','back','even','each','does','off','again','here','two','into','take','much','well','made']);
  const freq={};
  vids.forEach(v=>{(v.title||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>3&&!stop.has(w)).forEach(w=>{freq[w]=(freq[w]||0)+1;});});
  const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,14);
  if(!top.length)return '';
  const maxC=top[0][1];
  const tags=top.map(([w,c])=>{
    const op=0.45+(c/maxC)*0.55;
    return `<span class="drw-topic-tag">${esc(w)} <em>×${c}</em></span>`;
  }).join('');
  return `<div>
    <div class="drw-analytics-sect-hdr" style="margin-top:24px">Topic Patterns <em>last ${vids.length} videos</em></div>
    <div class="drw-topic-wrap">${tags}</div>
  </div>`;
}


/* ════════════════════════════════════════════════════════
   IMPROVED ANALYTICS BUILDERS
════════════════════════════════════════════════════════ */

function buildViewsTrendImproved(longFormVids) {
  const sorted = [...longFormVids]
    .filter(v => v.published_at || v.date)
    .sort((a,b) => new Date(a.published_at||a.date) - new Date(b.published_at||b.date))
    .slice(-20);

  if (sorted.length < 2) {
    return `<div class="am-trend-empty">Not enough data — need at least 2 videos to show a trend.</div>`;
  }

  const values = sorted.map(v => v.view_count ?? v.views_raw ?? 0);
  const maxV   = Math.max(...values, 1);
  const minV   = Math.min(...values);
  const rangeV = maxV - minV || 1;

  const half = Math.floor(sorted.length / 2);
  const recentAvg = values.slice(half).reduce((a,b)=>a+b,0) / Math.max(values.length-half,1);
  const olderAvg  = values.slice(0,half).reduce((a,b)=>a+b,0) / Math.max(half,1);
  const trendPct  = olderAvg > 0 ? Math.round(((recentAvg-olderAvg)/olderAvg)*100) : 0;
  const trendLbl = trendPct > 10
    ? `▲ ${trendPct}% trending up`
    : trendPct < -10
    ? `▼ ${Math.abs(trendPct)}% declining`
    : `● ${Math.abs(trendPct)}% stable`;
  const trendC    = trendPct > 10 ? 'var(--gr)' : trendPct < -10 ? 'var(--rd)' : 'var(--t3)';

  const W = 820, H = 120, padL = 60, padR = 16, padT = 14, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const pts = sorted.map((v, i) => {
    const x = padL + (i / (sorted.length - 1)) * plotW;
    const y = padT + plotH - ((values[i] - minV) / rangeV) * plotH;
    return [x, y];
  });

  const polyline = pts.map(([x,y]) => `${x},${y}`).join(' ');
  const areaPath = `M${pts[0][0]},${H-padB} ` +
    pts.map(([x,y]) => `L${x},${y}`).join(' ') +
    ` L${pts[pts.length-1][0]},${H-padB} Z`;

  const yLabels = [
    { val: maxV, y: padT },
    { val: Math.round((maxV+minV)/2), y: padT + plotH/2 },
    { val: minV, y: padT + plotH },
  ];
  const yTickLines = yLabels.map(t =>
    `<line x1="${padL}" y1="${t.y}" x2="${W-padR}" y2="${t.y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
     <text x="${padL-6}" y="${t.y+4}" text-anchor="end" fill="rgba(255,255,255,0.3)" font-size="9" font-family="JetBrains Mono,monospace">${fmtN(t.val)}</text>`
  ).join('');

  const dots = pts.map(([x,y], i) => {
    const v = sorted[i];
    const dateStr = (v.published_at||v.date||'').slice(0,10);
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--pr)" stroke="var(--sf-low)" stroke-width="2" style="cursor:pointer">
      <title>${esc(v.title||'')} — ${fmtN(values[i])} views • ${dateStr}</title>
    </circle>`;
  }).join('');

  const xDateLabels = [
    { idx:0, anchor:'start' },
    { idx: Math.floor((sorted.length-1)/2), anchor:'middle' },
    { idx: sorted.length-1, anchor:'end' },
  ].map(({ idx, anchor }) => {
    const [x] = pts[idx];
    const d = (sorted[idx].published_at||sorted[idx].date||'').slice(0,10);
    return `<text x="${x}" y="${H-4}" text-anchor="${anchor}" fill="rgba(255,255,255,0.25)" font-size="9" font-family="JetBrains Mono,monospace">${d}</text>`;
  }).join('');

  return `
    <div class="am-trend-wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;font-weight:700;color:var(--t2)">Per-video views (up to 20 recent)</span>
        <span style="font-size:11px;color:${trendC};font-weight:700">${trendLbl}</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}" class="am-trend-svg">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--pr)" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="var(--pr)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${yTickLines}
        <path d="${areaPath}" fill="url(#trendGrad)"/>
        <polyline points="${polyline}" fill="none" stroke="var(--pr)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
        ${xDateLabels}
      </svg>
      <div class="am-trend-footer">
        <span style="color:var(--t4);font-size:10px">${sorted.length} videos · hover dots for details</span>
        <span style="color:var(--t4);font-size:10px">peak: <span style="color:var(--pr);font-weight:700">${fmtN(maxV)}</span></span>
      </div>
    </div>`;
}

function buildCalendarImproved(longFormVids) {
  if (!longFormVids.length) return `<div class="am-trend-empty">No video data available.</div>`;

  const dateMap = {};
  longFormVids.forEach(v => {
    const d = (v.published_at||v.date||'').slice(0,10);
    if (d) dateMap[d] = (dateMap[d]||0) + 1;
  });

  const today = new Date(); today.setHours(0,0,0,0);
  const totalDays = 52 * 7;
  const startDate = new Date(today); startDate.setDate(today.getDate() - totalDays + 1);

  const cellSize = 11, gap = 2, cols = 52, rows = 7;
  const W = cols * (cellSize + gap) + 36, H = rows * (cellSize + gap) + 24;

  const dayLabels = ['S','M','T','W','T','F','S'];
  const dayLabelSvg = dayLabels.map((d,i) =>
    i % 2 === 1 ? `<text x="0" y="${i*(cellSize+gap)+cellSize}" fill="rgba(255,255,255,0.2)" font-size="8" font-family="JetBrains Mono,monospace">${d}</text>` : ''
  ).join('');

  let cells = '', monthLabels = '', prevMonth = -1;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const dayOffset = col * 7 + row;
      const d = new Date(startDate);
      d.setDate(d.getDate() + dayOffset);
      if (d > today) continue;

      const iso = d.toISOString().slice(0,10);
      const count = dateMap[iso] || 0;
      const x = 28 + col * (cellSize + gap);
      const y = row * (cellSize + gap);

      const fill = count === 0 ? 'rgba(255,255,255,0.04)'
        : count === 1 ? 'rgba(0,229,255,0.28)'
        : count === 2 ? 'rgba(0,229,255,0.58)'
        : 'rgba(0,229,255,0.88)';
      const stroke = count > 0 ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.03)';
      const tooltip = count > 0 ? `${count} upload${count>1?'s':''} on ${iso}` : `No uploads on ${iso}`;

      cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" ry="2" fill="${fill}" stroke="${stroke}" stroke-width="0.5"><title>${tooltip}</title></rect>`;

      const m = d.getMonth();
      if (row === 0 && m !== prevMonth) {
        const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        monthLabels += `<text x="${x}" y="${H-4}" fill="rgba(255,255,255,0.22)" font-size="8" font-family="JetBrains Mono,monospace">${mNames[m]}</text>`;
        prevMonth = m;
      }
    }
  }

  // Streak calculation
  const sortedDates = Object.keys(dateMap).sort().reverse();
  let streak = 0, lastW = -1;
  for (const iso of sortedDates) {
    const wa = Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 864e5));
    if (streak === 0 && wa <= 1) { streak = 1; lastW = wa; }
    else if (streak > 0 && wa === lastW + 1) { streak++; lastW = wa; }
    else if (streak > 0) break;
  }
  const sc = streak >= 4 ? 'var(--gr)' : streak >= 2 ? 'var(--pr)' : 'var(--t3)';
  const sl = streak >= 4
    ? `${streak}-week streak`
    : streak >= 2
    ? `${streak} weeks in a row`
    : streak === 1
    ? `1 upload this week`
    : `No uploads this week`;

  const totalUploads = Object.values(dateMap).reduce((s,n)=>s+n,0);
  const activeDays = Object.keys(dateMap).length;

  return `
    <div class="am-cal-wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;font-weight:700;color:var(--t2)">${totalUploads} uploads · ${activeDays} active days</span>
        <span style="font-size:11px;color:${sc};font-weight:700">${sl}</span>
      </div>
      <svg viewBox="0 0 ${W} ${H+20}" width="100%" class="am-cal-svg">
        ${dayLabelSvg}
        ${cells}
        ${monthLabels}
      </svg>
      <div class="am-trend-footer">
        <span style="color:var(--t4);font-size:10px">Past 52 weeks · hover cells for dates</span>
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:9px;color:var(--t4)">Less</span>
          ${['rgba(255,255,255,0.04)','rgba(0,229,255,0.28)','rgba(0,229,255,0.58)','rgba(0,229,255,0.88)'].map(c=>`<span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>`).join('')}
          <span style="font-size:9px;color:var(--t4)">More</span>
        </div>
      </div>
    </div>`;
}

function buildEngTrendImproved(vids) {
  if (!vids || vids.length < 4) return '';
  const sorted = [...vids].sort((a, b) => new Date(a.published_at || a.date) - new Date(b.published_at || b.date));
  const last12 = sorted.slice(-12);
  const rates = last12.map(v => calcEngagementRate(v.like_count ?? 0, v.comment_count ?? 0, v.view_count ?? v.views_raw ?? 0) ?? 0);
  const validRates = rates.filter(r => r > 0);
  if (validRates.length < 3) return '';

  const maxR = Math.max(...rates, 0.1);
  const avgRate = (validRates.reduce((a, b) => a + b, 0) / validRates.length).toFixed(1);

  const halfIdx = Math.floor(rates.length / 2);
  const recentSlice = validRates.slice(Math.ceil(validRates.length / 2));
  const olderSlice = validRates.slice(0, halfIdx);
  const recentEng = recentSlice.length ? recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length : 0;
  const olderEng = olderSlice.length ? olderSlice.reduce((a, b) => a + b, 0) / olderSlice.length : 0;
  const chg = olderEng > 0 ? ((recentEng - olderEng) / olderEng) * 100 : 0;
  const tc = chg > 5 ? 'var(--gr)' : chg < -5 ? 'var(--rd)' : 'var(--t3)';
  const tl = chg > 5 ? '▲ Growing' : chg < -5 ? '▼ Declining' : '● Stable';

  const bars = last12.map((v, i) => {
    const r = rates[i];
    const pct = Math.max(4, Math.round((r / maxR) * 100));
    const c = r >= 4 ? 'var(--gr)' : r >= 2 ? 'var(--gold)' : 'var(--rd)';
    const titleShort = esc(v.title || '');
    return `<div class="drw-trend-bar-wrap">
      <div class="drw-trend-bar" style="height:${pct}%;background:${c}"></div>
      <div class="drw-trend-tooltip">${esc(titleShort)}<br><strong>${r.toFixed(1)}% engagement</strong></div>
    </div>`;
  }).join('');

  return `<div class="drw-analytics-sect-hdr" style="margin-top:24px">Engagement Trend <em style="color:${tc}">${tl} · avg ${avgRate}%</em></div>
  <div class="drw-trend-chart">
    <div class="drw-trend-bars">${bars}</div>
    <div class="drw-trend-footer">
      <span>Older <strong style="font-family:'JetBrains Mono',monospace;color:var(--t2)">${olderEng.toFixed(1)}%</strong></span>
      <span style="font-size:9px;color:var(--t4)">Hover bars for details</span>
      <span>Recent <strong style="font-family:'JetBrains Mono',monospace;color:${tc}">${recentEng.toFixed(1)}%</strong></span>
    </div>
  </div>`;
}

function buildDurationImproved(vids) {
  const wd = vids.filter(v => v.duration_secs > 0);
  if (!wd.length) return '';
  const fmtS = s => { const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`; };
  const avg = Math.round(wd.reduce((s, v) => s + v.duration_secs, 0) / wd.length);
  const mn = Math.min(...wd.map(v => v.duration_secs));
  const mx = Math.max(...wd.map(v => v.duration_secs));
  const cat = avg < 300 ? 'Short-form' : avg < 900 ? 'Mid-length' : avg < 1800 ? 'Long-form' : 'Deep Dive';
  const cc = avg < 300 ? 'var(--rd)' : avg < 900 ? 'var(--pr)' : avg < 1800 ? 'var(--gr)' : 'var(--gold)';
  return `<div class="drw-analytics-sect-hdr" style="margin-top:24px">Video Length <em style="color:${cc}">${cat}</em></div>
  <div class="drw-dur-grid">
    <div class="drw-dur-cell">
      <div class="drw-dur-val">${fmtS(avg)}</div>
      <div class="drw-dur-lbl">Average</div>
    </div>
    <div class="drw-dur-cell">
      <div class="drw-dur-val" style="color:var(--pr)">${fmtS(mn)}</div>
      <div class="drw-dur-lbl">Shortest</div>
    </div>
    <div class="drw-dur-cell">
      <div class="drw-dur-val" style="color:var(--gold)">${fmtS(mx)}</div>
      <div class="drw-dur-lbl">Longest</div>
    </div>
  </div>`;
}

const buildViewsTrend = buildViewsTrendImproved;
const buildCalendar = buildCalendarImproved;

/* ════════════════════════════════════════════════════════
   CARD ASYNC ENRICHMENT (cached)
════════════════════════════════════════════════════════ */
async function enrichCards(){
  const now=Date.now();
  const promises=all.map(async ch=>{
    try{
      const cached=_enrichCache[ch.id];
      const vids=cached&&(now-cached.ts)<ENRICH_TTL
        ? cached.vids
        : await (async()=>{
            const r=await fetch(`/api/channels/${ch.id}/videos?max=15`);
            const v=await r.json();
            if(Array.isArray(v)) _enrichCache[ch.id]={ts:now,vids:v};
            return Array.isArray(v)?v:[];
          })();

      if(!vids.length)return;
      const card=document.getElementById('ctr-'+ch.id);
      if(!card)return;
      const sorted=[...vids].sort((a,b)=>new Date(b.published_at||b.date)-new Date(a.published_at||a.date));

      // Add sparkline bars
      const sparkEl = document.getElementById('cc-spark-'+ch.id);
      if(sparkEl && vids.length >= 2){
        const last8 = [...vids]
          .sort((a,b) => new Date(a.published_at||a.date) - new Date(b.published_at||b.date))
          .slice(-8);
        const maxV = Math.max(...last8.map(v => v.view_count ?? v.views_raw ?? 0), 1);
        sparkEl.innerHTML = last8.map(v => {
          const vc = v.view_count ?? v.views_raw ?? 0;
          const pct = Math.max(8, Math.round((vc/maxV)*100));
          const c = vc >= (maxV*0.8) ? 'var(--pr)' : 'var(--t4)';
          const isShort = isYouTubeShort(v);
          const shortMark = isShort ? ' • Short' : '';
          // Truncate title via CSS
          const titleStr = esc(v.title || '');
          const dateStr = v.published_at ? new Date(v.published_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : (v.date||'');
          return `<div class="cc-spark-bar cc-spark-tip-wrap" style="height:${pct}%;background:${c}${isShort?';opacity:0.45':''}">
            <div class="cc-spark-tooltip" title="${esc(v.title || '')}">
              <div class="cc-spark-tip-title">${esc(titleStr)}${shortMark}</div>
              <div class="cc-spark-tip-views">${fmtN(vc)} views</div>
              <div class="cc-spark-tip-date">${dateStr}</div>
            </div>
          </div>`;
        }).join('');

      }

      // Fill engagement rate
      const recent5 = vids.slice(0,5);
      const avgEng = recent5.reduce((sum,v) => {
        const r = calcEngagementRate(v.like_count??0, v.comment_count??0, v.view_count??v.views_raw??0);
        return sum + (r ?? 0);
      }, 0) / recent5.length;
      const engEl = document.getElementById('cc-eng-'+ch.id);
      if(engEl && avgEng > 0){
        engEl.textContent = avgEng.toFixed(1)+'%';
        engEl.style.color = avgEng >= 4 ? 'var(--gr)' : avgEng >= 2 ? 'var(--gold)' : 'var(--rd)';
      }
      
      let streak=0,lastW=-1;
      for(const v of sorted){
        const wa=Math.floor((now-new Date(v.published_at||v.date).getTime())/(7*864e5));
        if(streak===0&&wa<=1){streak=1;lastW=wa;}
        else if(streak>0&&wa===lastW+1){streak++;lastW=wa;}
        else if(streak>0)break;
      }
      
      const streakEl=document.getElementById('cc-streak-'+ch.id);
      if(streakEl){
        const daysSince=sorted.length?Math.floor((now-new Date(sorted[0].published_at||sorted[0].date).getTime())/864e5):999;
        if(streak>=4){streakEl.textContent=`${streak}-wk streak`;streakEl.className='badge bdg-gr';streakEl.style.display='';}
        else if(streak>=2){streakEl.textContent=`${streak}wks`;streakEl.className='badge bdg-pr';streakEl.style.display='';}
        else if(daysSince>28){streakEl.textContent=`${daysSince}d gap`;streakEl.className='badge bdg-rd';streakEl.style.display='';}
      }

      const footerEl = document.getElementById('cc-footer-' + ch.id);
      if(footerEl){
        const longFormVids = sorted.filter(v => !isYouTubeShort(v));
        if(longFormVids.length > 0){
          const lv = longFormVids[0];
          const pubDate = new Date(lv.published_at || lv.date);
          const relDays = Math.max(1, Math.floor((now - pubDate.getTime()) / 864e5));
          const relDateStr = pubDate.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' at ' + pubDate.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
          const vc = lv.view_count ?? lv.views_raw ?? 0;
          const vpd = Math.round(vc / relDays);
          const growthStr = vpd > 1000 ? `<span style="color:var(--gr)">🔥 ${fmtN(vpd)}/day</span>` : `<span style="color:var(--pr)">📈 ${fmtN(vpd)}/day</span>`;
          
          footerEl.innerHTML = `
          <div class="cc-vid">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div class="cc-vlbl">Latest Long-Form</div>
              <div style="font-size:10px;color:var(--t3)">${relDateStr}</div>
            </div>
            <div style="display:flex;gap:10px;align-items:center">
              <img class="cc-vthumb" src="${esc(lv.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
              <div class="cc-vinfo">
                <div class="cc-vtitle" title="${esc(lv.title)}">${esc(lv.title)}</div>
                <div class="cc-vstats">
                  <span style="color:var(--pr)"><span class="ms-icon">visibility</span> ${fmtN(vc)}</span>
                  ${growthStr}
                </div>
              </div>
            </div>
          </div>`;
          footerEl.style.display = '';
        } else {
          footerEl.style.display = 'none';
        }
      }

    }catch{}
  });
  await Promise.all(promises);
}

/* Toggle accordion sections in Channel Detail Modal */
function toggleAcc(id) {
  const body = document.getElementById('drw-acc-body-' + id);
  const arrow = document.getElementById('drw-acc-arrow-' + id);
  if (!body || !arrow) return;
  const isOpen = body.classList.toggle('open');
  arrow.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

/* ════════════════════════════════════════════════════════
   OPEN CHANNEL DETAILS (Modal)
════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════
   DRAWER (REFACTORED)
════════════════════════════════════════════════════════ */

function switchDrwTab(tab) {
  document.querySelectorAll('.drw-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.drw-panel').forEach(p => p.classList.remove('on'));
  const tabEl = document.getElementById('drwTab-' + tab);
  const panelEl = document.getElementById('drwPanel-' + tab);
  if (tabEl) tabEl.classList.add('on');
  if (panelEl) panelEl.classList.add('on');
}

function toggleDrwBest(channelId) {
  const container = document.getElementById('drwBestContainer-' + channelId);
  const arrow = document.getElementById('drwBestArrow-' + channelId);
  if (!container) return;
  const isOpen = container.classList.toggle('open');
  if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
  if (isOpen && container.dataset.loaded !== '1') {
    container.dataset.loaded = '1';
    loadDrwBestEver(channelId, container);
  }
}

function loadDrwBestEver(channelId, container) {
  container.innerHTML = '<div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:12px;padding:16px 0"><div class="spin"></div>Loading all-time best…</div>';
  fetch(`/api/channels/${channelId}/videos?max=50`)
    .then(r => r.json())
    .then(vids => {
      const longForm = vids.filter(v => !isYouTubeShort(v));
      if (!longForm.length) { container.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:12px 0">No long-form videos found.</p>'; return; }
      const sorted = [...longForm].sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0));
      const top10 = sorted.slice(0, 10);
      const rankSymbols = ['🥇','🥈','🥉'];
      container.innerHTML = top10.map((v, i) => {
        const vc = v.view_count ?? v.views_raw ?? 0;
        const eng = calcEngagementRate(v.like_count ?? 0, v.comment_count ?? 0, vc);
        const engC = eng === null ? 'var(--t3)' : eng >= 4 ? 'var(--gr)' : eng >= 2 ? 'var(--gold)' : 'var(--rd)';
        const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
        const rankDisp = i < 3 ? rankSymbols[i] : (i + 1);
        return `<a class="drw-hot-card" href="${esc(v.url)}" target="_blank" rel="noopener">
          <div class="drw-hot-rank ${rankClass}">${rankDisp}</div>
          <img class="drw-hot-thumb" src="${esc(v.thumb || '')}" onerror="this.style.background='var(--sf-highest)';this.removeAttribute('src')" alt="">
          <div class="drw-hot-info">
            <div class="drw-hot-title">${esc(v.title)}</div>
            <div class="drw-hot-stats">
              <span style="font-family:'JetBrains Mono',monospace;color:var(--pr);font-weight:700">👁 ${esc(v.views)}</span>
              <span style="font-family:'JetBrains Mono',monospace;color:var(--t2)"><span class="ms-icon">thumb_up</span> ${esc(v.likes)}</span>
              ${eng !== null ? `<span style="font-family:'JetBrains Mono',monospace;color:${engC};font-size:10px">${eng}%</span>` : ''}
              <span style="font-size:10px;color:var(--t3);margin-left:auto">${v.date}</span>
            </div>
          </div>
        </a>`;
      }).join('');
    })
    .catch(() => { container.innerHTML = '<p style="color:var(--t3);font-size:12px;padding:12px 0">Could not load.</p>'; });
}

function renderDrwLatestUpload(v, allVids, latestNonShort) {
  const showingNonShort = _drwLatestMode === 'nonshort' && latestNonShort;
  const displayV = showingNonShort ? latestNonShort : v;
  if (!displayV || !displayV.title) return '';

  const hasShort = v && isYouTubeShort(v) && latestNonShort && latestNonShort.id !== v.id;
  const hasDifference = latestNonShort && v && latestNonShort.id !== v.id;

  const switcherHtml = hasDifference ? `
    <div class="drw-latest-switcher">
      <button class="drw-latest-switch-btn ${_drwLatestMode === 'latest' ? 'on' : ''}" onclick="_drwLatestMode='latest';renderDrwVideosTab()">Latest</button>
      <button class="drw-latest-switch-btn ${_drwLatestMode === 'nonshort' ? 'on' : ''}" onclick="_drwLatestMode='nonshort';renderDrwVideosTab()">Last Long-form</button>
      ${hasShort ? '<span style="font-size:10px;color:var(--t3);margin-left:4px">Latest is a Short</span>' : ''}
    </div>` : '';

  const labelText = showingNonShort ? 'Last Long-form Upload' : (isYouTubeShort(displayV) ? '⚡ Latest Upload (Short)' : '▶ Latest Upload');
  const labelClass = showingNonShort ? 'drw-latest-label non-short' : 'drw-latest-label';

  return `<div style="margin-bottom:20px">
    ${switcherHtml}
    <a class="drw-latest-card" href="${esc(displayV.url)}" target="_blank" rel="noopener">
      <img class="drw-latest-thumb" src="${esc(displayV.thumb || '')}" onerror="this.style.background='var(--sf-highest)';this.removeAttribute('src')" alt="">
      <div class="drw-latest-body">
        <div class="${labelClass}">${labelText} <span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--t3)">${displayV.date || ''}</span></div>
        <div class="drw-latest-title">${esc(displayV.title)}</div>
        <div class="drw-latest-meta">
          <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:800;color:var(--pr)">👁 ${esc(displayV.views)}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--t2)"><span class="ms-icon">thumb_up</span> ${esc(displayV.likes)}</span>
          ${displayV.comments ? `<span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--t3)"><span class="ms-icon">comment</span> ${esc(displayV.comments)}</span>` : ''}
        </div>
      </div>
    </a>
  </div>`;
}

function renderDrwVideosTab() {
  const panel = document.getElementById('drwPanel-videos');
  if (!panel || !_drwVideosCache) return;
  const vids = _drwVideosCache;
  const ch = all.find(c => c.id === _drwOpenId);
  if (!ch) return;

  const allSorted = [...vids].sort((a, b) => new Date(b.published_at || b.date) - new Date(a.published_at || a.date));
  const latestAny = allSorted[0];
  const latestNonShort = allSorted.find(v => !isYouTubeShort(v));
  const longFormVids = vids.filter(v => !isYouTubeShort(v));
  const shortsCount = vids.length - longFormVids.length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonthVids = longFormVids.filter(v => {
    const t = new Date(v.published_at || v.date).getTime();
    return !isNaN(t) && t >= monthStart;
  });
  const hot5 = [...thisMonthVids].sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0)).slice(0, 5);

  const recent10 = longFormVids.slice(0, 10);
  const vcs = recent10.map(v => v.view_count ?? v.views_raw ?? 0);
  const maxVc = Math.max(...vcs, 1);
  const bestIdx = vcs.indexOf(Math.max(...vcs));

  const hot5Html = hot5.length > 0 ? `
    <div class="drw-vid-section-label">
      Hot This Month <em style="font-style:normal;font-size:9px;color:var(--t4);margin-left:4px">${hot5.length} video${hot5.length > 1 ? 's' : ''}</em>
    </div>
    ${hot5.map((v, i) => {
      const vc = v.view_count ?? v.views_raw ?? 0;
      const eng = calcEngagementRate(v.like_count ?? 0, v.comment_count ?? 0, vc);
      const engC = eng === null ? 'var(--t3)' : eng >= 4 ? 'var(--gr)' : eng >= 2 ? 'var(--gold)' : 'var(--rd)';
      const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
      const rankSymbols = ['🥇','🥈','🥉','4','5'];
      return `<a class="drw-hot-card" href="${esc(v.url)}" target="_blank" rel="noopener">
        <div class="drw-hot-rank ${rankClass}">${rankSymbols[i]}</div>
        <img class="drw-hot-thumb" src="${esc(v.thumb || '')}" onerror="this.style.background='var(--sf-highest)';this.removeAttribute('src')" alt="">
        <div class="drw-hot-info">
          <div class="drw-hot-title">${esc(v.title)}</div>
          <div class="drw-hot-stats">
            <span style="font-family:'JetBrains Mono',monospace;color:var(--pr);font-weight:700">👁 ${esc(v.views)}</span>
            ${eng !== null ? `<span style="font-family:'JetBrains Mono',monospace;color:${engC};font-size:10px">${eng}%</span>` : ''}
            <span style="font-size:10px;color:var(--t3);margin-left:auto">${v.date}</span>
          </div>
        </div>
      </a>`;
    }).join('')}` : '';

  const recent10Html = recent10.length > 0 ? `
    <div class="drw-vid-section-label" style="margin-top:${hot5.length > 0 ? '24px' : '0'}">
      Recent Uploads ${shortsCount > 0 ? `<span style="font-size:9px;color:var(--t4);font-weight:400;margin-left:4px">${shortsCount} Shorts hidden</span>` : ''}
    </div>
    ${recent10.map((v, ri) => {
      const vc = v.view_count ?? v.views_raw ?? 0;
      const lc = v.like_count ?? 0;
      const cc = v.comment_count ?? 0;
      const eng = calcEngagementRate(lc, cc, vc);
      const isBest = ri === bestIdx;
      const engC = eng === null ? 'var(--t3)' : eng >= 4 ? 'var(--gr)' : eng >= 2 ? 'var(--gold)' : 'var(--rd)';
      return `<a href="${esc(v.url)}" target="_blank" rel="noopener" class="drw-vid-row">
        ${isBest ? '<span class="drw-vid-badge best">🏆 BEST</span>' : ''}
        <div class="drw-vid-title">${esc(v.title)}</div>
        <div class="drw-vid-meta">
          <span style="font-family:'JetBrains Mono',monospace;color:var(--pr);font-size:12px;font-weight:700"><span class="ms-icon">visibility</span> ${esc(v.views)}</span>
          <span style="font-family:'JetBrains Mono',monospace;color:var(--t2);font-size:12px"><span class="ms-icon">thumb_up</span> ${esc(v.likes)}</span>
          ${eng !== null ? `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${engC};background:rgba(255,255,255,.05);padding:1px 6px;border-radius:4px">${eng}%</span>` : ''}
          <span style="font-size:11px;color:var(--t3);margin-left:auto">${v.date}</span>
        </div>
      </a>`;
    }).join('')}` : '';

  const bestToggleHtml = longFormVids.length >= 5 ? `
    <button class="drw-best-toggle" id="drwBestToggle-${_drwOpenId}" onclick="toggleDrwBest('${_drwOpenId}')">
      <span class="drw-best-toggle-label">
        <span style="font-family:'Material Symbols Outlined';font-size:16px;vertical-align:middle">emoji_events</span>
        All-Time Best 10 Videos
      </span>
      <span class="drw-best-toggle-arrow" id="drwBestArrow-${_drwOpenId}">expand_more</span>
    </button>
    <div class="drw-best-container" id="drwBestContainer-${_drwOpenId}" style="margin-top:8px"></div>` : '';

  panel.innerHTML = renderDrwLatestUpload(latestAny, vids, latestNonShort) + hot5Html + recent10Html + bestToggleHtml;
}

function renderDrwAnalyticsTab(vids) {
  const panel = document.getElementById('drwPanel-analytics');
  if (!panel || !vids.length) return;
  const longFormVids = vids.filter(v => !isYouTubeShort(v));
  panel.innerHTML = buildViewsTrendImproved(longFormVids)
    + buildCalendarImproved(longFormVids)
    + buildEngTrendImproved(longFormVids)
    + buildWordCloud(longFormVids)
    + buildDurationImproved(longFormVids);
}

function renderDrwAboutTab(ch) {
  const panel = document.getElementById('drwPanel-about');
  if (!panel) return;
  const country = ch.country || '';
  const joined = ch.joined_date || ch.published_at || '';
  const tags = ch.keywords || ch.tags || '';
  panel.innerHTML = `
    ${ch.description ? `
      <div class="drw-analytics-sect-hdr">About</div>
      <div class="drw-about-desc">${esc(ch.description)}</div>` : '<p style="color:var(--t3);font-size:13px">No description available.</p>'}
    <div class="drw-about-meta-row" style="margin-top:${ch.description ? '20px' : '0'}">
      ${country ? `<div class="drw-about-meta-item"><span class="drw-about-meta-icon">public</span><span class="drw-about-meta-label">Country</span><span class="drw-about-meta-val">${esc(country)}</span></div>` : ''}
      ${joined ? `<div class="drw-about-meta-item"><span class="drw-about-meta-icon">calendar_today</span><span class="drw-about-meta-label">Joined</span><span class="drw-about-meta-val">${esc(joined)}</span></div>` : ''}
      <div class="drw-about-meta-item">
        <span class="drw-about-meta-icon">tag</span>
        <span class="drw-about-meta-label">Channel ID</span>
        <span class="drw-about-meta-val" style="font-family:'JetBrains Mono',monospace;font-size:11px">${esc(ch.id)}</span>
      </div>
      ${tags ? `<div class="drw-about-meta-item"><span class="drw-about-meta-icon">sell</span><span class="drw-about-meta-label">Tags</span><span class="drw-about-meta-val" style="font-size:12px">${esc(tags)}</span></div>` : ''}
    </div>
    <div style="margin-top:20px">
      <a class="btn btn-gh" href="https://www.youtube.com/${esc(ch.handle || 'channel/' + ch.id)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;width:100%;justify-content:center;padding:12px">
        <svg viewBox="0 0 24 24" style="width:14px;fill:currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
        Open on YouTube
      </a>
    </div>`;
}



/* ════════════════════════════════════════════════════════
   MY CHANNEL ANALYTICS MODAL — 5 Tabs
════════════════════════════════════════════════════════ */

async function openAnalyticsModal(channelId){
  const ch=all.find(c=>c.id===channelId);
  if(!ch)return;
  _amChannelId=channelId;
  _amFullVideos=null;
  _amSnapshots=null;
  _amVidPreset='recent';
  _amVidFilter='longform';
  _amOvVids=null; // clear cache when switching channels

  // Populate header
  const logoEl=document.getElementById('amLogo');
  logoEl.innerHTML=ch.logo_url
    ?`<img src="${esc(proxyImg(ch.logo_url))}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.background='var(--sf-highest)'" alt="">`
    :`<div style="display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:var(--t3)">${(ch.name||'?')[0].toUpperCase()}</div>`;
  document.getElementById('amName').textContent=ch.name||'';
  document.getElementById('amSub').textContent=`${ch.handle||''} · ${ch.subscribers} subscribers · ${ch.total_videos} videos`;

  // Add action buttons to header for competitor channels
  const actionsEl = document.getElementById('amActions');
  if (actionsEl) {
    if (!ch.is_primary) {
      actionsEl.innerHTML = `
        <button class="btn btn-gh" onclick="closeAnalyticsModal();setPrimary('${esc(ch.id)}')" title="Set as My Channel">
          <span style="font-family:'Material Symbols Outlined';font-size:15px;vertical-align:middle">star</span> Set Mine
        </button>
        <button class="btn btn-gh" style="color:var(--rd)" onclick="closeAnalyticsModal();rmCh('${esc(ch.id)}')" title="Remove">
          <span style="font-family:'Material Symbols Outlined';font-size:15px;vertical-align:middle">delete</span>
        </button>`;
    } else {
      actionsEl.innerHTML = '';
    }
  }

  // Reset to overview tab
  switchAnalyticsTab('overview', true);

  // Populate overview panel with existing drawer-style content
  renderAmOverview(ch);

  // Show modal
  document.getElementById('analyticsModal').classList.add('open');
  document.getElementById('amOvrl').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeAnalyticsModal(){
  document.getElementById('analyticsModal').classList.remove('open');
  document.getElementById('amOvrl').classList.remove('open');
  document.body.style.overflow='';
}

function switchAnalyticsTab(tab, skipLoad){
  document.querySelectorAll('.am-tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.am-panel').forEach(p=>p.classList.remove('on'));
  const tabEl=document.getElementById('amTab-'+tab);
  const panelEl=document.getElementById('amPanel-'+tab);
  if(tabEl)tabEl.classList.add('on');
  if(panelEl)panelEl.classList.add('on');
  if(skipLoad)return;
  if(tab==='monthly')renderAmMonthly();
  else if(tab==='growth')renderAmGrowth();
  else if(tab==='compare')renderAmCompare();
  else if(tab==='timeline')renderAmTimeline();
}

/* ── Overview: per-modal state ── */
let _amVidPreset   = 'recent';   // 'recent' | 'hotWeek' | 'hotMonth' | 'alltime'
let _amVidFilter   = 'longform'; // 'longform' | 'all'
let _amOvVids      = null;  // cached video list for overview tab (fetched once per channel)

function renderAmOverview(ch) {
  const thisChannelId = ch.id; // snapshot which channel we're loading for
  const subRatio = calcSubViewRatio(ch.subscriber_count ?? ch.subscribers_raw ?? 0, ch.total_views_raw ?? 0);
  const panel = document.getElementById('amPanel-overview');
  
  panel.innerHTML = `
    <div class="am-overview-grid">
      <div class="am-bento-grid">
        <div class="am-bento-hero">
          <div class="am-bento-lbl">Subscribers</div>
          <div class="am-bento-val gold">${esc(ch.subscribers)}</div>
          <div style="font-size:12px;color:var(--t3);margin-top:8px">${ch.handle||''}</div>
        </div>
        <div class="am-bento-cell">
          <div class="am-bento-lbl">Total Views</div>
          <div class="am-bento-val">${esc(ch.total_views)}</div>
        </div>
        <div class="am-bento-cell">
          <div class="am-bento-lbl">Videos</div>
          <div class="am-bento-val cyan">${esc(ch.total_videos)}</div>
        </div>
        <div class="am-bento-cell">
          <div class="am-bento-lbl">Avg Views</div>
          <div class="am-bento-val green">${esc(ch.avg_views)}</div>
        </div>
        <div class="am-bento-cell">
          <div class="am-bento-lbl">Audience %</div>
          <div class="am-bento-val" style="color:${subViewRatioColor(subRatio)}">${subRatio!==null?subRatio+'%':'—'}</div>
        </div>
      </div>
      <div class="am-sep-sect" id="amOvRecent-${thisChannelId}">
        <div class="am-sect-lbl">Channel Insights — <em style="color:var(--t3)">Loading...</em></div>
        <div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:12.5px;padding:32px 0">
          <div class="spin"></div> Analyzing recent content…
        </div>
      </div>
    </div>`;

  // Use channel-specific ID so stale fetches don't overwrite new channel data
  const _fetchOvVids = _amOvVids
    ? Promise.resolve(_amOvVids)
    : fetch(`/api/channels/${ch.id}/videos/full`).then(r => r.json());

  _fetchOvVids
    .then(vids => {
      // Guard: only update if this channel is still open
      if (_amChannelId !== thisChannelId) return;
      _amOvVids = vids; // cache for this channel session
      const el = document.getElementById(`amOvRecent-${thisChannelId}`);
      if (!el) return;
      
      if (!vids.length) {
        el.innerHTML = '<div class="am-sect-lbl">Recent Uploads</div><p style="color:var(--t3)">No uploads found.</p>';
        return;
      }

      const longFormVids = vids.filter(v => !isYouTubeShort(v));
      const shortsCount  = vids.length - longFormVids.length;

      const filterBarHtml = `
        <div class="am-vid-filter-bar">
          <div class="am-sect-lbl" style="margin:0">
            Recent Videos
            <span id="amVidCount-${thisChannelId}">
              <em style="font-weight:400;color:var(--t3);font-style:normal">
                — showing ${getFilteredVideos(vids, _amVidFilter, _amVidPreset).length} of ${
                  _amVidFilter === 'longform'
                    ? longFormVids.length + ' long-form'
                    : vids.length + ' total'
                }
              </em>
            </span>
          </div>
          <div class="am-vid-filter-controls">
            <div class="am-vid-dropdown-wrap">
              <select class="am-vid-select" onchange="setAmVidFilter(this.value)">
                <option value="longform" ${_amVidFilter==='longform'?'selected':''}>Long-form</option>
                <option value="all"      ${_amVidFilter==='all'?'selected':''}>
                  All Videos${shortsCount > 0 ? ` · ${shortsCount} Shorts` : ''}
                </option>
              </select>
            </div>
            <div class="am-vid-dropdown-wrap">
              <select class="am-vid-select" onchange="setAmVidPreset(this.value)">
                <option value="recent"   ${_amVidPreset==='recent'?'selected':''}>5 Most Recent</option>
                <option value="hotWeek"  ${_amVidPreset==='hotWeek'?'selected':''}>🔥 Trending (Views/Day)</option>
                <option value="hotMonth" ${_amVidPreset==='hotMonth'?'selected':''}>📅 Best This Month</option>
                <option value="alltime"  ${_amVidPreset==='alltime'?'selected':''}>🏆 All-Time Top 5</option>
              </select>
            </div>
          </div>
        </div>`;

      const displayVids = getFilteredVideos(vids, _amVidFilter, _amVidPreset);

      const channelAvgViews = longFormVids.length
        ? longFormVids.reduce((s, v) => s + (v.view_count ?? v.views_raw ?? 0), 0) / longFormVids.length
        : 0;

      const showRank = _amVidPreset !== 'recent';
      const emptyMsg = _amVidPreset === 'hotWeek'
        ? 'No recent videos found to calculate trend.'
        : _amVidPreset === 'hotMonth'
          ? 'No videos uploaded this month.'
          : 'No videos found.';

      const vidListHtml = displayVids.length === 0
        ? `<div class="am-vid-empty">${emptyMsg}</div>`
        : displayVids.map((v, i) => buildAmVidRowRich(v, showRank ? i : null, channelAvgViews)).join('');

      el.innerHTML = `
        ${filterBarHtml}
        <div class="am-vid-list am-vid-list-rich" id="amVidListRich-${thisChannelId}">
          ${vidListHtml}
        </div>

        <div class="am-sect-lbl" style="margin-top:28px;margin-bottom:14px">📈 Recent Views Trend</div>
        ${buildViewsTrend(longFormVids)}

        <div class="am-sect-lbl" style="margin-top:28px;margin-bottom:14px">Upload Calendar</div>
        ${buildCalendar(longFormVids)}
      `;
    })
    .catch(err => {
      if (_amChannelId !== thisChannelId) return;
      const el = document.getElementById(`amOvRecent-${thisChannelId}`);
      if (el) el.innerHTML = '<p style="color:var(--t3);font-size:13px;padding:16px 0">Could not load channel insights.</p>';
    });
}

function getFilteredVideos(vids, filter, preset) {
  const base = filter === 'all' ? vids : vids.filter(v => !isYouTubeShort(v));
  const now = Date.now();
  const weekMs  = 7  * 24 * 60 * 60 * 1000;
  const monthMs = 30 * 24 * 60 * 60 * 1000;

  if (preset === 'recent') {
    return [...base]
      .sort((a, b) => new Date(b.published_at || b.date) - new Date(a.published_at || a.date))
      .slice(0, 5);
  }
  if (preset === 'hotWeek') {
    // "Trending" = highest views-per-day among videos from the past 90 days
    return [...base]
      .filter(v => (now - new Date(v.published_at || v.date).getTime()) <= 90 * 24 * 60 * 60 * 1000)
      .map(v => {
        const daysOld = Math.max(1, (now - new Date(v.published_at || v.date).getTime()) / 86400000);
        return { ...v, _vpd: (v.view_count ?? v.views_raw ?? 0) / daysOld };
      })
      .sort((a, b) => b._vpd - a._vpd)
      .slice(0, 5);
  }
  if (preset === 'hotMonth') {
    // "Best this month" = published in last 30 days, most total views
    return [...base]
      .filter(v => (now - new Date(v.published_at || v.date).getTime()) <= monthMs)
      .sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0))
      .slice(0, 5);
  }
  if (preset === 'alltime') {
    return [...base]
      .sort((a, b) => (b.view_count ?? b.views_raw ?? 0) - (a.view_count ?? a.views_raw ?? 0))
      .slice(0, 5);
  }
  return base.slice(0, 5);
}

function setAmVidFilter(filter) {
  _amVidFilter = filter;
  _reRenderAmVidList();
}

function setAmVidPreset(preset) {
  _amVidPreset = preset;
  _reRenderAmVidList();
}

function _reRenderAmVidList() {
  if (!_amOvVids || !_amChannelId) return;
  const vids = _amOvVids;
  const longFormVids = vids.filter(v => !isYouTubeShort(v));
  const channelAvgViews = longFormVids.length
    ? longFormVids.reduce((s, v) => s + (v.view_count ?? v.views_raw ?? 0), 0) / longFormVids.length
    : 0;
  const displayVids = getFilteredVideos(vids, _amVidFilter, _amVidPreset);
  const showRank = _amVidPreset !== 'recent';
  const ch = all.find(c => c.id === _amChannelId);
  if (!ch) return;
  const listEl = document.getElementById(`amVidListRich-${_amChannelId}`);
  if (!listEl) return;
  const emptyMsg = _amVidPreset === 'hotWeek'
    ? 'No recent videos found to calculate trend.'
    : _amVidPreset === 'hotMonth'
    ? 'No videos uploaded this month.'
    : 'No videos found.';
  listEl.innerHTML = displayVids.length === 0
    ? `<div class="am-vid-empty">${emptyMsg}</div>`
    : displayVids.map((v, i) => buildAmVidRowRich(v, showRank ? i : null, channelAvgViews)).join('');

  // Update count in header
  const countEl = document.getElementById(`amVidCount-${_amChannelId}`);
  if (countEl) {
    countEl.innerHTML = `
      <em style="font-weight:400;color:var(--t3);font-style:normal">
        — showing ${displayVids.length} of ${
          _amVidFilter === 'longform'
            ? longFormVids.length + ' long-form'
            : vids.length + ' total'
        }
      </em>`;
  }
}

function buildAmVidRowRich(v, rankIdx, channelAvg) {
  const vc  = v.view_count ?? v.views_raw ?? 0;
  const eng = calcEngagementRate(v.like_count ?? 0, v.comment_count ?? 0, vc);

  const engC = eng === null ? 'var(--t3)'
    : eng >= 4 ? 'var(--gr)'
    : eng >= 2 ? 'var(--gold)'
    : 'var(--rd)';

  const viewsVsAvg = channelAvg > 0
    ? ((vc - channelAvg) / channelAvg) * 100
    : 0;
  const viewsColor = viewsVsAvg > 20 ? 'var(--gr)'
    : viewsVsAvg < -30 ? 'var(--rd)'
    : 'var(--pr)';

  const pubDate = new Date(v.published_at || v.date);
  const daysAgo = Math.floor((Date.now() - pubDate.getTime()) / 86400000);
  const relDate = daysAgo === 0 ? 'Today'
    : daysAgo === 1 ? 'Yesterday'
    : daysAgo < 7  ? `${daysAgo}d ago`
    : daysAgo < 30 ? `${Math.floor(daysAgo/7)}w ago`
    : daysAgo < 365? `${Math.floor(daysAgo/30)}mo ago`
    : `${Math.floor(daysAgo/365)}y ago`;
  const absDate = pubDate.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

  const isShort = isYouTubeShort(v);

  return `
    <a href="${esc(v.url)}" target="_blank" rel="noopener" class="am-vid-row-rich">
      <div class="am-vid-rich-thumb-wrap">
        <img class="am-vid-rich-thumb"
          src="${esc(v.thumb || '')}"
          onerror="this.style.background='var(--sf-highest)';this.removeAttribute('src')"
          alt="">
        ${isShort ? '<span class="am-vid-short-pill">Short</span>' : ''}
        ${rankIdx === 0 ? '<span class="am-vid-rank-pill rank-gold">🥇</span>' : ''}
        ${rankIdx === 1 ? '<span class="am-vid-rank-pill rank-silver">🥈</span>' : ''}
        ${rankIdx === 2 ? '<span class="am-vid-rank-pill rank-bronze">🥉</span>' : ''}
        ${rankIdx > 2 ? `<span class="am-vid-rank-pill" style="font-size:10px;top:6px;left:6px;font-weight:700;color:var(--t1)">#${rankIdx+1}</span>` : ''}
      </div>
      <div class="am-vid-rich-body">
        <div class="am-vid-rich-title">${esc(v.title)}</div>
        <div class="am-vid-rich-meta">
          <span class="am-vid-rich-views" style="color:${viewsColor}">
            <span class="ms-icon">visibility</span> ${esc(fmtN(vc))}
          </span>
          ${eng !== null ? `
            <span class="am-vid-rich-eng" style="color:${engC}">
              ${eng}% eng
            </span>` : ''}
          <span class="am-vid-rich-date" title="${absDate}">${relDate}</span>
        </div>
      </div>
    </a>`;
}

/* ── Tab 2: Monthly Performance ─────────────────────── */
async function renderAmMonthly(){
  if(!_amChannelId)return;
  const loadEl=document.getElementById('amMonthlyLoading');
  const contEl=document.getElementById('amMonthlyContent');
  loadEl.style.display='flex';
  contEl.style.display='none';

  try{
    if(!_amFullVideos){
      const r=await fetch(`/api/channels/${_amChannelId}/videos/full`);
      _amFullVideos=await r.json();
    }
    const allVids=_amFullVideos;
    if(!allVids||!allVids.length){
      contEl.innerHTML='<p style="color:var(--t3);padding:24px">No video data available.</p>';
      loadEl.style.display='none';contEl.style.display='block';return;
    }

    const vids = allVids.filter(v => !isYouTubeShort(v));
    const shortsCount = allVids.length - vids.length;

    if(!vids.length){
      contEl.innerHTML='<p style="color:var(--t3);padding:24px">No long-form video data available.</p>';
      loadEl.style.display='none';contEl.style.display='block';return;
    }

    // Group by YYYY-MM
    const byMonth={};
    vids.forEach(v=>{
      const m=v.published_at?v.published_at.slice(0,7):v.date?v.date.slice(0,7):null;
      if(!m)return;
      if(!byMonth[m])byMonth[m]={month:m,views:0,count:0,likes:0,comments:0};
      byMonth[m].views+=(v.view_count||v.views_raw||0);
      byMonth[m].count++;
      byMonth[m].likes+=(v.like_count||0);
      byMonth[m].comments+=(v.comment_count||0);
    });
    const months=Object.values(byMonth).sort((a,b)=>b.month.localeCompare(a.month));
    if(!months.length){
      contEl.innerHTML='<p style="color:var(--t3);padding:24px">No monthly data available.</p>';
      loadEl.style.display='none';contEl.style.display='block';return;
    }

    const maxViews=Math.max(...months.map(m=>m.views),1);
    const totalMonthlyViews=months.reduce((s,m)=>s+m.views,0);
    const avgMonthlyViews=totalMonthlyViews/months.length;
    const bestM=months.reduce((a,b)=>b.views>a.views?b:a);
    const worstM=months.reduce((a,b)=>b.views<a.views?b:a);
    const totalV=totalMonthlyViews;
    const avgV=Math.round(avgMonthlyViews);

    // Build SVG bar chart
    const barW=38;
    const gap=8;
    const chartW=Math.max(months.length*(barW+gap),500);
    const chartH=280;
    const plotH=chartH-52; // reserve space for labels
    const now=new Date();
    const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    // Average line Y position
    const avgY=chartH-52-((avgMonthlyViews/maxViews)*plotH);

    const bars=months.map((m,i)=>{
      const h=Math.max(6,Math.round((m.views/maxViews)*plotH));
      const x=i*(barW+gap);
      const y=chartH-52-h;
      const isBest=m.month===bestM.month;
      const isCurrent=m.month===thisMonth;
      const isHigh=m.views>avgMonthlyViews*1.25;
      const isLow=m.views<avgMonthlyViews*0.75;
      let fillId;
      if(isBest) fillId='url(#barGold)';
      else if(isCurrent) fillId='url(#barCyan)';
      else if(isHigh) fillId='url(#barGreen)';
      else if(isLow) fillId='url(#barRed)';
      else fillId='url(#barSlate)';
      const shortM=m.month.slice(5)+"\u2019"+m.month.slice(2,4);
      const tipData=JSON.stringify({month:m.month,views:fmtN(m.views),count:m.count,likes:m.likes?fmtN(m.likes):'—'}).replace(/"/g,'&quot;');
      return `
        <g class="am-bar-g" data-tip="${tipData}" onclick="showMonthVideos('${m.month}')" style="cursor:pointer">
          <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="5" fill="${fillId}"
            style="transition:opacity .15s,filter .15s"/>
          ${isBest?`<text x="${x+barW/2}" y="${y-8}" text-anchor="middle" font-size="10" fill="#FFD54F" font-weight="800" font-family="DM Sans">★</text>`:''}
          ${isCurrent?`<text x="${x+barW/2}" y="${y-8}" text-anchor="middle" font-size="9" fill="#00E5FF" font-weight="700" font-family="DM Sans">NOW</text>`:''}
          <text x="${x+barW/2}" y="${chartH-32}" text-anchor="middle" font-size="9.5" fill="rgba(186,201,204,.8)" font-family="DM Sans">${shortM}</text>
          <text x="${x+barW/2}" y="${chartH-18}" text-anchor="middle" font-size="9" fill="rgba(132,147,150,.6)" font-family="DM Sans">${m.count}v</text>
        </g>`;
    }).join('');

    // Recent 12 months for this-month panel
    const thisMonthData=byMonth[thisMonth]||null;
    const lastMonthKey=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().slice(0,7);
    const lastMonthData=byMonth[lastMonthKey]||null;
    const momDiff=thisMonthData&&lastMonthData&&lastMonthData.views>0
      ?Math.round(((thisMonthData.views-lastMonthData.views)/lastMonthData.views)*100):null;

    contEl.innerHTML=`
      ${shortsCount > 0 ? `<div style="margin: 0 0 16px 0; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--bd); border-radius: 6px; font-size: 11.5px; color: var(--t3); display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 14px">ℹ️</span>
        <span><b>${shortsCount} Shorts</b> are excluded from these analytics to ensure performance data reflects long-form content.</span>
      </div>` : ''}

      <!-- This Month Card -->
      <div class="am-month-summary">
        <div class="am-ms-item">
          <div class="am-ms-val" style="color:var(--gold)">${thisMonthData?fmtN(thisMonthData.views):'—'}</div>
          <div class="am-ms-lbl">Views This Month</div>
          ${momDiff!==null?`<div class="am-ms-delta" style="color:${momDiff>=0?'var(--gr)':'var(--rd)'};font-size:11px;margin-top:3px">${momDiff>=0?'+':''}${momDiff}% vs last month</div>`:''}
        </div>
        <div class="am-ms-item">
          <div class="am-ms-val" style="color:var(--pr)">${thisMonthData?thisMonthData.count:0}</div>
          <div class="am-ms-lbl">Videos This Month</div>
        </div>
        <div class="am-ms-item">
          <div class="am-ms-val" style="color:var(--gr)">${fmtN(bestM.views)}</div>
          <div class="am-ms-lbl">Best Month</div>
          <div style="font-size:10px;color:var(--t3);margin-top:2px">${bestM.month}</div>
        </div>
        <div class="am-ms-item">
          <div class="am-ms-val">${fmtN(avgV)}</div>
          <div class="am-ms-lbl">Monthly Avg Views</div>
        </div>
      </div>

      <!-- SVG Bar Chart -->
      <div class="am-sep-sect">
        <div class="am-sect-lbl">Views by Month — ${vids.length} total videos · ${months.length} months</div>
        <div class="am-chart-scroll">
          <svg width="${chartW}" height="${chartH}" class="am-chart" id="amMonthChart">
            <defs>
              <linearGradient id="barGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#FFD54F" stop-opacity=".9"/>
                <stop offset="100%" stop-color="#FFD54F" stop-opacity=".45"/>
              </linearGradient>
              <linearGradient id="barCyan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#00E5FF" stop-opacity=".9"/>
                <stop offset="100%" stop-color="#00E5FF" stop-opacity=".45"/>
              </linearGradient>
              <linearGradient id="barGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#56ffa7" stop-opacity=".85"/>
                <stop offset="100%" stop-color="#56ffa7" stop-opacity=".35"/>
              </linearGradient>
              <linearGradient id="barRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffb4ab" stop-opacity=".7"/>
                <stop offset="100%" stop-color="#ffb4ab" stop-opacity=".25"/>
              </linearGradient>
              <linearGradient id="barSlate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#849396" stop-opacity=".6"/>
                <stop offset="100%" stop-color="#849396" stop-opacity=".2"/>
              </linearGradient>
            </defs>
            <!-- Average reference line -->
            <line x1="0" y1="${avgY.toFixed(1)}" x2="${chartW}" y2="${avgY.toFixed(1)}"
              stroke="rgba(255,255,255,.2)" stroke-width="1" stroke-dasharray="4,4"/>
            <text x="4" y="${(avgY-4).toFixed(1)}" font-size="9" fill="rgba(255,255,255,.4)" font-family="DM Sans">avg</text>
            ${bars}
          </svg>
        </div>
        <!-- Tooltip -->
        <div id="amBarTip" style="margin-top:10px;padding:10px 16px;
          background:var(--sf-high);border:1px solid var(--bd2);border-radius:10px;
          opacity:0;transition:opacity .2s;pointer-events:none;
          display:flex;align-items:center;gap:20px;flex-wrap:wrap;"></div>
        <!-- Legend -->
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:11px;color:var(--t3)">
          <span><span style="display:inline-block;width:10px;height:10px;background:#FFD54F;border-radius:2px;margin-right:4px;vertical-align:middle"></span>Best month</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#00E5FF;border-radius:2px;margin-right:4px;vertical-align:middle"></span>This month</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#56ffa7;border-radius:2px;margin-right:4px;vertical-align:middle"></span>Above avg</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#ffb4ab;border-radius:2px;margin-right:4px;vertical-align:middle"></span>Below avg</span>
          <span style="margin-left:auto;opacity:.6">${months.length} months tracked</span>
        </div>
      </div>
      <div id="amMonthVidsWrap" style="display:none; margin-top:24px;"></div>`;

    loadEl.style.display='none';
    contEl.style.display='block';

    // Tooltip hover logic
    document.querySelectorAll('.am-bar-g').forEach(g=>{
      g.addEventListener('mouseenter',()=>{
        const tip=document.getElementById('amBarTip');
        if(!tip)return;
        try{
          const d=JSON.parse(g.dataset.tip);
          tip.innerHTML=`
            <span style="font-family:'Outfit',sans-serif;font-weight:700;font-size:13px;color:var(--t1)">${d.month}</span>
            <span style="display:flex;flex-direction:column;align-items:center">
              <span style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:var(--pr)">${d.views}</span>
              <span style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:1px">Views</span>
            </span>
            <span style="display:flex;flex-direction:column;align-items:center">
              <span style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:var(--gold)">${d.count}</span>
              <span style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:1px">Video${d.count!==1?'s':''}</span>
            </span>
            <span style="display:flex;flex-direction:column;align-items:center">
              <span style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:var(--gr)">${d.likes}</span>
              <span style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:1px">Likes</span>
            </span>`;
        }catch{tip.textContent=g.dataset.tip;}
        tip.style.opacity='1';
      });
      g.addEventListener('mouseleave',()=>{
        const tip=document.getElementById('amBarTip');
        if(tip){tip.style.opacity='0';}
      });
    });
  }catch(ex){
    contEl.innerHTML=`<div class="am-err">Failed to load monthly data: ${esc(String(ex))}</div>`;
    loadEl.style.display='none';contEl.style.display='block';
  }
}

function showMonthVideos(month) {
  const wrap = document.getElementById('amMonthVidsWrap');
  if (!wrap) return;
  if (!_amFullVideos) return;
  const longFormVids = _amFullVideos.filter(v => !isYouTubeShort(v));
  const monthVids = longFormVids.filter(v => (v.published_at || v.date || '').startsWith(month));
  if (!monthVids.length) {
    wrap.style.display = 'none';
    return;
  }
  
  monthVids.sort((a,b) => (b.view_count || b.views_raw || 0) - (a.view_count || a.views_raw || 0));
  const avgViews = longFormVids.length 
    ? longFormVids.reduce((s, v) => s + (v.view_count ?? v.views_raw ?? 0), 0) / longFormVids.length 
    : 0;

  const mParts = month.split('-');
  const monthLabel = new Date(mParts[0], parseInt(mParts[1])-1, 1).toLocaleDateString('en-US', {month: 'long', year: 'numeric'});

  const vidsHtml = monthVids.map((v, i) => buildAmVidRowRich(v, i, avgViews)).join('');
  
  wrap.innerHTML = `
    <div class="am-sect-lbl" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span>Top Videos in ${monthLabel} <em style="font-style:normal;font-weight:400;color:var(--t3);margin-left:8px">${monthVids.length} videos</em></span>
      <button class="btn btn-gh btn-sm" onclick="document.getElementById('amMonthVidsWrap').style.display='none'">Close</button>
    </div>
    <div class="am-vid-list am-vid-list-rich">
      ${vidsHtml}
    </div>
  `;
  wrap.style.display = 'block';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Tab 3: Growth Speed ────────────────────────────── */
async function renderAmGrowth(){
  if(!_amChannelId)return;
  const loadEl=document.getElementById('amGrowthLoading');
  const contEl=document.getElementById('amGrowthContent');
  loadEl.style.display='flex';
  contEl.style.display='none';

  try{
    if(!_amFullVideos){
      const r=await fetch(`/api/channels/${_amChannelId}/videos/full`);
      _amFullVideos=await r.json();
    }
    const allVids=_amFullVideos;
    if(!allVids||!allVids.length){
      contEl.innerHTML='<p style="color:var(--t3);padding:24px">No video data available.</p>';
      loadEl.style.display='none';contEl.style.display='block';return;
    }

    const vids = allVids.filter(v => !isYouTubeShort(v));
    const shortsCount = allVids.length - vids.length;

    if(!vids.length){
      contEl.innerHTML='<p style="color:var(--t3);padding:24px">No long-form video data available.</p>';
      loadEl.style.display='none';contEl.style.display='block';return;
    }

    // Calculate views/day for each video
    const withVpd=vids
      .filter(v=>(v.published_at||v.date)&&(v.view_count||v.views_raw||0)>0)
      .map(v=>{
        const vpd=viewsPerDay(v.view_count||v.views_raw||0, v.published_at||v.date);
        const daysLive=Math.max(1,Math.floor((Date.now()-new Date(v.published_at||v.date).getTime())/864e5));
        return {...v,vpd,daysLive};
      })
      .sort((a,b)=>(b.vpd||0)-(a.vpd||0));

    const maxVpd=Math.max(...withVpd.map(v=>v.vpd||0),1);
    const topRows=withVpd.slice(0,50).map((v,i)=>{
      const vpd=v.vpd||0;
      const isHot=vpd>=1000;
      const isGood=vpd>=200&&vpd<1000;
      const isWeak=vpd<50;
      const color=isHot?'var(--gr)':isGood?'var(--gold)':isWeak?'var(--rd)':'var(--t3)';
      const badgeStyle=isHot
        ?'background:rgba(86,255,167,.1);color:var(--gr);border:1px solid rgba(86,255,167,.25)'
        :isGood
        ?'background:rgba(255,213,79,.1);color:var(--gold);border:1px solid rgba(255,213,79,.25)'
        :isWeak
        ?'background:rgba(255,180,171,.08);color:var(--rd);border:1px solid rgba(255,180,171,.2)'
        :'background:rgba(255,255,255,.05);color:var(--t3);border:1px solid var(--bd)';
      const badgeTxt=isHot?'HOT':isGood?'GOOD':isWeak?'SLOW':'AVG';
      const barPct=Math.round((vpd/maxVpd)*100);
      return `<tr style="border-bottom:1px solid rgba(255,255,255,.03);transition:background .12s" onmouseover="this.style.background='rgba(255,255,255,.025)'" onmouseout="this.style.background=''">
        <td style="padding:9px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--t3);width:28px;text-align:center">${i+1}</td>
        <td style="padding:9px 10px;max-width:0;width:99%">
          <a href="${esc(v.url)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;color:var(--t1);text-decoration:none">${esc(v.title)}</a>
          <div style="display:flex;align-items:center;gap:6px;margin-top:5px">
            <div style="flex:1;height:4px;background:var(--sf-highest);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${barPct}%;background:${color};border-radius:2px;transition:width .6s"></div>
            </div>
          </div>
        </td>
        <td style="padding:9px 8px;white-space:nowrap">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.4px;padding:3px 8px;border-radius:6px;${badgeStyle}">${badgeTxt}</span>
        </td>
        <td style="padding:9px 8px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:800;color:${color};white-space:nowrap">${fmtN(vpd)}<span style="font-size:9px;font-weight:400;color:var(--t3);margin-left:2px">/day</span></td>
        <td style="padding:9px 8px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--t2);white-space:nowrap">${fmtN(v.view_count||v.views_raw||0)}</td>
        <td style="padding:9px 8px;text-align:right;font-size:11px;color:var(--t3);white-space:nowrap">${v.daysLive}d old</td>
      </tr>`;
    }).join('');

    const avgVpd=withVpd.reduce((s,v)=>s+(v.vpd||0),0)/Math.max(withVpd.length,1);
    const hotCount=withVpd.filter(v=>(v.vpd||0)>=1000).length;
    const goodCount=withVpd.filter(v=>(v.vpd||0)>=200&&(v.vpd||0)<1000).length;

    contEl.innerHTML=`
      ${shortsCount > 0 ? `<div style="margin: 0 0 16px 0; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--bd); border-radius: 6px; font-size: 11.5px; color: var(--t3); display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 14px">ℹ️</span>
        <span><b>${shortsCount} Shorts</b> are excluded from these analytics to ensure performance data reflects long-form content.</span>
      </div>` : ''}
      <div class="am-month-summary">
        <div class="am-ms-item"><div class="am-ms-val" style="color:var(--gr)">${hotCount}</div><div class="am-ms-lbl">🔥 Hot (&gt;1K/day)</div></div>
        <div class="am-ms-item"><div class="am-ms-val" style="color:var(--gold)">${goodCount}</div><div class="am-ms-lbl">✅ Good (&gt;200/day)</div></div>
        <div class="am-ms-item"><div class="am-ms-val">${fmtN(avgVpd)}</div><div class="am-ms-lbl">Avg Views/Day</div></div>
        <div class="am-ms-item"><div class="am-ms-val">${fmtN(withVpd[0]?.vpd||0)}</div><div class="am-ms-lbl">Fastest Video</div></div>
      </div>
      <div class="am-sep-sect">
        <div class="am-sect-lbl">Top 50 Videos by Growth Speed</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:1px solid var(--bd)">
              <th style="padding:6px 10px;text-align:left;font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">#</th>
              <th style="padding:6px 10px;text-align:left;font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Title</th>
              <th style="padding:6px 6px;text-align:right;font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Views/Day</th>
              <th style="padding:6px 6px;text-align:right;font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Total Views</th>
              <th style="padding:6px 6px;text-align:right;font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Age</th>
              <th style="padding:6px 6px;text-align:right;font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Date</th>
            </tr></thead>
            <tbody>${topRows}</tbody>
          </table>
        </div>
      </div>`;
    loadEl.style.display='none';contEl.style.display='block';
  }catch(ex){
    contEl.innerHTML=`<div class="am-err">Failed: ${esc(String(ex))}</div>`;
    loadEl.style.display='none';contEl.style.display='block';
  }
}

/* ── Tab 4: vs Competitors ──────────────────────────── */
function renderAmCompare(){
  const contEl=document.getElementById('amCompareContent');
  if(!all.length){contEl.innerHTML='<p style="color:var(--t3);padding:24px">No channels to compare.</p>';return;}

  const focalId = _amChannelId;
  const me = all.find(c => c.id === focalId) || all.find(c => c.is_primary) || all[0];
  const sorted=[...all].sort((a,b)=>(b.subscribers_raw||0)-(a.subscribers_raw||0));

  const metrics=[
    {key:'subscribers',     raw:'subscribers_raw',   label:'Subscribers',     fmt:v=>fmtN(v),  higher:true},
    {key:'total_views',     raw:'total_views_raw',   label:'Total Views',     fmt:v=>fmtN(v),  higher:true},
    {key:'avg_views',       raw:'avg_views_raw',     label:'Avg Views/Video', fmt:v=>fmtN(v),  higher:true},
    {key:'total_videos',    raw:'total_videos_raw',  label:'Videos',          fmt:v=>fmtN(v),  higher:true},
  ];

  // Header row with channel names
  const headCells=sorted.map(ch=>`
    <th style="padding:10px 12px;text-align:center;min-width:100px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
        ${ch.logo_url?`<img src="${esc(proxyImg(ch.logo_url))}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid ${ch.id===me.id?'var(--gold)':'var(--bd2)'}" onerror="this.style.background='var(--sf-highest)'" alt="">`
          :`<div style="width:32px;height:32px;border-radius:50%;background:var(--sf-highest);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${(ch.name||'?')[0]}</div>`}
        <div style="font-size:11px;font-weight:600;color:${ch.id===me.id?'var(--gold)':'var(--t2)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px" title="${esc(ch.name)}">${esc(ch.name.length>12?ch.name.slice(0,12)+'…':ch.name)}</div>
        ${ch.id===me.id?'<span class="badge bdg-gd" style="font-size:9px">⭐ Focused</span>':''}
      </div>
    </th>`).join('');

  const metricRows=metrics.map(m=>{
    const vals=sorted.map(ch=>ch[m.raw]||0);
    const best=Math.max(...vals);
    const cells=sorted.map((ch,i)=>{
      const v=ch[m.raw]||0;
      const isBest=v===best&&best>0;
      const isMe=ch.id===me.id;
      const rank=vals.filter(x=>x>v).length+1;
      return `<td style="padding:10px 12px;text-align:center;background:${isMe?'rgba(255,213,79,.03)':'transparent'}">
        <div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:${isBest?'var(--gr)':isMe?'var(--gold)':'var(--t1)'}">${m.fmt(v)}</div>
        <div style="font-size:9px;color:var(--t3);margin-top:2px">#${rank}</div>
        ${isBest?'<span style="font-size:9px;color:var(--gr)">▲ Best</span>':''}
      </td>`;
    }).join('');
    return `<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
      <td style="padding:10px 16px;font-size:12px;font-weight:600;color:var(--t2);white-space:nowrap">${m.label}</td>
      ${cells}
    </tr>`;
  }).join('');

  contEl.innerHTML=`
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--bd)">
          <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3)">Metric</th>
          ${headCells}
        </tr></thead>
        <tbody>${metricRows}</tbody>
      </table>
    </div>`;
}

/* ── Tab 5: Growth Timeline ─────────────────────────── */
async function renderAmTimeline(){
  if(!_amChannelId)return;
  const loadEl=document.getElementById('amTimelineLoading');
  const contEl=document.getElementById('amTimelineContent');
  loadEl.style.display='flex';
  contEl.style.display='none';

  try{
    if(!_amSnapshots){
      const r=await fetch(`/api/snapshots/${_amChannelId}`);
      _amSnapshots=await r.json();
    }
    const snaps=_amSnapshots;

    if(!snaps||snaps.length<2){
      contEl.innerHTML=`
        <div style="text-align:center;padding:48px 24px">
          <div style="font-size:32px;margin-bottom:12px">📈</div>
          <div style="font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;margin-bottom:8px">Building your timeline…</div>
          <div style="font-size:13px;color:var(--t3);line-height:1.6;max-width:320px;margin:0 auto">
            The growth timeline needs at least 2 data points.<br>
            Hit <strong>Refresh</strong> on your channel today, then again tomorrow — your trajectory will appear here.
          </div>
          ${snaps.length===1?`<div style="margin-top:16px;font-size:12px;color:var(--pr)">✅ First snapshot recorded on ${snaps[0].date}</div>`:''}
        </div>`;
      loadEl.style.display='none';contEl.style.display='block';return;
    }

    const sorted=[...snaps].sort((a,b)=>a.date.localeCompare(b.date));
    const maxSubs=Math.max(...sorted.map(s=>s.subscribers||0),1);
    const minSubs=Math.min(...sorted.map(s=>s.subscribers||0),0);
    const rangeS=Math.max(maxSubs-minSubs,1);

    const W=600,H=140,pad=32;
    const ptSubs=sorted.map((s,i)=>{
      const x=pad+(i/(sorted.length-1))*(W-pad*2);
      const y=H-pad-((s.subscribers-minSubs)/rangeS)*(H-pad*2);
      return `${x},${y}`;
    }).join(' ');

    const maxViews=Math.max(...sorted.map(s=>s.views||0),1);
    const minViews=Math.min(...sorted.map(s=>s.views||0),0);
    const rangeV=Math.max(maxViews-minViews,1);
    const ptViews=sorted.map((s,i)=>{
      const x=pad+(i/(sorted.length-1))*(W-pad*2);
      const y=H-pad-((s.views-minViews)/rangeV)*(H-pad*2);
      return `${x},${y}`;
    }).join(' ');

    const subsGain=(sorted[sorted.length-1].subscribers||0)-(sorted[0].subscribers||0);
    const viewsGain=(sorted[sorted.length-1].views||0)-(sorted[0].views||0);
    const trackingDays=Math.max(1,Math.floor((new Date(sorted[sorted.length-1].date)-new Date(sorted[0].date))/864e5)+1);

    contEl.innerHTML=`
      <div class="am-month-summary">
        <div class="am-ms-item"><div class="am-ms-val" style="color:${subsGain>=0?'var(--gr)':'var(--rd)'}">${subsGain>=0?'+':''}${fmtN(subsGain)}</div><div class="am-ms-lbl">Subscriber Change</div></div>
        <div class="am-ms-item"><div class="am-ms-val" style="color:${viewsGain>=0?'var(--gr)':'var(--rd)'}">${viewsGain>=0?'+':''}${fmtN(viewsGain)}</div><div class="am-ms-lbl">View Change</div></div>
        <div class="am-ms-item"><div class="am-ms-val">${trackingDays}</div><div class="am-ms-lbl">Days Tracked</div></div>
        <div class="am-ms-item"><div class="am-ms-val">${sorted.length}</div><div class="am-ms-lbl">Snapshots</div></div>
      </div>
      <div class="am-sep-sect">
        <div class="am-sect-lbl">Subscriber Growth</div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" class="am-sparkline">
          <defs>
            <linearGradient id="subsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--gold)" stop-opacity=".25"/>
              <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <polygon points="${ptSubs} ${pad+(sorted.length-1)/(sorted.length-1)*(W-pad*2)},${H-pad} ${pad},${H-pad}" fill="url(#subsFill)"/>
          <polyline points="${ptSubs}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${sorted.map((s,i)=>{
            const x=pad+(i/(sorted.length-1))*(W-pad*2);
            const y=H-pad-((s.subscribers-minSubs)/rangeS)*(H-pad*2);
            return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--gold)" stroke="var(--sf-low)" stroke-width="2"/>`;
          }).join('')}
          <text x="${pad}" y="${H-4}" font-size="10" fill="rgba(255,255,255,.35)">${sorted[0].date}</text>
          <text x="${W-pad}" y="${H-4}" font-size="10" text-anchor="end" fill="rgba(255,255,255,.35)">${sorted[sorted.length-1].date}</text>
        </svg>
      </div>
      <div class="am-sep-sect">
        <div class="am-sect-lbl">Total Views Growth</div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" class="am-sparkline">
          <defs>
            <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--pr)" stop-opacity=".2"/>
              <stop offset="100%" stop-color="var(--pr)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <polygon points="${ptViews} ${pad+(sorted.length-1)/(sorted.length-1)*(W-pad*2)},${H-pad} ${pad},${H-pad}" fill="url(#viewsFill)"/>
          <polyline points="${ptViews}" fill="none" stroke="var(--pr)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${sorted.map((s,i)=>{
            const x=pad+(i/(sorted.length-1))*(W-pad*2);
            const y=H-pad-((s.views-minViews)/rangeV)*(H-pad*2);
            return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--pr)" stroke="var(--sf-low)" stroke-width="2"/>`;
          }).join('')}
          <text x="${pad}" y="${H-4}" font-size="10" fill="rgba(255,255,255,.35)">${sorted[0].date}</text>
          <text x="${W-pad}" y="${H-4}" font-size="10" text-anchor="end" fill="rgba(255,255,255,.35)">${sorted[sorted.length-1].date}</text>
        </svg>
      </div>`;
    loadEl.style.display='none';contEl.style.display='block';
  }catch(ex){
    contEl.innerHTML=`<div class="am-err">Failed: ${esc(String(ex))}</div>`;
    loadEl.style.display='none';contEl.style.display='block';
  }
}

/* ════════════════════════════════════════════════════════
   MY CHANNELS
════════════════════════════════════════════════════════ */
function renderChannelSkeletons(n=6){
  const tbl = document.getElementById('chTbl');
  if(!tbl) return;
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


function handleCardClick(event, channelId){
  if(event.target.closest('.cc-acts') || event.target.closest('.cc-expand-vid') || event.target.closest('.cc-view-link')) return;
  const ch = all.find(c => c.id === channelId);
  if(!ch) return;
  if(ch.is_primary) openAnalyticsModal(channelId);
  else openAnalyticsModal(channelId);
}

async function renderChannels(){
  renderChannelSkeletons(all.length || 6);
  await fetchAll();
  const el=document.getElementById('chTbl');
  const cnt=document.getElementById('chCntLbl');
  if(cnt)cnt.textContent=all.length?all.length:'';
  if(!all.length){
    el.innerHTML=`<div class="no-pr" style="margin-top:24px">
      <div class="no-pr-ico"><span style="font-family:'Material Symbols Outlined';font-size:48px;color:var(--t4)">subscriptions</span></div>
      <h3>No channels yet</h3>
      <p>Add channels to start tracking competitor analytics and performance metrics.</p>
      <button class="btn btn-pr" onclick="toggleAdd()">+ Add Your First Channel</button>
    </div>`;
    return;
  }
  const primary=all.find(c=>c.is_primary);
  const competitors=all.filter(c=>!c.is_primary).sort((a,b)=>(b[chSort]||0)-(a[chSort]||0));
  const sortedAll=primary?[primary,...competitors]:competitors;

  const renderCard = (ch, index) => {
    const isMine=ch.is_primary;
    const v=ch.video||{};
    const chSub=ch.subscriber_count??ch.subscribers_raw??0;
    const chVidCnt=ch.video_count??ch.total_videos_raw??0;
    const chTotViews=ch.total_views_raw??0;
    const cardVcount=v.view_count??v.views_raw??0;
    const cardLcount=v.like_count??0;
    const cardCcount=v.comment_count??0;
    const vidDateStr=v.published_at||v.date;
    const cardVpd=vidDateStr?viewsPerDay(cardVcount,vidDateStr):null;
    const cardHot=isHotVideo(cardVpd,chTotViews,chVidCnt);
    const cardEngRate=calcEngagementRate(cardLcount,cardCcount,cardVcount);
    const cardSubRatio=calcSubViewRatio(chSub,chTotViews);
    const chAvgRaw=ch.avg_views_raw??0;
    const cardVsAvg=(chAvgRaw>0&&cardVcount>0)?Math.round(((cardVcount-chAvgRaw)/chAvgRaw)*100):null;
    const relDays=vidDateStr?Math.floor((Date.now()-new Date(vidDateStr).getTime())/(864e5)):null;
    const relDate=relDays===null?'—':relDays===0?'Today':relDays===1?'1d ago':relDays<30?`${relDays}d ago`:relDays<365?`${Math.floor(relDays/30)}mo ago`:`${Math.floor(relDays/365)}y ago`;

    return `
<div class="ch-card au ${isMine?'mine':''}" id="ctr-${esc(ch.id)}"
  onclick="openAnalyticsModal('${esc(ch.id)}')"
  style="animation-delay:${index * 0.04}s">

  <!-- Actions overlay — unchanged -->
  <div class="cc-acts" onclick="event.stopPropagation()">
    ${!isMine?`<button class="cc-act gold" title="Set as My Channel" onclick="setPrimary('${esc(ch.id)}')"><span class="msi" style="font-size:16px">star</span></button>`:''}
    <button class="cc-act" title="Refresh" onclick="ref1('${esc(ch.id)}')"><span class="msi" style="font-size:16px">refresh</span></button>
    <button class="cc-act danger" title="Remove" onclick="rmCh('${esc(ch.id)}')"><span class="msi" style="font-size:16px">delete</span></button>
  </div>

  <!-- Compact always-visible header -->
  <div class="cc-top">
    <div class="cc-av">
      ${ch.logo_url
        ?`<img class="cc-logo" src="${esc(proxyImg(ch.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`
        :`<div class="cc-logo-fb">${(ch.name||'?')[0].toUpperCase()}</div>`}
      ${isMine?'<div class="cc-crown"><span style="font-family:\'Material Symbols Outlined\'">star</span></div>':''}
    </div>
    <div class="cc-ident">
      <div class="cc-name">${esc(ch.name)}</div>
      ${ch.handle?`<div class="cc-handle">${esc(ch.handle)}</div>`:''}
      <div class="cc-tags">
        ${isMine?'<span class="badge bdg-gd">⭐ My Channel</span>':'<span class="badge bdg-dim">Competitor</span>'}
        ${ch.country?`<span class="badge bdg-dim">${esc(ch.country)}</span>`:''}
        ${cardHot?'<span class="badge bdg-rd">🔥 Hot</span>':''}
        <span class="badge" id="cc-streak-${esc(ch.id)}" style="display:none"></span>
      </div>
    </div>
    <!-- Always-visible right summary -->
    <div class="cc-summary">
      <div class="cc-summary-subs">${esc(ch.subscribers)}</div>
      <div class="cc-summary-lbl">Subscribers</div>
      <div class="cc-summary-sub2">${esc(ch.total_videos)} videos</div>
    </div>
  </div>

  <!-- Expandable body — shown on hover -->
  <div class="cc-expand">
    <div class="cc-expand-inner">

      <!-- 4-cell stats strip -->
      <div class="cc-stats-row">
        <div class="cc-sb">
          <div class="cc-sb-val" style="${subViewRatioColor(cardSubRatio)}">${cardSubRatio!==null?cardSubRatio+'%':'—'}</div>
          <div class="cc-sb-lbl">Audience %</div>
        </div>
        <div class="cc-sb">
          <div class="cc-sb-val green">${esc(ch.avg_views)}</div>
          <div class="cc-sb-lbl">Avg Views</div>
        </div>
        <div class="cc-sb">
          <div class="cc-sb-val" style="${cardVpd&&cardVpd>1000?'color:var(--pr)':''}">${cardVpd?fmtN(cardVpd):'—'}</div>
          <div class="cc-sb-lbl">Views/Day</div>
        </div>
        <div class="cc-sb">
          <div class="cc-sb-val" id="cc-eng-${esc(ch.id)}" style="color:var(--t3)">—</div>
          <div class="cc-sb-lbl">Engagement</div>
        </div>
      </div>

      <!-- Sparkline (enriched async) -->
      <div class="cc-spark-wrap">
        <div class="cc-spark" id="cc-spark-${esc(ch.id)}"></div>
      </div>

      <!-- Latest upload footer -->
      <div class="cc-footer" id="cc-footer-${esc(ch.id)}" style="${v.title ? '' : 'display:none'}">
        ${v.title?`
        <div class="cc-vid">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div class="cc-vlbl">Latest Upload</div>
            <div style="font-size:10px;color:var(--t3)">${relDate}</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <img class="cc-vthumb" src="${esc(v.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
            <div class="cc-vinfo">
              <div class="cc-vtitle">${esc(v.title)}</div>
              <div class="cc-vstats">
                <span style="color:var(--pr)"><span class="ms-icon">visibility</span> ${esc(v.views)}</span>
                <span style="color:var(--t2)"><span class="ms-icon">thumb_up</span> ${esc(v.likes)}</span>
              </div>
            </div>
          </div>
        </div>`:''}
      </div>

    </div>
  </div>

</div>`;
  };

  el.innerHTML=`<div class="ch-grid">${sortedAll.map((ch, i) => renderCard(ch, i)).join('')}</div>`;
  enrichCards();
}

function toggleAdd(){
  const p=document.getElementById('addPanel');
  p.classList.toggle('open');
  const o=p.classList.contains('open');
  const btn=document.getElementById('addTgl');
  btn.innerHTML=o
    ?`<span style="font-family:'Material Symbols Outlined';font-size:16px;line-height:1;vertical-align:middle">close</span> Cancel`
    :`<span style="font-family:'Material Symbols Outlined';font-size:16px;line-height:1;vertical-align:middle">add</span> Add Channel`;
  if(o)setTimeout(()=>document.getElementById('addInput').focus(),50);
}

async function addCh(){
  closeAddSuggestions();
  const q=document.getElementById('addInput').value.trim();
  if(!q){showErr('addErr','Please enter a channel name.');return;}
  hideErr('addErr');
  const btn=document.getElementById('addBtn');
  btn.disabled=true;btn.textContent='Adding…';
  try{
    const r=await fetch('/api/channels/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q})});
    const res=await r.json();
    if(r.status===409){showErr('addErr','Already in your list.');return;}
    if(!r.ok){showErr('addErr',res.error||'Could not add.');return;}
    document.getElementById('addInput').value='';
    toggleAdd();
    await renderChannels();
    toast('Channel added!','s');
  }catch{showErr('addErr','Network error.');}
  finally{btn.disabled=false;btn.textContent='Add';}
}

async function setPrimary(id){
  try{
    const r=await fetch(`/api/channels/${id}/set-primary`,{method:'POST'});
    if(!r.ok){toast('Could not set primary','e');return;}
    toast('Set as My Channel!','s');
    await renderChannels();
    renderDash();
  }catch{toast('Network error','e');}
}

async function rmCh(id){
  const row=document.getElementById('ctr-'+id);
  if(row){row.style.transition='opacity .2s,transform .2s';row.style.opacity='0';row.style.transform='translateX(8px)';}
  await new Promise(r=>setTimeout(r,220));
  await fetch(`/api/channels/${id}`,{method:'DELETE'});
  toast('Channel removed','e');
  await renderChannels();
}

async function ref1(id){
  const btn=document.getElementById('ref-'+id);
  if(btn){btn.style.opacity='.4';btn.disabled=true;}
  try{
    const r=await fetch(`/api/channels/${id}/refresh`,{method:'POST'});
    if(!r.ok){toast('Refresh failed','e');return;}
    toast('Stats updated!','s');
    await renderChannels();
  }catch{toast('Refresh failed','e');}
  finally{if(btn){btn.style.opacity='';btn.disabled=false;}}
}



const CH_COLORS=['#00E5FF','#FFD54F','#56FFA7','#FF7043','#BA68C8','#4FC3F7','#AED581','#F06292'];

async function loadThisMonthPanel(primaryId){
  const el=document.getElementById('dashMonthGlance');
  if(!el)return;
  try{
    const [vRes,sRes]=await Promise.all([
      fetch(`/api/channels/${primaryId}/videos/full`),
      fetch(`/api/snapshots/${primaryId}`)
    ]);
    const [vids,snaps]=await Promise.all([vRes.json(),sRes.json()]);
    if(!vids||!vids.length){el.style.display='none';return;}
    const now=new Date();
    const tm=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const lmd=new Date(now.getFullYear(),now.getMonth()-1,1);
    const lm=`${lmd.getFullYear()}-${String(lmd.getMonth()+1).padStart(2,'0')}`;
    const tmV=vids.filter(v=>(v.published_at||v.date||'').startsWith(tm));
    const lmV=vids.filter(v=>(v.published_at||v.date||'').startsWith(lm));
    const tmViews=tmV.reduce((s,v)=>s+(v.view_count||v.views_raw||0),0);
    const lmViews=lmV.reduce((s,v)=>s+(v.view_count||v.views_raw||0),0);
    const tmLikes=tmV.reduce((s,v)=>s+(v.like_count||0),0);
    const tmCmts=tmV.reduce((s,v)=>s+(v.comment_count||0),0);
    const eng=tmViews>0?((tmLikes+tmCmts)/tmViews*100).toFixed(1):null;
    const mom=lmViews>0?Math.round(((tmViews-lmViews)/lmViews)*100):null;
    
    // Calculate values for rendering
    const viewsThisMonth = tmViews;
    const videosThisMonth = tmV.length;
    const videosLastMonth = lmV.length;
    const engRate = eng !== null ? parseFloat(eng) : 0;
    
    const deltaViews = mom !== null ? mom : 0;
    const deltaClass = deltaViews > 0 ? 'up' : deltaViews < 0 ? 'down' : 'flat';
    const deltaSign  = deltaViews > 0 ? '▲' : deltaViews < 0 ? '▼' : '●';

    el.innerHTML=`
      <div class="dash-mg-card">
        <div class="dash-mg-icon" style="font-family: 'Segoe UI Emoji', sans-serif;">👁</div>
        <div class="dash-mg-val">${fmtN(viewsThisMonth)}</div>
        <div class="dash-mg-lbl">Views This Month</div>
        <div class="dash-mg-delta ${deltaClass}">${deltaSign} ${Math.abs(deltaViews)}% vs last mo</div>
      </div>
      <div class="dash-mg-card">
        <div class="dash-mg-icon" style="font-family: 'Segoe UI Emoji', sans-serif;">🎬</div>
        <div class="dash-mg-val">${videosThisMonth}</div>
        <div class="dash-mg-lbl">Videos Uploaded</div>
        <div class="dash-mg-delta flat">${videosLastMonth} last month</div>
      </div>
      <div class="dash-mg-card">
        <div class="dash-mg-icon" style="font-family: 'Segoe UI Emoji', sans-serif;">💬</div>
        <div class="dash-mg-val">${engRate}%</div>
        <div class="dash-mg-lbl">Engagement Rate</div>
        <div class="dash-mg-delta ${engRate >= 4 ? 'up' : engRate >= 2 ? 'flat' : 'down'}">
          ${engRate >= 4 ? 'Excellent' : engRate >= 2 ? 'Average' : 'Below avg'}
        </div>
      </div>
    `;
  }catch(e){el.style.display='none';}
}

async function loadFastestGrowing(channels) {
  const el = document.getElementById('dashFastGrow');
  if (!el || channels.length < 2) return;

  // score = avg_views_raw / subscribers_raw (efficiency proxy)
  const scored = channels.map(ch => ({
    ch,
    score: ch.avg_views_raw && ch.subscribers_raw
      ? (ch.avg_views_raw / ch.subscribers_raw) * 100
      : 0,
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score === 0) return;
  const isPrimary = top.ch.id === channels.find(c => c.is_primary)?.id;

  el.innerHTML = `
    <div class="fg-card d2" onclick="openAnalyticsModal('${esc(top.ch.id)}')">
      <div class="fg-badge">🚀 Highest View Efficiency</div>
      <div class="fg-body">
        ${top.ch.logo_url
          ? `<img class="fg-logo" src="${esc(proxyImg(top.ch.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">`
          : `<div class="fg-logo-fb">${(top.ch.name || '?')[0]}</div>`}
        <div class="fg-info">
          <div class="fg-name">${esc(top.ch.name)}${isPrimary ? ' <span class="lb-you">⭐ You</span>' : ''}</div>
          <div class="fg-stat">
            Avg views per subscriber: <strong style="color:var(--gr);font-family:'JetBrains Mono',monospace">
            ${top.score.toFixed(1)}%</strong>
          </div>
          <div class="fg-sub" style="color:var(--t3);font-size:11px">
            ${fmtN(top.ch.avg_views_raw)} avg views · ${fmtN(top.ch.subscribers_raw)} subscribers
          </div>
        </div>
        <div class="fg-arrow">›</div>
      </div>
    </div>`;
}

async function loadUploadVelocity(channels) {
  const el = document.getElementById('dashVelocity');
  if (!el) return;

  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:13px;padding:20px 0"><div class="spin"></div>Building upload chart…</div>`;

  try {
    // ── 1. Collect last 6 months of video data per channel ──────────────
    const now    = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2),
        year:  d.getFullYear(),
        month: d.getMonth(),
      });
    }

    const channelData = await Promise.all(
      channels.map(async ch => {
        try {
          const r    = await fetch(`/api/channels/${ch.id}/videos/full`);
          const vids = await r.json();
          if (!Array.isArray(vids)) return { ch, counts: Array(6).fill(0) };
          const counts = months.map(m =>
            vids.filter(v => {
              const d = new Date(v.published_at || v.date || 0);
              return d.getFullYear() === m.year && d.getMonth() === m.month;
            }).length
          );
          return { ch, counts };
        } catch {
          return { ch, counts: Array(6).fill(0) };
        }
      })
    );

    // ── 2. Build SVG grouped bar chart ───────────────────────────────────
    // Chart dimensions
    const W       = 900, H = 220;
    const padL    = 32, padR = 12, padT = 20, padB = 40;
    const plotW   = W - padL - padR;
    const plotH   = H - padT - padB;
    const nMonths = months.length;          // 6
    const nCh     = channelData.length;

    const allCounts = channelData.flatMap(d => d.counts);
    const maxCount  = Math.max(...allCounts, 1);

    // Assign colours from a fixed palette
    const palette = [
      '#00d4ff', '#f5c842', '#22c55e', '#f97316',
      '#a855f7', '#ec4899', '#14b8a6', '#ef4444',
    ];

    const groupW  = plotW / nMonths;
    const barW    = Math.max(6, Math.min(18, Math.floor((groupW * 0.85) / nCh)));
    const barGap  = 3;
    const groupPad = (groupW - nCh * barW - (nCh - 1) * barGap) / 2;

    // Y axis grid lines
    const yTicks = [0, Math.round(maxCount / 2), maxCount];
    const gridLines = yTicks.map(t => {
      const y = padT + plotH - (t / maxCount) * plotH;
      return `
        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
              stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="4 4"/>
        <text x="${padL - 4}" y="${y + 4}" text-anchor="end"
              fill="rgba(255,255,255,0.3)" font-size="9"
              font-family="JetBrains Mono,monospace">${t}</text>`;
    }).join('');

    // Bars + tooltips
    let bars = '';
    channelData.forEach(({ ch, counts }, ci) => {
      const colour = palette[ci % palette.length];
      counts.forEach((count, mi) => {
        if (count === 0) return;
        const barH = Math.max(4, (count / maxCount) * plotH);
        const x    = padL + mi * groupW + groupPad + ci * (barW + barGap);
        const y    = padT + plotH - barH;
        bars += `
          <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
                rx="3" ry="3" fill="${colour}" opacity="0.85">
            <title>${esc(ch.name)} — ${months[mi].label}: ${count} video${count !== 1 ? 's' : ''}</title>
          </rect>
          <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle"
                fill="${colour}" font-size="9"
                font-family="JetBrains Mono,monospace"
                opacity="${count > 0 ? '1' : '0'}">${count}</text>`;
      });
    });

    // X axis month labels
    const xLabels = months.map((m, mi) => {
      const x = padL + mi * groupW + groupW / 2;
      return `<text x="${x}" y="${H - 6}" text-anchor="middle"
                    fill="rgba(255,255,255,0.45)" font-size="10"
                    font-family="DM Sans,sans-serif">${m.label}</text>`;
    }).join('');

    // Legend
    const legendItems = channelData.map(({ ch }, ci) =>
      `<span class="vel-legend-dot" style="background:${palette[ci % palette.length]}"></span>
       <span class="vel-legend-name">${esc(ch.name)}</span>`
    ).join('');

    el.innerHTML = `
      <div class="dash-section-hdr">
        <span style="font-family:'Material Symbols Outlined';font-size:16px;vertical-align:middle">bar_chart</span>
        Monthly Upload Velocity <em style="color:var(--t4);font-style:normal;font-weight:400;font-size:11px;letter-spacing:0">last 6 months</em>
      </div>
      <div class="vel-wrap d2">
        <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet"
             style="display:block;overflow:visible">
          ${gridLines}
          ${bars}
          ${xLabels}
        </svg>
        <div class="vel-legend">${legendItems}</div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="err" style="display:block">Could not load velocity chart.</div>`;
  }
}

/* ════════════════════════════════════════════════════════
   SEARCH — with AUTOCOMPLETE DROPDOWN
════════════════════════════════════════════════════════ */
let _srDebounce=null;
let _srQuotaCount=0;
let _srQuotaReset=Date.now();
const SR_QUOTA_MAX=10;     // max autocomplete calls per minute
const SR_QUOTA_WINDOW=60000; // 60 seconds

// Replace the existing keydownâ€only listener with full keyup debounce
document.getElementById('srInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){closeSuggestions();doSearch();}
  if(e.key==='Escape')closeSuggestions();
});

document.getElementById('srInput').addEventListener('keyup',e=>{
  if(['Enter','Escape','ArrowDown','ArrowUp'].includes(e.key))return;
  const q=document.getElementById('srInput').value.trim();
  clearTimeout(_srDebounce);
  if(q.length<2){closeSuggestions();return;}
  _srDebounce=setTimeout(()=>doAutocomplete(q),500);
});

document.getElementById('srInput').addEventListener('blur',()=>{
  // Delay to allow click on suggestion row
  setTimeout(closeSuggestions,220);
});

async function doAutocomplete(q){
  // Quota guard: max SR_QUOTA_MAX calls per SR_QUOTA_WINDOW ms
  const now=Date.now();
  if(now-_srQuotaReset>SR_QUOTA_WINDOW){_srQuotaCount=0;_srQuotaReset=now;}
  if(_srQuotaCount>=SR_QUOTA_MAX){
    showSuggestions([],true);return;
  }
  _srQuotaCount++;

  try{
    const r=await fetch('/api/channels/search-suggest?q='+encodeURIComponent(q));
    if(!r.ok){closeSuggestions();return;}
    const items=await r.json();
    showSuggestions(items,false);
  }catch{
    closeSuggestions();
  }
}

function showSuggestions(items, rateLimited){
  const dd=document.getElementById('srDropdown');
  if(!dd)return;
  if(rateLimited){
    dd.innerHTML=`<div class="sug-msg">⚡ Too many searches — please wait a moment</div>`;
    dd.style.display='block';return;
  }
  if(!items||!items.length){dd.style.display='none';return;}
  dd.innerHTML=items.map(ch=>`
    <div class="sug-row" onclick="selectSuggestion('${esc(ch.id)}')">
      <div class="sug-avatar">
        ${ch.logo_url
          ?`<img src="${esc(proxyImg(ch.logo_url))}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.background='var(--sf-highest)'" alt="">`
          :`<div style="width:100%;height:100%;border-radius:50%;background:var(--sf-highest);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--t3)">${(ch.name||'?')[0]}</div>`}
      </div>
      <div class="sug-info">
        <div class="sug-name">${esc(ch.name)}</div>
        <div class="sug-handle">${esc(ch.handle||'')} · ${esc(ch.subscribers)} subs</div>
      </div>
      <div class="sug-select">Select</div>
    </div>`).join('');
  dd.style.display='block';
}

async function selectSuggestion(channelId){
  closeSuggestions();
  // Fetch full channel by ID using channels.list (1 unit, NOT search.list which is 100 units)
  document.getElementById('srRes').style.display='none';
  document.getElementById('srSkel').style.display='block';
  document.getElementById('srBtn').disabled=true;
  try{
    const r=await fetch('/api/channel-by-id/'+encodeURIComponent(channelId));
    const d=await r.json();
    if(!r.ok){showErr('srErr',d.error||'Not found.');return;}
    renderSearch(d);
  }catch{showErr('srErr','Network error.');}
  finally{document.getElementById('srSkel').style.display='none';document.getElementById('srBtn').disabled=false;}
}

function closeSuggestions(){
  const dd=document.getElementById('srDropdown');
  if(dd)dd.style.display='none';
}

/* ════════════════════════════════════════════════════════
   ADD CHANNEL PANEL — AUTOCOMPLETE
════════════════════════════════════════════════════════ */
let _addDebounce=null;

// Attach listeners directly — app.js uses defer so DOM is already ready when this runs
(function initAddAutocomplete(){
  const inp=document.getElementById('addInput');
  if(!inp)return;
  inp.addEventListener('keyup',e=>{
    if(['Enter','Escape','ArrowDown','ArrowUp'].includes(e.key)){if(e.key==='Escape')closeAddSuggestions();return;}
    const q=inp.value.trim();
    clearTimeout(_addDebounce);
    if(q.length<2){closeAddSuggestions();return;}
    _addDebounce=setTimeout(()=>doAddAutocomplete(q),380);
  });
  inp.addEventListener('blur',()=>setTimeout(closeAddSuggestions,220));
})();

async function doAddAutocomplete(q){
  // Reuse the same quota guard as the search page
  const now=Date.now();
  if(now-_srQuotaReset>SR_QUOTA_WINDOW){_srQuotaCount=0;_srQuotaReset=now;}
  if(_srQuotaCount>=SR_QUOTA_MAX){showAddSuggestions([],true);return;}
  _srQuotaCount++;
  try{
    const r=await fetch('/api/channels/search-suggest?q='+encodeURIComponent(q));
    if(!r.ok){closeAddSuggestions();return;}
    const items=await r.json();
    showAddSuggestions(items,false);
  }catch{closeAddSuggestions();}
}

function showAddSuggestions(items,rateLimited){
  const dd=document.getElementById('addDropdown');
  if(!dd)return;
  if(rateLimited){
    dd.innerHTML=`<div class="sug-msg">⚡ Too many searches — please wait</div>`;
    dd.style.display='block';return;
  }
  if(!items||!items.length){dd.style.display='none';return;}
  dd.innerHTML=items.map(ch=>`
    <div class="sug-row" onclick="selectAddSuggestion('${esc(ch.id)}','${esc(ch.name)}')">
      <div class="sug-avatar">
        ${ch.logo_url
          ?`<img src="${esc(proxyImg(ch.logo_url))}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.background='var(--sf-highest)'" alt="">`
          :`<div style="width:100%;height:100%;border-radius:50%;background:var(--sf-highest);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--t3)">${(ch.name||'?')[0]}</div>`}
      </div>
      <div class="sug-info">
        <div class="sug-name">${esc(ch.name)}</div>
        <div class="sug-handle">${esc(ch.handle||'')} · ${esc(ch.subscribers)} subs</div>
      </div>
      <div class="sug-select">+ Add</div>
    </div>`).join('');
  dd.style.display='block';
}

async function selectAddSuggestion(channelId, channelName){
  closeAddSuggestions();
  const inp=document.getElementById('addInput');
  if(inp)inp.value=channelName||channelId;
  hideErr('addErr');
  const btn=document.getElementById('addBtn');
  if(btn){btn.disabled=true;btn.textContent='Adding…';}
  try{
    const r=await fetch('/api/channels/add',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({channel_id:channelId})
    });
    const res=await r.json();
    if(r.status===409){showErr('addErr','Already in your list.');return;}
    if(!r.ok){showErr('addErr',res.error||'Could not add.');return;}
    if(inp)inp.value='';
    toggleAdd();
    await renderChannels();
    toast('Channel added!','s');
  }catch{showErr('addErr','Network error.');}
  finally{if(btn){btn.disabled=false;btn.textContent='Add';}}
}

function closeAddSuggestions(){
  const dd=document.getElementById('addDropdown');
  if(dd)dd.style.display='none';
}

async function doSearch(){
  const q=document.getElementById('srInput').value.trim();
  if(!q){showErr('srErr','Please enter a channel name.');return;}
  hideErr('srErr');
  closeSuggestions();
  document.getElementById('srRes').style.display='none';
  document.getElementById('srRes').innerHTML='';
  document.getElementById('srSkel').style.display='block';
  document.getElementById('srBtn').disabled=true;
  try{
    const r=await fetch('/api/channel?q='+encodeURIComponent(q));
    const d=await r.json();
    if(!r.ok){showErr('srErr',d.error||'Something went wrong.');return;}
    renderSearch(d);
  }catch{showErr('srErr','Network error.');}
  finally{document.getElementById('srSkel').style.display='none';document.getElementById('srBtn').disabled=false;}
}

function renderSearch(d){
  const vid=d.video||{};
  const inList=all.some(c=>c.id===d.id);
  document.getElementById('srRes').innerHTML=`
    <div class="sr-card au">
      ${d.banner_url
        ?`<img class="sr-banner" src="${esc(proxyImg(d.banner_url))}" onerror="this.outerHTML='<div class=sr-banner-ph></div>'" alt="">`
        :'<div class="sr-banner-ph"></div>'}
      <div class="sr-head">
        <img class="sr-logo" src="${esc(proxyImg(d.logo_url))}" onerror="this.style.background='var(--sf-highest)'" alt="">
        <div class="sr-meta">
          <div class="sr-name">${esc(d.name)}</div>
          <div class="sr-sub">
            ${d.handle?`<span class="badge bdg-pr">${esc(d.handle)}</span>`:''}
            ${d.country?`<span class="badge bdg-dim">${esc(d.country)}</span>`:''}
            ${d.created?`<span style="font-size:12px;color:var(--t3)">Since ${d.created}</span>`:''}
          </div>
        </div>
        <button class="btn ${inList?'btn-gh':'btn-pr'} sr-save" id="sav-${esc(d.id)}"
          onclick="toggleSave(${JSON.stringify(d).replace(/"/g,'&quot;')})">
          ${inList?'✓ Tracking':'+ Track Channel'}
        </button>
      </div>
      <div class="sr-stats">
        <div class="sr-st"><div class="sr-st-ico">ðŸ‘¥</div><div class="sr-st-val" style="color:var(--gold)">${esc(d.subscribers)}</div><div class="sr-st-lbl">Subscribers</div></div>
        <div class="sr-st"><div class="sr-st-ico">👁</div><div class="sr-st-val">${esc(d.total_views)}</div><div class="sr-st-lbl">Total Views</div></div>
        <div class="sr-st"><div class="sr-st-ico">🎬</div><div class="sr-st-val" style="color:var(--pr)">${esc(d.total_videos)}</div><div class="sr-st-lbl">Videos</div></div>
        <div class="sr-st"><div class="sr-st-ico">ðŸ“Š</div><div class="sr-st-val" style="color:var(--gr)">${esc(d.avg_views)}</div><div class="sr-st-lbl">Avg Views</div></div>
      </div>
      ${d.description?`<div class="sr-desc"><div class="sr-desc-l">About</div><div class="sr-desc-t">${esc(d.description)}${d.description.length>=300?'…':''}</div></div>`:''}
      ${vid.title?`
      <a class="sr-vid" href="${esc(vid.url)}" target="_blank" rel="noopener">
        <img class="sr-vthumb" src="${esc(vid.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
        <div class="sr-vbody">
          <div class="sr-vbadge">âœ¦ Latest Upload</div>
          <div class="sr-vtitle">${esc(vid.title)}</div>
          <div class="sr-vdate">Published ${vid.date}</div>
          <div class="sr-vstats">
            <div class="srv"><span class="srv-v">${esc(vid.views)}</span><span class="srv-l">👁 Views</span></div>
            <div class="srv"><span class="srv-v">${esc(vid.likes)}</span><span class="srv-l">👍 Likes</span></div>
            <div class="srv"><span class="srv-v">${esc(vid.comments)}</span><span class="srv-l">💬 Comments</span></div>
          </div>
        </div>
      </a>`:''}
    </div>`;
  document.getElementById('srRes').style.display='block';
}

async function toggleSave(d){
  const btn=document.getElementById('sav-'+d.id);
  const inList=all.some(c=>c.id===d.id);
  if(inList){
    await fetch(`/api/channels/${d.id}`,{method:'DELETE'});
    all=all.filter(c=>c.id!==d.id);
    if(btn){btn.textContent='+ Track Channel';btn.className='btn btn-pr sr-save';}
    toast('Channel removed','e');
  }else{
    if(btn){btn.disabled=true;btn.textContent='Adding…';}
    try{
      const r=await fetch('/api/channels/add',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({channel_id:d.id})
      });
      const res=await r.json();
      if(r.ok||r.status===409){
        if(!all.some(c=>c.id===d.id))all.push(res.channel||d);
        if(btn){btn.textContent='✓ Tracking';btn.className='btn btn-gh sr-save';btn.disabled=false;}
        toast('Channel added!','s');
      }else{toast(res.error||'Error','e');if(btn){btn.disabled=false;btn.textContent='+ Track Channel';}}
    }catch{toast('Network error','e');if(btn){btn.disabled=false;btn.textContent='+ Track Channel';}}
  }
}

/* ══ Export CSV ══════════════════════════════════════ */
function exportCSV(){
  const a=document.createElement('a');
  a.href='/api/export/csv';
  a.download='yt_tracker_channels.csv';
  a.click();
  toast('Exporting CSV…','s');
}

/* ══ Sort Channels ══════════════════════════════════ */
function setChSort(f){
  chSort=f;
  renderChannels();
}

/* ── Init ─────────────────────────────────────────── */
(async()=>{
  await fetchAll();
  renderDash();
})();
