import cron from 'node-cron';
import {
  addVoiceXP,
  getLevelRoles, getVoiceLevelRoles,
  getLevelData, getVoiceLevelData,
  minXPForLevel, setMinXPIfHigher,
  getSettings
} from '../data/database.js';
import logger from './logger.js';

export function startVoiceCrons(client) {
  // Award voice XP every minute to members in non-AFK voice channels
  cron.schedule('* * * * *', async () => {
    for (const [guildId, guild] of client.guilds.cache) {
      const afkChannelId = guild.afkChannelId;

      const settings = await getSettings(guildId).catch(() => null);
      if (!settings?.xpEnabled) continue;
      const ignoredChannels = new Set(settings.xpIgnoreChannels ?? []);
      const rate = settings.voiceXpRate ?? 10;

      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;
        if (channel.id === afkChannelId) continue;
        if (ignoredChannels.has(channel.id)) continue;  // unified ignore list

        for (const member of channel.members.values()) {
          if (member.user.bot) continue;
          if (member.voice.selfMute && member.voice.selfDeaf) continue;

          try {
            const result = await addVoiceXP(member.id, guildId, rate);
            logger.debug('VoiceXP', `+${rate} voice XP to ${member.user.tag} in guild ${guildId} — total ${result.voiceXp}`);

            if (result.leveledUp) {
              logger.info('VoiceXP', `Level up: ${member.user.tag} (${member.id}) reached voice level ${result.level} in guild ${guildId}`);
              const allVoiceRoles = await getVoiceLevelRoles(guildId);
              const toGrant = allVoiceRoles.filter(r => r.level <= result.level);
              for (const lr of toGrant) {
                if (member.roles.cache.has(lr.roleId)) continue;
                const role = guild.roles.cache.get(lr.roleId);
                if (role) {
                  await member.roles.add(role).catch(err =>
                    logger.warn('VoiceXP', `Failed to grant voice level role ${lr.roleId} to ${member.id}`, err)
                  );
                  logger.info('VoiceXP', `Granted voice level role ${role.name} to ${member.user.tag} at level ${result.level}`);
                } else {
                  logger.warn('VoiceXP', `Voice level role ${lr.roleId} not found in guild ${guildId}`);
                }
              }
            }
          } catch (err) {
            logger.error('VoiceXP', `Error processing voice XP for ${member.id} in guild ${guildId}`, err);
          }
        }
      }
    }
  });

  // Daily role → level sync at 03:00 UTC
  cron.schedule('0 3 * * *', async () => {
    logger.info('RoleSync', 'Starting daily role → level sync');
    let synced = 0, errors = 0;

    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await guild.members.fetch().catch(() => {});
        const chatRoles  = await getLevelRoles(guildId);
        const voiceRoles = await getVoiceLevelRoles(guildId);

        for (const member of guild.members.cache.values()) {
          if (member.user.bot) continue;

          // Chat level sync
          const highestChat = chatRoles
            .filter(r => member.roles.cache.has(r.roleId))
            .reduce((max, r) => Math.max(max, r.level), 0);

          if (highestChat > 0) {
            const current = await getLevelData(member.id, guildId);
            if (current.level < highestChat) {
              await setMinXPIfHigher(member.id, guildId, 'xp', minXPForLevel(highestChat));
              logger.debug('RoleSync', `Backfilled chat XP for ${member.user.tag} to level ${highestChat}`);
            }
            for (const r of chatRoles.filter(r => r.level <= highestChat)) {
              if (member.roles.cache.has(r.roleId)) continue;
              const role = guild.roles.cache.get(r.roleId);
              if (role) await member.roles.add(role).catch(err =>
                logger.warn('RoleSync', `Failed to add chat role ${r.roleId} to ${member.id}`, err)
              );
            }
          }

          // Voice level sync
          const highestVoice = voiceRoles
            .filter(r => member.roles.cache.has(r.roleId))
            .reduce((max, r) => Math.max(max, r.level), 0);

          if (highestVoice > 0) {
            const current = await getVoiceLevelData(member.id, guildId);
            if (current.level < highestVoice) {
              await setMinXPIfHigher(member.id, guildId, 'voiceXp', minXPForLevel(highestVoice));
              logger.debug('RoleSync', `Backfilled voice XP for ${member.user.tag} to level ${highestVoice}`);
            }
            for (const r of voiceRoles.filter(r => r.level <= highestVoice)) {
              if (member.roles.cache.has(r.roleId)) continue;
              const role = guild.roles.cache.get(r.roleId);
              if (role) await member.roles.add(role).catch(err =>
                logger.warn('RoleSync', `Failed to add voice role ${r.roleId} to ${member.id}`, err)
              );
            }
          }
          synced++;
        }
      } catch (err) {
        logger.error('RoleSync', `Error syncing guild ${guildId}`, err);
        errors++;
      }
    }

    logger.info('RoleSync', `Daily sync complete — ${synced} member(s) checked, ${errors} guild error(s)`);
  });

  logger.info('VoiceXP', 'Voice XP and role sync crons started');
}
