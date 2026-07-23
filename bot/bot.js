const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Config
const TELEGRAM_TOKEN = '8920990708:AAEhrRtX06AEDhJyKNx_CSLWYMNSYviEYHc';
const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzEwMzU1MSwiZXhwIjoyMDk4Njc5NTUxfQ.Z_qdzR5mYepOEyW57WXl9fb1v5FV4xEYDP-LvihiU6I';

// Initialize Telegram Bot & Supabase
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('HFL Bot is running...');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

console.log('Telegram Bot is starting up... Waiting for realtime events');

// Helper to format messages
function getStatusText(status) {
    if (status === 'approved') return '✅ Tasdiqlangan';
    if (status === 'rejected') return '❌ Rad etilgan';
    if (status === 'partially_approved') return '⚠️ Qisman tasdiqlangan';
    return '⏳ Kutilmoqda';
}

function getShortId(id) {
    return id ? id.split('-')[0].toUpperCase() : 'N/A';
}

// 1. /start command - Deep link or Ask for phone number
bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const deepLinkParam = match[1] ? match[1].trim() : '';

    if (deepLinkParam.startsWith('app_')) {
        const applicationId = deepLinkParam.replace('app_', '');
        try {
            const { data, error } = await supabase.from('applications').select('*, teams(name, league)').eq('id', applicationId).single();
            if (error || !data) return bot.sendMessage(chatId, "Bunday ariza topilmadi. Yoki id noto'g'ri.");

            if (data.telegram_message_id) {
                bot.deleteMessage(chatId, data.telegram_message_id).catch(() => {});
            }

            const teamName = data.teams ? data.teams.name : 'Yakkaxon (Jamoasiz)';
            const message = `
🏆 <b>Havas Futbol Ligasi</b>

Assalomu alaykum, <b>${data.first_name} ${data.last_name}</b>! ⚽️

📑 <b>Ariza raqami:</b> #${getShortId(data.id)}
🏆 <b>Turnir:</b> ${data.teams ? data.teams.league || 'Kiritilmagan' : '-'}
🛡 <b>Jamoa:</b> ${teamName}
📊 <b>Sizning holatingiz:</b> ${getStatusText(data.status)}

<i>Arizangiz holati o'zgarganda tizim sizga avtomatik xabar yuboradi.</i>
            `;
            const sentMsg = await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            await supabase.from('applications').update({ telegram_chat_id: chatId, telegram_message_id: sentMsg.message_id.toString() }).eq('id', applicationId);
        } catch (err) {
            console.error(err);
        }
    } else if (deepLinkParam.startsWith('team_')) {
        const teamId = deepLinkParam.replace('team_', '');
        try {
            const { data, error } = await supabase.from('teams').select('*').eq('id', teamId).single();
            if (error || !data) return bot.sendMessage(chatId, "Bunday jamoa topilmadi. Yoki id noto'g'ri.");

            if (data.telegram_message_id) {
                bot.deleteMessage(chatId, data.telegram_message_id).catch(() => {});
            }

            const message = `
🏆 <b>Havas Futbol Ligasi</b>

Assalomu alaykum, <b>${data.name}</b> jamoasi sardori! 🛡

📑 <b>Jamoa ID:</b> #${getShortId(data.id)}
🏆 <b>Turnir:</b> ${data.league || 'Kiritilmagan'}
📞 <b>Telefoningiz:</b> ${data.captain_phone}
📊 <b>Jamoa Holati:</b> ${getStatusText(data.status)}

<i>Jamoangiz holati o'zgarganda yoki yangi o'yinchi holati yangilanganda ushbu bot orqali avtomatik xabarnoma olasiz!</i>
            `;
            const sentMsg = await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            await supabase.from('teams').update({ telegram_chat_id: chatId, telegram_message_id: sentMsg.message_id.toString() }).eq('id', teamId);
        } catch (err) {
            console.error(err);
        }
    } else if (deepLinkParam.toLowerCase().includes('login')) {
        const rawParam = deepLinkParam.trim();
        const digits = rawParam.match(/\d+/g) || [];
        let phoneDigits = '';
        let otpCode = '';

        for (const d of digits) {
            if (d.length >= 9) phoneDigits = d.slice(-9);
            else if (d.length === 6) otpCode = d;
        }

        if (!otpCode) otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            if (phoneDigits) {
                // Update chat id and OTP in teams and applications
                await supabase.from('teams').update({ telegram_chat_id: chatId, telegram_message_id: 'OTP_' + otpCode }).or(`captain_phone.ilike.%${phoneDigits}%`);
                await supabase.from('applications').update({ telegram_chat_id: chatId, telegram_message_id: 'OTP_' + otpCode }).or(`phone.ilike.%${phoneDigits}%`);

                // Save OTP to otp_codes table
                const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
                await supabase.from('otp_codes').upsert({
                    phone: phoneDigits,
                    code: otpCode,
                    expires_at: expiresAt,
                    is_used: false,
                    created_at: new Date().toISOString()
                }, { onConflict: 'phone' });
            }

            const message = `
🔑 <b>HFL Ilovasiga kirish kodingiz:</b> <code>${otpCode}</code>

📱 <i>Ushbu 6 xonali tasdiqlash kodini HFL mobil ilovasiga kiriting. Kod 5 daqiqa davomida amal qiladi.</i>
            `;
            await bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📋 Copy Code',
                                copy_text: { text: otpCode }
                            }
                        ]
                    ]
                }
            });
        } catch (err) {
            console.error('Deep link login error:', err);
            bot.sendMessage(chatId, "Kirish kodini shakllantirishda xatolik yuz berdi.");
        }
    } else {
        // Default behavior: Ask for contact
        const opts = {
            reply_markup: {
                keyboard: [
                    [{ text: "📱 Telefon raqamni yuborish", request_contact: true }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };
        bot.sendMessage(chatId, "Assalomu alaykum! Havas Futbol Ligasining rasmiy botiga xush kelibsiz.\n\nIltimos, arizangiz holatini ko'rish uchun pastdagi <b>📱 Telefon raqamni yuborish</b> tugmasini bosing.", Object.assign({ parse_mode: 'HTML' }, opts));
    }
});

// 2. Handle Contact
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    let rawPhone = msg.contact.phone_number || '';
    
    // Remove any spaces or non-digit/plus characters just in case
    let phone = rawPhone.replace(/[^0-9+]/g, '');

    // Normalize phone to start with +
    if (!phone.startsWith('+')) {
        phone = '+' + phone;
    }

    bot.sendMessage(chatId, "🔍 Ma'lumotlaringiz qidirilmoqda...", { reply_markup: { remove_keyboard: true } });

    try {
        let found = false;

        // A) Check if Team Captain
        const { data: teamData, error: teamError } = await supabase
            .from('teams')
            .select('*')
            .eq('captain_phone', phone)
            .single();

        if (teamData && !teamError) {
            found = true;
            await supabase.from('teams').update({ telegram_chat_id: chatId }).eq('id', teamData.id);

            const message = `
🏆 <b>Havas Futbol Ligasi</b>

Assalomu alaykum, <b>${teamData.name}</b> jamoasi sardori! 🛡

📑 <b>Jamoa ID:</b> #${getShortId(teamData.id)}
🏆 <b>Turnir:</b> ${teamData.league || 'Kiritilmagan'}
📞 <b>Telefoningiz:</b> ${teamData.captain_phone}
📊 <b>Jamoa Holati:</b> ${getStatusText(teamData.status)}

<i>Jamoangiz holati o'zgarganda yoki yangi o'yinchi holati yangilanganda ushbu bot orqali avtomatik xabarnoma olasiz!</i>
            `;
            await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        }

        // B) Check if Individual Player (can be multiple applications)
        const { data: appData, error: appError } = await supabase
            .from('applications')
            .select('*, teams(name, league)')
            .eq('phone', phone)
            .order('created_at', { ascending: false });

        if (appData && appData.length > 0 && !appError) {
            found = true;
            await supabase.from('applications').update({ telegram_chat_id: chatId }).eq('phone', phone);

            for (const app of appData) {
                const teamName = app.teams ? app.teams.name : 'Yakkaxon (Jamoasiz)';
                const message = `
🏆 <b>Havas Futbol Ligasi</b>

Assalomu alaykum, <b>${app.first_name} ${app.last_name}</b>! ⚽️

📑 <b>Ariza raqami:</b> #${getShortId(app.id)}
🏆 <b>Turnir:</b> ${app.teams ? app.teams.league || 'Kiritilmagan' : '-'}
🛡 <b>Jamoa:</b> ${teamName}
📊 <b>Sizning holatingiz:</b> ${getStatusText(app.status)}

<i>Arizangiz holati o'zgarganda tizim sizga avtomatik xabar yuboradi.</i>
                `;
                await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            }
        }

        // C) Generate & Save Login OTP Code for HFL Mobile App
        if (found) {
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min expiry
            const cleanDigitsPhone = phone.replace(/\D/g, '');

            try {
                await supabase.from('otp_codes').upsert({
                    phone: cleanDigitsPhone,
                    code: otpCode,
                    expires_at: expiresAt,
                    is_used: false,
                    created_at: new Date().toISOString()
                }, { onConflict: 'phone' });
            } catch (otpErr) {
                console.warn('OTP save error:', otpErr);
            }

            const otpMessage = `
🔑 <b>HFL Ilovasiga kirish kodingiz:</b> <code>${otpCode}</code>

📱 <i>Ushbu 6 xonali tasdiqlash kodini HFL mobil ilovasiga kiriting. Kod 5 daqiqa davomida amal qiladi.</i>
            `;
            await bot.sendMessage(chatId, otpMessage, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📋 Copy Code',
                                copy_text: { text: otpCode }
                            }
                        ]
                    ]
                }
            });
        } else {
            bot.sendMessage(chatId, `Bazada <b>${phone}</b> raqamiga tegishli hech qanday ariza yoki jamoa topilmadi.\n\nIltimos, ilova yoki sayt orqali ariza topshirgan raqamingizni yuborganingizga ishonch hosil qiling.`, { parse_mode: 'HTML' });
        }

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "Tizimda xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring.");
    }
});

