(() => {
  'use strict';
  if (document.getElementById('huda-ai-fab')) return;

  const API = (window.CONFIG?.API?.BASE_URL) || '/api';
  const ASSET_PREFIX = location.pathname.includes('/pages/') ? '../assets/' : 'assets/';
  const history = [];

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --huda-ai-bg: #0b111b;
      --huda-ai-panel: #0d141f;
      --huda-ai-card: #202731;
      --huda-ai-line: #2b3543;
      --huda-ai-text: #f4f6f8;
      --huda-ai-muted: #89929e;
      --huda-ai-green: #07866d;
      --huda-ai-green-bright: #079d7d;
    }

    .huda-ai-fab {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 9998;
      width: 64px;
      height: 64px;
      padding: 7px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 50%;
      background: #0c3028;
      box-shadow: 0 12px 30px rgba(0,0,0,.28), 0 0 0 1px rgba(0,140,110,.08);
      cursor: pointer;
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .huda-ai-fab:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0,0,0,.34), 0 0 0 1px rgba(0,157,125,.18); }
    .huda-ai-fab img { width: 46px; height: 46px; object-fit: contain; }

    .huda-ai-panel {
      position: fixed;
      right: 28px;
      bottom: 32px;
      z-index: 9999;
      width: min(440px, calc(100vw - 32px));
      height: min(640px, calc(100vh - 64px));
      min-height: 480px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--huda-ai-text);
      background: var(--huda-ai-bg);
      border: 1px solid #2b3543;
      border-radius: 27px;
      box-shadow: 0 28px 80px rgba(0,0,0,.48), 0 8px 30px rgba(0,0,0,.25);
      direction: rtl;
      animation: hudaAiIn .18s ease-out;
    }
    .huda-ai-panel[hidden] { display: none; }
    @keyframes hudaAiIn { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }

    .huda-ai-head {
      min-height: 82px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px 0 20px;
      border-bottom: 1px solid #252e3a;
      background: #0d141f;
    }
    .huda-ai-brand { display: flex; align-items: center; gap: 10px; }
    .huda-ai-brand img { width: 48px; height: 48px; object-fit: contain; }
    .huda-ai-brand strong { font-size: 1.08rem; font-weight: 800; letter-spacing: .01em; }
    .huda-ai-close {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      color: #f1f3f5;
      background: transparent;
      border: 0;
      border-radius: 50%;
      font-size: 30px;
      font-weight: 300;
      line-height: 1;
      cursor: pointer;
      direction: ltr;
    }
    .huda-ai-close:hover { background: rgba(255,255,255,.07); }

    .huda-ai-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 18px 18px 12px;
      scrollbar-width: thin;
      scrollbar-color: #394454 transparent;
    }
    .huda-ai-msg {
      max-width: 88%;
      padding: 12px 15px;
      border: 1px solid transparent;
      border-radius: 17px;
      line-height: 1.75;
      font-size: .94rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .huda-ai-bot {
      align-self: flex-start;
      color: #eef1f4;
      background: var(--huda-ai-card);
      border-color: #303947;
      border-top-left-radius: 7px;
    }
    .huda-ai-user {
      align-self: flex-end;
      color: #fff;
      background: #087c65;
      border-color: #0a9679;
      border-top-right-radius: 7px;
    }

    .huda-ai-suggestions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 8px;
      padding: 2px 18px 12px;
    }
    .huda-ai-suggestions button {
      color: #dfe4e8;
      background: #161d27;
      border: 1px solid #34404e;
      border-radius: 999px;
      padding: 9px 13px;
      font: inherit;
      font-size: .78rem;
      cursor: pointer;
      transition: background .18s ease, border-color .18s ease, transform .18s ease;
    }
    .huda-ai-suggestions button:hover { background: #202934; border-color: #4a5665; transform: translateY(-1px); }

    .huda-ai-disclaimer {
      margin: 0;
      padding: 8px 26px 12px;
      color: #7e8793;
      font-size: .68rem;
      line-height: 1.65;
      text-align: center;
      border-top: 1px solid rgba(255,255,255,.02);
    }

    .huda-ai-form {
      display: flex;
      direction: ltr;
      align-items: center;
      gap: 9px;
      padding: 10px 12px 12px;
      border-top: 1px solid #252e3a;
      background: #0d141f;
    }
    .huda-ai-input-wrap {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    .huda-ai-input {
      width: 100%;
      height: 58px;
      box-sizing: border-box;
      padding: 0 16px;
      color: #f2f4f6;
      background: #1b222c;
      border: 1px solid #34404c;
      border-radius: 17px;
      outline: none;
      font: inherit;
      font-size: .9rem;
      direction: rtl;
      transition: border-color .18s ease, box-shadow .18s ease;
    }
    .huda-ai-input::placeholder { color: #737d89; }
    .huda-ai-input:focus { border-color: #078e73; box-shadow: 0 0 0 3px rgba(0,142,115,.12); }
    .huda-ai-send {
      flex: 0 0 auto;
      min-width: 86px;
      height: 58px;
      padding: 0 17px;
      color: #fff;
      background: var(--huda-ai-green);
      border: 0;
      border-radius: 17px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      transition: background .18s ease, transform .18s ease;
    }
    .huda-ai-send:hover:not(:disabled) { background: var(--huda-ai-green-bright); transform: translateY(-1px); }
    .huda-ai-send:disabled { opacity: .58; cursor: wait; }

    @media (max-width: 600px) {
      .huda-ai-fab { right: 16px; bottom: 16px; width: 58px; height: 58px; }
      .huda-ai-fab img { width: 42px; height: 42px; }
      .huda-ai-panel {
        right: 8px;
        bottom: 8px;
        width: calc(100vw - 16px);
        height: calc(100vh - 16px);
        min-height: 0;
        border-radius: 23px;
      }
      .huda-ai-head { min-height: 70px; }
      .huda-ai-brand img { width: 42px; height: 42px; }
      .huda-ai-suggestions { padding-bottom: 9px; }
      .huda-ai-disclaimer { padding-left: 18px; padding-right: 18px; }
      .huda-ai-form { padding: 9px; }
      .huda-ai-send { min-width: 76px; }
    }
  `;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.id = 'huda-ai-fab';
  fab.className = 'huda-ai-fab';
  fab.type = 'button';
  fab.title = 'اسأل مسلم';
  fab.setAttribute('aria-label', 'فتح مسلم');
  fab.innerHTML = `<img src="${ASSET_PREFIX}muslim-logo.png" alt="مسلم">`;

  const panel = document.createElement('section');
  panel.className = 'huda-ai-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'مساعد مسلم الذكي');
  panel.innerHTML = `
    <header class="huda-ai-head">
      <div class="huda-ai-brand">
        <img src="${ASSET_PREFIX}muslim-logo.png" alt="">
        <strong>مسلم</strong>
      </div>
      <button type="button" class="huda-ai-close" aria-label="إغلاق">×</button>
    </header>
    <div class="huda-ai-messages" aria-live="polite"></div>
    <div class="huda-ai-suggestions" aria-label="أسئلة مقترحة">
      <button type="button" data-q="ما شروط الصلاة؟">شروط الصلاة</button>
      <button type="button" data-q="ما فضل القرآن؟">فضل القرآن</button>
      <button type="button" data-q="ما هي التوبة الصحيحة؟">التوبة</button>
    </div>
    <p class="huda-ai-disclaimer">مسلم للمعلومات العامة؛ لا يغني عن سؤال العالم الموثوق في الفتاوى الشخصية أو المسائل الخلافية.</p>
    <form class="huda-ai-form">
      <button class="huda-ai-send" type="submit">إرسال</button>
      <div class="huda-ai-input-wrap">
        <input class="huda-ai-input" maxlength="1200" placeholder="اكتب سؤالك عن الدين…" autocomplete="off" aria-label="اكتب سؤالك عن الدين">
      </div>
    </form>
  `;

  document.body.append(fab, panel);

  const messages = panel.querySelector('.huda-ai-messages');
  const input = panel.querySelector('.huda-ai-input');
  const form = panel.querySelector('form');
  const sendButton = panel.querySelector('.huda-ai-send');
  let greeted = false;

  function add(type, text) {
    const d = document.createElement('div');
    d.className = `huda-ai-msg huda-ai-${type}`;
    d.textContent = text;
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
    return d;
  }

  async function openAssistant() {
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;

    const user = await window.Huda?.getSession?.();
    if (!user) {
      if (!greeted) {
        add('bot', 'سجّل الدخول أولاً حتى تستخدم هُدى AI.');
        greeted = true;
      }
      return;
    }

    if (!greeted) {
      add('bot', `السلام عليكم 🌿\nأنا مسلم المساعد الذكي في هُدى. اسألني عن الدين، القرآن، الحديث، السيرة أو العبادات، وسأحاول مساعدتك بدقة.`);
      greeted = true;
    }
    input.focus();
  }

  async function ask(q) {
    if (!q || sendButton.disabled) return;
    add('user', q);
    input.value = '';
    const loading = add('bot', 'جاري التفكير…');
    sendButton.disabled = true;

    const prior = history.slice(-8);
    history.push({ role: 'user', text: q });

    try {
      const res = await fetch(`${API}/ai/ask`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: prior })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'تعذّر الحصول على الإجابة.');
      const answer = data.answer || 'لم أجد إجابة.';
      loading.textContent = answer;
      history.push({ role: 'assistant', text: answer });
    } catch (err) {
      loading.textContent = err.message || 'تعذّر الحصول على إجابة الآن.';
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  }

  fab.addEventListener('click', openAssistant);
  panel.querySelector('.huda-ai-close').addEventListener('click', () => { panel.hidden = true; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value.trim());
  });
  panel.querySelectorAll('.huda-ai-suggestions button').forEach((button) => {
    button.addEventListener('click', () => ask(button.dataset.q));
  });
})();
