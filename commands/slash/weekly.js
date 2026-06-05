import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User, logTransaction } from '../../data/database.js';

const WEEKLY_REWARD = 50;
const WEEKLY_COOLDOWN = 7 * 24 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('Claim your once-a-week coin reward!'),

  async execute(interaction) {
    const userId = interaction.user.id;
    let user = await User.findOne({ userId });

    if (!user) {
      user = await User.create({ userId, coins: WEEKLY_REWARD, lastWeekly: new Date() });
      await logTransaction(interaction.guildId, userId, 'Weekly', WEEKLY_REWARD);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Weekly Claimed!')
            .setDescription(`You've received your first **🪙 ${WEEKLY_REWARD} coins**!`)
            .setColor('Green')
        ],
      });
    }

    const now = new Date();
    const lastClaim = user.lastWeekly || new Date(0);
    const diff = now - lastClaim;

    if (diff < WEEKLY_COOLDOWN) {
      const timeLeft = WEEKLY_COOLDOWN - diff;
      const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
      const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ Not Yet!')
            .setDescription(`You can claim again in **${days}d ${hours}h ${minutes}m**.`)
            .setColor('Orange')
        ],
      });
    }

    user.coins += WEEKLY_REWARD;
    user.lastWeekly = now;
    await user.save();
    await logTransaction(interaction.guildId, userId, 'Weekly', WEEKLY_REWARD);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Weekly Claimed!')
          .setDescription(`You received **🪙 ${WEEKLY_REWARD} coins**.\nTotal: **🪙 ${user.coins} coins**.`)
          .setColor('Green')
      ],
      flags: 64
    });
  }
};