const lastStatusCache = new Map();

// 3. Realtime listener for status changes (Individuals)
supabase
  .channel('applications-status')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications' }, async (payload) => {
      const newRecord = payload.new;
      
      const cacheKey = 'app_' + newRecord.id;
      const prevStatus = lastStatusCache.get(cacheKey);

      if (prevStatus !== newRecord.status) {
          lastStatusCache.set(cacheKey, newRecord.status);

          let teamName = 'Yakkaxon (Jamoasiz)';
          let captainChatId = null;

          let teamLeague = 'Kiritilmagan';

          if (newRecord.team_id) {
              const { data: teamData } = await supabase.from('teams').select('name, telegram_chat_id, league').eq('id', newRecord.team_id).single();
              if (teamData) {
                  teamName = teamData.name;
                  captainChatId = teamData.telegram_chat_id;
                  teamLeague = teamData.league || 'Kiritilmagan';
              }
          }

          // A) Notify the Player
          if (newRecord.telegram_chat_id) {
              if (newRecord.telegram_message_id) {
                  bot.deleteMessage(newRecord.telegram_chat_id, newRecord.telegram_message_id).catch(() => {});
              }
              const playerMessage = `
🏆 <b>Havas Futbol Ligasi</b>

Hurmatli <b>${newRecord.first_name} ${newRecord.last_name}</b>, sizning arizangiz bo'yicha qaror qabul qilindi!

🏆 <b>Turnir:</b> ${teamLeague}
🛡 <b>Jamoangiz:</b> ${teamName}
🆕 <b>Yangi holat:</b> ${getStatusText(newRecord.status)}

<i>Murojaat uchun ma'muriyat bilan bog'laning.</i>
              `;
              try {
                  const sentMsg = await bot.sendMessage(newRecord.telegram_chat_id, playerMessage, { parse_mode: 'HTML' });
                  await supabase.from('applications').update({ telegram_message_id: sentMsg.message_id.toString() }).eq('id', newRecord.id);
              } catch (e) {}
          }

          // B) Notify the Team Captain
          // Kapitanga har bitta o'yinchi uchun alohida xabar yuborish o'chirildi (spam bo'lmasligi uchun).
          // Jamoa holati o'zgarganda Team Listener orqali bitta xabar boradi.
      }
  })
  .subscribe();

