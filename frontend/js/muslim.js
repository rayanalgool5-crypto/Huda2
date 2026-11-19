(() => {
  'use strict';
  const API = (window.CONFIG?.API?.BASE_URL || '/api').replace(/\/$/, '');
  const $ = (selector) => document.querySelector(selector);
  const list = $('#conversation-list');
  const welcome = $('#welcome-screen');
  const chatArea = $('#chat-area');
  const messagesEl = $('#messages');
  const input = $('#message-input');
  const form = $('#message-form');
  const sendButton = $('#send-button');
  const thinking = $('#thinking-indicator');
  const sidebar = $('#muslim-sidebar');
  const scrim = $('#sidebar-scrim');

  let activeConversationId = null;
  let sending = false;
  let authenticated = false;

  async function api(path, options = {}) {
    const response = await fetch(`${API}/ai${path}`, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'حدث خطأ أثناء الاتصال بالخادم.');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function setConversationInUrl(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('conversation', String(id));
    else url.searchParams.delete('conversation');
    history.replaceState({}, '', url);
  }

  function showWelcome() {
    welcome.hidden = false;
    chatArea.hidden = true;
    messagesEl.replaceChildren();
    activeConversationId = null;
    setConversationInUrl(null);
  }

  function showChat() {
    welcome.hidden = true;
    chatArea.hidden = false;
  }

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    scrim.hidden = true;
  }

  function openSidebar() {
    sidebar.classList.add('is-open');
    scrim.hidden = false;
  }

  function appendFormattedText(container, content) {
    const text = String(content || '');
    const parts = text.split(/(﴿[^﴾]{1,500}﴾)/g);
    parts.forEach((part) => {
      if (/^﴿[^﴾]+﴾$/.test(part)) {
        const verse = document.createElement('span');
        verse.className = 'quran-quote';
        verse.textContent = part;
        container.appendChild(verse);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    });
  }

  function addMessage(role, content, options = {}) {
    const wrapper = document.createElement('article');
    wrapper.className = `muslim-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'muslim-message-bubble';
    appendFormattedText(bubble, content);
    wrapper.appendChild(bubble);

    if (role === 'assistant' && !options.pending) {
      const tools = document.createElement('div');
      tools.className = 'muslim-message-tools';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'نسخ الإجابة';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(String(content || ''));
          copy.textContent = 'تم النسخ';
          setTimeout(() => { copy.textContent = 'نسخ الإجابة'; }, 1400);
        } catch {
          copy.textContent = 'تعذّر النسخ';
        }
      });
      tools.appendChild(copy);
      wrapper.appendChild(tools);
    }
    messagesEl.appendChild(wrapper);
    return wrapper;
  }

  function renderConversationList(conversations) {
    list.replaceChildren();
    if (!conversations.length) {
      const empty = document.createElement('p');
      empty.className = 'muslim-history-empty';
      empty.textContent = 'لا توجد محادثات بعد. ابدأ محادثة جديدة.';
      list.appendChild(empty);
      return;
    }
    conversations.forEach((conversation) => {
      const row = document.createElement('div');
      row.className = `muslim-conversation${Number(conversation.id) === Number(activeConversationId) ? ' active' : ''}`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'muslim-conversation-open';
      open.textContent = conversation.title || 'محادثة جديدة';
      open.title = open.textContent;
      open.addEventListener('click', () => loadConversation(conversation.id));
      const actions = document.createElement('div');
      actions.className = 'muslim-conversation-actions';
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.title = 'إعادة تسمية';
      rename.setAttribute('aria-label', 'إعادة تسمية المحادثة');
      rename.textContent = '✎';
      rename.addEventListener('click', async () => {
        const nextTitle = window.prompt('اكتب اسماً جديداً للمحادثة:', conversation.title || '');
        if (nextTitle === null) return;
        const title = nextTitle.trim();
        if (!title) return window.alert('العنوان لا يمكن أن يكون فارغاً.');
        try {
          await api(`/conversations/${conversation.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
          await loadConversations();
        } catch (error) { window.alert(error.message); }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.title = 'حذف المحادثة';
      remove.setAttribute('aria-label', 'حذف المحادثة');
      remove.textContent = '×';
      remove.addEventListener('click', async () => {
        if (!window.confirm('هل تريد حذف هذه المحادثة نهائياً؟')) return;
        try {
          await api(`/conversations/${conversation.id}`, { method: 'DELETE' });
          if (Number(activeConversationId) === Number(conversation.id)) showWelcome();
          await loadConversations();
        } catch (error) { window.alert(error.message); }
      });
      actions.append(rename, remove);
      row.append(open, actions);
      list.appendChild(row);
    });
  }

  async function loadConversations() {
    const data = await api('/conversations');
    renderConversationList(data.conversations || []);
    return data.conversations || [];
  }

  async function createConversation() {
    const data = await api('/conversations', { method: 'POST', body: '{}' });
    activeConversationId = data.conversation.id;
    setConversationInUrl(activeConversationId);
    await loadConversations();
    showChat();
    messagesEl.replaceChildren();
    closeSidebar();
    input.focus();
    return activeConversationId;
  }

  async function loadConversation(id) {
    try {
      const data = await api(`/conversations/${encodeURIComponent(id)}`);
      activeConversationId = data.conversation.id;
      setConversationInUrl(activeConversationId);
      showChat();
      messagesEl.replaceChildren();
      (data.messages || []).forEach((message) => addMessage(message.role, message.content));
      await loadConversations();
      closeSidebar();
      scrollToBottom();
    } catch (error) {
      if (error.status === 404) {
        setConversationInUrl(null);
        showWelcome();
        await loadConversations();
      } else {
        showStatus(error.message);
      }
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; });
  }

  function updateComposerMode() {
    const composing = document.activeElement === input || Boolean(input.value.trim());
    document.body.classList.toggle('is-composing', composing);
  }

  function showStatus(message) {
    const node = document.createElement('p');
    node.className = 'muslim-inline-error';
    node.textContent = message;
    messagesEl.appendChild(node);
    scrollToBottom();
  }

  async function sendMessage(rawText) {
    const message = String(rawText || '').trim();
    if (!message || sending) return;
    if (!authenticated) {
      showStatus('سجّل الدخول إلى هُدى أولاً حتى تتمكن من حفظ محادثاتك واستخدام مسلم.');
      return;
    }
    sending = true;
    if (!activeConversationId) {
      try { await createConversation(); }
      catch (error) { showStatus(error.message); sending = false; return; }
    }
    showChat();
    addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';
    updateComposerMode();
    sendButton.disabled = true;
    thinking.hidden = false;
    scrollToBottom();
    try {
      const data = await api(`/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message })
      });
      if (data.answer) addMessage('assistant', data.answer);
      await loadConversations();
    } catch (error) {
      showStatus(error.message || 'تعذّر الحصول على إجابة.');
      if (error.data?.userMessage) await loadConversations().catch(() => {});
    } finally {
      thinking.hidden = true;
      sendButton.disabled = false;
      sending = false;
      input.focus();
      scrollToBottom();
    }
  }

  $('#new-chat').addEventListener('click', async () => {
    if (!authenticated) return showStatus('سجّل الدخول أولاً لاستخدام المحادثات.');
    try { await createConversation(); }
    catch (error) { showStatus(error.message); }
  });
  $('#open-sidebar').addEventListener('click', openSidebar);
  $('.muslim-sidebar-close').addEventListener('click', closeSidebar);
  scrim.addEventListener('click', closeSidebar);
  document.querySelectorAll('[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.prompt || '';
      sendMessage(input.value);
    });
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    updateComposerMode();
  });
  input.addEventListener('focus', updateComposerMode);
  input.addEventListener('blur', updateComposerMode);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  async function init() {
    try {
      const user = await Huda.getSession();
      authenticated = Boolean(user);
      if (!authenticated) {
        const hint = document.createElement('p');
        hint.className = 'muslim-login-hint';
        hint.innerHTML = 'للاستفادة من مسلم وحفظ محادثاتك، <a href="login.html">سجّل الدخول</a> أو <a href="register.html">أنشئ حساباً</a>.';
        $('.muslim-composer-wrap').prepend(hint);
        sendButton.title = 'يتطلب تسجيل الدخول';
        return;
      }
      const conversations = await loadConversations();
      const requestedId = new URL(location.href).searchParams.get('conversation');
      if (requestedId && /^\d+$/.test(requestedId)) {
        await loadConversation(requestedId);
      } else {
        showWelcome();
        renderConversationList(conversations);
      }
    } catch (error) {
      showStatus(error.message || 'تعذّر تحميل المحادثات. تحقق من اتصال الخادم.');
    }
  }
  init();
})();
