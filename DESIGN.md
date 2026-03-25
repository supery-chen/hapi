# Codex App Server → WebSocket 适配层设计

## 1. 背景

目标是实现一个类似 HAPI 的适配层：

- 后端通过 `codex app-server` 协议与 Codex CLI 交互
- 后端将 Codex 的 JSONL / JSON-RPC 事件流转换为前端可消费的 WebSocket 事件
- 前端无需直接理解 `codex app-server` 协议细节
- 在此基础上补齐 `/status` 这类 Codex CLI/TUI 中可见、但 app-server 未直接暴露结构化结果的能力

当前结论：

1. **方案可行性高**
2. **推荐使用 stdio 包装 `codex app-server`，不直接依赖 app-server 自带 websocket**
3. **`/status` 不应依赖 app-server 返回“专用结构化响应”，应由适配层自行实现**

---

## 2. 已验证事实

### 2.1 HAPI 的 Codex 远程模式

HAPI 的 Codex remote mode 已证明这条路径可行：

- 直接启动 `codex app-server`
- 使用 stdio + JSONL 通信
- 按 app-server 协议执行：
  - `initialize`
  - `initialized`
  - `thread/start`
  - `thread/resume`
  - `turn/start`
  - `turn/interrupt`
- 处理 server-initiated requests：
  - `item/commandExecution/requestApproval`
  - `item/fileChange/requestApproval`
  - `item/tool/requestUserInput`
- 将 app-server 通知转换为前端友好的内部事件

### 2.2 app-server 的 websocket 不适合作为生产方案

`codex-app-server.md` 明确说明：

- `--listen ws://IP:PORT` 是 **experimental / unsupported**

因此设计上采用：

> **Codex CLI(app-server, stdio) ←→ 适配层 ←→ WebSocket 前端**

### 2.3 `/status` 不是 app-server 的专用协议方法

已通过实测验证：

- 对 app-server 执行 `turn/start`，输入文本 `/status`
- app-server 将其作为普通 `userMessage` 处理
- 返回的是标准事件流：
  - `item/started(userMessage)`
  - `item/agentMessage/delta`
  - `item/completed(agentMessage)`
  - `turn/completed`

结论：

> **`/status` 在 app-server 层没有稳定的专用结构化返回。**

因此，如果需要得到类似 Codex CLI 里 `/status` 的结构化面板数据，必须由适配层拦截并自行组装。

### 2.4 `codex-status` 项目的实现方式

对 `ClockworkNet/codex-status` 的分析表明：

- 它**不调用 app-server**
- 它**不真正执行 TUI 的 `/status` 命令**
- 它递归扫描本地：
  - `~/.codex/sessions/**/rollout-*.jsonl`
- 它读取并解析这些 rollout 日志中的：
  - `session_meta`
  - `turn_context`
  - `event_msg(type=token_count)`
- 再自行拼装一个紧凑的终端状态摘要

这说明：

> **从 rollout 日志补充/恢复状态是可行且实用的。**

---

## 3. 总体架构

```text
Frontend (Web / Mobile)
        │
        │ WebSocket
        ▼
Codex Gateway / Adapter Server
        │
        ├─ Session Manager
        ├─ AppServer Client (stdio)
        ├─ Slash Command Router
        ├─ Approval Broker
        ├─ Status Aggregator
        └─ Rollout Log Fallback Reader
        │
        ▼
codex app-server (stdio)
        │
        ▼
Codex CLI runtime
```

### 关键职责划分

#### Frontend

- 展示聊天消息、工具调用、diff、审批弹窗、状态面板
- 发送普通消息、slash command、审批响应、中断请求

#### Adapter Server

- 启动和管理 `codex app-server`
- 维护 thread / turn 生命周期
- 将 app-server 通知转换为 WebSocket 事件
- 处理来自 app-server 的审批/用户输入请求
- 拦截并实现本地 slash commands（尤其 `/status`）
- 在需要时从 rollout 日志恢复或补齐状态

