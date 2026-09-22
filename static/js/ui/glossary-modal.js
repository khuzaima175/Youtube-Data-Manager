/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — GLOSSARY MODAL & REFERENCE ENGINE (glossary-modal.js)
   Searchable reference modal for all metrics, formulas, and platform terminology
   ══════════════════════════════════════════════════════════════════════════════ */

const GlossaryModal = (() => {
  let modal = null;
  let backdrop = null;
  let closeBtn = null;
  let searchInput = null;
  let categoryBtns = [];
  let listEl = null;

  let activeCategory = 'all';
  let searchQuery = '';

  const categoryMap = {
    subscribers: 'core',
    views30: 'core',
    views_velocity: 'core',
    velocity: 'core',
    avg_views: 'core',
    cadence: 'core',
    upload_pulse: 'core',
    engagement: 'core',
    engagement_rate: 'core',
    nicheShare: 'core',
    niche_share: 'core',

    cohort: 'competitor',
    cohort_benchmark: 'competitor',
    overlap: 'competitor',
    threat_overlap: 'competitor',
    cohortPulse: 'competitor',
    cohort_pulse: 'competitor',
    competitor_drops: 'competitor',
    compare_set: 'competitor',
    primary_channel: 'competitor',

    blueOcean: 'topic',
    blue_ocean: 'topic',
    emerging: 'topic',
    saturated: 'topic',
    topic_opportunities: 'topic',
    topic_keyword: 'topic',
    topic_avg_views: 'topic',
    niche_frequency: 'topic',
    topic_coverage: 'topic',
    untapped_status: 'topic',
    reindex_topics: 'topic',
    quad_all: 'topic',
    quad_untapped: 'topic',
    quad_high_demand: 'topic',
    quad_emerging: 'topic',

    titleScore: 'packaging',
    title_score: 'packaging',
    titleLength: 'packaging',
    title_length: 'packaging',
    topicMatch: 'packaging',
    topic_match: 'packaging',
    hookFormat: 'packaging',
    hook_format: 'packaging',
    structure: 'packaging',
    structure_score: 'packaging',
    topic_tokens: 'packaging',
    moat_convergence: 'packaging',
    gap_attack: 'packaging',
    franchise_followup: 'packaging',
    contrarian_take: 'packaging',
    mastery_blueprint: 'packaging',
    concept_match: 'packaging',
    ai_synthesizer: 'packaging',

    rpi: 'strategy',
    catalogMix: 'strategy',
    audienceRatio: 'strategy',
    health_score: 'strategy',
    timing: 'strategy',
    pipeline: 'strategy',
    content_pipeline: 'strategy',
    pipeline_stages: 'strategy'
  };

  const createModal = () => {
    if (modal) return;

    modal = document.createElement('div');
    modal.className = 'ui-modal glossary-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'glossaryModalTitle');
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="ui-modal-backdrop"></div>
      <div class="ui-modal-panel">
        <div class="ui-modal-header">
          <div style="display:flex;align-items:center;gap:8px">
            <i data-lucide="book-open" style="width:16px;height:16px;color:var(--accent)"></i>
            <h2 class="ui-modal-title" id="glossaryModalTitle">Metric Glossary & Platform Definitions</h2>
          </div>
          <button class="ui-modal-close icon-btn" aria-label="Close glossary (Esc)">
            <i data-lucide="x" style="width:16px;height:16px"></i>
          </button>
        </div>
        <div class="ui-modal-body">
          <div style="position:relative">
            <i data-lucide="search" style="position:absolute;left:12px;top:11px;width:14px;height:14px;color:var(--text-3)"></i>
            <input type="text" class="glossary-search" placeholder="Search metrics, formulas, or concepts… (Press Esc to exit)" style="padding-left:34px" />
          </div>
          <div class="glossary-categories">
            <button class="category-btn active" data-category="all">All</button>
            <button class="category-btn" data-category="core">Core Metrics</button>
            <button class="category-btn" data-category="competitor">Competitors</button>
            <button class="category-btn" data-category="topic">Topics</button>
            <button class="category-btn" data-category="packaging">Packaging</button>
            <button class="category-btn" data-category="strategy">Strategy</button>
          </div>
          <div class="glossary-list" tabindex="0"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    backdrop = modal.querySelector('.ui-modal-backdrop');
    closeBtn = modal.querySelector('.ui-modal-close');
    searchInput = modal.querySelector('.glossary-search');
    categoryBtns = modal.querySelectorAll('.category-btn');
    listEl = modal.querySelector('.glossary-list');

    // Event listeners
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      render();
    });

    categoryBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category;
        categoryBtns.forEach((b) => b.classList.toggle('active', b === btn));
        render();
      });
    });

    // Delegation for clicking any item
    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.glossary-item');
      if (item && item.dataset.sheet) {
        const key = item.dataset.sheet;
        if (window.Sheet && typeof window.Sheet.open === 'function') {
          window.Sheet.open(key);
        } else if (typeof window.openMetricSheet === 'function') {
          window.openMetricSheet(key);
        }
      }
    });

    if (window.lucide) window.lucide.createIcons();
  };

  const render = () => {
    if (!listEl) return;
    const glossaryObj = window.GLOSSARY || {};
    const entries = Object.entries(glossaryObj);

    // Filter out duplicates by comparing title
    const seenTitles = new Set();
    const uniqueEntries = [];
    for (const [key, data] of entries) {
      if (!data) continue;
      const title = data.title || data.t || key;
      if (seenTitles.has(title)) continue;
      seenTitles.add(title);
      uniqueEntries.push([key, data]);
    }

    const filtered = uniqueEntries.filter(([key, data]) => {
      const category = categoryMap[key] || (data.category ? data.category.toLowerCase() : 'core');
      const matchesCategory =
        activeCategory === 'all' ||
        category === activeCategory ||
        (activeCategory === 'strategy' && category.includes('strategy')) ||
        (activeCategory === 'competitor' && category.includes('competitor')) ||
        (activeCategory === 'topic' && category.includes('topic')) ||
        (activeCategory === 'packaging' && category.includes('packaging')) ||
        (activeCategory === 'core' && category.includes('core'));

      const titleText = (data.title || data.t || '').toLowerCase();
      const bodyText = (data.p || data.desc || '').toLowerCase();
      const calcText = (data.calc || '').toLowerCase();

      const matchesSearch =
        !searchQuery ||
        titleText.includes(searchQuery) ||
        bodyText.includes(searchQuery) ||
        calcText.includes(searchQuery) ||
        key.toLowerCase().includes(searchQuery);

      return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="glossary-empty">
          No glossary terms match "${searchQuery || activeCategory}"
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered
      .map(([key, data]) => {
        const title = data.title || data.t || key;
        const desc = data.p || data.desc || '';
        const formula = data.calc ? `<code>${data.calc}</code>` : '';

        return `
          <div class="glossary-item" data-sheet="${key}" tabindex="0" role="button" aria-label="View ${title} explanation">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div class="glossary-item-title">${title}</div>
              <span class="ui-tip-link" style="font-size:11px">Inspect →</span>
            </div>
            <div class="glossary-item-desc">${desc}</div>
            ${formula ? `<div style="margin-top:6px;font-size:11px;color:var(--accent);font-family:var(--f-mono)">${formula}</div>` : ''}
          </div>
        `;
      })
      .join('');
  };

  const open = () => {
    createModal();
    modal.style.display = 'block';
    setTimeout(() => {
      modal.classList.add('active');
      if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
        searchInput.focus();
      }
    }, 10);
    render();
    if (window.lucide) window.lucide.createIcons();
  };

  const close = () => {
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      activeCategory = 'all';
      if (categoryBtns) {
        categoryBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.category === 'all'));
      }
    }, 150);
  };

  // Keyboard shortcut listener (? opens modal, Esc closes)
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      if (!isInput) {
        e.preventDefault();
        open();
      }
    }
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      close();
    }
  });

  // Wire buttons with data-action="help"
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-action="help"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
    });
  });

  return { open, close };
})();

window.GlossaryModal = GlossaryModal;
