const crypto = require('crypto');

// نفس السر المستخدم بـ express-session (server.js)
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production';

// يبني نفس قيمة كوكي "connect.sid" الموقّعة (s:<sid>.<sig>) ليُرسلها الفرونت كـ Bearer token
// عندما يحجب المتصفح كوكيز الطرف الثالث (Safari/Brave/Firefox) بين Netlify و Render.
function issueToken(req) {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(req.sessionID).digest('base64').replace(/=+$/, '');
  return `s:${req.sessionID}.${sig}`;
}

// يحوّل Authorization: Bearer <token> إلى كوكي داخلي ليكمل express-session شغله كالعادة.
function bearerToCookie(req, res, next) {
  const auth = req.headers.authorization || '';
  if (/^Bearer\s+/i.test(auth) && !/(^|;\s*)connect\.sid=/.test(req.headers.cookie || '')) {
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + 'connect.sid=' + encodeURIComponent(token);
  }
  next();
}

module.exports = { SESSION_SECRET, issueToken, bearerToCookie };
