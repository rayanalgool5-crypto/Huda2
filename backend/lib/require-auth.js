// حارس المسارات: الحساب يجب أن يكون مسجّل دخول.
const db = require('../db');
module.exports = function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
    return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });
  }
  next();
};
