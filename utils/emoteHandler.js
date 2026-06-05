import { getEmoteGif } from './apiFetch.js';
import { updateEmoteStats } from '../data/database.js';
import { checkAndAwardCoins } from './economyLimits.js';
import { errorEmbed as createErrorEmbed } from './embedCreate.js';

const pastTenseMap = {
  blush: { self: "blushed", target: "blushed at" },
  bite: { self: "bit themselves", target: "bit" },
  boop: { self: "booped themselves", target: "booped" },
  clap: { self: "clapped", target: "clapped for" },
  cry: { self: "cried", target: "cried with" },
  cuddle: { self: "cuddled themselves", target: "cuddled" },
  confused: { self: "is confused", target: "is confused with" },
  dance: { self: "danced", target: "danced with" },
  die: { self: "died", target: "died" },
  disappear: { self: "disappeared", target: "disappeared" },
  facepalm: { self: "facepalmed", target: "facepalmed at" },
  fight: { self: "fought themselves", target: "fought" },
  happy: { self: "is happy", target: "made happy" },
  highfive: { self: "high-fived themselves", target: "high-fived" },
  hug: { self: "hugged themselves", target: "hugged" },
  kill: { self: "killed themselves", target: "killed" },
  kiss: { self: "kissed themselves", target: "kissed" },
  laugh: { self: "laughed", target: "laughed at" },
  mad: { self: "is mad", target: "is mad at" },
  pat: { self: "patted themselves", target: "patted" },
  poke: { self: "poked themselves", target: "poked" },
  punch: { self: "punched themselves", target: "punched" },
  run: { self: "is running", target: "is running with" },
  scared: { self: "is scared", target: "scared" },
  shoot: { self: "shot themselves", target: "shot" },
  shrug: { self: "shrugged", target: "shrugged at" },
  sip: { self: "sipped", target: "shared a sip with" },
  slap: { self: "slapped themselves", target: "slapped" },
  smile: { self: "smiled", target: "smiled at" },
  tickle: { self: "tickled themselves", target: "tickled" },
  wave: { self: "waved", target: "waved at" },
  wink: { self: "winked", target: "winked at" }
};

const pluralizationMap = {
  blush: "blushes", bite: "bites", boop: "boops", clap: "claps", confused: "confused moments", cry: "cries",
  cuddle: "cuddles", dance: "dances", die: "deaths", disappear: "disappearances", facepalm: "facepalms",
  fight: "fights", happy: "happy moments", highfive: "high-fives", hug: "hugs", kill: "kills", kiss: "kisses",
  laugh: "laughs", mad: "angry moments", pat: "pats", poke: "pokes", punch: "punches", run: "runs",
  scared: "scared moments", shoot: "shots", shrug: "shrugs", sip: "sips", slap: "slaps", smile: "smiles",
  tickle: "tickles", wave: "waves", wink: "winks"
};

function pluralize(emote, count) {
  return count === 1 ? emote : pluralizationMap[emote] || `${emote}s`;
}

export async function handleEmote(message, emote) {
  const author = message.author;
  let target =
    message.mentions.users.first() ||
    (message.reference &&
      await message.channel.messages
        .fetch(message.reference.messageId)
        .then(m => m.author)
        .catch(() => null)) ||
    null;

  if (target?.id === author.id) target = null;

  const gif = await getEmoteGif(emote);
  if (!gif) {
    return message.reply({
      embeds: [createErrorEmbed(`Failed to fetch a ${emote} GIF. Please try again later.`)]
    });
  }

  const stats = await updateEmoteStats(author.id, target?.id, emote);
  const { awarded: emoteAwarded } = message.guild
    ? await checkAndAwardCoins(author.id, message.guild.id, 'emote', 1)
    : { awarded: 0 };

  const verb =
    target && target.id !== author.id
      ? pastTenseMap[emote]?.target || `${emote}ed`
      : pastTenseMap[emote]?.self || `${emote}ed`;

  const description = target
    ? `<@${author.id}> ${verb} <@${target.id}>!`
    : `<@${author.id}> ${verb}!`;

  const footerText = `${author.username}'s total ${pluralize(emote, stats.total)}: ${stats.total}` +
    (target ? ` | ${author.username} has ${verb} ${target.username} ${stats.targetTotal} time(s)` : '');

  const embed = {
    description,
    color: 0xBA68C8,
    image: { url: gif },
    footer: { text: footerText },
    fields: [{
      name: '\u200B',
      value: emoteAwarded > 0 ? '🪙 +1 coin awarded!' : '🪙 Daily coin limit reached.',
      inline: false
    }]
  };

  return message.channel.send({ embeds: [embed] });
}
