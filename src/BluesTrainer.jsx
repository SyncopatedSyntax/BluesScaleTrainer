import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppHeader, TabBar, ProgressBackup } from '@fretworks/design';
import {
  OPEN_MIDI, pc, midiAt, ckey, unkey, pretty, IV_LABEL, KEY_NAMES, SCALES, SCALE_IDS, COMPARE, COMPARE_IDS,
  spell, noteName, getShapes, shapeById, shapeName, fullNeck, rootSpan, compareIn, compareDegrees,
  BARS, CHORD_OFFSET, chordName, roleOver, blueResolution, DRILLS, BLANK, DEFAULT_DRILLS, MORPH, DRILL_FAMILY,
  SHAPE_IDS, BOX_IDS, JOIN_IDS, drillSpec, drillAppliesTo,
} from './theory.js';
import {
  todayStr, updateSRS, isLearned, ri, cardId, buildCards, shapeProgress, drillProgress, weakestDrills,
  nextUp, forecastStacked, buildQueue, READY_REPS, READY_KEYS, WEAK_MIN_SEEN, WEAK_ACC,
} from './srs.js';
import { playMidis, strum, strumAt, dom7Voicing, getCtx, unlockAudio, bumpIdle } from './audio.js';
import Fretboard, { DC, BLUE, TEAL, txtOn } from './Fretboard.jsx';

// ════════════════════════════════════════════════════════════════════════
//  Blues Scale Trainer — the blues scale in five boxes and the joins between
//  them, compared with its neighbours, and heard over a 12-bar. The one note
//  the whole app is about is the blue note: b5 in minor blues, b3 in major.
//  Part of the Fretworks toolbox.
// ════════════════════════════════════════════════════════════════════════

const ACC = BLUE;   // the app accent IS the blue-note colour
// Border as longhands, never the `border` shorthand: cards override borderColor,
// and when React reuses one element across two styles (the idle screen's Next
// up card becoming a session's prompt card) removing `borderColor` also wipes
// the colour the shorthand set, and the border falls back to white.
const card = { background: '#13121f', borderWidth: 1, borderStyle: 'solid', borderColor: '#1a1928', borderRadius: 12, padding: '12px 13px', marginBottom: 12 };
const hd = { fontSize: 11, color: '#888', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 };
const primary = { width: '100%', background: ACC, color: '#0b0b2a', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 800, cursor: 'pointer', minHeight: 48, touchAction: 'manipulation' };
const ghost = { width: '100%', background: 'transparent', color: '#aaa', border: '1px solid #2a2840', borderRadius: 9, padding: '10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', minHeight: 44, touchAction: 'manipulation', marginTop: 8 };
const seg = on => ({ flex: 1, padding: '8px 4px', background: on ? ACC : 'transparent', color: on ? '#0b0b2a' : '#aaa', border: `1px solid ${on ? ACC : '#2a2840'}`, borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 40, touchAction: 'manipulation' });
const pill = on => ({ padding: '6px 11px', borderRadius: 16, fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 36, border: `1.5px solid ${on ? ACC : '#2a2840'}`, background: on ? ACC : 'transparent', color: on ? '#0b0b2a' : '#aaa', touchAction: 'manipulation', whiteSpace: 'nowrap' });
const navBtn = { background: 'transparent', border: '1px solid #2a2840', color: '#ccc', borderRadius: 8, padding: '9px 16px', fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 44, minWidth: 48, touchAction: 'manipulation' };
const scaleTitle = (root, scale) => `${KEY_NAMES[root]} ${SCALES[scale].name.toLowerCase()}`;
const ROOT_MIDI = root => 48 + root;   // C3..B3: where "hear it" plays

function PlayBtn({ onClick, label = '▶ Play', small }) {
  const [hot, setHot] = useState(false);
  return <button onClick={() => { setHot(true); onClick(); setTimeout(() => setHot(false), 500); }}
    style={{ background: hot ? ACC + '22' : 'transparent', border: `1px solid ${hot ? ACC : '#2a2840'}`, color: hot ? ACC : '#bbb', borderRadius: 8, padding: small ? '5px 10px' : '8px 13px', fontSize: small ? 11.5 : 12, fontWeight: 700, cursor: 'pointer', minHeight: small ? 36 : 42, touchAction: 'manipulation' }}>{label}</button>;
}
// A degree chip. The blue note is always the indigo diamond-marked one.
function Chip({ deg, note, blue, dashed, ringed }) {
  const col = blue ? ACC : (DC[deg] || '#888');
  if (dashed) return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11.5, border: '1.5px dashed #b7b5cf', color: '#d4d2e8', margin: '2px 4px 2px 0' }}>{pretty(deg)}{note ? ` · ${note}` : ''}</span>;
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11.5, background: col, color: blue ? '#0b0b2a' : txtOn(col), margin: '2px 4px 2px 0', boxShadow: ringed ? `0 0 0 2px #0f0e17, 0 0 0 3.5px ${ACC}` : 'none' }}>{blue ? '◆ ' : ''}{pretty(deg)}{note ? ` · ${note}` : ''}</span>;
}
const sortedPitches = cells => [...new Set(cells.map(c => midiAt(c.s, c.f)))].sort((a, b) => a - b);

// ── Shape navigation, shared by Positions and 12-bar ─────────────────────
// Boxes or joins, then arrows that walk UP THE NECK. The arrows may read
// 3, 4, 5, 1, 2 in a given key; the number names the grip, the line under it
// says where it sits. Switching family keeps the number (Position 3 ↔ Join 3–4).
function ShapeNav({ list, cur, onShapeId, idx }) {
  const step = d => onShapeId(list[(idx + d + list.length) % list.length].id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 }}>
      <button onClick={() => step(-1)} style={navBtn} aria-label="Lower on the neck">{'‹'}</button>
      <div style={{ fontSize: 12, color: '#999', minWidth: 110, textAlign: 'center' }}>
        {cur.name}<br /><span style={{ fontSize: 10, color: '#666' }}>{['1st', '2nd', '3rd', '4th', '5th'][idx]} up the neck</span>
      </div>
      <button onClick={() => step(1)} style={navBtn} aria-label="Higher on the neck">{'›'}</button>
    </div>
  );
}
function useShapeList(scale, root, shapeId) {
  const kind = shapeId[0] === 'J' ? 'join' : 'box';
  const list = useMemo(() => getShapes(scale, root, kind), [scale, root, kind]);
  const idx = Math.max(0, list.findIndex(s => s.id === shapeId));
  return { kind, list, idx, cur: list[idx] };
}

// ════════════════════════════════════════════════════════════════════════
//  POSITIONS
// ════════════════════════════════════════════════════════════════════════
function ScaleCard({ root, scale, labelMode }) {
  const S = SCALES[scale];
  const rm = ROOT_MIDI(root);
  const pentName = `${KEY_NAMES[root]} ${S.pentName}`;
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: '#fff' }}>{scaleTitle(root, scale)}</div>
      </div>
      <div style={{ lineHeight: 1.9, marginBottom: 6 }}>
        {S.iv.map(i => <Chip key={i} deg={IV_LABEL[i]} note={spell(root, i)} blue={i === S.blue} />)}
      </div>
      <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.6, marginBottom: 10 }}>
        The blue note is the <b style={{ color: ACC }}>{pretty(IV_LABEL[S.blue])} ({spell(root, S.blue)})</b> — the one note this scale adds to the {pentName}. Hear the difference:
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <PlayBtn label={'▶ With the blue note'} onClick={() => playMidis([...S.iv.map(i => rm + i), rm + 12], 0.22)} />
        <PlayBtn label={'▶ Without it'} onClick={() => playMidis([...S.pent.map(i => rm + i), rm + 12], 0.22)} />
      </div>
    </div>
  );
}

