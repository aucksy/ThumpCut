/**
 * The FFT against a naive DFT. If these agree, every downstream number rests on solid
 * ground; if they do not, nothing else in the package is worth testing.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { RealFft } from "../src/fft.ts";

function naiveMagnitude(input: Float64Array): Float64Array {
  const size = input.length;
  const bins = size / 2 + 1;
  const output = new Float64Array(bins);
  for (let bin = 0; bin < bins; bin += 1) {
    let real = 0;
    let imag = 0;
    for (let index = 0; index < size; index += 1) {
      const angle = (-2 * Math.PI * bin * index) / size;
      real += (input[index] as number) * Math.cos(angle);
      imag += (input[index] as number) * Math.sin(angle);
    }
    output[bin] = Math.hypot(real, imag);
  }
  return output;
}

function assertClose(actual: Float64Array, expected: Float64Array, tolerance: number): void {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    const difference = Math.abs((actual[index] as number) - (expected[index] as number));
    assert.ok(
      difference <= tolerance,
      `bin ${index}: ${actual[index]} vs ${expected[index]} (Δ ${difference})`,
    );
  }
}

test("matches a naive DFT on deterministic pseudo-noise", () => {
  const size = 1024;
  const input = new Float64Array(size);
  let state = 42;
  for (let index = 0; index < size; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    input[index] = state / 1073741824 - 1;
  }

  const fft = new RealFft(size);
  const fast = new Float64Array(size / 2 + 1);
  fft.magnitude(input, fast);
  assertClose(fast, naiveMagnitude(input), 1e-6 * size);
});

test("a pure tone lands in exactly its own bin", () => {
  const size = 1024;
  const bin = 37;
  const input = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    input[index] = Math.sin((2 * Math.PI * bin * index) / size);
  }

  const fft = new RealFft(size);
  const magnitude = new Float64Array(size / 2 + 1);
  fft.magnitude(input, magnitude);

  // A full-scale sine of an exact bin frequency puts size/2 into that bin and nothing
  // anywhere else.
  assert.ok(Math.abs((magnitude[bin] as number) - size / 2) < 1e-6);
  for (let index = 0; index < magnitude.length; index += 1) {
    if (index !== bin) assert.ok((magnitude[index] as number) < 1e-6, `leakage at bin ${index}`);
  }
});

test("a constant signal is pure DC", () => {
  const size = 1024;
  const input = new Float64Array(size).fill(0.5);
  const fft = new RealFft(size);
  const magnitude = new Float64Array(size / 2 + 1);
  fft.magnitude(input, magnitude);
  assert.ok(Math.abs((magnitude[0] as number) - size * 0.5) < 1e-6);
  for (let index = 1; index < magnitude.length; index += 1) {
    assert.ok((magnitude[index] as number) < 1e-6);
  }
});
