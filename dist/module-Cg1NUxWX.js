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
const OVERRIDE_ATTR = "data-movcues-name";
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
const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];
const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;
const TAILWIND_UTILITY_PATTERN = /^(-?(m|p)[trblxy]?-|w-|h-|min-|max-|inset-|top-|right-|bottom-|left-|z-|order-|col-|row-|gap-|space-|grid-|flex-\d|flex$|inline-flex$|inline-block$|inline$|block$|hidden$|table|items-|justify-|content-|self-|place-|text-|font-|leading-|tracking-|whitespace-|break-|truncate$|bg-|from-|via-|to-|border|divide-|rounded|shadow|opacity-|blur-|brightness-|contrast-|grayscale|invert|saturate|sepia|backdrop-|transition|duration-|ease-|delay-|animate-|cursor-|select-|resize-|scroll-|snap-|touch-|pointer-events-|will-change-|appearance-|outline-|ring-|overflow-|overscroll-|absolute$|relative$|fixed$|sticky$|static$|visible$|invisible$|float-|clear-|isolate$|object-|aspect-|columns-|underline$|line-through$|no-underline$|uppercase$|lowercase$|capitalize$|normal-case$|italic$|not-italic$|antialiased$)/;
const TAILWIND_VARIANT_PREFIX_PATTERN = /^(sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover|focus-visible|first|last|odd|even):/;
function isTailwindUtilityClass(cls) {
  const unescaped = cls.replace(/\\/g, "");
  return TAILWIND_UTILITY_PATTERN.test(unescaped) || TAILWIND_VARIANT_PREFIX_PATTERN.test(unescaped);
}
function isStableClass(cls) {
  if (!cls) return false;
  if (DYNAMIC_CLASS_PATTERN.test(cls)) return false;
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
    for (const attr of STABLE_DATA_ATTRS) {
      const value = el.getAttribute(attr);
      if (value) {
        return `${el.tagName.toLowerCase()}[${attr}="${cssEscape$1(value)}"]`;
      }
    }
    for (const attr of SEMANTIC_ATTRS) {
      const rawValue = el.getAttribute(attr);
      if (!rawValue) continue;
      const value = attr === "href" ? canonicalizeHref(rawValue) : rawValue;
      if (!value) continue;
      if (value.length < 100) {
        return `${el.tagName.toLowerCase()}[${attr}="${cssEscape$1(value)}"]`;
      }
    }
    const classes = this.getClassList(el).filter(isStableClass);
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
  elementCrawler: false,
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
    if (!MVP1_POLICY.elementCrawler || this.discoveryInitialized || !this.config.autocapture.elementCrawler) return;
    this.discoveryInitialized = true;
    this.scheduleInitialCrawl();
  }
  /** Runs the first crawl once the DOM actually has content - a crawl fired before parsing finishes would just find nothing. */
  scheduleInitialCrawl() {
    if (typeof document === "undefined") return;
    if (document.readyState === "loading") {
      this.pendingInitialCrawl = () => {
        this.pendingInitialCrawl = null;
        if (MVP1_POLICY.elementCrawler && this.discoveryInitialized) this.elementCrawler.crawl();
      };
      document.addEventListener("DOMContentLoaded", this.pendingInitialCrawl, { once: true });
    } else {
      if (MVP1_POLICY.elementCrawler && this.discoveryInitialized) this.elementCrawler.crawl();
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
  /** Handles SPA routes; dormant discovery can only run when the release policy enables it. */
  onRouteChange(path, behavioralCaptureActive = true) {
    if (behavioralCaptureActive) {
      this.scroll.reset();
      this.funnel.onPageView(path);
    }
    if (MVP1_POLICY.elementCrawler && this.discoveryInitialized) this.elementCrawler.crawl();
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
      elementCrawler: MVP1_POLICY.elementCrawler && (((_g = input.autocapture) == null ? void 0 : _g.elementCrawler) ?? false)
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
    const liveToken = new URL(location.href).searchParams.get("__movcues_heatmap_capture");
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
      cleanUrl.searchParams.delete("__movcues_heatmap_capture");
      history.replaceState(history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      this.mountToolbar(token, capture);
    } catch {
    }
  }
  mountToolbar(token, capture) {
    const host = document.createElement("div");
    host.setAttribute("data-movcues-heatmap-toolbar", "");
    const root = host.attachShadow({ mode: "closed" });
    const wrap = document.createElement("div");
    wrap.innerHTML = `<style>:host{all:initial}.bar{position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;min-width:560px;padding:14px 16px;border-radius:12px;background:#111827;color:#fff;box-shadow:0 16px 50px #0007;font:13px/1.4 system-ui,sans-serif}.copy{flex:1}.title{font-weight:700}.sub{color:#cbd5e1;margin-top:2px}.actions{display:flex;gap:8px}button{border:0;border-radius:7px;padding:9px 14px;font:600 13px system-ui;cursor:pointer}.cancel{background:#374151;color:#fff}.capture{background:#7c3aed;color:#fff}.status{color:#d1fae5;font-weight:600}</style><div class="bar"><div class="copy"><div class="title">movcues · Heatmap capture</div><div class="sub"></div></div><div class="actions"><button class="cancel">Cancel</button><button class="capture">Capture</button></div></div>`;
    const sub = wrap.querySelector(".sub");
    sub.textContent = `${capture.pageName ?? "Page"} · ${capture.stateName ?? "Default"} · ${capitalize(capture.device ?? "desktop")} — Arrange this page exactly as you want it shown.`;
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
    if (window.__movcuesHeatmapCapture__) return Promise.resolve(window.__movcuesHeatmapCapture__);
    if (this.loadPromise) return this.loadPromise;
    const url = sdkBundleUrl("heatmap", this.bundleUrl);
    if (!url) return Promise.resolve(null);
    this.loadPromise = loadSdkBundle(url, () => window.__movcuesHeatmapCapture__, "heatmap snapshot");
    return this.loadPromise;
  }
}
function capitalize(value) {
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
const EDITOR_CONTINUATION_KEY = "__movcues_experience_editor_session__";
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
  return typeof state.experienceId === "string" && !!state.experienceId && (state.selectedStepId === void 0 || typeof state.selectedStepId === "string") && (state.mode === "select" || state.mode === "design" || state.mode === "target" || state.mode === "navigate" || state.mode === "preview");
}
const TRANSPARENT = /* @__PURE__ */ new Set(["transparent", "rgba(0, 0, 0, 0)", "rgba(0,0,0,0)"]);
function visible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}
function firstVisible(selectors) {
  return Array.from(document.querySelectorAll(selectors)).find(visible) ?? null;
}
function visibleElements(selectors) {
  return Array.from(document.querySelectorAll(selectors)).filter(visible);
}
function px(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
}
function weight(value, fallback) {
  if (value === "normal") return 400;
  if (value === "bold") return 700;
  return Math.min(900, Math.max(100, Math.round(px(value, fallback) / 100) * 100));
}
function lineHeight(value, fontSize, fallback) {
  if (value === "normal") return fallback;
  const parsed = px(value, 0);
  if (!parsed) return fallback;
  return Math.round((value.includes("px") ? parsed / fontSize : parsed) * 100) / 100;
}
function color(value, fallback) {
  return value && !TRANSPARENT.has(value) ? value : fallback;
}
function isOpaqueColor(value) {
  return Boolean(value) && !TRANSPARENT.has(value);
}
function recurringStyle(elements, read2, accept = (value) => Boolean(value)) {
  const grouped = /* @__PURE__ */ new Map();
  elements.forEach((element) => {
    const style = getComputedStyle(element);
    const value = read2(style).trim();
    if (!accept(value, style, element)) return;
    const current = grouped.get(value);
    grouped.set(value, current ? { ...current, count: current.count + 1 } : { element, count: 1 });
  });
  const best = [...grouped.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return best ? { value: best[0], ...best[1] } : null;
}
function shadow(value) {
  var _a;
  if (!value || value === "none") return { x: 0, y: 0, blur: 0, spread: 0, color: "rgba(0, 0, 0, 0)" };
  const lengths = [];
  const lengthPattern = /(-?\d+(?:\.\d+)?)px/g;
  let lengthMatch;
  while (lengths.length < 4 && (lengthMatch = lengthPattern.exec(value))) lengths.push(Number(lengthMatch[1]));
  const foundColor = ((_a = value.match(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}/i)) == null ? void 0 : _a[0]) ?? "rgba(0, 0, 0, 0.2)";
  return { x: lengths[0] ?? 0, y: lengths[1] ?? 0, blur: Math.max(0, lengths[2] ?? 0), spread: lengths[3] ?? 0, color: foundColor };
}
function cssVariables() {
  const result = {};
  const style = getComputedStyle(document.documentElement);
  for (let index = 0; index < style.length && Object.keys(result).length < 100; index += 1) {
    const name = style.item(index);
    if (!name.startsWith("--") || !/(color|font|radius|shadow|background|surface|border|primary|text|brand|accent|ink|muted|line|soft|canvas|panel)/i.test(name)) continue;
    const value = style.getPropertyValue(name).trim();
    if (value && value.length <= 300 && !/[{}]|url\s*\(|javascript\s*:/i.test(value)) result[name] = value;
  }
  return result;
}
function semanticVariable(variables, pattern) {
  var _a;
  return (_a = Object.entries(variables).find(([name, value]) => pattern.test(name) && isOpaqueColor(value))) == null ? void 0 : _a[1];
}
function hasVisibleBorder(style) {
  return style.borderTopStyle !== "none" && px(style.borderTopWidth, 0) > 0;
}
function readyForCapture() {
  const domReady = document.readyState === "loading" ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })) : Promise.resolve();
  return domReady.then(async () => {
    var _a;
    const fonts = (_a = document.fonts) == null ? void 0 : _a.ready;
    if (fonts) await Promise.race([fonts.catch(() => void 0), new Promise((resolve) => setTimeout(resolve, 1500))]);
  });
}
async function extractDesignTokens() {
  await readyForCapture();
  const body = visible(document.body) ? document.body : document.documentElement;
  const bodyStyle = getComputedStyle(body);
  const heading = firstVisible("h1,h2,h3,h4") ?? body;
  const headingStyle = getComputedStyle(heading);
  const variables = cssVariables();
  const actions = visibleElements("button,[role=button],a[href],input[type=button],input[type=submit]");
  const actionBackground = recurringStyle(actions, (style) => style.backgroundColor, (value) => isOpaqueColor(value));
  const action = (actionBackground == null ? void 0 : actionBackground.element) ?? null;
  const actionStyle = action ? getComputedStyle(action) : bodyStyle;
  const surfaces = visibleElements("dialog,[role=dialog],article,form,input,textarea,[class*=card],[class*=panel],[class*=surface]");
  const surfaceBackground = recurringStyle(surfaces, (style) => style.backgroundColor, (value) => isOpaqueColor(value));
  const surface = (surfaceBackground == null ? void 0 : surfaceBackground.element) ?? body;
  const surfaceStyle = getComputedStyle(surface);
  const muted = recurringStyle(visibleElements("p,small,[class*=muted],[class*=secondary],[class*=subtitle],[class*=description]"), (style) => style.color, (value) => isOpaqueColor(value) && value !== bodyStyle.color);
  const bordered = recurringStyle(surfaces, (style) => style.borderColor, (_value, style) => hasVisibleBorder(style));
  const shadowed = recurringStyle([...actions, ...surfaces], (style) => style.boxShadow, (value) => Boolean(value) && value !== "none");
  const bodySize = px(bodyStyle.fontSize, 16);
  const headingSize = px(headingStyle.fontSize, Math.max(20, bodySize * 1.5));
  const background = color(bodyStyle.backgroundColor, "#ffffff");
  const text = color(bodyStyle.color, "#111827");
  const primary = (actionBackground == null ? void 0 : actionBackground.value) ?? semanticVariable(variables, /(?:primary|brand|accent|action)/i) ?? color(actionStyle.color, "#2563eb");
  const primaryForeground = action ? color(actionStyle.color, "#ffffff") : semanticVariable(variables, /(?:primary|brand).*(?:foreground|contrast|on)/i) ?? "#ffffff";
  const surfaceColor = (surfaceBackground == null ? void 0 : surfaceBackground.value) ?? semanticVariable(variables, /(?:surface|card|panel|soft)/i) ?? background;
  const mutedText = (muted == null ? void 0 : muted.value) ?? semanticVariable(variables, /(?:muted|subtle|secondary).*(?:text|foreground)?|--muted$/i) ?? text;
  const border = (bordered == null ? void 0 : bordered.value) ?? semanticVariable(variables, /(?:border|line|divider)/i) ?? "rgba(15, 23, 42, 0.12)";
  const radius = px(actionStyle.borderRadius || surfaceStyle.borderRadius, 8);
  const capturedShadow = shadow((shadowed == null ? void 0 : shadowed.value) ?? surfaceStyle.boxShadow);
  const confidence = {
    "colors.background": bodyStyle.backgroundColor && !TRANSPARENT.has(bodyStyle.backgroundColor) ? 0.95 : 0.35,
    "colors.text": bodyStyle.color ? 0.95 : 0.35,
    "colors.primary": actionBackground ? Math.min(0.98, 0.7 + actionBackground.count * 0.08) : semanticVariable(variables, /(?:primary|brand|accent|action)/i) ? 0.7 : 0.35,
    "colors.mutedText": muted ? 0.85 : 0.5,
    "colors.border": bordered ? 0.85 : 0.5,
    "typography.bodyFontFamily": bodyStyle.fontFamily ? 0.95 : 0.35,
    "typography.headingFontFamily": heading !== body ? 0.9 : 0.5,
    "radii.md": action ? 0.75 : 0.4
  };
  return {
    tokens: {
      version: 1,
      colors: { background, surface: surfaceColor, text, mutedText, primary, primaryForeground, border },
      typography: { bodyFontFamily: bodyStyle.fontFamily || "system-ui, sans-serif", headingFontFamily: headingStyle.fontFamily || bodyStyle.fontFamily || "system-ui, sans-serif", bodyFontSize: bodySize, headingFontSize: headingSize, bodyFontWeight: weight(bodyStyle.fontWeight, 400), headingFontWeight: weight(headingStyle.fontWeight, 700), bodyLineHeight: lineHeight(bodyStyle.lineHeight, bodySize, 1.5), headingLineHeight: lineHeight(headingStyle.lineHeight, headingSize, 1.25) },
      radii: { sm: Math.max(0, Math.round(radius / 2)), md: radius, lg: Math.min(100, Math.round(radius * 2)) },
      shadows: { sm: capturedShadow, md: capturedShadow }
    },
    evidence: { confidence, cssVariables: variables, sdkVersion: "0.1.0" }
  };
}
async function processPendingSdkTasks(apiBase, siteId) {
  var _a, _b;
  if (!apiBase || !siteId || typeof fetch === "undefined") return;
  try {
    const configResponse = await fetch(
      `${apiBase}/public/config/${encodeURIComponent(siteId)}?sdkVerification=${Date.now()}`,
      { credentials: "omit", cache: "no-store" }
    );
    if (!configResponse.ok) return;
    const config = await configResponse.json();
    const verificationId = (_a = config.sdkVerification) == null ? void 0 : _a.id;
    if (typeof verificationId === "string" && verificationId) await fetch(`${apiBase}/public/sites/${encodeURIComponent(siteId)}/sdk-verifications/${encodeURIComponent(verificationId)}/ack`, { method: "POST", credentials: "omit", keepalive: true });
    const captureId = (_b = config.themeCapture) == null ? void 0 : _b.id;
    if (typeof captureId === "string" && captureId) {
      const payload = await extractDesignTokens();
      await fetch(`${apiBase}/public/sites/${encodeURIComponent(siteId)}/theme-captures/${encodeURIComponent(captureId)}`, { method: "POST", credentials: "omit", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
  } catch {
  }
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
    const editorToken = new URL(location.href).searchParams.get("movcues_editor_token");
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
    void processPendingSdkTasks(this.config.endpoint, this.config.siteId);
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
      const runtime = this.runtimeProviders.editor ?? (this.runtimeProviders.loadEditor ? await this.runtimeProviders.loadEditor() : await loadEditorRuntime(this.config.editorRuntimeBundleUrl));
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
        if (!MVP1_POLICY.elementCrawler) return;
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
function isChecklistDefinition(value) {
  return "items" in value;
}
class EligibilityEngine {
  choose(experiences) {
    return [...experiences].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
  }
}
const BUILDER_ALLOWED_TAGS = /* @__PURE__ */ new Set(["DIV", "SECTION", "HEADER", "H1", "H2", "H3", "H4", "P", "SPAN", "BR", "BUTTON", "IMG", "HR", "LABEL", "STRONG", "EM", "U", "A", "UL", "OL", "LI"]);
const BUILDER_SURVEY_INPUT_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA"]);
const BUILDER_ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "id", "title", "role", "aria-label", "aria-live", "aria-hidden", "aria-pressed", "aria-required", "alt", "src", "href", "target", "rel", "width", "height", "type", "placeholder", "maxlength", "data-movcues-action-id", "data-movcues-content", "data-movcues-widget-type", "data-movcues-document-version", "data-movcues-node-id", "data-movcues-block-id", "data-movcues-sizing", "data-movcues-responsive-stack", "data-movcues-question-id", "data-movcues-question-type", "data-movcues-question-input", "data-movcues-option-id", "data-movcues-survey-action", "data-movcues-survey-controls", "data-movcues-survey-progress", "data-movcues-survey-progress-bar", "data-movcues-survey-step-id", "data-movcues-checklist-role", "data-movcues-checklist-item-id", "data-movcues-checklist-item-role", "data-movcues-checklist-view"]);
const BUILDER_BLOCKED_TAGS = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|TEXTAREA|SELECT|VIDEO|AUDIO|SOURCE)$/i;
const BUILDER_UNSAFE_CSS = /@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding/i;
function builderImageUrlIsSafe(value) {
  return !value || !/[\u0000-\u0020\u007f]/.test(value) && /^(https?:\/\/|data:image\/(?:png|gif|jpeg|webp);base64,|\/)/i.test(value);
}
function builderLinkUrlIsSafe(value) {
  return !/[\u0000-\u001f\u007f]/.test(value) && /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i.test(value.trim());
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
    if (prelude.split(",").some((selector) => !selector.trim().includes(".movcues-widget"))) return null;
  }
  return css;
}
function mountBuilderContent(root, card, builder, callbacks, allowSurveyInputs = false) {
  const html = sanitizeBuilderHtml(builder.html, allowSurveyInputs);
  const css = safeBuilderCss(builder.css);
  if (!html || css === null) return false;
  let style = root.querySelector("style[data-movcues-builder-style]");
  if (!style) {
    style = document.createElement("style");
    style.dataset.movcuesBuilderStyle = "";
    root.appendChild(style);
  }
  style.textContent = `${css}
${ISOLATION_CSS}`;
  const content = document.createElement("div");
  content.className = "builder-content";
  content.dataset.movcuesBuilderSurface = "";
  content.append(...html);
  card.appendChild(content);
  card.classList.add("builder-card");
  card.addEventListener("click", (event) => {
    var _a, _b;
    const target = event.target instanceof Element ? event.target.closest("[data-movcues-action-id]") : null;
    if (!target || !card.contains(target)) return;
    const actionId = target.dataset.movcuesActionId;
    if (actionId === "primary") callbacks.onPrimary();
    else if (actionId === "secondary") callbacks.onSecondary();
    else {
      const action = findOnsiteAction(builder, actionId ?? "");
      if (action) (_b = callbacks.onActionId) == null ? void 0 : _b.call(callbacks, action, ((_a = target.textContent) == null ? void 0 : _a.trim()) ?? "");
    }
  });
  return true;
}
const ISOLATION_CSS = `[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;
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
    const action = element.getAttribute("data-movcues-action-id");
    if (action && action !== "primary" && action !== "secondary" && !/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(action)) element.removeAttribute("data-movcues-action-id");
    const surveyAction = element.getAttribute("data-movcues-survey-action");
    if (surveyAction && surveyAction !== "back" && surveyAction !== "next" && surveyAction !== "submit") element.removeAttribute("data-movcues-survey-action");
    if (element.tagName === "IMG") {
      const source = element.getAttribute("src") ?? "";
      if (!builderImageUrlIsSafe(source)) element.removeAttribute("src");
    }
    if (element.hasAttribute("src") && element.tagName !== "IMG") element.removeAttribute("src");
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!builderLinkUrlIsSafe(href)) element.removeAttribute("href");
      const target = element.getAttribute("target");
      if (target && target !== "_blank" && target !== "_self") element.removeAttribute("target");
      if (target === "_blank") element.setAttribute("rel", "noopener noreferrer");
    } else {
      element.removeAttribute("href");
      element.removeAttribute("target");
      element.removeAttribute("rel");
    }
    if (element.tagName === "INPUT") {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (!builderInputTypeIsSafe(type)) element.setAttribute("type", "text");
    }
  }
  const root = template.content.querySelector(".movcues-widget");
  if (!root) return null;
  for (const slot of ["primary", "secondary"]) {
    const actions = Array.from(template.content.querySelectorAll(`[data-movcues-action-id="${slot}"]`));
    actions.slice(1).forEach((action) => action.remove());
  }
  return Array.from(template.content.childNodes);
}
function findOnsiteAction(builder, id) {
  const movcues = builder.projectData.movcues;
  const bindings = movcues && typeof movcues === "object" ? movcues.actionBindings : null;
  const candidate = bindings && typeof bindings === "object" ? bindings[id] : null;
  if (!candidate || typeof candidate !== "object") return null;
  const action = candidate;
  if (action.id !== id || !["next_step", "previous_step", "dismiss", "open_url", "track_event"].includes(String(action.type))) return null;
  if (action.type === "open_url" && (typeof action.url !== "string" || !/^https?:\/\//i.test(action.url) || !builderLinkUrlIsSafe(action.url))) return null;
  if (action.type === "track_event" && (typeof action.eventName !== "string" || !action.eventName.trim() || action.eventName.length > 200)) return null;
  return action;
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
  const widget = content == null ? void 0 : content.querySelector(":scope > .movcues-widget");
  if (!content || !widget) return;
  const size = normalizeWidgetSize(widgetType, design);
  const fillsHeight = size.height.mode !== "auto";
  content.style.width = "100%";
  content.style.height = fillsHeight ? "100%" : "auto";
  widget.style.setProperty("box-sizing", "border-box");
  widget.style.setProperty("min-width", "0", "important");
  widget.style.setProperty("max-width", "100%", "important");
  widget.style.setProperty("height", fillsHeight ? "100%" : "auto", "important");
  widget.style.setProperty("max-height", fillsHeight ? "100%" : "none", "important");
}
function clamp$1(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}
const PANEL_NAMES = ["top", "right", "bottom", "left"];
const SCROLL_KEYS = /* @__PURE__ */ new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);
let scrollLockCount = 0;
let scrollLockCleanup = null;
class AnchoredTargetBackdrop {
  constructor(root, card, behavior, design, onDismiss) {
    this.panels = [];
    this.releaseScrollLock = lockDocumentScroll();
    const opacity = finiteClamp(behavior.backdropOpacity ?? 0.45, 0, 1);
    this.panels = PANEL_NAMES.map((name) => {
      const panel = document.createElement("div");
      panel.dataset.movcuesTargetBackdrop = name;
      panel.style.cssText = `position:fixed;box-sizing:border-box;background:rgba(0,0,0,${opacity});pointer-events:auto`;
      if (behavior.closeOnBackdrop && behavior.dismissible) panel.addEventListener("click", onDismiss);
      root.insertBefore(panel, card);
      return panel;
    });
    this.highlight = document.createElement("div");
    this.highlight.dataset.movcuesTargetHighlight = "";
    this.highlight.style.cssText = "position:fixed;box-sizing:border-box;border-radius:4px;pointer-events:none";
    this.highlight.style.outline = `2px solid ${design.theme.primary}`;
    root.insertBefore(this.highlight, card);
  }
  update(rect) {
    const viewportWidth = Math.max(0, innerWidth);
    const viewportHeight = Math.max(0, innerHeight);
    const left = finiteClamp(rect.left, 0, viewportWidth);
    const right = finiteClamp(rect.right, 0, viewportWidth);
    const top = finiteClamp(rect.top, 0, viewportHeight);
    const bottom = finiteClamp(rect.bottom, 0, viewportHeight);
    const middleHeight = Math.max(0, bottom - top);
    setRect(this.panels[0], 0, 0, viewportWidth, top);
    setRect(this.panels[1], right, top, Math.max(0, viewportWidth - right), middleHeight);
    setRect(this.panels[2], 0, bottom, viewportWidth, Math.max(0, viewportHeight - bottom));
    setRect(this.panels[3], 0, top, left, middleHeight);
    setRect(this.highlight, rect.left, rect.top, Math.max(0, rect.width), Math.max(0, rect.height));
  }
  setHidden(hidden) {
    var _a;
    if (hidden) {
      (_a = this.releaseScrollLock) == null ? void 0 : _a.call(this);
      this.releaseScrollLock = null;
    } else if (!this.releaseScrollLock) this.releaseScrollLock = lockDocumentScroll();
    const visibility = hidden ? "hidden" : "";
    this.panels.forEach((panel) => {
      panel.style.visibility = visibility;
    });
    this.highlight.style.visibility = visibility;
  }
  destroy() {
    var _a;
    (_a = this.releaseScrollLock) == null ? void 0 : _a.call(this);
    this.releaseScrollLock = null;
    this.panels.forEach((panel) => panel.remove());
    this.panels = [];
    this.highlight.remove();
  }
}
function lockDocumentScroll() {
  var _a;
  scrollLockCount += 1;
  if (scrollLockCount === 1) {
    const rootStyle = captureProperty(document.documentElement.style, "overflow");
    const bodyStyle = document.body ? captureProperty(document.body.style, "overflow") : null;
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    (_a = document.body) == null ? void 0 : _a.style.setProperty("overflow", "hidden", "important");
    const preventScroll = (event) => {
      const delta = event instanceof WheelEvent ? event.deltaY : 0;
      if (event.composedPath().some((node) => node instanceof HTMLElement && node !== document.body && node !== document.documentElement && /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight && (!delta || (delta > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight : node.scrollTop > 0)))) return;
      if (event.cancelable) event.preventDefault();
    };
    const preventScrollKey = (event) => {
      if (!SCROLL_KEYS.has(event.key) || event.composedPath().some(isEditableControl)) return;
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener("wheel", preventScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", preventScroll, { capture: true, passive: false });
    document.addEventListener("keydown", preventScrollKey, true);
    scrollLockCleanup = () => {
      document.removeEventListener("wheel", preventScroll, true);
      document.removeEventListener("touchmove", preventScroll, true);
      document.removeEventListener("keydown", preventScrollKey, true);
      restoreProperty(document.documentElement.style, "overflow", rootStyle);
      if (bodyStyle && document.body) restoreProperty(document.body.style, "overflow", bodyStyle);
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      scrollLockCleanup == null ? void 0 : scrollLockCleanup();
      scrollLockCleanup = null;
    }
  };
}
function isEditableControl(target) {
  return target instanceof Element && Boolean(target.closest("input,textarea,select,button,[contenteditable]:not([contenteditable='false'])"));
}
function captureProperty(style, property2) {
  return { value: style.getPropertyValue(property2), priority: style.getPropertyPriority(property2) };
}
function restoreProperty(style, property2, captured) {
  if (captured.value) style.setProperty(property2, captured.value, captured.priority);
  else style.removeProperty(property2);
}
function setRect(element, left, top, width, height) {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
}
function finiteClamp(value, minimum, maximum) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(value, maximum)) : minimum;
}
function findTarget(target) {
  if (!target) return null;
  for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
    try {
      const matches2 = document.querySelectorAll(selector);
      if (matches2.length === 1) return matches2[0];
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
  var _a, _b;
  const card = document.createElement("section");
  card.className = "card";
  card.style.setProperty("--movcues-bg", design.theme.background);
  card.style.setProperty("--movcues-fg", design.theme.foreground);
  card.style.setProperty("--movcues-primary", design.theme.primary);
  if (design.theme.spacing !== void 0) card.style.setProperty("--movcues-theme-spacing", `${design.theme.spacing}px`);
  const theme = design.theme.siteTheme;
  if (theme) {
    card.style.setProperty("--movcues-surface", theme.colors.surface);
    card.style.setProperty("--movcues-muted", theme.colors.mutedText);
    card.style.setProperty("--movcues-border", theme.colors.border);
    card.style.setProperty("--movcues-primary-fg", theme.colors.primaryForeground);
    card.style.setProperty("--movcues-font-body", theme.typography.bodyFontFamily);
    card.style.setProperty("--movcues-font-heading", theme.typography.headingFontFamily);
    card.style.setProperty("--movcues-font-body-size", `${theme.typography.bodyFontSize}px`);
    card.style.setProperty("--movcues-font-heading-size", `${theme.typography.headingFontSize}px`);
    card.style.setProperty("--movcues-theme-radius", `${theme.radii.lg}px`);
    card.style.setProperty("--movcues-button-radius", `${theme.radii.md}px`);
    const shadow2 = theme.shadows.md;
    card.style.setProperty("--movcues-theme-shadow", `${shadow2.x}px ${shadow2.y}px ${shadow2.blur}px ${shadow2.spread}px ${shadow2.color}`);
  }
  card.dataset.width = design.width;
  card.dataset.radius = design.theme.borderRadius;
  if (widgetType) applyWidgetSizeEnvelope(card, widgetType, design);
  const mountedBuilder = Boolean(builder && mountBuilderContent(root, card, builder, callbacks, widgetType === "survey"));
  if (mountedBuilder && widgetType) applyBuilderSizeContent(card, widgetType, design);
  if (!mountedBuilder) {
    const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText(content.primaryAction.label)}</button>` : "";
    const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText(content.secondaryAction.label)}</button>` : "";
    card.insertAdjacentHTML("beforeend", `<div class="legacy-content"><h2>${escapeText(content.heading)}</h2><p>${escapeText(content.body)}</p><footer>${secondary}${primary}</footer></div>`);
    (_a = card.querySelector("[data-primary]")) == null ? void 0 : _a.addEventListener("click", callbacks.onPrimary);
    (_b = card.querySelector("[data-secondary]")) == null ? void 0 : _b.addEventListener("click", callbacks.onSecondary);
  }
  if (behavior.dismissible) mountRuntimeDismissControl(card, callbacks.onDismiss);
  root.appendChild(card);
  if (mountedBuilder && widgetType) fitBuilderWidthEnvelope(card);
  if (mountedBuilder && widgetType === "anchored_card") fitAnchoredBuilderEnvelope(card);
  return card;
}
function mountRuntimeDismissControl(card, onDismiss) {
  const chrome = document.createElement("div");
  chrome.className = "movcues-runtime-chrome";
  chrome.dataset.movcuesRuntimeChrome = "dismiss";
  chrome.style.setProperty("position", "absolute", "important");
  chrome.style.setProperty("inset", "0", "important");
  chrome.style.setProperty("z-index", "2", "important");
  chrome.style.setProperty("pointer-events", "none", "important");
  const chromeRoot = chrome.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `:host{all:initial;color:inherit}button{position:absolute;top:7px;right:8px;display:block;box-sizing:border-box;flex:none;margin:0;border:0;border-radius:7px;padding:3px 7px;background:transparent;color:inherit;font:20px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;pointer-events:auto}`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "movcues-runtime-close";
  close.dataset.dismiss = "";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", onDismiss);
  chromeRoot.append(style, close);
  card.appendChild(chrome);
}
function fitAnchoredBuilderEnvelope(card) {
  const widget = card.querySelector(".builder-content > .movcues-widget");
  if (!widget) return;
  const cardRect = card.getBoundingClientRect();
  const widgetRect = widget.getBoundingClientRect();
  if (widgetRect.width > 0 && cardRect.width - widgetRect.width > 0.5) card.style.width = `${Math.ceil(widgetRect.width)}px`;
  if (widgetRect.height > 0 && cardRect.height - widgetRect.height > 0.5) card.style.height = `${Math.ceil(widgetRect.height)}px`;
}
function fitBuilderWidthEnvelope(card) {
  const widget = card.querySelector(".builder-content > .movcues-widget");
  if (!widget) return;
  const widgetRect = widget.getBoundingClientRect();
  if (widgetRect.width <= 0) return;
  card.style.width = `${Math.ceil(widgetRect.width)}px`;
  card.style.minWidth = "0";
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
    const backdrop = behavior.backdrop ? new AnchoredTargetBackdrop(root, card, behavior, design, callbacks.onDismiss) : null;
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
      backdrop == null ? void 0 : backdrop.setHidden(next);
    };
    const update = () => {
      if (destroyed) return;
      if (!target.isConnected) {
        setHidden(true);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setHidden(true);
        return;
      }
      backdrop == null ? void 0 : backdrop.update(rect);
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
      },
      () => backdrop == null ? void 0 : backdrop.destroy()
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
  pointer.className = "movcues-anchor-pointer";
  pointer.setAttribute("aria-hidden", "true");
  pointer.style.setProperty("--movcues-pointer-size", `${size}px`);
  pointer.style.color = pointerColor(card, design);
  pointer.innerHTML = '<svg viewBox="0 0 10 10" focusable="false" aria-hidden="true"><path d="M5 0 10 10H0Z" fill="currentColor"/></svg>';
  card.prepend(pointer);
  return pointer;
}
function pointerColor(card, design) {
  const widget = card.querySelector(".movcues-widget");
  if (!widget) return design.theme.background;
  const background = getComputedStyle(widget).backgroundColor.trim();
  return isTransparent(background) ? design.theme.background : background;
}
function isTransparent(color2) {
  return !color2 || color2.toLowerCase() === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color2);
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
function escapeText(value) {
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
      backdrop.style.setProperty("--movcues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.45));
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
      backdrop.style.setProperty("--movcues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.35));
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
    beacon.style.setProperty("--movcues-hotspot", behavior.hotspotColor ?? design.theme.primary);
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
function nextSurveyStep(survey, index, answers) {
  var _a, _b;
  const step = survey.steps[index];
  if (!step) return null;
  const rule = (_a = step.branching) == null ? void 0 : _a.rules.find((rule2) => matches(rule2, answers[rule2.questionId]));
  const destination = (rule == null ? void 0 : rule.nextStepId) ?? ((_b = step.branching) == null ? void 0 : _b.defaultNextStepId);
  if (destination === "submit") return null;
  const next = destination ? survey.steps.findIndex((step2) => step2.id === destination) : index + 1;
  return next > index && next < survey.steps.length ? next : null;
}
function surveyPath(survey, answers) {
  const path = [];
  let index = survey.steps.length ? 0 : null;
  while (index !== null && path.length < survey.steps.length) {
    path.push(index);
    index = nextSurveyStep(survey, index, answers);
  }
  return path;
}
function answersOnSurveyPath(survey, answers) {
  const ids = new Set(surveyPath(survey, answers).flatMap((index) => survey.steps[index].questions.map((question) => question.id)));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
}
function surveyBranchErrors(survey) {
  const errors = [];
  survey.steps.forEach((step, index) => {
    if (!step.branching) return;
    const forward = (id) => id === void 0 || id === "submit" || survey.steps.findIndex((step2) => step2.id === id) > index;
    if (!forward(step.branching.defaultNextStepId)) errors.push("Survey navigation must target a later step or Submit.");
    if (!Array.isArray(step.branching.rules) || step.branching.rules.length > 10) {
      errors.push("A Survey step supports at most 10 branch rules.");
      return;
    }
    for (const rule of step.branching.rules) {
      const question = step.questions.find((question2) => question2.id === rule.questionId);
      if (!question || !forward(rule.nextStepId) || !rule.nextStepId) {
        errors.push("A branch must use a question on its own step and a forward destination.");
        continue;
      }
      if (rule.operator === "answered") {
        if (rule.value !== void 0) errors.push("Answered conditions do not use a comparison value.");
        continue;
      }
      const choice = question.type === "single_choice" || question.type === "multiple_choice";
      const numeric = question.type === "rating" || question.type === "nps";
      if (rule.operator === "includes") {
        if (question.type !== "multiple_choice" || typeof rule.value !== "string" || !question.options.some((option) => option.id === rule.value)) errors.push("Includes needs an existing multiple-choice option.");
      } else if (rule.operator === "gte" || rule.operator === "lte") {
        if (!numeric || typeof rule.value !== "number" || !Number.isInteger(rule.value) || rule.value < (question.type === "nps" ? 0 : question.min) || rule.value > (question.type === "nps" ? 10 : question.max)) errors.push("Numeric conditions need a value in the question range.");
      } else if (rule.operator === "equals" || rule.operator === "not_equals") {
        if (question.type === "multiple_choice" || (numeric ? typeof rule.value !== "number" || !Number.isInteger(rule.value) || rule.value < (question.type === "nps" ? 0 : question.min) || rule.value > (question.type === "nps" ? 10 : question.max) : typeof rule.value !== "string") || choice && !question.options.some((option) => option.id === rule.value)) errors.push("Comparison value must match the question type and options.");
      } else errors.push("Unsupported Survey branch operator.");
    }
  });
  return errors;
}
function matches(rule, answer) {
  if (rule.operator === "answered") return answer !== void 0 && answer !== "" && (!Array.isArray(answer) || answer.length > 0);
  if (rule.operator === "equals") return answer === rule.value;
  if (rule.operator === "not_equals") return answer !== void 0 && answer !== rule.value;
  if (rule.operator === "includes") return Array.isArray(answer) && typeof rule.value === "string" && answer.includes(rule.value);
  if (rule.operator === "gte") return typeof answer === "number" && typeof rule.value === "number" && answer >= rule.value;
  if (rule.operator === "lte") return typeof answer === "number" && typeof rule.value === "number" && answer <= rule.value;
  return false;
}
class SurveyRenderer {
  constructor() {
    this.modal = new ModalRenderer();
    this.stepIndex = 0;
    this.answers = {};
    this.root = null;
    this.busy = false;
    this.completed = false;
    this.generation = 0;
    this.retry = null;
    this.dismiss = () => {
      if (!this.busy) void this.run(async () => {
        await this.callbacks.onDismiss();
      });
    };
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
    this.generation++;
    this.completed = false;
    this.answers = {};
    this.busy = false;
    this.retry = null;
    const card = this.renderStep();
    if (callbacks.onLoad) void this.run(async (isCurrent) => {
      const saved = await callbacks.onLoad();
      if (!isCurrent()) return;
      this.answers = saved.answers;
      const index = survey.steps.findIndex((step) => step.id === saved.currentStepId);
      if (index >= 0) this.stepIndex = index;
      if (!saved.closed) this.renderStep();
    });
    return card;
  }
  renderStep() {
    var _a, _b, _c, _d;
    const root = this.root;
    const step = this.survey.steps[this.stepIndex];
    (_b = (_a = this.callbacks).onStepChange) == null ? void 0 : _b.call(_a, step.id);
    const baseStyle = root.firstElementChild;
    Array.from(root.children).forEach((element) => {
      if (element !== baseStyle) element.remove();
    });
    const content = { heading: step.content.heading || this.content.heading, body: step.content.body || this.content.body };
    const stepDesign = step.size ? { ...this.design, size: step.size } : this.design;
    const card = this.modal.render(root, content, stepDesign, this.behavior, { onDismiss: this.dismiss, onPrimary: this.dismiss, onSecondary: this.dismiss }, step.builder, "survey");
    let surface = card.querySelector(".movcues-widget");
    if (!surface) {
      (_c = card.querySelector(".legacy-content")) == null ? void 0 : _c.remove();
      surface = document.createElement("section");
      surface.className = "movcues-widget movcues-widget--survey";
      card.appendChild(surface);
    }
    surface.dataset.movcuesSurveyStepId = step.id;
    this.syncQuestions(surface, step.questions);
    if (!surface.querySelector(".movcues-survey-validation")) {
      const status = document.createElement("p");
      status.className = "movcues-survey-validation";
      surface.append(status);
    }
    (_d = surface.querySelector(".movcues-survey-validation")) == null ? void 0 : _d.setAttribute("role", "alert");
    this.syncNavigation(surface);
    return card;
  }
  syncQuestions(surface, questions) {
    const ids = new Set(questions.map((question) => question.id));
    surface.querySelectorAll("[data-movcues-question-id]").forEach((node) => {
      if (!ids.has(node.dataset.movcuesQuestionId ?? "")) node.remove();
    });
    let navigation = surface.querySelector("[data-movcues-survey-action]");
    while (navigation && navigation.parentElement !== surface) navigation = navigation.parentElement;
    for (const question of questions) {
      const matches2 = Array.from(surface.querySelectorAll(`[data-movcues-question-id="${cssEscape(question.id)}"]`));
      matches2.slice(1).forEach((node2) => node2.remove());
      const node = matches2[0] ?? createQuestionNode(question);
      if (!matches2[0]) surface.insertBefore(node, navigation);
      node.dataset.movcuesQuestionType = question.type;
      node.classList.add("movcues-survey-question", `movcues-survey-question--${question.type}`);
      this.bindQuestion(node, question);
      navigation = navigation ?? node.nextElementSibling;
    }
  }
  bindQuestion(node, question) {
    var _a;
    node.classList.remove("has-error");
    if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "rating" || question.type === "nps") {
      const allowed = question.type === "rating" ? range(question.min, question.max).map(String) : question.type === "nps" ? range(0, 10).map(String) : question.options.map((option) => option.id);
      let controls = Array.from(node.querySelectorAll("[data-movcues-option-id]"));
      if (!controls.length) {
        const holder = document.createElement("div");
        holder.className = "movcues-survey-options";
        for (const value of allowed) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "movcues-survey-option";
          button.dataset.movcuesOptionId = value;
          button.textContent = question.type === "single_choice" || question.type === "multiple_choice" ? ((_a = question.options.find((option) => option.id === value)) == null ? void 0 : _a.label) ?? value : value;
          holder.appendChild(button);
        }
        node.appendChild(holder);
        controls = Array.from(holder.children);
      }
      controls.forEach((control) => {
        const optionId = control.dataset.movcuesOptionId;
        control.setAttribute("role", "button");
        const update = () => {
          const answer = this.answers[question.id];
          const selected = Array.isArray(answer) ? answer.includes(optionId) : String(answer ?? "") === optionId;
          control.classList.toggle("is-selected", selected);
          control.setAttribute("aria-pressed", String(selected));
        };
        update();
        control.onclick = () => {
          var _a2, _b;
          if (!allowed.includes(optionId)) return;
          if (question.type === "multiple_choice") {
            const current = Array.isArray(this.answers[question.id]) ? this.answers[question.id] : [];
            this.answers[question.id] = current.includes(optionId) ? current.filter((value) => value !== optionId) : [...current, optionId];
          } else this.answers[question.id] = question.type === "rating" || question.type === "nps" ? Number(optionId) : optionId;
          (_b = (_a2 = this.callbacks).onAnswersChange) == null ? void 0 : _b.call(_a2, { ...this.answers });
          node.classList.remove("has-error");
          this.syncNavigation(this.root.querySelector(".movcues-widget"));
          controls.forEach((item) => {
            const value = item.dataset.movcuesOptionId;
            const answer = this.answers[question.id];
            const selected = Array.isArray(answer) ? answer.includes(value) : String(answer) === value;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-pressed", String(selected));
          });
        };
      });
      return;
    }
    let input = node.querySelector("[data-movcues-question-input]");
    if (!input) {
      input = question.type === "long_text" ? document.createElement("textarea") : document.createElement("input");
      input.dataset.movcuesQuestionInput = "";
      input.className = "movcues-survey-input";
      node.appendChild(input);
    }
    input.value = typeof this.answers[question.id] === "string" ? this.answers[question.id] : "";
    input.placeholder = question.placeholder ?? "";
    if (question.maxLength) input.maxLength = question.maxLength;
    input.oninput = () => {
      var _a2, _b;
      this.answers[question.id] = input.value.slice(0, question.maxLength ?? 1e4);
      node.classList.remove("has-error");
      (_b = (_a2 = this.callbacks).onAnswersChange) == null ? void 0 : _b.call(_a2, { ...this.answers });
      this.syncNavigation(this.root.querySelector(".movcues-widget"));
    };
  }
  syncNavigation(surface) {
    const nextIndex = nextSurveyStep(this.survey, this.stepIndex, this.answers);
    const final = nextIndex === null;
    const path = surveyPath(this.survey, this.answers), previousIndex = path[path.indexOf(this.stepIndex) - 1];
    const step = this.survey.steps[this.stepIndex];
    const buttons = Array.from(surface.querySelectorAll("[data-movcues-survey-action]"));
    const back = buttons.filter((button) => button.dataset.movcuesSurveyAction === "back");
    const next = buttons.filter((button) => button.dataset.movcuesSurveyAction === "next");
    const submit = buttons.filter((button) => button.dataset.movcuesSurveyAction === "submit");
    const legacyControls = Boolean(surface.querySelector("[data-movcues-survey-controls]"));
    for (const button of back) {
      button.hidden = !this.survey.allowBack || previousIndex === void 0;
      button.onclick = () => {
        if (this.busy || this.completed || !this.survey.allowBack || previousIndex === void 0) return;
        void this.run(async (isCurrent) => {
          await this.callbacks.onProgress({ ...this.answers }, step.id, "back", this.survey.steps[previousIndex].id);
          if (!isCurrent()) return;
          this.stepIndex = previousIndex;
          this.renderStep();
        });
      };
    }
    for (const button of next) {
      button.hidden = final;
      button.onclick = () => {
        if (this.busy || this.completed || nextIndex === null || !this.validateStep()) return;
        void this.run(async (isCurrent) => {
          this.answers = answersOnSurveyPath(this.survey, this.answers);
          await this.callbacks.onProgress({ ...this.answers }, step.id, "next", this.survey.steps[nextIndex].id);
          if (!isCurrent()) return;
          this.stepIndex = nextIndex;
          this.renderStep();
        });
      };
    }
    for (const button of submit) {
      button.hidden = !final;
      if (legacyControls) button.textContent = this.survey.submitLabel;
      button.onclick = () => {
        if (this.busy || this.completed || !this.validateAll()) return;
        void this.run(async (isCurrent) => {
          this.answers = answersOnSurveyPath(this.survey, this.answers);
          await this.callbacks.onSubmit({ ...this.answers }, step.id);
          if (isCurrent()) this.completed = true;
        });
      };
    }
    this.syncProgress(surface);
  }
  async run(operation) {
    var _a;
    if (this.busy || !this.root) return;
    const generation = this.generation;
    this.busy = true;
    this.retry = operation;
    this.setBusy(true);
    (_a = this.root.querySelector("[data-movcues-survey-retry]")) == null ? void 0 : _a.remove();
    try {
      await operation(() => generation === this.generation && Boolean(this.root));
      if (generation === this.generation) this.retry = null;
    } catch {
      if (generation !== this.generation || !this.root) return;
      const status = this.root.querySelector(".movcues-survey-validation");
      if (status) {
        status.textContent = "Couldn't save your answers. They are still here. Try again.";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.dataset.movcuesSurveyRetry = "";
        retry.textContent = "Retry";
        retry.onclick = () => {
          if (this.retry) void this.run(this.retry);
        };
        status.append(" ", retry);
      }
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.setBusy(false);
      }
    }
  }
  setBusy(value) {
    var _a;
    (_a = this.root) == null ? void 0 : _a.querySelectorAll("[data-movcues-survey-action],[data-movcues-option-id],[data-movcues-question-input]").forEach((control) => {
      control.disabled = value || this.completed;
    });
  }
  syncProgress(surface) {
    const progress = surface.querySelector("[data-movcues-survey-progress]");
    if (progress) progress.hidden = !this.survey.showProgress;
    const progressLabel = progress == null ? void 0 : progress.querySelector("span:not([data-movcues-survey-progress-bar])");
    if (progressLabel && !progressLabel.querySelector("[data-movcues-survey-progress-bar]")) progressLabel.textContent = `Step ${surveyPath(this.survey, this.answers).indexOf(this.stepIndex) + 1} of ${surveyPath(this.survey, this.answers).length}`;
    const bar = surface.querySelector("[data-movcues-survey-progress-bar]");
    if (bar) bar.style.width = `${(surveyPath(this.survey, this.answers).indexOf(this.stepIndex) + 1) / surveyPath(this.survey, this.answers).length * 100}%`;
  }
  validateStep() {
    return this.validateQuestions(this.survey.steps[this.stepIndex].questions);
  }
  validateAll() {
    let valid = true;
    let currentValid = true;
    for (const index of surveyPath(this.survey, this.answers)) {
      const step = this.survey.steps[index];
      const stepValid = this.validateQuestions(step.questions, step === this.survey.steps[this.stepIndex]);
      if (step === this.survey.steps[this.stepIndex]) currentValid = stepValid;
      if (!stepValid) valid = false;
    }
    if (!valid && currentValid && this.root) {
      const status = this.root.querySelector(".movcues-survey-validation");
      if (status) status.textContent = "Please go back and answer all required questions before submitting.";
    }
    return valid;
  }
  validateQuestions(questions, show = true) {
    const missing = questions.filter((question) => question.required && isEmpty(this.answers[question.id]));
    if (show && this.root) {
      missing.forEach((question) => {
        var _a;
        return (_a = this.root.querySelector(`[data-movcues-question-id="${cssEscape(question.id)}"]`)) == null ? void 0 : _a.classList.add("has-error");
      });
      const status = this.root.querySelector(".movcues-survey-validation");
      if (status) status.textContent = missing.length ? "Please answer the required questions before continuing." : "";
    }
    return missing.length === 0;
  }
  destroy() {
    this.generation++;
    this.modal.destroy();
    this.root = null;
    this.retry = null;
  }
}
function createQuestionNode(question) {
  const node = document.createElement("div");
  node.dataset.movcuesQuestionId = question.id;
  const label = document.createElement("p");
  label.className = "movcues-survey-question__label";
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
        if (host.dataset.movcuesLayerFallback !== resolution.fallback) host.dataset.movcuesLayerFallback = resolution.fallback;
      } else if (host.dataset.movcuesLayerFallback) delete host.dataset.movcuesLayerFallback;
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
      const matches2 = document.querySelectorAll(selector);
      if (matches2.length === 1) return matches2[0];
    } catch {
    }
  }
  return null;
}
function bounded(value) {
  return Math.max(-2147483648, Math.min(2147483647, value));
}
function guideInteractionTarget(step) {
  var _a, _b;
  return ((_a = step.advance) == null ? void 0 : _a.type) === "element_click" || ((_b = step.advance) == null ? void 0 : _b.type) === "element_hover" ? step.advance.target ?? step.target : void 0;
}
function matchesGuideRoute(path, rules) {
  const match = (rule) => {
    if (rule.operator === "equals") return path === rule.value;
    if (rule.operator === "starts_with") return path.startsWith(rule.value);
    if (rule.operator === "ends_with") return path.endsWith(rule.value);
    if (rule.operator === "contains") return path.includes(rule.value);
    const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try {
      return new RegExp(`^${escaped}$`).test(path);
    } catch {
      return false;
    }
  };
  return rules.some((rule) => rule.kind === "include" && match(rule)) && !rules.some((rule) => rule.kind === "exclude" && match(rule));
}
function guideStepConfigurationErrors(step, index) {
  var _a, _b, _c;
  const errors = [];
  const add = (message) => errors.push(`Step ${index + 1}: ${message}`);
  const bounded2 = (value, min, max) => value === void 0 || Number.isInteger(value) && value >= min && value <= max;
  if (!bounded2((_a = step.presentation) == null ? void 0 : _a.delayMs, 0, 3e4)) add("Presentation delay must be 0–30,000 ms.");
  if (((_b = step.presentation) == null ? void 0 : _b.missingTarget) && (!bounded2(step.presentation.missingTarget.timeoutMs, 100, 6e4) || !["wait", "skip", "dismiss"].includes(step.presentation.missingTarget.action))) add("Choose a missing-target action and a timeout of 100–60,000 ms.");
  if (((_c = step.presentation) == null ? void 0 : _c.missingTarget) && !guideStepRequiresTarget(step)) add("Missing-target behavior requires an Anchored Card step.");
  const advance = step.advance;
  if (!advance) return errors;
  if ((advance.type === "element_click" || advance.type === "element_hover") && !guideStepRequiresTarget(step)) add("Website click and hover triggers require an Anchored Card step.");
  if (advance.type === "element_hover" && !bounded2(advance.durationMs, 100, 6e4)) add("Hover duration must be 100–60,000 ms.");
  if (advance.type === "custom_event" && (!advance.eventName.trim() || advance.eventName.length > 200 || /[\u0000-\u001f\u007f]/.test(advance.eventName))) add("Enter an event name of 1–200 characters without control characters.");
  if (advance.type === "route" && (!advance.pageRules.length || !advance.pageRules.some((rule) => rule.kind === "include") || advance.pageRules.some((rule) => !rule.value.trim() || rule.value.length > 500))) add("Enter at least one valid matching page rule.");
  return errors;
}
class ExperienceRenderer {
  constructor() {
    this.host = null;
    this.renderer = null;
    this.cancelPendingTarget = null;
    this.cleanupAdvance = null;
    this.appliedLayer = null;
    this.layerManager = new LayerManager();
    this.guideTimer = 0;
    this.visibleFrame = 0;
    this.renderGeneration = 0;
  }
  render(experience, callbacks, guideStepId) {
    this.destroy();
    if (experience.kind === "checklist") return false;
    if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks, guideStepId);
    return this.renderWidget(experience, experience.definition, callbacks, guideStepId);
  }
  root(experienceId, behavior, targetElement) {
    this.host = document.createElement("div");
    this.host.dataset.movcuesExperience = experienceId;
    this.host.dataset.movcuesExperienceRoot = experienceId;
    this.host.style.cssText = "position:fixed;inset:0;pointer-events:none";
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);
    document.documentElement.appendChild(this.host);
    this.applyLayer(behavior, targetElement);
    return root;
  }
  applyLayer(behavior, targetElement) {
    var _a;
    if (!this.host) return;
    (_a = this.appliedLayer) == null ? void 0 : _a.destroy();
    this.appliedLayer = this.layerManager.apply(this.host, { layer: behavior.layer, legacyZIndex: behavior.zIndex, targetElement });
  }
  renderWidget(experience, definition, callbacks, requestedStepId) {
    var _a;
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
        var _a2;
        this.cancelPendingTarget = null;
        (_a2 = callbacks.onUnavailable) == null ? void 0 : _a2.call(callbacks);
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
      const selectedStep = definition.survey.steps.find((step) => step.id === requestedStepId) ?? definition.survey.steps[0];
      const root = this.root(experience.id, { ...definition.behavior, layer: ((_a = selectedStep == null ? void 0 : selectedStep.behavior) == null ? void 0 : _a.layer) ?? definition.behavior.layer });
      const renderer = new SurveyRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, definition.survey, { onDismiss: () => callbacks.onDismiss(), onLoad: callbacks.onSurveyLoad, onAnswersChange: callbacks.onSurveyAnswersChange, onProgress: (answers, stepId, direction, destinationStepId) => {
        var _a2;
        return (_a2 = callbacks.onSurveyProgress) == null ? void 0 : _a2.call(callbacks, answers, stepId, direction, destinationStepId);
      }, onSubmit: (answers, stepId) => {
        var _a2;
        return (_a2 = callbacks.onSurveySubmit) == null ? void 0 : _a2.call(callbacks, answers, stepId);
      }, onStepChange: (stepId) => {
        var _a2;
        const step = definition.survey.steps.find((item) => item.id === stepId);
        this.applyLayer({ ...definition.behavior, layer: ((_a2 = step == null ? void 0 : step.behavior) == null ? void 0 : _a2.layer) ?? definition.behavior.layer });
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
    var _a, _b;
    const stepIndex = guideStepId ? definition.steps.findIndex((item) => item.id === guideStepId) : 0;
    const step = definition.steps[stepIndex];
    if (!step) return false;
    const generation = this.renderGeneration;
    let finished = false;
    const alive = () => generation === this.renderGeneration && !finished;
    const once = (run2) => {
      if (!alive()) return;
      finished = true;
      run2();
    };
    const advance = () => once(() => {
      var _a2;
      return (_a2 = callbacks.onGuideAdvance) == null ? void 0 : _a2.call(callbacks);
    });
    const back = () => once(() => {
      var _a2;
      return (_a2 = callbacks.onGuideBack) == null ? void 0 : _a2.call(callbacks);
    });
    const dismiss = () => {
      if (generation !== this.renderGeneration) return;
      finished = true;
      callbacks.onDismiss();
      this.destroy();
    };
    const guarded = { ...callbacks, onGuideAdvance: advance, onGuideBack: back, onDismiss: dismiss };
    const stepDesign = step.size ? { ...definition.design, size: step.size } : definition.design;
    const stepCallbacks = {
      onDismiss: dismiss,
      onSecondary: dismiss,
      onPrimary: () => {
        var _a2;
        if (!alive()) return;
        const action = step.content.primaryAction;
        if (action) callbacks.onAction(action);
        if ((((_a2 = step.advance) == null ? void 0 : _a2.type) ?? "button") === "button") advance();
      },
      onActionId: (action, label) => {
        if (generation === this.renderGeneration && (!finished || !["next_step", "previous_step"].includes(action.type))) this.dispatchBuilderAction(action, label, guarded);
      }
    };
    const visible2 = () => {
      var _a2;
      if (!alive()) return;
      (_a2 = callbacks.onGuideStatus) == null ? void 0 : _a2.call(callbacks, "ready");
      this.visibleFrame = requestAnimationFrame(() => {
        this.visibleFrame = 0;
        if (alive()) callbacks.onVisible();
      });
    };
    const addBack = (card) => {
      var _a2;
      if (stepIndex === 0) return;
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = "Back";
      button.addEventListener("click", back);
      (_a2 = card.querySelector("footer")) == null ? void 0 : _a2.prepend(button);
    };
    const run = () => {
      var _a2, _b2;
      if (!alive()) return;
      this.guideTimer = 0;
      if (getGuideStepPattern(step) === "modal") {
        const root = this.root(experience.id, { layer: step.behavior.layer ?? ((_a2 = definition.behavior) == null ? void 0 : _a2.layer) });
        const renderer = new ModalRenderer();
        this.renderer = renderer;
        const card = renderer.render(root, step.content, stepDesign, { dismissible: step.behavior.dismissible ?? true }, stepCallbacks, step.builder);
        addBack(card);
        visible2();
        return;
      }
      const missing = (_b2 = step.presentation) == null ? void 0 : _b2.missingTarget;
      const timeout = Math.max(100, Math.min(6e4, (missing == null ? void 0 : missing.timeoutMs) ?? 5e3));
      const deadline = Date.now() + timeout;
      const unavailable = () => {
        var _a3, _b3;
        if (!alive()) return;
        (_a3 = callbacks.onGuideStatus) == null ? void 0 : _a3.call(callbacks, "unavailable");
        if ((missing == null ? void 0 : missing.action) === "skip") advance();
        else if ((missing == null ? void 0 : missing.action) === "dismiss") dismiss();
        else (_b3 = callbacks.onUnavailable) == null ? void 0 : _b3.call(callbacks);
      };
      const resolve = (spec, found) => {
        var _a3;
        if (!alive()) return;
        const target = findTarget(spec);
        if (target) {
          found(target);
          return;
        }
        (_a3 = callbacks.onGuideStatus) == null ? void 0 : _a3.call(callbacks, "waiting");
        this.cancelPendingTarget = waitForTarget(spec, (element) => {
          this.cancelPendingTarget = null;
          if (alive()) found(element);
        }, () => {
          this.cancelPendingTarget = null;
          unavailable();
        }, Math.max(0, deadline - Date.now()));
      };
      resolve(step.target, (target) => {
        const mount = (interaction2) => {
          var _a3, _b3, _c;
          if (!alive()) return;
          ensureGuideTargetInView(target);
          const root = this.root(experience.id, { layer: step.behavior.layer ?? ((_a3 = definition.behavior) == null ? void 0 : _a3.layer) }, target);
          const renderer = new AnchoredCardRenderer();
          this.renderer = renderer;
          const behavior = { ...step.behavior, dismissible: step.behavior.dismissible ?? true };
          const card = renderer.render(root, target, step.content, stepDesign, behavior, stepCallbacks, step.builder, "anchored_card");
          addBack(card);
          if (interaction2) this.listenForAdvance(interaction2, ((_b3 = step.advance) == null ? void 0 : _b3.type) ?? "button", ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover" ? step.advance.durationMs : void 0, advance);
          visible2();
        };
        const interaction = guideInteractionTarget(step);
        if (interaction && interaction !== step.target) resolve(interaction, mount);
        else mount(interaction ? target : void 0);
      });
    };
    const delay = Math.max(0, Math.min(3e4, ((_a = step.presentation) == null ? void 0 : _a.delayMs) ?? 0));
    if (delay) {
      (_b = callbacks.onGuideStatus) == null ? void 0 : _b.call(callbacks, "delay");
      this.guideTimer = window.setTimeout(run, delay);
    } else run();
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
      },
      onActionId: (action, label) => this.dispatchBuilderAction(action, label, callbacks)
    };
  }
  dispatchBuilderAction(action, label, callbacks) {
    var _a, _b;
    const runtimeAction = { ...action, label };
    if (action.type === "next_step") {
      callbacks.onAction(runtimeAction);
      (_a = callbacks.onGuideAdvance) == null ? void 0 : _a.call(callbacks);
    } else if (action.type === "previous_step") {
      callbacks.onAction(runtimeAction);
      (_b = callbacks.onGuideBack) == null ? void 0 : _b.call(callbacks);
    } else {
      callbacks.onAction(runtimeAction);
      if (action.type === "dismiss") {
        callbacks.onDismiss();
        this.destroy();
      }
    }
  }
  clearSurface() {
    var _a, _b, _c, _d, _e;
    this.renderGeneration++;
    clearTimeout(this.guideTimer);
    this.guideTimer = 0;
    cancelAnimationFrame(this.visibleFrame);
    this.visibleFrame = 0;
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
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--movcues-bg);color:var(--movcues-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  .builder-card{padding:0;background:transparent;border:0;box-shadow:none}.builder-content{box-sizing:border-box;width:100%;max-width:100%;overflow:visible}
  .movcues-anchor-pointer{position:absolute;width:var(--movcues-pointer-size);height:var(--movcues-pointer-size);pointer-events:none;z-index:0}.movcues-anchor-pointer svg{display:block;width:100%;height:100%;overflow:visible}.movcues-anchor-pointer[data-placement=bottom]{top:calc(-1 * var(--movcues-pointer-size));transform:translateX(-50%)}.movcues-anchor-pointer[data-placement=top]{bottom:calc(-1 * var(--movcues-pointer-size));transform:translateX(-50%) rotate(180deg)}.movcues-anchor-pointer[data-placement=right]{left:calc(-1 * var(--movcues-pointer-size));transform:translateY(-50%) rotate(-90deg)}.movcues-anchor-pointer[data-placement=left]{right:calc(-1 * var(--movcues-pointer-size));transform:translateY(-50%) rotate(90deg)}.builder-content,.legacy-content{position:relative;z-index:1}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--movcues-primary);color:#fff}.secondary{background:transparent;color:inherit}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
  .backdrop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,var(--movcues-backdrop-opacity,.45))}
  .modal{left:50%;top:50%;transform:translate(-50%,-50%)}.modal[data-layout=fullscreen],.modal[data-size-width=full]{inset:12px;width:auto!important;max-width:none!important;transform:none;display:flex;flex-direction:column;justify-content:center}.modal[data-layout=fullscreen] footer,.modal[data-size-width=full] footer{justify-content:center}
  .slideout[data-position=top-left]{top:16px;left:16px}.slideout[data-position=top-right]{top:16px;right:16px}.slideout[data-position=bottom-left]{bottom:16px;left:16px}.slideout[data-position=bottom-right]{bottom:16px;right:16px}.slideout[data-position=center-left]{left:16px;top:50%;transform:translateY(-50%)}.slideout[data-position=center-right]{right:16px;top:50%;transform:translateY(-50%)}
  .banner{left:0;right:0;width:auto!important;max-width:none;border-radius:0!important;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center}.banner[data-position=top]{top:0}.banner[data-position=bottom]{bottom:0}.banner h2,.banner p{grid-column:1}.banner footer{grid-column:2;grid-row:1/span 2;margin:0;padding-right:24px}
  .hotspot{pointer-events:auto;position:fixed;width:18px;height:18px;padding:0;border:3px solid #fff;border-radius:50%;background:var(--movcues-hotspot);box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font:700 12px/12px ui-sans-serif,system-ui,sans-serif}.hotspot[data-style=pulse]::after{content:"";position:absolute;inset:-7px;border:2px solid var(--movcues-hotspot);border-radius:50%;animation:movcues-pulse 1.8s ease-out infinite}.hotspot[data-style=dot]{width:14px;height:14px}.hotspot[data-style=question]{width:22px;height:22px}@keyframes movcues-pulse{0%{transform:scale(.65);opacity:.85}100%{transform:scale(1.45);opacity:0}}@media(prefers-reduced-motion:reduce){.hotspot::after{animation:none}}
  .movcues-survey-question.has-error{outline:2px solid #fecaca;outline-offset:6px;border-radius:6px}.movcues-survey-validation{color:#b91c1c}:where(.movcues-survey-option.is-selected){border-color:var(--movcues-primary);background:color-mix(in srgb,var(--movcues-primary) 12%,white)}.movcues-survey-input{font:inherit}
`;
const ONCE_KEY = "__movcues_experiences_seen__";
const SESSION_KEY = "__movcues_experiences_session_seen__";
const GUIDE_KEY = "__movcues_active_guide__";
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
    this.host.dataset.movcuesChecklist = checklist.id;
    const side = checklist.definition.behavior.position === "bottom-left" ? "left:16px" : "right:16px";
    this.host.style.cssText = `position:fixed;bottom:16px;${side};z-index:${ALWAYS_ON_TOP_Z_INDEX};pointer-events:auto`;
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial}.surface{position:relative;pointer-events:auto}.surface>.movcues-widget{position:relative!important;inset:auto!important}${css}`;
    root.appendChild(style);
    const surface = document.createElement("div");
    surface.className = "surface";
    surface.append(...nodes);
    root.appendChild(surface);
    const authoredRoot = surface.querySelector('[data-movcues-checklist-role="root"]');
    if (!authoredRoot || surface.querySelectorAll('[data-movcues-checklist-role="root"]').length !== 1) {
      this.destroy();
      return false;
    }
    const design = checklist.definition.design, theme = design == null ? void 0 : design.theme.siteTheme;
    if (design) {
      authoredRoot.style.setProperty("--movcues-bg", design.theme.background);
      authoredRoot.style.setProperty("--movcues-fg", design.theme.foreground);
      authoredRoot.style.setProperty("--movcues-primary", design.theme.primary);
      if (design.theme.spacing !== void 0) authoredRoot.style.setProperty("--movcues-theme-spacing", `${design.theme.spacing}px`);
    }
    if (theme) {
      const shadow2 = theme.shadows.md;
      authoredRoot.style.setProperty("--movcues-surface", theme.colors.surface);
      authoredRoot.style.setProperty("--movcues-muted", theme.colors.mutedText);
      authoredRoot.style.setProperty("--movcues-border", theme.colors.border);
      authoredRoot.style.setProperty("--movcues-primary-fg", theme.colors.primaryForeground);
      authoredRoot.style.setProperty("--movcues-font-body", theme.typography.bodyFontFamily);
      authoredRoot.style.setProperty("--movcues-font-heading", theme.typography.headingFontFamily);
      authoredRoot.style.setProperty("--movcues-theme-radius", `${theme.radii.lg}px`);
      authoredRoot.style.setProperty("--movcues-button-radius", `${theme.radii.md}px`);
      authoredRoot.style.setProperty("--movcues-theme-shadow", `${shadow2.x}px ${shadow2.y}px ${shadow2.blur}px ${shadow2.spread}px ${shadow2.color}`);
    }
    const requiredRoles = ["title", "description", "progress", "items", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge"];
    const requiredViews = ["expanded", "launcher", "completion"];
    if (requiredRoles.some((role) => authoredRoot.querySelectorAll(`[data-movcues-checklist-role="${role}"]`).length !== 1) || requiredViews.some((view2) => authoredRoot.querySelectorAll(`[data-movcues-checklist-view="${view2}"]`).length !== 1)) {
      this.destroy();
      return false;
    }
    const itemElements = /* @__PURE__ */ new Map();
    for (const element of Array.from(authoredRoot.querySelectorAll("[data-movcues-checklist-item-id]"))) {
      const id = element.dataset.movcuesChecklistItemId;
      if (!id || itemElements.has(id) || element.querySelectorAll('[data-movcues-checklist-item-role="state"]').length !== 1 || element.querySelectorAll('[data-movcues-checklist-item-role="title"]').length !== 1 || element.querySelectorAll('[data-movcues-checklist-item-role="description"]').length !== 1) {
        this.destroy();
        return false;
      }
      itemElements.set(id, element);
    }
    if (checklist.definition.items.some((item) => !itemElements.has(item.id)) || itemElements.size !== checklist.definition.items.length) {
      this.destroy();
      return false;
    }
    const cellDocument = authoredRoot.dataset.movcuesDocumentVersion === "4";
    setText(authoredRoot, "title", checklist.definition.title);
    setText(authoredRoot, "description", checklist.definition.description ?? "");
    if (!cellDocument) setText(authoredRoot, "launcher-label", checklist.definition.title);
    setText(authoredRoot, "completion-title", checklist.definition.completionMessage.title);
    setText(authoredRoot, "completion-description", checklist.definition.completionMessage.description ?? "");
    setText(authoredRoot, "completion-acknowledge", checklist.definition.completionMessage.acknowledgeLabel);
    authoredRoot.querySelectorAll('[data-movcues-checklist-role="dismiss"]').forEach((element) => {
      element.hidden = !checklist.definition.behavior.dismissible;
    });
    const completed = new Set(checklist.progress.completedItemIds);
    const remaining = checklist.definition.items.length - completed.size;
    authoredRoot.style.setProperty("--movcues-checklist-progress", `${checklist.definition.items.length ? completed.size / checklist.definition.items.length * 100 : 0}%`);
    setText(authoredRoot, "progress", `${completed.size} of ${checklist.definition.items.length} complete`);
    setText(authoredRoot, "remaining-count", checklist.definition.behavior.showRemainingCount ? String(remaining) : "");
    const container = authoredRoot.querySelector('[data-movcues-checklist-role="items"]');
    if (!container) {
      this.destroy();
      return false;
    }
    checklist.definition.items.forEach((item, index) => {
      var _a;
      const element = itemElements.get(item.id);
      if (!cellDocument) container.appendChild(element);
      const state = ((_a = checklist.progress.items[index]) == null ? void 0 : _a.state) ?? "locked";
      element.dataset.state = state;
      element.setAttribute("aria-disabled", state === "locked" ? "true" : "false");
      setText(element, "title", item.title, true);
      setText(element, "description", item.description ?? "", true);
    });
    const view = checklist.progress.complete ? "completion" : forceLauncher || checklist.progress.collapsed ? "launcher" : "expanded";
    authoredRoot.querySelectorAll("[data-movcues-checklist-view]").forEach((element) => element.classList.toggle("is-active", element.dataset.movcuesChecklistView === view));
    authoredRoot.addEventListener("click", (event) => {
      var _a;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const item = target.closest("[data-movcues-checklist-item-id]");
      if (item && item.dataset.state !== "locked") {
        callbacks.onItemClick(item.dataset.movcuesChecklistItemId);
        return;
      }
      const role = (_a = target.closest("[data-movcues-checklist-role]")) == null ? void 0 : _a.dataset.movcuesChecklistRole;
      if (role === "launcher-label" || target.closest('[data-movcues-checklist-view="launcher"]')) callbacks.onOpen();
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
  const attribute = itemRole ? "data-movcues-checklist-item-role" : "data-movcues-checklist-role";
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
    this.lastRoute = location.href;
    this.deliveryEpoch = 0;
    this.finishing = /* @__PURE__ */ new Set();
    this.checklist = new ChecklistManager(apiBase, siteId, session, (id, context) => this.launch(id, context));
  }
  async evaluate(trigger) {
    var _a, _b;
    if (this.destroyed) return;
    const epoch = this.deliveryEpoch;
    try {
      const manifest = await this.fetchExperiences(trigger);
      if (this.destroyed || epoch !== this.deliveryEpoch) return;
      this.hasChecklistCandidates = manifest.hasChecklists;
      this.checklist.setChecklist(manifest.checklists[0] ?? null);
      const experiences = manifest.experiences;
      const candidates = [...experiences, ...this.queued ? [this.queued] : []].filter((item, index, all) => {
        var _a2;
        return item.id !== ((_a2 = this.active) == null ? void 0 : _a2.experience.id) && item.id !== this.justFinishedId && !this.finishing.has(item.id) && all.findIndex((candidate) => candidate.id === item.id) === index;
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
    if (this.lastRoute === location.href) return;
    this.lastRoute = location.href;
    const activeGuide = this.activeGuide();
    if (activeGuide) {
      const advanced = activeGuide.stepEntryRoute !== location.href && this.advanceForRoute(activeGuide);
      if (!advanced) {
        this.persistGuide(activeGuide, "active");
        this.renderActiveGuide();
      } else if (!this.active) return;
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
      if (activeGuide.readyStepId === activeGuide.currentStepId && ((_a = step == null ? void 0 : step.advance) == null ? void 0 : _a.type) === "custom_event" && step.advance.eventName === name) {
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
    const ids = (value) => new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string").slice(0, 20) : []);
    const runtime = { experience, currentStepId, impressionId, shownRequested: Boolean(impressionId || (progress == null ? void 0 : progress.shownRequested)), shownPromise: null, surveyResponseId: null, surveyResponsePromise: null, surveyResume: null, surveyAnswers: {}, stepStartedAt: null, visibleStepId: null, readyStepId: null, seenStepIds: ids(progress == null ? void 0 : progress.seenStepIds), completedStepIds: ids(progress == null ? void 0 : progress.completedStepIds), finished: false, stepEntryRoute: location.href, launchContext: (progress == null ? void 0 : progress.launchContext) ?? experience.launchContext };
    this.active = runtime;
    this.checklist.setTransientActive(true);
    if (currentStepId) this.persistGuide(runtime, "active");
    const mounted = currentStepId ? progress && (!progress.routePath || progress.routePath !== currentPagePath()) && this.advanceForRoute(runtime) ? true : (this.renderActiveGuide(), true) : this.renderer.render(experience, this.callbacks(runtime), currentStepId);
    if (!mounted && this.active === runtime) {
      this.active = null;
      this.checklist.setTransientActive(false);
      if (currentStepId) this.state.clearGuideProgress(experience.id);
    }
  }
  callbacks(runtime) {
    const stepId = runtime.currentStepId;
    const valid = () => this.active === runtime && !runtime.finished && runtime.currentStepId === stepId;
    return {
      onVisible: () => {
        if (!valid()) return;
        runtime.readyStepId = stepId ?? null;
        this.shown(runtime);
        this.stepVisible(runtime);
      },
      onDismiss: () => {
        if (valid()) return this.finish(runtime, "dismissed");
      },
      onAction: (action) => {
        if (valid()) this.handleAction(runtime, action);
      },
      onComplete: () => {
        if (valid()) void this.finish(runtime, "completed");
      },
      onGuideAdvance: () => {
        if (valid()) this.advanceGuide();
      },
      onGuideBack: () => {
        if (valid()) this.backGuide();
      },
      onUnavailable: () => {
        if (!valid()) return;
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
      onSurveyLoad: async () => {
        const saved = await this.ensureSurveyResponse(runtime);
        if (saved.closed) await this.finish(runtime, "completed", true);
        return saved;
      },
      onSurveyAnswersChange: (answers) => {
        runtime.surveyAnswers = answers;
      },
      onSurveyProgress: async (answers, stepId2, direction, destinationStepId) => {
        await this.persistSurvey(runtime, answers, destinationStepId ?? stepId2);
        if (direction === "next" && !runtime.completedStepIds.has(stepId2)) {
          runtime.completedStepIds.add(stepId2);
          await this.post(runtime, "interaction", void 0, "survey_step_completed", { stepId: stepId2, stepIndex: this.surveyStepIndex(runtime, stepId2) });
        }
      },
      onSurveySubmit: async (answers, stepId2) => {
        await this.persistSurvey(runtime, answers, stepId2, "submitted");
        await this.finish(runtime, "completed", true);
      }
    };
  }
  shown(runtime) {
    if (runtime.shownRequested) return;
    runtime.shownRequested = true;
    this.persistGuide(runtime, "active");
    this.state.markSeen(runtime.experience.id);
    runtime.shownPromise = this.post(runtime, "shown", void 0, "experience_shown").then((result) => {
      runtime.impressionId = (result == null ? void 0 : result.impressionId) ?? null;
      if (!runtime.impressionId && runtime.experience.widgetType === "survey") runtime.shownRequested = false;
      if (this.active === runtime) this.persistGuide(runtime, "active");
      else if (this.pausedGuide === runtime) this.persistGuide(runtime, "paused");
    });
  }
  handleAction(runtime, action) {
    var _a;
    if (!isGuideDefinition(runtime.experience.definition) || action.id) void this.recordAction(runtime, action.type);
    if (action.type === "open_url" && action.url) window.location.assign(action.url);
    if (action.type === "track_event" && action.eventName) (_a = this.trackEvent) == null ? void 0 : _a.call(this, action.eventName);
  }
  async recordAction(runtime, action) {
    await runtime.shownPromise;
    await this.post(runtime, "action", action, "widget_interacted");
  }
  async finish(runtime, event, surveyAlreadyPersisted = false) {
    if (runtime.finished) return;
    if (runtime.experience.widgetType === "survey" && event === "dismissed" && !surveyAlreadyPersisted) await this.persistSurvey(runtime, runtime.surveyAnswers, null, "abandoned");
    if (runtime.finished) return;
    runtime.finished = true;
    this.deliveryEpoch++;
    this.finishing.add(runtime.experience.id);
    this.justFinishedId = runtime.experience.id;
    if (this.active === runtime) {
      this.renderer.destroy();
      this.active = null;
    }
    if (runtime.currentStepId) this.state.clearGuideProgress(runtime.experience.id);
    await runtime.shownPromise;
    const guide = isGuideDefinition(runtime.experience.definition);
    const eventType = guide ? event === "completed" ? "guide_completed" : "guide_dismissed" : runtime.experience.widgetType === "survey" ? event === "completed" ? "survey_submitted" : "survey_abandoned" : event === "dismissed" ? "widget_dismissed" : "widget_interacted";
    await this.post(runtime, event, void 0, eventType, guide ? this.currentStepPayload(runtime, event === "dismissed") : void 0);
    this.justFinishedId = runtime.experience.id;
    this.finishing.delete(runtime.experience.id);
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
    if (!runtime.completedStepIds.has(runtime.currentStepId) && runtime.visibleStepId === runtime.currentStepId) {
      runtime.completedStepIds.add(runtime.currentStepId);
      void this.post(runtime, "interaction", void 0, "guide_step_completed", this.currentStepPayload(runtime, true));
    }
    if (index === definition.steps.length - 1) {
      void this.finish(runtime, "completed");
      return;
    }
    runtime.currentStepId = definition.steps[index + 1].id;
    runtime.stepEntryRoute = location.href;
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
    runtime.stepEntryRoute = location.href;
    runtime.stepStartedAt = null;
    runtime.visibleStepId = null;
    this.persistGuide(runtime, "active");
    this.renderActiveGuide();
  }
  renderActiveGuide() {
    const runtime = this.activeGuide();
    if (!runtime) return;
    this.renderer.destroy();
    runtime.readyStepId = null;
    if (!this.currentGuideStepMatchesPage(runtime)) return;
    this.renderer.render(runtime.experience, this.callbacks(runtime), runtime.currentStepId);
  }
  stepVisible(runtime) {
    if (!runtime.currentStepId || runtime.visibleStepId === runtime.currentStepId) return;
    runtime.visibleStepId = runtime.currentStepId;
    runtime.stepStartedAt = performance.now();
    if (runtime.seenStepIds.has(runtime.currentStepId)) return;
    runtime.seenStepIds.add(runtime.currentStepId);
    this.persistGuide(runtime, "active");
    const definition = runtime.experience.definition;
    const stepIndex = definition.steps.findIndex((step) => step.id === runtime.currentStepId);
    const stepId = runtime.currentStepId;
    void (runtime.shownPromise ?? Promise.resolve()).then(() => this.post(runtime, "interaction", void 0, "guide_step_shown", { stepId, stepIndex }));
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
    if (((_a = step == null ? void 0 : step.advance) == null ? void 0 : _a.type) !== "route" || !matchesGuideRoute(currentPagePath(), step.advance.pageRules)) return false;
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
      this.state.setGuideProgress({ experienceId: runtime.experience.id, versionId: runtime.experience.versionId, currentStepId: runtime.currentStepId, status, shownRequested: runtime.shownRequested, seenStepIds: [...runtime.seenStepIds], completedStepIds: [...runtime.completedStepIds], routePath: currentPagePath(), ...runtime.impressionId ? { impressionId: runtime.impressionId } : {}, ...runtime.launchContext ? { launchContext: runtime.launchContext } : {}, ...(previous == null ? void 0 : previous.experienceId) === runtime.experience.id && previous.navigationAttempted ? { navigationAttempted: true } : {} });
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
    if (runtime.surveyResponseId && runtime.surveyResume) return runtime.surveyResume;
    if (runtime.surveyResponsePromise) return runtime.surveyResponsePromise;
    runtime.surveyResponsePromise = (async () => {
      if (!runtime.shownRequested) this.shown(runtime);
      await runtime.shownPromise;
      if (!runtime.impressionId) throw new Error("Survey could not be started. Please retry.");
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify(this.surveyIdentity(runtime)) });
      if (!response.ok) throw new Error("Survey could not be started. Please retry.");
      const body = await response.json();
      if (!body.responseId) throw new Error("Survey response was not created. Please retry.");
      runtime.surveyResponseId = body.responseId;
      runtime.surveyAnswers = body.answers ?? {};
      runtime.surveyResume = { answers: runtime.surveyAnswers, currentStepId: body.currentStepId, closed: Boolean(body.submittedAt) };
      if (response.status === 201) await this.post(runtime, "interaction", void 0, "survey_started");
      return runtime.surveyResume;
    })();
    try {
      return await runtime.surveyResponsePromise;
    } finally {
      runtime.surveyResponsePromise = null;
    }
  }
  async persistSurvey(runtime, answers, currentStepId, state) {
    runtime.surveyAnswers = { ...answers };
    await this.ensureSurveyResponse(runtime);
    const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses/${encodeURIComponent(runtime.surveyResponseId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ ...this.surveyIdentity(runtime), currentStepId, answers, ...state === "submitted" ? { submitted: true } : {}, ...state === "abandoned" ? { abandoned: true } : {} }) });
    if (!response.ok) throw new Error("Couldn't save your answers. Please retry.");
  }
  surveyIdentity(runtime) {
    return { experienceId: runtime.experience.id, versionId: runtime.experience.versionId, impressionId: runtime.impressionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? void 0, sessionId: this.session.getSessionId() };
  }
}
function currentPagePath() {
  return `${location.pathname}${location.search}${location.hash}`;
}
const bundledRuntimeProviders = {
  experiences: {
    createLoader: (apiBase, siteId, session, trackEvent) => new ExperienceLoader(apiBase, siteId, session, trackEvent)
  },
  loadEditor: async () => {
    const { EditorModeController } = await import("./EditorModeController-2k0QHjkP.js");
    return { createController: (apiBase) => new EditorModeController(apiBase) };
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
  Analytics2 as A,
  ChecklistRenderer as C,
  ExperienceRenderer as E,
  RouteObserver as R,
  builderLinkUrlIsSafe as a,
  builderImageUrlIsSafe as b,
  computeElementRole as c,
  computeElementLabel as d,
  sanitizeBuilderHtml as e,
  guideStepRequiresTarget as f,
  getGuideStepPattern as g,
  guideStepConfigurationErrors as h,
  clearEditorContinuation as i,
  isChecklistDefinition as j,
  isGuideDefinition as k,
  guideInteractionTarget as l,
  matchesGuideRoute as m,
  findTarget as n,
  storeEditorContinuation as o,
  createAnalytics as p,
  surveyBranchErrors as s
};
//# sourceMappingURL=module-Cg1NUxWX.js.map
