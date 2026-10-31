/** One bounded transaction history for the complete draft, including AI and manual edits. */
export declare class EditorHistory<T> {
    private keyOf;
    private entries;
    private index;
    private coalescing;
    constructor(keyOf?: (value: T) => string);
    endGroup(): void;
    reset(value: T): void;
    record(value: T, coalesce?: boolean): void;
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): T | undefined;
    redo(): T | undefined;
}
