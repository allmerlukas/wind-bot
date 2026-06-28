const setupStore = require('./setupStore');

/**
 * Adds a strike to a guild, logs it if a log channel is configured, and returns formatted strings for UI.
 * 
 * @param {Client} client - The Discord.js client
 * @param {string} targetGuildId - The ID of the guild getting a strike
 * @param {string} reason - The reason for the strike
 * @returns {Promise<{ newStrikes: number, strikeBar: string, warn: string, name: string }>}
 */
async function addStrike(client, targetGuildId, reason) {
  const guild = client.guilds.cache.get(targetGuildId);
  const name = guild?.name ?? targetGuildId;
  const cfg = await setupStore.get(targetGuildId);
  const newStrikes = (cfg.strikes ?? 0) + 1;
  
  await setupStore.set(targetGuildId, 'strikes', newStrikes);

  if (cfg.logChannelId && guild) {
    const logChannel = guild.channels.cache.get(cfg.logChannelId);
    if (logChannel?.isTextBased()) {
      try { 
        await logChannel.send(
          `⚠️ **STRIKE ${newStrikes}/3:** A strike was manually added to your server by the Wind Bot team.\n> **Reason:** ${reason}\n\n` + 
          (newStrikes >= 3 ? `🚫 Your server has reached 3 strikes and may be permanently blacklisted.` : `If you reach 3 strikes, your server will be permanently blacklisted.`)
        ); 
      } catch (err) {
        // Ignore permission errors when trying to log to their server
      }
    }
  }

  const strikeBar = ['□','□','□'].map((_, i) => i < newStrikes ? '🟥' : '□').join(' ');
  const warn = newStrikes >= 3 ? '\n⚠️ **3 strikes reached** — consider blacklisting this server.' : '';

  return { newStrikes, strikeBar, warn, name };
}

module.exports = {
  addStrike
};
