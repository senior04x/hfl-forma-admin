# Team transfer Edge Functions

This branch is not deployed. Apply only with the completed bot/client/admin flow
and owner approval. See [migration order and tests](../../test/TEAM_TRANSFERS.md).

## verify-otp

POST body: `{ "phone": "+998901234567", "code": "1234", "team_id": "optional-team-uuid" }`.
Captain-only login for the team-initiated transfer flow. The DB matches the
verified phone to teams.captain_phone; team_id never grants authority by itself.
For multiple captain teams, a verified code returns 409 with team IDs/names;
resubmit with the selected team_id and same code. Players keep their existing
backend login and will receive invitations, rather than create new transfers.

Success returns `success`, `role: "captain"`, `sessionToken`, `expiresAt`, `team`
and `canRequestTransfers`. The token has 32 random bytes and expires after 24 hours;
only its SHA-256 digest is stored. Keep the raw token out of logs, URLs and
localStorage. Existing experimental plaintext team sessions require fresh login.

OTP verification, attempt increment/block, token insertion and OTP consumption
are transactional. Five wrong attempts lock the code, including for a subsequent
correct guess. New OTP issuance resets attempts for both bot and backend upserts.
A failed session insertion rolls the transaction back.

## request-transfer

POST with `Authorization: Bearer <sessionToken>`.
Body: `{ "player_id": "application-uuid", "reason": "...", "new_team_id": "optional-team-uuid" }`.
Reason is trimmed, 1-1000 characters. Requesting team and organization are derived
from the session/database. An optional new_team_id must match that team.

The RPC checks session expiry, current captain phone, player membership, matching
organization, transfer window and existing pending transfers. It locks the player
row to serialize competing requests through this RPC. The result is a pending
transfer with `player_confirmed=false`; it does not claim a notification was sent.
Only the authenticated admin of the owning organization can approve/reject.
`player_confirmed` is a compatibility field, not an approval requirement.
The bot will send an informational notification without accept/reject buttons.
Bot delivery uses the durable notification queue and remains disabled until rollout.

## team-transfer-page

POST with `Authorization: Bearer <sessionToken>`.
Body: `{ "action": "context|players|history|logout", "query": "optional prefix", "after": "optional cursor uuid" }`.
Current captain ownership and session expiry are checked for every action.
Player search requires 2-80 characters and returns approved players in other teams
of the same organization. History includes only the session team's requests,
newest first. Both lists return up to 20 `items` and `next_cursor`.
Logout revokes the session. No phone or Telegram identifiers are returned.

## Access and deployment

`supabase/config.toml` disables gateway JWT verification for these three functions
because they use custom OTP/session authentication. Their RPCs can be executed
only by service_role. Client credentials are never forwarded to the admin client.
Do not invoke these RPCs directly from clients.

The experimental `create-player-transfer` is not part of this flow and must not
be deployed. Mobile UI migration to incoming invitations is still pending.

Production preflight must inspect all existing RLS policies and OTP readers,
issuers and verifiers. These changes do not certify legacy backend authentication.
Neither migrations nor Edge Functions have been applied to production here.
