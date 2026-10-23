/** Native selection access for an editor shadow tree (no document scanning). */
export declare function editorSelection(root: ShadowRoot): Selection | null;
export declare function editorRange(root: ShadowRoot): Range | null;
export declare function setEditorRange(root: ShadowRoot, range: Range): void;
