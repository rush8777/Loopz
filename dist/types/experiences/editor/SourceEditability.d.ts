/** Portable contract mirrored verbatim in the backend; fixtures exercise both implementations. */
export declare const SOURCE_EDITABILITY: {
    readonly version: 1;
    readonly maxDepth: 8;
    readonly maxNodes: 120;
    readonly containers: readonly ["div", "section", "header"];
    readonly components: readonly ["h1", "h2", "h3", "h4", "p", "span", "label", "a", "ul", "ol", "button", "img", "hr"];
    readonly inline: readonly ["span", "strong", "em", "u", "a", "br", "ul", "ol", "li"];
    readonly operations: readonly ["select", "text", "style", "parent", "child", "move", "resize", "insert", "duplicate", "delete", "image", "action", "undo", "redo"];
    readonly identity: "Each layout has data-movcues-node-id; each atomic component has data-movcues-block-id. A component needs its own node ID unless it is the sole child of a layout wrapper with a node ID. IDs are unique across both namespaces. Inline formatting inside a component has no editing IDs. Containers contain components/layouts, not bare text. Root needs a node ID. Keep surviving IDs; new IDs are distinct from action/question/task IDs.";
    readonly protected: "Survey questions/controls and Checklist tasks/progress/copy/controls are atomic components: preserve their internal functional markup. Checklist root/views/items remain layout containers. Protected components can be styled; their structure, identity, order and parent cannot change through visual structural operations.";
    readonly styles: "Scoped static CSS and responsive @media are preserved. Element style edits follow an existing active responsive declaration; otherwise they affect the base style. Other breakpoints are preserved. Layouts may use flex or grid; sibling drag resizing requires flex. Grid containers retain their tracks; change layout using nested flex containers. No CSS nesting, pseudo-element content, reverse/dense/absolute/fixed layout or reordered visual items.";
};
export interface SourceElement {
    tag: string;
    attrs: Record<string, string>;
    text: string;
    children: SourceElement[];
}
export declare function sourceComponentKind(element: SourceElement): "layout" | "component" | "protected";
export declare function sourceEditabilityErrors(root: SourceElement, previous?: SourceElement, questions?: Array<{
    id: string;
    type: string;
    options?: Array<{
        id: string;
    }>;
    min?: number;
    max?: number;
    maxLength?: number;
    required?: boolean;
}>): string[];
