/** Shared editor-only chrome. Workflows own their controls and keep popup DOM mounted. */
export class EditorDock {
  readonly host = document.createElement("div");
  readonly root = this.host.attachShadow({ mode: "open" });
  private frame: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private popup: string | null = null;
  private opener: HTMLElement | null = null;
  private observer: ResizeObserver | undefined;
  private exit: Animation | undefined;
  private modeMotion: Animation | undefined;

  constructor() {
    this.host.dataset.movcuesEditor = "";
    this.host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  }

  mount(styles: string, controls: string, popups: string): void {
    const existing = this.frame;
    const start = existing?.getBoundingClientRect();
    this.observer?.disconnect();
    this.popup = null;
    this.opener = null;
    if (!existing) {
      this.root.innerHTML = '<style data-dock-styles></style><div class="dock-frame" data-editor-dock><div class="dock-bar" role="region" aria-label="Movcues Live Editor"></div><div data-dock-popups></div></div>';
      this.frame = this.root.querySelector("[data-editor-dock]");
      this.bar = this.root.querySelector(".dock-bar");
      this.root.addEventListener("click", this.onClick);
      this.root.addEventListener("keydown", this.onKeyDown);
      document.addEventListener("pointerdown", this.onOutsidePress, true);
      window.addEventListener("resize", this.fit);
      window.visualViewport?.addEventListener("resize", this.fit);
      window.visualViewport?.addEventListener("scroll", this.fit);
    }
    this.root.querySelector("style")!.textContent = styles + DOCK_CSS;
    this.bar!.innerHTML = controls;
    this.root.querySelector("[data-dock-popups]")!.innerHTML = popups;
    if (start && this.frame) {
      this.frame.style.width = start.width + "px";
      this.frame.style.height = start.height + "px";
    }
    if (!this.host.isConnected) (document.body ?? document.documentElement).append(this.host);
    this.fit();
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this.bar!);
    }
  }

  get activePopup(): string | null { return this.popup; }

  setMode(mode: string): void {
    if (!this.frame || this.frame.dataset.dockMode === mode) return;
    const hadMode = Boolean(this.frame.dataset.dockMode);
    this.frame.dataset.dockMode = mode;
    this.modeMotion?.cancel();
    if (hadMode && this.bar?.animate && !this.reducedMotion()) {
      this.modeMotion = this.bar.animate([{ opacity: .72, translate: "0 2px" }, { opacity: 1, translate: "none" }], {
        duration: 200, easing: "cubic-bezier(.22,.75,.24,1)",
      });
    }
  }

  show(id: string | null, opener?: HTMLElement): void {
    if (id === this.popup) return;
    const previous = this.root.querySelector<HTMLElement>("[data-dock-popup][data-open]");
    const focusedInside = previous?.contains(this.root.activeElement) ?? false;
    if (focusedInside && id === null) this.opener?.focus({ preventScroll: true });
    this.popup = id;
    this.opener = opener ?? (id ? this.root.querySelector<HTMLElement>(`[data-open-popup="${id}"]:not([hidden])`) : null);
    this.root.querySelectorAll<HTMLElement>("[data-dock-popup]").forEach(panel => {
      const active = panel.dataset.dockPopup === id;
      panel.toggleAttribute("data-open", active);
      panel.inert = !active;
      panel.setAttribute("aria-hidden", String(!active));
    });
    this.root.querySelectorAll<HTMLElement>("[data-open-popup]").forEach(button => {
      button.setAttribute("aria-expanded", String(button.dataset.openPopup === id));
    });
    if (this.opener && focusedInside) this.opener.focus({ preventScroll: true });
  }

  private onClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLButtonElement>("[data-open-popup],[data-dismiss-popup]");
    if (!trigger) return;
    const id = trigger.dataset.openPopup;
    const next = !id || this.popup === id ? null : id;
    this.show(next, id ? trigger : undefined);
    if (next && event instanceof MouseEvent && event.detail === 0) {
      this.root.querySelector<HTMLElement>("[data-dock-popup][data-open] [data-dismiss-popup]")?.focus({ preventScroll: true });
    }
  };

  private onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).key !== "Escape" || !this.popup) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.show(null);
  };

  private onOutsidePress = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (path.includes(this.host)) return;
    if (this.popup === "settings" && path.some(node => node instanceof HTMLElement && node.matches("[data-movcues-experience],[data-movcues-checklist]"))) return;
    this.show(null);
  };

  private fit = (): void => {
    if (!this.frame) return;
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const offset = viewport?.offsetTop ?? 0;
    this.frame.style.setProperty("--dock-center", `${(viewport?.offsetLeft ?? 0) + width / 2}px`);
    this.frame.style.setProperty("--dock-offset", `${Math.max(0, window.innerHeight - offset - height)}px`);
    this.frame.style.setProperty("--dock-width", `${Math.max(0, width - 16)}px`);
    this.frame.style.setProperty("--dock-height", `${height}px`);
    this.measure();
  };

  private measure(): void {
    if (!this.bar || !this.frame) return;
    const { width, height } = this.bar.getBoundingClientRect();
    if (!width || !height) return;
    this.frame.style.width = width + "px";
    this.frame.style.height = height + "px";
  }

  private reducedMotion(): boolean {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  destroy(animate = false): void {
    this.observer?.disconnect();
    this.root.removeEventListener("click", this.onClick);
    this.root.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("pointerdown", this.onOutsidePress, true);
    window.removeEventListener("resize", this.fit);
    window.visualViewport?.removeEventListener("resize", this.fit);
    window.visualViewport?.removeEventListener("scroll", this.fit);
    this.exit?.cancel();
    this.modeMotion?.cancel();
    if (animate && this.frame?.animate && !this.reducedMotion()) {
      this.frame.inert = true;
      this.exit = this.frame.animate([{ opacity: 1 }, { opacity: 0, translate: "0 6px" }], { duration: 180, easing: "ease-in", fill: "forwards" });
      this.exit.finished.then(() => this.host.remove(), () => this.host.remove());
    } else this.host.remove();
  }
}

