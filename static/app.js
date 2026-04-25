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

const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Route YouTube CDN images through our proxy to avoid hotlink-block
function proxyImg(url){
  if(!url) return '';
  if(url.includes('ggpht.com')||url.includes('ytimg.com')||url.includes('googleusercontent.com'))
    return '/api/img-proxy?url='+encodeURIComponent(url);
  return url;
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
  return `<div class="${cls}-fb" style="display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;color:var(--t3)">${fb}</div>`;
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

    html+=`<div class="dash-greet">${greet()} 👋</div>
    <div class="dash-title">${primary?esc(primary.name)+' Analytics':'YT Tracker Dashboard'}</div>`;

    if(!primary){
      html+=`<div class="no-pr au">
        <div class="no-pr-ico">📺</div>
        <h3>Set your primary channel</h3>
        <p>Go to <strong>My Channels</strong>, add your channel, then click ⭐ Set Mine to see your analytics here.</p>
        <button class="btn btn-pr" onclick="sp('channels')">Open My Channels →</button>
      </div>`;
    } else {
      const v=primary.video||{};
      html+=`
      <div class="my-hero au" onclick="openAnalyticsModal('${esc(primary.id)}')">
        <div class="my-hero-top">
          <div class="my-hero-l">
            ${primary.logo_url
              ?`<img class="my-hero-logo" src="${esc(primary.logo_url)}" onerror="this.style.background='var(--sf-highest)'" alt="">`
              :`<div class="my-hero-logo" style="display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:var(--t3)">${(primary.name||'?')[0].toUpperCase()}</div>`}
            <div class="my-hero-text">
              <div class="my-hero-name">${esc(primary.name)}</div>
              <div class="my-hero-meta">
                ${primary.handle?`<span>${esc(primary.handle)}</span>`:''}
                ${primary.country?`<span>·</span><span>${esc(primary.country)}</span>`:''}
                ${primary.created?`<span>·</span><span>Since ${primary.created}</span>`:''}
              </div>
              <div class="my-hero-hint">Click to view full analytics →</div>
            </div>
          </div>
          ${v.title?`
          <div class="my-hero-vid" onclick="event.stopPropagation();window.open('${esc(v.url)}','_blank')">
            <div class="my-vid-lbl">Latest Upload</div>
            <div class="my-vid-mini">
              <img class="my-vid-thumb" src="${esc(v.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
              <div class="my-vid-body">
                <div class="my-vid-title">${esc(v.title)}</div>
                <div class="my-vid-meta">👁 ${esc(v.views)} · ${v.date||''}</div>
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
      </div>`;

      /* 4A placeholder */
      html+=`<div id="dashMonthGlance" class="dash-mg-wrap au"><div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:13px"><div class="spin"></div>Loading this month…</div></div>`;

      if(all.length>1)html+=buildLB(primary,comps);

      /* 4B placeholder */
      html+=`<div id="dashFastGrow"></div>`;

      const forRace=[primary,...comps].filter(c=>c.video&&c.video.title);
      if(forRace.length){
        const ranked=[...forRace].sort((a,b)=>(b.video.views_raw||0)-(a.video.views_raw||0));
        const rankIco=i=>['🥇','🥈','🥉'][i]||(i+1);
        html+=`<div class="sl d1">Latest Video Face-off <em>${forRace.length} channels compared</em></div>
        <div class="vr-grid d2">`;
        forRace.forEach(ch=>{
          const vv=ch.video,ri=ranked.findIndex(x=>x.id===ch.id),isMine=ch.id===primary.id;
          html+=`<div class="vr-card ${isMine?'mc':''}" onclick="openDrawer('${esc(ch.id)}')">
            <img class="vr-thumb" src="${esc(vv.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
            <div class="vr-body">
              <div class="vr-ch-row">
                ${ch.logo_url?`<img class="vr-ch-logo" src="${esc(ch.logo_url)}" onerror="this.style.background='var(--sf-highest)'" alt="">`:
                  `<div class="vr-ch-logo" style="display:flex;align-items:center;justify-content:center;font-weight:700;font-size:8px;color:var(--t3)">${(ch.name||'?')[0]}</div>`}
                <span class="vr-ch-name" style="${isMine?'color:var(--gold)':''}">${esc(ch.name)}</span>
                <span class="vr-rank">${rankIco(ri)}</span>
              </div>
              <div class="vr-title">${esc(vv.title)}</div>
              <div class="vr-views">${esc(vv.views)} <span style="font-size:11px;font-weight:400;color:var(--t3)">views</span></div>
              <div class="vr-date">📅 ${vv.date} · 👍 ${esc(vv.likes)}</div>
            </div>
          </div>`;
        });
        html+=`</div>`;
      }

      /* 4C placeholder */
      html+=`<div id="dashVelocity"></div>`;

      html+=`<div class="sl d3">My Recent Uploads</div>
        <div class="ru-grid d4" id="ruGrid">
          <div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:12.5px"><div class="spin"></div>Loading…</div>
        </div>`;
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
                <span class="ru-stat" style="color:var(--pr)">👁 ${esc(v.views)}</span>
                <span class="ru-stat" style="color:var(--gr)">👍 ${esc(v.likes)}</span>
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

function buildLB(primary,comps){
  const rows_all=[primary,...comps];
  const sorted=[...rows_all].sort((a,b)=>(b[sort]||0)-(a[sort]||0));
  const maxVal=Math.max(...rows_all.map(c=>c[sort]||0),1);
  const lbl=sort==='subscribers_raw'?'Subscribers':sort==='avg_views_raw'?'Avg Views':'Total Views';
  const lbl2=sort==='subscribers_raw'?'Avg Views':'Subscribers';
  const fld2=sort==='subscribers_raw'?'avg_views':'subscribers';
  const rk=['🥇','🥈','🥉'];
  let rows='';
  sorted.forEach((ch,i)=>{
    const pct=Math.round(((ch[sort]||0)/maxVal)*100);
    const mine=ch.id===primary.id;
    const rkCls=i===0?'rk1':i===1?'rk2':i===2?'rk3':'';
    const dispV=sort==='subscribers_raw'?ch.subscribers:sort==='avg_views_raw'?ch.avg_views:ch.total_views;
    rows+=`
    <div class="lb-row ${mine?'mine':''}" onclick="openDrawer('${esc(ch.id)}')">
      <div class="lb-rk ${rkCls}">${rk[i]||i+1}</div>
      <div class="lb-ch">
        ${ch.logo_url
          ?`<img class="lb-logo" src="${esc(ch.logo_url)}" onerror="this.style.background='var(--sf-highest)'" alt="">`
          :`<div class="lb-logo-fb">${(ch.name||'?')[0].toUpperCase()}</div>`}
        <div>
          <div class="lb-ch-name">${esc(ch.name)}${mine?'<span class="lb-you">⭐ You</span>':''}</div>
          <div class="lb-ch-hdl">${esc(ch.handle||'')}</div>
        </div>
      </div>
      <div class="lb-bar-row">
        <div class="lb-bar-bg"><div class="lb-bar ${mine?'mb':''}" data-pct="${pct}" style="width:0%"></div></div>
      </div>
      <div class="lb-num ${mine?'hi':''}">${esc(dispV)}</div>
      <div class="lb-num lo">${esc(ch[fld2])}</div>
      <div class="lb-arr">›</div>
    </div>`;
  });
  return `
  <div class="sl d1">Competitor Leaderboard <em>Click any row for full details</em></div>
  <div class="lb d2">
    <div class="lb-top">
      <span class="lb-top-t">Ranked by ${lbl}</span>
      <div class="lb-sorts">
        <button class="lsb ${sort==='subscribers_raw'?'on':''}" onclick="setSort('subscribers_raw')">Subscribers</button>
        <button class="lsb ${sort==='avg_views_raw'?'on':''}" onclick="setSort('avg_views_raw')">Avg Views</button>
        <button class="lsb ${sort==='total_views_raw'?'on':''}" onclick="setSort('total_views_raw')">Total Views</button>
      </div>
    </div>
    <div class="lb-head">
      <span class="lh">#</span><span class="lh" style="text-align:left">Channel</span>
      <span class="lh">Bar</span><span class="lh">${lbl}</span>
      <span class="lh">${lbl2}</span><span class="lh"></span>
    </div>
    ${rows}
  </div>`;
}

function setSort(f){sort=f;renderDash();}
function animateBars(){document.querySelectorAll('.lb-bar').forEach(b=>b.style.width=(b.dataset.pct||0)+'%');}

/* ════════════════════════════════════════════════════════
   DRAWER ANALYTICS HELPERS
════════════════════════════════════════════════════════ */

function buildViewsTrend(vids){
  if(!vids||vids.length<3)return '';
  const sorted=[...vids].sort((a,b)=>new Date(a.published_at||a.date)-new Date(b.published_at||b.date));
  const views=sorted.map(v=>v.view_count??v.views_raw??0);
  const maxV=Math.max(...views,1);
  const half=Math.floor(sorted.length/2);
  const recentAvg=views.slice(half).reduce((a,b)=>a+b,0)/Math.max(views.length-half,1);
  const olderAvg=views.slice(0,half).reduce((a,b)=>a+b,0)/Math.max(half,1);
  const trendPct=olderAvg>0?Math.round(((recentAvg-olderAvg)/olderAvg)*100):0;
  const tc=trendPct>10?'var(--gr)':trendPct<-10?'var(--rd)':'var(--t3)';
  const tl=trendPct>10?`↑ ${trendPct}% trending up`:trendPct<-10?`↓ ${Math.abs(trendPct)}% declining`:'→ stable';
  const bars=sorted.map(v=>{
    const vc=v.view_count??v.views_raw??0;
    const pct=Math.max(4,Math.round((vc/maxV)*100));
    const c=vc>=recentAvg?'var(--pr)':'var(--t3)';
    return `<div style="flex:1;display:flex;align-items:flex-end" title="${esc(v.title||'')}\n${v.views||''} views"><div style="width:100%;background:${c};border-radius:2px 2px 0 0;height:${pct}%;min-height:3px;opacity:.85;transition:height .6s var(--e)"></div></div>`;
  }).join('');
  return `<div class="drw-sect">
    <div class="drw-sh">Views Trend <span style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:none;letter-spacing:0;color:${tc};font-weight:700">${tl}</span></div>
    <div style="height:60px;display:flex;align-items:flex-end;gap:3px;background:var(--sf-lowest);border-radius:8px;padding:8px 10px 0;border:1px solid rgba(255,255,255,.04)">${bars}</div>
    <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--t3)"><span>${sorted[0]?.date||''}</span><span>${sorted[sorted.length-1]?.date||''}</span></div>
  </div>`;
}

function buildCalendar(vids){
  if(!vids||!vids.length)return '';
  const cells=[];
  for(let w=11;w>=0;w--){
    const ws=Date.now()-(w+1)*7*864e5,we=Date.now()-w*7*864e5;
    const wv=vids.filter(v=>{const t=new Date(v.published_at||v.date).getTime();return !isNaN(t)&&t>=ws&&t<we;});
    const lbl=w===0?'This week':w===1?'Last week':`${w}w ago`;
    cells.push(`<div title="${lbl}: ${wv.length?wv.length+' video(s)':'No upload'}" style="width:20px;height:20px;border-radius:4px;background:${wv.length?'var(--gr)':'var(--sf-highest)'};border:1px solid rgba(255,255,255,.05);opacity:${wv.length?1:.45};cursor:default"></div>`);
  }
  const sorted=[...vids].sort((a,b)=>new Date(b.published_at||b.date)-new Date(a.published_at||a.date));
  let streak=0,lastW=-1;
  for(const v of sorted){
    const wa=Math.floor((Date.now()-new Date(v.published_at||v.date).getTime())/(7*864e5));
    if(streak===0&&wa<=1){streak=1;lastW=wa;}
    else if(streak>0&&wa===lastW+1){streak++;lastW=wa;}
    else if(streak>0)break;
  }
  const sc=streak>=4?'var(--gr)':streak>=2?'var(--pr)':'var(--t3)';
  const sl=streak>=4?`🔥 ${streak}-week streak!`:streak>=2?`✓ ${streak} weeks in a row`:streak===1?'Posted this week':'Irregular posting';
  return `<div class="drw-sect">
    <div class="drw-sh">Upload Calendar <span style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:none;letter-spacing:0;color:${sc};font-weight:700">${sl}</span></div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;background:var(--sf-lowest);border-radius:8px;padding:10px 12px;border:1px solid rgba(255,255,255,.04)">${cells.join('')}</div>
    <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--t3)"><span>12 weeks ago</span><span>This week</span></div>
  </div>`;
}

function buildEngTrend(vids){
  if(!vids||vids.length<4)return '';
  const rates=vids.slice(0,10).map(v=>calcEngagementRate(v.like_count??0,v.comment_count??0,v.view_count??v.views_raw??0)??0).filter(r=>r>0);
  if(rates.length<4)return '';
  const sorted_for_eng=[...vids].sort((a,b)=>new Date(a.published_at||a.date)-new Date(b.published_at||b.date));
  const engBars=sorted_for_eng.slice(-10).map(v=>{
    const r=calcEngagementRate(v.like_count??0,v.comment_count??0,v.view_count??v.views_raw??0)??0;
    const maxR=Math.max(...rates,0.1);
    const h=Math.max(4,Math.round((r/maxR)*100));
    const c=r>=4?'var(--gr)':r>=2?'var(--gold)':'var(--rd)';
    return `<div style="flex:1;display:flex;align-items:flex-end" title="${r.toFixed(1)}% eng"><div style="width:100%;background:${c};border-radius:2px 2px 0 0;height:${h}%;min-height:3px;opacity:.8"></div></div>`;
  }).join('');
  const half=Math.floor(rates.length/2);
  const recentEng=rates.slice(0,Math.ceil(rates.length/2)).reduce((a,b)=>a+b,0)/Math.ceil(rates.length/2);
  const olderEng=rates.slice(half).reduce((a,b)=>a+b,0)/Math.max(rates.length-half,1);
  const chg=olderEng>0?((recentEng-olderEng)/olderEng)*100:0;
  const tc=chg>5?'var(--gr)':chg<-5?'var(--rd)':'var(--t3)';
  const tl=chg>5?`↑ Growing`:chg<-5?`↓ Declining`:'→ Stable';
  const avg=(rates.reduce((a,b)=>a+b,0)/rates.length).toFixed(1);
  return `<div class="drw-sect">
    <div class="drw-sh">Engagement Trend <span style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:none;letter-spacing:0;color:${tc};font-weight:700">${tl} · avg ${avg}%</span></div>
    <div style="height:44px;display:flex;align-items:flex-end;gap:3px;background:var(--sf-lowest);border-radius:8px;padding:8px 10px 0;border:1px solid rgba(255,255,255,.04)">${engBars}</div>
    <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:var(--t3)">
      <span>Older <span style="font-family:'JetBrains Mono',monospace;color:var(--t2)">${olderEng.toFixed(1)}%</span></span>
      <span>Recent <span style="font-family:'JetBrains Mono',monospace;color:${tc}">${recentEng.toFixed(1)}%</span></span>
    </div>
  </div>`;
}

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
    const fs=11+Math.round((c/maxC)*3);
    return `<span style="background:rgba(0,229,255,${(op*0.13).toFixed(2)});color:rgba(0,229,255,${op.toFixed(2)});border:1px solid rgba(0,229,255,${(op*0.25).toFixed(2)});padding:3px 9px;border-radius:20px;font-size:${fs}px;font-weight:600;white-space:nowrap;cursor:default" title="${c} occurrences">${esc(w)} <span style="font-family:'JetBrains Mono',monospace;font-size:9px;opacity:.65">×${c}</span></span>`;
  }).join('');
  return `<div class="drw-sect">
    <div class="drw-sh">Topic Patterns <span style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:none;letter-spacing:0;color:var(--t3);font-weight:400">last ${vids.length} videos</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;background:var(--sf-lowest);border-radius:8px;padding:10px 12px;border:1px solid rgba(255,255,255,.04)">${tags}</div>
  </div>`;
}

