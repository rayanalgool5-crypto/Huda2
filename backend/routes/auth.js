const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

// حماية من تخمين كلمات السر (brute force) وإنشاء حسابات وهمية بالجملة.
// standardHeaders/legacyHeaders: نرسل حدود المعدّل بصيغة RateLimit-* الحديثة فقط.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة جداً. حاول مرة أخرى بعد قليل.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة جداً. حاول مرة أخرى لاحقاً.' },
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة جداً. حاول مرة أخرى بعد قليل.' },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const SALT_ROUNDS = 12;

const RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30);
const EMAIL_VERIFICATION_TTL_HOURS = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);
const EMAIL_VERIFICATION_RESEND_SECONDS = Number(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS || 60);
const RESET_CODE_TTL_MINUTES = Number(process.env.PASSWORD_RESET_OTP_TTL_MINUTES || 10);
const RESET_CODE_MAX_ATTEMPTS = Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS || 5);
const RESET_CODE_RESEND_SECONDS = Number(process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS || 60);
const NAME_CHANGE_LIMIT = 2;
const NAME_CHANGE_COOLDOWN_DAYS = 7;

function validateInput(obj, fields) {
  return fields.filter((field) => {
    const value = obj[field];
    return !value || (typeof value === 'string' && !value.trim());
  });
}

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: 'يجب تسجيل الدخول أولاً.' });
  }
  const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.session.userId);
  if (!user || Number(user.email_verified) !== 1) {
    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
    return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'يجب توثيق بريدك الإلكتروني أولاً.' });
  }
  next();
}

function hashResetValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateResetCode() {
  const length = Number(process.env.PASSWORD_RESET_OTP_LENGTH || 6);
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

function escapeEmailHtml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

async function sendResetEmail({ to, name, code }) {
  const baseUrl = String(process.env.INFOBIP_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.INFOBIP_API_KEY;
  const from = process.env.INFOBIP_FROM;
  const replyTo = process.env.INFOBIP_REPLY_TO || from;

  if (!baseUrl || !apiKey || !from) {
    throw new Error('Infobip email is not configured.');
  }

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;max-width:560px;margin:auto">
      <h2>استعادة كلمة السر — هُدى</h2>
      <p>مرحباً ${escapeEmailHtml(name)}،</p>
      <p>رمز التحقق الخاص باستعادة كلمة السر هو:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0">${escapeEmailHtml(code)}</div>
      <p>الرمز صالح لمدة ${RESET_CODE_TTL_MINUTES} دقائق.</p>
      <p>إذا لم تطلب استعادة كلمة السر، تجاهل هذه الرسالة.</p>
    </div>
  `;
  const text = [
    `مرحباً ${name}،`, '',
    `رمز التحقق الخاص باستعادة كلمة السر هو: ${code}`, '',
    `الرمز صالح لمدة ${RESET_CODE_TTL_MINUTES} دقائق.`,
    'إذا لم تطلب استعادة كلمة السر، تجاهل هذه الرسالة.'
  ].join('\n');

  // Infobip Email API v3: multipart/form-data.
  const form = new FormData();
  form.append('from', from);
  form.append('to', to);
  form.append('subject', 'رمز استعادة كلمة السر — هُدى');
  form.append('text', text);
  form.append('html', html);
  if (replyTo) form.append('headers', JSON.stringify({ 'Reply-To': replyTo }));

  const response = await fetch(`${baseUrl}/email/3/send`, {
    method: 'POST',
    headers: {
      Authorization: `App ${apiKey}`,
      Accept: 'application/json',
    },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Infobip email API error:', response.status, data);
    throw new Error(data?.requestError?.serviceException?.text || data?.message || 'Infobip failed to send the email.');
  }
  return data;
}

async function sendVerificationEmail({ to, name, token }) {
  const baseUrl = String(process.env.INFOBIP_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.INFOBIP_API_KEY;
  const from = process.env.INFOBIP_FROM;
  const replyTo = process.env.INFOBIP_REPLY_TO || from;
  const frontendUrl = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  if (!baseUrl || !apiKey || !from || !frontendUrl) throw new Error('Infobip email verification is not configured.');

  const verifyUrl = `${frontendUrl}/pages/verify-email.html?token=${encodeURIComponent(token)}`;
  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;max-width:560px;margin:auto">
      <h2>تأكيد البريد الإلكتروني — هُدى</h2>
      <p>مرحباً ${escapeEmailHtml(name)}،</p>
      <p>اضغط الزر التالي لتأكيد بريدك الإلكتروني وتفعيل حسابك:</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#087c62;color:#fff;text-decoration:none;border-radius:8px">تأكيد البريد الإلكتروني</a></p>
      <p>الرابط صالح لمدة ${EMAIL_VERIFICATION_TTL_HOURS} ساعة.</p>
      <p>إذا لم تنشئ حساباً في هُدى، تجاهل هذه الرسالة.</p>
    </div>`;
  const text = [`مرحباً ${name}،`, '', 'أكد بريدك الإلكتروني في هُدى عبر الرابط التالي:', verifyUrl, '', `الرابط صالح لمدة ${EMAIL_VERIFICATION_TTL_HOURS} ساعة.`, 'إذا لم تنشئ حساباً في هُدى، تجاهل هذه الرسالة.'].join('\n');
  const form = new FormData();
  form.append('from', from); form.append('to', to); form.append('subject', 'تأكيد البريد الإلكتروني — هُدى'); form.append('text', text); form.append('html', html);
  if (replyTo) form.append('headers', JSON.stringify({ 'Reply-To': replyTo }));
  const response = await fetch(`${baseUrl}/email/3/send`, { method: 'POST', headers: { Authorization: `App ${apiKey}`, Accept: 'application/json' }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('Infobip verification email error:', response.status, data); throw new Error('Email provider rejected the message.'); }
  return data;
}

function createVerificationToken() { return crypto.randomBytes(32).toString('hex'); }

async function issueVerificationEmail(user) {
  const latest = db.prepare('SELECT created_at FROM email_verification_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id);
  const nowMs = Date.now();
  if (latest?.created_at) {
    const lastMs = Date.parse(String(latest.created_at).replace(' ', 'T') + 'Z');
    if (Number.isFinite(lastMs) && nowMs - lastMs < EMAIL_VERIFICATION_RESEND_SECONDS * 1000) {
      const wait = Math.ceil((EMAIL_VERIFICATION_RESEND_SECONDS * 1000 - (nowMs - lastMs)) / 1000);
      const error = new Error(`انتظر ${wait} ثانية قبل إعادة إرسال رسالة التحقق.`); error.code = 'VERIFICATION_COOLDOWN'; error.wait = wait; throw error;
    }
  }
  const token = createVerificationToken();
  await sendVerificationEmail({ to: user.email, name: user.name, token });
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id);
  db.prepare("INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' hours'))").run(user.id, hashResetValue(token), EMAIL_VERIFICATION_TTL_HOURS);
}

// ---------- تسجيل حساب جديد ----------
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const missing = validateInput({ name, email, password }, ['name', 'email', 'password']);
    if (missing.length) {
      return res.status(400).json({ message: `الحقول المطلوبة: ${missing.join('، ')}` });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({ message: 'الاسم يجب أن يكون بين 2 و50 حرفاً.' });
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: 'البريد الإلكتروني غير صحيح.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `كلمة السر يجب أن تكون بين ${MIN_PASSWORD_LENGTH} و${MAX_PASSWORD_LENGTH} حرفاً.` });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) return res.status(409).json({ message: 'هذا البريد الإلكتروني مسجل بالفعل.' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // ملاحظة: التحقق من البريد الإلكتروني عبر إرسال رسالة تم إلغاؤه بناءً على
    // طلب المالك - الحساب يُفعَّل مباشرة (email_verified = 1) دون إرسال أي شيء.
    const insert = db.prepare(
      'INSERT INTO users (name, email, password_hash, name_change_count, email_verified) VALUES (?, ?, ?, 0, 1)'
    ).run(trimmedName, normalizedEmail, passwordHash);

    const user = { id: insert.lastInsertRowid, name: trimmedName, email: normalizedEmail, email_verified: true };
    req.session.userId = user.id;
    return res.status(201).json({ success: true, requiresVerification: false, user, message: 'تم إنشاء الحساب بنجاح.' });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'خطأ في إنشاء الحساب. حاول لاحقاً.' });
  }
});

// ---------- تسجيل الدخول ----------
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const missing = validateInput({ email, password }, ['email', 'password']);
    if (missing.length) return res.status(400).json({ message: `الحقول المطلوبة: ${missing.join('، ')}` });

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id, name, email, password_hash, email_verified FROM users WHERE email = ?').get(normalizedEmail);
    if (!user) return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة السر غير صحيحة.' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة السر غير صحيحة.' });

    req.session.userId = user.id;
    return res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, email_verified: true } });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'خطأ في تسجيل الدخول. حاول لاحقاً.' });
  }
});

