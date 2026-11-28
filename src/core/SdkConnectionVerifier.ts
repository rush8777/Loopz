import { collectDesignEvidence } from "../themes/DesignTokenExtractor";

interface PublicConfigResponse {
  sdkVerification?: { id?: unknown } | null;
  themeCapture?: { id?: unknown } | null;
}

/**
 * Checks once during SDK initialization for a dashboard-triggered live
 * verification. With no active challenge this is only the existing public
 * config bootstrap request; it never creates heartbeat traffic.
 */
export async function processPendingSdkTasks(apiBase: string, siteId: string): Promise<void> {
  if (!apiBase || !siteId || typeof fetch === "undefined") return;

  try {
    const page = new URL(window.location.href);
    const captureToken = page.searchParams.get("movcues_theme_capture");
    const explicit = captureToken && /^themec_[A-Za-z0-9_-]{32}$/.test(captureToken) ? captureToken : null;
    if (explicit) {
      page.searchParams.delete("movcues_theme_capture");
      try { history.replaceState(history.state, "", page); } catch { /* The host may restrict URL updates. */ }
    }
    const query = `sdkVerification=${Date.now()}${explicit ? `&themeCapture=${encodeURIComponent(explicit)}` : ""}`;
    const configResponse = await fetch(
      `${apiBase}/public/config/${encodeURIComponent(siteId)}?${query}`,
      { credentials: "omit", cache: "no-store" }
    );
    if (!configResponse.ok) return;
    const config = (await configResponse.json()) as PublicConfigResponse;
    const verificationId = config.sdkVerification?.id;
    if (typeof verificationId === "string" && verificationId) await fetch(`${apiBase}/public/sites/${encodeURIComponent(siteId)}/sdk-verifications/${encodeURIComponent(verificationId)}/ack`, { method: "POST", credentials: "omit", keepalive: true });
    const captureId = config.themeCapture?.id;
    if (typeof captureId === "string" && captureId && (!explicit || captureId === explicit)) {
      const payload = await collectDesignEvidence();
      await fetch(`${apiBase}/public/sites/${encodeURIComponent(siteId)}/theme-captures/${encodeURIComponent(captureId)}`, { method: "POST", credentials: "omit", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
  } catch {
    // Verification is best-effort and must never affect analytics startup or
    // the host product when config/acknowledgement is unavailable.
  }
}

export const acknowledgePendingSdkVerification = processPendingSdkTasks;
