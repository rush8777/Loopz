import { record } from "rrweb";

declare global {
  interface Window {
    __aaRRWebRecord__?: typeof record;
  }
}

/**
 * This file is a separate build entry - it becomes dist/sdk-replay.js
 * (and dist/sdk-replay.min.js), a standalone bundle containing rrweb.
 *
 * It is intentionally NOT imported by src/index.ts. RRWebRecorder loads
 * it on demand (a plain <script> tag injection) only when a site has
 * sessionReplay.enabled = true, so the rrweb dependency - which is
 * significantly larger than the rest of this SDK - never has to be
 * downloaded by the majority of sites that don't use session replay.
 */
window.__aaRRWebRecord__ = record;
