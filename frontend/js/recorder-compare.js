/**
 * "سجّل وقارن": تسجيل صوت المستخدم محلياً ومقارنته بتلاوة شيخ لنفس الآية.
 * الخصوصية: التسجيل يبقى في ذاكرة المتصفح فقط (Blob URL)، ولا يُرفع لأي خادم،
 * ويُحذف فوراً بعد المقارنة أو عند مغادرة الشاشة/تغيير الآية.
 */

const HudaRecorder = (() => {
  const SUPPORTED = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window.MediaRecorder !== 'undefined';

  function create({ onStateChange } = {}) {
    let mediaRecorder = null;
    let stream = null;
    let chunks = [];
    let objectUrl = null;

    const emit = (state, detail) => onStateChange?.(state, detail);

    function releaseRecording() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      chunks = [];
    }

    function stopStream() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    async function start() {
      if (!SUPPORTED) throw new Error('متصفحك لا يدعم التسجيل الصوتي.');
      releaseRecording();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      chunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      mediaRecorder.start();
      emit('recording');
    }

    // تُرجع عنوان Blob مؤقتاً للتشغيل المحلي فقط.
    function stop() {
      return new Promise((resolve, reject) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          resolve(null);
          return;
        }
        mediaRecorder.onstop = () => {
          stopStream();
          try {
            const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            chunks = [];
            objectUrl = URL.createObjectURL(blob);
            emit('ready');
            resolve(objectUrl);
          } catch (error) {
            reject(error);
          }
        };
        mediaRecorder.stop();
      });
    }

    // حذف نهائي للتسجيل من الذاكرة.
    function discard() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch { /* already stopped */ }
      }
      stopStream();
      releaseRecording();
      mediaRecorder = null;
      emit('discarded');
    }

    const isRecording = () => mediaRecorder?.state === 'recording';

    return { start, stop, discard, isRecording, get url() { return objectUrl; } };
  }

  return { SUPPORTED, create };
})();

if (typeof window !== 'undefined') {
  window.HudaRecorder = HudaRecorder;
}
