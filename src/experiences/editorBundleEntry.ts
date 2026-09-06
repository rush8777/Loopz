import { EditorModeController } from "./editor/EditorModeController";
import type { EditorRuntime } from "./runtimeInterfaces";

const runtime: EditorRuntime = {
  createController: (apiBase) => new EditorModeController(apiBase),
};

window.__movcuesEditorRuntime__ = runtime;
