# Windows 10 Client Setup

## Goal
Provide a repeatable setup for unattended classroom client screens.

## Requirements
- Windows 10 machine
- modern browser (Edge or Firefox)
- network access to server host

## Initial Manual Setup
1. Open client URL:
   - `http://<server-ip>:3000/client`
2. Enter:
   - display name
   - room code
   - one-time confirmation code
3. Confirm client status is visible in admin dashboard.

## Kiosk-Like Operation
For demo stability:
- run browser in fullscreen mode (`F11`)
- disable sleep/auto-lock during session
- keep power profile on high performance when possible

## Recovery Behavior
If page reloads or browser restarts:
- client must rejoin with a new one-time confirmation code
- issue code from admin dashboard and rejoin

## Troubleshooting Quick Checks
- can open `/health` on server
- room code is correct
- confirmation code is unused and not expired
- firewall allows outbound connection to server port
