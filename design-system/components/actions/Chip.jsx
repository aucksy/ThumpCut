/** ThumpCut Chip — mood filters. 4pt radius. Selected = teal, because teal
 *  means "you chose this". */
export function Chip({ children, selected = false, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
      height: 36, padding: '0 14px', borderRadius: 'var(--r-chip)',
      background: selected ? 'var(--tc-cool-12)' : 'transparent',
      border: '1px solid ' + (selected ? 'var(--tc-cool)' : 'var(--tc-bone-12)'),
      color: selected ? 'var(--tc-cool)' : 'var(--tc-bone-70)',
      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      transition: 'all var(--dur-fast) linear', ...style,
    }}>{children}</button>
  );
}
