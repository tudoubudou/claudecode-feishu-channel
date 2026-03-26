# feishu-channel

> 让 Claude Code 通过飞书与你双向沟通的 MCP Server。在飞书给 Claude 发消息，Claude 的回复直接发回飞书。

## 能做什么

- 📲 **飞书发消息，Claude 自动回复到飞书** — 发简单指令、查状态、临时通知等
- 🔁 **每分钟自动轮询** — 无需手动触发，Claude Code 通过 `/loop` 技能定时检查
- 🔐 **配对验证机制** — 只有通过配对的飞书账号才能与 Claude 通信

## 适用场景与限制

**适合通过飞书操作的场景：**
- 离开电脑时发简单指令（查询、通知、触发单次任务）
- 告知 Claude 需求，让其在后台执行并把结果发回飞书

**不适合的场景：**
- 需要多轮交互的复杂开发任务（飞书来回延迟高，终端更高效）
- 需要查看代码输出、文件内容等长文本（飞书消息有长度限制）
- 需要实时审批工具权限（权限确认只能在终端操作，不支持飞书审批）

**重要限制：**
- 消息最多延迟 1 分钟（轮询间隔）
- Claude 的回复仅发送到飞书，**终端不显示**
- 服务运行在**本地**，Claude Code 必须保持运行状态才能收发消息

## 系统要求

| 项目 | 要求 |
|------|------|
| **Claude Code** | v2.1.63 或更高（推荐 v2.1.81+） |
| **Node.js** | v18 或更高 |
| **飞书** | 需要有企业/团队版飞书，可创建自建应用 |
| **认证方式** | 支持 API Key 认证（无需登录 claude.ai）|

> ⚠️ **注意**：Claude Code 官方的 Channels 功能需要 claude.ai 账号登录，且与 `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` 不兼容。本项目采用**队列轮询方案**，完全兼容 API Key 认证和自定义 API 代理，无此限制。

---

## 第一步：创建飞书自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/) 并登录
2. 点击右上角 **"创建应用"** → 选择 **"自建应用"**
3. 填写应用名称（如 `Claude Bot`）和描述，点击创建

### 获取 App ID 和 App Secret

进入应用后，点击左侧 **"凭证与基础信息"**，记录：
- **App ID**（格式：`cli_xxxxxxxxxxxxxxxxxx`）
- **App Secret**（点击"查看"获取）

### 配置权限

点击左侧 **"权限管理"** → **"API 权限"**，搜索并添加以下权限：

| 权限标识 | 说明 |
|----------|------|
| `im:message:send_as_bot` | 以机器人身份发送消息 |
| `im:message` | 获取与发送单聊、群组消息 |
| `im:message.group_at_msg:readonly` | 读取用户发给机器人的消息 |

### 配置事件订阅（长连接模式）

1. 点击左侧 **"事件与回调"** → **"事件订阅"**
2. **订阅方式** 选择 **"使用长连接接收事件"**（无需公网地址）
3. 点击 **"添加事件"**，搜索并添加：
   - `im.message.receive_v1`（接收消息）

### 发布应用

1. 点击左侧 **"版本管理与发布"** → **"创建版本"**
2. 填写版本号，点击 **"保存"**
3. 点击 **"申请线上发布"**（企业内部应用一般可直接发布）

---

## 第二步：安装本项目

```bash
git clone https://github.com/tudoubudou/claudecode-feishu-channel.git
cd claudecode-feishu-channel
npm install
```

---

## 第三步：配置 Claude Code MCP

在你的 `~/.claude.json` 文件中添加 MCP 配置：

```json
{
  "mcpServers": {
    "feishu": {
      "type": "stdio",
      "command": "/path/to/feishu-channel/node_modules/.bin/tsx",
      "args": ["/path/to/feishu-channel/src/index.ts"],
      "env": {
        "FEISHU_APP_ID": "cli_xxxxxxxxxxxxxxxxxx",
        "FEISHU_APP_SECRET": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

> ⚠️ 将 `/path/to/feishu-channel` 替换为实际路径，将 App ID 和 Secret 替换为第一步获取的值。

**使用绝对路径的原因**：`command` 使用项目内的 `tsx` 可执行文件，避免全局安装依赖。

---

## 第四步：启动 Claude Code

启动 Claude Code（普通方式即可，无需特殊参数）：

```bash
claude
```

启动后，MCP server 会自动在后台连接飞书 WebSocket，开始监听消息。

---

## 第五步：配对飞书账号

配对是一次性操作，用于授权你的飞书账号与 Claude 通信。

### 1. 将机器人添加到飞书

在飞书中搜索你创建的应用名称（如 `Claude Bot`），打开与机器人的**私聊**。

### 2. 发送配对请求

在飞书私聊中发送：

```
/pair
```

机器人会回复一个 **6 位配对码**，例如：
```
🔗 配对码：ABC123

