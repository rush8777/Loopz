import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgePendingSdkVerification } from "../src/core/SdkConnectionVerifier";

describe("SDK connection verification", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("acknowledges a pending challenge discovered through public config", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sdkVerification: { id: "sdkv_active-token" } }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await acknowledgePendingSdkVerification("https://api.example.com", "site/example");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /^https:\/\/api\.example\.com\/public\/config\/site%2Fexample\?sdkVerification=\d+$/
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store" });
    expect(fetchMock.mock.calls[1]).toEqual([
      "https://api.example.com/public/sites/site%2Fexample/sdk-verifications/sdkv_active-token/ack",
      { method: "POST", credentials: "omit", keepalive: true },
    ]);
  });

  it("does not send an acknowledgement when no verification is active", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sdkVerification: null }) });
    vi.stubGlobal("fetch", fetchMock);

    await acknowledgePendingSdkVerification("https://api.example.com", "site_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not let verification failures interrupt SDK initialization", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(acknowledgePendingSdkVerification("https://api.example.com", "site_1")).resolves.toBeUndefined();
  });
});
