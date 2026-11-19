document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('admin-login-form');
  const status = document.getElementById('admin-login-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = form.elements.password.value;
    if (!password) { status.textContent = 'أدخل كلمة المرور.'; return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '';
    try {
      const response = await fetch(`${CONFIG.API.BASE_URL}/feedback/admin/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'تعذّر تسجيل الدخول.');
      if (result.token && window.HudaToken) window.HudaToken.set(result.token);
      location.href = 'admin.html';
    } catch (error) {
      status.textContent = error.message || 'تعذّر تسجيل الدخول.';
      status.dataset.tone = 'error';
    } finally { button.disabled = false; }
  });
});