// ---------- الجلسة ----------
router.get('/session', (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.json({ authenticated: false });

    const user = db.prepare('SELECT id, name, email, email_verified FROM users WHERE id = ?').get(userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ authenticated: false });
    }
    return res.json({ authenticated: true, user });
  } catch (error) {
    console.error('Session error:', error);
    return res.status(500).json({ authenticated: false, message: 'خطأ في جلب البيانات' });
  }
});

// ---------- التحقق من البريد الإلكتروني ----------
router.get('/verify-email', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ message: 'رابط التحقق غير صالح أو منتهي الصلاحية.' });
    const row = db.prepare(`SELECT id, user_id FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`).get(hashResetValue(token));
    if (!row) return res.status(400).json({ message: 'رابط التحقق غير صالح أو منتهي الصلاحية.' });
    db.exec('BEGIN');
    try {
      db.prepare("UPDATE users SET email_verified = 1, email_verified_at = datetime('now') WHERE id = ?").run(row.user_id);
      db.prepare("UPDATE email_verification_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return res.json({ success: true, message: 'تم توثيق بريدك الإلكتروني بنجاح.' });
  } catch (error) { console.error('Verify email error:', error); return res.status(500).json({ message: 'تعذّر توثيق البريد حالياً. حاول لاحقاً.' }); }
});

router.post('/resend-verification', registerLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ message: 'البريد الإلكتروني غير صحيح.' });
    const user = db.prepare('SELECT id, name, email, email_verified FROM users WHERE email = ?').get(email);
    if (!user) return res.json({ success: true, message: 'إذا كان البريد مرتبطاً بحساب غير موثّق، فستصلك رسالة تحقق قريباً.' });
    if (Number(user.email_verified) === 1) return res.json({ success: true, alreadyVerified: true, message: 'البريد الإلكتروني موثّق بالفعل.' });
    await issueVerificationEmail(user);
    return res.json({ success: true, message: 'تمت إعادة إرسال رسالة التحقق.' });
  } catch (error) {
    if (error.code === 'VERIFICATION_COOLDOWN') return res.status(429).json({ message: error.message });
    console.error('Resend verification error:', error);
    return res.status(500).json({ message: 'تعذّر إرسال رسالة التحقق. حاول لاحقاً.' });
  }
});

// ---------- بيانات الحساب ----------
router.get('/account', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, name_change_count, name_last_changed_at, created_at
    FROM users WHERE id = ?
  `).get(req.session.userId);

  if (!user) return res.status(404).json({ message: 'الحساب غير موجود.' });

  const last = user.name_last_changed_at ? Date.parse(user.name_last_changed_at) : 0;
  const cooldownMs = NAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const nameChangesRemaining = Math.max(0, NAME_CHANGE_LIMIT - Number(user.name_change_count || 0));
  const nameChangeAvailableAt =
    Number(user.name_change_count || 0) >= NAME_CHANGE_LIMIT && last && Date.now() - last < cooldownMs
      ? new Date(last + cooldownMs).toISOString()
      : null;

  return res.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at },
    nameChangesRemaining,
    nameChangeAvailableAt,
  });
});

// ---------- تعديل الاسم ----------
router.put('/account/name', requireAuth, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 50) {
      return res.status(400).json({ message: 'الاسم يجب أن يكون بين 2 و50 حرفاً.' });
    }

    const user = db.prepare(`
      SELECT id, name, name_change_count, name_last_changed_at
      FROM users WHERE id = ?
    `).get(req.session.userId);

    if (!user) return res.status(404).json({ message: 'الحساب غير موجود.' });
    if (name === user.name) return res.status(400).json({ message: 'الاسم الجديد مطابق للاسم الحالي.' });

    let count = Number(user.name_change_count || 0);
    const last = user.name_last_changed_at ? Date.parse(user.name_last_changed_at) : 0;
    const cooldownMs = NAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    if (count >= NAME_CHANGE_LIMIT) {
      if (!last || Date.now() - last >= cooldownMs) {
        count = 0;
      } else {
        const availableAt = new Date(last + cooldownMs);
        return res.status(429).json({
          message: `استنفدت محاولتي تغيير الاسم. يمكنك تغييره مرة أخرى بعد ${availableAt.toLocaleDateString('ar-JO')} تقريباً.`,
          availableAt: availableAt.toISOString(),
        });
      }
    }

    const changedAt = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET name = ?, name_change_count = ?, name_last_changed_at = ?
      WHERE id = ?
    `).run(name, count + 1, changedAt, user.id);

    return res.json({
      success: true,
      user: { id: user.id, name, email: db.prepare('SELECT email FROM users WHERE id = ?').get(user.id).email },
      nameChangesRemaining: Math.max(0, NAME_CHANGE_LIMIT - (count + 1)),
      nameChangeAvailableAt: count + 1 >= NAME_CHANGE_LIMIT
        ? new Date(Date.parse(changedAt) + cooldownMs).toISOString()
        : null,
    });
  } catch (error) {
    console.error('Update name error:', error);
    return res.status(500).json({ message: 'تعذّر تعديل الاسم. حاول لاحقاً.' });
  }
});

