/** Media picker tile. Video = teal border + play glyph + mono length; the
 * order badge doubles as selection (teal fill + pick number). */
interface MediaTileProps {
  src?: string;
  type?: 'photo' | 'video';
  /** mono clip length, e.g. "0:12" (video only) */
  duration?: string;
  /** pick order shown when selected */
  order?: number;
  selected?: boolean;
  /** video-cap-reached treatment (35% opacity) */
  dimmed?: boolean;
  /** failed download: grayscale, scrim, warning badge, deselected */
  unavailable?: boolean;
  size?: number;
  style?: React.CSSProperties;
}
export declare function MediaTile(props: MediaTileProps): JSX.Element;
