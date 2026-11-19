const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { issueToken } = require('../lib/session-token');

const router = express.Router();
const databasePath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'huda.db');
// Store attachments beside SQLite so a persistent database volume also preserves uploads.
const uploadDir = path.join(path.dirname(databasePath), 'contact-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة. حاول بعد قليل.' },
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات تسجيل دخول كثيرة. حاول بعد قليل.' },
});

function requireAdmin(req, res, next) {
  if (req.session?.admin === true) return next();
  return res.status(401).json({ message: 'يجب تسجيل دخول الإدارة أولاً.' });
}

function parseMultipart(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) return reject(Object.assign(new Error('صيغة رفع الملفات غير صحيحة.'), { status: 400 }));
    const boundary = Buffer.from('--' + (match[1] || match[2]));
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('حجم الطلب كبير جداً.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const fields = {};
        const files = [];
        let cursor = body.indexOf(boundary);
        while (cursor !== -1) {
          cursor += boundary.length;
          if (body.slice(cursor, cursor + 2).toString() === '--') break;
          if (body.slice(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
          const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor);
          if (headerEnd < 0) break;
          const headers = body.slice(cursor, headerEnd).toString('utf8');
          const next = body.indexOf(boundary, headerEnd + 4);
          if (next < 0) break;
          let dataEnd = next;
          if (body.slice(dataEnd - 2, dataEnd).toString() === '\r\n') dataEnd -= 2;
          const data = body.slice(headerEnd + 4, dataEnd);
          const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
          const fieldName = disposition.match(/name="([^"]+)"/i)?.[1];
          const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
          if (fieldName && filename !== undefined && filename !== '') {
            const mime = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || '';
            files.push({ fieldName, originalName: path.basename(filename).slice(0, 180), mime, data });
          } else if (fieldName) {
            fields[fieldName] = data.toString('utf8');
          }
          cursor = next;
        }
        resolve({ fields, files });
      } catch (error) { reject(error); }
    });
  });
}

function identifyImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function adminMessageDetails(id) {
  const message = db.prepare(`SELECT id, sender_name AS name, category, message, status, created_at
    FROM contact_messages WHERE id = ?`).get(id);
  if (!message) return null;
  const attachments = db.prepare(`SELECT id, original_name AS name, mime_type AS type, size
    FROM contact_attachments WHERE message_id = ? ORDER BY id`).all(id)
    .map(file => ({ ...file, url: `/feedback/admin/attachments/${file.id}` }));
  const replies = db.prepare(`SELECT id, reply_text AS text, created_at FROM contact_replies
    WHERE message_id = ? ORDER BY id`).all(id);
  return { ...message, attachments, replies };
}

// إرسال رسالة داخلية دون طلب تسجيل حساب.
router.post('/message', limiter, async (req, res) => {
  const savedFiles = [];
  try {
    const { fields, files } = await parseMultipart(req);
    const name = String(fields.name || '').trim();
    const category = String(fields.category || '').trim();
    const message = String(fields.message || '').trim();
    if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'الاسم مطلوب ويجب أن يكون بين حرفين و80 حرفاً.' });
    if (!['problem', 'suggestion'].includes(category)) return res.status(400).json({ message: 'يرجى اختيار تصنيف الرسالة.' });
    if (message.length < 5 || message.length > 3000) return res.status(400).json({ message: 'الرسالة مطلوبة ويجب ألا تتجاوز 3000 حرف.' });
    if (files.length > 5) return res.status(400).json({ message: 'يمكن إرفاق خمس صور كحد أقصى.' });
    let totalSize = 0;
    const validated = files.map(file => {
      const actualType = identifyImage(file.data);
      if (!actualType || actualType !== file.mime) throw Object.assign(new Error('يسمح بإرفاق صور PNG أو JPG أو WEBP صالحة فقط.'), { status: 400 });
      if (file.data.length > 5 * 1024 * 1024) throw Object.assign(new Error('يجب ألا يتجاوز حجم الصورة الواحدة 5 ميجابايت.'), { status: 400 });
      totalSize += file.data.length;
      return { ...file, mime: actualType };
    });
    if (totalSize > 10 * 1024 * 1024) return res.status(400).json({ message: 'إجمالي حجم الصور يجب ألا يتجاوز 10 ميجابايت.' });

    const insertMessage = db.prepare(`INSERT INTO contact_messages (sender_name, category, message) VALUES (?, ?, ?)`);
    const messageId = Number(insertMessage.run(name, category, message).lastInsertRowid);
    const insertFile = db.prepare(`INSERT INTO contact_attachments (message_id, stored_name, mime_type, original_name, size) VALUES (?, ?, ?, ?, ?)`);
    try {
      for (const file of validated) {
        const ext = file.mime === 'image/png' ? '.png' : file.mime === 'image/jpeg' ? '.jpg' : '.webp';
        const storedName = crypto.randomBytes(24).toString('hex') + ext;
        fs.writeFileSync(path.join(uploadDir, storedName), file.data, { flag: 'wx', mode: 0o600 });
        savedFiles.push(storedName);
        insertFile.run(messageId, storedName, file.mime, file.originalName, file.data.length);
      }
    } catch (error) {
      db.prepare('DELETE FROM contact_messages WHERE id = ?').run(messageId);
      throw error;
    }
    return res.status(201).json({ success: true, message: 'تم إرسال رسالتك بنجاح. شكراً لتواصلك مع هُدى.' });
  } catch (error) {
    for (const filename of savedFiles) { try { fs.unlinkSync(path.join(uploadDir, filename)); } catch {} }
    console.error('Internal contact submission error:', error.message);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'تعذّر إرسال الرسالة حالياً. حاول مرة أخرى.' });
  }
});

