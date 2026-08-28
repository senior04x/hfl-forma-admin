require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// 🔒 SECURITY FIX: Barcha kalitlar .env'dan o'qiladi
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Kalitlar mavjudligini tekshirish
if (!TELEGRAM_TOKEN) {
    console.error('❌ FATAL: TELEGRAM_BOT_TOKEN .env faylida topilmadi!');
    process.exit(1);
}
if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ FATAL: SUPABASE_SERVICE_ROLE_KEY .env faylida topilmadi!');
    process.exit(1);
}

// Initialize Telegram Bot & Supabase
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Amatora Bot is running...');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

console.log('Amatora Telegram Bot is starting up... Waiting for realtime events');

// Memory Cache for last message sent per chat (auto-delete old messages)
const lastChatMsgCache = new Map();

async function sendCleanMessage(chatId, text, options = { parse_mode: 'HTML' }, dbRecordToUpdate = null) {
    const prevMsgId = lastChatMsgCache.get(chatId) || (dbRecordToUpdate ? dbRecordToUpdate.telegram_message_id : null);
    if (prevMsgId) {
        try {
            await bot.deleteMessage(chatId, prevMsgId);
        } catch (e) {}
    }

    try {
        const sent = await bot.sendMessage(chatId, text, options);
        if (sent && sent.message_id) {
            const sentId = sent.message_id.toString();
            lastChatMsgCache.set(chatId, sentId);

            if (dbRecordToUpdate && dbRecordToUpdate.id) {
                const table = dbRecordToUpdate.captain_phone ? 'teams' : 'applications';
                await supabase.from(table).update({ telegram_chat_id: chatId, telegram_message_id: sentId }).eq('id', dbRecordToUpdate.id);
            }
            return sent;
        }
    } catch (err) {
        console.error('sendCleanMessage error:', err);
    }
    return null;
}

// Helper to format badges
function getStatusBadge(status) {
    if (status === 'approved') return '✅ TASDIQLANDI';
    if (status === 'rejected') return '❌ RAD ETILDI';
    if (status === 'partially_approved') return '⚠️ QISMAN TASDIQLANDI';
    return '⏳ KUTILMOQDA';
}

function getShortId(id) {
    return id ? id.split('-')[0].toUpperCase() : 'N/A';
}

// Format Individual Player Application Details
async function formatApplicationMessage(appData) {
    let orgName = 'Amatora League';
    if (appData.organization_id) {
        try {
            const { data: org } = await supabase.from('organizations').select('name').eq('id', appData.organization_id).single();
            if (org && org.name) orgName = org.name;
        } catch (e) {}
    }

    let teamName = 'Yakkaxon (O\'yinchi)';
    let leagueName = appData.league || '-';
    let isTeamApp = false;

    // Check if league is in comment
    if ((!leagueName || leagueName === '-') && appData.comment && appData.comment.includes('[LEAGUE:')) {
        const match = appData.comment.match(/\[LEAGUE:([^\]]+)\]/);
        if (match && match[1]) leagueName = match[1];
    }

    if (appData.teams) {
        teamName = appData.teams.name || teamName;
        if (!leagueName || leagueName === '-') leagueName = appData.teams.league || leagueName;
        isTeamApp = true;
    } else if (appData.team_id) {
        try {
            const { data: tm } = await supabase.from('teams').select('name, league').eq('id', appData.team_id).single();
            if (tm) {
                teamName = tm.name || teamName;
                if (!leagueName || leagueName === '-') leagueName = tm.league || leagueName;
                isTeamApp = true;
            }
        } catch (e) {}
    }

    // Fallback: If still no teamName/leagueName, search applications/teams by player's phone
    if ((!leagueName || leagueName === '-' || teamName === 'Yakkaxon (O\'yinchi)') && appData.phone) {
        try {
            const cleanP = appData.phone.replace(/\D/g, '').slice(-9);
            const { data: matchedApp } = await supabase
                .from('applications')
                .select('*, teams(*)')
                .ilike('phone', `%${cleanP}%`)
                .not('team_id', 'is', null)
                .limit(1);

            if (matchedApp && matchedApp.length > 0 && matchedApp[0].teams) {
                teamName = matchedApp[0].teams.name || teamName;
                if (!leagueName || leagueName === '-') leagueName = matchedApp[0].teams.league || leagueName;
            }
        } catch (e) {}
    }

    const isProfileUpdate = (appData.comment && appData.comment.includes('[PROFILE_UPDATE]'));
    const typeText = isProfileUpdate ? 'Profil ma\'lumotlarini o\'zgartirish' : (isTeamApp ? 'Jamoaviy' : 'Yakkaxon');
    const titleHeader = isProfileUpdate ? '📝 <b>PROFIL YANGILASH ARIZASI</b>' : '📋 <b>ARIZA MA\'LUMOTLARI</b>';
    const fullName = `${appData.first_name || ''} ${appData.last_name || ''}`.trim() || 'O\'yinchi';

    return `
${titleHeader}

🏢 <b>Tashkilot:</b> ${orgName}
🏆 <b>Liga:</b> ${leagueName}
🛡 <b>Jamoa:</b> ${teamName}
👤 <b>Arizachi:</b> ${fullName}
📌 <b>Turi:</b> ${typeText}
📊 <b>Holati:</b> ${getStatusBadge(appData.status)}

<i>${isProfileUpdate ? "Profil ma'lumotlaringizni o'zgartirish bo'yicha arizangiz ko'rib chiqilmoqda." : "Arizangiz holati o'zgarganda bot orqali avtomatik xabar beriladi."}</i>
`.trim();
}

