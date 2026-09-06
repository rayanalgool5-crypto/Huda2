(() => {
  const card = document.getElementById('account-card');
  const name = document.getElementById('account-name');
  const email = document.getElementById('account-email');
  const nameForm = document.getElementById('name-form');
  const emailForm = document.getElementById('email-form');
  const passwordForm = document.getElementById('password-form');
  const nameMessage = document.getElementById('name-message');
  const emailMessage = document.getElementById('email-message');
  const passwordMessage = document.getElementById('password-message');
  const nameLimitMessage = document.getElementById('name-limit-message');
  const deleteModal = document.getElementById('delete-modal');
  const deleteForm = document.getElementById('delete-form');
  const deleteMessage = document.getElementById('delete-message');
  const logoutButton = document.getElementById('account-logout');

  let currentUser = null;

  function setUser(user) {
    currentUser = user;
    name.textContent = user.name || 'مستخدم هُدى';
    email.textContent = user.email || '';
    document.getElementById('new-name').value = user.name || '';
    document.getElementById('new-email').value = user.email || '';
    card.hidden = false;
  }

  function showNameLimit(data) {
    if (data.nameChangesRemaining > 0) {
      nameLimitMessage.textContent = `متاح لك ${data.nameChangesRemaining} من ${2} تغيير للاسم قبل الانتظار لمدة أسبوع.`;
    } else if (data.nameChangeAvailableAt) {
      const date = new Date(data.nameChangeAvailableAt);
      nameLimitMessage.textContent = `استنفدت التغييرين. يمكنك تغيير الاسم مرة أخرى بعد ${date.toLocaleString('ar-JO')}.`;
    } else {
      nameLimitMessage.textContent = 'يمكنك تغيير الاسم الآن.';
    }
  }

  async function loadAccount() {
    const user = await Huda.getSession();
    if (!user) {
      window.location.replace('login.html');
      return;
    }
    try {
      const data = await Huda.apiGet('/auth/account');
      setUser(data.user);
      showNameLimit(data);
    } catch (error) {
      setUser(user);
      nameLimitMessage.textContent = error.message || 'تعذّر تحميل إعدادات الحساب.';
    }
  }

  nameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = nameForm.querySelector('button[type="submit"]');
    const newName = nameForm.name.value.trim();
    nameMessage.textContent = '';

    if (!nameForm.checkValidity()) {
      nameMessage.textContent = 'الاسم يجب أن يكون بين 2 و50 حرفاً.';
      return;
    }

    button.disabled = true;
    try {
      const data = await Huda.apiPut('/auth/account/name', { name: newName });
      setUser(data.user);
      showNameLimit(data);
      nameMessage.textContent = 'تم حفظ الاسم بنجاح.';
      const cached = HudaUtils.storage.get(CONFIG.STORAGE.USER_KEY);
      if (cached) HudaUtils.storage.set(CONFIG.STORAGE.USER_KEY, data.user);
      await Huda.refreshSession();
    } catch (error) {
      nameMessage.textContent = error.message || 'تعذّر تعديل الاسم.';
    } finally {
      button.disabled = false;
    }
  });

  emailForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = emailForm.querySelector('button[type="submit"]');
    emailMessage.textContent = '';

    if (!emailForm.checkValidity()) {
      emailMessage.textContent = 'أدخل بريدًا إلكترونيًا صحيحًا وكلمة السر الحالية.';
      return;
    }

    button.disabled = true;
    try {
      const data = await Huda.apiPut('/auth/account/email', {
        email: emailForm.email.value.trim().toLowerCase(),
        currentPassword: emailForm.currentPassword.value,
      });
      setUser(data.user);
      emailForm.currentPassword.value = '';
      emailMessage.textContent = 'تم تحديث البريد الإلكتروني بنجاح.';
      HudaUtils.storage.set(CONFIG.STORAGE.USER_KEY, data.user);
      await Huda.refreshSession();
    } catch (error) {
      emailMessage.textContent = error.message || 'تعذّر تعديل البريد الإلكتروني.';
    } finally {
      button.disabled = false;
    }
  });

  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = passwordForm.querySelector('button[type="submit"]');
    passwordMessage.textContent = '';

    const currentPassword = passwordForm.currentPassword.value;
    const newPassword = passwordForm.newPassword.value;
    const confirmNewPassword = passwordForm.confirmNewPassword.value;

    if (!passwordForm.checkValidity()) {
      passwordMessage.textContent = 'كلمة السر الجديدة يجب أن تكون بين 8 و128 حرفاً.';
      return;
    }
    if (newPassword !== confirmNewPassword) {
      passwordMessage.textContent = 'كلمتا السر الجديدتان غير متطابقتين.';
      return;
    }

    button.disabled = true;
    try {
      await Huda.apiPut('/auth/account/password', { currentPassword, newPassword });
      passwordMessage.textContent = 'تم تغيير كلمة السر بنجاح.';
      passwordForm.reset();
    } catch (error) {
      passwordMessage.textContent = error.message || 'تعذّر تغيير كلمة السر.';
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('open-delete')?.addEventListener('click', () => {
    deleteForm.reset();
    deleteMessage.textContent = '';
    deleteModal.hidden = false;
    deleteForm.password.focus();
    document.body.style.overflow = 'hidden';
  });

  function closeDeleteModal() {
    deleteModal.hidden = true;
    document.body.style.overflow = '';
  }

  deleteModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-delete]')) closeDeleteModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && deleteModal && !deleteModal.hidden) closeDeleteModal();
  });

  deleteForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = deleteForm.querySelector('button[type="submit"]');
    deleteMessage.textContent = '';

    if (deleteForm.confirmation.value.trim() !== 'حذف حسابي') {
      deleteMessage.textContent = 'اكتب «حذف حسابي» كما هي لتأكيد الحذف.';
      return;
    }
    if (!deleteForm.password.value) {
      deleteMessage.textContent = 'أدخل كلمة السر.';
      return;
    }

    button.disabled = true;
    try {
      await fetch(`${CONFIG.API.BASE_URL}/auth/account`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ password: deleteForm.password.value })
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'تعذّر حذف الحساب.');
        return data;
      });

      HudaUtils.storage.remove(CONFIG.STORAGE.USER_KEY);
      window.location.replace('login.html?deleted=1');
    } catch (error) {
      deleteMessage.textContent = error.message || 'تعذّر حذف الحساب.';
      button.disabled = false;
    }
  });

  logoutButton?.addEventListener('click', async () => {
    logoutButton.disabled = true;
    await Huda.logout();
    window.location.replace('login.html');
  });

  document.addEventListener('huda-auth-ready', (event) => {
    if (event.detail?.user) loadAccount();
  });

  document.addEventListener('DOMContentLoaded', loadAccount);
})();
