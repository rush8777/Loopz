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

  it("consumes fragmented NDJSON frames in order without resubmitting", async () => {
    const encoder = new TextEncoder();
    const frames = [
      JSON.stringify({ type: "progress", requestId: "req_1", sequence: 1, elapsedMs: 10, stage: "creating", detail: "Creating.", attempt: 1 }) + "\n",
      JSON.stringify({ type: "heartbeat", requestId: "req_1", sequence: 2, elapsedMs: 1000 }) + "\n" + JSON.stringify({ type: "result", requestId: "req_1", sequence: 3, elapsedMs: 1100, result: { conversationId: "conversation_1", revision: 4, markdown: "Ready", proposal: null } }) + "\n",
    ].join("");
    const bytes = encoder.encode(frames); const split = [bytes.slice(0, 17), bytes.slice(17, 83), bytes.slice(83)];
    const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { split.forEach(chunk => controller.enqueue(chunk)); controller.close(); } }), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } }));
    vi.stubGlobal("fetch", fetcher); const events: string[] = [];
    const result = await new EditorBridge("https://api.example.com", "session", "access").chat({ prompt: "Improve", revision: 4, context: {} }, undefined, event => events.push(event.type));
    expect(result).toMatchObject({ conversationId: "conversation_1", proposal: null }); expect(events).toEqual(["progress", "heartbeat", "result"]); expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects interrupted, stale, and duplicate-terminal streams", async () => {
    const response = (events: unknown[]) => new Response(events.map(event => JSON.stringify(event)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
    const bridge = new EditorBridge("https://api.example.com", "session", "access");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([{ type: "progress", requestId: "r", sequence: 1, elapsedMs: 0, stage: "creating", detail: "Creating", attempt: 1 }])).mockResolvedValueOnce(response([{ type: "heartbeat", requestId: "r", sequence: 2, elapsedMs: 2 }, { type: "heartbeat", requestId: "r", sequence: 2, elapsedMs: 3 }])).mockResolvedValueOnce(response([{ type: "result", requestId: "r", sequence: 1, elapsedMs: 2, result: { conversationId: "c", revision: 1, markdown: "ok", proposal: null } }, { type: "error", requestId: "r", sequence: 2, elapsedMs: 3, error: "late", message: "late" }])));
    await expect(bridge.chat({ prompt: "one", revision: 1, context: {} })).rejects.toThrow(/interrupted/);
    await expect(bridge.chat({ prompt: "two", revision: 1, context: {} })).rejects.toThrow(/stale or duplicate/);
    await expect(bridge.chat({ prompt: "three", revision: 1, context: {} })).rejects.toThrow(/more than one terminal/);
  });

  it("accepts compatible JSON from the same response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ conversationId: "json_c", revision: 2, markdown: "JSON", proposal: null }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher); await expect(new EditorBridge("https://api.example.com", "session", "access").chat({ prompt: "Improve", revision: 2, context: {} })).resolves.toMatchObject({ conversationId: "json_c" }); expect(fetcher).toHaveBeenCalledOnce();
  });
});
