import { ExperienceLoader } from "./runtime/ExperienceLoader";
import type { ExperienceRuntime } from "./runtimeInterfaces";

const runtime: ExperienceRuntime = {
  createLoader: (apiBase, siteId, session, trackEvent) =>
    new ExperienceLoader(apiBase, siteId, session, trackEvent),
};

window.__movcuesExperienceRuntime__ = runtime;
