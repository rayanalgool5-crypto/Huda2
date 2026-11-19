'use strict';

/** Shared transactional email transport. Supports Infobip Email API and Resend. */
async function sendEmail({ to, from, replyTo, subject, text, html }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const sender = from || process.env.EMAIL_FROM;
    if (!sender) throw new Error('email_from_not_configured');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to: [to], reply_to: replyTo || undefined, subject, text, html }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Resend email API error:', response.status, payload);
      throw new Error(`resend_http_${response.status}`);
    }
    return payload;
  }

  const baseUrl = String(process.env.INFOBIP_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.INFOBIP_API_KEY;
  const sender = from || process.env.INFOBIP_FROM;
  if (!baseUrl || !apiKey || !sender) throw new Error('email_provider_not_configured');

  const form = new FormData();
  form.append('from', sender);
  form.append('to', to);
  form.append('subject', subject);
  form.append('text', text);
  form.append('html', html);
  if (replyTo) form.append('headers', JSON.stringify({ 'Reply-To': replyTo }));

  const response = await fetch(`${baseUrl}/email/3/send`, {
    method: 'POST',
    headers: { Authorization: `App ${apiKey}`, Accept: 'application/json' },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Infobip email API error:', response.status, payload);
    throw new Error(`infobip_http_${response.status}`);
  }
  return payload;
}

module.exports = { sendEmail };