// Format Team Application Details
async function formatTeamMessage(teamData) {
    let orgName = 'Amatora League';
    if (teamData.organization_id) {
        try {
            const { data: org } = await supabase.from('organizations').select('name').eq('id', teamData.organization_id).single();
            if (org && org.name) orgName = org.name;
        } catch (e) {}
    }

    return `
📋 <b>JAMOA ARIZA MA'LUMOTLARI</b>

🏢 <b>Tashkilot:</b> ${orgName}
🏆 <b>Liga:</b> ${teamData.league || 'Super liga'}
🛡 <b>Jamoa nomi:</b> ${teamData.name}
📞 <b>Sardor tel:</b> ${teamData.captain_phone || '-'}
📌 <b>Turi:</b> Jamoaviy
📊 <b>Holati:</b> ${getStatusBadge(teamData.status)}

<i>Tashkilotchilar ko'rib chiqqach sizga xabar beriladi.</i>
`.trim();
}

// Session store for chat target phone numbers and mode
const targetPhoneByChat = new Map();

// 1. /start command — deep link parametrini ham o'qiydi (masalan: /start login_933786886 yoki /start status_933786886)
bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const param = (match && match[1] ? match[1].trim() : '');

    let targetPhone = '';
    let isLoginMode = false;

    if (param) {
        const cleanDigits = param.replace(/\D/g, '').slice(-9);
        if (cleanDigits.length === 9) {
            targetPhone = cleanDigits;
            isLoginMode = param.toLowerCase().includes('login_');
            targetPhoneByChat.set(chatId, { phone: cleanDigits, isLoginMode });
        }
    }

    const phonePrompt = targetPhone
        ? (isLoginMode
            ? `Assalomu alaykum! 👋\n\n+998 ${targetPhone.slice(0,2)} ${targetPhone.slice(2,5)} ${targetPhone.slice(5,7)} ${targetPhone.slice(7)} raqami uchun 4 xonali kirish kodini olish uchun pastdagi <b>📱 Telefon raqamni yuborish</b> tugmasini bosing.`
            : `Assalomu alaykum! 👋\n\nArizangiz bo'yicha Telegram xabarnomalarni yoqish va chatni bog'lash uchun pastdagi <b>📱 Telefon raqamni yuborish</b> tugmasini bosing.`)
        : `Assalomu alaykum! 👋\n\n<b>Amatora</b> xabarnomalari va tasdiqlash kodi uchun pastdagi <b>📱 Telefon raqamni yuborish</b> tugmasini bosing.`;

    await sendCleanMessage(chatId, phonePrompt, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                [{ text: "📱 Telefon raqamni yuborish", request_contact: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

// 2. Handle Contact — faqat mos kelgan raqamga bog'lanadi va login rejimida kod beradi
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    let rawPhone = msg.contact.phone_number || '';
    let contactPhone = rawPhone.replace(/\D/g, '').slice(-9);

    const session = targetPhoneByChat.get(chatId);
    let targetPhone = session ? session.phone : contactPhone;
    let isLoginMode = session ? session.isLoginMode : false;

    try {
        // Telefon raqamni bazadan tekshirish
        const { data: matchedTeams } = await supabase
            .from('teams')
            .select('*, organization_id')
            .ilike('captain_phone', `%${targetPhone}%`);

        const { data: matchedApps } = await supabase
            .from('applications')
            .select('*, organization_id, teams(*)')
            .ilike('phone', `%${targetPhone}%`);

        const isTargetRegistered = (matchedTeams && matchedTeams.length > 0) || (matchedApps && matchedApps.length > 0);

        if (!isTargetRegistered) {
            await sendCleanMessage(chatId, `<b>+998${targetPhone}</b> raqamiga tegishli ariza yoki jamoa topilmadi.\n\nIltimos, avval ilova orqali ariza topshiring.`, { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
            return;
        }

        // Begona foydalanuvchi tekshiruvi: Telegram raqami va ilovadagi raqam mosligi
        const isAlreadyLinked = (matchedTeams || []).some(t => t.telegram_chat_id == chatId) || (matchedApps || []).some(a => a.telegram_chat_id == chatId);

        if (contactPhone !== targetPhone && !isAlreadyLinked) {
            await sendCleanMessage(chatId, `⚠️ <b>Xavfsizlik Ogohlantirishi:</b>\n\nTelegram raqamingiz (<code>+998${contactPhone}</code>) ilovada kiritilgan (<code>+998${targetPhone}</code>) raqamga mos kelmadi.\n\nIltimos, ilovada o'zingizning telefon raqamingizni kiriting.`, { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } });
            return;
        }

        // telegram_chat_id saqlash
        if (matchedTeams && matchedTeams.length > 0) {
            await supabase.from('teams').update({ telegram_chat_id: chatId }).ilike('captain_phone', `%${targetPhone}%`);
        }
        if (matchedApps && matchedApps.length > 0) {
            await supabase.from('applications').update({ telegram_chat_id: chatId }).ilike('phone', `%${targetPhone}%`);
        }

        targetPhoneByChat.delete(chatId);

        // AGAR ariza topshirishdan o'tgan bo'lsa (status rejimi): Chat ID bog'landi xabari + Ariza ma'lumoti. KOD YUBORILMAYDI!
        if (!isLoginMode) {
            await sendCleanMessage(chatId, `✅ <b>Telegram hisobingiz (+998${contactPhone}) muvaffaqiyatli bog'landi!</b>\n\nArizangiz holati o'zgarganda ushbu chat orqali avtomatik xabar beriladi.`, {
                parse_mode: 'HTML',
                reply_markup: { remove_keyboard: true }
            });

            const targetApp = (matchedApps && matchedApps.length > 0) ? matchedApps[0] : null;
            const targetTeam = (matchedTeams && matchedTeams.length > 0) ? matchedTeams[0] : null;

            if (targetApp) {
                const appMsg = await formatApplicationMessage(targetApp);
                await bot.sendMessage(chatId, appMsg, { parse_mode: 'HTML' });
            } else if (targetTeam) {
                const teamMsg = await formatTeamMessage(targetTeam);
                await bot.sendMessage(chatId, teamMsg, { parse_mode: 'HTML' });
            }
            return;
        }

        // AGAR kirish rejimidan o'tgan bo'lsa (login_...): 4 xonali OTP kod yuborish
        let otpCode = '';
        const { data: existingOtp } = await supabase
            .from('otp_codes')
            .select('*')
            .eq('phone', targetPhone)
            .gte('expires_at', new Date().toISOString())
            .eq('is_used', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingOtp && existingOtp.code) {
            otpCode = existingOtp.code;
        } else {
            otpCode = Math.floor(1000 + Math.random() * 9000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            await supabase.from('otp_codes').upsert({
                phone: targetPhone,
                code: otpCode,
                expires_at: expiresAt,
                is_used: false,
                created_at: new Date().toISOString()
            }, { onConflict: 'phone' });
        }

        await sendCleanMessage(chatId, `🔑 <b>Tasdiqlash kodingiz:</b> <code>${otpCode}</code>\n\n📱 <i>4 xonali kodni ilovaga kiriting. Kod 10 daqiqa amal qiladi.</i>`, {
            parse_mode: 'HTML',
            reply_markup: {
                remove_keyboard: true,
                inline_keyboard: [
                    [{ text: '📋 Nusxalash', copy_text: { text: otpCode } }]
                ]
            }
        });

    } catch (err) {
        console.error('Contact handler error:', err);
        await sendCleanMessage(chatId, "Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    }
});

const lastStatusCache = new Map();

// 3. Realtime listener for status changes (Individual Applications)
supabase
  .channel('applications-status')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications' }, async (payload) => {
      const newRecord = payload.new;
      const cacheKey = 'app_' + newRecord.id;
      const prevStatus = lastStatusCache.get(cacheKey);

      if (prevStatus !== newRecord.status) {
          lastStatusCache.set(cacheKey, newRecord.status);

          let chatId = newRecord.telegram_chat_id;
          if (!chatId && newRecord.phone) {
              const cleanP = newRecord.phone.replace(/\D/g, '').slice(-9);
              const { data: existingApp } = await supabase
                  .from('applications')
                  .select('telegram_chat_id')
                  .or(`phone.ilike.%${cleanP}%`)
                  .not('telegram_chat_id', 'is', null)
                  .limit(1);
              if (existingApp && existingApp.length > 0) chatId = existingApp[0].telegram_chat_id;
          }

          if (chatId) {
              const isProfileUpdate = (newRecord.comment && newRecord.comment.includes('[PROFILE_UPDATE]'));
              let statusHeader = '';

              if (isProfileUpdate) {
                  statusHeader = newRecord.status === 'approved'
                      ? '🎉 <b>PROFILINGIZ MUVAFFAQIYATLI YANGILANDI!</b>'
                      : newRecord.status === 'rejected'
                      ? '❌ <b>PROFIL O\'ZGARTIRISH ARIZASI RAD ETILDI</b>'
                      : '📝 <b>PROFIL ARIZASI HOLATI O\'ZGARDI</b>';
              } else {
                  statusHeader = newRecord.status === 'approved'
                      ? '🎉 <b>ARIZANGIZ TASDIQLANDI!</b>'
                      : newRecord.status === 'rejected'
                      ? '❌ <b>ARIZANGIZ RAD ETILDI</b>'
                      : '📢 <b>ARIZA HOLATI O\'ZGARDI</b>';
              }

              const detailMsg = await formatApplicationMessage(newRecord);
              const fullMsg = `${statusHeader}\n\n${detailMsg}`;

              await sendCleanMessage(chatId, fullMsg, { parse_mode: 'HTML' }, newRecord);
          }
      }
  })
  .subscribe();

// 4. Realtime listener for Team status changes
supabase
  .channel('teams-status')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, async (payload) => {
      const newRecord = payload.new;
      const cacheKey = 'team_' + newRecord.id;
      const prevStatus = lastStatusCache.get(cacheKey);

      if (prevStatus !== newRecord.status) {
          lastStatusCache.set(cacheKey, newRecord.status);

          let chatId = newRecord.telegram_chat_id;
          if (!chatId && newRecord.captain_phone) {
              const cleanP = newRecord.captain_phone.replace(/\D/g, '').slice(-9);
              const { data: existingTeam } = await supabase
                  .from('teams')
                  .select('telegram_chat_id')
                  .or(`captain_phone.ilike.%${cleanP}%`)
                  .not('telegram_chat_id', 'is', null)
                  .limit(1);
              if (existingTeam && existingTeam.length > 0) chatId = existingTeam[0].telegram_chat_id;
          }

          if (chatId) {
              const statusHeader = newRecord.status === 'approved'
                  ? '🎉 <b>JAMOA ARIZASI TASDIQLANDI!</b>'
                  : newRecord.status === 'rejected'
                  ? '❌ <b>JAMOA ARIZASI RAD ETILDI</b>'
                  : '📢 <b>JAMOA ARIZA HOLATI O\'ZGARDI</b>';

              const detailMsg = await formatTeamMessage(newRecord);
              const fullMsg = `${statusHeader}\n\n${detailMsg}`;

              await sendCleanMessage(chatId, fullMsg, { parse_mode: 'HTML' }, newRecord);
          }
      }
  })
  .subscribe();

// 5. Realtime listener for Matches (New Match Scheduled)
supabase
  .channel('matches-status')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, async (payload) => {
      const match = payload.new;
      
      try {
          const { data: homeTeam } = await supabase.from('teams').select('*').eq('id', match.home_team_id).single();
          const { data: awayTeam } = await supabase.from('teams').select('*').eq('id', match.away_team_id).single();

          if (!homeTeam || !awayTeam) return;

          // Faqat shu 2 ta jamoa sardorlari va o'yinchilariga yuboriladi
          const recipientChatIds = new Set();
          if (homeTeam.telegram_chat_id) recipientChatIds.add(homeTeam.telegram_chat_id);
          if (awayTeam.telegram_chat_id) recipientChatIds.add(awayTeam.telegram_chat_id);

          const { data: homePlayers } = await supabase.from('applications').select('telegram_chat_id').eq('team_id', match.home_team_id).not('telegram_chat_id', 'is', null);
          const { data: awayPlayers } = await supabase.from('applications').select('telegram_chat_id').eq('team_id', match.away_team_id).not('telegram_chat_id', 'is', null);

          if (homePlayers) homePlayers.forEach(p => p.telegram_chat_id && recipientChatIds.add(p.telegram_chat_id));
          if (awayPlayers) awayPlayers.forEach(p => p.telegram_chat_id && recipientChatIds.add(p.telegram_chat_id));

          if (recipientChatIds.size === 0) return;

          const message = [
              '',
              '📢 <b>Yangi O\'yiningiz Belgilandi!</b>',
              '',
              '⚽ <b>' + homeTeam.name + '</b> 🆚 <b>' + awayTeam.name + '</b>',
              '🏆 <b>Liga:</b> ' + (match.league || '-'),
              '📅 <b>Sana:</b> ' + (match.match_date || '-'),
              '⏰ <b>Vaqt:</b> ' + (match.match_time || '-'),
              '🏟 <b>Manzil:</b> ' + (match.location || '1-Maydon'),
              '',
              '<i>O\'yinga omad yor bo\'lsin!</i>'
          ].join('\n');

          const inlineKeyboard = [];
          if (match.youtube_link) {
              inlineKeyboard.push([{ text: "🔴 Jonli ko'rish", url: match.youtube_link }]);
          }

          const opts = {
              parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: inlineKeyboard
              }
          };

          for (const targetChatId of recipientChatIds) {
              try {
                  await sendCleanMessage(targetChatId, message, opts);
              } catch (e) {
                  console.error("Failed to send match schedule to", targetChatId, e.message);
              }
          }
      } catch (err) {
          console.error("Matches listener error:", err);
      }
  })
  .subscribe();

