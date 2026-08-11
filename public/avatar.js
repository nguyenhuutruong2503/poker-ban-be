// avatar.js - Sinh avatar dạng "viên bi 3D" (glossy orb) xác định (deterministic)
// từ tên người chơi. Không dùng ảnh/thư viện ngoài: băm tên ra seed, chọn màu đá
// quý + chữ cái đầu tên, vẽ bằng SVG gradient để tạo cảm giác nổi khối 3D sắc nét.

const AVATAR_PALETTE_3D = [
  '#b5233d', // ruby
  '#1f7a4d', // emerald
  '#1f4e9c', // sapphire
  '#6a2fa0', // amethyst
  '#b8860b', // gold cũ
  '#2f3542', // onyx
  '#0f5c3f', // jade
  '#c2570c', // amber
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

// Làm sáng/tối 1 màu hex theo tỉ lệ percent (-1..1) để tạo dải gradient 3D
function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + Math.round(255 * percent);
  let g = ((num >> 8) & 0xff) + Math.round(255 * percent);
  let b = (num & 0xff) + Math.round(255 * percent);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Trả về chuỗi SVG (markup) vẽ 1 "viên bi" 3D bóng, xác định hoàn toàn từ
// `seedText` (thường là tên người chơi) -> cùng tên luôn ra cùng 1 avatar.
function avatarSvg(seedText, sizePx) {
  const size = sizePx || 32;
  const clean = String(seedText || '?').trim();
  const seed = hashString(clean.toLowerCase());
  const rand = mulberry32(seed);
  const base = AVATAR_PALETTE_3D[Math.floor(rand() * AVATAR_PALETTE_3D.length)];
  const metallic = rand() > 0.5
    ? ['#fff6d8', '#d4af37', '#8a6a1a'] // vàng gold
    : ['#ffffff', '#c9d3dc', '#7c8794']; // bạc
  const initial = escapeXml((clean[0] || '?').toUpperCase());
  const uid = `av${seed.toString(36)}`; // id riêng để nhiều avatar trên cùng trang không đụng gradient của nhau

  return `<svg class="avatar-orb" width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sphere-${uid}" cx="32%" cy="26%" r="80%">
        <stop offset="0%" stop-color="${shade(base, 0.4)}" />
        <stop offset="55%" stop-color="${base}" />
        <stop offset="100%" stop-color="${shade(base, -0.35)}" />
      </radialGradient>
      <linearGradient id="metal-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${metallic[0]}" />
        <stop offset="55%" stop-color="${metallic[1]}" />
        <stop offset="100%" stop-color="${metallic[2]}" />
      </linearGradient>
      <radialGradient id="shine-${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle cx="32" cy="32" r="29" fill="url(#sphere-${uid})" stroke="#d4af37" stroke-width="2" />
    <ellipse cx="23" cy="17" rx="14" ry="8" fill="url(#shine-${uid})" />
    <text x="32" y="42" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="27" fill="url(#metal-${uid})" stroke="rgba(0,0,0,0.4)" stroke-width="0.6">${initial}</text>
  </svg>`;
}
