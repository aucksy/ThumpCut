/** ThumpCut InlineHint — quiet guidance under a control.
 *  tone="danger" only for over-limit copy. */
export function InlineHint({ children, tone = 'neutral', style = {} }) {
  return (
    <div style={{
      fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.45,
      color: tone === 'danger' ? 'var(--tc-clip)' : 'var(--tc-bone-55)', ...style,
    }}>{children}</div>
  );
}
