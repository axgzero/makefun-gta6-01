// audio.js — all sound is synthesized with WebAudio. No audio files, no network.
// Engine hum, two-tone sirens, gunshots, UI blips and a lazy sunset groove.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let muted = false;
  let musicTimer = null;
  let sirenNodes = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // engine: sawtooth through a lowpass, pitch follows speed
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
      startMusic();
    } catch (e) {
      return false;
    }
    return true;
  }

  function noiseBurst(dur, freq, vol, type = 'lowpass') {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start();
  }

  function tone(freq, dur, vol, type = 'sine', slideTo = null, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // A lazy sunset groove: Am – F – C – G bass + sparse plucks, scheduled ahead.
  const CHORDS = [[110, 130.8, 164.8], [87.3, 110, 130.8], [130.8, 164.8, 196], [98, 123.5, 146.8]];
  function startMusic() {
    if (musicTimer) return;
    let step = 0;
    musicTimer = setInterval(() => {
      if (!ctx || muted || ctx.state === 'suspended') return;
      const chord = CHORDS[Math.floor(step / 8) % 4];
      if (step % 8 === 0) tone(chord[0] / 2, 1.6, 0.16, 'triangle');
      if (step % 2 === 0) tone(chord[step % 3] * 2, 0.5, 0.05, 'sine');
      if (step % 8 === 4) tone(chord[1], 0.7, 0.09, 'triangle');
      if (step % 16 === 14) { tone(660, 0.18, 0.05, 'sine'); tone(880, 0.18, 0.04, 'sine', null, 0.09); }
      step++;
    }, 230);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return muted; },
    setEngine(speed01, inCar) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(inCar ? 0.05 + speed01 * 0.075 : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
    },
    gunshot() { noiseBurst(0.14, 1400, 0.5, 'lowpass'); tone(160, 0.1, 0.3, 'square', 60); },
    enemyShot() { noiseBurst(0.11, 1100, 0.22, 'lowpass'); },
    punch() { noiseBurst(0.09, 500, 0.4, 'lowpass'); },
    pickup() { tone(880, 0.12, 0.2, 'sine', 1320); },
    cash() { tone(1046, 0.1, 0.2, 'sine'); tone(1318, 0.16, 0.2, 'sine', null, 0.09); },
    crash() { noiseBurst(0.3, 300, 0.55, 'lowpass'); },
    click() { tone(700, 0.05, 0.14, 'square'); },
    mission() { tone(523, 0.16, 0.2, 'triangle'); tone(659, 0.16, 0.2, 'triangle', null, 0.12); tone(784, 0.3, 0.22, 'triangle', null, 0.24); },
    fail() { tone(392, 0.25, 0.2, 'sawtooth', 220); tone(262, 0.4, 0.2, 'sawtooth', 180, 0.2); },
    sirenStart() {
      if (!ctx || sirenNodes) return;
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = 750;
      const g = ctx.createGain(); g.gain.value = 0.05;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.55;
      const lg = ctx.createGain(); lg.gain.value = 220;
      lfo.connect(lg).connect(o.frequency);
      o.connect(g).connect(master);
      o.start(); lfo.start();
      sirenNodes = { o, g, lfo };
    },
    sirenStop() {
      if (!sirenNodes) return;
      try { sirenNodes.o.stop(); sirenNodes.lfo.stop(); } catch (e) {}
      sirenNodes = null;
    },
    setSiren(on) { if (on) this.sirenStart(); else this.sirenStop(); },
  };
}
