/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — REVEAL MOTION ENGINE (static/js/ui/reveal.js)
   Calm, Single-Fire Viewport Reveal with prefers-reduced-motion Guard
   ══════════════════════════════════════════════════════════════════════════════ */

(function () {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function revealElement(el) {
    if (el.classList.contains('in')) return;
    el.classList.add('in');
  }

  function setupScrollReveal() {
    if (prefersReduced) {
      document.querySelectorAll('.rev').forEach(el => el.classList.add('in'));
      return;
    }

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.rev').forEach(el => el.classList.add('in'));
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          revealElement(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.05
    });

    document.querySelectorAll('.rev:not(.in)').forEach(el => {
      observer.observe(el);
    });
  }

  window.setupScrollReveal = setupScrollReveal;

  document.addEventListener('DOMContentLoaded', () => {
    setupScrollReveal();
  });
})();
