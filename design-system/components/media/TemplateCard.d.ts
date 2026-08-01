/** Template gallery card: 9:16 preview, display name, mono meta,
 * compressed beat ruler along the bottom. */
interface TemplateCardProps {
  name?: string;
  bpm?: number;
  /** e.g. "8–16" */
  items?: string;
  src?: string;
  /** preview not yet cached: first frame as a still — never an empty box */
  still?: boolean;
  /** teal outline, used in the preview screen's template strip */
  selected?: boolean;
  width?: number;
  seed?: number;
  style?: React.CSSProperties;
}
export declare function TemplateCard(props: TemplateCardProps): JSX.Element;
