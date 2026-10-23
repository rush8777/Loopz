# Phase 8.5 stabilization verification

Baseline: `codex/onsite-builder-guide-logic`. Verified remote SDK `241a6f4`, frontend `835957f`, backend `dcbb220` before creating `codex/onsite-builder-pre-survey` in all three repositories. Local baseline trees matched those remote commits. No merge or deployment is part of this change.

## Focused changes

- Native shadow-tree selection now uses composed ranges where available and `setBaseAndExtent` when restoring a range. WebKit can rescope ordinary ranges to the host and ignore `addRange` after clearing a shadow selection. Scoped Select All, typing, formatting, paste and undo use the same small editor-only helper.
- Authoring hosts mount inside `body`: Gecko cannot reliably edit a shadow tree mounted directly under `html`. Visitor renderer placement remains unchanged.
- Insertion controls now sit outside both the cell and any overflowing block content. This fixes a real Firefox race where selecting a short heading cell moved the bottom insert button under the second click, opening the palette instead of entering text editing. A browser regression constrains the cell to 14px and verifies both unobstructed double-click editing and a closed palette.
- Keyboard activation of Move focuses a compatible destination; Tab/Shift+Tab cycles destinations, Enter moves and Escape cancels. IDs and nested subtrees remain intact.
- Preview explicitly explains that website interactions can execute the website's own JavaScript. Existing SDK preview isolation remains in place.
- Dashboard Survey Results is reachable again and uses the existing save-before-navigation handler. The Other menu opens using click/touch/keyboard. The creation dialog keeps its footer accessible and scrolls its content within the viewport.
- The SDK instance/listener unit tests now stub `fetch` during setup and restore it after instance cleanup. They previously inherited the default API endpoint; automatic approval review identified this test-isolation gap. No production SDK behavior changes.
- Browser fixtures disable HMR to avoid an unrelated fixture rebuild reloading an active test. Assertions retain their original behavior checks; spotlight geometry tolerates CSS serialization rounding at 0.001px and WebKit text entry uses native keystrokes.

## Reported baseline failures

Frontend baseline reproduced 14 failures (281 passes). Backend reproduced seven failures (499 passes, 22 existing skips). None was removed or skipped to obtain passing results.

| Repository / failures | Classification | Evidence and correction |
|---|---|---|
| Frontend Guide/Survey step-switching, saved-page launch and floating-step-control tests | Test setup | The GrapesJS mock discarded the real `canvasOverlay` prop containing the step chip. Render that prop; retain the builder flush/order, separate-state, ID, target URL and selected-step assertions. |
| Frontend two Results-navigation tests | Application defect | `openResults` already saved/flushed and handled failures, but no Results button invoked it. Restore the button; successful navigation and failed-save retention both pass. |
| Frontend standalone navigation | Outdated expectation, plus accessibility defect | Supported widgets moved into Other; verify all seven destinations there. Add explicit click/keyboard opening to the existing menu. |
| Frontend normal signup/invitation suite | Outdated expectation | Signup creates an account; workspace details belong to onboarding. Verify required credentials, actual signup payload and navigation; invitation-return behavior remains covered. |
| Frontend funnel summary | Outdated expectation / asynchronous setup | Await loaded metrics and verify the exact 25% / 2,500 drop in both the row and largest-drop summary, rather than removed copy. |
| Backend password and Google atomicity (2) | Outdated failure injection | Workspace creation moved to onboarding. Inject failure at session insertion during signup; still assert complete account/identity/session rollback. Add four onboarding failure-and-retry cases at organization, membership, subscription and site insertion. |
| Backend Google multi-client concurrency (1) | Outdated expectation | Concurrent authentication creates one canonical account, with workspace creation deferred. Concurrent onboarding through independent clients must return 201/409 and persist exactly one organization, membership, site and subscription. |
| Backend migrations (1) | Outdated expectation | Replace the hardcoded 32 with the checked-in migration journal (37). Reapply migrations and verify idempotence plus the revision column. |
| Backend Starter site capacity (1) | Fixture setup | Onboarding already creates the first site. Start from that site, reject a second with current=1/limit=1, then verify reads and count remain correct. |
| Backend tenant isolation (1) | Outdated expectation | Tenant B owns its onboarding site. Verify disjoint A/B site IDs and retain the cross-tenant 404 assertion. |
| Backend usage (1) | Outdated expectation | Count onboarding plus the fixture site. Add a separate tenant and verify its count does not affect the owner's usage. |


The nine mock-setup failures were independently reproduced from the unchanged baseline and retain these assertions after repair:

