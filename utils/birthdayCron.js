import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { getBirthdaysToday } from '../data/database.js';
import { getGuildConfig } from './botConfig.js';
import logger from './logger.js';

const announced = new Set();

export function startBirthdayCron(client) {
  cron.schedule('* * * * *', async () => {
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const cfg = await getGuildConfig(guildId);
        if (!cfg.birthdayEnabled) continue;
        if (!cfg.birthdayChannelId) continue;

        const timezone = cfg.birthdayTimezone || 'UTC';
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));

        if (now.getHours() !== 0 || now.getMinutes() !== 0) continue;

        const dateKey = `${guildId}-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        if (announced.has(dateKey)) continue;
        announced.add(dateKey);

        const channel = guild.channels.cache.get(cfg.birthdayChannelId);
        if (!channel) continue;

        // Remove birthday role from everyone who has it (yesterday's birthdays)
        if (cfg.birthdayRoleId) {
          const birthdayRole = guild.roles.cache.get(cfg.birthdayRoleId);
          if (birthdayRole) {
            const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(cfg.birthdayRoleId));
            for (const [, member] of membersWithRole) {
              await member.roles.remove(birthdayRole).catch(() => {});
            }
          }
        }

        const birthdays = await getBirthdaysToday(guildId, now.getMonth() + 1, now.getDate());
        if (!birthdays.length) continue;

        for (const bday of birthdays) {
          const member = guild.members.cache.get(bday.userId)
            ?? await guild.members.fetch(bday.userId).catch(() => null);
          if (!member) continue;

          const age = bday.year ? now.getFullYear() - bday.year : null;

          const replaceBirthday = (str) => (str || '')
            .replace(/\{member\}/gi, member.user.username)
            .replace(/\{mention\}/gi, `<@${member.id}>`)
            .replace(/\{age\}/gi, age ? `${age}` : '');

          const defaultDescription =
            `Everyone wish ${member} a happy birthday! 🎉` +
            (age ? `\nThey're turning **${age}** today!` : '');

          const embed = new EmbedBuilder()
            .setColor(cfg.color.success)
            .setTitle(cfg.birthdayTitle ? replaceBirthday(cfg.birthdayTitle) : '🎂 Happy Birthday!')
            .setDescription(cfg.birthdayDescription ? replaceBirthday(cfg.birthdayDescription) : defaultDescription)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

          if (cfg.birthdayFooter) embed.setFooter({ text: replaceBirthday(cfg.birthdayFooter) });

          await channel.send({ content: `${member}`, embeds: [embed] })
            .catch(err => logger.error('Birthday', `Failed to send birthday message for ${member.id} in guild ${guildId}`, err));
          logger.info('Birthday', `Announced birthday for ${member.user.tag} (${member.id}) in guild ${guildId}`);

          // Assign birthday role if configured
          if (cfg.birthdayRoleId) {
            const birthdayRole = guild.roles.cache.get(cfg.birthdayRoleId);
            if (birthdayRole) {
              await member.roles.add(birthdayRole).catch(err =>
                logger.warn('Birthday', `Failed to assign birthday role to ${member.id} in guild ${guildId}`, err)
              );
            } else {
              logger.warn('Birthday', `Birthday role ${cfg.birthdayRoleId} not found in guild ${guildId}`);
            }
          }
        }
      } catch (err) {
        logger.error('Birthday', `Error processing guild ${guildId}`, err);
      }
    }
  });

  logger.info('Birthday', 'Birthday cron scheduler started');
}
