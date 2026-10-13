# Blues Scale Trainer — project context

A React PWA that teaches the **blues scale** — minor blues (R ♭3 4 ♭5 5 ♭7) and
major blues (R 2 ♭3 3 5 6) — in five boxes and the five joins between them,
compares it with the major scale, natural minor and both pentatonics, and
shows it over a 12-bar. The whole app is organised around **the blue note**:
the one note each blues scale adds to its pentatonic. Part of the **Fretworks**
toolbox; built in the image of Altered Scale Trainer. Single dev + end user:
Zak.

- Toolbox-wide conventions (git-dep workflow, multi-zone, single PWA,
  verify-in-prod, naming): the Fretworks root `CLAUDE.md` (fretworks-docs).

## Commands
- `npm install`, `npm run dev` (port 5187), `npm run build`
- `npm run verify` — **the correctness gate**. Must pass before shipping.

## Integration
- Vite `base: '/blues/'`, served as a Vercel zone (`vercel.json` rewrites
  `/blues/(.*)` → `/$1`, plus a `/`-scoped redirect of the bare Vercel domain
  to `fretworks.vercel.app/blues`).
- Registry: `key:"blues"`, `name:"Blues Scale Trainer"`, emoji 🎷, **accent
  indigo `#818cf8`**, `path:"/blues/"`, learning path between Diatonic and
  Melodic Minor.
- Storage prefix `bs_`: `bs_root`, `bs_scale`, `bs_label`, `bs_settings`,
  `bs_shape` (browsing, per scale), `bs_focus` (the plan, per scale), `bs_srs`,
  `bs_ios_hint`. All JSON.

## Files
- `src/theory.js` — pure: scales, boxes, joins, comparison, 12-bar roles, the
  drill answer sets. No React.
- `src/srs.js` — pure: SM-2 (verbatim from Triad Trainer), cards, readiness,
  Next up, weak spots, forecast, queue. Ported from Altered Trainer.
- `src/audio.js` — Altered's audio stack (toolbox standard; see below).
- `src/Fretboard.jsx` — the sideways neck.
- `src/BluesTrainer.jsx` — App and every tab.
- `scripts/verify.mjs` — re-derives everything from first principles.

## The theory — generated, never typed in

**No shape is hand-entered.** A box is generated: Position k starts on the k-th
note of the scale's pentatonic on the low E, takes two pentatonic notes per
string ascending, and the blue note goes **one fret above every 4** (minor) or
**every 2** (major), same string. That one rule reproduces the standard
published charts exactly, stretches included (fret 11 on both E strings in
A-minor box 2, fret 16 on the B string in box 4). verify.mjs types the A-minor
chart in by hand and checks every box in all twelve keys, both scales, against
it.

Two properties verify.mjs proves for every box and join in every key, and the
drills are built on them — **do not break either**:
1. **A shape is exactly every blues-scale note inside its fret span.** Nothing
   in those frets is left out. So "every root in this box" and "every root you
   can see" are the same set, and a drawn drill can use the shape's own frets
   as its window with no "right note, wrong place" traps.
2. **The blue notes a box adds are exactly the blue-note pitches inside its
   frets.**

Other facts pinned there:
- Major blues of root R = the minor blues of R − 3 (relatives). Major
  Position k is the same grip as minor Position k+1 of the relative minor.
- A position's picture is identical in all twelve keys (the numbering
  invariant). Numbers come from the starting degree; `getShapes()` returns
  them in **neck order**, so arrows may read 3, 4, 5, 1, 2. Not a bug.
- A box is placed as low as it fits with every fret ≥ 0 — open position
  exists (E minor box 1 is the open E-minor pentatonic).
- **Join k** = box k + box k+1: three pentatonic notes on every string. Join 5
  runs into box 1 an octave up.
- Root to root in any box is exactly 7 notes, every scale note once.

