/**
 * A real-input FFT sized for the engine's 1024-sample analysis window.
 *
 * `np.fft.rfft` is the one piece of the Python engine with no direct JavaScript equivalent,
 * so it is implemented here: an iterative radix-2 complex FFT of half the size, fed the real
 * input packed as interleaved pairs, then unpacked with the standard split-spectrum identity.
 * That is the textbook way to halve the work for real input, and on a phone this runs once
 * per 11.6ms of audio, so the halving is the difference between "a few seconds" and "long
 * enough to wonder if it hung".
 *
 * Precision note: everything is float64. NumPy runs parts of the reference pipeline in
 * float32, so individual bins differ in the last few decimal places. The parity test bounds
 * the effect where it matters — beat times — to well under one analysis frame.
 */

export class RealFft {
  /** Real input length. Must be a power of two. */
  readonly size: number;
  private readonly half: number;
  private readonly reversal: Uint32Array;
  private readonly twiddleCos: Float64Array;
  private readonly twiddleSin: Float64Array;
  private readonly unpackCos: Float64Array;
  private readonly unpackSin: Float64Array;
  private readonly workReal: Float64Array;
  private readonly workImag: Float64Array;

  constructor(size: number) {
    if (size < 4 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.half = size / 2;

    const bits = Math.log2(this.half);
    this.reversal = new Uint32Array(this.half);
    for (let index = 0; index < this.half; index += 1) {
      let reversed = 0;
      for (let bit = 0; bit < bits; bit += 1) {
        reversed = (reversed << 1) | ((index >> bit) & 1);
      }
      this.reversal[index] = reversed;
    }

    // Twiddles for the half-size complex FFT, densest stage first.
    this.twiddleCos = new Float64Array(this.half / 2);
    this.twiddleSin = new Float64Array(this.half / 2);
    for (let index = 0; index < this.half / 2; index += 1) {
      const angle = (-2 * Math.PI * index) / this.half;
      this.twiddleCos[index] = Math.cos(angle);
      this.twiddleSin[index] = Math.sin(angle);
    }

    // Twiddles for unpacking the packed-real spectrum.
    this.unpackCos = new Float64Array(this.half);
    this.unpackSin = new Float64Array(this.half);
    for (let index = 0; index < this.half; index += 1) {
      const angle = (-2 * Math.PI * index) / size;
      this.unpackCos[index] = Math.cos(angle);
      this.unpackSin[index] = Math.sin(angle);
    }

    this.workReal = new Float64Array(this.half);
    this.workImag = new Float64Array(this.half);
  }

  /**
   * Magnitude spectrum of `input`: `size / 2 + 1` bins, matching `np.abs(np.fft.rfft(x))`.
   * `output` must have room for them. The input is not modified.
   */
  magnitude(input: Float64Array, output: Float64Array): void {
    const half = this.half;
    const real = this.workReal;
    const imag = this.workImag;

    // Pack: even samples become real parts, odd samples imaginary, bit-reversed for the
    // in-place transform.
    for (let index = 0; index < half; index += 1) {
      const at = this.reversal[index] as number;
      real[index] = input[2 * at] as number;
      imag[index] = input[2 * at + 1] as number;
    }

    // Iterative radix-2 Cooley–Tukey over the packed pairs.
    for (let blockSize = 2; blockSize <= half; blockSize *= 2) {
      const halfBlock = blockSize / 2;
      const step = this.half / blockSize;
      for (let start = 0; start < half; start += blockSize) {
        let twiddle = 0;
        for (let offset = 0; offset < halfBlock; offset += 1) {
          const even = start + offset;
          const odd = even + halfBlock;
          const cos = this.twiddleCos[twiddle] as number;
          const sin = this.twiddleSin[twiddle] as number;
          const oddReal = (real[odd] as number) * cos - (imag[odd] as number) * sin;
          const oddImag = (real[odd] as number) * sin + (imag[odd] as number) * cos;
          real[odd] = (real[even] as number) - oddReal;
          imag[odd] = (imag[even] as number) - oddImag;
          real[even] = (real[even] as number) + oddReal;
          imag[even] = (imag[even] as number) + oddImag;
          twiddle += step;
        }
      }
    }

    // Unpack. For packed real input, bin k of the true spectrum combines Z[k] with the
    // conjugate of Z[half - k]:
    //   X[k] = (Z[k] + conj(Z[h-k])) / 2  - i/2 * e^(-2πik/N) * (Z[k] - conj(Z[h-k]))
    // Bins 0 and half fall out of the same identity with Z[0] alone.
    const zeroReal = real[0] as number;
    const zeroImag = imag[0] as number;
    output[0] = Math.abs(zeroReal + zeroImag);
    output[half] = Math.abs(zeroReal - zeroImag);

    for (let bin = 1; bin < half; bin += 1) {
      const mirror = half - bin;
      const sumReal = ((real[bin] as number) + (real[mirror] as number)) / 2;
      const sumImag = ((imag[bin] as number) - (imag[mirror] as number)) / 2;
      const diffReal = ((real[bin] as number) - (real[mirror] as number)) / 2;
      const diffImag = ((imag[bin] as number) + (imag[mirror] as number)) / 2;
      const cos = this.unpackCos[bin] as number;
      const sin = this.unpackSin[bin] as number;
      // -i * e^(-iθ) * (a + bi) = (a sinθ + b cosθ) + i(b sinθ - a cosθ)
      const outReal = sumReal + diffReal * sin + diffImag * cos;
      const outImag = sumImag + diffImag * sin - diffReal * cos;
      output[bin] = Math.hypot(outReal, outImag);
    }
  }
}
