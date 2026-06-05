import { EmbedBuilder } from 'discord.js';

export function successEmbed(title, description) {
  return new EmbedBuilder().setTitle(`✅ ${title}`).setDescription(description).setColor('Green');
}

export function errorEmbed(description) {
  return new EmbedBuilder().setTitle('❌ Error').setDescription(description).setColor('Red');
}

export function warnEmbed(description) {
  return new EmbedBuilder().setTitle('⚠️ Warning').setDescription(description).setColor('Orange');
}
