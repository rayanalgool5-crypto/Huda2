const express = require('express');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const router = express.Router();

const ALLOWED_HOST = (hostname) => (
  hostname === 'everyayah.com'
  || hostname.endsWith('.everyayah.com')
  || hostname === 'mp3quran.net'
  || hostname.endsWith('.mp3quran.net')
);

function safeFilename(value, fallback = 'Huda-Quran.mp3') {
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  return cleaned.toLowerCase().endsWith('.mp3') ? cleaned : `${cleaned || fallback}.mp3`;
}

// --- بناء وسم ID3v2.3 يدوياً (بدون الاعتماد على ffmpeg) ---
// نبني الوسم كـ Buffer مباشرة، حتى تعمل ميزة إضافة شعار هُدى دائماً بغض
// النظر عن توفّر ffmpeg على خادم الاستضافة (Render وغيرها غالباً لا يوفرونه،
// وهذا كان السبب الحقيقي في اختفاء الشعار من الملفات المُنزَّلة).

function syncSafeSize(size) {
  return Buffer.from([
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
  ]);
}

function frameHeader(id, contentLength) {
  const header = Buffer.alloc(10);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32BE(contentLength, 4); // حجم الإطار العادي (غير syncsafe) في نسخة 2.3
  header.writeUInt16BE(0, 8); // flags
  return header;
}

function textFrame(id, text) {
  // ترميز UTF-16LE مع BOM حتى يدعم النص العربي في عنوان الملف والفنان.
  const body = Buffer.concat([Buffer.from([0x01]), Buffer.from(`\uFEFF${text}`, 'utf16le')]);
  return Buffer.concat([frameHeader(id, body.length), body]);
}

function buildId3v2Tag({ title, artist, album }) {
  const frames = Buffer.concat([
    textFrame('TIT2', title),
    textFrame('TPE1', artist),
    textFrame('TALB', album),
  ]);
  const header = Buffer.alloc(10);
  header.write('ID3', 0, 3, 'ascii');
  header.writeUInt8(3, 3); // النسخة 2.3.0
  header.writeUInt8(0, 4); // revision
  header.writeUInt8(0, 5); // flags
  syncSafeSize(frames.length).copy(header, 6);
  return Buffer.concat([header, frames]);
}

// يبثّ صوت المصدر مباشرة (بدون تنزيله بالكامل لملف مؤقت أولاً)، مع حذف أي
// وسم ID3v2 موجود أصلاً في بداية الملف المصدر، بما فيه أي صورة غلاف APIC.
// ثم نضيف وسم النص فقط، بدون أي صورة أو شعار. هذا أسرع بكثير من
// "نزّل ثم أعد الرفع" ويقلّل احتمال انقطاع الاتصال في السور الطويلة.
async function* streamWithoutLeadingId3(webStream) {
  const reader = webStream.getReader();
  let buffered = Buffer.alloc(0);
  let headerChecked = false;
  let skipRemaining = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffered.length) yield buffered;
      return;
    }
    let chunk = Buffer.from(value);
    if (!headerChecked) {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 10) continue; // ننتظر بيانات كافية للتحقق من الترويسة
      headerChecked = true;
      if (buffered.toString('ascii', 0, 3) === 'ID3') {
        const size = ((buffered[6] & 0x7f) << 21) | ((buffered[7] & 0x7f) << 14)
          | ((buffered[8] & 0x7f) << 7) | (buffered[9] & 0x7f);
        skipRemaining = 10 + size;
      }
      chunk = buffered;
      buffered = Buffer.alloc(0);
    }
    if (skipRemaining > 0) {
      if (chunk.length <= skipRemaining) {
        skipRemaining -= chunk.length;
        continue;
      }
      chunk = chunk.subarray(skipRemaining);
      skipRemaining = 0;
    }
    if (chunk.length) yield chunk;
  }
}

router.get('/download', async (req, res) => {
  const source = String(req.query.url || '');
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return res.status(400).json({ message: 'رابط التلاوة غير صالح.' });
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOST(parsed.hostname)) {
    return res.status(400).json({ message: 'مصدر التلاوة غير مسموح.' });
  }

  const filename = safeFilename(req.query.filename, 'Huda-Quran.mp3');
  const title = String(req.query.title || 'القرآن الكريم').slice(0, 180);
  const artist = String(req.query.artist || 'هُدى').slice(0, 180);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  req.on('close', () => controller.abort());

  try {
    const response = await fetch(source, {
      signal: controller.signal,
      // بعض خوادم mp3quran.net تحمي الملفات من hotlinking وترفض الطلبات التي
      // لا تشبه متصفحاً حقيقياً (User-Agent غير معروف، أو بدون Referer).
      // لذلك نرسل ترويسات تحاكي متصفحاً فعلياً بدل الاسم المخصص السابق.
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Referer: `${parsed.protocol}//${parsed.hostname}/`,
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Audio source returned ${response.status}`);
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 200 * 1024 * 1024) throw new Error('Audio file is too large');

    const tag = buildId3v2Tag({ title, artist, album: title }); // text-only ID3; never embed artwork

    // اسم الملف يحتوي غالباً على حروف عربية (اسم السورة/القارئ)، وترويسات HTTP
    // الخام تقبل ASCII فقط — إرسال حروف عربية مباشرة بـ Content-Disposition
    // يسبب استثناء ERR_INVALID_CHAR ويطيح الطلب بالكامل. الحل القياسي
    // (RFC 6266 / RFC 5987): اسم بديل بالإنجليزية كـ fallback داخل filename=،
    // والاسم الحقيقي (بالعربية) مُرمّز بصيغة filename*=UTF-8''... التي تدعمها
    // كل المتصفحات وتعرض الاسم العربي الصحيح عند الحفظ.
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '').replace(/"/g, '').trim() || 'Huda-Quran.mp3';
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    // ملاحظة: لا نرسل Content-Length لأن حجم الناتج (الوسم + الصوت بعد حذف
    // وسمه الأصلي) غير معروف مسبقاً بدون قراءة الملف كاملاً؛ الترميز
    // المجزّأ (chunked) يعمل بشكل طبيعي بدون هذا الرأس.

    res.write(tag);
    await pipeline(Readable.from(streamWithoutLeadingId3(response.body)), res);
  } catch (error) {
    clearTimeout(timer);
    console.error('Quran download failed:', error);
    if (!res.headersSent) {
      return res.status(502).json({ message: 'تعذّر تجهيز السورة للتنزيل حالياً. حاول مرة أخرى.' });
    }
    return res.destroy();
  }
  clearTimeout(timer);
  return undefined;
});

module.exports = router;