function PositionsTab({ root, scale, labelMode, shapeId, onShapeId, focusId, onFocus, onPractise }) {
  const [neck, setNeck] = useState(false);
  const [cmp, setCmp] = useState('off');
  const { kind, list, idx, cur } = useShapeList(scale, root, shapeId);
  const setKind = k => onShapeId((k === 'join' ? 'J' : 'P') + cur.num);
  const cells = neck ? fullNeck(scale, root) : cur.cells;
  const base = neck ? { cells, lo: 0, hi: 15, root, scale } : cur;
  const cmpData = useMemo(() => {
    if (cmp === 'off') return null;
    const c = compareIn(base, cmp);
    return { only: new Set(c.only.map(x => ckey(x.s, x.f))), extra: c.extra };
  }, [cmp, base]);
  const S = SCALES[scale], rm = ROOT_MIDI(root);

  const playShape = () => playMidis(sortedPitches(cells), 0.17);
  const playOctave = () => playMidis(sortedPitches(rootSpan(cur)), 0.2);
  const playBoth = () => {
    const a = [...S.iv.map(i => rm + i), rm + 12], b = [...COMPARE[cmp].iv.map(i => rm + i), rm + 12];
    playMidis(a, 0.2);
    setTimeout(() => playMidis(b, 0.2), a.length * 200 + 650);
  };
  const diff = cmp !== 'off' ? compareDegrees(scale, cmp) : null;
  const other = cmp !== 'off' ? `${KEY_NAMES[root]} ${COMPARE[cmp].name.toLowerCase()}` : '';

  return (
    <div style={{ padding: '14px 12px' }}>
      <ScaleCard root={root} scale={scale} labelMode={labelMode} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => { setNeck(false); setKind('box'); }} style={seg(!neck && kind === 'box')}>5 Boxes</button>
        <button onClick={() => { setNeck(false); setKind('join'); }} style={seg(!neck && kind === 'join')}>Joins</button>
        <button onClick={() => setNeck(true)} style={seg(neck)}>Full neck</button>
      </div>

      <div style={{ fontSize: 9.5, color: '#777', textTransform: 'uppercase', letterSpacing: '.5px', margin: '2px 2px 5px' }}>Compare with</div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 8, WebkitOverflowScrolling: 'touch' }}>
        <button onClick={() => setCmp('off')} style={pill(cmp === 'off')}>Off</button>
        {COMPARE_IDS.map(id => <button key={id} onClick={() => setCmp(id)} style={pill(cmp === id)}>{COMPARE[id].short}</button>)}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>{neck ? 'Full neck' : cur.name}</div>
        {!neck && cur.id === focusId && <span style={{ fontSize: 10, fontWeight: 800, color: ACC, border: `1px solid ${ACC}66`, borderRadius: 12, padding: '2px 7px' }}>FOCUS</span>}
        {!neck && <span style={{ color: '#888', fontWeight: 600, fontSize: 11 }}>starts on {pretty(cur.start)} · frets {cur.lo}–{cur.hi}</span>}
      </div>

      <div style={{ background: '#13121f', border: '1px solid #1a1928', borderRadius: 12, padding: '8px 4px', overflowX: neck ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
        <Fretboard cells={cells} root={root} labelMode={labelMode} compare={cmpData}
          win={neck ? { lo: 0, hi: 15 } : { lo: Math.max(0, cur.lo - 1), hi: cur.hi + 1 }} scroll={neck} />
      </div>

      {!neck && <ShapeNav list={list} cur={cur} idx={idx} onShapeId={onShapeId} />}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <PlayBtn onClick={playShape} label={'▶ Play this shape'} />
        {!neck && kind === 'box' && <PlayBtn onClick={playOctave} label={'▶ Root to root'} />}
        {!neck && (cur.id === focusId
          ? <button onClick={onPractise} style={{ background: ACC, color: '#0b0b2a', border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 42, touchAction: 'manipulation' }}>Practise this</button>
          : <button onClick={() => onFocus(cur.id)} style={{ background: 'transparent', color: ACC, border: `1px solid ${ACC}66`, borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 42, touchAction: 'manipulation' }}>Make this my focus</button>)}
      </div>

      {diff ? (
        <div style={{ ...card, marginTop: 14, borderColor: ACC + '44' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.4 }}>{scaleTitle(root, scale)} <span style={{ color: '#777' }}>vs</span> {other}</div>
            <PlayBtn small label={'▶ Hear both'} onClick={playBoth} />
          </div>
          <div style={{ fontSize: 12, lineHeight: 2, color: '#ccc' }}>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', flex: '0 0 84px', lineHeight: 1.35, paddingTop: 5 }}>Both have</span><span style={{ flex: 1 }}>{diff.shared.map(i => <Chip key={i} deg={IV_LABEL[i]} note={spell(root, i)} />)}</span></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', flex: '0 0 84px', lineHeight: 1.35, paddingTop: 5 }}>Only blues</span><span style={{ flex: 1 }}>{diff.only.map(i => <Chip key={i} deg={IV_LABEL[i]} note={spell(root, i)} blue={i === S.blue} ringed={i !== S.blue} />)}</span></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', flex: '0 0 84px', lineHeight: 1.35, paddingTop: 5 }}>Only {COMPARE[cmp].short.toLowerCase()}</span><span style={{ flex: 1 }}>{diff.extra.length ? diff.extra.map(i => <Chip key={i} deg={IV_LABEL[i]} note={spell(root, i)} dashed />) : <span style={{ color: '#777' }}>nothing</span>}</span></div>
          </div>
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6, marginTop: 6 }}>
            On the neck: ringed and ◆ = only in the blues scale; dashed = only in the {COMPARE[cmp].name.toLowerCase()}{neck ? '' : ', at every fret this shape covers'}.
            {(cmp === 'minpent' && scale === 'min') || (cmp === 'majpent' && scale === 'maj') ? ' Here the only difference is the blue note — that is the whole definition of the blues scale.' : ''}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, justifyContent: 'center' }}>
          {S.iv.map(i => i === S.blue
            ? <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#ccc' }}><span style={{ width: 11, height: 11, background: ACC, transform: 'rotate(45deg)', display: 'inline-block' }} />{pretty(IV_LABEL[i])} blue note</span>
            : <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#aaa' }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: DC[IV_LABEL[i]], display: 'inline-block' }} />{pretty(IV_LABEL[i])}</span>)}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  12-BAR
// ════════════════════════════════════════════════════════════════════════
// The scale over the three chords of a blues. Every note is coloured by what
// it is AGAINST THE CHORD: a chord tone to land on, a colour tone, or a rub to
// move through. The blue note keeps its diamond, and teal rings show where it
// resolves — which changes chord to chord, and that is the lesson.
const BPM = 84;
const ROLE_WORD = { chord: 'Land on', colour: 'Colour', rub: 'Rub — pass through' };
function TwelveBarTab({ root, scale, labelMode, shapeId, onShapeId }) {
  const [chord, setChord] = useState('I');
  const [bar, setBar] = useState(-1);          // the bar playing, -1 = stopped
  const timer = useRef(null);
  const { kind, list, idx, cur } = useShapeList(scale, root, shapeId);
  const setKind = k => onShapeId((k === 'join' ? 'J' : 'P') + cur.num);
  const S = SCALES[scale];

  const stop = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; setBar(-1); }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => { stop(); }, [root, scale, stop]);
  const play = () => {
    if (timer.current) { stop(); return; }
    unlockAudio();
    const ctx = getCtx(), barDur = 4 * 60 / BPM;
    let i = 0, t0 = ctx.currentTime + 0.1;
    const tick = () => {
      const ch = BARS[i % 12], v = dom7Voicing(pc(root + CHORD_OFFSET[ch]));
      strumAt(ctx, v, t0); strumAt(ctx, v, t0 + barDur / 2, 0.2);
      bumpIdle(ctx, t0 + barDur + 1.5);
      setBar(i % 12); setChord(ch);
      i++; t0 += barDur;
      timer.current = setTimeout(tick, Math.max(0, (t0 - ctx.currentTime - 0.15) * 1000));
    };
    tick();
  };
  const pick = ch => { stop(); setChord(ch); strum(dom7Voicing(pc(root + CHORD_OFFSET[ch]))); };

  const roles = useMemo(() => new Map(cur.cells.map(c => [ckey(c.s, c.f), roleOver(root, chord, midiAt(c.s, c.f))])), [cur, root, chord]);
  const res = useMemo(() => blueResolution(scale, root, chord), [scale, root, chord]);
  const targets = useMemo(() => {
    const t = new Set(res.targets.map(x => x.pc));
    return new Set(cur.cells.filter(c => t.has(pc(midiAt(c.s, c.f)))).map(c => ckey(c.s, c.f)));
  }, [cur, res]);
  const cname = chordName(root, chord), blueName = spell(root, S.blue);
  const byRole = { chord: [], colour: [], rub: [] };
  for (const i of S.iv) { const r = roleOver(root, chord, pc(root + i)); byRole[r.role].push({ i, label: r.label }); }
  const hearRes = () => {
    const ctx = (unlockAudio(), getCtx()), t = ctx.currentTime + 0.05;
    strumAt(ctx, dom7Voicing(pc(root + CHORD_OFFSET[chord])), t);
    const b = ROOT_MIDI(root) + S.blue + 12;
    const tgt = res.targets[0];
    const notes = tgt ? [b, b + tgt.dir] : [b];
    notes.forEach((m, j) => strumAt(ctx, [m], t + 0.9 + j * 0.45, 0.22));
    bumpIdle(ctx, t + 3);
  };

  return (
    <div style={{ padding: '14px 12px' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
          <div style={hd}>12-bar blues in {KEY_NAMES[root]}</div>
          <button onClick={play} style={{ background: bar >= 0 ? 'transparent' : ACC, color: bar >= 0 ? ACC : '#0b0b2a', border: `1px solid ${ACC}`, borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 40, touchAction: 'manipulation' }}>
            {bar >= 0 ? '■ Stop' : '▶ Play the changes'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {BARS.map((ch, i) => {
            const on = bar >= 0 ? bar === i : ch === chord;
            return <button key={i} onClick={() => pick(ch)}
              style={{ padding: '6px 2px', borderRadius: 7, cursor: 'pointer', minHeight: 44, touchAction: 'manipulation', border: `1px solid ${on ? ACC : '#2a2840'}`, background: on ? ACC + (bar === i ? '' : '33') : 'transparent', color: bar === i ? '#0b0b2a' : on ? '#fff' : '#999' }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, fontFamily: 'var(--font-heading)' }}>{ch}7</div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>{chordName(root, ch)}</div>
            </button>;
          })}
        </div>
        <div style={{ fontSize: 10.5, color: '#666', marginTop: 7, lineHeight: 1.5 }}>Tap a bar to hear its chord. While it plays, the neck below follows the changes.</div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => setKind('box')} style={seg(kind === 'box')}>5 Boxes</button>
        <button onClick={() => setKind('join')} style={seg(kind === 'join')}>Joins</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 900 }}>{scaleTitle(root, scale)} <span style={{ color: '#777', fontWeight: 600 }}>over</span> <span style={{ color: ACC }}>{cname}</span></div>
        <span style={{ color: '#888', fontSize: 11 }}>{cur.name}</span>
      </div>
      <div style={{ background: '#13121f', border: '1px solid #1a1928', borderRadius: 12, padding: '8px 4px' }}>
        <Fretboard cells={cur.cells} root={root} labelMode={labelMode} roles={roles} targets={targets}
          win={{ lo: Math.max(0, cur.lo - 1), hi: cur.hi + 1 }} />
      </div>
      <ShapeNav list={list} cur={cur} idx={idx} onShapeId={onShapeId} />

      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>The blue note over {cname}</div>
          <PlayBtn small label={'▶ Hear it'} onClick={hearRes} />
        </div>
        <div style={{ fontSize: 12.5, color: '#ddd', lineHeight: 1.6 }}>
          {res.isChordTone
            ? <><b style={{ color: ACC }}>{blueName}</b> is the <b>{pretty(res.role.label)}</b> of {cname} — over this chord the blue note is a chord tone. Sit on it.</>
            : <><b style={{ color: ACC }}>{blueName}</b> is the <b>{pretty(res.role.label)}</b> of {cname}. Slide it {res.targets.map((t, j) => <span key={j}>{j ? ' or ' : ''}<b style={{ color: TEAL }}>{t.dir < 0 ? 'down' : 'up'} to {noteName(root, t.pc)}</b> (the {t.chordDeg === 'R' ? 'root' : pretty(t.chordDeg)} of the chord)</span>)} — a half step to a chord tone.</>}
        </div>
        <div style={{ fontSize: 12, lineHeight: 2, marginTop: 8, color: '#ccc' }}>
          {['chord', 'colour', 'rub'].map(r => byRole[r].length > 0 && (
            <div key={r} style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', flex: '0 0 92px', lineHeight: 1.45, paddingTop: 4 }}>{ROLE_WORD[r]}</span><span style={{ flex: 1 }}>
              {byRole[r].map(({ i, label }) => <span key={i} style={{ display: 'inline-block', margin: '0 8px 0 0', fontWeight: 800, color: i === S.blue ? ACC : r === 'chord' ? '#fff' : r === 'colour' ? '#c9c5ff' : '#8f8ca6' }}>
                {spell(root, i)} <span style={{ fontWeight: 600, opacity: 0.75 }}>({pretty(label)})</span></span>)}
            </span></div>))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 9, borderTop: '1px solid #1a1928', fontSize: 10, color: '#aaa', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: DC.R, display: 'inline-block' }} />chord tone</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#34315a', border: '1px solid #6e6aa8', boxSizing: 'border-box', display: 'inline-block' }} />colour</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.4px dashed #6b6880', boxSizing: 'border-box', display: 'inline-block' }} />rub</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 13, height: 13, borderRadius: '50%', border: `2.4px solid ${TEAL}`, boxSizing: 'border-box', display: 'inline-block' }} />blue note lands here</span>
        </div>
        <div style={{ fontSize: 10.5, color: '#666', lineHeight: 1.6, marginTop: 8 }}>Labels show each note against the chord, not the key. Over {cname} the {spell(pc(root + CHORD_OFFSET[chord]), 0)} is the root.</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  PRACTICE
