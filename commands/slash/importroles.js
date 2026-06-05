import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { checkAdmin } from '../../utils/permissions.js';
import {
  getLevelRoles, getVoiceLevelRoles,
  getLevelData, getVoiceLevelData,
  minXPForLevel, setMinXPIfHigher
} from '../../data/database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('importroles')
    .setDescription('Import levels from existing Discord roles. Only raises stored levels, never lowers them.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!await checkAdmin(interaction)) return;

    await interaction.deferReply();

    const guild = interaction.guild;
    await guild.members.fetch().catch(() => {});

    const [chatRoles, voiceRoles] = await Promise.all([
      getLevelRoles(guild.id),
      getVoiceLevelRoles(guild.id)
    ]);

    if (!chatRoles.length && !voiceRoles.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('No level roles configured')
            .setDescription('Set up level roles first in the dashboard before importing.')
        ]
      });
    }

    let chatUpdated = 0;
    let voiceUpdated = 0;
    let skipped = 0;

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const highestChat = chatRoles
        .filter(cfg => member.roles.cache.has(cfg.roleId))
        .reduce((max, cfg) => Math.max(max, cfg.level), 0);

      if (highestChat > 0) {
        const current = await getLevelData(member.id, guild.id);
        if (current.level < highestChat) {
          await setMinXPIfHigher(member.id, guild.id, 'xp', minXPForLevel(highestChat));
          chatUpdated++;
        } else {
          skipped++;
        }
      }

      const highestVoice = voiceRoles
        .filter(cfg => member.roles.cache.has(cfg.roleId))
        .reduce((max, cfg) => Math.max(max, cfg.level), 0);

      if (highestVoice > 0) {
        const current = await getVoiceLevelData(member.id, guild.id);
        if (current.level < highestVoice) {
          await setMinXPIfHigher(member.id, guild.id, 'voiceXp', minXPForLevel(highestVoice));
          voiceUpdated++;
        }
      }
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Role import complete')
          .setDescription('Levels were raised for members whose roles implied a higher level than stored. No levels were reduced.')
          .addFields(
            { name: 'Chat levels raised', value: `${chatUpdated}`, inline: true },
            { name: 'Voice levels raised', value: `${voiceUpdated}`, inline: true },
            { name: 'Already at or above role level', value: `${skipped}`, inline: true }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp()
      ]
    });
  }
};
