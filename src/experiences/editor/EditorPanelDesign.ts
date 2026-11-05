/** Presentation only; loaded with the live editor, never the visitor runtime. */
export function panelIcon(name: 'properties' | 'theme' | 'ai' | 'send' | 'zap'): string {
  const paths = {
    properties: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    theme: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.8-4.2 1.3 1.3 0 0 1 .9-2.3H18a3 3 0 0 0 3-3A8.5 8.5 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".6"/><circle cx="10" cy="6.8" r=".6"/><circle cx="14.5" cy="7" r=".6"/><circle cx="17.3" cy="10.5" r=".6"/>',
    ai: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Zm7-1 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z"/>',
    send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    zap: '<path d="m13 2-9 12h8l-1 8 9-12h-8z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export const EDITOR_PANEL_DESIGN = `
:host{--ep-ink:#202e44;--ep-muted:#62718a;--ep-line:rgba(111,135,174,.18);--ep-blue:#3269ee;--ep-surface:rgba(249,251,255,.93)}
aside{width:min(330px,calc(100vw - 24px));border:1px solid rgba(255,255,255,.86);border-radius:18px;background:var(--ep-surface);color:var(--ep-ink);box-shadow:0 18px 52px rgba(27,47,88,.18),0 2px 7px rgba(27,47,88,.07),inset 0 0 0 4px rgba(221,231,249,.32);overflow:hidden;-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px)}
aside main{background:transparent;border-radius:17px;padding:4px;scrollbar-width:thin;scrollbar-color:#c5d1e5 transparent}
.inspector-tabs{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:3px;padding:8px 10px 9px;background:rgba(245,248,254,.96);border-bottom:1px solid var(--ep-line)}
.panel-wordmark{display:flex;align-items:center;gap:7px;margin-right:auto;font-size:12px;font-weight:700;letter-spacing:-.3px;color:var(--ep-ink)}
.panel-mark{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;color:white;background:linear-gradient(145deg,#427cf8,#2454d8);box-shadow:0 2px 6px #3269ee26}
.panel-mark svg{width:15px;height:15px}
.inspector-tabs button{position:relative;display:grid;place-items:center;flex:none;width:33px;height:32px;padding:0;border:1px solid transparent;border-radius:9px;background:transparent;color:#74839c;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
.inspector-tabs button svg{width:17px;height:17px}
.inspector-tabs button:hover{background:#e6edf9;color:#244a98}
.inspector-tabs button.active{background:#fff;color:var(--ep-blue);border-color:#dce5f6;box-shadow:0 2px 5px #244a9810}
.inspector-tabs button.active:after{content:'';position:absolute;bottom:3px;width:3px;height:3px;border-radius:50%;background:currentColor}
.inspector-tabs button:disabled{opacity:.35;cursor:not-allowed}
aside .section{gap:6px;padding:12px 12px;border-color:var(--ep-line);background:transparent}
aside .content-heading{align-items:center;gap:8px;margin-bottom:9px}
aside .content-heading strong{display:block;margin-top:3px;font-size:16px;font-weight:650;letter-spacing:-.45px;color:var(--ep-ink);line-height:1.25}
aside .eyebrow{font-size:9px;font-weight:700;letter-spacing:1.65px;text-transform:uppercase;color:#7a89a2}
aside label{grid-template-columns:88px minmax(0,1fr);gap:8px;margin:0;padding:5px 0;font-size:11px;color:#596981;align-items:center}
aside input,aside select{min-width:0;min-height:32px;border:1px solid #dbe3f0;border-radius:8px;padding:6px 8px;background:rgba(255,255,255,.86);color:var(--ep-ink);font:11px/1.4 ui-sans-serif,system-ui,sans-serif;box-shadow:0 1px 2px #20386004}
aside input:hover,aside select:hover{border-color:#b4c6e6}
aside input[type=color]{width:100%;height:32px;padding:4px;cursor:pointer}
aside input[type=color]::-webkit-color-swatch-wrapper{padding:0}
aside input[type=color]::-webkit-color-swatch{border:0;border-radius:5px}
aside .secondary-button{min-height:29px;padding:5px 9px;border:1px solid #d8e2f1;border-radius:8px;background:rgba(255,255,255,.75);color:#50627e;font-size:10px;box-shadow:0 1px 2px #263a5c05}
aside .secondary-button:hover{border-color:#abc0e6;background:#fff;color:#245bd0}
aside .secondary-button:disabled{opacity:.4;cursor:not-allowed}
aside .muted,aside .hint{font-size:10px;line-height:1.5;color:var(--ep-muted)}
aside .hint{padding:8px 12px;margin:0}
aside .history-row{gap:6px;flex-wrap:wrap}
aside .number{gap:7px}
.theme-group-title{margin:14px 0 6px;padding-top:12px;border-top:1px solid var(--ep-line);font-size:9px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#7a89a2}
aside .theme-panel .content-heading{margin-bottom:12px}
aside .live summary{font-size:11px;color:#71809a}
main.ai-mode{display:flex;flex-direction:column;height:min(760px,calc(100dvh - 40px));overflow:hidden}
main.ai-mode .inspector-tabs{flex:none}
aside .ai-panel{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:0;padding:18px 12px 10px;background:radial-gradient(ellipse at 5% 10%,#d9e7fc52,transparent 60%)}
.ai-panel .content-heading{margin:0 4px 10px}
.ai-panel .content-heading strong{font-size:21px}
.ai-panel [data-ai-context]{flex:none;max-width:100%;margin:0 4px 10px;padding:7px 10px;border:1px solid #dce5f2;border-radius:8px;background:#ffffff70;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ai-chat-history{display:flex;flex-direction:column;gap:14px;min-height:80px;padding:12px 5px 22px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c4d1e6 transparent}
.ai-empty-state{display:grid;place-items:center;gap:13px;flex:none;margin:188px auto 0;text-align:center}
.ai-empty-state__icon{display:grid;place-items:center;width:54px;height:54px;border:1px solid #d6e2fb;border-radius:18px;background:radial-gradient(circle at 32% 25%,#fff,#e5edff 70%);color:#3269ee;box-shadow:0 10px 24px #3269ee1c,inset 0 1px 0 #fff}
.ai-empty-state__icon svg{width:29px;height:29px;stroke-width:2}
.ai-empty-state p{max-width:220px;margin:0;font-size:12px;line-height:1.6;color:#7a89a1}
.ai-chat-history:has([data-ai-message-id]) .ai-empty-state{display:none}
.ai-chat-message{display:block;flex:none;max-width:100%;padding:0 2px;border:0;border-radius:0;background:transparent;color:var(--ep-ink)}
.ai-chat-message--user{align-self:stretch;max-width:100%;padding:0;border:0;border-radius:0;background:transparent;color:#26384f;box-shadow:none}
.ai-chat-message__role{display:block;margin-bottom:5px;font-size:9px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#7a89a1}
.ai-chat-message--user .ai-chat-message__role{color:#76849b}
.ai-chat-message p{font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;letter-spacing:-.1px}
.ai-composer{position:relative;flex:none;display:flex;flex-direction:column;align-items:stretch;gap:0;padding:11px;border:1px solid #ffffffd9;border-radius:15px;background:linear-gradient(140deg,#fff9,#e8edf8d9);box-shadow:0 3px 12px #3c5b8d0a,inset 0 1px 0 #fff}
.ai-composer:focus-within{border-color:#a8bff3;box-shadow:0 0 0 3px #3269ee0d}
.ai-panel textarea{display:block;flex:none;min-height:65px;max-height:160px;margin:0;width:100%;padding:3px 2px 10px;resize:vertical;border:0;border-radius:0;background:transparent;box-shadow:none;font:13px/1.7 ui-sans-serif,system-ui,sans-serif;color:#26384f}
.ai-panel textarea:focus-visible{outline:none}
.ai-panel textarea::placeholder{color:#8a97ac}
.ai-composer-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ai-composer-note{display:flex;align-items:center;gap:6px;color:#7b89a1;font-size:10px}
.ai-composer-note svg{width:13px;height:13px}
.ai-proposal-actions{display:flex;flex-wrap:wrap;gap:6px;padding:9px 0 2px;border-top:1px solid #dbe5f5}
.ai-proposal-actions .secondary-button{min-height:29px;padding:5px 9px;border-radius:8px;background:#fff;color:#5c6f8d;font-size:10px;box-shadow:none}
.ai-proposal-actions [data-ai-apply]{border-color:#3269ee;background:#3269ee;color:#fff}
.ai-proposal-actions [data-ai-apply]:hover{background:#245bd0;color:#fff}
.ai-composer [data-ai-send]{display:grid;place-items:center;min-width:35px;min-height:34px;width:35px;height:34px;padding:0;border:1px solid #2d5fdd;border-radius:10px;background:linear-gradient(150deg,#4d7dfa,#2f63e6);color:#fff;box-shadow:0 3px 7px #3269ee24}
.ai-composer [data-ai-send]:hover{background:#2658d7;color:#fff}
.ai-composer [data-ai-send] svg{width:20px;height:20px}
.ai-composer [data-ai-send]:disabled{opacity:.4}
.ai-status{flex:none;min-height:0;margin:0;padding:0 4px;font-size:11px;line-height:1.5;color:#647690}
.ai-status:not(:empty){padding:8px 4px}
.ai-proposal{display:grid;gap:6px;flex:none;max-height:190px;overflow:auto;margin:2px 2px 0;padding:0 0 1px;border:0;background:transparent;box-shadow:none}
.ai-proposal .ai-chat-message__role{margin:0}
.ai-proposal strong{font-size:12px;line-height:1.55;color:#314562}
.ai-proposal ul{display:grid;gap:3px;margin:0;padding-left:16px;font-size:10px;line-height:1.55;color:#617493}
.ai-proposal .muted{margin:0;font-size:10px;line-height:1.5}
.ai-chat-message .ai-progress[data-ai-progress]{display:flex;align-items:center;gap:8px;margin-top:8px;padding:0;border:0;background:transparent;box-shadow:none}
.ai-progress-current{min-width:0;font-size:11px;line-height:1.45;color:#526b98}
.ai-progress[data-status=active] .ai-progress-current{background:linear-gradient(105deg,#526b98 0%,#526b98 35%,#d8e5ff 50%,#526b98 65%,#526b98 100%);background-size:240% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:ep-status-shine 3s ease-in-out infinite}
.ai-progress-elapsed{margin-left:auto;font-size:10px;color:#8a97ad;font-variant-numeric:tabular-nums}
.ai-progress details{display:none}
@keyframes ep-status-shine{to{background-position:-240% 0}}
.editor-toolbar{border-radius:15px;background:rgba(249,251,255,.95);border-color:#fff;box-shadow:0 8px 30px #243d701c;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}
.editor-toolbar .modebar{gap:3px;padding:6px;background:#edf2fa75}
.editor-toolbar .modebar button{border-radius:8px;border-color:transparent;background:transparent;color:#697a95}
.editor-toolbar .modebar button.active{background:#fff;border-color:#d9e3f4;color:#3269ee}
aside :is(button,input,select,summary):focus-visible{outline:2px solid #3269ee;outline-offset:3px}
@supports not (backdrop-filter:blur(1px)){aside{background:#f2f6fd}}
@media(max-width:600px){aside{width:min(360px,calc(100vw - 16px));border-radius:18px}aside .section{padding:14px 12px}main.ai-mode{height:min(660px,calc(100dvh - 115px))}.ai-panel .content-heading strong{font-size:19px}}
@media(prefers-reduced-motion:reduce){.inspector-tabs button{transition:none}.ai-progress-current{animation:none!important}}
`;
