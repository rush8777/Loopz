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
export declare function captureEnvironmentSnapshot(): SessionStartEventPayload;
