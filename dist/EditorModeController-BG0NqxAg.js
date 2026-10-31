import { s as safeScopedBuilderCss, B as BUILDER_ALLOWED_TAGS, a as BUILDER_SURVEY_INPUT_TAGS, b as BUILDER_ALLOWED_ATTRIBUTES, c as builderImageUrlIsSafe, d as builderLinkUrlIsSafe, e as builderInputTypeIsSafe, C as ChecklistRenderer, f as surveyBranchErrors, g as computeElementRole, h as computeElementLabel, i as sanitizeBuilderHtml, j as getGuideStepPattern, k as guideStepRequiresTarget, l as guideStepConfigurationErrors, E as ExperienceRenderer, R as RouteObserver, m as clearEditorContinuation, n as isChecklistDefinition, o as isGuideDefinition, p as guideInteractionTarget, q as matchesGuideRoute, r as findTarget, t as storeEditorContinuation } from "./module-Dlj9p7uW.js";
class EditorHistory {
  constructor(keyOf = JSON.stringify) {
    this.keyOf = keyOf;
    this.entries = [];
    this.index = -1;
    this.coalescing = false;
  }
  endGroup() {
    this.coalescing = false;
  }
  reset(value) {
    this.coalescing = false;
    this.entries = [];
    this.index = -1;
    this.record(value);
  }
  record(value, coalesce = false) {
    var _a;
    const key = this.keyOf(value);
    if (((_a = this.entries[this.index]) == null ? void 0 : _a.key) === key) {
      this.entries[this.index].value = structuredClone(value);
      if (!coalesce) this.coalescing = false;
      return;
    }
    if (coalesce && this.coalescing && this.index > 0 && this.index === this.entries.length - 1) {
      this.entries[this.index] = { value: structuredClone(value), key };
      return;
    }
    this.coalescing = coalesce;
    this.entries.splice(this.index + 1);
    this.entries.push({ value: structuredClone(value), key });
    while (this.entries.length > 50 || this.entries.length > 1 && this.entries.reduce((bytes, entry) => bytes + entry.key.length * 2, 0) > 8e6) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  canUndo() {
    return this.index > 0;
  }
  canRedo() {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }
  undo() {
    this.coalescing = false;
    return this.canUndo() ? structuredClone(this.entries[--this.index].value) : void 0;
  }
  redo() {
    this.coalescing = false;
    return this.canRedo() ? structuredClone(this.entries[++this.index].value) : void 0;
  }
}
const SOURCE_EDITABILITY = {
  version: 1,
  maxDepth: 8,
  maxNodes: 120,
  containers: ["div", "section", "header"],
  components: ["h1", "h2", "h3", "h4", "p", "span", "label", "a", "ul", "ol", "button", "img", "hr"],
  inline: ["span", "strong", "em", "u", "a", "br", "ul", "ol", "li"]
};
const idPattern = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const layouts = new Set(SOURCE_EDITABILITY.containers);
const components = new Set(SOURCE_EDITABILITY.components);
const inline = new Set(SOURCE_EDITABILITY.inline);
function sourceComponentKind(element) {
  const a = element.attrs, role = a["data-movcues-checklist-role"];
  if (a["data-movcues-block-id"] && element.children.some((child) => child.attrs["data-movcues-checklist-role"] || child.attrs["data-movcues-survey-controls"])) return "protected";
  if (a["data-movcues-question-id"] || "data-movcues-survey-controls" in a || a["data-movcues-checklist-item-id"] || role && !["root", "items"].includes(role)) return "protected";
  if (a["data-movcues-block-id"] || !layouts.has(element.tag)) return "component";
  return "layout";
}
function sourceEditabilityErrors(root2, previous, questions) {
  var _a;
  const errors = [], ids = /* @__PURE__ */ new Set();
  let count = 0;
  const visit = (element, depth, parent) => {
    if (++count > SOURCE_EDITABILITY.maxNodes || depth > SOURCE_EDITABILITY.maxDepth) {
      errors.push("Editable source exceeds 120 components or 8 layout levels.");
      return;
    }
    const kind = sourceComponentKind(element), a = element.attrs;
    for (const key of ["data-movcues-node-id", "data-movcues-block-id"]) {
      if (!(key in a)) continue;
      if (!idPattern.test(a[key]) || ids.has(a[key])) errors.push(`Invalid or duplicate visual ID: ${a[key] || "(empty)"}.`);
      ids.add(a[key]);
    }
    const required = kind === "layout" ? "data-movcues-node-id" : "data-movcues-block-id";
    if (!a[required]) errors.push(`${element.tag} needs ${required} for live editing.`);
    if (kind !== "layout" && !a["data-movcues-node-id"] && !((parent == null ? void 0 : parent.attrs["data-movcues-node-id"]) && parent.children.length === 1 && sourceComponentKind(parent) === "layout")) errors.push(`Component ${a[required] ?? element.tag} needs a node ID or a dedicated layout wrapper.`);
    if (kind === "layout") {
      if (!layouts.has(element.tag) || element.text.trim()) errors.push(`Layout ${a[required] ?? element.tag} has ambiguous mixed text; wrap text in a component.`);
      element.children.forEach((child) => visit(child, depth + 1, element));
    } else if (kind === "component") {
      if (!components.has(element.tag) && !layouts.has(element.tag)) errors.push(`Unsupported editable component: ${element.tag}.`);
      const checkInline = (child) => {
        if (!inline.has(child.tag) || child.attrs["data-movcues-node-id"] || child.attrs["data-movcues-block-id"] || child.attrs["data-movcues-action-id"]) errors.push(`Component ${a[required]} contains a nested component; use a layout container.`);
        child.children.forEach(checkInline);
      };
      element.children.forEach(checkInline);
    }
  };
  if (!root2.attrs["data-movcues-node-id"] || sourceComponentKind(root2) !== "layout") errors.push("The widget root needs a layout node ID, without a block ID.");
  visit(root2, 0);
  if ((previous == null ? void 0 : previous.attrs["data-movcues-node-id"]) && root2.attrs["data-movcues-node-id"] !== previous.attrs["data-movcues-node-id"]) errors.push("The surviving widget root must preserve its node ID.");
  const all = (element) => {
    const result2 = [], pending = [element];
    while (pending.length) {
      const next = pending.pop();
      result2.push(next);
      pending.push(...next.children.slice().reverse());
    }
    return result2;
  };
  const visual = all(root2).flatMap((element) => [element.attrs["data-movcues-node-id"], element.attrs["data-movcues-block-id"]].filter(Boolean));
  const functionalIds = all(root2).flatMap((element) => [element.attrs["data-movcues-action-id"], element.attrs["data-movcues-question-id"], element.attrs["data-movcues-checklist-item-id"]].filter(Boolean));
  if (visual.some((id) => !idPattern.test(id) || functionalIds.includes(id))) errors.push("Visual IDs must be valid and distinct from functional action/question/task IDs.");
  for (const element of all(root2)) {
    const a = element.attrs, widgetType = root2.attrs["data-movcues-widget-type"];
    if (Object.keys(a).some((key) => key.startsWith("data-movcues-checklist")) && widgetType !== "checklist") errors.push("Checklist markers are only valid in a Checklist.");
    if (Object.keys(a).some((key) => key.startsWith("data-movcues-question") || key.startsWith("data-movcues-survey") || key === "data-movcues-option-id") && widgetType !== "survey") errors.push("Survey markers are only valid in a Survey.");
    if (a["data-movcues-checklist-role"] && !["root", "title", "description", "items", "item", "progress", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge", "collapse", "dismiss"].includes(a["data-movcues-checklist-role"])) errors.push("Unknown protected Checklist role.");
  }
  if (new Set(visual).size !== visual.length) errors.push("Source contains duplicate visual IDs, including protected components.");
  if (questions) {
    const elements = all(root2), groups = elements.filter((element) => element.attrs["data-movcues-question-id"]);
    if (groups.length !== questions.length) errors.push("Survey questions must match the canonical question identities exactly.");
    for (const question of questions) {
      const group = groups.find((element) => element.attrs["data-movcues-question-id"] === question.id);
      if (!group) continue;
      const descendants = all(group);
      if (question.type === "short_text" || question.type === "long_text") {
        const inputs = descendants.filter((element) => "data-movcues-question-input" in element.attrs);
        if (inputs.length !== 1 || inputs[0].tag !== (question.type === "short_text" ? "input" : "textarea") || inputs[0].attrs.maxlength !== String(question.maxLength ?? 1e4) || Boolean(inputs[0].attrs["aria-required"] === "true") !== Boolean(question.required)) errors.push(`Question ${question.id} must preserve its canonical text input, limit and required state.`);
      } else {
        const expected = question.type === "nps" ? Array.from({ length: 11 }, (_, index) => String(index)) : question.type === "rating" && question.min !== void 0 && question.max !== void 0 ? Array.from({ length: question.max - question.min + 1 }, (_, index) => String(index + question.min)) : (_a = question.options) == null ? void 0 : _a.map((option) => option.id);
        const options = descendants.filter((element) => element.attrs["data-movcues-option-id"]);
        if (expected && (options.length !== expected.length || expected.some((id) => options.filter((option) => option.tag === "button" && option.attrs["data-movcues-option-id"] === id).length !== 1))) errors.push(`Question ${question.id} must preserve its canonical answer options.`);
      }
    }
    for (const option of elements.filter((element) => element.attrs["data-movcues-option-id"])) if (!groups.some((group) => all(group).includes(option))) errors.push("Survey options must remain inside a canonical question.");
  }
  if (previous) {
    const next = all(root2), before = all(previous);
    const functionalKeys = ["data-movcues-question-id", "data-movcues-question-type", "data-movcues-question-input", "data-movcues-option-id", "data-movcues-survey-action", "data-movcues-survey-controls", "data-movcues-checklist-item-id", "data-movcues-checklist-role", "data-movcues-checklist-item-role", "data-movcues-checklist-view", "type", "maxlength"];
    const signature = (element) => ({ tag: element.tag, attrs: Object.fromEntries(functionalKeys.filter((key) => key in element.attrs).map((key) => [key, element.attrs[key]])), children: element.children.map(signature) });
    for (const element of before) {
      const a = element.attrs;
      const marker = ["data-movcues-question-id", "data-movcues-checklist-item-id", "data-movcues-survey-controls"].find((key) => key in a);
      if (marker) {
        const matches2 = next.filter((value) => value.attrs[marker] === a[marker]);
        if (matches2.length !== 1 || JSON.stringify(signature(matches2[0])) !== JSON.stringify(signature(element))) errors.push(`Protected ${marker} ${a[marker]} changed its functional structure.`);
      }
      const identity = a.id ? "id" : a["data-movcues-content"] ? "data-movcues-content" : marker;
      if (!identity) continue;
      const matches = next.filter((value) => value.attrs[identity] === a[identity]);
      if (matches.length !== 1) continue;
      for (const key of ["data-movcues-node-id", "data-movcues-block-id"]) if (a[key] && matches[0].attrs[key] !== a[key]) errors.push(`Surviving ${identity} ${a[identity]} must preserve ${key}=${a[key]}.`);
    }
  }
  return [...new Set(errors)];
}
function getDefaultExportFromCjs(x2) {
  return x2 && x2.__esModule && Object.prototype.hasOwnProperty.call(x2, "default") ? x2["default"] : x2;
}
function getAugmentedNamespace(n) {
  if (n.__esModule) return n;
  var f = n.default;
  if (typeof f == "function") {
    var a = function a2() {
      if (this instanceof a2) {
        return Reflect.construct(f, arguments, this.constructor);
      }
      return f.apply(this, arguments);
    };
    a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, "__esModule", { value: true });
  Object.keys(n).forEach(function(k) {
    var d = Object.getOwnPropertyDescriptor(n, k);
    Object.defineProperty(a, k, d.get ? d : {
      enumerable: true,
      get: function() {
        return n[k];
      }
    });
  });
  return a;
}
var picocolors_browser = { exports: {} };
var x = String;
var create = function() {
  return { isColorSupported: false, reset: x, bold: x, dim: x, italic: x, underline: x, inverse: x, hidden: x, strikethrough: x, black: x, red: x, green: x, yellow: x, blue: x, magenta: x, cyan: x, white: x, gray: x, bgBlack: x, bgRed: x, bgGreen: x, bgYellow: x, bgBlue: x, bgMagenta: x, bgCyan: x, bgWhite: x, blackBright: x, redBright: x, greenBright: x, yellowBright: x, blueBright: x, magentaBright: x, cyanBright: x, whiteBright: x, bgBlackBright: x, bgRedBright: x, bgGreenBright: x, bgYellowBright: x, bgBlueBright: x, bgMagentaBright: x, bgCyanBright: x, bgWhiteBright: x };
};
picocolors_browser.exports = create();
picocolors_browser.exports.createColors = create;
var picocolors_browserExports = picocolors_browser.exports;
const __viteBrowserExternal = {};
const __viteBrowserExternal$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: __viteBrowserExternal
}, Symbol.toStringTag, { value: "Module" }));
const require$$2 = /* @__PURE__ */ getAugmentedNamespace(__viteBrowserExternal$1);
let pico = picocolors_browserExports;
let terminalHighlight$1 = require$$2;
let CssSyntaxError$3 = class CssSyntaxError extends Error {
  constructor(message, line, column, source, file, plugin2) {
    super(message);
    this.name = "CssSyntaxError";
    this.reason = message;
    if (file) {
      this.file = file;
    }
    if (source) {
      this.source = source;
    }
    if (plugin2) {
      this.plugin = plugin2;
    }
    if (typeof line !== "undefined" && typeof column !== "undefined") {
      if (typeof line === "number") {
        this.line = line;
        this.column = column;
      } else {
        this.line = line.line;
        this.column = line.column;
        this.endLine = column.line;
        this.endColumn = column.column;
      }
    }
    this.setMessage();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CssSyntaxError);
    }
  }
  setMessage() {
    this.message = this.plugin ? this.plugin + ": " : "";
    this.message += this.file ? this.file : "<css input>";
    if (typeof this.line !== "undefined") {
      this.message += ":" + this.line + ":" + this.column;
    }
    this.message += ": " + this.reason;
  }
  showSourceCode(color) {
    if (!this.source) return "";
    let css = this.source;
    if (color == null) color = pico.isColorSupported;
    let aside = (text2) => text2;
    let mark = (text2) => text2;
    let highlight = (text2) => text2;
    if (color) {
      let { bold, gray, red } = pico.createColors(true);
      mark = (text2) => bold(red(text2));
      aside = (text2) => gray(text2);
      if (terminalHighlight$1) {
        highlight = (text2) => terminalHighlight$1(text2);
      }
    }
    let lines = css.split(/\r?\n/);
    let start = Math.max(this.line - 3, 0);
    let end = Math.min(this.line + 2, lines.length);
    let maxWidth = String(end).length;
    return lines.slice(start, end).map((line, index) => {
      let number = start + 1 + index;
      let gutter = " " + (" " + number).slice(-maxWidth) + " | ";
      if (number === this.line) {
        if (line.length > 160) {
          let padding = 20;
          let subLineStart = Math.max(0, this.column - padding);
          let subLineEnd = Math.max(
            this.column + padding,
            this.endColumn + padding
          );
          let subLine = line.slice(subLineStart, subLineEnd);
          let spacing2 = aside(gutter.replace(/\d/g, " ")) + line.slice(0, Math.min(this.column - 1, padding - 1)).replace(/[^\t]/g, " ");
          return mark(">") + aside(gutter) + highlight(subLine) + "\n " + spacing2 + mark("^");
        }
        let spacing = aside(gutter.replace(/\d/g, " ")) + line.slice(0, this.column - 1).replace(/[^\t]/g, " ");
        return mark(">") + aside(gutter) + highlight(line) + "\n " + spacing + mark("^");
      }
      return " " + aside(gutter) + highlight(line);
    }).join("\n");
  }
  toString() {
    let code = this.showSourceCode();
    if (code) {
      code = "\n\n" + code + "\n";
    }
    return this.name + ": " + this.message + code;
  }
};
var cssSyntaxError = CssSyntaxError$3;
CssSyntaxError$3.default = CssSyntaxError$3;
const STYLE_TAG = /(<)(\/?style\b)/gi;
const COMMENT_OPEN = /(<)(!--)/g;
const AT_NAME_END = /[\t\n\f\r "#'()/;[\\\]{}]/;
function escapeHTMLInCSS(str) {
  if (typeof str !== "string") return str;
  if (!str.includes("<")) return str;
  return str.replace(STYLE_TAG, "\\3c $2").replace(COMMENT_OPEN, "\\3c $2");
}
const DEFAULT_RAW = {
  after: "\n",
  beforeClose: "\n",
  beforeComment: "\n",
  beforeDecl: "\n",
  beforeOpen: " ",
  beforeRule: "\n",
  colon: ": ",
  commentLeft: " ",
  commentRight: " ",
  emptyBody: "",
  indent: "    ",
  semicolon: false
};
function capitalize$1(str) {
  return str[0].toUpperCase() + str.slice(1);
}
function atruleStart(str, node2) {
  let name = "@" + node2.name;
  let params = node2.params ? str.rawValue(node2, "params") : "";
  let afterName = node2.raws.afterName;
  if (typeof afterName === "undefined") {
    afterName = params ? " " : "";
  } else if (afterName === "" && params && !AT_NAME_END.test(params[0])) {
    afterName = " ";
  }
  return name + afterName + params;
}
function pushBody(str, stack, node2) {
  let nodes = node2.nodes;
  let last = nodes.length - 1;
  while (last > 0) {
    if (nodes[last].type !== "comment") break;
    last -= 1;
  }
  let semicolon = str.raw(node2, "semicolon");
  let isDocument = node2.type === "document";
  for (let i = nodes.length - 1; i >= 0; i--) {
    let child = nodes[i];
    let childSemicolon = last !== i || semicolon;
    if (!childSemicolon && i < nodes.length - 1 && (child.type === "atrule" && !child.nodes || child.type === "decl" && child.prop.startsWith("--"))) {
      childSemicolon = true;
    }
    stack.push({
      document: isDocument,
      node: child,
      semicolon: childSemicolon
    });
  }
}
function pushBlock(str, stack, node2, start) {
  let between = str.raw(node2, "between", "beforeOpen");
  str.builder(escapeHTMLInCSS(start + between) + "{", node2, "start");
  let hasNodes = node2.nodes && node2.nodes.length;
  let close = () => {
    let after = hasNodes ? str.raw(node2, "after") : str.raw(node2, "after", "emptyBody");
    if (after) str.builder(escapeHTMLInCSS(after));
    str.builder("}", node2, "end");
    if (node2.type === "rule" && node2.raws.ownSemicolon) {
      str.builder(escapeHTMLInCSS(node2.raws.ownSemicolon), node2, "end");
    }
  };
  if (hasNodes) {
    stack.push(close);
    pushBody(str, stack, node2);
  } else {
    close();
  }
}
let Stringifier$2 = class Stringifier {
  constructor(builder) {
    this.builder = builder;
  }
  atrule(node2, semicolon) {
    let start = atruleStart(this, node2);
    if (node2.nodes) {
      this.block(node2, start);
    } else {
      let end = (node2.raws.between || "") + (semicolon ? ";" : "");
      this.builder(escapeHTMLInCSS(start + end), node2);
    }
  }
  beforeAfter(node2, detect) {
    let value;
    if (node2.type === "decl") {
      value = this.raw(node2, null, "beforeDecl");
    } else if (node2.type === "comment") {
      value = this.raw(node2, null, "beforeComment");
    } else if (detect === "before") {
      value = this.raw(node2, null, "beforeRule");
    } else {
      value = this.raw(node2, null, "beforeClose");
    }
    let buf = node2.parent;
    let depth = 0;
    while (buf && buf.type !== "root") {
      depth += 1;
      buf = buf.parent;
    }
    if (value.includes("\n")) {
      let indent = this.raw(node2, null, "indent");
      if (indent.length) {
        for (let step = 0; step < depth; step++) value += indent;
      }
    }
    return value;
  }
  block(node2, start) {
    let between = this.raw(node2, "between", "beforeOpen");
    this.builder(escapeHTMLInCSS(start + between) + "{", node2, "start");
    let after;
    if (node2.nodes && node2.nodes.length) {
      this.body(node2);
      after = this.raw(node2, "after");
    } else {
      after = this.raw(node2, "after", "emptyBody");
    }
    if (after) this.builder(escapeHTMLInCSS(after));
    this.builder("}", node2, "end");
  }
  body(node2) {
    let proto = Stringifier.prototype;
    let expandable = ["atrule", "block", "body", "rule", "stringify"].every(
      (method) => this[method] === proto[method]
    );
    let stack = [];
    pushBody(this, stack, node2);
    while (stack.length > 0) {
      let entry = stack.pop();
      if (typeof entry === "function") {
        entry();
        continue;
      }
      let child = entry.node;
      let before = this.raw(child, "before");
      if (before) {
        this.builder(entry.document ? before : escapeHTMLInCSS(before));
      }
      if (expandable && child.type === "rule") {
        pushBlock(this, stack, child, this.rawValue(child, "selector"));
      } else if (expandable && child.type === "atrule" && child.nodes) {
        pushBlock(this, stack, child, atruleStart(this, child));
      } else {
        this.stringify(child, entry.semicolon);
      }
    }
  }
  comment(node2) {
    let left = this.raw(node2, "left", "commentLeft");
    let right = this.raw(node2, "right", "commentRight");
    this.builder(escapeHTMLInCSS("/*" + left + node2.text + right + "*/"), node2);
  }
  decl(node2, semicolon) {
    let raws = node2.raws;
    let between = this.raw(node2, "between", "colon");
    let string = node2.prop + between + this.rawValue(node2, "value");
    if (node2.important) {
      string += raws.important || " !important";
    }
    if (semicolon) string += ";";
    this.builder(escapeHTMLInCSS(string), node2);
  }
  document(node2) {
    this.body(node2);
  }
  raw(node2, own, detect) {
    let value;
    if (!detect) detect = own;
    if (own) {
      value = node2.raws[own];
      if (typeof value !== "undefined") return value;
    }
    let parent = node2.parent;
    if (detect === "before") {
      if (!parent || parent.type === "root" && parent.first === node2) {
        return "";
      }
      if (parent && parent.type === "document") {
        return "";
      }
    }
    if (!parent) return DEFAULT_RAW[detect];
    let root2 = node2.root();
    let cache = root2.rawCache || (root2.rawCache = {});
    if (typeof cache[detect] !== "undefined") {
      return cache[detect];
    }
    if (detect === "before" || detect === "after") {
      return this.beforeAfter(node2, detect);
    } else {
      let method = "raw" + capitalize$1(detect);
      if (this[method]) {
        value = this[method](root2, node2);
      } else {
        root2.walk((i) => {
          value = i.raws[own];
          if (typeof value !== "undefined") return false;
        });
      }
    }
    if (typeof value === "undefined") value = DEFAULT_RAW[detect];
    cache[detect] = value;
    return value;
  }
  rawBeforeClose(root2) {
    let value;
    root2.walk((i) => {
      if (i.nodes && i.nodes.length > 0) {
        if (typeof i.raws.after !== "undefined") {
          value = i.raws.after;
          if (value.includes("\n")) {
            value = value.replace(/[^\n]+$/, "");
          }
          return false;
        }
      }
    });
    if (value) value = value.replace(/\S/g, "");
    return value;
  }
  rawBeforeComment(root2, node2) {
    let value;
    root2.walkComments((i) => {
      if (typeof i.raws.before !== "undefined") {
        value = i.raws.before;
        if (value.includes("\n")) {
          value = value.replace(/[^\n]+$/, "");
        }
        return false;
      }
    });
    if (typeof value === "undefined") {
      value = this.raw(node2, null, "beforeDecl");
    } else if (value) {
      value = value.replace(/\S/g, "");
    }
    return value;
  }
  rawBeforeDecl(root2, node2) {
    let value;
    root2.walkDecls((i) => {
      if (typeof i.raws.before !== "undefined") {
        value = i.raws.before;
        if (value.includes("\n")) {
          value = value.replace(/[^\n]+$/, "");
        }
        return false;
      }
    });
    if (typeof value === "undefined") {
      value = this.raw(node2, null, "beforeRule");
    } else if (value) {
      value = value.replace(/\S/g, "");
    }
    return value;
  }
  rawBeforeOpen(root2) {
    let value;
    root2.walk((i) => {
      if (i.type !== "decl") {
        value = i.raws.between;
        if (typeof value !== "undefined") return false;
      }
    });
    return value;
  }
  rawBeforeRule(root2) {
    let value;
    root2.walk((i) => {
      if (i.nodes && (i.parent !== root2 || root2.first !== i)) {
        if (typeof i.raws.before !== "undefined") {
          value = i.raws.before;
          if (value.includes("\n")) {
            value = value.replace(/[^\n]+$/, "");
          }
          return false;
        }
      }
    });
    if (value) value = value.replace(/\S/g, "");
    return value;
  }
  rawColon(root2) {
    let value;
    root2.walkDecls((i) => {
      if (typeof i.raws.between !== "undefined") {
        value = i.raws.between.replace(/[^\s:]/g, "");
        return false;
      }
    });
    return value;
  }
  rawEmptyBody(root2) {
    let value;
    root2.walk((i) => {
      if (i.nodes && i.nodes.length === 0) {
        value = i.raws.after;
        if (typeof value !== "undefined") return false;
      }
    });
    return value;
  }
  rawIndent(root2) {
    if (root2.raws.indent) return root2.raws.indent;
    let value;
    root2.walk((i) => {
      let p = i.parent;
      if (p && p !== root2 && p.parent && p.parent === root2) {
        if (typeof i.raws.before !== "undefined") {
          let parts = i.raws.before.split("\n");
          value = parts[parts.length - 1];
          value = value.replace(/\S/g, "");
          return false;
        }
      }
    });
    return value;
  }
  rawSemicolon(root2) {
    let value;
    root2.walk((i) => {
      if (i.nodes && i.nodes.length && i.last.type === "decl") {
        value = i.raws.semicolon;
        if (typeof value !== "undefined") return false;
      }
    });
    return value;
  }
  rawValue(node2, prop) {
    let value = node2[prop];
    let raw = node2.raws[prop];
    if (raw && raw.value === value) {
      return raw.raw;
    }
    return value;
  }
  root(node2) {
    if (node2.source && node2.source.input.hasBOM) {
      this.builder("\uFEFF", node2, "start");
    }
    this.body(node2);
    if (node2.raws.after) {
      let after = node2.raws.after;
      let isDocument = node2.parent && node2.parent.type === "document";
      this.builder(isDocument ? after : escapeHTMLInCSS(after));
    }
  }
  rule(node2) {
    this.block(node2, this.rawValue(node2, "selector"));
    if (node2.raws.ownSemicolon) {
      this.builder(escapeHTMLInCSS(node2.raws.ownSemicolon), node2, "end");
    }
  }
  stringify(node2, semicolon) {
    if (!this[node2.type]) {
      throw new Error(
        "Unknown AST node type " + node2.type + ". Maybe you need to change PostCSS stringifier."
      );
    }
    this[node2.type](node2, semicolon);
  }
};
var stringifier = Stringifier$2;
Stringifier$2.default = Stringifier$2;
let Stringifier$1 = stringifier;
function stringify$4(node2, builder) {
  let str = new Stringifier$1(builder);
  str.stringify(node2);
}
var stringify_1 = stringify$4;
stringify$4.default = stringify$4;
var symbols = {};
symbols.isClean = Symbol("isClean");
symbols.my = Symbol("my");
let CssSyntaxError$2 = cssSyntaxError;
let Stringifier2 = stringifier;
let stringify$3 = stringify_1;
let { isClean: isClean$2, my: my$3 } = symbols;
function cloneNode(obj, parent) {
  let cloned = new obj.constructor();
  let stack = [[obj, cloned, parent]];
  while (stack.length > 0) {
    let [source, target, targetParent] = stack.pop();
    for (let i in source) {
      if (!Object.prototype.hasOwnProperty.call(source, i)) {
        continue;
      }
      if (i === "proxyCache") continue;
      let value = source[i];
      let type = typeof value;
      if (i === "parent" && type === "object") {
        if (targetParent) target[i] = targetParent;
      } else if (i === "source") {
        target[i] = value;
      } else if (Array.isArray(value)) {
        let children = [];
        target[i] = children;
        for (let j of value) {
          let childClone = new j.constructor();
          children.push(childClone);
          stack.push([j, childClone, target]);
        }
      } else {
        if (type === "object" && value !== null) {
          let valueClone = new value.constructor();
          stack.push([value, valueClone, void 0]);
          value = valueClone;
        }
        target[i] = value;
      }
    }
  }
  return cloned;
}
function sourceOffset(inputCSS, position) {
  if (position && typeof position.offset !== "undefined") {
    return position.offset;
  }
  let column = 1;
  let line = 1;
  let offset = 0;
  for (let i = 0; i < inputCSS.length; i++) {
    if (line === position.line && column === position.column) {
      offset = i;
      break;
    }
    if (inputCSS[i] === "\n") {
      column = 1;
      line += 1;
    } else {
      column += 1;
    }
  }
  return offset;
}
let Node$5 = class Node2 {
  get proxyOf() {
    return this;
  }
  constructor(defaults = {}) {
    this.raws = {};
    this[isClean$2] = false;
    this[my$3] = true;
    for (let name of Object.keys(defaults)) {
      if (name === "__proto__") continue;
      if (name === "nodes") {
        this.nodes = [];
        for (let node2 of defaults[name]) {
          if (typeof node2.clone === "function" && node2.parent) {
            this.append(node2.clone());
          } else {
            this.append(node2);
          }
        }
      } else {
        this[name] = defaults[name];
      }
    }
  }
  addToError(error) {
    error.postcssNode = this;
    if (error.stack && this.source && /\n\s{4}at /.test(error.stack)) {
      let s = this.source;
      error.stack = error.stack.replace(
        /\n\s{4}at /,
        `$&${s.input.from}:${s.start.line}:${s.start.column}$&`
      );
    }
    return error;
  }
  after(add) {
    this.parent.insertAfter(this, add);
    return this;
  }
  assign(overrides = {}) {
    for (let name in overrides) {
      this[name] = overrides[name];
    }
    return this;
  }
  before(add) {
    this.parent.insertBefore(this, add);
    return this;
  }
  cleanRaws(keepBetween) {
    delete this.raws.before;
    delete this.raws.after;
    if (!keepBetween) delete this.raws.between;
  }
  clone(overrides = {}) {
    let cloned = cloneNode(this);
    for (let name in overrides) {
      cloned[name] = overrides[name];
    }
    return cloned;
  }
  cloneAfter(overrides = {}) {
    let cloned = this.clone(overrides);
    this.parent.insertAfter(this, cloned);
    return cloned;
  }
  cloneBefore(overrides = {}) {
    let cloned = this.clone(overrides);
    this.parent.insertBefore(this, cloned);
    return cloned;
  }
  error(message, opts = {}) {
    if (this.source) {
      let { end, start } = this.rangeBy(opts);
      return this.source.input.error(
        message,
        { column: start.column, line: start.line },
        { column: end.column, line: end.line },
        opts
      );
    }
    return new CssSyntaxError$2(message);
  }
  getProxyProcessor() {
    return {
      get(node2, prop) {
        if (prop === "proxyOf") {
          return node2;
        } else if (prop === "root") {
          return () => node2.root().toProxy();
        } else {
          return node2[prop];
        }
      },
      set(node2, prop, value) {
        if (node2[prop] === value) return true;
        node2[prop] = value;
        if (prop === "prop" || prop === "value" || prop === "name" || prop === "params" || prop === "important" || /* c8 ignore next */
        prop === "text") {
          node2.markDirty();
        }
        return true;
      }
    };
  }
  /* c8 ignore next 3 */
  markClean() {
    this[isClean$2] = true;
  }
  markDirty() {
    if (this[isClean$2]) {
      this[isClean$2] = false;
      let next = this;
      while (next = next.parent) {
        next[isClean$2] = false;
      }
    }
  }
  next() {
    if (!this.parent) return void 0;
    let index = this.parent.index(this);
    return this.parent.nodes[index + 1];
  }
  positionBy(opts = {}) {
    let inputString = "document" in this.source.input ? this.source.input.document : this.source.input.css;
    let pos = {
      column: this.source.start.column,
      line: this.source.start.line,
      offset: sourceOffset(inputString, this.source.start)
    };
    if (opts.index) {
      pos = this.positionInside(opts.index);
    } else if (opts.word) {
      let stringRepresentation = inputString.slice(
        sourceOffset(inputString, this.source.start),
        sourceOffset(inputString, this.source.end)
      );
      let index = stringRepresentation.indexOf(opts.word);
      if (index !== -1) pos = this.positionInside(index);
    }
    return pos;
  }
  positionInside(index) {
    let column = this.source.start.column;
    let line = this.source.start.line;
    let inputString = "document" in this.source.input ? this.source.input.document : this.source.input.css;
    let offset = sourceOffset(inputString, this.source.start);
    let end = offset + index;
    for (let i = offset; i < end; i++) {
      if (inputString[i] === "\n") {
        column = 1;
        line += 1;
      } else {
        column += 1;
      }
    }
    return { column, line, offset: end };
  }
  prev() {
    if (!this.parent) return void 0;
    let index = this.parent.index(this);
    return this.parent.nodes[index - 1];
  }
  rangeBy(opts = {}) {
    let inputString = "document" in this.source.input ? this.source.input.document : this.source.input.css;
    let start = {
      column: this.source.start.column,
      line: this.source.start.line,
      offset: sourceOffset(inputString, this.source.start)
    };
    let end = this.source.end ? {
      column: this.source.end.column + 1,
      line: this.source.end.line,
      offset: typeof this.source.end.offset === "number" ? (
        // `source.end.offset` is exclusive, so we don't need to add 1
        this.source.end.offset
      ) : (
        // Since line/column in this.source.end is inclusive,
        // the `sourceOffset(... , this.source.end)` returns an inclusive offset.
        // So, we add 1 to convert it to exclusive.
        sourceOffset(inputString, this.source.end) + 1
      )
    } : {
      column: start.column + 1,
      line: start.line,
      offset: start.offset + 1
    };
    if (opts.word) {
      let stringRepresentation = inputString.slice(
        sourceOffset(inputString, this.source.start),
        sourceOffset(inputString, this.source.end)
      );
      let index = stringRepresentation.indexOf(opts.word);
      if (index !== -1) {
        start = this.positionInside(index);
        end = this.positionInside(index + opts.word.length);
      }
    } else {
      if (opts.start) {
        start = {
          column: opts.start.column,
          line: opts.start.line,
          offset: sourceOffset(inputString, opts.start)
        };
      } else if (typeof opts.index === "number") {
        start = this.positionInside(opts.index);
      }
      if (opts.end) {
        end = {
          column: opts.end.column,
          line: opts.end.line,
          offset: sourceOffset(inputString, opts.end)
        };
      } else if (typeof opts.endIndex === "number") {
        end = this.positionInside(opts.endIndex);
      } else if (typeof opts.index === "number") {
        end = this.positionInside(opts.index + 1);
      }
    }
    if (end.line < start.line || end.line === start.line && end.column <= start.column) {
      end = {
        column: start.column + 1,
        line: start.line,
        offset: start.offset + 1
      };
    }
    return { end, start };
  }
  raw(prop, defaultType) {
    let str = new Stringifier2();
    return str.raw(this, prop, defaultType);
  }
  remove() {
    if (this.parent) {
      this.parent.removeChild(this);
    }
    this.parent = void 0;
    return this;
  }
  replaceWith(...nodes) {
    if (this.parent) {
      let bookmark = this;
      let foundSelf = false;
      for (let node2 of nodes) {
        if (node2 === this) {
          foundSelf = true;
        } else if (foundSelf) {
          this.parent.insertAfter(bookmark, node2);
          bookmark = node2;
        } else {
          this.parent.insertBefore(bookmark, node2);
        }
      }
      if (!foundSelf) {
        this.remove();
      }
    }
    return this;
  }
  root() {
    let result2 = this;
    while (result2.parent && result2.parent.type !== "document") {
      result2 = result2.parent;
    }
    return result2;
  }
  toJSON(_, inputs) {
    let emitInputs = inputs == null;
    inputs = inputs || /* @__PURE__ */ new Map();
    let holderOfRoot = [];
    let queue = [[this, holderOfRoot, 0]];
    for (let step = 0; step < queue.length; step++) {
      let [node2, holder, key] = queue[step];
      let fixed2 = {};
      holder[key] = fixed2;
      for (let name in node2) {
        if (!Object.prototype.hasOwnProperty.call(node2, name)) {
          continue;
        }
        if (name === "parent" || name === "proxyCache") continue;
        let value = node2[name];
        if (Array.isArray(value)) {
          let fixedArray = [];
          fixed2[name] = fixedArray;
          for (let i = 0; i < value.length; i++) {
            let item = value[i];
            if (typeof item === "object" && item.toJSON) {
              if (item.toJSON === Node2.prototype.toJSON) {
                queue.push([item, fixedArray, i]);
              } else {
                fixedArray[i] = item.toJSON(null, inputs);
              }
            } else {
              fixedArray[i] = item;
            }
          }
        } else if (typeof value === "object" && value.toJSON) {
          if (value.toJSON === Node2.prototype.toJSON) {
            queue.push([value, fixed2, name]);
          } else {
            fixed2[name] = value.toJSON(null, inputs);
          }
        } else if (name === "source") {
          if (value == null) continue;
          let inputId = inputs.get(value.input);
          if (inputId == null) {
            inputId = inputs.size;
            inputs.set(value.input, inputId);
          }
          fixed2[name] = {
            end: value.end,
            inputId,
            start: value.start
          };
        } else {
          fixed2[name] = value;
        }
      }
    }
    let fixed = holderOfRoot[0];
    if (emitInputs) {
      fixed.inputs = [...inputs.keys()].map((input2) => input2.toJSON());
    }
    return fixed;
  }
  toProxy() {
    if (!this.proxyCache) {
      this.proxyCache = new Proxy(this, this.getProxyProcessor());
    }
    return this.proxyCache;
  }
  toString(stringifier2 = stringify$3) {
    if (stringifier2.stringify) stringifier2 = stringifier2.stringify;
    let result2 = "";
    stringifier2(this, (i) => {
      result2 += i;
    });
    return result2;
  }
  warn(result2, text2, opts = {}) {
    let data = { node: this };
    for (let i in opts) data[i] = opts[i];
    return result2.warn(text2, data);
  }
};
var node = Node$5;
Node$5.default = Node$5;
let Node$4 = node;
let Comment$4 = class Comment extends Node$4 {
  constructor(defaults) {
    super(defaults);
    this.type = "comment";
  }
};
var comment = Comment$4;
Comment$4.default = Comment$4;
let Node$3 = node;
let Declaration$4 = class Declaration extends Node$3 {
  get variable() {
    return this.prop.startsWith("--") || this.prop[0] === "$";
  }
  constructor(defaults) {
    if (defaults && typeof defaults.value !== "undefined" && typeof defaults.value !== "string") {
      defaults = { ...defaults, value: String(defaults.value) };
    }
    super(defaults);
    this.type = "decl";
  }
};
var declaration = Declaration$4;
Declaration$4.default = Declaration$4;
let Comment$3 = comment;
let Declaration$3 = declaration;
let Node$2 = node;
let { isClean: isClean$1, my: my$2 } = symbols;
let AtRule$4, parse$6, Root$6, Rule$4;
function cleanSource(nodes) {
  let stack = nodes.slice();
  while (stack.length > 0) {
    let node2 = stack.pop();
    delete node2.source;
    if (node2.nodes) {
      node2.nodes = node2.nodes.slice();
      for (let i of node2.nodes) stack.push(i);
    }
  }
  return nodes.slice();
}
function markTreeDirty(node2) {
  let stack = [node2];
  while (stack.length > 0) {
    let next = stack.pop();
    next[isClean$1] = false;
    if (next.proxyOf.nodes) {
      for (let i of next.proxyOf.nodes) stack.push(i);
    }
  }
}
let Container$8 = class Container extends Node$2 {
  get first() {
    if (!this.proxyOf.nodes) return void 0;
    return this.proxyOf.nodes[0];
  }
  get last() {
    if (!this.proxyOf.nodes) return void 0;
    return this.proxyOf.nodes[this.proxyOf.nodes.length - 1];
  }
  append(...children) {
    for (let child of children) {
      let nodes = this.normalize(child, this.last);
      for (let node2 of nodes) this.proxyOf.nodes.push(node2);
    }
    this.markDirty();
    return this;
  }
  cleanRaws(keepBetween) {
    let stack = [this];
    while (stack.length > 0) {
      let node2 = stack.pop();
      if (node2 !== this && node2.cleanRaws !== Container.prototype.cleanRaws) {
        node2.cleanRaws(keepBetween);
        continue;
      }
      Node$2.prototype.cleanRaws.call(node2, keepBetween);
      if (node2.nodes) {
        for (let child of node2.nodes) stack.push(child);
      }
    }
  }
  each(callback) {
    if (!this.proxyOf.nodes) return void 0;
    let iterator = this.getIterator();
    let index, result2;
    while (this.indexes[iterator] < this.proxyOf.nodes.length) {
      index = this.indexes[iterator];
      result2 = callback(this.proxyOf.nodes[index], index);
      if (result2 === false) break;
      this.indexes[iterator] += 1;
    }
    delete this.indexes[iterator];
    return result2;
  }
  every(condition) {
    return this.nodes.every(condition);
  }
  getIterator() {
    if (!this.lastEach) this.lastEach = 0;
    if (!this.indexes) this.indexes = {};
    this.lastEach += 1;
    let iterator = this.lastEach;
    this.indexes[iterator] = 0;
    return iterator;
  }
  getProxyProcessor() {
    return {
      get(node2, prop) {
        if (prop === "proxyOf") {
          return node2;
        } else if (!node2[prop]) {
          return node2[prop];
        } else if (prop === "each" || typeof prop === "string" && prop.startsWith("walk")) {
          return (...args) => {
            return node2[prop](
              ...args.map((i) => {
                if (typeof i === "function") {
                  return (child, index) => i(child.toProxy(), index);
                } else {
                  return i;
                }
              })
            );
          };
        } else if (prop === "every" || prop === "some") {
          return (cb) => {
            return node2[prop](
              (child, ...other) => cb(child.toProxy(), ...other)
            );
          };
        } else if (prop === "root") {
          return () => node2.root().toProxy();
        } else if (prop === "nodes") {
          return node2.nodes.map((i) => i.toProxy());
        } else if (prop === "first" || prop === "last") {
          return node2[prop].toProxy();
        } else {
          return node2[prop];
        }
      },
      set(node2, prop, value) {
        if (node2[prop] === value) return true;
        node2[prop] = value;
        if (prop === "name" || prop === "params" || prop === "selector") {
          node2.markDirty();
        }
        return true;
      }
    };
  }
  index(child) {
    if (typeof child === "number") return child;
    if (child.proxyOf) child = child.proxyOf;
    return this.proxyOf.nodes.indexOf(child);
  }
  insertAfter(exist, add) {
    let existIndex = this.index(exist);
    let nodes = this.normalize(add, this.proxyOf.nodes[existIndex]).reverse();
    existIndex = this.index(exist);
    for (let node2 of nodes) this.proxyOf.nodes.splice(existIndex + 1, 0, node2);
    let index;
    for (let id in this.indexes) {
      index = this.indexes[id];
      if (existIndex < index) {
        this.indexes[id] = index + nodes.length;
      }
    }
    this.markDirty();
    return this;
  }
  insertBefore(exist, add) {
    let existIndex = this.index(exist);
    let type = existIndex === 0 ? "prepend" : false;
    let nodes = this.normalize(
      add,
      this.proxyOf.nodes[existIndex],
      type
    ).reverse();
    existIndex = this.index(exist);
    for (let node2 of nodes) this.proxyOf.nodes.splice(existIndex, 0, node2);
    let index;
    for (let id in this.indexes) {
      index = this.indexes[id];
      if (existIndex <= index) {
        this.indexes[id] = index + nodes.length;
      }
    }
    this.markDirty();
    return this;
  }
  normalize(nodes, sample) {
    if (typeof nodes === "string") {
      nodes = cleanSource(parse$6(nodes).nodes);
    } else if (typeof nodes === "undefined") {
      nodes = [];
    } else if (Array.isArray(nodes)) {
      nodes = nodes.slice(0);
      for (let i of nodes) {
        if (i.parent) i.parent.removeChild(i, "ignore");
      }
    } else if (nodes.type === "root" && this.type !== "document") {
      nodes = nodes.nodes.slice(0);
      for (let i of nodes) {
        if (i.parent) i.parent.removeChild(i, "ignore");
      }
    } else if (nodes.type) {
      nodes = [nodes];
    } else if (nodes.prop) {
      if (typeof nodes.value === "undefined") {
        throw new Error("Value field is missed in node creation");
      } else if (typeof nodes.value !== "string") {
        nodes.value = String(nodes.value);
      }
      nodes = [new Declaration$3(nodes)];
    } else if (nodes.selector || nodes.selectors) {
      nodes = [new Rule$4(nodes)];
    } else if (nodes.name) {
      nodes = [new AtRule$4(nodes)];
    } else if (nodes.text) {
      nodes = [new Comment$3(nodes)];
    } else {
      throw new Error("Unknown node type in node creation");
    }
    let processed = nodes.map((i) => {
      if (!i[my$2]) Container.rebuild(i);
      i = i.proxyOf;
      if (i.parent) i.parent.removeChild(i);
      if (i[isClean$1]) markTreeDirty(i);
      if (!i.raws) i.raws = {};
      if (typeof i.raws.before === "undefined") {
        if (sample && typeof sample.raws.before !== "undefined") {
          i.raws.before = sample.raws.before.replace(/\S/g, "");
        }
      }
      i.parent = this.proxyOf;
      return i;
    });
    return processed;
  }
  prepend(...children) {
    children = children.reverse();
    for (let child of children) {
      let nodes = this.normalize(child, this.first, "prepend").reverse();
      for (let node2 of nodes) this.proxyOf.nodes.unshift(node2);
      for (let id in this.indexes) {
        this.indexes[id] = this.indexes[id] + nodes.length;
      }
    }
    this.markDirty();
    return this;
  }
  push(child) {
    child.parent = this;
    this.proxyOf.nodes.push(child);
    return this;
  }
  removeAll() {
    for (let node2 of this.proxyOf.nodes) node2.parent = void 0;
    this.proxyOf.nodes = [];
    this.markDirty();
    return this;
  }
  removeChild(child) {
    child = this.index(child);
    this.proxyOf.nodes[child].parent = void 0;
    this.proxyOf.nodes.splice(child, 1);
    let index;
    for (let id in this.indexes) {
      index = this.indexes[id];
      if (index >= child) {
        this.indexes[id] = index - 1;
      }
    }
    this.markDirty();
    return this;
  }
  replaceValues(pattern, opts, callback) {
    if (!callback) {
      callback = opts;
      opts = {};
    }
    this.walkDecls((decl) => {
      if (opts.props && !opts.props.includes(decl.prop)) return;
      if (opts.fast && !decl.value.includes(opts.fast)) return;
      decl.value = decl.value.replace(pattern, callback);
    });
    this.markDirty();
    return this;
  }
  some(condition) {
    return this.nodes.some(condition);
  }
  walk(callback) {
    if (!this.proxyOf.nodes) return void 0;
    let stack = [{ iterator: this.getIterator(), node: this.proxyOf }];
    while (stack.length > 0) {
      let { iterator, node: node2 } = stack[stack.length - 1];
      let index = node2.indexes[iterator];
      if (index >= node2.proxyOf.nodes.length) {
        delete node2.indexes[iterator];
        stack.pop();
        let parent = stack[stack.length - 1];
        if (parent) parent.node.indexes[parent.iterator] += 1;
        continue;
      }
      let child = node2.proxyOf.nodes[index];
      let result2;
      try {
        result2 = callback(child, index);
      } catch (e) {
        throw child.addToError(e);
      }
      if (result2 === false) {
        for (let opened of stack) {
          delete opened.node.indexes[opened.iterator];
        }
        return false;
      }
      if (child.walk && child.proxyOf.nodes) {
        stack.push({ iterator: child.getIterator(), node: child });
      } else {
        node2.indexes[iterator] += 1;
      }
    }
    return void 0;
  }
  walkAtRules(name, callback) {
    if (!callback) {
      callback = name;
      return this.walk((child, i) => {
        if (child.type === "atrule") {
          return callback(child, i);
        }
      });
    }
    if (name instanceof RegExp) {
      return this.walk((child, i) => {
        if (child.type === "atrule" && name.test(child.name)) {
          return callback(child, i);
        }
      });
    }
    return this.walk((child, i) => {
      if (child.type === "atrule" && child.name === name) {
        return callback(child, i);
      }
    });
  }
  walkComments(callback) {
    return this.walk((child, i) => {
      if (child.type === "comment") {
        return callback(child, i);
      }
    });
  }
  walkDecls(prop, callback) {
    if (!callback) {
      callback = prop;
      return this.walk((child, i) => {
        if (child.type === "decl") {
          return callback(child, i);
        }
      });
    }
    if (prop instanceof RegExp) {
      return this.walk((child, i) => {
        if (child.type === "decl" && prop.test(child.prop)) {
          return callback(child, i);
        }
      });
    }
    return this.walk((child, i) => {
      if (child.type === "decl" && child.prop === prop) {
        return callback(child, i);
      }
    });
  }
  walkRules(selector, callback) {
    if (!callback) {
      callback = selector;
      return this.walk((child, i) => {
        if (child.type === "rule") {
          return callback(child, i);
        }
      });
    }
    if (selector instanceof RegExp) {
      return this.walk((child, i) => {
        if (child.type === "rule" && selector.test(child.selector)) {
          return callback(child, i);
        }
      });
    }
    return this.walk((child, i) => {
      if (child.type === "rule" && child.selector === selector) {
        return callback(child, i);
      }
    });
  }
};
Container$8.registerParse = (dependant) => {
  parse$6 = dependant;
};
Container$8.registerRule = (dependant) => {
  Rule$4 = dependant;
};
Container$8.registerAtRule = (dependant) => {
  AtRule$4 = dependant;
};
Container$8.registerRoot = (dependant) => {
  Root$6 = dependant;
};
var container = Container$8;
Container$8.default = Container$8;
Container$8.rebuild = (node2) => {
  let stack = [node2];
  while (stack.length > 0) {
    let next = stack.pop();
    if (next.type === "atrule") {
      Object.setPrototypeOf(next, AtRule$4.prototype);
    } else if (next.type === "rule") {
      Object.setPrototypeOf(next, Rule$4.prototype);
    } else if (next.type === "decl") {
      Object.setPrototypeOf(next, Declaration$3.prototype);
    } else if (next.type === "comment") {
      Object.setPrototypeOf(next, Comment$3.prototype);
    } else if (next.type === "root") {
      Object.setPrototypeOf(next, Root$6.prototype);
    }
    next[my$2] = true;
    if (next.nodes) {
      for (let child of next.nodes) stack.push(child);
    }
  }
};
let Container$7 = container;
let AtRule$3 = class AtRule extends Container$7 {
  constructor(defaults) {
    super(defaults);
    this.type = "atrule";
  }
  append(...children) {
    if (!this.proxyOf.nodes) this.nodes = [];
    return super.append(...children);
  }
  prepend(...children) {
    if (!this.proxyOf.nodes) this.nodes = [];
    return super.prepend(...children);
  }
};
var atRule = AtRule$3;
AtRule$3.default = AtRule$3;
Container$7.registerAtRule(AtRule$3);
let Container$6 = container;
let LazyResult$4, Processor$3;
let Document$3 = class Document extends Container$6 {
  constructor(defaults) {
    super({ type: "document", ...defaults });
    if (!this.nodes) {
      this.nodes = [];
    }
  }
  toResult(opts = {}) {
    let lazy = new LazyResult$4(new Processor$3(), this, opts);
    return lazy.stringify();
  }
};
Document$3.registerLazyResult = (dependant) => {
  LazyResult$4 = dependant;
};
Document$3.registerProcessor = (dependant) => {
  Processor$3 = dependant;
};
var document$1 = Document$3;
Document$3.default = Document$3;
let urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
let nanoid$1 = (size = 21) => {
  let id = "";
  let i = size | 0;
  while (i-- > 0) {
    id += urlAlphabet[Math.random() * 64 | 0];
  }
  return id;
};
var nonSecure = { nanoid: nanoid$1 };
let { existsSync, readFileSync } = require$$2;
let { dirname: dirname$1, isAbsolute: isAbsolute$1, join, relative: relative$1, sep: sep$1 } = require$$2;
let { SourceMapConsumer: SourceMapConsumer$2, SourceMapGenerator: SourceMapGenerator$2 } = require$$2;
function fromBase64(str) {
  if (Buffer) {
    return Buffer.from(str, "base64").toString();
  } else {
    return window.atob(str);
  }
}
let PreviousMap$2 = class PreviousMap {
  constructor(css, opts) {
    if (opts.map === false) return;
    if (opts.unsafeMap) this.unsafeMap = true;
    this.loadAnnotation(css);
    this.inline = this.startWith(this.annotation, "data:");
    let prev = opts.map ? opts.map.prev : void 0;
    let text2 = this.loadMap(opts.from, prev);
    if (!this.mapFile && opts.from) {
      this.mapFile = opts.from;
    }
    if (this.mapFile) this.root = dirname$1(this.mapFile);
    if (text2) this.text = text2;
  }
  consumer() {
    if (!this.consumerCache) {
      this.consumerCache = new SourceMapConsumer$2(this.json || this.text);
    }
    return this.consumerCache;
  }
  decodeInline(text2) {
    let baseCharsetUri = /^data:application\/json;charset=utf-?8;base64,/;
    let baseUri = /^data:application\/json;base64,/;
    let charsetUri = /^data:application\/json;charset=utf-?8,/;
    let uri = /^data:application\/json,/;
    let uriMatch = text2.match(charsetUri) || text2.match(uri);
    if (uriMatch) {
      return decodeURIComponent(text2.substr(uriMatch[0].length));
    }
    let baseUriMatch = text2.match(baseCharsetUri) || text2.match(baseUri);
    if (baseUriMatch) {
      return fromBase64(text2.substr(baseUriMatch[0].length));
    }
    let encoding = text2.slice("data:application/json;".length);
    encoding = encoding.slice(0, encoding.indexOf(","));
    throw new Error("Unsupported source map encoding " + encoding);
  }
  getAnnotationURL(sourceMapString) {
    return sourceMapString.replace(/^\/\*\s*# sourceMappingURL=/, "").trim();
  }
  isMap(map) {
    if (typeof map !== "object") return false;
    return typeof map.mappings === "string" || typeof map._mappings === "string" || Array.isArray(map.sections);
  }
  loadAnnotation(css) {
    let comments = css.match(/\/\*\s*# sourceMappingURL=/g);
    if (!comments) return;
    let start = css.lastIndexOf(comments.pop());
    let end = css.indexOf("*/", start);
    if (start > -1 && end > -1) {
      this.annotation = this.getAnnotationURL(css.substring(start, end));
    }
  }
  loadFile(path, cssFile, trusted) {
    if (!trusted && !this.unsafeMap) {
      if (!/\.map$/i.test(path)) return void 0;
      if (!cssFile) return void 0;
      let rel = relative$1(dirname$1(cssFile), path);
      if (rel === ".." || rel.startsWith(".." + sep$1) || isAbsolute$1(rel)) {
        return void 0;
      }
    }
    this.root = dirname$1(path);
    if (existsSync(path)) {
      this.mapFile = path;
      return readFileSync(path, "utf-8").toString().trim();
    }
  }
  loadMap(file, prev) {
    if (prev === false) return false;
    if (prev) {
      if (typeof prev === "string") {
        return prev;
      } else if (typeof prev === "function") {
        let prevPath = prev(file);
        if (prevPath) {
          let map = this.loadFile(prevPath, file, true);
          if (!map) {
            throw new Error(
              "Unable to load previous source map: " + prevPath.toString()
            );
          }
          return map;
        }
      } else if (prev instanceof SourceMapConsumer$2) {
        return SourceMapGenerator$2.fromSourceMap(prev).toString();
      } else if (prev instanceof SourceMapGenerator$2) {
        return prev.toString();
      } else if (this.isMap(prev)) {
        return JSON.stringify(prev);
      } else {
        throw new Error(
          "Unsupported previous source map format: " + prev.toString()
        );
      }
    } else if (this.inline) {
      return this.decodeInline(this.annotation);
    } else if (this.annotation) {
      let map = this.annotation;
      if (file) map = join(dirname$1(file), map);
      let unknown = this.loadFile(map, file, false);
      if (unknown) {
        try {
          this.json = JSON.parse(unknown.replace(/^\)]}'[^\n]*\n/, ""));
        } catch {
          return void 0;
        }
      }
      return unknown;
    }
  }
  startWith(string, start) {
    if (!string) return false;
    return string.substr(0, start.length) === start;
  }
  withContent() {
    return !!(this.consumer().sourcesContent && this.consumer().sourcesContent.length > 0);
  }
};
var previousMap = PreviousMap$2;
PreviousMap$2.default = PreviousMap$2;
let { nanoid } = nonSecure;
let { isAbsolute, resolve: resolve$1 } = require$$2;
let { SourceMapConsumer: SourceMapConsumer$1, SourceMapGenerator: SourceMapGenerator$1 } = require$$2;
let { fileURLToPath, pathToFileURL: pathToFileURL$1 } = require$$2;
let CssSyntaxError$1 = cssSyntaxError;
let PreviousMap$1 = previousMap;
let terminalHighlight = require$$2;
let lineToIndexCache = Symbol("lineToIndexCache");
let sourceMapAvailable$1 = Boolean(SourceMapConsumer$1 && SourceMapGenerator$1);
let pathAvailable$1 = Boolean(resolve$1 && isAbsolute);
function getLineToIndex(input2) {
  if (input2[lineToIndexCache]) return input2[lineToIndexCache];
  let lines = input2.css.split("\n");
  let lineToIndex = new Array(lines.length);
  let prevIndex = 0;
  for (let i = 0, l = lines.length; i < l; i++) {
    lineToIndex[i] = prevIndex;
    prevIndex += lines[i].length + 1;
  }
  input2[lineToIndexCache] = lineToIndex;
  return lineToIndex;
}
let Input$4 = class Input {
  get from() {
    return this.file || this.id;
  }
  constructor(css, opts = {}) {
    if (css === null || typeof css === "undefined" || typeof css === "object" && !css.toString) {
      throw new Error(`PostCSS received ${css} instead of CSS string`);
    }
    this.css = css.toString();
    if (this.css[0] === "\uFEFF" || this.css[0] === "￾") {
      this.hasBOM = true;
      this.css = this.css.slice(1);
    } else {
      this.hasBOM = false;
    }
    this.document = this.css;
    if (opts.document) this.document = opts.document.toString();
    if (opts.from) {
      if (!pathAvailable$1 || /^\w+:\/\//.test(opts.from) || isAbsolute(opts.from)) {
        this.file = opts.from;
      } else {
        this.file = resolve$1(opts.from);
      }
    }
    if (pathAvailable$1 && sourceMapAvailable$1) {
      let map = new PreviousMap$1(this.css, opts);
      if (map.text) {
        this.map = map;
        let file = map.consumer().file;
        if (!this.file && file) this.file = this.mapResolve(file);
      }
    }
    if (!this.file) {
      this.id = "<input css " + nanoid(6) + ">";
    }
    if (this.map) this.map.file = this.from;
  }
  error(message, line, column, opts = {}) {
    let endColumn, endLine, endOffset, offset, result2;
    if (line && typeof line === "object") {
      let start = line;
      let end = column;
      if (typeof start.offset === "number") {
        offset = start.offset;
        let pos = this.fromOffset(offset);
        line = pos.line;
        column = pos.col;
      } else {
        line = start.line;
        column = start.column;
        offset = this.fromLineAndColumn(line, column);
      }
      if (typeof end.offset === "number") {
        endOffset = end.offset;
        let pos = this.fromOffset(endOffset);
        endLine = pos.line;
        endColumn = pos.col;
      } else {
        endLine = end.line;
        endColumn = end.column;
        endOffset = this.fromLineAndColumn(end.line, end.column);
      }
    } else if (!column) {
      offset = line;
      let pos = this.fromOffset(offset);
      line = pos.line;
      column = pos.col;
    } else {
      offset = this.fromLineAndColumn(line, column);
    }
    let origin = this.origin(line, column, endLine, endColumn);
    if (origin) {
      result2 = new CssSyntaxError$1(
        message,
        origin.endLine === void 0 ? origin.line : { column: origin.column, line: origin.line },
        origin.endLine === void 0 ? origin.column : { column: origin.endColumn, line: origin.endLine },
        origin.source,
        origin.file,
        opts.plugin
      );
    } else {
      result2 = new CssSyntaxError$1(
        message,
        endLine === void 0 ? line : { column, line },
        endLine === void 0 ? column : { column: endColumn, line: endLine },
        this.css,
        this.file,
        opts.plugin
      );
    }
    result2.input = {
      column,
      endColumn,
      endLine,
      endOffset,
      line,
      offset,
      source: this.css
    };
    if (this.file) {
      if (pathToFileURL$1) {
        result2.input.url = pathToFileURL$1(this.file).toString();
      }
      result2.input.file = this.file;
    }
    return result2;
  }
  fromLineAndColumn(line, column) {
    let lineToIndex = getLineToIndex(this);
    let index = lineToIndex[line - 1];
    return index + column - 1;
  }
  fromOffset(offset) {
    let lineToIndex = getLineToIndex(this);
    let lastLine = lineToIndex[lineToIndex.length - 1];
    let min = 0;
    if (offset >= lastLine) {
      min = lineToIndex.length - 1;
    } else {
      let max = lineToIndex.length - 2;
      let mid;
      while (min < max) {
        mid = min + (max - min >> 1);
        if (offset < lineToIndex[mid]) {
          max = mid - 1;
        } else if (offset >= lineToIndex[mid + 1]) {
          min = mid + 1;
        } else {
          min = mid;
          break;
        }
      }
    }
    return {
      col: offset - lineToIndex[min] + 1,
      line: min + 1
    };
  }
  mapResolve(file) {
    if (/^\w+:\/\//.test(file)) {
      return file;
    }
    return resolve$1(this.map.consumer().sourceRoot || this.map.root || ".", file);
  }
  origin(line, column, endLine, endColumn) {
    if (!this.map) return false;
    let consumer = this.map.consumer();
    let from = consumer.originalPositionFor({ column: column - 1, line });
    if (!from.source) return false;
    let to;
    if (typeof endLine === "number") {
      let toPosition = consumer.originalPositionFor({
        column: endColumn - 1,
        line: endLine
      });
      if (toPosition.source) to = toPosition;
    }
    let fromUrl;
    if (isAbsolute(from.source)) {
      fromUrl = pathToFileURL$1(from.source);
    } else {
      fromUrl = new URL(
        from.source,
        this.map.consumer().sourceRoot || pathToFileURL$1(this.map.mapFile)
      );
    }
    let result2 = {
      column: from.column + 1,
      endColumn: to && to.column + 1,
      endLine: to && to.line,
      line: from.line,
      url: fromUrl.toString()
    };
    if (fromUrl.protocol === "file:") {
      if (fileURLToPath) {
        result2.file = fileURLToPath(fromUrl);
      } else {
        throw new Error(`file: protocol is not available in this PostCSS build`);
      }
    }
    let source = consumer.sourceContentFor(from.source);
    if (source) result2.source = source;
    return result2;
  }
  toJSON() {
    let json = {};
    for (let name of ["hasBOM", "css", "file", "id"]) {
      if (this[name] != null) {
        json[name] = this[name];
      }
    }
    if (this.map) {
      json.map = { ...this.map };
      if (json.map.consumerCache) {
        json.map.consumerCache = void 0;
      }
    }
    return json;
  }
};
var input = Input$4;
Input$4.default = Input$4;
if (terminalHighlight && terminalHighlight.registerInput) {
  terminalHighlight.registerInput(Input$4);
}
let Container$5 = container;
let LazyResult$3, Processor$2;
let Root$5 = class Root extends Container$5 {
  constructor(defaults) {
    super(defaults);
    this.type = "root";
    if (!this.nodes) this.nodes = [];
  }
  normalize(child, sample, type) {
    let keepBefore = /* @__PURE__ */ new Set();
    for (let node2 of Array.isArray(child) ? child : [child]) {
      if (node2 && typeof node2 === "object" && !node2.parent && node2.raws && typeof node2.raws.before !== "undefined") {
        keepBefore.add(node2.raws);
      }
    }
    let nodes = super.normalize(child);
    if (sample) {
      if (type === "prepend") {
        if (this.nodes.length > 1) {
          sample.raws.before = this.nodes[1].raws.before;
        } else {
          delete sample.raws.before;
        }
      } else if (this.first !== sample) {
        for (let node2 of nodes) {
          if (!keepBefore.has(node2.raws)) {
            node2.raws.before = sample.raws.before;
          }
        }
      }
    }
    return nodes;
  }
  removeChild(child, ignore) {
    let index = this.index(child);
    if (!ignore && index === 0 && this.nodes.length > 1) {
      this.nodes[1].raws.before = this.nodes[index].raws.before;
    }
    return super.removeChild(child);
  }
  toResult(opts = {}) {
    let lazy = new LazyResult$3(new Processor$2(), this, opts);
    return lazy.stringify();
  }
};
Root$5.registerLazyResult = (dependant) => {
  LazyResult$3 = dependant;
};
Root$5.registerProcessor = (dependant) => {
  Processor$2 = dependant;
};
var root = Root$5;
Root$5.default = Root$5;
Container$5.registerRoot(Root$5);
let list$2 = {
  comma(string) {
    return list$2.split(string, [","], true);
  },
  space(string) {
    let spaces = [" ", "\n", "	"];
    return list$2.split(string, spaces);
  },
  split(string, separators, last) {
    if (!string) return [];
    let array = [];
    let current = "";
    let split = false;
    let func = 0;
    let inQuote = false;
    let prevQuote = "";
    let escape2 = false;
    for (let letter of string) {
      if (escape2) {
        escape2 = false;
      } else if (letter === "\\") {
        escape2 = true;
      } else if (inQuote) {
        if (letter === prevQuote) {
          inQuote = false;
        }
      } else if (letter === '"' || letter === "'") {
        inQuote = true;
        prevQuote = letter;
      } else if (letter === "(") {
        func += 1;
      } else if (letter === ")") {
        if (func > 0) func -= 1;
      } else if (func === 0) {
        if (separators.includes(letter)) split = true;
      }
      if (split) {
        if (current !== "") array.push(current.trim());
        current = "";
        split = false;
      } else {
        current += letter;
      }
    }
    if (last || current !== "") array.push(current.trim());
    return array;
  }
};
var list_1 = list$2;
list$2.default = list$2;
let Container$4 = container;
let list$1 = list_1;
let Rule$3 = class Rule extends Container$4 {
  get selectors() {
    return list$1.comma(this.selector);
  }
  set selectors(values) {
    let match = this.selector ? this.selector.match(/,\s*/) : null;
    let sep2 = match ? match[0] : "," + this.raw("between", "beforeOpen");
    this.selector = values.join(sep2);
  }
  constructor(defaults) {
    super(defaults);
    this.type = "rule";
    if (!this.nodes) this.nodes = [];
  }
};
var rule = Rule$3;
Rule$3.default = Rule$3;
Container$4.registerRule(Rule$3);
let AtRule$2 = atRule;
let Comment$2 = comment;
let Declaration$2 = declaration;
let Input$3 = input;
let PreviousMap2 = previousMap;
let Root$4 = root;
let Rule$2 = rule;
function hydrateInputs(json, inputs) {
  if (!json.inputs) return inputs;
  return json.inputs.map((input2) => {
    let inputHydrated = { ...input2, __proto__: Input$3.prototype };
    if (inputHydrated.map) {
      inputHydrated.map = {
        ...inputHydrated.map,
        __proto__: PreviousMap2.prototype
      };
    }
    return inputHydrated;
  });
}
function constructNode(json, inputs, children) {
  let defaults = { ...json };
  delete defaults.inputs;
  delete defaults.nodes;
  if (defaults.source) {
    let { inputId, ...source } = defaults.source;
    defaults.source = source;
    if (inputId != null) {
      defaults.source.input = inputs[inputId];
    }
  }
  let node2;
  if (defaults.type === "root") {
    node2 = new Root$4(defaults);
  } else if (defaults.type === "decl") {
    node2 = new Declaration$2(defaults);
  } else if (defaults.type === "rule") {
    node2 = new Rule$2(defaults);
  } else if (defaults.type === "comment") {
    node2 = new Comment$2(defaults);
  } else if (defaults.type === "atrule") {
    node2 = new AtRule$2(defaults);
  } else {
    throw new Error("Unknown node type: " + json.type);
  }
  if (children) {
    node2.nodes = children;
    for (let child of children) child.parent = node2;
  }
  return node2;
}
function fromJSON$1(json, inputs) {
  if (Array.isArray(json)) return json.map((n) => fromJSON$1(n));
  let result2;
  let stack = [
    { childIndex: 0, children: [], inputs: hydrateInputs(json, inputs), json }
  ];
  while (stack.length > 0) {
    let frame = stack[stack.length - 1];
    let jsonNodes = frame.json.nodes;
    if (jsonNodes && frame.childIndex < jsonNodes.length) {
      let childJson = jsonNodes[frame.childIndex];
      frame.childIndex += 1;
      stack.push({
        childIndex: 0,
        children: [],
        inputs: hydrateInputs(childJson, frame.inputs),
        json: childJson
      });
      continue;
    }
    stack.pop();
    let node2 = constructNode(
      frame.json,
      frame.inputs,
      jsonNodes ? frame.children : void 0
    );
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node2);
    } else {
      result2 = node2;
    }
  }
  return result2;
}
var fromJSON_1 = fromJSON$1;
fromJSON$1.default = fromJSON$1;
let { dirname, relative, resolve, sep } = require$$2;
let { SourceMapConsumer, SourceMapGenerator } = require$$2;
let { pathToFileURL } = require$$2;
let Input$2 = input;
let sourceMapAvailable = Boolean(SourceMapConsumer && SourceMapGenerator);
let pathAvailable = Boolean(dirname && resolve && relative && sep);
let MapGenerator$2 = class MapGenerator {
  constructor(stringify2, root2, opts, cssString2) {
    this.stringify = stringify2;
    this.mapOpts = opts.map || {};
    this.root = root2;
    this.opts = opts;
    this.css = cssString2;
    this.originalCSS = cssString2;
    this.usesFileUrls = !this.mapOpts.from && this.mapOpts.absolute;
    this.memoizedFileURLs = /* @__PURE__ */ new Map();
    this.memoizedPaths = /* @__PURE__ */ new Map();
    this.memoizedURLs = /* @__PURE__ */ new Map();
  }
  addAnnotation() {
    let content;
    if (this.isInline()) {
      content = "data:application/json;base64," + this.toBase64(this.map.toString());
    } else if (typeof this.mapOpts.annotation === "string") {
      content = this.mapOpts.annotation;
    } else if (typeof this.mapOpts.annotation === "function") {
      content = this.mapOpts.annotation(this.opts.to, this.root);
    } else {
      content = this.outputFile() + ".map";
    }
    let eol = "\n";
    if (this.css.includes("\r\n")) eol = "\r\n";
    this.css += eol + "/*# sourceMappingURL=" + content + " */";
  }
  applyPrevMaps() {
    for (let prev of this.previous()) {
      let from = this.toUrl(this.path(prev.file));
      let root2 = prev.root || dirname(prev.file);
      let map;
      if (this.mapOpts.sourcesContent === false) {
        map = new SourceMapConsumer(prev.text);
        if (map.sourcesContent) {
          map.sourcesContent = null;
        }
      } else {
        map = prev.consumer();
      }
      this.map.applySourceMap(map, from, this.toUrl(this.path(root2)));
    }
  }
  clearAnnotation() {
    if (this.mapOpts.annotation === false) return;
    if (this.root) {
      let node2;
      for (let i = this.root.nodes.length - 1; i >= 0; i--) {
        node2 = this.root.nodes[i];
        if (node2.type !== "comment") continue;
        if (node2.text.startsWith("# sourceMappingURL=")) {
          this.root.removeChild(i);
        }
      }
    } else if (this.css) {
      let startIndex;
      while ((startIndex = this.css.lastIndexOf("/*#")) !== -1) {
        let endIndex = this.css.indexOf("*/", startIndex + 3);
        if (endIndex === -1) break;
        while (startIndex > 0 && this.css[startIndex - 1] === "\n") {
          startIndex--;
        }
        this.css = this.css.slice(0, startIndex) + this.css.slice(endIndex + 2);
      }
    }
  }
  generate() {
    this.clearAnnotation();
    if (pathAvailable && sourceMapAvailable && this.isMap()) {
      return this.generateMap();
    } else {
      let result2 = "";
      this.stringify(this.root, (i) => {
        result2 += i;
      });
      return [result2];
    }
  }
  generateMap() {
    if (this.root) {
      this.generateString();
    } else if (this.previous().length === 1) {
      let prev = this.previous()[0].consumer();
      prev.file = this.outputFile();
      this.map = SourceMapGenerator.fromSourceMap(prev, {
        ignoreInvalidMapping: true
      });
    } else {
      this.map = new SourceMapGenerator({
        file: this.outputFile(),
        ignoreInvalidMapping: true
      });
      this.map.addMapping({
        generated: { column: 0, line: 1 },
        original: { column: 0, line: 1 },
        source: this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>"
      });
    }
    if (this.isSourcesContent()) this.setSourcesContent();
    if (this.root && this.previous().length > 0) this.applyPrevMaps();
    if (this.isAnnotation()) this.addAnnotation();
    if (this.isInline()) {
      return [this.css];
    } else {
      return [this.css, this.map];
    }
  }
  generateString() {
    this.css = "";
    this.map = new SourceMapGenerator({
      file: this.outputFile(),
      ignoreInvalidMapping: true
    });
    let line = 1;
    let column = 1;
    let noSource = "<no source>";
    let mapping = {
      generated: { column: 0, line: 0 },
      original: { column: 0, line: 0 },
      source: ""
    };
    let last, lines;
    this.stringify(this.root, (str, node2, type) => {
      this.css += str;
      if (node2 && type !== "end") {
        mapping.generated.line = line;
        mapping.generated.column = column - 1;
        if (node2.source && node2.source.start) {
          mapping.source = this.sourcePath(node2);
          mapping.original.line = node2.source.start.line;
          mapping.original.column = node2.source.start.column - 1;
          this.map.addMapping(mapping);
        } else {
          mapping.source = noSource;
          mapping.original.line = 1;
          mapping.original.column = 0;
          this.map.addMapping(mapping);
        }
      }
      lines = str.match(/\n/g);
      if (lines) {
        line += lines.length;
        last = str.lastIndexOf("\n");
        column = str.length - last;
      } else {
        column += str.length;
      }
      if (node2 && type !== "start") {
        let p = node2.parent || { raws: {} };
        let childless = node2.type === "decl" || node2.type === "atrule" && !node2.nodes;
        if (!childless || node2 !== p.last || p.raws.semicolon) {
          if (node2.source && node2.source.end) {
            mapping.source = this.sourcePath(node2);
            mapping.original.line = node2.source.end.line;
            mapping.original.column = node2.source.end.column - 1;
            mapping.generated.line = line;
            mapping.generated.column = column - 2;
            this.map.addMapping(mapping);
          } else {
            mapping.source = noSource;
            mapping.original.line = 1;
            mapping.original.column = 0;
            mapping.generated.line = line;
            mapping.generated.column = column - 1;
            this.map.addMapping(mapping);
          }
        }
      }
    });
  }
  isAnnotation() {
    if (this.isInline()) {
      return true;
    }
    if (typeof this.mapOpts.annotation !== "undefined") {
      return this.mapOpts.annotation;
    }
    if (this.previous().length) {
      return this.previous().some((i) => i.annotation);
    }
    return true;
  }
  isInline() {
    if (typeof this.mapOpts.inline !== "undefined") {
      return this.mapOpts.inline;
    }
    let annotation = this.mapOpts.annotation;
    if (typeof annotation !== "undefined" && annotation !== true) {
      return false;
    }
    if (this.previous().length) {
      return this.previous().some((i) => i.inline);
    }
    return true;
  }
  isMap() {
    if (typeof this.opts.map !== "undefined") {
      return !!this.opts.map;
    }
    return this.previous().length > 0;
  }
  isSourcesContent() {
    if (typeof this.mapOpts.sourcesContent !== "undefined") {
      return this.mapOpts.sourcesContent;
    }
    if (this.previous().length) {
      return this.previous().some((i) => i.withContent());
    }
    return true;
  }
  outputFile() {
    if (this.opts.to) {
      return this.path(this.opts.to);
    } else if (this.opts.from) {
      return this.path(this.opts.from);
    } else {
      return "to.css";
    }
  }
  path(file) {
    if (this.mapOpts.absolute) return file;
    if (file.charCodeAt(0) === 60) return file;
    if (/^\w+:\/\//.test(file)) return file;
    let cached = this.memoizedPaths.get(file);
    if (cached) return cached;
    let from = this.opts.to ? dirname(this.opts.to) : ".";
    if (typeof this.mapOpts.annotation === "string") {
      from = dirname(resolve(from, this.mapOpts.annotation));
    }
    let path = relative(from, file);
    this.memoizedPaths.set(file, path);
    return path;
  }
  previous() {
    if (!this.previousMaps) {
      this.previousMaps = [];
      if (this.root) {
        this.root.walk((node2) => {
          if (node2.source && node2.source.input.map) {
            let map = node2.source.input.map;
            if (!this.previousMaps.includes(map)) {
              this.previousMaps.push(map);
            }
          }
        });
      } else {
        let input2 = new Input$2(this.originalCSS, this.opts);
        if (input2.map) this.previousMaps.push(input2.map);
      }
    }
    return this.previousMaps;
  }
  setSourcesContent() {
    let already = {};
    if (this.root) {
      this.root.walk((node2) => {
        if (node2.source) {
          let from = node2.source.input.from;
          if (from && !already[from]) {
            already[from] = true;
            let fromUrl = this.usesFileUrls ? this.toFileUrl(from) : this.toUrl(this.path(from));
            this.map.setSourceContent(fromUrl, node2.source.input.css);
          }
        }
      });
    } else if (this.css) {
      let from = this.opts.from ? this.toUrl(this.path(this.opts.from)) : "<no source>";
      this.map.setSourceContent(from, this.css);
    }
  }
  sourcePath(node2) {
    if (this.mapOpts.from) {
      return this.toUrl(this.mapOpts.from);
    } else if (this.usesFileUrls) {
      return this.toFileUrl(node2.source.input.from);
    } else {
      return this.toUrl(this.path(node2.source.input.from));
    }
  }
  toBase64(str) {
    if (Buffer) {
      return Buffer.from(str).toString("base64");
    } else {
      return window.btoa(unescape(encodeURIComponent(str)));
    }
  }
  toFileUrl(path) {
    let cached = this.memoizedFileURLs.get(path);
    if (cached) return cached;
    if (pathToFileURL) {
      let fileURL = pathToFileURL(path).toString();
      this.memoizedFileURLs.set(path, fileURL);
      return fileURL;
    } else {
      throw new Error(
        "`map.absolute` option is not available in this PostCSS build"
      );
    }
  }
  toUrl(path) {
    let cached = this.memoizedURLs.get(path);
    if (cached) return cached;
    if (sep === "\\") {
      path = path.replace(/\\/g, "/");
    }
    let url = encodeURI(path).replace(/[#?]/g, encodeURIComponent);
    this.memoizedURLs.set(path, url);
    return url;
  }
};
var mapGenerator = MapGenerator$2;
const SINGLE_QUOTE = "'".charCodeAt(0);
const DOUBLE_QUOTE = '"'.charCodeAt(0);
const BACKSLASH = "\\".charCodeAt(0);
const SLASH = "/".charCodeAt(0);
const NEWLINE = "\n".charCodeAt(0);
const SPACE = " ".charCodeAt(0);
const FEED = "\f".charCodeAt(0);
const TAB = "	".charCodeAt(0);
const CR = "\r".charCodeAt(0);
const OPEN_SQUARE = "[".charCodeAt(0);
const CLOSE_SQUARE = "]".charCodeAt(0);
const OPEN_PARENTHESES = "(".charCodeAt(0);
const CLOSE_PARENTHESES = ")".charCodeAt(0);
const OPEN_CURLY = "{".charCodeAt(0);
const CLOSE_CURLY = "}".charCodeAt(0);
const SEMICOLON = ";".charCodeAt(0);
const ASTERISK = "*".charCodeAt(0);
const COLON = ":".charCodeAt(0);
const AT = "@".charCodeAt(0);
const RE_AT_END = /[\t\n\f\r "#'()/;[\\\]{}]/g;
const RE_WORD_END = /[\t\n\f\r !"#'():;@[\\\]{}]|\/(?=\*)/g;
const RE_BAD_BRACKET = /.[\r\n"'(/\\]/;
const RE_HEX_ESCAPE = /[\da-f]/i;
var tokenize = function tokenizer(input2, options = {}) {
  let css = input2.css.valueOf();
  let ignore = options.ignoreErrors;
  let code, content, escape2, next, quote;
  let currentToken, escaped, escapePos, n, prev;
  let length = css.length;
  let pos = 0;
  let buffer = [];
  let returned = [];
  let lastBadParen = -1;
  function position() {
    return pos;
  }
  function unclosed(what) {
    throw input2.error("Unclosed " + what, pos);
  }
  function endOfFile() {
    return returned.length === 0 && pos >= length;
  }
  function nextToken(opts) {
    if (returned.length) return returned.pop();
    if (pos >= length) return;
    let ignoreUnclosed = opts ? opts.ignoreUnclosed : false;
    code = css.charCodeAt(pos);
    switch (code) {
      case NEWLINE:
      case SPACE:
      case TAB:
      case CR:
      case FEED: {
        next = pos;
        do {
          next += 1;
          code = css.charCodeAt(next);
        } while (code === SPACE || code === NEWLINE || code === TAB || code === CR || code === FEED);
        currentToken = ["space", css.slice(pos, next)];
        pos = next - 1;
        break;
      }
      case OPEN_SQUARE:
      case CLOSE_SQUARE:
      case OPEN_CURLY:
      case CLOSE_CURLY:
      case COLON:
      case SEMICOLON:
      case CLOSE_PARENTHESES: {
        let controlChar = String.fromCharCode(code);
        currentToken = [controlChar, controlChar, pos];
        break;
      }
      case OPEN_PARENTHESES: {
        prev = buffer.length ? buffer.pop()[1] : "";
        n = css.charCodeAt(pos + 1);
        if (prev === "url" && n !== SINGLE_QUOTE && n !== DOUBLE_QUOTE && n !== SPACE && n !== NEWLINE && n !== TAB && n !== FEED && n !== CR) {
          next = pos;
          do {
            escaped = false;
            next = css.indexOf(")", next + 1);
            if (next === -1) {
              if (ignore || ignoreUnclosed) {
                next = pos;
                break;
              } else {
                unclosed("bracket");
              }
            }
            escapePos = next;
            while (css.charCodeAt(escapePos - 1) === BACKSLASH) {
              escapePos -= 1;
              escaped = !escaped;
            }
          } while (escaped);
          currentToken = ["brackets", css.slice(pos, next + 1), pos, next];
          pos = next;
        } else if (pos <= lastBadParen) {
          currentToken = ["(", "(", pos];
        } else {
          next = css.indexOf(")", pos + 1);
          content = css.slice(pos, next + 1);
          if (next === -1 || RE_BAD_BRACKET.test(content)) {
            lastBadParen = next === -1 ? length : next;
            currentToken = ["(", "(", pos];
          } else {
            currentToken = ["brackets", content, pos, next];
            pos = next;
          }
        }
        break;
      }
      case SINGLE_QUOTE:
      case DOUBLE_QUOTE: {
        quote = code === SINGLE_QUOTE ? "'" : '"';
        next = pos;
        do {
          escaped = false;
          next = css.indexOf(quote, next + 1);
          if (next === -1) {
            if (ignore || ignoreUnclosed) {
              next = pos + 1;
              break;
            } else {
              unclosed("string");
            }
          }
          escapePos = next;
          while (css.charCodeAt(escapePos - 1) === BACKSLASH) {
            escapePos -= 1;
            escaped = !escaped;
          }
        } while (escaped);
        currentToken = ["string", css.slice(pos, next + 1), pos, next];
        pos = next;
        break;
      }
      case AT: {
        RE_AT_END.lastIndex = pos + 1;
        RE_AT_END.test(css);
        if (RE_AT_END.lastIndex === 0) {
          next = css.length - 1;
        } else {
          next = RE_AT_END.lastIndex - 2;
        }
        currentToken = ["at-word", css.slice(pos, next + 1), pos, next];
        pos = next;
        break;
      }
      case BACKSLASH: {
        next = pos;
        escape2 = true;
        while (css.charCodeAt(next + 1) === BACKSLASH) {
          next += 1;
          escape2 = !escape2;
        }
        code = css.charCodeAt(next + 1);
        if (escape2 && code !== SLASH && code !== SPACE && code !== NEWLINE && code !== TAB && code !== CR && code !== FEED) {
          next += 1;
          if (RE_HEX_ESCAPE.test(css.charAt(next))) {
            while (RE_HEX_ESCAPE.test(css.charAt(next + 1))) {
              next += 1;
            }
            if (css.charCodeAt(next + 1) === SPACE) {
              next += 1;
            }
          }
        }
        currentToken = ["word", css.slice(pos, next + 1), pos, next];
        pos = next;
        break;
      }
      default: {
        if (code === SLASH && css.charCodeAt(pos + 1) === ASTERISK) {
          next = css.indexOf("*/", pos + 2) + 1;
          if (next === 0) {
            if (ignore || ignoreUnclosed) {
              next = css.length;
            } else {
              unclosed("comment");
            }
          }
          currentToken = ["comment", css.slice(pos, next + 1), pos, next];
          pos = next;
        } else {
          RE_WORD_END.lastIndex = pos + 1;
          RE_WORD_END.test(css);
          if (RE_WORD_END.lastIndex === 0) {
            next = css.length - 1;
          } else {
            next = RE_WORD_END.lastIndex - 2;
          }
          currentToken = ["word", css.slice(pos, next + 1), pos, next];
          buffer.push(currentToken);
          pos = next;
        }
        break;
      }
    }
    pos++;
    return currentToken;
  }
  function back(token) {
    returned.push(token);
  }
  return {
    back,
    endOfFile,
    nextToken,
    position
  };
};
let AtRule$1 = atRule;
let Comment$1 = comment;
let Declaration$1 = declaration;
let Root$3 = root;
let Rule$1 = rule;
let tokenizer2 = tokenize;
const SAFE_COMMENT_NEIGHBOR = {
  empty: true,
  space: true
};
function findLastWithPosition(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    let token = tokens[i];
    let pos = token[3] || token[2];
    if (pos) return pos;
  }
}
function tokensToString(tokens, from, to) {
  let result2 = "";
  for (let i = from; i < to; i++) result2 += tokens[i][1];
  return result2;
}
let Parser$1 = class Parser {
  constructor(input2) {
    this.input = input2;
    this.root = new Root$3();
    this.current = this.root;
    this.spaces = "";
    this.semicolon = false;
    this.createTokenizer();
    this.root.source = { input: input2, start: { column: 1, line: 1, offset: 0 } };
  }
  atrule(token) {
    let node2 = new AtRule$1();
    node2.name = token[1].slice(1);
    if (node2.name === "") {
      this.unnamedAtrule(node2, token);
    }
    this.init(node2, token[2]);
    let type;
    let prev;
    let shift;
    let last = false;
    let open = false;
    let params = [];
    let brackets = [];
    while (!this.tokenizer.endOfFile()) {
      token = this.tokenizer.nextToken();
      type = token[0];
      if (type === "(" || type === "[") {
        brackets.push(type === "(" ? ")" : "]");
      } else if (type === "{" && brackets.length > 0) {
        brackets.push("}");
      } else if (type === brackets[brackets.length - 1]) {
        brackets.pop();
      }
      if (brackets.length === 0) {
        if (type === ";") {
          node2.source.end = this.getPosition(token[2]);
          node2.source.end.offset++;
          this.semicolon = true;
          break;
        } else if (type === "{") {
          open = true;
          break;
        } else if (type === "}") {
          if (params.length > 0) {
            shift = params.length - 1;
            prev = params[shift];
            while (prev && prev[0] === "space") {
              prev = params[--shift];
            }
            if (prev) {
              node2.source.end = this.getPosition(prev[3] || prev[2]);
              node2.source.end.offset++;
            }
          }
          this.end(token);
          break;
        } else {
          params.push(token);
        }
      } else {
        params.push(token);
      }
      if (this.tokenizer.endOfFile()) {
        last = true;
        break;
      }
    }
    node2.raws.between = this.spacesAndCommentsFromEnd(params);
    if (params.length) {
      node2.raws.afterName = this.spacesAndCommentsFromStart(params);
      this.raw(node2, "params", params);
      if (last) {
        token = params[params.length - 1];
        node2.source.end = this.getPosition(token[3] || token[2]);
        node2.source.end.offset++;
        this.spaces = node2.raws.between;
        node2.raws.between = "";
      }
    } else {
      node2.raws.afterName = "";
      node2.params = "";
    }
    if (open) {
      node2.nodes = [];
      this.current = node2;
    }
  }
  checkMissedSemicolon(tokens) {
    let colon = this.colon(tokens);
    if (colon === false) return;
    let founded = 0;
    let token;
    for (let j = colon - 1; j >= 0; j--) {
      token = tokens[j];
      if (token[0] !== "space") {
        founded += 1;
        if (founded === 2) break;
      }
    }
    throw this.input.error(
      "Missed semicolon",
      token[0] === "word" ? token[3] + 1 : token[2]
    );
  }
  colon(tokens) {
    let brackets = 0;
    let prev, token, type;
    for (let [i, element] of tokens.entries()) {
      token = element;
      type = token[0];
      if (type === "(") {
        brackets += 1;
      }
      if (type === ")") {
        brackets -= 1;
      }
      if (brackets === 0 && type === ":") {
        if (!prev) {
          this.doubleColon(token);
        } else if (prev[0] === "word" && prev[1] === "progid") {
          continue;
        } else {
          return i;
        }
      }
      prev = token;
    }
    return false;
  }
  comment(token) {
    let node2 = new Comment$1();
    this.init(node2, token[2]);
    node2.source.end = this.getPosition(token[3] || token[2]);
    node2.source.end.offset++;
    let text2 = token[1].slice(2, -2);
    if (!text2.trim()) {
      node2.text = "";
      node2.raws.left = text2;
      node2.raws.right = "";
    } else {
      let match = text2.match(/^(\s*)([^]*\S)(\s*)$/);
      node2.text = match[2];
      node2.raws.left = match[1];
      node2.raws.right = match[3];
    }
  }
  createTokenizer() {
    this.tokenizer = tokenizer2(this.input);
  }
  decl(tokens, customProperty) {
    let node2 = new Declaration$1();
    this.init(node2, tokens[0][2]);
    let last = tokens[tokens.length - 1];
    if (last[0] === ";") {
      this.semicolon = true;
      tokens.pop();
    }
    node2.source.end = this.getPosition(
      last[3] || last[2] || findLastWithPosition(tokens)
    );
    node2.source.end.offset++;
    let start = 0;
    while (tokens[start][0] !== "word") {
      if (start === tokens.length - 1) this.unknownWord([tokens[start]]);
      start++;
    }
    node2.raws.before += tokensToString(tokens, 0, start);
    node2.source.start = this.getPosition(tokens[start][2]);
    let propStart = start;
    while (start < tokens.length) {
      let type = tokens[start][0];
      if (type === ":" || type === "space" || type === "comment") {
        break;
      }
      start++;
    }
    node2.prop = tokensToString(tokens, propStart, start);
    let betweenStart = start;
    let token;
    while (start < tokens.length) {
      token = tokens[start];
      start++;
      if (token[0] === ":") break;
      if (token[0] === "word" && /\w/.test(token[1])) {
        this.unknownWord([token]);
      }
    }
    node2.raws.between = tokensToString(tokens, betweenStart, start);
    if (node2.prop[0] === "_" || node2.prop[0] === "*") {
      node2.raws.before += node2.prop[0];
      node2.prop = node2.prop.slice(1);
    }
    let firstSpacesStart = start;
    while (start < tokens.length) {
      let next = tokens[start][0];
      if (next !== "space" && next !== "comment") break;
      start++;
    }
    let firstSpaces = tokens.slice(firstSpacesStart, start);
    tokens = tokens.slice(start);
    this.precheckMissedSemicolon(tokens);
    for (let i = tokens.length - 1; i >= 0; i--) {
      token = tokens[i];
      if (token[1].toLowerCase() === "!important") {
        node2.important = true;
        let string = this.stringFrom(tokens, i);
        string = this.spacesFromEnd(tokens) + string;
        if (string !== " !important") node2.raws.important = string;
        break;
      } else if (token[1].toLowerCase() === "important") {
        let cache = tokens.slice(0);
        let str = "";
        for (let j = i; j > 0; j--) {
          let type = cache[j][0];
          if (str.trim().startsWith("!") && type !== "space") {
            break;
          }
          str = cache.pop()[1] + str;
        }
        if (str.trim().startsWith("!")) {
          node2.important = true;
          node2.raws.important = str;
          tokens = cache;
        }
      }
      if (token[0] !== "space" && token[0] !== "comment") {
        break;
      }
    }
    let hasWord = tokens.some((i) => i[0] !== "space" && i[0] !== "comment");
    if (hasWord) {
      node2.raws.between += firstSpaces.map((i) => i[1]).join("");
      firstSpaces = [];
    }
    this.raw(node2, "value", firstSpaces.concat(tokens), customProperty);
    if (node2.value.includes(":") && !customProperty) {
      this.checkMissedSemicolon(tokens);
    }
  }
  doubleColon(token) {
    throw this.input.error(
      "Double colon",
      { offset: token[2] },
      { offset: token[2] + token[1].length }
    );
  }
  emptyRule(token) {
    let node2 = new Rule$1();
    this.init(node2, token[2]);
    node2.selector = "";
    node2.raws.between = "";
    this.current = node2;
  }
  end(token) {
    if (this.current.nodes && this.current.nodes.length) {
      this.current.raws.semicolon = this.semicolon;
    }
    this.semicolon = false;
    this.current.raws.after = (this.current.raws.after || "") + this.spaces;
    this.spaces = "";
    if (this.current.parent) {
      this.current.source.end = this.getPosition(token[2]);
      this.current.source.end.offset++;
      this.current = this.current.parent;
    } else {
      this.unexpectedClose(token);
    }
  }
  endFile() {
    if (this.current.parent) this.unclosedBlock();
    if (this.current.nodes && this.current.nodes.length) {
      this.current.raws.semicolon = this.semicolon;
    }
    this.current.raws.after = (this.current.raws.after || "") + this.spaces;
    this.root.source.end = this.getPosition(this.tokenizer.position());
  }
  freeSemicolon(token) {
    this.spaces += token[1];
    if (this.current.nodes) {
      let prev = this.current.nodes[this.current.nodes.length - 1];
      if (prev && prev.type === "rule" && !prev.raws.ownSemicolon) {
        prev.raws.ownSemicolon = this.spaces;
        this.spaces = "";
        prev.source.end = this.getPosition(token[2]);
        prev.source.end.offset += prev.raws.ownSemicolon.length;
      }
    }
  }
  // Helpers
  getPosition(offset) {
    let pos = this.input.fromOffset(offset);
    return {
      column: pos.col,
      line: pos.line,
      offset
    };
  }
  init(node2, offset) {
    this.current.push(node2);
    node2.source = {
      input: this.input,
      start: this.getPosition(offset)
    };
    node2.raws.before = this.spaces;
    this.spaces = "";
    if (node2.type !== "comment") this.semicolon = false;
  }
  other(start) {
    let end = false;
    let type = null;
    let colon = false;
    let bracket = null;
    let brackets = [];
    let customProperty = start[1].startsWith("--");
    let tokens = [];
    let token = start;
    while (token) {
      type = token[0];
      tokens.push(token);
      if (type === "(" || type === "[") {
        if (!bracket) bracket = token;
        brackets.push(type === "(" ? ")" : "]");
      } else if (customProperty && colon && type === "{") {
        if (!bracket) bracket = token;
        brackets.push("}");
      } else if (brackets.length === 0) {
        if (type === ";") {
          if (colon) {
            this.decl(tokens, customProperty);
            return;
          } else {
            break;
          }
        } else if (type === "{") {
          this.rule(tokens);
          return;
        } else if (type === "}") {
          this.tokenizer.back(tokens.pop());
          end = true;
          break;
        } else if (type === ":") {
          colon = true;
        }
      } else if (type === brackets[brackets.length - 1]) {
        brackets.pop();
        if (brackets.length === 0) bracket = null;
      }
      token = this.tokenizer.nextToken();
    }
    if (this.tokenizer.endOfFile()) end = true;
    if (brackets.length > 0) this.unclosedBracket(bracket);
    if (end && colon) {
      if (!customProperty) {
        while (tokens.length) {
          token = tokens[tokens.length - 1][0];
          if (token !== "space" && token !== "comment") break;
          this.tokenizer.back(tokens.pop());
        }
      }
      this.decl(tokens, customProperty);
    } else {
      this.unknownWord(tokens);
    }
  }
  parse() {
    let token;
    while (!this.tokenizer.endOfFile()) {
      token = this.tokenizer.nextToken();
      switch (token[0]) {
        case "space":
          this.spaces += token[1];
          break;
        case ";":
          this.freeSemicolon(token);
          break;
        case "}":
          this.end(token);
          break;
        case "comment":
          this.comment(token);
          break;
        case "at-word":
          this.atrule(token);
          break;
        case "{":
          this.emptyRule(token);
          break;
        default:
          this.other(token);
          break;
      }
    }
    this.endFile();
  }
  precheckMissedSemicolon() {
  }
  raw(node2, prop, tokens, customProperty) {
    let token, type;
    let length = tokens.length;
    let value = "";
    let clean = true;
    let next, prev;
    for (let i = 0; i < length; i += 1) {
      token = tokens[i];
      type = token[0];
      if (type === "space" && i === length - 1 && !customProperty) {
        clean = false;
      } else if (type === "comment") {
        prev = tokens[i - 1] ? tokens[i - 1][0] : "empty";
        next = tokens[i + 1] ? tokens[i + 1][0] : "empty";
        if (!SAFE_COMMENT_NEIGHBOR[prev] && !SAFE_COMMENT_NEIGHBOR[next]) {
          if (value.slice(-1) === ",") {
            clean = false;
          } else {
            value += token[1];
          }
        } else {
          clean = false;
        }
      } else {
        value += token[1];
      }
    }
    if (!clean) {
      let raw = tokens.reduce((all, i) => all + i[1], "");
      node2.raws[prop] = { raw, value };
    }
    node2[prop] = value;
  }
  rule(tokens) {
    tokens.pop();
    let node2 = new Rule$1();
    this.init(node2, tokens[0][2]);
    node2.raws.between = this.spacesAndCommentsFromEnd(tokens);
    this.raw(node2, "selector", tokens);
    this.current = node2;
  }
  spacesAndCommentsFromEnd(tokens) {
    let lastTokenType;
    let spaces = "";
    while (tokens.length) {
      lastTokenType = tokens[tokens.length - 1][0];
      if (lastTokenType !== "space" && lastTokenType !== "comment") break;
      spaces = tokens.pop()[1] + spaces;
    }
    return spaces;
  }
  // Errors
  spacesAndCommentsFromStart(tokens) {
    let next;
    let spaces = "";
    while (tokens.length) {
      next = tokens[0][0];
      if (next !== "space" && next !== "comment") break;
      spaces += tokens.shift()[1];
    }
    return spaces;
  }
  spacesFromEnd(tokens) {
    let lastTokenType;
    let spaces = "";
    while (tokens.length) {
      lastTokenType = tokens[tokens.length - 1][0];
      if (lastTokenType !== "space") break;
      spaces = tokens.pop()[1] + spaces;
    }
    return spaces;
  }
  stringFrom(tokens, from) {
    let result2 = "";
    for (let i = from; i < tokens.length; i++) {
      result2 += tokens[i][1];
    }
    tokens.splice(from, tokens.length - from);
    return result2;
  }
  unclosedBlock() {
    let pos = this.current.source.start;
    throw this.input.error("Unclosed block", pos.line, pos.column);
  }
  unclosedBracket(bracket) {
    throw this.input.error(
      "Unclosed bracket",
      { offset: bracket[2] },
      { offset: bracket[2] + 1 }
    );
  }
  unexpectedClose(token) {
    throw this.input.error(
      "Unexpected }",
      { offset: token[2] },
      { offset: token[2] + 1 }
    );
  }
  unknownWord(tokens) {
    throw this.input.error(
      "Unknown word " + tokens[0][1],
      { offset: tokens[0][2] },
      { offset: tokens[0][2] + tokens[0][1].length }
    );
  }
  unnamedAtrule(node2, token) {
    throw this.input.error(
      "At-rule without name",
      { offset: token[2] },
      { offset: token[2] + token[1].length }
    );
  }
};
var parser = Parser$1;
let Container$3 = container;
let Input$1 = input;
let Parser2 = parser;
function parse$5(css, opts) {
  let input2 = new Input$1(css, opts);
  let parser2 = new Parser2(input2);
  try {
    parser2.parse();
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      if (e.name === "CssSyntaxError" && opts && opts.from) {
        if (/\.scss$/i.test(opts.from)) {
          e.message += "\nYou tried to parse SCSS with the standard CSS parser; try again with the postcss-scss parser";
        } else if (/\.sass/i.test(opts.from)) {
          e.message += "\nYou tried to parse Sass with the standard CSS parser; try again with the postcss-sass parser";
        } else if (/\.less$/i.test(opts.from)) {
          e.message += "\nYou tried to parse Less with the standard CSS parser; try again with the postcss-less parser";
        }
      }
    }
    throw e;
  }
  return parser2.root;
}
var parse_1 = parse$5;
parse$5.default = parse$5;
Container$3.registerParse(parse$5);
let Container$2 = container;
let { my: my$1 } = symbols;
let Warning$2 = class Warning {
  constructor(text2, opts = {}) {
    this.type = "warning";
    this.text = text2;
    if (opts.node && opts.node.source) {
      if (!opts.node[my$1]) {
        Container$2.rebuild(opts.node);
      }
      let range = opts.node.rangeBy(opts);
      this.line = range.start.line;
      this.column = range.start.column;
      this.endLine = range.end.line;
      this.endColumn = range.end.column;
    }
    for (let opt in opts) this[opt] = opts[opt];
  }
  toString() {
    if (this.node) {
      return this.node.error(this.text, {
        index: this.index,
        plugin: this.plugin,
        word: this.word
      }).message;
    }
    if (this.plugin) {
      return this.plugin + ": " + this.text;
    }
    return this.text;
  }
};
var warning = Warning$2;
Warning$2.default = Warning$2;
let Warning$1 = warning;
let Result$3 = class Result {
  get content() {
    return this.css;
  }
  constructor(processor2, root2, opts) {
    this.processor = processor2;
    this.messages = [];
    this.root = root2;
    this.opts = opts;
    this.css = "";
    this.map = void 0;
  }
  toString() {
    return this.css;
  }
  warn(text2, opts = {}) {
    if (!opts.plugin) {
      if (this.lastPlugin && this.lastPlugin.postcssPlugin) {
        opts.plugin = this.lastPlugin.postcssPlugin;
      }
    }
    let warning2 = new Warning$1(text2, opts);
    this.messages.push(warning2);
    return warning2;
  }
  warnings() {
    return this.messages.filter((i) => i.type === "warning");
  }
};
var result = Result$3;
Result$3.default = Result$3;
let printed = {};
var warnOnce$2 = function warnOnce(message) {
  if (printed[message]) return;
  printed[message] = true;
  if (typeof console !== "undefined" && console.warn) {
    console.warn(message);
  }
};
let Container$1 = container;
let Document$2 = document$1;
let MapGenerator$1 = mapGenerator;
let parse$4 = parse_1;
let Result$2 = result;
let Root$2 = root;
let stringify$2 = stringify_1;
let { isClean, my } = symbols;
let warnOnce$1 = warnOnce$2;
const TYPE_TO_CLASS_NAME = {
  atrule: "AtRule",
  comment: "Comment",
  decl: "Declaration",
  document: "Document",
  root: "Root",
  rule: "Rule"
};
const PLUGIN_PROPS = {
  AtRule: true,
  AtRuleExit: true,
  Comment: true,
  CommentExit: true,
  Declaration: true,
  DeclarationExit: true,
  Document: true,
  DocumentExit: true,
  Once: true,
  OnceExit: true,
  postcssPlugin: true,
  prepare: true,
  Root: true,
  RootExit: true,
  Rule: true,
  RuleExit: true
};
const NOT_VISITORS = {
  Once: true,
  postcssPlugin: true,
  prepare: true
};
const CHILDREN = 0;
function isPromise(obj) {
  return typeof obj === "object" && typeof obj.then === "function";
}
function getEvents(node2) {
  let key = false;
  let type = TYPE_TO_CLASS_NAME[node2.type];
  if (node2.type === "decl") {
    key = node2.prop.toLowerCase();
  } else if (node2.type === "atrule") {
    key = node2.name.toLowerCase();
  }
  if (key && node2.append) {
    return [
      type,
      type + "-" + key,
      CHILDREN,
      type + "Exit",
      type + "Exit-" + key
    ];
  } else if (key) {
    return [type, type + "-" + key, type + "Exit", type + "Exit-" + key];
  } else if (node2.append) {
    return [type, CHILDREN, type + "Exit"];
  } else {
    return [type, type + "Exit"];
  }
}
function toStack(node2) {
  let events;
  if (node2.type === "document") {
    events = ["Document", CHILDREN, "DocumentExit"];
  } else if (node2.type === "root") {
    events = ["Root", CHILDREN, "RootExit"];
  } else {
    events = getEvents(node2);
  }
  return {
    eventIndex: 0,
    events,
    iterator: 0,
    node: node2,
    visitorIndex: 0,
    visitors: []
  };
}
function cleanMarks(node2) {
  let stack = [node2];
  while (stack.length > 0) {
    let next = stack.pop();
    next[isClean] = false;
    if (next.nodes) {
      for (let i of next.nodes) stack.push(i);
    }
  }
  return node2;
}
let postcss$2 = {};
let LazyResult$2 = class LazyResult {
  get content() {
    return this.stringify().content;
  }
  get css() {
    return this.stringify().css;
  }
  get map() {
    return this.stringify().map;
  }
  get messages() {
    return this.sync().messages;
  }
  get opts() {
    return this.result.opts;
  }
  get processor() {
    return this.result.processor;
  }
  get root() {
    return this.sync().root;
  }
  get [Symbol.toStringTag]() {
    return "LazyResult";
  }
  constructor(processor2, css, opts) {
    this.stringified = false;
    this.processed = false;
    let root2;
    if (typeof css === "object" && css !== null && (css.type === "root" || css.type === "document")) {
      root2 = cleanMarks(css);
    } else if (css instanceof LazyResult || css instanceof Result$2) {
      root2 = cleanMarks(css.root);
      if (css.map) {
        if (typeof opts.map === "undefined") opts.map = {};
        if (!opts.map.inline) opts.map.inline = false;
        opts.map.prev = css.map;
      }
    } else {
      let parser2 = parse$4;
      if (opts.syntax) parser2 = opts.syntax.parse;
      if (opts.parser) parser2 = opts.parser;
      if (parser2.parse) parser2 = parser2.parse;
      try {
        root2 = parser2(css, opts);
      } catch (error) {
        this.processed = true;
        this.error = error;
      }
      if (root2 && !root2[my]) {
        Container$1.rebuild(root2);
      }
    }
    this.result = new Result$2(processor2, root2, opts);
    this.helpers = { ...postcss$2, postcss: postcss$2, result: this.result };
    this.plugins = this.processor.plugins.map((plugin2) => {
      if (typeof plugin2 === "object" && plugin2.prepare) {
        return { ...plugin2, ...plugin2.prepare(this.result) };
      } else {
        return plugin2;
      }
    });
  }
  async() {
    if (this.error) return Promise.reject(this.error);
    if (this.processed) return Promise.resolve(this.result);
    if (!this.processing) {
      this.processing = this.runAsync();
    }
    return this.processing;
  }
  catch(onRejected) {
    return this.async().catch(onRejected);
  }
  finally(onFinally) {
    return this.async().then(onFinally, onFinally);
  }
  getAsyncError() {
    throw new Error("Use process(css).then(cb) to work with async plugins");
  }
  handleError(error, node2) {
    let plugin2 = this.result.lastPlugin;
    try {
      if (node2) node2.addToError(error);
      this.error = error;
      if (error.name === "CssSyntaxError" && !error.plugin) {
        error.plugin = plugin2.postcssPlugin;
        error.setMessage();
      } else if (plugin2.postcssVersion) {
        if (process.env.NODE_ENV !== "production") {
          let pluginName = plugin2.postcssPlugin;
          let pluginVer = plugin2.postcssVersion;
          let runtimeVer = this.result.processor.version;
          let a = pluginVer.split(".");
          let b = runtimeVer.split(".");
          if (a[0] !== b[0] || parseInt(a[1]) > parseInt(b[1])) {
            console.error(
              "Unknown error from PostCSS plugin. Your current PostCSS version is " + runtimeVer + ", but " + pluginName + " uses " + pluginVer + ". Perhaps this is the source of the error below."
            );
          }
        }
      }
    } catch (err) {
      if (console && console.error) console.error(err);
    }
    return error;
  }
  prepareVisitors() {
    this.listeners = {};
    let add = (plugin2, type, cb) => {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push([plugin2, cb]);
    };
    for (let plugin2 of this.plugins) {
      if (typeof plugin2 === "object") {
        for (let event in plugin2) {
          if (!PLUGIN_PROPS[event] && /^[A-Z]/.test(event)) {
            throw new Error(
              `Unknown event ${event} in ${plugin2.postcssPlugin}. Try to update PostCSS (${this.processor.version} now).`
            );
          }
          if (!NOT_VISITORS[event]) {
            if (typeof plugin2[event] === "object") {
              for (let filter in plugin2[event]) {
                if (filter === "*") {
                  add(plugin2, event, plugin2[event][filter]);
                } else {
                  add(
                    plugin2,
                    event + "-" + filter.toLowerCase(),
                    plugin2[event][filter]
                  );
                }
              }
            } else if (typeof plugin2[event] === "function") {
              add(plugin2, event, plugin2[event]);
            }
          }
        }
      }
    }
    this.hasListener = Object.keys(this.listeners).length > 0;
  }
  async runAsync() {
    this.plugin = 0;
    for (let i = 0; i < this.plugins.length; i++) {
      let plugin2 = this.plugins[i];
      let promise = this.runOnRoot(plugin2);
      if (isPromise(promise)) {
        try {
          await promise;
        } catch (error) {
          throw this.handleError(error);
        }
      }
    }
    this.prepareVisitors();
    if (this.hasListener) {
      let root2 = this.result.root;
      while (!root2[isClean]) {
        root2[isClean] = true;
        let stack = [toStack(root2)];
        while (stack.length > 0) {
          let promise = this.visitTick(stack);
          if (isPromise(promise)) {
            try {
              await promise;
            } catch (e) {
              let node2 = stack[stack.length - 1].node;
              throw this.handleError(e, node2);
            }
          }
        }
      }
      if (this.listeners.OnceExit) {
        for (let [plugin2, visitor] of this.listeners.OnceExit) {
          this.result.lastPlugin = plugin2;
          try {
            if (root2.type === "document") {
              let roots = root2.nodes.map(
                (subRoot) => visitor(subRoot, this.helpers)
              );
              await Promise.all(roots);
            } else {
              await visitor(root2, this.helpers);
            }
          } catch (e) {
            throw this.handleError(e);
          }
        }
      }
    }
    this.processed = true;
    return this.stringify();
  }
  runOnRoot(plugin2) {
    this.result.lastPlugin = plugin2;
    try {
      if (typeof plugin2 === "object" && plugin2.Once) {
        if (this.result.root.type === "document") {
          let roots = this.result.root.nodes.map(
            (root2) => plugin2.Once(root2, this.helpers)
          );
          if (isPromise(roots[0])) {
            return Promise.all(roots);
          }
          return roots;
        }
        return plugin2.Once(this.result.root, this.helpers);
      } else if (typeof plugin2 === "function") {
        return plugin2(this.result.root, this.result);
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }
  stringify() {
    if (this.error) throw this.error;
    if (this.stringified) return this.result;
    this.stringified = true;
    this.sync();
    let opts = this.result.opts;
    let str = stringify$2;
    if (opts.syntax) str = opts.syntax.stringify;
    if (opts.stringifier) str = opts.stringifier;
    if (str.stringify) str = str.stringify;
    let rootSource = this.result.root.source;
    if (opts.map === void 0 && !(rootSource && rootSource.input && rootSource.input.map)) {
      let result2 = "";
      str(this.result.root, (i) => {
        result2 += i;
      });
      this.result.css = result2;
      return this.result;
    }
    let map = new MapGenerator$1(str, this.result.root, this.result.opts);
    let data = map.generate();
    this.result.css = data[0];
    this.result.map = data[1];
    return this.result;
  }
  sync() {
    if (this.error) throw this.error;
    if (this.processed) return this.result;
    this.processed = true;
    if (this.processing) {
      throw this.getAsyncError();
    }
    for (let plugin2 of this.plugins) {
      let promise = this.runOnRoot(plugin2);
      if (isPromise(promise)) {
        throw this.getAsyncError();
      }
    }
    this.prepareVisitors();
    if (this.hasListener) {
      let root2 = this.result.root;
      while (!root2[isClean]) {
        root2[isClean] = true;
        this.walkSync(root2);
      }
      if (this.listeners.OnceExit) {
        if (root2.type === "document") {
          for (let subRoot of root2.nodes) {
            this.visitSync(this.listeners.OnceExit, subRoot);
          }
        } else {
          this.visitSync(this.listeners.OnceExit, root2);
        }
      }
    }
    return this.result;
  }
  then(onFulfilled, onRejected) {
    if (process.env.NODE_ENV !== "production") {
      if (!("from" in this.opts)) {
        warnOnce$1(
          "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
        );
      }
    }
    return this.async().then(onFulfilled, onRejected);
  }
  toString() {
    return this.css;
  }
  visitSync(visitors, node2) {
    for (let [plugin2, visitor] of visitors) {
      this.result.lastPlugin = plugin2;
      let promise;
      try {
        promise = visitor(node2, this.helpers);
      } catch (e) {
        throw this.handleError(e, node2.proxyOf);
      }
      if (node2.type !== "root" && node2.type !== "document" && !node2.parent) {
        return true;
      }
      if (isPromise(promise)) {
        throw this.getAsyncError();
      }
    }
  }
  visitTick(stack) {
    let visit = stack[stack.length - 1];
    let { node: node2, visitors } = visit;
    if (node2.type !== "root" && node2.type !== "document" && !node2.parent) {
      stack.pop();
      return;
    }
    if (visitors.length > 0 && visit.visitorIndex < visitors.length) {
      let [plugin2, visitor] = visitors[visit.visitorIndex];
      visit.visitorIndex += 1;
      if (visit.visitorIndex === visitors.length) {
        visit.visitors = [];
        visit.visitorIndex = 0;
      }
      this.result.lastPlugin = plugin2;
      try {
        return visitor(node2.toProxy(), this.helpers);
      } catch (e) {
        throw this.handleError(e, node2);
      }
    }
    if (visit.iterator !== 0) {
      let iterator = visit.iterator;
      if (visit.descending) {
        visit.descending = false;
        node2.indexes[iterator] += 1;
      }
      let child;
      while (child = node2.nodes[node2.indexes[iterator]]) {
        if (!child[isClean]) {
          child[isClean] = true;
          visit.descending = true;
          stack.push(toStack(child));
          return;
        }
        node2.indexes[iterator] += 1;
      }
      visit.iterator = 0;
      delete node2.indexes[iterator];
    }
    let events = visit.events;
    while (visit.eventIndex < events.length) {
      let event = events[visit.eventIndex];
      visit.eventIndex += 1;
      if (event === CHILDREN) {
        if (node2.nodes && node2.nodes.length) {
          node2[isClean] = true;
          visit.iterator = node2.getIterator();
        }
        return;
      } else if (this.listeners[event]) {
        visit.visitors = this.listeners[event];
        return;
      }
    }
    stack.pop();
  }
  walkSync(node2) {
    node2[isClean] = true;
    let stack = [{ eventIndex: 0, events: getEvents(node2), iterator: 0, node: node2 }];
    while (stack.length > 0) {
      let visit = stack[stack.length - 1];
      let visitNode = visit.node;
      if (visit.iterator !== 0) {
        let iterator = visit.iterator;
        if (visit.descending) {
          visit.descending = false;
          visitNode.indexes[iterator] += 1;
        }
        let child;
        let descended = false;
        while (child = visitNode.nodes[visitNode.indexes[iterator]]) {
          if (!child[isClean]) {
            child[isClean] = true;
            visit.descending = true;
            stack.push({
              eventIndex: 0,
              events: getEvents(child),
              iterator: 0,
              node: child
            });
            descended = true;
            break;
          }
          visitNode.indexes[iterator] += 1;
        }
        if (descended) continue;
        visit.iterator = 0;
        delete visitNode.indexes[iterator];
      }
      if (visit.eventIndex < visit.events.length) {
        let event = visit.events[visit.eventIndex];
        visit.eventIndex += 1;
        if (event === CHILDREN) {
          if (visitNode.nodes && visitNode.nodes.length) {
            visit.iterator = visitNode.getIterator();
          }
        } else {
          let visitors = this.listeners[event];
          if (visitors) {
            if (this.visitSync(visitors, visitNode.toProxy())) stack.pop();
          }
        }
        continue;
      }
      stack.pop();
    }
  }
  warnings() {
    return this.sync().warnings();
  }
};
LazyResult$2.registerPostcss = (dependant) => {
  postcss$2 = dependant;
};
var lazyResult = LazyResult$2;
LazyResult$2.default = LazyResult$2;
Root$2.registerLazyResult(LazyResult$2);
Document$2.registerLazyResult(LazyResult$2);
let MapGenerator2 = mapGenerator;
let parse$3 = parse_1;
let Result$1 = result;
let stringify$1 = stringify_1;
let warnOnce2 = warnOnce$2;
let NoWorkResult$1 = class NoWorkResult {
  get content() {
    return this.result.css;
  }
  get css() {
    return this.result.css;
  }
  get map() {
    return this.result.map;
  }
  get messages() {
    return [];
  }
  get opts() {
    return this.result.opts;
  }
  get processor() {
    return this.result.processor;
  }
  get root() {
    if (this._root) {
      return this._root;
    }
    let root2;
    let parser2 = parse$3;
    try {
      root2 = parser2(this._css, this._opts);
    } catch (error) {
      this.error = error;
    }
    if (this.error) {
      throw this.error;
    } else {
      this._root = root2;
      return root2;
    }
  }
  get [Symbol.toStringTag]() {
    return "NoWorkResult";
  }
  constructor(processor2, css, opts) {
    css = css.toString();
    this.stringified = false;
    this._processor = processor2;
    this._css = css;
    this._opts = opts;
    this._map = void 0;
    let str = stringify$1;
    this.result = new Result$1(this._processor, void 0, this._opts);
    this.result.css = css;
    let self = this;
    Object.defineProperty(this.result, "root", {
      get() {
        return self.root;
      }
    });
    let map = new MapGenerator2(str, void 0, this._opts, css);
    if (map.isMap()) {
      let [generatedCSS, generatedMap] = map.generate();
      if (generatedCSS) {
        this.result.css = generatedCSS;
      }
      if (generatedMap) {
        this.result.map = generatedMap;
      }
    } else {
      map.clearAnnotation();
      this.result.css = map.css;
    }
  }
  async() {
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve(this.result);
  }
  catch(onRejected) {
    return this.async().catch(onRejected);
  }
  finally(onFinally) {
    return this.async().then(onFinally, onFinally);
  }
  sync() {
    if (this.error) throw this.error;
    return this.result;
  }
  then(onFulfilled, onRejected) {
    if (process.env.NODE_ENV !== "production") {
      if (!("from" in this._opts)) {
        warnOnce2(
          "Without `from` option PostCSS could generate wrong source map and will not find Browserslist config. Set it to CSS file path or to `undefined` to prevent this warning."
        );
      }
    }
    return this.async().then(onFulfilled, onRejected);
  }
  toString() {
    return this._css;
  }
  warnings() {
    return [];
  }
};
var noWorkResult = NoWorkResult$1;
NoWorkResult$1.default = NoWorkResult$1;
let Document$1 = document$1;
let LazyResult$1 = lazyResult;
let NoWorkResult2 = noWorkResult;
let Root$1 = root;
let Processor$1 = class Processor {
  constructor(plugins = []) {
    this.version = "8.5.25";
    this.plugins = this.normalize(plugins);
  }
  normalize(plugins) {
    let normalized = [];
    for (let i of plugins) {
      if (i.postcss === true) {
        i = i();
      } else if (i.postcss) {
        i = i.postcss;
      }
      if (typeof i === "object" && Array.isArray(i.plugins)) {
        normalized = normalized.concat(i.plugins);
      } else if (typeof i === "object" && i.postcssPlugin) {
        normalized.push(i);
      } else if (typeof i === "function") {
        normalized.push(i);
      } else if (typeof i === "object" && (i.parse || i.stringify)) {
        if (process.env.NODE_ENV !== "production") {
          throw new Error(
            "PostCSS syntaxes cannot be used as plugins. Instead, please use one of the syntax/parser/stringifier options as outlined in your PostCSS runner documentation."
          );
        }
      } else {
        throw new Error(i + " is not a PostCSS plugin");
      }
    }
    return normalized;
  }
  process(css, opts = {}) {
    if (!this.plugins.length && !opts.parser && !opts.stringifier && !opts.syntax) {
      return new NoWorkResult2(this, css, opts);
    } else {
      return new LazyResult$1(this, css, opts);
    }
  }
  use(plugin2) {
    this.plugins = this.plugins.concat(this.normalize([plugin2]));
    return this;
  }
};
var processor = Processor$1;
Processor$1.default = Processor$1;
Root$1.registerProcessor(Processor$1);
Document$1.registerProcessor(Processor$1);
let AtRule2 = atRule;
let Comment2 = comment;
let Container2 = container;
let CssSyntaxError2 = cssSyntaxError;
let Declaration2 = declaration;
let Document2 = document$1;
let fromJSON = fromJSON_1;
let Input2 = input;
let LazyResult2 = lazyResult;
let list = list_1;
let Node$1 = node;
let parse$2 = parse_1;
let Processor2 = processor;
let Result2 = result;
let Root2 = root;
let Rule2 = rule;
let stringify = stringify_1;
let Warning2 = warning;
function postcss(...plugins) {
  if (plugins.length === 1 && Array.isArray(plugins[0])) {
    plugins = plugins[0];
  }
  return new Processor2(plugins);
}
postcss.plugin = function plugin(name, initializer) {
  let warningPrinted = false;
  function creator(...args) {
    if (console && console.warn && !warningPrinted) {
      warningPrinted = true;
      console.warn(
        name + ": postcss.plugin was deprecated. Migration guide:\nhttps://evilmartians.com/chronicles/postcss-8-plugin-migration"
      );
      if (process.env.LANG && process.env.LANG.startsWith("cn")) {
        console.warn(
          name + ": 里面 postcss.plugin 被弃用. 迁移指南:\nhttps://www.w3ctech.com/topic/2226"
        );
      }
    }
    let transformer = initializer(...args);
    transformer.postcssPlugin = name;
    transformer.postcssVersion = new Processor2().version;
    return transformer;
  }
  let cache;
  Object.defineProperty(creator, "postcss", {
    get() {
      if (!cache) cache = creator();
      return cache;
    }
  });
  creator.process = function(css, processOpts, pluginOpts) {
    return postcss([creator(pluginOpts)]).process(css, processOpts);
  };
  return creator;
};
postcss.stringify = stringify;
postcss.parse = parse$2;
postcss.fromJSON = fromJSON;
postcss.list = list;
postcss.comment = (defaults) => new Comment2(defaults);
postcss.atRule = (defaults) => new AtRule2(defaults);
postcss.decl = (defaults) => new Declaration2(defaults);
postcss.rule = (defaults) => new Rule2(defaults);
postcss.root = (defaults) => new Root2(defaults);
postcss.document = (defaults) => new Document2(defaults);
postcss.CssSyntaxError = CssSyntaxError2;
postcss.Declaration = Declaration2;
postcss.Container = Container2;
postcss.Processor = Processor2;
postcss.Document = Document2;
postcss.Comment = Comment2;
postcss.Warning = Warning2;
postcss.AtRule = AtRule2;
postcss.Result = Result2;
postcss.Input = Input2;
postcss.Rule = Rule2;
postcss.Root = Root2;
postcss.Node = Node$1;
LazyResult2.registerPostcss(postcss);
var postcss_1 = postcss;
postcss.default = postcss;
const postcss$1 = /* @__PURE__ */ getDefaultExportFromCjs(postcss_1);
postcss$1.stringify;
postcss$1.fromJSON;
postcss$1.plugin;
postcss$1.parse;
postcss$1.list;
postcss$1.document;
postcss$1.comment;
postcss$1.atRule;
postcss$1.rule;
postcss$1.decl;
postcss$1.root;
postcss$1.CssSyntaxError;
postcss$1.Declaration;
postcss$1.Container;
postcss$1.Processor;
postcss$1.Document;
postcss$1.Comment;
postcss$1.Warning;
postcss$1.AtRule;
postcss$1.Result;
postcss$1.Input;
postcss$1.Rule;
postcss$1.Root;
postcss$1.Node;
function sourceEditingCssErrors(css) {
  let root2;
  try {
    root2 = postcss$1.parse(css);
  } catch {
    return ["Source CSS is not valid CSS."];
  }
  const errors = [];
  root2.walkAtRules((rule2) => {
    if (rule2.name.toLowerCase() !== "media") errors.push(`CSS @${rule2.name} is not supported.`);
  });
  root2.walkRules((rule2) => {
    var _a;
    if (((_a = rule2.parent) == null ? void 0 : _a.type) === "rule") errors.push("Nested CSS rules are not supported by live editing.");
    for (const selector of rule2.selectors) {
      if (!/^\.movcues-widget(?:\b|[.#:[>+~\s])/.test(selector.trim())) errors.push(`Unscoped selector: ${selector}`);
      if (selector.includes("::") || /#[A-Za-z_-]/.test(selector) || selector.length > 512) errors.push(`Editable selectors must use classes/attributes, without IDs or pseudo-elements: ${selector}`);
    }
  });
  root2.walkDecls((decl) => {
    const property = decl.prop.toLowerCase(), value = decl.value.trim().toLowerCase();
    if (/^(?:animation|transition)(?:-|$)/.test(property) || ["behavior", "-moz-binding"].includes(property) || /expression\s*\(|javascript\s*:|url\s*\(/i.test(value)) errors.push(`Unsafe or unsupported CSS declaration: ${property}`);
    if (property === "position" && /^(absolute|fixed)$/.test(value) || property === "order" && value !== "0" || property === "flex-direction" && value.includes("reverse") || property === "grid-auto-flow" && value.includes("dense") || property === "content" && !["normal", "none"].includes(value)) errors.push(`Visual ordering/layout is not supported for live editing: ${property}: ${value}`);
  });
  return [...new Set(errors)];
}
class SourceStyles {
  constructor(css, widget) {
    this.widget = widget;
    this.root = postcss$1.parse(css);
  }
  toString() {
    return this.root.toString();
  }
  append(node2) {
    this.root.append(node2);
  }
  responsiveStack(element, enabled) {
    var _a;
    if (!enabled) {
      element.removeAttribute("data-movcues-responsive-stack");
      return;
    }
    element.dataset.movcuesResponsiveStack = "true";
    const identity = element.dataset.movcuesNodeId ? `data-movcues-node-id="${element.dataset.movcuesNodeId}"` : `data-movcues-block-id="${element.dataset.movcuesBlockId}"`;
    const marker = `[${identity}][data-movcues-responsive-stack="true"]`;
    const selector = element === this.widget ? `.movcues-widget${marker}` : `.movcues-widget ${marker}`;
    let media = this.root.nodes.find((node2) => node2.type === "atrule" && node2.name === "media" && node2.params === "(max-width:480px)");
    if (!media) {
      media = postcss$1.atRule({ name: "media", params: "(max-width:480px)" });
      this.root.append(media);
    }
    if ((_a = media.nodes) == null ? void 0 : _a.some((node2) => node2.type === "rule" && node2.selector === selector)) return;
    const rule2 = postcss$1.rule({ selector });
    rule2.append(postcss$1.decl({ prop: "display", value: "flex", important: true }), postcss$1.decl({ prop: "flex-direction", value: "column", important: true }));
    media.append(rule2);
  }
  removeIdentities(ids) {
    if (!ids.length) return;
    this.root.walkRules((rule2) => {
      const selectors = rule2.selectors.filter((selector) => !ids.some((id) => ["node", "block"].some((key) => {
        const marker = `[data-movcues-${key}-id="${id}"]`, count = selector.split(marker).length - 1;
        return count > 0 && (selector === `.movcues-widget ${marker.repeat(count)}` || selector === `.movcues-widget${marker.repeat(count)}`);
      })));
      if (!selectors.length) rule2.remove();
      else if (selectors.length !== rule2.selectors.length) rule2.selectors = selectors;
    });
  }
  active(rule2) {
    let parent = rule2.parent;
    while (parent && parent.type !== "root") {
      if (parent.type === "atrule" && parent.name === "media" && typeof matchMedia === "function" && !matchMedia(parent.params).matches) return false;
      if (parent.type === "atrule" && parent.name === "media" && typeof matchMedia !== "function") return false;
      parent = parent.parent;
    }
    return true;
  }
  matches(rule2, element) {
    try {
      return rule2.selectors.some((selector) => element.matches(selector));
    } catch {
      throw new Error(`Cannot safely inspect CSS selector: ${rule2.selector}`);
    }
  }
  value(element, property) {
    let value;
    this.root.walkRules((rule2) => {
      if (!this.active(rule2) || !this.matches(rule2, element)) return;
      const declaration2 = document.createElement("span").style;
      rule2.walkDecls((decl) => declaration2.setProperty(decl.prop, decl.value, decl.important ? "important" : ""));
      value = declaration2.getPropertyValue(property) || value;
    });
    if (!value && element.parentElement && ["color", "font-size", "font-weight", "line-height", "text-align"].includes(property)) return this.value(element.parentElement, property);
    return value;
  }
  set(element, property, value) {
    var _a;
    const rules = [];
    this.root.walkRules((rule2) => {
      if (this.matches(rule2, element)) rules.push(rule2);
    });
    const declares = (rule2) => rule2.nodes.some((node2) => node2.type === "decl" && (node2.prop === property || isShorthandFor(node2.prop, property)));
    const active = rules.filter((rule2) => this.active(rule2));
    const responsive = active.filter((rule2) => {
      var _a2;
      return ((_a2 = rule2.parent) == null ? void 0 : _a2.type) === "atrule" && declares(rule2);
    });
    const scope = ((_a = responsive[responsive.length - 1]) == null ? void 0 : _a.parent) ?? this.root;
    const scoped = active.filter((rule2) => rule2.parent === scope);
    const key = element.dataset.movcuesBlockId ? "data-movcues-block-id" : "data-movcues-node-id", id = element.getAttribute(key);
    const marker = `[${key}="${id}"]`;
    const all = [this.widget, ...Array.from(this.widget.querySelectorAll("*"))];
    const isolated = scoped.filter((rule2) => all.filter((candidate) => this.matches(rule2, candidate)).length === 1);
    const declaring = active.filter(declares);
    let target = declaring.length === 1 && isolated.includes(declaring[0]) ? declaring[0] : declaring.length === 0 ? isolated[isolated.length - 1] : void 0;
    if (!target) {
      const isDedicated = (rule2) => {
        const count = rule2.selector.split(marker).length - 1;
        return count > 0 && rule2.selector === (element === this.widget ? ".movcues-widget" : ".movcues-widget ") + marker.repeat(count);
      };
      target = scoped.find(isDedicated);
      const specificityBound = Math.max(1, ...active.filter((rule2) => rule2 !== target).map((rule2) => (rule2.selector.match(/[.[:]/g) ?? []).length + 1));
      const selector = (element === this.widget ? ".movcues-widget" : ".movcues-widget ") + marker.repeat(specificityBound);
      if (target) target.selector = selector;
      else {
        target = postcss$1.rule({ selector });
        scope.append(target);
      }
    }
    let declaration2;
    target.walkDecls(property, (decl) => {
      declaration2 = decl;
    });
    const important = active.some((rule2) => rule2.nodes.some((node2) => node2.type === "decl" && node2.important && (node2.prop === property || isShorthandFor(node2.prop, property))));
    if (declaration2) {
      declaration2.value = value;
      declaration2.important || (declaration2.important = important);
    } else target.append(postcss$1.decl({ prop: property, value, important }));
  }
}
function isShorthandFor(shorthand, property) {
  return shorthand === "font" && (property.startsWith("font-") || property === "line-height") || ["padding", "margin", "border", "background", "flex"].some((group) => shorthand === group && property.startsWith(`${group}-`));
}
function remapSourceSelector(selector, attribute, ids) {
  for (const [before, after] of ids) for (const quote of ['"', "'", ""]) selector = selector.split(`[${attribute}=${quote}${before}${quote}]`).join(`[${attribute}=${quote}${after}${quote}]`);
  return selector;
}
const actionIdPattern = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
function parse$1(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template;
}
function validateSourceMarkup(operation, options) {
  var _a, _b;
  const errors = [];
  if (operation.widthPx !== void 0 && (options.widgetType !== "modal" || !Number.isInteger(operation.widthPx) || operation.widthPx < 320 || operation.widthPx > 960)) errors.push("Modal width must be a whole number from 320 to 960px.");
  if (operation.html.length > 1e5 || operation.css.length > 1e5) errors.push("Source proposal is too large.");
  if (safeScopedBuilderCss(operation.css) === null) errors.push("Source CSS is unsafe or contains an unscoped selector.");
  const template = parse$1(operation.html), elements = Array.from(template.content.querySelectorAll("*"));
  for (const element of elements) {
    if (!BUILDER_ALLOWED_TAGS.has(element.tagName) && !(options.survey && BUILDER_SURVEY_INPUT_TAGS.has(element.tagName))) errors.push(`Unsupported element: ${element.tagName.toLowerCase()}`);
    for (const attribute of Array.from(element.attributes)) if (!BUILDER_ALLOWED_ATTRIBUTES.has(attribute.name) || /^on/i.test(attribute.name)) errors.push(`Unsupported attribute: ${attribute.name}`);
    if (element instanceof HTMLImageElement && !builderImageUrlIsSafe(element.getAttribute("src") ?? "")) errors.push("Unsafe image URL.");
    if (element instanceof HTMLAnchorElement && !builderLinkUrlIsSafe(element.getAttribute("href") ?? "")) errors.push("Unsafe link URL.");
    if (element instanceof HTMLInputElement && !builderInputTypeIsSafe(element.type)) errors.push("Unsafe input type.");
  }
  const roots = elements.filter((element) => element.classList.contains("movcues-widget"));
  if (roots.length !== 1) errors.push("Source HTML must contain exactly one .movcues-widget root.");
  const topLevelElements = Array.from(template.content.children);
  if (topLevelElements.length !== 1 || topLevelElements[0] !== roots[0] || Array.from(template.content.childNodes).some((node2) => {
    var _a2;
    return node2.nodeType === Node.TEXT_NODE && ((_a2 = node2.textContent) == null ? void 0 : _a2.trim());
  })) errors.push("The .movcues-widget root must be the sole top-level element.");
  if (((_a = roots[0]) == null ? void 0 : _a.dataset.movcuesWidgetType) !== options.widgetType) errors.push("The widget root type cannot be changed.");
  if (roots[0] && !roots[0].dataset.movcuesDocumentVersion) errors.push("The widget root document version must be preserved.");
  const ids = elements.map((element) => element.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push("Source HTML contains duplicate IDs.");
  const buttons = elements.filter((element) => element instanceof HTMLButtonElement && !element.dataset.movcuesSurveyAction && !element.dataset.movcuesOptionId && !element.dataset.movcuesChecklistRole && !element.dataset.movcuesChecklistItemRole);
  const actionIds = buttons.map((button) => button.dataset.movcuesActionId ?? "");
  if (actionIds.some((value) => !actionIdPattern.test(value)) || new Set(actionIds).size !== actionIds.length) errors.push("Every ordinary button needs one unique valid action ID.");
  const bindings = Object.keys(operation.actionBindings);
  if (bindings.length !== actionIds.length || actionIds.some((value) => !(value in operation.actionBindings))) errors.push("Button actions and action bindings must match exactly.");
  for (const action of Object.values(operation.actionBindings)) {
    if (!options.guide && (action.type === "next_step" || action.type === "previous_step")) errors.push(`${action.type} is only supported by Guides.`);
    if (action.type === "open_url" && !/^https?:\/\//i.test(action.url)) errors.push("Open URL actions must use HTTP(S).");
    if (action.type === "track_event" && (!action.eventName.trim() || /[\u0000-\u001f\u007f]/.test(action.eventName))) errors.push("Track-event action is invalid.");
  }
  if (options.survey) {
    for (const question of options.survey.questions) {
      const matches = elements.filter((element) => element.dataset.movcuesQuestionId === question.id);
      if (matches.length !== 1 || matches[0].dataset.movcuesQuestionType !== question.type) errors.push(`Survey question ${question.id} was changed or removed.`);
    }
    if (elements.filter((element) => element.hasAttribute("data-movcues-survey-controls")).length !== 1 || elements.filter((element) => element.dataset.movcuesSurveyAction === "submit").length !== 1) errors.push("Survey controls and submission must be preserved.");
  }
  if (options.checklist) {
    const taskElements = elements.filter((element) => element.hasAttribute("data-movcues-checklist-item-id") || element.dataset.movcuesChecklistRole === "item");
    const taskIds = taskElements.map((element) => element.dataset.movcuesChecklistItemId ?? "");
    if (taskElements.some((element) => element.tagName !== "BUTTON" || element.dataset.movcuesChecklistRole !== "item")) errors.push("Checklist task components must use canonical button/item semantics.");
    if (taskIds.length !== options.checklist.items.length || taskIds.some((id) => !options.checklist.items.some((item) => item.id === id))) errors.push("Checklist source task identities must match the canonical items exactly.");
    for (const role of ["root", "title", "items", "progress", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge"]) if (elements.filter((element) => element.dataset.movcuesChecklistRole === role).length !== 1) errors.push(`Checklist role ${role} must be preserved.`);
    for (const item of options.checklist.items) if (elements.filter((element) => element.dataset.movcuesChecklistItemId === item.id).length !== 1) errors.push(`Checklist item ${item.id} must be preserved.`);
  }
  if (options.editable && roots[0]) errors.push(...sourceEditabilityErrors(sourceElement(roots[0]), options.previousHtml && parse$1(options.previousHtml).content.firstElementChild ? sourceElement(parse$1(options.previousHtml).content.firstElementChild) : void 0, (_b = options.survey) == null ? void 0 : _b.questions), ...sourceEditingCssErrors(operation.css));
  return [...new Set(errors)];
}
function applySourceMarkup(builder, content, operation, options) {
  const errors = validateSourceMarkup(operation, { ...options, editable: true, previousHtml: options.previousHtml ?? builder.html });
  if (errors.length) throw new Error(errors.join(" "));
  const previous = builder.projectData.movcues && typeof builder.projectData.movcues === "object" ? builder.projectData.movcues : {};
  builder.html = operation.html;
  builder.css = operation.css;
  builder.projectData = { ...builder.projectData, movcues: { ...previous, authoringSurface: "source", sourceVersion: 1, sourceEditabilityVersion: SOURCE_EDITABILITY.version, actionBindings: structuredClone(operation.actionBindings) } };
  const template = parse$1(operation.html), heading = template.content.querySelector('[data-movcues-content="heading"]'), body = template.content.querySelector('[data-movcues-content="body"]');
  if (heading) content.heading = (heading.textContent ?? "").trim().slice(0, 500);
  if (body) content.body = (body.textContent ?? "").trim().slice(0, 1e4);
}
function sourceContext(builder, guide) {
  const movcues = builder.projectData.movcues && typeof builder.projectData.movcues === "object" ? builder.projectData.movcues : {};
  return { html: builder.html, css: builder.css, authoringSurface: movcues.authoringSurface === "source" ? "source" : "onsite", actionBindings: structuredClone(movcues.actionBindings ?? {}), supportedActions: guide ? ["dismiss", "next_step", "previous_step", "open_url", "track_event"] : ["dismiss", "open_url", "track_event"] };
}
function aiDocumentContext(value) {
  const clone = structuredClone(value);
  const visit = (node2) => {
    if (Array.isArray(node2)) {
      node2.forEach(visit);
      return;
    }
    if (!node2 || typeof node2 !== "object") return;
    for (const [key, item] of Object.entries(node2)) {
      if (key === "src" && typeof item === "string" && /^data:image\//i.test(item)) {
        node2[key] = `[inline image data omitted from structured context; ${item.length} characters; preserve the image from source HTML]`;
      } else visit(item);
    }
  };
  visit(clone);
  return clone;
}
function isSourceAuthored(builder) {
  const movcues = builder == null ? void 0 : builder.projectData.movcues;
  return Boolean(movcues && typeof movcues === "object" && movcues.authoringSurface === "source");
}
function sourceElement(element) {
  return { tag: element.tagName.toLowerCase(), attrs: Object.fromEntries(Array.from(element.attributes, (attr) => [attr.name, attr.value])), text: Array.from(element.childNodes).filter((node2) => node2.nodeType === Node.TEXT_NODE).map((node2) => node2.textContent ?? "").join(""), children: Array.from(element.children, sourceElement) };
}
const esc = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
class ChecklistEditor {
  constructor(root2, definition, references, options) {
    var _a, _b, _c, _d;
    this.root = root2;
    this.definition = definition;
    this.references = references;
    this.options = options;
    this.renderer = new ChecklistRenderer();
    this.step = document.createElement("div");
    this.task = document.createElement("div");
    this.tools = document.createElement("div");
    this.style = document.createElement("style");
    this.view = "expanded";
    this.preview = false;
    this.completed = /* @__PURE__ */ new Set();
    this.sample = /* @__PURE__ */ new Map();
    this.onChange = (event) => {
      var _a2, _b2, _c2, _d2;
      const input2 = event.target;
      if (!input2.matches("[data-checklist-view]") && !this.options.canEdit()) return;
      if (input2.matches("[data-checklist-view]")) {
        if (this.options.flush()) {
          this.view = input2.value;
          this.closeMobileInspector();
          this.options.render();
        }
        return;
      }
      const c = this.options.composer();
      if (!c) return;
      const item = c.getSelectedTask();
      if (input2.matches("[data-checklist-sample]") && item) {
        this.sample.set(item.id, input2.value);
        (_a2 = this.options.composer()) == null ? void 0 : _a2.refreshChecklist();
        return;
      }
      if (input2.matches("[data-checklist-view-width]")) {
        c.updateChecklistViewWidth(Number(input2.value));
        return;
      }
      if (input2.matches("[data-checklist-font]")) {
        c.updateBlock({ fontSize: Number(input2.value) });
        return;
      }
      if (input2.matches("[data-checklist-color]")) {
        c.updateBlock({ color: input2.value });
        return;
      }
      if (input2.matches("[data-checklist-indicator]")) {
        c.updateBlock({ indicator: input2.value });
        return;
      }
      if (input2.matches("[data-checklist-launcher-label]")) {
        c.updateBlock({ text: input2.value });
        return;
      }
      if (this.step.contains(input2)) {
        c.updateChecklist((next2) => {
          if (input2.matches("[data-checklist-title]")) next2.title = input2.value;
          if (input2.matches("[data-checklist-description]")) next2.description = input2.value;
          if (input2.matches("[data-checklist-completion-title]")) next2.completionMessage.title = input2.value;
          if (input2.matches("[data-checklist-completion-description]")) next2.completionMessage.description = input2.value;
          if (input2.matches("[data-checklist-ack]")) next2.completionMessage.acknowledgeLabel = input2.value;
          if (input2.matches("[data-checklist-position]")) next2.behavior.position = input2.value;
          if (input2.matches("[data-checklist-order]")) next2.behavior.order = input2.value;
          if (input2.matches("[data-checklist-initial]")) next2.behavior.initialState = input2.value;
          if (input2.matches("[data-checklist-dismissible]")) next2.behavior.dismissible = input2.checked;
          if (input2.matches("[data-checklist-remaining]")) next2.behavior.showRemainingCount = input2.checked;
        });
        return;
      }
      if (!item || !this.task.contains(input2)) return;
      const next = structuredClone(item);
      if (input2.matches("[data-checklist-task-title]")) next.title = input2.value;
      if (input2.matches("[data-checklist-task-description]")) next.description = input2.value;
      if (input2.matches("[data-checklist-action]")) next.action = input2.value === "none" ? { type: "none" } : input2.value === "launch_guide" ? { type: "launch_guide", experienceId: ((_b2 = this.references.guides[0]) == null ? void 0 : _b2.id) ?? "" } : { type: input2.value, url: input2.value === "navigate" ? "/" : location.origin };
      if (input2.matches("[data-checklist-action-guide]")) next.action = { type: "launch_guide", experienceId: input2.value };
      if (input2.matches("[data-checklist-url]") && "url" in next.action) next.action.url = input2.value;
      if (input2.matches("[data-checklist-condition]")) next.completion = input2.value === "item_clicked" ? { type: "item_clicked" } : input2.value === "segment" ? { type: "segment", segmentId: ((_c2 = this.references.segments[0]) == null ? void 0 : _c2.id) ?? "" } : { type: "guide_completed", experienceId: ((_d2 = this.references.guides[0]) == null ? void 0 : _d2.id) ?? "" };
      if (input2.matches("[data-checklist-segment]")) next.completion = { type: "segment", segmentId: input2.value };
      if (input2.matches("[data-checklist-completion-guide]")) next.completion = { type: "guide_completed", experienceId: input2.value };
      if (next.action.type === "launch_guide" && !next.action.experienceId || next.completion.type === "segment" && !next.completion.segmentId || next.completion.type === "guide_completed" && !next.completion.experienceId) {
        this.options.error(["Select a Guide or Segment from this site."]);
        return;
      }
      c.updateChecklist((value) => {
        value.items = value.items.map((task) => task.id === next.id ? next : task);
      });
      this.sync();
    };
    this.onClick = (event) => {
      var _a2, _b2, _c2;
      const button = (_b2 = (_a2 = event.target) == null ? void 0 : _a2.closest) == null ? void 0 : _b2.call(_a2, "button");
      if (!button) return;
      if (button.matches("[data-checklist-reset]")) {
        this.completed.clear();
        this.sample.clear();
        this.view = "expanded";
        this.options.render();
        return;
      }
      if (!this.options.canEdit()) return;
      if (button.matches("[data-checklist-add]")) {
        this.view = "expanded";
        const c = this.options.composer();
        if (c == null ? void 0 : c.insertTask()) this.sync();
      }
      if (button.matches("[data-checklist-task-move]")) (_c2 = this.options.composer()) == null ? void 0 : _c2.move(Number(button.dataset.checklistTaskMove));
    };
    this.step.dataset.checklistInspector = "";
    this.step.innerHTML = '<label>View width<input type="number" data-checklist-view-width min="120" max="720"></label><small>Width for the selected visual state. It automatically fits small screens.</small><label>Checklist title<input data-checklist-title maxlength="160"></label><label>Description<textarea data-checklist-description rows="3" maxlength="2000"></textarea></label><label>Position<select data-checklist-position><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option></select></label><label>Task order<select data-checklist-order><option value="any">Any order</option><option value="sequential">In order</option></select></label><small>In order unlocks each task after the previous task is completed.</small><label>Start as<select data-checklist-initial><option value="expanded">Expanded</option><option value="collapsed">Collapsed</option></select></label><label class="check"><input type="checkbox" data-checklist-dismissible> Allow dismissal</label><label class="check"><input type="checkbox" data-checklist-remaining> Show remaining count</label><label>Completion title<input data-checklist-completion-title maxlength="160"></label><label>Completion message<textarea data-checklist-completion-description rows="3" maxlength="2000"></textarea></label><label>Done button<input data-checklist-ack maxlength="80"></label><button type="button" class="secondary-button" data-checklist-add>Add task</button>';
    this.task.dataset.block = "checklist_task,checklist_text,checklist_control,checklist_progress";
    this.task.innerHTML = '<div data-checklist-task-fields><label>Task title<input data-checklist-task-title maxlength="200"></label><label>Description<textarea data-checklist-task-description rows="3" maxlength="1000"></textarea></label><label>Action<select data-checklist-action><option value="none">No action</option><option value="launch_guide">Launch Guide</option><option value="navigate">Go to a page</option><option value="open_url">Open external URL</option></select></label><label data-checklist-guide-field>Guide<select data-checklist-action-guide></select></label><label data-checklist-url-field>Page URL<input data-checklist-url type="url" maxlength="2000" placeholder="/getting-started"></label><label>Complete when<select data-checklist-condition><option value="item_clicked">Task clicked</option><option value="segment">Matches saved Segment</option><option value="guide_completed">Guide completed</option></select></label><label data-checklist-segment-field>Segment<select data-checklist-segment></select></label><label data-checklist-completion-guide-field>Guide<select data-checklist-completion-guide></select></label><small data-checklist-action-note></small><label>Sample status<select data-checklist-sample><option value="available">Available</option><option value="completed">Completed</option><option value="locked">Locked</option></select></label><label>Status icon<select data-checklist-indicator><option value="check">Check</option><option value="star">Star</option><option value="rocket">Rocket</option><option value="heart">Heart</option><option value="info">Info</option><option value="warning">Warning</option><option value="sparkles">Sparkles</option><option value="arrow">Arrow</option></select></label><div class="history-row"><button type="button" class="secondary-button compact" data-checklist-task-move="-1">Move earlier</button><button type="button" class="secondary-button compact" data-checklist-task-move="1">Move later</button></div></div><label data-checklist-launcher-field>Launcher label<input data-checklist-launcher-label maxlength="200"></label><label>Font size<input type="number" data-checklist-font min="10" max="48"></label><label>Color<input type="color" data-checklist-color></label>';
    this.tools.dataset.checklistTools = "";
    this.tools.innerHTML = '<select aria-label="Checklist visual state" data-checklist-view><option value="expanded">Expanded</option><option value="launcher">Collapsed</option><option value="completion">Completed</option></select><button type="button" class="secondary-button compact" data-checklist-add aria-label="Add Checklist task">＋ Task</button><button type="button" class="secondary-button compact" data-checklist-reset>Reset simulation</button><span data-checklist-preview-note hidden>Simulated progress</span>';
    (_a = this.root.querySelector("[data-inspector=step]")) == null ? void 0 : _a.append(this.step);
    (_b = this.root.querySelector("[data-inspector=block]")) == null ? void 0 : _b.append(this.task);
    (_c = this.root.querySelector("[data-editor-toolbar]")) == null ? void 0 : _c.append(this.tools);
    const guideOptions = '<option value="">Select Guide</option>' + references.guides.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}${g.status === "published" ? "" : " (not published)"}</option>`).join("");
    this.task.querySelectorAll("[data-checklist-action-guide],[data-checklist-completion-guide]").forEach((select) => select.innerHTML = guideOptions);
    this.task.querySelector("[data-checklist-segment]").innerHTML = '<option value="">Select Segment</option>' + references.segments.map((segment) => `<option value="${esc(segment.id)}">${esc(segment.name)}</option>`).join("");
    this.style.textContent = "[data-checklist-inspector],[data-block^=checklist_task]{display:grid;gap:8px}[data-checklist-inspector] small,[data-checklist-action-note]{font-size:11px;color:#64748b}[data-checklist-inspector] textarea,[data-block^=checklist_task] textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid #d7dce3;border-radius:6px;font:12px ui-sans-serif,system-ui;padding:7px}[data-checklist-tools]{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0;max-width:100%;padding:0 6px 6px}[data-checklist-tools] select{width:auto;max-width:100%;font-size:11px}[data-checklist-tools] span{font-size:10px;color:#64748b}[data-checklist-task-fields]{display:grid;gap:8px}";
    this.root.append(this.style);
    root2.addEventListener("change", this.onChange);
    root2.addEventListener("click", this.onClick);
    if (innerWidth <= 480) this.closeMobileInspector();
    else (_d = this.root.querySelector("aside")) == null ? void 0 : _d.classList.toggle("left-side", definition.behavior.position === "bottom-right");
  }
  sync() {
    var _a, _b, _c;
    const source = isSourceAuthored(this.definition.builder);
    this.root.querySelectorAll("[data-checklist-add],[data-checklist-task-move],[data-checklist-view-width],[data-checklist-indicator],[data-checklist-launcher-label]").forEach((control) => {
      control.disabled = source;
      control.title = source ? "Protected source task structure is preserved. Use the element inspector for visual styles." : "";
    });
    const c = this.options.composer(), task = c == null ? void 0 : c.getSelectedTask(), block = c == null ? void 0 : c.getSelectedBlock();
    this.task.querySelector("[data-checklist-task-fields]").hidden = !task;
    this.value("[data-checklist-view]", this.view);
    this.root.querySelector("[data-checklist-preview-note]").hidden = !this.preview;
    this.root.querySelectorAll("[data-checklist-add]").forEach((button) => {
      button.disabled = !this.options.canEdit() || this.definition.items.length >= 20;
    });
    const d = this.definition;
    this.value("[data-checklist-view-width]", String(((_b = (_a = c == null ? void 0 : c.getDocument().root.children) == null ? void 0 : _a.find((cell) => cell.checklistRole === this.view)) == null ? void 0 : _b.checklistWidth) ?? (this.view === "launcher" ? 220 : 360)));
    this.value("[data-checklist-title]", d.title);
    this.value("[data-checklist-description]", d.description ?? "");
    this.value("[data-checklist-position]", d.behavior.position);
    this.value("[data-checklist-order]", d.behavior.order);
    this.value("[data-checklist-initial]", d.behavior.initialState);
    this.check("[data-checklist-dismissible]", d.behavior.dismissible);
    this.check("[data-checklist-remaining]", d.behavior.showRemainingCount);
    this.value("[data-checklist-completion-title]", d.completionMessage.title);
    this.value("[data-checklist-completion-description]", d.completionMessage.description ?? "");
    this.value("[data-checklist-ack]", d.completionMessage.acknowledgeLabel);
    if (task) {
      this.value("[data-checklist-task-title]", task.title);
      this.value("[data-checklist-task-description]", task.description ?? "");
      this.value("[data-checklist-action]", task.action.type);
      this.value("[data-checklist-action-guide]", task.action.type === "launch_guide" ? task.action.experienceId : "");
      this.value("[data-checklist-url]", "url" in task.action ? task.action.url : "");
      this.value("[data-checklist-condition]", task.completion.type);
      this.value("[data-checklist-segment]", task.completion.type === "segment" ? task.completion.segmentId : "");
      this.value("[data-checklist-completion-guide]", task.completion.type === "guide_completed" ? task.completion.experienceId : "");
      this.value("[data-checklist-sample]", this.sample.get(task.id) ?? "available");
      this.hide("[data-checklist-guide-field]", task.action.type !== "launch_guide");
      this.hide("[data-checklist-url-field]", !["navigate", "open_url"].includes(task.action.type));
      this.hide("[data-checklist-segment-field]", task.completion.type !== "segment");
      this.hide("[data-checklist-completion-guide-field]", task.completion.type !== "guide_completed");
      const note = this.task.querySelector("[data-checklist-action-note]");
      note.textContent = task.action.type === "launch_guide" && ((_c = this.references.guides.find((g) => g.id === ("experienceId" in task.action ? task.action.experienceId : ""))) == null ? void 0 : _c.status) !== "published" ? "Publish the selected Guide before publishing this Checklist." : "Completion is verified by the server. Sample status changes only this editor.";
    }
    this.hide("[data-checklist-launcher-field]", (block == null ? void 0 : block.type) !== "checklist_text" || block.role !== "launcher-label");
    if (block == null ? void 0 : block.type.startsWith("checklist_")) {
      const visual = block;
      this.value("[data-checklist-font]", String(visual.fontSize));
      this.value("[data-checklist-color]", visual.color ?? "#111827");
      if (block.type === "checklist_task") this.value("[data-checklist-indicator]", block.indicator);
      if (block.type === "checklist_text" && block.role === "launcher-label") this.value("[data-checklist-launcher-label]", block.text ?? d.title);
    }
  }
  render(id, versionId, preview) {
    var _a, _b;
    this.preview = preview;
    const completed = this.view === "completion" ? this.definition.items.map((item) => item.id) : this.definition.items.filter((item) => this.completed.has(item.id)).map((item) => item.id);
    const ids = new Set(completed);
    let unlocked = true;
    const progress = { stateId: "editor-only", collapsed: this.view === "launcher", dismissed: false, complete: this.view === "completion", completionAcknowledged: false, completedItemIds: completed, items: this.definition.items.map((item) => {
      const state = ids.has(item.id) ? "completed" : this.definition.behavior.order === "sequential" && !unlocked ? "locked" : "available";
      if (!ids.has(item.id)) unlocked = false;
      return { id: item.id, state };
    }) };
    const mounted = this.renderer.render({ id, versionId, kind: "checklist", priority: 0, definition: this.definition, progress }, { onOpen: () => this.transition("expanded"), onCollapse: () => this.transition("launcher"), onDismiss: () => this.renderer.destroy(), onAcknowledge: () => this.renderer.destroy(), onItemClick: (itemId) => {
      this.completed.add(itemId);
      if (this.definition.items.every((item) => this.completed.has(item.id))) this.view = "completion";
      this.options.render();
    } });
    const host = this.host(id);
    if (host && document.body && !document.body.contains(host)) document.body.append(host);
    const surface = (_a = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _a.querySelector(".surface"), style = (_b = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _b.querySelector("style");
    if (surface) surface.dataset.movcuesBuilderSurface = "";
    if (style) style.dataset.movcuesBuilderStyle = "";
    this.sync();
    return mounted;
  }
  applyDesign(id) {
    var _a;
    const host = this.host(id), root2 = host == null ? void 0 : host.shadowRoot;
    if (!host || !root2) return;
    host.style.left = this.definition.behavior.position === "bottom-left" ? "16px" : "auto";
    host.style.right = this.definition.behavior.position === "bottom-right" ? "16px" : "auto";
    root2.querySelectorAll("[data-movcues-checklist-view]").forEach((view) => view.classList.toggle("is-active", view.dataset.movcuesChecklistView === this.view));
    let available = true;
    root2.querySelectorAll("[data-movcues-checklist-item-id]").forEach((node2) => {
      const explicit = this.sample.get(node2.dataset.movcuesChecklistItemId);
      node2.dataset.state = explicit ?? (this.definition.behavior.order === "sequential" && !available ? "locked" : "available");
      if (node2.dataset.state !== "completed") available = false;
    });
    root2.querySelector("[data-movcues-checklist-role=progress]").textContent = `${this.definition.items.filter((item) => this.sample.get(item.id) === "completed").length} of ${this.definition.items.length} complete`;
    root2.querySelectorAll("[data-movcues-checklist-role=dismiss]").forEach((node2) => node2.hidden = !this.definition.behavior.dismissible);
    const count = root2.querySelector("[data-movcues-checklist-role=remaining-count]");
    if (count) count.textContent = this.definition.behavior.showRemainingCount ? String(this.definition.items.length) : "";
    (_a = this.options.composer()) == null ? void 0 : _a.setChecklistView(this.view);
  }
  host(id) {
    return Array.from(document.querySelectorAll("[data-movcues-checklist]")).find((host) => host.dataset.movcuesChecklist === id) ?? null;
  }
  closeMobileInspector() {
    var _a, _b;
    if (innerWidth > 480) return;
    (_a = this.root.querySelector("aside")) == null ? void 0 : _a.classList.add("minimized");
    (_b = this.root.querySelector("[data-minimize]")) == null ? void 0 : _b.setAttribute("aria-expanded", "false");
  }
  transition(view) {
    this.view = view;
    this.options.render();
  }
  getView() {
    return this.view;
  }
  setDefinition(value) {
    this.definition = value;
  }
  value(selector, value) {
    const input2 = this.root.querySelector(selector);
    if (input2 && this.root.activeElement !== input2) input2.value = value;
  }
  check(selector, value) {
    const input2 = this.root.querySelector(selector);
    if (input2) input2.checked = value;
  }
  hide(selector, value) {
    const element = this.task.querySelector(selector);
    if (element) element.hidden = value;
  }
  destroyView() {
    this.renderer.destroy();
  }
  destroy() {
    this.renderer.destroy();
    this.root.removeEventListener("change", this.onChange);
    this.root.removeEventListener("click", this.onClick);
    this.step.remove();
    this.task.remove();
    this.tools.remove();
    this.style.remove();
  }
}
const checklistCopy = (value) => ({ title: value.title, description: value.description ?? "", "launcher-label": value.title, "remaining-count": "", "completion-title": value.completionMessage.title, "completion-description": value.completionMessage.description ?? "" });
const escapeChecklist = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CHECKLIST_CELL_CSS = '.movcues-widget--checklist{width:360px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;background:var(--movcues-bg,#fff);color:var(--movcues-fg,#111827);border:1px solid var(--movcues-border,#e2e8f0);border-radius:var(--movcues-theme-radius,12px);box-shadow:var(--movcues-theme-shadow,0 12px 40px #0f172a24);font:14px/1.4 var(--movcues-font-body,ui-sans-serif,system-ui)}.movcues-widget [data-movcues-checklist-view]:not(.is-active){display:none!important}.movcues-widget--checklist:has([data-movcues-checklist-view="launcher"].is-active){width:220px}.movcues-widget .movcues-checklist__item{display:flex;align-items:flex-start;gap:10px;width:100%;padding:10px;border:1px solid var(--movcues-border,#e2e8f0);border-radius:var(--movcues-button-radius,8px);background:var(--movcues-surface,#f8fafc);color:inherit;text-align:left;cursor:pointer;font:inherit}.movcues-widget .movcues-checklist__copy{display:grid;gap:3px}.movcues-widget [data-movcues-checklist-item-role="title"]{font-weight:600}.movcues-widget [data-movcues-checklist-item-role="description"]{font-size:.9em;color:var(--movcues-muted,#64748b)}.movcues-widget [data-movcues-checklist-item-role="state"]{display:grid;place-items:center;flex:none;width:22px;height:22px;border:1px solid #94a3b8;border-radius:50%;color:transparent}.movcues-widget [data-state="completed"] [data-movcues-checklist-item-role="state"]{background:#16a34a;border-color:#16a34a;color:#fff}.movcues-widget [data-state="locked"]{opacity:.5;cursor:not-allowed}.movcues-widget .movcues-checklist-progress-track{height:4px;border-radius:4px;background:#e2e8f0;overflow:hidden}.movcues-widget .movcues-checklist-progress-fill{display:block;height:100%;width:var(--movcues-checklist-progress,0%);background:var(--movcues-primary,#2563eb)}.movcues-widget .movcues-checklist-control{border:1px solid var(--movcues-border,#cbd5e1);border-radius:var(--movcues-button-radius,6px);padding:6px 10px;background:var(--movcues-surface,#fff);color:inherit;cursor:pointer;font:inherit}.movcues-widget [data-movcues-checklist-role="completion-acknowledge"]{background:var(--movcues-primary,#2563eb);border-color:var(--movcues-primary,#2563eb);color:var(--movcues-primary-fg,#fff)}.movcues-widget [data-movcues-checklist-view="launcher"]{cursor:pointer}.movcues-widget [hidden]{display:none!important}';
const QUESTION_TYPES = ["single_choice", "multiple_choice", "short_text", "long_text", "rating", "nps"];
function surveyQuestionMarkup(question, blockId) {
  const label = escape$1(question.label);
  let controls;
  if (question.type === "short_text" || question.type === "long_text") {
    const attrs = `class="movcues-survey-input" data-movcues-question-input aria-label="${label}" placeholder="${escape$1(question.placeholder ?? "")}" maxlength="${question.maxLength ?? 1e4}"${question.required ? ' aria-required="true"' : ""}`;
    controls = question.type === "short_text" ? `<input type="text" ${attrs}>` : `<textarea ${attrs}></textarea>`;
  } else {
    const options = question.type === "rating" || question.type === "nps" ? Array.from({ length: question.type === "nps" ? 11 : question.max - question.min + 1 }, (_, index) => {
      const value = String(index + (question.type === "nps" ? 0 : question.min));
      return { id: value, label: value };
    }) : question.options;
    controls = `<div class="movcues-survey-options">${options.map((option) => `<button type="button" class="movcues-survey-option" data-movcues-option-id="${escape$1(option.id)}" aria-pressed="false">${escape$1(option.label)}</button>`).join("")}</div>`;
  }
  return `<div class="movcues-block movcues-survey-question" data-movcues-block-id="${escape$1(blockId)}" data-movcues-question-id="${escape$1(question.id)}" data-movcues-question-type="${question.type}"><p class="movcues-survey-question__label">${label}${question.required ? " *" : ""}</p>${controls}</div>`;
}
function surveyControlsMarkup(blockId, label) {
  return `<div class="movcues-block movcues-survey-footer" data-movcues-block-id="${escape$1(blockId)}" data-movcues-survey-controls="onsite"><div data-movcues-survey-progress><span>Progress</span><span data-movcues-survey-progress-bar></span></div><p class="movcues-survey-validation" role="alert"></p><div class="movcues-survey-actions"><button type="button" data-movcues-survey-action="back">Back</button><button type="button" data-movcues-survey-action="next">Next</button><button type="button" data-movcues-survey-action="submit">${escape$1(label)}</button></div></div>`;
}
const SURVEY_CELL_CSS = ".movcues-widget .movcues-survey-question__label{margin:0 0 8px;font-weight:600}.movcues-widget .movcues-survey-options{display:flex;flex-wrap:wrap;gap:6px}.movcues-widget .movcues-survey-option,.movcues-widget [data-movcues-survey-action]{min-height:36px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:inherit;padding:8px 12px;font:inherit;cursor:pointer}.movcues-widget .movcues-survey-option.is-selected{border-color:var(--movcues-primary);background:color-mix(in srgb,var(--movcues-primary) 12%,white)}.movcues-widget .movcues-survey-input{box-sizing:border-box;width:100%;min-width:0;min-height:36px;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font:inherit}.movcues-widget textarea.movcues-survey-input{min-height:84px;resize:vertical}.movcues-widget .movcues-survey-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.movcues-widget .movcues-survey-footer{width:100%}.movcues-widget [data-movcues-survey-progress]{font-size:12px;margin-bottom:8px}.movcues-widget [data-movcues-survey-progress-bar]{display:block;height:3px;background:var(--movcues-primary);margin-top:5px}.movcues-widget .movcues-survey-validation{color:#b91c1c;font-size:12px}.movcues-widget .movcues-survey-question.has-error{outline:2px solid #dc2626;outline-offset:4px}";
function surveyQuestionErrors(questions) {
  var _a, _b, _c;
  if (!Array.isArray(questions) || questions.length > 20) return ["A Survey step supports at most 20 questions."];
  const errors = [], ids = /* @__PURE__ */ new Set();
  for (const question of questions) {
    if (!question || !QUESTION_TYPES.includes(question.type)) {
      errors.push("Unsupported Survey question type.");
      continue;
    }
    if (!question.id || question.id.length > 64 || ids.has(question.id)) errors.push("Question IDs must be unique and contain 1–64 characters.");
    ids.add(question.id);
    if (!((_a = question.label) == null ? void 0 : _a.trim()) || question.label.length > 500) errors.push("Question labels must contain 1–500 characters.");
    if (question.required !== void 0 && typeof question.required !== "boolean") errors.push("Required must be a boolean.");
    if (question.type === "single_choice" || question.type === "multiple_choice") {
      if (!Array.isArray(question.options) || !question.options.length || question.options.length > 20) errors.push("Choice questions need 1–20 options.");
      else {
        const optionIds = /* @__PURE__ */ new Set();
        for (const option of question.options) {
          if (!option.id || option.id.length > 64 || optionIds.has(option.id) || !((_b = option.label) == null ? void 0 : _b.trim()) || option.label.length > 200) errors.push("Options need unique IDs and nonempty labels (up to 200 characters).");
          optionIds.add(option.id);
        }
      }
    } else if (question.type === "rating" && (!Number.isInteger(question.min) || !Number.isInteger(question.max) || question.min < 0 || question.max > 100 || question.max <= question.min || question.max - question.min > 20)) errors.push("Rating needs an ascending range of at most 21 values between 0 and 100.");
    else if ((question.type === "short_text" || question.type === "long_text") && (question.maxLength !== void 0 && (!Number.isInteger(question.maxLength) || question.maxLength < 1 || question.maxLength > 1e4) || (((_c = question.placeholder) == null ? void 0 : _c.length) ?? 0) > 500)) errors.push("Text limit must be 1–10,000 and placeholder at most 500 characters.");
  }
  return errors;
}
function escape$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const ONSITE_LIMITS = {
  maxDepth: 8,
  maxNodes: 120,
  maxRichText: 1e4,
  maxImageUrl: 2e3,
  maxInlineImage: 65536,
  maxSerializedBytes: 25e4,
  minFixedSize: 24,
  maxFixedSize: 1200
};
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s-]+\)|[a-z]{1,20})$/i;
const SAFE_INLINE_TAGS = /* @__PURE__ */ new Set(["BR", "STRONG", "EM", "U", "A", "UL", "OL", "LI"]);
const ICONS = { check: "✓", star: "★", info: "ℹ", warning: "⚠", sparkles: "✦", arrow: "→", heart: "♥", rocket: "🚀" };
let idSequence = 0;
function onsiteId(prefix = "cell") {
  idSequence = (idSequence + 1) % 65535;
  const random = typeof crypto !== "undefined" && "getRandomValues" in crypto ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36)).join("") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}${idSequence.toString(36)}`.slice(0, 64);
}
function emptyCell(block) {
  return { type: "cell", id: onsiteId("cell"), direction: "column", sizing: { mode: "flexible", weight: 1 }, align: "stretch", justify: "start", gap: 12, padding: { top: 0, right: 0, bottom: 0, left: 0 }, ...block ? { block } : {} };
}
function createBlock(type, guide = false) {
  const id = onsiteId("block");
  if (type.startsWith("checklist_")) throw new Error("Insert a structured Checklist component.");
  if (type === "question") throw new Error("Insert a canonical Survey question first.");
  if (type === "survey_controls") return { id, type };
  if (type === "heading") return { id, type, html: "A clear heading", level: 2, fontSize: 24, weight: 600, lineHeight: 1.25 };
  if (type === "text") return { id, type, html: "Add supporting text for your visitors.", fontSize: 15, weight: 400, lineHeight: 1.5 };
  if (type === "button") return { id, type, label: guide ? "Next" : "Got it", action: { id: onsiteId("action"), type: guide ? "next_step" : "dismiss" }, variant: "primary", radius: 8, paddingX: 16, paddingY: 9, width: "hug", align: "right" };
  if (type === "image") return { id, type, src: "", alt: "", fit: "cover", width: 100, radius: 8, align: "center" };
  if (type === "divider") return { id, type, orientation: "horizontal", thickness: 1, color: "#dbe2ea" };
  if (type === "spacer") return { id, type, size: 24 };
  return { id, type: "icon", icon: "sparkles", size: 28, color: "#2563eb", align: "center" };
}
function createOnsiteDocument(guide = false) {
  const heading = emptyCell(createBlock("heading", guide));
  const text2 = emptyCell(createBlock("text", guide));
  const button = emptyCell(createBlock("button", guide));
  return { schemaVersion: 2, id: onsiteId("document"), root: { ...emptyCell(), direction: "column", gap: 12, padding: { top: 20, right: 20, bottom: 20, left: 20 }, children: [heading, text2, button] } };
}
function createOnsiteSurveyDocument(questions, content) {
  const document2 = createOnsiteDocument();
  document2.schemaVersion = 3;
  const heading = document2.root.children[0].block;
  if (heading.type === "heading" && content) heading.html = escapeText$1(content.heading);
  const body = document2.root.children[1].block;
  if (body.type === "text" && content) body.html = escapeText$1(content.body);
  document2.root.children = [...document2.root.children.slice(0, 2), ...questions.map((question) => emptyCell({ id: onsiteId("block"), type: "question", questionId: question.id, fontSize: 14 })), emptyCell(createBlock("survey_controls"))];
  document2.root.children.forEach((cell) => {
    cell.sizing = { mode: "hug" };
  });
  return document2;
}
function validateOnsiteSurveyDocument(document2, context) {
  const errors = surveyQuestionErrors(context.questions), counts = /* @__PURE__ */ new Map();
  const known = new Set(context.questions.map((question) => question.id));
  const blocks = listBlocks(document2.root);
  for (const block of blocks) if (block.type === "question") {
    counts.set(block.questionId, (counts.get(block.questionId) ?? 0) + 1);
    if (!known.has(block.questionId)) errors.push(`Orphaned question reference: ${block.questionId}.`);
  }
  for (const question of context.questions) if (counts.get(question.id) !== 1) errors.push(`Question ${question.id} must be referenced exactly once.`);
  if (blocks.filter((block) => block.type === "survey_controls").length !== 1) errors.push("Survey cells need exactly one navigation/progress block.");
  return errors;
}
function duplicateSurveyCell(document2, questions, id) {
  const candidate = cloneOnsite(document2), nextQuestions = cloneOnsite(questions);
  const cellId = duplicateCell(candidate, id);
  if (!cellId) return null;
  for (const block of listBlocks(findCell(candidate, cellId))) if (block.type === "question") {
    const source = questions.find((question) => question.id === block.questionId);
    if (!source) return null;
    const copy = cloneOnsite(source);
    copy.id = onsiteId("question");
    if (copy.type === "single_choice" || copy.type === "multiple_choice") copy.options.forEach((option) => {
      option.id = onsiteId("option");
    });
    block.questionId = copy.id;
    nextQuestions.push(copy);
  }
  if (!validateOnsiteDocument(candidate).valid || validateOnsiteSurveyDocument(candidate, { questions: nextQuestions }).length) return null;
  return { document: candidate, questions: nextQuestions, cellId };
}
function validateOnsiteChecklistDocument(document2, context) {
  const errors = [];
  const views = document2.root.children ?? [];
  if (document2.schemaVersion !== 4 || document2.root.checklistRole || document2.root.block || views.length !== 3 || !["expanded", "launcher", "completion"].every((role) => views.filter((cell) => cell.checklistRole === role).length === 1)) errors.push("Checklist document needs exactly one Expanded, Collapsed and Completed view.");
  const expected = { title: "expanded", description: "expanded", progress: "expanded", collapse: "expanded", dismiss: "expanded", "launcher-label": "launcher", "remaining-count": "launcher", "completion-title": "completion", "completion-description": "completion", "completion-acknowledge": "completion" };
  const counts = /* @__PURE__ */ new Map(), itemCounts = /* @__PURE__ */ new Map(), ids = /* @__PURE__ */ new Set();
  let containers = 0;
  if (!context.items.length || context.items.length > 20) errors.push("A Checklist needs 1–20 tasks.");
  for (const item of context.items) {
    if (ids.has(item.id)) errors.push("Checklist item IDs must be unique.");
    ids.add(item.id);
    if (!item.title.trim()) errors.push("Task title cannot be empty.");
  }
  const visit = (cell, view, inItems = false) => {
    var _a;
    if (cell.checklistRole === "items") {
      containers++;
      if (view !== "expanded" || inItems) errors.push("Task container belongs in the Expanded view.");
      inItems = true;
    }
    if (cell.checklistRole && cell.checklistRole !== "items" && cell !== views.find((value) => value.id === cell.id)) errors.push("Checklist views cannot be nested.");
    const block = cell.block;
    if ((block == null ? void 0 : block.type) === "checklist_task") {
      itemCounts.set(block.itemId, (itemCounts.get(block.itemId) ?? 0) + 1);
      if (!ids.has(block.itemId) || !inItems || view !== "expanded") errors.push("Orphaned task reference or task outside the Expanded task container.");
    } else if ((block == null ? void 0 : block.type) === "checklist_text" || (block == null ? void 0 : block.type) === "checklist_control" || (block == null ? void 0 : block.type) === "checklist_progress") {
      const role = block.type === "checklist_progress" ? "progress" : block.role;
      counts.set(role, (counts.get(role) ?? 0) + 1);
      if (expected[role] !== view || inItems) errors.push("Checklist structural component is in the wrong view.");
    } else if (block && ["question", "survey_controls", "button"].includes(block.type)) errors.push("Use Checklist controls and tasks in a Checklist document.");
    (_a = cell.children) == null ? void 0 : _a.forEach((child) => visit(child, view, inItems));
  };
  views.forEach((view) => visit(view, view.checklistRole ?? ""));
  if (containers !== 1) errors.push("Checklist needs exactly one task container.");
  for (const role of Object.keys(expected)) if (counts.get(role) !== 1) errors.push(`Checklist role ${role} must appear exactly once.`);
  for (const item of context.items) if (itemCounts.get(item.id) !== 1) errors.push(`Task ${item.id} must be referenced exactly once.`);
  const order = listBlocks(document2.root).filter((block) => block.type === "checklist_task").map((block) => block.itemId);
  if (JSON.stringify(order) !== JSON.stringify(context.items.map((item) => item.id))) errors.push("Task layout order must match the canonical item order.");
  return errors;
}
function duplicateChecklistCell(document2, context, cellId) {
  const candidate = cloneOnsite(document2), items = cloneOnsite(context.items), id = duplicateCell(candidate, cellId);
  if (!id) return null;
  for (const block of listBlocks(findCell(candidate, id))) if (block.type === "checklist_task") {
    const source = items.find((item) => item.id === block.itemId);
    if (!source) return null;
    const copy = { ...cloneOnsite(source), id: onsiteId("item") };
    block.itemId = copy.id;
    items.push(copy);
  }
  const ordered = listBlocks(candidate.root).filter((block) => block.type === "checklist_task").map((block) => items.find((item) => item.id === block.itemId));
  if (validateOnsiteChecklistDocument(candidate, { ...context, items: ordered }).length || !validateOnsiteDocument(candidate).valid) return null;
  return { document: candidate, items: ordered, cellId: id };
}
function onsiteDocumentFromBuilder(builder) {
  var _a;
  const movcues = (_a = builder == null ? void 0 : builder.projectData) == null ? void 0 : _a.movcues;
  if (!movcues || typeof movcues !== "object") return null;
  const document2 = movcues.onsiteDocument;
  return isOnsiteDocument(document2) ? document2 : null;
}
function applyOnsiteDocument(builder, document2, widgetType, survey, checklist) {
  const compiled = compileOnsiteDocument(document2, widgetType, survey, checklist);
  builder.version = 1;
  builder.projectData = { ...builder.projectData, movcues: { ...asRecord(builder.projectData.movcues), authoringSurface: "onsite", schemaVersion: document2.schemaVersion, onsiteDocument: document2, actionBindings: compiled.actionBindings } };
  builder.html = compiled.html;
  builder.css = compiled.css;
  return compiled;
}
function compileOnsiteDocument(document2, widgetType, survey, checklist) {
  var _a;
  const validation = validateOnsiteDocument(document2);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  if (document2.schemaVersion === 4) {
    if (widgetType !== "checklist" || !checklist || survey) throw new Error("Version 4 requires a Checklist context.");
    const errors = validateOnsiteChecklistDocument(document2, checklist);
    if (errors.length) throw new Error(errors.join(" "));
  } else if (checklist) throw new Error("Checklist cells require document version 4.");
  if (document2.schemaVersion === 3) {
    if (widgetType !== "survey" || !survey) throw new Error("Version 3 requires a Survey question context.");
    const errors = validateOnsiteSurveyDocument(document2, survey);
    if (errors.length) throw new Error(errors.join(" "));
  } else if (survey) throw new Error("Survey cells require document version 3.");
  const css = [
    ".movcues-widget{box-sizing:border-box;width:100%;max-width:100%;min-width:0;overflow-wrap:anywhere;padding:var(--movcues-theme-spacing,0);background:var(--movcues-bg);color:var(--movcues-fg);border-color:var(--movcues-border,transparent);border-radius:var(--movcues-theme-radius,inherit);font-family:var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);font-size:var(--movcues-font-body-size,15px);box-shadow:var(--movcues-theme-shadow,none)}",
    ".movcues-widget *{box-sizing:border-box}",
    ".movcues-widget .movcues-cell{display:flex;min-width:0;max-width:100%}",
    ".movcues-widget .movcues-block{min-width:0;max-width:100%;margin:0}",
    ".movcues-widget .movcues-block img{display:block;max-width:100%}",
    ".movcues-widget .movcues-heading{font-family:var(--movcues-font-heading,var(--movcues-font-body));font-size:var(--movcues-font-heading-size,inherit)}",
    ".movcues-widget .movcues-button{min-height:40px;border:0;border-radius:var(--movcues-button-radius,8px);font:600 14px/1.2 var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);cursor:pointer}",
    ".movcues-widget .movcues-button--primary{background:var(--movcues-primary);color:var(--movcues-primary-fg,#fff)}",
    ".movcues-widget .movcues-button--secondary{background:transparent;color:inherit}",
    ".movcues-widget .movcues-button--outline{background:transparent;color:inherit;border:1px solid currentColor}",
    ".movcues-widget .movcues-block--full{width:100%}"
  ];
  if (document2.schemaVersion === 3) css.push(SURVEY_CELL_CSS);
  if (document2.schemaVersion === 4) css.push(CHECKLIST_CELL_CSS);
  const html = renderCell(document2.root, css, 0, survey, checklist);
  css.push('@media(max-width:480px){.movcues-widget [data-movcues-responsive-stack="true"]{flex-direction:column!important}.movcues-widget [data-movcues-sizing="fixed"]{max-width:100%!important}.movcues-widget .movcues-button{min-height:40px}.movcues-widget img{height:auto!important}}');
  const blocks = listBlocks(document2.root);
  const firstHeading = blocks.find((block) => block.type === "heading");
  const text2 = blocks.filter((block) => block.type === "text").map((block) => richTextToPlain(block.html)).join("\n").slice(0, 2e3);
  const actions = blocks.filter((block) => block.type === "button");
  const actionBindings = Object.fromEntries(actions.map((block) => [block.action.id, block.action]));
  const legacy = actions.slice(0, 2).map((block) => ({ label: block.label, type: block.action.type === "previous_step" ? "dismiss" : block.action.type, ..."url" in block.action ? { url: block.action.url } : {}, ..."eventName" in block.action ? { eventName: block.action.eventName } : {} }));
  const content = {
    heading: checklist ? checklist.title : firstHeading ? richTextToPlain(firstHeading.html).slice(0, 160) : "",
    body: checklist ? checklist.description ?? "" : text2,
    ...legacy[0] ? { primaryAction: legacy[0] } : {},
    ...((_a = legacy[1]) == null ? void 0 : _a.type) === "dismiss" ? { secondaryAction: { label: legacy[1].label, type: "dismiss" } } : {}
  };
  return { html: `<section class="movcues-widget movcues-widget--${escapeAttribute(widgetType)}" data-movcues-widget-type="${escapeAttribute(widgetType)}" data-movcues-document-version="${document2.schemaVersion}"${checklist ? ' data-movcues-checklist-role="root"' : ""}>${html}</section>`, css: css.join(""), content, actionBindings };
}
function renderCell(cell, css, depth, survey, checklist) {
  var _a;
  const selector = `.movcues-widget [data-movcues-node-id="${cell.id}"]`;
  const sizing = cell.sizing.mode === "flexible" ? `flex:${round(cell.sizing.weight)} 1 0` : cell.sizing.mode === "hug" ? "flex:0 0 auto" : `flex:0 1 ${cell.sizing.value}px`;
  const style = cell.style ?? {};
  css.push(`${selector}{${sizing};flex-direction:${cell.direction};align-items:${cell.align};justify-content:${cell.justify};gap:${cell.gap}px;padding:${cell.padding.top}px ${cell.padding.right}px ${cell.padding.bottom}px ${cell.padding.left}px;${style.background ? `background:${style.background};` : ""}${style.borderWidth ? `border:${style.borderWidth}px solid ${style.borderColor ?? "#dbe2ea"};` : ""}${style.borderRadius ? `border-radius:${style.borderRadius}px;` : ""}}`);
  if (cell.checklistWidth !== void 0) css.push(`.movcues-widget--checklist:has([data-movcues-node-id="${cell.id}"].is-active){width:${cell.checklistWidth}px}`);
  const children = ((_a = cell.children) == null ? void 0 : _a.map((child) => renderCell(child, css, depth + 1, survey, checklist)).join("")) ?? (cell.block ? renderBlock(cell.block, css, survey, checklist) : "");
  return `<div class="movcues-cell" data-movcues-node-id="${cell.id}"${cell.checklistRole ? cell.checklistRole === "items" ? ' data-movcues-checklist-role="items"' : ` data-movcues-checklist-view="${cell.checklistRole}"` : ""} data-movcues-sizing="${cell.sizing.mode}"${cell.responsiveStack ? ' data-movcues-responsive-stack="true"' : ""}>${children}</div>`;
}
function renderBlock(block, css, survey, checklist) {
  const selector = `.movcues-widget [data-movcues-block-id="${block.id}"]`;
  const align = block.align ?? "left";
  if (block.type === "checklist_task" || block.type === "checklist_text" || block.type === "checklist_control" || block.type === "checklist_progress") {
    if (!checklist) throw new Error("Checklist component needs canonical context.");
    const item = block;
    css.push(`${selector}{font-size:${item.fontSize}px;text-align:${align};${item.color ? `color:${item.color};` : ""}}`);
    const attrs = `class="movcues-block" data-movcues-block-id="${block.id}"`;
    if (item.type === "checklist_task") {
      const task = checklist.items.find((value) => value.id === item.itemId);
      return `<button type="button" class="movcues-block movcues-checklist__item" data-movcues-block-id="${item.id}" data-movcues-checklist-role="item" data-movcues-checklist-item-id="${escapeChecklist(task.id)}"><span data-movcues-checklist-item-role="state">${ICONS[item.indicator]}</span><span class="movcues-checklist__copy"><span data-movcues-checklist-item-role="title">${escapeChecklist(task.title)}</span><span data-movcues-checklist-item-role="description">${escapeChecklist(task.description ?? "")}</span></span></button>`;
    }
    if (item.type === "checklist_text") return `<div ${attrs} data-movcues-checklist-role="${item.role}">${escapeChecklist(item.role === "launcher-label" && item.text !== void 0 ? item.text : checklistCopy(checklist)[item.role])}</div>`;
    if (item.type === "checklist_control") return `<button type="button" class="movcues-block movcues-checklist-control" data-movcues-block-id="${item.id}" data-movcues-checklist-role="${item.role}" aria-label="${item.role === "collapse" ? "Collapse checklist" : item.role === "dismiss" ? "Dismiss checklist" : "Acknowledge completion"}">${escapeChecklist(item.role === "collapse" ? "−" : item.role === "dismiss" ? "×" : checklist.completionMessage.acknowledgeLabel)}</button>`;
    return `<div ${attrs}><div data-movcues-checklist-role="progress"></div><div class="movcues-checklist-progress-track"><span class="movcues-checklist-progress-fill"></span></div></div>`;
  }
  if (block.type === "question") {
    css.push(`${selector}{font:${block.fontSize}px/1.5 var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);text-align:${align};${block.color ? `color:${block.color};` : ""}}`);
    return surveyQuestionMarkup(survey.questions.find((question) => question.id === block.questionId), block.id);
  }
  if (block.type === "survey_controls") return surveyControlsMarkup(block.id, (survey == null ? void 0 : survey.submitLabel) ?? "Submit");
  if (block.type === "heading") {
    css.push(`${selector}{font:${block.weight} ${block.fontSize}px/${block.lineHeight ?? 1.25} var(--movcues-font-heading,ui-sans-serif,system-ui,sans-serif);text-align:${align};${block.color ? `color:${block.color};` : ""}}`);
    return `<h${block.level} class="movcues-block movcues-heading" data-movcues-block-id="${block.id}" data-movcues-content="heading">${sanitizeRichText(block.html)}</h${block.level}>`;
  }
  if (block.type === "text") {
    css.push(`${selector}{font:${block.weight} ${block.fontSize}px/${block.lineHeight ?? 1.5} var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);text-align:${align};white-space:pre-wrap;${block.color ? `color:${block.color};` : ""}}`);
    return `<div class="movcues-block movcues-text" data-movcues-block-id="${block.id}" data-movcues-content="body">${sanitizeRichText(block.html)}</div>`;
  }
  if (block.type === "button") {
    css.push(`${selector}{align-self:${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};padding:${block.paddingY}px ${block.paddingX}px;border-radius:${block.radius}px;${block.width === "full" ? "width:100%;" : ""}${block.background ? `background:${block.background};` : ""}${block.color ? `color:${block.color};` : ""}}`);
    return `<button type="button" class="movcues-block movcues-button movcues-button--${block.variant}${block.width === "full" ? " movcues-block--full" : ""}" data-movcues-block-id="${block.id}" data-movcues-action-id="${block.action.id}">${escapeText$1(block.label)}</button>`;
  }
  if (block.type === "image") {
    css.push(`${selector}{align-self:${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};width:${block.width}%;${block.height ? `height:${block.height}px;` : "height:auto;"}object-fit:${block.fit};border-radius:${block.radius}px}`);
    return `<img class="movcues-block movcues-image" data-movcues-block-id="${block.id}" src="${escapeAttribute(block.src)}" alt="${escapeAttribute(block.alt)}">`;
  }
  if (block.type === "divider") {
    css.push(`${selector}{align-self:stretch;${block.orientation === "horizontal" ? `width:100%;height:${block.thickness}px` : `width:${block.thickness}px;min-height:24px`};border:0;background:${block.color}}`);
    return `<hr class="movcues-block movcues-divider" data-movcues-block-id="${block.id}">`;
  }
  if (block.type === "spacer") {
    css.push(`${selector}{flex:0 0 ${block.size}px;width:${block.size}px;height:${block.size}px}`);
    return `<div class="movcues-block movcues-spacer" data-movcues-block-id="${block.id}" aria-hidden="true"></div>`;
  }
  css.push(`${selector}{align-self:${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};font-size:${block.size}px;line-height:1;${block.color ? `color:${block.color};` : ""}}`);
  return `<span class="movcues-block movcues-icon" data-movcues-block-id="${block.id}" role="img" aria-label="${block.icon}">${ICONS[block.icon]}</span>`;
}
function validateOnsiteDocument(value) {
  const errors = [];
  if (!isOnsiteDocumentShape(value)) return { valid: false, errors: ["On-site document must use schemaVersion 2, 3 or 4 and contain one root cell."] };
  unexpectedKeys(value, ["schemaVersion", "id", "root"], "Document", errors);
  const ids = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  let count = 0;
  const addId = (id, path) => {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) errors.push(`${path} has an invalid ID.`);
    else if (ids.has(id)) errors.push(`${path} reuses ID ${id}.`);
    else ids.add(id);
  };
  const number = (input2, min, max, path) => {
    if (typeof input2 !== "number" || !Number.isFinite(input2) || input2 < min || input2 > max) errors.push(`${path} must be between ${min} and ${max}.`);
  };
  addId(value.id, "Document");
  const visit = (cell, depth, path) => {
    var _a, _b, _c, _d, _e;
    if (!cell || typeof cell !== "object") {
      errors.push(`${path} must be a cell object.`);
      return;
    }
    if (seen.has(cell)) {
      errors.push(`${path} creates a cycle or duplicate reference.`);
      return;
    }
    seen.add(cell);
    count++;
    addId(cell.id, path);
    unexpectedKeys(cell, ["type", "id", "checklistRole", "checklistWidth", "direction", "sizing", "align", "justify", "gap", "padding", "responsiveStack", "style", "children", "block"], path, errors);
    if (depth > ONSITE_LIMITS.maxDepth) errors.push(`${path} exceeds maximum nesting depth ${ONSITE_LIMITS.maxDepth}.`);
    if (!["row", "column"].includes(cell.direction)) errors.push(`${path} has an invalid direction.`);
    if (!["start", "center", "end", "stretch"].includes(cell.align)) errors.push(`${path} has an invalid alignment.`);
    if (!["start", "center", "end", "space-between"].includes(cell.justify)) errors.push(`${path} has an invalid distribution.`);
    if (cell.responsiveStack !== void 0 && typeof cell.responsiveStack !== "boolean") errors.push(`${path} responsiveStack must be a boolean.`);
    number(cell.gap, 0, 96, `${path} gap`);
    for (const side of ["top", "right", "bottom", "left"]) number((_a = cell.padding) == null ? void 0 : _a[side], 0, 128, `${path} padding ${side}`);
    if (((_b = cell.sizing) == null ? void 0 : _b.mode) === "flexible") number(cell.sizing.weight, 0.1, 20, `${path} flexible weight`);
    else if (((_c = cell.sizing) == null ? void 0 : _c.mode) === "fixed") number(cell.sizing.value, ONSITE_LIMITS.minFixedSize, ONSITE_LIMITS.maxFixedSize, `${path} fixed size`);
    else if (((_d = cell.sizing) == null ? void 0 : _d.mode) !== "hug") errors.push(`${path} has an invalid sizing mode.`);
    if (cell.sizing && typeof cell.sizing === "object") unexpectedKeys(cell.sizing, cell.sizing.mode === "flexible" ? ["mode", "weight"] : cell.sizing.mode === "fixed" ? ["mode", "value"] : ["mode"], `${path} sizing`, errors);
    if (cell.style) {
      unexpectedKeys(cell.style, ["background", "borderColor", "borderWidth", "borderRadius"], `${path} style`, errors);
      if (cell.style.background && !COLOR_PATTERN.test(cell.style.background)) errors.push(`${path} background is not supported.`);
      if (cell.style.borderColor && !COLOR_PATTERN.test(cell.style.borderColor)) errors.push(`${path} border color is not supported.`);
      if (cell.style.borderWidth !== void 0) number(cell.style.borderWidth, 0, 16, `${path} border width`);
      if (cell.style.borderRadius !== void 0) number(cell.style.borderRadius, 0, 100, `${path} border radius`);
    }
    if (cell.children && cell.block) errors.push(`${path} cannot contain both children and a block.`);
    if (cell.children) {
      if (!cell.children.length) errors.push(`${path} cannot contain an empty children list.`);
      cell.children.forEach((child, index) => visit(child, depth + 1, `${path} > cell ${index + 1}`));
    }
    if (cell.checklistWidth !== void 0 && (value.schemaVersion !== 4 || !["expanded", "launcher", "completion"].includes(cell.checklistRole ?? "") || !Number.isInteger(cell.checklistWidth) || cell.checklistWidth < 120 || cell.checklistWidth > 720)) errors.push(`${path} view width must be 120–720 pixels.`);
    if (cell.checklistRole !== void 0 && (value.schemaVersion !== 4 || !["expanded", "launcher", "completion", "items"].includes(cell.checklistRole))) errors.push(`${path} has an invalid Checklist container.`);
    if (((_e = cell.block) == null ? void 0 : _e.type.startsWith("checklist_")) && value.schemaVersion !== 4) errors.push("Checklist blocks require schemaVersion 4.");
    if (cell.block && value.schemaVersion === 2 && ["question", "survey_controls"].includes(cell.block.type)) errors.push("Survey blocks require schemaVersion 3.");
    if (cell.block) validateBlock(cell.block, `${path} block`, addId, number, errors);
  };
  try {
    visit(value.root, 1, "Root cell");
  } catch {
    errors.push("Document contains malformed cell or block values.");
  }
  if (count > ONSITE_LIMITS.maxNodes) errors.push(`Document has ${count} cells; maximum is ${ONSITE_LIMITS.maxNodes}.`);
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ONSITE_LIMITS.maxSerializedBytes) errors.push(`Document exceeds ${ONSITE_LIMITS.maxSerializedBytes} serialized bytes.`);
  } catch {
    errors.push("Document cannot be serialized.");
  }
  return { valid: errors.length === 0, errors };
}
function validateBlock(block, path, addId, number, errors) {
  var _a, _b, _c, _d, _e;
  addId(block.id, path);
  const base = ["id", "type", "align"];
  const keys = { checklist_task: [...base, "itemId", "fontSize", "color", "indicator"], checklist_text: [...base, "role", "fontSize", "color", "text"], checklist_control: [...base, "role", "fontSize", "color"], checklist_progress: [...base, "fontSize", "color"], question: [...base, "questionId", "fontSize", "color"], survey_controls: base, heading: [...base, "html", "level", "fontSize", "weight", "color", "lineHeight"], text: [...base, "html", "fontSize", "weight", "color", "lineHeight"], button: [...base, "label", "action", "variant", "background", "color", "radius", "paddingX", "paddingY", "width"], image: [...base, "src", "alt", "fit", "width", "height", "radius"], divider: [...base, "orientation", "thickness", "color"], spacer: [...base, "size"], icon: [...base, "icon", "size", "color"] };
  if (!Object.prototype.hasOwnProperty.call(keys, block.type)) {
    errors.push(`${path} has an unsupported block type.`);
    return;
  }
  unexpectedKeys(block, keys[block.type], path, errors);
  if (block.align !== void 0 && !["left", "center", "right"].includes(block.align)) errors.push(`${path} has an invalid alignment.`);
  if (block.type === "checklist_task" || block.type === "checklist_text" || block.type === "checklist_control" || block.type === "checklist_progress") {
    const item = block;
    number(item.fontSize, 10, 48, `${path} font size`);
    if (item.type === "checklist_task" && (typeof item.itemId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.itemId) || !(item.indicator in ICONS))) errors.push(`${path} has an invalid task reference or indicator.`);
    if (item.type === "checklist_text" && (!["title", "description", "launcher-label", "remaining-count", "completion-title", "completion-description"].includes(item.role) || item.text !== void 0 && (item.role !== "launcher-label" || typeof item.text !== "string" || !item.text.trim() || item.text.length > 200))) errors.push(`${path} has an invalid Checklist text role.`);
    if (item.type === "checklist_control" && !["collapse", "dismiss", "completion-acknowledge"].includes(item.role)) errors.push(`${path} has an invalid Checklist control.`);
  } else if (block.type === "question") {
    if (typeof block.questionId !== "string" || !block.questionId.trim() || block.questionId.length > 64) errors.push(`${path} must reference a stable question ID.`);
    number(block.fontSize, 10, 36, `${path} font size`);
  } else if (block.type === "heading" || block.type === "text") {
    if (typeof block.html !== "string" || block.html.length > ONSITE_LIMITS.maxRichText || sanitizeRichText(block.html) !== block.html) errors.push(`${path} contains unsupported or unsafe rich text.`);
    number(block.fontSize, 10, 72, `${path} font size`);
    number(block.lineHeight ?? 1.4, 0.9, 3, `${path} line height`);
    if (![400, 500, 600, 700].includes(block.weight)) errors.push(`${path} has an invalid font weight.`);
    if (block.type === "heading" && ![1, 2, 3, 4].includes(block.level)) errors.push(`${path} has an invalid heading level.`);
  } else if (block.type === "button") {
    if (!((_a = block.label) == null ? void 0 : _a.trim()) || block.label.length > 80) errors.push(`${path} label must contain 1–80 characters.`);
    addId((_b = block.action) == null ? void 0 : _b.id, `${path} action`);
    if (!block.action || !["next_step", "previous_step", "dismiss", "open_url", "track_event"].includes(block.action.type)) errors.push(`${path} has an invalid action.`);
    else unexpectedKeys(block.action, block.action.type === "open_url" ? ["id", "type", "url"] : block.action.type === "track_event" ? ["id", "type", "eventName"] : ["id", "type"], `${path} action`, errors);
    if (((_c = block.action) == null ? void 0 : _c.type) === "open_url" && (!builderLinkUrlIsSafe(block.action.url) || !/^https?:\/\//i.test(block.action.url))) errors.push(`${path} URL must use HTTP(S).`);
    if (((_d = block.action) == null ? void 0 : _d.type) === "track_event" && (!((_e = block.action.eventName) == null ? void 0 : _e.trim()) || block.action.eventName.length > 200)) errors.push(`${path} custom event must contain 1–200 characters.`);
    if (!["primary", "secondary", "outline"].includes(block.variant)) errors.push(`${path} has an invalid variant.`);
    if (!["hug", "full"].includes(block.width)) errors.push(`${path} has an invalid width behavior.`);
    number(block.radius, 0, 48, `${path} radius`);
    number(block.paddingX, 4, 48, `${path} horizontal padding`);
    number(block.paddingY, 4, 32, `${path} vertical padding`);
  } else if (block.type === "image") {
    if (!onsiteImageSourceIsSafe(block.src)) errors.push(`${path} image must use a safe URL (up to 2,000 characters) or a small PNG, JPEG, WebP or GIF image (up to 64 KB encoded).`);
    if (block.alt.length > 500) errors.push(`${path} alt text exceeds 500 characters.`);
    if (!["contain", "cover"].includes(block.fit)) errors.push(`${path} has an invalid image fit.`);
    number(block.width, 1, 100, `${path} width`);
    if (block.height !== void 0) number(block.height, 24, 1200, `${path} height`);
    number(block.radius, 0, 100, `${path} radius`);
  } else if (block.type === "divider") {
    if (!["horizontal", "vertical"].includes(block.orientation)) errors.push(`${path} has an invalid divider orientation.`);
    number(block.thickness, 1, 16, `${path} thickness`);
  } else if (block.type === "spacer") number(block.size, 4, 240, `${path} size`);
  else if (block.type === "icon") {
    if (!(block.icon in ICONS)) errors.push(`${path} icon is not supported.`);
    number(block.size, 12, 96, `${path} size`);
  }
  if ("color" in block && block.color && !COLOR_PATTERN.test(block.color)) errors.push(`${path} color is not supported.`);
}
function onsiteImageSourceIsSafe(src) {
  if (typeof src !== "string") return false;
  if (!/^data:/i.test(src)) return src.length <= ONSITE_LIMITS.maxImageUrl && builderImageUrlIsSafe(src);
  if (src.length > ONSITE_LIMITS.maxInlineImage) return false;
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const bytes = atob(match[2]);
    switch (match[1].toLowerCase()) {
      case "png":
        return bytes.startsWith("PNG\r\n\n");
      case "jpeg":
        return bytes.startsWith("ÿØÿ");
      case "webp":
        return bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
      case "gif":
        return bytes.startsWith("GIF87a") || bytes.startsWith("GIF89a");
    }
  } catch {
  }
  return false;
}
function unexpectedKeys(value, allowed, path, errors) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) errors.push(`${path} contains unsupported fields: ${extra.join(", ")}.`);
}
function findCell(document2, id) {
  let found = null;
  walkCells(document2.root, (cell) => {
    if (cell.id === id) found = cell;
  });
  return found;
}
function findBlock(document2, id) {
  let found = null;
  walkCells(document2.root, (cell) => {
    var _a;
    if (((_a = cell.block) == null ? void 0 : _a.id) === id) found = cell.block;
  });
  return found;
}
function parentCell(document2, id) {
  let found = null;
  walkCells(document2.root, (cell) => {
    var _a;
    if ((_a = cell.children) == null ? void 0 : _a.some((child) => child.id === id)) found = cell;
  });
  return found;
}
function cellForBlock(document2, id) {
  let found = null;
  walkCells(document2.root, (cell) => {
    var _a;
    if (((_a = cell.block) == null ? void 0 : _a.id) === id) found = cell;
  });
  return found;
}
function listBlocks(cell) {
  const blocks = [];
  walkCells(cell, (item) => {
    if (item.block) blocks.push(item.block);
  });
  return blocks;
}
function walkCells(cell, visit) {
  var _a;
  visit(cell);
  (_a = cell.children) == null ? void 0 : _a.forEach((child) => walkCells(child, visit));
}
function splitCell(document2, cellId, direction) {
  const cell = findCell(document2, cellId);
  if (!cell || cell.children) return null;
  const preserved = emptyCell(cell.block);
  const added = emptyCell();
  delete cell.block;
  cell.children = [preserved, added];
  cell.direction = direction;
  cell.responsiveStack = direction === "row";
  return added.id;
}
function insertEdgeCell(document2, edge) {
  const wanted = edge === "left" || edge === "right" ? "row" : "column";
  const added = emptyCell();
  if (document2.root.children && document2.root.direction === wanted && !document2.root.block) document2.root.children[edge === "top" || edge === "left" ? "unshift" : "push"](added);
  else {
    const old = structuredCloneSafe(document2.root);
    old.id = onsiteId("cell");
    document2.root = { ...emptyCell(), id: document2.root.id, direction: wanted, responsiveStack: wanted === "row", children: edge === "top" || edge === "left" ? [added, old] : [old, added] };
  }
  return added.id;
}
function insertAdjacentCell(document2, cellId, edge) {
  const cell = findCell(document2, cellId);
  if (!cell) return null;
  if (cell === document2.root) return insertEdgeCell(document2, edge);
  const parent = parentCell(document2, cellId);
  if (!(parent == null ? void 0 : parent.children)) return null;
  const direction = edge === "left" || edge === "right" ? "row" : "column";
  const before = edge === "top" || edge === "left";
  const index = parent.children.indexOf(cell);
  const added = emptyCell();
  if (parent.direction === direction) parent.children.splice(index + (before ? 0 : 1), 0, added);
  else {
    const group = { ...emptyCell(), direction, sizing: cloneOnsite(cell.sizing), gap: parent.gap, responsiveStack: direction === "row", children: before ? [added, cell] : [cell, added] };
    cell.sizing = { mode: "flexible", weight: 1 };
    parent.children.splice(index, 1, group);
  }
  return added.id;
}
function removeCell(document2, id) {
  const parent = parentCell(document2, id);
  if (!(parent == null ? void 0 : parent.children) || parent.children.length <= 1) {
    const cell = findCell(document2, id);
    if (!cell || cell === document2.root) return false;
    delete cell.block;
    return true;
  }
  parent.children = parent.children.filter((child) => child.id !== id);
  if (parent.children.length === 1) collapseSingleChild(parent);
  return true;
}
function moveCell(document2, id, delta) {
  const parent = parentCell(document2, id);
  if (!(parent == null ? void 0 : parent.children)) return false;
  const index = parent.children.findIndex((child) => child.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= parent.children.length) return false;
  [parent.children[index], parent.children[next]] = [parent.children[next], parent.children[index]];
  return true;
}
function resizeSiblings(document2, firstId, secondId, firstWeight) {
  const parent = parentCell(document2, firstId);
  if (!(parent == null ? void 0 : parent.children) || parent !== parentCell(document2, secondId)) return false;
  const a = parent.children.find((child) => child.id === firstId);
  const b = parent.children.find((child) => child.id === secondId);
  if (!a || !b) return false;
  const bounded = Math.max(0.1, Math.min(1.9, Math.round(firstWeight * 20) / 20));
  a.sizing = { mode: "flexible", weight: bounded };
  b.sizing = { mode: "flexible", weight: 2 - bounded };
  return true;
}
function duplicateCell(document2, id) {
  const source = findCell(document2, id);
  const parent = parentCell(document2, id);
  if (!source || !(parent == null ? void 0 : parent.children)) return null;
  const copy = structuredCloneSafe(source);
  regenerateIds(copy);
  const index = parent.children.findIndex((child) => child.id === id);
  parent.children.splice(index + 1, 0, copy);
  return copy.id;
}
function regenerateIds(cell) {
  var _a;
  cell.id = onsiteId("cell");
  if (cell.block) {
    cell.block.id = onsiteId("block");
    if (cell.block.type === "button") cell.block.action.id = onsiteId("action");
  }
  (_a = cell.children) == null ? void 0 : _a.forEach(regenerateIds);
}
function collapseSingleChild(cell) {
  var _a;
  if (cell.checklistRole) return;
  const child = (_a = cell.children) == null ? void 0 : _a[0];
  if (!child) return;
  const id = cell.id;
  Object.assign(cell, child, { id });
}
function duplicateDocument(document2) {
  const copy = structuredCloneSafe(document2);
  copy.id = onsiteId("document");
  regenerateIds(copy.root);
  return copy;
}
function cloneOnsite(value) {
  return structuredCloneSafe(value);
}
function structuredCloneSafe(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function migrateV1Builder(builder, content, widgetType, guide = false) {
  var _a;
  if (onsiteDocumentFromBuilder(builder)) return onsiteDocumentFromBuilder(builder);
  if (typeof document === "undefined") return null;
  const template = document.createElement("template");
  template.innerHTML = builder.html;
  const root2 = template.content.querySelector(".movcues-widget");
  if (!root2) return null;
  const known = root2.querySelectorAll("[data-movcues-content],[data-movcues-action-id],img");
  if (!known.length || root2.querySelector("[data-movcues-question-id],[data-movcues-checklist-role]")) return null;
  const compatibility = root2.cloneNode(true);
  compatibility.querySelectorAll("[data-movcues-content],[data-movcues-action-id],img").forEach((element) => element.remove());
  compatibility.querySelectorAll("*").forEach((element) => {
    var _a2;
    if (!((_a2 = element.textContent) == null ? void 0 : _a2.trim()) && !element.children.length) element.remove();
  });
  if (((_a = compatibility.textContent) == null ? void 0 : _a.trim()) || compatibility.children.length) return null;
  const cells2 = [];
  const alignment = (element) => element.classList.contains("movcues-align-center") ? "center" : element.classList.contains("movcues-align-right") ? "right" : element.classList.contains("movcues-align-left") ? "left" : void 0;
  const heading = root2.querySelector('[data-movcues-content="heading"]');
  if (heading) {
    const block = createBlock("heading", guide);
    block.html = sanitizeRichText(heading.innerHTML);
    block.align = alignment(heading);
    cells2.push(emptyCell(block));
  }
  const body = root2.querySelector('[data-movcues-content="body"]');
  if (body) {
    const block = createBlock("text", guide);
    block.html = sanitizeRichText(body.innerHTML);
    block.align = alignment(body);
    cells2.push(emptyCell(block));
  }
  root2.querySelectorAll("img").forEach((image) => {
    const block = createBlock("image", guide);
    block.src = image.getAttribute("src") ?? "";
    block.alt = image.getAttribute("alt") ?? "";
    cells2.push(emptyCell(block));
  });
  for (const [marker, fallback] of [["secondary", content.secondaryAction], ["primary", content.primaryAction]]) {
    const button = root2.querySelector(`[data-movcues-action-id="${marker}"]`);
    if (!button || !fallback) continue;
    const block = createBlock("button", guide);
    block.label = fallback.label;
    block.variant = marker === "primary" ? "primary" : "secondary";
    block.action = { id: onsiteId("action"), ...fallback.type === "open_url" && fallback.url ? { type: "open_url", url: fallback.url } : fallback.type === "track_event" && fallback.eventName ? { type: "track_event", eventName: fallback.eventName } : { type: fallback.type === "next_step" ? "next_step" : "dismiss" } };
    cells2.push(emptyCell(block));
  }
  if (!cells2.length) return null;
  const migrated = { schemaVersion: 2, id: onsiteId("document"), root: { ...emptyCell(), direction: "column", gap: 12, padding: { top: 20, right: 20, bottom: 20, left: 20 }, children: cells2 } };
  applyOnsiteDocument(builder, migrated, widgetType);
  return migrated;
}
function sanitizeRichText(input2) {
  if (typeof document === "undefined") return sanitizeRichTextWithoutDom(input2);
  const template = document.createElement("template");
  template.innerHTML = input2;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    if (!SAFE_INLINE_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) if (!(element.tagName === "A" && ["href", "target", "rel"].includes(attribute.name))) element.removeAttribute(attribute.name);
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!builderLinkUrlIsSafe(href)) element.removeAttribute("href");
      const target = element.getAttribute("target");
      if (target && !["_blank", "_self"].includes(target)) element.removeAttribute("target");
      if (target === "_blank") element.setAttribute("rel", "noopener noreferrer");
    }
  }
  return template.innerHTML;
}
function sanitizeRichTextWithoutDom(input2) {
  return input2.replace(/<(?!\/?(?:br|strong|em|u|a|ul|ol|li)(?:\s|>|\/))/gi, "&lt;").replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "").replace(/javascript\s*:/gi, "");
}
function richTextToPlain(input2) {
  if (typeof document === "undefined") return input2.replace(/<br\s*\/?>/gi, "\n").replace(/<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  const template = document.createElement("template");
  template.innerHTML = input2;
  const read = (node2) => {
    if (node2.nodeType === 3) return node2.textContent ?? "";
    let value = "";
    for (const child of Array.from(node2.childNodes)) {
      if (child instanceof HTMLElement && child.tagName === "BR") value += "\n";
      else {
        value += read(child);
        if (child instanceof HTMLElement && child.tagName === "LI") value += "\n";
      }
    }
    return value;
  };
  return read(template.content).trim();
}
function isOnsiteDocument(value) {
  return isOnsiteDocumentShape(value) && validateOnsiteDocument(value).valid;
}
function isOnsiteDocumentShape(value) {
  return !!value && typeof value === "object" && [2, 3, 4].includes(value.schemaVersion) && !!value.root && value.root.type === "cell";
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function escapeText$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttribute(value) {
  return escapeText$1(value).replace(/"/g, "&quot;");
}
function round(value) {
  return String(Math.round(value * 100) / 100);
}
function newSurveyQuestion(type) {
  const base = { id: onsiteId("question"), label: "Your question", required: false };
  if (type === "single_choice" || type === "multiple_choice") return { ...base, type, options: [{ id: onsiteId("option"), label: "Yes" }, { id: onsiteId("option"), label: "No" }] };
  if (type === "short_text" || type === "long_text") return { ...base, type, placeholder: "", maxLength: type === "short_text" ? 200 : 2e3 };
  if (type === "rating") return { ...base, type, min: 1, max: 5 };
  return { ...base, type: "nps" };
}
function newSurveyStep(submitLabel) {
  const step = { id: onsiteId("step"), content: { heading: "New Survey step", body: "" }, questions: [], builder: { version: 1, html: "", css: "", projectData: {} } };
  step.content = applyOnsiteDocument(step.builder, createOnsiteSurveyDocument(step.questions, step.content), "survey", { questions: step.questions, submitLabel }).content;
  return step;
}
function duplicateSurveyStep(source, submitLabel) {
  var _a;
  const copy = cloneOnsite(source);
  copy.id = onsiteId("step");
  const questions = /* @__PURE__ */ new Map(), options = /* @__PURE__ */ new Map();
  copy.questions.forEach((question) => {
    const old = question.id;
    question.id = onsiteId("question");
    questions.set(old, question.id);
    if ("options" in question) question.options.forEach((option) => {
      const old2 = option.id;
      option.id = onsiteId("option");
      options.set(`${question.id}:${old2}`, option.id);
    });
  });
  (_a = copy.branching) == null ? void 0 : _a.rules.forEach((rule2) => {
    rule2.questionId = questions.get(rule2.questionId);
    const key = `${rule2.questionId}:${rule2.value}`;
    if (typeof rule2.value === "string" && options.has(key)) rule2.value = options.get(key);
  });
  const document2 = onsiteDocumentFromBuilder(copy.builder);
  if (!document2 || !copy.builder) throw new Error("This Survey step is not an on-site document.");
  const duplicated = duplicateDocument(document2);
  listBlocks(duplicated.root).forEach((block) => {
    if (block.type === "question") block.questionId = questions.get(block.questionId);
  });
  if (isSourceAuthored(copy.builder)) {
    const template = globalThis.document.createElement("template");
    template.innerHTML = copy.builder.html;
    template.content.querySelectorAll("[data-movcues-question-id]").forEach((node2) => {
      const id = questions.get(node2.dataset.movcuesQuestionId);
      node2.dataset.movcuesQuestionId = id;
      node2.querySelectorAll("[data-movcues-option-id]").forEach((option) => {
        option.dataset.movcuesOptionId = options.get(`${id}:${option.dataset.movcuesOptionId}`) ?? option.dataset.movcuesOptionId;
      });
    });
    copy.builder.html = template.innerHTML;
    const css = postcss$1.parse(copy.builder.css);
    const optionIds = /* @__PURE__ */ new Map();
    for (const [key, id] of options) optionIds.set(key.slice(key.indexOf(":") + 1), id);
    css.walkRules((rule2) => {
      rule2.selector = remapSourceSelector(remapSourceSelector(rule2.selector, "data-movcues-question-id", questions), "data-movcues-option-id", optionIds);
    });
    copy.builder.css = css.toString();
    const metadata = copy.builder.projectData.movcues;
    metadata.onsiteDocument = duplicated;
    return copy;
  }
  copy.content = applyOnsiteDocument(copy.builder, duplicated, "survey", { questions: copy.questions, submitLabel }).content;
  return copy;
}
const LABELS = { single_choice: "Single choice", multiple_choice: "Multiple choice", short_text: "Short text", long_text: "Long text", rating: "Rating", nps: "NPS" };
class SurveyEditor {
  constructor(root2, survey, options) {
    var _a, _b, _c;
    this.root = root2;
    this.survey = survey;
    this.options = options;
    this.questionHost = document.createElement("div");
    this.stepHost = document.createElement("div");
    this.dock = document.createElement("div");
    this.style = document.createElement("style");
    this.onChange = (event) => {
      const input2 = event.target;
      if (!input2.dataset || !this.options.canEdit()) return;
      const composer = this.options.composer(), step = this.survey.steps[this.options.index()], question = composer == null ? void 0 : composer.getSelectedQuestion();
      if (input2.matches("[data-survey-default-next],[data-rule-question],[data-rule-operator],[data-rule-value],[data-rule-next]")) {
        const branching = cloneOnsite(step.branching ?? { rules: [] });
        if (input2.matches("[data-survey-default-next]")) branching.defaultNextStepId = input2.value || void 0;
        else {
          const index = Number(input2.closest("[data-survey-rule]").dataset.surveyRule), rule2 = branching.rules[index];
          if (input2.matches("[data-rule-question]")) Object.assign(rule2, this.defaultRule(step.questions.find((question2) => question2.id === input2.value)));
          if (input2.matches("[data-rule-operator]")) {
            rule2.operator = input2.value;
            if (rule2.operator === "answered") delete rule2.value;
            else if (rule2.value === void 0) rule2.value = this.defaultRule(step.questions.find((question2) => question2.id === rule2.questionId)).value;
          }
          if (input2.matches("[data-rule-next]")) rule2.nextStepId = input2.value;
          if (input2.matches("[data-rule-value]")) {
            const question2 = step.questions.find((question3) => question3.id === rule2.questionId);
            rule2.value = question2.type === "rating" || question2.type === "nps" ? Number(input2.value) : input2.value;
          }
        }
        composer == null ? void 0 : composer.updateBranching(branching);
        this.sync();
        return;
      }
      if (input2.matches("[data-survey-allow-back],[data-survey-show-progress],[data-survey-submit-label]")) {
        if (!this.options.flush()) return;
        if (input2.matches("[data-survey-submit-label]") && !input2.value.trim()) {
          this.options.error(["Submit label cannot be empty."]);
          return;
        }
        this.survey.allowBack = this.root.querySelector("[data-survey-allow-back]").checked;
        this.survey.showProgress = this.root.querySelector("[data-survey-show-progress]").checked;
        this.survey.submitLabel = this.root.querySelector("[data-survey-submit-label]").value.trim();
        this.recompile();
        composer == null ? void 0 : composer.refreshSurvey();
        this.options.changed();
        return;
      }
      if (input2.matches("[data-survey-step-heading]")) {
        composer == null ? void 0 : composer.updateStepHeading(input2.value);
        this.sync();
        return;
      }
      if (!question || !composer || !this.questionHost.contains(input2)) return;
      if (input2.matches("[data-survey-font-size]")) {
        composer.updateBlock({ fontSize: Number(input2.value) });
        return;
      }
      if (input2.matches("[data-survey-question-color]")) {
        composer.updateBlock({ color: input2.value });
        return;
      }
      const next = cloneOnsite(question);
      const value = input2.matches("[data-survey-question-type]") ? { ...newSurveyQuestion(input2.value), id: question.id, label: question.label, required: question.required } : next;
      if (input2.matches("[data-survey-question-label]")) value.label = input2.value;
      if (input2.matches("[data-survey-question-required]")) value.required = input2.checked;
      if ("options" in value && input2.matches("[data-survey-options]")) {
        const existing = value.options;
        value.options = input2.value.split("\n").map((label, index) => {
          var _a2;
          return { id: ((_a2 = existing[index]) == null ? void 0 : _a2.id) ?? onsiteId("option"), label };
        });
      }
      if (value.type === "short_text" || value.type === "long_text") {
        if (input2.matches("[data-survey-placeholder]")) value.placeholder = input2.value;
        if (input2.matches("[data-survey-max-length]")) value.maxLength = Number(input2.value);
      }
      if (value.type === "rating") {
        if (input2.matches("[data-survey-rating-min]")) value.min = Number(input2.value);
        if (input2.matches("[data-survey-rating-max]")) value.max = Number(input2.value);
      }
      composer.updateQuestion(value);
      this.sync();
    };
    this.onClick = (event) => {
      var _a2;
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target || !this.options.canEdit()) return;
      const step = this.survey.steps[this.options.index()], composer = this.options.composer();
      if (target.matches("[data-survey-add-rule]")) {
        if (!step.questions.length) return;
        composer == null ? void 0 : composer.updateBranching({ ...step.branching, rules: [...((_a2 = step.branching) == null ? void 0 : _a2.rules) ?? [], this.defaultRule(step.questions[0])] });
        this.sync();
        return;
      }
      if (target.matches("[data-survey-remove-rule]")) {
        composer == null ? void 0 : composer.updateBranching({ ...step.branching, rules: step.branching.rules.filter((_, index2) => index2 !== Number(target.dataset.surveyRemoveRule)) });
        this.sync();
        return;
      }
      if (!this.dock.contains(target) || !this.options.flush()) return;
      let index = this.options.index();
      const steps = cloneOnsite(this.survey.steps);
      if (target.matches("[data-survey-add-step]")) {
        if (steps.length >= 20) return;
        steps.push(newSurveyStep(this.survey.submitLabel));
        index = steps.length - 1;
      }
      if (target.matches("[data-survey-duplicate-step]")) {
        if (steps.length >= 20) return;
        steps.splice(index + 1, 0, duplicateSurveyStep(steps[index], this.survey.submitLabel));
        index++;
      }
      if (target.matches("[data-survey-move]")) {
        const next = index + Number(target.dataset.surveyMove);
        if (next < 0 || next >= steps.length) return;
        [steps[index], steps[next]] = [steps[next], steps[index]];
        index = next;
      }
      if (target.matches("[data-survey-delete-step]")) {
        if (steps.length === 1) return;
        const removed = steps.splice(index, 1)[0].id;
        index = Math.min(index, steps.length - 1);
        steps.forEach((step2) => {
          if (step2.branching) {
            step2.branching.rules = step2.branching.rules.filter((rule2) => rule2.nextStepId !== removed);
            if (step2.branching.defaultNextStepId === removed) delete step2.branching.defaultNextStepId;
          }
        });
      }
      const errors = surveyBranchErrors({ ...this.survey, steps });
      if (errors.length) {
        this.options.error(errors);
        return;
      }
      this.survey.steps = steps;
      this.dock.querySelector("details").open = false;
      this.options.stepsChanged(index);
    };
    this.questionHost.dataset.block = "question";
    this.questionHost.hidden = true;
    this.questionHost.innerHTML = `<label>Question type<select data-survey-question-type>${QUESTION_TYPES.map((type) => `<option value="${type}">${LABELS[type]}</option>`).join("")}</select></label><label>Question label<input data-survey-question-label aria-label="Question label" maxlength="500"></label><label class="check"><input type="checkbox" data-survey-question-required> Required</label><label data-question-options>Choices (one per line)<textarea data-survey-options rows="4" maxlength="4000"></textarea></label><div data-question-text><label>Placeholder<input data-survey-placeholder maxlength="500"></label><label>Answer length limit<input type="number" data-survey-max-length min="1" max="10000"></label></div><div data-question-rating><label>Minimum<input type="number" data-survey-rating-min min="0" max="99"></label><label>Maximum<input type="number" data-survey-rating-max min="1" max="100"></label></div><label>Question font size<input data-survey-font-size type="number" min="10" max="36"></label><label>Question color<input data-survey-question-color type="color"></label>`;
    this.stepHost.dataset.surveyStepInspector = "";
    this.stepHost.innerHTML = '<label>Survey step heading<input data-survey-step-heading maxlength="160"></label><label class="check"><input type="checkbox" data-survey-allow-back> Allow Back</label><label class="check"><input type="checkbox" data-survey-show-progress> Show progress</label><label>Submit label<input data-survey-submit-label maxlength="80"></label><details data-survey-branch-section><summary>After this step</summary><label>Default next step<select data-survey-default-next></select></label><div data-survey-rules></div><button type="button" class="secondary-button" data-survey-add-rule>Add answer rule</button><small>First matching rule wins. Destinations can only move forward.</small></details>';
    this.dock.dataset.surveyDock = "";
    this.dock.innerHTML = '<button type="button" class="secondary-button compact" data-survey-add-step aria-label="Add Survey step">＋</button><details><summary aria-label="Survey step actions">⋯</summary><div><button type="button" data-survey-duplicate-step>Duplicate step</button><button type="button" data-survey-move="-1">Move step earlier</button><button type="button" data-survey-move="1">Move step later</button><button type="button" data-survey-delete-step>Delete step</button></div></details>';
    this.style.textContent = "[data-survey-step-inspector],[data-block=question]{display:grid;gap:8px}[data-survey-options]{box-sizing:border-box;width:100%;border:1px solid #d7dce3;border-radius:6px;padding:7px;font:12px/1.5 ui-sans-serif,system-ui}[data-survey-branch-section]>summary{cursor:pointer;font-weight:600;margin:4px 0 8px}[data-survey-rule]{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;padding:8px 0;border-top:1px solid #e5e7eb}[data-survey-step-inspector] small{display:block;color:#64748b;font-size:11px;margin-top:6px}.step-navigator>[data-survey-dock]{display:flex;flex:none;gap:4px;align-items:center}[data-survey-dock][hidden]{display:none!important}[data-survey-dock] details>summary{list-style:none;cursor:pointer;border:1px solid #d7dce3;border-radius:6px;padding:3px 7px}[data-survey-dock] details>div{position:absolute;bottom:calc(100% + 6px);right:4px;display:grid;gap:4px;min-width:150px;padding:6px;background:#fff;border:1px solid #d7dce3;border-radius:8px;box-shadow:0 4px 18px #0f172a20}[data-survey-dock] details button{border:0;background:#fff;padding:7px;text-align:left;font:12px ui-sans-serif,system-ui;cursor:pointer}";
    (_a = root2.querySelector("[data-inspector=block]")) == null ? void 0 : _a.append(this.questionHost);
    (_b = root2.querySelector("[data-inspector=step]")) == null ? void 0 : _b.append(this.stepHost);
    (_c = root2.querySelector("[data-guide]")) == null ? void 0 : _c.append(this.dock);
    root2.append(this.style);
    root2.addEventListener("change", this.onChange);
    root2.addEventListener("click", this.onClick);
  }
  setDefinition(survey) {
    this.survey = survey;
  }
  sync() {
    var _a, _b, _c;
    const step = this.survey.steps[this.options.index()], composer = this.options.composer();
    if (!step) return;
    const source = isSourceAuthored(step.builder);
    this.questionHost.querySelectorAll("[data-survey-question-type],[data-survey-rating-min],[data-survey-rating-max]").forEach((control) => {
      control.disabled = source;
      control.title = source ? "Source question type and rating range preserve their canonical answer structure. Labels, input settings, typography and color remain editable." : "";
    });
    this.dock.hidden = !this.options.canEdit();
    this.value("[data-survey-step-heading]", step.content.heading);
    this.check("[data-survey-allow-back]", this.survey.allowBack);
    this.check("[data-survey-show-progress]", this.survey.showProgress);
    this.value("[data-survey-submit-label]", this.survey.submitLabel);
    this.root.querySelectorAll("[data-step] small").forEach((label, index) => {
      if (this.survey.steps[index]) label.textContent = this.survey.steps[index].content.heading || `Step ${index + 1}`;
    });
    const question = composer == null ? void 0 : composer.getSelectedQuestion();
    this.questionHost.hidden = !question;
    if (question) {
      this.value("[data-survey-question-type]", question.type);
      this.value("[data-survey-question-label]", question.label);
      this.check("[data-survey-question-required]", Boolean(question.required));
      this.questionHost.querySelector("[data-question-options]").hidden = !("options" in question);
      this.questionHost.querySelector("[data-question-text]").hidden = !["short_text", "long_text"].includes(question.type);
      this.questionHost.querySelector("[data-question-rating]").hidden = question.type !== "rating";
      if ("options" in question) this.value("[data-survey-options]", question.options.map((option) => option.label).join("\n"));
      if (question.type === "short_text" || question.type === "long_text") {
        this.value("[data-survey-placeholder]", question.placeholder ?? "");
        this.value("[data-survey-max-length]", String(question.maxLength ?? 1e4));
      }
      if (question.type === "rating") {
        this.value("[data-survey-rating-min]", String(question.min));
        this.value("[data-survey-rating-max]", String(question.max));
      }
      const block = composer == null ? void 0 : composer.getSelectedBlock();
      if ((block == null ? void 0 : block.type) === "question") {
        this.value("[data-survey-font-size]", String(block.fontSize));
        this.value("[data-survey-question-color]", block.color ?? "#111827");
      }
    }
    const select = this.root.querySelector("[data-survey-default-next]");
    const choices = this.destinations();
    const markup = '<option value="">Next in order</option>' + choices;
    if (select.innerHTML !== markup) select.innerHTML = markup;
    this.value("[data-survey-default-next]", ((_a = step.branching) == null ? void 0 : _a.defaultNextStepId) ?? "");
    const rules = this.root.querySelector("[data-survey-rules]");
    const signature = JSON.stringify([step.id, step.questions, step.branching, this.survey.steps.map((step2) => [step2.id, step2.content.heading])]);
    if (rules.dataset.signature !== signature) {
      rules.dataset.signature = signature;
      rules.innerHTML = (((_b = step.branching) == null ? void 0 : _b.rules) ?? []).map((rule2, index) => this.ruleMarkup(rule2, index)).join("");
    }
    this.root.querySelector("[data-survey-add-rule]").disabled = !step.questions.length || (((_c = step.branching) == null ? void 0 : _c.rules.length) ?? 0) >= 10;
  }
  destinations() {
    return this.survey.steps.slice(this.options.index() + 1).map((step, offset) => `<option value="${escape(step.id)}">${this.options.index() + offset + 2}. ${escape(step.content.heading || "Survey step")}</option>`).join("") + '<option value="submit">Submit Survey</option>';
  }
  ruleMarkup(rule2, index) {
    const questions = this.survey.steps[this.options.index()].questions, question = questions.find((question2) => question2.id === rule2.questionId);
    const operators = (question == null ? void 0 : question.type) === "multiple_choice" ? [["includes", "includes"], ["answered", "has an answer"]] : (question == null ? void 0 : question.type) === "rating" || (question == null ? void 0 : question.type) === "nps" ? [["equals", "equals"], ["not_equals", "does not equal"], ["gte", "is at least"], ["lte", "is at most"], ["answered", "has an answer"]] : [["equals", "equals"], ["not_equals", "does not equal"], ["answered", "has an answer"]];
    const value = rule2.operator === "answered" ? "" : question && "options" in question ? `<label>Answer<select data-rule-value>${question.options.map((option) => `<option value="${escape(option.id)}"${rule2.value === option.id ? " selected" : ""}>${escape(option.label)}</option>`).join("")}</select></label>` : `<label>Answer<input data-rule-value value="${escape(String(rule2.value ?? ""))}"${(question == null ? void 0 : question.type) === "rating" || (question == null ? void 0 : question.type) === "nps" ? ' type="number"' : ""}></label>`;
    return `<div data-survey-rule="${index}"><label>Question<select data-rule-question>${questions.map((question2) => `<option value="${escape(question2.id)}"${question2.id === rule2.questionId ? " selected" : ""}>${escape(question2.label)}</option>`).join("")}</select></label><label>Condition<select data-rule-operator>${operators.map(([key, label]) => `<option value="${key}"${key === rule2.operator ? " selected" : ""}>${label}</option>`).join("")}</select></label>${value}<label>Go to<select data-rule-next>${this.destinations().replace(`value="${escape(rule2.nextStepId)}"`, `value="${escape(rule2.nextStepId)}" selected`)}</select></label><button class="secondary-button compact" type="button" data-survey-remove-rule="${index}">Remove rule</button></div>`;
  }
  defaultRule(question) {
    var _a;
    return { questionId: question.id, operator: question.type === "multiple_choice" ? "includes" : "equals", value: "options" in question ? question.options[0].id : question.type === "rating" ? question.min : question.type === "nps" ? 0 : "", nextStepId: ((_a = this.survey.steps[this.options.index() + 1]) == null ? void 0 : _a.id) ?? "submit" };
  }
  recompile() {
    this.survey.steps.forEach((step) => {
      const doc = onsiteDocumentFromBuilder(step.builder);
      if (isSourceAuthored(step.builder) && step.builder) {
        const template = document.createElement("template");
        template.innerHTML = step.builder.html;
        const submit = template.content.querySelector('[data-movcues-survey-action="submit"]');
        if (submit) submit.textContent = this.survey.submitLabel;
        step.builder.html = template.innerHTML;
      } else if (doc && step.builder) Object.assign(step.content, applyOnsiteDocument(step.builder, doc, "survey", { questions: step.questions, submitLabel: this.survey.submitLabel }).content);
    });
  }
  value(selector, value) {
    const input2 = this.root.querySelector(selector);
    if (input2 && this.root.activeElement !== input2) input2.value = value;
  }
  check(selector, value) {
    const input2 = this.root.querySelector(selector);
    if (input2) input2.checked = value;
  }
  destroy() {
    this.root.removeEventListener("change", this.onChange);
    this.root.removeEventListener("click", this.onClick);
    this.questionHost.remove();
    this.stepHost.remove();
    this.dock.remove();
    this.style.remove();
  }
}
function escape(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function editorAiErrorMessage(body) {
  var _a, _b;
  if (body == null ? void 0 : body.message) return body.message;
  if (!(body == null ? void 0 : body.error)) return "Movcues AI could not complete this request.";
  const details = [
    ...((_a = body.details) == null ? void 0 : _a.formErrors) ?? [],
    ...Object.entries(((_b = body.details) == null ? void 0 : _b.fieldErrors) ?? {}).flatMap(([field, errors]) => errors.map((error) => `${field}: ${error}`))
  ].join(" ");
  return `AI request rejected: ${body.error}${details ? ` — ${details}` : ""}`;
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
    if ([401, 403, 404, 410].includes(response.status)) throw new EditorSessionExpiredError();
    if (!response.ok) throw new Error("Draft could not be loaded");
    return response.json();
  }
  async save(definition, revision) {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ definition, revision }) });
    if (!response.ok) {
      const body2 = await response.json().catch(() => null);
      if (response.status === 409 && (body2 == null ? void 0 : body2.error) === "draft_conflict") throw new DraftConflictError(body2.currentRevision);
      if (response.status === 401 || response.status === 404 || response.status === 410 || response.status === 403 && (body2 == null ? void 0 : body2.error) === "invalid_editor_access") throw new EditorSessionExpiredError();
      throw new Error((body2 == null ? void 0 : body2.error) ? `Draft could not be saved: ${body2.error}` : "Draft could not be saved");
    }
    const body = await response.json();
    return body.version;
  }
  async chat(input2, signal) {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/ai/chat`, { method: "POST", headers: this.headers(), credentials: "omit", body: JSON.stringify(input2), signal });
    const body = await response.json().catch(() => null);
    if (response.status === 409 && (body == null ? void 0 : body.error) === "draft_conflict") throw new DraftConflictError(body.currentRevision);
    if ([401, 403, 404, 410].includes(response.status) && (body == null ? void 0 : body.error) !== "conversation_not_found") throw new EditorSessionExpiredError();
    if (!response.ok) throw new EditorAiRequestError(editorAiErrorMessage(body), body == null ? void 0 : body.conversationId);
    return body;
  }
  async saveStyle(name, tokens) {
    var _a;
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets`, { method: "POST", headers: this.headers(), credentials: "omit", body: JSON.stringify({ name, tokens }) });
    if (!response.ok) throw new Error(((_a = await response.json().catch(() => null)) == null ? void 0 : _a.error) ?? "Style could not be saved");
    return (await response.json()).preset;
  }
  async renameStyle(id, name) {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ name }) });
    if (!response.ok) throw new Error("Style could not be renamed");
    return (await response.json()).preset;
  }
  async deleteStyle(id) {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`, { method: "DELETE", headers: this.headers(), credentials: "omit" });
    if (!response.ok) throw new Error("Style could not be deleted");
  }
}
class DraftConflictError extends Error {
  constructor(currentRevision) {
    super("Draft changed in another editor");
    this.currentRevision = currentRevision;
  }
}
class EditorSessionExpiredError extends Error {
  constructor() {
    super("Editor session expired");
  }
}
class EditorAiRequestError extends Error {
  constructor(message, conversationId) {
    super(message);
    this.conversationId = conversationId;
  }
}
class HighlightOverlay {
  constructor() {
    this.element = document.createElement("div");
    this.element.dataset.movcuesPickerOverlay = "";
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
  let node2 = element;
  while (node2 && node2 !== document.documentElement) {
    const parent = node2.parentElement;
    let part = node2.tagName.toLowerCase();
    if (parent) {
      const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === node2.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node2) + 1})`;
    }
    parts.unshift(part);
    selectors.push(parts.join(" > "));
    node2 = parent;
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
    return new Promise((resolve2) => {
      this.resolve = resolve2;
    });
  }
  cancel() {
    if (this.resolve) this.finish(null);
    else this.cleanup();
  }
  finish(value) {
    const resolve2 = this.resolve;
    this.resolve = null;
    this.cleanup();
    resolve2 == null ? void 0 : resolve2(value);
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
  if (element.closest("[data-movcues-editor],[data-movcues-experience],[data-movcues-picker-overlay]")) return true;
  const root2 = element.getRootNode();
  return root2 instanceof ShadowRoot && isMovcuesSurface(root2.host);
}
function editorSelection(root2) {
  var _a;
  return ((_a = root2.getSelection) == null ? void 0 : _a.call(root2)) ?? window.getSelection();
}
function editorRange(root2) {
  const selection = editorSelection(root2);
  if (!selection) return null;
  const composed = selection;
  if (composed.getComposedRanges) {
    try {
      const value = composed.getComposedRanges({ shadowRoots: [root2] })[0];
      if (value && root2.contains(value.startContainer) && root2.contains(value.endContainer)) {
        const range = document.createRange();
        range.setStart(value.startContainer, value.startOffset);
        range.setEnd(value.endContainer, value.endOffset);
        return range;
      }
    } catch {
    }
  }
  return selection.rangeCount ? selection.getRangeAt(0) : null;
}
function setEditorRange(root2, range) {
  const selection = editorSelection(root2);
  if (!selection) return;
  if (selection.setBaseAndExtent) selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
  else {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
const SELECTABLE = "[data-movcues-content],[data-movcues-action-id],img";
const MAX_HISTORY_BYTES = 2e6;
function componentPlainText(element) {
  const readChildren = (parent) => {
    let result2 = "";
    for (const node2 of Array.from(parent.childNodes)) {
      if (node2.nodeType === Node.TEXT_NODE) {
        result2 += node2.textContent ?? "";
        continue;
      }
      if (node2 instanceof Element && node2.tagName === "BR") {
        result2 += "\n";
        continue;
      }
      const block = node2 instanceof Element && /^(LI|P|DIV|UL|OL)$/.test(node2.tagName);
      if (block && result2 && !result2.endsWith("\n")) result2 += "\n";
      result2 += readChildren(node2);
      if (block && !result2.endsWith("\n")) result2 += "\n";
    }
    return result2;
  };
  return readChildren(element).trim();
}
const ALIGNMENT_CLASSES = ["movcues-align-left", "movcues-align-center", "movcues-align-right"];
class OnsiteContentEditor {
  constructor(root2, builder, content, callbacks) {
    this.root = root2;
    this.builder = builder;
    this.content = content;
    this.callbacks = callbacks;
    this.selected = null;
    this.hovered = null;
    this.frame = 0;
    this.composing = false;
    this.savedRange = null;
    this.history = [];
    this.transactionTimer = 0;
    this.pending = false;
    this.errors = [];
    this.fieldErrors = /* @__PURE__ */ new Map();
    this.deferredFinish = false;
    this.tabStops = /* @__PURE__ */ new Map();
    this.historyIndex = -1;
    this.onFocus = (event) => {
      const component = this.componentFrom(event);
      if (!component || component === this.selected || this.composing) return;
      this.finishEditing(true);
      this.selected = component;
      this.savedRange = null;
      this.renderOutline();
      this.emitSelection();
    };
    this.onPointerOver = (event) => {
      const component = this.componentFrom(event);
      if (!component || component === this.hovered) return;
      this.hovered = component;
      this.renderOutline();
    };
    this.onPointerOut = (event) => {
      var _a;
      const related = event.relatedTarget;
      if (related instanceof Node && ((_a = this.hovered) == null ? void 0 : _a.contains(related))) return;
      this.hovered = null;
      this.renderOutline();
    };
    this.onClick = (event) => {
      const component = this.componentFrom(event);
      if (!component) {
        this.finishEditing(true);
        return;
      }
      if (component === this.selected && this.isEditing()) {
        if (event.target.closest("a")) event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.composing) return;
      this.finishEditing(true);
      this.selected = component;
      this.savedRange = null;
      this.renderOutline();
      this.emitSelection();
    };
    this.onDoubleClick = (event) => {
      const component = this.componentFrom(event);
      if (!component || this.composing) return;
      event.stopImmediatePropagation();
      if (component === this.selected && this.isEditing()) return;
      this.finishEditing(true);
      this.selected = component;
      this.editSelected();
    };
    this.onOutsidePointer = (event) => {
      const path = event.composedPath();
      if (path.includes(this.root.host) || path.some((node2) => node2 instanceof HTMLElement && node2.hasAttribute("data-movcues-editor"))) return;
      this.finishEditing(true);
    };
    this.onInput = (event) => {
      var _a;
      if (!((_a = this.selected) == null ? void 0 : _a.contains(event.target)) || this.composing) return;
      this.sanitizeActive();
      this.rememberSelection();
      this.commit(true);
    };
    this.onCompositionStart = () => {
      this.beforeOperation();
      this.composing = true;
    };
    this.onCompositionEnd = () => {
      this.composing = false;
      this.sanitizeActive();
      this.rememberSelection();
      this.commit();
      if (this.deferredFinish) {
        this.deferredFinish = false;
        this.finishEditing(true);
      }
    };
    this.onBeforeInput = (event) => {
      const input2 = event;
      if (/^(insertFromDrop|insertFromPaste|insertHTML)$/.test(input2.inputType)) event.preventDefault();
      const formatting = { formatBold: "strong", formatItalic: "em", formatUnderline: "u" };
      if (input2.inputType in formatting) {
        event.preventDefault();
        this.rememberSelection();
        this.formatInline(formatting[input2.inputType]);
      }
    };
    this.onDrop = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.onKeyDown = (event) => {
      const keyEvent = event;
      if (this.composing || keyEvent.isComposing || keyEvent.keyCode === 229) return;
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "a" && this.isEditing() && this.selected) {
        keyEvent.preventDefault();
        const range = document.createRange();
        range.selectNodeContents(this.selected);
        setEditorRange(this.root, range);
        this.savedRange = range.cloneRange();
        return;
      }
      if ((keyEvent.key === "Enter" || keyEvent.key === " ") && this.selected && !this.isEditing() && this.selectionKind(this.selected) !== "image") {
        keyEvent.preventDefault();
        this.editSelected();
        return;
      }
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        const component = this.selected;
        this.deselect();
        component == null ? void 0 : component.focus({ preventScroll: true });
        return;
      }
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "z") {
        keyEvent.preventDefault();
        keyEvent.shiftKey ? this.redo() : this.undo();
        return;
      }
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "y") {
        keyEvent.preventDefault();
        this.redo();
        return;
      }
      if (keyEvent.key === "Enter" && this.selected && (this.selected.matches("[data-movcues-content=heading]") || this.selected.matches("[data-movcues-action-id]"))) {
        keyEvent.preventDefault();
        this.finishEditing(true);
      }
    };
    this.onPaste = (event) => {
      var _a, _b;
      if (!this.isEditing() || this.composing) return;
      const paste = event;
      const text2 = (_a = paste.clipboardData) == null ? void 0 : _a.getData("text/plain");
      if (text2 === void 0) return;
      const range = editorRange(this.root);
      if (!range || !((_b = this.selected) == null ? void 0 : _b.contains(range.commonAncestorContainer))) return;
      paste.preventDefault();
      this.beforeOperation();
      range.deleteContents();
      const node2 = document.createTextNode(text2);
      range.insertNode(node2);
      range.setStartAfter(node2);
      range.collapse(true);
      setEditorRange(this.root, range);
      this.savedRange = range.cloneRange();
      this.commit();
    };
    this.rememberSelection = () => {
      var _a;
      const range = editorRange(this.root);
      if (range && ((_a = this.selected) == null ? void 0 : _a.contains(range.commonAncestorContainer))) this.savedRange = range.cloneRange();
    };
    this.scheduleOutline = () => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.renderOutline());
    };
    this.surface = root2.querySelector("[data-movcues-builder-surface]");
    this.style = document.createElement("style");
    this.style.dataset.movcuesAuthoringStyle = "";
    this.style.textContent = `[data-movcues-authoring-outline]{position:fixed;z-index:2147483646;pointer-events:none;border:1.5px solid #2563eb;border-radius:5px;box-shadow:0 0 0 2px rgba(37,99,235,.12);transition:none}[data-movcues-authoring-outline][data-hover]{border-style:dashed;opacity:.72}`;
    this.outline = document.createElement("div");
    this.outline.dataset.movcuesAuthoringOutline = "";
    this.outline.hidden = true;
  }
  start() {
    if (!this.surface) return false;
    this.root.append(this.style, this.outline);
    this.makeFocusable();
    this.root.addEventListener("focusin", this.onFocus, true);
    this.root.addEventListener("pointerover", this.onPointerOver, true);
    this.root.addEventListener("pointerout", this.onPointerOut, true);
    this.root.addEventListener("click", this.onClick, true);
    this.root.addEventListener("dblclick", this.onDoubleClick, true);
    this.root.addEventListener("input", this.onInput, true);
    this.root.addEventListener("compositionstart", this.onCompositionStart, true);
    this.root.addEventListener("compositionend", this.onCompositionEnd, true);
    this.root.addEventListener("keydown", this.onKeyDown, true);
    this.root.addEventListener("keyup", this.rememberSelection, true);
    this.root.addEventListener("mouseup", this.rememberSelection, true);
    this.root.addEventListener("paste", this.onPaste, true);
    this.root.addEventListener("drop", this.onDrop, true);
    this.root.addEventListener("beforeinput", this.onBeforeInput, true);
    this.root.addEventListener("touchend", this.rememberSelection, true);
    document.addEventListener("pointerdown", this.onOutsidePointer, true);
    window.addEventListener("scroll", this.scheduleOutline, true);
    window.addEventListener("resize", this.scheduleOutline);
    this.pushHistory();
    return true;
  }
  destroy() {
    var _a, _b;
    cancelAnimationFrame(this.frame);
    this.flush();
    clearTimeout(this.transactionTimer);
    this.finishEditing(false);
    (_a = this.selected) == null ? void 0 : _a.removeAttribute("contenteditable");
    (_b = this.selected) == null ? void 0 : _b.removeAttribute("spellcheck");
    this.composing = false;
    this.selected = null;
    this.hovered = null;
    this.savedRange = null;
    this.history = [];
    this.historyIndex = -1;
    this.root.removeEventListener("focusin", this.onFocus, true);
    for (const [element, original] of this.tabStops) {
      if (original === null) element.removeAttribute("tabindex");
      else element.setAttribute("tabindex", original);
    }
    this.tabStops.clear();
    this.root.removeEventListener("pointerover", this.onPointerOver, true);
    this.root.removeEventListener("pointerout", this.onPointerOut, true);
    this.root.removeEventListener("click", this.onClick, true);
    this.root.removeEventListener("dblclick", this.onDoubleClick, true);
    this.root.removeEventListener("input", this.onInput, true);
    this.root.removeEventListener("compositionstart", this.onCompositionStart, true);
    this.root.removeEventListener("compositionend", this.onCompositionEnd, true);
    this.root.removeEventListener("keydown", this.onKeyDown, true);
    this.root.removeEventListener("keyup", this.rememberSelection, true);
    this.root.removeEventListener("mouseup", this.rememberSelection, true);
    this.root.removeEventListener("paste", this.onPaste, true);
    this.root.removeEventListener("drop", this.onDrop, true);
    this.root.removeEventListener("beforeinput", this.onBeforeInput, true);
    this.root.removeEventListener("touchend", this.rememberSelection, true);
    document.removeEventListener("pointerdown", this.onOutsidePointer, true);
    window.removeEventListener("scroll", this.scheduleOutline, true);
    window.removeEventListener("resize", this.scheduleOutline);
    this.outline.remove();
    this.style.remove();
    this.callbacks.onSelectionChange(null);
  }
  editSelected() {
    if (!this.selected || this.selectionKind(this.selected) === "image") return;
    if (this.isEditing()) {
      this.selected.focus({ preventScroll: true });
      return;
    }
    this.selected.setAttribute("contenteditable", "true");
    this.selected.setAttribute("spellcheck", "true");
    this.selected.focus({ preventScroll: true });
    const current = this.history[this.historyIndex];
    if (current) Object.assign(current, this.selectionState());
    this.emitSelection();
  }
  deselect() {
    if (this.composing) {
      this.deferredFinish = true;
      return;
    }
    this.finishEditing(true);
    this.selected = null;
    this.savedRange = null;
    this.renderOutline();
    this.callbacks.onSelectionChange(null);
  }
  formatInline(tag) {
    this.wrapSelection(tag);
  }
  applyLink(url) {
    var _a, _b, _c, _d;
    if (this.composing || !this.selected || this.selectionKind(this.selected) !== "text" || !builderLinkUrlIsSafe(url) || !this.restoreSelection()) return false;
    const range = editorRange(this.root);
    if (!range || range.collapsed || !((_a = this.selected) == null ? void 0 : _a.contains(range.commonAncestorContainer))) return false;
    if (((_b = this.selected) == null ? void 0 : _b.closest("a")) || ((_c = range.startContainer.parentElement) == null ? void 0 : _c.closest("a")) || ((_d = range.endContainer.parentElement) == null ? void 0 : _d.closest("a")) || range.cloneContents().querySelector("a")) return false;
    this.beforeOperation();
    const anchor = document.createElement("a");
    anchor.href = url;
    if (/^https?:\/\//i.test(url)) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    anchor.append(range.extractContents());
    range.insertNode(anchor);
    range.selectNodeContents(anchor);
    setEditorRange(this.root, range);
    this.savedRange = range.cloneRange();
    this.commit();
    return true;
  }
  setAlignment(alignment) {
    if (this.composing || !this.selected || this.selectionKind(this.selected) !== "text") return;
    this.beforeOperation();
    this.selected.classList.remove(...ALIGNMENT_CLASSES);
    this.selected.classList.add(`movcues-align-${alignment}`);
    this.commit();
  }
  toggleList(kind) {
    if (this.composing || !this.selected || this.selected.getAttribute("data-movcues-content") !== "body") return;
    this.beforeOperation();
    let component = this.selected;
    if (component.tagName === "P") {
      const replacement = document.createElement("div");
      for (const attribute of Array.from(component.attributes)) replacement.setAttribute(attribute.name, attribute.value);
      replacement.append(...Array.from(component.childNodes));
      this.tabStops.delete(component);
      replacement.removeAttribute("tabindex");
      component.replaceWith(replacement);
      component = replacement;
      this.selected = replacement;
      this.makeFocusable();
    }
    const existing = component.querySelector("ul,ol");
    if (existing) {
      if (existing.tagName.toLowerCase() !== kind) {
        const list2 = document.createElement(kind);
        list2.append(...Array.from(existing.childNodes));
        existing.replaceWith(list2);
      } else {
        const fragment = document.createDocumentFragment();
        Array.from(existing.children).forEach((item, i) => {
          if (i) fragment.append(document.createElement("br"));
          fragment.append(...Array.from(item.childNodes));
        });
        existing.replaceWith(fragment);
      }
    } else {
      const list2 = document.createElement(kind);
      let item = document.createElement("li");
      list2.append(item);
      for (const node2 of Array.from(component.childNodes)) {
        if (node2 instanceof Element && node2.tagName === "BR") {
          item = document.createElement("li");
          list2.append(item);
        } else if (node2 instanceof Element && /^(P|DIV)$/.test(node2.tagName)) {
          if (item.childNodes.length) {
            item = document.createElement("li");
            list2.append(item);
          }
          item.append(...Array.from(node2.childNodes));
        } else item.append(node2);
      }
      component.replaceChildren(list2);
    }
    this.savedRange = null;
    this.commit();
    component.focus({ preventScroll: true });
  }
  updateImage(src, alt) {
    if (!this.selected || this.selected.tagName !== "IMG" || !builderImageUrlIsSafe(src) || alt.length > 500) return false;
    this.beforeOperation();
    if (src) this.selected.setAttribute("src", src);
    else this.selected.removeAttribute("src");
    this.selected.setAttribute("alt", alt);
    this.commit();
    this.emitSelection();
    return true;
  }
  undo() {
    return this.moveHistory(-1);
  }
  redo() {
    return this.moveHistory(1);
  }
  canUndo() {
    return this.pending || this.historyIndex > 0;
  }
  canRedo() {
    return !this.pending && this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }
  makeFocusable() {
    var _a;
    (_a = this.surface) == null ? void 0 : _a.querySelectorAll(SELECTABLE).forEach((element) => {
      if (!this.tabStops.has(element)) this.tabStops.set(element, element.getAttribute("tabindex"));
      element.setAttribute("tabindex", "0");
    });
  }
  componentFrom(event) {
    if (!this.surface) return null;
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const component = target.closest(SELECTABLE);
    return component && this.surface.contains(component) ? component : null;
  }
  selectionKind(component) {
    return component.tagName === "IMG" ? "image" : component.hasAttribute("data-movcues-action-id") ? "button" : "text";
  }
  emitSelection() {
    if (!this.selected) return this.callbacks.onSelectionChange(null);
    const kind = this.selectionKind(this.selected);
    this.callbacks.onSelectionChange({ kind, label: kind === "image" ? "Image" : this.selected.getAttribute("data-movcues-content") ?? `${this.selected.getAttribute("data-movcues-action-id") ?? "button"} button`, editing: this.isEditing(), ...kind === "image" ? { src: this.selected.getAttribute("src") ?? "", alt: this.selected.getAttribute("alt") ?? "" } : {} });
  }
  isEditing() {
    var _a;
    return ((_a = this.selected) == null ? void 0 : _a.getAttribute("contenteditable")) === "true";
  }
  isComposing() {
    return this.composing;
  }
  finishEditing(commit) {
    var _a, _b;
    if (this.composing) {
      this.deferredFinish = true;
      return;
    }
    if (!this.isEditing()) return;
    if (commit) this.flush();
    (_a = this.selected) == null ? void 0 : _a.removeAttribute("contenteditable");
    (_b = this.selected) == null ? void 0 : _b.removeAttribute("spellcheck");
    this.emitSelection();
  }
  restoreSelection() {
    var _a;
    if (!this.savedRange || !((_a = this.selected) == null ? void 0 : _a.contains(this.savedRange.commonAncestorContainer))) {
      this.savedRange = null;
      return false;
    }
    this.selected.focus({ preventScroll: true });
    setEditorRange(this.root, this.savedRange);
    return true;
  }
  wrapSelection(tag) {
    var _a;
    if (this.composing || !this.restoreSelection()) return;
    const range = editorRange(this.root);
    if (!range || range.collapsed || !((_a = this.selected) == null ? void 0 : _a.contains(range.commonAncestorContainer))) return;
    if (range.cloneContents().querySelector("ul,ol,li,div,p,button,img")) return;
    this.beforeOperation();
    const wrapper = document.createElement(tag);
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    range.selectNodeContents(wrapper);
    setEditorRange(this.root, range);
    this.savedRange = range.cloneRange();
    this.commit();
  }
  serialize() {
    if (!this.surface) return this.builder.html;
    const clone = this.surface.cloneNode(true);
    clone.querySelectorAll("[contenteditable],[spellcheck],[tabindex]").forEach((element) => {
      element.removeAttribute("contenteditable");
      element.removeAttribute("spellcheck");
      element.removeAttribute("tabindex");
    });
    return clone.innerHTML;
  }
  syncStructuredContent(only) {
    var _a, _b;
    if (!this.surface) return;
    if (!only) this.fieldErrors.clear();
    for (const [marker, limit] of [["heading", 160], ["body", 2e3], ["primary", 80], ["secondary", 80]]) {
      if (only && (only.getAttribute("data-movcues-content") ?? only.getAttribute("data-movcues-action-id")) !== marker) continue;
      const element = only ?? this.surface.querySelector(`[data-movcues-content="${marker}"],[data-movcues-action-id="${marker}"]`);
      if (!element) continue;
      const errors = [];
      const value = componentPlainText(element);
      if (marker === "heading" || marker === "body") this.content[marker] = value;
      else {
        const action = marker === "primary" ? this.content.primaryAction : this.content.secondaryAction;
        if (action) action.label = value;
      }
      if (!value) errors.push(`${marker}: enter text before saving.`);
      if (value.length > limit) errors.push(`${marker}: use at most ${limit} characters (${value.length} entered).`);
      this.fieldErrors.set(marker, errors);
    }
    this.errors = Array.from(this.fieldErrors.values()).flat();
    (_b = (_a = this.callbacks).onValidation) == null ? void 0 : _b.call(_a, this.errors);
  }
  snapshot() {
    var _a;
    const content = JSON.parse(JSON.stringify(this.content));
    for (const marker of ["heading", "body", "primary", "secondary"]) {
      const element = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-content="${marker}"],[data-movcues-action-id="${marker}"]`);
      if (!element) continue;
      const text2 = componentPlainText(element);
      if (marker === "heading" || marker === "body") content[marker] = text2;
      else {
        const action = marker === "primary" ? content.primaryAction : content.secondaryAction;
        if (action) action.label = text2;
      }
    }
    return { builder: { ...this.builder, html: this.serialize() }, content };
  }
  getValidation() {
    this.syncStructuredContent();
    return [...this.errors];
  }
  /** Flush DOM into the draft before saving or replacing a rendered step. */
  flush() {
    if (this.composing) return false;
    clearTimeout(this.transactionTimer);
    this.transactionTimer = 0;
    if (this.pending) {
      this.pending = false;
      this.syncStructuredContent();
      this.builder.html = this.serialize();
      this.builder.projectData = { ...this.builder.projectData, movcues: { authoringSurface: "onsite", schemaVersion: 1 } };
      this.pushHistory();
      this.emitSelection();
    }
    return true;
  }
  commit(typing = false) {
    this.pending = true;
    this.syncStructuredContent(typing ? this.selected : void 0);
    if (typing) {
      clearTimeout(this.transactionTimer);
      this.transactionTimer = window.setTimeout(() => this.flush(), 300);
    } else this.flush();
    this.callbacks.onChange();
    this.scheduleOutline();
  }
  sanitizeActive() {
    if (!this.selected || !this.selected.childElementCount) return;
    const wrapper = document.createElement("section");
    wrapper.className = "movcues-widget";
    wrapper.innerHTML = this.selected.innerHTML;
    const nodes = sanitizeBuilderHtml(wrapper.outerHTML);
    const safe = nodes == null ? void 0 : nodes.find((node2) => node2 instanceof HTMLElement);
    if (!safe) return;
    if (this.selectionKind(this.selected) === "button") {
      safe.querySelectorAll("ul,ol,li,div,p,button,a,img").forEach((node2) => node2.replaceWith(document.createTextNode(node2.textContent ?? "")));
    }
    safe.querySelectorAll("[data-movcues-content],[data-movcues-action-id]").forEach((node2) => {
      node2.removeAttribute("data-movcues-content");
      node2.removeAttribute("data-movcues-action-id");
    });
    if (safe.innerHTML !== this.selected.innerHTML) {
      const caret = this.selectionOffsets();
      this.selected.innerHTML = safe.innerHTML;
      this.savedRange = null;
      this.restoreOffsets(caret.start, caret.end);
    }
  }
  beforeOperation() {
    this.flush();
    const current = this.history[this.historyIndex];
    if (current) Object.assign(current, this.selectionState());
  }
  selectionOffsets() {
    const range = editorRange(this.root);
    if (!this.selected || !range || !this.selected.contains(range.commonAncestorContainer)) return { start: 0, end: 0 };
    const prefix = range.cloneRange();
    prefix.selectNodeContents(this.selected);
    prefix.setEnd(range.startContainer, range.startOffset);
    return { start: prefix.toString().length, end: prefix.toString().length + range.toString().length };
  }
  selectionState() {
    return { key: this.componentKey(this.selected), editing: this.isEditing(), ...this.selectionOffsets() };
  }
  restoreOffsets(start, end) {
    if (!this.selected) return;
    const walker = document.createTreeWalker(this.selected, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node2;
    while (node2 = walker.nextNode()) nodes.push(node2);
    if (!nodes.length) {
      this.selected.append(document.createTextNode(""));
      nodes.push(this.selected.firstChild);
    }
    const locate = (offset) => {
      for (const text2 of nodes) {
        if (offset <= text2.length) return [text2, offset];
        offset -= text2.length;
      }
      const last = nodes[nodes.length - 1];
      return [last, last.length];
    };
    const range = document.createRange();
    range.setStart(...locate(start));
    range.setEnd(...locate(end));
    setEditorRange(this.root, range);
    this.savedRange = range.cloneRange();
  }
  pushHistory() {
    var _a;
    const html = this.builder.html;
    if (((_a = this.history[this.historyIndex]) == null ? void 0 : _a.html) === html) return;
    const content = JSON.parse(JSON.stringify(this.content));
    this.history.splice(this.historyIndex + 1);
    this.history.push({ html, content, ...this.selectionState(), bytes: (html.length + JSON.stringify(content).length) * 2 });
    while (this.history.length > 1 && (this.history.length > 50 || this.history.reduce((n, entry) => n + entry.bytes, 0) > MAX_HISTORY_BYTES)) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }
  moveHistory(delta) {
    if (this.composing) return false;
    this.flush();
    const next = this.historyIndex + delta;
    if (!this.surface || next < 0 || next >= this.history.length) return false;
    const state = this.history[next];
    this.historyIndex = next;
    this.savedRange = null;
    this.hovered = null;
    this.surface.innerHTML = state.html;
    this.tabStops.clear();
    this.makeFocusable();
    this.builder.html = state.html;
    for (const key of Object.keys(this.content)) delete this.content[key];
    Object.assign(this.content, JSON.parse(JSON.stringify(state.content)));
    this.selected = this.findByKey(state.key);
    if (state.editing && this.selected) {
      this.editSelected();
      this.restoreOffsets(state.start, state.end);
    }
    this.syncStructuredContent();
    this.renderOutline();
    this.emitSelection();
    this.callbacks.onChange();
    return true;
  }
  componentKey(component) {
    if (!component || !this.surface) return null;
    const marker = component.getAttribute("data-movcues-content") ?? component.getAttribute("data-movcues-action-id");
    if (marker) return `${component.tagName}:${marker}`;
    return component.tagName === "IMG" ? `IMG:${Array.from(this.surface.querySelectorAll("img")).indexOf(component)}` : null;
  }
  findByKey(key) {
    if (!key || !this.surface) return null;
    const [tag, marker] = key.split(":");
    if (tag === "IMG") return this.surface.querySelectorAll("img")[Number(marker)] ?? null;
    return Array.from(this.surface.querySelectorAll(SELECTABLE)).find((element) => (element.getAttribute("data-movcues-content") ?? element.getAttribute("data-movcues-action-id")) === marker) ?? null;
  }
  renderOutline() {
    const component = this.selected ?? this.hovered;
    if (!(component == null ? void 0 : component.isConnected)) {
      this.outline.hidden = true;
      return;
    }
    const rect = component.getBoundingClientRect();
    this.outline.hidden = false;
    this.outline.toggleAttribute("data-hover", !this.selected);
    Object.assign(this.outline.style, { left: `${rect.left - 2}px`, top: `${rect.top - 2}px`, width: `${rect.width + 4}px`, height: `${rect.height + 4}px` });
  }
}
const cells = (cell) => [cell, ...(cell.children ?? []).flatMap(cells)];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parse = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  const root2 = template.content.firstElementChild;
  if (!(root2 instanceof HTMLElement)) throw new Error("Source has no widget root.");
  return root2;
};
class SourceDocumentAdapter {
  constructor(builder, content, options) {
    this.builder = builder;
    this.content = content;
    this.options = options;
    this.duplicates = /* @__PURE__ */ new Map();
    this.pendingHtml = /* @__PURE__ */ new Map();
    this.root = parse(builder.html);
    const metadata = builder.projectData.movcues;
    this.upgraded = metadata.sourceEditabilityVersion !== 1;
    if (this.upgraded) {
      const previous = this.root.cloneNode(true);
      this.addLegacyIdentities(this.root);
      const before = [previous, ...Array.from(previous.querySelectorAll("*"))], after = [this.root, ...Array.from(this.root.querySelectorAll("*"))];
      postcss$1.parse(builder.css).walkRules((rule2) => {
        for (const selector of rule2.selectors) if (before.some((element, index) => element.matches(selector) !== after[index].matches(selector))) throw new Error("Editing identities would change this legacy design's CSS selectors. Its original source is preserved.");
      });
    }
    const errors = validateSourceMarkup(this.operation(this.root.outerHTML), { ...options, editable: true });
    if (errors.length) throw new Error(`This source design cannot be edited safely: ${errors.join(" ")} Its original source is preserved.`);
    if (this.upgraded) applySourceMarkup(builder, content, this.operation(this.root.outerHTML), options);
    this.view = this.project();
  }
  setContracts(questions, items) {
    if (questions) this.options.survey = { questions };
    if (items) this.options.checklist = { items };
  }
  getDocument() {
    return cloneOnsite(this.view);
  }
  snapshot() {
    return { builder: cloneOnsite(this.builder), content: cloneOnsite(this.content) };
  }
  restore(snapshot, view) {
    Object.assign(this.builder, cloneOnsite(snapshot.builder));
    Object.assign(this.content, cloneOnsite(snapshot.content));
    this.root = parse(this.builder.html);
    this.view = cloneOnsite(view);
    this.duplicates.clear();
    this.pendingHtml.clear();
  }
  captureButtonHtml(blockId, html) {
    this.pendingHtml.set(blockId, html);
  }
  refresh() {
    this.root = parse(this.builder.html);
    this.view = this.project();
  }
  synchronizeQuestion(next, current, questions) {
    const options = (question) => "options" in question ? question.options.map((option) => option.id) : question.type === "rating" ? [question.min, question.max] : [];
    if (next.id !== current.id || next.type !== current.type || !same(options(next), options(current))) throw new Error("Source question type and answer identities are protected. Its label, input settings and visual styles remain editable.");
    const root2 = this.root.cloneNode(true), group = root2.querySelector(`[data-movcues-question-id="${next.id}"]`);
    if (!group) throw new Error("The canonical question is missing from this source design.");
    const label = Array.from(group.children).find((element) => element.tagName === "P");
    if (!label) throw new Error("The canonical question label is missing.");
    label.textContent = `${next.label}${next.required ? " *" : ""}`;
    if (next.type === "short_text" || next.type === "long_text") {
      const input2 = group.querySelector("[data-movcues-question-input]");
      input2.setAttribute("aria-label", next.label);
      input2.setAttribute("placeholder", next.placeholder ?? "");
      input2.setAttribute("maxlength", String(next.maxLength ?? 1e4));
      if (next.required) input2.setAttribute("aria-required", "true");
      else input2.removeAttribute("aria-required");
    } else if ("options" in next) for (const option of next.options) {
      const node2 = group.querySelector(`[data-movcues-option-id="${option.id}"]`);
      if (node2) node2.textContent = option.label;
    }
    const contract = { ...this.options, survey: { questions }, previousHtml: "" };
    applySourceMarkup(this.builder, this.content, this.operation(root2.outerHTML), contract);
    this.options.survey = { questions };
    this.refresh();
  }
  synchronizeChecklist(next) {
    var _a;
    if (!same(next.items.map((item) => item.id), (_a = this.options.checklist) == null ? void 0 : _a.items.map((item) => item.id))) throw new Error("Protected source task identities must remain unchanged.");
    const root2 = this.root.cloneNode(true), copy = checklistCopy(next);
    const text2 = (selector, value) => {
      var _a2;
      const element = root2.querySelector(selector);
      if (!element || element.textContent === value) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node2;
      while (node2 = walker.nextNode()) if ((_a2 = node2.textContent) == null ? void 0 : _a2.trim()) nodes.push(node2);
      if (nodes.length > 1) throw new Error("This protected label contains composed text. Use AI to change it while retaining its design.");
      if (nodes[0]) nodes[0].textContent = value;
      else element.append(document.createTextNode(value));
    };
    for (const [role, value] of Object.entries(copy)) if (role !== "remaining-count") text2(`[data-movcues-checklist-role="${role}"]`, value);
    text2('[data-movcues-checklist-role="completion-acknowledge"]', next.completionMessage.acknowledgeLabel);
    for (const item of next.items) for (const role of ["title", "description"]) text2(`[data-movcues-checklist-item-id="${item.id}"] [data-movcues-checklist-item-role="${role}"]`, item[role] ?? "");
    applySourceMarkup(this.builder, this.content, this.operation(root2.outerHTML), this.options);
    this.refresh();
  }
  duplicate(from, to) {
    this.duplicates.set(to, from);
  }
  removeCell(view, id) {
    const parent = parentCell(view, id);
    if (!(parent == null ? void 0 : parent.children)) return false;
    parent.children = parent.children.filter((cell) => cell.id !== id);
    return true;
  }
  isProtected(cellId) {
    const element = this.element(cellId);
    return !!element && (sourceComponentKind(sourceElement(element)) === "protected" || !!element.querySelector("[data-movcues-question-id],[data-movcues-survey-controls],[data-movcues-checklist-role],[data-movcues-checklist-view],[data-movcues-checklist-item-id]"));
  }
  componentIsCell(id) {
    var _a;
    return Boolean((_a = this.element(id)) == null ? void 0 : _a.dataset.movcuesBlockId);
  }
  canResize(parentId) {
    const el = this.element(parentId);
    return !!el && this.styles().value(el, "display") === "flex";
  }
  validate(view) {
    try {
      this.candidate(view);
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : "Invalid source edit."];
    }
  }
  apply(view) {
    if (!same(view, this.view)) {
      const operation = this.candidate(view);
      applySourceMarkup(this.builder, this.content, operation, { ...this.options, previousHtml: this.builder.html });
      this.root = parse(this.builder.html);
      this.view = cloneOnsite(view);
      this.duplicates.clear();
      this.pendingHtml.clear();
    }
    return { html: this.builder.html, css: this.builder.css, content: this.content };
  }
  operation(html = this.builder.html, css = this.builder.css) {
    return { type: "replace_markup", html, css, actionBindings: sourceContext(this.builder, this.options.guide).actionBindings };
  }
  prepareSurface(surface) {
    for (const cell of cells(this.view.root)) {
      const el = this.element(cell.id, surface.querySelector(".movcues-widget"));
      if (el && !el.dataset.movcuesNodeId) el.dataset.movcuesNodeId = cell.id;
    }
  }
  element(id, root2 = this.root) {
    var _a;
    const elements = [root2, ...Array.from(root2.querySelectorAll("*"))];
    const node2 = elements.find((el) => el.dataset.movcuesNodeId === id);
    if (node2) return node2;
    const block = this.view && ((_a = findCell(this.view, id)) == null ? void 0 : _a.block);
    return block ? elements.find((el) => el.dataset.movcuesBlockId === block.id) : void 0;
  }
  styles() {
    return new SourceStyles(this.builder.css, this.root);
  }
  addLegacyIdentities(element) {
    var _a, _b;
    const facts = sourceElement(element);
    const kind = sourceComponentKind(facts);
    (_a = element.dataset).movcuesNodeId || (_a.movcuesNodeId = onsiteId("cell"));
    if (kind !== "layout" || facts.text.trim() && !element.classList.contains("movcues-widget")) {
      (_b = element.dataset).movcuesBlockId || (_b.movcuesBlockId = onsiteId("block"));
      return;
    }
    Array.from(element.children).forEach((child) => this.addLegacyIdentities(child));
  }
  project() {
    const styles = this.styles();
    const projectCell = (element) => {
      var _a;
      const value = (property) => styles.value(element, property);
      const number = (property, fallback) => Number.parseFloat(value(property) ?? "") || fallback;
      const cell = { ...emptyCell(), id: element.dataset.movcuesNodeId ?? `view_${element.dataset.movcuesBlockId}`, direction: value("flex-direction") === "row" || (((_a = value("grid-template-columns")) == null ? void 0 : _a.split(/\s+/).length) ?? 0) > 1 ? "row" : "column" };
      const basis = value("flex-basis"), width = value("width"), fixed = (basis == null ? void 0 : basis.endsWith("px")) ? basis : (width == null ? void 0 : width.endsWith("px")) ? width : void 0;
      const grow = Number.parseFloat(value("flex-grow") ?? "0");
      cell.sizing = fixed ? { mode: "fixed", value: Math.max(24, Math.min(1200, Number.parseFloat(fixed))) } : grow > 0 ? { mode: "flexible", weight: grow } : { mode: "hug" };
      cell.responsiveStack = element.dataset.movcuesResponsiveStack === "true";
      cell.gap = Math.min(96, Math.max(0, number("gap", 0)));
      cell.padding = { top: number("padding-top", number("padding", 0)), right: number("padding-right", number("padding", 0)), bottom: number("padding-bottom", number("padding", 0)), left: number("padding-left", number("padding", 0)) };
      cell.style = { background: value("background") ?? value("background-color"), borderWidth: number("border-width", 0), borderRadius: number("border-radius", 0) };
      const facts = sourceElement(element), kind = sourceComponentKind(facts);
      if (kind === "layout") {
        const children = Array.from(element.children);
        if (children.length === 1 && children[0].dataset.movcuesBlockId && !children[0].dataset.movcuesNodeId) cell.block = projectCell(children[0]).block;
        else cell.children = children.map(projectCell);
        return cell;
      }
      const id = element.dataset.movcuesBlockId, fontSize = number("font-size", 15), color = value("color");
      if (kind === "protected") {
        const role = element.dataset.movcuesChecklistRole;
        cell.block = element.dataset.movcuesQuestionId ? { id, type: "question", questionId: element.dataset.movcuesQuestionId, fontSize, color } : element.hasAttribute("data-movcues-survey-controls") ? { id, type: "survey_controls" } : element.dataset.movcuesChecklistItemId ? { id, type: "checklist_task", itemId: element.dataset.movcuesChecklistItemId, fontSize, color, indicator: "check" } : role && ["title", "description", "launcher-label", "remaining-count", "completion-title", "completion-description"].includes(role) ? { id, type: "checklist_text", role, fontSize, color } : role && ["collapse", "dismiss", "completion-acknowledge"].includes(role) ? { id, type: "checklist_control", role, fontSize, color } : { id, type: "checklist_progress", fontSize, color };
      } else if (element.tagName === "IMG") cell.block = { ...createBlock("image"), id, type: "image", src: element.getAttribute("src") ?? "", alt: element.getAttribute("alt") ?? "", fit: value("object-fit") === "contain" ? "contain" : "cover", width: 100, radius: number("border-radius", 0) };
      else if (element.tagName === "BUTTON") {
        const actionId = element.dataset.movcuesActionId, action = this.operation().actionBindings[actionId];
        cell.block = { ...createBlock("button", this.options.guide), id, type: "button", label: element.textContent ?? "", action: { id: actionId, ...action }, variant: "primary", width: "hug", radius: number("border-radius", 8), paddingX: number("padding-left", 16), paddingY: number("padding-top", 9) };
      } else if (element.tagName === "HR") cell.block = { id, type: "divider", orientation: "horizontal", thickness: number("height", 1), color: value("background") ?? "#dbe2ea" };
      else if (element.classList.contains("movcues-spacer")) cell.block = { id, type: "spacer", size: number("height", 24) };
      else if (element.classList.contains("movcues-icon") || element.getAttribute("role") === "img") cell.block = { id, type: "icon", icon: element.getAttribute("aria-label") ?? "info", size: fontSize, color };
      else {
        const base = { id, html: element.innerHTML, fontSize, weight: number("font-weight", 400), color, lineHeight: number("line-height", 1.5) };
        cell.block = /^H[1-4]$/.test(element.tagName) ? { ...base, type: "heading", level: Number(element.tagName[1]) } : { ...base, type: "text" };
      }
      return cell;
    };
    return { schemaVersion: 2, id: "source_inspector_view", root: projectCell(this.root) };
  }
  candidate(view) {
    var _a, _b, _c, _d, _e, _f;
    const root2 = this.root.cloneNode(true), styles = new SourceStyles(this.builder.css, root2);
    const old = new Map(cells(this.view.root).map((cell) => [cell.id, cell]));
    const original = new Map(cells(this.view.root).map((cell) => [cell.id, this.element(cell.id, root2)]));
    const nextIds = new Set(cells(view.root).map((cell) => cell.id));
    const parent = (doc, id) => cells(doc.root).find((cell) => {
      var _a2;
      return (_a2 = cell.children) == null ? void 0 : _a2.some((child) => child.id === id);
    });
    for (const cell of old.values()) if (this.isProtected(cell.id)) {
      const next = findCell(view, cell.id);
      if (!next || !same(next.block, cell.block) && cell.block && !same({ ...next.block, fontSize: void 0, color: void 0, align: void 0 }, { ...cell.block, fontSize: void 0, color: void 0, align: void 0 }) || ((_a = parent(view, cell.id)) == null ? void 0 : _a.id) !== ((_b = parent(this.view, cell.id)) == null ? void 0 : _b.id)) throw new Error("Protected Survey/Checklist components must keep their structure and parent. Style their container instead.");
      const before = (_d = (_c = parent(this.view, cell.id)) == null ? void 0 : _c.children) == null ? void 0 : _d.filter((value) => this.isProtected(value.id)).map((value) => value.id);
      const after = (_f = (_e = parent(view, cell.id)) == null ? void 0 : _e.children) == null ? void 0 : _f.filter((value) => this.isProtected(value.id)).map((value) => value.id);
      if (!same(before, after)) throw new Error("Protected component order cannot be changed visually.");
    }
    const operation = this.operation();
    operation.actionBindings = {};
    const build = (cell) => {
      var _a2;
      let element = original.get(cell.id);
      const previous = old.get(cell.id);
      if (!element) {
        const duplicatedFrom = this.duplicates.get(cell.id);
        if (duplicatedFrom) {
          const from = findCell(this.view, duplicatedFrom);
          if (this.isProtected(from.id)) throw new Error("Protected components cannot be duplicated.");
          this.cloneDuplicate(from, cell, original, old, styles, root2);
          element = original.get(cell.id);
        }
      }
      if (!element) {
        element = document.createElement("div");
        element.dataset.movcuesNodeId = cell.id;
      }
      if (cell.block) {
        const previousBlock = (previous == null ? void 0 : previous.block) ?? ((_a2 = old.get(cell.id)) == null ? void 0 : _a2.block);
        let component = element.dataset.movcuesBlockId === cell.block.id ? element : element.querySelector(`[data-movcues-block-id="${cell.block.id}"]`);
        if (!component) {
          component = this.newBlock(cell.block, styles);
          if (element === root2) throw new Error("The widget root must remain a layout.");
          element.replaceChildren(component);
        }
        this.updateBlock(component, cell.block, previousBlock, styles);
        if (cell.block.type === "button") {
          const { id, ...action } = cell.block.action;
          operation.actionBindings[id] = action;
        }
      } else {
        const children = (cell.children ?? []).map(build);
        if (element.children.length !== children.length || children.some((child, index) => child !== element.children[index])) element.replaceChildren(...children);
      }
      this.updateCell(element, cell, previous ?? old.get(cell.id), styles);
      return element;
    };
    const built = build(view.root);
    if (built !== root2) throw new Error("The source root identity must remain stable.");
    for (const [id, element] of original) if (!nextIds.has(id) && element !== root2) element.remove();
    styles.removeIdentities(Array.from(old.values()).filter((cell) => !nextIds.has(cell.id)).flatMap((cell) => [cell.id, ...cell.block ? [cell.block.id] : []]));
    operation.html = root2.outerHTML;
    operation.css = styles.toString();
    const errors = validateSourceMarkup(operation, { ...this.options, editable: true, previousHtml: this.builder.html });
    if (errors.length) throw new Error(errors.join(" "));
    return operation;
  }
  cloneDuplicate(from, to, elements, old, styles, root2) {
    const element = elements.get(from.id).cloneNode(true);
    const mapping = /* @__PURE__ */ new Map();
    const map = (a, b) => {
      var _a;
      mapping.set(a.id, b.id);
      if (a.block && b.block) {
        mapping.set(a.block.id, b.block.id);
        if (a.block.type === "button" && b.block.type === "button") mapping.set(a.block.action.id, b.block.action.id);
      }
      (_a = a.children) == null ? void 0 : _a.forEach((child, index) => map(child, b.children[index]));
    };
    map(from, to);
    for (const el of [element, ...Array.from(element.querySelectorAll("*"))]) {
      el.removeAttribute("id");
      for (const key of ["data-movcues-node-id", "data-movcues-block-id", "data-movcues-action-id"]) {
        const value = el.getAttribute(key);
        if (value && mapping.has(value)) el.setAttribute(key, mapping.get(value));
      }
    }
    const register = (cell) => {
      var _a;
      const el = this.element(cell.id, element) ?? [element, ...Array.from(element.querySelectorAll("*"))].find((el2) => {
        var _a2;
        return el2.dataset.movcuesBlockId === ((_a2 = cell.block) == null ? void 0 : _a2.id);
      });
      elements.set(cell.id, el);
      old.set(cell.id, cloneOnsite(cell));
      (_a = cell.children) == null ? void 0 : _a.forEach(register);
    };
    register(to);
    const sheet = postcss$1.parse(styles.toString()), additions = postcss$1.root();
    sheet.each((node2) => {
      const copy = node2.clone();
      let found = false;
      const remap = (rule2) => {
        let changed = false;
        for (const key of ["node", "block"]) {
          const selector = remapSourceSelector(rule2.selector, `data-movcues-${key}-id`, mapping);
          if (selector !== rule2.selector) {
            rule2.selector = selector;
            changed = true;
          }
        }
        if (!changed) rule2.remove();
        else found = true;
      };
      if (copy.type === "rule") remap(copy);
      else if (copy.type === "atrule") copy.walkRules(remap);
      else return;
      if (found) additions.append(copy);
    });
    for (const node2 of additions.nodes) styles.append(node2);
  }
  newBlock(block, styles) {
    if (["question", "survey_controls", "checklist_task", "checklist_text", "checklist_control", "checklist_progress"].includes(block.type)) throw new Error("Insert protected components through their canonical editor.");
    const compiled = compileOnsiteDocument({ schemaVersion: 2, id: "source_insert", root: emptyCell(block) }, this.options.widgetType);
    const element = parse(compiled.html).querySelector(`[data-movcues-block-id="${block.id}"]`);
    const css = postcss$1.parse(compiled.css);
    css.walkRules((rule2) => {
      var _a;
      if (((_a = rule2.parent) == null ? void 0 : _a.type) === "root" && rule2.selector.includes(`[data-movcues-block-id="${block.id}"]`)) styles.append(rule2.clone());
    });
    return element;
  }
  updateCell(el, cell, before, styles) {
    var _a, _b;
    const changed = (key) => !before || !same(cell[key], before[key]);
    if (!before || changed("direction")) {
      styles.set(el, "display", "flex");
      styles.set(el, "flex-direction", cell.direction);
    }
    if (changed("align")) styles.set(el, "align-items", cell.align);
    if (changed("justify")) styles.set(el, "justify-content", cell.justify);
    if (changed("gap")) styles.set(el, "gap", `${cell.gap}px`);
    if (changed("padding")) {
      for (const side of ["top", "right", "bottom", "left"]) if (!before || cell.padding[side] !== before.padding[side]) styles.set(el, `padding-${side}`, `${cell.padding[side]}px`);
    }
    if (changed("sizing")) {
      const size = cell.sizing;
      el.dataset.movcuesSizing = size.mode;
      if (size.mode === "fixed") {
        styles.set(el, "flex-basis", `${size.value}px`);
        const parent = el.parentElement;
        if (!parent || styles.value(parent, "display") !== "flex") styles.set(el, "width", `${size.value}px`);
      } else styles.set(el, "flex", size.mode === "hug" ? "0 0 auto" : `${size.weight} 1 0px`);
    }
    if (changed("style")) for (const [key, property, unit] of [["background", "background", ""], ["borderWidth", "border-width", "px"], ["borderColor", "border-color", ""], ["borderRadius", "border-radius", "px"]]) {
      const value = (_a = cell.style) == null ? void 0 : _a[key];
      if (value !== void 0 && value !== ((_b = before == null ? void 0 : before.style) == null ? void 0 : _b[key])) {
        styles.set(el, property, `${value}${unit}`);
        if (key === "borderWidth") styles.set(el, "border-style", "solid");
      }
    }
    if (changed("responsiveStack")) styles.responsiveStack(el, Boolean(cell.responsiveStack));
  }
  updateBlock(el, block, before, styles) {
    var _a, _b;
    const current = block, previous = before;
    const changed = (key) => previous && !same(current[key], previous[key]);
    if ((block.type === "text" || block.type === "heading") && changed("html")) {
      el.innerHTML = block.html;
    }
    if (block.type === "button" && changed("label")) {
      const edited = this.pendingHtml.get(block.id);
      if (edited !== void 0) el.innerHTML = edited;
      else {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let node2;
        while (node2 = walker.nextNode()) if (((_a = node2.textContent) == null ? void 0 : _a.trim()) && !((_b = node2.parentElement) == null ? void 0 : _b.closest('[aria-hidden="true"],[role="img"]'))) nodes.push(node2);
        if (nodes.length > 1) throw new Error("This button has composed text. Double-click its label to edit it while preserving its markup.");
        if (nodes[0]) nodes[0].textContent = block.label;
        else el.append(document.createTextNode(block.label));
      }
    }
    if (block.type === "image") {
      if (changed("src")) el.setAttribute("src", block.src);
      if (changed("alt")) el.setAttribute("alt", block.alt);
    }
    const properties = [["align", "text-align", ""], ["fontSize", "font-size", "px"], ["lineHeight", "line-height", ""], ["weight", "font-weight", ""], ["color", block.type === "divider" ? "background" : "color", ""], ["background", "background", ""], ["radius", "border-radius", "px"], ["fit", "object-fit", ""]];
    for (const [key, property, unit] of properties) if (changed(key) && current[key] !== void 0) styles.set(el, property, `${current[key]}${unit}`);
    if (block.type === "button") {
      if (changed("paddingX")) {
        styles.set(el, "padding-left", `${block.paddingX}px`);
        styles.set(el, "padding-right", `${block.paddingX}px`);
      }
      if (changed("paddingY")) {
        styles.set(el, "padding-top", `${block.paddingY}px`);
        styles.set(el, "padding-bottom", `${block.paddingY}px`);
      }
      if (changed("width")) styles.set(el, "width", block.width === "full" ? "100%" : "auto");
      if (changed("variant")) {
        styles.set(el, "background", block.variant === "primary" ? "#2563eb" : "transparent");
        styles.set(el, "border", block.variant === "outline" ? "1px solid currentColor" : "0");
      }
    }
    if (block.type === "image" && changed("width")) styles.set(el, "width", `${block.width}%`);
    if (block.type === "divider" && changed("thickness")) styles.set(el, "height", `${block.thickness}px`);
    if (block.type === "spacer" && changed("size")) styles.set(el, "height", `${block.size}px`);
    if (block.type === "icon" && changed("size")) styles.set(el, "font-size", `${block.size}px`);
    if (block.type === "icon" && changed("icon")) {
      const compiled = this.newBlock(block, new SourceStyles("", this.root));
      el.innerHTML = compiled.innerHTML;
      el.setAttribute("aria-label", block.icon);
    }
  }
}
async function prepareImageFile(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve2, reject) => {
      const timer = window.setTimeout(() => {
        image.onload = image.onerror = null;
        reject(new Error("Image took too long to open. Try another file."));
      }, 15e3);
      image.onload = () => {
        clearTimeout(timer);
        resolve2();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("This image could not be opened. Try another PNG, JPG or WebP file."));
      };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 4e7) throw new Error("This image is too large. Choose an image under 40 megapixels.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    let scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL("image/webp", Math.max(0.45, 0.85 - attempt * 0.08));
      if (src.length <= ONSITE_LIMITS.maxInlineImage && onsiteImageSourceIsSafe(src)) return src;
      scale *= 0.8;
    }
    throw new Error("This image is too detailed to save. Try a smaller image or use an image URL.");
  } finally {
    image.onload = image.onerror = null;
    URL.revokeObjectURL(url);
  }
}
const BLOCK_PATCH_KEYS = /* @__PURE__ */ new Set(["align", "fontSize", "weight", "lineHeight", "color", "label", "variant", "background", "width", "paddingX", "paddingY", "radius", "alt", "fit", "size", "thickness", "icon"]);
const CELL_PATCH_KEYS = /* @__PURE__ */ new Set(["direction", "sizing", "align", "justify", "gap", "padding", "responsiveStack", "style"]);
const plainText = (value) => sanitizeRichText(value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]));
function patchBlock(block, patch) {
  for (const key of Object.keys(patch)) if (!BLOCK_PATCH_KEYS.has(key)) throw new Error(`Unsupported block property: ${key}`);
  Object.assign(block, cloneOnsite(patch));
}
function patchCell(cell, patch) {
  for (const key of Object.keys(patch)) if (!CELL_PATCH_KEYS.has(key)) throw new Error(`Unsupported cell property: ${key}`);
  Object.assign(cell, cloneOnsite(patch));
}
function moveCandidate(document2, sourceId, targetId, before = false) {
  if (sourceId === document2.root.id || sourceId === targetId) throw new Error("The root cell cannot be moved.");
  const source = findCell(document2, sourceId), target = findCell(document2, targetId), from = parentCell(document2, sourceId);
  if (!source || !target || !(from == null ? void 0 : from.children) || findCell({ ...document2, root: source }, targetId)) throw new Error("Invalid move target.");
  from.children.splice(from.children.indexOf(source), 1);
  if (!from.children.length) delete from.children;
  if (!target.block && !target.children) target.children = [source];
  else {
    const to = parentCell(document2, targetId);
    if (!(to == null ? void 0 : to.children)) throw new Error("Invalid move target.");
    to.children.splice(to.children.indexOf(target) + (before ? 0 : 1), 0, source);
  }
}
function applyEditorAiProposal(document2, proposal) {
  if (document2.schemaVersion !== 2 && document2.schemaVersion !== 3) throw new Error("AI editing requires an on-site document.");
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const candidate = cloneOnsite(document2);
  for (const operation of proposal.operations) {
    if (operation.type === "replace_markup") throw new Error("Source proposals must be applied to the complete builder.");
    if (operation.type === "update_text") {
      const block = findBlock(candidate, operation.blockId);
      if (!block || block.type !== "heading" && block.type !== "text") throw new Error("Text target no longer exists.");
      block.html = plainText(operation.text.slice(0, 1e4));
    } else if (operation.type === "update_block") {
      const block = findBlock(candidate, operation.blockId);
      if (!block || block.type === "question" || block.type === "survey_controls" || block.type.startsWith("checklist_")) throw new Error("Block target is unavailable.");
      patchBlock(block, operation.patch);
    } else if (operation.type === "update_cell") {
      const cell = findCell(candidate, operation.cellId);
      if (!cell) throw new Error("Cell target no longer exists.");
      patchCell(cell, operation.patch);
    } else if (operation.type === "update_button_action") {
      const block = findBlock(candidate, operation.blockId);
      if ((block == null ? void 0 : block.type) !== "button") throw new Error("Button target no longer exists.");
      block.action = { id: block.action.id, ...cloneOnsite(operation.action) };
    } else if (operation.type === "insert_block") {
      const target = findCell(candidate, operation.targetCellId);
      if (!target) throw new Error("Insert target no longer exists.");
      const block = createBlock(operation.blockType);
      if (operation.text && (block.type === "heading" || block.type === "text")) block.html = plainText(operation.text);
      if (operation.position === "inside") {
        if (!target.block && !target.children) target.block = block;
        else {
          target.children ?? (target.children = target.block ? [emptyCell(target.block)] : []);
          delete target.block;
          target.children.push(emptyCell(block));
        }
      } else {
        const id = insertAdjacentCell(candidate, target.id, operation.position === "before" ? "top" : "bottom");
        if (!id) throw new Error("Block could not be inserted.");
        findCell(candidate, id).block = block;
      }
    } else if (operation.type === "remove_cell") {
      if (operation.cellId === candidate.root.id || !removeCell(candidate, operation.cellId)) throw new Error("Cell cannot be removed.");
    } else if (operation.type === "duplicate_cell") {
      if (operation.cellId === candidate.root.id || !duplicateCell(candidate, operation.cellId)) throw new Error("Cell cannot be duplicated.");
    } else if (operation.type === "move_cell") moveCandidate(candidate, operation.cellId, operation.targetCellId, operation.before);
    else throw new Error("Unsupported AI operation.");
  }
  const validation = validateOnsiteDocument(candidate);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  return candidate;
}
function setDocumentCopy(step, heading, body) {
  const document2 = onsiteDocumentFromBuilder(step.builder);
  if (!document2 || !step.builder) throw new Error(`Step ${step.id} has no editable on-site document.`);
  const blocks = listBlocks(document2.root);
  const headingBlock = blocks.find((block) => block.type === "heading");
  if (heading !== void 0 && (headingBlock == null ? void 0 : headingBlock.type) === "heading") headingBlock.html = plainText(heading.slice(0, 160));
  const bodyBlock = blocks.find((block) => block.type === "text");
  if (body !== void 0 && (bodyBlock == null ? void 0 : bodyBlock.type) === "text") bodyBlock.html = plainText(body.slice(0, 1e4));
  const compiled = applyOnsiteDocument(step.builder, document2, getGuideStepPattern(step));
  step.content = compiled.content;
}
function newGuideStep(operation) {
  var _a;
  const document2 = createOnsiteDocument(true), builder = { version: 1, projectData: {}, html: "", css: "" };
  const step = { id: onsiteId("step"), label: ((_a = operation.label) == null ? void 0 : _a.trim().slice(0, 80)) || (operation.pattern === "modal" ? "Modal step" : "Anchored step"), pattern: operation.pattern, content: { heading: "", body: "" }, builder, advance: { type: "button" }, behavior: operation.pattern === "modal" ? { dismissible: true, layer: { mode: "always_on_top" } } : { placement: "auto", alignment: "center", offset: 8, pointer: { enabled: true, size: 10 }, dismissible: true, layer: { mode: "auto" } } };
  applyOnsiteDocument(builder, document2, operation.pattern);
  setDocumentCopy(step, operation.heading, operation.body);
  return step;
}
function normalizePattern(step, pattern) {
  var _a, _b, _c;
  step.pattern = pattern;
  if (pattern === "modal") {
    delete step.target;
    (_a = step.presentation) == null ? true : delete _a.missingTarget;
    if (((_b = step.advance) == null ? void 0 : _b.type) === "element_click" || ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover") step.advance = { type: "button" };
    step.behavior = { dismissible: step.behavior.dismissible ?? true, backdrop: step.behavior.backdrop, backdropOpacity: step.behavior.backdropOpacity, closeOnBackdrop: step.behavior.closeOnBackdrop, layer: step.behavior.layer ?? { mode: "always_on_top" } };
  } else step.behavior = { placement: step.behavior.placement ?? "auto", alignment: step.behavior.alignment ?? "center", offset: step.behavior.offset ?? 8, pointer: step.behavior.pointer ?? { enabled: true, size: 10 }, dismissible: step.behavior.dismissible ?? true, layer: step.behavior.layer ?? { mode: "auto" } };
  if (step.builder) {
    const document2 = onsiteDocumentFromBuilder(step.builder);
    if (document2) step.content = applyOnsiteDocument(step.builder, document2, pattern).content;
  }
}
function withPageRuleIds(rules) {
  return rules.map((rule2) => ({ ...cloneOnsite(rule2), id: onsiteId("cell") }));
}
function applyGuideAiProposal(source, proposal, resolvedTargets = /* @__PURE__ */ new Map()) {
  var _a;
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const guide = cloneOnsite(source), affected = /* @__PURE__ */ new Set(), withinStep = /* @__PURE__ */ new Map();
  const step = (id) => {
    const value = guide.steps.find((item) => item.id === id);
    if (!value) throw new Error(`Guide step no longer exists: ${id}`);
    return value;
  };
  const replacement = proposal.operations.find((operation) => operation.type === "replace_markup");
  if (replacement) {
    if (proposal.operations.length !== 1 || !replacement.stepId) throw new Error("A source replacement must be one atomic step-scoped operation.");
    const owner = step(replacement.stepId);
    if (!owner.builder) throw new Error("Guide step has no builder source.");
    if (replacement.widthPx !== void 0) {
      if (getGuideStepPattern(owner) !== "modal") throw new Error("Only modal source replacements can change the outer width.");
      owner.size = { width: { mode: "fixed", value: replacement.widthPx }, height: ((_a = owner.size) == null ? void 0 : _a.height) ?? { mode: "auto" } };
    }
    applySourceMarkup(owner.builder, owner.content, replacement, { widgetType: getGuideStepPattern(owner), guide: true });
    return { guide, affectedStepIds: [owner.id], order: guide.steps.map((value) => value.id), warnings: ["This source design remains visually editable; Undo restores the complete prior step."] };
  }
  proposal.operations.forEach((operation, operationIndex) => {
    var _a2, _b, _c, _d, _e;
    if (["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type)) {
      const documentOperation = operation;
      if (!documentOperation.stepId) throw new Error("Within-step operations require a stable step ID.");
      step(documentOperation.stepId);
      withinStep.set(documentOperation.stepId, [...withinStep.get(documentOperation.stepId) ?? [], documentOperation]);
      affected.add(documentOperation.stepId);
      return;
    }
    const guideOperation = operation;
    if (guideOperation.type === "add_guide_step") {
      if (guide.steps.length >= 20) throw new Error("A Guide can contain up to 20 steps.");
      const created = newGuideStep(guideOperation), after = guideOperation.afterStepId ? guide.steps.findIndex((item) => item.id === guideOperation.afterStepId) : guide.steps.length - 1;
      if (guideOperation.afterStepId && after < 0) throw new Error("The requested insertion step no longer exists.");
      guide.steps.splice(after + 1, 0, created);
      affected.add(created.id);
    } else if (guideOperation.type === "duplicate_guide_step") {
      if (guide.steps.length >= 20) throw new Error("A Guide can contain up to 20 steps.");
      const original = step(guideOperation.stepId), copy = cloneOnsite(original);
      copy.id = onsiteId("step");
      copy.label = ((_a2 = guideOperation.label) == null ? void 0 : _a2.trim().slice(0, 80)) || `${original.label || original.content.heading || "Step"} copy`;
      const document2 = onsiteDocumentFromBuilder(copy.builder);
      if (document2 && copy.builder) copy.content = applyOnsiteDocument(copy.builder, duplicateDocument(document2), getGuideStepPattern(copy)).content;
      setDocumentCopy(copy, guideOperation.heading, guideOperation.body);
      const after = guideOperation.afterStepId ? guide.steps.findIndex((item) => item.id === guideOperation.afterStepId) : guide.steps.indexOf(original);
      if (after < 0) throw new Error("The requested insertion step no longer exists.");
      guide.steps.splice(after + 1, 0, copy);
      affected.add(copy.id);
    } else if (guideOperation.type === "remove_guide_step") {
      if (guide.steps.length <= 1) throw new Error("The final Guide step cannot be removed.");
      const index = guide.steps.findIndex((item) => item.id === guideOperation.stepId);
      if (index < 0) throw new Error("Guide step no longer exists.");
      guide.steps.splice(index, 1);
      affected.add(guideOperation.stepId);
    } else if (guideOperation.type === "move_guide_step") {
      const value = step(guideOperation.stepId), from = guide.steps.indexOf(value);
      guide.steps.splice(from, 1);
      const before = guideOperation.beforeStepId ? guide.steps.findIndex((item) => item.id === guideOperation.beforeStepId) : guide.steps.length;
      if (before < 0) throw new Error("Move destination no longer exists.");
      guide.steps.splice(before, 0, value);
      affected.add(value.id);
    } else if (guideOperation.type === "update_guide_step") {
      const value = step(guideOperation.stepId);
      if (guideOperation.patch.label !== void 0) value.label = guideOperation.patch.label.trim().slice(0, 80) || void 0;
      if (guideOperation.patch.pattern) normalizePattern(value, guideOperation.patch.pattern);
      affected.add(value.id);
    } else if (guideOperation.type === "update_guide_step_behavior") {
      const value = step(guideOperation.stepId);
      Object.assign(value.behavior, cloneOnsite(guideOperation.patch));
      affected.add(value.id);
    } else if (guideOperation.type === "update_guide_advance") {
      const value = step(guideOperation.stepId);
      if ((guideOperation.advance.type === "element_click" || guideOperation.advance.type === "element_hover") && !guideStepRequiresTarget(value)) throw new Error("Website interaction advancement requires an Anchored Card step.");
      const target = ((_b = value.advance) == null ? void 0 : _b.type) === "element_click" || ((_c = value.advance) == null ? void 0 : _c.type) === "element_hover" ? value.advance.target : void 0;
      const advance = cloneOnsite(guideOperation.advance);
      value.advance = advance.type === "route" ? { ...advance, pageRules: withPageRuleIds(advance.pageRules) } : { ...advance, ...target ? { target } : {} };
      affected.add(value.id);
    } else if (guideOperation.type === "update_guide_presentation") {
      const value = step(guideOperation.stepId), { missingTarget, ...presentationPatch } = cloneOnsite(guideOperation.presentation);
      value.presentation = { ...value.presentation, ...presentationPatch, ...missingTarget && { missingTarget } };
      if (missingTarget === null && value.presentation) delete value.presentation.missingTarget;
      affected.add(value.id);
    } else if (guideOperation.type === "update_guide_targeting") {
      const patch = cloneOnsite(guideOperation.patch);
      Object.assign(guide.targeting, patch, patch.pageRules ? { pageRules: withPageRuleIds(patch.pageRules) } : {});
    } else if (guideOperation.type === "request_guide_target") {
      const value = step(guideOperation.stepId), target = resolvedTargets.get(operationIndex);
      if (!target) throw new Error(`Select a ${guideOperation.targetKind === "position" ? "positioning" : "interaction"} target before applying.`);
      const safe = { ...cloneOnsite(target) };
      if (guideOperation.targetKind === "position") value.target = safe;
      else {
        if (!(((_d = value.advance) == null ? void 0 : _d.type) === "element_click" || ((_e = value.advance) == null ? void 0 : _e.type) === "element_hover")) throw new Error("Configure click or hover advancement before selecting its target.");
        value.advance.target = safe;
      }
      affected.add(value.id);
    } else throw new Error("Unsupported Guide AI operation.");
  });
  for (const [stepId, operations] of withinStep) {
    const value = step(stepId), document2 = onsiteDocumentFromBuilder(value.builder);
    if (!document2 || !value.builder) throw new Error(`Step ${stepId} has no editable on-site document.`);
    const next = applyEditorAiProposal(document2, { summary: proposal.summary, operations });
    value.content = applyOnsiteDocument(value.builder, next, getGuideStepPattern(value)).content;
  }
  const warnings = [];
  guide.steps.forEach((value, index) => {
    var _a2, _b;
    warnings.push(...guideStepConfigurationErrors(value, index));
    if (((_b = (_a2 = value.presentation) == null ? void 0 : _a2.missingTarget) == null ? void 0 : _b.action) === "skip" && index === guide.steps.length - 1) warnings.push(`Step ${index + 1}: Skip cannot be used on the final step.`);
    const document2 = onsiteDocumentFromBuilder(value.builder);
    if (!document2 || !validateOnsiteDocument(document2).valid) warnings.push(`Step ${index + 1}: on-site document is invalid.`);
  });
  if (warnings.length) throw new Error(warnings.join(" "));
  return { guide, affectedStepIds: [...affected], order: guide.steps.map((value) => value.id), warnings };
}
function editorAiContext(input2) {
  return { experience: input2.experience, selection: cloneOnsite(input2.selection), document: aiDocumentContext(input2.document), ...input2.builder ? { source: sourceContext(input2.builder, false) } : {}, ...input2.theme ? { theme: cloneOnsite(input2.theme) } : {} };
}
function guideAiContext(input2) {
  var _a;
  const selected = input2.guide.steps.find((step) => step.id === input2.currentStepId);
  if (!selected) throw new Error("Selected Guide step no longer exists.");
  const target = (value) => {
    var _a2;
    return value ? { configured: true, label: value.label, reliability: value.reliability, pagePath: (_a2 = value.targetContext) == null ? void 0 : _a2.pagePath } : { configured: false };
  };
  const summaries = input2.guide.steps.map((step, index) => {
    const document2 = onsiteDocumentFromBuilder(step.builder), buttons = document2 ? listBlocks(document2.root).filter((block) => block.type === "button").map((block) => ({ id: block.id, label: block.label, action: block.action.type })) : [];
    return { id: step.id, index, label: step.label, pattern: getGuideStepPattern(step), heading: step.content.heading, description: step.content.body, buttons, advance: step.advance ? { ...cloneOnsite(step.advance), ...step.advance.type === "element_click" || step.advance.type === "element_hover" ? { target: target(step.advance.target ?? step.target) } : {} } : { type: "button" }, presentation: step.presentation, dismissible: step.behavior.dismissible, positionTarget: target(step.target) };
  });
  const layer = (_a = input2.guide.behavior) == null ? void 0 : _a.layer;
  const behavior = layer ? { layer: layer.mode === "relative" ? { mode: layer.mode, relation: layer.relation, target: target(layer.target) } : cloneOnsite(layer) } : void 0;
  return { experience: { ...input2.experience, kind: "guide", widgetType: null }, selection: { ...cloneOnsite(input2.selection), scope: input2.scope ?? "step", stepId: selected.id }, guide: { id: input2.experience.id, name: input2.experience.name, revision: input2.revision, currentStepId: selected.id, totalSteps: input2.guide.steps.length, steps: summaries, targeting: cloneOnsite(input2.guide.targeting), ...behavior ? { behavior } : {}, theme: cloneOnsite(input2.theme ?? null) }, currentDocument: aiDocumentContext(onsiteDocumentFromBuilder(selected.builder) ?? null), ...selected.builder ? { source: sourceContext(selected.builder, true) } : {} };
}
const BLOCK_LABEL = { checklist_task: "Task", checklist_text: "Checklist text", checklist_control: "Checklist control", checklist_progress: "Progress", question: "Question", survey_controls: "Survey controls", heading: "Heading", text: "Text", button: "Button", image: "Image", divider: "Divider", spacer: "Spacer", icon: "Icon" };
const HISTORY_LIMIT = 50;
const HISTORY_BYTES = 2e6;
class OnsiteCompositionEditor {
  constructor(root2, builder, content, widgetType, guide, callbacks, survey, checklist) {
    var _a, _b;
    this.root = root2;
    this.builder = builder;
    this.content = content;
    this.widgetType = widgetType;
    this.guide = guide;
    this.callbacks = callbacks;
    this.survey = survey;
    this.checklist = checklist;
    this.source = null;
    this.edgeButtons = [];
    this.insertion = null;
    this.paletteAnchor = null;
    this.toolFrame = 0;
    this.handles = [];
    this.selection = { kind: "step", label: "Step" };
    this.history = [];
    this.historyIndex = -1;
    this.historyBytes = 0;
    this.compileTimer = 0;
    this.typingTimer = 0;
    this.composing = false;
    this.resizeCleanup = null;
    this.resizeFrame = 0;
    this.destroyed = false;
    this.compiledState = "";
    this.imageFileTarget = null;
    this.imageRequest = 0;
    this.imagePlaceholders = /* @__PURE__ */ new Map();
    this.imageDropTarget = null;
    this.savedRange = null;
    this.moveSource = null;
    this.checklistView = "expanded";
    this.rememberSelection = () => {
      var _a2;
      const range = editorRange(this.root);
      if (range && ((_a2 = this.surface) == null ? void 0 : _a2.contains(range.commonAncestorContainer))) this.savedRange = range.cloneRange();
    };
    this.onSurfaceClick = (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element) return;
      const blockElement = element.closest("[data-movcues-block-id]");
      const cellElement = element.closest("[data-movcues-node-id]");
      if (this.moveSource && cellElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.moveTo(cellElement.dataset.movcuesNodeId);
        return;
      }
      if (blockElement && cellElement) {
        const block = findBlock(this.document, blockElement.dataset.movcuesBlockId);
        if (block) this.select({ kind: "block", label: BLOCK_LABEL[block.type], cellId: cellElement.dataset.movcuesNodeId, blockId: block.id, blockType: block.type });
      } else if (cellElement) this.select({ kind: "cell", label: "Cell", cellId: cellElement.dataset.movcuesNodeId });
      else this.selectStep();
      if (blockElement == null ? void 0 : blockElement.hasAttribute("data-movcues-image-placeholder")) this.chooseImageFile(blockElement.dataset.movcuesBlockId);
      if (element.closest("[data-movcues-empty-cell]")) this.openPalette(element.closest("[data-movcues-empty-cell]"));
      if (blockElement == null ? void 0 : blockElement.matches("button,a")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    this.onImageDragOver = (event) => {
      var _a2, _b2, _c;
      if (this.moveSource && ((_a2 = event.dataTransfer) == null ? void 0 : _a2.types.includes("application/x-movcues-cell"))) {
        event.preventDefault();
        event.stopPropagation();
        this.clearImageDrop();
        const target2 = event.target instanceof Element ? event.target.closest("[data-movcues-node-id]") : null;
        const source = findCell(this.document, this.moveSource);
        if (target2 && source && target2.dataset.movcuesNodeId !== this.document.root.id && !findCell({ ...this.document, root: source }, target2.dataset.movcuesNodeId)) {
          this.imageDropTarget = target2;
          const row = ((_b2 = parentCell(this.document, target2.dataset.movcuesNodeId)) == null ? void 0 : _b2.direction) === "row";
          target2.setAttribute("data-movcues-insertion-edge", this.dropBefore(target2, event) ? row ? "left" : "top" : row ? "right" : "bottom");
          event.dataTransfer.dropEffect = "move";
        } else event.dataTransfer.dropEffect = "none";
        return;
      }
      if (!((_c = event.dataTransfer) == null ? void 0 : _c.types.includes("Files"))) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
      const block = target ? findBlock(this.document, target.dataset.movcuesBlockId) : null;
      this.clearImageDrop();
      event.dataTransfer.dropEffect = (block == null ? void 0 : block.type) === "image" ? "copy" : "none";
      if (target && (block == null ? void 0 : block.type) === "image") {
        this.imageDropTarget = target;
        target.setAttribute("data-movcues-image-drop", "");
      }
    };
    this.onImageDragLeave = (event) => {
      var _a2;
      if (!(event.relatedTarget instanceof Node) || !((_a2 = this.imageDropTarget) == null ? void 0 : _a2.contains(event.relatedTarget))) this.clearImageDrop();
    };
    this.onMoveDragStart = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-command="move"]')) return;
      const cell = this.getSelectedCell();
      if (!cell || cell === this.document.root || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      this.moveSource = cell.id;
      event.dataTransfer.setData("application/x-movcues-cell", cell.id);
      event.dataTransfer.effectAllowed = "move";
    };
    this.cancelMove = () => {
      var _a2, _b2;
      this.moveSource = null;
      this.clearImageDrop();
      (_a2 = this.surface) == null ? void 0 : _a2.removeAttribute("data-movcues-moving");
      (_b2 = this.toolbar.querySelector('[data-command="move"]')) == null ? void 0 : _b2.setAttribute("aria-pressed", "false");
    };
    this.onImageDrop = (event) => {
      var _a2, _b2;
      if (this.moveSource && ((_a2 = event.dataTransfer) == null ? void 0 : _a2.types.includes("application/x-movcues-cell"))) {
        event.preventDefault();
        event.stopPropagation();
        const target2 = event.target instanceof Element ? event.target.closest("[data-movcues-node-id]") : null;
        if (target2) this.moveTo(target2.dataset.movcuesNodeId, this.dropBefore(target2, event));
        this.cancelMove();
        return;
      }
      if (!((_b2 = event.dataTransfer) == null ? void 0 : _b2.files.length)) return;
      event.preventDefault();
      event.stopPropagation();
      this.clearImageDrop();
      const target = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
      const block = target ? findBlock(this.document, target.dataset.movcuesBlockId) : null;
      if ((block == null ? void 0 : block.type) !== "image") {
        this.callbacks.onValidation(["Drop the file onto an image block."]);
        return;
      }
      if (event.dataTransfer.files.length !== 1) {
        this.callbacks.onValidation(["Choose one image at a time."]);
        return;
      }
      void this.setImageFile(event.dataTransfer.files[0], block.id);
    };
    this.onDoubleClick = (event) => {
      const element = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
      const block = element ? findBlock(this.document, element.dataset.movcuesBlockId) : null;
      if (element && ((block == null ? void 0 : block.type) === "heading" || (block == null ? void 0 : block.type) === "text" || (block == null ? void 0 : block.type) === "button")) {
        element.contentEditable = "true";
        element.focus();
      }
    };
    this.onInput = (event) => {
      var _a2;
      const element = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
      const block = element ? findBlock(this.document, element.dataset.movcuesBlockId) : null;
      if (!block || !element) return;
      if (block.type === "heading" || block.type === "text") block.html = this.source ? element.innerHTML : sanitizeRichText(element.innerHTML);
      else if (block.type === "button") {
        (_a2 = this.source) == null ? void 0 : _a2.captureButtonHtml(block.id, element.innerHTML);
        block.label = (element.textContent ?? "").slice(0, this.source ? 1e4 : 80);
      } else return;
      this.scheduleCompile();
      this.positionTools();
      this.callbacks.onChange(true);
      clearTimeout(this.typingTimer);
      this.typingTimer = window.setTimeout(() => this.pushHistory(), 300);
    };
    this.onBlur = (event) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element == null ? void 0 : element.isContentEditable) {
        this.rememberSelection();
        if (event.relatedTarget) element.contentEditable = "false";
        this.flush();
        this.pushHistory();
      }
    };
    this.onCompositionStart = () => {
      this.composing = true;
    };
    this.onCompositionEnd = () => {
      this.composing = false;
      this.scheduleCompile();
    };
    this.onSurfaceKeyDown = (event) => {
      var _a2, _b2;
      if (this.composing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === "Escape") {
        this.cancelMove();
        if (target == null ? void 0 : target.isContentEditable) target.blur();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && (target == null ? void 0 : target.isContentEditable)) {
        event.preventDefault();
        const range = document.createRange();
        range.selectNodeContents(target);
        setEditorRange(this.root, range);
        this.savedRange = range.cloneRange();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.shiftKey ? this.redo() : this.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        this.rememberSelection();
        this.formatInline(event.key.toLowerCase() === "b" ? "strong" : event.key.toLowerCase() === "i" ? "em" : "u");
        return;
      }
      if (this.source && event.key === "Enter" && (target == null ? void 0 : target.isContentEditable) && ["heading", "text"].includes(((_a2 = this.getSelectedBlock()) == null ? void 0 : _a2.type) ?? "")) {
        const range = editorRange(this.root);
        if (range && target.contains(range.commonAncestorContainer)) {
          event.preventDefault();
          const br = document.createElement("br");
          range.deleteContents();
          range.insertNode(br);
          range.setStartAfter(br);
          range.collapse(true);
          setEditorRange(this.root, range);
          target.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
      if (target == null ? void 0 : target.isContentEditable) return;
      if (this.moveSource && event.key === "Tab" && (target == null ? void 0 : target.hasAttribute("data-movcues-node-id"))) {
        const destinations = this.moveDestinations();
        const index = destinations.indexOf(target);
        (_b2 = destinations[(index + (event.shiftKey ? -1 : 1) + destinations.length) % destinations.length]) == null ? void 0 : _b2.focus({ preventScroll: true });
        event.preventDefault();
        return;
      }
      if (event.key === "Enter" && (target == null ? void 0 : target.matches("[data-movcues-node-id]"))) {
        event.preventDefault();
        if (this.moveSource) this.moveTo(target.dataset.movcuesNodeId);
        else target.click();
      }
      if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        this.move(event.key === "ArrowUp" ? -1 : 1);
      } else if (event.ctrlKey || event.metaKey) {
        if (event.key === "ArrowUp") {
          this.selectParent();
          event.preventDefault();
        }
        if (event.key === "ArrowDown") {
          this.selectChild();
          event.preventDefault();
        }
      }
    };
    this.onPaste = (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest('[contenteditable="true"]') : null;
      if (!target || !event.clipboardData) return;
      const range = editorRange(this.root);
      if (!range || !target.contains(range.commonAncestorContainer)) return;
      event.preventDefault();
      const text2 = document.createTextNode(event.clipboardData.getData("text/plain"));
      range.deleteContents();
      range.insertNode(text2);
      range.setStartAfter(text2);
      range.collapse(true);
      setEditorRange(this.root, range);
      target.dispatchEvent(new Event("input", { bubbles: true }));
    };
    this.onToolbarClick = (event) => {
      var _a2, _b2, _c;
      const button = event.target instanceof Element ? event.target.closest("button[data-command]") : null;
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const command = button.dataset.command;
      if (command === "add") {
        if (this.palette.hidden) this.openPalette(button);
        else this.closePalette();
      } else if (command === "columns") this.split("row");
      else if (command === "rows") this.split("column");
      else if (command === "parent") this.selectParent();
      else if (command === "duplicate") this.duplicate();
      else if (command === "delete") this.remove();
      else if (command === "move-up") this.move(-1);
      else if (command === "move-down") this.move(1);
      else if (command === "move") {
        if (this.moveSource) this.cancelMove();
        else {
          this.moveSource = ((_a2 = this.getSelectedCell()) == null ? void 0 : _a2.id) ?? null;
          (_b2 = this.surface) == null ? void 0 : _b2.setAttribute("data-movcues-moving", "");
          button.setAttribute("aria-pressed", "true");
          button.title = "Choose a destination cell, or press Escape to cancel";
          if (event.detail === 0) (_c = this.moveDestinations()[0]) == null ? void 0 : _c.focus({ preventScroll: true });
        }
      }
    };
    this.onPaletteClick = (event) => {
      var _a2;
      const button = event.target instanceof Element ? event.target.closest("[data-insert-block],[data-insert-question],[data-insert-task]") : null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      if (button.hasAttribute("data-insert-task") ? this.insertTask(this.insertion ?? void 0) : button.dataset.insertQuestion ? this.insertQuestion(button.dataset.insertQuestion, this.insertion ?? void 0) : this.insertBlock(button.dataset.insertBlock, this.insertion ?? void 0)) {
        this.closePalette();
        const block = this.getSelectedBlock();
        const element = block ? (_a2 = this.surface) == null ? void 0 : _a2.querySelector(`[data-movcues-block-id="${block.id}"]`) : null;
        if (element) {
          element.tabIndex = -1;
          element.focus({ preventScroll: true });
        }
      }
    };
    this.dismissPalette = (event) => {
      if (!this.palette.hidden && !event.composedPath().some((node2) => node2 === this.palette || node2 === this.paletteAnchor)) this.closePalette();
    };
    this.onPaletteKeyDown = (event) => {
      if (event.key === "Escape" && this.moveSource) {
        this.cancelMove();
        event.preventDefault();
      }
      if (event.key !== "Escape" || this.palette.hidden) return;
      const anchor = this.paletteAnchor;
      this.closePalette();
      anchor == null ? void 0 : anchor.focus({ preventScroll: true });
      event.preventDefault();
    };
    this.positionTools = () => {
      cancelAnimationFrame(this.toolFrame);
      this.toolFrame = requestAnimationFrame(() => {
        if (!this.destroyed) this.updateToolPositions();
      });
    };
    this.startResize = (event) => {
      var _a2, _b2, _c;
      if (this.composing) return;
      const handle = event.currentTarget;
      const firstId = handle.dataset.first;
      const secondId = handle.dataset.second;
      const first = (_a2 = this.surface) == null ? void 0 : _a2.querySelector(`[data-movcues-node-id="${firstId}"]`);
      const second = (_b2 = this.surface) == null ? void 0 : _b2.querySelector(`[data-movcues-node-id="${secondId}"]`);
      if (!first || !second) return;
      if (!this.beforeTransaction()) return;
      const row = handle.dataset.movcuesResizeHandle === "row";
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      const start = row ? event.clientX : event.clientY;
      const total = row ? a.width + b.width : a.height + b.height;
      const initial = row ? a.width : a.height;
      let ratio = initial / total * 2;
      const move = (next) => {
        ratio = Math.max(0.1, Math.min(1.9, (initial + (row ? next.clientX : next.clientY) - start) / total * 2));
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = requestAnimationFrame(() => {
          first.style.flex = `${ratio} 1 0px`;
          second.style.flex = `${2 - ratio} 1 0px`;
          this.positionHandles();
        });
      };
      const finish = (save) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", cancel);
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = 0;
        this.resizeCleanup = null;
        if (save && !this.destroyed && resizeSiblings(this.document, firstId, secondId, ratio)) this.commit(this.selection);
        else {
          first.style.flex = "";
          second.style.flex = "";
        }
      };
      const stop = () => finish(true);
      const cancel = () => finish(false);
      (_c = this.resizeCleanup) == null ? void 0 : _c.call(this);
      this.resizeCleanup = cancel;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", cancel);
    };
    this.resizeWithKeyboard = (event) => {
      var _a2;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const handle = event.currentTarget;
      const first = findCell(this.document, handle.dataset.first);
      const weight = (first == null ? void 0 : first.sizing.mode) === "flexible" ? first.sizing.weight : 1;
      const increase = event.key === "ArrowRight" || event.key === "ArrowDown";
      if (!this.beforeTransaction()) return;
      if (resizeSiblings(this.document, handle.dataset.first, handle.dataset.second, weight + (increase ? 0.1 : -0.1))) this.commit(this.selection);
      (_a2 = this.root.querySelector(`[data-movcues-resize-handle][data-first="${handle.dataset.first}"][data-second="${handle.dataset.second}"]`)) == null ? void 0 : _a2.focus({ preventScroll: true });
      event.preventDefault();
    };
    this.source = isSourceAuthored(builder) ? new SourceDocumentAdapter(builder, content, { widgetType, guide, survey: survey ? { questions: survey.step.questions } : void 0, checklist: checklist ? { items: checklist.items } : void 0 }) : null;
    const existing = ((_a = this.source) == null ? void 0 : _a.getDocument()) ?? onsiteDocumentFromBuilder(builder);
    this.document = existing ?? migrateV1Builder(builder, content, widgetType, guide) ?? (() => {
      throw new Error("This v1 layout cannot be converted safely. Continue editing it with the compatibility editor.");
    })();
    this.migrated = ((_b = this.source) == null ? void 0 : _b.upgraded) ?? !existing;
    this.surface = root2.querySelector("[data-movcues-builder-surface]");
    this.toolbar = document.createElement("div");
    this.toolbar.dataset.movcuesCompositionToolbar = "";
    this.palette = document.createElement("div");
    this.palette.dataset.movcuesBlockPalette = "";
    this.palette.hidden = true;
    this.imageInput = document.createElement("input");
    this.imageInput.type = "file";
    this.imageInput.accept = "image/png,image/jpeg,image/webp";
    this.imageInput.hidden = true;
    this.imageInput.dataset.movcuesImageFile = "";
    this.imageInput.addEventListener("change", () => {
      var _a2;
      const id = this.imageFileTarget;
      this.imageFileTarget = null;
      const file = (_a2 = this.imageInput.files) == null ? void 0 : _a2[0];
      if (id && file) void this.setImageFile(file, id);
    });
  }
  start() {
    if (!this.surface) return;
    const repaired = this.repairDocumentStructure();
    this.compileAndPatch();
    const style = document.createElement("style");
    style.dataset.movcuesCompositionStyle = "";
    style.textContent = AUTHORING_STYLE;
    this.root.append(style);
    this.toolbar.setAttribute("role", "toolbar");
    this.toolbar.setAttribute("aria-label", "Selected element tools");
    const tools = [
      ["add", "Add block", '<path d="M8 3v10M3 8h10"/>'],
      ["columns", "Split into columns", '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M8 2v12"/>'],
      ["rows", "Split into rows", '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 8h12"/>'],
      ["parent", "Select parent", '<path d="M8 13V3m-4 4 4-4 4 4"/>'],
      ["duplicate", "Duplicate", '<rect x="6" y="6" width="8" height="8" rx="1"/><path d="M10 4V2H2v8h2"/>'],
      ["move-up", "Move before", '<path d="M13 8H3m4-4L3 8l4 4"/>'],
      ["move-down", "Move after", '<path d="M3 8h10M9 4l4 4-4 4"/>'],
      ["move", "Move to another cell: drag or click, then choose a cell", '<path d="M8 2v12M2 8h12m-4-4 4 4-4 4M6 4 2 8l4 4"/>'],
      ["delete", "Delete", '<path d="m4 4 8 8m0-8-8 8"/>']
    ];
    this.toolbar.innerHTML = tools.map(([command, label, icon]) => `<button type="button" data-command="${command}" title="${label}" aria-label="${label}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></button>`).join("");
    this.toolbar.querySelector('[data-command="move"]').draggable = true;
    this.palette.innerHTML = Object.keys(BLOCK_LABEL).filter((type) => type !== "question" && type !== "survey_controls" && !type.startsWith("checklist_") && !(this.checklist && type === "button")).map((type) => `<button type="button" data-insert-block="${type}">${BLOCK_LABEL[type]}</button>`).join("");
    if (this.survey && !this.source) this.palette.insertAdjacentHTML("beforeend", QUESTION_TYPES.map((type) => `<button type="button" data-insert-question="${type}">${{ single_choice: "Single choice", multiple_choice: "Multiple choice", short_text: "Short text", long_text: "Long text", rating: "Rating", nps: "NPS" }[type]}</button>`).join(""));
    this.root.append(this.toolbar, this.palette, this.imageInput);
    const edgeLabels = { top: "Add above", right: "Add to the right", bottom: "Add below", left: "Add to the left" };
    this.edgeButtons = ["top", "right", "bottom", "left"].map((edge) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.movcuesInsertEdge = edge;
      button.textContent = "+";
      button.title = edgeLabels[edge];
      button.setAttribute("aria-label", edgeLabels[edge]);
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => {
        const cell = this.getSelectedCell();
        if (this.paletteAnchor === button && !this.palette.hidden) this.closePalette();
        else if (cell) this.openPalette(button, { cellId: cell.id, edge });
      });
      this.root.append(button);
      return button;
    });
    if (this.checklist && !this.source) this.palette.insertAdjacentHTML("afterbegin", '<button type="button" data-insert-task>Task</button>');
    this.surface.addEventListener("click", this.onSurfaceClick);
    this.surface.addEventListener("dblclick", this.onDoubleClick);
    this.surface.addEventListener("input", this.onInput);
    this.surface.addEventListener("blur", this.onBlur, true);
    this.surface.addEventListener("compositionstart", this.onCompositionStart);
    this.surface.addEventListener("compositionend", this.onCompositionEnd);
    this.surface.addEventListener("keydown", this.onSurfaceKeyDown);
    this.surface.addEventListener("dragover", this.onImageDragOver);
    this.surface.addEventListener("dragleave", this.onImageDragLeave);
    this.surface.addEventListener("drop", this.onImageDrop);
    this.surface.addEventListener("keyup", this.rememberSelection);
    this.surface.addEventListener("mouseup", this.rememberSelection);
    this.surface.addEventListener("paste", this.onPaste);
    this.toolbar.addEventListener("dragstart", this.onMoveDragStart);
    this.toolbar.addEventListener("dragend", this.cancelMove);
    this.toolbar.addEventListener("click", this.onToolbarClick);
    this.palette.addEventListener("click", this.onPaletteClick);
    this.root.addEventListener("scroll", this.positionTools, true);
    window.addEventListener("scroll", this.positionTools, true);
    window.addEventListener("resize", this.positionTools);
    window.addEventListener("pointerdown", this.dismissPalette, true);
    window.addEventListener("keydown", this.onPaletteKeyDown);
    this.select({ kind: "step", label: "Step" });
    this.pushHistory();
    if (this.migrated || repaired) this.callbacks.onChange();
  }
  restoreBuilder(builder, content) {
    var _a;
    Object.assign(this.builder, cloneOnsite(builder));
    for (const key of Object.keys(this.content)) Reflect.deleteProperty(this.content, key);
    Object.assign(this.content, cloneOnsite(content));
    this.source = isSourceAuthored(this.builder) ? new SourceDocumentAdapter(this.builder, this.content, { widgetType: this.widgetType, guide: this.guide, survey: this.survey ? { questions: this.survey.step.questions } : void 0, checklist: this.checklist ? { items: this.checklist.items } : void 0 }) : null;
    this.document = ((_a = this.source) == null ? void 0 : _a.getDocument()) ?? onsiteDocumentFromBuilder(this.builder);
    this.compileAndPatch();
    this.restoreSelection(this.selection);
    this.callbacks.onChange();
  }
  isSource() {
    return Boolean(this.source);
  }
  getDocument() {
    return this.document;
  }
  getSelection() {
    return this.selection;
  }
  getSelectedCell() {
    const id = this.selection.kind === "step" ? this.checklist && !this.source ? this.document.root.children.find((cell) => cell.checklistRole === this.checklistView).id : this.document.root.id : this.selection.cellId;
    return findCell(this.document, id);
  }
  getSelectedBlock() {
    return this.selection.kind === "block" ? findBlock(this.document, this.selection.blockId) : null;
  }
  canUndo() {
    if (this.callbacks.canUndo) return this.callbacks.canUndo();
    return this.historyIndex > 0 || this.historyIndex >= 0 && this.historyState() !== this.historyState(this.history[this.historyIndex]);
  }
  canRedo() {
    if (this.callbacks.canRedo) return this.callbacks.canRedo();
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1 && this.historyState() === this.historyState(this.history[this.historyIndex]);
  }
  isComposing() {
    return this.composing;
  }
  getValidation() {
    var _a, _b;
    if (this.source) {
      this.source.setContracts((_a = this.survey) == null ? void 0 : _a.step.questions, (_b = this.checklist) == null ? void 0 : _b.items);
      return this.source.validate(this.document);
    }
    return [...validateOnsiteDocument(this.document).errors, ...this.survey ? validateOnsiteSurveyDocument(this.document, this.surveyContext()) : [], ...this.checklist ? validateOnsiteChecklistDocument(this.document, this.checklist) : []];
  }
  /** Commits an already-reviewed AI proposal as one undoable transaction. */
  applyAiProposal(proposal) {
    if (this.guide || this.survey || this.checklist || this.composing || !this.beforeTransaction()) return false;
    try {
      this.document = applyEditorAiProposal(this.document, proposal);
      return this.commit(this.selection);
    } catch (error) {
      const previous = this.history[this.historyIndex];
      if (previous) this.document = cloneOnsite(previous.document);
      this.callbacks.onValidation([error instanceof Error ? error.message : "AI proposal is invalid."]);
      return false;
    }
  }
  flush() {
    var _a, _b;
    if (this.composing) return false;
    clearTimeout(this.compileTimer);
    this.compileTimer = 0;
    this.repairDocumentStructure();
    const state = this.historyState();
    if (state === this.compiledState) return true;
    const errors = this.getValidation();
    this.callbacks.onValidation(errors);
    if (errors.length) return false;
    try {
      const compiled = this.compile();
      Object.assign(this.content, compiled.content);
      this.compiledState = state;
      (_b = (_a = this.callbacks).onTransaction) == null ? void 0 : _b.call(_a);
      return true;
    } catch (error) {
      this.callbacks.onValidation([error instanceof Error ? error.message : "Source edit failed."]);
      return false;
    }
  }
  snapshot() {
    this.flush();
    return { builder: cloneOnsite(this.builder), content: cloneOnsite(this.content) };
  }
  undo() {
    if (this.callbacks.onUndo) {
      this.callbacks.onUndo();
      return;
    }
    if (this.composing) return;
    if (!this.flush()) {
      clearTimeout(this.typingTimer);
      const current = this.history[this.historyIndex];
      if (current) this.restore(current);
      return;
    }
    this.pushHistory();
    if (!this.canUndo()) return;
    clearTimeout(this.typingTimer);
    this.historyIndex--;
    this.restore(this.history[this.historyIndex]);
  }
  redo() {
    if (this.callbacks.onRedo) {
      this.callbacks.onRedo();
      return;
    }
    if (!this.canRedo() || this.composing) return;
    this.historyIndex++;
    this.restore(this.history[this.historyIndex]);
  }
  restoreSelection(selection) {
    if (selection.kind === "block") {
      const cell = cellForBlock(this.document, selection.blockId);
      if (cell == null ? void 0 : cell.block) {
        this.select({ ...selection, cellId: cell.id, blockType: cell.block.type });
        return;
      }
    } else if (selection.kind === "step" || findCell(this.document, selection.cellId)) {
      this.select(selection);
      return;
    }
    this.selectStep();
  }
  selectStep() {
    this.select({ kind: "step", label: "Step" });
  }
  selectParent() {
    var _a;
    if (this.selection.kind === "block") {
      const cell = ((_a = this.source) == null ? void 0 : _a.componentIsCell(this.selection.cellId)) ? parentCell(this.document, this.selection.cellId) : findCell(this.document, this.selection.cellId);
      cell ? this.select({ kind: "cell", label: "Cell", cellId: cell.id }) : this.selectStep();
      return;
    }
    if (this.selection.kind === "cell") {
      const parent = parentCell(this.document, this.selection.cellId);
      parent ? this.select({ kind: "cell", label: "Parent cell", cellId: parent.id }) : this.selectStep();
    }
  }
  selectChild() {
    var _a;
    if (this.selection.kind === "step") {
      this.select({ kind: "cell", label: "Root cell", cellId: this.document.root.id });
      return;
    }
    if (this.selection.kind !== "cell") return;
    const cell = findCell(this.document, this.selection.cellId);
    if (!cell) return;
    if (cell.block) this.select({ kind: "block", label: BLOCK_LABEL[cell.block.type], cellId: cell.id, blockId: cell.block.id, blockType: cell.block.type });
    else if ((_a = cell.children) == null ? void 0 : _a[0]) {
      const child = cell.children[0];
      this.select(this.source && child.block ? { kind: "block", label: BLOCK_LABEL[child.block.type], cellId: child.id, blockId: child.block.id, blockType: child.block.type } : { kind: "cell", label: "Child cell", cellId: child.id });
    }
  }
  insertBlock(type, insertion) {
    const cell = this.getSelectedCell();
    if (!cell || this.composing) return false;
    if (!this.beforeTransaction()) return false;
    const block = createBlock(type, this.guide);
    if (insertion) {
      const candidate = cloneOnsite(this.document);
      const id = insertAdjacentCell(candidate, insertion.cellId, insertion.edge);
      if (!id) return false;
      findCell(candidate, id).block = block;
      const validation = this.source ? (() => {
        const errors = this.source.validate(candidate);
        return { valid: !errors.length, errors };
      })() : validateOnsiteDocument(candidate);
      this.callbacks.onValidation(validation.errors);
      if (!validation.valid) return false;
      this.document = candidate;
      return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: id, blockId: block.id, blockType: type });
    }
    if (cell.children) {
      const added2 = emptyCell(block);
      cell.children.push(added2);
      return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: added2.id, blockId: block.id, blockType: type });
    }
    if (!cell.block) {
      cell.block = block;
      return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: cell.id, blockId: block.id, blockType: type });
    }
    const addedId = duplicateCell(this.document, cell.id) ?? splitCell(this.document, cell.id, "column");
    const added = addedId ? findCell(this.document, addedId) : null;
    if (!added) return false;
    delete added.children;
    added.block = block;
    return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: added.id, blockId: block.id, blockType: type });
  }
  split(direction) {
    const cell = this.getSelectedCell();
    if (!cell || this.composing) return false;
    if (!this.beforeTransaction()) return false;
    const id = this.source ? insertAdjacentCell(this.document, cell.id, direction === "row" ? "right" : "bottom") : splitCell(this.document, cell.id, direction);
    if (!id) return false;
    return this.commit({ kind: "cell", label: direction === "row" ? "Right cell" : "Lower cell", cellId: id });
  }
  addEdge(edge) {
    if (this.composing) return;
    if (!this.beforeTransaction()) return;
    const id = insertEdgeCell(this.document, edge);
    this.commit({ kind: "cell", label: `${edge} cell`, cellId: id });
  }
  duplicate() {
    var _a;
    const cell = this.getSelectedCell();
    if (!cell || cell === this.document.root || this.composing) return false;
    if (!this.beforeTransaction()) return false;
    if (this.checklist && !this.source) {
      const duplicated = duplicateChecklistCell(this.document, this.checklist, cell.id);
      if (!duplicated) {
        this.callbacks.onValidation(["Required Checklist components cannot be duplicated."]);
        return false;
      }
      this.document = duplicated.document;
      this.checklist.items = duplicated.items;
      this.commit({ kind: "cell", label: "Duplicated cell", cellId: duplicated.cellId });
      return true;
    }
    if (this.survey && !this.source) {
      const duplicated = duplicateSurveyCell(this.document, this.survey.step.questions, cell.id);
      if (!duplicated) return false;
      this.document = duplicated.document;
      this.survey.step.questions = duplicated.questions;
      return this.commit({ kind: "cell", label: "Duplicated cell", cellId: duplicated.cellId });
    }
    const id = duplicateCell(this.document, cell.id);
    if (!id) return false;
    (_a = this.source) == null ? void 0 : _a.duplicate(cell.id, id);
    return this.commit({ kind: "cell", label: "Duplicated cell", cellId: id });
  }
  remove() {
    const cell = this.getSelectedCell();
    if (!cell || cell === this.document.root || this.composing) return false;
    if (!this.beforeTransaction()) return false;
    if (this.survey && listBlocks(cell).some((block) => block.type === "survey_controls")) {
      this.callbacks.onValidation(["Keep the Survey navigation block so visitors can continue or submit."]);
      return false;
    }
    if (this.checklist && !this.source) {
      const components2 = listBlocks(cell);
      if (cell.checklistRole || components2.some((block) => block.type.startsWith("checklist_") && block.type !== "checklist_task")) {
        this.callbacks.onValidation(["Keep the required Checklist views and controls. You can style or move them within their view."]);
        return false;
      }
      const removedTasks = new Set(components2.filter((block) => block.type === "checklist_task").map((block) => block.itemId));
      if (this.checklist.items.length - removedTasks.size < 1) {
        this.callbacks.onValidation(["Keep at least one task in this Checklist."]);
        return false;
      }
      this.checklist.items = this.checklist.items.filter((item) => !removedTasks.has(item.id));
    }
    const removed = new Set(listBlocks(cell).filter((block) => block.type === "question").map((block) => block.type === "question" ? block.questionId : ""));
    const parent = parentCell(this.document, cell.id);
    if (!(this.source ? this.source.removeCell(this.document, cell.id) : removeCell(this.document, cell.id))) return false;
    if (this.survey && !this.source) {
      this.survey.step.questions = this.survey.step.questions.filter((question) => !removed.has(question.id));
      if (this.survey.step.branching) this.survey.step.branching.rules = this.survey.step.branching.rules.filter((rule2) => !removed.has(rule2.questionId));
    }
    return this.commit(parent ? { kind: "cell", label: "Parent cell", cellId: parent.id } : { kind: "step", label: "Step" });
  }
  move(delta) {
    const cell = this.getSelectedCell();
    if (!cell || this.composing) return false;
    if (!this.beforeTransaction()) return false;
    if (!moveCell(this.document, cell.id, delta)) return false;
    return this.commit(this.selection);
  }
  /** Move the existing subtree; never regenerate its cell/block/action IDs. */
  moveTo(targetId, before = false, sourceId = this.moveSource ?? ((_a) => (_a = this.getSelectedCell()) == null ? void 0 : _a.id)()) {
    if (!sourceId || sourceId === targetId || this.composing) return false;
    const candidate = cloneOnsite(this.document);
    const source = findCell(candidate, sourceId);
    const target = findCell(candidate, targetId);
    const from = parentCell(candidate, sourceId);
    if (!source || !target || !(from == null ? void 0 : from.children) || findCell({ ...candidate, root: source }, targetId)) return false;
    from.children.splice(from.children.indexOf(source), 1);
    if (!from.children.length) delete from.children;
    if (!target.block && !target.children) target.children = [source];
    else {
      const to = parentCell(candidate, targetId);
      if (!(to == null ? void 0 : to.children)) return false;
      to.children.splice(to.children.indexOf(target) + (before ? 0 : 1), 0, source);
    }
    const validation = this.source ? (() => {
      const errors = this.source.validate(candidate);
      return { valid: !errors.length, errors };
    })() : validateOnsiteDocument(candidate);
    this.callbacks.onValidation(validation.errors);
    if (!validation.valid) return false;
    if (!this.beforeTransaction()) return false;
    this.document = candidate;
    this.cancelMove();
    return this.commit(source.block ? { kind: "block", label: BLOCK_LABEL[source.block.type], cellId: source.id, blockId: source.block.id, blockType: source.block.type } : { kind: "cell", label: "Cell", cellId: source.id });
  }
  checklistState() {
    const value = this.checklist;
    return cloneOnsite({ title: value.title, description: value.description, items: value.items, behavior: value.behavior, completionMessage: value.completionMessage });
  }
  updateChecklistViewWidth(width) {
    if (this.source || !this.checklist || !this.beforeTransaction()) return;
    const view = this.document.root.children.find((cell) => cell.checklistRole === this.checklistView);
    view.checklistWidth = width;
    this.commit(this.selection);
  }
  refreshChecklist() {
    var _a, _b;
    (_b = (_a = this.callbacks).onPatch) == null ? void 0 : _b.call(_a);
    this.callbacks.onSelectionChange(this.selection);
  }
  setChecklistView(view) {
    this.checklistView = view;
  }
  getSelectedTask() {
    var _a;
    const block = this.getSelectedBlock();
    return (block == null ? void 0 : block.type) === "checklist_task" ? ((_a = this.checklist) == null ? void 0 : _a.items.find((item) => item.id === block.itemId)) ?? null : null;
  }
  updateChecklist(update) {
    if (!this.checklist || !this.beforeTransaction()) return false;
    const next = this.checklistState();
    update(next);
    if (!next.title.trim() || next.title.length > 160 || !next.completionMessage.title.trim() || !next.completionMessage.acknowledgeLabel.trim() || next.completionMessage.acknowledgeLabel.length > 80 || next.items.some((item) => {
      var _a;
      return !item.title.trim() || item.title.length > 200 || (((_a = item.description) == null ? void 0 : _a.length) ?? 0) > 1e3 || item.action.type === "none" && item.completion.type !== "item_clicked";
    })) {
      this.callbacks.onValidation(["Use a title and valid task settings. Tasks without an action must complete when clicked."]);
      return false;
    }
    if (this.source) {
      try {
        this.source.synchronizeChecklist(next);
        this.document = this.source.getDocument();
      } catch (error) {
        this.callbacks.onValidation([error instanceof Error ? error.message : "Checklist update failed."]);
        return false;
      }
    }
    Object.assign(this.checklist, next);
    return this.commit(this.selection);
  }
  insertTask(insertion) {
    if (this.source || !this.checklist || this.checklist.items.length >= 20 || !this.beforeTransaction()) return false;
    let container2;
    const visit = (cell2) => {
      var _a;
      if (cell2.checklistRole === "items") container2 = cell2;
      (_a = cell2.children) == null ? void 0 : _a.forEach(visit);
    };
    visit(this.document.root);
    if (!container2) return false;
    const item = { id: onsiteId("item"), title: "New task", description: "Describe the next step.", action: { type: "none" }, completion: { type: "item_clicked" } };
    let cell;
    if (insertion) {
      let target = findCell(this.document, insertion.cellId);
      while (target && target !== container2) target = parentCell(this.document, target.id);
      if (!target) {
        this.callbacks.onValidation(["Insert tasks inside the Expanded task list."]);
        return false;
      }
      const id = insertAdjacentCell(this.document, insertion.cellId, insertion.edge);
      if (!id) return false;
      cell = findCell(this.document, id);
      cell.block = { id: onsiteId("block"), type: "checklist_task", itemId: item.id, fontSize: 14, indicator: "check" };
    } else {
      cell = emptyCell({ id: onsiteId("block"), type: "checklist_task", itemId: item.id, fontSize: 14, indicator: "check" });
      container2.children.push(cell);
    }
    cell.sizing = { mode: "hug" };
    this.checklist.items.push(item);
    this.checklistView = "expanded";
    this.commit({ kind: "block", label: "Task", cellId: cell.id, blockId: cell.block.id, blockType: "checklist_task" });
    return true;
  }
  surveyContext() {
    return this.survey ? { questions: this.survey.step.questions, submitLabel: this.survey.config.submitLabel } : void 0;
  }
  historyState(entry) {
    return JSON.stringify(this.checklist ? { document: (entry == null ? void 0 : entry.document) ?? this.document, checklist: entry ? entry.checklist : this.checklistState() } : this.survey ? entry ? { document: entry.document, questions: entry.questions, branching: entry.branching } : { document: this.document, questions: this.survey.step.questions, branching: this.survey.step.branching } : (entry == null ? void 0 : entry.document) ?? this.document);
  }
  getSelectedQuestion() {
    var _a;
    const block = this.getSelectedBlock();
    return (block == null ? void 0 : block.type) === "question" ? ((_a = this.survey) == null ? void 0 : _a.step.questions.find((question) => question.id === block.questionId)) ?? null : null;
  }
  refreshSurvey() {
    if (this.source) {
      this.source.refresh();
      this.document = this.source.getDocument();
    }
    this.compileAndPatch();
    this.select(this.selection);
  }
  insertQuestion(type, insertion) {
    if (this.source || !this.survey || !QUESTION_TYPES.includes(type) || this.survey.step.questions.length >= 20 || !this.beforeTransaction()) return false;
    const selected = this.getSelectedCell();
    if (!selected) return false;
    const candidate = cloneOnsite(this.document), question = newSurveyQuestion(type);
    const block = { id: onsiteId("block"), type: "question", questionId: question.id, fontSize: 14 };
    let cell = findCell(candidate, selected.id);
    if (insertion) {
      const id = insertAdjacentCell(candidate, insertion.cellId, insertion.edge);
      if (!id) return false;
      cell = findCell(candidate, id);
    } else if (cell.children) {
      const added = emptyCell();
      cell.children.push(added);
      cell = added;
    } else if (cell.block) {
      const id = insertAdjacentCell(candidate, cell.id, "bottom");
      if (!id) return false;
      cell = findCell(candidate, id);
    }
    cell.block = block;
    cell.sizing = { mode: "hug" };
    const questions = [...this.survey.step.questions, question];
    const errors = [...validateOnsiteDocument(candidate).errors, ...validateOnsiteSurveyDocument(candidate, { questions })];
    if (errors.length) {
      this.callbacks.onValidation(errors);
      return false;
    }
    this.document = candidate;
    this.survey.step.questions = questions;
    return this.commit({ kind: "block", label: "Question", cellId: cell.id, blockId: block.id, blockType: block.type });
  }
  updateStepHeading(label) {
    if (!this.survey || !this.beforeTransaction()) return false;
    const heading = listBlocks(this.document.root).find((block) => block.type === "heading");
    if ((heading == null ? void 0 : heading.type) !== "heading") {
      this.callbacks.onValidation(["Insert a Heading block to set the step heading."]);
      return false;
    }
    heading.html = escapeHtmlAttribute(label.slice(0, 160));
    return this.commit(this.selection);
  }
  updateBranching(branching) {
    if (!this.survey || !this.beforeTransaction()) return false;
    const step = { ...this.survey.step, branching: cloneOnsite(branching) };
    const errors = surveyBranchErrors({ ...this.survey.config, steps: this.survey.config.steps.map((value) => value.id === step.id ? step : value) });
    if (errors.length) {
      this.callbacks.onValidation(errors);
      return false;
    }
    this.survey.step.branching = step.branching;
    return this.commit(this.selection);
  }
  updateQuestion(question) {
    const current = this.getSelectedQuestion();
    if (!this.survey || !current || current.id !== question.id || !this.beforeTransaction()) return false;
    const questions = this.survey.step.questions.map((value) => value.id === question.id ? cloneOnsite(question) : value);
    const errors = surveyQuestionErrors(questions);
    if (errors.length) {
      this.callbacks.onValidation(errors);
      return false;
    }
    if (this.source) {
      try {
        this.source.synchronizeQuestion(question, current, questions);
        this.document = this.source.getDocument();
      } catch (error) {
        this.callbacks.onValidation([error instanceof Error ? error.message : "Question update failed."]);
        return false;
      }
    }
    this.survey.step.questions = questions;
    if (this.survey.step.branching) this.survey.step.branching.rules = this.survey.step.branching.rules.filter((rule2) => {
      if (rule2.questionId !== question.id) return true;
      const step = { ...this.survey.step, branching: { rules: [rule2] } };
      return !surveyBranchErrors({ ...this.survey.config, steps: this.survey.config.steps.map((value) => value.id === step.id ? step : value) }).length;
    });
    return this.commit(this.selection);
  }
  updateCell(update) {
    const cell = this.getSelectedCell();
    if (!cell || this.composing) return;
    if (!this.beforeTransaction()) return;
    Object.assign(cell, cloneOnsite(update));
    this.commit(this.selection);
  }
  updateBlock(update) {
    const block = this.getSelectedBlock();
    if (!block || this.composing) return;
    if (!this.beforeTransaction()) return;
    Object.assign(block, cloneOnsite(update));
    this.commit(this.selection);
  }
  chooseImageFile(blockId) {
    const block = blockId ? findBlock(this.document, blockId) : this.getSelectedBlock();
    if ((block == null ? void 0 : block.type) !== "image" || this.destroyed) return;
    this.imageFileTarget = block.id;
    this.imageInput.value = "";
    this.imageInput.click();
  }
  setImageSource(src) {
    var _a;
    if (((_a = this.getSelectedBlock()) == null ? void 0 : _a.type) !== "image") return false;
    if (!onsiteImageSourceIsSafe(src)) {
      this.callbacks.onValidation(["Use an HTTP(S) image URL, a /path on your site, or choose an image file."]);
      return false;
    }
    this.callbacks.onValidation([]);
    this.updateBlock({ src });
    return true;
  }
  async setImageFile(file, blockId) {
    var _a, _b, _c, _d, _e;
    const block = blockId ? findBlock(this.document, blockId) : this.getSelectedBlock();
    if ((block == null ? void 0 : block.type) !== "image" || this.destroyed) return false;
    const request = ++this.imageRequest;
    const id = block.id;
    const previousSrc = block.src;
    const placeholder = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-image-placeholder][data-movcues-block-id="${id}"]`);
    if (placeholder) {
      placeholder.disabled = true;
      placeholder.setAttribute("aria-busy", "true");
    }
    (_c = (_b = this.callbacks).onImageStatus) == null ? void 0 : _c.call(_b, "Preparing image…");
    try {
      const src = await prepareImageFile(file);
      if (this.destroyed || request !== this.imageRequest) return false;
      const current = findBlock(this.document, id);
      if ((current == null ? void 0 : current.type) !== "image" || current.src !== previousSrc) return false;
      const candidate = cloneOnsite(this.document);
      const image = findBlock(candidate, id);
      if ((image == null ? void 0 : image.type) !== "image") return false;
      image.src = src;
      const validation = this.source ? (() => {
        const errors = this.source.validate(candidate);
        return { valid: !errors.length, errors };
      })() : validateOnsiteDocument(candidate);
      this.callbacks.onValidation(validation.errors);
      if (!validation.valid) return false;
      if (!this.flush()) return false;
      this.document = candidate;
      return this.commit(this.selection);
    } catch (error) {
      if (!this.destroyed && request === this.imageRequest) this.callbacks.onValidation([error instanceof Error ? error.message : "Image could not be added. Try another file."]);
      return false;
    } finally {
      if (placeholder) {
        placeholder.disabled = false;
        placeholder.removeAttribute("aria-busy");
      }
      if (!this.destroyed && request === this.imageRequest) (_e = (_d = this.callbacks).onImageStatus) == null ? void 0 : _e.call(_d, "");
      this.imageInput.value = "";
    }
  }
  updateButtonAction(action) {
    const block = this.getSelectedBlock();
    if ((block == null ? void 0 : block.type) !== "button") return;
    if (!this.beforeTransaction()) return;
    block.action = { id: block.action.id, ...action };
    this.commit(this.selection);
  }
  editSelected() {
    var _a;
    if (this.selection.kind !== "block") return;
    const block = this.getSelectedBlock();
    if (!block || !["heading", "text", "button"].includes(block.type)) return;
    const element = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-block-id="${block.id}"]`);
    if (element) {
      element.contentEditable = "true";
      element.focus();
    }
  }
  setAlignment(align) {
    this.updateBlock({ align });
  }
  formatInline(tag) {
    return this.wrapSelection(tag);
  }
  toggleList(tag) {
    const block = this.getSelectedBlock();
    if ((block == null ? void 0 : block.type) !== "text" || this.composing) return false;
    if (!this.beforeTransaction()) return false;
    const current = block.html.trim();
    block.html = current.startsWith(`<${tag}>`) ? current.replace(new RegExp(`^<${tag}><li>|</li></${tag}>$`, "g"), "") : `<${tag}><li>${current}</li></${tag}>`;
    return this.commit(this.selection);
  }
  applyLink(url) {
    if (!builderLinkUrlIsSafe(url)) return false;
    return this.wrapSelection("a", url);
  }
  wrapSelection(tag, href) {
    var _a, _b, _c;
    if (this.composing) return false;
    const block = this.getSelectedBlock();
    if (!block || block.type !== "heading" && block.type !== "text") return false;
    const element = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-block-id="${block.id}"]`);
    if (!element) return false;
    if (!this.beforeTransaction()) return false;
    if (this.savedRange && element.contains(this.savedRange.commonAncestorContainer)) {
      setEditorRange(this.root, this.savedRange);
    }
    const range = editorRange(this.root);
    const selectedInside = range && element.contains(range.commonAncestorContainer) && !range.collapsed;
    if (tag === "a" && (selectedInside ? (range == null ? void 0 : range.cloneContents().querySelector("a")) || ((_b = range == null ? void 0 : range.startContainer.parentElement) == null ? void 0 : _b.closest("a")) || ((_c = range == null ? void 0 : range.endContainer.parentElement) == null ? void 0 : _c.closest("a")) : element.querySelector("a"))) return false;
    if (selectedInside && range) {
      const wrapper = document.createElement(tag);
      if (tag === "a" && href) {
        wrapper.setAttribute("href", href);
        if (/^https?:\/\//i.test(href)) {
          wrapper.setAttribute("target", "_blank");
          wrapper.setAttribute("rel", "noopener noreferrer");
        }
      }
      try {
        range.surroundContents(wrapper);
      } catch {
        wrapper.append(range.extractContents());
        range.insertNode(wrapper);
      }
      block.html = this.source ? element.innerHTML : sanitizeRichText(element.innerHTML);
    } else {
      const open = tag === "a" ? `<a href="${escapeHtmlAttribute(href ?? "")}"${/^https?:\/\//i.test(href ?? "") ? ' target="_blank" rel="noopener noreferrer"' : ""}>` : `<${tag}>`;
      block.html = `${open}${block.html}</${tag}>`;
    }
    if (!selectedInside) element.innerHTML = block.html;
    element.contentEditable = "true";
    element.focus({ preventScroll: true });
    this.rememberSelection();
    this.flush();
    this.pushHistory();
    this.callbacks.onChange();
    this.positionTools();
    return true;
  }
  select(selection) {
    var _a, _b, _c, _d;
    this.closePalette();
    this.selection = selection;
    (_a = this.surface) == null ? void 0 : _a.querySelectorAll("[data-movcues-editor-selected]").forEach((element) => element.removeAttribute("data-movcues-editor-selected"));
    const target = selection.kind === "block" ? (_b = this.surface) == null ? void 0 : _b.querySelector(`[data-movcues-block-id="${selection.blockId}"]`) : selection.kind === "cell" ? (_c = this.surface) == null ? void 0 : _c.querySelector(`[data-movcues-node-id="${selection.cellId}"]`) : (_d = this.surface) == null ? void 0 : _d.querySelector(".movcues-widget");
    target == null ? void 0 : target.setAttribute("data-movcues-editor-selected", selection.kind);
    this.syncToolbarState();
    this.callbacks.onSelectionChange(selection);
    this.renderResizeHandles();
    this.positionTools();
  }
  beforeTransaction() {
    clearTimeout(this.typingTimer);
    this.repairDocumentStructure();
    if (!this.flush()) return false;
    this.pushHistory();
    return true;
  }
  commit(selection) {
    this.repairDocumentStructure();
    if (this.checklist && !this.source) {
      const byId = new Map(this.checklist.items.map((item) => [item.id, item]));
      this.checklist.items = listBlocks(this.document.root).filter((block) => block.type === "checklist_task").map((block) => byId.get(block.itemId)).filter(Boolean);
    }
    const errors = this.getValidation();
    const validation = { valid: !errors.length, errors };
    if (!validation.valid) {
      const previous = this.history[this.historyIndex];
      if (previous) {
        this.document = cloneOnsite(previous.document);
        if (this.checklist && previous.checklist) Object.assign(this.checklist, cloneOnsite(previous.checklist));
        if (this.survey && previous.questions) {
          this.survey.step.questions = cloneOnsite(previous.questions);
          this.survey.step.branching = previous.branching ? cloneOnsite(previous.branching) : void 0;
        }
        this.compileAndPatch();
        this.select(previous.selection);
      }
      this.callbacks.onValidation(validation.errors);
      return false;
    }
    if (this.historyState() === this.compiledState) {
      this.select(selection);
      return true;
    }
    this.selection = selection;
    this.compileAndPatch();
    this.pushHistory();
    this.callbacks.onChange();
    this.select(selection);
    return true;
  }
  compileAndPatch() {
    var _a, _b, _c, _d, _e, _f, _g;
    const compiled = this.compile();
    Object.assign(this.content, compiled.content);
    this.compiledState = this.historyState();
    const template = document.createElement("template");
    template.innerHTML = compiled.html;
    (_a = this.surface) == null ? void 0 : _a.replaceChildren(...Array.from(template.content.childNodes));
    if (this.surface) (_b = this.source) == null ? void 0 : _b.prepareSurface(this.surface);
    this.imagePlaceholders.clear();
    (_c = this.surface) == null ? void 0 : _c.querySelectorAll("[data-movcues-question-input]").forEach((input2) => {
      input2.readOnly = true;
      input2.tabIndex = -1;
    });
    this.savedRange = null;
    (_d = this.surface) == null ? void 0 : _d.querySelectorAll("[data-movcues-node-id]").forEach((cell) => {
      cell.tabIndex = 0;
      if (!cell.hasAttribute("data-movcues-block-id")) cell.setAttribute("aria-label", "Layout cell");
      if (!cell.children.length && !cell.hasAttribute("data-movcues-block-id")) {
        const add = document.createElement("button");
        add.type = "button";
        add.dataset.movcuesEmptyCell = "";
        add.textContent = "+ Add content";
        cell.append(add);
      }
    });
    (_e = this.surface) == null ? void 0 : _e.querySelectorAll('img[data-movcues-block-id][src=""]').forEach((image) => {
      const placeholder = document.createElement("button");
      placeholder.type = "button";
      placeholder.className = image.className;
      placeholder.dataset.movcuesBlockId = image.dataset.movcuesBlockId;
      if (image.dataset.movcuesNodeId) placeholder.dataset.movcuesNodeId = image.dataset.movcuesNodeId;
      placeholder.dataset.movcuesImagePlaceholder = "";
      placeholder.setAttribute("aria-label", "Choose image");
      placeholder.innerHTML = '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg><span>Drop an image or click to browse</span>';
      image.replaceWith(placeholder);
      this.imagePlaceholders.set(placeholder, image);
    });
    const style = this.root.querySelector("style[data-movcues-builder-style]");
    if (style) style.textContent = `${compiled.css}
[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;
    (_g = (_f = this.callbacks).onPatch) == null ? void 0 : _g.call(_f);
  }
  scheduleCompile() {
    clearTimeout(this.compileTimer);
    this.compileTimer = window.setTimeout(() => {
      if (!this.destroyed && !this.composing) this.flush();
    }, 160);
  }
  compile() {
    return this.source ? this.source.apply(this.document) : applyOnsiteDocument(this.builder, this.document, this.widgetType, this.surveyContext(), this.checklist);
  }
  repairDocumentStructure() {
    if (this.source) return false;
    let repaired = false;
    const blockIds = /* @__PURE__ */ new Set();
    const repair = (cell) => {
      var _a;
      if (cell.children && cell.block) {
        const block = cell.block;
        delete cell.block;
        if (!cell.children.some((child) => listBlocks(child).some((candidate) => candidate.id === block.id))) cell.children.unshift(emptyCell(block));
        repaired = true;
      }
      (_a = cell.children) == null ? void 0 : _a.forEach(repair);
      if (!cell.block) return;
      if (blockIds.has(cell.block.id)) {
        cell.block.id = onsiteId("block");
        if (cell.block.type === "button") cell.block.action.id = onsiteId("action");
        repaired = true;
      }
      blockIds.add(cell.block.id);
    };
    repair(this.document.root);
    return repaired;
  }
  pushHistory() {
    var _a, _b;
    const document2 = cloneOnsite(this.document), questions = this.survey ? cloneOnsite(this.survey.step.questions) : void 0, branching = ((_a = this.survey) == null ? void 0 : _a.step.branching) ? cloneOnsite(this.survey.step.branching) : void 0;
    const bytes = this.historyState().length;
    const entry = { source: (_b = this.source) == null ? void 0 : _b.snapshot(), document: document2, questions, branching, checklist: this.checklist ? this.checklistState() : void 0, selection: cloneOnsite(this.selection), bytes };
    if (this.historyIndex >= 0 && this.historyState(this.history[this.historyIndex]) === this.historyState()) return;
    if (this.callbacks.onUndo) {
      this.history = [entry];
      this.historyIndex = 0;
      this.historyBytes = bytes;
      return;
    }
    if (this.historyIndex < this.history.length - 1) {
      this.historyBytes -= this.history.slice(this.historyIndex + 1).reduce((sum, item) => sum + item.bytes, 0);
      this.history.splice(this.historyIndex + 1);
    }
    this.history.push(entry);
    this.historyBytes += bytes;
    while (this.history.length > HISTORY_LIMIT || this.historyBytes > HISTORY_BYTES) {
      const removed = this.history.shift();
      this.historyBytes -= (removed == null ? void 0 : removed.bytes) ?? 0;
    }
    this.historyIndex = this.history.length - 1;
  }
  restore(entry) {
    this.document = cloneOnsite(entry.document);
    if (this.source && entry.source) this.source.restore(entry.source, this.document);
    if (this.checklist && entry.checklist) Object.assign(this.checklist, cloneOnsite(entry.checklist));
    if (this.survey && entry.questions) {
      this.survey.step.questions = cloneOnsite(entry.questions);
      this.survey.step.branching = entry.branching ? cloneOnsite(entry.branching) : void 0;
    }
    this.compileAndPatch();
    this.selection = cloneOnsite(entry.selection);
    this.callbacks.onChange();
    this.select(this.selection);
  }
  clearImageDrop() {
    var _a, _b;
    (_a = this.imageDropTarget) == null ? void 0 : _a.removeAttribute("data-movcues-image-drop");
    (_b = this.imageDropTarget) == null ? void 0 : _b.removeAttribute("data-movcues-insertion-edge");
    this.imageDropTarget = null;
  }
  dropBefore(target, event) {
    const rect = target.getBoundingClientRect();
    const parent = parentCell(this.document, target.dataset.movcuesNodeId);
    return (parent == null ? void 0 : parent.direction) === "row" ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
  }
  moveDestinations() {
    var _a;
    const source = this.moveSource ? findCell(this.document, this.moveSource) : null;
    return source ? Array.from(((_a = this.surface) == null ? void 0 : _a.querySelectorAll("[data-movcues-node-id]")) ?? []).filter((cell) => cell.dataset.movcuesNodeId !== this.document.root.id && !findCell({ ...this.document, root: source }, cell.dataset.movcuesNodeId)) : [];
  }
  openPalette(anchor, insertion = null) {
    var _a, _b, _c;
    this.closePalette();
    this.insertion = insertion;
    this.paletteAnchor = anchor;
    this.palette.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    if (insertion) (_b = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${insertion.cellId}"]`)) == null ? void 0 : _b.setAttribute("data-movcues-insertion-edge", insertion.edge);
    this.positionTools();
    (_c = this.palette.querySelector("button")) == null ? void 0 : _c.focus({ preventScroll: true });
  }
  closePalette() {
    var _a, _b;
    this.palette.hidden = true;
    (_a = this.paletteAnchor) == null ? void 0 : _a.setAttribute("aria-expanded", "false");
    this.paletteAnchor = null;
    this.insertion = null;
    (_b = this.surface) == null ? void 0 : _b.querySelectorAll("[data-movcues-insertion-edge]").forEach((element) => element.removeAttribute("data-movcues-insertion-edge"));
  }
  syncToolbarState() {
    var _a;
    const cell = this.getSelectedCell();
    const atRoot = !cell || cell === this.document.root;
    for (const command of ["delete", "duplicate", "move"]) {
      const button = this.toolbar.querySelector(`[data-command="${command}"]`);
      if (!button) continue;
      const protectedSource = cell && ((_a = this.source) == null ? void 0 : _a.isProtected(cell.id));
      button.disabled = atRoot || Boolean(protectedSource);
      button.title = protectedSource ? "Protected functional structure is preserved; its visual styles remain editable" : atRoot ? "Select an element to use this action" : command === "delete" ? "Delete selected element (Undo is available)" : "Duplicate";
    }
  }
  updateToolPositions() {
    var _a, _b, _c;
    const cell = this.getSelectedCell();
    const target = cell ? (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${cell.id}"]`) : null;
    const widget = (_b = this.surface) == null ? void 0 : _b.querySelector(".movcues-widget");
    if (!target || !widget) {
      this.toolbar.hidden = true;
      this.edgeButtons.forEach((button) => {
        button.hidden = true;
      });
      this.closePalette();
      return;
    }
    const rect = target.getBoundingClientRect();
    const bounds = this.availableCanvasBounds();
    const visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    this.toolbar.hidden = !visible;
    this.edgeButtons.forEach((button) => {
      button.hidden = !visible;
    });
    if (!visible) {
      this.closePalette();
      return;
    }
    this.toolbar.style.maxWidth = `${bounds.right - bounds.left}px`;
    const toolbarRect = this.toolbar.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();
    const point = placeOutside(widgetRect, toolbarRect, bounds);
    this.toolbar.style.transform = `translate(${point.left}px,${point.top}px)`;
    const blockRect = (cell == null ? void 0 : cell.block) ? (_c = target.querySelector("[data-movcues-block-id]")) == null ? void 0 : _c.getBoundingClientRect() : null;
    const edges = { left: Math.min(rect.left, (blockRect == null ? void 0 : blockRect.left) ?? rect.left), right: Math.max(rect.right, (blockRect == null ? void 0 : blockRect.right) ?? rect.right), top: Math.min(rect.top, (blockRect == null ? void 0 : blockRect.top) ?? rect.top), bottom: Math.max(rect.bottom, (blockRect == null ? void 0 : blockRect.bottom) ?? rect.bottom) };
    for (const button of this.edgeButtons) {
      const edge = button.dataset.movcuesInsertEdge;
      const x2 = edge === "left" ? edges.left - 16 : edge === "right" ? edges.right + 16 : (edges.left + edges.right) / 2;
      const y = edge === "top" ? edges.top - 16 : edge === "bottom" ? edges.bottom + 16 : (edges.top + edges.bottom) / 2;
      button.style.transform = `translate(${Math.max(2, Math.min(innerWidth - 26, x2 - 12))}px,${Math.max(2, Math.min(innerHeight - 26, y - 12))}px)`;
    }
    if (!this.palette.hidden && this.paletteAnchor) {
      const palettePoint = placeOutside(this.paletteAnchor.getBoundingClientRect(), this.palette.getBoundingClientRect(), bounds);
      this.palette.style.transform = `translate(${palettePoint.left}px,${palettePoint.top}px)`;
    }
    this.positionHandles();
  }
  availableCanvasBounds() {
    var _a, _b, _c;
    const inset = 6;
    const editorRoot = (_a = document.querySelector("[data-movcues-editor]")) == null ? void 0 : _a.shadowRoot;
    const panel = (_b = editorRoot == null ? void 0 : editorRoot.querySelector("aside")) == null ? void 0 : _b.getBoundingClientRect();
    const controls = (_c = editorRoot == null ? void 0 : editorRoot.querySelector("[data-editor-toolbar]")) == null ? void 0 : _c.getBoundingClientRect();
    let left = inset;
    let right = innerWidth - inset;
    let top = inset;
    let bottom = innerHeight - inset;
    if (panel && panel.width > 0 && panel.height > 0) {
      if (panel.left < innerWidth / 2 && innerWidth - panel.right > 240) left = Math.max(left, panel.right + inset);
      else if (panel.left >= innerWidth / 2 && panel.left > 240) right = Math.min(right, panel.left - inset);
      else if (panel.width > innerWidth / 2) bottom = Math.min(bottom, panel.top - inset);
    }
    if (controls && controls.height > 0) top = Math.max(top, controls.bottom + inset);
    return { left, right: Math.max(left, right), top, bottom: Math.max(top + 36, bottom) };
  }
  renderResizeHandles() {
    this.handles.forEach((handle) => handle.remove());
    this.handles = [];
    const cell = this.getSelectedCell();
    const parent = cell ? parentCell(this.document, cell.id) : null;
    if (!cell || !(parent == null ? void 0 : parent.children) || this.source && !this.source.canResize(parent.id)) return;
    const index = parent.children.indexOf(cell);
    for (const firstIndex of [index - 1, index]) {
      const first = parent.children[firstIndex];
      const second = parent.children[firstIndex + 1];
      if (!first || !second) continue;
      const handle = document.createElement("button");
      handle.type = "button";
      handle.dataset.movcuesResizeHandle = parent.direction;
      handle.dataset.first = first.id;
      handle.dataset.second = second.id;
      handle.textContent = parent.direction === "row" ? "↔" : "↕";
      handle.setAttribute("aria-label", `Resize ${parent.direction === "row" ? "columns" : "rows"}`);
      handle.addEventListener("pointerdown", this.startResize);
      handle.addEventListener("keydown", this.resizeWithKeyboard);
      this.root.append(handle);
      this.handles.push(handle);
    }
    this.positionHandles();
  }
  positionHandles() {
    var _a;
    for (const handle of this.handles) {
      const first = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${handle.dataset.first}"]`);
      if (!first) continue;
      const rect = first.getBoundingClientRect();
      const row = handle.dataset.movcuesResizeHandle === "row";
      handle.style.transform = `translate(${row ? rect.right - 5 : rect.left + rect.width / 2 + 16}px,${row ? rect.top + rect.height / 2 + 16 : rect.bottom - 5}px)`;
    }
  }
  destroy() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
    this.destroyed = true;
    this.imageRequest++;
    clearTimeout(this.compileTimer);
    clearTimeout(this.typingTimer);
    cancelAnimationFrame(this.toolFrame);
    cancelAnimationFrame(this.resizeFrame);
    (_a = this.resizeCleanup) == null ? void 0 : _a.call(this);
    this.closePalette();
    this.clearImageDrop();
    (_b = this.surface) == null ? void 0 : _b.removeEventListener("click", this.onSurfaceClick);
    (_c = this.surface) == null ? void 0 : _c.removeEventListener("dblclick", this.onDoubleClick);
    (_d = this.surface) == null ? void 0 : _d.removeEventListener("input", this.onInput);
    (_e = this.surface) == null ? void 0 : _e.removeEventListener("blur", this.onBlur, true);
    (_f = this.surface) == null ? void 0 : _f.removeEventListener("compositionstart", this.onCompositionStart);
    (_g = this.surface) == null ? void 0 : _g.removeEventListener("compositionend", this.onCompositionEnd);
    (_h = this.surface) == null ? void 0 : _h.removeEventListener("keydown", this.onSurfaceKeyDown);
    (_i = this.surface) == null ? void 0 : _i.removeEventListener("dragover", this.onImageDragOver);
    (_j = this.surface) == null ? void 0 : _j.removeEventListener("dragleave", this.onImageDragLeave);
    (_k = this.surface) == null ? void 0 : _k.removeEventListener("drop", this.onImageDrop);
    (_l = this.surface) == null ? void 0 : _l.removeEventListener("keyup", this.rememberSelection);
    (_m = this.surface) == null ? void 0 : _m.removeEventListener("mouseup", this.rememberSelection);
    (_n = this.surface) == null ? void 0 : _n.removeEventListener("paste", this.onPaste);
    this.toolbar.removeEventListener("dragstart", this.onMoveDragStart);
    this.toolbar.removeEventListener("dragend", this.cancelMove);
    this.cancelMove();
    this.savedRange = null;
    (_o = this.surface) == null ? void 0 : _o.querySelectorAll("[data-movcues-empty-cell]").forEach((element) => element.remove());
    (_p = this.surface) == null ? void 0 : _p.querySelectorAll("[data-movcues-node-id]").forEach((cell) => {
      cell.removeAttribute("tabindex");
      cell.removeAttribute("aria-label");
      cell.removeAttribute("data-movcues-editor-selected");
    });
    this.imagePlaceholders.forEach((image, placeholder) => placeholder.replaceWith(image));
    this.imagePlaceholders.clear();
    this.imageInput.remove();
    this.toolbar.remove();
    this.palette.remove();
    this.edgeButtons.forEach((button) => button.remove());
    this.handles.forEach((handle) => handle.remove());
    (_q = this.root.querySelector("style[data-movcues-composition-style]")) == null ? void 0 : _q.remove();
    this.root.removeEventListener("scroll", this.positionTools, true);
    window.removeEventListener("scroll", this.positionTools, true);
    window.removeEventListener("resize", this.positionTools);
    window.removeEventListener("pointerdown", this.dismissPalette, true);
    window.removeEventListener("keydown", this.onPaletteKeyDown);
  }
}
function placeOutside(rect, size, bounds) {
  const clampX = (x2) => Math.max(bounds.left, Math.min(bounds.right - size.width, x2));
  const clampY = (y) => Math.max(bounds.top, Math.min(bounds.bottom - size.height, y));
  const candidates = [
    { left: clampX(rect.left), top: rect.bottom + 10 },
    { left: clampX(rect.left), top: rect.top - size.height - 10 },
    { left: rect.right + 10, top: clampY(rect.top) },
    { left: rect.left - size.width - 10, top: clampY(rect.top) }
  ];
  return candidates.find((p) => p.left >= bounds.left && p.left + size.width <= bounds.right && p.top >= bounds.top && p.top + size.height <= bounds.bottom) ?? { left: clampX(rect.left), top: clampY(rect.bottom + 10) };
}
const AUTHORING_STYLE = `
[data-movcues-empty-cell]{width:100%;min-height:54px;border:1px dashed #94a3b8;border-radius:6px;background:#f8fafc;color:#64748b;font:12px ui-sans-serif,system-ui;cursor:pointer}[data-movcues-moving] [data-movcues-node-id]:hover{outline:2px dashed #2563eb;outline-offset:-2px}[data-command=move][aria-pressed=true]{background:#eff6ff;color:#1d4ed8}[data-movcues-node-id]:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
[data-movcues-editor-selected=step]{outline:2px solid #2563eb!important;outline-offset:3px}[data-movcues-editor-selected=cell]{outline:2px solid #0ea5e9!important;outline-offset:-2px}[data-movcues-editor-selected=block]{outline:2px solid #2563eb!important;outline-offset:2px}
[data-movcues-composition-toolbar],[data-movcues-block-palette],[data-movcues-resize-handle],[data-movcues-insert-edge]{box-sizing:border-box;position:fixed;left:0;top:0;z-index:2147483646;pointer-events:auto;font:12px/1.2 ui-sans-serif,system-ui,sans-serif}
[data-movcues-composition-toolbar]{display:flex;gap:1px;max-width:calc(100vw - 12px);overflow:auto;padding:3px;border:1px solid #dbe2ea;border-radius:8px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.14)}[data-movcues-composition-toolbar] button,[data-movcues-block-palette] button{min-height:28px;padding:5px 7px;border:0;border-radius:5px;background:transparent;color:#334155;font:600 11px inherit;cursor:pointer}[data-movcues-composition-toolbar] button{flex:none;width:26px;padding:0;font-size:16px}[data-movcues-composition-toolbar] button:hover:not(:disabled),[data-movcues-block-palette] button:hover{background:#eff6ff;color:#1d4ed8}[data-movcues-composition-toolbar] button:disabled{cursor:not-allowed;opacity:.42}
[data-movcues-composition-toolbar] svg{display:block;margin:auto}
[data-movcues-builder-surface] [data-movcues-question-input]{pointer-events:none}
[data-movcues-image-placeholder]{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:120px;padding:16px;border:1px dashed #94a3b8!important;background:#f8fafc;color:#64748b;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;cursor:pointer;white-space:normal}[data-movcues-image-placeholder] svg{flex:none}[data-movcues-image-placeholder]:hover,[data-movcues-image-drop]{outline:2px solid #2563eb!important;outline-offset:2px;background:#eff6ff}[data-movcues-image-placeholder][aria-busy=true]{opacity:.6;cursor:wait}[data-movcues-image-file][hidden]{display:none!important}
[data-movcues-insert-edge]{width:24px;height:24px;padding:0;border:1px solid #93c5fd;border-radius:50%;background:#fff;color:#2563eb;box-shadow:0 2px 6px rgba(15,23,42,.12);font-size:18px;cursor:pointer}[data-movcues-insert-edge]:hover,[data-movcues-insert-edge][aria-expanded=true]{background:#2563eb;color:#fff}
[data-movcues-insertion-edge=top]{box-shadow:inset 0 3px #2563eb}[data-movcues-insertion-edge=bottom]{box-shadow:inset 0 -3px #2563eb}[data-movcues-insertion-edge=left]{box-shadow:inset 3px 0 #2563eb}[data-movcues-insertion-edge=right]{box-shadow:inset -3px 0 #2563eb}
[data-movcues-composition-toolbar][hidden],[data-movcues-block-palette][hidden],[data-movcues-insert-edge][hidden]{display:none!important}
[data-movcues-composition-toolbar] button:focus-visible,[data-movcues-block-palette] button:focus-visible,[data-movcues-insert-edge]:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
[data-movcues-block-palette]{display:grid;grid-template-columns:repeat(2,minmax(76px,1fr));gap:3px;width:180px;padding:6px;border:1px solid #dbe2ea;border-radius:9px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.2)}[data-movcues-block-palette][hidden]{display:none}
[data-movcues-resize-handle]{width:28px;height:28px;padding:0;border:2px solid #fff;border-radius:50%;background:#2563eb;color:#fff;box-shadow:0 2px 8px rgba(15,23,42,.25);cursor:col-resize}[data-movcues-resize-handle=column]{cursor:row-resize}[contenteditable=true]{cursor:text!important;outline:2px solid #60a5fa!important;outline-offset:2px}
`;
function escapeHtmlAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
const shadow = (y, blur, color) => ({ x: 0, y, blur, spread: 0, color });
const EXPERIENCE_PRESETS = {
  minimal: { version: 1, colors: { background: "#ffffff", surface: "#ffffff", text: "#111827", mutedText: "#64748b", primary: "#2563eb", primaryForeground: "#ffffff", border: "#e2e8f0" }, typography: { bodyFontFamily: "ui-sans-serif, system-ui, sans-serif", headingFontFamily: "ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 24, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.5, headingLineHeight: 1.2 }, radii: { sm: 4, md: 8, lg: 12 }, shadows: { sm: shadow(2, 8, "rgba(15,23,42,.08)"), md: shadow(12, 36, "rgba(15,23,42,.16)") } },
  modern: { version: 1, colors: { background: "#ffffff", surface: "#f8fafc", text: "#0f172a", mutedText: "#64748b", primary: "#4f46e5", primaryForeground: "#ffffff", border: "#e2e8f0" }, typography: { bodyFontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", headingFontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 28, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.55, headingLineHeight: 1.15 }, radii: { sm: 6, md: 12, lg: 20 }, shadows: { sm: shadow(4, 14, "rgba(15,23,42,.09)"), md: shadow(24, 70, "rgba(15,23,42,.20)") } },
  soft: { version: 1, colors: { background: "#f8fafc", surface: "#ffffff", text: "#1e293b", mutedText: "#64748b", primary: "#0284c7", primaryForeground: "#ffffff", border: "#dbeafe" }, typography: { bodyFontFamily: "ui-rounded, ui-sans-serif, system-ui, sans-serif", headingFontFamily: "ui-rounded, ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 26, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.6, headingLineHeight: 1.2 }, radii: { sm: 10, md: 16, lg: 24 }, shadows: { sm: shadow(6, 18, "rgba(14,116,144,.10)"), md: shadow(22, 58, "rgba(14,116,144,.16)") } },
  dark: { version: 1, colors: { background: "#0f172a", surface: "#1e293b", text: "#f8fafc", mutedText: "#cbd5e1", primary: "#818cf8", primaryForeground: "#0f172a", border: "#334155" }, typography: { bodyFontFamily: "ui-sans-serif, system-ui, sans-serif", headingFontFamily: "ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 26, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.55, headingLineHeight: 1.18 }, radii: { sm: 6, md: 12, lg: 18 }, shadows: { sm: shadow(5, 16, "rgba(0,0,0,.28)"), md: shadow(24, 70, "rgba(0,0,0,.42)") } }
};
function resolvedTheme(state) {
  const value = structuredClone(state.baseTokens), o = state.overrides;
  if (o.primary) value.colors.primary = o.primary;
  if (o.secondary) value.colors.surface = o.secondary;
  if (o.background) value.colors.background = o.background;
  if (o.text) value.colors.text = o.text;
  if (o.bodyFontFamily) value.typography.bodyFontFamily = o.bodyFontFamily;
  if (o.headingFontFamily) value.typography.headingFontFamily = o.headingFontFamily;
  if (o.bodyFontSize) value.typography.bodyFontSize = o.bodyFontSize;
  if (o.headingFontSize) value.typography.headingFontSize = o.headingFontSize;
  if (o.radius !== void 0) value.radii = { sm: Math.max(0, o.radius / 2), md: o.radius, lg: Math.min(100, o.radius * 1.5) };
  if (o.buttonRadius !== void 0) value.radii.md = o.buttonRadius;
  if (o.shadow) value.shadows = { sm: o.shadow, md: o.shadow };
  return value;
}
const text = (value, max) => sanitizeRichText(value.trim().slice(0, max).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]));
const isDocumentOperation$1 = (operation) => ["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type);
function questionFromInput(input2, id = onsiteId("question")) {
  var _a;
  const base = { id, label: input2.label.trim().slice(0, 500), required: input2.required ?? false };
  if (input2.type === "single_choice" || input2.type === "multiple_choice") return { ...base, type: input2.type, options: input2.options.map((option) => ({ id: onsiteId("option"), label: option.label.trim().slice(0, 200) })) };
  if (input2.type === "short_text" || input2.type === "long_text") return { ...base, type: input2.type, placeholder: ((_a = input2.placeholder) == null ? void 0 : _a.slice(0, 500)) ?? "", maxLength: input2.maxLength ?? (input2.type === "short_text" ? 200 : 2e3) };
  if (input2.type === "rating") return { ...base, type: input2.type, min: input2.min, max: input2.max };
  return { ...base, type: "nps" };
}
function documentFor$1(step) {
  const document2 = onsiteDocumentFromBuilder(step.builder);
  if (!document2 || document2.schemaVersion !== 3 || !step.builder) throw new Error(`Survey step ${step.id} has no editable schema-v3 document.`);
  return document2;
}
function referenceCell(document2, questionId) {
  let result2 = null;
  const walk = (cell) => {
    var _a, _b;
    if (((_a = cell.block) == null ? void 0 : _a.type) === "question" && cell.block.questionId === questionId) result2 = cell;
    (_b = cell.children) == null ? void 0 : _b.forEach(walk);
  };
  walk(document2.root);
  return result2;
}
function controlsCell(document2) {
  let result2 = null;
  const walk = (cell) => {
    var _a, _b;
    if (((_a = cell.block) == null ? void 0 : _a.type) === "survey_controls") result2 = cell;
    (_b = cell.children) == null ? void 0 : _b.forEach(walk);
  };
  walk(document2.root);
  return result2;
}
function insertQuestionReference(document2, questionId, afterQuestionId) {
  const target = afterQuestionId ? referenceCell(document2, afterQuestionId) : controlsCell(document2);
  if (!target) throw new Error("Survey question insertion point no longer exists.");
  const parent = parentCell(document2, target.id);
  if (!(parent == null ? void 0 : parent.children)) throw new Error("Survey question insertion point is invalid.");
  const index = parent.children.indexOf(target) + (afterQuestionId ? 1 : 0);
  parent.children.splice(index, 0, { ...emptyCell({ id: onsiteId("block"), type: "question", questionId, fontSize: 14 }), sizing: { mode: "hug" } });
}
function removeQuestionReference(document2, questionId) {
  const cell = referenceCell(document2, questionId);
  if (!cell || !removeCell(document2, cell.id)) throw new Error("Survey question reference no longer exists.");
}
function moveQuestionReference(document2, questionId, beforeQuestionId) {
  const source = referenceCell(document2, questionId), target = beforeQuestionId ? referenceCell(document2, beforeQuestionId) : controlsCell(document2);
  if (!source || !target || source === target) throw new Error("Survey question move target is invalid.");
  const from = parentCell(document2, source.id), to = parentCell(document2, target.id);
  if (!(from == null ? void 0 : from.children) || !(to == null ? void 0 : to.children)) throw new Error("Survey question move target is invalid.");
  from.children.splice(from.children.indexOf(source), 1);
  to.children.splice(to.children.indexOf(target), 0, source);
}
function setStepCopy(step, patch, submitLabel) {
  const document2 = documentFor$1(step), blocks = listBlocks(document2.root);
  if (patch.heading !== void 0) {
    step.content.heading = patch.heading.trim().slice(0, 500);
    const block = blocks.find((value) => value.type === "heading");
    if ((block == null ? void 0 : block.type) === "heading") block.html = text(patch.heading, 500);
  }
  if (patch.body !== void 0) {
    step.content.body = patch.body.trim().slice(0, 1e4);
    const block = blocks.find((value) => value.type === "text");
    if ((block == null ? void 0 : block.type) === "text") block.html = text(patch.body, 1e4);
  }
  step.content = applyOnsiteDocument(step.builder, document2, "survey", { questions: step.questions, submitLabel }).content;
}
function compileStep(step, submitLabel) {
  const document2 = documentFor$1(step), generic = validateOnsiteDocument(document2), survey = validateOnsiteSurveyDocument(document2, { questions: step.questions });
  const errors = [...surveyQuestionErrors(step.questions), ...generic.errors, ...survey];
  if (errors.length) throw new Error(errors.join(" "));
  step.content = applyOnsiteDocument(step.builder, document2, "survey", { questions: step.questions, submitLabel }).content;
}
function referencedByBranch(survey, predicate) {
  return survey.steps.some((step) => {
    var _a;
    return (_a = step.branching) == null ? void 0 : _a.rules.some(predicate);
  });
}
function ensureSurvey(definition) {
  if (!definition.survey) throw new Error("This definition is not a Survey.");
  return definition.survey;
}
function applySurveyAiProposal(source, proposal) {
  var _a, _b, _c, _d;
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const definition = cloneOnsite(source), survey = ensureSurvey(definition), affected = /* @__PURE__ */ new Set(), warnings = [], withinStep = /* @__PURE__ */ new Map();
  const step = (id) => {
    const value = survey.steps.find((item) => item.id === id);
    if (!value) throw new Error(`Survey step no longer exists: ${id}`);
    return value;
  };
  const question = (owner, id) => {
    const value = owner.questions.find((item) => item.id === id);
    if (!value) throw new Error(`Survey question no longer exists: ${id}`);
    return value;
  };
  const replacement = proposal.operations.find((operation) => operation.type === "replace_markup");
  if (replacement) {
    if (proposal.operations.length !== 1 || !replacement.stepId) throw new Error("A Survey source replacement must be one atomic step-scoped operation.");
    const owner = step(replacement.stepId);
    if (!owner.builder) throw new Error("Survey step has no builder source.");
    applySourceMarkup(owner.builder, owner.content, replacement, { widgetType: "survey", guide: false, survey: { questions: owner.questions } });
    const branchErrors2 = surveyBranchErrors(survey);
    if (branchErrors2.length) throw new Error(branchErrors2.join(" "));
    return { definition, affectedStepIds: [owner.id], order: survey.steps.map((value) => value.id), warnings: ["This Survey step now uses Source mode; its protected questions and controls remain canonical."] };
  }
  for (const operation of proposal.operations) {
    if (isDocumentOperation$1(operation)) {
      if (!operation.stepId) throw new Error("Survey layout operations require a stable step ID.");
      step(operation.stepId);
      withinStep.set(operation.stepId, [...withinStep.get(operation.stepId) ?? [], operation]);
      affected.add(operation.stepId);
      continue;
    }
    if (operation.type === "add_survey_step") {
      if (survey.steps.length >= 20) throw new Error("A Survey can contain up to 20 steps.");
      const questions = (operation.questions ?? []).map((value) => questionFromInput(value));
      const created = { id: onsiteId("step"), content: { heading: operation.heading.trim().slice(0, 500), body: ((_a = operation.body) == null ? void 0 : _a.trim().slice(0, 1e4)) ?? "" }, questions, builder: { version: 1, projectData: {}, html: "", css: "" } };
      created.content = applyOnsiteDocument(created.builder, createOnsiteSurveyDocument(questions, created.content), "survey", { questions, submitLabel: survey.submitLabel }).content;
      const index = operation.afterStepId ? survey.steps.findIndex((value) => value.id === operation.afterStepId) : survey.steps.length - 1;
      if (operation.afterStepId && index < 0) throw new Error("Survey step insertion point no longer exists.");
      survey.steps.splice(index + 1, 0, created);
      affected.add(created.id);
    } else if (operation.type === "duplicate_survey_step") {
      if (survey.steps.length >= 20) throw new Error("A Survey can contain up to 20 steps.");
      const original = step(operation.stepId), copy = duplicateSurveyStep(original, survey.submitLabel);
      const index = operation.afterStepId ? survey.steps.findIndex((value) => value.id === operation.afterStepId) : survey.steps.indexOf(original);
      if (index < 0) throw new Error("Survey step insertion point no longer exists.");
      survey.steps.splice(index + 1, 0, copy);
      affected.add(copy.id);
    } else if (operation.type === "remove_survey_step") {
      if (survey.steps.length <= 1) throw new Error("The final Survey step cannot be removed.");
      const inbound = referencedByBranch(survey, (rule2) => rule2.nextStepId === operation.stepId);
      if (inbound && !operation.removeBranchRules) throw new Error("This step is a branch destination. Explicitly allow removal of dependent branch rules.");
      if (inbound) {
        survey.steps.forEach((value) => {
          if (value.branching) {
            value.branching.rules = value.branching.rules.filter((rule2) => rule2.nextStepId !== operation.stepId);
            if (value.branching.defaultNextStepId === operation.stepId) delete value.branching.defaultNextStepId;
          }
        });
        warnings.push("Dependent branch destinations were removed with the Survey step.");
      }
      survey.steps.splice(survey.steps.indexOf(step(operation.stepId)), 1);
      affected.add(operation.stepId);
      warnings.push("A Survey step and its questions were removed.");
    } else if (operation.type === "move_survey_step") {
      const value = step(operation.stepId);
      survey.steps.splice(survey.steps.indexOf(value), 1);
      const index = operation.beforeStepId ? survey.steps.findIndex((item) => item.id === operation.beforeStepId) : survey.steps.length;
      if (index < 0) throw new Error("Survey step move destination no longer exists.");
      survey.steps.splice(index, 0, value);
      affected.add(value.id);
      warnings.push("Survey step order changed; branch paths were revalidated.");
    } else if (operation.type === "update_survey_step") setStepCopy(step(operation.stepId), operation.patch, survey.submitLabel), affected.add(operation.stepId);
    else if (operation.type === "add_survey_question") {
      const owner = step(operation.stepId);
      if (owner.questions.length >= 20) throw new Error("A Survey step can contain up to 20 questions.");
      if (operation.afterQuestionId) question(owner, operation.afterQuestionId);
      const created = questionFromInput(operation.question), index = operation.afterQuestionId ? owner.questions.findIndex((value) => value.id === operation.afterQuestionId) + 1 : owner.questions.length;
      owner.questions.splice(index, 0, created);
      insertQuestionReference(documentFor$1(owner), created.id, operation.afterQuestionId);
      affected.add(owner.id);
    } else if (operation.type === "duplicate_survey_question") {
      const owner = step(operation.stepId);
      if (owner.questions.length >= 20) throw new Error("A Survey step can contain up to 20 questions.");
      const original = question(owner, operation.questionId), copy = cloneOnsite(original);
      copy.id = onsiteId("question");
      if (copy.type === "single_choice" || copy.type === "multiple_choice") copy.options.forEach((value) => {
        value.id = onsiteId("option");
      });
      const afterId = operation.afterQuestionId ?? original.id;
      question(owner, afterId);
      owner.questions.splice(owner.questions.findIndex((value) => value.id === afterId) + 1, 0, copy);
      insertQuestionReference(documentFor$1(owner), copy.id, afterId);
      affected.add(owner.id);
    } else if (operation.type === "remove_survey_question") {
      const owner = step(operation.stepId);
      question(owner, operation.questionId);
      const dependent = (_b = owner.branching) == null ? void 0 : _b.rules.some((rule2) => rule2.questionId === operation.questionId);
      if (dependent && !operation.removeBranchRules) throw new Error("This question controls branching. Explicitly allow removal of dependent branch rules.");
      if (dependent) {
        owner.branching.rules = owner.branching.rules.filter((rule2) => rule2.questionId !== operation.questionId);
        warnings.push("Dependent branch rules were removed with the Survey question.");
      }
      owner.questions = owner.questions.filter((value) => value.id !== operation.questionId);
      removeQuestionReference(documentFor$1(owner), operation.questionId);
      affected.add(owner.id);
      warnings.push("A Survey question and any collected value for it were removed.");
    } else if (operation.type === "move_survey_question") {
      const owner = step(operation.stepId), value = question(owner, operation.questionId);
      if (operation.beforeQuestionId) question(owner, operation.beforeQuestionId);
      owner.questions.splice(owner.questions.indexOf(value), 1);
      const index = operation.beforeQuestionId ? owner.questions.findIndex((item) => item.id === operation.beforeQuestionId) : owner.questions.length;
      owner.questions.splice(index, 0, value);
      moveQuestionReference(documentFor$1(owner), value.id, operation.beforeQuestionId);
      affected.add(owner.id);
    } else if (operation.type === "update_survey_question") {
      const owner = step(operation.stepId), value = question(owner, operation.questionId), patch = operation.patch;
      if (patch.label !== void 0) value.label = patch.label.trim().slice(0, 500);
      if (patch.required !== void 0) value.required = patch.required;
      if (value.type === "short_text" || value.type === "long_text") {
        if (patch.placeholder !== void 0) value.placeholder = patch.placeholder.slice(0, 500);
        if (patch.maxLength !== void 0) value.maxLength = patch.maxLength;
      }
      if (value.type === "rating") {
        if (patch.min !== void 0) value.min = patch.min;
        if (patch.max !== void 0) value.max = patch.max;
      }
      affected.add(owner.id);
    } else if (operation.type === "change_survey_question_type") {
      const owner = step(operation.stepId), value = question(owner, operation.questionId), replacement2 = questionFromInput(operation.question, value.id), oldRules = ((_c = owner.branching) == null ? void 0 : _c.rules) ?? [];
      owner.questions.splice(owner.questions.indexOf(value), 1, replacement2);
      const invalid = surveyBranchErrors(survey);
      if (invalid.length && oldRules.some((rule2) => rule2.questionId === value.id)) {
        if (!operation.removeInvalidBranchRules) throw new Error("Changing this question type invalidates branching. Explicitly allow removal of dependent rules.");
        owner.branching.rules = oldRules.filter((rule2) => rule2.questionId !== value.id);
        warnings.push("Branch rules using the converted question were removed.");
      }
      warnings.push(`Question type changed from ${value.type} to ${replacement2.type}; existing answers may no longer be comparable.`);
      affected.add(owner.id);
    } else if (["add_survey_option", "update_survey_option", "remove_survey_option", "move_survey_option"].includes(operation.type)) {
      const op = operation, owner = step(op.stepId), value = question(owner, op.questionId);
      if (value.type !== "single_choice" && value.type !== "multiple_choice") throw new Error("Options are available only on choice questions.");
      if (op.type === "add_survey_option") {
        if (value.options.length >= 20) throw new Error("A choice question supports up to 20 options.");
        const index = op.afterOptionId ? value.options.findIndex((item) => item.id === op.afterOptionId) + 1 : value.options.length;
        if (op.afterOptionId && index === 0) throw new Error("Survey option insertion point no longer exists.");
        value.options.splice(index, 0, { id: onsiteId("option"), label: op.label.trim().slice(0, 200) });
      } else {
        const index = value.options.findIndex((item) => item.id === op.optionId);
        if (index < 0) throw new Error("Survey option no longer exists.");
        if (op.type === "update_survey_option") value.options[index].label = op.label.trim().slice(0, 200);
        else if (op.type === "move_survey_option") {
          const [item] = value.options.splice(index, 1), destination = op.beforeOptionId ? value.options.findIndex((option) => option.id === op.beforeOptionId) : value.options.length;
          if (destination < 0) throw new Error("Survey option move destination no longer exists.");
          value.options.splice(destination, 0, item);
        } else {
          const dependent = (_d = owner.branching) == null ? void 0 : _d.rules.some((rule2) => rule2.questionId === value.id && rule2.value === op.optionId);
          if (dependent && !op.removeBranchRules) throw new Error("This option controls branching. Explicitly allow removal of dependent branch rules.");
          if (dependent) {
            owner.branching.rules = owner.branching.rules.filter((rule2) => !(rule2.questionId === value.id && rule2.value === op.optionId));
            warnings.push("Dependent branch rules were removed with the Survey option.");
          }
          value.options.splice(index, 1);
          warnings.push("A Survey option and its answer value were removed.");
        }
      }
      affected.add(owner.id);
    } else if (operation.type === "update_survey_branching") {
      const owner = step(operation.stepId);
      owner.branching = operation.branching ? cloneOnsite(operation.branching) : void 0;
      affected.add(owner.id);
      warnings.push("Survey branching changed; visitor paths may differ.");
    } else if (operation.type === "remove_survey_branch_rule") {
      const owner = step(operation.stepId);
      if (!owner.branching || operation.ruleIndex < 0 || operation.ruleIndex >= owner.branching.rules.length) throw new Error("Survey branch rule no longer exists.");
      owner.branching.rules.splice(operation.ruleIndex, 1);
      affected.add(owner.id);
      warnings.push("A Survey branch rule was removed.");
    } else if (operation.type === "update_survey_configuration") {
      Object.assign(survey, cloneOnsite(operation.patch));
      if (operation.patch.submitLabel !== void 0) survey.submitLabel = operation.patch.submitLabel.trim().slice(0, 80);
      warnings.push("Survey-wide configuration changed.");
    } else throw new Error("Unsupported Survey AI operation.");
  }
  for (const [stepId, operations] of withinStep) {
    const owner = step(stepId), document2 = applyEditorAiProposal(documentFor$1(owner), { summary: proposal.summary, operations });
    owner.content = applyOnsiteDocument(owner.builder, document2, "survey", { questions: owner.questions, submitLabel: survey.submitLabel }).content;
    affected.add(stepId);
  }
  if (survey.steps.length < 1 || survey.steps.length > 20) throw new Error("A Survey must contain 1–20 steps.");
  const ids = /* @__PURE__ */ new Set();
  for (const owner of survey.steps) {
    if (ids.has(owner.id)) throw new Error("Survey step IDs must be unique.");
    ids.add(owner.id);
    for (const value of owner.questions) {
      if (ids.has(value.id)) throw new Error("Survey question IDs must be unique.");
      ids.add(value.id);
      if (value.type === "single_choice" || value.type === "multiple_choice") for (const option of value.options) {
        if (ids.has(option.id)) throw new Error("Survey option IDs must be unique.");
        ids.add(option.id);
      }
    }
    compileStep(owner, survey.submitLabel);
  }
  const branchErrors = surveyBranchErrors(survey);
  if (branchErrors.length) throw new Error(branchErrors.join(" "));
  return { definition, affectedStepIds: [...affected], order: survey.steps.map((value) => value.id), warnings };
}
function surveyAiContext(input2) {
  const survey = ensureSurvey(input2.definition), current = survey.steps.find((step) => step.id === input2.currentStepId);
  if (!current) throw new Error("Current Survey step no longer exists.");
  const document2 = documentFor$1(current);
  return {
    experience: { ...input2.experience, kind: "widget", widgetType: "survey" },
    revision: input2.revision,
    scope: input2.scope ?? (input2.selection.kind === "step" ? "survey" : "step"),
    currentStepId: current.id,
    selection: cloneOnsite(input2.selection),
    configuration: { showProgress: survey.showProgress, allowBack: survey.allowBack, submitLabel: survey.submitLabel },
    steps: survey.steps.map((step) => ({ id: step.id, heading: step.content.heading, body: step.content.body, questions: cloneOnsite(step.questions), branching: cloneOnsite(step.branching) })),
    currentDocument: aiDocumentContext({ schemaVersion: document2.schemaVersion, id: document2.id, root: document2.root }),
    ...current.builder ? { source: sourceContext(current.builder, false) } : {},
    targeting: cloneOnsite(input2.definition.targeting),
    visualTheme: cloneOnsite(input2.definition.visualTheme)
  };
}
const isDocumentOperation = (operation) => ["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type);
function documentFor(definition) {
  const document2 = onsiteDocumentFromBuilder(definition.builder);
  if (!document2 || document2.schemaVersion !== 4) throw new Error("This Checklist has no editable schema-v4 document.");
  return document2;
}
function itemCell(document2, itemId) {
  let found = null;
  const visit = (cell) => {
    var _a, _b;
    if (((_a = cell.block) == null ? void 0 : _a.type) === "checklist_task" && cell.block.itemId === itemId) found = cell;
    (_b = cell.children) == null ? void 0 : _b.forEach(visit);
  };
  visit(document2.root);
  return found;
}
function itemContainer(document2) {
  let found = null;
  const visit = (cell) => {
    var _a;
    if (cell.checklistRole === "items") found = cell;
    (_a = cell.children) == null ? void 0 : _a.forEach(visit);
  };
  visit(document2.root);
  return found;
}
function insertReference(document2, itemId, afterItemId) {
  const container2 = itemContainer(document2);
  if (!(container2 == null ? void 0 : container2.children)) throw new Error("Checklist task container is missing.");
  const target = afterItemId ? itemCell(document2, afterItemId) : null;
  if (afterItemId && (!target || parentCell(document2, target.id) !== container2)) throw new Error("Checklist task insertion point no longer exists.");
  const cell = { ...emptyCell({ id: onsiteId("block"), type: "checklist_task", itemId, fontSize: 14, indicator: "check" }), sizing: { mode: "hug" } };
  container2.children.splice(target ? container2.children.indexOf(target) + 1 : container2.children.length, 0, cell);
}
function removeReference(document2, itemId) {
  const cell = itemCell(document2, itemId);
  if (!cell || !removeCell(document2, cell.id)) throw new Error("Checklist task reference no longer exists.");
}
function moveReference(document2, itemId, beforeItemId) {
  const container2 = itemContainer(document2), source = itemCell(document2, itemId), target = beforeItemId ? itemCell(document2, beforeItemId) : null;
  if (!(container2 == null ? void 0 : container2.children) || !source || parentCell(document2, source.id) !== container2 || beforeItemId && (!target || parentCell(document2, target.id) !== container2)) throw new Error("Checklist task move target is invalid.");
  container2.children.splice(container2.children.indexOf(source), 1);
  container2.children.splice(target ? container2.children.indexOf(target) : container2.children.length, 0, source);
}
function validateResource(item, references, warnings) {
  if (item.action.type === "launch_guide") {
    const experienceId = item.action.experienceId, guide = references.guides.find((value) => value.id === experienceId);
    if (!guide) throw new Error(`Unknown site Guide: ${experienceId}`);
    if (guide.status !== "published") warnings.push(`Guide “${guide.name}” is not published and cannot currently launch for visitors.`);
  }
  if (item.completion.type === "guide_completed") {
    const experienceId = item.completion.experienceId, guide = references.guides.find((value) => value.id === experienceId);
    if (!guide) throw new Error(`Unknown site Guide: ${experienceId}`);
    if (guide.status !== "published") warnings.push(`Guide “${guide.name}” is not published, so Guide-completion progress cannot currently occur.`);
  }
  if (item.completion.type === "segment") {
    const segmentId = item.completion.segmentId;
    if (!references.segments.some((value) => value.id === segmentId)) throw new Error(`Unknown site Segment: ${segmentId}`);
  }
  if (item.action.type === "navigate" && !/^\/(?!\/)/.test(item.action.url)) throw new Error("Checklist navigation must use a safe site-relative path.");
  if (item.action.type === "open_url" && !/^https?:\/\//i.test(item.action.url)) throw new Error("Checklist external URLs must use HTTP or HTTPS.");
  if (item.action.type === "none" && item.completion.type !== "item_clicked") throw new Error("A task without an action must use click completion.");
}
function validateAndCompile(definition, document2, references, warnings) {
  if (!definition.title.trim() || definition.title.length > 160 || !definition.completionMessage.title.trim() || !definition.completionMessage.acknowledgeLabel.trim() || definition.completionMessage.acknowledgeLabel.length > 80) throw new Error("Checklist and completion copy is invalid.");
  definition.items.forEach((item) => {
    var _a;
    if (!item.title.trim() || item.title.length > 200 || (((_a = item.description) == null ? void 0 : _a.length) ?? 0) > 1e3) throw new Error("Checklist task copy is invalid.");
    validateResource(item, references, warnings);
  });
  const errors = [...validateOnsiteDocument(document2).errors, ...validateOnsiteChecklistDocument(document2, definition)];
  if (errors.length) throw new Error(errors.join(" "));
  applyOnsiteDocument(definition.builder, document2, "checklist", void 0, definition);
}
function applyChecklistAiProposal(source, proposal, references) {
  var _a, _b, _c;
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const definition = cloneOnsite(source), document2 = cloneOnsite(documentFor(definition)), affected = /* @__PURE__ */ new Set(), warnings = [], visual = [];
  const item = (id) => {
    const value = definition.items.find((entry) => entry.id === id);
    if (!value) throw new Error(`Checklist task no longer exists: ${id}`);
    return value;
  };
  const replacement = proposal.operations.find((operation) => operation.type === "replace_markup");
  if (replacement) {
    if (proposal.operations.length !== 1 || replacement.stepId) throw new Error("A Checklist source replacement must be one atomic widget-scoped operation.");
    definition.items.forEach((value) => validateResource(value, references, warnings));
    const content = { heading: definition.title, body: definition.description ?? "" };
    applySourceMarkup(definition.builder, content, replacement, { widgetType: "checklist", guide: false, checklist: { items: definition.items.map((value) => ({ id: value.id })) } });
    definition.title = content.heading;
    definition.description = content.body || void 0;
    return { definition, affectedItemIds: definition.items.map((value) => value.id), order: definition.items.map((value) => value.id), warnings: [.../* @__PURE__ */ new Set([...warnings, "This Checklist now uses Source mode; protected tasks, views, and completion controls remain canonical."])] };
  }
  for (const operation of proposal.operations) {
    if (isDocumentOperation(operation)) {
      visual.push(operation);
      continue;
    }
    if (operation.type === "generate_checklist") {
      if (!operation.items.length || operation.items.length > 20) throw new Error("A Checklist needs 1–20 tasks.");
      definition.title = ((_a = operation.title) == null ? void 0 : _a.trim().slice(0, 160)) || definition.title;
      definition.description = ((_b = operation.description) == null ? void 0 : _b.trim().slice(0, 2e3)) || definition.description;
      const container2 = itemContainer(document2);
      if (!container2) throw new Error("Checklist task container is missing.");
      container2.children = [];
      definition.items = operation.items.map((value) => ({ ...cloneOnsite(value), id: onsiteId("item") }));
      definition.items.forEach((value) => insertReference(document2, value.id));
      definition.items.forEach((value) => affected.add(value.id));
      warnings.push("The complete Checklist task list was replaced.");
    } else if (operation.type === "add_checklist_task") {
      if (definition.items.length >= 20) throw new Error("A Checklist supports up to 20 tasks.");
      if (operation.afterItemId) item(operation.afterItemId);
      const created = { ...cloneOnsite(operation.item), id: onsiteId("item") }, index = operation.afterItemId ? definition.items.findIndex((value) => value.id === operation.afterItemId) + 1 : definition.items.length;
      definition.items.splice(index, 0, created);
      insertReference(document2, created.id, operation.afterItemId);
      affected.add(created.id);
    } else if (operation.type === "duplicate_checklist_task") {
      if (definition.items.length >= 20) throw new Error("A Checklist supports up to 20 tasks.");
      const original = item(operation.itemId), created = { ...cloneOnsite(original), id: onsiteId("item") }, after = operation.afterItemId ?? original.id;
      item(after);
      definition.items.splice(definition.items.findIndex((value) => value.id === after) + 1, 0, created);
      insertReference(document2, created.id, after);
      affected.add(created.id);
    } else if (operation.type === "remove_checklist_task") {
      if (definition.items.length <= 1) throw new Error("The final Checklist task cannot be removed.");
      item(operation.itemId);
      definition.items = definition.items.filter((value) => value.id !== operation.itemId);
      removeReference(document2, operation.itemId);
      affected.add(operation.itemId);
      warnings.push("A Checklist task and its existing visitor progress reference were removed.");
    } else if (operation.type === "move_checklist_task") {
      const value = item(operation.itemId);
      if (operation.beforeItemId) item(operation.beforeItemId);
      definition.items.splice(definition.items.indexOf(value), 1);
      const index = operation.beforeItemId ? definition.items.findIndex((entry) => entry.id === operation.beforeItemId) : definition.items.length;
      definition.items.splice(index, 0, value);
      moveReference(document2, value.id, operation.beforeItemId);
      affected.add(value.id);
      if (definition.behavior.order === "sequential") warnings.push("Task order changed for a sequential Checklist, changing visitor progression.");
    } else if (operation.type === "update_checklist_task") {
      const value = item(operation.itemId);
      if (operation.patch.title !== void 0) value.title = operation.patch.title.trim().slice(0, 200);
      if (operation.patch.description !== void 0) value.description = operation.patch.description === null ? void 0 : operation.patch.description.trim().slice(0, 1e3);
      affected.add(value.id);
    } else if (operation.type === "update_checklist_task_action") {
      const value = item(operation.itemId);
      value.action = cloneOnsite(operation.action);
      affected.add(value.id);
      warnings.push("A task click action changed.");
    } else if (operation.type === "update_checklist_task_completion") {
      const value = item(operation.itemId);
      value.completion = cloneOnsite(operation.completion);
      affected.add(value.id);
      warnings.push("A task completion condition changed; visitor progress behavior may differ.");
    } else if (operation.type === "update_checklist_behavior") {
      const oldOrder = definition.behavior.order;
      Object.assign(definition.behavior, cloneOnsite(operation.patch));
      if (operation.patch.order && operation.patch.order !== oldOrder) warnings.push("Checklist progression order changed.");
    } else if (operation.type === "update_checklist_completion_message") Object.assign(definition.completionMessage, cloneOnsite(operation.patch));
    else if (operation.type === "update_checklist_visual_state") {
      const view = (_c = document2.root.children) == null ? void 0 : _c.find((cell) => cell.checklistRole === operation.view);
      if (!view) throw new Error(`Checklist visual state is missing: ${operation.view}`);
      view.checklistWidth = operation.width;
    } else if (operation.type === "update_checklist_style") {
      const block = findBlock(document2, operation.blockId);
      if (!block || !block.type.startsWith("checklist_")) throw new Error("Checklist style target no longer exists.");
      const patch = operation.patch, visual2 = block;
      if (patch.fontSize !== void 0) visual2.fontSize = patch.fontSize;
      if (patch.color !== void 0) visual2.color = patch.color;
      if (block.type === "checklist_task" && patch.indicator !== void 0) block.indicator = patch.indicator;
      if (block.type === "checklist_text" && patch.text !== void 0) block.text = patch.text.slice(0, 200);
    } else throw new Error("Unsupported Checklist AI operation.");
  }
  const finalDocument = visual.length ? applyEditorAiProposal(document2, { summary: proposal.summary, operations: visual }) : document2;
  validateAndCompile(definition, finalDocument, references, warnings);
  return { definition, affectedItemIds: [...affected], order: definition.items.map((value) => value.id), warnings: [...new Set(warnings)] };
}
function checklistAiContext(input2) {
  const document2 = documentFor(input2.checklist), blockId = input2.selection.kind === "block" ? input2.selection.blockId : void 0, selected = blockId ? listBlocks(document2.root).find((block) => block.id === blockId) : void 0, selectedItemId = (selected == null ? void 0 : selected.type) === "checklist_task" ? selected.itemId : void 0;
  return { experience: { ...input2.experience, kind: "checklist", widgetType: null }, revision: input2.revision, currentView: input2.currentView, selection: cloneOnsite(input2.selection), selectedItemId, checklist: { title: input2.checklist.title, description: input2.checklist.description, totalTasks: input2.checklist.items.length, behavior: cloneOnsite(input2.checklist.behavior), completionMessage: cloneOnsite(input2.checklist.completionMessage), items: input2.checklist.items.map((item, index) => ({ ...cloneOnsite(item), position: index })) }, resources: { guides: input2.references.guides.map((value) => ({ id: value.id, name: value.name, status: value.status })), segments: input2.references.segments.map((value) => ({ id: value.id, name: value.name })) }, currentDocument: aiDocumentContext(document2), source: sourceContext(input2.checklist.builder, false), targeting: cloneOnsite(input2.checklist.targeting), theme: cloneOnsite(input2.theme) };
}
class EditorModeController {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this.host = null;
    this.root = null;
    this.picker = new ElementPicker();
    this.preview = new ExperienceRenderer();
    this.contentEditor = null;
    this.compositionEditor = null;
    this.componentSelection = null;
    this.compositionSelection = null;
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
    this.surveyEditor = null;
    this.checklist = null;
    this.checklistEditor = null;
    this.stepIndex = 0;
    this.mode = "design";
    this.dirty = false;
    this.editGeneration = 0;
    this.history = new EditorHistory((value) => JSON.stringify(value.definition));
    this.historyTyping = false;
    this.restoringHistory = false;
    this.preferredSelection = null;
    this.aiPreviewLocation = null;
    this.saveState = "clean";
    this.recoveryDraft = null;
    this.lifecycle = 0;
    this.previewRendered = false;
    this.previewGeneration = 0;
    this.currentPath = "";
    this.guidePreviewComplete = false;
    this.guidePreviewEntryPath = "";
    this.previewDevice = "desktop";
    this.aiMessages = [];
    this.aiProposal = null;
    this.aiResolvedTargets = /* @__PURE__ */ new Map();
    this.aiPreviewOriginal = null;
    this.aiPreviewCandidate = null;
    this.aiPreviewReturnMode = null;
    this.surveyAiPreviewOriginal = null;
    this.surveyAiPreviewCandidate = null;
    this.checklistAiPreviewOriginal = null;
    this.checklistAiPreviewCandidate = null;
    this.widgetAiPreviewOriginal = null;
    this.widgetAiPreviewCandidate = null;
    this.aiAbort = null;
    this.aiRequestGeneration = 0;
    this.persistBeforePageLeave = () => this.updateContinuation();
    this.protectUnsavedChanges = (event) => {
      var _a, _b;
      if (!this.dirty && !this.saveInFlight && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing()) && !((_b = this.compositionEditor) == null ? void 0 : _b.isComposing())) return;
      event.preventDefault();
      event.returnValue = "";
    };
    this.fitPanel = () => {
      var _a, _b, _c;
      const aside = (_a = this.root) == null ? void 0 : _a.querySelector("aside");
      if (!aside) return;
      const viewport = window.visualViewport;
      const width = (viewport == null ? void 0 : viewport.width) ?? innerWidth;
      const height = (viewport == null ? void 0 : viewport.height) ?? innerHeight;
      const x2 = (viewport == null ? void 0 : viewport.offsetLeft) ?? 0;
      const y = (viewport == null ? void 0 : viewport.offsetTop) ?? 0;
      const toolbar = (_b = this.root) == null ? void 0 : _b.querySelector("[data-editor-toolbar]");
      if (toolbar) {
        toolbar.style.maxWidth = `${Math.max(0, width - 8)}px`;
        const bounds = toolbar.getBoundingClientRect();
        if (bounds.left < x2 + 4 || bounds.right > x2 + width - 4 || bounds.top < y + 4 || bounds.bottom > y + height - 4) {
          toolbar.style.transform = "none";
          toolbar.style.left = `${Math.max(x2 + 4, Math.min(x2 + width - bounds.width - 4, bounds.left))}px`;
          toolbar.style.top = `${Math.max(y + 4, Math.min(y + height - bounds.height - 4, bounds.top))}px`;
        }
      }
      aside.style.maxWidth = `${Math.max(0, width - 8)}px`;
      aside.style.maxHeight = `${Math.max(48, height - 8)}px`;
      const main = (_c = this.root) == null ? void 0 : _c.querySelector("main");
      if (main) main.style.maxHeight = `${Math.max(0, width <= 480 ? height * 0.38 : height - 32)}px`;
      const rect = aside.getBoundingClientRect();
      if (aside.style.left) aside.style.left = `${Math.max(x2 + 4, Math.min(x2 + width - rect.width - 4, rect.left))}px`;
      if (width <= 480) {
        aside.style.top = "auto";
        aside.style.bottom = this.guide || this.survey ? "70px" : "8px";
      } else {
        aside.style.bottom = "auto";
        aside.style.top = `${Math.max(y + 4, Math.min(y + height - 48, rect.top || y + 4))}px`;
      }
    };
    this.protectPreviewSubmission = (event) => {
      if (this.mode !== "preview") return;
      event.preventDefault();
      this.setText("[data-trigger-status]", "Form submission is disabled in preview. Use Next to continue safely.");
    };
    this.protectPreviewNavigation = (event) => {
      if (this.mode !== "preview") return;
      const link = event.composedPath().find((node2) => node2 instanceof HTMLAnchorElement);
      if (!link) return;
      try {
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || !["http:", "https:"].includes(url.protocol) || link.target === "_blank" || link.hasAttribute("download")) {
          event.preventDefault();
          this.setText("[data-trigger-status]", "External navigation is disabled in preview. Use Next to continue safely.");
        }
      } catch {
        event.preventDefault();
      }
    };
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
      const clean = new URL(location.href);
      const requestedStep = Number(clean.searchParams.get("movcues_editor_step") ?? "0");
      clean.searchParams.delete("movcues_editor_token");
      clean.searchParams.delete("movcues_editor_step");
      history.replaceState(history.state, "", clean.toString());
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
    if (draft.experience.kind === "checklist" && draft.experience.builderMode !== "onsite") {
      clearEditorContinuation();
      return false;
    }
    this.bridge = bridge;
    this.session = session;
    this.draft = draft;
    this.checklist = isChecklistDefinition(draft.version.definition) ? draft.version.definition : null;
    this.definition = this.checklist ? checklistEditorAdapter(this.checklist) : draft.version.definition;
    this.history.reset({ definition: cloneOnsite(this.checklist ?? this.definition), selection: null, stepIndex: this.stepIndex });
    this.guide = isGuideDefinition(this.definition) ? this.definition : null;
    this.survey = !this.guide && draft.experience.widgetType === "survey" ? this.definition.survey ?? null : null;
    const selectableSteps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    const restored = ((_c = options.restoredState) == null ? void 0 : _c.experienceId) === draft.experience.id ? options.restoredState : void 0;
    const restoredIndex = selectableSteps && (restored == null ? void 0 : restored.selectedStepId) ? selectableSteps.findIndex((step) => step.id === restored.selectedStepId) : -1;
    this.stepIndex = selectableSteps ? restoredIndex >= 0 ? restoredIndex : clampStep(options.requestedStep ?? 0, selectableSteps.length) : 0;
    this.currentPath = currentPagePath();
    const restoredMode = restored == null ? void 0 : restored.mode;
    this.mode = restoredMode === "select" ? "target" : restoredMode === "design" || restoredMode === "target" || restoredMode === "navigate" || restoredMode === "preview" ? restoredMode : draft.experience.builderMode === "onsite" ? "design" : "target";
    this.updateContinuation();
    this.mount();
    this.expiryTimer = window.setTimeout(() => this.expireSession(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    this.validationTimer = window.setInterval(() => {
      void bridge.load().catch((error) => {
        if (this.bridge === bridge && error instanceof EditorSessionExpiredError) this.expireSession();
      });
    }, 15e3);
    return true;
  }
  mount() {
    var _a, _b, _c;
    if (!this.draft || !this.definition) return;
    this.host = document.createElement("div");
    this.host.dataset.movcuesEditor = "";
    this.host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}${GUIDE_STYLE}</style>${this.panelMarkup(this.draft)}`;
    if (this.guide) (_a = this.root.querySelector('[data-inspector="step"]')) == null ? void 0 : _a.insertAdjacentHTML("beforeend", this.guideBehaviorMarkup());
    if (this.guide) this.root.querySelectorAll("[data-guide] .history-row:not([data-step-bar-actions])").forEach((actions) => {
      var _a2;
      return (_a2 = this.root.querySelector('[data-inspector="step"]')) == null ? void 0 : _a2.append(actions);
    });
    (document.body ?? document.documentElement).appendChild(this.host);
    if (this.survey && this.draft.experience.builderMode === "onsite") this.surveyEditor = new SurveyEditor(this.root, this.survey, {
      index: () => this.stepIndex,
      composer: () => this.compositionEditor,
      canEdit: () => this.mode === "design" && this.saveState !== "expired",
      flush: () => this.flushContent(),
      changed: () => this.changed(false),
      error: (errors) => this.showValidation(errors),
      stepsChanged: (index) => {
        var _a2;
        (_a2 = this.compositionEditor) == null ? void 0 : _a2.destroy();
        this.compositionEditor = null;
        this.compositionSelection = null;
        this.stepIndex = index;
        this.changed();
        this.refreshStepBar();
      }
    });
    if (this.checklist) this.checklistEditor = new ChecklistEditor(this.root, this.checklist, this.draft.references ?? { guides: [], segments: [] }, {
      composer: () => this.compositionEditor,
      canEdit: () => this.mode === "design" && this.saveState !== "expired",
      flush: () => this.flushContent(),
      changed: () => this.changed(false),
      render: () => {
        this.renderPreview();
        this.syncPanel();
      },
      error: (errors) => this.showValidation(errors)
    });
    this.bindPanel();
    this.syncPanel();
    this.applyMode();
    this.routeUnsubscribe = this.routeObserver.onChange(() => this.onRouteChange());
    this.routeObserver.start();
    window.addEventListener("pagehide", this.persistBeforePageLeave);
    document.addEventListener("click", this.protectPreviewNavigation, true);
    document.addEventListener("submit", this.protectPreviewSubmission, true);
    window.addEventListener("beforeunload", this.protectUnsavedChanges);
    this.configureDiagnostics();
    (_b = window.visualViewport) == null ? void 0 : _b.addEventListener("resize", this.fitPanel);
    (_c = window.visualViewport) == null ? void 0 : _c.addEventListener("scroll", this.fitPanel);
    window.addEventListener("resize", this.fitPanel);
    this.fitPanel();
  }
  panelMarkup(draft) {
    var _a, _b, _c;
    const selectableSteps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    const aiEligible = draft.experience.builderMode === "onsite" && ["guide", "widget", "checklist"].includes(draft.experience.kind);
    const guideMarkup = selectableSteps ? `<section class="section step-navigator" data-guide><span class="step-drag-handle" data-step-drag-handle title="Drag step bar" aria-hidden="true">⠿</span><div class="content-heading"><div><div class="eyebrow">${this.guide ? "Guide steps" : "Survey steps"}</div><div class="muted" data-step-label></div></div>${this.guide ? '<div class="history-row"><button type="button" class="secondary-button compact" data-add-step="modal">＋ Modal</button><button type="button" class="secondary-button compact" data-add-step="anchored_card">＋ Anchored</button></div>' : ""}</div><div class="step-flow" data-step-flow>${this.stepButtons()}</div>${this.guide ? `<div class="history-row" data-step-bar-actions><button type="button" class="secondary-button compact step-bar-action" data-add-current-step aria-label="Add step" title="Add a ${getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal" ? "Modal" : "Anchored"} step">＋</button><button type="button" class="secondary-button compact step-bar-action step-bar-delete" data-delete-step aria-label="Delete selected step" title="Delete selected step"${this.guide.steps.length <= 1 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 13h10l1-13"/></svg></button></div><div class="history-row"><button type="button" class="secondary-button compact" data-duplicate-step>Duplicate</button><button type="button" class="secondary-button compact" data-step-left>←</button><button type="button" class="secondary-button compact" data-step-right>→</button></div>` : ""}</section>` : "";
    const designDisabled = draft.experience.builderMode !== "onsite" ? ' disabled title="Content is edited in the GrapesJS Dashboard Builder"' : "";
    return `<div class="editor-toolbar" data-editor-toolbar role="region" aria-label="Movcues editing controls">
      <header data-drag-handle>
        <div class="header-copy"><strong>Movcues Live Editor</strong><span>${escapeText(draft.experience.name)}</span><small><i></i> Connected · <span data-save-state>Draft saved</span></small></div>
        <div class="header-actions"><button type="button" data-global-undo aria-label="Undo">↶</button><button type="button" data-global-redo aria-label="Redo">↷</button><button type="button" data-save aria-label="Save draft">Save</button><button type="button" data-move-side aria-label="Move inspector to other side">⇄</button><button type="button" data-return-dashboard aria-label="Return to dashboard">↗</button><button type="button" data-minimize aria-label="Toggle inspector" aria-expanded="true">☷</button><button type="button" data-close aria-label="Close editor">×</button></div>
      </header>
        <div class="modebar"><button type="button" data-mode="design"${designDisabled}>Design</button><button type="button" data-mode="target">Target</button><button type="button" data-mode="navigate">Navigate</button><button type="button" data-mode="preview">Preview</button></div>
        <div class="guide-preview-controls" data-guide-preview hidden><button type="button" data-preview-start>Start Guide</button><button type="button" data-preview-back aria-label="Previous preview step">←</button><button type="button" data-preview-next aria-label="Next preview step">→</button><button type="button" data-preview-reset>Reset</button><button type="button" data-preview-test hidden>Test event</button><span data-preview-step></span><small data-trigger-status role="status" aria-live="polite"></small></div>
      </div>
      ${guideMarkup}
      <aside aria-label="Contextual inspector"><main>
        <nav class="inspector-tabs" aria-label="Inspector mode"><button type="button" class="active" data-inspector-tab="properties">Properties</button><button type="button" data-inspector-tab="theme">Theme</button><button type="button" data-inspector-tab="ai"${aiEligible ? "" : " disabled"}>AI</button></nav>
        <section class="section ai-panel" data-ai-panel hidden>
          <div class="content-heading"><div><div class="eyebrow">Movcues AI</div><strong>Design assistant</strong></div><button type="button" class="secondary-button compact" data-ai-cancel hidden>Stop</button></div>
          <p class="muted" data-ai-context>Choose an element or ask about the whole widget.</p>
          <div class="ai-chat-history" data-ai-history aria-label="AI chat history" aria-live="polite"></div>
          <form class="ai-composer" data-ai-form><textarea data-ai-prompt maxlength="4000" rows="3" placeholder="Describe the change…"></textarea><button type="submit" class="secondary-button" data-ai-send>Send</button></form>
          <div class="ai-status" data-ai-status role="status" aria-live="polite"></div>
          <article class="ai-proposal" data-ai-proposal hidden><strong data-ai-summary></strong><ul data-ai-operations></ul><p class="muted">Preview only. Nothing changes until you apply it.</p><div class="history-row"><button type="button" class="secondary-button" data-ai-target hidden>Select target</button><button type="button" class="secondary-button" data-ai-preview hidden>Preview Guide</button><button type="button" class="secondary-button" data-ai-apply>Apply</button><button type="button" class="secondary-button" data-ai-discard>Discard</button></div></article>
        </section>
        <button type="button" class="secondary-button" data-reset-preview hidden>Reset Preview</button><p class="hint" data-preview-limit hidden>${this.guide ? "Test this Guide on the page. No production events or progress are recorded. External links are disabled. Website interactions can still run your site's JavaScript." : this.survey ? "Preview tests the full Survey. No responses, production events or progress are recorded. Website interactions can still run your site's JavaScript." : "Preview tests this step only. Links and external actions are disabled. Website interactions can still run your site's JavaScript."}</p>
        <div class="notice" data-route-notice hidden><b>Page changed</b><span data-route-change></span></div>
        <section class="section composition-inspector" data-composition-inspector hidden>
          <div class="content-heading"><div><div class="eyebrow">Inspector</div><strong data-composition-label>Step</strong></div><button type="button" class="secondary-button compact" data-select-step>Step</button></div>
          <div data-inspector="step"><label>Step label<input data-step-name type="text" maxlength="80" placeholder="Step label"></label><div class="history-row"><button type="button" class="secondary-button compact" data-edge="top">Header</button><button type="button" class="secondary-button compact" data-edge="bottom">Footer</button><button type="button" class="secondary-button compact" data-edge="left">Left area</button><button type="button" class="secondary-button compact" data-edge="right">Right area</button></div></div>
          <div data-inspector="cell" hidden>
            <label>Direction<select data-cell-direction><option value="column">Column</option><option value="row">Row</option></select></label>
            <label>Size<select data-cell-size><option value="flexible">Flexible</option><option value="hug">Hug content</option><option value="fixed">Fixed</option></select></label>
            <label data-fixed-size hidden>Fixed size<div class="number"><input data-cell-fixed type="number" min="24" max="1200"><span>px</span></div></label>
            <label>Align<select data-cell-align><option value="stretch">Stretch</option><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label>
            <label>Gap<div class="number"><input data-cell-gap type="number" min="0" max="96"><span>px</span></div></label>
            <label>Padding<div class="number"><input data-cell-padding type="number" min="0" max="128"><span>px</span></div></label>
            <label>Background<input data-cell-background type="color" value="#ffffff"></label><label>Border<div class="number"><input data-cell-border type="number" min="0" max="16"><span>px</span></div></label><label>Radius<div class="number"><input data-cell-radius type="number" min="0" max="100"><span>px</span></div></label>
            <label class="check"><input data-cell-stack type="checkbox"> Stack on narrow screens</label>
          </div>
          <div data-inspector="block" hidden>
            <div data-block="heading,text"><div class="formatbar"><button type="button" data-v2-format="strong"><b>B</b></button><button type="button" data-v2-format="em"><i>I</i></button><button type="button" data-v2-format="u"><u>U</u></button><button type="button" data-v2-list="ul">• List</button><button type="button" data-v2-list="ol">1. List</button></div><div class="link-row"><input data-v2-link-url aria-label="Link URL" type="text" inputmode="url" placeholder="https://… or /path"><button type="button" class="secondary-button compact" data-v2-apply-link>Link</button></div><label>Font size<div class="number"><input data-block-font-size type="number" min="10" max="72"><span>px</span></div></label><label>Line height<input data-block-line-height type="number" min="0.9" max="3" step="0.05"></label><label>Weight<select data-block-weight><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option></select></label><label>Text color<input data-block-color type="color"></label></div>
            <div data-block="button"><label>Label<input data-button-label type="text" maxlength="80"></label><label>Variant<select data-button-variant><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="outline">Outline</option></select></label><label>Action<select data-button-action><option value="dismiss">Dismiss</option>${this.guide ? '<option value="next_step">Next step</option><option value="previous_step">Previous step</option>' : ""}<option value="open_url">Open URL</option><option value="track_event">Track event</option></select></label><label data-action-url hidden>URL<input data-button-url type="url" placeholder="https://example.com"></label><label data-action-event hidden>Event<input data-button-event type="text" maxlength="200" placeholder="feature_clicked"></label><label>Background<input data-button-background type="color"></label><label>Text color<input data-button-color type="color"></label><label>Width<select data-button-width><option value="hug">Hug content</option><option value="full">Full width</option></select></label><label>Horizontal pad<div class="number"><input data-button-padding-x type="number" min="4" max="48"><span>px</span></div></label><label>Vertical pad<div class="number"><input data-button-padding-y type="number" min="4" max="32"><span>px</span></div></label><label>Radius<div class="number"><input data-button-radius type="number" min="0" max="48"><span>px</span></div></label></div>
            <div data-block="image"><button type="button" class="secondary-button" data-choose-image>Choose image</button><p class="muted">PNG, JPG or WebP · up to 10 MB. You can also drop a file onto the image.</p><p class="muted" data-image-status role="status" aria-live="polite"></p><label>Image URL<input data-v2-image-src type="url" placeholder="https://… (optional)"></label><label>Alt text<input data-v2-image-alt type="text" maxlength="500"></label><label>Fit<select data-image-fit><option value="cover">Cover</option><option value="contain">Contain</option></select></label><label>Width<div class="number"><input data-image-width type="number" min="1" max="100"><span>%</span></div></label><label>Radius<div class="number"><input data-image-radius type="number" min="0" max="100"><span>px</span></div></label></div>
            <div data-block="divider"><label>Thickness<div class="number"><input data-divider-thickness type="number" min="1" max="16"><span>px</span></div></label><label>Color<input data-divider-color type="color"></label></div>
            <div data-block="spacer"><label>Space<div class="number"><input data-spacer-size type="number" min="4" max="240"><span>px</span></div></label></div>
            <div data-block="icon"><label>Icon<select data-icon-name><option value="check">Check</option><option value="star">Star</option><option value="info">Info</option><option value="warning">Warning</option><option value="sparkles">Sparkles</option><option value="arrow">Arrow</option><option value="heart">Heart</option><option value="rocket">Rocket</option></select></label><label>Size<div class="number"><input data-icon-size type="number" min="12" max="96"><span>px</span></div></label><label>Color<input data-icon-color type="color"></label></div>
            <label>Alignment<select data-block-align><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          </div>
          <div class="history-row"><button type="button" class="secondary-button compact" data-v2-undo>Undo</button><button type="button" class="secondary-button compact" data-v2-redo>Redo</button></div>
        </section>
        <section class="section content-inspector" data-content-inspector hidden>
          <div class="content-heading"><div><div class="eyebrow">Content</div><strong data-component-label>Nothing selected</strong></div><button type="button" class="secondary-button compact" data-edit-component>Edit</button></div>
          <div class="formatbar" data-text-controls><button type="button" data-format="strong" aria-label="Bold"><b>B</b></button><button type="button" data-format="em" aria-label="Italic"><i>I</i></button><button type="button" data-format="u" aria-label="Underline"><u>U</u></button><button type="button" data-list="ul" aria-label="Bulleted list">• List</button><button type="button" data-list="ol" aria-label="Numbered list">1. List</button></div>
          <div class="format-row" data-text-controls><label>Align<select data-text-align><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
          <div class="link-row" data-text-controls><input data-link-url aria-label="Link URL" type="text" inputmode="url" placeholder="https://… or /path"><button type="button" class="secondary-button compact" data-apply-link>Link</button></div>
          <div class="image-controls" data-image-controls hidden><label>Source URL<input data-image-src type="text" inputmode="url"></label><label>Alt text<input data-image-alt type="text" maxlength="500"></label><button type="button" class="secondary-button" data-apply-image>Apply image</button></div>
          <div class="history-row"><button type="button" class="secondary-button compact" data-undo disabled>Undo</button><button type="button" class="secondary-button compact" data-redo disabled>Redo</button></div>
        </section>
        <div class="section eyebrow" data-step-only data-step-appearance>Step appearance</div>
        <section class="section" data-step-only data-for="target">
          <div class="eyebrow">Target</div><strong class="truncate" data-target-label>Not selected</strong><div class="reliability" data-reliability></div>
          <button class="secondary-button" type="button" data-pick>Reselect target</button>
        </section>
        <section class="section" data-step-only data-layering-section>
          <div class="eyebrow">Layering</div>
          <label>Policy<select data-layer-mode><option value="auto">Automatic</option><option value="relative">Relative to an element</option><option value="always_on_top">Always on top</option><option value="custom">Advanced / Custom</option></select></label>
          <div class="muted" data-layer-description></div>
          <div data-layer-relative hidden><strong class="truncate" data-layer-target>Not selected</strong><button class="secondary-button" type="button" data-pick-layer>Select element from page</button><label>Relationship<select data-layer-relation><option value="above">Above</option><option value="below">Below</option></select></label></div>
          <label data-layer-custom hidden>Custom z-index<input data-layer-z-index type="number" min="1" max="2147483647"></label>
        </section>
        <section class="section" data-step-only data-placement-section>
          <div class="eyebrow">Placement</div>
          <div data-for="anchored"><div class="placement-grid">${placementButton("top", "Top")}${placementButton("left", "Left")}${placementButton("auto", "Auto")}${placementButton("right", "Right")}${placementButton("bottom", "Bottom")}</div><label>Alignment<select data-alignment><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label><label>Offset<div class="number"><input data-offset type="number" min="0" max="100"><span>px</span></div></label></div>
          <div data-for="toast"><label>Position<select data-toast-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label><label>Auto-dismiss<div class="number"><input data-auto-dismiss type="number" min="500" placeholder="Disabled"><span>ms</span></div></label></div>
          <div data-for="modal"><label>Layout<select data-modal-layout><option value="center">Centered</option><option value="fullscreen">Fullscreen</option></select></label></div>
          <div data-for="backdrop"><label class="check"><input data-backdrop type="checkbox"> Backdrop</label><label>Backdrop opacity<input data-backdrop-opacity type="number" min="0" max="0.9" step="0.05"></label><label class="check"><input data-close-backdrop type="checkbox"> Dismiss on backdrop click</label></div>
          <div data-for="slideout"><label>Position<select data-slideout-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="center-left">Center left</option><option value="center-right">Center right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label></div>
          <div data-for="banner"><label>Position<select data-banner-position><option value="top">Top</option><option value="bottom">Bottom</option></select></label></div>
          <div data-for="cursor"><label>X offset<div class="number"><input data-cursor-x type="number"><span>px</span></div></label><label>Y offset<div class="number"><input data-cursor-y type="number"><span>px</span></div></label></div>
          <div data-for="hotspot"><label>Beacon style<select data-hotspot-style><option value="pulse">Pulse</option><option value="dot">Dot</option><option value="question">Question mark</option></select></label><label>Beacon color<input data-hotspot-color type="color"></label></div>
        </section>
        <section class="section" data-step-only data-step-summary hidden><div class="eyebrow">Step</div><dl><dt>Advances on</dt><dd data-advance></dd><dt>Dismissible</dt><dd data-dismissible></dd></dl></section>
        <section class="section" data-step-only><div class="eyebrow">Configured</div><dl data-configured></dl></section>
        <section class="section theme-panel" data-theme-section hidden>
          <div class="content-heading"><div><div class="eyebrow">Design system</div><strong>Experience theme</strong></div><button type="button" class="secondary-button compact" data-theme-reset>Reset to theme</button></div>
          <label>Base style<select data-theme-source><option value="template">Template defaults</option><option value="site">Match my website</option><option value="preset" disabled>Saved style</option><option value="minimal">Minimal</option><option value="modern">Modern</option><option value="soft">Soft</option><option value="dark">Dark</option></select></label>
          <label>Saved style<select data-saved-style><option value="">Choose saved style…</option>${(((_c = draft.references) == null ? void 0 : _c.stylePresets) ?? []).map((style) => `<option value="${escapeText(style.id)}">${escapeText(style.name)}</option>`).join("")}</select></label>
          <label>Primary<input type="color" data-theme-primary></label><label>Secondary / surface<input type="color" data-theme-secondary></label><label>Background<input type="color" data-theme-background></label><label>Text<input type="color" data-theme-text></label>
          <label>Body font<input type="text" maxlength="200" data-theme-body-font></label><label>Heading font<input type="text" maxlength="200" data-theme-heading-font></label>
          <label>Body size<div class="number"><input type="number" min="8" max="72" data-theme-body-size><span>px</span></div></label><label>Heading size<div class="number"><input type="number" min="10" max="72" data-theme-heading-size><span>px</span></div></label>
          <label>Radius<div class="number"><input type="number" min="0" max="48" data-theme-radius><span>px</span></div></label><label>Button radius<div class="number"><input type="number" min="0" max="48" data-theme-button-radius><span>px</span></div></label><label>Shadow<select data-theme-shadow><option value="theme">Theme shadow</option><option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option></select></label><label>Spacing<div class="number"><input type="number" min="0" max="64" data-theme-spacing><span>px</span></div></label>
          <label>Style name<input type="text" maxlength="80" placeholder="My product style" data-style-name></label><div class="history-row"><button type="button" class="secondary-button compact" data-style-save>Save style</button><button type="button" class="secondary-button compact" data-style-rename>Rename</button><button type="button" class="secondary-button compact" data-style-delete>Delete</button></div><p class="muted" data-style-status role="status"></p>
        </section>
        <details class="section live"><summary>Connection & target status</summary><div class="status-ok">✓ SDK/editor connected</div><div data-preview-status></div><div data-live-target></div><div class="status-ok">✓ Current page available</div><code data-current-path></code><div data-missing-selector hidden><span>Target selector</span><code></code><button class="secondary-button" type="button" data-pick>Reselect target</button></div></details>
        <p class="hint status-error" role="alert" data-content-error hidden></p>
        <div class="save-recovery" data-save-recovery hidden><button type="button" class="secondary-button" data-retry-save>Retry save</button><button type="button" class="secondary-button" data-reload-draft hidden>Reload latest</button><button type="button" class="secondary-button" data-export-draft>Copy / Export unsaved draft</button><button type="button" class="secondary-button" data-discard-draft>Discard and close</button><span data-recovery-message>Local edits are preserved.</span></div><p class="hint" data-mode-hint></p>
      </main>
    </aside>`;
  }
  stepButtons() {
    var _a, _b;
    const steps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps) ?? [];
    return steps.map((step, index) => `<button class="step" type="button" data-step="${index}" aria-label="Open step ${index + 1}"><span>${index + 1}</span><small>${escapeText("label" in step && typeof step.label === "string" && step.label.trim() ? step.label : "content" in step && step.content.heading.trim() ? step.content.heading : `Step ${index + 1}`)}</small><i data-step-icon>○</i></button>`).join("");
  }
  bindPanel() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F;
    const root2 = this.root;
    root2.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => this.setInspectorTab(button.dataset.inspectorTab)));
    (_a = root2.querySelector("[data-ai-form]")) == null ? void 0 : _a.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.sendAiPrompt();
    });
    (_b = root2.querySelector("[data-ai-cancel]")) == null ? void 0 : _b.addEventListener("click", () => this.cancelAiRequest());
    (_c = root2.querySelector("[data-ai-target]")) == null ? void 0 : _c.addEventListener("click", () => this.resolveAiGuideTarget());
    (_d = root2.querySelector("[data-ai-preview]")) == null ? void 0 : _d.addEventListener("click", () => this.checklist ? this.previewAiChecklistProposal() : this.survey ? this.previewAiSurveyProposal() : this.guide ? this.previewAiGuideProposal() : this.previewAiWidgetSourceProposal());
    (_e = root2.querySelector("[data-ai-apply]")) == null ? void 0 : _e.addEventListener("click", () => this.applyAiProposal());
    (_f = root2.querySelector("[data-ai-discard]")) == null ? void 0 : _f.addEventListener("click", () => this.discardAiProposal());
    root2.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => this.setMode(button.dataset.mode)));
    root2.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
      if (this.mode !== "target") this.setMode("target");
      else this.startPicker();
    }));
    (_g = root2.querySelector("[data-pick-layer]")) == null ? void 0 : _g.addEventListener("click", () => this.startLayerPicker());
    root2.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
    (_h = root2.querySelector("[data-minimize]")) == null ? void 0 : _h.addEventListener("click", () => {
      const aside = root2.querySelector("aside");
      aside.classList.toggle("minimized");
      root2.querySelector("[data-minimize]").setAttribute("aria-expanded", String(!aside.classList.contains("minimized")));
    });
    (_i = root2.querySelector("[data-save]")) == null ? void 0 : _i.addEventListener("click", () => void this.persist());
    (_j = root2.querySelector("[data-close]")) == null ? void 0 : _j.addEventListener("click", () => void this.close());
    (_k = root2.querySelector("[data-return-dashboard]")) == null ? void 0 : _k.addEventListener("click", () => {
      var _a2;
      (_a2 = window.opener) == null ? void 0 : _a2.focus();
      void this.close();
    });
    (_l = root2.querySelector("[data-retry-save]")) == null ? void 0 : _l.addEventListener("click", () => void this.persist());
    (_m = root2.querySelector("[data-reload-draft]")) == null ? void 0 : _m.addEventListener("click", () => {
      if (window.confirm("Reloading discards local edits. Copy / Export them first if you need them. Reload latest?")) {
        this.recoveryDraft = null;
        window.location.reload();
      }
    });
    (_n = root2.querySelector("[data-export-draft]")) == null ? void 0 : _n.addEventListener("click", () => this.exportRecovery());
    (_o = root2.querySelector("[data-discard-draft]")) == null ? void 0 : _o.addEventListener("click", () => {
      if (window.confirm("Discard unsaved edits and close?")) {
        this.recoveryDraft = null;
        this.destroy();
      }
    });
    (_p = root2.querySelector("[data-reset-preview]")) == null ? void 0 : _p.addEventListener("click", () => this.guide ? this.startGuidePreview() : this.renderPreview());
    (_q = root2.querySelector("[data-global-undo]")) == null ? void 0 : _q.addEventListener("click", () => this.globalUndo());
    (_r = root2.querySelector("[data-global-redo]")) == null ? void 0 : _r.addEventListener("click", () => this.globalRedo());
    (_s = root2.querySelector("[data-move-side]")) == null ? void 0 : _s.addEventListener("click", () => {
      var _a2;
      return (_a2 = root2.querySelector("aside")) == null ? void 0 : _a2.classList.toggle("left-side");
    });
    (_t = root2.querySelector("[data-select-step]")) == null ? void 0 : _t.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.selectStep();
    });
    root2.querySelectorAll("[data-edge]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.addEdge(button.dataset.edge);
    }));
    root2.querySelectorAll("[data-add-step]").forEach((button) => button.addEventListener("click", () => this.addGuideStep(button.dataset.addStep)));
    (_u = root2.querySelector("[data-add-current-step]")) == null ? void 0 : _u.addEventListener("click", () => this.addGuideStep(getGuideStepPattern(this.guide.steps[this.stepIndex])));
    (_v = root2.querySelector("[data-duplicate-step]")) == null ? void 0 : _v.addEventListener("click", () => this.duplicateGuideStep());
    (_w = root2.querySelector("[data-delete-step]")) == null ? void 0 : _w.addEventListener("click", () => this.deleteGuideStep());
    (_x = root2.querySelector("[data-step-left]")) == null ? void 0 : _x.addEventListener("click", () => this.moveGuideStep(-1));
    (_y = root2.querySelector("[data-step-right]")) == null ? void 0 : _y.addEventListener("click", () => this.moveGuideStep(1));
    (_z = root2.querySelector("[data-step-name]")) == null ? void 0 : _z.addEventListener("change", (event) => {
      if (!this.guide) return;
      this.guide.steps[this.stepIndex].label = event.currentTarget.value.trim().slice(0, 80) || void 0;
      this.changed();
      this.refreshStepBar();
    });
    (_A = root2.querySelector("[data-edit-component]")) == null ? void 0 : _A.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.editSelected();
      (_b2 = this.contentEditor) == null ? void 0 : _b2.editSelected();
    });
    root2.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.formatInline(button.dataset.format);
      (_b2 = this.contentEditor) == null ? void 0 : _b2.formatInline(button.dataset.format);
      this.syncContentInspector();
    }));
    root2.querySelectorAll("[data-list]").forEach((button) => button.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.toggleList(button.dataset.list);
      (_b2 = this.contentEditor) == null ? void 0 : _b2.toggleList(button.dataset.list);
      this.syncContentInspector();
    }));
    (_B = root2.querySelector("[data-text-align]")) == null ? void 0 : _B.addEventListener("change", (event) => {
      var _a2, _b2;
      const value = event.currentTarget.value;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.setAlignment(value);
      (_b2 = this.contentEditor) == null ? void 0 : _b2.setAlignment(value);
      this.syncContentInspector();
    });
    (_C = root2.querySelector("[data-apply-link]")) == null ? void 0 : _C.addEventListener("click", () => {
      var _a2, _b2;
      const input2 = root2.querySelector("[data-link-url]");
      const applied = input2 ? ((_a2 = this.compositionEditor) == null ? void 0 : _a2.applyLink(input2.value)) ?? ((_b2 = this.contentEditor) == null ? void 0 : _b2.applyLink(input2.value)) : false;
      if (input2 && !applied) {
        input2.setCustomValidity("Select text in a heading or body and use an HTTP(S), email, phone, relative, or hash URL.");
        input2.reportValidity();
      } else input2 == null ? void 0 : input2.setCustomValidity("");
      this.syncContentInspector();
    });
    (_D = root2.querySelector("[data-apply-image]")) == null ? void 0 : _D.addEventListener("click", () => {
      var _a2;
      const source = root2.querySelector("[data-image-src]");
      const alt = root2.querySelector("[data-image-alt]");
      if (source && alt && !((_a2 = this.contentEditor) == null ? void 0 : _a2.updateImage(source.value, alt.value))) source.setCustomValidity("Use an HTTP(S), relative, or supported data image URL.");
      else source == null ? void 0 : source.setCustomValidity("");
      this.syncContentInspector();
    });
    (_E = root2.querySelector("[data-undo]")) == null ? void 0 : _E.addEventListener("click", () => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.undo();
      this.syncContentInspector();
    });
    (_F = root2.querySelector("[data-redo]")) == null ? void 0 : _F.addEventListener("click", () => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.redo();
      this.syncContentInspector();
    });
    root2.addEventListener("pointerdown", (event) => {
      var _a2, _b2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.rememberSelection();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.rememberSelection();
      if (event.target instanceof Element && event.target.closest("[data-v2-format],[data-v2-list]")) event.preventDefault();
    }, true);
    root2.addEventListener("focusin", () => {
      var _a2, _b2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.rememberSelection();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.rememberSelection();
    }, true);
    root2.addEventListener("keydown", (rawEvent) => {
      var _a2;
      const event = rawEvent;
      if (event.key === "Escape") {
        (_a2 = this.contentEditor) == null ? void 0 : _a2.editSelected();
        event.preventDefault();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.persist();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        if (event.shiftKey) this.globalRedo();
        else this.globalUndo();
      }
    });
    this.bindDrag();
    this.bindStepBarDrag();
    this.bindThemeControls();
    this.bindCompositionInspector();
    this.bindGuideBehavior();
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
    root2.querySelectorAll("[data-placement]").forEach((button) => button.addEventListener("click", () => {
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
  bindCompositionInspector() {
    var _a, _b, _c, _d, _e;
    const root2 = this.root;
    const change = (selector, run) => {
      var _a2;
      return (_a2 = root2.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => run(event.currentTarget.value));
    };
    const number = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    change("[data-cell-direction]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ direction: value });
    });
    change("[data-cell-size]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      if (!cell) return;
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ sizing: value === "fixed" ? { mode: "fixed", value: 160 } : value === "hug" ? { mode: "hug" } : { mode: "flexible", weight: 1 } });
    });
    change("[data-cell-fixed]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ sizing: { mode: "fixed", value: Math.max(24, Math.min(1200, number(value, 160))) } });
    });
    change("[data-cell-align]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ align: value });
    });
    change("[data-cell-gap]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ gap: Math.max(0, Math.min(96, number(value, 0))) });
    });
    change("[data-cell-padding]", (value) => {
      var _a2;
      const padding = Math.max(0, Math.min(128, number(value, 0)));
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ padding: { top: padding, right: padding, bottom: padding, left: padding } });
    });
    change("[data-cell-background]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ style: { ...cell == null ? void 0 : cell.style, background: value } });
    });
    change("[data-cell-border]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ style: { ...cell == null ? void 0 : cell.style, borderWidth: Math.max(0, Math.min(16, number(value, 0))) } });
    });
    change("[data-cell-radius]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ style: { ...cell == null ? void 0 : cell.style, borderRadius: Math.max(0, Math.min(100, number(value, 0))) } });
    });
    (_a = root2.querySelector("[data-cell-stack]")) == null ? void 0 : _a.addEventListener("change", (event) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ responsiveStack: event.currentTarget.checked });
    });
    change("[data-block-align]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ align: value });
    });
    change("[data-block-font-size]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ fontSize: Math.max(10, Math.min(72, number(value, 15))) });
    });
    change("[data-block-line-height]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ lineHeight: Math.max(0.9, Math.min(3, number(value, 1.5))) });
    });
    change("[data-block-weight]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ weight: number(value, 400) });
    });
    change("[data-block-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    change("[data-button-label]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ label: value.trim().slice(0, 80) || "Button" });
    });
    change("[data-button-variant]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ variant: value });
    });
    change("[data-button-width]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ width: value });
    });
    change("[data-button-background]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ background: value });
    });
    change("[data-button-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    change("[data-button-padding-x]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ paddingX: Math.max(4, Math.min(48, number(value, 16))) });
    });
    change("[data-button-padding-y]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ paddingY: Math.max(4, Math.min(32, number(value, 9))) });
    });
    change("[data-button-radius]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ radius: Math.max(0, Math.min(48, number(value, 8))) });
    });
    change("[data-button-action]", (value) => {
      var _a2, _b2, _c2;
      if (value === "open_url") (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateButtonAction({ type: "open_url", url: "https://example.com" });
      else if (value === "track_event") (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateButtonAction({ type: "track_event", eventName: "button_clicked" });
      else (_c2 = this.compositionEditor) == null ? void 0 : _c2.updateButtonAction({ type: value });
    });
    change("[data-button-url]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateButtonAction({ type: "open_url", url: value.trim() });
    });
    change("[data-button-event]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateButtonAction({ type: "track_event", eventName: value.trim() });
    });
    change("[data-v2-image-src]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.setImageSource(value.trim());
    });
    (_b = root2.querySelector("[data-choose-image]")) == null ? void 0 : _b.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.chooseImageFile();
    });
    change("[data-v2-image-alt]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ alt: value.slice(0, 500) });
    });
    change("[data-image-fit]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ fit: value });
    });
    change("[data-image-width]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ width: Math.max(1, Math.min(100, number(value, 100))) });
    });
    change("[data-image-radius]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ radius: Math.max(0, Math.min(100, number(value, 0))) });
    });
    change("[data-divider-thickness]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ thickness: Math.max(1, Math.min(16, number(value, 1))) });
    });
    change("[data-divider-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    change("[data-spacer-size]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ size: Math.max(4, Math.min(240, number(value, 24))) });
    });
    change("[data-icon-name]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ icon: value });
    });
    change("[data-icon-size]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ size: Math.max(12, Math.min(96, number(value, 28))) });
    });
    change("[data-icon-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    root2.querySelectorAll("[data-v2-format]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.formatInline(button.dataset.v2Format);
    }));
    root2.querySelectorAll("[data-v2-list]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.toggleList(button.dataset.v2List);
    }));
    (_c = root2.querySelector("[data-v2-apply-link]")) == null ? void 0 : _c.addEventListener("click", () => {
      var _a2;
      const input2 = root2.querySelector("[data-v2-link-url]");
      if (input2 && !((_a2 = this.compositionEditor) == null ? void 0 : _a2.applyLink(input2.value))) {
        input2.setCustomValidity("Use an HTTP(S), email, phone, relative, or hash URL.");
        input2.reportValidity();
      } else input2 == null ? void 0 : input2.setCustomValidity("");
    });
    (_d = root2.querySelector("[data-v2-undo]")) == null ? void 0 : _d.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.undo();
    });
    (_e = root2.querySelector("[data-v2-redo]")) == null ? void 0 : _e.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.redo();
    });
  }
  ensureThemeState() {
    var _a;
    const owner = this.checklist ?? this.definition;
    if (owner.visualTheme) return owner.visualTheme;
    const design = ((_a = this.checklist) == null ? void 0 : _a.design) ?? this.definition.design;
    const base = cloneOnsite(design.theme.siteTheme ?? EXPERIENCE_PRESETS.modern);
    base.colors.background = design.theme.background;
    base.colors.text = design.theme.foreground;
    base.colors.primary = design.theme.primary;
    owner.visualTheme = { source: "template", templateTokens: cloneOnsite(base), baseTokens: cloneOnsite(base), overrides: {} };
    if (this.checklist) this.definition.visualTheme = owner.visualTheme;
    return owner.visualTheme;
  }
  applyVisualTheme(render = true) {
    var _a;
    const state = this.ensureThemeState(), tokens = resolvedTheme(state), radius = tokens.radii.md <= 6 ? "sm" : tokens.radii.md >= 18 ? "lg" : "md";
    const design = ((_a = this.checklist) == null ? void 0 : _a.design) ?? this.definition.design;
    design.theme = { background: tokens.colors.background, foreground: tokens.colors.text, primary: tokens.colors.primary, borderRadius: radius, ...state.overrides.spacing !== void 0 ? { spacing: state.overrides.spacing } : {}, siteTheme: tokens };
    if (this.checklist) {
      this.checklist.design = design;
      this.checklist.visualTheme = state;
      this.definition.design = design;
      this.definition.visualTheme = state;
    }
    if (render) this.changed();
  }
  bindThemeControls() {
    var _a, _b, _c, _d, _e, _f, _g;
    const root2 = this.root;
    this.ensureThemeState();
    this.applyVisualTheme(false);
    (_a = root2.querySelector("[data-theme-source]")) == null ? void 0 : _a.addEventListener("change", (event) => {
      var _a2, _b2;
      const value = event.currentTarget.value, state2 = this.ensureThemeState();
      if (value === "template") {
        state2.source = "template";
        state2.baseTokens = cloneOnsite(state2.templateTokens);
        delete state2.preset;
      } else if (value === "site") {
        const site = (_b2 = (_a2 = this.draft) == null ? void 0 : _a2.references) == null ? void 0 : _b2.siteTheme;
        if (!site) {
          this.setText("[data-style-status]", "No captured website theme is available.");
          return;
        }
        state2.source = "site";
        state2.baseTokens = cloneOnsite(site);
        delete state2.preset;
      } else {
        state2.source = "preset";
        state2.preset = value;
        state2.baseTokens = cloneOnsite(EXPERIENCE_PRESETS[state2.preset]);
      }
      this.applyVisualTheme();
    });
    const override = (key, value) => {
      const next = this.ensureThemeState();
      if (value === "" || value === void 0) delete next.overrides[key];
      else next.overrides[key] = value;
      this.applyVisualTheme();
    };
    const color = (selector, key) => {
      var _a2;
      return (_a2 = root2.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => override(key, event.currentTarget.value));
    };
    const textInput = (selector, key) => {
      var _a2;
      return (_a2 = root2.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => override(key, event.currentTarget.value.trim()));
    };
    const number = (selector, key, min, max) => {
      var _a2;
      return (_a2 = root2.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => {
        const value = Number(event.currentTarget.value);
        override(key, Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : void 0);
      });
    };
    color("[data-theme-primary]", "primary");
    color("[data-theme-secondary]", "secondary");
    color("[data-theme-background]", "background");
    color("[data-theme-text]", "text");
    textInput("[data-theme-body-font]", "bodyFontFamily");
    textInput("[data-theme-heading-font]", "headingFontFamily");
    number("[data-theme-body-size]", "bodyFontSize", 8, 72);
    number("[data-theme-heading-size]", "headingFontSize", 10, 72);
    number("[data-theme-radius]", "radius", 0, 48);
    number("[data-theme-button-radius]", "buttonRadius", 0, 48);
    number("[data-theme-spacing]", "spacing", 0, 64);
    (_b = root2.querySelector("[data-theme-shadow]")) == null ? void 0 : _b.addEventListener("change", (event) => {
      const mode = event.currentTarget.value;
      if (mode === "theme") return override("shadow", void 0);
      if (mode === "none") return override("shadow", { x: 0, y: 0, blur: 0, spread: 0, color: "transparent" });
      const source = this.ensureThemeState().baseTokens.shadows.md;
      override("shadow", { ...source, y: mode === "soft" ? Math.min(source.y, 10) : Math.max(source.y, 20), blur: mode === "soft" ? Math.min(source.blur, 28) : Math.max(source.blur, 56) });
    });
    (_c = root2.querySelector("[data-theme-reset]")) == null ? void 0 : _c.addEventListener("click", () => {
      this.ensureThemeState().overrides = {};
      this.applyVisualTheme();
      this.setText("[data-style-status]", "Experience overrides reset. Block and cell customizations were preserved.");
    });
    (_d = root2.querySelector("[data-saved-style]")) == null ? void 0 : _d.addEventListener("change", (event) => {
      var _a2, _b2, _c2;
      const style = (_c2 = (_b2 = (_a2 = this.draft) == null ? void 0 : _a2.references) == null ? void 0 : _b2.stylePresets) == null ? void 0 : _c2.find((item) => item.id === event.currentTarget.value);
      if (!style) return;
      const next = this.ensureThemeState();
      next.source = "preset";
      delete next.preset;
      next.baseTokens = cloneOnsite(style.tokens);
      this.applyVisualTheme();
      this.setText("[data-style-status]", `Applied ${style.name}.`);
    });
    (_e = root2.querySelector("[data-style-save]")) == null ? void 0 : _e.addEventListener("click", () => void this.saveCurrentStyle());
    (_f = root2.querySelector("[data-style-rename]")) == null ? void 0 : _f.addEventListener("click", () => void this.renameCurrentStyle());
    (_g = root2.querySelector("[data-style-delete]")) == null ? void 0 : _g.addEventListener("click", () => void this.deleteCurrentStyle());
  }
  async saveCurrentStyle() {
    var _a, _b;
    const name = (_b = (_a = this.root) == null ? void 0 : _a.querySelector("[data-style-name]")) == null ? void 0 : _b.value.trim();
    if (!name || !this.bridge) return this.setText("[data-style-status]", "Enter a style name.");
    try {
      const preset = await this.bridge.saveStyle(name, resolvedTheme(this.ensureThemeState()));
      const list2 = this.draft.references.stylePresets ?? (this.draft.references.stylePresets = []);
      list2.unshift(preset);
      this.refreshStyleOptions(preset.id);
      this.setText("[data-style-status]", "Style saved for this site.");
    } catch (error) {
      this.setText("[data-style-status]", error instanceof Error ? error.message : "Style could not be saved.");
    }
  }
  async renameCurrentStyle() {
    var _a, _b, _c, _d;
    const select = (_a = this.root) == null ? void 0 : _a.querySelector("[data-saved-style]"), name = (_c = (_b = this.root) == null ? void 0 : _b.querySelector("[data-style-name]")) == null ? void 0 : _c.value.trim();
    if (!(select == null ? void 0 : select.value) || !name || !this.bridge) return this.setText("[data-style-status]", "Choose a saved style and enter a new name.");
    try {
      const updated = await this.bridge.renameStyle(select.value, name), style = (_d = this.draft.references.stylePresets) == null ? void 0 : _d.find((item) => item.id === updated.id);
      if (style) style.name = updated.name;
      this.refreshStyleOptions(updated.id);
      this.setText("[data-style-status]", "Style renamed.");
    } catch {
      this.setText("[data-style-status]", "Style could not be renamed.");
    }
  }
  async deleteCurrentStyle() {
    var _a, _b;
    const select = (_a = this.root) == null ? void 0 : _a.querySelector("[data-saved-style]");
    if (!(select == null ? void 0 : select.value) || !this.bridge) return this.setText("[data-style-status]", "Choose a saved style first.");
    try {
      await this.bridge.deleteStyle(select.value);
      this.draft.references.stylePresets = ((_b = this.draft.references.stylePresets) == null ? void 0 : _b.filter((item) => item.id !== select.value)) ?? [];
      this.refreshStyleOptions();
      this.setText("[data-style-status]", "Style deleted.");
    } catch {
      this.setText("[data-style-status]", "Style could not be deleted.");
    }
  }
  refreshStyleOptions(selected = "") {
    var _a, _b, _c;
    const select = (_a = this.root) == null ? void 0 : _a.querySelector("[data-saved-style]");
    if (!select) return;
    select.innerHTML = '<option value="">Choose saved style…</option>' + (((_c = (_b = this.draft) == null ? void 0 : _b.references) == null ? void 0 : _c.stylePresets) ?? []).map((style) => `<option value="${escapeText(style.id)}">${escapeText(style.name)}</option>`).join("");
    select.value = selected;
  }
  syncThemeInspector() {
    var _a;
    if (!this.root || !this.definition) return;
    const state = this.ensureThemeState(), tokens = resolvedTheme(state);
    this.setValue("[data-theme-source]", state.source === "preset" && state.preset ? state.preset : state.source);
    this.setValue("[data-theme-primary]", tokens.colors.primary);
    this.setValue("[data-theme-secondary]", tokens.colors.surface);
    this.setValue("[data-theme-background]", tokens.colors.background);
    this.setValue("[data-theme-text]", tokens.colors.text);
    this.setValue("[data-theme-body-font]", tokens.typography.bodyFontFamily);
    this.setValue("[data-theme-heading-font]", tokens.typography.headingFontFamily);
    this.setValue("[data-theme-body-size]", String(tokens.typography.bodyFontSize));
    this.setValue("[data-theme-heading-size]", String(tokens.typography.headingFontSize));
    this.setValue("[data-theme-radius]", String(state.overrides.radius ?? tokens.radii.md));
    this.setValue("[data-theme-button-radius]", String(state.overrides.buttonRadius ?? tokens.radii.md));
    this.setValue("[data-theme-shadow]", ((_a = state.overrides.shadow) == null ? void 0 : _a.color) === "transparent" ? "none" : state.overrides.shadow ? "strong" : "theme");
    this.setValue("[data-theme-spacing]", String(state.overrides.spacing ?? 16));
    this.root.querySelectorAll("[data-device]").forEach((button) => button.classList.toggle("active", button.dataset.device === this.previewDevice));
  }
  guideBehaviorMarkup() {
    return `<div class="guide-behavior"><div class="eyebrow">Step behavior</div>
      <label>Advance when<select data-guide-trigger aria-label="Advance when"><option value="button">Guide button</option><option value="element_click">Website element click</option><option value="element_hover">Website element hover</option><option value="custom_event">Custom event</option><option value="route">Route change</option></select></label>
      <p class="muted" data-guide-trigger-help></p>
      <div data-guide-config="element"><label class="check"><input type="checkbox" data-guide-use-position> Use the positioning element</label><strong class="truncate" data-guide-interaction-label></strong><p class="muted" data-guide-interaction-status role="status"></p><button type="button" class="secondary-button" data-guide-pick-interaction>Select website element</button></div>
      <label data-guide-config="hover">Hover duration<div class="number"><input type="number" min="100" max="60000" step="100" data-guide-hover aria-label="Hover duration"><span>ms</span></div></label>
      <label data-guide-config="event">Event name<input type="text" maxlength="200" placeholder="e.g. project_created" data-guide-event aria-label="Guide event name"></label>
      <div data-guide-config="route"><label>Page matches<select data-guide-route-operator aria-label="Guide route comparison"><option value="equals">Exactly</option><option value="starts_with">Starts with</option><option value="ends_with">Ends with</option><option value="contains">Contains</option><option value="matches_pattern">Wildcard pattern</option></select></label><label>Page path<input type="text" maxlength="500" data-guide-route placeholder="/projects" aria-label="Guide route path"></label><p class="muted" data-guide-route-extra>Existing additional page rules are preserved.</p></div>
      <label>Show after<div class="number"><input type="number" min="0" max="30000" step="100" data-guide-delay aria-label="Presentation delay"><span>ms</span></div></label>
      <div data-guide-missing><label>Missing target<select data-guide-missing-action aria-label="Missing-target behavior"><option value="wait">Wait for target</option><option value="skip">Skip to next step</option><option value="dismiss">Dismiss Guide</option></select></label><label>Wait up to<div class="number"><input type="number" min="100" max="60000" step="100" data-guide-timeout aria-label="Target wait timeout"><span>ms</span></div></label><p class="muted">Wait pauses this Guide at the timeout. Navigation or reopening retries discovery.</p></div>
      <label class="check"><input type="checkbox" data-guide-dismissible> Allow visitors to dismiss</label>
    </div>`;
  }
  bindGuideBehavior() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!this.guide || !this.root) return;
    const change = (selector, run) => {
      var _a2;
      return (_a2 = this.root.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => {
        run(event.currentTarget.value);
        this.changed();
      });
    };
    const bounded = (value, min, max, fallback) => Math.max(min, Math.min(max, Math.round(numberValue(value, fallback))));
    change("[data-guide-trigger]", (value) => {
      const step = this.guide.steps[this.stepIndex];
      if ((value === "element_click" || value === "element_hover") && !guideStepRequiresTarget(step)) return;
      const old = step.advance;
      const target = (old == null ? void 0 : old.type) === "element_click" || (old == null ? void 0 : old.type) === "element_hover" ? old.target : void 0;
      step.advance = value === "custom_event" ? { type: value, eventName: (old == null ? void 0 : old.type) === value ? old.eventName : "" } : value === "route" ? { type: value, pageRules: (old == null ? void 0 : old.type) === value ? old.pageRules : [{ id: editorId("rule"), kind: "include", operator: "equals", value: currentPagePath() }] } : value === "element_hover" ? { type: value, durationMs: (old == null ? void 0 : old.type) === value ? old.durationMs : 500, ...target ? { target } : {} } : value === "element_click" ? { type: value, ...target ? { target } : {} } : { type: "button" };
    });
    change("[data-guide-hover]", (value) => {
      const advance = this.guide.steps[this.stepIndex].advance;
      if ((advance == null ? void 0 : advance.type) === "element_hover") advance.durationMs = bounded(value, 100, 6e4, 500);
    });
    change("[data-guide-event]", (value) => {
      const advance = this.guide.steps[this.stepIndex].advance;
      if ((advance == null ? void 0 : advance.type) === "custom_event") advance.eventName = value.trim();
    });
    const route = () => {
      const advance = this.guide.steps[this.stepIndex].advance;
      return (advance == null ? void 0 : advance.type) === "route" ? advance.pageRules.find((rule2) => rule2.kind === "include") : void 0;
    };
    change("[data-guide-route]", (value) => {
      const rule2 = route();
      if (rule2) rule2.value = value.trim();
    });
    change("[data-guide-route-operator]", (value) => {
      const rule2 = route();
      if (rule2) rule2.operator = value;
    });
    change("[data-guide-delay]", (value) => {
      const step = this.guide.steps[this.stepIndex];
      step.presentation = { ...step.presentation, delayMs: bounded(value, 0, 3e4, 0) };
    });
    const missing = () => {
      var _a2;
      const step = this.guide.steps[this.stepIndex];
      return step.presentation = { ...step.presentation, missingTarget: ((_a2 = step.presentation) == null ? void 0 : _a2.missingTarget) ?? { action: "wait", timeoutMs: 5e3 } };
    };
    change("[data-guide-missing-action]", (value) => {
      missing().missingTarget.action = value;
    });
    change("[data-guide-timeout]", (value) => {
      missing().missingTarget.timeoutMs = bounded(value, 100, 6e4, 5e3);
    });
    (_a = this.root.querySelector("[data-guide-use-position]")) == null ? void 0 : _a.addEventListener("change", (event) => {
      const advance = this.guide.steps[this.stepIndex].advance;
      if (event.currentTarget.checked && ((advance == null ? void 0 : advance.type) === "element_click" || (advance == null ? void 0 : advance.type) === "element_hover")) {
        delete advance.target;
        this.changed();
      } else this.pickGuideInteraction();
    });
    (_b = this.root.querySelector("[data-guide-pick-interaction]")) == null ? void 0 : _b.addEventListener("click", () => this.pickGuideInteraction());
    (_c = this.root.querySelector("[data-guide-dismissible]")) == null ? void 0 : _c.addEventListener("change", (event) => {
      this.guide.steps[this.stepIndex].behavior.dismissible = event.currentTarget.checked;
      this.changed();
    });
    (_d = this.root.querySelector("[data-preview-start]")) == null ? void 0 : _d.addEventListener("click", () => this.startGuidePreview());
    (_e = this.root.querySelector("[data-preview-reset]")) == null ? void 0 : _e.addEventListener("click", () => this.startGuidePreview());
    (_f = this.root.querySelector("[data-preview-next]")) == null ? void 0 : _f.addEventListener("click", () => this.advanceGuidePreview(1));
    (_g = this.root.querySelector("[data-preview-back]")) == null ? void 0 : _g.addEventListener("click", () => this.advanceGuidePreview(-1));
    (_h = this.root.querySelector("[data-preview-test]")) == null ? void 0 : _h.addEventListener("click", () => {
      var _a2;
      const advance = (_a2 = this.guide) == null ? void 0 : _a2.steps[this.stepIndex].advance;
      if (this.mode === "preview" && !this.guidePreviewComplete && ((advance == null ? void 0 : advance.type) === "custom_event" || (advance == null ? void 0 : advance.type) === "route")) this.advanceGuidePreview(1);
    });
  }
  pickGuideInteraction() {
    var _a, _b, _c, _d, _e;
    const step = (_a = this.guide) == null ? void 0 : _a.steps[this.stepIndex];
    if (!step || !this.flushContent() || !(((_b = step.advance) == null ? void 0 : _b.type) === "element_click" || ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover")) return;
    const generation = ++this.selectionGeneration;
    this.picker.cancel();
    (_d = this.contentEditor) == null ? void 0 : _d.destroy();
    this.contentEditor = null;
    (_e = this.compositionEditor) == null ? void 0 : _e.destroy();
    this.compositionEditor = null;
    this.previewGeneration++;
    this.preview.destroy();
    this.previewRendered = false;
    this.setText("[data-mode-hint]", "Select the website element that advances this step. Its positioning target stays unchanged. Escape cancels.");
    void this.picker.pick().then((target) => {
      var _a2, _b2, _c2, _d2;
      if (generation !== this.selectionGeneration || ((_b2 = (_a2 = this.guide) == null ? void 0 : _a2.steps[this.stepIndex]) == null ? void 0 : _b2.id) !== step.id) return;
      if (target && (((_c2 = step.advance) == null ? void 0 : _c2.type) === "element_click" || ((_d2 = step.advance) == null ? void 0 : _d2.type) === "element_hover")) {
        step.advance.target = { ...target, targetContext: { pagePath: currentPagePath() } };
        this.changed();
      } else {
        this.renderPreview();
        this.syncPanel();
      }
    });
  }
  syncGuideBehavior() {
    var _a, _b, _c, _d, _e;
    if (!this.root) return;
    const controls = this.root.querySelector("[data-guide-preview]");
    if (controls) controls.hidden = !this.guide || this.mode !== "preview";
    if (!this.guide) return;
    const step = this.guide.steps[this.stepIndex];
    const advance = step.advance;
    const type = (advance == null ? void 0 : advance.type) ?? "button";
    const anchored = guideStepRequiresTarget(step);
    this.setValue("[data-guide-trigger]", type);
    this.root.querySelectorAll("[data-guide-trigger] option").forEach((option) => {
      option.disabled = !anchored && ["element_click", "element_hover"].includes(option.value);
    });
    this.setText("[data-guide-trigger-help]", type === "button" ? "Buttons configured as Next step advance this Guide. Website click and hover triggers are available on Anchored Cards." : type === "element_click" ? "A click on the selected website element advances once; the normal click still works." : type === "element_hover" ? "Keep the pointer over the selected element for the specified duration." : type === "custom_event" ? "Advance when the SDK receives this exact event name." : "Advance on a future navigation matching this path. Use * for wildcard patterns.");
    this.root.querySelectorAll("[data-guide-config]").forEach((group) => {
      const config = group.dataset.guideConfig;
      group.hidden = config === "element" ? !["element_click", "element_hover"].includes(type) : config === "hover" ? type !== "element_hover" : config === "event" ? type !== "custom_event" : type !== "route";
    });
    const target = guideInteractionTarget(step);
    const hasTarget = (advance == null ? void 0 : advance.type) === "element_click" || (advance == null ? void 0 : advance.type) === "element_hover" ? Boolean(advance.target) : false;
    this.setChecked("[data-guide-use-position]", !hasTarget);
    this.setText("[data-guide-interaction-label]", (target == null ? void 0 : target.label) ?? (target == null ? void 0 : target.primarySelector) ?? "No element selected");
    let count = 0;
    if (target) try {
      count = document.querySelectorAll(target.primarySelector).length;
    } catch {
    }
    this.setText("[data-guide-interaction-status]", target ? `${capitalize(target.reliability)} selector · ${count} primary matches · ${this.targetStatus(target) === "found" ? "Found" : "Missing or on another page"}` : "Select an element or configure a positioning target first.");
    this.setValue("[data-guide-hover]", String((advance == null ? void 0 : advance.type) === "element_hover" ? advance.durationMs ?? 500 : 500));
    this.setValue("[data-guide-event]", (advance == null ? void 0 : advance.type) === "custom_event" ? advance.eventName : "");
    const rule2 = (advance == null ? void 0 : advance.type) === "route" ? advance.pageRules.find((item) => item.kind === "include") : void 0;
    this.setValue("[data-guide-route]", (rule2 == null ? void 0 : rule2.value) ?? "");
    this.setValue("[data-guide-route-operator]", (rule2 == null ? void 0 : rule2.operator) ?? "equals");
    this.root.querySelector("[data-guide-route-extra]").hidden = (advance == null ? void 0 : advance.type) !== "route" || advance.pageRules.length <= 1;
    this.setValue("[data-guide-delay]", String(((_a = step.presentation) == null ? void 0 : _a.delayMs) ?? 0));
    this.setValue("[data-guide-missing-action]", ((_c = (_b = step.presentation) == null ? void 0 : _b.missingTarget) == null ? void 0 : _c.action) ?? "wait");
    this.setValue("[data-guide-timeout]", String(((_e = (_d = step.presentation) == null ? void 0 : _d.missingTarget) == null ? void 0 : _e.timeoutMs) ?? 5e3));
    this.root.querySelector("[data-guide-missing]").hidden = !anchored;
    this.setChecked("[data-guide-dismissible]", step.behavior.dismissible ?? true);
    this.setText("[data-preview-step]", `${this.guidePreviewComplete ? "Complete · " : ""}${this.stepIndex + 1}/${this.guide.steps.length}`);
    this.root.querySelector("[data-preview-back]").disabled = this.stepIndex === 0;
    this.root.querySelector("[data-preview-next]").disabled = this.guidePreviewComplete;
    const test = this.root.querySelector("[data-preview-test]");
    test.hidden = !["custom_event", "route"].includes(type) || this.guidePreviewComplete;
    test.textContent = type === "route" ? "Simulate match" : "Test event";
  }
  previewTriggerHint() {
    var _a;
    const advance = (_a = this.guide) == null ? void 0 : _a.steps[this.stepIndex].advance;
    return this.guidePreviewComplete ? "Guide preview complete. Reset to start again." : (advance == null ? void 0 : advance.type) === "custom_event" ? `Waiting for “${advance.eventName}”. Test event is preview-only.` : (advance == null ? void 0 : advance.type) === "route" ? "Waiting for matching navigation. Simulate match does not navigate." : (advance == null ? void 0 : advance.type) === "element_click" ? "Click the configured website element." : (advance == null ? void 0 : advance.type) === "element_hover" ? "Hover over the configured website element." : "Click a Next step button.";
  }
  startGuidePreview() {
    if (!this.guide || !this.flushContent()) return;
    this.guidePreviewComplete = false;
    this.stepIndex = 0;
    if (this.mode !== "preview") this.setMode("preview");
    else {
      this.renderPreview();
      this.syncPanel();
    }
  }
  advanceGuidePreview(delta) {
    if (!this.guide || this.mode !== "preview" || this.guidePreviewComplete && delta > 0) return;
    if (this.stepIndex + delta >= this.guide.steps.length) {
      this.guidePreviewComplete = true;
      this.previewGeneration++;
      this.preview.destroy();
      this.previewRendered = false;
      this.syncGuideBehavior();
      this.setText("[data-trigger-status]", this.previewTriggerHint());
      return;
    }
    this.guidePreviewComplete = false;
    this.switchStep(this.stepIndex + delta);
  }
  addGuideStep(pattern) {
    if (!this.guide || !this.flushContent()) return;
    if (this.guide.steps.length >= 20) {
      this.showValidation(["A Guide can contain up to 20 steps."]);
      return;
    }
    const document2 = createOnsiteDocument(true);
    const builder = { version: 1, projectData: {}, html: "", css: "" };
    const compiled = applyOnsiteDocument(builder, document2, pattern);
    const step = { id: editorId("step"), label: pattern === "modal" ? "Modal step" : "Anchored step", pattern, content: compiled.content, builder, advance: { type: "button" }, behavior: pattern === "modal" ? { dismissible: true, layer: { mode: "always_on_top" } } : { placement: "auto", alignment: "center", offset: 8, pointer: { enabled: true, size: 10 }, dismissible: true, layer: { mode: "auto" } } };
    this.guide.steps.splice(this.stepIndex + 1, 0, step);
    this.stepIndex++;
    this.changed();
    this.refreshStepBar();
  }
  duplicateGuideStep() {
    if (!this.guide || !this.flushContent()) return;
    const source = this.guide.steps[this.stepIndex];
    const copy = cloneOnsite(source);
    copy.id = editorId("step");
    copy.label = `${source.label || source.content.heading || "Step"} copy`;
    const document2 = onsiteDocumentFromBuilder(copy.builder);
    if (document2 && copy.builder && !isSourceAuthored(copy.builder)) {
      const next = duplicateDocument(document2);
      const compiled = applyOnsiteDocument(copy.builder, next, getGuideStepPattern(copy));
      copy.content = compiled.content;
    }
    this.guide.steps.splice(this.stepIndex + 1, 0, copy);
    this.stepIndex++;
    this.changed();
    this.refreshStepBar();
  }
  deleteGuideStep() {
    if (!this.guide || this.guide.steps.length <= 1 || !window.confirm("Delete this Guide step?")) return;
    if (!this.flushContent()) return;
    this.guide.steps.splice(this.stepIndex, 1);
    this.stepIndex = Math.min(this.stepIndex, this.guide.steps.length - 1);
    this.changed();
    this.refreshStepBar();
  }
  moveGuideStep(delta) {
    if (!this.guide || !this.flushContent()) return;
    const next = this.stepIndex + delta;
    if (next < 0 || next >= this.guide.steps.length) return;
    const [step] = this.guide.steps.splice(this.stepIndex, 1);
    this.guide.steps.splice(next, 0, step);
    this.stepIndex = next;
    this.changed();
    this.refreshStepBar();
  }
  refreshStepBar() {
    var _a, _b, _c;
    const flow = (_a = this.root) == null ? void 0 : _a.querySelector("[data-step-flow]");
    if (!flow) return;
    flow.innerHTML = this.stepButtons();
    flow.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
    const remove = (_b = this.root) == null ? void 0 : _b.querySelector("[data-step-bar-actions] [data-delete-step]");
    if (remove) remove.disabled = !this.guide || this.guide.steps.length <= 1;
    const add = (_c = this.root) == null ? void 0 : _c.querySelector("[data-add-current-step]");
    if (add && this.guide) add.title = `Add a ${getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal" ? "Modal" : "Anchored"} step`;
    this.syncPanel();
  }
  bindDrag() {
    var _a, _b;
    const handle = (_a = this.root) == null ? void 0 : _a.querySelector("[data-drag-handle]");
    const aside = (_b = this.root) == null ? void 0 : _b.querySelector("[data-editor-toolbar]");
    if (!handle || !aside) return;
    handle.addEventListener("pointerdown", (event) => {
      var _a2;
      if (event.target.closest("button")) return;
      const rect = aside.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      let frame = 0;
      const move = (next) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          aside.style.right = "auto";
          aside.style.transform = "none";
          aside.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
          aside.style.top = `${Math.max(4, Math.min(innerHeight - rect.height - 4, rect.top + next.clientY - startY))}px`;
        });
      };
      const stop = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        this.dragCleanup = null;
      };
      (_a2 = this.dragCleanup) == null ? void 0 : _a2.call(this);
      this.dragCleanup = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    });
  }
  bindStepBarDrag() {
    var _a, _b;
    const handle = (_a = this.root) == null ? void 0 : _a.querySelector("[data-step-drag-handle]");
    const bar = (_b = this.root) == null ? void 0 : _b.querySelector("[data-guide]");
    if (!handle || !bar) return;
    handle.addEventListener("pointerdown", (event) => {
      var _a2;
      const rect = bar.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      let frame = 0;
      const move = (next) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          bar.style.right = "auto";
          bar.style.bottom = "auto";
          bar.style.transform = "none";
          bar.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
          bar.style.top = `${Math.max(4, Math.min(innerHeight - rect.height - 4, rect.top + next.clientY - startY))}px`;
        });
      };
      const stop = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        this.dragCleanup = null;
      };
      (_a2 = this.dragCleanup) == null ? void 0 : _a2.call(this);
      this.dragCleanup = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
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
    var _a, _b, _c, _d;
    const steps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    if (!steps || index < 0 || index >= steps.length || index === this.stepIndex) return;
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    (_c = this.contentEditor) == null ? void 0 : _c.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_d = this.compositionEditor) == null ? void 0 : _d.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
    if (this.dirty) void this.persist();
    this.stepIndex = index;
    this.updateContinuation();
    this.syncPanel();
    this.applyMode();
  }
  setMode(mode) {
    var _a, _b, _c;
    if (mode === "design" && ((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite") return;
    if (this.mode === mode && (mode !== "target" || this.pickerIsSelecting())) return;
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    (_b = this.contentEditor) == null ? void 0 : _b.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_c = this.compositionEditor) == null ? void 0 : _c.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
    if (this.dirty) void this.persist();
    this.mode = mode;
    this.guidePreviewComplete = false;
    this.configureDiagnostics();
    this.updateContinuation();
    this.applyMode();
  }
  applyMode() {
    var _a;
    if (this.mode === "navigate") {
      this.previewGeneration++;
      (_a = this.checklistEditor) == null ? void 0 : _a.destroyView();
      this.preview.destroy();
      this.previewRendered = false;
      this.syncPanel();
      return;
    }
    this.renderPreview();
    this.syncPanel();
    if (this.mode === "target") this.startPicker();
  }
  startPicker() {
    if (!this.isTargetedType() || this.mode !== "target") return;
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
    if (this.mode === "navigate" || this.mode === "preview") this.mode = "target";
    const generation = ++this.selectionGeneration;
    this.picker.cancel();
    this.setText("[data-mode-hint]", "Select the page element this experience should appear above or below");
    void this.picker.pick().then((target) => {
      if (generation !== this.selectionGeneration || !this.definition || !target) return;
      const current = this.currentLayer();
      this.setLayer({ mode: "relative", relation: (current == null ? void 0 : current.mode) === "relative" ? current.relation : "above", target: { ...target, targetContext: { pagePath: currentPagePath() } } });
      this.changed();
    });
  }
  pickerIsSelecting() {
    return !!document.querySelector("[data-movcues-picker-overlay]");
  }
  changed(render = true, preserveAiHistory = false) {
    var _a, _b;
    if (this.saveState === "expired") return;
    if (!render && !((_a = this.compositionEditor) == null ? void 0 : _a.isComposing())) (_b = this.compositionEditor) == null ? void 0 : _b.flush();
    this.recordHistory();
    this.dirty = true;
    this.editGeneration++;
    this.updateContinuation();
    if (render) this.syncPanel();
    else {
      this.syncContentInspector();
      this.syncCompositionInspector();
    }
    if (render && this.mode !== "navigate") this.renderPreview();
    if (this.saveState !== "conflict" && this.saveState !== "failed") this.saveState = this.saveInFlight ? "saving" : "dirty";
    this.showSaveState();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 350);
  }
  flushContent() {
    var _a, _b, _c;
    if (this.contentEditor && !this.contentEditor.flush()) {
      this.setText("[data-save-state]", "Finish composing text before continuing");
      return false;
    }
    const errors = ((_a = this.contentEditor) == null ? void 0 : _a.getValidation()) ?? [];
    if (this.compositionEditor && !this.compositionEditor.flush()) {
      const compositionErrors = this.compositionEditor.getValidation();
      this.showValidation(compositionErrors);
      return false;
    }
    const allErrors = [...errors, ...((_b = this.compositionEditor) == null ? void 0 : _b.getValidation()) ?? [], ...((_c = this.guide) == null ? void 0 : _c.steps.flatMap(guideStepConfigurationErrors)) ?? [], ...this.survey ? surveyBranchErrors(this.survey) : []];
    this.showValidation(allErrors);
    if (!allErrors.length) this.recordHistory();
    return !allErrors.length;
  }
  showValidation(errors) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector("[data-content-error]");
    if (element) {
      element.hidden = !errors.length;
      element.textContent = errors.join(" ");
    }
  }
  showSaveState() {
    var _a, _b, _c, _d;
    const labels = { clean: "Draft saved", dirty: "Unsaved", saving: "Saving…", failed: "Save failed", conflict: "Conflict · reload required", expired: "Session expired · export unsaved edits" };
    this.setText("[data-save-state]", labels[this.saveState]);
    const save = (_a = this.root) == null ? void 0 : _a.querySelector("[data-save]");
    if (save) save.disabled = !this.dirty || ["saving", "conflict", "expired"].includes(this.saveState);
    const recovering = ["failed", "conflict", "expired"].includes(this.saveState);
    const recovery = (_b = this.root) == null ? void 0 : _b.querySelector("[data-save-recovery]");
    if (recovery) recovery.hidden = !recovering;
    const retry = (_c = this.root) == null ? void 0 : _c.querySelector("[data-retry-save]");
    if (retry) retry.hidden = this.saveState !== "failed";
    const reload = (_d = this.root) == null ? void 0 : _d.querySelector("[data-reload-draft]");
    if (reload) reload.hidden = !["conflict", "expired"].includes(this.saveState);
    this.setText("[data-recovery-message]", "Local edits remain in memory in this tab. Export before reloading or leaving.");
  }
  captureRecovery() {
    var _a, _b, _c, _d, _e, _f;
    if (!this.definition || !this.dirty && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing()) && !((_b = this.compositionEditor) == null ? void 0 : _b.isComposing())) return;
    const definition = JSON.parse(JSON.stringify(this.checklist ?? this.definition));
    const snapshot = ((_c = this.compositionEditor) == null ? void 0 : _c.snapshot()) ?? ((_d = this.contentEditor) == null ? void 0 : _d.snapshot());
    if (snapshot) {
      const part = isGuideDefinition(definition) ? definition.steps[this.stepIndex] : "survey" in definition && definition.survey ? definition.survey.steps[this.stepIndex] : definition;
      part.builder = snapshot.builder;
      if (!isChecklistDefinition(part)) part.content = snapshot.content;
    }
    this.recoveryDraft = JSON.stringify({ experienceId: (_e = this.draft) == null ? void 0 : _e.experience.id, revision: (_f = this.draft) == null ? void 0 : _f.version.revision, definition }, null, 2);
  }
  exportRecovery() {
    var _a, _b, _c;
    (_a = this.contentEditor) == null ? void 0 : _a.flush();
    if (this.saveState !== "expired" || !this.recoveryDraft) this.captureRecovery();
    if (!this.recoveryDraft) return;
    let output = (_b = this.root) == null ? void 0 : _b.querySelector("[data-recovery-export]");
    if (!output && this.root) {
      output = document.createElement("textarea");
      output.dataset.recoveryExport = "";
      output.setAttribute("aria-label", "Unsaved draft JSON; copy and save before leaving");
      output.readOnly = true;
      (_c = this.root.querySelector("main")) == null ? void 0 : _c.append(output);
    }
    if (output) {
      output.value = this.recoveryDraft;
      output.focus();
      output.select();
    }
  }
  expireSession() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    if (this.saveState === "expired") return;
    (_a = this.contentEditor) == null ? void 0 : _a.flush();
    (_b = this.compositionEditor) == null ? void 0 : _b.flush();
    this.captureRecovery();
    this.dirty = this.dirty || !!((_c = this.contentEditor) == null ? void 0 : _c.isComposing()) || !!((_d = this.compositionEditor) == null ? void 0 : _d.isComposing());
    this.saveState = "expired";
    this.lifecycle++;
    clearTimeout(this.saveTimer);
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    (_e = this.contentEditor) == null ? void 0 : _e.destroy();
    this.contentEditor = null;
    (_f = this.compositionEditor) == null ? void 0 : _f.destroy();
    this.compositionEditor = null;
    this.previewGeneration++;
    this.preview.destroy();
    this.previewRendered = false;
    this.picker.cancel();
    (_g = this.mutationObserver) == null ? void 0 : _g.disconnect();
    (_h = this.routeUnsubscribe) == null ? void 0 : _h.call(this);
    this.routeObserver.stop();
    this.bridge = null;
    this.session = null;
    clearEditorContinuation();
    (_i = this.root) == null ? void 0 : _i.querySelectorAll("button,input,select").forEach((control) => {
      if (!control.matches("[data-export-draft],[data-discard-draft],[data-reload-draft],[data-minimize],[data-close]")) control.disabled = true;
    });
    this.showSaveState();
  }
  async persist() {
    var _a;
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!this.flushContent()) return false;
    if (this.saveState === "conflict" || this.saveState === "expired") return false;
    if (this.saveInFlight) {
      const saved2 = await this.saveInFlight;
      return saved2 && this.dirty ? this.persist() : saved2;
    }
    if (!this.dirty || !this.bridge || !this.definition) return true;
    const bridge = this.bridge;
    const generation = this.editGeneration;
    const lifecycle = this.lifecycle;
    const definition = JSON.parse(JSON.stringify(this.checklist ?? this.definition));
    const revision = ((_a = this.draft) == null ? void 0 : _a.version.revision) ?? 1;
    this.saveState = "saving";
    this.showSaveState();
    const request = bridge.save(definition, revision).then((version) => {
      var _a2, _b;
      if (lifecycle !== this.lifecycle) return false;
      if (this.draft) this.draft.version.revision = version.revision;
      this.dirty = this.editGeneration !== generation;
      this.saveState = this.dirty ? "dirty" : "clean";
      if (!this.dirty) {
        this.recoveryDraft = null;
        (_b = (_a2 = this.root) == null ? void 0 : _a2.querySelector("[data-recovery-export]")) == null ? void 0 : _b.remove();
      }
      this.showSaveState();
      return true;
    }).catch((error) => {
      if (lifecycle !== this.lifecycle) return false;
      this.dirty = true;
      this.captureRecovery();
      if (error instanceof EditorSessionExpiredError) {
        this.expireSession();
        return false;
      }
      this.saveState = error instanceof DraftConflictError ? "conflict" : "failed";
      this.showSaveState();
      this.setText("[data-recovery-message]", `${error instanceof Error ? error.message : "Request failed"}. Local edits remain in this tab; retry or export.`);
      return false;
    });
    this.saveInFlight = request;
    const saved = await request;
    if (this.saveInFlight === request) this.saveInFlight = null;
    if (saved && this.dirty) return this.persist();
    return saved;
  }
  async close() {
    if (!this.flushContent()) return;
    if ((this.dirty || this.saveInFlight) && !await this.persist()) return;
    this.destroy();
  }
  renderPreview() {
    var _a, _b, _c, _d, _e, _f;
    if (!this.definition || !this.draft || this.mode === "navigate" || this.saveState === "expired") return;
    if (!this.flushContent()) return;
    const generation = ++this.previewGeneration;
    if (this.mode === "preview" && this.guide) this.guidePreviewEntryPath = currentPagePath();
    this.previewRendered = false;
    (_a = this.contentEditor) == null ? void 0 : _a.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_b = this.compositionEditor) == null ? void 0 : _b.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
    if (this.checklist && this.checklistEditor) {
      this.preview.destroy();
      this.previewRendered = this.checklistEditor.render(this.draft.experience.id, this.draft.version.id, this.mode === "preview");
      this.applyPreviewDevice();
      if (this.mode === "design" && this.previewRendered) this.attachContentEditor();
      this.updateDiagnostics();
      return;
    }
    const definition = this.definition;
    const rendered = JSON.parse(JSON.stringify(definition));
    if (this.mode !== "preview") {
      if (isGuideDefinition(rendered)) rendered.steps.forEach((step) => {
        step.behavior.dismissible = false;
        step.advance = { type: "button" };
        delete step.presentation;
      });
      else {
        rendered.behavior = { ...rendered.behavior, autoDismissMs: null, dismissible: false, closeOnBackdrop: false };
      }
    }
    if (this.mode === "target") {
      if (isGuideDefinition(rendered)) rendered.steps.forEach((step) => {
        step.behavior.backdrop = false;
      });
      else if (this.draft.experience.widgetType === "anchored_card") rendered.behavior.backdrop = false;
    }
    const selectedStepId = ((_d = (_c = this.guide) == null ? void 0 : _c.steps[this.stepIndex]) == null ? void 0 : _d.id) ?? (this.mode === "preview" ? void 0 : (_f = (_e = this.survey) == null ? void 0 : _e.steps[this.stepIndex]) == null ? void 0 : _f.id);
    this.preview.render({
      id: this.draft.experience.id,
      versionId: this.draft.version.id,
      kind: this.draft.experience.kind,
      // Freeze cursor-follow cards using the stationary toast shell only while authoring.
      widgetType: this.mode !== "preview" && this.draft.experience.widgetType === "cursor_follow" ? "toast" : this.draft.experience.widgetType,
      priority: 0,
      definition: rendered
    }, {
      onVisible: () => {
        var _a2;
        if (generation !== this.previewGeneration || this.saveState === "expired" || !this.root) return;
        const host = Array.from(document.querySelectorAll("[data-movcues-experience]")).find((element) => {
          var _a3;
          return element.dataset.movcuesExperience === ((_a3 = this.draft) == null ? void 0 : _a3.experience.id);
        });
        (_a2 = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _a2.addEventListener("click", (event) => {
          var _a3, _b2;
          if ((_b2 = (_a3 = event.target) == null ? void 0 : _a3.closest) == null ? void 0 : _b2.call(_a3, "a")) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
        this.previewRendered = true;
        this.applyPreviewDevice();
        if (this.mode === "design") this.attachContentEditor();
        this.updateDiagnostics();
      },
      onDismiss: () => {
        this.previewRendered = false;
        this.setText("[data-trigger-status]", "Preview closed. Start or Reset to try again.");
        this.updateDiagnostics();
      },
      onAction: () => void 0,
      onGuideAdvance: () => {
        if (this.mode === "preview" && this.guide) this.advanceGuidePreview(1);
      },
      onGuideBack: () => {
        if (this.mode === "preview" && this.guide) this.advanceGuidePreview(-1);
      },
      onGuideStatus: (status) => {
        if (generation === this.previewGeneration && this.mode === "preview") this.setText("[data-trigger-status]", status === "delay" ? "Waiting for presentation delay…" : status === "waiting" ? "Waiting for a website element…" : status === "unavailable" ? "Target missing; use Next, Reset or reselect the target." : this.previewTriggerHint());
      },
      onSurveySubmit: this.mode === "preview" && this.survey ? () => {
        this.setText("[data-preview-limit]", "Preview complete. No response or production analytics were sent. Website interactions can still run your site's JavaScript.");
      } : void 0,
      onComplete: () => {
        this.previewRendered = false;
        this.updateDiagnostics();
      },
      onUnavailable: () => {
        this.previewRendered = false;
        this.updateDiagnostics();
      }
    }, selectedStepId);
    this.updateDiagnostics();
  }
  applyPreviewDevice() {
    var _a;
    if (!this.draft) return;
    const host = Array.from(document.querySelectorAll("[data-movcues-experience],[data-movcues-checklist]")).find((element) => (element.dataset.movcuesExperience ?? element.dataset.movcuesChecklist) === this.draft.experience.id), surface = (_a = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _a.querySelector(".card,.movcues-widget");
    if (!surface) return;
    if (surface.dataset.movcuesOriginalMaxWidth === void 0) surface.dataset.movcuesOriginalMaxWidth = surface.style.maxWidth;
    const width = this.previewDevice === "mobile" ? 360 : this.previewDevice === "tablet" ? 720 : null;
    if (width) {
      surface.style.maxWidth = `min(${width}px, calc(100vw - 16px))`;
      surface.dataset.movcuesViewportPreview = this.previewDevice;
    } else {
      surface.style.maxWidth = surface.dataset.movcuesOriginalMaxWidth;
      delete surface.dataset.movcuesViewportPreview;
    }
  }
  attachContentEditor() {
    var _a, _b, _c;
    if (((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite" || this.mode !== "design") return;
    const host = Array.from(document.querySelectorAll("[data-movcues-experience],[data-movcues-checklist]")).find(
      (element) => (element.dataset.movcuesExperience ?? element.dataset.movcuesChecklist) === this.draft.experience.id
    );
    const builder = this.currentBuilder();
    const content = this.currentContent();
    if (!(host == null ? void 0 : host.shadowRoot) || !builder || !content) return;
    if (document.body && !document.body.contains(host)) document.body.appendChild(host);
    (_b = this.contentEditor) == null ? void 0 : _b.destroy();
    (_c = this.compositionEditor) == null ? void 0 : _c.destroy();
    try {
      this.compositionEditor = new OnsiteCompositionEditor(host.shadowRoot, builder, content, this.checklist ? "checklist" : this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : this.draft.experience.widgetType ?? "modal", Boolean(this.guide), {
        onPatch: () => {
          var _a2;
          (_a2 = this.checklistEditor) == null ? void 0 : _a2.applyDesign(this.draft.experience.id);
        },
        onChange: (typing) => {
          this.historyTyping = Boolean(typing);
          try {
            this.syncOnsiteAnchoredPointer(host.shadowRoot, builder);
            this.changed(false);
          } finally {
            this.historyTyping = false;
          }
        },
        onValidation: (errors) => this.showValidation(errors),
        onImageStatus: (message) => this.setText("[data-image-status]", message),
        onSelectionChange: (selection) => {
          var _a2, _b2, _c2, _d;
          this.history.endGroup();
          if (this.checklist && selection.kind !== "step") {
            (_b2 = (_a2 = this.root) == null ? void 0 : _a2.querySelector("aside")) == null ? void 0 : _b2.classList.remove("minimized");
            (_d = (_c2 = this.root) == null ? void 0 : _c2.querySelector("[data-minimize]")) == null ? void 0 : _d.setAttribute("aria-expanded", "true");
          }
          this.compositionSelection = selection;
          this.recordHistory();
          this.syncCompositionInspector();
          this.syncAiPanel();
        },
        onUndo: () => this.globalUndo(),
        onRedo: () => this.globalRedo(),
        canUndo: () => this.history.canUndo(),
        canRedo: () => this.history.canRedo(),
        onTransaction: () => this.recordHistory()
      }, this.survey ? { config: this.survey, step: this.survey.steps[this.stepIndex] } : void 0, this.checklist ?? void 0);
      this.compositionEditor.start();
      if (this.preferredSelection) {
        this.compositionEditor.restoreSelection(this.preferredSelection);
        this.preferredSelection = null;
      }
      this.syncOnsiteAnchoredPointer(host.shadowRoot, builder);
      return;
    } catch (error) {
      this.showValidation([error instanceof Error ? error.message : "This layout could not be converted safely."]);
      this.compositionEditor = null;
    }
    if (isSourceAuthored(builder)) {
      this.contentEditor = null;
      this.compositionSelection = { kind: "step", label: "Source design" };
      this.syncCompositionInspector();
      this.syncAiPanel();
      return;
    }
    this.contentEditor = new OnsiteContentEditor(host.shadowRoot, builder, content, {
      onChange: () => this.changed(false),
      onValidation: (errors) => this.showValidation(errors),
      onSelectionChange: (selection) => {
        this.componentSelection = selection;
        this.syncContentInspector();
      }
    });
    this.contentEditor.start();
  }
  syncOnsiteAnchoredPointer(root2, builder) {
    var _a, _b;
    const pointer = root2.querySelector(".movcues-anchor-pointer");
    if (!pointer) return;
    const color = (_b = (_a = onsiteDocumentFromBuilder(builder)) == null ? void 0 : _a.root.style) == null ? void 0 : _b.background;
    if (color) {
      if (pointer.dataset.movcuesAuthoringPointerColor === void 0) pointer.dataset.movcuesAuthoringPointerColor = pointer.style.color;
      pointer.style.setProperty("color", color, "important");
    } else if (pointer.dataset.movcuesAuthoringPointerColor !== void 0) {
      pointer.style.setProperty("color", pointer.dataset.movcuesAuthoringPointerColor);
      delete pointer.dataset.movcuesAuthoringPointerColor;
    }
  }
  currentBuilder() {
    var _a, _b;
    if (!this.definition) return void 0;
    if (this.guide) return (_a = this.guide.steps[this.stepIndex]) == null ? void 0 : _a.builder;
    if (this.survey) return (_b = this.survey.steps[this.stepIndex]) == null ? void 0 : _b.builder;
    return this.definition.builder;
  }
  currentContent() {
    var _a, _b;
    if (!this.definition) return void 0;
    if (this.guide) return (_a = this.guide.steps[this.stepIndex]) == null ? void 0 : _a.content;
    if (this.survey) return (_b = this.survey.steps[this.stepIndex]) == null ? void 0 : _b.content;
    return this.definition.content;
  }
  syncContentInspector() {
    var _a, _b;
    if (!this.root) return;
    const selection = this.componentSelection;
    const inspector = this.root.querySelector("[data-content-inspector]");
    if (!inspector) return;
    inspector.hidden = this.mode !== "design" || !selection;
    if (!selection) return;
    this.setText("[data-component-label]", `${capitalize(selection.label)}${selection.editing ? " · Editing" : ""}`);
    this.root.querySelectorAll("[data-text-controls]").forEach((element) => {
      element.hidden = selection.kind === "image";
    });
    const imageControls = this.root.querySelector("[data-image-controls]");
    if (imageControls) imageControls.hidden = selection.kind !== "image";
    const edit = this.root.querySelector("[data-edit-component]");
    if (edit) edit.hidden = selection.kind === "image";
    this.root.querySelectorAll("[data-list]").forEach((button) => {
      button.disabled = selection.kind !== "text" || selection.label !== "body";
    });
    const link = this.root.querySelector("[data-apply-link]");
    if (link) link.disabled = selection.kind !== "text";
    if (selection.kind === "image") {
      this.setValue("[data-image-src]", selection.src ?? "");
      this.setValue("[data-image-alt]", selection.alt ?? "");
    }
    const undo = this.root.querySelector("[data-undo]");
    if (undo) undo.disabled = !((_a = this.contentEditor) == null ? void 0 : _a.canUndo());
    const redo = this.root.querySelector("[data-redo]");
    if (redo) redo.disabled = !((_b = this.contentEditor) == null ? void 0 : _b.canRedo());
  }
  syncCompositionInspector() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    (_a = this.surveyEditor) == null ? void 0 : _a.sync();
    (_b = this.checklistEditor) == null ? void 0 : _b.sync();
    if (!this.root) return;
    const editor = this.compositionEditor;
    const selection = this.compositionSelection;
    const inspector = this.root.querySelector("[data-composition-inspector]");
    if (!inspector) return;
    const globalUndo = this.root.querySelector("[data-global-undo]");
    const globalRedo = this.root.querySelector("[data-global-redo]");
    if (globalUndo) globalUndo.disabled = !this.history.canUndo() && !((_c = this.contentEditor) == null ? void 0 : _c.canUndo());
    if (globalRedo) globalRedo.disabled = !this.history.canRedo() && !((_d = this.contentEditor) == null ? void 0 : _d.canRedo());
    inspector.hidden = this.mode !== "design" || !editor || !selection;
    this.root.querySelector("[data-content-inspector]").hidden = Boolean(editor) || this.mode !== "design" || !this.componentSelection;
    if (!editor || !selection) return;
    if (selection.kind === "step") this.syncGuideBehavior();
    this.setText("[data-composition-label]", selection.label);
    this.root.querySelectorAll("[data-step-only]").forEach((group) => {
      if (selection.kind !== "step") group.hidden = true;
    });
    if (selection.kind === "step") this.root.querySelectorAll("[data-step-only]").forEach((group) => {
      group.hidden = group.hasAttribute("data-for") ? !this.isTargetedType() : group.hasAttribute("data-step-summary") ? !this.guide : group.hasAttribute("data-placement-section") ? Boolean(this.guide && getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal") : false;
    });
    const stepName = (_e = this.root.querySelector("[data-step-name]")) == null ? void 0 : _e.closest("label");
    if (stepName) stepName.hidden = !this.guide;
    this.root.querySelectorAll("[data-inspector]").forEach((group) => {
      group.hidden = group.dataset.inspector !== selection.kind;
    });
    const step = (_f = this.guide) == null ? void 0 : _f.steps[this.stepIndex];
    this.setValue("[data-step-name]", (step == null ? void 0 : step.label) ?? (step == null ? void 0 : step.content.heading) ?? "");
    const cell = editor.getSelectedCell();
    if (cell) {
      this.setValue("[data-cell-direction]", cell.direction);
      this.setValue("[data-cell-size]", cell.sizing.mode);
      this.setValue("[data-cell-fixed]", String(cell.sizing.mode === "fixed" ? cell.sizing.value : 160));
      this.root.querySelector("[data-fixed-size]").hidden = cell.sizing.mode !== "fixed";
      this.setValue("[data-cell-align]", cell.align);
      this.setValue("[data-cell-gap]", String(cell.gap));
      this.setValue("[data-cell-padding]", String(cell.padding.top));
      this.setValue("[data-cell-background]", ((_g = cell.style) == null ? void 0 : _g.background) && /^#[0-9a-f]{6}$/i.test(cell.style.background) ? cell.style.background : "#ffffff");
      this.setValue("[data-cell-border]", String(((_h = cell.style) == null ? void 0 : _h.borderWidth) ?? 0));
      this.setValue("[data-cell-radius]", String(((_i = cell.style) == null ? void 0 : _i.borderRadius) ?? 0));
      this.setChecked("[data-cell-stack]", Boolean(cell.responsiveStack));
    }
    const block = editor.getSelectedBlock();
    this.root.querySelectorAll("[data-block]").forEach((group) => {
      group.hidden = !block || !group.dataset.block.split(",").includes(block.type);
    });
    if (block) {
      this.setValue("[data-block-align]", block.align ?? "left");
      if (block.type === "heading" || block.type === "text") {
        this.setValue("[data-block-font-size]", String(block.fontSize));
        this.setValue("[data-block-line-height]", String(block.lineHeight ?? (block.type === "heading" ? 1.25 : 1.5)));
        this.setValue("[data-block-weight]", String(block.weight));
        this.setValue("[data-block-color]", block.color && /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : "#111827");
      }
      if (block.type === "button") {
        this.setValue("[data-button-label]", block.label);
        this.setValue("[data-button-variant]", block.variant);
        this.setValue("[data-button-action]", block.action.type);
        this.setValue("[data-button-url]", "url" in block.action ? block.action.url : "");
        this.setValue("[data-button-event]", "eventName" in block.action ? block.action.eventName : "");
        this.setValue("[data-button-background]", block.background && /^#[0-9a-f]{6}$/i.test(block.background) ? block.background : "#2563eb");
        this.setValue("[data-button-color]", block.color && /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : "#ffffff");
        this.setValue("[data-button-width]", block.width);
        this.setValue("[data-button-padding-x]", String(block.paddingX));
        this.setValue("[data-button-padding-y]", String(block.paddingY));
        this.setValue("[data-button-radius]", String(block.radius));
        this.root.querySelector("[data-action-url]").hidden = block.action.type !== "open_url";
        this.root.querySelector("[data-action-event]").hidden = block.action.type !== "track_event";
      }
      if (block.type === "image") {
        this.setValue("[data-v2-image-src]", block.src);
        this.setValue("[data-v2-image-alt]", block.alt);
        this.setValue("[data-image-fit]", block.fit);
        this.setValue("[data-image-width]", String(block.width));
        this.setValue("[data-image-radius]", String(block.radius));
      }
      if (block.type === "divider") {
        this.setValue("[data-divider-thickness]", String(block.thickness));
        this.setValue("[data-divider-color]", block.color);
      }
      if (block.type === "spacer") this.setValue("[data-spacer-size]", String(block.size));
      if (block.type === "icon") {
        this.setValue("[data-icon-name]", block.icon);
        this.setValue("[data-icon-size]", String(block.size));
        this.setValue("[data-icon-color]", block.color ?? "#2563eb");
      }
    }
    if ((block == null ? void 0 : block.type) === "image") {
      const local = block.src.startsWith("data:");
      if (local) this.setValue("[data-v2-image-src]", "");
      this.root.querySelector("[data-v2-image-src]").placeholder = local ? "Added from file; paste a URL to replace" : "https://… (optional)";
      this.setText("[data-choose-image]", block.src ? "Replace image" : "Choose image");
    }
    this.hideChecklistWidgetControls();
    const undo = this.root.querySelector("[data-v2-undo]");
    if (undo) undo.disabled = !editor.canUndo();
    const redo = this.root.querySelector("[data-v2-redo]");
    if (redo) redo.disabled = !editor.canRedo();
    if (globalUndo) globalUndo.disabled = !editor.canUndo();
    if (globalRedo) globalRedo.disabled = !editor.canRedo();
  }
  setInspectorTab(tab) {
    var _a;
    if (!this.root || tab === "ai" && ((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite") return;
    const main = this.root.querySelector("main");
    main == null ? void 0 : main.classList.toggle("ai-mode", tab === "ai");
    main == null ? void 0 : main.classList.toggle("theme-mode", tab === "theme");
    this.root.querySelectorAll("[data-inspector-tab]").forEach((button) => button.classList.toggle("active", button.dataset.inspectorTab === tab));
    const panel = this.root.querySelector("[data-ai-panel]");
    if (panel) panel.hidden = tab !== "ai";
    const themePanel = this.root.querySelector("[data-theme-section]");
    if (themePanel) themePanel.hidden = tab !== "theme";
    if (tab === "ai") this.syncAiPanel();
  }
  syncAiPanel() {
    var _a, _b;
    if (!this.root) return;
    const selection = this.compositionSelection;
    this.setText("[data-ai-context]", this.guide ? `Guide · step ${this.stepIndex + 1} of ${this.guide.steps.length}${selection ? ` · ${selection.label}` : ""}` : this.survey ? `Survey · step ${this.stepIndex + 1} of ${this.survey.steps.length}${selection ? ` · ${selection.label}` : ""}` : this.checklist ? `Checklist · ${((_a = this.checklistEditor) == null ? void 0 : _a.getView()) ?? "expanded"}${selection ? ` · ${selection.label}` : ""}` : selection ? `Editing ${selection.label} · ${selection.kind}` : "Choose an element or ask about the whole widget.");
    const history2 = this.root.querySelector("[data-ai-history]");
    if (history2) {
      const messages = this.aiMessages.map((message) => {
        const item = document.createElement("article");
        item.className = `ai-chat-message ai-chat-message--${message.role}`;
        const label = document.createElement("span");
        label.className = "ai-chat-message__role";
        label.textContent = message.role === "user" ? "You" : "Movcues AI";
        const text2 = document.createElement("p");
        text2.textContent = message.text;
        item.append(label, text2);
        return item;
      });
      history2.replaceChildren(...messages);
      history2.scrollTop = history2.scrollHeight;
    }
    const proposal = this.root.querySelector("[data-ai-proposal]");
    if (proposal) proposal.hidden = !this.aiProposal;
    if (!this.aiProposal) return;
    this.setText("[data-ai-summary]", this.aiProposal.value.summary);
    const list2 = this.root.querySelector("[data-ai-operations]");
    if (list2) {
      const items = this.aiProposal.value.operations.map((operation, index) => {
        var _a2, _b2;
        const item = document.createElement("li");
        const stepId = "stepId" in operation ? operation.stepId : void 0;
        const steps = ((_a2 = this.guide) == null ? void 0 : _a2.steps.map((value) => ({ id: value.id, label: value.label || value.content.heading }))) ?? ((_b2 = this.survey) == null ? void 0 : _b2.steps.map((value) => ({ id: value.id, label: value.content.heading }))) ?? [];
        const stepIndex = stepId ? steps.findIndex((value) => value.id === stepId) : -1;
        item.textContent = `${operation.type.replace(/_/g, " ")}${stepIndex >= 0 ? ` · ${steps[stepIndex].label || `step ${stepIndex + 1}`}` : ""}${operation.type === "request_guide_target" && this.aiResolvedTargets.has(index) ? " · target selected" : ""}`;
        return item;
      });
      try {
        const warnings = this.survey && this.definition ? applySurveyAiProposal(this.definition, this.aiProposal.value).warnings : this.checklist ? applyChecklistAiProposal(this.checklist, this.aiProposal.value, ((_b = this.draft) == null ? void 0 : _b.references) ?? { guides: [], segments: [] }).warnings : [];
        for (const warning2 of warnings) {
          const item = document.createElement("li");
          item.textContent = `Warning · ${warning2}`;
          items.push(item);
        }
      } catch {
      }
      list2.replaceChildren(...items);
    }
    const stale = this.aiProposalIsStale();
    const unresolved = this.aiProposal.value.operations.some((operation, index) => operation.type === "request_guide_target" && !this.aiResolvedTargets.has(index));
    const target = this.root.querySelector("[data-ai-target]");
    if (target) target.hidden = !this.guide || !unresolved;
    const sourceProposal = this.aiProposal.value.operations.some((operation) => operation.type === "replace_markup");
    const preview = this.root.querySelector("[data-ai-preview]");
    if (preview) {
      preview.hidden = !this.guide && !this.survey && !this.checklist && !sourceProposal;
      preview.textContent = sourceProposal ? "Preview design" : this.guide ? "Preview Guide" : "Preview";
      preview.disabled = stale || unresolved;
    }
    const apply = this.root.querySelector("[data-ai-apply]");
    if (apply) {
      apply.disabled = stale || unresolved;
      apply.title = stale ? "Draft changed; generate a fresh proposal." : unresolved ? "Select each requested website target first." : "Apply as one undoable change";
    }
    if (stale) this.setText("[data-ai-status]", "The draft changed. Discard this proposal and generate a fresh one.");
  }
  async sendAiPrompt() {
    var _a, _b, _c, _d;
    const input2 = (_a = this.root) == null ? void 0 : _a.querySelector("[data-ai-prompt]");
    const prompt = input2 == null ? void 0 : input2.value.trim();
    const builder = this.currentBuilder(), sourceMode = isSourceAuthored(builder);
    if (!prompt || !this.bridge || !this.draft || !builder || !this.compositionSelection || !this.compositionEditor && !sourceMode) return;
    if (!this.flushContent() || this.dirty && !await this.persist()) return;
    this.cancelAiRequest();
    const generation = ++this.aiRequestGeneration;
    const abort = new AbortController();
    this.aiAbort = abort;
    const send = (_b = this.root) == null ? void 0 : _b.querySelector("[data-ai-send]");
    if (send) send.disabled = true;
    const cancel = (_c = this.root) == null ? void 0 : _c.querySelector("[data-ai-cancel]");
    if (cancel) cancel.hidden = false;
    this.aiMessages.push({ role: "user", text: prompt });
    if (input2) input2.value = "";
    this.setText("[data-ai-status]", "Generating a validated proposal…");
    this.discardAiPreview();
    this.aiProposal = null;
    this.aiResolvedTargets.clear();
    this.syncAiPanel();
    try {
      const document2 = onsiteDocumentFromBuilder(builder);
      if (!document2) throw new Error("This draft has no recoverable on-site document.");
      const context = this.guide ? guideAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, guide: this.guide, currentStepId: this.guide.steps[this.stepIndex].id, selection: this.compositionSelection, theme: resolvedTheme(this.ensureThemeState()), scope: this.compositionSelection.kind === "step" ? "guide" : "step" }) : this.survey ? surveyAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, definition: this.definition, currentStepId: this.survey.steps[this.stepIndex].id, selection: this.compositionSelection, scope: this.compositionSelection.kind === "step" ? "survey" : "step" }) : this.checklist ? checklistAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, checklist: this.checklist, references: this.draft.references ?? { guides: [], segments: [] }, selection: this.compositionSelection, currentView: ((_d = this.checklistEditor) == null ? void 0 : _d.getView()) ?? "expanded", theme: resolvedTheme(this.ensureThemeState()) }) : editorAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, widgetType: this.draft.experience.widgetType ?? null, builderMode: "onsite" }, selection: this.compositionSelection, document: document2, builder });
      const requestEditGeneration = this.editGeneration, requestSelectionKey = this.aiSelectionKey();
      const response = await this.bridge.chat({ conversationId: this.aiConversationId, prompt, revision: this.draft.version.revision, context }, abort.signal);
      if (generation !== this.aiRequestGeneration) return;
      this.aiConversationId = response.conversationId;
      this.aiProposal = response.proposal ? { value: response.proposal, revision: response.revision, generation: requestEditGeneration, selectionKey: requestSelectionKey } : null;
      this.aiMessages.push({ role: "assistant", text: response.markdown.trim() || "Proposal generated." });
      this.setText("[data-ai-status]", "");
      this.syncAiPanel();
    } catch (error) {
      if (generation === this.aiRequestGeneration && !abort.signal.aborted) {
        if (error instanceof DraftConflictError) this.saveState = "conflict";
        if (error instanceof EditorAiRequestError && error.conversationId) this.aiConversationId = error.conversationId;
        this.setText("[data-ai-status]", error instanceof Error ? error.message : "Movcues AI could not complete this request.");
        this.showSaveState();
      }
    } finally {
      if (generation === this.aiRequestGeneration) {
        this.aiAbort = null;
        if (send) send.disabled = false;
        if (cancel) cancel.hidden = true;
      }
    }
  }
  cancelAiRequest() {
    var _a, _b;
    if (!this.aiAbort) return;
    this.aiAbort.abort();
    this.aiAbort = null;
    this.aiRequestGeneration++;
    this.setText("[data-ai-status]", "Request canceled. Your prompt is still here.");
    const send = (_a = this.root) == null ? void 0 : _a.querySelector("[data-ai-send]");
    if (send) send.disabled = false;
    const cancel = (_b = this.root) == null ? void 0 : _b.querySelector("[data-ai-cancel]");
    if (cancel) cancel.hidden = true;
  }
  applyAiProposal() {
    var _a;
    if (!this.aiProposal || !this.draft || this.aiProposalIsStale()) {
      this.syncAiPanel();
      return;
    }
    if (this.checklist) {
      try {
        const before = cloneOnsite(this.checklistAiPreviewOriginal ?? this.checklist), candidate = this.checklistAiPreviewCandidate ?? applyChecklistAiProposal(before, this.aiProposal.value, this.draft.references ?? { guides: [], segments: [] }).definition;
        this.setChecklistDefinition(cloneOnsite(candidate));
        this.checklistAiPreviewOriginal = null;
        this.checklistAiPreviewCandidate = null;
        this.aiPreviewReturnMode = null;
        this.aiProposal = null;
        this.finishAiApply();
        this.setText("[data-ai-status]", "Applied. Undo restores the complete Checklist in one step.");
        this.syncAiPanel();
      } catch (error) {
        this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Checklist proposal is invalid.");
      }
      return;
    }
    if (this.survey) {
      try {
        const before = cloneOnsite(this.surveyAiPreviewOriginal ?? this.definition);
        const candidate = this.surveyAiPreviewCandidate ?? applySurveyAiProposal(before, this.aiProposal.value).definition;
        this.setSurveyDefinition(cloneOnsite(candidate));
        this.surveyAiPreviewOriginal = null;
        this.surveyAiPreviewCandidate = null;
        this.aiPreviewReturnMode = null;
        this.aiProposal = null;
        this.finishAiApply();
        this.refreshStepBar();
        this.setText("[data-ai-status]", "Applied. Undo restores the complete Survey in one step.");
        this.syncAiPanel();
      } catch (error) {
        this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Survey proposal is invalid.");
      }
      return;
    }
    if (!this.guide) {
      if (this.aiProposal.value.operations.some((operation) => operation.type === "replace_markup")) {
        try {
          const before = cloneOnsite(this.widgetAiPreviewOriginal ?? this.definition), candidate = this.widgetAiPreviewCandidate ?? this.applyWidgetSourceProposal(before);
          this.definition = cloneOnsite(candidate);
          this.widgetAiPreviewOriginal = null;
          this.widgetAiPreviewCandidate = null;
          this.aiPreviewReturnMode = null;
          this.aiProposal = null;
          this.finishAiApply();
          this.setText("[data-ai-status]", "Applied. You can continue editing this design directly. Undo restores the entire proposal.");
          this.syncAiPanel();
        } catch (error) {
          this.setText("[data-ai-status]", error instanceof Error ? error.message : "The source proposal is invalid.");
        }
        return;
      }
      if ((_a = this.compositionEditor) == null ? void 0 : _a.applyAiProposal(this.aiProposal.value)) {
        this.aiProposal = null;
        this.setText("[data-ai-status]", "Applied. Use Undo to revert the entire proposal.");
        this.syncAiPanel();
      }
      return;
    }
    try {
      const before = cloneOnsite(this.aiPreviewOriginal ?? this.guide);
      const candidate = this.aiPreviewCandidate ?? applyGuideAiProposal(before, this.aiProposal.value, this.aiResolvedTargets).guide;
      this.setGuideDefinition(cloneOnsite(candidate));
      this.aiPreviewOriginal = null;
      this.aiPreviewCandidate = null;
      this.aiPreviewReturnMode = null;
      this.aiProposal = null;
      this.aiResolvedTargets.clear();
      this.finishAiApply();
      this.refreshStepBar();
      this.setText("[data-ai-status]", "Applied. Undo restores the complete Guide in one step.");
      this.syncAiPanel();
    } catch (error) {
      this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Guide proposal is invalid.");
    }
  }
  resolveAiGuideTarget() {
    var _a;
    if (!this.aiProposal || !this.guide) return;
    this.discardAiPreview();
    const operationIndex = this.aiProposal.value.operations.findIndex((operation2, index2) => operation2.type === "request_guide_target" && !this.aiResolvedTargets.has(index2));
    const operation = this.aiProposal.value.operations[operationIndex];
    if (!operation || operation.type !== "request_guide_target") return;
    const index = this.guide.steps.findIndex((step) => step.id === operation.stepId);
    if (index < 0 || !this.flushContent()) return;
    this.stepIndex = index;
    const generation = ++this.selectionGeneration;
    this.picker.cancel();
    (_a = this.compositionEditor) == null ? void 0 : _a.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
    this.preview.destroy();
    this.previewRendered = false;
    this.setText("[data-ai-status]", `Select the website element for this step's ${operation.targetKind === "position" ? "position" : "advance trigger"}. Escape cancels.`);
    void this.picker.pick().then((target) => {
      if (generation !== this.selectionGeneration || !target) {
        this.renderPreview();
        this.syncPanel();
        return;
      }
      this.aiResolvedTargets.set(operationIndex, { ...target, targetContext: { pagePath: currentPagePath() } });
      this.renderPreview();
      this.syncPanel();
      this.syncAiPanel();
    });
  }
  previewAiGuideProposal() {
    if (!this.aiProposal || !this.guide || !this.draft || this.aiProposal.revision !== this.draft.version.revision || this.aiProposal.generation !== this.editGeneration) return;
    try {
      this.discardAiPreview();
      this.aiPreviewLocation = { index: this.stepIndex, selection: this.compositionSelection };
      const original = cloneOnsite(this.guide);
      this.aiPreviewReturnMode = this.mode;
      const result2 = applyGuideAiProposal(original, this.aiProposal.value, this.aiResolvedTargets);
      this.aiPreviewOriginal = original;
      this.aiPreviewCandidate = cloneOnsite(result2.guide);
      this.setGuideDefinition(cloneOnsite(result2.guide));
      this.stepIndex = 0;
      this.refreshStepBar();
      this.startGuidePreview();
      this.setText("[data-ai-status]", "Previewing the complete proposed Guide. Apply or Discard to finish.");
    } catch (error) {
      this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Guide proposal is invalid.");
    }
  }
  discardAiPreview() {
    if (this.widgetAiPreviewOriginal) {
      const returnMode2 = this.aiPreviewReturnMode;
      this.definition = this.widgetAiPreviewOriginal;
      this.widgetAiPreviewOriginal = null;
      this.widgetAiPreviewCandidate = null;
      this.aiPreviewReturnMode = null;
      if (returnMode2 && returnMode2 !== this.mode) this.setMode(returnMode2);
      else if (this.mode !== "navigate") this.renderPreview();
      return;
    }
    if (this.checklistAiPreviewOriginal) {
      const returnMode2 = this.aiPreviewReturnMode;
      this.setChecklistDefinition(this.checklistAiPreviewOriginal);
      this.checklistAiPreviewOriginal = null;
      this.checklistAiPreviewCandidate = null;
      this.aiPreviewReturnMode = null;
      if (returnMode2 && returnMode2 !== this.mode) this.setMode(returnMode2);
      else if (this.mode !== "navigate") this.renderPreview();
      return;
    }
    if (this.surveyAiPreviewOriginal) {
      const returnMode2 = this.aiPreviewReturnMode;
      this.setSurveyDefinition(this.surveyAiPreviewOriginal);
      this.surveyAiPreviewOriginal = null;
      this.surveyAiPreviewCandidate = null;
      this.aiPreviewReturnMode = null;
      this.stepIndex = clampStep(this.stepIndex, this.survey.steps.length);
      this.refreshStepBar();
      if (returnMode2 && returnMode2 !== this.mode) this.setMode(returnMode2);
      else if (this.mode !== "navigate") this.renderPreview();
      return;
    }
    if (!this.aiPreviewOriginal) return;
    const returnMode = this.aiPreviewReturnMode;
    this.setGuideDefinition(this.aiPreviewOriginal);
    this.aiPreviewOriginal = null;
    this.aiPreviewCandidate = null;
    this.aiPreviewReturnMode = null;
    this.stepIndex = clampStep(this.stepIndex, this.guide.steps.length);
    this.refreshStepBar();
    if (returnMode && returnMode !== this.mode) this.setMode(returnMode);
    else if (this.mode !== "navigate") this.renderPreview();
  }
  discardAiProposal() {
    this.discardAiPreview();
    this.aiProposal = null;
    this.aiResolvedTargets.clear();
    this.setText("[data-ai-status]", "Proposal discarded. No draft changes were made.");
    this.syncAiPanel();
  }
  setGuideDefinition(value) {
    this.guide = value;
    this.definition = value;
  }
  setSurveyDefinition(value) {
    var _a;
    this.definition = value;
    this.survey = value.survey ?? null;
    if (this.survey) (_a = this.surveyEditor) == null ? void 0 : _a.setDefinition(this.survey);
  }
  setChecklistDefinition(value) {
    var _a;
    this.checklist = value;
    this.definition = checklistEditorAdapter(value);
    (_a = this.checklistEditor) == null ? void 0 : _a.setDefinition(value);
  }
  applyWidgetSourceProposal(source) {
    var _a;
    if (!this.aiProposal || !this.draft || this.guide || this.survey || this.checklist) throw new Error("Source proposal target is unavailable.");
    const operations = this.aiProposal.value.operations, operation = operations[0];
    if (operations.length !== 1 || (operation == null ? void 0 : operation.type) !== "replace_markup" || operation.stepId) throw new Error("A widget source replacement must be one atomic widget-scoped operation.");
    const candidate = cloneOnsite(source);
    if (!candidate.builder) throw new Error("Widget has no builder source.");
    if (operation.widthPx !== void 0) {
      if (this.draft.experience.widgetType !== "modal") throw new Error("Only modal source replacements can change the outer width.");
      candidate.design.size = { width: { mode: "fixed", value: operation.widthPx }, height: ((_a = candidate.design.size) == null ? void 0 : _a.height) ?? { mode: "auto" } };
    }
    applySourceMarkup(candidate.builder, candidate.content, operation, { widgetType: this.draft.experience.widgetType ?? "modal", guide: false });
    return candidate;
  }
  previewAiWidgetSourceProposal() {
    if (!this.aiProposal || !this.draft || !this.definition || this.aiProposalIsStale()) return;
    try {
      this.discardAiPreview();
      this.aiPreviewLocation = { index: this.stepIndex, selection: this.compositionSelection };
      const original = cloneOnsite(this.definition), candidate = this.applyWidgetSourceProposal(original);
      this.aiPreviewReturnMode = this.mode;
      this.widgetAiPreviewOriginal = original;
      this.widgetAiPreviewCandidate = cloneOnsite(candidate);
      this.definition = cloneOnsite(candidate);
      this.setMode("preview");
      this.setText("[data-ai-status]", "Previewing the complete source-authored design. Apply or Discard to finish.");
    } catch (error) {
      this.setText("[data-ai-status]", error instanceof Error ? error.message : "The source proposal is invalid.");
    }
  }
  previewAiChecklistProposal() {
    if (!this.aiProposal || !this.checklist || !this.draft || this.aiProposalIsStale()) return;
    try {
      this.discardAiPreview();
      this.aiPreviewLocation = { index: this.stepIndex, selection: this.compositionSelection };
      const original = cloneOnsite(this.checklist), result2 = applyChecklistAiProposal(original, this.aiProposal.value, this.draft.references ?? { guides: [], segments: [] });
      this.aiPreviewReturnMode = this.mode;
      this.checklistAiPreviewOriginal = original;
      this.checklistAiPreviewCandidate = cloneOnsite(result2.definition);
      this.setChecklistDefinition(cloneOnsite(result2.definition));
      this.setMode("preview");
      this.setText("[data-ai-status]", `Previewing the complete proposed Checklist.${result2.warnings.length ? ` ${result2.warnings.join(" ")}` : ""} Apply or Discard to finish.`);
    } catch (error) {
      this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Checklist proposal is invalid.");
    }
  }
  aiSelectionKey() {
    var _a;
    return JSON.stringify({ selection: this.compositionSelection, checklistView: (_a = this.checklistEditor) == null ? void 0 : _a.getView() });
  }
  aiProposalIsStale() {
    var _a;
    return !this.aiProposal || this.aiProposal.revision !== ((_a = this.draft) == null ? void 0 : _a.version.revision) || this.aiProposal.generation !== this.editGeneration || !this.aiPreviewOriginal && !this.surveyAiPreviewOriginal && !this.checklistAiPreviewOriginal && !this.widgetAiPreviewOriginal && this.aiProposal.selectionKey !== this.aiSelectionKey();
  }
  previewAiSurveyProposal() {
    if (!this.aiProposal || !this.survey || !this.draft || this.aiProposal.revision !== this.draft.version.revision || this.aiProposal.generation !== this.editGeneration) return;
    try {
      this.discardAiPreview();
      this.aiPreviewLocation = { index: this.stepIndex, selection: this.compositionSelection };
      const original = cloneOnsite(this.definition), result2 = applySurveyAiProposal(original, this.aiProposal.value);
      this.aiPreviewReturnMode = this.mode;
      this.surveyAiPreviewOriginal = original;
      this.surveyAiPreviewCandidate = cloneOnsite(result2.definition);
      this.setSurveyDefinition(cloneOnsite(result2.definition));
      this.stepIndex = 0;
      this.refreshStepBar();
      this.setMode("preview");
      this.setText("[data-ai-status]", `Previewing the complete proposed Survey.${result2.warnings.length ? ` ${result2.warnings.join(" ")}` : ""} Apply or Discard to finish.`);
    } catch (error) {
      this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Survey proposal is invalid.");
    }
  }
  recordHistory() {
    var _a;
    if (this.restoringHistory || !this.definition || ((_a = this.compositionEditor) == null ? void 0 : _a.isComposing()) || this.widgetAiPreviewOriginal || this.aiPreviewOriginal || this.surveyAiPreviewOriginal || this.checklistAiPreviewOriginal) return;
    this.history.record({ definition: cloneOnsite(this.checklist ?? this.definition), selection: this.compositionSelection, stepIndex: this.stepIndex }, this.historyTyping);
  }
  finishAiApply() {
    var _a, _b;
    const location2 = this.aiPreviewLocation;
    this.preferredSelection = (location2 == null ? void 0 : location2.selection) ?? this.compositionSelection;
    if (location2) this.stepIndex = location2.index;
    this.aiPreviewLocation = null;
    (_a = this.contentEditor) == null ? void 0 : _a.destroy();
    this.contentEditor = null;
    (_b = this.compositionEditor) == null ? void 0 : _b.destroy();
    this.compositionEditor = null;
    this.mode = "design";
    this.guidePreviewComplete = false;
    this.changed(true, true);
  }
  globalUndo() {
    var _a;
    if (!this.flushContent()) return;
    this.recordHistory();
    const value = this.history.undo();
    if (value) this.restoreHistory(value);
    else (_a = this.contentEditor) == null ? void 0 : _a.undo();
  }
  globalRedo() {
    var _a;
    if (!this.flushContent()) return;
    const value = this.history.redo();
    if (value) this.restoreHistory(value);
    else (_a = this.contentEditor) == null ? void 0 : _a.redo();
  }
  restoreHistory(entry) {
    var _a, _b, _c, _d;
    const value = entry.definition;
    this.restoringHistory = true;
    try {
      if (this.compositionEditor && !this.checklist && entry.stepIndex === this.stepIndex) {
        const current = cloneOnsite(this.definition), target = cloneOnsite(value);
        const owner = (definition) => "steps" in definition ? definition.steps[this.stepIndex] : definition.survey ? definition.survey.steps[this.stepIndex] : definition;
        const a = owner(current), b = owner(target);
        if ((a == null ? void 0 : a.builder) && (b == null ? void 0 : b.builder)) {
          const builder = b.builder, content = b.content;
          a.builder = b.builder;
          a.content = b.content;
          if (JSON.stringify(current) === JSON.stringify(target)) {
            this.compositionEditor.restoreBuilder(builder, content);
            this.compositionEditor.restoreSelection(entry.selection ?? { kind: "step", label: "Step" });
            this.changed(false, true);
            return;
          }
        }
      }
      this.preferredSelection = entry.selection;
      this.stepIndex = entry.stepIndex;
      (_a = this.compositionEditor) == null ? void 0 : _a.destroy();
      this.compositionEditor = null;
      (_b = this.contentEditor) == null ? void 0 : _b.destroy();
      this.contentEditor = null;
      if (this.checklist) this.setChecklistDefinition(value);
      else if (this.guide) this.setGuideDefinition(value);
      else if (this.survey) this.setSurveyDefinition(value);
      else this.definition = value;
      this.stepIndex = clampStep(this.stepIndex, ((_c = this.guide) == null ? void 0 : _c.steps.length) ?? ((_d = this.survey) == null ? void 0 : _d.steps.length) ?? 1);
      this.changed(true, true);
      this.refreshStepBar();
    } finally {
      this.restoringHistory = false;
    }
  }
  syncPanel() {
    var _a, _b;
    if (!this.root || !this.definition || !this.draft) return;
    this.syncGuideBehavior();
    const reset = this.root.querySelector("[data-reset-preview]");
    if (reset) reset.hidden = this.mode !== "preview";
    const limit = this.root.querySelector("[data-preview-limit]");
    if (limit) limit.hidden = this.mode !== "preview";
    const behavior = this.currentBehavior();
    const widgetType = this.draft.experience.widgetType;
    const guidePattern = this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : null;
    const activeGroups = new Set(guidePattern === "anchored_card" ? ["target", "anchored", "backdrop"] : !this.guide && widgetType === "anchored_card" ? ["target", "anchored", "backdrop"] : guidePattern === "modal" ? [] : widgetType === "hotspot" ? ["target", "anchored", "hotspot"] : widgetType === "toast" ? ["toast"] : widgetType === "modal" || widgetType === "survey" ? ["modal", "backdrop"] : widgetType === "slideout" ? ["slideout", "backdrop"] : widgetType === "banner" ? ["banner"] : ["cursor"]);
    this.root.querySelectorAll("[data-for]").forEach((group) => {
      group.hidden = !activeGroups.has(group.dataset.for);
    });
    if (this.mode !== "design") this.root.querySelectorAll("[data-step-only]").forEach((group) => {
      group.hidden = this.mode !== "target" || group.dataset.for !== "target" || !activeGroups.has("target");
    });
    const placementSection = this.root.querySelector("[data-placement-section]");
    if (placementSection) placementSection.hidden = Boolean(this.guide && guidePattern === "modal");
    this.root.querySelector("[data-step-summary]").hidden = !this.guide;
    this.root.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === this.mode));
    this.root.querySelectorAll("[data-placement]").forEach((button) => button.classList.toggle("active", button.dataset.placement === (behavior.placement ?? "auto")));
    const layer = this.currentLayer();
    const layerMode = (layer == null ? void 0 : layer.mode) ?? "always_on_top";
    this.setValue("[data-layer-mode]", layerMode);
    const relative2 = this.root.querySelector("[data-layer-relative]");
    if (relative2) relative2.hidden = (layer == null ? void 0 : layer.mode) !== "relative";
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
    this.syncContentInspector();
    this.syncCompositionInspector();
    this.syncThemeInspector();
    this.hideChecklistWidgetControls();
    this.setText("[data-mode-hint]", this.mode === "design" && this.draft.experience.widgetType === "cursor_follow" ? "Stationary authoring view · Preview tests cursor-follow movement" : this.mode === "design" && this.isTargetedType() && !this.currentTarget() ? "Select a page target in Target mode before editing this anchored card" : this.mode === "design" ? "Click a component to select · Double-click text to edit" : this.mode === "target" ? this.isTargetedType() ? "Select an element · Hold Shift to interact temporarily" : "This experience does not need a page target" : this.mode === "navigate" ? "Customer app interaction is enabled" : "End-user preview · analytics and actions are disabled");
  }
  hideChecklistWidgetControls() {
    if (!this.checklist || !this.root) return;
    this.root.querySelectorAll("[data-step-only],[data-edge]").forEach((node2) => node2.hidden = true);
    const target = this.root.querySelector("[data-mode=target]");
    if (target) {
      target.hidden = true;
      target.disabled = true;
    }
    this.setText("[data-preview-limit]", "Simulated Checklist progress only. No visitor records, Guide launches, navigation or production analytics are sent. Website JavaScript may still have side effects.");
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
    this.setText("[data-current-path]", this.currentPath || currentPagePath());
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
      if (!guideStep) {
        button.remove();
        return;
      }
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
  configureDiagnostics() {
    var _a;
    (_a = this.mutationObserver) == null ? void 0 : _a.disconnect();
    this.mutationObserver = null;
    if (this.mode !== "target" || typeof MutationObserver === "undefined") return;
    this.mutationObserver = new MutationObserver(() => this.scheduleTargetRefresh());
    this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["id", "class", "data-testid", "hidden"] });
  }
  scheduleTargetRefresh() {
    clearTimeout(this.targetRefreshTimer);
    this.targetRefreshTimer = window.setTimeout(() => this.updateDiagnostics(), 80);
  }
  onRouteChange() {
    var _a;
    const previous = this.currentPath;
    const next = currentPagePath();
    if (next === previous) return;
    this.currentPath = next;
    this.updateContinuation();
    const notice = (_a = this.root) == null ? void 0 : _a.querySelector("[data-route-notice]");
    if (notice) notice.hidden = false;
    this.setText("[data-route-change]", `${previous} → ${next}`);
    this.updateDiagnostics();
    if (this.mode === "preview" && this.guide && !this.guidePreviewComplete) {
      const advance = this.guide.steps[this.stepIndex].advance;
      if (next !== this.guidePreviewEntryPath && (advance == null ? void 0 : advance.type) === "route" && matchesGuideRoute(next, advance.pageRules)) {
        this.advanceGuidePreview(1);
        return;
      }
    }
    if (this.mode !== "navigate" && !this.guidePreviewComplete) {
      this.renderPreview();
      if (this.mode === "target") this.startPicker();
    }
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
    if (((_a = target.targetContext) == null ? void 0 : _a.pagePath) && target.targetContext.pagePath !== (this.currentPath || currentPagePath())) return "off-page";
    return findTarget(target) ? "found" : "missing";
  }
  currentBehavior() {
    if (!this.definition) return { dismissible: true };
    return this.guide ? this.guide.steps[this.stepIndex].behavior : this.definition.behavior;
  }
  currentLayer() {
    var _a, _b;
    if (!this.definition) return void 0;
    if (this.guide) return this.guide.steps[this.stepIndex].behavior.layer ?? ((_a = this.guide.behavior) == null ? void 0 : _a.layer);
    const widget = this.definition;
    return this.survey ? ((_b = this.survey.steps[this.stepIndex].behavior) == null ? void 0 : _b.layer) ?? widget.behavior.layer : widget.behavior.layer;
  }
  setLayer(layer) {
    if (!this.definition) return;
    if (this.guide) this.guide.steps[this.stepIndex].behavior.layer = layer;
    else if (this.survey) {
      const step = this.survey.steps[this.stepIndex];
      step.behavior = { ...step.behavior, layer };
    } else this.definition.behavior.layer = layer;
  }
  setTarget(target) {
    if (!this.definition) return;
    const contextualTarget = { ...target, targetContext: { pagePath: currentPagePath() } };
    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      if (!guideStepRequiresTarget(step)) return;
      step.target = contextualTarget;
    } else this.definition.target = contextualTarget;
  }
  updateContinuation() {
    var _a, _b, _c, _d;
    if (!this.session || !this.draft || this.saveState === "expired") return;
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
    var _a, _b;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
    if (element && element !== ((_b = this.root) == null ? void 0 : _b.activeElement)) element.value = value;
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    this.lifecycle++;
    this.cancelAiRequest();
    this.aiProposal = null;
    this.aiConversationId = void 0;
    this.aiMessages = [];
    this.aiResolvedTargets.clear();
    this.aiPreviewOriginal = null;
    this.aiPreviewCandidate = null;
    this.surveyAiPreviewOriginal = null;
    this.surveyAiPreviewCandidate = null;
    this.checklistAiPreviewOriginal = null;
    this.checklistAiPreviewCandidate = null;
    this.widgetAiPreviewOriginal = null;
    this.widgetAiPreviewCandidate = null;
    this.aiPreviewReturnMode = null;
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.targetRefreshTimer);
    this.selectionGeneration++;
    (_a = this.routeUnsubscribe) == null ? void 0 : _a.call(this);
    this.routeUnsubscribe = null;
    this.routeObserver.stop();
    window.removeEventListener("pagehide", this.persistBeforePageLeave);
    document.removeEventListener("click", this.protectPreviewNavigation, true);
    document.removeEventListener("submit", this.protectPreviewSubmission, true);
    window.removeEventListener("beforeunload", this.protectUnsavedChanges);
    window.removeEventListener("resize", this.fitPanel);
    (_b = window.visualViewport) == null ? void 0 : _b.removeEventListener("resize", this.fitPanel);
    (_c = window.visualViewport) == null ? void 0 : _c.removeEventListener("scroll", this.fitPanel);
    (_d = this.mutationObserver) == null ? void 0 : _d.disconnect();
    this.mutationObserver = null;
    (_e = this.dragCleanup) == null ? void 0 : _e.call(this);
    this.dragCleanup = null;
    (_f = this.contentEditor) == null ? void 0 : _f.flush();
    (_g = this.compositionEditor) == null ? void 0 : _g.flush();
    this.previewGeneration++;
    this.preview.destroy();
    (_h = this.contentEditor) == null ? void 0 : _h.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_i = this.compositionEditor) == null ? void 0 : _i.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
    this.picker.cancel();
    (_j = this.host) == null ? void 0 : _j.remove();
    (_k = this.surveyEditor) == null ? void 0 : _k.destroy();
    this.surveyEditor = null;
    (_l = this.checklistEditor) == null ? void 0 : _l.destroy();
    this.checklistEditor = null;
    this.checklist = null;
    this.host = null;
    this.root = null;
    this.bridge = null;
    this.session = null;
    this.draft = null;
    this.definition = null;
    this.guide = null;
    this.survey = null;
    this.saveState = "clean";
    this.editGeneration = 0;
    this.recoveryDraft = null;
    this.dirty = false;
    this.previewRendered = false;
    this.saveInFlight = null;
    if (clearContinuation) clearEditorContinuation();
  }
}
function placementButton(value, label) {
  return `<button type="button" data-placement="${value}">${label}</button>`;
}
function editorId(prefix) {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Array.from(bytes).map((value) => value.toString(36)).join("")}`.slice(0, 64);
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
function currentPagePath() {
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
  return rules.map((rule2) => `${rule2.kind === "exclude" ? "Exclude" : "Include"} ${rule2.value}`).join(" · ");
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
const BASE_STYLE = `
:host{all:initial}*{box-sizing:border-box}aside{position:fixed;right:12px;top:12px;width:min(326px,calc(100vw - 8px));max-height:calc(100dvh - 24px);z-index:2147483647;overflow:hidden;background:#fff;color:#111827;border:1px solid #d7dce3;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.24);font:13px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif}aside.left-side{left:12px;right:auto}header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 12px 10px;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none}.header-copy{display:grid;min-width:0}.header-copy strong{font-size:13px}.header-copy>span{overflow:hidden;color:#4b5563;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.header-copy small{margin-top:3px;color:#6b7280;font-size:11px}.header-copy i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a}.header-actions{display:flex;gap:2px}.header-actions button{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#64748b;font:16px/1 inherit;cursor:pointer}.header-actions button:hover{background:#f1f5f9;color:#0f172a}main{max-height:calc(100dvh - 82px);overflow:auto}.minimized{width:min(260px,calc(100vw - 8px))}.minimized main{display:none}.modebar{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.modebar button,.secondary-button,.placement-grid button,.formatbar button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#334155;font:600 12px inherit;cursor:pointer}.modebar button{min-width:0;padding:7px 3px}.modebar button:disabled{cursor:not-allowed;opacity:.42}.modebar button.active,.placement-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.notice{display:grid;gap:2px;margin:8px 10px 0;padding:8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:11px}.section{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3}.eyebrow{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.muted,.hint{color:#64748b;font-size:11px}.hint{margin:0;padding:9px 12px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-navigator{position:fixed;left:50%;bottom:10px;width:min(680px,calc(100vw - 16px));transform:translateX(-50%);z-index:2147483647;border:1px solid #d7dce3;border-radius:10px;background:#fff;box-shadow:0 10px 32px rgba(15,23,42,.18)}.step-flow{display:flex;align-items:stretch;gap:4px;overflow:auto}.step{display:grid;grid-template-columns:auto minmax(54px,1fr) auto;align-items:center;gap:4px;flex:none;max-width:130px;padding:5px 7px;border:0;border-radius:6px;background:transparent;color:#64748b;font:600 11px inherit;cursor:pointer}.step small{overflow:hidden;font:10px/1.2 inherit;text-overflow:ellipsis;white-space:nowrap}.step i{font-style:normal}.step.active{background:#eff6ff;color:#1d4ed8}.step[data-step-status=found]{color:#15803d}.step[data-step-status=missing]{color:#b45309}.step.active{color:#1d4ed8}.reliability{color:#64748b;font-size:11px}.reliability[data-level=reliable]{color:#15803d}.reliability[data-level=fragile]{color:#b45309}.secondary-button{padding:7px 9px}.secondary-button.compact{padding:5px 7px}.content-heading,.history-row,.link-row,.save-recovery{display:flex;align-items:center;justify-content:space-between;gap:6px}.content-heading>div{min-width:0}.formatbar{display:flex;flex-wrap:wrap;gap:4px}.formatbar button{padding:5px 7px}.link-row input{min-width:0}.history-row{justify-content:flex-start;flex-wrap:wrap}.save-recovery{flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #fee2e2;background:#fff7ed;color:#9a3412;font-size:11px}.placement-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.placement-grid button{padding:6px}.placement-grid button[data-placement=top]{grid-column:2}.placement-grid button[data-placement=left]{grid-column:1}.placement-grid button[data-placement=auto]{grid-column:2}.placement-grid button[data-placement=right]{grid-column:3}.placement-grid button[data-placement=bottom]{grid-column:2}label{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;color:#475569;font-size:11px}label.check{display:flex}label.check input{width:auto}input,select{min-width:0;width:100%;padding:6px 7px;border:1px solid #d7dce3;border-radius:6px;background:#fff;color:#111827;font:12px inherit}.number{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px}.number span{color:#64748b;font-size:11px}dl{display:grid;grid-template-columns:82px minmax(0,1fr);gap:5px 8px;margin:0;font-size:11px}dt{color:#64748b}dd{min-width:0;margin:0;overflow-wrap:anywhere;color:#1f2937}.live{font-size:11px}.status-ok{color:#15803d}.status-error{color:#b91c1c}.live code{display:block;overflow:hidden;padding:4px 6px;border-radius:5px;background:#f8fafc;color:#475569;font:11px/1.35 ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap}[data-missing-selector]{display:grid;gap:5px;padding-top:4px;color:#b91c1c}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}textarea[data-recovery-export]{box-sizing:border-box;width:100%;height:180px;font:11px monospace}[hidden]{display:none!important}@media(max-width:480px){.step-navigator{position:static;width:auto;transform:none;box-shadow:none}}@media(max-width:420px){aside{right:4px;top:4px;max-height:calc(100dvh - 8px)}aside.left-side{left:4px}main{max-height:calc(100dvh - 66px)}header{padding:9px}.section{padding:8px 10px}.modebar{padding:6px}.modebar button{font-size:10px}}
`;
const STYLE = `${BASE_STYLE}
.editor-toolbar{position:fixed;left:50%;transform:translateX(-50%);top:12px;width:min(410px,calc(100vw - 8px));z-index:2147483647;border:1px solid #d7dce3;border-radius:10px;background:#fff;color:#111827;box-shadow:0 8px 24px rgba(15,23,42,.16);font:12px/1.3 ui-sans-serif,system-ui,sans-serif;overflow:hidden}
.editor-toolbar header{padding:7px 8px;gap:4px;align-items:center}.header-copy>span{display:none}.header-copy strong{font-size:11px}.header-copy small{margin-top:1px;font-size:10px}.header-actions{flex-wrap:wrap;justify-content:flex-end;gap:1px}.header-actions button{width:25px;height:28px;font-size:14px}.header-actions [data-save]{width:38px;font-size:11px}.header-actions button:disabled{opacity:.4;cursor:default}
.editor-toolbar,aside,.step-navigator{pointer-events:auto}.editor-toolbar .modebar{padding:5px;border-bottom:0}.editor-toolbar .modebar button{padding:6px 3px;font-size:11px}.minimized{display:none}aside{box-shadow:0 8px 24px rgba(15,23,42,.14)}main{overscroll-behavior:contain}details.live{display:block}details.live summary{cursor:pointer;color:#64748b;font-size:11px}details.live[open]>div{margin-top:6px}.step-navigator{display:flex;align-items:center;gap:8px;width:min(680px,calc(100vw - 16px));padding:6px 8px}.step-drag-handle{flex:none;padding:2px 1px;color:#94a3b8;font-size:16px;line-height:1;cursor:move;touch-action:none;user-select:none}.step-navigator .content-heading{flex:none}.step-navigator .content-heading .eyebrow{display:none}.step-navigator .step-flow{flex:1;min-width:0}.step-navigator .history-row{gap:3px}.step-navigator .secondary-button{padding:4px;font-size:10px}.step-navigator .step-bar-action{width:24px;height:24px;padding:0;font-size:16px;line-height:1}.step-navigator .step-bar-action svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8}.step-navigator .step-bar-delete{border-color:#fecaca;background:#fff1f2;color:#dc2626}.step-navigator .step-bar-delete:hover{border-color:#fca5a5;background:#fee2e2;color:#b91c1c}.step-navigator .step-bar-action:disabled{cursor:not-allowed;opacity:.4}.step-navigator .content-heading>.history-row{display:none}
.inspector-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.inspector-tabs button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#475569;padding:6px;font:600 11px inherit;cursor:pointer}.inspector-tabs button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.inspector-tabs button:disabled{opacity:.4;cursor:not-allowed}main.ai-mode>:not(.inspector-tabs):not(.ai-panel),main.theme-mode>:not(.inspector-tabs):not(.theme-panel){display:none!important}.ai-panel{min-height:min(580px,calc(100dvh - 130px));display:flex;flex-direction:column;gap:10px;background:#fcfcfd}.ai-panel .content-heading{flex:none}.ai-panel .muted{margin:0}.ai-chat-history{display:grid;align-content:start;gap:8px;flex:1;min-height:260px;overflow:auto;padding:2px}.ai-chat-message{display:grid;gap:3px;max-width:92%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#334155}.ai-chat-message--user{justify-self:end;border-color:#dbeafe;background:#eff6ff;color:#1e3a8a}.ai-chat-message__role{font-size:10px;font-weight:700;color:#64748b}.ai-chat-message--user .ai-chat-message__role{color:#2563eb}.ai-chat-message p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.45}.ai-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:7px;padding-top:8px;border-top:1px solid #eef0f3}.ai-panel textarea{min-height:72px;width:100%;resize:vertical;padding:8px;border:1px solid #d7dce3;border-radius:8px;font:12px/1.4 inherit}.ai-composer button{padding:8px 10px}.ai-status{min-height:16px;margin:0;white-space:pre-wrap;color:#64748b;font-size:11px}.ai-proposal{display:grid;gap:6px;padding:8px;border:1px solid #bfdbfe;border-radius:8px;background:#f8fbff}.ai-proposal ul{margin:0;padding-left:18px;color:#475569;font-size:11px}
.ai-composer{grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px;border:1px solid #d9e1ec;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgb(15 23 42 / .04);transition:border-color .16s ease,box-shadow .16s ease}.ai-composer:focus-within{border-color:#93c5fd;box-shadow:0 0 0 3px rgb(59 130 246 / .12)}.ai-composer textarea{min-height:54px;padding:5px 3px;border:0;border-radius:0;background:transparent;outline:0;box-shadow:none;line-height:1.45}.ai-composer textarea:focus{outline:0}.ai-composer textarea::placeholder{color:#94a3b8}.ai-composer button{min-width:58px;min-height:34px;margin-bottom:2px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;box-shadow:0 1px 2px rgb(37 99 235 / .25);transition:background .16s ease,transform .16s ease,box-shadow .16s ease}.ai-composer button:hover:not(:disabled){background:#1d4ed8;box-shadow:0 4px 10px rgb(37 99 235 / .24);transform:translateY(-1px)}.ai-composer button:active:not(:disabled){transform:translateY(0);box-shadow:none}.ai-composer button:disabled{opacity:.5;cursor:not-allowed}
[data-composition-inspector]>.history-row{display:none}
@media(max-width:800px){.editor-toolbar{width:min(350px,calc(100vw - 8px))}aside{width:min(300px,calc(100vw - 8px))}}
@media(max-width:480px){.editor-toolbar{left:4px;top:4px;transform:none}.header-copy strong{font-size:10px}.header-copy small{font-size:9px}.header-actions [data-return-dashboard],.header-actions [data-move-side]{display:none}aside{width:calc(100vw - 8px)}.step-navigator{position:fixed;left:50%;bottom:4px;transform:translateX(-50%);width:calc(100vw - 8px);box-shadow:0 4px 14px rgba(15,23,42,.12)}.step-navigator>.history-row:not([data-step-bar-actions]){display:none}.step-navigator .content-heading{display:none}}
`;
const GUIDE_STYLE = `.guide-behavior{display:grid;gap:8px;border-top:1px solid #eef0f3;padding-top:10px;margin-top:8px}.guide-behavior [data-guide-config],.guide-behavior [data-guide-missing]{display:grid;gap:7px}.guide-behavior .muted{margin:0;overflow-wrap:anywhere}.guide-preview-controls{display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:5px 7px;border-top:1px solid #eef0f3}.guide-preview-controls button{border:1px solid #d7dce3;border-radius:5px;background:#fff;color:#334155;padding:4px 6px;font:11px ui-sans-serif,system-ui;cursor:pointer}.guide-preview-controls small{flex-basis:100%;color:#64748b;font-size:10px}.guide-preview-controls button:disabled{opacity:.4}.guide-preview-controls span{font-size:10px;margin-left:auto}`;
function checklistEditorAdapter(value) {
  return { content: { heading: value.title, body: value.description ?? "" }, builder: value.builder, design: value.design ?? { width: "sm", theme: { background: "#fff", foreground: "#111827", primary: "#2563eb", borderRadius: "md" } }, behavior: { dismissible: false }, targeting: { ...value.targeting, trigger: { type: "page_load" }, frequency: { mode: "once" } }, visualTheme: value.visualTheme, template: value.template };
}
export {
  EditorModeController
};
//# sourceMappingURL=EditorModeController-BG0NqxAg.js.map