export function dockPopup(id: string, label: string, body: string, mark = "", role: "region" | "dialog" = "region"): string {
  return `<section class="dock-popup" id="movcues-dock-${id}" data-dock-popup="${id}" role="${role}" aria-label="${label}" aria-hidden="true" inert>
    <div class="dock-popup-heading"><strong>${mark}${label}</strong><button type="button" class="dock-button dock-icon" data-dismiss-popup aria-label="Close ${label}" title="Close">${dockIcon("close")}</button></div>
    ${body}
  </section>`;
}

export function dockTrigger(id: string, label: string, content: string, attrs = ""): string {
  return `<button type="button" class="dock-button" data-open-popup="${id}" aria-controls="movcues-dock-${id}" aria-expanded="false" aria-label="${label}" title="${label}" ${attrs}>${content}</button>`;
}

const glyphs = {
  close: '<path d="m6 6 8 8m0-8-8 8"/>',
  more: '<circle cx="4" cy="10" r=".9"/><circle cx="10" cy="10" r=".9"/><circle cx="16" cy="10" r=".9"/>',
  left: '<path d="m12 5-5 5 5 5"/>',
  right: '<path d="m8 5 5 5-5 5"/>',
  plus: '<path d="M10 5v10m-5-5h10"/>',
  edit: '<path d="m4 13-1 4 4-1L16 7l-3-3-9 9Zm7-7 3 3"/>',
  select: '<path d="m4 3 11 7-5 1.5L8 16 4 3Z"/>',
  navigate: '<path d="M6 10V5a1 1 0 0 1 2 0v4-6a1 1 0 1 1 2 0v6-5a1 1 0 0 1 2 0v5-3a1 1 0 0 1 2 0v6a5 5 0 0 1-5 5h-1c-2 0-3-2-5-5L2 10a1 1 0 0 1 1.5-1.2L6 11"/>',
  play: '<path d="M7 4.5 15 10l-8 5.5z"/>',
  undo: '<path d="M7 4 3 8l4 4M3 8h9a4 4 0 0 1 0 8"/>',
  restart: '<path d="M3 4v5h5M3.4 9a6.5 6.5 0 1 1 .4 4.5"/>',
  target: '<circle cx="10" cy="10" r="5.5"/><path d="M10 2v4m0 8v4M2 10h4m8 0h4"/>',
  layers: '<path d="m3 7 7-4 7 4-7 4-7-4Zm0 4 7 4 7-4M3 15l7 4 7-4"/>',
  check: '<path d="m4 10 4 4 8-8"/>',
  spark: '<path d="M10 2a8 8 0 0 0 8 8 8 8 0 0 0-8 8 8 8 0 0 0-8-8 8 8 0 0 0 8-8Z"/>',
} as const;

export function dockIcon(name: keyof typeof glyphs): string {
  return `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${glyphs[name]}</svg>`;
}