// ---------- تعديل البريد الإلكتروني مع تأكيد كلمة السر ----------
router.put('/account/email', requireAuth, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');

    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ message: 'البريد الإلكتروني غير صحيح.' });
    if (!currentPassword) return res.status(400).json({ message: 'أدخل كلمة السر الحالية لتغيير البريد الإلكتروني.' });

    const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود.' });

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) return res.status(401).json({ message: 'كلمة السر الحالية غير صحيحة.' });
    if (email === user.email) return res.status(400).json({ message: 'البريد الإلكتروني الجديد مطابق للحالي.' });

    const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
    if (exists) return res.status(409).json({ message: 'هذا البريد الإلكتروني مستخدم بالفعل.' });

    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, user.id);
    return res.json({ success: true, user: { id: user.id, name: user.name, email } });
  } catch (error) {
    console.error('Update email error:', error);
    return res.status(500).json({ message: 'تعذّر تعديل البريد الإلكتروني. حاول لاحقاً.' });
  }
});

// ---------- تغيير كلمة السر مباشرة (المستخدم مسجّل دخول ويعرف كلمة سره الحالية) ----------
// لا يعتمد على أي بريد إلكتروني إطلاقاً — بديل مباشر وأوثق من مسار "نسيت كلمة السر"
// لأنه ما بيتعطّل لو خدمة الإيميل (Infobip) واقفة أو غير مُهيّأة صح.
router.put('/account/password', requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!currentPassword) {
      return res.status(400).json({ message: 'أدخل كلمة السر الحالية.' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `كلمة السر الجديدة يجب أن تكون بين ${MIN_PASSWORD_LENGTH} و${MAX_PASSWORD_LENGTH} حرفاً.` });
    }

    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود.' });

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) return res.status(401).json({ message: 'كلمة السر الحالية غير صحيحة.' });

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'كلمة السر الجديدة يجب أن تختلف عن كلمة السر الحالية.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

    return res.json({ success: true, message: 'تم تغيير كلمة السر بنجاح.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'تعذّر تغيير كلمة السر. حاول لاحقاً.' });
  }
});

// ---------- حذف الحساب: كلمة السر مطلوبة ولا يوجد مسار نسيت كلمة السر هنا ----------
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ message: 'أدخل كلمة السر لتأكيد حذف الحساب.' });

    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود.' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ message: 'كلمة السر غير صحيحة. لم يتم حذف الحساب.' });

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    req.session.destroy((err) => {
      if (err) console.error('Session destroy after account deletion:', err);
      res.clearCookie('connect.sid');
      return res.json({ success: true, message: 'تم حذف الحساب وجميع بياناته.' });
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ message: 'تعذّر حذف الحساب. حاول لاحقاً.' });
  }
});