**Spelling** is by degree (C minor blues' ♭5 is G♭, not F♯), falling back to
the plain name only where letter spelling would need a double accidental or
C♭/F♭/E♯/B♯.

## Comparison
Always against the **parallel** scale (same root). Inside a shape:
`shared` (both), `only` (blues only — ringed, or the ◆), `extra` (the other
scale's notes at **every fret the shape covers** — dashed). Against its own
pentatonic the only difference is the blue note; verify.mjs asserts that.

## 12-bar
`I I I I | IV IV I I | V IV I V`, dominant 7ths. Each note is classed against
**the chord, not the key**: chord tone (R 3 5 ♭7), colour (♭9 9 ♯9 ♯11 ♭13 13),
rub (11, 7). `blueResolution()` gives the blue note's half-step neighbours that
are in the scale AND in the chord — A minor: E♭ up to E over A7, down to D over
D7, either over E7. Major blues over IV7: the ♭3 **is** the ♭7, so "sit on it".
"Play the changes" loops the form and the board follows the chords. Tempo is
`settings.bpm` (50–160, default 100 = medium shuffle), read per bar through a
ref so a change mid-loop lands on the next bar.

## Practice
Cards are `scale|shape|drill` — minor and major keep separate records. Ten
shapes: P1–P5, then J1–J5. Nine drills in three families:
- Shape: `root`, `fill`, `octave`*, `build`*
- Blue note: `bluespot`, `blueadd` (the pentatonic drawn — add the blue note),
  `blueblank`* (off by default)
- Comparison: `tonat` (→ natural minor / major scale), `cross` (→ the other
  pentatonic, off by default). A tapped dot is **removed** (struck through),
  a tapped empty fret is **added**. `ok` = remove ∪ add; after the change the
  frets hold exactly the target scale (verify.mjs checks that too).

\* Blank-neck (`BLANK`): an 8-fret window with the box pushed 0–3 frets in. They
apply to **boxes only** — a join spans 6–7 frets and would push cells under
44px. Only these count toward key coverage (`KEY_DRILLS`).

Everything else is Altered Trainer's design, and its CLAUDE.md explains why:
exact-set grading, the "N of M" counter, three-tier queue with modulo cycling,
`dueOnly` never pads, narrow pools get `pool × READY_REPS`, `isLearned` (reps ≥
2) vs readiness (reps ≥ 3 + six keys), `seen`/`wrong` counters (never
back-filled), Next up priority, Weak spots threshold, forecast with new cards in
no bucket. One difference: **a join is ready on reps alone** — it has no
blank-neck drills, and its picture is the same in every key.

## Fretboard
Low E at the bottom. The viewBox is ~320 wide and the fret width stretches to
fill it, so a 5-fret box gets wide cells. In drills: `rowH={36}`, full-bleed
card (`margin: 0 -12px`) — measured 44.3×44 px tap cells on an 8-fret window at
393px. The tap grid is the last SVG child. The blue note is always an indigo
**diamond** (except in `mono` drills, where shape or colour would give the
answer away). `rootRing` keeps the root's white ring in mono for the
blue-note and comparison drills.

**Card borders are longhands** (`borderWidth/Style/Color`), never the `border`
shorthand: overriding `borderColor` on a reused element made React wipe the
shorthand's colour, and the session prompt card rendered with a white border.
The colour is `#2a2840` (the button border tone) — Zak asked for a touch lighter
than the old `#1a1928`. Altered Trainer uses the same.

## Audio
Copied from Altered Trainer: two-layer iOS silent-switch bypass, shared bus +
limiter, idle-suspend. See root `CLAUDE.md → Audio`; don't regress.
`strumAt()` keeps one envelope level per chord.

## Not built yet
- The BB King / Albert King boxes. They mix notes from outside either blues
  scale (the 2 and 6 in a minor context), so they do not fit "a blues-scale
  shape" — they want a licks/phrases track of their own.
- Ear training (hear a lick, did it use the blue note?).
- Microphone grading, as in Note Trainer.

## Before shipping any change
- `npm run verify` and `npm run build` must pass.
- Check at ~393px in the browser; for drills, tap accuracy on a real iPhone.