// ════════════════════════════════════════════════════════════════════════
const morphName = (drill, scale) => COMPARE[MORPH[drill][scale]].name.toLowerCase();
const DRILL_META = {
  root:      { label: () => 'Every root', short: () => 'Roots', ask: () => 'Tap every root in this shape.' },
  bluespot:  { label: () => 'Spot the blue note', short: () => 'Spot blue', ask: s => `Every dot is grey. Tap every ${pretty(IV_LABEL[SCALES[s].blue])} — the blue note.` },
  blueadd:   { label: () => 'Add the blue note', short: () => 'Add blue', ask: s => `This is the plain ${SCALES[s].pentName}. Add the blue note everywhere it goes.` },
  fill:      { label: () => 'Fill the gaps', short: () => 'Gaps', ask: () => 'Dots are missing. Put them back.' },
  tonat:     { label: s => `Into ${morphName('tonat', s)}`, short: s => s === 'min' ? 'To nat min' : 'To major', ask: s => `Turn it into the ${morphName('tonat', s)}: tap the dots it does not have, and the frets it adds.` },
  cross:     { label: s => `Into ${morphName('cross', s)}`, short: s => s === 'min' ? 'To maj pent' : 'To min pent', ask: s => `Turn it into the ${morphName('cross', s)}: tap the dots it does not have, and the frets it adds.` },
  octave:    { label: () => 'Root to root', short: () => 'Octave', ask: () => 'Empty neck. One octave of this box, lowest root to the next — blue note included.' },
  build:     { label: () => 'Build it', short: () => 'Build', ask: () => 'Empty neck. Place the whole box.' },
  blueblank: { label: () => 'Blue notes, blank neck', short: () => 'Blank blue', ask: () => 'Empty neck. Tap every blue note this box has.' },
};
const FAMILY_NAME = { shape: 'The shape', blue: 'The blue note', compare: 'Comparison' };
const FC = { box: ACC, join: '#c7cbff' };
const nextShape = id => SHAPE_IDS[SHAPE_IDS.indexOf(id) + 1] || null;

