/**
 * deploy-owner.js
 *
 * Deploys owner-only commands to YOUR guild only (GUILD_ID in .env).
 * These commands:
 *   - Appear ONLY in your server, not anywhere else
 *   - Are still guarded by an OWNER_ID check inside each command
 *   - Update instantly (no 1-hour propagation delay like global commands)
 *
 * Run: node deploy-owner.js
 * Re-run any time you add or change an owner command.
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Owner commands to deploy (guild-only) ────────────────────────────────────
const OWNER_COMMANDS = [
  'owner.js',
  'force.js',
  // Add more owner commands here as you create them
];

if (!process.env.GUILD_ID) {
  console.error('❌ GUILD_ID is not set in your .env file.');
  process.exit(1);
}
if (!process.env.OWNER_ID) {
  console.warn('⚠️  OWNER_ID is not set in .env — commands will deploy but won\'t be locked to you.');
}

const commands     = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

for (const file of OWNER_COMMANDS) {
  const filePath = path.join(commandsPath, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Owner command file not found: ${file}`);
    continue;
  }
  const command = require(filePath);
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`🔒 Preparing owner command: /${command.data.name}`);
  }
}

const token = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`\n🏠 Deploying ${commands.length} owner command(s) to guild ${process.env.GUILD_ID}...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Successfully deployed ${data.length} owner command(s)!`);
    console.log(`⚡ Guild commands are instant — no propagation delay.`);
    console.log(`🔒 Commands are only visible in guild: ${process.env.GUILD_ID}\n`);
  } catch (error) {
    console.error('❌ Owner deploy failed:', error);
  }
})();
