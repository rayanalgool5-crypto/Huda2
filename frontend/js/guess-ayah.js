(() => {
  'use strict';
  const root = document.getElementById('guess-ayah-app');
  if (!root) return;

  const API = `${(window.CONFIG?.API?.BASE_URL) || '/api'}/guess-ayah`;
  const ROUND_MS = 20000;

  const panels = {
    select: document.getElementById('ga-mode-select'),
    solo: document.getElementById('ga-solo'),
    entry: document.getElementById('ga-mp-entry'),
    room: document.getElementById('ga-room'),
  };

  function showPanel(name) {
    Object.entries(panels).forEach(([key, el]) => { if (el) el.hidden = key !== name; });
  }

  async function postJson(path, body) {
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'حدث خطأ، حاول مرة أخرى.');
    return data;
  }
  async function getJson(path) {
    const response = await fetch(`${API}${path}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'حدث خطأ، حاول مرة أخرى.');
    return data;
  }

  // ===================== اختيار الوضع =====================
  panels.select?.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'solo') { showPanel('solo'); loadSoloRound(); }
      else { showPanel('entry'); }
    });
  });
  root.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => { stopPolling(); showPanel('select'); });
  });

  // ===================== الوضع الفردي =====================
  let soloScore = 0;
  let soloRoundId = null;
  let soloAnswered = false;
  const soloVerse = document.getElementById('ga-solo-verse');
  const soloOptions = document.getElementById('ga-solo-options');
  const soloFeedback = document.getElementById('ga-solo-feedback');
  const soloNextBtn = document.getElementById('ga-solo-next');
  const soloScoreEl = document.getElementById('ga-solo-score');

  async function loadSoloRound() {
    soloAnswered = false;
    soloFeedback.textContent = '';
    soloNextBtn.hidden = true;
    soloVerse.textContent = 'جاري تجهيز آية…';
    soloOptions.innerHTML = '';
    try {
      const data = await getJson('/solo/round');
      soloRoundId = data.roundId;
      soloVerse.textContent = data.text;
      renderOptions(soloOptions, data.options, onSoloAnswer);
    } catch (error) {
      soloVerse.textContent = 'تعذّر تحميل آية جديدة.';
      soloFeedback.textContent = error.message;
      soloFeedback.classList.add('ga-feedback-error');
    }
  }

  async function onSoloAnswer(index, button) {
    if (soloAnswered || !soloRoundId) return;
    soloAnswered = true;
    try {
      const data = await postJson(`/solo/round/${soloRoundId}/answer`, { optionIndex: index });
      markOptions(soloOptions, data.correctIndex, index);
      if (data.correct) {
        soloScore += 10;
        soloScoreEl.textContent = soloScore;
        soloFeedback.textContent = `أحسنت! هذه الآية من سورة ${data.surahName}.`;
        soloFeedback.classList.remove('ga-feedback-error');
      } else {
        soloFeedback.textContent = `للأسف، الإجابة الصحيحة هي سورة ${data.surahName}.`;
        soloFeedback.classList.add('ga-feedback-error');
      }
      soloNextBtn.hidden = false;
    } catch (error) {
      soloFeedback.textContent = error.message;
      soloFeedback.classList.add('ga-feedback-error');
    }
  }
  soloNextBtn?.addEventListener('click', loadSoloRound);

  function renderOptions(container, options, onPick) {
    container.innerHTML = '';
    options.forEach((name, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ga-option';
      btn.textContent = name;
      btn.addEventListener('click', () => onPick(index, btn));
      container.appendChild(btn);
    });
  }
  function markOptions(container, correctIndex, pickedIndex) {
    [...container.children].forEach((btn, index) => {
      btn.disabled = true;
      if (index === correctIndex) btn.classList.add('ga-option-correct');
      else if (index === pickedIndex) btn.classList.add('ga-option-wrong');
    });
  }

  // ===================== دخول اللعب الجماعي =====================
  const createForm = document.getElementById('ga-create-form');
  const joinForm = document.getElementById('ga-join-form');
  const entryError = document.getElementById('ga-mp-entry-error');

  createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    entryError.textContent = '';
    const name = document.getElementById('ga-create-name').value.trim();
    if (!name) return;
    try {
      const data = await postJson('/rooms', { name });
      enterRoom(data.code, data.token);
    } catch (error) {
      entryError.textContent = error.message;
    }
  });

  joinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    entryError.textContent = '';
    const code = document.getElementById('ga-join-code').value.trim().toUpperCase();
    const name = document.getElementById('ga-join-name').value.trim();
    if (!code || !name) return;
    try {
      const data = await postJson(`/rooms/${code}/join`, { name });
      enterRoom(data.code, data.token);
    } catch (error) {
      entryError.textContent = error.message;
    }
  });

  // ===================== غرفة اللعب الجماعي =====================
  let roomCode = null;
  let roomToken = null;
  let pollTimer = null;
  let timerRaf = null;
  let lastRoundIndexSeen = 0;
  let answeredThisRound = false;

  const roomCodeValue = document.getElementById('ga-room-code-value');
  const copyCodeBtn = document.getElementById('ga-copy-code');
  const lobbyBox = document.getElementById('ga-room-lobby');
  const startBtn = document.getElementById('ga-start-round');
  const lobbyHint = document.getElementById('ga-room-hint');
  const playingBox = document.getElementById('ga-room-playing');
  const roomVerse = document.getElementById('ga-room-verse');
  const roomOptions = document.getElementById('ga-room-options');
  const answeredCountEl = document.getElementById('ga-room-answered-count');
  const timerBar = document.getElementById('ga-timer-bar');
  const resultBox = document.getElementById('ga-room-result');
  const resultText = document.getElementById('ga-room-result-text');
  const nextRoundBtn = document.getElementById('ga-next-round');
  const resultHint = document.getElementById('ga-room-result-hint');
  const playersList = document.getElementById('ga-players-list');

  function enterRoom(code, token) {
    roomCode = code;
    roomToken = token;
    lastRoundIndexSeen = 0;
    roomCodeValue.textContent = code;
    showPanel('room');
    startPolling();
  }

  function startPolling() {
    stopPolling();
    pollOnce();
    pollTimer = setInterval(pollOnce, 1500);
  }
  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
    cancelAnimationFrame(timerRaf);
  }

  async function pollOnce() {
    if (!roomCode || !roomToken) return;
    try {
      const data = await getJson(`/rooms/${roomCode}?token=${encodeURIComponent(roomToken)}`);
      renderRoom(data.state);
    } catch (error) {
      resultHint.hidden = false;
      resultHint.textContent = error.message;
    }
  }

  function renderRoom(state) {
    lobbyBox.hidden = state.status !== 'lobby';
    playingBox.hidden = state.status !== 'playing';
    resultBox.hidden = state.status !== 'result';

    startBtn.hidden = !state.isHost;
    lobbyHint.hidden = state.isHost;

    if (state.status === 'playing' && state.round) {
      if (state.round.index !== lastRoundIndexSeen) {
        lastRoundIndexSeen = state.round.index;
        answeredThisRound = state.round.yourAnswer !== null;
        roomVerse.textContent = state.round.text;
        renderOptions(roomOptions, state.round.options, onRoomAnswer);
        if (answeredThisRound) {
          [...roomOptions.children].forEach((btn) => { btn.disabled = true; });
        }
      }
      animateTimer(state.round.endsAt);
      answeredCountEl.textContent = `أجاب ${state.round.answeredCount} من ${state.players.length} لاعبين`;
    }

    if (state.status === 'result' && state.round) {
      cancelAnimationFrame(timerRaf);
      const mine = state.players.find((p) => p.isYou);
      const correctName = state.round.surahName;
      if (state.round.yourAnswer === state.round.correctIndex && state.round.yourAnswer !== null) {
        resultText.textContent = `أحسنت يا ${mine?.name || ''}! الإجابة الصحيحة: سورة ${correctName}.`;
        resultText.classList.remove('ga-feedback-error');
      } else {
        resultText.textContent = `الإجابة الصحيحة: سورة ${correctName}.`;
        resultText.classList.add('ga-feedback-error');
      }
      nextRoundBtn.hidden = !state.isHost;
      resultHint.hidden = state.isHost;
      resultHint.textContent = 'بانتظار صاحب الغرفة لبدء الجولة التالية…';
    }

    playersList.innerHTML = state.players
      .map((p) => `<li class="${p.isYou ? 'ga-you' : ''}"><span>${escapeHtml(p.name)}${p.isYou ? ' (أنت)' : ''}</span><b>${p.score}</b></li>`)
      .join('') || '<li>لا يوجد لاعبون بعد</li>';
  }

  function animateTimer(endsAt) {
    cancelAnimationFrame(timerRaf);
    const tick = () => {
      const remaining = Math.max(0, endsAt - Date.now());
      const pct = Math.max(0, Math.min(100, (remaining / ROUND_MS) * 100));
      timerBar.style.width = `${pct}%`;
      if (remaining > 0) timerRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  async function onRoomAnswer(index, button) {
    if (answeredThisRound) return;
    answeredThisRound = true;
    [...roomOptions.children].forEach((btn) => { btn.disabled = true; });
    button.classList.add('ga-option-picked');
    try {
      await postJson(`/rooms/${roomCode}/answer`, { token: roomToken, optionIndex: index });
      pollOnce();
    } catch (error) {
      answeredCountEl.textContent = error.message;
    }
  }

  startBtn?.addEventListener('click', async () => {
    startBtn.disabled = true;
    try { await postJson(`/rooms/${roomCode}/start`, { token: roomToken }); pollOnce(); }
    catch (error) { lobbyHint.hidden = false; lobbyHint.textContent = error.message; }
    finally { startBtn.disabled = false; }
  });
  nextRoundBtn?.addEventListener('click', async () => {
    nextRoundBtn.disabled = true;
    try { await postJson(`/rooms/${roomCode}/start`, { token: roomToken }); pollOnce(); }
    catch (error) { resultHint.hidden = false; resultHint.textContent = error.message; }
    finally { nextRoundBtn.disabled = false; }
  });

  document.querySelectorAll('[data-leave]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      stopPolling();
      if (roomCode && roomToken) {
        try { await postJson(`/rooms/${roomCode}/leave`, { token: roomToken }); } catch { /* تجاهل */ }
      }
      roomCode = null; roomToken = null;
      showPanel('select');
    });
  });

  copyCodeBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomCode || '');
      copyCodeBtn.textContent = 'تم النسخ ✓';
      setTimeout(() => { copyCodeBtn.textContent = 'نسخ'; }, 1500);
    } catch { /* المتصفح قد يمنع الوصول للحافظة */ }
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }
})();
