import { OPEN_MIDI, STR_LABELS, pretty, noteName, ckey } from './theory.js';

// ── Colours ──────────────────────────────────────────────────────────────
// DC is the toolbox's shared degree palette (Altered/Melodic Minor), plus the
// b6 it never needed. The blue note does not use its degree colour: it is
// always the app's indigo, and always a DIAMOND, so it reads as "the blue note"
// before you read a label — and stays distinct from the light-blue 4 that sits
// one fret below it in every minor box.
export const DC = {
  'R': '#ff4757', '3': '#ffd93d', 'b3': '#ff9f43', '7': '#ff6b6b', 'b7': '#fdcb6e',
  '9': '#2ed573', '13': '#00b894', '6': '#1e9e77', '#11': '#0fbcf9', '5': '#778ca3',
  'b9': '#7c5cbf', '#9': '#6c5ce7', 'b13': '#9b2335', 'b5': '#fd79a8', '#5': '#a29bfe',
  '4': '#74b9ff', '2': '#b2d9ff', '11': '#81ecec', 'b6': '#9b2335', 'b2': '#7c5cbf',
};
export const BLUE = '#818cf8';
export const TEAL = '#2dd4bf';       // toolbox: teal = resolution / where it lands
export const txtOn = hex => { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff'; };
const ROLE_FILL = { colour: '#34315a', rub: '#0f0e17' };

// Sideways neck: low E at the BOTTOM, high e on top, frets left → right (the
// toolbox's neck-view convention). Dots use cy = ry(5 - s).
//
// The viewBox is a fixed ~320 units wide and the fret width stretches to fill
// it, so a five-fret box gets wide, easy cells instead of a tiny diagram. Only
// past ~9 frets does it fall back to a minimum width and scroll (full neck).
//
// Props (all optional beyond cells/root):
//   labelMode    'degrees' | 'notes'
//   mono         every dot one grey, no labels, no diamond — for drills, where
//                colour or shape would hand you the answer
//   rootRing     with mono: keep the white ring on roots, as an anchor
//   compare      { only:Set<"s_f">, extra:[{s,f,deg}] } — ring the blues-only
//                notes, draw the other scale's extra notes dashed
//   roles        Map "s_f" → {role,label} — 12-bar view, colour by role
//   targets      Set "s_f" — teal rings where the blue note resolves
//   highlight    Set "s_f" — pulse these, dim the rest
//   onTapCell    (s,f) => void; the tap grid is the LAST child (SVG has no
//                z-index, paint order decides hit testing)
//   marks        [{s,f,kind:'ok'|'bad'|'reveal'}]
//   selected     Set "s_f" picked but not yet checked
//   pickStyle    'mark' (ring the pick) | 'morph' (a picked dot is being
//                REMOVED, so it dims; a picked empty fret is being ADDED)
//   win          {lo,hi} — the board and the answer MUST share one window
//   rowH         row height in viewBox units (36 in drills → 44px cells)
//   scroll       draw at a fixed scale and let the parent scroll (full neck)
export default function Fretboard({ cells, root, labelMode = 'degrees', mono, rootRing, compare, roles, targets,
  highlight, onTapCell, marks, selected, pickStyle = 'mark', win, rowH = 30, scroll }) {
  if (!cells.length && !win) return null;
  const fs = cells.map(c => c.f);
  const lo = win ? win.lo : Math.max(0, Math.min(...fs) - 1), hi = win ? win.hi : Math.max(...fs) + 1;
  const nf = hi - lo + 1;
  const padL = 22, padR = 8, VBW = 320;
  const FW = scroll ? 34 : Math.max(26, (VBW - padL - padR) / nf);
  const RH = rowH, padT = RH * 0.5 + 2, padB = RH * 0.5 + 16;
  const W = padL + nf * FW + padR, H = padT + 5 * RH + padB;
  const fx = f => padL + (f - lo + 0.5) * FW, fxl = f => padL + (f - lo) * FW, ry = r => padT + r * RH;
  const R = Math.min(12.5, RH * 0.4, FW * 0.36);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hl = highlight || null;
  const cellSet = new Set(cells.map(c => ckey(c.s, c.f)));
  const lbl = c => labelMode === 'notes' ? noteName(root, OPEN_MIDI[c.s] + c.f) : pretty(c.deg);
  const MARK = { ok: '#2ed573', bad: '#ef4444', reveal: TEAL };
  const diamond = (cx, cy, r) => `M${cx} ${cy - r * 1.22}L${cx + r * 1.22} ${cy}L${cx} ${cy + r * 1.22}L${cx - r * 1.22} ${cy}Z`;
  const fsz = L => (L.length > 2 ? 7.5 : L.length > 1 ? 9 : 10.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={scroll
      ? { display: 'block', margin: '0 auto', width: W * 1.12, height: H * 1.12, userSelect: 'none', WebkitUserSelect: 'none' }
      : { display: 'block', margin: '0 auto', width: '100%', height: 'auto', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}>
      {Array.from({ length: 6 }, (_, r) => <line key={'s' + r} x1={padL} y1={ry(r)} x2={padL + nf * FW} y2={ry(r)} stroke="#34324d" strokeWidth={0.9 + (r * 0.32)} />)}
      {Array.from({ length: nf + 1 }, (_, j) => { const f = lo + j; const nut = f === 0; return <line key={'f' + j} x1={fxl(f)} y1={ry(0)} x2={fxl(f)} y2={ry(5)} stroke={nut ? '#cccccc' : '#2a2840'} strokeWidth={nut ? 3 : 1.4} />; })}
      {[3, 5, 7, 9, 15, 17, 19, 21].filter(f => f >= lo && f <= hi && f > 0).map(f => <circle key={'m' + f} cx={fx(f)} cy={ry(2.5)} r={2.6} fill="#2a2840" />)}
      {[12].filter(f => f >= lo && f <= hi).map(f => <g key="m12"><circle cx={fx(f)} cy={ry(1.5)} r={2.6} fill="#2a2840" /><circle cx={fx(f)} cy={ry(3.5)} r={2.6} fill="#2a2840" /></g>)}
      {STR_LABELS.map((s, r) => <text key={'l' + r} x={6} y={ry(5 - r) + 3.5} fontSize={10} fill="#777" fontFamily="monospace">{s}</text>)}
      {Array.from({ length: nf }, (_, j) => { const f = lo + j; if (f === 0) return null; const mark = [3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f);
        return <text key={'n' + j} x={fx(f)} y={H - 5} fontSize={9.5} fill={mark ? '#9a98b0' : '#55536a'} textAnchor="middle" fontFamily="monospace">{f}</text>; })}

      {/* The other scale's notes that blues does not have: dashed, hollow. */}
      {compare && compare.extra.map((c, i) => { const cx = fx(c.f), cy = ry(5 - c.s), L = labelMode === 'notes' ? noteName(root, OPEN_MIDI[c.s] + c.f) : pretty(c.deg);
        return <g key={'x' + i}>
          <circle cx={cx} cy={cy} r={R} fill="#0f0e17" stroke="#b7b5cf" strokeWidth={1.5} strokeDasharray="3 2.4" />
          <text x={cx} y={cy + 0.5} fontSize={fsz(L)} fill="#d4d2e8" textAnchor="middle" dominantBaseline="central" fontWeight="bold">{L}</text>
        </g>; })}

      {/* Where the blue note lands, under the dots so a dot keeps its colour. */}
      {targets && [...targets].map(k => { const [s, f] = k.split('_').map(Number);
        return <circle key={'t' + k} cx={fx(f)} cy={ry(5 - s)} r={R + 4.5} fill="none" stroke={TEAL} strokeWidth={2.6} />; })}

      {cells.map((c, i) => {
        const k = ckey(c.s, c.f), cx = fx(c.f), cy = ry(5 - c.s);
        const lit = !hl || hl.has(k), dim = hl && !lit;
        const removing = pickStyle === 'morph' && selected && selected.has(k);
        if (mono) {
          const ring = rootRing && c.deg === 'R';
          return <g key={i} opacity={removing ? 0.3 : dim ? 0.28 : 1}>
            <circle cx={cx} cy={cy} r={R} fill="#4a4a6a" stroke={ring ? '#fff' : 'none'} strokeWidth={ring ? 2 : 0}>
              {hl && lit && !reduced && <animate attributeName="r" values={`${R};${R + 2.5};${R}`} dur="1.1s" repeatCount="indefinite" />}
            </circle>
          </g>;
        }
        const role = roles ? roles.get(k) : null;
        const L = role ? pretty(role.label) : lbl(c);
        const label = labelMode === 'notes' ? lbl(c) : L;
        if (c.blue) {
          return <g key={i} opacity={dim ? 0.28 : 1}>
            <path d={diamond(cx, cy, R)} fill={BLUE} stroke="#e0e3ff" strokeWidth={role && role.role === 'rub' ? 0 : 1.2} />
            <text x={cx} y={cy + 0.5} fontSize={fsz(label)} fill="#0b0b2a" textAnchor="middle" dominantBaseline="central" fontWeight="bold">{label}</text>
          </g>;
        }
        let fill = DC[c.deg] || '#888', stroke = c.deg === 'R' ? '#fff' : 'none', sw = c.deg === 'R' ? 2 : 0, txt = null, dash;
        if (role) {
          if (role.role === 'chord') { fill = DC[role.label] || '#888'; stroke = role.label === 'R' ? '#fff' : 'none'; sw = role.label === 'R' ? 2 : 0; }
          else if (role.role === 'colour') { fill = ROLE_FILL.colour; stroke = '#6e6aa8'; sw = 1.2; txt = '#d9d6ff'; }
          else { fill = ROLE_FILL.rub; stroke = '#6b6880'; sw = 1.4; txt = '#8f8ca6'; dash = '2.5 2'; }
        }
        const onlyRing = compare && compare.only.has(k);
        return <g key={i} opacity={dim ? 0.28 : 1}>
          {onlyRing && <circle cx={cx} cy={cy} r={R + 3.6} fill="none" stroke={BLUE} strokeWidth={2.2} />}
          <circle cx={cx} cy={cy} r={R} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
          <text x={cx} y={cy + 0.5} fontSize={fsz(label)} fill={txt || txtOn(fill)} textAnchor="middle" dominantBaseline="central" fontWeight="bold">{label}</text>
        </g>;
      })}

      {/* Picked, not yet checked. In a comparison drill a picked DOT is being
          removed (it dimmed above, and gets a strike); a picked empty fret is
          being added. Everywhere else a pick is just a ring. */}
      {selected && [...selected].map(k => { const [s, f] = k.split('_').map(Number); const cx = fx(f), cy = ry(5 - s);
        if (pickStyle === 'morph' && cellSet.has(k)) return <line key={'sel' + k} pointerEvents="none" x1={cx - R} y1={cy + R} x2={cx + R} y2={cy - R} stroke={BLUE} strokeWidth={2.6} strokeLinecap="round" />;
        return <circle key={'sel' + k} pointerEvents="none" cx={cx} cy={cy} r={cellSet.has(k) ? R + 3.6 : R}
          fill={cellSet.has(k) ? 'none' : BLUE + '44'} stroke={BLUE} strokeWidth={2.6} />; })}

      {(marks || []).map((m, i) => { const cx = fx(m.f), cy = ry(5 - m.s), col = MARK[m.kind] || '#fff';
        if (m.kind === 'bad') return <g key={'mk' + i} pointerEvents="none" stroke={col} strokeWidth={3} strokeLinecap="round">
          <line x1={cx - 8} y1={cy - 8} x2={cx + 8} y2={cy + 8} /><line x1={cx + 8} y1={cy - 8} x2={cx - 8} y2={cy + 8} /></g>;
        return <circle key={'mk' + i} pointerEvents="none" cx={cx} cy={cy} r={R + 4} fill="none" stroke={col}
          strokeWidth={m.kind === 'ok' ? 3 : 2.4} strokeDasharray={m.kind === 'reveal' ? '4 3' : undefined} />; })}

      {/* Tap grid — last child on purpose, and it covers the whole window: half
          the drills are answered on a fret with no dot on it. */}
      {onTapCell && <g>
        {Array.from({ length: 6 }).flatMap((_, s) => Array.from({ length: nf }).map((_, j) => { const f = lo + j;
          return <rect key={`g${s}_${f}`} x={fxl(f)} y={ry(5 - s) - RH / 2} width={FW} height={RH}
            fill="transparent" style={{ cursor: 'pointer', touchAction: 'manipulation' }} onClick={() => onTapCell(s, f)} />; }))}
      </g>}
    </svg>
  );
}
