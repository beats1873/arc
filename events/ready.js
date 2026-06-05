import { startBirthdayCron } from '../utils/birthdayCron.js';
import { startVoiceCrons } from '../utils/voiceXpCron.js';
import logger from '../utils/logger.js';

export default {
  name: 'clientReady',
  once: true,
  execute(client) {
    logger.info('Ready', `Logged in as ${client.user.tag} (${client.user.id})`);
    logger.info('Ready', `Serving ${client.guilds.cache.size} guild(s):`);
    for (const guild of client.guilds.cache.values()) {
      logger.info('Ready', `  • ${guild.name} (${guild.id}) — ${guild.memberCount} members`);
    }

    try {
      startBirthdayCron(client);
      logger.info('Ready', 'Birthday cron started');
    } catch (err) {
      logger.error('Ready', 'Failed to start birthday cron', err);
    }

    try {
      startVoiceCrons(client);
      logger.info('Ready', 'Voice XP cron started');
    } catch (err) {
      logger.error('Ready', 'Failed to start voice XP cron', err);
    }
  },
};
