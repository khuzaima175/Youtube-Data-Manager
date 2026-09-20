/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — CREATOR STUDIO & CONTENT PIPELINE ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

function savePipelineCards() {
  try { localStorage.setItem('yt_pipeline_cards', JSON.stringify(pipelineCards)); } catch { }
}

function renderStudio() {
  const el = document.getElementById('studioMain');
  if (!el) return;

  buildTopicCache();

  el.innerHTML = `
    <div class="rev in" style="max-width:1240px;margin:0 auto">
      <!-- Studio Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
        <div>
          <div class="pg-title" style="display:flex;align-items:center;gap:10px">
            <span>🎬 Creator Studio</span>
            <span class="badge bdg-pr" style="font-size:11px">Intelligence-Driven</span>
          </div>
          <div class="pg-sub">Turn competitive topic intelligence into high-performing video concepts & manage production.</div>
        </div>
        <div class="vid-seg">
          <button class="vid-seg-btn ${studioSubTab === 'lab' ? 'on' : ''}" onclick="setStudioSubTab('lab')">
            🧪 Title Lab & Ideas
          </button>
          <button class="vid-seg-btn ${studioSubTab === 'pipeline' ? 'on' : ''}" onclick="setStudioSubTab('pipeline')">
            📋 Content Pipeline (${pipelineCards.filter(c => c.stage !== 'published').length})
          </button>
        </div>
      </div>

      <!-- Studio Subpanel Content -->
      <div id="studioSubPanel">
        ${studioSubTab === 'lab' ? renderStudioLabHtml() : renderStudioPipelineHtml()}
      </div>
    </div>`;
}

function setStudioSubTab(tab) {
  studioSubTab = tab;
  const p = document.getElementById('studioSubPanel');
  if (p) {
    flip(p, () => {
      p.innerHTML = tab === 'lab' ? renderStudioLabHtml() : renderStudioPipelineHtml();
    });
  }
}

/* ── S1. Title Lab Scorer ─────────────────────────────────────────────────── */
function scoreTitle(title) {
  const t = (title || '').trim();
  const len = t.length;

  // 1. Length (25 pts)
  let lenScore = 0;
  let lenFeedback = '';
  if (len >= 40 && len <= 60) {
    lenScore = 25;
    lenFeedback = 'Optimal character length (40–60 chars for mobile + search)';
  } else if ((len >= 30 && len < 40) || (len > 60 && len <= 70)) {
    lenScore = 18;
    lenFeedback = len < 40 ? 'Slightly short (consider adding power context)' : 'Slightly long (may truncate on mobile)';
  } else if (len > 0 && len < 30) {
    lenScore = 10;
    lenFeedback = 'Too short: missing context or keywords';
  } else if (len > 70) {
    lenScore = 8;
    lenFeedback = 'Too long: title will truncate in YouTube browse feeds';
  } else {
    lenScore = 0;
    lenFeedback = 'Enter a title to score';
  }

  // 2. Topic Match (35 pts)
  const toks = topicTokens(t);
  let matchedTopics = [];
  let topicBonus = 0;
  toks.forEach(tok => {
    const stat = _topicCache.topics.get(tok);
    if (stat) {
      matchedTopics.push({ topic: tok, momentum: stat.momentum || 1, hotScore: stat.hotScore || 0 });
      topicBonus += Math.min(18, 10 * Math.max(1, stat.momentum || 1));
    }
  });
  const topicScore = Math.min(35, Math.round(topicBonus));

  // 3. Hook & Power Words (25 pts)
  let hookScore = 0;
  const hasNum = /\b\d+\b/.test(t);
  const hasBrackets = /(\[|\(|\)|\])/.test(t);
  const hasPowerWord = /\b(how|why|secret|secrets|never|ultimate|masterclass|explained|truth|stop|fast|guide|pro|mistakes|best|worst|vs|real|built|build|break|making|first|full|revolution|future|revealed)\b/i.test(t);

  if (hasNum) hookScore += 8;
  if (hasBrackets) hookScore += 8;
  if (hasPowerWord) hookScore += 9;

  // 4. Structure & Word Count (15 pts)
  const words = t.split(/\s+/).filter(Boolean);
  let structScore = 0;
  if (words.length >= 5 && words.length <= 12) structScore += 10;
  else if (words.length >= 3) structScore += 5;
  if (/^[A-Z0-9]/.test(t)) structScore += 5;

  const totalScore = Math.min(100, lenScore + topicScore + hookScore + structScore);

  // Missing trending tokens
  const titleToks = new Set(toks);
  const missingHotTokens = [..._topicCache.topics.values()]
    .filter(stat => !titleToks.has(stat.topic) && (stat.momentum || 0) >= 1.2)
    .sort((a, b) => (b.momentum || 0) - (a.momentum || 0))
    .slice(0, 6);

  return {
    score: totalScore,
    len,
    lenScore,
    lenFeedback,
    topicScore,
    matchedTopics,
    hookScore,
    hasNum,
    hasBrackets,
    hasPowerWord,
    structScore,
    wordCount: words.length,
    missingHotTokens
  };
}

function onTitleLabInput(val) {
  titleLabDraft = val;
  const res = scoreTitle(val);

  // Update Score Badge & Dial
  const scoreNumEl = document.getElementById('tlScoreNum');
  const scoreBadgeEl = document.getElementById('tlScoreBadge');
  const lenCountEl = document.getElementById('tlLenCount');
  const lenFillEl = document.getElementById('tlLenFill');
  const meterTopicEl = document.getElementById('tlMeterTopic');
  const meterHookEl = document.getElementById('tlMeterHook');
  const meterLenEl = document.getElementById('tlMeterLen');
  const meterStructEl = document.getElementById('tlMeterStruct');
  const feedbackEl = document.getElementById('tlFeedback');

  if (scoreNumEl) scoreNumEl.textContent = res.score;
  if (scoreBadgeEl) {
    scoreBadgeEl.textContent = res.score >= 85 ? '🔥 Elite Concept' : res.score >= 70 ? '🟢 Strong Title' : res.score >= 50 ? '🟡 Moderate' : '🔴 Needs Polish';
    scoreBadgeEl.className = 'badge ' + (res.score >= 85 ? 'bdg-gr' : res.score >= 70 ? 'bdg-pr' : res.score >= 50 ? 'bdg-gd' : 'bdg-rd');
  }
  if (lenCountEl) lenCountEl.textContent = `${res.len} / 60 chars`;
  if (lenFillEl) {
    const pct = Math.min(100, Math.round((res.len / 80) * 100));
    lenFillEl.style.width = pct + '%';
    lenFillEl.style.background = (res.len >= 40 && res.len <= 60) ? 'var(--up)' : (res.len >= 30 && res.len <= 70) ? 'var(--warn)' : 'var(--down)';
  }
  if (meterTopicEl) meterTopicEl.style.width = Math.round((res.topicScore / 35) * 100) + '%';
  if (meterHookEl) meterHookEl.style.width = Math.round((res.hookScore / 25) * 100) + '%';
  if (meterLenEl) meterLenEl.style.width = Math.round((res.lenScore / 25) * 100) + '%';
  if (meterStructEl) meterStructEl.style.width = Math.round((res.structScore / 15) * 100) + '%';
  if (feedbackEl) feedbackEl.textContent = res.lenFeedback;
}

