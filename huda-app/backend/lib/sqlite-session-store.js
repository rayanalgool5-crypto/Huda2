const session = require('express-session');
const db = require('../db');

class SQLiteSessionStore extends session.Store {
  constructor(options = {}) {
    super(options);
    this.defaultTtl = Number(options.ttl || 1000 * 60 * 60 * 24 * 30);
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
    `);
  }

  get(sid, callback) {
    try {
      const row = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (Number(row.expire) <= Date.now()) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + this.defaultTtl;
      const payload = JSON.stringify(sess);
      db.prepare(`
        INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire
      `).run(sid, payload, expire);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid, sess, callback) {
    try {
      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + this.defaultTtl;
      db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?').run(expire, sid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid, callback) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  clearExpired() {
    db.prepare('DELETE FROM sessions WHERE expire <= ?').run(Date.now());
  }
}

module.exports = SQLiteSessionStore;
