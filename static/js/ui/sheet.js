/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — DETAIL SHEET ENGINE (static/js/ui/sheet.js)
   Singleton L2 Detail Drawer for Deep Metric Explanations & Forensics
   ══════════════════════════════════════════════════════════════════════════════ */

(function () {
  let sheetEl = null;
  let overlayEl = null;

  function ensureSheet() {
    if (!sheetEl) {
      overlayEl = document.createElement('div');
      overlayEl.className = 'ui-sheet-overlay';
      overlayEl.addEventListener('click', closeSheet);
      document.body.appendChild(overlayEl);

      sheetEl = document.createElement('div');
      sheetEl.className = 'ui-sheet';
      document.body.appendChild(sheetEl);
    }
  }

  function openSheet(termId) {
    ensureSheet();
    const term = window.GLOSSARY && window.GLOSSARY[termId];
    if (!term) return;

    sheetEl.innerHTML = `
      <div class="ui-sheet-header">
        <div>
          <h3 class="ui-sheet-title">${term.title}</h3>
          <span class="ui-sheet-sub">Metric Forensics & Action Guide</span>
        </div>
        <button class="icon-btn" onclick="window.closeMetricSheet()" title="Close Sheet (Esc)">
          <i data-lucide="x" style="width:16px;height:16px"></i>
        </button>
      </div>

      <div class="ui-sheet-body">
        <!-- 1. Plain English Summary -->
        <div class="ui-sheet-section">
          <div class="ui-sheet-label">Summary</div>
          <p class="ui-sheet-text">${term.p}</p>
        </div>

        <!-- 2. Technical Definition -->
        <div class="ui-sheet-section">
          <div class="ui-sheet-label">Technical Definition</div>
          <p class="ui-sheet-text">${term.t}</p>
        </div>

        <!-- 3. Math & Calculation Formula -->
        <div class="ui-sheet-section">
          <div class="ui-sheet-label">Calculation Formula</div>
          <div class="ui-sheet-code">
            <code>${term.calc}</code>
          </div>
        </div>

        <!-- 4. How to Interpret -->
        <div class="ui-sheet-section">
          <div class="ui-sheet-label">How to Interpret</div>
          <p class="ui-sheet-text">${term.read}</p>
        </div>

        <!-- 5. Actionable Next Steps -->
        <div class="ui-sheet-section">
          <div class="ui-sheet-label">Recommended Action</div>
          <div class="ui-sheet-action-card">
            <i data-lucide="lightbulb" style="width:16px;height:16px;color:var(--accent);flex-shrink:0"></i>
            <span>${term.act}</span>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    overlayEl.classList.add('open');
    sheetEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    if (overlayEl) overlayEl.classList.remove('open');
    if (sheetEl) sheetEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheetEl && sheetEl.classList.contains('open')) {
      closeSheet();
    }
  });

  // Global event delegation for data-sheet
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-sheet]');
    if (el) {
      e.preventDefault();
      const sheetId = el.getAttribute('data-sheet');
      openSheet(sheetId);
    }
  });

  window.openMetricSheet = openSheet;
  window.closeMetricSheet = closeSheet;
})();
