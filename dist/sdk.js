(function() {
  "use strict";
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
  const OVERRIDE_ATTR = "data-loopz-name";
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
        return `${el.tagName.toLowerCase()}#${cssEscape(id)}`;
      }
      for (const attr of STABLE_DATA_ATTRS) {
        const value = el.getAttribute(attr);
        if (value) {
          return `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
        }
      }
      for (const attr of SEMANTIC_ATTRS) {
        const rawValue = el.getAttribute(attr);
        if (!rawValue) continue;
        const value = attr === "href" ? canonicalizeHref(rawValue) : rawValue;
        if (!value) continue;
        if (value.length < 100) {
          return `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
        }
      }
      const classes = this.getClassList(el).filter(isStableClass);
      if (classes.length > 0) {
        return `${el.tagName.toLowerCase()}.${classes.map(cssEscape).join(".")}`;
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
        return document.querySelectorAll(`#${cssEscape(id)}`).length === 1;
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
  function cssEscape(value) {
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
  function clamp(value, min, max) {
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
      const scrollPercent = clamp(Math.round(scrollTop / scrollable * 100), 0, 100);
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
  const currentScriptUrl = typeof document !== "undefined" && document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : null;
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
      if (!this.config.enabled) return;
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
      const url = this.config.bundleUrl ?? deriveReplayBundleUrl(currentScriptUrl);
      if (!url) {
        console.warn(
          "[Analytics] sessionReplay.enabled is true but the replay bundle URL could not be determined automatically. Set sessionReplay.bundleUrl explicitly."
        );
        return Promise.resolve(null);
      }
      this.loadPromise = new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onload = () => resolve(w.__aaRRWebRecord__ ?? null);
        script.onerror = () => {
          console.warn(`[Analytics] failed to load session replay bundle from ${url}`);
          resolve(null);
        };
        document.head.appendChild(script);
      });
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
  function deriveReplayBundleUrl(scriptUrl) {
    if (!scriptUrl) return null;
    if (scriptUrl.includes("sdk.min.js")) return scriptUrl.replace("sdk.min.js", "sdk-replay.min.js");
    if (scriptUrl.includes("sdk.js")) return scriptUrl.replace("sdk.js", "sdk-replay.js");
    return null;
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
      if (ac.move) this.move.start();
      if (ac.rageClick && ac.click) this.rageClick.start();
      if (ac.hover) this.hover.start();
      if (ac.cursor) this.cursor.start();
      if (this.config.sessionReplay.enabled) void this.sessionReplay.start();
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
      if (this.flushing || this.stopped) return;
      if (this.queue.isEmpty()) {
        this.scheduleTimer();
        return;
      }
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
      endpoint: input.endpoint || "https://api.example.com",
      heatmapSnapshotBundleUrl: input.heatmapSnapshotBundleUrl ?? "",
      debug: input.debug ?? false,
      sessionInactivityMs: input.sessionInactivityMs ?? 30 * 60 * 1e3,
      respectDoNotTrack: input.respectDoNotTrack ?? false,
      autocapture: {
        click: ((_a = input.autocapture) == null ? void 0 : _a.click) ?? true,
        scroll: ((_b = input.autocapture) == null ? void 0 : _b.scroll) ?? true,
        move: ((_c = input.autocapture) == null ? void 0 : _c.move) ?? true,
        rageClick: ((_d = input.autocapture) == null ? void 0 : _d.rageClick) ?? true,
        hover: ((_e = input.autocapture) == null ? void 0 : _e.hover) ?? true,
        cursor: ((_f = input.autocapture) == null ? void 0 : _f.cursor) ?? true,
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
        // Recording must never start unless a site explicitly opts in.
        enabled: ((_y = input.sessionReplay) == null ? void 0 : _y.enabled) ?? false,
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
      const liveToken = new URL(location.href).searchParams.get("__loopz_heatmap_capture");
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
        cleanUrl.searchParams.delete("__loopz_heatmap_capture");
        history.replaceState(history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        this.mountToolbar(token, capture);
      } catch {
      }
    }
    mountToolbar(token, capture) {
      const host = document.createElement("div");
      host.setAttribute("data-loopz-heatmap-toolbar", "");
      const root = host.attachShadow({ mode: "closed" });
      const wrap = document.createElement("div");
      wrap.innerHTML = `<style>:host{all:initial}.bar{position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;min-width:560px;padding:14px 16px;border-radius:12px;background:#111827;color:#fff;box-shadow:0 16px 50px #0007;font:13px/1.4 system-ui,sans-serif}.copy{flex:1}.title{font-weight:700}.sub{color:#cbd5e1;margin-top:2px}.actions{display:flex;gap:8px}button{border:0;border-radius:7px;padding:9px 14px;font:600 13px system-ui;cursor:pointer}.cancel{background:#374151;color:#fff}.capture{background:#7c3aed;color:#fff}.status{color:#d1fae5;font-weight:600}</style><div class="bar"><div class="copy"><div class="title">Loopz · Heatmap capture</div><div class="sub"></div></div><div class="actions"><button class="cancel">Cancel</button><button class="capture">Capture</button></div></div>`;
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
      if (window.__loopzHeatmapCapture__) return Promise.resolve(window.__loopzHeatmapCapture__);
      if (this.loadPromise) return this.loadPromise;
      const url = this.bundleUrl || deriveHeatmapBundleUrl(currentScriptUrl);
      if (!url) return Promise.resolve(null);
      this.loadPromise = new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onload = () => resolve(window.__loopzHeatmapCapture__ ?? null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
      });
      return this.loadPromise;
    }
  }
  function capitalize(value) {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
  }
  function deriveHeatmapBundleUrl(url) {
    if (!url) return null;
    if (url.includes("sdk.min.js")) return url.replace("sdk.min.js", "sdk-heatmap.min.js");
    if (url.includes("sdk.js")) return url.replace("sdk.js", "sdk-heatmap.js");
    return null;
  }
  class Analytics {
    constructor() {
      this.routeObserver = new RouteObserver();
      this.experiences = null;
      this.editor = null;
      this.debugEnabled = false;
      this.initialized = false;
      this.running = false;
      this.unsubscribers = [];
    }
    init(userConfig) {
      if (this.initialized) {
        this.log("already initialized, ignoring duplicate init()");
        return;
      }
      this.config = resolveConfig(userConfig);
      this.debugEnabled = !!this.config.debug;
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
      this.heatmaps = new HeatmapManager(this.config.endpoint, this.config.siteId, this.config.heatmapSnapshotBundleUrl);
      this.heatmaps.initialize();
      this.wireCollectorsToPipeline();
      this.initialized = true;
      this.log("initialized", { siteId: this.config.siteId });
      this.engine.initializeElementDiscovery();
      this.unsubscribers.push(this.routeObserver.onChange(() => this.onRouteChange()));
      this.routeObserver.start();
      this.start();
      this.trackPageView();
      const editorToken = new URL(location.href).searchParams.get("loopz_editor_token");
      if (editorToken) {
        void Promise.resolve().then(() => EditorModeController$1).then(({ EditorModeController: EditorModeController2 }) => {
          if (!this.initialized) return;
          this.editor = new EditorModeController2(this.config.endpoint);
          void this.editor.start(editorToken);
        }).catch(() => void 0);
      } else if (this.config.experiences.enabled) {
        void Promise.resolve().then(() => ExperienceLoader$1).then(({ ExperienceLoader: ExperienceLoader2 }) => {
          if (!this.initialized) return;
          this.experiences = new ExperienceLoader2(this.config.endpoint, this.config.siteId, this.session, (name) => this.event(name));
          void this.experiences.evaluate();
        }).catch(() => void 0);
      }
    }
    start() {
      if (!this.initialized || this.running) return;
      this.running = true;
      this.engine.start();
      this.batcher.start();
      this.log("autocapture started");
    }
    stop() {
      if (!this.running) return;
      this.running = false;
      this.engine.stop();
      this.batcher.stop();
      this.log("autocapture stopped");
    }
    destroy() {
      var _a, _b, _c, _d;
      this.stop();
      this.routeObserver.stop();
      (_a = this.engine) == null ? void 0 : _a.destroyElementDiscovery();
      for (const unsub of this.unsubscribers) unsub();
      this.unsubscribers = [];
      (_b = this.queue) == null ? void 0 : _b.clear();
      (_c = this.experiences) == null ? void 0 : _c.destroy();
      this.experiences = null;
      (_d = this.editor) == null ? void 0 : _d.destroy();
      this.editor = null;
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
      this.log(`event: ${name}`, properties);
    }
    identify(userId, attributes) {
      if (!this.requireInit()) return;
      this.session.identify(userId);
      const payload = { userId, traits: attributes };
      this.enqueueEvent("identify", payload);
      this.log(`identify: ${userId}`, attributes);
    }
    page() {
      if (!this.requireInit()) return;
      this.trackPageView();
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
      if (!this.initialized) {
        console.warn("[Analytics] call analytics.init(config) before using this method");
        return false;
      }
      return true;
    }
    wireCollectorsToPipeline() {
      const bus = this.engine.bus;
      this.unsubscribers.push(
        bus.on("click", (p) => {
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
    buildAndEnqueue(type, payload) {
      const event = {
        eventId: generateId("evt"),
        type,
        timestamp: Date.now(),
        anonymousId: this.session.getAnonymousId(),
        sessionId: this.session.getSessionId(),
        pageViewId: this.session.getPageViewId(),
        page: getPageContext(),
        heatmap: this.heatmaps.context(),
        payload
      };
      this.batcher.enqueue(event);
    }
    /** Called by bootstrap on visibilitychange/pagehide for unload-safe delivery. */
    flushOnUnload() {
      if (!this.initialized) return;
      this.batcher.flushSync();
    }
    log(message, ...args) {
      if (!this.debugEnabled) return;
      console.log(`[Analytics] ${message}`, ...args);
    }
  }
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
  const PUBLIC_METHODS = [
    "init",
    "start",
    "stop",
    "destroy",
    "event",
    "identify",
    "page",
    "defineFunnel",
    "enableDebug",
    "disableDebug"
  ];
  function installPublicAPI(globalNames) {
    const w = window;
    for (const name of globalNames) {
      const existing = w[name];
      if (existing && "__analyticsInstance" in existing) return existing.__analyticsInstance;
    }
    const analytics = new Analytics();
    const realApi = {
      init: (...args) => analytics.init(args[0]),
      start: () => analytics.start(),
      stop: () => analytics.stop(),
      destroy: () => analytics.destroy(),
      event: (...args) => analytics.event(args[0], args[1]),
      identify: (...args) => analytics.identify(args[0], args[1]),
      page: () => analytics.page(),
      defineFunnel: (...args) => analytics.defineFunnel(args[0], args[1]),
      enableDebug: () => analytics.enableDebug(),
      disableDebug: () => analytics.disableDebug()
    };
    for (const name of globalNames) {
      const existingStub = w[name];
      const queuedCommands = (existingStub == null ? void 0 : existingStub.q) ?? [];
      const finalApi = realApi;
      finalApi.__analyticsInstance = analytics;
      w[name] = finalApi;
      for (const method of PUBLIC_METHODS) {
        if (!(method in finalApi)) {
          finalApi[method] = () => void 0;
        }
      }
      for (const command of queuedCommands) {
        const [method, ...args] = command;
        if (typeof realApi[method] === "function") {
          realApi[method](...args);
        }
      }
    }
    installUnloadHandlers(analytics);
    return analytics;
  }
  installPublicAPI(["__myAnalytics__", "analytics"]);
  function isGuideDefinition(value) {
    return "steps" in value;
  }
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
  function reliability(selector) {
    if (/#[a-z][\w:-]*|\[data-(?:testid|test|qa|cy|analytics-id)=/i.test(selector)) return "reliable";
    if (/\[(?:role|aria-label|name|type|href)=|\.[a-z][\w-]*/i.test(selector) && !selector.includes(":nth-of-type")) return "moderate";
    return "fragile";
  }
  class ElementPicker {
    constructor() {
      this.overlay = null;
      this.generator = new SelectorGenerator();
      this.resolve = null;
      this.move = (event) => {
        var _a, _b;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (target && !target.closest("[data-loopz-editor]")) (_a = this.overlay) == null ? void 0 : _a.show(target);
        else (_b = this.overlay) == null ? void 0 : _b.hide();
      };
      this.click = (event) => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (!target || target.closest("[data-loopz-editor]")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const descriptor = this.generator.describe(target);
        const selector = descriptor.selector;
        this.finish({ primarySelector: selector, fallbackSelectors: [], label: descriptor.label, role: descriptor.role, tagName: descriptor.tagName, reliability: reliability(selector) });
      };
      this.key = (event) => {
        if (event.key === "Escape") this.finish(null);
      };
    }
    pick() {
      this.cancel();
      this.overlay = new HighlightOverlay();
      document.addEventListener("pointermove", this.move, true);
      document.addEventListener("click", this.click, true);
      document.addEventListener("keydown", this.key, true);
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
      document.removeEventListener("keydown", this.key, true);
      (_a = this.overlay) == null ? void 0 : _a.destroy();
      this.overlay = null;
    }
  }
  function findTarget(target) {
    if (!target) return null;
    for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch {
      }
    }
    return null;
  }
  function buildCard(root, content, design, behavior, callbacks) {
    var _a, _b, _c;
    const card = document.createElement("section");
    card.className = "card";
    card.style.setProperty("--loopz-bg", design.theme.background);
    card.style.setProperty("--loopz-fg", design.theme.foreground);
    card.style.setProperty("--loopz-primary", design.theme.primary);
    card.dataset.width = design.width;
    card.dataset.radius = design.theme.borderRadius;
    const close = behavior.dismissible ? `<button class="close" data-dismiss aria-label="Dismiss">×</button>` : "";
    const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText$1(content.primaryAction.label)}</button>` : "";
    const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText$1(content.secondaryAction.label)}</button>` : "";
    card.innerHTML = `${close}<h2>${escapeText$1(content.heading)}</h2><p>${escapeText$1(content.body)}</p><footer>${secondary}${primary}</footer>`;
    (_a = card.querySelector("[data-dismiss]")) == null ? void 0 : _a.addEventListener("click", callbacks.onDismiss);
    (_b = card.querySelector("[data-primary]")) == null ? void 0 : _b.addEventListener("click", callbacks.onPrimary);
    (_c = card.querySelector("[data-secondary]")) == null ? void 0 : _c.addEventListener("click", callbacks.onSecondary);
    root.appendChild(card);
    return card;
  }
  class AnchoredCardRenderer {
    constructor() {
      this.cleanup = [];
    }
    render(root, target, content, design, behavior, callbacks) {
      const card = buildCard(root, content, design, behavior, callbacks);
      const update = () => position(card, target.getBoundingClientRect(), behavior);
      const onWindow = () => requestAnimationFrame(update);
      window.addEventListener("scroll", onWindow, true);
      window.addEventListener("resize", onWindow);
      this.cleanup.push(() => window.removeEventListener("scroll", onWindow, true), () => window.removeEventListener("resize", onWindow));
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(update);
        observer.observe(target);
        observer.observe(card);
        this.cleanup.push(() => observer.disconnect());
      }
      if (typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(onWindow);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        this.cleanup.push(() => observer.disconnect());
      }
      update();
      return card;
    }
    destroy() {
      this.cleanup.splice(0).forEach((fn) => fn());
    }
  }
  function position(card, rect, behavior) {
    const gap = behavior.offset ?? 8;
    const bounds = card.getBoundingClientRect();
    const margin = 8;
    let placement = behavior.placement === "auto" || !behavior.placement ? "bottom" : behavior.placement;
    if (placement === "bottom" && rect.bottom + gap + bounds.height > innerHeight) placement = "top";
    if (placement === "top" && rect.top - gap - bounds.height < 0) placement = "bottom";
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
    card.style.left = `${Math.max(margin, Math.min(left, innerWidth - bounds.width - margin))}px`;
    card.style.top = `${Math.max(margin, Math.min(top, innerHeight - bounds.height - margin))}px`;
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
    render(root, content, design, behavior, callbacks) {
      const card = buildCard(root, content, design, behavior, callbacks);
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
    render(root, content, design, behavior, callbacks) {
      const card = buildCard(root, content, design, behavior, callbacks);
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
  class ExperienceRenderer {
    constructor() {
      this.host = null;
      this.renderer = null;
      this.step = 0;
    }
    render(experience, callbacks) {
      this.destroy();
      this.step = 0;
      if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks);
      return this.renderWidget(experience, experience.definition, callbacks);
    }
    root() {
      this.host = document.createElement("div");
      this.host.dataset.loopzExperience = "";
      this.host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none";
      const root = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      root.appendChild(style);
      document.documentElement.appendChild(this.host);
      return root;
    }
    renderWidget(experience, definition, callbacks) {
      if (experience.widgetType === "anchored_card") {
        const target = findTarget(definition.target);
        if (!target) return false;
        const root = this.root();
        const renderer = new AnchoredCardRenderer();
        this.renderer = renderer;
        renderer.render(root, target, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
      } else if (experience.widgetType === "toast") {
        const root = this.root();
        const renderer = new ToastRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
      } else if (experience.widgetType === "cursor_follow") {
        const root = this.root();
        const renderer = new CursorFollowRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
      } else return false;
      requestAnimationFrame(callbacks.onVisible);
      return true;
    }
    renderGuide(experience, definition, callbacks) {
      var _a;
      const step = definition.steps[this.step];
      const target = findTarget(step == null ? void 0 : step.target);
      if (!step || !target) return false;
      const root = this.root();
      const renderer = new AnchoredCardRenderer();
      this.renderer = renderer;
      const behavior = { dismissible: step.behavior.dismissible ?? true, placement: step.behavior.placement, alignment: step.behavior.alignment, offset: step.behavior.offset };
      const card = renderer.render(root, target, step.content, definition.design, behavior, {
        onDismiss: () => {
          callbacks.onDismiss();
          this.destroy();
        },
        onSecondary: () => {
          callbacks.onDismiss();
          this.destroy();
        },
        onPrimary: () => {
          const action = step.content.primaryAction;
          if (action) callbacks.onAction(action);
          if (this.step < definition.steps.length - 1) {
            this.clearSurface();
            this.step++;
            this.renderGuide(experience, definition, callbacks);
          } else {
            callbacks.onComplete();
            this.destroy();
          }
        }
      });
      if (this.step > 0) {
        const back = document.createElement("button");
        back.className = "secondary";
        back.textContent = "Back";
        back.addEventListener("click", () => {
          this.clearSurface();
          this.step--;
          this.renderGuide(experience, definition, callbacks);
        });
        (_a = card.querySelector("footer")) == null ? void 0 : _a.prepend(back);
      }
      requestAnimationFrame(callbacks.onVisible);
      return true;
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
      var _a, _b;
      (_a = this.renderer) == null ? void 0 : _a.destroy();
      this.renderer = null;
      (_b = this.host) == null ? void 0 : _b.remove();
      this.host = null;
    }
    destroy() {
      this.clearSurface();
      this.step = 0;
    }
  }
  const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--loopz-bg);color:var(--loopz-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--loopz-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
`;
  class EditorModeController {
    constructor(apiBase) {
      this.apiBase = apiBase;
      this.host = null;
      this.picker = new ElementPicker();
      this.expiryTimer = 0;
      this.validationTimer = 0;
      this.preview = new ExperienceRenderer();
    }
    async start(rawToken) {
      try {
        const response = await fetch(`${this.apiBase}/public/experience-editor/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ token: rawToken }) });
        if (!response.ok) return false;
        const session = await response.json();
        const clean2 = new URL(location.href);
        clean2.searchParams.delete("loopz_editor_token");
        history.replaceState(history.state, "", clean2.toString());
        const bridge = new EditorBridge(this.apiBase, session.sessionId, session.accessToken);
        const draft = await bridge.load();
        this.mount(draft, bridge);
        this.expiryTimer = window.setTimeout(() => this.destroy(), Math.max(0, new Date(session.expiresAt).getTime() - Date.now()));
        return true;
      } catch {
        this.destroy();
        return false;
      }
    }
    mount(draft, bridge) {
      var _a, _b;
      this.host = document.createElement("div");
      this.host.dataset.loopzEditor = "";
      const root = this.host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${STYLE}</style><aside><header><b>Loopz visual editor</b><small>${escapeText(draft.experience.name)}</small></header><nav>${["Content", "Design", "Behavior", "Targeting", "Publish"].map((x, i) => `<button data-tab="${i}" class="${i === 0 ? "active" : ""}">${x}</button>`).join("")}</nav><main>
      <section data-panel="0"><label>Heading<input data-heading></label><label>Body<textarea data-body></textarea></label></section>
      <section data-panel="1" hidden><label>Width<select data-width><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label><label>Background<input data-background type="color"></label><label>Text color<input data-foreground type="color"></label><label>Primary color<input data-primary type="color"></label></section>
      <section data-panel="2" hidden><label>Placement<select data-placement><option value="auto">Auto</option><option value="top">Top</option><option value="right">Right</option><option value="bottom">Bottom</option><option value="left">Left</option></select></label><label>Offset<input data-offset type="number" min="0" max="100"></label><label class="row"><input data-dismissible type="checkbox"> Dismissible</label><button data-pick>Reselect target</button><p data-reliability></p></section>
      <section data-panel="3" hidden><label>Frequency<select data-frequency><option value="once">Once ever</option><option value="once_per_session">Once per session</option><option value="every_time">Every qualifying time</option></select></label><label>Priority<input data-priority type="number" min="-1000" max="1000"></label><p>Saved Page, Segment, and event targeting are configured securely in the Loopz dashboard.</p></section>
      <section data-panel="4" hidden><p>Preview is live on this page. Save the draft here, then return to Loopz to publish or pause it.</p><button data-save>Save draft</button></section>
      <p data-status>Draft autosaves as you edit.</p></main></aside>`;
      document.documentElement.appendChild(this.host);
      const definition = draft.version.definition;
      const content = isGuideDefinition(definition) ? definition.steps[0].content : definition.content;
      const heading = root.querySelector("[data-heading]");
      const body = root.querySelector("[data-body]");
      heading.value = content.heading;
      body.value = content.body;
      let saveTimer = 0;
      const status = root.querySelector("[data-status]");
      const renderPreview = () => this.preview.render({ id: draft.experience.id, versionId: draft.version.id, kind: draft.experience.kind, widgetType: draft.experience.widgetType, priority: 0, definition }, { onVisible: () => void 0, onDismiss: () => window.setTimeout(renderPreview, 0), onAction: () => void 0, onComplete: () => window.setTimeout(renderPreview, 0) });
      const persist = async () => {
        status.textContent = "Saving…";
        try {
          await bridge.save(definition);
          status.textContent = "Draft saved.";
        } catch {
          status.textContent = "Editor session expired or was revoked.";
          this.destroy();
        }
      };
      const save = () => {
        renderPreview();
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(persist, 350);
      };
      heading.addEventListener("input", () => {
        content.heading = heading.value;
        save();
      });
      body.addEventListener("input", () => {
        content.body = body.value;
        save();
      });
      const width = root.querySelector("[data-width]");
      width.value = definition.design.width;
      width.addEventListener("change", () => {
        definition.design.width = width.value;
        save();
      });
      for (const key of ["background", "foreground", "primary"]) {
        const input = root.querySelector(`[data-${key}]`);
        input.value = definition.design.theme[key];
        input.addEventListener("input", () => {
          definition.design.theme[key] = input.value;
          save();
        });
      }
      const activeBehavior = isGuideDefinition(definition) ? definition.steps[0].behavior : definition.behavior;
      const placement = root.querySelector("[data-placement]");
      placement.value = activeBehavior.placement ?? "auto";
      placement.addEventListener("change", () => {
        activeBehavior.placement = placement.value;
        save();
      });
      const offset = root.querySelector("[data-offset]");
      offset.value = String(activeBehavior.offset ?? 8);
      offset.addEventListener("input", () => {
        activeBehavior.offset = Number(offset.value);
        save();
      });
      const dismissible = root.querySelector("[data-dismissible]");
      dismissible.checked = activeBehavior.dismissible ?? true;
      dismissible.addEventListener("change", () => {
        activeBehavior.dismissible = dismissible.checked;
        save();
      });
      const targeting = definition.targeting;
      const frequency = root.querySelector("[data-frequency]");
      frequency.value = targeting.frequency.mode;
      frequency.addEventListener("change", () => {
        targeting.frequency.mode = frequency.value;
        save();
      });
      const priority = root.querySelector("[data-priority]");
      priority.value = String(targeting.priority);
      priority.addEventListener("input", () => {
        targeting.priority = Number(priority.value);
        save();
      });
      (_a = root.querySelector("[data-pick]")) == null ? void 0 : _a.addEventListener("click", async () => {
        status.textContent = "Click the element this step should attach to.";
        const target = await this.picker.pick();
        if (!target) {
          status.textContent = "Selection cancelled.";
          return;
        }
        this.setTarget(definition, target);
        root.querySelector("[data-reliability]").textContent = target.reliability === "fragile" ? "Warning: this selector is fragile and may change with the page layout." : `${target.reliability} selector`;
        save();
      });
      (_b = root.querySelector("[data-save]")) == null ? void 0 : _b.addEventListener("click", () => void persist());
      root.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
        root.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        const index = button.dataset.tab;
        root.querySelectorAll("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== index);
      }));
      renderPreview();
      this.validationTimer = window.setInterval(() => {
        void bridge.load().catch(() => this.destroy());
      }, 15e3);
    }
    setTarget(definition, target) {
      if (isGuideDefinition(definition)) definition.steps[0].target = target;
      else definition.target = target;
    }
    destroy() {
      var _a;
      clearTimeout(this.expiryTimer);
      clearInterval(this.validationTimer);
      this.preview.destroy();
      this.picker.cancel();
      (_a = this.host) == null ? void 0 : _a.remove();
      this.host = null;
    }
  }
  function escapeText(value) {
    const span = document.createElement("span");
    span.textContent = value;
    return span.innerHTML;
  }
  const STYLE = `:host{all:initial}aside{position:fixed;right:16px;top:16px;width:340px;z-index:2147483647;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);font:14px ui-sans-serif,system-ui,sans-serif}header{display:flex;flex-direction:column;padding:16px;border-bottom:1px solid #e5e7eb}small{color:#6b7280;margin-top:3px}nav{display:flex;overflow:auto;border-bottom:1px solid #e5e7eb}nav button{border:0;background:transparent;padding:10px 8px;font-size:11px;cursor:pointer}nav button.active{color:#2563eb;border-bottom:2px solid #2563eb}main{display:grid;gap:12px;padding:16px}section{display:grid;gap:12px}label{display:grid;gap:5px;font-size:12px;font-weight:600}label.row{display:flex;align-items:center}label.row input{width:auto}input,textarea,select{box-sizing:border-box;width:100%;border:1px solid #d1d5db;border-radius:7px;padding:8px;font:14px inherit;background:#fff}textarea{min-height:88px;resize:vertical}main button{border:0;border-radius:7px;padding:9px;background:#111827;color:#fff;cursor:pointer}p{margin:0;color:#6b7280;font-size:12px}`;
  const EditorModeController$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    EditorModeController
  }, Symbol.toStringTag, { value: "Module" }));
  class EligibilityEngine {
    choose(experiences) {
      return [...experiences].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
    }
  }
  const ONCE_KEY = "__loopz_experiences_seen__";
  const SESSION_KEY = "__loopz_experiences_session_seen__";
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
      this.activeId = null;
      this.impressionId = null;
      this.destroyed = false;
    }
    async evaluate(trigger) {
      if (this.destroyed || this.activeId) return;
      try {
        const query = new URLSearchParams({ url: location.href, anonymousId: this.session.getAnonymousId(), sessionId: this.session.getSessionId() });
        const userId = this.session.getIdentifiedUserId();
        if (userId) query.set("trackedUserId", userId);
        if (trigger) query.set("trigger", trigger);
        const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences?${query}`, { credentials: "omit" });
        if (!response.ok) return;
        const manifest = await response.json();
        const chosen = this.eligibility.choose(Array.isArray(manifest.experiences) ? manifest.experiences : []);
        if (!chosen) return;
        const mounted = this.renderer.render(chosen, {
          onVisible: () => void this.shown(chosen),
          onDismiss: () => void this.record(chosen, "dismissed"),
          onAction: (action) => this.handleAction(chosen, action),
          onComplete: () => void this.record(chosen, "completed")
        });
        if (mounted) this.activeId = chosen.id;
      } catch {
      }
    }
    onRouteChange() {
      this.renderer.destroy();
      this.activeId = null;
      this.impressionId = null;
      void this.evaluate();
    }
    onCustomEvent(name) {
      void this.evaluate(name);
    }
    destroy() {
      this.destroyed = true;
      this.renderer.destroy();
      this.activeId = null;
    }
    async shown(experience) {
      if (this.activeId !== experience.id || this.impressionId) return;
      this.state.markSeen(experience.id);
      const result = await this.post(experience, "shown");
      this.impressionId = (result == null ? void 0 : result.impressionId) ?? null;
    }
    handleAction(experience, action) {
      var _a;
      void this.record(experience, "action", action.type);
      if (action.type === "open_url" && action.url) window.location.assign(action.url);
      if (action.type === "track_event" && action.eventName) (_a = this.trackEvent) == null ? void 0 : _a.call(this, action.eventName);
    }
    async record(experience, event, action) {
      await this.post(experience, event, action);
      if (event !== "action") {
        this.activeId = null;
        this.impressionId = null;
      }
    }
    async post(experience, event, action) {
      try {
        const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experience-events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ experienceId: experience.id, versionId: experience.versionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? void 0, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), impressionId: this.impressionId ?? void 0, event, action }) });
        return response.ok && response.status !== 204 ? await response.json() : null;
      } catch {
        return null;
      }
    }
  }
  const ExperienceLoader$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    ExperienceLoader
  }, Symbol.toStringTag, { value: "Module" }));
})();
//# sourceMappingURL=sdk.js.map
