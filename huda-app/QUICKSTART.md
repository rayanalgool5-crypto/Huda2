# 🚀 البدء السريع - هُدى

## ⚠️ المتطلبات الأساسية

**تأكد من تشغيل Backend FIRST!**

```bash
cd backend
npm install
npm run dev
```

ستظهر هذه الرسالة عند النجاح:
```
✓ خادم هُدى يعمل على http://localhost:3000
✓ البيئة: development
```

---

## 🌐 الآن افتح التطبيق

بعد تشغيل Backend، افتح:
```
http://localhost:3000
```

---

## 🆘 إذا حصلت على أخطاء:

### ❌ خطأ: "Failed to fetch" أو "الخادم غير متصل"

**الحل:**
1. تأكد من تشغيل Backend: `npm run dev` في مجلد `backend/`
2. تأكد من أنك تستخدم `http://localhost:3000` وليس `file://`

### ❌ خطأ: "Huda is not defined"

**الحل:**
- تأكد من أن جميع الـ script tags موجودة في الترتيب الصحيح:
  1. `config.js` ✓
  2. `utils.js` ✓
  3. `app.js` ✓

---

## 📝 المسارات الرئيسية

| المسار | الوصف |
|--------|--------|
| `/` | الصفحة الرئيسية (تتطلب تسجيل دخول) |
| `/pages/login.html` | تسجيل الدخول |
| `/pages/register.html` | إنشاء حساب جديد |
| `/pages/quran.html` | صفحة القرآن |
| `/pages/hadith.html` | صفحة الأحاديث |
| `/pages/tasbeeh.html` | صفحة التسبيح |

---

## ✅ اختبار API

```bash
cd backend
npm run test
```

---

## 📖 للمزيد من المعلومات

- [دليل الإعداد الكامل](GUIDE.md)
- [توثيق Backend](backend/SETUP.md)
- [الملف اللوني للتحسينات](IMPROVEMENTS.md)

---

**شكراً لاستخدام هُدى!** 💚
