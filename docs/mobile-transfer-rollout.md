# Mobil transfer — webdan alohida rollout

2026-10-01 foydalanuvchi talabi: amatora-organization/client hozirgi transfer tartibida ishlashda davom etadi. Yangi uch tomon roziligi mobil oqimga tegishli. Telegram faqat holat va ilovaga yo‘naltirish uchun ishlatiladi.

## Ajratish

- `transfers.app_consent_required` default `false`: barcha mavjud qatorlar va o‘zgarmagan web request_team_transfer INSERTlari eski tartibda qoladi.
- Tekshirilgan `request_transfer_app` RPC yangi mobil arizani `true` bilan yaratadi. Eski web RPC o‘zgarmagan.
- Yaratilgandan keyin workflow belgisini o‘zgartirish bloklanadi. Mobil arizani web turiga aylantirib rozilikdan chetlab o‘tish mumkin emas.
- Uch tomon roziligi va adminning mavjud a’zolik/karyera tranzaksiyasi faqat mobil arizalarda birlashadi. Web qarorining mavjud triggerlari qayta yozilmadi.
- Ilovaning consent endpointi web arizasiga qaror yozishni rad etadi.

## Tayyorlangan, hali deploy qilinmagan

- Mobil ariza roziligi jadvali va faqat mobil approval uchun uch tomon tekshiruvi.
- Futbolchi uchun bir soatlik OTP sessiyasi: bazada token hash, 5 urinish chegarasi, kodni atomik iste’mol qilish.
- Sardor uchun mavjud team_sessions va joriy captain_phone tekshiruvi qayta ishlatiladi.
- Qaror RPCsi subyektni sessiyadan oladi; bir rol uchun bir qaror, qayta yuborilganda idempotent natija. Boshqa qarorga o‘zgartirish konflikt qaytaradi.
- verify-transfer-player, transfer-consent, request-transfer-app va transfer-app-page Edge Function manba kodi. 10 ta offline HTTP test o‘tdi.
- Lokal PGlite PostgreSQL muhitida 5 ta integration test o‘tdi: yangi migrationlar, mobil va legacy web tasdiqi, atomik a’zolik/karyera, rad javobi, begona subyekt, OTP, function ruxsatlari va bir xil Telegram chatni deduplikatsiya qilish. Production Supabase sxemasi bilan integratsiya va haqiqiy parallel ulanishlar hali tekshirilmagan.
- Mobil va ikkala admin klientidagi rozilik ekranlari kodda tayyor. Telegram worker faqat HTTPS ilova havolasini beradi, qaror callbacklari yo‘q. Migration 005 tarixiy arizalarni qayta navbatga qo‘ymaydi.

## Lokal server testini qaytarish

Test runtime dependency `@electric-sql/pglite`ni loyiha tashqarisidagi test katalogiga o‘rnating. `PGLITE_TEST_MODULE`ga uning `dist/index.js` faylining mutlaq `file:///` URLini bering (bo‘shliqlar `%20`). Keyin loyiha ildizida:

```powershell
node --test tests/transfer-postgres.test.mjs supabase/functions/_shared/transfer-app-http.test.mjs
```

Test hech qanday Supabase yoki Telegram manziliga ulanmaydi; barcha ma’lumot xotiradagi lokal bazada.

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
