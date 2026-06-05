import { EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../utils/botConfig.js';

export default {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const boostedNow = oldMember.premiumSince === null && newMember.premiumSince !== null;
    const boostEnded = oldMember.premiumSince !== null && newMember.premiumSince === null;

    if (!boostedNow && !boostEnded) return;

    try {
      const cfg = await getGuildConfig(newMember.guild.id);
      if (!cfg.boosterEnabled) return;
      if (!cfg.boostChannelId) return;

      const channel = newMember.guild.channels.cache.get(cfg.boostChannelId);
      if (!channel) return;

      const replaceBoost = (str) => (str || '')
        .replace(/\{member\}/gi, newMember.user.username)
        .replace(/\{mention\}/gi, `<@${newMember.id}>`);

      if (boostedNow) {
        const boosterRole = newMember.guild.roles.premiumSubscriberRole;
        const boostCount  = newMember.guild.premiumSubscriptionCount ?? 0;

        const embed = new EmbedBuilder()
          .setColor(0xFF73FA)
          .setTitle(cfg.boostTitle ? replaceBoost(cfg.boostTitle) : '✨ New Server Boost!')
          .setDescription(cfg.boostDescription ? replaceBoost(cfg.boostDescription) : `${newMember} just boosted the server! Thank you so much! 💖`)
          .setThumbnail(newMember.user.displayAvatarURL())
          .addFields(
            { name: 'Total boosts', value: `${boostCount}`, inline: true },
            ...(boosterRole ? [{ name: 'Role', value: `${boosterRole}`, inline: true }] : [])
          )
          .setTimestamp();

        if (cfg.boostFooter) embed.setFooter({ text: replaceBoost(cfg.boostFooter) });
        await channel.send({ content: `${newMember}`, embeds: [embed] });
      }

      if (boostEnded) {
        const embed = new EmbedBuilder()
          .setColor(cfg.color.primary)
          .setTitle(cfg.boostTitle ? replaceBoost(cfg.boostTitle) : 'Boost ended')
          .setDescription(`${newMember}'s boost has ended. Thanks for your support while it lasted! 💙`)
          .setThumbnail(newMember.user.displayAvatarURL())
          .setTimestamp();

        if (cfg.boostFooter) embed.setFooter({ text: replaceBoost(cfg.boostFooter) });
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('[BoostAnnounce]', err);
    }
  }
};
