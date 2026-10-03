import { createTransferApi } from './transfer-api.mjs';
const api=createTransferApi();
const $=id=>document.getElementById(id);
const next=()=>{
    const value=new URLSearchParams(location.search).get('next');
    if (!value) return '';
    try { const url=new URL(value,location.origin); return url.origin===location.origin && url.pathname.startsWith('/') ? `${url.pathname}${url.search}` : ''; }
    catch { return ''; }
};
function showError(text) { $('notice').textContent=text; $('notice').hidden=!text; }
function showAccount(data) {
    const team=data.team;
    $('login-intro').hidden=true; $('login-panel').hidden=true; $('account-panel').hidden=false; $('team-name').textContent=team.name;
    $('window-status').textContent=data.transfer_window_open ? 'Transfer oynasi ochiq' : 'Transfer oynasi yopiq';
    $('window-status').classList.toggle('closed',!data.transfer_window_open);
    $('add-player').href=`/apply-individual.html?team=${encodeURIComponent(team.id)}`;
}
async function restore() {
    if (!api.hasSession()) return;
    try {
        const data=await api.page('context');
        const destination=next();
        if (destination) { location.replace(destination); return; }
        showAccount(data);
    } catch { api.clear(); }
}
function validPhone() {
    const digits=$('phone').value.replace(/\D/g,'');
    return digits.length===9 || (digits.length===12 && digits.startsWith('998'));
}
$('request-code').addEventListener('click',async()=>{
    showError('');
    if (!validPhone()) { showError('Telefon raqamini to‘g‘ri kiriting.'); $('phone').focus(); return; }
    $('request-code').disabled=true; $('request-code').textContent='Tekshirilmoqda…';
    try {
        const data=await api.requestCode($('phone').value);
        $('phone').readOnly=true; $('phone-step').hidden=true; $('code-step').hidden=false; $('otp').required=true;
        if (data.isAutoSentToTelegram) {
            $('code-status').textContent='Tasdiqlash kodi Telegramga yuborildi.';
            $('bot-help').hidden=true; $('otp').focus();
        } else {
            $('code-status').textContent='Avval Telegram botni ishga tushiring.';
            $('bot-help').hidden=false;
            if (typeof data.botUrl==='string' && data.botUrl.startsWith('https://t.me/amatora_bot')) $('bot-link').href=data.botUrl;
        }
    } catch(error) {
        if (error.status===429) {
            $('phone').readOnly=true; $('phone-step').hidden=true; $('code-step').hidden=false; $('otp').required=true;
            $('code-status').textContent='Oldin yuborilgan tasdiqlash kodini kiriting.';
            $('bot-help').hidden=true; $('otp').focus();
        } else showError(error.data?.reason || 'Kod yuborilmadi. Keyinroq qayta urinib ko‘ring.');
    } finally { $('request-code').disabled=false; $('request-code').textContent='Tasdiqlash kodini olish →'; }
});
$('change-phone').addEventListener('click',()=>{
    showError(''); $('otp').value=''; $('otp').required=false; $('code-step').hidden=true; $('phone-step').hidden=false; $('phone').readOnly=false; $('phone').focus();
    $('bot-help').hidden=true; $('team-choice').hidden=true; $('captain-team').replaceChildren();
});
$('login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if ($('code-step').hidden) { $('request-code').click(); return; }
    $('login-submit').disabled=true; showError('');
    try {
        const data=await api.login($('phone').value,$('otp').value,$('team-choice').hidden ? null : $('captain-team').value);
        const destination=next();
        if (destination) { location.replace(destination); return; }
        $('otp').value=''; showAccount(await api.page('context'));
    } catch(error) {
        if (error.status===409 && Array.isArray(error.data?.teams) && error.data.teams.length) {
            $('captain-team').replaceChildren(...error.data.teams.map(team=>Object.assign(document.createElement('option'),{value:team.id,textContent:team.name})));
            $('team-choice').hidden=false; showError('Jamoangizni tanlab, qayta kiring.');
        } else if (error.status===429) showError('Urinishlar ko‘p. Botdan yangi kod oling.');
        else showError('Telefon raqami yoki kod noto‘g‘ri.');
    } finally { $('login-submit').disabled=false; }
});
$('phone').addEventListener('input',()=>{ $('team-choice').hidden=true; $('captain-team').replaceChildren(); });
$('logout').addEventListener('click',async()=>{
    $('logout').disabled=true;
    try { await api.logout(); } catch { api.clear(); }
    location.reload();
});
void restore();
