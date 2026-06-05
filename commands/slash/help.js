import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSettings } from '../../data/database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands.'),

  async execute(interaction) {
    const settings = await getSettings(interaction.guildId);
    const prefix   = settings.commandPrefix ?? '+';

    const embed = new EmbedBuilder()
      .setTitle('📖 Arcturus — Command List')
      .setColor(settings.primaryColor ?? 0x5865F2)
      .addFields(
        {
          name: '💰 Economy',
          value: [
            '`/coins` — Check your coin balance',
            '`/daily` — Claim your daily 100 coins',
            '`/weekly` — Claim your weekly 500 coins',
          ].join('\n')
        },
        {
          name: '🏆 Leaderboard',
          value: '`/leaderboard` — View the server leaderboard (coins & levels side by side)'
        },
        {
          name: '⭐ Leveling',
          value: '`/rank [user]` — View your level and XP progress card'
        },
        {
          name: '🛒 Shop',
          value: [
            '`/shop list` — Browse available shop items',
            '`/shop buy <item>` — Purchase an item with your coins',
          ].join('\n')
        },
        {
          name: '🎮 Games',
          value: `\`${prefix}hangman\` — Start a Hangman game (word category is revealed at the start!)`
        },
        {
          name: '🎭 Emotes',
          value: `\`${prefix}hug\`, \`${prefix}pat\`, \`${prefix}kiss\`, \`${prefix}wave\`, \`${prefix}dance\`, \`${prefix}cry\`, and more.\nUsage: \`${prefix}emote [@user]\``
        },
        {
          name: '🎯 Trivia',
          value: [
            '`/trivia start` — Start the trivia session',
            '`/trivia stop` — Stop the trivia session',
          ].join('\n')
        },
        {
          name: '🎉 Giveaways',
          value: [
            '`/giveaway start <prize> <duration>` — Start a giveaway (e.g. `1h`, `30m`, `10s`)',
            '`/giveaway end <id>` — End a giveaway early',
            '`/giveaway list` — View active giveaways',
            '`/giveaway reroll <id>` — Reroll the winner',
          ].join('\n')
        },
        {
          name: '🎂 Birthdays',
          value: [
            '`/birthday set <month> <day>` — Set your birthday',
            '`/birthday remove` — Remove your birthday from this server',
            '`/birthday claim` — Claim your birthday coins (once per year)',
          ].join('\n')
        },
      )
      .setFooter({ text: `Prefix commands use ${prefix}  ·  Slash commands use /` });

    await interaction.reply({ embeds: [embed] });
  }
};
