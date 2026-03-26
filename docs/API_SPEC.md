# API Specification

Base URL: `http://<host>:3000`
Content type: `application/json`

## Health
### GET `/health`
Response:
```json
{ "ok": true, "ts": 1710000000000 }
```

## Admin Auth
### POST `/api/admin/login`
Request:
```json
{ "password": "change-me" }
```
Success response:
```json
{ "token": "<admin-token>" }
```
Error:
- `401 invalid_credentials`

## Room Management (Admin)
Requires header: `Authorization: Bearer <token>`

### POST `/api/admin/rooms`
Response:
```json
{ "roomCode": "12345678" }
```

### POST `/api/admin/rooms/:roomCode/issue-code`
Response:
```json
{ "confirmationCode": "87654321", "ttlMinutes": 15 }
```
Errors:
- `404 room_not_found`

### GET `/api/admin/rooms/:roomCode/state`
Response contains snapshot:
- `roomCode`, `createdAt`
- `clients[]`
- `tasks[]`
- `pendingConfirmationCodes[]`

### POST `/api/admin/rooms/:roomCode/tasks`
Request:
```json
{ "type": "demo_render", "totalChunks": 200 }
```
Response:
```json
{ "taskId": "task_xxx" }
```
Errors:
- `400 invalid_total_chunks`
- `404 room_not_found`

### POST `/api/admin/rooms/:roomCode/stop`
Response:
```json
{ "ok": true }
```

## Client Join + Runtime
### POST `/api/client/join`
Request:
```json
{
  "name": "pc-client",
  "roomCode": "12345678",
  "confirmationCode": "87654321"
}
```
Response:
```json
{ "clientToken": "<client-token>", "clientId": "client_xxx" }
```
Errors:
- `404 room_not_found`
- `400 invalid_confirmation_code`
- `400 confirmation_code_used`

### POST `/api/client/heartbeat`
Request:
```json
{
  "clientToken": "<client-token>",
  "cpuHint": "normal",
  "memoryHint": "normal"
}
```
Response:
```json
{ "ok": true }
```
Errors:
- `401 invalid_client_token`
- `404 room_not_found`
- `404 client_not_found`

### POST `/api/client/next`
Request:
```json
{ "clientToken": "<client-token>" }
```
Response when work exists:
```json
{
  "task": {
    "taskId": "task_xxx",
    "type": "demo_render",
    "chunkIndex": 0,
    "totalChunks": 200
  }
}
```
Response when idle:
```json
{ "task": null }
```

### POST `/api/client/result`
Request:
```json
{
  "clientToken": "<client-token>",
  "taskId": "task_xxx",
  "chunkIndex": 0,
  "result": { "elapsedMs": 12, "checksum": 42 }
}
```
Response:
```json
{ "ok": true, "completed": 1, "total": 200 }
```
Errors:
- `401 invalid_client_token`
- `404 room_not_found`
- `404 task_not_found`
- `400 invalid_chunk_index`

## Socket Events
Namespace: default Socket.IO namespace.

### Server -> Client
- `server:ready`: `{ "ok": true }`
- `room:update`: room snapshot payload
