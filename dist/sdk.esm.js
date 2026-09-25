class EventBus {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(topic, fn) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, /* @__PURE__ */ new Set());
    this.listeners.get(topic).add(fn);
    return () => this.off(topic, fn);
  }
  off(topic, fn) {
    var _a;
    (_a = this.listeners.get(topic)) == null ? void 0 : _a.delete(fn);
  }
  emit(topic, payload) {
    const set = this.listeners.get(topic);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error("[Analytics] listener error", err);
      }
    }
  }
  clear() {
    this.listeners.clear();
  }
}
const SENSITIVE_INPUT_TYPES = /* @__PURE__ */ new Set(["password", "email", "tel", "credit-card", "cc-number"]);
const SENSITIVE_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA", "SELECT"]);
const PRIVATE_ATTRIBUTES = ["data-private", "data-ignore", "data-analytics-ignore"];
class SensitiveElementDetector {
  isSensitiveFormElement(el) {
    const tag = el.tagName;
    if (!SENSITIVE_TAGS.has(tag)) return false;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (SENSITIVE_INPUT_TYPES.has(type)) return true;
      if (type === "text" || type === "search" || type === "number") return true;
    }
    return tag === "TEXTAREA" || tag === "SELECT" ? false : tag === "INPUT";
  }
  hasPrivacyMarker(el) {
    return PRIVATE_ATTRIBUTES.some((attr) => el.hasAttribute(attr));
  }
  /** Walk up the tree - if any ancestor (or the element itself) is marked private, the whole subtree is private. */
  isWithinPrivateSubtree(el) {
    let node = el;
    while (node) {
      if (this.hasPrivacyMarker(node)) return true;
      node = node.parentElement;
    }
    return false;
  }
}
class PrivacyFilter {
  constructor() {
    this.detector = new SensitiveElementDetector();
  }
  shouldCapture(el) {
    if (!el) return true;
    if (this.detector.isWithinPrivateSubtree(el)) return false;
    if (this.detector.isSensitiveFormElement(el)) return false;
    return true;
  }
  /** Convenience for coordinate-only events (move/scroll) that touch an element under the pointer. */
  shouldCaptureAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return this.shouldCapture(el);
  }
}
const MAX_LABEL_LENGTH = 60;
const OVERRIDE_ATTR = "data-movecues-name";
const detector = new SensitiveElementDetector();
function clean(text) {
  if (!text) return void 0;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return void 0;
  return trimmed.length > MAX_LABEL_LENGTH ? `${trimmed.slice(0, MAX_LABEL_LENGTH - 1)}…` : trimmed;
}
function computeElementLabel(el) {
  const override = clean(el.getAttribute(OVERRIDE_ATTR));
  if (override) return override;
  const ariaLabel = clean(el.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelText = labelledBy.split(/\s+/).map((id) => {
      var _a;
      return (_a = document.getElementById(id)) == null ? void 0 : _a.textContent;
    }).filter(Boolean).join(" ");
    const cleaned = clean(labelText);
    if (cleaned) return cleaned;
  }
  if (!detector.isWithinPrivateSubtree(el)) {
    const text = clean(el.textContent);
    if (text) return text;
  }
  const alt = clean(el.getAttribute("alt"));
  if (alt) return alt;
  const title = clean(el.getAttribute("title"));
  if (title) return title;
  const placeholder = clean(el.getAttribute("placeholder"));
  if (placeholder) return placeholder;
  return semanticFallback(el);
}
function semanticFallback(el) {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  if (tag === "button" || role === "button") {
    return el.getAttribute("type") === "submit" ? "Submit button" : "Button";
  }
  if (tag === "a" || role === "link") return "Link";
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return `${type.charAt(0).toUpperCase()}${type.slice(1)} field`;
  }
  if (tag === "select") return "Dropdown";
  if (tag === "textarea") return "Text field";
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}
function computeElementRole(el) {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a") return "link";
  if (tag === "input") return `input:${(el.getAttribute("type") || "text").toLowerCase()}`;
  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";
  return void 0;
}
const STABLE_DATA_ATTRS$1 = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS$1 = ["role", "aria-label", "name", "type", "href"];
const DYNAMIC_CLASS_PATTERN$1 = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;
const TAILWIND_UTILITY_PATTERN = /^(-?(m|p)[trblxy]?-|w-|h-|min-|max-|inset-|top-|right-|bottom-|left-|z-|order-|col-|row-|gap-|space-|grid-|flex-\d|flex$|inline-flex$|inline-block$|inline$|block$|hidden$|table|items-|justify-|content-|self-|place-|text-|font-|leading-|tracking-|whitespace-|break-|truncate$|bg-|from-|via-|to-|border|divide-|rounded|shadow|opacity-|blur-|brightness-|contrast-|grayscale|invert|saturate|sepia|backdrop-|transition|duration-|ease-|delay-|animate-|cursor-|select-|resize-|scroll-|snap-|touch-|pointer-events-|will-change-|appearance-|outline-|ring-|overflow-|overscroll-|absolute$|relative$|fixed$|sticky$|static$|visible$|invisible$|float-|clear-|isolate$|object-|aspect-|columns-|underline$|line-through$|no-underline$|uppercase$|lowercase$|capitalize$|normal-case$|italic$|not-italic$|antialiased$)/;
const TAILWIND_VARIANT_PREFIX_PATTERN = /^(sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover|focus-visible|first|last|odd|even):/;
function isTailwindUtilityClass(cls) {
  const unescaped = cls.replace(/\\/g, "");
  return TAILWIND_UTILITY_PATTERN.test(unescaped) || TAILWIND_VARIANT_PREFIX_PATTERN.test(unescaped);
}
function isStableClass$1(cls) {
  if (!cls) return false;
  if (DYNAMIC_CLASS_PATTERN$1.test(cls)) return false;
  if (/^\d/.test(cls)) return false;
  if (isTailwindUtilityClass(cls)) return false;
  return true;
}
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const PREFIXED_HEX_ID_SEGMENT = /^[a-z]{1,12}_[0-9a-f]{6,}$/i;
const BARE_HEX_ID_SEGMENT = /^[0-9a-f]{12,}$/i;
function canonicalizePathSegment(segment) {
  if (UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) || PREFIXED_HEX_ID_SEGMENT.test(segment) || BARE_HEX_ID_SEGMENT.test(segment)) {
    return ":id";
  }
  return segment;
}
const SAFE_FRAGMENT_ID = /^[a-z][a-z0-9_.:-]{0,99}$/i;
const SAFE_HASH_ROUTE = /^\/[a-z0-9_./:-]{0,199}$/i;
function canonicalizePath(path) {
  return path.split("/").map((segment) => segment ? canonicalizePathSegment(segment) : segment).join("/");
}
function canonicalizeHref(href) {
  if (href.startsWith("#/")) {
    const hashPath = href.slice(1).split("?")[0].split("#")[0];
    return SAFE_HASH_ROUTE.test(hashPath) ? `#${canonicalizePath(hashPath)}` : null;
  }
  if (href.startsWith("#")) {
    const fragment = href.slice(1);
    return SAFE_FRAGMENT_ID.test(fragment) ? `#${fragment}` : null;
  }
  const path = href.split("?")[0].split("#")[0];
  return path ? canonicalizePath(path) : null;
}
class SelectorGenerator {
  generate(el) {
    const id = el.getAttribute("id");
    if (id && this.isUniqueId(id)) {
      return `${el.tagName.toLowerCase()}#${cssEscape$1(id)}`;
    }
    for (const attr of STABLE_DATA_ATTRS$1) {
      const value = el.getAttribute(attr);
      if (value) {
        return `${el.tagName.toLowerCase()}[${attr}="${cssEscape$1(value)}"]`;
      }
    }
    for (const attr of SEMANTIC_ATTRS$1) {
      const rawValue = el.getAttribute(attr);
      if (!rawValue) continue;
      const value = attr === "href" ? canonicalizeHref(rawValue) : rawValue;
      if (!value) continue;
      if (value.length < 100) {
        return `${el.tagName.toLowerCase()}[${attr}="${cssEscape$1(value)}"]`;
      }
    }
    const classes = this.getClassList(el).filter(isStableClass$1);
    if (classes.length > 0) {
      return `${el.tagName.toLowerCase()}.${classes.map(cssEscape$1).join(".")}`;
    }
    return this.limitedStructuralPath(el);
  }
  describe(el) {
    const classes = this.getClassList(el);
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.getAttribute("id") || void 0,
      classes: classes.length ? classes : void 0,
      selector: this.generate(el),
      label: computeElementLabel(el),
      role: computeElementRole(el)
    };
  }
  getClassList(el) {
    const raw = el.getAttribute("class");
    if (!raw) return [];
    return raw.split(/\s+/).filter(Boolean).slice(0, 5);
  }
  isUniqueId(id) {
    try {
      return document.querySelectorAll(`#${cssEscape$1(id)}`).length === 1;
    } catch {
      return false;
    }
  }
  limitedStructuralPath(el, maxDepth = 3) {
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node !== document.body && depth < maxDepth) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        const idx = siblings.indexOf(node) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
      } else {
        parts.unshift(tag);
      }
      node = parent;
      depth++;
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  }
}
function cssEscape$1(value) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
const INTERACTIVE_TAGS = /* @__PURE__ */ new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "LABEL"]);
function closestInteractive(el, maxDepth = 8) {
  let node = el;
  let depth = 0;
  while (node && node !== document.body && depth < maxDepth) {
    if (INTERACTIVE_TAGS.has(node.tagName) || node.getAttribute("role") === "button" || node.getAttribute("role") === "link" || node.hasAttribute("onclick") || node.hasAttribute("tabindex") || node.hasAttribute("data-action")) {
      return node;
    }
    node = node.parentElement;
    depth++;
  }
  return null;
}
function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
function clamp$2(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
class ClickCollector {
  constructor(bus, privacy) {
    this.bus = bus;
    this.privacy = privacy;
    this.selectorGenerator = new SelectorGenerator();
    this.handler = (e) => this.onClick(e);
    this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    document.addEventListener("click", this.handler, { capture: true, passive: true });
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    document.removeEventListener("click", this.handler, { capture: true });
  }
  onClick(e) {
    const rawTarget = e.target;
    if (!rawTarget || rawTarget.nodeType !== 1) return;
    if (!this.privacy.shouldCapture(rawTarget)) return;
    const interactiveEl = closestInteractive(rawTarget);
    const target = interactiveEl || rawTarget;
    const payload = {
      coordinates: {
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        documentX: e.clientX + window.scrollX,
        documentY: e.clientY + window.scrollY
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: window.scrollX, y: window.scrollY },
      element: this.selectorGenerator.describe(target),
      interactive: interactiveEl !== null,
      pointerType: e.pointerType || void 0
    };
    this.bus.emit("click", payload);
    this.bus.emit("click:raw", { x: e.clientX, y: e.clientY, documentX: payload.coordinates.documentX, documentY: payload.coordinates.documentY, target, timestamp: Date.now() });
  }
}
class ScrollCollector {
  constructor(bus, config) {
    this.bus = bus;
    this.config = config;
    this.ticking = false;
    this.lastScrollTop = 0;
    this.maxScrollPercent = 0;
    this.firedMilestones = /* @__PURE__ */ new Set();
    this.handler = () => this.requestSample();
    this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.reset();
    window.addEventListener("scroll", this.handler, { passive: true });
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("scroll", this.handler);
  }
  /** Called by the engine on SPA route changes: scroll milestones reset per page view. */
  reset() {
    this.lastScrollTop = window.scrollY;
    this.maxScrollPercent = 0;
    this.firedMilestones.clear();
  }
  requestSample() {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.sample();
      this.ticking = false;
    });
  }
  sample() {
    const doc = document.documentElement;
    const documentHeight = Math.max(doc.scrollHeight, doc.clientHeight);
    const viewportHeight = window.innerHeight;
    const scrollTop = window.scrollY;
    const scrollable = Math.max(documentHeight - viewportHeight, 1);
    const scrollPercent = clamp$2(Math.round(scrollTop / scrollable * 100), 0, 100);
    const direction = scrollTop >= this.lastScrollTop ? "down" : "up";
    this.lastScrollTop = scrollTop;
    if (scrollPercent > this.maxScrollPercent) {
      this.maxScrollPercent = scrollPercent;
    }
    const payload = {
      scrollPercent,
      maxScrollPercent: this.maxScrollPercent,
      scrollTop,
      documentHeight,
      viewportHeight,
      direction
    };
    this.bus.emit("scroll", payload);
    this.checkMilestones(payload);
  }
  checkMilestones(payload) {
    for (const milestone of this.config.milestones) {
      if (this.maxScrollPercent >= milestone && !this.firedMilestones.has(milestone)) {
        this.firedMilestones.add(milestone);
        this.bus.emit("scroll:milestone", {
          ...payload,
          milestone
        });
      }
    }
  }
}
class MoveCollector {
  constructor(bus, config) {
    this.bus = bus;
    this.config = config;
    this.lastX = 0;
    this.lastY = 0;
    this.lastSampleTime = 0;
    this.buffer = [];
    this.ticking = false;
    this.pendingEvent = null;
    this.flushHandle = null;
    this.running = false;
    this.handler = (e) => this.onMove(e);
  }
  start() {
    if (this.running) return;
    this.running = true;
    const opts = { passive: true };
    if (window.PointerEvent) {
      window.addEventListener("pointermove", this.handler, opts);
    } else {
      window.addEventListener("mousemove", this.handler, opts);
    }
    this.scheduleFlush();
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("pointermove", this.handler);
    window.removeEventListener("mousemove", this.handler);
    if (this.flushHandle) clearTimeout(this.flushHandle);
    this.buffer = [];
  }
  onMove(e) {
    this.pendingEvent = e;
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => this.sample());
  }
  sample() {
    this.ticking = false;
    const e = this.pendingEvent;
    if (!e) return;
    const minIntervalMs = 1e3 / this.config.samplesPerSecond;
    const t = performance.now();
    if (t - this.lastSampleTime < minIntervalMs) return;
    const moved = distance(this.lastX, this.lastY, e.clientX, e.clientY);
    if (moved < this.config.minMovementPx && this.lastSampleTime !== 0) return;
    const dt = this.lastSampleTime === 0 ? minIntervalMs : t - this.lastSampleTime;
    const velocity = moved / (dt / 1e3);
    const direction = moved > 0 ? Math.atan2(e.clientY - this.lastY, e.clientX - this.lastX) * 180 / Math.PI : void 0;
    this.buffer.push({
      x: e.clientX,
      y: e.clientY,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      velocity: Math.round(velocity),
      direction: direction !== void 0 ? Math.round(direction) : void 0,
      t: Date.now()
    });
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastSampleTime = t;
    if (this.buffer.length >= 50) this.flush();
  }
  scheduleFlush() {
    if (!this.running) return;
    this.flushHandle = setTimeout(() => {
      this.flush();
      this.scheduleFlush();
    }, 1e3);
  }
  flush() {
    if (this.buffer.length === 0) return;
    const points = this.buffer;
    this.buffer = [];
    this.bus.emit("move", { points });
  }
}
class RageClickDetector {
  constructor(bus, config) {
    this.bus = bus;
    this.config = config;
    this.cluster = [];
    this.selectorGenerator = new SelectorGenerator();
    this.lastEmittedClusterEnd = 0;
    this.unsubscribe = null;
  }
  start() {
    if (this.unsubscribe) return;
    this.unsubscribe = this.bus.on("click:raw", (c) => this.onClick(c));
  }
  stop() {
    var _a;
    (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
    this.unsubscribe = null;
    this.cluster = [];
  }
  onClick(click) {
    if (this.cluster.length > 0) {
      const first = this.cluster[0];
      const withinTime = click.timestamp - first.timestamp <= this.config.timeWindowMs;
      const withinSpace = distance(first.x, first.y, click.x, click.y) <= this.config.radiusPx;
      if (!withinTime || !withinSpace) {
        this.evaluateAndReset();
      }
    }
    this.cluster.push(click);
    if (this.cluster.length >= this.config.minClicks) {
      this.emitRageCluster();
    }
  }
  emitRageCluster() {
    if (this.cluster.length === 0) return;
    const first = this.cluster[0];
    const last = this.cluster[this.cluster.length - 1];
    if (first.timestamp <= this.lastEmittedClusterEnd) return;
    const durationMs = last.timestamp - first.timestamp;
    const payload = {
      coordinates: { x: first.x, y: first.y, documentX: first.documentX, documentY: first.documentY },
      clickCount: this.cluster.length,
      durationMs,
      targetSelector: this.selectorGenerator.generate(last.target)
    };
    this.bus.emit("rage_click", payload);
    this.lastEmittedClusterEnd = last.timestamp;
  }
  evaluateAndReset() {
    this.cluster = [];
  }
}
class HoverCollector {
  constructor(bus, privacy, config) {
    this.bus = bus;
    this.privacy = privacy;
    this.config = config;
    this.selectorGenerator = new SelectorGenerator();
    this.active = /* @__PURE__ */ new Map();
    this.onEnter = (e) => this.handleEnter(e);
    this.onLeave = (e) => this.handleLeave(e);
    this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    document.addEventListener("pointerenter", this.onEnter, {
      capture: true,
      passive: true
    });
    document.addEventListener("pointerleave", this.onLeave, {
      capture: true,
      passive: true
    });
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    document.removeEventListener("pointerenter", this.onEnter, { capture: true });
    document.removeEventListener("pointerleave", this.onLeave, { capture: true });
    this.active.clear();
  }
  handleEnter(e) {
    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    const interactiveEl = closestInteractive(target);
    if (!interactiveEl) return;
    if (this.active.has(interactiveEl)) return;
    if (!this.privacy.shouldCapture(interactiveEl)) return;
    const rect = interactiveEl.getBoundingClientRect();
    this.active.set(interactiveEl, {
      startedAt: Date.now(),
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      documentX: Math.round(rect.left + rect.width / 2 + window.scrollX),
      documentY: Math.round(rect.top + rect.height / 2 + window.scrollY)
    });
  }
  handleLeave(e) {
    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    const interactiveEl = closestInteractive(target);
    if (!interactiveEl) return;
    const active = this.active.get(interactiveEl);
    if (active === void 0) return;
    const related = e.relatedTarget;
    if (related && interactiveEl.contains(related)) return;
    const hoverEnd = Date.now();
    const durationMs = hoverEnd - active.startedAt;
    this.active.delete(interactiveEl);
    if (durationMs < this.config.minHoverMs) return;
    const payload = {
      element: this.selectorGenerator.describe(interactiveEl),
      hoverStart: active.startedAt,
      hoverEnd,
      durationMs,
      x: active.x,
      y: active.y,
      documentX: active.documentX,
      documentY: active.documentY
    };
    this.bus.emit("hover", payload);
  }
}
class CursorCollector {
  constructor(bus, config) {
    this.bus = bus;
    this.config = config;
    this.lastEmittedX = 0;
    this.lastEmittedY = 0;
    this.lastEmittedTime = 0;
    this.hasSample = false;
    this.rawX = 0;
    this.rawY = 0;
    this.pauseTimer = null;
    this.suspended = false;
    this.running = false;
    this.handleMove = (e) => this.onMove(e);
    this.handlePauseTimeout = () => this.onPauseTimeout();
    this.handleVisibilityChange = () => this.syncSuspendedState();
    this.handleBlur = () => this.suspend();
    this.handleFocus = () => this.syncSuspendedState();
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.hasSample = false;
    this.suspended = document.visibilityState !== "visible";
    window.addEventListener("pointermove", this.handleMove, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("focus", this.handleFocus);
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("pointermove", this.handleMove);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("focus", this.handleFocus);
    this.clearPauseTimer();
    this.hasSample = false;
  }
  onMove(e) {
    if (this.suspended) return;
    const x = e.clientX;
    const y = e.clientY;
    this.rawX = x;
    this.rawY = y;
    if (!this.hasSample) {
      this.emitSample(x, y, Date.now());
      this.schedulePauseTimer();
    } else {
      const t = Date.now();
      const dt = t - this.lastEmittedTime;
      if (dt >= this.config.sampleInterval) {
        this.emitSample(x, y, t);
        this.schedulePauseTimer();
      } else if (distance(this.lastEmittedX, this.lastEmittedY, x, y) >= this.config.minimumDistance) {
        this.emitSample(x, y, t);
        this.schedulePauseTimer();
      }
    }
  }
  onPauseTimeout() {
    this.pauseTimer = null;
    if (this.suspended || !this.hasSample) return;
    this.emitSample(this.rawX, this.rawY, Date.now());
  }
  schedulePauseTimer() {
    this.clearPauseTimer();
    this.pauseTimer = setTimeout(this.handlePauseTimeout, this.config.pauseThreshold);
  }
  clearPauseTimer() {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }
  emitSample(x, y, timestamp) {
    this.lastEmittedX = x;
    this.lastEmittedY = y;
    this.lastEmittedTime = timestamp;
    this.hasSample = true;
    const payload = {
      timestamp,
      x,
      y,
      documentX: x + window.scrollX,
      documentY: y + window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth),
      documentHeight: Math.max(document.documentElement.scrollHeight, document.documentElement.clientHeight)
    };
    this.bus.emit("cursor", payload);
  }
  syncSuspendedState() {
    const shouldSuspend = document.visibilityState !== "visible" || !document.hasFocus();
    if (shouldSuspend) this.suspend();
    else this.resume();
  }
  suspend() {
    this.suspended = true;
    this.clearPauseTimer();
    this.hasSample = false;
  }
  resume() {
    this.suspended = false;
  }
}
function normalizeStep(step) {
  if (typeof step === "string") return { kind: "page", matcher: step };
  if ("path" in step) return { kind: "page", matcher: step.path };
  return { kind: "event", matcher: step.event };
}
function matchesPath(pattern, path) {
  if (pattern.endsWith("/*")) {
    return path.startsWith(pattern.slice(0, -1));
  }
  return pattern === path;
}
class FunnelTracker {
  constructor(bus) {
    this.bus = bus;
    this.funnels = /* @__PURE__ */ new Map();
    this.progress = /* @__PURE__ */ new Map();
  }
  define(name, steps) {
    const kind = normalizeStep(steps[0]).kind;
    this.funnels.set(name, { name, steps, kind });
    this.progress.set(name, { name, currentStepIndex: -1 });
  }
  /** Called on every page view (initial load + SPA route change). */
  onPageView(path) {
    for (const funnel of this.funnels.values()) {
      if (funnel.kind !== "page") continue;
      this.tryAdvance(funnel, path);
    }
  }
  /** Called on every analytics.event() call. */
  onCustomEvent(eventName) {
    for (const funnel of this.funnels.values()) {
      if (funnel.kind !== "event") continue;
      this.tryAdvance(funnel, eventName);
    }
  }
  tryAdvance(funnel, value) {
    const progress = this.progress.get(funnel.name);
    if (progress.completedAt) return;
    const nextIndex = progress.currentStepIndex + 1;
    if (nextIndex >= funnel.steps.length) return;
    const nextStep = normalizeStep(funnel.steps[nextIndex]);
    const isMatch = nextStep.kind === "page" ? matchesPath(nextStep.matcher, value) : nextStep.matcher === value;
    if (!isMatch) return;
    progress.currentStepIndex = nextIndex;
    if (nextIndex === 0) progress.startedAt = Date.now();
    const completed = nextIndex === funnel.steps.length - 1;
    if (completed) progress.completedAt = Date.now();
    const payload = {
      funnelName: funnel.name,
      stepIndex: nextIndex,
      stepLabel: nextStep.matcher,
      status: completed ? "funnel_completed" : "step_completed"
    };
    this.bus.emit("funnel", payload);
  }
  /** Returns a snapshot of all funnel progress, useful for debugging. */
  getProgress() {
    return [...this.progress.values()];
  }
}
const INTERACTIVE_SELECTOR = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [tabindex]:not([tabindex="-1"])';
const MAX_ELEMENTS_PER_CRAWL = 500;
class ElementCrawler {
  constructor(bus, privacy) {
    this.bus = bus;
    this.privacy = privacy;
    this.selectorGenerator = new SelectorGenerator();
  }
  crawl() {
    if (typeof document === "undefined") return;
    const candidates = document.querySelectorAll(INTERACTIVE_SELECTOR);
    const seenSelectors = /* @__PURE__ */ new Set();
    const elements = [];
    for (const el of Array.from(candidates)) {
      if (elements.length >= MAX_ELEMENTS_PER_CRAWL) break;
      if (!this.privacy.shouldCapture(el)) continue;
      const descriptor = this.selectorGenerator.describe(el);
      if (seenSelectors.has(descriptor.selector)) continue;
      seenSelectors.add(descriptor.selector);
      elements.push({
        selector: descriptor.selector,
        tagName: descriptor.tagName,
        ...descriptor.label && { label: descriptor.label },
        ...descriptor.role && { role: descriptor.role }
      });
    }
    if (elements.length === 0) return;
    this.bus.emit("elements_seen", { pagePath: location.pathname, elements });
  }
}
function generateId(prefix) {
  const rand = randomHex(16);
  const time = Date.now().toString(36);
  const id = `${time}-${rand}`;
  return prefix ? `${prefix}_${id}` : id;
}
function randomHex(length) {
  let out = "";
  const cryptoObj = typeof crypto !== "undefined" ? crypto : void 0;
  if (cryptoObj && "getRandomValues" in cryptoObj) {
    const arr = new Uint8Array(length / 2);
    cryptoObj.getRandomValues(arr);
    for (const byte of arr) out += byte.toString(16).padStart(2, "0");
  } else {
    for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}
function now() {
  return Date.now();
}
const currentScriptElement = typeof document !== "undefined" && document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
const currentScriptUrl = (currentScriptElement == null ? void 0 : currentScriptElement.src) ?? null;
const pendingLoads = /* @__PURE__ */ new Map();
function deriveSiblingBundleUrl(scriptUrl, bundle) {
  if (!scriptUrl) return null;
  try {
    const url = new URL(scriptUrl, typeof location === "undefined" ? void 0 : location.href);
    const parts = url.pathname.split("/");
    const file = parts[parts.length - 1] ?? "";
    const readable = file === "sdk.js";
    if (file !== "sdk.js" && file !== "sdk.min.js" && file !== "v1.js" && file !== "v1.min.js") {
      return null;
    }
    parts[parts.length - 1] = `sdk-${bundle}${readable ? "" : ".min"}.js`;
    url.pathname = parts.join("/");
    return url.href;
  } catch {
    return null;
  }
}
function sdkBundleUrl(bundle, overrideUrl) {
  return overrideUrl || deriveSiblingBundleUrl(currentScriptUrl, bundle);
}
function loadSdkBundle(url, globalCheck, label) {
  const available = globalCheck();
  if (available) return Promise.resolve(available);
  if (!url || typeof document === "undefined") return Promise.resolve(null);
  const existingPromise = pendingLoads.get(url);
  if (existingPromise) return existingPromise;
  const promise = new Promise((resolve) => {
    const selector = `script[data-movcues-bundle-url="${escapeAttribute(url)}"]`;
    const existing = document.querySelector(selector);
    const script = existing ?? document.createElement("script");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    script.addEventListener("load", () => finish(globalCheck() ?? null), { once: true });
    script.addEventListener("error", () => {
      console.warn(`[Analytics] failed to load ${label} bundle from ${url}`);
      finish(null);
    }, { once: true });
    if (!existing) {
      script.src = url;
      script.async = true;
      script.dataset.movcuesBundleUrl = url;
      (document.head ?? document.documentElement).appendChild(script);
    }
  });
  pendingLoads.set(url, promise);
  return promise;
}
function escapeAttribute(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
const MVP1_POLICY = Object.freeze({
  // Keep normal click analytics focused on intentional UI interactions.
  // Raw, privacy-approved clicks still flow locally for rage detection.
  interactiveClicksOnly: true,
  cursor: false,
  hover: false,
  move: false,
  sessionReplay: false,
  heatmaps: false
});
class RRWebRecorder {
  constructor(bus, config) {
    this.bus = bus;
    this.config = config;
    this.replaySessionId = null;
    this.seq = 0;
    this.running = false;
    this.paused = false;
    this.generation = 0;
    this.loadPromise = null;
  }
  /**
   * Starts rrweb recording. No-op if already running. Callers (Analytics)
   * are expected to check `config.enabled` before calling this, but we
   * double-check here as a defensive guard against direct/misuse calls -
   * recording must never start unless explicitly enabled.
   *
   * Async because it may need to fetch the replay bundle first; the rest
   * of the SDK never awaits this, so a slow/failed load only affects
   * replay, never autocapture.
   */
  async start() {
    if (this.running) return;
    if (!MVP1_POLICY.sessionReplay || !this.config.enabled) return;
    if (typeof document === "undefined") return;
    const generation = ++this.generation;
    const record = this.recordFn ?? await this.loadRecordFn();
    if (!record) return;
    if (generation !== this.generation) return;
    this.recordFn = record;
    this.replaySessionId = generateId("replay");
    this.seq = 0;
    this.paused = false;
    this.stopFn = record(this.buildRecordOptions());
    this.running = true;
  }
  stop() {
    var _a;
    this.generation++;
    if (!this.running) return;
    (_a = this.stopFn) == null ? void 0 : _a.call(this);
    this.stopFn = void 0;
    this.running = false;
    this.paused = false;
    this.replaySessionId = null;
  }
  /**
   * rrweb's record() does not expose pause/resume in this version, so
   * pausing is implemented by tearing down the underlying recorder while
   * keeping the same replay session id and sequence counter. Resuming
   * starts a fresh rrweb recorder (which begins with a full snapshot) so
   * the backend can always reconstruct a valid frame after a gap.
   */
  pause() {
    var _a;
    if (!this.running || this.paused) return;
    (_a = this.stopFn) == null ? void 0 : _a.call(this);
    this.stopFn = void 0;
    this.paused = true;
  }
  resume() {
    if (!this.running || !this.paused || !this.recordFn) return;
    this.paused = false;
    this.stopFn = this.recordFn(this.buildRecordOptions());
  }
  isRunning() {
    return this.running && !this.paused;
  }
  /** Injects and awaits the separate replay bundle, caching the in-flight promise so concurrent start() calls share one load. */
  loadRecordFn() {
    const w = window;
    if (w.__aaRRWebRecord__) return Promise.resolve(w.__aaRRWebRecord__);
    if (this.loadPromise) return this.loadPromise;
    const url = sdkBundleUrl("replay", this.config.bundleUrl);
    if (!url) {
      console.warn(
        "[Analytics] sessionReplay.enabled is true but the replay bundle URL could not be determined automatically. Set sessionReplay.bundleUrl explicitly."
      );
      return Promise.resolve(null);
    }
    this.loadPromise = loadSdkBundle(url, () => w.__aaRRWebRecord__, "session replay");
    return this.loadPromise;
  }
  buildRecordOptions() {
    const maskTextSelector = this.config.maskTextSelector ? `${this.config.maskTextSelector}, input, textarea` : void 0;
    return {
      emit: (event) => this.handleEvent(event),
      // --- Privacy: safe defaults; masking is never opt-out ---
      maskAllInputs: this.config.maskAllInputs,
      maskTextSelector,
      blockSelector: this.config.blockSelector,
      // Password fields are always masked regardless of maskAllInputs, so a
      // future config change elsewhere can't accidentally weaken this.
      maskInputOptions: { password: true },
      // --- Performance ---
      recordCanvas: this.config.recordCanvas,
      collectFonts: this.config.collectFonts,
      checkoutEveryNms: this.config.checkoutEveryNms,
      sampling: {
        // Throttle mouse move sampling instead of recording every pixel -
        // CursorCollector already handles high-fidelity cursor data for
        // analytics; rrweb only needs enough to reconstruct a visually
        // smooth replay.
        mousemove: this.config.sampleMouseMovement ? 50 : false,
        scroll: 150,
        input: "last"
      }
    };
  }
  handleEvent(event) {
    if (!this.replaySessionId) return;
    const payload = {
      replaySessionId: this.replaySessionId,
      seq: this.seq++,
      rrwebEvent: event
    };
    this.bus.emit("session_replay_event", payload);
  }
}
class AutoCaptureEngine {
  constructor(config) {
    this.config = config;
    this.bus = new EventBus();
    this.privacy = new PrivacyFilter();
    this.started = false;
    this.discoveryInitialized = false;
    this.pendingInitialCrawl = null;
    this.click = new ClickCollector(this.bus, this.privacy);
    this.scroll = new ScrollCollector(this.bus, config.scroll);
    this.move = new MoveCollector(this.bus, config.move);
    this.rageClick = new RageClickDetector(this.bus, config.rageClick);
    this.hover = new HoverCollector(this.bus, this.privacy, config.hover);
    this.cursor = new CursorCollector(this.bus, config.cursor);
    this.funnel = new FunnelTracker(this.bus);
    this.elementCrawler = new ElementCrawler(this.bus, this.privacy);
    this.sessionReplay = new RRWebRecorder(this.bus, config.sessionReplay);
  }
  start() {
    if (this.started) return;
    this.started = true;
    const ac = this.config.autocapture;
    if (ac.click) this.click.start();
    if (ac.scroll) this.scroll.start();
    if (MVP1_POLICY.move && ac.move) this.move.start();
    if (ac.rageClick && ac.click) this.rageClick.start();
    if (MVP1_POLICY.hover && ac.hover) this.hover.start();
    if (MVP1_POLICY.cursor && ac.cursor) this.cursor.start();
    if (MVP1_POLICY.sessionReplay && this.config.sessionReplay.enabled) void this.sessionReplay.start();
  }
  /**
   * Starts structural Page/Element discovery for the initialized SDK.
   * This lifecycle is intentionally independent of behavioral start/stop.
   */
  initializeElementDiscovery() {
    if (this.discoveryInitialized || !this.config.autocapture.elementCrawler) return;
    this.discoveryInitialized = true;
    this.scheduleInitialCrawl();
  }
  /** Runs the first crawl once the DOM actually has content - a crawl fired before parsing finishes would just find nothing. */
  scheduleInitialCrawl() {
    if (typeof document === "undefined") return;
    if (document.readyState === "loading") {
      this.pendingInitialCrawl = () => {
        this.pendingInitialCrawl = null;
        if (this.discoveryInitialized) this.elementCrawler.crawl();
      };
      document.addEventListener("DOMContentLoaded", this.pendingInitialCrawl, { once: true });
    } else {
      this.elementCrawler.crawl();
    }
  }
  /** Completely tears down discovery scheduling during Analytics.destroy(). */
  destroyElementDiscovery() {
    this.discoveryInitialized = false;
    if (this.pendingInitialCrawl && typeof document !== "undefined") {
      document.removeEventListener("DOMContentLoaded", this.pendingInitialCrawl);
      this.pendingInitialCrawl = null;
    }
  }
  stop() {
    if (!this.started) return;
    this.started = false;
    this.click.stop();
    this.scroll.stop();
    this.move.stop();
    this.rageClick.stop();
    this.hover.stop();
    this.cursor.stop();
    this.sessionReplay.stop();
  }
  /** Called on SPA route changes; discovery remains active even when behavioral capture is stopped. */
  onRouteChange(path, behavioralCaptureActive = true) {
    if (behavioralCaptureActive) {
      this.scroll.reset();
      this.funnel.onPageView(path);
    }
    if (this.discoveryInitialized) this.elementCrawler.crawl();
  }
  isRunning() {
    return this.started;
  }
}
class SafeStorage {
  constructor(area) {
    this.area = area;
  }
  get store() {
    try {
      const s = window[this.area];
      const testKey = "__analytics_test__";
      s.setItem(testKey, "1");
      s.removeItem(testKey);
      return s;
    } catch {
      return null;
    }
  }
  get(key) {
    var _a;
    try {
      return ((_a = this.store) == null ? void 0 : _a.getItem(key)) ?? null;
    } catch {
      return null;
    }
  }
  set(key, value) {
    var _a;
    try {
      (_a = this.store) == null ? void 0 : _a.setItem(key, value);
    } catch {
    }
  }
  remove(key) {
    var _a;
    try {
      (_a = this.store) == null ? void 0 : _a.removeItem(key);
    } catch {
    }
  }
}
const localStore = new SafeStorage("localStorage");
const sessionStore = new SafeStorage("sessionStorage");
const ANON_ID_KEY = "__aa_anon_id__";
const SESSION_ID_KEY = "__aa_session_id__";
const SESSION_LAST_ACTIVE_KEY = "__aa_session_last_active__";
class SessionManager {
  constructor(inactivityMs = 30 * 60 * 1e3) {
    this.inactivityMs = inactivityMs;
    this.anonymousId = this.loadOrCreateAnonymousId();
    const restored = this.loadOrCreateSessionId();
    this.sessionId = restored.id;
    this.lastActivity = restored.lastActive;
    this.sessionJustStarted = restored.isNew;
    this.pageViewId = generateId("pv");
  }
  loadOrCreateAnonymousId() {
    let id = localStore.get(ANON_ID_KEY);
    if (!id) {
      id = generateId("anon");
      localStore.set(ANON_ID_KEY, id);
    }
    return id;
  }
  loadOrCreateSessionId() {
    const existingId = sessionStore.get(SESSION_ID_KEY);
    const existingLastActive = Number(sessionStore.get(SESSION_LAST_ACTIVE_KEY) || 0);
    const fresh = now();
    if (existingId && fresh - existingLastActive < this.inactivityMs) {
      sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(fresh));
      return { id: existingId, lastActive: fresh, isNew: false };
    }
    const id = generateId("sess");
    sessionStore.set(SESSION_ID_KEY, id);
    sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(fresh));
    return { id, lastActive: fresh, isNew: true };
  }
  /** Call on any behavioral event to keep the session alive and rotate if expired. */
  touch() {
    const t = now();
    if (t - this.lastActivity >= this.inactivityMs) {
      this.sessionId = generateId("sess");
      sessionStore.set(SESSION_ID_KEY, this.sessionId);
      this.sessionJustStarted = true;
    }
    this.lastActivity = t;
    sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(t));
  }
  /**
   * Reads and clears the "a new session just began" flag - call once
   * per touch() to decide whether to emit a session_start event before
   * the event that triggered the touch (see Analytics.enqueueEvent).
   * Idempotent: calling it again before the next rotation returns false.
   */
  consumeSessionStarted() {
    const started = this.sessionJustStarted;
    this.sessionJustStarted = false;
    return started;
  }
  /** Call on SPA route changes to start a new page view context. */
  newPageView() {
    this.pageViewId = generateId("pv");
  }
  getAnonymousId() {
    return this.anonymousId;
  }
  getSessionId() {
    return this.sessionId;
  }
  getPageViewId() {
    return this.pageViewId;
  }
  /** Allow identify() to bind a known user id to the anonymous id (kept locally only). */
  identify(userId) {
    localStore.set(ANON_ID_KEY, this.anonymousId);
    sessionStore.set("__aa_identified_user__", userId);
  }
  /** Start a fresh visitor/session after logout or an account switch. */
  reset() {
    this.anonymousId = generateId("anon");
    this.sessionId = generateId("sess");
    this.pageViewId = generateId("pv");
    this.lastActivity = now();
    this.sessionJustStarted = true;
    localStore.set(ANON_ID_KEY, this.anonymousId);
    sessionStore.set(SESSION_ID_KEY, this.sessionId);
    sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(this.lastActivity));
    sessionStore.remove("__aa_identified_user__");
  }
  getIdentifiedUserId() {
    return sessionStore.get("__aa_identified_user__");
  }
}
const _EventQueue = class _EventQueue {
  constructor(options) {
    this.events = [];
    this.maxQueueSize = options.maxQueueSize;
  }
  push(event) {
    if (this.events.length >= this.maxQueueSize) {
      this.dropToMakeRoom();
    }
    this.events.push(event);
  }
  dropToMakeRoom() {
    const lowPriorityIndex = this.events.findIndex(
      (e) => _EventQueue.LOW_PRIORITY_TYPES.has(e.type)
    );
    if (lowPriorityIndex !== -1) {
      this.events.splice(lowPriorityIndex, 1);
    } else {
      this.events.shift();
    }
  }
  size() {
    return this.events.length;
  }
  isEmpty() {
    return this.events.length === 0;
  }
  /** Remove and return up to `count` events (oldest first) without deleting the rest. */
  takeBatch(count) {
    return this.events.splice(0, count);
  }
  /** Return all events currently queued without removing them. */
  peekAll() {
    return [...this.events];
  }
  drainAll() {
    const all = this.events;
    this.events = [];
    return all;
  }
  /** Put events back at the front of the queue (used when a send fails and should be retried). */
  requeueFront(events) {
    this.events = [...events, ...this.events].slice(-this.maxQueueSize);
  }
  clear() {
    this.events = [];
  }
};
_EventQueue.LOW_PRIORITY_TYPES = /* @__PURE__ */ new Set(["move", "scroll", "cursor"]);
let EventQueue = _EventQueue;
const UNSUPPORTED_BY_BACKEND = /* @__PURE__ */ new Set(["move", "funnel"]);
function toBackendElement(descriptor) {
  return {
    selector: descriptor.selector,
    ...descriptor.label && { label: descriptor.label },
    ...descriptor.role && { role: descriptor.role }
  };
}
function mapToBackendEvent(event) {
  var _a, _b;
  if (UNSUPPORTED_BY_BACKEND.has(event.type) || event.type === "session_replay_event") return null;
  const viewportWidth = event.page.viewportWidth > 0 ? event.page.viewportWidth : void 0;
  const viewportHeight = event.page.viewportHeight > 0 ? event.page.viewportHeight : void 0;
  const heatmapContext = {
    path: event.page.path,
    ...event.page.documentWidth > 0 && { documentWidth: event.page.documentWidth },
    ...event.page.documentHeight > 0 && { documentHeight: event.page.documentHeight },
    ...((_a = event.heatmap) == null ? void 0 : _a.deviceClass) && { deviceClass: event.heatmap.deviceClass },
    ...((_b = event.heatmap) == null ? void 0 : _b.stateId) && { heatmapStateId: event.heatmap.stateId }
  };
  switch (event.type) {
    case "page_view":
      return {
        type: "page_view",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext
      };
    case "click": {
      const p = event.payload;
      const x = Math.max(0, Math.min(2e4, Math.floor(p.coordinates.clientX)));
      const y = Math.max(0, Math.min(2e5, Math.floor(p.coordinates.clientY)));
      return {
        type: "click",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        element: toBackendElement(p.element),
        x,
        y,
        documentX: Math.max(0, Math.min(2e4, Math.floor(p.coordinates.documentX ?? p.coordinates.pageX))),
        documentY: Math.max(0, Math.min(2e5, Math.floor(p.coordinates.documentY ?? p.coordinates.pageY))),
        ...viewportWidth !== void 0 && { viewportWidth },
        ...viewportHeight !== void 0 && { viewportHeight }
      };
    }
    case "hover": {
      const p = event.payload;
      const x = p.x !== void 0 ? Math.max(0, Math.min(2e4, Math.floor(p.x))) : void 0;
      const y = p.y !== void 0 ? Math.max(0, Math.min(2e5, Math.floor(p.y))) : void 0;
      return {
        type: "hover",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        element: toBackendElement(p.element),
        durationMs: p.durationMs,
        ...x !== void 0 && { x },
        ...y !== void 0 && { y },
        ...p.documentX !== void 0 && { documentX: Math.max(0, Math.min(2e4, Math.floor(p.documentX))) },
        ...p.documentY !== void 0 && { documentY: Math.max(0, Math.min(2e5, Math.floor(p.documentY))) },
        ...viewportWidth !== void 0 && { viewportWidth },
        ...viewportHeight !== void 0 && { viewportHeight }
      };
    }
    case "scroll": {
      const p = event.payload;
      const scrollPercent = Math.max(0, Math.min(100, Math.round(p.scrollPercent)));
      return {
        type: "scroll",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        scrollPercent,
        ...viewportWidth !== void 0 && { viewportWidth },
        ...viewportHeight !== void 0 && { viewportHeight }
      };
    }
    case "cursor": {
      const p = event.payload;
      const cursorViewportWidth = p.viewportWidth > 0 ? p.viewportWidth : void 0;
      const cursorViewportHeight = p.viewportHeight > 0 ? p.viewportHeight : void 0;
      const x = Math.max(0, Math.min(2e4, Math.floor(p.x)));
      const y = Math.max(0, Math.min(2e5, Math.floor(p.y)));
      return {
        type: "cursor",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        x,
        y,
        documentX: Math.max(0, Math.min(2e4, Math.floor(p.documentX ?? p.x))),
        documentY: Math.max(0, Math.min(2e5, Math.floor(p.documentY ?? p.y))),
        ...p.documentWidth !== void 0 && { documentWidth: p.documentWidth },
        ...p.documentHeight !== void 0 && { documentHeight: p.documentHeight },
        ...cursorViewportWidth !== void 0 && { viewportWidth: cursorViewportWidth },
        ...cursorViewportHeight !== void 0 && { viewportHeight: cursorViewportHeight }
      };
    }
    case "rage_click": {
      const p = event.payload;
      const x = Math.max(0, Math.min(2e4, Math.floor(p.coordinates.x)));
      const y = Math.max(0, Math.min(2e5, Math.floor(p.coordinates.y)));
      return {
        type: "rage_click",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        ...p.targetSelector && { element: { selector: p.targetSelector } },
        x,
        y,
        documentX: Math.max(0, Math.min(2e4, Math.floor(p.coordinates.documentX ?? x))),
        documentY: Math.max(0, Math.min(2e5, Math.floor(p.coordinates.documentY ?? y))),
        rageClickCount: p.clickCount,
        durationMs: p.durationMs,
        ...viewportWidth !== void 0 && { viewportWidth },
        ...viewportHeight !== void 0 && { viewportHeight }
      };
    }
    case "identify": {
      const p = event.payload;
      return {
        type: "identify",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        externalUserId: p.userId,
        ...p.traits !== void 0 && { traits: p.traits }
      };
    }
    case "session_start": {
      const p = event.payload;
      return {
        type: "session_start",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...p.browserName !== void 0 && { browserName: p.browserName },
        ...p.browserVersion !== void 0 && { browserVersion: p.browserVersion },
        ...p.osName !== void 0 && { osName: p.osName },
        ...p.osVersion !== void 0 && { osVersion: p.osVersion },
        ...p.deviceType !== void 0 && { deviceType: p.deviceType },
        ...p.language !== void 0 && { language: p.language },
        ...p.timezone !== void 0 && { timezone: p.timezone },
        ...p.screenWidth !== void 0 && { screenWidth: p.screenWidth },
        ...p.screenHeight !== void 0 && { screenHeight: p.screenHeight },
        ...p.referrer !== void 0 && { referrer: p.referrer }
      };
    }
    case "custom": {
      const p = event.payload;
      return {
        type: "custom",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        name: p.name,
        ...p.properties !== void 0 && { properties: p.properties }
      };
    }
    default:
      return null;
  }
}
function mapToBackendReplayEvent(event) {
  const rrwebEvent = event.payload.rrwebEvent;
  return {
    type: rrwebEvent.type,
    timestamp: rrwebEvent.timestamp,
    data: rrwebEvent.data
  };
}
function groupBySessionId(events) {
  const groups = /* @__PURE__ */ new Map();
  for (const event of events) {
    const list = groups.get(event.sessionId);
    if (list) list.push(event);
    else groups.set(event.sessionId, [event]);
  }
  return groups;
}
class Transport {
  constructor(apiBase, siteId) {
    this.apiBase = apiBase;
    this.siteId = siteId;
  }
  setEndpoint(apiBase) {
    this.apiBase = apiBase;
  }
  eventsUrl() {
    return `${this.apiBase}/public/sites/${this.siteId}/events`;
  }
  replayUrl() {
    return `${this.apiBase}/public/sites/${this.siteId}/replay`;
  }
  elementsUrl() {
    return `${this.apiBase}/public/sites/${this.siteId}/elements`;
  }
  /**
   * Sends a batch of crawled elements (see ElementCrawler.ts) to their
   * own endpoint - a page-level catalog snapshot, not a per-session
   * interaction stream, so it deliberately bypasses the batched
   * event queue/retry machinery `send`/`sendBeacon` use: crawls are
   * infrequent (page load + route change), so a simple best-effort
   * POST per crawl is the right amount of machinery, not the queue
   * built for continuous click/hover/scroll/cursor telemetry.
   */
  async sendElements(pagePath, elements) {
    if (!this.apiBase || elements.length === 0) return { ok: true, retryable: false };
    return this.postJson(this.elementsUrl(), { pagePath, elements });
  }
  /** Best-effort async send used during normal operation. */
  async send(events) {
    if (!this.apiBase || events.length === 0) return { ok: true, retryable: false };
    const { standardGroups, replayGroups } = partition(events);
    const results = [];
    for (const [sessionId, group] of standardGroups) {
      results.push(await this.postJson(this.eventsUrl(), { sessionId, events: group }));
    }
    for (const [sessionId, group] of replayGroups) {
      results.push(await this.postJson(this.replayUrl(), { sessionId, events: group }));
    }
    if (results.length === 0) return { ok: true, retryable: false };
    const ok = results.every((r) => r.ok);
    const retryable = !ok && results.some((r) => r.retryable);
    return { ok, retryable };
  }
  async postJson(url, body) {
    const payload = JSON.stringify(body);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: payload.length < 6e4,
        // keepalive has payload size limits in most browsers
        credentials: "omit"
      });
      if (res.ok) return { ok: true, retryable: false };
      const text = await res.text().catch(() => "<unreadable body>");
      console.error(`[Transport] ${res.status} ${res.statusText} from ${url}`, {
        responseBody: text,
        requestBody: body
      });
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, retryable };
    } catch (err) {
      console.error(`[Transport] network error posting to ${url}`, err);
      return { ok: false, retryable: true };
    }
  }
  /** Unload-safe fire-and-forget send. No retry possible after this. */
  sendBeacon(events) {
    if (!this.apiBase || events.length === 0) return true;
    const { standardGroups, replayGroups } = partition(events);
    let allOk = true;
    for (const [sessionId, group] of standardGroups) {
      allOk = this.beaconOrFallback(this.eventsUrl(), { sessionId, events: group }) && allOk;
    }
    for (const [sessionId, group] of replayGroups) {
      allOk = this.beaconOrFallback(this.replayUrl(), { sessionId, events: group }) && allOk;
    }
    return allOk;
  }
  beaconOrFallback(url, body) {
    const payload = JSON.stringify(body);
    try {
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(url, blob)) return true;
      }
    } catch {
    }
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "omit"
      }).catch(() => void 0);
      return true;
    } catch {
      return false;
    }
  }
}
function partition(events) {
  const standardEvents = events.filter((e) => e.type !== "session_replay_event");
  const replayEvents = events.filter(
    (e) => e.type === "session_replay_event"
  );
  const standardGroups = /* @__PURE__ */ new Map();
  for (const [sessionId, group] of groupBySessionId(standardEvents)) {
    const mapped = group.map(mapToBackendEvent).filter((e) => e !== null);
    if (mapped.length > 0) standardGroups.set(sessionId, mapped);
  }
  const replayGroups = /* @__PURE__ */ new Map();
  for (const [sessionId, group] of groupBySessionId(replayEvents)) {
    replayGroups.set(sessionId, group.map(mapToBackendReplayEvent));
  }
  return { standardGroups, replayGroups };
}
class Batcher {
  constructor(queue, transport, config, log = () => void 0) {
    this.queue = queue;
    this.transport = transport;
    this.config = config;
    this.log = log;
    this.timer = null;
    this.retryCount = 0;
    this.flushing = false;
    this.flushPromise = null;
    this.stopped = false;
  }
  start() {
    this.stopped = false;
    this.scheduleTimer();
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  enqueue(event) {
    this.queue.push(event);
    if (this.queue.size() >= this.config.maxBatchSize) {
      void this.flush();
    }
  }
  scheduleTimer() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.config.maxWaitMs);
  }
  async flush() {
    if (this.flushPromise) return this.flushPromise;
    if (this.stopped) return;
    if (this.queue.isEmpty()) {
      this.scheduleTimer();
      return;
    }
    this.flushPromise = this.performFlush().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }
  /** Flush every event queued before/during this call and wait for transport completion. */
  async flushAndWait() {
    while (!this.stopped) {
      if (this.flushPromise) await this.flushPromise;
      else if (!this.queue.isEmpty()) await this.flush();
      else return;
    }
  }
  async performFlush() {
    this.flushing = true;
    const batch = this.queue.takeBatch(this.config.maxBatchSize);
    try {
      const result = await this.transport.send(batch);
      if (result.ok) {
        this.retryCount = 0;
        this.log(`[Analytics] batch flushed (${batch.length} events)`);
      } else if (result.retryable && this.retryCount < this.config.maxRetries) {
        this.retryCount += 1;
        const delay = this.config.retryBaseDelayMs * Math.pow(2, this.retryCount - 1);
        this.queue.requeueFront(batch);
        this.log(`[Analytics] flush failed, retrying in ${delay}ms (attempt ${this.retryCount})`);
        setTimeout(() => void this.flush(), delay);
      } else {
        this.log(`[Analytics] batch dropped after failed send (${batch.length} events)`);
      }
    } catch (err) {
      this.log("[Analytics] unexpected transport error, dropping batch", err);
    } finally {
      this.flushing = false;
      this.scheduleTimer();
    }
  }
  /** Synchronous, unload-safe flush of everything currently queued. */
  flushSync() {
    if (this.queue.isEmpty()) return;
    const all = this.queue.drainAll();
    this.transport.sendBeacon(all);
  }
}
function getPageContext() {
  const doc = document.documentElement;
  return {
    url: location.href,
    path: location.pathname,
    hostname: location.hostname,
    referrer: document.referrer || void 0,
    title: document.title || void 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: Math.max(doc.scrollWidth, doc.clientWidth),
    documentHeight: Math.max(doc.scrollHeight, doc.clientHeight),
    devicePixelRatio: window.devicePixelRatio || 1
  };
}
function captureEnvironmentSnapshot() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const browser = parseBrowser(ua);
  const os = parseOS(ua);
  return {
    browserName: browser == null ? void 0 : browser.name,
    browserVersion: browser == null ? void 0 : browser.version,
    osName: os == null ? void 0 : os.name,
    osVersion: os == null ? void 0 : os.version,
    deviceType: parseDeviceType(ua),
    language: safeLanguage(),
    timezone: safeTimezone(),
    screenWidth: safeScreenDimension("width"),
    screenHeight: safeScreenDimension("height"),
    referrer: typeof document !== "undefined" ? document.referrer || void 0 : void 0
  };
}
function parseBrowser(ua) {
  const patterns = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/CriOS\/([\d.]+)/, "Chrome"],
    // Chrome on iOS
    [/FxiOS\/([\d.]+)/, "Firefox"],
    // Firefox on iOS
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari\//, "Safari"]
  ];
  for (const [re, name] of patterns) {
    const match = ua.match(re);
    if (match) return { name, version: match[1] };
  }
  return null;
}
function parseOS(ua) {
  const patterns = [
    [/Windows NT ([\d.]+)/, "Windows"],
    [/CrOS \S+ ([\d.]+)/, "ChromeOS"],
    [/Mac OS X ([\d_.]+)/, "macOS", dotted],
    [/iPad; CPU OS ([\d_]+)/, "iPadOS", dotted],
    [/iPhone OS ([\d_]+)/, "iOS", dotted],
    [/Android ([\d.]+)/, "Android"],
    [/Linux/, "Linux"]
  ];
  for (const [re, name, transform] of patterns) {
    const match = ua.match(re);
    if (match) return { name, version: transform ? transform(match[1] ?? "") : match[1] ?? "" };
  }
  return null;
}
function dotted(raw) {
  return raw.replace(/_/g, ".");
}
function parseDeviceType(ua) {
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)) return "mobile";
  return "desktop";
}
function safeLanguage() {
  try {
    return navigator.language || void 0;
  } catch {
    return void 0;
  }
}
function safeTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return void 0;
  }
}
function safeScreenDimension(dim) {
  var _a;
  try {
    return ((_a = window.screen) == null ? void 0 : _a[dim]) || void 0;
  } catch {
    return void 0;
  }
}
function resolveConfig(input) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L;
  if (!input || !input.siteId) {
    throw new Error("[Analytics] init() requires a `siteId`");
  }
  return {
    siteId: input.siteId,
    endpoint: input.endpoint || "https://api.movcues.com",
    experienceRuntimeBundleUrl: input.experienceRuntimeBundleUrl ?? "",
    editorRuntimeBundleUrl: input.editorRuntimeBundleUrl ?? "",
    heatmapSnapshotBundleUrl: input.heatmapSnapshotBundleUrl ?? "",
    debug: input.debug ?? true,
    sessionInactivityMs: input.sessionInactivityMs ?? 30 * 60 * 1e3,
    respectDoNotTrack: input.respectDoNotTrack ?? false,
    autocapture: {
      click: ((_a = input.autocapture) == null ? void 0 : _a.click) ?? true,
      scroll: ((_b = input.autocapture) == null ? void 0 : _b.scroll) ?? true,
      move: MVP1_POLICY.move && (((_c = input.autocapture) == null ? void 0 : _c.move) ?? false),
      rageClick: ((_d = input.autocapture) == null ? void 0 : _d.rageClick) ?? true,
      hover: MVP1_POLICY.hover && (((_e = input.autocapture) == null ? void 0 : _e.hover) ?? false),
      cursor: MVP1_POLICY.cursor && (((_f = input.autocapture) == null ? void 0 : _f.cursor) ?? false),
      elementCrawler: ((_g = input.autocapture) == null ? void 0 : _g.elementCrawler) ?? true
    },
    rageClick: {
      minClicks: ((_h = input.rageClick) == null ? void 0 : _h.minClicks) ?? 4,
      timeWindowMs: ((_i = input.rageClick) == null ? void 0 : _i.timeWindowMs) ?? 1e3,
      radiusPx: ((_j = input.rageClick) == null ? void 0 : _j.radiusPx) ?? 40,
      ignoreDoubleClickMs: ((_k = input.rageClick) == null ? void 0 : _k.ignoreDoubleClickMs) ?? 250
    },
    move: {
      samplesPerSecond: ((_l = input.move) == null ? void 0 : _l.samplesPerSecond) ?? 12,
      minMovementPx: ((_m = input.move) == null ? void 0 : _m.minMovementPx) ?? 2
    },
    scroll: {
      throttleMs: ((_n = input.scroll) == null ? void 0 : _n.throttleMs) ?? 100,
      milestones: ((_o = input.scroll) == null ? void 0 : _o.milestones) ?? [25, 50, 75, 90, 100]
    },
    hover: {
      minHoverMs: ((_p = input.hover) == null ? void 0 : _p.minHoverMs) ?? 150
    },
    cursor: {
      sampleInterval: ((_q = input.cursor) == null ? void 0 : _q.sampleInterval) ?? 50,
      minimumDistance: ((_r = input.cursor) == null ? void 0 : _r.minimumDistance) ?? 12,
      pauseThreshold: ((_s = input.cursor) == null ? void 0 : _s.pauseThreshold) ?? 300
    },
    queue: {
      maxBatchSize: ((_t = input.queue) == null ? void 0 : _t.maxBatchSize) ?? 50,
      maxWaitMs: ((_u = input.queue) == null ? void 0 : _u.maxWaitMs) ?? 5e3,
      maxQueueSize: ((_v = input.queue) == null ? void 0 : _v.maxQueueSize) ?? 2e3,
      maxRetries: ((_w = input.queue) == null ? void 0 : _w.maxRetries) ?? 3,
      retryBaseDelayMs: ((_x = input.queue) == null ? void 0 : _x.retryBaseDelayMs) ?? 1e3
    },
    sessionReplay: {
      // MVP1 is release-locked off even when stale configuration opts in.
      enabled: MVP1_POLICY.sessionReplay && (((_y = input.sessionReplay) == null ? void 0 : _y.enabled) ?? false),
      sampleMouseMovement: ((_z = input.sessionReplay) == null ? void 0 : _z.sampleMouseMovement) ?? true,
      maskAllInputs: ((_A = input.sessionReplay) == null ? void 0 : _A.maskAllInputs) ?? true,
      maskTextSelector: (_B = input.sessionReplay) == null ? void 0 : _B.maskTextSelector,
      blockSelector: (_C = input.sessionReplay) == null ? void 0 : _C.blockSelector,
      recordCanvas: ((_D = input.sessionReplay) == null ? void 0 : _D.recordCanvas) ?? false,
      collectFonts: ((_E = input.sessionReplay) == null ? void 0 : _E.collectFonts) ?? false,
      checkoutEveryNms: ((_F = input.sessionReplay) == null ? void 0 : _F.checkoutEveryNms) ?? 2 * 60 * 1e3,
      bundleUrl: (_G = input.sessionReplay) == null ? void 0 : _G.bundleUrl
    },
    feedback: {
      enabled: ((_H = input.feedback) == null ? void 0 : _H.enabled) ?? false,
      apiBase: ((_I = input.feedback) == null ? void 0 : _I.apiBase) ?? "https://platform.example.com",
      flushIntervalMs: ((_J = input.feedback) == null ? void 0 : _J.flushIntervalMs) ?? 3e3,
      autoDismissMs: ((_K = input.feedback) == null ? void 0 : _K.autoDismissMs) ?? 12e3
    },
    experiences: { enabled: ((_L = input.experiences) == null ? void 0 : _L.enabled) ?? true }
  };
}
class RouteObserver {
  constructor() {
    this.listeners = /* @__PURE__ */ new Set();
    this.lastUrl = location.href;
    this.installed = false;
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
    this.onPopState = () => this.checkForChange();
    this.onHashChange = () => this.checkForChange();
  }
  start() {
    if (this.installed) return;
    this.installed = true;
    const self = this;
    history.pushState = function(...args) {
      const result = self.originalPushState.apply(this, args);
      self.checkForChange();
      return result;
    };
    history.replaceState = function(...args) {
      const result = self.originalReplaceState.apply(this, args);
      self.checkForChange();
      return result;
    };
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("hashchange", this.onHashChange);
  }
  stop() {
    if (!this.installed) return;
    this.installed = false;
    history.pushState = this.originalPushState;
    history.replaceState = this.originalReplaceState;
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("hashchange", this.onHashChange);
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  checkForChange() {
    setTimeout(() => {
      const url = location.href;
      if (url !== this.lastUrl) {
        this.lastUrl = url;
        for (const fn of this.listeners) {
          try {
            fn(url);
          } catch {
          }
        }
      }
    }, 0);
  }
}
function classifyHeatmapDevice(viewportWidth) {
  if (viewportWidth < 768) return "mobile";
  if (viewportWidth < 1024) return "tablet";
  return "desktop";
}
class HeatmapManager {
  constructor(apiBase, siteId, bundleUrl) {
    this.apiBase = apiBase;
    this.siteId = siteId;
    this.bundleUrl = bundleUrl;
    this.states = [];
    this.lastResolvedAt = 0;
    this.loadPromise = null;
  }
  initialize() {
    if (!this.apiBase || typeof fetch === "undefined") return;
    const liveToken = new URL(location.href).searchParams.get("__movecues_heatmap_capture");
    if (liveToken) {
      void this.enterLiveCapture(liveToken);
      return;
    }
    void fetch(`${this.apiBase}/public/config/${this.siteId}`, { credentials: "omit" }).then((r) => r.ok ? r.json() : null).then((body) => {
      this.states = Array.isArray(body == null ? void 0 : body.heatmapStates) ? body.heatmapStates : [];
      return this.requestAutomaticReference();
    }).catch(() => void 0);
  }
  context() {
    return { stateId: this.resolveVisibleState(), deviceClass: classifyHeatmapDevice(window.innerWidth) };
  }
  async captureReference(captureToken) {
    try {
      const capture = await this.loadCaptureFunction();
      if (!capture) return { ok: false, error: "snapshot_library_unavailable" };
      const imageDataUrl = await capture();
      const doc = document.documentElement;
      const response = await fetch(`${this.apiBase}/public/sites/${this.siteId}/heatmap-snapshots/${encodeURIComponent(captureToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ pagePath: location.pathname, deviceClass: classifyHeatmapDevice(window.innerWidth), viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, documentWidth: Math.max(doc.scrollWidth, doc.clientWidth), documentHeight: Math.max(doc.scrollHeight, doc.clientHeight), imageDataUrl })
      });
      return response.ok ? { ok: true } : { ok: false, error: "snapshot_upload_failed" };
    } catch {
      return { ok: false, error: "snapshot_capture_failed" };
    }
  }
  async requestAutomaticReference() {
    var _a;
    try {
      const device = classifyHeatmapDevice(window.innerWidth);
      const response = await fetch(`${this.apiBase}/public/sites/${this.siteId}/heatmap-reference?path=${encodeURIComponent(location.pathname)}&device=${device}`, { credentials: "omit" });
      if (!response.ok) return;
      const body = await response.json();
      if (typeof ((_a = body == null ? void 0 : body.capture) == null ? void 0 : _a.token) === "string") await this.captureReference(body.capture.token);
    } catch {
    }
  }
  async enterLiveCapture(token) {
    try {
      const response = await fetch(`${this.apiBase}/public/sites/${this.siteId}/heatmap-captures/${encodeURIComponent(token)}`, { credentials: "omit" });
      if (!response.ok) return;
      const capture = await response.json();
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("__movecues_heatmap_capture");
      history.replaceState(history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      this.mountToolbar(token, capture);
    } catch {
    }
  }
  mountToolbar(token, capture) {
    const host = document.createElement("div");
    host.setAttribute("data-movecues-heatmap-toolbar", "");
    const root = host.attachShadow({ mode: "closed" });
    const wrap = document.createElement("div");
    wrap.innerHTML = `<style>:host{all:initial}.bar{position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;min-width:560px;padding:14px 16px;border-radius:12px;background:#111827;color:#fff;box-shadow:0 16px 50px #0007;font:13px/1.4 system-ui,sans-serif}.copy{flex:1}.title{font-weight:700}.sub{color:#cbd5e1;margin-top:2px}.actions{display:flex;gap:8px}button{border:0;border-radius:7px;padding:9px 14px;font:600 13px system-ui;cursor:pointer}.cancel{background:#374151;color:#fff}.capture{background:#7c3aed;color:#fff}.status{color:#d1fae5;font-weight:600}</style><div class="bar"><div class="copy"><div class="title">movecues · Heatmap capture</div><div class="sub"></div></div><div class="actions"><button class="cancel">Cancel</button><button class="capture">Capture</button></div></div>`;
    const sub = wrap.querySelector(".sub");
    sub.textContent = `${capture.pageName ?? "Page"} · ${capture.stateName ?? "Default"} · ${capitalize$1(capture.device ?? "desktop")} — Arrange this page exactly as you want it shown.`;
    wrap.querySelector(".cancel").addEventListener("click", () => host.remove());
    wrap.querySelector(".capture").addEventListener("click", async () => {
      const button = wrap.querySelector(".capture");
      button.disabled = true;
      button.textContent = "Capturing…";
      host.style.display = "none";
      const result = await this.captureReference(token);
      host.style.display = "";
      if (result.ok) {
        wrap.querySelector(".actions").innerHTML = `<span class="status">Captured successfully. You can close this tab.</span>`;
      } else {
        button.disabled = false;
        button.textContent = "Try again";
      }
    });
    root.appendChild(wrap);
    document.documentElement.appendChild(host);
  }
  resolveVisibleState() {
    const now2 = Date.now();
    if (now2 - this.lastResolvedAt < 200) return this.cachedStateId;
    this.lastResolvedAt = now2;
    this.cachedStateId = void 0;
    for (const state of this.states) {
      try {
        const el = document.querySelector(state.selector);
        if (!el) continue;
        const style = getComputedStyle(el);
        if (style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0) {
          this.cachedStateId = state.id;
          break;
        }
      } catch {
      }
    }
    return this.cachedStateId;
  }
  loadCaptureFunction() {
    if (window.__movecuesHeatmapCapture__) return Promise.resolve(window.__movecuesHeatmapCapture__);
    if (this.loadPromise) return this.loadPromise;
    const url = sdkBundleUrl("heatmap", this.bundleUrl);
    if (!url) return Promise.resolve(null);
    this.loadPromise = loadSdkBundle(url, () => window.__movecuesHeatmapCapture__, "heatmap snapshot");
    return this.loadPromise;
  }
}
function capitalize$1(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
class SessionActivityMonitor {
  constructor(session, throttleMs = 6e4) {
    this.session = session;
    this.throttleMs = throttleMs;
    this.running = false;
    this.lastTouchAt = 0;
    this.onActivity = () => {
      const now2 = Date.now();
      if (now2 - this.lastTouchAt < this.throttleMs) return;
      this.lastTouchAt = now2;
      this.session.touch();
    };
  }
  start() {
    if (this.running || typeof window === "undefined") return;
    this.running = true;
    window.addEventListener("pointermove", this.onActivity, { passive: true });
    window.addEventListener("pointerdown", this.onActivity, { passive: true });
    window.addEventListener("scroll", this.onActivity, { passive: true });
    window.addEventListener("keydown", this.onActivity);
  }
  stop() {
    if (!this.running || typeof window === "undefined") return;
    this.running = false;
    window.removeEventListener("pointermove", this.onActivity);
    window.removeEventListener("pointerdown", this.onActivity);
    window.removeEventListener("scroll", this.onActivity);
    window.removeEventListener("keydown", this.onActivity);
  }
}
function loadExperienceRuntime(overrideUrl) {
  return loadSdkBundle(
    sdkBundleUrl("experiences", overrideUrl),
    () => window.__movcuesExperienceRuntime__,
    "experience runtime"
  );
}
function loadEditorRuntime(overrideUrl) {
  return loadSdkBundle(
    sdkBundleUrl("editor", overrideUrl),
    () => window.__movcuesEditorRuntime__,
    "experience editor"
  );
}
const EDITOR_CONTINUATION_KEY = "__movecues_experience_editor_session__";
function readEditorContinuation() {
  try {
    const value = JSON.parse(sessionStorage.getItem(EDITOR_CONTINUATION_KEY) ?? "null");
    const session = value && isSession(value.session) ? value.session : isSession(value) ? value : null;
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      clearEditorContinuation();
      return null;
    }
    return { session, editorState: isEditorState(value == null ? void 0 : value.editorState) ? value.editorState : void 0 };
  } catch {
    clearEditorContinuation();
    return null;
  }
}
function storeEditorContinuation(continuation) {
  try {
    sessionStorage.setItem(EDITOR_CONTINUATION_KEY, JSON.stringify(continuation));
  } catch {
  }
}
function clearEditorContinuation() {
  try {
    sessionStorage.removeItem(EDITOR_CONTINUATION_KEY);
  } catch {
  }
}
function isSession(value) {
  if (!value || typeof value !== "object") return false;
  const session = value;
  return typeof session.sessionId === "string" && !!session.sessionId && typeof session.accessToken === "string" && !!session.accessToken && typeof session.expiresAt === "string" && Number.isFinite(Date.parse(session.expiresAt));
}
function isEditorState(value) {
  if (!value || typeof value !== "object") return false;
  const state = value;
  return typeof state.experienceId === "string" && !!state.experienceId && (state.selectedStepId === void 0 || typeof state.selectedStepId === "string") && (state.mode === "select" || state.mode === "navigate");
}
let Analytics$1 = class Analytics {
  constructor(runtimeProviders = {}) {
    this.runtimeProviders = runtimeProviders;
    this.routeObserver = new RouteObserver();
    this.heatmaps = null;
    this.activityMonitor = null;
    this.experiences = null;
    this.pendingExperienceLaunches = [];
    this.editor = null;
    this.editorMode = false;
    this.editorAttempted = false;
    this.debugEnabled = false;
    this.initialized = false;
    this.running = false;
    this.generation = 0;
    this.unsubscribers = [];
  }
  init(userConfig) {
    if (this.initialized) {
      this.log("already initialized, ignoring duplicate init()");
      return;
    }
    this.config = resolveConfig(userConfig);
    this.debugEnabled = !!this.config.debug;
    const generation = ++this.generation;
    const editorToken = new URL(location.href).searchParams.get("movecues_editor_token");
    const editorContinuation = editorToken ? null : readEditorContinuation();
    if ((editorToken || editorContinuation) && !this.editorAttempted) {
      this.initialized = true;
      this.editorAttempted = true;
      void this.initializeEditor(editorToken, editorContinuation, userConfig, generation);
      return;
    }
    if (this.config.respectDoNotTrack && isDoNotTrackEnabled()) {
      this.log("Do Not Track enabled - autocapture disabled");
      this.initialized = true;
      return;
    }
    this.session = new SessionManager(this.config.sessionInactivityMs);
    this.transport = new Transport(this.config.endpoint, this.config.siteId);
    this.queue = new EventQueue({ maxQueueSize: this.config.queue.maxQueueSize });
    this.batcher = new Batcher(
      this.queue,
      this.transport,
      this.config.queue,
      (msg, ...args) => this.log(msg, ...args)
    );
    this.engine = new AutoCaptureEngine(this.config);
    this.activityMonitor = new SessionActivityMonitor(this.session);
    if (MVP1_POLICY.heatmaps) {
      this.heatmaps = new HeatmapManager(this.config.endpoint, this.config.siteId, this.config.heatmapSnapshotBundleUrl);
      this.heatmaps.initialize();
    }
    this.wireCollectorsToPipeline();
    this.initialized = true;
    this.log("initialized", { siteId: this.config.siteId });
    this.engine.initializeElementDiscovery();
    this.unsubscribers.push(this.routeObserver.onChange(() => this.onRouteChange()));
    this.routeObserver.start();
    this.start();
    this.trackPageView();
    if (this.config.experiences.enabled) {
      void this.initializeExperiences(generation);
    }
  }
  start() {
    var _a;
    if (!this.initialized || this.editorMode || this.running || !this.engine) return;
    this.running = true;
    this.engine.start();
    (_a = this.activityMonitor) == null ? void 0 : _a.start();
    this.batcher.start();
    this.log("autocapture started");
  }
  stop() {
    var _a;
    if (!this.running) return;
    this.running = false;
    this.engine.stop();
    (_a = this.activityMonitor) == null ? void 0 : _a.stop();
    this.batcher.stop();
    this.log("autocapture stopped");
  }
  destroy() {
    var _a, _b, _c, _d;
    this.generation++;
    this.stop();
    this.routeObserver.stop();
    (_a = this.engine) == null ? void 0 : _a.destroyElementDiscovery();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    (_b = this.queue) == null ? void 0 : _b.clear();
    (_c = this.experiences) == null ? void 0 : _c.destroy();
    this.experiences = null;
    this.pendingExperienceLaunches = [];
    this.heatmaps = null;
    this.activityMonitor = null;
    (_d = this.editor) == null ? void 0 : _d.destroy();
    this.editor = null;
    this.editorMode = false;
    this.editorAttempted = false;
    this.initialized = false;
    this.log("destroyed");
  }
  event(name, properties) {
    var _a;
    if (!this.requireInit()) return;
    const payload = { name, properties };
    this.enqueueEvent("custom", payload);
    this.engine.funnel.onCustomEvent(name);
    (_a = this.experiences) == null ? void 0 : _a.onCustomEvent(name);
    void this.refreshExperiencesAfterFlush();
    this.log(`event: ${name}`, properties);
  }
  identify(userId, attributes) {
    if (!this.requireInit()) return;
    this.session.identify(userId);
    const payload = { userId, traits: attributes };
    this.enqueueEvent("identify", payload);
    void this.refreshExperiencesAfterFlush();
    this.log(`identify: ${userId}`, attributes);
  }
  /** Clear the active identity and begin future activity as a new visitor. */
  reset() {
    if (!this.requireInit()) return;
    this.session.reset();
    this.trackPageView();
    this.log("identity reset");
  }
  page() {
    if (!this.requireInit()) return;
    this.trackPageView();
  }
  /** Explicitly launch a published Guide, bypassing automatic targeting. */
  launchExperience(experienceId) {
    var _a;
    if (!this.requireInit() || !experienceId) return;
    if ((_a = this.experiences) == null ? void 0 : _a.launchExperience) void this.experiences.launchExperience(experienceId);
    else this.pendingExperienceLaunches.push(experienceId);
  }
  defineFunnel(name, steps) {
    if (!this.requireInit()) return;
    this.engine.funnel.define(name, steps);
    this.log(`funnel defined: ${name}`, steps);
    this.engine.funnel.onPageView(location.pathname);
  }
  enableDebug() {
    this.debugEnabled = true;
    this.log("debug mode enabled");
  }
  disableDebug() {
    this.log("debug mode disabled");
    this.debugEnabled = false;
  }
  // -------------------------------------------------------------------
  // Internal wiring
  // -------------------------------------------------------------------
  requireInit() {
    if (!this.initialized || this.editorMode || !this.session) {
      console.warn("[Analytics] call analytics.init(config) before using this method");
      return false;
    }
    return true;
  }
  async initializeEditor(editorToken, continuation, userConfig, generation) {
    try {
      const runtime = this.runtimeProviders.editor ?? await loadEditorRuntime(this.config.editorRuntimeBundleUrl);
      if (!this.initialized || generation !== this.generation) return;
      if (!runtime) {
        this.fallbackFromEditor(userConfig, generation);
        return;
      }
      const editor = runtime.createController(this.config.endpoint);
      const started = editorToken ? await editor.start(editorToken) : continuation ? await editor.resume(continuation) : false;
      if (!this.initialized || generation !== this.generation) {
        editor.destroy();
        return;
      }
      if (started) {
        this.editor = editor;
        this.editorMode = true;
        this.log("experience editor mode initialized");
        return;
      }
      editor.destroy();
      this.fallbackFromEditor(userConfig, generation);
    } catch {
      this.fallbackFromEditor(userConfig, generation);
    }
  }
  fallbackFromEditor(userConfig, generation) {
    if (!this.initialized || generation !== this.generation) return;
    clearEditorContinuation();
    this.initialized = false;
    this.init(userConfig);
  }
  async initializeExperiences(generation) {
    var _a, _b;
    try {
      const runtime = this.runtimeProviders.experiences ?? await loadExperienceRuntime(this.config.experienceRuntimeBundleUrl);
      if (!runtime || !this.initialized || this.editorMode || generation !== this.generation) return;
      this.experiences = runtime.createLoader(
        this.config.endpoint,
        this.config.siteId,
        this.session,
        (name) => this.event(name)
      );
      await this.experiences.evaluate();
      for (const id of this.pendingExperienceLaunches.splice(0)) void ((_b = (_a = this.experiences).launchExperience) == null ? void 0 : _b.call(_a, id));
      void this.refreshExperiencesAfterFlush();
    } catch {
    }
  }
  wireCollectorsToPipeline() {
    const bus = this.engine.bus;
    this.unsubscribers.push(
      bus.on("click", (p) => {
        if (MVP1_POLICY.interactiveClicksOnly && !p.interactive) {
          this.log("non-interactive click ignored by MVP1 policy", p.element.selector);
          return;
        }
        this.enqueueEvent("click", p);
        this.log("click captured", p.element.selector);
      })
    );
    this.unsubscribers.push(
      bus.on("scroll:milestone", (p) => {
        this.enqueueEvent("scroll", p);
        this.log(`scroll milestone: ${p.milestone}%`);
      })
    );
    this.unsubscribers.push(
      bus.on("move", (p) => {
        this.enqueueEvent("move", p);
        this.log(`move batch: ${p.points.length} points`);
      })
    );
    this.unsubscribers.push(
      bus.on("rage_click", (p) => {
        this.enqueueEvent("rage_click", p);
        this.log("rage click detected", p);
      })
    );
    this.unsubscribers.push(
      bus.on("hover", (p) => {
        this.enqueueEvent("hover", p);
        this.log(`hover: ${p.element.selector} (${p.durationMs}ms)`);
      })
    );
    this.unsubscribers.push(
      bus.on("cursor", (p) => {
        this.enqueueEvent("cursor", p);
        this.log(`cursor sample: (${p.x}, ${p.y})`);
      })
    );
    this.unsubscribers.push(
      bus.on("funnel", (p) => {
        this.enqueueEvent("funnel", p);
        this.log(`funnel step completed: ${p.funnelName} [${p.stepIndex}] (${p.status})`);
      })
    );
    this.unsubscribers.push(
      bus.on("session_replay_event", (p) => {
        this.enqueueEvent("session_replay_event", p);
        this.log(`session replay event: seq ${p.seq}`);
      })
    );
    this.unsubscribers.push(
      bus.on("elements_seen", (p) => {
        void this.transport.sendElements(p.pagePath, p.elements);
        this.log(`elements crawled: ${p.elements.length}`);
      })
    );
  }
  trackPageView() {
    this.enqueueEvent("page_view", { title: document.title });
    this.engine.funnel.onPageView(location.pathname);
  }
  onRouteChange() {
    var _a;
    if (this.running) {
      this.session.newPageView();
      this.engine.onRouteChange(location.pathname, true);
      this.trackPageView();
      (_a = this.experiences) == null ? void 0 : _a.onRouteChange();
      void this.refreshExperiencesAfterFlush();
    } else {
      this.engine.onRouteChange(location.pathname, false);
    }
    this.log("route changed", location.pathname);
  }
  enqueueEvent(type, payload) {
    this.session.touch();
    if (this.session.consumeSessionStarted()) {
      this.buildAndEnqueue("session_start", captureEnvironmentSnapshot());
    }
    this.buildAndEnqueue(type, payload);
  }
  async refreshExperiencesAfterFlush() {
    var _a, _b, _c, _d;
    if (!this.experiences || !this.batcher || !((_b = (_a = this.experiences).hasActiveChecklist) == null ? void 0 : _b.call(_a))) return;
    await this.batcher.flushAndWait();
    await ((_d = (_c = this.experiences) == null ? void 0 : _c.refreshChecklist) == null ? void 0 : _d.call(_c));
  }
  buildAndEnqueue(type, payload) {
    const event = {
      eventId: generateId("evt"),
      type,
      timestamp: Date.now(),
      anonymousId: this.session.getAnonymousId(),
      sessionId: this.session.getSessionId(),
      pageViewId: this.session.getPageViewId(),
      page: getPageContext(),
      ...this.heatmaps ? { heatmap: this.heatmaps.context() } : {},
      payload
    };
    this.batcher.enqueue(event);
  }
  /** Called by bootstrap on visibilitychange/pagehide for unload-safe delivery. */
  flushOnUnload() {
    if (!this.initialized || this.editorMode || !this.batcher) return;
    this.batcher.flushSync();
  }
  log(message, ...args) {
    if (!this.debugEnabled) return;
    console.log(`[Analytics] ${message}`, ...args);
  }
};
function isDoNotTrackEnabled() {
  const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}
function installUnloadHandlers(analytics) {
  const flush = () => analytics.flushOnUnload();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
function getGuideStepPattern(step) {
  return step.pattern ?? "anchored_card";
}
function guideStepRequiresTarget(step) {
  return getGuideStepPattern(step) === "anchored_card";
}
function isGuideDefinition(value) {
  return "steps" in value;
}
const BUILDER_ALLOWED_TAGS = /* @__PURE__ */ new Set(["DIV", "SECTION", "HEADER", "H1", "H2", "H3", "H4", "P", "SPAN", "BR", "BUTTON", "IMG", "HR", "LABEL", "UL", "LI"]);
const BUILDER_SURVEY_INPUT_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA"]);
const BUILDER_ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "id", "title", "role", "aria-label", "aria-live", "aria-hidden", "aria-pressed", "alt", "src", "width", "height", "type", "placeholder", "maxlength", "data-movecues-action-id", "data-movecues-content", "data-movecues-widget-type", "data-movecues-question-id", "data-movecues-question-type", "data-movecues-question-input", "data-movecues-option-id", "data-movecues-survey-action", "data-movecues-survey-controls", "data-movecues-survey-progress", "data-movecues-survey-progress-bar", "data-movecues-survey-step-id", "data-movecues-checklist-role", "data-movecues-checklist-item-id", "data-movecues-checklist-item-role", "data-movecues-checklist-view"]);
const BUILDER_BLOCKED_TAGS = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|TEXTAREA|SELECT|VIDEO|AUDIO|SOURCE)$/i;
const BUILDER_UNSAFE_CSS = /@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding/i;
function builderImageUrlIsSafe(value) {
  return !value || /^(https?:|data:image\/(?:png|gif|jpeg|webp);base64,|\/)/i.test(value);
}
function builderInputTypeIsSafe(value) {
  return ["text", "radio", "checkbox", "number"].includes(value.toLowerCase());
}
function safeScopedBuilderCss(input) {
  const css = input.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (BUILDER_UNSAFE_CSS.test(css)) return null;
  const rule = /([^{}]+)\{/g;
  let match;
  while ((match = rule.exec(css)) !== null) {
    const prelude = match[1].trim();
    if (!prelude || prelude.startsWith("@")) continue;
    if (prelude.split(",").some((selector) => !selector.trim().includes(".movecues-widget"))) return null;
  }
  return css;
}
function mountBuilderContent(root, card, builder, callbacks, allowSurveyInputs = false) {
  const html = sanitizeBuilderHtml(builder.html, allowSurveyInputs);
  const css = safeBuilderCss(builder.css);
  if (!html || css === null) return false;
  let style = root.querySelector("style[data-movecues-builder-style]");
  if (!style) {
    style = document.createElement("style");
    style.dataset.movecuesBuilderStyle = "";
    root.appendChild(style);
  }
  style.textContent = `${css}
${ISOLATION_CSS}`;
  const content = document.createElement("div");
  content.className = "builder-content";
  content.dataset.movecuesBuilderSurface = "";
  content.append(...html);
  card.appendChild(content);
  card.classList.add("builder-card");
  card.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-movecues-action-id]") : null;
    if (!target || !card.contains(target)) return;
    if (target.dataset.movecuesActionId === "primary") callbacks.onPrimary();
    if (target.dataset.movecuesActionId === "secondary") callbacks.onSecondary();
  });
  return true;
}
const ISOLATION_CSS = `[data-movecues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movecues-builder-surface]>.movecues-widget{position:relative!important;inset:auto!important}`;
function sanitizeBuilderHtml(input, allowSurveyInputs = false) {
  const template = document.createElement("template");
  template.innerHTML = input;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    const allowedTag = BUILDER_ALLOWED_TAGS.has(element.tagName) || allowSurveyInputs && BUILDER_SURVEY_INPUT_TAGS.has(element.tagName);
    if (!allowedTag) {
      if (BUILDER_BLOCKED_TAGS.test(element.tagName)) element.remove();
      else element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!BUILDER_ALLOWED_ATTRIBUTES.has(name) || name.startsWith("on") || /javascript\s*:/i.test(attribute.value)) element.removeAttribute(attribute.name);
    }
    const action = element.getAttribute("data-movecues-action-id");
    if (action && action !== "primary" && action !== "secondary") element.removeAttribute("data-movecues-action-id");
    const surveyAction = element.getAttribute("data-movecues-survey-action");
    if (surveyAction && surveyAction !== "back" && surveyAction !== "next" && surveyAction !== "submit") element.removeAttribute("data-movecues-survey-action");
    if (element.tagName === "IMG") {
      const source = element.getAttribute("src") ?? "";
      if (!builderImageUrlIsSafe(source)) element.removeAttribute("src");
    }
    if (element.hasAttribute("src") && element.tagName !== "IMG") element.removeAttribute("src");
    if (element.tagName === "INPUT") {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (!builderInputTypeIsSafe(type)) element.setAttribute("type", "text");
    }
  }
  const root = template.content.querySelector(".movecues-widget");
  if (!root) return null;
  for (const slot of ["primary", "secondary"]) {
    const actions = Array.from(template.content.querySelectorAll(`[data-movecues-action-id="${slot}"]`));
    actions.slice(1).forEach((action) => action.remove());
  }
  return Array.from(template.content.childNodes);
}
function safeBuilderCss(input) {
  return safeScopedBuilderCss(input);
}
const WIDGET_SIZE_CONSTRAINTS = {
  anchored_card: { width: { default: 320, min: 240, max: 480 }, height: { allowFixed: true, min: 120, max: 700 }, viewportGutter: 24 },
  toast: { width: { default: 380, min: 280, max: 520 }, height: {}, viewportGutter: 24 },
  cursor_follow: { width: { default: 280, min: 200, max: 360 }, height: {}, viewportGutter: 24 },
  modal: { width: { default: 600, min: 320, max: 960, allowFull: true }, height: { allowFixed: true, allowViewport: true, min: 200, max: 900 }, viewportGutter: 24 },
  slideout: { width: { default: 400, min: 320, max: 640 }, height: { allowFixed: true, allowViewport: true, min: 240, max: 900 }, viewportGutter: 24 },
  hotspot: { width: { default: 300, min: 220, max: 420 }, height: {}, viewportGutter: 24 },
  banner: { width: { default: "full" }, height: {}, viewportGutter: 0 },
  survey: { width: { default: 700, min: 320, max: 960, allowFull: true }, height: { allowFixed: true, allowViewport: true, min: 200, max: 900 }, viewportGutter: 24 }
};
function normalizeWidgetSize(widgetType, design) {
  var _a, _b;
  const constraint = WIDGET_SIZE_CONSTRAINTS[widgetType];
  if (widgetType === "banner") return { width: { mode: "full" }, height: { mode: "auto" } };
  const legacyValue = design.width === "sm" ? constraint.width.min : design.width === "lg" ? constraint.width.max : constraint.width.default;
  const requestedWidth = (_a = design.size) == null ? void 0 : _a.width;
  const width = (requestedWidth == null ? void 0 : requestedWidth.mode) === "full" && constraint.width.allowFull ? { mode: "full" } : { mode: "fixed", value: clamp$1((requestedWidth == null ? void 0 : requestedWidth.value) ?? legacyValue, constraint.width.min, constraint.width.max) };
  const requestedHeight = (_b = design.size) == null ? void 0 : _b.height;
  const height = (requestedHeight == null ? void 0 : requestedHeight.mode) === "fixed" && constraint.height.allowFixed ? { mode: "fixed", value: clamp$1(requestedHeight.value ?? constraint.height.min, constraint.height.min, constraint.height.max) } : (requestedHeight == null ? void 0 : requestedHeight.mode) === "viewport" && constraint.height.allowViewport ? { mode: "viewport" } : { mode: "auto" };
  return { width, height };
}
function applyWidgetSizeEnvelope(card, widgetType, design) {
  const constraint = WIDGET_SIZE_CONSTRAINTS[widgetType];
  const size = normalizeWidgetSize(widgetType, design);
  const gutter = Math.max(24, constraint.viewportGutter);
  card.dataset.sizeWidth = size.width.mode;
  card.dataset.sizeHeight = size.height.mode;
  if (size.width.mode === "full") {
    card.style.width = widgetType === "banner" ? "100%" : `calc(100vw - ${gutter}px)`;
    card.style.minWidth = "0";
    card.style.maxWidth = "none";
  } else {
    card.style.width = `${size.width.value}px`;
    card.style.minWidth = `min(${constraint.width.min}px, calc(100vw - ${gutter}px))`;
    card.style.maxWidth = `min(${constraint.width.max}px, calc(100vw - ${gutter}px))`;
  }
  card.style.height = size.height.mode === "fixed" ? `${size.height.value}px` : size.height.mode === "viewport" ? `calc(100vh - ${gutter}px)` : "auto";
  card.style.maxHeight = `calc(100vh - ${gutter}px)`;
  card.style.overflow = "visible";
}
function applyBuilderSizeContent(card, widgetType, design) {
  const content = card.querySelector(".builder-content");
  const widget = content == null ? void 0 : content.querySelector(":scope > .movecues-widget");
  if (!content || !widget) return;
  const size = normalizeWidgetSize(widgetType, design);
  const fillsHeight = size.height.mode !== "auto";
  content.style.width = "100%";
  content.style.height = fillsHeight ? "100%" : "auto";
  widget.style.setProperty("box-sizing", "border-box");
  widget.style.setProperty("width", "100%", "important");
  widget.style.setProperty("min-width", "0", "important");
  widget.style.setProperty("max-width", "none", "important");
  widget.style.setProperty("height", fillsHeight ? "100%" : "auto", "important");
  widget.style.setProperty("max-height", fillsHeight ? "100%" : "none", "important");
}
function clamp$1(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}
function findTarget(target) {
  if (!target) return null;
  for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1) return matches[0];
    } catch {
    }
  }
  return null;
}
function waitForTarget(target, onFound, onUnavailable, timeoutMs = 5e3) {
  const immediate = findTarget(target);
  if (immediate) {
    onFound(immediate);
    return () => void 0;
  }
  let stopped = false;
  let observer = null;
  let timer = 0;
  let frameId = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    observer == null ? void 0 : observer.disconnect();
    clearTimeout(timer);
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  };
  const check = () => {
    if (stopped) return;
    const element = findTarget(target);
    if (element) {
      stop();
      onFound(element);
    }
  };
  const scheduleCheck = () => {
    if (stopped || frameId !== null) return;
    frameId = requestAnimationFrame(() => {
      frameId = null;
      check();
    });
  };
  if (typeof MutationObserver === "undefined" || !document.documentElement) {
    timer = window.setTimeout(() => {
      stop();
      onUnavailable();
    }, timeoutMs);
    return stop;
  }
  observer = new MutationObserver(scheduleCheck);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  timer = window.setTimeout(() => {
    if (!stopped) {
      stop();
      onUnavailable();
    }
  }, timeoutMs);
  return stop;
}
function buildCard(root, content, design, behavior, callbacks, builder, widgetType) {
  var _a, _b, _c;
  const card = document.createElement("section");
  card.className = "card";
  card.style.setProperty("--movecues-bg", design.theme.background);
  card.style.setProperty("--movecues-fg", design.theme.foreground);
  card.style.setProperty("--movecues-primary", design.theme.primary);
  card.dataset.width = design.width;
  card.dataset.radius = design.theme.borderRadius;
  if (widgetType) applyWidgetSizeEnvelope(card, widgetType, design);
  const close = behavior.dismissible ? `<button class="close" data-dismiss aria-label="Dismiss">×</button>` : "";
  card.innerHTML = close;
  (_a = card.querySelector("[data-dismiss]")) == null ? void 0 : _a.addEventListener("click", callbacks.onDismiss);
  const mountedBuilder = Boolean(builder && mountBuilderContent(root, card, builder, callbacks, widgetType === "survey"));
  if (mountedBuilder && widgetType) applyBuilderSizeContent(card, widgetType, design);
  if (!mountedBuilder) {
    const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText$1(content.primaryAction.label)}</button>` : "";
    const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText$1(content.secondaryAction.label)}</button>` : "";
    card.insertAdjacentHTML("beforeend", `<div class="legacy-content"><h2>${escapeText$1(content.heading)}</h2><p>${escapeText$1(content.body)}</p><footer>${secondary}${primary}</footer></div>`);
    (_b = card.querySelector("[data-primary]")) == null ? void 0 : _b.addEventListener("click", callbacks.onPrimary);
    (_c = card.querySelector("[data-secondary]")) == null ? void 0 : _c.addEventListener("click", callbacks.onSecondary);
  }
  root.appendChild(card);
  if (mountedBuilder && widgetType === "anchored_card") fitAnchoredBuilderEnvelope(card);
  return card;
}
function fitAnchoredBuilderEnvelope(card) {
  const widget = card.querySelector(".builder-content > .movecues-widget");
  if (!widget) return;
  const cardRect = card.getBoundingClientRect();
  const widgetRect = widget.getBoundingClientRect();
  if (widgetRect.width > 0 && cardRect.width - widgetRect.width > 0.5) card.style.width = `${Math.ceil(widgetRect.width)}px`;
  if (widgetRect.height > 0 && cardRect.height - widgetRect.height > 0.5) card.style.height = `${Math.ceil(widgetRect.height)}px`;
}
class AnchoredCardRenderer {
  constructor() {
    this.cleanup = [];
  }
  render(root, target, content, design, behavior, callbacks, builder, widgetType) {
    var _a;
    this.destroy();
    const card = buildCard(root, content, design, behavior, callbacks, builder, widgetType);
    const pointer = ((_a = behavior.pointer) == null ? void 0 : _a.enabled) === false ? null : buildPointer(card, design, behavior);
    let frameId = null;
    let destroyed = false;
    let hidden = false;
    let resolvedPlacement = null;
    let cardSize = null;
    let measureCard = true;
    let lastLeft = null;
    let lastTop = null;
    const setHidden = (next) => {
      if (hidden === next) return;
      hidden = next;
      card.style.visibility = next ? "hidden" : "";
      card.style.pointerEvents = next ? "none" : "";
    };
    const update = () => {
      if (destroyed) return;
      if (!target.isConnected) {
        setHidden(true);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (measureCard || !cardSize) {
        const bounds2 = card.getBoundingClientRect();
        cardSize = { width: bounds2.width, height: bounds2.height };
        measureCard = false;
      }
      const bounds = cardSize;
      if (!resolvedPlacement) resolvedPlacement = resolvePlacement(rect, bounds, behavior);
      const coordinates = coordinatesFor(rect, bounds, behavior, resolvedPlacement);
      const naturalCardRect = rectAt(coordinates.left, coordinates.top, bounds.width, bounds.height);
      if (!intersectsViewport(rect) && !intersectsViewport(naturalCardRect)) {
        setHidden(true);
        return;
      }
      setHidden(false);
      const left = clampHorizontally(coordinates.left, bounds.width);
      if (pointer) positionPointer(pointer, rect, bounds, left, coordinates.top, resolvedPlacement, behavior);
      if (left !== lastLeft) {
        lastLeft = left;
        card.style.left = `${left}px`;
      }
      if (coordinates.top !== lastTop) {
        lastTop = coordinates.top;
        card.style.top = `${coordinates.top}px`;
      }
    };
    const schedule = (reconsiderPlacement = false, remeasureCard = false) => {
      if (destroyed) return;
      if (reconsiderPlacement && isAutomaticPlacement(behavior)) resolvedPlacement = null;
      if (remeasureCard) measureCard = true;
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        update();
      });
    };
    const onScroll = (event) => {
      const scrollContainer = event.target;
      if (target.isConnected && scrollContainer instanceof Element && !scrollContainer.contains(target)) return;
      schedule();
    };
    const onResize = () => schedule(true, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    this.cleanup.push(
      () => window.removeEventListener("scroll", onScroll, true),
      () => window.removeEventListener("resize", onResize),
      () => {
        destroyed = true;
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      }
    );
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => schedule(true, entries.some((entry) => entry.target === card)));
      observer.observe(target);
      observer.observe(card);
      this.cleanup.push(() => observer.disconnect());
    }
    update();
    return card;
  }
  destroy() {
    this.cleanup.splice(0).forEach((fn) => fn());
  }
}
function buildPointer(card, design, behavior) {
  const pointer = document.createElement("span");
  const size = pointerSize(behavior);
  pointer.className = "movecues-anchor-pointer";
  pointer.setAttribute("aria-hidden", "true");
  pointer.style.setProperty("--movecues-pointer-size", `${size}px`);
  pointer.style.color = pointerColor(card, design);
  pointer.innerHTML = '<svg viewBox="0 0 10 10" focusable="false" aria-hidden="true"><path d="M5 0 10 10H0Z" fill="currentColor"/></svg>';
  card.prepend(pointer);
  return pointer;
}
function pointerColor(card, design) {
  const widget = card.querySelector(".movecues-widget");
  if (!widget) return design.theme.background;
  const background = getComputedStyle(widget).backgroundColor.trim();
  return isTransparent(background) ? design.theme.background : background;
}
function isTransparent(color) {
  return !color || color.toLowerCase() === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color);
}
function positionPointer(pointer, targetRect, cardSize, finalLeft, finalTop, placement, behavior) {
  const size = pointerSize(behavior);
  const edgePadding = Math.max(size + 6, 14);
  pointer.dataset.placement = placement;
  if (placement === "top" || placement === "bottom") {
    const center = clamp(targetRect.left + targetRect.width / 2 - finalLeft, edgePadding, cardSize.width - edgePadding);
    pointer.style.left = `${center}px`;
    pointer.style.top = "";
  } else {
    const center = clamp(targetRect.top + targetRect.height / 2 - finalTop, edgePadding, cardSize.height - edgePadding);
    pointer.style.top = `${center}px`;
    pointer.style.left = "";
  }
}
function pointerSize(behavior) {
  var _a;
  const requested = ((_a = behavior.pointer) == null ? void 0 : _a.size) ?? 10;
  return Number.isFinite(requested) ? clamp(Math.round(requested), 4, 30) : 10;
}
function clamp(value, minimum, maximum) {
  if (maximum < minimum) return maximum / 2;
  return Math.max(minimum, Math.min(value, maximum));
}
function isAutomaticPlacement(behavior) {
  return !behavior.placement || behavior.placement === "auto";
}
function resolvePlacement(rect, bounds, behavior) {
  if (!isAutomaticPlacement(behavior)) return behavior.placement;
  const gap = behavior.offset ?? 8;
  const spaceBelow = innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  if (spaceBelow >= bounds.height) return "bottom";
  if (spaceAbove >= bounds.height) return "top";
  return spaceBelow >= spaceAbove ? "bottom" : "top";
}
function coordinatesFor(rect, bounds, behavior, placement) {
  const gap = behavior.offset ?? 8;
  let left = rect.left + (rect.width - bounds.width) / 2;
  let top = rect.bottom + gap;
  if (placement === "top") top = rect.top - bounds.height - gap;
  if (placement === "left") {
    left = rect.left - bounds.width - gap;
    top = rect.top + (rect.height - bounds.height) / 2;
  }
  if (placement === "right") {
    left = rect.right + gap;
    top = rect.top + (rect.height - bounds.height) / 2;
  }
  if (behavior.alignment === "start" && (placement === "top" || placement === "bottom")) left = rect.left;
  if (behavior.alignment === "end" && (placement === "top" || placement === "bottom")) left = rect.right - bounds.width;
  return { left, top };
}
function clampHorizontally(left, width) {
  const margin = 8;
  return Math.max(margin, Math.min(left, innerWidth - width - margin));
}
function rectAt(left, top, width, height) {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) };
}
function intersectsViewport(rect) {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
}
function escapeText$1(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}
class ToastRenderer {
  constructor() {
    this.timer = null;
  }
  render(root, content, design, behavior, callbacks, builder) {
    const card = buildCard(root, content, design, behavior, callbacks, builder, "toast");
    card.classList.add("toast");
    card.dataset.position = behavior.toastPosition ?? "bottom-right";
    if (behavior.autoDismissMs) this.timer = window.setTimeout(callbacks.onDismiss, behavior.autoDismissMs);
    return card;
  }
  destroy() {
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
class CursorFollowRenderer {
  constructor() {
    this.cleanup = null;
  }
  render(root, content, design, behavior, callbacks, builder) {
    const card = buildCard(root, content, design, behavior, callbacks, builder, "cursor_follow");
    card.classList.add("cursor");
    let frame = 0;
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    const offset = behavior.cursorOffset ?? { x: 16, y: 16 };
    const update = () => {
      frame = 0;
      const rect = card.getBoundingClientRect();
      card.style.left = `${Math.max(8, Math.min(x + offset.x, innerWidth - rect.width - 8))}px`;
      card.style.top = `${Math.max(8, Math.min(y + offset.y, innerHeight - rect.height - 8))}px`;
    };
    const move = (event) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("pointermove", move, { passive: true });
    this.cleanup = () => {
      window.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
    };
    update();
    return card;
  }
  destroy() {
    var _a;
    (_a = this.cleanup) == null ? void 0 : _a.call(this);
    this.cleanup = null;
  }
}
class ModalRenderer {
  render(root, content, design, behavior, callbacks, builder, widgetType = "modal") {
    if (behavior.backdrop !== false) {
      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.style.setProperty("--movecues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.45));
      if (behavior.closeOnBackdrop && behavior.dismissible) backdrop.addEventListener("click", callbacks.onDismiss);
      root.appendChild(backdrop);
    }
    const card = buildCard(root, content, design, behavior, callbacks, builder, widgetType);
    card.classList.add("modal");
    card.dataset.layout = behavior.modalLayout ?? "center";
    return card;
  }
  destroy() {
  }
}
class SlideoutRenderer {
  render(root, content, design, behavior, callbacks, builder) {
    if (behavior.backdrop) {
      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.style.setProperty("--movecues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.35));
      if (behavior.closeOnBackdrop && behavior.dismissible) backdrop.addEventListener("click", callbacks.onDismiss);
      root.appendChild(backdrop);
    }
    const card = buildCard(root, content, design, behavior, callbacks, builder, "slideout");
    card.classList.add("slideout");
    card.dataset.position = behavior.slideoutPosition ?? "bottom-right";
    return card;
  }
  destroy() {
  }
}
class HotspotRenderer {
  constructor() {
    this.cleanup = [];
    this.cardRenderer = null;
    this.card = null;
  }
  render(root, target, content, design, behavior, callbacks, builder) {
    this.destroy();
    const beacon = document.createElement("button");
    beacon.className = "hotspot";
    beacon.dataset.style = behavior.hotspotStyle ?? "pulse";
    beacon.style.setProperty("--movecues-hotspot", behavior.hotspotColor ?? design.theme.primary);
    beacon.type = "button";
    beacon.setAttribute("aria-label", `Open ${content.heading}`);
    if (beacon.dataset.style === "question") beacon.textContent = "?";
    root.appendChild(beacon);
    let frameId = null;
    let destroyed = false;
    let lastLeft = null;
    let lastTop = null;
    const update = () => {
      if (destroyed || !target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const left = Math.max(4, Math.min(rect.right - 7, innerWidth - 18));
      const top = Math.max(4, Math.min(rect.top - 7, innerHeight - 18));
      if (left !== lastLeft) {
        lastLeft = left;
        beacon.style.left = `${left}px`;
      }
      if (top !== lastTop) {
        lastTop = top;
        beacon.style.top = `${top}px`;
      }
    };
    const schedule = () => {
      if (destroyed || frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        update();
      });
    };
    const toggle = () => {
      var _a;
      if (this.card) {
        this.card.remove();
        this.card = null;
        (_a = this.cardRenderer) == null ? void 0 : _a.destroy();
        this.cardRenderer = null;
        return;
      }
      this.cardRenderer = new AnchoredCardRenderer();
      this.card = this.cardRenderer.render(root, target, content, design, behavior, callbacks, builder, "hotspot");
    };
    const onScroll = (event) => {
      const scrollContainer = event.target;
      if (scrollContainer instanceof Element && !scrollContainer.contains(target)) return;
      schedule();
    };
    beacon.addEventListener("click", toggle);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    this.cleanup.push(
      () => beacon.removeEventListener("click", toggle),
      () => window.removeEventListener("scroll", onScroll, true),
      () => window.removeEventListener("resize", schedule),
      () => {
        destroyed = true;
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      }
    );
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(schedule);
      observer.observe(target);
      this.cleanup.push(() => observer.disconnect());
    }
    update();
    return beacon;
  }
  destroy() {
    var _a;
    (_a = this.cardRenderer) == null ? void 0 : _a.destroy();
    this.cardRenderer = null;
    this.card = null;
    this.cleanup.splice(0).forEach((fn) => fn());
  }
}
class BannerRenderer {
  render(root, content, design, behavior, callbacks, builder) {
    const card = buildCard(root, content, design, behavior, callbacks, builder, "banner");
    card.classList.add("banner");
    card.dataset.position = behavior.bannerPosition ?? "top";
    return card;
  }
  destroy() {
  }
}
class SurveyRenderer {
  constructor() {
    this.modal = new ModalRenderer();
    this.stepIndex = 0;
    this.answers = {};
    this.root = null;
    this.submitting = false;
  }
  render(root, content, design, behavior, survey, callbacks, requestedStepId) {
    if (!survey.steps.length) return null;
    this.root = root;
    this.content = content;
    this.design = design;
    this.behavior = behavior;
    this.survey = survey;
    this.callbacks = callbacks;
    const requested = requestedStepId ? survey.steps.findIndex((step) => step.id === requestedStepId) : -1;
    this.stepIndex = requested >= 0 ? requested : 0;
    return this.renderStep();
  }
  renderStep() {
    var _a;
    const root = this.root;
    const step = this.survey.steps[this.stepIndex];
    const baseStyle = root.firstElementChild;
    Array.from(root.children).forEach((element) => {
      if (element !== baseStyle) element.remove();
    });
    const content = { heading: step.content.heading || this.content.heading, body: step.content.body || this.content.body };
    const stepDesign = step.size ? { ...this.design, size: step.size } : this.design;
    const card = this.modal.render(root, content, stepDesign, this.behavior, { onDismiss: this.callbacks.onDismiss, onPrimary: this.callbacks.onDismiss, onSecondary: this.callbacks.onDismiss }, step.builder, "survey");
    let surface = card.querySelector(".movecues-widget");
    if (!surface) {
      (_a = card.querySelector(".legacy-content")) == null ? void 0 : _a.remove();
      surface = document.createElement("section");
      surface.className = "movecues-widget movecues-widget--survey";
      card.appendChild(surface);
    }
    surface.dataset.movecuesSurveyStepId = step.id;
    this.syncQuestions(surface, step.questions);
    this.syncNavigation(surface);
    return card;
  }
  syncQuestions(surface, questions) {
    var _a;
    const ids = new Set(questions.map((question) => question.id));
    surface.querySelectorAll("[data-movecues-question-id]").forEach((node) => {
      if (!ids.has(node.dataset.movecuesQuestionId ?? "")) node.remove();
    });
    let navigation = ((_a = surface.querySelector("[data-movecues-survey-action]")) == null ? void 0 : _a.parentElement) ?? null;
    for (const question of questions) {
      const matches = Array.from(surface.querySelectorAll(`[data-movecues-question-id="${cssEscape(question.id)}"]`));
      matches.slice(1).forEach((node2) => node2.remove());
      const node = matches[0] ?? createQuestionNode(question);
      if (!matches[0]) surface.insertBefore(node, navigation);
      node.dataset.movecuesQuestionType = question.type;
      node.classList.add("movecues-survey-question", `movecues-survey-question--${question.type}`);
      this.bindQuestion(node, question);
      navigation = navigation ?? node.nextElementSibling;
    }
  }
  bindQuestion(node, question) {
    var _a;
    node.classList.remove("has-error");
    if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "rating" || question.type === "nps") {
      const allowed = question.type === "rating" ? range(question.min, question.max).map(String) : question.type === "nps" ? range(0, 10).map(String) : question.options.map((option) => option.id);
      let controls = Array.from(node.querySelectorAll("[data-movecues-option-id]"));
      if (!controls.length) {
        const holder = document.createElement("div");
        holder.className = "movecues-survey-options";
        for (const value of allowed) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "movecues-survey-option";
          button.dataset.movecuesOptionId = value;
          button.textContent = question.type === "single_choice" || question.type === "multiple_choice" ? ((_a = question.options.find((option) => option.id === value)) == null ? void 0 : _a.label) ?? value : value;
          holder.appendChild(button);
        }
        node.appendChild(holder);
        controls = Array.from(holder.children);
      }
      controls.forEach((control) => {
        const optionId = control.dataset.movecuesOptionId;
        control.setAttribute("role", "button");
        const update = () => {
          const answer = this.answers[question.id];
          const selected = Array.isArray(answer) ? answer.includes(optionId) : String(answer ?? "") === optionId;
          control.classList.toggle("is-selected", selected);
          control.setAttribute("aria-pressed", String(selected));
        };
        update();
        control.onclick = () => {
          if (!allowed.includes(optionId)) return;
          if (question.type === "multiple_choice") {
            const current = Array.isArray(this.answers[question.id]) ? this.answers[question.id] : [];
            this.answers[question.id] = current.includes(optionId) ? current.filter((value) => value !== optionId) : [...current, optionId];
          } else this.answers[question.id] = question.type === "rating" || question.type === "nps" ? Number(optionId) : optionId;
          node.classList.remove("has-error");
          controls.forEach((item) => {
            const value = item.dataset.movecuesOptionId;
            const answer = this.answers[question.id];
            const selected = Array.isArray(answer) ? answer.includes(value) : String(answer) === value;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-pressed", String(selected));
          });
        };
      });
      return;
    }
    let input = node.querySelector("[data-movecues-question-input]");
    if (!input) {
      input = question.type === "long_text" ? document.createElement("textarea") : document.createElement("input");
      input.dataset.movecuesQuestionInput = "";
      input.className = "movecues-survey-input";
      node.appendChild(input);
    }
    input.value = typeof this.answers[question.id] === "string" ? this.answers[question.id] : "";
    input.placeholder = question.placeholder ?? "";
    if (question.maxLength) input.maxLength = question.maxLength;
    input.oninput = () => {
      this.answers[question.id] = input.value.slice(0, question.maxLength ?? 1e4);
      node.classList.remove("has-error");
    };
  }
  syncNavigation(surface) {
    const final = this.stepIndex === this.survey.steps.length - 1;
    const step = this.survey.steps[this.stepIndex];
    const buttons = Array.from(surface.querySelectorAll("[data-movecues-survey-action]"));
    const back = buttons.filter((button) => button.dataset.movecuesSurveyAction === "back");
    const next = buttons.filter((button) => button.dataset.movecuesSurveyAction === "next");
    const submit = buttons.filter((button) => button.dataset.movecuesSurveyAction === "submit");
    const legacyControls = Boolean(surface.querySelector("[data-movecues-survey-controls]"));
    for (const button of back) {
      button.hidden = !this.survey.allowBack || this.stepIndex === 0;
      button.onclick = () => {
        if (!this.survey.allowBack || this.stepIndex === 0) return;
        void this.callbacks.onProgress({ ...this.answers }, step.id, "back");
        this.stepIndex--;
        this.renderStep();
      };
    }
    for (const button of next) {
      button.hidden = final;
      button.onclick = async () => {
        if (!this.validateStep()) return;
        this.setDisabled(next, true);
        try {
          await this.callbacks.onProgress({ ...this.answers }, step.id, "next");
          this.stepIndex++;
          this.renderStep();
        } finally {
          this.setDisabled(next, false);
        }
      };
    }
    for (const button of submit) {
      button.hidden = !final;
      if (legacyControls) button.textContent = this.survey.submitLabel;
      button.onclick = async () => {
        if (this.submitting || !this.validateAll()) return;
        this.submitting = true;
        this.setDisabled(submit, true);
        try {
          await this.callbacks.onSubmit({ ...this.answers }, step.id);
        } finally {
          this.submitting = false;
          this.setDisabled(submit, false);
        }
      };
    }
    this.syncProgress(surface);
  }
  setDisabled(buttons, disabled) {
    buttons.forEach((button) => {
      if (button.isConnected) button.disabled = disabled;
    });
  }
  syncProgress(surface) {
    const progress = surface.querySelector("[data-movecues-survey-progress]");
    if (progress) progress.hidden = !this.survey.showProgress;
    const progressLabel = progress == null ? void 0 : progress.querySelector("span:not([data-movecues-survey-progress-bar])");
    if (progressLabel && !progressLabel.querySelector("[data-movecues-survey-progress-bar]")) progressLabel.textContent = `Step ${this.stepIndex + 1} of ${this.survey.steps.length}`;
    const bar = surface.querySelector("[data-movecues-survey-progress-bar]");
    if (bar) bar.style.width = `${(this.stepIndex + 1) / this.survey.steps.length * 100}%`;
  }
  validateStep() {
    return this.validateQuestions(this.survey.steps[this.stepIndex].questions);
  }
  validateAll() {
    let valid = true;
    let currentValid = true;
    for (const step of this.survey.steps) {
      const stepValid = this.validateQuestions(step.questions, step === this.survey.steps[this.stepIndex]);
      if (step === this.survey.steps[this.stepIndex]) currentValid = stepValid;
      if (!stepValid) valid = false;
    }
    if (!valid && currentValid && this.root) {
      const status = this.root.querySelector(".movecues-survey-validation");
      if (status) status.textContent = "Please go back and answer all required questions before submitting.";
    }
    return valid;
  }
  validateQuestions(questions, show = true) {
    const missing = questions.filter((question) => question.required && isEmpty(this.answers[question.id]));
    if (show && this.root) {
      missing.forEach((question) => {
        var _a;
        return (_a = this.root.querySelector(`[data-movecues-question-id="${cssEscape(question.id)}"]`)) == null ? void 0 : _a.classList.add("has-error");
      });
      const status = this.root.querySelector(".movecues-survey-validation");
      if (status) status.textContent = missing.length ? "Please answer the required questions before continuing." : "";
    }
    return missing.length === 0;
  }
  destroy() {
    this.modal.destroy();
    this.root = null;
  }
}
function createQuestionNode(question) {
  const node = document.createElement("div");
  node.dataset.movecuesQuestionId = question.id;
  const label = document.createElement("p");
  label.className = "movecues-survey-question__label";
  label.textContent = `${question.label}${question.required ? " *" : ""}`;
  node.appendChild(label);
  return node;
}
function isEmpty(value) {
  return value === void 0 || value === "" || Array.isArray(value) && value.length === 0;
}
function range(min, max) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}
function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}
class StackingContextResolver {
  resolve(element) {
    if (!element) return { element: null, zIndex: 0, chain: [] };
    const chain = [];
    let current = element;
    while (current && current !== document.documentElement) {
      const style = getComputedStyle(current);
      chain.push({ element: current, zIndex: numericZIndex(style.zIndex), createsStackingContext: createsStackingContext(style) });
      current = current.parentElement;
    }
    const outermost = [...chain].reverse().find((entry) => entry.createsStackingContext);
    return { element: (outermost == null ? void 0 : outermost.element) ?? null, zIndex: (outermost == null ? void 0 : outermost.zIndex) ?? 0, chain };
  }
}
function numericZIndex(value) {
  if (!value || value === "auto") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}
