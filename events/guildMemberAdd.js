import { EmbedBuilder } from 'discord.js';
import { getLevelData, getVoiceLevelData, getLevelRoles, getVoiceLevelRoles, getSettings } from '../data/database.js';
import logger from '../utils/logger.js';

export default {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const guildId = member.guild.id;
      const [chatData, voiceData, chatRoles, voiceRoles, settings] = await Promise.all([
        getLevelData(member.id, guildId),
        getVoiceLevelData(member.id, guildId),
        getLevelRoles(guildId),
        getVoiceLevelRoles(guildId),
        getSettings(guildId),
      ]);

      // ── Auto-role: grant configured role to every new/returning member ──
      if (settings.autoRoleEnabled && settings.autoRoleId) {
        const autoRole = member.guild.roles.cache.get(settings.autoRoleId)
          ?? await member.guild.roles.fetch(settings.autoRoleId).catch(() => null);
        if (autoRole) {
          await member.roles.add(autoRole).catch(err =>
            logger.warn('AutoRole', `Failed to grant auto-role ${autoRole.name} to ${member.user.tag}`, err)
          );
          logger.info('AutoRole', `Granted "${autoRole.name}" to ${member.user.tag} (${member.id}) in guild ${guildId}`);
        } else {
          logger.warn('AutoRole', `Auto-role ${settings.autoRoleId} not found in guild ${guildId} — was it deleted?`);
        }
      }

      // ── Restore level roles on rejoin ────────────────────────────────────
      for (const cfg of chatRoles) {
        if (chatData.level >= cfg.level) {
          const role = member.guild.roles.cache.get(cfg.roleId);
          if (role) await member.roles.add(role).catch(() => {});
        }
      }
      for (const cfg of voiceRoles) {
        if (voiceData.level >= cfg.level) {
          const role = member.guild.roles.cache.get(cfg.roleId);
          if (role) await member.roles.add(role).catch(() => {});
        }
      }

      // ── Welcome message ──────────────────────────────────────────────────
      if (settings.welcomeEnabled && settings.welcomeChannelId) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannelId)
          ?? await member.guild.channels.fetch(settings.welcomeChannelId).catch(() => null);
        if (channel) {
          const replace = (str) => (str || '')
            .replace(/\{user\}/gi,    member.user.username)
            .replace(/\{mention\}/gi, `<@${member.id}>`)
            .replace(/\{server\}/gi,  member.guild.name)
            .replace(/\{count\}/gi,   member.guild.memberCount);

          const title = settings.welcomeTitle?.trim()
            ? replace(settings.welcomeTitle)
            : `👋 Welcome to ${member.guild.name}!`;

          const body = settings.welcomeBody?.trim()
            ? replace(settings.welcomeBody)
            : `${settings.welcomeMentionUser !== false ? `<@${member.id}> has` : `**${member.user.username}** has`} joined the server. You are member #${member.guild.memberCount}!`;

          const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(body)
            .setThumbnail(member.user.displayAvatarURL())
            .setColor(settings.welcomeColor || '#5865F2')
            .setTimestamp();

          if (settings.welcomeFooter?.trim()) embed.setFooter({ text: replace(settings.welcomeFooter) });

          const content = settings.welcomeMentionUser !== false ? `<@${member.id}>` : null;
          await channel.send({ content, embeds: [embed] }).catch(err =>
            logger.warn('Welcome', `Failed to send welcome message for ${member.id}`, err)
          );
        }
      }
    } catch (err) {
      logger.error('GuildMemberAdd', `Error processing member join for ${member.id} in guild ${member.guild.id}`, err);
    }
  }
};
