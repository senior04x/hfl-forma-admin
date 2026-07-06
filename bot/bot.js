const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Config
const TELEGRAM_TOKEN = '8920990708:AAEhrRtX06AEDhJyKNx_CSLWYMNSYviEYHc';
const SUPABASE_URL = 'https://xzzyhfyazwohdqqbjiiy.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6enloZnlhendvaGRxcWJqaWl5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzEwMzU1MSwiZXhwIjoyMDk4Njc5NTUxfQ.Z_qdzR5mYepOEyW57WXl9fb1v5FV4xEYDP-LvihiU6I';

// Initialize Telegram Bot & Supabase
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Render Web Service requires binding to a PORT
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('HFL Bot is running...');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

console.log('Telegram Bot is starting up... waiting for messages');

// 1. Deep Link Handler
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const deepLinkParam = match[1]; // e.g., 'app_UUID'

    if (deepLinkParam.startsWith('app_')) {
        const applicationId = deepLinkParam.replace('app_', '');
        
        try {
            // Check if application exists
            const { data, error } = await supabase
                .from('applications')
                .select('*')
                .eq('id', applicationId)
                .single();

            if (error || !data) {
                return bot.sendMessage(chatId, "Bunday zayavka topilmadi. Yoki id noto'g'ri.");
            }

            // Update telegram_chat_id
            const { error: updateError } = await supabase
                .from('applications')
                .update({ telegram_chat_id: chatId })
                .eq('id', applicationId);

            if (updateError) {
                console.error('Error updating chat ID:', updateError);
            }

            // Send welcoming message with status
            let statusText = '⏳ Kutilmoqda';
            if (data.status === 'approved') statusText = '✅ Tasdiqlangan';
            if (data.status === 'rejected') statusText = '❌ Rad etilgan';

            const message = `
🎉 <b>Havas Futbol Ligasi</b>

Assalomu alaykum, <b>${data.first_name} ${data.last_name}</b>!
Sizning zayavkangiz tizimga muvaffaqiyatli qabul qilindi.

<b>Zayavka ma'lumotlari:</b>
📞 Telefon: ${data.phone}
📝 Izoh: ${data.comment}

<b>Hozirgi holat:</b> ${statusText}

<i>Zayavkangiz holati o'zgarganda shu yerda avtomatik xabar olasiz!</i>
            `;

            bot.sendMessage(chatId, message, { parse_mode: 'HTML' });

        } catch (err) {
            console.error(err);
            bot.sendMessage(chatId, "Xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring.");
        }
    } else if (deepLinkParam.startsWith('team_')) {
        const teamId = deepLinkParam.replace('team_', '');
        
        try {
            const { data, error } = await supabase
                .from('teams')
                .select('*')
                .eq('id', teamId)
                .single();

            if (error || !data) {
                return bot.sendMessage(chatId, "Bunday jamoa topilmadi. Yoki id noto'g'ri.");
            }

            const { error: updateError } = await supabase
                .from('teams')
                .update({ telegram_chat_id: chatId })
                .eq('id', teamId);

            if (updateError) {
                console.error('Error updating chat ID:', updateError);
            }

            let statusText = '⏳ Kutilmoqda';
            if (data.status === 'approved') statusText = '✅ Tasdiqlangan';
            if (data.status === 'rejected') statusText = '❌ Rad etilgan';
            if (data.status === 'partially_approved') statusText = '⚠️ Qisman';

            const message = `
🎉 <b>Havas Futbol Ligasi</b>

Assalomu alaykum! <b>${data.name}</b> jamoasi tizimga qabul qilindi.

<b>Jamoa ma'lumotlari:</b>
🏆 Turnir: ${data.league || 'Kiritilmagan'}
📞 Sardor telefoni: ${data.captain_phone}

<b>Hozirgi holat:</b> ${statusText}

<i>Jamoa holati o'zgarganda shu yerda avtomatik xabar olasiz!</i>
            `;

            bot.sendMessage(chatId, message, { parse_mode: 'HTML' });

        } catch (err) {
            console.error(err);
            bot.sendMessage(chatId, "Xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring.");
        }
    }
});

// Default start command
bot.onText(/\/start$/, (msg) => {
    bot.sendMessage(msg.chat.id, "Assalomu alaykum! Bu Havas Futbol Ligasining rasmiy boti. Zayavka holatini kuzatish uchun sayt orqali ro'yxatdan o'ting.");
});

// 2. Realtime listener for status changes
supabase
  .channel('applications-status')
  .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'applications' 
  }, (payload) => {
      const oldRecord = payload.old;
      const newRecord = payload.new;

      // Only send if status actually changed and telegram_chat_id exists
      if (oldRecord.status !== newRecord.status && newRecord.telegram_chat_id) {
          let statusText = '⏳ Kutilmoqda';
          if (newRecord.status === 'approved') statusText = '✅ Tasdiqlangan';
          if (newRecord.status === 'rejected') statusText = '❌ Rad etilgan';

          const message = `
🔔 <b>Zayavka holati o'zgardi!</b>

Hurmatli ${newRecord.first_name}, sizning zayavkangiz tekshirildi.
<b>Yangi holat:</b> ${statusText}
          `;
          
          bot.sendMessage(newRecord.telegram_chat_id, message, { parse_mode: 'HTML' })
             .catch(err => console.error('Error sending message:', err));
      }
  })
  .subscribe();

// 3. Realtime listener for team status changes
supabase
  .channel('teams-status')
  .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'teams' 
  }, (payload) => {
      const oldRecord = payload.old;
      const newRecord = payload.new;

      if (oldRecord.status !== newRecord.status && newRecord.telegram_chat_id) {
          let statusText = '⏳ Kutilmoqda';
          if (newRecord.status === 'approved') statusText = '✅ Tasdiqlangan (Barcha o\'yinchilar)';
          if (newRecord.status === 'rejected') statusText = '❌ Rad etilgan (Barcha o\'yinchilar)';
          if (newRecord.status === 'partially_approved') statusText = '⚠️ Qisman (Ba\'zi o\'yinchilar rad etilgan)';

          const message = `
🔔 <b>${newRecord.name}</b> jamoasi holati o'zgardi!

<b>Yangi holat:</b> ${statusText}

Admin panel orqali ma'lumotlar tekshirildi. To'liq tafsilotlarni bilish uchun adminlar bilan bog'lanishingiz mumkin.
          `;
          
          bot.sendMessage(newRecord.telegram_chat_id, message, { parse_mode: 'HTML' })
             .catch(err => console.error('Error sending message:', err));
      }
  })
  .subscribe();
