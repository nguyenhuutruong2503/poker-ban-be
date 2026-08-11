// Table.js - "Bộ não" của một bàn chơi poker.
// Quản lý người chơi, lượt chơi, tiền cược, chia bài, và tính thắng thua.

const Deck = require('./Deck');
const { evaluateBestHand, compareHands } = require('./HandEvaluator');

class Table {
  constructor(id, options = {}) {
    this.id = id;
    this.maxPlayers = options.maxPlayers || 6;
    this.smallBlind = options.smallBlind || 10;
    this.bigBlind = options.bigBlind || 20;
    this.startingChips = options.startingChips || 1000;
    this.turnSeconds = options.turnSeconds || 30;

    this.players = []; // xem addPlayer() để biết cấu trúc 1 người chơi
    this.dealerIndex = -1;
    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.stage = 'waiting';
    this.currentPlayerIndex = -1;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.handNumber = 0;
    this.lastMessage = '';
    this.showdownResult = null; // dùng để hiển thị kết quả ở cuối ván
    this.turnTimer = null;
    this.turnDeadline = null;
    this.pendingRemovals = new Map(); // tên (viết thường) -> timer dọn dẹp người mất kết nối
  }

  // ---------- Quản lý người chơi ----------

  addPlayer(socketId, name) {
    // Nếu người này đã ngồi ở bàn trước đó nhưng bị mất kết nối (ví dụ: mất mạng,
    // đổi tab, server Render "ngủ" rồi thức dậy) -> cho họ ngồi lại đúng chỗ cũ,
    // giữ nguyên số chip, thay vì tạo một người chơi mới từ đầu.
    const disconnectedMatch = this.players.find(
      (p) => !p.connected && p.name.toLowerCase() === name.toLowerCase()
    );
    if (disconnectedMatch) {
      this.cancelPendingRemoval(disconnectedMatch.name);
      disconnectedMatch.id = socketId;
      disconnectedMatch.connected = true;
      return { player: disconnectedMatch, reconnected: true };
    }

    if (this.players.length >= this.maxPlayers) return { error: 'Bàn đã đầy.' };
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.connected)) {
      return { error: 'Tên này đã có người dùng ở bàn.' };
    }
    const player = {
      id: socketId,
      name,
      chips: this.startingChips,
      hole: [],
      folded: false,
      allIn: false,
      currentBet: 0,
      totalBetThisHand: 0,
      hasActed: false,
      connected: true,
      isSittingOut: this.stage !== 'waiting', // vào giữa ván thì ngồi ngoài chờ ván sau
    };
    this.players.push(player);
    return { player };
  }

  removePlayer(socketId) {
    const player = this.players.find((p) => p.id === socketId);
    if (!player) return;

    player.connected = false;
    if (this.stage !== 'waiting' && !player.folded && !player.allIn) {
      // Đang giữa ván: xử lý như fold để không chặn bàn chơi
      player.folded = true;
      this.lastMessage = `${player.name} đã mất kết nối và bị úp bài.`;
      if (this.players[this.currentPlayerIndex]?.id === socketId) {
        this.advanceTurn();
      }
    }
    // Không xóa khỏi danh sách ngay, để họ có thể kết nối lại và giữ chip.
    // Dọn dẹp hẳn sau một khoảng thời gian nếu không quay lại (xem scheduleRemoval).
    this.scheduleRemoval(player.name);
  }

  // Xóa hẳn người chơi khỏi bàn nếu họ mất kết nối quá lâu (không quay lại),
  // để giải phóng chỗ ngồi cho người khác. Nếu họ kết nối lại trước hạn, hủy lịch xóa.
  scheduleRemoval(name) {
    this.cancelPendingRemoval(name);
    const timer = setTimeout(() => {
      this.players = this.players.filter(
        (p) => p.connected || p.name.toLowerCase() !== name.toLowerCase()
      );
      this.pendingRemovals.delete(name.toLowerCase());
      if (this.onCleanup) this.onCleanup();
    }, 2 * 60 * 1000); // 2 phút
    this.pendingRemovals.set(name.toLowerCase(), timer);
  }

  cancelPendingRemoval(name) {
    const timer = this.pendingRemovals.get(name.toLowerCase());
    if (timer) {
      clearTimeout(timer);
      this.pendingRemovals.delete(name.toLowerCase());
    }
  }

  activePlayers() {
    return this.players.filter((p) => !p.isSittingOut && p.connected);
  }

  // ---------- Bắt đầu một ván bài mới ----------

  canStartHand() {
    return this.stage === 'waiting' && this.activePlayers().length >= 2;
  }

  startHand() {
    this.clearTurnTimer();
    this.handNumber += 1;
    this.deck.reset();
    this.communityCards = [];
    this.pot = 0;
    this.showdownResult = null;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

    // Người chơi hết chip thì cho ngồi ngoài
    this.players.forEach((p) => {
      if (p.chips <= 0) p.isSittingOut = true;
    });

    const active = this.activePlayers();
    active.forEach((p) => {
      p.hole = [];
      p.folded = false;
      p.allIn = false;
      p.currentBet = 0;
      p.totalBetThisHand = 0;
      p.hasActed = false;
    });

    // Xoay nút dealer sang người kế tiếp còn active
    this.dealerIndex = this.nextActiveIndex(this.dealerIndex);

    // Chia 2 lá bài úp cho mỗi người
    for (let round = 0; round < 2; round++) {
      let idx = this.dealerIndex;
      for (let i = 0; i < active.length; i++) {
        idx = this.nextActiveIndex(idx);
        const player = this.players[idx];
        player.hole.push(this.deck.draw());
      }
    }

    // Đặt mù nhỏ / mù lớn
    const sbIndex = active.length === 2
      ? this.dealerIndex // heads-up: dealer là mù nhỏ
      : this.nextActiveIndex(this.dealerIndex);
    const bbIndex = this.nextActiveIndex(sbIndex);

    this.postBet(this.players[sbIndex], this.smallBlind);
    this.postBet(this.players[bbIndex], this.bigBlind);
    this.currentBet = this.bigBlind;

    this.stage = 'preflop';
    // Vào bàn từ UTG (người sau mù lớn), heads-up thì dealer/mù nhỏ đi trước.
    // Dùng firstActionableFrom để phòng trường hợp người đó vừa hết chip vì đặt mù
    // (all-in ngay từ mù) -> khi đó phải nhường lượt cho người kế tiếp còn hành động được.
    const preflopStart = active.length === 2 ? sbIndex : this.nextActiveIndex(bbIndex);
    this.currentPlayerIndex = this.firstActionableFrom(preflopStart);

    if (this.currentPlayerIndex === -1) {
      // Không ai còn có thể hành động (mọi người đã all-in ngay từ tiền mù) ->
      // lật bài thẳng tới showdown, không cần chờ ai bấm gì cả.
      this.lastMessage = `Ván ${this.handNumber} bắt đầu — mọi người All-in từ mù, lật bài luôn.`;
      this.advanceStage();
      return;
    }

    this.lastMessage = `Ván ${this.handNumber} bắt đầu.`;
    this.startTurnTimer();
  }

  postBet(player, amount) {
    const actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.currentBet += actual;
    player.totalBetThisHand += actual;
    this.pot += actual;
    if (player.chips === 0) player.allIn = true;
  }

  // Tìm chỉ số người chơi active tiếp theo (còn ngồi bàn), tính vòng tròn
  nextActiveIndex(fromIndex) {
    const n = this.players.length;
    let idx = fromIndex;
    for (let i = 0; i < n; i++) {
      idx = (idx + 1) % n;
      const p = this.players[idx];
      if (!p.isSittingOut && p.connected) return idx;
    }
    return fromIndex;
  }

  // Người active tiếp theo còn có thể hành động (chưa fold, chưa all-in, còn chip, còn kết nối)
  nextActionableIndex(fromIndex) {
    const n = this.players.length;
    let idx = fromIndex;
    for (let i = 0; i < n; i++) {
      idx = (idx + 1) % n;
      const p = this.players[idx];
      if (!p.isSittingOut && !p.folded && !p.allIn && p.connected) return idx;
    }
    return -1;
  }

  // Giống nextActionableIndex, nhưng TÍNH CẢ fromIndex (dùng để tìm người hành động
  // đầu tiên sau khi đặt mù, phòng khi người đó vừa all-in ngay từ tiền mù)
  firstActionableFrom(fromIndex) {
    if (fromIndex < 0) return -1;
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const idx = (fromIndex + i) % n;
      const p = this.players[idx];
      if (!p.isSittingOut && !p.folded && !p.allIn && p.connected) return idx;
    }
    return -1;
  }

  // ---------- Xử lý hành động của người chơi ----------

  handleAction(socketId, action, amount) {
    const idx = this.players.findIndex((p) => p.id === socketId);
    if (idx === -1 || idx !== this.currentPlayerIndex) {
      return { error: 'Chưa tới lượt của bạn.' };
    }
    const player = this.players[idx];
    this.clearTurnTimer();

    switch (action) {
      case 'fold': {
        player.folded = true;
        player.hasActed = true;
        this.lastMessage = `${player.name} úp bài.`;
        break;
      }
      case 'check': {
        if (player.currentBet !== this.currentBet) {
          this.startTurnTimer();
          return { error: 'Bạn không thể check, cần theo hoặc úp bài.' };
        }
        player.hasActed = true;
        this.lastMessage = `${player.name} check.`;
        break;
      }
      case 'call': {
        const toCall = this.currentBet - player.currentBet;
        const actuallyPaid = Math.min(toCall, player.chips); // có thể ít hơn nếu hết chip giữa chừng
        this.postBet(player, toCall);
        player.hasActed = true;
        this.lastMessage = actuallyPaid < toCall
          ? `${player.name} theo ${actuallyPaid} (All-in, không đủ theo hết).`
          : `${player.name} theo ${actuallyPaid}.`;
        break;
      }
      case 'raise': {
        const target = Math.floor(Number(amount));
        const minTarget = this.currentBet + this.minRaise;
        if (!target || target < minTarget) {
          this.startTurnTimer();
          return { error: `Mức raise tối thiểu là ${minTarget}.` };
        }
        const toPut = target - player.currentBet;
        if (toPut > player.chips) {
          this.startTurnTimer();
          return { error: 'Bạn không đủ chip để raise mức này, hãy dùng All-in.' };
        }
        this.minRaise = target - this.currentBet;
        this.postBet(player, toPut);
        this.currentBet = target;
        player.hasActed = true;
        // Người khác cần hành động lại vì có raise mới
        this.players.forEach((p) => {
          if (p.id !== player.id && !p.folded && !p.allIn) p.hasActed = false;
        });
        this.lastMessage = `${player.name} raise lên ${target}.`;
        break;
      }
      case 'allin': {
        const toPut = player.chips;
        const newTotal = player.currentBet + toPut;
        this.postBet(player, toPut);
        if (newTotal > this.currentBet) {
          const raiseAmount = newTotal - this.currentBet;
          if (raiseAmount >= this.minRaise) this.minRaise = raiseAmount;
          this.currentBet = newTotal;
          this.players.forEach((p) => {
            if (p.id !== player.id && !p.folded && !p.allIn) p.hasActed = false;
          });
        }
        player.hasActed = true;
        this.lastMessage = `${player.name} All-in!`;
        break;
      }
      default:
        this.startTurnTimer();
        return { error: 'Hành động không hợp lệ.' };
    }

    this.afterAction();
    return { ok: true };
  }

  afterAction() {
    const remaining = this.players.filter((p) => !p.isSittingOut && !p.folded);

    // Nếu chỉ còn 1 người chưa fold, người đó thắng luôn không cần lật bài
    if (remaining.length === 1) {
      this.awardPotToSingleWinner(remaining[0]);
      return;
    }

    if (this.isBettingRoundComplete()) {
      this.advanceStage();
    } else {
      this.currentPlayerIndex = this.nextActionableIndex(this.currentPlayerIndex);
      this.startTurnTimer();
    }
  }

  isBettingRoundComplete() {
    const contenders = this.players.filter((p) => !p.isSittingOut && !p.folded);
    const stillCanAct = contenders.filter((p) => !p.allIn);
    if (stillCanAct.length === 0) return true; // ai cũng all-in rồi
    return stillCanAct.every((p) => p.hasActed && p.currentBet === this.currentBet);
  }

  advanceTurn() {
    if (this.isBettingRoundComplete()) {
      this.advanceStage();
    } else {
      this.currentPlayerIndex = this.nextActionableIndex(this.currentPlayerIndex);
      this.startTurnTimer();
    }
  }

  // ---------- Chuyển giai đoạn: preflop -> flop -> turn -> river -> showdown ----------

  advanceStage() {
    this.clearTurnTimer();
    this.players.forEach((p) => {
      p.currentBet = 0;
      p.hasActed = false;
    });
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

    const contenders = this.players.filter((p) => !p.isSittingOut && !p.folded);
    const canStillBet = contenders.filter((p) => !p.allIn).length >= 2;

    if (this.stage === 'preflop') {
      this.deck.draw(); // đốt 1 lá (burn card) theo luật chuẩn
      this.communityCards.push(this.deck.draw(), this.deck.draw(), this.deck.draw());
      this.stage = 'flop';
    } else if (this.stage === 'flop') {
      this.deck.draw();
      this.communityCards.push(this.deck.draw());
      this.stage = 'turn';
    } else if (this.stage === 'turn') {
      this.deck.draw();
      this.communityCards.push(this.deck.draw());
      this.stage = 'river';
    } else if (this.stage === 'river') {
      this.showdown();
      return;
    }

    if (!canStillBet) {
      // Mọi người đã all-in hết, không cần bốc lượt, cứ lật bài dần tới showdown
      this.lastMessage = `Lật bài: ${this.stage}.`;
      setTimeout(() => this.advanceStage(), 1200);
      return;
    }

    this.currentPlayerIndex = this.nextActionableIndex(this.dealerIndex);
    this.lastMessage = `Vòng cược mới: ${this.stage}.`;
    this.startTurnTimer();
  }

  // ---------- Kết thúc ván: chia pot ----------

  awardPotToSingleWinner(winner) {
    winner.chips += this.pot;
    this.showdownResult = {
      winners: [{ name: winner.name, amount: this.pot, hand: null }],
      revealAll: false,
    };
    this.lastMessage = `${winner.name} thắng ${this.pot} chip (mọi người khác đã úp bài).`;
    this.pot = 0;
    this.stage = 'showdown';
    this.clearTurnTimer();
    setTimeout(() => this.resetForNextHand(), 3500);
  }

  // Tính các pot (pot chính + pot phụ) dựa trên mức cược của từng người trong cả ván
  calculatePots() {
    const contributors = this.players
      .filter((p) => p.totalBetThisHand > 0)
      .map((p) => ({ player: p, amount: p.totalBetThisHand }));

    const levels = [...new Set(contributors.map((c) => c.amount))].sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;

    for (const level of levels) {
      const payers = contributors.filter((c) => c.amount >= level);
      const layerAmount = (level - prevLevel) * payers.length;
      const eligible = payers
        .filter((c) => !c.player.folded)
        .map((c) => c.player);
      if (layerAmount > 0) pots.push({ amount: layerAmount, eligible });
      prevLevel = level;
    }
    return pots;
  }

  showdown() {
    this.clearTurnTimer();
    const contenders = this.players.filter((p) => !p.isSittingOut && !p.folded);
    const handResults = {};
    contenders.forEach((p) => {
      handResults[p.id] = evaluateBestHand([...p.hole, ...this.communityCards]);
    });

    const pots = this.calculatePots();
    const winnersSummary = {};

    for (const pot of pots) {
      if (pot.eligible.length === 0) continue;
      let best = null;
      let winners = [];
      for (const p of pot.eligible) {
        const hand = handResults[p.id];
        if (!best || compareHands(hand, best) < 0) {
          best = hand;
          winners = [p];
        } else if (compareHands(hand, best) === 0) {
          winners.push(p);
        }
      }
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      winners.forEach((w) => {
        let amount = share;
        if (remainder > 0) {
          amount += 1;
          remainder -= 1;
        }
        w.chips += amount;
        winnersSummary[w.id] = winnersSummary[w.id] || { name: w.name, amount: 0, hand: handResults[w.id].name };
        winnersSummary[w.id].amount += amount;
      });
    }

    this.showdownResult = {
      winners: Object.values(winnersSummary),
      revealAll: true,
      hands: contenders.map((p) => ({ name: p.name, cards: p.hole, hand: handResults[p.id].name })),
    };
    this.lastMessage = 'Ngửa bài!';
    this.pot = 0;
    this.stage = 'showdown';
    setTimeout(() => this.resetForNextHand(), 5000);
  }

  resetForNextHand() {
    // Ghi lại người đang giữ nút dealer TRƯỚC khi mảng người chơi có thể bị lọc lại,
    // để tránh dealerIndex (một con số vị trí) trỏ nhầm sang người khác sau khi lọc.
    const dealerPlayer = this.players[this.dealerIndex] || null;

    this.stage = 'waiting';
    this.communityCards = [];
    this.showdownResult = null;
    this.players = this.players.filter((p) => p.connected); // dọn người mất kết nối quá lâu

    this.dealerIndex = dealerPlayer
      ? this.players.findIndex((p) => p.id === dealerPlayer.id)
      : -1;

    this.players.forEach((p) => {
      p.folded = false;
      p.hole = [];
      // Quan trọng: bất kỳ ai còn chip đều được vào chơi ván tiếp theo — kể cả người
      // vừa tham gia giữa ván trước (đã bị "isSittingOut = true" tạm thời lúc vào bàn).
      // Chỉ ai hết sạch chip mới tiếp tục ngồi ngoài.
      p.isSittingOut = p.chips <= 0;
    });
  }

  // ---------- Bộ đếm giờ mỗi lượt ----------

  startTurnTimer() {
    this.clearTurnTimer();
    this.turnDeadline = Date.now() + this.turnSeconds * 1000;
    this.turnTimer = setTimeout(() => {
      const player = this.players[this.currentPlayerIndex];
      if (!player) return;
      // Hết giờ: tự check nếu được, không thì tự động úp bài
      if (player.currentBet === this.currentBet) {
        this.handleAction(player.id, 'check');
      } else {
        this.handleAction(player.id, 'fold');
      }
      if (this.onTimeout) this.onTimeout();
    }, this.turnSeconds * 1000);
  }

  clearTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadline = null;
  }

  // ---------- Trạng thái công khai gửi cho client ----------
  // Mỗi người chơi chỉ thấy bài của chính mình; bài người khác bị ẩn trừ lúc showdown.

  getPublicState(forSocketId) {
    return {
      id: this.id,
      stage: this.stage,
      pot: this.pot,
      communityCards: this.communityCards,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      currentPlayerId: this.stage !== 'waiting' && this.stage !== 'showdown'
        ? this.players[this.currentPlayerIndex]?.id
        : null,
      dealerPlayerId: this.dealerIndex >= 0 ? this.players[this.dealerIndex]?.id : null,
      turnDeadline: this.turnDeadline,
      turnSeconds: this.turnSeconds,
      lastMessage: this.lastMessage,
      showdownResult: this.showdownResult,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet,
        folded: p.folded,
        allIn: p.allIn,
        connected: p.connected,
        isSittingOut: p.isSittingOut,
        hole: p.id === forSocketId || (this.stage === 'showdown' && this.showdownResult?.revealAll && !p.folded)
          ? p.hole
          : p.hole.map(() => null), // ẩn bài người khác
      })),
    };
  }
}

module.exports = Table;
