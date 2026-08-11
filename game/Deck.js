// Deck.js - Bộ bài 52 lá tiêu chuẩn, dùng cho mỗi ván bài mới

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  // Tạo lại bộ bài đầy đủ 52 lá và xáo bài
  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push({ rank, suit });
      }
    }
    this.shuffle();
  }

  // Thuật toán Fisher-Yates để xáo bài ngẫu nhiên
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  // Rút một lá bài từ trên cùng
  draw() {
    return this.cards.pop();
  }
}

module.exports = Deck;
