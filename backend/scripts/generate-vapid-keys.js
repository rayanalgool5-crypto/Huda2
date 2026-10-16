// شغّل هذا الملف مرة واحدة لتوليد مفاتيح VAPID الخاصة بمشروعك:
//   node backend/scripts/generate-vapid-keys.js
// انسخ الناتج والصقه بملف backend/.env (محلياً) وبمتغيرات البيئة على منصة
// الاستضافة (Render/Railway/إلخ) وقت النشر. لا تشارك VAPID_PRIVATE_KEY مع أحد
// ولا ترفعه على GitHub — هو سرّ خاص بسيرفرك فقط.

const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('\n✓ تم توليد مفاتيح VAPID جديدة. أضفها إلى backend/.env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:your-email@example.com\n`);
console.log('⚠️  لا تولّد مفاتيح جديدة بعد ما يشترك مستخدمون حقيقيون — أي اشتراك قديم');
console.log('   بيتوقف عن العمل لو غيّرت المفاتيح (لازم يعيدوا تفعيل الإشعارات).\n');
