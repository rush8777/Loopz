# Phase 8 — Guide step logic

Branch: `codex/onsite-builder-guide-logic`. Baselines verified against GitHub before edits: SDK `33ae8d65724ea21fcae3812a808fb885b96aa3b0`, frontend `a5c4aae27f417c3716327d6d7b7ec5d615c691b9`, backend `be73f05ad810693dfe1a3231da48ef8613c4d2cc` on `codex/onsite-builder-ux-hardening`.

## Implemented

- Step Behavior in the existing contextual inspector: Guide button, website click, hover duration, exact custom event and route rules. Modal target-dependent triggers are disabled with an explanation. Existing Step Appearance, Cell and Block controls remain.
- An optional independent interaction target uses the existing picker and reports selector reliability, primary match count and found/missing state. Configuring it leaves the positioning target unchanged.
- Cancellable presentation delay, bounded initial discovery for both required targets and wait/skip/dismiss fallbacks. Discovery shares one deadline and uses the existing bounded observer. No permanent scanning or new positioning engine.
- Render-generation and active-step guards, single advancement, hover cancellation and stale callback cleanup. Completion invalidates in-flight delivery responses, fixing a race that could reopen a finished Guide.
- Existing session progress now retains stable seen/completed step IDs and impression intent across reloads. SPA changes and back/forward remount only the current step; one route notification cannot cascade through multiple route steps.
- Full journey preview: Start, Back, Next, Reset, step indicator, delay/discovery/trigger status, event test and route simulation. Preview uses the real renderer and trigger listeners, separate in-memory progression, no production event/completion calls and no Guide progress writes. SDK URL actions are ignored; experience links, external native anchors and native form submissions are prevented. Host website click handlers still run.
- Backend schema and publishing checks preserve optional settings, reject incomplete/invalid configurations and identify target/fallback problems by step. Final-step skip is rejected at publish; revision-checked immutable publishing and independent button action validation remain in place. Dashboard launch review displays the actual trigger details and optional timings.
- Inspector synchronization preserves a focused input so autosave/status updates cannot overwrite a value before its change event.

## Model and API

All additions are optional; existing endpoints and revision contracts are unchanged. No migration is needed.

```ts
// Existing element_click / element_hover variants gain:
advance.target?: ExperienceTarget;
// Omission uses step.target for legacy Guides.
step.presentation?: {
  delayMs?: number; // integer 0..30000, default 0
  missingTarget?: {
    action: "wait" | "skip" | "dismiss";
    timeoutMs: number; // integer 100..60000, default discovery 5000
  };
};
```

Hover remains an optional integer 100..60000 ms, default 500. Event names are trimmed, 1..200 characters without control characters. Route rules use the existing include/exclude matching operators and require a nonblank include rule. Modal steps accept button/event/route triggers and delay, but not target triggers or missing-target settings. Guides remain linear with 1..20 unique step IDs. Target presence is validated at publish, not as a prerequisite for an unfinished draft.

`__movcues_active_guide__` gains optional `shownRequested`, `seenStepIds`, `completedStepIds`, `routePath`; old progress remains readable. Continuation remains same-origin, same-session, same-version using the existing delivery API and browser storage. Route matching uses pathname plus query, consistent with existing targeting.

Wait means bounded discovery, then pause; navigation or an existing evaluation can retry. Skip proceeds to the next step without recording the unseen step as completed. Dismiss closes the Guide. Discovery starts after the presentation delay. Positioning and interaction target discovery share the configured timeout.

## Files and architecture

SDK: `ExperienceLoader.ts`, `ExperienceRenderer.ts`, `ExperienceStateStore.ts`, new small `GuideStepLogic.ts`, `EditorModeController.ts`, shared types, regression tests, browser fixture plumbing and rebuilt distribution/types. Frontend: experience types, launch readiness/review and a React test host. Backend: experience types/schema, publish checks and API/schema tests.

