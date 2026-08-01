import { BeatRuler } from '../ruler/BeatRuler.jsx';

/** ThumpCut TemplateCard. 9:16 preview, display-type name, mono meta line,
 *  compressed beat ruler along the bottom. still=true renders the first frame
 *  as a still (never an empty box, never a shimmer). */
export function TemplateCard({
  name = 'Night drive', bpm = 128, items = '8–16', src,
  still = false, selected = false, width = 166, seed = 3, style = {},
}) {
  return (
    <div style={{
      width, borderRadius: 'var(--r-card)', overflow: 'hidden', background: 'var(--tc-panel)',
      border: selected ? '2px solid var(--tc-cool)' : '1px solid var(--tc-bone-08)',
      boxSizing: 'border-box', flexShrink: 0, ...style,
    }}>
      <div style={{ position: 'relative', aspectRatio: '9/13', background: '#1B1C1F' }}>
        {src && <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontStretch: '80%', letterSpacing: '-.01em', fontSize: width < 120 ? 13 : 16, color: 'var(--tc-bone)', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: width < 120 ? 9.5 : 10.5, fontWeight: 500, color: 'var(--tc-bone-55)', marginTop: 3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{bpm} BPM · {items} items</div>
      </div>
      <BeatRuler compressed seed={seed} beats={24} style={{ marginTop: 9 }} />
    </div>
  );
}
