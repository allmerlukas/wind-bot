/**
 * guildDelete event
 * Fired when the bot is kicked from / leaves a server.
 *
 * Resets that server's strikes to 0 so they aren't punished for
 * deleting the bot's messages during removal (which fires messageDelete
 * events and would otherwise issue unfair strikes).
 */

const setupStore = require('../utils/setupStore');

module.exports = {
  name: 'guildDelete',
  async execute(guild) {
    try {
      await setupStore.set(guild.id, 'strikes', 0);
      console.log(`[GuildDelete] Reset strikes for ${guild.name} (${guild.id}) on bot removal.`);
    } catch (err) {
      console.error(`[GuildDelete] Failed to reset strikes for ${guild.id}:`, err);
    }
  },
};
