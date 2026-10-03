# Per-team incoming transfer access

User-approved scope: preserve global organization transfer window. Per-team restriction blocks receiving a player only, never the releasing team. Absent override preserves existing access. Global window closed always denies a new request. No automatic payment detection: manual administrator permission controls access.

Prepared draft: security/drafts/team-transfer-permissions.sql. Backend-only override table and setter check exact organization and administrator mapping; caller actor must come from verified Auth UID, not body fields. This depends on protected admin_users authority; live broad writes remain a security prerequisite. Isolated PostgreSQL test passed: default compatibility, toggle, wrong organization denied, global window precedence and client mutation denial. No production data changed; fixture closed in memory.

Remaining implementation across four clients: server check on new_team_id in every web/mobile request/approval path; context returns incoming restriction and organization contact_phone; admin web/mobile collapsible team list with league filtering, bounded pagination, per-row in-flight state and rollback on save failure; client web/mobile payment restriction modal with translated reason and phone call link. Do not use polling or whole-team realtime. Read team list on expanding/filter/page only. The SQL draft is not deployed, integrated or enforced yet. Existing transfer screen controls stay in place. Preserve current pending/history behavior; decide at final guard integration which pending approvals must recheck current receiving-team access.

## Incoming database guard prepared

incoming-transfer-permission-guard.sql blocks transfer INSERT, changed receiving organization/team and first approval when receiving team's override is false. Releasing team's override is ignored; rejection/history remain unaffected. It verifies target organization and locks receiving team using the same lock as setter. Existing global-window/session/consent checks remain unchanged. team-transfer-http recognizes only the exact known payment exception and returns 403 plus TEAM_TRANSFER_PAYMENT_REQUIRED, without database details. Two isolated tests passed; no actual transfer or notification was sent.

Not deployed. Before rollout verify live trigger definitions/order, legacy rows with name-only/null receiving IDs and all mobile backend error adapters. SQL guard covers table writes once installed, but live installation has not happened. Phone context, admin switch UI, league pagination/filter and both user modals remain unfinished. Shared team lock design needs hosted multi-connection concurrency test. No fixtures persist after memory DB closure.

## Web admin control prepared

Transfer page now includes TeamTransferAccess under the existing global window card. Expansion fetches thirty-row cursor pages; league filtering uses teams.league. No polling/realtime or full roster fetch is added. Toggle uses immediate optimistic state, per-row in-flight locking and rollback/error on failed RPC. Organization-keyed component and request versions discard stale responses. Admin RPC derives actor from auth.uid and scopes exact organization; its security requires previously protected admin_users. Default team permission is preserved.

SQL fixture test now covers authenticated own-org page/filter and set, cross-org denial and non-admin denial. Vite build passes with existing bundle-size warning. Not deployed: draft RPCs are not installed, so local UI shows a safe retry error until backend rollout. Device/browser visual checks remain. To inspect run npm run dev --prefix admin; open Transfers and expand the new section. Test only isolated fixture switches. Mobile admin/client modals and deployment remain outstanding.
