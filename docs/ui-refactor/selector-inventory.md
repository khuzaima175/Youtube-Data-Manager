# Selector Inventory Contract

This document indexes all DOM selectors (IDs, querySelectors, and data attributes) referenced across `static/js/*.js`.
**Rule**: None of the selectors listed here may be renamed or removed in CSS/HTML without simultaneously updating their referencing JavaScript file.

## 1. getElementById References (128 unique IDs)

| Element ID | Referenced In Files |
|---|---|
| `accelRadarList` | dashboard.js |
| `achievementToast` | report-gamification.js |
| `addBtn` | api.js |
| `addDropdown` | channels.js |
| `addInput` | api.js, channels.js |
| `addPanel` | channels.js |
| `addStopwordInp` | settings-inbox.js |
| `addTgl` | channels.js |
| `aiSynthAngleInput` | studio.js |
| `aiSynthModal` | studio.js |
| `aiSynthModalContent` | studio.js |
| `aiSynthOvrl` | studio.js |
| `aiSynthResultsWrap` | studio.js |
| `aiSynthRunBtn` | studio.js |
| `aiSynthTopicInput` | studio.js |
| `aliasFromInp` | settings-inbox.js |
| `aliasToInp` | settings-inbox.js |
| `bellBadge` | settings-inbox.js |
| `bellBtn` | main.js |
| `bellPopover` | main.js, report-gamification.js, settings-inbox.js |
| `canvasBody` | main.js |
| `chCntLbl` | channels.js |
| `chTbl` | channels.js, main.js |
| `channelsSummaryStrip` | channels.js, main.js |
| `cmdInp` | main.js |
| `cmdList` | main.js |
| `cmdOvrl` | main.js |
| `cmdPal` | main.js |
| `compareAddBtn` | main.js |
| `compareNowWrap` | main.js |
| `comparePopover` | main.js, report-gamification.js, settings-inbox.js |
| `comparePopoverList` | main.js |
| `compareTrayChips` | main.js |
| `crumbCurrent` | main.js |
| `dashCompetitorDrops` | dashboard.js |
| `dashGrowthCanvas` | dashboard.js |
| `dashMain` | dashboard.js, main.js |
| `dashRaceWindow` | dashboard.js |
| `dashRecentUploads` | dashboard.js |
| `dashTopicRadar` | nlp-topics.js |
| `dashVelocity` | dashboard.js, main.js |
| `dataHealthPopover` | main.js |
| `ddActions` | deep-dive.js |
| `ddLogoWrap` | deep-dive.js |
| `ddMeta` | deep-dive.js |
| `ddName` | deep-dive.js |
| `ddPanel-compare` | deep-dive.js |
| `ddPanel-growth` | deep-dive.js |
| `ddPanel-overview` | deep-dive.js |
| `ddPanel-topics` | deep-dive.js |
| `ddPanel-videos` | deep-dive.js |
| `ddTimingHeatmapWrap` | timing.js |
| `ddTimingVsFieldBtn` | timing.js |
| `ddVidListContainer` | deep-dive.js |
| `ddVidLoadMore` | deep-dive.js |
| `dhPopoverList` | main.js |
| `helpPanelGlossary` | main.js |
| `helpPanelShortcuts` | main.js |
| `helpTabGlossary` | main.js |
| `helpTabShortcuts` | main.js |
| `ladderList` | dashboard.js |
| `lastUpdatedAgo` | main.js, state.js |
| `lbCardsList` | dashboard.js |
| `lbTableBody` | dashboard.js, main.js |
| `myPulseBtn` | main.js, nlp-topics.js |
| `myPulsePopover` | main.js, nlp-topics.js, report-gamification.js, settings-inbox.js |
| `navOverflowBtn` | main.js |
| `navOverflowPopover` | main.js |
| `page-channel` | deep-dive.js |
| `page-channels` | api.js |
| `page-dash` | api.js, main.js |
| `raceBody` | dashboard.js |
| `radarMain` | main.js, nlp-topics.js |
| `refAllBtn` | api.js |
| `reportModal` | report-gamification.js |
| `reportOvrl` | report-gamification.js |
| `reportPreviewContainer` | report-gamification.js |
| `sbBadge` | api.js, main.js |
| `sbChAvatar` | main.js |
| `sbChName` | main.js |
| `sbChSubs` | main.js |
| `sec-drops` | nlp-topics.js |
| `sec-timing` | settings-inbox.js |
| `settingsModal` | settings-inbox.js |
| `settingsOvrl` | settings-inbox.js |
| `settingsPanelBody` | settings-inbox.js |
| `sfCacheChip` | main.js |
| `sfCacheDot` | main.js |
| `sfCacheText` | main.js |
| `sfKbdHint` | main.js |
| `sfQuotaFill` | main.js |
| `sfQuotaVal` | main.js |
| `shortcutsModal` | main.js |
| `spotlightBody` | main.js |
| `spotlightCard` | main.js |
| `spotlightOverlay` | main.js |
| `spotlightStepLbl` | main.js |
| `spotlightTitle` | main.js |
| `srDropdown` | channels.js |
| `srInput` | api.js, channels.js, main.js |
| `srRes` | channels.js |
| `srSkel` | channels.js |
| `stalenessBanner` | settings-inbox.js |
| `studioMain` | main.js, studio.js |
| `studioSubPanel` | studio.js |
| `titleLabInput` | nlp-topics.js, studio.js |
| `tlFeedback` | studio.js |
| `tlLenCount` | studio.js |
| `tlLenFill` | studio.js |
| `tlMeterHook` | studio.js |
| `tlMeterLen` | studio.js |
| `tlMeterStruct` | studio.js |
| `tlMeterTopic` | studio.js |
| `tlScoreBadge` | studio.js |
| `tlScoreNum` | studio.js |
| `toast` | state.js |
| `topbarKbdLabel` | main.js |
| `topicCellPopover` | nlp-topics.js |
| `topicCellPopoverHdr` | nlp-topics.js |
| `topicCellPopoverList` | nlp-topics.js |
| `tourNextBtn` | main.js |
| `tourPrevBtn` | main.js |
| `velLegendChips` | dashboard.js |
| `velLegendPopover` | dashboard.js |
| `voidMinerBtn` | studio.js |
| `voidMinerInput` | studio.js |
| `voidMinerResultsWrap` | studio.js |
| `yvfChartWrap` | dashboard.js, main.js |

