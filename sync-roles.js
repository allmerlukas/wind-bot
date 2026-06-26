require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const setupStore = require('./src/utils/setupStore');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  const supportGuildId = process.env.GUILD_ID;
  const supportGuild = await client.guilds.fetch(supportGuildId).catch(() => null);
  
  if (!supportGuild) {
    console.error('Support guild not found!');
    process.exit(1);
  }

  await supportGuild.members.fetch();

  const allCfgs = await setupStore.getAll();
  
  // We consider a server "using it" if they have at least basic setup
  const configuredGuildIds = allCfgs.filter(cfg => cfg.partnerChannelId && cfg.adChannelId).map(c => c.guild_id);
  
  const userRoleId = '1520083899655520335';
  const paidAdRoleId = '1467132255485952031';
  
  let assignedCount = 0;

  for (const guildId of configuredGuildIds) {
    let ownerId;
    try {
      const guild = await client.guilds.fetch(guildId);
      ownerId = guild.ownerId;
    } catch (e) {
      continue;
    }
    
    if (!ownerId) continue;

    const cfg = allCfgs.find(c => c.guild_id === guildId);
    const allowPaidAds = cfg && cfg.allowPaidAds;

    try {
      const member = await supportGuild.members.fetch(ownerId).catch(() => null);
      if (member) {
        const rolesToAdd = [userRoleId];
        if (allowPaidAds) rolesToAdd.push(paidAdRoleId);
        
        await member.roles.add(rolesToAdd);
        console.log(`Assigned roles to user ${ownerId} (allowPaidAds: ${allowPaidAds})`);
        assignedCount++;
      }
    } catch (e) {
      console.error(`Failed to assign roles to ${ownerId}:`, e.message);
    }
  }

  console.log(`Finished syncing roles for ${assignedCount} users.`);
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
