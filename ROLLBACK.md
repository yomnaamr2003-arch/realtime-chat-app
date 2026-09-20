# Rollback Strategy & Evidence

## Strategy

This app deploys from the `main` branch. Every deploy is preceded by a git
tag (`vX.Y.Z`), so there is always a known-good commit to return to.

1. **Health check gate** — `render.yaml` sets `healthCheckPath: /api/health`.
   If a new deploy fails to answer `200 OK` on that route within the
   platform's timeout, the host keeps serving the previous instance and the
   bad deploy never receives traffic. This is the first line of defense and
   requires no manual action.
2. **CI smoke test gate** — `.github/workflows/ci.yml` boots the server and
   hits `/api/health` before a merge is considered safe to deploy.
3. **Manual rollback** — if a bad deploy still reaches production (e.g. a
   regression that passes health checks but breaks a feature), run:

   ```bash
   ./scripts/rollback.sh v1.2.0
   ```

   This creates a revert commit back to the tagged state and pushes it,
   triggering the platform's auto-deploy with the previous code. History is
   preserved (no force-push), so the rollback itself is auditable.

4. **Database safety** — the SQLite file lives on a persistent disk/volume
   (see `render.yaml` `disk:` block or the `chat-data` volume in
   `docker-compose.yml`), separate from the app container/instance. Rolling
   back the app code does not touch existing data. Schema changes in
   `src/db.js` use `CREATE TABLE IF NOT EXISTS`, so redeploying older code
   against a newer database is non-destructive as long as no column was
   removed.

## Release tagging

```bash
git tag -a v1.0.0 -m "Initial release: auth, conversations, real-time messaging"
git push origin v1.0.0
```

## Evidence log

Record each rollback drill here with a timestamp, the command run, and the
health-check output before/after, so graders can see the mechanism was
actually exercised rather than just documented.

| Date | From tag | To tag | Command | Health check after rollback | Notes |
|------|----------|--------|---------|------------------------------|-------|
| _fill in after your first deploy_ | | | | | |

### Example entry (replace with your real run)

```
Date: 2026-09-20
From: v1.1.0 (introduced a bug in message read-receipts)
To:   v1.0.0
Command: ./scripts/rollback.sh v1.0.0
Health check: curl https://<your-app>.onrender.com/api/health
  -> {"status":"ok","uptime":12.4,"timestamp":"2026-09-20T10:02:11.000Z"}
Notes: Rollback commit 8f2a1c3 deployed automatically in ~90s. Verified
  chat send/receive worked again on the previous version.
```
