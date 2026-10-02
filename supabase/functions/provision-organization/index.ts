import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createProvisioningHandler } from '../_shared/provisioning-http.mjs';
import { provisionOrganization } from '../_shared/organization-provisioning.mjs';
import { createProvisioningStore } from '../_shared/provisioning-store.mjs';

const options = { auth: { persistSession:false, autoRefreshToken:false } };
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, options);
const store = createProvisioningStore(admin);
Deno.serve(createProvisioningHandler({
  // Enable only after protected authority, draft SQL and hosted tests are ready.
  enabled: Deno.env.get('ENABLE_ORGANIZATION_PROVISIONING') === 'true',
  allowedOrigins: (Deno.env.get('ADMIN_PROVISIONING_ORIGINS') || '').split(',').map(s=>s.trim()).filter(Boolean),
  run: args => provisionOrganization({...args,authClient:auth,adminClient:admin,store}),
  consumeRate: async actorId => {
    const {data,error}=await admin.rpc('consume_organization_provisioning_rate',{p_actor:actorId});
    if(error) throw new Error('RATE_LIMIT_UNAVAILABLE');
    return data;
  },
}));
