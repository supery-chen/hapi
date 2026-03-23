# How it Works

HAPI consists of three interconnected components that work together to provide remote Codex control.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     Your Machine (Local or Hub Host)                       │
│                                                                            │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐       │
│   │              │         │              │         │              │       │
│   │   HAPI CLI   │◄───────►│  HAPI Hub    │◄───────►│   Web App    │       │
│   │              │ Socket  │              │   SSE   │  (embedded)  │       │
│   │  + AI Agent  │   .IO   │  + SQLite    │         │              │       │
│   │              │         │  + REST API  │         │              │       │
│   └──────────────┘         └──────┬───────┘         └──────────────┘       │
│                                   │                                        │
│                                   │ localhost:3006                         │
└───────────────────────────────────┼────────────────────────────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │  Tunnel (Optional)│
                          │  Cloudflare/ngrok │
                          └─────────┬─────────┘
                                    │
┌───────────────────────────────────┼────────────────────────────────────────┐
│                           Public Internet                                  │
│                                   │                                        │
│         ┌─────────────────────────┼─────────────────────────┐              │
│         │                         ▼                         │              │
│         │    ┌──────────────┐           ┌──────────────┐    │              │
│         │    │              │           │              │    │              │
│         │    │  Telegram    │           │    PWA /     │    │              │
│         │    │  Mini App    │           │   Browser    │    │              │
│         │    │              │           │              │    │              │
│         │    └──────────────┘           └──────────────┘    │              │
│         │                                                   │              │
│         └───────────────────────────────────────────────────┘              │
│                            Your Phone                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

> **Note:** The hub can run on your local desktop or a remote host (VPS, cloud, etc.). If deployed on a host with a public IP, tunneling is not required.

## Components

### HAPI CLI

The CLI is a wrapper around Codex. It:

- Starts and manages coding sessions
- Registers sessions with the HAPI hub
- Relays messages and permission requests
- Provides MCP (Model Context Protocol) tools

**Key Commands:**
```bash
hapi              # Start OpenAI Codex session
hapi codex       # Start OpenAI Codex session
hapi runner start # Run background service for remote session spawning
```

### HAPI Hub

The hub is the central service that connects everything:

- **HTTP API** - RESTful endpoints for sessions, messages, permissions
- **Socket.IO** - Real-time bidirectional communication with CLI
- **SSE (Server-Sent Events)** - Live updates pushed to web clients
- **SQLite Database** - Persistent storage for sessions and messages
- **Telegram Bot** - Notifications and Mini App integration

### Web App

A React-based PWA that provides the mobile interface:

- **Session List** - View all active and past sessions
- **Chat Interface** - Send messages and view agent responses
- **Permission Management** - Approve or deny tool access
- **File Browser** - Browse project files and view git diffs
- **Remote Spawn** - Start new sessions on any connected machine

## Data Flow

### Starting a Session

```
1. User runs `hapi` in terminal
         │
         ▼
2. CLI starts Codex
         │
         ▼
3. CLI connects to hub via Socket.IO
         │
         ▼
4. Hub creates session in database
         │
         ▼
5. Web clients receive SSE update
         │
         ▼
6. Session appears in mobile app
```

### Permission Request Flow

```
1. AI agent requests tool permission (e.g., file edit)
         │
         ▼
2. CLI sends permission request to hub
         │
         ▼
3. Hub stores request and notifies via SSE + Telegram
         │
         ▼
4. User receives notification on phone
         │
         ▼
5. User approves/denies in web app or Telegram
         │
         ▼
6. Hub relays decision to CLI via Socket.IO
         │
         ▼
7. CLI informs AI agent, execution continues
```

### Message Flow

```
User (Phone)                 Hub                     CLI
     │                         │                       │
     │──── Send message ──────►│                       │
     │                         │─── Socket.IO emit ───►│
     │                         │                       │
     │                         │                       ├── AI processes
     │                         │                       │
     │                         │◄── Stream response ───│
     │◄─────── SSE ────────────│                       │
     │                         │                       │
```

## Communication Protocols

### CLI ↔ Hub: Socket.IO

Real-time bidirectional communication for:
- Session registration and heartbeat
- Message relay (user input → agent)
- Permission requests and responses
- Metadata and state updates
- RPC method invocation

### Hub ↔ Web: REST + SSE

- **REST API** for actions (send message, approve permission)
- **SSE stream** for real-time updates (new messages, status changes)

### External Access: Tunnel

For remote access outside your local network:
- **Cloudflare Tunnel** (recommended) - Free, secure, reliable
- **Tailscale** - Mesh VPN for private networks
- **ngrok** - Quick setup for testing

## Remote Control

HAPI's defining feature is that Codex sessions keep running on your machine while the web app and phone stay in control.

- Control via Web/PWA/Telegram from any device
- Approve permissions on the go
- Monitor progress while away from your desk
- Session continues running on your local machine

### Use Cases

1. **Remote Control While Away** - Start a session at your desk, continue from your phone during commute or coffee break

2. **Permission Approval** - AI requests file access, you get notified on phone, approve with one tap, session continues

3. **Multi-Device Collaboration** - View session progress on your phone while your desktop does the heavy lifting
