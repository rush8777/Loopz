# Full-source live editing — implementation and verification

## Result and root cause

Validated AI `replace_markup` designs retain canonical source HTML/CSS and become manually editable through the existing live editor. Apply restores Design mode without closing/reopening the builder. No frontend implementation changes, database migrations, main-branch merges, or deployments were performed.

The former `EditorModeController.attachContentEditor()` explicitly detached visual editing for source-authored builders. The structured composition editor also regenerated HTML/CSS from `OnsiteDocument`, so simply removing that guard would have overwritten source designs. Separate AI histories could take priority over later manual edits, and AI responses previously captured the edit generation on arrival rather than request start.

## Baselines

| Repository | Baseline branch | Exact baseline |
| --- | --- | --- |
| SDK `rush8777/Loopz` | `codex/full-source-editing` | `16e0cfb4808864346dbeb81d450d506f20fd8fd1` |
| Backend `rush8777/Loopz-Backend` | `codex/full-source-editing` | `84cc18a42f22cabae892e0f46d0c22dc43784207` |
| Frontend `rush8777/Loopz-Frontend` | `codex/onsite-builder-ai-checklists` | `707223945bb5afda08c3817570d8031a483c1c6a` |

Remote heads matched these baselines on initial inspection and recovery. Implementation branch: `codex/full-source-live-editing` in SDK and backend only.

## Architecture and reuse

- `SourceDocumentAdapter` supplies an ephemeral composition/inspector view of source elements. It writes controlled transformations back to the canonical DOM and parsed CSS; it never persists this view as the structured recovery document.
- `OnsiteCompositionEditor` retains selection, highlighting, floating toolbar, inspector, palettes, keyboard commands, inline formatting, image/file handling, drag movement, resizing, and transaction callbacks. Existing structured compilers still handle structured builders and create new supported blocks; existing source markup is not recompiled into that schema.
- `SourceStyles` uses PostCSS to preserve untouched declarations, comments and responsive rules. An isolated declaration is edited directly when safe; otherwise a bounded element-specific rule is reused. Existing active breakpoint declarations are edited in their breakpoint. Removed element-specific rules are pruned without removing shared styles.
- `EditorHistory` replaces the four controller AI undo stacks with one bounded whole-draft history for AI, source/manual operations and canonical settings. Typing coalesces into a transaction, and selection/step metadata returns with undo/redo. The composition editor retains a single rollback checkpoint when history is delegated.
- Apply preserves the current location, reattaches the proper storage adapter, reconciles the selected block to its current owner, and falls back to root selection when the element no longer exists.
- Request generation/selection are captured before awaiting AI, so edits made while a request is running invalidate its proposal. Fresh canonical HTML/CSS is saved and sent on subsequent requests.
- Survey/Checklist inspectors retain canonical labels, input settings and action configuration. Source-safe step duplication remaps canonical Survey references without converting the design. Settings refresh no longer recompiles source from its structured recovery document.

These are storage, validation and history extensions; there is no second visual editor or new page-builder framework. PostCSS is the only added direct SDK dependency and stays within the lazy editor bundle.

## AI prompt, metadata and validation

The existing backend system prompt embeds the versioned `SOURCE_EDITABILITY` contract directly. The same portable contract is mirrored verbatim in the SDK, is used by the adapter/validators, and is exercised with a shared fixture. Contract and fixture equality were checked during finalization.

The contract requires a single widget root with a node ID; layout and atomic component identities; unique IDs separate from action/question/task IDs; supported nesting; scoped static CSS; complete action bindings; and preserved canonical protected references. Components need their own node ID or a dedicated layout wrapper, so editor selection does not add identities that unexpectedly activate CSS selectors.

New source metadata uses `sourceEditabilityVersion: 1` alongside the existing `authoringSurface`, `sourceVersion`, and `actionBindings`. Existing `data-movcues-*` attributes remain the contract. No editor/vendor-specific persisted attribute namespace or global widget migration was introduced.

Invalid proposals return precise errors into the existing server validation-feedback retry loop. Legacy source context probes remain compatible, while new generated proposals must satisfy editability. All six Survey question types validate canonical inputs/options; answer-option buttons are distinct from ordinary action buttons. Protected markers cannot be used to bypass ordinary button bindings.

## Supported manual operations