function PracticeTab({ root, scale, labelMode, settings, srs, onGrade, focusId, onFocus, onSession }) {
  const drills = (settings.drills && settings.drills.length) ? settings.drills : DEFAULT_DRILLS;
  const sessionN = settings.sessionN || 12;
  const keyMode = settings.keyMode || 'random';
  const [queue, setQueue] = useState(null);
  const [scope, setScope] = useState(null);
  const [qi, setQi] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [tally, setTally] = useState({ ok: 0, miss: 0 });
  const S = SCALES[scale];

  const pickKey = () => keyMode === 'fixed' ? root : keyMode === 'common' ? [4, 9, 2, 7, 0, 5, 10][ri(7)] : ri(12);
  const prog = useMemo(() => shapeProgress(scale, focusId, srs, drills), [scale, focusId, srs, drills]);
  const ladder = useMemo(() => SHAPE_IDS.map(id => ({ id, ...shapeProgress(scale, id, srs, drills) })), [scale, srs, drills]);
  const focusShape = useMemo(() => shapeById(scale, root, focusId), [scale, root, focusId]);
  const plan = useMemo(() => nextUp(scale, srs, drills, focusId), [scale, srs, drills, focusId]);
  const weak = useMemo(() => weakestDrills(scale, srs, drills), [scale, srs, drills]);
  const focusWeak = useMemo(() => weakestDrills(scale, srs, drills, [focusId], 1)[0] || null, [scale, srs, drills, focusId]);
  const anyGraded = useMemo(() => drills.some(d => drillProgress(scale, d, srs).seen >= WEAK_MIN_SEEN), [scale, srs, drills]);
  const fc = useMemo(() => forecastStacked(buildCards(scale, drills), srs), [scale, srs, drills]);

  useEffect(() => { onSession?.(!!queue); }, [queue, onSession]);
  useEffect(() => () => onSession?.(false), [onSession]);
  // Switching scale mid-session would leave a queue of the other scale's cards.
  useEffect(() => { setQueue(null); setScope(null); setAnswer(null); setPicked(new Set()); }, [scale]);

  // One entry point for every way into a session: `shapes` narrows by shape,
  // `only` by drill (the whole weak-aspect mechanism), `dueOnly` = exactly
  // what is owing. `label` names the SESSION in the running header.
  const start = (spec = {}) => {
    const { shapes = SHAPE_IDS, only = null, dueOnly = false, label = 'Everything' } = spec;
    const cards = buildCards(scale, drills, shapes).filter(c => !only || only.includes(c.drill));
    const q = buildQueue(cards, srs, sessionN, pickKey, { dueOnly });
    if (!q.length) return;
    setScope({ shapes, only, dueOnly, label });
    setQueue(q); setQi(0); setAnswer(null); setPicked(new Set()); setTally({ ok: 0, miss: 0 });
  };
  const quit = () => { setQueue(null); setScope(null); setAnswer(null); setPicked(new Set()); };

  // ── A running session ──────────────────────────────────────────────────
  if (queue) {
    if (qi >= queue.length) {
      const pct = Math.round((tally.ok / Math.max(1, tally.ok + tally.miss)) * 100);
      return (
        <div style={{ padding: '14px 12px' }}>
          <div style={{ ...card, textAlign: 'center', padding: '24px 14px' }}>
            <div style={{ fontSize: 34, marginBottom: 6 }}>{pct >= 80 ? '⭐' : pct >= 60 ? '🎷' : '💪'}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{tally.ok} / {tally.ok + tally.miss}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>Every question was in its own key. That is the part that sticks.</div>
          </div>
          <button onClick={() => start({ ...scope, dueOnly: false })} style={primary}>Go again</button>
          <button onClick={quit} style={ghost}>Done</button>
        </div>
      );
    }
    const it = queue[qi];
    const sh = shapeById(scale, it.root, it.shape);
    const spec = drillSpec(it.drill, sh, { off: it.off, seed: it.seed });
    const { ok } = spec;
    const meta = DRILL_META[it.drill];
    const morph = DRILL_FAMILY[it.drill] === 'compare';
    const blank = BLANK.has(it.drill);
    const ring = ['bluespot', 'blueadd', 'tonat', 'cross'].includes(it.drill);

    const toggle = (s, f) => {
      if (answer) return;
      const k = ckey(s, f);
      setPicked(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
      playMidis([midiAt(s, f)]);
    };
    const check = () => {
      if (answer || !picked.size) return;
      const missed = [...ok].filter(k => !picked.has(k));
      const wrong = [...picked].filter(k => !ok.has(k));
      const correct = !missed.length && !wrong.length;
      const noun = it.drill === 'root' ? 'root' : it.drill === 'fill' ? 'dot' : ['bluespot', 'blueadd', 'blueblank'].includes(it.drill) ? 'blue note' : 'note';
      const verdict = correct ? `Yes — all ${ok.size}.`
        : !wrong.length ? `${picked.size} of ${ok.size}. ${missed.length} ${noun}${missed.length > 1 ? 's' : ''} missing, ringed.`
        : !missed.length ? `You found them all, but ${wrong.length} extra${wrong.length > 1 ? 's' : ''}.`
        : `${ok.size - missed.length} of ${ok.size} right, ${wrong.length} that should not be there.`;
      setAnswer({ correct, missed, wrong, verdict });
      setTally(t => ({ ok: t.ok + (correct ? 1 : 0), miss: t.miss + (correct ? 0 : 1) }));
      onGrade(it.id, correct, it.root);
      if (correct) {
        // A comparison drill plays the scale you turned it INTO.
        const after = morph ? [...sh.cells.filter(c => !spec.remove.has(ckey(c.s, c.f))).map(c => ckey(c.s, c.f)), ...[...ok].filter(k => !spec.remove.has(k))] : [...ok];
        playMidis([...new Set(after.map(k => { const [s, f] = unkey(k); return midiAt(s, f); }))].sort((a, b) => a - b), 0.09);
      }
    };
    const nextQ = () => { setAnswer(null); setPicked(new Set()); setQi(i => i + 1); };
    const marks = [];
    if (answer) {
      for (const k of picked) { const [s, f] = unkey(k); marks.push({ s, f, kind: ok.has(k) ? 'ok' : 'bad' }); }
      for (const k of answer.missed) { const [s, f] = unkey(k); marks.push({ s, f, kind: 'reveal' }); }
    }

    return (
      <div style={{ padding: '14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={quit} aria-label="End session" style={{ background: 'transparent', border: '1px solid #2a2840', color: '#aaa', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44, touchAction: 'manipulation' }}>End</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#888' }}>{scope?.label} · {qi + 1} / {queue.length}</div>
            <div style={{ height: 4, background: '#1a1928', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(qi / queue.length) * 100}%`, height: '100%', background: ACC }} />
            </div>
          </div>
        </div>

        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: ACC }}>{scaleTitle(it.root, scale)}</div>
          <div style={{ fontSize: 13.5, color: '#ddd', marginTop: 6, lineHeight: 1.5 }}>
            <b>{shapeName(it.shape)}</b> — {meta.ask(scale).charAt(0).toLowerCase() + meta.ask(scale).slice(1)}
          </div>
          {morph && <div style={{ fontSize: 11, color: '#888', marginTop: 5 }}>a dot you tap is crossed out · an empty fret you tap is added</div>}
          {blank && <button onClick={() => playMidis([ROOT_MIDI(it.root)])}
            style={{ marginTop: 9, background: 'transparent', border: '1px solid #2a2840', color: '#aaa', borderRadius: 7, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', minHeight: 36, touchAction: 'manipulation' }}>{'♪'} hear the root</button>}
        </div>

        {/* Full-bleed: the tab's side padding is what would drop an 8-fret
            cell under 44px. Same measurement as Altered Trainer. */}
        <div style={{ background: '#13121f', border: '1px solid #1a1928', borderRadius: 12, padding: '8px 0', margin: '0 -12px' }}>
          <Fretboard cells={spec.shown} root={it.root} labelMode={labelMode} mono rootRing={ring}
            win={spec.win} rowH={36} marks={marks} selected={answer ? null : picked} pickStyle={morph ? 'morph' : 'mark'}
            onTapCell={answer ? undefined : toggle} />
        </div>

        {!answer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
            {/* How many to find. Grading is exact, so the count does not give
                the answer away; it removes guessing when you are finished. */}
            <div style={{ minWidth: 84 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, fontFamily: 'monospace', color: picked.size === ok.size ? '#2ed573' : '#aaa' }}>{picked.size} of {ok.size}</div>
              <div style={{ fontSize: 9.5, color: '#666', letterSpacing: '.4px', marginTop: 1 }}>{morph ? 'CHANGES' : 'FOUND'}</div>
              <div style={{ height: 3, background: '#1a1928', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (picked.size / ok.size) * 100)}%`, height: '100%', background: picked.size === ok.size ? '#2ed573' : ACC, transition: 'width .15s' }} />
              </div>
            </div>
            <button onClick={() => setPicked(new Set())} disabled={!picked.size}
              style={{ background: 'transparent', border: '1px solid #2a2840', color: picked.size ? '#aaa' : '#555', borderRadius: 9, padding: '10px 12px', fontSize: 12, fontWeight: 700, cursor: picked.size ? 'pointer' : 'default', minHeight: 44, touchAction: 'manipulation' }}>Clear</button>
            <button onClick={check} disabled={!picked.size} style={{ ...primary, flex: 1, opacity: picked.size ? 1 : 0.45 }}>Check</button>
          </div>
        )}
        {answer && (
          <div style={{ ...card, marginTop: 12, borderColor: answer.correct ? '#2ed57355' : '#ef444455' }}>
            <div style={{ fontSize: 13, color: answer.correct ? '#2ed573' : '#ffb4b4', fontWeight: 700, lineHeight: 1.5 }}>{answer.verdict}</div>
            {!answer.correct && <div style={{ fontSize: 11.5, color: '#999', marginTop: 6, lineHeight: 1.6 }}>Green is right, red should not be there, dashed teal is what you missed.</div>}
            <button onClick={nextQ} style={{ ...primary, marginTop: 10 }}>Next {'›'}</button>
          </div>
        )}
      </div>
    );
  }

  // ── Idle ───────────────────────────────────────────────────────────────
  const pips = id => drills.filter(d => drillAppliesTo(d, id)).map(d => { const c = srs[cardId(scale, id, d)]; return { d, on: isLearned(c), part: !!c && !isLearned(c) }; });
  const names = ids => ids.length === 1 ? shapeName(ids[0]) : ids.length <= 3 ? ids.map(shapeName).join(', ') : `${ids.length} shapes`;
  const fName = shapeName(focusId);
  const NEXT = {
    due: () => ({ title: `${plan.count} card${plan.count > 1 ? 's' : ''} due`, why: `across ${names(plan.shapes)}. These are the ones the schedule says you are about to forget.`, cta: '▶ Review what’s due', go: () => start({ dueOnly: true, label: 'Due today' }) }),
    'focus-new': () => ({ title: `${fName} has ${plan.count} drill${plan.count > 1 ? 's' : ''} you have not tried`, why: 'Nothing is due, so start the ones you have never answered.', cta: `▶ Practise ${fName}`, go: () => start({ shapes: [focusId], label: fName }) }),
    weak: () => ({ title: `${DRILL_META[plan.drill].label(scale)} is your weakest — ${plan.right} of ${plan.seen} right`, why: 'Nothing is due and nothing is untried, so this is the thing most worth an extra pass.', cta: `▶ Drill ${DRILL_META[plan.drill].label(scale)}`, go: () => start({ only: [plan.drill], label: DRILL_META[plan.drill].label(scale) }) }),
    clear: () => ({ title: 'Nothing due today', why: plan.soonest === null ? 'Nothing scheduled yet — any session starts the clock.' : plan.soonest === 1 ? 'Next review is tomorrow. Practising early still counts.' : `Next review in ${plan.soonest} days. Practising early still counts.`, cta: `▶ Practise ${fName} anyway`, go: () => start({ shapes: [focusId], label: fName }) }),
  }[plan.kind]();
  const nxt = nextShape(focusId);

  const LadderRow = ({ l }) => {
    const isFocus = l.id === focusId;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 8px', borderRadius: 9, marginBottom: 5, border: `1px solid ${isFocus ? ACC : '#1f1e2e'}`, background: isFocus ? ACC + '11' : 'transparent' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>{shapeName(l.id)} <span style={{ color: '#777', fontWeight: 600, fontSize: 11 }}>starts on {pretty(IV_LABEL[S.pent[Number(l.id[1]) - 1]])}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', gap: 4 }}>
              {pips(l.id).map(({ d, on, part }) => <span key={d} title={DRILL_META[d].short(scale)} style={{ width: 8, height: 8, borderRadius: '50%', boxSizing: 'border-box', background: on ? '#2ed573' : part ? '#74b9ff' : 'transparent', border: `1.5px solid ${on ? '#2ed573' : part ? '#74b9ff' : '#3a3852'}` }} />)}
            </span>
            <span style={{ fontSize: 10, color: '#777' }}>
              {l.ready ? `solid${l.needsKeys ? ` · ${l.keyCount} keys` : ''}` : l.nw === l.total ? 'not started' : `${l.mastered} of ${l.total} drills${l.needsKeys ? ` · keys ${l.keyCount}/${READY_KEYS}` : ''}`}
            </span>
            {l.due > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, color: ACC, background: ACC + '18', border: `1px solid ${ACC}44`, borderRadius: 9, padding: '1px 6px', whiteSpace: 'nowrap' }}>{l.due} due</span>}
          </div>
        </div>
        {/* Practising a shape must NOT move the focus: the focus is the plan. */}
        <button onClick={() => start({ shapes: [l.id], label: shapeName(l.id) })} aria-label={`Practise ${shapeName(l.id)}`}
          style={{ background: 'transparent', border: `1px solid ${ACC}66`, color: ACC, borderRadius: 8, padding: 0, fontSize: 12, fontWeight: 800, cursor: 'pointer', minHeight: 44, minWidth: 44, touchAction: 'manipulation' }}>{'▶'}</button>
        <button onClick={() => onFocus(l.id)} disabled={isFocus}
          style={{ background: 'transparent', border: `1px solid ${isFocus ? ACC : '#2a2840'}`, color: isFocus ? ACC : '#888', borderRadius: 8, padding: '0 9px', fontSize: 11, fontWeight: 700, cursor: isFocus ? 'default' : 'pointer', minHeight: 44, minWidth: 44, touchAction: 'manipulation' }}>{isFocus ? 'focus' : 'set'}</button>
      </div>
    );
  };

  return (
    <div style={{ padding: '14px 12px' }}>
      <div style={{ ...card, borderColor: plan.kind === 'due' ? ACC + '77' : '#1a1928' }}>
        <div style={hd}>Next up · {SCALES[scale].name.toLowerCase()}</div>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: '#fff', lineHeight: 1.4 }}>{NEXT.title}</div>
        <div style={{ fontSize: 11.5, color: '#8a8a9a', lineHeight: 1.6, marginTop: 5, marginBottom: 11 }}>{NEXT.why}</div>
        <button onClick={NEXT.go} style={primary}>{NEXT.cta}</button>
      </div>

      <div style={{ ...card, borderColor: ACC + '44' }}>
        <div style={hd}>Your focus</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{fName}</div>
          <div style={{ fontSize: 11.5, color: '#888' }}>starts on {pretty(focusShape.start)} · frets {focusShape.lo}–{focusShape.hi} in {KEY_NAMES[root]}</div>
        </div>
        <div style={{ margin: '10px 0' }}>
          <Fretboard cells={focusShape.cells} root={root} labelMode={labelMode} win={{ lo: Math.max(0, focusShape.lo - 1), hi: focusShape.hi + 1 }} rowH={24} />
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
          {pips(focusId).map(({ d, on, part }) => (
            <button key={d} onClick={() => start({ shapes: [focusId], only: [d], label: DRILL_META[d].label(scale) })}
              style={{ fontSize: 11.5, fontWeight: 700, padding: '0 11px', borderRadius: 14, minHeight: 44, background: 'transparent', cursor: 'pointer', touchAction: 'manipulation', border: `1px solid ${on ? '#2ed573' : part ? '#74b9ff' : '#2a2840'}`, color: on ? '#2ed573' : part ? '#74b9ff' : '#999' }}>
              {on ? '●' : part ? '◐' : '○'} {DRILL_META[d].short(scale)}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: '#666', marginBottom: 10 }}>
          Tap one to drill just that, on this shape.
          {focusWeak && <span style={{ color: ACC, fontWeight: 700 }}> Weakest here: {DRILL_META[focusWeak.drill].label(scale)} ({focusWeak.right} of {focusWeak.seen}).</span>}
        </div>
        {prog.needsKeys ? <>
          <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 3, color: prog.keyCount >= READY_KEYS ? '#2ed573' : '#aaa' }}>
            {prog.keyCount >= READY_KEYS ? `✓ Played in ${prog.keyCount} keys` : `Keys ${prog.keyCount} of ${READY_KEYS}`}
          </div>
          <div style={{ fontSize: 10.5, color: '#666', lineHeight: 1.6, marginBottom: 10 }}>
            Counted on the empty-neck drills, where the key changes where the notes are. Get {READY_KEYS}, with every drill above at {READY_REPS} correct answers, and {nxt ? shapeName(nxt) : 'the next shape'} gets suggested.
          </div>
        </> : (
          <div style={{ fontSize: 10.5, color: '#666', lineHeight: 1.6, marginBottom: 10 }}>
            A join is drawn on every question, so its picture is the same in every key — every drill above at {READY_REPS} correct answers is the whole bar.
          </div>
        )}
        <button onClick={() => start({ shapes: [focusId], label: fName })} style={primary}>{'▶'} Practise {fName}</button>
        <button onClick={() => start({ shapes: BOX_IDS, label: 'All five boxes' })} style={ghost}>Practise all five boxes</button>
      </div>

      {prog.ready && nxt && (
        <div style={{ ...card, borderColor: '#2ed57355' }}>
          <div style={{ fontSize: 13.5, color: '#2ed573', fontWeight: 800, marginBottom: 4 }}>{fName} is solid.</div>
          <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.6, marginBottom: 10 }}>
            Every drill at {READY_REPS}+ correct{prog.needsKeys ? `, across ${prog.keyCount} keys` : ''}. Ready for {shapeName(nxt)}?
            {nxt === 'J1' && ' That is the first join — the five boxes are done, and the joins are how you get between them.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onFocus(nxt)} style={{ ...primary, background: '#2ed573', color: '#06281f', flex: 1 }}>Move on</button>
            <button onClick={() => onFocus(focusId)} style={{ ...ghost, marginTop: 0, width: 'auto', padding: '10px 16px' }}>Not yet</button>
          </div>
        </div>
      )}

      {anyGraded && (
        <div style={card}>
          <div style={hd}>Weak spots</div>
          {weak.length === 0
            ? <div style={{ fontSize: 12, color: '#2ed573', fontWeight: 700 }}>Nothing is lagging — every drill you have practised is above {Math.round(WEAK_ACC * 100)}%.</div>
            : weak.map(w => (
              <div key={w.drill} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderTop: '1px solid #1a1928' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>{DRILL_META[w.drill].label(scale)}</div>
                  <div style={{ fontSize: 10.5, color: '#888', marginTop: 3 }}>{w.right} of {w.seen} right · {w.solid} of {w.total} shapes solid</div>
                </div>
                <button onClick={() => start({ only: [w.drill], label: DRILL_META[w.drill].label(scale) })}
                  style={{ background: 'transparent', border: `1px solid ${ACC}66`, color: ACC, borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer', minHeight: 44, touchAction: 'manipulation' }}>{'▶'} drill</button>
              </div>
            ))}
          <div style={{ fontSize: 10.5, color: '#666', lineHeight: 1.6, marginTop: 9 }}>Counted across every shape, so a drill you are shaky on everywhere shows up here even when no single shape looks bad.</div>
        </div>
      )}

      <div style={card}>
        <div style={hd}>The five boxes</div>
        {ladder.filter(l => l.id[0] === 'P').map(l => <LadderRow key={l.id} l={l} />)}
        <div style={{ ...hd, marginTop: 14 }}>Joins — getting between them</div>
        {ladder.filter(l => l.id[0] === 'J').map(l => <LadderRow key={l.id} l={l} />)}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10, marginTop: 9, paddingTop: 9, borderTop: '1px solid #1a1928' }}>
          <span style={{ color: '#2ed573' }}>{'●'} solid</span><span style={{ color: '#74b9ff' }}>{'●'} started</span><span style={{ color: '#777' }}>{'○'} not yet</span>
          <span style={{ color: '#555', marginLeft: 'auto' }}>one dot per drill</span>
        </div>
        <div style={{ fontSize: 10.5, color: '#666', lineHeight: 1.6, marginTop: 8 }}>
          Nothing is locked — the focus is a suggestion, and the joins are suggested once the boxes are solid. Minor and major blues keep separate records.
        </div>
      </div>

      {(fc.dueToday > 0 || fc.newCount > 0 || fc.soonest !== null) && (
        <div style={card}>
          <div style={hd}>Coming up</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64, marginBottom: 6 }}>
            {fc.buckets.map((b, i) => {
              const tallest = Math.max(1, ...fc.buckets.map(x => x.total));
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: 52, display: 'flex', flexDirection: 'column-reverse' }}>
                    {['box', 'join'].map(k => b.byKind[k] === 0 ? null : <div key={k} title={`${k === 'box' ? 'Boxes' : 'Joins'}: ${b.byKind[k]}`} style={{ height: `${(b.byKind[k] / tallest) * 100}%`, background: FC[k], borderRadius: 1 }} />)}
                  </div>
                  <div style={{ fontSize: 9, color: '#666' }}>{i === 0 ? 'now' : `+${i}`}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 9.5, color: '#777', paddingTop: 7, borderTop: '1px solid #1a1928' }}>
            {['box', 'join'].map(k => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: FC[k], display: 'inline-block' }} />{k === 'box' ? 'Boxes' : 'Joins'}</span>)}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.7, marginTop: 8 }}>
            {fc.dueToday > 0 ? `${fc.dueToday} card${fc.dueToday > 1 ? 's' : ''} due right now.` : fc.soonest === null ? 'Nothing scheduled yet.' : fc.soonest === 1 ? 'Next review is tomorrow.' : `Next review in ${fc.soonest} days.`}
            {fc.newCount > 0 && ` ${fc.newCount} never tried.`}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  GUIDE