#### Codex app-server

- 提供协议层会话、turn、item、approval、token usage 等能力

---

## 4. 通信方案

### 4.1 与 Codex 的通信

采用：

- 进程：`codex app-server`
- 传输：`stdio://`
- 编码：每行一条 JSON（JSONL）
- 协议形态：类似 JSON-RPC 2.0，但线上消息不带 `jsonrpc: "2.0"`

### 4.2 与前端的通信

采用：

- WebSocket
- 自定义前端事件协议
- 不直接暴露 app-server 原始协议

原因：

1. 降低前端复杂度
2. 降低协议版本耦合
3. 更容易实现 slash command、本地状态聚合、审批流程
4. 更容易做多端订阅与断线重连

---

## 5. 会话生命周期设计

### 5.1 初始化

后端与 app-server 建立连接后，执行：

1. `initialize`
2. `initialized`

建议初始化参数：

- `clientInfo.name`: 自定义网关名
- `capabilities.experimentalApi: true`

### 5.2 会话创建/恢复

最小集合：

- `thread/start`
- `thread/resume`
- `turn/start`
- `turn/interrupt`

后端需缓存：

- `threadId`
- `currentTurnId`
- 当前 `cwd`
- model
- approvalPolicy
- sandbox
- collaborationMode
- thread/turn 状态
- 最近一次 token usage

### 5.3 关键订阅事件

至少处理：

- `thread/started`
- `thread/status/changed`
- `turn/started`
- `turn/completed`
- `item/started`
- `item/completed`
- `item/agentMessage/delta`
- `item/reasoning/*`
- `item/commandExecution/outputDelta`
- `turn/diff/updated`
- `thread/tokenUsage/updated`
- `error`
- `account/rateLimits/updated`

---

## 6. WebSocket 事件模型

建议适配层输出稳定的前端事件，而不是直接透传 app-server。

### 6.1 设计目标

WebSocket 层的目标不是复刻 app-server 协议，而是提供：

1. **更稳定的前端协议**
2. **更少的协议细节泄漏**
3. **更方便的 UI 渲染模型**
4. **可承载本地命令与聚合状态**

因此 WebSocket schema 采用：

- dot-separated 事件名
- 固定 envelope
- `data` 承载业务负载
- `requestId` 用于请求/响应关联
- `sessionId` 作为前端会话主键

### 6.2 统一消息 envelope

无论前后端方向，统一结构如下：

```json
{
  "v": 1,
  "type": "turn.started",
  "requestId": "req_123",
  "sessionId": "sess_123",
  "ts": "2026-03-23T07:00:00.000Z",
  "data": {}
}
```

字段说明：

- `v`: WebSocket 协议版本，初始固定为 `1`
- `type`: 事件类型，使用 `domain.action` 风格
- `requestId`: 可选；用于将某次前端请求与后端响应/错误关联
- `sessionId`: 可选但强烈建议始终带上；用于多会话场景
- `ts`: 服务端生成的 ISO 时间戳
- `data`: 业务负载

错误 envelope：

```json
{
  "v": 1,
  "type": "error",
  "requestId": "req_123",
  "sessionId": "sess_123",
  "ts": "2026-03-23T07:00:00.000Z",
  "error": {
    "code": "invalid_request",
    "message": "threadId is required"
  }
}
```

### 6.3 标识与命名约定

建议区分以下标识：

- `sessionId`: 适配层对外暴露的会话 id
- `threadId`: app-server / Codex thread id
- `turnId`: app-server turn id
- `itemId`: app-server item id
- `approvalRequestId`: 适配层生成的审批请求 id

说明：

- 前端主键用 `sessionId`
- app-server 原始标识透出给前端，但作为附加字段而非顶层主键

### 6.4 前端 → 后端 schema

#### 6.4.1 `session.start`

用途：创建一个新 session，并在内部启动/绑定 app-server thread。

