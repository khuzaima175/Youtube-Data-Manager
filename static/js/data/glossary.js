/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — GLOSSARY DATA DICTIONARY (static/js/data/glossary.js)
   Single source of truth for metric explanations (L1 tooltips & L2 sheets)
   ══════════════════════════════════════════════════════════════════════════════ */

window.GLOSSARY = {
  subscribers: {
    title: 'Subscribers',
    p: 'The total number of users who have subscribed to receive your channel updates.',
    t: 'Cumulative audience reach calculated directly from YouTube Data API v3 channel metadata.',
    calc: 'channel.statistics.subscriberCount',
    read: 'Higher counts increase baseline browse traffic; however, view-to-subscriber ratio is a better indicator of catalog health.',
    act: 'Focus on consistent weekly packaging to convert casual search/suggested viewers into long-term subscribers.'
  },
  avg_views: {
    title: 'Average Views per Video',
    p: 'The typical view count generated across your recent long-form video releases.',
    t: 'Median baseline views across recent long-form uploads, minimizing distortion from extreme viral outliers.',
    calc: 'Median(view_count of last 30 long-form uploads)',
    read: 'High avg views relative to total subscriber count indicates high audience loyalty and strong algorithmic distribution.',
    act: 'Compare your avg views against cohort rivals to identify format strengths.'
  },
  views_velocity: {
    title: '30-Day Views Velocity',
    p: 'The rate at which your channel accumulated views over the past 30 days compared to the previous period.',
    t: 'Month-over-month view growth rate computed from active channel telemetry snapshots.',
    calc: '((Views_last_30d - Views_prev_30d) / Views_prev_30d) * 100%',
    read: 'Positive velocity (+10% or higher) indicates growing algorithmic recommendation momentum.',
    act: 'When velocity dips, review competitor activity feed to identify emerging topic trends.'
  },
  threat_overlap: {
    title: 'Topic Overlap',
    p: 'The percentage of semantic keywords and topics your channel shares with a competitor.',
    t: 'Jaccard similarity index across extracted title tokens, bi-grams, and NLP topics.',
    calc: '|Topics(A) ∩ Topics(B)| / |Topics(A) ∪ Topics(B)| * 100%',
    read: 'Overlap >= 50% indicates direct head-to-head audience competition for the same viewer recommendations.',
    act: 'Find untouched "Blue Ocean" topic angles to differentiate your packaging from high-overlap competitors.'
  },
  cadence: {
    title: 'Upload Cadence',
    p: 'How frequently your channel publishes new long-form video uploads.',
    t: 'Average release rhythm measured in uploads per month and days since last upload.',
    calc: 'Total_uploads / active_catalog_months',
    read: 'A predictable cadence (e.g. 1-2 videos/week) establishes strong subscriber habits and recommendation frequency.',
    act: 'Maintain a steady release rhythm; long gaps (>14 days) often cause algorithmic impression cooldowns.'
  },
  niche_share: {
    title: 'Niche Share',
    p: 'Your channel\'s proportion of total audience reach within your tracked competitor cohort.',
    t: 'Your subscribers divided by the combined subscriber count across all channels in your benchmark group.',
    calc: 'Primary_Subs / Sum(All_Cohort_Subs) * 100%',
    read: 'Growing niche share indicates your channel is expanding faster than your immediate peer group.',
    act: 'Benchmark against cohort leaders to identify untapped content categories.'
  },
  blue_ocean: {
    title: 'Blue Ocean Topic',
    p: 'A high-demand content topic with minimal competitor video saturation.',
    t: 'High Relative Performance Index (RPI >= 1.25) combined with low 14-day competitor supply (< 2 drops).',
    calc: 'RPI / (1 + Supply_14d)',
    read: 'High blue ocean scores represent the highest ROI video ideas for your next release.',
    act: 'Test a title concept in Creator Studio and queue it in your production pipeline.'
  },
  rpi: {
    title: 'Relative Performance Index (RPI)',
    p: 'How well a topic performs compared to the publishing channel\'s typical baseline views.',
    t: 'Empirical Bayes Shrunken ratio of topic video views against channel median baseline.',
    calc: 'Weight * (Views / Median_Base) + (1 - Weight) * 1.0',
    read: 'RPI > 1.3 means videos on this topic typically outperform standard channel averages by 30%+.',
    act: 'Prioritize high-RPI keywords in your video titles and thumbnail packaging.'
  },
  engagement_rate: {
    title: 'Engagement Rate',
    p: 'The proportion of viewers who actively liked or commented on your recent videos.',
    t: 'Combined likes and comments divided by total views across recent long-form uploads.',
    calc: '((Likes + Comments) / Views) * 100%',
    read: 'Engagement >= 4% is high; 2-4% is healthy; <2% suggests packaging may over-promise relative to content delivery.',
    act: 'Include explicit discussion prompts and pinned questions in early video segments.'
  },
  title_score: {
    title: 'Title Lab Score',
    p: 'A predictive 0–100 score rating the search appeal, character length, and hook strength of your video title.',
    t: 'Composite algorithmic formula evaluating length (25pts), topic keyword demand (35pts), power words (25pts), and syntax structure (15pts).',
    calc: 'Length_Score + Topic_Score + Hook_Score + Structure_Score',
    read: 'Score >= 70 represents a strong, competitive title ready for production.',
    act: 'Use the suggested trending topic tokens to boost your concept score before publishing.'
  }
};
