/** ThumpCut TrackNotice — the quiet, non-alarming treatment for a substituted
 *  or retired track. The user's work is not lost; the tone reflects that. */
export function TrackNotice({ children, style = {} }) {
  return (
    <div role="status" style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: 'var(--tc-panel)', borderRadius: 'var(--r-card)',
      border: '1px solid var(--tc-bone-08)', padding: '12px 14px', ...style,
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
        <path d="M2.5 6a5 5 0 0 1 8.7-2.2M13.5 10a5 5 0 0 1-8.7 2.2" stroke="var(--tc-bone-55)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M11.5 1.5v2.5H9M4.5 14.5V12H7" stroke="var(--tc-bone-55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5, color: 'var(--tc-bone-70)' }}>{children}</div>
    </div>
  );
}
