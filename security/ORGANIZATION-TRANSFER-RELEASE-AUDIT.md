# Transfer release audit — 2026-10-04

Read-only inspection of production project `xzzyhfyazwohdqqbjiiy`; no data or policy mutations performed.

## Confirmed blockers

- `organizations` has RLS enabled, but `Allow authenticated manage organizations` grants authenticated `ALL` with `USING true` and `WITH CHECK true`. Both `anon` and `authenticated` also hold broad table grants including TRUNCATE. Owner-email based authority is not safe until client writes to authority fields are protected.
- Existing `Org admins can update own org` uses `get_user_org_id()` OR JWT email. The helper's legacy authority sources need review; leaving this policy alongside another permissive policy does not restrict access.
- `public.team_transfer_permissions` does not exist in production. The new per-team controls cannot be claimed operational yet.
- Mobile `AccountScreen.tsx` currently writes `organizations.admin_email`. Protecting that column requires coordinating the email-change flow; ordinary organization profile edits must continue to work.
- `amatora-superadmin/src/app/organizations/page.tsx` creates/edits organizations and changes admin Auth identity. Preserve this distinct ecosystem authority when restricting organization-admin access.

## Next bounded change

Inventory organization profile update columns and superadmin provisioning. Prepare and test scoped RLS/column grants plus a reviewed server path for authority/email changes. Then validate four-client compatibility before applying permission drafts. Do not disable RLS, add an organization admin to `admin_users`, or restore an organization-1 fallback.

No synthetic production records were created; no cleanup against real data is required for this audit.
