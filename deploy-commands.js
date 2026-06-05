import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { REST, Routes } from 'discord.js';
import config from './config.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!config.guildId) {
  logger.error('Deploy', 'GUILD_ID is not set in your .env file. Aborting.');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands/slash');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = await import(`./commands/slash/${file}`);
  if ('data' in command.default && 'execute' in command.default) {
    commands.push(command.default.data.toJSON());
    logger.debug('Deploy', `Loaded command: ${command.default.data.name}`);
  } else {
    logger.warn('Deploy', `Command at ${file} is missing "data" or "execute".`);
  }
}

const rest = new REST({ version: '10' }).setToken(config.token);

try {
  logger.info('Deploy', `Registering ${commands.length} guild command(s) to guild ${config.guildId}...`);
  const data = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
  );
  logger.info('Deploy', `Successfully registered ${data.length} guild command(s).`);
} catch (error) {
  logger.error('Deploy', 'Failed to register commands', error);
}
