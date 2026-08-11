// avatar.js - Sinh avatar pixel-art xác định (deterministic) từ tên người chơi.
// Không dùng ảnh/thư viện ngoài: chỉ băm tên ra 1 con số "seed", rồi từ seed đó
// vẽ ra lưới pixel đối xứng (giống identicon của GitHub) bằng SVG.

const AVATAR_PALETTE = [
  '#D4AF37', // vàng gold
  '#C0392B', // đỏ rượu vang
  '#2E8B57', // xanh lá casino
  '#3D9BFF', // xanh dương
  '#E67E22', // cam đồng
  '#9B59B6', // tím
  '#E0B0FF', // hồng nhạt
  '#F1C40F', // vàng chanh
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// PRNG nhỏ (mulberry32) để từ 1 seed sinh ra dãy số "ngẫu nhiên" lặp lại được
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trả về chuỗi SVG (markup) vẽ avatar pixel 5x5 đối xứng theo trục dọc,
// xác định hoàn toàn từ `seedText` (thường là tên người chơi) -> cùng tên luôn
// ra cùng 1 avatar.
function avatarSvg(seedText, sizePx) {
  const size = sizePx || 32;
  const seed = hashString(String(seedText || '?').toLowerCase().trim());
  const rand = mulberry32(seed);
  const color = AVATAR_PALETTE[Math.floor(rand() * AVATAR_PALETTE.length)];
  const cols = 5;
  const rows = 5;
  const half = Math.ceil(cols / 2); // chỉ cần sinh nửa trái, nửa phải lấy đối xứng
  const cell = size / cols;
  const rects = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < half; x++) {
      if (rand() > 0.55) continue; // ô trống
      const mirrorX = cols - 1 - x;
      rects.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" />`);
      if (mirrorX !== x) {
        rects.push(`<rect x="${mirrorX * cell}" y="${y * cell}" width="${cell}" height="${cell}" />`);
      }
    }
  }

  return `<svg class="pixel-avatar" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#1b1b1b" />
    <g fill="${color}">${rects.join('')}</g>
  </svg>`;
}
