/**
 * Browser half of the prompt manager, embedded verbatim in the served page.
 * Plain ES5-compatible syntax, no external dependencies, no template literals
 * (the whole string is embedded inside a page template literal).
 */
export const CLIENT_JS = String.raw`
(function () {
  'use strict';

  var boot = window.__PM__ || {};
  var PAGE = boot.pagePath || '/prompt-manager';
  var API = PAGE + '/api';
  var MAX_FILE_BYTES = boot.maxFileBytes || 1048576;
  var MAX_INJECT_BYTES = boot.maxInjectBytes || 65536;
  var VERSION = boot.version || '0.1.0';

  var state = {
    groups: [],
    files: {},
    templates: [],
    selectedId: null,
    editor: {
      content: '',
      loadedContent: '',
      dirty: false,
      exists: false,
      eol: 'lf',
      bom: false,
      mtimeMs: null,
      size: 0,
      file: null,
      backups: []
    },
    conflict: null,
    saveError: null,
    viewMode: 'split',
    filter: '',
    polling: false,
    saving: false,
    config: {},
    homes: {},
    instructionLoader: {}
  };

  var highlightTimer = null;
  var previewTimer = null;
  var statsTimer = null;
  var toastTimer = null;
  var backupCloseTimer = null;
  var lastSidebarSignature = '';
  var lastFooterSignature = '';
  var lastFocusedElement = null;
  var themePref = 'auto';
  var modalsOpen = 0;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmtBytes(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) n = 0;
    if (n >= 1048576) return (n / 1048576).toFixed(n % 1048576 === 0 ? 0 : 1) + ' MiB';
    if (n >= 1024) return Math.round(n / 1024) + ' KiB';
    return n + ' B';
  }

  function fmtTime(ms) {
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
    } catch (error) {
      return new Date(ms).toISOString();
    }
  }

  function fmtClock(ms) {
    try {
      return new Date(ms || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
    } catch (error) {
      return '';
    }
  }

  function request(path, options) {
    options = options || {};
    var headers = options.headers || {};
    headers['x-prompt-manager'] = '1';
    headers['accept'] = 'application/json';
    options.headers = headers;
    return fetch(API + path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.message || data.error || ('HTTP ' + response.status));
          error.code = data.error;
          error.status = response.status;
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  function apiGet(path) {
    return request(path, { method: 'GET' });
  }

  function apiPost(path, body) {
    return request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  function toast(message, kind) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast show ' + (kind || 'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast ' + (kind || 'ok'); }, 3600);
  }

  function setSavedHint(text) {
    var el = $('#savedHint');
    if (el) el.textContent = text || '';
  }

  /* ------------------------------------------------------------------ */
  /* theme                                                               */
  /* ------------------------------------------------------------------ */

  function resolvedTheme() {
    if (themePref === 'auto') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return themePref;
  }

  function applyTheme() {
    var resolved = resolvedTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    var button = $('#themeBtn');
    if (button) {
      button.textContent = resolved === 'light' ? '\u2600' : '\u263e';
      button.title = '主题：' + (themePref === 'auto' ? '跟随系统' : themePref === 'light' ? '浅色' : '深色') + '（点击切换）';
    }
  }

  function cycleTheme() {
    themePref = themePref === 'auto' ? 'light' : themePref === 'light' ? 'dark' : 'auto';
    try { localStorage.setItem('pm.theme', themePref); } catch (error) { /* storage may be unavailable */ }
    applyTheme();
  }

  /* ------------------------------------------------------------------ */
  /* sidebar                                                             */
  /* ------------------------------------------------------------------ */

  function renderSidebar() {
    var list = $('#fileList');
    if (!list) return;
    var filter = state.filter.trim().toLowerCase();
    var signature = JSON.stringify([state.groups, filter, state.selectedId, state.editor.dirty]);
    if (signature === lastSidebarSignature) return;
    lastSidebarSignature = signature;
    var html = '';
    var total = 0;
    state.groups.forEach(function (group) {
      var files = (group.files || []).filter(function (file) {
        if (!filter) return true;
        var haystack = [
          file.title, file.displayPath, file.path, group.title, group.subtitle || ''
        ].join(' ').toLowerCase();
        return haystack.indexOf(filter) !== -1;
      });
      var showEmptyGroup = !filter && group.missingDirectory === true;
      if (files.length === 0 && !showEmptyGroup) return;
      html += '<div class="group' + (group.missingDirectory ? ' missing' : '') + '">';
      html += '<div class="group-head">' +
        '<span class="g-kicker">' + esc(group.kind === 'global' ? '全局配置' : '工作区') + '</span>' +
        '<span class="g-name" title="' + esc(group.title) + '">' +
        esc(group.kind === 'global' ? '用户全局' : group.title) + '</span>' +
        '<span class="g-sub" title="' + esc(group.subtitle || '') + '">' + esc(group.subtitle || '') + '</span>' +
        '</div>';
      if (files.length === 0) {
        html += '<div class="group-empty">目录不存在，无法创建 AGENTS.md</div>';
      }
      files.forEach(function (file) {
        total += 1;
        var active = state.selectedId === file.id;
        var dirty = active && state.editor.dirty;
        var className = 'file-item' + (file.exists ? ' exists' : '') + (active ? ' active' : '') + (dirty ? ' dirty' : '');
        var meta = '';
        if (file.exists) {
          meta += '<span class="tag">' + fmtBytes(file.size) + '</span>';
          if (file.backupCount > 0) meta += '<span class="tag">' + file.backupCount + ' 备份</span>';
        } else {
          meta = '<span class="tag missing">未创建</span>';
        }
        html += '<div class="' + className + '" data-id="' + esc(file.id) + '" role="button" tabindex="0"' +
          (active ? ' aria-current="true"' : '') +
          ' title="' + esc(file.displayPath) + '">' +
          '<span class="dot"></span>' +
          '<span class="fi-main"><span class="fi-title">' + esc(file.title) + '</span>' +
          '<span class="fi-sub">' + esc(file.displayPath) + '</span></span>' +
          '<span class="fi-meta">' + meta + '</span>' +
          '</div>';
      });
      html += '</div>';
    });
    if (total === 0) {
      html = '<div class="list-empty">' + (filter
        ? '没有匹配的文件<br>清除搜索关键词后重试'
        : '还没有可管理的作用域<br>先在 DeepSeek Harness 中创建或打开一个工作区') + '</div>';
    }
    var scrollTop = list.scrollTop;
    list.innerHTML = html;
    list.scrollTop = scrollTop;
  }

  function renderFooter() {
    var footer = $('#pluginInfo');
    if (!footer) return;
    var homes = state.homes || {};
    var signature = VERSION + '|' + (homes.dshHome || '') + '|' + (homes.agentsHome || '');
    if (signature === lastFooterSignature) return;
    lastFooterSignature = signature;
    footer.innerHTML =
      '<div class="row"><span>dsh-prompt-manager v' + esc(VERSION) + '</span><a href="/" target="_blank" rel="noreferrer">DSH 界面</a></div>' +
      '<div class="row"><span title="' + esc(homes.dshHome || '') + '">全局 ' + esc(homes.dshHome || '~/.dsh') + '/AGENTS.md</span></div>';
  }

  function updateDirtyIndicators() {
    var item = $('#fileList .file-item.active');
    if (item) item.classList.toggle('dirty', state.editor.dirty);
    if (state.editor.dirty) {
      setSavedHint('有未保存修改');
    }
  }

  /* ------------------------------------------------------------------ */
  /* editor rendering                                                    */
  /* ------------------------------------------------------------------ */

  function currentFile() {
    return (state.selectedId && state.files[state.selectedId]) || state.editor.file;
  }

  function showEmpty(title, text) {
    var empty = $('#emptyState');
    var pane = $('#editorPane');
    if (pane) pane.hidden = true;
    if (!empty) return;
    empty.hidden = false;
    var heading = $('#emptyTitle');
    var body = $('#emptyText');
    if (heading && title) heading.textContent = title;
    if (body && text) body.innerHTML = text;
  }

  function showEditor() {
    var empty = $('#emptyState');
    var pane = $('#editorPane');
    if (empty) empty.hidden = true;
    if (pane) pane.hidden = false;
  }

  function renderEditor() {
    if (!state.selectedId) {
      showEmpty('选择左侧文件开始编辑', '');
      return;
    }
    showEditor();
    var file = currentFile();
    if (!file) return;

    var group = null;
    state.groups.forEach(function (candidate) {
      if (candidate.key === file.groupKey) group = candidate;
    });

    var crumbs = $('#fileCrumbs');
    if (crumbs) {
      crumbs.innerHTML =
        '<span>' + esc(group ? (group.kind === 'global' ? '全局配置' : group.title) : '提示词') + '</span>' +
        '<span class="sep">/</span><span>' + esc(file.title) + '</span>';
    }
    var title = $('#fileTitle');
    if (title) title.textContent = file.title;
    var sub = $('#fileSub');
    if (sub) {
      sub.textContent = file.displayPath + (file.exists ? '' : ' · 尚未创建');
      sub.title = file.path;
    }

    var badges = $('#fileBadges');
    if (badges) {
      var html = '';
      html += file.exists
        ? '<span class="badge ok">已存在</span>'
        : '<span class="badge missing">未创建</span>';
      if (file.exists) html += '<span class="badge">' + fmtBytes(state.editor.size || file.size) + '</span>';
      if (state.editor.backups && state.editor.backups.length > 0) {
        html += '<span class="badge">' + state.editor.backups.length + ' 个备份</span>';
      }
      if (state.editor.exists) {
        html += '<span class="badge">' + (state.editor.eol === 'crlf' ? 'CRLF' : 'LF') + (state.editor.bom ? ' · BOM' : '') + '</span>';
      }
      badges.innerHTML = html;
    }

    var saveBtn = $('#saveBtn');
    if (saveBtn) {
      saveBtn.textContent = file.exists ? '保存' : '创建文件';
      saveBtn.disabled = state.saving;
    }
    var backupsBtn = $('#backupsBtn');
    if (backupsBtn) {
      backupsBtn.textContent = '备份' + (state.editor.backups && state.editor.backups.length > 0 ? ' ' + state.editor.backups.length : '');
      backupsBtn.disabled = !file.exists && state.editor.backups.length === 0;
    }
    var reloadBtn = $('#reloadBtn');
    if (reloadBtn) reloadBtn.disabled = !file.exists;

    renderBanner();
    setViewMode(state.viewMode, true);

    var editor = $('#editor');
    if (editor && editor.value !== state.editor.content) editor.value = state.editor.content;
    paintHighlight();
    paintPreview();
    updateStats();
    if (state.editor.dirty) setSavedHint('有未保存修改');
    else if (file.exists && state.editor.mtimeMs) setSavedHint('已保存 · ' + fmtClock(state.editor.mtimeMs));
    else setSavedHint('');
    updateDirtyIndicators();
  }

  function computeBanner() {
    if (state.conflict) {
      return {
        kind: 'error',
        text: state.conflict.external
          ? '磁盘上的文件已被外部修改（或删除），当前编辑基于旧内容。重新加载会丢弃未保存的修改；覆盖保存会先备份磁盘现状。'
          : '文件在磁盘上已变化，请选择处理方式。',
        actions: [
          { label: '重新加载', action: 'reload' },
          { label: '覆盖保存', action: 'force-save', primary: true, danger: true }
        ]
      };
    }
    if (state.saveError) {
      return {
        kind: 'error',
        text: state.saveError,
        actions: [
          { label: '重试保存', action: 'retry-save', primary: true },
          { label: '关闭', action: 'dismiss-error' }
        ]
      };
    }
    if (!state.editor.exists) {
      return {
        kind: 'info',
        text: '该文件尚未创建。输入内容后按 Ctrl/Cmd+S 即可创建，也可以先填入一份初始化模板。',
        actions: [
          { label: '填入初始化模板', action: 'starter' },
          { label: '立即创建空文件', action: 'create-empty' }
        ]
      };
    }
    var warnings = (currentFile() && currentFile().warnings) || [];
    if (warnings.length > 0) {
      return { kind: 'warn', text: warnings.join('；'), actions: [] };
    }
    return null;
  }

  function renderBanner() {
    var banner = $('#banner');
    if (!banner) return;
    var info = computeBanner();
    if (!info) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    banner.hidden = false;
    banner.className = 'banner ' + (info.kind || 'info');
    banner.innerHTML = '<span class="b-text">' + esc(info.text) + '</span>' +
      '<span class="b-actions">' + (info.actions || []).map(function (action) {
        return '<button class="btn' + (action.primary ? ' primary' : '') + (action.danger ? ' danger' : '') +
          '" data-banner-action="' + esc(action.action) + '">' + esc(action.label) + '</button>';
      }).join('') + '</span>';
  }

  function withDirtyGuard(message, action) {
    if (!state.editor.dirty) {
      action();
      return;
    }
    choose('有未保存的修改', '<p>' + esc(message) + '</p>', [
      { id: 'cancel', label: '取消' },
      { id: 'discard', label: '放弃修改并继续', danger: true }
    ]).then(function (choice) {
      if (choice === 'discard') action();
    });
  }

  function confirmForceSave() {
    confirmDialog(
      '覆盖保存？',
      '<p>磁盘上的文件已被外部修改。覆盖保存会先自动备份磁盘现状，再写入编辑器内容。</p>',
      '覆盖保存',
      true
    ).then(function (ok) {
      if (ok) save({ force: true });
    });
  }

  function onBannerAction(action) {
    if (action === 'reload') {
      reloadCurrent(false);
    } else if (action === 'force-save') {
      confirmForceSave();
    } else if (action === 'retry-save') {
      state.saveError = null;
      renderBanner();
      save();
    } else if (action === 'dismiss-error') {
      state.saveError = null;
      renderBanner();
    } else if (action === 'starter') {
      withDirtyGuard('填入初始化模板会覆盖编辑器中尚未保存的内容。', function () {
        apiGet('/starter').then(function (data) {
          state.editor.content = data.content || '';
          var editor = $('#editor');
          if (editor) { editor.value = state.editor.content; editor.focus(); }
          state.editor.dirty = state.editor.content !== state.editor.loadedContent;
          paintHighlight();
          paintPreview();
          updateStats();
          updateDirtyIndicators();
          renderBanner();
          toast('已填入初始化模板，检查后按 Ctrl/Cmd+S 保存', 'ok');
        }).catch(function (error) { toast('读取模板失败：' + error.message, 'error'); });
      });
    } else if (action === 'create-empty') {
      withDirtyGuard('立即创建空文件会丢弃编辑器中尚未保存的内容。', function () {
        state.editor.content = '';
        var editor = $('#editor');
        if (editor) editor.value = '';
        save();
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* editor content                                                      */
  /* ------------------------------------------------------------------ */

  function onInput() {
    var editor = $('#editor');
    if (!editor) return;
    state.editor.content = editor.value;
    state.editor.dirty = editor.value !== state.editor.loadedContent;
    scheduleHighlight();
    schedulePreview();
    scheduleStats();
    renderBanner();
    updateDirtyIndicators();
  }

  function scheduleHighlight() {
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(paintHighlight, 45);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(paintPreview, 150);
  }

  function scheduleStats() {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(updateStats, 120);
  }

  function syncOverlay() {
    var editor = $('#editor');
    var highlight = $('#highlight');
    if (!editor || !highlight) return;
    highlight.style.width = editor.clientWidth + 'px';
    highlight.style.height = editor.clientHeight + 'px';
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  }

  function paintHighlight() {
    var editor = $('#editor');
    var highlight = $('#highlight');
    if (!editor || !highlight) return;
    var text = editor.value;
    if (text.length > 200000) {
      highlight.textContent = text + (text.charAt(text.length - 1) === '\n' ? ' ' : '');
    } else {
      highlight.innerHTML = highlightMarkdown(text);
    }
    syncOverlay();
  }

  function updateStats() {
    var content = state.editor.content;
    var lines = content.length === 0 ? 1 : content.split('\n').length;
    var bytes;
    try {
      bytes = new TextEncoder().encode(content).length;
    } catch (error) {
      bytes = content.length;
    }
    var stats = $('#statusStats');
    if (stats) stats.textContent = content.length + ' 字符 · ' + lines + ' 行 · ' + fmtBytes(bytes);
    var path = $('#statusPath');
    if (path) path.textContent = currentFile() ? currentFile().displayPath : '';
    var saved = $('#statusSaved');
    if (saved) {
      if (state.editor.dirty) {
        saved.textContent = '● 未保存';
        saved.className = 'warn';
      } else if (state.editor.exists) {
        saved.textContent = '已保存 · ' + fmtClock(state.editor.mtimeMs);
        saved.className = '';
      } else {
        saved.textContent = '尚未创建';
        saved.className = '';
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* markdown highlight + preview                                        */
  /* ------------------------------------------------------------------ */

  function escHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function inlineHighlight(escaped) {
    var codeSpans = [];
    var out = escaped.replace(/\x60+([^\x60]+?)\x60+/g, function (match, inner) {
      codeSpans.push('<span class="tok-inline-code">' + match + '</span>');
      return '\uE000' + (codeSpans.length - 1) + '\uE001';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<span class="tok-bold">**$1**</span>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<span class="tok-key">*$2*</span>');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="tok-link">[$1]($2)</span>');
    out = out.replace(/\uE000(\d+)\uE001/g, function (match, index) {
      return codeSpans[Number(index)] || '';
    });
    return out;
  }

  function highlightMarkdown(text) {
    var lines = String(text).split('\n');
    var out = '';
    var inFence = false;
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      var escaped = escHtml(line);
      var fence = /^\s{0,3}(\x60\x60\x60|~~~)/.test(line);
      if (inFence) {
        out += '<span class="' + (fence ? 'tok-fence' : 'tok-code') + '">' + escaped + '</span>';
        if (fence) inFence = false;
      } else if (fence) {
        inFence = true;
        out += '<span class="tok-fence">' + escaped + '</span>';
      } else if (/^\s{0,3}#{1,6}\s+/.test(line)) {
        out += '<span class="tok-heading">' + escaped + '</span>';
      } else if (/^\s{0,3}(?:[-*_]\s*){3,}\s*$/.test(line)) {
        out += '<span class="tok-hr">' + escaped + '</span>';
      } else if (/^\s{0,3}>/.test(line)) {
        var quoteMatch = line.match(/^(\s{0,3}>+\s?)(.*)$/);
        out += '<span class="tok-mark">' + escHtml(quoteMatch[1]) + '</span>' + inlineHighlight(escHtml(quoteMatch[2]));
      } else if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
        var listMatch = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/);
        out += '<span class="tok-list">' + escHtml(listMatch[1]) + '</span>' + inlineHighlight(escHtml(listMatch[2]));
      } else if (/^\s*<!--/.test(line)) {
        out += '<span class="tok-comment">' + escaped + '</span>';
      } else {
        out += inlineHighlight(escaped);
      }
      out += '\n';
    }
    return out;
  }

  function inlineMarkdown(text) {
    var out = escHtml(text);
    var codes = [];
    out = out.replace(/\x60+([^\x60]+?)\x60+/g, function (match, inner) {
      codes.push('<code>' + inner + '</code>');
      return '\uE000' + (codes.length - 1) + '\uE001';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (match, label, href) {
      if (!/^(https?:\/\/|mailto:|\/|#)/i.test(href)) return match;
      return '<a href="' + href + '" target="_blank" rel="noreferrer noopener">' + label + '</a>';
    });
    out = out.replace(/\uE000(\d+)\uE001/g, function (match, index) {
      return codes[Number(index)] || '';
    });
    return out;
  }

  function renderMarkdown(source) {
    var text = String(source).replace(/\r\n?/g, '\n');
    if (text.length > 400000) {
      return '<p class="preview-empty">内容过大，已暂停预览渲染（保存不受影响）。</p>';
    }
    var lines = text.split('\n');
    var html = '';
    var index = 0;
    while (index < lines.length) {
      var line = lines[index];
      if (/^\s*$/.test(line)) { index += 1; continue; }
      var fence = line.match(/^\s{0,3}(\x60\x60\x60|~~~)([A-Za-z0-9_+-]*)\s*$/);
      if (fence) {
        var code = [];
        index += 1;
        while (index < lines.length && !/^\s{0,3}(?:\x60\x60\x60|~~~)\s*$/.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        index += 1;
        html += '<pre><code>' + escHtml(code.join('\n')) + '</code></pre>';
        continue;
      }
      var heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      if (heading) {
        var level = heading[1].length;
        html += '<h' + level + '>' + inlineMarkdown(heading[2].replace(/\s+#+\s*$/, '')) + '</h' + level + '>';
        index += 1;
        continue;
      }
      if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) {
        html += '<hr>';
        index += 1;
        continue;
      }
      if (/^\s{0,3}>/.test(line)) {
        var quoted = [];
        while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
          quoted.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
          index += 1;
        }
        html += '<blockquote>' + renderMarkdown(quoted.join('\n')) + '</blockquote>';
        continue;
      }
      var bullet = line.match(/^\s*((?:[-*+])|(?:\d+[.)]))\s+(.*)$/);
      if (bullet) {
        var ordered = /^\d/.test(bullet[1]);
        var items = [];
        while (index < lines.length) {
          var item = lines[index].match(/^\s*((?:[-*+])|(?:\d+[.)]))\s+(.*)$/);
          if (!item) break;
          if (/^\d/.test(item[1]) !== ordered) break;
          var content = item[2];
          var lookahead = index + 1;
          while (lookahead < lines.length) {
            var continuation = lines[lookahead];
            if (/^\s*$/.test(continuation)) break;
            if (/^\s*((?:[-*+])|(?:\d+[.)]))\s+/.test(continuation)) break;
            if (!/^\s{2,}/.test(continuation)) break;
            content += ' ' + continuation.replace(/^\s+/, '');
            lookahead += 1;
          }
          items.push(content);
          index = lookahead;
        }
        var tag = ordered ? 'ol' : 'ul';
        html += '<' + tag + '>';
        items.forEach(function (raw) {
          var task = raw.match(/^\[( |x|X)\]\s+([\s\S]*)$/);
          if (task) {
            var checked = task[1].toLowerCase() === 'x';
            html += '<li><span class="task">' + (checked ? '\u2611' : '\u2610') + '</span> ' + inlineMarkdown(task[2]) + '</li>';
          } else {
            html += '<li>' + inlineMarkdown(raw) + '</li>';
          }
        });
        html += '</' + tag + '>';
        continue;
      }
      var paragraph = [line];
      index += 1;
      while (index < lines.length) {
        var next = lines[index];
        if (/^\s*$/.test(next)) break;
        if (/^\s{0,3}(#{1,6})\s+/.test(next)) break;
        if (/^\s{0,3}(\x60\x60\x60|~~~)/.test(next)) break;
        if (/^\s{0,3}>/.test(next)) break;
        if (/^\s*((?:[-*+])|(?:\d+[.)]))\s+/.test(next)) break;
        if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(next)) break;
        paragraph.push(next);
        index += 1;
      }
      html += '<p>' + inlineMarkdown(paragraph.join('\n')) + '</p>';
    }
    return html || '<p class="preview-empty">（空文件）</p>';
  }

  function paintPreview() {
    var preview = $('#preview');
    if (!preview) return;
    preview.innerHTML = '<div class="md">' + renderMarkdown(state.editor.content) + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* file loading                                                        */
  /* ------------------------------------------------------------------ */

  function applyFileToState(file, backupCount) {
    if (!file) return;
    if (backupCount !== null && backupCount !== undefined) file.backupCount = backupCount;
    state.files[file.id] = file;
    state.groups.forEach(function (group) {
      (group.files || []).forEach(function (candidate, index) {
        if (candidate.id === file.id) group.files[index] = file;
      });
    });
  }

  function loadFile(id) {
    return apiGet('/file?id=' + encodeURIComponent(id)).then(function (data) {
      state.selectedId = id;
      state.editor = {
        content: data.content || '',
        loadedContent: data.content || '',
        dirty: false,
        exists: true,
        eol: data.eol || 'lf',
        bom: data.bom === true,
        mtimeMs: data.mtimeMs,
        size: data.size || 0,
        file: data.file,
        backups: data.backups || []
      };
      if (data.file && data.file.exists === false) {
        state.editor.exists = false;
        state.editor.mtimeMs = null;
      }
      state.conflict = null;
      state.saveError = null;
      applyFileToState(data.file, (data.backups || []).length);
      renderSidebar();
      renderEditor();
      closeSidebar();
      var editor = $('#editor');
      if (editor) {
        editor.scrollTop = 0;
        editor.scrollLeft = 0;
      }
      syncOverlay();
    }).catch(function (error) {
      toast('读取失败：' + error.message, 'error');
    });
  }

  function reloadCurrent(silent) {
    if (!state.selectedId) return;
    if (state.editor.dirty) {
      confirmDialog('重新加载？', '<p>磁盘上的最新内容会覆盖编辑器中未保存的修改，确定继续吗？</p>', '重新加载').then(function (ok) {
        if (ok) doReload(silent);
      });
      return;
    }
    doReload(silent);
  }

  function doReload(silent) {
    var id = state.selectedId;
    if (!id) return;
    apiGet('/file?id=' + encodeURIComponent(id)).then(function (data) {
      if (state.selectedId !== id) return;
      state.editor.content = data.content || '';
      state.editor.loadedContent = data.content || '';
      state.editor.dirty = false;
      state.editor.exists = data.file.exists;
      state.editor.eol = data.eol || 'lf';
      state.editor.bom = data.bom === true;
      state.editor.mtimeMs = data.mtimeMs;
      state.editor.size = data.size || 0;
      state.editor.file = data.file;
      state.editor.backups = data.backups || [];
      state.conflict = null;
      state.saveError = null;
      applyFileToState(data.file, (data.backups || []).length);
      renderSidebar();
      renderEditor();
      if (!silent) toast('已重新加载磁盘内容', 'ok');
    }).catch(function (error) {
      toast('重新加载失败：' + error.message, 'error');
    });
  }

  function requestSelect(id) {
    if (id === state.selectedId) { closeSidebar(); return; }
    if (state.editor.dirty) {
      choose('切换文件', '<p>当前文件有未保存的修改。</p>', [
        { id: 'save', label: '保存并切换', primary: true },
        { id: 'discard', label: '放弃修改', danger: true },
        { id: 'cancel', label: '取消' }
      ]).then(function (choice) {
        if (choice === 'save') {
          save().then(function (ok) { if (ok) loadFile(id); });
        } else if (choice === 'discard') {
          loadFile(id);
        }
      });
      return;
    }
    loadFile(id);
  }

  /* ------------------------------------------------------------------ */
  /* save / rollback                                                     */
  /* ------------------------------------------------------------------ */

  function setSaving(saving) {
    state.saving = saving;
    var button = $('#saveBtn');
    if (button) {
      button.disabled = saving;
      button.textContent = saving ? '保存中…' : (state.editor.exists ? '保存' : '创建文件');
    }
  }

  function save(options) {
    options = options || {};
    if (!state.selectedId || state.saving) return Promise.resolve(false);
    var editor = $('#editor');
    if (editor) state.editor.content = editor.value;
    var body = {
      id: state.selectedId,
      content: state.editor.content,
      baseMtimeMs: state.editor.exists ? state.editor.mtimeMs : null,
      eol: state.editor.eol,
      bom: state.editor.bom,
      force: options.force === true
    };
    setSaving(true);
    return apiPost('/save', body).then(function (data) {
      state.editor.exists = true;
      state.editor.mtimeMs = data.file.mtimeMs;
      state.editor.size = data.file.size;
      state.editor.loadedContent = state.editor.content;
      state.editor.dirty = false;
      state.editor.file = data.file;
      state.editor.backups = data.backups || [];
      state.conflict = null;
      state.saveError = null;
      applyFileToState(data.file, (data.backups || []).length);
      renderSidebar();
      renderEditor();
      var message = data.unchanged
        ? '内容与磁盘一致，无需写入'
        : data.backupName
          ? '已保存，下一次模型步骤即读取新内容；备份为 ' + data.backupName
          : '已保存，下一次模型步骤即读取新内容';
      toast(message, 'ok');
      return true;
    }).catch(function (error) {
      if (error.code === 'CONFLICT') {
        state.conflict = { external: true };
        renderBanner();
        toast('文件已被外部修改，请选择重新加载或覆盖保存', 'warn');
      } else {
        state.conflict = null;
        state.saveError = error.code === 'TOO_LARGE'
          ? '内容超过 ' + fmtBytes(MAX_FILE_BYTES) + ' 上限，未保存'
          : '保存失败：' + error.message;
        renderBanner();
        toast(state.saveError, 'error');
      }
      return false;
    }).finally(function () {
      setSaving(false);
      renderEditorHeaderOnly();
    });
  }

  function renderEditorHeaderOnly() {
    var saveBtn = $('#saveBtn');
    if (saveBtn) saveBtn.textContent = state.editor.exists ? '保存' : '创建文件';
    updateStats();
  }

  function openBackups() {
    if (!state.selectedId) return;
    apiGet('/backups?id=' + encodeURIComponent(state.selectedId)).then(function (data) {
      renderBackupList(data.backups || []);
      var drawer = $('#backupDrawer');
      if (!drawer) return;
      if (backupCloseTimer) {
        clearTimeout(backupCloseTimer);
        backupCloseTimer = null;
      }
      drawer.hidden = false;
      requestAnimationFrame(function () { drawer.classList.add('open'); });
      var scope = $('#backupScope');
      var file = currentFile();
      if (scope && file) scope.textContent = file.displayPath;
      var preview = $('#backupPreview');
      if (preview) preview.hidden = true;
    }).catch(function (error) {
      toast('读取备份失败：' + error.message, 'error');
    });
  }

  function closeBackups() {
    var drawer = $('#backupDrawer');
    if (!drawer) return;
    drawer.classList.remove('open');
    if (backupCloseTimer) clearTimeout(backupCloseTimer);
    backupCloseTimer = setTimeout(function () {
      backupCloseTimer = null;
      if (!drawer.classList.contains('open')) drawer.hidden = true;
    }, 200);
  }

  function renderBackupList(backups) {
    var list = $('#backupList');
    if (!list) return;
    if (backups.length === 0) {
      list.innerHTML = '<div class="backup-empty">还没有备份。<br>每次保存覆盖前都会在文件同目录生成带时间戳的备份，最多保留 ' +
        esc(String(boot.maxBackups || 5)) + ' 个。</div>';
      return;
    }
    list.innerHTML = backups.map(function (backup, index) {
      var title = backup.heading
        ? esc(backup.heading)
        : '<span class="muted">' + (backup.lines === undefined ? '（大文件，未读取预览）' : '（无标题行）') + '</span>';
      var meta = esc(fmtTime(backup.mtimeMs)) + ' · ' + fmtBytes(backup.size);
      if (backup.lines) meta += ' · ' + backup.lines + ' 行';
      return '<div class="backup-row" data-name="' + esc(backup.name) + '">' +
        '<div class="br-main"><div class="br-title">' +
        (index === 0 ? '<span class="tag ok">最新</span> ' : '') + title + '</div>' +
        '<div class="br-name">' + esc(backup.name) + '</div>' +
        '<div class="br-meta">' + meta + '</div></div>' +
        '<div class="br-actions">' +
        '<button class="btn" data-backup-action="preview" data-name="' + esc(backup.name) + '">查看</button>' +
        '<button class="btn danger" data-backup-action="rollback" data-name="' + esc(backup.name) + '">回滚</button>' +
        '</div></div>';
    }).join('');
  }

  function diffStat(current, backup) {
    var counts = new Map();
    String(backup).split('\n').forEach(function (line) {
      counts.set(line, (counts.get(line) || 0) + 1);
    });
    var removed = 0;
    String(current).split('\n').forEach(function (line) {
      var count = counts.get(line) || 0;
      if (count > 0) counts.set(line, count - 1);
      else removed += 1;
    });
    var added = 0;
    counts.forEach(function (count) { added += count; });
    return { added: added, removed: removed };
  }

  function previewBackup(name) {
    apiGet('/backup?id=' + encodeURIComponent(state.selectedId) + '&name=' + encodeURIComponent(name)).then(function (data) {
      var panel = $('#backupPreview');
      if (!panel) return;
      panel.hidden = false;
      var title = $('#backupPreviewName');
      if (title) title.textContent = data.name;
      var meta = $('#backupPreviewMeta');
      if (meta) {
        var stat = diffStat(state.editor.content, data.content);
        meta.textContent = '相对当前编辑内容：+' + stat.added + ' / −' + stat.removed + ' 行';
      }
      var body = $('#backupPreviewBody');
      if (body) body.textContent = data.content;
      var rollbackButton = $('#backupPreviewRollback');
      if (rollbackButton) {
        rollbackButton.setAttribute('data-name', data.name);
      }
    }).catch(function (error) {
      toast('读取备份失败：' + error.message, 'error');
    });
  }

  function doRollback(name) {
    var dirtyNote = state.editor.dirty
      ? '<p class="warn-text">编辑器中还有未保存的修改，回滚会丢弃它们（磁盘上的当前内容仍会先自动备份）。</p>'
      : '';
    confirmDialog(
      '回滚到该版本？',
      '<p>将写入备份 <code>' + esc(name) + '</code> 的内容。</p>' +
      '<p>当前文件会先自动再备份一次，因此回滚本身也可以撤销。</p>' + dirtyNote,
      '回滚',
      true
    ).then(function (ok) {
      if (!ok) return;
      apiPost('/rollback', { id: state.selectedId, name: name }).then(function (data) {
        state.editor.content = data.content;
        state.editor.loadedContent = data.content;
        state.editor.dirty = false;
        state.editor.exists = true;
        state.editor.mtimeMs = data.mtimeMs;
        state.editor.size = data.size;
        state.editor.eol = data.eol;
        state.editor.bom = data.bom;
        state.editor.file = data.file;
        state.editor.backups = data.backups || [];
        state.conflict = null;
        state.saveError = null;
        applyFileToState(data.file, (data.backups || []).length);
        renderSidebar();
        renderEditor();
        var preview = $('#backupPreview');
        if (preview) preview.hidden = true;
        openBackups();
        toast('已回滚到 ' + name + (data.safetyBackupName ? '；回滚前内容已备份为 ' + data.safetyBackupName : ''), 'ok');
      }).catch(function (error) {
        toast('回滚失败：' + error.message, 'error');
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* templates                                                           */
  /* ------------------------------------------------------------------ */

  function openTemplateMenu() {
    var menu = $('#templateMenu');
    if (!menu) return;
    if (!menu.hidden) { menu.hidden = true; return; }
    var html = '<div class="menu-head">插入提示词模板</div>';
    state.templates.forEach(function (template, index) {
      html += '<button class="menu-item" data-template-index="' + index + '">' +
        '<span class="mi-title">' + esc(template.title) + '</span>' +
        '<span class="mi-hint">' + esc(template.hint || '') + '</span></button>';
    });
    menu.innerHTML = html;
    menu.hidden = false;
    var button = $('#templateBtn');
    var rect = button ? button.getBoundingClientRect() : { bottom: 60, right: window.innerWidth - 20 };
    var left = Math.max(10, Math.min(rect.right - 322, window.innerWidth - 334));
    menu.style.left = left + 'px';
    menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 120) + 'px';
    var first = menu.querySelector('.menu-item');
    if (first) first.focus();
  }

  function insertText(text) {
    var editor = $('#editor');
    if (!editor) return;
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    var before = editor.value.slice(0, start);
    var after = editor.value.slice(end);
    var insert = text;
    if (before.length > 0 && before.charAt(before.length - 1) !== '\n') insert = '\n\n' + insert;
    if (after.length > 0 && after.charAt(0) !== '\n') insert = insert + '\n';
    if (typeof editor.setRangeText === 'function') {
      editor.setRangeText(insert, start, end, 'end');
    } else {
      editor.value = before + insert + after;
      var position = (before + insert).length;
      editor.selectionStart = position;
      editor.selectionEnd = position;
    }
    editor.focus();
    onInput();
    toast('已插入模板', 'ok');
  }

  /* ------------------------------------------------------------------ */
  /* modal helpers                                                       */
  /* ------------------------------------------------------------------ */

  function showModal(options) {
    var backdrop = $('#modalBackdrop');
    if (!backdrop) return;
    lastFocusedElement = document.activeElement;
    var title = $('#modalTitle');
    var body = $('#modalBody');
    var actions = $('#modalActions');
    if (title) title.textContent = options.title || '';
    if (body) body.innerHTML = options.html || '';
    if (actions) {
      actions.innerHTML = '';
      (options.buttons || []).forEach(function (item) {
        var button = document.createElement('button');
        button.className = 'btn' + (item.primary ? ' primary' : '') + (item.danger ? ' danger' : '');
        button.textContent = item.label;
        button.addEventListener('click', function () {
          if (item.onClick) item.onClick();
          else hideModal();
        });
        actions.appendChild(button);
      });
    }
    backdrop.hidden = false;
    modalsOpen += 1;
    var firstButton = actions && actions.querySelector('button');
    if (firstButton) firstButton.focus();
  }

  function hideModal() {
    var backdrop = $('#modalBackdrop');
    if (backdrop) backdrop.hidden = true;
    modalsOpen = Math.max(0, modalsOpen - 1);
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      try { lastFocusedElement.focus(); } catch (error) { /* element may be gone */ }
    }
    lastFocusedElement = null;
  }

  function trapModalFocus(event) {
    var card = $('#modalCard');
    if (!card) return;
    var focusable = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', card)
      .filter(function (element) { return !element.disabled; });
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function confirmDialog(title, html, okLabel, danger) {
    return new Promise(function (resolve) {
      showModal({
        title: title,
        html: html,
        buttons: [
          { label: '取消', onClick: function () { hideModal(); resolve(false); } },
          { label: okLabel || '确定', primary: !danger, danger: danger === true, onClick: function () { hideModal(); resolve(true); } }
        ]
      });
    });
  }

  function choose(title, html, options) {
    return new Promise(function (resolve) {
      showModal({
        title: title,
        html: html,
        buttons: options.map(function (item) {
          return {
            label: item.label,
            primary: item.primary,
            danger: item.danger,
            onClick: function () { hideModal(); resolve(item.id); }
          };
        })
      });
    });
  }

  function showHelp() {
    var homes = state.homes || {};
    showModal({
      title: '提示词管理器 · 使用说明',
      html:
        '<p>本页面由 DSH 插件 <code>' + esc('@local/dsh-prompt-manager') + '</code> 提供，直接在 Harness 的本地 Web 监听上注册路由，因此与主界面同源、无跨域请求。</p>' +
        '<p><strong>作用域</strong></p><ul>' +
        '<li>全局：<code>' + esc(homes.dshHome || '~/.dsh') + '/AGENTS.md</code>（若存在，还会列出 <code>' + esc(homes.agentsHome || '~/.agents') + '/AGENTS.md</code>）</li>' +
        '<li>工作区：每个已注册工作区根目录的 <code>AGENTS.md</code>；不存在时可一键初始化创建</li>' +
        '</ul>' +
        '<p><strong>热重载</strong>：保存直接原子写入物理文件。标准预设的 <code>agent-instructions</code> 会在下一次模型步骤探测文件版本并注入，无需重启 Harness，也不用新开会话。</p>' +
        '<p><strong>备份与回滚</strong>：覆盖前在文件同目录生成 <code>.AGENTS.md.&lt;时间戳&gt;.bak</code>，默认保留 ' + esc(String(boot.maxBackups || 5)) + ' 个；回滚会先把当前内容再备份一次。</p>' +
        '<p><strong>快捷键</strong></p><ul>' +
        '<li><code>Ctrl/Cmd+S</code> 保存</li><li><code>Ctrl/Cmd+B</code> 切换 编辑 / 分屏 / 预览</li>' +
        '<li><code>Ctrl/Cmd+F</code> 搜索文件</li><li><code>Esc</code> 关闭弹层</li>' +
        '</ul>' +
        '<p><strong>唤起命令</strong>：在任意 DSH 会话中输入 <code>/prompts</code>，会打印本页地址与快捷键说明。</p>' +
        '<p><strong>预算提示</strong>：标准预设每链注入预算为 ' + fmtBytes(MAX_INJECT_BYTES) + '，单文件上限 ' + fmtBytes(MAX_FILE_BYTES) + '；超出预算的内容可能被省略或截断。</p>',
      buttons: [{ label: '知道了', primary: true }]
    });
  }

  /* ------------------------------------------------------------------ */
  /* view / sidebar                                                      */
  /* ------------------------------------------------------------------ */

  function setViewMode(mode, silent) {
    if (mode !== 'edit' && mode !== 'split' && mode !== 'preview') mode = 'split';
    state.viewMode = mode;
    var body = $('#editorBody');
    if (body) body.className = 'editor-body mode-' + mode;
    $$('.segmented [data-view]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-view') === mode ? 'true' : 'false');
    });
    if (!silent) {
      try { localStorage.setItem('pm.view', mode); } catch (error) { /* ignore */ }
    }
  }

  function cycleView() {
    var order = ['edit', 'split', 'preview'];
    var next = order[(order.indexOf(state.viewMode) + 1) % order.length];
    setViewMode(next);
  }

  function closeSidebar() {
    var sidebar = $('#sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }

  function closeOverlays() {
    var menu = $('#templateMenu');
    if (menu) menu.hidden = true;
    closeSidebar();
    closeBackups();
    if (modalsOpen > 0) hideModal();
  }

  /* ------------------------------------------------------------------ */
  /* state loading + polling                                             */
  /* ------------------------------------------------------------------ */

  function applyState(data) {
    state.groups = data.groups || [];
    state.templates = data.templates || [];
    state.config = data.config || {};
    state.homes = data.homes || {};
    state.instructionLoader = data.instructionLoader || {};
    state.files = {};
    state.groups.forEach(function (group) {
      (group.files || []).forEach(function (file) { state.files[file.id] = file; });
    });
    renderSidebar();
    renderFooter();
  }

  function syncSelected() {
    if (!state.selectedId) return;
    var file = state.files[state.selectedId];
    if (!file) {
      state.selectedId = null;
      showEmpty('该作用域已不可用', '工作区可能已被移除，刷新后重试。');
      return;
    }
    if (!state.editor.exists) {
      if (file.exists && state.editor.mtimeMs === null) {
        state.conflict = { external: true };
        renderBanner();
      }
      return;
    }
    if (!file.exists) {
      state.conflict = { external: true };
      renderBanner();
      return;
    }
    var mtimeChanged = state.editor.mtimeMs !== null && Math.abs(file.mtimeMs - state.editor.mtimeMs) > 0.5;
    if (!mtimeChanged) {
      state.editor.file = file;
      return;
    }
    if (state.editor.dirty) {
      state.conflict = { external: true };
      renderBanner();
      return;
    }
    doReload(true);
    toast('已同步磁盘上的修改', 'ok');
  }

  function loadState(silent) {
    return apiGet('/state').then(function (data) {
      applyState(data);
      if (state.selectedId) {
        syncSelected();
      } else if (!silent) {
        selectInitial();
      }
    }).catch(function (error) {
      if (!silent) {
        showEmpty('无法读取作用域', '请求失败：' + esc(error.message) + '<div class="hint">请确认插件已启用，然后点右上角刷新。</div>');
        toast('加载失败：' + error.message, 'error');
      }
    });
  }

  function selectInitial() {
    var flat = [];
    state.groups.forEach(function (group) {
      (group.files || []).forEach(function (file) { flat.push(file); });
    });
    if (flat.length === 0) {
      showEmpty('还没有可管理的作用域', '先在 DeepSeek Harness 中创建或打开一个工作区，然后刷新本页。');
      return;
    }
    var firstExisting = null;
    for (var i = 0; i < flat.length; i += 1) {
      if (flat[i].exists) { firstExisting = flat[i]; break; }
    }
    loadFile((firstExisting || flat[0]).id);
  }

  function poll() {
    if (state.polling || state.saving || document.hidden || modalsOpen > 0) return;
    state.polling = true;
    apiGet('/state').then(function (data) {
      applyState(data);
      syncSelected();
    }).catch(function () {
      /* transient network/restart errors are silent */
    }).finally(function () {
      state.polling = false;
    });
  }

  /* ------------------------------------------------------------------ */
  /* bindings + init                                                     */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    var refs = {
      refresh: $('#refreshBtn'), theme: $('#themeBtn'), help: $('#helpBtn'), menu: $('#menuBtn'),
      search: $('#searchInput'), save: $('#saveBtn'), template: $('#templateBtn'),
      backups: $('#backupsBtn'), reload: $('#reloadBtn'), editor: $('#editor')
    };
    if (refs.refresh) refs.refresh.addEventListener('click', function () { loadState(false); });
    if (refs.theme) refs.theme.addEventListener('click', cycleTheme);
    if (refs.help) refs.help.addEventListener('click', showHelp);
    if (refs.menu) refs.menu.addEventListener('click', function () {
      var sidebar = $('#sidebar');
      if (sidebar) sidebar.classList.toggle('open');
    });
    if (refs.search) {
      refs.search.addEventListener('input', function () {
        state.filter = refs.search.value || '';
        renderSidebar();
      });
    }
    if (refs.save) refs.save.addEventListener('click', function () { save(); });
    if (refs.template) refs.template.addEventListener('click', openTemplateMenu);
    if (refs.backups) refs.backups.addEventListener('click', openBackups);
    if (refs.reload) refs.reload.addEventListener('click', function () { reloadCurrent(false); });
    if (refs.editor) {
      refs.editor.addEventListener('input', onInput);
      refs.editor.addEventListener('scroll', syncOverlay);
    }
    var list = $('#fileList');
    if (list) {
      list.addEventListener('click', function (event) {
        var item = event.target.closest ? event.target.closest('.file-item') : null;
        if (!item) return;
        requestSelect(item.getAttribute('data-id'));
      });
      list.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var item = event.target.closest ? event.target.closest('.file-item') : null;
        if (!item) return;
        event.preventDefault();
        requestSelect(item.getAttribute('data-id'));
      });
    }
    var banner = $('#banner');
    if (banner) {
      banner.addEventListener('click', function (event) {
        var button = event.target.closest ? event.target.closest('[data-banner-action]') : null;
        if (!button) return;
        onBannerAction(button.getAttribute('data-banner-action'));
      });
    }
    $$('.segmented [data-view]').forEach(function (button) {
      button.addEventListener('click', function () { setViewMode(button.getAttribute('data-view')); });
    });
    var templateMenu = $('#templateMenu');
    if (templateMenu) {
      templateMenu.addEventListener('click', function (event) {
        var item = event.target.closest ? event.target.closest('[data-template-index]') : null;
        if (!item) return;
        var index = Number(item.getAttribute('data-template-index'));
        var template = state.templates[index];
        templateMenu.hidden = true;
        if (template) insertText(template.body);
      });
    }
    var backupList = $('#backupList');
    if (backupList) {
      backupList.addEventListener('click', function (event) {
        var button = event.target.closest ? event.target.closest('[data-backup-action]') : null;
        if (!button) return;
        var name = button.getAttribute('data-name');
        if (button.getAttribute('data-backup-action') === 'preview') previewBackup(name);
        else doRollback(name);
      });
    }
    var previewRollback = $('#backupPreviewRollback');
    if (previewRollback) {
      previewRollback.addEventListener('click', function () { doRollback(previewRollback.getAttribute('data-name')); });
    }
    var closeBackupsBtn = $('#closeBackups');
    if (closeBackupsBtn) closeBackupsBtn.addEventListener('click', closeBackups);
    var sidebarBackdrop = $('#sidebarBackdrop');
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', function (event) {
      var mod = event.ctrlKey || event.metaKey;
      var key = (event.key || '').toLowerCase();
      if (modalsOpen > 0) {
        if (event.key === 'Tab') {
          trapModalFocus(event);
          return;
        }
        if (event.key === 'Escape') {
          closeOverlays();
          return;
        }
        if (mod && (key === 's' || key === 'b' || key === 'f')) event.preventDefault();
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (mod && key === 'b') {
        event.preventDefault();
        cycleView();
        return;
      }
      if (mod && key === 'f') {
        event.preventDefault();
        var sidebar = $('#sidebar');
        if (sidebar) sidebar.classList.add('open');
        var search = $('#searchInput');
        if (search) { search.focus(); search.select(); }
        return;
      }
      if (event.key === 'Escape') {
        closeOverlays();
      }
    });

    window.addEventListener('beforeunload', function (event) {
      if (!state.editor.dirty) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    });

    document.addEventListener('click', function (event) {
      var menu = $('#templateMenu');
      if (!menu || menu.hidden) return;
      if (menu.contains(event.target)) return;
      var button = $('#templateBtn');
      if (button && button.contains(event.target)) return;
      menu.hidden = true;
    });

    var backdrop = $('#modalBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) hideModal();
      });
    }

    if (window.ResizeObserver) {
      var observer = new ResizeObserver(function () { syncOverlay(); });
      var wrap = $('.code-wrap');
      if (wrap) observer.observe(wrap);
    }
    window.addEventListener('resize', function () { syncOverlay(); });

    if (window.matchMedia) {
      var media = window.matchMedia('(prefers-color-scheme: light)');
      var onChange = function () { if (themePref === 'auto') applyTheme(); };
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    }
  }

  function restorePreferences() {
    try {
      themePref = localStorage.getItem('pm.theme') || 'auto';
      var savedView = localStorage.getItem('pm.view');
      if (savedView === 'edit' || savedView === 'split' || savedView === 'preview') state.viewMode = savedView;
    } catch (error) { /* ignore */ }
    if (window.innerWidth < 860 && state.viewMode === 'split') state.viewMode = 'edit';
    applyTheme();
    setViewMode(state.viewMode, true);
  }

  function init() {
    restorePreferences();
    bindEvents();
    loadState(false).then(function () {
      var editor = $('#editor');
      if (editor) editor.focus();
    });
    setInterval(poll, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;
