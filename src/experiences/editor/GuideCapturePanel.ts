import { dockIcon, dockPopup, dockTrigger, geoDockMark } from "./EditorDock";

export const captureStyles = `
  :host{all:initial;font:14px/1.45 system-ui,sans-serif;color:#17233b}
  *{box-sizing:border-box}
  [data-dock-popup] .dock-pop-body{display:grid;gap:10px}
  [data-dock-popup] .row:last-child:empty{display:none}
  h2,p,ol{margin:0} h2{font-size:15px}
  label{display:grid;gap:5px;font-size:12px;font-weight:600}
  button,input,select,textarea{font:inherit}
  button{padding:6px 9px;border:1px solid #ccd6e4;background:white;color:#21314d;border-radius:6px;cursor:pointer;font-size:12px}
  button:hover{background:#f3f6fc}
  button[aria-pressed=true],button[data-primary]{background:#1d4ed8;color:white;border-color:#1d4ed8}
  button:disabled{opacity:.55;cursor:default}
  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
  ol{list-style:none;padding:0;display:grid;gap:6px}
  li,fieldset{background:#f7f9fc;border:1px solid #e1e8f3;border-radius:7px;padding:8px}
  fieldset{display:grid;gap:7px;min-width:0;margin:0}
  legend{font-weight:650;font-size:12px}
  form,section{display:grid;gap:8px}
  small{display:block;font-size:11px;color:#43546d;overflow-wrap:anywhere}
  .row{display:flex;flex-wrap:wrap;align-items:center;gap:5px}
  .list-head{display:flex;align-items:baseline;gap:7px;overflow-wrap:anywhere}
  .number{font-weight:700;color:#1d4ed8}
  .warning{color:#8d430c}
  .muted{color:#475b75;font-size:12px}
  input,select,textarea{width:100%;min-width:0;padding:6px 7px;border-radius:6px;border:1px solid #ccd6e4;color:#17233b;background:white}
  textarea{resize:vertical}
  [hidden]{display:none!important}
`;

export const captureControls = `
  <div class="dock-group">${dockTrigger("generate", "Plan a guide with Geo", geoDockMark + '<span>Geo</span>', 'data-capture-geo')}</div>
  <div class="dock-group dock-modes" data-capture-modes role="group" aria-label="Capture mode">
    <button type="button" data-mode="select" title="Select elements ? Shift + F8">${dockIcon("select")} Select</button>
    <button type="button" data-mode="navigate" title="Navigate ? Shift + F8">${dockIcon("navigate")} Navigate</button>
  </div>
  <div class="dock-group" data-capture-actions>
    ${dockTrigger("targets", "Captured elements", '<span class="dock-chip" data-capture-count>0 elements</span>')}
    <button type="button" data-undo-target aria-label="Undo last selection" title="Undo last selection">${dockIcon("undo")}</button>
    ${dockTrigger("generate", "Generate guide", dockIcon("spark") + " Generate", 'data-generate data-primary')}
  </div>
  <div class="dock-group" data-capture-review hidden>
    <span class="dock-indicator" data-capture-stage></span>
    <button type="button" data-previous aria-label="Previous step" title="Previous step" hidden>${dockIcon("left")}</button>
    <span class="dock-chip" data-preview-position hidden></span>
    <button type="button" data-next aria-label="Next step" title="Next step" hidden>${dockIcon("right")}</button>
    ${dockTrigger("generate", "Review guide generation", 'Review')}
  </div>
  <div class="dock-group">
    ${dockTrigger("capture-status", "Capture status", '<span class="dock-status-text" data-checkpoint>Restoring?</span>', 'data-capture-status')}
    <button type="button" data-close aria-label="Close Guided Capture" title="Close Guided Capture">${dockIcon("close")}</button>
  </div>`;

export const capturePopups =
  dockPopup("targets", "Captured elements", `<div class="dock-pop-body">
    <p class="muted" data-instructions role="status"></p>
    <ol data-targets aria-label="Captured elements"></ol>
    <div class="row"><button type="button" data-restart>Restart capture</button><button type="button" data-discard>Discard and close</button></div>
    <small>Shift + F8 switches modes. Shift + Tab also works in menus and listboxes.</small>
  </div>`) +
  dockPopup("generate", "Generate a guide", `<div class="dock-pop-body">
    <section data-capture hidden>
      <form data-prompt-form>
        <label>What should this guide help users do?
          <textarea data-prompt rows="3" maxlength="2000" required placeholder="Help new customers create their first invoice."></textarea>
        </label>
        <div class="row"><button type="submit" data-primary data-plan>Plan with Geo</button></div>
      </form>
    </section>
    <section data-plan-panel hidden>
      <h2>Review the plan</h2>
      <div data-plan-steps></div>
      <div class="row"><button type="button" data-compile data-primary>Generate preview</button><button type="button" data-edit-capture>Back to capture</button></div>
    </section>
    <section data-preview hidden>
      <h2>Design preview</h2>
      <p class="muted">Inspect layouts here. Apply the draft to test the full journey in the editor.</p>
      <p data-preview-details class="muted"></p>
      <p data-preview-target class="muted" role="status"></p>
      <div class="row"><button type="button" data-apply data-primary>Apply to draft</button><button type="button" data-edit-plan>Edit plan</button></div>
    </section>
    <p class="muted" data-workflow-message role="status" aria-live="polite" hidden></p>
    <div class="row"><button type="button" data-cancel hidden>Stop</button></div>
  </div>`, geoDockMark) +
  dockPopup("capture-status", "Capture status", `<div class="dock-pop-body">
    <p class="muted" data-message role="status" aria-live="polite">Restoring capture?</p>
    <p class="muted" data-checkpoint-details role="status"></p>
    <div class="row">
      <button type="button" data-retry hidden>Retry checkpoint</button>
      <button type="button" data-refresh hidden>Load latest checkpoint</button>
      <button type="button" data-reload hidden>Retry loading capture</button>
    </div>
  </div>`);

export function captureHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