```json
{
  "v": 1,
  "type": "session.start",
  "requestId": "req_start_1",
  "data": {
    "cwd": "/repo",
    "mode": {
      "model": "gpt-5.4",
      "approvalPolicy": "on-request",
      "sandbox": "workspace-write",
      "collaborationMode": "default"
    }
  }
}
```

#### 6.4.2 `session.resume`

用途：恢复既有 thread / 既有 session。

```json
{
  "v": 1,
  "type": "session.resume",
  "requestId": "req_resume_1",
  "data": {
    "threadId": "thr_123"
  }
}
```

#### 6.4.3 `session.subscribe`

用途：前端重新连接后订阅已有 session 的实时流。

```json
{
  "v": 1,
  "type": "session.subscribe",
  "requestId": "req_sub_1",
  "data": {
    "sessionId": "sess_123"
  }
}
```

#### 6.4.4 `turn.send`

用途：发送用户输入。  
适配层内部会判断是否为 slash command / 普通消息 / shell command。

```json
{
  "v": 1,
  "type": "turn.send",
  "requestId": "req_turn_1",
  "sessionId": "sess_123",
  "data": {
    "text": "/status",
    "clientMessageId": "msg_local_1",
    "attachments": []
  }
}
```

说明：

- slash command 不要求前端单独识别
- 由后端路由：
  - `/status` → 本地实现
  - `!git status` → `thread/shellCommand`
  - 其他普通文本 → `turn/start`

#### 6.4.5 `turn.interrupt`

用途：中断当前运行中的 turn。

```json
{
  "v": 1,
  "type": "turn.interrupt",
  "requestId": "req_interrupt_1",
  "sessionId": "sess_123",
  "data": {}
}
```

#### 6.4.6 `approval.respond`

用途：响应命令审批 / 文件变更审批 / requestUserInput。

```json
{
  "v": 1,
  "type": "approval.respond",
  "requestId": "req_approval_1",
  "sessionId": "sess_123",
  "data": {
    "approvalRequestId": "apr_123",
    "decision": "accept",
    "answers": null
  }
}
```

其中：

- `decision` 可取：
  - `accept`
  - `acceptForSession`
  - `decline`
  - `cancel`

#### 6.4.7 `status.get`

用途：主动请求 `/status` 快照。

```json
{
  "v": 1,
  "type": "status.get",
  "requestId": "req_status_1",
  "sessionId": "sess_123",
  "data": {}
}
```

#### 6.4.8 `ping`

用途：连接保活与 RTT 测试。

```json
{
  "v": 1,
  "type": "ping",
  "requestId": "req_ping_1",
  "data": {
    "nonce": "abc123"
  }
}
```

### 6.5 后端 → 前端 schema

#### 6.5.1 `session.ready`

用途：session 启动完成，可接收输入。

```json
{
  "v": 1,
  "type": "session.ready",
  "requestId": "req_start_1",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "cwd": "/repo",
    "mode": {
      "model": "gpt-5.4",
      "approvalPolicy": "on-request",
      "sandbox": "workspace-write",
      "collaborationMode": "default"
    }
  }
}
```

#### 6.5.2 `thread.started`

用途：thread 已新建或已恢复。

```json
{
  "v": 1,
  "type": "thread.started",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "resumed": false
  }
}
```

#### 6.5.3 `thread.status`

用途：通知 thread 状态变化。

```json
{
  "v": 1,
  "type": "thread.status",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "status": {
      "type": "active",
      "activeFlags": []
    }
  }
}
```

#### 6.5.4 `turn.started`

用途：某次 turn 已开始。

```json
{
  "v": 1,
  "type": "turn.started",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123"
  }
}
```

#### 6.5.5 `message.user`

用途：前端回显或服务端确认用户消息。

```json
{
  "v": 1,
  "type": "message.user",
  "sessionId": "sess_123",
  "data": {
    "clientMessageId": "msg_local_1",
    "text": "/status"
  }
}
```

