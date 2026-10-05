import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createCaptainRosterHandler } from '../_shared/captain-roster-http.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createCaptainRosterHandler((name:string,params:Record<string,unknown>)=>admin.rpc(name,params)));