- keeps Guide layering policies isolated per step.
- keeps separate builder state for each Guide step.
- flushes the active Guide builder before mounting the selected step.
- chooses a Guide step pattern before creating and selecting the new step.
- keeps the selected Guide step stable when moving and deleting from its contextual menu.
- opens the selected Guide step on that step's saved page.
- falls back to the session launch URL when a Guide step has no saved page.
- flushes and preserves independent survey slide builders when switching slides.
- uses a floating chip instead of a Guide step sidebar.

## Verification

| Check | Result |
|---|---|
| SDK `npm test` | 338 passed, 37 files |
| Frontend `npm test` | 295 passed, 44 files |
| Backend `npm test` | 510 passed; 22 pre-existing skips in legacy disabled route suites |
| Production builds, all three repositories | Passed |
| Existing SDK Playwright suite | 153 passed: 51 each in Chromium, Firefox and WebKit (2.6 minutes), no retries |
| Real-service authoring/publishing integration | See final integration result below |

The existing browser matrix covers nested cells, directional insertion, pointer resize, cross-parent drag and keyboard moves, stable IDs, inline caret/partial selection/composition, image picker/drop/validation/undo/reload, Guide navigation/triggers, delayed targets, React SPA navigation and back/forward/reload, revision conflicts, failed-save recovery, sticky headers, backdrop restoration, independent published button actions, and controls at 320/360/390px. Most existing browser cases use their established HTTP fixtures; the added integration specifically uses actual services.

`npm run test:integration` starts the actual dashboard, backend with a fresh migrated libSQL database, and a test website using the built SDK. It creates an isolated account/workspace/site, authors a nested three-step Guide with independent website-click and custom-event triggers, saves and checks database content, reloads and previews with zero production analytics, completes the real review wizard, publishes, and delivers the published version in a separate visitor context. It verifies SPA/reload continuation, exactly one impression/completion and three shown/completed step events, duplicate custom-event suppression, stale revision 409, invalid definition 400, and expired editor session 401. There are no mocked HTTP routes in this integration. The backend fixture requires `NODE_ENV=test`, ignores production database configuration, binds loopback, and deletes its temporary database on graceful shutdown.

Final integration result: **6/6 passed**, two complete runs each in Chromium, Firefox and WebKit (2.3 minutes). No retries or HTTP mocks. The final run includes the insertion-control overlap fix.

## Runtime and bundle protection

There are no source changes to `AnchoredCardRenderer`, `LayerManager`, `StackingContextResolver`, `WidgetSizing`, `HotspotRenderer` or `AnchoredTargetBackdrop`. Existing natural scrolling, horizontal clamping, pointer alignment, sticky-header occlusion, layering and cleanup remain covered by the browser/unit suites. Backdrop is opt-in; tests verify spotlight/target interaction and restoration of original scroll styles on hide, dismiss and destroy.

Gzip measured from baseline and final built files using Node `zlib.gzipSync` at level 9:

| Artifact | Before (bytes) | After (bytes) | Difference |
|---|---:|---:|---:|
| Visitor `sdk.min.js` | 18,203 | 18,203 | 0; byte-identical |
| Runtime `sdk-experiences.min.js` | 18,926 | 18,926 | 0; byte-identical |
| Lazy editor `sdk-editor.min.js` | 60,636 | 60,888 | +252 (+0.42%) |

The selection helper stays behind the editor import boundary. No editor code enters the unchanged visitor/runtime bundles. Generated SDK distribution files are included because these repositories consume checked-in built artifacts.

## Environment and remaining risks

- Chromium 153, Playwright Firefox 157 and WebKit 27.2 were exercised in Linux. Chromium's normal browser download returned invalid archives in this environment; an isolated Chromium executable was used without adding repository dependencies. WebKit libraries were extracted into a temporary directory; container sandbox settings were adjusted only in the local test launcher. These launch accommodations do not skip test assertions.
- Mobile tests cover viewport layouts, not physical Android hardware. No attached Android browser was available. Native OS file-picker UI and physical touch gestures remain device checks.
- Preview cannot sandbox customer website JavaScript. The UI now makes that limitation explicit; SDK-controlled preview events/progress remain isolated.
- The Survey review identifies existing response-save error propagation and interrupted-response resumption limitations. See [Phase 9 handoff](phase-9-survey-handoff.md). Resolve those focused runtime gates before enabling Survey question blocks. Survey authoring and branching are not implemented here.
- No repository `AGENTS.md` or installed runtime-positioning protection skill was present in this workspace. The explicit positioning safeguards in the task were followed directly.

Run the integration with the three repositories as sibling directories and dependencies installed: build the SDK, install Playwright browser dependencies, then run `npm run test:integration` from the SDK repository. The test owns ports 4310, 5173 and 4179 and refuses to reuse existing services.
