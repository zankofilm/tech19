# نقشه API نسخه 3.6.0

| قابلیت | مسیر اصلی |
|---|---|
| دانش‌آموزان + عکس | `GET /api/staff/mobile/students` |
| پرونده دانش‌آموز | `GET /api/workbench/students/:id/dossier` |
| دفتر نمره تجمیعی | `GET /api/staff/mobile/gradebook` |
| ثبت مستمر | `POST /api/staff/gradebook/approve-continuous` |
| ثبت پایانی | `POST /api/staff/gradebook/final-mark` |
| دفتر کلاسی | `GET/POST /api/staff/mobile/class-journal` |
| مرکز تکالیف | `GET /api/staff/mobile/homework-center` |
| ساخت/ویرایش تکلیف | `POST /api/staff/homework/p652/save` |
| تصحیح تکلیف | `POST /api/staff/homework/grade` |
| صف تصحیح آزمون | `GET /api/staff/mobile/grading-queue` |
| جزئیات برگه | `GET /api/staff/mobile/grading-detail` |
| نهایی‌سازی تصحیح | `POST /api/staff/exam-grading/p6722` |
