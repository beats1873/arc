import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import axios from 'axios';
import {
  getSettings, updateSettings, Transaction, WebhookMessage,
  getShopItems, addShopItem, removeShopItem, updateShopItem,
  getLevelRoles, setLevelRole, removeLevelRole,
  getVoiceLevelRoles, setVoiceLevelRole, removeVoiceLevelRole,
  getLevelData, getVoiceLevelData, setMinXPIfHigher, minXPForLevel,
  getAllLevelUsers,
  TriviaSettings, User, XpWeekSnapshot,
  Giveaway, getActiveGiveaways, getAllGiveaways, getGiveaway, endGiveaway,
} from '../data/database.js';
import { getTriviaSettings } from '../utils/triviaSettings.js';
import { invalidateConfig } from '../utils/botConfig.js';
import { activeSessions, startTriviaSession, stopTriviaSession } from '../utils/triviaEngine.js';
import { autoSessions, startAutoTrivia, stopAutoTrivia } from '../utils/triviaAutoEngine.js';
import { scheduleGiveaway, cancelGiveawayTimer, finishGiveaway } from '../utils/giveawayManager.js';
import logger, { getLogBuffer } from '../utils/logger.js';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const DISCORD_API   = 'https://discord.com/api/v10';
const GUILD_ID      = process.env.GUILD_ID;
const QUESTIONS_PATH = path.join(__dirname, '../data/questions.json');
const UPLOADS_DIR   = path.join(__dirname, 'public', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

// Discord username cache (id → { username, avatarUrl, cachedAt })
const _userCache = new Map();
async function resolveUser(id) {
  const hit = _userCache.get(id);
  if (hit && Date.now() - hit.cachedAt < 3_600_000) return hit;
  try {
    const { data } = await axios.get(`${DISCORD_API}/users/${id}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    const info = {
      username:   data.global_name || data.username,
      avatarUrl:  data.avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${data.avatar}.png?size=32`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % 5n)}.png`,
      profileUrl: `https://discord.com/users/${id}`,
      cachedAt:   Date.now(),
    };
    _userCache.set(id, info);
    return info;
  } catch {
    const fallback = { username: id, avatarUrl: null, profileUrl: `https://discord.com/users/${id}`, cachedAt: Date.now() };
    _userCache.set(id, fallback);
    return fallback;
  }
}

// Bit flags for admin-level permissions
const PERM_ADMINISTRATOR = BigInt(0x8);
const PERM_MANAGE_GUILD  = BigInt(0x20);

function hasAdminAccess(permissions) {
  const p = BigInt(permissions);
  return (p & PERM_ADMINISTRATOR) !== 0n || (p & PERM_MANAGE_GUILD) !== 0n;
}

// ── Bot profile info ────────────────────────────────────────────────────
let botInfo = { username: 'Arcturus', avatarUrl: null };

