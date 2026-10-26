// Correctness gate for the Blues Scale Trainer.
//
//   node scripts/verify.mjs
//
// Toolbox rule: anything touching frets, degrees or resolutions is re-derived
// from first principles. This script DOES import the app's functions — that is
// what it is testing — but it never uses them to produce an expectation. Every
// expected value below comes from somewhere else:
//   * the tuning, from pitch names (E2 A2 D3 G3 B3 E4);
//   * the scales, from their degree formulas against the major scale;
//   * the boxes, from the standard published A-minor-blues chart, typed in
//     below string by string and transposed by hand arithmetic;
//   * everything else, from those three.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as T from '../src/theory.js';
import * as R from '../src/srs.js';

let failures = 0, assertions = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};
const fail = m => { throw new Error(m); };
const eq = (got, want, what) => { assertions++; if (got !== want) fail(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };
const ok = (cond, what) => { assertions++; if (!cond) fail(what); };
const setEq = (a, b, what) => {
  const A = [...a].sort(), B = [...b].sort();
  eq(A.join(' '), B.join(' '), what);
};

// ── First principles ─────────────────────────────────────────────────────
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = name => { const m = name.match(/^([A-G])([#b]?)(\d)$/); return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const TUNING = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map(midiOf);
const mod = n => ((n % 12) + 12) % 12;
const at = (s, f) => TUNING[s] + f;
// Degree formula → semitones, measured against the major scale.
const MAJOR = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
const semis = d => { const m = String(d).match(/^([b#]?)(\d)$/); return MAJOR[m[2]] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0); };
const FORMULA = {
  min: ['1', 'b3', '4', 'b5', '5', 'b7'],
  maj: ['1', '2', 'b3', '3', '5', '6'],
  minpent: ['1', 'b3', '4', '5', 'b7'],
  majpent: ['1', '2', '3', '5', '6'],
  natmin: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
  major: ['1', '2', '3', '4', '5', '6', '7'],
};
const IVS = Object.fromEntries(Object.entries(FORMULA).map(([k, v]) => [k, v.map(semis)]));
const pcsOf = (id, root) => new Set(IVS[id].map(i => mod(root + i)));
const BLUE = { min: semis('b5'), maj: semis('b3') };
const PENT = { min: 'minpent', maj: 'majpent' };
const keysOf = cells => cells.map(c => `${c.s}_${c.f}`);

// ── The chart ────────────────────────────────────────────────────────────
// A minor blues, the five boxes as published (low E first). They include the
// usual stretches — fret 11 on both E strings in box 2, fret 16 on the B string
// in box 4. Box 5 is written at the 3rd fret: the same box as at the 15th,
// placed as low as it goes, so the B-string stretch reads 3-4-5.
const CHART_A = {
  1: [[5, 8], [5, 6, 7], [5, 7], [5, 7, 8], [5, 8], [5, 8]],
  2: [[8, 10, 11], [7, 10], [7, 10], [7, 8, 9], [8, 10], [8, 10, 11]],
  3: [[10, 11, 12], [10, 12], [10, 12, 13], [9, 12], [10, 13], [10, 11, 12]],
  4: [[12, 15], [12, 15], [12, 13, 14], [12, 14], [13, 15, 16], [12, 15]],
  5: [[3, 5], [3, 5, 6], [2, 5], [2, 5], [3, 4, 5], [3, 5]],
};
const A = 9;
// Transpose a chart box to another minor root: shift every fret by the
// interval, put the box's low-E starting note (its lowest low-E note that is
// not the blue note) in 0..11, and if anything then dips below the nut, move
// the whole box up an octave.
function transpose(chart, minorRoot) {
  const d = mod(minorRoot - A);
  const cells = chart.flatMap((frets, s) => frets.map(f => ({ s, f: f + d })));
  const bluePc = mod(minorRoot + BLUE.min);
  const lowE = Math.min(...cells.filter(c => c.s === 0 && mod(at(0, c.f)) !== bluePc).map(c => c.f));
  let shift = 0;
  while (lowE + shift >= 12) shift -= 12;
  if (Math.min(...cells.map(c => c.f)) + shift < 0) shift += 12;
  return cells.map(c => ({ s: c.s, f: c.f + shift }));
}
// Major blues of root R has exactly the notes of minor blues of its relative
// minor (R - 3), and its Position k starts on the major pentatonic's k-th note,
// which is the relative minor pentatonic's (k+1)-th. So major Position k in R
// is chart box (k mod 5)+1, transposed to R - 3.
const expected = (scaleId, root, k) => scaleId === 'min'
  ? transpose(CHART_A[k], root)
  : transpose(CHART_A[k % 5 + 1], mod(root - 3));

const SC = ['min', 'maj'];
const K = [1, 2, 3, 4, 5];
const KEYS = [...Array(12).keys()];

console.log('\nFirst principles');
check('standard tuning from pitch names', () => {
  T.OPEN_MIDI.forEach((m, s) => eq(m, TUNING[s], `string ${s}`));
});
check('both blues scales match their degree formulas', () => {
  for (const id of SC) setEq(T.SCALES[id].iv.map(String), IVS[id].map(String), id);
  for (const id of SC) setEq(T.SCALES[id].pent.map(String), IVS[PENT[id]].map(String), `${id} pentatonic`);
  eq(T.SCALES.min.blue, semis('b5'), 'minor blue note is the b5');
  eq(T.SCALES.maj.blue, semis('b3'), 'major blue note is the b3');
});
check('each blues scale is its pentatonic plus exactly one note — the blue note', () => {
  for (const id of SC) {
    const extra = IVS[id].filter(i => !IVS[PENT[id]].includes(i));
    eq(extra.length, 1, `${id} adds one note`);
    eq(extra[0], BLUE[id], `${id}: the added note is the blue note`);
  }
});
check('the comparison scales match their formulas', () => {
  for (const id of T.COMPARE_IDS) setEq(T.COMPARE[id].iv.map(String), IVS[id].map(String), id);
});
check('major blues has exactly the notes of the minor blues a minor 3rd below', () => {
  for (const r of KEYS) setEq([...pcsOf('maj', r)].map(String), [...pcsOf('min', mod(r - 3))].map(String), `key ${r}`);
});
check('every key spells all six notes with the right pitch, no letter used for two degrees a 2nd apart', () => {
  const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pitch = n => mod(NAT[n[0]] + (n.includes('♯') ? 1 : 0) - (n.includes('♭') ? 1 : 0));
  for (const id of SC) for (const r of KEYS) for (const iv of IVS[id]) eq(pitch(T.spell(r, iv)), mod(r + iv), `${id} ${r} +${iv}`);
  for (const id of T.COMPARE_IDS) for (const r of KEYS) for (const iv of IVS[id]) eq(pitch(T.spell(r, iv)), mod(r + iv), `${id} ${r} +${iv}`);
  // The worked examples everyone checks first.
  eq(['min', 'maj'].map(id => IVS[id].map(i => T.spell(9, i)).join(' ')).join(' | '),
    'A C D E♭ E G | A B C C♯ E F♯', 'A minor and A major blues');
  eq(IVS.min.map(i => T.spell(0, i)).join(' '), 'C E♭ F G♭ G B♭', 'C minor blues (b5 is G♭, not F♯)');
  eq(IVS.min.map(i => T.spell(4, i)).join(' '), 'E G A B♭ B D', 'E minor blues');
});

console.log('\nThe five boxes');
check('every box in every key matches the published chart, note for note', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const sh = T.boxShape(id, r, k);
    setEq(keysOf(sh.cells), keysOf(expected(id, r, k)), `${id} key ${r} Position ${k}`);
  }
});
check('every note is in the scale, labelled with its true degree, and flagged blue iff it is the blue note', () => {
  for (const id of SC) for (const r of KEYS) for (const sh of [...K.map(k => T.boxShape(id, r, k)), ...K.map(k => T.joinShape(id, r, k))]) {
    for (const c of sh.cells) {
      const p = mod(at(c.s, c.f));
      ok(pcsOf(id, r).has(p), `${id} ${r} ${sh.id}: ${c.s}/${c.f} is not in the scale`);
      eq(semis(c.deg === 'R' ? '1' : c.deg), mod(p - r), `${id} ${r} ${sh.id} ${c.s}/${c.f} degree`);
      eq(c.blue, p === mod(r + BLUE[id]), `${id} ${r} ${sh.id} ${c.s}/${c.f} blue flag`);
      ok(c.f >= 0 && c.f <= 22, `${sh.id} fret ${c.f} on the neck`);
    }
  }
});
check('a box is EXACTLY the blues notes inside its frets — nothing missing, nothing outside', () => {
  for (const id of SC) for (const r of KEYS) for (const sh of [...K.map(k => T.boxShape(id, r, k)), ...K.map(k => T.joinShape(id, r, k))]) {
    const want = [];
    for (let s = 0; s < 6; s++) for (let f = sh.lo; f <= sh.hi; f++) if (pcsOf(id, r).has(mod(at(s, f)))) want.push(`${s}_${f}`);
    setEq(keysOf(sh.cells), want, `${id} ${r} ${sh.id}`);
  }
});
check('the blue note sits one fret above every 4 (minor) / every 2 (major), same string — and nowhere else', () => {
  const beside = { min: semis('4'), maj: semis('2') };
  for (const id of SC) for (const r of KEYS) for (const sh of [...K.map(k => T.boxShape(id, r, k)), ...K.map(k => T.joinShape(id, r, k))]) {
    const want = sh.cells.filter(c => mod(at(c.s, c.f)) === mod(r + beside[id])).map(c => `${c.s}_${c.f + 1}`);
    setEq(keysOf(sh.cells.filter(c => c.blue)), want, `${id} ${r} ${sh.id}`);
  }
});
check('without its blue notes a box is the plain pentatonic box: two notes a string, rising', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const sh = T.boxShape(id, r, k);
    const pent = sh.cells.filter(c => !c.blue);
    for (let s = 0; s < 6; s++) eq(pent.filter(c => c.s === s).length, 2, `${id} ${r} P${k} string ${s}`);
    const pitches = [...pent].sort((a, b) => a.s - b.s || a.f - b.f).map(c => at(c.s, c.f));
    for (let i = 1; i < pitches.length; i++) ok(pitches[i] > pitches[i - 1], `${id} ${r} P${k}: pentatonic notes rise string to string`);
    for (const c of pent) ok(pcsOf(PENT[id], r).has(mod(at(c.s, c.f))), `${id} ${r} P${k}: pentatonic part`);
  }
});
check('Position k starts on the k-th pentatonic note, on the low E', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const sh = T.boxShape(id, r, k);
    const lowE = Math.min(...sh.cells.filter(c => c.s === 0 && !c.blue).map(c => c.f));
    eq(mod(at(0, lowE) - r), IVS[PENT[id]][k - 1], `${id} ${r} P${k} start`);
  }
});
check('a position is the same picture in all twelve keys (the numbering invariant)', () => {
  const pic = sh => sh.cells.map(c => `${c.s}:${c.f - sh.lo}:${c.deg}:${c.blue}`).sort().join(' ');
  for (const id of SC) for (const k of K) {
    const ref = pic(T.boxShape(id, 0, k)), refJ = pic(T.joinShape(id, 0, k));
    for (const r of KEYS) { eq(pic(T.boxShape(id, r, k)), ref, `${id} P${k} key ${r}`); eq(pic(T.joinShape(id, r, k)), refJ, `${id} J${k} key ${r}`); }
  }
});
check('every box sits as low as it can: no fret below 0, and moving it down an octave would break that', () => {
  for (const id of SC) for (const r of KEYS) for (const sh of [...K.map(k => T.boxShape(id, r, k)), ...K.map(k => T.joinShape(id, r, k))]) {
    ok(sh.lo >= 0, `${sh.id} lo`);
    ok(sh.lo - 12 < 0, `${id} ${r} ${sh.id} could sit an octave lower`);
  }
});
check('E minor box 1 is the open-position E minor pentatonic + blue notes', () => {
  setEq(keysOf(T.boxShape('min', 4, 1).cells),
    ['0_0', '0_3', '1_0', '1_1', '1_2', '2_0', '2_2', '3_0', '3_2', '3_3', '4_0', '4_3', '5_0', '5_3'], 'E minor P1');
});
check('getShapes returns the five in neck order without renaming them', () => {
  for (const id of SC) for (const r of KEYS) for (const kind of ['box', 'join']) {
    const list = T.getShapes(id, r, kind);
    setEq(list.map(s => s.num).map(String), ['1', '2', '3', '4', '5'], 'all five present');
    for (let i = 1; i < list.length; i++) ok(list[i].lo >= list[i - 1].lo, `${id} ${r} ${kind} neck order`);
    for (const sh of list) eq(sh.id, (kind === 'join' ? 'J' : 'P') + sh.num, 'id follows the number');
  }
});
check('A minor blues box 1 is the one everyone learns first', () => {
  const sh = T.boxShape('min', 9, 1);
  eq(sh.lo, 5, 'lo'); eq(sh.hi, 8, 'hi');
  setEq(keysOf(sh.cells.filter(c => c.blue)), ['1_6', '3_8'], 'blue notes at A6 and G8');
});

console.log('\nThe joins');
check('Join k is box k and box k+1 together, in every key', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const j = T.joinShape(id, r, k), a = T.boxShape(id, r, k), b = T.boxShape(id, r, k % 5 + 1);
    // box k+1 directly above box k: same picture, shifted so it starts on the
    // next pentatonic note up the low E.
    const aStart = Math.min(...a.cells.filter(c => c.s === 0 && !c.blue).map(c => c.f));
    const next = IVS[PENT[id]][k % 5];
    let bStart = aStart + 1; while (mod(at(0, bStart) - r) !== next) bStart++;
    const bLow = Math.min(...b.cells.filter(c => c.s === 0 && !c.blue).map(c => c.f));
    const bUp = b.cells.map(c => ({ s: c.s, f: c.f + (bStart - bLow) }));
    const shiftA = Math.min(...j.cells.filter(c => c.s === 0 && !c.blue).map(c => c.f)) - aStart;
    const want = new Set([...a.cells, ...bUp].map(c => `${c.s}_${c.f + shiftA}`));
    setEq(keysOf(j.cells), [...want], `${id} ${r} J${k}`);
  }
});
check('a join is three pentatonic notes on every string', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const j = T.joinShape(id, r, k);
    for (let s = 0; s < 6; s++) eq(j.cells.filter(c => c.s === s && !c.blue).length, 3, `${id} ${r} J${k} string ${s}`);
  }
});
check('A minor Join 1–2 is frets 5–11, three a string plus four blue notes', () => {
  const j = T.joinShape('min', 9, 1);
  eq(j.lo, 5, 'lo'); eq(j.hi, 11, 'hi');
  setEq(keysOf(j.cells.filter(c => !c.blue)),
    ['0_5', '0_8', '0_10', '1_5', '1_7', '1_10', '2_5', '2_7', '2_10', '3_5', '3_7', '3_9', '4_5', '4_8', '4_10', '5_5', '5_8', '5_10'], 'pentatonic part');
  setEq(keysOf(j.cells.filter(c => c.blue)), ['0_11', '1_6', '3_8', '5_11'], 'blue notes');
});

