# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs both frontend :5173 and backend :4000 concurrently)
pnpm dev

# Individual services
pnpm dev:client    # Vite frontend only
pnpm dev:server    # tsx watch server/index.ts

# Build (compiles TypeScript + Vite bundle)
pnpm build         # tsc -b && tsc -p tsconfig.server.json && vite build

# Type checking (no emit)
pnpm typecheck

# Lint
pnpm lint

# Run built server
pnpm start:server  # node dist-server/index.js
```

Package manager is **pnpm** (v8.12.1). There are no test commands configured.

## Architecture

OpsClaw is an SSH operations workbench: a full-stack app where a React frontend communicates with an Express backend over REST (node/group management) and WebSocket (live terminal sessions).

**Frontend** (`src/`) — React 19, React Router 7, Vite, Tailwind CSS 4, shadcn/ui:
- `src/app/router.tsx` — route definitions
- `src/routes/` — page-level components (WorkbenchPage is the main one at 750+ lines)
- `src/features/workbench/` — all workbench logic: API client (`api.ts`), type definitions (`types.ts`), session tree (`SessionTree.tsx`), terminal pane (`SshTerminalPane.tsx`), connection panel (`ConnectionPanel.tsx`), workspace layout (`TerminalWorkspace.tsx`)
- `src/components/ui/` — shadcn/ui primitives
- `src/lib/` — `utils.ts` (cn helper), `serverBase.ts` (environment-aware base URL)
- Path alias `@/` maps to `./src/`

**Backend** (`server/`) — Express 5, Node.js, WebSocket (ws), SSH2, sql.js:
- `server/index.ts` — Express + WebSocket server, all REST routes, SSH session lifecycle
- `server/nodeStore.ts` — persistence layer for nodes and groups (CRUD on SQLite)
- `server/database.ts` — SQLite schema initialization via sql.js
- `server/secretVault.ts` — AES-256-GCM encryption/decryption for stored credentials

**Data** (`data/`):
- `data/opsclaw.sqlite` — SQLite database
- `data/opsclaw.master.key` — auto-generated encryption key for credential storage

**Dev proxy**: Vite proxies `/api` → `http://localhost:4000` and `/ws` → `ws://localhost:4000`, so frontend code always calls relative URLs.

**Multiple tsconfigs**:
- `tsconfig.app.json` — frontend (ESNext modules, JSX)
- `tsconfig.server.json` — backend (NodeNext modules, emits to `dist-server/`)
- `tsconfig.node.json` — build tooling
- `tsconfig.json` — composite root referencing all three

## Key Patterns

- Credentials are never stored in plaintext; `secretVault.ts` encrypts them before writing to SQLite and decrypts on read.
- WebSocket terminal sessions use a `sessionId` for multiplexing; the backend maps each ID to an active SSH client + shell stream.
- The `WorkbenchPage.tsx` owns most frontend state (selected node, open tabs, connection state) and passes handlers down to child components.
- shadcn components live in `src/components/ui/` and are imported via the `@/components/ui/` alias.
