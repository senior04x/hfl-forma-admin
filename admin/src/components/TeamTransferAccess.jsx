import React,{useState,useEffect,useRef} from 'react';
import {supabase} from '../supabaseClient';
import {loadTeamTransferAccess,saveTeamTransferAccess} from '../utils/teamTransferAccess.mjs';
import './TeamTransferAccess.css';
export default function TeamTransferAccess({orgId,windowOpen=false,windowBusy=false}) {
 const [open,setOpen]=useState(false),[league,setLeague]=useState(''),[cursor,setCursor]=useState(null);
 const [items,setItems]=useState([]),[leagues,setLeagues]=useState([]),[more,setMore]=useState(false);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(new Set());
 const [retry,setRetry]=useState(0);
 const [query,setQuery]=useState(''),[search,setSearch]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query.trim());setCursor(null);},400);return()=>clearTimeout(timer);},[query]);
 const version=useRef(0),operations=useRef(new Set());
 useEffect(()=>{setOpen(false);setLeague('');setQuery('');setSearch('');setCursor(null);setItems([]);setLeagues([]);setError('');},[orgId]);
 useEffect(()=>{
  const current=++version.current;
  if(!open) return;
  if(search.length===1){setItems([]);setMore(false);setLoading(false);setError('');return;}
  setLoading(true);setError('');
  loadTeamTransferAccess(supabase,orgId,league,cursor,search).then(result=>{
   if(current!==version.current)return;
   setItems(result.items);setMore(result.hasMore);
   if(Array.isArray(result.leagues))setLeagues(result.leagues);
  }).catch(error=>{if(current===version.current){setItems([]);setMore(false);setError(error.message==='TEAM_ACCESS_NOT_INSTALLED'?'Jamoaviy transfer ruxsatlari serverda hali o‘rnatilmagan. Server yangilanishi kerak.':'Jamoalar yuklanmadi. Qayta urinib ko‘ring.');}})
   .finally(()=>{if(current===version.current)setLoading(false);});
  return ()=>{version.current++;};
 },[open,orgId,league,cursor,retry,windowOpen,windowBusy,search]);
 const setLeagueAccess=async allowed=>{
  if(!league||!windowOpen||windowBusy||operations.current.size)return;
  const current=version.current;operations.current.add('league');setBusy(new Set(operations.current));setError('');
  try{
   const {data,error}=await supabase.rpc('admin_set_league_transfer_access',{p_org:orgId,p_league:league,p_allowed:allowed});
   if(error||!Number.isInteger(data))throw new Error('SAVE_FAILED');
   if(current===version.current){setCursor(null);setRetry(value=>value+1);}
  }catch{if(current===version.current)setError('Liga ruxsati saqlanmadi. Qayta urinib ko‘ring.');}
  finally{operations.current.delete('league');setBusy(new Set(operations.current));}
 };
 const toggle=async team=>{
  const key=`${orgId}:${team.id}`;if(!windowOpen||windowBusy||operations.current.has('league')||operations.current.has(key))return;
  const current=version.current,value=!team.allowed;
  operations.current.add(key);setBusy(new Set(operations.current));setError('');
  setItems(rows=>rows.map(row=>row.id===team.id?{...row,allowed:value}:row));
  try{await saveTeamTransferAccess(supabase,orgId,team.id,value);}
  catch{if(current===version.current){setItems(rows=>rows.map(row=>row.id===team.id?{...row,allowed:team.allowed}:row));setError('Ruxsat saqlanmadi. Oldingi holat qaytarildi.');}}
  finally{operations.current.delete(key);setBusy(new Set(operations.current));}
 };
 return <section className="team-transfer-access">
  <button className="tta-heading" type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
   <span>Jamoalarga alohida ruxsat</span><span aria-hidden="true">{open?'−':'+'}</span>
  </button>
  {open&&<div className="tta-body">
   <p>Umumiy oyna ochilganda barcha jamoalar ochiladi, yopilganda hammasi yopiladi. Keyin liga yoki jamoa ruxsatini alohida o‘zgartiring.</p>
   {!windowOpen&&<p>Ruxsat berish uchun avval umumiy transfer oynasini oching.</p>}
   <label>Jamoa qidirish <input type="search" placeholder="Jamoa nomini kiriting…" value={query} maxLength={80} disabled={busy.size>0} onChange={e=>setQuery(e.target.value)}/></label>
   {query.trim().length===1&&<p>Kamida 2 ta belgi kiriting.</p>}
   <label>Liga <select value={league} disabled={busy.size>0} onChange={e=>{setLeague(e.target.value);setCursor(null);}}>
    <option value="">Barcha ligalar</option>{leagues.map(name=><option key={name} value={name}>{name}</option>)}
   </select></label>
   {!!league&&<div className="tta-pages">
    <button type="button" disabled={!windowOpen||windowBusy||loading||busy.size>0} onClick={()=>setLeagueAccess(true)}>Ligani ochish</button>
    <button type="button" disabled={!windowOpen||windowBusy||loading||busy.size>0} onClick={()=>setLeagueAccess(false)}>Ligani yopish</button>
   </div>}
   {error&&<div role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Qayta urinish</button></div>}
   {loading?<p role="status">Yuklanmoqda…</p>:items.length===0&&!error&&search.length!==1?<p>Jamoalar topilmadi.</p>:items.map(team=><div className="tta-row" key={team.id}>
    <div><strong>{team.name}</strong><small>{team.league||'Liga ko‘rsatilmagan'}</small></div>
    <button type="button" role="switch" aria-checked={windowOpen&&team.allowed} aria-label={`${team.name}: o‘yinchi olishga ruxsat`}
     disabled={!windowOpen||windowBusy||busy.has('league')||busy.has(`${orgId}:${team.id}`)} className={`tta-switch ${windowOpen&&team.allowed?'on':''}`} onClick={()=>toggle(team)}><span/></button>
   </div>)}
   <div className="tta-pages">
    {cursor&&<button type="button" disabled={busy.size>0||loading} onClick={()=>setCursor(null)}>Boshiga</button>}
    {more&&!loading&&<button type="button" disabled={busy.size>0} onClick={()=>setCursor(items.at(-1)?.id??null)}>Keyingi jamoalar</button>}
   </div>
  </div>}
 </section>;
}
