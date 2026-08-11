// client.js - Toàn bộ logic phía trình duyệt: kết nối Socket.io, vẽ bàn chơi,
// xử lý các nút bấm hành động, chat, và bảng xếp hạng.

const socket = io();

let mySocketId = null;
let myName = null;
let latestState = null;
let timerInterval = null;

// ---------- Các phần tử DOM hay dùng ----------
const el = (id) => document.getElementById(id);
const loginScreen = el('login-screen');
const gameScreen = el('game-screen');
const nameInput = el('name-input');
const tableInput = el('table-input');
const joinBtn = el('join-btn');
const loginError = el('login-error');

// Nhớ tên + bàn trong phiên trình duyệt này, để nếu mất kết nối (rớt mạng, đổi
// tab, server Render "ngủ" rồi thức dậy...) thì tự động vào lại đúng bàn, đúng
// tên, giữ nguyên số chip thay vì bị coi là người chơi mới.
function saveSession(name, tableId) {
  try {
    sessionStorage.setItem('poker-name', name);
    sessionStorage.setItem('poker-table', tableId);
  } catch (e) { /* trình duyệt chặn sessionStorage cũng không sao, chỉ mất tính năng tự vào lại */ }
}

function loadSession() {
  try {
    return {
      name: sessionStorage.getItem('poker-name'),
      tableId: sessionStorage.getItem('poker-table'),
    };
  } catch (e) {
    return { name: null, tableId: null };
  }
}

function doJoin(name, tableId, isAutoReconnect) {
  socket.emit('join-table', { name, tableId }, (res) => {
    if (res?.error) {
      if (isAutoReconnect) {
        // Tự động vào lại thất bại (ví dụ: tên đã bị người khác chiếm chỗ trong
        // lúc mình mất kết nối) -> quay về màn hình đăng nhập để nhập lại.
        loginScreen.classList.remove('hidden');
        gameScreen.classList.add('hidden');
        loginError.textContent = res.error;
        return;
      }
      loginError.textContent = res.error;
      return;
    }
    myName = name;
    saveSession(name, res.tableId);
    loginScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    el('table-label').textContent = `Bàn: ${res.tableId}`;
  });
}

socket.on('connect', () => {
  mySocketId = socket.id;
  // Nếu đã có tên/bàn lưu sẵn (do F5 làm mới trang, mất mạng rồi có lại, hay
  // server Render "ngủ" rồi thức dậy) -> tự động vào lại, khỏi cần nhập lại.
  const session = loadSession();
  if (session.name && session.tableId) {
    doJoin(session.name, session.tableId, true);
  }
});

// ---------- Đăng nhập vào bàn ----------

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const tableId = tableInput.value.trim() || 'ban-1';
  if (!name) {
    loginError.textContent = 'Vui lòng nhập tên của bạn.';
    return;
  }
  doJoin(name, tableId, false);
});

// ---------- Nhận trạng thái bàn chơi từ server ----------

socket.on('table-state', (state) => {
  latestState = state;
  render(state);
});

socket.on('action-error', (message) => {
  flashMessage(message);
});

function flashMessage(text) {
  const box = el('last-message');
  box.textContent = text;
  setTimeout(() => {
    if (latestState) box.textContent = latestState.lastMessage || '';
  }, 2500);
}

// ---------- Vẽ giao diện dựa trên trạng thái mới nhất ----------

function render(state) {
  el('last-message').textContent = state.lastMessage || '';
  el('pot-amount').textContent = `Pot: ${state.pot}`;
  renderCommunityCards(state.communityCards);
  renderSeats(state);
  renderMyCards(state);
  renderActionBar(state);
  renderStartButton(state);
  renderTimer(state);

  if (state.stage === 'showdown' && state.showdownResult) {
    showShowdownModal(state.showdownResult);
  }
}