console.log('\nComparison');
check('shared / blues-only / the other scale’s extra notes, in every shape, key and target', () => {
  for (const id of SC) for (const r of KEYS) for (const sh of [...K.map(k => T.boxShape(id, r, k)), ...K.map(k => T.joinShape(id, r, k))]) for (const t of T.COMPARE_IDS) {
    const c = T.compareIn(sh, t), tp = pcsOf(t, r), bp = pcsOf(id, r);
    setEq(keysOf(c.shared), keysOf(sh.cells.filter(x => tp.has(mod(at(x.s, x.f))))), `${id} ${r} ${sh.id} vs ${t}: shared`);
    setEq(keysOf(c.only), keysOf(sh.cells.filter(x => !tp.has(mod(at(x.s, x.f))))), `only`);
    const extra = [];
    for (let s = 0; s < 6; s++) for (let f = sh.lo; f <= sh.hi; f++) { const p = mod(at(s, f)); if (tp.has(p) && !bp.has(p)) extra.push(`${s}_${f}`); }
    setEq(keysOf(c.extra), extra, `extra`);
    for (const x of c.extra) eq(semis(x.deg === 'R' ? '1' : x.deg), mod(at(x.s, x.f) - r), 'extra degree label');
    ok(c.only.every(x => !c.extra.some(y => y.s === x.s && y.f === x.f)), 'no cell is both');
  }
});
check('against its own pentatonic, the ONLY difference is the blue note', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const sh = T.boxShape(id, r, k), c = T.compareIn(sh, PENT[id]);
    eq(c.extra.length, 0, `${id} ${r} P${k}: the pentatonic adds nothing`);
    ok(c.only.length > 0 && c.only.every(x => x.blue), `${id} ${r} P${k}: blues-only is the blue notes`);
  }
});
check('the spelled-out differences', () => {
  const d = (a, b) => { const x = T.compareDegrees(a, b); return ['shared', 'only', 'extra'].map(k => x[k].map(i => T.IV_LABEL[i]).join(' ')).join(' | '); };
  eq(d('min', 'natmin'), 'R b3 4 5 b7 | b5 | 2 b6', 'minor blues vs natural minor');
  eq(d('min', 'major'), 'R 4 5 | b3 b5 b7 | 2 3 6 7', 'minor blues vs major');
  eq(d('min', 'majpent'), 'R 5 | b3 4 b5 b7 | 2 3 6', 'minor blues vs major pentatonic');
  eq(d('maj', 'major'), 'R 2 3 5 6 | b3 | 4 7', 'major blues vs major');
  eq(d('maj', 'minpent'), 'R b3 5 | 2 3 6 | 4 b7', 'major blues vs minor pentatonic');
});
check('worked example: A minor box 1 vs natural minor', () => {
  const c = T.compareIn(T.boxShape('min', 9, 1), 'natmin');
  setEq(keysOf(c.only), ['1_6', '3_8'], 'remove the two E♭s');
  setEq(keysOf(c.extra), ['0_7', '5_7', '1_8', '4_6'], 'add B on both E strings, F on A and B');
});

