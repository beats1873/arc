import { EmbedBuilder } from 'discord.js';
import { checkAndAwardCoins } from '../../utils/economyLimits.js';
import { getGuildConfig } from '../../utils/botConfig.js';
import logger from '../../utils/logger.js';

const FALLBACK_WORDS = [
  // Nature
  { word: 'forest', category: 'Nature' },
  { word: 'glacier', category: 'Nature' },
  { word: 'volcano', category: 'Nature' },
  { word: 'cactus', category: 'Nature' },
  { word: 'island', category: 'Nature' },
  { word: 'nectar', category: 'Nature' },
  { word: 'marble', category: 'Nature' },
  { word: 'gravel', category: 'Nature' },
  // Animals
  { word: 'dragon', category: 'Animals' },
  { word: 'rabbit', category: 'Animals' },
  { word: 'parrot', category: 'Animals' },
  { word: 'walrus', category: 'Animals' },
  { word: 'goblin', category: 'Animals' },
  { word: 'sphinx', category: 'Animals' },
  { word: 'oyster', category: 'Animals' },
  { word: 'dolphin', category: 'Animals' },
  { word: 'penguin', category: 'Animals' },
  { word: 'octopus', category: 'Animals' },
  // Places
  { word: 'castle', category: 'Places' },
  { word: 'bridge', category: 'Places' },
  { word: 'garden', category: 'Places' },
  { word: 'jungle', category: 'Places' },
  { word: 'school', category: 'Places' },
  { word: 'tunnel', category: 'Places' },
  { word: 'mansion', category: 'Places' },
  { word: 'kitchen', category: 'Places' },
  // Objects
  { word: 'shadow', category: 'Objects' },
  { word: 'planet', category: 'Objects' },
  { word: 'bottle', category: 'Objects' },
  { word: 'candle', category: 'Objects' },
  { word: 'mirror', category: 'Objects' },
  { word: 'rocket', category: 'Objects' },
  { word: 'basket', category: 'Objects' },
  { word: 'lantern', category: 'Objects' },
  { word: 'puzzle', category: 'Objects' },
  { word: 'fabric', category: 'Objects' },
  { word: 'anchor', category: 'Objects' },
  { word: 'riddle', category: 'Objects' },
  { word: 'throne', category: 'Objects' },
  { word: 'velvet', category: 'Objects' },
  { word: 'balloon', category: 'Objects' },
  { word: 'diamond', category: 'Objects' },
  { word: 'feather', category: 'Objects' },
  { word: 'blanket', category: 'Objects' },
  // Descriptive / Other
  { word: 'frozen', category: 'Adjectives' },
  { word: 'purple', category: 'Adjectives' },
  { word: 'silver', category: 'Adjectives' },
  { word: 'golden', category: 'Adjectives' },
  { word: 'quantum', category: 'Science' },
  { word: 'network', category: 'Technology' },
  { word: 'cluster', category: 'Technology' },
  // Seasonal / Themes
  { word: 'winter', category: 'Seasons' },
  { word: 'summer', category: 'Seasons' },
  { word: 'harvest', category: 'Seasons' },
  // Food
  { word: 'cheese', category: 'Food' },
  // People / Roles
  { word: 'pirate', category: 'People' },
  { word: 'captain', category: 'People' },
  { word: 'emperor', category: 'People' },
  { word: 'warrior', category: 'People' },
  { word: 'fiction', category: 'Literature' },
];

const STAGES = [
  '  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n========='
];

const games = new Map();

const WORD_CATEGORIES = [
  'Animals', 'Nature', 'Places', 'Objects', 'Food', 'Science',
  'Technology', 'Sports', 'Movies', 'Music', 'History', 'Geography',
];

async function fetchRandomWord() {
  const category = WORD_CATEGORIES[Math.floor(Math.random() * WORD_CATEGORIES.length)];
  try {
    const res = await fetch('https://random-word-api.vercel.app/api?words=1');
    const data = await res.json();
    const word = data[0]?.toLowerCase();
    if (word && /^[a-z]+$/.test(word)) return { word, category };
  } catch {
    // fall through to fallback
  }
  const fallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
  return fallback;
}

function buildEmbed(word, guessedLetters, lives, status = 'playing') {
  const wrong = guessedLetters.filter(l => !word.includes(l));
  const wrongCount = wrong.length;
  const display = word.split('').map(l => (guessedLetters.includes(l) ? l : '_')).join(' ');
  const color = status === 'won' ? 0x57F287 : status === 'lost' ? 0xED4245 : 0x5865F2;

  const title = status === 'won' ? '🎉 You got it!'
    : status === 'lost' ? '💀 Game Over'
    : '🎭 Hangman';

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: '​', value: `\`\`\`${STAGES[wrongCount]}\`\`\``, inline: false },
      { name: 'Word', value: `\`${display}\``, inline: true },
      { name: 'Lives', value: `❤️`.repeat(lives) + `🖤`.repeat(6 - lives), inline: true },
      { name: 'Wrong guesses', value: wrong.length ? wrong.join(', ') : 'None', inline: true }
    )
    .setFooter({
      text: status === 'playing'
        ? 'Type a letter to guess, or the whole word!'
        : status === 'lost'
        ? `The word was: ${word}`
        : '​'
    });
}

