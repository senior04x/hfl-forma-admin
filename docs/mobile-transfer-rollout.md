# Mobil transfer relizi — 2026-10-01

## Oqim

- Web `amatora-organization/client`: hozirgidek faqat admin qaror beradi. Eski web RPC o‘zgarmagan; `app_consent_required` default false.
- Mobil: futbolchi, eski sardor, yangi sardor roziligi; keyin tashkilot adminining yakuniy qarori. Bir tomon rad etsa tasdiqlash bloklanadi.
- Adminning yakuniy status UPDATEsi a’zolik, karyera va bildirishnoma navbatini bitta DB tranzaksiyasida yangilaydi.
- Telegram faqat holat va HTTPS ilova havolasini yuboradi. Tasdiqlash callbacklari yo‘q; bir chatdagi rollar deduplikatsiya qilinadi.
- Sessiya serverda hash bilan, ilovada faqat xotirada saqlanadi. Qaror subyekti sessiyadan olinadi; ariza IDsi yoki havola huquq bermaydi.

## Chiqarilgan

- Supabase `xzzyhfyazwohdqqbjiiy`: 4 yangi Edge Function va 20261001000100–20261001000500 migrationlari. Migrationlar bitta tranzaksiyada qo‘llandi va migration tarixiga yozildi.
- Token/JWT gateway o‘rnida yangi endpointlarning o‘z OTP/session tekshiruvi ishlaydi. Sessiyasiz consent/request/page so‘rovlari HTTP 401, noto‘g‘ri verify so‘rovi HTTP 400 qaytardi. Tekshiruvda real xabar yuborilmadi.
- Bot main: `13c2848`; Railway avtomatik deploy natijasi bu sessiyada tekshirilmagan.
- Web main: `ac53372`; `https://amatora.uz/transfer/<uuid>` sahifasining jonli JS kodi native transfer havolasini o‘z ichiga olishi tasdiqlandi.
- Organization admin main: `17b5ad3`; avvalgi YouTube schedule tuzatishlari saqlandi. Hostingdagi admin deploy natijasi alohida tasdiqlanmagan.
- Asosiy ilova master: `76ce027`; production kanal → master; Android+iOS OTA `54331e25-9f96-4b43-94b9-11457ed81f94`, runtime 1.0.0.
- Admin main: `428d1f2`; production kanal → production; Android+iOS OTA `3276c3e9-5aee-436c-be3b-85fa5f7b3e7c`, runtime 1.0.0.
- Android swipe-exit: Stack navigator gesture yoqildi, boshlanish hududi chap chetdagi 24 px. Androiddagi ekran ichidagi eski custom exit PanResponderlari yoqilmadi, pager bilan ikki gesture raqobat qilmasligi uchun.

## Tekshiruv

- 37 ta mobil test, 51 ta bot test, 9 ta web admin test o‘tdi.
- 10 ta offline HTTP va 5 ta lokal PGlite PostgreSQL integration testi o‘tdi.
- Asosiy va admin ilovasining Android/iOS/Web paketlari yig‘ildi; admin TypeScript tekshiruvi o‘tdi. Asosiy ilovada transferga tegishli fayllarda TypeScript xatolari yo‘q; loyihada avvalgi boshqa TypeScript xatolari mavjud.
- Telefonlarda OTAni qabul qilish, uch haqiqiy ishtirokchi va admin bilan transfer, Android edge swipe/ichki pager/scrollni fizik tekshirish foydalanuvchi talabi bo‘yicha relizdan keyinga qoldirildi.
- OTA faqat mos native buildlarda ishlaydi; Expo Go orqali production OTA tekshirilmaydi.

## Lokal server testini qaytarish

`@electric-sql/pglite`ni loyiha tashqarisidagi test katalogiga o‘rnating. `PGLITE_TEST_MODULE`ga uning `dist/index.js` faylining mutlaq file URLini bering. Test tarmoqqa ulanmaydi, xotiradagi lokal bazani ishlatadi:

```powershell
node --test tests/transfer-postgres.test.mjs supabase/functions/_shared/transfer-app-http.test.mjs
```
