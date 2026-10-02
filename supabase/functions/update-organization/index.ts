import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {createProvisioningHandler} from '../_shared/provisioning-http.mjs';
import {updateOrganization} from '../_shared/organization-update.mjs';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,options);
type Details={name:string;slug:string;logoUrl?:string|null};
type Args={authorization:string;input:Details & {organizationId:number;expected:Details};beforeProvisioning:(id:string)=>Promise<void>};
Deno.serve(createProvisioningHandler({
 enabled:Deno.env.get('ENABLE_ORGANIZATION_PROVISIONING')==='true',
 allowedOrigins:(Deno.env.get('ADMIN_PROVISIONING_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean),
 inputFields:['organizationId','name','slug','logoUrl','expected'],successCode:'UPDATED',
 run:(args:Args)=>updateOrganization({...args,authClient:auth,adminClient:admin}),
 consumeRate:async(actorId:string)=>{
  const {data,error}=await admin.rpc('consume_organization_provisioning_rate',{p_actor:actorId});
  if(error) throw new Error('RATE_LIMIT_UNAVAILABLE');return data;
 },
}));
