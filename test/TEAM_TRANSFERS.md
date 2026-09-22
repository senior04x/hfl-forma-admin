# Captain transfer security tests

Run from the organization repository (Node.js 22+). Install the test-only
PostgreSQL WASM runtime outside the repository; no production connection is used:

```powershell
$runtime = Join-Path $env:TEMP 'amatora-transfer-db-tests'
npm install --prefix $runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
$env:PGLITE_MODULE = Join-Path $runtime 'node_modules/@electric-sql/pglite'
node --test test/transfer-consent.test.cjs test/transfer-admin-decision.test.cjs test/team-transfer-db.test.cjs test/team-transfer-http.test.mjs test/team-transfer-page.test.cjs test/transfer-notification-queue.test.cjs
```

PGlite executes the real PL/pgSQL against minimal schema fixtures. Promise batches
check repeated requests, but PGlite serializes them: these are not multi-connection
PostgreSQL load tests. Staging must additionally test concurrent connections.

Deployment remains gated on the full bot/client/admin rollout and owner approval.
Apply migrations in this explicit dependency order (not alphabetical order):

1. `20260922_team_initiated_transfers.sql`
2. `20260922_add_otp_attempts.sql`
3. `20260922_add_player_sessions.sql`
4. `20260922_enforce_player_confirmation.sql`
5. `20260923_atomic_team_transfers.sql`
6. `20260924_admin_only_transfer_decisions.sql`
7. `20260925_transfer_notifications.sql`
8. `20260926_team_transfer_page.sql`

Queue test: `node --test test/transfer-notification-queue.test.cjs` with the same
PGLITE_MODULE environment. This validates transactional enqueue, ordering,
deduplication, stale claims and denied anonymous access. The bot worker is
disabled until explicitly enabled after rollout; no historical backfill occurs.

Current flow: captain requests, bot notifies without action buttons, organization
admin approves/rejects. The admin-only migration supersedes the old consent trigger;
player_confirmed remains only for compatibility. The consent test covers the
historical migration; the admin-decision test covers the final upgrade and policy.

`verify-otp` now serves captain login only: `{phone, code, team_id?}`. If the
verified phone owns multiple teams, supply the selected team ID; the DB still
checks its captain phone. Existing mobile login uses the backend and is unchanged.
The previous experimental player-session issuance is not part of the new
team-initiated flow. Do not deploy `create-player-transfer` for this flow.

`request-transfer` accepts `{player_id, reason, new_team_id?}`. The requesting team
comes from the session; an optional new_team_id must match. Unknown caller-supplied
phone, status, consent and organization fields are ignored. A 32-byte random token
is returned once; only its SHA-256 digest is stored. Old experimental plaintext
team tokens require a new OTP login. Client integration must keep tokens out of
URLs/logs/localStorage; use memory or a secure platform credential store.

The RPCs are executable only by service_role; Edge handlers perform input checks
and call them without forwarding caller credentials. The DB transaction locks the
OTP/player rows, checks authority and inserts the session/request atomically.
The pending check serializes requests through this RPC; it does not claim to
control unrelated legacy service-role writers. Bot delivery stays disabled until rollout.

The captain page uses `team-transfer-page` for session-scoped context, prefix
player search, own request history and logout. Lists have 20-row cursor pages.
Search excludes unapproved applications, the captain's team and other organizations.
Multi-team OTP responses include only team IDs/names after successful code verification.
See [client checks](../client/TRANSFER_PAGE.md) for offline browser tests.

Before deployment, verify live OTP RLS/grants and all legacy OTP issuers/verifiers:
untrusted clients must not read codes or reset attempts. The existing backend login
is outside these RPCs and needs integration review before claiming system-wide
OTP replay/brute-force protection. Also verify organization membership/RLS and
that no other public write policy still grants transfer creation. The original
migrations only drop known policy names.

References: https://supabase.com/docs/guides/functions/function-configuration
and https://www.postgresql.org/docs/17/explicit-locking.html
