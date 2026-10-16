const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة. حاول بعد قليل.' },
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendEmail({ name, email, message }) {
  const baseUrl = String(process.env.INFOBIP_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.INFOBIP_API_KEY;
  const from = process.env.INFOBIP_FROM;
  const to = process.env.FEEDBACK_TO_EMAIL || process.env.INFOBIP_REPLY_TO || 'rayanalgool5@gmail.com';

  if (!baseUrl || !apiKey || !from || !to) {
    throw new Error('email_not_configured');
  }

  const form = new FormData();
  form.append('from', from);
  form.append('to', to);
  // عند الرد على الرسالة من صندوق البريد، يرجع الرد مباشرة إلى صاحب الرسالة.
  form.append('replyTo', email);
  form.append('subject', `رسالة جديدة من موقع هُدى — ${name}`);
  form.append('text', `اسم المرسل: ${name}\nالبريد الإلكتروني: ${email}\n\nالرسالة:\n${message}`);
  form.append(
    'html',
    `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.9">` +
      `<h2>رسالة جديدة من موقع هُدى</h2>` +
      `<p><b>الاسم:</b> ${escapeHtml(name)}</p>` +
      `<p><b>البريد الإلكتروني:</b> ${escapeHtml(email)}</p>` +
      `<hr>` +
      `<p><b>الرسالة:</b></p>` +
      `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>` +
    `</div>`
  );

  const response = await fetch(`${baseUrl}/email/3/send`, {
    method: 'POST',
    headers: {
      Authorization: `App ${apiKey}`,
      Accept: 'application/json',
    },
    body: form,
  });

  if (!response.ok) {
    let details = '';
    try { details = await response.text(); } catch (_) {}
    console.error('Infobip contact email failed:', response.status, details);
    throw new Error('email_send_failed');
  }
}

// نموذج التواصل العام: لا يحتاج المستخدم لتسجيل الدخول.
router.post('/message', limiter, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const message = String(req.body?.message || '').trim();

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ message: 'الاسم مطلوب ويجب أن يكون بين حرفين و80 حرفاً.' });
  }
  if (!EMAIL_REGEX.test(email) || email.length > 160) {
    return res.status(400).json({ message: 'البريد الإلكتروني غير صحيح.' });
  }
  if (message.length < 5 || message.length > 3000) {
    return res.status(400).json({ message: 'الرسالة مطلوبة ويجب ألا تتجاوز 3000 حرف.' });
  }

  try {
    await sendEmail({ name, email, message });
    return res.json({ success: true, message: 'تم إرسال رسالتك بنجاح. شكراً لتواصلك مع هُدى.' });
  } catch (error) {
    console.error('Public contact email error:', error.message);
    return res.status(503).json({ message: 'تعذّر إرسال الرسالة حالياً. تأكد من إعدادات البريد على الخادم وحاول مرة أخرى.' });
  }
});

module.exports = router;
