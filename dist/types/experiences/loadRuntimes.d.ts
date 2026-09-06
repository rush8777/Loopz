import type { EditorRuntime, ExperienceRuntime } from "./runtimeInterfaces";
export declare function loadExperienceRuntime(overrideUrl?: string): Promise<ExperienceRuntime | null>;
export declare function loadEditorRuntime(overrideUrl?: string): Promise<EditorRuntime | null>;
