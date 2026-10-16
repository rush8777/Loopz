# On-site builder Phase 0–2 hardening — 2026-10-16

Baseline: feature branches at SDK `762faa2`, dashboard `ca2ee9b`, backend `daea19a`. Remote heads were reconfirmed before editing. Local baseline trees match those published commits. Work is isolated on `codex/onsite-builder-phases-0-2-hardening`; no merge, deployment or production-data access.

## Confirmed causes and fixes

### P0 — editing and data integrity

1. **Caret/selection:** the delegated click handler unconditionally finished editing and prevented native selection. Active text now keeps native click, double-click, drag, touch and keyboard selection. Switching components flushes the previous transaction. Composition is excluded from save, undo and transitions until `compositionend`. Editable nodes are not remounted while typing.
2. **Undo/redo:** old HTML-only snapshots left structured content stale and retained invalid Range references. Snapshots now include HTML, content/actions, component key, editing state and text offsets. Undo restores a fresh node/range and autosaves through the normal serialized queue. Typing coalesces at a 300ms pause or explicit flush; history is bounded to 50 entries and approximately 2MB. Image, list, formatting, empty-text and component changes participate. Caret offsets are best-effort; backward selection direction is not retained. History is scoped to the current rendered step/editor lifetime.
3. **Structured projections:** truthy-only updates skipped cleared fields, `slice()` silently truncated them, and `textContent` joined list items. Empty values now replace stale values, block saving with field-specific errors, and remain undoable. Heading/body/button limits are 160/2000/80 characters. Text is never truncated. Block/list separators are projected consistently in SDK and backend. Button actions remain intact. On-site server writes reject contradictory HTML/plain-text projections.
4. **Save lifecycle:** clearing `dirty` before PATCH acknowledgement let close destroy an editor with a request pending. Requests now have an independent promise, immutable request snapshot, edit generation and lifecycle generation. Clean/dirty/saving/failed/conflict/expired states are explicit. Close waits for the current request and any newer edit; repeated actions share requests. Only successful acknowledged writes advance revision. Mode and step changes flush first; incomplete IME and invalid fields block destructive transitions.
5. **Recovery:** expiry/revocation previously destroyed DOM-only edits. A token-free definition snapshot is retained separately in editor memory. Expiry stops editing, preview, targeting and session continuation; the remaining panel permits export/discard/reload. Recoverable failures permit retry. Conflict/expiry reload requires explicit confirmation. Copy/Export shows selectable JSON for copying, without clipboard permissions or access tokens. Successful save or explicit discard clears recovery.

### P1 — behavior, security and performance

6. Formatting is component-specific: body supports inline marks, links, alignment and lists; headings support marks/links/alignment; buttons support inline marks and text only; images support URL/alt only. Lists preserve inline markup. Nested links and block selections cannot be wrapped as inline marks. Node replacement invalidates saved Ranges.
7. Toolbar operations use `click`, which supports pointer, Enter and Space without duplicate invocation. Selection survives toolbar focus. Authored components receive temporary tab stops; Enter/Space enters text editing, Escape ends editing, and keyboard undo/redo works. Temporary attributes are removed from serialized HTML and on cleanup.
8. Paste is plaintext, native drop/rich insertion is rejected, and unexpected inserted markup is sanitized in the active component. URL controls reject control characters and unsafe protocols. Backend HTML authority uses `parse5`, including decoded entities, duplicate/malformed attributes, invalid nesting and `_blank` rel validation. SDK/dashboard URL contracts remain mirrored. No editor-only attributes are published. No editing dependency is added to visitor bundles.
9. Preview dismissal no longer schedules an immediate rerender. Reset Preview is explicit. Close/backdrop/timers work through the shared renderer; external links/actions and analytics remain disabled. Guides clearly state that only the selected step is previewed; complete flow simulation is unsupported.
10. Cursor-follow is stationary **only while authoring**, using the existing stationary toast shell; Preview retains cursor movement. Production renderers are unchanged. Authoring disables toast auto-dismiss and dismissal. Anchored drafts explain that Target mode must choose a page element before content can render.
11. Dashboard and SDK saves share `draftWrites.ts`: ownership, supported on-site types, schema/size, references, active subscription, newly added entitlements, no-op detection and atomic draft-only revision update. Forged requests cannot bypass these checks. Stale writes cannot mutate an already published version.
12. Dashboard clean flushes do not PATCH, pending saves are awaited and focus refresh checks local state both before and after its GET. No-op mutations are skipped; backend no-ops do not advance revision. Conflict/retry/export/explicit reload controls preserve local edits. Dashboard on-site writes remain targeting-only.
13. Publish requires `{draftVersionId, revision}` from review. Both are checked again in the transactional publish update; a concurrently changed or already published draft returns `reviewed_draft_changed`. List Publish actions enter review instead of publishing unseen drafts. Existing entitlement/versioning decisions remain in the transaction.
14. Typing updates the active plain-text projection immediately. Whole-widget cloning, serialization and history capture occur only at transaction flush/save boundaries. Inspector updates do not rebuild unrelated panel markup or scan page targets. Plain-text input avoids HTML sanitization work.
15. The editor's document-wide diagnostic observer now runs only in Target mode and disconnects in other modes. The production renderer's bounded discovery and positioning observers are unchanged.
16. CDN and npm/ESM authoring remain lazy. Marker inspection found authoring UI only in the lazy editor chunk, absent from core, experiences, ESM entry and normal module chunk. Existing bundle-loading tests verify ordinary visitor initialization never requests the editor.

