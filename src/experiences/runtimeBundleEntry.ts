import { loadSdkBundle, sdkBundleUrl } from "../core/sdkBundleLoader";
import { ExperienceLoader } from "./runtime/ExperienceLoader";
import type { ExperienceRuntime } from "./runtimeInterfaces";

const runtime: ExperienceRuntime = {
  createLoader: (apiBase, siteId, session, trackEvent, geoAgent) =>
    new ExperienceLoader(apiBase, siteId, session, trackEvent, geoAgent, overrideUrl => loadSdkBundle(
      sdkBundleUrl("geo-agent", overrideUrl), () => window.__movcuesGeoAgentRuntime__, "Geo Agent runtime",
    )),
};

window.__movcuesExperienceRuntime__ = runtime;
