// sound.js - Hiệu ứng âm thanh tự tổng hợp bằng Web Audio API (không cần file
// mp3/wav tải từ ngoài). Mỗi hàm play... tạo vài dao động (oscillator) ngắn với
// đường bao âm lượng (envelope) rồi tự dừng, không tốn bộ nhớ lâu dài.

const Sound = (() => {
  let ctx = null;
  let muted = false;

  try {
    muted = localStorage.getItem('poker-muted') === '1';
  } catch (e) { /* không có localStorage cũng không sao, mặc định không mute */ }

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Phát 1 nốt đơn giản: sóng `type`, tần số `freq` Hz, kéo dài `dur` giây,
  // bắt đầu sau `delay` giây, âm lượng đỉnh `peak`.
  function tone({ freq, type = 'sine', dur = 0.12, delay = 0, peak = 0.2 }) {
    if (muted) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Tiếng "tách" ngắn khi chia từng lá bài
  function playDeal() {
    tone({ freq: 900, type: 'square', dur: 0.05, peak: 0.08 });
  }

  // Tiếng "vút" khi lật bài chung (quét tần số từ thấp lên cao)
  function playFlip() {
    if (muted) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.15);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.15, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  // Tiếng "cạch" kim loại khi chip bay vào pot
  function playChip() {
    tone({ freq: 1400, type: 'square', dur: 0.06, peak: 0.1 });
    tone({ freq: 1800, type: 'square', dur: 0.05, peak: 0.06, delay: 0.03 });
  }

  // Tiếng cho hành động check/call
  function playAction() {
    tone({ freq: 500, type: 'sine', dur: 0.1, peak: 0.15 });
  }

  // Tiếng cho raise / all-in (2 nốt lên)
  function playRaise() {
    tone({ freq: 500, type: 'sawtooth', dur: 0.08, peak: 0.12 });
    tone({ freq: 700, type: 'sawtooth', dur: 0.1, peak: 0.12, delay: 0.06 });
  }

  // Chime thắng ván (hợp âm 3 nốt)
  function playWin() {
    tone({ freq: 523.25, type: 'sine', dur: 0.5, peak: 0.15 });
    tone({ freq: 659.25, type: 'sine', dur: 0.5, peak: 0.15, delay: 0.08 });
    tone({ freq: 783.99, type: 'sine', dur: 0.6, peak: 0.15, delay: 0.16 });
  }

  // Ping nhắc nhở tới lượt mình hành động
  function playTurnAlert() {
    tone({ freq: 880, type: 'sine', dur: 0.15, peak: 0.12 });
  }

  function setMuted(value) {
    muted = !!value;
    try { localStorage.setItem('poker-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function isMuted() {
    return muted;
  }

  function unlock() {
    ensureContext();
  }

  return { playDeal, playFlip, playChip, playAction, playRaise, playWin, playTurnAlert, setMuted, isMuted, unlock };
})();
