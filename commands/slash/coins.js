import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserBalance } from '../../data/database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription('Check your current coin balance'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const balance = await getUserBalance(userId);

    const embed = new EmbedBuilder()
      .setTitle('💰 Your Coin Balance')
      .setDescription(`<@${userId}> has **🪙 ${balance} coins**.`)
      .setColor(0xF1C40F);

    await interaction.reply({ embeds: [embed] });
  }
};
