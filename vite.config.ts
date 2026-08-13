import { defineConfig } from "vite";
import { resolve } from "path";

// Builds five artifacts:
//   dist/sdk.js              - core SDK, readable IIFE build (CDN <script> tag)
//   dist/sdk.min.js          - core SDK, minified IIFE build (terser)
//   dist/sdk-replay.js       - rrweb, readable IIFE build
//   dist/sdk-replay.min.js   - rrweb, minified IIFE build (terser)
//   dist/sdk.esm.js          - core SDK, real ES module (npm/bundler import)
//
// The core SDK never imports rrweb directly - session replay (RRWebRecorder)
// lazily injects a <script src="sdk-replay(.min).js"> only when a site has
// sessionReplay.enabled and actually starts recording. This keeps rrweb's
// weight (which dwarfs the rest of this SDK) off every site that doesn't
// use replay, in EVERY build target - the ESM build included, since that
// lazy-load is a runtime DOM script injection, not a module-graph import,
// so it behaves identically whether the surrounding code is a global IIFE
// or bundled into a React/Next.js app.
//
// The IIFE builds are self-executing global scripts with zero runtime
// dependencies, safe to drop into any site via a plain <script> tag. The
// ESM build is a side-effect-free module (see src/module.ts) meant to be
// `import`ed by a bundler - "rrweb" is left external there since it's
// already a real npm dependency of this package and consumers' own
// bundlers resolve/dedupe it rather than it being inlined twice.
//
// mode values: "development" (core, unminified) | "minify" (core, minified)
//            | "replay" (replay, unminified)     | "replay-minify" (replay, minified)
//            | "module" (core, ES module, unminified - consumer's bundler minifies)
export default defineConfig(({ mode }) => {
  const minify = mode.endsWith("minify");
  const isReplay = mode.startsWith("replay");
  const isModule = mode === "module";

  const entry = isModule
    ? "src/module.ts"
    : isReplay
      ? "src/session/replayBundleEntry.ts"
      : "src/index.ts";
  const name = isReplay ? "AutocaptureAnalyticsSDKReplay" : "AutocaptureAnalyticsSDK";
  const baseName = isReplay ? "sdk-replay" : "sdk";
  const fileName = isModule ? "sdk.esm.js" : minify ? `${baseName}.min.js` : `${baseName}.js`;

  return {
    build: {
      emptyOutDir: false,
      minify: minify ? "terser" : false,
      sourcemap: !minify,
      lib: {
        entry: resolve(__dirname, entry),
        name,
        formats: isModule ? ["es"] : ["iife"],
        fileName: () => fileName,
      },
      rollupOptions: {
        // "rrweb" only matters for the ESM build (it's the only format where
        // an external import is even expressible) - iife/replay ignore this
        // since rrweb never appears in their module graphs to begin with.
        external: isModule ? ["rrweb"] : [],
        output: {
          extend: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
    },
  };
});
