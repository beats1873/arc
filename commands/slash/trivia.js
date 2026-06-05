import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getTriviaSettings } from '../../utils/triviaSettings.js';
import { activeSessions, startTriviaSession, stopTriviaSession } from '../../utils/triviaEngine.js';

export default {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Manage the trivia session.')
    .setDMPermission(false)
    .addSubcommand(sub => sub.setName('start').setDescription('Start a trivia session in the configured channel.'))
    .addSubcommand(sub => sub.setName('stop').setDescription('Stop the ongoing trivia session.')),

  async execute(interaction) {
    const { guildId, guild, member } = interaction;
    const sub = interaction.options.getSubcommand();
    const settings = await getTriviaSettings(guildId);

    const hasPermission =
      interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
      settings.modRoles?.some(roleId => member.roles.cache.has(roleId));

    if (!hasPermission) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Permission Denied')
            .setDescription('You need the **Manage Server** permission or a trivia mod role to manage trivia.')
        ]
      });
    }

    if (sub === 'start') {
      if (activeSessions.has(guildId)) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Already running').setDescription('A trivia session is already active.')]
        });
      }

      if (!settings.channelId) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('No channel set').setDescription('Configure a trivia channel in the dashboard first.')]
        });
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Trivia started')
            .setDescription('First question coming up!')
        ]
      });

      const result = await startTriviaSession(guild, settings);
      if (!result.ok && result.reason === 'channel_not_found') {
        await interaction.followUp({
          embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Channel not found').setDescription('The configured trivia channel no longer exists. Update it in the dashboard.')]
        });
      }
    }

    if (sub === 'stop') {
      const stopped = stopTriviaSession(guildId);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(stopped ? 0x57F287 : 0xFEE75C)
            .setTitle(stopped ? 'Trivia stopped' : 'Not running')
            .setDescription(stopped ? 'The trivia session has ended.' : 'No trivia session is currently active.')
        ]
      });
    }
  }
};
