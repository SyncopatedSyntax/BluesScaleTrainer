// ════════════════════════════════════════════════════════════════════════
//  Spaced repetition and practice planning. Pure: no React, no DOM.
//
//  Ported from Altered Trainer, with two changes: a card belongs to a SCALE as
//  well as a shape (minor and major blues keep separate records — the same
//  grip, but a different root under your finger), and there are ten shapes,
//  five boxes and five joins, where Altered has five.
// ════════════════════════════════════════════════════════════════════════
import { DRILLS, KEY_DRILLS, SHAPE_IDS, drillAppliesTo } from './theory.js';

// SM-2 copied verbatim from triads-trainer/src/TriadTrainer.jsx:32-46, which is
// byte-identical to Diatonic's and Altered's. Do not re-derive it; a fix in one
// should be carried to all of them.
// A day is the phone's own calendar day: todayStr() reads the LOCAL date, so a
// new day starts at the user's midnight. (It used to be the UTC date, which
// rolled over at 5pm in California and 8am in Singapore — last night's practice
// read as "today".) The day strings are then plain calendar dates, so the
// arithmetic on them is done in UTC, where no clock change can shift it.
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
export function updateSRS(card, correct) {
  const ef = card?.ef ?? 2.5, reps = card?.reps ?? 0, interval = card?.interval ?? 1;
  if (correct) {
    const nef = Math.min(2.5, Math.max(1.3, ef + 0.1));
    const nreps = reps + 1;
    const nint = nreps === 1 ? 1 : nreps === 2 ? 6 : Math.round(interval * nef);
    return { ef: nef, interval: nint, reps: nreps, nextDue: addDays(todayStr(), nint) };
  }
  return { ef: Math.max(1.3, ef - 0.2), interval: 1, reps: 0, nextDue: addDays(todayStr(), 1) };
}
export const isLearned = c => !!c && c.reps >= 2;
export const dueOn = (c, td) => !!c && dayDiff(td, c.nextDue) <= 0;
export const ri = n => Math.floor(Math.random() * n);
export const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = ri(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const popcount = n => { let c = 0; while (n) { n &= n - 1; c++; } return c; };

export const cardId = (scale, shape, drill) => `${scale}|${shape}|${drill}`;
export function buildCards(scale, drills, shapes = SHAPE_IDS) {
  const out = [];
  for (const shape of shapes) for (const drill of drills)
    if (drillAppliesTo(drill, shape)) out.push({ id: cardId(scale, shape, drill), scale, shape, drill });
  return out;
}

// Where one shape stands. `mastered` is the toolbox's isLearned so the dot
// means what it means everywhere; promotion is stricter. With a random key per
// rep, two correct answers can land in the same two keys, which is not knowing
// a shape — so a box also needs READY_KEYS keys on its blank-neck drills. A
// join has no blank-neck drills (its picture is the same in every key), so for
// a join the reps are the whole bar.
export const READY_REPS = 3, READY_KEYS = 6;
export function shapeProgress(scale, shape, srs, drills) {
  const own = drills.filter(d => drillAppliesTo(d, shape));
  const st = own.map(d => srs[cardId(scale, shape, d)]);
  const td = todayStr();
  const keyed = own.filter(d => KEY_DRILLS.has(d)).map(d => srs[cardId(scale, shape, d)]);
  // UNION across the blank-neck drills: "I have played this box in C" is the
  // honest reading of a key counting, whichever drill it was on.
  const keyCount = popcount(keyed.reduce((m, c) => m | (c?.keysSeen ?? 0), 0));
  const needsKeys = keyed.length > 0;
  return {
    mastered: st.filter(isLearned).length,
    total: own.length,
    nw: st.filter(c => !c).length,
    due: st.filter(c => dueOn(c, td)).length,
    keyCount, needsKeys,
    ready: own.length > 0 && st.every(c => (c?.reps ?? 0) >= READY_REPS) && (!needsKeys || keyCount >= READY_KEYS),
  };
}

// One drill across shapes — the transpose of shapeProgress, for "fine on the
// shapes, poor on the blue note". `acc` is null until attempted at all.
export function drillProgress(scale, drill, srs, shapes = SHAPE_IDS) {
  const td = todayStr();
  const st = shapes.filter(s => drillAppliesTo(drill, s)).map(s => srs[cardId(scale, s, drill)]);
  const seen = st.reduce((a, c) => a + (c?.seen ?? 0), 0);
  const wrong = st.reduce((a, c) => a + (c?.wrong ?? 0), 0);
  return {
    drill, started: st.filter(Boolean).length, solid: st.filter(isLearned).length, total: st.length,
    due: st.filter(c => dueOn(c, td)).length, seen, right: seen - wrong, acc: seen ? (seen - wrong) / seen : null,
  };
}
// Enough attempts to be worth calling weak: one miss on a twice-seen card is
// noise, and ranking it top would send you to drill the wrong thing.
export const WEAK_MIN_SEEN = 4, WEAK_ACC = 0.8;
export function weakestDrills(scale, srs, drills, shapes = SHAPE_IDS, n = 3) {
  return drills
    .map(d => drillProgress(scale, d, srs, shapes))
    .filter(p => p.seen >= WEAK_MIN_SEEN && p.acc < WEAK_ACC)
    .sort((a, b) => a.acc - b.acc || a.solid - b.solid || DRILLS.indexOf(a.drill) - DRILLS.indexOf(b.drill))
    .slice(0, n);
}

// ONE recommendation, with its reason: due work ▸ untried on the focus shape ▸
// weakest ▸ nothing owing.
export function nextUp(scale, srs, drills, focus) {
  const td = todayStr();
  const due = buildCards(scale, drills).filter(c => dueOn(srs[c.id], td));
  if (due.length) return { kind: 'due', count: due.length, shapes: [...new Set(due.map(c => c.shape))].sort((a, b) => SHAPE_IDS.indexOf(a) - SHAPE_IDS.indexOf(b)) };
  const fresh = drills.filter(d => drillAppliesTo(d, focus) && !srs[cardId(scale, focus, d)]);
  if (fresh.length) return { kind: 'focus-new', count: fresh.length, shapes: [focus] };
  const weak = weakestDrills(scale, srs, drills, SHAPE_IDS, 1)[0];
  if (weak) return { kind: 'weak', ...weak };
  const days = buildCards(scale, drills).map(c => srs[c.id]).filter(Boolean).map(c => dayDiff(td, c.nextDue));
  return { kind: 'clear', soonest: days.length ? Math.min(...days) : null };
}

// Ported from Triad Trainer's forecastStacked, stacked by boxes / joins. Ten
// shapes are too many colours for a phone-width bar.
//
// Never-reviewed cards go in `newCount` and in NO bucket. Dropping them is the
// bug that made a Standards Trainer tune read "4 due now" over a bar of 1.
export function forecastStacked(cards, srs, days = 7) {
  const td = todayStr();
  const buckets = Array.from({ length: days }, () => ({ total: 0, byKind: { box: 0, join: 0 } }));
  let newCount = 0, dueToday = 0, soonest = null;
  for (const c of cards) {
    const e = srs[c.id];
    if (!e) { newCount++; continue; }
    const d = dayDiff(td, e.nextDue);
    if (d <= 0) dueToday++;
    if (soonest === null || d < soonest) soonest = d;
    const b = buckets[Math.max(0, Math.min(days - 1, d))];
    b.total++; b.byKind[c.shape[0] === 'J' ? 'join' : 'box']++;
  }
  return { buckets, newCount, dueToday, soonest };
}

// Three tiers (due ▸ new ▸ not-yet-due), cycled with modulo so a small focus
// deck still fills a session — in a different key each time. Two exceptions:
// `dueOnly` never pads ("7 due" must mean 7 questions), and a narrow pool gets
// pool × READY_REPS, because a drawn shape's picture is the same in every key
// and twelve reps of one card is one question twelve times.
export function buildQueue(cards, srs, count, pickKey, { dueOnly = false } = {}) {
  const td = todayStr();
  const due = shuffle(cards.filter(c => dueOn(srs[c.id], td)));
  const nw = shuffle(cards.filter(c => !srs[c.id]));
  const rest = shuffle(cards.filter(c => srs[c.id] && !dueOn(srs[c.id], td)));
  const pool = dueOnly ? due : [...due, ...nw, ...rest];
  if (!pool.length) return [];
  const n = Math.min(count, dueOnly ? pool.length : pool.length * READY_REPS);
  const q = [];
  while (q.length < n) q.push(pool[q.length % pool.length]);
  // Key, window offset and fill blanks are decided here, once, so nothing can
  // reshuffle under a half-finished answer.
  return q.map((c, i) => ({ ...c, root: pickKey(), off: ri(4), seed: (Date.now() + i * 7919) | 0 }));
}
