// Server-only prerequisites: organizations.admin_email must be protected for
// organization authority; admin_users must be protected for global authority.
// Pass dedicated clients; never forward request Authorization to the service client.
export class AdminAuthorizationError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'AdminAuthorizationError';
    this.status = status;
    this.code = code;
  }
}
async function verifiedIdentity({ authorization, authClient }) {
  const fail = (status, code) => { throw new AdminAuthorizationError(status, code); };
  if (typeof authorization !== 'string' || authorization.length > 8192) fail(401, 'AUTH_REQUIRED');
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) fail(401, 'AUTH_REQUIRED');
  let identity;
  try { identity = await authClient.auth.getUser(match[1]); }
  catch { fail(503, 'AUTH_UNAVAILABLE'); }
  if (identity.error || !identity.data?.user?.id) fail(401, 'AUTH_REQUIRED');
  return identity.data.user;
}
async function verifiedAdminIdentity(clients) {
  const fail = (status, code) => { throw new AdminAuthorizationError(status, code); };
  const user = await verifiedIdentity(clients);
  const userId = user.id;
  const { adminClient } = clients;
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
  const user = await verifiedIdentity(clients);
  if (!user.email || !user.email_confirmed_at) throw new AdminAuthorizationError(403, 'ADMIN_ACCESS_DENIED');
  const email = user.email.trim().toLowerCase();
  let result;
  try {
    result = await clients.adminClient.from('organizations').select('id,admin_email')
      .ilike('admin_email', email.replace(/[\\%_]/g, character => '\\' + character)).limit(2);
  } catch { throw new AdminAuthorizationError(503, 'AUTH_UNAVAILABLE'); }
  if (result.error) throw new AdminAuthorizationError(503, 'AUTH_UNAVAILABLE');
  const rows = result.data;
  if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0].id) !== organizationId
    || typeof rows[0].admin_email !== 'string' || rows[0].admin_email.toLowerCase() !== email) {
    throw new AdminAuthorizationError(403, 'ADMIN_ACCESS_DENIED');
  }
  return { userId: user.id, organizationId, role: 'org_admin' };
}

// Only for explicitly global provisioning operations. Never use this as a
// replacement for the organization-scoped gate on customer data endpoints.
export async function authorizeGlobalAdmin(clients) {
  const { userId, admin } = await verifiedAdminIdentity(clients);
  if (admin.role !== 'super_admin') throw new AdminAuthorizationError(403, 'ADMIN_ACCESS_DENIED');
  return { userId, role: 'super_admin' };
}
