import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getShopItems, getShopItem, decrementShopItem, getUserBalance, updateUserBalance, logTransaction, getSettings } from '../../data/database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Server shop — browse and purchase items with your coins.')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub.setName('list').setDescription('Browse available shop items.')
    )
    .addSubcommand(sub =>
      sub.setName('buy')
        .setDescription('Purchase an item from the shop.')
        .addStringOption(opt =>
          opt.setName('item').setDescription('Name of the item to buy').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const items = await getShopItems(guildId);
      if (!items.length) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('🛒 Shop')
              .setDescription('No items are available in the shop yet.')
          ]
        });
      }

      const lines = items.map(item => {
        const stock = item.quantity === null ? 'Unlimited' : `${item.quantity} left`;
        const role  = item.roleId ? ` · Grants <@&${item.roleId}>` : '';
        const desc  = item.description ? `\n  *${item.description}*` : '';
        return `**${item.name}** — 🪙 ${item.cost} coins (${stock})${role}${desc}`;
      });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🛒 Shop')
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: 'Use /shop buy to purchase an item.' })
        ]
      });
    }

    if (sub === 'buy') {
      // Item 10: use the full getString value — handles spaces correctly
      const name = interaction.options.getString('item');
      const item = await getShopItem(guildId, name);

      if (!item) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Item not found')
              .setDescription(`No item named **${name}** exists in the shop.\nUse \`/shop list\` to browse available items.`)
          ]
        });
      }

      if (item.quantity !== null && item.quantity <= 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('Out of stock')
              .setDescription(`**${item.name}** is currently out of stock.`)
          ]
        });
      }

      const balance = await getUserBalance(interaction.user.id);
      if (balance < item.cost) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Insufficient funds')
              .setDescription(`**${item.name}** costs 🪙 ${item.cost} coins but you only have 🪙 ${balance}.`)
          ]
        });
      }

      if (item.quantity !== null) {
        const updated = await decrementShopItem(guildId, name);
        if (!updated) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle('Out of stock')
                .setDescription(`**${item.name}** just sold out.`)
            ]
          });
        }
      }

      await updateUserBalance(interaction.user.id, -item.cost);
      await logTransaction(guildId, interaction.user.id, 'Purchase', -item.cost, item.name);

      // Item 9: if no role, ping the shop notification role
      if (!item.roleId) {
        const settings = await getSettings(guildId);
        if (settings.shopNotifyRoleId && settings.shopNotifyChannelId) {
          const notifyChannel = interaction.guild.channels.cache.get(settings.shopNotifyChannelId)
            ?? await interaction.guild.channels.fetch(settings.shopNotifyChannelId).catch(() => null);
          if (notifyChannel) {
            const ts = `<t:${Math.floor(Date.now() / 1000)}:f>`;
            await notifyChannel.send({
              content: `<@&${settings.shopNotifyRoleId}>`,
              embeds: [
                new EmbedBuilder()
                  .setColor(0xf0b232)
                  .setTitle('🛒 Shop Fulfillment Needed')
                  .addFields(
                    { name: 'Item',     value: item.name,                     inline: true },
                    { name: 'Buyer',    value: `<@${interaction.user.id}>`,   inline: true },
                    { name: 'User ID',  value: interaction.user.id,           inline: true },
                    { name: 'Username', value: interaction.user.username,     inline: true },
                    { name: 'Time',     value: ts,                            inline: true },
                  )
              ]
            }).catch(() => {});
          }
        }
      } else {
        const role = interaction.guild.roles.cache.get(item.roleId);
        if (role) await interaction.member.roles.add(role).catch(() => {});
      }

      const newBalance = await getUserBalance(interaction.user.id);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Purchase successful!')
            .setDescription(`You bought **${item.name}** for 🪙 ${item.cost} coins.${item.roleId ? `\nYou've been given the <@&${item.roleId}> role.` : '\nAn admin will fulfil your order manually.'}`)
            .addFields({ name: 'Remaining balance', value: `🪙 ${newBalance} coins`, inline: true })
        ]
      });
    }
  }
};
