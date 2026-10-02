import { AdminAuthorizationError } from './admin-authorization.mjs';
import { ProvisioningError } from './organization-provisioning.mjs';

export function createProvisioningHandler({ enabled, allowedOrigins, run, consumeRate,
  inputFields = ['requestId','name','email','slug','password','logoUrl'], successCode = 'PROVISIONED' }) {
  const origins = new Set(allowedOrigins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin',
      ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin':origin } : {}) };
    const reply = (status, code, data={}) => new Response(JSON.stringify({code,...data}), {status,headers});
    if (origin && !origins.has(origin)) return reply(403,'ORIGIN_DENIED');
    if (!enabled) return reply(503,'PROVISIONING_DISABLED');
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,
      'Access-Control-Allow-Methods':'POST', 'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info'}});
    if (request.method !== 'POST') return reply(405,'METHOD_NOT_ALLOWED');
    if (!/^Bearer [^\s]+$/i.test(request.headers.get('authorization') || '')) return reply(401,'AUTH_REQUIRED');
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415,'JSON_REQUIRED');
    let input;
    try {
      // Stream bound, not just Content-Length: no unbounded body buffering.
      const reader=request.body?.getReader();
      if (!reader) return reply(400,'INVALID_INPUT');
      const chunks=[];let size=0;
      try {
        for (;;) {
          const {done,value}=await reader.read();if(done) break;
          size+=value.byteLength;
          if(size>8192) {await reader.cancel();return reply(413,'BODY_TOO_LARGE');}
          chunks.push(value);
        }
      } finally {reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
      input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      const fields=new Set(inputFields);
      if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!fields.has(key))) return reply(400,'INVALID_INPUT');
    } catch {return reply(400,'INVALID_INPUT');}
    try {
      const result=await run({authorization:request.headers.get('authorization'),input,
        beforeProvisioning:async actorId=>{
          let allowed;
          try {allowed=await consumeRate(actorId);} catch {throw new ProvisioningError('RATE_LIMIT_UNAVAILABLE');}
          if(allowed!==true) throw new ProvisioningError('RATE_LIMITED');
        }});
      return reply(200,successCode,result);
    } catch(error) {
      if(error instanceof AdminAuthorizationError) return reply(error.status,error.code);
      const statuses={INVALID_INPUT:400,RATE_LIMITED:429,RATE_LIMIT_UNAVAILABLE:503,
        PROVISIONING_REQUIRES_REVIEW:409,PROVISIONING_UNAVAILABLE:503};
      if(error instanceof ProvisioningError && statuses[error.code]) return reply(statuses[error.code],error.code);
      return reply(503,'PROVISIONING_UNAVAILABLE');
    }
  };
}