console.log('\n12-bar');
check('the form is I I I I | IV IV I I | V IV I V', () => eq(T.BARS.join(' '), 'I I I I IV IV I I V IV I V', 'bars'));
check('I7, IV7 and V7 are dominant 7ths on the 1st, 4th and 5th of the key', () => {
  for (const r of KEYS) for (const [ch, deg] of [['I', '1'], ['IV', '4'], ['V', '5']]) {
    const cr = mod(r + semis(deg));
    setEq(T.chordPcs(r, ch).map(String), ['1', '3', '5', 'b7'].map(d => String(mod(cr + semis(d)))), `${r} ${ch}`);
  }
  eq(T.chordName(9, 'IV'), 'D7', 'A: IV7 is D7');
});
check('every note gets one role over every chord, by its interval above the chord root', () => {
  const ROLE = { 0: 'chord', 4: 'chord', 7: 'chord', 10: 'chord', 1: 'colour', 2: 'colour', 3: 'colour', 6: 'colour', 8: 'colour', 9: 'colour', 5: 'rub', 11: 'rub' };
  for (const r of KEYS) for (const ch of ['I', 'IV', 'V']) for (let p = 0; p < 12; p++)
    eq(T.roleOver(r, ch, p).role, ROLE[mod(p - r - T.CHORD_OFFSET[ch])], `${r} ${ch} pc ${p}`);
});
check('A minor blues over A7 / D7 / E7 — every note’s role, by hand', () => {
  const row = ch => ['A', 'C', 'D', 'Eb', 'E', 'G'].map(n => { const x = T.roleOver(9, ch, midiOf(n + '4')); return `${x.role[0]}${x.label}`; }).join(' ');
  eq(row('I'), 'cR c#9 r11 c#11 c5 cb7', 'over A7');      // c = chord or colour; r = rub
  eq(row('IV'), 'c5 cb7 cR cb9 c9 r11', 'over D7');
  eq(row('V'), 'r11 cb13 cb7 r7 cR c#9', 'over E7');
});
check('where the blue note resolves — the worked examples', () => {
  const res = (id, r, ch) => { const x = T.blueResolution(id, r, ch); return x.isChordTone ? `sit (${x.role.label})` : x.targets.map(t => `${t.dir < 0 ? 'down' : 'up'} ${t.deg}=${t.chordDeg}`).join(' + '); };
  eq(res('min', 9, 'I'), 'up 5=5', 'A minor, over A7: E♭ up to E, the 5th');
  eq(res('min', 9, 'IV'), 'down 4=R', 'over D7: E♭ down to D, the root');
  eq(res('min', 9, 'V'), 'down 4=b7 + up 5=R', 'over E7: either way');
  eq(res('maj', 9, 'I'), 'up 3=3', 'A major, over A7: C up to C♯, the 3rd');
  eq(res('maj', 9, 'IV'), 'sit (b7)', 'over D7 the blue note IS the b7');
  eq(res('maj', 9, 'V'), 'down 2=5', 'over E7: C down to B, the 5th');
});
check('the blue note always has a landing place or is one, in every key', () => {
  for (const id of SC) for (const r of KEYS) for (const ch of ['I', 'IV', 'V']) {
    const x = T.blueResolution(id, r, ch);
    ok(x.isChordTone || x.targets.length > 0, `${id} ${r} ${ch}`);
    for (const t of x.targets) { ok(pcsOf(id, r).has(t.pc), 'target in scale'); ok(T.chordPcs(r, ch).includes(t.pc), 'target in chord'); eq(Math.abs(t.dir), 1, 'half step'); }
  }
});

