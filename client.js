/**
 * Browser half of @local/dsh-prompt-manager.
 *
 * Registers a settings page (Settings -> 提示词) inside the DSH Web GUI and
 * talks to the Host half through the same-origin JSON API mounted at
 * /prompt-manager/api. Written in the bundle's lazy-CJS module format:
 * executing it only registers a factory; the factory materializes on demand.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-manager',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'prompt-manager';
    const PAGE_PATH = '/prompt-manager';
    const API = PAGE_PATH + '/api';
    const MAX_PREVIEW_CHARS = 400000;

    const dictionaries = {
      zh: {
        nav: '提示词',
        title: '提示词文件',
        subtitle: '管理全局与各工作区的 AGENTS.md',
        refresh: '刷新',
        openPage: '独立页面',
        search: '搜索文件或路径…',
        loading: '正在读取作用域…',
        empty: '没有可管理的作用域。先在工作区中开始一个会话，然后刷新。',
        scopeCount: '个作用域',
        global: '全局配置',
        workspace: '工作区',
        existing: '已存在',
        missing: '未创建',
        backupsCount: '个备份',
        save: '保存',
        create: '创建文件',
        saving: '保存中…',
        reload: '重新加载',
        backups: '备份',
        insertTemplate: '插入模板…',
        edit: '编辑',
        split: '分屏',
        preview: '预览',
        chars: '字符',
        lines: '行',
        savedAt: '已保存',
        unsaved: '未保存修改',
        notCreated: '尚未创建',
        bannerMissing: '该文件尚未创建。可以填入初始化模板，或直接输入内容后保存。',
        fillTemplate: '填入初始化模板',
        createEmpty: '创建空文件',
        bannerConflict: '磁盘上的文件已被外部修改（或删除），当前编辑内容基于旧版本。',
        forceSave: '覆盖保存',
        bannerSwitch: '当前文件有未保存的修改。',
        saveAndSwitch: '保存并切换',
        discardAndSwitch: '放弃并切换',
        cancel: '取消',
        bannerRollback: '回滚到该备份？当前文件会先自动备份一次。',
        confirmRollback: '确认回滚',
        saveError: '保存失败',
        retry: '重试',
        dismiss: '关闭',
        warning: '提示',
        backupTitle: '备份历史',
        backupEmpty: '还没有备份。每次保存覆盖前都会在文件同目录生成带时间戳的备份。',
        newest: '最新',
        view: '查看',
        rollback: '回滚',
        backupPreview: '备份预览',
        diffStat: '相对当前编辑内容',
        noHeading: '（无标题行）',
        largeBackup: '（大文件，未读取预览）',
        close: '关闭',
        draftHint: '编辑区支持 Ctrl/Cmd+S 保存。保存后由 agent-instructions 在下一次模型步骤读取。',
        readFailed: '读取失败',
        stateFailed: '无法读取作用域，请确认插件已启用。',
        pageLinkTitle: '在浏览器中打开独立页面',
        pageUrlHint: '若按钮未能打开新窗口，可复制上面的地址到浏览器',
        notInjected: '保存内容会在下一次模型步骤生效',
      },
      en: {
        nav: 'Prompts',
        title: 'Prompt files',
        subtitle: 'Manage the global and per-workspace AGENTS.md files',
        refresh: 'Refresh',
        openPage: 'Standalone page',
        search: 'Search files or paths…',
        loading: 'Reading scopes…',
        empty: 'No manageable scopes. Start a session in a workspace, then refresh.',
        scopeCount: 'scopes',
        global: 'Global',
        workspace: 'Workspace',
        existing: 'exists',
        missing: 'not created',
        backupsCount: 'backups',
        save: 'Save',
        create: 'Create file',
        saving: 'Saving…',
        reload: 'Reload',
        backups: 'Backups',
        insertTemplate: 'Insert template…',
        edit: 'Edit',
        split: 'Split',
        preview: 'Preview',
        chars: 'chars',
        lines: 'lines',
        savedAt: 'Saved',
        unsaved: 'Unsaved changes',
        notCreated: 'Not created yet',
        bannerMissing: 'This file does not exist yet. Fill in the starter template, or type content and save.',
        fillTemplate: 'Fill starter template',
        createEmpty: 'Create empty file',
        bannerConflict: 'The file was changed or deleted outside the editor; this content is based on an older version.',
        forceSave: 'Overwrite',
        bannerSwitch: 'The current file has unsaved changes.',
        saveAndSwitch: 'Save and switch',
        discardAndSwitch: 'Discard and switch',
        cancel: 'Cancel',
        bannerRollback: 'Roll back to this backup? The current file is backed up first.',
        confirmRollback: 'Roll back',
        saveError: 'Save failed',
        retry: 'Retry',
        dismiss: 'Dismiss',
        warning: 'Warning',
        backupTitle: 'Backup history',
        backupEmpty: 'No backups yet. Each overwrite first writes a timestamped backup next to the file.',
        newest: 'newest',
        view: 'View',
        rollback: 'Roll back',
        backupPreview: 'Backup preview',
        diffStat: 'against current editor content',
        noHeading: '(no heading)',
        largeBackup: '(large file, preview not read)',
        close: 'Close',
        draftHint: 'Ctrl/Cmd+S saves. The standard preset reads the file on the next model step.',
        readFailed: 'Read failed',
        stateFailed: 'Could not read scopes. Check that the plugin is enabled.',
        pageLinkTitle: 'Open the standalone page in a browser',
        pageUrlHint: "If the button doesn't open a new window, copy the address above into a browser",
        notInjected: 'The saved content applies on the next model step',
      },
    };

    const CSS = `
.pm-page { display: flex; flex-direction: column; gap: 10px; height: min(72vh, 720px); min-height: 430px; color: var(--dsw-alias-label-primary); }
.pm-head { display: flex; align-items: flex-start; gap: 12px; }
.pm-head-main { min-width: 0; flex: 1 1 auto; }
.pm-title { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: .2px; }
.pm-sub { margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.pm-head-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.pm-btn { display: inline-flex; align-items: center; justify-content: center; height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-size: 12px; cursor: pointer; white-space: nowrap; }
.pm-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
.pm-btn:disabled { opacity: .5; cursor: not-allowed; }
.pm-btn.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-layer-1); }
.pm-btn.danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent); background: transparent; }
.pm-btn.ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.pm-btn.ghost:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.pm-link { font-size: 11.5px; color: var(--dsw-alias-brand-primary); text-decoration: none; }
.pm-link:hover { text-decoration: underline; }
.pm-page-url { margin-top: 2px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; }
.pm-body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 216px minmax(0, 1fr); gap: 10px; }
.pm-side { min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.pm-search { margin: 8px; height: 28px; padding: 0 8px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; outline: none; }
.pm-search:focus { border-color: var(--dsw-alias-brand-primary); }
.pm-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 6px 8px; }
.pm-group { margin-top: 6px; }
.pm-group-head { padding: 6px 6px 4px; }
.pm-kicker { font-size: 10px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.pm-group-name { margin-top: 1px; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-group-path { margin-top: 1px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-group-empty { padding: 2px 6px 6px; font-size: 11px; color: var(--dsw-alias-state-error-primary); }
.pm-item { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; padding: 7px 7px; margin: 1px 0; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.pm-item:hover { background: var(--dsw-alias-bg-layer-1); }
.pm-item.active { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); }
.pm-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-state-idle-primary); }
.pm-dot.exists { background: var(--dsw-alias-state-success-primary); }
.pm-dot.dirty { background: var(--dsw-alias-state-warn-primary); }
.pm-item-main { min-width: 0; flex: 1 1 auto; }
.pm-item-title { font-size: 12px; font-weight: 540; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-item-path { margin-top: 1px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-item-meta { flex: 0 0 auto; font-size: 10px; color: var(--dsw-alias-label-secondary); display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.pm-tag { padding: 0 4px; border-radius: 4px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 9.5px; line-height: 15px; }
.pm-tag.warn { color: var(--dsw-alias-state-warn-primary); }
.pm-tag.missing { border: 1px dashed var(--dsw-alias-border-l2); background: transparent; }
.pm-editor { min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.pm-editor-head { padding: 9px 12px 7px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.pm-crumbs { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.pm-file-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.pm-file-title { margin: 0; font-size: 14px; font-weight: 650; }
.pm-badge { padding: 0 6px; border-radius: 5px; font-size: 10px; line-height: 18px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.pm-badge.ok { color: var(--dsw-alias-state-success-primary); }
.pm-badge.warn { color: var(--dsw-alias-state-warn-primary); }
.pm-file-path { margin-top: 3px; font-size: 10.5px; font-family: ui-monospace, Consolas, monospace; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.pm-seg { display: inline-flex; padding: 2px; border-radius: 7px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); }
.pm-seg button { height: 22px; padding: 0 8px; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 11px; cursor: pointer; }
.pm-seg button.on { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.pm-spacer { flex: 1 1 auto; }
.pm-banner { margin: 8px 10px 0; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); font-size: 11.5px; line-height: 1.6; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pm-banner.warn { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent); }
.pm-banner.error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent); }
.pm-banner-text { flex: 1 1 auto; min-width: 0; }
.pm-banner-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.pm-content { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.pm-content.mode-split { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pm-pane-edit { min-width: 0; min-height: 0; display: none; }
.pm-pane-edit.on { display: flex; }
.pm-textarea { flex: 1 1 auto; width: 100%; resize: none; border: 0; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12.5px; line-height: 1.65; padding: 11px 12px 40px; white-space: pre-wrap; }
.pm-pane-preview { min-width: 0; min-height: 0; overflow: auto; padding: 12px 16px 40px; border-left: 1px solid var(--dsw-alias-border-l1); display: none; font-size: 12.5px; line-height: 1.7; }
.pm-pane-preview.on { display: block; }
.pm-md { overflow-wrap: anywhere; }
.pm-md > :first-child { margin-top: 0; }
.pm-md h1, .pm-md h2, .pm-md h3, .pm-md h4 { color: var(--dsw-alias-label-primary); line-height: 1.4; margin: 1.2em 0 .45em; }
.pm-md h1 { font-size: 1.45em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: .25em; }
.pm-md h2 { font-size: 1.25em; }
.pm-md h3 { font-size: 1.1em; }
.pm-md p { margin: .55em 0; color: var(--dsw-alias-label-secondary); }
.pm-md ul, .pm-md ol { margin: .5em 0; padding-left: 1.4em; color: var(--dsw-alias-label-secondary); }
.pm-md li { margin: .18em 0; }
.pm-md code { font-family: ui-monospace, Consolas, monospace; font-size: .9em; padding: .12em .35em; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); }
.pm-md pre { margin: .7em 0; padding: 10px 12px; overflow: auto; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.pm-md pre code { padding: 0; background: transparent; }
.pm-md blockquote { margin: .7em 0; padding: .1em 0 .1em .9em; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.pm-md hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l2); margin: 1.1em 0; }
.pm-md a { color: var(--dsw-alias-brand-primary); }
.pm-md table { border-collapse: collapse; margin: .7em 0; }
.pm-md th, .pm-md td { border: 1px solid var(--dsw-alias-border-l1); padding: 4px 8px; text-align: left; }
.pm-md th { background: var(--dsw-alias-bg-layer-2); }
.pm-md .pm-note { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.pm-empty { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.8; }
.pm-statusbar { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.pm-statusbar .grow { flex: 1 1 auto; }
.pm-status-ok { color: var(--dsw-alias-state-success-primary); }
.pm-status-warn { color: var(--dsw-alias-state-warn-primary); }
.pm-status-error { color: var(--dsw-alias-state-error-primary); }
.pm-backups { border-top: 1px solid var(--dsw-alias-border-l1); max-height: 40%; overflow: auto; padding: 8px 10px; }
.pm-backups-head { display: flex; align-items: center; gap: 8px; font-size: 11.5px; margin-bottom: 6px; color: var(--dsw-alias-label-secondary); }
.pm-backup-row { display: flex; align-items: center; gap: 8px; padding: 6px 6px; border-radius: 7px; }
.pm-backup-row:hover { background: var(--dsw-alias-bg-layer-2); }
.pm-backup-main { min-width: 0; flex: 1 1 auto; }
.pm-backup-title { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-backup-meta { font-size: 10px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pm-backup-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.pm-backup-preview { margin-top: 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); padding: 8px 10px; }
.pm-backup-preview pre { margin: 4px 0 0; max-height: 160px; overflow: auto; font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.pm-faint { color: var(--dsw-alias-label-secondary); font-size: 10.5px; }
@media (max-width: 760px) {
  .pm-page { height: auto; min-height: 520px; }
  .pm-body { grid-template-columns: minmax(0, 1fr); }
  .pm-side { max-height: 200px; }
  .pm-content.mode-split { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
}
`;

    function formatBytes(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return '0 B';
      if (n >= 1048576) return (n / 1048576).toFixed(n % 1048576 === 0 ? 0 : 1) + ' MiB';
      if (n >= 1024) return Math.round(n / 1024) + ' KiB';
      return n + ' B';
    }

    function formatTime(ms) {
      if (!ms) return '—';
      try {
        return new Date(ms).toLocaleString(undefined, {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });
      } catch (error) {
        return String(ms);
      }
    }

    function escapeHtml(text) {
      return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[ch]));
    }

    function inlineMarkdown(text) {
      let out = escapeHtml(text);
      const codes = [];
      out = out.replace(/`+([^`]+?)`+/g, (match, inner) => {
        codes.push('<code>' + inner + '</code>');
        return '\uE000' + (codes.length - 1) + '\uE001';
      });
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
      out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
        if (!/^(https?:\/\/|mailto:|\/|#)/i.test(href)) return match;
        return '<a href="' + href + '" target="_blank" rel="noreferrer noopener">' + label + '</a>';
      });
      out = out.replace(/\uE000(\d+)\uE001/g, (match, index) => codes[Number(index)] || '');
      return out;
    }

    function renderMarkdown(source) {
      const text = String(source == null ? '' : source).replace(/\r\n?/g, '\n');
      if (text.trim().length === 0) return '<p class="pm-note">（空文件）</p>';
      if (text.length > MAX_PREVIEW_CHARS) {
        return '<p class="pm-note">内容过大，预览已暂停（编辑与保存不受影响）。</p>';
      }
      const lines = text.split('\n');
      let html = '';
      let index = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (/^\s*$/.test(line)) { index += 1; continue; }
        const fence = line.match(/^\s{0,3}(```|~~~)([A-Za-z0-9_+-]*)\s*$/);
        if (fence) {
          const code = [];
          index += 1;
          while (index < lines.length && !/^\s{0,3}(?:```|~~~)\s*$/.test(lines[index])) {
            code.push(lines[index]);
            index += 1;
          }
          index += 1;
          html += '<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>';
          continue;
        }
        const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
        if (heading) {
          const level = Math.min(4, heading[1].length);
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
          const quoted = [];
          while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
            quoted.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
            index += 1;
          }
          html += '<blockquote>' + renderMarkdown(quoted.join('\n')) + '</blockquote>';
          continue;
        }
        const bullet = line.match(/^\s*((?:[-*+])|(?:\d+[.)]))\s+(.*)$/);
        if (bullet) {
          const ordered = /^\d/.test(bullet[1]);
          const items = [];
          while (index < lines.length) {
            const item = lines[index].match(/^\s*((?:[-*+])|(?:\d+[.)]))\s+(.*)$/);
            if (!item) break;
            if (/^\d/.test(item[1]) !== ordered) break;
            items.push(item[2]);
            index += 1;
          }
          const tag = ordered ? 'ol' : 'ul';
          html += '<' + tag + '>';
          for (const item of items) {
            const task = item.match(/^\[( |x|X)\]\s+([\s\S]*)$/);
            html += '<li>' + (task
              ? '<span class="pm-faint">' + (task[1].toLowerCase() === 'x' ? '☑' : '☐') + '</span> ' + inlineMarkdown(task[2])
              : inlineMarkdown(item)) + '</li>';
          }
          html += '</' + tag + '>';
          continue;
        }
        const paragraph = [line];
        index += 1;
        while (index < lines.length) {
          const next = lines[index];
          if (/^\s*$/.test(next)) break;
          if (/^\s{0,3}(#{1,6})\s+/.test(next)) break;
          if (/^\s{0,3}(```|~~~)/.test(next)) break;
          if (/^\s{0,3}>/.test(next)) break;
          if (/^\s*((?:[-*+])|(?:\d+[.)]))\s+/.test(next)) break;
          if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(next)) break;
          paragraph.push(next);
          index += 1;
        }
        html += '<p>' + inlineMarkdown(paragraph.join('\n')) + '</p>';
      }
      return html;
    }

    function diffStat(current, backup) {
      const counts = new Map();
      for (const line of String(backup).split('\n')) counts.set(line, (counts.get(line) || 0) + 1);
      let removed = 0;
      for (const line of String(current).split('\n')) {
        const count = counts.get(line) || 0;
        if (count > 0) counts.set(line, count - 1);
        else removed += 1;
      }
      let added = 0;
      counts.forEach((count) => { added += count; });
      return { added, removed };
    }

    async function apiRequest(path, options) {
      const init = Object.assign({}, options || {});
      init.headers = Object.assign({ 'x-prompt-manager': '1', accept: 'application/json' }, init.headers || {});
      const response = await fetch(API + path, init);
      let data = {};
      try { data = await response.json(); } catch (error) { data = {}; }
      if (!response.ok) {
        const error = new Error(data.message || data.error || ('HTTP ' + response.status));
        error.code = data.error;
        error.status = response.status;
        throw error;
      }
      return data;
    }

    function apiGet(path) {
      return apiRequest(path, { method: 'GET' });
    }

    function apiPost(path, body) {
      return apiRequest(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS);

      ctx.effect(() => {
        const offZh = ctx.locale.register(NS, 'zh', dictionaries.zh);
        const offEn = ctx.locale.register(NS, 'en', dictionaries.en);
        return () => { offZh(); offEn(); };
      }, 'prompt-manager: locale');

      function PromptManagerPage() {
        const [, forceRender] = React.useReducer((value) => value + 1, 0);
        const [groups, setGroups] = React.useState([]);
        const [templates, setTemplates] = React.useState([]);
        const [selectedId, setSelectedId] = React.useState(null);
        const [file, setFile] = React.useState(null);
        const [dirty, setDirty] = React.useState(false);
        const [loading, setLoading] = React.useState(true);
        const [saving, setSaving] = React.useState(false);
        const [filter, setFilter] = React.useState('');
        const [viewMode, setViewMode] = React.useState('split');
        const [status, setStatus] = React.useState(null);
        const [conflict, setConflict] = React.useState(null);
        const [saveError, setSaveError] = React.useState(null);
        const [pendingSwitch, setPendingSwitch] = React.useState(null);
        const [pendingRollback, setPendingRollback] = React.useState(null);
        const [backupPanel, setBackupPanel] = React.useState(null);

        const editorRef = React.useRef(null);
        const liveRef = React.useRef({});
        liveRef.current = { selectedId, file, dirty, conflict, saving, pendingSwitch, pendingRollback };

        const setNotice = React.useCallback((kind, text) => {
          setStatus({ kind, text, at: Date.now() });
        }, []);

        React.useEffect(() => {
          const off = ctx.locale.subscribe(() => forceRender());
          return off;
        }, []);

        React.useEffect(() => {
          if (!status) return undefined;
          if (status.kind === 'error') return undefined;
          const timer = setTimeout(() => setStatus((current) => (current === status ? null : current)), 5000);
          return () => clearTimeout(timer);
        }, [status]);

        const loadFile = React.useCallback(async (id) => {
          try {
            const data = await apiGet('/file?id=' + encodeURIComponent(id));
            setSelectedId(id);
            setFile({
              content: data.content || '',
              loadedContent: data.content || '',
              exists: data.file.exists === true,
              eol: data.eol || 'lf',
              bom: data.bom === true,
              mtimeMs: data.mtimeMs,
              size: data.size || 0,
              file: data.file,
              backups: data.backups || [],
              lines: data.lines || 1,
            });
            setDirty(false);
            setConflict(null);
            setSaveError(null);
            setPendingSwitch(null);
            setPendingRollback(null);
            setBackupPanel(null);
          } catch (error) {
            setNotice('error', t('readFailed') + ': ' + error.message);
          }
        }, [t, setNotice]);

        const refreshGroups = React.useCallback(async (wantInitial) => {
          try {
            const data = await apiGet('/state');
            setGroups(data.groups || []);
            setTemplates(data.templates || []);
            setLoading(false);
            const current = liveRef.current;
            const currentGroup = (data.groups || []).find((group) => (group.files || []).some((item) => item.id === current.selectedId));
            const currentMeta = currentGroup && currentGroup.files.find((item) => item.id === current.selectedId);
            if (wantInitial || !current.selectedId) {
              const flat = [];
              for (const group of data.groups || []) for (const item of group.files || []) flat.push(item);
              if (flat.length === 0) {
                setLoading(false);
                return;
              }
              const first = flat.find((item) => item.exists) || flat[0];
              await loadFile(first.id);
              return;
            }
            if (currentMeta && current.file && !current.saving) {
              if (!currentMeta.exists) {
                setConflict({ external: true });
                return;
              }
              const changed = current.file.exists && current.file.mtimeMs != null &&
                Math.abs(currentMeta.mtimeMs - current.file.mtimeMs) > 0.5;
              if (!changed) {
                setFile((previous) => previous && ({ ...previous, file: currentMeta, backups: previous.backups }));
                return;
              }
              if (current.dirty) {
                setConflict({ external: true });
                return;
              }
              await loadFile(current.selectedId);
            }
          } catch (error) {
            setLoading(false);
            setNotice('error', t('stateFailed') + ' (' + error.message + ')');
          }
        }, [loadFile, t, setNotice]);

        React.useEffect(() => {
          refreshGroups(true);
          const timer = setInterval(() => {
            const live = liveRef.current;
            if (live.saving || live.pendingSwitch || live.pendingRollback) return;
            refreshGroups(false);
          }, 6000);
          return () => clearInterval(timer);
        }, [refreshGroups]);

        const save = React.useCallback(async (options) => {
          const live = liveRef.current;
          if (!live.file || !live.selectedId || live.saving) return false;
          const content = options && typeof options.content === 'string' ? options.content : live.file.content;
          setSaving(true);
          try {
            const data = await apiPost('/save', {
              id: live.selectedId,
              content,
              baseMtimeMs: live.file.exists ? live.file.mtimeMs : null,
              eol: live.file.eol,
              bom: live.file.bom,
              force: (options && options.force) === true,
            });
            setFile((previous) => previous && ({
              ...previous,
              exists: true,
              mtimeMs: data.file.mtimeMs,
              size: data.file.size,
              loadedContent: previous.content,
              file: data.file,
              backups: data.backups || [],
            }));
            setDirty(false);
            setConflict(null);
            setSaveError(null);
            setGroups((previous) => previous.map((group) => ({
              ...group,
              files: (group.files || []).map((item) => (item.id === live.selectedId ? data.file : item)),
            })));
            setNotice('ok', data.unchanged
              ? t('savedAt') + ' · ' + t('notInjected')
              : t('savedAt') + ' · ' + t('notInjected') + (data.backupName ? ' · ' + data.backupName : ''));
            return true;
          } catch (error) {
            if (error.code === 'CONFLICT') {
              setConflict({ external: true });
              setNotice('warn', t('bannerConflict'));
            } else {
              setConflict(null);
              const message = error.code === 'TOO_LARGE'
                ? error.message || 'TOO_LARGE'
                : (error.message || String(error));
              setSaveError(message);
              setNotice('error', t('saveError') + ': ' + message);
            }
            return false;
          } finally {
            setSaving(false);
          }
        }, [setNotice, t]);

        const reload = React.useCallback(async () => {
          const live = liveRef.current;
          if (!live.selectedId) return;
          try {
            const data = await apiGet('/file?id=' + encodeURIComponent(live.selectedId));
            setFile((previous) => previous && ({
              ...previous,
              content: data.content || '',
              loadedContent: data.content || '',
              exists: data.file.exists === true,
              eol: data.eol || 'lf',
              bom: data.bom === true,
              mtimeMs: data.mtimeMs,
              size: data.size || 0,
              file: data.file,
              backups: data.backups || [],
            }));
            setDirty(false);
            setConflict(null);
            setSaveError(null);
            setNotice('ok', t('reload'));
          } catch (error) {
            setNotice('error', t('readFailed') + ': ' + error.message);
          }
        }, [setNotice, t]);

        const requestSelect = React.useCallback((id) => {
          const live = liveRef.current;
          if (id === live.selectedId) return;
          if (live.dirty) {
            setPendingSwitch(id);
            return;
          }
          loadFile(id);
        }, [loadFile]);

        const onChange = React.useCallback((event) => {
          const content = event.target.value;
          setFile((previous) => (previous ? { ...previous, content } : previous));
          setDirty((currentDirty) => content !== (liveRef.current.file ? liveRef.current.file.loadedContent : content));
        }, []);

        const insertTemplate = React.useCallback((event) => {
          const index = Number(event.target.value);
          event.target.value = '';
          if (!Number.isInteger(index) || !templates[index]) return;
          const textarea = editorRef.current;
          const template = templates[index];
          if (!textarea) return;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const current = textarea.value;
          const before = current.slice(0, start);
          let insert = template.body;
          if (before.length > 0 && before.charAt(before.length - 1) !== '\n') insert = '\n\n' + insert;
          if (current.slice(end).length > 0 && current.charAt(end) !== '\n') insert += '\n';
          textarea.setRangeText(insert, start, end, 'end');
          const next = textarea.value;
          setFile((previous) => (previous ? { ...previous, content: next } : previous));
          setDirty(next !== liveRef.current.file.loadedContent);
          textarea.focus();
        }, [templates]);

        const openBackups = React.useCallback(async () => {
          const live = liveRef.current;
          if (!live.selectedId) return;
          try {
            const data = await apiGet('/backups?id=' + encodeURIComponent(live.selectedId));
            setBackupPanel({ backups: data.backups || [], preview: null });
          } catch (error) {
            setNotice('error', t('readFailed') + ': ' + error.message);
          }
        }, [setNotice, t]);

        const previewBackup = React.useCallback(async (name) => {
          const live = liveRef.current;
          try {
            const data = await apiGet('/backup?id=' + encodeURIComponent(live.selectedId) + '&name=' + encodeURIComponent(name));
            setBackupPanel((previous) => (previous ? { ...previous, preview: data } : previous));
          } catch (error) {
            setNotice('error', t('readFailed') + ': ' + error.message);
          }
        }, [setNotice, t]);

        const doRollback = React.useCallback(async (name) => {
          const live = liveRef.current;
          try {
            const data = await apiPost('/rollback', { id: live.selectedId, name });
            setFile((previous) => previous && ({
              ...previous,
              content: data.content,
              loadedContent: data.content,
              exists: true,
              mtimeMs: data.mtimeMs,
              size: data.size,
              eol: data.eol,
              bom: data.bom,
              file: data.file,
              backups: data.backups || [],
            }));
            setDirty(false);
            setConflict(null);
            setSaveError(null);
            setPendingRollback(null);
            setBackupPanel({ backups: data.backups || [], preview: null });
            setGroups((previous) => previous.map((group) => ({
              ...group,
              files: (group.files || []).map((item) => (item.id === live.selectedId ? data.file : item)),
            })));
            setNotice('ok', t('rollback') + ': ' + name);
          } catch (error) {
            setNotice('error', t('readFailed') + ': ' + error.message);
          }
        }, [setNotice, t]);

        React.useEffect(() => {
          const onKeyDown = (event) => {
            const mod = event.ctrlKey || event.metaKey;
            if (!mod || (event.key || '').toLowerCase() !== 's') return;
            if (!liveRef.current.selectedId) return;
            const target = event.target;
            const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
            if (tag !== 'textarea' && tag !== 'input') {
              // Still saves; the page is the active management surface.
            }
            event.preventDefault();
            event.stopPropagation();
            save();
          };
          window.addEventListener('keydown', onKeyDown, true);
          return () => window.removeEventListener('keydown', onKeyDown, true);
        }, [save]);

        const fillStarter = React.useCallback(async () => {
          try {
            const data = await apiGet('/starter');
            setFile((previous) => previous && ({ ...previous, content: data.content || '' }));
            setDirty(true);
            setNotice('ok', t('fillTemplate'));
          } catch (error) {
            setNotice('error', t('readFailed') + ': ' + error.message);
          }
        }, [setNotice, t]);

        const createEmpty = React.useCallback(() => {
          setFile((previous) => previous && ({ ...previous, content: '' }));
          setDirty(true);
          save({ content: '' });
        }, [save]);

        const visibleGroups = React.useMemo(() => {
          const needle = filter.trim().toLowerCase();
          if (needle.length === 0) return groups;
          return groups.map((group) => ({
            ...group,
            files: (group.files || []).filter((item) => {
              const haystack = [item.title, item.displayPath, item.path, group.title, group.subtitle || '']
                .join(' ').toLowerCase();
              return haystack.includes(needle);
            }),
          })).filter((group) => group.files.length > 0);
        }, [filter, groups]);

        const currentMeta = file && file.file ? file.file : null;
        const warnings = (currentMeta && currentMeta.warnings) || [];

        const banner = (() => {
          if (conflict) {
            return {
              kind: 'error',
              text: t('bannerConflict'),
              actions: [
                { label: t('reload'), onClick: reload },
                { label: t('forceSave'), primary: true, onClick: () => save({ force: true }) },
                { label: t('cancel'), onClick: () => setConflict(null) },
              ],
            };
          }
          if (saveError) {
            return {
              kind: 'error',
              text: t('saveError') + ': ' + saveError,
              actions: [
                { label: t('retry'), primary: true, onClick: () => { setSaveError(null); save(); } },
                { label: t('dismiss'), onClick: () => setSaveError(null) },
              ],
            };
          }
          if (pendingSwitch) {
            return {
              kind: 'warn',
              text: t('bannerSwitch'),
              actions: [
                { label: t('saveAndSwitch'), primary: true, onClick: async () => { if (await save()) loadFile(pendingSwitch); } },
                { label: t('discardAndSwitch'), danger: true, onClick: () => loadFile(pendingSwitch) },
                { label: t('cancel'), onClick: () => setPendingSwitch(null) },
              ],
            };
          }
          if (pendingRollback) {
            return {
              kind: 'warn',
              text: t('bannerRollback'),
              actions: [
                { label: t('confirmRollback'), danger: true, onClick: () => doRollback(pendingRollback) },
                { label: t('cancel'), onClick: () => setPendingRollback(null) },
              ],
            };
          }
          if (file && !file.exists) {
            return {
              kind: 'warn',
              text: t('bannerMissing'),
              actions: [
                { label: t('fillTemplate'), onClick: fillStarter },
                { label: t('createEmpty'), onClick: createEmpty },
              ],
            };
          }
          if (warnings.length > 0) {
            return { kind: 'warn', text: warnings.join('；'), actions: [] };
          }
          return null;
        })();

        const selectedGroup = (() => {
          for (const group of groups) {
            if ((group.files || []).some((item) => item.id === selectedId)) return group;
          }
          return null;
        })();

        const renderedPreview = React.useMemo(() => {
          if (!file) return '';
          return renderMarkdown(file.content);
        }, [file && file.content]);

        const backupPreview = backupPanel && backupPanel.preview;
        const pageOrigin = (window.location && window.location.origin) || '';
        const pageUrl = pageOrigin + PAGE_PATH;

        return h('div', { className: 'pm-page' },
          h('style', null, CSS),
          h('div', { className: 'pm-head' },
            h('div', { className: 'pm-head-main' },
              h('h2', { className: 'pm-title' }, t('title')),
              h('div', { className: 'pm-sub' }, t('subtitle') + ' · ' + groups.length + ' ' + t('scopeCount')),
              h('div', { className: 'pm-page-url', title: t('pageUrlHint') }, pageUrl),
            ),
            h('div', { className: 'pm-head-actions' },
              status ? h('span', {
                className: 'pm-faint ' + (status.kind === 'ok' ? 'pm-status-ok' : status.kind === 'warn' ? 'pm-status-warn' : 'pm-status-error'),
              }, status.text) : null,
              h('button', { className: 'pm-btn ghost', type: 'button', onClick: () => refreshGroups(false) }, t('refresh')),
              h('a', {
                className: 'pm-link', href: pageUrl, target: '_blank', rel: 'noreferrer', title: t('pageLinkTitle'),
              }, t('openPage')),
            ),
          ),
          h('div', { className: 'pm-body' },
            h('div', { className: 'pm-side' },
              h('input', {
                className: 'pm-search', type: 'search', value: filter,
                placeholder: t('search'), spellCheck: false,
                onChange: (event) => setFilter(event.target.value),
              }),
              h('div', { className: 'pm-list' },
                visibleGroups.length === 0
                  ? h('div', { className: 'pm-group-empty' }, loading ? t('loading') : t('empty'))
                  : visibleGroups.map((group) => h('div', { className: 'pm-group', key: group.key },
                    h('div', { className: 'pm-group-head' },
                      h('div', { className: 'pm-kicker' }, group.kind === 'global' ? t('global') : t('workspace')),
                      h('div', { className: 'pm-group-name', title: group.title },
                        group.kind === 'global' ? t('title') : group.title),
                      h('div', { className: 'pm-group-path', title: group.subtitle }, group.subtitle),
                    ),
                    group.missingDirectory
                      ? h('div', { className: 'pm-group-empty' }, t('empty'))
                      : null,
                    (group.files || []).map((item) => h('button', {
                      type: 'button', key: item.id,
                      className: 'pm-item' + (item.id === selectedId ? ' active' : ''),
                      onClick: () => requestSelect(item.id),
                      title: item.displayPath,
                    },
                      h('span', { className: 'pm-dot' + (item.exists ? ' exists' : '') + (item.id === selectedId && dirty ? ' dirty' : '') }),
                      h('span', { className: 'pm-item-main' },
                        h('span', { className: 'pm-item-title' }, item.title),
                        h('span', { className: 'pm-item-path' }, item.displayPath),
                      ),
                      h('span', { className: 'pm-item-meta' },
                        item.exists
                          ? h('span', { className: 'pm-tag' }, formatBytes(item.size))
                          : h('span', { className: 'pm-tag missing' }, t('missing')),
                        item.backupCount > 0 ? h('span', { className: 'pm-tag' }, item.backupCount + ' ' + t('backupsCount')) : null,
                      ),
                    )),
                  )),
              ),
            ),
            h('div', { className: 'pm-editor' },
              file
                ? h(React.Fragment, null,
                  h('div', { className: 'pm-editor-head' },
                    h('div', { className: 'pm-crumbs' },
                      (selectedGroup ? (selectedGroup.kind === 'global' ? t('global') : selectedGroup.title) : '') + ' / ' + (currentMeta ? currentMeta.title : 'AGENTS.md')),
                    h('div', { className: 'pm-file-row' },
                      h('h3', { className: 'pm-file-title' }, currentMeta ? currentMeta.title : 'AGENTS.md'),
                      h('span', { className: 'pm-badge' + (file.exists ? ' ok' : '') },
                        file.exists ? t('existing') : t('missing')),
                      file.exists ? h('span', { className: 'pm-badge' }, formatBytes(file.size)) : null,
                      (file.backups || []).length > 0 ? h('span', { className: 'pm-badge' }, (file.backups || []).length + ' ' + t('backupsCount')) : null,
                      dirty ? h('span', { className: 'pm-badge warn' }, t('unsaved')) : null,
                    ),
                    h('div', { className: 'pm-file-path', title: currentMeta ? currentMeta.path : '' },
                      currentMeta ? currentMeta.displayPath : ''),
                  ),
                  h('div', { className: 'pm-toolbar' },
                    h('div', { className: 'pm-seg' },
                      ['edit', 'split', 'preview'].map((mode) => h('button', {
                        key: mode, type: 'button', className: viewMode === mode ? 'on' : '',
                        onClick: () => setViewMode(mode),
                      }, t(mode))),
                    ),
                    h('select', {
                      className: 'pm-btn', defaultValue: '', onChange: insertTemplate,
                      'aria-label': t('insertTemplate'),
                    },
                      h('option', { value: '' }, t('insertTemplate')),
                      templates.map((template, index) => h('option', { key: template.id, value: String(index) }, template.title)),
                    ),
                    h('span', { className: 'pm-spacer' }),
                    h('button', { className: 'pm-btn', type: 'button', disabled: saving, onClick: reload }, t('reload')),
                    h('button', { className: 'pm-btn', type: 'button', disabled: saving, onClick: openBackups }, t('backups')),
                    h('button', {
                      className: 'pm-btn primary', type: 'button', disabled: saving,
                      onClick: () => save(),
                    }, saving ? t('saving') : (file.exists ? t('save') : t('create'))),
                  ),
                  banner
                    ? h('div', { className: 'pm-banner ' + (banner.kind || '') },
                      h('span', { className: 'pm-banner-text' }, banner.text),
                      h('span', { className: 'pm-banner-actions' }, banner.actions.map((action, index) => h('button', {
                        key: index, type: 'button',
                        className: 'pm-btn' + (action.primary ? ' primary' : '') + (action.danger ? ' danger' : ''),
                        onClick: action.onClick,
                      }, action.label))),
                    )
                    : null,
                  h('div', { className: 'pm-content mode-' + viewMode },
                    h('div', { className: 'pm-pane-edit' + (viewMode === 'preview' ? '' : ' on') },
                      h('textarea', {
                        ref: editorRef,
                        className: 'pm-textarea',
                        value: file.content,
                        spellCheck: false,
                        placeholder: t('draftHint'),
                        onChange,
                      }),
                    ),
                    h('div', {
                      className: 'pm-pane-preview' + (viewMode === 'edit' ? '' : ' on'),
                      dangerouslySetInnerHTML: { __html: '<div class="pm-md">' + renderedPreview + '</div>' },
                    }),
                  ),
                  backupPanel
                    ? h('div', { className: 'pm-backups' },
                      h('div', { className: 'pm-backups-head' },
                        h('span', null, t('backupTitle')),
                        h('span', { className: 'pm-spacer' }),
                        h('button', {
                          className: 'pm-btn ghost', type: 'button',
                          onClick: () => setBackupPanel(null),
                        }, t('close')),
                      ),
                      backupPanel.backups.length === 0
                        ? h('div', { className: 'pm-faint' }, t('backupEmpty'))
                        : backupPanel.backups.map((backup, index) => h('div', { className: 'pm-backup-row', key: backup.name },
                          h('div', { className: 'pm-backup-main' },
                            h('div', { className: 'pm-backup-title' },
                              (index === 0 ? '[' + t('newest') + '] ' : '') + (backup.heading || t('noHeading'))),
                            h('div', { className: 'pm-backup-meta' },
                              backup.name + ' · ' + formatTime(backup.mtimeMs) + ' · ' + formatBytes(backup.size) +
                              (backup.lines ? ' · ' + backup.lines + ' ' + t('lines') : '')),
                          ),
                          h('div', { className: 'pm-backup-actions' },
                            h('button', {
                              className: 'pm-btn ghost', type: 'button',
                              onClick: () => previewBackup(backup.name),
                            }, t('view')),
                            h('button', {
                              className: 'pm-btn danger', type: 'button',
                              onClick: () => setPendingRollback(backup.name),
                            }, t('rollback')),
                          ),
                        )),
                      backupPreview
                        ? h('div', { className: 'pm-backup-preview' },
                          h('div', { className: 'pm-faint' },
                            t('backupPreview') + ': ' + backupPreview.name + ' · ' +
                            t('diffStat') + ' +' + diffStat(file.content, backupPreview.content).added +
                            ' / −' + diffStat(file.content, backupPreview.content).removed + ' ' + t('lines')),
                          h('pre', null, backupPreview.content),
                        )
                        : null,
                    )
                    : null,
                  h('div', { className: 'pm-statusbar' },
                    h('span', null, t('chars') + ' ' + file.content.length + ' · ' + t('lines') + ' ' + (file.content.length === 0 ? 1 : file.content.split('\n').length) + ' · ' + formatBytes(file.size)),
                    h('span', { className: 'grow' }),
                    h('span', { className: dirty ? '' : 'pm-faint' },
                      dirty ? t('unsaved') : (file.exists ? t('savedAt') + ' · ' + formatTime(file.mtimeMs) : t('notCreated'))),
                  ),
                )
                : h('div', { className: 'pm-empty' }, loading ? t('loading') : t('empty')),
            ),
          ),
        );
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'prompt-manager',
        order: 12,
        label: () => t('nav'),
      }, PromptManagerPage));
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
