const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const requireAuth = require('../lib/require-auth');

const router = express.Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { message: 'محاولات كثيرة. حاول بعد قليل.' } });
function escapeHtml(v) { return String(v ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }
async function sendEmail({ name, email, message }) {
  const baseUrl = String(process.env.INFOBIP_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.INFOBIP_API_KEY;
  const from = process.env.INFOBIP_FROM;
  const to = process.env.FEEDBACK_TO_EMAIL || from;
  if (!baseUrl || !apiKey || !from || !to) throw new Error('email_not_configured');
  const form = new FormData();
  form.append('from', from); form.append('to', to);
  form.append('subject', `تعليق جديد في هُدى — ${name}`);
  form.append('text', `اسم المستخدم: ${name}\nالبريد: ${email}\n\n${message}`);
  form.append('html', `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>تعليق جديد في هُدى</h2><p><b>الاسم:</b> ${escapeHtml(name)}</p><p><b>البريد:</b> ${escapeHtml(email)}</p><hr><p style="white-space:pre-wrap">${escapeHtml(message)}</p></div>`);
  const r = await fetch(`${baseUrl}/email/3/send`, { method:'POST', headers:{ Authorization:`App ${apiKey}`, Accept:'application/json' }, body:form });
  if (!r.ok) throw new Error('email_send_failed');
}

router.get('/comments', (req,res) => {
  const rows = db.prepare(`SELECT c.id,c.user_id,c.message,c.created_at,u.name FROM comments c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 100`).all();
  res.json({ comments: rows });
});
router.post('/comments', requireAuth, limiter, async (req,res) => {
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 1000) return res.status(400).json({ message:'التعليق مطلوب وبحد أقصى 1000 حرف.' });
  const user = db.prepare('SELECT name,email FROM users WHERE id=?').get(req.session.userId);
  const row = db.prepare('INSERT INTO comments(user_id,message) VALUES (?,?)').run(req.session.userId, message);
  try { await sendEmail({ name:user.name, email:user.email, message }); }
  catch (err) { console.error('Feedback email error:', err.message); }
  res.status(201).json({ id:Number(row.lastInsertRowid), message:'تم نشر تعليقك وإرساله إلى البريد.' });
});
module.exports = router;