// ---------- إرسال رمز استعادة كلمة السر ----------
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const successResponse = { success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني.' };

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'البريد الإلكتروني غير صحيح.' });
    }

    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(404).json({ message: 'هذا البريد الإلكتروني غير مسجل لدينا.' });
    }

    const latest = db.prepare(`
      SELECT created_at FROM password_reset_codes
      WHERE user_id = ? ORDER BY id DESC LIMIT 1
    `).get(user.id);

    const now = Math.floor(Date.now() / 1000);
    if (latest?.created_at && now - Number(latest.created_at) < RESET_CODE_RESEND_SECONDS) {
      return res.status(429).json({
        message: `انتظر ${RESET_CODE_RESEND_SECONDS - (now - Number(latest.created_at))} ثانية قبل طلب رمز جديد.`
      });
    }

    const code = generateResetCode();

    // لا نحفظ الرمز إلا بعد نجاح الإرسال.
    await sendResetEmail({ to: user.email, name: user.name, code });

    db.prepare('DELETE FROM password_reset_codes WHERE user_id = ?').run(user.id);
    db.prepare(`
      INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, hashResetValue(code), now + RESET_CODE_TTL_MINUTES * 60);

    return res.json(successResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      message: process.env.NODE_ENV === 'development'
        ? `تعذّر إرسال البريد. تحقق من إعدادات Infobip: ${error.message}`
        : 'تعذّر إرسال رمز التحقق. حاول لاحقاً.'
    });
  }
});

// ---------- التحقق من رمز البريد ----------
router.post('/verify-reset-code', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!EMAIL_REGEX.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'أدخل البريد الإلكتروني والرمز المكوّن من 6 أرقام.' });
    }

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!user) return res.status(400).json({ message: 'رمز التحقق غير صحيح أو منتهي الصلاحية.' });

    const reset = db.prepare(`
      SELECT id, code_hash, expires_at, attempts
      FROM password_reset_codes
      WHERE user_id = ? AND verified_at IS NULL
      ORDER BY id DESC LIMIT 1
    `).get(user.id);

    const now = Math.floor(Date.now() / 1000);
    if (!reset || Number(reset.expires_at) <= now || Number(reset.attempts) >= RESET_CODE_MAX_ATTEMPTS) {
      return res.status(400).json({ message: 'رمز التحقق غير صحيح أو منتهي الصلاحية.' });
    }

    const expected = Buffer.from(reset.code_hash, 'hex');
    const actual = Buffer.from(hashResetValue(code), 'hex');
    const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

    if (!valid) {
      db.prepare('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?').run(reset.id);
      return res.status(400).json({
        message: `رمز التحقق غير صحيح. المحاولات المتبقية: ${Math.max(0, RESET_CODE_MAX_ATTEMPTS - Number(reset.attempts) - 1)}.`
      });
    }

    db.prepare('UPDATE password_reset_codes SET verified_at = ? WHERE id = ?').run(now, reset.id);

    const resetToken = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    // مهم: نولّد expires_at بدالة datetime() الخاصة بـ SQLite نفسها (نفس صيغة
    // datetime('now') المستخدمة عند المقارنة لاحقاً)، وليس عبر Date().toISOString()
    // في جافاسكربت. الصيغتان مختلفتان شكلياً (وجود حرف T والميلي ثانية وZ في
    // ISO مقابل "YYYY-MM-DD HH:MM:SS" في SQLite)، وبما أن المقارنة نصّية
    // (TEXT) فإن حرف "T" أكبر من المسافة دائماً، فكانت `expires_at > datetime('now')`
    // تُقيَّم صحيحة (true) دائماً تقريباً بغض النظر عن الوقت الفعلي — أي أن
    // الرمز كان يبدو صالحاً حتى لو انتهت صلاحيته فعلياً. توحيد الصيغة يصلح المقارنة.
    db.prepare(`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))
    `).run(user.id, hashResetValue(resetToken), RESET_TOKEN_TTL_MINUTES);

    return res.json({ success: true, resetToken });
  } catch (error) {
    console.error('Verify reset code error:', error);
    return res.status(500).json({ message: 'تعذّر التحقق من الرمز. حاول لاحقاً.' });
  }
});

// ---------- تعيين كلمة سر جديدة بعد التحقق ----------
router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token) return res.status(400).json({ message: 'رمز إعادة التعيين غير صالح.' });
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `كلمة السر يجب أن تكون بين ${MIN_PASSWORD_LENGTH} و${MAX_PASSWORD_LENGTH} حرفاً.` });
    }

    const reset = db.prepare(`
      SELECT id, user_id FROM password_resets
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')
    `).get(hashResetValue(token));

    if (!reset) return res.status(400).json({ message: 'جلسة تغيير كلمة السر غير صالحة أو منتهية.' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id);
      db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(reset.id);
      db.prepare('DELETE FROM password_reset_codes WHERE user_id = ?').run(reset.user_id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    req.session.destroy(() => {});
    return res.json({ success: true, message: 'تم تغيير كلمة السر بنجاح.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'تعذّر تغيير كلمة السر. حاول لاحقاً.' });
  }
});

// ---------- تسجيل الخروج ----------
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'خطأ في تسجيل الخروج' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

module.exports = router;