// GeoAvatar from the dashboard, rendered inline so the editor does not need React or a network asset.
export const geoDockMark = `<span class="dock-brand-mark" aria-hidden="true">
  <svg class="dock-geo-cube" viewBox="0 0 64 64" focusable="false">
    <path fill="#add8f5" d="M4.5 21c0-4 2-7 5.5-9l16.5-9.3a11 11 0 0 1 10.7 0L54 12c3.5 2 5.5 5 5.5 9v21.5c0 3.7-1.9 7-5.2 9l-16.9 9.7a11 11 0 0 1-10.8 0l-17-9.8a10.3 10.3 0 0 1-5.1-8.9Z"/>
    <path fill="#f8fbff" d="M7 16.2c.8-1.6 2-2.9 3.7-3.8l15.8-9.7a11 11 0 0 1 10.7 0L54 12c1.8 1 3.2 2.3 4.1 4L33.6 30.2a3.2 3.2 0 0 1-3.2 0Z"/>
    <path fill="#fff" d="M34.8 29.5 58 16.2c1 1.5 1.5 3 1.5 4.8v21.5c0 3.7-1.9 7-5.2 9l-16.9 9.7c-2.4 1.4-5.4-.3-5.4-3.1V34.4c0-2 1.1-3.9 2.8-4.9Z"/>
    <path fill="none" stroke="#0b365f" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" d="M4.5 21c0-4 2-7 5.5-9l16.5-9.3a11 11 0 0 1 10.7 0L54 12c3.5 2 5.5 5 5.5 9v21.5c0 3.7-1.9 7-5.2 9l-16.9 9.7a11 11 0 0 1-10.8 0l-17-9.8a10.3 10.3 0 0 1-5.1-8.9ZM6.1 16l23.4 13.7c1.5.9 3.4.9 5 0L57.9 16M32 31v26.1c0 2.6 1.2 4.4 3.1 4.7"/>
    <g class="dock-geo-gaze" fill="#0b365f">
      <ellipse cx="40" cy="39.4" rx="2.1" ry="2.8" transform="rotate(23 40 39.4)"/>
      <ellipse cx="50.8" cy="34.1" rx="2.1" ry="2.8" transform="rotate(23 50.8 34.1)"/>
    </g>
  </svg>
</span>`;

