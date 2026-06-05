import { addXP, getLevelRoles } from '../data/database.js';
import { checkAndAwardCoins } from '../utils/economyLimits.js';
import { getGuildConfig } from '../utils/botConfig.js';
import logger from '../utils/logger.js';

const cooldowns = new Map();

export default {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    let cfg;
    try {
      cfg = await getGuildConfig(message.guild.id);
    } catch (err) {
      logger.error('XP', `Failed to load guild config for ${message.guild.id}`, err);
      return;
    }

    if (!cfg.xpEnabled) return;
    if (Array.isArray(cfg.xpIgnoreChannels) && cfg.xpIgnoreChannels.includes(message.channel.id)) return;

    const key = `${message.author.id}-${message.guild.id}`;
    const now = Date.now();
    const cooldownMs = (cfg.chatXpCooldown ?? 60) * 1000;
    if (now - (cooldowns.get(key) ?? 0) < cooldownMs) return;
    cooldowns.set(key, now);

    const min = cfg.chatXpMin ?? 15;
    const max = cfg.chatXpMax ?? 25;
    let amount = Math.floor(Math.random() * (max - min + 1)) + min;

    if (Array.isArray(cfg.xpRoleBoosts) && cfg.xpRoleBoosts.length > 0 && message.member) {
      let bestMultiplier = 1;
      for (const boost of cfg.xpRoleBoosts) {
        if (message.member.roles.cache.has(boost.roleId)) {
          const m = Number(boost.multiplier);
          if (m > bestMultiplier) bestMultiplier = m;
        }
      }
      if (bestMultiplier > 1) {
        logger.debug('XP', `Role boost x${bestMultiplier} applied for ${message.author.tag}`);
        amount = Math.round(amount * bestMultiplier);
      }
    }

    try {
      const result = await addXP(message.author.id, message.guild.id, amount);
      logger.debug('XP', `+${amount} chat XP to ${message.author.tag} (${message.author.id}) — total ${result.xp} XP, level ${result.level}`);

      if (result.leveledUp) {
        logger.info('XP', `Level up: ${message.author.tag} reached level ${result.level} in guild ${message.guild.id}`);
        const reward = 10;
        await checkAndAwardCoins(message.author.id, message.guild.id, 'levelup', reward,
          { note: `Reached level ${result.level}` });

        const allRoles = await getLevelRoles(message.guild.id);
        const toGrant  = allRoles.filter(r => r.level <= result.level);
        for (const lr of toGrant) {
          if (message.member.roles.cache.has(lr.roleId)) continue;
          const role = message.guild.roles.cache.get(lr.roleId);
          if (role) {
            await message.member.roles.add(role).catch(err =>
              logger.warn('XP', `Failed to grant level role ${lr.roleId} to ${message.author.id}`, err)
            );
            logger.info('XP', `Granted level role ${role.name} to ${message.author.tag} at level ${result.level}`);
          } else {
            logger.warn('XP', `Level role ${lr.roleId} not found in guild ${message.guild.id} — was it deleted?`);
          }
        }
      }
    } catch (err) {
      logger.error('XP', `Failed to process XP for ${message.author.tag} in guild ${message.guild.id}`, err);
    }
  }
};
