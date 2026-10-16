/**
 * منطق صفحة استوديو هُدى. يتحدث فقط مع Backend عبر /api/games/* — لا يتصل
 * بـ Gemini مباشرة من المتصفح ولا يحمل أي مفتاح API هنا أبداً.
 */
(() => {
  const API_BASE = CONFIG.API.BASE_URL;

  const form = document.getElementById('studio-form');
  const descriptionEl = document.getElementById('game-description');
  const descCounter = document.getElementById('description-counter');
  const generateBtn = document.getElementById('generate-button');
  const statusEl = document.getElementById('studio-status');
  const statusText = document.getElementById('studio-status-text');
  const resultEl = document.getElementById('studio-result');
  const resultTitle = document.getElementById('result-title');
  const resultSummary = document.getElementById('result-summary');
  const playBtn = document.getElementById('play-game-btn');
  const editIdeaBtn = document.getElementById('edit-idea-btn');
  const saveBtn = document.getElementById('save-game-btn');
  const editForm = document.getElementById('edit-form');
  const editInput = document.getElementById('edit-instruction-input');
  const applyEditBtn = document.getElementById('apply-edit-btn');

  const buildPanel = document.getElementById('studio-build');
  const playPanel = document.getElementById('studio-play');
  const playTitle = document.getElementById('play-title');
  const gameContainer = document.getElementById('game-container');
  const backBtn = document.getElementById('back-to-build-btn');

  const selections = { gameCategory: 'تعليم', dimension: '2D', players: '1', difficulty: 'easy' };
  let currentSpec = null;
  let activeGame = null;

  // ---- اختيار الرقائق (chips) ----
  document.querySelectorAll('.chip-group').forEach((group) => {
    const field = group.dataset.field;
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      group.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      selections[field] = btn.dataset.value;
    });
  });

  descriptionEl.addEventListener('input', () => {
    descCounter.textContent = `${descriptionEl.value.length} / 500`;
  });

  function setLoading(loading, message) {
    statusEl.hidden = !loading;
    generateBtn.disabled = loading;
    if (message) statusText.textContent = message;
  }

  async function apiPost(path, body) {
    const res = await HudaUtils.fetchWithRetry(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }, 1);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'حدث خطأ غير متوقع.');
    return data;
  }

  function summarizeSpec(spec) {
    resultSummary.innerHTML = '';
    const items = [
      `النمط: ${spec.dimension}`,
      `اللاعبون: ${spec.players}`,
      `المدة: ${spec.duration} ثانية`,
      `الصعوبة: ${spec.difficulty === 'easy' ? 'سهل' : spec.difficulty === 'hard' ? 'صعب' : 'متوسط'}`,
      `عدد العناصر: ${spec.objects.length}`,
    ];
    items.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text; // نص فقط — لا innerHTML لأي محتوى من الـ spec
      resultSummary.appendChild(li);
    });
  }

  function showResult(spec) {
    currentSpec = spec;
    resultTitle.textContent = spec.title;
    summarizeSpec(spec);
    resultEl.hidden = false;
    editForm.hidden = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const description = descriptionEl.value.trim();
    if (!description) return;

    resultEl.hidden = true;
    setLoading(true, 'جاري بناء لعبتك...');
    try {
      const data = await apiPost('/games/generate', {
        description,
        gameCategory: selections.gameCategory,
        dimension: selections.dimension,
        players: Number(selections.players),
        difficulty: selections.difficulty,
      });
      showResult(data.spec);
      HudaUtils.showToast('تم إنشاء اللعبة!', 'success');
    } catch (err) {
      HudaUtils.showToast(HudaUtils.getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  });

  editIdeaBtn.addEventListener('click', () => {
    editForm.hidden = !editForm.hidden;
  });

  applyEditBtn.addEventListener('click', async () => {
    const instruction = editInput.value.trim();
    if (!instruction || !currentSpec) return;
    setLoading(true, 'جاري تعديل لعبتك...');
    try {
      const data = await apiPost('/games/generate/edit', { spec: currentSpec, editInstruction: instruction });
      showResult(data.spec);
      editInput.value = '';
      HudaUtils.showToast('تم تحديث اللعبة!', 'success');
    } catch (err) {
      HudaUtils.showToast(HudaUtils.getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!currentSpec) return;
    try {
      await apiPost('/games', { spec: currentSpec, title: currentSpec.title, visibility: 'private' });
      HudaUtils.showToast('تم حفظ اللعبة في «ألعابي».', 'success');
    } catch (err) {
      HudaUtils.showToast(HudaUtils.getErrorMessage(err), 'error');
    }
  });

  playBtn.addEventListener('click', () => {
    if (!currentSpec) return;
    buildPanel.hidden = true;
    playPanel.hidden = false;
    playTitle.textContent = currentSpec.title;
    if (activeGame) activeGame.destroy();
    activeGame = window.HudaGameEngine.mount(gameContainer, currentSpec);
  });

  backBtn.addEventListener('click', () => {
    if (activeGame) { activeGame.destroy(); activeGame = null; }
    playPanel.hidden = true;
    buildPanel.hidden = false;
  });
})();
