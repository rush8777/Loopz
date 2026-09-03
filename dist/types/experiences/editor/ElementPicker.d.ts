import type { ExperienceTarget } from "../types";
export declare class ElementPicker {
    private overlay;
    private generator;
    private resolve;
    private move;
    private click;
    private key;
    pick(): Promise<ExperienceTarget | null>;
    cancel(): void;
    private finish;
    private cleanup;
}