请在 Claude Code 终端中调用 approve_pair 工具，输入此验证码（5 分钟内有效）
```

### 3. 在 Claude Code 终端确认

在 Claude Code 终端告诉 Claude：

```
调用 approve_pair 工具，code 是 ABC123
```

Claude 会调用工具完成配对，飞书收到确认消息：
```
✅ 配对成功！你现在可以直接发消息给 Claude 了。
```

---

## 第六步：启动消息轮询

Claude Code 内置了 `/loop` 技能，可以每分钟自动检查飞书消息：

```
/loop 1m 检查飞书是否有新消息：调用 get_messages 工具，如果有消息就逐条用 reply 工具回复用户，回复内容要有实质意义地回应用户的消息内容
```

启动后：
- 每分钟自动调用 `get_messages` 检查是否有新消息
- 有消息时 Claude 会处理并通过 `reply` 工具回复到飞书
- 7 天后自动过期（可用 `CronDelete <job-id>` 提前取消）

---

## 可用 MCP 工具

Claude Code 启动后，以下工具自动可用：

| 工具 | 说明 |
|------|------|
| `get_messages` | 读取并清空飞书消息队列，返回 `[{openId, text, time}]` |
| `reply` | 发送消息给飞书用户（参数：`open_id`, `text`） |
| `approve_pair` | 批准配对请求（参数：`code`） |
| `unpair` | 取消某用户的配对（参数：`open_id`） |

---

## 飞书命令

已配对的用户在飞书可发送以下命令：

| 命令 | 说明 |
|------|------|
| `/pair` | 发起配对请求 |
| `/unpair` | 取消配对 |
| 其他任意文字 | 加入消息队列，等待 Claude 处理 |

---

## 工作原理

```
飞书用户发消息
     ↓
飞书 WebSocket 事件推送到本地 MCP Server
     ↓
MCP Server 将消息写入队列文件
（~/.claude/channels/feishu/queue.json）
     ↓
Claude Code 每分钟调用 get_messages 读取队列
     ↓
Claude 处理消息，调用 reply 工具
     ↓
飞书用户收到回复
```

---

## 数据存储

所有数据存储在本地，不上传任何内容：

| 文件 | 说明 |
|------|------|
| `~/.claude/channels/feishu/state.json` | 已配对用户的 open_id 列表 |
| `~/.claude/channels/feishu/queue.json` | 待处理的飞书消息队列 |

---

## 常见问题

**Q: 发 `/pair` 后机器人没有回复**

- 检查飞书应用是否已发布
- 检查事件订阅是否选择了"长连接"模式并添加了 `im.message.receive_v1` 事件
- 检查权限是否已申请并通过
- 检查 Claude Code MCP 配置是否正确，重启 Claude Code

**Q: 提示 "请先发送 /pair 进行配对"**

配对码有效期 5 分钟，过期需重新发 `/pair`。

**Q: 消息延迟**

默认每 1 分钟轮询一次，消息最多延迟 1 分钟。可以调整 `/loop` 的时间间隔（cron 最小粒度为 1 分钟）。

**Q: 和 Claude Code 官方 Channels 功能有什么区别**

官方 Channels 功能需要 claude.ai 账号登录，且不兼容 `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` 设置。本项目使用队列轮询方案，兼容所有认证方式，但消息实时性略低（最多 1 分钟延迟）。

**Q: 服务部署在哪里？需要服务器吗？**

本项目**完全运行在本地**，不需要任何云服务器或公网地址。

服务运行细节：
- MCP Server 作为 Claude Code 的子进程启动，随 Claude Code 启动而启动、退出而退出
- 飞书消息通过**长连接（WebSocket）**从飞书服务器推送到本机，无需公网地址
- 所有数据（配对信息、消息队列）存储在本地 `~/.claude/channels/feishu/` 目录
- **Claude Code 必须保持运行**，关闭后将无法收发飞书消息

如果希望后台持续运行，可以在 `tmux` 或 `screen` 中启动 Claude Code，并开启 `/loop` 轮询。

---

## License

MIT
