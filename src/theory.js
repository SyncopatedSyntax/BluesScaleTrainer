// ════════════════════════════════════════════════════════════════════════
//  Blues Scale Trainer — the music. Pure: no React, no DOM.
//
//  Everything here is GENERATED from interval formulas. No shape is typed in
//  by hand. scripts/verify.mjs re-derives all of it independently — the five
//  boxes against the standard published A-minor-blues chart, transposed to all
//  twelve keys — and must pass before anything here ships.
// ════════════════════════════════════════════════════════════════════════

export const OPEN_MIDI = [40, 45, 50, 55, 59, 64];   // s0 = low E … s5 = high e
export const STR_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
export const pc = n => ((n % 12) + 12) % 12;
export const midiAt = (s, f) => OPEN_MIDI[s] + f;
export const ckey = (s, f) => s + '_' + f;
export const unkey = k => k.split('_').map(Number);

// Degree name of every interval above the root. Stored ASCII; `pretty` turns
// b into ♭ for display.
export const IV_LABEL = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
export const pretty = d => String(d).replace(/b/g, '♭').replace(/#/g, '♯');

// ── The two blues scales ─────────────────────────────────────────────────
// The blue note is the ONE note each scale adds to its pentatonic: b5 in minor
// blues, b3 in major blues. `beside` is the pentatonic degree it sits one fret
// above, on the same string — the 4 in minor (4 → b5 → 5), the 2 in major
// (2 → b3 → 3). That single rule reproduces the standard published box charts,
// stretches included, and verify.mjs pins it.
export const SCALES = {
  min: { id: 'min', name: 'Minor blues', short: 'Minor', iv: [0, 3, 5, 6, 7, 10], pent: [0, 3, 5, 7, 10], blue: 6, beside: 5, pentName: 'minor pentatonic' },
  maj: { id: 'maj', name: 'Major blues', short: 'Major', iv: [0, 2, 3, 4, 7, 9], pent: [0, 2, 4, 7, 9], blue: 3, beside: 2, pentName: 'major pentatonic' },
};
export const SCALE_IDS = ['min', 'maj'];

// The scales it is compared with — always the PARALLEL scale, same root.
export const COMPARE = {
  minpent: { id: 'minpent', name: 'Minor pentatonic', short: 'Min pent', iv: [0, 3, 5, 7, 10] },
  majpent: { id: 'majpent', name: 'Major pentatonic', short: 'Maj pent', iv: [0, 2, 4, 7, 9] },
  natmin:  { id: 'natmin',  name: 'Natural minor',    short: 'Nat minor', iv: [0, 2, 3, 5, 7, 8, 10] },
  major:   { id: 'major',   name: 'Major scale',      short: 'Major', iv: [0, 2, 4, 5, 7, 9, 11] },
};
export const COMPARE_IDS = ['minpent', 'majpent', 'natmin', 'major'];

export const scalePcs = (iv, root) => new Set(iv.map(i => pc(root + i)));
export const degOf = (midiOrPc, root) => IV_LABEL[pc(midiOrPc - root)];

// ── Spelling ─────────────────────────────────────────────────────────────
// Keys are named the way blues players name them. Notes are spelled by degree
// (the b5 of C is G♭, not F♯), falling back to the plain name only where the
// letter spelling would need a double accidental or a C♭/F♭/E♯/B♯ — correct,
// but not how anyone reads a blues chart.
export const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const PLAIN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const STEPS = { R: 0, b2: 1, '2': 1, b3: 2, '3': 2, '4': 3, b5: 4, '5': 4, b6: 5, '6': 5, b7: 6, '7': 6 };
export function spell(root, iv) {
  const target = pc(root + iv);
  const L = (LETTERS.indexOf(KEY_NAMES[root][0]) + STEPS[IV_LABEL[pc(iv)]]) % 7;
  let acc = pc(target - LETTER_PC[L]); if (acc > 6) acc -= 12;
  const name = acc === 0 ? LETTERS[L] : acc === 1 ? LETTERS[L] + '♯' : acc === -1 ? LETTERS[L] + '♭' : null;
  if (!name || ['C♭', 'F♭', 'E♯', 'B♯'].includes(name)) return PLAIN[target];
  return name;
}
export const noteName = (root, midiOrPc) => spell(root, pc(midiOrPc - root));

// ── The five boxes ───────────────────────────────────────────────────────
// Position k starts on the k-th note of the scale's pentatonic, on the low E:
// minor R b3 4 5 b7, major R 2 3 5 6. From there it is the standard two notes
// per string, ascending — which IS the familiar box, B-string shift and all —
// and then the blue note goes one fret above every `beside` note.
//
// The number comes from the starting degree, so it is the same grip in every
// key. The boxes are returned in neck order by getShapes(), which means in a
// given key the arrows may read 3, 4, 5, 1, 2 — the five are a cycle.
//
// A box sits as low as it can with every fret at 0 or above, so open position
// happens where it exists (E minor box 1 is the open E-minor pentatonic).
//
// Two properties verify.mjs proves for every box in every key, and the drills
// lean on both:
//   * the blue notes it adds are EXACTLY the blue-note pitches inside its frets;
//   * the box is EXACTLY every blues-scale note inside its frets, nothing more.
// So "every X in this box" and "every X you can see" are the same answer.
function pentSeq(S, root, f0, n) {
  const pcs = scalePcs(S.pent, root), seq = [];
  for (let m = OPEN_MIDI[0] + f0; seq.length < n; m++) if (pcs.has(pc(m))) seq.push(m);
  return seq;
}
// `perString` consecutive pentatonic notes on each string, string s starting at
// seq[stride*s]. A box is (2,2); a join is (3,2) — box k's two plus the next one,
// which is where box k+1 picks up on that same string.
function lay(seq, perString, stride) {
  const cells = [];
  for (let s = 0; s < 6; s++) for (const m of seq.slice(stride * s, stride * s + perString)) cells.push({ s, f: m - OPEN_MIDI[s] });
  return cells;
}
function finish(scaleId, root, pentCells, meta) {
  const S = SCALES[scaleId];
  const bpc = pc(root + S.beside);
  const blue = pentCells.filter(c => pc(midiAt(c.s, c.f)) === bpc).map(c => ({ s: c.s, f: c.f + 1 }));
  const cells = [...pentCells, ...blue]
    .map(c => ({ s: c.s, f: c.f, deg: degOf(midiAt(c.s, c.f), root), blue: pc(midiAt(c.s, c.f)) === pc(root + S.blue) }))
    .sort((a, b) => a.s - b.s || a.f - b.f);
  const fs = cells.map(c => c.f);
  return { ...meta, scale: scaleId, root, cells, lo: Math.min(...fs), hi: Math.max(...fs) };
}
function place(S, root, k, perString) {
  const f0 = pc(root + S.pent[k - 1] - OPEN_MIDI[0]);
  for (const f of [f0, f0 + 12]) {
    const cells = lay(pentSeq(S, root, f, 12 + perString), perString, 2);
    if (Math.min(...cells.map(c => c.f)) >= 0) return cells;
  }
  return null;   // unreachable: f0+12 >= 12 clears every string's -1 shift
}
export function boxShape(scaleId, root, k) {
  const S = SCALES[scaleId];
  return finish(scaleId, root, place(S, root, k, 2), {
    id: 'P' + k, kind: 'box', num: k, name: `Position ${k}`, short: `P${k}`, start: IV_LABEL[S.pent[k - 1]],
  });
}
// ── The joins ────────────────────────────────────────────────────────────
// Join k is box k and box k+1 together: on every string, box k's two notes plus
// the one above, which is where box k+1 continues on that string. That makes it
// the horizontal three-notes-per-string pattern you slide through to get from
// one box to the next. Join 5 runs from box 5 into box 1 an octave up.
export function joinShape(scaleId, root, k) {
  const S = SCALES[scaleId], k2 = k % 5 + 1;
  return finish(scaleId, root, place(S, root, k, 3), {
    id: 'J' + k, kind: 'join', num: k, name: `Join ${k}–${k2}`, short: `J${k}`, start: IV_LABEL[S.pent[k - 1]], to: k2,
  });
}
export const SHAPE_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'J1', 'J2', 'J3', 'J4', 'J5'];
export const BOX_IDS = SHAPE_IDS.slice(0, 5), JOIN_IDS = SHAPE_IDS.slice(5);
export const shapeById = (scaleId, root, id) =>
  (id[0] === 'J' ? joinShape : boxShape)(scaleId, root, Number(id.slice(1)));
