// client.js - Toàn bộ logic phía trình duyệt: kết nối Socket.io, vẽ bàn chơi,
// xử lý các nút bấm hành động, chat, âm thanh, animation, và bảng xếp hạng.

const socket = io();

let mySocketId = null;
let myName = null;
let latestState = null;
let previousState = null;
let timerInterval = null;
let dealStagger = 0;

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
  Sound.unlock(); // mở khoá AudioContext ngay từ cử chỉ đầu tiên của người dùng
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
  const prev = previousState;
  previousState = state;
  dealStagger = 0;

  el('last-message').textContent = state.lastMessage || '';

  const potEl = el('pot-amount');
  potEl.innerHTML = `<span class="poker-chip" style="width:16px;height:16px;vertical-align:-2px;margin-right:6px;"></span>Pot: ${state.pot}`;
  if (prev && state.pot > prev.pot) {
    potEl.classList.remove('pulse');
    void potEl.offsetWidth; // ép trình duyệt tính lại style để animation chạy lại được
    potEl.classList.add('pulse');
  }

  const dealJustHappened = !!prev && prev.stage !== 'preflop' && state.stage === 'preflop';

  renderCommunityCards(state.communityCards, prev ? prev.communityCards.length : 0);
  renderSeats(state, prev, dealJustHappened);
  renderMyCards(state, dealJustHappened);
  renderActionBar(state);
  renderStartButton(state);
  renderTimer(state);

  if (prev && prev.currentPlayerId !== mySocketId && state.currentPlayerId === mySocketId && state.stage !== 'waiting') {
    Sound.playTurnAlert();
  }
  if (prev && prev.stage !== 'showdown' && state.stage === 'showdown') {
    Sound.playWin();
  }
  if (prev && prev.lastMessage !== state.lastMessage) {
    const msg = state.lastMessage || '';
    if (/check/i.test(msg)) Sound.playAction();
    else if (/raise|all-in/i.test(msg)) Sound.playRaise();
  }

  if (state.stage === 'showdown' && state.showdownResult) {
    showShowdownModal(state.showdownResult);
  }
}

// Sinh độ trễ (ms) so le cho từng lá bài được chia, đồng thời phát tiếng "tách"
// tương ứng đúng lúc lá bài đó xuất hiện.
function nextDealDelay() {
  const d = dealStagger * 70;
  dealStagger += 1;
  setTimeout(() => Sound.playDeal(), d);
  return d;
}

function cardEl(card, sizeClass, animate) {
  const div = document.createElement('div');
  if (!card) {
    div.className = `card back ${sizeClass || ''}`;
  } else {
    const isRed = card.suit === '♥' || card.suit === '♦';
    div.className = `card ${isRed ? 'red' : 'black'} ${sizeClass || ''}`;
    div.textContent = `${card.rank}${card.suit}`;
  }
  if (animate) {
    div.classList.add('deal-in');
    div.style.animationDelay = `${nextDealDelay()}ms`;
  }
  return div;
}

function renderCommunityCards(cards, prevCount) {
  const wrap = el('community-cards');
  wrap.innerHTML = '';
  cards.forEach((card, i) => {
    const flip = document.createElement('div');
    flip.className = 'flip-card';
    const inner = document.createElement('div');
    inner.className = 'flip-card-inner';
    const back = document.createElement('div');
    back.className = 'flip-card-face back';
    back.appendChild(cardEl(null));
    const front = document.createElement('div');
    front.className = 'flip-card-face front';
    front.appendChild(cardEl(card));
    inner.appendChild(back);
    inner.appendChild(front);
    flip.appendChild(inner);

    if (i < prevCount) {
      flip.classList.add('flipped'); // đã lật từ trước, không cần animate lại
    } else {
      const delay = 150 + (i - prevCount) * 220;
      setTimeout(() => {
        flip.classList.add('flipped');
        Sound.playFlip();
      }, delay);
    }
    wrap.appendChild(flip);
  });
}

// Vị trí các ghế quanh bàn hình oval, xoay sao cho "tôi" luôn ở dưới cùng
const SEAT_POSITIONS = {
  2: [[50, 88], [50, 12]],
  3: [[50, 88], [14, 30], [86, 30]],
  4: [[50, 88], [10, 50], [50, 12], [90, 50]],
  5: [[50, 90], [10, 60], [26, 14], [74, 14], [90, 60]],
  6: [[50, 90], [10, 68], [18, 18], [82, 18], [90, 68], [50, 10]],
};

