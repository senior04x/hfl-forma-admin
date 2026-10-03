# AMATORA admin vakolatlari

Manba: loyiha egasining 2026-10-04 dagi aniqlashtirishi.

| Loyiha | Vakolat | Asosiy manba |
| --- | --- | --- |
| `amatora-superadmin` | Ekotizim superadmini, tashkilot yaratish va boshqarish | `public.admin_users` |
| `amatora-organization/admin` | Faqat o‘z tashkilotining administratori | `public.organizations` |
| `amatora-admin-app` | Faqat o‘z tashkilotining administratori | `public.organizations` |

Tashkilot adminini aniqlashda Supabase Auth tasdiqlagan hisobdan foydalaning. Mavjud `organizations.admin_email` bog‘lanishini foydalanuvchi yuborgan email, local storage yoki qurilmadagi tashkilot ID bilan almashtirmang. Moslik bitta bo‘lishi kerak; yo‘q yoki noaniq moslikda kirish to‘xtatiladi. ID 1 yoki birinchi tashkilot hech qachon default emas.

Frontend tashkilot tanlashi backend vakolatini almashtirmaydi. Backend va RLS ham tashkilot chegarasini tekshirishi, vakolat manbasini oddiy mijoz o‘zgartira olmasligi kerak. Tashkilot ichidagi `organization_users` foydalanuvchilari alohida rol hisoblanadi.

## Oldingi taxminni tuzatish

Tashkilot adminlari uchun `admin_users` yozuvini majburiy qilgan mahalliy o‘zgarishlar noto‘g‘ri taxminga asoslangan. `azamat@havas.uz` uchun bu jadvalga yozuv yaratilmadi. Web/mobile organization context, transfer access RPC draftlari, shared admin authorization yordamchilari va ularning testlari ushbu model asosida qayta ko‘rib chiqilishi kerak. Oldingi `admin_users` asosidagi draftlarni tashkilot admini uchun productionga qo‘llamang.

Bu hujjat xavfsizlik tekshiruvlari yakunlanganini yoki productionga tayyorlikni bildirmaydi.
