document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('contact-form-status');
  if (!form || !status) return;

  const setStatus = (message, tone = '') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const data = {
      email: form.elements.email.value.trim(),
      name: form.elements.name.value.trim(),
      message: form.elements.message.value.trim(),
    };

    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = 'جارٍ الإرسال...';
    setStatus('');

    try {
      const response = await fetch(`${CONFIG.API.BASE_URL}/feedback/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'تعذّر إرسال الرسالة.');
      }

      form.reset();
      setStatus(result.message || 'تم إرسال رسالتك بنجاح.', 'success');
    } catch (error) {
      setStatus(error.message || 'تعذّر إرسال الرسالة حالياً. حاول مرة أخرى.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = button.dataset.originalText || 'إرسال الرسالة';
    }
  });
});
