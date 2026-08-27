import type { SessionStartEventPayload } from "../types/events";

/**
 * Captures the automatically-collected environment context for a
 * session: browser, OS, device type, language, timezone, screen size,
 * and referrer. Called once per session (see SessionManager's
 * sessionJustStarted flag / Analytics.enqueueEvent), never per event -
 * none of this changes mid-session.
 *
 * The browser/OS parsing here is deliberately lightweight - a handful
 * of ordered regex checks against navigator.userAgent, not a general
 * UA-parsing library. This is intentional: the goal is "what a server
 * already learns for free from the User-Agent header, structured for
 * display" (task brief: Device / Browser / OS on a visitor's profile),
 * not exhaustive version detection. It does not touch canvas, audio,
 * fonts, WebGL, or any other fingerprinting surface, and captures
 * nothing that isn't already visible in a plain HTTP request.
 */
export function captureEnvironmentSnapshot(): SessionStartEventPayload {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const browser = parseBrowser(ua);
  const os = parseOS(ua);

  return {
    browserName: browser?.name,
    browserVersion: browser?.version,
    osName: os?.name,
    osVersion: os?.version,
    deviceType: parseDeviceType(ua),
    language: safeLanguage(),
    timezone: safeTimezone(),
    screenWidth: safeScreenDimension("width"),
    screenHeight: safeScreenDimension("height"),
    referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
  };
}

interface NameVersion {
  name: string;
  version: string;
}

/** Order matters: Edge/Opera/Chrome-on-iOS/Firefox-on-iOS all include tokens ("Chrome", "Safari") that would otherwise match a later, wrong pattern first. */
function parseBrowser(ua: string): NameVersion | null {
  const patterns: [RegExp, string][] = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/CriOS\/([\d.]+)/, "Chrome"], // Chrome on iOS
    [/FxiOS\/([\d.]+)/, "Firefox"], // Firefox on iOS
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari\//, "Safari"],
  ];
  for (const [re, name] of patterns) {
    const match = ua.match(re);
    if (match) return { name, version: match[1] };
  }
  return null;
}

function parseOS(ua: string): NameVersion | null {
  const patterns: Array<[RegExp, string, ((raw: string) => string)?]> = [
    [/Windows NT ([\d.]+)/, "Windows"],
    [/CrOS \S+ ([\d.]+)/, "ChromeOS"],
    [/Mac OS X ([\d_.]+)/, "macOS", dotted],
    [/iPad; CPU OS ([\d_]+)/, "iPadOS", dotted],
    [/iPhone OS ([\d_]+)/, "iOS", dotted],
    [/Android ([\d.]+)/, "Android"],
    [/Linux/, "Linux"],
  ];
  for (const [re, name, transform] of patterns) {
    const match = ua.match(re);
    if (match) return { name, version: transform ? transform(match[1] ?? "") : (match[1] ?? "") };
  }
  return null;
}

function dotted(raw: string): string {
  return raw.replace(/_/g, ".");
}

function parseDeviceType(ua: string): "desktop" | "mobile" | "tablet" {
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)) return "mobile";
  return "desktop";
}

function safeLanguage(): string | undefined {
  try {
    return navigator.language || undefined;
  } catch {
    return undefined;
  }
}

function safeTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function safeScreenDimension(dim: "width" | "height"): number | undefined {
  try {
    return window.screen?.[dim] || undefined;
  } catch {
    return undefined;
  }
}
