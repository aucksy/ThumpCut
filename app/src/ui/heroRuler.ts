/**
 * The beat grid the first-launch hero animates against.
 *
 * Purely decorative and generated, not a real track: on first launch there is no catalogue
 * yet, and the design brief asks for the ruler animating alone as the hero. A steady 128 BPM
 * with a rising energy arc and a mix of photo and clip markers shows exactly what the app
 * does before the user has picked anything.
 */

const BPM = 128;
const BEAT_COUNT = 32;
const BEAT_SEC = 60 / BPM;

const beats = Array.from({ length: BEAT_COUNT }, (_, index) =>
  Number((index * BEAT_SEC).toFixed(6)),
);

const downbeats = beats.filter((_, index) => index % 4 === 0);

/** Low at the start, a drop three quarters through — the shape of most reels. */
const energy = beats.map((_, index) => {
  const position = index / (BEAT_COUNT - 1);
  const arc = 0.2 + 0.75 * position;
  const drop = position > 0.72 && position < 0.9 ? 0.15 : 0;
  return Math.min(1, Math.max(0, arc + drop));
});

/** Every other beat changes picture; every third of those is a clip. */
const markers = beats
  .filter((_, index) => index % 2 === 0)
  .map((atSec, index) => ({
    atSec,
    kind: (index % 3 === 1 ? "video" : "photo") as "photo" | "video",
  }));

export const HERO_RULER = {
  beats,
  downbeats,
  energy,
  markers,
  startSec: 0,
  durationSec: BEAT_COUNT * BEAT_SEC,
} as const;

export const HERO_LOOP_SEC = HERO_RULER.durationSec;
