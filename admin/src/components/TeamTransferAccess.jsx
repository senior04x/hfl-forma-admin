import React,{useState,useEffect,useRef} from 'react';
import {supabase} from '../supabaseClient';
import {loadTeamTransferAccess,saveTeamTransferAccess} from '../utils/teamTransferAccess.mjs';
import './TeamTransferAccess.css';
export default function TeamTransferAccess({orgId}) {
 const [open,setOpen]=useState(false),[league,setLeague]=useState(''),[cursor,setCursor]=useState(null);
 const [items,setItems]=useState([]),[leagues,setLeagues]=useState([]),[more,setMore]=useState(false);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(new Set());
 const [retry,setRetry]=useState(0);
 const version=useRef(0),operations=useRef(new Set());
 useEffect(()=>{setOpen(false);setLeague('');setCursor(null);setItems([]);setLeagues([]);setError('');},[orgId]);
 useEffect(()=>{
  const current=++version.current;
  if(!open) return;
  setLoading(true);setError('');
  loadTeamTransferAccess(supabase,orgId,league,cursor).then(result=>{
   if(current!==version.current)return;
   setItems(result.items);setMore(result.hasMore);
   if(Array.isArray(result.leagues))setLeagues(result.leagues);
  }).catch(error=>{if(current===version.current){setItems([]);setMore(false);setError(error.message==='TEAM_ACCESS_NOT_INSTALLED'?'Jamoaviy transfer ruxsatlari serverda hali o‘rnatilmagan. Server yangilanishi kerak.':'Jamoalar yuklanmadi. Qayta urinib ko‘ring.');}})
   .finally(()=>{if(current===version.current)setLoading(false);});
  return ()=>{version.current++;};
 },[open,orgId,league,cursor,retry]);
 const toggle=async team=>{
  const key=`${orgId}:${team.id}`;if(operations.current.has(key))return;
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
   <p>Faqat o‘yinchi olishga ruxsat. Umumiy transfer oynasi ham ochiq bo‘lishi kerak.</p>
   <label>Liga <select value={league} disabled={busy.size>0} onChange={e=>{setLeague(e.target.value);setCursor(null);}}>
    <option value="">Barcha ligalar</option>{leagues.map(name=><option key={name} value={name}>{name}</option>)}
   </select></label>
   {error&&<div role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Qayta urinish</button></div>}
   {loading?<p role="status">Yuklanmoqda…</p>:items.length===0&&!error?<p>Jamoalar topilmadi.</p>:items.map(team=><div className="tta-row" key={team.id}>
    <div><strong>{team.name}</strong><small>{team.league||'Liga ko‘rsatilmagan'}</small></div>
    <button type="button" role="switch" aria-checked={team.allowed} aria-label={`${team.name}: o‘yinchi olishga ruxsat`}
     disabled={busy.has(`${orgId}:${team.id}`)} className={`tta-switch ${team.allowed?'on':''}`} onClick={()=>toggle(team)}><span/></button>
   </div>)}
   <div className="tta-pages">
    {cursor&&<button type="button" disabled={busy.size>0||loading} onClick={()=>setCursor(null)}>Boshiga</button>}
    {more&&!loading&&<button type="button" disabled={busy.size>0} onClick={()=>setCursor(items.at(-1)?.id??null)}>Keyingi jamoalar</button>}
   </div>
  </div>}
 </section>;
}
