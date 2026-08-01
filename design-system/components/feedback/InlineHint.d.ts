/** Quiet guidance under a control. */
interface InlineHintProps {
  /** 'danger' only for over-limit copy */
  tone?: 'neutral' | 'danger';
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function InlineHint(props: InlineHintProps): JSX.Element;