- Click selection, parent/child navigation, native text editing (including line breaks), inline formatting and links.
- Existing typography, colors, backgrounds, borders, spacing and alignment controls.
- Ordinary element insertion, duplication, removal, reordering and cross-parent movement with preserved surviving identities.
- Text, heading, image, button, icon, divider, spacer and layout elements using the existing palette/compiler helpers.
- Image URL, alt text, fitting/sizing and file operations; ordinary button labels and supported action configuration.
- Container sizing, flex sibling resize handles, responsive stacking and preservation of unrelated breakpoint rules.
- Atomic AI Apply, manual transactions, undo/redo, saving/reopening, and subsequent AI/manual edits.
- Protected Survey/Checklist styling, canonical question labels/required/input settings and choice text with stable answer IDs, Survey branching/settings, Checklist text and task actions/completion configuration.

## Explicit limits and compatibility

Source editing is deliberately validated against a supported contract; arbitrary safe HTML alone does not imply editability. Limits include 120 components/layouts and eight levels. Unsupported CSS includes imports/resource URLs, script-like declarations, transitions/animations, CSS nesting, ID selectors, pseudo-elements, absolute/fixed positioning, reverse/dense layouts and explicit visual reordering.

Flex siblings expose drag resize handles. Grid tracks remain intact; the existing inspector can size elements/containers, and nested flex layouts can be inserted, but there is no grid-track drag editor.

Protected components cannot be deleted, duplicated or moved in ways that break their canonical structure. Source Survey type/rating-range changes and Checklist task-list structural mutations are disabled with explanations. Choice text/input settings can change while canonical answer identities remain stable. Composed labels that cannot be changed safely through a plain label field return a specific diagnostic; native ordinary button text editing preserves its inline markup.

Older source designs receive identity-only upgrades only when validation and selector matching establish compatibility. Unsupported legacy designs retain their original source and a clear editing limitation. Existing structured widgets keep their storage representation and editing path.

## Verification

| Check | Result |
| --- | --- |
| Full SDK unit/controller suite | **429 passed**, 50 files; 15-second integration test timeout, two workers |
| Full backend suite | **590 passed**, **22 existing skips**, 73 files |
| Full Chromium browser suite | **59 passed**; Guide, Survey, Checklist and source lifecycle coverage |
| Recovered final focused SDK suite | **49 passed**; source operations/protected components/controller cases |
| Recovered final Chromium checks | **3 passed**; AI/manual/save/reopen, immediate typing undo, insertion/resize undo/redo |
| SDK production build and declarations | Passed after recovery |
| Backend production build | Passed after recovery |
| SDK/backend contract, CSS restriction and shared fixture parity | Passed |
| Final Checklist identity guard regressions | **11 SDK tests passed**, **22 backend tests passed**; invented task IDs and invalid task semantics are rejected |
| Frontend source diff | Empty; no implementation branch created |

The source browser workflow covers manual edit → AI preview/apply → manual text/style/sizing/reordering/image insertion → save/reopen → second AI Apply → manual edit → undo/redo. It includes native line breaks. AI responses are deterministic mocked proposals; no live paid model call was required.

Earlier full runs exposed three baseline SDK failures and two backend timeouts under concurrent load. Subsequent full runs above passed. Firefox and WebKit attempts were blocked before functional execution by missing host libraries; dependency installation was unavailable in that environment. Cross-browser source behavior is therefore not claimed as verified.

Generated bundles were rebuilt through the repository scripts. Obsolete hashed ESM chunks were pruned according to the current entry-point dependency graph; generated JavaScript was not hand-edited.

### Gzip bundle sizes (bytes, Python gzip level 9)

| Bundle | Baseline | Final |
| --- | ---: | ---: |
| `sdk.min.js` | 18,143 | 18,143 |
| `sdk-experiences.min.js` | 20,481 | 20,481 |
| `sdk-editor.min.js` | 99,143 | 127,920 |

The parser and source adapter increase the editor payload. Core and visitor runtime minified bundle bytes remain unchanged; editor loading remains lazy.

## Source commits

Recovery preserved source files but workspace maintenance had removed the previous shared Git metadata. Independent repositories were restored against the exact baselines, so implementation commits have new SHAs. The earlier local checkpoint SHAs were not published.

### SDK

