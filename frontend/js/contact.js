document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('contact-form-status');
  const picker = document.getElementById('contact-images');
  const preview = document.getElementById('contact-image-preview');
  const addButton = document.getElementById('contact-add-images');
  if (!form || !status || !picker || !preview || !addButton) return;

  let selectedFiles = [];
  const setStatus = (message, tone = '') => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const renderPreviews = () => {
    preview.replaceChildren();
    selectedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'contact-preview-item';
      const image = document.createElement('img');
      image.alt = `معاينة الصورة ${index + 1}`;
      image.src = URL.createObjectURL(file);
      image.onload = () => URL.revokeObjectURL(image.src);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'contact-preview-remove';
      remove.textContent = 'إزالة';
      remove.setAttribute('aria-label', `إزالة ${file.name}`);
      remove.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderPreviews();
      });
      item.append(image, remove);
      preview.append(item);
    });
  };

  addButton.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    const incoming = Array.from(picker.files || []);
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    for (const file of incoming) {
      if (!allowed.includes(file.type)) {
        setStatus('نوع ملف غير مسموح. اختر صورة PNG أو JPG أو WEBP.', 'error');
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setStatus(`الصورة ${file.name} أكبر من 5 ميجابايت.`, 'error');
        continue;
      }
      if (selectedFiles.length >= 5) {
        setStatus('يمكن إرفاق خمس صور كحد أقصى.', 'error');
        break;
      }
      if (!selectedFiles.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        selectedFiles.push(file);
      }
    }
    if (selectedFiles.length) setStatus('');
    picker.value = '';
    renderPreviews();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const name = form.elements.name.value.trim();
    const message = form.elements.message.value.trim();
    const category = form.elements.category.value;
    if (name.length < 2 || message.length < 5 || !category) {
      setStatus('يرجى تعبئة الاسم والتصنيف والرسالة بشكل صحيح.', 'error');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData();
    data.append('name', name);
    data.append('category', category);
    data.append('message', message);
    selectedFiles.forEach(file => data.append('images', file, file.name));

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'جارٍ الإرسال...';
    setStatus('');
    try {
      const response = await fetch(`${CONFIG.API.BASE_URL}/feedback/message`, {
        method: 'POST',
        credentials: 'include',
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'تعذّر إرسال الرسالة.');
      form.reset();
      selectedFiles = [];
      renderPreviews();
      setStatus(result.message || 'تم إرسال رسالتك بنجاح.', 'success');
    } catch (error) {
      setStatus(error.message || 'تعذّر إرسال الرسالة حالياً. حاول مرة أخرى.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
});