#### 6.5.6 `assistant.delta`

用途：流式输出 assistant 文本。

```json
{
  "v": 1,
  "type": "assistant.delta",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123",
    "itemId": "msg_123",
    "delta": "Hello"
  }
}
```

#### 6.5.7 `assistant.completed`

用途：assistant 某个 message item 已完成。

```json
{
  "v": 1,
  "type": "assistant.completed",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123",
    "itemId": "msg_123",
    "text": "Hello world"
  }
}
```

#### 6.5.8 `reasoning.delta`

用途：流式输出 reasoning 文本。

```json
{
  "v": 1,
  "type": "reasoning.delta",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123",
    "itemId": "rs_123",
    "delta": "Analyzing..."
  }
}
```

#### 6.5.9 `reasoning.completed`

用途：reasoning item 已结束。

```json
{
  "v": 1,
  "type": "reasoning.completed",
  "sessionId": "sess_123",
  "data": {
    "itemId": "rs_123",
    "text": "..."
  }
}
```

#### 6.5.10 `tool.started`

用途：命令、文件变更、MCP 调用等开始执行。

```json
{
  "v": 1,
  "type": "tool.started",
  "sessionId": "sess_123",
  "data": {
    "kind": "commandExecution",
    "itemId": "cmd_123",
    "name": "bash",
    "input": {
      "command": "git status"
    }
  }
}
```

#### 6.5.11 `tool.output`

用途：工具执行过程中的增量输出。

```json
{
  "v": 1,
  "type": "tool.output",
  "sessionId": "sess_123",
  "data": {
    "itemId": "cmd_123",
    "delta": "On branch main"
  }
}
```

#### 6.5.12 `tool.completed`

用途：工具执行结束。

```json
{
  "v": 1,
  "type": "tool.completed",
  "sessionId": "sess_123",
  "data": {
    "itemId": "cmd_123",
    "status": "completed",
    "result": {
      "exitCode": 0
    }
  }
}
```

#### 6.5.13 `diff.updated`

用途：前端展示 turn 级 unified diff。

```json
{
  "v": 1,
  "type": "diff.updated",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123",
    "diff": "diff --git ..."
  }
}
```

#### 6.5.14 `approval.request`

用途：通知前端某个审批请求正在等待用户操作。

```json
{
  "v": 1,
  "type": "approval.request",
  "sessionId": "sess_123",
  "data": {
    "approvalRequestId": "apr_123",
    "kind": "commandExecution",
    "itemId": "cmd_123",
    "reason": "Command requires approval",
    "payload": {
      "command": "git status",
      "cwd": "/repo"
    },
    "availableDecisions": [
      "accept",
      "acceptForSession",
      "decline",
      "cancel"
    ]
  }
}
```

#### 6.5.15 `approval.resolved`

用途：审批请求生命周期结束。

```json
{
  "v": 1,
  "type": "approval.resolved",
  "sessionId": "sess_123",
  "data": {
    "approvalRequestId": "apr_123"
  }
}
```

#### 6.5.16 `status.snapshot`

用途：返回 `/status` 的完整结构化快照。

```json
{
  "v": 1,
  "type": "status.snapshot",
  "requestId": "req_status_1",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "model": {
      "name": "gpt-5.4",
      "reasoningEffort": "xhigh"
    },
    "tokenUsage": {
      "total": 20700,
      "input": 19800,
      "output": 938
    },
    "contextWindow": {
      "max": 950000,
      "used": 13000,
      "remaining": 937000,
      "percentLeft": 98.63
    }
  }
}
```

#### 6.5.17 `status.updated`

用途：状态缓存变化后的被动推送。

```json
{
  "v": 1,
  "type": "status.updated",
  "sessionId": "sess_123",
  "data": {
    "tokenUsage": {
      "total": 21000,
      "input": 20000,
      "output": 1000
    },
    "contextWindow": {
      "max": 950000,
      "used": 14000,
      "remaining": 936000,
      "percentLeft": 98.53
    }
  }
}
```

