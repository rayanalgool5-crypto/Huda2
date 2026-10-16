const express = require('express');
const db = require('../db');
const requireAuth = require('../lib/require-auth');
const { sendPushNotification } = require('../lib/push-service');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.name, ux.xp, COALESCE(ux.games_played,0) AS games_played, COALESCE(ux.best_snake_score,0) AS best_snake_score
    FROM users u JOIN user_xp ux ON ux.user_id = u.id
    WHERE ux.xp > 0
    ORDER BY ux.xp DESC, best_snake_score DESC, u.id ASC LIMIT 10`).all();
  res.json({ leaderboard: rows.map((r, i) => ({ rank: i + 1, name: r.name, xp: r.xp, gamesPlayed: r.games_played, bestSnakeScore: r.best_snake_score })),
    me: rows.findIndex(r => r.id === req.session.userId) + 1 || null });
});

router.post('/snake-score', async (req, res) => {
  const score = Math.max(0, Math.min(5000, Math.floor(Number(req.body?.score) || 0)));
  const xp = score * 10;
  const userId = req.session.userId;
  db.prepare(`INSERT INTO user_xp (user_id, xp, games_played, best_snake_score, updated_at)
    VALUES (?, ?, 1, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET xp = user_xp.xp + excluded.xp,
      games_played = user_xp.games_played + 1,
      best_snake_score = MAX(user_xp.best_snake_score, excluded.best_snake_score),
      updated_at = datetime('now')`).run(userId, xp, score);

  const rankRow = db.prepare(`SELECT COUNT(*) + 1 AS rank FROM user_xp WHERE xp > (SELECT xp FROM user_xp WHERE user_id = ?)`).get(userId);
  try {
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
    await Promise.all(subs.map(s => sendPushNotification(s, { title: '🎉 أحسنت في الحيّة!', body: `سجلت ${score} نقطة وحصلت على +${xp} XP. ترتيبك الحالي #${rankRow.rank}.`, url: '/pages/leaderboard.html', tag: `xp-${userId}` })));
  } catch (e) { console.warn('XP push failed:', e.message); }
  res.json({ score, xpEarned: xp, rank: Number(rankRow.rank) });
});
module.exports = router;