export const hangmanGames = games;

export default {
  name: 'hangman',
  description: 'Start a game of Hangman!',
  async execute(message) {
    const cfg = await getGuildConfig(message.guild.id);

    if (!cfg.hangmanEnabled) return;

    if (cfg.hangmanChannelId && message.channel.id !== cfg.hangmanChannelId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Wrong channel')
            .setDescription(`Hangman can only be played in <#${cfg.hangmanChannelId}>.`)
        ]
      });
    }

    if (games.has(message.channel.id)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Game already active')
            .setDescription('A Hangman game is already running in this channel.')
        ]
      });
    }

    const { word, category } = await fetchRandomWord();
    const guessedLetters = [];
    let lives = 6;

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🎭 Hangman — New Game!')
          .setDescription(`A new word has been chosen!\n\n**Category:** \`${category}\`\n\nType a letter or the whole word to guess!`)
      ]
    });

    const sent = await message.channel.send({ embeds: [buildEmbed(word, guessedLetters, lives)] });
    games.set(message.channel.id, true);

    const collector = message.channel.createMessageCollector({
      filter: m => !m.author.bot && /^[a-zA-Z]+$/.test(m.content.trim()),
      time: 5 * 60 * 1000
    });

    collector.on('collect', async msg => {
      const guess = msg.content.trim().toLowerCase();
      await msg.delete().catch(() => {});

      // Full word guess
      if (guess.length > 1) {
        if (guess === word) {
          word.split('').forEach(l => { if (!guessedLetters.includes(l)) guessedLetters.push(l); });
          collector.stop('won');
          await sent.edit({ embeds: [buildEmbed(word, guessedLetters, lives, 'won')] });
          const { awarded: fwAwarded, cappedBy: fwCapped } = await checkAndAwardCoins(
            msg.author.id, message.guild.id, 'hangman', lives,
            { item: word, note: 'Full word guess' }
          );
          const fwCoinText = fwAwarded === 0
            ? '🪙 Daily coin limit reached.'
            : fwAwarded < lives
              ? `🪙 +${fwAwarded} coins (daily limit reached)`
              : `🪙 +${fwAwarded} coins`;
          await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57F287)
                .setDescription(`🎉 <@${msg.author.id}> guessed the word **${word}**! ${fwCoinText}`)
            ]
          });
        } else {
          lives--;
          if (lives <= 0) {
            collector.stop('lost');
            await sent.edit({ embeds: [buildEmbed(word, guessedLetters, lives, 'lost')] });
          } else {
            const wrong = guessedLetters.filter(l => !word.includes(l));
            await sent.edit({ embeds: [buildEmbed(word, guessedLetters, lives)] });
            await message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xED4245)
                  .setDescription(`❌ **${guess}** is not the word. -1 life`)
              ]
            }).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
          }
        }
        return;
      }

      // Single letter guess
      if (guessedLetters.includes(guess)) return;
      guessedLetters.push(guess);

      if (!word.includes(guess)) lives--;

      const won = word.split('').every(l => guessedLetters.includes(l));
      const lost = lives <= 0;

      if (won) {
        collector.stop('won');
        await sent.edit({ embeds: [buildEmbed(word, guessedLetters, lives, 'won')] });
        const { awarded: lgAwarded, cappedBy: lgCapped } = await checkAndAwardCoins(
          msg.author.id, message.guild.id, 'hangman', lives,
          { item: word, note: 'Letter guesses' }
        );
        const lgCoinText = lgAwarded === 0
          ? '🪙 Daily coin limit reached.'
          : lgAwarded < lives
            ? `🪙 +${lgAwarded} coins (daily limit reached)`
            : `🪙 +${lgAwarded} coins`;
        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setDescription(`🎉 <@${msg.author.id}> guessed the word **${word}**! ${lgCoinText}`)
          ]
        });
      } else if (lost) {
        collector.stop('lost');
        await sent.edit({ embeds: [buildEmbed(word, guessedLetters, lives, 'lost')] });
      } else {
        await sent.edit({ embeds: [buildEmbed(word, guessedLetters, lives)] });
      }
    });

    collector.on('end', (_, reason) => {
      games.delete(message.channel.id);
      if (reason === 'time') {
        sent.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('⏰ Game timed out')
              .setDescription(`The word was **${word}**.`)
          ]
        }).catch(() => {});
      }
    });
  }
};