#### 6.5.18 `turn.completed`

用途：turn 正常结束。

```json
{
  "v": 1,
  "type": "turn.completed",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123",
    "status": "completed"
  }
}
```

#### 6.5.19 `turn.failed`

用途：turn 异常结束。

```json
{
  "v": 1,
  "type": "turn.failed",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123",
    "status": "failed",
    "error": {
      "message": "stream disconnected"
    }
  }
}
```

#### 6.5.20 `turn.interrupted`

用途：turn 被用户或系统中断。

```json
{
  "v": 1,
  "type": "turn.interrupted",
  "sessionId": "sess_123",
  "data": {
    "threadId": "thr_123",
    "turnId": "turn_123"
  }
}
```

#### 6.5.21 `pong`

用途：响应 `ping`。

```json
{
  "v": 1,
  "type": "pong",
  "requestId": "req_ping_1",
  "data": {
    "nonce": "abc123"
  }
}
```

### 6.6 与 app-server 的映射原则

WebSocket schema 与 app-server 的映射大致如下：

- `thread/started` → `thread.started`
- `thread/status/changed` → `thread.status`
- `turn/started` → `turn.started`
- `turn/completed(status=completed)` → `turn.completed`
- `turn/completed(status=failed)` → `turn.failed`
- `turn/completed(status=interrupted)` → `turn.interrupted`
- `item/agentMessage/delta` → `assistant.delta`
- `item/completed(agentMessage)` → `assistant.completed`
- `item/reasoning/*` → `reasoning.delta` / `reasoning.completed`
- `item/commandExecution/outputDelta` → `tool.output`
- `item/started(mcpToolCall|commandExecution|fileChange)` → `tool.started`
- `item/completed(...)` → `tool.completed`
- `turn/diff/updated` → `diff.updated`
- `thread/tokenUsage/updated` → `status.updated`
- `item/*/requestApproval` → `approval.request`

### 6.7 兼容性原则

1. 前端只依赖 WebSocket schema，不直接依赖 app-server 原始字段
2. 适配层允许对 app-server 字段重命名、归一化与补字段
3. WebSocket schema 发生破坏性变化时，递增 `v`
4. `status.snapshot` 应尽量可独立渲染，不依赖前序增量事件
5. `status.updated` 允许只发送增量字段

---

## 7. Slash Command 设计

slash command 不应全部透传给 Codex。

建议分 3 类：

### 7.1 本地命令（适配层自己实现）

不进入 `turn/start`，直接由后端处理：

- `/status`
- `/help`（可选）
- `/new`（也可本地触发新 thread）

### 7.2 协议映射命令

直接映射到 app-server 原生方法：

- `/review` → `review/start`
- `/undo` → `thread/rollback`
- `/compact` 或 `/compat` → `thread/compact/start`
- `!<cmd>` → `thread/shellCommand`

### 7.3 Prompt 展开命令

例如用户/项目自定义 prompt：

- `~/.codex/prompts`
- `<project>/.codex/prompts`

这类命令先展开为文本，再走 `turn/start`。

### 7.4 关键原则

> **`/status` 必须本地实现。**

因为它在 app-server 层没有稳定结构化响应。

---

## 8. `/status` 设计

## 8.1 目标

输出尽量接近 Codex CLI/TUI 中 `/status` 的信息结构，例如：

- Model
- Model provider
- Directory
- Permissions
- Agents.md
- Account
- Collaboration mode
- Session
- Token usage
- Context window
- Limits

## 8.2 `/status` 的数据源优先级

### 一级：app-server 实时状态

优先从运行中的 app-server 状态缓存获得：

- `thread/start` / `thread/resume` 返回值
- `thread/status/changed`
- `turn/started` / `turn/completed`
- `thread/tokenUsage/updated`
- `account/read`
- `account/rateLimits/read`
- `config/read`

