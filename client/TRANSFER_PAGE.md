# Captain transfer page

`transfers.html` lets an OTP-verified captain search other teams' players, submit
a reason, and follow the team's requests. Only the organization admin decides;
the player receives a bot notification without action buttons.

Tokens stay in memory, never browser storage. Refreshing requires OTP login again.
Required server functions: `verify-otp`, `request-transfer`, `team-transfer-page`.
Deployment is pending owner approval and production preflight. Admin decisions
require the atomic membership migration documented in the organization tests.

## Offline checks

```powershell
node --test test/transfer-api.test.mjs
$runtime = Join-Path $env:TEMP 'amatora-transfer-ui-tests'
npm install --prefix $runtime --no-save --package-lock=false --ignore-scripts playwright
$env:PLAYWRIGHT_MODULE = Join-Path $runtime 'node_modules/playwright'
$env:TRANSFER_BROWSER_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node --test test/transfer-ui.test.cjs
```

Browser tests mock all API responses and block external requests. They check
multi-team login, search, safe text rendering, double submission, statuses,
closed windows, mobile layout and expired sessions. No real messages are sent.

## Manual review after approved staging rollout

Run `python -m http.server 8080 --bind 127.0.0.1` from this directory and open
`http://127.0.0.1:8080/transfers.html`. Use only staging/test accounts: the page
currently targets the project's Supabase endpoint. Check OTP login, search,
request reason, status refresh and logout. Refresh should require login again.
Before rollout, use the mocked browser test for functional review.
