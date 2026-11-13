/** Assembles the standalone management page served at the configured route. */
import { CLIENT_JS } from './client.js'
import { STYLES } from './styles.js'

const BRAND_ICON = '<svg viewBox="0 0 36 36" fill="none" aria-hidden="true">' +
  '<path d="M10.2 4.8h10.6l6.8 6.8v15.6a4.2 4.2 0 0 1-4.2 4.2H13.4a4.2 4.2 0 0 1-4.2-4.2V9a4.2 4.2 0 0 1 4.2-4.2Z" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>' +
  '<path d="M20.6 5.1v6.5h6.6" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>' +
  '<path d="M13.9 15.1h8.2M13.9 18.7h8.2M13.9 22.3h4.6" stroke="#7EE0C3" stroke-width="1.9" stroke-linecap="round"/>' +
  '<path d="M26.8 20.1c.45 2.5 1.5 3.55 4 4-2.5.45-3.55 1.5-4 4-.45-2.5-1.5-3.55-4-4 2.5-.45 3.55-1.5 4-4Z" fill="#F5B864"/>' +
  '</svg>'

const EMPTY_GLYPH = '<svg viewBox="0 0 36 36" fill="none" aria-hidden="true">' +
  '<rect x="7.5" y="5.5" width="21" height="25" rx="4" stroke="currentColor" stroke-width="1.8"/>' +
  '<path d="M13 13h10M13 17.5h10M13 22h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.55"/>' +
  '<path d="M24.5 24.5c.4 2.2 1.3 3.1 3.5 3.5-2.2.4-3.1 1.3-3.5 3.5-.4-2.2-1.3-3.1-3.5-3.5 2.2-.4 3.1-1.3 3.5-3.5Z" fill="#F5B864"/>' +
  '</svg>'

