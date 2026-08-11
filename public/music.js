// music.js - Nhạc nền "casino jazz" tự tổng hợp bằng Web Audio API (không tải
// file nhạc từ ngoài, tránh vấn đề bản quyền/mạng). Mô phỏng 1 ban nhạc jazz nhỏ:
// bass đi bộ (walking bass), chổi trống swing (brush hi-hat), và hợp âm piano
// điện nhẹ nhàng — lặp vô hạn ở âm lượng thấp làm nền, không lấn tiếng SFX.

const Music = (() => {
  let ctx = null;
  let masterGain = null;
  let noiseBuffer = null;
  let schedulerTimer = null;
  let nextNoteTime = 0;
  let beatIndex = 0; // mỗi "beat" = 1 nốt 8th-note swing
  let muted = false;
  let playing = false;

  try {
    muted = localStorage.getItem('poker-music-muted') === '1';
  } catch (e) { /* không có localStorage cũng không sao */ }

  // Vòng hợp âm jazz kiểu ii-V-I-vi (Dm7 - G7 - Cmaj7 - Am7), mỗi hợp âm 2 ô nhịp.
  // Mỗi hợp âm: nốt gốc cho bass, và 3 nốt tạo thành hợp âm rải cho piano điện.
  const PROGRESSION = [
    { root: 146.83, chord: [146.83, 174.61, 220.00] },  // Dm7 (D3, F3, A3)
    { root: 196.00, chord: [196.00, 246.94, 293.66] },  // G7  (G3, B3, D4)
    { root: 130.81, chord: [130.81, 164.81, 196.00] },  // Cmaj7 (C3, E3, G3)
    { root: 220.00, chord: [220.00, 261.63, 329.63] },  // Am7 (A3, C4, E4)
  ];
  const SWING_STEPS_PER_CHORD = 8; // 8 nốt 8th-note swing mỗi hợp âm (2 ô nhịp 4/4)
  const TEMPO_BPM = 92;
  const EIGHTH_SEC = 60 / TEMPO_BPM / 2;

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.16;
      masterGain.connect(ctx.destination);
      noiseBuffer = buildNoiseBuffer(ctx);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function buildNoiseBuffer(audioCtx) {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Nốt bass đi bộ: gốc hợp âm rồi lướt dần lên nốt gốc hợp âm kế tiếp
  function playBassNote(freq, t, dur) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Chổi trống swing: tiếng "xoẹt" ngắn từ noise qua bộ lọc dải cao
  function playBrush(t, accent) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 4000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(accent ? 0.22 : 0.1, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(filter).connect(gain).connect(masterGain);
    src.start(t);
    src.stop(t + 0.1);
  }

  // Hợp âm piano điện rải nhẹ (arpeggio mềm), phát ở đầu mỗi hợp âm
  function playChordStab(chord, t) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.connect(masterGain);
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * 2; // 1 quãng 8 cao hơn bass cho rõ hợp âm
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.06 + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      osc.connect(gain).connect(filter);
      osc.start(t + i * 0.03);
      osc.stop(t + 1.5);
    });
  }

  // Lên lịch các nốt sắp tới trong 1 cửa sổ ngắn (kỹ thuật "lookahead scheduler"
  // chuẩn của Web Audio) để nhịp không bị lệch/giật như dùng setInterval đơn thuần.
  function scheduler() {
    while (nextNoteTime < ctx.currentTime + 0.12) {
      const chordIndex = Math.floor(beatIndex / SWING_STEPS_PER_CHORD) % PROGRESSION.length;
      const stepInChord = beatIndex % SWING_STEPS_PER_CHORD;
      const { root, chord } = PROGRESSION[chordIndex];
      const nextRoot = PROGRESSION[(chordIndex + 1) % PROGRESSION.length].root;

      // Swing: nốt lẻ trễ nhẹ để tạo cảm giác "đung đưa" đặc trưng của jazz
      const swingDelay = stepInChord % 2 === 1 ? EIGHTH_SEC * 0.33 : 0;
      const t = nextNoteTime + swingDelay;

      if (stepInChord === 0) {
        playBassNote(root, t, EIGHTH_SEC * 1.8);
        playChordStab(chord, t);
      } else if (stepInChord === 4) {
        playBassNote(root * 1.5, t, EIGHTH_SEC * 1.5); // quãng 5 cho đa dạng
      } else if (stepInChord === 6) {
        playBassNote((root + nextRoot) / 2, t, EIGHTH_SEC * 1.3); // lướt dần sang hợp âm sau
      }
      playBrush(t, stepInChord % 2 === 0);

      nextNoteTime += EIGHTH_SEC;
      beatIndex += 1;
    }
  }

  function start() {
    const audioCtx = ensureContext();
    if (!audioCtx || playing) return;
    playing = true;
    nextNoteTime = audioCtx.currentTime + 0.1;
    beatIndex = 0;
    schedulerTimer = setInterval(scheduler, 25);
  }

  function stop() {
    playing = false;
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  function setMuted(value) {
    muted = !!value;
    try { localStorage.setItem('poker-music-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (masterGain) {
      const audioCtx = ensureContext();
      masterGain.gain.linearRampToValueAtTime(muted ? 0 : 0.16, audioCtx.currentTime + 0.3);
    }
    if (muted) stop();
    else start();
  }

  function isMuted() {
    return muted;
  }

  function unlock() {
    ensureContext();
  }

  return { start, stop, setMuted, isMuted, unlock };
})();