The cell engine, compiler and immutable builder selection are unchanged. `AnchoredCardRenderer.ts`, `LayerManager.ts`, `StackingContextResolver.ts`, `WidgetSizing.ts`, `HotspotRenderer.ts` and `AnchoredTargetBackdrop.ts` have no source diff. Existing natural scrolling, sticky-header occlusion, clamping, pointer and backdrop behavior are covered by the existing Chromium cases. No framework dependency was added to the SDK; React comes only from the frontend's existing installation for browser tests. No repository AGENTS.md or installed runtime-positioning protection skill was found; the prompt's explicit protection requirements were followed.

## Verification

- SDK: **334/334** unit tests; source TypeScript and all production bundle builds pass.
- Chromium 153: **50/50** browser tests pass, including **11** new Guide cases. A realistic React host runs real History API routes, delayed React targets, back/forward and full reload. Tests cover published rendering, click/hover/event/route advancement, analytics deduplication, preview isolation, independent target picking, save/reopen, missing-target skip and 320/360/390 px controls. Existing caret, image, cell, sticky-navbar, backdrop, failure recovery and visitor action tests remain unchanged. One existing keyboard movement case timed out in an intermediate run; it passed isolated and in the final full run.
- Backend: **35/35** focused schema/API tests pass, including editor save/reload, actual reviewed publishing and rejection of final-step skip. Full suite: **499 passed, 7 failed, 22 skipped**. The seven failure names match the baseline recorded in `onsite-builder-ux-hardening.md`: auth atomicity/concurrency, migration, entitlements and tenant/usage cases.
- Frontend: **281 passed, 14 failed** in the full suite; all eight added readiness cases pass. The 14 failure names match the recorded baseline (older dashboard Guide/Survey controls, invitation field and funnel assertion). Dashboard production build passes.
- All three production builds pass; existing assertions were not weakened. Firefox/WebKit executables were unavailable and were not run. Physical mobile browsers were not tested.

Run unit suites with `npm test` and builds with `npm run build` in each repo. Browser tests require sibling `Loopz` / `Loopz-Frontend` checkouts with dependencies installed. From SDK: `npx playwright install chromium`, then `npm run test:browser -- --project=chromium`. The test-only build bundles the React host into ignored `tests/browser/.generated`; Vite supplies real `/journey/*` reload routes.

## Bundle comparison

Committed baseline and final artifacts, Node zlib gzip level 9, bytes:

| Artifact | Before | After | Change |
|---|---:|---:|---:|
| Visitor `sdk.min.js` | 18,203 | 18,203 | 0 |
| Runtime `sdk-experiences.min.js` | 18,224 | 18,926 | +702 (+3.85%) |
| Lazy editor `sdk-editor.min.js` | 55,972 | 60,636 | +4,664 (+8.33%) |

The core is byte-identical. The runtime increase covers bounded target/delay handling and continuation/deduplication guards. The editor growth covers the new inspector and full journey controls and stays lazy. Trigger controls, preview controls, React and GrapesJS are absent from both visitor core and runtime artifacts. ESM entry points reference only the current generated module/editor pair.

## Limits

- Browser tests mock delivery/editor HTTP responses; backend tests independently use real API routes and persistence. These checks do not certify a deployed environment or an arbitrary customer CSP.
- Native external links/forms and SDK navigation are blocked in preview. Arbitrary customer JavaScript click handlers can perform requests or programmatic navigation; an on-page SDK cannot sandbox those handlers. Test on a safe host page. Preview can continue across SPA routes; full-page authoring continuation uses the existing editor-session mechanism and does not persist a preview completion history.
- Progress and event intent are best effort browser storage, not a transactional cross-tab/cross-domain event queue. Network/storage failure can lose analytics; no new delivery guarantee or cross-domain synchronization is claimed.
- Target discovery is bounded. Replacement/removal of an already bound interaction node may require route re-entry or explicit retry; no ongoing page-wide observer was introduced.
- Route UI edits the first include rule and preserves additional legacy rules; their values remain visible in publish review. Guides remain linear; no branching or workflow graph.

Nothing is merged to main or deployed. Fetch and switch to `codex/onsite-builder-guide-logic` in each checkout to review locally.
