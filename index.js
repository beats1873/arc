import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, EmbedBuilder, Partials } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import config from './config.js';
import { startDashboard } from './dashboard/server.js';
import { getSettings } from './data/database.js';
import logger from './utils/logger.js';

// ── Global safety net ─────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('Process', 'Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (err) => {
  logger.error('Process', 'Uncaught exception — shutting down', err);
  process.exit(1);
});
process.on('SIGTERM', () => {
  logger.info('Process', 'SIGTERM received — shutting down gracefully');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('Process', 'SIGINT received — shutting down gracefully');
  process.exit(0);
});

// ── Settings cache ────────────────────────────────────────────────────────────
let _cachedSettings = null;
let _settingsCachedAt = 0;
async function getCachedSettings() {
  if (Date.now() - _settingsCachedAt < 30_000) return _cachedSettings;
  _cachedSettings = await getSettings(config.guildId);
  _settingsCachedAt = Date.now();
  return _cachedSettings;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Discord client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

// Propagate discord.js internal warnings/errors to our logger
client.on('warn', (msg) => logger.warn('Discord', msg));
client.on('error', (err) => logger.error('Discord', 'Client error', err));
client.on('shardError', (err) => logger.error('Discord', 'Shard error', err));

client.commands = new Collection();

// ── Slash command handler ─────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn('Commands', `Unknown slash command received: /${interaction.commandName}`);
    return;
  }

  logger.debug('Commands', `/${interaction.commandName} invoked by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}`);

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error('Commands', `Error executing /${interaction.commandName} for ${interaction.user.tag}`, err);
    try {
      const payload = {
        embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('There was an error executing that command.').setColor('Red')],
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply(payload);
    } catch (replyErr) {
      logger.error('Commands', 'Failed to send error reply to interaction', replyErr);
    }
  }
});

// ── Load slash commands ───────────────────────────────────────────────────────
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands/slash')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  try {
    const mod = await import(`./commands/slash/${file}`);
    const command = mod.default;
    client.commands.set(command.data.name, command);
    logger.debug('Loader', `Loaded slash command: ${command.data.name}`);
  } catch (err) {
    logger.error('Loader', `Failed to load slash command file: ${file}`, err);
  }
}
logger.info('Loader', `Loaded ${client.commands.size} slash command(s)`);

// ── Load prefix / emote commands ─────────────────────────────────────────────
client.prefixCommands = new Collection();
client.emoteCommands  = new Collection();

const prefixFiles = fs.readdirSync(path.join(__dirname, 'commands/prefix')).filter(f => f.endsWith('.js'));
for (const file of prefixFiles) {
  try {
    const mod = await import(`./commands/prefix/${file}`);
    const exported = mod.default;
    if (Array.isArray(exported)) {
      for (const cmd of exported) {
        client.emoteCommands.set(cmd.name, cmd);
        logger.debug('Loader', `Loaded emote command: ${cmd.name}`);
      }
    } else {
      client.prefixCommands.set(exported.name, exported);
      logger.debug('Loader', `Loaded prefix command: ${exported.name}`);
    }
  } catch (err) {
    logger.error('Loader', `Failed to load prefix command file: ${file}`, err);
  }
}
logger.info('Loader', `Loaded ${client.prefixCommands.size} prefix command(s) and ${client.emoteCommands.size} emote command(s)`);

// ── Load event handlers ───────────────────────────────────────────────────────
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'));
let eventCount = 0;
for (const file of eventFiles) {
  try {
    const event = await import(`./events/${file}`);
    for (const key of Object.keys(event)) {
      const e = event[key];
      if (!e?.name || !e?.execute) continue;
      if (e.once) {
        client.once(e.name, (...args) => e.execute(...args));
      } else {
        client.on(e.name, (...args) => e.execute(...args));
      }
      logger.debug('Loader', `Registered event: ${e.name} (once=${!!e.once}) from ${file}`);
      eventCount++;
    }
  } catch (err) {
    logger.error('Loader', `Failed to load event file: ${file}`, err);
  }
}
logger.info('Loader', `Registered ${eventCount} event handler(s)`);

// ── Prefix message handler ────────────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  logger.debug('Commands', `MSG received: "${message.content?.slice(0, 40)}" from ${message.author.tag} guild=${message.guild?.id}`);

  const settings = await getCachedSettings().catch(err => {
    logger.error('Settings', 'Failed to load cached settings for messageCreate', err);
    return null;
  });
  if (!settings) return;

  const PREFIX       = settings.commandPrefix || '+';
  const EMOTE_PREFIX = settings.prefix        || '=';

  let prefix;
  if (message.content.startsWith(PREFIX)) prefix = PREFIX;
  else if (message.content.startsWith(EMOTE_PREFIX)) prefix = EMOTE_PREFIX;
  else return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // When both prefixes are the same, check prefix commands first then emotes.
  // When they differ, route by which prefix matched.
  let command;
  if (PREFIX === EMOTE_PREFIX) {
    command = client.prefixCommands.get(commandName) ?? client.emoteCommands.get(commandName);
  } else if (prefix === EMOTE_PREFIX) {
    command = client.emoteCommands.get(commandName);
  } else {
    command = client.prefixCommands.get(commandName);
  }
  if (!command) return;

  logger.debug('Commands', `Prefix command "${prefix}${commandName}" by ${message.author.tag} (${message.author.id}) in guild ${message.guild?.id}`);

  try {
    await command.execute(message, args);
  } catch (err) {
    logger.error('Commands', `Error executing prefix command "${commandName}" for ${message.author.tag}`, err);
    message.channel.send({
      embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('There was an error executing that command.').setColor('Red')]
    }).catch(() => {});
  }
});

// ── Ready hook ────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  logger.info('Bot', `Logged in as ${client.user.tag} (${client.user.id})`);
  logger.info('Bot', `Active in ${client.guilds.cache.size} server(s)`);

  try {
    const { scheduleAllActiveGiveaways } = await import('./utils/giveawayManager.js');
    await scheduleAllActiveGiveaways(client);
  } catch (err) {
    logger.error('Giveaways', 'Failed to restore active giveaways on startup', err);
  }

  try {
    const { startAutoTriviaForAllGuilds } = await import('./utils/triviaAutoEngine.js');
    await startAutoTriviaForAllGuilds(client);
  } catch (err) {
    logger.error('AutoTrivia', 'Failed to start automated trivia on startup', err);
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
logger.info('Bot', 'Connecting to Discord...');
client.login(config.token).catch(err => {
  logger.error('Bot', 'Failed to log in to Discord — check DISCORD_TOKEN', err);
  process.exit(1);
});

startDashboard(client);
