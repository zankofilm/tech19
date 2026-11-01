# نصب Patch هاست برای اپ 3.6.0

این نسخه Android برای پنج جریان کاری جدید از endpointهای محدودشده به Scope معلم استفاده می‌کند.

1. از `server.mjs` فعلی هاست نسخه پشتیبان بگیرید.
2. فایل `host-patch/server.mjs` این بسته را جایگزین `server.mjs` هاست کنید.
3. سرویس Node را Restart کنید.
4. `GET /app/api/ping` را بررسی کنید.

Endpointهای افزوده‌شده:
- `GET /api/staff/mobile/students`
- `GET /api/staff/mobile/gradebook`
- `GET|POST /api/staff/mobile/class-journal`
- `GET /api/staff/mobile/homework-center`
- `GET /api/staff/mobile/grading-queue`
- `GET /api/staff/mobile/grading-detail`

تمام مسیرها احراز هویت Bearer و Scope تخصیص تدریس معلم را کنترل می‌کنند. دفتر کلاسی از permission رسمی `classJournal` استفاده می‌کند.
