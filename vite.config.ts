import { defineConfig } from "vite";
import { resolve } from "path";

type BundleKind = "core" | "experiences" | "editor" | "replay" | "heatmap" | "module" | "v1";

/**
 * Every CDN target is built as its own single-entry IIFE. The first
 * (production/core) invocation cleans dist; subsequent modes preserve only
 * artifacts produced during that same npm run build sequence.
 */
export default defineConfig(({ mode }) => {
  const kind: BundleKind =
    mode === "module" ? "module" :
    mode === "v1" ? "v1" :
    mode.startsWith("experiences") ? "experiences" :
    mode.startsWith("editor") ? "editor" :
    mode.startsWith("replay") ? "replay" :
    mode.startsWith("heatmap") ? "heatmap" :
    "core";

  const minify = mode.endsWith("minify") || kind === "v1";
  const entry: Record<BundleKind, string> = {
    core: "src/index.ts",
    v1: "src/index.ts",
    experiences: "src/experiences/runtimeBundleEntry.ts",
    editor: "src/experiences/editorBundleEntry.ts",
    replay: "src/session/replayBundleEntry.ts",
    heatmap: "src/heatmaps/snapshotBundleEntry.ts",
    module: "src/module.ts",
  };
  const globalName: Record<Exclude<BundleKind, "module">, string> = {
    core: "AutocaptureAnalyticsSDK",
    v1: "AutocaptureAnalyticsSDK",
    experiences: "MovcuesExperienceRuntimeBundle",
    editor: "MovcuesEditorRuntimeBundle",
    replay: "AutocaptureAnalyticsSDKReplay",
    heatmap: "LoopzHeatmapSnapshot",
  };
  const baseName: Record<Exclude<BundleKind, "module" | "v1">, string> = {
    core: "sdk",
    experiences: "sdk-experiences",
    editor: "sdk-editor",
    replay: "sdk-replay",
    heatmap: "sdk-heatmap",
  };

  const fileName = kind === "module"
    ? "sdk.esm.js"
    : kind === "v1"
      ? "v1.js"
      : `${baseName[kind]}${minify ? ".min" : ""}.js`;

  return {
    build: {
      // `vite build` uses mode=production and is deliberately first in the
      // package script. This removes stale hashed chunks exactly once.
      emptyOutDir: mode === "production",
      minify: minify ? "terser" : false,
      sourcemap: !minify,
      lib: {
        entry: resolve(__dirname, entry[kind]),
        name: kind === "module" ? undefined : globalName[kind],
        formats: kind === "module" ? ["es"] : ["iife"],
        fileName: () => fileName,
      },
      rollupOptions: {
        output: {
          extend: kind !== "module",
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
    },
  };
});