// 6. Realtime listener for Match Results (Finished Match)
supabase
  .channel('matches-results')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, async (payload) => {
      const oldMatch = payload.old;
      const newMatch = payload.new;

      const isFinished = oldMatch.status !== 'finished' && newMatch.status === 'finished';
      const isReverted = oldMatch.status === 'finished' && newMatch.status === 'scheduled';

      if (!isFinished && !isReverted) return;

      try {
          const { data: homeTeam } = await supabase.from('teams').select('*').eq('id', newMatch.home_team_id).single();
          const { data: awayTeam } = await supabase.from('teams').select('*').eq('id', newMatch.away_team_id).single();

          if (!homeTeam || !awayTeam) return;

          const { data: matchEvents } = await supabase
              .from('match_events')
              .select('*, player:player_id(first_name, last_name)')
              .eq('match_id', newMatch.id)
              .order('minute', { ascending: true });

          const homeGoals = (matchEvents || []).filter(e => e.event_type === 'goal' && e.team_id === newMatch.home_team_id);
          const awayGoals = (matchEvents || []).filter(e => e.event_type === 'goal' && e.team_id === newMatch.away_team_id);
          const yellowCards = (matchEvents || []).filter(e => e.event_type === 'yellow_card').length;
          const redCards = (matchEvents || []).filter(e => e.event_type === 'red_card').length;

          const homeGoalsText = homeGoals.map(g => (g.player ? g.player.first_name + ' ' + g.player.last_name : '?') + " " + g.minute + "'").join(', ') || '-';
          const awayGoalsText = awayGoals.map(g => (g.player ? g.player.first_name + ' ' + g.player.last_name : '?') + " " + g.minute + "'").join(', ') || '-';

          // Faqat shu o'yinda o'ynagan 2 ta jamoa sardorlari va o'yinchilariga yuboriladi
          const recipientChatIds = new Set();
          if (homeTeam.telegram_chat_id) recipientChatIds.add(homeTeam.telegram_chat_id);
          if (awayTeam.telegram_chat_id) recipientChatIds.add(awayTeam.telegram_chat_id);

          const { data: homePlayers } = await supabase
              .from('applications')
              .select('telegram_chat_id')
              .eq('team_id', newMatch.home_team_id)
              .not('telegram_chat_id', 'is', null);

          const { data: awayPlayers } = await supabase
              .from('applications')
              .select('telegram_chat_id')
              .eq('team_id', newMatch.away_team_id)
              .not('telegram_chat_id', 'is', null);

          if (homePlayers) {
              homePlayers.forEach(p => p.telegram_chat_id && recipientChatIds.add(p.telegram_chat_id));
          }
          if (awayPlayers) {
              awayPlayers.forEach(p => p.telegram_chat_id && recipientChatIds.add(p.telegram_chat_id));
          }

          if (recipientChatIds.size === 0) return;

          let message = '';
          
          if (isFinished) {
              message = [
                  '',
                  '⚽ <b>O\'yin Natijasi</b>',
                  '',
                  '<b>' + homeTeam.name + '</b> <b>' + (newMatch.home_score || 0) + ' : ' + (newMatch.away_score || 0) + '</b> <b>' + awayTeam.name + '</b>',
                  '',
                  '🏆 <b>Liga:</b> ' + (newMatch.league || '-'),
                  '⚽ <b>' + homeTeam.name + ':</b> ' + homeGoalsText,
                  '⚽ <b>' + awayTeam.name + ':</b> ' + awayGoalsText,
                  '🟨 Sariq: ' + yellowCards + ' | 🟥 Qizil: ' + redCards,
                  '',
                  '<i>Keyingi o\'yiningizda omad yor bo\'lsin!</i>'
              ].join('\n');
          } else if (isReverted) {
              message = [
                  '',
                  '⚠️ <b>O\'yin holati qayta tiklandi!</b>',
                  '',
                  '<b>' + homeTeam.name + '</b> 🆚 <b>' + awayTeam.name + '</b>',
                  'o\'yini holati qayta <b>Rejalashtirilgan</b> holatiga qaytarildi.'
              ].join('\n');
          }

          for (const targetChatId of recipientChatIds) {
              try {
                  await sendCleanMessage(targetChatId, message, { parse_mode: 'HTML' });
              } catch (e) {
                  console.error("Failed to send match result to", targetChatId, e.message);
              }
          }
      } catch (err) {
          console.error("Match result listener error:", err);
      }
  })
  .subscribe();
