# Phase 11 templates and design system verification

## Scope

Phase 11 adds a bundled, server-owned template registry; the dashboard template gallery; shared experience themes; site-scoped reusable styles; and widget-only Desktop, Tablet, and Mobile preview controls. Templates are instantiated through the existing validated creation, compilation, review, and publishing paths. The existing on-site cell editors and production renderers remain the authoring and delivery engines.

The implementation started from the requested heads: SDK `946955e`, Frontend `545c337`, and Backend `1d0abfd`. The Frontend and Backend retain the newer Movcues AI integration. Gemini, Vertex AI, and OpenAI provider sources were not changed.

## Bundled catalog

| Category | Templates |
| --- | --- |
| Widgets | Welcome modal; Feature announcement; Upgrade slideout; Contextual feature tooltip; Notification toast |
| Guides | New-user onboarding; Feature discovery walkthrough; Multi-step product tour |
| Surveys | Customer satisfaction; NPS feedback; Feature feedback |
| Checklists | Getting started; Account setup; Product activation |

Each instantiation generates fresh document, cell, block, action, step, question, option, and Checklist item IDs. Widget and Guide documents remain schema v2, Surveys remain v3, and Checklists remain v4. Survey questions and Checklist items stay canonical and cells retain references only.

## Contracts and storage

- `GET /orgs/:orgId/sites/:siteId/experience-templates` returns the relevant bundled catalog, available visual presets, and whether the site has captured theme tokens.
- The existing experience creation endpoint accepts a registered template ID plus `template`, `site`, or predefined-preset theme selection. The backend rejects category mismatches and still applies the existing entitlements, ownership, schema, compiler, and publish validation.
- Experience definitions may store `template: { id, version }` and `visualTheme`, while the resolved `SiteThemeTokens` continue through the existing `design.theme.siteTheme` renderer contract.
- Migration `0038_site_style_presets.sql` adds site-scoped visual-only presets. Authenticated dashboard and live-editor-session routes support list, save, rename, and delete with site checks and a 20-preset limit.

## Theme inheritance

The effective order is:

1. Template tokens.
2. The selected template, captured site, saved style, or Minimal/Modern/Soft/Dark base.
3. Experience-level color, typography, radius, button, shadow, and spacing overrides.
4. Existing explicit cell and block styles.

Changing a base keeps experience overrides. **Reset to theme** clears only level 3, leaving authored cell and block values intact. Changes update the draft and live preview; reviewed and published versions are not rewritten.

## Compatibility and runtime protection

- GrapesJS creation and stored definitions remain supported and are not migrated.
- Templates become normal editable on-site experiences and use the current toolbar, inspector, cell engine, step docks, Checklist states, undo/redo, autosave, recovery, and isolated preview behavior.
- Template gallery code stays in the dashboard. Theme editing stays in the existing lazy editor chunk. Visitor runtime does not fetch the catalog.
- `LayerManager`, `StackingContextResolver`, `WidgetSizing`, `HotspotRenderer`, and `AnchoredTargetBackdrop` were unchanged. `AnchoredCardRenderer` and `ChecklistRenderer` only received visual CSS variables; positioning, clamping, natural scrolling, stacking, pointer alignment, and cleanup logic were not changed.
- Responsive compiled CSS retains narrow row stacking, fixed-cell clamping, image scaling, button touch height, Checklist bounds, and Survey layout behavior. The device control is explicitly labeled as a widget preview and never resizes the customer page.

## Verification

| Area | Result |
| --- | --- |
| SDK unit/integration | 43 files, 382 tests passed |
| Frontend unit/integration | 45 files, 303 tests passed |
| Backend unit/integration | 65 files passed, 550 tests passed; 3 files/22 environment tests remain intentionally skipped |
| Template regression | All 14 templates instantiated and schema/ID/reference validation passed |
| Real services | 3/3 workflow projects passed; each used the actual dashboard, backend, temporary database, and SDK services to create and publish Widget, Guide, Survey, and Checklist templates |
| Builds | SDK, Frontend, and Backend production builds passed |
| Movcues AI | Existing backend AI/provider tests passed; provider sources unchanged |
| Browser suite | The suite was invoked for Chromium, Firefox, and WebKit, but all projects were blocked before test execution because this runner contains no Playwright browser executables. A pinned-browser install was attempted and the network proxy returned empty archives. No browser assertion failed. |

The real-service template workflow is browser-independent and passed under all three Playwright project configurations. The existing interactive cross-browser suite should be rerun in CI or a workstation with Playwright browsers installed.

## Bundle sizes

Exact gzip-9 byte counts:

| Bundle | Phase 10 baseline | Phase 11 | Difference |
| --- | ---: | ---: | ---: |
| Visitor `sdk.min.js` | 18,203 B | 18,136 B | -67 B |
| Experience runtime `sdk-experiences.min.js` | 19,983 B | 20,370 B | +387 B |
| Lazy editor `sdk-editor.min.js` | 78,161 B | 82,472 B | +4,311 B |

No editor module entered the visitor bundle. The runtime increase contains theme variable application; the gallery and registry are absent from visitor delivery.

## Remaining limitations

- Device buttons simulate the widget width only. They deliberately do not emulate or resize the host website viewport.
- Bundled thumbnails are lightweight CSS representations, not remote screenshots.
- Style presets store visual tokens only. Per-cell structural spacing remains part of the cell document and is intentionally not replaced when a theme changes.
- Interactive Chromium, Firefox, and WebKit execution remains an environment follow-up because browser binaries could not be downloaded in this runner.
