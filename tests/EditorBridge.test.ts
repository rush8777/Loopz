import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorAiRequestError, EditorBridge } from "../src/experiences/editor/EditorBridge";

describe("EditorBridge AI errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("surfaces backend error codes and validation details when no message is provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_body", details: { formErrors: [], fieldErrors: { context: ["AI context is too large"] } } }),
    }));
    const bridge = new EditorBridge("https://api.example.com", "session", "access");
    await expect(bridge.chat({ prompt: "Improve this", revision: 1, context: {} })).rejects.toEqual(expect.objectContaining<Partial<EditorAiRequestError>>({
      message: "AI request rejected: invalid_body — context: AI context is too large",
    }));
  });
});
