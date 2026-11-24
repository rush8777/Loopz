import { SensitiveElementDetector } from "../../privacy/SensitiveElementDetector";
import { computeElementRole } from "../../dom/ElementLabeler";
import { isMovcuesSurface } from "./ElementPicker";
import { TargetSelectorGenerator } from "./TargetSelectorGenerator";
import type { CaptureSemantics, CapturedGuideTarget } from "./GuideCaptureTypes";

const selector = new TargetSelectorGenerator();
const privateElement = new SensitiveElementDetector();
const editable = "[contenteditable]:not([contenteditable=false])";
const explicitlyPrivate = "[data-movcues-private],input[type=password],input[type=hidden],[autocomplete=current-password],[autocomplete=new-password],[autocomplete=one-time-code]";
const interactive = `button,input,select,textarea,a[href],[role=button],[role=link],[role=checkbox],[role=combobox],[role=tab],[role=switch],${editable}`;

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
  if (!value || value.length > 100 || /(?:\+?\d[\s().-]*){7,}/.test(value) || /[@<>\u0000-\u001f]|https?:|\d{4,}|[\da-z_-]{32,}/i.test(value)) return undefined;
  return value;
}

function safeElementText(element: Element | null): string | undefined {
  if (!element || element.closest(explicitlyPrivate) || privateElement.isWithinPrivateSubtree(element)) return undefined;
  return safeLabel(labelText(element));
}

function referenceText(element: Element, attribute: "aria-labelledby" | "aria-describedby"): string | undefined {
  const ids = (element.getAttribute(attribute) ?? "").trim().split(/\s+/).slice(0, 3);
  return safeLabel(ids.map(id => safeElementText(element.ownerDocument.getElementById(id))).filter(Boolean).join(" "));
}

function semanticContext(element: Element, submit: boolean): CaptureSemantics {
  const inputType = element instanceof HTMLInputElement ? element.type : undefined;
  const kind = submit ? "submit"
    : element.matches('a[href],[role="link"],[role="tab"]') ? "navigation"
    : element.matches('select,[role="combobox"],[aria-haspopup="listbox"]') ? "dropdown"
    : element.matches('input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="switch"]') ? "checkbox"
    : element.matches('button,input[type="button"],[role="button"]') ? "action"
    : element.matches(`input,textarea,${editable}`) ? "text_input" : "information";
  const section = element.closest("fieldset,section,[role='group'],form");
  const form = element.closest("form");
  return {
    kind,
    description: referenceText(element, "aria-describedby"),
    section: safeElementText(section?.querySelector(":scope > legend,:scope > h1,:scope > h2,:scope > h3") ?? null),
    form: form && !privateElement.isWithinPrivateSubtree(form) ? safeLabel(form.getAttribute("aria-label")) ?? referenceText(form, "aria-labelledby") : undefined,
    inputType,
    required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true" || undefined,
    disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true" || undefined,
  };
}

export function describeCaptureTarget(element: Element, id: string, pagePath: string): CapturedGuideTarget {
  const generated = selector.generate(element, allowSelectorAttribute);
  const tagName = element.tagName.toLowerCase();
  const role = computeElementRole(element)?.split(":")[0];
  const formControl = element.matches(`input,textarea,select,${editable}`);
  const submit = Boolean(element instanceof HTMLButtonElement && element.type === "submit" && element.form
    || element instanceof HTMLInputElement && element.type === "submit");
  const labels = "labels" in element ? (element as HTMLInputElement).labels : null;
  const associatedLabel = labels ? safeLabel(Array.from(labels).slice(0, 3).map(safeElementText).filter(Boolean).join(" ")) : undefined;
  const ordinaryLabel = referenceText(element, "aria-labelledby") ?? safeLabel(element.getAttribute("aria-label"))
    ?? associatedLabel ?? safeElementText(element) ?? (formControl ? safeLabel(element.getAttribute("placeholder")) : undefined);
  const label = submit ? safeLabel(`Submit: ${ordinaryLabel ?? "form"}`) ?? "Submit form"
    : ordinaryLabel ?? (formControl ? "Field" : undefined);
  if (generated.primarySelector.length > 240) throw new Error("This element has a long or unstable selector. Choose an element with a stable ID.");
  return {
    id,
    semantics: semanticContext(element, submit),
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
