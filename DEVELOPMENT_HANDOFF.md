# Development Handoff

This document is for the next Codex session to quickly reconstruct the current state of the repo and continue feature work without re-discovering recent architectural changes.

## 1. Current Product Scope

HAPI has been intentionally reduced to a much narrower scope than the historical codebase.

Current state:

- **Codex-only**
- **remote-only**
- **no voice support**

That means:

- no Claude / Cursor / Gemini / OpenCode runtime integrations remain
- no local Codex handoff mode remains
- no voice / ElevenLabs codepath remains

Recent commits that established this state:

- `cad89dc` `chore: make hapi codex-only`
- `d66b9c0` `chore: remove voice support`
- `72a3938` `chore: remove codex local mode`
- `235b55d` `docs: align docs with remote-only codex`
- `92abb18` `docs: add codex app-server review`
- `5bfdcfa` `feat: improve codex status command`

## 2. High-Level Architecture

Main packages:

- `cli/` - runs Codex and talks to hub
- `hub/` - HTTP API + Socket.IO + SSE + SQLite persistence
- `web/` - React PWA
- `shared/` - protocol types/schemas/helpers

Core runtime chain:

1. CLI boots Codex session
2. CLI connects to hub over Socket.IO
3. Hub persists state and broadcasts updates to web via SSE
4. Web sends user input / mutations to hub
5. Hub forwards actions back to CLI via RPC or session message flow

## 3. Codex Remote Execution Path

The only supported execution path is remote Codex via `codex app-server`.

Primary files:

- `cli/src/codex/runCodex.ts`
- `cli/src/codex/loop.ts`
- `cli/src/codex/codexRemoteLauncher.ts`
- `cli/src/codex/codexAppServerClient.ts`
- `cli/src/codex/utils/appServerConfig.ts`
- `cli/src/codex/utils/appServerEventConverter.ts`
- `cli/src/codex/utils/appServerPermissionAdapter.ts`

Execution flow:

1. `runCodex()` bootstraps HAPI session metadata and queue state.
2. `loop()` creates `CodexSession` and always calls `codexRemoteLauncher()`.
3. `codexRemoteLauncher()`:
   - starts `codex app-server`
   - sends `initialize` then `initialized`
   - resumes or starts a thread
   - starts turns from queued user messages
   - consumes app-server notifications
   - adapts approvals back into HAPI permission flow
4. `CodexSession` caches:
   - session/thread id
   - latest token usage
   - current turn id
   - permission mode / model / collaboration mode

There is no longer any local launcher, local switch, or local-mode UI.

## 4. Current App-Server Protocol Usage

HAPI uses the official `codex app-server` protocol over stdio.

Implemented main methods:

- `initialize`
- `thread/start`
- `thread/resume`
- `turn/start`
- `turn/interrupt`
- `config/read`
- `account/read`
- `account/rateLimits/read`

