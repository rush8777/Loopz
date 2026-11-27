/** Shared editor-only chrome. Workflows own their controls and keep popup DOM mounted. */
export declare class EditorDock {
    readonly host: HTMLDivElement;
    readonly root: ShadowRoot;
    private frame;
    private bar;
    private popup;
    private opener;
    private observer;
    private exit;
    private modeMotion;
    constructor();
    mount(styles: string, controls: string, popups: string): void;
    get activePopup(): string | null;
    setMode(mode: string): void;
    show(id: string | null, opener?: HTMLElement): void;
    private onClick;
    private onKeyDown;
    private onOutsidePress;
    private fit;
    private measure;
    private reducedMotion;
    destroy(animate?: boolean): void;
}
export declare function dockPopup(id: string, label: string, body: string, mark?: string, role?: "region" | "dialog"): string;
export declare function dockTrigger(id: string, label: string, content: string, attrs?: string): string;
declare const glyphs: {
    readonly close: "<path d=\"m6 6 8 8m0-8-8 8\"/>";
    readonly more: "<circle cx=\"4\" cy=\"10\" r=\".9\"/><circle cx=\"10\" cy=\"10\" r=\".9\"/><circle cx=\"16\" cy=\"10\" r=\".9\"/>";
    readonly left: "<path d=\"m12 5-5 5 5 5\"/>";
    readonly right: "<path d=\"m8 5 5 5-5 5\"/>";
    readonly plus: "<path d=\"M10 5v10m-5-5h10\"/>";
    readonly edit: "<path d=\"m4 13-1 4 4-1L16 7l-3-3-9 9Zm7-7 3 3\"/>";
    readonly select: "<path d=\"m4 3 11 7-5 1.5L8 16 4 3Z\"/>";
    readonly navigate: "<path d=\"M6 10V5a1 1 0 0 1 2 0v4-6a1 1 0 1 1 2 0v6-5a1 1 0 0 1 2 0v5-3a1 1 0 0 1 2 0v6a5 5 0 0 1-5 5h-1c-2 0-3-2-5-5L2 10a1 1 0 0 1 1.5-1.2L6 11\"/>";
    readonly play: "<path d=\"M7 4.5 15 10l-8 5.5z\"/>";
    readonly undo: "<path d=\"M7 4 3 8l4 4M3 8h9a4 4 0 0 1 0 8\"/>";
    readonly restart: "<path d=\"M3 4v5h5M3.4 9a6.5 6.5 0 1 1 .4 4.5\"/>";
    readonly target: "<circle cx=\"10\" cy=\"10\" r=\"5.5\"/><path d=\"M10 2v4m0 8v4M2 10h4m8 0h4\"/>";
    readonly layers: "<path d=\"m3 7 7-4 7 4-7 4-7-4Zm0 4 7 4 7-4M3 15l7 4 7-4\"/>";
    readonly check: "<path d=\"m4 10 4 4 8-8\"/>";
    readonly spark: "<path d=\"M10 2a8 8 0 0 0 8 8 8 8 0 0 0-8 8 8 8 0 0 0-8-8 8 8 0 0 0 8-8Z\"/>";
};
export declare function dockIcon(name: keyof typeof glyphs): string;
export declare const geoDockMark = "<span class=\"dock-brand-mark\" aria-hidden=\"true\">\n  <svg class=\"dock-geo-cube\" viewBox=\"0 0 64 64\" focusable=\"false\">\n    <path fill=\"#add8f5\" d=\"M4.5 21c0-4 2-7 5.5-9l16.5-9.3a11 11 0 0 1 10.7 0L54 12c3.5 2 5.5 5 5.5 9v21.5c0 3.7-1.9 7-5.2 9l-16.9 9.7a11 11 0 0 1-10.8 0l-17-9.8a10.3 10.3 0 0 1-5.1-8.9Z\"/>\n    <path fill=\"#f8fbff\" d=\"M7 16.2c.8-1.6 2-2.9 3.7-3.8l15.8-9.7a11 11 0 0 1 10.7 0L54 12c1.8 1 3.2 2.3 4.1 4L33.6 30.2a3.2 3.2 0 0 1-3.2 0Z\"/>\n    <path fill=\"#fff\" d=\"M34.8 29.5 58 16.2c1 1.5 1.5 3 1.5 4.8v21.5c0 3.7-1.9 7-5.2 9l-16.9 9.7c-2.4 1.4-5.4-.3-5.4-3.1V34.4c0-2 1.1-3.9 2.8-4.9Z\"/>\n    <path fill=\"none\" stroke=\"#0b365f\" stroke-width=\"3.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M4.5 21c0-4 2-7 5.5-9l16.5-9.3a11 11 0 0 1 10.7 0L54 12c3.5 2 5.5 5 5.5 9v21.5c0 3.7-1.9 7-5.2 9l-16.9 9.7a11 11 0 0 1-10.8 0l-17-9.8a10.3 10.3 0 0 1-5.1-8.9ZM6.1 16l23.4 13.7c1.5.9 3.4.9 5 0L57.9 16M32 31v26.1c0 2.6 1.2 4.4 3.1 4.7\"/>\n    <g class=\"dock-geo-gaze\" fill=\"#0b365f\">\n      <ellipse cx=\"40\" cy=\"39.4\" rx=\"2.1\" ry=\"2.8\" transform=\"rotate(23 40 39.4)\"/>\n      <ellipse cx=\"50.8\" cy=\"34.1\" rx=\"2.1\" ry=\"2.8\" transform=\"rotate(23 50.8 34.1)\"/>\n    </g>\n  </svg>\n</span>";
export {};
