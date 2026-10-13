// ── Audio (Web Audio pluck) ──────────────────────────────────────────────
// Copied from Altered Trainer, which carries the toolbox standard: the two-
// layer iOS silent-switch bypass, a shared bus with a gentle limiter, and
// idle-suspend. See the Fretworks root CLAUDE.md → Audio before changing any
// of it, and copy fixes from Chord-Trainer/App.jsx rather than diverging.
const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);
let _ctx = null, _unlocked = false;
// Layer 1 (iOS 16.4+): declare real media playback — Web Audio then ignores
// the hardware ringer switch, same as the Music app. Feature-detected.
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
// Layer 2 (older iOS): the "playback" promotion from a real <audio> element
// only holds while it is PLAYING, so keep a silent element looping for the
// life of the page (a fire-once silent MP3 does not stick — don't regress).
const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAFhpbmcAAAAPAAAAAwAAA7AAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tb////////////////////////////////////////////////////////////////AAAA8ExBTUUzLjk5LjVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
let _silentLoop = null;
function startSilentLoop() {
  if (navigator.audioSession || !/iphone|ipad|ipod/i.test(navigator.userAgent)) return;
  try {
    if (!_silentLoop) { _silentLoop = new Audio(SILENT_MP3); _silentLoop.loop = true; }
    if (_silentLoop.paused) { const p = _silentLoop.play(); if (p && p.catch) p.catch(() => { _silentLoop = null; }); }
  } catch (e) { _silentLoop = null; }
}
export function getCtx() { if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)(); if (_ctx.state === 'suspended') _ctx.resume(); return _ctx; }
export function unlockAudio() {
  startSilentLoop(); // re-checked every play: iOS pauses media on backgrounding
  if (_unlocked) return;
  const ctx = getCtx();
  const buf = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
  src.buffer = buf; src.connect(ctx.destination); src.start(0);
  ctx.resume().then(() => { _unlocked = true; });
}
// Shared bus + gentle limiter so rapid overlapping notes don't stack/swell.
let _bus = null;
function getBus(ctx) {
  if (!_bus || _bus.context !== ctx) {
    const g = ctx.createGain(); g.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 20; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    g.connect(comp); comp.connect(ctx.destination);
    _bus = g;
  }
  return _bus;
}
// Idle-suspend: release the audio session when quiet so iOS drops "now
// playing"; getCtx() resumes on the next play.
let _idleTimer = null, _idleEnd = 0;
export function bumpIdle(ctx, end) {
  _idleEnd = Math.max(_idleEnd, end);
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    _idleTimer = null;
    if (ctx.currentTime < _idleEnd - 0.05) return;
    if (ctx.state === 'running') ctx.suspend().catch(() => {});
  }, Math.max(0, (_idleEnd - ctx.currentTime) * 1000) + 400);
}
export function pluck(ctx, freq, when, vol = 0.16) {
  [[1, 1.0], [2, 0.45], [3, 0.22], [4, 0.09], [6, 0.04]].forEach(([h, a]) => {
    const osc = ctx.createOscillator(), g = ctx.createGain(), filt = ctx.createBiquadFilter();
    osc.type = 'sine'; osc.frequency.value = freq * h; filt.type = 'lowpass'; filt.frequency.value = Math.min(3200, freq * h * 3);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol * a, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, when + (h === 1 ? 1.6 : 0.9));
    osc.connect(filt); filt.connect(g); g.connect(getBus(ctx)); osc.start(when); osc.stop(when + 2);
  });
}
export function playMidis(midis, gap = 0.12) {
  unlockAudio();
  const ctx = getCtx(), now = ctx.currentTime + 0.05;
  midis.forEach((m, i) => pluck(ctx, midiToHz(m), now + i * gap));
  bumpIdle(ctx, now + (midis.length - 1) * gap + 2);
}
// A dominant 7 strummed low to high, one envelope level for the whole chord
// (each note 1/n) so a strum is no louder than a single tap. Voiced R 5 b7 3 5
// from the lowest root at or above the low E — the E-shape barre.
export const dom7Voicing = chordRootPc => { const r = 40 + (((chordRootPc - 4) % 12) + 12) % 12; return [0, 7, 10, 16, 19].map(i => r + i); };
export function strumAt(ctx, midis, when, vol = 0.34) {
  midis.forEach((m, j) => pluck(ctx, midiToHz(m), when + j * 0.028, vol / midis.length * 1.6));
}
export function strum(midis) {
  unlockAudio();
  const ctx = getCtx(), now = ctx.currentTime + 0.05;
  strumAt(ctx, midis, now);
  bumpIdle(ctx, now + 2);
}
