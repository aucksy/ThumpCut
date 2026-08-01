import { Button } from '../actions/Button.jsx';

/** ThumpCut TrimSheet — bottom sheet, half height, opened from a clip's
 *  duration badge. The teal in-point handle opens already nudged into the
 *  clip; that quietly teaches the feature. */
export function TrimSheet({
  clipSrc, inPoint = '0:02.4', duration = '0:12', inPct = 18, width = 393, onDone, style = {},
}) {
  return (
    <div style={{
      width, boxSizing: 'border-box', background: 'var(--tc-panel)',
      borderRadius: 'var(--r-card) var(--r-card) 0 0', padding: '8px 20px 28px',
      boxShadow: '0 -12px 40px rgba(0,0,0,.5)', ...style,
    }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--tc-bone-12)', margin: '0 auto 16px' }} />
      <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 'var(--r-card)', overflow: 'hidden', background: '#1B1C1F' }}>
        {clipSrc && <img src={clipSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(23,24,26,.72)', borderRadius: 'var(--r-chip)', padding: '2px 6px 2px 5px' }}>
          <svg width="8" height="9" viewBox="0 0 8 9" aria-hidden="true"><path d="M0.5 0.8v7.4L7.4 4.5 0.5 0.8z" fill="var(--tc-cool)"/></svg>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 500, color: 'var(--tc-bone)' }}>{duration}</span>
        </div>
      </div>
      {/* filmstrip scrubber */}
      <div style={{ position: 'relative', height: 56, borderRadius: 'var(--r-chip)', overflow: 'hidden', marginTop: 16 }}>
        <div style={{ display: 'flex', height: '100%' }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{
              flex: 1, backgroundImage: clipSrc ? 'url(' + clipSrc + ')' : 'none',
              backgroundColor: '#1B1C1F', backgroundSize: '190% auto',
              backgroundPosition: (i * 13) + '% ' + (30 + i * 5) + '%',
              borderRight: i < 7 ? '1px solid rgba(23,24,26,.8)' : 'none',
            }} />
          ))}
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: inPct + '%', background: 'rgba(23,24,26,.72)' }} />
        {/* in-point handle — 44pt tap target around a 3px teal bar */}
        <div role="slider" aria-label={'Clip start point, ' + inPoint} aria-valuenow={inPct} tabIndex={0}
          style={{ position: 'absolute', top: 0, bottom: 0, left: inPct + '%', width: 44, marginLeft: -22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 3, marginLeft: -1.5, background: 'var(--tc-cool)', borderRadius: 1.5 }} />
          <div style={{ position: 'relative', width: 14, height: 26, borderRadius: 4, background: 'var(--tc-cool)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <div style={{ width: 1.5, height: 12, background: 'rgba(23,24,26,.5)', borderRadius: 1 }} />
            <div style={{ width: 1.5, height: 12, background: 'rgba(23,24,26,.5)', borderRadius: 1 }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 13, fontWeight: 600, color: 'var(--tc-cool)', fontVariantNumeric: 'tabular-nums' }}>IN {inPoint}</span>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 12, color: 'var(--tc-bone-55)', fontVariantNumeric: 'tabular-nums' }}>{duration}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tc-bone-55)', marginTop: 6 }}>Pick the moment this clip starts from.</div>
      <Button full onClick={onDone} style={{ marginTop: 18 }}>Done</Button>
    </div>
  );
}
