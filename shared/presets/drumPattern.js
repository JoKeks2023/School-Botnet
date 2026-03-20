/**
 * drumPattern.js – Generative drum/synth pattern with visual sync preset.
 *
 * Compute function: generates a random 16-step drum pattern for
 * kick, snare, hi-hat and bass. The visual function renders the
 * sequencer grid and a live beat indicator.
 *
 * Audio playback is handled by the renderer using the Web Audio API.
 * The compute worker only generates the pattern data; the renderer
 * also reads it for drawing.
 */

'use strict';

const INSTRUMENTS = ['kick', 'snare', 'hihat', 'bass'];
const STEPS = 16;

const preset = {
  name:        'DrumPattern',
  category:    'Generative Music',
  description: 'Generative drum/synth patterns with visual synchronisation',
  targetMode:  'display',

  defaultParams: {
    bpm:        120,
    steps:      STEPS,
    width:      800,
    height:     600,
    bgColor:    '#0d0d0d',
    activeColor:'#ff6600',
    gridColor:  '#333333',
    regenerate: false,
  },

  /**
   * Generate or advance the drum pattern state.
   * @param {object|null} state  Previous state (null on first call).
   * @param {object}      params
   * @returns {{ pattern, currentStep, bpm }}
   */
  compute(state, params) {
    const { steps, bpm, regenerate } = params;

    // Generate a new pattern if none exists or regenerate is requested
    let pattern = state && !regenerate ? state.pattern : null;
    if (!pattern) {
      pattern = {};
      for (const inst of INSTRUMENTS) {
        pattern[inst] = Array.from({ length: steps }, () => Math.random() > 0.65 ? 1 : 0);
      }
      // Always have kick on beat 1
      pattern.kick[0] = 1;
    }

    const currentStep = state ? (state.currentStep + 1) % steps : 0;
    return { pattern, currentStep, bpm };
  },

  visualCode: `
function drawDrumPattern(ctx, state, params) {
  const { width, height, bgColor, activeColor, gridColor, steps } = params;
  const { pattern, currentStep } = state;
  const instruments = ['kick', 'snare', 'hihat', 'bass'];

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const rows  = instruments.length;
  const cols  = steps;
  const padX  = 60;
  const padY  = 60;
  const cellW = (width  - padX * 2) / cols;
  const cellH = (height - padY * 2) / rows;

  ctx.font = '14px monospace';
  ctx.fillStyle = '#aaaaaa';
  instruments.forEach((inst, row) => {
    ctx.fillText(inst.toUpperCase(), 4, padY + row * cellH + cellH / 2 + 5);
    for (let col = 0; col < cols; col++) {
      const x = padX + col * cellW;
      const y = padY + row * cellH;
      const on = pattern[inst][col] === 1;
      const beat = col % 4 === 0;

      ctx.strokeStyle = gridColor;
      ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

      if (on) {
        ctx.fillStyle = col === currentStep ? '#ffffff' : activeColor;
        ctx.fillRect(x + 4, y + 4, cellW - 8, cellH - 8);
      } else if (col === currentStep) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
      }
    }
  });

  // BPM label
  ctx.fillStyle = '#666';
  ctx.font = '12px monospace';
  ctx.fillText('BPM: ' + state.bpm, width - 80, height - 10);
}
`,
};

module.exports = preset;
