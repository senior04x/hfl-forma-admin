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
async function verifiedAdminIdentity({ authorization, authClient, adminClient }) {
  const fail = (status, code) => { throw new AdminAuthorizationError(status, code); };
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
  if (!admin || admin.id !== userId) fail(403, 'ADMIN_ACCESS_DENIED');
  return { userId, admin };
}

export async function authorizeOrganizationAdmin({ organizationId, ...clients }) {
  if (typeof organizationId !== 'number' || !Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new AdminAuthorizationError(400, 'INVALID_ORGANIZATION');
  }
  const { userId, admin } = await verifiedAdminIdentity(clients);
  if (!['org_admin', 'super_admin'].includes(admin.role)
    || Number(admin.organization_id) !== organizationId) throw new AdminAuthorizationError(403, 'ADMIN_ACCESS_DENIED');
  // This gate is deliberately organization-scoped, including for super admins.
  return { userId, organizationId, role: admin.role };
}

// Only for explicitly global provisioning operations. Never use this as a
// replacement for the organization-scoped gate on customer data endpoints.
export async function authorizeGlobalAdmin(clients) {
  const { userId, admin } = await verifiedAdminIdentity(clients);
  if (admin.role !== 'super_admin') throw new AdminAuthorizationError(403, 'ADMIN_ACCESS_DENIED');
  return { userId, role: 'super_admin' };
}
