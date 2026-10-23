/** Native selection access for an editor shadow tree (no document scanning). */
export function editorSelection(root: ShadowRoot): Selection | null {
  return (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection();
}

export function editorRange(root: ShadowRoot): Range | null {
  const selection = editorSelection(root);
  if (!selection) return null;
  // WebKit can rescope getRangeAt() to the shadow host. Composed ranges retain
  // the actual text boundaries when the editor's root is explicitly supplied.
  const composed = selection as Selection & { getComposedRanges?: (options: { shadowRoots: ShadowRoot[] }) => StaticRange[] };
  if (composed.getComposedRanges) {
    try {
      const value = composed.getComposedRanges({ shadowRoots: [root] })[0];
      if (value && root.contains(value.startContainer) && root.contains(value.endContainer)) {
        const range = document.createRange(); range.setStart(value.startContainer, value.startOffset); range.setEnd(value.endContainer, value.endOffset); return range;
      }
    } catch { /* Older implementations expose only the ordinary selection API. */ }
  }
  return selection.rangeCount ? selection.getRangeAt(0) : null;
}

export function setEditorRange(root: ShadowRoot, range: Range): void {
  const selection = editorSelection(root); if (!selection) return;
  // WebKit ignores addRange() for some shadow-tree ranges after removeAllRanges().
  if (selection.setBaseAndExtent) selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
  else { selection.removeAllRanges(); selection.addRange(range); }
}
