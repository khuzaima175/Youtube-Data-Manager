/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — VIEWPORT REVEAL ENGINE (reveal.js)
   Calm, Once-Only Viewport Reveal & CSS Stagger with prefers-reduced-motion Guard
   ══════════════════════════════════════════════════════════════════════════════ */

const Reveal = (() => {
  let observer = null;

  const init = () => {
    // Disconnect previous observer to prevent memory leaks on view switch
    if (observer) observer.disconnect();

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      document.querySelectorAll('.reveal, .rev').forEach((el) => {
        el.classList.add('is-visible', 'in');
      });
      return;
    }

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal, .rev').forEach((el) => {
        el.classList.add('is-visible', 'in');
      });
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible', 'in');
            observer.unobserve(entry.target); // Once-only! Never replay or jump
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -30px 0px' }
    );

    document.querySelectorAll('.reveal:not(.is-visible), .rev:not(.in)').forEach((el) => {
      observer.observe(el);
    });
  };

  // Re-initialize when views change or content is rendered
  window.addEventListener('hashchange', () => setTimeout(init, 50));
  document.addEventListener('DOMContentLoaded', init);

  return { init };
})();

window.Reveal = Reveal;
window.setupScrollReveal = Reveal.init;
