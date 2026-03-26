# Architecture

## High-Level Components

- Server: Express + Socket.IO in `src/server.js`
- Admin UI: static frontend in `public/admin`
- Client UI: static frontend in `public/client`
- Shared static assets: `public/styles.css`

## Runtime Flow

1. Admin authenticates with password.
2. Admin creates a room and issues one-time confirmation codes.
3. Client joins using room code + confirmation code.
4. Admin starts a task with chunk count.
5. Clients pull chunks (`/api/client/next`), compute, and submit results.
6. Server updates room state and pushes updates over Socket.IO.

## State Model (In-Memory)

`state` contains:

- `adminTokens: Map<token, { createdAt }>`
- `rooms: Map<roomCode, Room>`
- `clientTokens: Map<clientToken, { roomCode, clientId }>`

`Room` contains:

- metadata (`roomCode`, `createdAt`)
- `confirmationCodes: Map<code, { createdAt, used, usedAt? }>`
- `clients: Map<clientId, ClientRecord>`
- `tasks: Task[]`

`Task` contains:

- identifiers and timing (`taskId`, `createdAt`, `startedAt`, `finishedAt`)
- status (`running`, `complete`, `canceled`)
- chunk tracking (`assignedChunks`, `completedChunks`)

## Scheduling Strategy

- pull-based assignment: clients ask for work
- first unassigned and incomplete chunk is assigned
- assignment tracked in `assignedChunks`
- result submission moves chunk to `completedChunks`

## Liveness Model

- clients send heartbeat periodically
- server marks online status by comparing last heartbeat with timeout threshold

## Transport

- HTTP/JSON for command and data API
- Socket.IO event `room:update` for near real-time admin updates

## Known MVP Trade-offs

- no persistence across server restart
- no result verification or recomputation
- no automatic reassignment for stale assigned chunks
- permissive CORS for MVP simplicity