// 4. Realtime listener for team status changes
supabase
  .channel('teams-status')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, async (payload) => {
      const newRecord = payload.new;

      const cacheKey = 'team_' + newRecord.id;
      const prevStatus = lastStatusCache.get(cacheKey);

      if (prevStatus !== newRecord.status && newRecord.telegram_chat_id) {
          lastStatusCache.set(cacheKey, newRecord.status);

          if (newRecord.telegram_message_id) {
              bot.deleteMessage(newRecord.telegram_chat_id, newRecord.telegram_message_id).catch(() => {});
          }

          const message = `
🏆 <b>Havas Futbol Ligasi</b>

Hurmatli Sardor, jamoangiz arizasi bo'yicha qaror qabul qilindi!

🏆 <b>Turnir:</b> ${newRecord.league || 'Kiritilmagan'}
🛡 <b>Jamoa:</b> ${newRecord.name}
🆕 <b>Yangi holat:</b> ${getStatusText(newRecord.status)}

<i>Qo'shimcha tafsilotlar uchun ma'muriyat bilan bog'lanishingiz mumkin.</i>
          `;
          
          try {
              const sentMsg = await bot.sendMessage(newRecord.telegram_chat_id, message, { parse_mode: 'HTML' });
              await supabase.from('teams').update({ telegram_message_id: sentMsg.message_id.toString() }).eq('id', newRecord.id);
          } catch(e) {}
      }
  })
  .subscribe();

