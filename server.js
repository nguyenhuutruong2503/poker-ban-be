// server.js - Máy chủ chính: phục vụ giao diện web + xử lý kết nối real-time
// bằng Socket.io. Đây là trung tâm điều phối mọi bàn chơi poker.

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Table = require('./game/Table');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Danh sách các bàn chơi đang mở, lưu trong bộ nhớ ----------
// Ghi chú: đây là lưu trong RAM, nếu server restart thì các bàn đang chơi sẽ mất.
// Bảng xếp hạng (leaderboard) thì được lưu ra file riêng để không bị mất.
const tables = new Map(); // tableId -> Table instance

function getOrCreateTable(tableId) {
  if (!tables.has(tableId)) {
    const table = new Table(tableId);
    // Khi một người mất kết nối quá lâu bị dọn khỏi bàn, báo lại cho những
    // người còn lại để chỗ ngồi trống được cập nhật trên giao diện. Nếu bàn
    // trống hẳn (không còn ai, kể cả người chờ kết nối lại), xóa bàn khỏi bộ nhớ.
    table.onCleanup = () => {
      broadcastTableState(table);
      if (table.players.length === 0) tables.delete(tableId);
    };
    tables.set(tableId, table);
  }
  return tables.get(tableId);
}

// ---------- Bảng xếp hạng bạn bè, lưu ra file JSON đơn giản ----------
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

function loadLeaderboard() {
  try {
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveLeaderboard(data) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
}

function recordLeaderboardDelta(name, deltaChips) {
  const board = loadLeaderboard();
  if (!board[name]) board[name] = { name, netChips: 0, handsPlayed: 0 };
  board[name].netChips += deltaChips;
  board[name].handsPlayed += 1;
  saveLeaderboard(board);
}

// Theo dõi số chip của mỗi người trước mỗi ván để tính lời/lỗ sau ván đó
const chipSnapshots = new Map(); // socketId -> chips trước ván

function broadcastTableState(table) {
  table.players.forEach((p) => {
    io.to(p.id).emit('table-state', table.getPublicState(p.id));
  });
}

// ---------- Socket.io: xử lý sự kiện realtime ----------

io.on('connection', (socket) => {
  let currentTableId = null;

  socket.on('join-table', ({ name, tableId }, callback) => {
    const cleanName = String(name || '').trim().slice(0, 20);
    const cleanTableId = String(tableId || 'ban-1').trim().slice(0, 30) || 'ban-1';
    if (!cleanName) {
      return callback?.({ error: 'Vui lòng nhập tên.' });
    }
    const table = getOrCreateTable(cleanTableId);
    const result = table.addPlayer(socket.id, cleanName);
    if (result.error) {
      return callback?.({ error: result.error });
    }
    currentTableId = cleanTableId;
    socket.join(cleanTableId);
    socket.data.playerName = cleanName;
    socket.data.tableId = cleanTableId;

    callback?.({ ok: true, tableId: cleanTableId });
    broadcastTableState(table);
  });

  socket.on('start-hand', () => {
    const table = tables.get(currentTableId);
    if (!table || !table.canStartHand()) return;
    const isSeated = table.players.some((p) => p.id === socket.id);
    if (!isSeated) return; // chỉ người đang ngồi ở bàn mới được bấm bắt đầu ván

    // Chụp lại số chip hiện tại của mỗi người để tính lời/lỗ sau ván
    table.activePlayers().forEach((p) => chipSnapshots.set(p.id, p.chips));

    // Khi bộ đếm giờ tự động fold/check giúp người chơi, cần báo lại cho mọi người
    table.onTimeout = () => broadcastTableState(table);

    table.startHand();
    broadcastTableState(table);
  });

  socket.on('player-action', ({ action, amount }) => {
    const table = tables.get(currentTableId);
    if (!table) return;
    const result = table.handleAction(socket.id, action, amount);
    if (result?.error) {
      socket.emit('action-error', result.error);
      return;
    }
    broadcastTableState(table);

    // Nếu ván vừa kết thúc (showdown), ghi nhận lời/lỗ vào bảng xếp hạng
    if (table.stage === 'showdown') {
      table.players.forEach((p) => {
        const before = chipSnapshots.get(p.id);
        if (before !== undefined) {
          recordLeaderboardDelta(p.name, p.chips - before);
        }
      });
      setTimeout(() => broadcastTableState(table), 5100);
    }
  });

  socket.on('get-leaderboard', (callback) => {
    const board = loadLeaderboard();
    const list = Object.values(board).sort((a, b) => b.netChips - a.netChips);
    callback?.(list);
  });

  socket.on('chat-message', (text) => {
    const table = tables.get(currentTableId);
    if (!table) return;
    const clean = String(text || '').slice(0, 200);
    if (!clean.trim()) return;
    io.to(currentTableId).emit('chat-message', {
      name: socket.data.playerName,
      text: clean,
      at: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const table = tables.get(currentTableId);
    if (!table) return;
    table.removePlayer(socket.id);
    broadcastTableState(table);
    // Lưu ý: bàn chỉ thực sự bị xóa khỏi bộ nhớ sau 2 phút không ai quay lại
    // (xem table.onCleanup) — để dành thời gian cho việc kết nối lại giữ chip.
  });
});

server.listen(PORT, () => {
  console.log(`Poker server đang chạy tại http://localhost:${PORT}`);
});