function cardEl(card, sizeClass) {
  const div = document.createElement('div');
  if (!card) {
    div.className = `card back ${sizeClass || ''}`;
    return div;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  div.className = `card ${isRed ? 'red' : 'black'} ${sizeClass || ''}`;
  div.textContent = `${card.rank}${card.suit}`;
  return div;
}

function renderCommunityCards(cards) {
  const wrap = el('community-cards');
  wrap.innerHTML = '';
  cards.forEach((c) => wrap.appendChild(cardEl(c)));
}

// Vị trí các ghế quanh bàn hình oval, xoay sao cho "tôi" luôn ở dưới cùng
const SEAT_POSITIONS = {
  2: [[50, 88], [50, 12]],
  3: [[50, 88], [14, 30], [86, 30]],
  4: [[50, 88], [10, 50], [50, 12], [90, 50]],
  5: [[50, 90], [10, 60], [26, 14], [74, 14], [90, 60]],
  6: [[50, 90], [10, 68], [18, 18], [82, 18], [90, 68], [50, 10]],
};

function renderSeats(state) {
  const wrap = el('seats');
  wrap.innerHTML = '';
  const players = state.players;
  const myIndex = players.findIndex((p) => p.id === mySocketId);
  const n = players.length;
  if (n === 0) return;
  const positions = SEAT_POSITIONS[n] || SEAT_POSITIONS[6];

  players.forEach((p, i) => {
    const relativeIndex = myIndex >= 0 ? (i - myIndex + n) % n : i;
    const [x, y] = positions[relativeIndex] || positions[0];

    const seat = document.createElement('div');
    seat.className = 'seat';
    if (p.id === state.currentPlayerId) seat.classList.add('active');
    if (p.folded) seat.classList.add('folded');
    seat.style.left = `${x}%`;
    seat.style.top = `${y}%`;

    if (p.id === state.dealerPlayerId) {
      const chip = document.createElement('div');
      chip.className = 'dealer-chip';
      chip.textContent = 'D';
      seat.appendChild(chip);
    }

    const nameTag = document.createElement('div');
    nameTag.className = 'seat-name-tag';
    let suffix = '';
    if (!p.connected) suffix = ' (mất kết nối)';
    else if (p.isSittingOut) suffix = ' (chờ ván sau)';
    nameTag.textContent = p.name + suffix;
    seat.appendChild(nameTag);

    const chips = document.createElement('div');
    chips.className = 'seat-chips';
    chips.textContent = `${p.chips} chip`;
    seat.appendChild(chips);

    if (p.currentBet > 0) {
      const bet = document.createElement('div');
      bet.className = 'seat-bet';
      bet.textContent = `Cược: ${p.currentBet}`;
      seat.appendChild(bet);
    }

    if (p.id !== mySocketId && state.stage !== 'waiting') {
      const mini = document.createElement('div');
      mini.className = 'mini-cards';
      (p.hole || []).forEach((c) => mini.appendChild(cardEl(c, 'mini')));
      seat.appendChild(mini);
    }

    wrap.appendChild(seat);
  });
}

function renderMyCards(state) {
  const wrap = el('my-cards');
  wrap.innerHTML = '';
  const me = state.players.find((p) => p.id === mySocketId);
  if (!me || !me.hole || me.hole.filter(Boolean).length === 0) return;
  me.hole.forEach((c) => wrap.appendChild(cardEl(c)));
}

function renderActionBar(state) {
  const bar = el('action-bar');
  const me = state.players.find((p) => p.id === mySocketId);
  const isMyTurn = me && state.currentPlayerId === mySocketId;
  bar.classList.toggle('hidden', !isMyTurn);
  if (!isMyTurn) return;

  const toCall = state.currentBet - me.currentBet;
  el('check-btn').classList.toggle('hidden', toCall !== 0);
  el('call-btn').classList.toggle('hidden', toCall === 0);
  el('call-btn').textContent = toCall > 0 ? `Theo (${toCall})` : 'Theo';
  el('raise-input').value = state.currentBet + state.minRaise;
  el('raise-input').min = state.currentBet + state.minRaise;
}

function renderStartButton(state) {
  const btn = el('start-hand-btn');
  const canStart = state.stage === 'waiting' && state.players.length >= 2;
  btn.classList.toggle('hidden', !canStart);
}

function renderTimer(state) {
  const wrap = el('timer-bar-wrap');
  clearInterval(timerInterval);
  if (!state.turnDeadline || state.currentPlayerId !== mySocketId) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  const bar = el('timer-bar');
  const totalMs = (state.turnSeconds || 30) * 1000;
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, state.turnDeadline - Date.now());
    bar.style.width = `${(remaining / totalMs) * 100}%`;
    if (remaining <= 0) clearInterval(timerInterval);
  }, 200);
}