export const shapeName = id => id[0] === 'J' ? `Join ${id[1]}–${Number(id[1]) % 5 + 1}` : `Position ${id[1]}`;
// One family (boxes or joins), in NECK order. Sorting reorders; it never renames.
export function getShapes(scaleId, root, kind = 'box') {
  const ids = kind === 'join' ? JOIN_IDS : BOX_IDS;
  return ids.map(id => shapeById(scaleId, root, id)).sort((a, b) => a.lo - b.lo || a.num - b.num);
}
export const pentOf = sh => sh.cells.filter(c => !c.blue);
export const winOf = sh => ({ lo: sh.lo, hi: sh.hi });

// Every blues-scale note across the neck, for the full-neck view.
export function fullNeck(scaleId, root, lo = 0, hi = 15) {
  const S = SCALES[scaleId], pcs = scalePcs(S.iv, root), cells = [];
  for (let s = 0; s < 6; s++) for (let f = lo; f <= hi; f++) {
    const p = pc(midiAt(s, f));
    if (pcs.has(p)) cells.push({ s, f, deg: degOf(p, root), blue: p === pc(root + S.blue) });
  }
  return cells;
}

// One octave of a shape: its lowest root up to the next one. A box played end
// to end starts and ends on arbitrary degrees; root to root is the honest unit.
export function rootSpan(sh) {
  const roots = [...new Set(sh.cells.filter(c => c.deg === 'R').map(c => midiAt(c.s, c.f)))].sort((a, b) => a - b);
  if (roots.length < 2) return [];
  return sh.cells.filter(c => { const m = midiAt(c.s, c.f); return m >= roots[0] && m <= roots[1]; });
}

