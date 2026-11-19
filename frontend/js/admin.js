document.addEventListener('DOMContentLoaded', async () => {
  const api = `${CONFIG.API.BASE_URL}/feedback`;
  const list = document.getElementById('admin-message-list');
  const detail = document.getElementById('admin-message-detail');
  const messagesPanel = document.getElementById('admin-messages-panel');
  const passwordPanel = document.getElementById('admin-password-panel');
  const imageViewer = document.getElementById('admin-image-viewer');
  let selectedId = null;

  async function request(path, options = {}) {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      ...options,
      headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.href = 'admin-login.html'; throw new Error('انتهت جلسة الإدارة. سجّل الدخول مجدداً.'); }
    if (!response.ok) throw new Error(data.message || 'حدث خطأ أثناء تنفيذ الطلب.');
    return data;
  }

  const statusLabel = value => ({ new: 'جديدة', reviewed: 'تمت مراجعتها', replied: 'تم الرد عليها' }[value] || value);
  const categoryLabel = value => value === 'problem' ? 'مشكلة' : 'اقتراح';
  const dateLabel = value => {
    const date = new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-JO');
  };
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  async function loadMessages() {
    list.replaceChildren(node('p', '', 'جارٍ تحميل الرسائل...'));
    try {
      const data = await request('/admin/messages');
      list.replaceChildren();
      if (!data.messages.length) {
        list.append(node('p', 'admin-empty-state', 'لا توجد رسائل واردة حتى الآن.'));
        detail.replaceChildren(node('p', 'admin-empty-state', 'ستظهر تفاصيل الرسالة هنا.'));
        return;
      }
      data.messages.forEach(message => {
        const button = node('button', `admin-message-row${message.id === selectedId ? ' selected' : ''}`);
        button.type = 'button';
        button.dataset.messageId = String(message.id);
        const heading = node('span', 'admin-message-row-heading');
        heading.append(node('strong', '', message.name), node('small', '', statusLabel(message.status)));
        button.append(heading, node('span', 'admin-message-row-meta', `${categoryLabel(message.category)} · ${dateLabel(message.created_at)}`));
        if (message.attachment_count) button.append(node('small', 'admin-message-row-count', `▧ ${message.attachment_count} مرفق`));
        button.addEventListener('click', () => openMessage(message.id));
        list.append(button);
      });
      if (selectedId && data.messages.some(m => m.id === selectedId)) await openMessage(selectedId);
    } catch (error) { list.replaceChildren(node('p', 'contact-form-status', error.message)); }
  }

  async function openMessage(id) {
    selectedId = id;
    try {
      const data = await request(`/admin/messages/${id}`);
      const message = data.message;
      detail.replaceChildren();
      const header = node('div', 'admin-detail-heading');
      const title = node('div');
      title.append(node('h2', '', message.name), node('p', 'admin-detail-meta', `${categoryLabel(message.category)} · ${dateLabel(message.created_at)}`));
      const status = document.createElement('select');
      status.className = 'admin-status-select';
      [['new','جديدة'],['reviewed','تمت مراجعتها'],['replied','تم الرد عليها']].forEach(([value,label]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = label; status.append(option);
      });
      status.value = message.status;
      status.addEventListener('change', async () => {
        try { await request(`/admin/messages/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: status.value }) }); await loadMessages(); }
        catch (error) { alert(error.message); }
      });
      header.append(title, status);
      detail.append(header, node('h3', 'admin-detail-label', 'نص الرسالة'), node('p', 'admin-message-body', message.message));

      if (message.attachments.length) {
        detail.append(node('h3', 'admin-detail-label', 'الصور المرفقة'));
        const gallery = node('div', 'admin-attachment-gallery');
        message.attachments.forEach(file => {
          const img = document.createElement('img');
          img.src = `${CONFIG.API.BASE_URL}${file.url}`;
          img.alt = file.name;
          img.loading = 'lazy';
          img.addEventListener('click', () => {
            imageViewer.querySelector('img').src = img.src;
            imageViewer.hidden = false;
          });
          gallery.append(img);
        });
        detail.append(gallery);
      }

      detail.append(node('h3', 'admin-detail-label', 'سجل الردود'));
      const replies = node('div', 'admin-replies');
      if (!message.replies.length) replies.append(node('p', 'admin-empty-state', 'لا توجد ردود سابقة.'));
      message.replies.forEach(reply => {
        const item = node('div', 'admin-reply-item');
        item.append(node('p', '', reply.text), node('small', '', dateLabel(reply.created_at)));
        replies.append(item);
      });
      detail.append(replies);

      const replyForm = node('form', 'admin-reply-form');
      const replyInput = document.createElement('textarea');
      replyInput.rows = 4; replyInput.maxLength = 3000; replyInput.required = true;
      replyInput.placeholder = 'اكتب رداً داخلياً لحفظه في سجل المحادثة...';
      const replyButton = node('button', 'primary-button', 'حفظ الرد');
      replyButton.type = 'submit';
      replyForm.append(node('h3', 'admin-detail-label', 'إضافة رد'), replyInput, replyButton);
      replyForm.addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await request(`/admin/messages/${id}/replies`, { method: 'POST', body: JSON.stringify({ text: replyInput.value }) });
          await openMessage(id); await loadMessages();
        } catch (error) { alert(error.message); }
      });
      detail.append(replyForm);

      const actions = node('div', 'admin-detail-actions');
      const deleteButton = node('button', 'admin-delete-button', 'حذف الرسالة');
      deleteButton.type = 'button';
      deleteButton.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف الرسالة وجميع مرفقاتها وردودها؟ لا يمكن التراجع عن هذا الإجراء.')) return;
        try { await request(`/admin/messages/${id}`, { method: 'DELETE' }); selectedId = null; await loadMessages(); detail.replaceChildren(node('p','admin-empty-state','تم حذف الرسالة.')); }
        catch (error) { alert(error.message); }
      });
      actions.append(deleteButton);
      detail.append(actions);
      await loadMessagesListSelection(id);
    } catch (error) { detail.replaceChildren(node('p', 'contact-form-status', error.message)); }
  }

  async function loadMessagesListSelection(id) {
    list.querySelectorAll('.admin-message-row').forEach(row => {
      row.classList.toggle('selected', Number(row.dataset.messageId) === Number(id));
    });
  }

  document.getElementById('show-messages').addEventListener('click', () => {
    messagesPanel.hidden = false; passwordPanel.hidden = true;
    document.getElementById('show-messages').classList.add('active');
    document.getElementById('show-password').classList.remove('active');
  });
  document.getElementById('show-password').addEventListener('click', () => {
    messagesPanel.hidden = true; passwordPanel.hidden = false;
    document.getElementById('show-password').classList.add('active');
    document.getElementById('show-messages').classList.remove('active');
  });
  document.getElementById('refresh-messages').addEventListener('click', loadMessages);
  document.getElementById('admin-logout').addEventListener('click', async () => {
    try { await request('/admin/logout', { method: 'POST' }); } finally { if (window.HudaToken) window.HudaToken.set(null); location.href = 'admin-login.html'; }
  });
  document.getElementById('admin-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('admin-password-status');
    const values = { currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value, confirmPassword: form.elements.confirmPassword.value };
    try {
      const result = await request('/admin/password', { method: 'POST', body: JSON.stringify(values) });
      status.textContent = result.message; status.dataset.tone = 'success'; form.reset();
    } catch (error) { status.textContent = error.message; status.dataset.tone = 'error'; }
  });
  document.getElementById('close-image-viewer').addEventListener('click', () => { imageViewer.hidden = true; imageViewer.querySelector('img').src = ''; });
  imageViewer.addEventListener('click', event => { if (event.target === imageViewer) { imageViewer.hidden = true; imageViewer.querySelector('img').src = ''; } });

  try { await request('/admin/session'); await loadMessages(); }
  catch (error) { if (!location.href.includes('admin-login.html')) location.href = 'admin-login.html'; }
});
