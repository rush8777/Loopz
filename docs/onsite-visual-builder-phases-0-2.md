# On-site Visual Builder: Phases 0–2

This document describes the shipped authoring boundary for the Movcues browser SDK. The dashboard and backend changes that accompany it must be deployed as a compatible set.

## Builder ownership

Every experience has one immutable `builderMode`:

- `grapesjs` uses the existing dashboard authoring surface. The authenticated live editor retains targeting, navigation, preview, and placement controls but cannot replace authored content.
- `onsite` uses the authenticated SDK editor for content and targeting. Dashboard writes are limited to launch targeting and never run GrapesJS normalization over on-site HTML.

The normal experiences renderer is shared. On-site project data uses the marker:

```json
{ "movcues": { "authoringSurface": "onsite", "schemaVersion": 1 } }
```

That marker is metadata only; authorization is always based on the persisted experience record returned by the backend.

## Editor modes

- **Design** scopes delegated selection to authored nodes in the rendered experience Shadow DOM. Runtime close controls, pointers, backdrops, and the customer page are not selectable.
- **Target** reuses the existing element picker, selector generation, placement, and layer controls.
- **Navigate** removes authoring interception so the host application can be used normally.
- **Preview** removes editing decoration and disables analytics and production actions.

The editor panel has its own Shadow DOM. Its position is independent of the experience host and it collapses to a narrow-viewport layout at 420 px.

## Direct editing and persistence

Text input updates the active DOM node in place. It does not call the renderer while typing, so focus, caret, and IME composition are preserved. A normalized authored surface is serialized after changes; editor attributes and overlays are excluded. Autosave is debounced, flushed before step changes and mode transitions, and participates in optimistic concurrency using the draft `revision`.

The focused rich-text vocabulary is `strong`, `em`, `u`, `a`, `ul`, `ol`, `li`, and the existing structural tags. Links are restricted to safe web, mail, telephone, relative, fragment, and root-relative destinations. Image updates continue through the existing safe-image contract. Button label edits preserve their primary/secondary action markers and configured action.

Undo and redo keep at most 50 local snapshots. A failed save can be retried. A revision conflict preserves local DOM edits and offers a reload-latest recovery action rather than silently overwriting another session.

## Runtime and positioning boundary

Authoring code is emitted in the dedicated CDN editor bundle and a lazy npm/ESM editor chunk. The visitor core, npm/ESM entry, and experiences bundles contain no editor selection, toolbar, undo, or contenteditable implementation; the ESM chunk is fetched only when an editor token or continuation activates an authenticated session. Direct editing uses delegated listeners on the rendered experience surface and does not scan the customer document or install a page-wide mutation observer.

No production positioning, viewport, hotspot, stacking-context, or layer algorithm was changed. The authoring outline is a separate fixed overlay and does not change the experience host's positioning or z-index.

## Performance verification

Measurements were taken from the production build and Node/jsdom test environment on 2026-10-16. Sizes are raw bytes / gzip bytes.

| Artifact | Before | After | Delta |
| --- | ---: | ---: | ---: |
| `sdk.min.js` | 61,154 / 18,119 | 61,288 / 18,166 | +134 / +47 |
| `sdk-experiences.min.js` | 59,658 / 16,552 | 60,110 / 16,712 | +452 / +160 |
| `sdk-editor.min.js` | 78,157 / 22,136 | 99,768 / 27,302 | +21,611 / +5,166 |

The npm ESM build previously loaded a 249,726-byte / 57,574-byte-gzip monolith. Its normal path is now a 134-byte entry plus a 198,956-byte module chunk (46,130 gzip bytes combined); the 81,531-byte / 18,662-byte-gzip editor chunk is lazy.

Bundle-content inspection found the editor toolbar, contenteditable, outline, and recovery strings only in the editor bundle/lazy editor chunk. The ordinary visitor loading test makes no editor request, and the on-site implementation therefore adds zero authoring listeners or requests to an ordinary visit.

A synthetic jsdom typing run applied 200 direct input changes in 106.13 ms (0.531 ms/input) while retaining the exact active DOM node. A scoped stress run on a page with 3,000 customer nodes dispatched 1,000 alternating selection events and 1,000 coalesced scroll events in 69.94 ms. Twenty editor start/destroy cycles left zero authoring nodes and no active delegated input handler. These numbers validate algorithmic scope but are not browser frame-rate measurements; real-device 60 FPS and Android visual QA remain release checks.

## Deployment order

1. Apply backend migration `0036_experience_builder_mode_revision.sql` and deploy the backend.
2. Deploy the SDK editor and experiences assets.
3. Deploy the dashboard.

The backend default keeps older clients compatible by assigning omitted builder selections to `grapesjs`. The dashboard and editor must send the revision returned by the backend for definition or launch-targeting writes.

## Deferred scope

Phases 3–7 remain out of scope: creating or deleting arbitrary blocks, layout editing, resizing, general image uploads, action configuration, complex styling, survey/checklist authoring, and additional multi-step orchestration. These should extend the on-site schema rather than introducing GrapesJS component trees into on-site experiences.
