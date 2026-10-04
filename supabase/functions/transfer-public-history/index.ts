import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createTransferPublicHistoryHandler } from '../_shared/transfer-public-history-http.mjs';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createTransferPublicHistoryHandler((name: string, params: Record<string, unknown>) => admin.rpc(name, params)));