// 5. Realtime listener for Matches
supabase
  .channel('matches-status')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, async (payload) => {
      const match = payload.new;
      
      try {
          const { data: homeTeam } = await supabase.from('teams').select('*').eq('id', match.home_team_id).single();
          const { data: awayTeam } = await supabase.from('teams').select('*').eq('id', match.away_team_id).single();

          if (!homeTeam || !awayTeam) return;

          const chatIds = new Set();
          
          if (homeTeam.telegram_chat_id) chatIds.add(homeTeam.telegram_chat_id);
          if (awayTeam.telegram_chat_id) chatIds.add(awayTeam.telegram_chat_id);

          const { data: homePlayers } = await supabase.from('applications').select('telegram_chat_id').eq('team_id', match.home_team_id).not('telegram_chat_id', 'is', null);
          const { data: awayPlayers } = await supabase.from('applications').select('telegram_chat_id').eq('team_id', match.away_team_id).not('telegram_chat_id', 'is', null);

          if (homePlayers) homePlayers.forEach(p => chatIds.add(p.telegram_chat_id));
          if (awayPlayers) awayPlayers.forEach(p => chatIds.add(p.telegram_chat_id));

          const message = [
              '',
              '\uD83D\uDCE2 <b>Yangi O\'yin Belgilandi!</b>',
              '',
              '\u26BD <b>' + homeTeam.name + '</b> \uD83C\uDD9A <b>' + awayTeam.name + '</b>',
              '\uD83C\uDFC6 <b>Liga:</b> ' + (match.league || '-'),
              '\uD83D\uDCC5 <b>Sana:</b> ' + match.match_date,
              '\u23F0 <b>Vaqt:</b> ' + match.match_time,
              '\uD83C\uDFDF <b>Manzil:</b> ' + match.location,
              '',
              '<i>Barchaga omad yor bo\'lsin!</i>'
          ].join('\n');

          const inlineKeyboard = [];
          if (match.youtube_link) {
              inlineKeyboard.push([{ text: "🔴 Jonli ko'rish", url: match.youtube_link }]);
          }
          inlineKeyboard.push([{ text: "📊 Barcha o'yinlarni ko'rish", url: "https://hfl-forma.vercel.app/schedule" }]);

          const opts = {
              parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: inlineKeyboard
              }
          };

          for (const chatId of chatIds) {
              try {
                  await bot.sendMessage(chatId, message, opts);
              } catch (e) {
                  console.error("Failed to send to", chatId, e.message);
              }
          }
      } catch (err) {
          console.error("Matches listener error:", err);
      }
  })
  .subscribe();

