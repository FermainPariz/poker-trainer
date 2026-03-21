// === Sound System — Web Audio API Synthesis ===
// No external audio files needed. All sounds generated procedurally.

let ctx = null;
let enabled = true;
let volume = 0.3;

function getCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { enabled = false; }
  }
  return ctx;
}

// Resume context on first user interaction (browser autoplay policy)
function ensureResumed() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume();
}

// === Primitive: play a tone ===
function tone(freq, duration, type = 'sine', vol = volume, delay = 0) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, c.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + duration + 0.05);
}

// === Primitive: noise burst (for chip/card sounds) ===
function noiseBurst(duration, vol = volume * 0.5) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;

  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // decaying noise
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = vol;

  // High-pass filter for crispness
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  source.start();
}

// === Game Sounds ===

export function playCardDeal() {
  noiseBurst(0.06, volume * 0.3);
}

export function playCardFlip() {
  noiseBurst(0.08, volume * 0.4);
  tone(800, 0.05, 'sine', volume * 0.1);
}

export function playChipBet() {
  // Stacking chips: quick high-freq clicks
  noiseBurst(0.04, volume * 0.4);
  tone(3200, 0.03, 'square', volume * 0.08, 0.02);
  tone(3800, 0.03, 'square', volume * 0.06, 0.04);
}

export function playChipPot() {
  // Chips sliding to pot
  noiseBurst(0.1, volume * 0.3);
  tone(2400, 0.05, 'square', volume * 0.06);
  tone(2800, 0.04, 'square', volume * 0.05, 0.03);
  tone(3200, 0.03, 'square', volume * 0.04, 0.06);
}

export function playCheck() {
  // Soft knock
  tone(200, 0.08, 'sine', volume * 0.15);
  noiseBurst(0.03, volume * 0.15);
}

export function playFold() {
  // Soft swoosh down
  const c = getCtx();
  if (!c || !enabled) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.15);
  gain.gain.setValueAtTime(volume * 0.1, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.2);
}

export function playAllIn() {
  // Dramatic: low thud + rising tone
  tone(80, 0.2, 'sine', volume * 0.3);
  tone(200, 0.15, 'triangle', volume * 0.15, 0.05);
  tone(400, 0.1, 'triangle', volume * 0.1, 0.1);
  noiseBurst(0.12, volume * 0.3);
}

export function playWinPot() {
  // Happy ascending arpeggio
  tone(523, 0.12, 'sine', volume * 0.2);        // C5
  tone(659, 0.12, 'sine', volume * 0.2, 0.1);   // E5
  tone(784, 0.12, 'sine', volume * 0.2, 0.2);   // G5
  tone(1047, 0.2, 'sine', volume * 0.25, 0.3);  // C6
  noiseBurst(0.15, volume * 0.2);
}

export function playLosePot() {
  // Descending minor
  tone(400, 0.15, 'sine', volume * 0.12);
  tone(350, 0.15, 'sine', volume * 0.1, 0.12);
  tone(300, 0.2, 'sine', volume * 0.08, 0.24);
}

export function playYourTurn() {
  // Subtle notification ping
  tone(880, 0.08, 'sine', volume * 0.12);
  tone(1100, 0.1, 'sine', volume * 0.1, 0.08);
}

export function playBlindsUp() {
  // Rising alert for tournament blind increase
  tone(440, 0.1, 'triangle', volume * 0.15);
  tone(550, 0.1, 'triangle', volume * 0.15, 0.1);
  tone(660, 0.1, 'triangle', volume * 0.15, 0.2);
  tone(880, 0.15, 'triangle', volume * 0.2, 0.3);
}

export function playElimination() {
  // Player eliminated: dramatic low descend
  tone(300, 0.3, 'sawtooth', volume * 0.1);
  tone(200, 0.3, 'sawtooth', volume * 0.08, 0.15);
  tone(100, 0.4, 'sawtooth', volume * 0.06, 0.3);
}

export function playTournamentWin() {
  // Victory fanfare
  tone(523, 0.15, 'sine', volume * 0.25);
  tone(659, 0.15, 'sine', volume * 0.25, 0.15);
  tone(784, 0.15, 'sine', volume * 0.25, 0.3);
  tone(1047, 0.3, 'sine', volume * 0.3, 0.45);
  tone(784, 0.1, 'sine', volume * 0.2, 0.6);
  tone(1047, 0.4, 'sine', volume * 0.3, 0.7);
}

// === Settings ===
export function setSoundEnabled(val) { enabled = val; }
export function isSoundEnabled() { return enabled; }
export function setSoundVolume(val) { volume = Math.max(0, Math.min(1, val)); }
export function getSoundVolume() { return volume; }
export { ensureResumed };
