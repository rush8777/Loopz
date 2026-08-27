import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionManager } from "../src/core/SessionManager";

describe("SessionManager session-start detection", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("reports a new session on first construction", () => {
    const session = new SessionManager();
    expect(session.consumeSessionStarted()).toBe(true);
  });

  it("clears the flag after it's been consumed once", () => {
    const session = new SessionManager();
    expect(session.consumeSessionStarted()).toBe(true);
    expect(session.consumeSessionStarted()).toBe(false);
  });

  it("does not report a new session when restored from sessionStorage within the inactivity window", () => {
    const first = new SessionManager(30 * 60 * 1000);
    first.consumeSessionStarted(); // simulate the SDK already having emitted session_start for this one

    const second = new SessionManager(30 * 60 * 1000); // e.g. a fresh page load in the same tab
    expect(second.getSessionId()).toBe(first.getSessionId());
    expect(second.consumeSessionStarted()).toBe(false);
  });

  it("reports a new session again after touch() rotates due to inactivity", () => {
    vi.useFakeTimers();
    try {
      const session = new SessionManager(1000); // 1s inactivity window
      const firstSessionId = session.getSessionId();
      session.consumeSessionStarted();

      vi.advanceTimersByTime(2000); // exceed the inactivity window
      session.touch();

      expect(session.getSessionId()).not.toBe(firstSessionId);
      expect(session.consumeSessionStarted()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not report a new session on touch() calls that don't rotate", () => {
    const session = new SessionManager(30 * 60 * 1000);
    session.consumeSessionStarted();

    session.touch();
    session.touch();

    expect(session.consumeSessionStarted()).toBe(false);
  });
});