function appendTokenToTitle(token) {
  const input = document.getElementById('titleLabInput');
  if (!input) return;
  const cur = input.value.trim();
  const next = cur ? `${cur} (${token})` : token;
  input.value = next;
  input.focus();
  onTitleLabInput(next);
}

function copyTitleLabText() {
  const input = document.getElementById('titleLabInput');
  if (!input || !input.value.trim()) return;
  navigator.clipboard.writeText(input.value.trim()).then(() => {
    toast('Title copied to clipboard!', 's');
  });
}

function sendTitleLabToPipeline() {
  const input = document.getElementById('titleLabInput');
  const title = input ? input.value.trim() : titleLabDraft.trim();
  if (!title) { toast('Please enter a title first', 'e'); return; }

  const res = scoreTitle(title);
  const matchedTopic = res.matchedTopics[0]?.topic || 'general';

  const newCard = {
    id: 'card-' + Date.now(),
    title,
    topic: matchedTopic,
    stage: 'idea',
    score: res.score,
    notes: 'Generated from Title Lab',
    createdAt: Date.now()
  };

  pipelineCards.unshift(newCard);
  savePipelineCards();
  toast('Added to Content Pipeline (Idea)!', 's');
  setStudioSubTab('pipeline');
}

/* ── S2. Idea Generator ──────────────────────────────────────────────────── */
function generateStudioIdeas() {
  const primary = all.find(c => c.is_primary) || all[0];
  const { moats, gaps } = computeTopicGaps(primary?.id);
  const hotTopics = [..._topicCache.topics.values()].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0)).slice(0, 8);

  const ideas = [];

  // Formula 1: Moat Convergence {moat} x {hot}
  if (moats.length && hotTopics.length) {
    const m = moats[0].topic;
    const h = hotTopics.find(t => t.topic !== m) || hotTopics[0];
    if (h) {
      ideas.push({
        id: 'idea-moat-conv',
        type: 'moat_conv',
        formula: 'Moat Convergence',
        tag: 'Defensive Winner',
        title: `${capWords(m)} vs ${capWords(h.topic)}: The Engineering Battle Nobody Understood`,
        topic: m,
        score: 96,
        reason: `Combines your #1 moat topic '${m}' with surging field topic '${h.topic}' (${(h.momentum || 1).toFixed(1)}× momentum)`
      });
    }
  }

  // Formula 2: Gap Attack {gap}
  if (gaps.length) {
    const g = gaps[0].topic;
    ideas.push({
      id: 'idea-gap-att',
      type: 'gap_attack',
      formula: 'Gap Attack',
      tag: 'Untapped Traffic',
      title: `${capWords(g)} Explained: The Mistakes Every Beginner Makes`,
      topic: g,
      score: 93,
      reason: `You have 0 videos on '${g}' while rivals average high views per video`
    });
    if (gaps.length > 1) {
      const g2 = gaps[1].topic;
      ideas.push({
        id: 'idea-gap-att-2',
        type: 'gap_attack',
        formula: 'Gap Attack',
        tag: 'Untapped Traffic',
        title: `Why ${capWords(g2)} Is About to Change Everything in 2026`,
        topic: g2,
        score: 91,
        reason: `Untapped gap with field momentum surging`
      });
    }
  }

  // Formula 3: Franchise Follow-Up
  const primaryEnrich = _enrichCache[primary?.id] || {};
  const myTop = primaryEnrich.vids ? [...primaryEnrich.vids].sort((a, b) => (parseInt(b.view_count ?? b.views_raw ?? 0)) - (parseInt(a.view_count ?? a.views_raw ?? 0)))[0] : null;
  if (myTop) {
    const myTok = topicTokens(myTop.title)[0] || 'Design';
    ideas.push({
      id: 'idea-franchise',
      type: 'franchise',
      formula: 'Franchise Follow-Up',
      tag: 'Proven Winner',
      title: `Part 2: Why ${capWords(myTok)} Really Matters (1 Year Later)`,
      topic: myTok,
      score: 89,
      reason: `Direct sequel to your best-performing video (${fmtN(parseInt(myTop.view_count ?? myTop.views_raw ?? 0))} views)`
    });
  }

  // Formula 4: Contrarian Angle
  if (hotTopics.length >= 2) {
    const ht = hotTopics[1].topic;
    ideas.push({
      id: 'idea-contrarian',
      type: 'contrarian',
      formula: 'Contrarian Take',
      tag: 'High CTR Hook',
      title: `The Hard Truth About ${capWords(ht)}: Stop Doing This`,
      topic: ht,
      score: 88,
      reason: `Challenges conventional field assumptions on a trending topic`
    });
  }

  // Formula 5: Masterclass
  if (moats.length > 1) {
    const m2 = moats[1].topic;
    ideas.push({
      id: 'idea-mastery',
      type: 'mastery',
      formula: 'Mastery Blueprint',
      tag: 'Evergreen Pillar',
      title: `From Zero to Master: The Complete ${capWords(m2)} Guide`,
      topic: m2,
      score: 87,
      reason: `Deep-dive pillar video anchoring your moat dominance`
    });
  }

  return ideas;
}

