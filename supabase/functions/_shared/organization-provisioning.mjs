import { authorizeGlobalAdmin } from './admin-authorization.mjs';

export class ProvisioningError extends Error {
  constructor(code) { super(code); this.name = 'ProvisioningError'; this.code = code; }
}

// Server-only orchestration. Store MUST implement the durable, atomic contract
// documented in security/ADMIN-AUTHORIZATION-STAGE.md before any endpoint uses it.
export async function provisionOrganization({ authorization, authClient, adminClient, store, input }) {
  const actor = await authorizeGlobalAdmin({ authorization, authClient, adminClient });
  if (!input || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId || '')
    || typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.trim().length > 120
    || typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    || typeof input.slug !== 'string' || input.slug.length > 80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug)
    || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128
    || (input.logoUrl != null && (typeof input.logoUrl !== 'string' || input.logoUrl.length > 2048 || !/^https:\/\//.test(input.logoUrl)))) {
    throw new ProvisioningError('INVALID_INPUT');
  }
  const payload = { name: input.name.trim(), email: input.email.trim().toLowerCase(), slug: input.slug, logoUrl: input.logoUrl ?? null };
  let claim;
  try { claim = await store.claim({ actorId: actor.userId, requestId: input.requestId, payload }); }
  catch { throw new ProvisioningError('PROVISIONING_UNAVAILABLE'); }
  if (claim.state === 'complete') return { organizationId: claim.organizationId };
  if (!['new', 'auth_created'].includes(claim.state) || !claim.lease) {
    throw new ProvisioningError('PROVISIONING_REQUIRES_REVIEW');
  }
  let userId = claim.userId;
  try {
    if (claim.state === 'new') {
      // Persist BEFORE the external call. A crash/timeout leaves auth_creating;
      // subsequent requests must not repeat createUser or adopt by email.
      await store.markAuthCreating(claim.lease);
      const result = await adminClient.auth.admin.createUser({ email: payload.email, password: input.password, email_confirm: true });
      if (result.error || !result.data?.user?.id) throw new Error('Auth creation uncertain');
      userId = result.data.user.id;
      await store.markAuthCreated(claim.lease, userId);
    }
    if (!userId) throw new Error('Missing persisted identity');
    const result = await adminClient.rpc('provision_organization', {
      p_user_id: userId, p_email: payload.email, p_name: payload.name, p_slug: payload.slug, p_logo_url: payload.logoUrl,
    });
    if (result.error || !Number.isSafeInteger(Number(result.data)) || Number(result.data) <= 0) throw new Error('Provisioning failed');
    const organizationId = Number(result.data);
    await store.complete(claim.lease, organizationId);
    return { organizationId };
  } catch {
    // Never delete a customer record, log credentials or blindly recreate Auth.
    throw new ProvisioningError('PROVISIONING_REQUIRES_REVIEW');
  }
}