function buildDuration(vids){
  const wd=vids.filter(v=>v.duration_secs>0);
  if(!wd.length)return '';
  const fmtS=s=>{const m=Math.floor(s/60),sec=s%60;return `${m}:${String(sec).padStart(2,'0')}`;};
  const avg=Math.round(wd.reduce((s,v)=>s+v.duration_secs,0)/wd.length);
  const mn=Math.min(...wd.map(v=>v.duration_secs));
  const mx=Math.max(...wd.map(v=>v.duration_secs));
  const cat=avg<300?'Short-form':avg<900?'Mid-length':avg<1800?'Long-form':'Deep Dive';
  const cc=avg<300?'var(--rd)':avg<900?'var(--pr)':avg<1800?'var(--gr)':'var(--gold)';
  return `<div class="drw-sect">
    <div class="drw-sh">Video Length <span style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:none;letter-spacing:0;color:${cc};font-weight:700">${cat}</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div style="background:var(--sf-lowest);border-radius:8px;padding:10px;border:1px solid rgba(255,255,255,.04);text-align:center"><div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700">${fmtS(avg)}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:3px">Avg</div></div>
      <div style="background:var(--sf-lowest);border-radius:8px;padding:10px;border:1px solid rgba(255,255,255,.04);text-align:center"><div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700">${fmtS(mn)}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:3px">Shortest</div></div>
      <div style="background:var(--sf-lowest);border-radius:8px;padding:10px;border:1px solid rgba(255,255,255,.04);text-align:center"><div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700">${fmtS(mx)}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-top:3px">Longest</div></div>
    </div>
  </div>`;
}

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
        if(streak>=4){streakEl.textContent=`🔥 ${streak}wk streak`;streakEl.className='badge bdg-gr';streakEl.style.display='';}
        else if(streak>=2){streakEl.textContent=`✓ ${streak}wks`;streakEl.className='badge bdg-pr';streakEl.style.display='';}
        else if(daysSince>28){streakEl.textContent=`⚠ ${daysSince}d gap`;streakEl.className='badge bdg-rd';streakEl.style.display='';}
      }

      const mVids=vids.filter(v=>{const t=new Date(v.published_at||v.date).getTime();return !isNaN(t)&&(now-t)<30*864e5;});
      if(mVids.length>1){
        const best=mVids.reduce((a,b)=>(b.view_count??b.views_raw??0)>(a.view_count??a.views_raw??0)?b:a);
        const bestEl=document.getElementById('cc-best-'+ch.id);
        if(bestEl&&best.title){
          bestEl.innerHTML=`<div style="background:rgba(86,255,167,.05);border-radius:7px;padding:7px 9px;margin-top:7px;border:1px solid rgba(86,255,167,.12)">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gr);margin-bottom:2px">🏆 Best this month</div>
            <div style="font-size:11.5px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden">${esc(best.title)}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--gr);margin-top:2px">${best.views||''} views</div>
          </div>`;
        }
      }
    }catch{}
  });
  await Promise.all(promises);
}

