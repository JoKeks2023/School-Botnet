/**
 * presetManager.js – Manages available presets on the server.
 *
 * Presets define both the compute function (sent to worker threads)
 * and the visual function (rendered on Display nodes). They can be
 * loaded from the shared/presets directory and updated at runtime
 * by the Admin.
 */

const path = require('path');
const fs   = require('fs');

const PRESETS_DIR = path.join(__dirname, '..', 'shared', 'presets');

class PresetManager {
  constructor() {
    /** @type {Map<string, object>} name → preset definition */
    this.presets = new Map();
    this._loadBuiltins();
  }

  /**
   * Load all .js preset files from shared/presets automatically.
   */
  _loadBuiltins() {
    if (!fs.existsSync(PRESETS_DIR)) return;
    const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const preset = require(path.join(PRESETS_DIR, file));
        if (preset && preset.name) {
          this.presets.set(preset.name, preset);
        }
      } catch (err) {
        console.error(`[PresetManager] Failed to load preset ${file}:`, err.message);
      }
    }
    console.log(`[PresetManager] Loaded presets: ${[...this.presets.keys()].join(', ')}`);
  }

  /**
   * Return all preset definitions as a plain array (safe to send over JSON).
   */
  listPresets() {
    return Array.from(this.presets.values()).map(p => ({
      name:        p.name,
      category:    p.category,
      description: p.description,
      targetMode:  p.targetMode,
      params:      p.defaultParams,
    }));
  }

  /**
   * Get a single preset by name.
   * @param {string} name
   */
  getPreset(name) {
    return this.presets.get(name) || null;
  }

  /**
   * Update or add a preset at runtime (from Admin UI).
   * @param {object} preset  Must contain at least { name, category, description, targetMode, defaultParams }
   */
  upsertPreset(preset) {
    if (!preset || !preset.name) throw new Error('Preset must have a name');
    this.presets.set(preset.name, preset);
    return preset;
  }

  /**
   * Delete a preset by name.
   * @param {string} name
   */
  deletePreset(name) {
    return this.presets.delete(name);
  }
}

module.exports = { PresetManager };
