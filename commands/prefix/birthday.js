import { EmbedBuilder } from 'discord.js';

export default {
  name: 'birthday',
  description: 'Birthday command info.',

  async execute(message) {
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🎂 Birthday commands')
          .addFields(
            { name: '/birthday set', value: 'Register your birthday privately.' },
            { name: '/birthday remove', value: 'Remove your birthday.' },
            { name: '/birthday claim', value: 'Claim your birthday coins (only on your birthday, once per year).' }
          )
      ]
    });
  }
};