/* ════════════════════════════════════════════════════════
   OPEN DRAWER (competitor channels)
════════════════════════════════════════════════════════ */
function openDrawer(id){
  // Close analytics modal first if it's showing — avoids z-index conflicts
  const modal=document.getElementById('analyticsModal');
  if(modal&&modal.classList.contains('open')){
    modal.classList.remove('open');
    document.getElementById('amOvrl').classList.remove('open');
  }
  const ch=all.find(c=>c.id===id);
  if(!ch)return;
  const v=ch.video||{};

  document.getElementById('drwBody').innerHTML=`
    ${ch.banner_url
      ?`<img class="drw-banner" src="${esc(ch.banner_url)}" onerror="this.outerHTML='<div class=drw-banner-ph></div>'" alt="">`
      :'<div class="drw-banner-ph"></div>'}
    <div class="drw-head">
      ${ch.logo_url
        ?`<img class="drw-logo" src="${esc(ch.logo_url)}" onerror="this.style.background='var(--sf-highest)'" alt="">`
        :`<div class="drw-logo-fb">${(ch.name||'?')[0].toUpperCase()}</div>`}
      <div class="drw-info">
        <div class="drw-name">${esc(ch.name)}</div>
        <div class="drw-hdl">${esc(ch.handle||'')}</div>
        <div class="drw-tags">
          ${ch.is_primary?'<span class="badge bdg-gd">⭐ My Channel</span>':'<span class="badge bdg-dim">Competitor</span>'}
          ${ch.country?`<span class="badge bdg-dim">${esc(ch.country)}</span>`:''}
          ${ch.created?`<span class="badge bdg-dim">Since ${ch.created}</span>`:''}
        </div>
      </div>
    </div>
    <div class="drw-sg">
      <div class="drw-st"><div class="drw-stv" style="color:var(--gold)">${esc(ch.subscribers)}</div><div class="drw-stl">Subscribers</div></div>
      <div class="drw-st"><div class="drw-stv">${esc(ch.total_views)}</div><div class="drw-stl">Views</div></div>
      <div class="drw-st"><div class="drw-stv" style="color:var(--pr)">${esc(ch.total_videos)}</div><div class="drw-stl">Videos</div></div>
      <div class="drw-st"><div class="drw-stv" style="color:var(--gr)">${esc(ch.avg_views)}</div><div class="drw-stl">Avg Views</div></div>
      <div class="drw-st"><div class="drw-stv" id="drwSubRatio" style="color:var(--t3)">—</div><div class="drw-stl">Audience</div></div>
      <div class="drw-st"><div class="drw-stv" id="drwRecentVsAvg" style="color:var(--t3)">—</div><div class="drw-stl">vs ch avg</div></div>
    </div>
    ${ch.description?`
    <div class="drw-sect">
      <div class="drw-sh">About</div>
      <div class="drw-desc">${esc(ch.description)}${ch.description.length>=300?'…':''}</div>
    </div>`:''}
    ${v.title?`
    <div class="drw-sect">
      <div class="drw-sh">Latest Upload</div>
      <a class="drw-lv" href="${esc(v.url)}" target="_blank" rel="noopener">
        <img class="drw-lv-img" src="${esc(v.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
        <div class="drw-lv-body">
          <div class="drw-lv-title">${esc(v.title)}</div>
          <div class="drw-lv-date">📅 ${v.date}</div>
          <div class="drw-lv-stats"><span>👁 ${esc(v.views)}</span><span>👍 ${esc(v.likes)}</span><span>💬 ${esc(v.comments||'—')}</span></div>
        </div>
      </a>
    </div>`:''}
    <div class="drw-sect" id="drwRecent">
      <div class="drw-sh">Recent Uploads</div>
      <div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:12.5px"><div class="spin"></div>Loading…</div>
    </div>
    <a class="drw-yt" href="https://www.youtube.com/${esc(ch.handle||'channel/'+ch.id)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
      Open on YouTube
    </a>`;

  document.getElementById('drw').classList.add('open');
  document.getElementById('ovrl').classList.add('open');
  document.body.style.overflow='hidden';

  fetch(`/api/channels/${id}/videos?max=20`)
    .then(r=>r.json())
    .then(vids=>{
      const s=document.getElementById('drwRecent');
      const ch2=all.find(c=>c.id===id);
      if(!s)return;
      if(!vids.length){s.innerHTML='<div class="drw-sh">Recent Uploads</div><p style="color:var(--t3);font-size:12.5px">No uploads found.</p>';return;}
      const chSub=ch2?(ch2.subscriber_count??ch2.subscribers_raw??0):0;
      const chViews=ch2?(ch2.total_views_raw??0):0;
      const chVids=ch2?(ch2.video_count??ch2.total_videos_raw??0):0;
      const drwRva=calcRecentVsAvg(vids,chViews,chVids);
      const drwSub=calcSubViewRatio(chSub,chViews);
      const rvaEl=document.getElementById('drwRecentVsAvg');
      if(rvaEl){rvaEl.textContent=formatRecentVsAvg(drwRva);rvaEl.style.cssText=rvaEl.style.cssText.replace(/color:[^;]+/,recentVsAvgColor(drwRva));}
      const subEl=document.getElementById('drwSubRatio');
      if(subEl){subEl.textContent=drwSub!==null?drwSub+'%':'—';subEl.style.cssText=subEl.style.cssText.replace(/color:[^;]+/,subViewRatioColor(drwSub));}

      const tbl10=vids.slice(0,10);
      const vcs=tbl10.map(v=>v.view_count??v.views_raw??0);
      const maxVc=Math.max(...vcs),minVc=Math.min(...vcs);
      const hasDiff=maxVc!==minVc;
      const bestIdx=hasDiff?vcs.indexOf(maxVc):-1;
      const worstIdx=hasDiff?vcs.lastIndexOf(minVc):-1;

      const vidCards=tbl10.map((v,ri)=>{
        const vVc=v.view_count??v.views_raw??0;
        const vLc=v.like_count??0;
        const vCc=v.comment_count??0;
        const eng=calcEngagementRate(vLc,vCc,vVc);
        const isBest=ri===bestIdx,isWorst=ri===worstIdx&&worstIdx!==bestIdx;
        const engC=eng===null?'var(--t3)':eng>=4?'var(--gr)':eng>=2?'var(--gold)':'var(--rd)';
        return `<a href="${esc(v.url)}" target="_blank" rel="noopener"
          style="display:block;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);text-decoration:none;color:inherit">
          ${isBest?'<div style="font-size:9px;font-weight:800;color:var(--gr);letter-spacing:.5px;text-transform:uppercase;margin-bottom:3px">🏆 BEST</div>':''}
          ${isWorst?'<div style="font-size:9px;font-weight:800;color:var(--rd);letter-spacing:.5px;text-transform:uppercase;margin-bottom:3px">📉 LOWEST</div>':''}
          <div style="font-size:13px;font-weight:600;line-height:1.42;color:var(--t1);margin-bottom:7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(v.title)}</div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:800;color:var(--pr)">👁 ${esc(v.views)}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--t2)">👍 ${esc(v.likes)}</span>
            ${eng!==null?`<span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:${engC};background:rgba(255,255,255,.05);padding:2px 7px;border-radius:5px">${eng}%</span>`:''}
            <span style="font-size:11px;color:var(--t3);margin-left:auto">${v.date}</span>
          </div>
        </a>`;
      }).join('');

      s.innerHTML=`<div class="drw-sh">Recent Uploads</div>
        <div style="padding:0 2px">${vidCards}</div>
        ${buildViewsTrend(vids)}
        ${buildCalendar(vids)}
        ${buildEngTrend(vids)}
        ${buildWordCloud(vids)}
        ${buildDuration(vids)}`;
    })
    .catch(()=>{
      const s=document.getElementById('drwRecent');
      if(s)s.innerHTML='<div class="drw-sh">Recent Uploads</div><p style="color:var(--t3);font-size:12.5px">Could not load.</p>';
    });
}

function closeDrawer(){
  document.getElementById('drw').classList.remove('open');
  document.getElementById('ovrl').classList.remove('open');
  document.body.style.overflow='';
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

  // Populate header
  const logoEl=document.getElementById('amLogo');
  logoEl.innerHTML=ch.logo_url
    ?`<img src="${esc(ch.logo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.background='var(--sf-highest)'" alt="">`
    :`<div style="display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--t3)">${(ch.name||'?')[0].toUpperCase()}</div>`;
  document.getElementById('amName').textContent=ch.name||'';
  document.getElementById('amSub').textContent=`${ch.handle||''} · ${ch.subscribers} subscribers · ${ch.total_videos} videos`;

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

function renderAmOverview(ch){
  const v=ch.video||{};
  const subRatio=calcSubViewRatio(ch.subscriber_count??ch.subscribers_raw??0, ch.total_views_raw??0);
  const panel=document.getElementById('amPanel-overview');
  panel.innerHTML=`
    <div class="am-overview-grid">
      <!-- Stats row -->
      <div class="am-stat-row">
        <div class="am-stat am-stat-gold"><div class="am-stat-val">${esc(ch.subscribers)}</div><div class="am-stat-lbl">Subscribers</div></div>
        <div class="am-stat"><div class="am-stat-val">${esc(ch.total_views)}</div><div class="am-stat-lbl">Total Views</div></div>
        <div class="am-stat am-stat-cyan"><div class="am-stat-val">${esc(ch.total_videos)}</div><div class="am-stat-lbl">Videos</div></div>
        <div class="am-stat am-stat-green"><div class="am-stat-val">${esc(ch.avg_views)}</div><div class="am-stat-lbl">Avg Views/Video</div></div>
        <div class="am-stat" style="${subViewRatioColor(subRatio)}"><div class="am-stat-val">${subRatio!==null?subRatio+'%':'—'}</div><div class="am-stat-lbl">Audience %</div></div>
        ${ch.created?`<div class="am-stat"><div class="am-stat-val" style="font-size:14px">${ch.created}</div><div class="am-stat-lbl">Channel Since</div></div>`:''}
      </div>

      ${ch.description?`
      <div class="am-sep-sect">
        <div class="am-sect-lbl">About</div>
        <div style="font-size:13px;color:var(--t2);line-height:1.7">${esc(ch.description)}${ch.description.length>=300?'…':''}</div>
      </div>`:''}

      ${v.title?`
      <div class="am-sep-sect">
        <div class="am-sect-lbl">Latest Upload</div>
        <a class="drw-lv" href="${esc(v.url)}" target="_blank" rel="noopener">
          <img class="drw-lv-img" src="${esc(v.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
          <div class="drw-lv-body">
            <div class="drw-lv-title">${esc(v.title)}</div>
            <div class="drw-lv-date">📅 ${v.date}</div>
            <div class="drw-lv-stats"><span>👁 ${esc(v.views)}</span><span>👍 ${esc(v.likes)}</span><span>💬 ${esc(v.comments||'—')}</span></div>
          </div>
        </a>
      </div>`:''}

      <div class="am-sep-sect" id="amOvRecent">
        <div class="am-sect-lbl">Recent Uploads</div>
        <div style="display:flex;align-items:center;gap:10px;color:var(--t3);font-size:12.5px"><div class="spin"></div>Loading…</div>
      </div>
    </div>`;

  // Load recent videos async
  fetch(`/api/channels/${ch.id}/videos?max=20`)
    .then(r=>r.json())
    .then(vids=>{
      const el=document.getElementById('amOvRecent');
      if(!el)return;
      if(!vids.length){el.innerHTML='<div class="am-sect-lbl">Recent Uploads</div><p style="color:var(--t3)">No uploads found.</p>';return;}
      const tbl10=vids.slice(0,10);
      const vcs=tbl10.map(v=>v.view_count??v.views_raw??0);
      const maxVc=Math.max(...vcs),minVc=Math.min(...vcs);
      const hasDiff=maxVc!==minVc;
      const bestIdx=hasDiff?vcs.indexOf(maxVc):-1;
      const worstIdx=hasDiff?vcs.lastIndexOf(minVc):-1;
      const vidCards=tbl10.map((v,ri)=>{
        const vc=v.view_count??v.views_raw??0;
        const eng=calcEngagementRate(v.like_count??0,v.comment_count??0,vc);
        const isBest=ri===bestIdx,isWorst=ri===worstIdx&&worstIdx!==bestIdx;
        const engC=eng===null?'var(--t3)':eng>=4?'var(--gr)':eng>=2?'var(--gold)':'var(--rd)';
        return `<a href="${esc(v.url)}" target="_blank" rel="noopener"
          style="display:block;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.05);text-decoration:none;color:inherit;transition:background .12s;border-radius:6px">
          ${isBest?'<div style="font-size:9px;font-weight:800;color:var(--gr);letter-spacing:.6px;text-transform:uppercase;margin-bottom:4px">🏆 BEST VIDEO</div>':''}
          ${isWorst?'<div style="font-size:9px;font-weight:800;color:var(--rd);letter-spacing:.6px;text-transform:uppercase;margin-bottom:4px">📉 LOWEST</div>':''}
          <div style="font-size:14px;font-weight:600;line-height:1.45;color:var(--t1);margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(v.title)}</div>
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:800;color:var(--pr)">👁 ${esc(v.views)}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--t2)">👍 ${esc(v.likes)}</span>
            ${eng!==null?`<span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:${engC};background:rgba(255,255,255,.05);padding:2px 8px;border-radius:5px">${eng}% eng</span>`:''}
            <span style="font-size:12px;color:var(--t3);margin-left:auto">${v.date}</span>
          </div>
        </a>`;
      }).join('');
      el.innerHTML=`<div class="am-sect-lbl">Recent Uploads</div>
        <div style="padding:0 2px">${vidCards}</div>
        ${buildViewsTrend(vids)}
        ${buildCalendar(vids)}
        ${buildEngTrend(vids)}
        ${buildWordCloud(vids)}
        ${buildDuration(vids)}`;
    })
    .catch(()=>{
      const el=document.getElementById('amOvRecent');
      if(el)el.innerHTML='<div class="am-sect-lbl">Recent Uploads</div><p style="color:var(--t3)">Could not load.</p>';
    });
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
    const vids=_amFullVideos;
    if(!vids||!vids.length){
      contEl.innerHTML='<p style="color:var(--t3);padding:24px">No video data available.</p>';
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
    const months=Object.values(byMonth).sort((a,b)=>a.month.localeCompare(b.month));
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
        <g class="am-bar-g" data-tip="${tipData}">
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
      </div>`;

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
            <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:var(--t1)">${d.month}</span>
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
    const vids=_amFullVideos;
    if(!vids||!vids.length){
      contEl.innerHTML='<p style="color:var(--t3);padding:24px">No video data available.</p>';
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

  const primary=all.find(c=>c.is_primary)||all[0];
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
        ${ch.logo_url?`<img src="${esc(ch.logo_url)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid ${ch.id===primary.id?'var(--gold)':'var(--bd2)'}" onerror="this.style.background='var(--sf-highest)'" alt="">`
          :`<div style="width:32px;height:32px;border-radius:50%;background:var(--sf-highest);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${(ch.name||'?')[0]}</div>`}
        <div style="font-size:11px;font-weight:600;color:${ch.id===primary.id?'var(--gold)':'var(--t2)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px" title="${esc(ch.name)}">${esc(ch.name.length>12?ch.name.slice(0,12)+'…':ch.name)}</div>
        ${ch.id===primary.id?'<span class="badge bdg-gd" style="font-size:9px">⭐ You</span>':''}
      </div>
    </th>`).join('');

  const metricRows=metrics.map(m=>{
    const vals=sorted.map(ch=>ch[m.raw]||0);
    const best=Math.max(...vals);
    const cells=sorted.map((ch,i)=>{
      const v=ch[m.raw]||0;
      const isBest=v===best&&best>0;
      const isMine=ch.id===primary.id;
      const rank=vals.filter(x=>x>v).length+1;
      return `<td style="padding:10px 12px;text-align:center;background:${isMine?'rgba(255,213,79,.03)':'transparent'}">
        <div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:${isBest?'var(--gr)':isMine?'var(--gold)':'var(--t1)'}">${m.fmt(v)}</div>
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
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;margin-bottom:8px">Building your timeline…</div>
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
async function renderChannels(){
  await fetchAll();
  const el=document.getElementById('chTbl');
  const cnt=document.getElementById('chCntLbl');
  if(cnt)cnt.textContent=all.length?all.length:'';
  if(!all.length){
    el.innerHTML=`<div class="no-pr" style="margin-top:24px">
      <div class="no-pr-ico">📺</div>
      <h3>No channels yet</h3>
      <p>Add channels to start tracking competitor analytics and performance metrics.</p>
      <button class="btn btn-pr" onclick="toggleAdd()">+ Add Your First Channel</button>
    </div>`;
    return;
  }
  const primary=all.find(c=>c.is_primary);
  const competitors=all.filter(c=>!c.is_primary).sort((a,b)=>(b[chSort]||0)-(a[chSort]||0));
  const sortedAll=primary?[primary,...competitors]:competitors;
  el.innerHTML=`<div class="ch-grid">${sortedAll.map((ch,i)=>{
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
    <div class="ch-card ${ch.is_primary?'mine':''}" id="ctr-${esc(ch.id)}"
      onclick="${ch.is_primary?`openAnalyticsModal('${esc(ch.id)}')`:`openDrawer('${esc(ch.id)}')`}"
      style="animation:fadeUp .38s var(--e) ${i*.06}s both">
      <div class="cc-top">
        <div class="cc-av">
          ${ch.logo_url
            ?`<img class="cc-logo" src="${esc(ch.logo_url)}" onerror="this.style.background='var(--sf-highest)'" alt="">`
            :`<div class="cc-logo-fb">${(ch.name||'?')[0].toUpperCase()}</div>`}
          ${ch.is_primary?'<div class="cc-crown">⭐</div>':''}
        </div>
        <div class="cc-ident">
          <div class="cc-name">${esc(ch.name)}</div>
          ${ch.handle?`<div class="cc-handle">${esc(ch.handle)}</div>`:''}
          <div class="cc-tags">
            ${ch.is_primary?'<span class="badge bdg-gd">⭐ My Channel</span>':'<span class="badge bdg-dim">Competitor</span>'}
            ${ch.country?`<span class="badge bdg-dim">${esc(ch.country)}</span>`:''}
            ${cardHot?'<span class="badge bdg-rd">🔥 Hot</span>':''}
            <span class="badge" id="cc-streak-${esc(ch.id)}" style="display:none"></span>
          </div>
        </div>
        <div class="cc-acts" onclick="event.stopPropagation()">
          ${!ch.is_primary?`<button class="cc-act gold" onclick="setPrimary('${esc(ch.id)}')" title="Set as My Channel">star</button>`:''}
          <button class="cc-act" id="ref-${esc(ch.id)}" onclick="ref1('${esc(ch.id)}')" title="Refresh">refresh</button>
          <button class="cc-act danger" onclick="rmCh('${esc(ch.id)}')" title="Remove">delete</button>
        </div>
      </div>
      <div class="cc-stats">
        <div class="cc-sb"><div class="cc-sb-lbl">Subscribers</div><div class="cc-sb-val gold">${esc(ch.subscribers)}</div></div>
        <div class="cc-sb"><div class="cc-sb-lbl">Audience</div><div class="cc-sb-val" style="${subViewRatioColor(cardSubRatio)}">${cardSubRatio!==null?cardSubRatio+'%':'—'}</div></div>
        <div class="cc-sb"><div class="cc-sb-lbl">Videos</div><div class="cc-sb-val cyan">${esc(ch.total_videos)}</div></div>
      </div>
      ${v.title?`
      <div class="cc-vid" onclick="event.stopPropagation();window.open('${esc(v.url)}','_blank')">
        <img class="cc-vthumb" src="${esc(v.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
        <div class="cc-vinfo">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
            <div class="cc-vlbl">Latest Upload</div>
            <div style="font-size:10px;color:var(--t3)">${relDate}</div>
          </div>
          <div class="cc-vtitle">${esc(v.title)}</div>
          <div class="cc-vfoot">
            <div class="cc-vnum"><span class="cc-vnum-v">${esc(v.views)}</span><span class="cc-vnum-l">Views</span></div>
            <div class="cc-vnum"><span class="cc-vnum-v">${esc(v.likes)}</span><span class="cc-vnum-l">Likes</span></div>
            <div class="cc-vnum"><span class="cc-vnum-v">${esc(v.comments||'0')}</span><span class="cc-vnum-l">Cmts</span></div>
            ${cardEngRate!==null?`<div class="cc-eng" style="${engagementColor(cardEngRate)}">${cardEngRate}% eng</div>`:''}
          </div>
          <div id="cc-best-${esc(ch.id)}"></div>
        </div>
      </div>`:''}
      <div class="cc-metrics">
        <div class="cc-met"><div class="cc-met-lbl">Last Upload</div><div class="cc-met-val">${relDate}</div></div>
        <div class="cc-met"><div class="cc-met-lbl">Avg Views</div><div class="cc-met-val">${esc(ch.avg_views)||'—'}</div></div>
        <div class="cc-met"><div class="cc-met-lbl">Views/Day</div><div class="cc-met-val" style="${cardVpd&&cardVpd>1000?'color:var(--pr)':''}">${cardVpd?fmtN(cardVpd):'—'}</div></div>
        <div class="cc-met"><div class="cc-met-lbl">vs Avg</div><div class="cc-met-val" style="${cardVsAvg!==null?(cardVsAvg>10?'color:var(--gr)':cardVsAvg<-10?'color:var(--rd)':'color:var(--t3)'):'color:var(--t3)'}">${cardVsAvg!==null?(cardVsAvg>-10&&cardVsAvg<10?'~avg':cardVsAvg>0?'+'+cardVsAvg+'%':cardVsAvg+'%'):'—'}</div></div>
      </div>
      <div class="cc-foot" style="justify-content:space-between;align-items:center">
        ${ch.last_refreshed?`<span style="font-size:10px;color:var(--t3)" title="Last refreshed">🔄 ${(()=>{const d=Math.floor((Date.now()-new Date(ch.last_refreshed).getTime())/60000);return d<2?'Just now':d<60?d+'m ago':d<1440?Math.floor(d/60)+'h ago':Math.floor(d/1440)+'d ago';})()}</span>`:'<span></span>'}
        <button class="cc-view-link" onclick="${ch.is_primary?`openAnalyticsModal('${esc(ch.id)}')`:`openDrawer('${esc(ch.id)}')`}">
          ${ch.is_primary?'Full Analytics':'View details'} <span style="font-family:'Material Symbols Outlined';font-size:16px;line-height:1;vertical-align:middle">arrow_forward</span>
        </button>
      </div>
    </div>`;
  }).join('')}</div>`;
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

async function refreshAll(){
  if(!all.length)return;
  const btn=document.getElementById('refAllBtn');
  if(btn){btn.style.opacity='.5';btn.disabled=true;}
  for(const ch of all){try{await fetch(`/api/channels/${ch.id}/refresh`,{method:'POST'});}catch{}}
  await renderChannels();
  if(btn){btn.style.opacity='';btn.disabled=false;}
  toast('All channels refreshed!','s');
}

async function refreshAll2(){
  if(!all.length)return;
  const btn=document.querySelector('[onclick="refreshAll2()"]');
  const orig=btn?btn.innerHTML:'';
  if(btn){btn.disabled=true;btn.innerHTML='<div class="spin" style="width:12px;height:12px;border-width:2px"></div><span>Refreshing…</span>';}
  for(const ch of all){try{await fetch(`/api/channels/${ch.id}/refresh`,{method:'POST'});}catch{}}
  await renderChannels();
  if(btn){btn.disabled=false;btn.innerHTML=orig;}
  toast('All channels refreshed!','s');
}

/* ════════════════════════════════════════════════════════
   FEATURE 4 — DASHBOARD ASYNC PANELS
════════════════════════════════════════════════════════ */
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
    let subsDelta=null;
    if(snaps&&snaps.length>=2){
      const ss=[...snaps].sort((a,b)=>a.date.localeCompare(b.date));
      subsDelta=(ss[ss.length-1].subscribers||0)-(ss[0].subscribers||0);
    }
    const momC=mom>=0?'var(--gr)':'var(--rd)';
    el.innerHTML=`
      <div class="sl d-mg">✨ This Month at a Glance</div>
      <div class="mg-grid d-mg2">
        <div class="mg-item">
          <div class="mg-ico">👁</div>
          <div class="mg-val" style="color:var(--gold)">${fmtN(tmViews)}</div>
          <div class="mg-lbl">Views This Month</div>
          ${mom!==null?`<div class="mg-delta" style="color:${momC}">${mom>=0?'↑':'↓'} ${Math.abs(mom)}% vs last mo</div>`:''}
        </div>
        <div class="mg-item">
          <div class="mg-ico">🎬</div>
          <div class="mg-val" style="color:var(--pr)">${tmV.length}</div>
          <div class="mg-lbl">Videos Uploaded</div>
          <div class="mg-delta" style="color:var(--t3)">${lmV.length} last month</div>
        </div>
        <div class="mg-item">
          <div class="mg-ico">💬</div>
          <div class="mg-val" style="color:${eng>=4?'var(--gr)':eng>=2?'var(--gold)':eng?'var(--rd)':'var(--t3)'}">${eng!==null?eng+'%':'—'}</div>
          <div class="mg-lbl">Engagement Rate</div>
        </div>
        ${subsDelta!==null?`
        <div class="mg-item">
          <div class="mg-ico">👥</div>
          <div class="mg-val" style="color:${subsDelta>=0?'var(--gr)':'var(--rd)'}">${subsDelta>=0?'+':''}${fmtN(subsDelta)}</div>
          <div class="mg-lbl">Subscriber Change</div>
        </div>`:''}
      </div>`;
  }catch(e){el.style.display='none';}
}

async function loadFastestGrowing(channels){
  const el=document.getElementById('dashFastGrow');
  if(!el||channels.length<2){if(el)el.style.display='none';return;}
  try{
    const srs=await Promise.all(channels.map(ch=>fetch(`/api/snapshots/${ch.id}`).then(r=>r.json()).catch(()=>[])));
    const withGain=channels.map((ch,i)=>{
      const ss=(srs[i]||[]).sort((a,b)=>a.date.localeCompare(b.date));
      if(ss.length<2)return{...ch,gain:0,pct:0};
      const gain=(ss[ss.length-1].views||0)-(ss[ss.length-2].views||0);
      const pct=ss[ss.length-2].views>0?parseFloat(((gain/ss[ss.length-2].views)*100).toFixed(2)):0;
      return{...ch,gain,pct};
    }).sort((a,b)=>b.pct-a.pct);
    if(withGain.every(c=>c.gain===0)){el.style.display='none';return;}
    const maxPct=Math.max(...withGain.map(c=>c.pct),0.001);
    const primary=channels.find(c=>c.is_primary);
    const rows=withGain.map((ch,i)=>{
      const mine=primary&&ch.id===primary.id;
      const barPct=Math.max(2,Math.round((ch.pct/maxPct)*100));
      const bc=mine?'var(--gold)':i===0?'var(--gr)':'var(--pr)';
      return `<div class="fg-row${mine?' fg-mine':''}" onclick="openDrawer('${esc(ch.id)}')">
        <div class="fg-rk">${['🥇','🥈','🥉'][i]||i+1}</div>
        <div class="fg-ch">
          ${ch.logo_url?`<img class="fg-logo" src="${esc(ch.logo_url)}" onerror="this.style.background='var(--sf-highest)'" alt="">`:``+`<div class="fg-logo" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--t3)">${(ch.name||'?')[0]}</div>`}
          <div style="flex:1;min-width:0">
            <div class="fg-name">${esc(ch.name)}${mine?'<span class="lb-you">⭐ You</span>':''}</div>
            <div class="fg-bar-wrap"><div class="fg-bar" style="width:${barPct}%;background:${bc}"></div></div>
          </div>
        </div>
        <div class="fg-val">
          <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:800;color:${bc}">${ch.pct>=0?'+':''}${ch.pct}%</div>
          <div style="font-size:10px;color:var(--t3)">${ch.gain>=0?'+':''}${fmtN(ch.gain)} views</div>
        </div>
      </div>`;
    }).join('');
    el.innerHTML=`<div class="sl d1">Fastest Growing <em>view gain since last snapshot</em></div><div class="fg-card d2">${rows}</div>`;
  }catch(e){el.style.display='none';}
}

async function loadUploadVelocity(channels){
  const el=document.getElementById('dashVelocity');
  if(!el||channels.length<1){if(el)el.style.display='none';return;}
  try{
    const now=new Date();
    const months=[];
    for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
    const vrs=await Promise.all(channels.map(ch=>fetch(`/api/channels/${ch.id}/videos?max=100`).then(r=>r.json()).catch(()=>[])));
    const data=channels.map((ch,i)=>({ch,color:CH_COLORS[i%CH_COLORS.length],counts:months.map(m=>(vrs[i]||[]).filter(v=>(v.published_at||v.date||'').startsWith(m)).length)}));
    const maxC=Math.max(...data.flatMap(d=>d.counts),1);
    const bW=10,bGap=2,gGap=20;
    const gW=channels.length*(bW+bGap)+gGap;
    const cW=months.length*gW+60,cH=160,pH=cH-40;
    let bars='';
    months.forEach((m,mi)=>{
      const gx=30+mi*gW;
      data.forEach((d,ci)=>{
        const c=d.counts[mi];
        if(c===0)return;
        const h=Math.max(8,Math.round((c/maxC)*pH));
        const x=gx+ci*(bW+bGap),y=cH-30-h;
        bars+=`<rect x="${x}" y="${y}" width="${bW}" height="${h}" rx="3" fill="${d.color}" opacity=".82"><title>${esc(d.ch.name)}: ${c} video${c!==1?'s':''}</title></rect>`;
        bars+=`<text x="${x+bW/2}" y="${y-3}" text-anchor="middle" font-size="8" fill="${d.color}" font-family="DM Sans">${c}</text>`;
      });
      const shortM=m.slice(5)+"\u2019"+m.slice(2,4);
      bars+=`<text x="${gx+data.length*(bW+bGap)/2}" y="${cH-8}" text-anchor="middle" font-size="9.5" fill="rgba(186,201,204,.7)" font-family="DM Sans">${shortM}</text>`;
    });
    const legend=data.map(d=>`<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--t2)"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${d.color};flex-shrink:0"></span>${esc(d.ch.name)}</span>`).join('');
    el.innerHTML=`<div class="sl d1">Monthly Upload Velocity <em>last 6 months</em></div>
      <div class="fg-card d2" style="overflow-x:auto">
        <svg width="${cW}" height="${cH}" style="display:block;min-width:${cW}px">${bars}</svg>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">${legend}</div>
      </div>`;
  }catch(e){el.style.display='none';}
}

/* ════════════════════════════════════════════════════════
   SEARCH — with AUTOCOMPLETE DROPDOWN
════════════════════════════════════════════════════════ */
let _srDebounce=null;
let _srQuotaCount=0;
let _srQuotaReset=Date.now();
const SR_QUOTA_MAX=10;     // max autocomplete calls per minute
const SR_QUOTA_WINDOW=60000; // 60 seconds

// Replace the existing keydown‐only listener with full keyup debounce
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
          ?`<img src="${esc(ch.logo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.background='var(--sf-highest)'" alt="">`
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
          ?`<img src="${esc(ch.logo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.background='var(--sf-highest)'" alt="">`
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
        ?`<img class="sr-banner" src="${esc(d.banner_url)}" onerror="this.outerHTML='<div class=sr-banner-ph></div>'" alt="">`
        :'<div class="sr-banner-ph"></div>'}
      <div class="sr-head">
        <img class="sr-logo" src="${esc(d.logo_url)}" onerror="this.style.background='var(--sf-highest)'" alt="">
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
        <div class="sr-st"><div class="sr-st-ico">👥</div><div class="sr-st-val" style="color:var(--gold)">${esc(d.subscribers)}</div><div class="sr-st-lbl">Subscribers</div></div>
        <div class="sr-st"><div class="sr-st-ico">👁</div><div class="sr-st-val">${esc(d.total_views)}</div><div class="sr-st-lbl">Total Views</div></div>
        <div class="sr-st"><div class="sr-st-ico">🎬</div><div class="sr-st-val" style="color:var(--pr)">${esc(d.total_videos)}</div><div class="sr-st-lbl">Videos</div></div>
        <div class="sr-st"><div class="sr-st-ico">📊</div><div class="sr-st-val" style="color:var(--gr)">${esc(d.avg_views)}</div><div class="sr-st-lbl">Avg Views</div></div>
      </div>
      ${d.description?`<div class="sr-desc"><div class="sr-desc-l">About</div><div class="sr-desc-t">${esc(d.description)}${d.description.length>=300?'…':''}</div></div>`:''}
      ${vid.title?`
      <a class="sr-vid" href="${esc(vid.url)}" target="_blank" rel="noopener">
        <img class="sr-vthumb" src="${esc(vid.thumb)}" onerror="this.style.background='var(--sf-highest)'" alt="">
        <div class="sr-vbody">
          <div class="sr-vbadge">✦ Latest Upload</div>
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