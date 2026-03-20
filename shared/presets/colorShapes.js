/**
 * colorShapes.js – Generative colour shapes / animations preset.
 *
 * Computes a list of random geometric shapes (circles, rectangles,
 * triangles) with position, size, colour, and velocity. The visual
 * function animates them on a Canvas.
 */

'use strict';

const preset = {
  name:        'ColorShapes',
  category:    'Random Art',
  description: 'Randomly generated animated geometric shapes',
  targetMode:  'display',

  defaultParams: {
    count:      60,
    width:      800,
    height:     600,
    speed:      1.5,
    minSize:    10,
    maxSize:    80,
    alpha:      0.7,
    bgColor:    '#0a0a1a',
  },

  /**
   * Initialise shape state.
   * @param {object} params
   * @returns {object[]}
   */
  initState(params) {
    const { count, width, height, minSize, maxSize, speed } = params;
    const types = ['circle', 'rect', 'triangle'];
    return Array.from({ length: count }, () => ({
      type:  types[Math.floor(Math.random() * types.length)],
      x:     Math.random() * width,
      y:     Math.random() * height,
      size:  minSize + Math.random() * (maxSize - minSize),
      vx:    (Math.random() - 0.5) * speed * 2,
      vy:    (Math.random() - 0.5) * speed * 2,
      hue:   Math.floor(Math.random() * 360),
      dHue:  (Math.random() - 0.5) * 2,
      rot:   0,
      dRot:  (Math.random() - 0.5) * 0.05,
    }));
  },

  /**
   * Advance animation one frame.
   * @param {object[]} shapes
   * @param {object}   params
   * @returns {object[]}
   */
  compute(shapes, params) {
    const { width, height } = params;
    return shapes.map(s => {
      let nx  = s.x  + s.vx;
      let ny  = s.y  + s.vy;
      let nvx = (nx < 0 || nx > width)  ? -s.vx : s.vx;
      let nvy = (ny < 0 || ny > height) ? -s.vy : s.vy;
      nx  = Math.max(0, Math.min(width,  nx));
      ny  = Math.max(0, Math.min(height, ny));
      return {
        ...s,
        x:   nx,
        y:   ny,
        vx:  nvx,
        vy:  nvy,
        hue: (s.hue + s.dHue + 360) % 360,
        rot: s.rot + s.dRot,
      };
    });
  },

  visualCode: `
function drawColorShapes(ctx, shapes, params) {
  const { width, height, bgColor, alpha } = params;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  for (const s of shapes) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'hsl(' + s.hue + ',80%,55%)';
    ctx.beginPath();
    if (s.type === 'circle') {
      ctx.arc(0, 0, s.size / 2, 0, Math.PI * 2);
    } else if (s.type === 'rect') {
      ctx.rect(-s.size / 2, -s.size / 2, s.size, s.size);
    } else {
      const h = s.size * Math.sqrt(3) / 2;
      ctx.moveTo(0, -h * 2 / 3);
      ctx.lineTo( s.size / 2,  h / 3);
      ctx.lineTo(-s.size / 2,  h / 3);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
`,
};

module.exports = preset;
