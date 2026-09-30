# Mobil transfer — webdan alohida rollout

2026-10-01 foydalanuvchi talabi: amatora-organization/client hozirgi transfer tartibida ishlashda davom etadi. Yangi uch tomon roziligi mobil oqimga tegishli. Telegram faqat holat va ilovaga yo‘naltirish uchun ishlatiladi.

## Ajratish

- `transfers.app_consent_required` default `false`: barcha mavjud qatorlar va o‘zgarmagan web request_team_transfer INSERTlari eski tartibda qoladi.
- Kelajakdagi tekshirilgan mobil request RPCgina yangi arizani `true` bilan yaratadi. Bu RPC hali yozilmagan; oddiy mijozdan to‘g‘ridan-to‘g‘ri INSERT orqali uning o‘rnini bosish mumkin emas.
- Yaratilgandan keyin workflow belgisini o‘zgartirish bloklanadi. Mobil arizani web turiga aylantirib rozilikdan chetlab o‘tish mumkin emas.
- Uch tomon roziligi va adminning mavjud a’zolik/karyera tranzaksiyasi faqat mobil arizalarda birlashadi. Web qarorining mavjud triggerlari qayta yozilmadi.
- Ilovaning consent endpointi web arizasiga qaror yozishni rad etadi.

## Tayyorlangan, hali deploy qilinmagan

- Mobil ariza roziligi jadvali va faqat mobil approval uchun uch tomon tekshiruvi.
- Futbolchi uchun bir soatlik OTP sessiyasi: bazada token hash, 5 urinish chegarasi, kodni atomik iste’mol qilish.
- Sardor uchun mavjud team_sessions va joriy captain_phone tekshiruvi qayta ishlatiladi.
- Qaror RPCsi subyektni sessiyadan oladi; bir rol uchun bir qaror, qayta yuborilganda idempotent natija. Boshqa qarorga o‘zgartirish konflikt qaytaradi.
- verify-transfer-player va transfer-consent Edge Function manba kodi. 8 ta offline HTTP test o‘tdi. PostgreSQL funksiyalari hali integration sinovidan o‘tmadi.

## Relizdan oldingi zarur ishlar

1. Tekshirilgan mobil so‘rov yaratish va sahifalangan o‘qish RPCsini qo‘shish; eski web RPCni almashtirmaslik.
2. Mobil transfer ekrani: kiruvchi/chiquvchi arizalar, uch rozilik holati, admin qarori, xato va noma’lum natijadan keyin tekshirish.
3. Ikkala admin klientda web/mobil workflow va mobil roziliklarni aniq ko‘rsatish.
4. Telegramda uch tomon uchun mos matnlar va HTTPS orqali ilovaga yo‘naltiruvchi sahifa; tasdiqlash callbacklari bo‘lmasin.
5. Bildirishnoma outboxini uch Telegram qabul qiluvchiga kengaytirish. Bir xil chatdagi bir nechta rollar va event takrorlanishini hisobga olish.
6. Edge Functionlar custom sessionni o‘zi tekshiradi. Deployda Supabase JWT gateway tekshiruvini tegishli yangi functionlar uchungina moslash; umumiy sozlamalarni o‘zgartirmaslik.
7. Stagingda eski web arizasi tasdiqlanishi, 0/1/2 rozilikda mobil bloklanishi, 3 rozilik+admin bilan bitta a’zolik o‘zgarishi, rad javobi, expiry va parallel retrylarni tekshirish.
8. Migration va endpointlar faqat to‘liq mobil oqim tayyor bo‘lgach qo‘llanadi. Tarixiy arizalarga avtomatik Telegram xabari yuborilmaydi.

Asosiy umumiy katalogdagi branch boshqa vazifa tomonidan almashgani sababli ish alohida `feature/mobile-transfer-isolation` worktree’da davom etmoqda.