// ── Comparison ───────────────────────────────────────────────────────────
// Blues against another scale with the SAME root, inside one shape's frets:
//   shared — blues notes the other scale also has
//   only   — blues notes it does not (the blue note is always one of them)
//   extra  — the other scale's notes that blues lacks, at every fret in the
//            shape's span. Same window rule as the shapes themselves, so the
//            picture is "this scale, in these frets" for both.
export function compareIn(sh, targetId) {
  const T = COMPARE[targetId], tp = scalePcs(T.iv, sh.root), bp = scalePcs(SCALES[sh.scale].iv, sh.root);
  const shared = [], only = [], extra = [];
  for (const c of sh.cells) (tp.has(pc(midiAt(c.s, c.f))) ? shared : only).push(c);
  for (let s = 0; s < 6; s++) for (let f = sh.lo; f <= sh.hi; f++) {
    const p = pc(midiAt(s, f));
    if (tp.has(p) && !bp.has(p)) extra.push({ s, f, deg: degOf(p, sh.root) });
  }
  return { shared, only, extra };
}
// The same comparison as interval lists, for the spelled-out summary.
export function compareDegrees(scaleId, targetId) {
  const b = SCALES[scaleId].iv, t = COMPARE[targetId].iv;
  return {
    shared: b.filter(i => t.includes(i)),
    only: b.filter(i => !t.includes(i)),
    extra: t.filter(i => !b.includes(i)),
  };
}

// ── 12-bar ───────────────────────────────────────────────────────────────
// The standard 12-bar with a V turnaround: I I I I | IV IV I I | V IV I V.
// Chords are dominant 7ths on I, IV and V of the scale root.
export const BARS = ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'];
export const CHORD_OFFSET = { I: 0, IV: 5, V: 7 };
export const DOM7 = [0, 4, 7, 10];
const CHORD_DEG = { 0: 'R', 4: '3', 7: '5', 10: 'b7' };
// Over a dominant 7: the four chord tones are where to land; the six tensions
// colour it; the 4th and the major 7th rub against the 3rd and the b7 — pass
// through them or bend off them, do not sit on them.
const COLOUR = { 1: 'b9', 2: '9', 3: '#9', 6: '#11', 8: 'b13', 9: '13' };
const RUB = { 5: '11', 11: '7' };
export const chordPcs = (root, chord) => DOM7.map(i => pc(root + CHORD_OFFSET[chord] + i));
export const chordName = (root, chord) => KEY_NAMES[pc(root + CHORD_OFFSET[chord])] + '7';
export function roleOver(root, chord, notePc) {
  const iv = pc(notePc - root - CHORD_OFFSET[chord]);
  if (iv in CHORD_DEG) return { role: 'chord', label: CHORD_DEG[iv] };
  if (iv in COLOUR) return { role: 'colour', label: COLOUR[iv] };
  return { role: 'rub', label: RUB[iv] };
}
// Where the blue note goes over a chord: each half-step neighbour that is in
// the scale AND a tone of the chord. Minor: b5 → 4 or 5. Major: b3 → 2 or 3.
// Over some chords the blue note is itself a chord tone — major blues' b3 is
// the b7 of the IV7 — and then the honest answer is "sit on it".
export function blueResolution(scaleId, root, chord) {
  const S = SCALES[scaleId], b = pc(root + S.blue);
  const chord_ = new Set(chordPcs(root, chord)), scale = scalePcs(S.iv, root);
  if (chord_.has(b)) return { isChordTone: true, role: roleOver(root, chord, b), targets: [] };
  const targets = [-1, 1]
    .map(dir => ({ dir, pc: pc(b + dir) }))
    .filter(t => scale.has(t.pc) && chord_.has(t.pc))
    .map(t => ({ ...t, deg: degOf(t.pc, root), chordDeg: roleOver(root, chord, t.pc).label }));
  return { isChordTone: false, role: roleOver(root, chord, b), targets };
}