```text
c88f18afbb20524efc2b62d9b3add05abeda9889 Restore visual editing after AI apply and unify transaction history
99b67da505cc786ae09abcee0cbee1a4b32e4917 Reuse live composition controls for source DOM and CSS transactions
04147994f32b7962c7c996f2f170f35ff9a7d7f0 Define versioned source editability and validation contracts
```

### Backend

```text
6ec7e72d41d6b9679dac020aaeaa27f51208e6ec Validate visually editable AI source proposals and canonical protected controls
```

Publication uses the authenticated GitHub connection; all remote Git trees were compared with the locally verified trees. A subsequent verification/build commit contains this report and regenerated bundles. Use each implementation branch head for the complete deliverable.

The final backend validation commit is `3f5afba2718c65043556bca73252077b554fc656`.

## Changed files

### SDK

- `dist/EditorModeController-K-g1WsfW.js`
- `dist/EditorModeController-K-g1WsfW.js.map`
- `dist/EditorModeController-gwSUMVjO.js`
- `dist/EditorModeController-gwSUMVjO.js.map`
- `dist/module-2XlES8XH.js`
- `dist/module-2XlES8XH.js.map`
- `dist/module-DwdVEahU.js`
- `dist/module-DwdVEahU.js.map`
- `dist/sdk-editor.js`
- `dist/sdk-editor.js.map`
- `dist/sdk-editor.min.js`
- `dist/sdk-experiences.js.map`
- `dist/sdk.esm.js`
- `dist/sdk.js.map`
- `dist/types/experiences/editor/EditorHistory.d.ts`
- `dist/types/experiences/editor/EditorModeController.d.ts`
- `dist/types/experiences/editor/OnsiteCompositionEditor.d.ts`
- `dist/types/experiences/editor/SourceAuthoring.d.ts`
- `dist/types/experiences/editor/SourceDocumentAdapter.d.ts`
- `dist/types/experiences/editor/SourceEditability.d.ts`
- `dist/types/experiences/editor/SourceStyles.d.ts`
- `dist/types/experiences/editor/SurveyEditor.d.ts`
- `docs/full-source-live-editing-report.md`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `src/experiences/editor/AiEditing.ts`
- `src/experiences/editor/ChecklistEditor.ts`
- `src/experiences/editor/EditorHistory.ts`
- `src/experiences/editor/EditorModeController.ts`
- `src/experiences/editor/OnsiteCompositionEditor.ts`
- `src/experiences/editor/SourceAuthoring.ts`
- `src/experiences/editor/SourceDocumentAdapter.ts`
- `src/experiences/editor/SourceEditability.ts`
- `src/experiences/editor/SourceStyles.ts`
- `src/experiences/editor/SurveyAiEditing.ts`
- `src/experiences/editor/SurveyEditing.ts`
- `src/experiences/editor/SurveyEditor.ts`
- `tests/AiEditing.test.ts`
- `tests/EditorLiveController.test.ts`
- `tests/SourceAuthoring.test.ts`
- `tests/SourceDocumentAdapter.test.ts`
- `tests/SourceProtected.test.ts`
- `tests/browser/source-live-editing.spec.ts`
- `tests/fixtures/source-editability.json`

### Backend

- `dist/lib/ai/editor.js`
- `dist/lib/ai/editor.js.map`
- `dist/lib/experiences/onsiteDocument.js`
- `dist/lib/experiences/onsiteDocument.js.map`
- `dist/lib/experiences/sourceEditability.js`
- `dist/lib/experiences/sourceEditability.js.map`
- `dist/lib/experiences/sourceMarkup.js`
- `dist/lib/experiences/sourceMarkup.js.map`
- `dist/lib/experiences/sourceStyles.js`
- `dist/lib/experiences/sourceStyles.js.map`
- `dist/routes/public-experiences.js`
- `dist/routes/public-experiences.js.map`
- `src/lib/ai/editor.ts`
- `src/lib/experiences/onsiteDocument.ts`
- `src/lib/experiences/sourceEditability.ts`
- `src/lib/experiences/sourceMarkup.ts`
- `src/lib/experiences/sourceStyles.ts`
- `src/routes/public-experiences.ts`
- `tests/editorAiRoute.test.ts`
- `tests/fixtures/source-editability.json`
- `tests/sourceEditability.test.ts`

### Frontend

No tracked changes.
