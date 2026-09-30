import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createTransferAppHandler } from '../_shared/transfer-app-http.mjs';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createTransferAppHandler('page', (name: string, params: Record<string, unknown>) => admin.rpc(name, params)));
