# On-site Visual Builder 2.0: cell composition

## Architecture

Schema version 2 keeps the existing `WidgetBuilderState` envelope and stores the authoring source at `projectData.movcues.onsiteDocument`. The document is a strict tree of cells. A container cell has ordered child cells; a leaf cell may have one block. A cell cannot contain children and a block at the same time.

`OnsiteDocument.ts` owns the schema, validation, tree operations, v1 migration, deterministic compiler, compatibility projection, and action-binding compilation. `OnsiteCompositionEditor.ts` is imported only from the authenticated editor entry. It provides selection, contextual tools, direct editing, history, resizing, and scoped DOM updates. Visitor bundles receive compiled HTML/CSS plus a validated `actionBindings` map and never reconstruct or traverse the authoring tree.

Atomic authoring writes contain all four related views of the same state:

- The structured v2 document.
- Deterministically compiled, `.movcues-widget`-scoped HTML and CSS.
- The compatibility `ExperienceContent` projection used by older runtime paths.
- A stable action-ID lookup map used by the visitor runtime.

The backend recompiles the document and rejects a write when any compiled view differs.

## Implemented milestones

1. **Model and compiler**: versioned nested cells, seven block types, stable document/cell/block/action IDs, safe rich text, controlled styles, responsive compilation, strict validation, and a v1 adapter.
2. **Workspace**: compact movable inspector, Design/Target/Navigate/Preview modes, global undo/redo, save state, contextual step/cell/block panels, on-widget tools, selectable breadcrumb, and a separate Guide step bar.
3. **Blocks**: Heading, Text, Button, Image, Divider, Spacer, and controlled Icon blocks with insertion, replacement confirmation, selection, duplication, removal, movement, inline editing, rich formatting, and history.
4. **Cells**: nested row/column splitting, content preservation, full-width/full-height edge insertion, Flexible/Hug/Fixed sizing, alignment, padding, gap, background, border, responsive stacking, sibling ordering, and pointer/keyboard resize.
5. **Styling**: typography, line height, text color/alignment, safe links/lists, button variants/colors/padding/radius/width, image source/alt/fit/width/radius, divider, spacer, icon, and cell styles.
6. **Interactions and Guides**: stable per-button actions for next, previous, dismiss, HTTP(S) URL, and custom event; exact-once dispatch; Modal/Anchored step add, select, duplicate, rename, reorder, delete, and editor-only navigation preview.
7. **Reliability**: bounded 50-entry/2 MB history, IME-aware flush, debounced compilation/autosave integration, one resize transaction per gesture, conflict/retry/export recovery, step-change/preview/close flushes, and deterministic persistence.

## Validation limits

| Limit | Value |
|---|---:|
| Nesting depth | 8 |
| Total cells | 120 |
| Rich text per block | 10,000 characters |
| Image URL | 2,000 characters |
| Serialized document | 250,000 bytes |
| Fixed cell size | 24–1,200 px |
| Gap | 0–96 px |
| Cell padding | 0–128 px |

Validation also enforces exact allowed fields, unique IDs across every node and action, acyclic/non-reused object references, the leaf/container invariant, finite bounded numbers, safe colors, approved rich-text tags and attributes, safe link/image schemes, and controlled icons. The backend rejects script/event-handler content, iframe/embed blocks, unscoped CSS, external CSS imports, and compiled-state mismatches.

## Migration and compatibility

Only builders explicitly shaped like the existing v1 on-site surface are migrated. The adapter preserves supported heading/body rich text, images, buttons/actions, alignment classes, and Guide associations, then compiles them as v2. If meaningful unknown markup remains, migration returns no result and the editor retains the original v1 content through the compatibility editor. GrapesJS project data is never routed through this adapter, and the permanent `builderMode` lock remains server-enforced.

Version 2 permits genuinely empty heading/body compatibility fields. They are derived from actual authored blocks and never filled with hidden placeholders. Legacy v1 and GrapesJS validation continues to require the former structured content rules.

Legacy `primary` and `secondary` action markers remain supported. Version 2 buttons use independent stable action IDs. The compiler writes an exact action lookup map, the backend verifies it against the tree, and the visitor runtime performs an O(1) lookup before dispatch. Next/previous actions are accepted only in Guides.

## Runtime and responsive behavior

The visitor SDK contains no composition editor, block palette, resize, selection, or history module. Layout is emitted as ordinary flexbox cells. Narrow layouts can stack at 480 px, fixed cells are capped to their parent width, images remain within their cells, and buttons keep a usable minimum height. These rules live inside the existing widget envelope and do not alter anchored placement, viewport clamping, scroll following, pointers, occlusion, layer policy, stacking-context resolution, hotspots, or widget sizing.

## Verification

- SDK unit/integration suite: 290/290 passed.
- Focused structured document and live editor suite: 27/27 passed.
- SDK TypeScript build and all production bundles: passed.
- Playwright discovery: 51 tests found across Chromium, Firefox, and WebKit.
- Playwright execution: unavailable in the build workspace because browser executables are not installed.
- Protected positioning/layering source files remained unchanged: `AnchoredCardRenderer`, `WidgetSizing`, `HotspotRenderer`, `LayerManager`, and `StackingContextResolver`.

Gzip sizes, measured with `gzip -9`, changed from 18,125 to 18,136 bytes for `sdk.min.js`, 16,678 to 17,099 bytes for `sdk-experiences.min.js`, and 31,376 to 47,569 bytes for `sdk-editor.min.js`. Editor symbols occur only in the editor artifact. The visitor increase is the small stable-action dispatch path.

## Deferred scope

Survey question authoring, answer branching, conditional workflows, arbitrary HTML/CSS/JavaScript, iframe blocks, media upload infrastructure, advanced animations, themes/templates, and AI generation remain outside this milestone.

## Directional insertion follow-up (2026-10-22)

Select a cell or block and use one of its four small edge `+` buttons to choose a block. Left/right insert beside the selected cell; above/below insert vertically. The editor reuses a matching parent axis or wraps only the selected cell, preserving unrelated full-width rows, existing content IDs, and the outer sizing allocation. The new block is selected immediately. Insertion is one undoable/autosaved operation, and documents exceeding the nesting limit are rejected before mutation.

The compact SVG element toolbar stays outside the whole widget, with automatic edge fallback and viewport bounds. The chooser dismisses on Escape/outside click. Resize controls remain available after insertion on either side. All authoring controls remain in the lazy editor bundle and are absent from serialized content. No schema, backend, or production renderer changes are required.

Verification: 308/308 SDK tests, TypeScript and production builds, and 13/13 focused Chromium tests passed. Browser coverage includes nested directional insertion, immediate resize, undo/redo, save/reload, chooser keyboard cancellation, exterior toolbar placement, and 320/360/390 px layouts. Chromium 153 was provided by a temporary test dependency because the standard browser download failed; no dependency was added to the project. Firefox and WebKit were not run for this follow-up.
