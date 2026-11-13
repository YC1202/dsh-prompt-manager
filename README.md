# dsh-prompt-manager

DeepSeek Harness 提示词文件管理器：**在 DSH 设置面板里直接管理**全局与各工作区的 `AGENTS.md`。

## 使用 / Usage

1. **在 DSH 内**：左侧栏打开 **设置（Settings）**，在设置页导航中选择 **提示词（Prompts）**。左栏是所有作用域与文件，右栏是编辑器。
2. **独立页面**：在 DSH Web 地址后打开 `/prompt-manager`（本机为 http://127.0.0.1:57993/prompt-manager）。
3. **会话内唤起**：输入 `/prompts`，返回管理入口与快捷键说明。

功能：按全局 / 工作区分组并搜索；Markdown 实时预览（编辑 / 分屏 / 预览三种视图）；8 个常用提示词模板；`Ctrl/Cmd+S` 原子保存；缺失文件一键初始化；外部修改冲突提示；每次覆盖前生成 `.AGENTS.md.<时间戳>.bak`（默认保留 5 个），可预览差异并一键回滚（回滚前会再备份当前内容）。保存后由标准预设的 `agent-instructions` 在下一次模型步骤读取，无需重启。

## 实现 / Implementation

- Host 半：`index.js` 注册 `/prompt-manager` 页面与 JSON API，扫描 `$DSH_HOME/AGENTS.md`、`$DSH_AGENTS_HOME/AGENTS.md` 与 `workspaceRegistry` 中的工作区；`lib/core.js` 负责原子写入、备份轮转与回滚。
- Client 半：`client.js` 以 DSH 客户端 bundle 格式（`window.__ModuleLoader__.load`）注册 `settings.section` 页面，通过同源 API 读写；仅在 DSH 客户端加载，不依赖独立页面。
- 备份保存在被编辑文件同目录；页面/API 只监听本机回环地址。

## 配置 / Configuration

`cordis.patch.yml` 中插件行 `prompt-manager` 的 `config`：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `maxBackups` | `5` | 每个文件保留的备份数量（1–50） |
| `maxInjectBytes` | `65536` | 注入预算提示阈值，与标准预设 `agent-instructions.maxBytes` 对齐 |
| `maxFileBytes` | `1048576` | 单个提示词文件上限，对齐 `agent-instructions.maxSourceBytes` |
| `pagePath` | `/prompt-manager` | 独立页面与 API 的路径前缀 |

## 限制 / Limits

- 仅管理 `AGENTS.md`；`CLAUDE.md`、`AGENTS.local.md` 等只做提示，不在界面中编辑。
- 保存由插件进程直接写文件，不经过会话文件沙箱；因此即使会话是 `workspace-write`，也能写入 `$DSH_HOME`（管理全局提示词所需）。
- 独立页面与 DSH 设置页是两个入口；设置页内编辑是主要方式。

## License

MIT
