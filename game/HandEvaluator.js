// HandEvaluator.js - Xác định bài mạnh nhất từ 7 lá (2 bài tây + 5 bài chung)
//
// Cách hoạt động: thử tất cả 21 tổ hợp 5 lá từ 7 lá, chấm điểm từng tổ hợp,
// rồi chọn tổ hợp có điểm cao nhất. Đây là cách đơn giản, dễ hiểu, đủ nhanh
// cho một bàn chơi vài người (không cần tối ưu tốc độ cực đại).

const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const HAND_NAMES = [
  'Mậu thầu (High Card)',
  'Một đôi (One Pair)',
  'Hai đôi (Two Pair)',
  'Ba cây (Three of a Kind)',
  'Sảnh (Straight)',
  'Thùng (Flush)',
  'Cù lũ (Full House)',
  'Tứ quý (Four of a Kind)',
  'Sảnh thùng (Straight Flush)',
];

// Sinh tất cả tổ hợp k phần tử từ mảng arr
function combinations(arr, k) {
  const result = [];
  function helper(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

// Chấm điểm một bộ đúng 5 lá bài
function evaluate5(cards) {
  const values = cards.map((c) => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = {};
  values.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const uniqueValues = [...new Set(values)];
  let straightHigh = null;
  if (uniqueValues.length === 5) {
    if (uniqueValues[0] - uniqueValues[4] === 4) {
      straightHigh = uniqueValues[0];
    } else if (uniqueValues.join(',') === '14,5,4,3,2') {
      // Trường hợp đặc biệt: sảnh thấp nhất A-2-3-4-5 (Ách được tính là 1)
      straightHigh = 5;
    }
  }
  const isStraight = straightHigh !== null;

  if (isStraight && isFlush) {
    return { rank: 8, tiebreak: [straightHigh], name: HAND_NAMES[8] };
  }
  if (groups[0].count === 4) {
    return { rank: 7, tiebreak: [groups[0].value, groups[1].value], name: HAND_NAMES[7] };
  }
  if (groups[0].count === 3 && groups[1] && groups[1].count === 2) {
    return { rank: 6, tiebreak: [groups[0].value, groups[1].value], name: HAND_NAMES[6] };
  }
  if (isFlush) {
    return { rank: 5, tiebreak: values, name: HAND_NAMES[5] };
  }
  if (isStraight) {
    return { rank: 4, tiebreak: [straightHigh], name: HAND_NAMES[4] };
  }
  if (groups[0].count === 3) {
    return {
      rank: 3,
      tiebreak: [groups[0].value, ...groups.slice(1).map((g) => g.value)],
      name: HAND_NAMES[3],
    };
  }
  if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
    const pairValues = [groups[0].value, groups[1].value].sort((a, b) => b - a);
    return { rank: 2, tiebreak: [...pairValues, groups[2].value], name: HAND_NAMES[2] };
  }
  if (groups[0].count === 2) {
    return {
      rank: 1,
      tiebreak: [groups[0].value, ...groups.slice(1).map((g) => g.value)],
      name: HAND_NAMES[1],
    };
  }
  return { rank: 0, tiebreak: values, name: HAND_NAMES[0] };
}

// So sánh 2 bài đã chấm điểm. Trả về số âm nếu a mạnh hơn b.
function compareHands(a, b) {
  if (a.rank !== b.rank) return b.rank - a.rank;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreak[i] || 0;
    const bv = b.tiebreak[i] || 0;
    if (av !== bv) return bv - av;
  }
  return 0;
}

// Tìm bài 5 lá mạnh nhất từ 7 lá (2 bài tây + 5 bài chung)
function evaluateBestHand(sevenCards) {
  const combos = combinations(sevenCards, 5);
  let best = null;
  for (const combo of combos) {
    const evaluated = evaluate5(combo);
    if (!best || compareHands(evaluated, best) < 0) {
      best = evaluated;
      best.cards = combo;
    }
  }
  return best;
}

module.exports = { evaluateBestHand, compareHands };
