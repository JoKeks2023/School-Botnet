/**
 * particleSwarm.js – Boids / Particle Swarm simulation preset.
 *
 * Compute function: advances a swarm of particles one simulation step
 * using simplified Boids rules (separation, alignment, cohesion).
 * Visual function: draws particles as coloured dots with motion blur.
 */

'use strict';

const preset = {
  name:        'ParticleSwarm',
  category:    'Particle System',
  description: 'Boids / Particle System Simulation',
  targetMode:  'all',

  defaultParams: {
    count:         500,
    width:         800,
    height:        600,
    speed:         2.5,
    separationR:   25,
    alignmentR:    50,
    cohesionR:     80,
    separationW:   1.5,
    alignmentW:    1.0,
    cohesionW:     1.0,
    color:         '#00ffcc',
    trailAlpha:    0.15,
  },

  /**
   * Initialise particle state. Called once before the compute loop.
   * @param {object} params
   * @returns {object[]} Array of particle objects.
   */
  initState(params) {
    const { count, width, height } = params;
    return Array.from({ length: count }, () => ({
      x:  Math.random() * width,
      y:  Math.random() * height,
      vx: (Math.random() - 0.5) * params.speed * 2,
      vy: (Math.random() - 0.5) * params.speed * 2,
    }));
  },

  /**
   * Advance the simulation one step.
   * @param {object[]} particles  Current particle state.
   * @param {object}   params
   * @returns {object[]} Updated particles.
   */
  compute(particles, params) {
    const { width, height, speed,
            separationR, alignmentR, cohesionR,
            separationW, alignmentW, cohesionW } = params;

    return particles.map((b, i) => {
      let sx = 0, sy = 0; // separation
      let ax = 0, ay = 0; // alignment
      let cx = 0, cy = 0; // cohesion
      let sepN = 0, aliN = 0, cohN = 0;

      for (let j = 0; j < particles.length; j++) {
        if (i === j) continue;
        const o  = particles[j];
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 0.0001;

        if (d < separationR) {
          sx += dx / d;
          sy += dy / d;
          sepN++;
        }
        if (d < alignmentR) {
          ax += o.vx;
          ay += o.vy;
          aliN++;
        }
        if (d < cohesionR) {
          cx += o.x;
          cy += o.y;
          cohN++;
        }
      }

      let nvx = b.vx;
      let nvy = b.vy;

      if (sepN > 0) { nvx += (sx / sepN) * separationW; nvy += (sy / sepN) * separationW; }
      if (aliN > 0) { nvx += (ax / aliN) * alignmentW;  nvy += (ay / aliN) * alignmentW;  }
      if (cohN > 0) {
        nvx += ((cx / cohN) - b.x) * cohesionW * 0.01;
        nvy += ((cy / cohN) - b.y) * cohesionW * 0.01;
      }

      // Clamp speed
      const mag = Math.sqrt(nvx * nvx + nvy * nvy) || 0.0001;
      if (mag > speed) { nvx = (nvx / mag) * speed; nvy = (nvy / mag) * speed; }

      // Wrap edges
      let nx = (b.x + nvx + width)  % width;
      let ny = (b.y + nvy + height) % height;

      return { x: nx, y: ny, vx: nvx, vy: nvy };
    });
  },

  visualCode: `
function drawParticleSwarm(ctx, particles, params) {
  const { width, height, color, trailAlpha } = params;
  // Motion-blur trail
  ctx.fillStyle = 'rgba(0,0,0,' + trailAlpha + ')';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = color;
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
`,
};

module.exports = preset;
