# Server organization authorization gate

The new shared module is not wired to production endpoints and has not been deployed. It validates the bearer token through Supabase Auth getUser(token), reads admin_users by the verified Auth user ID with explicit authority columns, and denies requests outside that administrator's organization. User metadata, request role and email never grant access. This helper is organization-scoped even for super admins; global administration needs its own separately reviewed authorization path.

## Release blockers

- Live admin_users currently permits unrestricted authenticated writes. This gate is NOT secure against a maliciously modified membership until database authorization is repaired.
- organization_users publicly exposes password and allows membership writes. Existing mobile organizers are not provisioned as Auth identities. Migrate their login and account creation before removing legacy paths.
- Web organization creation invokes auth.admin.createUser in the browser. Move creation to a server-only authorized endpoint; do not place service-role secrets in a client.
- Local PostgreSQL/Docker is unavailable. Mocked unit tests verify the server gate logic only, not actual RLS, grants, network delivery or concurrent database behavior.

## Isolated database verification required

Create two disposable organizations in an isolated database, with distinct Auth users and immutable UID memberships. Verify: anonymous credential reads and all membership mutations denied; org A cannot alter org B; org admins cannot change their own role or organization; valid org A match operations succeed; intended public football reads remain; ordinary organizer privileges are narrower than admin privileges. Only a server-authorized provisioning path may change authoritative membership. Verify rollback and backups before production rollout.

Run offline gate tests: node --test supabase/functions/_shared/admin-authorization.test.mjs
