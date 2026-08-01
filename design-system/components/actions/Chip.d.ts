/** Mood filter chip, 4pt radius. Selected = teal ("you chose this"). */
interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Chip(props: ChipProps): JSX.Element;
