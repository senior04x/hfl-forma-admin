# Liga darajasi — birinchi bosqich

## Qo‘llash tartibi

1. Supabase SQL Editor orqali `20260911_add_league_tier.sql` migratsiyasini qo‘llang.
2. Ustun yaratilganini quyidagi faqat o‘quvchi so‘rov bilan tekshiring:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leagues' AND column_name = 'tier';
```

3. Shundan keyin yangilangan web va mobil adminni ishga tushiring. Migratsiyasiz
   yangi formalardan liga saqlash xato beradi; daraja jimgina tashlab yuborilmaydi.

Mavjud ligalar avtomatik tasniflanmaydi. `NULL` — daraja belgilanmagan, `1` va `2`
— admin tanlagan daraja. Migratsiya autentifikatsiya, RLS va turnirlarni o‘zgartirmaydi.

## Foydalanuvchi tekshiruvi

- Web: `amatora-organization/admin` papkasida `npm run dev` → Sozlamalar → liga tahriri.
- App: `amatora-admin-app` papkasida `npx expo start` → Ligalar → liga tahriri.
- Darajasiz liga “Daraja belgilanmagan” ko‘rsatishini tekshiring.
- Ruxsat berilgan test ligasini webda 1-daraja qilib saqlang; app ro‘yxatini
  yangilaganda shu daraja ko‘rinishi kerak.
- Appda 2-daraja qilib saqlang; web sahifasini yangilaganda shu daraja ko‘rinishi kerak.
- Daraja tanlanmasa saqlash bloklanishi, internet uzilganda muvaffaqiyat xabari
  chiqmasligi kerak. Test ligasini yaratsangiz, haqiqiy musobaqa ma’lumotini ishlatmang.

## Keyingi bosqich

Bu o‘zgarish OBS uchun daraja cheklovini hali yoqmaydi. Keyingi bosqichda controller,
ikkala MatchControl, muallifsiz gol, aniq replay/event bog‘lanishi va diskda saqlanadigan
qayta yuklash navbati birga amalga oshiriladi. Eski controller ushbu ustunni o‘qimaydi.
