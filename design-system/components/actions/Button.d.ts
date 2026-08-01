/** ThumpCut button. Primary is the only filled control on a screen. */
interface ButtonProps {
  /** 'primary' bone fill · 'secondary' hairline outline · 'destructive' red text only · 'ghost' quiet text */
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  disabled?: boolean;
  /** full width */
  full?: boolean;
  /** 44px height instead of 52px */
  small?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
