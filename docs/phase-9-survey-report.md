# Phase 9 Survey implementation and verification

Baseline: `codex/onsite-builder-pre-survey`, verified remote SDK `3bb01bb`, frontend `857b545`, backend `64f68d9`. Changes are isolated on `codex/onsite-builder-survey`; nothing was merged or deployed.

## Implemented

- Persistence errors from response POST/PATCH propagate to Survey controls. Next, Back, Submit and dismissal wait for persistence; errors retain entered answers and show Retry. Busy controls and terminal state prevent duplicate clicks. Database write transactions deduplicate impressions, response creation and lifecycle events and make submitted responses immutable.
- Same-session reload restores server-saved answers and the destination step. Incomplete Surveys bypass frequency and trigger checks while retaining page, audience, schedule and origin restrictions. Terminal impressions do not prevent a legitimately repeated Survey from creating a new response.
- Version 3 documents add question-reference and navigation blocks. Canonical definitions remain exclusively in `survey.steps[].questions`. Version 2 Widgets/Guides and existing GrapesJS Survey projects remain supported. The SDK and authoritative backend compilers share a deterministic six-question fixture and strict compiled HTML/CSS/content checks.
- All six existing question types, contextual question properties, existing directional insertion/nesting/movement/resize/style controls, question/cell duplication, deletion, and atomic canonical-model/document undo/redo. Duplication creates fresh step/question/option/cell/block IDs; movement and cosmetics preserve IDs.
- Compact Survey step dock supports add, duplicate, move and delete. Step properties include heading, Back/progress, Submit label, and ordered forward-only answer rules. Invalid backward moves/rules are rejected. Deleting a question removes its rules; changing a type/option removes rules that become invalid.
- The existing SurveyRenderer and response/analytics/Results APIs handle both authoring surfaces. Branch navigation, Back, progress and required validation use the answer-derived permitted path. The backend derives this path independently from the published definition, rejects forged/skipped destinations and stale skipped answers on submit, and validates all question types. No client visited-step claims are trusted.
- Full Survey preview uses isolated callbacks and does not persist responses or produce production analytics/completion state. The UI explicitly says website JavaScript may still have side effects. No arbitrary website JavaScript sandbox was added.
- Required input accessibility attributes are accepted consistently across all three HTML contracts. Selected choice styles override the compiled base styles. Design inputs remain read-only and allow selecting their containing question.

## Verification

| Suite | Result |
| --- | --- |
| SDK unit suites | 362 passed, 40 files |
| Frontend unit suites | 296 passed, 44 files |
| Backend unit/integration suites | 526 passed; 22 existing skips, 61 passing files |
| Existing plus new browser suite | 159 passed: 53 each in Chromium, Firefox, WebKit |
| Real dashboard/backend/database/built-SDK workflows | 6 passed: Guide and Survey in all three engines |
| Final Survey selected-style/required/retry checks | 6 passed across all three engines |
| SDK, frontend, backend production builds | Passed |

The real-service fixture binds loopback and creates a temporary migrated database. The Survey browser workflow creates through the dashboard, opens the live editor, changes question types, builds a nested cell, adds required questions and steps, configures a skip branch, saves, reloads, previews and verifies zero responses/events, checks a 360px dock, reviews/publishes, submits through a separate visitor context, reloads mid-response, verifies one stored submission/event and opens its answer in Survey Results. The Guide workflow covers existing SPA continuation, publishing, stale revisions and session expiration. Unit tests cover failed POST/PATCH/network requests, retries, double submission, abandonment/recovery, concurrent creation, ownership, immutable terminal state, compiled parity, fresh duplication IDs, model/layout undo and server-derived branching.

Browser dependencies required local executable/shared-library overrides in this environment; repository Playwright projects remain the standard Chromium/Firefox/WebKit configurations. The additional six-question browser fixture tests the existing legacy-compatible markup path alongside version 3 cells. No tests were removed or skipped to obtain these results. The old assertion that on-site Surveys were unsupported now checks the still-unsupported Hotspot type; creation and publishing of on-site Surveys are verified end to end.

Automatic review blocked an earlier unit run after detecting a default production-looking API request. Unit setup now denies unmocked fetches, module lifecycle tests use an explicit test endpoint, and the isolated full suite passes. Integration traffic uses only the loopback fixture services.

## Gzip bundle comparison

Bytes measured with Node `gzipSync(..., { level: 9 })` against the baseline tracked artifacts.

| Bundle | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Visitor `sdk.min.js` | 18,203 | 18,203 | 0 |
| Experience runtime `sdk-experiences.min.js` | 18,926 | 19,922 | +996 (+5.3%) |
| Lazy editor `sdk-editor.min.js` | 60,888 | 69,001 | +8,113 (+13.3%) |

Editor growth is the question inspector, Survey step controls and version 3 compilation/editing. The visitor bundle is byte-identical in size; question-authoring modules/markers occur only in the lazy editor bundle. No dependencies, page-wide observers or DOM-scan loops were added. All six protected positioning sources (`AnchoredCardRenderer`, `LayerManager`, `StackingContextResolver`, `WidgetSizing`, `HotspotRenderer`, `AnchoredTargetBackdrop`) are unchanged from baseline. Existing positioning/backdrop/browser regressions pass.

## Limits and release notes

- Recovery covers server-saved answers in the same supported visitor session. Input entered after the last successful save is retained while the failed Survey stays open, but unsaved keystrokes cannot survive a full page reload. Responses are not transferred between devices or sessions.
- An actual Android device was unavailable; native engines and narrow browser viewports were tested.
- Existing environment-dependent backend skips remain unchanged. Frontend build retains its existing large-chunk warning.
- Forward-only rules support first-match conditions and a default destination; no loops or advanced Survey workflow engine was introduced.
- Publish compatible backend validation/runtime readers with the new SDK/frontend as a coordinated release. Existing builder choices remain immutable; no GrapesJS or version 2 migration is performed.

The Phase 8.5 architecture handoff remains historical context. Phase 9 reuses its identified interfaces and services; no new Survey response store or renderer is needed for subsequent question enhancements.
