export const guideCapturePanel = `
<style>
  :host{all:initial;font:14px/1.45 system-ui,sans-serif;color:#17233b}
  *{box-sizing:border-box}
  aside{position:fixed;top:12px;right:12px;width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;pointer-events:auto;background:white;border:1px solid #dce3ed;border-radius:14px;box-shadow:0 8px 26px #15274626}
  header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 15px;border-bottom:1px solid #e7edf5}
  header .row{flex-wrap:nowrap}
  main{display:grid;gap:12px;padding:14px}
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
</style>
<aside aria-label="Guided Capture">
  <header><h2>Guided Capture</h2><div class="row"><button type="button" data-collapse aria-expanded="true" aria-controls="movcues-capture-content">Minimize</button><button type="button" data-close aria-label="Close Guided Capture">Close</button></div></header>
  <main id="movcues-capture-content">
    <p class="muted" data-message role="status" aria-live="polite">Restoring capture…</p>
    <section data-capture hidden>
      <div class="row" role="group" aria-label="Capture mode">
        <button type="button" data-mode="select">Select Elements</button>
        <button type="button" data-mode="navigate">Navigate</button>
      </div>
      <p class="muted" data-instructions></p>
      <ol data-targets aria-label="Captured elements"></ol>
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
      <p data-preview-position class="muted"></p>
      <p data-preview-details class="muted"></p>
      <p data-preview-target class="muted" role="status"></p>
      <div class="row"><button type="button" data-previous>Previous step</button><button type="button" data-next>Next step</button></div>
      <div class="row"><button type="button" data-apply data-primary>Apply to draft</button><button type="button" data-edit-plan>Edit plan</button></div>
    </section>
    <p class="muted" data-checkpoint role="status" aria-live="polite"></p>
    <div class="row">
      <button type="button" data-cancel hidden>Cancel request</button>
      <button type="button" data-retry hidden>Retry checkpoint</button>
      <button type="button" data-refresh hidden>Load latest checkpoint</button>
    </div>
    <button type="button" data-reload hidden>Retry loading capture</button>
  </main>
</aside>`;

export function captureHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
