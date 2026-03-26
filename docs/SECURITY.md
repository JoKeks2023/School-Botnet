# Security Model

## Core Principles
- explicit admin-controlled operation
- explicit client join flow
- no hidden execution model
- no self-propagation

## Controls in MVP
- admin login required for admin endpoints
- bearer token check for admin actions
- room join requires:
  - 8-digit room code
  - 8-digit one-time confirmation code
- confirmation codes expire by TTL and can only be used once
- client endpoints require client token

## Configuration
Environment variables:
- `ADMIN_PASSWORD` (default `change-me`, must be overridden)
- `JOIN_CODE_TTL_MINUTES` (default `15`)
- `HEARTBEAT_TIMEOUT_SECONDS` (default `30`)
- `PORT` (default `3000`)

## Risks in Current MVP
- tokens and state are in memory only
- no token revocation model
- permissive CORS (`origin: *`)
- no HTTPS termination inside app layer
- no brute-force throttling on login and join

## Hardening Recommendations
1. Run behind reverse proxy with HTTPS.
2. Restrict CORS origin(s).
3. Add rate limits for login/join endpoints.
4. Rotate admin secrets and use strong passwords.
5. Add audit logging for sensitive events.
6. Add persistent session store for token tracking.
7. Add optional IP allowlist for admin endpoints.
