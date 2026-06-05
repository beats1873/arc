import { TriviaSettings } from '../data/database.js';

export async function getTriviaSettings(guildId) {
  let settings = await TriviaSettings.findOne({ guildId });
  if (!settings) {
    settings = await TriviaSettings.create({ guildId });
  }
  return settings;
}

export async function updateTriviaSettings(guildId, updates) {
  const updated = await TriviaSettings.findOneAndUpdate(
    { guildId },
    { $set: updates },
    { upsert: true, new: true }
  );
  return updated;
}
