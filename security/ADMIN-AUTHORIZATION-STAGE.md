# Server organization authorization gate

The new shared module is not wired to production endpoints and has not been deployed. It validates the bearer token through Supabase Auth getUser(token), reads admin_users by the verified Auth user ID with explicit authority columns, and denies requests outside that administrator's organization. User metadata, request role and email never grant access. This helper is organization-scoped even for super admins; global administration needs its own separately reviewed authorization path.

## Release blockers

- Live admin_users currently permits unrestricted authenticated writes. This gate is NOT secure against a maliciously modified membership until database authorization is repaired.
- organization_users publicly exposes password and allows membership writes. Existing mobile organizers are not provisioned as Auth identities. Migrate their login and account creation before removing legacy paths.
- Web organization creation invokes auth.admin.createUser in the browser. Move creation to a server-only authorized endpoint; do not place service-role secrets in a client.
- Docker is unavailable. The isolated PGlite PostgreSQL tests now verify admin_users RLS and column grants; they do not verify hosted Supabase configuration, network delivery or concurrent database behavior.

## Isolated database verification required

Create two disposable organizations in an isolated database, with distinct Auth users and immutable UID memberships. Verify: anonymous credential reads and all membership mutations denied; org A cannot alter org B; org admins cannot change their own role or organization; valid org A match operations succeed; intended public football reads remain; ordinary organizer privileges are narrower than admin privileges. Only a server-authorized provisioning path may change authoritative membership. Verify rollback and backups before production rollout.

Run offline gate tests: node --test supabase/functions/_shared/admin-authorization.test.mjs

## Global provisioning gate

`authorizeGlobalAdmin` verifies the Auth token and reads the matching UID in admin_users through the dedicated backend client. Only the database super_admin role is accepted. It does not trust metadata or a supplied organization/role. Customer endpoints retain the separately tested organization-scoped gate. Eleven mocked authorization tests passed, including three global provisioning tests. No endpoint or browser flow is wired to this helper yet.

Organization creation currently consists of separate organization, Auth identity and membership writes. The next implementation must address partial failures and retry/idempotency before switching the browser to an endpoint. Do not delete an existing organization or Auth identity as generic compensation. Client-writable admin_users remains a prerequisite blocker for both gates; protecting it and server provisioning must be released in a coordinated sequence.

## Atomic organization/membership draft

`security/drafts/provision-organization.sql` combines the organization and admin membership inserts in one PostgreSQL transaction. It checks the supplied UID/email against auth.users, allows service_role execution only, serializes its own calls by UID and slug, returns the existing result only for identical inputs, and rejects conflicting reuse. It never deletes data. The isolated PostgreSQL test verifies repeatability, client denial, conflict rejection and rollback when the membership insert fails. Three database tests pass; fixtures close automatically.

Not deployed or wired to the browser. The live organizations schema/constraints and all other organization writers must be checked before deployment. Advisory locking coordinates this function only; retain a database unique slug constraint. Auth identity creation remains a separate external operation: a durable server request/idempotency record is still needed to retain the newly created UID across process failure and retries. This draft alone does not provide end-to-end provisioning idempotency. Do not infer ownership from an existing email or adopt/delete unrelated Auth users on retry.

## Retry-safe server orchestration (not deployed)

organization-provisioning.mjs verifies global authority, validates input, durably marks auth_creating before createUser, persists the returned UID, then calls atomic provisioning. It does not delete or adopt existing users. Unknown Auth outcomes require review; retry from auth_created skips Auth creation. Six mocked workflow tests passed (17 including authorization). Tests call no external service.

Required store contract BEFORE endpoint wiring: atomic claim keyed by actor UID + request UUID; reject changed canonical payload; serialize email/slug reservations across different keys; never store passwords/tokens; unforgeable backend-only lease; conditional phase updates; persist UID as immutable; completed result immutable. New claims may be reclaimed only before auth_creating. Never automatically reclaim auth_creating to new: a crash may have created an Auth account. A crashed auth_created lease may be reclaimed and repeat the idempotent SQL call. Store methods must reject stale leases, and clients must have no direct table/function access. Implement and test this durable adapter, concurrency and expiry behavior before enabling the endpoint. Current orchestration accepts an injected store only and is not a production-ready endpoint.

## Verified draft containment

`security/drafts/admin-users-isolation.sql` is a draft, outside the deployment migration directory. It removes the two observed broad policies, rejects unexpected policies transactionally, revokes table and column client grants, and allows authenticated clients to read only their own id/role/organization_id. Backend service access is retained. It must not be deployed before browser account provisioning/settings and legacy mobile login are migrated; those client writes would be denied.

Run: `npm ci --ignore-scripts --prefix security/rls-tests`, then `npm test --prefix security/rls-tests`. Tests create only in-memory synthetic PostgreSQL fixtures, never load environment credentials, never contact Supabase, and close each database in finally. No production cleanup queries exist. Both tests passed; dependency audit reported zero vulnerabilities. Covered: baseline anonymous exposure, anonymous denial after repair, own identity access including organization 1, cross-organization invisibility, sensitive column denial including an existing column grant, denied role/org changes and insert/delete, server-only provisioning, and rollback on unexpected policies. These results cover admin_users only; organization_users and matches remain release blockers.
