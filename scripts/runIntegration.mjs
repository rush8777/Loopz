// Each workflow gets fresh loopback services, a temporary database and normal
// production rate limits. Browser projects cannot exhaust another test's quota.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));
const config = process.env.MOVCUES_INTEGRATION_CONFIG ?? 'playwright.integration.config.ts';
const specs = readdirSync(new URL('../tests/integration/', import.meta.url)).filter(file => file.endsWith('.spec.ts')).sort();
for (const browser of ['chromium', 'firefox', 'webkit']) for (const spec of specs) {
  const result = spawnSync(process.execPath, [cli, 'test', '--config', config, `--project=${browser}`, `tests/integration/${spec}`, ...process.argv.slice(2)], { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