const DOCK_CSS = `
.dock-frame{--dock-ink:#172640;--dock-muted:#526480;--dock-accent:#275cdd;--dock-line:#e3eaf5;--dock-ease:cubic-bezier(.22,.75,.24,1);--dock-gap:10px;position:fixed;left:var(--dock-center,50%);bottom:calc(var(--dock-offset,0px) + max(16px,env(safe-area-inset-bottom)));transform:translateX(-50%);max-width:var(--dock-width,calc(100vw - 16px));border:1px solid #dce5f1;border-radius:15px;background:#fff;color:var(--dock-ink);box-shadow:0 12px 38px #13295120,0 2px 6px #13295114;box-sizing:content-box;pointer-events:none;font:500 12px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif;transition:width 230ms var(--dock-ease),height 230ms var(--dock-ease);animation:dock-enter 230ms var(--dock-ease)}
.dock-frame *{box-sizing:border-box}
.dock-bar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:5px;width:max-content;max-width:calc(var(--dock-width,100vw - 16px) - 2px);padding:6px;pointer-events:auto;border-radius:inherit}
.dock-group{display:flex;align-items:center;gap:2px;min-width:0}
.dock-group+.dock-group{border-inline-start:1px solid var(--dock-line);padding-inline-start:5px}
.dock-bar .dock-modes{gap:2px;padding:2px;border-radius:10px;background:#f1f5fb}
.dock-bar button,.dock-popup-heading button{display:inline-flex;justify-content:center;align-items:center;gap:5px;min-width:30px;height:33px;padding:0 7px;border:0;border-radius:8px;background:transparent;color:var(--dock-muted);font:inherit;font-weight:650;white-space:nowrap;cursor:pointer;transition:background 190ms ease,color 190ms ease,box-shadow 190ms ease,transform 100ms ease}
.dock-bar button:hover:not(:disabled),.dock-popup-heading button:hover{background:#edf3fe;color:#1d51bc}
.dock-bar button:active:not(:disabled),.dock-popup-heading button:active{transform:scale(.96)}
.dock-bar button:is([aria-pressed=true],[aria-expanded=true]){background:#e8f0ff;color:#1d51bc}
.dock-bar .dock-modes button{height:29px}
.dock-bar .dock-modes button[aria-pressed=true]{background:#fff;color:#204eb8;box-shadow:0 1px 4px #182d5026}
.dock-bar button[data-primary]{background:#2458d3;color:#fff;padding-inline:11px}
.dock-bar button[data-primary]:hover:not(:disabled){background:#1948ba;color:#fff}
.dock-bar button:disabled{opacity:.42;cursor:default}
.dock-bar button:focus-visible,.dock-popup-heading button:focus-visible{outline:2px solid #3674ff;outline-offset:1px}
.dock-frame svg{flex:none}
.dock-bar svg,.dock-popup-heading svg{width:16px;height:16px}
.dock-bar .dock-brand{color:#234caa;letter-spacing:-.02em;font-weight:750;gap:6px}
.dock-brand-mark{display:inline-grid;place-items:center;width:24px;height:24px;border:1px solid #d4e3ff;border-radius:8px;background:linear-gradient(145deg,#f0f5ff,#dce9ff);color:#275cdd}
.dock-frame[data-geo-thinking] .dock-geo-cube{animation:dock-geo-think 2.8s ease-in-out infinite}
.dock-frame[data-geo-thinking] .dock-geo-gaze{animation:dock-geo-scan 2.8s ease-in-out infinite}
.dock-chip{font-variant-numeric:tabular-nums}
.dock-bar .dock-status{padding-inline:7px;font:600 11px/1.2 ui-sans-serif,system-ui}
.dock-status::before,.dock-indicator::before{content:"";width:7px;height:7px;flex:none;border-radius:50%;background:#239166}
.dock-status[data-tone=busy]::before{animation:dock-pulse 1s ease-in-out infinite}
.dock-status[data-tone=busy]::before,.dock-indicator::before{background:#4076ed}
.dock-status[data-tone=warn]::before{background:#bf720c}
.dock-status[data-tone=error]::before{background:#c52d49}
.dock-indicator{display:inline-flex;gap:6px;align-items:center;padding-inline:6px;font-weight:680}
.dock-pop-body{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:10px 12px}
.dock-popup{position:absolute;z-index:1;left:50%;bottom:calc(100% + var(--dock-gap));transform:translate(-50%,6px) scale(.985);transform-origin:bottom center;display:flex;flex-direction:column;width:min(360px,var(--dock-width,calc(100vw - 16px)));max-height:min(435px,calc(var(--dock-height,100dvh) - 100% - 46px));border:1px solid #dce5f1;border-radius:15px;background:#fff;overflow:hidden;box-shadow:0 14px 38px #13295124,0 2px 7px #13295110;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 190ms ease,transform 220ms var(--dock-ease),visibility 0s linear 220ms}
.dock-popup[data-open]{opacity:1;visibility:visible;transform:translate(-50%,0) scale(1);pointer-events:auto;transition-delay:0s}
.dock-popup-heading{display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px;min-height:42px;padding:4px 8px 4px 13px;border-bottom:1px solid var(--dock-line)}
.dock-popup-heading strong{display:flex;align-items:center;gap:7px;font-size:13px;letter-spacing:-.015em}
.dock-popup-heading button{height:28px;min-width:28px;padding:0}
.dock-pop-body>p:first-child{margin-top:0}
.dock-frame [hidden]{display:none!important}
@keyframes dock-enter{from{opacity:0;translate:0 8px}}
@keyframes dock-pulse{50%{opacity:.48}}
@keyframes dock-geo-think{0%,100%{transform:none}24%{transform:perspective(90px) translateY(-1px) rotate(-8deg) rotateY(-13deg)}50%{transform:translateY(-2px) rotate(-2deg)}76%{transform:perspective(90px) translateY(-1px) rotate(6deg) rotateY(12deg)}}
@keyframes dock-geo-scan{0%,100%{transform:none}24%,34%{transform:translate(-2px,0)}65%,76%{transform:translate(1.5px,-1px)}}
@media(max-width:550px){.dock-frame{bottom:calc(var(--dock-offset,0px) + max(8px,env(safe-area-inset-bottom)));--dock-gap:7px}.dock-bar{gap:3px;padding:5px}.dock-bar button{min-width:29px;padding-inline:5px}.dock-wide-label{display:none}.dock-status-text{max-width:80px;overflow:hidden;text-overflow:ellipsis}.dock-bar .dock-brand{gap:3px}}
@media(prefers-reduced-motion:reduce){.dock-frame,.dock-frame *{animation:none!important;transition:none!important}}
`;