// ---------- Nút hành động ----------

el('start-hand-btn').addEventListener('click', () => socket.emit('start-hand'));
el('fold-btn').addEventListener('click', () => socket.emit('player-action', { action: 'fold' }));
el('check-btn').addEventListener('click', () => socket.emit('player-action', { action: 'check' }));
el('call-btn').addEventListener('click', () => socket.emit('player-action', { action: 'call' }));
el('allin-btn').addEventListener('click', () => socket.emit('player-action', { action: 'allin' }));
el('raise-btn').addEventListener('click', () => {
  const amount = Number(el('raise-input').value);
  socket.emit('player-action', { action: 'raise', amount });
});

// ---------- Kết quả ván bài (showdown) ----------

let lastShownHandNumber = null;

function showShowdownModal(result) {
  const key = JSON.stringify(result);
  if (lastShownHandNumber === key) return;
  lastShownHandNumber = key;

  const modal = el('showdown-modal');
  const handsWrap = el('showdown-hands');
  const winnersWrap = el('showdown-winners');
  handsWrap.innerHTML = '';
  winnersWrap.innerHTML = '';

  if (result.hands) {
    result.hands.forEach((h) => {
      const row = document.createElement('div');
      row.className = 'showdown-hand-row';
      const cardsHtml = h.cards.map((c) => {
        const isRed = c.suit === '♥' || c.suit === '♦';
        return `<span style="color:${isRed ? '#FF5C5C' : '#2A2A2E'}">${c.rank}${c.suit}</span>`;
      }).join(' ');
      row.innerHTML = `<strong>${h.name}</strong>: ${cardsHtml} — ${h.hand}`;
      handsWrap.appendChild(row);
    });
  }

  result.winners.forEach((w) => {
    const p = document.createElement('p');
    p.textContent = `🏆 ${w.name} thắng ${w.amount} chip${w.hand ? ' với ' + w.hand : ''}`;
    winnersWrap.appendChild(p);
  });

  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('hidden'), 4800);
}

// ---------- Chat ----------

socket.on('chat-message', ({ name, text }) => {
  const box = el('chat-box');
  const line = document.createElement('div');
  line.className = 'chat-line';
  line.innerHTML = `<span class="chat-name">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

el('chat-send-btn').addEventListener('click', sendChat);
el('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const input = el('chat-input');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat-message', text);
  input.value = '';
}

// ---------- Bảng xếp hạng ----------

function openLeaderboard() {
  socket.emit('get-leaderboard', (list) => {
    const wrap = el('leaderboard-list');
    wrap.innerHTML = '';
    if (list.length === 0) {
      wrap.innerHTML = '<p>Chưa có ai chơi ván nào cả.</p>';
    }
    list.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      const sign = p.netChips >= 0 ? '+' : '';
      row.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="${p.netChips >= 0 ? 'positive' : 'negative'}">${sign}${p.netChips} chip</span>`;
      wrap.appendChild(row);
    });
    el('leaderboard-modal').classList.remove('hidden');
  });
}

el('leaderboard-open-btn').addEventListener('click', openLeaderboard);
el('leaderboard-btn').addEventListener('click', openLeaderboard);
el('leaderboard-close-btn').addEventListener('click', () => {
  el('leaderboard-modal').classList.add('hidden');
});
