# On-site builder UX hardening — Phases 6 and 7

Branch: `codex/onsite-builder-ux-hardening`. No merge or deployment.

## Verified baselines

| Repository | `codex/onsite-builder-cell-composition` head |
|---|---|
| SDK / Loopz | `5af73f65e0066a48dfdcb017c6be233284f3b814` |
| Frontend | `c8d78189fff568aec16b7eafd6ba605955179231` |
| Backend | `7f77b5a6946dda7165cd2cd2d2817b38f29b4d1b` |

Local baseline trees were checked against the GitHub commit trees before editing. Corresponding feature branches were created in all three repositories. No AGENTS.md or runtime-positioning protection skill was available in the repositories or installed skills; the requested runtime restrictions were applied directly.

## Changes

- Split the existing editor shell into a compact floating mode/history/save/close bar, contextual inspector and separate Guide step dock. Guide management is in the Step inspector. Connection diagnostics collapse into a disclosure. Target mode exposes the dedicated page picker. The inspector can be hidden independently.
- Keep element controls outside the widget, bounded by both the inspector and floating controls, including mobile bottom-sheet layouts and a dragged toolbar after viewport shrink. The element bar remains at most 250 px wide.
- Add visible insertion buttons to empty cells. Preserve the existing image placeholder, file picker, file drop, validation and bounded image persistence.
- Move existing cell subtrees with the Move grip by native drag/drop, or activate Move and Tab to a destination cell, then press Enter. Escape cancels. Occupied destinations accept the moved cell as a sibling; empty destinations contain it. Existing cell, block and action IDs survive. Descendant/cycle destinations are rejected. Existing four-direction insertion and sibling move buttons remain.
- Preserve partial text selections when using formatting controls, format without replacing the widget, paste text as plain text, and support Ctrl/Cmd+B/I/U and Ctrl/Cmd+Z/Shift+Z. Alt+Up/Down reorders selected cells; Ctrl/Cmd+Up/Down selects parent/child cells. Resize handles retain keyboard focus after each arrow adjustment.
- Capture pending typing before structural edits or immediate undo. Block structural writes during IME composition or invalid text. Reject over-depth/invalid structural changes before saving, with rollback and a concise error. Invalid long text stays visible until corrected or explicitly undone.
- Cache unchanged compilation state, deduplicate history snapshots and avoid no-op structural saves. Toolbar and resize pointer updates use requestAnimationFrame. Cancel unfinished resize listeners/frames on pointer cancellation or destruction without a late save.
- Fix anchored backdrop locks: release while the spotlight is hidden, reacquire when visible, allow shadow-root input keys and nested scrolling, and restore previous root/body overflow values and priorities. Zero-size targets hide the card and spotlight. Backdrop behavior remains opt-in.
- Update dashboard builder capability copy and label the mobile editor launch action “Edit.” Add dashboard regressions for failed pre-launch saves and reviewing the latest live-editor revision.
- Add backend integration coverage for creating an on-site Guide, exchanging an editor token, nested splitting/resizing/reordering, inline images and independent actions, draft save/reload, stale-revision rejection, settings-only writes and publish.

## Runtime boundaries

The cell schema, compiler, production widget markup and builder-selection lock are unchanged. AnchoredCardRenderer only adds a zero-size visibility guard; natural coordinates, placement stability, vertical scroll behavior, horizontal clamping and pointer calculations remain unchanged. LayerManager, StackingContextResolver, WidgetSizing and HotspotRenderer are unchanged. No page-wide observers or framework dependencies were added. Initial delayed targets use the existing bounded target waiter.

Editor code remains lazy-loaded and absent from the visitor core/runtime artifacts. No full widget remount is introduced during typing or inline formatting. Existing immutable reviewed-revision publishing and atomic compilation contracts remain enforced.

## Bundle comparison

Committed production artifacts, gzip level 9, bytes:

| Artifact | Baseline | After | Change |
|---|---:|---:|---:|
| `sdk.min.js` | 18,203 | 18,203 | 0 |
| `sdk-experiences.min.js` | 18,073 | 18,224 | +151 (+0.84%) |
| `sdk-editor.min.js` | 52,814 | 55,972 | +3,158 (+5.98%) |

The visitor core is byte-identical. The runtime increase covers backdrop/visibility fixes. The editor increase is confined to the lazy editor and covers movement, selection/history reliability and shell refinements.

## Verification

- SDK: 322/322 tests; production TypeScript and all bundle builds passed.
- Chromium: 39/39 browser tests passed. Coverage includes legacy caret/composition, nested cell persistence, directional insertion, native cross-cell drag, keyboard destination movement, file selection/drop and undo/reopen, Guide add/edit/next/back/reopen, delayed targets, save failure/retry/conflict/export, sticky header scrolling, opt-in spotlight interaction/dismissal/scroll restoration, visitor action dispatch and 320/360/390 px controls with the inspector open.
- Frontend dashboard production build passed. Focused integration tests: 6/6 passed. Full suite: 273 passed, 14 failed; the same 14 test names fail on the unchanged baseline.
- Backend production build passed. Focused integration/contract tests: 26/26 passed. Full suite: 484 passed, 7 failed, 22 skipped; the same seven test names fail on the unchanged baseline.
- Existing assertions remain. One browser assertion now excludes the fixture's fake editor toolbar after reload while explicitly checking that no real editor host or floating controls remain. The mixed-runtime Guide test supplies realistic target geometry for visibility checks.

Chromium 153 was supplied as a temporary test dependency outside the repository. No project dependency was added. Firefox, WebKit and physical mobile browsers were not available for execution.

## Remaining risks and limits

- Existing frontend failures concern older dashboard Guide/Survey controls, navigation expectations, an invitation field and a funnel assertion. Backend failures concern auth atomicity/concurrency, database migration and tenant/usage tests. They were reproduced before changes; this branch does not resolve those separate issues.
- Browser authoring tests mock exchange/draft HTTP responses. Backend integration tests independently exercise real routes and publishing. This does not certify a deployed Railway/Cloudflare environment or a third-party customer application's CSP.
- Undo/redo remains scoped to the currently mounted step/editor. It is not cross-step history, and switching editor modes recreates that history.
- The existing initial target wait is bounded to five seconds. A later target or replacement node may require re-entering the mode or reselecting the target. No persistent document-wide observer was added.
- Local raster files still use the existing compressed inline format (10 MB input, up to 1,280 px longest edge and 65,536 encoded characters; whole document 250,000 bytes). This is not an asset-storage service.

## Pull locally

In each checkout, with a clean worktree:

```sh
git fetch origin
git switch --track origin/codex/onsite-builder-ux-hardening
```

If the local branch already exists, use `git switch codex/onsite-builder-ux-hardening` and `git pull --ff-only` instead. The baseline branch and main are untouched.
