import { EmbedBuilder } from 'discord.js';
import { Giveaway, getActiveGiveaways, endGiveaway, getSettings } from '../data/database.js';
import logger from './logger.js';

// giveawayId (string) → timeout handle
const activeTimers = new Map();
// messageId → giveawayId  (for reaction tracking)
export const giveawayByMessage = new Map();

export async function scheduleGiveaway(giveaway, client) {
  const id = giveaway._id.toString();
  const remaining = new Date(giveaway.endTime) - Date.now();

  if (activeTimers.has(id)) {
    clearTimeout(activeTimers.get(id));
    logger.debug('Giveaways', `Cleared existing timer for giveaway ${id}`);
  }

  if (remaining <= 0) {
    logger.info('Giveaways', `Giveaway ${id} ("${giveaway.prize}") already expired — finishing immediately`);
    await finishGiveaway(giveaway, client);
    return;
  }

  if (giveaway.messageId) giveawayByMessage.set(giveaway.messageId, id);

  const handle = setTimeout(() => finishGiveaway(giveaway, client), remaining);
  activeTimers.set(id, handle);
  logger.info('Giveaways', `Scheduled giveaway ${id} ("${giveaway.prize}") — ends in ${Math.round(remaining / 1000)}s`);
}

export async function cancelGiveawayTimer(giveawayId) {
  const id = giveawayId.toString();
  const h = activeTimers.get(id);
  if (h) {
    clearTimeout(h);
    activeTimers.delete(id);
    logger.info('Giveaways', `Cancelled timer for giveaway ${id}`);
  }
}

export async function finishGiveaway(giveaway, client, manual = false) {
  const id = giveaway._id.toString();
  activeTimers.delete(id);
  if (giveaway.messageId) giveawayByMessage.delete(giveaway.messageId);

  const fresh = await Giveaway.findById(id);
  if (!fresh || fresh.status === 'ended') {
    logger.debug('Giveaways', `Giveaway ${id} already ended — skipping`);
    return;
  }

  const guild = client.guilds.cache.get(giveaway.guildId);
  if (!guild) {
    logger.warn('Giveaways', `Guild ${giveaway.guildId} not found when finishing giveaway ${id}`);
    return;
  }

  const channel = guild.channels.cache.get(giveaway.channelId)
    ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) {
    logger.warn('Giveaways', `Channel ${giveaway.channelId} not found for giveaway ${id} in guild ${giveaway.guildId}`);
    return;
  }

  let entries = [];
  try {
    const msg = await channel.messages.fetch(giveaway.messageId);
    const reaction = msg.reactions.cache.get(giveaway.emoji);
    if (reaction) {
      const users = await reaction.users.fetch();
      entries = users.filter(u => !u.bot).map(u => u.id);
    }
    logger.debug('Giveaways', `Giveaway ${id}: fetched ${entries.length} entries`);
  } catch (err) {
    logger.warn('Giveaways', `Could not fetch reactions for giveaway ${id} (message deleted?)`, err);
  }

  let winner = null;
  if (entries.length > 0) {
    winner = entries[Math.floor(Math.random() * entries.length)];
    logger.info('Giveaways', `Giveaway ${id} ("${giveaway.prize}") winner: ${winner} from ${entries.length} entries (manual=${manual})`);
  } else {
    logger.info('Giveaways', `Giveaway ${id} ("${giveaway.prize}") ended with no entries`);
  }

  await endGiveaway(id, winner, entries);

  // Load winner embed customisation
  const settings = await getSettings(giveaway.guildId).catch(() => ({}));
  const replaceWinner = (str) => (str || '')
    .replace(/\{prize\}/gi,   giveaway.prize)
    .replace(/\{winner\}/gi,  winner ? `<@${winner}>` : 'None')
    .replace(/\{entries\}/gi, String(entries.length));

  const winnerColor = settings.giveawayWinnerColor
    ? parseInt(settings.giveawayWinnerColor.replace('#', ''), 16)
    : (winner ? 0x57F287 : 0xED4245);

  const winnerTitle = settings.giveawayWinnerTitle?.trim()
    ? replaceWinner(settings.giveawayWinnerTitle)
    : '🎉 Giveaway Ended!';

  const winnerBody = settings.giveawayWinnerBody?.trim()
    ? replaceWinner(settings.giveawayWinnerBody)
    : null;

  const embed = new EmbedBuilder()
    .setColor(winnerColor)
    .setTitle(winnerTitle)
    .setTimestamp();

  if (winnerBody) {
    embed.setDescription(winnerBody);
  }

  embed.addFields(
    { name: 'Prize',   value: giveaway.prize,                               inline: true },
    { name: 'Winner',  value: winner ? `<@${winner}>` : 'No valid entries', inline: true },
    { name: 'Entries', value: `${entries.length}`,                          inline: true }
  );

  await channel.send({ content: winner ? `🎊 Congratulations <@${winner}>!` : null, embeds: [embed] })
    .catch(err => logger.error('Giveaways', `Failed to send winner announcement for giveaway ${id}`, err));

  try {
    const msg = await channel.messages.fetch(giveaway.messageId);
    const endedEmbed = EmbedBuilder.from(msg.embeds[0])
      .setColor(0x95a5a6)
      .setTitle('🎉 Giveaway — Ended')
      .setDescription(`**Winner:** ${winner ? `<@${winner}>` : 'None'}\n**Prize:** ${giveaway.prize}`);
    await msg.edit({ embeds: [endedEmbed] });
  } catch (err) {
    logger.warn('Giveaways', `Could not edit original giveaway message for ${id}`, err);
  }
}

export async function scheduleAllActiveGiveaways(client) {
  const GUILD_ID = process.env.GUILD_ID;
  if (!GUILD_ID) {
    logger.warn('Giveaways', 'GUILD_ID not set — skipping giveaway restore');
    return;
  }
  try {
    const active = await getActiveGiveaways(GUILD_ID);
    logger.info('Giveaways', `Restoring ${active.length} active giveaway(s) for guild ${GUILD_ID}`);
    for (const g of active) {
      await scheduleGiveaway(g, client);
    }
  } catch (err) {
    logger.error('Giveaways', 'Failed to restore active giveaways', err);
  }
}
