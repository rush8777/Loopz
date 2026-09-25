interface PublicConfigResponse {
  sdkVerification?: { id?: unknown } | null;
}

/**
 * Checks once during SDK initialization for a dashboard-triggered live
 * verification. With no active challenge this is only the existing public
 * config bootstrap request; it never creates heartbeat traffic.
 */
export async function acknowledgePendingSdkVerification(apiBase: string, siteId: string): Promise<void> {
  if (!apiBase || !siteId || typeof fetch === "undefined") return;

  try {
    const configResponse = await fetch(
      `${apiBase}/public/config/${encodeURIComponent(siteId)}?sdkVerification=${Date.now()}`,
      { credentials: "omit", cache: "no-store" }
    );
    if (!configResponse.ok) return;
    const config = (await configResponse.json()) as PublicConfigResponse;
    const verificationId = config.sdkVerification?.id;
    if (typeof verificationId !== "string" || !verificationId) return;

    await fetch(
      `${apiBase}/public/sites/${encodeURIComponent(siteId)}/sdk-verifications/${encodeURIComponent(verificationId)}/ack`,
      { method: "POST", credentials: "omit", keepalive: true }
    );
  } catch {
    // Verification is best-effort and must never affect analytics startup or
    // the host product when config/acknowledgement is unavailable.
  }
}
