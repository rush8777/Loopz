export declare class EditorModeController {
    private apiBase;
    private host;
    private picker;
    private expiryTimer;
    private validationTimer;
    private preview;
    constructor(apiBase: string);
    start(rawToken: string): Promise<boolean>;
    private mount;
    private setTarget;
    destroy(): void;
}
