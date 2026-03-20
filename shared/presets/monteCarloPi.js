/**
 * monteCarloPi.js – Monte Carlo π estimation preset (headless compute).
 *
 * Throws random darts at a unit square and counts how many land
 * inside the inscribed quarter-circle. Converges to π/4.
 * Pure compute, no visual output.
 */

'use strict';

const preset = {
  name:        'MonteCarloPi',
  category:    'Headless Compute',
  description: 'Estimate π using Monte Carlo sampling',
  targetMode:  'headless',

  defaultParams: {
    samples: 1_000_000,
  },

  /**
   * Run the Monte Carlo π estimation.
   * @param {object} params  { samples }
   * @returns {{ samples, inside, pi }}
   */
  compute(params) {
    const { samples } = params;
    let inside = 0;
    for (let i = 0; i < samples; i++) {
      const x = Math.random();
      const y = Math.random();
      if (x * x + y * y <= 1) inside++;
    }
    const pi = (4 * inside) / samples;
    return { samples, inside, pi };
  },

  // No visual for headless preset
  visualCode: null,
};

module.exports = preset;
