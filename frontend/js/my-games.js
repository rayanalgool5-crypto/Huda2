(() => {
  const API_BASE = CONFIG.API.BASE_URL;

  const grid = document.getElementById('my-games-grid');
  const emptyState = document.getElementById('my-games-empty');
  const playSection = document.getElementById('games-play-section');
  const playTitle = document.getElementById('games-play-title');
  const playContainer = document.getElementById('games-play-container');
  const backBtn = document.getElementById('games-back-btn');

  let activeGame = null;

  const DIFFICULTY_LABEL = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  const TYPE_LABEL = {
    collect: 'جمع', avoid: 'تجنب', puzzle: 'ألغاز', quiz: 'أسئلة وأجوبة',
    match: 'مطابقة', memory: 'ذاكرة', sort: 'ترتيب', word: 'كلمات',
    speed: 'سرعة', educational: 'تعليمية',
  };

  async function fetchMyGames() {
    const res = await HudaUtils.fetchWithRetry(`${API_BASE}/games/mine`, { credentials: 'include' }, 1);
    if (!res.ok) throw new Error('تعذّر تحميل ألعابك.');
    return res.json();
  }

  async function deleteGame(id) {
    const res = await HudaUtils.fetchWithRetry(`${API_BASE}/games/${id}`, { method: 'DELETE', credentials: 'include' }, 1);
    if (!res.ok) throw new Error('تعذّر حذف اللعبة.');
  }

  function formatDate(iso) {
    try { return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('ar-EG'); } catch { return ''; }
  }

  function renderCard(game) {
    const card = document.createElement('article');
    card.className = 'game-card';

    const title = document.createElement('h3');
    title.textContent = game.title; // نص فقط
    card.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'game-card-meta';
    meta.textContent = `${TYPE_LABEL[game.spec.type] || game.spec.type} · ${game.dimension} · ${game.playersMax} لاعب · ${DIFFICULTY_LABEL[game.spec.difficulty] || ''} · ${formatDate(game.createdAt)}`;
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'game-card-actions';

    const playBtn = document.createElement('button');
    playBtn.className = 'button button-primary';
    playBtn.textContent = '▶️ تشغيل';
    playBtn.addEventListener('click', () => playGame(game));
    actions.appendChild(playBtn);

    const inviteBtn = document.createElement('button');
    inviteBtn.className = 'button button-secondary';
    inviteBtn.textContent = '👥 دعوة الأصدقاء';
    inviteBtn.disabled = true;
    inviteBtn.title = 'ميزة دعوة الأصدقاء قادمة قريباً';
    actions.appendChild(inviteBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-button';
    deleteBtn.textContent = '🗑 حذف';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('هل تريد حذف هذه اللعبة؟')) return;
      try {
        await deleteGame(game.id);
        card.remove();
        if (!grid.children.length) emptyState.hidden = false;
      } catch (err) {
        HudaUtils.showToast(HudaUtils.getErrorMessage(err), 'error');
      }
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
  }

  function playGame(game) {
    playSection.hidden = false;
    playTitle.textContent = game.title;
    window.scrollTo({ top: playSection.offsetTop - 80, behavior: 'smooth' });
    if (activeGame) activeGame.destroy();
    activeGame = window.HudaGameEngine.mount(playContainer, game.spec);
  }

  backBtn.addEventListener('click', () => {
    if (activeGame) { activeGame.destroy(); activeGame = null; }
    playSection.hidden = true;
  });

  (async () => {
    try {
      const games = await fetchMyGames();
      if (!games.length) { emptyState.hidden = false; return; }
      games.forEach((g) => grid.appendChild(renderCard(g)));
    } catch (err) {
      HudaUtils.showToast(HudaUtils.getErrorMessage(err), 'error');
    }
  })();
})();
