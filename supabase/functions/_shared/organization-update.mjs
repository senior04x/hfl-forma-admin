import {authorizeGlobalAdmin} from './admin-authorization.mjs';
import {ProvisioningError} from './organization-provisioning.mjs';
export async function updateOrganization({authorization,input,authClient,adminClient,beforeProvisioning}) {
 const actor=await authorizeGlobalAdmin({authorization,authClient,adminClient});
 const validDetails = value => value && typeof value.name==='string' && value.name.trim().length>0 && value.name.trim().length<=120
  && typeof value.slug==='string' && value.slug.length<=80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.slug)
  && (value.logoUrl==null || (typeof value.logoUrl==='string' && value.logoUrl.length<=2048 && /^https:\/\//.test(value.logoUrl)));
 if(!input || !Number.isSafeInteger(input.organizationId) || input.organizationId<=0
  || !validDetails(input) || !validDetails(input.expected)
  || Object.keys(input.expected).some(key=>!['name','slug','logoUrl'].includes(key))) throw new ProvisioningError('INVALID_INPUT');
 await beforeProvisioning(actor.userId);
 let result;
 try {result=await adminClient.rpc('update_organization_details',{
  p_id:input.organizationId,p_name:input.name.trim(),p_slug:input.slug,p_logo_url:input.logoUrl??null,
  p_expected:{name:input.expected.name,slug:input.expected.slug,logoUrl:input.expected.logoUrl??null},
 });} catch {throw new ProvisioningError('PROVISIONING_UNAVAILABLE');}
 if(result.error || result.data!==input.organizationId) throw new ProvisioningError('PROVISIONING_REQUIRES_REVIEW');
 return {organizationId:result.data};
}