console.log('\nDrills');
const shapesAll = (id, r) => [...K.map(k => T.boxShape(id, r, k)), ...K.map(k => T.joinShape(id, r, k))];
check('drawn drills: the window is the shape’s own frets, and every answer is inside it', () => {
  for (const id of SC) for (const r of KEYS) for (const sh of shapesAll(id, r)) for (const d of T.DRILLS) {
    if (!T.drillAppliesTo(d, sh.id)) continue;
    const spec = T.drillSpec(d, sh, { off: 2, seed: 99 });
    for (const k of spec.ok) { const [s, f] = k.split('_').map(Number); ok(f >= spec.win.lo && f <= spec.win.hi && s >= 0 && s < 6, `${d} ${sh.id}: answer ${k} off screen`); }
    ok(spec.ok.size > 0, `${id} ${r} ${sh.id} ${d}: nothing to find`);
    if (!T.BLANK.has(d)) { eq(spec.win.lo, sh.lo, 'drawn lo'); eq(spec.win.hi, sh.hi, 'drawn hi'); }
  }
});
check('each drill’s answer, re-derived', () => {
  for (const id of SC) for (const r of KEYS) for (const sh of shapesAll(id, r)) {
    const spec = d => T.drillSpec(d, sh, { off: 1, seed: 7 });
    const roots = sh.cells.filter(c => mod(at(c.s, c.f)) === r);
    const blues = sh.cells.filter(c => mod(at(c.s, c.f)) === mod(r + BLUE[id]));
    setEq([...spec('root').ok], keysOf(roots), `${sh.id} root`);
    setEq([...spec('bluespot').ok], keysOf(blues), `${sh.id} bluespot`);
    setEq([...spec('blueadd').ok], keysOf(blues), `${sh.id} blueadd`);
    // blueadd draws the pentatonic box: the shape with exactly its blue notes gone.
    setEq(keysOf(spec('blueadd').shown), keysOf(sh.cells.filter(c => !blues.includes(c))), `${sh.id} blueadd shows the pentatonic`);
    const fill = spec('fill');
    eq(fill.ok.size, Math.min(T.FILL_BLANKS, sh.cells.length), 'fill blank count');
    eq(fill.shown.length + fill.ok.size, sh.cells.length, 'fill: shown + blanks = shape');
    setEq(keysOf(fill.shown).concat([...fill.ok]), keysOf(sh.cells), 'fill partitions the shape');
    setEq([...T.drillSpec('fill', sh, { seed: 7 }).ok], [...fill.ok], 'fill blanks are fixed by the seed');
    for (const d of ['tonat', 'cross']) {
      const t = T.MORPH[d][id], s = spec(d), tp = pcsOf(t, r), bp = pcsOf(id, r);
      const rm = sh.cells.filter(c => !tp.has(mod(at(c.s, c.f))));
      const add = [];
      for (let st = 0; st < 6; st++) for (let f = sh.lo; f <= sh.hi; f++) { const p = mod(at(st, f)); if (tp.has(p) && !bp.has(p)) add.push(`${st}_${f}`); }
      setEq([...s.ok], [...keysOf(rm), ...add], `${id} ${r} ${sh.id} ${d}`);
      setEq([...s.remove], keysOf(rm), `${d} remove part`);
      // After the morph, the shape's frets hold exactly the target scale.
      const after = new Set([...keysOf(sh.cells).filter(k => !s.remove.has(k)), ...add]);
      const want = []; for (let st = 0; st < 6; st++) for (let f = sh.lo; f <= sh.hi; f++) if (tp.has(mod(at(st, f)))) want.push(`${st}_${f}`);
      setEq([...after], want, `${id} ${r} ${sh.id} ${d}: result is the ${t} scale in these frets`);
    }
  }
  ok(T.MORPH.tonat.min === 'natmin' && T.MORPH.tonat.maj === 'major', 'tonat targets');
  ok(T.MORPH.cross.min === 'majpent' && T.MORPH.cross.maj === 'minpent', 'cross targets');
});
check('blank-neck drills: boxes only, an 8-fret window that holds the whole box, offset 0–3', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const sh = T.boxShape(id, r, k);
    for (let off = 0; off <= 3; off++) for (const d of ['build', 'octave', 'blueblank']) {
      const s = T.drillSpec(d, sh, { off });
      eq(s.shown.length, 0, 'blank neck');
      eq(s.win.hi - s.win.lo + 1, 8, 'eight frets');
      ok(s.win.lo <= sh.lo && s.win.hi >= sh.hi, `${id} ${r} P${k} off ${off}: box inside the window`);
      eq(sh.lo - s.win.lo, Math.min(off, sh.lo), 'offset');
    }
    setEq([...T.drillSpec('build', sh).ok], keysOf(sh.cells), 'build = the whole box');
    setEq([...T.drillSpec('blueblank', sh).ok], keysOf(sh.cells.filter(c => c.blue)), 'blueblank = its blue notes');
  }
  for (const d of T.BLANK) for (const j of T.JOIN_IDS) eq(T.drillAppliesTo(d, j), false, `${d} not on ${j}`);
  for (const d of T.DRILLS) if (!T.BLANK.has(d)) for (const j of T.SHAPE_IDS) eq(T.drillAppliesTo(d, j), true, `${d} on ${j}`);
});
check('root to root: one octave, seven notes, every pitch once', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const span = T.rootSpan(T.boxShape(id, r, k)), ps = span.map(c => at(c.s, c.f));
    eq(new Set(ps).size, ps.length, `${id} ${r} P${k}: no pitch twice`);
    eq(ps.length, 7, `${id} ${r} P${k}: R + six notes up to R`);
    eq(Math.max(...ps) - Math.min(...ps), 12, 'exactly an octave');
    setEq([...new Set(ps.map(p => mod(p)))].map(String), [...pcsOf(id, r)].map(String), 'every scale note once');
  }
});
check('a box never holds the same pitch twice (so "every X" is unambiguous)', () => {
  for (const id of SC) for (const r of KEYS) for (const k of K) {
    const ps = T.boxShape(id, r, k).cells.map(c => at(c.s, c.f));
    eq(new Set(ps).size, ps.length, `${id} ${r} P${k}`);
  }
});

