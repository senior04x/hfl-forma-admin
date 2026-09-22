import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createTransferHandler } from '../_shared/team-transfer-http.mjs';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createTransferHandler('request', (name: string, params: Record<string, unknown>) => admin.rpc(name, params)));
