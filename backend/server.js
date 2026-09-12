require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');
const memorizationRoutes = require('./routes/memorization');
const statsRoutes = require('./routes/stats');
const hadithRoutes = require('./routes/hadith');
const pushRoutes = require('./routes/push');
const gamesRoutes = require('./routes/games'); // معطّل حالياً - انظر server.js أسفل
const quranDownloadRoutes = require('./routes/quran-download');
const prayerPushScheduler = require('./lib/prayer-push-scheduler');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// مهم جداً: Render (وأي منصة استضافة مشابهة) بتحط التطبيق خلف بروكسي عكسي واحد،
// وبترسل هيدر X-Forwarded-For. express-rate-limit (المستخدم بـ /register و/login
// و/forgot-password) بيرفض أي طلب فيه هالهيدر إذا "trust proxy" مو مفعّل — يعني
// بدون هالسطر، كل تسجيل دخول/تسجيل حساب/نسيت كلمة سر رح يرجّع خطأ 500 بعد النشر.
// "1" تعني: ثق بأول بروكسي بس (خطوة واحدة)، وهو المناسب لـ Render/Railway ومعظم
// منصات PaaS المشابهة. لا تستخدم "true" لأنها تسمح لأي حد يزوّر عنوان الـ IP بسهولة.
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
// ملاحظة: عطّلنا Content-Security-Policy الافتراضية لأن صفحات الفرونت اند
// (forgot-password.html وغيرها) فيها سكربتات inline كثيرة تُستخدم فقط للتطوير
// المحلي (عندما يشغّل هذا السيرفر الفرونت اند أيضاً)؛ CSP الافتراضية كانت
// هتمنعها فوراً. باقي حمايات helmet (X-Frame-Options، إلخ) تبقى فعّالة.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS Configuration
// CLIENT_URL يقبل أكثر من نطاق مفصول بفواصل، لأن Netlify بيعطي رابط أساسي
// (مثلاً https://huda.netlify.app) بالإضافة لروابط "deploy preview" مختلفة لكل تحديث.
// مثال: CLIENT_URL=https://huda.netlify.app,https://deploy-preview-12--huda.netlify.app
const corsOrigins = NODE_ENV === 'production'
  ? (process.env.CLIENT_URL || '').split(',').map((url) => url.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  // بالإنتاج: لا نسمح أبداً بأي أصل غير مُدرَج صراحةً (لا wildcard مع credentials).
  const isAllowed = NODE_ENV === 'production'
    ? Boolean(origin) && corsOrigins.includes(origin)
    : (corsOrigins.includes(origin) || !origin);

  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // الفرونت اند (Netlify) والباك اند (مثلاً Render) على نطاقين مختلفين تماماً،
      // فكوكي الجلسة لازم تكون "cross-site" — وهذا يتطلب SameSite=None + Secure (HTTPS إلزامي).
      // بالتطوير المحلي (نفس الأصل) نُبقيها lax لأنه أبسط وما بيحتاج HTTPS.
      secure: NODE_ENV === 'production',
      sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 6, // 6 أيام (حسب طلب المالك)
    },
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/memorization', memorizationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/hadith', hadithRoutes); // لا يحتاج تسجيل دخول — بيانات عامة
app.use('/api/push', pushRoutes); // اشتراكات إشعارات الأذان الحقيقية (Web Push)
// ملاحظة: صفحة "فعاليات هُدى" (استوديو الألعاب بالذكاء الاصطناعي) تم إيقافها
// بالكامل بناءً على طلب المالك - عرض "لم يتم تجهيزها بعد" في الواجهة، وتعطيل
// هذا المسار بالكامل من الخادم حتى لا يبقى فعّالاً بالخلفية.
// app.use('/api/games', gamesRoutes);
app.use('/api/quran', quranDownloadRoutes); // تنزيل السورة (نص فقط في وسم ID3، بدون أي صورة غلاف)

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static files — للتطوير المحلي فقط (تشغيل الفرونت اند والباك اند معاً على نفس البورت).
// بالإنتاج، الفرونت اند بيتنشر بشكل منفصل على Netlify ولا يعتمد على هذا السطر إطلاقاً.
// This must be registered before the 404 handler so the frontend can load locally.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'الصفحة غير موجودة' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ 
    message: NODE_ENV === 'production' 
      ? 'حدث خطأ في الخادم' 
      : err.message 
  });
});

app.listen(PORT, () => {
  console.log(`✓ خادم هُدى يعمل على http://localhost:${PORT}`);
  console.log(`✓ البيئة: ${NODE_ENV}`);
  // مجدول إشعارات الأذان الحقيقية (Push) — يشتغل طول ما هذا الـ process شغّال.
  prayerPushScheduler.start();
});
