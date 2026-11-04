/** Presentation only; loaded with the live editor, never the visitor runtime. */
export function panelIcon(name: 'properties' | 'theme' | 'ai' | 'send'): string {
  const paths = {
    properties: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    theme: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.8-4.2 1.3 1.3 0 0 1 .9-2.3H18a3 3 0 0 0 3-3A8.5 8.5 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".6"/><circle cx="10" cy="6.8" r=".6"/><circle cx="14.5" cy="7" r=".6"/><circle cx="17.3" cy="10.5" r=".6"/>',
    ai: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Zm7-1 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z"/>',
    send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export const EDITOR_PANEL_DESIGN = `
:host{--ep-ink:#202e44;--ep-muted:#62718a;--ep-line:rgba(111,135,174,.18);--ep-blue:#3269ee;--ep-surface:rgba(249,251,255,.93)}
aside{width:min(390px,calc(100vw - 24px));border:1px solid rgba(255,255,255,.86);border-radius:22px;background:var(--ep-surface);color:var(--ep-ink);box-shadow:0 22px 70px rgba(27,47,88,.2),0 2px 8px rgba(27,47,88,.08),inset 0 0 0 5px rgba(221,231,249,.32);overflow:hidden;-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px)}
aside main{background:transparent;border-radius:21px;padding:6px;scrollbar-width:thin;scrollbar-color:#c5d1e5 transparent}
.inspector-tabs{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:4px;padding:10px 12px 12px;background:rgba(245,248,254,.96);border-bottom:1px solid var(--ep-line)}
.panel-wordmark{display:flex;align-items:center;gap:8px;margin-right:auto;font-size:13px;font-weight:700;letter-spacing:-.3px;color:var(--ep-ink)}
.panel-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;color:white;background:linear-gradient(145deg,#427cf8,#2454d8);box-shadow:0 3px 8px #3269ee26}
.panel-mark svg{width:17px;height:17px}
.inspector-tabs button{position:relative;display:grid;place-items:center;flex:none;width:38px;height:36px;padding:0;border:1px solid transparent;border-radius:11px;background:transparent;color:#74839c;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
.inspector-tabs button svg{width:19px;height:19px}
.inspector-tabs button:hover{background:#e6edf9;color:#244a98}
.inspector-tabs button.active{background:#fff;color:var(--ep-blue);border-color:#dce5f6;box-shadow:0 2px 5px #244a9810}
.inspector-tabs button.active:after{content:'';position:absolute;bottom:3px;width:3px;height:3px;border-radius:50%;background:currentColor}
.inspector-tabs button:disabled{opacity:.35;cursor:not-allowed}
aside .section{padding:18px 16px;border-color:var(--ep-line);background:transparent}
aside .content-heading{align-items:center;gap:10px;margin-bottom:14px}
aside .content-heading strong{display:block;margin-top:5px;font-size:18px;font-weight:650;letter-spacing:-.55px;color:var(--ep-ink);line-height:1.3}
aside .eyebrow{font-size:9px;font-weight:700;letter-spacing:1.65px;text-transform:uppercase;color:#7a89a2}
aside label{grid-template-columns:104px minmax(0,1fr);gap:12px;margin:0;padding:7px 0;font-size:12px;color:#596981;align-items:center}
aside input,aside select{min-width:0;min-height:36px;border:1px solid #dbe3f0;border-radius:9px;padding:8px 10px;background:rgba(255,255,255,.86);color:var(--ep-ink);font:12px/1.4 ui-sans-serif,system-ui,sans-serif;box-shadow:0 1px 2px #20386004}
aside input:hover,aside select:hover{border-color:#b4c6e6}
aside input[type=color]{width:100%;height:36px;padding:5px;cursor:pointer}
aside input[type=color]::-webkit-color-swatch-wrapper{padding:0}
aside input[type=color]::-webkit-color-swatch{border:0;border-radius:5px}
aside .secondary-button{min-height:32px;padding:7px 11px;border:1px solid #d8e2f1;border-radius:9px;background:rgba(255,255,255,.75);color:#50627e;font-size:11px;box-shadow:0 1px 2px #263a5c05}
aside .secondary-button:hover{border-color:#abc0e6;background:#fff;color:#245bd0}
aside .secondary-button:disabled{opacity:.4;cursor:not-allowed}
aside .muted,aside .hint{font-size:11px;line-height:1.6;color:var(--ep-muted)}
aside .hint{padding:10px 16px;margin:0}
aside .history-row{gap:6px;flex-wrap:wrap}
aside .number{gap:7px}
.theme-group-title{margin:20px 0 7px;padding-top:16px;border-top:1px solid var(--ep-line);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#7a89a2}
aside .theme-panel .content-heading{margin-bottom:18px}
aside .live summary{font-size:11px;color:#71809a}
main.ai-mode{display:flex;flex-direction:column;height:min(760px,calc(100dvh - 40px));overflow:hidden}
main.ai-mode .inspector-tabs{flex:none}
aside .ai-panel{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:0;padding:18px 12px 10px;background:radial-gradient(ellipse at 5% 10%,#d9e7fc52,transparent 60%)}
.ai-panel .content-heading{margin:0 4px 10px}
.ai-panel .content-heading strong{font-size:21px}
.ai-panel [data-ai-context]{flex:none;max-width:100%;margin:0 4px 10px;padding:7px 10px;border:1px solid #dce5f2;border-radius:8px;background:#ffffff70;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ai-chat-history{display:flex;flex-direction:column;gap:21px;min-height:80px;padding:12px 5px 22px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c4d1e6 transparent}
.ai-chat-history:empty:before{content:'A little direction. A better design.';display:block;margin-top:35px;font-size:20px;line-height:1.4;letter-spacing:-.6px;color:#415675;max-width:230px}
.ai-chat-history:empty:after{content:'Describe what you’d like to change. Refine the details, or explore a whole new look.';display:block;max-width:265px;font-size:13px;line-height:1.8;color:#7a89a1}
.ai-chat-message{display:block;flex:none;max-width:100%;padding:0 5px;border:0;border-radius:0;background:transparent;color:var(--ep-ink)}
.ai-chat-message--user{align-self:stretch;max-width:100%;padding:13px 14px;border:1px solid #ffffffc9;border-radius:13px;background:linear-gradient(135deg,#fff9,#e4ebf6c9);color:#26384f;box-shadow:0 2px 5px #253f7105}
.ai-chat-message__role{display:block;margin-bottom:8px;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#7a89a1}
.ai-chat-message--user .ai-chat-message__role{color:#76849b}
.ai-chat-message p{font-size:13px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;letter-spacing:-.1px}
.ai-composer{position:relative;flex:none;display:flex;flex-direction:column;align-items:stretch;gap:0;padding:11px;border:1px solid #ffffffd9;border-radius:15px;background:linear-gradient(140deg,#fff9,#e8edf8d9);box-shadow:0 3px 12px #3c5b8d0a,inset 0 1px 0 #fff}
.ai-composer:focus-within{border-color:#a8bff3;box-shadow:0 0 0 3px #3269ee0d}
.ai-panel textarea{display:block;flex:none;min-height:65px;max-height:160px;margin:0;width:100%;padding:3px 2px 10px;resize:vertical;border:0;border-radius:0;background:transparent;box-shadow:none;font:13px/1.7 ui-sans-serif,system-ui,sans-serif;color:#26384f}
.ai-panel textarea:focus-visible{outline:none}
.ai-panel textarea::placeholder{color:#8a97ac}
.ai-composer-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ai-composer-note{display:flex;align-items:center;gap:6px;color:#7b89a1;font-size:10px}
.ai-composer-note svg{width:13px;height:13px}
.ai-composer [data-ai-send]{display:grid;place-items:center;min-width:35px;min-height:34px;width:35px;height:34px;padding:0;border:1px solid #2d5fdd;border-radius:10px;background:linear-gradient(150deg,#4d7dfa,#2f63e6);color:#fff;box-shadow:0 3px 7px #3269ee24}
.ai-composer [data-ai-send]:hover{background:#2658d7;color:#fff}
.ai-composer [data-ai-send] svg{width:20px;height:20px}
.ai-composer [data-ai-send]:disabled{opacity:.4}
.ai-status{flex:none;min-height:0;margin:0;padding:0 4px;font-size:11px;line-height:1.5;color:#647690}
.ai-status:not(:empty){padding:8px 4px}
.ai-proposal{flex:none;max-height:190px;overflow:auto;margin-top:10px;padding:13px;border:1px solid #cbdaf4;border-radius:12px;background:#f8fbffd9;box-shadow:0 2px 8px #3269ee08}
.ai-proposal strong{font-size:12px;line-height:1.6}
.ai-proposal ul{font-size:10px;line-height:1.7}
.ai-proposal [data-ai-apply]{background:#3269ee;border-color:#3269ee;color:white}
.ai-chat-message .ai-progress[data-ai-progress]{position:relative;margin-top:12px;padding:14px 13px 14px 39px;border:1px solid #dce6f7;border-radius:12px;background:linear-gradient(125deg,#eef4ff,#f8faff);box-shadow:0 2px 8px #3269ee05;gap:4px 8px}
.ai-progress:before{content:'';position:absolute;left:15px;top:17px;width:11px;height:11px;border:2px solid #c7d8fa;border-top-color:#3269ee;border-radius:50%;animation:ep-working 1.2s linear infinite}
.ai-progress[data-status=complete]:before{animation:none;border:0;width:8px;height:8px;left:18px;top:19px;background:#409b7a}
.ai-progress[data-status=error]:before,.ai-progress[data-status=cancelled]:before{animation:none;border-color:#b27b7b;background:#fff}
.ai-progress [data-ai-progress-detail]{margin:6px 0 0;font-size:11px;line-height:1.7;color:#7384a0}
@keyframes ep-working{to{transform:rotate(360deg)}}
.ai-progress-current{font-size:12px;line-height:1.65;color:#526b98}
.ai-progress-elapsed{display:inline-block;margin-top:4px;font-size:10px;color:#8a97ad;font-variant-numeric:tabular-nums}
.ai-progress details{margin-top:9px;color:#6b7e9d;font-size:11px;line-height:1.7}
.editor-toolbar{border-radius:15px;background:rgba(249,251,255,.95);border-color:#fff;box-shadow:0 8px 30px #243d701c;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}
.editor-toolbar .modebar{gap:3px;padding:6px;background:#edf2fa75}
.editor-toolbar .modebar button{border-radius:8px;border-color:transparent;background:transparent;color:#697a95}
.editor-toolbar .modebar button.active{background:#fff;border-color:#d9e3f4;color:#3269ee}
aside :is(button,input,select,summary):focus-visible{outline:2px solid #3269ee;outline-offset:3px}
@supports not (backdrop-filter:blur(1px)){aside{background:#f2f6fd}}
@media(max-width:600px){aside{width:min(360px,calc(100vw - 16px));border-radius:18px}aside .section{padding:14px 12px}main.ai-mode{height:min(660px,calc(100dvh - 115px))}.ai-panel .content-heading strong{font-size:19px}}
@media(prefers-reduced-motion:reduce){.inspector-tabs button{transition:none}.ai-progress:before{animation:none}}
`;
