import { SensitiveElementDetector } from "../../privacy/SensitiveElementDetector";
import { computeElementRole } from "../../dom/ElementLabeler";
import { isMovcuesSurface } from "./ElementPicker";
import { TargetSelectorGenerator } from "./TargetSelectorGenerator";
import type { CapturedGuideTarget } from "./GuideCaptureTypes";

const selector = new TargetSelectorGenerator();
const privateElement = new SensitiveElementDetector();
const editable = "[contenteditable]:not([contenteditable=false])";
const explicitlyPrivate = "[data-movcues-private],input[type=password],input[type=hidden],[autocomplete=current-password],[autocomplete=new-password],[autocomplete=one-time-code]";
const interactive = `button,input,select,textarea,a[href],[role=button],[role=link],[role=checkbox],[role=tab],[role=switch],${editable}`;

export function captureTargetFor(node: EventTarget | null): Element | null {
  if (!(node instanceof Element) || isMovcuesSurface(node) || node.closest(explicitlyPrivate) || privateElement.isWithinPrivateSubtree(node)) return null;
  const target = node.closest(interactive) ?? node;
  return target === document.body || target === document.documentElement ? null : target;
}

export function guideCapturePath(url: Pick<Location, "pathname" | "hash"> = location): string | null {
  // Treat only slash-prefixed fragments as routes. Query strings often carry credentials.
  const hash = url.hash.split("?")[0];
  const path = `${url.pathname}${hash.startsWith("#/") ? hash : ""}`;
  if (path.length > 350 || !/^\/(?!\/)[a-z0-9/_~.%+-]*(?:#\/[a-z0-9/_~.%+-]*)?$/i.test(path)) return null;
  if (/%(?![\da-f]{2})|%(?:25|2f|3f|23|40|5c)|[a-f\d]{24,}|[\da-z_-]{40,}|(?:^|[\/_-])(?:token|secret|password|credential)(?:[\/_-]|$)/i.test(path)) return null;
  return path;
}

function allowSelectorAttribute(attribute: string, value: string): boolean {
  return attribute !== "href" && attribute !== "aria-label" && /^[a-z_][\w-]{0,30}$/i.test(value)
    && !/token|secret|credential|password|session[_-]?id|\d{4,}/i.test(value);
}

function labelText(element: Element): string | undefined {
  if (isMovcuesSurface(element) || privateElement.isWithinPrivateSubtree(element) || element.closest(editable) || element.matches("input,select,textarea")) return undefined;
  const nodes = Array.from(element.childNodes);
  if (element.matches("button,a[href],[role=button],[role=link],label")) {
    return nodes.map(node => node instanceof Element
      ? node.matches("span,strong,em") ? labelText(node) : ""
      : node.nodeType === Node.TEXT_NODE ? node.textContent : "").filter(Boolean).join(" ");
  }
  return nodes.filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(" ");
}

function safeLabel(text?: string | null): string | undefined {
  const value = text?.replace(/\s+/g, " ").trim();
  if (!value || value.length > 100 || /[@<>\u0000-\u001f]|https?:|\d{4,}|[\da-z_-]{32,}/i.test(value)) return undefined;
  return value;
}

export function describeCaptureTarget(element: Element, id: string, pagePath: string): CapturedGuideTarget {
  const generated = selector.generate(element, allowSelectorAttribute);
  const tagName = element.tagName.toLowerCase();
  const role = computeElementRole(element)?.split(":")[0];
  const formControl = element.matches(`input,textarea,select,${editable}`);
  const submit = element instanceof HTMLButtonElement && element.type === "submit" && element.form
    || element instanceof HTMLInputElement && element.type === "submit";
  const ordinaryLabel = safeLabel(element.getAttribute("aria-label")) ?? safeLabel(labelText(element));
  const label = submit ? safeLabel(`Submit: ${ordinaryLabel ?? "form"}`) ?? "Submit form"
    : ordinaryLabel ?? (formControl ? "Field" : undefined);
  if (generated.primarySelector.length > 240) throw new Error("This element has a long or unstable selector. Choose an element with a stable ID.");
  return {
    id,
    target: {
      ...generated,
      fallbackSelectors: generated.fallbackSelectors.filter(value => value.length <= 240),
      tagName,
      role: role && /^[a-z-]{1,40}$/.test(role) ? role : undefined,
      label,
      targetContext: { pagePath },
    },
  };
}