function capWords(str) {
  return (str || '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function useIdeaInTitleLab(title) {
  titleLabDraft = title;
  const input = document.getElementById('titleLabInput');
  if (input) {
    input.value = title;
    onTitleLabInput(title);
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus();
  }
}

function sendIdeaToPipeline(title, topic, score) {
  const newCard = {
    id: 'card-' + Date.now(),
    title,
    topic: topic || 'general',
    stage: 'idea',
    score: score || 90,
    notes: 'Generated from Idea Generator',
    createdAt: Date.now()
  };
  pipelineCards.unshift(newCard);
  savePipelineCards();
  toast('Idea sent to Content Pipeline!', 's');
  setStudioSubTab('pipeline');
}

/* ── S3. Unmet Demand Miner (Void Miner P3) ──────────────────────────────── */
async function runVoidMiner(customQuery = null) {
  const input = document.getElementById('voidMinerInput');
  const q = customQuery !== null ? customQuery : (input ? input.value.trim() : _voidMinerQuery);
  if (!q) {
    toast('Please enter a seed query or topic', 'e');
    return;
  }
  _voidMinerQuery = q;
  _voidMinerLoading = true;
  const container = document.getElementById('voidMinerResultsWrap');
  if (container) {
    container.innerHTML = `
      <div style="padding:32px 16px;text-align:center;color:var(--t3);display:flex;flex-direction:column;align-items:center;gap:10px">
        <div class="spin" style="width:24px;height:24px"></div>
        <div style="font-size:12.5px;font-weight:600;color:var(--t1)">Mining YouTube autocomplete search queries for "${esc(q)}"…</div>
        <div style="font-size:11px">Scanning competitor catalogs to calculate Jaccard title coverage gaps</div>
      </div>`;
  }
  const btn = document.getElementById('voidMinerBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" style="width:14px;height:14px"></span> Mining…'; }

  try {
    const res = await fetchAutocompleteVoids(q);
    _voidMinerResults = res.voids || [];
  } catch (err) {
    toast('Void miner failed', 'e');
  } finally {
    _voidMinerLoading = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="msi">search</span> Mine Autocomplete Voids'; }
    const c = document.getElementById('voidMinerResultsWrap');
    if (c) c.innerHTML = renderVoidMinerResultsHtml();
  }
}

function renderVoidMinerResultsHtml() {
  if (_voidMinerLoading) {
    return `
      <div style="padding:32px 16px;text-align:center;color:var(--t3);display:flex;flex-direction:column;align-items:center;gap:10px">
        <div class="spin" style="width:24px;height:24px"></div>
        <div style="font-size:12.5px;font-weight:600;color:var(--t1)">Mining YouTube autocomplete search voids…</div>
      </div>`;
  }

  if (!_voidMinerResults.length) {
    return `
      <div style="padding:28px 16px;text-align:center;color:var(--t3);font-size:12px;border:1.5px dashed var(--line-1);border-radius:var(--r-m)">
        <span class="msi" style="font-size:28px;color:var(--t4);display:block;margin-bottom:6px">radar</span>
        No search voids mined yet. Enter a seed keyword or click a recommended Blue Ocean topic above!
      </div>`;
  }

  const voidsOnly = _voidMinerResults.filter(v => v.is_void);
  const coveredOnly = _voidMinerResults.filter(v => !v.is_void);

  return `
    <div style="display:flex;flex-direction:column;gap:14px">
      <!-- Voids Count Summary Banner -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 14px;background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s)">
        <div style="font-size:12px;color:var(--t1);font-weight:600">
          Discovered <strong style="color:var(--up)">${voidsOnly.length} Unmet Search Voids</strong> and <strong style="color:var(--t3)">${coveredOnly.length} Competitor Covered Queries</strong> for "${esc(_voidMinerQuery)}"
        </div>
        <button class="btn btn-gh btn-sm" onclick="runVoidMiner('${esc(_voidMinerQuery)}')">
          <span class="msi">refresh</span> Refresh Scraping
        </button>
      </div>

      <!-- Results Grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:12px">
        ${_voidMinerResults.map(item => {
          const isVoid = item.is_void;
          const simPct = Math.round((item.overlap || 0) * 100);
          return `
            <div class="card" style="padding:14px;background:var(--bg-3);border:1.5px solid ${isVoid ? 'rgba(0, 229, 255, 0.35)' : 'var(--line-1)'};border-radius:var(--r-m);display:flex;flex-direction:column;justify-content:space-between;box-shadow:${isVoid ? '0 0 16px rgba(0, 229, 255, 0.08)' : 'none'}">
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <span class="badge ${isVoid ? 'bdg-gr' : 'bdg-dim'}" style="font-size:9.5px;padding:2px 8px">
                    ${isVoid ? '💎 Unmet Search Void' : '⚔️ Covered by Rival'}
                  </span>
                  <span class="badge bdg-dim" style="font-size:9px">
                    ${item.level === 0 ? 'Seed' : 'Deep L' + item.level}
                  </span>
                </div>
                <div style="font-size:13.5px;font-weight:700;color:var(--t1);line-height:1.35;margin-bottom:6px">
                  "${esc(item.query)}"
                </div>
                ${!isVoid && item.matched_title ? `
                  <div style="font-size:10px;color:var(--t3);margin-bottom:10px;line-height:1.3">
                    Rival Title: <span style="color:var(--t2)">"${esc(item.matched_title.length > 55 ? item.matched_title.slice(0, 55) + '…' : item.matched_title)}"</span> (${simPct}% overlap)
                  </div>` : `
                  <div style="font-size:10px;color:var(--up);margin-bottom:10px;line-height:1.3">
                    ✨ High search autocomplete demand with &lt;40% competitor catalog coverage!
                  </div>`}
              </div>
              <div style="display:flex;align-items:center;gap:6px;padding-top:10px;border-top:1px solid var(--line-1)">
                <button class="btn btn-acc btn-sm" style="flex:1" onclick="openAiTitleSynthesizer('${esc(item.query)}', '${esc(item.query)}')">
                  <span class="msi" style="font-size:14px">auto_awesome</span> ✨ Synthesize Title
                </button>
                <button class="icon-btn" onclick="sendIdeaToPipeline('${esc(item.query)}', '${esc(_voidMinerQuery || 'search_void')}', 92)" title="Add to Content Pipeline">
                  <span class="msi" style="font-size:14px">playlist_add</span>
                </button>
                <button class="icon-btn" onclick="useIdeaInTitleLab('${esc(item.query)}')" title="Test in Title Lab">
                  <span class="msi" style="font-size:14px">science</span>
                </button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

/* ── S4. AI Title & Packaging Synthesizer Engine (P4) ─────────────────────── */
function renderAiSynthesizerModal() {
  const modal = document.getElementById('aiSynthModal');
  const ovrl = document.getElementById('aiSynthOvrl');
  const content = document.getElementById('aiSynthModalContent');
  if (!modal || !ovrl || !content) return;

  const archetypes = [
    { id: 'all', label: '⚡ All 5 Archetypes' },
    { id: 'impossible_feat', label: '🏆 Impossible Feat' },
    { id: 'hidden_flaw', label: '🚨 Hidden Flaw' },
    { id: 'head_to_head', label: '⚔️ Head-to-Head' },
    { id: 'zero_to_mastery', label: '🎓 Zero-to-Mastery' },
    { id: 'stress_test', label: '💥 Stress Test' }
  ];

  content.innerHTML = `
    <div style="padding:22px">
      <!-- Modal Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;border-bottom:1px solid var(--line-1);padding-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="ic-tile cyan"><span class="msi" style="font-size:18px">auto_awesome</span></span>
          <div>
            <div style="font-family:var(--f-disp);font-size:16px;font-weight:700;color:var(--t1)">AI Title & Packaging Synthesizer</div>
            <div style="font-size:11px;color:var(--t3)">Generates 5 viral packaging archetypes with thumbnail concept blueprints. Zero quota consumption.</div>
          </div>
        </div>
        <button class="icon-btn" onclick="closeAiSynthesizerModal()"><span class="msi">close</span></button>
      </div>

      <!-- Controls Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t3);margin-bottom:4px;display:block">Target Topic or Niche:</label>
          <input type="text" id="aiSynthTopicInput" value="${esc(_aiSynthState.topic)}" placeholder="e.g. Next.js 15, DaVinci Resolve, EUV Lithography…"
            style="width:100%;padding:8px 12px;font-size:13px;background:var(--bg-3);border:1px solid var(--line-2);border-radius:var(--r-s);color:var(--t1);outline:none"
            onchange="_aiSynthState.topic = this.value" />
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--t3);margin-bottom:4px;display:block">Modifier / Angle (Optional):</label>
          <input type="text" id="aiSynthAngleInput" value="${esc(_aiSynthState.angle)}" placeholder="e.g. for beginners, after 100 days, $0 budget…"
            style="width:100%;padding:8px 12px;font-size:13px;background:var(--bg-3);border:1px solid var(--line-2);border-radius:var(--r-s);color:var(--t1);outline:none"
            onchange="_aiSynthState.angle = this.value" />
        </div>
      </div>

      <!-- Archetype Segments & Generate Button -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px">
        <div class="race-seg" style="overflow-x:auto;max-width:100%">
          ${archetypes.map(a => `
            <button class="race-seg-btn ${_aiSynthState.archetype === a.id ? 'on' : ''}" onclick="setAiSynthArchetype('${a.id}')">
              ${a.label}
            </button>`).join('')}
        </div>
        <button class="btn btn-acc" id="aiSynthRunBtn" onclick="executeAiSynthesis()">
          <span class="msi">auto_awesome</span> Synthesize Archetypes
        </button>
      </div>

      <!-- Results Body -->
      <div id="aiSynthResultsWrap" style="max-height:55vh;overflow-y:auto;padding-right:4px">
        ${renderAiSynthResultsBodyHtml()}
      </div>
    </div>`;

  ovrl.classList.add('open');
  modal.classList.add('open');

  if (!_aiSynthState.results.length && !_aiSynthState.loading && _aiSynthState.topic) {
    executeAiSynthesis();
  }
}

function setAiSynthArchetype(arch) {
  _aiSynthState.archetype = arch;
  const topicInp = document.getElementById('aiSynthTopicInput');
  const angleInp = document.getElementById('aiSynthAngleInput');
  if (topicInp) _aiSynthState.topic = topicInp.value;
  if (angleInp) _aiSynthState.angle = angleInp.value;
  renderAiSynthesizerModal();
  executeAiSynthesis();
}

function closeAiSynthesizerModal() {
  _aiSynthState.open = false;
  document.getElementById('aiSynthOvrl')?.classList.remove('open');
  document.getElementById('aiSynthModal')?.classList.remove('open');
}

async function executeAiSynthesis() {
  const topicInp = document.getElementById('aiSynthTopicInput');
  const angleInp = document.getElementById('aiSynthAngleInput');
  if (topicInp) _aiSynthState.topic = topicInp.value.trim();
  if (angleInp) _aiSynthState.angle = angleInp.value.trim();

  const topic = _aiSynthState.topic || 'Video Engineering';
  _aiSynthState.loading = true;

  const resWrap = document.getElementById('aiSynthResultsWrap');
  if (resWrap) {
    resWrap.innerHTML = `
      <div style="padding:48px 16px;text-align:center;color:var(--t3);display:flex;flex-direction:column;align-items:center;gap:12px">
        <div class="spin" style="width:28px;height:28px"></div>
        <div style="font-size:14px;font-weight:700;color:var(--t1)">Synthesizing viral packaging archetypes for "${esc(topic)}"…</div>
        <div style="font-size:11.5px">Assembling curiosity hooks, CTR scoring, and thumbnail blueprints</div>
      </div>`;
  }

  const btn = document.getElementById('aiSynthRunBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" style="width:14px;height:14px"></span> Generating…'; }

  try {
    const res = await generateTitlesAI(topic, _aiSynthState.angle, _aiSynthState.title, _aiSynthState.archetype);
    _aiSynthState.results = res.titles || [];
  } catch (err) {
    toast('Synthesis failed', 'e');
  } finally {
    _aiSynthState.loading = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="msi">auto_awesome</span> Synthesize Archetypes'; }
    const w = document.getElementById('aiSynthResultsWrap');
    if (w) w.innerHTML = renderAiSynthResultsBodyHtml();
  }
}

function renderAiSynthResultsBodyHtml() {
  if (_aiSynthState.loading) {
    return `
      <div style="padding:48px 16px;text-align:center;color:var(--t3);display:flex;flex-direction:column;align-items:center;gap:12px">
        <div class="spin" style="width:28px;height:28px"></div>
        <div style="font-size:14px;font-weight:700;color:var(--t1)">Synthesizing viral packaging archetypes…</div>
      </div>`;
  }

  if (!_aiSynthState.results.length) {
    return `
      <div style="padding:36px 16px;text-align:center;color:var(--t3);font-size:12px;border:1.5px dashed var(--line-1);border-radius:var(--r-m)">
        <span class="msi" style="font-size:32px;color:var(--t4);display:block;margin-bottom:8px">auto_awesome</span>
        Enter a topic or niche above and click "Synthesize Archetypes" to generate packaging concepts!
      </div>`;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:16px">
      ${_aiSynthState.results.map((item, idx) => {
        const sc = scoreTitle(item.title);
        const score = Math.max(item.estimated_score || 85, sc.score);
        const st = scoreTone(score);
        const thumb = item.thumbnail_concept || {};
        return `
          <div class="card" style="padding:16px;background:var(--bg-3);border:1px solid var(--line-2);border-radius:var(--r-m);display:flex;flex-direction:column;gap:12px;box-shadow:var(--sh-1)">
            <!-- Top Bar: Archetype and Score -->
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <span class="badge bdg-pr" style="font-size:10.5px;font-weight:700;display:flex;align-items:center;gap:4px">
                <span class="msi" style="font-size:14px">verified</span> ${esc(item.archetype_label || item.archetype)}
              </span>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="badge ${st.badge}" style="font-size:10px;font-weight:700">🔥 ${score}/100 Title Lab Score</span>
                <span style="font-size:11px;color:var(--t3)">(${item.title.length} chars)</span>
              </div>
            </div>

            <!-- Title Header -->
            <div style="font-size:15px;font-weight:700;color:var(--t1);line-height:1.4">
              "${esc(item.title)}"
            </div>

            <!-- Thumbnail Blueprint Concept Card -->
            <div style="background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-s);padding:12px;display:grid;grid-template-columns:140px 1fr;gap:14px;align-items:center">
              <!-- Visual Mockup Box -->
              <div style="height:80px;background:linear-gradient(135deg, rgba(0,229,255,0.12), rgba(245,197,66,0.12));border:1.5px dashed var(--line-2);border-radius:var(--r-s);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px;text-align:center">
                <span class="msi" style="font-size:22px;color:var(--acc)">image</span>
                <span style="font-size:9.5px;font-weight:800;color:var(--me);text-transform:uppercase;margin-top:2px;letter-spacing:0.04em">
                  "${esc(thumb.text_overlay || 'REVEALED')}"
                </span>
                <span style="font-size:8px;color:var(--t3);margin-top:2px">16:9 Concept</span>
              </div>

              <!-- Blueprint Instructions -->
              <div style="font-size:11px;line-height:1.45;color:var(--t2)">
                <div><strong>🎨 Layout:</strong> ${esc(thumb.layout || 'Split-screen contrast')}</div>
                <div><strong>🎯 Focal Subject:</strong> ${esc(thumb.focal_element || 'Extreme close-up with emotional expression')}</div>
                <div><strong>🌈 Contrast:</strong> ${esc(thumb.contrast_colors || 'Deep dark slate background with neon cyan accents')}</div>
              </div>
            </div>

            <!-- Card Action Buttons -->
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding-top:8px;border-top:1px solid var(--line-1)">
              <div style="font-size:11px;color:var(--t3)">${esc(item.explanation || '')}</div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-gh btn-sm" onclick="navigator.clipboard.writeText('${esc(item.title)}');toast('Title copied!', 's')">
                  <span class="msi" style="font-size:14px">content_copy</span> Copy
                </button>
                <button class="btn btn-gh btn-sm" onclick="closeAiSynthesizerModal();useIdeaInTitleLab('${esc(item.title)}')">
                  <span class="msi" style="font-size:14px">science</span> Test in Lab
                </button>
                <button class="btn btn-acc btn-sm" onclick="closeAiSynthesizerModal();sendIdeaToPipeline('${esc(item.title)}', '${esc(_aiSynthState.topic || 'ai_synthesized')}', ${score})">
                  <span class="msi" style="font-size:14px">add</span> + Pipeline
                </button>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

/* ── Render Studio Lab HTML ───────────────────────────────────────────────── */
function renderStudioLabHtml() {
  const res = scoreTitle(titleLabDraft);
  const ideas = generateStudioIdeas();
  const filteredIdeas = pipelineIdeaFilter === 'all' ? ideas : ideas.filter(i => i.type === pipelineIdeaFilter);

  // Pre-fill seed topic from top blue ocean topic if available
  const topTopics = [..._topicCache.topics.values()].sort((a, b) => (b.blueOceanScore || 0) - (a.blueOceanScore || 0));
  const suggestedSeed = topTopics[0]?.topic || 'video editing';

  return `
    <div style="display:grid;grid-template-columns:1fr;gap:22px">
      <!-- Title Lab Card -->
      <div class="card" style="padding:22px;background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-l)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="ic-tile cyan"><span class="msi" style="font-size:16px">science</span></span>
            <div>
              <div style="font-family:var(--f-disp);font-size:15px;font-weight:700;color:var(--t1)">Title Lab Real-Time Scorer</div>
              <div style="font-size:11px;color:var(--t3)">Live algorithmic scoring based on your topic engine, CTR formulas, and length bounds.</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-acc btn-sm" onclick="openAiTitleSynthesizer('', titleLabDraft)">
              <span class="msi">auto_awesome</span> ✨ AI Synthesize
            </button>
            <span id="tlScoreBadge" class="badge ${res.score >= 85 ? 'bdg-gr' : res.score >= 70 ? 'bdg-pr' : res.score >= 50 ? 'bdg-gd' : 'bdg-rd'}">
              ${res.score >= 85 ? '🔥 Elite Concept' : res.score >= 70 ? '🟢 Strong Title' : res.score >= 50 ? '🟡 Moderate' : '🔴 Needs Polish'}
            </span>
            <div style="font-family:var(--f-mono);font-size:24px;font-weight:800;color:var(--acc)" id="tlScoreNum">${res.score}</div>
            <span style="font-size:12px;color:var(--t3)">/100</span>
          </div>
        </div>

        <!-- Input Box -->
        <div style="position:relative;margin-bottom:12px">
          <input type="text" id="titleLabInput" value="${esc(titleLabDraft)}"
            style="width:100%;padding:12px 14px;font-size:14px;font-weight:600;background:var(--bg-3);border:1.5px solid var(--line-2);border-radius:var(--r-m);color:var(--t1);outline:none;transition:border-color var(--d-1)"
            placeholder="Type your draft video title here…"
            oninput="onTitleLabInput(this.value)" />
        </div>

        <!-- Character Meter & Feedback -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-size:11px;color:var(--t3)">
          <span id="tlFeedback">${res.lenFeedback}</span>
          <span id="tlLenCount" class="mono">${res.len} / 60 chars</span>
        </div>
        <div style="width:100%;height:4px;background:var(--bg-3);border-radius:2px;overflow:hidden;margin-bottom:16px">
          <div id="tlLenFill" style="height:100%;width:${Math.min(100, Math.round((res.len / 80) * 100))}%;background:${res.len >= 40 && res.len <= 60 ? 'var(--up)' : res.len >= 30 && res.len <= 70 ? 'var(--warn)' : 'var(--down)'};transition:width .2s, background .2s"></div>
        </div>

        <!-- 4 Factor Grid -->
        <div class="tl-factors-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
          <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);padding:10px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--t3);margin-bottom:4px">📏 Length (25 max)</div>
            <div style="width:100%;height:4px;background:var(--bg-1);border-radius:2px;overflow:hidden;margin-top:6px">
              <div id="tlMeterLen" style="height:100%;width:${Math.round((res.lenScore / 25) * 100)}%;background:var(--acc);transition:width .2s"></div>
            </div>
          </div>
          <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);padding:10px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--t3);margin-bottom:4px">🎯 Topic Match (35 max)</div>
            <div style="width:100%;height:4px;background:var(--bg-1);border-radius:2px;overflow:hidden;margin-top:6px">
              <div id="tlMeterTopic" style="height:100%;width:${Math.round((res.topicScore / 35) * 100)}%;background:var(--up);transition:width .2s"></div>
            </div>
          </div>
          <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);padding:10px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--t3);margin-bottom:4px">⚡ Hook & Format (25 max)</div>
            <div style="width:100%;height:4px;background:var(--bg-1);border-radius:2px;overflow:hidden;margin-top:6px">
              <div id="tlMeterHook" style="height:100%;width:${Math.round((res.hookScore / 25) * 100)}%;background:var(--warn);transition:width .2s"></div>
            </div>
          </div>
          <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);padding:10px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--t3);margin-bottom:4px">📝 Structure (15 max)</div>
            <div style="width:100%;height:4px;background:var(--bg-1);border-radius:2px;overflow:hidden;margin-top:6px">
              <div id="tlMeterStruct" style="height:100%;width:${Math.round((res.structScore / 15) * 100)}%;background:var(--me);transition:width .2s"></div>
            </div>
          </div>
        </div>

        <!-- Missing High-Momentum Tokens -->
        <div style="margin-bottom:16px">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);margin-bottom:8px">
            💡 Trending Tokens to Inject (Click to Append):
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${res.missingHotTokens.length ? res.missingHotTokens.map(tok => `
              <button class="chip chip-btn" onclick="appendTokenToTitle('${esc(tok.topic)}')">
                + ${esc(tok.topic)} <span style="color:var(--up);margin-left:4px">▲${(tok.momentum || 1).toFixed(1)}×</span>
              </button>`).join('') : '<span style="font-size:11px;color:var(--t3)">All key trending niche topics covered!</span>'}
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:10px;padding-top:14px;border-top:1px solid var(--line-1);flex-wrap:wrap">
          <button class="btn btn-acc" onclick="openAiTitleSynthesizer('', titleLabDraft)">
            <span class="msi">auto_awesome</span> ✨ Synthesize with AI
          </button>
          <button class="btn btn-gh" onclick="sendTitleLabToPipeline()">
            <span class="msi">playlist_add</span> Send to Content Pipeline
          </button>
          <button class="btn btn-gh" onclick="copyTitleLabText()">
            <span class="msi">content_copy</span> Copy Title
          </button>
        </div>
      </div>

      <!-- Algorithmic Idea Generator Card -->
      <div class="card" style="padding:22px;background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-l)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="ic-tile gold"><span class="msi" style="font-size:16px">lightbulb</span></span>
            <div>
              <div style="font-family:var(--f-disp);font-size:15px;font-weight:700;color:var(--t1)">Algorithmic Idea Generator</div>
              <div style="font-size:11px;color:var(--t3)">Pre-tested formulas synthesizing your moats, untapped field gaps, and trending velocity spikes.</div>
            </div>
          </div>
        </div>

        <!-- Idea Grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:14px">
          ${filteredIdeas.map(idea => {
            const st = scoreTone(idea.score);
            const ringRadius = 11;
            const ringCircum = 2 * Math.PI * ringRadius;
            const ringDash = (idea.score / 100) * ringCircum;
            const formulaIcon = idea.formula.includes('Collision') ? 'bolt' : idea.formula.includes('Moat') ? 'shield' : idea.formula.includes('Gap') ? 'radar' : idea.formula.includes('Breakout') ? 'trending_up' : 'lightbulb';
            return `
            <div style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-m);padding:14px;display:flex;flex-direction:column;justify-content:space-between;transition:border-color var(--d-1)" onmouseenter="this.style.borderColor='var(--line-2)'" onmouseleave="this.style.borderColor='var(--line-1)'">
              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                  <span class="chip chip-acc" style="font-size:10px;padding:2px 8px">
                    <span class="msi" style="font-size:13px">${formulaIcon}</span> ${idea.formula}
                  </span>
                  <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center" title="${idea.score}% Potential Score">
                    <svg viewBox="0 0 28 28" style="width:28px;height:28px;transform:rotate(-90deg)">
                      <circle cx="14" cy="14" r="${ringRadius}" fill="none" stroke="var(--bg-1)" stroke-width="2.5"/>
                      <circle cx="14" cy="14" r="${ringRadius}" fill="none" stroke="${st.col}" stroke-width="2.5"
                        stroke-dasharray="${ringCircum.toFixed(1)}"
                        stroke-dashoffset="${(ringCircum - ringDash).toFixed(1)}"
                        stroke-linecap="round"/>
                    </svg>
                    <span style="position:absolute;font-family:var(--f-mono);font-size:8.5px;font-weight:800;color:${st.col}">${idea.score}</span>
                  </div>
                </div>
                <div style="font-size:13px;font-weight:700;color:var(--t1);line-height:1.4;margin-bottom:6px">${esc(idea.title)}</div>
                <div style="font-size:10.5px;color:var(--t3);line-height:1.4;margin-bottom:12px">${esc(idea.reason)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;padding-top:10px;border-top:1px solid var(--line-1)">
                <button class="btn btn-acc btn-sm" style="flex:1" onclick="openAiTitleSynthesizer('${esc(idea.topic)}', '${esc(idea.title)}')">
                  <span class="msi" style="font-size:14px">auto_awesome</span> ✨ AI Title
                </button>
                <button class="btn btn-gh btn-sm" onclick="sendIdeaToPipeline('${esc(idea.title)}', '${esc(idea.topic)}', ${idea.score})">
                  <span class="msi" style="font-size:14px">add</span> + Pipeline
                </button>
                <button class="icon-btn" onclick="useIdeaInTitleLab('${esc(idea.title)}')" title="Test this idea in Title Lab">
                  <span class="msi" style="font-size:14px">science</span>
                </button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- S3. Unmet Demand Miner Card (Void Miner P3) -->
      <div class="card" style="padding:22px;background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-l)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="ic-tile cyan"><span class="msi" style="font-size:16px">travel_explore</span></span>
            <div>
              <div style="font-family:var(--f-disp);font-size:15px;font-weight:700;color:var(--t1)">🔍 Unmet Demand Miner (Autocomplete Void Miner)</div>
              <div style="font-size:11px;color:var(--t3)">Scrapes live YouTube search queries and filters out covered competitor videos to surface pure unmet viewer demand.</div>
            </div>
          </div>
          <span class="badge bdg-pr" style="font-size:10.5px">Zero Quota · Jaccard Token Filter</span>
        </div>

        <!-- Search Bar and Quick Seeds -->
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
          <div style="position:relative;flex:1;min-width:260px">
            <input type="text" id="voidMinerInput" value="${esc(_voidMinerQuery || suggestedSeed)}" placeholder="Enter a seed keyword or topic to mine…"
              style="width:100%;padding:10px 14px;font-size:13.5px;font-weight:600;background:var(--bg-3);border:1.5px solid var(--line-2);border-radius:var(--r-m);color:var(--t1);outline:none"
              onkeydown="if(event.key==='Enter') runVoidMiner(this.value)" />
          </div>
          <button class="btn btn-acc" id="voidMinerBtn" onclick="runVoidMiner()">
            <span class="msi">search</span> Mine Autocomplete Voids
          </button>
        </div>

        <!-- Quick Recommended Seed Chips from Radar -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:16px">
          <span style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3)">Quick Mine from Radar:</span>
          ${topTopics.slice(0, 5).map(t => `
            <button class="chip chip-btn" onclick="runVoidMiner('${esc(t.topic)}')">
              🌊 ${esc(t.topic)} <span style="color:var(--acc);margin-left:4px">⚡${t.shrunkenRpi}×</span>
            </button>`).join('')}
        </div>

        <!-- Results Container -->
        <div id="voidMinerResultsWrap">
          ${renderVoidMinerResultsHtml()}
        </div>
      </div>
    </div>`;
}

/* ── S3. Content Pipeline Kanban ─────────────────────────────────────────── */
function renderStudioPipelineHtml() {
  const stages = [
    { key: 'idea', label: '💡 Idea', hint: 'Raw concepts & research' },
    { key: 'making', label: '🛠 In Production', hint: 'Scripting, recording & editing' },
    { key: 'scheduled', label: '⏳ Scheduled', hint: 'Rendered & upload queued' },
    { key: 'published', label: '🚀 Published', hint: 'Live & tracking telemetry' }
  ];

  return `
    <div>
      <!-- Kanban Header Bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div style="font-size:12px;color:var(--t3)">
          Drag & drop cards between stages, or use stage shift arrows. Published videos auto-sync upon refresh.
        </div>
        <button class="btn btn-acc btn-sm" onclick="openAddPipelineCardModal()">
          <span class="msi">add</span> + Add New Card
        </button>
      </div>

      <!-- 4-Column Board -->
      <div class="studio-kanban-board">
        ${stages.map(st => {
    const cardsInStage = pipelineCards.filter(c => c.stage === st.key);
    return `
            <div class="studio-kanban-col" style="background:var(--bg-2);border:1px solid var(--line-1);border-radius:var(--r-m);display:flex;flex-direction:column;max-height:75vh;overflow:hidden"
                 ondragover="event.preventDefault()"
                 ondrop="pipelineDrop(event, '${st.key}')">
              <!-- Column Header -->
              <div style="padding:12px 14px;background:var(--bg-3);border-bottom:1px solid var(--line-1);display:flex;align-items:center;justify-content:space-between">
                <div>
                  <div style="font-size:12px;font-weight:700;color:var(--t1)">${st.label}</div>
                  <div style="font-size:9.5px;color:var(--t3)">${st.hint}</div>
                </div>
                <span class="badge bdg-dim" style="font-family:var(--f-mono);font-size:10px;font-weight:700">${cardsInStage.length}</span>
              </div>

              <!-- Column Body (Scrollable) -->
              <div style="padding:10px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;min-height:120px">
                ${cardsInStage.length ? cardsInStage.map(card => renderPipelineCardHtml(card)).join('') : `
                  <div style="padding:24px 10px;text-align:center;color:var(--t4);font-size:11px;border:1.5px dashed var(--line-1);border-radius:var(--r-s)">
                    Drop cards here
                  </div>`}
              </div>
            </div>`;
  }).join('')}
      </div>
    </div>`;
}

function renderPipelineCardHtml(card) {
  const isPublished = card.stage === 'published';
  let slotChip = '';
  if (card.stage === 'scheduled') {
    const suggestedSlot = suggestSlotForCard(card);
    if (suggestedSlot) {
      slotChip = `<div class="chip chip-acc" style="font-size:10px;margin-bottom:6px;display:inline-flex;align-items:center;gap:4px">⏰ Suggested: ${esc(suggestedSlot)} (your best slot)</div>`;
    }
  }

  return `
    <div class="pipeline-card" draggable="true"
         ondragstart="pipelineDragStart(event, '${card.id}')"
         style="background:var(--bg-3);border:1px solid var(--line-1);border-radius:var(--r-s);padding:10px;cursor:grab;transition:transform var(--d-1), border-color var(--d-1)"
         onmouseenter="this.style.borderColor='var(--line-2)'" onmouseleave="this.style.borderColor='var(--line-1)'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span class="badge bdg-pr" style="font-size:9px">${esc(card.topic || 'General')}</span>
        <span class="badge ${card.score >= 90 ? 'bdg-gr' : 'bdg-gd'}" style="font-size:9px;font-weight:700">🔥 ${card.score || 85}</span>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--t1);line-height:1.35;margin-bottom:6px">${esc(card.title)}</div>
      ${card.notes ? `<div style="font-size:10px;color:var(--t3);margin-bottom:6px;line-height:1.3">${esc(card.notes)}</div>` : ''}
      ${card.targetDate ? `<div style="font-size:9.5px;color:var(--acc);margin-bottom:6px">📅 Target: ${card.targetDate}</div>` : ''}
      ${slotChip}
      ${isPublished && card.actualViews ? `<div style="font-size:10px;color:var(--up);font-weight:700;margin-bottom:6px">👁 ${fmtN(card.actualViews)} views logged</div>` : ''}

      <!-- Shift and Delete Bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--line-1);margin-top:4px">
        <div style="display:flex;gap:4px">
          <button class="icon-btn" style="width:22px;height:22px" onclick="shiftPipelineCard('${card.id}', -1)" title="Move Left">
            <span class="msi" style="font-size:12px">chevron_left</span>
          </button>
          <button class="icon-btn" style="width:22px;height:22px" onclick="shiftPipelineCard('${card.id}', 1)" title="Move Right">
            <span class="msi" style="font-size:12px">chevron_right</span>
          </button>
        </div>
        <button class="icon-btn" style="width:22px;height:22px;color:var(--down)" onclick="deletePipelineCard('${card.id}')" title="Delete Card">
          <span class="msi" style="font-size:12px">delete</span>
        </button>
      </div>
    </div>`;
}

let draggedCardId = null;

function pipelineDragStart(e, id) {
  draggedCardId = id;
  e.dataTransfer.setData('text/plain', id);
}

function pipelineDrop(e, targetStage) {
  e.preventDefault();
  const cardId = draggedCardId || e.dataTransfer.getData('text/plain');
  if (!cardId) return;

  const card = pipelineCards.find(c => c.id === cardId);
  if (card && card.stage !== targetStage) {
    card.stage = targetStage;
    savePipelineCards();
    const p = document.getElementById('studioSubPanel');
    if (p) p.innerHTML = renderStudioPipelineHtml();
    toast(`Moved to ${targetStage.toUpperCase()}`, 's');
  }
  draggedCardId = null;
}

function shiftPipelineCard(id, delta) {
  const order = ['idea', 'making', 'scheduled', 'published'];
  const card = pipelineCards.find(c => c.id === id);
  if (!card) return;
  const curIdx = order.indexOf(card.stage);
  const nextIdx = Math.max(0, Math.min(order.length - 1, curIdx + delta));
  if (curIdx !== nextIdx) {
    card.stage = order[nextIdx];
    savePipelineCards();
    const p = document.getElementById('studioSubPanel');
    if (p) p.innerHTML = renderStudioPipelineHtml();
  }
}

function deletePipelineCard(id) {
  pipelineCards = pipelineCards.filter(c => c.id !== id);
  savePipelineCards();
  const p = document.getElementById('studioSubPanel');
  if (p) p.innerHTML = renderStudioPipelineHtml();
  toast('Card deleted', 'e');
}

function openAddPipelineCardModal() {
  const title = prompt('Enter Video Title:');
  if (!title || !title.trim()) return;
  const topic = prompt('Enter Topic Tag (e.g. EUV, Shaders):', 'general') || 'general';
  const newCard = {
    id: 'card-' + Date.now(),
    title: title.trim(),
    topic: topic.trim(),
    stage: 'idea',
    score: 85,
    createdAt: Date.now()
  };
  pipelineCards.unshift(newCard);
  savePipelineCards();
  const p = document.getElementById('studioSubPanel');
  if (p) p.innerHTML = renderStudioPipelineHtml();
  toast('New card created!', 's');
}

/* ── Auto-Publish Synchronizer ────────────────────────────────────────────── */
function syncPipelineWithPublishedVideos() {
  const primary = all.find(c => c.is_primary) || all[0];
  if (!primary) return;
  const en = _enrichCache[primary.id];
  if (!en || !en.vids || !en.vids.length) return;

  const now = Date.now();
  let updated = false;

  pipelineCards.forEach(card => {
    if (card.stage === 'published') return;
    const cardToks = new Set(topicTokens(card.title || ''));
    if (!cardToks.size) return;

    for (const v of en.vids) {
      const vToks = new Set(topicTokens(v.title || ''));
      let matches = 0;
      cardToks.forEach(t => { if (vToks.has(t)) matches++; });
      const ratio = matches / cardToks.size;

      // Overlap >= 50%
      if (ratio >= 0.5) {
        card.stage = 'published';
        card.actualViews = parseInt(v.view_count ?? v.views_raw ?? 0);
        card.publishedUrl = v.url;
        updated = true;
        toast(`🚀 Pipeline Auto-Updated: '${esc(card.title)}' detected as published!`, 's');
        break;
      }
    }
  });

  if (updated) {
    savePipelineCards();
    if (studioSubTab === 'pipeline') {
      const p = document.getElementById('studioSubPanel');
      if (p) p.innerHTML = renderStudioPipelineHtml();
    }
  }
}


/* ══════════════════════════════════════════════════════════════════════════════
   PHASE 10: WAYFINDING, INBOX & ALWAYS-ON INTELLIGENCE (W1 + W2)
   ══════════════════════════════════════════════════════════════════════════════ */
