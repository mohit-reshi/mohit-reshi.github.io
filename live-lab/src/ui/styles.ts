/** All Live Lab CSS, scoped by the .ll-root class. Light/dark through [data-theme]. */
export const CSS = `
.ll-root{--ll-bg:#ffffff;--ll-fg:#1b1f23;--ll-muted:#57606a;--ll-line:#d0d7de;--ll-card:#f6f8fa;--ll-accent:#2563eb;--ll-accent-fg:#ffffff;--ll-warn-bg:#fff4ce;--ll-warn-fg:#5c4400;--ll-ok:#1a7f37;--ll-bad:#cf222e;
  font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ll-fg);background:var(--ll-bg);border:1px solid var(--ll-line);border-radius:12px;padding:16px;display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
.ll-root[data-theme=dark]{--ll-bg:#0d1117;--ll-fg:#e6edf3;--ll-muted:#9da7b3;--ll-line:#30363d;--ll-card:#161b22;--ll-accent:#58a6ff;--ll-accent-fg:#0d1117;--ll-warn-bg:#3a2e05;--ll-warn-fg:#f2d58a;--ll-ok:#3fb950;--ll-bad:#ff7b72}
.ll-root *{box-sizing:border-box}
.ll-root [hidden]{display:none!important}
.ll-root :focus-visible{outline:3px solid var(--ll-accent);outline-offset:2px}
.ll-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.ll-head h2{margin:0;font-size:20px}
.ll-pill{border:1px solid var(--ll-line);border-radius:999px;padding:2px 10px;font-size:12px;color:var(--ll-muted)}
.ll-pill[data-state=live]{color:var(--ll-ok);border-color:var(--ll-ok)}.ll-pill[data-state=recorded]{color:var(--ll-warn-fg);background:var(--ll-warn-bg)}
.ll-banner{background:var(--ll-warn-bg);color:var(--ll-warn-fg);border-radius:8px;padding:8px 12px}
.ll-pick{display:grid;gap:8px;min-width:0}.ll-root select{min-width:0;max-width:100%;width:100%}.ll-pick label{display:grid;gap:4px;font-weight:600}
.ll-root select,.ll-root button{font:inherit;color:inherit;background:var(--ll-card);border:1px solid var(--ll-line);border-radius:8px;padding:6px 10px}
.ll-root button{cursor:pointer}.ll-root button:hover:not(:disabled){border-color:var(--ll-accent)}.ll-root button:disabled{opacity:.5;cursor:not-allowed}
.ll-root button.ll-primary,.ll-tab[aria-selected=true]{background:var(--ll-accent);color:var(--ll-accent-fg);border-color:var(--ll-accent)}
.ll-personas{border:1px solid var(--ll-line);border-radius:8px;padding:8px 12px;display:grid;gap:6px}.ll-personas legend{padding:0 6px;font-weight:600}
.ll-personas .ll-opts{display:flex;gap:12px;flex-wrap:wrap}.ll-personas label{display:flex;gap:6px;align-items:center;font-weight:500}
.ll-rls{margin:0;color:var(--ll-muted);font-size:13px}
.ll-tabs{display:flex;gap:6px}.ll-tab{border-radius:8px 8px 0 0}
.ll-nav,.ll-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.ll-nav button[aria-current=true]{background:var(--ll-accent);color:var(--ll-accent-fg);border-color:var(--ll-accent)}
.ll-stage{position:relative;border:1px solid var(--ll-line);border-radius:8px;min-height:240px;background:var(--ll-card);overflow:hidden}
.ll-embed{width:100%;min-height:240px}.ll-embed iframe{width:100%;height:520px;border:0}
.ll-loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--ll-muted);background:var(--ll-card)}
.ll-fallback{padding:12px;display:grid;gap:8px}.ll-fallback video,.ll-fallback img{max-width:100%;border-radius:6px}.ll-fallback ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.ll-side{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.ll-side h3{margin:0 0 4px;font-size:14px}.ll-panel{border:1px solid var(--ll-line);border-radius:8px;padding:8px;background:var(--ll-card);min-height:90px}
.ll-log{max-height:220px;overflow:auto;font:12px/1.4 ui-monospace,Consolas,monospace;display:grid;gap:2px}.ll-log div{word-break:break-all}.ll-log .t{color:var(--ll-muted)}.ll-log .n{font-weight:700}.ll-log .src-ui .n{color:var(--ll-accent)}
.ll-hint{font-size:13px;color:var(--ll-muted)}.ll-hint button{padding:2px 8px;font-size:12px}
.ll-code{display:grid;gap:8px;grid-template-columns:minmax(160px,220px) minmax(0,1fr)}@media (max-width:640px){.ll-code{grid-template-columns:1fr}}
.ll-snips{display:grid;gap:4px;align-content:start}.ll-snips button{text-align:left}.ll-snips button[aria-current=true]{border-color:var(--ll-accent);box-shadow:inset 3px 0 0 var(--ll-accent)}
.ll-codehead{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12px;color:var(--ll-muted)}
.ll-codebox{overflow:auto;border:1px solid var(--ll-line);border-radius:8px;background:#0d1117;max-height:520px}.ll-codebox pre{margin:0;padding:8px 0;background:transparent!important}
.ll-codebox code{counter-reset:ln;display:flex;flex-direction:column;font:12.5px/1.55 ui-monospace,Consolas,monospace}.ll-codebox .line{display:block;padding:0 12px 0 0;white-space:pre;min-height:1.55em}
.ll-codebox .line::before{counter-increment:ln;content:counter(ln);display:inline-block;width:3em;margin-right:12px;text-align:right;color:#6e7681}
.ll-codebox .line.ll-hl{background:rgba(88,166,255,.22);box-shadow:inset 3px 0 0 #58a6ff}
.ll-copied{display:block;min-height:1.4em;margin-top:.4rem;font-size:.8rem;opacity:.85}
.ll-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:no-preference){.ll-root button{transition:border-color .15s,background .15s}.ll-codebox .line{transition:background .25s}}
@media (prefers-reduced-motion:reduce){.ll-root *{animation:none!important;transition:none!important}}
`;
