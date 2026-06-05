import { giveawayByMessage } from '../utils/giveawayManager.js';
import { Giveaway } from '../data/database.js';

// Track reaction adds so dashboard entry count updates in real-time
async function handleReaction(reaction, user, added) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const giveawayId = giveawayByMessage.get(reaction.message.id);
  if (!giveawayId) return;

  const giveaway = await Giveaway.findById(giveawayId);
  if (!giveaway || giveaway.status !== 'active') return;
  if (reaction.emoji.name !== giveaway.emoji) return;

  if (added) {
    await Giveaway.findByIdAndUpdate(giveawayId, { $addToSet: { entries: user.id } });
  } else {
    await Giveaway.findByIdAndUpdate(giveawayId, { $pull: { entries: user.id } });
  }
}

export const reactionAddEvent = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    await handleReaction(reaction, user, true);
  }
};

export const reactionRemoveEvent = {
  name: 'messageReactionRemove',
  async execute(reaction, user) {
    await handleReaction(reaction, user, false);
  }
};
