/**
 * Safe wrapper around localStorage/sessionStorage.
 * Some browsers throw in private mode / sandboxed iframes - never let
 * storage access break the host website.
 */
declare class SafeStorage {
    private area;
    constructor(area: "localStorage" | "sessionStorage");
    private get store();
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}
export declare const localStore: SafeStorage;
export declare const sessionStore: SafeStorage;
export {};
