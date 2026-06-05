import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getSettings, createGiveaway, getActiveGiveaways, getGiveaway, updateGiveawayMessage, endGiveaway, Giveaway } from '../../data/database.js';
import { scheduleGiveaway, cancelGiveawayTimer, finishGiveaway, giveawayByMessage } from '../../utils/giveawayManager.js';

function parseDuration(str) {
  // e.g. "1h", "30m", "2h30m", "1d", "30s", "10s"
  let ms = 0;
  const days    = str.match(/(\d+)d/i);
  const hours   = str.match(/(\d+)h/i);
  const minutes = str.match(/(\d+)m/i);
  const seconds = str.match(/(\d+)s/i);
  if (days)    ms += parseInt(days[1])    * 86400000;
  if (hours)   ms += parseInt(hours[1])  * 3600000;
  if (minutes) ms += parseInt(minutes[1]) * 60000;
  if (seconds) ms += parseInt(seconds[1]) * 1000;
  return ms;
}

export default {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways.')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a new giveaway.')
        .addStringOption(opt => opt.setName('prize').setDescription('What is being given away?').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 1h, 30m, 2h30m, 1d').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in (defaults to current)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('End a giveaway early.')
        .addStringOption(opt => opt.setName('id').setDescription('Giveaway ID (from /giveaway list)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List active giveaways.')
    )
    .addSubcommand(sub =>
      sub.setName('reroll')
        .setDescription('Reroll the winner of an ended giveaway.')
        .addStringOption(opt => opt.setName('id').setDescription('Giveaway ID').setRequired(true))
    ),

  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const guildId  = interaction.guildId;
    const settings = await getSettings(guildId);

    // Permission check: ManageGuild or a configured giveaway role
    const hasPermission =
      interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
      (settings.giveawayRoles ?? []).some(rid => interaction.member.roles.cache.has(rid));

    if (!hasPermission) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Permission Denied').setDescription('You need **Manage Server** or a giveaway role to manage giveaways.')],
        flags: 64,
      });
    }

    if (sub === 'start') {
      if (!settings.giveawayEnabled) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Giveaways Disabled').setDescription('Enable giveaways in the dashboard first.')],
          flags: 64,
        });
      }

      const prize    = interaction.options.getString('prize');
      const durationStr = interaction.options.getString('duration');
      const target   = interaction.options.getChannel('channel') ?? interaction.channel;
      const durationMs = parseDuration(durationStr);

      if (durationMs < 10000) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Invalid Duration').setDescription('Duration must be at least 10 seconds. Use e.g. `30m`, `1h`, `2h30m`.')],
          flags: 64,
        });
      }

      const emoji   = settings.giveawayEmoji || '🎉';
      const endTime = new Date(Date.now() + durationMs);

      const giveaway = await createGiveaway({
        guildId,
        channelId: target.id,
        prize,
        hostUserId: interaction.user.id,
        endTime,
        emoji,
      });

      const endTs = Math.floor(endTime / 1000);
      const color = settings.giveawayEmbedColor
        ? parseInt(settings.giveawayEmbedColor.replace('#', ''), 16)
        : 0x5865F2;

      const header = settings.giveawayEmbedHeader?.trim() || '🎉 GIVEAWAY 🎉';
      const body   = settings.giveawayEmbedBody?.trim()   || `React with **${emoji}** to enter!\n\n**Prize:** ${prize}`;

      const embed = new EmbedBuilder()
        .setTitle(header)
        .setDescription(body)
        .setColor(color)
        .addFields({ name: 'Ends', value: `<t:${endTs}:R> (<t:${endTs}:f>)`, inline: true });

      const msg = await target.send({ embeds: [embed] });
      await msg.react(emoji).catch(() => {});

      await updateGiveawayMessage(giveaway._id, msg.id);
      giveaway.messageId = msg.id;
      giveawayByMessage.set(msg.id, giveaway._id.toString());

      await scheduleGiveaway(giveaway, interaction.client);

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Giveaway Started!').setDescription(`Giveaway for **${prize}** started in <#${target.id}>.\nEnds <t:${endTs}:R>.\n\nID: \`${giveaway._id}\``)],
        flags: 64,
      });
    }

    if (sub === 'end') {
      const id = interaction.options.getString('id').trim();
      let gaw;
      try { gaw = await getGiveaway(id); } catch { /* invalid id */ }
      if (!gaw || gaw.guildId !== guildId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Not Found').setDescription('Giveaway not found.')], flags: 64 });
      }
      if (gaw.status === 'ended') {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Already Ended').setDescription('That giveaway has already ended.')], flags: 64 });
      }
      await cancelGiveawayTimer(id);
      await finishGiveaway(gaw, interaction.client, true);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Giveaway Ended').setDescription(`Giveaway for **${gaw.prize}** has been ended.`)], flags: 64 });
    }

    if (sub === 'list') {
      const active = await getActiveGiveaways(guildId);
      if (!active.length) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Active Giveaways').setDescription('No active giveaways right now.')], flags: 64 });
      }
      const lines = active.map(g => {
        const ends = Math.floor(new Date(g.endTime) / 1000);
        return `**${g.prize}** — ends <t:${ends}:R>\nEntries: ${g.entries?.length ?? 0} • ID: \`${g._id}\``;
      });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🎉 Active Giveaways (${active.length})`).setDescription(lines.join('\n\n'))], flags: 64 });
    }

    if (sub === 'reroll') {
      const id = interaction.options.getString('id').trim();
      let gaw;
      try { gaw = await getGiveaway(id); } catch { /* invalid id */ }
      if (!gaw || gaw.guildId !== guildId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Not Found').setDescription('Giveaway not found.')], flags: 64 });
      }
      if (gaw.status !== 'ended') {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Still Active').setDescription('End the giveaway first before rerolling.')], flags: 64 });
      }

      const eligible = (gaw.entries ?? []).filter(uid => uid !== gaw.winnerUserId);
      if (!eligible.length) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('No Entries').setDescription('No eligible entries to reroll from.')], flags: 64 });
      }

      const newWinner = eligible[Math.floor(Math.random() * eligible.length)];
      await Giveaway.findByIdAndUpdate(id, { winnerUserId: newWinner });

      const channel = interaction.guild.channels.cache.get(gaw.channelId)
        ?? await interaction.guild.channels.fetch(gaw.channelId).catch(() => null);
      if (channel) {
        await channel.send({
          content: `🎊 <@${newWinner}>`,
          embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('🎉 Giveaway Rerolled!').setDescription(`New winner for **${gaw.prize}**: <@${newWinner}>! Congratulations!`)],
        }).catch(() => {});
      }

      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Rerolled!').setDescription(`New winner: <@${newWinner}>`)], flags: 64 });
    }
  }
};