async function fetchBotInfo() {
  try {
    const { data } = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    botInfo = {
      username: data.username,
      avatarUrl: data.avatar
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(data.id) % 5n)}.png`,
    };
  } catch (e) {
    logger.warn('Dashboard', 'Could not fetch bot info', e);
  }
}

// ── App setup ───────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '10mb' }));

// HTTP request logging
app.use((req, _res, next) => {
  logger.debug('Dashboard', `${req.method} ${req.path}`);
  next();
});

app.use(session({
  secret: process.env.CLIENT_SECRET || 'arcturus-dashboard',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));

// Auth middleware — protects all /api routes and the SPA root
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/auth/login');
}

// Guild scope middleware — enforces a guild is selected for data API routes.
// Exempt: /api/me, /api/my-guilds, /api/select-guild, /api/logs, /api/questions, /api/uploads
const _GUILD_EXEMPT = ['/api/me', '/api/my-guilds', '/api/select-guild', '/api/logs', '/api/questions', '/api/uploads'];
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (_GUILD_EXEMPT.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();
  if (!req.session?.user) return next(); // unauthenticated — let requireAuth handle it
  if (!req.session?.guildId) return res.status(403).json({ error: 'No server selected' });
  req.guildId = req.session.guildId;
  next();
});

// Favicon — proxy the bot's avatar (no auth needed)
app.get('/favicon.ico', async (req, res) => {
  if (!botInfo?.avatarUrl) return res.status(404).end();
  try {
    const response = await axios.get(botInfo.avatarUrl, { responseType: 'arraybuffer' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(response.data);
  } catch { res.status(404).end(); }
});

// ── OAuth2 ──────────────────────────────────────────────────────────────
// These routes must be registered BEFORE the requireAuth static middleware,
// otherwise every request (including /auth/login itself) gets redirect-looped.
const baseUrl    = () => process.env.DASHBOARD_URL || `http://localhost:${process.env.DASHBOARD_PORT || 3001}`;
const redirectUri = () => `${baseUrl()}/auth/callback`;

app.get('/auth/login', (req, res) => {
  // Random state for CSRF protection
  const state = Math.random().toString(36).slice(2);
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id:     process.env.CLIENT_ID,
    redirect_uri:  redirectUri(),
    response_type: 'code',
    scope:         'identify guilds',
    state,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) return res.redirect('/auth/login');
  if (state !== req.session.oauthState) return res.redirect('/auth/login');
  delete req.session.oauthState;

  try {
    const tokenRes = await axios.post(`${DISCORD_API}/oauth2/token`, new URLSearchParams({
      client_id:     process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri(),
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token } = tokenRes.data;
    const authHeader = { Authorization: `Bearer ${access_token}` };

    const [userRes, guildsRes] = await Promise.all([
      axios.get(`${DISCORD_API}/users/@me`, { headers: authHeader }),
      axios.get(`${DISCORD_API}/users/@me/guilds`, { headers: authHeader }),
    ]);

    const user       = userRes.data;
    const userGuilds = guildsRes.data;

    // Guilds the bot is currently in
    const botGuildIds = discordClient
      ? new Set(discordClient.guilds.cache.keys())
      : (GUILD_ID ? new Set([GUILD_ID]) : new Set());

    // Intersection: bot is present AND user has admin perms
    const accessibleGuilds = userGuilds
      .filter(g => botGuildIds.has(g.id) && hasAdminAccess(g.permissions))
      .map(g => ({
        id:      g.id,
        name:    g.name,
        iconUrl: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
          : null,
      }));

    if (!accessibleGuilds.length) {
      return res.send(`<!DOCTYPE html><html><head><title>Access Denied</title>
        <style>body{font-family:sans-serif;background:#1e1f22;color:#dbdee1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}a{color:#5865f2}</style></head>
        <body><div><h2>Access Denied</h2>
        <p>You need <strong>Manage Server</strong> or <strong>Administrator</strong> in a server this bot is in.</p>
        <a href="/auth/login">Try again</a></div></body></html>`);
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`,
    };
    req.session.availableGuilds = accessibleGuilds;

    // Auto-select when only one option — no picker needed
    if (accessibleGuilds.length === 1) req.session.guildId = accessibleGuilds[0].id;

    // Explicitly save session before redirecting so the cookie is guaranteed
    // to be written before the browser follows the redirect to /
    req.session.save(err => {
      if (err) logger.error('Dashboard', 'Session save failed', err);
      res.redirect('/');
    });
  } catch (e) {
    logger.error('Dashboard', 'OAuth callback error', e.response?.data ?? e);
    res.redirect('/auth/login');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
});

// Serve static files (index.html, etc.) only to authenticated users.
// Registered after /auth/* routes so those are never caught by requireAuth.
app.use(requireAuth, express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// ── Public API (requires session) ───────────────────────────────────────
app.get('/api/me', requireAuth, (req, res) => {
  const available    = req.session.availableGuilds ?? [];
  const selectedGuild = available.find(g => g.id === req.session.guildId) ?? null;
  res.json({ user: req.session.user, bot: botInfo, selectedGuild, availableGuilds: available });
});

// Guild picker endpoints — no guild required
app.get('/api/my-guilds', requireAuth, (req, res) => {
  res.json({ guilds: req.session.availableGuilds ?? [], selectedGuildId: req.session.guildId ?? null });
});

app.post('/api/select-guild', requireAuth, (req, res) => {
  const { guildId } = req.body;
  const guild = (req.session.availableGuilds ?? []).find(g => g.id === guildId);
  if (!guild) return res.status(403).json({ error: 'Not authorized for that server' });
  req.session.guildId = guildId;
  res.json({ ok: true, guild });
});

// Settings
app.get('/api/settings', requireAuth, async (req, res) => {
  try { res.json(await getSettings(req.guildId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/settings', requireAuth, async (req, res) => {
  try {
    const allowed = [
      'prefix', 'commandPrefix',
      'birthdayChannelId', 'birthdayTimezone', 'birthdayEnabled',
      'boostChannelId', 'boosterEnabled',
      'hangmanChannelId', 'hangmanEnabled',
      'triviaEnabled', 'xpEnabled',
      'primaryColor', 'successColor', 'errorColor', 'warningColor',
      'levelUpTitle', 'levelUpFooter',
      'birthdayTitle', 'birthdayFooter', 'birthdayDescription', 'birthdayRoleId',
      'boostTitle', 'boostFooter', 'boostDescription',
      'rankAccentColor',
      'rankCardTitle', 'rankCardFooter', 'rankShowVoice',
      'leaderboardTitle', 'leaderboardSize',
      // Welcome
      'welcomeEnabled', 'welcomeChannelId', 'welcomeTitle', 'welcomeBody', 'welcomeFooter', 'welcomeColor', 'welcomeMentionUser',
      // Auto-role
      'autoRoleEnabled', 'autoRoleId',
      // Giveaway
      'giveawayEnabled', 'giveawayRoles', 'giveawayEmoji', 'giveawayEmbedColor', 'giveawayEmbedHeader', 'giveawayEmbedBody', 'giveawayEmbedFooter',
      'giveawayWinnerTitle', 'giveawayWinnerBody', 'giveawayWinnerColor',
      // Shop notification
      'shopNotifyRoleId', 'shopNotifyChannelId',
      // XP
      'xpRoleBoosts', 'xpIgnoreChannels',
    ];
    const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const result = await updateSettings(req.guildId, update);
    invalidateConfig(req.guildId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/settings/xp', requireAuth, async (req, res) => {
  try {
    const allowed = ['chatXpMin', 'chatXpMax', 'chatXpCooldown', 'voiceXpRate'];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = Number(req.body[k]);
    }
    res.json(await updateSettings(req.guildId, update));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/settings/economy', requireAuth, async (req, res) => {
  try {
    const capFields     = ['economyDailyCapOverall', 'economyDailyCapHangman', 'economyDailyCapTrivia', 'economyDailyCapEmote', 'economyDailyCapLevelup'];
    const enabledFields = ['economyCapEnabledOverall', 'economyCapEnabledHangman', 'economyCapEnabledTrivia', 'economyCapEnabledEmote', 'economyCapEnabledLevelup'];
    const update = {};
    for (const k of capFields) {
      if (req.body[k] !== undefined) {
        const v = parseInt(req.body[k], 10);
        if (!isNaN(v) && v >= 0) update[k] = v;
      }
    }
    for (const k of enabledFields) {
      if (req.body[k] !== undefined) update[k] = Boolean(req.body[k]);
    }
    const result = await updateSettings(req.guildId, update);
    invalidateConfig(req.guildId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/settings/mod-roles', requireAuth, async (req, res) => {
  try {
    const { modRoles } = req.body;
    if (!Array.isArray(modRoles)) return res.status(400).json({ error: 'modRoles must be an array' });
    res.json(await updateSettings(req.guildId, { modRoles }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Trivia
app.get('/api/trivia', requireAuth, async (req, res) => {
  try {
    const t = await TriviaSettings.findOne({ guildId: req.guildId }) ?? { channelId: null, interval: 60, modRoles: [] };
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/trivia', requireAuth, async (req, res) => {
  try {
    const update = {};
    if (req.body.channelId           !== undefined) update.channelId           = req.body.channelId || null;
    if (req.body.interval            !== undefined) update.interval            = Number(req.body.interval);
    if (req.body.questionsPerSession !== undefined) update.questionsPerSession = Number(req.body.questionsPerSession);
    if (req.body.modRoles            !== undefined) update.modRoles            = req.body.modRoles;
    if (req.body.triviaWinCoins      !== undefined) update.triviaWinCoins      = Number(req.body.triviaWinCoins);
    if (req.body.autoEnabled         !== undefined) update.autoEnabled         = Boolean(req.body.autoEnabled);
    if (req.body.autoChannelId       !== undefined) update.autoChannelId       = req.body.autoChannelId || null;
    if (req.body.autoInterval        !== undefined) update.autoInterval        = Number(req.body.autoInterval);
    if (req.body.autoCoinReward             !== undefined) update.autoCoinReward             = Number(req.body.autoCoinReward);
    if (req.body.autoQuestionsPerSession    !== undefined) update.autoQuestionsPerSession    = Number(req.body.autoQuestionsPerSession);
    const t = await TriviaSettings.findOneAndUpdate({ guildId: req.guildId }, { $set: update }, { upsert: true, new: true });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Trivia session control
app.get('/api/trivia/status', requireAuth, (req, res) => {
  res.json({ active: activeSessions.has(req.guildId) });
});

app.post('/api/trivia/start', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const guild = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
    const settings = await getTriviaSettings(req.guildId);
    if (!settings.channelId) return res.status(400).json({ error: 'No trivia channel configured' });
    const result = await startTriviaSession(guild, settings);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trivia/stop', requireAuth, (req, res) => {
  const stopped = stopTriviaSession(req.guildId);
  res.json({ ok: stopped });
});

// Level roles
app.get('/api/level-roles', requireAuth, async (req, res) => {
  try { res.json(await getLevelRoles(req.guildId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/level-roles', requireAuth, async (req, res) => {
  try {
    const { level, roleId } = req.body;
    res.json(await setLevelRole(req.guildId, Number(level), roleId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/level-roles/:level', requireAuth, async (req, res) => {
  try {
    await removeLevelRole(req.guildId, Number(req.params.level));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Voice level roles
app.get('/api/voice-roles', requireAuth, async (req, res) => {
  try { res.json(await getVoiceLevelRoles(req.guildId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/voice-roles', requireAuth, async (req, res) => {
  try {
    const { level, roleId } = req.body;
    res.json(await setVoiceLevelRole(req.guildId, Number(level), roleId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/voice-roles/:level', requireAuth, async (req, res) => {
  try {
    await removeVoiceLevelRole(req.guildId, Number(req.params.level));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Shop
app.get('/api/shop', requireAuth, async (req, res) => {
  try { res.json(await getShopItems(req.guildId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shop', requireAuth, async (req, res) => {
  try {
    const { name, cost, quantity, description, roleId } = req.body;
    res.json(await addShopItem(req.guildId, name, Number(cost), quantity ? Number(quantity) : null, description || '', roleId || null));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/shop/:name', requireAuth, async (req, res) => {
  try {
    const { name, cost, quantity, description, roleId } = req.body;
    const updated = await updateShopItem(req.guildId, req.params.name, { name, cost, quantity, description, roleId });
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/shop/:name', requireAuth, async (req, res) => {
  try {
    await removeShopItem(req.guildId, req.params.name);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper: last Sunday midnight UTC
function getWeekStart() {
  const now = new Date();
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay()));
  return sunday;
}

// Stats
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const weekStart = getWeekStart();

    // Resolve guild member IDs for scoping coin stats to this guild
    let memberIds = null;
    let totalMembers = null;
    if (discordClient) {
      try {
        const guild = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
        totalMembers = guild.memberCount;
        // Use cache if reasonably populated; otherwise fetch
        if (guild.members.cache.size < guild.memberCount * 0.5) await guild.members.fetch().catch(() => {});
        memberIds = [...guild.members.cache.keys()];
      } catch { /* non-fatal */ }
    }

    const userFilter = memberIds ? { userId: { $in: memberIds } } : {};

    const [topCoinsRaw, allLevel, totalUsers, allCoinsUsers, weeklyTxRaw] = await Promise.all([
      User.find(userFilter).sort({ coins: -1 }).limit(10),
      getAllLevelUsers(req.guildId),
      memberIds ? User.countDocuments(userFilter) : User.countDocuments(),
      User.find(userFilter, 'coins'),
      Transaction.aggregate([
        { $match: { guildId: req.guildId, date: { $gte: weekStart }, amount: { $gt: 0 } } },
        { $group: { _id: '$userId', earned: { $sum: '$amount' } } },
        { $sort: { earned: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const totalCoins = allCoinsUsers.reduce((s, u) => s + (u.coins ?? 0), 0);
    const totalXP    = allLevel.reduce((s, u) => s + ((u.xp ?? 0) + (u.voiceXp ?? 0)), 0);
    const activeXP   = allLevel.filter(u => (u.xp ?? 0) + (u.voiceXp ?? 0) > 0).length;

    // All-time leaderboards
    const topChatXp  = [...allLevel].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0)).slice(0, 10);
    const topVoiceXp = [...allLevel].sort((a, b) => (b.voiceXp ?? 0) - (a.voiceXp ?? 0)).slice(0, 10);
    const topTotalXp = [...allLevel].sort((a, b) => ((b.xp ?? 0) + (b.voiceXp ?? 0)) - ((a.xp ?? 0) + (a.voiceXp ?? 0))).slice(0, 10);

    // Weekly XP snapshot — create if missing for this week
    let snapshot = await XpWeekSnapshot.findOne({ guildId: req.guildId, weekStart });
    if (!snapshot) {
      const baselines = allLevel.map(u => ({ userId: u.userId, chatXp: u.xp ?? 0, voiceXp: u.voiceXp ?? 0 }));
      snapshot = await XpWeekSnapshot.findOneAndUpdate(
        { guildId: req.guildId, weekStart },
        { $setOnInsert: { baselines } },
        { upsert: true, new: true }
      );
    }
    const baselineMap = new Map(snapshot.baselines.map(b => [b.userId, b]));

    const weeklyXpUsers = allLevel.map(u => {
      const base = baselineMap.get(u.userId) ?? { chatXp: 0, voiceXp: 0 };
      return {
        userId:       u.userId,
        deltaChatXp:  Math.max(0, (u.xp ?? 0) - base.chatXp),
        deltaVoiceXp: Math.max(0, (u.voiceXp ?? 0) - base.voiceXp),
        deltaTotalXp: Math.max(0, ((u.xp ?? 0) + (u.voiceXp ?? 0)) - (base.chatXp + base.voiceXp)),
      };
    });
    const topWeeklyChatXp  = [...weeklyXpUsers].sort((a, b) => b.deltaChatXp  - a.deltaChatXp ).slice(0, 10).filter(u => u.deltaChatXp  > 0);
    const topWeeklyVoiceXp = [...weeklyXpUsers].sort((a, b) => b.deltaVoiceXp - a.deltaVoiceXp).slice(0, 10).filter(u => u.deltaVoiceXp > 0);
    const topWeeklyTotalXp = [...weeklyXpUsers].sort((a, b) => b.deltaTotalXp - a.deltaTotalXp).slice(0, 10).filter(u => u.deltaTotalXp > 0);

    // Collect all user IDs to resolve
    const allIds = [...new Set([
      ...topCoinsRaw.map(u => u.userId),
      ...topTotalXp.map(u => u.userId),
      ...topChatXp.map(u => u.userId),
      ...topVoiceXp.map(u => u.userId),
      ...weeklyTxRaw.map(u => u._id),
      ...topWeeklyTotalXp.map(u => u.userId),
      ...topWeeklyChatXp.map(u => u.userId),
      ...topWeeklyVoiceXp.map(u => u.userId),
    ])];
    const resolved = await Promise.all(allIds.map(resolveUser));
    const userMap  = Object.fromEntries(allIds.map((id, i) => [id, resolved[i]]));

    const attachInfo  = (u, key) => ({ userId: u.userId,  [key]: u[key],  userInfo: userMap[u.userId] });
    const attachDelta = (u, key) => ({ userId: u.userId,  [key]: u[key],  userInfo: userMap[u.userId] });

    res.json({
      // Summary figures
      totalUsers, totalMembers, totalCoins, totalXP, activeXP,
      weekStart: weekStart.toISOString(),
      // All-time charts
      topCoins:    topCoinsRaw.map(u => ({ userId: u.userId, coins: u.coins, userInfo: userMap[u.userId] })),
      topTotalXp:  topTotalXp .map(u => ({ userId: u.userId, xp: (u.xp ?? 0) + (u.voiceXp ?? 0), userInfo: userMap[u.userId] })),
      topChatXp:   topChatXp  .map(u => ({ userId: u.userId, xp: u.xp ?? 0,     userInfo: userMap[u.userId] })),
      topVoiceXp:  topVoiceXp .map(u => ({ userId: u.userId, xp: u.voiceXp ?? 0, userInfo: userMap[u.userId] })),
      // This-week charts
      weeklyCoins:   weeklyTxRaw    .map(u => ({ userId: u._id,      coins: u.earned,           userInfo: userMap[u._id] })),
      weeklyTotalXp: topWeeklyTotalXp.map(u => ({ userId: u.userId,   xp: u.deltaTotalXp,       userInfo: userMap[u.userId] })),
      weeklyChatXp:  topWeeklyChatXp .map(u => ({ userId: u.userId,   xp: u.deltaChatXp,        userInfo: userMap[u.userId] })),
      weeklyVoiceXp: topWeeklyVoiceXp.map(u => ({ userId: u.userId,   xp: u.deltaVoiceXp,       userInfo: userMap[u.userId] })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Trivia questions
app.get('/api/questions', requireAuth, (req, res) => {
  try { res.json(JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions', requireAuth, (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question?.trim() || !answer?.trim()) return res.status(400).json({ error: 'question and answer are required' });
    const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
    const newQ = { id: Math.max(0, ...questions.map(q => q.id)) + 1, question: question.trim(), answer: answer.trim() };
    questions.push(newQ);
    writeFileSync(QUESTIONS_PATH, JSON.stringify(questions, null, 2));
    res.json(newQ);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/questions/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
    const q = questions.find(q => q.id === id);
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (req.body.question?.trim()) q.question = req.body.question.trim();
    if (req.body.answer?.trim())   q.answer   = req.body.answer.trim();
    writeFileSync(QUESTIONS_PATH, JSON.stringify(questions, null, 2));
    res.json(q);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/questions/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
    const next = questions.filter(q => q.id !== id);
    if (next.length === questions.length) return res.status(404).json({ error: 'Question not found' });
    writeFileSync(QUESTIONS_PATH, JSON.stringify(next, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ───────────────────────────────────────────────────────────────
// Transactions — with resolved usernames (item 11)
app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const filter = { guildId: req.guildId };
    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
    if (req.query.userId && /^\d{17,20}$/.test(req.query.userId)) filter.userId = req.query.userId;
    const dateFilter = {};
    if (req.query.from) { const d = new Date(req.query.from); if (!isNaN(d)) dateFilter.$gte = d; }
    if (req.query.to)   { const d = new Date(req.query.to);   if (!isNaN(d)) { d.setHours(23,59,59,999); dateFilter.$lte = d; } }
    if (Object.keys(dateFilter).length) filter.date = dateFilter;
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const transactions = await Transaction.find(filter).sort({ date: -1 }).limit(limit);
    const uniqueIds = [...new Set(transactions.map(t => t.userId))];
    const resolved  = await Promise.all(uniqueIds.map(resolveUser));
    const userMap   = Object.fromEntries(uniqueIds.map((id, i) => [id, resolved[i]]));
    const result    = transactions.map(t => ({ ...t.toObject(), userInfo: userMap[t.userId] }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/transactions/export', requireAuth, async (req, res) => {
  try {
    const filter = { guildId: req.guildId };
    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
    if (req.query.userId && /^\d{17,20}$/.test(req.query.userId)) filter.userId = req.query.userId;
    const dateFilter = {};
    if (req.query.from) { const d = new Date(req.query.from); if (!isNaN(d)) dateFilter.$gte = d; }
    if (req.query.to)   { const d = new Date(req.query.to);   if (!isNaN(d)) { d.setHours(23,59,59,999); dateFilter.$lte = d; } }
    if (Object.keys(dateFilter).length) filter.date = dateFilter;
    const transactions = await Transaction.find(filter).sort({ date: -1 });
    const rows = ['Date,Type,User ID,Amount,Item,Note'];
    for (const t of transactions) {
      const safe = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      rows.push([safe(t.date.toISOString()), safe(t.type), safe(t.userId), safe(t.amount), safe(t.item ?? ''), safe(t.note ?? '')].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(rows.join('\n'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import roles from Discord role assignments
app.post('/api/import-roles', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const guild = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
    await guild.members.fetch();

    const [chatRoles, voiceRoles] = await Promise.all([
      getLevelRoles(req.guildId),
      getVoiceLevelRoles(req.guildId),
    ]);
    if (!chatRoles.length && !voiceRoles.length) {
      return res.status(400).json({ error: 'No level roles configured. Add XP roles first.' });
    }

    let chatUpdated = 0, voiceUpdated = 0, skipped = 0;
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const highestChat = chatRoles.filter(r => member.roles.cache.has(r.roleId)).reduce((m, r) => Math.max(m, r.level), 0);
      if (highestChat > 0) {
        const cur = await getLevelData(member.id, req.guildId);
        if (cur.level < highestChat) { await setMinXPIfHigher(member.id, req.guildId, 'xp', minXPForLevel(highestChat)); chatUpdated++; }
        else skipped++;
      }
      const highestVoice = voiceRoles.filter(r => member.roles.cache.has(r.roleId)).reduce((m, r) => Math.max(m, r.level), 0);
      if (highestVoice > 0) {
        const cur = await getVoiceLevelData(member.id, req.guildId);
        if (cur.level < highestVoice) { await setMinXPIfHigher(member.id, req.guildId, 'voiceXp', minXPForLevel(highestVoice)); voiceUpdated++; }
      }
    }
    res.json({ chatUpdated, voiceUpdated, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Roles ────────────────────────────────────────────────────────────────────

app.get('/api/roles', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const guild = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
    await guild.roles.fetch();
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id) // exclude @everyone
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
    res.json(roles);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Image upload ─────────────────────────────────────────────────────────────
// Accepts JSON { dataUrl: "data:<mime>;base64,<data>" }
// Saves the file and returns { url: "/uploads/<uuid>.<ext>" }
app.post('/api/upload', requireAuth, express.json({ limit: '5mb' }), (req, res) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'dataUrl required' });
    const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|gif|webp));base64,(.+)$/i);
    if (!match) return res.status(400).json({ error: 'Only PNG/JPEG/GIF/WEBP images are accepted' });
    const ext      = match[2].toLowerCase().replace('jpeg', 'jpg');
    const filename = `${randomUUID()}.${ext}`;
    const buf      = Buffer.from(match[3], 'base64');
    if (buf.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'Image must be under 4 MB' });
    writeFileSync(path.join(UPLOADS_DIR, filename), buf);
    res.json({ url: `/uploads/${filename}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List uploaded media files (newest first)
app.get('/api/uploads', requireAuth, (req, res) => {
  try {
    const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;
    const files = readdirSync(UPLOADS_DIR)
      .filter(f => IMAGE_RE.test(f))
      .map(f => {
        const full = path.join(UPLOADS_DIR, f);
        const { mtimeMs, size } = statSync(full);
        return { filename: f, url: `/uploads/${f}`, size, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete an uploaded media file
app.delete('/api/uploads/:filename', requireAuth, (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // prevent path traversal
    if (!filename || filename.includes('..')) return res.status(400).json({ error: 'Invalid filename' });
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Channels ─────────────────────────────────────────────────────────────────

app.get('/api/channels', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const guild = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
    await guild.channels.fetch();
    const channels = guild.channels.cache
      .filter(c => c.type === 0 /* GUILD_TEXT */ || c.type === 5 /* GUILD_ANNOUNCEMENT */)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name, parentName: c.parent?.name ?? null }));
    res.json(channels);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// All channels (text + voice) — used for the unified XP ignore list
app.get('/api/channels/all', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const guild = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
    await guild.channels.fetch();
    const TEXT_TYPES  = new Set([0, 5]);   // GUILD_TEXT, GUILD_ANNOUNCEMENT
    const VOICE_TYPES = new Set([2, 13]);  // GUILD_VOICE, GUILD_STAGE_VOICE
    const channels = guild.channels.cache
      .filter(c => TEXT_TYPES.has(c.type) || VOICE_TYPES.has(c.type))
      .sort((a, b) => a.position - b.position)
      .map(c => ({
        id:         c.id,
        name:       c.name,
        parentName: c.parent?.name ?? null,
        isVoice:    VOICE_TYPES.has(c.type),
      }));
    res.json(channels);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Webhook messages ─────────────────────────────────────────────────────────

function buildDiscordPayload(content, embeds, webhookUsername, webhookAvatar) {
  const payload = {};
  if (content?.trim()) payload.content = content.trim();
  if (webhookUsername?.trim()) payload.username = webhookUsername.trim();
  if (webhookAvatar?.trim())   payload.avatar_url = webhookAvatar.trim();
  if (embeds?.length) {
    payload.embeds = embeds.map(e => {
      const b = {};
      if (e.color !== undefined && e.color !== '') {
        b.color = typeof e.color === 'string' ? parseInt(e.color.replace('#', ''), 16) : e.color;
      }
      if (e.author?.name)    b.author    = { name: e.author.name, ...(e.author.url && { url: e.author.url }), ...(e.author.icon_url && { icon_url: e.author.icon_url }) };
      if (e.title)           b.title     = e.title;
      if (e.url)             b.url       = e.url;
      if (e.description)     b.description = e.description;
      if (e.thumbnail?.url)  b.thumbnail = { url: e.thumbnail.url };
      if (e.image?.url)      b.image     = { url: e.image.url };
      if (e.fields?.length)  b.fields    = e.fields.filter(f => f.name && f.value);
      if (e.footer?.text)    b.footer    = { text: e.footer.text, ...(e.footer.icon_url && { icon_url: e.footer.icon_url }) };
      if (e.timestamp)       b.timestamp = new Date().toISOString();
      return b;
    });
  }
  return payload;
}

function parseWebhookUrl(url) {
  const m = url.match(/webhooks\/(\d+)\/([^/?#]+)/);
  return m ? { id: m[1], token: m[2] } : null;
}

app.get('/api/webhooks', requireAuth, async (req, res) => {
  try { res.json(await WebhookMessage.find({ guildId: req.guildId }).sort({ updatedAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Fetch a guild's display name and icon as a base64 data URL (for webhook creation).
async function getGuildIdentity(guildId) {
  try {
    const guild = discordClient.guilds.cache.get(guildId) ?? await discordClient.guilds.fetch(guildId);
    if (!guild) return { name: null, iconUrl: null, iconDataUrl: null };
    const iconUrl = guild.iconURL({ size: 128, extension: 'png' });
    let iconDataUrl = null;
    if (iconUrl) {
      try {
        const resp = await axios.get(iconUrl, { responseType: 'arraybuffer' });
        iconDataUrl = `data:image/png;base64,${Buffer.from(resp.data).toString('base64')}`;
      } catch { /* non-fatal — webhook will just have no avatar */ }
    }
    return { name: guild.name, iconUrl, iconDataUrl };
  } catch {
    return { name: null, iconUrl: null, iconDataUrl: null };
  }
}

// Returns { url, webhookId } — creates a bot-owned webhook on the channel if none exists yet.
// Option B: new webhooks are created with the guild's name and icon as the default identity.
async function getOrCreateChannelWebhook(channelId, storedWebhookId, guildId) {
  const channel = discordClient.channels.cache.get(channelId) ?? await discordClient.channels.fetch(channelId);
  const hooks = await channel.fetchWebhooks();

  // Re-use previously created webhook if it still exists
  if (storedWebhookId) {
    const existing = hooks.get(storedWebhookId);
    if (existing) return { url: existing.url, webhookId: existing.id };
  }

  // Find any webhook owned by this bot on this channel
  const botOwned = hooks.find(h => h.owner?.id === discordClient.user.id);
  if (botOwned) return { url: botOwned.url, webhookId: botOwned.id };

  // Create a new webhook using the guild's name and icon as defaults
  const { name: guildName, iconDataUrl } = guildId ? await getGuildIdentity(guildId) : {};
  const created = await channel.createWebhook({
    name:   guildName || 'Arcturus Dashboard',
    avatar: iconDataUrl ?? undefined,
    reason: 'Created by Arcturus dashboard',
  });
  return { url: created.url, webhookId: created.id };
}

app.post('/api/webhooks', requireAuth, async (req, res) => {
  try {
    const { name, channelId, content, embeds, webhookUsername, webhookAvatar } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!channelId?.trim()) return res.status(400).json({ error: 'channelId is required' });
    const msg = await WebhookMessage.create({
      guildId: req.guildId,
      name: name.trim(),
      channelId: channelId.trim(),
      content: content || '',
      embeds: embeds || [],
      webhookUsername: webhookUsername || '',
      webhookAvatar: webhookAvatar || '',
    });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/webhooks/:id', requireAuth, async (req, res) => {
  try {
    const { name, channelId, content, embeds, webhookUsername, webhookAvatar } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!channelId?.trim()) return res.status(400).json({ error: 'channelId is required' });
    const msg = await WebhookMessage.findOneAndUpdate(
      { _id: req.params.id, guildId: req.guildId },
      { $set: { name: name.trim(), channelId: channelId.trim(), content: content || '', embeds: embeds || [], webhookUsername: webhookUsername || '', webhookAvatar: webhookAvatar || '', updatedAt: new Date() } },
      { new: true }
    );
    if (!msg) return res.status(404).json({ error: 'Not found' });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/webhooks/:id', requireAuth, async (req, res) => {
  try { await WebhookMessage.deleteOne({ _id: req.params.id, guildId: req.guildId }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// If the stored avatar is a locally-uploaded file, read it and PATCH the Discord webhook's
// own avatar so Discord doesn't need to reach localhost. For external URLs, pass through
// as avatar_url in the per-message payload.
async function applyWebhookAvatar(webhookUrl, storedAvatar, webhookUsername) {
  if (!storedAvatar?.trim()) return null;

  if (storedAvatar.startsWith('/uploads/')) {
    try {
      const filename = path.basename(storedAvatar);
      const imgPath  = path.join(UPLOADS_DIR, filename);
      const imgBuf   = readFileSync(imgPath);
      const ext      = path.extname(filename).slice(1).replace('jpg', 'jpeg');
      const dataUrl  = `data:image/${ext};base64,${imgBuf.toString('base64')}`;
      const wh = parseWebhookUrl(webhookUrl);
      if (wh) {
        const body = { avatar: dataUrl };
        if (webhookUsername?.trim()) body.name = webhookUsername.trim();
        await axios.patch(
          `${DISCORD_API}/webhooks/${wh.id}/${wh.token}`,
          body,
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      logger.warn('Dashboard', 'Webhook avatar PATCH failed', e.response?.data?.message ?? e);
    }
    return null; // avatar is now set on the webhook itself; no per-message avatar_url needed
  }

  return storedAvatar; // external URL — pass through as avatar_url in the message payload
}

// Scan embed image/thumbnail/icon fields for local /uploads/ files.
// Returns modified embeds (URLs swapped to attachment://filename) and file buffers to attach.
function collectLocalAttachments(embeds) {
  if (!embeds?.length) return { modifiedEmbeds: embeds || [], files: [] };
  const files = [];
  const seen  = new Set();

  function processUrl(url) {
    if (!url?.startsWith('/uploads/')) return url;
    const filename = path.basename(url);
    if (!filename) return url;
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!existsSync(filePath)) return url; // file missing — leave URL as-is
    if (!seen.has(filename)) {
      const buffer = readFileSync(filePath);
      const ext    = path.extname(filename).slice(1).toLowerCase().replace('jpg', 'jpeg');
      files.push({ name: filename, buffer, mime: `image/${ext}` });
      seen.add(filename);
    }
    return `attachment://${filename}`;
  }

  const modifiedEmbeds = embeds.map(e => {
    const m = { ...e };
    if (m.image?.url)       m.image     = { ...m.image,     url: processUrl(m.image.url) };
    if (m.thumbnail?.url)   m.thumbnail = { ...m.thumbnail, url: processUrl(m.thumbnail.url) };
    if (m.author?.icon_url) m.author    = { ...m.author,    icon_url: processUrl(m.author.icon_url) };
    if (m.footer?.icon_url) m.footer    = { ...m.footer,    icon_url: processUrl(m.footer.icon_url) };
    return m;
  });
  return { modifiedEmbeds, files };
}

// Send a Discord payload — multipart if local files are attached, plain JSON otherwise.
async function sendToWebhook(webhookUrl, payload, files) {
  if (!files.length) {
    return axios.post(`${webhookUrl}?wait=true`, payload, { headers: { 'Content-Type': 'application/json' } });
  }
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  for (let i = 0; i < files.length; i++) {
    const blob = new Blob([files[i].buffer], { type: files[i].mime });
    form.append(`files[${i}]`, blob, files[i].name);
  }
  return axios.post(`${webhookUrl}?wait=true`, form);
}

app.post('/api/webhooks/:id/send', requireAuth, async (req, res) => {
  try {
    const stored = await WebhookMessage.findOne({ _id: req.params.id, guildId: req.guildId });
    if (!stored) return res.status(404).json({ error: 'Not found' });
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });

    const { url, webhookId } = await getOrCreateChannelWebhook(stored.channelId, stored.webhookId, req.guildId);
    stored.webhookId = webhookId;

    // Option A: fall back to guild identity when no custom identity is set
    let effectiveUsername = stored.webhookUsername;
    let effectiveAvatar   = stored.webhookAvatar;
    if (!effectiveUsername && !effectiveAvatar) {
      const { name, iconUrl } = await getGuildIdentity(req.guildId);
      effectiveUsername = name   || '';
      effectiveAvatar   = iconUrl || '';
    }

    const avatarForPayload = await applyWebhookAvatar(url, effectiveAvatar, effectiveUsername);
    const { modifiedEmbeds, files } = collectLocalAttachments(stored.embeds);
    const payload  = buildDiscordPayload(stored.content, modifiedEmbeds, effectiveUsername, avatarForPayload);
    const response = await sendToWebhook(url, payload, files);
    stored.messageId = response.data.id;
    stored.updatedAt = new Date();
    await stored.save();
    res.json({ ok: true, messageId: stored.messageId });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message ?? e.message }); }
});

app.post('/api/webhooks/:id/update', requireAuth, async (req, res) => {
  try {
    const stored = await WebhookMessage.findOne({ _id: req.params.id, guildId: req.guildId });
    if (!stored)           return res.status(404).json({ error: 'Not found' });
    if (!stored.messageId) return res.status(400).json({ error: 'No message ID — send the message first' });
    if (!discordClient)    return res.status(503).json({ error: 'Bot not ready' });

    const { url, webhookId } = await getOrCreateChannelWebhook(stored.channelId, stored.webhookId, req.guildId);
    stored.webhookId = webhookId;

    const wh = parseWebhookUrl(url);
    if (!wh) return res.status(400).json({ error: 'Could not resolve webhook URL' });

    // Option A: fall back to guild identity when no custom identity is set
    let effectiveUsername = stored.webhookUsername;
    let effectiveAvatar   = stored.webhookAvatar;
    if (!effectiveUsername && !effectiveAvatar) {
      const { name, iconUrl } = await getGuildIdentity(req.guildId);
      effectiveUsername = name   || '';
      effectiveAvatar   = iconUrl || '';
    }

    const avatarForPayload = await applyWebhookAvatar(url, effectiveAvatar, effectiveUsername);
    const { modifiedEmbeds, files } = collectLocalAttachments(stored.embeds);
    const payload = buildDiscordPayload(stored.content, modifiedEmbeds, effectiveUsername, avatarForPayload);
    if (files.length) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      for (let i = 0; i < files.length; i++) {
        const blob = new Blob([files[i].buffer], { type: files[i].mime });
        form.append(`files[${i}]`, blob, files[i].name);
      }
      await axios.patch(`${DISCORD_API}/webhooks/${wh.id}/${wh.token}/messages/${stored.messageId}`, form);
    } else {
      await axios.patch(`${DISCORD_API}/webhooks/${wh.id}/${wh.token}/messages/${stored.messageId}`, payload, { headers: { 'Content-Type': 'application/json' } });
    }
    stored.updatedAt = new Date();
    await stored.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.response?.data?.message ?? e.message }); }
});

// ── Trivia auto-engine API ──────────────────────────────────────────────────
app.get('/api/trivia/auto/status', requireAuth, (req, res) => {
  res.json({ active: autoSessions.has(req.guildId) });
});

app.post('/api/trivia/auto/start', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const guild    = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
    const settings = await TriviaSettings.findOne({ guildId: req.guildId });
    if (!settings?.autoChannelId) return res.status(400).json({ error: 'No auto-trivia channel configured' });
    const result = await startAutoTrivia(guild, settings);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trivia/auto/stop', requireAuth, (req, res) => {
  const stopped = stopAutoTrivia(req.guildId);
  res.json({ ok: stopped });
});

// ── Giveaways API ────────────────────────────────────────────────────────────
app.get('/api/giveaways', requireAuth, async (req, res) => {
  try {
    const all    = await getAllGiveaways(req.guildId);
    // Enrich with entrant count and time remaining
    const result = all.map(g => ({
      ...g.toObject(),
      entryCount:   g.entries?.length ?? 0,
      msRemaining:  g.status === 'active' ? Math.max(0, new Date(g.endTime) - Date.now()) : 0,
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/giveaways/:id/end', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const giveaway = await Giveaway.findOne({ _id: req.params.id, guildId: req.guildId });
    if (!giveaway) return res.status(404).json({ error: 'Not found' });
    if (giveaway.status === 'ended') return res.status(400).json({ error: 'Already ended' });
    await cancelGiveawayTimer(req.params.id);
    await finishGiveaway(giveaway, discordClient, true);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/giveaways/:id/reroll', requireAuth, async (req, res) => {
  try {
    if (!discordClient) return res.status(503).json({ error: 'Bot not ready' });
    const giveaway = await Giveaway.findOne({ _id: req.params.id, guildId: req.guildId });
    if (!giveaway) return res.status(404).json({ error: 'Not found' });
    if (giveaway.status !== 'ended') return res.status(400).json({ error: 'Giveaway not ended yet' });
    const eligible = (giveaway.entries ?? []).filter(uid => uid !== giveaway.winnerUserId);
    if (!eligible.length) return res.status(400).json({ error: 'No eligible entries' });
    const newWinner = eligible[Math.floor(Math.random() * eligible.length)];
    await Giveaway.findByIdAndUpdate(req.params.id, { winnerUserId: newWinner });
    // Announce in the original channel
    const guild   = discordClient.guilds.cache.get(req.guildId) ?? await discordClient.guilds.fetch(req.guildId);
    const channel = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel) {
      const { EmbedBuilder } = await import('discord.js');
      await channel.send({
        content: `🎊 <@${newWinner}>`,
        embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('🎉 Giveaway Rerolled!').setDescription(`New winner for **${giveaway.prize}**: <@${newWinner}>!`)],
      }).catch(() => {});
    }
    res.json({ ok: true, winner: newWinner });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── XP boosts and ignore channels ───────────────────────────────────────────
app.patch('/api/settings/xp-boosts', requireAuth, async (req, res) => {
  try {
    const { xpRoleBoosts } = req.body;
    if (!Array.isArray(xpRoleBoosts)) return res.status(400).json({ error: 'xpRoleBoosts must be an array' });
    const cleaned = xpRoleBoosts.map(b => ({ roleId: String(b.roleId), multiplier: Number(b.multiplier) })).filter(b => b.roleId && b.multiplier > 0);
    const result = await updateSettings(req.guildId, { xpRoleBoosts: cleaned });
    invalidateConfig(req.guildId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/settings/xp-ignore', requireAuth, async (req, res) => {
  try {
    const { xpIgnoreChannels } = req.body;
    if (!Array.isArray(xpIgnoreChannels)) return res.status(400).json({ error: 'xpIgnoreChannels must be an array' });
    const result = await updateSettings(req.guildId, { xpIgnoreChannels });
    invalidateConfig(req.guildId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Logs endpoint — streams in-memory ring buffer to the dashboard
app.get('/api/logs', requireAuth, (req, res) => {
  res.json(getLogBuffer());
});

let discordClient = null;

export async function startDashboard(client) {
  discordClient = client;
  await fetchBotInfo();
  const PORT = process.env.DASHBOARD_PORT || 3001;
  app.listen(PORT, () => logger.info('Dashboard', `Listening on http://localhost:${PORT}`));
}

