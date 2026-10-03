export async function loadTeamTransferAccess(client,orgId,league=null,after=null,query='') {
 if(!Number.isSafeInteger(orgId)||orgId<=0) throw new Error('INVALID_ORGANIZATION');
 const {data,error}=await client.rpc('admin_team_transfer_access_page',{p_org:orgId,p_league:league||null,p_after:after,p_query:query});
 if(error?.code==='PGRST202'||error?.code==='42883') throw new Error('TEAM_ACCESS_NOT_INSTALLED');
 if(error || !Array.isArray(data?.items)) throw new Error('TEAM_ACCESS_UNAVAILABLE');
 return {items:data.items.slice(0,30),hasMore:data.items.length>30,leagues:data.leagues};
}
export async function saveTeamTransferAccess(client,orgId,teamId,allowed) {
 if(!Number.isSafeInteger(orgId)||orgId<=0||typeof allowed!=='boolean') throw new Error('INVALID_INPUT');
 const {data,error}=await client.rpc('admin_set_team_transfer_access',{p_org:orgId,p_team:teamId,p_allowed:allowed});
 if(error || data!==allowed) throw new Error('TEAM_ACCESS_NOT_SAVED');
}
