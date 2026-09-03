import type { EditorDraft, ExperienceTarget, RuntimeGuideDefinition, RuntimeWidgetDefinition } from "../types";
import { isGuideDefinition } from "../types";
import { EditorBridge } from "./EditorBridge";
import { ElementPicker } from "./ElementPicker";
import { ExperienceRenderer } from "../runtime/ExperienceRenderer";

export class EditorModeController {
  private host: HTMLElement | null = null;
  private picker = new ElementPicker();
  private expiryTimer = 0;
  private validationTimer = 0;
  private preview = new ExperienceRenderer();
  constructor(private apiBase: string) {}

  async start(rawToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBase}/public/experience-editor/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ token: rawToken }) });
      if (!response.ok) return false;
      const session = await response.json() as { sessionId: string; accessToken: string; expiresAt: string };
      const clean = new URL(location.href); clean.searchParams.delete("loopz_editor_token"); history.replaceState(history.state, "", clean.toString());
      const bridge = new EditorBridge(this.apiBase, session.sessionId, session.accessToken); const draft = await bridge.load(); this.mount(draft, bridge);
      this.expiryTimer = window.setTimeout(() => this.destroy(), Math.max(0, new Date(session.expiresAt).getTime() - Date.now())); return true;
    } catch { this.destroy(); return false; }
  }

  private mount(draft: EditorDraft, bridge: EditorBridge): void {
    this.host = document.createElement("div"); this.host.dataset.loopzEditor = ""; const root = this.host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style><aside><header><b>Loopz visual editor</b><small>${escapeText(draft.experience.name)}</small></header><nav>${["Content","Design","Behavior","Targeting","Publish"].map((x,i)=>`<button data-tab="${i}" class="${i===0?"active":""}">${x}</button>`).join("")}</nav><main>
      <section data-panel="0"><label>Heading<input data-heading></label><label>Body<textarea data-body></textarea></label></section>
      <section data-panel="1" hidden><label>Width<select data-width><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label><label>Background<input data-background type="color"></label><label>Text color<input data-foreground type="color"></label><label>Primary color<input data-primary type="color"></label></section>
      <section data-panel="2" hidden><label>Placement<select data-placement><option value="auto">Auto</option><option value="top">Top</option><option value="right">Right</option><option value="bottom">Bottom</option><option value="left">Left</option></select></label><label>Offset<input data-offset type="number" min="0" max="100"></label><label class="row"><input data-dismissible type="checkbox"> Dismissible</label><button data-pick>Reselect target</button><p data-reliability></p></section>
      <section data-panel="3" hidden><label>Frequency<select data-frequency><option value="once">Once ever</option><option value="once_per_session">Once per session</option><option value="every_time">Every qualifying time</option></select></label><label>Priority<input data-priority type="number" min="-1000" max="1000"></label><p>Saved Page, Segment, and event targeting are configured securely in the Loopz dashboard.</p></section>
      <section data-panel="4" hidden><p>Preview is live on this page. Save the draft here, then return to Loopz to publish or pause it.</p><button data-save>Save draft</button></section>
      <p data-status>Draft autosaves as you edit.</p></main></aside>`;
    document.documentElement.appendChild(this.host);
    const definition = draft.version.definition; const content = isGuideDefinition(definition) ? definition.steps[0].content : definition.content;
    const heading = root.querySelector<HTMLInputElement>("[data-heading]")!; const body = root.querySelector<HTMLTextAreaElement>("[data-body]")!; heading.value = content.heading; body.value = content.body;
    let saveTimer = 0; const status = root.querySelector<HTMLElement>("[data-status]")!;
    const renderPreview = () => this.preview.render({ id: draft.experience.id, versionId: draft.version.id, kind: draft.experience.kind, widgetType: draft.experience.widgetType, priority: 0, definition }, { onVisible: () => void 0, onDismiss: () => window.setTimeout(renderPreview, 0), onAction: () => void 0, onComplete: () => window.setTimeout(renderPreview, 0) });
    const persist = async () => { status.textContent = "Saving…"; try { await bridge.save(definition); status.textContent = "Draft saved."; } catch { status.textContent = "Editor session expired or was revoked."; this.destroy(); } };
    const save = () => { renderPreview(); clearTimeout(saveTimer); saveTimer = window.setTimeout(persist, 350); };
    heading.addEventListener("input", () => { content.heading = heading.value; save(); }); body.addEventListener("input", () => { content.body = body.value; save(); });
    const width=root.querySelector<HTMLSelectElement>("[data-width]")!; width.value=definition.design.width; width.addEventListener("change",()=>{definition.design.width=width.value as typeof definition.design.width;save()});
    for(const key of ["background","foreground","primary"] as const){const input=root.querySelector<HTMLInputElement>(`[data-${key}]`)!;input.value=definition.design.theme[key];input.addEventListener("input",()=>{definition.design.theme[key]=input.value;save()})}
    const activeBehavior=isGuideDefinition(definition)?definition.steps[0].behavior:definition.behavior; const placement=root.querySelector<HTMLSelectElement>("[data-placement]")!;placement.value=activeBehavior.placement??"auto";placement.addEventListener("change",()=>{activeBehavior.placement=placement.value as NonNullable<typeof activeBehavior.placement>;save()});const offset=root.querySelector<HTMLInputElement>("[data-offset]")!;offset.value=String(activeBehavior.offset??8);offset.addEventListener("input",()=>{activeBehavior.offset=Number(offset.value);save()});const dismissible=root.querySelector<HTMLInputElement>("[data-dismissible]")!;dismissible.checked=activeBehavior.dismissible??true;dismissible.addEventListener("change",()=>{activeBehavior.dismissible=dismissible.checked;save()});
    const targeting=(definition as typeof definition & {targeting:{frequency:{mode:"once"|"once_per_session"|"every_time"};priority:number}}).targeting; const frequency=root.querySelector<HTMLSelectElement>("[data-frequency]")!;frequency.value=targeting.frequency.mode;frequency.addEventListener("change",()=>{targeting.frequency.mode=frequency.value as typeof targeting.frequency.mode;save()});const priority=root.querySelector<HTMLInputElement>("[data-priority]")!;priority.value=String(targeting.priority);priority.addEventListener("input",()=>{targeting.priority=Number(priority.value);save()});
    root.querySelector("[data-pick]")?.addEventListener("click", async () => { status.textContent = "Click the element this step should attach to."; const target = await this.picker.pick(); if (!target) { status.textContent = "Selection cancelled."; return; } this.setTarget(definition, target); root.querySelector<HTMLElement>("[data-reliability]")!.textContent = target.reliability === "fragile" ? "Warning: this selector is fragile and may change with the page layout." : `${target.reliability} selector`; save(); });
    root.querySelector("[data-save]")?.addEventListener("click",()=>void persist());
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => button.addEventListener("click", () => { root.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active")); button.classList.add("active"); const index=button.dataset.tab; root.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel)=>panel.hidden=panel.dataset.panel!==index); }));
    renderPreview();
    this.validationTimer=window.setInterval(()=>{void bridge.load().catch(()=>this.destroy())},15_000);
  }

  private setTarget(definition: EditorDraft["version"]["definition"], target: ExperienceTarget): void {
    if (isGuideDefinition(definition)) definition.steps[0].target = target; else (definition as RuntimeWidgetDefinition).target = target;
  }
  destroy(): void { clearTimeout(this.expiryTimer); clearInterval(this.validationTimer); this.preview.destroy(); this.picker.cancel(); this.host?.remove(); this.host = null; }
}

function escapeText(value: string): string { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
const STYLE = `:host{all:initial}aside{position:fixed;right:16px;top:16px;width:340px;z-index:2147483647;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);font:14px ui-sans-serif,system-ui,sans-serif}header{display:flex;flex-direction:column;padding:16px;border-bottom:1px solid #e5e7eb}small{color:#6b7280;margin-top:3px}nav{display:flex;overflow:auto;border-bottom:1px solid #e5e7eb}nav button{border:0;background:transparent;padding:10px 8px;font-size:11px;cursor:pointer}nav button.active{color:#2563eb;border-bottom:2px solid #2563eb}main{display:grid;gap:12px;padding:16px}section{display:grid;gap:12px}label{display:grid;gap:5px;font-size:12px;font-weight:600}label.row{display:flex;align-items:center}label.row input{width:auto}input,textarea,select{box-sizing:border-box;width:100%;border:1px solid #d1d5db;border-radius:7px;padding:8px;font:14px inherit;background:#fff}textarea{min-height:88px;resize:vertical}main button{border:0;border-radius:7px;padding:9px;background:#111827;color:#fff;cursor:pointer}p{margin:0;color:#6b7280;font-size:12px}`;
