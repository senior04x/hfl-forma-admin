// Server-only prerequisite: admin_users must be protected from client writes.
// Pass dedicated clients; never forward request Authorization to the service client.
export class AdminAuthorizationError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'AdminAuthorizationError';
    this.status = status;
    this.code = code;
  }
}
export async function authorizeOrganizationAdmin({ authorization, organizationId, authClient, adminClient }) {
  const fail = (status, code) => { throw new AdminAuthorizationError(status, code); };
  if (typeof organizationId !== 'number' || !Number.isSafeInteger(organizationId) || organizationId <= 0) {
    fail(400, 'INVALID_ORGANIZATION');
  }
  if (typeof authorization !== 'string' || authorization.length > 8192) fail(401, 'AUTH_REQUIRED');
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) fail(401, 'AUTH_REQUIRED');
  let identity;
  try { identity = await authClient.auth.getUser(match[1]); }
  catch { fail(503, 'AUTH_UNAVAILABLE'); }
  if (identity.error || !identity.data?.user?.id) fail(401, 'AUTH_REQUIRED');
  const userId = identity.data.user.id;
  let membership;
  try {
    membership = await adminClient.from('admin_users')
      .select('id,role,organization_id').eq('id', userId).maybeSingle();
  } catch { fail(503, 'AUTH_UNAVAILABLE'); }
  if (membership.error) fail(503, 'AUTH_UNAVAILABLE');
  const admin = membership.data;
  if (!admin || admin.id !== userId || !['org_admin', 'super_admin'].includes(admin.role)
    || Number(admin.organization_id) !== organizationId) fail(403, 'ADMIN_ACCESS_DENIED');
  // This gate is deliberately organization-scoped, including for super admins.
  return { userId, organizationId, role: admin.role };
}
