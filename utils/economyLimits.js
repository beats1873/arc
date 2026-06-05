import { User, updateUserBalance, logTransaction } from '../data/database.js';
import { getGuildConfig } from './botConfig.js';

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

const SOURCE_CAP_KEY = {
  hangman: 'economyDailyCapHangman',
  trivia:  'economyDailyCapTrivia',
  emote:   'economyDailyCapEmote',
  levelup: 'economyDailyCapLevelup',
};

const SOURCE_ENABLED_KEY = {
  hangman: 'economyCapEnabledHangman',
  trivia:  'economyCapEnabledTrivia',
  emote:   'economyCapEnabledEmote',
  levelup: 'economyCapEnabledLevelup',
};

const TX_TYPE = {
  hangman: 'Hangman',
  trivia:  'Trivia',
  emote:   'Emote',
  levelup: 'Level Up',
};

/**
 * Check daily caps, award coins, log the transaction, and update the daily tally.
 * Returns { awarded: number, cappedBy: null | 'source' | 'overall' }.
 * awarded may be less than amount if a cap partially limited the payout.
 */
export async function checkAndAwardCoins(userId, guildId, source, amount, { item = null, note = '' } = {}) {
  const cfg   = await getGuildConfig(guildId);
  const today = todayUTC();

  const user       = await User.findOne({ userId });
  const sourceData = user?.dailyCoinsBySource ?? {};

  // How many coins this user already earned from this source today
  const sourceEntry = sourceData[source];
  const sourceToday = (sourceEntry?.date === today) ? (sourceEntry.amount ?? 0) : 0;

  // Sum across all sources to get the overall daily total
  let overallToday = 0;
  for (const entry of Object.values(sourceData)) {
    if (entry?.date === today) overallToday += (entry.amount ?? 0);
  }

  let toAward  = amount;
  let cappedBy = null;

  // Per-source cap check (only active when the enabled flag is on)
  const capKey        = SOURCE_CAP_KEY[source];
  const enabledKey    = SOURCE_ENABLED_KEY[source];
  const sourceEnabled = enabledKey ? (cfg[enabledKey] ?? false) : false;
  const sourceCap     = (sourceEnabled && capKey) ? (cfg[capKey] ?? 0) : 0;
  if (sourceCap > 0) {
    const remaining = sourceCap - sourceToday;
    if (remaining <= 0) return { awarded: 0, cappedBy: 'source' };
    if (toAward > remaining) { toAward = remaining; cappedBy = 'source'; }
  }

  // Overall daily cap check (only active when the enabled flag is on)
  const overallCap = (cfg.economyCapEnabledOverall ?? false) ? (cfg.economyDailyCapOverall ?? 0) : 0;
  if (overallCap > 0) {
    const remaining = overallCap - overallToday;
    if (remaining <= 0) return { awarded: 0, cappedBy: 'overall' };
    if (toAward > remaining) { toAward = remaining; cappedBy = 'overall'; }
  }

  await updateUserBalance(userId, toAward);
  await logTransaction(guildId, userId, TX_TYPE[source] ?? source, toAward, item, note);

  // Update per-source daily tally
  await User.findOneAndUpdate(
    { userId },
    { $set: { [`dailyCoinsBySource.${source}`]: { amount: sourceToday + toAward, date: today } } },
    { upsert: true }
  );

  return { awarded: toAward, cappedBy };
}
