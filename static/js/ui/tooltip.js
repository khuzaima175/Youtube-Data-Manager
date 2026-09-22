/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — TOOLTIP ENGINE (static/js/ui/tooltip.js)
   Singleton L1 Hover Tooltip Engine with Progressive Disclosure
   ══════════════════════════════════════════════════════════════════════════════ */

(function () {
  let tipEl = null;
  let activeTarget = null;
  let hideTimeout = null;

  function ensureTooltip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'ui-tooltip';
      tipEl.style.position = 'fixed';
      tipEl.style.zIndex = '9999';
      tipEl.style.display = 'none';
      tipEl.style.pointerEvents = 'auto'; // allow clicking 'Learn more'
      tipEl.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
      tipEl.addEventListener('mouseleave', hide);
      document.body.appendChild(tipEl);
    }
  }

  function show(target, customHtml) {
    ensureTooltip();
    clearTimeout(hideTimeout);
    activeTarget = target;

    const tipId = target.getAttribute('data-tip');
    const term = window.GLOSSARY && window.GLOSSARY[tipId];

    if (customHtml) {
      tipEl.innerHTML = customHtml;
    } else if (term) {
      tipEl.innerHTML = `
        <div class="ui-tip-header">
          <strong>${term.title}</strong>
        </div>
        <div class="ui-tip-body">${term.p}</div>
        <div class="ui-tip-footer">
          <button class="ui-tip-link" onclick="window.openMetricSheet('${tipId}')">
            Learn more →
          </button>
        </div>`;
    } else if (tipId) {
      tipEl.innerHTML = `<div class="ui-tip-body">${tipId}</div>`;
    } else {
      return;
    }

    tipEl.style.display = 'block';
    position(target);
  }

  function position(target) {
    if (!tipEl || !target) return;
    const rect = target.getBoundingClientRect();
    const tipRect = tipEl.getBoundingClientRect();

    let top = rect.top - tipRect.height - 8;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2);

    // If clipping at top, place below target
    if (top < 10) {
      top = rect.bottom + 8;
    }

    // Keep within horizontal screen bounds
    if (left < 10) left = 10;
    if (left + tipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tipRect.width - 10;
    }

    tipEl.style.top = `${top}px`;
    tipEl.style.left = `${left}px`;
  }

  function hide() {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (tipEl) tipEl.style.display = 'none';
      activeTarget = null;
    }, 150);
  }

  // Global event delegation for data-tip
  document.addEventListener('mouseover', function (e) {
    const el = e.target.closest('[data-tip]');
    if (el) {
      show(el);
    }
  });

  document.addEventListener('mouseout', function (e) {
    const el = e.target.closest('[data-tip]');
    if (el) {
      hide();
    }
  });

  window.showTip = function (html, x, y) {
    ensureTooltip();
    clearTimeout(hideTimeout);
    tipEl.innerHTML = `<div class="ui-tip-body">${html}</div>`;
    tipEl.style.display = 'block';
    tipEl.style.top = `${y - 30}px`;
    tipEl.style.left = `${x}px`;
  };

  window.hideTip = hide;
})();
