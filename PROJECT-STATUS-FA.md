# وضعیت پروژه 3.6.0

- معماری: Native Jetpack Compose + Direct API
- WebView: ندارد
- تم: Teal Pro
- پنج ماژول روزانه جدید: پیاده‌سازی شده
- Patch هاست: داخل `host-patch/`
- syntax `server.mjs`: بررسی و موفق
- smoke test دفتر کلاسی: POST/GET = HTTP 200
- endpointهای Students/Gradebook/Homework/Grading queue: پاسخ HTTP 200 در runtime تستی
- Kotlin: بررسی parser/delimiter موفق؛ Build کامل APK باید در GitHub Actions انجام شود چون Gradle در محیط محلی نصب نیست.
