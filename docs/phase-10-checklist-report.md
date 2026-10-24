# Phase 10 — On-site Checklist Builder

Changes are isolated to `codex/onsite-builder-checklists`. Baseline remote heads were verified before editing: SDK `4cb565c`, frontend `add9be7`, backend `a4c951b`. Nothing is merged or deployed.

## Implementation by milestone

| Milestone | Implementation |
| --- | --- |
| 10A: integration | Checklist creation now offers immutable Dashboard/On-site selection. On-site Checklists require a build page on the configured site. Existing authenticated editor sessions supply site-scoped Guide and Segment options; no new production endpoint or table was added. Dashboard Checklists retain their existing GrapesJS authoring and presets. |
| 10B: composition | Explicit schema version **4** extends the existing nested cell document with Checklist view/container roles and task/text/progress/control blocks. A task block stores `itemId` and visual properties; actions and completion conditions remain solely in canonical `definition.items[]`. Decorative heading/text/image/icon/divider/spacer blocks use the existing engine. |
| 10C: states | One document and experience contain Expanded, Collapsed and Completed view cells. A compact toolbar selector changes the authoring view. Each view retains its layout, spacing, sizing and styles; optional view width is bounded to 120–720px and clamped to the viewport. No independent experience/progress identity is created for a view. |
| 10D: configuration | The contextual inspector edits task title/description, actions, Guide/Segment conditions, indicator, font/color and sample status. Existing cell controls handle directional task insertion, movement, duplication, nesting, resizing, styling and deletion. Shared properties include position, order, initial state, dismissal, remaining count, completion copy and acknowledgement label. |
| 10E: preview | The actual ChecklistRenderer uses editor-only simulated progress and callbacks. Open/collapse, locked/available/completed tasks, completion, acknowledgement and reset are interactive. Preview never invokes ChecklistManager, progress endpoints, Guide launches, navigation or production analytics. Website JavaScript may still have side effects; the editor states this explicitly. |
| 10F: persistence | Canonical Checklist properties/items and the document share existing transaction/history snapshots and a single draft write. Existing autosave, session expiry, revision conflicts, recovery/export and reviewed publishing remain in use. |
| 10G: visitor protection | ChecklistManager, completion evaluation and Guide launch logic are unchanged. ChecklistRenderer preserves version 4 nested task cells and custom launcher copy and supplies a progress CSS variable. Legacy GrapesJS task reparenting/copy/state behavior remains unchanged. All six protected Widget/Guide positioning source files remain unchanged. |

## Schema and compiler contract

Versions 2 and 3 retain their interpretation. Version 4 is accepted only with Checklist canonical context and the Checklist renderer type. The SDK and backend compile the same deterministic fixture; its compiled JSON SHA-256 is `423b20b9b4a76073f2a4058915d9001bd03df9b6751e3c89efa7596e7f9cee45`.

Required structural roles and the three views must each appear exactly once, in the appropriate view. Every canonical item must have exactly one task reference inside the Expanded task container, and visual task order must match canonical order. Missing, duplicate, orphaned, misplaced, embedded-model and incompatible-version components are rejected. Generic action buttons/Survey blocks are rejected in Checklist documents. Compiled HTML, CSS, content projection and action bindings must match the structured document exactly. Existing HTML/CSS security checks still apply.

Required views, task container, semantic copy, progress and controls cannot be deleted or duplicated into invalid states. At least one task must remain. These restrictions show concise validation messages rather than confirmation dialogs.

Task duplication generates fresh item/cell/block IDs atomically; movement/resizing/cosmetics keep IDs. Removal deletes both reference and canonical task. Ordering follows the visual cells and is synchronized before compiling. Undo/redo restores both models together. A protected Checklist container is retained when its list shrinks to one child, preserving its runtime role.

## State management and runtime compatibility

ChecklistEditor is an addon to the existing EditorModeController shell, inspector and OnsiteCompositionEditor, like the Survey addon. It does not add another editor or visitor runtime. Its adapter supplies only the existing shell's display fields; saves/export use the original Checklist definition, never the Widget adapter.

