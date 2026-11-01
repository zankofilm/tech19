# نصب Patch حضور و غیاب معلم — v3.5.0

این Patch برای هماهنگی API هاست با نسخه Android `3.5.0-attendance-pro` لازم است.

## تغییر رفتار

Endpoint زیر همچنان حفظ شده است:

`POST /api/teacher/attendance/submit`

و علاوه بر `presentStudentIds`، فیلد `studentStatuses` را می‌پذیرد:

- `present`
- `absent_excused`
- `absent_unexcused`

معلم فقط برای کلاس/درس/زنگی که در دامنه تدریس خودش است امکان ثبت دارد. محدودیت روز، بازه زمانی حضور و تعطیلی‌ها نیز مثل قبل برقرار است.

## نصب

1. از `server.mjs` فعلی هاست بکاپ بگیرید.
2. فایل `host-patch/server.mjs` را جایگزین `server.mjs` هاست کنید.
3. سرویس Node را Restart کنید.
4. APK نسخه 3.5.0 را نصب و حضور یک کلاس فعال را تست کنید.

فایل `server-attendance-v3.5.0.diff` نیز برای مشاهده دقیق تغییرات قرار داده شده است.
