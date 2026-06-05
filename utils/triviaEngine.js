import { EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { checkAndAwardCoins } from './economyLimits.js';
import logger from './logger.js';

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

// guildId → { timeout, collector, questionsAsked }
export const activeSessions = new Map();
const usedIndices = new Map();

function pickQuestion(guildId) {
  const questions = readQuestions();
  if (!usedIndices.has(guildId)) usedIndices.set(guildId, new Set());
  const used = usedIndices.get(guildId);
  if (used.size >= questions.length) {
    logger.debug('Trivia', `All ${questions.length} questions used for guild ${guildId} — resetting pool`);
    used.clear();
  }
  let idx;
  do { idx = Math.floor(Math.random() * questions.length); } while (used.has(idx));
  used.add(idx);
  return questions[idx];
}

async function askQuestion(guildId, channel, intervalMs, questionsPerSession, coinReward = 5) {
  if (!activeSessions.has(guildId)) return;
  const session = activeSessions.get(guildId);

  if (questionsPerSession > 0 && session.questionsAsked >= questionsPerSession) {
    logger.info('Trivia', `Session complete for guild ${guildId} — asked ${questionsPerSession} question(s)`);
    activeSessions.delete(guildId);
    usedIndices.delete(guildId);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🎉 Trivia Session Complete!')
          .setDescription(`Session ended after **${questionsPerSession}** question${questionsPerSession !== 1 ? 's' : ''}.`)
      ]
    });
    return;
  }

  const question = pickQuestion(guildId);
  session.questionsAsked++;
  logger.debug('Trivia', `Asking Q${session.questionsAsked} in guild ${guildId}: "${question.question.slice(0, 60)}"`);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('❓ Trivia Time!')
        .setDescription(question.question)
        .setFooter({ text: 'You have 30 seconds to answer.' })
    ]
  }).catch(err => logger.error('Trivia', `Failed to post question in guild ${guildId}`, err));

  const collector = channel.createMessageCollector({ filter: m => !m.author.bot, time: 30_000 });
  session.collector = collector;

  collector.on('collect', async msg => {
    const guess = msg.content.trim().toLowerCase();
    if (!isCloseEnough(guess, question.answer.trim().toLowerCase())) return;
    collector.stop('answered');

    logger.info('Trivia', `Correct answer by ${msg.author.tag} (${msg.author.id}) in guild ${guildId}: "${guess}" for answer "${question.answer}"`);

    let triviaAwarded = 0;
    try {
      ({ awarded: triviaAwarded } = await checkAndAwardCoins(
        msg.author.id, channel.guild.id, 'trivia', coinReward,
        { note: `Q: ${question.question.slice(0, 60)}` }
      ));
    } catch (err) {
      logger.error('Trivia', `Failed to award coins to ${msg.author.id}`, err);
    }

    const triviaCoinText = triviaAwarded === 0
      ? '🪙 Daily coin limit reached.'
      : triviaAwarded < coinReward
        ? `🪙 +${triviaAwarded} coins awarded (daily limit reached)`
        : `🪙 +${triviaAwarded} coins awarded.`;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Correct!')
          .setDescription(`**${msg.author.username}** got it!\nAnswer: **${question.answer}**\n${triviaCoinText}`)
      ]
    }).catch(err => logger.error('Trivia', 'Failed to send correct answer embed', err));
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'answered') {
      logger.debug('Trivia', `No correct answer for question in guild ${guildId} — reason: ${reason}`);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("⏰ Time's up!")
            .setDescription(`The correct answer was: **${question.answer}**`)
        ]
      }).catch(err => logger.error('Trivia', 'Failed to send timeout embed', err));
    }
    if (!activeSessions.has(guildId)) return;
    const sess = activeSessions.get(guildId);
    sess.collector = null;
    sess.timeout = setTimeout(() => askQuestion(guildId, channel, intervalMs, questionsPerSession, coinReward), intervalMs);
  });
}

export async function startTriviaSession(guild, settings) {
  const guildId = guild.id;
  if (activeSessions.has(guildId)) {
    logger.warn('Trivia', `Session already running in guild ${guildId}`);
    return { ok: false, reason: 'already_running' };
  }

  const channel = guild.channels.cache.get(settings.channelId);
  if (!channel) {
    logger.warn('Trivia', `Channel ${settings.channelId} not found in guild ${guildId}`);
    return { ok: false, reason: 'channel_not_found' };
  }

  const intervalMs = (settings.interval ?? 60) * 60 * 1000;
  const questionsPerSession = settings.questionsPerSession ?? 0;
  const coinReward = settings.triviaWinCoins ?? 5;

  logger.info('Trivia', `Starting session in guild ${guildId} — channel ${settings.channelId}, interval ${settings.interval}min, limit ${questionsPerSession || 'unlimited'}, reward ${coinReward} coins`);

  activeSessions.set(guildId, { timeout: null, collector: null, questionsAsked: 0 });
  await askQuestion(guildId, channel, intervalMs, questionsPerSession, coinReward);
  return { ok: true };
}

export function stopTriviaSession(guildId) {
  if (!activeSessions.has(guildId)) {
    logger.warn('Trivia', `Stop requested but no active session in guild ${guildId}`);
    return false;
  }
  const session = activeSessions.get(guildId);
  if (session.timeout) clearTimeout(session.timeout);
  if (session.collector) session.collector.stop('stopped');
  activeSessions.delete(guildId);
  usedIndices.delete(guildId);
  logger.info('Trivia', `Session stopped for guild ${guildId}`);
  return true;
}
