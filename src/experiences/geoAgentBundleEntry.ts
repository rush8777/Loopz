import { mountGeoAgent } from "./geoAgent/widget";
import type { GeoAgentBundle } from "./geoAgent/types";

const runtime: GeoAgentBundle = { mount: mountGeoAgent };
window.__movcuesGeoAgentRuntime__ = runtime;
