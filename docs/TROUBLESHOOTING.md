# Troubleshooting

## Admin Login Fails
Symptom:
- `invalid_credentials`

Checks:
- verify `ADMIN_PASSWORD` in `.env`
- restart server after env changes

## Room Join Fails
Symptom:
- `room_not_found`, `invalid_confirmation_code`, or `confirmation_code_used`

Checks:
- room code matches active room
- confirmation code was just issued
- code not reused on another client
- TTL not expired (`JOIN_CODE_TTL_MINUTES`)

## Client Shows Offline
Symptom:
- client appears offline in admin panel

Checks:
- client browser tab still open
- no local sleep/hibernation
- network stable
- heartbeat timeout value reasonable

## Task Does Not Progress
Symptom:
- task remains with low completed chunks

Checks:
- at least one client online
- clients are not blocked by browser throttling/background suspension
- server still responsive (`/health`)

## Docker Container Restart Loop
Checks:
- inspect logs: `docker compose logs -f`
- verify env variables
- ensure port 3000 is free

## EXE Build Fails
Checks:
- run `npm install`
- run `npm run build:exe:win`
- verify `pkg` target is supported
- ensure enough disk space for pkg base binaries
