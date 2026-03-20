/**
 * mandelbrot.js – Mandelbrot / Julia Set fractal computation preset.
 *
 * Compute function: iterates the Mandelbrot set for a region of the
 * complex plane and returns a flat Uint8Array of iteration counts
 * (one value per pixel). The visual function renders the iteration
 * data as a coloured fractal on a Canvas.
 */

'use strict';

const preset = {
  name:        'Mandelbrot',
  category:    'Fractal',
  description: 'Compute and render the Mandelbrot / Julia Set fractal',
  targetMode:  'all',

  defaultParams: {
    width:    800,
    height:   600,
    maxIter:  256,
    xMin:    -2.5,
    xMax:     1.0,
    yMin:    -1.25,
    yMax:     1.25,
    colorScheme: 'fire', // 'fire' | 'ocean' | 'grayscale'
  },

  /**
   * Pure compute function – runs in a Worker Thread.
   * Returns a plain object with the iteration counts buffer (as Array).
   *
   * @param {object} params  Preset parameters.
   * @returns {{ width, height, data: number[] }}
   */
  compute(params) {
    const { width, height, maxIter, xMin, xMax, yMin, yMax } = params;
    const data = new Array(width * height);
    const dx = (xMax - xMin) / width;
    const dy = (yMax - yMin) / height;

    for (let py = 0; py < height; py++) {
      const c_im = yMin + py * dy;
      for (let px = 0; px < width; px++) {
        const c_re = xMin + px * dx;
        let z_re = 0, z_im = 0;
        let iter = 0;
        while (iter < maxIter && z_re * z_re + z_im * z_im <= 4) {
          const tmp = z_re * z_re - z_im * z_im + c_re;
          z_im = 2 * z_re * z_im + c_im;
          z_re = tmp;
          iter++;
        }
        data[py * width + px] = iter;
      }
    }
    return { width, height, maxIter, data };
  },

  /**
   * Visual descriptor – evaluated by the renderer process.
   * Returns a function string that the renderer can eval/use.
   * The actual draw call uses the result from compute().
   */
  visualCode: `
function drawMandelbrot(ctx, result, params) {
  const { width, height, maxIter, data } = result;
  const imgData = ctx.createImageData(width, height);
  const scheme = params.colorScheme || 'fire';

  for (let i = 0; i < data.length; i++) {
    const iter = data[i];
    const t = iter / maxIter;
    let r = 0, g = 0, b = 0;
    if (iter < maxIter) {
      if (scheme === 'fire') {
        r = Math.floor(255 * Math.min(1, t * 3));
        g = Math.floor(255 * Math.max(0, t * 3 - 1));
        b = Math.floor(255 * Math.max(0, t * 3 - 2));
      } else if (scheme === 'ocean') {
        r = 0;
        g = Math.floor(255 * t);
        b = Math.floor(255 * (1 - t));
      } else {
        const v = Math.floor(255 * t);
        r = g = b = v;
      }
    }
    imgData.data[i * 4]     = r;
    imgData.data[i * 4 + 1] = g;
    imgData.data[i * 4 + 2] = b;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
`,
};

module.exports = preset;
