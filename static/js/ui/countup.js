/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — KPI COUNT-UP ANIMATION UTILITY (countup.js)
   Hardware-accelerated number ticker using easeOutQuart & 60fps rAF loop
   ══════════════════════════════════════════════════════════════════════════════ */

function animateValue(element, start, end, duration = 600, formatter = (v) => Math.round(v).toLocaleString()) {
  if (!element) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || duration <= 0) {
    element.textContent = formatter(end);
    return;
  }

  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);

    // easeOutQuart easing (no overshoot/bounce)
    const ease = 1 - Math.pow(1 - progress, 4);
    const current = start + ease * (end - start);

    element.textContent = formatter(current);

    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      element.textContent = formatter(end); // ensure exact final value
    }
  };
  window.requestAnimationFrame(step);
}

window.animateValue = animateValue;
