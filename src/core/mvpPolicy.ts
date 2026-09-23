/**
 * Release-locked MVP1 policy. Re-enabling these capabilities requires an
 * intentional SDK release so stale or accidental customer configuration
 * cannot restart high-volume collection.
 *
 * When advanced telemetry returns, do not restore one session_events row per
 * cursor sample. Prefer spatial buckets, compressed cursor trace chunks,
 * aggregated selector hover metrics, and object storage for screenshots.
 */
export const MVP1_POLICY = Object.freeze({
  // Keep normal click analytics focused on intentional UI interactions.
  // Raw, privacy-approved clicks still flow locally for rage detection.
  interactiveClicksOnly: true,
  cursor: false,
  hover: false,
  move: false,
  sessionReplay: false,
  heatmaps: false,
});
