/**
 * The NumPy corners this port depends on, reproduced exactly.
 *
 * The Python engine is the reference implementation, and the parity test holds this port to
 * its published answers — so where NumPy has a documented quirk, the quirk is ported rather
 * than "fixed". The one that matters most is rounding: Python's `round()` and `np.round()`
 * round halves to the nearest even number, while JavaScript's `Math.round` rounds them up,
 * and a beat index off by one frame is a beat 11.6ms out.
 */

/** Python's `round()` / `np.round()`: round half to even. */
export function pyRound(value: number): number {
  const floor = Math.floor(value);
  const difference = value - floor;
  if (difference < 0.5) return floor;
  if (difference > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Python's `round(value, digits)` — half to even at the given decimal place. */
export function pyRoundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return pyRound(value * scale) / scale;
}

/** `np.median` — sorted middle, or the mean of the two middles. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** `np.percentile(values, q)` with linear interpolation, NumPy's default. */
export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (q / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.min(low + 1, sorted.length - 1);
  const fraction = rank - low;
  return (sorted[low] as number) + fraction * ((sorted[high] as number) - (sorted[low] as number));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export function clip(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * `np.interp` over an evenly spaced index — the linear resampler in `factory/audio_io.py`.
 *
 * Positions are `np.linspace(0, length - 1, outLength)`: the first output sample is the first
 * input sample and the last is the last, with everything between linearly interpolated.
 */
export function resampleLinear(
  samples: Float32Array | Float64Array,
  sourceRate: number,
  targetRate: number,
): Float64Array {
  if (sourceRate === targetRate || samples.length === 0) {
    return Float64Array.from(samples);
  }
  const ratio = targetRate / sourceRate;
  const outLength = Math.max(1, pyRound(samples.length * ratio));
  const output = new Float64Array(outLength);
  if (outLength === 1) {
    output[0] = samples[0] as number;
    return output;
  }
  const step = (samples.length - 1) / (outLength - 1);
  for (let index = 0; index < outLength; index += 1) {
    const position = index * step;
    const low = Math.floor(position);
    const high = Math.min(low + 1, samples.length - 1);
    const fraction = position - low;
    output[index] =
      (samples[low] as number) * (1 - fraction) + (samples[high] as number) * fraction;
  }
  return output;
}

/**
 * Centred moving average with edge padding — `_moving_average` in the Python engine.
 * The window is forced odd, exactly as there.
 */
export function movingAverage(values: Float64Array, window: number): Float64Array {
  if (window <= 1 || values.length === 0) return new Float64Array(values.length);
  let width = window;
  if (width % 2 === 0) width += 1;
  const half = Math.floor(width / 2);
  const output = new Float64Array(values.length);
  const last = values.length - 1;
  for (let index = 0; index < values.length; index += 1) {
    let total = 0;
    for (let offset = -half; offset <= half; offset += 1) {
      const at = clip(index + offset, 0, last);
      total += values[at] as number;
    }
    output[index] = total / width;
  }
  return output;
}

/** Centred median filter with edge padding — `_median_filter` in `factory/analyse.py`. */
export function medianFilter(values: readonly number[], window: number): number[] {
  if (window <= 1 || values.length === 0) return [...values];
  let width = window;
  if (width % 2 === 0) width += 1;
  const half = Math.floor(width / 2);
  const last = values.length - 1;
  const output = new Array<number>(values.length);
  const scratch = new Array<number>(width);
  for (let index = 0; index < values.length; index += 1) {
    for (let offset = -half; offset <= half; offset += 1) {
      scratch[offset + half] = values[clip(index + offset, 0, last)] as number;
    }
    output[index] = median(scratch);
  }
  return output;
}

/** Least-squares slope of y against 0..n-1 — what `np.polyfit(x, y, 1)` produces here. */
export function leastSquaresSlope(times: readonly number[]): number {
  const count = times.length;
  if (count < 2) return 0;
  const meanIndex = (count - 1) / 2;
  let meanTime = 0;
  for (const time of times) meanTime += time;
  meanTime /= count;
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = index - meanIndex;
    covariance += dx * ((times[index] as number) - meanTime);
    variance += dx * dx;
  }
  return variance > 0 ? covariance / variance : 0;
}