### P2 — viewport and browser coverage

17. Panel sizing/clamping responds to window and VisualViewport resize/scroll, including a smaller visible keyboard viewport. Header controls remain available, overflow stays inside the panel, and temporary tab stops enable keyboard selection. Android touch/keyboard behavior still requires real-device verification.
18. Added Playwright configuration for Chromium, Firefox and WebKit and a deterministic fixture. `npm run test:browser -- --list` discovers 36 cases across all engines: caret insertion, word/mouse selection, keyboard toolbar/link operations, composition events, undo/images, long content, slow saves, conflict export/refresh, sticky anchored scrolling, 320/360/390px viewports and repeated cleanup.

## Executed verification

- SDK: **282/282 tests**, 32 files; TypeScript declaration build and all production bundle modes pass.
- New/expanded editor suites: **31/31 tests**. Includes deferred PATCH + newer edit + repeated close, deferred PATCH across Guide step/mode switches, failed close/retry, expiry export, Preview dismissal/reset, cursor stationary authoring and absence of document diagnostics during Design.
- Backend focused experience/checklist/security/analytics/position contracts: **41/41 tests**, 7 files; build passes. Direct API cases cover no-op revisions, stale review, repeat publish, contradictory projections, invalid references, stale editor revision, malicious HTML, forged origin/site, subscription expiry and entitlement denial.
- Full backend: **479 pass, 7 fail, 22 skipped**. The same known failures remain in auth atomicity (2), site tenancy, usage site count, Starter site capacity, simultaneous Google signup and stale migration-count expectation. No relevant experience/security regression failed.
- Dashboard focused authoring/save tests: **6/6**; builder sanitizer/compatibility: **11/11**. Production build passes. Full frontend run before the final added conflict-export test: **269 pass, 13 fail**. The same known failures remain in InvitationPage (1), FunnelDetailPage (1), and legacy Experiences tests (11). The added conflict-export test passes separately.
- Protected SDK positioning/layering files are unchanged: `AnchoredCardRenderer.ts`, `LayerManager.ts`, `StackingContextResolver.ts`, `HotspotRenderer.ts`, `WidgetSizing.ts`. Their existing tests pass in the full SDK run. Shared ExperienceRenderer is unchanged.
- GrapesJS compatibility is covered by passing backend lifecycle/placement/publish tests and dashboard sanitizer tests. The broader dashboard suite is not completely green; real-browser GrapesJS smoke testing remains pending.
- `git diff --check` passes in all three repositories.

## Bundle sizes

Rebuilt before/after using `gzip -c` on stdin, consistently excluding filename headers. The earlier reported gzip baselines (18,166 / 16,712 / 27,302) include filename-header bytes; they are not compression regressions.

