import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createTransferApi} from '../js/transfer-api.mjs';

const api=createTransferApi();
const destination=()=>/\/transfers(?:\.html)?$/.test(location.pathname)?'transfers':'kabinet';
const name=p=>[p.first_name,p.last_name].filter(Boolean).join(' ') || 'Ismi ko‘rsatilmagan';
const errorText=e=>e.status===401?'Kod noto‘g‘ri yoki sessiya muddati tugagan.':e.status===429?'Urinishlar ko‘p. Botdan yangi kod oling.':e.status===409?'Bu o‘yinchi bo‘yicha ariza mavjud.':e.status===403?'Transferga ruxsat berilmagan. Tashkilotchi bilan bog‘laning.':'Aloqa uzildi. Qayta urinib ko‘ring.';
function Avatar({player}) {
  const [failed,setFailed]=useState(false);
  return player.photo_url&&!failed?<img className="player-avatar photo" src={player.photo_url} alt={name(player)} loading="lazy" onError={()=>setFailed(true)}/>:<span className="player-avatar">{name(player).slice(0,1)}</span>;
}
function Modal({children,onClose,busy=false}) {
  const ref=useRef(null);
  useEffect(()=>{ref.current.showModal(); return()=>ref.current?.close();},[]);
  return <dialog ref={ref} aria-label="Transfer tafsilotlari" onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{if(e.target===ref.current&&!busy)onClose();}}>{children}</dialog>;
}
function Login({onAuthenticated}) {
  const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[step,setStep]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[teams,setTeams]=useState([]),[team,setTeam]=useState(''),[bot,setBot]=useState(''),[sent,setSent]=useState('');
  async function submit(e) {
    e.preventDefault();if(busy)return;setError('');
    const digits=phone.replace(/\D/g,'');
    if(!(digits.length===9 || (digits.length===12&&digits.startsWith('998')))){setError('Telefon raqamini to‘g‘ri kiriting.');return;}
    setBusy(true);
    try {
      if(!step){const data=await api.requestCode(phone);setStep(true);setSent(data.isAutoSentToTelegram?'Kod Telegramga yuborildi.':'Telegram botni ochib, tasdiqlash kodini oling.');setBot(!data.isAutoSentToTelegram&&/^https:\/\/t\.me\/amatora_bot(?:\?|$)/.test(data.botUrl||'')?data.botUrl:'');}
      else {await api.login(phone,code,team||null);onAuthenticated();}
    } catch(e) {
      if(!step&&e.status===429){setStep(true);setSent('Oldin yuborilgan tasdiqlash kodini kiriting.');}
      else if(e.status===409&&Array.isArray(e.data?.teams)){setTeams(e.data.teams);setTeam(e.data.teams[0]?.id||'');setError('Jamoangizni tanlang.');}
      else setError(errorText(e));
    } finally {setBusy(false);}
  }
  return <div className="login-shell"><div className="intro"><p className="eyebrow">JAMOA KABINETI</p><h1>Jamoangiz bilan<br/>bir qadam oldinda.</h1><p>Telefon raqamingizni bir marta tasdiqlang. Kabinet va transferlar uchun qayta kirish talab qilinmaydi.</p></div><section className="panel login-card"><h2>{step?'Tasdiqlash kodi':'Kabinetga kirish'}</h2><form onSubmit={submit} aria-busy={busy}>
    {!step?<><label htmlFor="phone">Telefon raqami</label><input id="phone" type="tel" autoComplete="tel" placeholder="+998 90 123 45 67" maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)} required disabled={busy}/></>:<><p className="muted">{phone} · {sent}</p>{bot&&<a className="button telegram" href={bot} target="_blank" rel="noopener noreferrer">Telegram botni ochish ↗</a>}<label htmlFor="otp">Tasdiqlash kodi</label><input id="otp" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={8} pattern="[0-9]{4,8}" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} required disabled={busy}/>{teams.length>0&&<><label htmlFor="team">Jamoa</label><select id="team" value={team} disabled={busy} onChange={e=>setTeam(e.target.value)}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></>}</>}
    {error&&<p role="alert" className="error-text">{error}</p>}<button className="button primary login-action" disabled={busy}>{busy?(step?'Kirilmoqda…':'Kod yuborilmoqda…'):step?'Kirish →':'Tasdiqlash kodini olish →'}</button>{step&&<button type="button" className="button quiet login-action" disabled={busy} onClick={()=>{setStep(false);setCode('');setTeams([]);setTeam('');setError('');}}>Raqamni o‘zgartirish</button>}
  </form><p className="muted">Jamoangiz hali ro‘yxatdan o‘tmaganmi? <a href="/apply.html">Ro‘yxatdan o‘tish ↗</a></p></section></div>;
}
function Transfers({context,refreshContext,onExpired}) {
  const [tab,setTab]=useState('players'),[query,setQuery]=useState(''),[players,setPlayers]=useState([]),[items,setItems]=useState([]),[playerCursor,setPlayerCursor]=useState(null),[historyCursor,setHistoryCursor]=useState(null),[loading,setLoading]=useState(false),[historyLoading,setHistoryLoading]=useState(false),[historyLoaded,setHistoryLoaded]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(null),[payment,setPayment]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[modalError,setModalError]=useState(''),[notice,setNotice]=useState('');
  const searchVersion=useRef(0),historyVersion=useRef(0),abort=useRef(null),queryRef=useRef(query);queryRef.current=query;
  function fail(e){if(e.name==='AbortError')return;if(e.status===401)onExpired();else setError(errorText(e));}
  async function search(more=false) {
    abort.current?.abort();const controller=new AbortController();abort.current=controller;const version=++searchVersion.current;
    const q=queryRef.current.trim();if(q.length===1){setPlayers([]);setPlayerCursor(null);setLoading(false);return;}
    setLoading(true);setError('');
    try {const data=await api.page('players',{query:q,after:more?playerCursor:null,signal:controller.signal});if(version!==searchVersion.current)return;setPlayers(old=>more?[...old,...data.items]:data.items);setPlayerCursor(data.next_cursor);}
    catch(e){if(version===searchVersion.current)fail(e);}finally{if(version===searchVersion.current)setLoading(false);}
  }
  async function history(more=false) {
    const version=++historyVersion.current;setHistoryLoading(true);setError('');
    try{const data=await api.page('history',{after:more?historyCursor:null});if(version!==historyVersion.current)return;setItems(old=>more?[...old,...data.items]:data.items);setHistoryCursor(data.next_cursor);setHistoryLoaded(true);}
    catch(e){if(version===historyVersion.current)fail(e);}finally{if(version===historyVersion.current)setHistoryLoading(false);}
  }
  useEffect(()=>{searchVersion.current++;abort.current?.abort();setPlayerCursor(null);const timer=setTimeout(()=>void search(),query?350:0);return()=>{clearTimeout(timer);abort.current?.abort();};},[query]);
  useEffect(()=>{if(tab==='history'&&!historyLoaded)void history();},[tab,historyLoaded]);
  useEffect(()=>()=>{searchVersion.current++;historyVersion.current++;abort.current?.abort();},[]);
  function choose(p){if(p.has_pending)return;if(!context.transfer_window_open){setError('Transfer oynasi yopiq. Tashkilotchi bilan bog‘laning.');return;}if(context.team_transfer_allowed===false){setPayment(true);return;}setSelected(p);setReason('');setModalError('');}
  async function send(e){e.preventDefault();if(busy||!selected||!reason.trim())return;setBusy(true);setModalError('');
    try{const fresh=await refreshContext();if(!fresh.transfer_window_open){setModalError('Transfer oynasi yopiq. Ariza yuborilmadi.');return;}if(fresh.team_transfer_allowed===false){setSelected(null);setPayment(true);return;}await api.request(selected.id,reason);setSelected(null);setNotice('Ariza yuborildi. Natijani “Arizalarim” bo‘limida kuzating.');setHistoryLoaded(false);setTab('history');void search();}
    catch(e){if(e.status===401)onExpired();else if(e.data?.code==='TEAM_TRANSFER_PAYMENT_REQUIRED'){setSelected(null);setPayment(true);}else setModalError(errorText(e));}finally{setBusy(false);}}
  const phone=(context.organization_contact_phone||'').trim(),dial=phone.replace(/[\s().-]/g,'');
  return <><div className="intro"><h1>Transferlar</h1><p>O‘yinchini tanlang va transfer arizasini yuboring.</p></div><div className="panel team-bar"><div><p className="eyebrow">SIZNING JAMOANGIZ</p><h2>{context.team.name}</h2></div><span className={`badge ${context.transfer_window_open?'':'closed'}`}>{context.transfer_window_open?'Transfer oynasi ochiq':'Transfer oynasi yopiq'}</span></div>
    {notice&&<p role="status" className="notice">{notice}</p>}{error&&<p role="alert" className="notice error">{error}</p>}
    <div className="transfer-tabs" aria-label="Transfer bo‘limlari">{[['players','O‘yinchi qidirish'],['history','Arizalarim']].map(([id,label])=><button key={id} className="transfer-tab" aria-pressed={tab===id} aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
    <section className="panel" hidden={tab!=='players'}><label htmlFor="player-query">Ism yoki familiya</label><input id="player-query" type="search" maxLength={80} placeholder="Bazadan o‘yinchi qidirish…" value={query} onChange={e=>setQuery(e.target.value)}/><p className="muted" role="status">{loading?'Qidirilmoqda…':query.trim().length===1?'Kamida 2 ta harf kiriting.':players.length?`${players.length} ta o‘yinchi`:'Mos o‘yinchi topilmadi.'}</p><ul className="list">{players.map(p=><li key={p.id} className="player-row"><div className="person"><Avatar player={p}/><div className="player-info"><strong>{name(p)}</strong><p>{[p.team_name,p.player_number!=null?`#${p.player_number}`:'',p.position].filter(Boolean).join(' · ')}</p></div></div><button className="button quiet" disabled={loading||p.has_pending} onClick={()=>choose(p)}>{p.has_pending?'Ariza mavjud':'Tanlash'}</button></li>)}</ul>{playerCursor&&<button className="button quiet" disabled={loading} onClick={()=>void search(true)}>Yana ko‘rsatish</button>}{error&&<button className="button quiet" disabled={loading} onClick={()=>void search()}>Qayta urinish</button>}</section>
    <section className="panel" hidden={tab!=='history'}><div className="history-toolbar"><h2>Yuborilgan arizalar</h2><button className="button quiet" disabled={historyLoading} onClick={()=>void history()}>↻ Yangilash</button></div><p className="muted" role="status">{historyLoading?'Yuklanmoqda…':!items.length?'Hozircha ariza yuborilmagan.':''}</p><ul className="list">{items.map((item,index)=><li key={item.id||index}><details><summary className="history-top"><span className="history-info"><strong>{item.player_name}</strong><span className="history-meta">{item.old_team_name||'—'} · {new Date(item.created_at).toLocaleDateString('uz-UZ')}</span></span><span className="badge">{{pending:'Kutilmoqda',approved:'Tasdiqlangan',rejected:'Rad etilgan',cancelled:'Bekor qilingan'}[item.status]||'Holat noma’lum'}</span></summary><p className="history-reason">{item.reason}</p></details></li>)}</ul>{historyCursor&&<button className="button quiet" disabled={historyLoading} onClick={()=>void history(true)}>Oldingi arizalar</button>}</section>
    {selected&&<Modal busy={busy} onClose={()=>setSelected(null)}><form onSubmit={send} aria-busy={busy}><p className="eyebrow">YANGI TRANSFER ARIZASI</p><div className="request-player"><Avatar player={selected}/><div><h2>{name(selected)}</h2><p className="muted">{[selected.team_name,selected.player_number!=null?`#${selected.player_number}`:'',selected.position].filter(Boolean).join(' · ')}</p></div></div><label htmlFor="reason">Transfer sababi</label><textarea id="reason" rows={3} maxLength={1000} required value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="Nega bu o‘yinchini jamoangizga olmoqchisiz?"/><p className="safety-note">O‘yinchiga xabar boradi; transfer admin tasdiqlagach amalga oshadi.</p>{modalError&&<p className="error-text" role="alert">{modalError}</p>}<div className="dialog-actions"><button type="button" className="button quiet" disabled={busy} onClick={()=>setSelected(null)}>Bekor qilish</button><button className="button primary" disabled={busy}>{busy?'Yuborilmoqda…':'Ariza yuborish'}</button></div></form></Modal>}
    {payment&&<Modal onClose={()=>setPayment(false)}><p className="eyebrow">JAMOA TRANSFERI</p><h2>O‘yinchi olish cheklangan</h2><p className="muted">Siz to‘lovni qilmagansiz. Transferga ruxsat olish uchun tashkilotchi bilan bog‘laning.</p><p className="contact-phone">{phone||'Telefon ko‘rsatilmagan. Tashkilotchi bilan bog‘laning.'}</p><div className="dialog-actions"><button className="button quiet" onClick={()=>setPayment(false)}>Yopish</button>{/^\+?[0-9]{7,15}$/.test(dial)&&<a className="button primary" href={`tel:${dial}`}>Qo‘ng‘iroq qilish</a>}</div></Modal>}
  </>;
}
function App(){
  const [route,setRoute]=useState(destination),[phase,setPhase]=useState(api.hasSession()?'loading':'login'),[context,setContext]=useState(null),[error,setError]=useState('');const version=useRef(0);
  function navigate(next,replace=false){history[replace?'replaceState':'pushState']({},'',`/${next}`);setRoute(next);setError('');window.scrollTo(0,0);}
  async function restore(){const attempt=++version.current;setPhase('loading');setError('');try{const data=await api.page('context');if(attempt!==version.current)return;setContext(data);setPhase('ready');const next=new URLSearchParams(location.search).get('next');if(next&&/^\/transfers(?:\.html)?(?:\?|$)/.test(next))navigate('transfers',true);}catch(e){if(attempt!==version.current)return;if(e.status===401){setContext(null);setPhase('login');}else{setError(errorText(e));setPhase('retry');}}}
  useEffect(()=>{if(api.hasSession())void restore();const listener=()=>setRoute(destination());window.addEventListener('popstate',listener);return()=>{version.current++;window.removeEventListener('popstate',listener);};},[]);
  function link(e,next){if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(next);}
  async function refreshContext(){const data=await api.page('context');setContext(data);return data;}
  return <><header className="topbar"><a className="brand" href="/kabinet" onClick={e=>link(e,'kabinet')}>AMATORA<span>JAMOA KABINETI</span></a><nav className="page-nav"><a href="/kabinet" aria-current={route==='kabinet'?'page':undefined} onClick={e=>link(e,'kabinet')}>Kabinet</a><a href="/transfers" aria-current={route==='transfers'?'page':undefined} onClick={e=>link(e,'transfers')}>Transferlar</a></nav></header><main>
    {phase==='loading'?<section className="panel session-loading" role="status"><span className="loader"/>Kabinet yuklanmoqda…</section>:phase==='retry'?<section className="panel session-loading"><h2>Kabinetni yuklab bo‘lmadi</h2><p className="muted" role="alert">{error}</p><button className="button primary" onClick={()=>void restore()}>Qayta urinish</button></section>:phase==='login'?<Login onAuthenticated={()=>void restore()}/>:route==='transfers'?<Transfers context={context} refreshContext={refreshContext} onExpired={()=>{version.current++;setContext(null);setPhase('login');}}/>:<><div className="intro"><p className="eyebrow">JAMOA KABINETI</p><h1>{context.team.name}</h1><p>Jamoangiz uchun kerakli amallar bir joyda.</p></div><div className="panel team-bar"><strong>Transfer holati</strong><span className={`badge ${context.transfer_window_open?'':'closed'}`}>{context.transfer_window_open?'Ochiq':'Yopiq'}</span></div><div className="cabinet-actions"><a className="panel cabinet-action" href="/transfers" onClick={e=>link(e,'transfers')}><span className="eyebrow">01 · TRANSFERLAR</span><h2>O‘yinchi olish →</h2><p className="muted">O‘yinchi qidiring va yuborilgan arizalarni kuzating.</p></a><a className="panel cabinet-action" href={`/apply-individual.html?team=${encodeURIComponent(context.team.id)}`}><span className="eyebrow">02 · JAMOA TARKIBI</span><h2>O‘yinchi qo‘shish ↗</h2><p className="muted">Jamoangizga yangi o‘yinchini ro‘yxatdan o‘tkazing.</p></a></div><div className="account-footer"><button className="button quiet" onClick={()=>{version.current++;void api.logout().catch(()=>{});setContext(null);setPhase('login');navigate('kabinet',true);}}>Hisobdan chiqish</button></div></>}
  </main><footer>AMATORA · O‘yin davom etadi.</footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);