### 二级：rollout log 回退 / 补全

从本地 rollout 日志补充：

- `session_meta`
- `turn_context`
- `event_msg(type=token_count)`

这部分可以借鉴 `codex-status` 的实现。

## 8.3 `/status` 聚合对象（建议）

```json
{
  "threadId": "thr_xxx",
  "sessionId": "019d...",
  "cliVersion": "0.116.0",
  "model": {
    "name": "gpt-5.4",
    "reasoningEffort": "xhigh",
    "summary": "auto"
  },
  "modelProvider": {
    "name": "cpa",
    "endpoint": "http://127.0.0.1:8317/v1",
    "source": "config|session_meta|unknown"
  },
  "directory": "/data/workspace/jnqy",
  "permissions": {
    "sandbox": "workspace-write",
    "approvalPolicy": "on-request",
    "label": "Custom (workspace-write, on-request)"
  },
  "agentsMd": {
    "exists": false,
    "path": null
  },
  "account": {
    "mode": "apiKey|chatgpt|null",
    "label": "API key configured"
  },
  "collaborationMode": {
    "mode": "default"
  },
  "tokenUsage": {
    "total": 20700,
    "input": 19800,
    "output": 938,
    "reasoning": 0,
    "cachedInput": 0,
    "last": {
      "total": 1200,
      "input": 1000,
      "output": 200
    }
  },
  "contextWindow": {
    "max": 950000,
    "used": 13000,
    "remaining": 937000,
    "percentLeft": 98.63,
    "formula": "derived_from_last_input_tokens"
  },
  "limits": {
    "primary": null,
    "secondary": null,
    "label": "data not available yet"
  },
  "updatedAt": "2026-03-23T07:00:00.000Z"
}
```

---

## 9. `/status` 关键字段的实现策略

### 9.1 Model

来源：

- `thread/start` / `thread/resume` 响应中的 `model`
- `turn_context.model`（log fallback）

### 9.2 Model provider

来源优先级建议：

1. `config/read` 中 provider 配置
2. rollout `session_meta.model_provider`
3. `thread/start` 响应中的 `modelProvider`

说明：

- app-server 响应通常可拿到 provider 名称
- TUI 中显示的 provider endpoint 不一定直接从 app-server 响应获得
- 如需显示 endpoint，优先从 `config/read` 或本地配置解析

### 9.3 Directory

来源：

- 当前 session 的 `cwd`
- `turn_context.cwd`

### 9.4 Permissions

来源：

- `thread/start` / `thread/resume` 的参数或响应
- 当前 session 缓存
- `turn_context.approval_policy`
- `turn_context.sandbox_policy`

### 9.5 Agents.md

来源：

- 检查 `cwd/AGENTS.md`
- 若不存在则显示 `<none>`

### 9.6 Account

来源优先级：

1. `account/read`
2. 必要时 CLI fallback：`codex login status`

输出示例：

- `API key configured`
- `Logged in as ChatGPT Plus`
- `Not logged in`

### 9.7 Session

来源：

- app-server `thread.id`
- rollout `session_meta.id`

说明：

- 二者在某些模式下可能不同，设计上都保留
- 前端可以主展示 thread id，也可额外显示 rollout session id

### 9.8 Token usage

最关键字段之一。

来源：

- `thread/tokenUsage/updated`
- 或 rollout `event_msg(type=token_count)`

字段映射：

- `tokenUsage.total.totalTokens`
- `tokenUsage.total.inputTokens`
- `tokenUsage.total.outputTokens`
- `tokenUsage.total.reasoningOutputTokens`
- `tokenUsage.total.cachedInputTokens`
- `tokenUsage.last.*`

### 9.9 Context window

第二个关键字段。

来源：

- `thread/tokenUsage/updated.tokenUsage.modelContextWindow`
- 或 rollout `token_count.info.model_context_window`

