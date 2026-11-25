const styles = `
:host{all:initial;position:fixed;bottom:max(16px,env(safe-area-inset-bottom));right:16px;z-index:2147481000;color-scheme:light;font:14px/1.45 system-ui,sans-serif;--bg:#fff;--ink:#182238;--muted:#556275;--border:#dce2eb;--surface:#eff3f8;color:var(--ink)}
:host([data-side="bottom-left"]){right:auto;left:16px}
:host([data-theme="dark"]){color-scheme:dark;--bg:#171c28;--ink:#f2f5ff;--muted:#b2bdd1;--border:#404a5b;--surface:#272f40}
@media(prefers-color-scheme:dark){:host([data-theme="system"]){color-scheme:dark;--bg:#171c28;--ink:#f2f5ff;--muted:#b2bdd1;--border:#404a5b;--surface:#272f40}}
*{box-sizing:border-box} [hidden]{display:none!important}
button,input{font:inherit} button{cursor:pointer;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--ink);padding:5px 9px}
button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--brand);outline-offset:3px}
button:disabled{cursor:default;opacity:.58} a{color:inherit} img{object-fit:cover;border-radius:50%}
.launcher{margin-left:auto;display:grid;place-items:center;min-width:52px;min-height:52px;padding:10px 15px;border-radius:999px;background:var(--brand);color:var(--on-brand);border:none;box-shadow:0 4px 18px #1422374d}
:host([data-side="bottom-left"]) .launcher{margin-left:0}
section{width:min(368px,calc(100vw - 32px));height:min(540px,calc(100vh - 94px));height:min(540px,calc(100dvh - 94px));display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;margin-bottom:10px;background:var(--bg);border:1px solid var(--border);border-radius:14px;box-shadow:0 12px 36px #111c303b}
header{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:2px solid var(--brand)} h2{margin:0;min-width:0;flex:1;font-size:15px;overflow-wrap:anywhere}
.messages{overflow:auto;padding:12px;display:flex;flex-direction:column;gap:9px}
.messages p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.question,.response{border-radius:10px;padding:8px 10px}
.question{align-self:flex-end;max-width:88%;background:var(--surface)}
.response{align-self:flex-start;max-width:100%;border:1px solid var(--border)}
.sources{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;font-size:12px;color:var(--muted)}
.sources a,.sources span{border-radius:4px;border:1px solid var(--border);padding:2px 5px;max-width:100%;overflow-wrap:anywhere}
.actions{margin-top:7px;display:flex;flex-wrap:wrap;gap:5px}.actions button{font-size:12px}
[aria-pressed="true"]{box-shadow:inset 0 0 0 1px var(--brand)}
footer{border-top:1px solid var(--border);padding:9px 10px}
form{display:flex;gap:5px} input{width:100%;min-width:0;border:1px solid var(--border);background:var(--bg);color:var(--ink);border-radius:8px;padding:7px}
.status{margin:4px 0 0;font-size:12px;color:var(--muted);min-height:1em}.warning{color:var(--ink)}
`;
function create(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function button(text, className) {
  const element = create("button", text, className);
  element.type = "button";
  return element;
}
function safeUrl(value, protocols) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function tokenPayload(token) {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}
function usable(session) {
  return Number(tokenPayload(session.token).exp) * 1e3 > Date.now() + 2e4;
}
class GeoRequestError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
async function readFrames(response, onDelta) {
  if (!response.body) throw new Error("empty_response");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let answer;
  const consume = (line) => {
    var _a;
    if (!line.trim()) return;
    const frame = JSON.parse(line);
    if (frame.type === "delta" && typeof frame.text === "string") onDelta(frame.text);
    if (frame.type === "complete" && ((_a = frame.result) == null ? void 0 : _a.schemaVersion) === 1) answer = frame.result;
    if (frame.type === "error") throw new GeoRequestError(frame.code, 502);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += value;
      if (pending.length > 1e5) throw new Error("response_limit");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(consume);
    }
    if (pending) consume(pending);
    if (!answer) throw new Error("incomplete_response");
    return answer;
  } finally {
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
}
function onBrand(color) {
  const channel = (offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722 > 0.179 ? "#000" : "#fff";
}
class GeoAgentWidget {
  constructor(delivery, options) {
    this.delivery = delivery;
    this.options = options;
    this.host = create("div");
    this.launcher = button("", "launcher");
    this.panel = create("section");
    this.messages = create("div", void 0, "messages");
    this.status = create("p", "", "status");
    this.announcement = create("span");
    this.input = create("input");
    this.submitButton = create("button", "Send");
    this.cancelButton = button("Stop");
    this.newButton = button("New chat");
    this.lifecycle = new AbortController();
    this.pending = null;
    this.session = null;
    this.authentication = null;
    this.turns = [];
    this.restored = false;
    this.checkedIdentity = false;
    this.opening = false;
    this.destroyed = false;
    const { appearance, persistence } = delivery.configuration;
    this.storageKey = persistence === "tab" ? `movcues:geo-agent:${JSON.stringify([options.siteId, delivery.id, delivery.versionId, options.ownerKey])}` : null;
    this.base = `${options.apiBase.replace(/\/$/, "")}/public/sites/${encodeURIComponent(options.siteId)}/geo-agent/${encodeURIComponent(delivery.id)}`;
    try {
      if (this.storageKey) {
        const data = JSON.parse(sessionStorage.getItem(this.storageKey) ?? "null");
        if (data && typeof data.token === "string") this.session = data;
      }
    } catch {
    }
    const root = this.host.attachShadow({ mode: "open" });
    this.host.dataset.movcuesGeoAgent = delivery.id;
    this.host.dataset.private = "";
    this.host.dataset.theme = appearance.theme;
    this.host.dataset.side = appearance.position;
    const color = /^#[0-9a-f]{6}$/i.test(appearance.brandColor) ? appearance.brandColor : "#2563eb";
    this.host.style.setProperty("--brand", color);
    this.host.style.setProperty("--on-brand", onBrand(color));
    const style = create("style", styles);
    this.launcher.textContent = appearance.launcher === "label" ? appearance.launcherLabel : "💬";
    this.launcher.setAttribute("aria-label", `Chat with ${appearance.name}`);
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-controls", "geo-agent-panel");
    this.launcher.addEventListener("click", () => this.toggle(this.panel.hidden));
    this.panel.id = "geo-agent-panel";
    this.panel.hidden = true;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-labelledby", "geo-agent-title");
    const header = create("header");
    const avatarUrl = safeUrl(appearance.avatarUrl, ["https:"]);
    if (avatarUrl) {
      const avatar = create("img");
      avatar.src = avatarUrl;
      avatar.referrerPolicy = "no-referrer";
      avatar.alt = "";
      avatar.width = avatar.height = 26;
      header.append(avatar);
    }
    const title = create("h2", appearance.name);
    title.id = "geo-agent-title";
    this.newButton.addEventListener("click", () => void this.newConversation());
    const close = button("Close");
    close.addEventListener("click", () => this.toggle(false));
    header.append(title, this.newButton, close);
    this.messages.setAttribute("role", "log");
    this.messages.setAttribute("aria-label", "Chat messages");
    this.messages.setAttribute("aria-live", "off");
    this.status.setAttribute("role", "status");
    this.input.placeholder = appearance.placeholder;
    this.input.maxLength = 1e3;
    this.input.required = true;
    this.input.setAttribute("aria-label", "Your message");
    this.input.autocomplete = "off";
    this.submitButton.type = "submit";
    this.cancelButton.hidden = true;
    this.cancelButton.addEventListener("click", () => this.cancel());
    const form = create("form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = this.input.value.trim();
      if (value && !this.pending && !this.opening) {
        this.input.value = "";
        void this.send(value);
      }
    });
    form.append(this.input, this.submitButton, this.cancelButton);
    const footer = create("footer");
    this.announcement.setAttribute("role", "status");
    this.announcement.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
    footer.append(form, this.status, this.announcement);
    this.panel.append(header, this.messages, footer);
    this.panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        this.toggle(false);
      }
    });
    this.render();
    root.append(style, this.panel, this.launcher);
    (document.body ?? document.documentElement).append(this.host);
  }
  destroy(clearPersistence = false) {
    var _a;
    this.destroyed = true;
    this.lifecycle.abort();
    (_a = this.pending) == null ? void 0 : _a.controller.abort();
    this.pending = null;
    this.host.remove();
    if (clearPersistence && this.storageKey) {
      try {
        sessionStorage.removeItem(this.storageKey);
      } catch {
      }
    }
  }
  toggle(open) {
    this.panel.hidden = !open;
    this.launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      this.input.focus();
      if (!this.restored) void this.restore();
      else void this.event("opened");
    } else {
      this.launcher.focus();
      void this.event("closed");
    }
  }
  async restore() {
    if (this.opening) return;
    this.opening = true;
    this.setStatus("Connecting…");
    this.updateControls();
    try {
      const session = await this.authenticate();
      if (session.conversationId) {
        try {
          const response = await this.request(`/conversations/${encodeURIComponent(session.conversationId)}`);
          const history = await response.json();
          this.turns = (history.messages ?? []).map((item) => ({ requestId: item.messageId, question: item.question, answer: item.answer, feedback: item.feedback }));
        } catch (error) {
          if (!(error instanceof GeoRequestError) || error.code !== "conversation_not_found") throw error;
          delete session.conversationId;
          this.persist();
        }
      }
      this.restored = true;
      this.setStatus("");
      this.render();
      if (!this.destroyed && !this.panel.hidden) {
        void this.event("launcher_impression");
        void this.event("opened");
      }
    } catch {
      this.setStatus("Couldn’t connect. Close and reopen to retry.");
    } finally {
      this.opening = false;
      this.updateControls();
    }
  }
  authenticate() {
    if (this.session && usable(this.session) && (!this.session.verified || this.checkedIdentity)) return Promise.resolve(this.session);
    if (!this.authentication) {
      const prior = this.session;
      this.authentication = (async () => {
        var _a, _b;
        const identityToken = await ((_b = (_a = this.options).identityToken) == null ? void 0 : _b.call(_a));
        const response = await this.request("/session", "POST", { url: location.href, ...identityToken ? { identityToken } : {} }, void 0, true);
        const result = await response.json();
        this.lifecycle.signal.throwIfAborted();
        if (result.verified && (prior == null ? void 0 : prior.verified) && prior.conversationId && tokenPayload(prior.token).sub === tokenPayload(result.token).sub) result.conversationId = prior.conversationId;
        this.checkedIdentity = result.verified;
        this.session = result;
        this.persist();
        return result;
      })().finally(() => {
        this.authentication = null;
      });
    }
    return this.authentication;
  }
  persist() {
    if (this.destroyed || !this.storageKey || !this.session) return;
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.session));
    } catch {
    }
  }
  async request(path, method = "GET", body, signal, isSession = false, keepalive = false) {
    const token = isSession ? void 0 : (await this.authenticate()).token;
    const response = await fetch(`${this.base}${path}?${new URLSearchParams({ url: location.href })}`, {
      method,
      credentials: "omit",
      keepalive,
      headers: { ...body && { "Content-Type": "application/json" }, ...token && { Authorization: `Bearer ${token}` } },
      body: body && JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, this.lifecycle.signal]) : this.lifecycle.signal
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.error === "geo_agent_unavailable" || data.error === "geo_agent_ineligible") this.options.onUnavailable();
      if (response.status === 401 && !isSession && this.session) this.session.token = "";
      throw new GeoRequestError(data.error ?? "request_failed", response.status);
    }
    return response;
  }
  async conversation() {
    const session = await this.authenticate();
    if (session.conversationId) return session.conversationId;
    const response = await this.request("/conversations", "POST");
    const data = await response.json();
    session.conversationId = data.conversationId;
    this.persist();
    return data.conversationId;
  }
  async send(question, existing) {
    if (this.pending || this.opening || this.destroyed) return;
    const turn = existing ?? { question, requestId: crypto.randomUUID() };
    if (!existing) this.turns.push(turn);
    turn.error = void 0;
    turn.partial = "";
    const pending = { requestId: turn.requestId, controller: new AbortController() };
    this.pending = pending;
    this.announcement.textContent = "";
    this.setStatus("Preparing a response…");
    this.updateControls();
    this.render();
    try {
      const id = await this.conversation();
      const response = await this.request(
        `/conversations/${encodeURIComponent(id)}/messages`,
        "POST",
        { question, requestId: turn.requestId },
        pending.controller.signal
      );
      const answer = await readFrames(response, (text) => {
        pending.controller.signal.throwIfAborted();
        turn.partial = (turn.partial ?? "") + text;
        const element = this.messages.querySelector("[data-current-response]");
        if (element) element.textContent = turn.partial ?? "";
        this.messages.scrollTop = this.messages.scrollHeight;
      });
      pending.controller.signal.throwIfAborted();
      turn.answer = answer;
      this.setStatus("");
      this.announcement.textContent = answer.message;
    } catch (error) {
      turn.error = pending.controller.signal.aborted ? "Response stopped." : error instanceof GeoRequestError && error.status === 429 ? "Message limit reached. Try again later." : "Couldn’t answer. Try again.";
      if (error instanceof GeoRequestError && error.code === "conversation_not_found" && this.session) {
        delete this.session.conversationId;
        this.persist();
      }
      this.setStatus(turn.error);
    } finally {
      if (this.pending === pending) this.pending = null;
      turn.partial = void 0;
      if (!this.destroyed) {
        this.updateControls();
        this.render();
      }
    }
  }
  cancel() {
    var _a;
    const pending = this.pending;
    if (!pending) return;
    const id = (_a = this.session) == null ? void 0 : _a.conversationId;
    pending.controller.abort();
    if (id) void this.request(`/conversations/${encodeURIComponent(id)}/messages/${pending.requestId}/cancel`, "POST", void 0, void 0, false, true).catch(() => {
    });
  }
  newConversation() {
    if (this.pending || this.opening) return;
    if (this.session) delete this.session.conversationId;
    this.persist();
    this.turns = [];
    this.render();
    this.setStatus("New conversation.");
    this.input.focus();
    void this.event("conversation_reset");
  }
  async event(type) {
    if (!this.session || this.destroyed) return;
    await this.request("/events", "POST", { type, eventId: crypto.randomUUID() }, void 0, false, true).catch(() => {
    });
  }
  async feedback(turn, value) {
    var _a;
    const id = (_a = this.session) == null ? void 0 : _a.conversationId;
    if (!id || !turn.answer) return;
    try {
      await this.request(`/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(turn.answer.messageId)}/feedback`, "PUT", { value });
      turn.feedback = value;
      this.render();
      this.setStatus("Feedback saved.");
    } catch {
      this.setStatus("Couldn’t save feedback. Try again.");
    }
  }
  render() {
    var _a, _b;
    const appearance = this.delivery.configuration.appearance;
    this.messages.replaceChildren();
    if (!this.turns.length) {
      this.messages.append(create("p", appearance.welcome, "response"));
      for (const question of appearance.suggestions) {
        const suggested = button(question);
        suggested.addEventListener("click", () => void this.send(question));
        this.messages.append(suggested);
      }
    }
    for (const turn of this.turns) {
      const question = create("p", turn.question, "question");
      const response = create("article", void 0, "response");
      const body = create("p", ((_a = turn.answer) == null ? void 0 : _a.message) ?? turn.error ?? turn.partial);
      if (turn.partial !== void 0 && !turn.answer && !turn.error) body.dataset.currentResponse = "";
      response.append(body);
      if ((_b = turn.answer) == null ? void 0 : _b.citations.length) {
        const links = create("div", void 0, "sources");
        for (const citation of turn.answer.citations) {
          const url = safeUrl(citation.url, ["https:", "http:"]);
          if (url) {
            const link = create("a", citation.title);
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.addEventListener("click", () => void this.event("citation_clicked"));
            links.append(link);
          } else links.append(create("span", citation.title));
        }
        response.append(links);
      }
      if (turn.answer || turn.error) {
        const actions = create("div", void 0, "actions");
        if (turn.answer) {
          for (const [value, label] of [["helpful", "Helpful"], ["unhelpful", "Unhelpful"]]) {
            const rating = button(label);
            rating.setAttribute("aria-pressed", String(turn.feedback === value));
            rating.addEventListener("click", () => void this.feedback(turn, value));
            actions.append(rating);
          }
        } else if (this.turns[this.turns.length - 1] === turn) {
          const retry = button("Retry");
          retry.addEventListener("click", () => void this.send(turn.question, turn));
          actions.append(retry);
        }
        response.append(actions);
      }
      this.messages.append(question, response);
    }
    this.messages.scrollTop = this.messages.scrollHeight;
  }
  setStatus(text) {
    if (!this.destroyed) this.status.textContent = text;
  }
  updateControls() {
    this.submitButton.disabled = Boolean(this.pending) || this.opening;
    this.newButton.disabled = this.submitButton.disabled;
    this.cancelButton.hidden = !this.pending;
  }
}
function mountGeoAgent(delivery, options) {
  return new GeoAgentWidget(delivery, options);
}
export {
  mountGeoAgent
};
//# sourceMappingURL=widget-BECBPZJl.js.map
