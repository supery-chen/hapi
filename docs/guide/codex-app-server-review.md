# Codex App-Server Protocol Review

This document reviews how HAPI's current remote Codex integration maps to the official `codex app-server` protocol described in [`codex-app-server.md`](/codex-app-server.md).

## Summary

Current HAPI remote Codex integration follows the **core app-server workflow correctly**, but it does **not** implement the full protocol surface.

In practical terms:

- HAPI can successfully drive Codex through `codex app-server`
- HAPI uses the correct transport and main lifecycle methods
- HAPI consumes the main notification stream and approval callbacks
- HAPI still relies on a **hand-written protocol subset**
- HAPI does **not** fully cover newer or more advanced approval variants from the official protocol

Conclusion:

- **Core compatibility:** yes
- **Strict protocol completeness:** no
- **Operational risk:** moderate

## What HAPI Implements Correctly

### 1. Transport and message framing

The official protocol says `codex app-server` uses JSON-RPC-like messages over stdio, encoded as JSONL.

HAPI matches this:

- it spawns `codex app-server`
- it writes one JSON payload per line to stdin
- it reads stdout line-by-line and parses JSON records

Relevant implementation:

- `cli/src/codex/codexAppServerClient.ts`

### 2. Initialization handshake

The protocol requires:

1. `initialize`
2. `initialized`

HAPI does exactly that before using the connection:

- sends `initialize`
- then emits `initialized`

Relevant implementation:

- `cli/src/codex/codexAppServerClient.ts`
- `cli/src/codex/codexRemoteLauncher.ts`

### 3. Thread and turn lifecycle

The official lifecycle is:

1. `thread/start` or `thread/resume`
2. `turn/start`
3. stream notifications
4. optional `turn/interrupt`

HAPI follows this sequence:

- resumes an existing thread when it has a saved thread id
- otherwise starts a new thread
- starts turns with user input
- interrupts active turns during abort

Relevant implementation:

- `cli/src/codex/codexRemoteLauncher.ts`
- `cli/src/codex/codexAppServerClient.ts`

### 4. Main event stream consumption

The protocol documents notifications such as:

- `thread/started`
- `turn/started`
- `turn/completed`
- `item/started`
- `item/completed`
- `item/agentMessage/delta`
- `item/commandExecution/outputDelta`
- `turn/diff/updated`
- `thread/tokenUsage/updated`

HAPI consumes and translates these into its own session/chat model.

Relevant implementation:

- `cli/src/codex/utils/appServerEventConverter.ts`
- `cli/src/codex/codexRemoteLauncher.ts`

### 5. Approval request handling

The protocol uses server-initiated JSON-RPC requests for approval flows such as:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`

HAPI registers handlers for both and maps user decisions back to app-server-compatible responses.

Relevant implementation:

- `cli/src/codex/utils/appServerPermissionAdapter.ts`

## Where HAPI Deviates from the Official Protocol

### 1. Types are hand-written, not generated from the current Codex version

The official document explicitly recommends generating TypeScript or JSON Schema from the exact installed Codex version:

```bash
codex app-server generate-ts --out DIR
codex app-server generate-json-schema --out DIR
```

HAPI does not do this today. Instead it uses a manually maintained file:

- `cli/src/codex/appServerTypes.ts`

This is the biggest structural risk. The implementation may continue working for a while, but it can drift whenever Codex changes field names, enum values, or optional request/response shapes.

### 2. Approval policy coverage is incomplete

The protocol documentation includes approval cases beyond HAPI's current type model.

Examples from the official protocol:

- `approvalPolicy: "unlessTrusted"`
- granular approval variants
- command approval responses such as:
  - `acceptWithExecpolicyAmendment`
  - `applyNetworkPolicyAmendment`

HAPI currently models only:

- `untrusted`
- `on-failure`
- `on-request`
- `never`

And it only responds with:

- `accept`
- `acceptForSession`
- `decline`
- `cancel`

Relevant implementation:

- `cli/src/codex/appServerTypes.ts`
- `cli/src/codex/utils/appServerPermissionAdapter.ts`
- `cli/src/codex/utils/appServerConfig.ts`

This means HAPI currently supports the common approval paths, but not the full official decision space.

### 3. Protocol surface is intentionally partial

The official app-server protocol includes many methods HAPI does not attempt to implement, including:

- thread listing and archival APIs
- review APIs
- realtime APIs
- command exec APIs
- filesystem APIs
- model listing APIs
- plugin/app APIs

That is not inherently a bug. HAPI only needs a focused subset to drive remote Codex sessions.

But it does mean HAPI should be understood as a **subset client**, not a full protocol implementation.

### 4. Slash-command availability still carries legacy protocol shape

HAPI has already removed local Codex mode, but some protocol-facing abstractions still preserve a broader availability model than the runtime now actually uses.

This is a much smaller issue than the type drift problem, but it is still a sign that the local protocol model is more general than the actual supported behavior.

Relevant implementation:

- `shared/src/slashCommands.ts`

## Risk Assessment

### Low risk

- Transport choice
- Initialization order
- Main thread/turn lifecycle
- Main streaming notification handling

These all match the documented protocol well enough for normal remote Codex use.

### Medium risk

- Hand-written type definitions
- Partial approval decision support
- Partial support for advanced or newer protocol fields

These are the areas most likely to break when Codex changes.

### High risk

No immediate high-risk incompatibility was found in the core remote execution path.

The current implementation is not obviously violating the protocol in a way that should block normal usage.

## Bottom-Line Assessment

HAPI **does** use the official `codex app-server` protocol to talk to remote Codex.

But it does so through a **manually implemented subset**, not through a generated, version-locked protocol client.

That means the project is:

- **protocol-aligned enough to function**
- **not protocol-complete**
- **not strongly protected against future protocol drift**

## Recommended Next Steps

### 1. Replace hand-written app-server types with generated ones

This is the highest-value improvement.

Use:

```bash
codex app-server generate-ts --out DIR
```

Then adapt HAPI to consume those generated types instead of `cli/src/codex/appServerTypes.ts`.

### 2. Expand approval response support

At minimum, review and decide how HAPI should handle:

- `unlessTrusted`
- granular approval variants
- exec policy amendment approvals
- network policy amendment approvals

If unsupported by design, document that explicitly.

### 3. Document supported protocol subset

Add a short engineering note that HAPI supports:

- remote thread start/resume
- turn start/interrupt
- main streaming notifications
- command/file-change approvals

And does not aim to fully expose the broader app-server surface.

## Files Reviewed

- `codex-app-server.md`
- `cli/src/codex/codexAppServerClient.ts`
- `cli/src/codex/appServerTypes.ts`
- `cli/src/codex/utils/appServerConfig.ts`
- `cli/src/codex/utils/appServerEventConverter.ts`
- `cli/src/codex/utils/appServerPermissionAdapter.ts`
- `cli/src/codex/codexRemoteLauncher.ts`
