import { handleEmote } from '../../utils/emoteHandler.js';

const emotes = [
  'blush', 'bite', 'boop', 'clap', 'confused', 'cry', 'cuddle', 'dance',
  'die', 'disappear', 'facepalm', 'fight', 'happy', 'highfive', 'hug',
  'kill', 'kiss', 'laugh', 'mad', 'pat', 'poke', 'punch', 'run', 'scared',
  'shoot', 'shrug', 'sip', 'slap', 'smile', 'tickle', 'wave', 'wink'
];

export default emotes.map(emote => ({
  name: emote,
  description: `Use the "${emote}" emote.`,
  async execute(message) {
    await handleEmote(message, emote);
  }
}));
