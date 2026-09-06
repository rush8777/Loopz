import { loadSdkBundle, sdkBundleUrl } from "../core/sdkBundleLoader";
import type { EditorRuntime, ExperienceRuntime } from "./runtimeInterfaces";

export function loadExperienceRuntime(overrideUrl?: string): Promise<ExperienceRuntime | null> {
  return loadSdkBundle(
    sdkBundleUrl("experiences", overrideUrl),
    () => window.__movcuesExperienceRuntime__,
    "experience runtime"
  );
}

export function loadEditorRuntime(overrideUrl?: string): Promise<EditorRuntime | null> {
  return loadSdkBundle(
    sdkBundleUrl("editor", overrideUrl),
    () => window.__movcuesEditorRuntime__,
    "experience editor"
  );
}
