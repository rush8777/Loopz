import { describe, it, expect, afterEach, vi } from "vitest";
import { captureEnvironmentSnapshot } from "../src/core/EnvironmentContext";

function setUserAgent(ua: string): void {
  vi.stubGlobal("navigator", { ...navigator, userAgent: ua, language: navigator.language });
}

describe("captureEnvironmentSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a desktop Chrome/Windows user agent", () => {
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.browserName).toBe("Chrome");
    expect(snapshot.browserVersion).toBe("128.0.0.0");
    expect(snapshot.osName).toBe("Windows");
    expect(snapshot.osVersion).toBe("10.0");
    expect(snapshot.deviceType).toBe("desktop");
  });

  it("parses a macOS Safari user agent", () => {
    setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
    );
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.browserName).toBe("Safari");
    expect(snapshot.browserVersion).toBe("17.5");
    expect(snapshot.osName).toBe("macOS");
    expect(snapshot.osVersion).toBe("14.5");
    expect(snapshot.deviceType).toBe("desktop");
  });

  it("parses an iPhone Safari user agent as mobile", () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    );
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.osName).toBe("iOS");
    expect(snapshot.osVersion).toBe("17.5");
    expect(snapshot.deviceType).toBe("mobile");
  });

  it("parses an iPad user agent as tablet", () => {
    setUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    );
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.osName).toBe("iPadOS");
    expect(snapshot.deviceType).toBe("tablet");
  });

  it("parses an Android Chrome user agent as mobile", () => {
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
    );
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.browserName).toBe("Chrome");
    expect(snapshot.osName).toBe("Android");
    expect(snapshot.osVersion).toBe("14");
    expect(snapshot.deviceType).toBe("mobile");
  });

  it("prefers Edge over Chrome when both tokens are present", () => {
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0"
    );
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.browserName).toBe("Edge");
  });

  it("falls back to undefined fields for an unrecognized user agent rather than guessing", () => {
    setUserAgent("SomeBotThatDoesNotMatchAnyKnownPattern/1.0");
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.browserName).toBeUndefined();
    expect(snapshot.osName).toBeUndefined();
    expect(snapshot.deviceType).toBe("desktop"); // the only field with a non-empty default, since "not mobile/tablet" is itself meaningful
  });

  it("includes language and timezone from the environment", () => {
    const snapshot = captureEnvironmentSnapshot();
    expect(typeof snapshot.language).toBe("string");
    expect(typeof snapshot.timezone).toBe("string");
  });

  it("reads screen size from window.screen when available", () => {
    vi.stubGlobal("window", { ...window, screen: { width: 1920, height: 1080 } });
    const snapshot = captureEnvironmentSnapshot();
    expect(snapshot.screenWidth).toBe(1920);
    expect(snapshot.screenHeight).toBe(1080);
  });
});