The editor renders via ChecklistRenderer and attaches the normal cell editor only in Design mode. Preview progress is held in memory. Native text editing continues through existing cell-editor focus/selection logic. On narrow viewports, the Checklist inspector starts collapsed and opens on component selection, keeping tasks reachable. On desktop it starts opposite the widget.

Published Checklists continue through ChecklistManager and the existing server-owned state/completion tables, actions, refresh, targeting, analytics and Guide launch attribution. Guide-launch tasks keep the existing collapse behavior; opening the launcher restores the expanded Checklist after the Guide. Guide and Segment references are checked against the current site, and unavailable Guide actions block publishing.

## Verification

| Suite | Result |
| --- | --- |
| SDK unit/integration | 380 passed in 42 files |
| Frontend unit/integration | 298 passed in 44 files |
| Backend unit/integration | 538 passed; 22 existing skips unchanged |
| Full browser regression run | 171 passed across Chromium, Firefox, WebKit |
| Final Checklist browser run | 15 passed (5 per engine), including view widths, mobile selection and legacy GrapesJS markup |
| Real-service workflows | 9 passed: Guide, Checklist and Survey in all three engines |
| SDK, frontend, backend production builds | Passed |

The final Checklist run adds legacy GrapesJS markup coverage while retaining all prior browser assertions. A flaky existing Funnel navigation test waited for the funnel name but clicked analysis counts synchronously; both navigation cases now wait for the actual count before clicking, preserving every assertion. A Survey integration diagnostic now tolerates a response body becoming unavailable during navigation; its workflow assertions are unchanged. No test was removed, skipped or weakened.

The real-service Checklist workflow uses the actual dashboard, backend, migrated temporary database and built SDK. It creates a Checklist, adds three tasks, chooses a real published Guide and saved Segment, configures Guide-completed/Segment/item-clicked completion, customizes all three views including launcher width/copy, saves, reloads, tests preview isolation, reviews/publishes, launches/completes the Guide from a visitor context, reopens/reloads, triggers Segment membership, completes the last task, and verifies all three persisted completion sources plus exactly three item-completion events and one Checklist-completed event. Acknowledgement remains effective after refresh. Guide and Survey real-service workflows are retained.

Integration cases run against fresh loopback services/databases for **each workflow and browser**, using `npm run test:integration`. Sharing one service among the expanded suite hit the normal global API rate limit; isolation fixes the test setup without changing production limits or removing assertions. This environment needed local Chromium executable and browser shared-library overrides. Browser tests use Chromium, Firefox and WebKit, including actual interactions at 320px, 360px and 390px. No production service or customer data was used.

## Performance

Bytes measured with Node gzip level 9 against the Phase 9 tracked artifacts.

| Bundle | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Visitor `sdk.min.js` | 18,203 | 18,203 | +0 |
| Experience runtime `sdk-experiences.min.js` | 19,922 | 19,983 | +61 |
| Lazy editor `sdk-editor.min.js` | 69,001 | 78,161 | +9,160 |


Authoring markers/modules occur only in the lazy editor bundle. No GrapesJS dependency enters visitor bundles; no new package dependency, permanent page-wide observer or DOM-scan loop was added. Inline decorative text keeps the existing editing path. State/configuration changes use the existing compiled-document transactions.

## Known limitations

- A physical Android device was unavailable; browser engines and narrow viewports were tested.
- Guide/Segment pickers load up to 200 site-owned references when opening/reloading the editor. Newly created references require reload after saving.
- The three visual states share canonical copy/configuration where appropriate. Launcher label can have independent visual copy. Refresh starts the authoring selector at Expanded; saved layouts and visitor progress are retained.
- Existing backend environment-dependent skips and the frontend large-chunk build warning remain unchanged.
- Release the compatible backend compiler, SDK and frontend together. Existing GrapesJS projects and v2/v3 content are not migrated.
