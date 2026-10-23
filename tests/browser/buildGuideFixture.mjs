import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
// The realistic host app uses the dashboard's existing React installation.
// React is bundled only into this ignored test fixture, never the SDK.
await build({ entryPoints: [fileURLToPath(new URL('../../../Loopz-Frontend/apps/dashboard/tests/guide-fixture/App.tsx', import.meta.url))], outfile: fileURLToPath(new URL('./.generated/guide-app.js', import.meta.url)), bundle: true, format: 'esm', define: { 'process.env.NODE_ENV': '"production"' }, minify: true });
