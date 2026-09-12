// حارس المسارات: الحساب يجب أن يكون مسجّل دخول وموثّق البريد من قاعدة البيانات.
const db = require('../db');
module.exports = function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });
  const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.session.userId);
  if (!user || Number(user.email_verified) !== 1) {
    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
    return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'يجب توثيق بريدك الإلكتروني أولاً.' });
  }
  next();
};
