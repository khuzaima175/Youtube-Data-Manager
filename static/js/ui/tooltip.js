/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — TOOLTIP ENGINE (static/js/ui/tooltip.js)
   Singleton L1 Hover & Focus Tooltip Engine with Progressive Disclosure
   ══════════════════════════════════════════════════════════════════════════════ */

(function () {
  let tipEl = null;
  let activeTarget = null;
  let showTimeout = null;

  function ensureTooltip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'ui-tooltip';
      tipEl.setAttribute('role', 'tooltip');
      tipEl.style.position = 'fixed';
      tipEl.style.zIndex = '9999';
      tipEl.style.display = 'none';
      tipEl.style.pointerEvents = 'auto'; // allow clicking 'Learn more'

      tipEl.addEventListener('mouseenter', () => clearTimeout(showTimeout));
      tipEl.addEventListener('mouseleave', hide);
      document.body.appendChild(tipEl);
    }
  }

  function show(target, customHtml) {
    ensureTooltip();
    clearTimeout(showTimeout);

    showTimeout = setTimeout(() => {
      activeTarget = target;
      const tipId = target.getAttribute('data-tip');
      const customContent = customHtml || target.getAttribute('data-tip-custom') || target.getAttribute('data-tip-text') || target.getAttribute('data-tip-html');
      const term = window.GLOSSARY && (window.GLOSSARY[tipId] || window.GLOSSARY[tipId?.replace(/-/g, '_')]);

      if (customContent) {
        tipEl.innerHTML = `<div class="ui-tip-body">${customContent}</div>`;
      } else if (term) {
        const titleText = term.title || term.t || 'Metric Detail';
        const bodyText = term.p || term.desc || '';
        tipEl.innerHTML = `
          <div class="ui-tip-header">
            <strong>${titleText}</strong>
          </div>
          <div class="ui-tip-body">${bodyText}</div>
          <div class="ui-tip-footer">
            <button class="ui-tip-link" onclick="if(window.Sheet){window.Sheet.open('${tipId}')}else if(window.openMetricSheet){window.openMetricSheet('${tipId}')}">
              Learn more →
            </button>
          </div>`;
      } else if (tipId && tipId !== 'custom') {
        tipEl.innerHTML = `<div class="ui-tip-body">${tipId}</div>`;
      } else {
        return;
      }

      tipEl.style.display = 'block';
      position(target);
    }, 80);
  }

  function position(target) {
    if (!tipEl || !target) return;
    const rect = target.getBoundingClientRect();
    const tipRect = tipEl.getBoundingClientRect();

    let top = rect.top - tipRect.height - 8;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2);

    // If clipping at top of viewport, flip to bottom
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
    clearTimeout(showTimeout);
    if (tipEl) tipEl.style.display = 'none';
    activeTarget = null;
  }

  // Global event delegation for data-tip: mouse hover + keyboard focus
  document.addEventListener('mouseover', function (e) {
    const el = e.target.closest('[data-tip], [data-tip-custom], [data-tip-text], [data-tip-html]');
    if (el) {
      show(el);
    } else if (activeTarget && !tipEl.contains(e.target)) {
      hide();
    }
  });

  document.addEventListener('mouseout', function (e) {
    const el = e.target.closest('[data-tip], [data-tip-custom], [data-tip-text], [data-tip-html]');
    if (el && (!e.relatedTarget || !el.contains(e.relatedTarget)) && (!tipEl || !tipEl.contains(e.relatedTarget))) {
      hide();
    }
  });

  document.addEventListener('focusin', function (e) {
    const el = e.target.closest('[data-tip], [data-tip-custom], [data-tip-text], [data-tip-html]');
    if (el) {
      show(el);
    }
  });

  document.addEventListener('focusout', function (e) {
    if (activeTarget && (!tipEl || !tipEl.contains(e.relatedTarget))) {
      hide();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeTarget) {
      hide();
    }
  });

  window.showTip = function (html, x, y) {
    ensureTooltip();
    clearTimeout(showTimeout);
    tipEl.innerHTML = `<div class="ui-tip-body">${html}</div>`;
    tipEl.style.display = 'block';
    tipEl.style.top = `${y - 30}px`;
    tipEl.style.left = `${x}px`;
  };

  window.hideTip = hide;
  window.Tooltip = { show, hide };
})();
