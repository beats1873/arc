import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User, logTransaction } from '../../data/database.js';

const DAILY_REWARD = 10;
const COOLDOWN = 24 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your once-per-day coin reward!'),

  async execute(interaction) {
    const userId = interaction.user.id;
    let user = await User.findOne({ userId });

    if (!user) {
      user = await User.create({ userId, coins: DAILY_REWARD, lastDaily: new Date() });
      await logTransaction(interaction.guildId, userId, 'Daily', DAILY_REWARD);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Daily Claimed!')
            .setDescription(`You've received your first **🪙 ${DAILY_REWARD} coins**!`)
            .setColor('Green')
        ],
      });
    }

    const now = new Date();
    const lastClaim = user.lastDaily || new Date(0);
    const diff = now - lastClaim;

    if (diff < COOLDOWN) {
      const timeLeft = COOLDOWN - diff;
      const hours = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ Not Yet!')
            .setDescription(`You can claim again in **${hours}h ${minutes}m**.`)
            .setColor('Orange')
        ],
      });
    }

    user.coins += DAILY_REWARD;
    user.lastDaily = now;
    await user.save();
    await logTransaction(interaction.guildId, userId, 'Daily', DAILY_REWARD);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Daily Claimed!')
          .setDescription(`You received **🪙 ${DAILY_REWARD} coins**.\nTotal: **🪙 ${user.coins} coins**.`)
          .setColor('Green')
      ],
      flags: 64
    });
  }
};
