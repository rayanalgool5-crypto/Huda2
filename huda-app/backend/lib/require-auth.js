// حارس المسارات: كل ما يخص التقدم والإحصائيات لا يعمل إلا بعد تسجيل الدخول.
module.exports = function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });
  }
  next();
};
