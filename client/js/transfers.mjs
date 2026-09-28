import { createTransferApi } from './transfer-api.mjs';
const api = createTransferApi();
const $ = id => document.getElementById(id);
const state = { active:false, epoch:0, windowOpen:false, selected:null, submitting:false,
    searchVersion:0, historyVersion:0, query:'', playersCursor:null, historyCursor:null, preview:null };
let searchAbort, debounce, expiryTimer;
const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
};
function notice(text, error = false) {
    $('notice').textContent = text; $('notice').hidden = !text;
    $('notice').classList.toggle('error', error);
}
function reset(message = '') {
    api.clear(); state.active=false; state.epoch++; state.searchVersion++; state.historyVersion++;
    state.selected=null; state.windowOpen=false; searchAbort?.abort(); clearTimeout(debounce); clearTimeout(expiryTimer);
    $('workspace').hidden=true;
    $('request-dialog').close(); $('reason').value=''; $('player-query').value='';
    $('players').replaceChildren(); $('history').replaceChildren();
    notice(message, Boolean(message));
    const next=`${location.pathname}${location.search}`;
    location.replace(`/kabinet.html?next=${encodeURIComponent(next)}`);
}
function errorText(error, login = false) {
    if (error.status === 0) return 'Aloqa uzildi. Natijani tekshirish uchun arizalar ro‘yxatini yangilang.';
    if (error.status === 401) return login ? 'Kod noto‘g‘ri yoki muddati tugagan. Qayta tekshiring.' : 'Sessiya tugadi. Telegram kodi bilan qayta kiring.';
    if (error.status === 429) return 'Urinishlar soni oshib ketdi. Telegram botdan yangi kod oling.';
    if (error.status === 403) return login ? 'Bu raqam tanlangan jamoa sardoriga tegishli emas.' : 'Transferga ruxsat yo‘q. Oyna holatini yangilang.';
    if (error.status === 409) return 'Bu o‘yinchi bo‘yicha kutilayotgan ariza bor. Ro‘yxatni yangilang.';
    if (error.status === 400) return 'Kiritilgan ma’lumotlarni tekshiring.';
    return 'Xizmat hozir javob bermadi. Birozdan keyin qayta urinib ko‘ring.';
}
function handleError(error, target) {
    if (error.name === 'AbortError') return;
    if (error.status === 401 && state.active) { reset(errorText(error)); return; }
    if (target) { target.textContent=errorText(error); target.hidden=false; }
    else notice(errorText(error),true);
}
async function context() {
    const epoch=state.epoch;
    const data=await api.page('context');
    if (!state.active || epoch!==state.epoch) return false;
    $('team-name').textContent=data.team.name;
    state.windowOpen=data.transfer_window_open===true;
    $('window-status').textContent=state.windowOpen ? '● Transfer oynasi ochiq' : '● Transfer oynasi yopiq';
    $('window-status').classList.toggle('closed',!state.windowOpen);
    for (const button of $('players').querySelectorAll('button')) button.disabled=!state.windowOpen || button.dataset.pending==='true';
    return state.windowOpen;
}
function avatar(player,className='player-avatar') {
    const name=[player.first_name,player.last_name].filter(Boolean).join(' '), initials=(player.first_name?.[0]||'')+(player.last_name?.[0]||'');
    const node=player.photo_url ? document.createElement('img') : el('span',initials,className);
    if(player.photo_url){node.className=`${className} photo`;node.src=player.photo_url;node.alt=`${name} rasmi`;node.loading='lazy';
        node.addEventListener('error',()=>node.replaceWith(el('span',initials,className)),{once:true});}
    return node;
}
function openPlayer(player) {
    state.preview=player; const name=[player.first_name,player.last_name].filter(Boolean).join(' ')||'Ismi ko‘rsatilmagan';
    $('player-detail-name').textContent=name; $('player-detail-photo').replaceChildren(avatar(player,'player-detail-avatar'));
    const fields=[['Jamoasi',player.team_name],['Forma raqami',player.player_number!=null?`#${player.player_number}`:'—'],['Pozitsiyasi',player.position||'—'],['Holati','Tasdiqlangan o‘yinchi']];
    $('player-detail-fields').replaceChildren(...fields.flatMap(([label,value])=>[el('dt',label),el('dd',value)]));
    $('choose-player').disabled=!state.windowOpen||player.has_pending; $('choose-player').textContent=player.has_pending?'Ariza mavjud':'Transferga tanlash';
    $('player-dialog').showModal();
}
function openRequest(player) {
    state.selected=player; $('request-heading').textContent=[player.first_name,player.last_name].filter(Boolean).join(' ');
    $('selected-team').textContent=[player.team_name,player.player_number!=null?`#${player.player_number}`:'',player.position].filter(Boolean).join(' · ');
    $('reason').value=''; $('request-error').hidden=true; $('request-dialog').showModal(); $('reason').focus();
}
$('close-player').addEventListener('click',()=>$('player-dialog').close());
$('choose-player').addEventListener('click',()=>{if(!state.preview)return;const player=state.preview;$('player-dialog').close();openRequest(player);});
function playerRow(player) {
    const row=el('li',null,'player-row'); const person=el('div',null,'person');
    const name=[player.first_name,player.last_name].filter(Boolean).join(' ');
    const meta=[player.player_number!=null?`#${player.player_number}`:'',player.position,player.team_name].filter(Boolean).join(' · ');
    const details=el('div',null,'player-info'); details.append(el('strong',name||'Ismi ko‘rsatilmagan'),el('p',meta)); person.append(avatar(player),details);
    const button=el('button',player.has_pending ? 'Ariza mavjud' : 'Ko‘rish','button quiet');
    button.type='button'; button.dataset.pending=String(Boolean(player.has_pending)); button.disabled=!state.windowOpen || player.has_pending;
    button.addEventListener('click',()=>openPlayer(player)); person.tabIndex=0; person.role='button'; person.addEventListener('click',()=>openPlayer(player));
    person.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPlayer(player);}});
    row.append(person,button); return row;
}
async function search(more = false) {
    if (!state.active) return;
    const query=$('player-query').value.trim(); if (query.length===1) return;
    searchAbort?.abort(); searchAbort=new AbortController();
    const version=++state.searchVersion, epoch=state.epoch;
    if (!more) { state.query=query; state.playersCursor=null; $('players').replaceChildren(); }
    $('search-status').textContent='Qidirilmoqda…'; $('players-more').hidden=true;
    try {
        const data=await api.page('players',{query:state.query,after:more ? state.playersCursor : null,signal:searchAbort.signal});
        if (version!==state.searchVersion || epoch!==state.epoch) return;
        $('players').append(...data.items.map(playerRow)); state.playersCursor=data.next_cursor;
        $('players-more').hidden=!data.next_cursor;
        $('search-status').textContent=$('players').children.length ? `${$('players').children.length} ta o‘yinchi` : 'Mos o‘yinchi topilmadi.';
    } catch (error) { if (version===state.searchVersion && epoch===state.epoch) handleError(error,$('search-status')); }
}
$('player-query').addEventListener('input',()=>{
    clearTimeout(debounce); searchAbort?.abort(); state.searchVersion++;
    $('players-more').hidden=true; $('players').replaceChildren();
    if ($('player-query').value.trim().length===1) { $('search-status').textContent='Qidirish uchun kamida 2 ta harf kiriting.'; return; }
    debounce=setTimeout(()=>void search(),350);
});
$('players-more').addEventListener('click',()=>void search(true));
function historyRow(item) {
    const row=el('li'); const top=el('div',null,'history-top');
    const labels={pending:'Admin ko‘rib chiqmoqda',approved:'Tasdiqlangan',rejected:'Rad etilgan'};
    top.append(el('strong',item.player_name),el('span',labels[item.status]||'Holat noma’lum',`badge ${['pending','approved','rejected'].includes(item.status)?item.status:''}`));
    const date=new Date(item.created_at);
    row.append(top,el('p',`${item.old_team_name || '—'} · ${Number.isNaN(date.getTime())?'—':date.toLocaleDateString('uz-UZ')}`,'history-meta'),el('p',item.reason,'history-reason'));
    return row;
}
async function history(more = false) {
    if (!state.active) return;
    const version=++state.historyVersion, epoch=state.epoch;
    $('refresh-history').disabled=true; $('history-more').hidden=true; $('history-status').textContent='Yuklanmoqda…';
    if (!more) { $('history').replaceChildren(); state.historyCursor=null; }
    try {
        const data=await api.page('history',{after:more ? state.historyCursor : null});
        if (version!==state.historyVersion || epoch!==state.epoch) return;
        $('history').append(...data.items.map(historyRow)); state.historyCursor=data.next_cursor;
        $('history-more').hidden=!data.next_cursor;
        $('history-status').textContent=$('history').children.length ? '' : 'Hozircha ariza yuborilmagan.';
    } catch (error) { if (version===state.historyVersion && epoch===state.epoch) handleError(error,$('history-status')); }
    finally { if (version===state.historyVersion) $('refresh-history').disabled=false; }
}
$('history-more').addEventListener('click',()=>void history(true));
$('refresh-history').addEventListener('click',async()=>{
    $('refresh-history').disabled=true;
    try { await context(); if (state.active) await history(); } catch(error) { handleError(error); }
    finally { $('refresh-history').disabled=false; }
});
$('cancel-request').addEventListener('click',()=>{ if(!state.submitting) $('request-dialog').close(); });
$('request-dialog').addEventListener('cancel',event=>{ if(state.submitting) event.preventDefault(); });
$('request-form').addEventListener('submit',async event=>{
    event.preventDefault(); if (state.submitting || !state.selected || !state.active) return;
    const reason=$('reason').value.trim();
    if (!reason) { $('request-error').textContent='Transfer sababini yozing.'; $('request-error').hidden=false; return; }
    const epoch=state.epoch; state.submitting=true; $('send-request').disabled=true; $('cancel-request').disabled=true;
    $('send-request').textContent='Yuborilmoqda…'; $('request-error').hidden=true;
    try {
        if (!await context()) {
            if (epoch===state.epoch) { $('request-error').textContent='Transfer oynasi yopiq. Ariza yuborilmadi.'; $('request-error').hidden=false; }
            return;
        }
        if (epoch!==state.epoch) return;
        await api.request(state.selected.id,reason);
        if (epoch!==state.epoch) return;
        $('request-dialog').close(); state.selected=null;
        notice('Ariza yuborildi. Admin qarorini shu yerda kuzating.');
        await Promise.all([history(),search()]);
    } catch(error) { if(epoch===state.epoch) handleError(error,$('request-error')); }
    finally { state.submitting=false; $('send-request').disabled=false; $('cancel-request').disabled=false; $('send-request').textContent='Ariza yuborish'; }
});
// Preserve organization navigation without treating URL parameters as authority.
const org=new URLSearchParams(location.search).get('org') || (location.pathname.split('/').filter(Boolean).length>1 ? location.pathname.split('/')[1] : '');
if (org) { const url=new URL($('home-link').href); url.searchParams.set('org',org); $('home-link').href=url.href; }
async function boot() {
    if (!api.hasSession()) { reset(); return; }
    state.active=true; $('workspace').hidden=false;
    try { await context(); if (state.active) await Promise.all([search(false),history(false)]); }
    catch (error) { handleError(error); }
}
void boot();
