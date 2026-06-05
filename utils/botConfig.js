import { getSettings } from '../data/database.js';

const _cache = new Map(); // guildId → { cfg, at }
const TTL = 60_000;

function hexToInt(hex) {
  return parseInt((hex || '#5865F2').replace('#', ''), 16);
}

export async function getGuildConfig(guildId) {
  const hit = _cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.cfg;

  const s = await getSettings(guildId);
  const raw = s.toObject ? s.toObject() : s;

  const cfg = {
    ...raw,
    color: {
      primary: hexToInt(raw.primaryColor),
      success: hexToInt(raw.successColor),
      error:   hexToInt(raw.errorColor),
      warning: hexToInt(raw.warningColor),
    },
  };

  _cache.set(guildId, { cfg, at: Date.now() });
  return cfg;
}

// Call this from the dashboard server after saving settings so the bot picks up changes promptly
export function invalidateConfig(guildId) {
  _cache.delete(guildId);
}
