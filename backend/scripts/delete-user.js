// حذف مستخدم بالكامل من قاعدة البيانات (الحساب + كل البيانات المرتبطة به)
// الاستخدام: node delete-user.js user@example.com
// يعمل مباشرة على backend/db.js — نفس قاعدة البيانات التي يستخدمها السيرفر.

const db = require('../db');

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('استخدام: node delete-user.js <email>');
  process.exit(1);
}

const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
if (!user) {
  console.log(`لا يوجد مستخدم بالبريد: ${email}`);
  process.exit(0);
}

const uid = user.id;

const deleteAll = db.transaction(() => {
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM password_reset_codes WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM tasbeeh_progress WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM reading_progress WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM ayah_progress WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM surah_progress WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM error_events WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM daily_activity WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM user_stats WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM contact_messages WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM game_generation_log WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM games WHERE owner_id = ?').run(uid);
  db.prepare('DELETE FROM friendships WHERE user_a_id = ? OR user_b_id = ?').run(uid, uid);
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
});

deleteAll();

console.log(`تم حذف المستخدم بالكامل: ${user.name} <${user.email}> (id=${uid})`);
