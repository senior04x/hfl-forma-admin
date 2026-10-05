import { tokenHash } from './team-transfer-http.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createCaptainRosterHandler(rpc){return async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
 try{
  const token=req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/i);
  if(!token)return reply(401,{error:'Session required'});
  const raw=await req.text();if(raw.length>1024)return reply(413,{error:'Invalid request'});
  let body;try{body=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request'});}
  if(!body||!uuid.test(body.team_id||'')||!['context','archive','number'].includes(body.action)
   ||(body.action!=='context'&&!uuid.test(body.player_id||''))
   ||(body.action==='number'&&(!Number.isInteger(body.number)||body.number<1||body.number>99)))return reply(400,{error:'Invalid request'});
  const {data,error}=await rpc('captain_roster_manage',{p_token_hash:await tokenHash(token[1]),p_team_id:body.team_id,p_player_id:body.action==='context'?null:body.player_id,p_action:body.action,p_number:body.action==='number'?body.number:null});
  if(error||!data||![200,400,401,403,409,429].includes(data.status))return reply(500,{error:'Request failed'});
  const {status,...result}=data;return reply(status,result);
 }catch{return reply(500,{error:'Request failed'});}
};}