// ════════════════════════════════════════════════════════════════════════
function GuideTab() {
  const [open, setOpen] = useState(0);
  const S = [
    { icon: '🎷', title: 'What the blues scale is', color: ACC, body:
`Two scales share the name.

MINOR BLUES — R  ♭3  4  ♭5  5  ♭7. The minor pentatonic plus one note, the ♭5. This is what most people mean by "the blues scale".

MAJOR BLUES — R  2  ♭3  3  5  6. The major pentatonic plus one note, the ♭3.

They are relatives: A minor blues and C major blues are the same six notes, so they use the same five boxes. What changes is which note is home — and that changes everything about how a line sounds.

Switch between them with the Minor / Major buttons above the key grid.` },
    { icon: '◆', title: 'The blue note', color: ACC, body:
`The blue note is the ONE note each blues scale adds to its pentatonic: the ♭5 in minor blues, the ♭3 in major blues. It is drawn as an indigo diamond everywhere in the app, so you see it before you read it.

Where it sits in a box: one fret above every 4 (minor) or every 2 (major), on the same string. It is the note your next finger falls on between the 4 and the 5 — which is why it works as a passing note, a bend target, and a "rub" you resolve.

Every box has it in every octave the box covers. In a few boxes that means a one-fret stretch past the box, exactly as the standard charts show it.

The Positions tab has two buttons under the scale — with the blue note, and without it. Play them back to back; that difference is what this app is about.` },
    { icon: '🔢', title: 'The five boxes, and why the numbers jump', color: '#74b9ff', body:
`Position 1 is the box whose lowest note on the low E string is the ROOT. Positions 2 to 5 start on the next pentatonic notes going up: ♭3, 4, 5, ♭7 in minor; 2, 3, 5, 6 in major.

A number always means the same grip, in every key.

So the arrows may read 3, 4, 5, 1, 2 as you walk up the neck. That is not a bug: the five boxes are a cycle, and which one sits lowest depends on the key. The title says which grip you are holding; the line under the arrows says where it sits.

A box is exactly every blues note inside its frets — nothing in those frets is left out. It is placed as low on the neck as it fits, so E minor box 1 is the open-position shape.` },
    { icon: '↔️', title: 'Joins', color: '#c7cbff', body:
`A join is two neighbouring boxes played as one shape: Join 1–2 is box 1 and box 2 together, three notes on every string.

It is the shape you slide through to get from one box to the next — most blues lines do not stay in one box. Join 5–1 runs from box 5 into box 1 an octave up.

In Practice the joins come after the five boxes. They are drawn on every question (they are too wide for an empty-neck question to fit a phone with big enough tap targets), so they only use the drills that show the shape.` },
    { icon: '⚖️', title: 'Comparing scales', color: '#ffd93d', body:
`"Compare with" lays a second scale over the same frets, always with the SAME root: A minor blues against A natural minor, A major, and both A pentatonics.

On the neck:
• a normal dot is in both scales;
• a ringed dot (or the ◆) is only in the blues scale;
• a dashed circle is only in the other scale.

The other scale is drawn at every fret the shape covers, so you are always comparing "this scale, in these frets" with "that scale, in these frets".

Against its own pentatonic, the only difference is the blue note — which is the whole definition of the blues scale. Against major, the minor blues has ♭3, ♭5 and ♭7 where the major scale has 3, 6 and 7: that clash is the sound of the blues over a dominant chord.` },
    { icon: '🎼', title: 'The 12-bar view', color: TEAL, body:
`The standard 12-bar in the current key: I7 I7 I7 I7 | IV7 IV7 I7 I7 | V7 IV7 I7 V7.

Pick a chord and every note in the box is coloured by what it is AGAINST THAT CHORD — not against the key:
• CHORD TONE (in its degree colour) — the root, 3rd, 5th or ♭7. Land here.
• COLOUR (dark violet) — a tension: 9, ♭9, ♯9, ♯11, ♭13, 13. Fine to play, wants to move.
• RUB (dashed) — the 4th or major 7th against a dominant chord. Move through it or bend off it; do not sit on it.

The teal rings show where the blue note resolves over that chord: always a half step to a chord tone. In A minor blues, the E♭ goes UP to E over A7 (the 5th), DOWN to D over D7 (the root), and either way over E7. In major blues over the IV7 the blue note is itself the ♭7 — a chord tone — so you can sit on it.

"Play the changes" loops the 12 bars and the neck follows the chords as they go by. Play along.` },
    { icon: '🎯', title: 'How to practise', color: ACC, body:
`Practice names ONE shape as your focus. Five boxes learned one at a time beats five half-learned at once; the joins come after.

The focus card has one pill per drill: green when solid, blue when started, hollow when not tried. The pills are BUTTONS — tap one to drill just that aspect on just that shape.

Under it is the ladder: the five boxes, then the five joins. Nothing is locked. "set" moves the focus; ▶ practises a shape WITHOUT moving it.

The Next up card at the top offers one thing to do, in this order: anything due, then drills on your focus you have never tried, then your weakest drill. "Review what's due" is exactly the cards that are owing — 7 due means 7 questions.

Minor and major blues keep separate records. Practice follows the Minor / Major switch.` },
    { icon: '✋', title: 'The drills', color: '#2dd4bf', body:
`Every question is answered by tapping ALL the right notes, then Check. Grading is exact — every right note, no extras. The counter shows how many there are.

THE SHAPE
• Every root — tap every root in the shape.
• Fill the gaps — five dots are missing. Put them back.
• Root to root — empty neck: one octave of the box, blue note included. Always seven notes.
• Build it — empty neck: the whole box.

THE BLUE NOTE
• Spot the blue note — every dot is grey; tap the blue ones.
• Add the blue note — the plain pentatonic is drawn; add the blue note everywhere it goes.
• Blue notes, blank neck — empty neck: tap just this box's blue notes. Off by default.

COMPARISON
• Into natural minor / Into the major scale — tap the dots the other scale does not have (they get crossed out) and the empty frets it adds.
• Into the other pentatonic — the same, across to the major pentatonic (or minor). Off by default.

The shape is drawn in one grey so the colours cannot give the answer away; the root keeps its white ring on the blue-note and comparison drills, because that is the anchor you would have in your head anyway.` },
    { icon: '🔑', title: 'When the key matters', color: '#ffd93d', body:
`Every question picks its own key, but it only makes a difference on some of them.

When the shape is DRAWN, the picture is identical in all twelve keys — only the fret numbers move. On an EMPTY NECK it is real work: you have to find the box before you can place anything. The window is eight frets wide with the box pushed a random number of frets in, so the framing does not say where it sits.

That is why only the empty-neck drills count toward a box's key coverage.` },
    { icon: '✅', title: 'When a shape counts as solid', color: '#2ed573', body:
`MASTERED (a filled pill) is two correct answers — the same bar as every other Fretworks trainer.

READY TO MOVE ON is stricter: every drill at three or more correct answers, and for a box, correct in at least six different keys on the empty-neck drills. Two correct answers can both land in the same couple of keys, which is not knowing a box.

A join has no empty-neck drills, so for a join three correct answers on every drill is the bar.

Weak spots counts real accuracy — "20 of 48 right" — once a drill has been tried at least four times; less than that is noise. "Coming up" shows when cards come back over the next week, boxes and joins stacked separately.` },
    { icon: '⚙️', title: 'Settings and your progress', color: '#888', body:
`Drills — turn any of the nine on or off. At least one stays on.
Questions per session — 8, 12 or 20.
Key for each question — all twelve, the seven common blues keys (E A D G C F B♭), or pin it to the key you are browsing.

Everything is stored on this device only. Progress backup exports a file; the Fretworks backup screen at /backup covers this app and every other one in the toolbox in one sweep.

Reset practice progress erases every drill result for both scales. It asks twice.` },
  ];
  return (
    <div style={{ padding: '14px 12px' }}>
      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.7, marginBottom: 12 }}>What everything in this app is for, and why a few things work the way they do.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {S.map((sec, i) => {
          const isO = open === i;
          return (
            <div key={i} style={{ background: '#13121f', borderRadius: 10, border: `1px solid ${isO ? sec.color + '55' : '#1a1928'}`, overflow: 'hidden' }}>
              <button onClick={() => setOpen(isO ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 46, touchAction: 'manipulation' }}>
                <span style={{ fontSize: 16, color: sec.color, width: 20, textAlign: 'center' }}>{sec.icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff' }}>{sec.title}</span>
                <span style={{ color: '#555', fontSize: 14, transform: isO ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>{'▾'}</span>
              </button>
              {isO && <div style={{ padding: '0 13px 14px' }}><div style={{ fontSize: 12.5, color: '#c8c6da', lineHeight: 1.75, whiteSpace: 'pre-line' }}>{sec.body.trim()}</div></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════════════
function SettingsTab({ scale, settings, onChange, onResetProgress }) {
  const set = patch => onChange({ ...settings, ...patch });
  const [confirmReset, setConfirmReset] = useState(false);
  const [banner, setBanner] = useState('idle');
  const drills = (settings.drills && settings.drills.length) ? settings.drills : DEFAULT_DRILLS;
  const toggleDrill = d => {
    const s = new Set(drills);
    s.has(d) ? s.delete(d) : s.add(d);
    if (!s.size) return;              // at least one, or Practice has nothing to ask
    set({ drills: DRILLS.filter(x => s.has(x)) });
  };
  const resetBanner = () => { try { localStorage.removeItem('bs_ios_hint'); } catch (e) {} setBanner('done'); setTimeout(() => setBanner('idle'), 1800); };
  return (
    <div style={{ padding: '14px 12px' }}>
      <a href="https://ko-fi.com/syncopatedsyntax" target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#FF5E5B', color: '#fff', borderRadius: 11, padding: '12px 20px', textDecoration: 'none', fontWeight: 800, fontSize: 14, boxShadow: '0 4px 14px #FF5E5B55', marginBottom: 14, touchAction: 'manipulation' }}>
        <span style={{ fontSize: 18 }}>{'☕'}</span> Buy me a coffee
      </a>

      <div style={card}>
        <div style={hd}>Practice drills</div>
        {['shape', 'blue', 'compare'].map(fam => (
          <div key={fam} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, color: '#777', fontWeight: 700, margin: '4px 2px 6px' }}>{FAMILY_NAME[fam]}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DRILLS.filter(d => DRILL_FAMILY[d] === fam).map(d => {
                const on = drills.includes(d);
                return <button key={d} onClick={() => toggleDrill(d)}
                  style={{ textAlign: 'left', padding: '10px 11px', borderRadius: 9, cursor: 'pointer', minHeight: 44, touchAction: 'manipulation', border: `1px solid ${on ? ACC : '#2a2840'}`, background: on ? ACC + '18' : 'transparent', color: on ? '#fff' : '#999' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{on ? '●' : '○'} {DRILL_META[d].label(scale)}{BLANK.has(d) ? <span style={{ color: '#777', fontWeight: 600 }}> · boxes only</span> : null}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{DRILL_META[d].ask(scale)}</div>
                </button>;
              })}
            </div>
          </div>
        ))}
        <div style={{ ...hd, marginTop: 8 }}>Questions per session</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[8, 12, 20].map(n => <button key={n} onClick={() => set({ sessionN: n })} style={seg((settings.sessionN || 12) === n)}>{n}</button>)}
        </div>
        <div style={{ ...hd, marginTop: 14 }}>Key for each question</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['random', 'All 12'], ['common', 'Blues keys'], ['fixed', 'Current key']].map(([v, l]) => <button key={v} onClick={() => set({ keyMode: v })} style={seg((settings.keyMode || 'random') === v)}>{l}</button>)}
        </div>
        <div style={{ fontSize: 10.5, color: '#666', marginTop: 8, lineHeight: 1.6 }}>
          A new key every question is the point — a box you only know in one place is a picture, not a shape. "Blues keys" is E, A, D, G, C, F and B♭. Pin it to the current key for a first pass at something new.
        </div>
      </div>

      <div style={card}>
        <div style={hd}>Progress</div>
        <ProgressBackup toolKey="blues" prefix="bs_" />
        <button onClick={() => { if (confirmReset) { onResetProgress(); setConfirmReset(false); } else setConfirmReset(true); }}
          style={{ width: '100%', marginTop: 10, background: 'transparent', border: `1px solid ${confirmReset ? '#ef4444' : '#2a2840'}`, color: confirmReset ? '#ff8f8f' : '#888', borderRadius: 9, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
          {confirmReset ? 'Tap again to erase every drill result' : 'Reset practice progress'}
        </button>
      </div>

      <div style={card}>
        <div style={hd}>Install banner</div>
        <button onClick={resetBanner} style={{ background: 'transparent', border: '1px solid #2a2840', color: banner === 'done' ? ACC : '#ccc', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44, touchAction: 'manipulation' }}>
          {banner === 'done' ? '✓ Reset — banner will show again' : 'Reset install banner'}
        </button>
      </div>
    </div>
  );
}

// ── Install / iOS banner (trimmed, as in Altered Trainer) ───────────────
function BannerStack() {
  const [dp, setDp] = useState(null);
  const [show, setShow] = useState(false);
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    if (standalone) return;
    const onBip = e => { e.preventDefault(); setDp(e); setShow(true); };
    window.addEventListener('beforeinstallprompt', onBip);
    if (isIOS) { try { if (!localStorage.getItem('bs_ios_hint')) setShow(true); } catch (e) { setShow(true); } }
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, [standalone, isIOS]);
  if (!show || standalone) return null;
  const close = () => { setShow(false); try { localStorage.setItem('bs_ios_hint', '1'); } catch (e) {} };
  return (
    <div style={{ position: 'fixed', bottom: 'max(14px,env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 24px)', maxWidth: 406, boxSizing: 'border-box', background: '#1a1830', border: '1px solid #2a2840', borderRadius: 12, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 30px #0008', zIndex: 50 }}>
      <div style={{ fontSize: 12, color: '#ddd', flex: 1, lineHeight: 1.4 }}>
        {isIOS && !dp ? <>Add to Home Screen: tap <b>Share</b> then <b>Add to Home Screen</b>.</> : <>Install Fretworks for offline practice.</>}
      </div>
      {dp && <button onClick={async () => { dp.prompt(); await dp.userChoice; setShow(false); }} style={{ background: ACC, color: '#0b0b2a', border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Install</button>}
      <button onClick={close} aria-label="Dismiss" style={{ background: 'transparent', color: '#888', border: 'none', fontSize: 18, cursor: 'pointer', padding: '0 4px', minWidth: 36, minHeight: 36 }}>{'×'}</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  APP
// ════════════════════════════════════════════════════════════════════════
// Storage: every key is `bs_`-prefixed so ProgressBackup and the toolbox-wide
// /backup sweep pick it up. Everything is read SYNCHRONOUSLY, in the useState
// initialisers, and written as JSON. Altered Trainer lost every preference on
// reload because an async load yielded before its write effects ran and the
// defaults were written over the stored values; a synchronous load has no gap
// for that to happen in.
const jstore = {
  get(k, dflt) { try { const v = localStorage.getItem(k); return v === null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const DEFAULT_SETTINGS = { sessionN: 12, keyMode: 'random', drills: DEFAULT_DRILLS };
const validShape = id => SHAPE_IDS.includes(id);
function loadRoot() { const n = Number(jstore.get('bs_root', 9)); return Number.isInteger(n) && n >= 0 && n < 12 ? n : 9; }
function loadPerScale(key, ok, dflt) {
  const v = jstore.get(key, null) || {};
  return Object.fromEntries(SCALE_IDS.map(s => [s, ok(v[s]) ? v[s] : dflt]));
}

export default function App() {
  const [root, setRoot] = useState(loadRoot);                 // A — the classic blues key
  const [scale, setScale] = useState(() => SCALE_IDS.includes(jstore.get('bs_scale', 'min')) ? jstore.get('bs_scale', 'min') : 'min');
  const [labelMode, setLabelMode] = useState(() => jstore.get('bs_label', 'degrees') === 'notes' ? 'notes' : 'degrees');
  const [settings, setSettings] = useState(() => {
    const s = { ...DEFAULT_SETTINGS, ...(jstore.get('bs_settings', {}) || {}) };
    s.drills = (Array.isArray(s.drills) ? s.drills : DEFAULT_DRILLS).filter(d => DRILLS.includes(d));
    if (!s.drills.length) s.drills = DEFAULT_DRILLS;
    return s;
  });
  // What you are browsing (bs_shape) and what the app recommends (bs_focus) are
  // separate, so wandering off in Positions does not rewrite the plan.
  const [shapeSel, setShapeSel] = useState(() => loadPerScale('bs_shape', validShape, 'P1'));
  const [focus, setFocus] = useState(() => loadPerScale('bs_focus', f => f && validShape(f.shape), { shape: 'P1', since: null }));
  const [srs, setSrs] = useState(() => jstore.get('bs_srs', {}) || {});
  const [tab, setTab] = useState('positions');
  const [drilling, setDrilling] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { jstore.set('bs_root', root); }, [root]);
  useEffect(() => { jstore.set('bs_scale', scale); }, [scale]);
  useEffect(() => { jstore.set('bs_label', labelMode); }, [labelMode]);
  useEffect(() => { jstore.set('bs_settings', settings); }, [settings]);
  useEffect(() => { jstore.set('bs_shape', shapeSel); }, [shapeSel]);

  // Grading writes synchronously: it happens inside a tap handler and the
  // queue advances immediately. keysSeen is a 12-bit mask of keys answered
  // correctly; seen/wrong are what Weak spots reads. Never back-fill them.
  const grade = useCallback((id, correct, atRoot) => {
    setSrs(prev => {
      const p = prev[id];
      const next = { ...prev, [id]: { ...updateSRS(p, correct), keysSeen: (p?.keysSeen || 0) | (correct ? (1 << atRoot) : 0), seen: (p?.seen || 0) + 1, wrong: (p?.wrong || 0) + (correct ? 0 : 1) } };
      jstore.set('bs_srs', next);
      return next;
    });
  }, []);
  const resetProgress = useCallback(() => {
    setSrs({}); jstore.set('bs_srs', {});
    const f = Object.fromEntries(SCALE_IDS.map(s => [s, { shape: 'P1', since: null }]));
    setFocus(f); jstore.set('bs_focus', f);
  }, []);
  const moveFocus = useCallback(id => {
    setFocus(prev => { const f = { ...prev, [scale]: { shape: id, since: todayStr() } }; jstore.set('bs_focus', f); return f; });
    setShapeSel(prev => ({ ...prev, [scale]: id }));
  }, [scale]);
  const onShapeId = useCallback(id => setShapeSel(prev => ({ ...prev, [scale]: id })), [scale]);

  // PWA bits, as in Altered Trainer: icon, theme, the shell's single manifest,
  // and the iOS standalone scroll lock.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `*{-webkit-tap-highlight-color:transparent}body{margin:0}`;
    document.head.appendChild(style);
    const makeIcon = size => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d'), u = size / 512;
      x.fillStyle = '#0f0e17'; x.beginPath();
      const rr = 96 * u; x.moveTo(rr, 0); x.arcTo(size, 0, size, size, rr); x.arcTo(size, size, 0, size, rr); x.arcTo(0, size, 0, 0, rr); x.arcTo(0, 0, size, 0, rr); x.fill();
      [['#ff4757', 120], ['#ff9f43', 190], ['#74b9ff', 260], ['#778ca3', 400]].forEach(([col, cx]) => { x.beginPath(); x.arc(cx * u, 300 * u, 30 * u, 0, 7); x.fillStyle = col; x.fill(); });
      x.fillStyle = ACC; x.beginPath(); x.moveTo(330 * u, 250 * u); x.lineTo(378 * u, 300 * u); x.lineTo(330 * u, 350 * u); x.lineTo(282 * u, 300 * u); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.font = `bold ${76 * u}px sans-serif`; x.textAlign = 'center'; x.fillText('blues', size / 2, 180 * u);
      return c.toDataURL('image/png');
    };
    const setLink = (rel, sizes, href) => { let l = document.querySelector(`link[rel="${rel}"]${sizes ? `[sizes="${sizes}"]` : ''}`); if (!l) { l = document.createElement('link'); l.rel = rel; if (sizes) l.sizes = sizes; document.head.appendChild(l); } l.href = href; };
    setLink('apple-touch-icon', '180x180', makeIcon(180)); setLink('icon', '512x512', makeIcon(512));
    const setMeta = (n, c) => { let m = document.querySelector(`meta[name="${n}"]`); if (!m) { m = document.createElement('meta'); m.name = n; document.head.appendChild(m); } m.content = c; };
    setMeta('theme-color', '#0f0e17');
    setMeta('viewport', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
    setMeta('apple-mobile-web-app-capable', 'yes');
    setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    setMeta('apple-mobile-web-app-title', 'Fretworks');
    let ml = document.querySelector('link[rel="manifest"]'); if (!ml) { ml = document.createElement('link'); ml.rel = 'manifest'; document.head.appendChild(ml); } ml.href = '/manifest.webmanifest';
    window.scrollTo(0, 0);
    const lock = () => { if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0); };
    window.addEventListener('scroll', lock, { passive: true });
    return () => { document.head.removeChild(style); window.removeEventListener('scroll', lock); };
  }, []);

  const TABS = [{ id: 'positions', label: 'Positions', icon: '🎸' }, { id: 'twelve', label: '12-bar', icon: '🎼' }, { id: 'practice', label: 'Practice', icon: '🎯' }, { id: 'guide', label: 'Guide', icon: '📖' }, { id: 'settings', label: 'Settings', icon: '⚙️' }];
  const CW = 600;
  const rel = scale === 'min' ? pc(root + 3) : pc(root - 3);
  const shapeId = shapeSel[scale], focusId = focus[scale].shape;

  return (
    <div style={{ background: '#0f0e17', height: '100dvh', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', color: '#fffffe', fontFamily: 'var(--font-body)', WebkitFontSmoothing: 'antialiased' }}>
      <AppHeader toolKey="blues">
        <button className={`fw-header-btn${labelMode === 'degrees' ? ' is-on' : ''}`} onClick={() => setLabelMode(m => m === 'degrees' ? 'notes' : 'degrees')}>
          {labelMode === 'degrees' ? '✦ Degrees' : 'Note names'}
        </button>
      </AppHeader>
      <TabBar toolKey="blues" tabs={TABS} active={tab} onChange={id => { setTab(id); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} />

      {/* Scale + key. Hidden during a drill (each question picks its own key,
          and this would contradict the card) and on Guide/Settings. */}
      {!drilling && tab !== 'guide' && tab !== 'settings' && <div style={{ borderBottom: '1px solid #1a1928' }}>
        <div style={{ padding: '8px 10px', maxWidth: CW, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {SCALE_IDS.map(id => <button key={id} onClick={() => setScale(id)} style={{ padding: '5px 11px', borderRadius: 14, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', minHeight: 32, border: `1px solid ${scale === id ? ACC : '#2a2840'}`, background: scale === id ? ACC : 'transparent', color: scale === id ? '#0b0b2a' : '#999', touchAction: 'manipulation' }}>{SCALES[id].short} blues</button>)}
            </div>
            <div style={{ fontSize: 10.5, color: '#777', textAlign: 'right', lineHeight: 1.3 }}>same notes as<br /><span style={{ color: '#aaa', fontWeight: 700 }}>{KEY_NAMES[rel]} {scale === 'min' ? 'major' : 'minor'} blues</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 3 }}>
            {KEY_NAMES.map((n, i) => <button key={i} onClick={() => setRoot(i)}
              style={{ padding: '7px 0', borderRadius: 6, fontSize: 10.5, fontWeight: 800, cursor: 'pointer', minHeight: 34, border: `1px solid ${root === i ? ACC : '#2a2840'}`, background: root === i ? ACC : 'transparent', color: root === i ? '#0b0b2a' : '#999', touchAction: 'manipulation' }}>{n}</button>)}
          </div>
        </div>
      </div>}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'none' }}>
        <div style={{ maxWidth: CW, margin: '0 auto', paddingBottom: 'max(80px,env(safe-area-inset-bottom))' }}>
          {tab === 'positions' && <PositionsTab root={root} scale={scale} labelMode={labelMode} shapeId={shapeId} onShapeId={onShapeId} focusId={focusId} onFocus={moveFocus} onPractise={() => setTab('practice')} />}
          {tab === 'twelve' && <TwelveBarTab root={root} scale={scale} labelMode={labelMode} shapeId={shapeId} onShapeId={onShapeId} />}
          {tab === 'practice' && <PracticeTab root={root} scale={scale} labelMode={labelMode} settings={settings} srs={srs} onGrade={grade} focusId={focusId} onFocus={moveFocus} onSession={setDrilling} />}
          {tab === 'guide' && <GuideTab />}
          {tab === 'settings' && <SettingsTab scale={scale} settings={settings} onChange={setSettings} onResetProgress={resetProgress} />}
        </div>
      </div>
      <BannerStack />
    </div>
  );
}
