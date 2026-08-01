/**
 * The signature element: the track's beat grid, energy-tinted (cool → bone →
 * signal, clip at the drop). Photo markers bone, video markers teal.
 * Always decorative — rendered aria-hidden.
 * @startingPoint section="Components" subtitle="Beat ruler — idle, playing, compressed" viewport="700x340"
 */
interface BeatRulerProps {
  beats?: number;
  /** varies the generated energy curve + cut pattern */
  seed?: number;
  /** explicit cut markers; auto-generated when omitted */
  cuts?: { beat: number; type: 'photo' | 'video' }[];
  /** amber playhead sweeps, markers pulse on hit (120ms, scale only) */
  playing?: boolean;
  /** reduced motion: playhead keeps moving, pulses off */
  reduced?: boolean;
  /** 4px strip for template cards */
  compressed?: boolean;
  height?: number;
  /** seconds per playhead pass */
  sweepDur?: number;
  style?: React.CSSProperties;
}
export declare function BeatRuler(props: BeatRulerProps): JSX.Element;
