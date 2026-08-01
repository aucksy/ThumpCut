/** ThumpCut BeatRuler — the signature element. Renders a track's beat grid,
 *  tinted by the energy curve (cool → bone → signal, clip at the drop).
 *  Photo cut markers are bone squares; video cut markers are teal bars.
 *  Decorative: always aria-hidden. */
export function BeatRuler({
  beats = 32,
  seed = 3,
  cuts = null,           // [{beat, type:'photo'|'video'}] — auto-generated if null
  playing = false,       // amber playhead sweeps, markers pulse on hit
  reduced = false,       // reduced motion: playhead keeps moving, pulses off
  compressed = false,    // 4px strip for template cards
  height = 44,
  sweepDur = 7.5,        // seconds per pass
  style = {},
}) {
  const COOL = [79, 184, 196], BONE = [234, 230, 222], SIGNAL = [255, 158, 44], CLIP = [226, 61, 40];
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c) => 'rgb(' + c.join(',') + ')';
  const energyAt = (i) => {
    const t = i / (beats - 1);
    const e = 0.18 + 0.72 * t + 0.14 * Math.sin(i * 1.9 + seed * 2.7);
    return { e: Math.min(1, Math.max(0.05, e)), drop: t >= 0.84 && t <= 0.95 };
  };
  const colorAt = (i) => {
    const { e, drop } = energyAt(i);
    if (drop) return rgb(CLIP);
    return e < 0.5 ? rgb(lerp(COOL, BONE, e / 0.5)) : rgb(lerp(BONE, SIGNAL, (e - 0.5) / 0.5));
  };
  const cutList = cuts || Array.from({ length: Math.floor(beats / 2) }, (_, k) => ({
    beat: k * 2, type: (k + seed) % 3 === 1 ? 'video' : 'photo',
  }));
  const cutMap = {}; cutList.forEach((c) => { cutMap[c.beat] = c.type; });

  if (compressed) {
    return (
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 4, width: '100%', ...style }}>
        {Array.from({ length: beats }, (_, i) => {
          const type = cutMap[i];
          return <div key={i} style={{
            flex: 1, borderRadius: 1,
            height: type ? '100%' : '50%',
            background: type === 'video' ? 'var(--tc-cool)' : type === 'photo' ? 'rgba(234,230,222,.9)' : colorAt(i),
            opacity: type ? 1 : 0.35,
          }} />;
        })}
      </div>
    );
  }

  const beatH = Math.round(height * 0.2), downH = Math.round(height * 0.36);
  return (
    <div aria-hidden="true" style={{ position: 'relative', height, width: '100%', ...style }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'var(--tc-bone-12)' }} />
      {Array.from({ length: beats }, (_, i) => {
        const left = (i / (beats - 1)) * 100;
        const down = i % 4 === 0;
        const type = cutMap[i];
        const pulse = playing && !reduced && type;
        return (
          <React.Fragment key={i}>
            <div style={{
              position: 'absolute', bottom: 0, left: left + '%', width: 2, marginLeft: -1,
              height: down ? downH : beatH, borderRadius: 1,
              background: colorAt(i), opacity: down ? 0.8 : 0.45,
            }} />
            {type && <div style={{
              position: 'absolute', left: left + '%', bottom: downH + Math.round(height * 0.18),
              width: type === 'video' ? 5 : 5, height: type === 'video' ? 12 : 5,
              marginLeft: -2.5, borderRadius: type === 'video' ? 2.5 : 1.5,
              background: type === 'video' ? 'var(--tc-cool)' : 'var(--tc-bone)',
              animation: pulse ? 'tc-pulse ' + sweepDur + 's linear infinite' : 'none',
              animationDelay: pulse ? (left / 100) * sweepDur + 's' : '0s',
            }} />}
          </React.Fragment>
        );
      })}
      {playing && <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        animation: 'tc-sweep ' + sweepDur + 's linear infinite', willChange: 'transform',
      }}>
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: -1, width: 2, borderRadius: 1,
          background: 'var(--tc-signal)', boxShadow: '0 0 10px rgba(255,158,44,.7)',
        }} />
      </div>}
    </div>
  );
}
