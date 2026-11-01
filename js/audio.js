const GameAudio = (() => {
  let ctx = null;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type, gainValue) {
    const audio = ensure();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audio.currentTime);
    gain.gain.setValueAtTime(gainValue, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  }

  return {
    unlock: ensure,
    pull() {
      tone(180, 0.08, "triangle", 0.03);
    },
    launch() {
      tone(140, 0.16, "sawtooth", 0.05);
      tone(320, 0.1, "square", 0.025);
    },
    wood() {
      tone(210, 0.09, "triangle", 0.05);
    },
    ice() {
      tone(740, 0.08, "sine", 0.04);
    },
    stone() {
      tone(90, 0.12, "sawtooth", 0.05);
    },
    pop() {
      tone(520, 0.12, "square", 0.05);
      tone(180, 0.18, "triangle", 0.04);
    },
    win() {
      tone(523, 0.16, "triangle", 0.05);
      setTimeout(() => tone(659, 0.16, "triangle", 0.05), 90);
      setTimeout(() => tone(784, 0.22, "triangle", 0.05), 180);
    },
    lose() {
      tone(220, 0.2, "sawtooth", 0.04);
      setTimeout(() => tone(160, 0.28, "sawtooth", 0.04), 120);
    },
  };
})();
