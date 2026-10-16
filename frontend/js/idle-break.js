(function () {
  'use strict';

  // Huda Idle Break: intentionally limited to the pages that opt in below.
  // It does NOT modify Quran playback/download code.
  const config = window.HUDA_IDLE_BREAK_CONFIG;
  if (!config || !config.enabled) return;

  const IDLE_MS = Number(config.idleMs) || 10000;
  // "لا تخرج لي مرة أخرى": تعطيل لهذه الجلسة فقط (تُستخدم sessionStorage
  // عمداً بدل localStorage)، فبمجرد إغلاق المتصفح/التبويب يُعاد هذا القرار
  // تلقائياً في المرة القادمة.
  const DISMISS_KEY = 'huda_idle_break_dismissed';
  let timer = null;
  let open = false;
  let destroyed = false;

  function isDismissedForSession() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  }
  function dismissForSession() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* تجاهل إن كان التخزين معطلاً */ }
  }

  const activityEvents = ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'keydown', 'wheel', 'scroll'];
  const reset = () => {
    if (destroyed || open || isDismissedForSession()) return;
    clearTimeout(timer);
    timer = setTimeout(showPrompt, IDLE_MS);
  };

  function showPrompt() {
    if (destroyed || open) return;
    if (isDismissedForSession()) return;
    if (typeof config.canShow === 'function' && !config.canShow()) {
      reset();
      return;
    }
    open = true;
    clearTimeout(timer);
    const overlay = document.createElement('div');
    overlay.className = 'huda-idle-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'استراحة هُدى');

    overlay.innerHTML = `
      <div class="huda-idle-card">
        <div class="huda-idle-icon" aria-hidden="true">🐍</div>
        <h2>هل تريد لعب لعبة؟</h2>
        <p>استراحة صغيرة؟ جرّب لعبة الحيّة 🐍</p>
        <div class="huda-idle-actions">
          <button type="button" class="button huda-idle-yes">نعم</button>
          <button type="button" class="button button-secondary huda-idle-no">لا</button>
        </div>
        <button type="button" class="huda-idle-dismiss">لا تُظهر لي هذا مرة أخرى (لهذه الجلسة فقط)</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.huda-idle-no').addEventListener('click', closePrompt);
    overlay.querySelector('.huda-idle-yes').addEventListener('click', () => {
      overlay.classList.add('huda-idle-opening');
      setTimeout(() => {
        overlay.remove();
        open = false;
        showSnake();
      }, 220);
    });
    overlay.querySelector('.huda-idle-dismiss').addEventListener('click', () => {
      dismissForSession();
      overlay.remove();
      open = false;
      clearTimeout(timer);
    });
  }

  function closePrompt() {
    const overlay = document.querySelector('.huda-idle-overlay');
    if (overlay) overlay.remove();
    open = false;
    reset();
  }

  function showSnake() {
    open = true;
    const overlay = document.createElement('div');
    overlay.className = 'huda-snake-overlay';
    overlay.innerHTML = `
      <div class="huda-snake-shell">
        <div class="huda-snake-top">
          <div>
            <span class="huda-snake-label">استراحة هُدى</span>
            <strong>🐍 الحيّة</strong>
          </div>
          <div class="huda-snake-score">النقاط: <b>0</b></div>
          <button type="button" class="huda-snake-close" aria-label="إغلاق اللعبة">×</button>
        </div>
        <div class="huda-snake-stage" aria-live="polite">
          <canvas class="huda-snake-canvas" aria-label="لعبة الحيّة"></canvas>
          <div class="huda-snake-message" hidden>
            <strong>انتهت اللعبة</strong>
            <span>النقاط: <b class="final-score">0</b></span>
            <button type="button" class="button huda-snake-restart">العب مرة أخرى</button>
          </div>
        </div>
        <div class="huda-snake-controls" aria-label="أزرار التحكم">
          <button data-dir="up" aria-label="أعلى">↑</button>
          <div>
            <button data-dir="left" aria-label="يسار">←</button>
            <button data-dir="down" aria-label="أسفل">↓</button>
            <button data-dir="right" aria-label="يمين">→</button>
          </div>
        </div>
        <p class="huda-snake-help">الكمبيوتر: الأسهم من لوحة المفاتيح · الهاتف: الأزرار بالأسفل</p>
      </div>`;

    document.body.appendChild(overlay);
    // The page is RTL, but the on-screen control row must remain LTR so that
    // the right-arrow button is physically on the right and the left-arrow
    // button is physically on the left. data-dir already contains the correct
    // movement direction; this only fixes the visual order of the buttons.
    const controlRow = overlay.querySelector('.huda-snake-controls > div');
    if (controlRow) controlRow.dir = 'ltr';
    initSnake(overlay);
  }

  function initSnake(overlay) {
    const canvas = overlay.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = overlay.querySelector('.huda-snake-score b');
    const message = overlay.querySelector('.huda-snake-message');
    const finalScore = overlay.querySelector('.final-score');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cols = 24, rows = 18;
    let cell = 20, width = 480, height = 360;
    let snake, food, dir, nextDir, score, speed, running, raf, lastTime;
    let directionLocked = false;

    function resize() {
      const maxW = Math.min(window.innerWidth - 28, 720);
      const maxH = Math.min(window.innerHeight * 0.58, 540);
      cell = Math.max(12, Math.floor(Math.min(maxW / cols, maxH / rows)));
      width = cell * cols;
      height = cell * rows;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function randomFood() {
      let p;
      do {
        p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
      } while (snake.some(s => s.x === p.x && s.y === p.y));
      return p;
    }

    function resetGame() {
      snake = [{x: 12, y: 9}, {x: 11, y: 9}, {x: 10, y: 9}];
      dir = {x: 1, y: 0};
      nextDir = {x: 1, y: 0};
      directionLocked = false;
      food = randomFood();
      score = 0;
      speed = 135;
      running = true;
      lastTime = performance.now();
      message.hidden = true;
      scoreEl.textContent = score;
      cancelAnimationFrame(raf);
      resize();
      raf = requestAnimationFrame(loop);
    }

    function setDirection(name) {
      const map = {up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0}};
      const n = map[name];
      if (!n || directionLocked || (n.x === -dir.x && n.y === -dir.y)) return;
      nextDir = n;
      directionLocked = true;
    }

    function step() {
      dir = nextDir;
      directionLocked = false;
      const head = snake[0];
      const next = {
        x: (head.x + dir.x + cols) % cols,
        y: (head.y + dir.y + rows) % rows
      };
      const willEat = next.x === food.x && next.y === food.y;
      const bodyToCheck = willEat ? snake : snake.slice(0, -1);
      if (bodyToCheck.some((s, i) => i > 0 && s.x === next.x && s.y === next.y)) {
        endGame();
        return;
      }
      snake.unshift(next);
      if (willEat) {
        score++;
        speed = Math.max(70, 135 - Math.floor(score / 3) * 5);
        scoreEl.textContent = score;
        food = randomFood();
      } else {
        snake.pop();
      }
      draw();
    }

    function endGame() {
      running = false;
      finalScore.textContent = score;
      message.hidden = false;
    }

    function loop(now) {
      if (!running) return;
      if (now - lastTime >= speed) {
        lastTime = now;
        step();
      }
      raf = requestAnimationFrame(loop);
    }

    function draw() {
      if (!ctx || !snake || !food) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--line').trim() || '#dfebe5';
      ctx.globalAlpha = .35;
      for (let x = 0; x <= cols; x++) { ctx.beginPath(); ctx.moveTo(x*cell,0); ctx.lineTo(x*cell,height); ctx.stroke(); }
      for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0,y*cell); ctx.lineTo(width,y*cell); ctx.stroke(); }
      ctx.globalAlpha = 1;

      ctx.font = Math.max(12, cell * .8) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍎', food.x*cell + cell/2, food.y*cell + cell/2 + 1);

      snake.forEach((s, i) => {
        const r = Math.max(3, cell * .16);
        const pad = i === 0 ? 1 : 2;
        ctx.fillStyle = i === 0
          ? (getComputedStyle(document.body).getPropertyValue('--emerald').trim() || '#087c62')
          : (getComputedStyle(document.body).getPropertyValue('--emerald-dark').trim() || '#055a48');
        roundRect(ctx, s.x*cell+pad, s.y*cell+pad, cell-pad*2, cell-pad*2, r);
        ctx.fill();
        if (i === 0) {
          ctx.fillStyle = '#fff';
          const ex = dir.x === 1 ? .68 : dir.x === -1 ? .32 : .5;
          const ey1 = dir.y === 1 ? .68 : dir.y === -1 ? .32 : .36;
          const ey2 = dir.y === 1 ? .68 : dir.y === -1 ? .32 : .64;
          ctx.beginPath(); ctx.arc(s.x*cell+cell*ex, s.y*cell+cell*ey1, Math.max(1.5,cell*.08),0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(s.x*cell+cell*ex, s.y*cell+cell*ey2, Math.max(1.5,cell*.08),0,Math.PI*2); ctx.fill();
        }
      });
    }

    function roundRect(c,x,y,w,h,r) {
      c.beginPath();
      c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
      c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
    }

    function keydown(e) {
      const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
      if (map[e.key]) { e.preventDefault(); setDirection(map[e.key]); }
    }
    function pointer(e) {
      e.preventDefault();
      setDirection(e.currentTarget.dataset.dir);
    }
    overlay.querySelectorAll('[data-dir]').forEach(b => {
      b.addEventListener('pointerdown', pointer, {passive:false});
    });
    document.addEventListener('keydown', keydown, {passive:false});
    overlay.querySelector('.huda-snake-close').addEventListener('click', closeSnake);
    overlay.querySelector('.huda-snake-restart').addEventListener('click', resetGame);
    window.addEventListener('resize', resize);

    function closeSnake() {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', resize);
      overlay.remove();
      open = false;
      reset();
    }

    resetGame();
  }

  activityEvents.forEach(event => {
    window.addEventListener(event, reset, {passive: event !== 'keydown'});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else reset();
  });
  reset();

  window.HudaIdleBreak = { close: closePrompt };
})();
