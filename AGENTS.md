# Tashkilot va superadmin chegarasi

Admin vakolatini o‘zgartirishdan oldin [docs/ADMIN-AUTHORITY-MODEL.md](docs/ADMIN-AUTHORITY-MODEL.md) ni o‘qing.

`admin_users` ekotizim superadminiga (`amatora-superadmin`) tegishli. Tashkilot admini (`admin/`, shuningdek `amatora-admin-app`) tashkiloti `organizations` orqali tasdiqlanadi. Tashkilot adminiga yetishmayotgan ruxsatni tuzatish uchun `admin_users` yozuvi yaratmang. Tashkilot topilmasa ID 1 yoki boshqa mijozga avtomatik yo‘naltirmang.

Eski shared authorization, transfer SQL draftlari va testlarda bunga zid taxminlar mavjud bo‘lishi mumkin; ularni modelga moslashtirmasdan deploy qilmang. Yuqoridagi workspace AGENTS.md xavfsizlik qoidalari ham amal qiladi.
