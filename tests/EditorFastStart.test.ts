import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeEditorSession, prefetchEditorDraft } from "../src/experiences/editorFastStart";
import { EditorBridge, EditorSessionExpiredError } from "../src/experiences/editor/EditorBridge";
import type { EditorDraft } from "../src/experiences/types";

const session = () => ({
  sessionId: "session-123",
  accessToken: "test-access",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const draft = (): EditorDraft => ({
  references: { guides: [], segments: [], stylePresets: [], siteTheme: null },
  experience: { id: "experience-1", name: "Welcome", kind: "widget", widgetType: "modal", builderMode: "onsite" },
  version: {
    id: "draft-1",
    revision: 1,
    versionNumber: 1,
    definition: {
      content: { heading: "Welcome", body: "Hello" },
      design: { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } },
      behavior: { dismissible: true },
      targeting: {
        pageRules: [], audience: { type: "all" },
        trigger: { type: "page_load" },
        frequency: { mode: "once_per_session" },
        priority: 40, interruptPolicy: "queue",
      },
    },
  },
} as EditorDraft);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("fast editor startup", () => {
  it("accepts the initial draft bundled into a one-time token exchange", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...session(), draft: draft() }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await exchangeEditorSession("https://api.example.com", "one-time-token");
    expect(result?.session.sessionId).toBe("session-123");
    expect(result?.draft?.version.id).toBe("draft-1");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/public/experience-editor/exchange", expect.objectContaining({
      method: "POST", credentials: "omit", cache: "no-store", body: JSON.stringify({ token: "one-time-token" }),
    }));
  });

  it("supports older exchange responses without a bundled draft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => session() }));
    const result = await exchangeEditorSession("https://api.example.com", "token");
    expect(result?.session.sessionId).toBe("session-123");
    expect(result?.draft).toBeUndefined();
  });

  it("prefetches a fresh draft for full-page navigation with the scoped session token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => draft() });
    vi.stubGlobal("fetch", fetchMock);
    expect((await prefetchEditorDraft("https://api.example.com", session()))?.version.revision).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/public/experience-editor/session-123/draft", expect.objectContaining({
      cache: "no-store", credentials: "omit", headers: { Authorization: "Bearer test-access" },
    }));
  });

  it("uses the small status endpoint for periodic verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await new EditorBridge("https://api.example.com", "session-123", "test-access").checkSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/public/experience-editor/session-123/status");
  });

  it("falls back to the draft endpoint if the new status route is not deployed yet", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => draft() });
    vi.stubGlobal("fetch", fetchMock);
    await new EditorBridge("https://api.example.com", "session-123", "test-access").checkSession();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.com/public/experience-editor/session-123/draft");
  });

  it("expires the editor immediately when the status endpoint rejects access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(new EditorBridge("https://api.example.com", "session-123", "test-access").checkSession())
      .rejects.toBeInstanceOf(EditorSessionExpiredError);
  });

  it("fails closed when session exchange or draft prefetch is unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await exchangeEditorSession("https://api.example.com", "invalid")).toBeNull();
    expect(await prefetchEditorDraft("https://api.example.com", session())).toBeNull();
  });
});