function spawnFlyingChip(seatEl) {
  const potEl = el('pot-amount');
  const seatRect = seatEl.getBoundingClientRect();
  const potRect = potEl.getBoundingClientRect();
  const chip = document.createElement('div');
  chip.className = 'flying-chip';
  chip.style.left = `${seatRect.left + seatRect.width / 2 - 11}px`;
  chip.style.top = `${seatRect.top + seatRect.height / 2 - 11}px`;
  document.body.appendChild(chip);
  requestAnimationFrame(() => {
    chip.style.left = `${potRect.left + potRect.width / 2 - 11}px`;
    chip.style.top = `${potRect.top + potRect.height / 2 - 11}px`;
    chip.style.transform = 'scale(0.6)';
  });
  Sound.playChip();
  setTimeout(() => chip.remove(), 650);
}

function renderSeats(state, prev, dealJustHappened) {
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
    seat.dataset.playerId = p.id;
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

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'seat-avatar-wrap';
    avatarWrap.innerHTML = avatarSvg(p.name, 40);
    seat.appendChild(avatarWrap);

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
      const chipIcon = document.createElement('span');
      chipIcon.className = 'poker-chip';
      bet.appendChild(chipIcon);
      const betText = document.createElement('span');
      betText.textContent = `${p.currentBet}`;
      bet.appendChild(betText);
      seat.appendChild(bet);
    }

    if (p.id !== mySocketId && state.stage !== 'waiting') {
      const mini = document.createElement('div');
      mini.className = 'mini-cards';
      (p.hole || []).forEach((c) => mini.appendChild(cardEl(c, 'mini', dealJustHappened)));
      seat.appendChild(mini);
    }

    wrap.appendChild(seat);

    const prevPlayer = prev && prev.players.find((pp) => pp.id === p.id);
    if (prev && prevPlayer && p.currentBet > prevPlayer.currentBet) {
      spawnFlyingChip(seat);
    }
  });
}

function renderMyCards(state, animate) {
  const wrap = el('my-cards');
  wrap.innerHTML = '';
  const me = state.players.find((p) => p.id === mySocketId);
  if (!me || !me.hole || me.hole.filter(Boolean).length === 0) return;
  me.hole.forEach((c) => wrap.appendChild(cardEl(c, null, animate)));
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
        return `<span style="color:${isRed ? '#FF5C5C' : '#f2e9d8'}">${c.rank}${c.suit}</span>`;
      }).join(' ');
      row.innerHTML = `<strong>${escapeHtml(h.name)}</strong>: ${cardsHtml} — ${escapeHtml(h.hand)}`;
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

// ---------- Chat + emoji ----------

const EMOJI_LIST = ['😂', '😮', '😎', '🔥', '👍', '👎', '💰', '🃏', '♠️', '♥️', '♦️', '♣️', '🎉', '😭', '🤔', '😤', '🙏', '💸', '🏆', '🤝'];

function initEmojiBar() {
  const bar = el('emoji-bar');
  EMOJI_LIST.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      const input = el('chat-input');
      input.value += emoji;
      input.focus();
    });
    bar.appendChild(btn);
  });
}
initEmojiBar();

socket.on('chat-message', ({ name, text }) => {
  const box = el('chat-box');
  const line = document.createElement('div');
  line.className = 'chat-line';

  const avatarWrap = document.createElement('div');
  avatarWrap.innerHTML = avatarSvg(name, 18);
  line.appendChild(avatarWrap);

  const textWrap = document.createElement('div');
  textWrap.innerHTML = `<span class="chat-name">${escapeHtml(name)}:</span> <span class="chat-text">${escapeHtml(text)}</span>`;
  line.appendChild(textWrap);

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

// ---------- Âm thanh ----------

const soundToggleBtn = el('sound-toggle-btn');
function updateSoundBtn() {
  soundToggleBtn.textContent = Sound.isMuted() ? '🔇' : '🔊';
}
updateSoundBtn();
soundToggleBtn.addEventListener('click', () => {
  Sound.setMuted(!Sound.isMuted());
  updateSoundBtn();
});

// ---------- Lịch sử ván đấu ----------

function openHistory() {
  const wrap = el('history-list');
  wrap.innerHTML = '';
  const list = (latestState && latestState.handHistory) || [];
  if (list.length === 0) {
    wrap.innerHTML = '<p class="history-empty">Chưa có ván nào kết thúc.</p>';
  }
  list.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    const time = new Date(h.at).toLocaleTimeString('vi-VN');
    const winnersText = h.winners
      .map((w) => `${escapeHtml(w.name)} +${w.amount}${w.hand ? ' (' + escapeHtml(w.hand) + ')' : ''}`)
      .join(', ');
    row.innerHTML = `
      <div class="history-head"><span>Ván ${h.handNumber}</span><span>${time}</span></div>
      <div class="history-winners">🏆 ${winnersText}</div>
      <div class="history-pot">Pot: ${h.pot}</div>
    `;
    wrap.appendChild(row);
  });
  el('history-modal').classList.remove('hidden');
}

el('history-btn').addEventListener('click', openHistory);
el('history-close-btn').addEventListener('click', () => {
  el('history-modal').classList.add('hidden');
});

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
