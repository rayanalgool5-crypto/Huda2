'use strict';

const crypto = require('crypto');
const { generateRound } = require('./guess-ayah-source');

const ROUND_MS = 20000; // مدة كل جولة (ميلي ثانية)
const MAX_PLAYERS = 12;
const ROOM_IDLE_MS = 1000 * 60 * 60 * 3; // تُحذف الغرفة بعد 3 ساعات بلا نشاط
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون أحرف/أرقام متشابهة (0/O، 1/I)

const rooms = new Map(); // code -> room

function genCode(length = 5) {
  let code;
  do {
    code = Array.from({ length }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function genToken() {
  return crypto.randomBytes(18).toString('hex');
}

function touch(room) {
  room.updatedAt = Date.now();
}

function sanitizeName(name) {
  return String(name || '').trim().slice(0, 24) || 'لاعب';
}

async function createRoom(hostName) {
  const code = genCode();
  const token = genToken();
  const room = {
    code,
    hostToken: token,
    status: 'lobby', // lobby | playing | result | finished
    players: new Map([[token, { name: sanitizeName(hostName), score: 0, joinedAt: Date.now() }]]),
    round: null, // { index, text, surahNumber, options, correctIndex, startedAt, endsAt, answers: Map<token,{optionIndex, ms}> }
    roundIndex: 0,
    excludeSurahs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  rooms.set(code, room);
  return { room, token };
}

function getRoom(code) {
  return rooms.get(String(code || '').toUpperCase().trim()) || null;
}

function joinRoom(code, name) {
  const room = getRoom(code);
  if (!room) return { error: 'room_not_found' };
  if (room.players.size >= MAX_PLAYERS) return { error: 'room_full' };
  const token = genToken();
  room.players.set(token, { name: sanitizeName(name), score: 0, joinedAt: Date.now() });
  touch(room);
  return { room, token };
}

function leaveRoom(code, token) {
  const room = getRoom(code);
  if (!room) return;
  room.players.delete(token);
  touch(room);
  if (!room.players.size) rooms.delete(room.code);
}

// إن انتهت مهلة الجولة الحالية، ننقلها تلقائياً لحالة "النتيجة" — بدون
// الاعتماد على مؤقّت خلفي (setInterval)، لأنه لن يكون موثوقاً على استضافة
// مجانية قد "تنام"، بينما هذا يعمل صحيحاً بمجرد وصول أي طلب جديد.
function syncRound(room) {
  if (room.status === 'playing' && room.round && Date.now() >= room.round.endsAt) {
    room.status = 'result';
    touch(room);
  }
}

async function startRound(code, token) {
  const room = getRoom(code);
  if (!room) return { error: 'room_not_found' };
  if (room.hostToken !== token) return { error: 'not_host' };
  if (room.players.size < 1) return { error: 'no_players' };

  const generated = await generateRound({ excludeSurahs: room.excludeSurahs.slice(-6) });
  room.excludeSurahs.push(generated.surahNumber);
  room.roundIndex += 1;
  room.round = {
    index: room.roundIndex,
    text: generated.text,
    surahNumber: generated.surahNumber,
    surahName: generated.surahName,
    options: generated.options,
    correctIndex: generated.correctIndex,
    startedAt: Date.now(),
    endsAt: Date.now() + ROUND_MS,
    answers: new Map(),
  };
  room.status = 'playing';
  touch(room);
  return { room };
}

function submitAnswer(code, token, optionIndex) {
  const room = getRoom(code);
  if (!room) return { error: 'room_not_found' };
  syncRound(room);
  if (!room.players.has(token)) return { error: 'not_in_room' };
  if (room.status !== 'playing' || !room.round) return { error: 'no_active_round' };
  if (room.round.answers.has(token)) return { error: 'already_answered' };

  const elapsedMs = Date.now() - room.round.startedAt;
  room.round.answers.set(token, { optionIndex: Number(optionIndex), elapsedMs });

  if (Number(optionIndex) === room.round.correctIndex) {
    const speedBonus = Math.max(0, Math.round(50 * (1 - elapsedMs / ROUND_MS)));
    const player = room.players.get(token);
    if (player) player.score += 100 + speedBonus;
  }

  // إن أجاب كل اللاعبين المتصلين، ننهي الجولة فوراً بدل انتظار المهلة كاملة.
  if (room.round.answers.size >= room.players.size) {
    room.status = 'result';
  }
  touch(room);
  return { room };
}

function nextRoundIsAllowed(room) {
  return room.status === 'lobby' || room.status === 'result';
}

// حالة مُصفّاة تُرسَل للعميل: لا نكشف correctIndex/surahName إلا والحالة
// "result" (بعد انتهاء الجولة)، حتى لا يرى لاعب الإجابة أثناء تفكير البقية.
function publicState(room, viewerToken) {
  syncRound(room);
  const players = [...room.players.entries()]
    .map(([token, p]) => ({ id: token.slice(0, 8), name: p.name, score: p.score, isYou: token === viewerToken }))
    .sort((a, b) => b.score - a.score);

  const revealAnswer = room.status === 'result' || room.status === 'finished';
  const round = room.round ? {
    index: room.round.index,
    text: room.round.text,
    options: room.round.options,
    endsAt: room.round.endsAt,
    answeredCount: room.round.answers.size,
    yourAnswer: room.round.answers.get(viewerToken)?.optionIndex ?? null,
    correctIndex: revealAnswer ? room.round.correctIndex : null,
    surahName: revealAnswer ? room.round.surahName : null,
  } : null;

  return {
    code: room.code,
    status: room.status,
    isHost: room.hostToken === viewerToken,
    players,
    round,
    canStartNext: nextRoundIsAllowed(room),
    roundNumber: room.roundIndex,
  };
}

function cleanup() {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.updatedAt > ROOM_IDLE_MS) rooms.delete(code);
  }
}

module.exports = { createRoom, getRoom, joinRoom, leaveRoom, startRound, submitAnswer, publicState, cleanup, ROUND_MS };
