import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HoverCollector } from "../src/autocapture/HoverCollector";
import { EventBus } from "../src/core/EventBus";
import { PrivacyFilter } from "../src/privacy/PrivacyFilter";
import type { HoverEventPayload } from "../src/types/events";

function firePointerEvent(type: string, target: Element, related: Element | null = null) {
  const event = new Event(type, { bubbles: false, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, "target", { value: target, enumerable: true });
  Object.defineProperty(event, "relatedTarget", { value: related, enumerable: true });
  target.dispatchEvent(event);
}

describe("HoverCollector position capture", () => {
  let bus: EventBus;
  let collector: HoverCollector;
  let button: HTMLButtonElement;

  beforeEach(() => {
    bus = new EventBus();
    collector = new HoverCollector(bus, new PrivacyFilter(), { minHoverMs: 0 });
    button = document.createElement("button");
    button.id = "cta";
    document.body.appendChild(button);
    // jsdom returns all-zero rects by default - stub a realistic one.
    button.getBoundingClientRect = () => ({
      left: 100,
      top: 200,
      right: 260,
      bottom: 240,
      width: 160,
      height: 40,
      x: 100,
      y: 200,
      toJSON() {},
    });
    collector.start();
  });

  afterEach(() => {
    collector.stop();
    document.body.removeChild(button);
  });

  it("emits the hovered element's bounding-box center as x/y", async () => {
    const received: HoverEventPayload[] = [];
    bus.on<HoverEventPayload>("hover", (p) => received.push(p));

    firePointerEvent("pointerenter", button);
    await new Promise((r) => setTimeout(r, 5));
    firePointerEvent("pointerleave", button);

    expect(received).toHaveLength(1);
    // center of {left:100, top:200, width:160, height:40} -> (180, 220)
    expect(received[0].x).toBe(180);
    expect(received[0].y).toBe(220);
    expect(received[0].documentX).toBe(180 + window.scrollX);
    expect(received[0].documentY).toBe(220 + window.scrollY);
  });
});
