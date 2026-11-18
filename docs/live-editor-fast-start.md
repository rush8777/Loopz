# Live editor fast start and cross-page continuation

## Behavior

- Initial live-editor launch overlaps the SDK editor bundle download with the one-time editor-session exchange. A new backend can include the authorized initial draft in that exchange, removing the extra draft request.
- A full-document navigation still reloads the customer's JavaScript context, but the new SDK fetches a **fresh** authenticated draft while the editor asset downloads. No stale draft is trusted from local storage.
- SPA route changes reuse the existing editor instance, editor session and guide draft. The RouteObserver updates the current path and targets; no new editor bundle or draft request is needed.
- Every 15 seconds, the editor now checks a small /public/experience-editor/:sessionId/status endpoint rather than downloading the complete draft. A 404 from an older backend safely falls back to the old authenticated draft endpoint.
- The dashboard overlaps saving pending changes with editor-session creation (the session is linked to the experience, not a particular revision).
- Core SDK telemetry behavior for ordinary visitors is unchanged; editor functionality remains lazy-loaded.

## Release coordination (important)

1. Deploy the **Loopz-Backend** branch first. The new exchange payload is **opt-in** via `includeDraft: true`; older SDKs keep the legacy response size.
2. Deploy the paired SDK **core + editor** bundles from the **same commit**, ideally on versioned URLs. The new core consumes the one-use token before the editor bundle finishes downloading and therefore requires the corresponding new editor entry point. Purge any stale editor-bundle CDN cache if stable URLs are used.
3. Deploy the **Loopz-Frontend** branch.
4. Verify a cold editor launch, warm launch, SPA navigation, and a full-document navigation on a staging SaaS, including authenticated pages.
5. Confirm revoked, expired, wrong-origin and wrong-session tokens fail closed, and draft autosave/conflict behavior stays intact.

## Performance measurement

In the customer's browser DevTools, view the Performance API measure named `movcues:editor:startup` and the marks `movcues:editor:start` and `movcues:editor:ready`. Compare cold and warm runs. Also inspect the Network panel for duplicate editor draft GETs and SDK/editor bundle downloads.

These timings are **instrumentation**, not claims that the editor meets a particular latency target. Backend/database RTT, customer app load, CDN caching and browser conditions must be measured separately.

## Local checks

Run from the matching branch of each repository:

- Loopz SDK: `npm ci && npm test && npm run build`
- Loopz-Backend: `npm ci && npm test && npm run build`
- Loopz-Frontend: `npm ci && npm run test:dashboard && npm run build:dashboard`

The fast-start regression tests cover opting into embedded drafts, old-backend fallbacks, authorization failures, SPA editor persistence and prefetched full-page resume.
