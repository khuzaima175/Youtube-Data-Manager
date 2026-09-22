/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — COMPREHENSIVE GLOSSARY DATA DICTIONARY (glossary.js)
   Single source of truth for all metric definitions, formulas & action guides
   ══════════════════════════════════════════════════════════════════════════════ */

window.GLOSSARY = {
  /* ── 01. Workspace & Cohort ──────────────────────────────────────────────── */
  subscribers: {
    title: 'Subscribers',
    category: 'Workspace & Cohort',
    p: 'The total number of users who have subscribed to receive your channel updates.',
    t: 'Cumulative audience reach calculated directly from YouTube Data API v3 channel metadata.',
    calc: 'channel.statistics.subscriberCount',
    read: 'Higher counts increase baseline browse traffic; however, view-to-subscriber ratio is a better indicator of active catalog health.',
    act: 'Focus on consistent weekly packaging to convert casual search and suggested viewers into permanent subscribers.'
  },
  niche_share: {
    title: 'Niche Share',
    category: 'Workspace & Cohort',
    p: 'Your channel\'s proportion of total audience reach within your tracked competitor cohort.',
    t: 'Your subscriber count divided by the combined subscriber count across all channels in your benchmark group.',
    calc: 'Primary_Subs / Sum(All_Cohort_Subs) * 100%',
    read: 'Growing niche share indicates your channel is expanding faster than your immediate peer group.',
    act: 'Benchmark against cohort leaders to identify untouched packaging and topic categories.'
  },
  primary_channel: {
    title: 'Primary Channel',
    category: 'Workspace & Cohort',
    p: 'Your own channel against which all competitor benchmarks, gaps, and recommendations are computed.',
    t: 'Anchor channel record in the local database used as the reference baseline for cohort comparisons.',
    calc: 'all.find(c => c.is_primary === true)',
    read: 'All gap analysis, moat calculations, and recommendations are anchored relative to this channel.',
    act: 'Ensure your primary channel is synced regularly to maintain up-to-date competitive gap analysis.'
  },
  cohort_benchmark: {
    title: 'Cohort Benchmark',
    category: 'Workspace & Cohort',
    p: 'The curated group of competitor channels operating in your direct YouTube content niche.',
    t: 'Aggregated statistical cohort providing contextual baseline metrics for views, subscribers, and cadence.',
    calc: 'Sum(Cohort_Metrics) / Count(Cohort_Channels)',
    read: 'Provides real-world context for whether your performance numbers are outperforming or lagging peer channels.',
    act: 'Maintain 5 to 15 active competitors in your cohort to ensure accurate and statistically meaningful insights.'
  },
  compare_set: {
    title: 'Compare Set',
    category: 'Workspace & Cohort',
    p: 'A temporary multi-channel comparison set for evaluating head-to-head performance curves.',
    t: 'Active subset of up to 5 channels overlaying velocity trajectories and historical upload frequencies.',
    calc: 'Overlay(Channel_A, Channel_B, ..., Channel_E)',
    read: 'Allows direct multi-line inspection of growth patterns and breakout release windows.',
    act: 'Use the compare set when analyzing direct rivals who publish similar formats or topics.'
  },

  /* ── 02. Video Metrics & Performance Telemetry ────────────────────────────── */
  avg_views: {
    title: 'Average Views per Video',
    category: 'Performance Telemetry',
    p: 'The typical view count generated across your recent long-form video releases.',
    t: 'Median baseline views across recent long-form uploads, minimizing distortion from extreme viral outliers.',
    calc: 'Median(view_count of last 30 long-form uploads)',
    read: 'High average views relative to total subscriber count indicates high audience loyalty and strong recommendation reach.',
    act: 'Compare your average views against cohort rivals to identify format strengths and packaging opportunities.'
  },
  views_velocity: {
    title: '30-Day Views Velocity',
    category: 'Performance Telemetry',
    p: 'The rate at which your channel accumulated views over the past 30 days compared to the previous period.',
    t: 'Month-over-month view growth rate computed from active channel telemetry snapshots.',
    calc: '((Views_last_30d - Views_prev_30d) / Views_prev_30d) * 100%',
    read: 'Positive velocity (+10% or higher) indicates growing algorithmic recommendation momentum.',
    act: 'When velocity dips, review the competitor activity feed to identify emerging topic trends and format shifts.'
  },
  cadence: {
    title: 'Upload Cadence',
    category: 'Performance Telemetry',
    p: 'How frequently your channel publishes new long-form video uploads.',
    t: 'Average release rhythm measured in uploads per month and days elapsed since the latest release.',
    calc: 'Total_uploads / active_catalog_months',
    read: 'A predictable cadence (e.g., 1-2 videos/week) establishes strong subscriber viewing habits and algorithmic frequency.',
    act: 'Maintain a steady release rhythm; long gaps (>14 days) often cause algorithmic impression cooldowns.'
  },
  upload_pulse: {
    title: 'Upload Pulse & Cadence Chart',
    category: 'Performance Telemetry',
    p: 'A week-bucketed histogram illustrating catalog publishing consistency and release clustering over time.',
    t: 'Weekly upload distribution matrix highlighting bursts, gaps, and steady-state cadences.',
    calc: 'Bucket_by_Week(uploads, last_12_months)',
    read: 'Evenly distributed bars reflect disciplined production; sparse clusters reflect irregular release cycles.',
    act: 'Use the Content Pipeline in Creator Studio to buffer drafts and smooth out production gaps.'
  },
  engagement_rate: {
    title: 'Engagement Rate',
    category: 'Performance Telemetry',
    p: 'The proportion of viewers who actively liked or commented on your recent videos.',
    t: 'Combined likes and comments divided by total views across recent long-form uploads.',
    calc: '((Likes + Comments) / Views) * 100%',
    read: 'Engagement >= 4% is elite; 2-4% is healthy; <2% suggests packaging may over-promise relative to delivery.',
    act: 'Include explicit discussion prompts, chapter polls, and pinned questions in the first 2 minutes of every upload.'
  },
  rpi: {
    title: 'Relative Performance Index (RPI)',
    category: 'Performance Telemetry',
    p: 'How well a video or topic performs compared to the publishing channel\'s typical baseline views.',
    t: 'Empirical Bayes Shrunken ratio of topic video views against channel median baseline.',
    calc: 'Weight * (Views / Median_Base) + (1 - Weight) * 1.0',
    read: 'RPI > 1.3 means videos on this topic typically outperform standard channel averages by 30%+.',
    act: 'Prioritize high-RPI keywords and format structures in your upcoming video packaging.'
  },
  health_score: {
    title: 'Channel Health Diagnostics',
    category: 'Performance Telemetry',
    p: 'A comprehensive multi-factor diagnostic evaluating cadence, engagement, velocity, and topic diversity.',
    t: 'Composite weighted score across 4 key vectors: Cadence Stability, View Velocity, Engagement Ratio, and Niche Share.',
    calc: '0.3*Cadence + 0.3*Velocity + 0.2*Engagement + 0.2*Share',
    read: 'Scores above 75 indicate healthy, scalable channel momentum with resilient distribution.',
    act: 'Check the Deep Dive health diagnostics rail to identify which specific vector needs optimization.'
  },
  competitor_drops: {
    title: 'Competitor Drops Activity Feed',
    category: 'Performance Telemetry',
    p: 'A chronological feed of fresh video releases published by tracked competitors in your cohort.',
    t: 'Real-time telemetry stream capturing new uploads, view counts, and 24-hour velocity spikes.',
    calc: 'Sort_Descending(Cohort_Uploads, published_at)',
    read: 'Reveals competitor packaging experiments, upload timing choices, and early breakout winners.',
    act: 'Inspect breakout competitor drops to detect emerging topic angles before the niche becomes saturated.'
  },
  cohort_pulse: {
    title: 'Cohort Pulse Summary',
    category: 'Performance Telemetry',
    p: 'A high-level intelligence summary analyzing release volume and topic momentum across your peer group.',
    t: 'Statistical aggregation of 7-day upload counts, average view velocity, and dominant topic clusters in the cohort.',
    calc: 'Aggregate_7d(Cohort_Uploads)',
    read: 'Quickly informs you whether the niche is experiencing a publishing surge or a lull.',
    act: 'Capitalize on competitor publishing lulls by releasing high-demand videos when audience attention is uncontested.'
  },

  /* ── 03. Topic Intelligence & Radar ───────────────────────────────────────── */
  topic_opportunities: {
    title: 'Top High-Leverage Opportunities',
    category: 'Topic Radar',
    p: 'Prioritized content topics with proven viewer demand where your channel has zero or low video coverage.',
    t: 'Ranked list of topic clusters sorted by high view demand and scarce competitor supply.',
    calc: 'Sort_Descending(Blue_Ocean_Score, Avg_Views)',
    read: 'Represents the most immediate, high-probability growth opportunities for your next upload.',
    act: 'Click "Plan in Studio" on any opportunity card to instantly generate and test title concepts.'
  },
  topic_keyword: {
    title: 'Topic Keyword & Cluster',
    category: 'Topic Radar',
    p: 'A clean semantic entity, keyword, or bi-gram extracted from competitor video titles and descriptions.',
    t: 'Normalized NLP token cluster with stopwords filtered and synonym aliases unified.',
    calc: 'NLP_Tokenize(title) -> Filter(Stopwords) -> Resolve(Aliases)',
    read: 'Identifies the core subject matter that audiences are searching for and clicking on.',
    act: 'Integrate the exact keyword into the first 30 characters of your video title for optimal search indexing.'
  },
  topic_avg_views: {
    title: 'Topic Average Views',
    category: 'Topic Radar',
    p: 'The average view count accumulated by competitor videos focused on this specific topic keyword.',
    t: 'Mean view volume calculated across all videos in the cohort tagged with this topic entity.',
    calc: 'Sum(Topic_Video_Views) / Count(Topic_Videos)',
    read: 'Higher average views indicate broad audience demand and strong search/suggested appetite.',
    act: 'Target topics with above-average view volume to ensure your production effort enters a large addressable audience.'
  },
  niche_frequency: {
    title: 'Niche Frequency & Drops',
    category: 'Topic Radar',
    p: 'The total number of videos published on this topic by competitor channels in your cohort.',
    t: 'Total supply count of cohort videos containing this topic token.',
    calc: 'Count(Cohort_Videos_with_Topic)',
    read: 'Indicates competitive supply. Moderate frequency (2-6 drops) proves demand; excessive drops (>20) indicates high competition.',
    act: 'Look for high views combined with low drops (the classic "Blue Ocean" quadrant).'
  },
  topic_coverage: {
    title: 'Channel Coverage (Videos by You)',
    category: 'Topic Radar',
    p: 'The number of videos your channel has published covering this specific topic keyword.',
    t: 'Count of primary channel uploads containing the identified topic cluster.',
    calc: 'Count(Primary_Videos_with_Topic)',
    read: '"0 by you" (Untapped) signifies an open content gap where you haven\'t yet captured existing niche demand.',
    act: 'Prioritize untapped topics to expand your channel\'s keyword surface area across YouTube search.'
  },
  untapped_status: {
    title: 'Topic Quadrant Status',
    category: 'Topic Radar',
    p: 'Classification of a topic based on market demand and competitive saturation.',
    t: 'Categorical quadrant assignment evaluating Relative Performance Index (RPI) against 14-day supply.',
    calc: 'Quadrant(RPI, Supply_14d, Coverage)',
    read: '• Opportunity (Untapped): High demand + 0 channel coverage.<br>• High Demand: High overall view volume across the niche.<br>• Emerging: Surging recent velocity in the last 14 days.',
    act: 'Focus production on "Opportunity" and "Emerging" topics for fastest algorithmic traction.'
  },
  blue_ocean: {
    title: 'Blue Ocean Opportunity',
    category: 'Topic Radar',
    p: 'A high-demand content topic with minimal competitor video saturation.',
    t: 'High Relative Performance Index (RPI >= 1.25) combined with low 14-day competitor supply (< 2 drops).',
    calc: 'RPI / (1 + Supply_14d)',
    read: 'High blue ocean scores represent the highest ROI video ideas for your next release.',
    act: 'Test a title concept in Creator Studio and queue it in your production pipeline.'
  },
  threat_overlap: {
    title: 'Topic Overlap (Similarity Index)',
    category: 'Topic Radar',
    p: 'The percentage of semantic keywords and topics your channel shares with a competitor.',
    t: 'Jaccard similarity index across extracted title tokens, bi-grams, and NLP topics.',
    calc: '|Topics(A) ∩ Topics(B)| / |Topics(A) ∪ Topics(B)| * 100%',
    read: 'Overlap >= 50% indicates direct head-to-head audience competition for the same viewer recommendations.',
    act: 'Find untouched "Blue Ocean" topic angles to differentiate your packaging from high-overlap competitors.'
  },
  reindex_topics: {
    title: 'Re-index Topic Intelligence',
    category: 'Topic Radar',
    p: 'Forces a fresh scan of all competitor video metadata to update keyword clusters and view metrics.',
    t: 'Recomputes global NLP token frequencies, baseline medians, and quadrant assignments from cached channel telemetry.',
    calc: 'buildTopicCache(force = true)',
    read: 'Ensures the Topic Radar reflects the very latest video uploads and view counts.',
    act: 'Click Re-index after syncing competitor channels to capture newly published video trends.'
  },
  quad_all: {
    title: 'All Topics Filter',
    category: 'Topic Radar',
    p: 'Displays the complete catalog of all detected semantic topic entities across the tracked cohort.',
    t: 'Unfiltered topic collection containing every verified keyword with at least 1 competitor drop.',
    calc: 'All_Detected_Topics',
    read: 'Full view of all subject matter discussed in your niche.',
    act: 'Use the search box to find specific keywords and explore historical view averages.'
  },
  quad_untapped: {
    title: 'Untapped Opportunities Filter',
    category: 'Topic Radar',
    p: 'Filters the catalog to topics with proven competitor view demand where your channel has 0 uploads.',
    t: 'Subset where Primary_Coverage === 0 and Avg_Views >= Cohort_Median.',
    calc: 'Filter(Coverage === 0 && High_Demand)',
    read: 'Your highest-leverage content gaps ready for immediate expansion.',
    act: 'Pick 2-3 untapped topics each month to diversify your catalog and attract new viewers.'
  },
  quad_high_demand: {
    title: 'High Demand Filter',
    category: 'Topic Radar',
    p: 'Filters the catalog to topics generating above-average view volume across the niche.',
    t: 'Subset where Topic_Avg_Views exceeds the 70th percentile of cohort view distribution.',
    calc: 'Filter(Avg_Views >= P70(Views))',
    read: 'Identifies the mainstream anchor topics that drive the largest bulk of views in your niche.',
    act: 'Ensure your channel has authoritative pillar videos covering these core high-demand topics.'
  },
  quad_emerging: {
    title: 'Emerging Topics Filter',
    category: 'Topic Radar',
    p: 'Filters the catalog to topics with surging 14-day velocity and accelerating publication frequency.',
    t: 'Subset where recent 14-day upload velocity and view growth rate exceed historical 90-day averages.',
    calc: 'Filter(Velocity_14d / Velocity_90d >= 1.25)',
    read: 'Signals breaking industry trends, newly released products, or viral format shifts.',
    act: 'Publish quickly on emerging topics to capture early search volume before the niche gets crowded.'
  },

  /* ── 04. Creator Studio & Title Lab ───────────────────────────────────────── */
  title_score: {
    title: 'Title Lab Real-Time Scorer',
    category: 'Creator Studio',
    p: 'A predictive 0–100 score rating the search appeal, character length, and hook strength of your video title.',
    t: 'Composite algorithmic formula evaluating length (25pts), topic keyword demand (35pts), power hooks (25pts), and syntax structure (15pts).',
    calc: 'Length_Score + Topic_Score + Hook_Score + Structure_Score',
    read: '• 85–100: Elite (High CTR probability)<br>• 70–84: Strong (Competitive packaging)<br>• 50–69: Fair (Needs optimization)<br>• <50: Needs Work',
    act: 'Iterate your draft title in Title Lab until you achieve a score of 70+ before sending to your pipeline.'
  },
  title_length: {
    title: 'Title Length & Mobile Truncation',
    category: 'Creator Studio',
    p: 'The character count of your video title, optimized to display fully on mobile screens without truncation.',
    t: 'Character length metric evaluated against the standard YouTube mobile app truncation boundary (approx. 50-60 characters).',
    calc: 'String_Length(title)',
    read: '• 40–60 chars: Optimal (100% visible on mobile)<br>• 61–75 chars: Acceptable (May truncate on small viewports)<br>• >75 chars: Too long (Critical hook text hidden behind ellipsis)',
    act: 'Front-load your primary keyword and hook in the first 45 characters so mobile viewers see the full premise.'
  },
  topic_match: {
    title: 'Topic Match Score (35 pts)',
    category: 'Creator Studio',
    p: 'Evaluates whether your video title incorporates high-demand keyword tokens tracked in your niche radar.',
    t: 'Matching algorithm checking title text against verified high-RPI topic clusters and trending tokens.',
    calc: 'Min(35, Count(Matched_Radar_Tokens) * 17.5)',
    read: 'High scores confirm your title connects directly to proven search and suggested viewing demand.',
    act: 'Click on the suggested trending topic tokens below the input box to instantly append relevant keywords.'
  },
  hook_format: {
    title: 'Hook & Format Score (25 pts)',
    category: 'Creator Studio',
    p: 'Measures the psychological click appeal, curiosity triggers, and power words in your title.',
    t: 'Pattern matcher detecting curiosity words ("Why", "Secret", "Mistake", "Truth"), numerals, and format markers.',
    calc: 'Power_Words(10pts) + Numerals(8pts) + Format_Triggers(7pts)',
    read: 'Titles with strong hooks produce significantly higher Click-Through Rates (CTR) in browse and suggested feeds.',
    act: 'Frame your title around a compelling transformation, curiosity gap, or contrarian insight.'
  },
  structure_score: {
    title: 'Structure & Syntax Score (15 pts)',
    category: 'Creator Studio',
    p: 'Assesses the structural readability, separator balance, and parenthetical clarity of your title.',
    t: 'Syntax evaluator checking for clean colons, hyphens, brackets/parentheses, and title casing.',
    calc: 'Separators(5pts) + Brackets(5pts) + Casing(5pts)',
    read: 'Clear structure helps viewers parse the value proposition in under 0.5 seconds while scrolling.',
    act: 'Use formats like "[Topic]: [Hook] ([Format])" — for example: "SolidWorks Tutorial: 5 Mistakes Beginners Make (Explained)".'
  },
  topic_tokens: {
    title: 'Trending Topic Tokens',
    category: 'Creator Studio',
    p: 'High-momentum semantic keywords extracted from top-performing competitor uploads in your niche.',
    t: 'Verified NLP tokens with momentum >= 1.2x currently missing from your draft title.',
    calc: 'Filter(Cohort_Tokens, Momentum >= 1.2 && !Title.includes(Token))',
    read: 'Represents instant keyword opportunities to boost algorithmic search affinity.',
    act: 'Click on any token chip to automatically insert it into your draft title.'
  },
  moat_convergence: {
    title: 'Concept: Moat Convergence',
    category: 'Creator Studio',
    p: 'Combines your channel\'s highest-performing proven topic with a surging field trend to defend your niche moat.',
    t: 'Algorithmic formula synthesizing Primary_Top_Topic (Moat) × Cohort_Surging_Topic (Trend).',
    calc: 'Formula: "{Moat} vs {Surging_Trend}: The Engineering Battle Nobody Understood"',
    read: 'High match percentage. Defends your established audience while tapping into new viral curiosity.',
    act: 'Produce this concept when you want a reliable hit that leverages your core channel authority.'
  },
  gap_attack: {
    title: 'Concept: Gap Attack',
    category: 'Creator Studio',
    p: 'Targets high-volume competitor topics where your channel currently has zero uploads.',
    t: 'Algorithmic formula attacking high-demand cohort keywords with 0 primary channel coverage.',
    calc: 'Formula: "{Untapped_Gap} Explained: The Mistakes Every Beginner Makes"',
    read: 'High match percentage. Exploits uncontested viewer demand to attract new subscribers from competitors.',
    act: 'Queue gap attack concepts in your pipeline to capture competitor audience overflow.'
  },
  franchise_followup: {
    title: 'Concept: Franchise Follow-Up',
    category: 'Creator Studio',
    p: 'A direct algorithmic sequel or part-2 concept anchored to your highest-performing historical video.',
    t: 'Algorithmic formula identifying your channel\'s #1 most-viewed evergreen video and constructing a natural sequel.',
    calc: 'Formula: "Part 2: Why {Best_Video_Topic} Really Matters (1 Year Later)"',
    read: 'Capitalizes on existing algorithmic affinity; YouTube naturally recommends sequels to viewers of part 1.',
    act: 'Release franchise sequels when you notice your original video continues to receive evergreen search traffic.'
  },
  contrarian_take: {
    title: 'Concept: Contrarian Take',
    category: 'Creator Studio',
    p: 'Challenges conventional wisdom or standard practices in your niche to generate high debate and comment velocity.',
    t: 'Algorithmic formula framing a trending topic around a counter-intuitive or myth-busting premise.',
    calc: 'Formula: "The Hard Truth About {Trending_Topic}: Stop Doing This"',
    read: 'Generates above-average CTR and intense comment section engagement, accelerating algorithmic recommendations.',
    act: 'Ensure your video delivers a well-researched, defensible thesis to back up the bold title premise.'
  },
  mastery_blueprint: {
    title: 'Concept: Mastery Blueprint',
    category: 'Creator Studio',
    p: 'A comprehensive, end-to-end masterclass or pillar framework establishing authoritative niche dominance.',
    t: 'Algorithmic formula synthesizing a definitive, long-tail pillar guide for your core topic.',
    calc: 'Formula: "From Zero to Master: The Complete {Core_Topic} Guide"',
    read: 'Generates long-term evergreen search traffic and builds deep channel trust and high watch time.',
    act: 'Include comprehensive chapters, downloadable resources, and detailed walk-throughs.'
  },
  concept_match: {
    title: 'Algorithmic Demand Match',
    category: 'Creator Studio',
    p: 'The estimated fit percentage evaluating how strongly a concept aligns with active cohort search demand.',
    t: 'Calculated by weighting keyword view volume, topic momentum multiplier, and channel authority score.',
    calc: 'Min(99, Round(0.5*Demand_Score + 0.3*Momentum + 0.2*Moat_Fit))',
    read: 'Scores above 85% represent high-conviction concepts backed by empirical cohort telemetry.',
    act: 'Click "+ Pipeline" on high-match concepts to move them straight into production planning.'
  },
  content_pipeline: {
    title: 'Content Pipeline Kanban',
    category: 'Creator Studio',
    p: 'A structured production board managing your video concepts from raw ideas to published releases.',
    t: 'Kanban state machine with persistent local storage tracking stage transitions across production.',
    calc: 'Stages: Ideas -> In Production -> Scheduled -> Published',
    read: 'Keeps your production pipeline organized and prevents creative bottlenecks.',
    act: 'Maintain at least 3 concepts in "Ideas" and 1 in "In Production" to ensure an uninterrupted upload cadence.'
  },
  pipeline_stages: {
    title: 'Production Pipeline Stages',
    category: 'Creator Studio',
    p: 'The 4 standard production milestones used to track video delivery from concept to publish.',
    t: 'Workflow stages: (1) Ideas & Research, (2) In Production (Scripting & Filming), (3) Scheduled (Rendered & Queued), (4) Published.',
    calc: 'Stage_Transition(Card_ID, New_Stage)',
    read: 'Provides real-time visibility into your upcoming release queue.',
    act: 'Move cards between stages as you progress through scriptwriting, editing, and packaging.'
  },
  ai_synthesizer: {
    title: 'AI Title Synthesizer',
    category: 'Creator Studio',
    p: 'Generates algorithmic title variations optimized for Click-Through Rate and keyword search volume.',
    t: 'Rule-based and LLM synthesis engine blending psychological power hooks with verified niche keyword tokens.',
    calc: 'Synthesize(Topic, Target_Hook, Format_Archetype)',
    read: 'Provides 6 distinct angles (How-to, Curiosity, Case Study, Ranked List, Contrarian, Direct Guide).',
    act: 'Test multiple synthesized variations in Title Lab to find the highest-scoring option.'
  }
};