console.log('\nSpaced repetition');
check('SM-2 is the toolbox’s, verbatim behaviour', () => {
  let c = R.updateSRS(undefined, true); eq(c.reps, 1, 'r1'); eq(c.interval, 1, 'i1');
  c = R.updateSRS(c, true); eq(c.interval, 6, 'second correct = 6 days');
  c = R.updateSRS(c, true); eq(c.interval, Math.round(6 * 2.5), 'then x ease');
  c = R.updateSRS(c, false); eq(c.reps, 0, 'miss resets'); eq(c.interval, 1, 'miss = tomorrow'); eq(c.ef, 2.3, 'ease drops');
});
check('cards: boxes carry every drill, joins never a blank-neck one, ids carry the scale', () => {
  const cards = R.buildCards('min', T.DRILLS);
  eq(cards.length, 5 * 9 + 5 * 6, '75 minor cards with all nine drills');
  ok(cards.every(c => c.id === `min|${c.shape}|${c.drill}`), 'ids');
  ok(!cards.some(c => c.shape[0] === 'J' && T.BLANK.has(c.drill)), 'no blank drill on a join');
  eq(R.buildCards('maj', ['root']).length, 10, 'one drill = ten shapes');
});
check('due-only sessions are exactly the due cards; a narrow pool is not padded to the session length', () => {
  const td = R.todayStr();
  const cards = R.buildCards('min', ['root', 'fill']);
  const srs = { [cards[0].id]: { ef: 2.5, interval: 1, reps: 1, nextDue: td }, [cards[1].id]: { ef: 2.5, interval: 1, reps: 1, nextDue: td } };
  eq(R.buildQueue(cards, srs, 12, () => 0, { dueOnly: true }).length, 2, 'due only');
  eq(R.buildQueue(cards.slice(0, 1), {}, 12, () => 0).length, R.READY_REPS, 'one card = three reps');
  eq(R.buildQueue(cards, {}, 12, () => 0).length, 12, 'a full pool fills the session');
  const q = R.buildQueue(cards, {}, 12, () => 5);
  ok(q.every(x => x.root === 5 && x.off >= 0 && x.off <= 3 && Number.isInteger(x.seed)), 'key, offset and seed fixed at queue time');
});
check('readiness: boxes need six keys on the blank-neck drills; joins only need reps', () => {
  const drills = ['root', 'build'];
  const good = (id, keys) => ({ ef: 2.5, interval: 6, reps: 3, nextDue: '2099-01-01', keysSeen: keys });
  const srs = { 'min|P1|root': good('', 0), 'min|P1|build': good('', 0b111111) };
  eq(R.shapeProgress('min', 'P1', srs, drills).ready, true, 'six keys + reps');
  srs['min|P1|build'] = good('', 0b11111);
  eq(R.shapeProgress('min', 'P1', srs, drills).ready, false, 'five keys is not enough');
  const js = { 'min|J1|root': good('', 0) };
  eq(R.shapeProgress('min', 'J1', js, drills).ready, true, 'a join is ready on reps (build does not apply)');
  eq(R.shapeProgress('min', 'J1', js, drills).total, 1, 'and counts only the drills that apply');
});
check('forecast: every card counted exactly once, new cards in no bucket', () => {
  const td = R.todayStr(), add = n => R.addDays(td, n);
  const cards = R.buildCards('min', ['root', 'fill']);   // 20
  const srs = { [cards[0].id]: { nextDue: add(-2) }, [cards[1].id]: { nextDue: add(3) }, [cards[7].id]: { nextDue: add(40) } };
  const f = R.forecastStacked(cards, srs);
  eq(f.newCount, 17, 'seventeen never tried'); eq(f.dueToday, 1, 'one overdue');
  eq(f.buckets.reduce((a, b) => a + b.total, 0) + f.newCount, 20, 'all accounted for');
  eq(f.buckets[6].total, 1, 'far future clamps into the last day');
  eq(f.buckets[0].byKind.box, 1, 'stacked by boxes / joins');
});
check('next up: due first, then untried on the focus, then weakest, then clear', () => {
  const td = R.todayStr();
  const drills = ['root', 'fill'];
  eq(R.nextUp('min', {}, drills, 'P1').kind, 'focus-new', 'fresh start');
  const srs = { 'min|P1|root': { ef: 2.5, interval: 1, reps: 1, nextDue: td } };
  eq(R.nextUp('min', srs, drills, 'P1').kind, 'due', 'due beats everything');
  const later = R.addDays(td, 5);
  const s2 = { 'min|P1|root': { reps: 2, nextDue: later, seen: 10, wrong: 6 }, 'min|P1|fill': { reps: 2, nextDue: later, seen: 4, wrong: 0 } };
  const nu = R.nextUp('min', s2, drills, 'P1');
  eq(nu.kind, 'weak', 'weakest after that'); eq(nu.drill, 'root', 'the weak one'); eq(nu.right, 4, '4 of 10');
  ok(R.nextUp('maj', s2, drills, 'P1').kind === 'focus-new', 'the scales keep separate records');
});

