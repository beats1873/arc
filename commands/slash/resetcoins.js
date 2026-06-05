import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { updateUserBalance, getUserBalance, logTransaction } from '../../data/database.js';
import { successEmbed } from '../../utils/embedCreate.js';
import { checkAdmin } from '../../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resetcoins')
    .setDescription("Reset a user's coin balance to 0.")
    .addUserOption(opt =>
      opt.setName('user').setDescription('User to reset').setRequired(true)
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!await checkAdmin(interaction)) return;

    const target = interaction.options.getUser('user');
    const current = await getUserBalance(target.id);
    await updateUserBalance(target.id, -current);
    await logTransaction(interaction.guildId, target.id, 'Reset', -current, null, `by ${interaction.user.tag}`);

    return interaction.reply({
      embeds: [successEmbed('Coins Reset', `Reset <@${target.id}>'s balance to **🪙 0 coins**.`)],
    });
  }
};
