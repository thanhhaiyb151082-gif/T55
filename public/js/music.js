// Nhạc nền đếm ngược cho mỗi câu hỏi. Toàn bộ âm thanh được tổng hợp trực tiếp bằng Web Audio API:
// không dùng bài hát có bản quyền, không cần tải file, không có lời, không tốn dung lượng mạng.
//
// Phong cách: giai điệu ngũ cung (Đô–Rê–Mi–Sol–La) quen thuộc với tai nghe người Việt, âm sắc mộc
// (giống kalimba/đàn gõ), nhịp 120 BPM vui nhẹ, âm lượng thấp để không át tiếng thầy cô và không
// gây căng thẳng. Bố cục bám theo đồng hồ: nửa đầu thong thả, nửa sau thêm nhịp phách, 5 giây cuối
// có tiếng "tích" mỗi giây để nhắc giờ, kết thúc bằng một hồi chuông nhẹ khi hết thời gian.
(() => {
  const VOLUME = 0.6;       // âm lượng tổng (0–1); giữ thấp vì cả lớp có thể cùng nghe
  const BEAT = 0.5;         // giây mỗi phách (120 BPM)
  const EIGHTH = BEAT / 2;
  const TICK_SECONDS = 5;   // số giây cuối có tiếng tích

  const N = {
    G2: 98.0, C3: 130.81, E3: 164.81,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5, G6: 1568.0
  };
  const _ = null;
  // 4 ô nhịp, mỗi ô 8 nốt móc đơn (2 giây). Lặp lại nếu thời gian dài hơn 8 giây.
  const MELODY = [
    [N.E5, N.G5, N.A5, N.G5, N.E5, N.D5, N.C5, _],
    [N.D5, N.E5, N.G5, N.E5, N.D5, N.C5, N.D5, _],
    [N.G5, N.A5, N.C6, N.A5, N.G5, N.E5, N.G5, _],
    [N.A5, N.G5, N.E5, N.D5, N.E5, N.D5, N.C5, _]
  ];
  const BASS = [N.C3, N.G2, N.C3, N.E3];

  let ctx = null;
  let noiseBuffer = null;
  let voice = null;          // { out } — nhóm âm thanh của lần phát hiện tại
  let session = null;        // { endPerf, totalMs } của câu đang mở
  let enabled = false;
  let storageKey = "quizMusicEnabled";
  const listeners = [];

  function getContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  // ----- Các "nhạc cụ" -----

  function pluck(c, out, when, freq, { gain = 0.22, decay = 0.4 } = {}) {
    const o1 = c.createOscillator(); o1.type = "triangle"; o1.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = "sine";     o2.frequency.value = freq * 2;
    const g = c.createGain();
    const g2 = c.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o1.start(when); o2.start(when);
    o1.stop(when + decay + 0.05); o2.stop(when + decay + 0.05);
  }

  function bass(c, out, when, freq) {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.3, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
    o.connect(g); g.connect(out);
    o.start(when); o.stop(when + 0.5);
  }

  function hat(c, out, when) {
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, Math.ceil(c.sampleRate * 0.05), c.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(); s.buffer = noiseBuffer;
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 6500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.07, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(when); s.stop(when + 0.05);
  }

  // Tiếng "tích" của đồng hồ (mõ gỗ) cho những giây cuối.
  function tick(c, out, when, freq) {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.3, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    o.connect(g); g.connect(out);
    o.start(when); o.stop(when + 0.12);
  }

  // Hồi chuông nhẹ khi hết giờ.
  function chime(c, out, when) {
    [N.C6, N.G6].forEach((f, i) => pluck(c, out, when + i * 0.07, f, { gain: 0.2, decay: 1.1 }));
  }

  // Dựng toàn bộ bản nhạc cho một câu. `t0` là thời điểm (theo đồng hồ của AudioContext) mà câu bắt đầu,
  // `elapsed` là số giây đã trôi qua (khi vào lại giữa chừng), `total` là tổng thời gian câu.
  function build(c, out, t0, elapsed, total) {
    const at = time => (time >= elapsed - 0.001 ? t0 + time : null);
    const bars = Math.ceil(total / (EIGHTH * 8));

    for (let b = 0; b < bars; b++) {
      const pat = MELODY[b % MELODY.length];
      for (let i = 0; i < 8; i++) {
        const time = b * EIGHTH * 8 + i * EIGHTH;
        if (time >= total - 0.05) continue;
        const when = at(time);
        if (when === null) continue;

        const note = pat[i];
        if (note) pluck(c, out, when, note, { gain: time > total * 0.5 ? 0.24 : 0.2 });
        if (i === 0 || i === 4) bass(c, out, when, BASS[b % BASS.length]);
        // Nửa sau thêm nhịp phách nhẹ trên các nốt lẻ để không khí sôi động dần.
        if (time >= total * 0.4 && time < total - TICK_SECONDS && i % 2 === 1) hat(c, out, when);
      }
    }

    for (let k = 0; k < TICK_SECONDS; k++) {
      const time = total - TICK_SECONDS + k;
      const when = at(time);
      if (when !== null) tick(c, out, when, k >= TICK_SECONDS - 2 ? 1900 : 1500);
    }

    const end = at(total);
    if (end !== null) chime(c, out, end);
  }

  // ----- Điều khiển phát -----

  function halt() {
    if (!voice) return;
    const { out } = voice;
    voice = null;
    try {
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.12);
    } catch { /* bỏ qua */ }
    setTimeout(() => { try { out.disconnect(); } catch { /* bỏ qua */ } }, 250);
  }

  function schedule() {
    halt();
    if (!enabled || !session) return;
    const c = getContext();
    if (!c || c.state !== "running") return;

    const remaining = (session.endPerf - performance.now()) / 1000;
    if (remaining <= 0.1) return;
    const total = session.totalMs / 1000;
    const elapsed = Math.max(0, total - remaining);

    const out = c.createGain();
    out.gain.setValueAtTime(0, c.currentTime);
    out.gain.linearRampToValueAtTime(VOLUME, c.currentTime + 0.25);
    out.connect(c.destination);
    voice = { out };

    build(c, out, c.currentTime + 0.05 - elapsed, elapsed, total);
  }

  // Trình duyệt chỉ cho phát âm thanh sau một thao tác của người dùng (chạm/bấm/gõ phím).
  function unlock() {
    const c = getContext();
    if (!c) return;
    if (c.state === "running") return;
    c.resume().then(() => { if (session) schedule(); }).catch(() => {});
  }
  ["pointerdown", "touchend", "keydown", "click"].forEach(type =>
    document.addEventListener(type, unlock, { capture: true, passive: true }));

  function notify() { listeners.forEach(fn => { try { fn(enabled); } catch { /* bỏ qua */ } }); }

  function setEnabled(value) {
    enabled = Boolean(value);
    try { localStorage.setItem(storageKey, enabled ? "1" : "0"); } catch { /* bỏ qua */ }
    if (enabled) { unlock(); schedule(); } else { halt(); }
    notify();
  }

  window.QuizMusic = {
    // defaultOn: trạng thái mặc định khi người dùng chưa từng chọn (được nhớ trong localStorage).
    init({ storageKey: key, defaultOn }) {
      storageKey = key;
      let saved = null;
      try { saved = localStorage.getItem(storageKey); } catch { /* bỏ qua */ }
      enabled = saved === null ? Boolean(defaultOn) : saved === "1";
      notify();
    },
    isEnabled: () => enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled),
    onChange(fn) { listeners.push(fn); fn(enabled); },
    // Phát nhạc cho câu còn `remainingMs` trong tổng `totalMs`.
    play(remainingMs, totalMs) {
      session = { endPerf: performance.now() + remainingMs, totalMs };
      schedule();
    },
    stop() { session = null; halt(); },
    // Nút bật/tắt nhạc.
    bindToggle(button) {
      button.addEventListener("click", () => window.QuizMusic.toggle());
      this.onChange(on => {
        button.textContent = on ? "🔊 Nhạc: Bật" : "🔇 Nhạc: Tắt";
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
    },
    // Dùng cho kiểm thử.
    _build: build
  };
})();
