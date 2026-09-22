/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — GLOBAL NUMBER & DELTA FORMATTER (format.js)
   Universal single source of truth for all metric formatting, percentages & deltas
   ══════════════════════════════════════════════════════════════════════════════ */

const Format = (() => {
  // 1200 -> 1.2K, 1400000 -> 1.4M, null/NaN -> —
  const count = (n) => {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    const val = Number(n);
    if (val === 0) return '0';
    if (Math.abs(val) < 1000) return val.toLocaleString();
    if (Math.abs(val) < 1000000) {
      return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  };

  // 0.045 -> 4.5%, 4.5 (if isRaw=false) -> 4.5%
  const percent = (n, decimals = 1, isRatio = true) => {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    const val = Number(n);
    const pct = isRatio && Math.abs(val) <= 1 && val !== 0 ? val * 100 : val;
    return pct.toFixed(decimals).replace(/\.0$/, '') + '%';
  };

  // +4% vs previous 30 days / No change / -2%
  const delta = (current, previous) => {
    if (previous === null || previous === undefined || previous === 0 || current === null || current === undefined || isNaN(Number(current)) || isNaN(Number(previous))) {
      return '<span style="color:var(--text-3)">New</span>';
    }
    const c = Number(current);
    const p = Number(previous);
    const pct = ((c - p) / p) * 100;
    if (Math.abs(pct) < 0.5) {
      return '<span style="color:var(--text-3)">No change vs previous 30 days</span>';
    }
    const sign = pct > 0 ? '↑' : '↓';
    const col = pct > 0 ? 'var(--pos)' : 'var(--neg)';
    return `<span style="color:${col};font-weight:500">${sign} ${Math.abs(pct).toFixed(0)}%</span> vs previous 30 days`;
  };

  // Relative timestamp (e.g. "3d ago", "Just now")
  const timeAgo = (dateOrTimestamp) => {
    if (!dateOrTimestamp) return '—';
    const time = typeof dateOrTimestamp === 'number' ? dateOrTimestamp : new Date(dateOrTimestamp).getTime();
    if (isNaN(time)) return '—';
    const diff = Date.now() - time;
    const days = Math.floor(diff / 864e5);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
  };

  return { count, percent, delta, timeAgo };
})();

window.Format = Format;

// Universal alias bindings for backward-compatibility
window.fmtN = (n) => Format.count(n);
window.fmtPct = (n, d) => Format.percent(n, d);
window.fmtDelta = (c, p) => (p !== undefined ? Format.delta(c, p) : (c >= 0 ? `+${c}%` : `${c}%`));
