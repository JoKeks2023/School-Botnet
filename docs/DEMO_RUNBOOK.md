# Demo Runbook

## Pre-Flight (15-30 min before)
1. Start server.
2. Verify `GET /health` returns `{ ok: true }`.
3. Open admin dashboard on operator machine.
4. Verify admin login works.

## Live Onboarding Sequence
1. Login in admin dashboard.
2. Create room and announce room code.
3. For each client machine:
   - issue one-time confirmation code
   - enter room code + confirmation code on client page
   - verify client appears online in admin panel

## Start Compute Demo
1. Click start task in admin dashboard.
2. Watch `completed/total` progress.
3. Monitor online/offline client badges.

## Controlled Stop
1. Click stop tasks in admin dashboard.
2. Confirm task status moves to `canceled` (or `complete`).
3. Save screenshots or notes if needed.

## Post-Session
1. Stop server if no longer needed.
2. Archive logs/observations.
3. Document any failures for next run.
