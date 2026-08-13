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
const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];
const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;
function isStableClass(cls) {
  if (!cls) return false;
  if (DYNAMIC_CLASS_PATTERN.test(cls)) return false;
  if (/^\d/.test(cls)) return false;
  return true;
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
      const value = el.getAttribute(attr);
      if (value && value.length < 100) {
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
      selector: this.generate(el)
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
        pageY: e.pageY
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: window.scrollX, y: window.scrollY },
      element: this.selectorGenerator.describe(target),
      interactive: interactiveEl !== null,
      pointerType: e.pointerType || void 0
    };
    this.bus.emit("click", payload);
    this.bus.emit("click:raw", { x: e.clientX, y: e.clientY, target, timestamp: Date.now() });
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
      coordinates: { x: first.x, y: first.y },
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
      y: Math.round(rect.top + rect.height / 2)
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
      y: active.y
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
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
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
    this.click = new ClickCollector(this.bus, this.privacy);
    this.scroll = new ScrollCollector(this.bus, config.scroll);
    this.move = new MoveCollector(this.bus, config.move);
    this.rageClick = new RageClickDetector(this.bus, config.rageClick);
    this.hover = new HoverCollector(this.bus, this.privacy, config.hover);
    this.cursor = new CursorCollector(this.bus, config.cursor);
    this.funnel = new FunnelTracker(this.bus);
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
  /** Called on SPA route changes - resets per-page-view collector state. */
  onRouteChange(path) {
    this.scroll.reset();
    this.funnel.onPageView(path);
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
      return { id: existingId, lastActive: fresh };
    }
    const id = generateId("sess");
    sessionStore.set(SESSION_ID_KEY, id);
    sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(fresh));
    return { id, lastActive: fresh };
  }
  /** Call on any behavioral event to keep the session alive and rotate if expired. */
  touch() {
    const t = now();
    if (t - this.lastActivity >= this.inactivityMs) {
      this.sessionId = generateId("sess");
      sessionStore.set(SESSION_ID_KEY, this.sessionId);
    }
    this.lastActivity = t;
    sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(t));
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
const UNSUPPORTED_BY_BACKEND = /* @__PURE__ */ new Set(["move", "rage_click", "funnel", "custom", "identify"]);
function mapToBackendEvent(event) {
  if (UNSUPPORTED_BY_BACKEND.has(event.type) || event.type === "session_replay_event") return null;
  const viewportWidth = event.page.viewportWidth > 0 ? event.page.viewportWidth : void 0;
  const viewportHeight = event.page.viewportHeight > 0 ? event.page.viewportHeight : void 0;
  switch (event.type) {
    case "page_view":
      return { type: "page_view", timestamp: event.timestamp };
    case "click": {
      const p = event.payload;
      const x = Math.max(0, Math.min(2e4, Math.floor(p.coordinates.clientX)));
      const y = Math.max(0, Math.min(2e5, Math.floor(p.coordinates.clientY)));
      return {
        type: "click",
        timestamp: event.timestamp,
        element: { selector: p.element.selector },
        x,
        y,
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
        element: { selector: p.element.selector },
        durationMs: p.durationMs,
        ...x !== void 0 && { x },
        ...y !== void 0 && { y },
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
        x,
        y,
        ...cursorViewportWidth !== void 0 && { viewportWidth: cursorViewportWidth },
        ...cursorViewportHeight !== void 0 && { viewportHeight: cursorViewportHeight }
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
function resolveConfig(input) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J;
  if (!input || !input.siteId) {
    throw new Error("[Analytics] init() requires a `siteId`");
  }
  return {
    siteId: input.siteId,
    endpoint: input.endpoint || "https://api.example.com",
    debug: input.debug ?? false,
    sessionInactivityMs: input.sessionInactivityMs ?? 30 * 60 * 1e3,
    respectDoNotTrack: input.respectDoNotTrack ?? false,
    autocapture: {
      click: ((_a = input.autocapture) == null ? void 0 : _a.click) ?? true,
      scroll: ((_b = input.autocapture) == null ? void 0 : _b.scroll) ?? true,
      move: ((_c = input.autocapture) == null ? void 0 : _c.move) ?? true,
      rageClick: ((_d = input.autocapture) == null ? void 0 : _d.rageClick) ?? true,
      hover: ((_e = input.autocapture) == null ? void 0 : _e.hover) ?? true,
      cursor: ((_f = input.autocapture) == null ? void 0 : _f.cursor) ?? true
    },
    rageClick: {
      minClicks: ((_g = input.rageClick) == null ? void 0 : _g.minClicks) ?? 4,
      timeWindowMs: ((_h = input.rageClick) == null ? void 0 : _h.timeWindowMs) ?? 1e3,
      radiusPx: ((_i = input.rageClick) == null ? void 0 : _i.radiusPx) ?? 40,
      ignoreDoubleClickMs: ((_j = input.rageClick) == null ? void 0 : _j.ignoreDoubleClickMs) ?? 250
    },
    move: {
      samplesPerSecond: ((_k = input.move) == null ? void 0 : _k.samplesPerSecond) ?? 12,
      minMovementPx: ((_l = input.move) == null ? void 0 : _l.minMovementPx) ?? 2
    },
    scroll: {
      throttleMs: ((_m = input.scroll) == null ? void 0 : _m.throttleMs) ?? 100,
      milestones: ((_n = input.scroll) == null ? void 0 : _n.milestones) ?? [25, 50, 75, 90, 100]
    },
    hover: {
      minHoverMs: ((_o = input.hover) == null ? void 0 : _o.minHoverMs) ?? 150
    },
    cursor: {
      sampleInterval: ((_p = input.cursor) == null ? void 0 : _p.sampleInterval) ?? 50,
      minimumDistance: ((_q = input.cursor) == null ? void 0 : _q.minimumDistance) ?? 12,
      pauseThreshold: ((_r = input.cursor) == null ? void 0 : _r.pauseThreshold) ?? 300
    },
    queue: {
      maxBatchSize: ((_s = input.queue) == null ? void 0 : _s.maxBatchSize) ?? 50,
      maxWaitMs: ((_t = input.queue) == null ? void 0 : _t.maxWaitMs) ?? 5e3,
      maxQueueSize: ((_u = input.queue) == null ? void 0 : _u.maxQueueSize) ?? 2e3,
      maxRetries: ((_v = input.queue) == null ? void 0 : _v.maxRetries) ?? 3,
      retryBaseDelayMs: ((_w = input.queue) == null ? void 0 : _w.retryBaseDelayMs) ?? 1e3
    },
    sessionReplay: {
      // Recording must never start unless a site explicitly opts in.
      enabled: ((_x = input.sessionReplay) == null ? void 0 : _x.enabled) ?? false,
      sampleMouseMovement: ((_y = input.sessionReplay) == null ? void 0 : _y.sampleMouseMovement) ?? true,
      maskAllInputs: ((_z = input.sessionReplay) == null ? void 0 : _z.maskAllInputs) ?? true,
      maskTextSelector: (_A = input.sessionReplay) == null ? void 0 : _A.maskTextSelector,
      blockSelector: (_B = input.sessionReplay) == null ? void 0 : _B.blockSelector,
      recordCanvas: ((_C = input.sessionReplay) == null ? void 0 : _C.recordCanvas) ?? false,
      collectFonts: ((_D = input.sessionReplay) == null ? void 0 : _D.collectFonts) ?? false,
      checkoutEveryNms: ((_E = input.sessionReplay) == null ? void 0 : _E.checkoutEveryNms) ?? 2 * 60 * 1e3,
      bundleUrl: (_F = input.sessionReplay) == null ? void 0 : _F.bundleUrl
    },
    feedback: {
      enabled: ((_G = input.feedback) == null ? void 0 : _G.enabled) ?? false,
      apiBase: ((_H = input.feedback) == null ? void 0 : _H.apiBase) ?? "https://platform.example.com",
      flushIntervalMs: ((_I = input.feedback) == null ? void 0 : _I.flushIntervalMs) ?? 3e3,
      autoDismissMs: ((_J = input.feedback) == null ? void 0 : _J.autoDismissMs) ?? 12e3
    }
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
class Analytics {
  constructor() {
    this.routeObserver = new RouteObserver();
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
    this.wireCollectorsToPipeline();
    this.initialized = true;
    this.log("initialized", { siteId: this.config.siteId });
    this.start();
    this.trackPageView();
    this.routeObserver.start();
    this.routeObserver.onChange(() => this.onRouteChange());
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
    var _a;
    this.stop();
    this.routeObserver.stop();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    (_a = this.queue) == null ? void 0 : _a.clear();
    this.initialized = false;
    this.log("destroyed");
  }
  event(name, properties) {
    if (!this.requireInit()) return;
    const payload = { name, properties };
    this.enqueueEvent("custom", payload);
    this.engine.funnel.onCustomEvent(name);
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
  }
  trackPageView() {
    this.enqueueEvent("page_view", { title: document.title });
    this.engine.funnel.onPageView(location.pathname);
  }
  onRouteChange() {
    this.session.newPageView();
    this.engine.onRouteChange(location.pathname);
    this.trackPageView();
    this.log("route changed", location.pathname);
  }
  enqueueEvent(type, payload) {
    this.session.touch();
    const event = {
      eventId: generateId("evt"),
      type,
      timestamp: Date.now(),
      anonymousId: this.session.getAnonymousId(),
      sessionId: this.session.getSessionId(),
      pageViewId: this.session.getPageViewId(),
      page: getPageContext(),
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
function createAnalytics(config) {
  const analytics = new Analytics();
  analytics.init(config);
  installUnloadHandlers(analytics);
  return analytics;
}
export {
  Analytics,
  createAnalytics
};
//# sourceMappingURL=sdk.esm.js.map
