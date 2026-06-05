import { EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { TriviaSettings } from '../data/database.js';
import { checkAndAwardCoins } from './economyLimits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = path.join(__dirname, '../data/questions.json');

function readQuestions() {
  return JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1;
  return dp[m][n];
}

function isCloseEnough(guess, answer) {
  if (guess === answer) return true;
  if (answer.length <= 4) return false;
  const maxDist = answer.length >= 8 ? 2 : 1;
  return levenshtein(guess, answer) <= maxDist;
}

// guildId → { timeout, collector }
export const autoSessions = new Map();
const autoUsedIndices = new Map();

function pickAutoQuestion(guildId) {
  const questions = readQuestions();
  if (!autoUsedIndices.has(guildId)) autoUsedIndices.set(guildId, new Set());
  const used = autoUsedIndices.get(guildId);
  if (used.size >= questions.length) used.clear();
  let idx;
  do { idx = Math.floor(Math.random() * questions.length); } while (used.has(idx));
  used.add(idx);
  return questions[idx];
}

async function askAutoQuestion(guildId, channel, intervalMs, coinReward, questionsPerSession) {
  if (!autoSessions.has(guildId)) return;
  const session = autoSessions.get(guildId);

  if (questionsPerSession > 0 && session.questionsAsked >= questionsPerSession) {
    autoSessions.delete(guildId);
    autoUsedIndices.delete(guildId);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🤖 Auto Trivia Complete')
          .setDescription(`Session ended after **${questionsPerSession}** question${questionsPerSession !== 1 ? 's' : ''}.`)
      ]
    });
    return;
  }

  const question = pickAutoQuestion(guildId);
  session.questionsAsked++;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 Auto Trivia!')
        .setDescription(question.question)
        .setFooter({ text: 'You have 30 seconds to answer.' })
    ]
  });

  const collector = channel.createMessageCollector({ filter: m => !m.author.bot, time: 30_000 });
  if (session) session.collector = collector;

  collector.on('collect', async msg => {
    const guess = msg.content.trim().toLowerCase();
    if (!isCloseEnough(guess, question.answer.trim().toLowerCase())) return;
    collector.stop('answered');
    const { awarded: autoAwarded } = await checkAndAwardCoins(
      msg.author.id, channel.guild.id, 'trivia', coinReward,
      { note: `[Auto] Q: ${question.question.slice(0, 60)}` }
    );
    const autoCoinText = autoAwarded === 0
      ? '🪙 Daily coin limit reached.'
      : autoAwarded < coinReward
        ? `🪙 +${autoAwarded} coins awarded (daily limit reached)`
        : `🪙 +${autoAwarded} coins awarded.`;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Correct!')
          .setDescription(`**${msg.author.username}** got it!\nAnswer: **${question.answer}**\n${autoCoinText}`)
      ]
    });
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'answered') {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("⏰ Time's up!")
            .setDescription(`The correct answer was: **${question.answer}**`)
        ]
      });
    }
    if (!autoSessions.has(guildId)) return;
    const sess = autoSessions.get(guildId);
    if (sess) {
      sess.collector = null;
      sess.timeout = setTimeout(() => askAutoQuestion(guildId, channel, intervalMs, coinReward, questionsPerSession), intervalMs);
    }
  });
}

export async function startAutoTrivia(guild, settings) {
  const guildId = guild.id;
  if (autoSessions.has(guildId)) return { ok: false, reason: 'already_running' };
  if (!settings.autoChannelId) return { ok: false, reason: 'no_channel' };

  const channel = guild.channels.cache.get(settings.autoChannelId)
    ?? await guild.channels.fetch(settings.autoChannelId).catch(() => null);
  if (!channel) return { ok: false, reason: 'channel_not_found' };

  const intervalMs         = (settings.autoInterval ?? 60) * 60 * 1000;
  const coinReward         = settings.autoCoinReward ?? 5;
  const questionsPerSession = settings.autoQuestionsPerSession ?? 0;

  autoSessions.set(guildId, { timeout: null, collector: null, questionsAsked: 0 });
  await askAutoQuestion(guildId, channel, intervalMs, coinReward, questionsPerSession);
  return { ok: true };
}

export function stopAutoTrivia(guildId) {
  if (!autoSessions.has(guildId)) return false;
  const session = autoSessions.get(guildId);
  if (session.timeout) clearTimeout(session.timeout);
  if (session.collector) session.collector.stop('stopped');
  autoSessions.delete(guildId);
  autoUsedIndices.delete(guildId);
  return true;
}

export async function startAutoTriviaForAllGuilds(client) {
  const GUILD_ID = process.env.GUILD_ID;
  if (!GUILD_ID) return;
  const settings = await TriviaSettings.findOne({ guildId: GUILD_ID });
  if (!settings?.autoEnabled) return;
  const guild = client.guilds.cache.get(GUILD_ID) ?? await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;
  await startAutoTrivia(guild, settings);
}
