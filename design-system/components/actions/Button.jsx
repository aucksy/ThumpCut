/** ThumpCut Button. Primary = bone fill (the only loud thing on a screen),
 *  secondary = hairline outline, destructive = red text only, ghost = quiet text. */
export function Button({ variant = 'primary', children, disabled = false, full = false, small = false, onClick, style = {} }) {
  const base = {
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: small ? 14 : 16, letterSpacing: '.01em',
    height: small ? 44 : 52, padding: '0 20px', borderRadius: 'var(--r-card)', border: '1px solid transparent',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: full ? '100%' : 'auto', cursor: disabled ? 'default' : 'pointer',
    transition: 'transform var(--dur-fast) var(--spring), background var(--dur-fast) linear',
    WebkitTapHighlightColor: 'transparent',
  };
  const variants = {
    primary: disabled
      ? { background: 'var(--tc-bone-12)', color: 'var(--tc-bone-35)' }
      : { background: 'var(--tc-bone)', color: 'var(--tc-graphite)' },
    secondary: { background: 'transparent', borderColor: 'var(--tc-bone-35)', color: 'var(--tc-bone)' },
    destructive: { background: 'transparent', color: 'var(--tc-clip)' },
    ghost: { background: 'transparent', color: 'var(--tc-bone-55)' },
  };
  return (
    <button
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onPointerDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(.97)'; }}
      onPointerUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onPointerLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      style={{ ...base, ...variants[variant], ...style }}
    >{children}</button>
  );
}
