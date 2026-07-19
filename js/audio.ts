'use strict';

let AC = null;
let master = null;

export function initAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.5;
    master.connect(AC.destination);
  } catch (e) {
    AC = null;
  }
}

function noiseBuffer(dur) {
  if (!AC) return null;
  const b = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = Math.random() * 2 - 1;
  }
  return b;
}

export function playShot(vol = 1, pitch = 1) {
  if (!AC) return;
  const t = AC.currentTime;
  const buffer = noiseBuffer(0.14);
  if (!buffer) return;

  const n = AC.createBufferSource();
  n.buffer = buffer;
  const f = AC.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(3200 * pitch, t);
  f.frequency.exponentialRampToValueAtTime(300, t + 0.12);
  
  const g = AC.createGain();
  g.gain.setValueAtTime(0.65 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  
  n.connect(f).connect(g).connect(master);
  n.start(t);

  const o = AC.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(160 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  
  const og = AC.createGain();
  og.gain.setValueAtTime(0.4 * vol, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.14);
}

export function blip(freq, dur = 0.08, vol = 0.3, type = 'square') {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur);
}

export function playHit() {
  blip(1400, 0.06, 0.25, 'square');
}

export function playKill() {
  blip(880, 0.09, 0.3, 'square');
  setTimeout(() => blip(1320, 0.12, 0.3, 'square'), 70);
}

export function playPickup() {
  blip(520, 0.08, 0.28, 'sine');
  setTimeout(() => blip(780, 0.1, 0.28, 'sine'), 80);
}

export function playZoneTick() {
  blip(110, 0.15, 0.4, 'sawtooth');
}

export function playHurt() {
  blip(200, 0.12, 0.35, 'sawtooth');
}

export function playStep() {
  if (!AC) return;
  const t = AC.currentTime;
  const buffer = noiseBuffer(0.05);
  if (!buffer) return;

  const n = AC.createBufferSource();
  n.buffer = buffer;
  const f = AC.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 500;
  
  const g = AC.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  
  n.connect(f).connect(g).connect(master);
  n.start(t);
}

export function playSting(win) {
  if (!AC) return;
  const seq = win ? [523, 659, 784, 1046] : [400, 300, 220, 150];
  seq.forEach((f, i) => {
    setTimeout(() => blip(f, 0.28, 0.3, win ? 'triangle' : 'sawtooth'), i * 140);
  });
}