## 2. querySelector / querySelectorAll References (25 unique queries)

| Selector | Referenced In Files |
|---|---|
| `#dashSpyRail .dash-spy-item` | main.js |
| `#ddTabsWrap .tab` | deep-dive.js |
| `#ddVidFormatSeg .vid-seg-btn` | deep-dive.js |
| `#ddVidSortSeg .vid-seg-btn` | deep-dive.js |
| `#reportPeriodSeg .vid-seg-btn` | report-gamification.js |
| `#reportScopeSeg .vid-seg-btn` | report-gamification.js |
| `#settingsModalSeg .vid-seg-btn` | settings-inbox.js |
| `.bars` | dashboard.js |
| `.cal-cell` | deep-dive.js |
| `.cmd-item` | main.js |
| `.compare-popover-item` | main.js |
| `.count-val` | channels.js, dashboard.js, deep-dive.js |
| `.dash-chart-hdr .race-seg-btn` | dashboard.js |
| `.dd-panel` | deep-dive.js |
| `.heat-cell` | timing.js |
| `.lb-mobile-sort .race-seg-btn` | dashboard.js |
| `.m-nav-item` | main.js |
| `.nav-overflow-item` | main.js |
| `.page` | main.js |
| `.page.on` | report-gamification.js |
| `.rev` | deep-dive.js, state.js, studio.js |
| `.rev:not(.in)` | deep-dive.js, state.js |
| `.sb-nav-item` | main.js |
| `.snap-dot` | deep-dive.js |
| `.yvf-chips .chip-btn` | dashboard.js |

## 3. Data Attributes (8 unique attributes)

| Data Attribute | Referenced In Files |
|---|---|
| `data-col` | timing.js |
| `data-id` | main.js |
| `data-index` | main.js |
| `data-lucide` | channels.js, dashboard.js, deep-dive.js, nlp-topics.js, studio.js |
| `data-row` | timing.js |
| `data-tip` | dashboard.js, deep-dive.js, main.js, timing.js |
| `data-type` | main.js |
| `data-val` | channels.js, dashboard.js, deep-dive.js |