import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import {
  updateSettings, getSettings,
  setBirthday, removeBirthday, getBirthday,
  updateUserBalance, createBirthdayClaim, logTransaction
} from '../../data/database.js';
import { checkAdmin } from '../../utils/permissions.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function daysInMonth(month, year) {
  return new Date(year ?? 2000, month, 0).getDate();
}

function inClaimWindow(bday, now) {
  const birthdayThisYear = new Date(now.getFullYear(), bday.month - 1, bday.day);
  const dayBefore = new Date(birthdayThisYear);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(birthdayThisYear);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const todayKey = `${now.getMonth()}-${now.getDate()}`;
  const inWindow = [dayBefore, birthdayThisYear, dayAfter]
    .some(d => `${d.getMonth()}-${d.getDate()}` === todayKey);

  return { inWindow, birthdayThisYear };
}

export default {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Birthday commands.')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Register your birthday.')
        .addIntegerOption(opt =>
          opt.setName('month').setDescription('Month (1–12)').setMinValue(1).setMaxValue(12).setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('day').setDescription('Day of the month').setMinValue(1).setMaxValue(31).setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('year').setDescription('Birth year (optional, used for age display)').setMinValue(1900).setMaxValue(new Date().getFullYear())
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove').setDescription('Remove your birthday from this server.')
    )
    .addSubcommand(sub =>
      sub.setName('claim').setDescription('Claim your birthday coins (once per year, within one day of your birthday).')
    )
    .addSubcommand(sub =>
      sub.setName('setchannel')
        .setDescription('Set the channel for birthday announcements. (Admin)')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('Announcement channel.').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('settimezone')
        .setDescription('Set the server timezone for midnight announcements. (Admin)')
        .addStringOption(opt =>
          opt.setName('timezone').setDescription('IANA timezone, e.g. America/New_York').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const month = interaction.options.getInteger('month');
      const day = interaction.options.getInteger('day');
      const year = interaction.options.getInteger('year') ?? null;

      const maxDay = daysInMonth(month, year);
      if (day > maxDay) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Invalid date')
              .setDescription(`${MONTHS[month - 1]} only has ${maxDay} days.`)
          ],
          flags: 64
        });
      }

      await setBirthday(interaction.user.id, interaction.guildId, month, day, year);
      const dateStr = `${MONTHS[month - 1]} ${day}${year ? `, ${year}` : ''}`;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Birthday saved')
            .setDescription(`Your birthday has been set to **${dateStr}**.`)
        ],
        flags: 64
      });
    }

    if (sub === 'remove') {
      const result = await removeBirthday(interaction.user.id, interaction.guildId);
      if (result.deletedCount === 0) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('No birthday found')
              .setDescription("You don't have a birthday registered in this server.")
          ],
          flags: 64
        });
      }
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Birthday removed')
            .setDescription('Your birthday has been removed from this server.')
        ],
        flags: 64
      });
    }

    if (sub === 'claim') {
      const settings = await getSettings(interaction.guildId);
      const timezone = settings.birthdayTimezone || 'UTC';
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));

      const bday = await getBirthday(interaction.user.id, interaction.guildId);

      if (!bday) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('No birthday registered')
              .setDescription("You haven't set a birthday. Use `/birthday set` first.")
          ],
          flags: 64
        });
      }

      const { inWindow, birthdayThisYear } = inClaimWindow(bday, now);

      if (!inWindow) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('Not your birthday')
              .setDescription(`Your birthday is **${MONTHS[bday.month - 1]} ${bday.day}**. You can claim within one day of it.`)
          ],
          flags: 64
        });
      }

      const claimYear = birthdayThisYear.getFullYear();
      const claimed = await createBirthdayClaim(interaction.user.id, interaction.guildId, claimYear);

      if (!claimed) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('Already claimed')
              .setDescription('You have already claimed your birthday coins this year.')
          ],
          flags: 64
        });
      }

      const coins = Math.floor(Math.random() * 100) + 1;
      await updateUserBalance(interaction.user.id, coins);
      await logTransaction(interaction.guildId, interaction.user.id, 'Birthday', coins, null, 'Birthday reward');

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🎂 Happy Birthday!')
            .setDescription(`You claimed **🪙 ${coins} coins** as your birthday reward!`)
        ],
        flags: 64
      });
    }

    if (sub === 'setchannel') {
      if (!await checkAdmin(interaction)) return;
      const channel = interaction.options.getChannel('channel');
      await updateSettings(interaction.guildId, { birthdayChannelId: channel.id });
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Birthday channel set')
            .setDescription(`Announcements will be posted in ${channel}.`)
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp()
        ],
        flags: 64
      });
    }

    if (sub === 'settimezone') {
      if (!await checkAdmin(interaction)) return;
      const tz = interaction.options.getString('timezone');
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Invalid timezone')
              .setDescription(`**${tz}** is not a valid IANA timezone.\nExamples: \`UTC\`, \`America/New_York\`, \`Europe/London\``)
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          flags: 64
        });
      }
      await updateSettings(interaction.guildId, { birthdayTimezone: tz });
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Birthday timezone set')
            .setDescription(`Announcements will fire at midnight in **${tz}**.`)
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp()
        ],
        flags: 64
      });
    }
  }
};
