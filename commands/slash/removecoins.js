import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { updateUserBalance, logTransaction } from '../../data/database.js';
import { successEmbed, errorEmbed, warnEmbed } from '../../utils/embedCreate.js';
import { checkAdmin } from '../../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removecoins')
    .setDescription('Remove coins from a user.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to remove coins from').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Amount to remove').setMinValue(1).setRequired(true)
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!await checkAdmin(interaction)) return;

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    await updateUserBalance(target.id, -amount);
    await logTransaction(interaction.guildId, target.id, 'Remove', -amount, null, `by ${interaction.user.tag}`);
    return interaction.reply({
      embeds: [successEmbed('Coins Removed', `Removed **🪙 ${amount} coins** from <@${target.id}>.`)],
    });
  }
};