// دخول الإدارة: كلمة مرور واحدة، دون اسم مستخدم أو بريد.
router.post('/admin/login', adminLoginLimiter, async (req, res) => {
  const password = String(req.body?.password || '');
  if (!password || password.length > 128) return res.status(400).json({ message: 'أدخل كلمة المرور.' });
  const admin = db.prepare('SELECT password_hash FROM admin_accounts WHERE id = 1').get();
  const valid = admin && await bcrypt.compare(password, admin.password_hash);
  if (!valid) return res.status(401).json({ message: 'كلمة المرور غير صحيحة.' });
  req.session.regenerate(error => {
    if (error) return res.status(500).json({ message: 'تعذّر إنشاء جلسة الإدارة.' });
    req.session.admin = true;
    req.session.adminAuthenticatedAt = Date.now();
    req.session.save(saveError => {
      if (saveError) return res.status(500).json({ message: 'تعذّر إنشاء جلسة الإدارة.' });
      res.json({ success: true, token: issueToken(req) });
    });
  });
});

router.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.admin = false;
  req.session.save(error => error ? res.status(500).json({ message: 'تعذّر إنهاء الجلسة.' }) : res.json({ success: true }));
});
router.get('/admin/session', requireAdmin, (req, res) => res.json({ authenticated: true }));

router.get('/admin/messages', requireAdmin, (req, res) => {
  const messages = db.prepare(`SELECT m.id, m.sender_name AS name, m.category, m.status, m.created_at,
    (SELECT COUNT(*) FROM contact_attachments a WHERE a.message_id = m.id) AS attachment_count,
    (SELECT COUNT(*) FROM contact_replies r WHERE r.message_id = m.id) AS reply_count
    FROM contact_messages m ORDER BY m.created_at DESC, m.id DESC`).all();
  res.json({ messages });
});

router.get('/admin/messages/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'رقم الرسالة غير صحيح.' });
  const details = adminMessageDetails(id);
  if (!details) return res.status(404).json({ message: 'الرسالة غير موجودة.' });
  res.json({ message: details });
});

router.post('/admin/messages/:id/replies', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const text = String(req.body?.text || '').trim();
  if (!db.prepare('SELECT id FROM contact_messages WHERE id = ?').get(id)) return res.status(404).json({ message: 'الرسالة غير موجودة.' });
  if (text.length < 1 || text.length > 3000) return res.status(400).json({ message: 'اكتب رداً لا يتجاوز 3000 حرف.' });
  db.prepare('INSERT INTO contact_replies (message_id, reply_text) VALUES (?, ?)').run(id, text);
  db.prepare("UPDATE contact_messages SET status = 'replied' WHERE id = ?").run(id);
  res.status(201).json({ success: true, message: adminMessageDetails(id) });
});

router.patch('/admin/messages/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  if (!['new', 'reviewed', 'replied'].includes(status)) return res.status(400).json({ message: 'حالة الرسالة غير صحيحة.' });
  const result = db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status, id);
  if (!result.changes) return res.status(404).json({ message: 'الرسالة غير موجودة.' });
  res.json({ success: true });
});

router.delete('/admin/messages/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const files = db.prepare('SELECT stored_name FROM contact_attachments WHERE message_id = ?').all(id);
  const result = db.prepare('DELETE FROM contact_messages WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ message: 'الرسالة غير موجودة.' });
  for (const file of files) { try { fs.unlinkSync(path.join(uploadDir, file.stored_name)); } catch {} }
  res.json({ success: true });
});

router.get('/admin/attachments/:id', requireAdmin, (req, res) => {
  const file = db.prepare('SELECT stored_name, mime_type FROM contact_attachments WHERE id = ?').get(Number(req.params.id));
  if (!file) return res.status(404).end();
  const filePath = path.join(uploadDir, file.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(filePath).pipe(res);
});

router.post('/admin/password', requireAdmin, async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  const confirm = String(req.body?.confirmPassword || '');
  if (next.length < 10 || next.length > 128) return res.status(400).json({ message: 'يجب أن تتكون كلمة المرور الجديدة من 10 أحرف على الأقل.' });
  if (next !== confirm) return res.status(400).json({ message: 'تأكيد كلمة المرور غير مطابق.' });
  const row = db.prepare('SELECT password_hash FROM admin_accounts WHERE id = 1').get();
  if (!row || !(await bcrypt.compare(current, row.password_hash))) return res.status(401).json({ message: 'كلمة المرور الحالية غير صحيحة.' });
  const hash = await bcrypt.hash(next, 12);
  db.prepare("UPDATE admin_accounts SET password_hash = ?, updated_at = datetime('now') WHERE id = 1").run(hash);
  res.json({ success: true, message: 'تم تغيير كلمة مرور الإدارة بنجاح.' });
});

module.exports = router;