#### Phase 1 计算策略

先使用近似公式：

- `max = modelContextWindow`
- `used = last.inputTokens`（优先）
- `remaining = max - used`
- `percentLeft = remaining / max`

原因：

- 当前未从 app-server 中发现一个专门的“官方 context used”字段
- TUI `/status` 的“13K used / 950K”很可能是客户端内部聚合结果
- `last.inputTokens` 是当前最接近“上下文占用”的可用指标

#### Phase 2 提升策略

后续如果需要完全对齐 TUI：

1. 继续对比真实 TUI `/status` 与 app-server/log 数据
2. 如果能定位 Codex TUI 内部计算逻辑，则替换为官方等价算法
3. 在未完成前，明确标注为：
   - `formula: "derived_from_last_input_tokens"`

### 9.10 Limits

来源：

- `account/rateLimits/read`
- `account/rateLimits/updated`
- rollout `token_count.rate_limits`

说明：

- 当前很多情况下 `primary/secondary/credits` 为空
- 前端应允许展示：`data not available yet`

---

## 10. rollout log fallback 设计

借鉴 `codex-status` 的方式：

### 10.1 需要解析的事件

- `session_meta`
- `turn_context`
- `event_msg(type=token_count)`
- 必要时：`task_started` / `task_complete`

### 10.2 主要用途

- 断线重连后的状态恢复
- app-server 进程重启后的状态补偿
- `/status` 字段补全
- 与 TUI 展示做对齐校验

### 10.3 非目标

不使用 rollout log 作为主要实时事件源；实时消息仍优先依赖 app-server。

---

## 11. 审批流设计

app-server 不是单向事件流，后端必须处理 server-initiated requests。

必须支持：

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`

适配层职责：

1. 接收 app-server 请求
2. 转成 WebSocket `approval.request`
3. 等待前端选择
4. 回写 app-server 响应

这是 MVP 必需项。

---

## 12. MVP 范围

### 必做

1. 启动 `codex app-server`
2. 初始化握手
3. `thread/start` / `resume`
4. `turn/start` / `interrupt`
5. 流式 assistant / reasoning / tool / diff 事件转发
6. 审批处理
7. `/status` 本地实现
8. `thread/tokenUsage/updated` 状态缓存
9. rollout log fallback 读取 `session_meta` / `turn_context` / `token_count`

### 可后置

1. `/review` 等更多 slash command 封装
2. 多前端共享同一 session
3. 历史回放 UI
4. 更精确的 context window 公式
5. 与官方 TUI 展示逐字段像素级对齐

---

## 13. 风险与注意事项

### 13.1 协议变动风险

- app-server 仍存在实验性字段/接口
- 适配层不应把原始协议直接暴露给前端

### 13.2 `/status` 并非原生结构化命令

- 不能依赖向 app-server 发送 `/status` 来获得固定 JSON
- 必须自行组装数据

### 13.3 context window 计算不是完全官方公开字段

- 第一版用近似策略
- 文档与 API 中未看到明确的“当前已用上下文”字段

### 13.4 rollout log 结构版本漂移

- fallback parser 需做字段兼容处理
- 缺字段时允许降级

---

## 14. 当前设计决策

### 决策 1

**使用 stdio 驱动 `codex app-server`。**

### 决策 2

**由后端适配层向前端暴露自定义 WebSocket 事件协议。**

### 决策 3

**slash command 由适配层路由；`/status` 本地实现。**

### 决策 4

**实时状态优先用 app-server，恢复/补全优先用 rollout log。**

### 决策 5

**`token usage` 与 `context window` 为 `/status` 第一优先级字段。**

---

## 15. 下一步建议

下一步进入实现前，建议先完成以下设计产物：

1. WebSocket 消息协议定义
2. `/status` JSON schema
3. app-server 状态缓存模型
4. rollout log parser 的输入/输出模型
5. slash command router 的命令表
