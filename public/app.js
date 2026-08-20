const socket = io();
let myColor = null;
let currentCode = null;
const lobby = document.querySelector('#lobby');
const game = document.querySelector('#game');
const board = document.querySelector('#board');
const lobbyMessage = document.querySelector('#lobbyMessage');
const toast = document.querySelector('#toast');

function notify(text) { toast.textContent = text; toast.classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('show'), 2600); }
function enterGame(data) { myColor = data.color; currentCode = data.code; document.querySelector('#roomCode').textContent = currentCode; lobby.classList.add('hidden'); game.classList.remove('hidden'); }
function draw(state) {
  if (!currentCode) enterGame({ code: state.code, color: myColor });
  board.innerHTML = '';
  state.board.forEach((line, row) => line.forEach((value, col) => { const cell = document.createElement('button'); cell.className = `cell ${value || ''}`; cell.setAttribute('aria-label', `${row + 1}行${col + 1}列`); cell.onclick = () => socket.emit('move', { row, col }, (result) => { if (!result.ok) notify(result.message); }); board.appendChild(cell); }));
  const waiting = state.players.length < 2;
  const ended = state.ended;
  const banner = document.querySelector('#turnBanner');
  banner.textContent = state.notice || (waiting ? '等待另一位玩家加入…' : ended ? (state.winner === myColor ? '恭喜你获胜！' : '本局结束，再来一局？') : state.turn === myColor ? '轮到你了 · 请落子' : '对方回合 · 请稍候');
  banner.style.background = ended && state.winner === myColor ? '#f7eadf' : '';
  banner.style.color = ended && state.winner === myColor ? '#a85d35' : '';
  const black = state.players.find((p) => p.color === 'black');
  const white = state.players.find((p) => p.color === 'white');
  document.querySelector('#blackStatus').textContent = black ? (black.id === socket.id ? '你 · 在线' : '对手 · 在线') : '等待加入';
  document.querySelector('#whiteStatus').textContent = white ? (white.id === socket.id ? '你 · 在线' : '对手 · 在线') : '等待加入';
  document.querySelector('#blackCard').classList.toggle('active', state.turn === 'black' && !ended);
  document.querySelector('#whiteCard').classList.toggle('active', state.turn === 'white' && !ended);
}
document.querySelector('#createBtn').onclick = () => socket.emit('createRoom', (result) => { if (result.ok) { enterGame(result); notify(`房间 ${result.code} 已创建`); } });
document.querySelector('#joinBtn').onclick = () => socket.emit('joinRoom', document.querySelector('#roomInput').value, (result) => { if (result.ok) enterGame(result); else lobbyMessage.textContent = result.message; });
document.querySelector('#roomInput').oninput = (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''); };
document.querySelector('#copyBtn').onclick = async () => { await navigator.clipboard?.writeText(currentCode); notify('房间码已复制'); };
document.querySelector('#restartBtn').onclick = () => socket.emit('restart', (result) => { if (!result.ok) notify(result.message); });
document.querySelector('#leaveBtn').onclick = () => { location.reload(); };
socket.on('state', draw);
socket.on('disconnect', () => { if (!game.classList.contains('hidden')) notify('网络连接已断开，请刷新页面重试。'); });