// ── Practice drills ──────────────────────────────────────────────────────
// Three families. Every one is answered by selecting the COMPLETE set and
// pressing Check, graded exactly — the rule Altered Trainer learned the hard
// way: accepting any one right cell lets the one you already knew pass forever.
//
// Drawn-shape drills use the shape's own frets as the window. Because a shape
// is exactly the blues notes inside its frets, every right-pitch note on screen
// IS in the answer — there are no "right note, wrong place" traps.
//
// Blank-neck drills (BLANK) draw an empty 8-fret window with the box pushed a
// random 0-3 frets in, so the framing does not give away where it sits. They
// exist for boxes only: a join spans six or seven frets, which would push the
// window past the 44px touch minimum on a phone.
export const DRILLS = ['root', 'bluespot', 'blueadd', 'fill', 'tonat', 'cross', 'octave', 'build', 'blueblank'];
export const BLANK = new Set(['octave', 'build', 'blueblank']);
// What the KEY changes. A drawn shape's picture is identical in all twelve
// keys, so only the blank-neck drills count toward key coverage.
export const KEY_DRILLS = new Set(['octave', 'build', 'blueblank']);
export const DEFAULT_DRILLS = ['root', 'bluespot', 'blueadd', 'fill', 'tonat', 'octave', 'build'];
// The parallel scale each comparison drill turns the shape into.
export const MORPH = {
  tonat: { min: 'natmin', maj: 'major' },
  cross: { min: 'majpent', maj: 'minpent' },
};
export const DRILL_FAMILY = {
  root: 'shape', fill: 'shape', octave: 'shape', build: 'shape',
  bluespot: 'blue', blueadd: 'blue', blueblank: 'blue',
  tonat: 'compare', cross: 'compare',
};
export const drillAppliesTo = (drill, shapeId) => !(BLANK.has(drill) && shapeId[0] === 'J');

export const WIN_W = 8;
export const blankWin = (sh, k = 0) => { const lo = Math.max(0, sh.lo - Math.min(k, sh.lo)); return { lo, hi: lo + WIN_W - 1 }; };

// Which dots `fill` takes away. Seeded, so the question cannot reshuffle while
// you are answering it. Copied from Altered Trainer.
export const FILL_BLANKS = 5;
export function blanksFor(sh, n, seed) {
  const idx = sh.cells.map((_, i) => i);
  let x = seed >>> 0;
  for (let i = idx.length - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) >>> 0; const j = x % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, Math.min(n, sh.cells.length)).map(i => sh.cells[i]);
}

// What a drill draws, the window it draws it in, and the exact answer.
//   shown   — cells drawn (mono in the app)
//   win     — the window; the board and the answer MUST share it
//   ok      — Set of "s_f" that make up the complete answer
//   remove  — for the comparison drills, the part of `ok` that is on a dot
export function drillSpec(drill, sh, { off = 0, seed = 1 } = {}) {
  const keys = cs => new Set(cs.map(c => ckey(c.s, c.f)));
  if (BLANK.has(drill)) {
    const win = blankWin(sh, Math.min(off, sh.lo));
    const ok = drill === 'build' ? keys(sh.cells) : drill === 'octave' ? keys(rootSpan(sh)) : keys(sh.cells.filter(c => c.blue));
    return { shown: [], win, ok, remove: new Set() };
  }
  const win = winOf(sh);
  if (drill === 'root') return { shown: sh.cells, win, ok: keys(sh.cells.filter(c => c.deg === 'R')), remove: new Set() };
  if (drill === 'bluespot') return { shown: sh.cells, win, ok: keys(sh.cells.filter(c => c.blue)), remove: new Set() };
  if (drill === 'blueadd') return { shown: pentOf(sh), win, ok: keys(sh.cells.filter(c => c.blue)), remove: new Set() };
  if (drill === 'fill') {
    const blanks = blanksFor(sh, FILL_BLANKS, seed), bk = keys(blanks);
    return { shown: sh.cells.filter(c => !bk.has(ckey(c.s, c.f))), win, ok: bk, remove: new Set() };
  }
  // tonat / cross: remove the blues notes the target lacks, add the target's
  // notes blues lacks — everywhere in the shape's frets.
  const { only, extra } = compareIn(sh, MORPH[drill][sh.scale]);
  const remove = keys(only);
  return { shown: sh.cells, win, ok: new Set([...remove, ...keys(extra)]), remove, target: MORPH[drill][sh.scale] };
}
