/** Bottom sheet for choosing a clip's start moment. The teal in-point handle
 * opens already nudged into the clip. */
interface TrimSheetProps {
  clipSrc?: string;
  /** mono in-point, e.g. "0:02.4" */
  inPoint?: string;
  duration?: string;
  /** handle position as % of filmstrip */
  inPct?: number;
  width?: number;
  onDone?: () => void;
  style?: React.CSSProperties;
}
export declare function TrimSheet(props: TrimSheetProps): JSX.Element;
