/**
 * محرك ألعاب هُدى — مفسّر مغلق لـ Game Specification.
 *
 * مهم جداً: هذا الملف لا ينفّذ أي كود قادم من المستخدم أو من الذكاء الاصطناعي.
 * هو يقرأ فقط بيانات JSON (title, type, objects[].type من قائمة ثابتة, props
 * رقمية/نصية قصيرة...) ويرسمها بدوال رسم مكتوبة يدوياً مسبقاً هنا. لا يوجد
 * أي `eval`, `new Function`, `innerHTML` لمحتوى المستخدم، ولا تحميل سكربتات
 * خارجية. أي نص من الـ spec يُعرض حصراً عبر `textContent` أو Canvas text.
 *
 * الـ Game Specification الممرَّرة هنا يُفترض أنها مرّت مسبقاً من
 * backend/lib/game-spec-validator.js على السيرفر، لكن هذا الملف لا يثق بذلك
 * ضمنياً: أي نوع عنصر أو حقل غير متوقع يُتجاهل بصمت بدل التسبب بخطأ أو تنفيذ.
 */
(function (global) {
  'use strict';

  const ARCADE_TYPES = new Set(['collect', 'avoid', 'speed', 'educational']);
  const QUIZ_TYPES = new Set(['quiz', 'match', 'memory', 'sort', 'word', 'puzzle']);

  const THEME_COLORS = {
    space: '#0b1030', ocean: '#083a52', desert: '#6b4a2b', forest: '#153d1f',
    city: '#2b2b3a', islamic: '#0d3b34', classroom: '#2c2c2c', neutral: '#1f2937',
  };

  const PLAYER_COLORS = ['#3ddc97', '#ffb703', '#4cc9f0', '#f72585'];
  const KEY_SETS = [
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
    { up: 'w', down: 's', left: 'a', right: 'd' },
    { up: 'i', down: 'k', left: 'j', right: 'l' },
    { up: '8', down: '5', left: '4', right: '6' },
  ];

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function findObjects(spec, type) {
    return spec.objects.filter((o) => o.type === type);
  }

  /**
   * نقطة الدخول الوحيدة: تُركّب اللعبة داخل container وترجع متحكماً بإمكان تدميره.
   * @param {HTMLElement} container
   * @param {object} spec - Game Specification متحقَّق منها مسبقاً
   * @param {{onFinish?: (result: object) => void}} options
   */
  function mount(container, spec, options = {}) {
    container.innerHTML = '';
    if (ARCADE_TYPES.has(spec.type)) {
      return mountArcade(container, spec, options);
    }
    return mountQuiz(container, spec, options);
  }

  // ================= وضع الأركيد (حركة + تصادم) =================
  function mountArcade(container, spec, options) {
    const width = 640, height = 400;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.className = 'huda-game-canvas';
    container.appendChild(canvas);

    const hud = document.createElement('div');
    hud.className = 'huda-game-hud';
    container.appendChild(hud);

    const ctx = canvas.getContext('2d');
    const playerCount = clamp(spec.players || 1, 1, 4);

    // حالة اللاعبين
    const players = [];
    const specPlayers = findObjects(spec, 'PLAYER');
    for (let i = 0; i < playerCount; i++) {
      const base = specPlayers[i] || specPlayers[0] || {};
      players.push({
        id: `p${i}`,
        x: clamp(base.props?.x ?? 60 + i * 40, 20, width - 20),
        y: clamp(base.props?.y ?? height / 2, 20, height - 20),
        r: 14,
        speed: clamp(base.props?.speed ?? 4, 1, 20),
        color: base.props?.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
        lives: clamp(base.props?.lives ?? 3, 1, 9),
        score: spec.scoreSystem?.startValue || 0,
        alive: true,
        keys: KEY_SETS[i] || KEY_SETS[0],
      });
    }

    // عناصر ثابتة/متحركة أخرى
    let collectibles = spec.objects
      .filter((o) => o.type === 'STAR' || o.type === 'COIN')
      .map((o) => ({ ...o, x: o.props?.x ?? Math.random() * (width - 40) + 20, y: o.props?.y ?? Math.random() * (height - 40) + 20, value: o.props?.value ?? 10, taken: false }));

    const enemies = spec.objects.filter((o) => o.type === 'ENEMY').map((o) => ({
      ...o,
      x: o.props?.x ?? Math.random() * width,
      y: o.props?.y ?? Math.random() * height,
      speed: clamp(o.props?.speed ?? 2, 1, 20),
      pattern: o.props?.pattern || 'random',
      dir: Math.random() * Math.PI * 2,
    }));

    const obstacles = spec.objects.filter((o) => o.type === 'OBSTACLE' || o.type === 'PLATFORM')
      .map((o) => ({ x: o.props?.x ?? 0, y: o.props?.y ?? 0, w: o.props?.width ?? 60, h: o.props?.height ?? 20 }));

    const goal = findObjects(spec, 'GOAL')[0];
    const background = findObjects(spec, 'BACKGROUND')[0];
    const bgColor = THEME_COLORS[background?.props?.theme] || THEME_COLORS[spec.theme] || '#1f2937';

    let timeLeft = clamp(spec.duration || 60, 5, 3600);
    let running = true;
    let rafId = null;
    const pressed = new Set();

    function onKeyDown(e) { pressed.add(e.key); }
    function onKeyUp(e) { pressed.delete(e.key); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    function movePlayer(p) {
      if (!p.alive) return;
      let dx = 0, dy = 0;
      if (pressed.has(p.keys.up)) dy -= 1;
      if (pressed.has(p.keys.down)) dy += 1;
      if (pressed.has(p.keys.left)) dx -= 1;
      if (pressed.has(p.keys.right)) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        const nx = clamp(p.x + (dx / len) * p.speed, p.r, width - p.r);
        const ny = clamp(p.y + (dy / len) * p.speed, p.r, height - p.r);
        if (!collidesObstacle(nx, ny, p.r)) { p.x = nx; p.y = ny; }
      }
    }

    function collidesObstacle(x, y, r) {
      return obstacles.some((o) => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
    }

    function moveEnemy(en) {
      if (en.pattern === 'static') return;
      if (en.pattern === 'random' && Math.random() < 0.02) en.dir = Math.random() * Math.PI * 2;
      if (en.pattern === 'chase') {
        const target = players.find((p) => p.alive) || players[0];
        en.dir = Math.atan2(target.y - en.y, target.x - en.x);
      }
      if (en.pattern === 'patrol') {
        en.dir += (Math.random() - 0.5) * 0.05;
      }
      en.x = clamp(en.x + Math.cos(en.dir) * en.speed, 10, width - 10);
      en.y = clamp(en.y + Math.sin(en.dir) * en.speed, 10, height - 10);
    }

    function checkCollisions() {
      players.forEach((p) => {
        if (!p.alive) return;
        collectibles.forEach((c) => {
          if (!c.taken && dist(p.x, p.y, c.x, c.y) < p.r + 10) {
            c.taken = true;
            p.score += Number(c.value) || 10;
          }
        });
        enemies.forEach((en) => {
          if (dist(p.x, p.y, en.x, en.y) < p.r + 12) {
            if (spec.type === 'avoid' || spec.type === 'speed') {
              p.lives -= 1;
              p.x = clamp(p.x - 30, p.r, width - p.r);
              if (p.lives <= 0) p.alive = false;
            }
          }
        });
        if (goal && dist(p.x, p.y, goal.props?.x ?? width - 40, goal.props?.y ?? height - 40) < p.r + 14) {
          p.reachedGoal = true;
        }
      });
    }

    function evaluateWin() {
      const wc = spec.winCondition || { type: 'surviveTime' };
      if (wc.type === 'reachScore') {
        return players.find((p) => p.score >= (wc.targetScore || 100));
      }
      if (wc.type === 'collectAll') {
        return collectibles.length > 0 && collectibles.every((c) => c.taken) ? players[0] : null;
      }
      if (wc.type === 'reachGoal') {
        return players.find((p) => p.reachedGoal);
      }
      if (wc.type === 'surviveTime') {
        return timeLeft <= 0 ? players.find((p) => p.alive) || null : null;
      }
      return null;
    }

    function draw() {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // طبقة عمق بصري بسيطة لوضع 2.5D (ظل + إزاحة، بدون محرك 3D حقيقي)
      const isDepth = spec.dimension === '2.5D';

      obstacles.forEach((o) => {
        ctx.fillStyle = '#5c5470';
        if (isDepth) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(o.x + 4, o.y + 6, o.w, o.h); ctx.fillStyle = '#5c5470'; }
        ctx.fillRect(o.x, o.y, o.w, o.h);
      });

      collectibles.forEach((c) => {
        if (c.taken) return;
        ctx.beginPath();
        ctx.fillStyle = c.type === 'STAR' ? '#ffd60a' : '#f4a261';
        ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      if (goal) {
        ctx.fillStyle = '#2ec4b6';
        ctx.fillRect((goal.props?.x ?? width - 40) - 14, (goal.props?.y ?? height - 40) - 14, 28, 28);
      }

      enemies.forEach((en) => {
        ctx.beginPath();
        ctx.fillStyle = '#e63946';
        ctx.arc(en.x, en.y, 12, 0, Math.PI * 2);
        ctx.fill();
      });

      players.forEach((p) => {
        if (isDepth) { ctx.beginPath(); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.arc(p.x + 3, p.y + 5, p.r, 0, Math.PI * 2); ctx.fill(); }
        ctx.beginPath();
        ctx.fillStyle = p.alive ? p.color : '#666';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function renderHud() {
      const scores = players.map((p, i) => `لاعب ${i + 1}: ${p.score}${p.lives < 9 ? ' ❤ ' + p.lives : ''}`).join('  ·  ');
      hud.textContent = `⏱ ${Math.ceil(timeLeft)}ث   ${scores}`;
    }

    let lastTs = performance.now();
    function loop(ts) {
      if (!running) return;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      timeLeft -= dt;

      players.forEach(movePlayer);
      enemies.forEach(moveEnemy);
      checkCollisions();
      draw();
      renderHud();

      const winner = evaluateWin();
      if (winner || timeLeft <= 0) {
        finish(winner);
        return;
      }
      rafId = requestAnimationFrame(loop);
    }

    function finish(winner) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      const result = {
        finished: true,
        winnerIndex: winner ? players.indexOf(winner) : -1,
        scores: players.map((p) => p.score),
      };
      renderResultScreen(container, spec, result);
      if (typeof options.onFinish === 'function') options.onFinish(result);
    }

    rafId = requestAnimationFrame(loop);

    return {
      destroy() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        container.innerHTML = '';
      },
    };
  }

  // ================= وضع الأسئلة/البطاقات (quiz, match, memory, sort, word, puzzle) =================
  function mountQuiz(container, spec, options) {
    const wrap = document.createElement('div');
    wrap.className = 'huda-quiz-wrap';
    container.appendChild(wrap);

    const questions = findObjects(spec, 'QUESTION');
    const answers = findObjects(spec, 'ANSWER');
    let timeLeft = clamp(spec.duration || 60, 5, 3600);
    let score = spec.scoreSystem?.startValue || 0;
    let qIndex = 0;
    let correctCount = 0;
    let timerId = null;
    let finished = false;

    const hud = document.createElement('div');
    hud.className = 'huda-game-hud';
    wrap.appendChild(hud);

    const stage = document.createElement('div');
    stage.className = 'huda-quiz-stage';
    wrap.appendChild(stage);

    function renderHud() {
      hud.textContent = `⏱ ${Math.ceil(timeLeft)}ث   النقاط: ${score}   السؤال ${Math.min(qIndex + 1, questions.length)}/${questions.length || 1}`;
    }

    function renderQuestion() {
      stage.innerHTML = '';
      if (questions.length === 0) {
        // لا توجد أسئلة في الـ spec — نعرض العناصر كبطاقات عامة بدل شاشة فارغة.
        const list = document.createElement('div');
        list.className = 'huda-card-list';
        spec.objects.forEach((o) => {
          const card = document.createElement('div');
          card.className = 'huda-card';
          card.textContent = `${o.type}${o.props?.content ? ': ' + o.props.content : ''}`;
          list.appendChild(card);
        });
        stage.appendChild(list);
        return;
      }
      if (qIndex >= questions.length) { endQuiz(); return; }
      const q = questions[qIndex];
      const qEl = document.createElement('p');
      qEl.className = 'huda-quiz-question';
      qEl.textContent = q.props?.prompt || q.id; // نص فقط — textContent، لا innerHTML
      stage.appendChild(qEl);

      const optionsEl = document.createElement('div');
      optionsEl.className = 'huda-quiz-options';
      const qAnswers = answers.filter((a) => a.props?.questionId === q.id);
      (qAnswers.length ? qAnswers : answers).forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'button button-secondary huda-quiz-option';
        btn.textContent = a.props?.label || a.id;
        btn.addEventListener('click', () => handleAnswer(a));
        optionsEl.appendChild(btn);
      });
      stage.appendChild(optionsEl);
    }

    function handleAnswer(a) {
      const q = questions[qIndex];
      const isCorrect = q.props?.correctAnswerId && a.id === q.props.correctAnswerId;
      if (isCorrect) {
        score += spec.scoreSystem?.pointsPerAction ?? 10;
        correctCount += 1;
      } else if (spec.scoreSystem?.penaltyPerMistake) {
        score = Math.max(0, score - spec.scoreSystem.penaltyPerMistake);
      }
      qIndex += 1;
      renderHud();
      renderQuestion();
    }

    function endQuiz() {
      if (finished) return;
      finished = true;
      if (timerId) clearInterval(timerId);
      const wc = spec.winCondition || {};
      const won = wc.type === 'answerAllCorrect' ? correctCount === questions.length && questions.length > 0
        : wc.type === 'reachScore' ? score >= (wc.targetScore || 0)
        : true;
      const result = { finished: true, winnerIndex: won ? 0 : -1, scores: [score] };
      renderResultScreen(container, spec, result);
      if (typeof options.onFinish === 'function') options.onFinish(result);
    }

    timerId = setInterval(() => {
      timeLeft -= 1;
      renderHud();
      if (timeLeft <= 0) endQuiz();
    }, 1000);

    renderHud();
    renderQuestion();

    return {
      destroy() {
        finished = true;
        if (timerId) clearInterval(timerId);
        container.innerHTML = '';
      },
    };
  }

  // ================= شاشة النتائج المشتركة =================
  function renderResultScreen(container, spec, result) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'huda-result-screen';

    const heading = document.createElement('h3');
    heading.textContent = result.winnerIndex >= 0 ? '🎉 فزت!' : 'انتهت الجولة';
    box.appendChild(heading);

    const scoresEl = document.createElement('p');
    scoresEl.textContent = result.scores.map((s, i) => `لاعب ${i + 1}: ${s} نقطة`).join('  ·  ');
    box.appendChild(scoresEl);

    container.appendChild(box);
  }

  global.HudaGameEngine = { mount };
})(window);
