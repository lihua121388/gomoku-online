const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const BOARD_SIZE = 15;
const rooms = new Map();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  while (rooms.has(code));
  return code;
}

function emptyBoard() { return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)); }
function newRoom(code) { return { code, board: emptyBoard(), players: new Map(), history: [], turn: 'black', winner: null, ended: false, notice: '', undoRequest: null, scores: { black: 0, white: 0 } }; }
function state(room) {
  return { code: room.code, board: room.board, turn: room.turn, winner: room.winner, ended: room.ended, notice: room.notice, undoRequest: room.undoRequest ? { from: room.undoRequest.from, color: room.undoRequest.color } : null, scores: room.scores, players: [...room.players].map(([id, color]) => ({ id, color, online: io.sockets.sockets.has(id) })) };
}
function broadcast(room) { io.to(room.code).emit('state', state(room)); }
function validPosition(row, col) { return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE; }
function hasFive(board, row, col, color) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  return directions.some(([dr, dc]) => {
    let count = 1;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (validPosition(r, c) && board[r][c] === color) { count++; r += dr * sign; c += dc * sign; }
    }
    return count >= 5;
  });
}

io.on('connection', (socket) => {
  socket.on('createRoom', (callback) => {
    const code = makeCode();
    const room = newRoom(code);
    room.players.set(socket.id, 'black');
    rooms.set(code, room);
    socket.join(code);
    callback({ ok: true, code, color: 'black' });
    broadcast(room);
  });

  socket.on('joinRoom', (rawCode, callback) => {
    const code = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return callback({ ok: false, message: '找不到这个房间，请检查房间码。' });
    if (room.players.size >= 2 && !room.players.has(socket.id)) return callback({ ok: false, message: '房间已满，最多两名玩家。' });
    if (!room.players.has(socket.id)) room.players.set(socket.id, 'white');
    room.notice = '';
    socket.join(code);
    callback({ ok: true, code, color: room.players.get(socket.id) });
    broadcast(room);
  });

  socket.on('move', ({ row, col } = {}, callback = () => {}) => {
    const code = [...socket.rooms].find((id) => id !== socket.id);
    const room = code && rooms.get(code);
    const color = room && room.players.get(socket.id);
    if (!room || !color) return callback({ ok: false, message: '你还没有加入房间。' });
    if (room.ended) return callback({ ok: false, message: '本局已经结束，请重新开局。' });
    if (room.players.size < 2) return callback({ ok: false, message: '等待另一位玩家加入。' });
    if (room.turn !== color) return callback({ ok: false, message: '还没轮到你落子。' });
    if (!validPosition(row, col) || room.board[row][col]) return callback({ ok: false, message: '这个位置不能落子。' });
    room.board[row][col] = color;
    room.history.push({ row, col, color });
    if (hasFive(room.board, row, col, color)) { room.winner = color; room.ended = true; room.scores[color] += 1; }
    else room.turn = color === 'black' ? 'white' : 'black';
    callback({ ok: true });
    broadcast(room);
  });

  socket.on('requestUndo', (callback = () => {}) => {
    const code = [...socket.rooms].find((id) => id !== socket.id);
    const room = code && rooms.get(code);
    const color = room && room.players.get(socket.id);
    if (!room || !color) return callback({ ok: false, message: '你还没有加入房间。' });
    if (!room.history.length) return callback({ ok: false, message: '还没有可以悔的棋。' });
    if (room.history[room.history.length - 1].color !== color) return callback({ ok: false, message: '只能申请悔掉自己刚落下的棋。' });
    if (room.undoRequest) return callback({ ok: false, message: '已经有一个悔棋申请，请等待对方回应。' });
    room.undoRequest = { from: socket.id, color };
    room.notice = '';
    callback({ ok: true });
    broadcast(room);
  });

  socket.on('respondUndo', (accept, callback = () => {}) => {
    const code = [...socket.rooms].find((id) => id !== socket.id);
    const room = code && rooms.get(code);
    if (!room || !room.undoRequest) return callback({ ok: false, message: '没有待处理的悔棋申请。' });
    if (room.undoRequest.from === socket.id) return callback({ ok: false, message: '不能回应自己的悔棋申请。' });
    if (accept) {
      const move = room.history.pop();
      if (room.winner) room.scores[room.winner] = Math.max(0, room.scores[room.winner] - 1);
      room.board[move.row][move.col] = null;
      room.turn = move.color;
      room.winner = null;
      room.ended = false;
      room.notice = '悔棋成功，轮到刚才落子的一方。';
    } else room.notice = '对方拒绝了悔棋申请。';
    room.undoRequest = null;
    callback({ ok: true });
    broadcast(room);
  });

  socket.on('restart', (callback = () => {}) => {
    const code = [...socket.rooms].find((id) => id !== socket.id);
    const room = code && rooms.get(code);
    if (!room || !room.players.has(socket.id)) return callback({ ok: false, message: '你还没有加入房间。' });
    if (room.players.size < 2) return callback({ ok: false, message: '等待另一位玩家加入后再开局。' });
    room.board = emptyBoard(); room.history = []; room.turn = 'black'; room.winner = null; room.ended = false; room.undoRequest = null; room.notice = '';
    broadcast(room); callback({ ok: true });
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      if (!room.players.has(socket.id)) continue;
      room.players.delete(socket.id);
      if (room.players.size === 0) { rooms.delete(code); continue; }
      room.notice = '对方已断开连接，等待其重新加入。';
      broadcast(room);
    }
  });
});

server.listen(PORT, () => console.log(`Gomoku server listening on http://localhost:${PORT}`));
