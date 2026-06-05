import mongoose from 'mongoose';
import logger from '../utils/logger.js';

mongoose.connect(process.env.MONGO_URI, {})
  .then(() => logger.info('Database', 'MongoDB connected successfully'))
  .catch(err => {
    logger.error('Database', 'MongoDB connection failed', err);
    process.exit(1);
  });

mongoose.connection.on('disconnected', () => logger.warn('Database', 'MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => logger.info('Database', 'MongoDB reconnected'));
mongoose.connection.on('error',        (err) => logger.error('Database', 'MongoDB error', err));

const emoteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  emote: { type: String, required: true },
  count: { type: Number, default: 0 },
  targets: { type: Map, of: Number }
});
const Emote = mongoose.model('Emote', emoteSchema);

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  coins: { type: Number, default: 0 },
  lastDaily: { type: Date, default: null },
  lastWeekly: { type: Date, default: null },
  // Tracks coins earned per source today: { [source]: { amount, date: "YYYY-MM-DD" } }
  dailyCoinsBySource: { type: mongoose.Schema.Types.Mixed, default: {} },
});
const User = mongoose.model('User', userSchema);

const settingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  prefix: { type: String, default: '=' },
  adminRole: { type: String, default: '' },
  modRoles: { type: [String], default: [] },
  triviaEnabled: { type: Boolean, default: false },
  birthdayChannelId: { type: String, default: null },
  birthdayTimezone: { type: String, default: 'UTC' },
  boostChannelId: { type: String, default: null },
  hangmanChannelId: { type: String, default: null },
  chatXpMin: { type: Number, default: 15 },
  chatXpMax: { type: Number, default: 25 },
  chatXpCooldown: { type: Number, default: 60 },
  voiceXpRate: { type: Number, default: 10 },
  commandPrefix: { type: String, default: '+' },
  // Feature flags
  birthdayEnabled:  { type: Boolean, default: true },
  boosterEnabled:   { type: Boolean, default: true },
  hangmanEnabled:   { type: Boolean, default: true },
  xpEnabled:        { type: Boolean, default: true },
  giveawayEnabled:  { type: Boolean, default: false },
  welcomeEnabled:   { type: Boolean, default: false },
  autoRoleEnabled:  { type: Boolean, default: false },
  autoRoleId:       { type: String,  default: null },
  // Embed colours (hex strings)
  primaryColor: { type: String, default: '#5865F2' },
  successColor: { type: String, default: '#57F287' },
  errorColor:   { type: String, default: '#ED4245' },
  warningColor: { type: String, default: '#FEE75C' },
  // Rank card / leaderboard image accent colour
  rankAccentColor: { type: String, default: '#5865F2' },
  // Per-embed title/footer overrides (blank = use bot default)
  levelUpTitle:   { type: String, default: '' },
  levelUpFooter:  { type: String, default: '' },
  birthdayTitle:       { type: String, default: '' },
  birthdayFooter:      { type: String, default: '' },
  birthdayDescription: { type: String, default: '' },
  birthdayRoleId:      { type: String, default: null },
  boostTitle:          { type: String, default: '' },
  boostFooter:         { type: String, default: '' },
  boostDescription:    { type: String, default: '' },
  // Rank card customisation
  rankCardTitle:  { type: String, default: '' },
  rankCardFooter: { type: String, default: '' },
  rankShowVoice:  { type: Boolean, default: true },
  // Leaderboard customisation
  leaderboardTitle: { type: String, default: '' },
  leaderboardSize:  { type: Number, default: 10 },
  // Welcome message
  welcomeChannelId:   { type: String, default: null },
  welcomeTitle:       { type: String, default: '' },
  welcomeBody:        { type: String, default: '' },
  welcomeFooter:      { type: String, default: '' },
  welcomeColor:       { type: String, default: '#5865F2' },
  welcomeMentionUser: { type: Boolean, default: true },
  // XP role boosts: [{ roleId, multiplier }]
  xpRoleBoosts: { type: [{ roleId: String, multiplier: Number }], default: [] },
  // XP ignore channels
  xpIgnoreChannels: { type: [String], default: [] },
  // Shop notification for role-less purchases
  shopNotifyRoleId:    { type: String, default: null },
  shopNotifyChannelId: { type: String, default: null },
  // Giveaway embed customisation
  giveawayRoles:        { type: [String], default: [] },
  giveawayEmoji:        { type: String, default: '🎉' },
  giveawayEmbedColor:   { type: String, default: '#5865F2' },
  giveawayEmbedHeader:  { type: String, default: '' },
  giveawayEmbedBody:    { type: String, default: '' },
  giveawayEmbedFooter:  { type: String, default: '' },
  // Giveaway winner announcement customisation
  giveawayWinnerTitle:  { type: String, default: '' },
  giveawayWinnerBody:   { type: String, default: '' },
  giveawayWinnerColor:  { type: String, default: '#57F287' },
  // Economy daily coin caps
  economyDailyCapOverall: { type: Number, default: 100 },
  economyDailyCapHangman: { type: Number, default: 50 },
  economyDailyCapTrivia:  { type: Number, default: 50 },
  economyDailyCapEmote:   { type: Number, default: 20 },
  economyDailyCapLevelup: { type: Number, default: 50 },
  // Whether each cap is active (false = unlimited)
  economyCapEnabledOverall: { type: Boolean, default: false },
  economyCapEnabledHangman: { type: Boolean, default: false },
  economyCapEnabledTrivia:  { type: Boolean, default: false },
  economyCapEnabledEmote:   { type: Boolean, default: false },
  economyCapEnabledLevelup: { type: Boolean, default: false },
});

const triviaSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, default: null },
  interval: { type: Number, default: 60 },
  questionsPerSession: { type: Number, default: 0 },
  modRoles: { type: [String], default: [] },
  triviaWinCoins: { type: Number, default: 5 },
  // Automated trivia (runs independently of manual sessions)
  autoEnabled:              { type: Boolean, default: false },
  autoChannelId:            { type: String,  default: null },
  autoInterval:             { type: Number,  default: 60 },
  autoCoinReward:           { type: Number,  default: 5 },
  autoQuestionsPerSession:  { type: Number,  default: 0 },
});

const TriviaSettings = mongoose.model('TriviaSettings', triviaSettingsSchema);
export { TriviaSettings };

const Settings = mongoose.model('Settings', settingsSchema);

export async function setAdminRole(guildId, adminRole) {
  try {
    return await Settings.findOneAndUpdate(
      { guildId },
      { adminRole },
      { new: true, upsert: true }
    );
  } catch (err) {
    console.error('Error updating admin role:', err);
    throw err;
  }
}

export async function getUserBalance(userId) {
  const user = await User.findOne({ userId });
  return user ? user.coins : 0;
}

export async function updateUserBalance(userId, amount) {
  const updated = await User.findOneAndUpdate(
    { userId },
    { $inc: { coins: amount } },
    { upsert: true, new: true }
  );
  return updated.coins;
}

export async function getSettings(guildId) {
  const settings = await Settings.findOne({ guildId });
  // Return a Mongoose document with all schema defaults populated rather than
  // a bare object — avoids feature flags (hangmanEnabled, xpEnabled, etc.)
  // being undefined on fresh installs with no settings document yet.
  return settings ?? new Settings({ guildId });
}

export async function updateSettings(guildId, update) {
  return Settings.findOneAndUpdate(
    { guildId },
    { $set: update },
    { upsert: true, new: true }
  );
}

export async function updateEmoteStats(userId, targetId, emote) {
  const update = { $inc: { count: 1 } };
  if (targetId) update.$inc[`targets.${targetId}`] = 1;

  const stats = await Emote.findOneAndUpdate(
    { userId, emote },
    update,
    { upsert: true, new: true }
  );

  return {
    total: stats.count,
    targetTotal: targetId ? stats.targets.get(targetId) || 0 : 0
  };
}

export async function getEmoteStats(userId, emote) {
  const stats = await Emote.findOne({ userId, emote });
  return stats ? stats.count : 0;
}

export { User, Settings };

const levelSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  xp: { type: Number, default: 0 },
  voiceXp: { type: Number, default: 0 }
});
levelSchema.index({ userId: 1, guildId: 1 }, { unique: true });
const LevelUser = mongoose.model('LevelUser', levelSchema);

export function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

export function minXPForLevel(level) {
  let xp = 0;
  for (let l = 0; l < level; l++) xp += xpForLevel(l);
  return xp;
}

export function getLevelFromXP(totalXp) {
  let level = 0;
  let xpSpent = 0;
  while (xpSpent + xpForLevel(level) <= totalXp) {
    xpSpent += xpForLevel(level);
    level++;
  }
  return {
    level,
    currentXp: totalXp - xpSpent,
    requiredXp: xpForLevel(level)
  };
}

export async function addXP(userId, guildId, amount) {
  const doc = await LevelUser.findOneAndUpdate(
    { userId, guildId },
    { $inc: { xp: amount } },
    { upsert: true, new: true }
  );
  const before = getLevelFromXP(doc.xp - amount);
  const after = getLevelFromXP(doc.xp);
  return { xp: doc.xp, ...after, leveledUp: after.level > before.level };
}

export async function getLevelData(userId, guildId) {
  const doc = await LevelUser.findOne({ userId, guildId });
  const xp = doc ? doc.xp : 0;
  return { xp, ...getLevelFromXP(xp) };
}

export async function getUserRank(userId, guildId, memberIds) {
  const doc = await LevelUser.findOne({ userId, guildId });
  const userXp = doc ? doc.xp : 0;
  const above = await LevelUser.countDocuments({
    guildId,
    userId: { $in: memberIds },
    xp: { $gt: userXp }
  });
  return above + 1;
}

export async function getUserVoiceRank(userId, guildId, memberIds) {
  const doc = await LevelUser.findOne({ userId, guildId });
  const userVoiceXp = doc?.voiceXp ?? 0;
  const above = await LevelUser.countDocuments({
    guildId,
    userId: { $in: memberIds },
    voiceXp: { $gt: userVoiceXp }
  });
  return above + 1;
}

export async function getLevelLeaderboard(memberIds, guildId, limit = 10) {
  return LevelUser.find({ userId: { $in: memberIds }, guildId })
    .sort({ xp: -1 })
    .limit(limit);
}

export async function getVoiceLevelLeaderboard(memberIds, guildId, limit = 10) {
  return LevelUser.find({ userId: { $in: memberIds }, guildId, voiceXp: { $gt: 0 } })
    .sort({ voiceXp: -1 })
    .limit(limit);
}

const levelRoleSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  level: { type: Number, required: true },
  roleId: { type: String, required: true }
});
levelRoleSchema.index({ guildId: 1, level: 1 }, { unique: true });
const LevelRole = mongoose.model('LevelRole', levelRoleSchema);

export async function setLevelRole(guildId, level, roleId) {
  return LevelRole.findOneAndUpdate(
    { guildId, level },
    { roleId },
    { upsert: true, new: true }
  );
}

export async function removeLevelRole(guildId, level) {
  return LevelRole.deleteOne({ guildId, level });
}

export async function getLevelRoles(guildId) {
  return LevelRole.find({ guildId }).sort({ level: 1 });
}

export async function getLevelRole(guildId, level) {
  return LevelRole.findOne({ guildId, level });
}

export async function addVoiceXP(userId, guildId, amount) {
  const doc = await LevelUser.findOneAndUpdate(
    { userId, guildId },
    { $inc: { voiceXp: amount } },
    { upsert: true, new: true }
  );
  const prev = doc.voiceXp - amount;
  const before = getLevelFromXP(prev < 0 ? 0 : prev);
  const after = getLevelFromXP(doc.voiceXp);
  return { voiceXp: doc.voiceXp, ...after, leveledUp: after.level > before.level };
}

export async function getVoiceLevelData(userId, guildId) {
  const doc = await LevelUser.findOne({ userId, guildId });
  const voiceXp = doc?.voiceXp ?? 0;
  return { voiceXp, ...getLevelFromXP(voiceXp) };
}

export async function setMinXPIfHigher(userId, guildId, field, xp) {
  await LevelUser.findOneAndUpdate(
    { userId, guildId },
    { $max: { [field]: xp } },
    { upsert: true }
  );
}

const voiceLevelRoleSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  level: { type: Number, required: true },
  roleId: { type: String, required: true }
});
voiceLevelRoleSchema.index({ guildId: 1, level: 1 }, { unique: true });
const VoiceLevelRole = mongoose.model('VoiceLevelRole', voiceLevelRoleSchema);

export async function setVoiceLevelRole(guildId, level, roleId) {
  return VoiceLevelRole.findOneAndUpdate(
    { guildId, level },
    { roleId },
    { upsert: true, new: true }
  );
}

export async function removeVoiceLevelRole(guildId, level) {
  return VoiceLevelRole.deleteOne({ guildId, level });
}

export async function getVoiceLevelRoles(guildId) {
  return VoiceLevelRole.find({ guildId }).sort({ level: 1 });
}

export async function getVoiceLevelRole(guildId, level) {
  return VoiceLevelRole.findOne({ guildId, level });
}

const birthdaySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  month: { type: Number, required: true },
  day: { type: Number, required: true },
  year: { type: Number, default: null }
});
birthdaySchema.index({ userId: 1, guildId: 1 }, { unique: true });
const Birthday = mongoose.model('Birthday', birthdaySchema);

export async function setBirthday(userId, guildId, month, day, year = null) {
  return Birthday.findOneAndUpdate(
    { userId, guildId },
    { month, day, year },
    { upsert: true, new: true }
  );
}

export async function removeBirthday(userId, guildId) {
  return Birthday.deleteOne({ userId, guildId });
}

export async function getBirthdaysToday(guildId, month, day) {
  return Birthday.find({ guildId, month, day });
}

export async function getAllBirthdays(guildId) {
  return Birthday.find({ guildId }).sort({ month: 1, day: 1 });
}

export async function getBirthday(userId, guildId) {
  return Birthday.findOne({ userId, guildId });
}

export async function upsertLevelUser(userId, guildId, xp) {
  return LevelUser.findOneAndUpdate(
    { userId, guildId },
    { xp },
    { upsert: true, new: true }
  );
}

export async function getAllLevelUsers(guildId) {
  return LevelUser.find({ guildId });
}

const shopItemSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  cost: { type: Number, required: true },
  quantity: { type: Number, default: null },
  roleId: { type: String, default: null }
});
shopItemSchema.index({ guildId: 1, name: 1 }, { unique: true });
const ShopItem = mongoose.model('ShopItem', shopItemSchema);

export async function addShopItem(guildId, name, cost, quantity = null, description = '', roleId = null) {
  return ShopItem.findOneAndUpdate(
    { guildId, name: name.toLowerCase() },
    { cost, quantity, description, roleId, name: name.toLowerCase() },
    { upsert: true, new: true }
  );
}

export async function removeShopItem(guildId, name) {
  return ShopItem.deleteOne({ guildId, name: name.toLowerCase() });
}

export async function getShopItems(guildId) {
  return ShopItem.find({ guildId }).sort({ cost: 1 });
}

export async function getShopItem(guildId, name) {
  return ShopItem.findOne({ guildId, name: name.toLowerCase() });
}

export async function decrementShopItem(guildId, name) {
  return ShopItem.findOneAndUpdate(
    { guildId, name: name.toLowerCase(), quantity: { $gt: 0 } },
    { $inc: { quantity: -1 } },
    { new: true }
  );
}

export async function updateShopItem(guildId, originalName, updates) {
  const set = {};
  if (updates.name      !== undefined) set.name        = updates.name.toLowerCase();
  if (updates.cost      !== undefined) set.cost        = Number(updates.cost);
  if (updates.quantity  !== undefined) set.quantity    = updates.quantity != null ? Number(updates.quantity) : null;
  if (updates.description !== undefined) set.description = updates.description;
  if (updates.roleId    !== undefined) set.roleId      = updates.roleId || null;
  return ShopItem.findOneAndUpdate(
    { guildId, name: originalName.toLowerCase() },
    { $set: set },
    { new: true }
  );
}

const birthdayClaimSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  year: { type: Number, required: true }
});
birthdayClaimSchema.index({ userId: 1, guildId: 1, year: 1 }, { unique: true });
const BirthdayClaim = mongoose.model('BirthdayClaim', birthdayClaimSchema);

const transactionSchema = new mongoose.Schema({
  guildId:  { type: String, required: true },
  userId:   { type: String, required: true },
  type:     { type: String, required: true }, // daily|weekly|addcoins|removecoins|resetcoins|shop_buy|level_up
  amount:   { type: Number, default: 0 },
  item:     { type: String, default: null },
  note:     { type: String, default: '' },
  date:     { type: Date, default: Date.now },
  expireAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
});
transactionSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 }); // auto-delete after 30 days
transactionSchema.index({ guildId: 1, date: -1 });
const Transaction = mongoose.model('Transaction', transactionSchema);
export { Transaction };

// Weekly XP baseline snapshot — one document per guild per week
const xpSnapshotSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  weekStart: { type: Date,   required: true },    // Sunday midnight UTC
  baselines: [{ userId: String, chatXp: Number, voiceXp: Number }],
});
xpSnapshotSchema.index({ guildId: 1, weekStart: 1 }, { unique: true });
const XpWeekSnapshot = mongoose.model('XpWeekSnapshot', xpSnapshotSchema);
export { XpWeekSnapshot };

const webhookMessageSchema = new mongoose.Schema({
  guildId:         { type: String, required: true, index: true },
  name:            { type: String, required: true },
  channelId:       { type: String, default: null },   // target channel; bot manages the webhook
  webhookUrl:      { type: String, default: null },   // kept for legacy / manual-URL mode
  webhookId:       { type: String, default: null },   // cached Discord webhook ID created by bot
  messageId:       { type: String, default: null },
  content:         { type: String, default: '' },
  webhookUsername: { type: String, default: '' },     // custom sender name shown in Discord
  webhookAvatar:   { type: String, default: '' },     // custom sender avatar URL
  embeds:          { type: Array,  default: [] },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now },
});
const WebhookMessage = mongoose.model('WebhookMessage', webhookMessageSchema);
export { WebhookMessage };

export async function logTransaction(guildId, userId, type, amount = 0, item = null, note = '') {
  try {
    await Transaction.create({
      guildId, userId, type, amount, item, note,
      expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  } catch (e) {
    console.error('[Transactions] Failed to log:', e.message);
  }
}

export async function createBirthdayClaim(userId, guildId, year) {
  try {
    await BirthdayClaim.create({ userId, guildId, year });
    return true;
  } catch {
    return false;
  }
}

// ── Giveaways ─────────────────────────────────────────────────────────────────
const giveawaySchema = new mongoose.Schema({
  guildId:     { type: String, required: true },
  channelId:   { type: String, required: true },
  messageId:   { type: String, default: null },
  prize:       { type: String, required: true },
  hostUserId:  { type: String, required: true },
  startTime:   { type: Date, default: Date.now },
  endTime:     { type: Date, required: true },
  status:      { type: String, default: 'active' }, // active | ended
  winnerUserId:{ type: String, default: null },
  emoji:       { type: String, default: '🎉' },
  entries:     { type: [String], default: [] },
});
giveawaySchema.index({ guildId: 1, status: 1 });
const Giveaway = mongoose.model('Giveaway', giveawaySchema);
export { Giveaway };

export async function createGiveaway(data) {
  return Giveaway.create(data);
}

export async function getActiveGiveaways(guildId) {
  return Giveaway.find({ guildId, status: 'active' }).sort({ endTime: 1 });
}

export async function getAllGiveaways(guildId) {
  return Giveaway.find({ guildId }).sort({ startTime: -1 }).limit(50);
}

export async function getGiveaway(id) {
  return Giveaway.findById(id);
}

export async function endGiveaway(id, winnerUserId, entries) {
  return Giveaway.findByIdAndUpdate(id, { status: 'ended', winnerUserId, entries }, { new: true });
}

export async function updateGiveawayMessage(id, messageId) {
  return Giveaway.findByIdAndUpdate(id, { messageId }, { new: true });
}