/** Render the full HTML document. */
export function renderPage(options) {
  const boot = {
    pagePath: options.pagePath,
    version: options.version,
    maxBackups: options.maxBackups,
    maxInjectBytes: options.maxInjectBytes,
    maxFileBytes: options.maxFileBytes,
  }
  const bootJson = JSON.stringify(boot).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  return '<!doctype html>\n' +
    '<html lang="zh-CN" data-theme="dark">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="color-scheme" content="dark light">\n' +
    '<title>提示词管理器 · DeepSeek Harness</title>\n' +
    '<style>' + STYLES + '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div id="app">\n' +
    '  <header class="topbar">\n' +
    '    <button id="menuBtn" class="icon-btn only-mobile" aria-label="打开文件列表">&#9776;</button>\n' +
    '    <div class="brand">\n' +
    '      <span class="brand-mark">' + BRAND_ICON + '</span>\n' +
    '      <div class="brand-text"><h1>提示词管理器</h1><p>DeepSeek Harness · 全局与工作区 AGENTS.md</p></div>\n' +
    '    </div>\n' +
    '    <div class="top-actions">\n' +
    '      <span id="savedHint" class="saved-hint"></span>\n' +
    '      <button id="refreshBtn" class="btn ghost" title="重新扫描作用域">刷新</button>\n' +
    '      <button id="themeBtn" class="icon-btn" aria-label="切换主题" title="切换主题">&#9790;</button>\n' +
    '      <button id="helpBtn" class="icon-btn" aria-label="使用说明" title="使用说明">?</button>\n' +
    '    </div>\n' +
    '  </header>\n' +
    '  <div class="layout">\n' +
    '    <aside id="sidebar" aria-label="提示词文件">\n' +
    '      <div class="sidebar-head">\n' +
    '        <div class="search-wrap">\n' +
    '          <span class="search-icon">&#9906;</span>\n' +
    '          <input id="searchInput" type="search" placeholder="搜索文件或路径…" autocomplete="off" spellcheck="false">\n' +
    '          <kbd>Ctrl F</kbd>\n' +
    '        </div>\n' +
    '      </div>\n' +
    '      <div id="fileList" class="file-list"></div>\n' +
    '      <div class="sidebar-foot" id="pluginInfo"></div>\n' +
    '    </aside>\n' +
    '    <div id="sidebarBackdrop"></div>\n' +
    '    <main>\n' +
    '      <div id="emptyState" class="empty-state">\n' +
    '        <div class="empty-card">\n' +
    '          <div class="glyph">' + EMPTY_GLYPH + '</div>\n' +
    '          <h2 id="emptyTitle">正在加载…</h2>\n' +
    '          <p id="emptyText">正在扫描全局配置与已注册工作区。</p>\n' +
    '          <div class="hint">快捷键：Ctrl/Cmd+S 保存 · Ctrl/Cmd+B 切换预览 · Ctrl/Cmd+F 搜索</div>\n' +
    '        </div>\n' +
    '      </div>\n' +
    '      <section id="editorPane" hidden>\n' +
    '        <div class="editor-head">\n' +
    '          <div class="file-ident">\n' +
    '            <div class="crumbs" id="fileCrumbs"></div>\n' +
    '            <div class="file-title-row"><h2 id="fileTitle">AGENTS.md</h2><div id="fileBadges" class="badge-row"></div></div>\n' +
    '            <div class="path-line" id="fileSub"></div>\n' +
    '          </div>\n' +
    '          <div class="editor-actions">\n' +
    '            <div class="segmented" role="group" aria-label="预览模式">\n' +
    '              <button type="button" data-view="edit" aria-pressed="false">编辑</button>\n' +
    '              <button type="button" data-view="split" aria-pressed="true">分屏</button>\n' +
    '              <button type="button" data-view="preview" aria-pressed="false">预览</button>\n' +
    '            </div>\n' +
    '            <button id="templateBtn" class="btn" type="button" title="插入常用提示词模板">插入模板</button>\n' +
    '            <button id="backupsBtn" class="btn" type="button" title="查看备份与回滚">备份</button>\n' +
    '            <button id="reloadBtn" class="btn ghost" type="button" title="重新读取磁盘内容">重新加载</button>\n' +
    '            <button id="saveBtn" class="btn primary" type="button" title="保存 (Ctrl/Cmd+S)">保存</button>\n' +
    '          </div>\n' +
    '        </div>\n' +
    '        <div id="banner" class="banner" hidden></div>\n' +
    '        <div id="editorBody" class="editor-body mode-split">\n' +
    '          <div class="pane-editor">\n' +
    '            <div class="code-wrap">\n' +
    '              <pre id="highlight" aria-hidden="true"></pre>\n' +
    '              <textarea id="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="AGENTS.md 内容" placeholder="在此编写提示词…"></textarea>\n' +
    '            </div>\n' +
    '          </div>\n' +
    '          <div id="previewPane" class="pane-preview" aria-label="Markdown 预览">\n' +
    '            <div id="preview"></div>\n' +
    '          </div>\n' +
    '        </div>\n' +
    '        <footer class="statusbar">\n' +
    '          <span id="statusPath"></span><span class="dot-sep">·</span>\n' +
    '          <span id="statusStats"></span><span class="spacer"></span>\n' +
    '          <span id="statusSaved"></span>\n' +
    '        </footer>\n' +
    '      </section>\n' +
    '    </main>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div id="templateMenu" class="menu" hidden></div>\n' +
    '<aside id="backupDrawer" class="drawer" hidden aria-label="备份历史">\n' +
    '  <div class="drawer-head"><h2>备份历史</h2><span id="backupScope" class="scope-label"></span><button id="closeBackups" class="icon-btn" type="button" aria-label="关闭">&#215;</button></div>\n' +
    '  <p class="drawer-hint">每次保存覆盖前会在文件同目录生成 <code>.AGENTS.md.&lt;时间戳&gt;.bak</code>，保留最近 ' + String(options.maxBackups) + ' 个。回滚前会先把当前内容再备份一次。</p>\n' +
    '  <div id="backupList" class="backup-list"></div>\n' +
    '  <div id="backupPreview" class="backup-preview" hidden>\n' +
    '    <div class="backup-preview-head"><span>备份内容预览</span><span class="name" id="backupPreviewName"></span><span id="backupPreviewMeta" class="diff-stat"></span><button id="backupPreviewRollback" class="btn danger" type="button" data-name="">回滚到此版本</button></div>\n' +
    '    <pre id="backupPreviewBody"></pre>\n' +
    '  </div>\n' +
    '</aside>\n' +
    '<div id="modalBackdrop" class="modal-backdrop" hidden>\n' +
    '  <div id="modalCard" class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">\n' +
    '    <h2 id="modalTitle"></h2>\n' +
    '    <div id="modalBody" class="modal-body"></div>\n' +
    '    <div id="modalActions" class="modal-actions"></div>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div id="toast" class="toast" role="status" aria-live="polite"></div>\n' +
    '<script>window.__PM__ = ' + bootJson + ';</script>\n' +
    '<script>' + CLIENT_JS + '</script>\n' +
    '</body>\n' +
    '</html>\n'
}
