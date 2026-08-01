/** ThumpCut MediaTile. A clip is never "a photo with a play icon on it":
 *  video tiles carry a teal border, a play glyph and their length in mono.
 *  The order badge doubles as selection — filled teal with the pick number. */
export function MediaTile({
  src, type = 'photo', duration = '0:12', order = null,
  selected = false, dimmed = false, unavailable = false, size = 110, style = {},
}) {
  const label = (type === 'video' ? 'Video clip' : 'Photo') +
    (order ? ', item ' + order : '') + (selected ? ', selected' : ', not selected') +
    (unavailable ? ', unavailable' : '');
  const border = type === 'video'
    ? '1.5px solid ' + (dimmed ? 'rgba(79,184,196,.3)' : selected ? 'var(--tc-cool)' : 'var(--tc-cool-50)')
    : selected ? '1.5px solid var(--tc-bone-35)' : '1px solid var(--tc-bone-08)';
  return (
    <div role="checkbox" aria-checked={selected} aria-label={label} tabIndex={0} style={{
      position: 'relative', width: size, height: size, borderRadius: 'var(--r-card)',
      overflow: 'hidden', background: 'var(--tc-panel)', border,
      opacity: dimmed ? 0.35 : 1, boxSizing: 'border-box', flexShrink: 0, ...style,
    }}>
      {src && <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: unavailable ? 'grayscale(1)' : 'none' }} />}
      {unavailable && <div style={{ position: 'absolute', inset: 0, background: 'rgba(23,24,26,.65)' }} />}
      {/* order badge: empty ring = not picked, teal fill + number = pick order */}
      <div style={{
        position: 'absolute', top: 7, left: 7, minWidth: 20, height: 20, padding: '0 4px',
        borderRadius: 'var(--r-chip)', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? 'var(--tc-cool)' : 'rgba(23,24,26,.3)',
        border: selected ? 'none' : '1.5px solid rgba(234,230,222,.45)',
        fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 600,
        color: 'var(--tc-graphite)',
      }}>{selected && order ? order : ''}</div>
      {type === 'video' && !unavailable && (
        <div style={{
          position: 'absolute', bottom: 6, right: 6, display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(23,24,26,.72)', borderRadius: 'var(--r-chip)', padding: '2px 6px 2px 5px',
        }}>
          <svg width="8" height="9" viewBox="0 0 8 9" aria-hidden="true"><path d="M0.5 0.8v7.4L7.4 4.5 0.5 0.8z" fill="var(--tc-cool)"/></svg>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, fontWeight: 500, color: 'var(--tc-bone)', fontVariantNumeric: 'tabular-nums' }}>{duration}</span>
        </div>
      )}
      {unavailable && (
        <div style={{ position: 'absolute', top: 7, right: 7, width: 20, height: 20, borderRadius: 'var(--r-chip)', background: 'rgba(23,24,26,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1.2 11 10H1L6 1.2z" fill="none" stroke="var(--tc-bone-70)" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6 4.6v2.6" stroke="var(--tc-bone-70)" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="6" cy="8.7" r=".7" fill="var(--tc-bone-70)"/>
          </svg>
        </div>
      )}
    </div>
  );
}
