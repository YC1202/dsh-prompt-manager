/** Stylesheet served inside the standalone management page. */
export const STYLES = String.raw`
:root {
  color-scheme: dark;
  --bg: #0b0d12;
  --bg-glow: rgba(77, 124, 254, 0.16);
  --panel: #11151e;
  --panel-2: #161c28;
  --panel-3: #1c2332;
  --border: #232c3d;
  --border-strong: #34415a;
  --fg: #e8ecf5;
  --fg-soft: #c4ccdd;
  --muted: #8a94aa;
  --faint: #7c879c;
  --accent: #7ba2ff;
  --accent-strong: #4d7cfe;
  --accent-soft: rgba(109, 150, 255, 0.14);
  --primary: #2f5fd0;
  --primary-hover: #2851b8;
  --mint: #7ee0c3;
  --amber: #f5b864;
  --danger: #ff7b8a;
  --shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
  --radius: 12px;
  --mono: ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, "Liberation Mono", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --tok-heading: #9ab8ff;
  --tok-code: #7ee0c3;
  --tok-quote: #93a2c4;
  --tok-link: #7fc6ff;
  --tok-bold: #ffd479;
  --tok-fence: #5d6a86;
  --tok-mark: #f5b864;
  --tok-key: #c9a4ff;
}
:root[data-theme="light"] {
  color-scheme: light;
  --bg: #f2f4f9;
  --bg-glow: rgba(77, 124, 254, 0.12);
  --panel: #ffffff;
  --panel-2: #f5f7fc;
  --panel-3: #eceff7;
  --border: #dfe4ee;
  --border-strong: #c3ccdd;
  --fg: #17202f;
  --fg-soft: #344058;
  --muted: #5b6880;
  --faint: #5f6b82;
  --accent: #2f63e8;
  --accent-strong: #2757c9;
  --accent-soft: rgba(47, 99, 232, 0.1);
  --primary: #2757c9;
  --primary-hover: #1f47a8;
  --mint: #0f8a6d;
  --amber: #a86b00;
  --danger: #c93b50;
  --shadow: 0 24px 70px rgba(23, 32, 47, 0.18);
  --tok-heading: #2757c9;
  --tok-code: #0f7f68;
  --tok-quote: #5d6a85;
  --tok-link: #0a68c9;
  --tok-bold: #8a5a00;
  --tok-fence: #8a94ab;
  --tok-mark: #a86b00;
  --tok-key: #6b3fc0;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: var(--sans);
  font-size: 14px;
  color: var(--fg);
  background:
    radial-gradient(1100px 520px at 88% -12%, var(--bg-glow), transparent 62%),
    var(--bg);
  overflow: hidden;
}
button, input, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; }
a { color: var(--accent); text-decoration: none; }
kbd {
  font-family: var(--mono);
  font-size: 10.5px;
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--panel-3);
  color: var(--fg-soft);
}
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-track { background: transparent; }

#app { height: 100vh; display: flex; flex-direction: column; }

/* ---------- top bar ---------- */
.topbar {
  flex: 0 0 auto;
  height: 62px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  backdrop-filter: blur(14px);
  z-index: 30;
}
.brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.brand-mark {
  width: 34px; height: 34px; flex: 0 0 auto;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: linear-gradient(140deg, var(--accent-soft), rgba(126, 224, 195, 0.08));
  display: grid; place-items: center;
}
.brand-mark svg { width: 22px; height: 22px; }
.brand-text { min-width: 0; }
.brand-text h1 { margin: 0; font-size: 14.5px; font-weight: 650; letter-spacing: 0.2px; white-space: nowrap; }
.brand-text p { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.top-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.saved-hint { font-size: 11.5px; color: var(--muted); margin-right: 4px; white-space: nowrap; }

/* ---------- controls ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--panel-2);
  color: var(--fg-soft);
  font-size: 12.5px;
  transition: background 0.14s, border-color 0.14s, color 0.14s, opacity 0.14s;
  white-space: nowrap;
}
.btn:hover:not(:disabled) { background: var(--panel-3); color: var(--fg); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn:focus-visible, .icon-btn:focus-visible, .segmented button:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}
.btn.primary {
  background: var(--primary); border-color: transparent; color: #fff;
}
.btn.primary:hover:not(:disabled) { background: var(--primary-hover); color: #fff; }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover:not(:disabled) { background: var(--panel-2); color: var(--fg); }
.btn.danger { border-color: color-mix(in srgb, var(--danger) 55%, transparent); color: var(--danger); background: transparent; }
.btn.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.icon-btn {
  width: 32px; height: 32px; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 8px; border: 1px solid transparent; background: transparent;
  color: var(--muted); font-size: 15px;
}
.icon-btn:hover { background: var(--panel-2); color: var(--fg); }
.icon-btn svg { width: 17px; height: 17px; }
.only-mobile { display: none; }

/* ---------- layout ---------- */
.layout {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 304px minmax(0, 1fr);
}

/* ---------- sidebar ---------- */
#sidebar {
  min-height: 0;
  display: flex; flex-direction: column;
  background: color-mix(in srgb, var(--panel) 72%, transparent);
  border-right: 1px solid var(--border);
  z-index: 25;
}
.sidebar-head { padding: 13px 13px 9px; }
.search-wrap { position: relative; }
.search-wrap input {
  width: 100%; height: 34px; padding: 0 64px 0 32px;
  border-radius: 9px; border: 1px solid var(--border);
  background: var(--panel-2); outline: none;
  font-size: 12.5px;
}
.search-wrap input:focus { border-color: var(--accent-strong); background: var(--panel); }
.search-wrap .search-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--faint); font-size: 13px; pointer-events: none;
}
.search-wrap kbd { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.file-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 9px 14px; }
.group { margin-top: 8px; }
.group-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 7px;
  padding: 9px 7px 5px;
}
.group-head .g-kicker { font-size: 10px; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase; color: var(--muted); }
.group-head .g-name { font-size: 12px; font-weight: 600; color: var(--fg-soft); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-head .g-sub { flex-basis: 100%; font-size: 11px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group.missing .g-sub { color: var(--danger); }
.group-empty { padding: 2px 9px 8px; font-size: 11px; color: var(--danger); line-height: 1.6; }
.file-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 9px; margin: 2px 0;
  border-radius: 9px; border: 1px solid transparent;
  cursor: pointer; user-select: none;
}
.file-item:hover { background: var(--panel-2); }
.file-item:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: -2px; }
.file-item.active { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 36%, transparent); }
.file-item .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--faint); }
.file-item.exists .dot { background: var(--mint); }
.file-item.dirty .dot { background: var(--amber); box-shadow: 0 0 0 3px color-mix(in srgb, var(--amber) 20%, transparent); }
.file-item .fi-main { min-width: 0; flex: 1 1 auto; }
.file-item .fi-title { font-size: 12.8px; font-weight: 540; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-item .fi-sub { margin-top: 1px; font-size: 11.3px; color: var(--faint); font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-item .fi-meta { flex: 0 0 auto; font-size: 10.5px; color: var(--faint); display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.file-item .tag { padding: 0 5px; border-radius: 4px; background: var(--panel-3); color: var(--muted); font-size: 10.2px; line-height: 16px; }
.file-item .tag.missing { color: var(--faint); background: transparent; border: 1px dashed var(--border-strong); }
.sidebar-foot { flex: 0 0 auto; border-top: 1px solid var(--border); padding: 10px 13px; font-size: 10.8px; color: var(--faint); line-height: 1.7; }
.sidebar-foot .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sidebar-foot kbd { font-size: 9.5px; }
.list-empty { padding: 26px 12px; text-align: center; color: var(--faint); font-size: 12px; line-height: 1.8; }

/* ---------- main ---------- */
main { min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
.empty-state {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 28px;
}
.empty-card { max-width: 470px; text-align: center; }
.empty-card .glyph {
  width: 66px; height: 66px; margin: 0 auto 18px;
  border-radius: 18px; border: 1px solid var(--border-strong);
  background: linear-gradient(150deg, var(--accent-soft), transparent);
  display: grid; place-items: center;
}
.empty-card .glyph svg { width: 32px; height: 32px; }
.empty-card h2 { margin: 0 0 8px; font-size: 17px; font-weight: 650; }
.empty-card p { margin: 0; color: var(--muted); font-size: 12.8px; line-height: 1.8; }
.empty-card .hint { margin-top: 14px; font-size: 11.5px; color: var(--faint); }

#editorPane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.editor-head {
  flex: 0 0 auto;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: flex-start; gap: 14px;
}
.file-ident { min-width: 0; flex: 1 1 auto; }
.crumbs { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); margin-bottom: 3px; }
.crumbs .sep { color: var(--faint); }
.file-title-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.file-title-row h2 { margin: 0; font-size: 15.5px; font-weight: 650; letter-spacing: 0.2px; }
.badge-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.path-line { margin-top: 3px; font-family: var(--mono); font-size: 11.2px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  height: 19px; padding: 0 7px; border-radius: 6px;
  font-size: 10px; line-height: 1;
  background: var(--panel-3); color: var(--muted); border: 1px solid transparent;
}
.badge.ok { color: var(--mint); background: color-mix(in srgb, var(--mint) 12%, transparent); }
.badge.warn { color: var(--amber); background: color-mix(in srgb, var(--amber) 12%, transparent); }
.badge.missing { border: 1px dashed var(--border-strong); background: transparent; }
.editor-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
.segmented { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--panel-3); border: 1px solid var(--border); }
.segmented button {
  height: 26px; padding: 0 9px; border: 0; border-radius: 6px;
  background: transparent; color: var(--muted); font-size: 11.5px;
}
.segmented button[aria-pressed="true"] { background: var(--panel); color: var(--fg); box-shadow: 0 1px 4px rgba(0,0,0,0.22); }

.banner {
  margin: 10px 16px 0;
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--border-strong);
  background: var(--panel-2);
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; color: var(--fg-soft);
}
.banner.warn { border-color: color-mix(in srgb, var(--amber) 55%, transparent); background: color-mix(in srgb, var(--amber) 8%, var(--panel)); }
.banner.error { border-color: color-mix(in srgb, var(--danger) 55%, transparent); background: color-mix(in srgb, var(--danger) 8%, var(--panel)); }
.banner .b-text { flex: 1 1 auto; line-height: 1.6; }
.banner .b-actions { display: flex; gap: 6px; flex: 0 0 auto; }

.editor-body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.editor-body.mode-split { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pane-editor { min-width: 0; min-height: 0; display: flex; position: relative; }
.editor-body.mode-preview .pane-editor { display: none; }
.pane-preview { min-width: 0; min-height: 0; display: none; overflow: auto; padding: 20px 24px 60px; border-left: 1px solid var(--border); background: color-mix(in srgb, var(--panel) 46%, transparent); }
.editor-body.mode-split .pane-preview, .editor-body.mode-preview .pane-preview { display: block; }
.code-wrap { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; }
#highlight, #editor {
  position: absolute; inset: 0; margin: 0;
  padding: 16px 18px 120px;
  font-family: var(--mono);
  font-size: 13.2px;
  line-height: 1.68;
  letter-spacing: 0;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  border: 0;
}
#highlight { overflow: hidden; color: var(--fg-soft); pointer-events: none; background: transparent; z-index: 1; }
#highlight::selection { background: transparent; }
#editor {
  z-index: 2;
  resize: none; outline: none;
  color: transparent;
  caret-color: var(--fg);
  background: transparent;
  overflow: auto;
}
#editor::selection { background: rgba(109, 150, 255, 0.3); }
#editor::placeholder { color: var(--faint); }
.tok-heading { color: var(--tok-heading); font-weight: 650; }
.tok-code { color: var(--tok-code); }
.tok-fence { color: var(--tok-fence); font-style: italic; }
.tok-quote { color: var(--tok-quote); font-style: italic; }
.tok-list { color: var(--tok-mark); }
.tok-hr { color: var(--tok-fence); }
.tok-bold { color: var(--tok-bold); font-weight: 650; }
.tok-link { color: var(--tok-link); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--tok-link) 40%, transparent); }
.tok-key { color: var(--tok-key); }
.tok-comment { color: var(--faint); font-style: italic; }
.tok-inline-code { color: var(--tok-code); background: color-mix(in srgb, var(--tok-code) 12%, transparent); border-radius: 3px; }

.statusbar {
  flex: 0 0 auto;
  height: 36px;
  border-top: 1px solid var(--border);
  display: flex; align-items: center; gap: 16px;
  padding: 0 16px;
  font-size: 11px; color: var(--muted);
  background: color-mix(in srgb, var(--panel) 76%, transparent);
}
.statusbar .spacer { flex: 1 1 auto; }
.statusbar .dot-sep { color: var(--faint); }
.statusbar .warn { color: var(--amber); }
#statusPath { max-width: 42%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); font-size: 10.5px; }
#statusStats { white-space: nowrap; }
#statusSaved { white-space: nowrap; }

/* ---------- markdown preview ---------- */
.md { font-size: 13.6px; line-height: 1.78; color: var(--fg-soft); overflow-wrap: anywhere; }
.md > :first-child { margin-top: 0; }
.md h1, .md h2, .md h3, .md h4, .md h5, .md h6 { color: var(--fg); font-weight: 650; line-height: 1.4; margin: 1.5em 0 0.55em; }
.md h1 { font-size: 1.62em; border-bottom: 1px solid var(--border); padding-bottom: 0.28em; }
.md h2 { font-size: 1.32em; }
.md h3 { font-size: 1.14em; }
.md h4, .md h5, .md h6 { font-size: 1em; }
.md p { margin: 0.65em 0; }
.md ul, .md ol { margin: 0.55em 0; padding-left: 1.5em; }
.md li { margin: 0.22em 0; }
.md li > p { margin: 0.2em 0; }
.md blockquote { margin: 0.8em 0; padding: 0.15em 0 0.15em 0.95em; border-left: 3px solid var(--border-strong); color: var(--muted); }
.md code { font-family: var(--mono); font-size: 0.9em; padding: 0.14em 0.38em; border-radius: 4px; background: var(--panel-3); color: var(--tok-code); }
.md pre { margin: 0.8em 0; padding: 12px 14px; overflow: auto; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); }
.md pre code { padding: 0; background: transparent; color: var(--fg-soft); font-size: 0.92em; line-height: 1.65; }
.md hr { border: 0; border-top: 1px solid var(--border-strong); margin: 1.35em 0; }
.md a { color: var(--tok-link); text-decoration: underline; text-underline-offset: 2px; }
.md strong { color: var(--fg); }
.md .task { display: inline-flex; align-items: center; gap: 6px; }
.md table { border-collapse: collapse; margin: 0.9em 0; font-size: 0.94em; }
.md th, .md td { border: 1px solid var(--border); padding: 5px 9px; text-align: left; }
.md th { background: var(--panel-2); color: var(--fg); }
.md .md-note { color: var(--faint); font-size: 11.5px; }
.preview-empty { color: var(--faint); font-size: 12px; padding: 6px 0; }

/* ---------- template menu ---------- */
.menu {
  position: fixed; z-index: 60; width: 322px; max-height: 60vh; overflow: auto;
  padding: 6px; border-radius: 12px;
  border: 1px solid var(--border-strong);
  background: var(--panel);
  box-shadow: var(--shadow);
}
.menu-item {
  display: block; width: 100%; text-align: left;
  padding: 9px 10px; border: 0; border-radius: 8px; background: transparent;
}
.menu-item:hover, .menu-item:focus-visible { background: var(--panel-2); outline: none; }
.menu-item .mi-title { display: block; font-size: 12.6px; font-weight: 570; color: var(--fg); }
.menu-item .mi-hint { display: block; margin-top: 2px; font-size: 10.8px; color: var(--muted); }
.menu-head { padding: 7px 10px 6px; font-size: 10px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--faint); }

/* ---------- drawer ---------- */
.drawer {
  position: fixed; top: 62px; right: 0; bottom: 0; z-index: 70;
  width: min(440px, 92vw);
  display: flex; flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
  transform: translateX(103%);
  transition: transform 0.2s ease;
}
.drawer.open { transform: translateX(0); }
.drawer-head { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.drawer-head h2 { margin: 0; font-size: 13.5px; font-weight: 650; }
.drawer-head .scope-label { font-size: 10.8px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer-head .icon-btn { margin-left: auto; }
.drawer-hint { margin: 0; padding: 10px 16px; font-size: 11px; color: var(--muted); line-height: 1.7; border-bottom: 1px solid var(--border); }
.backup-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px; }
.backup-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 9px; border: 1px solid transparent;
}
.backup-row:hover { background: var(--panel-2); border-color: var(--border); }
.backup-row .br-main { min-width: 0; flex: 1 1 auto; }
.backup-row .br-title { font-size: 12px; font-weight: 560; color: var(--fg-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backup-row .br-name { margin-top: 1px; font-family: var(--mono); font-size: 10.8px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backup-row .br-meta { margin-top: 2px; font-size: 11px; color: var(--faint); }
.backup-row .br-actions { display: flex; gap: 5px; flex: 0 0 auto; }
.backup-row .tag { display: inline-block; padding: 0 5px; border-radius: 4px; font-size: 10px; line-height: 16px; }
.backup-row .tag.ok { color: var(--mint); background: color-mix(in srgb, var(--mint) 14%, transparent); }
.muted { color: var(--faint); }
.backup-empty { padding: 30px 16px; text-align: center; color: var(--faint); font-size: 12px; line-height: 1.8; }
.backup-preview { flex: 0 0 auto; max-height: 42%; display: flex; flex-direction: column; border-top: 1px solid var(--border); }
.backup-preview-head { display: flex; align-items: center; gap: 8px; padding: 9px 14px; font-size: 11.5px; color: var(--muted); flex-wrap: wrap; }
.backup-preview-head .name { font-family: var(--mono); font-size: 10.5px; color: var(--fg-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backup-preview-head .diff-stat { font-size: 10.8px; color: var(--muted); margin-left: auto; }
.warn-text { color: var(--amber) !important; }
.backup-preview pre { flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0 12px 12px; padding: 10px 12px; border-radius: 8px; background: var(--panel-2); border: 1px solid var(--border); font-family: var(--mono); font-size: 10.8px; line-height: 1.6; color: var(--fg-soft); white-space: pre-wrap; overflow-wrap: anywhere; }

/* ---------- modal / toast ---------- */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 80;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(4, 6, 10, 0.58); backdrop-filter: blur(3px);
}
.modal {
  width: min(560px, 100%); max-height: 84vh; overflow: auto;
  border-radius: 16px; border: 1px solid var(--border-strong);
  background: var(--panel); box-shadow: var(--shadow);
  padding: 20px 22px;
}
.modal h2 { margin: 0 0 10px; font-size: 16px; font-weight: 650; }
.modal .modal-body { font-size: 12.8px; color: var(--fg-soft); line-height: 1.8; }
.modal .modal-body p { margin: 0.5em 0; }
.modal .modal-body ul { margin: 0.4em 0; padding-left: 1.3em; }
.modal .modal-body code { font-family: var(--mono); font-size: 0.92em; background: var(--panel-3); padding: 0.1em 0.35em; border-radius: 4px; color: var(--tok-code); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.toast {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(12px);
  z-index: 90; max-width: min(560px, calc(100vw - 32px));
  padding: 9px 14px; border-radius: 9px;
  border: 1px solid var(--border-strong);
  background: var(--panel); color: var(--fg-soft);
  box-shadow: var(--shadow); font-size: 12px; line-height: 1.5;
  opacity: 0; pointer-events: none; transition: opacity 0.18s, transform 0.18s;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.toast.ok { border-color: color-mix(in srgb, var(--mint) 45%, transparent); }
.toast.warn { border-color: color-mix(in srgb, var(--amber) 55%, transparent); }
.toast.error { border-color: color-mix(in srgb, var(--danger) 55%, transparent); color: var(--danger); }

#sidebarBackdrop {
  display: none; position: fixed; inset: 62px 0 0; z-index: 24;
  background: rgba(4, 6, 10, 0.5);
}

/* ---------- responsive ---------- */
@media (max-width: 960px) {
  .layout { grid-template-columns: 260px minmax(0, 1fr); }
  .editor-actions { gap: 5px; }
  .saved-hint { display: none; }
}
@media (max-width: 860px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .only-mobile { display: inline-flex; }
  #sidebar {
    position: fixed; top: 62px; bottom: 0; left: 0; width: min(84vw, 320px);
    transform: translateX(-104%); transition: transform 0.2s ease, visibility 0.2s ease;
    visibility: hidden;
    box-shadow: var(--shadow);
  }
  #sidebar.open { transform: translateX(0); visibility: visible; }
  #sidebar.open + #sidebarBackdrop { display: block; }
  .editor-head { flex-direction: column; align-items: stretch; }
  .editor-actions { justify-content: flex-start; }
  .editor-body.mode-split { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
  .editor-body.mode-split .pane-preview { border-left: 0; border-top: 1px solid var(--border); }
  .brand-text p { display: none; }
  .banner { flex-direction: column; align-items: stretch; }
}
@media (max-width: 560px) {
  .topbar { gap: 8px; padding: 0 10px; }
  .brand-text h1 { font-size: 13px; }
  .btn { padding: 0 9px; }
  .pane-preview { padding: 14px 14px 48px; }
  #highlight, #editor { font-size: 12.6px; padding: 13px 13px 110px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
`;