function createsStackingContext(style) {
  const position = style.position;
  if ((position === "absolute" || position === "relative") && numericZIndex(style.zIndex) !== null || position === "fixed" || position === "sticky") return true;
  if (Number.parseFloat(style.opacity || "1") < 1) return true;
  if (property(style, "transform") !== "none" || property(style, "filter") !== "none" || property(style, "perspective") !== "none") return true;
  if (style.isolation === "isolate" || !!style.mixBlendMode && style.mixBlendMode !== "normal") return true;
  const contain = property(style, "contain");
  if (/(^|\s)(layout|paint|strict|content)(\s|$)/.test(contain)) return true;
  const willChange = property(style, "willChange").split(",").map((value) => value.trim());
  return willChange.some((value) => ["transform", "opacity", "filter", "perspective", "contain"].includes(value));
}
function property(style, name) {
  return (style[name] || "none").trim();
}
const ALWAYS_ON_TOP_Z_INDEX = 2147483e3;
const SAFE_DEFAULT_Z_INDEX = 1;
class LayerManager {
  constructor(resolver = new StackingContextResolver(), findTarget2 = findUniqueTarget) {
    this.resolver = resolver;
    this.findTarget = findTarget2;
  }
  resolve(options) {
    if (!options.layer) {
      if (options.legacyZIndex !== void 0) return { zIndex: options.legacyZIndex, mode: "legacy", context: null };
      return { zIndex: ALWAYS_ON_TOP_Z_INDEX, mode: "legacy", context: null };
    }
    const layer = options.layer;
    if (layer.mode === "always_on_top") return { zIndex: ALWAYS_ON_TOP_Z_INDEX, mode: layer.mode, context: null };
    if (layer.mode === "custom") return { zIndex: layer.zIndex, mode: layer.mode, context: null };
    if (layer.mode === "relative") {
      const reference = this.findTarget(layer.target);
      if (!reference) {
        const automatic = this.auto(options.targetElement);
        return { ...automatic, mode: layer.mode, fallback: "relative_target_missing" };
      }
      const context = this.resolver.resolve(reference);
      return { zIndex: bounded(context.zIndex + (layer.relation === "above" ? 1 : -1)), mode: layer.mode, context };
    }
    return this.auto(options.targetElement);
  }
  auto(targetElement) {
    const context = this.resolver.resolve(targetElement ?? null);
    return { zIndex: targetElement ? bounded(context.zIndex + 1) : SAFE_DEFAULT_Z_INDEX, mode: "auto", context };
  }
  apply(host, options) {
    let observers = [];
    let active = true;
    let frameId = null;
    let last;
    const disconnect = () => {
      observers.forEach((observer) => observer.disconnect());
      observers = [];
    };
    const refresh = () => {
      var _a, _b, _c;
      if (!active) return last;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      disconnect();
      const resolution = this.resolve(options);
      last = resolution;
      const zIndex = String(resolution.zIndex);
      if (host.style.zIndex !== zIndex) host.style.zIndex = zIndex;
      if (resolution.fallback) {
        if (host.dataset.movecuesLayerFallback !== resolution.fallback) host.dataset.movecuesLayerFallback = resolution.fallback;
      } else if (host.dataset.movecuesLayerFallback) delete host.dataset.movecuesLayerFallback;
      const dynamicLayer = ((_a = options.layer) == null ? void 0 : _a.mode) === "auto" || ((_b = options.layer) == null ? void 0 : _b.mode) === "relative";
      const watched = dynamicLayer ? ((_c = options.layer) == null ? void 0 : _c.mode) === "relative" ? this.findTarget(options.layer.target) : options.targetElement : null;
      if (watched && typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(() => scheduleRefresh());
        for (let element = watched; element; element = element.parentElement) {
          observer.observe(element, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
          if (element.parentElement) observer.observe(element.parentElement, { childList: true });
        }
        observers.push(observer);
      }
      return resolution;
    };
    const scheduleRefresh = () => {
      if (!active || frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        refresh();
      });
    };
    refresh();
    return {
      refresh,
      destroy: () => {
        active = false;
        disconnect();
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      }
    };
  }
}
function findUniqueTarget(target) {
  for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1) return matches[0];
    } catch {
    }
  }
  return null;
}
function bounded(value) {
  return Math.max(-2147483648, Math.min(2147483647, value));
}
class ExperienceRenderer {
  constructor() {
    this.host = null;
    this.renderer = null;
    this.cancelPendingTarget = null;
    this.cleanupAdvance = null;
    this.appliedLayer = null;
    this.layerManager = new LayerManager();
  }
  render(experience, callbacks, guideStepId) {
    this.destroy();
    if (experience.kind === "checklist") return false;
    if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks, guideStepId);
    return this.renderWidget(experience, experience.definition, callbacks, guideStepId);
  }
  root(experienceId, behavior, targetElement) {
    this.host = document.createElement("div");
    this.host.dataset.movecuesExperience = experienceId;
    this.host.dataset.movecuesExperienceRoot = experienceId;
    this.host.style.cssText = "position:fixed;inset:0;pointer-events:none";
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);
    document.documentElement.appendChild(this.host);
    this.appliedLayer = this.layerManager.apply(this.host, { layer: behavior.layer, legacyZIndex: behavior.zIndex, targetElement });
    return root;
  }
  renderWidget(experience, definition, callbacks, requestedStepId) {
    if (experience.widgetType === "anchored_card" || experience.widgetType === "hotspot") {
      const mount = (target2) => {
        const root = this.root(experience.id, definition.behavior, target2);
        const renderer = experience.widgetType === "hotspot" ? new HotspotRenderer() : new AnchoredCardRenderer();
        this.renderer = renderer;
        renderer.render(root, target2, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder, experience.widgetType ?? "anchored_card");
        requestAnimationFrame(callbacks.onVisible);
      };
      const target = findTarget(definition.target);
      if (target) mount(target);
      else this.cancelPendingTarget = waitForTarget(definition.target, (element) => {
        this.cancelPendingTarget = null;
        mount(element);
      }, () => {
        var _a;
        this.cancelPendingTarget = null;
        (_a = callbacks.onUnavailable) == null ? void 0 : _a.call(callbacks);
      });
    } else if (experience.widgetType === "toast") {
      const root = this.root(experience.id, definition.behavior);
      const renderer = new ToastRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "cursor_follow") {
      const root = this.root(experience.id, definition.behavior);
      const renderer = new CursorFollowRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "modal") {
      const root = this.root(experience.id, definition.behavior);
      const renderer = new ModalRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "survey" && definition.survey) {
      const root = this.root(experience.id, definition.behavior);
      const renderer = new SurveyRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, definition.survey, { onDismiss: () => callbacks.onDismiss(), onProgress: (answers, stepId, direction) => {
        var _a;
        return (_a = callbacks.onSurveyProgress) == null ? void 0 : _a.call(callbacks, answers, stepId, direction);
      }, onSubmit: (answers, stepId) => {
        var _a;
        return (_a = callbacks.onSurveySubmit) == null ? void 0 : _a.call(callbacks, answers, stepId);
      } }, requestedStepId);
    } else if (experience.widgetType === "slideout") {
      const root = this.root(experience.id, definition.behavior);
      const renderer = new SlideoutRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "banner") {
      const root = this.root(experience.id, definition.behavior);
      const renderer = new BannerRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else return false;
    if (experience.widgetType !== "anchored_card" && experience.widgetType !== "hotspot") requestAnimationFrame(callbacks.onVisible);
    return true;
  }
  renderGuide(experience, definition, callbacks, guideStepId) {
    var _a;
    const stepIndex = guideStepId ? definition.steps.findIndex((item) => item.id === guideStepId) : 0;
    const step = definition.steps[stepIndex];
    if (!step) return false;
    const stepDesign = step.size ? { ...definition.design, size: step.size } : definition.design;
    const stepCallbacks = {
      onDismiss: () => {
        callbacks.onDismiss();
        this.destroy();
      },
      onSecondary: () => {
        callbacks.onDismiss();
        this.destroy();
      },
      onPrimary: () => {
        var _a2, _b;
        const action = step.content.primaryAction;
        if (action) callbacks.onAction(action);
        if ((((_a2 = step.advance) == null ? void 0 : _a2.type) ?? "button") === "button") (_b = callbacks.onGuideAdvance) == null ? void 0 : _b.call(callbacks);
      }
    };
    const addBack = (card) => {
      var _a2;
      if (stepIndex === 0) return;
      const back = document.createElement("button");
      back.className = "secondary";
      back.textContent = "Back";
      back.addEventListener("click", () => {
        var _a3;
        return (_a3 = callbacks.onGuideBack) == null ? void 0 : _a3.call(callbacks);
      });
      (_a2 = card.querySelector("footer")) == null ? void 0 : _a2.prepend(back);
    };
    if (getGuideStepPattern(step) === "modal") {
      const root = this.root(experience.id, { layer: (_a = definition.behavior) == null ? void 0 : _a.layer });
      const renderer = new ModalRenderer();
      this.renderer = renderer;
      const behavior = { dismissible: step.behavior.dismissible ?? true };
      const card = renderer.render(root, step.content, stepDesign, behavior, stepCallbacks, step.builder);
      addBack(card);
      requestAnimationFrame(callbacks.onVisible);
      return true;
    }
    const mount = (target2) => {
      var _a2, _b, _c;
      ensureGuideTargetInView(target2);
      const root = this.root(experience.id, { layer: (_a2 = definition.behavior) == null ? void 0 : _a2.layer }, target2);
      const renderer = new AnchoredCardRenderer();
      this.renderer = renderer;
      const behavior = { dismissible: step.behavior.dismissible ?? true, placement: step.behavior.placement, alignment: step.behavior.alignment, offset: step.behavior.offset, pointer: step.behavior.pointer };
      const card = renderer.render(root, target2, step.content, stepDesign, behavior, stepCallbacks, step.builder, "anchored_card");
      addBack(card);
      this.listenForAdvance(target2, ((_b = step.advance) == null ? void 0 : _b.type) ?? "button", ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover" ? step.advance.durationMs : void 0, callbacks.onGuideAdvance);
      requestAnimationFrame(callbacks.onVisible);
    };
    const target = findTarget(step.target);
    if (target) mount(target);
    else this.cancelPendingTarget = waitForTarget(step.target, (element) => {
      this.cancelPendingTarget = null;
      mount(element);
    }, () => {
      var _a2;
      this.cancelPendingTarget = null;
      (_a2 = callbacks.onUnavailable) == null ? void 0 : _a2.call(callbacks);
    });
    return true;
  }
  listenForAdvance(target, type, durationMs, advance) {
    if (!advance) return;
    if (type === "element_click") {
      let active = true;
      const click = () => queueMicrotask(() => {
        if (active) advance();
      });
      target.addEventListener("click", click);
      this.cleanupAdvance = () => {
        active = false;
        target.removeEventListener("click", click);
      };
    } else if (type === "element_hover") {
      let timer = null;
      const leave = () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
      };
      const enter = () => {
        leave();
        timer = window.setTimeout(advance, durationMs ?? 500);
      };
      target.addEventListener("mouseenter", enter);
      target.addEventListener("mouseleave", leave);
      this.cleanupAdvance = () => {
        leave();
        target.removeEventListener("mouseenter", enter);
        target.removeEventListener("mouseleave", leave);
      };
    }
  }
  callbacks(content, callbacks) {
    return {
      onDismiss: () => {
        callbacks.onDismiss();
        this.destroy();
      },
      onSecondary: () => {
        callbacks.onDismiss();
        this.destroy();
      },
      onPrimary: () => {
        var _a;
        if (content.primaryAction) callbacks.onAction(content.primaryAction);
        if (((_a = content.primaryAction) == null ? void 0 : _a.type) === "dismiss") {
          callbacks.onDismiss();
          this.destroy();
        }
      }
    };
  }
  clearSurface() {
    var _a, _b, _c, _d, _e;
    (_a = this.cleanupAdvance) == null ? void 0 : _a.call(this);
    this.cleanupAdvance = null;
    (_b = this.cancelPendingTarget) == null ? void 0 : _b.call(this);
    this.cancelPendingTarget = null;
    (_c = this.renderer) == null ? void 0 : _c.destroy();
    this.renderer = null;
    (_d = this.appliedLayer) == null ? void 0 : _d.destroy();
    this.appliedLayer = null;
    (_e = this.host) == null ? void 0 : _e.remove();
    this.host = null;
  }
  destroy() {
    this.clearSurface();
  }
}
const GUIDE_TARGET_VIEWPORT_MARGIN = 48;
function ensureGuideTargetInView(target) {
  const rect = target.getBoundingClientRect();
  const comfortablyVisible = rect.width > 0 && rect.height > 0 && rect.top >= GUIDE_TARGET_VIEWPORT_MARGIN && rect.left >= GUIDE_TARGET_VIEWPORT_MARGIN && rect.bottom <= window.innerHeight - GUIDE_TARGET_VIEWPORT_MARGIN && rect.right <= window.innerWidth - GUIDE_TARGET_VIEWPORT_MARGIN;
  if (comfortablyVisible || typeof target.scrollIntoView !== "function") return;
  const prefersReducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
}
const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--movecues-bg);color:var(--movecues-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  .builder-card{padding:0;background:transparent;border:0;box-shadow:none}.builder-content{box-sizing:border-box;width:100%;max-width:100%;overflow:visible}.builder-card>.close{z-index:2}
  .movecues-anchor-pointer{position:absolute;width:var(--movecues-pointer-size);height:var(--movecues-pointer-size);pointer-events:none;z-index:0}.movecues-anchor-pointer svg{display:block;width:100%;height:100%;overflow:visible}.movecues-anchor-pointer[data-placement=bottom]{top:calc(-1 * var(--movecues-pointer-size));transform:translateX(-50%)}.movecues-anchor-pointer[data-placement=top]{bottom:calc(-1 * var(--movecues-pointer-size));transform:translateX(-50%) rotate(180deg)}.movecues-anchor-pointer[data-placement=right]{left:calc(-1 * var(--movecues-pointer-size));transform:translateY(-50%) rotate(-90deg)}.movecues-anchor-pointer[data-placement=left]{right:calc(-1 * var(--movecues-pointer-size));transform:translateY(-50%) rotate(90deg)}.builder-content,.legacy-content{position:relative;z-index:1}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--movecues-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
  .backdrop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,var(--movecues-backdrop-opacity,.45))}
  .modal{left:50%;top:50%;transform:translate(-50%,-50%)}.modal[data-layout=fullscreen],.modal[data-size-width=full]{inset:12px;width:auto!important;max-width:none!important;transform:none;display:flex;flex-direction:column;justify-content:center}.modal[data-layout=fullscreen] footer,.modal[data-size-width=full] footer{justify-content:center}
  .slideout[data-position=top-left]{top:16px;left:16px}.slideout[data-position=top-right]{top:16px;right:16px}.slideout[data-position=bottom-left]{bottom:16px;left:16px}.slideout[data-position=bottom-right]{bottom:16px;right:16px}.slideout[data-position=center-left]{left:16px;top:50%;transform:translateY(-50%)}.slideout[data-position=center-right]{right:16px;top:50%;transform:translateY(-50%)}
  .banner{left:0;right:0;width:auto!important;max-width:none;border-radius:0!important;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center}.banner[data-position=top]{top:0}.banner[data-position=bottom]{bottom:0}.banner h2,.banner p{grid-column:1}.banner footer{grid-column:2;grid-row:1/span 2;margin:0;padding-right:24px}
  .hotspot{pointer-events:auto;position:fixed;width:18px;height:18px;padding:0;border:3px solid #fff;border-radius:50%;background:var(--movecues-hotspot);box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font:700 12px/12px ui-sans-serif,system-ui,sans-serif}.hotspot[data-style=pulse]::after{content:"";position:absolute;inset:-7px;border:2px solid var(--movecues-hotspot);border-radius:50%;animation:movecues-pulse 1.8s ease-out infinite}.hotspot[data-style=dot]{width:14px;height:14px}.hotspot[data-style=question]{width:22px;height:22px}@keyframes movecues-pulse{0%{transform:scale(.65);opacity:.85}100%{transform:scale(1.45);opacity:0}}@media(prefers-reduced-motion:reduce){.hotspot::after{animation:none}}
  .movecues-survey-question.has-error{outline:2px solid #fecaca;outline-offset:6px;border-radius:6px}.movecues-survey-validation{color:#b91c1c}:where(.movecues-survey-option.is-selected){border-color:var(--movecues-primary);background:color-mix(in srgb,var(--movecues-primary) 12%,white)}.movecues-survey-input{font:inherit}
`;
class EditorBridge {
  constructor(apiBase, sessionId, accessToken) {
    this.apiBase = apiBase;
    this.sessionId = sessionId;
    this.accessToken = accessToken;
  }
  headers() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` };
  }
  async load() {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { headers: this.headers(), credentials: "omit" });
    if (!response.ok) throw new Error("Editor session expired");
    return response.json();
  }
  async save(definition) {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ definition }) });
    if (!response.ok) throw new Error("Draft could not be saved");
  }
}
class HighlightOverlay {
  constructor() {
    this.element = document.createElement("div");
    this.element.dataset.movecuesPickerOverlay = "";
    this.element.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2563eb;background:rgba(37,99,235,.12);display:none;box-sizing:border-box";
    document.documentElement.appendChild(this.element);
  }
  show(target) {
    const rect = target.getBoundingClientRect();
    Object.assign(this.element.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }
  hide() {
    this.element.style.display = "none";
  }
  destroy() {
    this.element.remove();
  }
}
const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];
const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;
const UTILITY_CLASS_PATTERN = /^(sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:|dark:|-?(m|p)[trblxy]?-|w-|h-|min-|max-|inset-|top-|right-|bottom-|left-|z-|gap-|space-|grid|flex|items-|justify-|text-|font-|leading-|tracking-|bg-|border|rounded|shadow|opacity-|transition|duration-|absolute$|relative$|fixed$|sticky$|hidden$|block$|inline)/;
class TargetSelectorGenerator {
  generate(element) {
    const verified = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (selector, reliability) => {
      if (!selector || seen.has(selector)) return;
      seen.add(selector);
      if (uniquelyMatches(selector, element)) verified.push({ selector, reliability });
    };
    const tag = element.tagName.toLowerCase();
    const id = shortValue(element.getAttribute("id"));
    if (id) add(`${tag}#${cssIdentifier(id)}`, "reliable");
    for (const selector of attributeSelectors(element, STABLE_DATA_ATTRS)) add(selector, "reliable");
    const semantics = attributeSelectors(element, SEMANTIC_ATTRS);
    for (const selector of semantics) add(selector, "moderate");
    for (const selector of attributeCombinations(element, SEMANTIC_ATTRS)) add(selector, "moderate");
    for (const selector of classSelectors(element)) add(selector, "moderate");
    const childSelectors = [...semantics, ...attributeCombinations(element, SEMANTIC_ATTRS), ...classSelectors(element), tag];
    let ancestor = element.parentElement;
    let depth = 1;
    while (ancestor && ancestor !== document.documentElement && depth <= 4) {
      const relation = depth === 1 ? " > " : " ";
      for (const parentSelector of identitySelectors(ancestor)) {
        for (const childSelector of childSelectors) add(`${parentSelector}${relation}${childSelector}`, "moderate");
      }
      ancestor = ancestor.parentElement;
      depth++;
    }
    for (const selector of structuralSelectors(element)) add(selector, "fragile");
    const primary = verified[0];
    if (!primary) throw new Error("Could not generate a unique selector for the selected element");
    return { primarySelector: primary.selector, fallbackSelectors: verified.slice(1, 6).map((item) => item.selector), reliability: primary.reliability };
  }
  describe(element) {
    return {
      ...this.generate(element),
      label: computeElementLabel(element),
      role: computeElementRole(element),
      tagName: element.tagName.toLowerCase()
    };
  }
}
function attributeSelectors(element, attributes) {
  const tag = element.tagName.toLowerCase();
  return attributes.flatMap((attribute) => {
    const value = shortValue(element.getAttribute(attribute));
    return value ? [`${tag}[${attribute}="${cssString(value)}"]`] : [];
  });
}
function attributeCombinations(element, attributes) {
  const tag = element.tagName.toLowerCase();
  const present = attributes.flatMap((attribute) => {
    const value = shortValue(element.getAttribute(attribute));
    return value ? [{ attribute, value }] : [];
  });
  const selectors = [];
  for (let first = 0; first < present.length; first++) {
    for (let second = first + 1; second < present.length; second++) {
      selectors.push(`${tag}[${present[first].attribute}="${cssString(present[first].value)}"][${present[second].attribute}="${cssString(present[second].value)}"]`);
    }
  }
  return selectors;
}
function classSelectors(element) {
  const tag = element.tagName.toLowerCase();
  const classes = (element.getAttribute("class") ?? "").split(/\s+/).filter(isStableClass).slice(0, 4);
  if (!classes.length) return [];
  const selectors = [`${tag}.${classes.map(cssIdentifier).join(".")}`];
  if (classes.length > 1) {
    for (let first = 0; first < classes.length; first++) for (let second = first + 1; second < classes.length; second++) selectors.push(`${tag}.${cssIdentifier(classes[first])}.${cssIdentifier(classes[second])}`);
  }
  selectors.push(...classes.map((value) => `${tag}.${cssIdentifier(value)}`));
  return [...new Set(selectors)];
}
function identitySelectors(element) {
  const tag = element.tagName.toLowerCase();
  const selectors = [];
  const id = shortValue(element.getAttribute("id"));
  if (id) selectors.push(`${tag}#${cssIdentifier(id)}`);
  selectors.push(...attributeSelectors(element, STABLE_DATA_ATTRS), ...attributeSelectors(element, SEMANTIC_ATTRS), ...attributeCombinations(element, SEMANTIC_ATTRS), ...classSelectors(element));
  return [...new Set(selectors)];
}
function structuralSelectors(element) {
  const selectors = [];
  const parts = [];
  let node = element;
  while (node && node !== document.documentElement) {
    const parent = node.parentElement;
    let part = node.tagName.toLowerCase();
    if (parent) {
      const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === node.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    selectors.push(parts.join(" > "));
    node = parent;
  }
  return selectors;
}
function uniquelyMatches(selector, selected) {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === selected;
  } catch {
    return false;
  }
}
function shortValue(value) {
  return value && value.length <= 160 ? value : null;
}
function isStableClass(value) {
  const unescaped = value.replace(/\\/g, "");
  return !!unescaped && !/^\d/.test(unescaped) && !DYNAMIC_CLASS_PATTERN.test(unescaped) && !UTILITY_CLASS_PATTERN.test(unescaped);
}
function cssIdentifier(value) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function cssString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n\f]/g, " ");
}
class ElementPicker {
  constructor() {
    this.overlay = null;
    this.generator = new TargetSelectorGenerator();
    this.resolve = null;
    this.shiftPassthrough = false;
    this.move = (event) => {
      var _a, _b, _c;
      if (this.shiftPassthrough || event.shiftKey) {
        (_a = this.overlay) == null ? void 0 : _a.hide();
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (target && !isMovcuesSurface(target)) (_b = this.overlay) == null ? void 0 : _b.show(target);
      else (_c = this.overlay) == null ? void 0 : _c.hide();
    };
    this.click = (event) => {
      var _a;
      if (this.shiftPassthrough || event.shiftKey || event.composedPath().some((item) => item instanceof Element && isMovcuesSurface(item))) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || isMovcuesSurface(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        this.finish(this.generator.describe(target));
      } catch {
        (_a = this.overlay) == null ? void 0 : _a.hide();
      }
    };
    this.keyDown = (event) => {
      var _a;
      if (event.key === "Escape") this.finish(null);
      else if (event.key === "Shift") {
        this.shiftPassthrough = true;
        (_a = this.overlay) == null ? void 0 : _a.hide();
      }
    };
    this.keyUp = (event) => {
      if (event.key === "Shift") this.shiftPassthrough = false;
    };
    this.resetPassthrough = () => {
      this.shiftPassthrough = false;
    };
  }
  pick() {
    this.cancel();
    this.overlay = new HighlightOverlay();
    document.addEventListener("pointermove", this.move, true);
    document.addEventListener("click", this.click, true);
    document.addEventListener("keydown", this.keyDown, true);
    document.addEventListener("keyup", this.keyUp, true);
    window.addEventListener("blur", this.resetPassthrough);
    document.addEventListener("visibilitychange", this.resetPassthrough);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
  cancel() {
    if (this.resolve) this.finish(null);
    else this.cleanup();
  }
  finish(value) {
    const resolve = this.resolve;
    this.resolve = null;
    this.cleanup();
    resolve == null ? void 0 : resolve(value);
  }
  cleanup() {
    var _a;
    document.removeEventListener("pointermove", this.move, true);
    document.removeEventListener("click", this.click, true);
    document.removeEventListener("keydown", this.keyDown, true);
    document.removeEventListener("keyup", this.keyUp, true);
    window.removeEventListener("blur", this.resetPassthrough);
    document.removeEventListener("visibilitychange", this.resetPassthrough);
    this.shiftPassthrough = false;
    (_a = this.overlay) == null ? void 0 : _a.destroy();
    this.overlay = null;
  }
}
function isMovcuesSurface(element) {
  if (element.closest("[data-movecues-editor],[data-movecues-experience],[data-movecues-picker-overlay]")) return true;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && isMovcuesSurface(root.host);
}
class EditorModeController {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this.host = null;
    this.root = null;
    this.picker = new ElementPicker();
    this.preview = new ExperienceRenderer();
    this.routeObserver = new RouteObserver();
    this.routeUnsubscribe = null;
    this.mutationObserver = null;
    this.dragCleanup = null;
    this.expiryTimer = 0;
    this.validationTimer = 0;
    this.saveTimer = 0;
    this.saveInFlight = null;
    this.targetRefreshTimer = 0;
    this.selectionGeneration = 0;
    this.bridge = null;
    this.session = null;
    this.draft = null;
    this.definition = null;
    this.guide = null;
    this.survey = null;
    this.stepIndex = 0;
    this.mode = "select";
    this.dirty = false;
    this.previewRendered = false;
    this.currentPath = "";
    this.persistBeforePageLeave = () => this.updateContinuation();
  }
  async start(rawToken) {
    try {
      const response = await fetch(`${this.apiBase}/public/experience-editor/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ token: rawToken })
      });
      if (!response.ok) return false;
      const session = await response.json();
      if (!validSession(session)) return false;
      const clean2 = new URL(location.href);
      const requestedStep = Number(clean2.searchParams.get("movecues_editor_step") ?? "0");
      clean2.searchParams.delete("movecues_editor_token");
      clean2.searchParams.delete("movecues_editor_step");
      history.replaceState(history.state, "", clean2.toString());
      return await this.activate(session, { requestedStep });
    } catch {
      this.destroy();
      return false;
    }
  }
  async resume(continuation) {
    if (!validSession(continuation.session)) {
      clearEditorContinuation();
      return false;
    }
    try {
      return await this.activate(continuation.session, { restoredState: continuation.editorState });
    } catch {
      this.destroy();
      return false;
    }
  }
  async activate(session, options) {
    var _a, _b, _c;
    this.teardown(false);
    const bridge = new EditorBridge(this.apiBase, session.sessionId, session.accessToken);
    let draft;
    try {
      draft = await bridge.load();
    } catch {
      clearEditorContinuation();
      return false;
    }
    if (draft.experience.kind === "checklist") {
      clearEditorContinuation();
      return false;
    }
    this.bridge = bridge;
    this.session = session;
    this.draft = draft;
    this.definition = draft.version.definition;
    this.guide = isGuideDefinition(this.definition) ? this.definition : null;
    this.survey = !this.guide && draft.experience.widgetType === "survey" ? this.definition.survey ?? null : null;
    const selectableSteps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    const restored = ((_c = options.restoredState) == null ? void 0 : _c.experienceId) === draft.experience.id ? options.restoredState : void 0;
    const restoredIndex = selectableSteps && (restored == null ? void 0 : restored.selectedStepId) ? selectableSteps.findIndex((step) => step.id === restored.selectedStepId) : -1;
    this.stepIndex = selectableSteps ? restoredIndex >= 0 ? restoredIndex : clampStep(options.requestedStep ?? 0, selectableSteps.length) : 0;
    this.currentPath = currentPagePath$1();
    this.mode = (restored == null ? void 0 : restored.mode) ?? "select";
    this.updateContinuation();
    this.mount();
    this.expiryTimer = window.setTimeout(() => this.destroy(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    this.validationTimer = window.setInterval(() => {
      void bridge.load().catch(() => this.destroy());
    }, 15e3);
    return true;
  }
  mount() {
    if (!this.draft || !this.definition) return;
    this.host = document.createElement("div");
    this.host.dataset.movecuesEditor = "";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style>${this.panelMarkup(this.draft)}`;
    document.documentElement.appendChild(this.host);
    this.bindPanel();
    this.syncPanel();
    if (this.mode === "select") {
      this.renderPreview();
      this.startPicker();
    }
    this.routeUnsubscribe = this.routeObserver.onChange(() => this.onRouteChange());
    this.routeObserver.start();
    window.addEventListener("pagehide", this.persistBeforePageLeave);
    if (typeof MutationObserver !== "undefined") {
      this.mutationObserver = new MutationObserver(() => this.scheduleTargetRefresh());
      this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["id", "class", "data-testid", "data-test", "data-qa", "data-cy", "aria-label", "role", "name", "href", "hidden"] });
    }
  }
  panelMarkup(draft) {
    var _a, _b;
    const selectableSteps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    const guideMarkup = selectableSteps ? `<section class="section" data-guide><div class="eyebrow">${this.guide ? "Guide" : "Survey"}</div><div class="step-flow">${selectableSteps.map((_, index) => `<button class="step" type="button" data-step="${index}" aria-label="Open step ${index + 1}">${index + 1} <span data-step-icon>○</span></button>`).join('<span class="arrow">→</span>')}</div><div class="muted" data-step-label></div></section>` : "";
    return `<aside>
      <header data-drag-handle>
        <div class="header-copy"><strong>Movcues Live Editor</strong><span>${escapeText(draft.experience.name)}</span><small><i></i> Connected · <span data-save-state>Draft saved</span></small></div>
        <div class="header-actions"><button type="button" data-minimize aria-label="Minimize editor">—</button><button type="button" data-close aria-label="Close editor">×</button></div>
      </header>
      <main>
        <div class="modebar"><button type="button" data-mode="select">Select</button><button type="button" data-mode="navigate">Navigate</button></div>
        <div class="notice" data-route-notice hidden><b>Page changed</b><span data-route-change></span></div>
        ${guideMarkup}
        <section class="section" data-for="target">
          <div class="eyebrow">Target</div><strong class="truncate" data-target-label>Not selected</strong><div class="reliability" data-reliability></div>
          <button class="secondary-button" type="button" data-pick>Reselect target</button>
        </section>
        <section class="section" data-layering-section>
          <div class="eyebrow">Layering</div>
          <label>Policy<select data-layer-mode><option value="auto">Automatic</option><option value="relative">Relative to an element</option><option value="always_on_top">Always on top</option><option value="custom">Advanced / Custom</option></select></label>
          <div class="muted" data-layer-description></div>
          <div data-layer-relative hidden><strong class="truncate" data-layer-target>Not selected</strong><button class="secondary-button" type="button" data-pick-layer>Select element from page</button><label>Relationship<select data-layer-relation><option value="above">Above</option><option value="below">Below</option></select></label></div>
          <label data-layer-custom hidden>Custom z-index<input data-layer-z-index type="number" min="1" max="2147483647"></label>
        </section>
        <section class="section" data-placement-section>
          <div class="eyebrow">Placement</div>
          <div data-for="anchored"><div class="placement-grid">${placementButton("top", "Top")}${placementButton("left", "Left")}${placementButton("auto", "Auto")}${placementButton("right", "Right")}${placementButton("bottom", "Bottom")}</div><label>Alignment<select data-alignment><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label><label>Offset<div class="number"><input data-offset type="number" min="0" max="100"><span>px</span></div></label></div>
          <div data-for="toast"><label>Position<select data-toast-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label><label>Auto-dismiss<div class="number"><input data-auto-dismiss type="number" min="500" placeholder="Disabled"><span>ms</span></div></label></div>
          <div data-for="modal"><label>Layout<select data-modal-layout><option value="center">Centered</option><option value="fullscreen">Fullscreen</option></select></label><label class="check"><input data-backdrop type="checkbox"> Backdrop</label><label>Backdrop opacity<input data-backdrop-opacity type="number" min="0" max="0.9" step="0.05"></label><label class="check"><input data-close-backdrop type="checkbox"> Dismiss on backdrop click</label></div>
          <div data-for="slideout"><label>Position<select data-slideout-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="center-left">Center left</option><option value="center-right">Center right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label></div>
          <div data-for="banner"><label>Position<select data-banner-position><option value="top">Top</option><option value="bottom">Bottom</option></select></label></div>
          <div data-for="cursor"><label>X offset<div class="number"><input data-cursor-x type="number"><span>px</span></div></label><label>Y offset<div class="number"><input data-cursor-y type="number"><span>px</span></div></label></div>
          <div data-for="hotspot"><label>Beacon style<select data-hotspot-style><option value="pulse">Pulse</option><option value="dot">Dot</option><option value="question">Question mark</option></select></label><label>Beacon color<input data-hotspot-color type="color"></label></div>
        </section>
        <section class="section" data-step-summary hidden><div class="eyebrow">Step</div><dl><dt>Advances on</dt><dd data-advance></dd><dt>Dismissible</dt><dd data-dismissible></dd></dl></section>
        <section class="section"><div class="eyebrow">Configured</div><dl data-configured></dl></section>
        <section class="section live"><div class="eyebrow">Live status</div><div class="status-ok">✓ SDK/editor connected</div><div data-preview-status></div><div data-live-target></div><div class="status-ok">✓ Current page available</div><code data-current-path></code><div data-missing-selector hidden><span>Target selector</span><code></code><button class="secondary-button" type="button" data-pick>Reselect target</button></div></section>
        <p class="hint" data-mode-hint></p>
      </main>
    </aside>`;
  }
  bindPanel() {
    var _a, _b, _c;
    const root = this.root;
    root.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => this.setMode(button.dataset.mode)));
    root.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
      if (this.mode === "navigate") this.setMode("select");
      else this.startPicker();
    }));
    (_a = root.querySelector("[data-pick-layer]")) == null ? void 0 : _a.addEventListener("click", () => this.startLayerPicker());
    root.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
    (_b = root.querySelector("[data-minimize]")) == null ? void 0 : _b.addEventListener("click", () => {
      const aside = root.querySelector("aside");
      aside.classList.toggle("minimized");
      const button = root.querySelector("[data-minimize]");
      button.textContent = aside.classList.contains("minimized") ? "+" : "—";
    });
    (_c = root.querySelector("[data-close]")) == null ? void 0 : _c.addEventListener("click", () => void this.close());
    this.bindDrag();
    this.onSelect("[data-alignment]", (value) => {
      this.currentBehavior().alignment = value;
    });
    this.onSelect("[data-layer-mode]", (value) => {
      if (value === "relative") {
        this.startLayerPicker();
        return;
      }
      if (value === "auto") this.setLayer({ mode: "auto" });
      else if (value === "always_on_top") this.setLayer({ mode: "always_on_top" });
      else {
        const current = this.currentLayer();
        this.setLayer({ mode: "custom", zIndex: (current == null ? void 0 : current.mode) === "custom" ? current.zIndex : 1e3 });
      }
    });
    this.onSelect("[data-layer-relation]", (value) => {
      const layer = this.currentLayer();
      if ((layer == null ? void 0 : layer.mode) === "relative") this.setLayer({ ...layer, relation: value });
    });
    this.onInput("[data-layer-z-index]", (value) => {
      this.setLayer({ mode: "custom", zIndex: Math.max(1, Math.min(2147483647, Math.trunc(numberValue(value, 1e3)))) });
    });
    this.onInput("[data-offset]", (value) => {
      this.currentBehavior().offset = numberValue(value, 8);
    });
    root.querySelectorAll("[data-placement]").forEach((button) => button.addEventListener("click", () => {
      this.currentBehavior().placement = button.dataset.placement;
      this.changed();
    }));
    this.onSelect("[data-toast-position]", (value) => {
      this.currentBehavior().toastPosition = value;
    });
    this.onInput("[data-auto-dismiss]", (value) => {
      this.currentBehavior().autoDismissMs = value ? numberValue(value, 0) : null;
    });
    this.onSelect("[data-modal-layout]", (value) => {
      this.currentBehavior().modalLayout = value;
    });
    this.onCheck("[data-backdrop]", (value) => {
      this.currentBehavior().backdrop = value;
    });
    this.onInput("[data-backdrop-opacity]", (value) => {
      this.currentBehavior().backdropOpacity = numberValue(value, 0.45);
    });
    this.onCheck("[data-close-backdrop]", (value) => {
      this.currentBehavior().closeOnBackdrop = value;
    });
    this.onSelect("[data-slideout-position]", (value) => {
      this.currentBehavior().slideoutPosition = value;
    });
    this.onSelect("[data-banner-position]", (value) => {
      this.currentBehavior().bannerPosition = value;
    });
    this.onInput("[data-cursor-x]", (value) => {
      var _a2;
      this.currentBehavior().cursorOffset = { x: numberValue(value, 16), y: ((_a2 = this.currentBehavior().cursorOffset) == null ? void 0 : _a2.y) ?? 16 };
    });
    this.onInput("[data-cursor-y]", (value) => {
      var _a2;
      this.currentBehavior().cursorOffset = { x: ((_a2 = this.currentBehavior().cursorOffset) == null ? void 0 : _a2.x) ?? 16, y: numberValue(value, 16) };
    });
    this.onSelect("[data-hotspot-style]", (value) => {
      this.currentBehavior().hotspotStyle = value;
    });
    this.onInput("[data-hotspot-color]", (value) => {
      this.currentBehavior().hotspotColor = value;
    });
  }
  bindDrag() {
    var _a, _b;
    const handle = (_a = this.root) == null ? void 0 : _a.querySelector("[data-drag-handle]");
    const aside = (_b = this.root) == null ? void 0 : _b.querySelector("aside");
    if (!handle || !aside) return;
    handle.addEventListener("pointerdown", (event) => {
      var _a2;
      if (event.target.closest("button")) return;
      const rect = aside.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const move = (next) => {
        aside.style.right = "auto";
        aside.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
        aside.style.top = `${Math.max(4, Math.min(innerHeight - 48, rect.top + next.clientY - startY))}px`;
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        this.dragCleanup = null;
      };
      (_a2 = this.dragCleanup) == null ? void 0 : _a2.call(this);
      this.dragCleanup = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    });
  }
  onSelect(selector, update) {
    var _a, _b;
    (_b = (_a = this.root) == null ? void 0 : _a.querySelector(selector)) == null ? void 0 : _b.addEventListener("change", (event) => {
      update(event.currentTarget.value);
      this.changed();
    });
  }
  onInput(selector, update) {
    var _a, _b;
    (_b = (_a = this.root) == null ? void 0 : _a.querySelector(selector)) == null ? void 0 : _b.addEventListener("input", (event) => {
      update(event.currentTarget.value);
      this.changed();
    });
  }
  onCheck(selector, update) {
    var _a, _b;
    (_b = (_a = this.root) == null ? void 0 : _a.querySelector(selector)) == null ? void 0 : _b.addEventListener("change", (event) => {
      update(event.currentTarget.checked);
      this.changed();
    });
  }
  switchStep(index) {
    var _a, _b;
    const steps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    if (!steps || index < 0 || index >= steps.length || index === this.stepIndex) return;
    this.selectionGeneration++;
    this.picker.cancel();
    this.stepIndex = index;
    this.updateContinuation();
    this.syncPanel();
    if (this.mode === "select") {
      this.renderPreview();
      this.startPicker();
    }
  }
  setMode(mode) {
    if (this.mode === mode && (mode !== "select" || this.pickerIsSelecting())) return;
    this.selectionGeneration++;
    this.picker.cancel();
    this.mode = mode;
    this.updateContinuation();
    if (mode === "navigate") {
      this.preview.destroy();
      this.previewRendered = false;
      this.syncPanel();
      if (!this.dirty) this.setText("[data-save-state]", "Draft saved");
      return;
    }
    this.renderPreview();
    this.syncPanel();
    this.startPicker();
  }
  startPicker() {
    if (!this.isTargetedType() || this.mode !== "select") return;
    const generation = ++this.selectionGeneration;
    this.setText("[data-mode-hint]", "Select an element · Hold Shift to interact temporarily");
    void this.picker.pick().then((target) => {
      if (generation !== this.selectionGeneration || !this.definition || !target) return;
      this.setTarget(target);
      this.updateContinuation();
      this.changed();
    });
  }
  startLayerPicker() {
    if (this.mode === "navigate") this.mode = "select";
    const generation = ++this.selectionGeneration;
    this.picker.cancel();
    this.setText("[data-mode-hint]", "Select the page element this experience should appear above or below");
    void this.picker.pick().then((target) => {
      if (generation !== this.selectionGeneration || !this.definition || !target) return;
      const current = this.currentLayer();
      this.setLayer({ mode: "relative", relation: (current == null ? void 0 : current.mode) === "relative" ? current.relation : "above", target: { ...target, targetContext: { pagePath: currentPagePath$1() } } });
      this.changed();
    });
  }
  pickerIsSelecting() {
    return !!document.querySelector("[data-movecues-picker-overlay]");
  }
  changed() {
    this.dirty = true;
    this.updateContinuation();
    this.syncPanel();
    if (this.mode === "select") this.renderPreview();
    this.setText("[data-save-state]", "Saving…");
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 350);
  }
  async persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (this.saveInFlight) {
      const saved2 = await this.saveInFlight;
      return saved2 && this.dirty ? this.persist() : saved2;
    }
    if (!this.dirty || !this.bridge || !this.definition) return true;
    this.dirty = false;
    const bridge = this.bridge;
    const definition = this.definition;
    const request = bridge.save(definition).then(() => {
      this.setText("[data-save-state]", this.dirty ? "Saving…" : "Draft saved");
      return true;
    }).catch(() => {
      this.setText("[data-save-state]", "Session expired");
      this.destroy();
      return false;
    });
    this.saveInFlight = request;
    const saved = await request;
    if (this.saveInFlight === request) this.saveInFlight = null;
    if (saved && this.dirty && !this.saveTimer) this.saveTimer = window.setTimeout(() => void this.persist(), 350);
    return saved;
  }
  async close() {
    if (this.dirty && !await this.persist()) return;
    this.destroy();
  }
  renderPreview() {
    var _a, _b;
    if (!this.definition || !this.draft || this.mode === "navigate") return;
    this.previewRendered = false;
    const definition = this.guide ? { ...this.definition, steps: [this.guide.steps[this.stepIndex]] } : this.definition;
    const selectedStepId = (_b = (_a = this.survey) == null ? void 0 : _a.steps[this.stepIndex]) == null ? void 0 : _b.id;
    this.preview.render({
      id: this.draft.experience.id,
      versionId: this.draft.version.id,
      kind: this.draft.experience.kind,
      widgetType: this.draft.experience.widgetType,
      priority: 0,
      definition
    }, {
      onVisible: () => {
        this.previewRendered = true;
        this.updateDiagnostics();
      },
      onDismiss: () => window.setTimeout(() => this.renderPreview(), 0),
      onAction: () => void 0,
      onComplete: () => window.setTimeout(() => this.renderPreview(), 0),
      onUnavailable: () => {
        this.previewRendered = false;
        this.updateDiagnostics();
      }
    }, selectedStepId);
    this.updateDiagnostics();
  }
  syncPanel() {
    var _a, _b;
    if (!this.root || !this.definition || !this.draft) return;
    const behavior = this.currentBehavior();
    const widgetType = this.draft.experience.widgetType;
    const guidePattern = this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : null;
    const activeGroups = new Set(guidePattern === "anchored_card" || !this.guide && widgetType === "anchored_card" ? ["target", "anchored"] : guidePattern === "modal" ? [] : widgetType === "hotspot" ? ["target", "anchored", "hotspot"] : widgetType === "toast" ? ["toast"] : widgetType === "modal" || widgetType === "survey" ? ["modal"] : widgetType === "slideout" ? ["slideout"] : widgetType === "banner" ? ["banner"] : ["cursor"]);
    this.root.querySelectorAll("[data-for]").forEach((group) => {
      group.hidden = !activeGroups.has(group.dataset.for);
    });
    const placementSection = this.root.querySelector("[data-placement-section]");
    if (placementSection) placementSection.hidden = Boolean(this.guide && guidePattern === "modal");
    this.root.querySelector("[data-step-summary]").hidden = !this.guide;
    this.root.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === this.mode));
    this.root.querySelectorAll("[data-placement]").forEach((button) => button.classList.toggle("active", button.dataset.placement === (behavior.placement ?? "auto")));
    const layer = this.currentLayer();
    const layerMode = (layer == null ? void 0 : layer.mode) ?? "always_on_top";
    this.setValue("[data-layer-mode]", layerMode);
    const relative = this.root.querySelector("[data-layer-relative]");
    if (relative) relative.hidden = (layer == null ? void 0 : layer.mode) !== "relative";
    const custom = this.root.querySelector("[data-layer-custom]");
    if (custom) custom.hidden = (layer == null ? void 0 : layer.mode) !== "custom";
    this.setText("[data-layer-description]", layerMode === "auto" ? "Respect the application's UI layers." : layerMode === "relative" ? "Place this experience around a selected page element." : layerMode === "custom" ? "Use an advanced numeric layer." : layer ? "Keep this experience above normal application UI." : "Legacy compatibility: keep this experience above normal application UI.");
    if ((layer == null ? void 0 : layer.mode) === "relative") {
      this.setText("[data-layer-target]", layer.target.label ?? layer.target.primarySelector);
      this.setValue("[data-layer-relation]", layer.relation);
    }
    if ((layer == null ? void 0 : layer.mode) === "custom") this.setValue("[data-layer-z-index]", String(layer.zIndex));
    this.setValue("[data-alignment]", behavior.alignment ?? "center");
    this.setValue("[data-offset]", String(behavior.offset ?? 8));
    this.setValue("[data-toast-position]", behavior.toastPosition ?? "bottom-right");
    this.setValue("[data-auto-dismiss]", behavior.autoDismissMs ? String(behavior.autoDismissMs) : "");
    this.setValue("[data-modal-layout]", behavior.modalLayout ?? "center");
    this.setChecked("[data-backdrop]", behavior.backdrop ?? widgetType === "modal");
    this.setValue("[data-backdrop-opacity]", String(behavior.backdropOpacity ?? 0.45));
    this.setChecked("[data-close-backdrop]", behavior.closeOnBackdrop ?? false);
    this.setValue("[data-slideout-position]", behavior.slideoutPosition ?? "bottom-right");
    this.setValue("[data-banner-position]", behavior.bannerPosition ?? "top");
    this.setValue("[data-cursor-x]", String(((_a = behavior.cursorOffset) == null ? void 0 : _a.x) ?? 16));
    this.setValue("[data-cursor-y]", String(((_b = behavior.cursorOffset) == null ? void 0 : _b.y) ?? 16));
    this.setValue("[data-hotspot-style]", behavior.hotspotStyle ?? "pulse");
    this.setValue("[data-hotspot-color]", behavior.hotspotColor ?? this.definition.design.theme.primary);
    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      this.setText("[data-step-label]", `Step ${this.stepIndex + 1} of ${this.guide.steps.length}`);
      this.setText("[data-advance]", formatAdvance(step.advance));
      this.setText("[data-dismissible]", step.behavior.dismissible ?? true ? "Yes" : "No");
    }
    if (this.survey) this.setText("[data-step-label]", `Step ${this.stepIndex + 1} of ${this.survey.steps.length}`);
    this.renderConfigured(this.definition.targeting);
    this.updateDiagnostics();
    this.setText("[data-mode-hint]", this.mode === "navigate" ? "Customer app interaction is enabled" : this.isTargetedType() ? "Select an element · Hold Shift to interact temporarily" : "Live placement preview");
  }
  renderConfigured(targeting) {
    var _a;
    const items = [];
    items.push(["Trigger", targeting.trigger.type === "custom_event" ? `Custom event · ${targeting.trigger.eventName}` : "Page load"]);
    items.push(["Page", formatPageRules(targeting.pageRules)]);
    items.push(["Frequency", formatFrequency(targeting.frequency)]);
    items.push(["Priority", String(targeting.priority)]);
    items.push(["Interrupt", targeting.interruptPolicy === "interrupt" ? "Interrupt" : "Wait"]);
    if (this.guide) items.push(["Advance", formatAdvance(this.guide.steps[this.stepIndex].advance)]);
    const configured = (_a = this.root) == null ? void 0 : _a.querySelector("[data-configured]");
    if (configured) configured.innerHTML = items.map(([label, value]) => `<dt>${escapeText(label)}</dt><dd>${escapeText(value)}</dd>`).join("");
  }
  updateDiagnostics() {
    if (!this.root) return;
    const target = this.currentTarget();
    const targeted = this.isTargetedType();
    const targetStatus = targeted ? this.targetStatus(target) : "unconfigured";
    const found = targetStatus === "found";
    this.setText("[data-current-path]", this.currentPath || currentPagePath$1());
    this.setText("[data-preview-status]", `${this.previewRendered ? "✓" : "○"} Preview ${this.previewRendered ? "rendered" : this.mode === "navigate" ? "paused for navigation" : "waiting"}`);
    const previewStatus = this.root.querySelector("[data-preview-status]");
    previewStatus == null ? void 0 : previewStatus.classList.toggle("status-ok", this.previewRendered);
    const liveTarget = this.root.querySelector("[data-live-target]");
    if (liveTarget) {
      liveTarget.hidden = !targeted;
      liveTarget.textContent = targetStatus === "found" ? "✓ Found on current page" : targetStatus === "off-page" ? "○ Configured on another page" : targetStatus === "missing" ? "⚠ Expected on current page but not found" : "○ Not configured";
      liveTarget.className = found ? "status-ok" : targetStatus === "missing" ? "status-error" : "muted";
    }
    this.setText("[data-target-label]", (target == null ? void 0 : target.label) || (target == null ? void 0 : target.primarySelector) || "Not selected");
    this.setText("[data-reliability]", target ? `${reliabilityIcon(target.reliability)} ${capitalize(target.reliability)} selector` : "○ No selector configured");
    const reliability = this.root.querySelector("[data-reliability]");
    if (reliability) reliability.dataset.level = (target == null ? void 0 : target.reliability) ?? "none";
    const missing = this.root.querySelector("[data-missing-selector]");
    if (missing) {
      missing.hidden = targetStatus !== "missing";
      const code = missing.querySelector("code");
      if (code) code.textContent = (target == null ? void 0 : target.primarySelector) ?? "";
    }
    if (this.guide) this.root.querySelectorAll("[data-step]").forEach((button, index) => {
      const guideStep = this.guide.steps[index];
      const stepTarget = guideStep.target;
      const state = index === this.stepIndex ? "current" : guideStepRequiresTarget(guideStep) ? this.targetStatus(stepTarget) : "found";
      button.dataset.stepStatus = state;
      const icon = button.querySelector("[data-step-icon]");
      if (icon) icon.textContent = state === "current" ? "●" : state === "found" ? "✓" : state === "missing" ? "⚠" : "○";
      button.classList.toggle("active", index === this.stepIndex);
    });
    else if (this.survey) this.root.querySelectorAll("[data-step]").forEach((button, index) => {
      button.dataset.stepStatus = index === this.stepIndex ? "current" : "found";
      button.classList.toggle("active", index === this.stepIndex);
      const icon = button.querySelector("[data-step-icon]");
      if (icon) icon.textContent = index === this.stepIndex ? "●" : "✓";
    });
  }
  scheduleTargetRefresh() {
    clearTimeout(this.targetRefreshTimer);
    this.targetRefreshTimer = window.setTimeout(() => this.updateDiagnostics(), 80);
  }
  onRouteChange() {
    var _a;
    const previous = this.currentPath;
    const next = currentPagePath$1();
    if (next === previous) return;
    this.currentPath = next;
    this.updateContinuation();
    const notice = (_a = this.root) == null ? void 0 : _a.querySelector("[data-route-notice]");
    if (notice) notice.hidden = false;
    this.setText("[data-route-change]", `${previous} → ${next}`);
    this.updateDiagnostics();
    if (this.mode === "select") this.renderPreview();
  }
  currentTarget() {
    if (!this.definition) return void 0;
    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      return step && guideStepRequiresTarget(step) ? step.target : void 0;
    }
    return this.definition.target;
  }
  targetStatus(target) {
    var _a;
    if (!target) return "unconfigured";
    if (((_a = target.targetContext) == null ? void 0 : _a.pagePath) && target.targetContext.pagePath !== (this.currentPath || currentPagePath$1())) return "off-page";
    return findTarget(target) ? "found" : "missing";
  }
  currentBehavior() {
    if (!this.definition) return { dismissible: true };
    return this.guide ? this.guide.steps[this.stepIndex].behavior : this.definition.behavior;
  }
  currentLayer() {
    var _a;
    if (!this.definition) return void 0;
    return this.guide ? (_a = this.guide.behavior) == null ? void 0 : _a.layer : this.definition.behavior.layer;
  }
  setLayer(layer) {
    if (!this.definition) return;
    if (this.guide) this.guide.behavior = { ...this.guide.behavior, layer };
    else this.definition.behavior.layer = layer;
  }
  setTarget(target) {
    if (!this.definition) return;
    const contextualTarget = { ...target, targetContext: { pagePath: currentPagePath$1() } };
    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      if (!guideStepRequiresTarget(step)) return;
      step.target = contextualTarget;
    } else this.definition.target = contextualTarget;
  }
  updateContinuation() {
    var _a, _b, _c, _d;
    if (!this.session || !this.draft) return;
    storeEditorContinuation({
      session: this.session,
      editorState: {
        experienceId: this.draft.experience.id,
        selectedStepId: ((_b = (_a = this.guide) == null ? void 0 : _a.steps[this.stepIndex]) == null ? void 0 : _b.id) ?? ((_d = (_c = this.survey) == null ? void 0 : _c.steps[this.stepIndex]) == null ? void 0 : _d.id),
        mode: this.mode
      }
    });
  }
  isTargetedType() {
    var _a;
    const type = (_a = this.draft) == null ? void 0 : _a.experience.widgetType;
    return this.guide ? guideStepRequiresTarget(this.guide.steps[this.stepIndex]) : type === "anchored_card" || type === "hotspot";
  }
  setText(selector, value) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
    if (element) element.textContent = value;
  }
  setValue(selector, value) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
    if (element) element.value = value;
  }
  setChecked(selector, value) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
    if (element) element.checked = value;
  }
  destroy() {
    this.teardown(true);
  }
  teardown(clearContinuation) {
    var _a, _b, _c, _d;
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.targetRefreshTimer);
    this.selectionGeneration++;
    (_a = this.routeUnsubscribe) == null ? void 0 : _a.call(this);
    this.routeUnsubscribe = null;
    this.routeObserver.stop();
    window.removeEventListener("pagehide", this.persistBeforePageLeave);
    (_b = this.mutationObserver) == null ? void 0 : _b.disconnect();
    this.mutationObserver = null;
    (_c = this.dragCleanup) == null ? void 0 : _c.call(this);
    this.dragCleanup = null;
    this.preview.destroy();
    this.picker.cancel();
    (_d = this.host) == null ? void 0 : _d.remove();
    this.host = null;
    this.root = null;
    this.bridge = null;
    this.session = null;
    this.draft = null;
    this.definition = null;
    this.guide = null;
    this.survey = null;
    this.dirty = false;
    this.previewRendered = false;
    this.saveInFlight = null;
    if (clearContinuation) clearEditorContinuation();
  }
}
function placementButton(value, label) {
  return `<button type="button" data-placement="${value}">${label}</button>`;
}
function clampStep(value, length) {
  return Number.isFinite(value) && length ? Math.max(0, Math.min(Math.trunc(value), length - 1)) : 0;
}
function validSession(value) {
  return !!value && typeof value.sessionId === "string" && !!value.sessionId && typeof value.accessToken === "string" && !!value.accessToken && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now();
}
function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function currentPagePath$1() {
  return `${location.pathname}${location.search}${location.hash}`;
}
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function reliabilityIcon(value) {
  return value === "reliable" ? "✓" : value === "moderate" ? "●" : "⚠";
}
function formatFrequency(value) {
  const mode = value.mode === "once" ? "Once ever" : value.mode === "once_per_session" ? "Once per session" : "Every qualifying time";
  const limits = [value.maxImpressions ? `max ${value.maxImpressions}` : "", value.cooldownHours ? `${value.cooldownHours}h cooldown` : ""].filter(Boolean);
  return limits.length ? `${mode} · ${limits.join(" · ")}` : mode;
}
function formatPageRules(rules) {
  if (!rules.length) return "All pages";
  return rules.map((rule) => `${rule.kind === "exclude" ? "Exclude" : "Include"} ${rule.value}`).join(" · ");
}
function formatAdvance(advance) {
  if (!advance || advance.type === "button") return "Button click";
  if (advance.type === "element_click") return "Target element click";
  if (advance.type === "element_hover") return `Target element hover${advance.durationMs ? ` · ${advance.durationMs}ms` : ""}`;
  if (advance.type === "custom_event") return `Custom event · ${advance.eventName}`;
  return `Route · ${formatPageRules(advance.pageRules)}`;
}
function escapeText(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}
const STYLE = `
:host{all:initial}*{box-sizing:border-box}aside{position:fixed;right:12px;top:12px;width:312px;max-height:calc(100vh - 24px);z-index:2147483647;overflow:hidden;background:#fff;color:#111827;border:1px solid #d7dce3;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.24);font:13px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif}header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 12px 10px;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none}.header-copy{display:grid;min-width:0}.header-copy strong{font-size:13px}.header-copy>span{overflow:hidden;color:#4b5563;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.header-copy small{margin-top:3px;color:#6b7280;font-size:11px}.header-copy i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a}.header-actions{display:flex;gap:2px}.header-actions button{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#64748b;font:16px/1 inherit;cursor:pointer}.header-actions button:hover{background:#f1f5f9;color:#0f172a}main{max-height:calc(100vh - 82px);overflow:auto}.minimized{width:260px}.minimized main{display:none}.modebar{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.modebar button,.secondary-button,.placement-grid button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#334155;font:600 12px inherit;cursor:pointer}.modebar button{padding:7px}.modebar button.active,.placement-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.notice{display:grid;gap:2px;margin:8px 10px 0;padding:8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:11px}.section{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3}.eyebrow{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.muted,.hint{color:#64748b;font-size:11px}.hint{margin:0;padding:9px 12px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-flow{display:flex;align-items:center;overflow:auto}.step{flex:none;padding:4px 6px;border:0;border-radius:6px;background:transparent;color:#64748b;font:600 11px inherit;cursor:pointer}.step.active{background:#eff6ff;color:#1d4ed8}.step[data-step-status=found]{color:#15803d}.step[data-step-status=missing]{color:#b45309}.step.active{color:#1d4ed8}.arrow{color:#cbd5e1;font-size:10px}.reliability{color:#64748b;font-size:11px}.reliability[data-level=reliable]{color:#15803d}.reliability[data-level=fragile]{color:#b45309}.secondary-button{padding:7px 9px}.placement-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.placement-grid button{padding:6px}.placement-grid button[data-placement=top]{grid-column:2}.placement-grid button[data-placement=left]{grid-column:1}.placement-grid button[data-placement=auto]{grid-column:2}.placement-grid button[data-placement=right]{grid-column:3}.placement-grid button[data-placement=bottom]{grid-column:2}label{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;color:#475569;font-size:11px}label.check{display:flex}label.check input{width:auto}input,select{min-width:0;width:100%;padding:6px 7px;border:1px solid #d7dce3;border-radius:6px;background:#fff;color:#111827;font:12px inherit}.number{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px}.number span{color:#64748b;font-size:11px}dl{display:grid;grid-template-columns:82px minmax(0,1fr);gap:5px 8px;margin:0;font-size:11px}dt{color:#64748b}dd{min-width:0;margin:0;overflow-wrap:anywhere;color:#1f2937}.live{font-size:11px}.status-ok{color:#15803d}.status-error{color:#b91c1c}.live code{display:block;overflow:hidden;padding:4px 6px;border-radius:5px;background:#f8fafc;color:#475569;font:11px/1.35 ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap}[data-missing-selector]{display:grid;gap:5px;padding-top:4px;color:#b91c1c}[hidden]{display:none!important}
`;
class EligibilityEngine {
  choose(experiences) {
    return [...experiences].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
  }
}
const ONCE_KEY = "__movecues_experiences_seen__";
const SESSION_KEY = "__movecues_experiences_session_seen__";
const GUIDE_KEY = "__movecues_active_guide__";
function read(storage, key) {
  try {
    return new Set(JSON.parse(storage.getItem(key) ?? "[]"));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
class ExperienceStateStore {
  hasEver(id) {
    return read(localStorage, ONCE_KEY).has(id);
  }
  hasInSession(id) {
    return read(sessionStorage, SESSION_KEY).has(id);
  }
  markSeen(id) {
    for (const [storage, key] of [[localStorage, ONCE_KEY], [sessionStorage, SESSION_KEY]]) {
      const values = read(storage, key);
      values.add(id);
      try {
        storage.setItem(key, JSON.stringify([...values]));
      } catch {
      }
    }
  }
  getGuideProgress() {
    try {
      const value = JSON.parse(sessionStorage.getItem(GUIDE_KEY) ?? "null");
      return value && typeof value.experienceId === "string" && typeof value.versionId === "string" && typeof value.currentStepId === "string" && (value.status === "active" || value.status === "paused") && (value.impressionId === void 0 || typeof value.impressionId === "string") ? value : null;
    } catch {
      return null;
    }
  }
  setGuideProgress(progress) {
    try {
      sessionStorage.setItem(GUIDE_KEY, JSON.stringify(progress));
    } catch {
    }
  }
  clearGuideProgress(experienceId) {
    var _a;
    try {
      if (!experienceId || ((_a = this.getGuideProgress()) == null ? void 0 : _a.experienceId) === experienceId) sessionStorage.removeItem(GUIDE_KEY);
    } catch {
    }
  }
}
class ChecklistRenderer {
  constructor() {
    this.host = null;
  }
  render(checklist, callbacks, forceLauncher = false) {
    this.destroy();
    const nodes = sanitizeBuilderHtml(checklist.definition.builder.html);
    const css = safeBuilderCss(checklist.definition.builder.css);
    if (!nodes || css === null) return false;
    this.host = document.createElement("div");
    this.host.dataset.movecuesChecklist = checklist.id;
    const side = checklist.definition.behavior.position === "bottom-left" ? "left:16px" : "right:16px";
    this.host.style.cssText = `position:fixed;bottom:16px;${side};z-index:${ALWAYS_ON_TOP_Z_INDEX};pointer-events:auto`;
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial}.surface{position:relative;pointer-events:auto}.surface>.movecues-widget{position:relative!important;inset:auto!important}${css}`;
    root.appendChild(style);
    const surface = document.createElement("div");
    surface.className = "surface";
    surface.append(...nodes);
    root.appendChild(surface);
    const authoredRoot = surface.querySelector('[data-movecues-checklist-role="root"]');
    if (!authoredRoot || surface.querySelectorAll('[data-movecues-checklist-role="root"]').length !== 1) {
      this.destroy();
      return false;
    }
    const requiredRoles = ["title", "description", "progress", "items", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge"];
    const requiredViews = ["expanded", "launcher", "completion"];
    if (requiredRoles.some((role) => authoredRoot.querySelectorAll(`[data-movecues-checklist-role="${role}"]`).length !== 1) || requiredViews.some((view2) => authoredRoot.querySelectorAll(`[data-movecues-checklist-view="${view2}"]`).length !== 1)) {
      this.destroy();
      return false;
    }
    const itemElements = /* @__PURE__ */ new Map();
    for (const element of Array.from(authoredRoot.querySelectorAll("[data-movecues-checklist-item-id]"))) {
      const id = element.dataset.movecuesChecklistItemId;
      if (!id || itemElements.has(id) || element.querySelectorAll('[data-movecues-checklist-item-role="state"]').length !== 1 || element.querySelectorAll('[data-movecues-checklist-item-role="title"]').length !== 1 || element.querySelectorAll('[data-movecues-checklist-item-role="description"]').length !== 1) {
        this.destroy();
        return false;
      }
      itemElements.set(id, element);
    }
    if (checklist.definition.items.some((item) => !itemElements.has(item.id)) || itemElements.size !== checklist.definition.items.length) {
      this.destroy();
      return false;
    }
    setText(authoredRoot, "title", checklist.definition.title);
    setText(authoredRoot, "description", checklist.definition.description ?? "");
    setText(authoredRoot, "launcher-label", checklist.definition.title);
    setText(authoredRoot, "completion-title", checklist.definition.completionMessage.title);
    setText(authoredRoot, "completion-description", checklist.definition.completionMessage.description ?? "");
    setText(authoredRoot, "completion-acknowledge", checklist.definition.completionMessage.acknowledgeLabel);
    authoredRoot.querySelectorAll('[data-movecues-checklist-role="dismiss"]').forEach((element) => {
      element.hidden = !checklist.definition.behavior.dismissible;
    });
    const completed = new Set(checklist.progress.completedItemIds);
    const remaining = checklist.definition.items.length - completed.size;
    setText(authoredRoot, "progress", `${completed.size} of ${checklist.definition.items.length} complete`);
    setText(authoredRoot, "remaining-count", checklist.definition.behavior.showRemainingCount ? String(remaining) : "");
    const container = authoredRoot.querySelector('[data-movecues-checklist-role="items"]');
    if (!container) {
      this.destroy();
      return false;
    }
    checklist.definition.items.forEach((item, index) => {
      var _a;
      const element = itemElements.get(item.id);
      container.appendChild(element);
      const state = ((_a = checklist.progress.items[index]) == null ? void 0 : _a.state) ?? "locked";
      element.dataset.state = state;
      element.setAttribute("aria-disabled", state === "locked" ? "true" : "false");
      setText(element, "title", item.title, true);
      setText(element, "description", item.description ?? "", true);
    });
    const view = checklist.progress.complete ? "completion" : forceLauncher || checklist.progress.collapsed ? "launcher" : "expanded";
    authoredRoot.querySelectorAll("[data-movecues-checklist-view]").forEach((element) => element.classList.toggle("is-active", element.dataset.movecuesChecklistView === view));
    authoredRoot.addEventListener("click", (event) => {
      var _a;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const item = target.closest("[data-movecues-checklist-item-id]");
      if (item && item.dataset.state !== "locked") {
        callbacks.onItemClick(item.dataset.movecuesChecklistItemId);
        return;
      }
      const role = (_a = target.closest("[data-movecues-checklist-role]")) == null ? void 0 : _a.dataset.movecuesChecklistRole;
      if (role === "launcher-label" || target.closest('[data-movecues-checklist-view="launcher"]')) callbacks.onOpen();
      else if (role === "collapse") callbacks.onCollapse();
      else if (role === "completion-acknowledge") callbacks.onAcknowledge();
      else if (role === "dismiss") callbacks.onDismiss();
    });
    document.documentElement.appendChild(this.host);
    return true;
  }
  destroy() {
    var _a;
    (_a = this.host) == null ? void 0 : _a.remove();
    this.host = null;
  }
}
function setText(root, role, value, itemRole = false) {
  const attribute = itemRole ? "data-movecues-checklist-item-role" : "data-movecues-checklist-role";
  const element = root.querySelector(`[${attribute}="${role}"]`);
  if (element) element.textContent = value;
}
class ChecklistManager {
  constructor(apiBase, siteId, session, launchGuide) {
    this.apiBase = apiBase;
    this.siteId = siteId;
    this.session = session;
    this.launchGuide = launchGuide;
    this.renderer = new ChecklistRenderer();
    this.current = null;
    this.impressionId = null;
    this.shown = /* @__PURE__ */ new Set();
    this.forceLauncher = false;
    this.destroyed = false;
    this.refreshPromise = null;
    this.trailingRefresh = false;
  }
  setChecklist(checklist) {
    var _a;
    if (this.destroyed) return;
    if (!checklist) {
      this.current = null;
      this.impressionId = null;
      this.renderer.destroy();
      return;
    }
    if (((_a = this.current) == null ? void 0 : _a.id) !== checklist.id || this.current.versionId !== checklist.versionId) this.impressionId = null;
    this.current = checklist;
    this.render();
    const key = `${checklist.id}:${checklist.versionId}`;
    if (!this.shown.has(key)) {
      this.shown.add(key);
      void this.action("shown").then((response) => {
        if (response == null ? void 0 : response.impressionId) this.impressionId = response.impressionId;
      });
    }
  }
  setTransientActive(active) {
    this.forceLauncher = active;
    if (this.current) this.render();
  }
  hasChecklist() {
    return Boolean(this.current);
  }
  refresh() {
    if (!this.current || this.destroyed) return Promise.resolve();
    if (this.refreshPromise) {
      this.trailingRefresh = true;
      return this.refreshPromise;
    }
    const current = this.current;
    this.refreshPromise = this.request(`${this.path(current)}/refresh`, { versionId: current.versionId }).then((response) => {
      if (this.current === current && (response == null ? void 0 : response.items)) {
        current.progress = response;
        this.render();
      }
    }).finally(() => {
      this.refreshPromise = null;
      if (this.trailingRefresh) {
        this.trailingRefresh = false;
        void this.refresh();
      }
    });
    return this.refreshPromise;
  }
  destroy() {
    this.destroyed = true;
    this.current = null;
    this.renderer.destroy();
  }
  render() {
    const current = this.current;
    if (!current) return;
    const mounted = this.renderer.render(current, { onOpen: () => void this.transition("open"), onCollapse: () => void this.transition("collapse"), onDismiss: () => void this.transition("dismiss"), onAcknowledge: () => void this.transition("completion_acknowledged"), onItemClick: (id) => void this.clickItem(id) }, this.forceLauncher);
    if (!mounted) {
      this.current = null;
      this.renderer.destroy();
    }
  }
  async transition(action) {
    const current = this.current;
    if (!current) return;
    const response = await this.action(action);
    if (this.current !== current) return;
    if (response == null ? void 0 : response.progress) current.progress = response.progress;
    if (action === "dismiss" || action === "completion_acknowledged") {
      this.current = null;
      this.renderer.destroy();
      return;
    }
    current.progress.collapsed = action === "collapse";
    this.render();
  }
  async clickItem(itemId) {
    const current = this.current;
    if (!current) return;
    const response = await this.action("item_click", itemId);
    if (!response || this.current !== current) return;
    if (response.progress) current.progress = response.progress;
    this.render();
    const item = response.item;
    if (!item) return;
    if (item.action.type === "launch_guide") await this.launchGuide(item.action.experienceId, { source: "checklist", checklistExperienceId: current.id, itemId });
    else if (item.action.type === "navigate") {
      try {
        const url = new URL(item.action.url, location.href);
        if (url.origin === location.origin) location.assign(url.href);
      } catch {
      }
    } else if (item.action.type === "open_url") {
      try {
        const url = new URL(item.action.url);
        if (/^https?:$/.test(url.protocol)) window.open(url.href, "_blank", "noopener,noreferrer");
      } catch {
      }
    }
  }
  action(action, itemId) {
    const current = this.current;
    if (!current) return Promise.resolve(null);
    return this.request(`${this.path(current)}/actions`, { versionId: current.versionId, impressionId: this.impressionId ?? void 0, action, itemId });
  }
  path(current) {
    return `/public/sites/${encodeURIComponent(this.siteId)}/checklists/${encodeURIComponent(current.id)}`;
  }
  async request(path, body) {
    try {
      const userId = this.session.getIdentifiedUserId();
      const response = await fetch(`${this.apiBase}${path}`, { method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, url: location.href, anonymousId: this.session.getAnonymousId(), ...userId ? { trackedUserId: userId } : {}, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), timestamp: Date.now() }) });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }
}
class ExperienceLoader {
  constructor(apiBase, siteId, session, trackEvent) {
    this.apiBase = apiBase;
    this.siteId = siteId;
    this.session = session;
    this.trackEvent = trackEvent;
    this.renderer = new ExperienceRenderer();
    this.eligibility = new EligibilityEngine();
    this.state = new ExperienceStateStore();
    this.active = null;
    this.pausedGuide = null;
    this.queued = null;
    this.justFinishedId = null;
    this.destroyed = false;
    this.hasChecklistCandidates = false;
    this.checklist = new ChecklistManager(apiBase, siteId, session, (id, context) => this.launch(id, context));
  }
  async evaluate(trigger) {
    var _a, _b;
    if (this.destroyed) return;
    try {
      const manifest = await this.fetchExperiences(trigger);
      if (this.destroyed) return;
      this.hasChecklistCandidates = manifest.hasChecklists;
      this.checklist.setChecklist(manifest.checklists[0] ?? null);
      const experiences = manifest.experiences;
      const candidates = [...experiences, ...this.queued ? [this.queued] : []].filter((item, index, all) => {
        var _a2;
        return item.id !== ((_a2 = this.active) == null ? void 0 : _a2.experience.id) && item.id !== this.justFinishedId && all.findIndex((candidate) => candidate.id === item.id) === index;
      });
      const chosen = this.eligibility.choose(candidates);
      this.justFinishedId = null;
      if (this.active) {
        const activeGuide = this.activeGuide();
        if (activeGuide && chosen && chosen.priority > activeGuide.experience.priority && chosen.interruptPolicy === "interrupt") {
          this.pauseGuide();
          this.show(chosen);
        } else if (chosen) this.queued = chosen;
        return;
      }
      if (this.pausedGuide) {
        if (chosen && chosen.id !== this.pausedGuide.experience.id && chosen.priority > this.pausedGuide.experience.priority && chosen.interruptPolicy === "interrupt") this.show(chosen);
        else this.resumeGuide();
        return;
      }
      if (!chosen) return;
      const stored = this.state.getGuideProgress();
      const stepId = isGuideDefinition(chosen.definition) && (stored == null ? void 0 : stored.experienceId) === chosen.id && stored.versionId === chosen.versionId ? stored.currentStepId : void 0;
      if (stepId && (stored == null ? void 0 : stored.launchContext) && stored.navigationAttempted && isGuideDefinition(chosen.definition)) {
        const step = chosen.definition.steps.find((item) => item.id === stepId);
        const path = step && guideStepRequiresTarget(step) ? (_b = (_a = step.target) == null ? void 0 : _a.targetContext) == null ? void 0 : _b.pagePath : void 0;
        if (path && path !== currentPagePath()) {
          this.state.clearGuideProgress(chosen.id);
          this.checklist.setTransientActive(false);
          return;
        }
      }
      this.show(chosen, stepId, stepId ? stored ?? void 0 : void 0);
    } catch {
    }
  }
  onRouteChange() {
    if (this.destroyed) return;
    const activeGuide = this.activeGuide();
    if (activeGuide) {
      const advanced = this.advanceForRoute(activeGuide);
      if (!advanced) this.renderActiveGuide();
      else if (!this.active) return;
    } else if (this.active) {
      this.renderer.destroy();
      this.active = null;
      this.checklist.setTransientActive(false);
    } else if (this.pausedGuide) this.advanceForRoute(this.pausedGuide);
    void this.evaluate();
  }
  onCustomEvent(name) {
    var _a;
    const activeGuide = this.activeGuide();
    if (activeGuide) {
      const step = this.currentGuideStep(activeGuide);
      if (((_a = step == null ? void 0 : step.advance) == null ? void 0 : _a.type) === "custom_event" && step.advance.eventName === name) {
        this.advanceGuide();
        return;
      }
    }
    void this.evaluate(name);
  }
  refreshChecklist() {
    return this.hasChecklistCandidates ? this.evaluate() : Promise.resolve();
  }
  hasActiveChecklist() {
    return this.hasChecklistCandidates || this.checklist.hasChecklist();
  }
  launchExperience(experienceId) {
    return this.launch(experienceId, { source: "api" });
  }
  destroy() {
    this.destroyed = true;
    this.renderer.destroy();
    this.checklist.destroy();
    this.active = null;
    this.pausedGuide = null;
    this.queued = null;
  }
  async fetchExperiences(trigger) {
    const query = new URLSearchParams({ url: location.href, anonymousId: this.session.getAnonymousId(), sessionId: this.session.getSessionId() });
    const userId = this.session.getIdentifiedUserId();
    if (userId) query.set("trackedUserId", userId);
    if (trigger) query.set("trigger", trigger);
    const stored = this.state.getGuideProgress();
    if (stored) {
      query.set("activeGuideId", stored.experienceId);
      query.set("activeGuideVersionId", stored.versionId);
    }
    const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences?${query}`, { credentials: "omit" });
    if (!response.ok) return { experiences: [], checklists: [], hasChecklists: this.hasChecklistCandidates };
    const manifest = await response.json();
    return { experiences: Array.isArray(manifest.experiences) ? manifest.experiences : [], checklists: Array.isArray(manifest.checklists) ? manifest.checklists : [], hasChecklists: manifest.hasChecklists === true };
  }
  show(experience, requestedStepId, progress) {
    var _a, _b;
    if (((_a = this.queued) == null ? void 0 : _a.id) === experience.id) this.queued = null;
    const definition = isGuideDefinition(experience.definition) ? experience.definition : null;
    const currentStepId = (definition == null ? void 0 : definition.steps.some((step) => step.id === requestedStepId)) ? requestedStepId : (_b = definition == null ? void 0 : definition.steps[0]) == null ? void 0 : _b.id;
    const impressionId = (progress == null ? void 0 : progress.impressionId) ?? experience.impressionId ?? null;
    const runtime = { experience, currentStepId, impressionId, shownRequested: Boolean(impressionId), shownPromise: null, surveyResponseId: null, surveyResponsePromise: null, surveyAnswers: {}, stepStartedAt: null, visibleStepId: null, launchContext: (progress == null ? void 0 : progress.launchContext) ?? experience.launchContext };
    this.active = runtime;
    this.checklist.setTransientActive(true);
    if (currentStepId) this.persistGuide(runtime, "active");
    const mounted = currentStepId ? progress && this.advanceForRoute(runtime) ? true : (this.renderActiveGuide(), true) : this.renderer.render(experience, this.callbacks(runtime), currentStepId);
    if (!mounted && this.active === runtime) {
      this.active = null;
      this.checklist.setTransientActive(false);
      if (currentStepId) this.state.clearGuideProgress(experience.id);
    }
  }
  callbacks(runtime) {
    return {
      onVisible: () => {
        this.shown(runtime);
        this.stepVisible(runtime);
      },
      onDismiss: () => void this.finish(runtime, "dismissed"),
      onAction: (action) => this.handleAction(runtime, action),
      onComplete: () => void this.finish(runtime, "completed"),
      onGuideAdvance: () => this.advanceGuide(),
      onGuideBack: () => this.backGuide(),
      onUnavailable: () => {
        if (this.active !== runtime) return;
        this.active = null;
        if (runtime.currentStepId && runtime.launchContext) {
          this.state.clearGuideProgress(runtime.experience.id);
          this.checklist.setTransientActive(false);
          void this.checklist.refresh();
        } else if (runtime.currentStepId) {
          this.pausedGuide = runtime;
          this.persistGuide(runtime, "paused");
          this.checklist.setTransientActive(false);
        }
      },
      onSurveyProgress: async (answers, stepId, direction) => {
        await this.persistSurvey(runtime, answers, stepId);
        if (direction === "next") void this.post(runtime, "interaction", void 0, "survey_step_completed", { stepId, stepIndex: this.surveyStepIndex(runtime, stepId) });
      },
      onSurveySubmit: async (answers, stepId) => {
        await this.persistSurvey(runtime, answers, stepId, "submitted");
        await this.finish(runtime, "completed", true);
      }
    };
  }
  shown(runtime) {
    if (runtime.shownRequested) return;
    runtime.shownRequested = true;
    this.state.markSeen(runtime.experience.id);
    runtime.shownPromise = this.post(runtime, "shown", void 0, "experience_shown").then((result) => {
      runtime.impressionId = (result == null ? void 0 : result.impressionId) ?? null;
      if (this.active === runtime) this.persistGuide(runtime, "active");
      else if (this.pausedGuide === runtime) this.persistGuide(runtime, "paused");
    });
    if (runtime.experience.widgetType === "survey") void runtime.shownPromise.then(async () => {
      await this.ensureSurveyResponse(runtime);
      await this.post(runtime, "interaction", void 0, "survey_started");
    });
  }
  handleAction(runtime, action) {
    var _a;
    if (!isGuideDefinition(runtime.experience.definition)) void this.recordAction(runtime, action.type);
    if (action.type === "open_url" && action.url) window.location.assign(action.url);
    if (action.type === "track_event" && action.eventName) (_a = this.trackEvent) == null ? void 0 : _a.call(this, action.eventName);
  }
  async recordAction(runtime, action) {
    await runtime.shownPromise;
    await this.post(runtime, "action", action, "widget_interacted");
  }
  async finish(runtime, event, surveyAlreadyPersisted = false) {
    if (this.active === runtime) {
      this.renderer.destroy();
      this.active = null;
    }
    if (runtime.currentStepId) this.state.clearGuideProgress(runtime.experience.id);
    if (runtime.experience.widgetType === "survey" && event === "dismissed" && !surveyAlreadyPersisted) await this.persistSurvey(runtime, runtime.surveyAnswers, null, "abandoned");
    await runtime.shownPromise;
    const guide = isGuideDefinition(runtime.experience.definition);
    const eventType = guide ? event === "completed" ? "guide_completed" : "guide_dismissed" : runtime.experience.widgetType === "survey" ? event === "completed" ? "survey_submitted" : "survey_abandoned" : event === "dismissed" ? "widget_dismissed" : "widget_interacted";
    await this.post(runtime, event, void 0, eventType, guide ? this.currentStepPayload(runtime, event === "dismissed") : void 0);
    this.justFinishedId = runtime.experience.id;
    this.checklist.setTransientActive(false);
    void this.checklist.refresh();
    if (!this.destroyed) void this.evaluate();
  }
  advanceGuide() {
    const runtime = this.activeGuide();
    if (!runtime) return;
    const definition = runtime.experience.definition;
    const index = definition.steps.findIndex((step) => step.id === runtime.currentStepId);
    if (index < 0) return;
    void this.post(runtime, "interaction", void 0, "guide_step_completed", this.currentStepPayload(runtime, true));
    if (index === definition.steps.length - 1) {
      void this.finish(runtime, "completed");
      return;
    }
    runtime.currentStepId = definition.steps[index + 1].id;
    this.persistGuide(runtime, "active");
    this.renderActiveGuide();
  }
  backGuide() {
    const runtime = this.activeGuide();
    if (!runtime) return;
    const definition = runtime.experience.definition;
    const index = definition.steps.findIndex((step) => step.id === runtime.currentStepId);
    if (index <= 0) return;
    runtime.currentStepId = definition.steps[index - 1].id;
    runtime.stepStartedAt = null;
    runtime.visibleStepId = null;
    this.persistGuide(runtime, "active");
    this.renderActiveGuide();
  }
  renderActiveGuide() {
    const runtime = this.activeGuide();
    if (!runtime) return;
    this.renderer.destroy();
    if (!this.currentGuideStepMatchesPage(runtime)) return;
    this.renderer.render(runtime.experience, this.callbacks(runtime), runtime.currentStepId);
  }
  stepVisible(runtime) {
    if (!runtime.currentStepId || runtime.visibleStepId === runtime.currentStepId) return;
    runtime.visibleStepId = runtime.currentStepId;
    runtime.stepStartedAt = performance.now();
    const definition = runtime.experience.definition;
    const stepIndex = definition.steps.findIndex((step) => step.id === runtime.currentStepId);
    void (runtime.shownPromise ?? Promise.resolve()).then(() => this.post(runtime, "interaction", void 0, "guide_step_shown", { stepId: runtime.currentStepId, stepIndex }));
  }
  currentStepPayload(runtime, includeDuration) {
    if (!runtime.currentStepId || !isGuideDefinition(runtime.experience.definition)) return void 0;
    const stepIndex = runtime.experience.definition.steps.findIndex((step) => step.id === runtime.currentStepId);
    const durationMs = includeDuration && runtime.stepStartedAt !== null ? Math.max(0, Math.round(performance.now() - runtime.stepStartedAt)) : void 0;
    return { stepId: runtime.currentStepId, stepIndex, ...durationMs !== void 0 ? { durationMs } : {} };
  }
  surveyStepIndex(runtime, stepId) {
    var _a;
    const definition = runtime.experience.definition;
    return !isGuideDefinition(definition) ? ((_a = definition.survey) == null ? void 0 : _a.steps.findIndex((step) => step.id === stepId)) ?? -1 : -1;
  }
  currentGuideStepMatchesPage(runtime) {
    var _a, _b;
    const step = this.currentGuideStep(runtime);
    const pagePath = step && guideStepRequiresTarget(step) ? (_b = (_a = step.target) == null ? void 0 : _a.targetContext) == null ? void 0 : _b.pagePath : void 0;
    return !pagePath || pagePath === currentPagePath();
  }
  pauseGuide() {
    const runtime = this.activeGuide();
    if (!runtime) return;
    this.renderer.destroy();
    this.active = null;
    this.pausedGuide = runtime;
    this.persistGuide(runtime, "paused");
  }
  async launch(experienceId, context) {
    var _a, _b;
    if (this.destroyed) return;
    try {
      const userId = this.session.getIdentifiedUserId();
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences/${encodeURIComponent(experienceId)}/launch`, { method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: location.href, anonymousId: this.session.getAnonymousId(), ...userId ? { trackedUserId: userId } : {}, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), timestamp: Date.now(), source: context.source, ...context.source === "checklist" ? { checklistExperienceId: context.checklistExperienceId, itemId: context.itemId } : {} }) });
      if (!response.ok || this.destroyed) {
        this.checklist.setTransientActive(false);
        return;
      }
      const experience = await response.json();
      if (!isGuideDefinition(experience.definition)) return;
      const first = experience.definition.steps[0];
      const targetPath = first && guideStepRequiresTarget(first) ? (_b = (_a = first.target) == null ? void 0 : _a.targetContext) == null ? void 0 : _b.pagePath : void 0;
      if (targetPath && targetPath !== currentPagePath()) {
        const destination = new URL(targetPath, location.origin);
        if (destination.origin !== location.origin) return;
        this.state.setGuideProgress({ experienceId: experience.id, versionId: experience.versionId, currentStepId: first.id, status: "paused", launchContext: experience.launchContext, navigationAttempted: true });
        this.checklist.setTransientActive(true);
        location.assign(destination.href);
        return;
      }
      if (this.active) {
        if (this.activeGuide()) this.pauseGuide();
        else {
          this.renderer.destroy();
          this.active = null;
        }
      }
      this.show(experience);
    } catch {
      this.checklist.setTransientActive(false);
    }
  }
  resumeGuide() {
    const runtime = this.pausedGuide;
    if (!runtime) return;
    this.pausedGuide = null;
    this.active = runtime;
    this.checklist.setTransientActive(true);
    this.persistGuide(runtime, "active");
    this.renderActiveGuide();
  }
  advanceForRoute(runtime) {
    var _a;
    const step = this.currentGuideStep(runtime);
    if (((_a = step == null ? void 0 : step.advance) == null ? void 0 : _a.type) !== "route" || !matchesRules(currentPagePath(), step.advance.pageRules)) return false;
    if (runtime === this.active) this.advanceGuide();
    else {
      const definition = runtime.experience.definition;
      const index = definition.steps.findIndex((item) => item.id === runtime.currentStepId);
      if (index >= 0 && index < definition.steps.length - 1) {
        runtime.currentStepId = definition.steps[index + 1].id;
        this.persistGuide(runtime, "paused");
      }
    }
    return true;
  }
  currentGuideStep(runtime) {
    if (!runtime || !isGuideDefinition(runtime.experience.definition)) return void 0;
    return runtime.experience.definition.steps.find((step) => step.id === runtime.currentStepId);
  }
  activeGuide() {
    const runtime = this.active;
    return (runtime == null ? void 0 : runtime.currentStepId) && isGuideDefinition(runtime.experience.definition) ? runtime : null;
  }
  persistGuide(runtime, status) {
    if (runtime.currentStepId) {
      const previous = this.state.getGuideProgress();
      this.state.setGuideProgress({ experienceId: runtime.experience.id, versionId: runtime.experience.versionId, currentStepId: runtime.currentStepId, status, ...runtime.impressionId ? { impressionId: runtime.impressionId } : {}, ...runtime.launchContext ? { launchContext: runtime.launchContext } : {}, ...(previous == null ? void 0 : previous.experienceId) === runtime.experience.id && previous.navigationAttempted ? { navigationAttempted: true } : {} });
    }
  }
  async post(runtime, event, action, eventType = "widget_interacted", detail) {
    const experience = runtime.experience;
    try {
      if (event !== "shown" && runtime.shownPromise) await runtime.shownPromise;
      const launchContext = runtime.launchContext ? runtime.launchContext.source === "checklist" ? { launchSource: "checklist", sourceExperienceId: runtime.launchContext.sourceExperienceId, sourceItemId: runtime.launchContext.sourceItemId } : { launchSource: "api" } : void 0;
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experience-events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ experienceId: experience.id, versionId: experience.versionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? void 0, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), impressionId: runtime.impressionId ?? void 0, event, eventType, timestamp: Date.now(), action, ...event === "shown" && launchContext ? { launchContext } : {}, ...detail }) });
      return response.ok && response.status !== 204 ? await response.json() : null;
    } catch {
      return null;
    }
  }
  async ensureSurveyResponse(runtime) {
    if (runtime.surveyResponseId) return runtime.surveyResponseId;
    if (runtime.surveyResponsePromise) return runtime.surveyResponsePromise;
    runtime.surveyResponsePromise = (async () => {
      if (!runtime.shownRequested) this.shown(runtime);
      await runtime.shownPromise;
      if (!runtime.impressionId) return null;
      try {
        const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify(this.surveyIdentity(runtime)) });
        if (!response.ok) return null;
        const body = await response.json();
        runtime.surveyResponseId = body.responseId ?? null;
        return runtime.surveyResponseId;
      } catch {
        return null;
      }
    })();
    const result = await runtime.surveyResponsePromise;
    runtime.surveyResponsePromise = null;
    return result;
  }
  async persistSurvey(runtime, answers, currentStepId, state) {
    const responseId = await this.ensureSurveyResponse(runtime);
    if (!responseId || !runtime.impressionId) return;
    runtime.surveyAnswers = { ...answers };
    try {
      await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses/${encodeURIComponent(responseId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ ...this.surveyIdentity(runtime), currentStepId, answers, ...state === "submitted" ? { submitted: true } : {}, ...state === "abandoned" ? { abandoned: true } : {} }) });
    } catch {
    }
  }
  surveyIdentity(runtime) {
    return { experienceId: runtime.experience.id, versionId: runtime.experience.versionId, impressionId: runtime.impressionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? void 0, sessionId: this.session.getSessionId() };
  }
}
function currentPagePath() {
  return `${location.pathname}${location.search}${location.hash}`;
}
function matchesRules(pagePath, rules) {
  const matches = (rule) => {
    if (rule.operator === "equals") return pagePath === rule.value;
    if (rule.operator === "starts_with") return pagePath.startsWith(rule.value);
    if (rule.operator === "ends_with") return pagePath.endsWith(rule.value);
    if (rule.operator === "contains") return pagePath.includes(rule.value);
    const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(pagePath);
  };
  const includes = rules.filter((rule) => rule.kind === "include");
  return includes.length > 0 && !rules.some((rule) => rule.kind === "exclude" && matches(rule)) && includes.some(matches);
}
const bundledRuntimeProviders = {
  experiences: {
    createLoader: (apiBase, siteId, session, trackEvent) => new ExperienceLoader(apiBase, siteId, session, trackEvent)
  },
  editor: {
    createController: (apiBase) => new EditorModeController(apiBase)
  }
};
class Analytics2 extends Analytics$1 {
  constructor() {
    super(bundledRuntimeProviders);
  }
}
let activeInstance = null;
function createAnalytics(config) {
  if (activeInstance) return activeInstance;
  const analytics = new Analytics2();
  analytics.init(config);
  installUnloadHandlers(analytics);
  activeInstance = analytics;
  const baseDestroy = analytics.destroy.bind(analytics);
  analytics.destroy = () => {
    if (activeInstance === analytics) activeInstance = null;
    baseDestroy();
  };
  return analytics;
}
export {
  Analytics2 as Analytics,
  createAnalytics
};
//# sourceMappingURL=sdk.esm.js.map
