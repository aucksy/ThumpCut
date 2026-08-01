/** ThumpCut Toast — transient message, bottom of screen. States what happened
 *  and what to do. No apology, no vagueness, no "Oops." */
export function Toast({ children, style = {} }) {
  return (
    <div role="status" style={{
      maxWidth: 340, background: 'var(--tc-panel-2)', borderRadius: 'var(--r-card)',
      border: '1px solid var(--tc-bone-08)', padding: '12px 16px',
      fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.45, color: 'var(--tc-bone)',
      boxShadow: '0 8px 24px rgba(0,0,0,.45)', ...style,
    }}>{children}</div>
  );
}