// 6. Realtime listener for Match Results (when match finishes or reverts)
supabase
  .channel('matches-results')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, async (payload) => {
      const oldMatch = payload.old;
      const newMatch = payload.new;

      // Detect status changes
      const isFinished = oldMatch.status !== 'finished' && newMatch.status === 'finished';
      const isReverted = oldMatch.status === 'finished' && newMatch.status === 'scheduled';

      if (!isFinished && !isReverted) return;

      try {
          const { data: homeTeam } = await supabase.from('teams').select('*').eq('id', newMatch.home_team_id).single();
          const { data: awayTeam } = await supabase.from('teams').select('*').eq('id', newMatch.away_team_id).single();

          if (!homeTeam || !awayTeam) return;

          // Fetch match events for summary
          const { data: matchEvents } = await supabase
              .from('match_events')
              .select('*, player:player_id(first_name, last_name)')
              .eq('match_id', newMatch.id)
              .order('minute', { ascending: true });

          // Build goals text
          const homeGoals = (matchEvents || []).filter(e => e.event_type === 'goal' && e.team_id === newMatch.home_team_id);
          const awayGoals = (matchEvents || []).filter(e => e.event_type === 'goal' && e.team_id === newMatch.away_team_id);
          const yellowCards = (matchEvents || []).filter(e => e.event_type === 'yellow_card').length;
          const redCards = (matchEvents || []).filter(e => e.event_type === 'red_card').length;

          const homeGoalsText = homeGoals.map(g => (g.player ? g.player.first_name + ' ' + g.player.last_name : '?') + " " + g.minute + "'").join(', ') || '-';
          const awayGoalsText = awayGoals.map(g => (g.player ? g.player.first_name + ' ' + g.player.last_name : '?') + " " + g.minute + "'").join(', ') || '-';

          // Collect all chat IDs
          const chatIds = new Set();
          if (homeTeam.telegram_chat_id) chatIds.add(homeTeam.telegram_chat_id);
          if (awayTeam.telegram_chat_id) chatIds.add(awayTeam.telegram_chat_id);

          const { data: homePlayers } = await supabase.from('applications').select('telegram_chat_id').eq('team_id', newMatch.home_team_id).not('telegram_chat_id', 'is', null);
          const { data: awayPlayers } = await supabase.from('applications').select('telegram_chat_id').eq('team_id', newMatch.away_team_id).not('telegram_chat_id', 'is', null);
          if (homePlayers) homePlayers.forEach(p => chatIds.add(p.telegram_chat_id));
          if (awayPlayers) awayPlayers.forEach(p => chatIds.add(p.telegram_chat_id));

          let message = '';
          
          if (isFinished) {
              message = [
                  '',
                  '\u26BD <b>O\'yin Yakunlandi!</b>',
                  '',
                  '<b>' + homeTeam.name + '</b> <b>' + (newMatch.home_score || 0) + ' : ' + (newMatch.away_score || 0) + '</b> <b>' + awayTeam.name + '</b>',
                  '',
                  '\uD83C\uDFC6 <b>Liga:</b> ' + (newMatch.league || '-'),
                  '\u26BD <b>' + homeTeam.name + ':</b> ' + homeGoalsText,
                  '\u26BD <b>' + awayTeam.name + ':</b> ' + awayGoalsText,
                  '\uD83D\uDFE8 Sariq: ' + yellowCards + ' | \uD83D\uDFE5 Qizil: ' + redCards,
                  '',
                  '<i>Keyingi o\'yinlarni kuzatib boring!</i>'
              ].join('\n');
          } else if (isReverted) {
              message = [
                  '',
                  '\u26A0\uFE0F <b>O\'yin holati qayta tiklandi!</b>',
                  '',
                  '<b>' + homeTeam.name + '</b> 🆚 <b>' + awayTeam.name + '</b>',
                  'uzrasidagi o\'yin natijasi xatolik tufayli bekor qilindi va o\'yin holati qayta <b>Rejalashtirilgan</b> holatiga qaytarildi.',
                  '',
                  '<i>Noqulaylik uchun uzr so\'raymiz!</i>'
              ].join('\n');
          }

          const opts = {
              parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '\uD83D\uDCCA Barcha o\'yinlarni ko\'rish', url: 'https://hfl-forma.vercel.app/schedule' }]
                  ]
              }
          };

          for (const chatId of chatIds) {
              try {
                  await bot.sendMessage(chatId, message, opts);
              } catch (e) {
                  console.error('Result send failed:', chatId, e.message);
              }
          }
      } catch (err) {
          console.error('Match results listener error:', err);
      }
  })
  .subscribe();