Implemented server-initiated requests:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`

Main consumed notifications:

- `thread/started`
- `thread/resumed`
- `turn/started`
- `turn/completed`
- `thread/tokenUsage/updated`
- `turn/diff/updated`
- `item/agentMessage/delta`
- `item/reasoning/*`
- `item/commandExecution/outputDelta`
- `item/started`
- `item/completed`

Important note:

- protocol types are still **hand-written** in `cli/src/codex/appServerTypes.ts`
- they are **not** generated from `codex app-server generate-ts`
- this is the main known protocol-drift risk

For a more detailed protocol assessment, see:

- `docs/guide/codex-app-server-review.md`

## 5. `/status` Implementation

The current `/status` command was improved to follow the design direction in `DESIGN.md`.

Important files:

- `cli/src/codex/runCodex.ts`
- `cli/src/codex/utils/statusSnapshot.ts`
- `cli/src/codex/utils/statusSummary.ts`
- `cli/src/codex/session.ts`
- `cli/src/codex/codexRemoteLauncher.ts`

Current behavior:

- `/status` is **intercepted locally inside HAPI**
- it is **not** forwarded as a normal Codex prompt
- it builds a snapshot and emits a markdown agent message back into the session

Snapshot data sources:

### First priority: live app-server state

- `config/read`
- `account/read`
- `account/rateLimits/read`
- live thread id
- live model
- live token usage from `thread/tokenUsage/updated`

### Second priority: rollout log fallback

From `.codex/sessions/**/rollout-*.jsonl`:

- `session_meta`
- `turn_context`
- `event_msg(type=token_count)`

Current `/status` output includes:

- thread id
- rollout session id when available
- CLI version
- model
- reasoning effort
- model provider (best-effort)
- directory
- permissions / sandbox / approval policy
- AGENTS.md presence
- account summary
- collaboration mode
- token usage
- context window
- limits
- updated timestamp

Important limitation:

- the implementation currently returns **markdown text**
- it does **not** yet implement the structured `status.snapshot` / `status.updated` websocket event model proposed in `DESIGN.md`

## 6. Web / Hub State Model

Key files:

- `hub/src/sync/syncEngine.ts`
- `hub/src/sync/sessionCache.ts`
- `hub/src/web/routes/sessions.ts`
- `hub/src/web/routes/messages.ts`
- `web/src/App.tsx`
- `web/src/components/SessionChat.tsx`
- `web/src/components/AssistantChat/HappyComposer.tsx`
- `web/src/hooks/useSSE.ts`

Current important facts:

- web uses REST + SSE, not direct app-server protocol
- terminal uses a separate Socket.IO path
- session config mutations supported from web:
  - permission mode
  - collaboration mode
  - model
- legacy `/sessions/:id/switch` route is removed

## 7. Shared Protocol State

Key shared protocol files:

- `shared/src/schemas.ts`
- `shared/src/socket.ts`
- `shared/src/slashCommands.ts`
- `shared/src/modes.ts`

Important current shape:

- `AgentState` no longer includes `controlledByUser`
- `session-alive` payload no longer carries `mode`
- slash command execution sources are only:
  - `webapp`
  - `telegram`
- slash command availability no longer includes `local-only`

## 8. Validation Commands

Useful commands from repo root:

```bash
bun typecheck
bun run test
```

These were passing at the end of this session.

## 9. Important Local Reference Docs

These exist in the workspace and were used as design references, but may not be committed:

- `DESIGN.md`
- `codex-app-server.md`

Use them when continuing work on:

- app-server integration
- websocket adapter design
- `/status` evolution
- protocol coverage gaps

## 10. Known Remaining Gaps

These are the main follow-up areas worth addressing next:

### A. Replace hand-written app-server types

Current:

- `cli/src/codex/appServerTypes.ts` is hand-maintained

Recommended:

- generate schema/types from the exact installed Codex version
- adapt the client to consume generated types

### B. Expand approval protocol coverage

Current implementation handles the common approval decisions only.

Not fully covered:

- `unlessTrusted`
- granular approval variants
- `acceptWithExecpolicyAmendment`
- `applyNetworkPolicyAmendment`

### C. Upgrade `/status` from markdown to structured transport

Current:

- `/status` returns a markdown agent message

Future direction from `DESIGN.md`:

- add `status.get`
- add `status.snapshot`
- add `status.updated`
- let the web client render the status panel structurally

### D. Improve provider/config parsing

`config/read` is currently parsed conservatively because the project does not yet use generated protocol types for that response shape.

This means model provider / endpoint detection is best-effort.

### E. Revisit docs if product scope changes again

The docs were updated to match:

- Codex-only
- remote-only
- no voice

If local mode, multi-agent support, or protocol breadth return later, the docs and `AGENTS.md` will need another pass.

## 11. Recommended Starting Points for Next Session

If continuing protocol work:

- `cli/src/codex/codexAppServerClient.ts`
- `cli/src/codex/appServerTypes.ts`
- `cli/src/codex/utils/appServerConfig.ts`
- `cli/src/codex/utils/appServerEventConverter.ts`
- `docs/guide/codex-app-server-review.md`
- `DESIGN.md`
- `codex-app-server.md`

If continuing `/status` work:

- `cli/src/codex/utils/statusSnapshot.ts`
- `cli/src/codex/runCodex.ts`
- `cli/src/codex/session.ts`
- `cli/src/codex/utils/statusSnapshot.test.ts`

If continuing web integration:

- `hub/src/web/routes/sessions.ts`
- `web/src/components/SessionChat.tsx`
- `web/src/components/AssistantChat/HappyComposer.tsx`
- `web/src/hooks/useSSE.ts`