| Bundle | Before raw | After raw | Before gzip | After gzip | Gzip delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| sdk.min.js | 61,288 | 61,288 | 18,155 | 18,155 | 0 |
| sdk-experiences.min.js | 60,110 | 60,182 | 16,689 | 16,712 | +23 |
| sdk-editor.min.js | 99,768 | 116,792 | 27,284 | 31,483 | +4,199 |

The tiny experiences change is shared URL validation. Editor UI, recovery, history and handlers remain isolated from ordinary visitors. No GrapesJS import was added to the SDK.

## Synthetic typing measurement

Run `node scripts/measure-onsite.mjs <feature-branch-ref>`. Fifty inputs × three trials; median milliseconds per input, including jsdom DOM changes/event dispatch and excluding final transaction flush. Large widget: approximately 160KB of HTML with 1,000 decorative nodes and 120KB text. This is a comparative synthetic measurement, not browser FPS or Android latency.

| Payload | Before ms/input | After ms/input |
| --- | ---: | ---: |
| Small | 0.479 | 0.088 |
| Large | 28.552 | 0.221 |

## Recovery retention and release implications

Recovery is **memory-only in the current tab**. It is never put in customer localStorage/sessionStorage or a remote recovery service. Successful acknowledgement or explicit discard clears it; closing/navigating away destroys it. Beforeunload warns while edits/composition/requests remain. Export before choosing a destructive refresh. This policy avoids indefinitely storing sensitive drafts on the customer origin, but does not offer crash recovery after a forced tab/process termination.

Migration 0036 is preserved unchanged; no new migration is needed. Backend adds `parse5`/entities, so use the updated lockfile. Coordinate dashboard/backend rollout: old clients without a reviewed-version payload will be rejected rather than silently publish unreviewed content. SDK assets must include the new ESM chunks. Nothing was deployed.

## Unverified and remaining merge blockers

The Cloud browser downloads returned invalid/truncated archives. An attempted Chromium run failed at browser launch because the executable was unavailable. **No real-browser, Firefox, WebKit, Android, physical IME, native clipboard/drop, or on-screen-keyboard QA is claimed to have passed.** Install browsers (`npx playwright install`) and run `npm run test:browser`; then perform physical Android selection/keyboard and GrapesJS smoke testing. Browser automation uses synthetic composition events and cannot establish physical IME correctness alone.

The positioning-guard skill was not installed in the available workspace/skill catalog, and no AGENTS.md was present in these repositories. Protected code was kept byte-for-byte unchanged and its tests were run.

Critical automated regressions pass, but browser coverage and the existing broader-suite failures must be assessed before merging. Phase 3/4 features have not been added. There are no known newly introduced security failures in the executed negative tests; real-browser insertion paths remain an explicit verification gap.

## Changed files

SDK: `src/experiences/editor/{OnsiteContentEditor,EditorModeController,EditorBridge}.ts`, `src/experiences/runtime/BuilderContentContract.ts`, `tests/{OnsiteContentEditor,EditorLiveController}.test.ts`, `tests/browser/{fixture.html,onsite.spec.ts}`, `playwright.config.ts`, `scripts/measure-onsite.mjs`, `vite.config.ts`, package/lock files, ignore rules, this report and generated `dist` editor/runtime/ESM/types/maps.

Backend: `src/lib/experiences/{draftWrites,builderContentContract}.ts`, `src/routes/{experiences,public-experiences}.ts`, package/lock files, API contract documentation, `tests/{experiences,builderContentContract,checklists,experienceAnalytics,entitlements,usage}.test.ts`, `tests/reviewedPublish.ts`, and generated `dist` files. Existing publish regression clients were updated to explicitly review current drafts; original assertions remain.

Dashboard: `apps/dashboard/src/api/experiences.ts`, `components/experiences/builderContentContract.ts`, `pages/experiences/{ExperienceEditorPage,ExperienceListPage,Experiences.test}.tsx` (component/page paths relative to `apps/dashboard/src`), and `docs/onsite-builder-hardening.md`. The unrelated hero-video edit is not included.
