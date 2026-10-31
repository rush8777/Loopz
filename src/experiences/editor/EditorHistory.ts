/** One bounded transaction history for the complete draft, including AI and manual edits. */
export class EditorHistory<T> {
  private entries: Array<{ value: T; key: string }> = [];
  private index = -1;
  private coalescing = false;
  constructor(private keyOf: (value: T) => string = JSON.stringify) {}
  endGroup(): void { this.coalescing = false; }
  reset(value: T): void { this.coalescing = false; this.entries = []; this.index = -1; this.record(value); }
  record(value: T, coalesce = false): void {
    const key = this.keyOf(value);
    if (this.entries[this.index]?.key === key) { this.entries[this.index].value = structuredClone(value); if (!coalesce) this.coalescing = false; return; }
    if (coalesce && this.coalescing && this.index > 0 && this.index === this.entries.length - 1) { this.entries[this.index] = { value: structuredClone(value), key }; return; }
    this.coalescing = coalesce;
    this.entries.splice(this.index + 1);
    this.entries.push({ value: structuredClone(value), key });
    while (this.entries.length > 50 || this.entries.length > 1 && this.entries.reduce((bytes, entry) => bytes + entry.key.length * 2, 0) > 8_000_000) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  canUndo(): boolean { return this.index > 0; }
  canRedo(): boolean { return this.index >= 0 && this.index < this.entries.length - 1; }
  undo(): T | undefined { this.coalescing = false; return this.canUndo() ? structuredClone(this.entries[--this.index].value) : undefined; }
  redo(): T | undefined { this.coalescing = false; return this.canRedo() ? structuredClone(this.entries[++this.index].value) : undefined; }
}
