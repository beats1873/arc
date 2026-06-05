import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getSettings } from '../data/database.js';

export async function checkAdmin(interaction) {
  if (interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return true;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Permission Denied')
        .setDescription('You need the **Manage Server** permission to use this command.')
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp()
    ],
    flags: 64
  });
  return false;
}

export async function checkMod(interaction) {
  if (interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return true;

  const settings = await getSettings(interaction.guildId);
  const modRoles = settings.modRoles ?? [];

  if (modRoles.some(roleId => interaction.member.roles.cache.has(roleId))) return true;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Permission Denied')
        .setDescription('You need the server\'s moderator role or **Manage Server** to use this command.')
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp()
    ],
    flags: 64
  });
  return false;
}
