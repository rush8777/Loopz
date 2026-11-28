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
  class AutoCaptureEngine {
    constructor(config) {
      this.config = config;
      this.bus = new EventBus();
      this.privacy = new PrivacyFilter();
      this.started = false;
      this.click = new ClickCollector(this.bus, this.privacy);
      this.scroll = new ScrollCollector(this.bus, config.scroll);
      this.rageClick = new RageClickDetector(this.bus, config.rageClick);
      this.funnel = new FunnelTracker(this.bus);
    }
    start() {
      if (this.started) return;
      this.started = true;
      const ac = this.config.autocapture;
      if (ac.click) this.click.start();
      if (ac.scroll) this.scroll.start();
      if (ac.rageClick && ac.click) this.rageClick.start();
    }
    stop() {
      if (!this.started) return;
      this.started = false;
      this.click.stop();
      this.scroll.stop();
      this.rageClick.stop();
    }
    onRouteChange(path) {
      this.scroll.reset();
      this.funnel.onPageView(path);
    }
    isRunning() {
      return this.started;
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
      const previous = this.getIdentifiedUserId();
      if (previous && previous !== userId) this.reset();
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
  class EventQueue {
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
      const lowPriorityIndex = this.events.findIndex((event) => event.type === "scroll");
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
  }
  function toBackendElement(descriptor) {
    return {
      selector: descriptor.selector,
      ...descriptor.label && { label: descriptor.label },
      ...descriptor.role && { role: descriptor.role }
    };
  }
  function mapToBackendEvent(event) {
    const viewportWidth = event.page.viewportWidth > 0 ? event.page.viewportWidth : void 0;
    const viewportHeight = event.page.viewportHeight > 0 ? event.page.viewportHeight : void 0;
    const pageContext = {
      path: event.page.path,
      ...event.page.documentWidth > 0 && { documentWidth: event.page.documentWidth },
      ...event.page.documentHeight > 0 && { documentHeight: event.page.documentHeight }
    };
    switch (event.type) {
      case "page_view":
        return {
          type: "page_view",
          timestamp: event.timestamp,
          anonymousId: event.anonymousId,
          eventId: event.eventId,
          pageViewId: event.pageViewId,
          ...pageContext
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
          ...pageContext,
          element: toBackendElement(p.element),
          x,
          y,
          documentX: Math.max(0, Math.min(2e4, Math.floor(p.coordinates.documentX ?? p.coordinates.pageX))),
          documentY: Math.max(0, Math.min(2e5, Math.floor(p.coordinates.documentY ?? p.coordinates.pageY))),
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
          ...pageContext,
          scrollPercent,
          ...viewportWidth !== void 0 && { viewportWidth },
          ...viewportHeight !== void 0 && { viewportHeight }
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
          ...pageContext,
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
    /** Best-effort async send used during normal operation. */
    async send(events) {
      if (!this.apiBase || events.length === 0) return { ok: true, retryable: false };
      const acknowledgedEventIds = [];
      let ok = true;
      let retryable = false;
      for (const [sessionId, group] of mapEventsBySession(events)) {
        const result = await this.postJson(this.eventsUrl(), { sessionId, events: group });
        ok = result.ok && ok;
        retryable = result.retryable || retryable;
        if (result.ok) acknowledgedEventIds.push(...group.map((event) => event.eventId));
      }
      return { ok, retryable, ...!ok && acknowledgedEventIds.length ? { acknowledgedEventIds } : {} };
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
      let allOk = true;
      for (const [sessionId, group] of mapEventsBySession(events)) {
        allOk = this.beaconOrFallback(this.eventsUrl(), { sessionId, events: group }) && allOk;
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
  function mapEventsBySession(events) {
    const groups = /* @__PURE__ */ new Map();
    for (const [sessionId, eventsInSession] of groupBySessionId(events)) {
      const mapped = eventsInSession.map(mapToBackendEvent).filter((event) => event !== null);
      if (mapped.length) groups.set(sessionId, mapped);
    }
    return groups;
  }
  class Batcher {
    constructor(queue, transport, config, log = () => void 0, onDelivered = () => void 0) {
      this.queue = queue;
      this.transport = transport;
      this.config = config;
      this.log = log;
      this.onDelivered = onDelivered;
      this.timer = null;
      this.retryCount = 0;
      this.flushing = false;
      this.flushPromise = null;
      this.stopped = false;
      this.retryAfter = 0;
      this.retryTimer = null;
    }
    start() {
      this.stopped = false;
      this.scheduleTimer();
    }
    stop() {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
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
      if (Date.now() < this.retryAfter) {
        if (!this.retryTimer) this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush();
        }, this.retryAfter - Date.now());
        return;
      }
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
        if (Date.now() < this.retryAfter) await new Promise((resolve) => setTimeout(resolve, this.retryAfter - Date.now()));
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
        const acknowledged = new Set(result.acknowledgedEventIds ?? []);
        const delivered = result.ok ? batch : batch.filter((event) => acknowledged.has(event.eventId));
        const pending = batch.filter((event) => !acknowledged.has(event.eventId));
        if (delivered.length) {
          try {
            this.onDelivered(delivered);
          } catch {
          }
        }
        if (result.ok) {
          this.retryCount = 0;
          this.retryAfter = 0;
          this.log(`[Analytics] batch flushed (${batch.length} events)`);
        } else if (pending.length && result.retryable && this.retryCount < this.config.maxRetries) {
          this.retryCount += 1;
          const delay = this.config.retryBaseDelayMs * Math.pow(2, this.retryCount - 1);
          this.queue.requeueFront(pending);
          this.log(`[Analytics] flush failed, retrying in ${delay}ms (attempt ${this.retryCount})`);
          this.retryAfter = Date.now() + delay;
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.flush();
          }, delay);
        } else {
          this.retryCount = 0;
          this.retryAfter = 0;
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
      osVersion: (os == null ? void 0 : os.version) || void 0,
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    if (!input || !input.siteId) {
      throw new Error("[Analytics] init() requires a `siteId`");
    }
    return {
      siteId: input.siteId,
      endpoint: input.endpoint || "https://api.movcues.com",
      experienceRuntimeBundleUrl: input.experienceRuntimeBundleUrl ?? "",
      geoAgent: input.geoAgent,
      editorRuntimeBundleUrl: input.editorRuntimeBundleUrl ?? "",
      debug: input.debug ?? true,
      sessionInactivityMs: input.sessionInactivityMs ?? 30 * 60 * 1e3,
      respectDoNotTrack: input.respectDoNotTrack ?? false,
      autocapture: {
        click: ((_a = input.autocapture) == null ? void 0 : _a.click) ?? true,
        scroll: ((_b = input.autocapture) == null ? void 0 : _b.scroll) ?? true,
        rageClick: ((_c = input.autocapture) == null ? void 0 : _c.rageClick) ?? true
      },
      rageClick: {
        minClicks: ((_d = input.rageClick) == null ? void 0 : _d.minClicks) ?? 4,
        timeWindowMs: ((_e = input.rageClick) == null ? void 0 : _e.timeWindowMs) ?? 1e3,
        radiusPx: ((_f = input.rageClick) == null ? void 0 : _f.radiusPx) ?? 40,
        ignoreDoubleClickMs: ((_g = input.rageClick) == null ? void 0 : _g.ignoreDoubleClickMs) ?? 250
      },
      scroll: {
        throttleMs: ((_h = input.scroll) == null ? void 0 : _h.throttleMs) ?? 100,
        milestones: ((_i = input.scroll) == null ? void 0 : _i.milestones) ?? [25, 50, 75, 90, 100]
      },
      queue: {
        maxBatchSize: ((_j = input.queue) == null ? void 0 : _j.maxBatchSize) ?? 50,
        maxWaitMs: ((_k = input.queue) == null ? void 0 : _k.maxWaitMs) ?? 5e3,
        maxQueueSize: ((_l = input.queue) == null ? void 0 : _l.maxQueueSize) ?? 2e3,
        maxRetries: ((_m = input.queue) == null ? void 0 : _m.maxRetries) ?? 3,
        retryBaseDelayMs: ((_n = input.queue) == null ? void 0 : _n.retryBaseDelayMs) ?? 1e3
      },
      experiences: { enabled: ((_o = input.experiences) == null ? void 0 : _o.enabled) ?? true }
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
  const currentScriptElement = typeof document !== "undefined" && document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
  const currentScriptUrl = (currentScriptElement == null ? void 0 : currentScriptElement.src) ?? null;
  const pendingLoads = /* @__PURE__ */ new Map();
  function deriveSiblingBundleUrl(scriptUrl, bundle) {
    if (!scriptUrl) return null;
    try {
      const url = new URL(scriptUrl, typeof location === "undefined" ? void 0 : location.href);
      const parts = url.pathname.split("/");
      const file = parts[parts.length - 1] ?? "";
      const experienceSibling = bundle === "geo-agent" && /^sdk-experiences(?:\.min)?\.js$/.test(file);
      const readable = file === "sdk.js" || file === "sdk-experiences.js";
      if (!experienceSibling && file !== "sdk.js" && file !== "sdk.min.js" && file !== "v1.js" && file !== "v1.min.js") {
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
    if (state.guidePreview !== void 0 && (!state.guidePreview || typeof state.guidePreview.versionId !== "string" || typeof state.guidePreview.entryPath !== "string" || typeof state.guidePreview.completed !== "boolean")) return false;
    return typeof state.experienceId === "string" && !!state.experienceId && (state.selectedStepId === void 0 || typeof state.selectedStepId === "string") && (state.mode === "select" || state.mode === "design" || state.mode === "target" || state.mode === "navigate" || state.mode === "preview");
  }
  function isEditorSession(value) {
    if (!value || typeof value !== "object") return false;
    const session = value;
    return typeof session.sessionId === "string" && !!session.sessionId && typeof session.accessToken === "string" && !!session.accessToken && typeof session.expiresAt === "string" && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt) > Date.now();
  }
  function isEditorDraft(value) {
    var _a, _b;
    if (!value || typeof value !== "object") return false;
    const draft = value;
    return typeof ((_a = draft.experience) == null ? void 0 : _a.id) === "string" && typeof ((_b = draft.version) == null ? void 0 : _b.revision) === "number" && !!draft.version.definition;
  }
  async function exchangeEditorSession(apiBase, token) {
    try {
      const response = await fetch(`${apiBase}/public/experience-editor/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify({ token, includeDraft: true })
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!isEditorSession(data)) return null;
      const initialDraft = data.draft;
      return { session: data, ...isEditorDraft(initialDraft) ? { draft: initialDraft } : {} };
    } catch {
      return null;
    }
  }
  async function prefetchEditorDraft(apiBase, session) {
    try {
      if (!isEditorSession(session)) return null;
      const response = await fetch(`${apiBase}/public/experience-editor/${encodeURIComponent(session.sessionId)}/draft`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        credentials: "omit",
        cache: "no-store"
      });
      if (!response.ok) return null;
      const draft = await response.json();
      return isEditorDraft(draft) ? draft : null;
    } catch {
      return null;
    }
  }
  const rules = [
    ["navigation", "nav,[role=navigation]"],
    ["heading", "h1,h2,h3,h4,[role=heading]"],
    ["dialog", "dialog,[role=dialog],[aria-modal=true]"],
    ["card", "article,[class~='card'],[data-slot=card],[class~='panel']"],
    ["button", "button,[role=button],input[type=button],input[type=submit],a[class*='btn'],a[class*='button']"],
    ["input", "input:not([type=hidden]),textarea,select,[role=combobox]"],
    ["label", "label,legend"],
    ["badge", "[class~='badge'],[data-slot=badge]"],
    ["notification", "[role=alert],[role=status],[class~='toast']"],
    ["popover", "[popover],[role=menu],[role=listbox],[data-slot=popover-content]"],
    ["tooltip", "[role=tooltip]"],
    ["body", "p,small"]
  ];
  const excluded = "[hidden],[inert],[aria-hidden=true],iframe,svg,script,style,[data-movcues-experience],[data-movcues-experience-root],[data-movcues-checklist],[id^=movcues],[data-movcues-editor],[class*='intercom-'],[id*=onetrust],[id*=hubspot],[id*=cookie-banner],[id*=crisp-chatbox]";
  const variableNames = {
    "--primary": "primary",
    "--brand": "primary",
    "--brand-color": "primary",
    "--color-primary": "primary",
    "--primary-foreground": "primaryForeground",
    "--background": "background",
    "--foreground": "text",
    "--ink": "text",
    "--card": "surface",
    "--surface": "surface",
    "--soft": "surface",
    "--muted-foreground": "mutedText",
    "--muted": "mutedText",
    "--border": "border",
    "--line": "border"
  };
  const colorPattern = /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s-]+\))$/i;
  const fontPattern = /^[\p{L}\p{N} _,'"-]{1,140}$/u;
  function number(value, fallback, max = 160) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.round(Math.min(max, Math.max(0, parsed)) * 100) / 100 : fallback;
  }
  function color(value) {
    return colorPattern.test(value) && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value) ? value : void 0;
  }
  function shadow(value) {
    var _a, _b, _c;
    if (!value || value === "none" || value.includes("inset")) return;
    const first = ((_a = value.match(/^(?:[^,(]|\([^)]*\))+/)) == null ? void 0 : _a[0]) ?? "";
    const paint = (_b = first.match(/rgba?\([^)]*\)|#[0-9a-f]+/i)) == null ? void 0 : _b[0];
    const lengths = (_c = first.match(/-?\d+(?:\.\d+)?px/g)) == null ? void 0 : _c.map(parseFloat);
    if (lengths && lengths.length >= 2 && paint && color(paint)) {
      const [x, y, blur = 0, spread = 0] = lengths;
      if ([x, y, blur, spread].every((value2) => Math.abs(value2) <= 100)) return { x, y, blur, spread, color: paint };
    }
  }
  function chromatic(value) {
    var _a;
    const channels = (_a = value == null ? void 0 : value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/)) == null ? void 0 : _a.slice(1).map(Number);
    return Boolean(channels && Math.max(...channels) - Math.min(...channels) >= 28);
  }
  async function readyForCapture() {
    var _a;
    if (document.readyState === "loading") await new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
    if ((_a = document.fonts) == null ? void 0 : _a.ready) {
      let timer;
      try {
        await Promise.race([document.fonts.ready.catch(() => void 0), new Promise((resolve) => {
          timer = setTimeout(resolve, 1e3);
        })]);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  async function collectDesignEvidence() {
    await readyForCapture();
    const body = document.body ?? document.documentElement;
    const rootStyle = getComputedStyle(document.documentElement);
    const styleCache = new WeakMap([[document.documentElement, rootStyle]]);
    const styleOf = (element) => {
      const cached = styleCache.get(element);
      if (cached) return cached;
      const style = getComputedStyle(element);
      styleCache.set(element, style);
      return style;
    };
    const variables = {};
    const colorProbe = document.createElement("span").style;
    for (const [name, role] of Object.entries(variableNames)) {
      const raw = rootStyle.getPropertyValue(name).trim();
      const hslChannels = /^-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(raw);
      colorProbe.color = "";
      colorProbe.color = hslChannels ? `hsl(${raw})` : raw;
      const value = color(raw) ?? color(colorProbe.color);
      if (value && !variables[role]) variables[role] = value;
    }
    const groups = /* @__PURE__ */ new Map();
    function sample(element, role, box) {
      var _a;
      const style = styleOf(element);
      if (style.visibility === "hidden" || style.visibility === "collapse" || style.display === "none" || style.opacity === "0") return;
      const size = number(style.fontSize, 16, 200);
      const paint = color(style.backgroundColor);
      if (role === "heading" && size >= 38 && !element.closest("dialog,[role=dialog],article,[class~='card']")) role = "display";
      if (role === "button") {
        const secondary = element.matches("[class*=secondary],[class*=outline],[class*=ghost],[data-variant=secondary]");
        const primary = element.matches("[class*=primary],[data-variant=primary],input[type=submit]");
        role = !secondary && (primary || chromatic(paint)) ? "primaryButton" : "secondaryButton";
      }
      let backdrop;
      for (let parent = element.parentElement, depth = 0; parent && depth < 8; parent = parent.parentElement, depth++) {
        const parentStyle = styleOf(parent);
        if (parentStyle.display === "none" || parentStyle.opacity === "0") return;
        backdrop ?? (backdrop = color(parentStyle.backgroundColor));
      }
      const item = {
        role,
        count: 1,
        fontFamily: fontPattern.test(style.fontFamily) ? style.fontFamily : void 0,
        fontSize: size,
        fontWeight: style.fontWeight === "bold" ? 700 : number(style.fontWeight, 400, 900),
        lineHeight: ((_a = style.lineHeight) == null ? void 0 : _a.endsWith("px")) && size ? Math.min(4, number(style.lineHeight, size, 500) / size) : number(style.lineHeight || "", 1.5, 4),
        letterSpacing: Math.max(-10, Math.min(20, parseFloat(style.letterSpacing) || 0)),
        color: color(style.color),
        background: paint,
        backdrop,
        borderColor: number(style.borderTopWidth, 0) ? color(style.borderTopColor) : void 0,
        borderWidth: number(style.borderTopWidth, 0, 24),
        radius: number(style.borderTopLeftRadius || style.borderRadius, 0, 100),
        padding: number(style.paddingTop, 0, 80),
        gap: number(style.gap, 0, 80),
        width: box ? Math.min(1600, Math.round(box.width)) : void 0,
        height: box ? Math.min(1200, Math.round(box.height)) : void 0,
        shadow: shadow(style.boxShadow)
      };
      const { width: _width, height: _height, ...signature } = item;
      const key = JSON.stringify(signature);
      const group = groups.get(role) ?? /* @__PURE__ */ new Map();
      groups.set(role, group);
      const existing = group.get(key);
      if (existing) existing.count = Math.min(100, existing.count + 1);
      else if (group.size < 12) group.set(key, item);
    }
    sample(body, "page");
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => node.matches(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    let visited = 0;
    let measured = 0;
    for (let node = walker.nextNode(); node && visited < 1400 && measured < 180; node = walker.nextNode(), visited++) {
      if (!(node instanceof HTMLElement)) continue;
      const match = rules.find(([, selector]) => node.matches(selector));
      if (!match) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 2 || box.height < 2 || box.right <= 0 || box.bottom <= 0 || box.left >= innerWidth || box.top >= innerHeight) continue;
      measured++;
      sample(node, match[0], box);
    }
    const samples = [...groups.values()].flatMap((group) => [...group.values()].sort((a, b) => b.count - a.count).slice(0, 3));
    const hasHeading = samples.some((item) => item.role === "heading");
    const hasBrandButton = samples.some((item) => item.role === "primaryButton" && chromatic(item.background));
    const hasSurface = samples.some((item) => ["card", "dialog", "popover"].includes(item.role) && item.background);
    const confidence = { typography: hasHeading ? 0.85 : 0.5, primary: variables.primary ? 0.95 : hasBrandButton ? 0.8 : 0.3, surfaces: hasSurface ? 0.85 : 0.5 };
    const provenance = {
      typography: hasHeading ? "heading" : "page",
      primary: variables.primary ? "variable" : hasBrandButton ? "button" : "default",
      surfaces: hasSurface ? "component" : "page"
    };
    return { evidence: { version: 2, samples, variables, confidence, provenance } };
  }
  async function processPendingSdkTasks(apiBase, siteId) {
    var _a, _b;
    if (!apiBase || !siteId || typeof fetch === "undefined") return;
    try {
      const page = new URL(window.location.href);
      const captureToken = page.searchParams.get("movcues_theme_capture");
      const explicit = captureToken && /^themec_[A-Za-z0-9_-]{32}$/.test(captureToken) ? captureToken : null;
      if (explicit) {
        page.searchParams.delete("movcues_theme_capture");
        try {
          history.replaceState(history.state, "", page);
        } catch {
        }
      }
      const query = `sdkVerification=${Date.now()}${explicit ? `&themeCapture=${encodeURIComponent(explicit)}` : ""}`;
      const configResponse = await fetch(
        `${apiBase}/public/config/${encodeURIComponent(siteId)}?${query}`,
        { credentials: "omit", cache: "no-store" }
      );
      if (!configResponse.ok) return;
      const config = await configResponse.json();
      const verificationId = (_a = config.sdkVerification) == null ? void 0 : _a.id;
      if (typeof verificationId === "string" && verificationId) await fetch(`${apiBase}/public/sites/${encodeURIComponent(siteId)}/sdk-verifications/${encodeURIComponent(verificationId)}/ack`, { method: "POST", credentials: "omit", keepalive: true });
      const captureId = (_b = config.themeCapture) == null ? void 0 : _b.id;
      if (typeof captureId === "string" && captureId && (!explicit || captureId === explicit)) {
        const payload = await collectDesignEvidence();
        await fetch(`${apiBase}/public/sites/${encodeURIComponent(siteId)}/theme-captures/${encodeURIComponent(captureId)}`, { method: "POST", credentials: "omit", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
    } catch {
    }
  }
  class Analytics {
    constructor(runtimeProviders = {}) {
      this.runtimeProviders = runtimeProviders;
      this.routeObserver = new RouteObserver();
      this.activityMonitor = null;
      this.experiences = null;
      this.pendingExperienceLaunches = [];
      this.deliveryRefreshPending = false;
      this.deliveryRefreshRunning = false;
      this.deliveredTriggers = /* @__PURE__ */ new Set();
      this.deliveryIdentityGeneration = 0;
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
        (msg, ...args) => this.log(msg, ...args),
        (events) => this.onEventsDelivered(events)
      );
      this.engine = new AutoCaptureEngine(this.config);
      this.activityMonitor = new SessionActivityMonitor(this.session);
      this.wireCollectorsToPipeline();
      this.initialized = true;
      this.log("initialized", { siteId: this.config.siteId });
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
      var _a, _b, _c;
      this.generation++;
      this.stop();
      this.routeObserver.stop();
      for (const unsub of this.unsubscribers) unsub();
      this.unsubscribers = [];
      (_a = this.queue) == null ? void 0 : _a.clear();
      (_b = this.experiences) == null ? void 0 : _b.destroy();
      this.experiences = null;
      this.pendingExperienceLaunches = [];
      this.deliveryRefreshPending = false;
      this.deliveredTriggers.clear();
      this.activityMonitor = null;
      (_c = this.editor) == null ? void 0 : _c.destroy();
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
      this.log(`event: ${name}`, properties);
    }
    identify(userId, attributes) {
      var _a, _b;
      if (!this.requireInit()) return;
      const previous = this.session.getIdentifiedUserId();
      this.session.identify(userId);
      if (previous !== userId) {
        this.deliveryIdentityGeneration++;
        this.deliveredTriggers.clear();
        (_b = (_a = this.experiences) == null ? void 0 : _a.resetContext) == null ? void 0 : _b.call(_a, previous === null);
      }
      const payload = { userId, traits: attributes };
      this.enqueueEvent("identify", payload);
      void this.refreshExperiencesAfterFlush();
      this.log(`identify: ${userId}`, attributes);
    }
    /** Clear the active identity and begin future activity as a new visitor. */
    reset() {
      var _a, _b;
      if (!this.requireInit()) return;
      this.session.reset();
      this.deliveryIdentityGeneration++;
      this.deliveredTriggers.clear();
      this.pendingExperienceLaunches = [];
      (_b = (_a = this.experiences) == null ? void 0 : _a.resetContext) == null ? void 0 : _b.call(_a);
      this.trackPageView();
      void this.refreshExperiencesAfterFlush();
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
      var _a, _b, _c;
      try {
        (_a = performance.mark) == null ? void 0 : _a.call(performance, "movcues:editor:start");
      } catch {
      }
      try {
        const useFastStart = !this.runtimeProviders.editor && !this.runtimeProviders.loadEditor;
        const exchangePromise = editorToken && useFastStart ? exchangeEditorSession(this.config.endpoint, editorToken) : null;
        const draftPromise = !editorToken && continuation && useFastStart ? prefetchEditorDraft(this.config.endpoint, continuation.session) : null;
        const runtimePromise = this.runtimeProviders.editor ? Promise.resolve(this.runtimeProviders.editor) : this.runtimeProviders.loadEditor ? this.runtimeProviders.loadEditor() : loadEditorRuntime(this.config.editorRuntimeBundleUrl);
        const [runtime, exchange, prefetchedDraft] = await Promise.all([
          runtimePromise,
          exchangePromise ?? Promise.resolve(null),
          draftPromise ?? Promise.resolve(null)
        ]);
        if (!this.initialized || generation !== this.generation) return;
        if (!runtime) {
          this.fallbackFromEditor(userConfig, generation);
          return;
        }
        const editor = runtime.createController(this.config.endpoint);
        let started = false;
        if (editorToken) {
          started = exchangePromise ? Boolean(exchange && editor.startAuthenticatedSession && await editor.startAuthenticatedSession(exchange.session, exchange.draft)) : await editor.start(editorToken);
        } else if (continuation) {
          started = prefetchedDraft && editor.resumeWithDraft ? await editor.resumeWithDraft(continuation, prefetchedDraft) : await editor.resume(continuation);
        }
        if (!this.initialized || generation !== this.generation) {
          editor.destroy();
          return;
        }
        if (started) {
          this.editor = editor;
          this.editorMode = true;
          try {
            (_b = performance.mark) == null ? void 0 : _b.call(performance, "movcues:editor:ready");
            (_c = performance.measure) == null ? void 0 : _c.call(performance, "movcues:editor:startup", "movcues:editor:start", "movcues:editor:ready");
          } catch {
          }
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
          (name) => this.event(name),
          this.config.geoAgent
        );
        await this.experiences.evaluate();
        for (const id of this.pendingExperienceLaunches.splice(0)) void ((_b = (_a = this.experiences).launchExperience) == null ? void 0 : _b.call(_a, id));
        void this.drainDeliveryRefresh();
      } catch {
      }
    }
    wireCollectorsToPipeline() {
      const bus = this.engine.bus;
      this.unsubscribers.push(
        bus.on("click", (p) => {
          if (!p.interactive) return;
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
        bus.on("rage_click", (p) => {
          this.enqueueEvent("rage_click", p);
          this.log("rage click detected", p);
        })
      );
      this.unsubscribers.push(
        bus.on("funnel", (p) => {
          this.enqueueEvent("funnel", p);
          this.log(`funnel step completed: ${p.funnelName} [${p.stepIndex}] (${p.status})`);
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
        this.engine.onRouteChange(location.pathname);
        this.trackPageView();
        (_a = this.experiences) == null ? void 0 : _a.onRouteChange();
        void this.refreshExperiencesAfterFlush();
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
      if (this.batcher && this.config.experiences.enabled) await this.batcher.flush();
    }
    onEventsDelivered(events) {
      if (!this.initialized || !this.config.experiences.enabled) return;
      for (const event of events) {
        if (event.anonymousId !== this.session.getAnonymousId() || event.sessionId !== this.session.getSessionId()) continue;
        if (event.type === "custom" && event.page.url === location.href && event.pageViewId === this.session.getPageViewId() && Date.now() - event.timestamp <= 3e4) {
          this.deliveredTriggers.add(event.payload.name);
          while (this.deliveredTriggers.size > 20) this.deliveredTriggers.delete(this.deliveredTriggers.values().next().value);
        }
        if (["identify", "custom", "page_view", "session_start"].includes(event.type)) this.deliveryRefreshPending = true;
      }
      void this.drainDeliveryRefresh();
    }
    async drainDeliveryRefresh() {
      var _a;
      if (this.deliveryRefreshRunning || !this.experiences) return;
      const generation = this.generation;
      this.deliveryRefreshRunning = true;
      try {
        while (this.initialized && generation === this.generation && this.experiences && this.deliveryRefreshPending) {
          this.deliveryRefreshPending = false;
          const identityGeneration = this.deliveryIdentityGeneration;
          const triggers = [...this.deliveredTriggers];
          this.deliveredTriggers.clear();
          await this.experiences.evaluate();
          for (const trigger of triggers) {
            if (generation !== this.generation || identityGeneration !== this.deliveryIdentityGeneration || !this.initialized) break;
            await ((_a = this.experiences) == null ? void 0 : _a.evaluate(trigger));
          }
        }
      } catch {
      } finally {
        this.deliveryRefreshRunning = false;
        if (generation !== this.generation && this.deliveryRefreshPending) void this.drainDeliveryRefresh();
      }
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
  }
  function isDoNotTrackEnabled() {
    const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    return dnt === "1" || dnt === "yes";
  }
  function installUnloadHandlers(analytics2) {
    const flush = () => analytics2.flushOnUnload();
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
    "reset",
    "page",
    "defineFunnel",
    "launchExperience",
    "enableDebug",
    "disableDebug"
  ];
  function installPublicAPI(globalNames) {
    const w = window;
    for (const name of globalNames) {
      const existing = w[name];
      if (existing && "__analyticsInstance" in existing) return existing.__analyticsInstance;
    }
    const analytics2 = new Analytics();
    const realApi = {
      init: (...args) => analytics2.init(args[0]),
      start: () => analytics2.start(),
      stop: () => analytics2.stop(),
      destroy: () => analytics2.destroy(),
      event: (...args) => analytics2.event(args[0], args[1]),
      identify: (...args) => analytics2.identify(args[0], args[1]),
      reset: () => analytics2.reset(),
      page: () => analytics2.page(),
      defineFunnel: (...args) => analytics2.defineFunnel(args[0], args[1]),
      launchExperience: (...args) => analytics2.launchExperience(args[0]),
      enableDebug: () => analytics2.enableDebug(),
      disableDebug: () => analytics2.disableDebug()
    };
    for (const name of globalNames) {
      const existingStub = w[name];
      const queuedCommands = (existingStub == null ? void 0 : existingStub.q) ?? [];
      const finalApi = realApi;
      finalApi.__analyticsInstance = analytics2;
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
    installUnloadHandlers(analytics2);
    return analytics2;
  }
  function autoInitializeFromScript(analytics2, script) {
    var _a, _b;
    const siteId = (_a = script == null ? void 0 : script.dataset.siteId) == null ? void 0 : _a.trim();
    if (!siteId) return;
    analytics2.init({
      siteId,
      endpoint: ((_b = script == null ? void 0 : script.dataset.endpoint) == null ? void 0 : _b.trim()) || void 0
    });
  }
  const analytics = installPublicAPI(["__myAnalytics__", "analytics"]);
  autoInitializeFromScript(analytics, currentScriptElement);
})();
//# sourceMappingURL=sdk.js.map
