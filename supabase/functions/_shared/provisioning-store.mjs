// Pass only a backend service client; never a browser or user-token client.
export function createProvisioningStore(adminClient) {
  const rpc = async (name, args) => {
    const result = await adminClient.rpc(name, args);
    if (result.error) throw new Error('PROVISIONING_STORE_UNAVAILABLE');
    return result.data;
  };
  return {
    claim: ({ actorId, requestId, payload }) => rpc('claim_organization_provisioning', {
      p_actor: actorId, p_request: requestId, p_payload: payload,
    }),
    markAuthCreating: lease => rpc('advance_organization_provisioning', { p_lease: lease, p_phase: 'auth_creating' }),
    markAuthCreated: (lease, userId) => rpc('advance_organization_provisioning', { p_lease: lease, p_phase: 'auth_created', p_user: userId }),
    complete: (lease, organizationId) => rpc('advance_organization_provisioning', { p_lease: lease, p_phase: 'complete', p_org: organizationId }),
  };
}