console.log('\nStorage');
check('every persisted value survives a ProgressBackup round trip', () => {
  const roundTrip = raw => { let v; try { v = JSON.parse(raw); } catch { v = raw; } return JSON.stringify(v); };
  for (const [key, raw] of [
    ['bs_root', '9'], ['bs_scale', JSON.stringify('min')], ['bs_label', JSON.stringify('degrees')],
    ['bs_settings', JSON.stringify({ sessionN: 12, bpm: 100 })], ['bs_shape', JSON.stringify({ min: 'P1', maj: 'P3' })],
    ['bs_focus', JSON.stringify({ min: { shape: 'P2', since: null } })],
    ['bs_srs', JSON.stringify({ 'min|P1|root': { ef: 2.5, interval: 6, reps: 2, nextDue: '2026-09-01' } })],
  ]) eq(roundTrip(raw), raw, `${key} round trip`);
});

// ── Dates, in every timezone ─────────────────────────────────────────────
// "Today" is the phone's own calendar day, and the arithmetic on day strings
// is plain calendar arithmetic, the same wherever the phone is. Both were
// wrong: todayStr() was the UTC date, so the day rolled over at 5pm in
// California and 8am in Singapore (last night's practice read as "today"), and
// local-time arithmetic made "tomorrow" today east of Greenwich and lost a day
// across clock changes. One run of this script only sees this machine's
// timezone, so the app's own helpers run in a child process under each zone
// below: todayStr() against the zone's own date (via Intl, at 32 instants
// across a European clock change), addDays/dayDiff against UTC arithmetic.
const DATE_ZONES = ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'Pacific/Auckland', 'Asia/Kolkata'];
function dateErrors(file) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  const grab = id => (text.match(new RegExp(`^\\s*(?:export\\s+)?const\\s+${id}\\s*=.*$`, 'm')) || [''])[0].replace(/^\s*export\s+/, '');
  const src = [grab('todayStr'), grab('addDays'), grab('dayDiff')].filter(Boolean).join('\n');
  if (!src.includes('addDays') || !src.includes('todayStr')) return [`todayStr or addDays not found in ${file}`];
  const probe = `const f = new Function(process.argv[1] + '; return { todayStr, addDays, dayDiff: typeof dayDiff === "undefined" ? null : dayDiff };')();
const RealDate = Date, local = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const ref = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
let out = '';
for (let h = 0; h < 48 && !out; h += 1.5) {
  const t = Date.UTC(2026, 2, 28) + h * 3600000;
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
  const got = f.todayStr(); globalThis.Date = RealDate;
  const want = local.format(new RealDate(t));
  if (got !== want) out = 'todayStr() at ' + new RealDate(t).toISOString() + ' = ' + got + ', expected the local day ' + want;
}
for (let i = 0; i < 730 && !out; i++) { const s = ref('2026-01-01', i);
  for (const n of [-1, 1, 6, 15, 38, 95, 238]) { const w = ref(s, n);
    if (f.addDays(s, n) !== w) { out = 'addDays(' + s + ', ' + n + ') = ' + f.addDays(s, n) + ', expected ' + w; break; }
    if (f.dayDiff && f.dayDiff(s, w) !== n) { out = 'dayDiff(' + s + ', ' + w + ') = ' + f.dayDiff(s, w) + ', expected ' + n; break; } } }
process.stdout.write(out);`;
  return DATE_ZONES
    .map(tz => [tz, execFileSync(process.execPath, ['-e', probe, src], { env: { ...process.env, TZ: tz } }).toString()])
    .filter(([, e]) => e).map(([tz, e]) => `${tz}: ${e}`);
}

console.log('\ndates — every timezone');
check('today is the local day, and day arithmetic is the same in every timezone', () => {
  const e = dateErrors('../src/srs.js');
  if (e.length) fail(e.join('\n      '));
});

console.log(failures === 0 ? `\nAll checks passed. ${assertions} assertions.\n` : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
